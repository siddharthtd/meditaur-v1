import { expect, test } from "@playwright/test";

test("home and planner render without select elements", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Meditaur" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start session" })).toBeVisible();
  await page.getByRole("link", { name: "Open planner" }).click();
  await expect(page.getByRole("textbox", { name: "Plan name" })).toHaveValue("Chakra circuit");
  await expect(page.locator("select")).toHaveCount(0);
  // The card's `Edit` opens that meditation's own editor, and the meditation
  // itself is changed inside it (the owner's round 17 moved the card's five
  // pickers in there).
  await page.getByRole("button", { name: "Edit Third-Eye Chakra" }).first().click();
  await page.getByRole("button", { name: "Change", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Meditation" })).toBeVisible();
  await page.getByRole("button", { name: /Heart Chakra/ }).click();
  await expect(page.getByRole("heading", { name: "Heart Chakra", exact: true })).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
});

test("an address that is not a screen says so", async ({ page }) => {
  // A `/run/<id>` link whose session has been cleared is the likeliest way to
  // arrive here, and Next's own bare 404 is a different product from the one the
  // reader was using. This fails on the stock page.
  await page.goto("/nothing-here");
  await expect(
    page.getByRole("heading", { name: "There is nothing at this address" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open the planner" }).click();
  await expect(page).toHaveURL(/\/plan$/);
});

test("the privacy notice is reachable and says what is stored", async ({ page }) => {
  await page.goto("/privacy");
  await expect(
    page.getByRole("heading", { name: "What Meditaur stores about you" }),
  ).toBeVisible();
  // The device-only story is the part a reader most needs, and the part that an
  // account deliberately does not change.
  await expect(page.getByRole("heading", { name: "Almost nothing leaves your browser" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Removing it" })).toBeVisible();
  await page.getByRole("link", { name: "Back to creating an account" }).click();
  await expect(page).toHaveURL(/\/signup$/);
});

test("the icon a browser probes without being told is an icon", async ({ page }) => {
  // `/favicon.ico` is never linked to — the metadata points at `/icon` — but
  // every browser asks for it on a first visit, and it 404'd until now. The
  // bytes are the app's own mark at 32px (`app/mark.tsx`), so this checks the
  // route rather than a committed file that could drift from the drawing.
  const response = await page.request.get("/favicon.ico");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/png");
  const bytes = await response.body();
  // PNG magic, so a 200 that happens to be an HTML error page does not pass.
  expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
});
