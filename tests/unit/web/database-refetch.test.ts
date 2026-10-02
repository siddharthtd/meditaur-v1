import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The Database patches the view from the answer a write gives; it does not reload the
 * catalogue (`P2 · 4`).
 *
 * `getLibrary` is nine storage scans, and all eighteen of this feature's handlers — the
 * grid's thirteen, the record editor's three and the Archive's two — ran it to keep a
 * handful of lists honest. Every one of them answers instead: a stamped row, or a
 * `CatalogChangeSet` naming what was written and what went. The screens have no
 * rendering tests, so reading the files as text is what a unit test can do — and it is
 * enough here, because each count below fails the moment a handler reaches for the full
 * load again. The merge itself is `library-patch.test.ts`; the answers are
 * `create-app.test.ts` and `database-model.test.ts`; the paths a reader takes are
 * `tests/e2e/database.spec.ts` and `library.spec.ts`.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

const screen = read("apps/web/src/features/database/DatabaseScreen.tsx");
const tab = read("apps/web/src/features/database/DatabaseTab.tsx");
const record = read("apps/web/src/features/database/DatabaseRecord.tsx");
const archive = read("apps/web/src/features/database/ArchiveTable.tsx");

/** How many times `needle` appears. */
function count(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

function bodyOf(source: string, method: string, until: string): string {
  const from = source.indexOf(`const ${method}`);
  const to = source.indexOf(`const ${until}`);
  expect(from, `${method} is gone`).toBeGreaterThan(-1);
  expect(to, `${until} is gone`).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe("the Database's mutations", () => {
  it("read the catalogue on mount, and never again", () => {
    expect(count(screen, "app.getLibrary("), "only `load` may read the catalogue").toBe(1);
    expect(count(screen, "await load("), "the mount, and nothing else").toBe(1);
    // The binaural drafts are swept from the view rather than from a read: a config
    // whose meditation is gone must not wait for the next catalogue load, because
    // there is no longer one per mutation.
    expect(screen).toContain("pruneBinauralDrafts(view.meditations");
  });

  it("hands a handler no way to ask for the whole catalogue", () => {
    // The prop is the change-set, not a reload: a handler cannot refetch even by
    // accident, which is what `onReload` allowed in all eighteen of them.
    for (const [name, source] of [
      ["DatabaseTab", tab],
      ["DatabaseRecord", record],
      ["ArchiveTable", archive],
    ] as const) {
      expect(source, `${name} still takes an onReload`).not.toContain("onReload");
      expect(source, `${name} still reloads`).not.toContain("reload(");
      expect(source, `${name} still reads the catalogue`).not.toContain("getLibrary(");
    }
  });

  it("patch the view from the answer the write gives it", () => {
    const removeRow = bodyOf(tab, "removeEntry", "forgetLine");
    expect(removeRow, "a row's delete patches from its change-set").toContain("onChanges(");

    const removeRecord = bodyOf(tab, "removeRecordRow", "savePictureAsset");
    expect(removeRecord).toContain("onChanges(");
    expect(removeRecord).toContain("deleteMeditationType(");

    const save = bodyOf(record, "saveAll", "saveRef");
    expect(save, "a save patches the rows and the values it wrote").toContain("onChanges(");
    expect(save).toContain("saveValues(");

    const restore = bodyOf(archive, "restore", "remove");
    expect(restore, "a restore patches from its change-set").toContain("onChanges(");
  });

  it("drops a removed column from the draft as well as from the view", () => {
    // The trap this slice had to close: a patched view merges into a draft that has edits
    // in it exactly the way a refetch did, and `mergeRecords` leaves columns alone — so a
    // column left behind would be written back by the next Save, into a store that no
    // longer has it.
    const removeColumn = bodyOf(tab, "removeColumn", "createRecord");
    expect(removeColumn).toContain("dropColumn(current, column.id)");
    expect(removeColumn).toContain("onChanges(");
  });
});
