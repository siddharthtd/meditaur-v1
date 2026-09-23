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
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // `next dev` compiles a route on first hit, and a cold container needs more
  // than the 5s default. `warmup.ts` moves the compiles out of the tests, so
  // this budget is for a screen a worker has just compiled for itself.
  expect: { timeout: 15_000 },
  // The suite is bound by the one `next dev` server, not by the assertions: the
  // same 66 tests are 696s of test time, and 3 workers spend 5m41s on them while
  // 6 spend 3m11s (both measured, clean, on a 12-core machine). Half the cores
  // keeps the server fed without stampeding it — 6 here, 3 on a 4-vCPU CI
  // runner, which is where CI already was. `PLAYWRIGHT_WORKERS` overrides it, and
  // an **empty** value counts as unset: `compose.e2e.yaml` forwards the variable,
  // so a host that has not set it hands over `""`, and `Number("")` is 0.
  workers: workerOverride() ?? Math.min(6, Math.max(3, Math.round(os.availableParallelism() / 2))),
  // The routes are compiled once up front, serially, rather than by whichever
  // test reaches them first — see `warmup.ts` for what that was costing.
  globalSetup: "./warmup.ts",
  use: {
    baseURL: E2E_BASE_URL,
    trace: "on-first-retry",
    navigationTimeout: 30_000,
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "pnpm exec next dev --port 3000",
        cwd: webRoot,
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
