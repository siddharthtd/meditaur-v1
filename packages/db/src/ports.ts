import {
  DEFAULT_FEATURE_FLAGS,
  SESSION_LOG_LIST_LIMIT,
  deleteMark,
  normalizeFeatureFlags,
  normalizeTheme,
  notDeleted,
  type AccountFlags,
  type BlobStore,
  type BootstrapPort,
  type EventPort,
  type CatalogRepository,
  type DeletedRow,
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
  type SyncStatePort,
  type UserPreferences,
} from "@meditaur/domain";
import Dexie, { type Table } from "dexie";
import { planFromRow, savePlan } from "./plan-mapper.ts";
import { db, type PlanRow } from "./schema.ts";
import { ensureSeed } from "./seed.ts";

function uniqueIds(items: Array<string | null | undefined>): string[] {
  return [...new Set(items.filter((id): id is string => Boolean(id)))];
}

/**
 * A local delete, written as the mark instead of a removal — `P2 · 3`'s slice 3, and
 * `DECISIONS.md` §12 says why it is the protocol's first unit rather than a detail.
 *
 * A device used to *remove* the row (`db.symbols.delete(id)` and its siblings), which
 * is the one shape a push cannot carry: a row that is not there cannot be sent, so a
 * delete made here could never travel, and the other device would read the missing row
 * as new and hand it back. The row stays, the mark says it is gone, and every read in
 * this file leaves the marked rows out through `notDeleted` — so no screen sees a
 * difference, and a delete is now something the protocol can carry.
 *
 * The three fields come from the domain's `deleteMark`, the same function both cloud
 * adapters mark through, so two copies of one row cannot disagree about what a delete
 * is. A row this store has never held is not an error: a delete can arrive twice, or
 * name a row that only ever existed on the other device.
 */
async function markLocally<T extends DeletedRow & { revision?: number }>(
  table: Table<T, string>,
  id: string,
  at: number,
): Promise<void> {
  const row = await table.get(id);
  if (!row) return;
  await table.put({ ...row, ...deleteMark(at, row) });
}

/** The same mark for the one table keyed by a pair rather than by an id. */
async function markFieldValueLocally(
  entityId: string,
  fieldDefId: string,
  at: number,
): Promise<void> {
  const row = await db.fieldValuesByEntity.get([entityId, fieldDefId]);
  if (!row) return;
  await db.fieldValuesByEntity.put({ ...row, ...deleteMark(at, row) });
}

/**
 * The lines a row holds, marked with it: Dexie's answer to Postgres's `on delete
 * cascade`, which this store has to do by hand and which marking makes one pass over
 * the rows rather than a removal each.
 */
async function markIntentionsOfEntry(entryId: string, at: number): Promise<void> {
  const rows = await db.intentions.where("entryId").equals(entryId).toArray();
  for (const row of rows) {
    await db.intentions.put({ ...row, ...deleteMark(at, row) });
  }
}

/**
 * The rows a query found, with the marked ones left out.
 *
 * Every read of a catalogue table below goes through it, because "a marked row is
 * gone" is one rule rather than one filter per read — and a rule half the reads keep is
 * what `DECISIONS.md` §12 warns about: a reader deletes a row, and the next screen
 * draws it again. It takes the query rather than its result so a call site stays one
 * expression and the `await` happens inside the same Dexie transaction zone as the
 * query itself.
 */
async function withoutDeleted<T extends DeletedRow>(rows: Promise<T[]>): Promise<T[]> {
  return (await rows).filter(notDeleted);
}

/** The entries of a chakra, and the symbol-only entries of a symbol. */
async function entriesForMeditationIds(meditationIds: string[]): Promise<Entry[]> {
  if (meditationIds.length === 0) return [];
  return withoutDeleted(db.entries.where("meditationId").anyOf(meditationIds).toArray());
}

async function entriesForSymbolIds(symbolIds: string[]): Promise<Entry[]> {
  if (symbolIds.length === 0) return [];
  return withoutDeleted(db.entries.where("symbolId").anyOf(symbolIds).toArray());
}

async function symbolsInWorkspace(workspaceId: string): Promise<Symbol[]> {
  return withoutDeleted(db.symbols.where("workspaceId").equals(workspaceId).toArray());
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
  return withoutDeleted(db.intentions.where("workspaceId").equals(workspaceId).toArray());
}

async function rowsByIds<T extends DeletedRow>(
  getMany: (ids: string[]) => Promise<(T | undefined)[]>,
  ids: string[],
): Promise<T[]> {
  if (ids.length === 0) return [];
  const rows = await getMany(ids);
  return rows.filter((row): row is T => row != null && notDeleted(row));
}

