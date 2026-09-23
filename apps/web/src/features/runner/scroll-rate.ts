/**
 * How fast the intentions column scrolls, and where it should be next.
 *
 * The owner's §12.20: the rate is **what is left of the content over what is left
 * of the stage**, recomputed every frame from the live values. So a resume, a skip,
 * a timer edit, a window resize and a hand on the scroll wheel all land on the same
 * arithmetic — there is no fixed px/s anywhere, and nothing has to remember where
 * the scroll "should" be. Short content does not scroll at all; long content scrolls
 * faster, and it is never clamped to a maximum rate.
 *
 * `scrollTop` is read from the element every frame rather than kept here, which is
 * what makes a manual scroll re-sync instead of fighting the loop (§12.18): the
 * reader moves the content, and the next frame continues from where their hand left
 * it — with less time left, and so a faster rate.
 */
export function scrollTarget(input: {
  /** Where the content is now — the live `scrollTop`, not a remembered value. */
  scrollTop: number;
  /** `scrollHeight` and `clientHeight` of the scrolling element, live. */
  contentPx: number;
  viewportPx: number;
  /** What is left of the stage, from the engine. */
  remainingMs: number;
  /** How much time passed since the last frame. */
  elapsedMs: number;
  /** Only a running session scrolls; a paused or finished one holds still. */
  running: boolean;
}): number {
  const max = Math.max(0, input.contentPx - input.viewportPx);
  if (max === 0) return 0;
  const at = Math.min(Math.max(0, input.scrollTop), max);
  if (!input.running || input.remainingMs <= 0 || input.elapsedMs <= 0) return at;
  const rate = max / input.remainingMs;
  return Math.min(max, at + rate * input.elapsedMs);
}
