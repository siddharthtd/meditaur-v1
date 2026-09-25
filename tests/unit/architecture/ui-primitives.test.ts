import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Where `packages/ui` has a control for the job, the app uses it — and this is the
 * file that says so. The register's `P4 · 51`.
 *
 * The library is not being abandoned: thirty-odd files under `apps/web/src` import
 * from `@meditaur/ui`, and the first case below holds that floor up, because a guard
 * that only counts hand-rolled buttons would be satisfied by a tree that uses no
 * buttons at all.
 *
 * What survives is a set of hand-rolled `<button>` tags, each older than the rule
 * that would have forbidden it. Some are deliberate — the Database grid's row band,
 * a colour swatch, a card's `absolute inset-0` press target — and some are simply
 * older than the rule; nothing in the tree tells the two apart, which is exactly why
 * the next feature was free to add another one. So every file that holds a tag is
 * named below with its count and a reason, and:
 *
 * 1. A named file may not grow past the count it is pinned at.
 * 2. A file that is not named may not hold one at all.
 *
 * **The list is a pin, not an endorsement.** Whether any survivor should become
 * `Button` is the register row's own question, and this file deliberately does not
 * answer it.
 *
 * Two scopes are deliberate. `apps/web/src/app/**` is out: `global-error.tsx` is the
 * last-resort screen, which cannot rely on the app's stylesheet or on a component
 * that imports one. And the tag is counted in the file's **text**, so a comment that
 * writes `<button` counts — which is the right way round for a pin, and worth
 * knowing before writing one in a file on this list.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const FEATURES = "apps/web/src/features";
const APP_SRC = "apps/web/src";

/** One row per file that hand-rolls a button today: how many, and why it does. */
const RAW_BUTTONS: [string, number, string][] = [
  [
    "apps/web/src/features/database/DatabaseTable.tsx",
    13,
    "the grid's headers, its column menus and the row band's own controls (round 20's shape)",
  ],
  [
    "apps/web/src/features/database/DatabaseCells.tsx",
    7,
    "the cell editors and their popovers, which carry the cell's own geometry",
  ],
  [
    "apps/web/src/features/planner/Planner.tsx",
    5,
    "the plan card's handle and foot row, and the strip's own chrome",
  ],
  ["apps/web/src/features/runner/StageStrip.tsx", 4, "the stage strip's tiles"],
  [
    "apps/web/src/features/settings/ThemePicker.tsx",
    1,
    "a colour swatch, which is a paint rather than a label",
  ],
  [
    "apps/web/src/features/library/CatalogCard.tsx",
    1,
    "the card's `absolute inset-0` press target, which sits under the card's actions",
  ],
  [
    "apps/web/src/features/library/CatalogDataTable.tsx",
    1,
    "the table's own row press target",
  ],
  ["apps/web/src/features/library/HistoryTable.tsx", 1, "a row's press target"],
  ["apps/web/src/features/library/PlansTable.tsx", 1, "a row's press target"],
];

/** Every `.ts`/`.tsx` under a directory, repo-relative, skipping the build's own. */
function codeFiles(relativeDir: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      if (name === "node_modules" || name === ".next" || name === ".turbo") continue;
      const path = join(current, name);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (/\.tsx?$/.test(name)) out.push(path.slice(repoRoot.length + 1));
    }
  };
  walk(join(repoRoot, relativeDir));
  return out;
}

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function rawButtons(text: string): number {
  return (text.match(/<button\b/g) ?? []).length;
}

describe("the shared controls in packages/ui", () => {
  it("are still what the feature tree reaches for", () => {
    const reusing = codeFiles(APP_SRC).filter((file) => read(file).includes('"@meditaur/ui"'));
    expect(
      reusing.length,
      "the app reached for the shared library from fewer places than it used to — this guard exists to keep the primitives in use, not to empty the tree of buttons",
    ).toBeGreaterThanOrEqual(30);
  });

  it("are used wherever the tree has one, and the exceptions are the named ones", () => {
    const pinned = new Map(RAW_BUTTONS.map(([file, count]) => [file, count]));
    const offenders: string[] = [];

    for (const file of codeFiles(FEATURES)) {
      const count = rawButtons(read(file));
      const ceiling = pinned.get(file);
      if (ceiling === undefined) {
        if (count > 0) {
          offenders.push(
            `${file} hand-rolls ${count} of them and is not on the list — use the library's control, or name the file here with the reason it needs its own`,
          );
        }
        continue;
      }
      if (count > ceiling) {
        offenders.push(`${file} grew from ${ceiling} to ${count} — the pin may only fall`);
      }
    }

    expect(offenders, "a raw button where the library has one").toEqual([]);
  });

  it("names a file that is still there, so the list cannot quietly empty itself", () => {
    for (const [file] of RAW_BUTTONS) {
      expect(read(file), `${file} is gone — take its row off this list`).toContain("<button");
    }
  });
});
