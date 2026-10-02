import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const script = join(repoRoot, "scripts", "keep-alive.sh");
const workflow = join(repoRoot, ".github", "workflows", "keep-alive.yml");
const read = (path: string) => readFileSync(path, "utf8");

/**
 * The ping is two `curl` calls, and this is curl answering from a shell script.
 * The tests run in the tools container and must never reach the network — and
 * never touch the operator's own `.env` — so every call is answered from the
 * environment below and logged, which is also how the tests pin *what* the ping
 * asks for, not only the verdict it returns.
 */
const FAKE_CURL = `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_CURL_LOG"
for arg in "$@"; do url="$arg"; done
case "$url" in
  */auth/v1/health) code="\${FAKE_CURL_AUTH_CODE:-200}" ;;
  */rest/v1/*) code="\${FAKE_CURL_REST_CODE:-200}" ;;
  *) code="\${FAKE_CURL_CODE:-200}" ;;
esac
if [ "\${FAKE_CURL_EXIT:-0}" != "0" ]; then exit "\${FAKE_CURL_EXIT}"; fi
printf '%s' "$code"
`;

type PingInput = {
  /** `SUPABASE_URL` in the environment; absent means the variable is unset. */
  url?: string;
  /** `SUPABASE_ANON_KEY` in the environment. */
  key?: string;
  /** Lines for a `.env` in the working directory, the local operator's path. */
  envFile?: string[];
  /** What the table read answers. */
  restCode?: string;
  /** What the auth health check answers. */
  authCode?: string;
  /** A transport failure: curl exits without printing a status. */
  curlExit?: string;
};

function ping(input: PingInput): {
  code: number;
  out: string;
  err: string;
  calls: string[];
} {
  const dir = mkdtempSync(join(tmpdir(), "meditaur-keep-alive-"));
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "curl"), FAKE_CURL, { mode: 0o755 });
  if (input.envFile !== undefined) {
    writeFileSync(
      join(dir, ".env"),
      input.envFile.map((line) => `${line}\n`).join(""),
    );
  }

  const log = join(dir, "curl.log");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    FAKE_CURL_LOG: log,
  };
  // Only the two names the script reads, and only when a case sets them: a
  // machine that exports its own keys must not change what these tests prove.
  delete env.SUPABASE_URL;
  delete env.SUPABASE_ANON_KEY;
  if (input.url !== undefined) env.SUPABASE_URL = input.url;
  if (input.key !== undefined) env.SUPABASE_ANON_KEY = input.key;
  if (input.restCode !== undefined) env.FAKE_CURL_REST_CODE = input.restCode;
  if (input.authCode !== undefined) env.FAKE_CURL_AUTH_CODE = input.authCode;
  if (input.curlExit !== undefined) env.FAKE_CURL_EXIT = input.curlExit;

  // `/bin/sh`, not bash: the repo runs this one under `sh`, so a bashism has to
  // fail here rather than in a scheduled run nobody is watching.
  const result = spawnSync("/bin/sh", [script], { cwd: dir, env, encoding: "utf8" });
  let calls: string[];
  try {
    calls = readFileSync(log, "utf8").split("\n").filter(Boolean);
  } catch {
    calls = [];
  }

  return {
    code: result.status ?? -1,
    out: result.stdout,
    err: result.stderr,
    calls,
  };
}

const HOSTED = "https://hosted-project.supabase.co";
// Not key-shaped, on purpose: `integrity.test.ts` scans every committable file
// for `sb_publishable_…`/`sb_secret_…`/JWT shapes, and a realistic-looking
// fixture here would be a red gate for no reason.
const PUBLISHABLE = "publishable-key-in-a-test";

