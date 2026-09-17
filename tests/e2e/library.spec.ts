import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/** A real 1x1 RGBA PNG, so the library accepts it and the browser can paint it. */
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

test("add a focus point in the library without select elements", async ({ page }) => {
  await page.goto("/library");
  await expect(page.getByRole("button", { name: "Add focus point" })).toBeVisible();
  await page.getByRole("button", { name: "Add focus point" }).click();
  await page.getByRole("textbox", { name: "Focus name" }).fill("Navel");
  await page.getByRole("button", { name: "Default sound" }).click();
  await expect(page.getByRole("heading", { name: "Default sound" })).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  // §4.1 — saving opens that focus point's read-only view, not the flat list,
  // and not the editor: what you get back is the thing you made.
  await expect(page.getByRole("heading", { name: "Navel" })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open binaural config" })).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
});

test("library reopens the last section in this tab", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Plans" }).click();
  await expect(page.getByRole("button", { name: "Circuit session" })).toBeVisible();
  await page.goto("/plan");
  await page.goto("/library");
  await expect(page.getByRole("button", { name: "Circuit session" })).toBeVisible();
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
  };
  expect(backup.schemaVersion).toBe(4);
  expect(backup.plans.some((p) => p.name === "Circuit session" && p.blocks.length > 0)).toBe(
    true,
  );
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
        focusPoints: [
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
        tableViews: [],
        presets: [],
        mediaAssets: [],
        plans: [],
      }),
    ),
  });
  await expect(page.getByText("Imported focus")).toBeVisible();
});

test("history counts sessions completed this week", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByText("Sessions completed this week: 0")).toBeVisible();
});

test("duplicate copies a preset onto a new sound", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Presets" }).click();
  // `Duplicate` lives on the card now, next to `Edit` (the owner's round 5).
  await page.getByRole("button", { name: "Duplicate Solfeggio Root 396/8" }).click();
  await expect(page.getByRole("button", { name: "Edit Solfeggio Root 396/8 copy" })).toBeVisible();
});

test("the preset editor holds the sound under the name", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Presets" }).click();
  await page.getByRole("button", { name: "Edit Solfeggio Root 396/8" }).click();
  await expect(page.getByRole("textbox", { name: "Preset name" })).toBeVisible();
  // The tuner is inline: tones, EQ and fades are on this screen, and there is no
  // `Open tuner` button and no `L1/R1 tones` heading to walk past.
  await expect(page.getByRole("button", { name: "Add tone (1/16)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open tuner" })).toHaveCount(0);
  await expect(page.getByText(/tones$/, { exact: false })).toHaveCount(0);
  // …and Back returns to the list, which is what the separate route lacked.
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("button", { name: "Edit Solfeggio Root 396/8" })).toBeVisible();
});

test("chakra focus points show the chakra-only fields", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Add focus point" }).click();
  const chakra = page.getByRole("button", { name: "Chakra", exact: true });
  const point = page.getByRole("button", { name: "Point", exact: true });
  // Three fixed choices inside a form are a control, not page furniture: the
  // compact row, with the chosen one named for a screen reader. They were 64px
  // tiles until the owner's round 8, library item 1.
  const tile = (await chakra.boundingBox())!;
  expect(tile.height, "a control, not a tile").toBeLessThan(56);
  await chakra.click();
  await expect(chakra).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Governs")).toBeVisible();
  await expect(page.getByText("Element")).toBeVisible();
  await point.click();
  await expect(point).toHaveAttribute("aria-pressed", "true");
  await expect(chakra).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("Governs")).toHaveCount(0);
  await expect(page.getByText("Element")).toHaveCount(0);
});

test("the Esc hint sits with the screen's action, wherever that is", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Open Root Chakra" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  // Round 8, library item 2: beside the save button, in the bar that survives
  // scrolling — not up beside the title, which is where it used to be.
  const bar = page.getByRole("button", { name: "Save", exact: true }).locator("xpath=..");
  await expect(bar.getByText("Esc", { exact: true })).toBeVisible();
  await expect(bar.getByText("back", { exact: true })).toBeVisible();
  // A picker has no bottom bar; its primary action is `Choose`, and the legend
  // sits with it rather than with the title.
  await page.getByRole("button", { name: "Add symbol" }).click();
  const pickerBar = page.getByRole("button", { name: "Choose" }).locator("xpath=..");
  await expect(pickerBar.getByText("Esc", { exact: true })).toBeVisible();
  await expect(pickerBar.getByText("Enter", { exact: true })).toBeVisible();
});

