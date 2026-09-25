import { expect, test, type Page } from "@playwright/test";

/**
 * The Database tab's own behaviour (§5–§7).
 *
 * The library's spec covers what the browse pages show; this one covers the grid
 * and the Archive — the two screens that write. Everything here is asserted the
 * way a reader sees it: names, roles and the sentences the app prints.
 */

/** The Database, with the one-time hint out of the way. */
async function openDatabase(page: Page): Promise<void> {
  await page.goto("/database");
  const gotIt = page.getByRole("button", { name: "Got it" });
  if (await gotIt.isVisible().catch(() => false)) await gotIt.click();
  await expect(page.locator('[data-table="entries"]')).toBeVisible();
}

/**
 * A tab of the library's own strip.
 *
 * Scoped, because the Database's *table* switcher repeats two of those words:
 * `Symbols` is both a screen of the library and one of its tables.
 */
function libraryTab(page: Page, name: string) {
  return page.locator("nav").getByRole("button", { name, exact: true });
}

/**
 * One of the Database's tables, scoped to the switcher's own rail.
 *
 * The strip is generated now — one table per live type, then the fixed ones — so
 * a table's name is a type's name, and the library's tab strip carries the same
 * words. Scoping is what keeps the two apart.
 */
function databaseTable(page: Page, name: string) {
  return page.locator("[data-database-tables]").getByRole("button", { name, exact: true });
}

/** A destination of the app's nav bar, which is how the Database is reached now. */
function appTab(page: Page, name: string) {
  return page.getByRole("navigation", { name: "App" }).getByRole("link", { name, exact: true });
}

/**
 * Every test here drives a 35-row grid, and most end with a `Save` and a `reload`
 * — a route the dev server may still be compiling, with three workers arriving at
 * once. That is three times the work of a typical test, timed as though it were
 * the same size: measured 2026-09-18, these lose their 30s budget about one run in
 * three under the whole suite, and did so before this round's change. The same
 * remedy the Display test got (`0244b89`); no assertion is relaxed.
 */
test.beforeEach(() => {
  test.slow();
});

/**
 * Karuna's rows, in the order the stack draws them.
 *
 * The meditation is a **heading** now (§5.1), so a row is one symbol under one
 * heading and the stack draws them heading by heading: this is what a test means
 * when it says "the rows, in order". A heading's own invitation row is not one of
 * them — it carries no grip — and neither heading nor invitation is counted.
 */
function rows(page: Page) {
  return page
    .locator("[data-karuna-group] tbody tr")
    .filter({ has: page.getByRole("button", { name: "Drag row" }) });
}

/**
 * The armed box: **Archive** and **Remove**, under the row they belong to.
 *
 * It is a row of its own since the owner's round 20 — *"drag and remove row should be
 * innate to the row itself"* — because a box that says what it would take with it needs
 * room, and the row's own controls are three glyphs in its last cell. Only one row can
 * be armed at a time, so there is one of these.
 */
function rowBox(page: Page) {
  return page.locator("[data-row-box]");
}

/**
 * The symbol chips of Karuna's rows, in the order the stack draws them — one per
 * row.
 *
 * Scoped to the groups, because a chip sits inside the heading it belongs to: read
 * group by group, the list below is the stack's own order. The selector that used
 * to sit above the first table was a chip too, and the owner's round 22 removed it.
 */
function chips(page: Page) {
  return page.locator("[data-karuna-group]").getByRole("button", { name: /— open or clear$/ });
}

/**
 * Which heading each row hangs under, read off the group it is drawn in.
 *
 * A row's meditation is no longer a chip on the row, so this is the only way to
 * say from the outside what a row belongs to — and a drop that silently moved a
 * row between headings would be a reassociation, which is what §5.1 forbids.
 */
async function headings(page: Page): Promise<(string | null)[]> {
  return chips(page).evaluateAll((buttons) =>
    buttons.map(
      (button) => button.closest("[data-karuna-group]")?.getAttribute("data-karuna-group") ?? null,
    ),
  );
}

/** The button that opens one chip's little menu: `Change <what it looks for>`. */
function chipOpener(page: Page, looks: string) {
  return page.locator('[data-table="entries"]').getByRole("button", { name: looks }).first();
}

/** Drag one element onto another, with the mouse, the way a reader would. */
async function dragOnto(page: Page, from: ReturnType<Page["getByRole"]>, to: ReturnType<Page["getByRole"]>) {
  const source = await from.boundingBox();
  const target = await to.boundingBox();
  expect(source, "the handle to drag").not.toBeNull();
  expect(target, "where it is dropped").not.toBeNull();
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  await page.mouse.down();
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2 + 12, {
    steps: 4,
  });
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
}

test("a dragged row keeps the place it was dropped in, across a save and a reload", async ({
  page,
}) => {
  await openDatabase(page);
  const before = await chips(page).allInnerTexts();
  // The stack reads heading by heading now (the owner's round 16), so the first
  // rows are one meditation's own — that *is* the grouping — and it is the
  // *symbols* that make the swap legible from the labels alone.
  const grouped = await headings(page);
  expect(grouped[0], "the first two rows are one meditation").toBe(grouped[1]);
  expect(before[0], "and they are two rows with a symbol each").not.toBe(before[1]);
  // The stack is headings, plural — a chakra is more than one row, so the drop has
  // to land inside one of them and leave the others where they are.
  expect(new Set(grouped).size, "the stack draws more than one heading").toBeGreaterThan(1);

  await dragOnto(
    page,
    page.getByRole("button", { name: "Drag row" }).nth(0),
    page.getByRole("button", { name: "Drag row" }).nth(1),
  );
  const afterDrag = await chips(page).allInnerTexts();
  expect(afterDrag[0], "the row came up one place").toBe(before[1]);
  // And it stayed under its own heading: a drop that crossed a heading would
  // re-associate the row, which is a data change disguised as an order change
  // (§5.1). Every row keeps the heading it had.
  expect(await headings(page), "the drop did not move a row between headings").toEqual(grouped);

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.reload();
  await expect(page.locator('[data-table="entries"]')).toBeVisible();
  expect(await chips(page).allInnerTexts(), "the order survived the reload").toEqual(afterDrag);
});

