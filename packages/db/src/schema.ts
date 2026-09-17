import Dexie, { type EntityTable, type Table } from "dexie";
import type {
  BinauralPreset,
  FieldDef,
  FieldValue,
  FocusPoint,
  FocusSymbolBinding,
  Intention,
  MediaAsset,
  Plan,
  SessionSnapshot,
  Symbol,
  TableView,
  UserPreferences,
  Workspace,
  WorkspaceMember,
  SessionLog,
} from "@meditaur/domain";

export type PlanRow = Omit<Plan, "blocks"> & {
  blocksJson: string;
  updatedAt: number;
};

export type SnapshotRow = SessionSnapshot & { updatedAt: number };

export type MediaBlobRow = {
  id: string;
  bytes: ArrayBuffer;
  mimeType: string;
};

function focusDefaults(row: Record<string, unknown>): FocusPoint {
  const kind = row.kind === "body" ? "point" : (row.kind as FocusPoint["kind"]);
  return {
    id: row.id as string,
    workspaceId: row.workspaceId as string,
    name: row.name as string,
    kind,
    locationText: (row.locationText as string) ?? "",
    defaultBinauralPresetId: (row.defaultBinauralPresetId as string | null) ?? null,
    defaultDurationMs: (row.defaultDurationMs as number) ?? 120_000,
    description: (row.description as string | null) ?? null,
    governs: (row.governs as string | null) ?? null,
    colour: (row.colour as string | null) ?? null,
    element: (row.element as string | null) ?? null,
    representationAssetId: (row.representationAssetId as string | null) ?? null,
    representationDescription: (row.representationDescription as string | null) ?? null,
    binauralEnabled: row.binauralEnabled !== false,
    revision: (row.revision as number | undefined) ?? 0,
    updatedAt: (row.updatedAt as number | undefined) ?? 0,
  };
}

export class MeditaurDB extends Dexie {
  workspaces!: EntityTable<Workspace, "id">;
  members!: Table<WorkspaceMember, [string, string]>;
  preferences!: EntityTable<UserPreferences, "userId">;
  focusPoints!: EntityTable<FocusPoint, "id">;
  symbols!: EntityTable<Symbol, "id">;
  focusSymbolBindings!: Table<FocusSymbolBinding, [string, string]>;
  intentions!: EntityTable<Intention, "id">;
  fieldDefs!: EntityTable<FieldDef, "id">;
  fieldValuesByEntity!: Table<FieldValue, [string, string]>;
  tableViews!: EntityTable<TableView, "id">;
  presets!: EntityTable<BinauralPreset, "id">;
  mediaAssets!: EntityTable<MediaAsset, "id">;
  mediaBlobs!: EntityTable<MediaBlobRow, "id">;
  plans!: EntityTable<PlanRow, "id">;
  snapshots!: EntityTable<SnapshotRow, "instanceId">;
  sessionLogs!: EntityTable<SessionLog, "id">;

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
        const bindings: FocusSymbolBinding[] = [];
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
        const intentions: Intention[] = affirmations.map((row) => {
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
    // (review M11). Stored rows start at 0, exactly like a stored plan.
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
    // Data-only version. M5: the catalogue rows carry a revision and the time
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
  }
}

export const db = new MeditaurDB();
