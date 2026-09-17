import { expect, test } from "@playwright/test";

test("tuner lives at /tuner and /dev/tuner redirects", async ({ page }) => {
  await page.goto("/dev/tuner");
  await expect(page).toHaveURL(/\/tuner\/?$/);
  // The eyebrow says which screen this is; the heading names the sound it is
  // tuning, which is the question the screen answers.
  await expect(page.getByText("Tuner", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "App" })).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
});

test("the tuner's controls are the shared primitives", async ({ page }) => {
  await page.goto("/tuner");
  // The `Add …` pair used to be a raw button with hand-written classes, and the
  // EQ/tones were a second copy of the config screen's markup.
  await expect(page.getByRole("button", { name: /^Add tone \(1\/16\)$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add beat pair" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove tone" })).toBeVisible();
  // The EQ bands are the shared `Stepper`, one per graphic band.
  await expect(page.getByRole("button", { name: "increase 1000 Hz" })).toBeVisible();
});