test("a dragged line is written the same way", async ({ page }) => {
  await openDatabase(page);
  // The first row's own lines, in the order the cell draws them.
  const first = page.locator('[data-table="entries"] tbody tr').first();
  const lines = first.locator('input');
  const before = await lines.evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).value),
  );
  expect(before.length, "the seeded row has more than one intention").toBeGreaterThan(1);

  await dragOnto(
    page,
    page.getByRole("button", { name: "Drag line" }).nth(0),
    page.getByRole("button", { name: "Drag line" }).nth(1),
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.reload();
  await expect(page.locator('[data-table="entries"]')).toBeVisible();
  const after = await page
    .locator('[data-table="entries"] tbody tr')
    .first()
    .locator("input")
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
  expect(after[0]).toBe(before[1]);
});

test("a row's + inserts a row where it is pressed, and leaves it there", async ({ page }) => {
  await openDatabase(page);
  const before = await chips(page).allInnerTexts();

  await rows(page).first().getByRole("button", { name: "Insert a row here" }).click();
  const inserted = await chips(page).allInnerTexts();
  expect(inserted.length).toBe(before.length + 1);
  // What is left to choose is the **symbol**: the heading above the new row is its
  // meditation already, and that is a reference like any other, so the row is
  // storable as the meditation's own — the row its `Intentions` cell writes into
  // (§5.3). Nothing is chosen yet, which is the state the old grid's empty pair
  // was in too.
  expect(inserted[0], "the new row is at the top, with nothing chosen yet").toBe("＋ symbol");
  expect(inserted[1], "and the row it was inserted before follows it").toBe(before[0]);

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.reload();
  await expect(page.locator('[data-table="entries"]')).toBeVisible();
  const kept = await chips(page).allInnerTexts();
  expect(kept[0]).toBe("＋ symbol");
  expect(kept[1]).toBe(before[0]);
});

