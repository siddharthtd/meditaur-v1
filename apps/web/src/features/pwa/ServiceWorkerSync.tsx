"use client";

import { useEffect } from "react";

/**
 * Registers the app-shell worker (`public/sw.js`), and only in production.
 *
 * Not in development, deliberately: a worker that caches the shell while
 * `next dev` is still rewriting it is how somebody ends up debugging a page the
 * browser is serving from a cache that no longer matches the code on disk. The
 * e2e suite boots `next dev`, so it would meet exactly that stale shell — which
 * is why this registration being production-only is also why no Playwright test
 * can cover the worker. It is verified against `./scripts/meditaur preview`,
 * and that is written down in the roadmap rather than left implied.
 */
export function ServiceWorkerSync() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* an installed app with no offline is still an app */
    });
  }, []);
  return null;
}
