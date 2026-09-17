import { fail, type AuthPort, type AuthSession, type SignUpOutcome } from "@meditaur/domain";

export const AUTH_ERRORS = {
  notConfigured: "Cloud sign-in is not configured on this build",
} as const;

/**
 * Identity for local-only builds. There is no cloud session, so the app stays
 * Dexie-only exactly as before: `bootstrap()` still resolves the seeded local
 * workspace, and nothing here expires or subscribes.
 *
 * This is the seam the Supabase adapter replaces. That adapter is the only
 * module allowed to import `@supabase/supabase-js`; it must keep this port
 * shape, apply session expiry against `ports.clock` (never `setInterval`), and
 * leave `bootstrap()` working when there is no session.
 */
export function createLocalAuthPort(): AuthPort {
  return {
    isConfigured: () => false,
    getSession: async () => null,
    async signIn(): Promise<AuthSession> {
      fail("auth.notConfigured", AUTH_ERRORS.notConfigured);
    },
    // Unreachable from the UI: a build with no cloud config shows no sign-up
    // affordance, and the port says so rather than inventing an account.
    async signUp(): Promise<SignUpOutcome> {
      fail("auth.notConfigured", AUTH_ERRORS.notConfigured);
    },
    async signOut(): Promise<void> {
      // Nothing to sign out of locally.
    },
    onSessionChange: () => () => {},
  };
}
