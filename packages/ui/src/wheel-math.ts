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

/** Blank space above the first row and below the last: one row, so both centre. */
export function wheelPadPx(rowPx: number): number {
  return Math.floor(TIME_WHEEL_ROWS / 2) * rowPx;
}

/** Where the middle row starts inside a window of {@link TIME_WHEEL_ROWS} rows. */
export function wheelBandTopPx(rowPx: number): number {
  return ((TIME_WHEEL_ROWS - 1) / 2) * rowPx;
}
