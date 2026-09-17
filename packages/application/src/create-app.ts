import {
  compilePlan,
  createId,
  fail,
  BUILTIN_COLUMN_KEYS,
  MAX_TONES_PER_EAR,
  SESSION_LOG_LIST_LIMIT,
  SNAPSHOT_KEEP_PER_PLAN,
  type Intention,
  type AuthPort,
  type AuthSession,
  type BinauralPreset,
  type BlobStore,
  type BootstrapPort,
  type CatalogRepository,
  type Clock,
  type FieldDef,
  type FieldValue,
  type FocusPoint,
  type FocusSymbolBinding,
  type MediaAsset,
  type Plan,
  type PlanBlock,
  type PlanRepository,
  type PreferencesRepository,
  type PresetRepository,
  type SessionContext,
  type SessionLog,
  type SessionLogRepository,
  type SessionSnapshot,
  type SignUpOutcome,
  type SnapshotRepository,
  type Symbol,
  type TableView,
  type UserPreferences,
  type Versioned,
  type WorkspaceRepository,
} from "@meditaur/domain";
import {
  CATALOG_BACKUP_SCHEMA_VERSION,
  bindCatalogToWorkspace,
  decodeCatalogBlob,
  encodeCatalogBlob,
  parseCatalogBackup,
  type CatalogBackup,
} from "./catalog-backup.ts";
import {
  assertIntentionSavable,
  assertFieldDefSavable,
  catalogFail,
  fieldKeyFor,
  requireColumnKeys,
  requireName,
  requireText,
  CATALOG_ERRORS,
} from "./catalog-writes.ts";
import {
  describeDeletionImpact,
  focusPointDeletionImpact,
  NO_DELETION_IMPACT,
  symbolDeletionImpact,
  type DeletionImpact,
} from "./deletion-impact.ts";
import {
  mediaAssetFromUpload,
  requireMediaBytes,
  requireMediaMime,
} from "./media-writes.ts";
import {
  clonePlan,
  copyPlanName,
  FOCUS_SESSION_PLAN_ID,
  FOCUS_SESSION_PLAN_NAME,
  makeStarterPlan,
  nextPlanName,
  PLAN_ERRORS,
} from "./plan-lifecycle.ts";
import { clonePreset, PRESET_ERRORS } from "./preset-lifecycle.ts";
import {
  preferencesConflict,
  stampedPreferences,
} from "./preferences.ts";
import { countSessionsThisWeek } from "./session-stats.ts";
import { requireEmail, requirePassword } from "./auth.ts";
import { versionedRow } from "./versioned.ts";

function planFail(key: keyof typeof PLAN_ERRORS): never {
  fail(`plan.${key}`, PLAN_ERRORS[key]);
}

function presetFail(key: keyof typeof PRESET_ERRORS): never {
  fail(`preset.${key}`, PRESET_ERRORS[key]);
}

export type LibraryView = {
  focusPoints: FocusPoint[];
  symbols: Symbol[];
  bindings: FocusSymbolBinding[];
  intentions: Intention[];
  fieldDefs: FieldDef[];
  fieldValues: FieldValue[];
  tableViews: TableView[];
  presets: BinauralPreset[];
  mediaAssets: MediaAsset[];
  plans: { id: string; name: string }[];
  logs: SessionLog[];
  sessionsThisWeek: number;
};

export type AppPorts = {
  bootstrap: BootstrapPort;
  auth: AuthPort;
  workspaces: WorkspaceRepository;
  plans: PlanRepository;
  catalog: CatalogRepository;
  blobs: BlobStore;
  presets: PresetRepository;
  preferences: PreferencesRepository;
  snapshots: SnapshotRepository;
  logs: SessionLogRepository;
  clock: Clock;
  runInTransaction: <T>(work: () => Promise<T>) => Promise<T>;
  nextId?: () => string;
  durationOverrideMs?: number | null;
};

/** What a catalogue delete can be asked about, for `getDeletionImpact`. */
export type DeleteKind =
  | "focus"
  | "symbol"
  | "binding"
  | "preset"
  | "table"
  | "field"
  | "media";

