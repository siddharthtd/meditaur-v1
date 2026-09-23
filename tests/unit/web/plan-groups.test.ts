import { describe, expect, it } from "vitest";

import {
  meditationTileGroups,
  OTHER_GROUP_HEADING,
} from "../../../apps/web/src/features/planner/plan-groups.ts";
import {
  CHAKRA_TYPE_ID,
  POINT_TYPE_ID,
  PROTECTION_TYPE_ID,
  THANKS_GIVING_TYPE_ID,
} from "@meditaur/domain";
import { makeMeditation, makeMeditationType } from "../../fixtures/library.ts";

/**
 * The plan page's headings (the owner's round 16, item 5, §8).
 *
 * The rule is that only two types are worth a heading of their own and everything
 * else is folded into one list — and the parts that took thought are here: the fold
 * keeps the reader's order whatever order the types arrive in, a type the reader
 * adds later needs nothing registered for it to be folded, and neither an archived
 * type nor an empty group is drawn.
 */
describe("the plan page's tile groups", () => {
  const chakraType = makeMeditationType({ id: CHAKRA_TYPE_ID, name: "Chakras", sortOrder: 0 });
  const pointType = makeMeditationType({ id: POINT_TYPE_ID, name: "Points", sortOrder: 1 });
  const protectionType = makeMeditationType({
    id: PROTECTION_TYPE_ID,
    name: "Protection",
    sortOrder: 2,
  });
  const thanksType = makeMeditationType({
    id: THANKS_GIVING_TYPE_ID,
    name: "Thanks Giving",
    sortOrder: 3,
  });
  /** A type no code has heard of, which is what a reader adding one produces. */
  const mudrasType = makeMeditationType({ id: "type-mudras", name: "Mudras", sortOrder: 4 });

  const root = makeMeditation("m-root", "Root Chakra", { typeId: CHAKRA_TYPE_ID });
  const heart = makeMeditation("m-heart", "Heart Chakra", { typeId: CHAKRA_TYPE_ID });
  const liver = makeMeditation("m-liver", "Liver", { typeId: POINT_TYPE_ID });
  const protection = makeMeditation("m-protect", "Protection", { typeId: PROTECTION_TYPE_ID });
  const giving = makeMeditation("m-giving", "Thanks Giving", { typeId: THANKS_GIVING_TYPE_ID });
  const gyan = makeMeditation("m-gyan", "Gyan Mudra", { typeId: "type-mudras" });

  it("gives a chakra and a point their own heading, and folds the rest into one", () => {
    const groups = meditationTileGroups(
      [root, heart, liver, protection, giving],
      [chakraType, pointType, protectionType, thanksType],
    );
    // The named headings are their type rows' names, so the seeded ones read as the
    // owner's own words without being copied into the code.
    expect(groups.map((group) => group.heading)).toEqual([
      "Chakras",
      "Points",
      OTHER_GROUP_HEADING,
    ]);
    expect(groups[0].meditations.map((row) => row.name)).toEqual(["Root Chakra", "Heart Chakra"]);
    expect(groups[1].meditations.map((row) => row.name)).toEqual(["Liver"]);
    expect(groups[2].meditations.map((row) => row.name)).toEqual(["Protection", "Thanks Giving"]);
  });

  it("renames a heading with its type row", () => {
    const renamed = makeMeditationType({ id: CHAKRA_TYPE_ID, name: "Energy centres" });
    const groups = meditationTileGroups([root], [renamed]);
    expect(groups.map((group) => group.heading)).toEqual(["Energy centres"]);
  });

  it("folds a type the reader adds later, with nothing registered for it", () => {
    const groups = meditationTileGroups(
      [root, gyan, protection],
      [chakraType, protectionType, mudrasType],
    );
    expect(groups.at(-1)?.meditations.map((row) => row.name)).toEqual(["Protection", "Gyan Mudra"]);
  });

  it("orders the fold by the types' own order, whatever order they arrive in", () => {
    // Both lists arrive shuffled, which is what a store hands back. The folded
    // group is the same list twice for the same catalogue — type `sortOrder` first,
    // then the rows' own order inside each type.
    const first = meditationTileGroups(
      [giving, root, gyan, protection],
      [thanksType, mudrasType, chakraType, protectionType],
    );
    const second = meditationTileGroups(
      [gyan, protection, giving, root],
      [mudrasType, protectionType, thanksType, chakraType],
    );
    const folded = (groups: ReturnType<typeof meditationTileGroups>) =>
      groups.at(-1)?.meditations.map((row) => row.name);
    expect(folded(first)).toEqual(["Protection", "Thanks Giving", "Gyan Mudra"]);
    expect(folded(second)).toEqual(folded(first));
    expect(first.map((group) => group.heading)[0]).toBe("Chakras");
  });

  it("draws no group for an archived type", () => {
    const archived = makeMeditationType({
      id: PROTECTION_TYPE_ID,
      name: "Protection",
      sortOrder: 2,
      archivedAt: 1_700_000_000_000,
    });
    const groups = meditationTileGroups([root, protection], [chakraType, archived]);
    expect(groups.map((group) => group.heading)).toEqual(["Chakras"]);
  });

  it("draws no heading over an empty group", () => {
    // No Points type at all, and nothing to fold: `Chakras` is the only heading.
    const groups = meditationTileGroups([root, heart], [chakraType]);
    expect(groups.map((group) => group.heading)).toEqual(["Chakras"]);
  });
});
