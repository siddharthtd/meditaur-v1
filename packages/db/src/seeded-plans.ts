import {
  DEFAULT_ALARM_ENABLED,
  DEFAULT_PLAN_DISPLAY,
  POINT_TYPE_ID,
  stage,
  type Meditation,
  type Plan,
  type PlanBlock,
  type PlanBlockStage,
} from "@meditaur/domain";
import { normaliseName } from "./catalog-order.ts";
import { nid } from "./seeded-ids.ts";

/**
 * The seeded **points circuit** — the owner's round 22.
 *
 * The owner asked for a second plan whose blocks club several points into one pass: *"I
 * want to introduce another plan for a points circuit … Each point block can have multiple
 * points in it (no limit on the number of points). All the points in that block will share
 * the same intentions, symbol and focus stages and timers."* The model change that needed is
 * `PlanBlock.meditationIds`; this is the plan that uses more than one of them.
 *
 * It lives here rather than inline in `default-workspace.ts` for the reason `seeded-points.ts`
 * does: a fresh seed and the Dexie version that carries a seeded change to a device which
 * already has a catalogue must mint the **same** ids for the same rows. The merge is keyed by
 * id, so two devices disagreeing about what a row is, is not a cosmetic difference.
 *
 * Round 25 gave it the owner's **five groups** — every point the catalogue holds, grouped by
 * region, with the circuit's own timers and one tone per group — and a repair that carries that
 * grouping to a device holding round 22's three blocks of five (`regroupSeededPointsCircuit`).
 */

/** The points circuit's plan, by the id the seed gives it (`nid(0x41)`). */
export const POINTS_PLAN_ID = nid(0x41);
export const POINTS_PLAN_NAME = "Points circuit";

/** Where the circuit's blocks sit: `nid(0x220)` is the first of them. */
const BLOCK_SLOT_BASE = 0x220;

/**
 * The five groups the circuit walks, each written in the order the catalogue reads.
 *
 * The owner's grouping (round 25): *"the points circuit should be seeded with all the points
 * remaining … 'Eyes, Ears, Temples', 'Thyroid, thymus, shoulders, tips of the lungs', 'liver,
 * kidneys, pancreas, spleen', 'thighs, knees, lower legs' and 'ankles, soles of the feet' as
 * the groups."* Every point the catalogue holds is in exactly one of them, which is also what
 * stops a point being **dropped**: round 22's circuit sliced the catalogue five at a time, so
 * an odd count lost its tail.
 *
 * The order *inside* a group is `FOCUS_ORDER`'s rather than the order the ask listed them in —
 * one ordering rule, and the order the library's Points tab shows (the owner's answer).
 */
export const POINT_GROUPS: readonly (readonly string[])[] = [
  ["Eyes", "Temples", "Ears"],
  ["Thyroid", "Thymus", "Shoulders", "Tips of the lungs"],
  ["Liver", "Kidneys", "Pancreas", "Spleen"],
  ["Thighs", "Knees", "Lower legs"],
  ["Ankles", "Soles of the feet"],
];

/**
 * Each group's tone, as the **slot** of a preset the seed already ships — or `null` for none.
 *
 * The owner's *"find out what binaural beats are good for the group … and set it properly"*,
 * answered the app's own way: every slot below is one of the catalogue's own Solfeggio rows, so
 * no new row and no new claim — the head reads as the third-eye carrier, the throat and the
 * chest as the throat's, the organs as the solar plexus's, the legs and the feet as the root's.
 * It is the app's **convention**, not a finding: the evidence for region-specific binaural
 * effects is not there (the 2023 systematic review, Ingendoh/Posny/Heine, *PLOS ONE* 18(5):
 * e0286023, found 5 of 14 studies agreeing with brainwave entrainment, 8 contradictory and 1
 * mixed, and calls the evidence inconclusive). `DECISIONS.md` §19 records the same sentence.
 *
 * A slot is the preset's identity in the catalogue and not a reference to a row by name: the
 * id comes from `nid()`, so the tone survives the reader renaming the preset.
 */
export const GROUP_PRESET_SLOTS: readonly (number | null)[] = [0x70, 0x71, 0x73, 0x75, 0x75];

/** What every block of the circuit holds: a minute of intentions and a minute of symbols. */
export const CIRCUIT_STAGE_MINUTES = 1;

/**
 * The focus stage's floor, in minutes.
 *
 * The owner's timers: four points → 6:00 total, three points → 5:00, and the two-point group
 * (the feet) → 5:00 as well. So the focus is one minute a point, never less than three.
 */
export const CIRCUIT_FOCUS_FLOOR_MINUTES = 3;

/**
 * How many of the app's points a store has to hold before the circuit is worth planting.
 *
 * A repair is for what the app got wrong, never for what the reader chose: a store with a
 * handful of hand-made points is not waiting for a circuit that names them, and one with the
 * catalogue is.
 */
export const MIN_CIRCUIT_POINTS = 5;

