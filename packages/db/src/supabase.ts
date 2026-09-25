import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_FEATURE_FLAGS,
  fail,
  normalizeFeatureFlags,
  normalizeTheme,
  type AccountFlags,
  type AccountPort,
  type AdminAccount,
  type AdminPort,
  type AppEvent,
  type AuthPort,
  type AuthSession,
  type Clock,
  type EventPort,
  type FeatureFlagsPort,
  type PreferencesRepository,
  type SignUpOutcome,
  type UserPreferences,
} from "@meditaur/domain";

export const SUPABASE_AUTH_ERRORS = {
  signInFailed: "Could not sign in",
  signUpFailed: "Could not create the account",
  signOutFailed: "Could not sign out",
} as const;

/**
 * The slice of `supabase.auth` this adapter uses. Declaring it here (instead of
 * depending on the SDK's full surface) keeps the adapter unit-testable with a
 * fake client, and `createSupabaseAuthClient` below is what proves the real
 * client still satisfies it.
 */
export type SupabaseAuthLike = {
  signInWithPassword(credentials: { email: string; password: string }): Promise<{
    data: {
      user: { id: string } | null;
      session: SupabaseSessionLike | null;
    };
    error: { message: string } | null;
  }>;
  signUp(credentials: { email: string; password: string }): Promise<{
    data: {
      user: { id: string } | null;
      session: SupabaseSessionLike | null;
    };
    error: { message: string } | null;
  }>;
  signOut(): Promise<{ error: { message: string } | null }>;
  getSession(): Promise<{
    data: { session: SupabaseSessionLike | null };
    error: { message: string } | null;
  }>;
};

type SupabaseSessionLike = {
  user: { id: string };
  /** Seconds since the epoch, as the Auth API reports it. */
  expires_at?: number | null;
};

type PostgrestResultLike = {
  data: unknown;
  error: { message: string } | null;
};

/**
 * The three data operations this module needs, as plain promises.
 *
 * Declared as an interface rather than as a slice of the SDK's builder chain for
 * two reasons. `createSupabaseDataClient` is written against the real client and
 * *is* the proof the SDK offers these operations (a hand-written wrapper only
 * compiles if the API is really there) — a structural comparison against the
 * SDK's generic builders makes the compiler give up (TS2589) instead. And a fake
 * implementing three promise-returning methods is a fake; a fake implementing a
 * builder chain is a re-implementation.
 */
