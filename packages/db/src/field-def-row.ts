import type { CellType, FieldDef, FieldScope, RefKind } from "@meditaur/domain";
import { timeFromRow, timeToRow } from "./row-time.ts";

/**
 * The `field_defs` row as Postgres stores it, and back.
 *
 * A column's definition, which is the row the Database's grid is built from, so it
 * is the one pair whose fields are nearly all answerable by a single value rather
 * than by a reference: `scope`, `cell_type` and `ref_kind` say what the column is
 * and what it points at.
 *
 * Two of them are deliberately nullable and read as such rather than being
 * defaulted here. `type_id` is `null` for a column **every** type shows, and
 * `ref_kind` is `null` for every cell that is not a reference — inventing a default
 * for either would put a column on a type it does not belong to, or make a text
 * cell claim to point at something.
 */
export function fieldDefRow(def: FieldDef): Record<string, unknown> {
  return {
    id: def.id,
    workspace_id: def.workspaceId,
    scope: def.scope,
    type_id: def.typeId,
    cell_type: def.cellType,
    ref_kind: def.refKind,
    key: def.key,
    label: def.label,
    description: def.description,
    sort_order: def.sortOrder,
    archived_at: timeToRow(def.archivedAt),
    deleted_at: timeToRow(def.deletedAt ?? null),
    revision: def.revision,
    updated_at: new Date(def.updatedAt).toISOString(),
  };
}

export function fieldDefFromRow(row: Record<string, unknown>): FieldDef {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    // The closed lists the domain already declares, and the table's check
    // constraints are what keep a stored value inside them
    // (`tests/unit/architecture/schema-unions.test.ts` is the local half of that).
    scope: row.scope as FieldScope,
    typeId: (row.type_id as string | null | undefined) ?? null,
    cellType: row.cell_type as CellType,
    refKind: (row.ref_kind as RefKind | null | undefined) ?? null,
    // The key is what a display names and what a stored value is keyed to, so an
    // absent one reads as empty rather than being derived from the heading: the
    // reader's heading is not the identifier, and re-deriving it here would pull a
    // column out from under a display that lists it.
    key: (row.key as string | null | undefined) ?? "",
    label: (row.label as string | null | undefined) ?? "",
    description: (row.description as string | null | undefined) ?? "",
    sortOrder: (row.sort_order as number | undefined) ?? 0,
    archivedAt: timeFromRow(row.archived_at),
    deletedAt: timeFromRow(row.deleted_at),
    revision: (row.revision as number | undefined) ?? 0,
    updatedAt: timeFromRow(row.updated_at) ?? 0,
  };
}
