import { describe, expect, it } from "vitest";
import { makePreset } from "../../fixtures/library.ts";
import {
  presetFromRow,
  presetRow,
} from "../../../packages/db/src/preset-row.ts";

describe("the binaural_presets row", () => {
  it("speaks the stored column names rather than the domain's", () => {
    const row = presetRow(makePreset());
    expect(Object.keys(row)).toContain("left_tones");
    expect(Object.keys(row)).toContain("fade_in_ms");
    expect(Object.keys(row)).toContain("eq_left");
    expect(Object.keys(row)).not.toContain("leftTones");
    expect(Object.keys(row)).not.toContain("fadeInMs");
  });

  it("round-trips a preset, both ears and all", () => {
    const preset = makePreset({
      name: "Delta",
      fadeInMs: 2_000,
      fadeOutMs: 3_000,
      archivedAt: 1_700_000_000_000,
      deletedAt: 1_700_000_100_000,
    });
    expect(presetFromRow(presetRow(preset))).toEqual(preset);
  });

  it("reads a preset older than its columns as silent and flat, not broken", () => {
    // Neither default is this mapper's invention: `[]` is the state "no tones",
    // and the flat curve is the domain's own `defaultEarEq`. A preset written
    // before the columns existed must stay editable rather than reading as one
    // that cannot be tuned.
    const row = presetRow(makePreset());
    delete row.left_tones;
    delete row.right_tones;
    delete row.eq_left;
    delete row.eq_right;

    const read = presetFromRow(row);
    expect(read.leftTones).toEqual([]);
    expect(read.rightTones).toEqual([]);
    expect(read.eqLeft.bands.map((band) => band.gainDb)).toEqual(new Array(10).fill(0));
    expect(read.eqRight.bands).toHaveLength(10);
  });
});
