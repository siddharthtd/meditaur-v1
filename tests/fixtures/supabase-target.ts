/**
 * Which Supabase the live integration tests talk to.
 *
 * The problem this exists for: `.env` describes the hosted project *and* a local
 * stack can be running, so "which one did that test run against?" was decided by
 * whatever happened to be in the file. A run that meant to exercise the local
 * path could quietly exercise production instead, and the live tests still
 * reported green. Selection is now explicit — `SUPABASE_TARGET=hosted|local` —
 * and a target that was asked for but is not configured **throws** instead of
 * skipping, so a run cannot claim to have covered the local stack it never
 * reached.
 *
 * Two trios, one per target:
 *   hosted  SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
 *   local   SUPABASE_LOCAL_URL / SUPABASE_LOCAL_ANON_KEY / SUPABASE_LOCAL_SERVICE_ROLE_KEY
 *
 * `hosted` also accepts the app's own `NEXT_PUBLIC_SUPABASE_URL` /
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY`, so a checkout that only sets the pair the
 * browser needs still gets a live run.
 *
 * The local URL is the one thing that cannot be guessed: the tests run inside
 * `meditaur-tools:local`, where `127.0.0.1` is the container itself, so it must
 * be `http://host.docker.internal:54321` — the name `compose.tools.yaml` maps to
 * the host gateway. `./scripts/meditaur up` starts the stack;
 * `./scripts/meditaur test:integration:local` runs this target.
 */

export type SupabaseTargetName = "hosted" | "local";

export type SupabaseTarget = {
  name: SupabaseTargetName;
  url: string;
  anonKey: string;
  serviceKey: string;
};

export type SupabaseEnv = Record<string, string | undefined>;

const VARS: Record<SupabaseTargetName, readonly [string, string, string]> = {
  hosted: ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
  local: ["SUPABASE_LOCAL_URL", "SUPABASE_LOCAL_ANON_KEY", "SUPABASE_LOCAL_SERVICE_ROLE_KEY"],
};

/** What to say when the local stack is not answering. */
export function localStackHelp(url: string): string {
  return [
    `Could not reach the local Supabase stack at ${url}.`,
    "Start it with ./scripts/meditaur up (the one command that wants a host tool).",
    "A cold first start can take a few minutes while the images pull; re-running is idempotent.",
    "From inside the tools container, 127.0.0.1 is the container itself — the URL must be",
    "http://host.docker.internal:54321, which compose.tools.yaml maps to the host gateway.",
  ].join("\n");
}

/** The local URL as the tests must see it, for the guard's failure message. */
export function localStackUrl(env: SupabaseEnv): string {
  return (env.SUPABASE_LOCAL_URL ?? "").trim() || "http://host.docker.internal:54321";
}

function read(env: SupabaseEnv, name: SupabaseTargetName): SupabaseTarget | null {
  const [urlVar, anonVar, serviceVar] = VARS[name];
  const allowAppVars = name === "hosted";
  const url =
    (env[urlVar] ?? "").trim() ||
    (allowAppVars ? (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim() : "");
  const anonKey =
    (env[anonVar] ?? "").trim() ||
    (allowAppVars ? (env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim() : "");
  const serviceKey = (env[serviceVar] ?? "").trim();
  if (!url || !anonKey || !serviceKey) return null;
  return { name, url, anonKey, serviceKey };
}

/**
 * The target for this run, or `null` when nothing is configured and the live
 * tests should skip. Throws when a target was named and cannot be honoured.
 */
export function resolveSupabaseTarget(env: SupabaseEnv): SupabaseTarget | null {
  const asked = (env.SUPABASE_TARGET ?? "").trim().toLowerCase();
  if (asked && asked !== "hosted" && asked !== "local") {
    throw new Error(`SUPABASE_TARGET must be 'hosted' or 'local', not '${env.SUPABASE_TARGET}'`);
  }
  if (asked === "hosted" || asked === "local") {
    const named = read(env, asked);
    if (named) return named;
    throw new Error(
      `SUPABASE_TARGET=${asked} was asked for, but ${VARS[asked].join(", ")} are not all set.` +
        (asked === "local" ? `\n\n${localStackHelp(localStackUrl(env))}` : ""),
    );
  }
  // Unset: the hosted trio describes a full checkout, so it wins when both are
  // present. The local trio alone is enough for a stack-only run.
  return read(env, "hosted") ?? read(env, "local");
}

/** True when the run was explicitly pointed at the local stack. */
export function isLocalTargetRequested(env: SupabaseEnv): boolean {
  return (env.SUPABASE_TARGET ?? "").trim().toLowerCase() === "local";
}
