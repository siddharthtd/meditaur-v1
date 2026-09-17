import type { CompileLibrary } from "./compile-plan.ts";
import type {
  BinauralPreset,
  FieldDef,
  FieldValue,
  FocusPoint,
  FocusSymbolBinding,
  Intention,
  MediaAsset,
  Plan,
  SessionLog,
  SessionSnapshot,
  Symbol,
  TableView,
  UserPreferences,
} from "./models.ts";

export type SessionContext = {
  userId: string;
  workspaceId: string;
};

export type BootstrapPort = {
  ensureReady(): Promise<SessionContext>;
};

export type AuthSession = {
  userId: string;
  /** Epoch ms after which the session is invalid; null means it does not expire. */
  expiresAt: number | null;
};

/**
 * What a sign-up produced. A provider may sign the new reader straight in, or it
 * may want the address confirmed first and hand back no session at all. Both are
 * ordinary outcomes and the screen says something different for each, so the port
 * names which one happened rather than making callers read a null session as a
 * failure.
 */
export type SignUpOutcome =
  | { status: "signedIn"; session: AuthSession }
  | { status: "confirmationRequired" };

/**
 * Identity. It is deliberately separate from `BootstrapPort`: bootstrap answers
 * "which workspace does this device use" and must keep working with no account,
 * while auth answers "who is signed in" and may be absent. Adapters apply the
 * deadline with `Clock`, never `setInterval`.
 */
export type AuthPort = {
  /** True when this adapter can authenticate at all (cloud config present). */
  isConfigured(): boolean;
  /** The current session, or null. The deadline is applied before returning. */
  getSession(): Promise<AuthSession | null>;
  signIn(email: string, password: string): Promise<AuthSession>;
  /**
   * Create an account. Resolves `signedIn` when the provider also signed the new
   * reader in, and `confirmationRequired` when it is waiting on the address. A
   * user row with no session is never reported as a session.
   */
  signUp(email: string, password: string): Promise<SignUpOutcome>;
  signOut(): Promise<void>;
  /**
   * Fires on sign-in, sign-up, sign-out, and expiry. Returns an unsubscribe
   * function.
   */
  onSessionChange(listener: (session: AuthSession | null) => void): () => void;
};

/**
 * The workspace side of identity. Rows that carry a user are the membership and
 * the preferences key; the workspace row itself has no owner column.
 */
export type WorkspaceRepository = {
  /**
   * Claim the unclaimed local seed workspace for a signed-in user, in one
   * transaction. Already theirs is a no-op, and a workspace someone else claimed
   * is left alone rather than re-pointed.
   */
  adopt(userId: string): Promise<SessionContext>;
};

export type PlanRepository = {
  getById(planId: string): Promise<Plan | null>;
  getMany(planIds: string[]): Promise<Plan[]>;
  findFirstInWorkspace(workspaceId: string): Promise<Plan | null>;
  listSummaries(workspaceId: string): Promise<{ id: string; name: string }[]>;
  save(plan: Plan): Promise<void>;
  delete(planId: string): Promise<void>;
};

export type StoredBlob = {
  bytes: ArrayBuffer;
  mimeType: string;
};

export type BlobStore = {
  put(id: string, bytes: ArrayBuffer, mimeType: string): Promise<void>;
  get(id: string): Promise<StoredBlob | null>;
  delete(id: string): Promise<void>;
};

export type CatalogRepository = {
  loadCompileLibrary(workspaceId: string, plan?: Plan): Promise<CompileLibrary>;
  listFocusPoints(workspaceId: string): Promise<FocusPoint[]>;
  listSymbols(workspaceId: string): Promise<Symbol[]>;
  listBindings(workspaceId: string): Promise<FocusSymbolBinding[]>;
  listBindingsForFocus(focusPointId: string): Promise<FocusSymbolBinding[]>;
  listIntentions(workspaceId: string): Promise<Intention[]>;
  listFieldValuesForEntityIds(entityIds: string[]): Promise<FieldValue[]>;
  saveFocusPoint(focus: FocusPoint): Promise<void>;
  deleteFocusPoint(focusId: string): Promise<void>;
  saveSymbol(symbol: Symbol): Promise<void>;
  deleteSymbol(symbolId: string): Promise<void>;
  saveBinding(binding: FocusSymbolBinding): Promise<void>;
  deleteBinding(focusPointId: string, symbolId: string): Promise<void>;
  saveIntention(intention: Intention): Promise<void>;
  deleteIntention(intentionId: string): Promise<void>;
  saveMediaAsset(asset: MediaAsset): Promise<void>;
  deleteMediaAsset(assetId: string): Promise<void>;
  saveTableView(view: TableView): Promise<void>;
  deleteTableView(viewId: string): Promise<void>;
  saveFieldDef(def: FieldDef): Promise<void>;
  deleteFieldDef(fieldDefId: string): Promise<void>;
  saveFieldValue(value: FieldValue): Promise<void>;
  deleteFieldValue(entityId: string, fieldDefId: string): Promise<void>;
};

export type PresetRepository = {
  list(workspaceId: string): Promise<BinauralPreset[]>;
  getFirst(workspaceId: string): Promise<BinauralPreset | null>;
  save(preset: BinauralPreset): Promise<void>;
  delete(presetId: string): Promise<void>;
};

export type PreferencesRepository = {
  get(userId: string): Promise<UserPreferences | null>;
  /**
   * Store the reader's row and return what was stored, including its next
   * revision; `null` when the store had already moved past the revision the row
   * carried.
   *
   * That check is the store's, not the caller's, because it is the only place it
   * can be atomic: one Dexie transaction locally, one conditional update
   * remotely. A caller-side read-then-write cannot be atomic across a network —
   * and the caller has no way to know which kind of store it holds.
   */
  save(prefs: UserPreferences): Promise<UserPreferences | null>;
};

export type SnapshotRepository = {
  get(instanceId: string): Promise<SessionSnapshot | null>;
  save(snapshot: SessionSnapshot): Promise<void>;
  prune(planId: string, keep: number): Promise<void>;
};

export type SessionLogRepository = {
  append(log: SessionLog): Promise<void>;
  listRecent(workspaceId: string, limit?: number): Promise<SessionLog[]>;
  prune(workspaceId: string, keep: number): Promise<void>;
  deleteForPlan(planId: string): Promise<void>;
};
