import { expect, test, type Page } from "@playwright/test";

/**
 * The device wipe, which is the half of account deletion that needs no
 * privilege and no cloud call.
 *
 * The store itself is Dexie, so the unit tests can only prove that the call is
 * forwarded and that nobody is signed out along the way. Whether the rows are
 * really gone, and whether the app comes back rather than reading an empty
 * database forever, is only visible here.
 */
/** Leave a durable, one-press setting behind, and prove it reached the store. */
async function turnOnTts(page: Page) {
  await page.goto("/settings");
  const tts = page.getByRole("button", { name: /Speak intentions/ });
  await expect(tts).toHaveAttribute("aria-pressed", "false");
  await tts.click();
  await expect(tts).toHaveAttribute("aria-pressed", "true");
  // Reloading proves the write reached the store. Without it, "gone after the
  // wipe" would be indistinguishable from "never persisted".
  await page.reload();
  await expect(page.getByRole("button", { name: /Speak intentions/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

function ttsPressed(page: Page) {
  return page.getByRole("button", { name: /Speak intentions/ });
}

/**
 * The close control is only offered where an account can really be closed.
 *
 * This build has no Supabase pair, so `accountIsConfigured()` is false and the
 * section is absent — which is the whole point: a reader must never be handed a
 * destructive control that cannot finish. The cloud build's own path is covered
 * by the live suite, where the function exists to call.
 */
test("offers no close-account control when no account can be closed", async ({ page }) => {
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "This device" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Close my account/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Close this account" })).toHaveCount(0);
});

test("arming the erase erases nothing", async ({ page }) => {
  await turnOnTts(page);
  await page.goto("/account");
  await page.getByRole("button", { name: "Erase this device's data" }).click();
  await expect(
    page.getByRole("button", { name: "Erase everything on this device?" }),
  ).toBeVisible();

  // The armed button is a question, not an action. Everything is still here.
  await page.goto("/settings");
  await expect(ttsPressed(page)).toHaveAttribute("aria-pressed", "true");
});

test("confirming the erase starts again from a seeded catalogue", async ({ page }) => {
  // Dropping the database and re-seeding the default catalogue is genuinely
  // slower than any other interaction, and the default budget is for the
  // ordinary ones. This test is about the outcome, not about being quick.
  test.setTimeout(60_000);
  await turnOnTts(page);

  await page.goto("/account");
  await page.getByRole("button", { name: "Erase this device's data" }).click();
  await page.getByRole("button", { name: "Erase everything on this device?" }).click();
  await expect(page).toHaveURL(/\/$/);

  // Back to a seeded catalogue rather than an empty store: the wiped database is
  // re-created and re-seeded, which is the part `resetSeed` exists for. Without
  // it the app would read nothing, forever, and say nothing about why.
  await page.goto("/settings");
  await expect(ttsPressed(page)).toHaveAttribute("aria-pressed", "false");
  await page.goto("/plan");
  await expect(page.getByRole("textbox", { name: "Plan name" })).toHaveValue(
    "Chakra circuit",
  );
});