/**
 * Where every row's top edge is, every animation frame, from just before the
 * mouse is released until sixty frames later — keyed by each row's own label.
 *
 * Reading a row once after the fact cannot see the difference the owner
 * reported — the round-8 version of this test did exactly that and passed while
 * the owner was still watching the row travel — so this one watches it move.
 *
 * Watching only the row that was let go is not enough either, which is what the
 * round-9 version of this test did: the owner's ask is about the rows *around*
 * it as well — "the card in it's place already shifts down automatically" — and
 * a list that is redrawn in its old order and then in its new one moves those
 * rows twice while the dropped row moves once. So the whole list is sampled and
 * every row has to stop dead.
 */
function watchRelease(page: Page, frames = 60): Promise<Record<string, number[]>> {
  return page.evaluate(
    ({ frames }) =>
      new Promise<Record<string, number[]>>((resolve) => {
        const seen: Record<string, number[]> = {};
        let ticks = 0;
        const sample = () => {
          // Both editable lists at once, in document order: the symbols and the
          // intentions are the same component, and the same promise is made of
          // each of them.
          for (const handle of Array.from(
            document.querySelectorAll("button[aria-label^='Move ']"),
          )) {
            const label = handle.getAttribute("aria-label")!;
            seen[label] = [...(seen[label] ?? []), handle.getBoundingClientRect().top];
          }
        };
        const tick = () => {
          sample();
          ticks += 1;
          if (ticks >= frames) resolve(seen);
          else requestAnimationFrame(tick);
        };
        // A capped walk, in case the frame clock is ever throttled: the test
        // fails on what was seen, rather than on hanging.
        window.setTimeout(() => resolve(seen), 2000);
        requestAnimationFrame(tick);
      }),
    { frames },
  );
}

/**
 * The row was let go into its place and nothing moved it afterwards: every frame
 * but the first reads the same. The first is allowed to be the frame the row was
 * still held in, for a sampler whose first tick landed before the release was
 * painted. A pixel either way is the handle's own press shrink coming back
 * (`active:scale-95`), the one press state the rest of the app shares.
 *
 * More than that is a row that was put down somewhere, walked back to where it
 * came from, and only then moved where it was dropped — the whole round trip
 * while the list waited for the write and the reload that follow it. That is the
 * owner's round 9: "It should behave exactly like the draggable cards on the
 * plan page … when I drop the dragged intention or symbol up or down, it should
 * just magnetically get fit."
 */
function expectStilled(seen: Record<string, number[]>, what: string): void {
  const labels = Object.keys(seen);
  expect(labels.length, `${what}: the list was sampled`).toBeGreaterThan(1);
  for (const label of labels) {
    const tops = seen[label]!;
    // The first frame is allowed to be the one the row was still held in, for a
    // sampler whose first tick landed before the release was painted.
    const settled = tops.slice(1);
    const trace = tops.map((top) => Math.round(top)).join(" ");
    expect(tops.length, `${what}: ${label} was watched across its release`).toBeGreaterThan(
      10,
    );
    expect(
      Math.max(...settled) - Math.min(...settled),
      `${what}: ${label} stops moving as soon as it is let go — it visited ${trace}`,
    ).toBeLessThanOrEqual(2);
  }
}

