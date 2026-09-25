import {
  compilePlan,
  createId,
  fail,
  normalizePlanDisplay,
  stagesForMeditation,
  visibleSymbols,
  withoutMeditations,
  DEFAULT_ALARM_ENABLED,
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_PLAN_DISPLAY,
  MAX_TONES_PER_EAR,
  SESSION_LOG_LIST_LIMIT,
  SNAPSHOT_KEEP_PER_PLAN,
  type Entry,
  type AccountFlags,
  type AccountPort,
  type AdminAccount,
  type AdminPort,
  type AuthPort,
  type AuthSession,
  type BinauralPreset,
  type BlobStore,
  type BootstrapPort,
  type CatalogRepository,
  type Clock,
  type EventPort,
  type FieldDef,
  type FeatureFlags,
  type FeatureFlagsPort,
  type FieldOption,
  type FieldValue,
  type Meditation,
  type Intention,
  type MaintenancePort,
  type MediaAsset,
  type MeditationType,
  type Plan,
  type PlanBlock,
  type PlanBlockStage,
  type PlanDisplay,
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
  type SyncPort,
  type UserPreferences,
  type Versioned,
  type WorkspaceRepository,
} from "@meditaur/domain";
import { clientErrorPayload } from "./events.ts";
import {
  CATALOG_BACKUP_SCHEMA_VERSION,
  bindCatalogToWorkspace,
  decodeCatalogBlob,
  encodeCatalogBlob,
  parseCatalogBackup,
  type CatalogBackup,
} from "./catalog-backup.ts";
import { noUpdatedRows, oneRowChangeSet, type CatalogChangeSet } from "./catalog-change.ts";
import {
  assertFieldDefSavable,
  catalogFail,
  fieldKeyFor,
  requireName,
  requireText,
  CATALOG_ERRORS,
} from "./catalog-writes.ts";
import {
  describeDeletionImpact,
  entryImpact,
  fieldImpact,
  meditationImpact,
  lineImpact,
  meditationTypeImpact,
  presetImpact,
  symbolImpact,
  NO_DELETION_IMPACT,
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
  MEDITATION_SESSION_PLAN_NAME,
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
  /**
   * The meditation types, in order. A tab, a Database table and a plan group are
   * generated from these rows — a reader who adds one gets all three with nothing
   * to register.
   */
  meditationTypes: MeditationType[];
  meditations: Meditation[];
  symbols: Symbol[];
  /**
   * Every sentence in the workspace, in the reader's order, orphans included.
   *
   * The owner's round 16, §2.1: an affirmation and an intention are one table, so
   * this is the list the Affirmations table draws and the list a block's sentences
   * come from. A sentence with `entryId: null` is written about nothing yet.
   */
  intentions: Intention[];
  /** Every row of the Entries table, archived ones included. */
  entries: Entry[];
  /**
   * The columns of all three tables. `cellType` and `refKind` are what the grid
   * draws and what the plan's display resolves.
   */
  fieldDefs: FieldDef[];
  /** The options of every `select` column. */
  fieldOptions: FieldOption[];
  fieldValues: FieldValue[];
  presets: BinauralPreset[];
  mediaAssets: MediaAsset[];
  plans: { id: string; name: string }[];
  logs: SessionLog[];
  sessionsThisWeek: number;
};

export type AppPorts = {
  bootstrap: BootstrapPort;
  auth: AuthPort;
  /**
   * Closing the account, as opposed to signing out of it or erasing the device.
   * A build with no cloud pair is wired to an adapter that refuses.
   */
  account: AccountPort;
  /**
   * The account's flags (`P0 · 23`), read-only. Never absent: a build with no cloud pair
   * is wired to an adapter that answers the defaults, so nothing above this has to ask
   * whether flags can be read at all.
   */
  flags: FeatureFlagsPort;
  /**
   * The owner's own tool (`P0 · 23`, slice 23f). Never absent: a build with no cloud pair
   * is wired to an adapter that refuses, so the panel asks `adminIsConfigured()` on both
   * builds rather than checking for a hole.
   *
   * Being wired is not being allowed. The `admin` function re-checks the caller's marker
   * on every request, so the screen's own `isAdmin` gate is an affordance and this port is
   * not a boundary.
   */
  admin: AdminPort;
  /**
   * Where an event the app records about itself goes. Append-only, and one
   * write path: the store it lands in is a deployment question, not the app's.
   */
  events: EventPort;
  workspaces: WorkspaceRepository;
  plans: PlanRepository;
  catalog: CatalogRepository;
  blobs: BlobStore;
  presets: PresetRepository;
  preferences: PreferencesRepository;
  snapshots: SnapshotRepository;
  logs: SessionLogRepository;
  maintenance: MaintenancePort;
  /**
   * One run of the sync protocol (`P2 · 3`, slice 3). Never absent: a build with
   * no cloud pair is wired to an adapter that reports nothing sent and nothing
   * received, so nothing above this has to ask whether syncing is possible.
   */
  sync: SyncPort;
  clock: Clock;
  runInTransaction: <T>(work: () => Promise<T>) => Promise<T>;
  nextId?: () => string;
  durationOverrideMs?: number | null;
};

/** What an operation can be asked about, for `getDeletionImpact`. */
export type DeleteKind =
  | "meditation"
  | "meditationType"
  | "symbol"
  | "entry"
  | "line"
  | "preset"
  | "field"
  | "media";

