import { expect, test } from "@playwright/test";

/** A real 1x1 RGBA PNG, so the library accepts it and the browser can paint it. */
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

test("start a session from the planner without select elements", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("meditaur:e2eDurationMs", "200");
  });
  await page.goto("/plan");
  await expect(page.getByRole("textbox", { name: "Plan name" })).toHaveValue("Circuit session");
  // The planner's start action is named for what it does; it used to say `Load`.
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page).toHaveURL(/\/run\//);
  await expect(page.getByRole("link", { name: "Plan" })).toHaveCount(0);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
});

test("focus tile starts a session without select elements", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("meditaur:e2eDurationMs", "200");
  });
  await page.goto("/plan");
  await page.getByRole("button", { name: "Root Chakra", exact: true }).click();
  await expect(page).toHaveURL(/\/run\//);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Rama" })).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
});

test("shows a symbol's picture in its merged cell on the run screen", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("meditaur:e2eDurationMs", "200");
  });

  // Give one seeded symbol a picture through the library, exactly as a reader would.
  await page.goto("/library");
  await page.getByRole("button", { name: "Symbols", exact: true }).click();
  await page.getByRole("button", { name: "Edit Rama" }).click();
  await page.getByLabel("Symbol image").setInputFiles({
    name: "rama.png",
    mimeType: "image/png",
    buffer: Buffer.from(PNG_1X1, "base64"),
  });
  await page.getByRole("button", { name: "Save" }).click();
  // The click returns before the Dexie write lands. The symbol's read-only view
  // only comes back once the save has finished and the editor has closed, so
  // waiting for it is what keeps the next step from compiling a catalog without
  // the picture.
  await expect(page.getByRole("heading", { name: "Rama" })).toBeVisible();

  // The focus tile compiles every symbol bound to the focus point, so the
  // picture has to arrive through the snapshot, not through a library lookup.
  await page.goto("/plan");
  await page.getByRole("button", { name: "Root Chakra", exact: true }).click();
  await expect(page).toHaveURL(/\/run\//);
  await expect(page.getByRole("heading", { level: 3, name: "Rama" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Rama symbol" })).toBeVisible();
});
