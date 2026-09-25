import {
  fail,
  normalizePlanDisplay,
  PLAN_BLOCK_ERRORS,
  parsePlanBlocks,
  type Plan,
} from "@meditaur/domain";
import { db, type PlanRow } from "./schema.ts";

/**
 * The stored display, read back into a plan.
 *
 * A row written before the column existed has no JSON at all, and a row whose
 * JSON is damaged is not a reason to lose the plan: `normalizePlanDisplay`
 * answers with the app's own default for both, which is what a plan that has
 * never been asked the question should show.
 */
function displayFromJson(raw: string | undefined): ReturnType<typeof normalizePlanDisplay> {
  if (!raw) return normalizePlanDisplay(undefined);
  try {
    return normalizePlanDisplay(JSON.parse(raw));
  } catch {
    return normalizePlanDisplay(undefined);
  }
}

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
    // A plan stored before the switch existed rings its alarm, which is what the
    // field's absence means: the alarm was never optional.
    alarmEnabled: row.alarmEnabled !== false,
    binauralEnabled: row.binauralEnabled !== false,
    revision: row.revision ?? 0,
    display: displayFromJson(row.displayJson),
    blocks: parsePlanBlocks(parsed),
  };
}

/**
 * A plan as the **local** store holds it.
 *
 * Exported for the protocol's pull (`sync.ts`), which writes a plan it received without
 * going through `savePlan`: that one is the *product's* save — it stamps `updatedAt` and
 * clears the mark, because the app only ever writes a plan the reader has open — while a
 * pull writes a row that is whatever the cloud says, mark and revision included. One
 * place still decides the local row's shape, which is why this is a function rather than
 * two object literals.
 */
export function planRowForStore(plan: Plan): PlanRow {
  return {
    id: plan.id,
    workspaceId: plan.workspaceId,
    name: plan.name,
    cycleCount: plan.cycleCount,
    cycleUntilStopped: plan.cycleUntilStopped,
    autoAdvance: plan.autoAdvance,
    alarmEnabled: plan.alarmEnabled !== false,
    binauralEnabled: plan.binauralEnabled !== false,
    revision: plan.revision,
    blocksJson: JSON.stringify(plan.blocks),
    displayJson: JSON.stringify(plan.display ?? { columns: [] }),
    updatedAt: Date.now(),
    // A save writes a **live** row: the app only writes a plan the reader has open, and
    // a plan is never saved while it is marked — so `deletedAt` is cleared explicitly,
    // the same shape `planRow` and `planBlockRows` write on the cloud's side. A row put
    // back from a catalog backup comes through here too, and it is not a tombstone.
    deletedAt: null,
  };
}

export async function savePlan(plan: Plan): Promise<void> {
  await db.plans.put(planRowForStore(plan));
}
