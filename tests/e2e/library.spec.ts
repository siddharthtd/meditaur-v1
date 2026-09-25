import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * What the library *shows* (§8).
 *
 * The pages here are read-only on purpose: a chakra's page answers what it is and
 * what it holds, and everything that changes one lives in the Database. That is
 * why this file asserts as much about what is *absent* — no inputs on a sheet, no
 * `Edit` on a browse card — as about what is there. `database.spec.ts` covers the
 * writing half.
 *
 * The tab strip is scoped, because the Database repeats two of those words for its
 * table switcher: `Symbols` is both a screen of the library and one of the four
 * tables.
 */

function libraryTab(page: Page, name: string) {
  return page.locator("nav").getByRole("button", { name, exact: true });
}

/**
 * One record's **editor**, reached the way a reader reaches it now.
 *
 * The owner's round 20 put one page and one editor behind every record: the grid's row
 * press opens the library's read-only page for it, and `Edit` on that page opens the
 * Database's editor — which is where the fields these tests are about live (a chakra's
 * own `Governs`, its picture, its default sound). A row is found by its name cell,
 * because a value in an `<input>` is not text and `hasText` cannot see it.
 */
async function openEditorFromGrid(page: Page, table: string, name: string): Promise<void> {
  await page.goto("/database");
  await databaseTable(page, table === "meditation" ? "Chakras" : "Symbols").click();
  const row = page
    .locator(`[data-table="${table}"]`)
    .getByRole("textbox", { name: `${name} — Name` })
    .locator("xpath=ancestor::tr");
  await row.hover();
  await row.locator("td").last().click({ position: { x: 4, y: 4 } });
  // The page first — read-only — and then the editor behind its `Edit`.
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
}

/**
 * One of the Database's four tables.
 *
 * Scoped to the switcher's own rail: `Symbols` is also a tab of the library beside
 * it, and an unscoped name matches both.
 */
function databaseTable(page: Page, name: string) {
  return page.locator("[data-database-tables]").getByRole("button", { name, exact: true });
}

/** A real 1x1 RGBA PNG, so the library accepts it and the browser can paint it. */
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

