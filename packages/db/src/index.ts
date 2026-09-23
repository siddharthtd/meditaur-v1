export { db } from "./schema.ts";
export type { PlanRow, SnapshotRow } from "./schema.ts";
export { planFromRow, savePlan } from "./plan-mapper.ts";
export { createLocalAuthPort, AUTH_ERRORS } from "./auth-local.ts";
export { createLocalAccountPort, ACCOUNT_ERRORS } from "./account-local.ts";
export { dexieWorkspaces } from "./identity.ts";
export {
  createSupabaseClient,
  createSupabaseAuthPort,
  createSupabaseAccountPort,
  createSupabaseEventsPort,
  createSupabasePreferencesPort,
  SUPABASE_AUTH_ERRORS,
  SUPABASE_ACCOUNT_ERRORS,
  SUPABASE_PREFERENCES_ERRORS,
} from "./supabase.ts";
export type { SupabaseAuthLike, SupabaseDataLike, SupabaseFunctionsLike } from "./supabase.ts";
export { createCachedPreferences } from "./preferences-cache.ts";
export { ensureSeed, resetSeed, LOCAL_USER, LOCAL_WS } from "./seed.ts";
export { dexieMaintenance } from "./maintenance.ts";
export { dexieEvents } from "./ports.ts";
export {
  dexieBlobs,
  dexieBootstrap,
  dexieCatalog,
  dexieLogs,
  dexiePlans,
  dexiePreferences,
  dexiePresets,
  dexieRunInTransaction,
  dexieSnapshots,
} from "./ports.ts";
export type { LocalPreferences } from "./ports.ts";
