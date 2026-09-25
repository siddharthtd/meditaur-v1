import { fail, type AdminPort } from "@meditaur/domain";

export const ADMIN_ERRORS = {
  notConfigured: "The admin panel needs cloud sign-in, which this build does not have",
} as const;

/**
 * The admin panel where there is nothing to administer (`P0 · 23`, slice 23f).
 *
 * Two builds are wired to this, and they are the same situation from the owner's side: a
 * local-only build has no accounts at all, and a cloud build whose `admin` function is not
 * deployed has accounts but no way to write a flag for one. Every method refuses with the
 * same code, so the screen can ask `isConfigured()` and say so rather than drawing a form
 * that cannot finish.
 *
 * The refusal is an `AppError` code rather than a thrown sentence, like every other dead
 * end in the app: the caller branches on the code and shows the message.
 *
 * It is deliberately not "you are not an admin". That question is answered by the account's
 * own marker — `useSession().isAdmin`, and again by the function on every request — and a
 * build with no cloud cannot answer it either way.
 */
export function createLocalAdminPort(): AdminPort {
  return {
    isConfigured: () => false,
    async listAccounts() {
      fail("admin.notConfigured", ADMIN_ERRORS.notConfigured);
    },
    async setFlags() {
      fail("admin.notConfigured", ADMIN_ERRORS.notConfigured);
    },
    async createAccount() {
      fail("admin.notConfigured", ADMIN_ERRORS.notConfigured);
    },
    async setPassword() {
      fail("admin.notConfigured", ADMIN_ERRORS.notConfigured);
    },
  };
}
