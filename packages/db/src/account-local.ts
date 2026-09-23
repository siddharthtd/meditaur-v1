import { fail, type AccountPort } from "@meditaur/domain";

export const ACCOUNT_ERRORS = {
  notConfigured: "Closing an account needs cloud sign-in, which this build does not have",
} as const;

/**
 * Closing an account where there is nothing to close it on.
 *
 * Two builds are wired to this, and they are the same situation from the
 * reader's side: a local-only build has no account at all, and a cloud build
 * whose server half is not deployed yet has an account but no way to remove the
 * `auth.users` row. Both refuse with the same code, so a screen can ask
 * `isConfigured()` and not offer the affordance rather than offering a button
 * that cannot finish.
 *
 * The refusal is an `AppError` code rather than a thrown sentence, like every
 * other dead end in the app: the caller branches on the code and shows the
 * message.
 */
export function createLocalAccountPort(): AccountPort {
  return {
    isConfigured: () => false,
    async closeAccount(): Promise<void> {
      fail("account.notConfigured", ACCOUNT_ERRORS.notConfigured);
    },
  };
}
