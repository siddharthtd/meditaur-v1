import { expect, test, type Page } from "@playwright/test";

/**
 * A record's own page: it reads first, edits in place, and `Esc` goes back to the door.
 *
 * The owner's round 22 asked for one pathway where there had been two. The old shape took
 * two navigations — the Library's read-only page, then the Database's editor — and the
 * address changed on the way. Here the screen and the address both stand still while the
 * record turns into its own editor; the only thing that moves is the reader, when they
 * leave, and it moves back to whichever door they came through.
 *
 * The rule the merge had to keep is asserted first, because it is the one a merge of a
 * reading half and an editing half is most likely to lose: arriving on a record never shows
 * a box to type in (the owner's round 4, library item 8).
 */

/** One of the Database's tables, scoped to its own rail: two words here repeat the Library's. */
function databaseTable(page: Page, name: string) {
  return page.locator("[data-database-tables]").getByRole("button", { name, exact: true });
}

/** A tab of the Library's strip. */
function libraryTab(page: Page, name: string) {
  return page.locator("nav").getByRole("button", { name, exact: true });
}

test("a record reads first, then edits in place at the same address", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Open Root Chakra" }).click();

  await expect(page).toHaveURL(/\/record\?kind=meditation&id=/);
  await expect(page.getByRole("heading", { name: "Root Chakra" })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  // The way back is in the **bar**, beside the screen's own action — where the owner asked for
  // it in round 8 ("next to the save/edit button … the bottom bar that retains even if
  // scrolled"), and where `EditorChrome` had stopped putting it.
  const bar = page.getByRole("button", { name: "Edit", exact: true }).locator("xpath=..");
  await expect(bar.getByRole("button", { name: "Esc back", exact: true })).toBeVisible();
  const address = page.url();

  // `Edit` turns the record into its editor **in place**: the boxes arrive, the address does
  // not move, and nothing is fetched from another screen.
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Meditation name" })).toHaveValue("Root Chakra");
  await expect(page).toHaveURL(address);

  // `Esc` leaves the record for the door it came through, which the address said was the
  // Library. The **key** here, the legend in the preset test, so both presses are covered.
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("button", { name: "Open Root Chakra" })).toBeVisible();
});

test("the grid's row press opens the same record, and Esc returns to the grid", async ({ page }) => {
  await page.goto("/database");
  await databaseTable(page, "Chakras").click();
  const row = page
    .locator('[data-table="meditation"] tbody tr')
    .filter({ has: page.getByRole("button", { name: "Drag row" }) })
    .first();
  await row.hover();
  await row.locator("td").first().click({ position: { x: 1, y: 1 } });

  // The same screen, with the other door in the address — which is what makes leaving come
  // back here rather than to the Library.
  await expect(page).toHaveURL(/\/record\?kind=meditation&id=.*from=database/);
  await expect(page.getByRole("heading", { name: "Third-Eye Chakra" })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);

  await page.getByRole("button", { name: "Esc back", exact: true }).click();
  await expect(page).toHaveURL(/\/database$/);
  await expect(databaseTable(page, "Chakras")).toBeVisible();
});

test("a preset is the one record that opens straight into its editor", async ({ page }) => {
  await page.goto("/library");
  await libraryTab(page, "Presets").click();
  // A preset has nothing to read, so its page *is* its editor: the same address, and the
  // editor already up. The owner's round 22 kept this exception deliberately.
  await page.getByRole("button", { name: /^Edit Solfeggio Root 396\/8$/ }).click();
  await expect(page).toHaveURL(/\/record\?kind=presets&id=/);
  await expect(page.getByRole("textbox", { name: "Preset name" })).toBeVisible();

  await page.getByRole("button", { name: "Esc back", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
});

test("Tune writes the record's draft before it swaps the screen in", async ({ page }) => {
  // Two screens and a write between them, so it is slower than the other two here.
  test.slow();
  await page.goto("/library");
  await page.getByRole("button", { name: "Open Root Chakra" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();

  // A name typed here and not yet saved.
  const name = page.getByRole("textbox", { name: "Meditation name" });
  await name.fill("Root Chakra tuned");

  // `Tune` is the one door out of a record that is not "leaving", so the draft is written on
  // the way through (the rule `saveDraftThen` kept in the library).
  await page.getByRole("button", { name: "Open binaural config" }).click();
  await expect(page.getByRole("button", { name: "Esc back", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Esc back", exact: true }).click();

  // Back on the record, still editing, with the name it had when it left.
  await expect(page.getByRole("textbox", { name: "Meditation name" })).toHaveValue(
    "Root Chakra tuned",
  );
});
