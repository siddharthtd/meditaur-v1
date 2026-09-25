import { DEFAULT_FEATURE_FLAGS, type AccountFlags, type FeatureFlagsPort } from "@meditaur/domain";

/**
 * The flags where there is no cloud at all — a local-only build.
 *
 * Answers the defaults and reports itself not configured, which is the same shape
 * `createLocalAuthPort` and `createLocalAccountPort` give the other two seams. It exists
 * so that nothing upstream has to ask whether this build has a cloud pair before it can
 * read flags: with no account there are no flags to read, and "everything on" is the
 * answer the app has always given.
 *
 * It is deliberately **not** `createLocalFlagsPort` returning nothing: a null object that
 * failed would put a third state — "flags unavailable" — in front of every screen, and
 * the whole point of the defaults is that there is no third state.
 */
export function createLocalFlagsPort(): FeatureFlagsPort {
  return {
    isConfigured: () => false,
    async read(): Promise<AccountFlags> {
      return { flags: DEFAULT_FEATURE_FLAGS, isAdmin: false };
    },
  };
}
