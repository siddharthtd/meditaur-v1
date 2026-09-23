import type { Meditation, PlanBlockStage } from "@meditaur/domain";
import { timeFromRow, timeToRow } from "./row-time.ts";

/**
 * The `meditations` row as Postgres stores it, and back.
 *
 * A mapper pair exists because the SQL names are the **stored** ones, and the
 * domain's are the domain's: the table is `meditations` while the domain has called
 * the thing a meditation since the rename, the column is `type_id` where the shape
 * says `typeId`, and `stages` is `jsonb` on the server while the domain holds an
 * array. Every catalogue table needs one of these pairs for the sync slice
 * (`P2 · 3`), and this is the first — only the plan has a mapper today.
 *
 * Times follow the convention the preferences adapter already set rather than a
 * second one: the domain counts milliseconds and Postgres stores `timestamptz`, so
 * a write is `toISOString()` and a read is `Date.parse`.
 *
 * Reads are **tolerant**, because a stored row can be older than the column it is
 * being read for. `archived_at` and `deleted_at` absent mean what `null` means —
 * live — and reading either as a value would archive a row that is in use.
 */
export function meditationRow(meditation: Meditation): Record<string, unknown> {
  return {
    id: meditation.id,
    workspace_id: meditation.workspaceId,
    name: meditation.name,
    type_id: meditation.typeId,
    location_text: meditation.locationText,
    default_binaural_preset_id: meditation.defaultBinauralPresetId,
    default_duration_ms: meditation.defaultDurationMs,
    description: meditation.description,
    governs: meditation.governs,
    colour: meditation.colour,
    element: meditation.element,
    representation_asset_id: meditation.representationAssetId,
    representation_description: meditation.representationDescription,
    binaural_enabled: meditation.binauralEnabled,
    // `jsonb`, so the array travels as it is. PostgREST parses it on the way back,
    // which is why nothing here juggles JSON strings — that is the Dexie side's
    // habit, not the server's.
    stages: meditation.stages,
    sort_order: meditation.sortOrder,
    archived_at: timeToRow(meditation.archivedAt),
    // Absent and `null` mean the same thing to the domain, and the store writes the
    // `null` so nothing downstream has to tell them apart.
    deleted_at: timeToRow(meditation.deletedAt ?? null),
    revision: meditation.revision,
    updated_at: new Date(meditation.updatedAt).toISOString(),
  };
}

export function meditationFromRow(row: Record<string, unknown>): Meditation {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: row.name as string,
    typeId: row.type_id as string,
    locationText: (row.location_text as string | null | undefined) ?? "",
    defaultBinauralPresetId: (row.default_binaural_preset_id as string | null | undefined) ?? null,
    defaultDurationMs: (row.default_duration_ms as number | undefined) ?? 0,
    description: (row.description as string | null | undefined) ?? null,
    governs: (row.governs as string | null | undefined) ?? null,
    colour: (row.colour as string | null | undefined) ?? null,
    element: (row.element as string | null | undefined) ?? null,
    representationAssetId: (row.representation_asset_id as string | null | undefined) ?? null,
    representationDescription:
      (row.representation_description as string | null | undefined) ?? null,
    // Off has to be said out loud, exactly as the preferences adapter reads its own
    // switch: a row written before the column existed did not turn anything off.
    binauralEnabled: row.binaural_enabled !== false,
    stages: stagesFromRow(row.stages),
    sortOrder: (row.sort_order as number | undefined) ?? 0,
    archivedAt: timeFromRow(row.archived_at),
    deletedAt: timeFromRow(row.deleted_at),
    revision: (row.revision as number | undefined) ?? 0,
    updatedAt: timeFromRow(row.updated_at) ?? 0,
  };
}

/**
 * `stages` as the array the domain holds.
 *
 * An absent column reads as `null` rather than `[]`, and the domain is why: `null`
 * means "use the type's template" while an empty array would mean a meditation that
 * runs no stages at all. Reading one as the other would give every meditation a
 * block that does nothing.
 */
function stagesFromRow(value: unknown): PlanBlockStage[] | null {
  return Array.isArray(value) ? (value as PlanBlockStage[]) : null;
}
