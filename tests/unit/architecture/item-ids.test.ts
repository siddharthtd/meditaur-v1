import { lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function readRepo(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

/**
 * One scheme for every identifier, and this is the guard for it. The rules are in
 * `docs/ROADMAP.md` ("How work is identified") and the labels they replace are in
 * `docs/HISTORY.md` ("What the old labels mean now").
 *
 * What is checked, and why each check exists:
 *
 * 1. The register is well formed — every row has an integer id, a `P0`–`P5`, a
 *    state and something it needs — so the file cannot rot into prose.
 * 2. Ids are unique, a subpoint has its parent, and its letter follows the one
 *    before it: an id is allocated once and never reused.
 * 3. No retired label appears in a **code comment** or in a **living document**.
 *    The two historical documents are the exception and are named below, because
 *    the crosswalk has to spell the old labels out.
 * 4. Section citations may only fall in number. The repo still carries a backlog
 *    of comments pointing at a retired plan by section (`§5.4`), tracked as the
 *    register's `P3 · 32`; the ratchet stops it growing while it is paid down.
 */
const RETIRED_LABELS: { name: string; pattern: RegExp }[] = [
  { name: "the architecture review's findings (M1-M11)", pattern: /\bM(?:[1-9]|1[01])\b/ },
  { name: "its critical defects (C1-C4)", pattern: /\bC[1-4]\b/ },
  { name: "the hardening review's items (H1-H6)", pattern: /\bH[1-6]\b(?![0-9a-z])/ },
  { name: "the outside review's own labels (R1.2 …)", pattern: /\bR[1-6]\.[0-9]\b/ },
  { name: "the round-12 decision labels (D1-D5)", pattern: /\bD[1-5]\b/ },
  { name: "a plan phase (Phase 0-4)", pattern: /\bPhase [0-4]\b/ },
  { name: "a plan phase letter (P2b, P2c)", pattern: /\bP[1-8][a-c]\b/ },
  { name: "a plan phase decimal (P2.6)", pattern: /\bP[0-9]\.[0-9]\b/ },
  { name: "a phase number above the priority range (P6+)", pattern: /\bP[6-9]\b/ },
];

/**
 * The files scanned in full. `HISTORY.md` is the archive and its crosswalk exists
 * to name the old labels; `REVIEW_LOG.md` records each round in the words of its
 * day, and rewriting a round would falsify the record. A plan document is scanned
 * while it is live, so it cannot invent a family of its own to describe its own
 * order of work.
 */
const LIVING_DOCS: string[] = [
  "README.md",
  "AGENTS.md",
  "docs/ARCHITECTURE.md",
  "docs/DECISIONS.md",
  "docs/DEPENDENCIES.md",
  "docs/IMPLEMENTATION.md",
  "docs/ROADMAP.md",
  "docs/UI_DESIGN.md",
  "docs/USER_GUIDE.md",
  "docs/BETA_GUIDE.md",
];

/** Lines that legitimately contain a lookalike token. */
const ALLOWED: { file: string; contains: string }[] = [
  // The rule itself has to name what it bans.
  { file: "AGENTS.md", contains: "Never invent a letter family" },
  // A tone label, not the outside review's numbering.
  { file: "docs/UI_DESIGN.md", contains: "L1/R1" },
  { file: "docs/UI_DESIGN.md", contains: "L1` / `R1" },
];

function listCodeFiles(relativeDir: string): string[] {
  const dir = join(repoRoot, relativeDir);
  const out: string[] = [];
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      // pnpm links a package's dependencies into its own `node_modules`; walking
      // through them would count a third party's comments as this repo's.
      if (name === "node_modules" || name === ".next" || name === ".turbo") continue;
      const path = join(current, name);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (/\.(ts|tsx|mdc)$/.test(name)) out.push(path.slice(repoRoot.length + 1));
    }
  };
  walk(dir);
  return out;
}

/** Only comments: a string literal may hold anything — an SVG path's own data
 * starts with a letter of an alphabet this file's rules police. */
function commentLines(text: string): string[] {
  return text
    .split("\n")
    .filter((line) => /^\s*(\/\/|\*|\/\*)/.test(line));
}

function allowed(file: string, line: string): boolean {
  return ALLOWED.some((entry) => entry.file === file && line.includes(entry.contains));
}

