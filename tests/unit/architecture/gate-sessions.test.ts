import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const scripts = join(repoRoot, "scripts");
const cleanRun = join(scripts, "clean-run.sh");
const session = join(scripts, "session.sh");

// The real scripts run against a fake `docker` that only records what it was asked to do,
// which is how these tests state the thing that was going wrong: one session's teardown
// reaching into another session's containers. Nothing here starts a container.
const FAKE_DOCKER = `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"
exit 0
`;

// One `sleep` per holder that has to look alive: a pid this test controls, unrelated to the
// scripts under test, so "another session holds the lock" is a real process rather than a
// number the test asserts against.
const holders: ChildProcess[] = [];
function liveHolder(): number {
  const child = spawn("sleep", ["60"], { stdio: "ignore" });
  holders.push(child);
  if (child.pid === undefined) throw new Error("could not start a holder process");
  return child.pid;
}

afterAll(() => {
  for (const child of holders) child.kill();
});

function setup(): { dir: string; lock: string; bin: string; log: string } {
  const dir = mkdtempSync(join(tmpdir(), "meditaur-gate-"));
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "docker"), FAKE_DOCKER, { mode: 0o755 });
  return { dir, lock: join(dir, "meditaur-prep.lock"), bin, log: join(dir, "docker.log") };
}

function hold(state: { lock: string }, pid: number, what: string): void {
  writeFileSync(state.lock, `${pid}\t${Math.floor(Date.now() / 1000)}\t${what}\n`);
}

function run(
  script: string,
  args: string[],
  state: { dir: string; bin: string; log: string },
  env: NodeJS.ProcessEnv = {},
): { code: number; out: string; calls: string[] } {
  const result = spawnSync("bash", [script, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PATH: `${state.bin}:${process.env.PATH ?? ""}`,
      // The lock lives in TMPDIR, so the test's own lock cannot disturb a gate that is
      // running this very suite (which is what `check:full` does).
      TMPDIR: state.dir,
      FAKE_DOCKER_LOG: state.log,
      CI: "",
      ...env,
    },
    encoding: "utf8",
  });
  let calls: string[];
  try {
    calls = readFileSync(state.log, "utf8").split("\n").filter(Boolean);
  } catch {
    calls = [];
  }
  return { code: result.status ?? -1, out: `${result.stdout}${result.stderr}`, calls };
}

describe("session names", () => {
  // Every caller runs this file directly (`"${ROOT}/scripts/session.sh" hold`), so a missing
  // exec bit does not fail loudly: `set -e` kills the caller at the assignment and the
  // teardown silently never happens. Which is exactly how this test came to exist.
  it("is executable, because its callers invoke it directly", () => {
    const mode = statSync(session).mode;
    expect(mode & 0o111, "session.sh must be executable").not.toBe(0);
  });

  it("keeps the names it has always had when no session is named", () => {
    const state = setup();
    expect(run(session, ["project"], state, { MEDITAUR_SESSION: "" }).out.trim()).toBe("meditaur-e2e");
    expect(run(session, ["image"], state, { MEDITAUR_SESSION: "" }).out.trim()).toBe("meditaur-e2e:local");
  });

  it("gives a named session its own project and its own image tag", () => {
    const state = setup();
    const env = { MEDITAUR_SESSION: "alpha" };
    expect(run(session, ["project"], state, env).out.trim()).toBe("meditaur-e2e-alpha");
    expect(run(session, ["image"], state, env).out.trim()).toBe("meditaur-e2e:alpha");
  });

  it("takes the image tag from the session in the compose file too", () => {
    const compose = readFileSync(join(repoRoot, "infra", "compose.e2e.yaml"), "utf8");
    expect(compose).toContain("image: ${MEDITAUR_E2E_IMAGE:-meditaur-e2e:local}");
  });
});

describe("the teardown", () => {
  it("stops only this session's e2e project, and the two machine-wide ones", () => {
    const state = setup();
    const result = run(cleanRun, ["--keep-next"], state, { MEDITAUR_SESSION: "alpha" });
    expect(result.code).toBe(0);
    expect(result.calls.filter((call) => call.includes("meditaur-e2e-alpha"))).toHaveLength(1);
    expect(result.calls.filter((call) => call.includes("down --remove-orphans"))).toHaveLength(3);
  });

  // This is the case that cost round 24 its e2e reading: one session's gate tearing down the
  // other session's running containers, which surfaced as `Protocol error … session closed`
  // and a mass of 15-second timeouts.
  it("does nothing at all while another session holds the lock", () => {
    const state = setup();
    hold(state, liveHolder(), "the gate");
    const result = run(cleanRun, ["--keep-next"], state);
    expect(result.calls).toEqual([]);
    expect(result.out).toContain("leaving its containers alone");
  });

  it("tears down when the lock is this gate's own", () => {
    const state = setup();
    hold(state, liveHolder(), "the gate");
    const result = run(cleanRun, ["--keep-next"], state, { MEDITAUR_PREP_LOCK_HELD: "1" });
    expect(result.calls.filter((call) => call.includes("down --remove-orphans"))).toHaveLength(3);
  });

  it("takes the lock itself when it is free, and leaves it free", () => {
    const state = setup();
    const result = run(cleanRun, ["--keep-next"], state);
    expect(result.calls.filter((call) => call.includes("down --remove-orphans"))).toHaveLength(3);
    expect(readFileSync(state.lock, "utf8").trim()).toBe("");
  });
});

