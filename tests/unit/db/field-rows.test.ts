import { describe, expect, it } from "vitest";
import type { FieldValue } from "@meditaur/domain";
import { makeFieldOption } from "../../fixtures/library.ts";
import {
  fieldOptionFromRow,
  fieldOptionRow,
  fieldValueFromRow,
  fieldValueRow,
} from "../../../packages/db/src/field-rows.ts";

const VALUE: FieldValue = {
  entityId: "fp1",
  fieldDefId: "d1",
  text: "Root",
  revision: 2,
  updatedAt: 1_700_000_000_000,
  deletedAt: null,
};

describe("the field rows", () => {
  it("keys a value by the entity and the column, as the table does", () => {
    const row = fieldValueRow(VALUE);
    expect(Object.keys(row)).toContain("entity_id");
    expect(Object.keys(row)).toContain("field_def_id");
    expect(Object.keys(row)).not.toContain("entityId");
    // No `id`: a value is identified by what it hangs off and what it fills, which
    // is also why a change-set names the entity rather than the value.
    expect(Object.keys(row)).not.toContain("id");
  });

  it("carries no archive column for a value or an option", () => {
    // Neither table is archivable — a value is the state of a cell, and an option a
    // cell chose — so a pair that carried `archivedAt` would write a column that is
    // not there, which no round-trip can see.
    expect(Object.keys(fieldValueRow(VALUE))).not.toContain("archived_at");
    expect(Object.keys(fieldOptionRow(makeFieldOption()))).not.toContain("archived_at");
  });

  it("round-trips a value and an option unchanged", () => {
    const option = makeFieldOption({ deletedAt: null });
    expect(fieldValueFromRow(fieldValueRow(VALUE))).toEqual(VALUE);
    expect(fieldOptionFromRow(fieldOptionRow(option))).toEqual(option);
  });

  it("reads an older row as live, with nothing in the cell", () => {
    const row = fieldValueRow(VALUE);
    delete row.text;
    delete row.deleted_at;
    const read = fieldValueFromRow(row);
    expect(read.text).toBe("");
    expect(read.deletedAt).toBeNull();
  });
});
