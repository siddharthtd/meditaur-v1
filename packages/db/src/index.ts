export { db } from "./schema.ts";
export type { PlanRow, SnapshotRow, StoredAccountFlags } from "./schema.ts";
export { planFromRow, savePlan } from "./plan-mapper.ts";
export { createLocalAuthPort, AUTH_ERRORS } from "./auth-local.ts";
export { createLocalAccountPort, ACCOUNT_ERRORS } from "./account-local.ts";
export { createLocalFlagsPort } from "./flags-local.ts";
export { createLocalAdminPort, ADMIN_ERRORS } from "./admin-local.ts";
export { createCachedFlags } from "./flags-cache.ts";
export { dexieFlagsCache } from "./ports.ts";
export type { LocalAccountFlags } from "./ports.ts";
export { ACCOUNT_FLAGS_TABLE, createSupabaseFlagsPort } from "./supabase.ts";
export { dexieWorkspaces } from "./identity.ts";
export {
  createSupabaseClient,
  createSupabaseAuthPort,
  createSupabaseAccountPort,
  createSupabaseEventsPort,
  createSupabasePreferencesPort,
  createSupabaseAdminPort,
  SUPABASE_AUTH_ERRORS,
  SUPABASE_ACCOUNT_ERRORS,
  SUPABASE_ADMIN_ERRORS,
  SUPABASE_PREFERENCES_ERRORS,
} from "./supabase.ts";
export type { SupabaseAuthLike, SupabaseDataLike, SupabaseFunctionsLike } from "./supabase.ts";
export { createCachedPreferences } from "./preferences-cache.ts";
export { ensureSeed, resetSeed, LOCAL_USER, LOCAL_WS } from "./seed.ts";
export { dexieMaintenance } from "./maintenance.ts";
export { dexieEvents } from "./ports.ts";
export { dexieSyncState } from "./ports.ts";
export { createLocalSyncPort, createSyncPort } from "./sync-port.ts";
export { syncOnce } from "./sync.ts";
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