describe("the lock", () => {
  it("refuses while another live session holds it, and names the holder and the way out", () => {
    const state = setup();
    const pid = liveHolder();
    hold(state, pid, "the gate");
    const result = run(session, ["hold", "the gate"], state);
    expect(result.code).toBe(1);
    expect(result.out).toContain(`pid ${pid}`);
    expect(result.out).toMatch(/e2e tests\/e2e\//);
    // The refusal must not take the lock away from the session that holds it.
    expect(readFileSync(state.lock, "utf8")).toContain(`${pid}\t`);
  });

  it("takes over a lock left behind by a gate that was killed", () => {
    const state = setup();
    hold(state, 999999, "the gate");
    const result = run(session, ["hold", "the gate"], state);
    expect(result.code).toBe(0);
    expect(readFileSync(state.lock, "utf8")).not.toContain("999999");
  });

  it("does not clear a lock another session holds", () => {
    const state = setup();
    const pid = liveHolder();
    hold(state, pid, "the gate");
    const result = run(session, ["release"], state);
    expect(result.code).toBe(0);
    expect(readFileSync(state.lock, "utf8")).toContain(`${pid}\t`);
  });

  it("does not lock at all on a CI runner, where one job is one session", () => {
    const state = setup();
    hold(state, liveHolder(), "the gate");
    const result = run(session, ["hold", "the gate"], state, { CI: "true" });
    expect(result.code).toBe(0);
    expect(result.out).toBe("");
  });
});

describe("one gate at a time, and the cheap way past it", () => {
  const gate = readFileSync(join(scripts, "meditaur"), "utf8");
  const e2e = readFileSync(join(scripts, "e2e.sh"), "utf8");

  it("holds the lock around the whole of check:full", () => {
    const arm = gate.slice(gate.indexOf("  check:full)"), gate.indexOf("\n  test | test:unit)"));
    const held = arm.indexOf('session.sh" hold "the gate"');
    expect(held, "check:full must take the lock").toBeGreaterThan(-1);
    // Everything destructive runs inside the window the lock opens.
    const firstStage = arm.indexOf('stage "');
    expect(firstStage, "the stages must be inside the lock window").toBeGreaterThan(held);
    for (const step of ["clean-run.sh", "local-up.sh", "e2e.sh"]) {
      expect(arm.indexOf(step), step).toBeGreaterThan(held);
    }
    // And the release belongs to the exit trap, not to the last line of the arm: a stage
    // that fails must release the lock too. Only a gate killed outright leaves a stale
    // file, and a stale file holds a dead pid, which the next session takes over.
    const trap = arm.indexOf("trap finish EXIT");
    expect(trap).toBeGreaterThan(held);
    expect(arm.slice(arm.indexOf("finish() {"), trap)).toContain('session.sh" release');
  });

  // A refusal that blocks the one cheap reading would be worse than the problem: a single
  // spec run is how an agent makes progress while another session's gate is going.
  it("keeps the single-spec run usable while a gate is running", () => {
    expect(e2e).toContain('session.sh" warn-if-other');
    expect(e2e).not.toMatch(/session\.sh" hold/);
  });

  it("passes a spec or a filter through to Playwright, after building what it serves", () => {
    const arm = gate.slice(gate.indexOf("  e2e | test:e2e)"), gate.indexOf("\n  build)"));
    expect(arm).toContain('e2e.sh" "$@"');
    // The suite is served a production build, so the build happens in the run container and
    // the caller's spec or filter lands after it.
    expect(e2e).toContain('pnpm build && pnpm test:e2e "$@"');
    expect(e2e).toContain('e2e "$@"');
  });
});

describe("the suite's server", () => {
  const config = readFileSync(join(repoRoot, "tests", "e2e", "playwright.config.ts"), "utf8");

  // The switch itself (`P4 · 17`): a production server is what the deploy runs, and it is
  // what removes the class both red rounds were made of — a cold `next dev` compiling routes
  // under six workers, read as 30-second navigations and one crashed page.
  it("serves a production build, and never next dev", () => {
    expect(config).toContain('command: "pnpm exec next start --port 3000"');
    expect(config).not.toContain("next dev --port");
  });

  it("takes no retries, blocks the service worker and traces only a failure", () => {
    // A retry turns `failed then passed` into a `flaky` line, which reads as green.
    expect(config).toContain("retries: 0");
    expect(config).not.toContain("retries: process.env.CI");
    // A production build registers the app-shell worker; a run must read the server.
    expect(config).toContain('serviceWorkers: "block"');
    expect(config).toContain('trace: "retain-on-failure"');
  });
});
