import type { AppEvent } from "./events.ts";
import type { CompileLibrary } from "./compile-plan.ts";
import type { FeatureFlags } from "./feature-flags.ts";
import type {
  BinauralPreset,
  Entry,
  FieldDef,
  FieldOption,
  FieldValue,
  Meditation,
  Intention,
  MediaAsset,
  MeditationType,
  Plan,
  SessionLog,
  SessionSnapshot,
  Symbol,
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
  /**
   * Every meditation type, archived ones included — the Archive reads the same
   * rows, and the visibility rule is what hides them everywhere else.
   */
  listMeditationTypes(workspaceId: string): Promise<MeditationType[]>;
  saveMeditationType(row: MeditationType): Promise<void>;
  deleteMeditationType(typeId: string): Promise<void>;
  listMeditations(workspaceId: string): Promise<Meditation[]>;
  listSymbols(workspaceId: string): Promise<Symbol[]>;
  /**
   * Every row of the Entries table, archived ones included.
   *
   * Archived rows are *in* this list on purpose: the Archive page reads the same
   * rows, and the visibility rule — not a filter at the store — is what hides
   * them everywhere else (`packages/domain/src/visibility.ts`).
   */
  listEntries(workspaceId: string): Promise<Entry[]>;

  listIntentions(workspaceId: string): Promise<Intention[]>;
  listFieldValuesForEntityIds(entityIds: string[]): Promise<FieldValue[]>;
  listFieldOptions(workspaceId: string): Promise<FieldOption[]>;
  saveMeditation(focus: Meditation): Promise<void>;
  deleteMeditation(meditationId: string): Promise<void>;
  saveSymbol(symbol: Symbol): Promise<void>;
  deleteSymbol(symbolId: string): Promise<void>;
  saveEntry(entry: Entry): Promise<void>;
  deleteEntry(entryId: string): Promise<void>;
  saveIntention(intention: Intention): Promise<void>;
  deleteIntention(intentionId: string): Promise<void>;
  deleteIntentionsForEntry(entryId: string): Promise<void>;
  saveMediaAsset(asset: MediaAsset): Promise<void>;
  deleteMediaAsset(assetId: string): Promise<void>;
  /**
   * Every picture and sound this workspace holds, in the store's own order.
   *
   * The one read an upload needs: the new row goes after the last one, so the
   * application has to ask which orders the store has already handed out. It is
   * deliberately not `loadCompileLibrary`, which is the whole catalogue — this is
   * one table, read for the number and nothing else (`P2 · 4`).
   */
  listMediaAssets(workspaceId: string): Promise<MediaAsset[]>;
  saveFieldDef(def: FieldDef): Promise<void>;
  deleteFieldDef(fieldDefId: string): Promise<void>;
  saveFieldOption(option: FieldOption): Promise<void>;
  deleteFieldOption(optionId: string): Promise<void>;
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
  /** Record a finished session. The id is minted for this run, so a collision is a bug. */
  append(log: SessionLog): Promise<void>;
  /**
   * Write a log by id, replacing any row that already carries it.
   *
   * `append` is the live path, where the id belongs to the session that just
   * ended. This is the restore path: a backup merges by id, so restoring the
   * same file twice has to leave one row, not fail on the second run.
   */
  save(log: SessionLog): Promise<void>;
  listRecent(workspaceId: string, limit?: number): Promise<SessionLog[]>;
  prune(workspaceId: string, keep: number): Promise<void>;
  deleteForPlan(planId: string): Promise<void>;
};

/**
 * Erasing what this device holds.
 *
 * One method, and deliberately not a repository: wiping is about the store
 * itself rather than any row in it. What it must never do is sign anybody out —
 * the account and the device are separate erasures, and the app says so to the
 * reader's face rather than leaving them to guess.
 */
export type MaintenancePort = {
  /** Delete every row this device holds, so the next load starts from a seed. */
  wipeLocalData(): Promise<void>;
};

/**
 * Closing the account itself — the reader's identity and everything stored
 * against it, rather than one of the two.
 *
 * Deliberately not a method on `MaintenancePort`. That one erases what this
 * *device* holds and has to keep working on a build with no account at all;
 * this one cannot do anything without one. Two different erasures, two names,
 * so nobody has to guess which one just happened.
 *
 * One method, because it is one erasure. Removing the `auth.users` row needs
 * the service-role key, which by design never reaches the browser, so an
 * implementation reaches a server surface that holds it; the caller-scoped
 * `delete_my_data()` can run in the browser and is the half of the same job
 * that RLS can do.
 *
 * `isConfigured()` is false on a build with no cloud pair — the same rule
 * `AuthPort` follows, so a screen can ask before offering the affordance
 * rather than after the reader has pressed it.
 */
export type AccountPort = {
  isConfigured(): boolean;
  /** Remove the reader's data and their identity. */
  closeAccount(): Promise<void>;
};

/**
 * The flags an account is gated by (`P0 · 23`), and the marker that decides who may set
 * them.
 *
 * `flags` is **complete** — every flag present, an absent key in the stored row already
 * resolved to its default — because a screen asks a question and should not have to
 * answer for the store. `isAdmin` is not a flag: it is the once-set marker that decides
 * whether an account may reach the admin panel at all, and it travels in the same read
 * because it lives in the same row.
 */
export type AccountFlags = {
  flags: FeatureFlags;
  isAdmin: boolean;
};

