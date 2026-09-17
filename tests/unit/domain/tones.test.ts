import { describe, expect, it } from "vitest";
import {
  addTone,
  busGain,
  classicBinauralPair,
  DEFAULT_CARRIER_HZ,
  MAX_TONES_PER_EAR,
  removeTone,
} from "@meditaur/domain";

describe("tones", () => {
  it("computes classic binaural pair as carrier ± beat/2", () => {
    const pair = classicBinauralPair(DEFAULT_CARRIER_HZ, 10, 0.5);
    expect(pair.left.hz).toBe(205);
    expect(pair.right.hz).toBe(195);
    expect(pair.left.gain).toBe(0.5);
  });

  it("uses equal-power bus gain", () => {
    expect(busGain(0)).toBe(1);
    expect(busGain(1)).toBe(1);
    expect(busGain(4)).toBe(0.5);
  });

  it("rejects a 17th tone", () => {
    let tones = addTone([], { hz: 200, gain: 0.4 });
    for (let i = 1; i < MAX_TONES_PER_EAR; i += 1) {
      tones = addTone(tones, { hz: 200 + i, gain: 0.4 });
    }
    expect(tones).toHaveLength(16);
    expect(() => addTone(tones, { hz: 400, gain: 0.4 })).toThrow(/16/);
  });

  it("removes a tone by id", () => {
    const tones = addTone([], { hz: 120, gain: 1 });
    expect(removeTone(tones, tones[0].id)).toEqual([]);
  });
});
