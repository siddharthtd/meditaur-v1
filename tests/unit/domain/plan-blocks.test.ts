import { describe, expect, it } from "vitest";
import {
  AppError,
  durationFromParts,
  durationParts,
  parsePlanBlocks,
  PLAN_BLOCK_ERRORS,
} from "@meditaur/domain";
import { makeBlock } from "../../fixtures/library.ts";

describe("parsePlanBlocks", () => {
  it("accepts a well-formed block list", () => {
    const block = makeBlock("b1", 0, "focus");
    expect(parsePlanBlocks([block])).toEqual([block]);
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

  it("rejects malformed JSON shapes", () => {
    expect(() => parsePlanBlocks(null)).toThrow(PLAN_BLOCK_ERRORS.invalid);
    expect(() => parsePlanBlocks({})).toThrow(PLAN_BLOCK_ERRORS.invalid);
    expect(() => parsePlanBlocks([{ ...makeBlock("b1", 0, "focus"), id: "" }])).toThrow(
      PLAN_BLOCK_ERRORS.invalid,
    );
    expect(() =>
      parsePlanBlocks([{ ...makeBlock("b1", 0, "focus"), type: "nap" } as unknown]),
    ).toThrow(PLAN_BLOCK_ERRORS.invalid);
    expect(() =>
      parsePlanBlocks([{ ...makeBlock("b1", 0, "focus"), durationMs: "1000" } as unknown]),
    ).toThrow(PLAN_BLOCK_ERRORS.invalid);
  });

  it("defaults missing symbolScope to rotate", () => {
    const block = makeBlock("b1", 0, "focus");
    const { symbolScope: _scope, ...rest } = block;
    expect(parsePlanBlocks([rest])).toEqual([{ ...rest, symbolScope: "rotate" }]);
  });
});

describe("durationParts", () => {
  it("round-trips 10:10 without dropping seconds", () => {
    expect(durationParts(610_000)).toEqual({ minutes: 10, seconds: 10 });
    expect(durationFromParts(10, 10)).toBe(610_000);
  });
});