describe("the Supabase keep-alive ping", () => {
  it("asks the hosted project for a row, with the key, and nothing else", () => {
    const run = ping({ url: HOSTED, key: PUBLISHABLE });

    expect(run.code).toBe(0);
    expect(run.calls).toHaveLength(2);
    expect(run.calls[0]).toContain(`${HOSTED}/rest/v1/plans?select=id&limit=1`);
    expect(run.calls[0]).toContain(`apikey: ${PUBLISHABLE}`);
    expect(run.calls[0]).toContain(`Authorization: Bearer ${PUBLISHABLE}`);
    expect(run.calls[1]).toContain(`${HOSTED}/auth/v1/health`);
    // The health endpoint sits behind the project's gateway and answers 401
    // without the key, so the key belongs on that call too.
    expect(run.calls[1]).toContain(`apikey: ${PUBLISHABLE}`);
    // The host is read for the log line, and reading it wrong is invisible in the
    // requests themselves: the first draft printed `https:` because BSD sed does
    // not read `\?` the way GNU sed does.
    expect(run.out).toContain(`${HOSTED.replace("https://", "")} answered a table read with 200.`);
    expect(run.out).toContain("pinged.");
  });

  it("only ever reads", () => {
    const text = read(script);

    for (const verb of [
      "-X POST",
      "-X PUT",
      "-X PATCH",
      "-X DELETE",
      "--data",
      "--form",
      "-F ",
    ]) {
      expect(text, verb).not.toContain(verb);
    }
    // Two probes: that is the whole of what this file does on the wire.
    expect(text.match(/-w '%\{http_code\}'/g) ?? []).toHaveLength(2);
  });

  it("fails when the project does not answer the table read", () => {
    const run = ping({ url: HOSTED, key: PUBLISHABLE, restCode: "500" });

    expect(run.code).toBe(1);
    expect(run.err).toContain("may already be paused");
  });

  it("fails when the project does not answer its auth health check", () => {
    const run = ping({ url: HOSTED, key: PUBLISHABLE, authCode: "503" });

    expect(run.code).toBe(1);
    expect(run.err).toContain("may already be paused");
  });

  it("treats a transport failure as a failure, not as a silent skip", () => {
    const run = ping({ url: HOSTED, key: PUBLISHABLE, curlExit: "7" });

    expect(run.code).toBe(1);
    expect(run.err).toContain("may already be paused");
  });

  it("reads the pair out of .env when the environment has none", () => {
    const run = ping({
      envFile: [
        "# a comment, and a first value the later line replaces",
        "SUPABASE_URL=https://wrong.supabase.co",
        "SUPABASE_URL='https://from-file.supabase.co'",
        'SUPABASE_ANON_KEY="publishable-from-file"',
      ],
    });

    expect(run.code).toBe(0);
    expect(run.calls[0]).toContain("https://from-file.supabase.co/rest/v1/plans");
    expect(run.calls[0]).toContain("Bearer publishable-from-file");
    expect(run.calls[0]).not.toContain("wrong.supabase.co");
  });

  it("stops when half the pair is configured, naming the half that is missing", () => {
    const noKey = ping({ url: HOSTED });
    expect(noKey.code).toBe(2);
    expect(noKey.err).toContain("SUPABASE_ANON_KEY is missing");
    expect(noKey.calls).toHaveLength(0);

    const noUrl = ping({ key: PUBLISHABLE });
    expect(noUrl.code).toBe(2);
    expect(noUrl.err).toContain("SUPABASE_URL is missing");
    expect(noUrl.calls).toHaveLength(0);
  });

  it("does nothing at all when neither is configured", () => {
    const run = ping({});

    expect(run.code).toBe(0);
    expect(run.calls).toHaveLength(0);
    expect(run.out).toContain("nothing to ping");
  });
});

describe("the keep-alive workflow", () => {
  const text = read(workflow);

  it("runs daily, and can be fired by hand", () => {
    expect(text).toMatch(/^ {2}schedule:$/m);
    expect(text).toMatch(/^ {2}workflow_dispatch:$/m);

    const cron = text.match(/- cron: "([^"]+)"/)?.[1] ?? "";
    // Five fields, and only two of them fixed: every day, not once a week.
    expect(cron.split(/\s+/)).toEqual(["23", "5", "*", "*", "*"]);
  });

  it("runs the repo's own script, and skips quietly without the secrets", () => {
    expect(text).toContain("run: sh scripts/keep-alive.sh");
    expect(text).toMatch(
      /if: env\.SUPABASE_URL != '' \|\| env\.SUPABASE_ANON_KEY != ''/,
    );
    expect(text).toMatch(
      /if: env\.SUPABASE_URL == '' && env\.SUPABASE_ANON_KEY == ''/,
    );
    // A half-configured pair must not take the skip branch, or a typo would
    // look like an unconfigured mirror for ever.
    expect(text).not.toMatch(
      /if: env\.SUPABASE_URL != '' && env\.SUPABASE_ANON_KEY != ''/,
    );
  });

  it("carries the key in a secret, and names no project host of its own", () => {
    // A key-shaped value anywhere in the tree is `integrity.test.ts`'s job, and it
    // is an fs walk rather than a list of files. What belongs here is the wiring:
    // the key arrives from a secret, and neither file carries a project's own host.
    expect(text).toMatch(/SUPABASE_URL: \$\{\{ secrets\.SUPABASE_URL \}\}/);
    expect(text).toMatch(/SUPABASE_ANON_KEY: \$\{\{ secrets\.SUPABASE_ANON_KEY \}\}/);
    for (const file of [workflow, script]) {
      expect(read(file), file).not.toMatch(/https:\/\/[a-z0-9]{20}\.supabase\.(co|in)\b/);
      expect(read(file), file).not.toContain("sb_publishable_");
      expect(read(file), file).not.toContain("sb_secret_");
    }
  });
});
