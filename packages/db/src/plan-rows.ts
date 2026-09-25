import {
  normalizeIntentionRandomiser,
  normalizePlanDisplay,
  type Plan,
  type PlanBlock,
  type PlanBlockStage,
  type SymbolScope,
} from "@meditaur/domain";

/**
 * The `plans` and `plan_blocks` rows — the last of slice 2's ten pairs, and the only
 * one that is two tables.
 *
 * It is the pair the row called the real work, and the reason is the shape rather
 * than the size: Dexie keeps a plan's blocks as **one** `blocksJson` column, so a
 * local write is one row, while the cloud keeps them as rows and a pull has to
 * rebuild the array. So this module is one row plus N rows in one direction and the
 * opposite in the other — which is also why `planFromCloud` takes two arguments
 * where every other pair takes one.
 *
 * One field is deliberately *not* written: `plans.updated_at` is the column's own
 * (`not null default now()`), and the domain's `Plan` has no `updatedAt` at all — a
 * plan is settled by `revision`, never by a timestamp, which is why slice 1 left
 * `plans` out of the pull indexes (`20260921140000_sync_delete_marks.sql`).
 *
 * The delete mark *is* written, in both directions, and an earlier version of this
 * header said the opposite: slice 1 left `plans` and `plan_blocks` out of the marks and
 * `20260923140000_plan_delete_marks.sql` put them back, because `deletePlan` exists in
 * the product and a plan has to be able to travel as gone. Both mappers write
 * `deleted_at: null` on a save, so a plan that was deleted and is written again stops
 * being a tombstone — an omitted column keeps its stored value through an upsert.
 */
export function planRow(plan: Plan): Record<string, unknown> {
  return {
    id: plan.id,
    workspace_id: plan.workspaceId,
    name: plan.name,
    cycle_count: plan.cycleCount,
    cycle_until_stopped: plan.cycleUntilStopped,
    auto_advance: plan.autoAdvance,
    alarm_enabled: plan.alarmEnabled,
    binaural_enabled: plan.binauralEnabled,
    revision: plan.revision,
    display: plan.display,
    // A save writes a **live** row: the app only writes a plan the reader has open, and
    // a plan is never saved while it is marked. Writing the `null` explicitly is what
    // makes a plan that was deleted and then restored stop being a tombstone — an
    // omitted column keeps its stored value through an upsert.
    deleted_at: null,
  };
}

/**
 * The plan's blocks as rows, in their own order.
 *
 * Sorted by `sort_order` on the way out rather than trusted from the array, because
 * the two stores disagree about what the order *is*: Dexie's array order is the
 * reader's order and `sort_order` is the column that carries it to the cloud.
 *
 * `alarm_enabled` and `display` are the two per-meditation answers round 17 added,
 * and they were a real gap until this pair was written: the table had nowhere to put
 * either, so sync would have dropped them silently
 * (`20260923120000_plan_block_answers.sql`). `null` is written as `null` and not as
 * `false`, because on a block `null` is a value — *"whatever the plan says"*.
 */
export function planBlockRows(plan: Plan): Record<string, unknown>[] {
  return [...plan.blocks]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((block) => ({
      id: block.id,
      plan_id: plan.id,
      sort_order: block.sortOrder,
      // The lead, mirrored for the rows written before the list existed — and the column
      // the cloud's own policies and indexes still read.
      meditation_id: block.meditationIds[0] ?? null,
      meditation_ids: block.meditationIds,
      symbol_id: block.symbolId,
      symbol_scope: block.symbolScope,
      binaural_preset_id: block.binauralPresetId,
      ambient_asset_id: block.ambientAssetId,
      alarm_asset_id: block.alarmAssetId,
      stages: block.stages,
      alarm_enabled: block.alarmEnabled ?? null,
      display: block.display ?? null,
      // The plan card's randomiser (the owner's round 24, `P2 · 45`), written the same
      // way and for the same reason as the two above it: on a block `null` is a value —
      // "read every line" — so it is written rather than omitted, because an omitted
      // column keeps its stored value through an upsert.
      intention_randomiser: block.intentionRandomiser ?? null,
      // Live, for the same reason the plan row says so: a block the plan holds again is
      // not marked, and an omitted column would leave the old mark in place.
      deleted_at: null,
    }));
}

