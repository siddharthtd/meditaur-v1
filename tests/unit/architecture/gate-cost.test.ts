import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const scripts = join(repoRoot, "scripts");
const cost = join(scripts, "cost.sh");
const gate = readFileSync(join(scripts, "meditaur"), "utf8");

// The report exists because a reading is only worth the machine it was taken on (`P4 · 57`):
// two rounds read a red e2e stage as an app reading when it was a loaded host. The machine
// is described with its two numbers as arguments, so these tests can pin the case they are
// about instead of depending on how busy the runner happens to be.
function machine(cores?: string, load?: string): string {
  const result = spawnSync(
    "bash",
    [cost, "machine", ...(cores === undefined ? [] : [cores, load ?? ""])],
    { encoding: "utf8" },
  );
  return `${result.stdout}${result.stderr}`;
}

function withState<T>(fn: (dir: string) => T): T {
  return fn(mkdtempSync(join(tmpdir(), "meditaur-cost-")));
}

function run(args: string[], dir: string, stdin?: string) {
  const result = spawnSync("bash", [cost, ...args], {
    input: stdin,
    env: { ...process.env, TMPDIR: dir },
    encoding: "utf8",
  });
  return { code: result.status ?? -1, out: `${result.stdout}${result.stderr}` };
}

describe("the machine a gate is about to take", () => {
  it("says the cores and the load average", () => {
    const line = machine("12", "1.25");
    expect(line).toContain("12 cores");
    expect(line).toContain("load average 1.25");
  });

  it("reads the real machine when it is not told which one", () => {
    const line = machine();
    expect(line).toMatch(/\d+ cores/);
    expect(line).toMatch(/load average [\d.?]+/);
  });

  // Over half the cores is the point where a stage's seconds stop being about the app, and
  // it is the case both red rounds were in.
  it("warns once the load average is above half the cores", () => {
    const busy = machine("12", "7.5");
    expect(busy).toContain("more than half the cores");
    // The way out has to be in the same breath, or the warning is only news.
    expect(busy).toMatch(/meditaur e2e <spec>/);
  });

  it("stays quiet at half the cores and below", () => {
    for (const load of ["0", "3.0", "6"]) {
      expect(machine("12", load), load).not.toContain("more than half");
    }
  });

  it("says so when the load average cannot be read", () => {
    const unknown = machine("12", "?");
    expect(unknown).toContain("could not be read");
    expect(unknown).not.toContain("more than half");
  });
});

describe("what the previous run cost", () => {
  it("records the stages and the machine they were measured on", () => {
    withState((dir) => {
      const saved = run(["save"], dir, "prepare 12\ncheck 152\ne2e 216\n");
      expect(saved.code).toBe(0);
      const shown = run(["show"], dir);
      expect(shown.out).toContain("the previous gate run");
      expect(shown.out).toContain("prepare 12");
      expect(shown.out).toContain("check 152");
      expect(shown.out).toContain("e2e 216");
      expect(shown.out).toMatch(/\d{4}-\d{2}-\d{2}T/);
      expect(shown.out).toMatch(/\d+ cores, load average/);
    });
  });

  it("says there is nothing to compare with on a machine that has not run a gate", () => {
    withState((dir) => {
      expect(run(["show"], dir).out).toContain("no previous gate run recorded");
    });
  });

  it("records nothing rather than an empty report when no stage ran", () => {
    withState((dir) => {
      expect(run(["save"], dir, "").code).toBe(0);
      expect(run(["show"], dir).out).toContain("no previous gate run recorded");
    });
  });
});

describe("the gate's own report", () => {
  const arm = gate.slice(gate.indexOf("  check:full)"), gate.indexOf("\n  test | test:unit)"));

  it("describes the machine and the previous run before the first stage", () => {
    const described = arm.indexOf('cost.sh" machine');
    const previous = arm.indexOf('cost.sh" show');
    const first = arm.indexOf('stage "');
    expect(described, "the gate must describe the machine").toBeGreaterThan(-1);
    expect(previous).toBeGreaterThan(described);
    expect(first, "a stage must follow the report").toBeGreaterThan(previous);
  });

  it("times every stage, and says what each one cost", () => {
    // Named, so a stage that stops being timed is a failing test rather than a quieter report.
    for (const label of ["prepare", "check", "live databases", "build", "e2e"]) {
      expect(arm, label).toContain(`stage "${label}"`);
    }
    expect(arm).toContain("printf 'meditaur: %s — %ss\\n'");
    expect(arm).toContain("this run — %ss (total %ss)");
    expect(arm).toContain('cost.sh" save');
  });

  it("releases the lock from the trap, so a stage that fails still releases it", () => {
    const trap = arm.indexOf("trap finish EXIT");
    expect(trap, "the gate must set an exit trap").toBeGreaterThan(-1);
    const finish = arm.slice(arm.indexOf("finish() {"), trap);
    expect(finish).toContain('session.sh" release');
    // And the arm must not release it again on the way out: one owner for the lock.
    expect(arm.slice(trap)).not.toContain('session.sh" release');
  });
});
