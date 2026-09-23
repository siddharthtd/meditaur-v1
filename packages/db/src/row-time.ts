/**
 * The one place a catalogue row's timestamps cross between the two clocks.
 *
 * The domain counts milliseconds and Postgres stores `timestamptz`, so a write is
 * `toISOString()` and a read is `Date.parse`. The preferences adapter set this
 * convention first and these helpers are it extracted, so ten mapper pairs cannot
 * disagree about it — and so "absent means live" is written down once rather than
 * re-derived in each pair.
 */
export function timeFromRow(value: unknown): number | null {
  return typeof value === "string" ? Date.parse(value) : null;
}

export function timeToRow(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}
