import type { Entry, Meditation, Intention, Symbol } from "./models.ts";

/**
 * The visibility rule (§3.1), written once.
 *
 * *An item is visible only if it and every record it references are live.*
 *
 * That one sentence is what makes "associations are preserved when archiving"
 * true by construction: archiving a chakra hides its entries and their lines
 * without copying or moving anything, so Restore brings back exactly what was
 * there. Nothing here is stored — a row is hidden because something it points at
 * is archived, and the moment that stops being true it is visible again.
 *
 * Nothing in this module reads the clock or the store: it is a pure function of
 * the rows, so every reader (compile, the library, the Database's grid, the
 * Archive page) agrees by construction rather than by remembering to filter.
 */
export type ArchivedRow = { archivedAt: number | null };

/** A row that is not archived. `null` means live; there is no third state. */
export function isLive(row: ArchivedRow): boolean {
  return row.archivedAt == null;
}

/** The ids of every live row — the two sets the rule needs to decide a pair. */
export type Liveness = {
  meditations: Set<string>;
  symbols: Set<string>;
};

export function liveIds(rows: (ArchivedRow & { id: string })[]): Set<string> {
  return new Set(rows.filter(isLive).map((row) => row.id));
}

export function livenessOf(input: {
  meditations: (Meditation | { id: string; archivedAt: number | null })[];
  symbols: (Symbol | { id: string; archivedAt: number | null })[];
}): Liveness {
  return {
    meditations: liveIds(input.meditations),
    symbols: liveIds(input.symbols),
  };
}

/**
 * An entry is visible when it is live and every reference it *has* is live. A
 * missing reference is not an archived one: a symbol-only row points at no
 * chakra, and that is a complete row, not a broken one.
 */
export function entryIsVisible(entry: Entry, live: Liveness): boolean {
  if (!isLive(entry)) return false;
  if (entry.meditationId !== null && !live.meditations.has(entry.meditationId)) return false;
  if (entry.symbolId !== null && !live.symbols.has(entry.symbolId)) return false;
  return true;
}

/** The visible entries of a table, in storage order (the caller sorts). */
export function visibleEntries(entries: Entry[], live: Liveness): Entry[] {
  return entries.filter((entry) => entryIsVisible(entry, live));
}

/** The ids of the visible entries, so a line can be decided without re-deriving them. */
export function visibleEntryIds(entries: Entry[], live: Liveness): Set<string> {
  return new Set(visibleEntries(entries, live).map((entry) => entry.id));
}

/**
 * A line follows its entry: it is visible when it is live *and* the row it was
 * written about is. This is why archiving a chakra hides its intentions without
 * touching them.
 *
 * An **orphan** (`entryId: null`) is visible on its own: it is written about
 * nothing, so there is nothing that could be archived out from under it. That is
 * what puts it in the Affirmations tab and keeps it off every other surface
 * (the owner's round 16, §2.1).
 */
export function lineIsVisible(line: Intention, entryIds: Set<string>): boolean {
  return isLive(line) && (line.entryId === null || entryIds.has(line.entryId));
}

export function visibleLines(lines: Intention[], entryIds: Set<string>): Intention[] {
  return lines.filter((line) => lineIsVisible(line, entryIds));
}