test("a row left with nothing to point at is not stored", async ({ page }) => {
  await openDatabase(page);
  // The grid as the reader had it a moment ago. This is what "nothing else changed"
  // is measured against: the old assertion compared the stored rows themselves, and
  // a reload has to find them all where they were.
  const whole = await chips(page).allInnerTexts();
  // A row now belongs to the heading it was made under, so the one row a reader can
  // leave with nothing on it is one made at a heading that names no meditation: the
  // trailing `No meditation` heading, which is where a sentence associated with a
  // symbol and no meditation lands (§5.1). That row is the old empty pair — neither
  // half chosen — and the store refuses it for exactly the old reason (§4).
  await databaseTable(page, "Affirmations").click();
  await page.getByRole("button", { name: "Add an affirmation" }).click();
  const sentence = page
    .locator('[data-table="affirmations"]')
    .getByRole("textbox", { name: "New affirmation — Affirmation" });
  await sentence.fill("A sentence with a symbol and no meditation");
  await sentence.press("Enter");
  const associated = page
    .locator('[data-table="affirmations"] tbody tr')
    .filter({
      has: page.getByRole("textbox", {
        name: "A sentence with a symbol and no meditation — Affirmation",
      }),
    })
    .first();
  await associated
    .locator('[data-association="symbol"]')
    .getByRole("button", { name: "Change Find a symbol" })
    .click();
  await page.getByRole("combobox", { name: "Find a symbol" }).fill("Zonar");
  await page.getByRole("option", { name: "Zonar" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // Karuna grows the trailing heading, because a row is not dropped for having an
  // empty one — the heading is what names what is missing. It is **appended** to the
  // stack and not a substitute for it: every heading is drawn in series (§5.1), so
  // the nine seeded ones are still there above it. Nothing selects a heading any
  // more (the owner's round 22), so the series is the whole of the order.
  await databaseTable(page, "Karuna").click();
  const unowned = page.locator('[data-karuna-group="none"]');
  await expect(unowned.getByRole("heading", { name: "No meditation" })).toBeVisible();
  expect(
    await chips(page).allInnerTexts(),
    "every heading is still drawn, with the unowned one at the end",
  ).toEqual([...whole, "Zonar"]);

  await unowned.getByRole("button", { name: "Add a row" }).click();
  await expect(chips(page)).toHaveCount(whole.length + 2);

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-table="entries"]')).toBeVisible();
  expect(await chips(page).allInnerTexts(), "nothing to point at, nothing stored").toEqual([
    ...whole,
    "Zonar",
  ]);
});

test("a row that was only inserted can be removed with the two-press control", async ({ page }) => {
  // The owner's round 14: `Remove` did nothing — and the box never opened — for a
  // row inserted in the middle or at the foot. Both are rows the store has never
  // seen, and `deleteEntry` answers a row it cannot find by returning, so the
  // press looked dead and the row stayed on screen. The arm is asserted first,
  // because "it is not armed" was the other half of the report.
  await openDatabase(page);
  const before = await chips(page).allInnerTexts();

  // Mid-table: the row's own `+`, which is the one that has to carry the new row
  // up to the place it was inserted at.
  await rows(page).first().getByRole("button", { name: "Insert a row here" }).click();
  await expect(chips(page)).toHaveCount(before.length + 1);
  const inserted = rows(page).first();
  await inserted.hover();
  await inserted.getByRole("button", { name: "Remove this row" }).click();
  const draftBox = rowBox(page);
  await expect(draftBox.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
  // There is nothing to archive about a row the store has never seen, so the box
  // offers the one action that means something and says why.
  await expect(draftBox.getByRole("button", { name: "Archive", exact: true })).toHaveCount(0);
  await expect(draftBox.getByText("Not saved yet")).toBeVisible();
  await draftBox.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(chips(page), "the inserted row is gone").toHaveCount(before.length);

  // At the foot, and here it is the heading's own `＋`: a heading draws the one its
  // rows belong to, so the row is added at that heading's end.
  await page.getByRole("button", { name: "Add a row" }).last().click();
  await expect(chips(page)).toHaveCount(before.length + 1);
  // The row that was just added, not the invitation row below it — the invitation
  // carries neither a grip nor a `×`.
  const foot = rows(page).last();
  await foot.hover();
  await foot.getByRole("button", { name: "Remove this row" }).click();
  await rowBox(page).getByRole("button", { name: "Remove", exact: true }).click();
  await expect(chips(page)).toHaveCount(before.length);

  // Nothing was ever written, so a reload finds the grid exactly as it started.
  await page.reload();
  await expect(page.locator('[data-table="entries"]')).toBeVisible();
  expect(await chips(page).allInnerTexts(), "the store never saw either row").toEqual(before);
});

test("a stored row a reader removed is still gone after a reload", async ({ page }) => {
  // `P2 · 3`'s slice 3 (`DECISIONS.md` §12): a delete on this device is a **mark** on the
  // row rather than a removal, so that it can travel to the other device. The screen
  // patches the row out of its own list either way — which is why this test asks the
  // store again instead: a reload is what proves the reads leave the marked rows out,
  // and a read that forgot would draw the row back as though nothing had happened.
  await openDatabase(page);
  const before = await chips(page).allInnerTexts();
  const target = rows(page).last();

  // A **stored** row's `×` is the box that offers both, which is the label it carries
  // (`DatabaseTable.tsx`: a row the store already holds can be archived, and one it has
  // never seen cannot). Both are immediate — there is no `Save` in this path.
  await target.hover();
  await target.getByRole("button", { name: "Archive this row, or remove it" }).click();
  const storedBox = rowBox(page);
  await expect(storedBox.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
  await storedBox.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(chips(page), "the row left the grid").toHaveCount(before.length - 1);

  await page.reload();
  await expect(page.locator('[data-table="entries"]')).toBeVisible();
  expect(await chips(page).allInnerTexts(), "and the store does not offer it again").toEqual(
    before.slice(0, -1),
  );
});

/**
 * The grid's own visual rule, guarded — the one the owner's review was about
 * ("I was hoping to get a table like view … it doesn't look like notion at all").
 *
 * A cell at rest is **text**: no border, no fill. Its box appears only with the
 * press. And a row's controls are quiet until the pointer or the keyboard is
 * there, which is what turned a wall of permanently-drawn buttons into a table.
 * Both halves are asserted as computed style, because that is exactly what
 * changed: the roles, the names and the DOM were never the problem.
 */
test("a cell is text until it is live, and a row's controls wait for the pointer", async ({
  page,
}) => {
  await openDatabase(page);
  // Dismissing the hint can leave the pointer over a row — and a hovered row is
  // the one state this test is not asking about. (A `pointer-fine` control fades
  // in over 150ms, so a stray hover also reads as a half-finished assertion.)
  await page.mouse.move(5, 5);
  const row = page.locator('[data-table="entries"] tbody tr').first();
  const cell = row.locator("input").first();
  const handle = row.getByRole("button", { name: "Drag row" });

  // At rest: no box around the value, and the grip is not drawn.
  await expect(cell).toHaveCSS("border-top-width", "0px");
  await expect(cell).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(handle).toHaveCSS("opacity", "0");

  // The keyboard is the second way in: focusing the cell reveals its row's grip
  // and gives the cell a box of its own.
  await cell.focus();
  await expect(handle).toHaveCSS("opacity", "1");
  await expect(cell).toHaveCSS("background-color", "rgb(23, 18, 13)");

  // Away from it, the grid is a table again — and the pointer is the first way in.
  await page.getByRole("button", { name: "Karuna", exact: true }).click();
  await expect(cell).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(handle).toHaveCSS("opacity", "0");
  await handle.hover();
  await expect(handle).toHaveCSS("opacity", "1");
});

/**
 * A row's controls are the row's own, and the row is the press that opens it.
 *
 * The owner's round 20, quoted: *"the 1st column is the open button, drag handle and
 * remove row. This needs to go, it is occupying space we don't have today … ideally,
 * drag and remove row should be innate to the row itself, open actually opens the
 * table's key menu."* So the leading cell is gone, a row's first cell is its first
 * column again, and the controls sit in the one cell the table already had for lining
 * up its right edge.
 *
 * The pin §12.27 asked for went with the column — the owner chose that shape when the
 * options were put to them — so the second half of this test is deliberately the
 * opposite of what it used to assert: the name travels with the columns beside it.
 */
test("a row carries its own controls, and the row is the press that opens it", async ({
  page,
}) => {
  // Narrower than the suite's default, so the table certainly overflows and the scroll
  // half of this test means something: a table that does not scroll cannot show it.
  await page.setViewportSize({ width: 900, height: 720 });
  await openDatabase(page);
  await databaseTable(page, "Chakras").click();
  await page.mouse.move(5, 5);

  const table = page.locator('[data-table="meditation"]');
  // No controls column: no `Row` heading, and the row's first cell is a cell of the
  // table like any other.
  await expect(table.getByRole("columnheader", { name: "Row", exact: true })).toHaveCount(0);
  const firstRow = table
    .locator("tbody tr")
    .filter({ has: page.getByRole("button", { name: "Drag row" }) })
    .first();
  await expect(firstRow.locator("td").first().getByRole("textbox")).toBeVisible();

  // The controls are the row's, and they are in its **last** cell: the grip and the
  // `×`, drawn when the pointer is on the row (and on a phone, where there is nothing
  // to hover with).
  const controls = firstRow.locator("td").last();
  await firstRow.hover();
  await expect(controls.getByRole("button", { name: "Drag row" })).toBeVisible();
  await expect(
    controls.getByRole("button", { name: "Archive this row, or remove it" }),
  ).toBeVisible();

  // Pressing the row's own surface opens the record — the cell's padding, because
  // every control inside the row keeps its own press. It opens the record's **own** page
  // (the owner's round 22): it reads first, and its `Edit` is what turns it into its
  // editor in place, on the same screen and at the same address.
  await firstRow.locator("td").first().click({ position: { x: 1, y: 1 } });
  await expect(page.getByRole("heading", { name: "Third-Eye Chakra" })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Meditation name" })).toHaveValue(
    "Third-Eye Chakra",
  );
  // And `Esc` leaves the record for the door it came through — this grid — which is what
  // `from` in the address is for.
  await page.getByRole("button", { name: "Esc back", exact: true }).click();
  await expect(table).toBeVisible();
  await expect(page.getByRole("heading", { name: "Third-Eye Chakra" })).toHaveCount(0);

  // …and the keyboard makes the same press from the grid, because the row is what
  // carries it.
  await page.goto("/database");
  await databaseTable(page, "Chakras").click();
  const again = table
    .locator("tbody tr")
    .filter({ has: page.getByRole("button", { name: "Drag row" }) })
    .first();
  await again.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Third-Eye Chakra" })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);

  // Back to the grid for the geometry half.
  await page.goto("/database");
  await databaseTable(page, "Chakras").click();
  await expect(table).toBeVisible();

  // What a row **is** stays at the left edge: scrolling the table sideways leaves the
  // name where it was, which is the owner's round 14 ask, reversed in round 20 and
  // reversed back in round 21 — *"Pin Name so it stays visible"*.
  const nameHeader = table.getByRole("columnheader", { name: "Name", exact: true });
  const nameBefore = (await nameHeader.boundingBox())!;
  const scrolled = await table.locator("table").evaluate((element) => {
    const scroller = element.parentElement as HTMLElement;
    scroller.scrollLeft = scroller.scrollWidth;
    return scroller.scrollLeft;
  });
  expect(scrolled, "a chakra's table is wider than the room it has").toBeGreaterThan(0);
  const nameAfter = (await nameHeader.boundingBox())!;
  expect(
    Math.abs(nameBefore.x - nameAfter.x),
    "the name stayed put while the columns beside it moved",
  ).toBeLessThan(2);
  // And the cells under it moved, or the pin would be a table that does not scroll.
  const nameCell0 = (await table
    .locator("tbody tr")
    .filter({ has: page.getByRole("button", { name: "Drag row" }) })
    .first()
    .locator("td")
    .first()
    .boundingBox())!;
  expect(Math.abs(nameBefore.x - nameCell0.x), "the pinned heading sits over its cells").toBeLessThan(
    40,
  );

  // …but the row's own controls did not travel: they stay at the right edge, and that
  // is the half of this shape the first cut got wrong — in an ordinary last cell they
  // scrolled out of the viewport with everything else, so drag and remove became
  // unreachable on a table wider than its room.
  const grip = (await controls.getByRole("button", { name: "Drag row" }).boundingBox())!;
  const view = (await table.boundingBox())!;
  expect(grip.x, "the controls are still on screen").toBeGreaterThan(view.x);
  expect(grip.x + grip.width).toBeLessThanOrEqual(view.x + view.width + 1);
});

/**
 * One store, so an edit made anywhere is visible everywhere.
 *
 * Two of the owner's round-20 reports were about this and disagreed about which side was
 * stale — *"If Database's information is updated from the tables, the library's open view
 * should be updated as well"*, and *"information updated in the table for intentions …
 * isn't updated in the database's open item page's view but properly updated in the
 * library's open view"*. With one page and one editor there is one thing to check, and
 * it is checked from the door the reports came through: a cell in the grid.
 */
test("an edit made in the grid is what the record's page and editor both read", async ({
  page,
}) => {
  await openDatabase(page);
  await databaseTable(page, "Chakras").click();
  const location = page.getByRole("textbox", { name: "Root Chakra — Location" });
  await location.fill("Beneath the spine, edited");
  await location.press("Enter");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // The row press opens the library's page, which reads the store — so the value the
  // grid just wrote is on it.
  const row = location.locator("xpath=ancestor::tr");
  await row.hover();
  await row.locator("td").last().click({ position: { x: 4, y: 4 } });
  await expect(page.getByRole("heading", { name: "Root Chakra" })).toBeVisible();
  await expect(page.getByText(/Beneath the spine, edited/)).toBeVisible();

  // …and `Edit` opens the one editor, which reads the same store and holds the fields
  // the grid has no column for — the owner's *"the option to edit these items should be
  // available from the library's item's edit button"*. `Governs` is the editor's own
  // field (a `<span>` label), not the custom field the workspace seeds under the same
  // name (an `<h2>` section).
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Location", exact: true })).toHaveValue(
    "Beneath the spine, edited",
  );
  await expect(
    page.locator("span.text-lg.text-muted").filter({ hasText: /^Governs$/ }),
  ).toBeVisible();
});

/**
 * The binaural cell, which the owner asked to be the toggle alone.
 *
 * `Tune` stood beside the switch in a cell wide enough for both; it belongs with
 * the sound it tunes, which is what it opens (§5.4).
 */
test("the binaural cell is the switch alone, and Tune sits with the sound", async ({ page }) => {
  await openDatabase(page);
  await databaseTable(page, "Chakras").click();
  await page.mouse.move(5, 5);
  const row = page.locator('[data-table="meditation"] tbody tr').first();
  const toggle = row.getByRole("button", { name: "Binaural", exact: true });
  const tune = row.getByRole("button", { name: "Tune", exact: true });

  // The cell is the switch and nothing else — which is what its width was for.
  await expect(toggle).toHaveCount(1);
  expect(
    await toggle
      .locator("xpath=ancestor::td[1]")
      .evaluate((cell) => cell.querySelectorAll("button").length),
    "the binaural cell draws the switch and no second control",
  ).toBe(1);
  // And `Tune` is in an earlier cell, the sound's, so the two are not neighbours.
  expect(
    await tune.evaluate((element) => element.closest("td")!.cellIndex),
    "Tune sits with the sound it tunes, not with the switch",
  ).toBeLessThan(await toggle.evaluate((element) => element.closest("td")!.cellIndex));

  // A row whose default sound is not a preset still gets the button, because the
  // screen it opens edits the *meditation* rather than the chip: a row made here has
  // no sound yet, and `Tune` opens the config on an empty draft. The seeded rows all
  // name a preset, so this is the way to a row without one.
  await page.getByRole("button", { name: "Add a meditation" }).click();
  const name = page.getByRole("textbox", { name: "New record — Name" });
  await name.fill("Navel");
  await name.press("Enter");
  const added = page.getByRole("textbox", { name: "Navel — Name" }).locator("xpath=ancestor::tr");
  await added.hover();
  await added.getByRole("button", { name: "Tune", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Binaural · Navel" })).toBeVisible();
  await expect(page.getByLabel("Preset name")).toHaveValue("");
});

test("the + adds a column in place, with a heading to type into", async ({ page }) => {
  await openDatabase(page);
  // Karuna is one table per meditation, so the `＋` is pressed on the heading the
  // column is wanted under — a reader's own columns are the table's, and every one
  // of its headings draws them (the owner's round 16).
  const first = page.locator("[data-karuna-group]").first();
  await first.getByRole("button", { name: "Add a column at the end" }).click();

  // The owner's ask: no form at the foot of the page — the column is *there*, its
  // heading is a text box with the caret already in it, and its cells are under it.
  const heading = first.getByRole("textbox", { name: "New column heading" });
  await heading.fill("Element");
  await heading.press("Enter");
  await expect(first.getByRole("textbox", { name: "Element column heading" })).toHaveValue(
    "Element",
  );

  // The cells are live without a second step.
  const cell = first.locator("tbody tr").first().locator('input[aria-label$="— Element"]');
  await cell.fill("Air");
  await cell.press("Enter");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // Stored with the heading and the value, and still a column of the table.
  await page.reload();
  await expect(page.locator('[data-table="entries"]')).toBeVisible();
  const reloaded = page.locator("[data-karuna-group]").first();
  await expect(reloaded.getByRole("textbox", { name: "Element column heading" })).toHaveValue(
    "Element",
  );
  await expect(
    reloaded.locator("tbody tr").first().locator('input[aria-label$="— Element"]'),
  ).toHaveValue("Air");
});

test("a new chakra is a row in the grid, not a page", async ({ page }) => {
  await openDatabase(page);
  await page.getByRole("button", { name: "Chakras", exact: true }).click();
  const rows = page.locator('[data-table="meditation"] tbody tr');
  const before = await rows.count();

  // The row invitation names the *catalogue row*, not the type: the table belongs
  // to a type now, and a type's name is plural, so "Add a chakras" is what naming
  // the table would read as (the owner's round 15).
  await page.getByRole("button", { name: "Add a meditation" }).click();
  await expect(rows).toHaveCount(before + 1);
  // The row arrives to be filled in, with the caret in its name — and a chakra's
  // own settings are columns beside it rather than fields on a form.
  await expect(page.getByRole("columnheader", { name: "Picture" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Binaural" })).toBeVisible();
  const name = page.getByRole("textbox", { name: "New record — Name" });
  await name.fill("Navel");
  await name.press("Enter");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.reload();
  await expect(page.locator('[data-table="meditation"]')).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Navel — Name" })).toHaveValue("Navel");
});

test("a name the search bar cannot find is offered as a new symbol, and chosen", async ({
  page,
}) => {
  await openDatabase(page);
  await chipOpener(page, "Change Find a symbol").first().click();
  const search = page.getByRole("combobox", { name: "Find a symbol" });
  await search.fill("Nova");
  // The create row is what an unmatched name gets — never the nearest-looking
  // option (§6.2).
  await expect(page.getByRole("button", { name: "Add “Nova”" })).toBeVisible();
  await search.press("Enter");

  // The record is written at once and the cell chooses it; the cell's own value
  // still waits for `Save` like everything else on the screen.
  await expect(chips(page).nth(0), "the new symbol is chosen for the cell").toHaveText("Nova");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // It is a record like any other: the library's Symbols tab lists it.
  await page.goto("/library");
  await libraryTab(page, "Symbols").click();
  await expect(page.getByRole("button", { name: "Open Nova" })).toBeVisible();
});

test("the chip's X clears the reference it is on, and nothing else", async ({ page }) => {
  await openDatabase(page);
  // A Karuna row carries one chip now — its **symbol** — because the meditation is
  // the heading above it (§5.1). A press on the `×` clears that half and leaves the
  // row in place as the meditation's own, which is the row the chakra's `Intentions`
  // cell writes into instead of a second one.
  const firstRow = rows(page).first();
  const linesBefore = await firstRow.locator("input").count();
  const before = await chips(page).allInnerTexts();

  // The chip itself, in the first row — the same symbol can be worn by several
  // rows, and only this one is what the press is about.
  await firstRow.getByRole("button", { name: `${before[0]} — open or clear` }).click();
  await page.getByRole("button", { name: "✕ Clear" }).click();

  const after = await chips(page).allInnerTexts();
  expect(after[0]).toBe("＋ symbol");
  expect(after[1], "only the first row's symbol was cleared").toBe(before[1]);
  // §4: clearing a reference never archives and never deletes. The row is still
  // there, with its intentions.
  expect(await firstRow.locator("input").count()).toBe(linesBefore);

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-table="entries"]')).toBeVisible();
  const kept = await chips(page).allInnerTexts();
  expect(kept[0]).toBe("＋ symbol");
  expect(kept[1]).toBe(before[1]);
});

test("archiving a chakra takes its plan block out, and Restore brings it back", async ({
  page,
}) => {
  // Two navigations to `/plan` and two to `/library` — routes the dev server may
  // still be compiling, with three workers arriving at once — on top of a 35-row
  // grid, an archive and a restore: three times the work of a typical test, timed
  // as though it were the same size. **Measured 2026-09-18: it loses that budget
  // on `main` before this round's change too, about one run in three.** This is
  // the harness, not the app, and it is the same remedy the Display test got
  // (`0244b89`); no assertion is relaxed.
  test.slow();
  await openDatabase(page);
  // Third-Eye Chakra heads the seeded plan, so its block is the first thing to
  // look for once it is gone.
  await page.getByRole("button", { name: "Chakras", exact: true }).click();
  // A record table's cells are boxes with names of their own, so the row is found
  // by the cell that holds its name (§6.2).
  const chakraRow = page
    .getByRole("textbox", { name: "Third-Eye Chakra — Name" })
    .locator("xpath=ancestor::tr");
  await expect(chakraRow).toHaveCount(1);

  // The row's `×` opens the box that names what goes; `Archive` in it is one tap
  // (§4, §12.22).
  await chakraRow.getByRole("button", { name: "Archive this row, or remove it" }).click();
  const chakraBox = rowBox(page);
  await expect(chakraBox.getByRole("button", { name: "Archive", exact: true })).toBeVisible();
  await expect(chakraBox.locator("p.text-destructive")).toContainText(/plan|intention|row/);
  await chakraBox.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Third-Eye Chakra — Name" }),
  ).toHaveCount(0);

  // The plan loses the block, and the other blocks stay where they were.
  await page.goto("/plan");
  await expect(page.getByRole("button", { name: "Drag Third-Eye Chakra block" })).toHaveCount(0);

  // Restore, from the Archive page, and the block comes back.
  await page.goto("/library");
  await libraryTab(page, "Archive").click();
  const archived = page.locator("li").filter({ hasText: "Third-Eye" }).first();
  await expect(archived).toBeVisible();
  await archived.getByRole("button", { name: "Restore" }).click();  await expect(page.getByText("Nothing archived — items you archive appear here.")).toBeVisible();

  await page.goto("/plan");
  await expect(page.getByRole("button", { name: "Drag Third-Eye Chakra block" })).toBeVisible();
});

test("leaving with unsaved edits is interrupted, and leaving clean is not", async ({ page }) => {
  await openDatabase(page);
  // A committed cell edit is what makes the draft dirty — `Enter` is the
  // gesture that commits one (the same key the grid has always used).
  const cell = page.locator('[data-table="entries"] tbody tr').first().locator("input").first();
  await cell.fill("A line the reader has not saved");
  await cell.press("Enter");

  await expect(page.getByText("Unsaved changes")).toBeVisible();
  let asked = "";
  page.once("dialog", (dialog) => {
    asked = dialog.message();
    void dialog.dismiss();
  });
  await page.getByRole("button", { name: "Esc back", exact: true }).click();
  await expect.poll(() => asked).toContain("discard");
  // Dismissed, so the reader is still in the Database with the edit intact.
  await expect(page.locator('[data-table="entries"]')).toBeVisible();

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Esc back", exact: true }).click();
  await expect(page).toHaveURL(/\/library/);
  await expect(page.getByRole("button", { name: "Add", exact: true })).toBeVisible();

  // The nav bar is the other way out of the Database, and it asks the same
  // question: a press it refuses leaves the reader where they are.
  await appTab(page, "Database").click();
  const cellAgain = page.locator('[data-table="entries"] tbody tr').first().locator("input").first();
  await cellAgain.fill("Still not saved");
  await cellAgain.press("Enter");
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  page.once("dialog", (dialog) => void dialog.dismiss());
  await appTab(page, "Library").click();
  await expect(page.locator('[data-table="entries"]')).toBeVisible();

  // Clean, it just goes: no question, no report.
  page.once("dialog", (dialog) => void dialog.accept());
  await appTab(page, "Library").click();
  await expect(page).toHaveURL(/\/library/);
  await expect(page.getByRole("button", { name: "Add", exact: true })).toBeVisible();
  await page.goto("/database");
  await expect(page.getByText("Unsaved changes")).toHaveCount(0);
  await page.getByRole("button", { name: "Esc back", exact: true }).click();
  await expect(page).toHaveURL(/\/library/);
  await expect(page.getByRole("button", { name: "Add", exact: true })).toBeVisible();
});

test("Esc cancels the cell it is in, and never leaves the screen in the same press", async ({
  page,
}) => {
  await openDatabase(page);
  const cell = page.locator('[data-table="entries"] tbody tr').first().locator("input").first();
  const stored = await cell.inputValue();

  await cell.fill("half-typed");
  await cell.press("Escape");
  await expect(cell, "the cell went back to what it holds").toHaveValue(stored);
  // §12.25: the press did not also mean "leave". The grid is still up, and the
  // change never reached the draft, so Save has nothing to offer.
  await expect(page.locator('[data-table="entries"]')).toBeVisible();
  await expect(page.getByText("Unsaved changes")).toHaveCount(0);

  // A press with no cell open is the one that goes back. Escape leaves the
  // Database for the library, so the address is asserted before the screen is:
  // the two are a route change apart, not a repaint.
  await page.getByRole("button", { name: "Karuna", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/library/);
  await expect(page.getByRole("button", { name: "Add", exact: true })).toBeVisible();
});

/**
 * The owner's ask, §12.16 and §6: *"every type is pickable; there is no 'usable in
 * a plan' switch"*, and a type added later gets its own tab, its own table and its
 * own columns **with nothing to register**.
 *
 * This is that sentence as a test. It adds a type through the Types table — the one
 * surface that writes one — and then asserts that the two generated surfaces, the
 * library's tab strip and the Database's table switcher, both grew. The second half
 * renames the type and asserts the tab follows the *name*, which is what says the
 * tab id is not the name.
 */
test("a type added in the grid gets its own tab and its own table", async ({ page }) => {
  await openDatabase(page);
  await databaseTable(page, "Types").click();
  await expect(page.locator('[data-table="types"]')).toBeVisible();

  await page.getByRole("button", { name: "Add a type" }).click();
  const name = page
    .locator('[data-table="types"]')
    .getByRole("textbox", { name: "New record — Name" });
  await name.fill("Breathwork");
  await name.press("Enter");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // The library: a tab of its own, with the seeded ones still around it.
  await page.goto("/library");
  await expect(libraryTab(page, "Breathwork")).toBeVisible();
  await expect(libraryTab(page, "Chakras")).toBeVisible();
  await libraryTab(page, "Breathwork").click();
  // Empty, because it is a new type and not a second view of the chakras. Scoped
  // to `main`, because the dev server floats its own `Open Next.js Dev Tools`
  // button over the page and an unscoped `/^Open /` matches it.
  await expect(page.locator("main").getByRole("button", { name: /^Open / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add", exact: true })).toBeVisible();

  // The Database: a table of its own, holding the same rows it will hold once the
  // reader adds one. It is a meditation table (§8), not a fifth fixed one.
  await page.goto("/database");
  await databaseTable(page, "Breathwork").click();
  const grid = page.locator('[data-type-id]');
  await expect(grid).toBeVisible();

  // The rename round-trips, and the generated surfaces follow the name rather than
  // the id they were minted with.
  await page.goto("/database");
  await databaseTable(page, "Types").click();
  const cell = page
    .locator('[data-table="types"]')
    .getByRole("textbox", { name: "Breathwork — Name" });
  await cell.fill("Breathwork 2");
  await cell.press("Enter");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.reload();
  await databaseTable(page, "Breathwork 2").click();

  await page.goto("/library");
  await expect(libraryTab(page, "Breathwork 2")).toBeVisible();
  await expect(libraryTab(page, "Breathwork")).toHaveCount(0);
});

/**
 * The Affirmations table (§5.2).
 *
 * It is the one surface for **every** sentence, the orphans included, so its rows
 * are the lines themselves rather than the pairs they hang off: the sentence is the
 * cell a reader types into, and the Association beside it is the pair it is written
 * about. This asserts the two things the reader does with it — writes a sentence,
 * and comes back to a table that still has it — because a sentence has no second
 * cell to notice a wrong write in.
 *
 * A locator here is scoped to the sentence under test rather than to the table's
 * whole `— Affirmation` column: the seeded workspace carries a sentence on every
 * pair, so the column holds scores of them.
 */
test("an affirmation is a sentence the table keeps", async ({ page }) => {
  await openDatabase(page);
  await databaseTable(page, "Affirmations").click();
  await expect(page.locator('[data-table="affirmations"]')).toBeVisible();
  // §3.3: the table is **every** sentence in the workspace, so the seeded pairs'
  // own sentences are already in it and a sentence the reader adds joins them. That
  // is why the locators below name the sentence they mean rather than the table's
  // whole `— Affirmation` column, which holds scores of cells.
  expect(
    await page.locator('[data-table="affirmations"] tbody tr').count(),
    "the seeded sentences are in this table too",
  ).toBeGreaterThan(1);

  // The `Add` invitation is where a sentence of the reader's own starts: the owner
  // seeded no text of theirs, and a sentence they did not write is not one they
  // should be asked to repeat. The row it makes is the empty one, so its cell's name
  // is the one the grid gives a sentence that has no words yet.
  await expect(page.getByRole("button", { name: "Add an affirmation" })).toBeVisible();
  await page.getByRole("button", { name: "Add an affirmation" }).click();
  const cell = page
    .locator('[data-table="affirmations"]')
    .getByRole("textbox", { name: "New affirmation — Affirmation" });
  await cell.fill("I am calm and here");
  await cell.press("Enter");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.reload();
  await databaseTable(page, "Affirmations").click();
  const sentence = page
    .locator('[data-table="affirmations"]')
    .getByRole("textbox", { name: "I am calm and here — Affirmation" });
  await expect(sentence).toHaveValue("I am calm and here");

  // A sentence's `×` is the line's, not a record's, and Archive is a write of its
  // own: the sentence leaves the grid at once, because there is nothing left in the
  // draft to write. The inner locator names the cell and nothing above it, because
  // `filter({ has })` is answered *inside* the row it is testing: an inner locator
  // that started at the table could never match within a `tr` and the filter would
  // quietly find no row at all.
  const row = page
    .locator('[data-table="affirmations"] tbody tr')
    .filter({ has: page.getByRole("textbox", { name: "I am calm and here — Affirmation" }) })
    .first();
  await row.getByRole("button", { name: "Archive this row, or remove it" }).click();
  await expect(rowBox(page).getByRole("button", { name: "Archive", exact: true })).toBeVisible();
  await rowBox(page).getByRole("button", { name: "Archive", exact: true }).click();
  await expect(sentence).toHaveCount(0);

  await page.goto("/library");
  await libraryTab(page, "Archive").click();
  await expect(page.locator("li").filter({ hasText: "I am calm and here" })).toBeVisible();
});

/**
 * A sentence's Association is what puts it in a chakra's table (§5.2).
 *
 * The Affirmations table is the one place an orphan is visible, so the pair it is
 * given here is the pair every other surface reads from: the same row a chakra's own
 * `Intentions` cell edits, and the entry a session's sentences are compiled from
 * (§4). The two chips are the two halves of that pair, and the grid marks which is
 * which — `data-association` — so a test can say which half it is setting.
 */
test("a sentence associated with a chakra keeps its pair across a save and a reload", async ({
  page,
}) => {
  await openDatabase(page);
  await databaseTable(page, "Affirmations").click();
  await page.getByRole("button", { name: "Add an affirmation" }).click();
  const cell = page
    .locator('[data-table="affirmations"]')
    .getByRole("textbox", { name: "New affirmation — Affirmation" });
  await cell.fill("I am grounded here");
  await cell.press("Enter");

  const row = page
    .locator('[data-table="affirmations"] tbody tr')
    .filter({ has: page.getByRole("textbox", { name: "I am grounded here — Affirmation" }) })
    .first();
  await expect(row.locator('[data-association="meditation"]')).toHaveCount(1);
  await expect(row.locator('[data-association="symbol"]')).toHaveCount(1);
  // A chakra on its own is the whole association: that is the sentence a chakra's
  // own table shows, and the symbol's half stays empty.
  await row
    .locator('[data-association="meditation"]')
    .getByRole("button", { name: "Change Find a meditation" })
    .click();
  await page.getByRole("combobox", { name: "Find a meditation" }).fill("Root Chakra");
  await page.getByRole("option", { name: "Root Chakra" }).click();

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.reload();
  await databaseTable(page, "Affirmations").click();
  const kept = page
    .locator('[data-table="affirmations"] tbody tr')
    .filter({ has: page.getByRole("textbox", { name: "I am grounded here — Affirmation" }) })
    .first();
  await expect(
    kept
      .locator('[data-association="meditation"]')
      .getByRole("button", { name: "Root Chakra — open or clear" }),
  ).toBeVisible();
  await expect(
    kept
      .locator('[data-association="symbol"]')
      .getByRole("button", { name: "＋ symbol — open or clear" }),
  ).toBeVisible();
});

/**
 * The owner's first report of round 20, from the point's side.
 *
 * Verbatim: *"I added an affirmation to database/affirmations and then added for thighs (a
 * new point that I created then and there). Thighs was created on the spot, but my intention
 * wasn't … my expectation is that I have added a new intention to the affirmations - when I
 * visit the point that I have associated with that intention should be able to see the
 * intention there in the library."*
 *
 * Three things are asserted here, and the last is the one the report is about: a point made
 * in the Association cell **is a point** (it is in the Points tab, not Chakras), the sentence
 * reaches the store, and the point's own page in the library reads it back. The half that was
 * the screen's fault — a row press leaving the grid without writing the draft — was closed in
 * `2145302` and has its own test above.
 */
test("a point made beside an affirmation is a point, and the affirmation reads on its page", async ({
  page,
}) => {
  await openDatabase(page);
  await databaseTable(page, "Affirmations").click();
  await page.getByRole("button", { name: "Add an affirmation" }).click();
  const cell = page
    .locator('[data-table="affirmations"]')
    .getByRole("textbox", { name: "New affirmation — Affirmation" });
  await cell.fill("My jaw has been released whole and complete");
  await cell.press("Enter");

  const row = page
    .locator('[data-table="affirmations"] tbody tr')
    .filter({
      has: page.getByRole("textbox", {
        name: "My jaw has been released whole and complete — Affirmation",
      }),
    })
    .first();
  // A name no meditation has is offered as one to make, and made here — the same
  // context-aware create the symbol half of this table has had a test for since round 14.
  await row
    .locator('[data-association="meditation"]')
    .getByRole("button", { name: "Change Find a meditation" })
    .click();
  const search = page.getByRole("combobox", { name: "Find a meditation" });
  await search.fill("Jaw");
  await expect(page.getByRole("button", { name: "Add “Jaw”" })).toBeVisible();
  await search.press("Enter");
  await expect(
    row
      .locator('[data-association="meditation"]')
      .getByRole("button", { name: "Jaw — open or clear" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // A **point**: the meditation it made follows the table its cell is in, rather than
  // landing on the reader's first type as a chakra — which is where the owner found it,
  // in the wrong tab, with a chakra's own fields on its page.
  await page.goto("/library");
  await libraryTab(page, "Points").click();
  await expect(page.getByRole("button", { name: "Open Jaw" })).toBeVisible();
  await libraryTab(page, "Chakras").click();
  await expect(page.getByRole("button", { name: "Open Jaw" })).toHaveCount(0);

  // And its page reads the sentence written for it. This is the assertion the report was
  // asking for and that nothing covered: the row a sentence hangs off is the association,
  // and the page draws every row that names the meditation.
  await libraryTab(page, "Points").click();
  await page.getByRole("button", { name: "Open Jaw" }).click();
  await expect(page.getByRole("heading", { name: "Jaw" })).toBeVisible();
  await expect(page.getByText("This meditation on its own")).toBeVisible();
  await expect(page.getByText("My jaw has been released whole and complete")).toBeVisible();
});

test("a filter lives on its column, and two of them are an AND", async ({ page }) => {
  // The owner's round 22: the one box over the table became a filter **per column** —
  // *"Clicking on any column header should convert that into a filter bar … if multiple
  // columns' filters are activated, it should be an 'AND' action"* — with `|` as the OR and a
  // regular expression read as one.
  await openDatabase(page);
  await databaseTable(page, "Symbols").click();
  const table = page.locator('[data-table="symbols"]');
  await expect(table).toBeVisible();
  /** One row, found by the name its own cell carries. */
  const rowNamed = (label: string) =>
    table
      .locator("tbody tr")
      .filter({ has: page.getByRole("textbox", { name: `${label} — Name` }) });

  // A heading's `⌕` opens that column's input, and the input is named for the column.
  await table.getByRole("button", { name: "Open the filter for Name" }).click();
  const name = table.getByRole("textbox", { name: "Filter Name" });
  await expect(name).toBeVisible();
  await name.fill("Halu");
  await expect(rowNamed("Halu")).toHaveCount(1);
  await expect(rowNamed("Gnosa"), "a row the filter does not name is not drawn").toHaveCount(0);
  // The cell is searched, not the row: `Halu`'s *usage* is somebody else's word, and a
  // filter on `Name` cannot see it.
  await expect(rowNamed("Zonar")).toHaveCount(0);

  // `|` is the OR inside one column: both names are drawn again.
  await name.fill("Halu|Gnosa");
  await expect(rowNamed("Halu")).toHaveCount(1);
  await expect(rowNamed("Gnosa")).toHaveCount(1);

  // A second column narrows further, and the two are an AND: `knowledge` is Gnosa's usage
  // and nobody else's, so Halu leaves although the Name filter still names it.
  await table.getByRole("button", { name: "Open the filter for Usage" }).click();
  await table.getByRole("textbox", { name: "Filter Usage" }).fill("knowledge");
  await expect(rowNamed("Gnosa")).toHaveCount(1);
  await expect(rowNamed("Halu"), "two filters are an AND, not an OR").toHaveCount(0);

  // A regular expression is read as one, case-insensitively.
  await name.fill("^gno");
  await expect(rowNamed("Gnosa")).toHaveCount(1);

  // `Escape` in a filter closes **that** filter and stops there: the reader is still in the
  // Database, which is the one-press-one-thing rule every other panel follows (§12.25).
  await name.press("Escape");
  await expect(table.getByRole("textbox", { name: "Filter Name" })).toHaveCount(0);
  await expect(table).toBeVisible();
});
