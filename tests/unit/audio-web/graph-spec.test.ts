import { describe, expect, it } from "vitest";
import { graphSpecFromPreset } from "@meditaur/audio-web";
import {
  classicBinauralPair,
  DEFAULT_CARRIER_HZ,
  defaultEarEq,
} from "@meditaur/domain";

describe("graphSpecFromPreset", () => {
  it("maps classic pair frequencies and hard-splits ears", () => {
    const pair = classicBinauralPair(DEFAULT_CARRIER_HZ, 10, 0.4);
    const spec = graphSpecFromPreset({
      leftTones: [pair.left],
      rightTones: [pair.right],
      fadeInMs: 40,
      fadeOutMs: 40,
      eqLeft: defaultEarEq(),
      eqRight: defaultEarEq(),
    });
    expect(spec.leftOscillators[0].hz).toBe(205);
    expect(spec.rightOscillators[0].hz).toBe(195);
    expect(spec.leftEqHz).toHaveLength(10);
    expect(spec.alarmConnectedToEq).toBe(false);
  });

  it("counts three left tones and equal-power bus gain", () => {
    const spec = graphSpecFromPreset({
      leftTones: [
        { id: "a", hz: 100, gain: 0.4 },
        { id: "b", hz: 200, gain: 0.4 },
        { id: "c", hz: 300, gain: 0.4 },
      ],
      rightTones: [{ id: "d", hz: 110, gain: 0.4 }],
      fadeInMs: 20,
      fadeOutMs: 20,
      eqLeft: defaultEarEq(),
      eqRight: defaultEarEq(),
    });
    expect(spec.leftOscillators).toHaveLength(3);
    expect(spec.rightOscillators).toHaveLength(1);
    expect(spec.busGainLeft).toBeCloseTo(1 / Math.sqrt(3));
    expect(spec.busGainRight).toBe(1);
  });
});
