/**
 * The admin's door: the accounts, and the flags that gate them.
 *
 * `P0 · 23` slice 23e. The owner's answers are `DECISIONS.md` §11, and the rule the
 * gates themselves follow — a flag is asked at the offer, never at the store read — is
 * `docs/ARCHITECTURE.md`. This function is the **only** writer of
 * `public.account_flags`: RLS grants an account a self-select and no write at all, so a
 * flag can only change through a function that first proves who is asking. That
 * asymmetry is the design rather than an omission — a flag is the owner's decision
 * about an account, not a preference the account's reader can edit.
 *
 * One action per request:
 *
 *   - `list` — every account with its flags and its marker, for the panel's table
 *   - `set-flags` — one account's flags, **set** to what is given and answered with
 *     the stored row, so the panel patches what it drew instead of re-reading
 *   - `create-account` — an account the owner made, confirmed on the spot, so no
 *     mailer is involved (the project's `mailer_autoconfirm` is on for the same reason)
 *   - `set-password` — the hand-run reset: the owner chooses the password and hands it
 *     over, which is what "manual" means now that no mail is sent
 *
 * Every request is checked the same way, and in this order:
 *
 *   1. the platform has already verified the JWT — `verify_jwt` defaults to true and
 *      the deploy does not pass `--no-verify-jwt` — and this function sends the
 *      caller's own `Authorization` header on rather than trusting a claim it decodes
 *      itself
 *   2. read the caller from the Auth API, so the user id comes from the provider
 *   3. read the caller's **own** `is_admin` **with the service role** — with the
 *      caller's token this would be asking the reader whether they are an admin, and
 *      for a non-admin it would answer nothing at all
 *   4. refuse anything but `true`, before a single action runs
 *
 * **No imports, on purpose.** `@supabase/supabase-js` is allowed in exactly one module
 * in this repo (`packages/db/src/supabase.ts`); an Edge Function is a second runtime
 * rather than a second importer. `tests/unit/architecture/integrity.test.ts` reads this
 * file and fails if that changes, because a rule nothing checks is a rule that rots.
 *
 * Environment, injected into every function by Supabase: `SUPABASE_URL`,
 * `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Optional: `ALLOWED_ORIGINS`, a
 * comma-separated list — unset means any origin may call it, which is the closed beta's
 * default; set it to the deployed origin to tighten the endpoint.
 *
 * `is_admin` is **not** writable here. It is set once, by hand, with the statement
 * recorded in `docs/ARCHITECTURE.md`, so an admin cannot mint another admin, and an
 * absent marker means false — in this file and in the app alike.
 */

/**
 * The keys a write may carry — the third mirror of the eight, beside the union in
 * `packages/domain/src/feature-flags.ts` and the check in
 * `20260923160000_account_flags.sql`.
 *
 * A Deno function cannot import the domain, so it carries the list rather than asking
 * for it — and `tests/unit/architecture/feature-flags.test.ts` reads this literal and
 * fails when it and the union differ, because three copies that must agree is one copy
 * too many to leave unchecked. The same test that keeps the SQL check in step keeps this
 * one in step, which is what stops a flag existing in the app and being unwritable here.
 */
const KNOWN_FLAGS = [
  "account_management",
  "admin_panel",
  "karuna_reiki",
  "usui_reiki",
  "reiki_master",
  "chakras",
  "binaural",
  "auto_scroll",
  // The owner's round 24: the plan card's randomiser, the eight colour schemes, and a
  // session drawn in the meditation's own colour. Added here in the same change as the
  // union and the migration's key list, which is the three-mirror rule this file's
  // header describes — the guard fails if any one of the three is left behind.
  "intention_randomiser",
  "colour_scheme",
  "chakra_immersion",
] as const;

/**
 * The project's `password_min_length`, read from the hosted project on 2026-09-21 and
 * recorded in `docs/ARCHITECTURE.md`. Held here as well because this function creates
 * accounts and sets passwords, and a platform error is a worse answer than a refusal.
 */
const MIN_PASSWORD = 8;

type AdminUser = {
  id: string;
  email?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
};

type Body = {
  action?: unknown;
  userId?: unknown;
  email?: unknown;
  password?: unknown;
  flags?: unknown;
};

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

/**
 * Every flag present, which is what a surface reads.
 *
 * The stored object is sparse and a value that is not a boolean was not written by this
 * function, so both mean the default — exactly `normalizeFeatureFlags`'s rule on the
 * app's side, kept here because the panel draws what this answers and a second opinion
 * about a missing key is how two screens disagree.
 */
function normalizedFlags(stored: unknown): Record<string, boolean> {
  const record =
    stored !== null && typeof stored === "object"
      ? (stored as Record<string, unknown>)
      : {};
  const out: Record<string, boolean> = {};
  for (const key of KNOWN_FLAGS) out[key] = record[key] !== false;
  return out;
}

