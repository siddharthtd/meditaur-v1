import { describe, expect, it } from "vitest";
import { clonePlan, copyPlanName, makeStarterPlan, nextPlanName } from "@meditaur/application";
import { stageFixture } from "../../fixtures/library.ts";

describe("nextPlanName", () => {
  it("uses New session, then numbers through collisions", () => {
    expect(nextPlanName([])).toBe("New session");
    expect(nextPlanName(["Starter session"])).toBe("New session");
    expect(nextPlanName(["New session"])).toBe("New session 2");
    expect(nextPlanName(["New session", "New session 2"])).toBe("New session 3");
  });
});

describe("copyPlanName", () => {
  it("appends copy, then numbers through collisions", () => {
    expect(copyPlanName("Starter session", [])).toBe("Starter session copy");
    expect(copyPlanName("Starter session", ["Starter session"])).toBe("Starter session copy");
    expect(copyPlanName("Starter session", ["Starter session copy"])).toBe("Starter session copy 2");
    expect(copyPlanName("Starter session", ["Starter session copy", "Starter session copy 2"])).toBe(
      "Starter session copy 3",
    );
  });
});

describe("clonePlan", () => {
  it("copies catalog picks onto new plan and block ids", () => {
    const source = makeStarterPlan({
      id: "p1",
      workspaceId: "ws1",
      name: "Starter session",
      autoAdvance: true,
      alarmEnabled: true,
      meditationBlockId: "b1",
      meditationId: "fp1",
      binauralPresetId: "preset1",
    });
    source.revision = 4;
    let n = 0;
    const copy = clonePlan(source, {
      id: "p2",
      name: "Starter session copy",
      nextBlockId: () => `c${++n}`,
    });
    expect(copy.id).toBe("p2");
    expect(copy.name).toBe("Starter session copy");
    expect(copy.revision).toBe(0);
    expect(copy.blocks.map((b) => b.id)).toEqual(["c1"]);
    expect(copy.blocks[0]).toMatchObject({
      meditationId: "fp1",
      binauralPresetId: "preset1",
    });
    expect(source.blocks.map((b) => b.id)).toEqual(["b1"]);
    expect(source.revision).toBe(4);
  });
});

describe("makeStarterPlan", () => {
  it("builds one meditation block, with the meditation's own stages", () => {
    const plan = makeStarterPlan({
      id: "p1",
      workspaceId: "ws1",
      name: "New session",
      autoAdvance: true,
      alarmEnabled: true,
      meditationBlockId: "b1",
      meditationId: "fp1",
      binauralPresetId: "preset1",
      stages: [stageFixture(120_000, { key: "intentions", kind: "intentions" })],
    });
    // One block, and it is a meditation: the owner's round 15 deleted cool-off, so
    // the one-tap session no longer closes with a silent timer.
    expect(plan.blocks).toHaveLength(1);
    expect(plan.blocks[0]).toMatchObject({
      meditationId: "fp1",
      symbolId: null,
    });
    expect(plan.blocks[0]?.stages.map((stage) => stage.key)).toEqual(["intentions"]);
    expect(plan.revision).toBe(0);
  });
});
