import {
  fail,
  type Entry,
  type Meditation,
  type MeditationType,
  type PlanBlock,
} from "@meditaur/domain";
import { blockStages } from "@meditaur/domain";

export const NONE_PICK_ID = "__none__";
export const ALL_PICK_ID = "__all__";

/**
 * What a block can be asked to point at.
 *
 * The `table` kind is gone with the block's `Table` field: what a session shows
 * is the plan's Display now, and a table view was the thing this picker used to
 * set (§9, §11).
 */
export type BlockPickKind =
  /** Which **meditation** the card runs — the one kind that re-materialises the
   *  block's stages, because the stages belong to the meditation (§12.14). */
  | "meditation"
  | "symbol"
  | "preset"
  | "ambient"
  | "alarm";

export function applyBlockPick(
  block: PlanBlock,
  kind: BlockPickKind,
  pickedId: string,
  entries: Pick<Entry, "meditationId" | "symbolId">[],
  meditations: Pick<
    Meditation,
    "id" | "defaultBinauralPresetId" | "defaultDurationMs" | "stages" | "typeId"
  >[] = [],
  types: Pick<MeditationType, "id" | "stages">[] = [],
): PlanBlock {
  const id = pickedId === NONE_PICK_ID || pickedId === ALL_PICK_ID ? null : pickedId;
  if (kind === "meditation") {
    if (!id) {
      return { ...block, meditationId: null, symbolId: null };
    }
    // The association is an entry that names both sides, so that is what says
    // whether the symbol the block was pointing at still applies.
    const symbolOk =
      block.symbolId != null &&
      entries.some((row) => row.symbolId === block.symbolId && row.meditationId === id);
    const focus = meditations.find((fp) => fp.id === id);
    // **The stage rows follow the meditation** (§12.14): a card whose meditation is
    // swapped re-materialises its timers from the new type's template — or from the
    // new meditation's own copy of it — because the stages are a property of the
    // meditation, not of the card.
    const stages = focus
      ? blockStages(
          { stages: [] },
          focus,
          types.find((type) => type.id === focus.typeId) ?? null,
        )
      : block.stages;
    return {
      ...block,
      meditationId: id,
      symbolId: symbolOk ? block.symbolId : null,
      binauralPresetId: focus?.defaultBinauralPresetId ?? null,
      stages,
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
  // Unreachable for a typed caller and a failure rather than a silent no-op for
  // any other: a pick that changes nothing is worse than one that says so.
  return fail("catalog.pickUnknown", "That choice is not one a block can make");
}
