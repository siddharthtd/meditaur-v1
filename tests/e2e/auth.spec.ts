import { expect, test } from "@playwright/test";

/**
 * The identity routes. The e2e image builds with no `NEXT_PUBLIC_SUPABASE_*` pair
 * (infra/compose.e2e.yaml), so this covers the branch a build without cloud config
 * takes: both screens exist, both say what is true of this build, and neither
 * dead-ends the reader — local-first means sign-in is never a toll gate.
 */
test("sign-in and sign-up both offer the local way through", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText(/Cloud auth is not configured/)).toBeVisible();
  // No account can be created on a build with nothing to create it in.
  await expect(page.getByRole("link", { name: "Create an account" })).toHaveCount(0);

  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
  await page.getByRole("button", { name: "Continue locally" }).click();
  await expect(page.getByRole("textbox", { name: "Plan name" })).toHaveValue("Chakra circuit");
});
