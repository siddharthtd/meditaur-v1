import {
  SESSION_LOG_LIST_LIMIT,
  type BlobStore,
  type BootstrapPort,
  type EventPort,
  type CatalogRepository,
  type Entry,
  type FieldValue,
  type Intention,
  type Plan,
  type PlanRepository,
  type PreferencesRepository,
  type PresetRepository,
  type SessionLogRepository,
  type SnapshotRepository,
  type Symbol,
  type UserPreferences,
} from "@meditaur/domain";import Dexie from "dexie";
import { planFromRow, savePlan } from "./plan-mapper.ts";
import { db, type PlanRow } from "./schema.ts";
import { ensureSeed } from "./seed.ts";

function uniqueIds(items: Array<string | null | undefined>): string[] {
  return [...new Set(items.filter((id): id is string => Boolean(id)))];
}

/** The entries of a chakra, and the symbol-only entries of a symbol. */
async function entriesForMeditationIds(meditationIds: string[]): Promise<Entry[]> {
  if (meditationIds.length === 0) return [];
  return db.entries.where("meditationId").anyOf(meditationIds).toArray();
}

async function entriesForSymbolIds(symbolIds: string[]): Promise<Entry[]> {
  if (symbolIds.length === 0) return [];
  return db.entries.where("symbolId").anyOf(symbolIds).toArray();
}

async function symbolsInWorkspace(workspaceId: string): Promise<Symbol[]> {
  return db.symbols.where("workspaceId").equals(workspaceId).toArray();
}

/**
 * The symbols a set of chakras is associated with, in the order the reader put
 * the entries in.
 *
 * The association is an entry now, so this reads the rows directly instead of
 * joining a bindings table: an entry that names both sides *is* the pairing.
 */
