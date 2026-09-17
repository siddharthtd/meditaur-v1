import { fail, PLAN_BLOCK_ERRORS, parsePlanBlocks, type Plan } from "@meditaur/domain";
import { db, type PlanRow } from "./schema.ts";

export function planFromRow(row: PlanRow): Plan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.blocksJson);
  } catch {
    fail("plan.blocksInvalid", PLAN_BLOCK_ERRORS.invalid);
  }
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    cycleCount: row.cycleCount,
    cycleUntilStopped: row.cycleUntilStopped,
    autoAdvance: row.autoAdvance,
    binauralEnabled: row.binauralEnabled !== false,
    revision: row.revision ?? 0,
    blocks: parsePlanBlocks(parsed),
  };
}

export async function savePlan(plan: Plan): Promise<void> {
  await db.plans.put({
    id: plan.id,
    workspaceId: plan.workspaceId,
    name: plan.name,
    cycleCount: plan.cycleCount,
    cycleUntilStopped: plan.cycleUntilStopped,
    autoAdvance: plan.autoAdvance,
    binauralEnabled: plan.binauralEnabled !== false,
    revision: plan.revision,
    blocksJson: JSON.stringify(plan.blocks),
    updatedAt: Date.now(),
  });
}
