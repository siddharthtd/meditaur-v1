import { expect, test } from "@playwright/test";

/** A real 1x1 RGBA PNG, so the library accepts it and the browser can paint it. */
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

test("start a session from the planner without select elements", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("meditaur:e2eDurationMs", "200");
  });
  await page.goto("/plan");
  await expect(page.getByRole("textbox", { name: "Plan name" })).toHaveValue("Chakra circuit");
  // The planner's start action is named for what it does; it used to say `Load`.
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page).toHaveURL(/\/run\//);
  await expect(page.getByRole("link", { name: "Plan" })).toHaveCount(0);
  // `exact`, because the footer carries `Restart meditation` and a three
  // `Restart`-es of its own on the strip: Playwright's `name` is a case-insensitive
  // substring, so a bare `Start` matches them too.
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
  // A plan with several blocks is exactly where `Advance` still decides
  // something, so the footer keeps it.
  await expect(page.getByRole("button", { name: "Advance" })).toBeVisible();
});

test("the transport is four squares of one size, and the strip is one short line", async ({
  page,
}) => {
  // The owner's round 19 asked for exactly three shapes on this screen: the stage
  // cards as short as their wheels (item 2), the controls as wordless squares of one
  // size (items 5 and 6), and two keys in the legend (item 4). Each is measured here
  // rather than described, because "smaller" and "the same size" are geometry.
  await page.addInitScript(() => {
    sessionStorage.setItem("meditaur:e2eDurationMs", "60000");
  });
  await page.goto("/plan");
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page).toHaveURL(/\/run\//);

  // One line of stage cards, and a card is its wheel window (3 rows of 36px) plus its
  // own padding — before item 2 it carried a label row above and a restart below, at
  // ~190px.
  const strip = page.locator("[data-stage-strip]");
  await expect(strip.locator("li").first()).toBeVisible();
  const stripBox = (await strip.boundingBox())!;
  expect(Math.round(stripBox.height), "a card is its wheels and nothing more")
    .toBeLessThan(140);

  // The legend is the two keys that still do something here.
  await expect(page.locator("kbd")).toHaveCount(2);
  await expect(page.locator("kbd", { hasText: "Esc" })).toHaveCount(1);
  await expect(page.locator("kbd", { hasText: "Space" })).toHaveCount(1);

  // The four transport controls are one square, whichever of them is drawn.
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const boxes = [];
  for (const name of ["Pause", "Skip", "Stop", "Restart meditation"]) {
    const box = await page.getByRole("button", { name, exact: true }).boundingBox();
    expect(box, `${name} is on the footer`).not.toBeNull();
    boxes.push(`${Math.round(box!.width)}x${Math.round(box!.height)}`);
  }
  expect(new Set(boxes).size, `one shape, got ${boxes.join(", ")}`).toBe(1);
  // And they are squares: a wordless control has nothing to be wider for.
  const [width, height] = boxes[0]!.split("x").map(Number);
  expect(Math.abs(width! - height!), "square").toBeLessThanOrEqual(1);
});

