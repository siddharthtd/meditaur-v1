import { chromium } from "@playwright/test";

/**
 * The e2e web server is a **production build** (`next start`, item 17), so nothing is
 * compiled during a run and this is no longer a requirement for a new route: what is left of
 * it is that every route is visited once before any worker starts, so a route that does not
 * answer is found here rather than inside whichever worker reached it first.
 *
 * It used to carry the whole cost of `next dev`: the image ships no `.next`, so every route
 * was compiled on the first request of every run — inside whichever test arrived first, with
 * three workers arriving at once — and that was read as a slow app. `plans.spec.ts`'s Display
 * test starts two sessions across three navigations, and CI failed it on both attempts with
 * `Start` not yet rendered: the compile of the route it lives on was inside its own budget.
 *
 * A fixture, not a test: it asserts only that each route answers.
 */
export const E2E_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

/** Every route a spec visits, minus the two the suite visits *because* they 404. */
const ROUTES = [
  "/",
  "/plan",
  "/library",
  "/database",
  // A record's own page (the owner's round 22). It reads its kind and id from the
  // query string, and so does every spec that lands on one.
  "/record",
  "/settings",
  "/account",
  "/admin",
  "/tuner",
  "/login",
  "/signup",
  "/privacy",
  // A made-up instance id, the shape `run.spec.ts` uses for its own direct
  // visit: the screen reports that the session is no longer on this device,
  // which is all this needs — the route compiled.
  "/run/3f1c2b0a-0000-4000-8000-000000000000",
];

/**
 * The visits are **serial on purpose**, and that is measured rather than assumed.
 * Three pages at a time was tried on 2026-09-18: ten routes in series took
 * 38.9s, three at a time 43.9s — and the sum of the ten waits went 37.7s →
 * 124.9s, which is the tell. `next dev` compiles through one module graph, so a
 * second page does not compile alongside the first: it queues behind it, and
 * every page pays for the queue. A route added to `ROUTES` therefore costs its
 * own compile and nothing more.
 */
export default async function warmup(): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const route of ROUTES) {
      const response = await page.goto(`${E2E_BASE_URL}${route}`, {
        waitUntil: "load",
        timeout: 60_000,
      });
      if (!response?.ok()) {
        throw new Error(
          `warmup: ${route} answered ${response?.status() ?? "nothing"}`,
        );
      }
    }
  } finally {
    await browser.close();
  }
}
