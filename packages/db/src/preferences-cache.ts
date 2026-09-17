import type { AuthPort, PreferencesRepository } from "@meditaur/domain";
import type { LocalPreferences } from "./ports.ts";

/**
 * Preferences from the cloud when there is a cloud, with Dexie kept as the
 * offline copy — Phase 2's read-through bootstrap.
 *
 * **Read** goes to the cloud and writes what it finds into the local copy on the
 * way through, so a read with no network still has the reader's settings. If the
 * cloud cannot be reached the copy answers: settings must not become unreadable
 * in a tunnel. (Reading through the network first is the cost of the cloud being
 * authoritative — the copy is a copy, and serving it first would make the two
 * disagree silently.)
 *
 * **Write** goes to the cloud and only then to the copy, because the cloud's
 * `save` is the compare-and-swap: a refusal comes back as `null` and nothing is
 * mirrored, so the two stores cannot end up disagreeing about a revision nobody
 * wrote. A cloud write that cannot complete is an error the reader sees — this
 * phase has no offline mutation queue, deliberately (docs/ARCHITECTURE.md).
 *
 * The cloud is only consulted for the reader the session names. A signed-out
 * device, or a preference row belonging to the local identity, is served and
 * written locally exactly as before.
 */
export function createCachedPreferences(input: {
  auth: AuthPort;
  cloud: PreferencesRepository;
  local: LocalPreferences;
}): PreferencesRepository {
  const { auth, cloud, local } = input;

  async function cloudFor(userId: string): Promise<PreferencesRepository | null> {
    const session = await auth.getSession();
    return session?.userId === userId ? cloud : null;
  }

  return {
    async get(userId) {
      const store = await cloudFor(userId);
      if (!store) return local.get(userId);
      try {
        const row = await store.get(userId);
        if (!row) return local.get(userId);
        await local.writeCopy(row);
        return row;
      } catch {
        return local.get(userId);
      }
    },
    async save(prefs) {
      const store = await cloudFor(prefs.userId);
      if (!store) return local.save(prefs);
      const stored = await store.save(prefs);
      if (stored) await local.writeCopy(stored);
      return stored;
    },
  };
}
