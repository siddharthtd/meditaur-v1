import { describe, expect, it } from "vitest";
import { defaultEarEq, GRAPHIC_BANDS_HZ, setBandGain } from "@meditaur/domain";

describe("eq", () => {
  it("seeds ten graphic bands at 0 dB", () => {
    const eq = defaultEarEq();
    expect(eq.bands).toHaveLength(10);
    expect(eq.bands.map((b) => b.hz)).toEqual([...GRAPHIC_BANDS_HZ]);
    expect(eq.bands.every((b) => b.gainDb === 0)).toBe(true);
  });

  it("clamps band gain to ±12 dB", () => {
    const eq = setBandGain(defaultEarEq(), 1000, 99);
    expect(eq.bands.find((b) => b.hz === 1000)?.gainDb).toBe(12);
  });
});
