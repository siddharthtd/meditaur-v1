import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

import { E2E_BASE_URL } from "./warmup";

const repoRoot = path.join(fileURLToPath(new URL(".", import.meta.url)), "../..");
const webRoot = path.join(repoRoot, "apps/web");

/**
 * How many workers the caller asked for, or `null` for "you decide".
 *
 * An empty or blank value is not a number and not an instruction, so it counts as
 * unset. That matters because `compose.e2e.yaml` forwards `PLAYWRIGHT_WORKERS` to
 * the container: a host that has not set it forwards `""`, and `Number("")` is `0`,
 * which is a suite that runs nothing.
 */
function workerOverride(): number | null {
  const raw = process.env.PLAYWRIGHT_WORKERS?.trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export default defineConfig({
  testDir: ".",
  // Where a failed run's trace and `error-context.md` are written. The default (`test-results`
  // beside this file) is inside the run container, which `docker compose run --rm` removes —
  // with the evidence in it. `compose.e2e.yaml` points this at a mounted directory instead,
  // and deliberately at one outside every path the run sweeps: a bind-mounted directory
  // cannot be removed at all, so a mount point under a swept path fails the stage before its
  // first test.
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? "./test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // **No retries, deliberately.** The suite is the definition of done, and a retry hides the
  // class this change is about: round 24's gate printed `3 failed / 9 flaky / 89 passed`, and
  // a `flaky` line is a test that failed and then passed, which reads as green. A red run
  // that is really an environment reading is fixed at the machine (its load, another
  // session's gate), not papered over with a second attempt.
  retries: 0,
  expect: { timeout: 15_000 },
  // **Three workers, measured 2026-09-24.** With the production build the suite is 100 passed / 1
  // failed in 2.1m at three workers, and 94 passed / **7 failed** at six: six of those seven
  // failed on contention and pass in the same image at three (one of them passes alone), which
  // is a gate that lies about the app. Both readings were on a shared 12-core host — the
  // machine this repo is worked on — and three was also the shorter run, because a failure
  // costs 15 seconds of `expect` timeout each. The old number (6 here, 3 on a 4-vCPU CI runner)
  // was measured against `next dev`, which the server below no longer runs, so it is retired
  // rather than contradicted. Raise it deliberately, with `PLAYWRIGHT_WORKERS`, only on a
  // machine that is not also building something else — and only against a green reading.
  // An **empty** value counts as unset: `compose.e2e.yaml` forwards the variable, so a host
  // that has not set it hands over `""`, and `Number("")` is 0.
  workers: workerOverride() ?? Math.min(3, Math.max(1, Math.round(os.availableParallelism() / 2))),
  // Every route is visited once before any worker starts. It used to be there to move `next
  // dev`'s compiles out of the tests; with the production build below there is nothing to
  // compile, so what is left is that a route which does not answer is found here rather than
  // inside whichever worker reached it first. **It is no longer a requirement** — a new route
  // does not have to be added to `warmup.ts` to work (item 17).
  globalSetup: "./warmup.ts",
  use: {
    baseURL: E2E_BASE_URL,
    // The app ships a service worker (`apps/web/public/sw.js`) and a production build
    // registers it. Inside a test run it is yesterday's HTML sitting between the browser and
    // the server, which fails as a stale screen that no assertion explains.
    serviceWorkers: "block",
    // The trace of the failure, not of the attempt before it.
    trace: "retain-on-failure",
    navigationTimeout: 30_000,
  },
  // `next start` on a build `scripts/e2e.sh` makes **in this same container**, immediately
  // before Playwright starts. The production build is what the deploy runs, and it is what
  // removes the cost the two red rounds were made of: round 24's gate and round 25's subset
  // re-run were a cold `next dev` compiling routes under six workers, read as
  // `page.goto: Timeout 30000ms exceeded` and one `Page crashed`.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "pnpm exec next start --port 3000",
        cwd: webRoot,
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
