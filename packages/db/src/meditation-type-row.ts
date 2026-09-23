import type { MeditationType, StageTemplate } from "@meditaur/domain";
import { timeFromRow, timeToRow } from "./row-time.ts";

/**
 * The `meditation_types` row as Postgres stores it, and back.
 *
 * Short, and worth its own file for one reason: `stages` is `jsonb`, and it is the
 * **template** a block materialises rather than a meditation's own copy. The two
 * read differently for exactly that reason — see below — and keeping them in
 * separate pairs makes that hard to lose.
 */
export function meditationTypeRow(type: MeditationType): Record<string, unknown> {
  return {
    id: type.id,
    workspace_id: type.workspaceId,
    name: type.name,
    stages: type.stages,
    sort_order: type.sortOrder,
    archived_at: timeToRow(type.archivedAt),
    deleted_at: timeToRow(type.deletedAt ?? null),
    revision: type.revision,
    updated_at: new Date(type.updatedAt).toISOString(),
  };
}

export function meditationTypeFromRow(row: Record<string, unknown>): MeditationType {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: row.name as string,
    // A **type** always runs stages: this is the template every block of it is
    // built from, so an absent column is an empty template rather than the `null`
    // a meditation's own copy uses to say "ask the type". Reading it as `null`
    // would make a block of this type compile nothing.
    stages: Array.isArray(row.stages) ? (row.stages as StageTemplate[]) : [],
    sortOrder: (row.sort_order as number | undefined) ?? 0,
    archivedAt: timeFromRow(row.archived_at),
    deletedAt: timeFromRow(row.deleted_at),
    revision: (row.revision as number | undefined) ?? 0,
    updatedAt: timeFromRow(row.updated_at) ?? 0,
  };
}
