import { describe, expect, it } from "vitest";
import {
  DECLARATION_STAGE_MS,
  POINT_TYPE_ID,
  THANKS_GIVING_TYPE_ID,
  stagesDurationMs,
  type Plan,
} from "@meditaur/domain";
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

/**
 * The circuit's Thanks Giving, with **no stages of its own**, so the ends run the type's
 * template — which is the fallback a seeded row written before round 26 relies on.
 */
function thanksGiving() {
  return makeMeditation("thanks-giving", "Thanks Giving", {
    typeId: THANKS_GIVING_TYPE_ID,
    stages: null,
  });
}

/** The blocks between the two ends: the owner's groups, and nothing else. */
function groups(plan: Plan) {
  return plan.blocks.slice(1, -1);
}

/** Each group's tone as the plan names it: the seeded preset's own id. */
const TONES = GROUP_PRESET_SLOTS.map((slot) => (slot == null ? null : nid(slot)));

/** One block's stages in seconds. */
function seconds(block: { stages: readonly { durationMs: number }[] }): number[] {
  return block.stages.map((row) => row.durationMs / 1000);
}

const NAMES = new Map([...catalogue(), thanksGiving()].map((row) => [row.id, row.name]));

/** The names a block walks, in the order it walks them. */
function namesIn(module: { meditationIds: readonly string[] }): string[] {
  return module.meditationIds.map((id) => NAMES.get(id)!);
}

