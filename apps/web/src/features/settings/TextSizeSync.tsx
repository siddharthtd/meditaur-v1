"use client";

import { app } from "@/composition";
import { useSession } from "@/features/auth/SessionProvider";
import { applyTextSize } from "@/lib/text-size";
import { useEffect } from "react";

export function TextSizeSync() {
  const { ready, userId } = useSession();

  useEffect(() => {
    if (!ready || !userId) return;
    void (async () => {
      try {
        const prefs = await app.getPreferences(userId);
        applyTextSize(prefs?.textSize ?? "lg");
      } catch {
        // Cosmetic: a failed read must not break the app shell.
      }
    })();
  }, [ready, userId]);
  return null;
}
