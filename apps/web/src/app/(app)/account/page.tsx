"use client";

import { app } from "@/composition";
import { errorText } from "@/lib/error-text";
import type { AuthSession } from "@meditaur/domain";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AccountPage() {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
      {error ? <p className="text-lg text-destructive">{error}</p> : null}
    </main>
  );
}
