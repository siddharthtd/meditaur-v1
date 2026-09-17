import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const repoRoot = path.join(fileURLToPath(new URL(".", import.meta.url)), "../..");
const webRoot = path.join(repoRoot, "apps/web");

export default defineConfig({
  testDir: ".",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // `next dev` compiles a route on first hit, and a cold container needs more
  // than the 5s default. Keep workers low so one dev server is not stampeded.
  expect: { timeout: 15_000 },
  workers: process.env.CI ? 3 : undefined,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
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
