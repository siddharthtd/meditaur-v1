import type { Versioned } from "@meditaur/domain";

/**
 * The row to store: the caller's values, one revision further on, stamped with
 * the clock the app was handed.
 *
 * Every catalogue write goes through here, so a revision is a fact about the row
 * rather than something each editor has to remember (the catalogue's revision — the basis for the
 * per-row compare-and-swap that sync proper adds, and what tells a push which
 * rows moved). The *check* is deliberately not here: a save carrying a stale
 * revision still writes, exactly as it did before this, because refusing it is
 * sync proper's behaviour change, not this one.
 *
 * A row that arrives without a revision at all — an old backup, a row read
 * before the storage migration ran — is treated as revision 0, the same way
 * `normalizePreferences` treats a missing one.
 */
export function versionedRow<T extends Versioned>(incoming: T, now: number): T {
  return { ...incoming, revision: (incoming.revision ?? 0) + 1, updatedAt: now };
}

/**
 * What a row the reader has only just built carries — a new symbol, a value being
 * typed into a box. The fields are filled in one place rather than at every
 * construction site, and the write that stores the row replaces both of them.
 */
export function newRowVersion(): Versioned {
  return { revision: 0, updatedAt: 0 };
}