// Field values live in `fieldValuesByEntity`. Dexie cannot re-key a table in an
// upgrade, so v6 copies them to a new table instead of changing the key path of
// the v1 `fieldValues` table.
async function fieldValuesForEntityIds(entityIds: string[]): Promise<FieldValue[]> {
  if (entityIds.length === 0) return [];
  return withoutDeleted(db.fieldValuesByEntity.where("entityId").anyOf(entityIds).toArray());
}

export const dexieBootstrap: BootstrapPort = {
  ensureReady: ensureSeed,
};

export const dexiePlans: PlanRepository = {
  async getById(planId) {
    const row = await db.plans.get(planId);
    return row && notDeleted(row) ? planFromRow(row) : null;
  },
  async getMany(planIds) {
    if (planIds.length === 0) return [];
    const rows = await db.plans.bulkGet(planIds);
    return rows.filter((row): row is PlanRow => row != null && notDeleted(row)).map(planFromRow);
  },
  async findFirstInWorkspace(workspaceId) {
    const rows = await withoutDeleted(db.plans.where("workspaceId").equals(workspaceId).toArray());
    const row = rows[0];
    return row ? planFromRow(row) : null;
  },
  async listSummaries(workspaceId) {
    const rows = await withoutDeleted(db.plans.where("workspaceId").equals(workspaceId).toArray());
    return rows.map((row) => ({ id: row.id, name: row.name }));
  },
  save: savePlan,
  // The mark lands on the *row*, not on the domain's `Plan`: that type has no
  // `deletedAt` and should not have one, because a plan the reader deleted is not a
  // state the app holds — it is a row the store no longer offers, which is why every
  // read above filters it out and the mappers never see one (`plan-cloud.ts` takes the
  // same line for the same reason).
  async delete(planId) {
    await markLocally(db.plans, planId, Date.now());
  },
};

