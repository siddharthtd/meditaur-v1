import { describe, expect, it } from "vitest";
import { makeFieldDef } from "../../fixtures/library.ts";
import {
  fieldDefFromRow,
  fieldDefRow,
} from "../../../packages/db/src/field-def-row.ts";

describe("the field_defs row", () => {
  it("speaks the stored column names rather than the domain's", () => {
    const row = fieldDefRow(makeFieldDef());
    expect(Object.keys(row)).toContain("cell_type");
    expect(Object.keys(row)).toContain("ref_kind");
    expect(Object.keys(row)).toContain("type_id");
    expect(Object.keys(row)).not.toContain("cellType");
    expect(Object.keys(row)).not.toContain("sortOrder");
  });

  it("keeps a shared column shared and a text cell pointing at nothing", () => {
    // `type_id: null` is "every type shows this column", and `ref_kind: null` is
    // "this cell is not a reference". Defaulting either one would put a column on a
    // type it does not belong to, or make a text cell claim to point somewhere.
    const row = fieldDefRow(makeFieldDef({ typeId: null, cellType: "text", refKind: null }));
    expect(row.type_id).toBeNull();
    expect(row.ref_kind).toBeNull();

    const read = fieldDefFromRow(row);
    expect(read.typeId).toBeNull();
    expect(read.refKind).toBeNull();
    expect(read.cellType).toBe("text");
  });

  it("reads a column whose key is absent as empty rather than re-deriving it", () => {
    // The key is what a plan's display names and what a stored value is keyed to.
    // Re-deriving it from the heading here would rename a column's identity every
    // time a reader rewrote its heading.
    const row = fieldDefRow(makeFieldDef());
    delete row.key;
    delete row.description;
    delete row.deleted_at;

    const read = fieldDefFromRow(row);
    expect(read.key).toBe("");
    expect(read.description).toBe("");
    expect(read.deletedAt).toBeNull();
  });

  it("round-trips a column through its row unchanged", () => {
    const def = makeFieldDef({ archivedAt: 1_700_000_000_000, deletedAt: 1_700_000_100_000 });
    expect(fieldDefFromRow(fieldDefRow(def))).toEqual(def);
  });
});