test("the run screen carries the alarm latch and the switches", async ({ page }) => {
  // §12.21: the alarm is session-level like `Auto-advance`, so its latch sits beside
  // it in the footer. Binaural is **in the stage's name** (round 16, item 0.2) and
  // the scroll switch is in that same footer, drawn only for a stage that scrolls
  // (item 1). Both are read here rather than assumed, because a control that is not
  // drawn is the same to a reader as a control that does nothing.
  await page.addInitScript(() => {
    sessionStorage.setItem("meditaur:e2eDurationMs", "60000");
  });
  await page.goto("/plan");
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page).toHaveURL(/\/run\//);
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled({
    timeout: 60_000,
  });

  // The footer: the alarm always, `Advance` too because this plan has nine blocks.
  // Both are the compact `sm` switch since the owner's round 19, item 5, so their
  // accessible name is the word on them alone — the `On`/`Off` word went with the
  // full-width shape. The alarm starts **off**: the owner's round 17 turned the
  // default around — "noone asked for an alarm-on on this screen, it always was an
  // alarm - off here" — so a press is what turns it on, and it is the reader's.
  const alarmLatch = page.getByRole("button", { name: "Alarm", exact: true });
  await expect(alarmLatch).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Advance" })).toBeVisible();
  await alarmLatch.click();
  await expect(alarmLatch).toHaveAttribute("aria-pressed", "true");

  // The stages are one row (item 3). The plan opens with Thanks Giving, which has
  // one stage, and `Scroll` is drawn for it — affirmations is one of the two
  // kinds that are read, which is the whole point of a Thanks Giving stage.
  const strip = page.locator("[data-stage-strip]");
  await expect(strip.locator("li")).toHaveCount(1);
  await expect(strip.locator("li").first()).toHaveAttribute("data-active", "true");
  // The scroll latch is a footer latch like the alarm's — the compact `sm` switch,
  // so its name is the word on it — and it is drawn here because an
  // affirmations stage is one of the two kinds that are read.
  const scrollLatch = page.getByRole("button", { name: "Scroll", exact: true });
  await expect(scrollLatch).toHaveAttribute("aria-pressed", "true");
  // Binaural is the mark in the stage's name, and an affirmations stage is silent
  // (§12.12), so the mark is drawn as information and there is no control to press.
  await expect(strip.locator('span[title="Binaural is off for this stage"]')).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^Binaural for / })).toHaveCount(0);

  // A chakra's strip is three stages, and the two that can carry tones carry the
  // mark as a switch.
  const start = page.getByRole("button", { name: "Start", exact: true });
  await start.click();
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(strip.locator("li")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Binaural for Symbols" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Binaural for Focus" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Binaural for Intentions" })).toHaveCount(0);
});

