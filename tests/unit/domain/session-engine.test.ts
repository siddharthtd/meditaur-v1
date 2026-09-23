import { describe, expect, it } from "vitest";
import {
  compilePlan,
  FakeClock,
  RecordingAudioPort,
  SessionEngine,
  type CompileOptions,
  type EngineEvent,
} from "@meditaur/domain";
import {
  makeBlock,
  makeEntries,
  makeMeditation,
  makeMeditationType,
  makePlan,
  makePreset,
  makeSymbol,
  stageFixture,
} from "../../fixtures/library.ts";

const library = {
  meditationTypes: [makeMeditationType()],
  meditations: [makeMeditation("fp1", "Root")],
  symbols: [makeSymbol("s1", "Lam"), makeSymbol("s2", "Earth")],
  ...makeEntries([
    { meditationId: "fp1", symbolId: "s1", texts: ["A1"] },
    { meditationId: "fp1", symbolId: "s2", texts: ["A2"] },
  ]),
  fieldDefs: [],
  fieldOptions: [],
  fieldValues: [],
  presets: [makePreset()],
};

function setup(
  planExtra: Parameters<typeof makePlan>[1] = {},
  blocks?: ReturnType<typeof makeBlock>[],
  compileExtra: CompileOptions = {},
) {
  const clock = new FakeClock();
  const audio = new RecordingAudioPort();
  const plan = makePlan(
    blocks ?? [
      makeBlock("b1", 0, { durationMs: 1000, symbolId: "s1" }),
      // Three meditation blocks, each on a different symbol, so a walk shows the
      // intentions change. There is no cool-off block any more (the owner's round
      // 15), which is why the middle one is a meditation like the others.
      makeBlock("b2", 1, { durationMs: 1000, symbolId: "s2" }),
      makeBlock("b3", 2, { durationMs: 1000, symbolId: "s1" }),
    ],
    planExtra,
  );
  const snapshot = compilePlan(plan, library, { now: 0, id: () => "inst", ...compileExtra });
  const engine = new SessionEngine(clock, audio);
  const events: EngineEvent[] = [];
  engine.subscribe((e) => events.push(e));
  engine.load(snapshot);
  return { clock, audio, engine, events, snapshot };
}

function types(events: EngineEvent[]): string[] {
  return events.map((e) => e.type);
}

