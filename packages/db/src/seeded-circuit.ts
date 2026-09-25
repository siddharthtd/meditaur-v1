import {
  AFFIRMATION_STAGES,
  THANKS_GIVING_TYPE_ID,
  type Meditation,
  type MeditationType,
  type Plan,
  type PlanBlock,
  type PlanBlockStage,
} from "@meditaur/domain";
import { SEEDED_CROWN_BLOCK_ID, SEEDED_CROWN_ID } from "./default-workspace.ts";

/**
 * Two seed changes carried to a device that already holds the catalogue (the owner's
 * round 20).
 *
 * The seed runs **once**, so changing what it plants reaches a fresh device and nobody
 * else — the reason v24's reiki repair exists, and the rule this file follows: a pure
 * function the upgrade body calls, tested without IndexedDB (which the unit suite has
 * none of), so the upgrade stays three lines.
 *
 * Both repairs are gated on the rows still looking like the ones the app wrote. That is
 * v25's rule (`isAppDefaultDisplay`): a repair is for what the app got wrong, never for
 * what the reader chose.
 */

/** The affirmations stage the seed used to plant: 3:00. */
const OLD_AFFIRMATION_MS = 180_000;
/** What it plants now — read off the template, so the two cannot drift. */
const NEW_AFFIRMATION_MS = AFFIRMATION_STAGES[0]!.durationMs;

/**
 * The rows to rewrite so Thanks Giving is a minute, and nothing for a device that reads a
 * minute already.
 *
 * Only the Thanks Giving meditation, its type, and **its own** blocks are touched. That
 * scoping is the whole of the safety here: Protection opens with an affirmations stage of
 * 3:00 as well, so "every three-minute affirmation" would move a timer the owner never
 * mentioned. Within those rows the gate is the same one: a stage that is still exactly
 * 3:00 is the one the app planted, and a stage the reader has moved keeps its number.
 */
export function thanksGivingMinute(input: {
  types: MeditationType[];
  meditations: Meditation[];
  plans: Plan[];
}): { types: MeditationType[]; meditations: Meditation[]; plans: Plan[] } {
  const restage = <T extends { stages: PlanBlockStage[] | null }>(row: T): T | null => {
    // A meditation's `stages` is null for "use the type's", and there is nothing to move.
    if (row.stages === null) return null;
    let changed = false;
    const stages = row.stages.map((stage) => {
      if (stage.kind !== "affirmations" || stage.durationMs !== OLD_AFFIRMATION_MS) {
        return stage;
      }
      changed = true;
      return { ...stage, durationMs: NEW_AFFIRMATION_MS };
    });
    return changed ? { ...row, stages } : null;
  };

  const thanksGivingIds = new Set(
    input.meditations.filter((row) => row.typeId === THANKS_GIVING_TYPE_ID).map((row) => row.id),
  );

  const types: MeditationType[] = [];
  for (const row of input.types) {
    if (row.id !== THANKS_GIVING_TYPE_ID) continue;
    const next = restage<MeditationType>(row);
    if (next) types.push(next);
  }

  const meditations: Meditation[] = [];
  for (const row of input.meditations) {
    if (!thanksGivingIds.has(row.id)) continue;
    const next = restage<Meditation>(row);
    if (next) meditations.push(next);
  }

  const plans: Plan[] = [];
  for (const plan of input.plans) {
    let changed = false;
    const blocks = plan.blocks.map((block) => {
      // A block names no meditation when it is a plan's own placeholder; it cannot be
      // Thanks Giving, and there is nothing to restage. The **lead** decides: the seeded
      // Thanks Giving blocks name that one and nothing else.
      const [lead] = block.meditationIds;
      if (lead === undefined || !thanksGivingIds.has(lead)) return block;
      const next = restage<PlanBlock>(block);
      if (!next) return block;
      changed = true;
      return next;
    });
    if (changed) plans.push({ ...plan, blocks });
  }

  return { types, meditations, plans };
}

/**
 * The plans to write back without the seeded Crown block, and nothing for a plan that
 * never held one.
 *
 * It removes **that block**, by the id the seed gave it **and** the meditation it names —
 * not every block that names Crown, and not whatever block happens to hold that number now
 * (the new seed's eighth block does, because the circuit has eight blocks rather than
 * nine). The owner asked for the seeded circuit to lose Crown: *"Remove crown chakra from
 * the seeded meditation plan, it is not required."* A reader who put Crown back in is not
 * making the same request, and a repair that deleted their block would be the app
 * overruling a press.
 *
 * The blocks after it close the gap in `sortOrder`, because a block's order is a running
 * index (`meditationBlock` writes it) and one missing number is a plan whose next drag
 * would land in a hole.
 */
export function withoutSeededCrown(plans: Plan[]): Plan[] {
  const patched: Plan[] = [];
  for (const plan of plans) {
    const blocks = plan.blocks.filter(
      (block) =>
        block.id !== SEEDED_CROWN_BLOCK_ID ||
        block.meditationIds.length !== 1 ||
        block.meditationIds[0] !== SEEDED_CROWN_ID,
    );
    if (blocks.length === plan.blocks.length) continue;
    patched.push({
      ...plan,
      blocks: blocks.map((block, index) => ({ ...block, sortOrder: index })),
    });
  }
  return patched;
}