export const dexieCatalog: CatalogRepository = {
  async loadCompileLibrary(workspaceId, plan?: Plan) {
    const workspaceMeditations = await withoutDeleted(
      db.meditations.where("workspaceId").equals(workspaceId).toArray(),
    );
    // The types come with every read, scoped or not: they are a handful of rows,
    // and both the library and the Database ask which type a meditation is.
    const meditationTypes = await withoutDeleted(
      db.meditationTypes.where("workspaceId").equals(workspaceId).toArray(),
    );
    const fieldDefs = await withoutDeleted(
      db.fieldDefs.where("workspaceId").equals(workspaceId).toArray(),
    );
    const fieldOptions = await withoutDeleted(
      db.fieldOptions.where("workspaceId").equals(workspaceId).toArray(),
    );

    if (!plan) {
      const meditationIds = workspaceMeditations.map((fp) => fp.id);
      const symbols = await symbolsInWorkspace(workspaceId);
      const entries = await withoutDeleted(
        db.entries.where("workspaceId").equals(workspaceId).toArray(),
      );
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
        withoutDeleted(db.presets.where("workspaceId").equals(workspaceId).toArray()),
        withoutDeleted(db.mediaAssets.where("workspaceId").equals(workspaceId).toArray()),
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
    const meditationIds = uniqueIds(plan.blocks.flatMap((b) => b.meditationIds));
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
    withoutDeleted(db.meditations.where("workspaceId").equals(workspaceId).toArray()),
  listMeditationTypes: (workspaceId) =>
    withoutDeleted(db.meditationTypes.where("workspaceId").equals(workspaceId).toArray()),
  saveMeditationType: (row) => db.meditationTypes.put(row).then(() => undefined),
  deleteMeditationType: (typeId) => markLocally(db.meditationTypes, typeId, Date.now()),
  listSymbols: symbolsInWorkspace,
  listEntries: (workspaceId) =>
    withoutDeleted(db.entries.where("workspaceId").equals(workspaceId).toArray()),
  listIntentions: intentionsForWorkspace,
  listFieldValuesForEntityIds: fieldValuesForEntityIds,
  listFieldOptions: (workspaceId) =>
    withoutDeleted(db.fieldOptions.where("workspaceId").equals(workspaceId).toArray()),
  saveMeditation: async (focus) => {
    await db.meditations.put(focus);
  },
  deleteMeditation: async (meditationId) => {
    await markLocally(db.meditations, meditationId, Date.now());
  },
  saveSymbol: async (symbol) => {
    await db.symbols.put(symbol);
  },
  deleteSymbol: async (symbolId) => {
    await markLocally(db.symbols, symbolId, Date.now());
  },
  saveEntry: async (entry) => {
    await db.entries.put(entry);
  },
  deleteEntry: async (entryId) => {
    // A row's lines belong to it, which is what `on delete cascade` says in
    // Postgres. Dexie has no cascades, so this is the one place that has to — and the
    // lines take the mark with the row rather than being removed, because a removal is
    // the one shape a push cannot carry.
    await db.transaction("rw", db.entries, db.intentions, async () => {
      const at = Date.now();
      await markIntentionsOfEntry(entryId, at);
      await markLocally(db.entries, entryId, at);
    });
  },
  saveIntention: async (intention) => {
    await db.intentions.put(intention);
  },
  deleteIntention: async (intentionId) => {
    await markLocally(db.intentions, intentionId, Date.now());
  },
  deleteIntentionsForEntry: async (entryId) => {
    await markIntentionsOfEntry(entryId, Date.now());
  },
  saveMediaAsset: async (asset) => {
    await db.mediaAssets.put(asset);
  },
  deleteMediaAsset: async (assetId) => {
    await markLocally(db.mediaAssets, assetId, Date.now());
  },
  listMediaAssets: async (workspaceId) =>
    withoutDeleted(db.mediaAssets.where("workspaceId").equals(workspaceId).toArray()),
  saveFieldOption: async (option) => {
    await db.fieldOptions.put(option);
  },
  deleteFieldOption: async (optionId) => {
    await markLocally(db.fieldOptions, optionId, Date.now());
  },
  saveFieldDef: async (def) => {
    await db.fieldDefs.put(def);
  },
  deleteFieldDef: async (fieldDefId) => {
    await markLocally(db.fieldDefs, fieldDefId, Date.now());
  },
  saveFieldValue: async (value) => {
    await db.fieldValuesByEntity.put(value);
  },
  deleteFieldValue: (entityId, fieldDefId) =>
    markFieldValueLocally(entityId, fieldDefId, Date.now()),
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
  list: (workspaceId) =>
    withoutDeleted(db.presets.where("workspaceId").equals(workspaceId).toArray()),
  async getFirst(workspaceId) {
    const rows = await withoutDeleted(db.presets.where("workspaceId").equals(workspaceId).toArray());
    return rows[0] ?? null;
  },
  save: async (preset) => {
    await db.presets.put(preset);
  },
  delete: async (presetId) => {
    await markLocally(db.presets, presetId, Date.now());
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
    // A row written before the eight schemes existed paints in the app's own, exactly as
    // it did — the same reading `textSize` and `revision` get below, and the reason the
    // scheme needed no Dexie version: a stored row that lacks the field is filled in on
    // the way out rather than repaired in place.
    theme: normalizeTheme(rest.theme),
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

/**
 * The local mirror of the account's flags: the read the cache makes, plus the one write
 * the port does not have.
 *
 * `writeCopy` is deliberately not part of `FeatureFlagsPort`. That port is read-only by
 * design — a flag is written through the service role and nowhere else — and this is the
 * same split `LocalPreferences` makes: the write a *mirror* performs is the opposite of
 * the write a port refuses, because the row has already been accepted somewhere else.
 *
 * Nothing here invents a value. An absent row is the defaults, and a stored row goes
 * through `normalizeFeatureFlags`, so a flag added since this device last read is filled
 * in with its own default rather than read as off.
 */
export type LocalAccountFlags = {
  read(userId: string): Promise<AccountFlags>;
  writeCopy(userId: string, row: AccountFlags): Promise<void>;
};

export const dexieFlagsCache: LocalAccountFlags = {
  async read(userId) {
    const row = await db.accountFlags.get(userId);
    if (!row) return { flags: DEFAULT_FEATURE_FLAGS, isAdmin: false };
    return { flags: normalizeFeatureFlags(row.flags), isAdmin: row.isAdmin };
  },
  async writeCopy(userId, row) {
    await db.accountFlags.put({
      userId,
      isAdmin: row.isAdmin,
      flags: { ...row.flags },
      readAt: Date.now(),
    });
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

/**
 * The watermark store (`P2 · 3`, slice 3): how far a sync has got, per table.
 *
 * One row per table, written on its own — never inside a save — which is why
 * `syncState` sits on `OUTSIDE_THE_SCOPE` in `tests/unit/db/transaction-scope.test.ts`
 * rather than in the one read-modify-write scope. A mark is this device's own
 * bookkeeping: nothing in the product reads it and it never travels.
 */
export const dexieSyncState: SyncStatePort = {
  async get(table) {
    return (await db.syncState.get(table)) ?? null;
  },
  async save(mark) {
    await db.syncState.put(mark);
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