export type MeditaurApp = {
  bootstrap(): Promise<SessionContext>;
  authIsConfigured(): boolean;
  getAuthSession(): Promise<AuthSession | null>;
  signIn(email: string, password: string): Promise<AuthSession>;
  /**
   * Create an account, and claim this device's workspace when the provider signs
   * the new reader straight in. `confirmationRequired` means the provider wants
   * the address verified first, so there is no session to adopt yet and the
   * reader finishes on the sign-in screen after following the link.
   */
  signUp(email: string, password: string): Promise<SignUpOutcome>;
  signOut(): Promise<void>;
  onAuthSessionChange(listener: (session: AuthSession | null) => void): () => void;
  getActivePlan(userId: string, workspaceId: string): Promise<Plan | null>;
  openPlan(userId: string, workspaceId: string, planId: string): Promise<Plan | null>;
  createPlan(userId: string, workspaceId: string): Promise<Plan>;
  duplicatePlan(userId: string, workspaceId: string, planId: string): Promise<Plan>;
  deletePlan(userId: string, workspaceId: string, planId: string): Promise<Plan>;
  getPlan(workspaceId: string, planId: string): Promise<Plan | null>;
  savePlan(plan: Plan): Promise<Plan>;
  compileAndStoreSession(plan: Plan, userId: string): Promise<SessionSnapshot>;
  compileSession(userId: string, workspaceId: string, planId: string): Promise<SessionSnapshot>;
  startSessionFromFocus(
    userId: string,
    workspaceId: string,
    focusId: string,
  ): Promise<SessionSnapshot>;
  getLibrary(workspaceId: string): Promise<LibraryView>;
  /**
   * What deleting this would also take with it, as a sentence for the delete
   * confirmation ("This also removes 3 blocks from 2 plans."). Empty when the
   * delete affects nothing else.
   */
  getDeletionImpact(workspaceId: string, kind: DeleteKind, id: string): Promise<string>;
  exportCatalog(workspaceId: string): Promise<CatalogBackup>;
  importCatalog(workspaceId: string, raw: unknown): Promise<void>;
  getPreferences(userId: string): Promise<UserPreferences | null>;
  /**
   * Store the reader's preferences and return the stored row — the revision on
   * it is what the next save must carry, exactly like `savePlan`. A write that
   * carries a revision the store has already moved past is refused with
   * `preferences.conflict` instead of silently overwriting the other change.
   */
  savePreferences(prefs: UserPreferences): Promise<UserPreferences>;
  getSnapshot(workspaceId: string, instanceId: string): Promise<SessionSnapshot | null>;
  /**
   * The length of one block of a stored session, so a reload keeps what the
   * reader set on the run screen (`SessionEngine.setBlockDuration` is the live
   * half). Nothing else about the snapshot changes.
   */
  saveSessionBlockDuration(
    workspaceId: string,
    instanceId: string,
    blockIndex: number,
    durationMs: number,
  ): Promise<void>;
  getMediaBytes(assetId: string): Promise<ArrayBuffer | null>;
  recordSessionLog(log: SessionLog): Promise<void>;
  recordSessionCompletion(input: {
    workspaceId: string;
    planId: string;
    blockCount: number;
    totalDurationMs: number;
  }): Promise<void>;
  getFirstPreset(workspaceId: string): Promise<BinauralPreset | null>;
  savePreset(preset: BinauralPreset): Promise<BinauralPreset>;
  duplicatePreset(workspaceId: string, presetId: string): Promise<BinauralPreset>;
  deletePreset(workspaceId: string, presetId: string): Promise<void>;
  saveFocusPoint(focus: FocusPoint): Promise<FocusPoint>;
  deleteFocusPoint(workspaceId: string, focusId: string): Promise<void>;
  saveSymbol(symbol: Symbol): Promise<Symbol>;
  deleteSymbol(workspaceId: string, symbolId: string): Promise<void>;
  saveBinding(binding: FocusSymbolBinding): Promise<FocusSymbolBinding>;
  deleteBinding(workspaceId: string, focusPointId: string, symbolId: string): Promise<void>;
  saveIntention(intention: Intention): Promise<Intention>;
  deleteIntention(intentionId: string): Promise<void>;
  saveTableView(view: TableView): Promise<TableView>;
  deleteTableView(workspaceId: string, viewId: string): Promise<void>;
  saveFieldDef(def: FieldDef): Promise<FieldDef>;
  deleteFieldDef(workspaceId: string, fieldDefId: string): Promise<void>;
  saveFieldValue(value: FieldValue): Promise<FieldValue>;
  saveMediaAsset(input: {
    workspaceId: string;
    kind: MediaAsset["kind"];
    name: string;
    bytes: ArrayBuffer;
    mimeType: string;
    durationMs: number;
  }): Promise<MediaAsset>;
  deleteMediaAsset(workspaceId: string, assetId: string): Promise<void>;
};

