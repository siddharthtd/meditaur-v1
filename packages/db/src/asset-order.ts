import type { MediaAsset } from "@meditaur/domain";

/**
 * A stored row, whose order may not be there yet — which is the whole reason the
 * rule exists. It is what a Dexie table hands back before this version has run.
 */
export type StoredMediaAsset = Omit<MediaAsset, "sortOrder"> & { sortOrder?: number };

/**
 * The order a device that already holds audio files needs (`P2 · 4`, the owner's
 * answer 2026-09-21).
 *
 * `MediaAsset.sortOrder` is what makes the Audio files list *patchable*: an upload
 * can be inserted where it belongs instead of re-reading the catalogue, and the
 * owner chose the order over that read.
 *
 * A row stored before the column existed carries no order at all, and a Dexie
 * version that has already run is never re-run, so the rows that exist have to be
 * numbered by a **new** version's rule — the seed cannot do it, because the seed
 * only ever runs on a device that has none. The rule is a pure function so the
 * unit suite can prove it (it has no IndexedDB): the upgrade body stays one line
 * and `tests/unit/db/asset-order.test.ts` carries the cases.
 *
 * Two things it deliberately does not do:
 *
 * - **It does not renumber a row that already has an order.** Numbering is what a
 *   device that predates the column needs; a device that already holds numbers is
 *   right by construction, and a row the app has placed keeps its place.
 * - **It does not sort the store on every open.** It returns only the rows to put,
 *   so a second run costs one read and writes nothing.
 *
 * The rows it does number go by **name, then id**: a starting point the app
 * computes once, stable across two runs, and the seam a reorder would move.
 */
export function assetsWithOrder(existing: readonly StoredMediaAsset[]): MediaAsset[] {
  const ordered = [...existing].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
  const toPut: MediaAsset[] = [];
  ordered.forEach((row, index) => {
    if (typeof row.sortOrder === "number") return;
    toPut.push({ ...row, sortOrder: index });
  });
  return toPut;
}
