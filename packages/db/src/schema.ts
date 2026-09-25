import Dexie, { type EntityTable, type Table } from "dexie";
import { assetsWithOrder } from "./asset-order.ts";
import { FOCUS_ORDER, SYMBOL_ORDER, rankOf } from "./catalog-order.ts";
import { DEFAULT_PLAN_ID } from "./default-workspace.ts";
import { scopedSeededTypes } from "./meditation-type-scope.ts";
import { thanksGivingMinute, withoutSeededCrown } from "./seeded-circuit.ts";
import { planFromRow, planRowForStore } from "./plan-mapper.ts";
import { regroupSeededPointsCircuit, withSeededPointsCircuit } from "./seeded-plans.ts";
import { withReikiBindings } from "./seeded-bindings.ts";
import { splitPancreasAndSpleen, splitThyroidAndThymus, withSeededPoints } from "./seeded-points.ts";
import { symbolsWithReikiSystems } from "./reiki-symbols.ts";
import {
  CHAKRA_TYPE_ID,
  POINT_TYPE_ID,
  PROTECTION_TYPE_ID,
  SEEDED_MEDITATION_TYPES,
  DEFAULT_ALARM_ENABLED,
  DEFAULT_PLAN_DISPLAY,
  copyStages,
  isAppDefaultDisplay,
  normalizePlanDisplay,
  withAutoScroll,
  type AppEvent,
  type BinauralPreset,
  type Entry,
  type FieldDef,
  type FieldOption,
  type FieldValue,
  type Meditation,
  type Intention,
  type MediaAsset,
  type MeditationType,
  type Plan,
  type SessionSnapshot,
  type Symbol,
  type SyncWatermark,
  type UserPreferences,
  type Workspace,
  type WorkspaceMember,
  type SessionLog,
} from "@meditaur/domain";

export type PlanRow = Omit<Plan, "blocks" | "display"> & {
  blocksJson: string;
  /** `Plan.display`, as stored JSON — the same shape `normalizePlanDisplay` reads. */
  displayJson: string;
  updatedAt: number;
  /**
   * The delete mark, in the store's own column rather than in the domain's `Plan`
   * (`P2 · 3`, slice 3).
   *
   * A plan the reader deleted is not a state the app holds — it is a row this store no
   * longer offers — so `deletedAt` lives here and every read in `ports.ts` filters it
   * out, exactly as `plan-cloud.ts` filters the column on the way in. The mark is what
   * lets a delete travel: an absence on one device is a row the other reads as new.
   */
  deletedAt?: number | null;
};

export type SnapshotRow = SessionSnapshot & { updatedAt: number };

/**
 * The account's flags as this device last read them from the cloud (`P0 · 23`, slice 23c).
 *
 * Written from a resolved read, so this is a complete set *as of the build that wrote it* —
 * and a flag added since is filled in by `normalizeFeatureFlags` on the way out rather than
 * read as off, which is what makes the mirror safe to keep across a release.
 */
export type StoredAccountFlags = {
  userId: string;
  isAdmin: boolean;
  flags: Record<string, unknown>;
  /** When this device read it, for the record; nothing decides anything from it. */
  readAt: number;
};

export type MediaBlobRow = {
  id: string;
  bytes: ArrayBuffer;
  mimeType: string;
};

/**
 * The rows two earlier versions wrote, kept as local types.
 *
 * `focusSymbolBindings` and pair-scoped `intentions` are what the Database
 * replaced, and the upgrades that created them read and write those shapes. The
 * types live here rather than in the domain because the domain no longer has
 * them: an upgrade is history, and history does not get to keep a name in the
 * product's model.
 */
type LegacyBindingRow = {
  focusPointId: string;
  symbolId: string;
  sortOrder: number;
};

type LegacyIntentionRow = {
  id: string;
  workspaceId: string;
  focusPointId: string | null;
  symbolId: string | null;
  sortOrder: number;
  text: string;
  revision: number;
  updatedAt: number;
};

/**
 * The two columns the seed writes for the Chakra type.
 *
 * A column that belongs to one type does not show on another's rows, and these two
 * were the only ones that existed before a column could be typed: `Governs` and
 * `Element` are facts about a chakra. Every column a reader adds is shared.
 */
const CHAKRA_COLUMN_KEYS = new Set(["governs", "element"]);

/**
 * What a stored `kind` meant, as the id of the type it is now.
 *
 * `kind` was a word on the row (`chakra`, `point`, `custom`, and `body` before the
 * 2026-09-15 rename). It is a row of its own now, so an upgrade has to translate:
 * `custom` was only ever the seeded Protection, and anything else a reader had
 * marked custom was a meditation that is not a chakra — which lands on Point,
 * because an upgrade is not the place to throw a reader's row away.
 */
function typeIdForLegacyKind(kind: unknown, name: string): string {
  if (kind === "chakra") return CHAKRA_TYPE_ID;
  if (kind === "custom" && name === "Protection") return PROTECTION_TYPE_ID;
  return POINT_TYPE_ID;
}

function focusDefaults(row: Record<string, unknown>): Meditation {
  return {
    id: row.id as string,
    workspaceId: row.workspaceId as string,
    name: row.name as string,
    typeId:
      typeof row.typeId === "string" && row.typeId
        ? row.typeId
        : typeIdForLegacyKind(row.kind, row.name as string),
    locationText: (row.locationText as string) ?? "",
    defaultBinauralPresetId: (row.defaultBinauralPresetId as string | null) ?? null,
    defaultDurationMs: (row.defaultDurationMs as number) ?? 120_000,
    description: (row.description as string | null) ?? null,
    governs: (row.governs as string | null) ?? null,
    colour: (row.colour as string | null) ?? null,
    element: (row.element as string | null) ?? null,
    representationAssetId: (row.representationAssetId as string | null) ?? null,
    representationDescription: (row.representationDescription as string | null) ?? null,
    stages: (row.stages as Meditation["stages"]) ?? null,
    binauralEnabled: row.binauralEnabled !== false,
    sortOrder: (row.sortOrder as number | undefined) ?? 0,
    archivedAt: (row.archivedAt as number | null | undefined) ?? null,
    revision: (row.revision as number | undefined) ?? 0,
    updatedAt: (row.updatedAt as number | undefined) ?? 0,
  };
}

/**
 * Rows with a repair's changes applied: the changed ones replaced, and any the repair **added**
 * appended.
 *
 * The second half is the part that is easy to lose, and the tree lost it once. Round 22's v32
 * used the first half alone, so the `Thymus` its walk planted was never handed to
 * `withReikiBindings` — a device that ran it got the point with its sentences and **without** its
 * four symbols, which the version's own comment claimed it had. Round 25's v34 uses this shape
 * and, because `withReikiBindings` plants only what is missing, its run also gives `Thymus` the
 * bindings v32 dropped.
 */
function withChanges<T extends { id: string }>(rows: readonly T[], changes: readonly T[]): T[] {
  const byId = new Map(changes.map((row) => [row.id, row]));
  const merged = rows.map((row) => byId.get(row.id) ?? row);
  const known = new Set(rows.map((row) => row.id));
  return [...merged, ...changes.filter((row) => !known.has(row.id))];
}

