import {
  SESSION_LOG_LIST_LIMIT,
  type BlobStore,
  type BootstrapPort,
  type CatalogRepository,
  type FieldValue,
  type FocusSymbolBinding,
  type Intention,
  type Plan,
  type PlanRepository,
  type PreferencesRepository,
  type PresetRepository,
  type SessionLogRepository,
  type SnapshotRepository,
  type Symbol,
  type UserPreferences,
} from "@meditaur/domain";
import Dexie from "dexie";
import { planFromRow, savePlan } from "./plan-mapper.ts";
import { db, type PlanRow } from "./schema.ts";
import { ensureSeed } from "./seed.ts";

function uniqueIds(items: Array<string | null | undefined>): string[] {
  return [...new Set(items.filter((id): id is string => Boolean(id)))];
}

async function bindingsForFocusIds(focusIds: string[]): Promise<FocusSymbolBinding[]> {
  if (focusIds.length === 0) return [];
  return db.focusSymbolBindings.where("focusPointId").anyOf(focusIds).toArray();
}

async function symbolsInWorkspace(workspaceId: string): Promise<Symbol[]> {
  return db.symbols.where("workspaceId").equals(workspaceId).toArray();
}

async function boundSymbols(focusIds: string[]): Promise<Symbol[]> {
  const bindings = await bindingsForFocusIds(focusIds);
  const ids = uniqueIds(bindings.map((row) => row.symbolId));
  return rowsByIds((keys) => db.symbols.bulkGet(keys), ids);
}

async function intentionsForWorkspace(workspaceId: string): Promise<Intention[]> {
  return db.intentions.where("workspaceId").equals(workspaceId).toArray();
}

async function rowsByIds<T>(
  getMany: (ids: string[]) => Promise<(T | undefined)[]>,
  ids: string[],
): Promise<T[]> {
  if (ids.length === 0) return [];
  const rows = await getMany(ids);
  return rows.filter((row): row is T => row != null);
}

// Field values live in `fieldValuesByEntity`. Dexie cannot re-key a table in an
// upgrade, so v6 copies them to a new table instead of changing the key path of
// the v1 `fieldValues` table.
async function fieldValuesForEntityIds(entityIds: string[]): Promise<FieldValue[]> {
  if (entityIds.length === 0) return [];
  return db.fieldValuesByEntity.where("entityId").anyOf(entityIds).toArray();
}

export const dexieBootstrap: BootstrapPort = {
  ensureReady: ensureSeed,
};

export const dexiePlans: PlanRepository = {
  async getById(planId) {
    const row = await db.plans.get(planId);
    return row ? planFromRow(row) : null;
  },
  async getMany(planIds) {
    if (planIds.length === 0) return [];
    const rows = await db.plans.bulkGet(planIds);
    return rows.filter((row): row is PlanRow => row != null).map(planFromRow);
  },
  async findFirstInWorkspace(workspaceId) {
    const row = await db.plans.where("workspaceId").equals(workspaceId).first();
    return row ? planFromRow(row) : null;
  },
  async listSummaries(workspaceId) {
    const rows = await db.plans.where("workspaceId").equals(workspaceId).toArray();
    return rows.map((row) => ({ id: row.id, name: row.name }));
  },
  save: savePlan,
  async delete(planId) {
    await db.plans.delete(planId);
  },
};