test("adding a meditation lands in the Database, in a row to fill in", async ({ page }) => {
  await page.goto("/library");
  await expect(page.getByRole("button", { name: "Add", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  // The owner's ask: `Add …` does not open a page. It puts a row in the grid with
  // the caret already in its name, and the chakra's own settings are columns
  // beside it rather than fields on a form.
  await expect(page.getByRole("columnheader", { name: "Default sound" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Binaural" })).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
  const name = page.getByRole("textbox", { name: "New record — Name" });
  await name.fill("Navel");
  await name.press("Enter");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // Back on the browse list, with the new card among the seeded ones. The
  // Database is a route of its own now, so getting back to the library is a
  // navigation rather than a different tab of the same page.
  await page.goto("/library");
  await libraryTab(page, "Chakras").click();
  await expect(page.getByRole("button", { name: "Open Navel" })).toBeVisible();
  await page.getByRole("button", { name: "Open Navel" }).click();
  // What opens only shows: no box to type in anywhere on the page.
  await expect(page.getByRole("heading", { name: "Navel" })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(0);
  // And `Edit` opens the Database's editor — the record page, which is the one editor a
  // record has (the owner's round 20), rather than a row in the grid with the caret in
  // its name, which is the door that was retired.
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Meditation name" })).toHaveValue("Navel");
});

test("the library's browse pages carry no actions at all", async ({ page }) => {
  await page.goto("/library");
  // §8: a card's picture, its type and its name are what the page is for. Nothing
  // on it edits or deletes — the Database's record view is where that happens.
  await expect(page.getByRole("button", { name: "Open Root Chakra" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Edit / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Delete / })).toHaveCount(0);
  await page.getByRole("button", { name: "Open Root Chakra" }).click();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add symbol" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
});

test("library reopens the last section in this tab", async ({ page }) => {
  await page.goto("/library");
  await libraryTab(page, "Plans").click();
  await expect(page.getByRole("button", { name: "Chakra circuit" })).toBeVisible();
  await page.goto("/plan");
  await page.goto("/library");
  await expect(page.getByRole("button", { name: "Chakra circuit" })).toBeVisible();
});

test("download catalog saves names and plans as json", async ({ page }) => {
  await page.goto("/library");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download catalog" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("meditaur-catalog.json");
  const file = await download.path();
  expect(file).toBeTruthy();
  const backup = JSON.parse(readFileSync(file as string, "utf8")) as {
    schemaVersion: number;
    plans: { name: string; blocks: unknown[] }[];
    entries: unknown[];
  };
  // Deliberately not pinned to a version. The exact value belongs to the unit
  // tests, which read `CATALOG_BACKUP_SCHEMA_VERSION`; a literal here is what
  // went stale the moment the schema was bumped.
  expect(typeof backup.schemaVersion).toBe("number");
  expect(backup.plans.some((p) => p.name === "Chakra circuit" && p.blocks.length > 0)).toBe(true);
  // The Entries table is part of the catalogue now, lines and all.
  expect(backup.entries.length).toBeGreaterThan(0);
});

test("restore catalog adds names from the json file", async ({ page }) => {
  await page.goto("/library");
  await page.getByLabel("Restore catalog").setInputFiles({
    name: "meditaur-catalog.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        exportedAt: 1,
        workspaceId: "other",
        meditations: [
          {
            id: "imported-focus",
            workspaceId: "other",
            name: "Imported focus",
            kind: "custom",
            locationText: "",
            defaultBinauralPresetId: null,
          },
        ],
        symbols: [],
        affirmations: [],
        fieldDefs: [],
        fieldValues: [],
        presets: [],
        mediaAssets: [],
        plans: [],
      }),
    ),
  });
  // A v1 file's `custom` row is not the seeded Protection — the migration maps it
  // to **Point** rather than deleting it (§13.1 of the round-15 plan), so the
  // library shows it under `Points` and nowhere else.
  await libraryTab(page, "Points").click();
  await expect(page.getByRole("button", { name: "Open Imported focus" })).toBeVisible();
});

test("history counts sessions completed this week", async ({ page }) => {
  await page.goto("/library");
  await libraryTab(page, "History").click();
  await expect(page.getByText("Sessions completed this week: 0")).toBeVisible();
});

test("duplicate copies a preset onto a new sound", async ({ page }) => {
  await page.goto("/library");
  await libraryTab(page, "Presets").click();
  await page.getByRole("button", { name: "Duplicate Solfeggio Root 396/8" }).click();
  await expect(
    page.getByRole("button", { name: "Edit Solfeggio Root 396/8 copy" }),
  ).toBeVisible();
});

test("the preset editor holds the sound under the name", async ({ page }) => {
  await page.goto("/library");
  await libraryTab(page, "Presets").click();
  await page.getByRole("button", { name: "Edit Solfeggio Root 396/8" }).click();
  await expect(page.getByRole("textbox", { name: "Preset name" })).toBeVisible();
  // The tuner is inline: tones, EQ and fades are on this screen, and there is no
  // `Open tuner` button and no `L1/R1 tones` heading to walk past.
  await expect(page.getByRole("button", { name: "Add tone (1/16)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open tuner" })).toHaveCount(0);
  // …and the Esc legend is the way back to the list, which is what the separate
  // route lacked (round 20: there is no separate `Back` button any more).
  await page.getByRole("button", { name: "Esc back", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit Solfeggio Root 396/8" })).toBeVisible();
});

test("chakra meditations show the chakra-only fields", async ({ page }) => {
  await page.goto("/library");
  // A *new* chakra, because the seeded ones already carry a value for a custom
  // field called `Governs` — and this test is about the editor's own fields, which
  // a chakra shows and a point does not.
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const name = page.getByRole("textbox", { name: "New record — Name" });
  await name.fill("Navel");
  await name.press("Enter");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await openEditorFromGrid(page, "meditation", "Navel");

  const chakra = page.getByRole("button", { name: "Chakras", exact: true });
  const point = page.getByRole("button", { name: "Points", exact: true });
  // Three fixed choices inside a form are a control, not page furniture: the
  // compact row, with the chosen one named for a screen reader (round 8).
  const tile = (await chakra.boundingBox())!;
  expect(tile.height, "a control, not a tile").toBeLessThan(56);
  // The editor's own field, not a custom field that happens to share the name: the
  // workspace seeds `Governs` and `Element` as custom fields as well, and a field's
  // label in this form is a `<span>` while a custom field's section is an `<h2>`.
  const editorField = (label: string) =>
    page.locator("span.text-lg.text-muted").filter({ hasText: new RegExp(`^${label}$`) });
  await chakra.click();
  await expect(chakra).toHaveAttribute("aria-pressed", "true");
  await expect(editorField("Governs")).toBeVisible();
  await expect(editorField("Element")).toBeVisible();
  await point.click();
  await expect(point).toHaveAttribute("aria-pressed", "true");
  await expect(chakra).toHaveAttribute("aria-pressed", "false");
  await expect(editorField("Governs")).toHaveCount(0);
  await expect(editorField("Element")).toHaveCount(0);
});

test("a card opens the read-only view, and Escape comes back", async ({ page }) => {
  await page.goto("/library");
  // The card itself is the open target — there is no `Open` button to find.
  await page.getByRole("button", { name: "Open Root Chakra" }).click();
  await expect(page.getByRole("heading", { name: "Root Chakra" })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Open Root Chakra" })).toBeVisible();
});

test("a card opens from anywhere on it, not only over its name", async ({ page }) => {
  await page.goto("/library");
  const card = page
    .locator("div.relative")
    .filter({ has: page.getByRole("button", { name: "Open Root Chakra" }) })
    .first();
  await card.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const box = (await card.boundingBox())!;
  await page.mouse.click(box.x + 24, box.y + box.height - 12);
  await expect(page.getByRole("heading", { name: "Root Chakra" })).toBeVisible();
});

test("the table switch brings the column picker, and shows itself on", async ({ page }) => {
  await page.goto("/library");
  await expect(page.getByRole("button", { name: "Table", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.getByRole("button", { name: "Columns", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Table", exact: true }).click();
  // The toggle is named for what it will do next, so in table mode it reads
  // `Cards` — and it is the one that is on.
  const back = page.getByRole("button", { name: "Cards", exact: true });
  await expect(back).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("columnheader", { name: /Name/ }).first()).toBeVisible();
  // The column action is a disclosure: open, it must read as selected.
  const columns = page.getByRole("button", { name: "Columns", exact: true });
  await columns.click();
  await expect(columns).toHaveAttribute("aria-expanded", "true");
  await expect(columns).toHaveClass(/bg-accent/);
});

test("a table row opens the read-only view, not the editor", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Table", exact: true }).click();
  // Anywhere in the row, not just the name cell (item 7).
  await page.getByRole("row", { name: /Root Chakra/ }).click({ position: { x: 250, y: 10 } });
  await expect(page.getByRole("heading", { name: "Root Chakra" })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
});

test("Escape in a record's editor leaves for the door it came from", async ({ page }) => {
  await page.goto("/library");
  await openEditorFromGrid(page, "meditation", "Root Chakra");
  await expect(page.getByRole("textbox", { name: "Meditation name" })).toBeVisible();
  // The **key**, not the legend: one screen owns Escape now (the owner's round 22), where the
  // two-screen shape had two listeners on the same screen and the test had to click instead.
  await page.keyboard.press("Escape");
  // The record was opened from the grid, so that is where leaving it lands — the address
  // carried the door (`from`), which is why nothing has to remember it in a flag.
  await expect(page).toHaveURL(/\/database/);
  await expect(page.getByRole("textbox", { name: "Root Chakra — Name" })).toBeVisible();
});

test("a trip to the binaural config writes the grid's draft rather than dropping it", async ({
  page,
}) => {
  await page.goto("/database");
  await page.locator("[data-database-tables]").getByRole("button", { name: "Chakras", exact: true }).click();
  const name = page.getByRole("textbox", { name: "Root Chakra — Name" });
  await name.fill("Root Chakra edited");
  await name.press("Enter");

  const row = page
    .locator('[data-table="meditation"]')
    .getByRole("textbox", { name: "Root Chakra edited — Name" })
    .locator("xpath=ancestor::tr");
  await row.hover();
  await row.getByRole("button", { name: "Tune" }).click();
  await expect(page.getByRole("button", { name: "Esc back", exact: true })).toBeVisible();

  // `Tune` is the one door out of the Database that is not "leaving", so the draft
  // is written on the way through and the other screen comes back to a grid that
  // still has the name in it.
  await page.getByRole("button", { name: "Esc back", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Root Chakra edited — Name" })).toHaveValue(
    "Root Chakra edited",
  );
});

test("there is one way back, and it is the Esc legend", async ({ page }) => {
  await page.goto("/library");
  await libraryTab(page, "Presets").click();
  await page.getByRole("button", { name: "Edit Solfeggio Root 396/8" }).click();
  await expect(page.getByRole("textbox", { name: "Preset name" })).toBeVisible();
  // Round 20: the separate `Back` button is gone, and the legend it duplicated is
  // the control — pressable, so a screen with no keyboard still has a way out. Where
  // it sits is not asserted here: `integrity.test.ts` reads the shells for that, and a
  // box read while a screen is still settling is a flake rather than a measurement.
  await expect(page.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
  const legend = page.getByRole("button", { name: "Esc back", exact: true });
  await expect(legend).toBeVisible();
  await legend.click();
  await expect(page.getByRole("button", { name: "Edit Solfeggio Root 396/8" })).toBeVisible();

  // The Database draws its own bar, so its legend lives with its own Save.
  await page.goto("/database");
  const gridBar = page
    .getByRole("button", { name: "Save", exact: true })
    .locator("xpath=..");
  await expect(gridBar.getByText("Esc", { exact: true })).toBeVisible();
  await expect(gridBar.getByText("back", { exact: true })).toBeVisible();
  // …and it is the control there too, not decoration beside a second button.
  await expect(gridBar.getByRole("button", { name: "Esc back", exact: true })).toBeVisible();
});

/**
 * The dead ends have the same one way back as everything else.
 *
 * A screen that says a record is gone is reached from a stale address — a bookmark or a reload
 * of something the reader has since deleted — so it is the one screen a reader meets with no
 * idea what happened. Round 20's rule was *"There is no need for a separate back button, just
 * have the Esc Back directive double as a back button"*; these were the screens it could not be
 * applied to as written, because they drew a `Back` button and no legend. They draw the legend
 * now, and Escape works there exactly as it does everywhere else.
 */
test("a record that has gone offers the same Esc back as every other screen", async ({ page }) => {
  // A record has one address now (the owner's round 22), so both dead ends are the same
  // screen reached the same way: a stale bookmark, or a reload of something the reader has
  // since deleted.
  await page.goto("/record?kind=meditation&id=11111111-1111-7111-8111-111111111111");
  await expect(page.getByText("That meditation is gone.")).toBeVisible();
  // The last `Back` button in the app is gone with the rest of them.
  await expect(page.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Esc back", exact: true })).toBeVisible();

  // Escape is the same press the legend makes — the directive doubles as the button, which is
  // what round 20 asked for in the first place. The address named no door, and a bookmark
  // cannot know one, so the way out is the Library's list — where the app's lists live.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Add", exact: true })).toBeVisible();

  // A preset is a record too, and its page *is* its editor, so its dead end is the editor's
  // own "gone" rather than a read-only page that does not exist.
  await page.goto("/record?kind=presets&id=11111111-1111-7111-8111-111111111111");
  await expect(page.getByText("That record is gone.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Esc back", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add", exact: true })).toBeVisible();
});

test("refuses to save a preset without a name", async ({ page }) => {
  await page.goto("/library");
  await libraryTab(page, "Presets").click();
  await page.getByRole("button", { name: "Add preset" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  // It stays on the screen with the reason, rather than writing a nameless sound.
  await expect(page.getByText(/name/i).first()).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Preset name" })).toBeVisible();
});

test("keeps a symbol's picture across a library save", async ({ page }) => {
  await page.goto("/database");
  await databaseTable(page, "Symbols").click();
  // A symbol's picture is a column of the Symbols table now, so it is set in the
  // grid — and the `Save` right after it is the race that column has to survive.
  await page.getByLabel("Rama picture").setInputFiles({
    name: "rama.png",
    mimeType: "image/png",
    buffer: Buffer.from(PNG_1X1, "base64"),
  });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // Back on the browse list the card carries the picture, and so does the page.
  await page.goto("/library");
  await libraryTab(page, "Symbols").click();
  await expect(page.getByRole("img", { name: "Rama" })).toBeVisible();
  await page.reload();
  await libraryTab(page, "Symbols").click();
  await expect(page.getByRole("img", { name: "Rama" })).toBeVisible();
});

test("the three library surfaces the owner asked about", async ({ page }) => {
  // Round 14, three arrangements measured on the screen they belong to:
  //  - the view switch belongs at the right edge, not beside `Add`
  //  - the Audio files tab offers real buttons, not two native file inputs
  //  - `Restore catalog` is a button, not a full-width bar that reads as a
  //    divider between two displays
  await page.goto("/library");
  const main = (await page.locator("main").boundingBox())!;
  const add = (await page.getByRole("button", { name: "Add", exact: true }).boundingBox())!;
  const view = (await page.getByRole("button", { name: "Table", exact: true }).boundingBox())!;
  expect(add.x, "Add leads the row").toBeLessThan(view.x);
  expect(
    main.x + main.width - (view.x + view.width),
    "the switch sits at the right edge of the page",
  ).toBeLessThan(40);

  await libraryTab(page, "Audio files").click();
  await expect(page.getByRole("button", { name: "Add ambient audio" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add alarm audio" })).toBeVisible();

  await libraryTab(page, "Plans").click();
  const restore = (await page.getByRole("button", { name: "Restore catalog" }).boundingBox())!;
  expect(restore.width, "a button's width, not the page's").toBeLessThan(main.width / 2);
});
