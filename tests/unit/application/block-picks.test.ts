import { describe, expect, it } from "vitest";
import { ALL_PICK_ID, applyBlockPick, NONE_PICK_ID } from "@meditaur/application";
import {
  makeBlock,
  makeEntry,
  makeMeditation,
  makeMeditationType,
  stageFixture,
} from "../../fixtures/library.ts";

const entries = [
  makeEntry("fp1", "s1", 0),
  makeEntry("fp1", "s2", 1),
  makeEntry("fp2", "s3", 0),
];

// `fp2` carries its own copy of its type's template, which is what a card
// materialises when the meditation is swapped.
const focuses = [
  makeMeditation("fp1", "Root"),
  makeMeditation("fp2", "Heart", {
    defaultBinauralPresetId: "preset2",
    defaultDurationMs: 610_000,
    stages: [stageFixture(610_000, { key: "heart", label: "Heart" })],
  }),
];

const types = [makeMeditationType()];

describe("applyBlockPick", () => {
  it("applies a meditation's default preset and its own stages when the meditation is picked", () => {
    const block = makeBlock("b1", 0, { binauralPresetId: "preset1", durationMs: 1000 });
    const next = applyBlockPick(block, "meditation", "fp2", entries, focuses, types);
    expect(next.meditationId).toBe("fp2");
    expect(next.binauralPresetId).toBe("preset2");
    // The stage rows follow the meditation (§12.14): `fp2` carries its own copy of
    // its type's template, and that is what the card shows.
    expect(next.stages).toEqual(focuses[1]?.stages);
  });

  it("clears the symbol when the chakra has no row with it", () => {
    const block = makeBlock("b1", 0, { symbolId: "s1" });
    const next = applyBlockPick(block, "meditation", "fp2", entries);
    expect(next.meditationId).toBe("fp2");
    expect(next.symbolId).toBeNull();
  });

  it("keeps the symbol when a row still associates it with the chakra", () => {
    const block = makeBlock("b1", 0, { symbolId: "s2" });
    const next = applyBlockPick(block, "meditation", "fp1", entries);
    expect(next.symbolId).toBe("s2");
  });

  it("treats the none sentinel as rotate-next / unset", () => {
    const block = makeBlock("b1", 0, {
      symbolId: "s1",
      binauralPresetId: "preset1",
    });
    const rotated = applyBlockPick(block, "symbol", NONE_PICK_ID, entries);
    expect(rotated.symbolId).toBeNull();
    expect(rotated.symbolScope).toBe("rotate");
    expect(applyBlockPick(block, "preset", NONE_PICK_ID, entries).binauralPresetId).toBeNull();
    expect(applyBlockPick(block, "ambient", NONE_PICK_ID, entries).ambientAssetId).toBeNull();
    expect(applyBlockPick(block, "alarm", "bell", entries).alarmAssetId).toBe("bell");
  });

  it("treats the all sentinel as the whole focus sheet", () => {
    const block = makeBlock("b1", 0, { symbolId: "s1", symbolScope: "rotate" });
    const next = applyBlockPick(block, "symbol", ALL_PICK_ID, entries);
    expect(next.symbolId).toBeNull();
    expect(next.symbolScope).toBe("all");
  });

  it("picks one glyph and leaves rotate scope", () => {
    const block = makeBlock("b1", 0, { symbolId: null, symbolScope: "all" });
    const next = applyBlockPick(block, "symbol", "s1", entries);
    expect(next.symbolId).toBe("s1");
    expect(next.symbolScope).toBe("rotate");
  });
});
