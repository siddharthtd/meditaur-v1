import { describe, expect, it } from "vitest";
import { resolveSupabaseTarget } from "../fixtures/supabase-target.ts";

/**
 * Closing an account, end to end, against a real project.
 *
 * This is the only test that can cover the server half: the `close-account`
 * function holds the service-role key, and the browser never does. It is a live
 * test for the same reason the RLS suite is — the thing being proved is a
 * Postgres grant plus an Edge Function plus the Auth admin API, and a fake would
 * prove none of them.
 *
 * It needs the function deployed: `./scripts/meditaur cloud --yes` pushes the
 * migrations and deploys it, and `check:full` runs this suite against the hosted
 * project. A hosted run with no function deployed fails here rather than skipping,
 * which is the repo's rule for a target that was asked for by name.
 *
 * The **local** stack is the one target that skips: `./scripts/meditaur up`
 * serves Postgres and Auth, and no `functions serve`, so `functions/v1/…` is not
 * reachable there at all. The data half of this is still covered locally —
 * `rls.test.ts` calls `delete_my_data()` against the stack — so what is
 * hosted-only is the wrapper that holds the service-role key, which is the honest
 * split and not a gap.
 */
const target = resolveSupabaseTarget(process.env);
const supabaseUrl = target?.url ?? "";
const anonKey = target?.anonKey ?? "";
const serviceKey = target?.serviceKey ?? "";
/** A target whose platform runs Edge Functions. Hosted does; the local stack does not. */
const callable = target?.name === "hosted";

const PASSWORD = "Test-pass-1!";

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

async function signIn(email: string): Promise<string> {
  const signedIn = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    key: anonKey,
    body: { email, password: PASSWORD },
  });
  expect(signedIn.status, signedIn.text).toBeLessThan(300);
  const token = (JSON.parse(signedIn.text) as { access_token?: string }).access_token;
  if (!token) throw new Error(`Supabase did not return a session: ${signedIn.text}`);
  return token;
}

async function deleteUser(id: string): Promise<void> {
  await request(`/auth/v1/admin/users/${id}`, { method: "DELETE", key: serviceKey });
}

describe(`closing an account (${target?.name ?? "no target configured"})`, () => {
  it.skipIf(!callable)(
    "removes the account, the workspace it owned and the session, and cannot be replayed",
    async () => {
      const email = `close-${crypto.randomUUID()}@example.test`;
      let userId: string | null = null;
      try {
        userId = await createUser(email);
        const token = await signIn(email);

        // A workspace of the reader's own, so the purge has something to remove
        // and the function's report says how much went. Without it the call would
        // still be a fair test of the row's removal, but the `delete_my_data()`
        // half would have nothing to prove.
        const workspaceId = crypto.randomUUID();
        const onboarded = await request("/rest/v1/rpc/create_workspace", {
          method: "POST",
          key: anonKey,
          token,
          body: { ws_id: workspaceId, ws_name: "Closing", ws_type: "personal" },
        });
        expect(onboarded.status, onboarded.text).toBeLessThan(300);

        const closed = await request("/functions/v1/close-account", {
          method: "POST",
          key: anonKey,
          token,
          body: {},
        });
        expect(closed.status, closed.text).toBe(200);
        const report = JSON.parse(closed.text) as { closed?: boolean; removed?: number };
        expect(report.closed).toBe(true);
        expect(report.removed, "the reader's own workspace went with them").toBe(1);

        // The row itself, read with the service key: gone, not merely signed out.
        const readBack = await request(`/auth/v1/admin/users/${userId}`, { key: serviceKey });
        expect(readBack.status, readBack.text).toBe(404);
        userId = null;

        // And the session it left behind cannot run it a second time: the platform
        // rejects a token whose user no longer exists before the function starts.
        const replay = await request("/functions/v1/close-account", {
          method: "POST",
          key: anonKey,
          token,
          body: {},
        });
        expect(replay.status).toBe(401);
      } finally {
        if (userId) await deleteUser(userId);
      }
    },
  );

  it.skipIf(!callable)("refuses without a session", async () => {
    const anonymous = await request("/functions/v1/close-account", {
      method: "POST",
      key: anonKey,
      body: {},
    });
    expect(anonymous.status).toBe(401);
  });
});
