"use client";

import { createMeditaurApp } from "@meditaur/application";
import {
  createCachedFlags,
  createCachedPreferences,
  createLocalAccountPort,
  createLocalAdminPort,
  createLocalAuthPort,
  createLocalFlagsPort,
  createLocalSyncPort,
  createSupabaseClient,
  createSupabaseAuthPort,
  createSupabaseAccountPort,
  createSupabaseAdminPort,
  createSupabaseEventsPort,
  createSupabaseFlagsPort,
  createSupabasePreferencesPort,
  createSyncPort,
  dexieBlobs,
  dexieBootstrap,
  dexieCatalog,
  dexieEvents,
  dexieFlagsCache,
  dexieLogs,
  dexieMaintenance,
  dexiePlans,
  dexiePreferences,
  dexiePresets,
  dexieRunInTransaction,
  dexieSnapshots,
  dexieSyncState,
  dexieWorkspaces,
} from "@meditaur/db";
import { createId, systemClock } from "@meditaur/domain";

export const E2E_DURATION_STORAGE_KEY = "meditaur:e2eDurationMs";

function e2eDurationOverrideMs(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(E2E_DURATION_STORAGE_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

// Cloud auth, preferences and sync are opt-in together: with no
// NEXT_PUBLIC_SUPABASE_* pair the product stays Dexie-only, exactly as before,
// the local auth adapter reports not configured, preferences are the local
// store, and a sync run is the adapter that sends and receives nothing.
function cloudPorts() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return {
      auth: createLocalAuthPort(),
      account: createLocalAccountPort(),
      admin: createLocalAdminPort(),
      flags: createLocalFlagsPort(),
      preferences: dexiePreferences,
      events: dexieEvents,
      sync: createLocalSyncPort(),
    };
  }
  // One client for both adapters. The session it holds is what makes the data
  // requests satisfy RLS, so a second client would be a signed-in app whose own
  // preference row is invisible to it.
  const client = createSupabaseClient({ url, anonKey });
  const auth = createSupabaseAuthPort({ client: client.auth, clock: systemClock });
  return {
    auth,
    // Closing an account needs the service-role key, which never reaches this
    // bundle, so the app calls the `close-account` function and this adapter is
    // the only thing that knows the function exists.
    account: createSupabaseAccountPort({ functions: client.functions }),
    // The panel's four actions, and the same reason: they need the service-role key,
    // which this bundle never holds, so the app names an action and the function
    // re-checks who is asking before it does anything.
    admin: createSupabaseAdminPort({ functions: client.functions }),
    // Flags are read from the account's own row and mirrored in Dexie, so a reader whose
    // flags are off keeps them off offline. There is no writer here on purpose: the owner
    // sets flags through the `admin` function, and RLS would refuse anything this bundle
    // tried to write.
    flags: createCachedFlags({
      auth,
      cloud: createSupabaseFlagsPort({ client: client.data }),
      local: dexieFlagsCache,
    }),
    events: createSupabaseEventsPort({ client: client.data }),
    preferences: createCachedPreferences({
      auth,
      cloud: createSupabasePreferencesPort({ client: client.data }),
      local: dexiePreferences,
    }),
    // The watermarks are this device's own record of how far it has got, so they
    // stay in Dexie even on a cloud build: what travels is the rows, never the
    // marks that say which rows already have.
    sync: createSyncPort({ client: client.data, state: dexieSyncState, clock: systemClock }),
  };
}

const ports = cloudPorts();

export const app = createMeditaurApp({
  bootstrap: dexieBootstrap,
  auth: ports.auth,
  // With no cloud pair there is no account to close, and the local adapter says
  // so rather than leaving a screen to offer a button that cannot finish.
  account: ports.account,
  // The admin panel's four actions through the function that holds the service role.
  admin: ports.admin,
  // A client error goes to the cloud when there is one and to Dexie otherwise,
  // so a broken screen is visible on the deployment that needs it most.
  events: ports.events,
  // Never absent, like `sync`: with no cloud pair this answers the defaults, so a screen
  // asks the same question on both builds.
  flags: ports.flags,
  workspaces: dexieWorkspaces,
  plans: dexiePlans,
  catalog: dexieCatalog,
  blobs: dexieBlobs,
  presets: dexiePresets,
  preferences: ports.preferences,
  snapshots: dexieSnapshots,
  logs: dexieLogs,
  maintenance: dexieMaintenance,
  // Never absent: with no cloud pair this is the adapter that reports nothing
  // sent and nothing received, so the app asks for a run the same way on both
  // builds and the reader never sees which one they have.
  sync: ports.sync,
  clock: systemClock,
  runInTransaction: dexieRunInTransaction,
  nextId: createId,
  durationOverrideMs: e2eDurationOverrideMs(),
});
