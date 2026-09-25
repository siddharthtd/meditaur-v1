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
      return { ...block, meditationIds: [], symbolId: null };
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
      meditationIds: [id],
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

/**
 * A block with one meditation toggled **in or out** — a point block's edit.
 *
 * The owner's round 22: a point block clubs several points into one pass, so its
 * `Meditation` field is a set rather than a choice. What the block reads *as a whole* is
 * its lead's — the stages it runs and the sound it opens with — so those follow the lead:
 * removing the first point hands them to the next one, and adding the first point to an
 * empty block gives the block that point's timers. A toggle that leaves the lead where it
 * was leaves the block's own settings alone, which is the rule the editor states out loud
 * ("the stages below are this block's own and do not move when the meditation does").
 *
 * `on` says which way the press goes, so the caller does not have to difference the list
 * before asking.
 */
export function toggleBlockMeditation(
  block: PlanBlock,
  meditationId: string,
  on: boolean,
  entries: Pick<Entry, "meditationId" | "symbolId">[],
  meditations: Pick<
    Meditation,
    "id" | "defaultBinauralPresetId" | "defaultDurationMs" | "stages" | "typeId"
  >[] = [],
  types: Pick<MeditationType, "id" | "stages">[] = [],
): PlanBlock {
  const meditationIds =
    on && !block.meditationIds.includes(meditationId)
      ? [...block.meditationIds, meditationId]
      : block.meditationIds.filter((id) => id !== meditationId);
  const leadChanged = (block.meditationIds[0] ?? null) !== (meditationIds[0] ?? null);
  const lead = meditations.find((row) => row.id === meditationIds[0]);
  // A symbol no remaining point carries would be a block walking nothing, so it goes —
  // the same guard a meditation swap makes. One point of several losing it is not the
  // block losing it.
  const symbolStillBound =
    block.symbolId == null ||
    meditationIds.some((id) =>
      entries.some((row) => row.symbolId === block.symbolId && row.meditationId === id),
    );
  return {
    ...block,
    meditationIds,
    symbolId: symbolStillBound ? block.symbolId : null,
    binauralPresetId: leadChanged
      ? (lead?.defaultBinauralPresetId ?? null)
      : block.binauralPresetId,
    stages:
      leadChanged && lead
        ? blockStages({ stages: [] }, lead, types.find((type) => type.id === lead.typeId) ?? null)
        : block.stages,
  };
}
