"use client";

import { app } from "@/composition";
import { useSession } from "@/features/auth/SessionProvider";
import { useArmedId } from "@/lib/armed";
import { errorText } from "@/lib/error-text";
import {
  FEATURE_FLAGS,
  FEATURE_FLAG_INFO,
  type AdminAccount,
  type FeatureFlag,
  type FeatureFlags,
} from "@meditaur/domain";
import { Button, LatchButton } from "@meditaur/ui";
import { useCallback, useEffect, useState } from "react";

/**
 * The admin panel (`P0 · 23`, slice 23f) — the owner's own tool.
 *
 * It is not a reader's screen and it does not try to look like one: an account at a time,
 * its eight flags as latches, and the three actions the owner needs. What it draws is a
 * *reading* of `account_flags`, which the browser cannot write — every press here goes
 * through `AdminPort` to the `admin` function, which reads the caller's own marker again
 * on each request. That is why this screen's gate is an affordance rather than the
 * boundary, and why the sentence for "not for you" is a fact rather than a threat.
 *
 * **The door is a link on `/account`, shown to an admin**, and deliberately not an
 * `AppNav` entry: the nav is the reader's five destinations (`DECISIONS.md` §11). Typing
 * the address works for an admin and refuses everyone else here, and again in the
 * function.
 *
 * Three habits from the rest of the app are kept on purpose. Every flag is drawn from
 * `FEATURE_FLAGS`, so a flag added to the union appears here without an edit. A save
 * answers with the stored row and patches the row it drew rather than re-reading every
 * account (item 4's rule). And `Set a new password` is a two-press armed control, because
 * it is the one action here that a reader cannot undo.
 */
const MIN_PASSWORD = 8;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What a row is called in a sentence: the address, or the id when there is none. */
function labelOf(account: AdminAccount): string {
  return account.email || account.userId;
}

function dayOf(value: string | null): string {
  if (!value) return "never";
  return value.slice(0, 10);
}

