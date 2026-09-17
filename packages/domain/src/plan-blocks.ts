import { fail } from "./app-error.ts";
import type { BlockType, PlanBlock, SymbolScope } from "./models.ts";

export const PLAN_BLOCK_ERRORS = {
  invalid: "Plan blocks are not valid",
} as const;

function invalid(): never {
  fail("plan.blocksInvalid", PLAN_BLOCK_ERRORS.invalid);
}

function requireObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function requireString(value: unknown): string {
  if (typeof value !== "string" || !value) invalid();
  return value;
}

function requireNullableString(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value;
  invalid();
}

function requireNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) invalid();
  return value;
}

function requireBlockType(value: unknown): BlockType {
  if (value === "focus" || value === "cooloff") return value;
  invalid();
}

function requireSymbolScope(value: unknown): SymbolScope {
  if (value === undefined || value === null) return "rotate";
  if (value === "rotate" || value === "all") return value;
  invalid();
}

export function parsePlanBlocks(value: unknown): PlanBlock[] {
  if (!Array.isArray(value)) invalid();
  return value.map((row) => {
    const item = requireObject(row);
    return {
      id: requireString(item.id),
      sortOrder: requireNumber(item.sortOrder),
      type: requireBlockType(item.type),
      durationMs: requireNumber(item.durationMs),
      focusPointId: requireNullableString(item.focusPointId),
      symbolId: requireNullableString(item.symbolId),
      symbolScope: requireSymbolScope(item.symbolScope),
      binauralPresetId: requireNullableString(item.binauralPresetId),
      tableViewId: requireNullableString(item.tableViewId),
      ambientAssetId: requireNullableString(item.ambientAssetId),
      alarmAssetId: requireNullableString(item.alarmAssetId),
    };
  });
}
