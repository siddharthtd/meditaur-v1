import { describe, expect, it } from "vitest";
import { FakeClock } from "@meditaur/domain";
import { fakeSupabaseData } from "../../fixtures/supabase-data.ts";
import { createCloudPlanPort } from "../../../packages/db/src/plan-cloud.ts";
import { planBlockRows, planRow } from "../../../packages/db/src/plan-rows.ts";
import { makeBlock, makePlan } from "../../fixtures/library.ts";

const AT = 1_700_000_000_000;

function harness(initial: Record<string, Record<string, unknown>[]> = {}) {
  const fake = fakeSupabaseData(initial);
  const clock = new FakeClock();
  clock.advance(AT);
  return { ...fake, port: createCloudPlanPort({ client: fake.client, clock }) };
}

/** The two tables a saved plan occupies, seeded the way `save` would write them. */
function seed(plan: ReturnType<typeof makePlan>) {
  return { plans: [planRow(plan)], plan_blocks: planBlockRows(plan) };
}

describe("the cloud plan adapter", () => {
  it("round-trips a plan and its blocks through the store", async () => {
    const plan = makePlan([
      makeBlock("b1", 0),
      makeBlock("b2", 1, { alarmEnabled: false, symbolScope: "all" }),
    ]);
    const { port } = harness(seed(plan));

    expect(await port.getById(plan.id)).toEqual(plan);
    expect((await port.getMany([plan.id]))[0]).toEqual(plan);
  });

  it("marks the block that left the plan, because blocks travel on the plan", async () => {
    // The reconciliation a block needs and a catalogue row does not: a block has no
    // revision or `updated_at` of its own, so removing one is not a row that moved —
    // it is a row that has to be marked, or the next pull hands it back.
    const before = makePlan([makeBlock("b1", 0), makeBlock("b2", 1)]);
    const { port, rows } = harness(seed(before));

    await port.save(makePlan([makeBlock("b1", 0)]));

    const block = rows("plan_blocks").find((row) => row.id === "b2")!;
    expect(block.deleted_at).toBe(new Date(AT).toISOString());
    // `plan_blocks` has neither a revision nor a timestamp of its own, and the mark
    // must not invent one: the pull reaches it through its plan.
    expect(block.revision).toBeUndefined();
    expect(block.updated_at).toBeUndefined();

    expect((await port.getById("plan1"))!.blocks.map((row) => row.id)).toEqual(["b1"]);
  });

  it("writes a block the plan holds again as live", async () => {
    // An upsert that omitted the column would keep the mark, so a plan the reader
    // deleted a block from and then put back would lose it on the next pull.
    const plan = makePlan([makeBlock("b1", 0)]);
    const marked = planBlockRows(plan).map((row) => ({ ...row, deleted_at: "2026-01-01T00:00:00.000Z" }));
    const { port, rows } = harness({ plans: [planRow(plan)], plan_blocks: marked });

    await port.save(plan);

    expect(rows("plan_blocks")[0]!.deleted_at).toBeNull();
    expect((await port.getById("plan1"))!.blocks.map((row) => row.id)).toEqual(["b1"]);
  });

  it("marks the plan and its blocks together, and stops reporting either", async () => {
    const plan = makePlan([makeBlock("b1", 0), makeBlock("b2", 1)]);
    const { port, rows } = harness(seed(plan));

    await port.delete(plan.id);

    expect(rows("plans")[0]!.deleted_at).toBe(new Date(AT).toISOString());
    // The blocks first, so a failure between the two leaves a marked plan with live
    // blocks rather than blocks whose plan is already gone.
    expect(rows("plan_blocks").map((row) => row.deleted_at)).toEqual([
      new Date(AT).toISOString(),
      new Date(AT).toISOString(),
    ]);
    expect(await port.getById(plan.id)).toBeNull();
    expect(await port.listSummaries("ws1")).toEqual([]);
  });

  it("leaves a marked plan out of every read", async () => {
    // The domain has nowhere to carry the mark and should not have: the app never shows
    // a deleted plan, so a mark is a fact about the store rather than a state of the
    // model.
    const plan = makePlan([makeBlock("b1", 0)]);
    const { port } = harness({
      plans: [{ ...planRow(plan), deleted_at: "2026-01-01T00:00:00.000Z" }],
      plan_blocks: planBlockRows(plan),
    });

    expect(await port.getById(plan.id)).toBeNull();
    expect(await port.findFirstInWorkspace("ws1")).toBeNull();
    expect(await port.listSummaries("ws1")).toEqual([]);
  });

  it("writes nothing when the plan it is asked to delete is not there", async () => {
    const { port, rows, calls } = harness();
    await port.delete("never-existed");
    expect(rows("plans")).toEqual([]);
    expect(calls).toEqual(["select plans * where id=never-existed"]);
  });
});
