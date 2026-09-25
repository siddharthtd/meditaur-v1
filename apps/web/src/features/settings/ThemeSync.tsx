"use client";

import { app } from "@/composition";
import { useSession } from "@/features/auth/SessionProvider";
import { applyTheme } from "@/lib/theme";
import { DEFAULT_THEME } from "@meditaur/domain";
import { useEffect } from "react";

/**
 * Paints the reader's last colour scheme, once, on every load.
 *
 * The sibling of `TextSizeSync`, and the same bargain: the preference lives in Dexie, the
 * boot script paints the last one from `localStorage` before hydration, and this reconciles
 * the two afterwards — so a scheme changed on another device (through sync) or a first load
 * with an empty mirror both land on the stored value.
 *
 * A failed read leaves whatever the mirror painted, and a row with no scheme paints the
 * app's own: neither is worth an error on a screen that is only a colour.
 */
export function ThemeSync() {
  const { ready, userId } = useSession();

  useEffect(() => {
    if (!ready || !userId) return;
    void (async () => {
      try {
        const prefs = await app.getPreferences(userId);
        applyTheme(prefs?.theme ?? DEFAULT_THEME);
      } catch {
        // Cosmetic: a failed read must not break the app shell.
      }
    })();
  }, [ready, userId]);
  return null;
}
