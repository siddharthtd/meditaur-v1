import { describe, expect, it } from "vitest";
import { makeBlock, makePlan } from "../../fixtures/library.ts";
import {
  planBlockRows,
  planFromCloud,
  planRow,
} from "../../../packages/db/src/plan-rows.ts";

describe("the plans and plan_blocks rows", () => {
  it("speaks the stored column names in both tables", () => {
    const plan = makePlan([makeBlock("b1", 0)]);
    const row = planRow(plan);
    expect(Object.keys(row)).toContain("cycle_until_stopped");
    expect(Object.keys(row)).not.toContain("cycleCount");
    // Not written: the column is its own (`not null default now()`) and a plan is
    // settled by revision, so `Plan` has no `updatedAt` to carry.
    expect(Object.keys(row)).not.toContain("updated_at");

    const blocks = planBlockRows(plan);
    expect(blocks).toHaveLength(1);
    expect(Object.keys(blocks[0]!)).toContain("plan_id");
    expect(Object.keys(blocks[0]!)).toContain("alarm_enabled");
    expect(Object.keys(blocks[0]!)).not.toContain("sortOrder");
    expect(blocks[0]!.plan_id).toBe(plan.id);
  });

  it("round-trips a plan and both of its blocks unchanged", () => {
    // One block that has answered for itself and one that has not, because those are
    // the two states the per-meditation columns exist for.
    const blocks = [
      makeBlock("b1", 0, {
        alarmEnabled: false,
        display: { columns: [{ key: "name", area: "meditation", shown: true, pinned: true }] },
      }),
      makeBlock("b2", 1, { alarmEnabled: null, display: null, symbolScope: "all" }),
      // The randomiser (the owner's round 24, `P2 · 45`): the third per-meditation answer,
      // and the column that would drop it silently in sync if only one of the two mappers
      // knew about it. `own` on with a count and `symbols` off is the pair a careless
      // reader would confuse for a default, so it is the one worth carrying.
      makeBlock("b3", 2, {
        intentionRandomiser: {
          on: true,
          own: { on: true, count: 3 },
          symbols: { on: false, count: 0 },
        },
      }),
    ];
    const plan = makePlan(blocks);

    expect(planFromCloud(planRow(plan), planBlockRows(plan))).toEqual(plan);
  });

  it("rebuilds the block order from the column, not from the rows' arrival", () => {
    // The two stores disagree about what carries the order: Dexie's array order is
    // the reader's, and `sort_order` is what travels. A pull that trusted the
    // arrival order would reshuffle a plan.
    const plan = makePlan([makeBlock("b1", 0), makeBlock("b2", 1), makeBlock("b3", 2)]);
    const scrambled = [...planBlockRows(plan)].reverse();

    expect(planFromCloud(planRow(plan), scrambled).blocks.map((b) => b.id)).toEqual([
      "b1",
      "b2",
      "b3",
    ]);
  });

  it("keeps a block that has not answered apart from one that answered off", () => {
    // `false` on a block means "do not ring", `null` means "whatever the plan says".
    // Reading an absent column as `false` is the defect this case exists for: it
    // would silence every block the reader never opened while the plan's own switch
    // went on saying otherwise.
    const plan = makePlan([makeBlock("b1", 0, { alarmEnabled: false })]);
    const rows = planBlockRows(plan);
    const answeredOff = planFromCloud(planRow(plan), rows).blocks[0]!;
    expect(answeredOff.alarmEnabled).toBe(false);

    const older = { ...rows[0]! };
    delete older.alarm_enabled;
    const neverAsked = planFromCloud(planRow(plan), [older]).blocks[0]!;
    expect(neverAsked.alarmEnabled).toBeNull();
  });

  it("reads a plan's own absent switches as on", () => {
    // The plan's switches were never optional, so absent is `true` — the opposite
    // reading from a block's, and the reason the two are tested side by side.
    const plan = makePlan([makeBlock("b1", 0)]);
    const row = planRow(plan);
    delete row.alarm_enabled;
    delete row.binaural_enabled;

    const read = planFromCloud(row, []);
    expect(read.alarmEnabled).toBe(true);
    expect(read.binauralEnabled).toBe(true);
  });

  it("turns the column's own empty display into the app's answer", () => {
    // `plans.display` is `not null default '{}'`, so a plan that has never been
    // asked arrives as an object with no `columns` at all. The domain's normalizer is
    // what decides what that means, not this module.
    const plan = makePlan([makeBlock("b1", 0)]);
    const read = planFromCloud({ ...planRow(plan), display: {} }, []);
    expect(Array.isArray(read.display.columns)).toBe(true);

    const damaged = planFromCloud({ ...planRow(plan), display: "not json" }, []);
    expect(Array.isArray(damaged.display.columns)).toBe(true);
  });

  it("reads a block row older than its columns as one that runs nothing yet", () => {
    const plan = makePlan([makeBlock("b1", 0)]);
    const rows = planBlockRows(plan);
    const older = { ...rows[0]! };
    delete older.stages;
    delete older.display;
    delete older.symbol_scope;

    const block = planFromCloud(planRow(plan), [older]).blocks[0]!;
    expect(block.stages).toEqual([]);
    expect(block.display).toBeNull();
    expect(block.symbolScope).toBe("rotate");
  });
});
