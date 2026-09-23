import { fail } from "@meditaur/domain";
import type { UserPreferences } from "@meditaur/domain";

/**
 * Preferences are versioned the way plans are (the review, 2026-09-15: `savePreferences`
 * used to store whatever the caller happened to hold, so the last writer won and
 * the earlier change vanished without a word). A save carries the revision it
 * read; if the store has moved on, the write is refused and the caller sees why.
 */
export const PREFERENCES_ERRORS = {
  conflict: "Settings were changed in another tab",
} as const;

/**
 * The row to hand the store: the caller's values, stamped with the clock. The
 * *revision* is not touched here — moving it is the store's job, because the
 * store is what compares it with the one it holds (see
 * `PreferencesRepository.save`). A caller that could name the new revision could
 * name one that skipped ahead.
 */
export function stampedPreferences(incoming: UserPreferences, now: number): UserPreferences {
  return { ...incoming, updatedAt: now };
}

/** The one place a refused preference write becomes something a reader can read. */
export function preferencesConflict(): never {
  fail("preferences.conflict", PREFERENCES_ERRORS.conflict);
}
