"use client";

import { useEffect } from "react";

/**
 * Registers the app-shell worker (`public/sw.js`), and only in production.
 *
 * Not in development, deliberately: a worker that caches the shell while
 * `next dev` is still rewriting it is how somebody ends up debugging a page the
 * browser is serving from a cache that no longer matches the code on disk.
 * **Since item 17 the e2e suite runs a production build**, so this does register
 * during a run — and the suite blocks service workers (`serviceWorkers: "block"`
 * in `playwright.config.ts`) rather than let a run read the previous run's HTML.
 * Covering the worker itself stays `./scripts/meditaur preview`'s job, and that is
 * written down in the roadmap rather than left implied.
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
