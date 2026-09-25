import { describe, expect, it } from "vitest";
import { POINT_TYPE_ID, stagesDurationMs } from "@meditaur/domain";
import {
  CIRCUIT_FOCUS_FLOOR_MINUTES,
  GROUP_PRESET_SLOTS,
  MIN_CIRCUIT_POINTS,
  POINTS_PLAN_ID,
  POINTS_PLAN_NAME,
  circuitStages,
  pointsCircuit,
  regroupSeededPointsCircuit,
  withSeededPointsCircuit,
} from "../../../packages/db/src/seeded-plans.ts";
import { nid } from "../../../packages/db/src/seeded-ids.ts";
import { makeMeditation, makePlan } from "../../fixtures/library.ts";

/**
 * The points circuit: the owner's five groups, each with its own timers and its own tone
 * (round 25), and the repair that carries that grouping to a device holding round 22's three
 * blocks of five.
 *
 * The catalogue below is the app's own names in the order they read, because a group matches
 * its points **by name** — a slot is what an id is minted from, and a name is the only handle
 * on a row that already exists.
 */
const CATALOGUE = [
  "Liver",
  "Kidneys",
  "Eyes",
  "Temples",
  "Ears",
  "Thyroid",
  "Thymus",
  "Shoulders",
  "Tips of the lungs",
  "Pancreas",
  "Spleen",
  "Thighs",
  "Knees",
  "Lower legs",
  "Ankles",
  "Soles of the feet",
];

/** The catalogue's points, in the order they read — or just the names given. */
function catalogue(names: readonly string[] = CATALOGUE) {
  return names.map((name, index) =>
    makeMeditation(`point-${CATALOGUE.indexOf(name)}`, name, {
      typeId: POINT_TYPE_ID,
      sortOrder: index,
    }),
  );
}

/** Each group's tone as the plan names it: the seeded preset's own id. */
const TONES = GROUP_PRESET_SLOTS.map((slot) => (slot == null ? null : nid(slot)));

/** One block's stages in minutes. */
function minutes(block: { stages: readonly { durationMs: number }[] }): number[] {
  return block.stages.map((row) => row.durationMs / 60_000);
}

const NAMES = new Map(catalogue().map((row) => [row.id, row.name]));

/** The names a block walks, in the order it walks them. */
function namesIn(module: { meditationIds: readonly string[] }): string[] {
  return module.meditationIds.map((id) => NAMES.get(id)!);
}

