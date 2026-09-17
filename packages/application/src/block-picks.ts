import type { FocusPoint, FocusSymbolBinding, PlanBlock } from "@meditaur/domain";

export const NONE_PICK_ID = "__none__";
export const ALL_PICK_ID = "__all__";

export type BlockPickKind = "focus" | "symbol" | "preset" | "table" | "ambient" | "alarm";

export function applyBlockPick(
  block: PlanBlock,
  kind: BlockPickKind,
  pickedId: string,
  bindings: Pick<FocusSymbolBinding, "focusPointId" | "symbolId">[],
  focusPoints: Pick<FocusPoint, "id" | "defaultBinauralPresetId" | "defaultDurationMs">[] = [],
): PlanBlock {
  const id = pickedId === NONE_PICK_ID || pickedId === ALL_PICK_ID ? null : pickedId;
  if (kind === "focus") {
    if (!id) {
      return { ...block, focusPointId: null, symbolId: null };
    }
    const symbolOk =
      block.symbolId != null &&
      bindings.some((row) => row.symbolId === block.symbolId && row.focusPointId === id);
    const focus = focusPoints.find((fp) => fp.id === id);
    return {
      ...block,
      focusPointId: id,
      symbolId: symbolOk ? block.symbolId : null,
      binauralPresetId: focus?.defaultBinauralPresetId ?? null,
      durationMs: focus?.defaultDurationMs ?? block.durationMs,
    };
  }
  if (kind === "symbol") {
    if (pickedId === ALL_PICK_ID) {
      return { ...block, symbolId: null, symbolScope: "all" };
    }
    if (pickedId === NONE_PICK_ID) {
      return { ...block, symbolId: null, symbolScope: "rotate" };
    }
    return { ...block, symbolId: id, symbolScope: "rotate" };
  }
  if (kind === "preset") {
    return { ...block, binauralPresetId: id };
  }
  if (kind === "ambient") {
    return { ...block, ambientAssetId: id };
  }
  if (kind === "alarm") {
    return { ...block, alarmAssetId: id };
  }
  return { ...block, tableViewId: id };
}
