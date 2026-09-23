import { describe, expect, it } from "vitest";
import { ACCOUNT_ERRORS, createLocalAccountPort } from "../../../packages/db/src/account-local.ts";

/**
 * The account-closing seam on a build that cannot close one.
 *
 * What matters is not that it throws — it is that it says *why* with a code the
 * UI can branch on, and that `isConfigured()` is false so no screen offers the
 * affordance in the first place. Wired into every build until the server half
 * of the account-close item (`P1 · 5`) is deployed (docs/ROADMAP.md), so this is the state a reader is in
 * today.
 */
describe("the local account port", () => {
  it("reports that it cannot close an account", () => {
    expect(createLocalAccountPort().isConfigured()).toBe(false);
  });

  it("refuses with a code a screen can branch on, not a bare Error", async () => {
    await expect(createLocalAccountPort().closeAccount()).rejects.toMatchObject({
      name: "AppError",
      code: "account.notConfigured",
      message: ACCOUNT_ERRORS.notConfigured,
    });
  });
});
