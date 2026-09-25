import type { FieldValue, MediaAsset, SyncStatePort, SyncWatermark } from "@meditaur/domain";
import type { StoreRows, SyncLocalStore, SyncStore } from "../../packages/db/src/sync-local.ts";

/** The workspace every row in these fixtures belongs to. */
export const WORKSPACE = "ws1";

/**
 * The two stores a sync test needs, as fakes that **hold** rows.
 *
 * `fakeSupabaseData` is the cloud's (it is the same fixture the cloud adapters use);
 * these are the device's and the watermark's. All three hold rather than count, because
 * what a protocol has to get right is what it writes and where it stops — a mock that
 * counted calls would let a push that spoke the wrong column names pass.
 *
 * The local one is a `Map` per store rather than IndexedDB, which is the whole reason
 * the protocol takes `SyncLocalStore` instead of reaching for `db` itself: the unit
 * suite has no IndexedDB, so this is the only way a merge can be tested at all.
 */
export type Held = { [S in SyncStore]: StoreRows[S][] };

export function fakeLocal(held: Partial<Held> = {}) {
  const stores: Held = {
    meditationTypes: [],
    focusPoints: [],
    symbols: [],
    entries: [],
    intentions: [],
    fieldDefs: [],
    fieldOptions: [],
    fieldValuesByEntity: [],
    mediaAssets: [],
    presets: [],
    plans: [],
  };
  Object.assign(stores, held);

  /**
   * A row's identity in its store, which is the same fact Dexie's primary key is: an
   * `id`, except on the one table keyed by the pair it hangs off.
   */
  const keyOf = (row: { id?: string; entityId?: string; fieldDefId?: string }): string =>
    row.id ?? `${row.entityId ?? ""}|${row.fieldDefId ?? ""}`;

  const store: SyncLocalStore = {
    async rows(name, workspaceId) {
      // The map's own indexing loses the per-store type, which is the one cast this
      // fixture makes: what a store holds *is* the store's row type, by construction.
      const rows = stores[name] as unknown as { workspaceId?: string }[];
      return rows.filter((row) => row.workspaceId === workspaceId) as never;
    },
    async rowsForEntities(entityIds) {
      return stores.fieldValuesByEntity.filter((value) => entityIds.includes(value.entityId));
    },
    async put(name, row) {
      // `put` replaces, like Dexie's: a merge that wrote the same row twice would
      // otherwise double the table and hide a wrong comparison behind a duplicate.
      const rows = stores[name] as unknown as { id?: string }[];
      const key = keyOf(row as { id?: string });
      const at = rows.findIndex((existing) => keyOf(existing) === key);
      if (at === -1) rows.push(row as never);
      else rows[at] = row as never;
    },
  };
  return { store, stores };
}

/** The watermark store, as a `Map`: a device that has never synced has no row at all. */
export function fakeState(initial: SyncWatermark[] = []) {
  const marks = new Map(initial.map((mark) => [mark.table, mark]));
  const port: SyncStatePort = {
    async get(table) {
      return marks.get(table) ?? null;
    },
    async save(mark) {
      marks.set(mark.table, mark);
    },
  };
  return { port, marks };
}

/** A value, which has no fixture maker of its own. */
export function makeValue(entityId: string, fieldDefId: string, updatedAt: number, text = "x"): FieldValue {
  return { entityId, fieldDefId, text, revision: 0, updatedAt };
}

/** A picture, which has no fixture maker of its own either. */
export function makeAsset(id: string, updatedAt: number): MediaAsset {
  return {
    id,
    workspaceId: WORKSPACE,
    kind: "ambient",
    name: "rain.mp3",
    storagePath: `blobs/${id}`,
    durationMs: 60_000,
    sortOrder: 0,
    revision: 0,
    updatedAt,
  };
}
