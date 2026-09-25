import { expect, test } from "@playwright/test";

/**
 * The admin panel where nobody administers anything (`P0 · 23`, slice 23f).
 *
 * This build has no Supabase pair, so `isAdmin` is false — and `admin_panel` gates it as
 * well — which makes the panel a sentence rather than a form, and keeps the link off
 * `/account`. That is the half worth asserting here: a reader must never be handed a
 * control that cannot work, and the route must not be a screen anyone can fill in.
 *
 * The cloud path is the live suite's, where the function exists to call
 * (`tests/integration/admin-flags.test.ts`): an admin listing accounts, writing one
 * account's flags, creating another and setting its password. Nothing here could stand in
 * for that, because what it proves is the *gate*, not the tool.
 */
test("refuses the panel to an account that does not run the beta", async ({ page }) => {
  await page.goto("/admin");

  await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
  await expect(
    page.getByText("This area belongs to the account that runs the beta. Yours does not have it."),
  ).toBeVisible();
  // The form is absent, not disabled: there is nothing here to fill in and nothing to
  // press, so a stray tap cannot reach a call that would be refused anyway.
  await expect(page.getByRole("button", { name: "Create account" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Accounts" })).toHaveCount(0);
});

test("offers no way into the panel from the account screen", async ({ page }) => {
  await page.goto("/account");

  await expect(page.getByRole("heading", { name: "This device" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the admin panel" })).toHaveCount(0);
});
