import { describe, expect, it } from "vitest";

import { progressIndex } from "../../../apps/web/src/features/runner/stage-progress.ts";

/**
 * The clock as a position (the owner's round 17, items 4 and 7).
 *
 * The complaint this answers is precise: *"When the scroll ends, i.e. it reaches the
 * end of intentions, the symbol details stop updating completely, it should be updated
 * with time even though the scrolling stops."* A column whose lines fit the card never
 * scrolls at all, so a panel driven only by `scrollTop` had nothing to follow and froze
 * on the first symbol for the whole stage. These are the boundaries that fallback has
 * to get right — an index off the end is not a symbol, and a fraction of a stage is
 * not a length of time.
 */
describe("progressIndex", () => {
  it("starts at the first thing and ends on the last", () => {
    expect(progressIndex(3, 60_000, 60_000)).toBe(0);
    expect(progressIndex(3, 0, 60_000)).toBe(2);
  });

  it("divides the stage between the things it shows", () => {
    // Three symbols over a minute: a third of the stage each. The values sit inside
    // a third rather than on its edge — `0.33333333333333337 * 3` is a hair over 1,
    // and a test that lands exactly on a boundary would be testing the browser's
    // float arithmetic rather than where the boundary belongs.
    expect(progressIndex(3, 50_000, 60_000)).toBe(0);
    expect(progressIndex(3, 41_000, 60_000)).toBe(0);
    expect(progressIndex(3, 39_000, 60_000)).toBe(1);
    expect(progressIndex(3, 21_000, 60_000)).toBe(1);
    expect(progressIndex(3, 19_000, 60_000)).toBe(2);
  });

  it("never answers past the last one", () => {
    // A stage extended after the column filled, or a clock that has overrun: the
    // last thing on screen is still the last thing, not an index that is not there.
    expect(progressIndex(2, -5000, 60_000)).toBe(1);
    expect(progressIndex(2, 0, 0)).toBe(1);
  });

  it("answers the first one while there is nothing to divide", () => {
    // A block with no symbols, or a stage that shows nothing: the caller's `?? 0`
    // is then the answer, and it must not be handed `-1`.
    expect(progressIndex(0, 30_000, 60_000)).toBe(0);
    expect(progressIndex(0, 0, 0)).toBe(0);
  });

  it("holds still while the clock does", () => {
    // A paused stage reports the same remaining time every render, so the symbol in
    // play is the same symbol every render — the whole reason this is a fraction of
    // the stage rather than a rate per frame (the shape `scroll-rate.ts` shares).
    expect(progressIndex(4, 30_000, 60_000)).toBe(2);
    expect(progressIndex(4, 30_000, 60_000)).toBe(2);
  });
});
