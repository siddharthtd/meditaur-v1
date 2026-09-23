import type { MaintenancePort } from "@meditaur/domain";
import { db } from "./schema.ts";
import { resetSeed } from "./seed.ts";

/**
 * Erasing this device's store.
 *
 * `delete()` drops the whole IndexedDB database rather than truncating tables
 * one at a time: it is a single operation that cannot half-finish, and the
 * schema is rebuilt from `schema.ts` the next time anything opens it.
 *
 * `resetSeed` is not decoration. `ensureSeed` caches its promise for the life of
 * the page — right for every caller but this one — so without it the next
 * `bootstrap()` would be handed the workspace id of a database that no longer
 * exists. The failure that produces is quiet: no throw, just an app that reads
 * an empty store and never seeds one.
 *
 * What this deliberately does NOT touch: the reader's session. Signing out and
 * erasing the device are different erasures, and the account page offers both
 * rather than folding them into one destructive press.
 */
export const dexieMaintenance: MaintenancePort = {
  async wipeLocalData(): Promise<void> {
    await db.delete();
    resetSeed();
  },
};