export class MeditaurDB extends Dexie {
  workspaces!: EntityTable<Workspace, "id">;
  members!: Table<WorkspaceMember, [string, string]>;
  preferences!: EntityTable<UserPreferences, "userId">;
  meditationTypes!: EntityTable<MeditationType, "id">;
  /**
   * A meditation. The store was `focusPoints` until v18; Dexie cannot rename a
   * table in an upgrade, so that version copies it and drops the old one (the
   * `fieldValues` → `fieldValuesByEntity` pattern, v6).
   */
  meditations!: EntityTable<Meditation, "id">;
  symbols!: EntityTable<Symbol, "id">;
  entries!: EntityTable<Entry, "id">;
  intentions!: EntityTable<Intention, "id">;
  fieldDefs!: EntityTable<FieldDef, "id">;
  fieldOptions!: EntityTable<FieldOption, "id">;
  fieldValuesByEntity!: Table<FieldValue, [string, string]>;
  presets!: EntityTable<BinauralPreset, "id">;
  mediaAssets!: EntityTable<MediaAsset, "id">;
  mediaBlobs!: EntityTable<MediaBlobRow, "id">;
  plans!: EntityTable<PlanRow, "id">;
  snapshots!: EntityTable<SnapshotRow, "instanceId">;
  sessionLogs!: EntityTable<SessionLog, "id">;
  events!: EntityTable<AppEvent, "id">;
  /**
   * How far a sync has got, per table (`P2 · 3`, slice 3).
   *
   * The device's own bookkeeping rather than a row of the product: nothing draws it,
   * it never travels, and `dexieSyncState` (`ports.ts`) is its only reader and writer.
   */
  syncState!: EntityTable<SyncWatermark, "table">;
  /**
   * The account's flags as the cloud last said them (`P0 · 23`, slice 23c).
   *
   * A mirror, not a second source: written only from a read the cloud answered, so a
   * reader whose flags are off does not see them on while offline. `dexieFlagsCache`
   * (`ports.ts`) is its only reader and writer.
   */
  accountFlags!: EntityTable<StoredAccountFlags, "userId">;

