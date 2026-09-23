/**
 * The arithmetic behind the time wheel, kept out of the component: no JSX, so it
 * can be unit-tested without a browser, and the geometry can be read without the
 * rendering around it.
 *
 * A wheel is a scroll container of fixed-height rows, one row per value, so the
 * scroll offset *is* the value. That is what makes the two columns line up: a
 * row is a row, whether or not there is a neighbour to show above it (which is
 * exactly what used to break — an absent "one less" line collapsed and left the
 * seconds column floating ~24px above the minutes).
 */

/** Rows a wheel shows: the value, and one neighbour each side. */
export const TIME_WHEEL_ROWS = 3;

/** The offset that puts `value` in the middle row. */
export function wheelOffsetFor(value: number, rowPx: number, min: number): number {
  return Math.max(0, (value - min) * rowPx);
}

/**
 * The value a scroll offset is resting on.
 *
 * Rounding to the nearest row is what makes a wheel snap, and clamping keeps a
 * rubber-banded or mid-flight offset from naming a value the wheel cannot hold.
 */
export function wheelValueAt(
  offsetPx: number,
  rowPx: number,
  min: number,
  max: number,
): number {
  if (rowPx <= 0) return min;
  return Math.min(max, Math.max(min, Math.round(offsetPx / rowPx)));
}

/**
 * The rows a **wrapping** wheel draws.
 *
 * The owner's round 19, on the session screen's clock: *"the timers' seconds should
 * wrap around, after 59, it should again become 0, minute wheel stays the same"*. A
 * column that stops at its last row cannot be scrolled past it, so a wrapping column
 * draws one value beyond each end as well: from `59` the next row down is `0`.
 *
 * Those two extra rows are why a wrapping column's canonical offset is one row
 * further down than a plain one (see {@link wheelWrappedOffsetFor}) — the seam is at
 * the ends of the list, not at its first row.
 */
export function wheelWrappedRows(min: number, max: number): number[] {
  const rows: number[] = [];
  for (let n = min; n <= max; n += 1) rows.push(n);
  return [max, ...rows, min];
}

/** How many values a wrapping wheel holds — `0..59` is sixty. */
export function wheelWrapCount(min: number, max: number): number {
  return max - min + 1;
}

/** The offset that puts `value` in the middle row of a wrapping wheel. */
export function wheelWrappedOffsetFor(value: number, rowPx: number, min: number): number {
  return (value - min + 1) * rowPx;
}

/**
 * The value an offset rests on in a wrapping wheel, counting in circles.
 *
 * The two extra rows mean the value wraps with them: an offset one row past the last
 * value names the first, and an offset above the first names the last, so the column
 * can be turned either way round the seam. A wheel with no wrap does not come here.
 */
export function wheelWrappedValueAt(
  offsetPx: number,
  rowPx: number,
  min: number,
  max: number,
): number {
  if (rowPx <= 0) return min;
  const count = wheelWrapCount(min, max);
  const steps = Math.round(offsetPx / rowPx) - 1;
  return min + (((steps % count) + count) % count);
}

/**
 * One step round a wrapping wheel.
 *
 * Steps *and* typed values come through here, which is why a typed `90` in a column
 * of sixty lands on `30`: the wheel only holds a circle of values, and the reader
 * asking for ten past it is asking for where that lands on the circle. The minutes
 * column is not wrapped, so `durationFromParts`' own clamp is still what bounds a
 * duration's minutes.
 */
export function wheelWrappedStep(
  value: number,
  delta: number,
  min: number,
  max: number,
): number {
  const count = wheelWrapCount(min, max);
  return min + ((((value - min + delta) % count) + count) % count);
}

/** Blank space above the first row and below the last: one row, so both centre. */
export function wheelPadPx(rowPx: number): number {
  return Math.floor(TIME_WHEEL_ROWS / 2) * rowPx;
}

/** Where the middle row starts inside a window of {@link TIME_WHEEL_ROWS} rows. */
export function wheelBandTopPx(rowPx: number): number {
  return ((TIME_WHEEL_ROWS - 1) / 2) * rowPx;
}
