import { expect, test } from "@playwright/test";

test("create, switch, and delete plans without select elements", async ({ page }) => {
  await page.goto("/plan");
  await expect(page.getByRole("textbox", { name: "Plan name" })).toHaveValue("Circuit session");
  await page.getByRole("button", { name: "New plan" }).click();
  await expect(page.getByRole("textbox", { name: "Plan name" })).toHaveValue("New session");
  await page.getByRole("button", { name: "Delete plan" }).click();
  await page.getByRole("button", { name: "Delete New session?" }).click();
  await expect(page.getByRole("textbox", { name: "Plan name" })).toHaveValue("Circuit session");
  await page.getByRole("button", { name: "New plan" }).click();
  await expect(page.getByRole("textbox", { name: "Plan name" })).toHaveValue("New session");
  await page.getByRole("button", { name: "Switch plan" }).click();
  await expect(page.getByRole("heading", { name: "Plans" })).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
  await page.getByRole("button", { name: "Circuit session" }).click();
  await expect(page.getByRole("textbox", { name: "Plan name" })).toHaveValue("Circuit session");
  await expect(page.locator("select")).toHaveCount(0);
});

test("duplicate copies the current session onto a new plan", async ({ page }) => {
  await page.goto("/plan");
  await expect(page.getByRole("textbox", { name: "Plan name" })).toHaveValue("Circuit session");
  await page.getByRole("button", { name: "Duplicate plan" }).click();
  await expect(page.getByRole("textbox", { name: "Plan name" })).toHaveValue("Circuit session copy");
  await page.getByRole("button", { name: "Switch plan" }).click();
  await expect(page.getByRole("button", { name: "Circuit session", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Circuit session copy", exact: true })).toBeVisible();
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
  await page.goto("/plan");
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
  await page.goto("/plan");
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
  await page.goto("/plan");
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
  await page.goto("/plan");
  const minutes = page.getByRole("spinbutton", { name: "Minutes" }).first();
  // A press that does not turn the wheel opens the text box over it — the part
  // the owner says already works, kept working by the rewrite.
  await minutes.click();
  const field = page.getByRole("textbox", { name: "Minutes value" });
  await field.fill("12");
  await field.press("Enter");
  await expect(minutes).toHaveAttribute("aria-valuenow", "12");
  // Escape abandons an edit; the wheel keeps the value it had.
  await minutes.click();
  await page.getByRole("textbox", { name: "Minutes value" }).fill("3");
  await page.keyboard.press("Escape");
  await expect(minutes).toHaveAttribute("aria-valuenow", "12");
});

test("a block card names every field it changes", async ({ page }) => {
  await page.goto("/plan");
  // The card's buttons show a centred small-caps field name over their value, so
  // the whole `Focus: Heart Chakra` line is the accessible name. Hold on to it:
  // it is the only handle a reader (or a screen reader) has on which field is
  // which now that the value is the loud part.
  for (const field of ["Focus", "Symbol", "Binaural", "Table", "Ambient", "Alarm"]) {
    await expect(
      page.getByRole("button", { name: new RegExp(`^${field}: \\S`) }).first(),
    ).toBeVisible();
  }
});

test("the plan tools sit above the name, and only the add buttons below it", async ({ page }) => {
  await page.goto("/plan");
  const name = (await page.getByRole("textbox", { name: "Plan name" }).boundingBox())!;
  const duplicate = (await page.getByRole("button", { name: "Duplicate plan" }).boundingBox())!;
  const addFocus = (await page.getByRole("button", { name: "Add focus" }).boundingBox())!;
  expect(duplicate.y + duplicate.height, "tools above the name").toBeLessThanOrEqual(name.y);
  expect(addFocus.y, "add actions below the name").toBeGreaterThanOrEqual(name.y + name.height);
  // The navigation bar names this screen; the page must not repeat it.
  await expect(page.getByRole("heading", { name: "Plan", exact: true })).toHaveCount(0);
});

test("every plan card lines up, with Remove on its top line", async ({ page }) => {
  await page.goto("/plan");
  const cards = page.locator(".overflow-y-hidden > div");
  await expect(cards.first()).toBeVisible();
  expect((await cards.count()), "the seeded plan has blocks").toBeGreaterThan(1);
  const boxes = await cards.evaluateAll((els) =>
    els.map((el) => {
      const rect = el.getBoundingClientRect();
      return { top: Math.round(rect.top), height: Math.round(rect.height) };
    }),
  );
  expect(new Set(boxes.map((b) => b.top)).size, "one row").toBe(1);
  expect(new Set(boxes.map((b) => b.height)).size, "all cards the same height").toBe(1);
  // The remove sits on the card's title line, so it is at the same height on a
  // card with six fields and on one with three.
  const removes = await page
    .getByRole("button", { name: "Remove", exact: true })
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  expect(new Set(removes).size, "Remove on the top line of every card").toBe(1);
  expect(removes[0]! - boxes[0]!.top, "Remove on the first line").toBeLessThan(40);
});

test("an armed Remove disarms itself after five seconds", async ({ page }) => {
  await page.goto("/plan");
  await page.getByRole("button", { name: "Remove", exact: true }).first().click();
  const armed = page.getByRole("button", { name: "Remove?" }).first();
  await expect(armed).toBeVisible();
  // Armed is a light red fill; the press that follows is the dark one.
  await expect(armed).toHaveClass(/bg-destructive\/20/);
  await expect(page.getByRole("button", { name: "Remove?" })).toHaveCount(0, { timeout: 8_000 });
  await expect(page.getByRole("button", { name: "Remove", exact: true }).first()).toBeVisible();
});

test("a block card only slides sideways", async ({ page }) => {
  await page.goto("/plan");
  const handle = page.getByRole("button", { name: "Drag focus block" }).first();
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
