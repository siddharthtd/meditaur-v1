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

  // The stages are one row (item 3). The plan opens with Thanks Giving, which has **two**
  // stages since round 26 — its ten-second Declaration and the minute of affirmations it reads
  // — and `Scroll` is drawn for them, because affirmations is one of the two kinds that are
  // read.
  const strip = page.locator("[data-stage-strip]");
  await expect(strip.locator("li")).toHaveCount(2);
  await expect(strip.locator("li").first()).toHaveAttribute("data-active", "true");
  // The scroll latch is a footer latch like the alarm's — the compact `sm` switch,
  // so its name is the word on it — and it is drawn here because an
  // affirmations stage is one of the two kinds that are read.
  const scrollLatch = page.getByRole("button", { name: "Scroll", exact: true });
  await expect(scrollLatch).toHaveAttribute("aria-pressed", "true");
  // Binaural is the mark in the stage's name, and an affirmations stage is silent
  // (§12.12), so the mark is drawn as information and there is no control to press.
  await expect(strip.locator('span[title="Binaural is off for this stage"]')).toHaveCount(2);
  await expect(page.getByRole("button", { name: /^Binaural for / })).toHaveCount(0);

  // A chakra's strip is **four** stages since round 26 — the Declaration, the intentions, the
  // symbols and the focus — and the two that can carry tones carry the mark as a switch.
  const start = page.getByRole("button", { name: "Start", exact: true });
  await start.click();
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(strip.locator("li")).toHaveCount(4);
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
  // A Protection block opens on the **Declaration** that leads every meditation since round 26;
  // its own sentence is read on the affirmation stage after it.
  await expect(page.locator("#run-intentions")).toHaveText("Declaration");
  await page.getByRole("button", { name: "Affirmation stage" }).click();
  await expect(page.locator("#run-intentions")).toHaveText("Affirmation");
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

