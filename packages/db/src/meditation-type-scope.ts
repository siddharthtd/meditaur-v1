import { copyStages, SEEDED_MEDITATION_TYPES, type MeditationType } from "@meditaur/domain";

/**
 * The four seeded types, each carrying the workspace it belongs to.
 *
 * A type is a **scoped** catalogue row: every read asks for it by workspace
 * (`db.meditationTypes.where("workspaceId").equals(workspaceId)`), and a row whose
 * `workspaceId` was never written is not returned by that query. It exists, and it
 * is invisible — no error, no type failure, no unit failure.
 *
 * That is what v17 did. It added the seeded rows as
 * `{ ...seeded, sortOrder, archivedAt, revision, updatedAt }`, and
 * `SEEDED_MEDITATION_TYPES` holds only `{ id, name }`, so `workspaceId` was never
 * written. On every device that existed before round 15 — which is every reader
 * who had opened the app before it — the four types vanished from the library's
 * tab strip, from the plan's tile groups and from the `Type` column, and the
 * library fell through to its first fixed tab. A device that arrived *after* the
 * round never saw it, because the seed (`buildDefaultWorkspace`) sets the field:
 * only the upgrade path forgot.
 *
 * This is that repair as a pure function, so the rule is testable without
 * IndexedDB (which the unit suite has none of) and the upgrade stays one line. It
 * returns the rows to **write**:
 *
 * - a row that already names this workspace is left alone — its name, its order
 *   and whether the reader archived it are all the reader's, not ours;
 * - a row that is missing, or present without a scope, is written with the scope
 *   it should always have had, keeping whatever else the row already carries.
 *
 * Nothing is returned for a device that is already correct, so the caller is safe
 * to run on every version and costs one read on the second pass. The id is the
 * identity, so `put` replaces the orphan row rather than duplicating it.
 *
 * `existing` is deliberately partial: the whole point is that the store holds rows
 * an earlier version wrote incompletely.
 *
 * A device holds **one** workspace — the seed mints it and `identity.ts` lets the
 * first signed-in user claim it — so the four ids are unambiguous. Two workspaces
 * would be an ambiguity the store cannot express anyway, because the id is the
 * primary key.
 */
export function scopedSeededTypes(
  workspaces: readonly { id: string }[],
  existing: readonly (Partial<MeditationType> & { id: string })[],
): MeditationType[] {
  const byId = new Map(existing.map((row) => [row.id, row]));
  const rows: MeditationType[] = [];
  for (const workspace of workspaces) {
    for (const [sortOrder, seeded] of SEEDED_MEDITATION_TYPES.entries()) {
      const row = byId.get(seeded.id);
      if (row?.workspaceId === workspace.id) continue;
      rows.push({
        id: seeded.id,
        workspaceId: workspace.id,
        name: row?.name ?? seeded.name,
        // A row that exists keeps the stages it has; a new one is seeded with its
        // template. The seed's stages are copied so two workspaces never share one
        // array.
        stages: copyStages(row?.stages ?? seeded.stages),
        sortOrder: row?.sortOrder ?? sortOrder,
        archivedAt: row?.archivedAt ?? null,
        revision: row?.revision ?? 0,
        updatedAt: row?.updatedAt ?? 0,
      });
    }
  }
  return rows;
}
