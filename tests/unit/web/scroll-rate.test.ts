import { describe, expect, it } from "vitest";

import { scrollTarget } from "../../../apps/web/src/features/runner/scroll-rate.ts";

/**
 * The intentions column's rate (the owner's §12.20, §6.3).
 *
 * These are the four sentences that rule is made of: content that fits does not
 * scroll, the rate is what is left of the content over what is left of the stage,
 * a pause holds still, and a hand on the list is where the next frame starts from.
 */
describe("the intentions column's scroll", () => {
  const base = {
    scrollTop: 0,
    contentPx: 1000,
    viewportPx: 400,
    remainingMs: 60_000,
    elapsedMs: 1000,
    running: true,
  };

  it("does not scroll content that fits", () => {
    expect(scrollTarget({ ...base, contentPx: 400 })).toBe(0);
    expect(scrollTarget({ ...base, contentPx: 300 })).toBe(0);
  });

  it("moves by what is left of the content over what is left of the stage", () => {
    // 600px of scrolling over 60s is 10px/s, so a second is 10px.
    expect(scrollTarget(base)).toBe(10);
    // Half the time left is twice the rate — this is the re-derivation, not a
    // fixed speed: the same call with 30s left moves twice as far.
    expect(scrollTarget({ ...base, remainingMs: 30_000 })).toBe(20);
  });

  it("never passes the end, however fast the rate is", () => {
    expect(scrollTarget({ ...base, scrollTop: 590, remainingMs: 100 })).toBe(600);
    expect(scrollTarget({ ...base, scrollTop: 600, remainingMs: 100 })).toBe(600);
  });

  it("holds still while the session is not running", () => {
    expect(scrollTarget({ ...base, running: false })).toBe(0);
    expect(scrollTarget({ ...base, scrollTop: 120, running: false })).toBe(120);
    // A stage with no time left is over; nothing more is read out of it.
    expect(scrollTarget({ ...base, remainingMs: 0, scrollTop: 120 })).toBe(120);
  });

  it("carries on from where a hand left the content", () => {
    // This is §12.18: the next frame starts from the *live* position, so a manual
    // scroll re-syncs rather than being fought — and the rate it continues at is
    // still the one the clock implies.
    expect(scrollTarget({ ...base, scrollTop: 250 })).toBe(260);
  });
});