test("letting go puts a symbol row in its place, and nothing moves it again", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Open Root Chakra" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const handles = page.getByRole("button", { name: /^Move / });
  const last = handles.nth(3);
  const moved = String(await last.getAttribute("aria-label"));
  // Measured after the hover on purpose: `hover` is what puts the row on screen,
  // and a box read before it is a viewport position from before the page had
  // scrolled — which is a drag from somewhere else entirely.
  await last.hover();
  const box = (await last.boundingBox())!;
  const step = box.y - (await handles.nth(2).boundingBox())!.y;
  await page.mouse.down();
  // Dragged to the top of the list, which is a hard boundary: where it lands
  // cannot depend on how far the page happened to scroll on the way.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - step * 3.5, {
    steps: 14,
  });
  const trail = watchRelease(page);
  await page.mouse.up();
  expectStilled(await trail, "symbol list");
  // And there is nothing left to animate: the row that was put down carries no
  // transform and no transition any more (round 8, library item 3).
  const leftover = await page
    .getByRole("button", { name: moved, exact: true })
    .evaluate((el) => (el.parentElement as HTMLElement).getAttribute("style") ?? "");
  expect(leftover, "nothing to animate back").not.toContain("transform");
  // That it moved *somewhere* is the round-4 test's job ("symbols reorder by
  // dragging in the editor, and the order is stored"); this one is about what
  // the row does in the instant it is put down.
});

test("letting go puts an intention row in its place the same way", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Open Root Chakra" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  // The last two rows of the editor are the intention list — the symbols come
  // first — so this reads that list from its end rather than counting either.
  const handles = page.getByRole("button", { name: /^Move / });
  const count = await handles.count();
  const target = handles.nth(count - 1);
  const above = handles.nth(count - 2);
  const moved = String(await target.getAttribute("aria-label"));
  await target.hover();
  const box = (await target.boundingBox())!;
  const step = box.y - (await above.boundingBox())!.y;
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - step * 1.3, {
    steps: 14,
  });
  const trail = watchRelease(page);
  await page.mouse.up();
  expectStilled(await trail, "intention list");
  // And the drop really did move it: it is now the row above the one it was
  // dropped on. Nothing else covers this list; round 4's drag test is symbols.
  await expect(handles.nth(count - 2)).toHaveAttribute("aria-label", moved);
});

test("symbol management creates a symbol", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Symbols", exact: true }).click();
  await page.getByRole("button", { name: "Add symbol" }).click();
  // Nothing in the product is "mandatory", so the editor must not offer it.
  await expect(page.getByRole("button", { name: "Mandatory" })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Symbol name" }).fill("Lotus");
  await page.getByRole("button", { name: "Save" }).click();
  // Saving opens the symbol's read-only view; the card is one Escape away.
  await expect(page.getByRole("heading", { name: "Lotus" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Lotus", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Lotus" })).toBeVisible();
});

test("intention management associates an intention with a focus point", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Intentions", exact: true }).click();
  await page.getByRole("button", { name: "Add intention" }).click();
  await page.getByRole("textbox", { name: "Intention" }).fill("I am grounded");
  await page.getByRole("button", { name: "Focus point", exact: true }).click();
  await page.getByRole("button", { name: "Focus point: Choose" }).click();
  await page.getByRole("textbox", { name: "Focus point picker" }).fill("Root");
  await page.getByRole("button", { name: "Choose", exact: true }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("I am grounded")).toBeVisible();
  // Exact, because eleven seeded lines are associated with `Root Chakra · Rama`
  // and this one is attached to the focus point alone — a substring match here
  // was a race that only passed while the editor was still on screen.
  await expect(page.getByText("Root Chakra", { exact: true })).toBeVisible();
});

test("the picker filters as you type, and refuses a name that matches nothing", async ({
  page,
}) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Intentions", exact: true }).click();
  await page.getByRole("button", { name: "Add intention" }).click();
  await page.getByRole("textbox", { name: "Intention" }).fill("I am picker");
  await page.getByRole("button", { name: "Focus point", exact: true }).click();
  await page.getByRole("button", { name: "Focus point: Choose" }).click();
  const bar = page.getByRole("textbox", { name: "Focus point picker" });
  await bar.fill("Heart");
  // The list narrows as you type, so the other options are gone.
  await expect(page.getByRole("button", { name: /^Heart Chakra/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Root Chakra/ })).toHaveCount(0);

  // A typo chooses nothing and says so, rather than saving the nearest match.
  await bar.fill("Hert");
  await page.getByRole("button", { name: "Choose", exact: true }).click();
  await expect(page.getByText(/Nothing matches “Hert”, so nothing was chosen\./)).toBeVisible();
  await expect(bar).toBeVisible();

  // Enter with the exact name takes it.
  await bar.fill("Heart Chakra");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Focus point: Heart Chakra" })).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("I am picker")).toBeVisible();
});

