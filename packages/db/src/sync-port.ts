import type { Clock, SyncOutcome, SyncPort, SyncStatePort } from "@meditaur/domain";
import type { SupabaseDataLike } from "./supabase.ts";
import { syncOnce } from "./sync.ts";
import { createSyncLocalStore, type SyncLocalStore } from "./sync-local.ts";

/**
 * The cloud's half of the sync seam: one run of the protocol, against this device's
 * store and the cloud's tables (`P2 · 3`, slice 3).
 *
 * The protocol itself is `sync.ts`; this only binds it to the things a run needs that the
 * protocol does not own — the client, the watermarks, the clock, and the device's store
 * — and hands back the one method the app calls.
 *
 * `local` is overridable and defaulted rather than fixed, and the reason is the unit
 * suite: `createSyncLocalStore` reaches Dexie, and the unit suite has no IndexedDB, so a
 * fixed one would leave this binding untestable and only the protocol underneath it
 * covered. Production passes nothing and gets the real store; the default is the store
 * this build has, and a second one would be a second device.
 *
 * `limit` is the pull's page size, passed through so a caller can bound a run's round
 * trips. Left out, the protocol's own `SYNC_PULL_LIMIT` applies.
 */
export function createSyncPort(input: {
  client: SupabaseDataLike;
  state: SyncStatePort;
  clock: Clock;
  local?: SyncLocalStore;
  limit?: number;
}): SyncPort {
  const local = input.local ?? createSyncLocalStore();
  return {
    run(workspaceId: string): Promise<SyncOutcome> {
      return syncOnce({
        local,
        cloud: input.client,
        state: input.state,
        workspaceId,
        clock: input.clock,
        ...(input.limit === undefined ? {} : { limit: input.limit }),
      });
    },
  };
}

/**
 * Syncing where there is nothing to sync with.
 *
 * A local-only build is wired to this rather than to nothing, so a caller never has to
 * ask whether this build has a cloud pair before it can ask for a run — the same shape
 * `createLocalAuthPort` and `createLocalAccountPort` give the other two seams.
 *
 * It reports nothing sent and nothing received, which is the truth: rows that only ever
 * exist on this device have no other copy to differ from. It cannot fail, so the caller
 * that fires a run and lets it fail quietly needs no special case for this build.
 */
export function createLocalSyncPort(): SyncPort {
  return {
    async run(): Promise<SyncOutcome> {
      return { sent: 0, received: 0, written: 0 };
    },
  };
}
