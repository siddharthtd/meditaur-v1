import { describe, expect, it } from "vitest";
import { incomingWins, pullWatermarkAfter, pushedWatermark, rowsPast } from "@meditaur/domain";

/**
 * The four rules a sync run asks (`P2 · 3`, slice 3), and the two millisecond edges
 * that make them worth writing down at all.
 *
 * Both edges are about a **tie**: several rows can share one timestamp (one cascade
 * writes a row and its lines at one `at`; the seed writes hundreds that way), and
 * which side of the boundary a tie falls on decides whether a row ever travels. The
 * cases below are those two edges, plus the merge rule §7 settles rows by.
 */
const row = (updatedAt: number, revision = 1) => ({ updatedAt, revision });

describe("the sync watermark rules", () => {
  it("sends the rows that reached the watermark, not only those past it", () => {
    // A cascade marks several rows with one timestamp. A watermark that has passed one
    // of them must not hide its siblings, so the mark is a floor rather than a fence —
    // which is why the row sitting exactly on it is sent again (an upsert, so free).
    const rows = [row(100), row(105), row(110)];
    expect(rowsPast(rows, 105).map((one) => one.updatedAt)).toEqual([105, 110]);
    expect(rowsPast(rows, 111)).toEqual([]);
    expect(rowsPast(rows, 0)).toHaveLength(3);
  });

  it("moves the push watermark only to what was actually written", () => {
    expect(pushedWatermark(100, [])).toBe(100);
    expect(pushedWatermark(100, [row(105)])).toBe(105);
    expect(pushedWatermark(100, [row(105), row(120)])).toBe(120);
    // Never backwards: a row older than the mark was written by the other device, and
    // moving back would re-send a table's history on every run.
    expect(pushedWatermark(100, [row(90)])).toBe(100);
  });

  it("moves the pull watermark one millisecond behind what the batch saw", () => {
    // The pull's read is `updated_at > watermark`, so stopping *on* the newest row
    // would step over the rest of its tie group for ever. One millisecond back makes
    // the next run read them again, and the merge writes nothing the second time.
    expect(pullWatermarkAfter(0, [row(500)])).toBe(499);
    expect(pullWatermarkAfter(0, [row(500), row(520)])).toBe(519);
    expect(pullWatermarkAfter(499, [row(500)])).toBe(499);
    // An empty batch is not an answer: the mark stays where it was.
    expect(pullWatermarkAfter(499, [])).toBe(499);
  });

  it("gives a row to the higher revision, and a tie to the copy already stored", () => {
    expect(incomingWins(row(0, 3), null), "a row the store has never held").toBe(true);
    expect(incomingWins(row(0, 3), row(0, 2))).toBe(true);
    expect(incomingWins(row(0, 2), row(0, 3))).toBe(false);
    // Equal revisions: the incoming copy loses, which is what makes a second look at
    // the same row a write that does not happen.
    expect(incomingWins(row(0, 3), row(0, 3))).toBe(false);
  });

  it("settles a delete mark like any other row, because it is one", () => {
    // A mark is a row with a later revision, so it needs no rule of its own: it wins
    // against the copy it supersedes, and loses to a copy that was written again after
    // it (`savePlan` and the catalogue's saves write live rows).
    const live = row(1_000, 4);
    const marked = { ...live, revision: 5, deletedAt: 1_000 };
    expect(incomingWins(marked, live)).toBe(true);
    expect(incomingWins(live, marked)).toBe(false);
  });
});
