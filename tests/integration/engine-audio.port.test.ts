import { describe, expect, it } from "vitest";
import {
  RecordingAudioPort,
  FakeClock,
  SessionEngine,
  compilePlan,
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
} from "../fixtures/library.ts";

describe("engine-audio port contract", () => {
  it("passes N left tones into setBinaural and fades before alarm", async () => {
    const clock = new FakeClock();
    const audio = new RecordingAudioPort();
    const library = {
      focusPoints: [makeFocus("fp1", "Root")],
      symbols: [makeSymbol("s1", "Lam")],
      bindings: [makeBinding("fp1", "s1", 0)],
      intentions: makeIntentions("fp1", "s1", ["A1"]),
      fieldDefs: [],
      fieldValues: [],
      tableViews: [makeTableView()],
      presets: [makePreset()],
    };
    const snapshot = compilePlan(
      makePlan([makeBlock("b1", 0, "focus", { durationMs: 500, symbolId: "s1" })]),
      library,
      { now: 0, id: () => "i", stopBinauralOnAlarm: true },
    );
    const engine = new SessionEngine(clock, audio);
    engine.load(snapshot);
    await engine.start();
    expect(audio.calls[0]).toBe("resume");
    expect(audio.calls.some((c) => c.startsWith("setBinaural:1:1"))).toBe(true);
    clock.advance(500);
    const fade = audio.calls.indexOf("fadeOutBinaural");
    const alarm = audio.calls.findIndex((c) => c.startsWith("playAlarm:"));
    expect(fade).toBeGreaterThanOrEqual(0);
    expect(alarm).toBeGreaterThan(fade);
  });
});