  constructor() {
    super("meditaur");
    this.version(1).stores({
      workspaces: "id",
      members: "[workspaceId+userId], userId",
      preferences: "userId",
      focusPoints: "id, workspaceId",
      symbols: "id, focusPointId",
      affirmations: "id, symbolId",
      fieldDefs: "id, workspaceId",
      fieldValues: "[symbolId+fieldDefId], symbolId",
      tableViews: "id, workspaceId",
      presets: "id, workspaceId",
      mediaAssets: "id, workspaceId",
      plans: "id, workspaceId, updatedAt",
      snapshots: "instanceId, planId, updatedAt",
    });
    this.version(2).stores({
      sessionLogs: "id, workspaceId, completedAt",
    });
    this.version(3).stores({
      mediaBlobs: "id",
    });
    this.version(4).stores({
      sessionLogs: "id, workspaceId, planId, [workspaceId+completedAt]",
    });
    this.version(5)
      .stores({
        symbols: "id, workspaceId",
        focusSymbolBindings: "[focusPointId+symbolId], focusPointId, symbolId",
        affirmations: "id, focusPointId, symbolId",
      })
      .upgrade(async (tx) => {
        const focuses = await tx.table("focusPoints").toArray();
        const focusWs = new Map(focuses.map((row) => [row.id as string, row.workspaceId as string]));
        for (const row of focuses) {
          if (row.defaultDurationMs == null) {
            await tx.table("focusPoints").put({ ...row, defaultDurationMs: 120_000 });
          }
        }
        const symbols = await tx.table("symbols").toArray();
        const bindings: LegacyBindingRow[] = [];
        for (const row of symbols) {
          const focusPointId = row.focusPointId as string | undefined;
          if (focusPointId) {
            bindings.push({
              focusPointId,
              symbolId: row.id as string,
              sortOrder: (row.sortOrder as number | undefined) ?? 0,
            });
          }
          await tx.table("symbols").put({
            id: row.id,
            workspaceId: (row.workspaceId as string | undefined) ?? focusWs.get(focusPointId ?? "") ?? "",
            name: row.name,
            description: row.description,
            usage: row.usage,
          });
        }
        if (bindings.length > 0) {
          await tx.table("focusSymbolBindings").bulkAdd(bindings);
        }
        const parent = new Map(bindings.map((row) => [row.symbolId, row.focusPointId]));
        const affirmations = await tx.table("affirmations").toArray();
        for (const row of affirmations) {
          const symbolId = row.symbolId as string | null | undefined;
          await tx.table("affirmations").put({
            id: row.id,
            focusPointId:
              (row.focusPointId as string | undefined) ??
              (symbolId ? parent.get(symbolId) : undefined) ??
              "",
            symbolId: symbolId ?? null,
            sortOrder: row.sortOrder,
            text: row.text,
          });
        }
      });
    this.version(6)
      .stores({
        affirmations: null,
        intentions: "id, workspaceId, focusPointId, symbolId",
        // Dexie aborts an upgrade that changes a table's primary key, so field
        // values move to a new table instead of being re-keyed in place. The
        // v1 `fieldValues` table is dropped right after its rows are copied.
        fieldValues: null,
        fieldValuesByEntity: "[entityId+fieldDefId], entityId, fieldDefId",
      })
      .upgrade(async (tx) => {
        const focuses = await tx.table("focusPoints").toArray();
        const focusWs = new Map(focuses.map((row) => [row.id as string, row.workspaceId as string]));
        for (const row of focuses) {
          await tx.table("focusPoints").put(focusDefaults(row as Record<string, unknown>));
        }
        const symbols = await tx.table("symbols").toArray();
        for (const row of symbols) {
          await tx.table("symbols").put({
            id: row.id,
            workspaceId: row.workspaceId,
            name: row.name,
            description: row.description,
            usage: row.usage,
            imageAssetId: (row.imageAssetId as string | null | undefined) ?? null,
          });
        }
        const affirmations = await tx.table("affirmations").toArray();
        const intentions: LegacyIntentionRow[] = affirmations.map((row) => {
          const focusPointId = (row.focusPointId as string | null | undefined) || null;
          return {
            id: row.id as string,
            workspaceId:
              (row.workspaceId as string | undefined) ??
              (focusPointId ? focusWs.get(focusPointId) : undefined) ??
              "",
            focusPointId,
            symbolId: (row.symbolId as string | null | undefined) ?? null,
            sortOrder: row.sortOrder as number,
            text: row.text as string,
            revision: 0,
            updatedAt: 0,
          };
        });
        if (intentions.length > 0) {
          await tx.table("intentions").bulkAdd(intentions);
        }
        const fieldDefs = await tx.table("fieldDefs").toArray();
        for (const row of fieldDefs) {
          await tx.table("fieldDefs").put({
            ...row,
            entityType: row.entityType === "focusPoint" ? "focusPoint" : "symbol",
          });
        }
        const oldValues = await tx.table("fieldValues").toArray();
        const migrated: FieldValue[] = [];
        for (const row of oldValues) {
          const entityId =
            (row.entityId as string | undefined) ?? (row.symbolId as string | undefined);
          if (!entityId) continue;
          migrated.push({
            entityId,
            fieldDefId: row.fieldDefId as string,
            text: (row.text as string) ?? "",
            revision: 0,
            updatedAt: 0,
          });
        }
        if (migrated.length > 0) {
          await tx.table("fieldValuesByEntity").bulkAdd(migrated);
        }
        const views = await tx.table("tableViews").toArray();
        for (const row of views) {
          const columnKeys = ((row.columnKeys as string[]) ?? []).map((key) =>
            key === "affirmations" ? "intentions" : key,
          );
          await tx.table("tableViews").put({ ...row, columnKeys });
        }
        const plans = await tx.table("plans").toArray();
        for (const row of plans) {
          await tx.table("plans").put({
            ...row,
            binauralEnabled: row.binauralEnabled !== false,
          });
        }
      });
    // A database created while v6 still declared the field-value primary-key
    // change never ran v6's upgrade, so it still holds the old `fieldValues`
    // table and has no `fieldValuesByEntity`. Dexie applies every version >= the
    // stored one, so this schema-less version re-runs v6's corrected diff for
    // those databases: the old table is dropped and the new one is created.
    // Their pre-existing rows are not copied (v6's upgrade does not re-run at the
    // same version); only development databases can be in that state.
    this.version(7).stores({});
    // Data-only version. Nothing changes in the schema; the stored names do.
    // `masterGain` became `masterVolume` everywhere else, and the two plans the
    // seed used to name after a "sit" are renamed so an existing database stops
    // using a word the product no longer uses. Rows already renamed are left
    // alone, and a plan the reader named something else is never touched.
    this.version(8)
      .stores({})
      .upgrade(async (tx) => {
        const preferences = await tx.table("preferences").toArray();
        for (const row of preferences) {
          const stored = row as Record<string, unknown>;
          const next: Record<string, unknown> = {
            ...stored,
            masterVolume: (stored.masterVolume as number | undefined) ??
              (stored.masterGain as number | undefined) ??
              0.7,
          };
          delete next.masterGain;
          await tx.table("preferences").put(next);
        }
        const renames = new Map([
          ["Circuit sit", "Circuit session"],
          ["Focus sit", "Focus session"],
        ]);
        const plans = await tx.table("plans").toArray();
        for (const row of plans) {
          const renamed = renames.get(row.name as string);
          if (renamed) {
            await tx.table("plans").put({ ...row, name: renamed });
          }
        }
      });
    // Data-only version. Nothing in the product is "mandatory" any more, so the
    // stored symbol rows stop carrying the flag: nothing reads it, and leaving
    // it behind would put a dead field in every catalog export.
    this.version(9)
      .stores({})
      .upgrade(async (tx) => {
        const symbols = await tx.table("symbols").toArray();
        for (const row of symbols) {
          const stored = row as Record<string, unknown>;
          if (!("isMandatory" in stored)) continue;
          const next = { ...stored };
          delete next.isMandatory;
          await tx.table("symbols").put(next);
        }
      });
    // Data-only version. `stopBinauralOnAlarm` was a per-plan field as well as a
    // preference, and the plan's copy was the one compile read — so the switch
    // in Settings did nothing to an existing plan. The preference is the single
    // source now, and stored plans stop carrying a copy that nothing reads.
    this.version(10)
      .stores({})
      .upgrade(async (tx) => {
        const plans = await tx.table("plans").toArray();
        for (const row of plans) {
          const stored = row as Record<string, unknown>;
          if (!("stopBinauralOnAlarm" in stored)) continue;
          const next = { ...stored };
          delete next.stopBinauralOnAlarm;
          await tx.table("plans").put(next);
        }
      });
    // Data-only version. A custom field gained a description, and the reader
    // types that instead of inventing a key: the stored definition gets the
    // empty column, and the key it already has stays exactly as it is — it is
    // what a table view's `columnKeys` name.
    this.version(11)
      .stores({})
      .upgrade(async (tx) => {
        const defs = await tx.table("fieldDefs").toArray();
        for (const row of defs) {
          const stored = row as Record<string, unknown>;
          if (typeof stored.description === "string") continue;
          await tx.table("fieldDefs").put({ ...stored, description: "" });
        }
      });
    // Data-only version. Preferences gained a revision, so a save can refuse a
    // write that another tab has already moved past instead of overwriting it
    // (the review, 2026-09-15). Stored rows start at 0, exactly like a stored plan.
    this.version(12)
      .stores({})
      .upgrade(async (tx) => {
        const preferences = await tx.table("preferences").toArray();
        for (const row of preferences) {
          const stored = row as Record<string, unknown>;
          if (typeof stored.revision === "number") continue;
          await tx.table("preferences").put({ ...stored, revision: 0 });
        }
      });
    // Data-only version. The catalogue rows carry a revision and the time
    // this device last wrote them, so a later sync can compare per row instead of
    // replacing a table wholesale. Rows stored before this start at 0, exactly
    // like a stored plan's first revision — the next save stamps one.
    this.version(13)
      .stores({})
      .upgrade(async (tx) => {
        const versioned = [
          "focusPoints",
          "symbols",
          "intentions",
          "fieldDefs",
          "fieldValuesByEntity",
          "tableViews",
          "presets",
          "mediaAssets",
        ];
        for (const name of versioned) {
          for (const row of await tx.table(name).toArray()) {
            const stored = row as Record<string, unknown>;
            if (typeof stored.revision === "number" && typeof stored.updatedAt === "number") {
              continue;
            }
            await tx.table(name).put({
              ...stored,
              revision: stored.revision ?? 0,
              updatedAt: stored.updatedAt ?? 0,
            });
          }
        }
      });
    // The events table, because a client error has to land somewhere the owner
    // can look. A new table rather than a data-only upgrade: nothing stored
    // before this version has an event in it (the review's error-capture finding,
    // the analytics table with `client_error` as its first event type).
    this.version(14).stores({
      events: "id, workspaceId, occurredAt",
    });
    // The Database's two new tables, and the two the Entries table replaces.
    //
    // `focusSymbolBindings` and `tableViews` are **dropped**, not re-keyed: a pair
    // is a row now, and what a session shows is the plan's own display. The
    // dropped tables are still readable inside the version that drops them, which
    // is where every stored pair becomes an entry — so no association and no
    // ordering is lost.
    //
    // The ids are minted here rather than derived from the pair. This is a
    // migration of rows a device already holds, not a seed: nothing else agrees
    // about these ids yet (the SQL backfill mints its own), and reconciling two
    // devices' rows is sync proper's job (the revision is what it compares).
    this.version(15)
      .stores({
        focusSymbolBindings: null,
        tableViews: null,
        entries: "id, workspaceId, focusPointId, symbolId",
        fieldOptions: "id, workspaceId, fieldDefId",
        intentions: "id, workspaceId, entryId",
      })
      .upgrade(async (tx) => {
        const workspaceOf = new Map<string, string>();
        for (const row of await tx.table("focusPoints").toArray()) {
          workspaceOf.set(row.id as string, row.workspaceId as string);
        }
        for (const row of await tx.table("symbols").toArray()) {
          workspaceOf.set(
            row.id as string,
            (row.workspaceId as string | undefined) ?? "",
          );
        }

        const pairKey = (focusPointId: string | null, symbolId: string | null) =>
          `${focusPointId ?? ""}:${symbolId ?? ""}`;
        const entries = new Map<string, Entry>();
        const entryFor = (
          focusPointId: string | null,
          symbolId: string | null,
          sortOrder: number,
          fallbackWorkspace: string,
        ): Entry => {
          const key = pairKey(focusPointId, symbolId);
          const existing = entries.get(key);
          if (existing) return existing;
          // This body writes the row as v15's store held it — `focusPointId`, the
          // field name of its own time — and v18 is the version that renames it.
          // A historical upgrade is a record of a past shape, not a view of the
          // current one, which is why this one row is cast rather than retyped.
          const entry = {
            id: crypto.randomUUID(),
            workspaceId:
              (focusPointId ? workspaceOf.get(focusPointId) : undefined) ??
              (symbolId ? workspaceOf.get(symbolId) : undefined) ??
              fallbackWorkspace,
            focusPointId,
            symbolId,
            sortOrder,
            archivedAt: null,
            revision: 0,
            updatedAt: 0,
          } as unknown as Entry;
          entries.set(key, entry);
          return entry;
        };

        for (const row of await tx.table("focusSymbolBindings").toArray()) {
          entryFor(
            row.focusPointId as string,
            row.symbolId as string,
            (row.sortOrder as number | undefined) ?? 0,
            "",
          );
        }

        const repointed: Intention[] = [];
        for (const row of await tx.table("intentions").toArray()) {
          const focusPointId = (row.focusPointId as string | null | undefined) ?? null;
          const symbolId = (row.symbolId as string | null | undefined) ?? null;
          // A line that pointed at nothing has no row to belong to and no box to
          // be shown in. It cannot survive the change (the SQL migration says the
          // same), and the application no longer creates one.
          if (!focusPointId && !symbolId) continue;
          const workspaceId = (row.workspaceId as string | undefined) ?? "";
          const entry = entryFor(
            focusPointId,
            symbolId,
            (row.sortOrder as number | undefined) ?? 0,
            workspaceId,
          );
          repointed.push({
            id: row.id as string,
            workspaceId: workspaceId || entry.workspaceId,
            entryId: entry.id,
            sortOrder: (row.sortOrder as number | undefined) ?? 0,
            text: (row.text as string) ?? "",
            archivedAt: null,
            revision: (row.revision as number | undefined) ?? 0,
            updatedAt: (row.updatedAt as number | undefined) ?? 0,
          });
        }

        const created = [...entries.values()];
        if (created.length > 0) await tx.table("entries").bulkPut(created);
        // Rewritten rather than patched: `put` replaces the whole row, which is how
        // a line stops carrying the two reference columns it no longer has.
        await tx.table("intentions").clear();
        if (repointed.length > 0) await tx.table("intentions").bulkAdd(repointed);

        // A row's place is derived from its own name and id, the same way the SQL
        // backfill derives it, so the two descriptions of the product agree.
        const stampRecords = async (table: string) => {
          const rows = await tx.table(table).toArray();
          const sorted = [...rows].sort((a, b) =>
            `${a.name as string}\u0000${a.id as string}`.localeCompare(
              `${b.name as string}\u0000${b.id as string}`,
            ),
          );
          for (const [index, row] of sorted.entries()) {
            const stored = row as Record<string, unknown>;
            await tx.table(table).put({
              ...stored,
              sortOrder: index,
              archivedAt: stored.archivedAt ?? null,
            });
          }
        };
        await stampRecords("focusPoints");
        await stampRecords("symbols");
        await stampRecords("presets");

        // `entity_type` said which table a column belonged to; `scope` says it and
        // admits the third one (a pair). The types the grid edits arrive with it.
        for (const row of await tx.table("fieldDefs").toArray()) {
          const stored = row as Record<string, unknown>;
          const next: Record<string, unknown> = {
            ...stored,
            scope:
              stored.scope ?? (stored.entityType === "focusPoint" ? "focusPoint" : "symbol"),
            cellType: stored.cellType ?? "text",
            refKind: stored.refKind ?? null,
            archivedAt: stored.archivedAt ?? null,
          };
          delete next.entityType;
          await tx.table("fieldDefs").put(next);
        }

        // A plan stored before this version has no display; `{}` is "use the app's
        // own default", which is the symbol's description and usage — the columns
        // the old default table view showed.
        for (const row of await tx.table("plans").toArray()) {
          const stored = row as Record<string, unknown>;
          if (typeof stored.displayJson === "string") continue;
          await tx.table("plans").put({ ...stored, displayJson: "{}" });
        }
      });

    /**
     * The catalogue's own order, renumbered — the owner's round 14.
     *
     * "I want the data grouped by chakra, right now it is arranged according to
     * symbol", with the symbol and point orders beside it. This is the **data**,
     * not a comparator, and deliberately so: the grid sorts by `sortOrder`, so a
     * reader who drags a row afterwards still wins.
     *
     * Version 15 alphabetised the records (`stampRecords`) and, before it, each
     * chakra's `sortOrder` restarted at 0 — which is why the pairs interleaved by
     * place rather than following one another — so a device that already holds rows
     * needs this as much as a fresh one needs the seed's own arrays.
     *
     * A name is the only handle on a row that already exists, so the lists in
     * `catalog-order.ts` match by name, case-insensitively, and a row that is in
     * none of them keeps its place after every named one.
     */
    this.version(16)
      .stores({})
      .upgrade(async (tx) => {
        const last = Number.MAX_SAFE_INTEGER;
        /** Renumbers one table against a name list, unlisted rows last. */
        const renumber = async (table: string, order: readonly (readonly string[])[]) => {
          const rows = await tx.table(table).toArray();
          const ranked = rows
            .map((row, index) => ({ row, index, rank: rankOf(order, row.name as string) }))
            .sort((a, b) => a.rank - b.rank || a.index - b.index);
          for (const [place, item] of ranked.entries()) {
            if ((item.row.sortOrder as number | undefined) === place) continue;
            await tx.table(table).put({ ...item.row, sortOrder: place });
          }
        };
        await renumber("focusPoints", FOCUS_ORDER);
        await renumber("symbols", SYMBOL_ORDER);

        // The pairs follow: every row of the first chakra, then the next, with the
        // symbols in their own order inside each one — the same walk the seed does.
        // Both maps are read *after* the renumber above, so their `sortOrder` is
        // already the place their name asked for.
        const focusPlace = new Map(
          (await tx.table("focusPoints").toArray()).map((row) => [
            row.id as string,
            (row.sortOrder as number | undefined) ?? last,
          ]),
        );
        const symbolPlace = new Map(
          (await tx.table("symbols").toArray()).map((row) => [
            row.id as string,
            (row.sortOrder as number | undefined) ?? last,
          ]),
        );
        const ordered = (await tx.table("entries").toArray())
          .map((row, index) => ({ row, index }))
          .sort(
            (a, b) =>
              (focusPlace.get(a.row.focusPointId as string) ?? last) -
                (focusPlace.get(b.row.focusPointId as string) ?? last) ||
              (symbolPlace.get(a.row.symbolId as string) ?? last) -
                (symbolPlace.get(b.row.symbolId as string) ?? last) ||
              ((a.row.sortOrder as number | undefined) ?? 0) -
                ((b.row.sortOrder as number | undefined) ?? 0) ||
              a.index - b.index,
          );
        for (const [place, item] of ordered.entries()) {
          if ((item.row.sortOrder as number | undefined) === place) continue;
          await tx.table("entries").put({ ...item.row, sortOrder: place });
        }
      });

    /**
     * Version 17: a meditation type is a row (the owner's round 15).
     *
     * A stored device has no `meditationTypes` table at all, and every meditation
     * carries the old `kind` — a word, not a row. The four seeded types are written
     * first (their ids are the domain's constants, so two devices agree), then each
     * stored meditation is pointed at the type its `kind` meant. `custom` was only
     * ever the seeded Protection; anything else a reader had marked custom was a
     * meditation that is not a chakra, so it lands on Point — an upgrade is not the
     * place to throw a row away.
     *
     * A column (`fieldDefs`) is typed too: `Governs` and `Element` belong to the
     * Chakra type, and every column a reader added belongs to all of them.
     */
    this.version(17)
      .stores({ meditationTypes: "id, workspaceId" })
      .upgrade(async (tx) => {
        const types = await tx.table("meditationTypes").toArray();
        const known = new Set(types.map((row) => row.id as string));
        for (const [sortOrder, seeded] of SEEDED_MEDITATION_TYPES.entries()) {
          if (known.has(seeded.id)) continue;
          await tx.table("meditationTypes").add({
            ...seeded,
            sortOrder,
            archivedAt: null,
            revision: 0,
            updatedAt: 0,
          });
        }
        for (const row of await tx.table("focusPoints").toArray()) {
          if (typeof row.typeId === "string" && row.typeId) continue;
          const { kind, ...rest } = row as { kind?: unknown };
          await tx.table("focusPoints").put({
            ...rest,
            typeId: typeIdForLegacyKind(kind, row.name as string),
          });
        }
        for (const row of await tx.table("fieldDefs").toArray()) {
          if (row.typeId !== undefined) continue;
          await tx.table("fieldDefs").put({
            ...row,
            typeId: CHAKRA_COLUMN_KEYS.has(row.key as string) ? CHAKRA_TYPE_ID : null,
          });
        }
      });

    /**
     * The owner's round 15 (2026-09-19): `focus_points` became `meditations`, and the field
     * that names one became `meditationId`.
     *
     * A table's name cannot change in a Dexie upgrade, so the old store is declared
     * null here and a new one is created and filled inside the same version — the
     * pattern v6 used for `fieldValues` → `fieldValuesByEntity`. Three more things
     * move with the word, and all of them are data rather than declarations:
     *
     * - `entries` is *indexed* by the field, so its index string changes with it and
     *   every row is rewritten. `symbols` and `intentions` have carried the field
     *   since before they dropped it from their indexes, so the rewrite is offered
     *   to them too rather than assumed.
     * - `fieldDefs.scope` and `fieldDefs.refKind` are stored unions whose
     *   `focusPoint` member is now `meditation`.
     * - a plan's blocks live in `plans.blocksJson`, which Dexie does not index, so
     *   that one is mapped on read (`plan-mapper.ts`) instead of rewritten here —
     *   the same treatment `display`'s `chakra` area gets in the domain.
     */
    this.version(18)
      .stores({
        focusPoints: null,
        meditations: "id, workspaceId",
        entries: "id, workspaceId, meditationId, symbolId",
      })
      .upgrade(async (tx) => {
        const renameField = async (table: string, from: string, to: string) => {
          for (const row of await tx.table(table).toArray()) {
            if (!(from in row)) continue;
            const stored = row as Record<string, unknown>;
            const value = stored[from];
            delete stored[from];
            await tx.table(table).put({ ...stored, [to]: value ?? null });
          }
        };

        for (const row of await tx.table("focusPoints").toArray()) {
          await tx.table("meditations").put(row);
        }
        await renameField("entries", "focusPointId", "meditationId");
        await renameField("symbols", "focusPointId", "meditationId");
        await renameField("intentions", "focusPointId", "meditationId");

        for (const row of await tx.table("fieldDefs").toArray()) {
          const scope = row.scope === "focusPoint" ? "meditation" : row.scope;
          const refKind = row.refKind === "focusPoint" ? "meditation" : row.refKind;
          if (scope === row.scope && refKind === row.refKind) continue;
          await tx.table("fieldDefs").put({ ...row, scope, refKind });
        }
      });

    /**
     * Version 19: the four seeded types get the workspace they were never given.
     *
     * v17 added them as `{ ...seeded, sortOrder, archivedAt, revision, updatedAt }`
     * — and `SEEDED_MEDITATION_TYPES` holds only `{ id, name }`, so `workspaceId`
     * was never written. Every read scopes by it, and a row with no key in the
     * index is never returned, so on every device that existed before round 15 the
     * types were invisible: no library tabs, no tile groups, no `Type` column, and
     * the strip fell through to its first fixed tab. A device that arrived *after*
     * the round never noticed, because the seed sets the field — only the upgrade
     * path forgot.
     *
     * v17 is deliberately not edited. It has already run on every affected device
     * and Dexie does not re-run a version, so a change there would repair nobody;
     * the repair is a new version instead. The rule lives in `scopedSeededTypes`,
     * which is where it is tested — `tests/unit/db/meditation-type-scope.test.ts`.
     */
    this.version(19)
      .stores({})
      .upgrade(async (tx) => {
        const workspaces = await tx.table("workspaces").toArray();
        if (workspaces.length === 0) return;
        const existing = await tx.table("meditationTypes").toArray();
        for (const row of scopedSeededTypes(workspaces, existing)) {
          await tx.table("meditationTypes").put(row);
        }
      });

    /**
     * Stages (the owner's round 15, 2026-09-19): every type has a template and a block has
     * as many timers as its meditation's type says.
     *
     * A **repair**, like v19, because a version that has already run is never re-run
     * — a device that upgraded to v17 has type rows with no `stages` field at all,
     * and every read of one would answer with a template of nothing.
     *
     * Two of the three reshapes are here:
     *
     * - a type row with no `stages` gets its seeded template (or an empty list for a
     *   type the reader added, which the reader then fills in);
     * - a meditation row with no `stages` field is set to `null`, which means "follow
     *   my type" — a seeded one is given its own copy of its type's template, because
     *   the owner's §12.8 wants chakras tuneable one row at a time.
     *
     * A plan's blocks live in `plans.blocksJson`, which Dexie does not index, so their
     * single stored `durationMs` is read as one stage of that length on the way in
     * (`parsePlanBlocks`) rather than rewritten here — the same treatment the
     * rename's old field got in v18.
     */
    this.version(20)
      .stores({})
      .upgrade(async (tx) => {
        const seeded = new Map(SEEDED_MEDITATION_TYPES.map((row) => [row.id, row.stages]));
        for (const row of await tx.table("meditationTypes").toArray()) {
          if (Array.isArray(row.stages)) continue;
          await tx.table("meditationTypes").put({
            ...row,
            stages: copyStages(seeded.get(row.id as string) ?? []),
          });
        }
        for (const row of await tx.table("meditations").toArray()) {
          if (row.stages !== undefined) continue;
          const template = seeded.get(row.typeId as string);
          await tx.table("meditations").put({
            ...row,
            stages: template ? copyStages(template) : null,
          });
        }
      });

    /**
     * Cool-off is deleted (the owner's round 15, 2026-09-19).
     *
     * A **repair** over `plans`, because a plan's blocks are JSON in a column Dexie
     * does not index: a device that ran v20 still holds the blocks, and reading them
     * is not the same as being rid of them — `parsePlanBlocks` drops a cool-off block
     * on the way in, but the row would keep it until the plan was next saved, and a
     * plan nobody edits is most of them. The repair rewrites the array the reader
     * actually has: each surviving block keeps everything it had except the `type`
     * the domain no longer has.
     *
     * Guarded on the stored JSON being an array, because a row whose JSON is damaged
     * is `planFromRow`'s to report, not an upgrade's to throw over.
     */
    this.version(21)
      .stores({})
      .upgrade(async (tx) => {
        for (const row of await tx.table("plans").toArray()) {
          const raw = row.blocksJson as string | undefined;
          if (!raw) continue;
          let parsed: unknown;
          try {
            parsed = JSON.parse(raw);
          } catch {
            continue;
          }
          if (!Array.isArray(parsed)) continue;
          const kept = parsed
            .filter((block): block is Record<string, unknown> => {
              return block !== null && typeof block === "object" && !Array.isArray(block);
            })
            .filter((block) => block.type !== "cooloff")
            .map((block) => {
              // The `type` the domain no longer has is dropped with the block kind
              // it named: a block is a meditation block, and nothing reads it.
              const { type, ...rest } = block;
              void type;
              return rest;
            });
          await tx.table("plans").put({ ...row, blocksJson: JSON.stringify(kept) });
        }
      });

    /**
     * Affirmations (the owner's round 15, 2026-09-19).
     *
     * A new table, so this version is a declaration and nothing else: a device that
     * has never had one gets an empty store, and the reader's own sentences are
     * theirs to write. The seeded catalogue carries none (§13.12).
     */
    this.version(22).stores({ affirmations: "id, workspaceId" });

    /**
     * The sentences are one table (the owner's round 16, §2.1).
     *
     * An affirmation and an intention were two tables with a rule between them — a
     * block read every affirmation, and a line belonged to a pair. They are one now:
     * a sentence, optionally written about a pair, and an affirmation is exactly the
     * sentence that is written about nothing yet.
     *
     * So this version **moves the rows and keeps their ids**, which is the whole
     * reason it is a repair rather than a re-creation: a field value hangs on
     * `entityId`, and the Affirmations table's columns were stored against the very
     * row that is moving. Keeping the id keeps every column with it. The new field,
     * `entryId`, is `null` on every moved row, because that is what an affirmation
     * was: a sentence with no pair.
     */
    this.version(23)
      .stores({ affirmations: null })
      .upgrade(async (tx) => {
        /**
         * A device that arrives from **before v22** has nothing here to move, and
         * asking for the table is what broke it: Dexie applies v22's create and this
         * version's delete inside the one version-change transaction, so the store is
         * already gone by the time this runs — and `tx.table("affirmations")` then
         * threw, which rejected the transaction, aborted the open, and left every
         * screen of the app waiting at "Loading…" for ever (nothing re-runs an
         * upgrade that never completed, so such a device could never start again).
         *
         * The store only has rows to move on a device that *did* run v22 — where it
         * existed before this open, and therefore reads normally. So the read is the
         * one place the two devices differ, and a table that cannot be read is a table
         * with nothing in it: `null` never reached the reader, and no row is lost.
         */
        let rows: unknown[];
        try {
          rows = await tx.table("affirmations").toArray();
        } catch {
          return;
        }
        for (const row of rows) {
          await tx.table("intentions").put({ ...(row as Record<string, unknown>), entryId: null });
        }
      });

    /**
     * A symbol carries a reiki system, and four rows join the catalogue (the
     * owner's round 16, §2.5 and §6).
     *
     * **A repair, and it has to be**, which is what makes this a version rather than
     * an edit: v16 placed this catalogue on the owner's device and Dexie never re-runs
     * a version, so a device that has one would otherwise keep eight symbols with no
     * system any of them names. v23 above is left exactly as it is for the same
     * reason — its `affirmations` move has already happened, and editing it would
     * repair nobody.
     *
     * The rule is `symbolsWithReikiSystems`, which is where it is tested
     * (`tests/unit/db/reiki-symbols.test.ts`) — IndexedDB is not available in the unit
     * suite, so the pure half carries the reasoning and this stays one line. The same
     * three mirrors: `default-workspace.ts` writes this for a fresh device and
     * `supabase/migrations/20260920140000_symbol_reiki_system.sql` for the cloud
     * tables, and `SYMBOL_ORDER` is the order all three agree on.
     */
    this.version(24)
      .stores({})
      .upgrade(async (tx) => {
        const existing = await tx.table("symbols").toArray();
        for (const row of symbolsWithReikiSystems(existing)) {
          await tx.table("symbols").put(row);
        }
      });

    /**
     * Two stored values the app itself wrote, put right where they are wrong
     * (the owner's round 17).
     *
     * **A repair, not a migration**, for the reason v24's note gives: a device that
     * has run a version never runs it again, so a default that was written wrong
     * into somebody's data has to be corrected by a *later* version or it stays
     * wrong for ever.
     *
     * - **`autoScroll`.** The flag is stored per stage, so a plan written by an
     *   older build — where the answer for a stage of a *scrolling* kind defaulted
     *   to `false` — kept that value, while a plan made today starts with the kind's
     *   own answer. The owner saw the result as two plans behaving differently on
     *   the same stage of the same chakra: *"Some chakra sessions have auto-scroll
     *   and some don't … we need this to be consistent."* `withAutoScroll` is the
     *   rule, and it is tested on its own (`tests/unit/domain/stages.test.ts`)
     *   because IndexedDB does not exist in the unit suite. A reader's own press
     *   still wins from here on: the repair runs exactly once.
     * - **The alarm.** `alarmEnabled: true` is what the seed and the preference row
     *   carried, so a reader who never asked for an alarm got one ringing at every
     *   block's end. Only the two rows **this app wrote** are corrected — the seeded
     *   preference and the seeded plan — and a plan the reader made keeps whatever it
     *   carries, because their own switch is not the app's to overrule.
     * - **The Display.** Round 17 turned a chakra's `Location` column on by default
     *   (`DEFAULT_PLAN_DISPLAY`), which is what put the chakra's own panel back on the
     *   run screen — but a stored plan carries its display as JSON, so a device that
     *   already had one kept the old default and would still have shown nothing.
     *   `isAppDefaultDisplay` is the gate: a display the reader has arranged is left
     *   exactly as it is.
     */
    this.version(25)
      .stores({})
      .upgrade(async (tx) => {
        for (const table of ["meditationTypes", "meditations"] as const) {
          const rows = await tx.table(table).toArray();
          for (const row of rows) {
            if (!Array.isArray(row.stages)) continue;
            await tx.table(table).put({ ...row, stages: withAutoScroll(row.stages) });
          }
        }
        const plans = await tx.table("plans").toArray();
        for (const row of plans) {
          let blocks: unknown;
          try {
            blocks = JSON.parse(row.blocksJson);
          } catch {
            // A row whose blocks will not parse is already broken in a way this
            // version cannot help with, and `planFromRow` says so rather than
            // silently reading a plan with no blocks.
            continue;
          }
          const repaired = Array.isArray(blocks)
            ? blocks.map((block) =>
                block && typeof block === "object" && Array.isArray(block.stages)
                  ? { ...block, stages: withAutoScroll(block.stages) }
                  : block,
              )
            : blocks;
          let displayJson = row.displayJson;
          try {
            const stored: unknown = JSON.parse(row.displayJson ?? "");
            if (isAppDefaultDisplay(normalizePlanDisplay(stored))) {
              displayJson = JSON.stringify(DEFAULT_PLAN_DISPLAY);
            }
          } catch {
            // No display at all is the same case as the old default: the app has
            // never been asked, so it answers with today's answer.
            displayJson = JSON.stringify(DEFAULT_PLAN_DISPLAY);
          }
          await tx.table("plans").put({
            ...row,
            blocksJson: JSON.stringify(repaired),
            displayJson,
            ...(row.id === DEFAULT_PLAN_ID ? { alarmEnabled: DEFAULT_ALARM_ENABLED } : {}),
          });
        }
        const preferences = await tx.table("preferences").toArray();
        for (const row of preferences) {
          if (row.alarmEnabled === undefined) continue;
          await tx.table("preferences").put({ ...row, alarmEnabled: DEFAULT_ALARM_ENABLED });
        }
      });

    /**
     * Audio files gain an order (`P2 · 4`, the owner's answer 2026-09-21).
     *
     * A row stored before the column existed has no `sortOrder`, and the seed cannot
     * help a device that already holds files: it only ever runs once, on a device
     * with none. `assetsWithOrder` is the rule and `tests/unit/db/asset-order.test.ts`
     * proves it, because IndexedDB is not in the unit suite — the same split v24's
     * and v25's repairs use.
     */
    this.version(26)
      .stores({})
      .upgrade(async (tx) => {
        const existing = await tx.table("mediaAssets").toArray();
        for (const row of assetsWithOrder(existing)) {
          await tx.table("mediaAssets").put(row);
        }
      });

    /**
     * The catalogue's rows gain the delete mark (`P2 · 3`, the schema slice).
     *
     * `deletedAt` is what lets a delete travel as a row rather than as an absence,
     * and this version writes it into the rows a device already holds: nothing
     * downstream should have to tell "not deleted" from "never asked", and a stored
     * row that says `null` says it once rather than at every read. The SQL adds the
     * same column to the same ten tables, with the index a pull reads
     * (`20260921140000_sync_delete_marks.sql`); the two lists are kept equal by
     * `tests/unit/architecture/sync-marks.test.ts`.
     *
     * A row that already carries a mark keeps it — a device at this version has
     * nothing to correct — and `plans` is deliberately not in the list: a plan is
     * versioned by `revision` alone, so its tombstone is the plan repository's
     * decision in the slice that adds its cloud adapter rather than a guess here.
     */
    this.version(27)
      .stores({})
      .upgrade(async (tx) => {
        for (const table of [
          "focusPoints",
          "symbols",
          "intentions",
          "fieldDefs",
          "fieldOptions",
          "fieldValuesByEntity",
          "presets",
          "mediaAssets",
          "entries",
          "meditationTypes",
        ] as const) {
          const rows = await tx.table(table).toArray();
          for (const row of rows) {
            if (row.deletedAt !== undefined) continue;
            await tx.table(table).put({ ...row, deletedAt: null });
          }
        }
      });

    /**
     * The watermark store (`P2 · 3`, slice 3).
     *
     * A **new table**, which is the one shape an upgrade is safe with: nothing is
     * re-keyed, renamed or backfilled, and a device that has never synced simply has no
     * row in it — the protocol reads a missing mark as "nothing has travelled yet",
     * which is the truth. One row per table, keyed by the store's own name.
     */
    this.version(28).stores({ syncState: "table" });

    /**
     * The account's flags, mirrored (`P0 · 23`, slice 23c).
     *
     * A **new table**, the one shape an upgrade is safe with, and the mirror is written
     * only from an accepted cloud read (`flags-cache.ts`) — so a device that has never
     * read them has no row, which is the truth rather than an empty answer: the defaults
     * are what an absent row means and they are what the app already draws.
     *
     * Keyed by `userId`, not by workspace: the flags belong to the *account* (the owner's
     * answer, `DECISIONS.md` §11), and an account is not a workspace.
     */
    this.version(29).stores({ accountFlags: "userId" });

    /**
     * Two changes to what the seed plants, carried to a device that already seeded itself
     * (the owner's round 20).
     *
     * A seed runs once, so neither change reaches a device that has one — which is v24's
     * whole reason for existing. Both rules live in `seeded-circuit.ts` as pure functions
     * because the unit suite has no IndexedDB, and both are gated on the rows still
     * looking like the ones the app wrote: the Thanks Giving stage is only moved while it
     * is still exactly 3:00, and the Crown block is only removed by the id the seed gave
     * it, so a reader's own press is never the thing being repaired.
     */
    this.version(30)
      .stores({})
      .upgrade(async (tx) => {
        const [types, meditations, plans] = await Promise.all([
          tx.table("meditationTypes").toArray(),
          tx.table("meditations").toArray(),
          tx.table("plans").toArray(),
        ]);
        const minute = thanksGivingMinute({
          types,
          meditations,
          // **The store keeps a plan's blocks as JSON**, so a row is not a plan: the
          // mapper is the one place that knows both shapes. Reading the rows straight into
          // the rule left `plan.blocks` undefined, which threw inside the upgrade and
          // aborted the open — the whole upgrade path below the newest version is untested
          // by construction (every test starts from an empty database), which is why the
          // type system did not catch it either: `tx.table(name)` is untyped.
          plans: plans.map(planFromRow),
        });
        const stored = new Map(plans.map((row) => [row.id, row]));
        for (const [table, rows] of [
          ["meditationTypes", minute.types],
          ["meditations", minute.meditations],
          [
            "plans",
            withoutSeededCrown(minute.plans).map((plan) => ({
              ...planRowForStore(plan),
              // A repair is not a save: the row keeps its own timestamp, and its delete
              // mark, so a plan the reader deleted is not resurrected by it.
              updatedAt: stored.get(plan.id)?.updatedAt ?? Date.now(),
              deletedAt: stored.get(plan.id)?.deletedAt ?? null,
            })),
          ],
        ] as const) {
          for (const row of rows) await tx.table(table).put(row);
        }
      });

    /**
     * The twelve body points, their sentences, and the four reiki symbols bound to every
     * chakra and point (the owner's round 21).
     *
     * The same reason v30 exists: the seed runs once, so what it plants reaches a fresh
     * device and nobody else. Both rules are pure functions in `seeded-points.ts` and
     * `seeded-bindings.ts` — the unit suite has no IndexedDB — and both add only what the
     * store does not already hold, matched by id and then by name, which is the one case that
     * matters here: the owner's own `Thighs`, created by hand in round 20, *is* the point, so
     * it keeps its row and gains the sentences rather than being joined by a second one.
     *
     * The points are written before the bindings are decided, so a point planted by this
     * version is bound by this version rather than by one that never runs.
     */
    this.version(31)
      .stores({})
      .upgrade(async (tx) => {
        const [meditations, symbols, entries, intentions] = await Promise.all([
          tx.table("meditations").toArray(),
          tx.table("symbols").toArray(),
          tx.table("entries").toArray(),
          tx.table("intentions").toArray(),
        ]);
        const points = withSeededPoints({ meditations, entries, intentions });
        for (const row of points.meditations) await tx.table("meditations").put(row);
        for (const row of points.entries) await tx.table("entries").put(row);
        for (const row of points.intentions) await tx.table("intentions").put(row);

        const bindings = withReikiBindings({
          meditations: [...meditations, ...points.meditations],
          symbols,
          entries: [...entries, ...points.entries],
        });
        for (const row of bindings.entries) await tx.table("entries").put(row);
      });

    /**
     * `Thyroid and thymus` is two points, and the owner said so (round 22).
     *
     * One of round 21's twelve rows was two places written as one, so the seed writes
     * thirteen. The row the app wrote is renamed to `Thyroid` and keeps its id — every other
     * device knows it by that id — and `Thymus` is a row the walk in `withSeededPoints`
     * plants beside it, which is why that walk takes its order from
     * `pointsInCatalogueOrder()` rather than from the array it reads, and why a missing point
     * now moves the rows after it up by one instead of landing at the tail.
     *
     * Both halves are gated on the rows still looking like the ones the app wrote: a name or
     * a sentence the reader has changed is left alone. The four reiki symbols `Thyroid`
     * already carries are its own rows, and `Thymus` gets its four the way every other point
     * did.
     */
    this.version(32)
      .stores({})
      .upgrade(async (tx) => {
        const [meditations, symbols, entries, intentions] = await Promise.all([
          tx.table("meditations").toArray(),
          tx.table("symbols").toArray(),
          tx.table("entries").toArray(),
          tx.table("intentions").toArray(),
        ]);
        const split = splitThyroidAndThymus({ meditations, entries, intentions });
        for (const row of split.meditations) await tx.table("meditations").put(row);
        for (const row of split.intentions) await tx.table("intentions").put(row);

        // The planting walk has to see the renamed row, or it would look for `Thyroid` under
        // a name the store no longer uses.
        const current = withChanges(meditations, split.meditations);
        const lines = withChanges(intentions, split.intentions);
        const points = withSeededPoints({ meditations: current, entries, intentions: lines });
        for (const row of points.meditations) await tx.table("meditations").put(row);
        for (const row of points.entries) await tx.table("entries").put(row);
        for (const row of points.intentions) await tx.table("intentions").put(row);

        const bindings = withReikiBindings({
          meditations: withChanges(current, points.meditations),
          symbols,
          entries: [...entries, ...points.entries],
        });
        for (const row of bindings.entries) await tx.table("entries").put(row);
      });

    /**
     * The **points circuit** — the owner's round 22.
     *
     * The same reason v30 and v31 exist: the seed runs once, so a plan it plants reaches a
     * fresh device and nobody else. The rule is a pure function in `seeded-plans.ts` — the
     * unit suite has no IndexedDB — and it plants the plan only when the store holds the
     * app's own points, matched by the id the seed gives the plan so a reader who renamed,
     * edited or deleted their own circuit is never handed a second one.
     *
     * The rows go through the plan mappers, the way v30's fix does: the store keeps a plan's
     * blocks as JSON (`PlanRow`) and the rule works on the plan.
     */
    this.version(33)
      .stores({})
      .upgrade(async (tx) => {
        const [meditations, plans] = await Promise.all([
          tx.table("meditations").toArray(),
          tx.table("plans").toArray(),
        ]);
        const planted = withSeededPointsCircuit({
          meditations,
          plans: plans.map(planFromRow),
        });
        for (const plan of planted) await tx.table("plans").put(planRowForStore(plan));
      });

    /**
     * `Pancreas and spleen` is two points, and the owner said so (round 25).
     *
     * The same shape as v32's split: the row the app wrote is renamed to `Pancreas` and keeps
     * its id — every other device knows it by that id — and `Spleen` is a row the walk in
     * `withSeededPoints` plants beside it, with the whole of a point: its own symbol-less row,
     * its sentences, and its four reiki bindings.
     *
     * Both halves are gated on the rows still looking like the ones the app wrote: a name or a
     * sentence the reader has changed is left alone.
     */
    this.version(34)
      .stores({})
      .upgrade(async (tx) => {
        const [meditations, symbols, entries, intentions] = await Promise.all([
          tx.table("meditations").toArray(),
          tx.table("symbols").toArray(),
          tx.table("entries").toArray(),
          tx.table("intentions").toArray(),
        ]);
        const split = splitPancreasAndSpleen({ meditations, entries, intentions });
        for (const row of split.meditations) await tx.table("meditations").put(row);
        for (const row of split.intentions) await tx.table("intentions").put(row);

        // The planting walk has to see the renamed row, or it would look for `Pancreas` under a
        // name the store no longer uses — and `withChanges` hands the walk's own additions on to
        // the bindings below, which is what gives `Spleen` its four symbols.
        const current = withChanges(meditations, split.meditations);
        const lines = withChanges(intentions, split.intentions);
        const points = withSeededPoints({ meditations: current, entries, intentions: lines });
        for (const row of points.meditations) await tx.table("meditations").put(row);
        for (const row of points.entries) await tx.table("entries").put(row);
        for (const row of points.intentions) await tx.table("intentions").put(row);

        const bindings = withReikiBindings({
          meditations: withChanges(current, points.meditations),
          symbols,
          entries: [...entries, ...points.entries],
        });
        for (const row of bindings.entries) await tx.table("entries").put(row);
      });

    /**
     * The points circuit is five groups, each with its own timers and its own tone (round 25).
     *
     * The owner's grouping: the head's three points, the throat's four, the organs' four, the
     * legs' three and the feet's two — 1:00 of intentions, 1:00 of symbols, and a focus of one
     * minute a point with a three-minute floor. The rule lives in `seeded-plans.ts`; this
     * version is what carries it to a device that already holds round 22's circuit, whose blocks
     * are rewritten whether or not the reader has touched them. That is the owner's answer —
     * *"regroup always"* — and it is the tree's one repair that may overrule a press.
     *
     * A marked plan is not resurrected: `deletedAt` is read here and only live rows are handed
     * in. A tone is named only when the store still holds that preset, because `requireListed`
     * fails hard on a missing reference and a plan that refuses to start is worse than a silent
     * block.
     */
    this.version(35)
      .stores({})
      .upgrade(async (tx) => {
        const [meditations, planRows, presets] = await Promise.all([
          tx.table("meditations").toArray(),
          tx.table("plans").toArray(),
          tx.table("presets").toArray(),
        ]);
        const regrouped = regroupSeededPointsCircuit({
          meditations,
          plans: planRows.filter((row) => row.deletedAt == null).map(planFromRow),
          presetIds: presets.map((row) => row.id as string),
        });
        for (const plan of regrouped) await tx.table("plans").put(planRowForStore(plan));
      });
  }
}

export const db = new MeditaurDB();
