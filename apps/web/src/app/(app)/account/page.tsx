"use client";

import { app } from "@/composition";
import { useArmedFlag } from "@/lib/armed";
import { errorText } from "@/lib/error-text";
import { TEXT_SIZE_STORAGE_KEY } from "@/lib/text-size";
import { getEngine } from "@/runtime";
import { sessionIsLive, type AuthSession } from "@meditaur/domain";
import { Button } from "@meditaur/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AccountPage() {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eraseError, setEraseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useArmedFlag();
  const [closeArmed, setCloseArmed] = useArmedFlag();
  const [closeError, setCloseError] = useState<string | null>(null);
  const configured = app.authIsConfigured();

  useEffect(() => {
    void (async () => {
      try {
        setSession(await app.getAuthSession());
      } catch (err) {
        setError(errorText(err, "Could not read the session"));
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const signOut = async () => {
    setError(null);
    setBusy(true);
    try {
      await app.signOut();
      setSession(null);
      router.push("/login");
    } catch (err) {
      setError(errorText(err, "Could not sign out"));
    } finally {
      setBusy(false);
    }
  };

  /**
   * The two things a wipe does not reach. The engine is a module singleton that
   * outlives the route it started on, so it is stopped before the store goes; and
   * the pre-paint text-size mirror is the app's rather than the store's, so it is
   * removed by hand. The rest of the browser state — a binaural draft, the
   * remembered library section — is swept by the code that owns it on the next
   * load.
   */
  const stopThisDevice = () => {
    const engine = getEngine();
    if (sessionIsLive(engine.getSnapshot().status)) engine.stop();
    try {
      window.localStorage.removeItem(TEXT_SIZE_STORAGE_KEY);
    } catch {
      /* a blocked store is not a failed wipe */
    }
  };

  /**
   * Erasing the device, which is not the same act as signing out.
   *
   * Two presses, like every other destructive control: the first fills the
   * button and the second does it. The engine is stopped first because it is a
   * module singleton that keeps running across routes — a session started on
   * `/run` is still live here, and it must not be left writing into a store that
   * is about to be dropped.
   */
  const erase = async () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setEraseError(null);
    setBusy(true);
    try {
      stopThisDevice();
      await app.wipeLocalData();
      setArmed(false);
      router.push("/");
      router.refresh();
    } catch (err) {
      setArmed(false);
      setEraseError(errorText(err, "Could not erase this device's data"));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Closing the account is the bigger of the two erasures, and the app owns the
   * order (server, then session, then this device). Here it is the same two
   * presses as erasing, because it is the same kind of act: irreversible, and
   * named before it happens.
   */
  const close = async () => {
    if (!closeArmed) {
      setCloseArmed(true);
      return;
    }
    setCloseError(null);
    setBusy(true);
    try {
      stopThisDevice();
      await app.closeAccount();
      setCloseArmed(false);
      setSession(null);
      // The device is first-run from here: the next load re-seeds the catalogue
      // and nobody is signed in.
      router.push("/");
      router.refresh();
    } catch (err) {
      setCloseArmed(false);
      setCloseError(errorText(err, "Could not close the account"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold">Account</h1>
      <p className="text-muted">
        {!ready
          ? "Checking the session…"
          : session
            ? `Signed in as ${session.userId}.`
            : "Local workspace is active on this device. Cloud login is available when Supabase is configured."}
      </p>
      {session ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void signOut()}
          className="min-h-14 rounded-2xl bg-surface text-lg disabled:opacity-60"
        >
          Sign out
        </button>
      ) : (
        <>
          <Link
            href="/login"
            className="flex min-h-14 items-center justify-center rounded-2xl bg-surface text-lg"
          >
            {configured ? "Sign in" : "Login"}
          </Link>
          {configured ? (
            <Link
              href="/signup"
              className="flex min-h-14 items-center justify-center rounded-2xl border border-line text-lg text-text"
            >
              Create an account
            </Link>
          ) : null}
        </>
      )}
      {app.accountIsConfigured() ? (
        <section className="flex flex-col gap-3 border-t border-line pt-6">
          <h2 className="text-2xl font-semibold">Close this account</h2>
          <p className="text-muted">
            This removes the account itself — the address it signs in with, and
            the settings that follow you between devices — along with everything
            the app holds for you, in the cloud and on this device. The device is
            erased with it, so you come back to a first-run app with the default
            catalogue and nothing of your own.
          </p>
          <p className="text-muted">
            It cannot be undone, and there is no copy: download the catalog from
            the Library first if you want to keep any of your material.
          </p>
          <Button
            tier="destructive"
            size="lg"
            className="w-full"
            armed={closeArmed}
            disabled={busy}
            onClick={() => void close()}
          >
            {closeArmed ? "Close the account and erase this device?" : "Close my account"}
          </Button>
          {closeError ? <p className="text-lg text-destructive">{closeError}</p> : null}
        </section>
      ) : null}
      <section className="flex flex-col gap-3 border-t border-line pt-6">
        <h2 className="text-2xl font-semibold">This device</h2>
        <p className="text-muted">
          Everything stored here: meditations, symbols, intentions, plans,
          uploaded sounds, and your session history. Erasing it starts again from
          the default catalogue. It is not a backup — download the catalog from
          the Library first if you want to keep any of it.
        </p>
        <p className="text-muted">
          Your account is not touched. Signing out and erasing are different
          things, and this is the second one.
        </p>
        <Button
          tier="destructive"
          size="lg"
          className="w-full"
          armed={armed}
          disabled={busy}
          onClick={() => void erase()}
        >
          {armed ? "Erase everything on this device?" : "Erase this device's data"}
        </Button>
        {eraseError ? <p className="text-lg text-destructive">{eraseError}</p> : null}
      </section>
      {error ? <p className="text-lg text-destructive">{error}</p> : null}
    </main>
  );
}