export const dexieCatalog: CatalogRepository = {
  async loadCompileLibrary(workspaceId, plan?: Plan) {
    const workspaceFocus = await db.focusPoints.where("workspaceId").equals(workspaceId).toArray();
    const fieldDefs = await db.fieldDefs.where("workspaceId").equals(workspaceId).toArray();

    if (!plan) {
      const focusIds = workspaceFocus.map((fp) => fp.id);
      const symbols = await symbolsInWorkspace(workspaceId);
      const entityIds = [...symbols.map((s) => s.id), ...focusIds];
      const [bindings, intentions, fieldValues, tableViews, presets, mediaAssets] =
        await Promise.all([
          bindingsForFocusIds(focusIds),
          intentionsForWorkspace(workspaceId),
          fieldValuesForEntityIds(entityIds),
          db.tableViews.where("workspaceId").equals(workspaceId).toArray(),
          db.presets.where("workspaceId").equals(workspaceId).toArray(),
          db.mediaAssets.where("workspaceId").equals(workspaceId).toArray(),
        ]);
      return {
        focusPoints: workspaceFocus,
        symbols,
        bindings,
        intentions,
        fieldDefs,
        fieldValues,
        tableViews,
        presets,
        mediaAssets,
      };
    }

    const tableViewIds = uniqueIds(plan.blocks.map((b) => b.tableViewId));
    const tableViews = await rowsByIds((ids) => db.tableViews.bulkGet(ids), tableViewIds);
    const allSymbols = tableViews.some((view) => view.symbolFilter === "all");
    const focusIds = allSymbols
      ? workspaceFocus.map((fp) => fp.id)
      : uniqueIds(plan.blocks.map((b) => b.focusPointId));
    const focusPoints = allSymbols
      ? workspaceFocus
      : workspaceFocus.filter((fp) => focusIds.includes(fp.id));
    const explicitSymbolIds = uniqueIds(plan.blocks.map((b) => b.symbolId));
    const [fromFocus, bindings] = await Promise.all([
      boundSymbols(focusPoints.map((fp) => fp.id)),
      bindingsForFocusIds(focusPoints.map((fp) => fp.id)),
    ]);
    const extra = await rowsByIds((ids) => db.symbols.bulkGet(ids), explicitSymbolIds);
    const symbolsById = new Map(fromFocus.map((s) => [s.id, s]));
    for (const symbol of extra) symbolsById.set(symbol.id, symbol);
    const symbols = [...symbolsById.values()];
    const entityIds = [...symbols.map((s) => s.id), ...focusPoints.map((fp) => fp.id)];
    const presetIds = uniqueIds(plan.blocks.map((b) => b.binauralPresetId));
    const mediaIds = uniqueIds(
      plan.blocks.flatMap((b) => [b.ambientAssetId, b.alarmAssetId]),
    );
    const [intentions, fieldValues, presets, mediaAssets] = await Promise.all([
      intentionsForWorkspace(workspaceId),
      fieldValuesForEntityIds(entityIds),
      rowsByIds((ids) => db.presets.bulkGet(ids), presetIds),
      rowsByIds((ids) => db.mediaAssets.bulkGet(ids), mediaIds),
    ]);
    return {
      focusPoints,
      symbols,
      bindings,
      intentions,
      fieldDefs,
      fieldValues,
      tableViews,
      presets,
      mediaAssets,
    };
  },
  listFocusPoints: (workspaceId) =>
    db.focusPoints.where("workspaceId").equals(workspaceId).toArray(),
  listSymbols: symbolsInWorkspace,
  async listBindings(workspaceId) {
    const focusPoints = await db.focusPoints.where("workspaceId").equals(workspaceId).toArray();
    return bindingsForFocusIds(focusPoints.map((fp) => fp.id));
  },
  listBindingsForFocus: (focusPointId) =>
    db.focusSymbolBindings.where("focusPointId").equals(focusPointId).toArray(),
  listIntentions: intentionsForWorkspace,
  listFieldValuesForEntityIds: fieldValuesForEntityIds,
  saveFocusPoint: async (focus) => {
    await db.focusPoints.put(focus);
  },
  deleteFocusPoint: async (focusId) => {
    await db.focusPoints.delete(focusId);
  },
  saveSymbol: async (symbol) => {
    await db.symbols.put(symbol);
  },
  deleteSymbol: async (symbolId) => {
    await db.symbols.delete(symbolId);
  },
  saveBinding: async (binding) => {
    await db.focusSymbolBindings.put(binding);
  },
  deleteBinding: async (focusPointId, symbolId) => {
    await db.focusSymbolBindings.where("[focusPointId+symbolId]").equals([focusPointId, symbolId]).delete();
  },
  saveIntention: async (intention) => {
    await db.intentions.put(intention);
  },
  deleteIntention: async (intentionId) => {
    await db.intentions.delete(intentionId);
  },
  saveMediaAsset: async (asset) => {
    await db.mediaAssets.put(asset);
  },
  deleteMediaAsset: async (assetId) => {
    await db.mediaAssets.delete(assetId);
  },
  saveTableView: async (view) => {
    await db.tableViews.put(view);
  },
  deleteTableView: async (viewId) => {
    await db.tableViews.delete(viewId);
  },
  saveFieldDef: async (def) => {
    await db.fieldDefs.put(def);
  },
  deleteFieldDef: async (fieldDefId) => {
    await db.fieldDefs.delete(fieldDefId);
  },
  saveFieldValue: async (value) => {
    await db.fieldValuesByEntity.put(value);
  },
  deleteFieldValue: async (entityId, fieldDefId) => {
    await db.fieldValuesByEntity
      .where("[entityId+fieldDefId]")
      .equals([entityId, fieldDefId])
      .delete();
  },
};

export const dexieBlobs: BlobStore = {
  async put(id, bytes, mimeType) {
    await db.mediaBlobs.put({ id, bytes, mimeType });
  },
  async get(id) {
    const row = await db.mediaBlobs.get(id);
    return row ? { bytes: row.bytes, mimeType: row.mimeType } : null;
  },
  async delete(id) {
    await db.mediaBlobs.delete(id);
  },
};

