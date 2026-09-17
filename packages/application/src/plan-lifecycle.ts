import type { Plan, PlanBlock } from "@meditaur/domain";

export const PLAN_ERRORS = {
  keepOne: "Keep at least one plan",
  conflict: "Plan was changed in another tab",
  missing: "That plan is gone.",
} as const;

export const FOCUS_SESSION_PLAN_ID = "01900000-0000-7000-8000-000000000060";
export const FOCUS_SESSION_PLAN_NAME = "Focus session";

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
  focusBlockId: string;
  cooloffBlockId: string;
  focusPointId: string | null;
  binauralPresetId: string | null;
  tableViewId: string | null;
}): Plan {
  const focus: PlanBlock = {
    id: input.focusBlockId,
    sortOrder: 0,
    type: "focus",
    durationMs: 120_000,
    focusPointId: input.focusPointId,
    symbolId: null,
    symbolScope: "rotate",
    binauralPresetId: input.binauralPresetId,
    tableViewId: input.tableViewId,
    ambientAssetId: null,
    alarmAssetId: null,
  };
  const cooloff: PlanBlock = {
    id: input.cooloffBlockId,
    sortOrder: 1,
    type: "cooloff",
    durationMs: 30_000,
    focusPointId: null,
    symbolId: null,
    symbolScope: "rotate",
    binauralPresetId: null,
    tableViewId: null,
    ambientAssetId: null,
    alarmAssetId: null,
  };
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    name: input.name,
    cycleCount: 1,
    cycleUntilStopped: false,
    autoAdvance: input.autoAdvance,
    binauralEnabled: true,
    revision: 0,
    blocks: [focus, cooloff],
  };
}
