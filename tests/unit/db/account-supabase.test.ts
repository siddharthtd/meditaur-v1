import { describe, expect, it } from "vitest";
import {
  createSupabaseAccountPort,
  type SupabaseFunctionsLike,
} from "../../../packages/db/src/supabase.ts";

/**
 * The port over the `close-account` function, exercised against a fake client.
 *
 * What is worth unit-testing here is the seam rather than the work: the function
 * itself runs on Supabase, where the service-role key lives, and no unit test can
 * reach it (the live suite does). The three things a screen depends on are that
 * the call is made by name with no arguments, that a refusal reaches the reader
 * in the function's own words, and that a failure carrying no words still says
 * something.
 */
function fakeFunctions(result: {
  data?: unknown;
  error?: { message: string } | null;
}): { functions: SupabaseFunctionsLike; calls: { name: string; body?: unknown }[] } {
  const calls: { name: string; body?: unknown }[] = [];
  const functions: SupabaseFunctionsLike = {
    async invoke<T>(name: string, options?: { body?: unknown }) {
      calls.push({ name, body: options?.body });
      return { data: (result.data ?? null) as T | null, error: result.error ?? null };
    },
  };
  return { functions, calls };
}

describe("the Supabase account port", () => {
  it("is configured, and calls close-account", async () => {
    const { functions, calls } = fakeFunctions({ data: { closed: true } });
    const port = createSupabaseAccountPort({ functions });

    expect(port.isConfigured()).toBe(true);

    await port.closeAccount();
    expect(calls).toEqual([{ name: "close-account", body: {} }]);
  });

  it("surfaces the function's own words when it refuses", async () => {
    const { functions } = fakeFunctions({ error: { message: "purge_failed" } });
    const port = createSupabaseAccountPort({ functions });

    await expect(port.closeAccount()).rejects.toMatchObject({
      code: "account.closeFailed",
      message: "purge_failed",
    });
  });

  it("says something of its own when the failure carries no words", async () => {
    const { functions } = fakeFunctions({ error: { message: "" } });
    const port = createSupabaseAccountPort({ functions });

    await expect(port.closeAccount()).rejects.toMatchObject({
      code: "account.closeFailed",
      message: "Could not close the account",
    });
  });
});
