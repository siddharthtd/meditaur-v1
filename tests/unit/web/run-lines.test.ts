import { describe, expect, it } from "vitest";
import type { CompiledBlock } from "@meditaur/domain";
import {
  blockLines,
  runGroups,
} from "../../../apps/web/src/features/runner/SessionRegions.tsx";

/**
 * What the session's table reads, and what its left column prints.
 *
 * Two of the owner's round 26 asks meet here: the **Declaration** stage reads a pool of its own
 * rather than the meditation's sentences, and a block of several **points** names the point a line
 * belongs to rather than the symbol it hangs off — which is the one thing that tells a reader where
 * on the body they are.
 */
function compiled(extra: Partial<CompiledBlock>): CompiledBlock {
  return {
    blockId: "b1",
    durationMs: 0,
    stages: [],
    affirmations: [],
    declarations: [],
    pointLines: [],
    meditationName: "Root",
    meditationNames: ["Root"],
    representationAssetId: null,
    colour: null,
    meditationTypeName: "Chakras",
    symbolName: null,
    intentions: [],
    focusIntentions: [],
    alarmEnabled: true,
    meditationFacts: [],
    symbolGroups: [],
    binaural: null,
    ambientAssetId: null,
    alarmAssetId: null,
    alarmDurationMs: 0,
    ...extra,
  };
}

describe("the session's lines", () => {
  it("reads the declaration pool for a declaration stage, and the meditation's otherwise", () => {
    const block = compiled({ affirmations: ["I am whole"], declarations: ["I declare Root"] });
    expect(
      blockLines(block, { kind: "affirmations", pool: "declaration" }).map((line) => line.text),
    ).toEqual(["I declare Root"]);
    // The same kind with no pool named is the meditation's own sentences, which is what every
    // stage written before round 26 means.
    expect(blockLines(block, { kind: "affirmations" }).map((line) => line.text)).toEqual([
      "I am whole",
    ]);
  });

  it("names the point a line belongs to when the block runs several", () => {
    const block = compiled({
      meditationNames: ["Root", "Heart"],
      pointLines: [
        { name: "Root", lines: ["Root speaks"] },
        { name: "Heart", lines: ["Heart speaks"] },
      ],
      // The symbol view is still on the block, and it is deliberately not what the table reads:
      // a points block's left column is the point.
      focusIntentions: ["not this one"],
      symbolGroups: [
        {
          name: "Lam",
          description: "",
          usage: "",
          imageAssetId: null,
          facts: [],
          entryFacts: [],
          intentions: ["nor this"],
        },
      ],
    });
    const lines = blockLines(block, { kind: "intentions" });
    expect(lines).toEqual([
      { text: "Root speaks", groupIndex: 0, label: "Root" },
      { text: "Heart speaks", groupIndex: 1, label: "Heart" },
    ]);
    // One `<tbody>` per point, which is what makes the left column a cell per point rather than a
    // row per line.
    expect(runGroups(lines).map((group) => group.label)).toEqual(["Root", "Heart"]);
    expect(runGroups(lines).map((group) => group.rows.length)).toEqual([1, 1]);
  });

  it("names the symbol when the block runs one meditation", () => {
    const block = compiled({
      focusIntentions: ["Root alone"],
      symbolGroups: [
        {
          name: "Lam",
          description: "",
          usage: "",
          imageAssetId: null,
          facts: [],
          entryFacts: [],
          intentions: ["Under Lam", "Still under Lam"],
        },
      ],
    });
    const lines = blockLines(block, { kind: "intentions" });
    expect(lines).toEqual([
      { text: "Root alone", groupIndex: null, label: null },
      { text: "Under Lam", groupIndex: 0, label: "Lam" },
      { text: "Still under Lam", groupIndex: 0, label: "Lam" },
    ]);
    // The meditation's own lines are a group of their own with nothing in the left column.
    expect(runGroups(lines).map((group) => [group.label, group.rows.length])).toEqual([
      [null, 1],
      ["Lam", 2],
    ]);
  });

  it("falls back to a flat list for a snapshot compiled before symbol grouping", () => {
    const block = compiled({ intentions: ["one", "two"] });
    expect(blockLines(block, { kind: "intentions" })).toEqual([
      { text: "one", groupIndex: null, label: null },
      { text: "two", groupIndex: null, label: null },
    ]);
  });
});
