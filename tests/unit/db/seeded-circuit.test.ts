import { THANKS_GIVING_TYPE_ID, type PlanBlockStage } from "@meditaur/domain";
import { describe, expect, it } from "vitest";
import {
  buildDefaultWorkspace,
  SEEDED_CROWN_BLOCK_ID,
} from "../../../packages/db/src/default-workspace.ts";
import {
  thanksGivingMinute,
  withoutSeededCrown,
} from "../../../packages/db/src/seeded-circuit.ts";

/** The seeded chakra circuit: the first of the two plans the seed plants. */
function circuit(ws: ReturnType<typeof buildDefaultWorkspace>) {
  return ws.plans[0]!;
}

/**
 * The repairs that carry the owner's round 20 to a device that already seeded itself.
 *
 * The seed runs once, so `buildDefaultWorkspace` is the *fresh* answer and these rules
 * are for the answer a device is already holding. They are pure functions so this suite
 * can test them at all — the unit suite has no IndexedDB — which is the shape v24's
 * reiki repair established (`reiki-symbols.test.ts`).
 *
 * The tests build the **old** shape on purpose: the rows the seed used to plant, taken
 * from the seed that is there now so the fixtures cannot drift from it.
 */

/** The affirmations stage every seeded Thanks Giving carried before round 20. */
const OLD_MS = 180_000;

/**
 * The id the *old* seed gave the closing Thanks Giving block.
 *
 * The circuit had nine blocks then (`nid(0x200 + index)`), so Crown was `0x207` and the
 * close was `0x208`. With Crown gone there are eight, and the close took `0x207` — which is
 * exactly why the repair matches a block on its meditation as well as its id, and why this
 * fixture has to renumber it: a test that left both blocks at `0x207` would be modelling a
 * plan no device ever held.
 */
const OLD_CLOSING_BLOCK = "01900000-0000-7000-8000-000000000208";

/** A device seeded by the last build: Thanks Giving at 3:00, and Crown in the circuit. */
function asTheOldSeed() {
  const ws = buildDefaultWorkspace("ws-test");
  const asOld = (stages: PlanBlockStage[] | null) =>
    stages?.map((stage) => (stage.kind === "affirmations" ? { ...stage, durationMs: OLD_MS } : stage)) ??
    null;
  const crown = ws.meditations.find((row) => row.name === "Crown Chakra")!;
  const blocks = circuit(ws).blocks.map((block, index) => ({
    ...block,
    stages: asOld(block.stages)!,
    // The close moves back to the number it held while Crown was in the circuit.
    id: index === circuit(ws).blocks.length - 1 ? OLD_CLOSING_BLOCK : block.id,
  }));
  return {
    ws,
    types: ws.meditationTypes.map((row) =>
      row.id === THANKS_GIVING_TYPE_ID ? { ...row, stages: asOld(row.stages)! } : row,
    ),
    meditations: ws.meditations.map((row) =>
      row.typeId === THANKS_GIVING_TYPE_ID ? { ...row, stages: asOld(row.stages) } : row,
    ),
    // The eighth block, which is where the seeded circuit put Crown: a chakra's own
    // stages, so nothing here is an affirmations stage the minute rule would touch.
    plans: [
      {
        ...circuit(ws),
        blocks: [
          ...blocks,
          {
            ...blocks[1]!,
            id: SEEDED_CROWN_BLOCK_ID,
            sortOrder: blocks.length,
            meditationIds: [crown.id],
          },
        ],
      },
    ],
  };
}

describe("the seeded circuit's repairs", () => {
  it("moves Thanks Giving to a minute, in the type, the row and the circuit's own blocks", () => {
    const old = asTheOldSeed();
    const patch = thanksGivingMinute(old);

    expect(patch.types, "the type template").toHaveLength(1);
    expect(patch.types[0]!.stages!.every((stage) => stage.durationMs !== OLD_MS)).toBe(true);
    expect(patch.meditations, "the meditation's own copy").toHaveLength(1);
    expect(patch.meditations[0]!.stages!.every((stage) => stage.durationMs !== OLD_MS)).toBe(true);
    // Both Thanks Giving blocks, and nothing else in the plan.
    expect(patch.plans).toHaveLength(1);
    const blocks = patch.plans[0]!.blocks;
    const givingId = old.meditations.find((row) => row.typeId === THANKS_GIVING_TYPE_ID)!.id;
    const giving = blocks.filter((block) => block.meditationIds.includes(givingId));
    expect(giving).toHaveLength(2);
    expect(
      giving.every((block) => block.stages.every((stage) => stage.durationMs !== OLD_MS)),
      "both of the circuit's Thanks Giving blocks read a minute",
    ).toBe(true);
    expect(
      blocks.filter((block) => block.stages.some((stage) => stage.durationMs === OLD_MS)),
      "and no stage in the plan is left at the old length",
    ).toHaveLength(0);
  });

  it("leaves a 3:00 affirmation that is not Thanks Giving's alone", () => {
    // Protection opens with one, and the owner never asked for it to move: this is the
    // scoping the repair would get wrong if it matched the *stage* rather than the row.
    const old = asTheOldSeed();
    const patch = thanksGivingMinute(old);
    const protection = old.types.find((row) => row.name === "Protection")!;
    expect(protection.stages!.some((stage) => stage.durationMs === OLD_MS)).toBe(true);
    expect(patch.types.some((row) => row.id === protection.id)).toBe(false);
  });

  it("changes nothing on a device that is already right", () => {
    // What the seed plants today: run against itself, the rule finds nothing to do — which
    // is what keeps the upgrade cheap on a fresh device.
    const ws = buildDefaultWorkspace("ws-test");
    const patch = thanksGivingMinute({
      types: ws.meditationTypes,
      meditations: ws.meditations,
      plans: [{ ...circuit(ws), blocks: [...circuit(ws).blocks] }],
    });
    expect(patch).toEqual({ types: [], meditations: [], plans: [] });
    expect(withoutSeededCrown([circuit(ws)])).toEqual([]);
  });

  it("removes the seeded Crown block and closes the gap, but never a reader's own", () => {
    const old = asTheOldSeed();
    const [plan] = old.plans;
    expect(plan!.blocks).toHaveLength(9);

    const [patched] = withoutSeededCrown(old.plans);
    expect(patched!.blocks).toHaveLength(8);
    expect(patched!.blocks.some((block) => block.id === SEEDED_CROWN_BLOCK_ID)).toBe(false);
    // A block's order is a running index, so the one after the removal takes its number.
    expect(patched!.blocks.map((block) => block.sortOrder)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);

    // The same plan with the reader's **own** Crown block in it: a different id, so the
    // repair leaves it where it is.
    const crown = old.ws.meditations.find((row) => row.name === "Crown Chakra")!;
    const mine = {
      ...plan!,
      blocks: [
        ...plan!.blocks.filter((block) => block.id !== SEEDED_CROWN_BLOCK_ID),
        {
          ...plan!.blocks[0]!,
          id: "a-block-the-reader-added",
          sortOrder: 8,
          meditationIds: [crown.id],
        },
      ],
    };
    expect(withoutSeededCrown([mine])).toEqual([]);
  });
});
