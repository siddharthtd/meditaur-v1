import {
  DEFAULT_PLAN_DISPLAY,
  INTENTION_STAGES,
  copyStages,
  type Plan,
  type PlanBlock,
  type PlanBlockStage,
} from "@meditaur/domain";

export const PLAN_ERRORS = {
  keepOne: "Keep at least one plan",
  conflict: "Plan was changed in another tab",
  missing: "That plan is gone.",
} as const;

export const FOCUS_SESSION_PLAN_ID = "01900000-0000-7000-8000-000000000060";
export const MEDITATION_SESSION_PLAN_NAME = "Meditation session";

const NEW_SESSION = "New session";

export function nextPlanName(existing: string[]): string {
  if (!existing.includes(NEW_SESSION)) return NEW_SESSION;
  let n = 2;
  while (existing.includes(`${NEW_SESSION} ${n}`)) n += 1;
  return `${NEW_SESSION} ${n}`;
}

export function copyPlanName(source: string, existing: string[]): string {
  const base = `${source} copy`;
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${source} copy ${n}`)) n += 1;
  return `${source} copy ${n}`;
}

export function clonePlan(
  plan: Plan,
  input: { id: string; name: string; nextBlockId: () => string },
): Plan {
  return {
    ...plan,
    id: input.id,
    name: input.name,
    revision: 0,
    blocks: plan.blocks.map((block) => ({
      ...block,
      id: input.nextBlockId(),
    })),
  };
}

export function makeStarterPlan(input: {
  id: string;
  workspaceId: string;
  name: string;
  autoAdvance: boolean;
  /** The reader's own default for a new plan's alarm switch (§12.4). */
  alarmEnabled: boolean;
  /** The one block's id, and the meditation it runs. */
  meditationBlockId: string;
  meditationId: string | null;
  binauralPresetId: string | null;
  /**
   * The stages the one meditation block runs.
   *
   * The caller knows the meditation and its type, so it passes the materialised
   * template in; the default is a chakra's three stages, so a starter session built
   * without one still runs rather than opening on an empty block.
   */
  stages?: PlanBlockStage[];
}): Plan {
  // **One block, and it is a meditation.** The owner's round 15 deleted cool-off, so
  // the one-tap session no longer closes with a silent timer block: the meditation's
  // own last stage is the ending.
  const meditation: PlanBlock = {
    id: input.meditationBlockId,
    sortOrder: 0,
    // A one-tap session is one meditation, so a list of one (round 22 made it a list).
    meditationIds: input.meditationId ? [input.meditationId] : [],
    stages: copyStages(input.stages ?? INTENTION_STAGES),
    symbolId: null,
    symbolScope: "rotate",
    binauralPresetId: input.binauralPresetId,
    ambientAssetId: null,
    alarmAssetId: null,
    // All three `null`: the block has no answer of its own yet, so the plan's stands — or,
    // for the randomiser, every line is read — and a one-tap session is one block whose
    // editor is where any of them changes.
    alarmEnabled: null,
    display: null,
    intentionRandomiser: null,
  };
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    name: input.name,
    cycleCount: 1,
    cycleUntilStopped: false,
    autoAdvance: input.autoAdvance,
    alarmEnabled: input.alarmEnabled,
    binauralEnabled: true,
    revision: 0,
    // A copy of the default, not the constant itself: a plan owns its display, and
    // editing one must not edit every other plan that starts from it.
    display: { columns: [...DEFAULT_PLAN_DISPLAY.columns] },
    blocks: [meditation],
  };
}
