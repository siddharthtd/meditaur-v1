import { describe, expect, it } from "vitest";
import { ALL_PICK_ID, applyBlockPick, NONE_PICK_ID } from "@meditaur/application";
import { makeBinding, makeBlock, makeFocus } from "../../fixtures/library.ts";

const bindings = [
  makeBinding("fp1", "s1", 0),
  makeBinding("fp1", "s2", 1),
  makeBinding("fp2", "s3", 0),
];

const focuses = [
  makeFocus("fp1", "Root"),
  makeFocus("fp2", "Heart", { defaultBinauralPresetId: "preset2", defaultDurationMs: 610_000 }),
];

describe("applyBlockPick", () => {
  it("applies a focus point's default preset and duration when the focus is picked", () => {
    const block = makeBlock("b1", 0, "focus", { binauralPresetId: "preset1", durationMs: 1000 });
    const next = applyBlockPick(block, "focus", "fp2", bindings, focuses);
    expect(next.focusPointId).toBe("fp2");
    expect(next.binauralPresetId).toBe("preset2");
    expect(next.durationMs).toBe(610_000);
  });

  it("clears the symbol when the focus point no longer binds it", () => {
    const block = makeBlock("b1", 0, "focus", { symbolId: "s1" });
    const next = applyBlockPick(block, "focus", "fp2", bindings);
    expect(next.focusPointId).toBe("fp2");
    expect(next.symbolId).toBeNull();
  });

  it("keeps the symbol when it is still bound to the focus point", () => {
    const block = makeBlock("b1", 0, "focus", { symbolId: "s2" });
    const next = applyBlockPick(block, "focus", "fp1", bindings);
    expect(next.symbolId).toBe("s2");
  });

  it("treats the none sentinel as rotate-next / unset", () => {
    const block = makeBlock("b1", 0, "focus", {
      symbolId: "s1",
      binauralPresetId: "preset1",
      tableViewId: "view1",
    });
    const rotated = applyBlockPick(block, "symbol", NONE_PICK_ID, bindings);
    expect(rotated.symbolId).toBeNull();
    expect(rotated.symbolScope).toBe("rotate");
    expect(applyBlockPick(block, "preset", NONE_PICK_ID, bindings).binauralPresetId).toBeNull();
    expect(applyBlockPick(block, "table", NONE_PICK_ID, bindings).tableViewId).toBeNull();
    expect(applyBlockPick(block, "ambient", NONE_PICK_ID, bindings).ambientAssetId).toBeNull();
    expect(applyBlockPick(block, "alarm", "bell", bindings).alarmAssetId).toBe("bell");
  });

  it("treats the all sentinel as the whole focus sheet", () => {
    const block = makeBlock("b1", 0, "focus", { symbolId: "s1", symbolScope: "rotate" });
    const next = applyBlockPick(block, "symbol", ALL_PICK_ID, bindings);
    expect(next.symbolId).toBeNull();
    expect(next.symbolScope).toBe("all");
  });

  it("picks one glyph and leaves rotate scope", () => {
    const block = makeBlock("b1", 0, "focus", { symbolId: null, symbolScope: "all" });
    const next = applyBlockPick(block, "symbol", "s1", bindings);
    expect(next.symbolId).toBe("s1");
    expect(next.symbolScope).toBe("rotate");
  });
});
