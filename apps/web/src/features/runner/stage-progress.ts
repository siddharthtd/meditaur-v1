/**
 * Where a stage's clock has got to, as one number: an index into the things that
 * stage shows in time order.
 *
 * The owner's round 17, item 7: *"When the scroll ends, i.e. it reaches the end of
 * intentions, the symbol details stop updating completely, it should be updated with
 * time even though the scrolling stops."* The symbol panel used to be driven
 * **only** by the scroll position — the topmost line on screen — which is right
 * while the column is moving and wrong the moment it stops: a block whose lines fit
 * in the card never scrolls at all, so the panel showed whichever symbol came first
 * and never moved again for the rest of the stage.
 *
 * So the clock is the second source, and this is it. Two things use it:
 *
 * - a **symbols** stage, whose region shows the block's symbols and has nothing to
 *   scroll, so the symbol in play is purely a matter of how far the stage has run;
 * - an **intentions** or **affirmations** stage whose column has run out of room to
 *   travel — the reader's rule is that the details keep up with the clock even then.
 *
 * The arithmetic is deliberately the same shape as `scroll-rate.ts`: a fraction of
 * the stage, not a fixed rate, so a paused stage holds still, a resumed one carries
 * on, and a stage that is extended re-divides the time it has left instead of
 * jumping.
 */
export function progressIndex(
  count: number,
  remainingMs: number,
  durationMs: number,
): number {
  if (count <= 0) return 0;
  // A stage of no length is over the moment it starts, so it is at its end.
  if (durationMs <= 0) return count - 1;
  const elapsed = Math.min(1, Math.max(0, 1 - remainingMs / durationMs));
  // `count - 1` at the end rather than `count`: the last thing on screen is still
  // on screen while the clock reads zero, and an index past the end is not a thing.
  return Math.min(count - 1, Math.max(0, Math.floor(elapsed * count)));
}