describe("the seeded points circuit", () => {
  it("walks the owner's five groups, and every point is in exactly one of them", () => {
    const plan = pointsCircuit("ws1", catalogue());
    expect(plan.id).toBe(POINTS_PLAN_ID);
    expect(plan.name).toBe(POINTS_PLAN_NAME);
    // The groups by size: the head's three, the throat's four, the organs' four, the legs'
    // three and the feet's two — every point the catalogue holds, and none of them twice.
    expect(plan.blocks.map((block) => block.meditationIds.length)).toEqual([3, 4, 4, 3, 2]);
    const walked = plan.blocks.flatMap((block) => block.meditationIds);
    expect(walked).toHaveLength(CATALOGUE.length);
    expect(new Set(walked).size).toBe(CATALOGUE.length);
    // The blocks are numbered from the seed's own slot, in order, and read in that order.
    expect(plan.blocks.map((block) => block.id)).toEqual(
      plan.blocks.map((_, index) => nid(0x220 + index)),
    );
    expect(plan.blocks.map((block) => block.sortOrder)).toEqual([0, 1, 2, 3, 4]);
    // A block reads the symbols its points carry, which is what makes the ones two points
    // have in common show once (`compilePlan`), and takes the plan's own Display.
    expect(plan.blocks.every((block) => block.symbolScope === "all")).toBe(true);
    expect(plan.blocks.every((block) => block.display === null)).toBe(true);
  });

  it("reads each group's points in the catalogue's order, not the ask's", () => {
    const plan = pointsCircuit("ws1", catalogue());
    expect(plan.blocks.map(namesIn)).toEqual([
      ["Eyes", "Temples", "Ears"],
      ["Thyroid", "Thymus", "Shoulders", "Tips of the lungs"],
      ["Liver", "Kidneys", "Pancreas", "Spleen"],
      ["Thighs", "Knees", "Lower legs"],
      ["Ankles", "Soles of the feet"],
    ]);
  });

  it("gives each group the timers the owner asked for", () => {
    const plan = pointsCircuit("ws1", catalogue());
    // 1 + 1 + max(3, points): six minutes for a four-point group, five for a three-point one
    // and five for the two-point one, because the focus never goes below three.
    expect(plan.blocks.map((block) => stagesDurationMs(block.stages) / 60_000)).toEqual([
      5, 6, 6, 5, 5,
    ]);
    expect(plan.blocks.map(minutes)).toEqual([
      [1, 1, 3],
      [1, 1, 4],
      [1, 1, 4],
      [1, 1, 3],
      [1, 1, 3],
    ]);
    expect(plan.blocks.map((block) => block.stages.map((row) => row.kind))).toEqual(
      plan.blocks.map(() => ["intentions", "symbols", "focus"]),
    );
    expect(CIRCUIT_FOCUS_FLOOR_MINUTES).toBe(3);
    expect(circuitStages(2).map((row) => row.durationMs / 60_000)).toEqual([1, 1, 3]);
  });

  it("names each group's tone, and only while the store still holds it", () => {
    // The owner's mapping, the app's own rows: the head as the third-eye carrier, the throat
    // and the chest as the throat's, the organs as the solar plexus's, the legs and the feet
    // as the root's.
    expect(pointsCircuit("ws1", catalogue()).blocks.map((block) => block.binauralPresetId)).toEqual(
      TONES,
    );
    // A device that has deleted one gets a silent block rather than a plan that refuses to
    // compile — `requireListed` fails hard on a missing preset.
    const held = TONES.filter((id): id is string => id !== TONES[0]);
    expect(pointsCircuit("ws1", catalogue(), held).blocks[0]?.binauralPresetId).toBe(null);
    expect(
      pointsCircuit("ws1", catalogue(), []).blocks.every(
        (block) => block.binauralPresetId === null,
      ),
    ).toBe(true);
  });

  it("leaves out a point the store does not hold, and the group's timer follows it", () => {
    const without = CATALOGUE.filter((name) => name !== "Ankles");
    const plan = pointsCircuit("ws1", catalogue(without));
    expect(plan.blocks).toHaveLength(5);
    const feet = plan.blocks[4]!;
    expect(feet.meditationIds).toHaveLength(1);
    // One point still runs the three-minute floor's five minutes.
    expect(minutes(feet)).toEqual([1, 1, 3]);
  });

  it("skips a group whose points are all gone", () => {
    const plan = pointsCircuit("ws1", catalogue(["Eyes", "Temples", "Ears"]));
    expect(plan.blocks).toHaveLength(1);
    expect(plan.blocks[0]?.id, "the first block keeps the seed's first slot").toBe(nid(0x220));
  });

  it("plants nothing on a store that already has the plan", () => {
    // Matched by the id the seed gives it, so a reader who renamed, edited or deleted their
    // own circuit is never handed a second one. Regrouping one that is already there is
    // `regroupSeededPointsCircuit`'s job, and it is v35's.
    const mine = makePlan([], { id: POINTS_PLAN_ID, name: "My circuit" });
    expect(withSeededPointsCircuit({ meditations: catalogue(), plans: [mine] })).toEqual([]);
  });

  it("plants nothing on a store that does not hold the app's own points", () => {
    expect(
      withSeededPointsCircuit({
        meditations: catalogue(CATALOGUE.slice(0, MIN_CIRCUIT_POINTS - 1)),
        plans: [],
      }),
    ).toEqual([]);
    // And nothing at all in an empty store: there is no workspace to plant a plan in.
    expect(withSeededPointsCircuit({ meditations: [], plans: [] })).toEqual([]);
  });

  it("mints the same ids a fresh seed would, for a device that already has a catalogue", () => {
    // The rule the round-21 repairs established: a repair has to agree with the seed **id for
    // id**, because the merge is keyed by id — two devices disagreeing about what a row is, is
    // not a cosmetic difference.
    const [planted] = withSeededPointsCircuit({ meditations: catalogue(), plans: [] });
    expect(planted).toEqual(pointsCircuit("ws1", catalogue()));
  });

  it("regroups the plan the seed planted, and changes nothing else about it", () => {
    // The owner's answer to *"should the app regroup it on your device?"*: regroup always. The
    // plan's own name, switches and revision are the reader's and are kept exactly as they
    // were, because what changed is the app's grouping rather than their plan.
    const stored = makePlan([], {
      id: POINTS_PLAN_ID,
      name: "My own name for it",
      revision: 3,
      cycleCount: 4,
    });
    const [next] = regroupSeededPointsCircuit({
      meditations: catalogue(),
      plans: [stored],
      presetIds: TONES.filter((id): id is string => id !== null),
    });
    expect(next?.id).toBe(POINTS_PLAN_ID);
    expect(next?.name).toBe("My own name for it");
    expect(next?.revision).toBe(3);
    expect(next?.cycleCount).toBe(4);
    expect(next?.blocks.map((block) => block.meditationIds.length)).toEqual([3, 4, 4, 3, 2]);
    expect(next?.blocks.map((block) => block.binauralPresetId)).toEqual(TONES);
    // A store with no circuit of its own is not given one here — that is the planting rule's
    // job — and an empty store has nothing to plan for.
    expect(
      regroupSeededPointsCircuit({ meditations: catalogue(), plans: [], presetIds: [] }),
    ).toEqual([]);
    expect(
      regroupSeededPointsCircuit({ meditations: [], plans: [stored], presetIds: [] }),
    ).toEqual([]);
  });
});
