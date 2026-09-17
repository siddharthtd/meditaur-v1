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
  makeIntentions,
  makeBinding,
  makeBlock,
  makeFocus,
  makePlan,
  makePreset,
  makeSymbol,
  makeTableView,
} from "../../fixtures/library.ts";

const library = {
  focusPoints: [makeFocus("fp1", "Root")],
  symbols: [makeSymbol("s1", "Lam"), makeSymbol("s2", "Earth")],
  bindings: [makeBinding("fp1", "s1", 0), makeBinding("fp1", "s2", 1)],
  intentions: [
    ...makeIntentions("fp1", "s1", ["A1"]),
    ...makeIntentions("fp1", "s2", ["A2"]),
  ],
  fieldDefs: [],
  fieldValues: [],
  tableViews: [makeTableView()],
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
      makeBlock("b1", 0, "focus", { durationMs: 1000, symbolId: "s1" }),
      makeBlock("b2", 1, "cooloff", {
        durationMs: 1000,
        focusPointId: null,
        binauralPresetId: null,
        tableViewId: null,
      }),
      makeBlock("b3", 2, "focus", { durationMs: 1000, symbolId: "s2" }),
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
      makeBlock("b1", 0, "focus", { durationMs: 5000, symbolId: "s1" }),
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
      makeBlock("b1", 0, "focus", { durationMs: 1000, symbolId: "s1" }),
    ]);
    await engine.start();
    clock.advance(1200);
    expect(types(events)).toContain("completed");
    expect(engine.getSnapshot().status).toBe("completed");
  });

  it("changes intention payload on N-M-N auto-advance", async () => {
    const { clock, engine } = setup();
    await engine.start();
    expect(engine.getSnapshot().block?.intentions).toEqual(["A1"]);
    clock.advance(1200);
    expect(engine.getSnapshot().block?.type).toBe("cooloff");
    expect(engine.getSnapshot().block?.intentions).toEqual([]);
    clock.advance(1200);
    expect(engine.getSnapshot().block?.intentions).toEqual(["A2"]);
  });

  it("pause freezes remaining time", async () => {
    const { clock, engine } = setup({}, [
      makeBlock("b1", 0, "focus", { durationMs: 5000, symbolId: "s1" }),
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
      makeBlock("b1", 0, "focus", { durationMs: 1000, symbolId: "s1" }),
    ]);
    await engine.start();
    clock.advance(1200);
    expect(events.filter((e) => e.type === "cycleStart")).toHaveLength(2);
    clock.advance(1200);
    expect(types(events)).toContain("completed");
  });

  it("does not complete when cycleUntilStopped", async () => {
    const { clock, engine } = setup({ cycleUntilStopped: true, cycleCount: 1 }, [
      makeBlock("b1", 0, "focus", { durationMs: 1000, symbolId: "s1" }),
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

  it("cooloff with null binaural calls setBinaural null", async () => {
    const { audio, engine } = setup();
    await engine.start();
    engine.skipToNext();
    expect(audio.calls.some((c) => c === "setBinaural:null")).toBe(true);
  });

  it("fades binaural before alarm when stopBinauralOnAlarm is set", async () => {
    const { audio, clock, engine } = setup(
      {},
      [makeBlock("b1", 0, "focus", { durationMs: 1000, symbolId: "s1" })],
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
      [makeBlock("b1", 0, "focus", { durationMs: 1000, symbolId: "s1" })],
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
});