test("a Protection block reads its own sentence, not an empty stage", async ({ page }) => {
  // The owner's round 16, item 0.1 — the report that made this round change the
  // model. The stage said *"Nothing for this stage."* because it read the
  // Affirmations table, which is empty, while the sentence the owner remembered had
  // always been a line on a Protection x Zonar row. A block now reads the sentences
  // written about **its own** meditation (§2.1), so the seeded sentence is what the
  // reader sees, with no seed change at all.
  await page.addInitScript(() => {
    sessionStorage.setItem("meditaur:e2eDurationMs", "60000");
  });
  await page.goto("/plan");
  await page.getByRole("button", { name: "Protection", exact: true }).click();
  await expect(page).toHaveURL(/\/run\//);
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled({
    timeout: 60_000,
  });
  // A Protection block opens on its first affirmations stage.
  await expect(page.locator("#run-intentions")).toHaveText("Affirmations");
  const column = page.locator("[data-intentions-scroll]");
  await expect(column).toBeVisible();
  // The seeded sentence is written on **two** of Protection's rows — Zonar's and
  // Rama's — so it reads twice, once per row, which is the order the reader put it
  // in. What matters is that it is there at all: before this round the stage said
  // there was nothing.
  await expect(
    column.getByText(/wholly and completely protected/).first(),
    "Protection's own sentence, not the reader's global list",
  ).toBeVisible();
});

test("a block with no symbols has no symbol region, and the intentions take its room", async ({
  page,
}) => {
  // The owner's round 16, items 2 and 8: Thanks Giving never has symbols, and the
  // rule is the general one — a region with nothing to show is not drawn *and its
  // room goes to the intentions*. The plan opens on Thanks Giving, so this is the
  // screen a reader meets first: no rail, no gap where one was.
  await page.addInitScript(() => {
    sessionStorage.setItem("meditaur:e2eDurationMs", "60000");
  });
  await page.goto("/plan");
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page).toHaveURL(/\/run\//);
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled({
    timeout: 60_000,
  });
  await expect(page.getByRole("region", { name: "Symbol" })).toHaveCount(0);
  const screen = (await page.locator("main").boundingBox())!;
  // Measured on the **region**, not on the scroller inside it: Thanks Giving has no
  // sentences of its own until the reader writes one, so this block's intentions
  // region says so rather than scrolling. What the test is about is the room it
  // takes, not its contents.
  const table = (await page.locator("[data-region='intentions']").boundingBox())!;
  // A rail is 10–14rem plus a gap, so a drawn one would put the table 11rem or more
  // from the screen's own edge. The screen's `px-4` is what is left.
  expect(table.x - screen.x, "the intentions start at the screen's own edge").toBeLessThan(40);
  expect(
    screen.width - table.width,
    "and they take the width the rail would have used",
  ).toBeLessThan(48);
});

test("focus tile starts a session without select elements", async ({ page }) => {
  // Long enough that the block is still on screen when the assertions run: a
  // one-block session at 200 ms is over before the panel can be read.
  await page.addInitScript(() => {
    sessionStorage.setItem("meditaur:e2eDurationMs", "60000");
  });
  await page.goto("/plan");
  await page.getByRole("button", { name: "Root Chakra", exact: true }).click();
  await expect(page).toHaveURL(/\/run\//);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  // Root Chakra is bound to two symbols, and the panel heads itself with the one
  // whose lines are at the top of the column (§6.2) — Halu's pair comes first.
  await expect(
    page.getByRole("region", { name: "Symbol" }).getByRole("heading", { level: 2 }),
  ).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
});

test("reduced motion holds the intentions column still until the reader asks", async ({
  page,
}) => {
  // §6.3, the half that has teeth: the stage's own switch is **on** and the column
  // still does not move, because the reader's system asked for less motion. The
  // other half — that their own press overrules it — is the next test. The
  // arithmetic underneath is guarded by `tests/unit/web/scroll-rate.test.ts`.
  test.slow();
  await page.addInitScript(() => {
    sessionStorage.setItem("meditaur:e2eDurationMs", "60000");
  });
  await page.emulateMedia({ reducedMotion: "reduce" });

  await page.goto("/plan");
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page).toHaveURL(/\/run\//);
  const start = page.getByRole("button", { name: "Start", exact: true });
  await expect(start).toBeEnabled({ timeout: 60_000 });
  await start.click();
  // Thanks Giving opens the plan with nothing to read, so the block this is about
  // is the first chakra's.
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  const column = page.locator("[data-intentions-scroll]");
  await expect(column).toBeVisible();
  const overflow = await column.evaluate((node) => node.scrollHeight - node.clientHeight);
  expect(overflow, "the block has more lines than the column can show").toBeGreaterThan(40);
  expect(
    await column.getAttribute("data-auto-scroll"),
    "the stage's own switch is on, so the preference is what is holding it",
  ).toBe("held");
  await page.waitForTimeout(2000);
  expect(
    await column.evaluate((node) => node.scrollTop),
    "a reader who asked for less motion gets a still column",
  ).toBe(0);
});

test("the reader's own Auto-scroll press overrules reduced motion", async ({ page }) => {
  // The escape hatch §6.3 promises: the preference is the default, not a lock. The
  // switch is pressed twice so that the flag ends where it started — the only
  // difference from the test above is that the reader asked for it.
  test.slow();
  await page.addInitScript(() => {
    sessionStorage.setItem("meditaur:e2eDurationMs", "60000");
  });
  await page.emulateMedia({ reducedMotion: "reduce" });

  await page.goto("/plan");
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page).toHaveURL(/\/run\//);
  const autoScroll = page.getByRole("button", { name: "Scroll", exact: true });
  await expect(autoScroll).toHaveAttribute("aria-pressed", "true");
  await autoScroll.click();
  await expect(autoScroll).toHaveAttribute("aria-pressed", "false");
  await autoScroll.click();
  await expect(autoScroll).toHaveAttribute("aria-pressed", "true");

  const start = page.getByRole("button", { name: "Start", exact: true });
  await expect(start).toBeEnabled({ timeout: 60_000 });
  await start.click();
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  const column = page.locator("[data-intentions-scroll]");
  await expect(column).toBeVisible();
  await page.waitForTimeout(2000);
  expect(
    await column.evaluate((node) => node.scrollTop),
    "a reader's own press overrules the preference",
  ).toBeGreaterThan(0);
});

test("shows a symbol's picture in its panel on the run screen", async ({ page }) => {
  // Four navigations and a session start on top of a Database save: three times
  // the work of a typical test. Same remedy as the Display test (`0244b89`); no
  // assertion is relaxed.
  test.slow();
  // Long enough for the picture and the panel to be read, like the test above.
  await page.addInitScript(() => {
    sessionStorage.setItem("meditaur:e2eDurationMs", "60000");
  });

  // A symbol's picture is a column of the Symbols table, so it is set in the grid
  // and written by the grid's own Save — on **Halu**, because that is the pair the
  // panel shows first for this block. The Database is a route of its own, with a
  // nav entry — there is no library tab to press any more.
  await page.goto("/database");
  await page
    .locator("[data-database-tables]")
    .getByRole("button", { name: "Symbols", exact: true })
    .click();
  await page.getByLabel("Halu picture").setInputFiles({
    name: "halu.png",
    mimeType: "image/png",
    buffer: Buffer.from(PNG_1X1, "base64"),
  });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // The focus tile compiles every symbol bound to the meditation, so the
  // picture has to arrive through the snapshot, not through a library lookup.
  await page.goto("/plan");
  await page.getByRole("button", { name: "Root Chakra", exact: true }).click();
  await expect(page).toHaveURL(/\/run\//);
  const symbol = page.getByRole("region", { name: "Symbol" });
  await expect(symbol.getByRole("heading", { name: "Halu" })).toBeVisible();
  await expect(symbol.getByRole("img", { name: "Halu symbol" })).toBeVisible();
});

test("re-acquires the screen wake lock when the tab comes back", async ({ page }) => {
  // Nothing has watched this path before: real Wake Lock does not exist in
  // headless Chromium and the run screen swallows its absence, so both the first
  // request and the re-request are invisible without a stub. The stub is also
  // the count — there is nothing else to ask.
  await page.addInitScript(() => {
    // Long enough that the session is still live when the tab comes back.
    sessionStorage.setItem("meditaur:e2eDurationMs", "60000");
    const requests: string[] = [];
    (window as unknown as { wakeLockRequests: string[] }).wakeLockRequests = requests;
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: async (type: string) => {
          requests.push(type);
          return { release: async () => undefined };
        },
      },
    });
  });

  const requests = () =>
    page.evaluate(
      () => (window as unknown as { wakeLockRequests: string[] }).wakeLockRequests.length,
    );
  // Drive the state instead of reading it: a headless page's own
  // `visibilityState` is not something this test should depend on.
  const setVisibility = (state: "hidden" | "visible") =>
    page.evaluate((value) => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => value,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    }, state);

  await page.goto("/plan");
  // The planner's own button is "Start session", which `name: "Start"` would
  // also match — so wait for the navigation before reaching for the run
  // screen's control, and then name it exactly.
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page).toHaveURL(/\/run\//);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  expect(await requests()).toBe(1);

  // Hiding is what loses the lock. Nothing should take it back on the way out.
  await setVisibility("hidden");
  expect(await requests()).toBe(1);
  await setVisibility("visible");
  await expect.poll(requests).toBe(2);

  // A paused session is still a session: the screen has to stay awake for it.
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await setVisibility("hidden");
  await setVisibility("visible");
  await expect.poll(requests).toBe(3);
});

