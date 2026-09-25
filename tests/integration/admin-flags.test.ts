import { describe, expect, it } from "vitest";
import { resolveSupabaseTarget } from "../fixtures/supabase-target.ts";

/**
 * The admin's door, end to end, against a real project.
 *
 * `P0 · 23` slice 23e. This is the only test that can cover the `admin` function: it
 * holds the service-role key, and the browser never does. It is live for the same reason
 * the RLS suite is — what is proved is a Postgres policy, an Edge Function and the Auth
 * admin API together, and a fake would prove none of them.
 *
 * It needs the function deployed: `./scripts/meditaur cloud --yes` pushes the migrations
 * and deploys it, and `check:full` runs this suite against the hosted project. A hosted
 * run with no function deployed fails here rather than skipping, which is the repo's rule
 * for a target that was asked for by name.
 *
 * The **local** stack is the one target that skips: `./scripts/meditaur up` serves
 * Postgres and Auth and no `functions serve`, so `functions/v1/…` is not reachable there
 * at all. What is hosted-only is the wrapper that holds the service-role key; the table's
 * own policies are covered locally by `rls.test.ts`.
 *
 * The marker is set here the way the owner sets it — with the service key, from outside
 * the app — because that is the documented bootstrap step and nothing in the product may
 * write it (`docs/ARCHITECTURE.md` records the statement). That no account can write its
 * own row is asserted below rather than assumed: it is the asymmetry the whole design
 * rests on.
 *
 * `is_admin` is not settable through the function either, so the test's admin is made
 * before it is used rather than promoted by the action it is about to exercise.
 */
const target = resolveSupabaseTarget(process.env);
const supabaseUrl = target?.url ?? "";
const anonKey = target?.anonKey ?? "";
const serviceKey = target?.serviceKey ?? "";
/** A target whose platform runs Edge Functions. Hosted does; the local stack does not. */
const callable = target?.name === "hosted";

const PASSWORD = "Test-pass-1!";
const NEW_PASSWORD = "Test-pass-2!";

type AccountRow = {
  userId: string;
  email: string;
  isAdmin: boolean;
  flags: Record<string, boolean>;
};

async function request(
  path: string,
  init: { method?: string; key: string; token?: string; body?: unknown },
): Promise<{ status: number; text: string }> {
  const headers: Record<string, string> = {
    apikey: init.key,
    Authorization: `Bearer ${init.token ?? init.key}`,
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${supabaseUrl}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return { status: response.status, text: await response.text() };
}

async function createUser(email: string): Promise<string> {
  const created = await request("/auth/v1/admin/users", {
    method: "POST",
    key: serviceKey,
    body: { email, password: PASSWORD, email_confirm: true },
  });
  expect(created.status, created.text).toBeLessThan(300);
  const id = (JSON.parse(created.text) as { id?: string }).id;
  if (!id) throw new Error(`Supabase did not return a user id: ${created.text}`);
  return id;
}

async function signIn(email: string, password = PASSWORD): Promise<string> {
  const signedIn = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    key: anonKey,
    body: { email, password },
  });
  expect(signedIn.status, signedIn.text).toBeLessThan(300);
  const token = (JSON.parse(signedIn.text) as { access_token?: string }).access_token;
  if (!token) throw new Error(`Supabase did not return a session: ${signedIn.text}`);
  return token;
}

async function deleteUser(id: string): Promise<void> {
  await request(`/auth/v1/admin/users/${id}`, { method: "DELETE", key: serviceKey });
}

/** The owner's own bootstrap step, in its REST form: the marker with the service key. */
async function makeAdmin(userId: string): Promise<void> {
  const written = await request("/rest/v1/account_flags", {
    method: "POST",
    key: serviceKey,
    body: { user_id: userId, is_admin: true },
  });
  expect(written.status, written.text).toBeLessThan(300);
}

/** The panel's one read, through the function. */
async function listAccounts(token: string): Promise<{ status: number; accounts: AccountRow[] }> {
  const listed = await request("/functions/v1/admin", {
    method: "POST",
    key: anonKey,
    token,
    body: { action: "list" },
  });
  const parsed = listed.text ? (JSON.parse(listed.text) as { accounts?: AccountRow[] }) : {};
  return { status: listed.status, accounts: parsed.accounts ?? [] };
}