describe("SessionEngine", () => {
  it("exposes instanceId after load", () => {
    const { engine } = setup();
    expect(engine.getSnapshot().instanceId).toBe("inst");
  });

  it("refuses load while a session is live", async () => {
    const { engine, snapshot } = setup();
    await engine.start();
    expect(() => engine.load({ ...snapshot, instanceId: "other" })).toThrow(
      /already running/,
    );
    expect(engine.getSnapshot().instanceId).toBe("inst");
    expect(engine.getSnapshot().status).toBe("running");
  });

  it("refuses load while paused", async () => {
    const { engine, snapshot } = setup({}, [
      makeBlock("b1", 0, { durationMs: 5000, symbolId: "s1" }),
    ]);
    await engine.start();
    engine.pause();
    expect(() => engine.load({ ...snapshot, instanceId: "other" })).toThrow(
      /already running/,
    );
    expect(engine.getSnapshot().status).toBe("paused");
  });

  it("allows load after stop", async () => {
    const { engine, snapshot } = setup();
    await engine.start();
    engine.stop();
    engine.load({ ...snapshot, instanceId: "other" });
    expect(engine.getSnapshot().instanceId).toBe("other");
    expect(engine.getSnapshot().status).toBe("loaded");
  });

  it("completes a single block", async () => {
    const { clock, engine, events } = setup({}, [
      makeBlock("b1", 0, { durationMs: 1000, symbolId: "s1" }),
    ]);
    await engine.start();
    clock.advance(1200);
    expect(types(events)).toContain("completed");
    expect(engine.getSnapshot().status).toBe("completed");
  });

  it("changes intention payload on an A-B-A auto-advance", async () => {
    const { clock, engine } = setup();
    await engine.start();
    expect(engine.getSnapshot().block?.intentions).toEqual(["A1"]);
    clock.advance(1200);
    expect(engine.getSnapshot().block?.intentions).toEqual(["A2"]);
    clock.advance(1200);
    expect(engine.getSnapshot().block?.intentions).toEqual(["A1"]);
  });

  it("pause freezes remaining time", async () => {
    const { clock, engine } = setup({}, [
      makeBlock("b1", 0, { durationMs: 5000, symbolId: "s1" }),
    ]);
    await engine.start();
    clock.advance(2000);
    engine.pause();
    const remaining = engine.getSnapshot().remainingMs;
    expect(remaining).toBe(3000);
    clock.advance(10_000);
    expect(engine.getSnapshot().status).toBe("paused");
    expect(engine.getSnapshot().remainingMs).toBe(3000);
    await engine.resume();
    clock.advance(3200);
    expect(engine.getSnapshot().status).toBe("completed");
  });

  it("repeats for cycleCount 2", async () => {
    const { clock, engine, events } = setup({ cycleCount: 2 }, [
      makeBlock("b1", 0, { durationMs: 1000, symbolId: "s1" }),
    ]);
    await engine.start();
    clock.advance(1200);
    expect(events.filter((e) => e.type === "cycleStart")).toHaveLength(2);
    clock.advance(1200);
    expect(types(events)).toContain("completed");
  });

  it("does not complete when cycleUntilStopped", async () => {
    const { clock, engine } = setup({ cycleUntilStopped: true, cycleCount: 1 }, [
      makeBlock("b1", 0, { durationMs: 1000, symbolId: "s1" }),
    ]);
    await engine.start();
    clock.advance(5000);
    expect(engine.getSnapshot().status).toBe("running");
    expect(engine.getSnapshot().cycleIndex).toBeGreaterThan(1);
  });

  it("skip moves to the next block", async () => {
    const { engine } = setup({ autoAdvance: false });
    await engine.start();
    engine.skipToNext();
    expect(engine.getSnapshot().blockIndex).toBe(1);
  });

  it("a block with no preset calls setBinaural null", async () => {
    const { audio, engine } = setup({}, [
      makeBlock("b1", 0, { durationMs: 1000, binauralPresetId: null }),
      makeBlock("b2", 1, { durationMs: 1000 }),
    ]);
    await engine.start();
    expect(audio.calls.some((c) => c === "setBinaural:null")).toBe(true);
  });

  it("fades binaural before alarm when stopBinauralOnAlarm is set", async () => {
    const { audio, clock, engine } = setup(
      {},
      [makeBlock("b1", 0, { durationMs: 1000, symbolId: "s1" })],
      { stopBinauralOnAlarm: true },
    );
    await engine.start();
    clock.advance(1000);
    const fade = audio.calls.indexOf("fadeOutBinaural");
    const alarm = audio.calls.findIndex((c) => c.startsWith("playAlarm:"));
    expect(fade).toBeGreaterThanOrEqual(0);
    expect(alarm).toBeGreaterThan(fade);
  });

  it("ducks binaural during alarm when stop is off", async () => {
    const { audio, clock, engine } = setup(
      {},
      [makeBlock("b1", 0, { durationMs: 1000, symbolId: "s1" })],
      { stopBinauralOnAlarm: false },
    );
    await engine.start();
    clock.advance(1000);
    const duck = audio.calls.indexOf("duckBinaural");
    const alarm = audio.calls.findIndex((c) => c.startsWith("playAlarm:"));
    expect(duck).toBeGreaterThanOrEqual(0);
    expect(alarm).toBeGreaterThan(duck);
    expect(audio.calls).not.toContain("fadeOutBinaural");
    clock.advance(200);
    expect(audio.calls).toContain("restoreBinaural");
  });

  it("rings nothing when the session's alarm switch is off", async () => {
    // The alarm's scope (round 15, 2026-09-19) and its default (round 17 reversed
    // it, 2026-09-21). The plan's switch is the session's, a block may answer for
    // itself, and off means the block's end is silent: no alarm asset, no `alarm`
    // event, and no ducking, because the duck exists to make room for the alarm.
    const { audio, clock, engine, events } = setup({ alarmEnabled: false }, [
      makeBlock("b1", 0, { durationMs: 1000, symbolId: "s1" }),
      makeBlock("b2", 1, { durationMs: 1000, symbolId: "s2" }),
    ]);
    await engine.start();
    clock.advance(1200);
    expect(types(events)).toContain("blockEnd");
    expect(types(events)).not.toContain("alarm");
    expect(audio.calls.some((c) => c.startsWith("playAlarm:"))).toBe(false);
    expect(audio.calls).not.toContain("duckBinaural");
    // The session still moved on, which is what `autoAdvance` decides — the alarm
    // was never what did the advancing.
    expect(engine.getSnapshot().blockIndex).toBe(1);
    expect(engine.getSnapshot().status).toBe("running");
  });

  it("takes the alarm switch mid-block, and the next end obeys it", async () => {
    const { clock, engine, events } = setup({}, [
      makeBlock("b1", 0, { durationMs: 1000, symbolId: "s1" }),
      makeBlock("b2", 1, { durationMs: 1000, symbolId: "s2" }),
    ]);
    await engine.start();
    expect(engine.getSnapshot().alarmEnabled).toBe(true);
    engine.setAlarmEnabled(false);
    expect(engine.getSnapshot().alarmEnabled).toBe(false);
    clock.advance(1200);
    expect(types(events)).not.toContain("alarm");
  });

  it("moves a stage's own switches, and only the stage that is playing", async () => {
    // §12.21: binaural and auto-scroll belong to the stage. Before Start every row
    // is editable (that is when the screen draws them); once it is running only the
    // stage on screen moves, exactly as its timer does.
    const { audio, clock, engine } = setup({}, [
      makeBlock("b1", 0, {
        symbolId: "s1",
        stages: [
          stageFixture(1000, {
            key: "intentions",
            kind: "intentions",
            binaural: false,
            autoScroll: true,
          }),
          stageFixture(1000, { key: "symbols", kind: "symbols", binaural: true }),
        ],
      }),
    ]);

    engine.setStageFlag("autoScroll", false, 1);
    expect(engine.getSnapshot().block?.stages[1]?.autoScroll).toBe(false);
    expect(engine.getSnapshot().block?.stages[0]?.autoScroll).toBe(true);

    await engine.start();
    // The stage that is playing: the tones move now rather than at the boundary.
    engine.setStageFlag("binaural", false, 0);
    expect(engine.getSnapshot().block?.stages[0]?.binaural).toBe(false);
    expect(audio.calls.at(-1)).toBe("setBinaural:null");

    // A stage that has already gone is not editable any more.
    const before = engine.getSnapshot().block?.stages[1]?.binaural;
    engine.setStageFlag("binaural", false, 1);
    expect(engine.getSnapshot().block?.stages[1]?.binaural).toBe(before);
    clock.advance(100);
  });

  it("expires a block whose timer the hidden tab never ran", async () => {
    // Two blocks, because `autoAdvance: false` only waits for a skip while there
    // is somewhere to skip to: a one-block session now finishes on its own.
    const { audio, clock, engine, events } = setup(
      { autoAdvance: false },
      [
        makeBlock("b1", 0, { durationMs: 1000, symbolId: "s1" }),
        makeBlock("b2", 1, { durationMs: 1000, symbolId: "s2" }),
      ],
    );
    await engine.start();
    // The tab goes hidden: time passes and the callback due at 1000 does not run.
    clock.setNow(5000);
    expect(types(events)).not.toContain("blockEnd");

    engine.resync();
    expect(types(events).filter((t) => t === "blockEnd")).toHaveLength(1);
    expect(types(events).filter((t) => t === "alarm")).toHaveLength(1);
    expect(audio.calls.filter((c) => c.startsWith("playAlarm:"))).toHaveLength(1);
    expect(engine.getSnapshot().status).toBe("awaitingSkip");

    // The timer it was sitting on is gone, so running time on changes nothing.
    clock.advance(10_000);
    expect(types(events).filter((t) => t === "alarm")).toHaveLength(1);
  });

  it("resyncs a block that is still running without restarting it", async () => {
    const { clock, engine, events } = setup(
      { autoAdvance: false },
      [makeBlock("b1", 0, { durationMs: 1000, symbolId: "s1" })],
    );
    await engine.start();
    clock.setNow(400);
    engine.resync();
    engine.resync();
    expect(types(events)).not.toContain("blockEnd");

    // The deadline did not move, so the block still ends when it always would.
    // Had `resync` re-armed the countdown from 400, it would now be due at 1400.
    clock.setNow(1000);
    clock.advance(1);
    expect(types(events).filter((t) => t === "blockEnd")).toHaveLength(1);
    expect(types(events).filter((t) => t === "alarm")).toHaveLength(1);
  });

  it("ignores resync once the session is no longer running", async () => {
    const { clock, engine, events } = setup(
      { autoAdvance: false },
      [makeBlock("b1", 0, { durationMs: 1000, symbolId: "s1" })],
    );
    await engine.start();
    engine.stop();
    clock.setNow(5000);
    engine.resync();
    expect(types(events)).not.toContain("blockEnd");
    expect(types(events)).not.toContain("alarm");
  });

  it("takes a block of zero, and rings it as soon as it starts", async () => {
    const { audio, clock, engine, events } = setup({ autoAdvance: false }, [
      makeBlock("b1", 0, { durationMs: 1000, symbolId: "s1" }),
    ]);
    engine.setStageDuration(0);
    expect(engine.getSnapshot().remainingMs).toBe(0);

    await engine.start();
    clock.advance(0);
    expect(types(events).filter((t) => t === "alarm")).toHaveLength(1);
    expect(audio.calls.filter((c) => c.startsWith("playAlarm:"))).toHaveLength(1);

    // The owner's round 11: the alarm rings at once and the session closes behind
    // it, rather than leaving a Skip with nowhere to go.
    clock.advance(200);
    expect(engine.getSnapshot().status).toBe("completed");
    expect(types(events)).toContain("completed");
  });

  it("ends a one-block session instead of waiting for a skip", async () => {
    const { clock, engine } = setup({ autoAdvance: false }, [
      makeBlock("b1", 0, { durationMs: 1000, symbolId: "s1" }),
    ]);
    await engine.start();
    clock.advance(1000);
    // Still running: the alarm is holding, and the completion is behind it.
    expect(engine.getSnapshot().status).toBe("running");
    clock.advance(200);
    expect(engine.getSnapshot().status).toBe("completed");
  });

  it("still waits for a skip when the cycle comes round again", async () => {
    const { clock, engine } = setup(
      { autoAdvance: false, cycleCount: 2 },
      [makeBlock("b1", 0, { durationMs: 1000, symbolId: "s1" })],
    );
    await engine.start();
    clock.advance(1000);
    clock.advance(200);
    // The same block is queued again, so auto-advance still has something to
    // decide and the reader is still asked.
    expect(engine.getSnapshot().status).toBe("awaitingSkip");

    engine.skipToNext();
    clock.advance(1000);
    clock.advance(200);
    // Nothing follows the last cycle, so this one ends.
    expect(engine.getSnapshot().status).toBe("completed");
  });
});

