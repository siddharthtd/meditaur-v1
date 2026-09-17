import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const gateScript = join(repoRoot, "scripts", "skip-build-if-md-only.sh");

// The gate asks git two questions — which range, and what changed in it — and
// this is git answering from a shell script, because the tools container has no
// git (`node:24-bookworm-slim`). Every call is logged, so the tests pin the range
// the gate reads as well as the verdict it returns.
const FAKE_GIT = `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_GIT_LOG"
case $1 in
  rev-parse)
    case $2 in
      --show-toplevel)
        printf '%s\\n' "$FAKE_GIT_ROOT"
        exit 0
        ;;
      --verify)
        rev=$4
        case $rev in
          *'^{commit}') rev=\${rev%'^{commit}'} ;;
        esac
        if grep -qxF "$rev" "$FAKE_GIT_DIR/resolvable"; then exit 0; fi
        exit 1
        ;;
    esac
    exit 1
    ;;
  diff)
    if [ -f "$FAKE_GIT_DIR/range.$3" ]; then
      cat "$FAKE_GIT_DIR/range.$3"
      exit 0
    fi
    exit 128
    ;;
  fetch)
    for arg in "$@"; do sha=$arg; done
    if [ "\${FAKE_GIT_FETCH:-fail}" = "ok" ]; then
      printf '%s\\n' "$sha" >> "$FAKE_GIT_DIR/resolvable"
      exit 0
    fi
    exit 9
    ;;
esac
exit 1
`;

/** The commit Vercel reports as the last deployment for this project + branch. */
const DEPLOYED = "1111111111";
/** A code commit that a documentation commit was pushed on top of. */
const CODE = "2222222222";
/** A commit outside Vercel's `--depth=10` clone. */
const OLD_DEPLOYED = "3333333333";

type GateInput = {
  /** `VERCEL_GIT_PREVIOUS_SHA`; absent is the same as an empty value. */
  previous?: string;
  /** Revisions in the clone, i.e. what `git rev-parse --verify` resolves. */
  resolvable?: string[];
  /** `range.<base>`: the files `git diff --name-only <base> HEAD` reports. */
  ranges?: Record<string, string[]>;
  /** Whether the on-demand fetch of an out-of-clone last deployment works. */
  fetch?: "ok" | "fail";
  /** cwd the gate is invoked from — Vercel runs it in the Root Directory. */
  cwd?: string;
};

function runGate(input: GateInput): { code: number; commands: string[] } {
  const dir = mkdtempSync(join(tmpdir(), "meditaur-deploy-gate-"));
  const bin = join(dir, "bin");
  const repo = join(dir, "repo");
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(repo, "apps", "web"), { recursive: true });
  writeFileSync(join(bin, "git"), FAKE_GIT, { mode: 0o755 });
  writeFileSync(
    join(dir, "resolvable"),
    (input.resolvable ?? []).map((rev) => `${rev}\n`).join(""),
  );
  for (const [base, files] of Object.entries(input.ranges ?? {})) {
    writeFileSync(
      join(dir, `range.${base}`),
      files.map((file) => `${file}\n`).join(""),
    );
  }

  const result = spawnSync("/bin/sh", [gateScript], {
    cwd: join(repo, input.cwd ?? "."),
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      FAKE_GIT_DIR: dir,
      FAKE_GIT_ROOT: repo,
      FAKE_GIT_LOG: join(dir, "log"),
      FAKE_GIT_FETCH: input.fetch ?? "fail",
      VERCEL_GIT_PREVIOUS_SHA: input.previous ?? "",
    },
    encoding: "utf8",
  });

  return {
    code: result.status ?? -1,
    commands: readFileSync(join(dir, "log"), "utf8").split("\n").filter(Boolean),
  };
}