test("picker rows keep their long text inside the row", async ({ page }) => {
  await page.goto("/library");
  // The attach-symbol picker is the screen the owner called shabby, and its
  // hints are whole paragraphs of a symbol's usage.
  await page.getByRole("button", { name: "Open Root Chakra" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Add symbol" }).click();
  await expect(page.getByRole("listitem").first()).toBeVisible();
  const spilling = await page.getByRole("listitem").evaluateAll((rows) =>
    rows.filter((row) => {
      const button = row.querySelector("button");
      if (!button) return false;
      return button.scrollWidth > Math.ceil(row.getBoundingClientRect().width) + 1;
    }).length,
  );
  expect(spilling, "rows whose text spills out of the row").toBe(0);
});

test("a card can be edited and deleted from the card itself", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Intentions", exact: true }).click();
  await page.getByRole("button", { name: "Add intention" }).click();
  await page.getByRole("textbox", { name: "Intention" }).fill("I am card actions");
  await page.getByRole("button", { name: "Save" }).click();

  await page.getByRole("button", { name: "Edit I am card actions" }).click();
  await page.getByRole("textbox", { name: "Intention" }).fill("I am edited");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("I am edited")).toBeVisible();

  // The first press arms, the second removes — never one press.
  await page.getByRole("button", { name: "Delete I am edited" }).click();
  const armed = page.getByRole("button", { name: "Delete I am edited?" });
  await expect(armed).toBeVisible();
  await expect(armed).toHaveClass(/bg-destructive\/20/);
  await armed.click();
  await expect(page.getByText("I am edited")).toHaveCount(0);
});

test("deleting a focus point names what it takes, then takes it", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Focus points", exact: true }).click();
  await page.getByRole("button", { name: "Delete Root Chakra" }).click();
  const armed = page.getByRole("button", { name: "Delete Root Chakra?" });
  await expect(armed).toBeVisible();
  // The cascade is visible before the second press: the seeded plan uses Root
  // Chakra, so the armed button has to say how much of it goes.
  await expect(page.getByText(/This also removes \d+ blocks? from \d+ plans?/)).toBeVisible();
  await armed.click();
  await expect(page.getByRole("button", { name: "Edit Root Chakra" })).toHaveCount(0);

  // And the blocks that used it are gone from the plan, not left dangling.
  await page.goto("/plan");
  await expect(page.getByText("Root Chakra")).toHaveCount(0);
});

test("the table switch brings the column filter, and shows itself on", async ({ page }) => {
  await page.goto("/library");
  const view = page.getByRole("button", { name: "Table", exact: true });
  await expect(view).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Columns", exact: true })).toHaveCount(0);
  await view.click();
  await expect(view).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("columnheader", { name: /Name/ }).first()).toBeVisible();
  // The column action is a disclosure: open, it must read as selected.
  const columns = page.getByRole("button", { name: "Columns", exact: true });
  await columns.click();
  await expect(columns).toHaveAttribute("aria-expanded", "true");
  await expect(columns).toHaveClass(/bg-accent/);
});

