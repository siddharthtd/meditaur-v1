import type { AuthPort, FeatureFlagsPort } from "@meditaur/domain";
import type { LocalAccountFlags } from "./ports.ts";

/**
 * The account's flags from the cloud, with the last accepted answer kept in Dexie
 * (`P0 · 23`, slice 23c). The shape `createCachedPreferences` established, for a value
 * that is much simpler: read-only, no revisions, and one row per account.
 *
 * **The cloud is asked first, and the mirror is written from what it answered.** That
 * order matters here more than it does for preferences: a flag *hides* surfaces, so
 * serving the mirror first would show a reader the app they had before the owner turned
 * something off, for as long as the network took. Reading through is the cost of the
 * cloud being the authority.
 *
 * **The mirror is written only from an accepted read**, which is what makes it safe
 * offline: a reader whose flags are off keeps them off in a tunnel, and a reader whose
 * read failed is served the last thing the cloud actually said rather than an invention.
 * A mirror that could fall back to the defaults would turn every offline moment into
 * "everything is on", which is the one direction that leaks a hidden surface.
 *
 * The cloud is only consulted for the account the session names — a signed-out device, or
 * a read for the local identity, is the app's own answer, exactly as before flags existed.
 */
export function createCachedFlags(input: {
  auth: AuthPort;
  cloud: FeatureFlagsPort;
  local: LocalAccountFlags;
}): FeatureFlagsPort {
  const { auth, cloud, local } = input;

  async function cloudFor(userId: string): Promise<FeatureFlagsPort | null> {
    const session = await auth.getSession();
    return session?.userId === userId ? cloud : null;
  }

  return {
    isConfigured: () => cloud.isConfigured(),
    async read(userId) {
      const store = await cloudFor(userId);
      if (!store) return local.read(userId);
      try {
        const row = await store.read(userId);
        await local.writeCopy(userId, row);
        return row;
      } catch {
        // Offline, or the request failed. The last accepted answer stands, and if this
        // device has never read one, an absent mirror row is the defaults.
        return local.read(userId);
      }
    },
  };
}
