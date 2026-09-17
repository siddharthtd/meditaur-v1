import { describe, expect, it } from "vitest";
import { systemClock } from "@meditaur/domain";
import {
  createSupabaseClient,
  createSupabaseAuthPort,
} from "../../packages/db/src/supabase.ts";
import { resolveSupabaseTarget } from "../fixtures/supabase-target.ts";

// Explicit target selection, same as the RLS suite: tests/fixtures/supabase-target.ts.
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

describe(`supabase auth port (${target?.name ?? "no target configured"})`, () => {
  it.skipIf(!live)("signs in against the running stack, then signs out", async () => {
    const email = `auth-${crypto.randomUUID()}@example.test`;
    let userId: string | null = null;
    try {
      userId = await createUser(email);
      const port = createSupabaseAuthPort({
        client: createSupabaseClient({ url: supabaseUrl, anonKey }).auth,
        clock: systemClock,
      });

      expect(await port.getSession()).toBeNull();

      const session = await port.signIn(email, PASSWORD);
      expect(session.userId).toBe(userId);
      expect(session.expiresAt ?? 0).toBeGreaterThan(Date.now());
      expect((await port.getSession())?.userId).toBe(userId);

      const changes: Array<string | null> = [];
      port.onSessionChange((next) => changes.push(next?.userId ?? null));

      await expect(port.signIn(email, "not-the-password")).rejects.toMatchObject({
        code: "auth.signInFailed",
      });

      await port.signOut();
      expect(await port.getSession()).toBeNull();
      expect(changes).toEqual([null]);
    } finally {
      if (userId) await deleteUser(userId);
    }
  });
});
