import type {
  BinauralPreset,
  Entry,
  FieldDef,
  FieldOption,
  FieldValue,
  Intention,
  MediaAsset,
  Meditation,
  MeditationType,
  Symbol,
} from "@meditaur/domain";
import { db, type PlanRow } from "./schema.ts";

/**
 * The protocol's own read and write of a device's rows: **marks included, nothing
 * filtered** (`P2 · 3`, slice 3).
 *
 * Deliberately not `dexieCatalog`. Every read in `ports.ts` leaves the marked rows out
 * — that is what `notDeleted` is for, and it is right for a screen — while the protocol
 * has to *see* them: a tombstone is the one row a push must send, and a merge has to
 * compare an incoming revision against the marked local row's, or a stale live copy
 * would resurrect a delete.
 *
 * So this is a second door onto the same tables, and it is the *only* store surface the
 * protocol touches. That is also what makes the protocol testable: a fake with a `Map`
 * behind it stands in for IndexedDB, which the unit suite does not have — the same
 * reason `preferences-cache.test.ts` can test a Dexie-backed composition at all.
 *
 * The store names are Dexie's, which are not always the class's property names: the
 * property `meditations` holds the store `focusPoints`, because a store's name cannot
 * change once a version has run.
 */
export type SyncStore =
  | "meditationTypes"
  | "focusPoints"
  | "symbols"
  | "entries"
  | "intentions"
  | "fieldDefs"
  | "fieldOptions"
  | "fieldValuesByEntity"
  | "mediaAssets"
  | "presets"
  /**
   * A plan's blocks are one `blocksJson` column locally and a row each in the cloud, so
   * the protocol's plan half is the one place that maps one direction to N (`plan-rows.ts`).
   * The store is here because a push has to *see* a marked plan, and `dexiePlans` filters
   * those out of every read.
   */
  | "plans";

/** One row per store, so a `rows` call knows what it is handing back. */
export type StoreRows = {
  meditationTypes: MeditationType;
  focusPoints: Meditation;
  symbols: Symbol;
  entries: Entry;
  intentions: Intention;
  fieldDefs: FieldDef;
  fieldOptions: FieldOption;
  fieldValuesByEntity: FieldValue;
  mediaAssets: MediaAsset;
  presets: BinauralPreset;
  plans: PlanRow;
};

export type SyncLocalStore = {
  /** A workspace's rows of one store, the marked ones included. */
  rows<S extends SyncStore>(store: S, workspaceId: string): Promise<StoreRows[S][]>;
  /**
   * The rows of the one store that is scoped by its entity rather than by a workspace.
   *
   * `field_values` is keyed by `(entityId, fieldDefId)` and carries no `workspaceId`, so
   * a workspace's values are read by asking for the entities — the same read
   * `ports.ts` makes, and the same one the cloud's `selectIn` answers.
   */
  rowsForEntities(entityIds: string[]): Promise<FieldValue[]>;
  /** Write one row back, exactly as given — a pulled copy, mark and all. */
  put<S extends SyncStore>(store: S, row: StoreRows[S]): Promise<void>;
};

export function createSyncLocalStore(): SyncLocalStore {
  return {
    async rows(store, workspaceId) {
      // `db.table` by name rather than by property, because the two are not the same
      // word for `meditations` and this seam speaks store names throughout.
      return db.table(store).where("workspaceId").equals(workspaceId).toArray();
    },
    async rowsForEntities(entityIds) {
      if (entityIds.length === 0) return [];
      return db.table("fieldValuesByEntity").where("entityId").anyOf(entityIds).toArray();
    },
    async put(store, row) {
      await db.table(store).put(row);
    },
  };
}
