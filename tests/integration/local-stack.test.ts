import { describe, expect, it } from "vitest";
import {
  isLocalTargetRequested,
  localStackHelp,
  localStackUrl,
  resolveSupabaseTarget,
} from "../fixtures/supabase-target.ts";

// Resolved at import time on purpose: `SUPABASE_TARGET=local` with an incomplete
// trio throws here, so the run fails instead of reporting a green skip.
const target = resolveSupabaseTarget(process.env);
const localUrl = localStackUrl(process.env);
const asked = isLocalTargetRequested(process.env);

/**
 * One request against the stack, with the hint attached when it cannot be made.
 * The hint is the whole point of this file: a stack that is not answering has to
 * say which URL was tried and how to fix it, not just "fetch failed".
 */
async function probe(path: string): Promise<{ status: number; body: string }> {
  try {
    const response = await fetch(`${target?.url}${path}`, {
      headers: { apikey: target?.anonKey ?? "" },
    });
    return { status: response.status, body: await response.text() };
  } catch (error) {
    throw new Error(localStackHelp(localUrl), { cause: error });
  }
}

/**
 * What this file is for: `host.docker.internal` is the one piece of the local
 * arrangement that nothing else in the repo can check. The mapping lives in
 * `infra/compose.tools.yaml`, the stack lives on the host, and the tests run in
 * the container — if the gateway stops being reachable, every local-path test
 * would start skipping quietly and nobody would notice until the day the local
 * stack was needed. Run it with `./scripts/meditaur test:integration:local`,
 * where a stack that is not answering is a failure rather than a skip.
 */
describe("local Supabase stack", () => {
  it.skipIf(!asked)("does not point at the container itself", () => {
    // 127.0.0.1 inside meditaur-tools is the tools container, not the host: the
    // mistake this guards against is the one the README warns about.
    expect(localUrl, "SUPABASE_LOCAL_URL must be the host gateway").not.toMatch(
      /(^|\/\/)(127\.0\.0\.1|localhost)/,
    );
  });

  it.skipIf(!asked)("answers at the host gateway the tools container uses", async () => {
    expect(target?.name, "resolved target").toBe("local");
    const auth = await probe("/auth/v1/health");
    expect(auth.status, `auth health: ${auth.body}`).toBeLessThan(300);

    // PostgREST is what the RLS cases speak, so a stack that answers for auth but
    // not for REST is not usable and must not pass this check.
    const rest = await probe("/rest/v1/");
    expect(rest.status, "rest root").toBeLessThan(400);
  });
});

describe("supabase target selection", () => {
  it("names the target this run resolved, or nothing when live tests skip", () => {
    // A tiny, always-on assertion so the summary line of a run records which
    // database it was pointed at.
    expect(["hosted", "local", null]).toContain(target?.name ?? null);
  });
});