test("a card opens the read-only view, and editing lives inside it", async ({ page }) => {
  await page.goto("/library");
  // The card itself is the open target — there is no `Open` button to find.
  await page.getByRole("button", { name: "Open Root Chakra" }).click();
  await expect(page.getByRole("heading", { name: "Root Chakra" })).toBeVisible();
  // Item 8: no editable or selectable options in the open view.
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add symbol" })).toHaveCount(0);
  // Escape returns to the list, and the card's own Edit still goes to the editor.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Edit Root Chakra" })).toBeVisible();
  await page.getByRole("button", { name: "Edit Root Chakra" }).click();
  await expect(page.getByRole("button", { name: "Add symbol" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Focus name" })).toBeVisible();
});

test("the card opens the entry from anywhere, including beside its buttons", async ({
  page,
}) => {
  await page.goto("/library");
  // Round 6, library item 1: "clicking on the upper portion of the card executes
  // the open view, lower portion is still unresponsive". The band the Edit and
  // Delete buttons sit in is part of the card, so a press on it — beside the
  // buttons rather than on one — opens the entry like the rest of the card.
  const card = page
    .locator("div.relative")
    .filter({ has: page.getByRole("button", { name: "Open Root Chakra" }) })
    .first();
  await card.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const box = (await card.boundingBox())!;
  // Bottom-left of the card: inside the action row, nowhere near its buttons.
  await page.mouse.click(box.x + 24, box.y + box.height - 30);
  await expect(page.getByRole("heading", { name: "Root Chakra" })).toBeVisible();

  // A press that lands *on* a button is still that button's, not the card's.
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Edit Root Chakra" }).click();
  await expect(page.getByRole("textbox", { name: "Focus name" })).toBeVisible();
});

test("a custom field is its own section, and the open view uses it", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Symbols", exact: true }).click();
  await page.getByRole("button", { name: "Edit Rama" }).click();
  // Round 6, library item 5: the symbol's editor had no custom fields at all,
  // while its read-only view carried the heading for them.
  await page.getByRole("button", { name: "Add custom fields" }).click();
  // A field is made for the entity that asked for it, so the pool is stated
  // rather than offered: round 9, "the field should apply to the focus point or
  // symbol that initiated the field addition".
  await expect(page.getByText("Every symbol")).toBeVisible();
  await expect(page.getByRole("button", { name: "Focus point", exact: true })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Field heading" }).fill("Vedic mantra");
  await page.getByRole("textbox", { name: "Field description" }).fill("What I chant");
  await page.getByRole("button", { name: "Save" }).click();
  // Saving the field comes back to the symbol's editor — making a field is part
  // of editing the symbol — and the field is **its own section there**, titled
  // by its heading, with its box under it: round 9, "yet still you add it under
  // the custom fields heading. I wanted it as its own field."
  const field = page.getByRole("textbox", { name: "Vedic mantra" });
  await expect(field).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vedic mantra" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Custom fields" })).toHaveCount(0);
  // And the description is not a line in the editor either: it is the field's
  // own note, and where a field is described is the Fields tab's card and the
  // entity's open view (round 9: "Whatever is the heading and text should be
  // the only thing being added").
  await expect(page.getByText("What I chant")).toHaveCount(0);
  await field.fill("Aum");
  await page.getByRole("button", { name: "Save fields" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  // The open view shows each value under the field's own heading, and there is
  // no shared `Custom fields` heading to find it under.
  await expect(page.getByRole("heading", { name: "Vedic mantra" })).toBeVisible();
  await expect(page.getByText("Aum")).toBeVisible();
  await expect(page.getByText("What I chant")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Custom fields" })).toHaveCount(0);

  // A field that has been added can be deleted from the editor it was added
  // from, and the press that does it is the app's two-press delete: round 9,
  // "there is no UI button for deleting a field once added".
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Delete Vedic mantra", exact: true }).click();
  const armed = page.getByRole("button", { name: "Delete Vedic mantra?", exact: true });
  await expect(armed).toBeVisible();
  // A field belongs to the pool, so the arm step says what goes with it.
  await expect(page.getByText("This also removes 1 field value.")).toBeVisible();
  await armed.click();
  await expect(page.getByRole("textbox", { name: "Vedic mantra" })).toHaveCount(0);
  // And it is gone from the symbol's open view too, which is the proof that the
  // pool's field went rather than this symbol's value.
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "Vedic mantra" })).toHaveCount(0);
});

test("a nested intention comes back to where the editor was left", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Open Root Chakra" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  // Scroll to one of the focus point's intentions, which sit far down its editor.
  const edit = page.getByRole("button", { name: "Edit", exact: true }).first();
  await edit.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const before = await page.evaluate(() => window.scrollY);
  expect(before, "the editor is long enough to be worth remembering").toBeGreaterThan(200);

  await edit.click();
  await page.getByRole("textbox", { name: "Intention" }).waitFor();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("textbox", { name: "Location" })).toBeVisible();
  // Round 6: "when going back from edit intention page, the edit page starts at
  // the top again, the page position should be where we left off."
  const after = await page.evaluate(() => window.scrollY);
  expect(Math.abs(after - before), "back where it was").toBeLessThan(2);
});