describe(`the admin function (${target?.name ?? "no target configured"})`, () => {
  it.skipIf(!callable)("refuses an account that is not an admin, and a caller with no session", async () => {
    const email = `plain-${crypto.randomUUID()}@example.test`;
    let userId: string | null = null;
    try {
      userId = await createUser(email);
      const token = await signIn(email);

      const refused = await request("/functions/v1/admin", {
        method: "POST",
        key: anonKey,
        token,
        body: { action: "list" },
      });
      expect(refused.status, refused.text).toBe(403);
      expect(JSON.parse(refused.text)).toEqual({ error: "not_admin" });
    } finally {
      if (userId) await deleteUser(userId);
    }

    // The platform refuses this before the function is reached, which is why the
    // function can treat a missing `Authorization` header as "not signed in".
    const anonymous = await request("/functions/v1/admin", {
      method: "POST",
      key: anonKey,
      body: { action: "list" },
    });
    expect(anonymous.status).toBe(401);
  });

  it.skipIf(!callable)(
    "reads and sets one account's flags, and no account can set its own",
    async () => {
      const adminEmail = `admin-${crypto.randomUUID()}@example.test`;
      const subjectEmail = `subject-${crypto.randomUUID()}@example.test`;
      const created: string[] = [];
      try {
        const adminId = await createUser(adminEmail);
        created.push(adminId);
        await makeAdmin(adminId);
        const subjectId = await createUser(subjectEmail);
        created.push(subjectId);
        const token = await signIn(adminEmail);

        // An account the owner has never touched draws as everything on, which is what
        // makes "no row" a state the panel does not have to explain.
        const before = await listAccounts(token);
        expect(before.status, JSON.stringify(before)).toBe(200);
        const subject = before.accounts.find((row) => row.userId === subjectId);
        expect(subject, "the subject is in the list").toBeTruthy();
        expect(subject?.isAdmin).toBe(false);
        expect(subject?.flags.chakras, "an untouched account has everything on").toBe(true);

        // A sparse write: only what changed, because an absent key is the default.
        const written = await request("/functions/v1/admin", {
          method: "POST",
          key: anonKey,
          token,
          body: { action: "set-flags", userId: subjectId, flags: { chakras: false } },
        });
        expect(written.status, written.text).toBe(200);
        const stored = (JSON.parse(written.text) as { account?: AccountRow }).account;
        expect(stored?.flags.chakras).toBe(false);
        expect(
          stored?.flags.binaural,
          "a flag the write did not mention keeps its default",
        ).toBe(true);

        // The reader reads their own row — the app gates a surface off it — and the
        // policy is self-select, so this is the half that makes the app work.
        const subjectToken = await signIn(subjectEmail);
        const own = await request("/rest/v1/account_flags?select=flags", {
          key: anonKey,
          token: subjectToken,
        });
        expect(own.status, own.text).toBeLessThan(300);
        const ownRow = (JSON.parse(own.text) as { flags: Record<string, boolean> }[])[0];
        expect(ownRow?.flags.chakras).toBe(false);

        // ... and cannot write it, however they ask. Asserted by reading the value back
        // rather than by the status: an update that matches no row is a quiet success.
        await request(`/rest/v1/account_flags?user_id=eq.${subjectId}`, {
          method: "PATCH",
          key: anonKey,
          token: subjectToken,
          body: { flags: { chakras: true } },
        });
        const after = await listAccounts(token);
        expect(
          after.accounts.find((row) => row.userId === subjectId)?.flags.chakras,
          "an account cannot edit its own flags",
        ).toBe(false);

        // Strict on the way in, unlike the read path: a typo is a refusal rather than a
        // payload that clears everything it did not mention.
        for (const flags of [{ bogus: true }, { chakras: "off" }, "everything"]) {
          const refused = await request("/functions/v1/admin", {
            method: "POST",
            key: anonKey,
            token,
            body: { action: "set-flags", userId: subjectId, flags },
          });
          expect(refused.status, refused.text).toBe(400);
        }
      } finally {
        for (const id of created) await deleteUser(id);
      }
    },
  );

  it.skipIf(!callable)("creates an account and sets a password, with no mail involved", async () => {
    const adminEmail = `admin-${crypto.randomUUID()}@example.test`;
    const accountEmail = `made-${crypto.randomUUID()}@example.test`;
    const created: string[] = [];
    try {
      const adminId = await createUser(adminEmail);
      created.push(adminId);
      await makeAdmin(adminId);
      const token = await signIn(adminEmail);

      // The two refusals the panel surfaces instead of a platform error.
      for (const body of [
        { action: "create-account", email: "not-an-address", password: PASSWORD },
        { action: "create-account", email: accountEmail, password: "short" },
      ]) {
        const refused = await request("/functions/v1/admin", {
          method: "POST",
          key: anonKey,
          token,
          body,
        });
        expect(refused.status, refused.text).toBe(400);
      }

      const made = await request("/functions/v1/admin", {
        method: "POST",
        key: anonKey,
        token,
        body: { action: "create-account", email: accountEmail, password: PASSWORD },
      });
      expect(made.status, made.text).toBe(200);
      const madeId = (JSON.parse(made.text) as { account?: { userId?: string } }).account?.userId;
      if (!madeId) throw new Error(`the function did not answer with a user id: ${made.text}`);
      created.push(madeId);

      // No mailer anywhere in it: `email_confirm: true` is what the action sends, so the
      // account signs in on the password the owner chose.
      await signIn(accountEmail);

      // The hand-run reset — the owner sets a password and hands it over.
      const reset = await request("/functions/v1/admin", {
        method: "POST",
        key: anonKey,
        token,
        body: { action: "set-password", userId: madeId, password: NEW_PASSWORD },
      });
      expect(reset.status, reset.text).toBe(200);
      const stale = await request("/auth/v1/token?grant_type=password", {
        method: "POST",
        key: anonKey,
        body: { email: accountEmail, password: PASSWORD },
      });
      expect(stale.status, "the password it replaced no longer signs in").toBeGreaterThanOrEqual(
        400,
      );
      await signIn(accountEmail, NEW_PASSWORD);
    } finally {
      for (const id of created) await deleteUser(id);
    }
  });
});
