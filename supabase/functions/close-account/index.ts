/**
 * Close the reader's own account.
 *
 * This is the one thing the browser cannot do: removing the `auth.users` row needs
 * the service-role key, and that key never reaches the app bundle. Everything else
 * here is the caller's own act, done with the caller's own token, so row level
 * security is still what decides:
 *
 *   1. the platform has already verified the JWT — `verify_jwt` defaults to true
 *      and the deploy does not pass `--no-verify-jwt` — and this function sends the
 *      caller's own `Authorization` header on, rather than trusting a claim it
 *      decodes itself
 *   2. read the caller from the Auth API, so the user id comes from the provider
 *   3. run `delete_my_data()` **as the caller**: the workspaces where they are the
 *      sole member (which takes the catalogue, plans, media and logs by cascade),
 *      their preference row, then any membership left over in a shared workspace
 *   4. delete the `auth.users` row with the service role, which cascades the rest
 *
 * **No imports, on purpose.** `@supabase/supabase-js` is allowed in exactly one
 * module in this repo (`packages/db/src/supabase.ts`), and an Edge Function is a
 * second runtime rather than a second importer — `tests/unit/architecture/
 * integrity.test.ts` would fail on a second one. Three `fetch` calls are the whole
 * of it.
 *
 * Environment, injected into every function by Supabase: `SUPABASE_URL`,
 * `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Optional: `ALLOWED_ORIGINS`, a
 * comma-separated list — unset means any origin may call it, which is the closed
 * beta's default; set it to the deployed origin to tighten the endpoint.
 */

const json = (
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const allow =
    allowed.length === 0 ? "*" : origin && allowed.includes(origin) ? origin : "";
  if (!allow) return {};
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

Deno.serve(async (request: Request): Promise<Response> => {
  const headers = corsHeaders(request.headers.get("Origin"));

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, headers);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!url || !anonKey || !serviceKey) return json({ error: "not_configured" }, 500, headers);
  if (!authorization) return json({ error: "unauthorized" }, 401, headers);

  const asCaller = { apikey: anonKey, Authorization: authorization };

  const who = await fetch(`${url}/auth/v1/user`, { headers: asCaller });
  if (!who.ok) return json({ error: "unauthorized" }, 401, headers);
  const caller = (await who.json()) as { id?: string };
  if (!caller.id) return json({ error: "unauthorized" }, 401, headers);

  const purge = await fetch(`${url}/rest/v1/rpc/delete_my_data`, {
    method: "POST",
    headers: { ...asCaller, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!purge.ok) {
    return json({ error: "purge_failed", detail: await purge.text() }, 502, headers);
  }
  const removed = Number(await purge.json()) || 0;

  // A 404 means the row is already gone, which is the state the reader asked for.
  const closed = await fetch(`${url}/auth/v1/admin/users/${caller.id}`, {
    method: "DELETE",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!closed.ok && closed.status !== 404) {
    return json({ error: "close_failed", detail: await closed.text() }, 502, headers);
  }

  return json({ closed: true, removed }, 200, headers);
});
