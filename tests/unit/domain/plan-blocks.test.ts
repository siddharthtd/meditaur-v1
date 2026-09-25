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

  it("reads the meditations a block named before the list", () => {
    // A plan is stored as JSON inside its own row, so neither of the two field names the
    // list replaced can be rewritten by a Dexie upgrade. `meditationId` is what every block
    // written before round 22 says and `focusPointId` what one written before the rename
    // says; both are read for exactly that reason, so a plan the reader built keeps opening.
    const { meditationIds: _ids, ...rest } = makeBlock("b1", 0);
    expect(parsePlanBlocks([{ ...rest, meditationId: "fp-one" }])[0]?.meditationIds).toEqual([
      "fp-one",
    ]);
    expect(parsePlanBlocks([{ ...rest, focusPointId: "fp-old" }])[0]?.meditationIds).toEqual([
      "fp-old",
    ]);
    // And a block that named no meditation still reads as one that names none — the
    // *presence* of a key decides, not its value, so a stored `null` under an old name is
    // an empty list rather than a failure.
    expect(parsePlanBlocks([{ ...rest, meditationId: null }])[0]?.meditationIds).toEqual([]);
    expect(parsePlanBlocks([{ ...rest, focusPointId: null }])[0]?.meditationIds).toEqual([]);
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

  it("reads a missing or damaged randomiser as a block that was never asked", () => {
    // The owner's round 24 (`P2 · 45`). `null` is the state a plan written before the
    // field existed is in, so it has to read as **every line** rather than as a made-up
    // count — and damage reads the same way, in the direction that cannot thin a list the
    // reader never asked to thin.
    const block = makeBlock("b1", 0);
    const { intentionRandomiser: _r, ...rest } = block;
    expect(parsePlanBlocks([rest])[0]?.intentionRandomiser).toBeNull();

    // A value that is not an object at all reads as "never asked" — the whole setting —
    // while a value that *is* an object but says nonsense reads as that object with its
    // halves off: a count that cannot be read is no lines of that half, never all of them,
    // because keeping all would quietly undo the setting the reader did make.
    const off = { on: false, count: 0 };
    const cases: { damaged: unknown; expected: unknown }[] = [
      { damaged: null, expected: null },
      { damaged: "", expected: null },
      { damaged: 7, expected: null },
      { damaged: [], expected: null },
      { damaged: { on: "yes" }, expected: { on: false, own: off, symbols: off } },
      {
        damaged: { on: true, own: { count: -4 } },
        expected: { on: true, own: off, symbols: off },
      },
      {
        // A fractional count is floored, so the store never holds a half line.
        damaged: { on: true, own: { on: true, count: 2.7 }, symbols: { on: true, count: 0 } },
        expected: { on: true, own: { on: true, count: 2 }, symbols: { on: true, count: 0 } },
      },
    ];
    for (const { damaged, expected } of cases) {
      const read = parsePlanBlocks([{ ...rest, intentionRandomiser: damaged }])[0];
      expect(read?.intentionRandomiser, JSON.stringify(damaged)).toEqual(expected);
    }
  });

  it("keeps a block's own randomiser, counts and all", () => {
    const block = makeBlock("b1", 0, {
      intentionRandomiser: { on: true, own: { on: true, count: 2 }, symbols: { on: false, count: 5 } },
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
