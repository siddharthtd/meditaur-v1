import { type Clock, type Plan, type PlanRepository } from "@meditaur/domain";
import { planBlockRows, planFromCloud, planRow } from "./plan-rows.ts";
import { liveRows, markRowDeleted } from "./row-mark.ts";
import type { SupabaseDataLike } from "./supabase.ts";

const PLANS = "plans";
const BLOCKS = "plan_blocks";

/**
 * `PlanRepository` over the cloud — item 3's slice 2, the half that needed a decision
 * first.
 *
 * The decision was slice 1's: plans were left out of the catalogue's delete marks,
 * *"deliberately not on `plans` either, which are versioned by `revision`"*. That was
 * right about how a plan is **settled** and wrong about how a delete **travels** —
 * `deletePlan` exists in the product, and last-write-wins cannot tell a row that was
 * deleted from one that was never seen, so without a mark the other device reads the
 * missing row as new and pulls it back. `20260923140000_plan_delete_marks.sql` adds
 * the mark to both tables, and `docs/ARCHITECTURE.md` had already assigned that
 * decision to this slice.
 *
 * Three consequences of the shape, each of them a way this could be wrong quietly:
 *
 * - **A marked row is filtered out of every read here.** The domain has nowhere to
 *   carry the mark (`Plan` is versioned by `revision` alone, `PlanBlock` has no
 *   `deletedAt`), and it should not have one: the app never shows a deleted plan, so a
 *   mark is a fact about the store rather than a state of the model.
 * - **A block that left the plan is marked on save.** Blocks travel with their plan
 *   rather than on a revision of their own, so `save` reconciles the two sets — the
 *   rows it just wrote and the rows the store still holds. Without it, removing a block
 *   would leave it in the cloud and the next pull would hand it back.
 * - **A save writes live rows.** Both mappers write `deleted_at: null`, because an
 *   upsert that omits a column keeps its stored value: a plan or block that was deleted
 *   and then written again has to stop being a tombstone.
 *
 * Nothing in this port is a compare-and-swap: `Plan.revision`'s CAS is the application's
 * guard against a second tab on **this** device and stays where it is
 * (`docs/DECISIONS.md` §7).
 */
export function createCloudPlanPort(input: {
  client: SupabaseDataLike;
  clock: Clock;
}): PlanRepository {
  const { client, clock } = input;

  /** A plan's live blocks, grouped by the plan they belong to. */
  async function blocksOf(
    planIds: string[],
  ): Promise<Map<string, Record<string, unknown>[]>> {
    const byPlan = new Map<string, Record<string, unknown>[]>();
    if (planIds.length === 0) return byPlan;
    for (const row of liveRows(await client.selectIn(BLOCKS, "plan_id", planIds, "*"))) {
      const planId = row.plan_id as string;
      byPlan.set(planId, [...(byPlan.get(planId) ?? []), row]);
    }
    return byPlan;
  }

  /** The plans a set of rows describes, each with its own blocks. */
  async function plansFrom(rows: Record<string, unknown>[]): Promise<Plan[]> {
    const plans = liveRows(rows);
    if (plans.length === 0) return [];
    const byPlan = await blocksOf(plans.map((row) => row.id as string));
    return plans.map((row) => planFromCloud(row, byPlan.get(row.id as string) ?? []));
  }

  /** The mark for a block, which has no revision or timestamp of its own. */
  function markBlock(row: Record<string, unknown>): Promise<void> {
    return markRowDeleted({
      client,
      clock,
      table: BLOCKS,
      row,
      columns: { updatedAt: false, revision: false },
    });
  }

  return {
    async getById(planId) {
      const [plan] = await plansFrom(await client.select(PLANS, "id", planId, "*"));
      return plan ?? null;
    },
    async getMany(planIds) {
      if (planIds.length === 0) return [];
      return plansFrom(await client.selectIn(PLANS, "id", planIds, "*"));
    },
    /**
     * Any live plan in the workspace, since the store's row order is the cloud's to
     * choose: this answers "which plan opens when none is named", and the one the
     * reader last used is a preference (`UserPreferences.lastPlanId`), not this.
     */
    async findFirstInWorkspace(workspaceId) {
      const [plan] = await plansFrom(await client.select(PLANS, "workspace_id", workspaceId, "*"));
      return plan ?? null;
    },
    async listSummaries(workspaceId) {
      const rows = liveRows(await client.select(PLANS, "workspace_id", workspaceId, "*"));
      return rows.map((row) => ({
        id: row.id as string,
        name: (row.name as string | null | undefined) ?? "",
      }));
    },
    async save(plan) {
      await client.upsert(PLANS, planRow(plan));
      const rows = planBlockRows(plan);
      for (const row of rows) await client.upsert(BLOCKS, row);

      const held = new Set(rows.map((row) => row.id as string));
      for (const stored of await client.select(BLOCKS, "plan_id", plan.id, "*")) {
        if (stored.deleted_at != null) continue;
        if (held.has(stored.id as string)) continue;
        await markBlock(stored);
      }
    },
    async delete(planId) {
      for (const plan of await client.select(PLANS, "id", planId, "*")) {
        // The blocks first, so a failure between the two leaves a marked plan with live
        // blocks rather than blocks whose plan is already gone.
        for (const block of await client.select(BLOCKS, "plan_id", planId, "*")) {
          if (block.deleted_at != null) continue;
          await markBlock(block);
        }
        await markRowDeleted({ client, clock, table: PLANS, row: plan });
      }
    },
  };
}