describe("the seeded points circuit", () => {
  it("opens and closes with Thanks Giving, the way the chakra circuit does", () => {
    const plan = pointsCircuit("ws1", catalogue(), thanksGiving());
    const [open, ...rest] = plan.blocks;
    const close = rest.at(-1);
    expect(plan.blocks).toHaveLength(7);
    expect(open?.meditationIds).toEqual([thanksGiving().id]);
    expect(close?.meditationIds).toEqual([thanksGiving().id]);
    // Fixed slots above the group range, so adding the ends could not renumber a group block
    // a device already holds, and read in the plan's own order.
    expect(open?.id).toBe(nid(0x230));
    expect(close?.id).toBe(nid(0x231));
    expect(plan.blocks.map((block) => block.sortOrder)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // Thanks Giving's own template: the Declaration, then the one affirmation it reads.
    expect(open?.stages.map((row) => row.key)).toEqual(["declaration", "affirmations"]);
    expect(seconds(open!)).toEqual([10, 60]);
    // The one place a seeded block answers the alarm question for itself — the owner's
    // *"Alarm should be ON by default, only OFF for thanks giving"* — and no tone to name,
    // because a Thanks Giving is spoken rather than sounded.
    expect(open?.alarmEnabled).toBe(false);
    expect(close?.alarmEnabled).toBe(false);
    expect(open?.binauralPresetId).toBe(null);
    expect(close?.binauralPresetId).toBe(null);
  });

  it("plants no end at all on a store that no longer holds a Thanks Giving", () => {
    const plan = pointsCircuit("ws1", catalogue(), null);
    expect(plan.blocks).toHaveLength(5);
    expect(plan.blocks.map((block) => block.sortOrder)).toEqual([0, 1, 2, 3, 4]);
    expect(plan.blocks[0]?.id, "the first group keeps the seed's first slot").toBe(nid(0x220));
  });

  it("walks the owner's five groups, and every point is in exactly one of them", () => {
    const plan = pointsCircuit("ws1", catalogue(), thanksGiving());
    expect(plan.id).toBe(POINTS_PLAN_ID);
    expect(plan.name).toBe(POINTS_PLAN_NAME);
    // The groups by size: the head's three, the throat's four, the organs' four, the legs'
    // three and the feet's two — every point the catalogue holds, and none of them twice.
    expect(groups(plan).map((block) => block.meditationIds.length)).toEqual([3, 4, 4, 3, 2]);
    const walked = groups(plan).flatMap((block) => block.meditationIds);
    expect(walked).toHaveLength(CATALOGUE.length);
    expect(new Set(walked).size).toBe(CATALOGUE.length);
    // The group blocks are numbered from the seed's own slot, in order, and read in that order.
    expect(groups(plan).map((block) => block.id)).toEqual(
      groups(plan).map((_, index) => nid(0x220 + index)),
    );
    expect(groups(plan).map((block) => block.sortOrder)).toEqual([1, 2, 3, 4, 5]);
    // A block reads the symbols its points carry, which is what makes the ones two points
    // have in common show once (`compilePlan`), and takes the plan's own Display.
    expect(plan.blocks.every((block) => block.symbolScope === "all")).toBe(true);
    expect(plan.blocks.every((block) => block.display === null)).toBe(true);
  });

  it("reads each group's points in the catalogue's order, not the ask's", () => {
    const plan = pointsCircuit("ws1", catalogue(), thanksGiving());
    expect(groups(plan).map(namesIn)).toEqual([
      ["Eyes", "Temples", "Ears"],
      ["Thyroid", "Thymus", "Shoulders", "Tips of the lungs"],
      ["Liver", "Kidneys", "Pancreas", "Spleen"],
      ["Thighs", "Knees", "Lower legs"],
      ["Ankles", "Soles of the feet"],
    ]);
  });

  it("gives each group the timers the owner asked for, behind its Declaration", () => {
    const plan = pointsCircuit("ws1", catalogue(), thanksGiving());
    // 1 + 1 + max(3, points), behind the ten-second Declaration: six minutes for a four-point
    // group, five for a three-point one and five for the two-point one, because the focus never
    // goes below three.
    expect(groups(plan).map((block) => stagesDurationMs(block.stages) / 1000)).toEqual([
      310, 370, 370, 310, 310,
    ]);
    expect(groups(plan).map(seconds)).toEqual([
      [10, 60, 60, 180],
      [10, 60, 60, 240],
      [10, 60, 60, 240],
      [10, 60, 60, 180],
      [10, 60, 60, 180],
    ]);
    expect(groups(plan).map((block) => block.stages.map((row) => row.kind))).toEqual(
      groups(plan).map(() => ["affirmations", "intentions", "symbols", "focus"]),
    );
    // The Declaration leads every block, and it is an **affirmations** stage pointed at the
    // other pool rather than a kind of its own (the owner's round 26).
    const declaration = groups(plan)[0]?.stages[0];
    expect(declaration?.key).toBe("declaration");
    expect(declaration?.label).toBe("Declaration");
    expect(declaration?.pool).toBe("declaration");
    expect(declaration?.durationMs).toBe(DECLARATION_STAGE_MS);
    expect(CIRCUIT_FOCUS_FLOOR_MINUTES).toBe(3);
    expect(circuitStages(2).map((row) => row.durationMs / 1000)).toEqual([10, 60, 60, 180]);
  });

  it("names each group's tone, and only while the store still holds it", () => {
    // The owner's mapping, the app's own rows: the head as the third-eye carrier, the throat
    // and the chest as the throat's, the organs as the solar plexus's, the legs and the feet
    // as the root's.
    expect(
      groups(pointsCircuit("ws1", catalogue(), thanksGiving())).map(
        (block) => block.binauralPresetId,
      ),
    ).toEqual(TONES);
    // A device that has deleted one gets a silent block rather than a plan that refuses to
    // compile — `requireListed` fails hard on a missing preset.
    const held = TONES.filter((id): id is string => id !== TONES[0]);
    expect(
      groups(pointsCircuit("ws1", catalogue(), thanksGiving(), held))[0]?.binauralPresetId,
    ).toBe(null);
    expect(
      groups(pointsCircuit("ws1", catalogue(), thanksGiving(), [])).every(
        (block) => block.binauralPresetId === null,
      ),
    ).toBe(true);
  });

  it("leaves out a point the store does not hold, and the group's timer follows it", () => {
    const without = CATALOGUE.filter((name) => name !== "Ankles");
    const plan = pointsCircuit("ws1", catalogue(without), thanksGiving());
    expect(plan.blocks).toHaveLength(7);
    const feet = groups(plan)[4]!;
    expect(feet.meditationIds).toHaveLength(1);
    // One point still runs the three-minute floor's five minutes.
    expect(seconds(feet)).toEqual([10, 60, 60, 180]);
  });

  it("skips a group whose points are all gone, keeping the ends", () => {
    const plan = pointsCircuit("ws1", catalogue(["Eyes", "Temples", "Ears"]), thanksGiving());
    expect(plan.blocks).toHaveLength(3);
    expect(groups(plan)[0]?.id, "the first group keeps the seed's first slot").toBe(nid(0x220));
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
    const [planted] = withSeededPointsCircuit({
      meditations: [...catalogue(), thanksGiving()],
      plans: [],
    });
    expect(planted).toEqual(pointsCircuit("ws1", catalogue(), thanksGiving()));
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
      meditations: [...catalogue(), thanksGiving()],
      plans: [stored],
      presetIds: TONES.filter((id): id is string => id !== null),
    });
    expect(next?.id).toBe(POINTS_PLAN_ID);
    expect(next?.name).toBe("My own name for it");
    expect(next?.revision).toBe(3);
    expect(next?.cycleCount).toBe(4);
    expect(next?.blocks.map((block) => block.meditationIds.length)).toEqual([
      1, 3, 4, 4, 3, 2, 1,
    ]);
    expect(groups(next!).map((block) => block.binauralPresetId)).toEqual(TONES);
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
