import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Four files have outgrown one reading, and what to do about that is the register's
 * `P3 · 50`.
 *
 * This is not the answer to that question. It is the half that stops the question
 * getting worse: each of these files is capped where it stands today and the cap
 * may only fall, so growth is a deliberate act in a commit that says why rather
 * than a side effect of an edit. The idiom is the repo's own — the same shape as
 * `ALLOWED_SECTION_CITATIONS` in `item-ids.test.ts` and the `withoutDeleted(` floor
 * in `sync-marks.test.ts`.
 *
 * Raising a ceiling is allowed and needs no permission, only a line in the commit
 * message saying what the lines bought. What is not allowed is a file that grows
 * because nobody looked.
 *
 * The numbers are **newlines**, which is what `wc -l` prints, so any of them can be
 * re-measured and compared with what is written here.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

/** One row per capped file: the file, and the ceiling it stands at. */
const CEILINGS: [string, number][] = [
  ["apps/web/src/features/database/DatabaseTable.tsx", 2275],
  ["packages/application/src/create-app.ts", 1797],
  ["apps/web/src/features/planner/Planner.tsx", 1779],
  ["apps/web/src/features/runner/Runner.tsx", 1123],
];

/** Newlines, not lines: a file's trailing newline is not a line, and `wc -l` agrees. */
function linesIn(relativePath: string): number {
  const text = readFileSync(join(repoRoot, relativePath), "utf8");
  return (text.match(/\n/g) ?? []).length;
}

describe("a file that has outgrown one reading", () => {
  it("is capped where it stands, and the cap may only fall", () => {
    for (const [file, ceiling] of CEILINGS) {
      expect(
        linesIn(file),
        `${file} grew past its ${ceiling}-line ceiling — split it, or raise the ceiling on purpose in this commit and say in the message what the lines bought`,
      ).toBeLessThanOrEqual(ceiling);
    }
  });

  it("names a file that is still there, so the list cannot quietly empty itself", () => {
    for (const [file] of CEILINGS) {
      expect(linesIn(file), `${file} is gone or unreadable — move its ceiling with it`).toBeGreaterThan(0);
    }
  });
});