test("a block with nothing to show draws no rail, and the intentions take its room", async ({
  page,
}) => {
  // The owner's round 16, items 2 and 8: a region with nothing to show is not drawn *and its room
  // goes to the intentions*. The plan opens on Thanks Giving, whose own `Location` is blank in the
  // seed and whose block has no symbols of its own — so this screen draws no rail at all: no panel
  // and no gap where one was. **Round 26 added the other case**, and it is the rail's: a block
  // with no symbols whose meditation *does* have a column with a value gets a rail holding the
  // meditation (see "a block with no symbols holds the meditation itself in its rail" below). So
  // this test is about "nothing to show", not about "no symbols".
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
  // is the first chakra's — and its **Intentions** stage, because a ten-second Declaration now
  // leads every meditation and one line has nowhere to scroll.
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await page.getByRole("button", { name: "Intentions stage" }).click();
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
  // The first chakra's **Intentions** stage again: the Declaration it opens on has one line and
  // nothing to scroll, and a seek holds the session until it is started once more.
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await page.getByRole("button", { name: "Intentions stage" }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
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
  // The seeded chakra opens with its ten-second **Declaration**, and `Intentions` is the stage
  // after it at 2:00 (the owner's round 26).
  await expect(minutes.first()).toHaveAttribute("aria-valuenow", "0");
  await expect(seconds.first()).toHaveAttribute("aria-valuenow", "10");
  await expect(minutes.nth(1)).toHaveAttribute("aria-valuenow", "2");

  // Every stage down to nothing — **both** columns, because the Declaration's ten seconds are
  // the seconds column's.
  for (let index = 0; index < rows; index += 1) {
    for (const [wheel, name] of [
      [minutes, "Minutes value"],
      [seconds, "Seconds value"],
    ] as const) {
      await wheel.nth(index).click();
      const box = page.getByRole("textbox", { name });
      await box.fill("0");
      await box.press("Enter");
      await expect(box).toHaveCount(0);
      await expect(wheel.nth(index)).toHaveAttribute("aria-valuenow", "0");
    }
  }

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
  // A focus tile, so the screen opens on a **one-block** session with four stages
  // and nothing has started yet — which is the state this test is about.
  await page.goto("/plan");
  await page.getByRole("button", { name: "Root Chakra", exact: true }).click();
  await expect(page).toHaveURL(/\/run\//);

  // Before Start: one row of wheels per stage, and they are the block's own set
  // times. `meditaur:e2eDurationMs` above overrides every stage to a minute, which
  // is what makes a whole session runnable in a test — the point here is that the
  // strip shows the stage's *own* length rather than a total.
  const minutes = page.getByRole("spinbutton", { name: "Minutes" });
  await expect(minutes).toHaveCount(4, { timeout: 60_000 });
  for (const index of [0, 1, 2, 3]) {
    await expect(minutes.nth(index)).toHaveAttribute("aria-valuenow", "1");
  }
  // And they still take an edit, which is the half of item 1 the editor does not
  // cover: a reader who is already on the run screen can set the length there.
  await minutes.nth(3).click();
  const box = page.getByRole("textbox", { name: "Minutes value" });
  await box.fill("7");
  await box.press("Enter");
  await expect(minutes.nth(3)).toHaveAttribute("aria-valuenow", "7");

  // A stage is pickable before Start (the extra ask that arrived after the round's
  // questions): the press highlights it and holds the session there.
  await page.getByRole("button", { name: "Focus stage" }).click();
  const active = page.locator("[data-stage-strip] li[data-active='true']");
  await expect(active).toHaveAttribute("data-stage", "3");
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled();

  await page.getByRole("button", { name: "Start", exact: true }).click();
  // Once it runs there is no spinbutton left anywhere: the same four pairs are
  // **readings**, in the same place, and the one on screen decrements. The stages
  // already walked read nothing, which is the strip telling the reader where they are.
  await expect(page.getByRole("spinbutton")).toHaveCount(0);
  const timers = page.locator("[data-stage-strip] [role='timer']");
  await expect(timers).toHaveCount(4);
  // The stages the reader has already walked read nothing, which is the strip
  // telling them where they are — and the one in play is still counting, so it is
  // not the zero the others read.
  await expect(timers.nth(0)).toContainText("0");
  await expect(timers.nth(1)).toContainText("0");
  await expect(timers.nth(2)).toContainText("0");
  await expect(timers.nth(3)).not.toContainText("0Minutes0Seconds");
  await expect(active).toHaveAttribute("data-stage", "3");
});

test("the whole stage card goes to its stage, and both switches share a side", async ({
  page,
}) => {
  // The owner's round 20, two asks about one card: *"it would look more classy if the
  // stage's toggles for binaural and reload stage would be on the same side (currently
  // binaural is on left and reload is on the right)"* and *"clicking anywhere on
  // meditation stage cards while the session has not started should take the user to
  // that stage, if the user wants to start at that stage (same behavior as pressing
  // the right arrow)"*.
  await page.addInitScript(() => {
    sessionStorage.setItem("meditaur:e2eDurationMs", "60000");
  });
  await page.goto("/plan");
  await page.getByRole("button", { name: "Root Chakra", exact: true }).click();
  await expect(page).toHaveURL(/\/run\//);
  await expect(page.getByRole("spinbutton", { name: "Minutes" })).toHaveCount(4, {
    timeout: 60_000,
  });

  // Both switches are at the card's **end** — the `♪` after the wheels, the `↺` after
  // that — while the name and its clock keep the reading order they had. The card
  // measured is `Symbols`, because it is one of the two kinds that carry the tones and
  // so draws the mark as a switch rather than as the quiet description a silent stage
  // gets. It is the **third** card since round 26: a Declaration leads every meditation.
  const card = page.locator("[data-stage-strip] li").nth(2);
  const name = (await card.getByRole("button", { name: "Symbols stage" }).boundingBox())!;
  const clock = (await card.getByRole("spinbutton", { name: "Seconds" }).boundingBox())!;
  const mark = (await card.getByRole("button", { name: "Binaural for Symbols" }).boundingBox())!;
  const restart = (await card.getByRole("button", { name: "Restart Symbols" }).boundingBox())!;
  expect(mark.x, "the binaural mark is on the card's right, not its left").toBeGreaterThan(name.x);
  expect(mark.x, "…and past the clock, so both switches share a side").toBeGreaterThan(
    clock.x + clock.width,
  );
  expect(restart.x, "and the stage's restart is beside it").toBeGreaterThan(mark.x);

  const active = page.locator("[data-stage-strip] li[data-active='true']");
  await expect(active).toHaveAttribute("data-stage", "0");

  // A press on the card's own padding — not on any control inside it — goes to that
  // stage, which is the extra ask that arrived with round 20. The point is the
  // bottom padding at the card's middle: clear of every control, and clear of the
  // rounded corner, where the card's own surface is all there is to press.
  const third = page.locator("[data-stage-strip] li").nth(3);
  const box = (await third.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 2);
  await expect(active).toHaveAttribute("data-stage", "3");

  // A press on a control stays that control's press. The wheels are still editable
  // before Start, so a press on one must not *also* jump the session — the wheel's
  // Escape stops the press here, which is what keeps this assertion about the card.
  await page.getByRole("spinbutton", { name: "Minutes" }).first().click();
  await page.keyboard.press("Escape");
  await expect(active, "the card's own press did not steal the wheel's").toHaveAttribute(
    "data-stage",
    "3",
  );

  // And once the session has started the card is a clock again, not a target: the
  // ask is about the state before Start.
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Go to / })).toHaveCount(0);
});