/** The rows the circuit walks, in the order they read: the catalogue's own. */
function circuitPoints(meditations: readonly Meditation[]): Meditation[] {
  return meditations
    .filter((row) => row.typeId === POINT_TYPE_ID)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

/** A block's stages: a minute of intentions, a minute of symbols, and the focus. */
export function circuitStages(pointCount: number): PlanBlockStage[] {
  const focus = Math.max(CIRCUIT_FOCUS_FLOOR_MINUTES, pointCount) * 60_000;
  return [
    stage("intentions", "intentions", CIRCUIT_STAGE_MINUTES * 60_000),
    stage("symbols", "symbols", CIRCUIT_STAGE_MINUTES * 60_000),
    stage("focus", "focus", focus),
  ];
}

/**
 * The circuit plan, from the points a catalogue holds.
 *
 * Every block is **one group**: its points share one set of timers, one tone and one Display
 * (`null`, so a block reads the plan's), which is the owner's *"All the points in that block
 * will share the same intentions, symbol and focus stages and timers."* `symbolScope: "all"` is
 * what makes a block read the symbols its points carry, and `compilePlan` shows a symbol two of
 * them have in common **once**, holding both points' lines.
 *
 * A group the store does not hold is skipped rather than filled in: the circuit is built from
 * the store's own rows, and a point the reader deleted is not one to reintroduce. Its timer
 * follows the points that are really there, so a three-point group runs a three-point group's
 * five minutes.
 *
 * `livePresetIds` is the store's presets, when the caller has them: a tone is named only if it
 * is really there, because a block pointing at a missing preset makes the whole plan refuse to
 * compile — `requireListed` fails hard, and a session that will not start is worse than a
 * silent block.
 */
export function pointsCircuit(
  workspaceId: string,
  points: readonly Meditation[],
  livePresetIds?: readonly string[],
): Plan {
  const ours = livePresetIds === undefined ? null : new Set(livePresetIds);
  const blocks: PlanBlock[] = [];
  POINT_GROUPS.forEach((group, index) => {
    const mine = group
      .map((name) => points.find((row) => normaliseName(row.name) === normaliseName(name)))
      .filter((row): row is Meditation => row !== undefined);
    if (mine.length === 0) return;
    const slot = GROUP_PRESET_SLOTS[index];
    const wanted = slot == null ? null : nid(slot);
    blocks.push({
      id: nid(BLOCK_SLOT_BASE + blocks.length),
      sortOrder: blocks.length,
      stages: circuitStages(mine.length),
      meditationIds: mine.map((row) => row.id),
      symbolId: null,
      // All of them: a point's symbols are what this block shares out, and the ones two
      // points have in common are merged into one group by the compiler.
      symbolScope: "all",
      binauralPresetId: ours && wanted !== null && !ours.has(wanted) ? null : wanted,
      ambientAssetId: null,
      alarmAssetId: null,
      // The plan's answers, like every other seeded block: nothing is copied into a block
      // until the reader says otherwise, and a seeded block never draws a subset.
      alarmEnabled: null,
      display: null,
      intentionRandomiser: null,
    });
  });
  return {
    id: POINTS_PLAN_ID,
    workspaceId,
    name: POINTS_PLAN_NAME,
    cycleCount: 1,
    cycleUntilStopped: false,
    autoAdvance: true,
    alarmEnabled: DEFAULT_ALARM_ENABLED,
    binauralEnabled: true,
    revision: 0,
    display: DEFAULT_PLAN_DISPLAY,
    blocks,
  };
}

/**
 * The circuit to plant on a device that already has a catalogue (Dexie v33), or `[]`.
 *
 * The rule is v24's, and it is what makes this safe on a device a reader has been using:
 *
 * - nothing happens when the plan is already there, matched by the id the seed gives it, so
 *   a reader who edited, renamed or deleted their circuit is never handed a second one;
 * - nothing happens on a store that does not hold the app's own points, because the circuit
 *   names rows the app planted and a store with a few hand-made points is not waiting for it;
 * - the points are read from the store rather than rebuilt, so a row the reader renamed is
 *   still the row the circuit walks. They are ordered by `sortOrder`, which is the order the
 *   catalogue reads in — the same order a fresh seed writes.
 *
 * Since round 25 the circuit this plants is the **five groups**; a device holding the older
 * three blocks of five is regrouped by `regroupSeededPointsCircuit` (Dexie v35) instead, which
 * is also why this may not touch a plan that is already there.
 */
export function withSeededPointsCircuit(input: {
  meditations: readonly Meditation[];
  plans: readonly Plan[];
}): Plan[] {
  if (input.plans.some((row) => row.id === POINTS_PLAN_ID)) return [];
  const workspaceId = input.meditations[0]?.workspaceId;
  if (!workspaceId) return [];
  const points = circuitPoints(input.meditations);
  if (points.length < MIN_CIRCUIT_POINTS) return [];
  return [pointsCircuit(workspaceId, points)];
}

/**
 * The plans to write back with the circuit's five groups (Dexie v35), or `[]`.
 *
 * The one repair in the tree that may overrule a reader: asked whether the app should regroup
 * the circuit on a device that already holds round 22's, the owner's answer was **regroup
 * always**. So the blocks of the seeded plan are replaced by the groups the catalogue now
 * names, whether or not the reader had edited them — while the plan's own name, switches,
 * Display and `revision` are kept exactly as they are, because what changed is the app's
 * grouping rather than the reader's plan.
 *
 * It plants nothing: a store without the plan is `withSeededPointsCircuit`'s business, and a
 * marked plan is never handed in here (`schema.ts` reads `deletedAt` and passes live rows only),
 * so a circuit the reader deleted is not resurrected.
 */
export function regroupSeededPointsCircuit(input: {
  meditations: readonly Meditation[];
  plans: readonly Plan[];
  presetIds: readonly string[];
}): Plan[] {
  const workspaceId = input.meditations[0]?.workspaceId;
  if (!workspaceId) return [];
  const stored = input.plans.find((row) => row.id === POINTS_PLAN_ID);
  if (!stored) return [];
  const next = pointsCircuit(workspaceId, circuitPoints(input.meditations), input.presetIds);
  return [{ ...stored, blocks: next.blocks }];
}
