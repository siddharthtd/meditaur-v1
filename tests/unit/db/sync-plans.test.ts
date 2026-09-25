import { describe, expect, it } from "vitest";
import { FakeClock } from "@meditaur/domain";
import { fakeSupabaseData } from "../../fixtures/supabase-data.ts";
import { fakeLocal, fakeState, WORKSPACE } from "../../fixtures/sync-local.ts";
import { makeBlock, makePlan } from "../../fixtures/library.ts";
import { pullPlans, pushPlans, syncOnce } from "../../../packages/db/src/sync.ts";
import { planFromRow, planRowForStore } from "../../../packages/db/src/plan-mapper.ts";
import { planBlockRows, planRow } from "../../../packages/db/src/plan-rows.ts";
import type { PlanRow } from "../../../packages/db/src/schema.ts";

/**
 * The plan pair (`P2 · 3`, slice 3): the one half of the protocol that takes **no
 * watermark**.
 *
 * It cannot: `plans.updated_at` is the column's own default and the app never writes it, so
 * it does not move when a plan changes, and `plan_blocks` has no timestamp at all — a block
 * rides on its plan's revision. So both directions read the table whole and compare
 * revisions, which is what `20260923140000_plan_delete_marks.sql` means by a workspace's
 * handful of plans.
 *
 * The second thing these cases pin is the blocks: they travel *with* their plan, so a block
 * the plan no longer holds has to be **marked** on the way out rather than left live — or the
 * next pull hands it back.
 */
const AT = 1_700_000_000_000;

/** A clock the marks it writes can be named against. */
function clockAt(at = AT): FakeClock {
  const clock = new FakeClock();
  clock.advance(at);
  return clock;
}

/** The cloud's own row for a plan, and its blocks, as the mappers write them. */
function cloudPlan(plan: ReturnType<typeof makePlan>) {
  return { plans: [planRow(plan)], plan_blocks: planBlockRows(plan) };
}

function blocksOf(row: PlanRow): string[] {
  return planFromRow(row)
    .blocks.map((block) => block.id)
    .sort();
}

