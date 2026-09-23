import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The planner patches the one list a plan operation changes; it does not reload
 * the catalogue.
 *
 * `P2 · 4`: `getLibrary` is nine storage scans, and all four of the planner's plan
 * operations used to call it to keep a two-field list honest. The screens have no
 * rendering tests, so reading the file as text is what a unit test can do — and it
 * is enough here, because each count below fails the moment a handler reaches for
 * the full load again. The behaviour itself is covered end to end by the plan
 * specs, which create, duplicate, switch and delete a plan and then read the
 * switcher.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const source = readFileSync(join(repoRoot, "apps/web/src/features/planner/Planner.tsx"), "utf8");

/** How many times `needle` appears. */
function count(needle: string): number {
  return source.split(needle).length - 1;
}

function bodyOf(method: string, until: string): string {
  const from = source.indexOf(`const ${method}`);
  const to = source.indexOf(`const ${until}`);
  expect(from, `${method} is gone`).toBeGreaterThan(-1);
  expect(to, `${until} is gone`).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe("the planner's plan operations", () => {
  it("load the catalogue once, on mount, and never after a plan changes", () => {
    expect(count("app.getLibrary("), "only the mount load may read the catalogue").toBe(1);
  });

  it("patch the plan list, which is the only list a plan operation moves", () => {
    expect(count("refreshPlans(")).toBe(3);
  });

  it("switch plans without asking for anything, because that list did not move", () => {
    const body = bodyOf("switchPlan", "removePlan");
    expect(body).not.toContain("refreshPlans(");
    expect(body).not.toContain("app.getLibrary(");
    expect(body, "the plan still gets opened").toContain("app.openPlan(");
  });
});