describe("the Vercel deploy gate", () => {
  it("builds a code commit that a documentation commit was pushed on top of", () => {
    const gate = runGate({
      previous: DEPLOYED,
      resolvable: [DEPLOYED, "HEAD^"],
      ranges: {
        [DEPLOYED]: ["apps/web/src/app/plan/page.tsx", "docs/REVIEW_LOG.md"],
      },
    });
    expect(gate.code).toBe(1);
    expect(gate.commands).toContain(`diff --name-only ${DEPLOYED} HEAD`);
  });

  it("skips when everything since the last deployment is documentation", () => {
    const gate = runGate({
      previous: DEPLOYED,
      resolvable: [DEPLOYED],
      ranges: { [DEPLOYED]: ["docs/ROADMAP.md", "docs/REVIEW_LOG.md"] },
    });
    expect(gate.code).toBe(0);
  });

  it("treats markdown anywhere and anything under docs/ as documentation", () => {
    for (const file of ["README.md", "AGENTS.md", "docs/assets/diagram.png"]) {
      const gate = runGate({
        previous: DEPLOYED,
        resolvable: [DEPLOYED],
        ranges: { [DEPLOYED]: [file] },
      });
      expect(gate.code, file).toBe(0);
    }
  });

  it("builds when a file the build reads changed since the last deployment", () => {
    for (const file of [
      "package.json",
      "packages/domain/src/session.ts",
      "supabase/migrations/20260916190000_thing.sql",
      ".github/workflows/deploy.yml",
      "pnpm-lock.yaml",
    ]) {
      const gate = runGate({
        previous: DEPLOYED,
        resolvable: [DEPLOYED],
        ranges: { [DEPLOYED]: [file] },
      });
      expect(gate.code, file).toBe(1);
    }
  });

  it("skips when nothing landed since the last deployment", () => {
    const gate = runGate({
      previous: DEPLOYED,
      resolvable: [DEPLOYED],
      ranges: { [DEPLOYED]: [] },
    });
    expect(gate.code).toBe(0);
  });

  it("builds when the range cannot be read at all", () => {
    const gate = runGate({
      previous: DEPLOYED,
      resolvable: [DEPLOYED],
      ranges: {},
    });
    expect(gate.code).toBe(1);
  });

  it("reads the range from the Vercel Root Directory", () => {
    const gate = runGate({
      previous: DEPLOYED,
      resolvable: [DEPLOYED],
      ranges: { [DEPLOYED]: ["apps/web/src/app/page.tsx"] },
      cwd: "apps/web",
    });
    expect(gate.code).toBe(1);
  });

  it("falls back to the tip commit when there is no deployment to compare", () => {
    const docs = runGate({
      resolvable: ["HEAD^"],
      ranges: { "HEAD^": ["docs/USER_GUIDE.md"] },
    });
    expect(docs.code).toBe(0);
    expect(docs.commands).toContain("diff --name-only HEAD^ HEAD");

    const code = runGate({
      resolvable: ["HEAD^"],
      ranges: { "HEAD^": ["apps/web/src/app/page.tsx"] },
    });
    expect(code.code).toBe(1);
  });

  it("builds a first deployment, even a documentation-only one", () => {
    const gate = runGate({ resolvable: [], ranges: {} });
    expect(gate.code).toBe(1);
  });

  it("fetches a last deployment that is older than the ten-commit clone", () => {
    const gate = runGate({
      previous: OLD_DEPLOYED,
      resolvable: [],
      ranges: { [OLD_DEPLOYED]: [`apps/web/src/app/page.tsx`, "docs/BETA_GUIDE.md"] },
      fetch: "ok",
    });
    expect(gate.code).toBe(1);
    expect(gate.commands).toContain(
      `fetch --quiet --depth=1 origin ${OLD_DEPLOYED}`,
    );
    expect(gate.commands).toContain(`diff --name-only ${OLD_DEPLOYED} HEAD`);
  });

  it("does not fetch a last deployment the clone already has", () => {
    const gate = runGate({
      previous: CODE,
      resolvable: [CODE],
      ranges: { [CODE]: ["docs/ROADMAP.md"] },
    });
    expect(gate.code).toBe(0);
    expect(gate.commands.some((command) => command.startsWith("fetch "))).toBe(
      false,
    );
  });

  it("falls back to the tip commit when that fetch fails", () => {
    const gate = runGate({
      previous: OLD_DEPLOYED,
      resolvable: ["HEAD^"],
      ranges: { "HEAD^": ["docs/ROADMAP.md"] },
      fetch: "fail",
    });
    expect(gate.code).toBe(0);
    expect(
      gate.commands.some((command) => command.startsWith("fetch ")),
    ).toBe(true);
    expect(gate.commands).toContain("diff --name-only HEAD^ HEAD");
  });
});
