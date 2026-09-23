/**
 * The meditation types every workspace starts with.
 *
 * A type is a **row** (`MeditationType`) and a reader can add more, so there is no
 * union here and no switch: what this file holds is the *identity* of the four
 * seeded rows. Their ids are deterministic — the seed mints them with `nid()`, so
 * two devices seeding the same catalogue agree about them — and code that has to
 * mean "the Chakra type" asks for it by id rather than by matching a label, which
 * a reader is free to rename.
 *
 * It lives in the domain because both sides of the hexagon need it and neither may
 * import the other: `packages/db` seeds the rows, and `apps/web` decides which
 * built-in columns a meditation's type gets. The app may not import `packages/db`
 * (the integrity test enforces that), so the ids have to be here.
 */
import {
  AFFIRMATION_STAGES,
  copyStages,
  INTENTION_STAGES,
  PROTECTION_STAGES,
} from "./stages.ts";
import type { StageTemplate } from "./models.ts";

export const CHAKRA_TYPE_ID = "01900000-0000-7000-8000-0000000000c0";
export const POINT_TYPE_ID = "01900000-0000-7000-8000-0000000000c1";
export const PROTECTION_TYPE_ID = "01900000-0000-7000-8000-0000000000c2";
export const THANKS_GIVING_TYPE_ID = "01900000-0000-7000-8000-0000000000c3";

/**
 * The four seeded types, in the order they sit in the library's tab strip, each
 * with the stage template its blocks are built from.
 *
 * `name` is what a reader sees, and it is what the seeded rows are called; the id
 * is what the code means. A type the reader adds is a row like these, with an id
 * of its own, a place at the end of this order and whatever stages the reader gives
 * it.
 */
export const SEEDED_MEDITATION_TYPES: {
  id: string;
  name: string;
  stages: StageTemplate[];
}[] = [
  // Plural, because a type's name is a heading as well as a label: it is the
  // library's tab, the group above a row of tiles, and the `Type` of one row. The
  // owner's round 6 settled the plural when the heading said "Point" and read as a
  // single odd one out.
  { id: CHAKRA_TYPE_ID, name: "Chakras", stages: copyStages(INTENTION_STAGES) },
  { id: POINT_TYPE_ID, name: "Points", stages: copyStages(INTENTION_STAGES) },
  { id: PROTECTION_TYPE_ID, name: "Protection", stages: copyStages(PROTECTION_STAGES) },
  {
    id: THANKS_GIVING_TYPE_ID,
    name: "Thanks Giving",
    stages: copyStages(AFFIRMATION_STAGES),
  },
];