export function planFromCloud(
  row: Record<string, unknown>,
  blockRows: Record<string, unknown>[],
): Plan {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: (row.name as string | null | undefined) ?? "",
    cycleCount: (row.cycle_count as number | undefined) ?? 1,
    cycleUntilStopped: row.cycle_until_stopped === true,
    autoAdvance: row.auto_advance !== false,
    // The plan's own switches were never optional, so absent means on: the same
    // reading the Dexie mapper (`plan-mapper.ts`) and the preferences adapter both
    // use. A block's answer is read the other way round, below, because there
    // absent is a third state rather than a `true`.
    alarmEnabled: row.alarm_enabled !== false,
    binauralEnabled: row.binaural_enabled !== false,
    revision: (row.revision as number | undefined) ?? 0,
    // `plans.display` is `not null default '{}'`, so the column's own default is
    // what a plan that has never been asked arrives as — and the domain's normalizer
    // is what turns that (or damage) into the app's answer rather than this module's.
    display: normalizePlanDisplay(row.display),
    blocks: blockRows
      .map(blockFromRow)
      .sort((left, right) => left.sortOrder - right.sortOrder),
  };
}

/**
 * A block's meditations, from a cloud row.
 *
 * `meditation_ids` is what the app writes now; `meditation_id` is what every row written
 * before the owner's round 22 carries, and it still holds the block's lead — so a row from
 * an older build reads as the list of one it always was. `parsePlanBlocks` reads the same
 * shapes on the local side, which is where every legacy key is named.
 */
function meditationIdsFromRow(row: Record<string, unknown>): string[] {
  if (Array.isArray(row.meditation_ids)) {
    return row.meditation_ids.filter((id): id is string => typeof id === "string" && id !== "");
  }
  const single = row.meditation_id;
  return typeof single === "string" && single !== "" ? [single] : [];
}

function blockFromRow(row: Record<string, unknown>): PlanBlock {
  return {
    id: row.id as string,
    sortOrder: (row.sort_order as number | undefined) ?? 0,
    meditationIds: meditationIdsFromRow(row),
    // `jsonb`, so the array travels as it is; a row written before stages existed
    // has none, and `[]` is the state a block with nothing to run is in. The Dexie
    // side reads that same column through `parsePlanBlocks`, which turns a
    // pre-round-15 block into the single stage it used to be — that repair belongs
    // to the local store's own upgrade, and a cloud row has been through it.
    stages: Array.isArray(row.stages) ? (row.stages as PlanBlockStage[]) : [],
    symbolId: (row.symbol_id as string | null | undefined) ?? null,
    // The column is `not null default 'rotate'` with a check constraint keeping it
    // in the two the domain knows, so this reads the value rather than judging it.
    symbolScope: (row.symbol_scope as SymbolScope | undefined) ?? "rotate",
    binauralPresetId: (row.binaural_preset_id as string | null | undefined) ?? null,
    ambientAssetId: (row.ambient_asset_id as string | null | undefined) ?? null,
    alarmAssetId: (row.alarm_asset_id as string | null | undefined) ?? null,
    // A block's own answer, and `null` here is an answer: it means "the plan's". So
    // anything that is not a boolean — including the absent column of a row written
    // before this existed — reads as `null`, never as `false`, which would have
    // silenced every block the reader never opened while leaving the plan's switch
    // saying otherwise.
    alarmEnabled: typeof row.alarm_enabled === "boolean" ? row.alarm_enabled : null,
    display: row.display == null ? null : normalizePlanDisplay(row.display),
    // A block's randomiser, read through the domain's own normaliser rather than a second
    // rule here: it is tolerant in the direction that matters — damage and an absent
    // column both read as "read every line" — and `parsePlanBlocks` gives a local row the
    // same answer, which is what keeps the two stores saying one thing.
    intentionRandomiser: normalizeIntentionRandomiser(row.intention_randomiser),
  };
}
