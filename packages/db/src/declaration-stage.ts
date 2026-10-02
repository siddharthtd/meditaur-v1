import {
  copyStages,
  declarationStage,
  type Meditation,
  type MeditationType,
  type Plan,
  type PlanBlockStage,
} from "@meditaur/domain";

/**
 * The Declaration stage, carried to a device that already holds a catalogue (the owner's
 * round 26).
 *
 * The owner: *"In all the meditations (chakra, points, protection), I want to add another
 * stage called 'Declaration' … It should be inserted as a first stage to all the meditations
 * before the intentions."* A fresh device gets it from the templates themselves
 * (`packages/domain/src/stages.ts`); this is what a device that seeded before this round needs,
 * because `buildDefaultWorkspace` runs once and never again.
 *
 * Three things wear a stage list, and all three are repaired: a **type's** template, a
 * **meditation's** own copy, and a **block's** materialised stages. A block is "the template
 * materialised" rather than a reference, so a type repaired here does not reach a plan that
 * already exists — the block has to be repaired beside it or a running session would never see
 * the stage.
 *
 * The gates are the repo's own two:
 *
 * - **`null` is not a list.** A meditation with `stages: null` runs its type's, and an empty
 *   list on a block means "use the meditation's" (`blockStages`). Writing a stage into either
 *   would not add a Declaration — it would change *which fallback applies* and, for a block,
 *   collapse a whole meditation into ten seconds.
 * - **It is idempotent.** A list that already names a `declaration` key is left alone, so a
 *   device that runs this twice (or seeded after this round) is not handed two.
 *
 * What it deliberately does **not** gate on is the reader: unlike v25's display repair, there
 * is no "the app's own answer" to compare against, because the app has never written a
 * Declaration stage before now, and the owner asked for it on *all* the meditations — including
 * rows the reader added. A reader who removes it afterwards is not overruled again, because this
 * runs once per device.
 *
 * The function is pure on purpose: the unit suite has no IndexedDB, so a rule written inside
 * the upgrade body could not be tested at all (the split v24, v31 and the round-25 repairs all
 * use).
 */
export function withDeclarationStage(input: {
  types: MeditationType[];
  meditations: Meditation[];
  plans: Plan[];
}): { types: MeditationType[]; meditations: Meditation[]; plans: Plan[] } {
  /** The list with the Declaration in front of it, or `null` for one this repair leaves alone. */
  const inserted = (stages: PlanBlockStage[] | null): PlanBlockStage[] | null => {
    if (stages === null || stages.length === 0) return null;
    if (stages.some((row) => row.key === "declaration")) return null;
    return [declarationStage(), ...copyStages(stages)];
  };

  const types: MeditationType[] = [];
  for (const row of input.types) {
    const stages = inserted(row.stages);
    if (stages) types.push({ ...row, stages });
  }

  const meditations: Meditation[] = [];
  for (const row of input.meditations) {
    const stages = inserted(row.stages);
    if (stages) meditations.push({ ...row, stages });
  }

  const plans: Plan[] = [];
  for (const plan of input.plans) {
    let changed = false;
    const blocks = plan.blocks.map((block) => {
      const stages = inserted(block.stages);
      if (!stages) return block;
      changed = true;
      return { ...block, stages };
    });
    if (changed) plans.push({ ...plan, blocks });
  }

  return { types, meditations, plans };
}