test("the arrow keys step a stage and a meditation, and never start the session", async ({
  page,
}) => {
  // The owner's round 17, item 9, quoted: *"pressing '→' once should take the user to
  // the next stage, and pressing it twice in 2 seconds should take you to the next
  // meditation. '←' … once will reset the stage timer, twice … previous stage and …
  // thrice … previous meditation in the circuit. Don't start the meditation though"* —
  // answered as *"hold until start is pressed. Not paused at all, clock should be
  // cleared."* Round 20 shortened the window itself to a second, without changing what
  // either gesture means.
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
  // Thanks Giving opens the circuit with two stages (its Declaration and its affirmation), so
  // it is also the block that proves `→→` reaches the next meditation rather than a stage.
  await expect(page.getByRole("heading", { name: "Thanks Giving" })).toBeVisible();
  await expect(active).toHaveAttribute("data-stage", "0");

  /**
   * Wait the window out before a gesture.
   *
   * The rule being tested is defined in wall-clock seconds — "twice in 1 second" since
   * the owner's round 20 — so a gesture has to start from a strip nobody has just
   * pressed. The presses *inside* a gesture are back to back, which is what makes them
   * one gesture.
   */
  const quiet = async () => {
    await page.waitForTimeout(1100);
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

test("a symbols stage shows the symbols in play, not the intentions", async ({ page }) => {
  // The owner's round 17, item 4: *"The symbol stage doesn't need to show me the
  // intentions, only symbols … They should be shown in the main region only instead
  // of the intentions."* Round 26 rebuilt what it draws: *"One big symbol at the top which
  // breathes and updates as the time passes. Rest of the symbols at the bottom in a single line
  // also breathing."*
  await page.addInitScript(() => {
    sessionStorage.setItem("meditaur:e2eDurationMs", "60000");
  });
  await page.goto("/plan");
  await page.getByRole("button", { name: "Root Chakra", exact: true }).click();
  await expect(page).toHaveURL(/\/run\//);
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled({
    timeout: 60_000,
  });

  // A chakra runs Declaration, Intentions, Symbols, Focus: press the stage's own card to step
  // to Symbols before starting, which is the same `seek` an arrow key makes.
  await page.getByRole("button", { name: "Symbols stage" }).click();
  await expect(page.locator("[data-stage-strip] li[data-active='true']")).toHaveAttribute(
    "data-stage",
    "2",
  );

  const stage = page.locator("[data-symbol-stage]");
  await expect(stage).toBeVisible();
  // The one in play, large and breathing, named on the region rather than as a caption.
  const main = page.locator("[data-symbol-main]");
  await expect(main).toBeVisible();
  await expect(main).toHaveAttribute("role", "img");
  // …and the block's symbols in one line beneath it, the one in play marked.
  const line = page.locator("[data-symbol-line] [data-symbol]");
  expect(await line.count(), "the stage's symbols, one each").toBeGreaterThan(1);
  await expect(page.locator("[data-symbol-line] [data-symbol='0']")).toHaveAttribute(
    "data-current",
    "true",
  );
  // All of the geometry below is measured with the breathing **frozen**. `breathe` is a
  // `transform: scale(1 → 1.045)` and the line is staggered, so a live `getBoundingClientRect`
  // measures the animation's phase rather than the box — a rerun of this spec on 2026-09-25
  // caught exactly that, with two distinct widths where the layout has one. The ring's own
  // geometry freezes it for the same reason.
  const frozen = await page.addStyleTag({
    content: "[data-symbol-line] [data-symbol], [data-symbol-main]{animation:none !important}",
  });
  const big = (await main.boundingBox())!;
  const small = (await line.first().boundingBox())!;
  expect(big.width, "the one in play is the large one").toBeGreaterThan(small.width * 2);
  // One size for the line, so it reads as a family rather than as a ranking.
  const sizes = await line.evaluateAll((nodes) =>
    nodes.map((node) => Math.round(node.getBoundingClientRect().width)),
  );
  await frozen.evaluate((node) => node.parentNode?.removeChild(node));
  expect(new Set(sizes).size, "one size for the line").toBe(1);
  // The line breathes with the big one: *"Rest of the symbols at the bottom in a single line also
  // breathing."*
  expect(await line.first().evaluate((node) => getComputedStyle(node).animationName)).toBe(
    "breathe",
  );

  // The intentions column is not drawn for this stage at all, and the main region
  // says which one it is.
  await expect(page.locator("[data-intentions-scroll]")).toHaveCount(0);
  await expect(page.locator("[data-region='symbols']")).toBeVisible();
  // The rail is **kept** here since round 26 — the owner: *"the focus stage has a side-panel, so
  // it will be retained and utilized to properly stay in step with the big symbol"* — so the
  // stage's pictures and the panel that names the one in play are one reading.
  await expect(page.getByRole("region", { name: "Symbol", exact: true })).toBeVisible();

  // **And the rail follows the clock**, which is the half that was broken on the focus stage and
  // is why both stages are clock-driven now: the panel's heading is the symbol the big one is
  // showing.
  const shown = await main.getAttribute("aria-label");
  await expect(page.getByRole("region", { name: "Symbol", exact: true })).toContainText(
    shown!.replace(" symbol", ""),
  );

  // On to Focus: the big symbol and the line give way to the ring, the rail goes, and the
  // intentions column is still absent.
  await page.getByRole("button", { name: "Focus stage" }).click();
  await expect(page.locator("[data-stage-strip] li[data-active='true']")).toHaveAttribute(
    "data-stage",
    "3",
  );
  const focus = page.locator("[data-region='focus']");
  await expect(focus).toBeVisible();
  expect((await focus.boundingBox())!.height, "the region keeps its space").toBeGreaterThan(100);
  await expect(page.locator("[data-symbol-stage]")).toHaveCount(0);
  await expect(page.locator("[data-intentions-scroll]")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Symbol", exact: true })).toHaveCount(0);
});

/**
 * Focus is a ring: every symbol the same size, in a circle, around the meditation (round 26).
 *
 * Round 20 asked for the artwork — *"beautiful visuals of the chakra's picture in its colour, as
 * well as all the symbols in the same colour breathing etc. occupying the entire space that was
 * earlier occupied by the intentions table"* — and round 26 gave the stage its own shape: *"all
 * the symbols in a circle (without any boxes like they are today), all of the same size, all of
 * them breathing"*, with the meditation *"at the centre of the circle"*. The assertions are those
 * four things: the ring, one size, the breathing, and the space.
 */
test("a focus stage draws every symbol as an equal ring around the meditation", async ({
  page,
}) => {
  test.slow();
  // A minute a stage, so the clock's hold on the ring is observable inside a test rather than
  // forty-five seconds a symbol.
  await page.addInitScript(() => {
    sessionStorage.setItem("meditaur:e2eDurationMs", "60000");
  });
  await page.goto("/plan");
  await page.getByRole("button", { name: "Root Chakra", exact: true }).click();
  await expect(page).toHaveURL(/\/run\//);
  // The session is loaded when its own `Start` is offered, which is what makes the
  // stage strip's cards actionable — the same wait the symbols test makes.
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled({
    timeout: 60_000,
  });
  // Declaration, Intentions, Symbols, Focus: the fourth card is Focus, and the press is the same
  // `seek` an arrow key makes.
  await page.getByRole("button", { name: "Focus stage" }).click();
  await expect(page.locator("[data-stage-strip] li[data-active='true']")).toHaveAttribute(
    "data-stage",
    "3",
  );

  const visuals = page.locator("[data-focus-visuals]");
  await expect(visuals).toBeVisible();
  // **The entire space the intentions table would have had**: the region's own box, filled.
  const focus = (await page.locator("[data-region='focus']").boundingBox())!;
  const drawn = (await visuals.boundingBox())!;
  expect(drawn.height, "the visuals fill the region").toBeGreaterThan(focus.height - 4);

  // The meditation's picture — drawn as a glyph here, because this chakra has none
  // uploaded — in the chakra's own colour, which is the accent the app already uses.
  const picture = page.locator("[data-focus-chakra]");
  await expect(picture).toBeVisible();
  await expect(picture.locator("svg")).toHaveCount(1);
  const accent = await visuals.evaluate((node) => getComputedStyle(node).color);
  expect(accent, "in its colour").not.toBe("rgb(0, 0, 0)");
  expect(await picture.evaluate((node) => getComputedStyle(node).color)).toBe(accent);

  // **And every symbol, all of them the same size, in the same colour.**
  const symbols = page.locator("[data-focus-symbol]");
  const count = await symbols.count();
  expect(count, "every symbol of the block, not just one").toBeGreaterThan(1);
  expect(
    await symbols.first().evaluate((node) => getComputedStyle(node).color),
    "in the same colour as the picture",
  ).toBe(accent);
  /**
   * The ring's geometry, measured with the breathing **frozen**.
   *
   * The symbols breathe on a stagger, so a live `getBoundingClientRect` measures the animation's
   * phase rather than the box — and a stagger means the phases are never equal, so under load this
   * assertion did fail (a 2px breath, rounded, is a second size). What it is about is the
   * **layout** size, so the animation is taken off for the geometry and put back for the breathing
   * assertion below, which reads the animation by name and needs it running.
   */
  const frozen = await page.addStyleTag({
    content: "[data-focus-symbol]{animation:none !important}",
  });
  const sizes = await symbols.evaluateAll((nodes) =>
    nodes.map((node) => Math.round(node.getBoundingClientRect().width)),
  );
  expect(new Set(sizes).size, "all of the same size").toBe(1);

  // The ring itself: one radius for every symbol, and a seat each. Measured from the meditation's
  // own centre, which is what "the symbols ring the meditation" means.
  const middle = (await picture.boundingBox())!;
  const centre = [middle.x + middle.width / 2, middle.y + middle.height / 2];
  const seats = await symbols.evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)];
    }),
  );
  const radii = seats.map(([x, y]) => Math.round(Math.hypot(x! - centre[0]!, y! - centre[1]!)));
  await frozen.evaluate((node) => node.parentNode?.removeChild(node));
  expect(new Set(radii).size, "one radius, so it is a circle").toBe(1);
  expect(radii[0], "and a real ring, not a pile at the centre").toBeGreaterThan(
    middle.width / 2,
  );
  expect(new Set(seats.map((seat) => seat.join(","))).size, "a seat each").toBe(count);
  // Clockwise from the top, evenly: a quarter of the ring between neighbours at four symbols.
  const angles = seats
    .map((seat) => (Math.atan2(seat[0]! - centre[0]!, -(seat[1]! - centre[1]!)) * 180) / Math.PI)
    .map((angle) => (angle + 360) % 360)
    .sort((a, b) => a - b);
  for (let index = 1; index < angles.length; index += 1) {
    expect(
      Math.abs(angles[index]! - angles[index - 1]! - 360 / count),
      "evenly spaced",
    ).toBeLessThan(2);
  }

  // Breathing, unless the reader asked their machine for less motion.
  await expect(visuals).toHaveAttribute("data-breathe", "on");
  expect(await symbols.first().evaluate((node) => getComputedStyle(node).animationName)).toBe(
    "breathe",
  );

  // **And the clock still drives it**: the symbol marked `data-current` moves on as the stage
  // runs, which is the defect round 26 reported — *"on the current focus screen, the symbol
  // side-panel doesn't advance with time"*. The focus stage has no rail of its own any more, so
  // the ring's own mark is where that is visible.
  const marked = () =>
    page
      .locator("[data-focus-symbol]")
      .evaluateAll((nodes) => nodes.findIndex((node) => node.dataset.current === "true"));
  const before = await marked();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect
    .poll(marked, { timeout: 30_000, message: "the ring follows the clock" })
    .not.toBe(before);

  // And a reader who asked their machine for less motion gets the same picture, still —
  // the rule the intentions column follows, which is why the state is on the DOM rather
  // than only in a class name.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.getByRole("button", { name: "Focus stage" }).click();
  await expect(page.locator("[data-focus-visuals]")).toHaveAttribute("data-breathe", "off");
  expect(
    await page
      .locator("[data-focus-symbol]")
      .first()
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("none");
  // …and the picture is still drawn: less motion, not less picture.
  await expect(page.locator("[data-focus-chakra] svg")).toHaveCount(1);
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

test("a block with no symbols holds the meditation itself in its rail", async ({ page }) => {
  // The owner's round 26, ask 11: *"if it is a chakra-only intention, the side-panel should
  // display the details of the chakra."* The seeded circuit's Thanks Giving block is that shape —
  // it has no symbols of its own, so before this its stage drew the columns in a strip and no
  // panel at all. Thanks Giving's own `Location` is blank in the seed, and a blank column is not a
  // reason to draw anything, so the reader's own value is what this test puts there first.
  await page.addInitScript(() => {
    // A stage long enough that the block's first stage is still the one on screen.
    sessionStorage.setItem("meditaur:e2eDurationMs", "60000");
  });
  await page.goto("/database");
  const gotIt = page.getByRole("button", { name: "Got it" });
  if (await gotIt.isVisible().catch(() => false)) await gotIt.click();
  await page
    .locator("[data-database-tables]")
    .getByRole("button", { name: "Thanks Giving", exact: true })
    .click();
  const location = page.getByRole("textbox", { name: "Thanks Giving — Location" });
  await location.fill("Wherever I am");
  await location.press("Enter");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.goto("/plan");
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page).toHaveURL(/\/run\//);
  await expect(page.getByRole("heading", { name: "Thanks Giving" })).toBeVisible();

  // The panel holds the meditation: the column the reader set, and no heading, because the name
  // above it is already the session's title — the round-16 reason the panel that repeated it was
  // deleted.
  const rail = page.locator('[data-rail="meditation"]');
  await expect(rail).toBeVisible();
  await expect(rail.getByText("Wherever I am")).toBeVisible();
  await expect(rail.getByRole("heading")).toHaveCount(0);
  // …and the strip stood down, so that column is drawn once rather than twice.
  await expect(page.locator("[data-meditation-facts]")).toHaveCount(0);
});

test("a sentence's tag is a cell, and editing the declaration's words keeps it", async ({
  page,
}) => {
  // `P4 · 60`, both halves. Round 26 gave a sentence a **tag** and made a declaration stage read
  // the workspace's declarations, so a tag has to be writable — the seeded one was the only
  // Declaration there could ever be. And because a grid write is the **whole row**, the write has
  // to carry the tag: a draft that dropped it would tell the store the sentence had none, so
  // editing the declaration's own words would quietly empty the pool its stage reads.
  await page.addInitScript(() => {
    sessionStorage.setItem("meditaur:e2eDurationMs", "60000");
  });
  await page.goto("/database");
  const gotIt = page.getByRole("button", { name: "Got it" });
  if (await gotIt.isVisible().catch(() => false)) await gotIt.click();
  await page
    .locator("[data-database-tables]")
    .getByRole("button", { name: "Affirmations", exact: true })
    .click();

  const declaration = page.getByRole("textbox", {
    name: /I declare this as the front and back/,
  });
  await expect(declaration).toBeVisible();
  // The Tag cell says what the app seeded the sentence as, in the reader's own words. The chip's
  // accessible name is the action it offers as well as its value ("Declaration — open or clear"),
  // which is why this is a prefix rather than an exact word.
  const row = declaration.locator("xpath=ancestor::tr");
  await expect(row.getByRole("button", { name: /^Declaration/ })).toBeVisible();

  await declaration.fill("I declare this as the front and back of my <> indeed");
  await declaration.press("Enter");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // The Declaration stage still reads it — its words, with the block's own meditation substituted
  // in — which is the half a dropped tag would have taken away.
  await page.goto("/plan");
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page).toHaveURL(/\/run\//);
  await expect(page.getByRole("heading", { name: "Thanks Giving" })).toBeVisible();
  await expect(
    page.getByText(/I declare this as the front and back of my Thanks Giving indeed/),
  ).toBeVisible();
});
