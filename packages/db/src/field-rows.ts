import type { FieldOption, FieldValue } from "@meditaur/domain";
import { timeFromRow, timeToRow } from "./row-time.ts";

/**
 * The `field_values` and `field_options` rows.
 *
 * They travel together for one reason: neither is archivable. A value is the state
 * of a cell and an option is what a cell chose, so both tables have a `deleted_at`
 * and no `archived_at` — the same shape as `media_assets`, and the reason all three
 * carry no `archivedAt` in either direction.
 *
 * `field_values` has no `id` of its own either: it is keyed by the entity it hangs
 * off and the column it fills, which is exactly what a delete names and why
 * `CatalogChangeSet` does not try to name one.
 */
export function fieldValueRow(value: FieldValue): Record<string, unknown> {
  return {
    entity_id: value.entityId,
    field_def_id: value.fieldDefId,
    text: value.text,
    deleted_at: timeToRow(value.deletedAt ?? null),
    revision: value.revision,
    updated_at: new Date(value.updatedAt).toISOString(),
  };
}

export function fieldValueFromRow(row: Record<string, unknown>): FieldValue {
  return {
    entityId: row.entity_id as string,
    fieldDefId: row.field_def_id as string,
    text: (row.text as string | null | undefined) ?? "",
    deletedAt: timeFromRow(row.deleted_at),
    revision: (row.revision as number | undefined) ?? 0,
    updatedAt: timeFromRow(row.updated_at) ?? 0,
  };
}

export function fieldOptionRow(option: FieldOption): Record<string, unknown> {
  return {
    id: option.id,
    workspace_id: option.workspaceId,
    field_def_id: option.fieldDefId,
    label: option.label,
    sort_order: option.sortOrder,
    deleted_at: timeToRow(option.deletedAt ?? null),
    revision: option.revision,
    updated_at: new Date(option.updatedAt).toISOString(),
  };
}

export function fieldOptionFromRow(row: Record<string, unknown>): FieldOption {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    fieldDefId: row.field_def_id as string,
    label: (row.label as string | null | undefined) ?? "",
    sortOrder: (row.sort_order as number | undefined) ?? 0,
    deletedAt: timeFromRow(row.deleted_at),
    revision: (row.revision as number | undefined) ?? 0,
    updatedAt: timeFromRow(row.updated_at) ?? 0,
  };
}
