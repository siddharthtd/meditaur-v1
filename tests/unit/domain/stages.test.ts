import { describe, expect, it } from "vitest";
import {
  AFFIRMATION_STAGES,
  INTENTION_STAGES,
  PROTECTION_STAGES,
  autoScrollForKind,
  withAutoScroll,
} from "@meditaur/domain";
import { stageFixture } from "../../fixtures/library.ts";

/**
 * The stages a block runs, and the one flag the owner asked to be made consistent.
 *
 * *"Some chakra sessions have auto-scroll and some don't (some which don't have
 * enough intentions still have auto-scroll), we need this to be consistent."* Both
 * halves of that were true, and neither was a screen bug: `autoScroll` is stored per
 * stage, so a plan written by a build that defaulted it to `false` keeps that value
 * for ever while a plan made today starts from the kind's own answer.
 */
describe("stage auto-scroll", () => {
  it("belongs to the kinds that are read, and to no others", () => {
    expect(autoScrollForKind("intentions")).toBe(true);
    expect(autoScrollForKind("affirmations")).toBe(true);
    // A symbols stage shows pictures and a focus stage shows the visualisation:
    // neither scrolls, so neither carries the switch.
    expect(autoScrollForKind("symbols")).toBe(false);
    expect(autoScrollForKind("focus")).toBe(false);
  });

  it("is what every seeded template already says", () => {
    for (const stages of [INTENTION_STAGES, PROTECTION_STAGES, AFFIRMATION_STAGES]) {
      for (const row of stages) {
        expect(row.autoScroll, `${row.kind} in the seed`).toBe(autoScrollForKind(row.kind));
      }
    }
  });

  it("repairs a stage whose stored flag disagrees with its kind", () => {
    const repaired = withAutoScroll([
      stageFixture(1000, { key: "intentions", kind: "intentions", autoScroll: false }),
      stageFixture(1000, { key: "symbols", kind: "symbols", autoScroll: true }),
    ]);
    expect(repaired.map((row) => row.autoScroll)).toEqual([true, false]);
    // The kinds, the labels and the lengths are the reader's and are not touched.
    expect(repaired.map((row) => row.kind)).toEqual(["intentions", "symbols"]);
  });

  it("returns the very same rows when there is nothing to repair", () => {
    // The repair runs once against a whole table, so a row it has nothing to say
    // about must not be copied — an unchanged object is what lets the Dexie version
    // skip the write and keeps `updatedAt` honest.
    const stages = [stageFixture(1000, { key: "focus", kind: "focus", autoScroll: false })];
    expect(withAutoScroll(stages)[0]).toBe(stages[0]);
  });
});
