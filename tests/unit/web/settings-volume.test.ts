import { describe, expect, it } from "vitest";

import {
  volumeFromTens,
  volumeToTens,
} from "../../../apps/web/src/lib/settings-volume.ts";

/**
 * The volume settings' display scale (the owner's round 16, item 7, §5.5).
 *
 * Four sentences, and this file is all of them: a stored gain reads as a whole
 * number, a press writes an exact tenth, a stored hundredth shows the nearest
 * whole number without being rewritten by the mere act of showing it, and neither
 * direction leaves its own scale.
 */
describe("the volume settings' scale", () => {
  it("shows a stored gain as its whole number", () => {
    expect(volumeToTens(0)).toBe(0);
    expect(volumeToTens(0.7)).toBe(7);
    expect(volumeToTens(1)).toBe(10);
  });

  it("writes a press as an exact tenth", () => {
    // The reader presses `8`; the store holds `0.8`, not `0.7999…` — this is the
    // promise the plan makes in as many words, so it is asserted as an equality
    // against the literal rather than as a rounded comparison.
    expect(volumeFromTens(8)).toBe(0.8);
    expect(volumeFromTens(0)).toBe(0);
    expect(volumeFromTens(10)).toBe(1);
  });

  it("round-trips every number the screen can show", () => {
    for (let tens = 0; tens <= 10; tens += 1) {
      expect(volumeToTens(volumeFromTens(tens))).toBe(tens);
    }
  });

  it("shows a stored hundredth as the nearest number, and leaves the value alone", () => {
    // `0.73` predates this scale: the old screen stepped by `0.05`, so rows in that
    // shape exist. It reads as `7`, and the conversion is a *read* — nothing here
    // writes, so the stored value keeps its hundredth until the reader presses.
    const stored = 0.73;
    expect(volumeToTens(stored)).toBe(7);
    expect(stored).toBe(0.73);
    // Rounding is to the nearest tenth, not down to the lower one.
    expect(volumeToTens(0.74)).toBe(7);
    expect(volumeToTens(0.76)).toBe(8);
  });

  it("takes the reader's press from what it shows, not from the stored hundredth", () => {
    // The `+` button steps the number on screen, so a press on the `0.73` above
    // writes `0.8` — the stored value is rewritten by that press, and it becomes a
    // whole tenth rather than `0.78`.
    const shown = volumeToTens(0.73);
    expect(shown).toBe(7);
    expect(volumeFromTens(shown + 1)).toBe(0.8);
    // And the step back down names the tenth the reader sees, not the hundredth.
    expect(volumeFromTens(shown)).toBe(0.7);
  });

  it("never leaves 0..1 or 0..10", () => {
    for (const value of [-1, -0.5, 1.2, 20]) {
      expect(volumeFromTens(value)).toBeGreaterThanOrEqual(0);
      expect(volumeFromTens(value)).toBeLessThanOrEqual(1);
      expect(volumeToTens(value)).toBeGreaterThanOrEqual(0);
      expect(volumeToTens(value)).toBeLessThanOrEqual(10);
    }
  });
});
