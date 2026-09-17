"use client";

import { app } from "@/composition";
import { errorText } from "@/lib/error-text";
import type { AuthSession } from "@meditaur/domain";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type SessionValue = {
  /** True once the first bootstrap and auth read have settled. */
  ready: boolean;
  userId: string | null;
  workspaceId: string | null;
  authSession: AuthSession | null;
  error: string | null;
};

const EMPTY: SessionValue = {
  ready: false,
  userId: null,
  workspaceId: null,
  authSession: null,
  error: null,
};

const SessionContext = createContext<SessionValue>(EMPTY);

export function useSession(): SessionValue {
  return useContext(SessionContext);
}

/**
 * One bootstrap for the whole app. Every screen used to call `app.bootstrap()`
 * itself and cache the ids in local state; this resolves the workspace and the
 * auth session once and re-resolves when the session changes (sign-in, sign-out,
 * expiry), so `userId` is the signed-in user when there is one and the local
 * workspace otherwise.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<SessionValue>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      try {
        const [context, authSession] = await Promise.all([
          app.bootstrap(),
          app.getAuthSession(),
        ]);
        if (cancelled) return;
        setValue({
          ready: true,
          userId: context.userId,
          workspaceId: context.workspaceId,
          authSession,
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

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
