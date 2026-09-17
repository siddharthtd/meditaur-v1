"use client";

import { createMeditaurApp } from "@meditaur/application";
import {
  createCachedPreferences,
  createLocalAuthPort,
  createSupabaseClient,
  createSupabaseAuthPort,
  createSupabasePreferencesPort,
  dexieBlobs,
  dexieBootstrap,
  dexieCatalog,
  dexieLogs,
  dexiePlans,
  dexiePreferences,
  dexiePresets,
  dexieRunInTransaction,
  dexieSnapshots,
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

// Cloud auth and preferences are opt-in together: with no NEXT_PUBLIC_SUPABASE_*
// pair the product stays Dexie-only, exactly as before, the local auth adapter
// reports not configured, and preferences are the local store.
function cloudPorts() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { auth: createLocalAuthPort(), preferences: dexiePreferences };
  }
  // One client for both adapters. The session it holds is what makes the data
  // requests satisfy RLS, so a second client would be a signed-in app whose own
  // preference row is invisible to it.
  const client = createSupabaseClient({ url, anonKey });
  const auth = createSupabaseAuthPort({ client: client.auth, clock: systemClock });
  return {
    auth,
    preferences: createCachedPreferences({
      auth,
      cloud: createSupabasePreferencesPort({ client: client.data }),
      local: dexiePreferences,
    }),
  };
}

const ports = cloudPorts();

export const app = createMeditaurApp({
  bootstrap: dexieBootstrap,
  auth: ports.auth,
  workspaces: dexieWorkspaces,
  plans: dexiePlans,
  catalog: dexieCatalog,
  blobs: dexieBlobs,
  presets: dexiePresets,
  preferences: ports.preferences,
  snapshots: dexieSnapshots,
  logs: dexieLogs,
  clock: systemClock,
  runInTransaction: dexieRunInTransaction,
  nextId: createId,
  durationOverrideMs: e2eDurationOverrideMs(),
});
