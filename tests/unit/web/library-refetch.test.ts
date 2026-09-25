import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The library patches the lists a mutation moves; it does not reload the catalogue.
 *
 * `P2 · 4`: `getLibrary` is nine storage scans, and every mutation in this screen
 * used to run it to keep a handful of lists honest. The screens have no rendering
 * tests, so reading the file as text is what a unit test can do — and it is enough
 * here, because each count below fails the moment a handler reaches for the full
 * load again. The behaviour of the merge itself is `library-patch.test.ts`, and the
 * end-to-end paths (an upload, a preset's delete and its armed second press) are in
 * `tests/e2e/library.spec.ts`.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const source = readFileSync(join(repoRoot, "apps/web/src/features/library/Library.tsx"), "utf8");

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

describe("the library's mutations", () => {
  it("read the catalogue on mount, and again only for a whole-catalog restore", () => {
    expect(count("app.getLibrary("), "only `reload` may read the catalogue").toBe(1);
    // The mount's load and the restore's. A restore rewrites every table at once, so
    // it is the one operation no change-set can describe.
    expect(count("await reload("), "the mount and the restore, and nothing else").toBe(2);
  });

  it("patch the view from the answer the write gives it", () => {
    const upload = bodyOf("uploadMedia", "cardDelete");
    expect(upload).not.toContain("reload(");
    expect(upload).toContain("withRow(");

    const remove = bodyOf("cardDelete", "columns");
    expect(remove, "a delete patches from its change-set").not.toContain("reload(");
    expect(remove).toContain("patchLibrary(");
  });

  it("turn the delete's change-set into the lists, rather than one id into one list", () => {
    // The trap this item exists to remove: `deletePreset` and `deleteMediaAsset`
    // rewrite the meditations and the symbols that pointed at the row, so a patch
    // that only dropped the deleted id would leave those two stale in this view.
    const remove = bodyOf("cardDelete", "columns");
    expect(remove).toContain("setView(");
    expect(remove).toMatch(/patchLibrary\(current, changes\)/);
  });
});