export function AdminPanel() {
  const session = useSession();
  const configured = app.adminIsConfigured();
  const allowed = session.isAdmin && session.flags.admin_panel;

  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, FeatureFlags>>({});
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [armedPassword, setArmedPassword] = useArmedId();

  const reload = useCallback(async () => {
    try {
      setAccounts(await app.listAccounts());
      setError(null);
    } catch (err) {
      setAccounts([]);
      setError(errorText(err, "Could not read the accounts"));
    }
  }, []);

  useEffect(() => {
    if (!session.ready || !allowed || !configured) return;
    void reload();
  }, [session.ready, allowed, configured, reload]);

  function draftFor(account: AdminAccount): FeatureFlags {
    return drafts[account.userId] ?? account.flags;
  }

  function isDirty(account: AdminAccount): boolean {
    const draft = draftFor(account);
    return FEATURE_FLAGS.some((flag) => draft[flag] !== account.flags[flag]);
  }

  function expand(account: AdminAccount) {
    setOpen((current) => (current === account.userId ? null : account.userId));
    // The draft is seeded from the stored row the first time a row is opened, so what a
    // save sends is the set this screen drew — an absent key would mean the default, and
    // a reader's flags should not depend on which rows happened to be visited.
    setDrafts((current) =>
      current[account.userId] ? current : { ...current, [account.userId]: { ...account.flags } },
    );
  }

  function toggle(account: AdminAccount, flag: FeatureFlag, next: boolean) {
    const draft = draftFor(account);
    setDrafts((current) => ({ ...current, [account.userId]: { ...draft, [flag]: next } }));
  }

  async function save(account: AdminAccount) {
    const flags = draftFor(account);
    setBusy(account.userId);
    setError(null);
    try {
      const stored = await app.setAccountFlags(account.userId, flags);
      setAccounts((rows) =>
        (rows ?? []).map((row) => (row.userId === account.userId ? { ...row, ...stored } : row)),
      );
      setDrafts((current) => ({ ...current, [account.userId]: stored.flags }));
      setNotice(`Saved ${labelOf(account)}.`);
    } catch (err) {
      setError(errorText(err, "Could not save those flags"));
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    const email = newEmail.trim();
    if (!EMAIL_SHAPE.test(email)) {
      setError("That does not look like an email address.");
      return;
    }
    if (newPassword.length < MIN_PASSWORD) {
      setError(`A password needs at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setBusy("create");
    setError(null);
    try {
      const made = await app.createAccount(email, newPassword);
      setNewEmail("");
      setNewPassword("");
      setNotice(`Created ${made.email}. Everything is on for them until you turn something off.`);
      // The one action this screen cannot patch from its answer: when the account was made
      // and when it last signed in are the server's facts, and one extra read at this size
      // buys nothing worth a guess.
      await reload();
    } catch (err) {
      setError(errorText(err, "Could not create the account"));
    } finally {
      setBusy(null);
    }
  }

  async function resetPassword(account: AdminAccount) {
    if (armedPassword !== account.userId) {
      setArmedPassword(account.userId);
      return;
    }
    const password = passwords[account.userId] ?? "";
    setArmedPassword(null);
    if (password.length < MIN_PASSWORD) {
      setError(`A password needs at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setBusy(account.userId);
    setError(null);
    try {
      await app.setAccountPassword(account.userId, password);
      setPasswords((current) => ({ ...current, [account.userId]: "" }));
      setNotice(
        `Set a new password for ${labelOf(account)}. Hand it over yourself — nothing was emailed.`,
      );
    } catch (err) {
      setError(errorText(err, "Could not set that password"));
    } finally {
      setBusy(null);
    }
  }

  if (!session.ready) {
    return (
      <main className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold">Admin</h1>
        <p className="text-muted">Loading …</p>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold">Admin</h1>
        <p className="text-muted">
          This area belongs to the account that runs the beta. Yours does not have it.
        </p>
      </main>
    );
  }

  if (!configured) {
    return (
      <main className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold">Admin</h1>
        <p className="text-muted">
          This build cannot reach the admin function, so there is nothing to set here.
        </p>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">Admin</h1>
        <p className="text-muted">
          The accounts, and what each one may see. Every flag starts on for a new account,
          so a flag is only ever something you take away.
        </p>
      </header>

      {error ? <p className="text-lg text-destructive">{error}</p> : null}
      {notice ? <p className="text-lg text-muted">{notice}</p> : null}

      <section className="flex flex-col gap-3 border-t border-line pt-6">
        <h2 className="text-2xl font-semibold">Create an account</h2>
        <p className="text-muted">
          The address is confirmed on the spot, because this deployment sends no mail — so
          there is no link to follow and nothing to wait for.
        </p>
        <label className="flex flex-col gap-2">
          <span className="text-lg text-muted">Email</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="off"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            className="min-h-16 rounded-2xl bg-surface px-4 text-xl text-text"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-lg text-muted">Password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="min-h-16 rounded-2xl bg-surface px-4 text-xl text-text"
          />
        </label>
        <Button
          tier="primary"
          size="lg"
          className="w-full"
          disabled={busy !== null}
          onClick={() => void create()}
        >
          Create account
        </Button>
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-6">
        <h2 className="text-2xl font-semibold">Accounts</h2>
        {accounts === null ? <p className="text-muted">Loading the accounts …</p> : null}
        {accounts !== null && accounts.length === 0 ? (
          <p className="text-muted">No accounts yet. The one you signed in with is not listed.</p>
        ) : null}

        {(accounts ?? []).map((account) => {
          const expanded = open === account.userId;
          const draft = draftFor(account);
          return (
            <article
              key={account.userId}
              className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4"
            >
              <header className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col">
                  <h3 className="text-xl font-medium text-text">{labelOf(account)}</h3>
                  <p className="text-sm text-muted">
                    {account.isAdmin ? "Runs the beta" : "Reader"} · made {dayOf(account.createdAt)}{" "}
                    · last signed in {dayOf(account.lastSignInAt)}
                  </p>
                </div>
                <Button tier="secondary" size="sm" onClick={() => expand(account)}>
                  {expanded ? "Close" : "Open"}
                </Button>
              </header>

              {expanded ? (
                <div className="flex flex-col gap-4">
                  {FEATURE_FLAGS.map((flag) => (
                    <div key={flag} className="flex items-start justify-between gap-4">
                      <div className="flex flex-col">
                        <span className="text-base font-medium text-text">
                          {FEATURE_FLAG_INFO[flag].label}
                        </span>
                        <span className="text-sm text-muted">
                          {FEATURE_FLAG_INFO[flag].summary}
                        </span>
                      </div>
                      <LatchButton
                        size="sm"
                        labelHidden
                        label={FEATURE_FLAG_INFO[flag].label}
                        pressed={draft[flag]}
                        onChange={(next) => toggle(account, flag, next)}
                      />
                    </div>
                  ))}

                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      tier="primary"
                      size="sm"
                      disabled={!isDirty(account) || busy !== null}
                      onClick={() => void save(account)}
                    >
                      {busy === account.userId ? "Saving …" : "Save flags"}
                    </Button>
                    {isDirty(account) ? (
                      <span className="text-sm text-muted">Unsaved changes</span>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-3 border-t border-line pt-4">
                    <label className="flex flex-col gap-2">
                      <span className="text-lg text-muted">A new password</span>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={passwords[account.userId] ?? ""}
                        onChange={(event) =>
                          setPasswords((current) => ({
                            ...current,
                            [account.userId]: event.target.value,
                          }))
                        }
                        className="min-h-16 rounded-2xl bg-surface-raised px-4 text-xl text-text"
                      />
                    </label>
                    <Button
                      tier="destructive"
                      size="sm"
                      armed={armedPassword === account.userId}
                      disabled={busy !== null}
                      onClick={() => void resetPassword(account)}
                    >
                      Set a new password
                    </Button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>
    </main>
  );
}