export function createMeditaurApp(ports: AppPorts): MeditaurApp {
  const nextId = ports.nextId ?? createId;

  async function rememberPlan(userId: string, planId: string): Promise<void> {
    // This bookkeeping write rebases on the stored row rather than comparing, and
    // it retries instead of surfacing a conflict: opening a plan is not a claim
    // on the row, so a race here is not something the reader could act on.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const prefs = await ports.preferences.get(userId);
      if (!prefs || prefs.lastPlanId === planId) return;
      const stored = await ports.preferences.save(
        stampedPreferences({ ...prefs, lastPlanId: planId }, ports.clock.nowMs()),
      );
      if (stored) return;
    }
  }

  /**
   * Every catalogue write goes through this, so a row's revision moves with the
   * row rather than with whichever editor happened to save it (M5 — the basis
   * for the per-row compare-and-swap that sync proper adds). `savePlan` is the
   * same idea with the check already in place.
   */
  function stamped<T extends Versioned>(row: T): T {
    return versionedRow(row, ports.clock.nowMs());
  }

  async function getActivePlan(userId: string, workspaceId: string): Promise<Plan | null> {
    const summaries = await ports.plans.listSummaries(workspaceId);
    if (summaries.length === 0) return null;
    const prefs = await ports.preferences.get(userId);
    const preferred = prefs?.lastPlanId;
    const chosenId =
      preferred && summaries.some((s) => s.id === preferred) ? preferred : summaries[0].id;
    const plan = await ports.plans.getById(chosenId);
    if (!plan) return ports.plans.findFirstInWorkspace(workspaceId);
    await rememberPlan(userId, plan.id);
    return plan;
  }

  async function loadPlans(workspaceId: string): Promise<Plan[]> {
    const summaries = await ports.plans.listSummaries(workspaceId);
    return ports.plans.getMany(summaries.map((s) => s.id));
  }

  /**
   * Applies a patch to every plan block in the workspace, inside the caller's
   * transaction. `null` drops the block, anything else replaces it; `sortOrder`
   * is reindexed and the plan's revision is bumped, so an editor holding a stale
   * copy is refused by the CAS in `savePlan` instead of writing the deleted
   * blocks back. Returns what it changed, for the impact line.
   */
  async function patchPlanBlocks(
    workspaceId: string,
    patch: (block: PlanBlock) => PlanBlock | null,
  ): Promise<{ blocks: number; plans: number }> {
    const plans = await loadPlans(workspaceId);
    let blocks = 0;
    let touchedPlans = 0;
    for (const plan of plans) {
      let changed = false;
      const next: PlanBlock[] = [];
      for (const block of plan.blocks) {
        const patched = patch(block);
        if (patched === null) {
          blocks += 1;
          changed = true;
          continue;
        }
        if (patched !== block) {
          blocks += 1;
          changed = true;
        }
        next.push(patched);
      }
      if (!changed) continue;
      touchedPlans += 1;
      await ports.plans.save({
        ...plan,
        blocks: next.map((block, index) => ({ ...block, sortOrder: index })),
        revision: plan.revision + 1,
      });
    }
    return { blocks, plans: touchedPlans };
  }

  /**
   * What a delete would take with it, said in plain words, for the confirmation
   * the reader sees before the second press. Read-only: nothing is touched here.
   */
  async function describeDeletion(workspaceId: string, kind: DeleteKind, id: string) {
    const plans = await loadPlans(workspaceId);
    let impact: DeletionImpact = NO_DELETION_IMPACT;
    if (kind === "focus") {
      const bindings = await ports.catalog.listBindings(workspaceId);
      const intentions = await ports.catalog.listIntentions(workspaceId);
      const values = await ports.catalog.listFieldValuesForEntityIds([id]);
      impact = focusPointDeletionImpact(id, bindings, intentions, plans, values);
    } else if (kind === "symbol") {
      const bindings = await ports.catalog.listBindings(workspaceId);
      const intentions = await ports.catalog.listIntentions(workspaceId);
      const values = await ports.catalog.listFieldValuesForEntityIds([id]);
      impact = symbolDeletionImpact(id, bindings, intentions, plans, values);
    } else if (kind === "field") {
      const library = await ports.catalog.loadCompileLibrary(workspaceId);
      const def = library.fieldDefs.find((row) => row.id === id);
      impact = {
        ...NO_DELETION_IMPACT,
        fieldValues: library.fieldValues.filter((row) => row.fieldDefId === id).length,
        cleared: def
          ? library.tableViews.filter((view) => view.columnKeys.includes(def.key)).length
          : 0,
      };
    } else if (kind === "preset" || kind === "table" || kind === "media") {
      const blocks = plans.flatMap((plan) => plan.blocks);
      const match = (block: PlanBlock) =>
        kind === "preset"
          ? block.binauralPresetId === id
          : kind === "table"
            ? block.tableViewId === id
            : block.ambientAssetId === id || block.alarmAssetId === id;
      const focusPoints = kind === "media" ? await ports.catalog.listFocusPoints(workspaceId) : [];
      const symbols = kind === "media" ? await ports.catalog.listSymbols(workspaceId) : [];
      const inCatalog =
        kind === "preset"
          ? focusPoints.length
          : kind === "media"
            ? focusPoints.filter((fp) => fp.representationAssetId === id).length +
              symbols.filter((s) => s.imageAssetId === id).length
            : 0;
      impact = {
        ...NO_DELETION_IMPACT,
        cleared: blocks.filter(match).length + inCatalog,
      };
    } else if (kind === "binding") {
      const intentions = await ports.catalog.listIntentions(workspaceId);
      const [focusId, symbolId] = id.split("\u0000");
      impact = {
        ...NO_DELETION_IMPACT,
        intentions: intentions.filter(
          (row) => row.focusPointId === focusId && row.symbolId === symbolId,
        ).length,
      };
    }
    return describeDeletionImpact(impact);
  }

  async function appendSessionLog(log: SessionLog): Promise<void> {
    await ports.logs.append(log);
    await ports.logs.prune(log.workspaceId, SESSION_LOG_LIST_LIMIT);
  }

  const api: MeditaurApp = {
    // A signed-in user is the identity the rest of the app reads; the workspace
    // still comes from bootstrap, which works with or without an account.
    bootstrap: async () => {
      const context = await ports.bootstrap.ensureReady();
      const session = await ports.auth.getSession();
      return session ? { userId: session.userId, workspaceId: context.workspaceId } : context;
    },
    authIsConfigured: () => ports.auth.isConfigured(),
    getAuthSession: () => ports.auth.getSession(),
    signIn: async (email, password) => {
      const address = requireEmail(email);
      const secret = requirePassword(password);
      const session = await ports.auth.signIn(address, secret);
      await ports.workspaces.adopt(session.userId);
      return session;
    },
    signUp: async (email, password) => {
      const address = requireEmail(email);
      const secret = requirePassword(password);
      const outcome = await ports.auth.signUp(address, secret);
      // A new account the provider signed in claims the device's workspace
      // exactly as a sign-in does, so the reader does not start empty. Waiting
      // on confirmation means no session yet, and adoption waits for the real
      // sign-in that follows the link.
      if (outcome.status === "signedIn") await ports.workspaces.adopt(outcome.session.userId);
      return outcome;
    },
    signOut: () => ports.auth.signOut(),
    onAuthSessionChange: (listener) => ports.auth.onSessionChange(listener),
    getActivePlan,
    openPlan: async (userId, workspaceId, planId) => {
      const plan = await ports.plans.getById(planId);
      if (!plan || plan.workspaceId !== workspaceId) return null;
      await rememberPlan(userId, plan.id);
      return plan;
    },
    createPlan: async (userId, workspaceId) => {
      const [library, summaries, prefs] = await Promise.all([
        ports.catalog.loadCompileLibrary(workspaceId),
        ports.plans.listSummaries(workspaceId),
        ports.preferences.get(userId),
      ]);
      const plan = makeStarterPlan({
        id: nextId(),
        workspaceId,
        name: nextPlanName(summaries.map((s) => s.name)),
        autoAdvance: prefs?.autoAdvance ?? true,
        focusBlockId: nextId(),
        cooloffBlockId: nextId(),
        focusPointId: library.focusPoints[0]?.id ?? null,
        binauralPresetId:
          library.focusPoints[0]?.defaultBinauralPresetId ??
          library.presets[0]?.id ??
          null,
        tableViewId: library.tableViews[0]?.id ?? null,
      });
      await ports.plans.save(plan);
      await rememberPlan(userId, plan.id);
      return plan;
    },
    duplicatePlan: async (userId, workspaceId, planId) => {
      const plan = await ports.plans.getById(planId);
      if (!plan || plan.workspaceId !== workspaceId) {
        planFail("missing");
      }
      const summaries = await ports.plans.listSummaries(plan.workspaceId);
      const copy = clonePlan(plan, {
        id: nextId(),
        name: copyPlanName(
          plan.name,
          summaries.map((s) => s.name),
        ),
        nextBlockId: nextId,
      });
      await ports.plans.save(copy);
      await rememberPlan(userId, copy.id);
      return copy;
    },
    deletePlan: async (userId, workspaceId, planId) =>
      ports.runInTransaction(async () => {
        const summaries = await ports.plans.listSummaries(workspaceId);
        if (summaries.length <= 1) {
          planFail("keepOne");
        }
        const next = summaries.find((s) => s.id !== planId);
        if (!next) {
          planFail("keepOne");
        }
        await ports.logs.deleteForPlan(planId);
        await ports.snapshots.prune(planId, 0);
        await ports.plans.delete(planId);
        await rememberPlan(userId, next.id);
        const plan = await ports.plans.getById(next.id);
        if (!plan) {
          planFail("keepOne");
        }
        return plan;
      }),
    getPlan: async (workspaceId, planId) => {
      const plan = await ports.plans.getById(planId);
      return plan && plan.workspaceId === workspaceId ? plan : null;
    },
    savePlan: async (plan) =>
      // The read, the check, and the write share one transaction, so two writers
      // cannot both pass the revision check and store revision + 1.
      ports.runInTransaction(async () => {
        const current = await ports.plans.getById(plan.id);
        if (current && current.revision !== plan.revision) {
          planFail("conflict");
        }
        const next: Plan = { ...plan, revision: (current?.revision ?? plan.revision) + 1 };
        await ports.plans.save(next);
        return next;
      }),
    compileAndStoreSession: async (plan, userId) => {
      const library = await ports.catalog.loadCompileLibrary(plan.workspaceId, plan);
      // The one place "stop binaural when the alarm rings" is read: it is the
      // reader's preference, not a property of the plan. It used to live on the
      // plan as well, and the planner's switch won — so the Settings switch did
      // nothing to an existing plan, which is exactly what the owner hit.
      const prefs = await ports.preferences.get(userId);
      const snapshot = compilePlan(plan, library, {
        now: ports.clock.nowMs(),
        id: nextId,
        durationOverrideMs: ports.durationOverrideMs ?? null,
        stopBinauralOnAlarm: prefs?.stopBinauralOnAlarm ?? true,
      });
      await ports.snapshots.save(snapshot);
      await ports.snapshots.prune(plan.id, SNAPSHOT_KEEP_PER_PLAN);
      return snapshot;
    },
    compileSession: async (userId, workspaceId, planId) => {
      const plan = await ports.plans.getById(planId);
      if (!plan || plan.workspaceId !== workspaceId) {
        planFail("missing");
      }
      return api.compileAndStoreSession(plan, userId);
    },
    startSessionFromFocus: async (userId, workspaceId, focusId) => {
      const library = await ports.catalog.loadCompileLibrary(workspaceId);
      const focus = library.focusPoints.find((row) => row.id === focusId);
      if (!focus) {
        fail("catalog.focusMissing", CATALOG_ERRORS.focusMissing);
      }
      const existing = await ports.plans.getById(FOCUS_SESSION_PLAN_ID);
      const previous = existing?.blocks[0];
      const draft: Plan = {
        id: FOCUS_SESSION_PLAN_ID,
        workspaceId,
        name: FOCUS_SESSION_PLAN_NAME,
        cycleCount: 1,
        cycleUntilStopped: false,
        autoAdvance: existing?.autoAdvance ?? true,
        binauralEnabled: existing?.binauralEnabled !== false,
        revision: existing?.revision ?? 0,
        blocks: [
          {
            id: previous?.id ?? nextId(),
            sortOrder: 0,
            type: "focus",
            durationMs: focus.defaultDurationMs,
            focusPointId: focus.id,
            symbolId: null,
            symbolScope: "all",
            binauralPresetId: focus.defaultBinauralPresetId,
            tableViewId: previous?.tableViewId ?? null,
            ambientAssetId: previous?.ambientAssetId ?? null,
            alarmAssetId: previous?.alarmAssetId ?? null,
          },
        ],
      };
      const saved = await api.savePlan(draft);
      return api.compileAndStoreSession(saved, userId);
    },
    getLibrary: async (workspaceId) => {
      const [library, plans, logs] = await Promise.all([
        ports.catalog.loadCompileLibrary(workspaceId),
        ports.plans.listSummaries(workspaceId),
        ports.logs.listRecent(workspaceId, SESSION_LOG_LIST_LIMIT),
      ]);
      return {
        focusPoints: library.focusPoints,
        symbols: library.symbols,
        bindings: library.bindings,
        intentions: library.intentions,
        fieldDefs: library.fieldDefs,
        fieldValues: library.fieldValues,
        tableViews: library.tableViews,
        presets: library.presets,
        mediaAssets: library.mediaAssets ?? [],
        plans,
        logs,
        sessionsThisWeek: countSessionsThisWeek(logs, ports.clock.nowMs()),
      };
    },
    getDeletionImpact: (workspaceId, kind, id) => describeDeletion(workspaceId, kind, id),
    exportCatalog: async (workspaceId) => {
      const [library, plans, presets] = await Promise.all([
        ports.catalog.loadCompileLibrary(workspaceId),
        loadPlans(workspaceId),
        ports.presets.list(workspaceId),
      ]);
      const mediaAssets = library.mediaAssets ?? [];
      const blobs: CatalogBackup["blobs"] = {};
      for (const asset of mediaAssets) {
        const row = await ports.blobs.get(asset.id);
        if (!row) continue;
        blobs[asset.id] = {
          mimeType: row.mimeType,
          data: encodeCatalogBlob(row.bytes),
        };
      }
      return {
        schemaVersion: CATALOG_BACKUP_SCHEMA_VERSION,
        exportedAt: ports.clock.nowMs(),
        workspaceId,
        focusPoints: library.focusPoints,
        symbols: library.symbols,
        bindings: library.bindings,
        intentions: library.intentions,
        fieldDefs: library.fieldDefs,
        fieldValues: library.fieldValues,
        tableViews: library.tableViews,
        presets,
        mediaAssets,
        blobs,
        plans,
      };
    },
    importCatalog: async (workspaceId, raw) => {
      const backup = bindCatalogToWorkspace(parseCatalogBackup(raw), workspaceId);
      await ports.runInTransaction(async () => {
        for (const preset of backup.presets) {
          await api.savePreset(preset);
        }
        for (const def of backup.fieldDefs) {
          await api.saveFieldDef(def);
        }
        for (const focus of backup.focusPoints) {
          await api.saveFocusPoint(focus);
        }
        for (const view of backup.tableViews) {
          await api.saveTableView(view);
        }
        for (const symbol of backup.symbols) {
          await api.saveSymbol(symbol);
        }
        for (const binding of backup.bindings) {
          await api.saveBinding(binding);
        }
        for (const intention of backup.intentions) {
          await api.saveIntention(intention);
        }
        for (const value of backup.fieldValues) {
          if (!value.text.trim()) continue;
          await api.saveFieldValue(value);
        }
        for (const asset of backup.mediaAssets) {
          await ports.catalog.saveMediaAsset(stamped(asset));
          const blob = backup.blobs[asset.id];
          if (!blob) continue;
          const bytes = requireMediaBytes(decodeCatalogBlob(blob.data), asset.kind);
          const mimeType = requireMediaMime(blob.mimeType, asset.kind);
          await ports.blobs.put(asset.id, bytes, mimeType);
        }
        for (const plan of backup.plans) {
          await ports.plans.save(plan);
        }
      });
    },
    getPreferences: (userId) => ports.preferences.get(userId),
    savePreferences: async (prefs) => {
      // The store is the compare-and-swap: it holds the check and the write on
      // its own side (one Dexie transaction locally, one conditional update
      // remotely), which is the only way the check can be atomic once a
      // preference write may be a network call. The row handed over carries the
      // revision this caller read; the store is what moves it.
      const stored = await ports.preferences.save(
        stampedPreferences(prefs, ports.clock.nowMs()),
      );
      if (!stored) preferencesConflict();
      return stored;
    },
    getSnapshot: async (workspaceId, instanceId) => {
      const snapshot = await ports.snapshots.get(instanceId);
      if (!snapshot) return null;
      const plan = await ports.plans.getById(snapshot.planId);
      return plan && plan.workspaceId === workspaceId ? snapshot : null;
    },
    saveSessionBlockDuration: async (workspaceId, instanceId, blockIndex, durationMs) => {
      if (durationMs <= 0) return;
      const snapshot = await ports.snapshots.get(instanceId);
      if (!snapshot) return;
      const plan = await ports.plans.getById(snapshot.planId);
      if (!plan || plan.workspaceId !== workspaceId) return;
      await ports.snapshots.save({
        ...snapshot,
        blocks: snapshot.blocks.map((block, index) =>
          index === blockIndex ? { ...block, durationMs } : block,
        ),
      });
    },
    getMediaBytes: async (assetId) => {
      const row = await ports.blobs.get(assetId);
      return row?.bytes ?? null;
    },
    recordSessionLog: (log) => appendSessionLog(log),
    recordSessionCompletion: (input) =>
      appendSessionLog({
        id: nextId(),
        workspaceId: input.workspaceId,
        planId: input.planId,
        completedAt: ports.clock.nowMs(),
        blockCount: input.blockCount,
        totalDurationMs: input.totalDurationMs,
      }),
    getFirstPreset: (workspaceId) => ports.presets.getFirst(workspaceId),
    savePreset: async (preset) => {
      if (
        preset.leftTones.length > MAX_TONES_PER_EAR ||
        preset.rightTones.length > MAX_TONES_PER_EAR
      ) {
        fail("compile.toneCap", `At most ${MAX_TONES_PER_EAR} tones per ear`);
      }
      const next = stamped({ ...preset, name: requireName(preset.name) });
      await ports.presets.save(next);
      return next;
    },
    duplicatePreset: async (workspaceId, presetId) => {
      const listed = await ports.presets.list(workspaceId);
      const preset = listed.find((row) => row.id === presetId);
      if (!preset) {
        presetFail("missing");
      }
      const copy = clonePreset(preset, {
        id: nextId(),
        name: copyPlanName(
          preset.name,
          listed.map((row) => row.name),
        ),
      });
      await ports.presets.save(stamped(copy));
      return stamped(copy);
    },
    deletePreset: async (workspaceId, presetId) =>
      ports.runInTransaction(async () => {
        const listed = await ports.presets.list(workspaceId);
        // Keeping one preset is the last refusal left in the catalogue: with none
        // there is nothing to assign a block. Everything that *used* this preset
        // is cleared instead of blocking the delete.
        if (listed.length <= 1) catalogFail("keepOnePreset");
        const focusPoints = await ports.catalog.listFocusPoints(workspaceId);
        for (const focus of focusPoints) {
          if (focus.defaultBinauralPresetId === presetId) {
            await ports.catalog.saveFocusPoint(
              stamped({ ...focus, defaultBinauralPresetId: null }),
            );
          }
        }
        await patchPlanBlocks(workspaceId, (block) =>
          block.binauralPresetId === presetId ? { ...block, binauralPresetId: null } : block,
        );
        await ports.presets.delete(presetId);
      }),
    saveFocusPoint: async (focus) => {
      const next = stamped({
        ...focus,
        name: requireName(focus.name),
        locationText: focus.locationText.trim(),
      });
      await ports.catalog.saveFocusPoint(next);
      return next;
    },
    deleteFocusPoint: async (workspaceId, focusId) =>
      ports.runInTransaction(async () => {
        const bindings = await ports.catalog.listBindings(workspaceId);
        const intentions = await ports.catalog.listIntentions(workspaceId);
        const fieldValues = await ports.catalog.listFieldValuesForEntityIds([focusId]);
        for (const row of bindings.filter((b) => b.focusPointId === focusId)) {
          await ports.catalog.deleteBinding(row.focusPointId, row.symbolId);
        }
        for (const row of intentions.filter((row) => row.focusPointId === focusId)) {
          await ports.catalog.deleteIntention(row.id);
        }
        for (const row of fieldValues) {
          await ports.catalog.deleteFieldValue(row.entityId, row.fieldDefId);
        }
        // The owner's rule: removed from the library means removed from the
        // plans. `getDeletionImpact` is what tells the reader, before the second
        // press, how many blocks that is.
        await patchPlanBlocks(workspaceId, (block) =>
          block.focusPointId === focusId ? null : block,
        );
        await ports.catalog.deleteFocusPoint(focusId);
      }),
    saveSymbol: async (symbol) => {
      const next = stamped({
        ...symbol,
        name: requireName(symbol.name),
        description: symbol.description.trim(),
        usage: symbol.usage.trim(),
      });
      await ports.catalog.saveSymbol(next);
      return next;
    },
    deleteSymbol: async (workspaceId, symbolId) =>
      ports.runInTransaction(async () => {
        const bindings = await ports.catalog.listBindings(workspaceId);
        const intentions = await ports.catalog.listIntentions(workspaceId);
        const fieldValues = await ports.catalog.listFieldValuesForEntityIds([symbolId]);
        for (const row of bindings.filter((b) => b.symbolId === symbolId)) {
          await ports.catalog.deleteBinding(row.focusPointId, row.symbolId);
        }
        for (const row of intentions.filter((row) => row.symbolId === symbolId)) {
          await ports.catalog.deleteIntention(row.id);
        }
        for (const row of fieldValues) {
          await ports.catalog.deleteFieldValue(row.entityId, row.fieldDefId);
        }
        // A block that named this symbol keeps its place and goes back to
        // walking whatever symbols its focus point still has.
        await patchPlanBlocks(workspaceId, (block) =>
          block.symbolId === symbolId
            ? { ...block, symbolId: null, symbolScope: "rotate" }
            : block,
        );
        await ports.catalog.deleteSymbol(symbolId);
      }),
    saveBinding: async (binding) => {
      await ports.catalog.saveBinding(binding);
      return binding;
    },
    deleteBinding: async (workspaceId, focusPointId, symbolId) =>
      ports.runInTransaction(async () => {
        // An intention written about *this pair* has nothing left to hang on, so
        // it goes with the attachment.
        const intentions = await ports.catalog.listIntentions(workspaceId);
        for (const row of intentions) {
          if (row.focusPointId === focusPointId && row.symbolId === symbolId) {
            await ports.catalog.deleteIntention(row.id);
          }
        }
        await ports.catalog.deleteBinding(focusPointId, symbolId);
      }),
    saveIntention: async (intention) => {
      const next = stamped({ ...intention, text: requireText(intention.text) });
      if (next.focusPointId) {
        const bindings = await ports.catalog.listBindingsForFocus(next.focusPointId);
        assertIntentionSavable(next, bindings);
      } else {
        assertIntentionSavable(next, []);
      }
      await ports.catalog.saveIntention(next);
      return next;
    },
    deleteIntention: (intentionId) => ports.catalog.deleteIntention(intentionId),
    saveTableView: async (view) => {
      const next = stamped({
        ...view,
        name: requireName(view.name),
        columnKeys: requireColumnKeys(view.columnKeys),
      });
      await ports.catalog.saveTableView(next);
      return next;
    },
    deleteTableView: async (workspaceId, viewId) =>
      ports.runInTransaction(async () => {
        const library = await ports.catalog.loadCompileLibrary(workspaceId);
        if (library.tableViews.length <= 1) catalogFail("keepOneTableView");
        await patchPlanBlocks(workspaceId, (block) =>
          block.tableViewId === viewId ? { ...block, tableViewId: null } : block,
        );
        await ports.catalog.deleteTableView(viewId);
      }),
    saveFieldDef: async (def) => {
      const library = await ports.catalog.loadCompileLibrary(def.workspaceId);
      // A new field is named by its heading alone; the key it is stored under is
      // derived here, once. A field that already has a key keeps it, so renaming
      // a heading cannot strand the table views that list the column — and an
      // empty key is treated as a new one, because the editor never asks for
      // one and therefore has none to send.
      const keyed = def.key.trim()
        ? def
        : { ...def, key: fieldKeyFor(def, library.fieldDefs) };
      const next = stamped({
        ...keyed,
        key: assertFieldDefSavable(keyed, library.fieldDefs, library.tableViews),
        label: requireName(keyed.label),
        description: keyed.description?.trim() ?? "",
      });
      await ports.catalog.saveFieldDef(next);
      return next;
    },
    deleteFieldDef: async (workspaceId, fieldDefId) =>
      ports.runInTransaction(async () => {
        const library = await ports.catalog.loadCompileLibrary(workspaceId);
        const def = library.fieldDefs.find((row) => row.id === fieldDefId);
        for (const row of library.fieldValues) {
          if (row.fieldDefId === fieldDefId) {
            await ports.catalog.deleteFieldValue(row.entityId, row.fieldDefId);
          }
        }
        if (def) {
          for (const view of library.tableViews) {
            if (!view.columnKeys.includes(def.key)) continue;
            const columnKeys = view.columnKeys.filter((key) => key !== def.key);
            // A view always keeps something to show: dropping the last custom
            // column falls back to the built-ins rather than to no columns.
            await ports.catalog.saveTableView(
              stamped({
                ...view,
                columnKeys: columnKeys.length > 0 ? columnKeys : [...BUILTIN_COLUMN_KEYS],
              }),
            );
          }
        }
        await ports.catalog.deleteFieldDef(fieldDefId);
      }),
    saveFieldValue: async (value) => {
      const text = value.text.trim();
      if (!text) {
        await ports.catalog.deleteFieldValue(value.entityId, value.fieldDefId);
        return { ...value, text: "" };
      }
      const next = stamped({ ...value, text });
      await ports.catalog.saveFieldValue(next);
      return next;
    },
    saveMediaAsset: async (input) => {
      const bytes = requireMediaBytes(input.bytes, input.kind);
      const mimeType = requireMediaMime(input.mimeType, input.kind);
      const asset = stamped(
        mediaAssetFromUpload({
          id: nextId(),
          workspaceId: input.workspaceId,
          kind: input.kind,
          name: input.name,
          durationMs: input.kind === "image" ? 0 : input.durationMs,
        }),
      );
      await ports.runInTransaction(async () => {
        await ports.blobs.put(asset.id, bytes, mimeType);
        await ports.catalog.saveMediaAsset(asset);
      });
      return asset;
    },
    deleteMediaAsset: async (workspaceId, assetId) =>
      ports.runInTransaction(async () => {
        // The picture or sound a reader assigned is cleared, not the thing the
        // picture was on: an asset is a file, and a symbol outlives its image.
        const focusPoints = await ports.catalog.listFocusPoints(workspaceId);
        for (const focus of focusPoints) {
          if (focus.representationAssetId === assetId) {
            await ports.catalog.saveFocusPoint(
              stamped({ ...focus, representationAssetId: null }),
            );
          }
        }
        const symbols = await ports.catalog.listSymbols(workspaceId);
        for (const symbol of symbols) {
          if (symbol.imageAssetId === assetId) {
            await ports.catalog.saveSymbol(stamped({ ...symbol, imageAssetId: null }));
          }
        }
        await patchPlanBlocks(workspaceId, (block) => {
          const ambient = block.ambientAssetId === assetId ? null : block.ambientAssetId;
          const alarm = block.alarmAssetId === assetId ? null : block.alarmAssetId;
          if (ambient === block.ambientAssetId && alarm === block.alarmAssetId) return block;
          return { ...block, ambientAssetId: ambient, alarmAssetId: alarm };
        });
        await ports.catalog.deleteMediaAsset(assetId);
        await ports.blobs.delete(assetId);
      }),
  };
  return api;
}