/**
 * Where an account's flags come from.
 *
 * **Read-only by design**, and that is the point rather than a gap: the browser has no
 * way to write a flag and no policy that would let it, because a flag is the owner's
 * decision about an account. The writer is a function holding the service role, reached
 * from the panel. A `save` here would be an invitation to add the second one.
 *
 * It is only ever asked about a real account. A device with nobody signed in is the
 * app's own answer — `DEFAULT_FEATURE_FLAGS` — because there is nothing to read, and that
 * is what makes a local-only build behave exactly as it did before flags existed.
 *
 * `isConfigured` is false on a build with no cloud pair, the same rule `AuthPort` and
 * `AccountPort` follow, so the panel can ask whether it could write anything at all
 * before it offers to.
 */
export type FeatureFlagsPort = {
  isConfigured(): boolean;
  read(userId: string): Promise<AccountFlags>;
};

/**
 * One account, as the panel's table draws it (`P0 · 23`, slice 23f).
 *
 * The identity and the dates are the Auth admin API's — this app never stores an address
 * — and the two fields under them are what the app actually gates on. `flags` is complete
 * for the same reason `AccountFlags.flags` is: a row the panel draws should not have to
 * resolve a missing key.
 */
export type AdminAccount = {
  userId: string;
  email: string;
  createdAt: string | null;
  lastSignInAt: string | null;
  isAdmin: boolean;
  flags: FeatureFlags;
};

/**
 * The owner's own tool: the accounts, and the three writes the panel offers.
 *
 * **Not a reader-facing port.** Everything here needs something the browser does not have
 * — `account_flags` grants an account a self-select and no write at all, and creating an
 * account or setting a password needs the Auth admin API, which needs the service-role
 * key — so every method reaches the `admin` function, which re-checks the caller's marker
 * on each request. That is what makes a screen's own gate an affordance rather than the
 * boundary: hiding the panel is a courtesy, and the function is the check.
 *
 * `isConfigured()` is false on a build with no cloud pair, the same rule `AuthPort`,
 * `AccountPort` and `FeatureFlagsPort` follow — so the panel asks before it draws, and a
 * build without an account to administer says so rather than refusing after a press.
 *
 * `setFlags` **sets** the flags it is given: an absent key stays absent, which in the
 * stored row means the default. The panel sends the set it drew, so what it did not send
 * is not silently kept. `createAccount` confirms the address on the spot, because this
 * deployment has no mailer, and `setPassword` is the hand-run reset — the owner chooses
 * the password and hands it over.
 */
export type AdminPort = {
  isConfigured(): boolean;
  listAccounts(): Promise<AdminAccount[]>;
  setFlags(userId: string, flags: Partial<FeatureFlags>): Promise<AccountFlags>;
  createAccount(email: string, password: string): Promise<{ userId: string; email: string }>;
  setPassword(userId: string, password: string): Promise<void>;
};

/**
 * Where an event the app records about itself is written.
 *
 * Append-only by design: nothing reads these back into the product, they are
 * read by whoever is looking after the deployment. `append` is idempotent on
 * `event.id`, so a retry is the same event rather than a second one.
 */
export type EventPort = {
  append(event: AppEvent): Promise<void>;
};

/**
 * How far a sync has got, per table (`P2 · 3`, slice 3).
 *
 * The protocol is per table and push-then-pull: a push sends the local rows the table
 * has not sent yet, a pull reads the cloud's rows it has not read yet, and neither
 * mark may pass a row that was only half sent. Per table rather than per row is the
 * owner's answer (`DECISIONS.md` §12) — *"I would rather not have a per-row flag, that
 * would be too much. but per-table seems okay"* — and its cost, said plainly: the push
 * is per table, and a mark may only move to the last row actually written.
 *
 * Two marks and not one, because the two directions ask different stores: `pushedAt` is
 * where this device stopped **sending**, `pulledAt` where it stopped **reading**. One
 * value could not answer both — a row written by the other device mid-push would look
 * to have travelled already.
 */
export type SyncWatermark = {
  /** The store's own table name — `symbols`, `entries`, `binaural_presets`. */
  table: string;
  pushedAt: number;
  pulledAt: number;
};

/**
 * Where those marks live: this device's own record of how far it has got.
 *
 * Deliberately not a repository. Nothing here is a row of the product, no screen draws
 * it, and it never leaves the device — the rules that *decide* the values are pure and
 * live in `sync-rules.ts`; this only remembers them.
 */
export type SyncStatePort = {
  get(table: string): Promise<SyncWatermark | null>;
  save(mark: SyncWatermark): Promise<void>;
};

/**
 * What one run did, as counts of rows.
 *
 * `sent` is rows written to the cloud, `received` rows read back, `written` the local
 * rows a pull actually changed — the last one is the count that says whether a run
 * touched the device at all. Three plain numbers rather than a word each, because the
 * only caller that reads the answer is a test: the app runs a sync for its effect and
 * never draws it.
 */
export type SyncOutcome = {
  sent: number;
  received: number;
  written: number;
};

/**
 * One pass of the protocol (`P2 · 3`, slice 3), as the app asks for it.
 *
 * *What* a run does — the tables, their order, push before pull, and the watermarks —
 * is the storage adapter's business, and this port is the seam that keeps it there. A
 * caller asks for a run and gets counts; it cannot name a table, and that is the point.
 *
 * A build with no cloud pair is wired to an adapter that answers with zeroes rather
 * than being absent, so nothing upstream has to branch on whether an account is
 * configured before it can ask for a sync.
 *
 * **A failure is survivable and callers are expected to let it be quiet.** The store is
 * local-first: a run that throws has written what it wrote and leaves the watermarks
 * where they were, so the next run re-reads from there and the reader is no worse off.
 * A sync the reader did not ask for must not become an error they have to dismiss.
 *
 * `workspaceId` is passed in rather than read from the store, because the caller that
 * starts a run has just bootstrapped and already knows which workspace this device uses.
 */
export type SyncPort = {
  run(workspaceId: string): Promise<SyncOutcome>;
};
