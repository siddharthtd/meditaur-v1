"use client";

import { app } from "@/composition";
import { errorText } from "@/lib/error-text";
import { DEFAULT_FEATURE_FLAGS, type AuthSession, type FeatureFlags } from "@meditaur/domain";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type SessionValue = {
  /** True once the first bootstrap and auth read have settled. */
  ready: boolean;
  userId: string | null;
  workspaceId: string | null;
  authSession: AuthSession | null;
  /**
   * The flags the app is gated by (`P0 · 23`) — complete, and the defaults while nothing
   * is signed in or before the first read has settled. A screen asks this for a surface
   * it draws; nothing else asks.
   */
  flags: FeatureFlags;
  /** Whether this account may reach the admin panel. Never a flag, and false by default. */
  isAdmin: boolean;
  error: string | null;
};

const EMPTY: SessionValue = {
  ready: false,
  userId: null,
  workspaceId: null,
  authSession: null,
  flags: DEFAULT_FEATURE_FLAGS,
  isAdmin: false,
  error: null,
};

const SessionContext = createContext<SessionValue>(EMPTY);

export function useSession(): SessionValue {
  return useContext(SessionContext);
}

/**
 * One bootstrap for the whole app. Every screen used to call `app.bootstrap()`
 * itself and cache the ids in local state; this resolves the workspace, the auth
 * session and the account's flags once, and re-resolves when the session changes
 * (sign-in, sign-out, expiry) so `userId` is the signed-in user when there is one,
 * the local workspace otherwise, and the flags are the account's own.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<SessionValue>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      try {
        const [context, authSession, account] = await Promise.all([
          app.bootstrap(),
          app.getAuthSession(),
          // Read alongside the session, and **never able to fail the start**: a flag read
          // that goes wrong leaves the app drawing what it drew before flags existed,
          // which is the same answer a device with no account gets. A cache miss, a
          // tunnel or a row nobody can parse must not be a screen the reader cannot pass.
          app.getFeatureFlags().catch(() => null),
        ]);
        if (cancelled) return;
        setValue({
          ready: true,
          userId: context.userId,
          workspaceId: context.workspaceId,
          authSession,
          flags: account?.flags ?? DEFAULT_FEATURE_FLAGS,
          isAdmin: account?.isAdmin ?? false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setValue((current) => ({
          ...current,
          ready: true,
          error: errorText(err, "Could not start a session"),
        }));
      }
    };

    void resolve();
    const stop = app.onAuthSessionChange(() => void resolve());

    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  /**
   * One sync run per signed-in identity (`P2 · 3`, slice 3).
   *
   * Keyed on *whether* there is a session rather than on the session itself, because
   * the auth provider calls back on a token refresh too and a device should not sync
   * again because its token aged — the run belongs to the identity, not to the read.
   * It fires on the transition: first load with a session, and the moment a reader
   * signs in, which is the moment this device's rows first belong to an account.
   *
   * Gated on a session and not on the build: a run with nobody signed in is a run the
   * cloud's own rules refuse, and on a build with no cloud pair the local auth adapter
   * answers `null`, so one guard covers "signed out" and "cannot sync at all".
   *
   * Never awaited, and `syncNow` never throws: the store is local-first, so a run is a
   * background correction to what is already on screen. A failure is not routed to the
   * event port either — `P2 · 2` reserves that port's first caller for `error.tsx`,
   * once its privacy decisions are made.
   */
  const signedIn = value.authSession !== null;
  useEffect(() => {
    if (!value.ready || !signedIn || value.workspaceId === null) return;
    void app.syncNow(value.workspaceId);
  }, [value.ready, signedIn, value.workspaceId]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
