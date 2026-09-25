/**
 * The order the default catalogue reads in — the owner's round 14.
 *
 * One list per entity: the chakras and the points, then the symbols. It lives here
 * rather than in `default-workspace.ts` because **two** callers need the same
 * answer — the seed, which numbers the rows it mints, and the Dexie upgrade that
 * renumbers the rows a device already holds — and a third mirror of the *symbol*
 * list lives in `supabase/migrations/20260920140000_symbol_reiki_system.sql`, which
 * renumbers the cloud tables the same way. The focus list has no SQL mirror:
 * `20260918150000_row_order.sql` ordered those rows by name and nothing has needed
 * the list since.
 *
 * A group is one row with its spellings. The owner writes `Knosa` where this
 * catalogue writes `Gnosa`, and `Iawa` where it writes `Iava`, and a reader's own
 * rows may carry either; matching is case-insensitive and ignores a trailing
 * `chakra`. That tolerance is the point: a name is the only handle on a row that
 * already exists.
 *
 * A name that is in no group is not lost — `rankOf` puts it *after* every named
 * row, in the order it already had, so a catalogue the reader added to keeps its
 * own tail.
 */
export const FOCUS_ORDER: readonly (readonly string[])[] = [
  ["Third-Eye Chakra", "Third Eye"],
  ["Throat Chakra", "Throat"],
  ["Heart Chakra", "Heart"],
  ["Solar Plexus Chakra", "Solar Plexus"],
  ["Hara Chakra", "Hara"],
  ["Root Chakra", "Root"],
  // The owner's list stops at Root, so the seventh chakra follows the six rather
  // than displacing one of them.
  ["Crown Chakra", "Crown"],
  ["Eyes", "Eye"],
  ["Temples", "Temple"],
  ["Ears", "Ear"],
  ["Thyroid and thymus", "Thyroid"],
  // Round 22: those were two places written as one row, so the group became two. The old
  // name stays an alias of the first, because a device that has not run v32 yet still holds
  // a row spelled that way and it has to read where `Thyroid` reads.
  ["Thymus"],
  ["Shoulders", "Shoulder"],
  ["Tips of the lungs", "Lungs"],
  ["Liver"],
  ["Kidneys", "Kidney"],
  // Round 25: `Pancreas and spleen` was two places written as one row, so the group became
  // two — the split round 22 made of `Thyroid and thymus`. The old combined name stays an
  // alias of the first, because a device that has not run v34 yet still holds a row spelled
  // that way and it has to read where `Pancreas` reads.
  ["Pancreas", "Pancreas and spleen"],
  ["Spleen"],
  ["Thighs", "Thigh"],
  ["Knees", "Knee"],
  ["Lower legs", "Lower leg"],
  ["Ankles", "Ankle"],
  ["Soles of the feet", "Sole of the foot", "Feet"],
];

export const SYMBOL_ORDER: readonly (readonly string[])[] = [
  ["Harth"],
  ["Gnosa", "Knosa"],
  ["Halu"],
  ["Iava", "Iawa"],
  ["Shanti"],
  ["Kriya"],
  ["Zonar"],
  // The owner's round 16 added four rows (§2.5): three Usui Reiki symbols and the
  // Reiki master one. They follow the seven the app shipped and sit before `Rama`,
  // which is in no list — so a device that already holds this catalogue gains them
  // where the seed writes them rather than at its own tail. Their spellings are the
  // owner's, including the last one, which is usually written "Dai Ko Myo".
  ["Hon Sha Ze Sho Nen"],
  ["Sei Hei Ki"],
  ["Cho Ku Rei"],
  ["Dai Kyo Mo"],
];

function normalise(name: string | null | undefined): string {
  return (name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/ chakra$/, "");
}

/**
 * One name as the lists above read it: trimmed, lower case, inner runs of space
 * collapsed, a trailing `chakra` dropped.
 *
 * Exported for the callers that have to decide whether two rows are the *same*
 * symbol rather than where one sits — the reiki repair asks it of the four rows it
 * adds, because a name is the only handle on a row that already exists, so seeding
 * a second `Cho Ku Rei` beside a reader's own would be a duplicate rather than an
 * addition.
 */
export function normaliseName(name: string | null | undefined): string {
  return normalise(name);
}

/** Where a name sits in one of those lists — or just past the end of it. */
export function rankOf(order: readonly (readonly string[])[], name: string | null): number {
  const index = order.findIndex((group) =>
    group.some((alias) => normalise(alias) === normalise(name)),
  );
  return index === -1 ? order.length : index;
}

/**
 * The place each row reads in, for a caller that has to **write** the order rather
 * than recognise one name.
 *
 * `rankOf` answers for a row; this answers for a whole table, and it is the same
 * walk the seed, the v16 renumber and the SQL migration all do: named rows by the
 * list, then every name in no list in the order it already had. The `index` in the
 * tie-break is the array's own order, which for a Dexie upgrade is the store's
 * primary-key order — the same thing v16 used, so a device comes out the way it
 * went in.
 */
export function placesFor(
  order: readonly (readonly string[])[],
  rows: readonly { id: string; name: string | null }[],
): Map<string, number> {
  return new Map(
    rows
      .map((row, index) => ({ id: row.id, index, rank: rankOf(order, row.name) }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map((row, place) => [row.id, place]),
  );
}
