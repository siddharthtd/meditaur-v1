import { describe, expect, it } from "vitest";
import {
  TIME_WHEEL_ROWS,
  wheelBandTopPx,
  wheelOffsetFor,
  wheelPadPx,
  wheelValueAt,
} from "../../../packages/ui/src/wheel-math.ts";

/**
 * The wheel is a scroll container of fixed-height rows, so these three functions
 * are the whole of its geometry: the offset that puts a value in the middle, the
 * value an offset rests on, and the blank rows at the ends that let the extremes
 * centre. They are pure so the arithmetic can be checked without a browser —
 * which matters, because a mistake here is a control that quietly reports the
 * wrong time.
 */
describe("time wheel geometry", () => {
  it("puts a value's offset and its row in step", () => {
    expect(wheelOffsetFor(0, 36, 0)).toBe(0);
    expect(wheelOffsetFor(5, 36, 0)).toBe(180);
    // The minute column starts at 0, the second column too, but a wheel over a
    // range that does not start at zero still counts rows, not values.
    expect(wheelOffsetFor(7, 52, 3)).toBe(208);
  });

  it("reads the value a scroll offset is resting on", () => {
    expect(wheelValueAt(0, 36, 0, 59)).toBe(0);
    expect(wheelValueAt(17, 36, 0, 59)).toBe(0);
    expect(wheelValueAt(18, 36, 0, 59)).toBe(1);
    expect(wheelValueAt(90, 36, 0, 59)).toBe(3);
    expect(wheelValueAt(2_160, 36, 0, 180)).toBe(60);
  });

  it("round-trips a value through its own offset", () => {
    for (const value of [0, 1, 7, 59, 180]) {
      const rowPx = 36;
      expect(wheelValueAt(wheelOffsetFor(value, rowPx, 0), rowPx, 0, 180)).toBe(value);
    }
  });

  it("clamps an offset the wheel cannot reach", () => {
    // Rubber-banding past the end, and a wheel mid-flight between rows.
    expect(wheelValueAt(-400, 36, 0, 59)).toBe(0);
    expect(wheelValueAt(-1, 36, 0, 59)).toBe(0);
    expect(wheelValueAt(99_999, 36, 0, 59)).toBe(59);
    expect(wheelValueAt(17, 0, 4, 9)).toBe(4);
  });

  it("keeps the band over the middle row, whatever the row height", () => {
    expect(TIME_WHEEL_ROWS).toBe(3);
    expect(wheelBandTopPx(36)).toBe(36);
    expect(wheelBandTopPx(52)).toBe(52);
    expect(wheelPadPx(36)).toBe(36);
  });
});