/** A record, for the two operations that address one by kind. */
export type RecordKind =
  | "meditation"
  | "meditationType"
  | "symbol"
  | "preset";

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
  /**
   * Whether this build can close an account at all. False with no cloud pair,
   * so a screen has something to ask before it offers the affordance.
   */
  accountIsConfigured(): boolean;
  /**
   * Close the reader's account: their data and their identity, not one of them.
   * Separate from `wipeLocalData()`, which erases this device and signs nobody
   * out — the reader is told which erasure they are doing.
   */
  closeAccount(): Promise<void>;
  /**
   * The flags the app is gated by (`P0 · 23`, slice 23d).
   *
   * Resolved here rather than by a screen so that exactly one place decides what a
   * signed-out device sees: with nobody signed in there is no account to read, and the
   * answer is every default — the app a reader gets before any account exists, which is
   * the app that existed before flags did.
   *
   * The answer is always complete: an account with no row, a row that predates a flag, or
   * a read that failed and fell back to this device's mirror all resolve to a set a screen
   * can ask about without a third state to handle.
   */
  getFeatureFlags(): Promise<AccountFlags>;
  /**
   * Whether this build can reach the admin function at all (`P0 · 23`, slice 23f).
   *
   * It answers about the *build*, not about the caller: whether an account may open the
   * panel is `isAdmin`, which the function checks again on every request. The two are
   * separate so a screen can say "this deployment cannot" rather than showing a form that
   * fails on press.
   */
  adminIsConfigured(): boolean;
  /** Every account, for the panel's table. */
  listAccounts(): Promise<AdminAccount[]>;
  /**
   * Set one account's flags, and answer with the stored row so a panel patches the row it
   * drew rather than re-reading every account.
   */
  setAccountFlags(userId: string, flags: Partial<FeatureFlags>): Promise<AccountFlags>;
  /**
   * Create an account (`P0 · 23`, slice 23f). The address is confirmed on the spot,
   * because this deployment has no mailer — so `confirmationRequired` cannot arise here,
   * which is what the panel's copy tells the owner.
   */
  createAccount(email: string, password: string): Promise<{ userId: string; email: string }>;
  /**
   * The hand-run reset: the owner chooses the password and hands it over. No mail is sent
   * and none is needed, which is `DECISIONS.md` §11's answer to password recovery.
   */
  setAccountPassword(userId: string, password: string): Promise<void>;
  /**
   * Sync this device with the cloud once (`P2 · 3`, slice 3).
   *
   * Never throws, and returns nothing a screen could draw. The store is
   * local-first, so a run that fails leaves this device exactly as it was and the
   * next run re-reads from the watermarks the failed one did not move — which is
   * why a failure is swallowed here rather than reported: a reader who never
   * asked to sync must not meet an error about it.
   *
   * `workspaceId` is the one `bootstrap()` handed back, passed in rather than read
   * again so a run cannot sync a workspace the caller's screen is no longer on.
   */
  syncNow(workspaceId: string): Promise<void>;
  /**
   * Record a client-side error: a render that threw, or a promise nobody
   * handled.
   *
   * Never throws and never blocks the screen — a reporter that fails must not
   * become the second failure. The reader never waits on it, and nothing it
   * stores is shown back to them; this exists so a broken screen is not
   * invisible to whoever looks after the deployment.
   */
  recordClientError(input: { message: string; stack?: string | null; route?: string | null }): Promise<void>;
  getActivePlan(userId: string, workspaceId: string): Promise<Plan | null>;
  openPlan(userId: string, workspaceId: string, planId: string): Promise<Plan | null>;
  createPlan(userId: string, workspaceId: string): Promise<Plan>;
  duplicatePlan(userId: string, workspaceId: string, planId: string): Promise<Plan>;
  deletePlan(userId: string, workspaceId: string, planId: string): Promise<Plan>;
  getPlan(workspaceId: string, planId: string): Promise<Plan | null>;
  savePlan(plan: Plan): Promise<Plan>;
  compileAndStoreSession(plan: Plan, userId: string): Promise<SessionSnapshot>;
  compileSession(userId: string, workspaceId: string, planId: string): Promise<SessionSnapshot>;
  startSessionFromMeditation(
    userId: string,
    workspaceId: string,
    meditationId: string,
  ): Promise<SessionSnapshot>;
  getLibrary(workspaceId: string): Promise<LibraryView>;
  /**
   * The plan list on its own, in the storage adapter's own order.
   *
   * A screen that has just created, duplicated or removed a plan needs this one
   * small list to be right, not the whole catalogue again: `getLibrary` is nine
   * scans, and re-reading all of them to keep a two-field list honest is what
   * `P2 · 4` exists to stop. It is `listSummaries` verbatim — the same call the
   * full load makes — so the order is the order a refetch would have produced,
   * and nothing re-derives it.
   */
  listPlans(workspaceId: string): Promise<LibraryView["plans"]>;
  /**
   * What deleting this would also take with it, as a sentence for the delete
   * confirmation ("This also removes 3 blocks from 2 plans."). Empty when the
   * delete affects nothing else.
   */
  getDeletionImpact(
    workspaceId: string,
    kind: DeleteKind,
    id: string,
    mode?: "archive" | "delete",
  ): Promise<string>;
  exportCatalog(workspaceId: string): Promise<CatalogBackup>;
  importCatalog(workspaceId: string, raw: unknown): Promise<void>;
  /**
   * Erase every row this device holds, and start again from the default
   * catalogue. It does not sign anybody out: the account and the device are
   * separate erasures, and the reader is told which one they are doing.
   */
  wipeLocalData(): Promise<void>;
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
   * One stage's length, so a reload keeps what the reader set on the run screen
   * (`SessionEngine.setStageDuration` is the live half). Nothing else about the
   * snapshot changes, and the plan block the session came from is written too —
   * §12.19, "the last saved value is the one a session starts with".
   */
  saveSessionStageDuration(
    workspaceId: string,
    instanceId: string,
    blockIndex: number,
    stageIndex: number,
    durationMs: number,
  ): Promise<void>;
  /**
   * One stage's own switch — `binaural` or `autoScroll` — set from the run screen.
   *
   * The same write-back as the length beside it, and for the same reason (§12.19):
   * the switch takes effect at that stage and the plan block keeps it, so the next
   * session starts from the last saved value. The flags are per **stage** (§12.21),
   * which is why they are addressed by index rather than stamped on the session.
   */
  saveSessionStageFlag(
    workspaceId: string,
    instanceId: string,
    blockIndex: number,
    stageIndex: number,
    flag: "binaural" | "autoScroll",
    value: boolean,
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
  /**
   * Remove a preset, clearing every reference to it.
   *
   * The answer is a `CatalogChangeSet` rather than nothing, because the cascade
   * rewrites rows the deleted id cannot name (`P2 · 4`): the meditations whose
   * default sound it was and the plan blocks that played it.
   */
  deletePreset(workspaceId: string, presetId: string): Promise<CatalogChangeSet>;
  saveMeditationType(row: MeditationType): Promise<MeditationType>;
  saveMeditation(focus: Meditation): Promise<Meditation>;
  deleteMeditation(workspaceId: string, meditationId: string): Promise<CatalogChangeSet>;
  /**
   * Remove a meditation type, and every meditation that named it.
   *
   * A meditation whose type is gone could not be shown, filtered or picked
   * anywhere, so there is no state to leave behind: the same steps
   * `deleteMeditation` takes run for each of the type's meditations first — and
   * so is the answer, which names the type, the meditations and the lines that
   * all went with it (`P2 · 4`).
   */
  deleteMeditationType(workspaceId: string, typeId: string): Promise<CatalogChangeSet>;
  saveSymbol(symbol: Symbol): Promise<Symbol>;
  /**
   * Remove a symbol, and the rows that connect to it.
   *
   * The same answer as `deletePreset`, for the same reason: the entries that
   * named the symbol, the lines inside them and the plans whose blocks used it
   * are all rewritten or removed on the way, and only the store knows which ones
   * they were (`P2 · 4`).
   */
  deleteSymbol(workspaceId: string, symbolId: string): Promise<CatalogChangeSet>;

  /**
   * The Entry table's five levels of §4, as the operations that back them.
   *
   * Archiving is the recoverable half and it touches nothing else: a row or a
   * record that steps aside is hidden by the visibility rule, so Restore brings it
   * back exactly as it was, with its lines, its values and its place in a plan.
   * Removing destroys, and for a record the only place it is offered is the
   * Archive page.
   */
  saveEntry(entry: Entry): Promise<Entry>;
  deleteEntry(workspaceId: string, entryId: string): Promise<void>;
  archiveEntry(workspaceId: string, entryId: string): Promise<CatalogChangeSet>;
  restoreEntry(workspaceId: string, entryId: string): Promise<CatalogChangeSet>;
  reorderEntries(workspaceId: string, entryIds: string[]): Promise<void>;
  /**
   * A line is the row the spec calls it: one sentence inside a row's Intentions
   * cell. These write `Intention` rows, and the name is the reader's word for it.
   *
   * A line with **no** entry is the orphan the owner's round 16 put in the
   * Affirmations table: a sentence written about nothing yet (§2.1), which is what
   * the merge made possible and what `saveLine` therefore allows.
   */
  saveLine(line: Intention): Promise<Intention>;
  deleteLine(workspaceId: string, lineId: string): Promise<void>;
  archiveLine(workspaceId: string, lineId: string): Promise<CatalogChangeSet>;
  restoreLine(workspaceId: string, lineId: string): Promise<CatalogChangeSet>;
  reorderLines(workspaceId: string, entryId: string, lineIds: string[]): Promise<void>;
  /** A record steps aside, or comes back. Nothing that depends on it is touched. */
  archiveRecord(workspaceId: string, kind: RecordKind, id: string): Promise<CatalogChangeSet>;
  restoreRecord(workspaceId: string, kind: RecordKind, id: string): Promise<CatalogChangeSet>;
  /**
   * Archive every row among `entryIds` that has nothing left to point at, and say
   * which ones.
   *
   * This is Save's last step (§7), and it takes the draft's ids rather than asking
   * the store: a row the reader cleared and then filled in again before Save has a
   * reference by the time Save runs, and it must survive. The report names up to
   * five and counts the rest.
   */
  sweepOrphanedEntries(
    workspaceId: string,
    entryIds: string[],
  ): Promise<{ swept: { id: string; label: string }[]; total: number }>;

  saveFieldDef(def: FieldDef): Promise<FieldDef>;
  deleteFieldDef(workspaceId: string, fieldDefId: string): Promise<void>;
  saveFieldOption(option: FieldOption): Promise<FieldOption>;
  deleteFieldOption(workspaceId: string, optionId: string): Promise<void>;
  saveFieldValue(value: FieldValue): Promise<FieldValue>;
  /** What a session shows, stored on the plan (§9). */
  savePlanDisplay(
    workspaceId: string,
    planId: string,
    display: PlanDisplay,
  ): Promise<Plan>;
  saveMediaAsset(input: {
    workspaceId: string;
    kind: MediaAsset["kind"];
    name: string;
    bytes: ArrayBuffer;
    mimeType: string;
    durationMs: number;
  }): Promise<MediaAsset>;
  /**
   * Remove a file, clearing every reference to it.
   *
   * The same answer as `deletePreset`, for the same reason: the meditations, the
   * symbols and the plan blocks that pointed at it are rewritten on the way, and
   * only the store knows which ones they were.
   */
  deleteMediaAsset(workspaceId: string, assetId: string): Promise<CatalogChangeSet>;
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
   * row rather than with whichever editor happened to save it (the catalogue's revision — the basis
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
   * Rows in the order the reader put them in.
   *
   * Order is a column on the row, not a property of the query, so a store that
   * hands rows back in its own order is fine — this is where the reader's order is
   * restored. Ties break on id, so two rows that share an order still come out the
   * same way twice.
   */
  function byOrder<T extends { id: string; sortOrder: number }>(rows: T[]): T[] {
    return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  }

  function firstLive<T extends { id: string; sortOrder: number; archivedAt: number | null }>(
    rows: T[],
  ): T | undefined {
    return byOrder(rows).find((row) => row.archivedAt == null);
  }

  /** How many swept rows the Save report names before it starts counting (§12.26). */
  const SWEEP_REPORT_LIMIT = 5;

  /**
   * Destroy rows and everything that hangs off them.
   *
   * A row's lines and its column values belong to it. Postgres says so with `on
   * delete cascade` for the lines, but `field_values.entity_id` is polymorphic and
   * carries no foreign key at all, so the application is what cleans them up here
   * and on the server alike.
   */
  async function deleteRows(entryIds: string[]): Promise<void> {
    for (const entryId of entryIds) {
      await deleteValues([entryId]);
      await ports.catalog.deleteEntry(entryId);
    }
  }

  async function deleteValues(entityIds: string[]): Promise<void> {
    for (const row of await ports.catalog.listFieldValuesForEntityIds(entityIds)) {
      await ports.catalog.deleteFieldValue(row.entityId, row.fieldDefId);
    }
  }

  /**
   * The ids of the lines inside a set of rows, read **before** the rows go.
   *
   * A line belongs to its row — `deleteEntry` is what enforces that locally, and
   * `on delete cascade` says it on the server — so once the rows are deleted there
   * is nothing left to ask which lines they held. A change-set has to name them
   * (`P2 · 4`), which is why this read happens on the way in rather than after.
   */
  async function lineIdsInside(workspaceId: string, entryIds: string[]): Promise<string[]> {
    if (entryIds.length === 0) return [];
    const inside = new Set(entryIds);
    const lines = await ports.catalog.listIntentions(workspaceId);
    return lines
      .filter((row) => row.entryId !== null && inside.has(row.entryId))
      .map((row) => row.id);
  }

  async function findEntry(workspaceId: string, entryId: string): Promise<Entry | null> {
    return (await ports.catalog.listEntries(workspaceId)).find((row) => row.id === entryId) ?? null;
  }

  async function findLine(workspaceId: string, lineId: string): Promise<Intention | null> {
    return (
      (await ports.catalog.listIntentions(workspaceId)).find((row) => row.id === lineId) ?? null
    );
  }

  /**
   * Step a record aside, or bring it back.
   *
   * This is the whole of archiving. Nothing that depends on the record is copied,
   * moved or edited — the visibility rule is what hides it (§3.1) — so Restore is
   * exact by construction, and a chakra's rows, its lines and its blocks in a plan
   * come back with it.
   *
   * It answers with the row it stored, because that is the whole of what changed
   * (`P2 · 4`): an archive is a rewrite of one row's `archivedAt`, so a screen
   * holding that row's table has everything it needs to patch instead of re-reading
   * the catalogue. `removed` is empty by construction, and `oneRowChangeSet` is what
   * says so.
   */
  async function setRecordArchived(
    workspaceId: string,
    kind: RecordKind,
    id: string,
    archivedAt: number | null,
  ): Promise<CatalogChangeSet> {
    if (kind === "meditationType") {
      // Only the type row moves. Its meditations keep their own `archivedAt` and
      // are hidden because *no live type names a tab or a table for them* — the
      // same "nothing is copied or moved" rule the rule above states, which is
      // what makes Restore exact here too.
      const row = (await ports.catalog.listMeditationTypes(workspaceId)).find((r) => r.id === id);
      if (!row) catalogFail("meditationTypeMissing");
      const stored = stamped({ ...row, archivedAt });
      await ports.catalog.saveMeditationType(stored);
      return oneRowChangeSet({ meditationTypes: [stored] });
    }
    if (kind === "meditation") {
      const row = (await ports.catalog.listMeditations(workspaceId)).find((r) => r.id === id);
      if (!row) catalogFail("focusMissing");
      const stored = stamped({ ...row, archivedAt });
      await ports.catalog.saveMeditation(stored);
      return oneRowChangeSet({ meditations: [stored] });
    }
    if (kind === "symbol") {
      const row = (await ports.catalog.listSymbols(workspaceId)).find((r) => r.id === id);
      if (!row) catalogFail("symbolMissing");
      const stored = stamped({ ...row, archivedAt });
      await ports.catalog.saveSymbol(stored);
      return oneRowChangeSet({ symbols: [stored] });
    }
    const row = (await ports.presets.list(workspaceId)).find((r) => r.id === id);
    if (!row) presetFail("missing");
    const stored = stamped({ ...row, archivedAt });
    await ports.presets.save(stored);
    // The preset row, not just its id: a *step aside* keeps the row, and the row is
    // what the Archive page has to redraw it from (`P2 · 4`).
    return oneRowChangeSet({ presets: [stored] });
  }

  /**
   * Applies a patch to every plan block in the workspace, inside the caller's
   * transaction. `null` drops the block, anything else replaces it; `sortOrder`
   * is reindexed and the plan's revision is bumped, so an editor holding a stale
   * copy is refused by the CAS in `savePlan` instead of writing the deleted
   * blocks back.
   *
   * It answers with the plans it stored rather than a count: those rows are what a
   * `CatalogChangeSet` hands to the screen that was showing them, and a count
   * cannot be patched into a list (`P2 · 4`).
   */
  async function patchPlanBlocks(
    workspaceId: string,
    patch: (block: PlanBlock) => PlanBlock | null,
  ): Promise<{ blocks: number; plans: Plan[] }> {
    const plans = await loadPlans(workspaceId);
    const written: Plan[] = [];
    let blocks = 0;
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
      const saved: Plan = {
        ...plan,
        blocks: next.map((block, index) => ({ ...block, sortOrder: index })),
        revision: plan.revision + 1,
      };
      await ports.plans.save(saved);
      written.push(saved);
    }
    return { blocks, plans: written };
  }

  /**
   * What an operation at this level would do, in plain words, for the control the
   * reader is about to press (§4). Read-only: nothing is touched here.
   *
   * `mode` decides the verb. The same counts are reported for archiving and for
   * removing because the same things are involved — one steps aside and the other
   * stops existing — and the sentence is where that difference is said out loud.
   */
  async function describeDeletion(
    workspaceId: string,
    kind: DeleteKind,
    id: string,
    mode: "archive" | "delete" = "delete",
  ): Promise<string> {
    const plans = await loadPlans(workspaceId);
    const entries = await ports.catalog.listEntries(workspaceId);
    const lines = await ports.catalog.listIntentions(workspaceId);
    const values = await ports.catalog.listFieldValuesForEntityIds([
      id,
      ...entries.map((row) => row.id),
    ]);
    let impact: DeletionImpact;
    if (kind === "meditation" || kind === "symbol" || kind === "preset") {
      const library = await ports.catalog.loadCompileLibrary(workspaceId);
      const name =
        kind === "meditation"
          ? (library.meditations.find((row) => row.id === id)?.name ?? null)
          : kind === "symbol"
            ? (library.symbols.find((row) => row.id === id)?.name ?? null)
            : (library.presets.find((row) => row.id === id)?.name ?? null);
      if (kind === "meditation") {
        impact = meditationImpact({ mode, name, id, entries, lines, plans, fieldValues: values });
      } else if (kind === "symbol") {
        impact = symbolImpact({ mode, name, id, entries, lines, plans, fieldValues: values });
      } else {
        impact = presetImpact({ mode, name, id, plans });
      }
    } else if (kind === "entry") {
      impact = entryImpact({ mode, id, lines, fieldValues: values });
    } else if (kind === "meditationType") {
      const library = await ports.catalog.loadCompileLibrary(workspaceId);
      impact = meditationTypeImpact({
        mode,
        name: library.meditationTypes.find((row) => row.id === id)?.name ?? null,
        id,
        meditations: library.meditations,
        entries,
        lines,
        plans,
        fieldValues: values,
      });
    } else if (kind === "line") {
      // A sentence's own columns are counted the way a record's are: the values
      // hang on the line's id, and a line in the Affirmations table may have some.
      impact = lineImpact(
        mode,
        values.filter((row) => row.entityId === id).length,
      );
    } else if (kind === "field") {
      const library = await ports.catalog.loadCompileLibrary(workspaceId);
      impact = fieldImpact({
        mode,
        name: library.fieldDefs.find((row) => row.id === id)?.label ?? null,
        values: library.fieldValues.filter((row) => row.fieldDefId === id),
      });
    } else {
      // A media asset is a file, not a record: it is never archived, so it has no
      // mode of its own. What the sentence counts is the places that stop pointing
      // at it — a symbol outlives its picture.
      const library = await ports.catalog.loadCompileLibrary(workspaceId);
      const cleared =
        plans
          .flatMap((plan) => plan.blocks)
          .filter((block) => block.ambientAssetId === id || block.alarmAssetId === id).length +
        library.meditations.filter((row) => row.representationAssetId === id).length +
        library.symbols.filter((row) => row.imageAssetId === id).length;
      impact = { ...NO_DELETION_IMPACT, mode: "delete", kind: "media", cleared };
    }
    return describeDeletionImpact(impact);
  }

  async function appendSessionLog(log: SessionLog): Promise<void> {
    await ports.logs.append(log);
    await ports.logs.prune(log.workspaceId, SESSION_LOG_LIST_LIMIT);
  }

  /**
   * One stage of the block on screen, patched — the run screen's write-back.
   *
   * The owner's §4.2 and §7: a stage's length and its two switches are set from the
   * card **and** before Start, and "the last saved value is used" has to hold without
   * a second store, so the write goes to the snapshot the screen re-reads *and* to
   * the plan block the next session reads. A block the plan does not have — a stored
   * snapshot of a plan that has since changed — is left alone rather than invented,
   * and a stage the caller names that is not there is a no-op.
   *
   * `durationMs` moves the block's total by the same difference; the two flags do
   * not touch it, because a switch is not a length.
   */
  async function patchSessionStage(
    workspaceId: string,
    instanceId: string,
    blockIndex: number,
    stageIndex: number,
    patch: Partial<Pick<PlanBlockStage, "durationMs" | "binaural" | "autoScroll">>,
  ): Promise<void> {
    const snapshot = await ports.snapshots.get(instanceId);
    if (!snapshot) return;
    const plan = await ports.plans.getById(snapshot.planId);
    if (!plan || plan.workspaceId !== workspaceId) return;
    const patched = (stages: PlanBlockStage[]): PlanBlockStage[] =>
      stages.map((row, index) => (index === stageIndex ? { ...row, ...patch } : row));
    await ports.snapshots.save({
      ...snapshot,
      blocks: snapshot.blocks.map((block, index) => {
        if (index !== blockIndex) return block;
        const delta =
          patch.durationMs == null
            ? 0
            : patch.durationMs - (block.stages[stageIndex]?.durationMs ?? 0);
        return { ...block, stages: patched(block.stages), durationMs: block.durationMs + delta };
      }),
    });
    if (plan.blocks[blockIndex]?.stages[stageIndex]) {
      await api.savePlan({
        ...plan,
        blocks: plan.blocks.map((row, index) =>
          index === blockIndex ? { ...row, stages: patched(row.stages) } : row,
        ),
      });
    }
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
    accountIsConfigured: () => ports.account.isConfigured(),
    /**
     * The order is the whole of it, and it belongs here rather than in a screen so
     * that no screen can get it wrong:
     *
     *   1. the server closes the account — the only step that can refuse, and the
     *      one whose failure must change nothing
     *   2. this device's session is cleared. The account is gone, so a sign-out
     *      that fails changes nothing: the session is already dead, and the wipe
     *      below is not optional
     *   3. the device is erased. That is the reader's answer to what closing means
     *      — "delete it from everywhere, and serve the app back to them as if they
     *      had never been seen" — so after this the device is first-run: the next
     *      `bootstrap()` re-seeds the catalogue and nobody is signed in
     *
     * A close that fails therefore wipes nothing, and the reader keeps both their
     * account and their device.
     */
    closeAccount: async () => {
      await ports.account.closeAccount();
      try {
        await ports.auth.signOut();
      } catch {
        // Swallowed on purpose: the row this session pointed at no longer exists, so
        // the provider rejecting the call is the expected outcome rather than a
        // failure to report. What must not happen is the wipe being skipped because
        // of it. A background sync and the error reporter swallow too, but each of
        // those is an operation of its own; this one is a step inside another.
      }
      await ports.maintenance.wipeLocalData();
    },
    getFeatureFlags: async () => {
      // Asked of the session rather than of the caller: a screen knows whether it drew
      // something, not who is signed in, and two places answering "whose flags" is how a
      // panel ends up editing the wrong account.
      const session = await ports.auth.getSession();
      if (!session) return { flags: DEFAULT_FEATURE_FLAGS, isAdmin: false };
      return ports.flags.read(session.userId);
    },
    adminIsConfigured: () => ports.admin.isConfigured(),
    listAccounts: () => ports.admin.listAccounts(),
    setAccountFlags: (userId, flags) => ports.admin.setFlags(userId, flags),
    createAccount: (email, password) => ports.admin.createAccount(email, password),
    setAccountPassword: (userId, password) => ports.admin.setPassword(userId, password),
    syncNow: async (workspaceId) => {
      try {
        await ports.sync.run(workspaceId);
      } catch {
        // Swallowed on purpose, like the reporter below and for the same reason:
        // there is nothing to say to the reader and nowhere to put it. The
        // watermarks only move for rows that actually travelled, so a run that
        // died halfway is picked up by the next one rather than lost.
      }
    },
    recordClientError: async (input) => {
      try {
        // The workspace comes from bootstrap rather than a caller: an error
        // boundary may be the thing that broke, so the reporter cannot depend
        // on the screen that would normally supply it.
        const context = await ports.bootstrap.ensureReady();
        const session = await ports.auth.getSession();
        await ports.events.append({
          id: ports.nextId?.() ?? createId(),
          workspaceId: context.workspaceId,
          userId: session?.userId ?? null,
          eventType: "client_error",
          payload: clientErrorPayload(input),
          occurredAt: ports.clock.nowMs(),
        });
      } catch {
        // Nothing to do about it, and nowhere to say it: the reader already has
        // one failure on screen and does not need a second one.
      }
    },
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
      const first = firstLive(library.meditations);
      const plan = makeStarterPlan({
        id: nextId(),
        workspaceId,
        name: nextPlanName(summaries.map((s) => s.name)),
        autoAdvance: prefs?.autoAdvance ?? true,
        alarmEnabled: prefs?.alarmEnabled ?? DEFAULT_ALARM_ENABLED,
        meditationBlockId: nextId(),
        meditationId: first?.id ?? null,
        binauralPresetId:
          first?.defaultBinauralPresetId ?? firstLive(library.presets)?.id ?? null,
        stages: first ? stagesForMeditation(first, library.meditationTypes) : undefined,
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
      const stored = await ports.catalog.loadCompileLibrary(plan.workspaceId, plan);
      // The one place "stop binaural when the alarm rings" is read: it is the
      // reader's preference, not a property of the plan. It used to live on the
      // plan as well, and the planner's switch won — so the Settings switch did
      // nothing to an existing plan, which is exactly what the owner hit.
      const prefs = await ports.preferences.get(userId);
      // The account's own `binaural` flag, read here rather than held by the screen that
      // asked for the session (`P0 · 35`, slice 35d): off means silent, and the compile
      // is the one place that can say so without touching the plan or the engine. The
      // read is the app's own — `getFeatureFlags` answers for the session, and an
      // account with no flags is every default, so a local-only build is audible.
      const { flags } = await api.getFeatureFlags();
      // A session shows what the account is offered and **nothing else** (`P0 · 37`, the
      // owner's answer 2026-09-23: *"session should never show items that are blocked on
      // an account"*). A symbol is the one item a stored plan can *name*, so the library
      // this compiles against carries the account's own list — and a block that still
      // names one outside it is **refused** rather than quietly walking something else,
      // because that symbol is the point of the block. Nothing is migrated for it: the
      // owner confirmed no account has been released, so there is no stored plan to keep
      // working, which is what makes refusing the honest answer rather than the harsh one.
      const symbols = visibleSymbols(stored.symbols, flags);
      const offered = new Set(symbols.map((row) => row.id));
      const outside = plan.blocks.find((block) => block.symbolId && !offered.has(block.symbolId));
      if (outside) {
        // The sentence carries three things (the owner, 2026-09-23): the symbol **by
        // name**, the way out that works right now — the block's own symbol field is the
        // reader's to change — and who to ask to change the account instead. The app's
        // word for that person is the one the sign-in screen uses, "whoever set up your
        // account", because the reader has never met a screen that says "owner".
        const label = stored.symbols.find((row) => row.id === outside.symbolId)?.name;
        const named = label ?? "This symbol";
        fail(
          "compile.symbolNotIncluded",
          `${named} is not part of your account. Set the block's symbol to another one, or to None, and the session will run without it — to use ${named}, talk to whoever set up your account.`,
        );
      }
      const library = { ...stored, symbols };
      const snapshot = compilePlan(plan, library, {
        now: ports.clock.nowMs(),
        id: nextId,
        durationOverrideMs: ports.durationOverrideMs ?? null,
        stopBinauralOnAlarm: prefs?.stopBinauralOnAlarm ?? true,
        binauralSilent: !flags.binaural,
        // The plan card's randomiser, and the account's flag for it (`P2 · 44`): off
        // reads every line, which is the state a plan that never asked is in anyway.
        randomiseIntentions: flags.intention_randomiser,
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
    startSessionFromMeditation: async (userId, workspaceId, meditationId) => {
      const library = await ports.catalog.loadCompileLibrary(workspaceId);
      const focus = library.meditations.find((row) => row.id === meditationId);
      if (!focus) {
        fail("catalog.focusMissing", CATALOG_ERRORS.focusMissing);
      }
      const existing = await ports.plans.getById(FOCUS_SESSION_PLAN_ID);
      const previous = existing?.blocks[0];
      const draft: Plan = {
        id: FOCUS_SESSION_PLAN_ID,
        workspaceId,
        name: MEDITATION_SESSION_PLAN_NAME,
        cycleCount: 1,
        cycleUntilStopped: false,
        autoAdvance: existing?.autoAdvance ?? true,
        alarmEnabled: existing?.alarmEnabled ?? DEFAULT_ALARM_ENABLED,
        binauralEnabled: existing?.binauralEnabled !== false,
        revision: existing?.revision ?? 0,
        display: existing?.display ?? { columns: [...DEFAULT_PLAN_DISPLAY.columns] },
        blocks: [
          {
            id: previous?.id ?? nextId(),
            sortOrder: 0,
            // The meditation's own copy of its type's template, or the type's: the
            // one-tap session is a block of that meditation, so it runs that
            // meditation's stages and nobody else's (§12.15).
            stages: stagesForMeditation(focus, library.meditationTypes),
            meditationIds: [focus.id],
            symbolId: null,
            symbolScope: "all",
            binauralPresetId: focus.defaultBinauralPresetId,
            ambientAssetId: previous?.ambientAssetId ?? null,
            alarmAssetId: previous?.alarmAssetId ?? null,
            // A one-tap session's block keeps whatever the reader last gave it, and
            // takes the plan's answer until they give it one.
            alarmEnabled: previous?.alarmEnabled ?? null,
            display: previous?.display ?? null,
            intentionRandomiser: previous?.intentionRandomiser ?? null,
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
        meditationTypes: byOrder(library.meditationTypes),
        meditations: byOrder(library.meditations),
        symbols: byOrder(library.symbols),
        entries: byOrder(library.entries),
        // A line's order is its order *within* its row, so the list arrives
        // grouped by row: a reader that groups by `entryId` gets the order it
        // drew, without having to ask for it. An orphan (`entryId: null`) is its
        // own group and sorts first, which is where the Affirmations table reads
        // it from.
        intentions: [...library.intentions].sort(
          (a, b) =>
            (a.entryId ?? "").localeCompare(b.entryId ?? "") ||
            a.sortOrder - b.sortOrder ||
            a.id.localeCompare(b.id),
        ),
        fieldDefs: byOrder(library.fieldDefs),
        fieldOptions: byOrder(library.fieldOptions),
        fieldValues: library.fieldValues,
        presets: byOrder(library.presets),
        mediaAssets: byOrder(library.mediaAssets ?? []),
        plans,
        logs,
        sessionsThisWeek: countSessionsThisWeek(logs, ports.clock.nowMs()),
      };
    },
    listPlans: (workspaceId) => ports.plans.listSummaries(workspaceId),
    getDeletionImpact: (workspaceId, kind, id, mode) => describeDeletion(workspaceId, kind, id, mode),
    exportCatalog: async (workspaceId) => {
      const [library, plans, logs] = await Promise.all([
        ports.catalog.loadCompileLibrary(workspaceId),
        loadPlans(workspaceId),
        ports.logs.listRecent(workspaceId, SESSION_LOG_LIST_LIMIT),
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
        meditationTypes: byOrder(library.meditationTypes),
        meditations: byOrder(library.meditations),
        symbols: byOrder(library.symbols),
        entries: byOrder(library.entries),
        intentions: byOrder(library.intentions),
        fieldDefs: byOrder(library.fieldDefs),
        fieldOptions: byOrder(library.fieldOptions),
        fieldValues: library.fieldValues,
        presets: byOrder(library.presets),
        mediaAssets,
        blobs,
        plans,
        logs,
      };
    },
    importCatalog: async (workspaceId, raw) => {
      const backup = bindCatalogToWorkspace(parseCatalogBackup(raw), workspaceId);
      await ports.runInTransaction(async () => {
        // The types first: every meditation below names one.
        for (const type of backup.meditationTypes) {
          await api.saveMeditationType(type);
        }
        for (const preset of backup.presets) {
          await api.savePreset(preset);
        }
        for (const def of backup.fieldDefs) {
          await api.saveFieldDef(def);
        }
        for (const focus of backup.meditations) {
          await api.saveMeditation(focus);
        }
        for (const symbol of backup.symbols) {
          await api.saveSymbol(symbol);
        }
        for (const option of backup.fieldOptions) {
          await api.saveFieldOption(option);
        }
        // Rows before the lines that live in them: a line carries its row's id.
        for (const entry of backup.entries) {
          await api.saveEntry(entry);
        }
        for (const line of backup.intentions) {
          await api.saveLine(line);
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
        // Upsert rather than append: a backup merges by id, so restoring the
        // same file twice must leave one row, not collide with the first run's.
        for (const log of backup.logs) {
          await ports.logs.save(log);
        }
      });
    },
    wipeLocalData: () => ports.maintenance.wipeLocalData(),
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
    saveSessionStageDuration: (workspaceId, instanceId, blockIndex, stageIndex, durationMs) =>
      // Zero is a length here too. The engine allows it, so the stored copy has to:
      // otherwise a reload would bring back the length the reader replaced.
      durationMs < 0
        ? Promise.resolve()
        : patchSessionStage(workspaceId, instanceId, blockIndex, stageIndex, {
            durationMs,
          }),
    saveSessionStageFlag: (workspaceId, instanceId, blockIndex, stageIndex, flag, value) =>
      patchSessionStage(workspaceId, instanceId, blockIndex, stageIndex, { [flag]: value }),
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
        const clearedMeditations: Meditation[] = [];
        const meditations = await ports.catalog.listMeditations(workspaceId);
        for (const focus of meditations) {
          if (focus.defaultBinauralPresetId === presetId) {
            const cleared = stamped({ ...focus, defaultBinauralPresetId: null });
            await ports.catalog.saveMeditation(cleared);
            clearedMeditations.push(cleared);
          }
        }
        const { plans } = await patchPlanBlocks(workspaceId, (block) =>
          block.binauralPresetId === presetId ? { ...block, binauralPresetId: null } : block,
        );
        await ports.presets.delete(presetId);
        return {
          removed: {
            presets: [presetId],
            mediaAssets: [],
            symbols: [],
            entries: [],
            intentions: [],
            meditations: [],
            meditationTypes: [],
          },
          updated: { ...noUpdatedRows(), meditations: clearedMeditations, plans },
        };
      }),
    saveMeditationType: async (row) => {
      const next = stamped({ ...row, name: requireName(row.name) });
      await ports.catalog.saveMeditationType(next);
      return next;
    },
    saveMeditation: async (focus) => {
      const next = stamped({
        ...focus,
        name: requireName(focus.name),
        locationText: focus.locationText.trim(),
      });
      await ports.catalog.saveMeditation(next);
      return next;
    },
    deleteMeditation: async (workspaceId, meditationId) =>
      ports.runInTransaction(async () => {
        // Destroying a chakra destroys the rows that connect it — and the lines
        // inside them, because a line belongs to its row. A row whose chakra is
        // gone would be a connection to nothing.
        const entries = (await ports.catalog.listEntries(workspaceId)).filter(
          (row) => row.meditationId === meditationId,
        );
        const entryIds = entries.map((row) => row.id);
        const lines = await lineIdsInside(workspaceId, entryIds);
        await deleteRows(entryIds);
        await deleteValues([meditationId]);
        // The owner's rule: removed from the library means removed from the
        // plans. `getDeletionImpact` is what tells the reader, before the second
        // press, how many blocks that is.
        const { plans } = await patchPlanBlocks(workspaceId, (block) =>
          withoutMeditations(block, new Set([meditationId])),
        );
        await ports.catalog.deleteMeditation(meditationId);
        return {
          removed: {
            presets: [],
            mediaAssets: [],
            symbols: [],
            entries: entryIds,
            intentions: lines,
            meditations: [meditationId],
            meditationTypes: [],
          },
          updated: { ...noUpdatedRows(), plans },
        };
      }),
    deleteMeditationType: async (workspaceId, typeId) =>
      ports.runInTransaction(async () => {
        const mine = (await ports.catalog.listMeditations(workspaceId)).filter(
          (row) => row.typeId === typeId,
        );
        const ids = new Set(mine.map((row) => row.id));
        const entryIds: string[] = [];
        for (const focus of mine) {
          const entries = (await ports.catalog.listEntries(workspaceId)).filter(
            (row) => row.meditationId === focus.id,
          );
          entryIds.push(...entries.map((row) => row.id));
          await deleteValues([focus.id]);
        }
        // Read before the rows go, and once for the whole type rather than once
        // per meditation: the rows are what name the lines this delete takes.
        const lines = await lineIdsInside(workspaceId, entryIds);
        await deleteRows(entryIds);
        // One pass over the plans for the whole type, not one per meditation.
        const { plans } = await patchPlanBlocks(workspaceId, (block) =>
          withoutMeditations(block, ids),
        );
        for (const focus of mine) await ports.catalog.deleteMeditation(focus.id);
        await ports.catalog.deleteMeditationType(typeId);
        return {
          removed: {
            presets: [],
            mediaAssets: [],
            symbols: [],
            entries: entryIds,
            intentions: lines,
            meditations: [...ids],
            meditationTypes: [typeId],
          },
          updated: { ...noUpdatedRows(), plans },
        };
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
        const entries = (await ports.catalog.listEntries(workspaceId)).filter(
          (row) => row.symbolId === symbolId,
        );
        const entryIds = entries.map((row) => row.id);
        const lines = await lineIdsInside(workspaceId, entryIds);
        await deleteRows(entryIds);
        await deleteValues([symbolId]);
        // A block that named this symbol keeps its place and goes back to
        // walking whatever symbols its meditation still has.
        const { plans } = await patchPlanBlocks(workspaceId, (block) =>
          block.symbolId === symbolId
            ? { ...block, symbolId: null, symbolScope: "rotate" }
            : block,
        );
        await ports.catalog.deleteSymbol(symbolId);
        return {
          removed: {
            presets: [],
            mediaAssets: [],
            symbols: [symbolId],
            entries: entryIds,
            intentions: lines,
            meditations: [],
            meditationTypes: [],
          },
          updated: { ...noUpdatedRows(), plans },
        };
      }),
    saveEntry: async (entry) =>
      ports.runInTransaction(async () => {
        // A stored row points at something. A row the reader has emptied is not
        // written at all: Save's sweep archives one that was stored, and a draft
        // that never had a reference is simply dropped (§4).
        if (!entry.meditationId && !entry.symbolId) catalogFail("entryNeedsRef");
        const listed = await ports.catalog.listEntries(entry.workspaceId);
        const clash = listed.find(
          (row) =>
            row.id !== entry.id &&
            row.meditationId === entry.meditationId &&
            row.symbolId === entry.symbolId,
        );
        // The pair is the row's identity, so a second row for it would be a
        // duplicate the reader cannot tell from the first.
        if (clash) catalogFail("entryExists");
        const next = stamped({ ...entry, archivedAt: entry.archivedAt ?? null });
        await ports.catalog.saveEntry(next);
        return next;
      }),
    deleteEntry: async (workspaceId, entryId) =>
      ports.runInTransaction(async () => {
        const entry = await findEntry(workspaceId, entryId);
        if (!entry) return;
        // The row and its lines, for good. Only the Archive page offers this.
        await deleteRows([entryId]);
      }),
    archiveEntry: async (workspaceId, entryId) =>
      ports.runInTransaction(async () => {
        const entry = await findEntry(workspaceId, entryId);
        if (!entry) catalogFail("entryMissing");
        // Nothing else is touched — not the lines, not the values, not the order.
        // That is the whole reason Restore puts the row back exactly as it was.
        const stored = stamped({ ...entry, archivedAt: ports.clock.nowMs() });
        await ports.catalog.saveEntry(stored);
        return oneRowChangeSet({ entries: [stored] });
      }),
    restoreEntry: async (workspaceId, entryId) =>
      ports.runInTransaction(async () => {
        const entry = await findEntry(workspaceId, entryId);
        if (!entry) catalogFail("entryMissing");
        const stored = stamped({ ...entry, archivedAt: null });
        await ports.catalog.saveEntry(stored);
        return oneRowChangeSet({ entries: [stored] });
      }),
    reorderEntries: async (workspaceId, entryIds) =>
      ports.runInTransaction(async () => {
        const listed = await ports.catalog.listEntries(workspaceId);
        const position = new Map(entryIds.map((id, index) => [id, index]));
        for (const row of listed) {
          const next = position.get(row.id);
          if (next === undefined || next === row.sortOrder) continue;
          await ports.catalog.saveEntry(stamped({ ...row, sortOrder: next }));
        }
      }),
    saveLine: async (line) =>
      ports.runInTransaction(async () => {
        // A line written about nothing is an **orphan**: the owner's round 16 put
        // those in the Affirmations table, where a sentence waits until something is
        // associated with it (§2.1). Anything else must name a row that exists —
        // that check is what stops a line pointing at an id nobody has.
        if (line.entryId !== null) {
          const entry = await findEntry(line.workspaceId, line.entryId);
          if (!entry) catalogFail("entryMissing");
        }
        const next = stamped({
          ...line,
          entryId: line.entryId ?? null,
          text: requireText(line.text),
          archivedAt: line.archivedAt ?? null,
        });
        await ports.catalog.saveIntention(next);
        return next;
      }),
    deleteLine: async (workspaceId, lineId) =>
      ports.runInTransaction(async () => {
        const line = await findLine(workspaceId, lineId);
        if (!line) return;
        // A sentence in the Affirmations table has columns of its own (the
        // `affirmation` pool), and they hang on its id, so they go with it — the
        // same sweep every other row's delete does. A line inside an entry's cell
        // has none, and this is a no-op there.
        await deleteValues([lineId]);
        await ports.catalog.deleteIntention(lineId);
      }),
    archiveLine: async (workspaceId, lineId) =>
      ports.runInTransaction(async () => {
        const line = await findLine(workspaceId, lineId);
        if (!line) catalogFail("entryMissing");
        // The line keeps its row and its position, so Restore puts it back where
        // it was rather than at the foot of the list.
        const stored = stamped({ ...line, archivedAt: ports.clock.nowMs() });
        await ports.catalog.saveIntention(stored);
        return oneRowChangeSet({ intentions: [stored] });
      }),
    restoreLine: async (workspaceId, lineId) =>
      ports.runInTransaction(async () => {
        const line = await findLine(workspaceId, lineId);
        if (!line) catalogFail("entryMissing");
        const stored = stamped({ ...line, archivedAt: null });
        await ports.catalog.saveIntention(stored);
        return oneRowChangeSet({ intentions: [stored] });
      }),
    reorderLines: async (workspaceId, entryId, lineIds) =>
      ports.runInTransaction(async () => {
        const lines = await ports.catalog.listIntentions(workspaceId);
        const position = new Map(lineIds.map((id, index) => [id, index]));
        for (const row of lines) {
          if (row.entryId !== entryId) continue;
          const next = position.get(row.id);
          if (next === undefined || next === row.sortOrder) continue;
          await ports.catalog.saveIntention(stamped({ ...row, sortOrder: next }));
        }
      }),
    archiveRecord: (workspaceId, kind, id) =>
      ports.runInTransaction(() =>
        setRecordArchived(workspaceId, kind, id, ports.clock.nowMs()),
      ),
    restoreRecord: (workspaceId, kind, id) =>
      ports.runInTransaction(() => setRecordArchived(workspaceId, kind, id, null)),
    sweepOrphanedEntries: (workspaceId, entryIds) =>
      ports.runInTransaction(async () => {
        // The ids come from the draft, not from a query: only the screen knows
        // which rows the reader emptied, and a row cleared and then filled in
        // again before Save must survive. This archives what it is handed — the
        // stored row still carries the pair, which is what the report names.
        const wanted = new Set(entryIds);
        if (wanted.size === 0) return { swept: [], total: 0 };
        const [entries, meditations, symbols] = await Promise.all([
          ports.catalog.listEntries(workspaceId),
          ports.catalog.listMeditations(workspaceId),
          ports.catalog.listSymbols(workspaceId),
        ]);
        const focusById = new Map(meditations.map((row) => [row.id, row.name]));
        const symbolById = new Map(symbols.map((row) => [row.id, row.name]));
        const swept: { id: string; label: string }[] = [];
        for (const entry of entries) {
          if (!wanted.has(entry.id) || entry.archivedAt != null) continue;
          const focus = entry.meditationId ? focusById.get(entry.meditationId) : undefined;
          const symbol = entry.symbolId ? symbolById.get(entry.symbolId) : undefined;
          swept.push({
            id: entry.id,
            label: [focus, symbol].filter(Boolean).join(" × ") || "A row",
          });
          await ports.catalog.saveEntry(stamped({ ...entry, archivedAt: ports.clock.nowMs() }));
        }
        return { swept: swept.slice(0, SWEEP_REPORT_LIMIT), total: swept.length };
      }),
    saveFieldDef: async (def) =>
      ports.runInTransaction(async () => {
        const library = await ports.catalog.loadCompileLibrary(def.workspaceId);
        const stored = library.fieldDefs.find((row) => row.id === def.id);
        // A column's key is minted once, from its heading, and then never changes:
        // it is what a stored value hangs off and what a plan's display names, so a
        // rename must not pull either out from under it. A column that already
        // exists therefore keeps its own key whatever the caller sent.
        const keyed = stored
          ? { ...def, key: stored.key }
          : def.key.trim()
            ? def
            : { ...def, key: fieldKeyFor(def, library.fieldDefs) };
        const key = assertFieldDefSavable(keyed, library.fieldDefs);
        // The type is fixed once a cell holds something (§4): no stored value is
        // ever reinterpreted as another shape.
        const holdsValues = library.fieldValues.some((row) => row.fieldDefId === def.id);
        if (
          stored &&
          holdsValues &&
          (stored.cellType !== keyed.cellType || stored.scope !== keyed.scope)
        ) {
          catalogFail("fieldTypeLocked");
        }
        const next = stamped({
          ...keyed,
          key,
          label: requireName(keyed.label),
          description: keyed.description?.trim() ?? "",
          archivedAt: keyed.archivedAt ?? null,
        });
        await ports.catalog.saveFieldDef(next);
        return next;
      }),
    deleteFieldDef: async (workspaceId, fieldDefId) =>
      ports.runInTransaction(async () => {
        const library = await ports.catalog.loadCompileLibrary(workspaceId);
        // A column holding a value in any row cannot be removed (§4). The grid does
        // not draw the control; this is the same rule where it is enforced.
        if (library.fieldValues.some((row) => row.fieldDefId === fieldDefId)) {
          catalogFail("fieldHoldsValues");
        }
        // Its options go with it. A cell that had chosen one is impossible by the
        // check above, so nothing is left pointing at an option that is gone.
        for (const option of library.fieldOptions) {
          if (option.fieldDefId === fieldDefId) {
            await ports.catalog.deleteFieldOption(option.id);
          }
        }
        await ports.catalog.deleteFieldDef(fieldDefId);
      }),
    saveFieldOption: async (option) =>
      ports.runInTransaction(async () => {
        const next = stamped({ ...option, label: requireName(option.label) });
        await ports.catalog.saveFieldOption(next);
        return next;
      }),
    deleteFieldOption: async (workspaceId, optionId) =>
      ports.runInTransaction(async () => {
        const library = await ports.catalog.loadCompileLibrary(workspaceId);
        const option = library.fieldOptions.find((row) => row.id === optionId);
        if (!option) return;
        // An option a cell chose cannot be removed: the same rule as a column with
        // a value in it, and for the same reason — the cell would be left pointing
        // at nothing.
        const used = library.fieldValues.some(
          (row) => row.fieldDefId === option.fieldDefId && row.text === option.id,
        );
        if (used) catalogFail("optionInUse");
        await ports.catalog.deleteFieldOption(optionId);
      }),
    savePlanDisplay: async (workspaceId, planId, display) => {
      const plan = await api.getPlan(workspaceId, planId);
      if (!plan) planFail("missing");
      // Through `savePlan`, so the display change goes through the same atomic
      // compare-and-swap every other plan write does.
      return api.savePlan({ ...plan, display: normalizePlanDisplay(display) });
    },
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
      // An upload goes last. That is one read of one small table rather than the
      // catalogue-wide load this item exists to remove; two uploads racing get the
      // same number, and `byOrder` breaks that tie on id rather than losing a row.
      const existing = await ports.catalog.listMediaAssets(input.workspaceId);
      const asset = stamped(
        mediaAssetFromUpload({
          id: nextId(),
          workspaceId: input.workspaceId,
          kind: input.kind,
          name: input.name,
          durationMs: input.kind === "image" ? 0 : input.durationMs,
          sortOrder: existing.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1,
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
        const clearedMeditations: Meditation[] = [];
        const meditations = await ports.catalog.listMeditations(workspaceId);
        for (const focus of meditations) {
          if (focus.representationAssetId === assetId) {
            const cleared = stamped({ ...focus, representationAssetId: null });
            await ports.catalog.saveMeditation(cleared);
            clearedMeditations.push(cleared);
          }
        }
        const clearedSymbols: Symbol[] = [];
        const symbols = await ports.catalog.listSymbols(workspaceId);
        for (const symbol of symbols) {
          if (symbol.imageAssetId === assetId) {
            const cleared = stamped({ ...symbol, imageAssetId: null });
            await ports.catalog.saveSymbol(cleared);
            clearedSymbols.push(cleared);
          }
        }
        const { plans } = await patchPlanBlocks(workspaceId, (block) => {
          const ambient = block.ambientAssetId === assetId ? null : block.ambientAssetId;
          const alarm = block.alarmAssetId === assetId ? null : block.alarmAssetId;
          if (ambient === block.ambientAssetId && alarm === block.alarmAssetId) return block;
          return { ...block, ambientAssetId: ambient, alarmAssetId: alarm };
        });
        await ports.catalog.deleteMediaAsset(assetId);
        await ports.blobs.delete(assetId);
        return {
          removed: {
            presets: [],
            mediaAssets: [assetId],
            symbols: [],
            entries: [],
            intentions: [],
            meditations: [],
            meditationTypes: [],
          },
          updated: { ...noUpdatedRows(), meditations: clearedMeditations, symbols: clearedSymbols, plans },
        };
      }),
  };
  return api;
}