describe("one identifier scheme", () => {
  it("keeps the register well formed", () => {
    const rows = readRepo("docs/ROADMAP.md")
      .split("\n")
      .filter((line) => /^\|\s*P[0-5]\s*\|/.test(line))
      .map((line) =>
        line
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim()),
      );
    expect(rows.length, "the register's rows").toBeGreaterThan(15);

    for (const [p, id, state, item, needs] of rows) {
      expect(p, `row ${id} has a priority tag`).toMatch(/^P[0-5]$/);
      expect(id, `row ${id} has an integer id, with an optional single letter`).toMatch(
        /^\d+[a-z]?$/,
      );
      expect(state, `row ${id} has a state`).toMatch(/^(open|blocked|parked)$/);
      expect(item.length, `row ${id} names the work`).toBeGreaterThan(8);
      expect(needs.length, `row ${id} says what it needs`).toBeGreaterThan(20);
    }

    // An id is allocated once: no duplicate, and a subpoint has its parent.
    const ids = rows.map(([, id]) => id);
    expect(new Set(ids).size, "no duplicate ids").toBe(ids.length);
    for (const id of ids) {
      if (!/[a-z]$/.test(id)) continue;
      const parent = id.slice(0, -1);
      expect(ids, `subpoint ${id} has its parent`).toContain(parent);
      // A sibling is **one letter on the same parent**, not every id that begins with it:
      // a prefix match makes `3a` a sibling of `35` and `36` and then fails the
      // contiguity rule for a register that is perfectly well formed. The letter shape is
      // what the scheme says — one level deep, one character — so that is what this asks.
      const siblings = ids.filter((other) => new RegExp(`^${parent}[a-z]$`).test(other));
      expect(siblings, `subpoint letters start at a and are contiguous`).toEqual(
        siblings.map((_, index) => `${parent}${String.fromCharCode(97 + index)}`),
      );
    }

    // Sorted by priority, so the top of the table is always the next thing.
    const bands = rows.map(([p]) => Number(p.slice(1)));
    expect(bands, "the register is sorted by priority").toEqual([...bands].sort((a, b) => a - b));
  });

  it("keeps the retired labels out of the living documents and the code", () => {
    const offenders: string[] = [];

    const scan = (file: string, lines: { text: string; number: number }[]) => {
      for (const { text, number } of lines) {
        if (allowed(file, text)) continue;
        for (const { name, pattern } of RETIRED_LABELS) {
          if (pattern.test(text)) offenders.push(`${file}:${number} — ${name}: ${text.trim()}`);
        }
      }
    };

    for (const doc of LIVING_DOCS) {
      scan(
        doc,
        readRepo(doc)
          .split("\n")
          .map((text, index) => ({ text, number: index + 1 })),
      );
    }
    for (const file of [
      ...listCodeFiles("apps/web/src"),
      ...listCodeFiles("packages"),
      ...listCodeFiles("tests"),
      ...listCodeFiles(".cursor"),
    ]) {
      scan(
        file,
        commentLines(readRepo(file)).map((text) => ({ text, number: 0 })),
      );
    }

    expect(offenders, "a retired label survives — see docs/HISTORY.md for its new home").toEqual([]);
  });

  it("only lets the section-citation backlog fall", () => {
    // The backlog: comments that cite a *retired* plan by section (`§5.4`). It is
    // the register's `P3 · 32`, and it is paid down as a file is touched. A
    // citation that names its document is fine — `UI_DESIGN.md` §1.4 stays valid —
    // so what is counted is the bare `§5.4`, which pointed at a plan that is gone.
    const ALLOWED_SECTION_CITATIONS = 309;
    let count = 0;
    for (const file of [...listCodeFiles("apps/web/src"), ...listCodeFiles("packages"), ...listCodeFiles("tests")]) {
      count += commentLines(readRepo(file)).filter(
        (line) => line.includes("§") && !line.includes(".md"),
      ).length;
    }
    expect(
      count,
      "the number of code comments citing a document by section may only fall",
    ).toBeLessThanOrEqual(ALLOWED_SECTION_CITATIONS);
  });

  it("does not point at a retired document by name", () => {
    const retired = [
      "ARCHITECTURE_REVIEW.md",
      "HARDENING_REVIEW.md",
      "DATABASE_TAB_PLAN.md",
      "MEDITATION_TYPES_PLAN.md",
      "MEDITATION_TYPES_HANDOVER.md",
      "INTENTIONS_AND_SESSION_PLAN.md",
    ];
    const offenders: string[] = [];
    for (const file of [
      ...LIVING_DOCS,
      ...listCodeFiles("apps/web/src"),
      ...listCodeFiles("packages"),
      ...listCodeFiles("tests"),
    ]) {
      const text = readRepo(file);
      for (const name of retired) {
        // HISTORY.md is not in the list above: it is where the retired documents are
        // named, with the command that still reads them.
        if (text.includes(`](./${name}`) || text.includes(`](${name}`)) {
          offenders.push(`${file} links ${name}`);
        }
      }
    }
    expect(offenders, "a living document links a retired one").toEqual([]);
    expect(lstatSync(join(repoRoot, "docs/HISTORY.md"), { throwIfNoEntry: false })).toBeTruthy();
  });
});
