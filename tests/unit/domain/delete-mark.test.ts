import { describe, expect, it } from "vitest";
import { deleteMark, notDeleted } from "@meditaur/domain";

/**
 * The delete mark (`P2 · 3`, slice 3): one rule, because three stores write it.
 *
 * The module exists so the cloud's two adapters and the device's own Dexie store
 * cannot disagree about what a delete is. These cases are the three shapes a
 * disagreement would take: a mark that does not move the revision, one that leaves
 * the timestamp alone, and a read that hides a row nobody deleted.
 */
describe("the delete mark", () => {
  it("moves the revision on, which is what makes the mark win", () => {
    // Last-write-wins settles two devices by revision (`DECISIONS.md` §7), so a mark
    // written at the revision the other device already holds would be a coin toss.
    expect(deleteMark(1_700_000_000_000, { revision: 4 })).toEqual({
      deletedAt: 1_700_000_000_000,
      revision: 5,
      updatedAt: 1_700_000_000_000,
    });
  });

  it("moves the timestamp with the mark, because a pull reads that column", () => {
    // A tombstone whose timestamp stood still is a tombstone the device that needs it
    // never sees: the mark travels in the column a pull asks about.
    const mark = deleteMark(1_700_000_500_000);
    expect(mark.updatedAt).toBe(mark.deletedAt);
  });

  it("gives a row with no revision its first one, rather than refusing to mark it", () => {
    // A row written before the catalogue was versioned carries `revision: 0`, and on a
    // plan block there is no revision at all.
    expect(deleteMark(7).revision).toBe(1);
    expect(deleteMark(7, null).revision).toBe(1);
    expect(deleteMark(7, {}).revision).toBe(1);
  });

  it("calls a row live when the mark is absent or null, and only then", () => {
    // The two are the same thing on purpose: a device that has never seen a mark holds
    // rows with no field at all.
    expect(notDeleted({})).toBe(true);
    expect(notDeleted({ deletedAt: null })).toBe(true);
    expect(notDeleted({ deletedAt: 0 })).toBe(false);
    expect(notDeleted({ deletedAt: 1_700_000_000_000 })).toBe(false);
    expect(notDeleted(deleteMark(9, { revision: 0 }))).toBe(false);
  });
});
