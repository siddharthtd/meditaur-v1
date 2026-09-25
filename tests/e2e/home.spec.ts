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
  // The field is a **set** since round 22 — a point block clubs several points into one
  // pass — so the picker toggles rows in place and `Done` is the way back, rather than a
  // press committing and returning. Swapping one meditation for another is therefore two
  // presses on the rows and one on `Done`, which is what this walks.
  await expect(page.getByRole("heading", { name: "Points" })).toBeVisible();
  await page.getByRole("button", { name: /Third-Eye Chakra/ }).click();
  await page.getByRole("button", { name: /Heart Chakra/ }).click();
  await page.getByRole("button", { name: "Done" }).click();
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
  // Where the material lives and what an account does with it are the two things a
  // reader most needs, and `P2 · 3`'s copy slice made them one story rather than
  // two: the notice used to promise that material never left the browser, and now
  // it says this device *and* — signed in — the account, which is what makes moving
  // to another device possible. Both halves are pinned, because dropping either one
  // is the failure this test exists for.
  await expect(page.getByRole("heading", { name: "Where your material lives" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What an account stores" })).toBeVisible();
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