/**
 * The flags a write may carry: an object, every key one this build knows, every value a
 * boolean, nothing else — or a refusal naming which rule was broken.
 *
 * Strict on the way in, unlike the read path, and deliberately so: a tolerant write would
 * turn a typo into an account whose exclusions were silently cleared, which is the one
 * failure the owner could not see. An absent key is still allowed, and still means the
 * default, so a caller may send only what it changed.
 */
function validateFlags(input: unknown): { flags: Record<string, boolean> } | { error: string } {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { error: "invalid_flags" };
  }
  const flags: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!(KNOWN_FLAGS as readonly string[]).includes(key)) return { error: "unknown_flag" };
    if (typeof value !== "boolean") return { error: "invalid_flag_value" };
    flags[key] = value;
  }
  return { flags };
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

  const asService = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  const who = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authorization },
  });
  if (!who.ok) return json({ error: "unauthorized" }, 401, headers);
  const caller = (await who.json()) as { id?: string };
  if (!caller.id) return json({ error: "unauthorized" }, 401, headers);

  const marker = await fetch(
    `${url}/rest/v1/account_flags?select=is_admin&user_id=eq.${caller.id}`,
    { headers: asService },
  );
  if (!marker.ok) {
    return json({ error: "read_failed", detail: await marker.text() }, 502, headers);
  }
  const markerRows = (await marker.json()) as { is_admin?: boolean }[];
  if (markerRows[0]?.is_admin !== true) return json({ error: "not_admin" }, 403, headers);

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json({ error: "invalid_body" }, 400, headers);
  }

  switch (body.action) {
    case "list": {
      const listed = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=200`, {
        headers: asService,
      });
      if (!listed.ok) {
        return json({ error: "list_failed", detail: await listed.text() }, 502, headers);
      }
      const users = ((await listed.json()) as { users?: AdminUser[] }).users ?? [];

      const rows = await fetch(
        `${url}/rest/v1/account_flags?select=user_id,is_admin,flags`,
        { headers: asService },
      );
      if (!rows.ok) return json({ error: "read_failed", detail: await rows.text() }, 502, headers);
      const stored = (await rows.json()) as {
        user_id: string;
        is_admin?: boolean;
        flags?: unknown;
      }[];
      const byUser = new Map(stored.map((row) => [row.user_id, row]));

      return json(
        {
          accounts: users.map((user) => {
            const row = byUser.get(user.id);
            return {
              userId: user.id,
              email: user.email ?? "",
              createdAt: user.created_at ?? null,
              lastSignInAt: user.last_sign_in_at ?? null,
              isAdmin: row?.is_admin === true,
              // An account with no row is an account with everything on, so the panel
              // draws the truth rather than a fourth state for "not set yet".
              flags: normalizedFlags(row?.flags),
            };
          }),
        },
        200,
        headers,
      );
    }

    case "set-flags": {
      const userId = typeof body.userId === "string" ? body.userId : "";
      if (!userId) return json({ error: "missing_user" }, 400, headers);
      const validated = validateFlags(body.flags);
      if ("error" in validated) return json({ error: validated.error }, 400, headers);

      // `is_admin` is absent from the payload on purpose: with `merge-duplicates` an
      // omitted column keeps its stored value, so this action cannot promote anybody.
      const written = await fetch(`${url}/rest/v1/account_flags`, {
        method: "POST",
        headers: {
          ...asService,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify({
          user_id: userId,
          flags: validated.flags,
          updated_at: new Date().toISOString(),
        }),
      });
      if (!written.ok) {
        return json({ error: "write_failed", detail: await written.text() }, 502, headers);
      }
      const row = ((await written.json()) as {
        is_admin?: boolean;
        flags?: unknown;
      }[])[0];
      return json(
        {
          account: {
            userId,
            isAdmin: row?.is_admin === true,
            flags: normalizedFlags(row?.flags),
          },
        },
        200,
        headers,
      );
    }

    case "create-account": {
      const email = typeof body.email === "string" ? body.email.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ error: "invalid_email" }, 400, headers);
      }
      if (password.length < MIN_PASSWORD) return json({ error: "weak_password" }, 400, headers);

      const created = await fetch(`${url}/auth/v1/admin/users`, {
        method: "POST",
        headers: { ...asService, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, email_confirm: true }),
      });
      if (!created.ok) {
        return json({ error: "create_failed", detail: await created.text() }, 502, headers);
      }
      const user = (await created.json()) as AdminUser;
      // No flags row is written: an account with no row is an account with everything
      // on, which is where the owner starts from before subtracting anything.
      return json({ account: { userId: user.id, email: user.email ?? email } }, 200, headers);
    }

    case "set-password": {
      const userId = typeof body.userId === "string" ? body.userId : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!userId) return json({ error: "missing_user" }, 400, headers);
      if (password.length < MIN_PASSWORD) return json({ error: "weak_password" }, 400, headers);

      const updated = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
        method: "PUT",
        headers: { ...asService, "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!updated.ok) {
        return json({ error: "password_failed", detail: await updated.text() }, 502, headers);
      }
      return json({ account: { userId } }, 200, headers);
    }

    default:
      return json({ error: "unknown_action" }, 400, headers);
  }
});