async function boundSymbols(meditationIds: string[]): Promise<Symbol[]> {
  const entries = await entriesForMeditationIds(meditationIds);
  const ids = uniqueIds(
    entries.filter((row) => row.symbolId !== null).map((row) => row.symbolId),
  );
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
    const workspaceMeditations = await db.meditations.where("workspaceId").equals(workspaceId).toArray();
    // The types come with every read, scoped or not: they are a handful of rows,
    // and both the library and the Database ask which type a meditation is.
    const meditationTypes = await db.meditationTypes
      .where("workspaceId")
      .equals(workspaceId)
      .toArray();
    const fieldDefs = await db.fieldDefs.where("workspaceId").equals(workspaceId).toArray();
    const fieldOptions = await db.fieldOptions.where("workspaceId").equals(workspaceId).toArray();

    if (!plan) {
      const meditationIds = workspaceMeditations.map((fp) => fp.id);
      const symbols = await symbolsInWorkspace(workspaceId);
      const entries = await db.entries.where("workspaceId").equals(workspaceId).toArray();
      // A field value hangs off **any** entity, and the Entries table has custom
      // columns of its own. Leaving the entry ids out made every one of those
      // columns write-only: the value was stored, and the grid drew it blank
      // again on the next read. The plan-scoped branch below always included
      // them, which is why only the no-plan read was wrong.
      const entityIds = [
        ...symbols.map((s) => s.id),
        ...meditationIds,
        ...entries.map((e) => e.id),
      ];
      const [intentions, fieldValues, presets, mediaAssets] = await Promise.all([
        intentionsForWorkspace(workspaceId),
        fieldValuesForEntityIds(entityIds),
        db.presets.where("workspaceId").equals(workspaceId).toArray(),
        db.mediaAssets.where("workspaceId").equals(workspaceId).toArray(),
      ]);
      return {
        meditationTypes,
        meditations: workspaceMeditations,
        symbols,
        entries,
        intentions,
        fieldDefs,
        fieldOptions,
        fieldValues,
        presets,
        mediaAssets,
      };
    }

    // Scoped to the plan: starting a session should not read a catalogue that has
    // nothing to do with it. Media and presets are read by id, because a block
    // names what it uses; symbols come from the entries of the chakras the plan
    // runs, plus any symbol a block names outright (a cool-off block may name one
    // on its own).
    const meditationIds = uniqueIds(plan.blocks.map((b) => b.meditationId));
    const meditations = workspaceMeditations.filter((fp) => meditationIds.includes(fp.id));
    const explicitSymbolIds = uniqueIds(plan.blocks.map((b) => b.symbolId));
    const [fromMeditations, pairEntries, soloEntries] = await Promise.all([
      boundSymbols(meditationIds),
      entriesForMeditationIds(meditationIds),
      entriesForSymbolIds(explicitSymbolIds),
    ]);
    const extra = await rowsByIds((ids) => db.symbols.bulkGet(ids), explicitSymbolIds);
    const symbolsById = new Map(fromMeditations.map((s) => [s.id, s]));
    for (const symbol of extra) symbolsById.set(symbol.id, symbol);
    const symbols = [...symbolsById.values()];
    const entriesById = new Map<string, Entry>();
    for (const entry of [...pairEntries, ...soloEntries]) entriesById.set(entry.id, entry);
    const entityIds = [...symbols.map((s) => s.id), ...meditations.map((fp) => fp.id)];
    const presetIds = uniqueIds(plan.blocks.map((b) => b.binauralPresetId));
    const mediaIds = uniqueIds(plan.blocks.flatMap((b) => [b.ambientAssetId, b.alarmAssetId]));
    // A pair's own columns hang on the entry, so those values are read by entry id
    // as well as by record id.
    const [intentions, fieldValues, presets, mediaAssets] = await Promise.all([
      intentionsForWorkspace(workspaceId),
      fieldValuesForEntityIds([...entityIds, ...entriesById.keys()]),
      rowsByIds((ids) => db.presets.bulkGet(ids), presetIds),
      rowsByIds((ids) => db.mediaAssets.bulkGet(ids), mediaIds),
    ]);
    return {
      meditationTypes,
      meditations,
      symbols,
      entries: [...entriesById.values()],
      intentions,
      fieldDefs,
      fieldOptions,
      fieldValues,
      presets,
      mediaAssets,
    };
  },
  listMeditations: (workspaceId) =>
    db.meditations.where("workspaceId").equals(workspaceId).toArray(),
  listMeditationTypes: (workspaceId) =>
    db.meditationTypes.where("workspaceId").equals(workspaceId).toArray(),
  saveMeditationType: (row) => db.meditationTypes.put(row).then(() => undefined),
  deleteMeditationType: (typeId) => db.meditationTypes.delete(typeId),
  listSymbols: symbolsInWorkspace,
  listEntries: (workspaceId) =>
    db.entries.where("workspaceId").equals(workspaceId).toArray(),
  listIntentions: intentionsForWorkspace,
  listFieldValuesForEntityIds: fieldValuesForEntityIds,
  listFieldOptions: (workspaceId) =>
    db.fieldOptions.where("workspaceId").equals(workspaceId).toArray(),
  saveMeditation: async (focus) => {
    await db.meditations.put(focus);
  },
  deleteMeditation: async (meditationId) => {
    await db.meditations.delete(meditationId);
  },
  saveSymbol: async (symbol) => {
    await db.symbols.put(symbol);
  },
  deleteSymbol: async (symbolId) => {
    await db.symbols.delete(symbolId);
  },
  saveEntry: async (entry) => {
    await db.entries.put(entry);
  },
  deleteEntry: async (entryId) => {
    // A row's lines belong to it, which is what `on delete cascade` says in
    // Postgres. Dexie has no cascades, so this is the one place that has to.
    await db.transaction("rw", db.entries, db.intentions, async () => {
      await db.intentions.where("entryId").equals(entryId).delete();
      await db.entries.delete(entryId);
    });
  },
  saveIntention: async (intention) => {
    await db.intentions.put(intention);
  },
  deleteIntention: async (intentionId) => {
    await db.intentions.delete(intentionId);
  },
  deleteIntentionsForEntry: async (entryId) => {
    await db.intentions.where("entryId").equals(entryId).delete();
  },
  saveMediaAsset: async (asset) => {
    await db.mediaAssets.put(asset);
  },
  deleteMediaAsset: async (assetId) => {
    await db.mediaAssets.delete(assetId);
  },
  listMediaAssets: async (workspaceId) =>
    db.mediaAssets.where("workspaceId").equals(workspaceId).toArray(),
  saveFieldOption: async (option) => {
    await db.fieldOptions.put(option);
  },
  deleteFieldOption: async (optionId) => {
    await db.fieldOptions.delete(optionId);
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

export const dexieEvents: EventPort = {
  // `put`, not `add`: `id` is the idempotency key, so writing the same event
  // twice is the same event rather than a primary-key collision.
  append: async (event) => {
    await db.events.put(event);
  },
};

export const dexieLogs: SessionLogRepository = {
  append: async (log) => {
    await db.sessionLogs.add(log);
  },
  save: async (log) => {
    await db.sessionLogs.put(log);
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
      db.meditationTypes,
      db.meditations,
      db.symbols,
      db.entries,
      db.intentions,
      db.fieldDefs,
      db.fieldOptions,
      db.fieldValuesByEntity,
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
