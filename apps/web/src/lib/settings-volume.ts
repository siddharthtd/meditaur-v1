/**
 * The volume settings, as the 0–10 a reader is shown.
 *
 * `UserPreferences.masterVolume` and `alarmVolume` are gains in `0..1`, and every
 * path that plays something reads them that way — the mixer, the SQL column, the
 * Dexie row — so the owner's "volume is 0–10 in steps of 1" (round 16, §5.5) moves
 * this screen's *display* and nothing else. This pair is the whole of that
 * conversion, and it lives here beside the settings screen's other pure logic
 * (`text-size.ts`) rather than inline, where it would be one more thing the screen
 * does and none of it testable on its own.
 *
 * A stored value that is not a whole tenth is shown as the nearest one and is left
 * alone: `0.73` is what the older screen could write, because it stepped by `0.05`,
 * and rounding it on the way *in* would rewrite a setting the reader never touched.
 * Only a press writes, and a press names a whole tenth.
 */

/** The whole number 0–10 a stored gain reads as. Input outside `0..1` is clamped. */
export function volumeToTens(volume: number): number {
  return Math.round(clamp(volume, 0, 1) * 10);
}

/**
 * The `0..1` gain a press on 0–10 writes. Input outside `0..10` is clamped.
 *
 * One division by ten, never repeated addition: `0.1 + 0.1 + 0.1` is not `0.3`, so
 * a gain built that way would reach the mixer slightly off the number the reader
 * pressed. `8 / 10` is exactly the double that `0.8` is.
 */
export function volumeFromTens(tens: number): number {
  return Math.round(clamp(tens, 0, 10)) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