test("publishes a media session while a session is live", async ({ page }) => {
  // Stubbed for the same reason as the wake lock: the API exists in this browser
  // and does nothing observable, so without a stub the difference between "set
  // the handlers" and "never called them" is invisible. What the stub records is
  // the part that silently rots — the three action names, the playback state
  // (which Web Audio has no element to supply, so Android has nothing to show
  // without it), and whether the lock-screen entry is named after the block or
  // left as the fallback.
  await page.addInitScript(() => {
    sessionStorage.setItem("meditaur:e2eDurationMs", "60000");
    const calls: string[] = [];
    const titles: Array<string | null> = [];
    const states: string[] = [];
    (window as unknown as { mediaSessionCalls: string[] }).mediaSessionCalls = calls;
    (window as unknown as { mediaSessionTitles: Array<string | null> }).mediaSessionTitles =
      titles;
    (window as unknown as { mediaSessionStates: string[] }).mediaSessionStates = states;
    let metadata: MediaMetadata | null = null;
    let playbackState = "none";
    Object.defineProperty(navigator, "mediaSession", {
      configurable: true,
      value: {
        get metadata(): MediaMetadata | null {
          return metadata;
        },
        set metadata(value: MediaMetadata | null) {
          metadata = value;
          titles.push(value?.title ?? null);
        },
        get playbackState(): string {
          return playbackState;
        },
        set playbackState(value: string) {
          playbackState = value;
          states.push(value);
        },
        setActionHandler(action: string, handler: unknown) {
          calls.push(handler ? `set:${action}` : `clear:${action}`);
        },
      },
    });
  });

  const calls = () =>
    page.evaluate(
      () => (window as unknown as { mediaSessionCalls: string[] }).mediaSessionCalls,
    );
  const titles = () =>
    page.evaluate(
      () =>
        (window as unknown as { mediaSessionTitles: Array<string | null> }).mediaSessionTitles,
    );
  const playbackStates = () =>
    page.evaluate(
      () => (window as unknown as { mediaSessionStates: string[] }).mediaSessionStates,
    );

  await page.goto("/plan");
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page).toHaveURL(/\/run\//);
  // Nothing live yet, so nothing should be claimed on the lock screen.
  expect((await calls()).filter((call) => call.startsWith("set:"))).toEqual([]);

  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await expect.poll(async () => (await calls()).join(",")).toContain("set:stop");
  expect(await calls()).toContain("set:pause");
  expect(await calls()).toContain("set:play");
  // Named after the block, not the fallback title.
  const title = (await titles()).at(-1);
  expect(typeof title).toBe("string");
  expect(title).not.toBe("Meditaur session");

  // The state, not just the handlers. Nothing here plays through an `<audio>`
  // element, so a session left at `none` is one Android may show no controls for
  // at all — which is what the owner found on a Galaxy S26 in round 11.
  await expect.poll(async () => (await playbackStates()).at(-1)).toBe("playing");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect.poll(async () => (await playbackStates()).at(-1)).toBe("paused");
});

