import {
  CHAKRA_TYPE_ID,
  POINT_TYPE_ID,
  type Meditation,
  type MeditationType,
} from "@meditaur/domain";
import { liveTypes } from "../library/library-model";

/**
 * The plan page's tile groups (the owner's round 16, item 5).
 *
 * The tiles are grouped by meditation type, and only two of those types are worth
 * a heading of their own: a chakra's and a point's. Everything else — Protection,
 * Thanks Giving, and whatever a reader adds later — is folded into one group, so a
 * type the reader creates lands there with nothing to register in this file.
 *
 * The two named groups are recognised **by id** (`CHAKRA_TYPE_ID` /
 * `POINT_TYPE_ID`) and headed by their type **row's** name, exactly as the library's
 * tabs and the Database's tables are: a reader who renames a type sees the new name
 * everywhere, and no copy of it is held here. The folded group has no single row to
 * be named after, so its heading is a constant.
 */

/** The types whose tiles keep a heading of their own. */
const OWN_HEADING_TYPE_IDS: readonly string[] = [CHAKRA_TYPE_ID, POINT_TYPE_ID];

/** The heading every other live type's tiles are drawn under. */
export const OTHER_GROUP_HEADING = "Other meditation blocks";

/** The key the folded group is rendered under. */
export const OTHER_GROUP_KEY = "other";

export type MeditationTileGroup = {
  /** A type id, or `OTHER_GROUP_KEY`: stable across a rename of the heading. */
  key: string;
  heading: string;
  meditations: Meditation[];
};

/**
 * One live type's tiles, in the order they arrived.
 *
 * Nothing is sorted here: `LibraryView` has already put the meditations in the
 * reader's order, and a sort here would be a second answer to the same question.
 */
function tilesOf(meditations: Meditation[], typeId: string): Meditation[] {
  return meditations.filter((row) => row.typeId === typeId);
}

/**
 * The plan page's groups, in the order they are drawn.
 *
 * The folded group is built by walking the live types in the reader's type order
 * and taking each one's tiles in turn, so the same catalogue always produces the
 * same list — the order does not depend on which types happen to exist, only on the
 * types' own `sortOrder` and then the rows' order inside each of them.
 */
export function meditationTileGroups(
  meditations: Meditation[],
  types: MeditationType[],
): MeditationTileGroup[] {
  const live = liveTypes(types);
  const groups: MeditationTileGroup[] = [];
  for (const typeId of OWN_HEADING_TYPE_IDS) {
    const type = live.find((row) => row.id === typeId);
    if (!type) continue;
    groups.push({
      key: type.id,
      heading: type.name,
      meditations: tilesOf(meditations, type.id),
    });
  }
  const rest = live
    .filter((row) => !OWN_HEADING_TYPE_IDS.includes(row.id))
    .flatMap((row) => tilesOf(meditations, row.id));
  if (rest.length > 0) {
    groups.push({ key: OTHER_GROUP_KEY, heading: OTHER_GROUP_HEADING, meditations: rest });
  }
  // An empty group is not drawn: a heading over nothing claims a type has
  // meditations and then shows none. A type that is archived is not in `live`, so
  // its meditations are not drawn anywhere — which is what happened before this
  // grouping existed.
  return groups.filter((group) => group.meditations.length > 0);
}
