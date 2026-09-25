import type { Versioned } from "./models.ts";

/**
 * The delete mark, in one place: how a delete is **written** and how a row is
 * **read past**.
 *
 * `Versioned.deletedAt` carries the argument for why a delete cannot travel as an
 * absence; this module is that argument turned into the two functions every store
 * has to agree on. There are three stores that write one — the cloud's catalogue
 * adapter, its plan adapter, and the device's own Dexie store — and a device whose
 * copy of a delete is written differently from the cloud's is a device that
 * disagrees about a row no screen ever shows.
 *
 * `P2 · 3`'s slice 3 is where the local half arrived: until then the local store
 * *removed* rows (`db.symbols.delete(...)`), which is the one shape a push cannot
 * carry, because a row that is not there cannot be sent (`DECISIONS.md` §12).
 *
 * The three fields are the rule, and each is there for a reason:
 *
 * - `deletedAt` is the mark itself. `null`, or the field absent, means live.
 * - `updatedAt` moves with it, because that column is what a pull reads: a
 *   tombstone whose timestamp stood still is a tombstone the device that needs it
 *   never sees.
 * - `revision` moves, which is what makes the mark *win*. Last-write-wins settles
 *   two devices by revision (`DECISIONS.md` §7), so a marked row written at the
 *   revision the other device already has would be a coin toss.
 *
 * A row with neither of the last two — a plan block, which rides on its plan's
 * revision and has no timestamp of its own — takes the mark alone; that is the
 * caller's decision (`packages/db/src/row-mark.ts`), and `deleteMark` still answers
 * the revision it would have had.
 */
export type DeletedRow = Pick<Versioned, "deletedAt">;

/** What a delete writes. */
export type DeleteMark = {
  deletedAt: number;
  revision: number;
  updatedAt: number;
};

/**
 * The mark a delete puts on a row, at `at`.
 *
 * `current` is the row as the store holds it, and only its `revision` is read: the
 * timestamp is the delete's own, not the row's, because the delete *is* the change.
 */
export function deleteMark(at: number, current: { revision?: number } | null = null): DeleteMark {
  return {
    deletedAt: at,
    revision: (current?.revision ?? 0) + 1,
    updatedAt: at,
  };
}

/**
 * The read side: whether a row is one the store still holds.
 *
 * `null` and an absent field are deliberately not told apart. A device that has
 * never seen a mark holds rows without the field at all, and the two mean exactly
 * the same thing to every reader (`Versioned.deletedAt` says why the field is
 * optional rather than required).
 *
 * Every read of a catalogue table goes through this. A surface that draws a row it
 * filtered out nowhere shows a reader something they deleted — which is why the
 * local store's reads in `packages/db/src/ports.ts` and both cloud adapters' reads
 * agree on this one function rather than on three copies of `== null`.
 */
export function notDeleted(row: DeletedRow): boolean {
  return row.deletedAt == null;
}
