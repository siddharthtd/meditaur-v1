import { describe, expect, it } from "vitest";
import { DEFAULT_FEATURE_FLAGS } from "@meditaur/domain";
import { createLocalAdminPort } from "../../../packages/db/src/admin-local.ts";
import {
  createSupabaseAdminPort,
  type SupabaseFunctionsLike,
} from "../../../packages/db/src/supabase.ts";

/**
 * The two admin adapters (`P0 · 23`, slice 23f), against a fake client.
 *
 * The work is the function's: it runs on Supabase, where the service-role key lives, and
 * `tests/integration/admin-flags.test.ts` is what reaches it. What a unit test can hold is
 * the seam — that a build with no cloud refuses with one code rather than pretending it
 * could, that every method names the action the function expects, that an answer is
 * unwrapped rather than passed through, and that a refusal reaches the panel as the one
 * sentence it shows.
 */
function fakeFunctions(answers: Record<string, unknown>) {
  const calls: { name: string; body?: unknown }[] = [];
  const functions: SupabaseFunctionsLike = {
    async invoke<T>(name: string, options?: { body?: unknown }) {
      calls.push({ name, body: options?.body });
      const action = (options?.body as { action?: string } | undefined)?.action ?? "";
      return { data: (answers[action] ?? null) as T | null, error: null };
    },
  };
  return { functions, calls };
}

describe("the local admin port", () => {
  it("is not configured, and refuses every method with one code", async () => {
    // Two builds are wired here — a local-only one, and a cloud one whose function is not
    // deployed — and the panel answers both the same way, by asking `isConfigured()` and
    // saying so rather than drawing a form that cannot finish.
    const port = createLocalAdminPort();
    expect(port.isConfigured()).toBe(false);

    for (const call of [
      () => port.listAccounts(),
      () => port.setFlags("u2", { chakras: false }),
      () => port.createAccount("reader@example.test", "Test-pass-1!"),
      () => port.setPassword("u2", "Test-pass-2!"),
    ]) {
      await expect(call()).rejects.toMatchObject({ code: "admin.notConfigured" });
    }
  });
});

describe("the Supabase admin port", () => {
  it("names each action, and answers with what the function stored", async () => {
    const { functions, calls } = fakeFunctions({
      list: {
        accounts: [
          {
            userId: "u2",
            email: "reader@example.test",
            createdAt: "2026-09-23T00:00:00.000Z",
            lastSignInAt: null,
            isAdmin: false,
            flags: { ...DEFAULT_FEATURE_FLAGS, chakras: false },
          },
        ],
      },
      "set-flags": { account: { userId: "u2", isAdmin: false, flags: DEFAULT_FEATURE_FLAGS } },
      "create-account": { account: { userId: "u3", email: "new@example.test" } },
      "set-password": { account: { userId: "u3" } },
    });
    const port = createSupabaseAdminPort({ functions });

    expect(port.isConfigured()).toBe(true);

    const accounts = await port.listAccounts();
    expect(accounts.map((row) => row.userId)).toEqual(["u2"]);
    expect(accounts[0]?.flags.chakras).toBe(false);

    // A sparse set is passed through as it arrived: the function is what refuses an
    // unknown key, so this adapter does not quietly reshape the request.
    const stored = await port.setFlags("u2", { chakras: false });
    expect(stored).toEqual({
      userId: "u2",
      isAdmin: false,
      flags: DEFAULT_FEATURE_FLAGS,
    });

    expect(await port.createAccount("new@example.test", "Test-pass-1!")).toEqual({
      userId: "u3",
      email: "new@example.test",
    });
    await port.setPassword("u3", "Test-pass-2!");

    expect(calls).toEqual([
      { name: "admin", body: { action: "list" } },
      { name: "admin", body: { action: "set-flags", userId: "u2", flags: { chakras: false } } },
      {
        name: "admin",
        body: { action: "create-account", email: "new@example.test", password: "Test-pass-1!" },
      },
      { name: "admin", body: { action: "set-password", userId: "u3", password: "Test-pass-2!" } },
    ]);
  });

  it("answers an empty list rather than nothing, and refuses an empty answer", async () => {
    const list = createSupabaseAdminPort({ functions: fakeFunctions({ list: {} }).functions });
    expect(await list.listAccounts()).toEqual([]);

    // A success shape with no account in it is not something a screen can draw, so it is
    // a failure rather than an undefined row.
    const empty = createSupabaseAdminPort({ functions: fakeFunctions({}).functions });
    await expect(empty.setFlags("u2", { chakras: false })).rejects.toMatchObject({
      code: "admin.requestFailed",
    });
  });

  it("surfaces the function's own words when it refuses, and its own when there are none", async () => {
    const refused: SupabaseFunctionsLike = {
      async invoke() {
        return { data: null, error: { message: "not_admin" } };
      },
    };
    await expect(
      createSupabaseAdminPort({ functions: refused }).listAccounts(),
    ).rejects.toMatchObject({ code: "admin.requestFailed", message: "not_admin" });

    const wordless: SupabaseFunctionsLike = {
      async invoke() {
        return { data: null, error: { message: "" } };
      },
    };
    await expect(
      createSupabaseAdminPort({ functions: wordless }).listAccounts(),
    ).rejects.toMatchObject({
      code: "admin.requestFailed",
      message: "The admin function refused the request",
    });
  });
});