export const dexiePresets: PresetRepository = {
  list: (workspaceId) => db.presets.where("workspaceId").equals(workspaceId).toArray(),
  async getFirst(workspaceId) {
    const row = await db.presets.where("workspaceId").equals(workspaceId).first();
    return row ?? null;
  },
  save: async (preset) => {
    await db.presets.put(preset);
  },
  delete: async (presetId) => {
    await db.presets.delete(presetId);
  },
};

function normalizePreferences(row: UserPreferences): UserPreferences {
  // Databases written before v8 stored the overall loudness as `masterGain`.
  const { masterGain, ...rest } = row as UserPreferences & { masterGain?: number };
  return {
    ...rest,
    ttsEnabled: rest.ttsEnabled ?? false,
    alarmVolume: rest.alarmVolume ?? 0.6,
    masterVolume: rest.masterVolume ?? masterGain ?? 0.7,
    // Rows written before v12 carry no revision; the first write sees 0 and the
    // store's revision is what a stale save is measured against.
    revision: rest.revision ?? 0,
  };
}

/**
 * The local preference store: the port, plus the one write the port does not
 * have.
 *
 * `writeCopy` is deliberately not part of `PreferencesRepository`: that `save`
 * refuses a row whose revision is not the stored one, and a mirror write is the
 * opposite situation — a row another store has already versioned and accepted.
 */
export type LocalPreferences = PreferencesRepository & {
  writeCopy(prefs: UserPreferences): Promise<void>;
};

export const dexiePreferences: LocalPreferences = {
  async get(userId) {
    const row = await db.preferences.get(userId);
    return row ? normalizePreferences(row) : null;
  },
  // The read, the check and the write share one transaction, so two writers
  // cannot both pass the revision check — the same guarantee `savePlan` has. It
  // lives here rather than in the application because the application cannot
  // give it: with the cloud adapter a preference write is a network call, and a
  // caller-side transaction cannot span one.
  save: (prefs) =>
    db.transaction("rw", db.preferences, async () => {
      const current = await db.preferences.get(prefs.userId);
      if (current && normalizePreferences(current).revision !== prefs.revision) {
        return null;
      }
      const next = normalizePreferences({ ...prefs, revision: prefs.revision + 1 });
      await db.preferences.put(next);
      return next;
    }),
  async writeCopy(prefs) {
    await db.preferences.put(normalizePreferences(prefs));
  },
};

export const dexieSnapshots: SnapshotRepository = {
  async get(instanceId) {
    const row = await db.snapshots.get(instanceId);
    return row ?? null;
  },
  save: async (snapshot) => {
    await db.snapshots.put({ ...snapshot, updatedAt: Date.now() });
  },
  async prune(planId, keep) {
    const rows = await db.snapshots.where("planId").equals(planId).toArray();
    rows.sort((a, b) => b.updatedAt - a.updatedAt);
    const drop = rows.slice(keep);
    if (drop.length === 0) return;
    await db.snapshots.bulkDelete(drop.map((row) => row.instanceId));
  },
};

export const dexieLogs: SessionLogRepository = {
  append: async (log) => {
    await db.sessionLogs.add(log);
  },
  async listRecent(workspaceId, limit = SESSION_LOG_LIST_LIMIT) {
    return db.sessionLogs
      .where("[workspaceId+completedAt]")
      .between([workspaceId, Dexie.minKey], [workspaceId, Dexie.maxKey])
      .reverse()
      .limit(limit)
      .toArray();
  },
  async prune(workspaceId, keep) {
    const keys = await db.sessionLogs
      .where("[workspaceId+completedAt]")
      .between([workspaceId, Dexie.minKey], [workspaceId, Dexie.maxKey])
      .primaryKeys();
    const extra = keys.length - keep;
    if (extra <= 0) return;
    await db.sessionLogs.bulkDelete(keys.slice(0, extra));
  },
  async deleteForPlan(planId) {
    await db.sessionLogs.where("planId").equals(planId).delete();
  },
};

export async function dexieRunInTransaction<T>(work: () => Promise<T>): Promise<T> {
  return db.transaction(
    "rw",
    [
      db.preferences,
      db.focusPoints,
      db.symbols,
      db.focusSymbolBindings,
      db.intentions,
      db.fieldDefs,
      db.fieldValuesByEntity,
      db.tableViews,
      db.presets,
      db.mediaAssets,
      db.mediaBlobs,
      db.plans,
      db.snapshots,
      db.sessionLogs,
    ],
    work,
  );
}
