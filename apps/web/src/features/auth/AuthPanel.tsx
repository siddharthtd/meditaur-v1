"use client";

import { app } from "@/composition";
import { useSession } from "@/features/auth/SessionProvider";
import { errorText } from "@/lib/error-text";
import { Button } from "@meditaur/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export type AuthMode = "signIn" | "signUp";

/**
 * One panel, two modes. The fields, the busy state and the outcome handling are
 * the same shape; only the verb, the autocomplete hint, and where the reader
 * goes next differ — so they live in one place instead of two screens that drift.
 */
const COPY = {
  signIn: {
    submit: "Sign in",
    busy: "Signing in",
    failed: "Could not sign in",
    other: { href: "/signup", label: "Create an account" },
  },
  signUp: {
    submit: "Create account",
    busy: "Creating your account",
    failed: "Could not create the account",
    other: { href: "/login", label: "I already have an account" },
  },
} as const;

const LINK_CLASS =
  "inline-flex h-14 w-full items-center justify-center rounded-2xl border border-line px-6 text-lg text-text";

/**
 * Sign-in and sign-up for the web app. Both go through `MeditaurApp`, which owns
 * validation and adoption, so nothing here talks to the provider directly.
 *
 * The signing-in state after sign-up is a real branch, not a detail: with
 * `Confirm email` on, Supabase creates the user and returns no session, and the
 * reader has to follow the link before they can sign in. The panel says so
 * instead of leaving them in front of a form that silently did nothing.
 */
export function AuthPanel({ mode }: { mode: AuthMode }) {
  const { flags } = useSession();
  const router = useRouter();
  const copy = COPY[mode];
  const configured = app.authIsConfigured();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    // A real form, so Enter submits and a password manager recognises it.
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signUp") {
        const outcome = await app.signUp(email, password);
        if (outcome.status === "confirmationRequired") {
          setConfirming(email.trim());
          return;
        }
      } else {
        await app.signIn(email, password);
      }
      router.push("/plan");
    } catch (err) {
      setError(errorText(err, copy.failed));
    } finally {
      setBusy(false);
    }
  };

  if (!flags.account_management) {
    // The flag hides the app's own account surfaces (`P0 · 35`, slice 35f). This panel is
    // the whole of sign-in and sign-up, and both routes draw it — so the sentence covers
    // the addresses as well as the links that no longer point here, and it says what to do
    // instead, which is what makes a stale link into a dead end rather than a dead end.
    // The owner's model: the account is theirs to manage, and the reader asks them.
    return (
      <p className="text-lg text-muted">
        Signing in and creating an account are managed for you — ask whoever set up your
        account.
      </p>
    );
  }

  if (!configured) {
    // Local-first. With no cloud config there is nothing to sign in to and no
    // account to create, so the only action is the one that always worked.
    return (
      <div className="flex flex-col gap-4">
        <p className="text-lg text-muted">
          Cloud auth is not configured. Continue locally; data stays in this browser.
        </p>
        <Button size="lg" className="w-full" onClick={() => router.push("/plan")}>
          Continue locally
        </Button>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-lg text-muted">
          Check {confirming} for the link that confirms the address. The account is
          ready the moment you follow it — then sign in.
        </p>
        <Link href="/login" className={LINK_CLASS}>
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
      {mode === "signUp" ? (
        <p className="text-lg text-muted">
          An account carries your Settings — volumes, text size and the rest —
          between the devices you sign in on. Everything else still lives in this
          browser. <Link href="/privacy" className="underline">What that means</Link>
        </p>
      ) : null}
      <label className="flex flex-col gap-2">
        <span className="text-lg text-muted">Email</span>
        <input
          aria-label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="min-h-16 rounded-2xl bg-surface px-4 text-xl text-text"
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-lg text-muted">Password</span>
        <input
          aria-label="Password"
          type="password"
          autoComplete={mode === "signUp" ? "new-password" : "current-password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="min-h-16 rounded-2xl bg-surface px-4 text-xl text-text"
        />
      </label>
      {mode === "signIn" ? (
        // The owner's answer to password recovery (`DECISIONS.md` §11): by hand, so the
        // app sends no mail and needs no mailer. The sentence is the whole recovery flow —
        // there is no form, no route and no link, because the owner sets the new password
        // from the panel and hands it over.
        <p className="text-lg text-muted">
          Forgotten your password? Ask whoever set up your account — they can set a new one
          for you.
        </p>
      ) : null}
      <Button tier="primary" size="lg" type="submit" className="w-full" disabled={busy}>
        {busy ? copy.busy : copy.submit}
      </Button>
      {error ? <p className="text-lg text-destructive">{error}</p> : null}
      <Link href={copy.other.href} className={LINK_CLASS}>
        {copy.other.label}
      </Link>
      <Button size="lg" type="button" className="w-full" onClick={() => router.push("/plan")}>
        Continue locally
      </Button>
    </form>
  );
}
