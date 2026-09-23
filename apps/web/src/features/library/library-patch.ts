import type { CatalogChangeSet, LibraryView } from "@meditaur/application";

/**
 * The Library's lists, patched instead of re-read (`P2 · 4`).
 *
 * `getLibrary` is nine storage scans, and until now every mutation in this screen
 * ran it to keep a handful of lists honest. The writes answer instead: a create or
 * an update returns the stamped row it stored, and a delete returns a
 * `CatalogChangeSet` naming what its cascade rewrote. This is what turns either into
 * the view the reader is already holding.
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
 * Apply a delete's answer to the view.
 *
 * Only the four lists a cascade can touch are rebuilt: `meditations` and `symbols`
 * gain the rows whose reference was cleared, and `presets` and `mediaAssets` lose
 * the row that went. A row the cascade did not touch is passed through by identity,
 * so nothing here can renumber, reorder or refresh a row the store left alone.
 *
 * `changes.updated.plans` is deliberately not applied. This view holds each plan's
 * **id and name**, and `patchPlanBlocks` clears a block's reference without renaming
 * anything — so there is nothing in that list for the Library to change. The planner,
 * which holds whole plans, is the screen that needs those rows.
 */
export function patchLibrary(view: LibraryView, changes: CatalogChangeSet): LibraryView {
  const droppedPresets = new Set(changes.removed.presets);
  const droppedAssets = new Set(changes.removed.mediaAssets);
  return {
    ...view,
    meditations: mergeById(view.meditations, changes.updated.meditations),
    symbols: mergeById(view.symbols, changes.updated.symbols),
    presets: view.presets.filter((row) => !droppedPresets.has(row.id)),
    mediaAssets: view.mediaAssets.filter((row) => !droppedAssets.has(row.id)),
  };
}
