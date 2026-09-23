import { describe, expect, it } from "vitest";
import {
  TIME_WHEEL_ROWS,
  wheelBandTopPx,
  wheelOffsetFor,
  wheelPadPx,
  wheelValueAt,
  wheelWrapCount,
  wheelWrappedOffsetFor,
  wheelWrappedRows,
  wheelWrappedStep,
  wheelWrappedValueAt,
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

/**
 * The seconds column counts in circles (the owner's round 19, item 1).
 *
 * The arithmetic is the whole of it: the column draws one value beyond each end of
 * its range, the seam is therefore one row further down than a plain wheel's, and a
 * step — or a typed value — lands wherever it falls on the circle rather than being
 * clamped to the end. It carries nothing into the minutes, which is the other half of
 * the ask ("minute wheel stays the same").
 */
describe("a wrapping time wheel", () => {
  it("draws one value beyond each end, so 59 has a 0 under it", () => {
    expect(wheelWrappedRows(0, 2)).toEqual([2, 0, 1, 2, 0]);
    expect(wheelWrappedRows(0, 59)).toHaveLength(wheelWrapCount(0, 59) + 2);
  });

  it("puts a value one row past a plain wheel's offset", () => {
    // The leading copy is what the seam needs: the window above `0` is `59`, not blank.
    expect(wheelWrappedOffsetFor(0, 36, 0)).toBe(36);
    expect(wheelWrappedOffsetFor(59, 36, 0)).toBe(2_160);
    // Which leaves one reachable row below it: the 0 that closes the circle.
    expect(wheelWrappedOffsetFor(59, 36, 0)).toBeLessThanOrEqual(61 * 36);
  });

  it("reads a value in circles, so after 59 comes 0", () => {
    expect(wheelWrappedValueAt(wheelWrappedOffsetFor(0, 36, 0), 36, 0, 59)).toBe(0);
    expect(wheelWrappedValueAt(wheelWrappedOffsetFor(59, 36, 0), 36, 0, 59)).toBe(59);
    // One row past 59 is the row the wrap draws there: the answer to item 1.
    expect(wheelWrappedValueAt(61 * 36, 36, 0, 59)).toBe(0);
    // And one row above 0 is 59, so the wheel turns both ways round the seam.
    expect(wheelWrappedValueAt(0, 36, 0, 59)).toBe(59);
  });

  it("round-trips every value through its own offset", () => {
    for (const value of [0, 1, 30, 58, 59]) {
      expect(wheelWrappedValueAt(wheelWrappedOffsetFor(value, 36, 0), 36, 0, 59)).toBe(
        value,
      );
    }
  });

  it("snaps to the nearer row, and holds a degenerate row height", () => {
    // 40% into the row below 59 is still that row, not a value between two.
    expect(wheelWrappedValueAt(61 * 36 + 14, 36, 0, 59)).toBe(0);
    expect(wheelWrappedValueAt(60 * 36 - 14, 36, 0, 59)).toBe(59);
    expect(wheelWrappedValueAt(500, 0, 4, 9)).toBe(4);
  });

  it("steps round the circle and carries nothing", () => {
    expect(wheelWrappedStep(59, 1, 0, 59)).toBe(0);
    expect(wheelWrappedStep(0, -1, 0, 59)).toBe(59);
    expect(wheelWrappedStep(30, 5, 0, 59)).toBe(35);
    expect(wheelWrappedStep(58, 5, 0, 59)).toBe(3);
    // A typed value lands where it falls on the circle — the same rule as a step.
    expect(wheelWrappedStep(90, 0, 0, 59)).toBe(30);
    expect(wheelWrappedStep(59, 0, 0, 59)).toBe(59);
  });
});
