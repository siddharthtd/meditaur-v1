import { defaultEarEq, type BinauralPreset, type EarEq, type Tone } from "@meditaur/domain";
import { timeFromRow, timeToRow } from "./row-time.ts";

/**
 * The `binaural_presets` row as Postgres stores it, and back.
 *
 * Four of its columns are `jsonb` — the two tone lists and the two EQ halves — so
 * the pair is mostly pass-through, and the only judgement in it is what an absent
 * one means. Neither answer is invented here: no tones is silence, which is what
 * `[]` says, and no EQ is the **domain's own** flat curve (`defaultEarEq`), not a
 * shape this mapper made up. A preset written by an older app version therefore
 * reads as one that was never tuned rather than as one that cannot be tuned.
 */
export function presetRow(preset: BinauralPreset): Record<string, unknown> {
  return {
    id: preset.id,
    workspace_id: preset.workspaceId,
    name: preset.name,
    left_tones: preset.leftTones,
    right_tones: preset.rightTones,
    fade_in_ms: preset.fadeInMs,
    fade_out_ms: preset.fadeOutMs,
    eq_left: preset.eqLeft,
    eq_right: preset.eqRight,
    sort_order: preset.sortOrder,
    archived_at: timeToRow(preset.archivedAt),
    deleted_at: timeToRow(preset.deletedAt ?? null),
    revision: preset.revision,
    updated_at: new Date(preset.updatedAt).toISOString(),
  };
}

export function presetFromRow(row: Record<string, unknown>): BinauralPreset {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: (row.name as string | null | undefined) ?? "",
    leftTones: tonesFromRow(row.left_tones),
    rightTones: tonesFromRow(row.right_tones),
    fadeInMs: (row.fade_in_ms as number | undefined) ?? 0,
    fadeOutMs: (row.fade_out_ms as number | undefined) ?? 0,
    eqLeft: eqFromRow(row.eq_left),
    eqRight: eqFromRow(row.eq_right),
    sortOrder: (row.sort_order as number | undefined) ?? 0,
    archivedAt: timeFromRow(row.archived_at),
    deletedAt: timeFromRow(row.deleted_at),
    revision: (row.revision as number | undefined) ?? 0,
    updatedAt: timeFromRow(row.updated_at) ?? 0,
  };
}

/** No tones is silence, which is a state a preset can be in honestly. */
function tonesFromRow(value: unknown): Tone[] {
  return Array.isArray(value) ? (value as Tone[]) : [];
}

/** No curve is the domain's own flat one, so a preset stays editable. */
function eqFromRow(value: unknown): EarEq {
  return value && typeof value === "object" ? (value as EarEq) : defaultEarEq();
}