describe("the plan pair", () => {
  it("sends a plan the cloud has never seen, with its blocks", async () => {
    const plan = makePlan([makeBlock("b1", 0), makeBlock("b2", 1)], { revision: 3 });
    const local = fakeLocal({ plans: [planRowForStore(plan)] });
    const cloud = fakeSupabaseData();

    const report = await pushPlans({
      local: local.store,
      cloud: cloud.client,
      workspaceId: WORKSPACE,
      clock: clockAt(),
    });

    expect(report.sent, "the plan row and its two blocks").toBe(3);
    expect(cloud.rows("plans")).toHaveLength(1);
    expect(cloud.rows("plans")[0]!.revision).toBe(3);
    expect(cloud.rows("plan_blocks").map((row) => row.id).sort()).toEqual(["b1", "b2"]);
  });

  it("leaves a plan whose revision is not ahead of the cloud's", async () => {
    const plan = makePlan([makeBlock("b1", 0)], { revision: 3 });
    const cloud = fakeSupabaseData(cloudPlan(makePlan([makeBlock("b1", 0)], { revision: 8 })));
    const local = fakeLocal({ plans: [planRowForStore(plan)] });

    const report = await pushPlans({
      local: local.store,
      cloud: cloud.client,
      workspaceId: WORKSPACE,
      clock: clockAt(),
    });

    expect(report.sent, "nothing to say: the cloud's copy is newer").toBe(0);
    expect(cloud.rows("plans")[0]!.revision).toBe(8);
  });

  it("sends a deleted plan as a tombstone, and marks its blocks with it", async () => {
    // A plan the reader deleted is gone, so its blocks cannot stay live in the cloud: they
    // are the same fact one level down.
    const gone = makePlan([makeBlock("b1", 0), makeBlock("b2", 1)], { revision: 4 });
    const cloud = fakeSupabaseData(cloudPlan(makePlan([makeBlock("b1", 0), makeBlock("b2", 1)])));
    const local = fakeLocal({ plans: [{ ...planRowForStore(gone), deletedAt: AT }] });

    await pushPlans({
      local: local.store,
      cloud: cloud.client,
      workspaceId: WORKSPACE,
      clock: clockAt(),
    });

    expect(cloud.rows("plans")[0]!.deleted_at).toBe(new Date(AT).toISOString());
    expect(cloud.rows("plans")[0]!.revision).toBe(4);
    for (const block of cloud.rows("plan_blocks")) {
      expect(block.deleted_at, `${String(block.id)} was left live`).toBe(new Date(AT).toISOString());
    }
  });

  it("marks a block the plan no longer holds", async () => {
    // Blocks ride on their plan, so the plan's own revision is what says which set is
    // current — and the block that left has to leave the cloud too.
    const local = fakeLocal({
      plans: [planRowForStore(makePlan([makeBlock("b1", 0)], { revision: 2 }))],
    });
    const cloud = fakeSupabaseData(
      cloudPlan(makePlan([makeBlock("b1", 0), makeBlock("b2", 1)], { revision: 1 })),
    );

    await pushPlans({
      local: local.store,
      cloud: cloud.client,
      workspaceId: WORKSPACE,
      clock: clockAt(),
    });

    const byId = new Map(cloud.rows("plan_blocks").map((row) => [String(row.id), row]));
    expect(byId.get("b1")!.deleted_at, "the block the plan holds stays live").toBeNull();
    expect(byId.get("b2")!.deleted_at, "the one it let go is marked").toBe(
      new Date(AT).toISOString(),
    );
  });

  it("takes a cloud plan whose revision is ahead, with its blocks", async () => {
    const cloud = fakeSupabaseData(
      cloudPlan(makePlan([makeBlock("b1", 0), makeBlock("b2", 1)], { revision: 5, name: "Cloud" })),
    );
    const local = fakeLocal({
      plans: [planRowForStore(makePlan([makeBlock("b1", 0)], { revision: 2 }))],
    });

    const report = await pullPlans({
      local: local.store,
      cloud: cloud.client,
      workspaceId: WORKSPACE,
    });

    expect(report.written).toBe(1);
    const row = local.stores.plans[0]!;
    expect(row.revision).toBe(5);
    expect(row.name).toBe("Cloud");
    expect(blocksOf(row), "the whole set, not the one it had").toEqual(["b1", "b2"]);
  });

  it("marks the device's own copy when the cloud says the plan is gone", async () => {
    // A mark is written *as* the mark: `savePlan` would clear it, because a save is the
    // product writing a plan the reader has open, and a pull is not a save.
    const cloud = fakeSupabaseData({
      plans: [{ ...planRow(makePlan([], { revision: 6 })), deleted_at: new Date(AT).toISOString() }],
    });
    const local = fakeLocal({
      plans: [planRowForStore(makePlan([makeBlock("b1", 0)], { revision: 2 }))],
    });

    await pullPlans({ local: local.store, cloud: cloud.client, workspaceId: WORKSPACE });

    const row = local.stores.plans[0]!;
    expect(row.deletedAt).toBe(AT);
    expect(row.revision).toBe(6);
    expect(row.blocksJson, "the row it had is left as it was").toContain("b1");
  });

  it("invents nothing for a tombstone of a plan this device never held", async () => {
    const cloud = fakeSupabaseData({
      plans: [{ ...planRow(makePlan([], { id: "plan9", revision: 1 })), deleted_at: new Date(AT).toISOString() }],
    });
    const local = fakeLocal();

    const report = await pullPlans({
      local: local.store,
      cloud: cloud.client,
      workspaceId: WORKSPACE,
    });

    expect(report.written).toBe(0);
    expect(local.stores.plans).toHaveLength(0);
  });

  it("does not hand a device back the change it just made", async () => {
    // The whole point of pushing first: the revision this device wrote is in the cloud
    // before the pull compares anything, so the pull cannot see its own older copy.
    const mine = makePlan([makeBlock("b1", 0)], { revision: 7, name: "This device" });
    const local = fakeLocal({ plans: [planRowForStore(mine)] });
    const cloud = fakeSupabaseData(cloudPlan({ ...mine, name: "Cloud", revision: 4 }));
    const state = fakeState();

    const report = await syncOnce({
      local: local.store,
      cloud: cloud.client,
      state: state.port,
      workspaceId: WORKSPACE,
      clock: clockAt(),
    });

    expect(report.sent, "the plan and its one block").toBe(2);
    expect(local.stores.plans[0]!.name, "the device keeps what it wrote").toBe("This device");
    expect(cloud.rows("plans")[0]!.name).toBe("This device");
  });

  it("walks the catalogue and the plans in one run", async () => {
    const local = fakeLocal({ plans: [planRowForStore(makePlan([], { revision: 1 }))] });
    const cloud = fakeSupabaseData({
      symbols: [
        { id: "s9", workspace_id: WORKSPACE, name: "From the cloud", revision: 4, updated_at: new Date(AT).toISOString() },
      ],
    });

    const report = await syncOnce({
      local: local.store,
      cloud: cloud.client,
      state: fakeState().port,
      workspaceId: WORKSPACE,
      clock: clockAt(),
    });

    expect(local.stores.plans, "the plan went up").toHaveLength(1);
    expect(local.stores.symbols, "and the symbol came down").toHaveLength(1);
    expect(report.sent).toBeGreaterThan(0);
    expect(report.written).toBeGreaterThan(0);
  });
});
