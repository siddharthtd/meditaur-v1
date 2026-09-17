import { describe, expect, it } from "vitest";
import {
  isLocalTargetRequested,
  localStackHelp,
  localStackUrl,
  resolveSupabaseTarget,
} from "../../fixtures/supabase-target.ts";

const hosted = {
  SUPABASE_URL: "https://hosted.supabase.co",
  SUPABASE_ANON_KEY: "anon-hosted",
  SUPABASE_SERVICE_ROLE_KEY: "service-hosted",
};
const localStack = {
  SUPABASE_LOCAL_URL: "http://host.docker.internal:54321",
  SUPABASE_LOCAL_ANON_KEY: "anon-local",
  SUPABASE_LOCAL_SERVICE_ROLE_KEY: "service-local",
};

describe("supabase target resolution", () => {
  it("skips when nothing at all is configured", () => {
    expect(resolveSupabaseTarget({})).toBeNull();
  });

  it("uses the hosted trio when only the hosted trio is set", () => {
    expect(resolveSupabaseTarget(hosted)).toMatchObject({
      name: "hosted",
      url: "https://hosted.supabase.co",
    });
  });

  it("uses the local trio when only the local trio is set", () => {
    expect(resolveSupabaseTarget(localStack)).toMatchObject({
      name: "local",
      url: "http://host.docker.internal:54321",
    });
  });

  it("prefers the hosted trio when the file holds both, and says so if asked", () => {
    const both = { ...hosted, ...localStack };
    expect(resolveSupabaseTarget(both)?.name).toBe("hosted");
    expect(resolveSupabaseTarget({ ...both, SUPABASE_TARGET: "local" })?.name).toBe("local");
  });

  it("still runs hosted from the two variables the browser needs", () => {
    expect(
      resolveSupabaseTarget({
        NEXT_PUBLIC_SUPABASE_URL: "https://hosted.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-hosted",
        SUPABASE_SERVICE_ROLE_KEY: "service-hosted",
      }),
    ).toMatchObject({ name: "hosted" });
  });

  it("fails loudly when a named target is not configured, and names the host gateway", () => {
    // The point of the whole module: a run that claims to cover the local stack
    // must not silently skip it and report green.
    expect(() => resolveSupabaseTarget({ ...hosted, SUPABASE_TARGET: "local" })).toThrow(
      /SUPABASE_LOCAL_URL/,
    );
    expect(() => resolveSupabaseTarget({ ...hosted, SUPABASE_TARGET: "local" })).toThrow(
      /host\.docker\.internal:54321/,
    );
    expect(() => resolveSupabaseTarget({ ...localStack, SUPABASE_TARGET: "hosted" })).toThrow(
      /SUPABASE_URL/,
    );
  });

  it("rejects a target it does not know", () => {
    expect(() => resolveSupabaseTarget({ ...hosted, SUPABASE_TARGET: "staging" })).toThrow(
      /must be 'hosted' or 'local'/,
    );
  });

  it("treats a partial trio as unconfigured rather than half-live", () => {
    expect(resolveSupabaseTarget({ SUPABASE_URL: hosted.SUPABASE_URL })).toBeNull();
    expect(
      resolveSupabaseTarget({ ...localStack, SUPABASE_LOCAL_SERVICE_ROLE_KEY: "" }),
    ).toBeNull();
  });

  it("reports which target was asked for, and how to fix the local one", () => {
    expect(isLocalTargetRequested({ SUPABASE_TARGET: " local " })).toBe(true);
    expect(isLocalTargetRequested(hosted)).toBe(false);
    expect(localStackUrl(localStack)).toBe("http://host.docker.internal:54321");
    expect(localStackUrl({})).toBe("http://host.docker.internal:54321");
    expect(localStackHelp("http://host.docker.internal:54321")).toMatch(/meditaur up/);
  });
});