export type SupabaseDataLike = {
  /** `columns` where `column = value`, as rows. */
  select(
    table: string,
    column: string,
    value: string,
    columns: string,
  ): Promise<Record<string, unknown>[]>;
  /**
   * `columns` where `column > value`, oldest first, at most `limit` rows.
   *
   * A pull reads forward from a per-table watermark, so it needs a range rather
   * than an equality. The bound is the other half: without it one table's answer
   * is the whole table, and the watermark never advances past a first batch.
   * Ordered by that same column, which is the one the pull's index carries
   * (`20260921140000_sync_delete_marks.sql`).
   */
  selectRange(
    table: string,
    column: string,
    value: string | number,
    columns: string,
    limit: number,
  ): Promise<Record<string, unknown>[]>;
  /**
   * `columns` where `column` is one of `values`.
   *
   * `field_values` is scoped by the entity it hangs off rather than by a
   * workspace, so pulling a workspace's rows means asking for it by entity id —
   * the one read `select` (a single equality) cannot express.
   */
  selectIn(
    table: string,
    column: string,
    values: string[],
    columns: string,
  ): Promise<Record<string, unknown>[]>;
  /** The rows the conditional update actually changed. */
  updateWhere(
    table: string,
    values: Record<string, unknown>,
    where: Record<string, string | number>,
  ): Promise<Record<string, unknown>[]>;
  /** Insert one row, and report what was created. */
  insert(table: string, values: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  /**
   * Store one row whether or not the store already holds it, and report it.
   *
   * A catalogue save is an upsert by definition: sync's settles last-write-wins
   * with no conflict screen (`DECISIONS.md` §7), so a row carries everything it
   * needs and there is no predicate for `updateWhere` to compare — the same reason
   * a delete is an ordinary write rather than a delete. It could be spelled as
   * `updateWhere` and then `insert`, which is the dance the preferences adapter
   * needs because **its** save is a compare-and-swap; here that is three requests
   * per row where one will do, and a push sends every row that moved.
   *
   * `insert` stays, and stays different: `events` is a table where a duplicate is a
   * fact worth seeing rather than one worth merging (`createSupabaseEventsPort`).
   */
  upsert(table: string, values: Record<string, unknown>): Promise<Record<string, unknown>[]>;
};

function unwrap(result: PostgrestResultLike): Record<string, unknown>[] {
  if (result.error) fail("supabase.requestFailed", result.error.message);
  return (result.data as Record<string, unknown>[] | null) ?? [];
}

function createSupabaseDataClient(client: SupabaseClient): SupabaseDataLike {
  return {
    async select(table, column, value, columns) {
      return unwrap(await client.from(table).select(columns).eq(column, value));
    },
    async selectRange(table, column, value, columns, limit) {
      return unwrap(
        await client
          .from(table)
          .select(columns)
          .gt(column, value)
          .order(column, { ascending: true })
          .limit(limit),
      );
    },
    async selectIn(table, column, values, columns) {
      // An empty list is an empty answer. Asking for `in ()` would be a request
      // that can only come back with nothing.
      if (values.length === 0) return [];
      return unwrap(await client.from(table).select(columns).in(column, values));
    },
    async updateWhere(table, values, where) {
      let query = client.from(table).update(values);
      for (const [column, value] of Object.entries(where)) {
        query = query.eq(column, value);
      }
      // Asking for a column back is what makes PostgREST return the rows it
      // changed, which is the whole answer to "did the revision still match?".
      const { data, error } = await query.select("user_id");
      if (error) fail("supabase.requestFailed", error.message);
      return (data as Record<string, unknown>[] | null) ?? [];
    },
    async insert(table, values) {
      const { data, error } = await client.from(table).insert(values).select();
      if (error) fail("supabase.requestFailed", error.message);
      return (data as Record<string, unknown>[] | null) ?? [];
    },
    async upsert(table, values) {
      // No conflict target is named, deliberately: the SDK's default is the primary
      // key, which is the row's identity in every table this is used on — including
      // `field_values`, whose key is the pair `(entity_id, field_def_id)`.
      const { data, error } = await client.from(table).upsert(values).select();
      if (error) fail("supabase.requestFailed", error.message);
      return (data as Record<string, unknown>[] | null) ?? [];
    },
  };
}

/**
 * The slice of `supabase.functions` this adapter uses: one call, by name.
 */
export type SupabaseFunctionsLike = {
  invoke<T>(
    name: string,
    options?: { body?: unknown },
  ): Promise<{ data: T | null; error: { message: string } | null }>;
};

/**
 * The one place the SDK is constructed. This module is the only importer of
 * `@supabase/supabase-js` in the repo; `tests/unit/architecture/integrity.test.ts`
 * enforces that.
 *
 * **One** client, both adapters. The auth adapter and the preferences adapter
 * have to share it: the session the client holds is what makes the data requests
 * satisfy RLS, so two clients would mean a signed-in app whose own preference row
 * is invisible to it.
 */
export function createSupabaseClient(input: { url: string; anonKey: string }): {
  auth: SupabaseAuthLike;
  data: SupabaseDataLike;
  functions: SupabaseFunctionsLike;
} {
  const client = createClient(input.url, input.anonKey);
  return {
    auth: client.auth,
    data: createSupabaseDataClient(client),
    functions: {
      async invoke<T>(name: string, options?: { body?: unknown }) {
        // The slice above is deliberately narrower than the SDK's own options
        // type, and this call is the one place the two meet — so the cast lives
        // here rather than leaking the SDK's types into the domain-facing port.
        const { data, error } = await client.functions.invoke<T>(
          name,
          options as Parameters<typeof client.functions.invoke>[1],
        );
        return { data: data ?? null, error };
      },
    },
  };
}

/**
 * `AuthPort` over Supabase Auth.
 *
 * Expiry is deadline-based: the session carries an epoch-ms deadline and a
 * `Clock` timer fires at it — never `setInterval`. When the timer fires, the
 * deadline is re-checked against a fresh read before the session is dropped,
 * because the SDK refreshes tokens in the background and a local clock must not
 * sign a healthy session out.
 *
 * Reads go through to the SDK, so `getSession()` always sees a refreshed token.
 * The SDK persists the session itself (`localStorage` by default), so a reload
 * restores it and nothing local has to be written for that. Listeners fire on
 * the transitions this adapter causes (sign-in, sign-up, sign-out, expiry),
 * which is what the port promises.
 *
 * Sign-up is the same shape as sign-in, with one asymmetry the project settings
 * create: when `Confirm email` is on, Supabase returns a user and **no** session,
 * because nobody is signed in until the link is followed. That case resolves as
 * `confirmationRequired` and leaves the port's session untouched.
 */
export function createSupabaseAuthPort(input: {
  client: SupabaseAuthLike;
  clock: Clock;
}): AuthPort {
  const { client, clock } = input;
  const listeners = new Set<(session: AuthSession | null) => void>();
  let session: AuthSession | null = null;
  let expiryTimer: unknown = null;

  function toSession(raw: SupabaseSessionLike | null): AuthSession | null {
    if (!raw) return null;
    const expiresAt = raw.expires_at == null ? null : raw.expires_at * 1000;
    if (expiresAt != null && expiresAt <= clock.nowMs()) return null;
    return { userId: raw.user.id, expiresAt };
  }

  function notify(): void {
    for (const listener of listeners) listener(session);
  }

  function setSession(next: AuthSession | null): void {
    clock.clear(expiryTimer);
    expiryTimer = null;
    session = next;
    if (next?.expiresAt != null) {
      expiryTimer = clock.setTimeout(
        () => void recheckExpiry(),
        Math.max(0, next.expiresAt - clock.nowMs()),
      );
    }
    notify();
  }

  async function recheckExpiry(): Promise<void> {
    const { data } = await client.getSession();
    setSession(toSession(data.session));
  }

  return {
    isConfigured: () => true,
    async getSession() {
      const { data, error } = await client.getSession();
      if (error) return null;
      session = toSession(data.session);
      return session;
    },
    async signIn(email, password) {
      const { data, error } = await client.signInWithPassword({ email, password });
      if (error) fail("auth.signInFailed", error.message || SUPABASE_AUTH_ERRORS.signInFailed);
      const next = toSession(data.session);
      if (!next) fail("auth.signInFailed", SUPABASE_AUTH_ERRORS.signInFailed);
      setSession(next);
      return next;
    },
    async signUp(email, password): Promise<SignUpOutcome> {
      const { data, error } = await client.signUp({ email, password });
      if (error) {
        fail("auth.signUpFailed", error.message || SUPABASE_AUTH_ERRORS.signUpFailed);
      }
      const next = toSession(data.session);
      // No session is not an error here: it is the confirmation-required case,
      // and claiming a signed-in state we cannot prove would be worse.
      if (!next) return { status: "confirmationRequired" };
      setSession(next);
      return { status: "signedIn", session: next };
    },
    async signOut() {
      clock.clear(expiryTimer);
      expiryTimer = null;
      const { error } = await client.signOut();
      if (error) fail("auth.signOutFailed", error.message || SUPABASE_AUTH_ERRORS.signOutFailed);
      setSession(null);
    },
    onSessionChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const SUPABASE_PREFERENCES_ERRORS = {
  readFailed: "Could not load settings from the cloud",
  writeFailed: "Could not save settings to the cloud",
} as const;

const PREFERENCES_TABLE = "user_preferences";

/** The row as the table stores it, in the column names it uses. */
function preferencesRow(prefs: UserPreferences): Record<string, unknown> {
  return {
    user_id: prefs.userId,
    stop_binaural_on_alarm: prefs.stopBinauralOnAlarm,
    auto_advance: prefs.autoAdvance,
    alarm_enabled: prefs.alarmEnabled,
    master_volume: prefs.masterVolume,
    alarm_volume: prefs.alarmVolume,
    tts_enabled: prefs.ttsEnabled,
    text_size: prefs.textSize,
    theme: prefs.theme,
    last_plan_id: prefs.lastPlanId,
    revision: prefs.revision,
    updated_at: new Date(prefs.updatedAt).toISOString(),
  };
}

function preferencesFromRow(row: Record<string, unknown>): UserPreferences {
  return {
    userId: row.user_id as string,
    stopBinauralOnAlarm: row.stop_binaural_on_alarm === true,
    autoAdvance: row.auto_advance !== false,
    // Absent from a row written before the column existed, and the alarm was never
    // optional: off has to be said out loud.
    alarmEnabled: row.alarm_enabled !== false,
    masterVolume: (row.master_volume as number | undefined) ?? 0.7,
    alarmVolume: (row.alarm_volume as number | undefined) ?? 0.6,
    ttsEnabled: row.tts_enabled === true,
    textSize: (row.text_size as UserPreferences["textSize"] | undefined) ?? "md",
    // Absent from a row written before the column existed, and unknown values read as the
    // app's own scheme: the domain's normaliser is the one rule for both stores.
    theme: normalizeTheme(row.theme),
    lastPlanId: (row.last_plan_id as string | null | undefined) ?? null,
    revision: (row.revision as number | undefined) ?? 0,
    updatedAt: row.updated_at ? Date.parse(row.updated_at as string) : 0,
  };
}

/**
 * `PreferencesRepository` over `user_preferences`.
 *
 * `save` is the compare-and-swap, and on this store it is **one statement**: the
 * `revision` is part of the `where`, so a row that another device has already
 * moved past matches nothing and nothing is written. A read followed by an update
 * would be two round trips with a race between them — the same defect the plan
 * CAS had before the review's atomicity finding (2026-09-15), and the reason the check belongs to the store.
 *
 * RLS (`prefs_self`, from the baseline) is what keeps this to the signed-in
 * reader's own row; the `user_id` filter is the second half of that, not the
 * whole of it. The anon key is all the browser gets, and it never reaches
 * `auth.users` — a row can only be written for a user the session proves.
 */
/**
 * `EventPort` over the `events` table.
 *
 * One insert, and `received_at` is deliberately not sent: when the row landed is
 * a fact only the server knows, and its column default is a better answer than
 * the client's clock. `id` is the primary key, so a retry collides rather than
 * duplicating — the application does not retry, and a collision is visible.
 */
export function createSupabaseEventsPort(input: { client: SupabaseDataLike }): EventPort {
  return {
    async append(event: AppEvent) {
      await input.client.insert("events", {
        id: event.id,
        workspace_id: event.workspaceId,
        user_id: event.userId,
        event_type: event.eventType,
        payload: event.payload,
        occurred_at: new Date(event.occurredAt).toISOString(),
      });
    },
  };
}

export const SUPABASE_ACCOUNT_ERRORS = {
  closeFailed: "Could not close the account",
} as const;

/**
 * `AccountPort` over the `close-account` function.
 *
 * The server half is the piece the browser cannot do — removing the `auth.users`
 * row needs the service-role key, which by design never reaches this bundle — so
 * this adapter's whole job is to call the function and turn its failure into the
 * one sentence a reader sees. The function runs `delete_my_data()` as the caller
 * before it removes the row, so RLS still decides what the purge may touch.
 */
export function createSupabaseAccountPort(input: {
  functions: SupabaseFunctionsLike;
}): AccountPort {
  return {
    isConfigured: () => true,
    async closeAccount() {
      const { error } = await input.functions.invoke<{ closed?: boolean }>("close-account", {
        body: {},
      });
      if (error) {
        fail("account.closeFailed", error.message || SUPABASE_ACCOUNT_ERRORS.closeFailed);
      }
    },
  };
}

export const SUPABASE_ADMIN_ERRORS = {
  refused: "The admin function refused the request",
} as const;

/**
 * `AdminPort` over the `admin` function (`P0 · 23`, slice 23f).
 *
 * None of these methods can work from the browser alone: `account_flags` grants an
 * account a self-select and no write, and creating an account or setting a password
 * needs the Auth admin API. So the adapter's whole job is to name the action and unwrap
 * the answer, and the function behind it re-checks the caller's marker on every request —
 * which is what makes the panel's own gate an affordance rather than the boundary.
 *
 * A failure carries the one sentence a screen shows, the same rule the account and
 * preference adapters follow. The function's own `{ error: … }` code is deliberately not
 * surfaced here: the panel validates what a reader typed before it calls (an address, a
 * password's length), so a refusal that reaches this point is an exception rather than
 * something a form is expected to explain.
 */
export function createSupabaseAdminPort(input: {
  functions: SupabaseFunctionsLike;
}): AdminPort {
  async function call<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await input.functions.invoke<T>("admin", { body });
    if (error) fail("admin.requestFailed", error.message || SUPABASE_ADMIN_ERRORS.refused);
    if (data === null || data === undefined) {
      fail("admin.requestFailed", SUPABASE_ADMIN_ERRORS.refused);
    }
    return data;
  }

  return {
    isConfigured: () => true,
    async listAccounts() {
      const answer = await call<{ accounts?: AdminAccount[] }>({ action: "list" });
      return answer.accounts ?? [];
    },
    async setFlags(userId, flags) {
      // The function answers with the stored row, so the panel patches the row it drew
      // rather than re-reading every account (item 4's shape).
      const answer = await call<{ account?: AccountFlags }>({
        action: "set-flags",
        userId,
        flags,
      });
      if (!answer.account) fail("admin.requestFailed", SUPABASE_ADMIN_ERRORS.refused);
      return answer.account;
    },
    async createAccount(email, password) {
      const answer = await call<{ account?: { userId: string; email: string } }>({
        action: "create-account",
        email,
        password,
      });
      if (!answer.account) fail("admin.requestFailed", SUPABASE_ADMIN_ERRORS.refused);
      return answer.account;
    },
    async setPassword(userId, password) {
      await call<{ account?: { userId: string } }>({ action: "set-password", userId, password });
    },
  };
}

export function createSupabasePreferencesPort(input: {
  client: SupabaseDataLike;
}): PreferencesRepository {
  const { client } = input;

  /**
   * The SDK's own words when it has any — a refused request says why — with the
   * adapter's sentence as the fallback for a failure that carries none.
   */
  async function request<T>(work: () => Promise<T>, fallback: string): Promise<T> {
    try {
      return await work();
    } catch (err) {
      fail(
        "preferences.requestFailed",
        err instanceof Error && err.message ? err.message : fallback,
      );
    }
  }

  return {
    async get(userId) {
      const rows = await request(
        () => client.select(PREFERENCES_TABLE, "user_id", userId, "*"),
        SUPABASE_PREFERENCES_ERRORS.readFailed,
      );
      return rows.length > 0 ? preferencesFromRow(rows[0]) : null;
    },
    async save(prefs) {
      // The row goes out one revision on, and only if the store is still on the
      // revision this caller read — so the predicate is the version the caller
      // actually saw, and nobody can name a revision that skips ahead.
      const next = { ...prefs, revision: prefs.revision + 1 };
      const values = preferencesRow(next);
      const changed = await request(
        () =>
          client.updateWhere(PREFERENCES_TABLE, values, {
            user_id: prefs.userId,
            revision: prefs.revision,
          }),
        SUPABASE_PREFERENCES_ERRORS.writeFailed,
      );
      if (changed.length > 0) return next;

      // Nothing matched: either this account has no row yet — its first save —
      // or another client moved the revision first. Only the first is a write.
      const existing = await request(
        () => client.select(PREFERENCES_TABLE, "user_id", prefs.userId, "revision"),
        SUPABASE_PREFERENCES_ERRORS.writeFailed,
      );
      if (existing.length > 0) return null;

      await request(
        () => client.insert(PREFERENCES_TABLE, values),
        SUPABASE_PREFERENCES_ERRORS.writeFailed,
      );
      return next;
    },
  };
}

/** The table the account's flags and its admin marker live in (`P0 · 23`). */
export const ACCOUNT_FLAGS_TABLE = "account_flags";

/**
 * `FeatureFlagsPort` over the `account_flags` table.
 *
 * One read of one row, and there is **no write here at all** — by policy rather than by
 * omission: RLS grants this account a self-select and no write, so a save attempted from
 * the browser would change nothing. The owner sets flags through the `admin` function,
 * which holds the service role.
 *
 * The row is read as the caller: `user_id` is the filter *and* `account_flags_self_select`
 * is what actually keeps it to their own row, so the filter is the half that makes the
 * query legible rather than the half that makes it safe.
 *
 * **A missing row is not an error and not an empty answer.** An account the owner has not
 * touched has no row, which is an account with every default — so the answer is the
 * defaults, and the sparse `flags` object goes through `normalizeFeatureFlags`, which also
 * reads a stale or hand-edited value as the default rather than refusing to sign anybody
 * in over it.
 */
export function createSupabaseFlagsPort(input: { client: SupabaseDataLike }): FeatureFlagsPort {
  const { client } = input;
  return {
    isConfigured: () => true,
    async read(userId: string): Promise<AccountFlags> {
      const rows = await client.select(ACCOUNT_FLAGS_TABLE, "user_id", userId, "*");
      const row = rows[0];
      if (!row) return { flags: DEFAULT_FEATURE_FLAGS, isAdmin: false };
      return {
        flags: normalizeFeatureFlags(row.flags),
        // Anything but `true` is false: an admin marker that failed open would hand the
        // panel to whoever the read went wrong for.
        isAdmin: row.is_admin === true,
      };
    },
  };
}
