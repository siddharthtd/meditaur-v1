import { expect, test, type Page } from "@playwright/test";

/**
 * One meditation's own editor, opened from its card (the owner's round 17, item 13).
 *
 * A card carries no fields of its own any more — the five pickers and the per-stage
 * timer rows moved in here — so a test about a wheel, a switch or a Display starts
 * by pressing the card's `Edit`. `.first()`, because the seeded plan opens **and**
 * closes with Thanks Giving: two cards, one row.
 */
async function openEditor(page: Page, name: string) {
  await page.goto("/plan");
  await page.getByRole("button", { name: `Edit ${name}` }).first().click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

test("create, switch, and delete plans without select elements", async ({ page }) => {
  await page.goto("/plan");
  await expect(page.getByRole("textbox", { name: "Plan name" })).toHaveValue("Chakra circuit");
  await page.getByRole("button", { name: "New plan" }).click();
  await expect(page.getByRole("textbox", { name: "Plan name" })).toHaveValue("New session");
  await page.getByRole("button", { name: "Delete plan" }).click();
  await page.getByRole("button", { name: "Delete New session?" }).click();
  await expect(page.getByRole("textbox", { name: "Plan name" })).toHaveValue("Chakra circuit");
  await page.getByRole("button", { name: "New plan" }).click();
  await expect(page.getByRole("textbox", { name: "Plan name" })).toHaveValue("New session");
  await page.getByRole("button", { name: "Switch plan" }).click();
  await expect(page.getByRole("heading", { name: "Plans" })).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
  await page.getByRole("button", { name: "Chakra circuit" }).click();
  await expect(page.getByRole("textbox", { name: "Plan name" })).toHaveValue("Chakra circuit");
  await expect(page.locator("select")).toHaveCount(0);
});

test("duplicate copies the current session onto a new plan", async ({ page }) => {
  await page.goto("/plan");
  await expect(page.getByRole("textbox", { name: "Plan name" })).toHaveValue("Chakra circuit");
  await page.getByRole("button", { name: "Duplicate plan" }).click();
  await expect(page.getByRole("textbox", { name: "Plan name" })).toHaveValue("Chakra circuit copy");
  await page.getByRole("button", { name: "Switch plan" }).click();
  await expect(page.getByRole("button", { name: "Chakra circuit", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Chakra circuit copy", exact: true })).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
});

test("the plan tools share one row, delete included", async ({ page }) => {
  await page.goto("/plan");
  // `Delete plan` only appears once there is more than one plan to leave behind.
  await page.getByRole("button", { name: "New plan" }).click();
  const rows = new Set<number>();
  for (const name of ["Switch plan", "New plan", "Duplicate plan", "Delete plan"]) {
    const box = await page.getByRole("button", { name, exact: true }).boundingBox();
    expect(box, name).not.toBeNull();
    rows.add(Math.round(box!.y));
  }
  expect(rows.size, "every plan tool on one line").toBe(1);
});

test("the plan tools are a toolbar, not three more tiles", async ({ page }) => {
  await page.goto("/plan");
  // Round 6: the focus tiles and the plan actions were the same shape at the
  // same size, so they read as one set of buttons. The tiles start a session;
  // the tools switch which plan you are editing, in their own strip.
  await expect(page.getByRole("heading", { name: "Chakras" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Points" })).toBeVisible();
  // The group is a group of them.
  await expect(page.getByRole("heading", { name: "Point", exact: true })).toHaveCount(0);
  // Round 16 (§8): only a chakra's and a point's tiles keep a heading of their
  // own, because those two are the groups a reader recognises. Protection and
  // Thanks Giving are folded into the third heading rather than dropped — a type
  // heading of its own repeated the name the block card's handle already carries.
  await expect(page.getByRole("heading", { name: "Other meditation blocks" })).toBeVisible();
  for (const own of ["Protection", "Thanks Giving"]) {
    await expect(page.getByRole("heading", { name: own, exact: true })).toHaveCount(0);
  }
  const other = page.locator("section", {
    has: page.getByRole("heading", { name: "Other meditation blocks" }),
  });
  await expect(other.getByRole("button", { name: "Protection", exact: true })).toBeVisible();
  await expect(other.getByRole("button", { name: "Thanks Giving", exact: true })).toBeVisible();

  const strip = page.locator("div.border-line", {
    has: page.getByRole("button", { name: "Switch plan" }),
  });
  await expect(strip).toHaveCount(1);
  // Every tool is inside the strip, and none of them is tile-sized.
  for (const name of ["Switch plan", "New plan", "Duplicate plan"]) {
    await expect(strip.getByRole("button", { name, exact: true })).toBeVisible();
  }
  const tile = (await page
    .getByRole("button", { name: "Root Chakra", exact: true })
    .boundingBox())!;
  const tool = (await strip.getByRole("button", { name: "New plan", exact: true }).boundingBox())!;
  expect(tool.height, "a tool is compact, a tile is not").toBeLessThan(tile.height);
});

test("the two wheels line up, with no colon between them", async ({ page }) => {
  await openEditor(page, "Third-Eye Chakra");
  const minutes = page.getByRole("spinbutton", { name: "Minutes" }).first();
  const seconds = page.getByRole("spinbutton", { name: "Seconds" }).first();
  const min = (await minutes.boundingBox())!;
  const sec = (await seconds.boundingBox())!;
  // The seeded plan's first block is a whole number of minutes, so the seconds
  // column is at its minimum — the case that used to lose the line above it and
  // hang ~24px higher than the minutes (owner's round 7, "seconds is dangling
  // above"). Fixed rows mean the two columns cannot disagree at any value.
  expect(await seconds.getAttribute("aria-valuenow")).toBe("0");
  expect(Math.abs(min.y - sec.y), "the columns start at the same height").toBeLessThan(2);
  expect(Math.abs(min.height - sec.height), "and are the same height").toBeLessThan(2);
  expect(min.y + min.height / 2, "and share one middle line").toBeCloseTo(
    sec.y + sec.height / 2,
    0,
  );
  // No `:` between them: the pair is separated by the band, not by a glyph.
  const pair = minutes.locator("xpath=../..");
  expect(await pair.textContent()).not.toContain(":");
});

test("a wheel turns with the mouse wheel, and still with a drag", async ({ page }) => {
  await openEditor(page, "Third-Eye Chakra");
  const minutes = page.getByRole("spinbutton", { name: "Minutes" }).first();
  const value = async () => Number(await minutes.getAttribute("aria-valuenow"));
  // A wheel event is a real pointer at a real place, so the column has to be on
  // screen: `boundingBox()` is viewport-relative, and the first block's wheels
  // sit below the fold. Without this the mouse moved to a point past the bottom
  // of the viewport, the event hit nothing, and the wheel looked broken.
  await minutes.scrollIntoViewIfNeeded();
  const box = (await minutes.boundingBox())!;
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const started = await value();

  // The column is a real scroll container, which is what makes it scrollable on
  // the web at all: before this, only a hand-rolled mouse drag moved it.
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.wheel(0, 80);
  await expect.poll(value, { message: "the wheel turned" }).toBeGreaterThan(started);

  // And the drag still works, for a mouse that would rather pull the number.
  const wheeled = await value();
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x, centre.y + 80, { steps: 8 });
  await page.mouse.up();
  await expect.poll(value, { message: "the drag turned it back" }).toBeLessThan(wheeled);
});

test("the wheel rests on a digit, not between two", async ({ page }) => {
  await openEditor(page, "Third-Eye Chakra");
  const minutes = page.getByRole("spinbutton", { name: "Minutes" }).first();
  await minutes.scrollIntoViewIfNeeded();

  /**
   * How far the row the value names sits from the middle of the window, which
   * is where the highlight band is. Nought is a wheel resting on a digit;
   * anything like a row's half is the wheel resting between two of them.
   */
  const offBy = () =>
    minutes.evaluate((el) => {
      const scroller = el.querySelector(".time-wheel") as HTMLElement;
      const value = Number(el.getAttribute("aria-valuenow"));
      const min = Number(el.getAttribute("aria-valuemin"));
      // The scroller holds a blank row, then every value, then a blank row.
      const row = scroller.children[value - min + 1] as HTMLElement;
      const rowBox = row.getBoundingClientRect();
      const windowBox = el.getBoundingClientRect();
      return Math.abs(rowBox.top + rowBox.height / 2 - (windowBox.top + windowBox.height / 2));
    });

  /**
   * A wheel left where momentum stopped, rather than on a row: the offset is
   * nudged off the row the value is still on, which is the one position the
   * value *and* the offset both have to be able to describe — the owner's round
   * 9, "often lands between two digits, or lands slightly above or below the
   * marked line".
   *
   * It is placed here rather than arrived at, because no gesture a test can make
   * reproduces a trackpad's momentum, and the browser's own snapping is turned
   * off for it: Chromium snaps a *wheel event* on its own, but momentum is not
   * snapped by every browser, and Chrome drops the snap it had pending when
   * something writes the offset mid-gesture — which is what this component used
   * to do. The wheel therefore has to be able to land itself, which is the part
   * of the fix a test can reach.
   */
  const rowPx = await minutes.evaluate((el) => {
    const scroller = el.querySelector(".time-wheel") as HTMLElement;
    const row = scroller.children.item(1) as HTMLElement;
    scroller.style.scrollSnapType = "none";
    return row.getBoundingClientRect().height;
  });
  await minutes.evaluate((el, nudge) => {
    const scroller = el.querySelector(".time-wheel") as HTMLElement;
    scroller.scrollTop = Math.round(scroller.scrollTop) + nudge;
  }, Math.round(rowPx * 0.4));
  await expect.poll(offBy, { message: "the wheel found the row again" }).toBeLessThan(2);

  // And a turn of its own lands on one too, with the browser's snapping back on
  // — half a row of travel, which is between two of them when it stops.
  await minutes.evaluate((el) => {
    (el.querySelector(".time-wheel") as HTMLElement).style.scrollSnapType = "";
  });
  const box = (await minutes.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, Math.round(rowPx * 1.5));
  await expect.poll(offBy, { message: "the wheel settled on a digit" }).toBeLessThan(2);
});

test("a press on a wheel types the value instead", async ({ page }) => {
  await openEditor(page, "Third-Eye Chakra");
  const minutes = page.getByRole("spinbutton", { name: "Minutes" }).first();
  // A press that does not turn the wheel opens the text box over it — the part
  // the owner says already works, kept working by the rewrite.
  await minutes.click();
  const field = page.getByRole("textbox", { name: "Minutes value" });
  await field.fill("12");
  await field.press("Enter");
  await expect(minutes).toHaveAttribute("aria-valuenow", "12");
  // Escape abandons an edit; the wheel keeps the value it had, and the box is
  // gone rather than left holding the abandoned text. That second half is the
  // round-11 regression: the box re-opened over the value it had just
  // committed, and the *next* blur — anything at all — wrote the stale
  // number back, so the reader's value silently reverted. `Tab` is the blur here,
  // because this editor is a screen of its own with no `Plan name` box in it.
  await minutes.click();
  await page.getByRole("textbox", { name: "Minutes value" }).fill("3");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("textbox", { name: "Minutes value" })).toHaveCount(0);
  await expect(minutes).toHaveAttribute("aria-valuenow", "12");
  await page.keyboard.press("Tab");
  await expect(minutes, "the abandoned 3 did not land on the way out").toHaveAttribute(
    "aria-valuenow",
    "12",
  );
  // A blur commits. This is the third commit path and the one a reader takes
  // without knowing the box exists: type the number, then leave the box.
  await minutes.click();
  await page.getByRole("textbox", { name: "Minutes value" }).fill("5");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("textbox", { name: "Minutes value" })).toHaveCount(0);
  await expect(minutes).toHaveAttribute("aria-valuenow", "5");
  // And text that is not a number still commits nothing, whichever way it
  // leaves — the field is not a free-text box that happens to look numeric.
  await minutes.click();
  await page.getByRole("textbox", { name: "Minutes value" }).fill("later");
  await page.keyboard.press("Tab");
  await expect(minutes).toHaveAttribute("aria-valuenow", "5");
});

test("the seconds wheel counts in circles, and the minutes wheel does not", async ({
  page,
}) => {
  // The owner's round 19, item 1: *"the timers' seconds should wrap around, after
  // 59, it should again become 0, minute wheel stays the same."* The last value a
  // column holds is one step from the first, and nothing carries into its neighbour:
  // a second that rolled a minute over would be arithmetic nobody asked for.
  await page.goto("/plan");
  await openEditor(page, "Third-Eye Chakra");
  const minutes = page.getByRole("spinbutton", { name: "Minutes" }).first();
  const seconds = page.getByRole("spinbutton", { name: "Seconds" }).first();
  // The seeded stage is 2:00, so the minutes column has a value to watch.
  await expect(minutes).toHaveAttribute("aria-valuenow", "2");
  const type = async (name: string, value: string) => {
    await page.getByRole("spinbutton", { name }).first().click();
    await page.getByRole("textbox", { name: `${name} value` }).fill(value);
    await page.keyboard.press("Enter");
  };
  await type("Seconds", "59");
  await expect(seconds).toHaveAttribute("aria-valuenow", "59");
  // One step past the last value is the first value. Deliberately the *keyboard*:
  // the wheel's step and its typed value share one rule, and `wheelWrappedStep` is
  // that rule — its own unit test covers the circle's arithmetic.
  await seconds.press("ArrowUp");
  await expect(seconds).toHaveAttribute("aria-valuenow", "0");
  await expect(minutes, "a wrap never carries").toHaveAttribute("aria-valuenow", "2");
  // And the other way round the seam: below 0 sits 59.
  await seconds.press("ArrowDown");
  await expect(seconds).toHaveAttribute("aria-valuenow", "59");
  await expect(minutes).toHaveAttribute("aria-valuenow", "2");
  // A typed value lands where it falls on the circle — the same rule as a step.
  await type("Seconds", "90");
  await expect(seconds).toHaveAttribute("aria-valuenow", "30");
  await expect(minutes).toHaveAttribute("aria-valuenow", "2");
  // The minutes column is not a circle: it still stops at its ends.
  await expect(minutes).toHaveAttribute("aria-valuemax", "180");
});

test("a block card names the meditation, and the card itself opens its editor", async ({
  page,
}) => {
  // The owner's round 17, item 13: the card had grown five read-only picker fields
  // and a timer row per stage, and the meditation's name — the one thing a card is
  // *for* — was squeezed into what was left. It is a handle again, and everything it
  // used to show as text is editable one press away.
  await page.goto("/plan");
  const card = page.getByRole("button", { name: "Drag Thanks Giving block" }).first();
  await expect(card).toBeVisible();
  // Twice: the meditation's name, and its type underneath it — which for Thanks
  // Giving is the same word, because its type is named after it.
  await expect(card.getByText("Thanks Giving", { exact: true }).first()).toBeVisible();
  // No read-only field left anywhere on the strip.
  for (const field of ["Meditation", "Symbol", "Binaural", "Ambient", "Alarm"]) {
    await expect(page.getByRole("button", { name: new RegExp(`^${field}: \\S`) })).toHaveCount(0);
  }
  // What the card says instead is one muted line about the block, and it starts
  // with how long the block runs (the owner's round 18).
  const shell = page.locator(".overflow-y-hidden > div").filter({ has: card }).first();
  await expect(shell.locator("p")).toContainText(/^\d/);

  // The press is the point, and it is the whole card — not a band under the name
  // the reader has to find. Pressing the card's own surface opens that meditation's
  // editor, which is where every one of those fields is editable, and the stages,
  // and the Display.
  await page.getByRole("button", { name: "Open Thanks Giving" }).first().click();
  await expect(page.getByRole("heading", { name: "Thanks Giving", exact: true })).toBeVisible();
  // `level: 2` throughout: an editor section is an `h2`, while the Display's own
  // grid bands (`Meditation`, `Symbol`) are `h3` inside the Display section — the
  // section and the table a column belongs to are allowed to share a word.
  for (const section of ["Meditation", "Stages", "Symbol", "Sound", "Alarm", "Display"]) {
    await expect(
      page.getByRole("heading", { level: 2, name: section, exact: true }),
    ).toBeVisible();
  }
  // Item 8: Thanks Giving has no symbols, so the editor says so rather than
  // offering a control that cannot act.
  await expect(page.getByText("Thanks Giving has no symbols", { exact: false })).toBeVisible();
});

test("the Display is an open section, grouped by table, with a switch per column", async ({
  page,
}) => {
  // The panel lives on the meditation (item 13), so the card is the way in.
  await openEditor(page, "Thanks Giving");
  // Nothing is pressed before the switches are read, and that is the assertion: it
  // used to be a `<details>` with five switches behind a press, which the owner
  // called out in round 18 — *"the details section shouldn't be that collapsed
  // hideous thing it is today"*.
  await expect(page.locator("details")).toHaveCount(0);
  // And it is a section heading like the editor's others, which a `<summary>` — the
  // disclosure this replaced — could never be.
  await expect(
    page.getByRole("heading", { level: 2, name: "Display", exact: true }),
  ).toBeVisible();
  const panel = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Display", exact: true }) });
  await expect(panel).toHaveCount(1);
  // Grouped by the table a column belongs to, and a group with nothing in it is not
  // drawn at all — the seeded store has no columns of its own on the Entries table,
  // so it offers two groups today and a third the moment one is added there.
  for (const group of ["Meditation", "Symbol"]) {
    await expect(panel.getByRole("heading", { name: group, exact: true })).toBeVisible();
  }
  // Each switch is named by its column and its group, so a screen reader hears what
  // the bare word `Shown` never said, and the two `Name` columns — one per table —
  // stay told apart. The seeded plan shows the symbol's description and usage, and
  // the meditation's `Location` since round 17.
  const description = page.getByRole("button", { name: "Symbol Description shown" });
  await expect(description).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Symbol Usage shown" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Meditation Location shown" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Meditation Name shown" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  // A column cannot be pinned while hidden: pinning it shows it. `Meditation Name`
  // is one the plan's default display does not show.
  await page.getByRole("button", { name: "Meditation Name pinned" }).click();
  await expect(page.getByRole("button", { name: "Meditation Name shown" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Meditation Name pinned" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // And the first change gave **this** meditation its own Display, rather than
  // editing the plan's answer for its eight siblings — which is what puts the way
  // back on the section's heading line.
  await expect(page.getByText("What this meditation shows while it runs.")).toBeVisible();
  await page.getByRole("button", { name: "Use the plan's Display" }).click();
  await expect(page.getByText("Showing the plan's Display.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use the plan's Display" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Meditation Name shown" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("the plan Display changes what the session shows", async ({ page }) => {
  // Two sessions across three navigations — three times the work of a typical
  // test here, timed as though it were the same size. CI failed it twice in a
  // row with `Start` not yet rendered, on a cold `next dev` that was still
  // compiling the route the screen lives on. `slow()` gives it the budget its
  // work needs; nothing below sleeps, and every wait is for the app itself.
  test.slow();
  await page.addInitScript(() => {
    sessionStorage.setItem("meditaur:e2eDurationMs", "60000");
  });
  // One session per half, and each starts from a fresh page: the engine is a
  // singleton in the tab, and a second `Start` pressed while the first is still
  // letting go opens the run screen before it is `loaded` — a `Start` that is
  // disabled, which is the flake this test used to be.
  const begin = async () => {
    await page.goto("/plan");
    await page.getByRole("button", { name: "Start session" }).click();
    const start = page.getByRole("button", { name: "Start", exact: true });
    // The first navigation to `/run/<id>` in a worker is the one the warmup
    // fixture cannot cover for it, so the screen — not the clock — is what this
    // waits on.
    await expect(start).toBeEnabled({ timeout: 60_000 });
    await start.click();
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    // The seeded plan opens with **Thanks Giving** (§12.13), which has no symbol
    // and no Display columns of its own; this test is about a chakra's table, so
    // it skips into the first one.
    await page.getByRole("button", { name: "Skip", exact: true }).click();
  };

  // `begin()` loads `/plan` itself, and whether the panel is open is not part of
  // what this test says, so the page is loaded once rather than twice.
  await begin();
  // The seeded plan shows the symbol's description and usage, so the session's
  // **symbol panel** carries them: the Display decides what the panels show, not
  // only a table that no longer exists (§6.2).
  const symbol = page.getByRole("region", { name: "Symbol" });
  await expect(symbol.getByText("Description", { exact: true })).toBeVisible();
  const description = (await symbol.locator("dd").first().innerText()).trim();
  expect(description.length, "a symbol with a description").toBeGreaterThan(1);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page).toHaveURL(/\/plan/);

  // Hide it **on this meditation**: the panel is per block now (item 13), so the
  // chakra's own card is the one to open — and the change is what gives that block
  // its own Display rather than editing the plan's answer for its siblings.
  await page.getByRole("button", { name: "Edit Third-Eye Chakra" }).click();
  // The switch is named by its column and its group, and it is on screen the
  // moment the editor is: the Display is a section, not a disclosure.
  await page.getByRole("button", { name: "Symbol Description shown" }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  // The write landed: the button stops saying `Save · unsaved`.
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await begin();
  await expect(page.getByRole("region", { name: "Symbol" }).getByText("Usage", { exact: true }))
    .toBeVisible();
  await expect(page.getByText(description)).toHaveCount(0);
});

test("a pinned Display column keeps its own band on the run screen", async ({ page }) => {
  // The Display's `Pin` is the one switch the three regions could have quietly
  // stopped reading: it meant a sticky column in round 14's table. It still means
  // something here — the fact sits in a band that stays put while its panel's own
  // content scrolls under it — and this is the guard that says so.
  test.slow();
  await page.addInitScript(() => {
    sessionStorage.setItem("meditaur:e2eDurationMs", "60000");
  });
  await page.goto("/plan");
  await page.getByRole("button", { name: "Edit Third-Eye Chakra" }).click();
  await page.getByRole("button", { name: "Symbol Description pinned" }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();

  // Thanks Giving opens the plan and has no symbol, so the block with a symbol
  // panel is the first chakra's.
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page).toHaveURL(/\/run\//);
  const start = page.getByRole("button", { name: "Start", exact: true });
  await expect(start).toBeEnabled({ timeout: 60_000 });
  await start.click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await page.getByRole("button", { name: "Skip", exact: true }).click();

  const pinned = page.locator("[data-pinned-facts]");
  await expect(pinned.getByText("Description", { exact: true })).toBeVisible();
  expect(
    await pinned.evaluate((node) => getComputedStyle(node).position),
    "the pinned fact stays put while its panel scrolls",
  ).toBe("sticky");
});

test("the session is a region list, and the screen does not scroll", async ({ page }) => {
  // The owner's round 14, and again in round 15 §6. The run screen stacked one box
  // per symbol, so a block with several of them pushed the controls off the bottom
  // and had to be scrolled — and a session that has to be scrolled is not a
  // session. It is three regions now: a fixed meditation panel, a symbol panel that
  // updates in place, and one auto-scrolling intentions column.
  test.slow();
  // Chromium's headless default is `reduce`, and the run screen honours the
  // reader's preference by starting with the scroll **off** (§6.3) — so the
  // preference is stated here rather than assumed. The override path is the next
  // test's subject.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    sessionStorage.setItem("meditaur:e2eDurationMs", "60000");
  });
  await page.goto("/plan");
  await page.getByRole("button", { name: "Start session" }).click();
  // A worker's first `/run/<id>` is cold however warm the route is for the
  // suite, so this waits on the budget the next line uses rather than the 15s
  // `expect` default: at that default it failed here once (passed on retry) with
  // the screen still on `/plan`.
  await expect(page).toHaveURL(/\/run\//, { timeout: 60_000 });
  // Start it, so this is the screen a reader actually sits in front of: the
  // header is the clock and the footer is the session's controls.
  const start = page.getByRole("button", { name: "Start", exact: true });
  await expect(start).toBeEnabled({ timeout: 60_000 });
  await start.click();
  const stop = page.getByRole("button", { name: "Stop", exact: true });
  await expect(stop).toBeVisible();
  // Thanks Giving opens the circuit and has no symbols of its own (§12.13); the
  // block after it is the first chakra, which is what this test is about.
  await page.getByRole("button", { name: "Skip", exact: true }).click();

  // The regions the block's own data needs (round 16, items 4 and 8). The screen no
  // longer carries a box that repeats the meditation's name over its type — the owner
  // called that box useless, and it is the header now — but the chakra's **own
  // columns** are drawn: the owner's round 17 asked where they had gone, and they had
  // gone because the default Display hid the meditation's only builtin column, so the
  // region compiled to nothing and this screen correctly declined to draw an empty
  // box. `Location` is shown by default now, and the symbol panel is the region that
  // was always there.
  await expect(page.getByRole("heading", { name: "Third-Eye Chakra" })).toBeVisible();
  await expect(page.getByText("Chakras", { exact: true })).toBeVisible();
  const meditation = page.getByRole("region", { name: "Meditation" });
  await expect(meditation.getByText("Location", { exact: true })).toBeVisible();
  const symbol = page.getByRole("region", { name: "Symbol" });
  await expect(symbol.getByRole("heading", { level: 2 })).toBeVisible();
  // The plan's Display still decides what that panel carries: the seeded plan shows
  // the symbol's Description and Usage.
  await expect(symbol.getByText("Description", { exact: true })).toBeVisible();
  await expect(symbol.getByText("Usage", { exact: true })).toBeVisible();

  // The intentions are a table, and it is the only thing on the screen that scrolls:
  // a session that has to be scrolled is not a session.
  const intentions = page.locator("[data-intentions-scroll]");
  await expect(intentions).toBeVisible();
  expect(
    await intentions.locator("[data-line]").count(),
    "every line of the block",
  ).toBeGreaterThan(2);
  // Item 4: a hairline between the lines, and the symbol they belong to named in the
  // table's own left column — otherwise it is an essay.
  const firstCell = intentions.locator("[data-line] td").first();
  expect(
    await firstCell.evaluate((node) => getComputedStyle(node).borderBottomWidth),
    "a hairline under every line",
  ).not.toBe("0px");
  expect(
    await intentions.locator("th[scope='rowgroup']").count(),
    "the symbol column names each group",
  ).toBeGreaterThan(0);
  const column = await intentions.evaluate((node) => ({
    overflowY: getComputedStyle(node).overflowY,
    scrollHeight: node.scrollHeight,
    clientHeight: node.clientHeight,
  }));
  expect(column.overflowY, "the column is the scroller").toBe("auto");
  expect(
    column.scrollHeight,
    "and it has more to show than it can show — which is what the auto-scroll moves",
  ).toBeGreaterThan(column.clientHeight);
  // The column walks itself down while the stage runs (§6.3): the switch is on for
  // an intentions stage, the reader has not asked for reduced motion, and the rate
  // comes from the clock — so a couple of seconds of a 60-second stage is a real
  // distance, and the direction is what is asserted rather than the pixels.
  const before = await intentions.evaluate((node) => node.scrollTop);
  await page.waitForTimeout(2000);
  const after = await intentions.evaluate((node) => node.scrollTop);
  expect(
    await intentions.getAttribute("data-auto-scroll"),
    "the column is walking itself down",
  ).toBe("on");
  expect(after, "the intentions walk down as the stage runs").toBeGreaterThan(before);

  // The whole point: the screen is exactly one viewport, so the run shell owns
  // the height and clips — the column scrolls inside its own card when it has to
  // and the page never does.
  const box = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
  const shell = await page.locator("main").evaluate((node) => ({
    overflowY: getComputedStyle(node).overflowY,
    height: Math.round(node.getBoundingClientRect().height),
  }));
  expect(shell.overflowY, "the page cannot scroll; the column does").toBe("hidden");
  expect(
    column.clientHeight,
    "and the column is bounded by the fold rather than growing with its content",
  ).toBeLessThanOrEqual(box.clientHeight);
  expect(shell.height, "the shell is one viewport tall").toBe(box.clientHeight);
  expect(box.scrollHeight, "the page does not scroll").toBeLessThanOrEqual(box.clientHeight + 1);

  // And the controls are inside the fold without anything being scrolled to get
  // there — which is what the stacked boxes made impossible mid-session.
  const stopBox = (await stop.boundingBox())!;
  expect(stopBox.y + stopBox.height, "the controls are on screen").toBeLessThanOrEqual(
    box.clientHeight + 1,
  );
});

test("the stages carry their own switches, and they survive a save", async ({ page }) => {
  // §12.21: binaural and auto-scroll belong to the **stage**, so they live with its
  // timer — which, since the owner's round 17, is inside that meditation's own editor
  // rather than on its card. Also read back from the store here: a switch that only
  // changed the screen would be the same bug as a wheel that sprang back.
  await page.goto("/plan");
  await page.getByRole("button", { name: "Edit Third-Eye Chakra" }).click();
  // The seeded chakra's first stage is `Intentions`, which is one of the two kinds
  // that can scroll; every stage row has a binaural switch.
  await expect(page.getByRole("button", { name: "Binaural", exact: true }).first())
    .toBeVisible();
  const autoScroll = page.getByRole("button", { name: "Auto-scroll", exact: true }).first();
  await expect(autoScroll).toHaveAttribute("aria-pressed", "true");
  await autoScroll.click();
  await expect(autoScroll).toHaveAttribute("aria-pressed", "false");

  // The meditation's own alarm, which takes the plan's answer until it is asked
  // (item 13). The plan's answer is **off** (item 8: "noone asked for an alarm-on on
  // this screen"), so the block's latch is off and its label says where that came
  // from; a press is what gives this meditation an answer of its own.
  const blockAlarm = page.getByRole("button", { name: /^Alarm \(/ });
  await expect(blockAlarm).toHaveAttribute("aria-pressed", "false");
  // The compact latch (round 19) adds no `On`/`Off` word to its name, but it still
  // says which answer it is showing, so the label is read as the whole name.
  await expect(blockAlarm).toHaveAccessibleName(/^Alarm \(the plan's answer\)$/);
  await page.getByRole("button", { name: "Done", exact: true }).click();

  // The plan's own switch, in the plan settings strip. It is a compact latch too, so
  // its name is the one word on it; `aria-pressed` is where the state is read.
  const planAlarm = page.locator("main").getByRole("button", { name: "Alarm", exact: true });
  await expect(planAlarm).toHaveAttribute("aria-pressed", "false");
  await planAlarm.click();
  await expect(planAlarm).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: /^Save/ }).click();
  // Nothing left to write: the button drops its `· unsaved` half.
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator("main").getByRole("button", { name: "Alarm", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Edit Third-Eye Chakra" }).click();
  await expect(page.getByRole("button", { name: "Auto-scroll", exact: true }).first())
    .toHaveAttribute("aria-pressed", "false");
  // And the block still takes the plan's alarm: it was never asked.
  await expect(page.getByRole("button", { name: /^Alarm \(/ })).toHaveAccessibleName(
    /^Alarm \(the plan's answer\)$/,
  );
});

test("the plan tools sit above the name, and only the add action below it", async ({ page }) => {
  await page.goto("/plan");
  const name = (await page.getByRole("textbox", { name: "Plan name" }).boundingBox())!;
  const duplicate = (await page.getByRole("button", { name: "Duplicate plan" }).boundingBox())!;
  // One action, not two: the owner's round 15 replaced `Add focus` and `Add cool-off`
  // with one **Add meditation block** that asks which meditation.
  const addMeditation = (await page
    .getByRole("button", { name: "Add meditation block" })
    .boundingBox())!;
  expect(duplicate.y + duplicate.height, "tools above the name").toBeLessThanOrEqual(name.y);
  expect(addMeditation.y, "add actions below the name").toBeGreaterThanOrEqual(name.y + name.height);
  // The navigation bar names this screen; the page must not repeat it.
  await expect(page.getByRole("heading", { name: "Plan", exact: true })).toHaveCount(0);
});

test("every plan card lines up, with its controls on the card's foot", async ({ page }) => {
  await page.goto("/plan");
  const cards = page.locator(".overflow-y-hidden > div");
  await expect(cards.first()).toBeVisible();
  expect((await cards.count()), "the seeded plan has blocks").toBeGreaterThan(1);
  const boxes = await cards.evaluateAll((els) =>
    els.map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        height: Math.round(rect.height),
      };
    }),
  );
  expect(new Set(boxes.map((b) => b.top)).size, "one row").toBe(1);
  expect(new Set(boxes.map((b) => b.height)).size, "all cards the same height").toBe(1);
  // The card's own controls sit together on its foot rather than on its title line
  // (the owner's round 18 moved them there), so they are at one height across every
  // card — a card whose meditation has a long name is still the same row of buttons.
  const controls = await page
    .locator('button[aria-label^="Edit "], button[aria-label^="Remove "]')
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().bottom)));
  expect(controls.length, "two controls per card").toBe(boxes.length * 2);
  expect(new Set(controls).size, "one row of controls").toBe(1);
  expect(boxes[0]!.bottom - controls[0]!, "on the card's foot").toBeLessThan(40);
});

test("an armed Remove disarms itself after five seconds", async ({ page }) => {
  await page.goto("/plan");
  await page.locator('button[aria-label^="Remove "]').first().click();
  // The armed control still names what it will remove, which is why the label — not
  // just the word on the button — is what the second press is answering.
  const armed = page.locator('button[aria-label$="?"]').first();
  await expect(armed).toBeVisible();
  // Armed is a light red fill; the press that follows is the dark one.
  await expect(armed).toHaveClass(/bg-destructive\/20/);
  await expect(page.locator('button[aria-label$="?"]')).toHaveCount(0, { timeout: 8_000 });
  await expect(page.locator('button[aria-label^="Remove "]').first()).toBeVisible();
});

test("a block card only slides sideways", async ({ page }) => {
  await page.goto("/plan");
  const handle = page.getByRole("button", { name: "Drag Third-Eye Chakra block" }).first();
  await handle.hover();
  const start = (await handle.boundingBox())!;
  expect(start).not.toBeNull();
  await page.mouse.down();
  // Straight up: the card used to ride out of the row and over the controls
  // above it. It must stay on its own line.
  await page.mouse.move(start.x + start.width / 2, start.y - 180, { steps: 10 });
  const dragged = (await handle.boundingBox())!;
  expect(Math.abs(dragged.y - start.y), "no vertical travel while dragging").toBeLessThan(4);
  await page.mouse.up();
});
