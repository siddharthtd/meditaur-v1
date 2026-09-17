import { describe, expect, it } from "vitest";
import { stampedPreferences } from "@meditaur/application";
import { systemClock } from "@meditaur/domain";
import {
  createSupabaseAuthPort,
  createSupabaseClient,
  createSupabasePreferencesPort,
} from "../../packages/db/src/supabase.ts";
import { makePrefs } from "../fixtures/library.ts";
import { resolveSupabaseTarget } from "../fixtures/supabase-target.ts";

// Explicit target selection, same as the auth and RLS suites:
// tests/fixtures/supabase-target.ts. `./scripts/meditaur test:integration:hosted`
// is the target that matters here — this is the only suite that writes a
// preference through the cloud, so it is the only one that can prove the
// compare-and-swap holds between two real clients.
const target = resolveSupabaseTarget(process.env);
const supabaseUrl = target?.url ?? "";
const anonKey = target?.anonKey ?? "";
const serviceKey = target?.serviceKey ?? "";
const live = Boolean(target);

const PASSWORD = "Test-pass-1!";

async function createUser(email: string): Promise<string> {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  const text = await response.text();
  expect(response.status, text).toBeLessThan(300);
  const id = (JSON.parse(text) as { id?: string }).id;
  if (!id) throw new Error(`Supabase did not return a user id: ${text}`);
  return id;
}

async function deleteUser(id: string): Promise<void> {
  await fetch(`${supabaseUrl}/auth/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
}

/** One device: its own client, its own session, the same account. */
async function device(email: string) {
  const client = createSupabaseClient({ url: supabaseUrl, anonKey });
  const auth = createSupabaseAuthPort({ client: client.auth, clock: systemClock });
  await auth.signIn(email, PASSWORD);
  return createSupabasePreferencesPort({ client: client.data });
}

describe(`supabase preferences port (${target?.name ?? "no target configured"})`, () => {
  it.skipIf(!live)(
    "lets one of two clients write, and refuses the one that read first",
    async () => {
      const email = `prefs-${crypto.randomUUID()}@example.test`;
      let userId: string | null = null;
      try {
        userId = await createUser(email);
        const first = await device(email);
        const second = await device(email);

        // Neither device has a row yet, so the first save is what creates it.
        // A uuid, because `last_plan_id` is a `uuid` column: real plan ids are
        // (`createId`, and the seeded `DEFAULT_PLAN_ID`), while the fixture's
        // readable `plan1` is not one and the database refuses it.
        const opening = stampedPreferences(
          makePrefs({ userId, revision: 0, lastPlanId: crypto.randomUUID() }),
          1,
        );
        expect(await first.save(opening)).toMatchObject({ userId, revision: 1 });

        // Both devices read the same revision…
        const readFirst = await first.get(userId);
        const readSecond = await second.get(userId);
        expect(readFirst?.revision).toBe(1);
        expect(readSecond?.revision).toBe(1);

        // …then both write it. The first lands; the second is refused, and what
        // is stored is the winner's row — not a blend, and not the loser's.
        expect(
          await first.save(
            stampedPreferences({ ...readFirst!, textSize: "xl" }, 2),
          ),
        ).toMatchObject({ revision: 2 });
        expect(
          await second.save(
            stampedPreferences({ ...readSecond!, masterVolume: 0.2 }, 3),
          ),
        ).toBeNull();

        const stored = await first.get(userId);
        expect(stored).toMatchObject({ revision: 2, textSize: "xl", masterVolume: 0.7 });
      } finally {
        if (userId) await deleteUser(userId);
      }
    },
    60_000,
  );

  it.skipIf(!live)(
    "keeps one reader's preferences out of another reader's reach",
    async () => {
      const firstEmail = `prefs-a-${crypto.randomUUID()}@example.test`;
      const secondEmail = `prefs-b-${crypto.randomUUID()}@example.test`;
      let firstId: string | null = null;
      let secondId: string | null = null;
      try {
        firstId = await createUser(firstEmail);
        secondId = await createUser(secondEmail);
        const first = await device(firstEmail);
        const second = await device(secondEmail);

        const mine = stampedPreferences(
          makePrefs({ userId: firstId, revision: 0, lastPlanId: crypto.randomUUID() }),
          1,
        );
        expect(await first.save(mine)).toMatchObject({ revision: 1 });

        // `prefs_self` is what decides this in the database: the second reader
        // sees nothing, and writing as the first is refused rather than quietly
        // creating a row they do not own.
        expect(await second.get(firstId)).toBeNull();
        await expect(
          second.save(stampedPreferences({ ...mine, textSize: "md" }, 2)),
        ).rejects.toThrow();
        expect(await first.get(firstId)).toMatchObject({ revision: 1, textSize: "lg" });
      } finally {
        if (firstId) await deleteUser(firstId);
        if (secondId) await deleteUser(secondId);
      }
    },
    60_000,
  );
});
