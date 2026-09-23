import { describe, expect, it } from "vitest";
import {
  AppError,
  durationFromParts,
  durationParts,
  parsePlanBlocks,
  PLAN_BLOCK_ERRORS,
} from "@meditaur/domain";
import { makeBlock, stageFixture } from "../../fixtures/library.ts";

describe("parsePlanBlocks", () => {
  it("accepts a well-formed block list", () => {
    const block = makeBlock("b1", 0);
    expect(parsePlanBlocks([block])).toEqual([block]);
  });

  it("reads the meditation a block named before the rename", () => {
    // A plan is stored as JSON inside its own row, so the word `meditationId`
    // replaced cannot be rewritten by a Dexie upgrade. `focusPointId` is read for
    // exactly that reason: a plan the reader built keeps opening.
    const { meditationId: _meditationId, ...rest } = makeBlock("b1", 0);
    expect(parsePlanBlocks([{ ...rest, focusPointId: "fp-old" }])[0]?.meditationId).toBe(
      "fp-old",
    );
    // And a block that named no meditation still reads as one that names none —
    // the *presence* of the key decides, not its value, so a stored `null` under
    // the old name is `null` rather than a failure.
    const { meditationId: _none, ...noMeditation } = makeBlock("b1", 0);
    expect(parsePlanBlocks([{ ...noMeditation, focusPointId: null }])[0]?.meditationId).toBeNull();
  });

  it("throws AppError with a stable code", () => {
    expect(() => parsePlanBlocks(null)).toThrow(AppError);
    try {
      parsePlanBlocks(null);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("plan.blocksInvalid");
      expect((err as AppError).message).toBe(PLAN_BLOCK_ERRORS.invalid);
    }
  });

  it("drops a stored cool-off block, and keeps the rest", () => {
    // The owner's round 15 deleted the kind: `parsePlanBlocks` is where a plan the
    // reader already holds loses those blocks, so a plan that still has one reads as
    // the plan it always was minus the filler.
    const kept = parsePlanBlocks([
      { ...makeBlock("b1", 0), type: "cooloff" },
      { ...makeBlock("b2", 1), type: "focus" },
    ]);
    expect(kept.map((block) => block.id)).toEqual(["b2"]);
    // And a plan that was nothing but cool-off reads as a plan with no blocks, which
    // compile refuses out loud rather than running a session of silence.
    expect(parsePlanBlocks([{ ...makeBlock("b1", 0), type: "cooloff" }])).toEqual([]);
  });

  it("rejects malformed JSON shapes", () => {
    expect(() => parsePlanBlocks(null)).toThrow(PLAN_BLOCK_ERRORS.invalid);
    expect(() => parsePlanBlocks({})).toThrow(PLAN_BLOCK_ERRORS.invalid);
    expect(() => parsePlanBlocks([{ ...makeBlock("b1", 0), id: "" }])).toThrow(
      PLAN_BLOCK_ERRORS.invalid,
    );
    // A stage's own numbers are refused — the block's length is no longer one field,
    // so a malformed length is now a malformed stage.
    expect(() =>
      parsePlanBlocks([
        {
          ...makeBlock("b1", 0),
          stages: [{ ...stageFixture(1000), durationMs: "1000" }],
        } as unknown,
      ]),
    ).toThrow(PLAN_BLOCK_ERRORS.invalid);
    // And a block written before stages, whose one length is not a number, is
    // refused too: it is read as a single stage of that length.
    expect(() =>
      parsePlanBlocks([
        { ...makeBlock("b1", 0), stages: undefined, durationMs: "1000" } as unknown,
      ]),
    ).toThrow(PLAN_BLOCK_ERRORS.invalid);
  });

  it("defaults missing symbolScope to rotate", () => {
    const block = makeBlock("b1", 0);
    const { symbolScope: _scope, ...rest } = block;
    expect(parsePlanBlocks([rest])).toEqual([{ ...rest, symbolScope: "rotate" }]);
  });

  it("reads a block with no alarm or display answer as taking the plan's", () => {
    // The owner's round 17 added both, and both default to **their owner's** value
    // rather than to their own absence — so a plan written before they existed must
    // not read as "every block is silent and shows nothing".
    const block = makeBlock("b1", 0);
    const { alarmEnabled: _a, display: _d, ...rest } = block;
    expect(parsePlanBlocks([rest])).toEqual([{ ...rest, alarmEnabled: null, display: null }]);
  });

  it("keeps a block's own alarm and display", () => {
    const block = makeBlock("b1", 0, {
      alarmEnabled: false,
      display: { columns: [{ key: "usage", area: "symbol", shown: true, pinned: false }] },
    });
    expect(parsePlanBlocks([block])).toEqual([block]);
  });
});

describe("durationParts", () => {
  it("round-trips 10:10 without dropping seconds", () => {
    expect(durationParts(610_000)).toEqual({ minutes: 10, seconds: 10 });
    expect(durationFromParts(10, 10)).toBe(610_000);
  });
});
