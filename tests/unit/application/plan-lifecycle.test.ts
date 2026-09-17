import { describe, expect, it } from "vitest";
import { clonePlan, copyPlanName, makeStarterPlan, nextPlanName } from "@meditaur/application";

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
      focusBlockId: "b1",
      cooloffBlockId: "b2",
      focusPointId: "fp1",
      binauralPresetId: "preset1",
      tableViewId: "view1",
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
    expect(copy.blocks.map((b) => b.id)).toEqual(["c1", "c2"]);
    expect(copy.blocks[0]).toMatchObject({
      type: "focus",
      focusPointId: "fp1",
      binauralPresetId: "preset1",
    });
    expect(source.blocks.map((b) => b.id)).toEqual(["b1", "b2"]);
    expect(source.revision).toBe(4);
  });
});

describe("makeStarterPlan", () => {
  it("builds one focus block and one cool-off", () => {
    const plan = makeStarterPlan({
      id: "p1",
      workspaceId: "ws1",
      name: "New session",
      autoAdvance: true,
      focusBlockId: "b1",
      cooloffBlockId: "b2",
      focusPointId: "fp1",
      binauralPresetId: "preset1",
      tableViewId: "view1",
    });
    expect(plan.blocks).toHaveLength(2);
    expect(plan.blocks[0]).toMatchObject({
      type: "focus",
      focusPointId: "fp1",
      symbolId: null,
    });
    expect(plan.blocks[1]).toMatchObject({
      type: "cooloff",
      focusPointId: null,
      binauralPresetId: null,
    });
    expect(plan.revision).toBe(0);
  });
});