/**
 * The three faults the 2026-09-15 architectural review listed under "a hostile audio
 * layer" — the audio layer itself, and the two places the engine's own state
 * machine could be stopped from outside it.
 *
 * Each test fails on the code as it was before this round: the first left
 * `start()` rejected with the machine still `loaded`, the second left the block
 * with no expiry timer at all, and the third rang one block's alarm twice.
 */
describe("SessionEngine against a hostile audio layer", () => {
  /** One block, no alarm asset, so the hold is the engine's own 200 ms floor. */
  function twoBlocks() {
    return setup({ autoAdvance: true }, [
      makeBlock("b1", 0, { durationMs: 1000, symbolId: "s1" }),
      makeBlock("b2", 1, { durationMs: 1000, symbolId: "s2" }),
    ]);
  }

  it("starts the clock when the audio layer refuses to resume", async () => {
    const { clock, audio, engine, events } = twoBlocks();
    // What a browser does before the reader has touched the page: the promise
    // `AudioContext.resume()` returns rejects.
    audio.resume = () => Promise.reject(new Error("NotAllowedError"));

    await expect(engine.start()).resolves.toBeUndefined();
    expect(engine.getSnapshot().status).toBe("running");
    // The clock is real, not just the status: the block still ends and rings.
    clock.advance(1000);
    expect(events.filter((event) => event.type === "alarm")).toHaveLength(1);
  });

  it("keeps the clock when a listener throws", async () => {
    const { clock, engine, events } = twoBlocks();
    // A screen that throws while handling an event. `emit` runs on the way to
    // arming the block's expiry, so this used to take the timer chain with it.
    engine.subscribe(() => {
      throw new Error("a screen that broke");
    });
    const seen: string[] = [];
    engine.subscribe((event) => seen.push(event.type));

    await engine.start();
    clock.advance(1000);
    // The listener that does not throw still hears everything…
    expect(seen).toContain("blockEnd");
    // …and the session is where the clock says it is.
    expect(events.some((event) => event.type === "blockEnd")).toBe(true);
  });

  it("rings one alarm per block when Pause is pressed while it rings", async () => {
    const { clock, engine, events } = twoBlocks();
    await engine.start();
    clock.advance(1000);
    expect(events.filter((event) => event.type === "alarm")).toHaveLength(1);
    // The hold is on, and the reader presses Pause inside it.
    expect(engine.getSnapshot().holdingAlarm).toBe(true);

    engine.pause();
    // Nothing to pause: the block is over, so the press is refused rather than
    // clearing the hold and leaving a `0 ms` block to resume into.
    expect(engine.getSnapshot().status).toBe("running");

    clock.advance(200);
    expect(events.filter((event) => event.type === "alarm")).toHaveLength(1);
    expect(engine.getSnapshot().blockIndex).toBe(1);
    // The second block's own alarm is still a second alarm, at its own end.
    clock.advance(1000);
    expect(events.filter((event) => event.type === "alarm")).toHaveLength(2);
  });

  it("ignores a length change while the alarm rings, as its own doc promises", async () => {
    const { clock, engine, events } = twoBlocks();
    await engine.start();
    clock.advance(1000);

    // `setStageDuration`'s doc: "Set while the alarm rings it is ignored: that
    // stage is over." It was not: the press re-armed the finished stage, so it
    // rang a second time and the session never advanced.
    engine.setStageDuration(5000);
    clock.advance(200);
    expect(events.filter((event) => event.type === "alarm")).toHaveLength(1);
    expect(engine.getSnapshot().blockIndex).toBe(1);
    // And the length did not leak onto the stage that replaced it.
    expect(engine.getSnapshot().block?.stages[0]?.durationMs).toBe(1000);
  });

  describe("stages", () => {
    /** A block of three stages, so a boundary is somewhere in the middle. */
    function threeStages() {
      return makeBlock("b1", 0, {
        stages: [
          stageFixture(1000, { key: "intentions", label: "Intentions", kind: "intentions", binaural: false, autoScroll: true }),
          stageFixture(500, { key: "symbols", label: "Symbols", kind: "symbols", binaural: true }),
          stageFixture(700, { key: "focus", label: "Focus", kind: "focus", binaural: true }),
        ],
      });
    }

    it("rings once, at the end of the block, not at a stage boundary", async () => {
      const { clock, engine, events, audio } = setup({ autoAdvance: false }, [threeStages()]);
      await engine.start();
      expect(engine.getSnapshot().stageIndex).toBe(0);

      clock.advance(1000);
      // The first stage ended and the second began: no alarm, and the block did not
      // end. This is the owner's §12.11 — *"the alarm rings once, at the end of the
      // whole block, for every type"*.
      expect(types(events)).toContain("stageStart");
      expect(types(events)).toContain("stageEnd");
      expect(types(events)).not.toContain("alarm");
      expect(types(events)).not.toContain("blockEnd");
      expect(engine.getSnapshot().status).toBe("running");
      expect(engine.getSnapshot().stageIndex).toBe(1);

      clock.advance(500);
      expect(engine.getSnapshot().stageIndex).toBe(2);
      expect(types(events)).not.toContain("alarm");

      clock.advance(700);
      expect(events.filter((event) => event.type === "alarm")).toHaveLength(1);
      expect(events.filter((event) => event.type === "blockEnd")).toHaveLength(1);
      expect(audio.calls.filter((call) => call.startsWith("playAlarm:"))).toHaveLength(1);
    });

    it("reads the stage's remaining against the block's own", async () => {
      const { clock, engine } = setup({}, [threeStages()]);
      await engine.start();
      expect(engine.getSnapshot().remainingMs).toBe(1000);
      // The block is every stage, the clock is the one on screen.
      expect(engine.getSnapshot().blockRemainingMs).toBe(2200);
      expect(engine.getSnapshot().stageCount).toBe(3);

      clock.advance(1000);
      expect(engine.getSnapshot().remainingMs).toBe(500);
      expect(engine.getSnapshot().blockRemainingMs).toBe(1200);
      expect(engine.getSnapshot().stage?.label).toBe("Symbols");
    });

    it("does not restart the tones when two stages both want them", async () => {
      const { clock, audio, engine } = setup({}, [threeStages()]);
      await engine.start();
      // Binaural is off for the intentions stage (§12.12), so the block starts
      // silent: one call, and it is the null one.
      const afterStart = audio.calls.filter((call) => call.startsWith("setBinaural"));
      expect(afterStart).toHaveLength(1);
      expect(afterStart[0]).toBe("setBinaural:null");

      // The boundary into `symbols` turns them on, and the boundary out of it into
      // `focus` — which is on as well — must not touch them at all.
      clock.advance(1000);
      const atSymbols = audio.calls.filter((call) => call.startsWith("setBinaural"));
      expect(atSymbols).toHaveLength(2);
      expect(atSymbols[1]).toMatch(/^setBinaural:1:1$/);

      clock.advance(500);
      expect(audio.calls.filter((call) => call.startsWith("setBinaural"))).toHaveLength(2);
      expect(engine.getSnapshot().stageIndex).toBe(2);
    });

    it("moves only the stage the reader edits, and only before it is behind them", async () => {
      const { clock, engine } = setup({}, [threeStages()]);
      // Before Start, any row may be edited.
      engine.setStageDuration(4000, 2);
      expect(engine.getSnapshot().block?.stages[2]?.durationMs).toBe(4000);
      expect(engine.getSnapshot().remainingMs).toBe(1000);

      await engine.start();
      clock.advance(1000);
      // Now the first stage is behind the reader: editing its row is refused rather
      // than re-arming something that has already run.
      engine.setStageDuration(9000, 0);
      expect(engine.getSnapshot().block?.stages[0]?.durationMs).toBe(1000);
      // The stage on screen is the one that moves.
      engine.setStageDuration(2000, 1);
      expect(engine.getSnapshot().block?.stages[1]?.durationMs).toBe(2000);
      expect(engine.getSnapshot().remainingMs).toBe(2000);
    });

    it("hops the whole block on skip, not one stage", async () => {
      const { clock, engine, events } = setup({ autoAdvance: true }, [
        threeStages(),
        makeBlock("b2", 1, { durationMs: 1000, symbolId: "s2" }),
      ]);
      await engine.start();
      clock.advance(1000);
      expect(engine.getSnapshot().stageIndex).toBe(1);
      engine.skipToNext();
      expect(engine.getSnapshot().blockIndex).toBe(1);
      expect(engine.getSnapshot().stageIndex).toBe(0);
      // A skip hops the block the reader is on: two `blockStart`s and no alarm —
      // the alarm belongs to a block that *ran out*, not one that was passed over.
      expect(events.filter((event) => event.type === "blockStart")).toHaveLength(2);
      expect(types(events)).not.toContain("alarm");
    });

    /**
     * Moving the session by hand (the owner's round 17).
     *
     * One method serves four asks — a stage picked on the screen, `→`/`←` stepping a
     * stage or a meditation, and `Restart` — because they are one move: put the
     * session at a stage, at **its own** length, and wait for Start. The reader's
     * own words for it: *"hold until start is pressed. Not paused at all, clock
     * should be cleared"*, and *"the clock again starts from the originally set
     * seeded mark (no resume)"*.
     */
    describe("seek", () => {
      /**
       * Three stages, long and all of different lengths.
       *
       * Longer than `threeStages()` on purpose: the engine only writes a new
       * remaining time when the second it is showing changes, so a part-run clock is
       * only observable on a stage that lasts more than a moment. Distinct lengths
       * are what make "the stage's own clock" distinguishable from "what was left".
       */
      function longStages() {
        return makeBlock("b1", 0, {
          stages: [
            stageFixture(5000, { key: "intentions", label: "Intentions", kind: "intentions", binaural: false, autoScroll: true }),
            stageFixture(4000, { key: "symbols", label: "Symbols", kind: "symbols", binaural: true }),
            stageFixture(7000, { key: "focus", label: "Focus", kind: "focus", binaural: true }),
          ],
        });
      }

      it("moves to a stage, clears its clock, and holds there", async () => {
        const { clock, engine } = setup({}, [longStages()]);
        await engine.start();
        clock.advance(2000);
        expect(engine.getSnapshot().remainingMs).toBe(3000);

        engine.seek(0, 2);
        // `loaded` **is** the hold: nothing ticks, and the screen draws Start again
        // rather than a Pause with nothing to pause.
        expect(engine.getSnapshot().status).toBe("loaded");
        expect(engine.getSnapshot().stageIndex).toBe(2);
        expect(engine.getSnapshot().remainingMs).toBe(7000);
        clock.advance(10_000);
        expect(engine.getSnapshot().status).toBe("loaded");
        expect(engine.getSnapshot().remainingMs).toBe(7000);
      });

      it("starts from the stage the reader put it on", async () => {
        const { clock, engine } = setup();
        // Picked before the first Start: the session begins *there*, not at the
        // plan's first meditation.
        engine.seek(1, 0);
        await engine.start();
        expect(engine.getSnapshot().blockIndex).toBe(1);
        expect(engine.getSnapshot().block?.intentions).toEqual(["A2"]);
        // The 200 ms alarm hold is part of a block's end, so the walk reaches the
        // next meditation just after the block's own length.
        clock.advance(1200);
        expect(engine.getSnapshot().blockIndex).toBe(2);
      });

      it("starts at the beginning when nobody moved it", async () => {
        const { engine } = setup();
        engine.seek(2, 0);
        // `stop()` is not a position the reader chose, so it clears the hold and
        // Start begins at the beginning again — the reason `positioned` exists.
        engine.stop();
        await engine.start();
        expect(engine.getSnapshot().blockIndex).toBe(0);
        expect(engine.getSnapshot().status).toBe("running");
      });

      it("takes a part-run stage back to the length it was set to", async () => {
        const { clock, engine } = setup({}, [longStages()]);
        await engine.start();
        clock.advance(2000);
        expect(engine.getSnapshot().remainingMs).toBe(3000);

        // `←` once, and `Restart`: the stage's own clock, never the remainder.
        engine.seek(0, 0);
        expect(engine.getSnapshot().remainingMs).toBe(5000);
        expect(engine.getSnapshot().block?.stages[0]?.durationMs).toBe(5000);
      });

      it("refuses a stage that is not there, and a session that is over", async () => {
        const { clock, engine } = setup({}, [threeStages()]);
        await engine.start();
        engine.seek(0, 9);
        expect(engine.getSnapshot().stageIndex).toBe(0);
        engine.seek(9, 0);
        expect(engine.getSnapshot().blockIndex).toBe(0);

        clock.advance(3000);
        expect(engine.getSnapshot().status).toBe("completed");
        engine.seek(0, 1);
        // Nowhere to hold: a finished session is finished, and Start is what the
        // screen offers instead.
        expect(engine.getSnapshot().status).toBe("completed");
      });

      it("is refused while the alarm rings, like Pause", async () => {
        const { clock, engine } = setup({ autoAdvance: false }, [
          threeStages(),
          makeBlock("b2", 1, { durationMs: 1000, symbolId: "s2" }),
        ]);
        await engine.start();
        clock.advance(3000);
        // The block is over and its alarm is ringing: `Skip`/`Stop` are the honest
        // presses, so a key that would move the clock is refused rather than
        // clearing a hold that is still sounding.
        expect(engine.getSnapshot().holdingAlarm).toBe(true);
        engine.seek(1, 0);
        expect(engine.getSnapshot().blockIndex).toBe(0);
        expect(engine.getSnapshot().holdingAlarm).toBe(true);
      });
    });
  });
});
