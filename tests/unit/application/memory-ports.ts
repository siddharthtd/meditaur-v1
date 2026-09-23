import { createMeditaurApp, type AppPorts } from "@meditaur/application";
import {
  FakeClock,
  SESSION_LOG_LIST_LIMIT,
  fail,
  type AccountPort,
  type AuthPort,
  type EventPort,
  type BinauralPreset,
  type CatalogRepository,
  type CompileLibrary,
  type Plan,
  type PlanRepository,
  type PreferencesRepository,
  type PresetRepository,
  type MaintenancePort,
  type SessionContext,
  type SessionLog,
  type SessionLogRepository,
  type SessionSnapshot,
  type SnapshotRepository,
  type UserPreferences,
  type WorkspaceRepository,
} from "@meditaur/domain";
import { createLocalAccountPort } from "../../../packages/db/src/account-local.ts";

export function memoryPorts(input: {
  context: SessionContext;
  plans: Plan[];
  library: CompileLibrary;
  presets: BinauralPreset[];
  prefs: UserPreferences | null;
  auth?: AuthPort;
  account?: AccountPort;
  events?: EventPort;
  workspaces?: WorkspaceRepository;
  maintenance?: MaintenancePort;
  nextId?: () => string;
  clock?: FakeClock;
}): AppPorts {
  const plans = new Map(input.plans.map((p) => [p.id, structuredClone(p)]));
  const snapshots = new Map<string, SessionSnapshot>();
  const logs: SessionLog[] = [];
  const presets = new Map(input.presets.map((p) => [p.id, structuredClone(p)]));
  const meditationTypes = new Map(
    (input.library.meditationTypes ?? []).map((row) => [row.id, structuredClone(row)]),
  );
  let prefs = input.prefs ? structuredClone(input.prefs) : null;
  const library = structuredClone(input.library);
  if (!library.mediaAssets) library.mediaAssets = [];
  if (!library.entries) library.entries = [];
  if (!library.fieldOptions) library.fieldOptions = [];
  const blobs = new Map<string, { bytes: ArrayBuffer; mimeType: string }>();
  const clock = input.clock ?? new FakeClock();

  function upsertById<T extends { id: string }>(list: T[], item: T): void {
    const index = list.findIndex((row) => row.id === item.id);
    if (index === -1) list.push(structuredClone(item));
    else list[index] = structuredClone(item);
  }

  const planRepo: PlanRepository = {
    async getById(planId) {
      return plans.get(planId) ?? null;
    },
    async getMany(planIds) {
      return planIds.flatMap((planId) => {
        const plan = plans.get(planId);
        return plan ? [plan] : [];
      });
    },
    async findFirstInWorkspace(workspaceId) {
      return [...plans.values()].find((p) => p.workspaceId === workspaceId) ?? null;
    },
    async listSummaries(workspaceId) {
      return [...plans.values()]
        .filter((p) => p.workspaceId === workspaceId)
        .map((p) => ({ id: p.id, name: p.name }));
    },
    async save(plan) {
      plans.set(plan.id, structuredClone(plan));
    },
    async delete(planId) {
      plans.delete(planId);
    },
  };

  const catalog: CatalogRepository = {
    async loadCompileLibrary(_workspaceId) {
      return {
        ...structuredClone(library),
        presets: [...presets.values()].map((p) => structuredClone(p)),
      };
    },
    async listMeditationTypes(_workspaceId) {
      return structuredClone(library.meditationTypes ?? []);
    },
    async saveMeditationType(row) {
      meditationTypes.set(row.id, structuredClone(row));
    },
    async deleteMeditationType(typeId) {
      meditationTypes.delete(typeId);
    },
    async listMeditations(_workspaceId) {
      return structuredClone(library.meditations);
    },
    async listSymbols(_workspaceId) {
      return structuredClone(library.symbols);
    },
    async listEntries(_workspaceId) {
      return structuredClone(library.entries);
    },
    async listIntentions(_workspaceId) {
      return structuredClone(library.intentions);
    },
    async listFieldValuesForEntityIds(entityIds) {
      return structuredClone(
        library.fieldValues.filter((row) => entityIds.includes(row.entityId)),
      );
    },
    async listFieldOptions(_workspaceId) {
      return structuredClone(library.fieldOptions);
    },
    async saveMeditation(focus) {
      upsertById(library.meditations, focus);
    },
    async deleteMeditation(meditationId) {
      library.meditations = library.meditations.filter((fp) => fp.id !== meditationId);
    },
    async saveSymbol(symbol) {
      upsertById(library.symbols, symbol);
    },
    async deleteSymbol(symbolId) {
      library.symbols = library.symbols.filter((s) => s.id !== symbolId);
    },
    async saveEntry(entry) {
      upsertById(library.entries, entry);
    },
    async deleteEntry(entryId) {
      // The lines go with the row: `on delete cascade` in Postgres, and the Dexie
      // adapter does the same, so the double behaves the same way.
      library.intentions = library.intentions.filter((row) => row.entryId !== entryId);
      library.entries = library.entries.filter((row) => row.id !== entryId);
    },
    async saveIntention(intention) {
      // The pair is a column, not part of the key, so an orphan (`entryId: null`)
      // is stored by exactly the write every other sentence uses — which is what
      // `saveLine` means when it allows one.
      upsertById(library.intentions, intention);
    },
    async deleteIntention(intentionId) {
      library.intentions = library.intentions.filter((a) => a.id !== intentionId);
    },
    async deleteIntentionsForEntry(entryId) {
      library.intentions = library.intentions.filter((row) => row.entryId !== entryId);
    },
    async saveMediaAsset(asset) {
      upsertById(library.mediaAssets ?? [], asset);
    },
    async deleteMediaAsset(assetId) {
      library.mediaAssets = (library.mediaAssets ?? []).filter((a) => a.id !== assetId);
    },
    async listMediaAssets() {
      return structuredClone(library.mediaAssets ?? []);
    },
    async saveFieldDef(def) {
      upsertById(library.fieldDefs, def);
    },
    async deleteFieldDef(fieldDefId) {
      library.fieldDefs = library.fieldDefs.filter((def) => def.id !== fieldDefId);
    },
    async saveFieldOption(option) {
      upsertById(library.fieldOptions, option);
    },
    async deleteFieldOption(optionId) {
      library.fieldOptions = library.fieldOptions.filter((row) => row.id !== optionId);
    },
    async saveFieldValue(value) {
      library.fieldValues = library.fieldValues.filter(
        (row) => !(row.entityId === value.entityId && row.fieldDefId === value.fieldDefId),
      );
      library.fieldValues.push(structuredClone(value));
    },
    async deleteFieldValue(entityId, fieldDefId) {
      library.fieldValues = library.fieldValues.filter(
        (row) => !(row.entityId === entityId && row.fieldDefId === fieldDefId),
      );
    },
  };

  const presetRepo: PresetRepository = {
    async list(_workspaceId) {
      return [...presets.values()].map((p) => structuredClone(p));
    },
    async getFirst(_workspaceId) {
      const first = [...presets.values()][0];
      return first ? structuredClone(first) : null;
    },
    async save(preset) {
      presets.set(preset.id, structuredClone(preset));
    },
    async delete(presetId) {
      presets.delete(presetId);
    },
  };

  const preferences: PreferencesRepository = {
    async get(_userId) {
      return prefs ? structuredClone(prefs) : null;
    },
    // The same compare-and-swap the real stores implement: refuse a row whose
    // revision is not the stored one, then move the revision and hand back what
    // was written.
    async save(next) {
      if (prefs && prefs.revision !== next.revision) return null;
      prefs = structuredClone({ ...next, revision: next.revision + 1 });
      return structuredClone(prefs);
    },
  };

  const snapshotRepo: SnapshotRepository = {
    async get(instanceId) {
      return snapshots.get(instanceId) ?? null;
    },
    async save(snapshot) {
      snapshots.set(snapshot.instanceId, structuredClone(snapshot));
    },
    async prune(planId, keep) {
      const rows = [...snapshots.values()]
        .filter((row) => row.planId === planId)
        .sort((a, b) => b.compiledAt - a.compiledAt);
      for (const row of rows.slice(keep)) {
        snapshots.delete(row.instanceId);
      }
    },
  };

  const logRepo: SessionLogRepository = {
    async append(log) {
      logs.push(structuredClone(log));
    },
    async save(log) {
      const at = logs.findIndex((row) => row.id === log.id);
      if (at === -1) logs.push(structuredClone(log));
      else logs[at] = structuredClone(log);
    },
    async listRecent(workspaceId, limit = SESSION_LOG_LIST_LIMIT) {
      return logs
        .filter((row) => row.workspaceId === workspaceId)
        .sort((a, b) => b.completedAt - a.completedAt)
        .slice(0, limit);
    },
    async prune(workspaceId, keep) {
      const ranked = logs
        .filter((row) => row.workspaceId === workspaceId)
        .sort((a, b) => b.completedAt - a.completedAt);
      const keepIds = new Set(ranked.slice(0, keep).map((row) => row.id));
      for (let i = logs.length - 1; i >= 0; i -= 1) {
        if (logs[i].workspaceId === workspaceId && !keepIds.has(logs[i].id)) {
          logs.splice(i, 1);
        }
      }
    },
    async deleteForPlan(planId) {
      for (let i = logs.length - 1; i >= 0; i -= 1) {
        if (logs[i].planId === planId) {
          logs.splice(i, 1);
        }
      }
    },
  };

  return {
    bootstrap: { ensureReady: async () => input.context },
    auth:
      input.auth ??
      ({
        isConfigured: () => false,
        getSession: async () => null,
        async signIn(): Promise<never> {
          fail("auth.notConfigured", "Cloud sign-in is not configured on this build");
        },
        async signUp(): Promise<never> {
          fail("auth.notConfigured", "Cloud sign-in is not configured on this build");
        },
        async signOut(): Promise<void> {},
        onSessionChange: () => () => {},
      } satisfies AuthPort),
    workspaces:
      input.workspaces ??
      ({
        adopt: async (userId) => ({ userId, workspaceId: input.context.workspaceId }),
      } satisfies WorkspaceRepository),
    plans: planRepo,
    catalog,
    blobs: {
      async put(id, bytes, mimeType) {
        blobs.set(id, { bytes: bytes.slice(0), mimeType });
      },
      async get(id) {
        const row = blobs.get(id);
        return row ? { bytes: row.bytes.slice(0), mimeType: row.mimeType } : null;
      },
      async delete(id) {
        blobs.delete(id);
      },
    },
    presets: presetRepo,
    preferences,
    snapshots: snapshotRepo,
    logs: logRepo,
    account: input.account ?? createLocalAccountPort(),
    events: input.events ?? { append: async () => {} },
    maintenance: input.maintenance ?? { wipeLocalData: async () => {} },
    clock,
    runInTransaction: (work) => work(),
    nextId: input.nextId ?? (() => "snap-1"),
  };
}

export function appFromMemory(
  input: Parameters<typeof memoryPorts>[0],
): ReturnType<typeof createMeditaurApp> {
  return createMeditaurApp(memoryPorts(input));
}
