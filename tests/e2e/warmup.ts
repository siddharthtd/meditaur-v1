import { chromium } from "@playwright/test";

/**
 * The e2e web server is `next dev`, and the e2e image ships no `.next`
 * (`infra/Dockerfile.e2e.dockerignore`), so every route is compiled on the first
 * request of every run — inside whichever test arrives first, with three workers
 * arriving at once.
 *
 * That cost was being read as a slow app. `plans.spec.ts`'s Display test starts
 * two sessions across three navigations, and CI failed it on both attempts with
 * `Start` not yet rendered: the compile of the route it lives on was sitting
 * inside its own budget. Visiting each route here — before the first worker
 * starts — moves the compiles out of the tests, where a slow compile cannot be
 * mistaken for a failing screen.
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
  "/settings",
  "/account",
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