test("the focus point's duration wheels line up too", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Open Root Chakra" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  // The editor's wheels are the larger size, and the seeded default ends in
  // `00` — the minimum again, in the other size (owner's round 7).
  const minutes = page.getByRole("spinbutton", { name: "Minutes" }).first();
  const seconds = page.getByRole("spinbutton", { name: "Seconds" }).first();
  await expect(seconds).toHaveAttribute("aria-valuenow", "0");
  const min = (await minutes.boundingBox())!;
  const sec = (await seconds.boundingBox())!;
  expect(Math.abs(min.y - sec.y)).toBeLessThan(2);
  // Three fixed rows of 52px: the window is the same height at every value.
  expect(Math.round(min.height)).toBe(156);
  expect(Math.abs(min.height - sec.height)).toBeLessThan(2);
});

test("a table row opens the read-only view, not the editor", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Table", exact: true }).click();
  // Anywhere in the row, not just the name cell (item 7).
  await page.getByRole("row", { name: /Root Chakra/ }).click({ position: { x: 250, y: 10 } });
  await expect(page.getByRole("heading", { name: "Root Chakra" })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
});

test("symbols reorder by dragging in the editor, and the order is stored", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Open Root Chakra" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const handles = page.getByRole("button", { name: /^Move / });
  const first = handles.first();
  const second = (await handles.nth(1).getAttribute("aria-label"))!;

  await first.hover();
  const start = (await first.boundingBox())!;
  const centreX = start.x + start.width / 2;
  await page.mouse.down();
  // The row slides up and down; it must not travel sideways over the buttons
  // beside it (the mirror of the planner's strip, which may only move in x).
  // The centre, not the edge: the pressed handle shrinks (`active:scale-95`),
  // which moves its edges without moving the row at all.
  await page.mouse.move(centreX + 160, start.y + start.height / 2, { steps: 10 });
  const dragged = (await first.boundingBox())!;
  expect(
    Math.abs(dragged.x + dragged.width / 2 - centreX),
    "no sideways travel while dragging",
  ).toBeLessThan(4);
  await page.mouse.move(centreX, start.y + start.height / 2 + 110, { steps: 10 });
  await page.mouse.up();

  // The row that was second is now first — and it stays that way, because the
  // order is written to `sortOrder` rather than kept in the list.
  await expect(handles.first()).toHaveAttribute("aria-label", second);
  await page.reload();
  await page.getByRole("button", { name: "Open Root Chakra" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Move / }).first()).toHaveAttribute(
    "aria-label",
    second,
  );
});

test("reorder also works from the keyboard", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Open Root Chakra" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const handles = page.getByRole("button", { name: /^Move / });
  const second = (await handles.nth(1).getAttribute("aria-label"))!;
  // dnd-kit renders one live region per sortable list, in list order.
  const status = page.locator('[id^="DndLiveRegion"]').first();
  await handles.first().focus();
  await page.keyboard.press("Space");
  // The sensor only listens for arrows once the lift has registered, so each
  // key waits for its effect (the pressed handle, then the moved-over
  // announcement) instead of racing the state machine.
  await expect(handles.first()).toHaveAttribute("aria-pressed", "true");
  const lifted = (await status.textContent()) ?? "";
  await page.keyboard.press("ArrowDown");
  await expect(status).not.toHaveText(lifted);
  await page.keyboard.press("Space");
  await expect(handles.first()).toHaveAttribute("aria-label", second);

  // Escape cancels a lift without leaving the editor, which is the one key
  // `EditorChrome` also reads as "go back".
  const orderNow = (await handles.first().getAttribute("aria-label"))!;
  await handles.first().focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Add symbol" })).toBeVisible();
  await expect(handles.first()).toHaveAttribute("aria-label", orderNow);
});

