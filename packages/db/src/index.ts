export { db } from "./schema.ts";
export type { PlanRow, SnapshotRow } from "./schema.ts";
export { planFromRow, savePlan } from "./plan-mapper.ts";
export { createLocalAuthPort, AUTH_ERRORS } from "./auth-local.ts";
export { dexieWorkspaces } from "./identity.ts";
export {
  createSupabaseClient,
  createSupabaseAuthPort,
  createSupabasePreferencesPort,
  SUPABASE_AUTH_ERRORS,
  SUPABASE_PREFERENCES_ERRORS,
} from "./supabase.ts";
export type { SupabaseAuthLike, SupabaseDataLike } from "./supabase.ts";
export { createCachedPreferences } from "./preferences-cache.ts";
export { ensureSeed, LOCAL_USER, LOCAL_WS } from "./seed.ts";
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
