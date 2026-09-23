import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHAKRA_TYPE_ID, SEEDED_MEDITATION_TYPES } from "@meditaur/domain";
import { scopedSeededTypes } from "../../../packages/db/src/meditation-type-scope.ts";

const WORKSPACE = "01900000-0000-7000-8000-000000000002";

/**
 * What v17 actually wrote.
 *
 * `SEEDED_MEDITATION_TYPES` is `{ id, name }`, so this is the row shape that
 * reached IndexedDB on every device that existed before round 15 — and the reason
 * the types disappeared from the library.
 */
function asVersion17WroteThem() {
  return SEEDED_MEDITATION_TYPES.map((row, sortOrder) => ({
    ...row,
    sortOrder,
    archivedAt: null,
    revision: 0,
    updatedAt: 0,
  }));
}

/** What the seed writes, which is what a fresh device has. */
function asTheSeedWritesThem() {
  return SEEDED_MEDITATION_TYPES.map((row, sortOrder) => ({
    ...row,
    workspaceId: WORKSPACE,
    sortOrder,
    archivedAt: null,
    revision: 0,
    updatedAt: 0,
  }));
}

describe("the seeded meditation types' workspace", () => {
  it("gives v17's unscoped rows the workspace every read asks for", () => {
    const rows = scopedSeededTypes([{ id: WORKSPACE }], asVersion17WroteThem());
    expect(rows.map((row) => row.id)).toEqual(SEEDED_MEDITATION_TYPES.map((row) => row.id));
    expect(rows.map((row) => row.workspaceId)).toEqual(
      SEEDED_MEDITATION_TYPES.map(() => WORKSPACE),
    );
  });

  it("leaves a device that is already correct alone", () => {
    expect(scopedSeededTypes([{ id: WORKSPACE }], asTheSeedWritesThem())).toEqual([]);
  });

  it("keeps the name, the order and the archive the row already carries", () => {
    const edited = asVersion17WroteThem().map((row) =>
      row.id === CHAKRA_TYPE_ID
        ? { ...row, name: "Chakras and points", sortOrder: 7, archivedAt: 5 }
        : row,
    );
    const row = scopedSeededTypes([{ id: WORKSPACE }], edited).find(
      (item) => item.id === CHAKRA_TYPE_ID,
    );
    expect(row).toMatchObject({
      name: "Chakras and points",
      sortOrder: 7,
      archivedAt: 5,
      workspaceId: WORKSPACE,
    });
  });

  it("writes nothing while there is no workspace for a row to belong to", () => {
    expect(scopedSeededTypes([], asVersion17WroteThem())).toEqual([]);
  });
});

/**
 * And the upgrade that repairs it is actually wired.
 *
 * The four cases above test the rule, not the wiring: deleting the v19 block would
 * leave every one of them green and the defect back in production. This half is
 * deliberately source-text-based, like `transaction-scope.test.ts` and the
 * integrity test's other structural guards — the failure mode is an *omission*,
 * which the type system cannot see and no unit test runs into, because the unit
 * suite has no IndexedDB to upgrade.
 */
describe("the repair is wired into the store", () => {
  const schema = readFileSync(
    new URL("../../../packages/db/src/schema.ts", import.meta.url),
    "utf8",
  );

  /** One `this.version(n)` block, up to whichever version follows it. */
  function versionBlock(n: number): string {
    const start = schema.indexOf(`this.version(${n})`);
    expect(start, `schema.ts declares a version ${n}`).toBeGreaterThan(-1);
    const next = schema.indexOf("this.version(", start + 1);
    return schema.slice(start, next === -1 ? undefined : next);
  }

  it("writes the scope back in a version above the rename", () => {
    const block = versionBlock(19);
    expect(block).toContain("scopedSeededTypes(");
    expect(block).toContain('table("meditationTypes").put(');
  });

  it("leaves v17 alone, because a repair edited into it would repair nobody", () => {
    // Dexie does not re-run a version, so the devices this affects — every one
    // that existed before round 15 — would never touch an edited v17 again. The
    // `.stores()` index string above still names `workspaceId`; what must not
    // appear is the repair itself.
    expect(versionBlock(17)).not.toContain("scopedSeededTypes(");
  });
});