test("escape goes back from a library editor", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Symbols", exact: true }).click();
  await page.getByRole("button", { name: "Add symbol" }).click();
  await expect(page.getByRole("heading", { name: "New symbol" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Add symbol" })).toBeVisible();
});

test("binaural config keeps a draft and reverts to the saved preset", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Open Root Chakra" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Open binaural config" }).click();
  await page.getByRole("textbox", { name: "Preset name" }).fill("Drafty");
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Open binaural config" }).click();
  await expect(page.getByRole("textbox", { name: "Preset name" })).toHaveValue("Drafty");
  await page.getByRole("button", { name: "Revert" }).click();
  await expect(page.getByRole("textbox", { name: "Preset name" })).not.toHaveValue("Drafty");
});

test("an unsaved editor draft survives a trip to the binaural config", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Open Root Chakra" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("textbox", { name: "Location" }).fill("Draft location");
  await page.getByRole("button", { name: "Open binaural config" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  // The draft is written before the picker takes over, so Back finds it again.
  await expect(page.getByRole("textbox", { name: "Location" })).toHaveValue("Draft location");
});

test("an unsaved editor draft survives a trip to an intention", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Open Root Chakra" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("textbox", { name: "Location" }).fill("Draft location");
  // Every route out of the editor saves that draft first — the intention
  // screen comes back with `Back` too, and it used to lose the half-typed name.
  await page.getByRole("button", { name: "Add intention" }).click();
  await expect(page.getByRole("heading", { name: "New intention" })).toBeVisible();
  await page.getByRole("textbox", { name: "Intention" }).fill("I am a nested intention");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("textbox", { name: "Location" })).toHaveValue(
    "Draft location",
  );
  await expect(page.getByText("I am a nested intention")).toBeVisible();
});

test("refuses to save a preset without a name", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Open Root Chakra" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Open binaural config" }).click();
  await page.getByRole("textbox", { name: "Preset name" }).fill("");
  await page.getByRole("button", { name: "Save" }).click();
  // The rule lives in the application (`catalog.nameRequired`), which trims and
  // refuses; this screen only shows the message it comes back with.
  await expect(page.getByText("Name is required")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Preset name" })).toBeVisible();
});

test("library tables offer pool-aware custom field columns", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Fields", exact: true }).click();
  await page.getByRole("button", { name: "Add symbol field" }).click();
  await page.getByRole("button", { name: "Focus point", exact: true }).click();
  // Round 6: the form asks for a heading and a description. The identifier the
  // field is stored under is derived from the heading (`fieldKeyFor`), so there
  // is no key to invent.
  await page.getByRole("textbox", { name: "Field heading" }).fill("Mantra");
  await page.getByRole("textbox", { name: "Field description" }).fill("What I chant");
  await page.getByRole("button", { name: "Save" }).click();

  await page.getByRole("button", { name: "Focus points", exact: true }).click();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: "Mantra" })).toBeVisible();
  // The column toggles live behind the toolbar's Columns action (§3.2 item 3).
  await page.getByRole("button", { name: "Columns", exact: true }).click();
  await page.getByRole("button", { name: /^Mantra/ }).click();
  await expect(page.getByRole("columnheader", { name: "Mantra" })).toHaveCount(0);
});

test("keeps a symbol's picture across a library save", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Symbols", exact: true }).click();
  await page.getByRole("button", { name: "Edit Rama" }).click();
  await page.getByLabel("Symbol image").setInputFiles({
    name: "rama.png",
    mimeType: "image/png",
    buffer: Buffer.from(PNG_1X1, "base64"),
  });
  await page.getByRole("button", { name: "Save" }).click();
  // The symbol's read-only view returns only after the save has landed (see
  // run.spec), and that is where the picture has to still be alive.
  const picture = page.getByRole("img", { name: "Rama" });
  await expect(picture).toBeVisible();
  const before = await picture.getAttribute("src");
  expect(before).toMatch(/^blob:/);

  // Saving used to revoke every media URL and re-decode them, which blanked the
  // pictures mid-session. The URL must survive the save; a new one means the
  // cache was thrown away again (review M7).
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Rama" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Rama" })).toHaveAttribute("src", before!);
});
