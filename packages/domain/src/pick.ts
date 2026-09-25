/**
 * The randomiser's draw, and the seam a test replaces it through.
 *
 * `Clock` is the shape this copies, and for the same reason: what a session decides must
 * be reachable by a test without mocking a global, and the domain should not have to know
 * *how* the app draws. `systemPick` is the one implementation the app uses; a caller that
 * needs a settled answer passes its own through `CompileOptions.pick`, which is what the
 * unit suite does rather than seeding a generator.
 *
 * The owner's round 24 (`P2 · 45`) is why this exists at all: *"if we will have a plenty of
 * intentions, we will randomly choose the fixed number of intentions to use for this
 * particular session."*
 */

/** What a draw is: `count` of `lines`, chosen at random and in a random order. */
export type PickLines = (count: number, lines: readonly string[]) => string[];

/**
 * The real draw: a random subset, in a random order.
 *
 * **The order is shuffled as well as the membership**, and that is the point of the
 * feature rather than a flourish — *"the list keeps shuffling and different intentions can
 * then be meditated upon"* — because a session that always kept the first three lines
 * would show the reader the same three lines every time they sat down, which is the
 * staleness the setting exists to avoid.
 *
 * A count at or above the list returns the whole list (shuffled): a count is a ceiling and
 * not a quota, so nothing is ever duplicated and no list is padded. `0` returns nothing.
 * The caller's array is never touched.
 */
export const systemPick: PickLines = (count, lines) => {
  const pool = [...lines];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const held = pool[index]!;
    pool[index] = pool[swap]!;
    pool[swap] = held;
  }
  const keep = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return pool.slice(0, keep);
};
