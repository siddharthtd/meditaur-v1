import type { CatalogChangeSet, LibraryView } from "@meditaur/application";
import type { FieldValue } from "@meditaur/domain";

/**
 * A `LibraryView` patched from the answer a write gives, instead of re-read (`P2 · 4`).
 *
 * `getLibrary` is nine storage scans, and until this item every mutation on the
 * Library and the Database ran it to keep a handful of lists honest. The writes
 * answer instead: a create or an update returns the stamped row it stored, and a
 * delete, an archive or a commit returns a `CatalogChangeSet` naming what it wrote
 * and what went. This is what turns either into the view the screen is already
 * holding — one module rather than one per screen, because both screens hold the
 * same `LibraryView` and two patches would be two chances to disagree.
 *
 * One rule, and it is the application's own: order is `sortOrder`, then the id —
 * the same comparison `getLibrary`'s `byOrder` makes. A patch that sorted any other
 * way would put two screens' lists in two orders, which is the sort of drift this
 * item exists to remove rather than move.
 */
function mergeById<T extends { id: string; sortOrder: number }>(
  rows: T[],
  changed: readonly T[],
): T[] {
  if (changed.length === 0) return rows;
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const row of changed) byId.set(row.id, row);
  return [...byId.values()].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
  );
}

/** A row a write returned, in its place rather than appended blind. */
export function withRow<T extends { id: string; sortOrder: number }>(rows: T[], row: T): T[] {
  return mergeById(rows, [row]);
}

/**
 * A value's identity is the **pair** it hangs on, not an id of its own.
 *
 * `field_values` has no id: a value is the cell at `(entityId, fieldDefId)`, which is
 * why the change-set never names one and why this is the one list a patch has to key
 * differently (`P2 · 4`).
 */
function valueKey(row: Pick<FieldValue, "entityId" | "fieldDefId">): string {
  return `${row.entityId}:${row.fieldDefId}`;
}

/**
 * The values, merged by their pair.
 *
 * An empty text is **not** a row: `saveFieldValue` answers a cleared cell with
 * `text: ""` and deletes the stored row, so a refetch would hold no row at all and a
 * patch that kept one would leave the draft reading a value the store does not have.
 */
function mergeValues(rows: FieldValue[], changed: readonly FieldValue[]): FieldValue[] {
  if (changed.length === 0) return rows;
  const byKey = new Map(rows.map((row) => [valueKey(row), row]));
  for (const row of changed) {
    if (row.text === "") byKey.delete(valueKey(row));
    else byKey.set(valueKey(row), row);
  }
  return [...byKey.values()];
}

/**
 * Apply a write's answer to the view.
 *
 * Every list a write can touch is rebuilt: the rows the answer names replace theirs
 * by id (a create lands at its own order), and every id in `removed` leaves. A row
 * the answer did not name is passed through **by identity**, so nothing here can
 * renumber, reorder or refresh a row the store left alone.
 *
 * A **value** is the one row a change-set cannot name: it is keyed by
 * `(entityId, fieldDefId)`, so it goes when either half goes — the entity was
 * removed, or the column was. `removed.fieldOptions` needs no such rule: an option
 * is only removed while no cell chose it, and the column's own removal is named.
 *
 * `mediaAssets` is deliberately absent: an upload answers with the asset row itself,
 * which the screen adds with `withRow` — and `updated.plans` is not applied either,
 * because this view holds each plan's **id and name** and a cascade clears a block's
 * reference without renaming anything. The planner, which holds whole plans, is the
 * screen that needs those rows.
 */
export function patchView(view: LibraryView, changes: CatalogChangeSet): LibraryView {
  const gone = new Set([
    ...changes.removed.presets,
    ...changes.removed.mediaAssets,
    ...changes.removed.symbols,
    ...changes.removed.entries,
    ...changes.removed.intentions,
    ...changes.removed.meditations,
    ...changes.removed.meditationTypes,
  ]);
  const goneColumns = new Set(changes.removed.fieldDefs);
  const goneOptions = new Set(changes.removed.fieldOptions);
  const dropping = <T extends { id: string }>(rows: T[], ids: Set<string>): T[] =>
    ids.size === 0 ? rows : rows.filter((row) => !ids.has(row.id));
  const keep = <T extends { id: string; sortOrder: number }>(rows: T[]): T[] =>
    dropping(rows, gone);
  return {
    ...view,
    meditations: mergeById(keep(view.meditations), changes.updated.meditations),
    symbols: mergeById(keep(view.symbols), changes.updated.symbols),
    presets: mergeById(keep(view.presets), changes.updated.presets),
    meditationTypes: mergeById(keep(view.meditationTypes), changes.updated.meditationTypes),
    entries: mergeById(keep(view.entries), changes.updated.entries),
    intentions: mergeById(keep(view.intentions), changes.updated.intentions),
    fieldDefs: mergeById(
      dropping(view.fieldDefs, goneColumns),
      changes.updated.fieldDefs,
    ),
    fieldOptions: mergeById(
      dropping(view.fieldOptions, goneOptions),
      changes.updated.fieldOptions,
    ),
    fieldValues: mergeValues(
      view.fieldValues.filter((row) => !gone.has(row.entityId) && !goneColumns.has(row.fieldDefId)),
      changes.updated.fieldValues,
    ),
  };
}
