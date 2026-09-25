/**
 * What the run container mounts, and what `clean-run.sh` touches inside it.
 *
 * `scripts/clean-run.sh` runs **inside the e2e container** as `pretest:e2e`
 * (`apps/web/package.json`), where `ROOT` is `/app`. It clears the run's report and build
 * directories. `infra/compose.e2e.yaml` mounts host directories into that same container —
 * which is the reason a failure's trace and `error-context.md` outlive `docker compose run
 * --rm`.
 *
 * Those two facts are incompatible in one case, and CI found it: a **bind mount cannot be
 * removed from inside the container**. On 2026-09-25 the mounts sat at
 * `/app/tests/e2e/test-results` and `/app/tests/e2e/playwright-report`, the sweep's delete
 * of them failed with "Device or resource busy", and because the script runs under
 * `set -e`, pnpm reported `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` for `pretest:e2e`. The job
 * died forty seconds in; Playwright never started (run 36078531241).
 *
 * It is invisible on a Mac: Docker Desktop does not present a bind mount the way a Linux
 * daemon does, so the same command succeeded locally, in the same image, and `check:full`
 * was green while CI was red. The rule is therefore a **source fact**, checked here rather
 * than hoped for at runtime: no directory the run container mounts may be a directory the
 * sweep touches. A mount outside the swept paths passes — `infra/compose.e2e.yaml` keeps
 * the run's artifacts outside them on purpose — and a mount under one of them fails here,
 * on the edit loop, instead of in CI before the first test.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const cleanRun = readFileSync(join(repoRoot, "scripts", "clean-run.sh"), "utf8");
const compose = readFileSync(join(repoRoot, "infra", "compose.e2e.yaml"), "utf8");

/**
 * Every path the sweep names, as `ROOT`-relative.
 *
 * Read off the sweep's own argument lines — one quoted `${ROOT}/…` per line — rather than
 * from every `${ROOT}` in the file, because the same script also invokes its neighbours.
 * A sweep that stops being written that way trips the count assertion below, which is the
 * loud failure: an extractor that silently matches nothing would make the rule vacuous.
 */
function sweptPaths(script: string): string[] {
  return script
    .split("\n")
    .filter((line) => /^\s*"\$\{ROOT\}\/[\w./-]+"\s*\\?$/.test(line))
    .map((line) => line.match(/\$\{ROOT\}\/([\w./-]+)"/)?.[1] ?? "");
}

/** Every container path the compose file mounts, as the container sees it. */
function mountedPaths(file: string): string[] {
  return [...file.matchAll(/^\s*-\s+\.\.\/[^:\s]+:(\S+)\s*$/gm)].map((match) => match[1]);
}

/** `mount` is the same directory as `path`, or inside it. */
function covers(path: string, mount: string): boolean {
  return mount === path || mount.startsWith(`${path}/`);
}

/** The mounts that land on something the sweep touches, inside the container. */
function clashes(swept: string[], file: string): string[] {
  return mountedPaths(file).filter((mount) => swept.some((path) => covers(path, mount)));
}

describe("the e2e run container's mounts", () => {
  it("reads a non-empty list on both sides, or it would prove nothing", () => {
    expect(sweptPaths(cleanRun).length, "the sweep's paths").toBeGreaterThanOrEqual(8);
    expect(mountedPaths(compose).length, "the compose mounts").toBeGreaterThanOrEqual(2);
  });

  it("mounts nothing the sweep touches inside the container, before Playwright starts", () => {
    // `ROOT` is `/app` in the run container, and a mount under the repo lands below it.
    const swept = sweptPaths(cleanRun).map((path) => `/app/${path}`);
    const found = clashes(swept, compose);
    expect(found, `mounted over a swept path: ${found.join(", ")}`).toEqual([]);
  });

  // The exact layout CI died on, kept as a fixture **because the live files no longer hold
  // it**: without this case the assertion above could rot into a rule nothing can fail.
  it("would have failed on the layout CI died on", () => {
    const broken = [
      "    volumes:",
      "      - ../tests/e2e/test-results:/app/tests/e2e/test-results",
      "      - ../tests/e2e/playwright-report:/app/tests/e2e/playwright-report",
    ].join("\n");
    const swept = sweptPaths(cleanRun).map((path) => `/app/${path}`);
    expect(clashes(swept, broken)).toEqual([
      "/app/tests/e2e/test-results",
      "/app/tests/e2e/playwright-report",
    ]);
  });
});
