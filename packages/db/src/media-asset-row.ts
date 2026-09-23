import type { MediaAsset, MediaKind } from "@meditaur/domain";
import { timeFromRow, timeToRow } from "./row-time.ts";

/**
 * The `media_assets` row as Postgres stores it, and back.
 *
 * It is the one catalogue row that is **not** archivable: a file is either there
 * or gone, so the table has a `deleted_at` and no `archived_at` at all. The pair
 * therefore has no `archivedAt` to carry in either direction, and a mapper that
 * invented one would write a column the table does not have.
 */
export function mediaAssetRow(asset: MediaAsset): Record<string, unknown> {
  return {
    id: asset.id,
    workspace_id: asset.workspaceId,
    kind: asset.kind,
    name: asset.name,
    storage_path: asset.storagePath,
    duration_ms: asset.durationMs,
    sort_order: asset.sortOrder,
    deleted_at: timeToRow(asset.deletedAt ?? null),
    revision: asset.revision,
    updated_at: new Date(asset.updatedAt).toISOString(),
  };
}

export function mediaAssetFromRow(row: Record<string, unknown>): MediaAsset {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    kind: row.kind as MediaKind,
    name: (row.name as string | null | undefined) ?? "",
    // The path is how the bytes are reached, and a row without one is a row that
    // cannot play: `""` is the honest reading, not a guess at a location.
    storagePath: (row.storage_path as string | null | undefined) ?? "",
    durationMs: (row.duration_ms as number | undefined) ?? 0,
    sortOrder: (row.sort_order as number | undefined) ?? 0,
    deletedAt: timeFromRow(row.deleted_at),
    revision: (row.revision as number | undefined) ?? 0,
    updatedAt: timeFromRow(row.updated_at) ?? 0,
  };
}