test("a one-chakra session ends by itself and claims nothing it has not got", async ({
  page,
}) => {
  // The owner's round 11, runs A and B. With auto-advance off and a single block,
  // the clock reached 0:00 and the screen offered Stop and Skip with nothing to
  // skip to — and it announced a `Cool-off` that had never been configured,
  // because the fallback meant for a cool-off *block* was being drawn on a screen
  // that had no block at all. There is also nothing to queue next, so the footer
  // has no business offering to queue it.
  await page.addInitScript(() => {
    sessionStorage.setItem("meditaur:e2eDurationMs", "200");
  });
  await page.goto("/plan");
  await page.getByRole("button", { name: "Root Chakra", exact: true }).click();
  await expect(page).toHaveURL(/\/run\//);
  await expect(page.getByRole("button", { name: "Advance" })).toHaveCount(0);

  await page.getByRole("button", { name: "Start", exact: true }).click();
  // The session finishes without anybody pressing anything: no Skip to offer.
  await expect(page.getByRole("button", { name: "Start another session" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Skip" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0);
  await expect(page.getByText("Cool-off")).toHaveCount(0);
});

test("a block set to 0:00 rings at once and closes the session", async ({ page }) => {
  // The same round: "you can set 0:00 and hit start, that will sound the alarm
  // instantly and close off the session". The wheels always allowed zero —
  // `SessionEngine` refused it, and `saveSessionStageDuration` refused it a second
  // time, which is why the minutes wheel sprang back. Set here through the wheel's
  // own text box, which is the interaction a reader uses, and read back off both
  // columns before Start: a display that agrees with itself is not the same as a
  // length the engine took.
  //
  // Round 15 gave a block one timer per stage, so "this block is zero" is now every
  // one of its rows: a chakra runs intentions, symbols and focus, and zeroing one of
  // them only ends that stage.
  await page.goto("/plan");
  await page.getByRole("button", { name: "Root Chakra", exact: true }).click();
  await expect(page).toHaveURL(/\/run\//);

  const minutes = page.getByRole("spinbutton", { name: "Minutes" });
  const seconds = page.getByRole("spinbutton", { name: "Seconds" });
  // Wait for the screen to be the block's timer rows before counting them: the
  // address changes before the snapshot is loaded, and counting at that moment
  // reads zero wheels.
  await expect(minutes.first()).toBeVisible({ timeout: 60_000 });
  const rows = await minutes.count();
  expect(rows, "the block's stages, each with its own wheels").toBeGreaterThan(1);
  // The seeded chakra's first stage is `Intentions`
  await expect(minutes.first()).toHaveAttribute("aria-valuenow", "2");

  for (let index = 0; index < rows; index += 1) {
    await minutes.nth(index).click();
    const box = page.getByRole("textbox", { name: "Minutes value" });
    await box.fill("0");
    await box.press("Enter");
    await expect(box).toHaveCount(0);
    await expect(minutes.nth(index)).toHaveAttribute("aria-valuenow", "0");
  }
  await expect(seconds.first()).toHaveAttribute("aria-valuenow", "0");

  await page.getByRole("button", { name: "Start", exact: true }).click();
  // Nothing to wait for: every stage ends as it begins, so the block is over and the
  // session is done before the alarm has finished ringing, with no Stop/Skip pair to
  // sit on.
  await expect(page.getByRole("button", { name: "Start another session" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Skip" })).toHaveCount(0);
});

test("a stage's wheels are the clock, and stop taking edits once the session runs", async ({
  page,
}) => {
  // The owner's round 17, item 2: *"rather than the timer on top of the page, I would
  // want to see the actual wheels for the 3 stages decrementing automatically (once
  // the session starts, these can become read-only (no more modification) and display
  // the decreasing time in the same place for each block)."*
  await page.addInitScript(() => {
    sessionStorage.setItem("meditaur:e2eDurationMs", "60000");
  });
  // A focus tile, so the screen opens on a **one-block** session with three stages
  // and nothing has started yet — which is the state this test is about.
  await page.goto("/plan");
  await page.getByRole("button", { name: "Root Chakra", exact: true }).click();
  await expect(page).toHaveURL(/\/run\//);

  // Before Start: one row of wheels per stage, and they are the block's own set
  // times. `meditaur:e2eDurationMs` above overrides every stage to a minute, which
  // is what makes a whole session runnable in a test — the point here is that the
  // strip shows the stage's *own* length rather than a total.
  const minutes = page.getByRole("spinbutton", { name: "Minutes" });
  await expect(minutes).toHaveCount(3, { timeout: 60_000 });
  for (const index of [0, 1, 2]) {
    await expect(minutes.nth(index)).toHaveAttribute("aria-valuenow", "1");
  }
  // And they still take an edit, which is the half of item 1 the editor does not
  // cover: a reader who is already on the run screen can set the length there.
  await minutes.nth(2).click();
  const box = page.getByRole("textbox", { name: "Minutes value" });
  await box.fill("7");
  await box.press("Enter");
  await expect(minutes.nth(2)).toHaveAttribute("aria-valuenow", "7");

  // A stage is pickable before Start (the extra ask that arrived after the round's
  // questions): the press highlights it and holds the session there.
  await page.getByRole("button", { name: "Focus stage" }).click();
  const active = page.locator("[data-stage-strip] li[data-active='true']");
  await expect(active).toHaveAttribute("data-stage", "2");
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled();

  await page.getByRole("button", { name: "Start", exact: true }).click();
  // Once it runs there is no spinbutton left anywhere: the same three pairs are
  // **readings**, in the same place, and the one on screen decrements. The stages
  // already walked read nothing, which is the strip telling the reader where they are.
  await expect(page.getByRole("spinbutton")).toHaveCount(0);
  const timers = page.locator("[data-stage-strip] [role='timer']");
  await expect(timers).toHaveCount(3);
  // The stages the reader has already walked read nothing, which is the strip
  // telling them where they are — and the one in play is still counting, so it is
  // not the zero the others read.
  await expect(timers.nth(0)).toContainText("0");
  await expect(timers.nth(1)).toContainText("0");
  await expect(timers.nth(2)).not.toContainText("0Minutes0Seconds");
  await expect(active).toHaveAttribute("data-stage", "2");
});

test("the arrow keys step a stage and a meditation, and never start the session", async ({
  page,
}) => {
  // The owner's round 17, item 9, quoted: *"pressing '→' once should take the user to
  // the next stage, and pressing it twice in 2 seconds should take you to the next
  // meditation. '←' … once will reset the stage timer, twice … previous stage and …
  // thrice … previous meditation in the circuit. Don't start the meditation though"* —
  // answered as *"hold until start is pressed. Not paused at all, clock should be
  // cleared."*
  await page.addInitScript(() => {
    sessionStorage.setItem("meditaur:e2eDurationMs", "60000");
  });
  test.slow();
  await page.goto("/plan");
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page).toHaveURL(/\/run\//);
  const start = page.getByRole("button", { name: "Start", exact: true });
  await expect(start).toBeEnabled({ timeout: 60_000 });
  const active = page.locator("[data-stage-strip] li[data-active='true']");
  // Thanks Giving opens the circuit with one stage, so it is also the block that
  // proves `→` alone goes nowhere: there is no next stage to step to.
  await expect(page.getByRole("heading", { name: "Thanks Giving" })).toBeVisible();
  await expect(active).toHaveAttribute("data-stage", "0");

  /**
   * Wait the window out before a gesture.
   *
   * The rule being tested is defined in wall-clock seconds — "twice in 2 seconds" —
   * so a gesture has to start from a strip nobody has just pressed. The presses
   * *inside* a gesture are back to back, which is what makes them one gesture.
   */
  const quiet = async () => {
    await page.waitForTimeout(2100);
  };

  // `→→` from a one-stage block is the next **meditation** — and neither press
  // started anything: the screen still offers Start.
  await quiet();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("heading", { name: "Third-Eye Chakra" })).toBeVisible();
  await expect(active).toHaveAttribute("data-stage", "0");
  await expect(start).toBeEnabled();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toHaveCount(0);

  // `→` once: the next stage of this meditation.
  await quiet();
  await page.keyboard.press("ArrowRight");
  await expect(active).toHaveAttribute("data-stage", "1");
  await expect(start).toBeEnabled();

  // `→→`: the next meditation again, this time from a block in the middle of its
  // stages.
  await quiet();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("heading", { name: "Throat Chakra" })).toBeVisible();
  await expect(active).toHaveAttribute("data-stage", "0");
  await expect(start).toBeEnabled();

  // `←←←`: back a meditation, to its first stage — however many stages the block in
  // between has.
  await quiet();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("heading", { name: "Third-Eye Chakra" })).toBeVisible();
  await expect(active).toHaveAttribute("data-stage", "0");
  // Still nothing running: that is the whole of "Don't start the meditation though."
  await expect(start).toBeEnabled();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toHaveCount(0);

  // The whole meditation has a restart of its own, and it is the same move.
  await quiet();
  await page.keyboard.press("ArrowRight");
  await expect(active).toHaveAttribute("data-stage", "1");
  await page.getByRole("button", { name: "Restart meditation" }).click();
  await expect(active).toHaveAttribute("data-stage", "0");
  await expect(start).toBeEnabled();
});

test("a symbols stage shows the symbols, not the intentions", async ({ page }) => {
  // The owner's round 17, item 4: *"The symbol stage doesn't need to show me the
  // intentions, only symbols … They should be shown in the main region only instead
  // of the intentions."* The half that says the symbol **in play** follows the clock
  // (`stage-progress.ts`) is the unit test's subject — `progressIndex` is the
  // arithmetic, and a stage is a minute long here.
  await page.addInitScript(() => {
    sessionStorage.setItem("meditaur:e2eDurationMs", "60000");
  });
  await page.goto("/plan");
  await page.getByRole("button", { name: "Root Chakra", exact: true }).click();
  await expect(page).toHaveURL(/\/run\//);
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled({
    timeout: 60_000,
  });

  // Root Chakra runs Intentions, Symbols, Focus: step to the symbols stage before
  // starting, which is the same `seek` a press on the stage's own name makes.
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("[data-stage-strip] li[data-active='true']")).toHaveAttribute(
    "data-stage",
    "1",
  );

  const gallery = page.locator("[data-symbol-gallery]");
  await expect(gallery).toBeVisible();
  // A sheet rather than a name: this chakra has several symbols bound to it.
  expect(
    await gallery.locator("[data-symbol]").count(),
    "the stage's symbols, one cell each",
  ).toBeGreaterThan(1);
  await expect(gallery.locator("[data-symbol='0']")).toHaveAttribute("data-current", "true");
  // The intentions column is not drawn for this stage at all, and the main region
  // says which one it is.
  await expect(page.locator("[data-intentions-scroll]")).toHaveCount(0);
  await expect(page.locator("[data-region='symbols']")).toBeVisible();
  // The panel beside it is still the symbol's, which is what the sheet is *about*.
  // `exact`, because the sheet's own region is named `Symbols`.
  await expect(page.getByRole("region", { name: "Symbol", exact: true })).toBeVisible();
});

test("a session link that leads nowhere says so, and does not offer a dead Start", async ({
  page,
}) => {
  // Found by reading the code in round 11, fixed in round 12. `Start` called
  // `SessionEngine.start()`, which fails `session.notLoaded` while no snapshot is
  // loaded — and the handler is `void start()`, so the press did **nothing at
  // all**. The empty screen behind it explained nothing either, because a load
  // that found no snapshot was silent. A stale or mistyped `/run/<id>`, or a
  // snapshot the prune has taken, is how a reader gets here.
  await page.goto("/run/3f1c2b0a-0000-4000-8000-000000000000");
  await expect(page.getByText("This session is no longer on this device.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeDisabled();
});
