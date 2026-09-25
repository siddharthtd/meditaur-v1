import { describe, expect, it } from "vitest";
import type {
  BinauralPreset,
  Entry,
  FieldDef,
  FieldOption,
  FieldValue,
  Meditation,
  Intention,
  MeditationType,
  Symbol,
} from "@meditaur/domain";
import type { LibraryView } from "@meditaur/application";
import { CATALOG_ERRORS } from "@meditaur/application";
import { CHAKRA_TYPE_ID, POINT_TYPE_ID } from "@meditaur/domain";
import {
  addColumn,
  addEntry,
  addKarunaRow,
  addLine,
  addMeditationLine,
  addRecord,
  addSentence,
  associateLine,
  columnHoldsValue,
  commitDatabaseDraft,
  draftFromLibrary,
  emptyRecord,
  karunaGroups,
  karunaOrder,
  linesOf,
  meditationEntry,
  meditationLines,
  moveItem,
  optionIsUsed,
  recordsOf,
  reindex,
  replaceRecords,
  rowIsVisible,
  sentenceRows,
  setEntriesOrder,
  visibleRows,
  type DatabaseWrites,
  type DraftState,
} from "../../../apps/web/src/features/database/database-model.ts";
import { meditationTableId } from "../../../apps/web/src/features/database/database-tables.ts";
import {
  makeEntries,
  makeEntry,
  makeFieldDef,
  makeMeditation,
  makeLibrary,
  makeMeditationType,
  makePlan,
  makePrefs,
  makeSymbol,
} from "../../fixtures/library.ts";

function viewOf(overrides: Partial<LibraryView> = {}): LibraryView {
  const library = makeLibrary({
    meditations: [makeMeditation("fp1", "Root", { sortOrder: 0 })],
    symbols: [makeSymbol("s1", "Lam"), makeSymbol("s2", "Earth")],
    ...makeEntries([
      { meditationId: "fp1", symbolId: "s1", texts: ["A", "B"] },
      { meditationId: "fp1", symbolId: "s2", texts: [] },
    ]),
  });
  return {
    ...library,
    plans: [],
    logs: [],
    sessionsThisWeek: 0,
    mediaAssets: [],
    ...overrides,
  };
}

/** A write log, so the tests can say what Save did and in what order. */
function writes(): DatabaseWrites & { log: string[] } {
  const log: string[] = [];
  return {
    log,
    async saveEntry(entry: Entry) {
      log.push(`entry:${entry.id}:${entry.meditationId ?? "-"}:${entry.symbolId ?? "-"}`);
      return entry;
    },
    async deleteEntry(_workspaceId, entryId) {
      log.push(`delete-entry:${entryId}`);
    },
    async saveLine(line: Intention) {
      log.push(`line:${line.id}:${line.text}`);
      return line;
    },
    async saveFieldDef(def: FieldDef) {
      log.push(`column:${def.id}:${def.label}`);
      return def;
    },
    async deleteFieldDef(_workspaceId, fieldDefId) {
      log.push(`delete-column:${fieldDefId}`);
    },
    async saveFieldOption(option: FieldOption) {
      log.push(`option:${option.id}:${option.label}`);
      return option;
    },
    async deleteFieldOption(_workspaceId, optionId) {
      log.push(`delete-option:${optionId}`);
    },
    async saveFieldValue(value: FieldValue) {
      log.push(`value:${value.entityId}:${value.fieldDefId}:${value.text}`);
      return value;
    },
    async saveMeditation(focus: Meditation) {
      log.push(`chakra:${focus.id}:${focus.name}`);
      return focus;
    },
    async saveSymbol(symbol: Symbol) {
      log.push(`symbol:${symbol.id}:${symbol.name}`);
      return symbol;
    },
    async savePreset(preset: BinauralPreset) {
      log.push(`preset:${preset.id}:${preset.name}`);
      return preset;
    },
    async saveMeditationType(row: MeditationType) {
      log.push(`type:${row.id}:${row.name}`);
      return row;
    },
    async reorderEntries(_workspaceId, entryIds) {
      log.push(`order:${entryIds.join(",")}`);
    },
    async reorderLines(_workspaceId, entryId, lineIds) {
      log.push(`line-order:${entryId}:${lineIds.join(",")}`);
    },
    async sweepOrphanedEntries(_workspaceId, entryIds) {
      log.push(`sweep:${entryIds.join(",")}`);
      return {
        swept: entryIds.map((id) => ({ id, label: `Root × ${id}` })),
        total: entryIds.length,
      };
    },
  };
}

function rowOf(draft: DraftState, id: string) {
  const row = draft.entries.find((item) => item.id === id);
  expect(row).toBeTruthy();
  return row!;
}

describe("the Database's draft", () => {
  it("starts from what the store holds, in the reader's order", () => {
    const draft = draftFromLibrary(viewOf());
    expect(draft.entries.map((row) => row.id)).toEqual(["e-fp1-s1", "e-fp1-s2"]);
    expect(draft.lines.map((row) => row.text)).toEqual(["A", "B"]);
    expect(draft.meditations.map((row) => row.name)).toEqual(["Root"]);
    expect(draft.symbols.map((row) => row.name)).toEqual(["Lam", "Earth"]);
  });

  it("hides a row whose chakra or symbol stepped aside, and shows it again on restore", () => {
    const draft = draftFromLibrary(viewOf());
    const hidden = {
      ...draft,
      meditations: draft.meditations.map((row) => ({ ...row, archivedAt: 5 })),
    };
    expect(visibleRows(hidden)).toEqual([]);
    expect(visibleRows(draft).map((row) => row.id)).toEqual(["e-fp1-s1", "e-fp1-s2"]);
  });

  it("keeps a symbol-only row visible while its chakra is archived", () => {
    const draft = draftFromLibrary(
      viewOf({
        ...makeEntries([{ meditationId: null, symbolId: "s1", texts: ["B"] }]),
      }),
    );
    const hidden = {
      ...draft,
      meditations: draft.meditations.map((row) => ({ ...row, archivedAt: 5 })),
    };
    expect(visibleRows(hidden).map((row) => row.id)).toEqual(["e-none-s1"]);
  });

  it("counts a draft value as a value when deciding whether a column can go", () => {
    let draft = draftFromLibrary(viewOf());
    const added = addColumn(draft, {
      scope: "symbol",
      label: "Notes",
      description: "",
      cellType: "text",
      refKind: null,
    });
    draft = added.draft;
    expect(columnHoldsValue(draft, added.column)).toBe(false);
    draft = {
      ...draft,
      values: { [`s1:${added.column.id}`]: "lam" },
    };
    expect(columnHoldsValue(draft, added.column)).toBe(true);
    // A value typed into another table's column is not this column's.
    expect(columnHoldsValue(draft, { ...added.column, id: "other" })).toBe(false);
  });

  it("knows an option a cell chose from one nothing chose", () => {
    let draft = draftFromLibrary(viewOf());
    const added = addColumn(draft, {
      scope: "symbol",
      label: "Element",
      description: "",
      cellType: "select",
      refKind: null,
    });
    draft = added.draft;
    const option = { id: "opt1", fieldDefId: added.column.id, label: "Earth", sortOrder: 0, isNew: true };
    expect(optionIsUsed({ ...draft, options: [option] }, option)).toBe(false);
    draft = { ...draft, values: { [`s1:${added.column.id}`]: "opt1" } };
    expect(optionIsUsed(draft, option)).toBe(true);
  });

  it("mints a column's key from its heading, once", () => {
    const draft = draftFromLibrary(viewOf());
    const added = addColumn(draft, {
      scope: "meditation",
      label: "Vedic mantra",
      description: "",
      cellType: "text",
      refKind: null,
    });
    expect(added.column.key).toBe("vedic-mantra");
    // A heading that collides with one of that table's own columns gets a suffix.
    const second = addColumn(added.draft, {
      scope: "meditation",
      label: "Vedic mantra",
      description: "",
      cellType: "text",
      refKind: null,
    });
    expect(second.column.key).toBe("vedic-mantra-2");
  });

  it("moves a row to where it was dropped and reindexes the list", () => {
    const rows = [
      { id: "a", sortOrder: 0 },
      { id: "b", sortOrder: 1 },
      { id: "c", sortOrder: 2 },
    ];
    expect(moveItem(rows, "c", 0).map((row) => row.id)).toEqual(["c", "a", "b"]);
    expect(moveItem(rows, "a", 2).map((row) => row.id)).toEqual(["b", "c", "a"]);
    expect(moveItem(rows, "missing", 0)).toBe(rows);
    expect(reindex(moveItem(rows, "c", 0)).map((row) => row.id)).toEqual(["c", "a", "b"]);
  });

  it("puts a new row at the foot, with the reader's next place", () => {
    const draft = addEntry(draftFromLibrary(viewOf()), { meditationId: "fp1", symbolId: null });
    const row = draft.entries[draft.entries.length - 1]!;
    expect(row.sortOrder).toBe(2);
    expect(row.isNew).toBe(true);
  });

  it("inserts a row where the heading `+` was pressed, and writes the order at once", () => {
    // §6.1: a row's own `+` inserts *there*. `addEntry` puts the new row at the
    // foot of its own list and carries it to the pressed row's place, so the order
    // it lands in is the order the list already reads — no second write, no
    // animation.
    const before = draftFromLibrary(viewOf());
    const after = addEntry({ ...before, entries: reindex(visibleRows(before)) }, undefined, 1);
    const ids = visibleRows(after).map((row) => row.id);
    const added = after.entries.find((row) => !before.entries.some((old) => old.id === row.id));
    expect(ids.length).toBe(3);
    expect(ids[1]).toBe(added?.id);
    expect(visibleRows(after).map((row) => row.sortOrder)).toEqual([0, 1, 2]);
  });

  it("inserts a column before the header that was pressed", () => {
    const before = draftFromLibrary(viewOf());
    const first = addColumn(before, {
      scope: "symbol",
      label: "First",
      description: "",
      cellType: "text",
      refKind: null,
    });
    const second = addColumn(
      first.draft,
      { scope: "symbol", label: "Second", description: "", cellType: "text", refKind: null },
      0,
    );
    const ordered = second.draft.columns
      .filter((row) => row.scope === "symbol")
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((row) => row.label);
    expect(ordered).toEqual(["Second", "First"]);
    expect(second.draft.columns.filter((row) => row.scope === "symbol").map((row) => row.sortOrder)).toEqual([
      0, 1,
    ]);
  });

  it("puts a new line at the foot of its row and nowhere else", () => {
    const draft = addLine(draftFromLibrary(viewOf()), "e-fp1-s1", "C");
    expect(linesOf(draft, "e-fp1-s1").map((row) => row.text)).toEqual(["A", "B", "C"]);
    expect(linesOf(draft, "e-fp1-s2")).toEqual([]);
  });

  it("keeps the record tables apart", () => {
    const draft = draftFromLibrary(viewOf());
    const renamed = replaceRecords(
      draft,
      "symbols",
      draft.symbols.map((row) => ({ ...row, name: `${row.name}!` })),
    );
    expect(renamed.symbols.map((row) => row.name)).toEqual(["Lam!", "Earth!"]);
    expect(renamed.meditations.map((row) => row.name)).toEqual(["Root"]);
  });

  it("reads a row's visibility from the draft's own records", () => {
    const draft = draftFromLibrary(viewOf());
    expect(rowIsVisible(draft, rowOf(draft, "e-fp1-s1"))).toBe(true);
    expect(rowIsVisible(draft, { ...rowOf(draft, "e-fp1-s1"), archivedAt: 9 })).toBe(false);
  });
});

describe("saving the draft", () => {
  it("writes only what changed, then the order, then sweeps what is left", async () => {
    const before = draftFromLibrary(viewOf());
    const port = writes();
    let draft = before;

    // One line edited, one row reordered, one row emptied.
    draft = {
      ...draft,
      entries: [
        { ...rowOf(draft, "e-fp1-s1"), sortOrder: 1 },
        { ...rowOf(draft, "e-fp1-s2"), sortOrder: 0 },
      ],
      lines: draft.lines.map((row) => (row.id === "e-fp1-s1-a0" ? { ...row, text: "A!" } : row)),
      meditations: draft.meditations,
    };
    const emptied = { ...rowOf(before, "e-fp1-s2"), meditationId: null, symbolId: null };
    draft = { ...draft, entries: draft.entries.map((row) => (row.id === emptied.id ? emptied : row)) };

    const report = await commitDatabaseDraft({
      writes: port,
      workspaceId: "ws1",
      before,
      draft,
    });

    expect(port.log).toEqual([
      // The reordered row is written because its place changed…
      "entry:e-fp1-s1:fp1:s1",
      // …the edited line is written…
      "line:e-fp1-s1-a0:A!",
      // …the orders are written after the rows and lines they order…
      "order:e-fp1-s1",
      "line-order:e-fp1-s1:e-fp1-s1-a0,e-fp1-s1-a1",
      // …and the emptied row is not written at all: it goes to the sweep, which
      // is the one thing the Save report names.
      "sweep:e-fp1-s2",
    ]);
    // The report carries a change-set beside the sweep's half now (`P2 · 4`), so these
    // compare the two fields they are about rather than the whole object.
    expect({ names: report.names, total: report.total }).toEqual({
      names: ["Root × e-fp1-s2"],
      total: 1,
    });
  });

  it("keeps a row the reader emptied and then filled in again before Save", async () => {
    const before = draftFromLibrary(viewOf());
    const port = writes();
    // Cleared, then a different symbol picked: the draft says it has a reference,
    // so Save writes it like any other row and the sweep is never asked about it.
    const draft = {
      ...before,
      entries: before.entries.map((row) =>
        row.id === "e-fp1-s1" ? { ...row, symbolId: "s2" } : row,
      ),
    };
    const report = await commitDatabaseDraft({
      writes: port,
      workspaceId: "ws1",
      before,
      draft,
    });
    expect(port.log).toContain("entry:e-fp1-s1:fp1:s2");
    expect(port.log.some((line) => line.startsWith("sweep:"))).toBe(true);
    expect(report.total).toBe(0);
  });

  it("writes a new row, its lines and its values", async () => {
    const before = draftFromLibrary(viewOf());
    const port = writes();
    let draft = addEntry(before, { meditationId: "fp1", symbolId: "s2" });
    const row = draft.entries[draft.entries.length - 1]!;
    draft = addLine(draft, row.id, "New line");
    const line = linesOf(draft, row.id)[0]!;
    draft = {
      ...draft,
      columns: [...draft.columns, { ...makeFieldDef({ id: "fd1", scope: "entry" }), isNew: false }],
      values: { [`${row.id}:fd1`]: "pair" },
    };
    await commitDatabaseDraft({ writes: port, workspaceId: "ws1", before, draft });
    expect(port.log).toContain(`entry:${row.id}:fp1:s2`);
    expect(port.log).toContain(`line:${line.id}:New line`);
    expect(port.log).toContain(`value:${row.id}:fd1:pair`);
  });

  it("saves a column and its options once, then leaves them alone", async () => {
    const before = draftFromLibrary(viewOf());
    const port = writes();
    const added = addColumn(before, {
      scope: "symbol",
      label: "Element",
      description: "",
      cellType: "select",
      refKind: null,
    });
    const option = {
      id: "opt1",
      fieldDefId: added.column.id,
      label: "Earth",
      sortOrder: 0,
      isNew: true,
    };
    const draft = { ...added.draft, options: [option] };
    await commitDatabaseDraft({ writes: port, workspaceId: "ws1", before, draft });
    expect(port.log.filter((line) => line.startsWith("column:"))).toHaveLength(1);
    expect(port.log.filter((line) => line.startsWith("option:"))).toHaveLength(1);
    // A second Save with nothing changed writes nothing at all.
    const port2 = writes();
    await commitDatabaseDraft({ writes: port2, workspaceId: "ws1", before, draft });
    expect(port2.log.filter((line) => line.startsWith("column:"))).toHaveLength(1);
  });

  it("writes a renamed record, and nothing for an untouched one", async () => {
    const before = draftFromLibrary(viewOf());
    const renamed = replaceRecords(
      before,
      "symbols",
      before.symbols.map((row) => (row.id === "s1" ? { ...row, name: "Lam!" } : row)),
    );
    const port = writes();
    await commitDatabaseDraft({
      writes: port,
      workspaceId: "ws1",
      before,
      draft: renamed,
    });
    expect(port.log.filter((line) => line.startsWith("symbol:"))).toEqual(["symbol:s1:Lam!"]);
    expect(port.log.some((line) => line.startsWith("chakra:"))).toBe(false);
    expect(port.log.some((line) => line.startsWith("preset:"))).toBe(false);
  });

  it("writes an archive flag as a row change, and nothing else", async () => {
    const before = draftFromLibrary(viewOf());
    const draft = {
      ...before,
      entries: before.entries.map((row) =>
        row.id === "e-fp1-s1" ? { ...row, archivedAt: 42 } : row,
      ),
    };
    const port = writes();
    await commitDatabaseDraft({ writes: port, workspaceId: "ws1", before, draft });
    expect(port.log.filter((line) => line.startsWith("entry:"))).toEqual([
      "entry:e-fp1-s1:fp1:s1",
    ]);
    // The lines are untouched: archiving hides a row, it does not dismantle it.
    expect(port.log.some((line) => line.startsWith("line:"))).toBe(false);
  });

  it("drops a draft row that never had a reference, and sweeps nothing", async () => {
    const before = draftFromLibrary(viewOf());
    const port = writes();
    // A row the reader started and never filled in. It was never stored, so Save
    // drops it — the sweep is for a row that *was* stored and lost its reference.
    const draft = {
      ...before,
      entries: [...before.entries, { ...makeEntry(null, null, 5), isNew: true }],
    };
    const report = await commitDatabaseDraft({
      writes: port,
      workspaceId: "ws1",
      before,
      draft,
    });
    expect(port.log.some((line) => line.startsWith("entry:") && line.includes("none"))).toBe(
      false,
    );
    expect(port.log).toContain("sweep:");
    expect({ names: report.names, total: report.total }).toEqual({ names: [], total: 0 });
  });

  it("sweeps a row that was stored and then left pointing at nothing", async () => {
    const before = draftFromLibrary(viewOf());
    const port = writes();
    const emptied = { ...rowOf(before, "e-fp1-s2"), meditationId: null, symbolId: null };
    const draft = {
      ...before,
      entries: before.entries.map((row) => (row.id === emptied.id ? emptied : row)),
    };
    const report = await commitDatabaseDraft({
      writes: port,
      workspaceId: "ws1",
      before,
      draft,
    });
    expect(port.log).toContain("sweep:e-fp1-s2");
    expect(report.total).toBe(1);
  });

  it("leaves a plan's own rows alone: the draft is the Database's, not the library's", async () => {
    const view = viewOf({ plans: [makePlan([])], logs: [], sessionsThisWeek: 0 });
    const before = draftFromLibrary(view);
    const port = writes();
    await commitDatabaseDraft({ writes: port, workspaceId: "ws1", before, draft: before });
    expect(
      port.log.every(
        (line) =>
          line.startsWith("order:") ||
          line.startsWith("line-order:") ||
          line.startsWith("sweep:"),
      ),
    ).toBe(true);
    expect(makePrefs()).toBeTruthy();
  });
});

/**
 * The owner's round 15: a type is a row, and the Database's tables follow the
 * rows. These are the model's half of that — the e2e suite proves the surfaces.
 */
describe("the Database's type tables", () => {
  /** Two types, and one meditation of each, from the one meditation list. */
  function twoTypes() {
    return viewOf({
      meditationTypes: [
        makeMeditationType(),
        makeMeditationType({ id: "ct2", name: "Points", sortOrder: 1 }),
      ],
      meditations: [makeMeditation("fp1", "Root"), makeMeditation("fp2", "Tip", { typeId: "ct2" })],
    });
  }

  it("draws a type's own meditations from the one list, and the Types table too", () => {
    const draft = draftFromLibrary(twoTypes());
    expect(recordsOf(draft, meditationTableId("ct1")).map((row) => row.name)).toEqual(["Root"]);
    expect(recordsOf(draft, meditationTableId("ct2")).map((row) => row.name)).toEqual(["Tip"]);
    expect(recordsOf(draft, "types").map((row) => row.name)).toEqual(["Chakras", "Points"]);
  });

  it("writes a new row into the type whose table it was added in", () => {
    const draft = draftFromLibrary(twoTypes());
    const { draft: next } = addRecord(draft, meditationTableId("ct2"), "ws1", [
      makeMeditationType(),
      makeMeditationType({ id: "ct2", name: "Points", sortOrder: 1 }),
    ]);
    // The one list gains the row, and the row names the table it came from —
    // which is what puts it in this table and no other.
    const added = next.meditations.find((row) => !draft.meditations.some((known) => known.id === row.id));
    expect(added?.source).toMatchObject({ typeId: "ct2" });
    expect(recordsOf(next, meditationTableId("ct2"))).toHaveLength(2);
    expect(recordsOf(next, meditationTableId("ct1"))).toHaveLength(1);
  });

  it("gives a column added in a type's table that type's id, so it cannot leak", () => {
    const draft = draftFromLibrary(twoTypes());
    const { column } = addColumn(draft, {
      scope: "meditation",
      label: "Governs",
      description: "",
      cellType: "text",
      refKind: null,
      typeId: "ct2",
    });
    expect(column.typeId).toBe("ct2");
    // …and a column added with no type is shared, which is the other half of §12.4.
    const shared = addColumn(draft, {
      scope: "meditation",
      label: "Notes",
      description: "",
      cellType: "text",
      refKind: null,
    });
    expect(shared.column.typeId).toBeNull();
  });

  it("saves a renamed type through the one write path", async () => {
    const draft = draftFromLibrary(twoTypes());
    const port = writes();
    await commitDatabaseDraft({
      writes: port,
      workspaceId: "ws1",
      before: draft,
      draft: {
        ...draft,
        types: draft.types.map((row) => (row.id === "ct1" ? { ...row, name: "Chakras 2" } : row)),
      },
    });
    expect(port.log).toContain("type:ct1:Chakras 2");
  });
});

/**
 * The Affirmations table (§5.2).
 *
 * Its rows are the draft's **lines**, not records: one list of sentences — the rows'
 * own and the orphans' together — so a sentence written here is the same row a
 * chakra's Intentions cell reads, and the Association cell is the only thing that
 * decides which one it is. The old model kept a second list of `DraftRecord`s whose
 * leading cell was the text, which is what these tests used to cover.
 */
describe("the Database's affirmations table", () => {
  /** An orphan: a sentence written about nothing yet (§2.1). */
  function makeOrphan(id: string, text: string, sortOrder = 0): Intention {
    return {
      id,
      workspaceId: "ws1",
      entryId: null,
      sortOrder,
      text,
      archivedAt: null,
      revision: 0,
      updatedAt: 0,
    };
  }

  /** The fixture's table, with one orphan already stored.
   *
   * The fixture's own lines all sit inside the Entries table's rows, so an orphan
   * has to be added to the view to be a stored one rather than a draft one.
   */
  function withOrphan(text = "I am calm") {
    const view = viewOf();
    return draftFromLibrary({
      ...view,
      intentions: [...view.intentions, makeOrphan("orphan1", text)],
    });
  }

  it("reads every sentence as a row, and pairs it with what it is written about", () => {
    const draft = withOrphan();
    const rows = sentenceRows(draft);
    // An orphan is its own group and sorts first, which is the order the
    // application hands the list over in — and the pair travels beside the line.
    expect(rows.map((row) => row.line.text)).toEqual(["I am calm", "A", "B"]);
    expect(rows[0]?.entry).toBeNull();
    expect(rows[1]?.entry?.id).toBe("e-fp1-s1");
  });

  it("leaves an archived sentence to the Archive page", () => {
    const draft = draftFromLibrary(viewOf());
    const archived = {
      ...draft,
      lines: draft.lines.map((row) => ({ ...row, archivedAt: 5 })),
    };
    expect(sentenceRows(archived)).toEqual([]);
  });

  it("adds a sentence as an orphan, and answers with its id", () => {
    const before = draftFromLibrary(viewOf());
    const { draft, id } = addSentence(before);
    expect(draft.lines.find((row) => row.id === id)).toMatchObject({
      entryId: null,
      text: "",
      isNew: true,
    });
    // It lands at the foot of the orphans, which is where a sentence with nothing
    // associated with it belongs.
    expect(sentenceRows(draft)[0]?.line.id).toBe(id);
  });

  it("points a sentence at the row for its pair, making that row once", () => {
    const { draft: withSentence, id } = addSentence(draftFromLibrary(viewOf()));
    // A pair the catalogue already has a row for: nothing is made.
    const onExisting = associateLine(withSentence, id, { meditationId: "fp1", symbolId: "s2" });
    expect(onExisting.entries).toHaveLength(withSentence.entries.length);
    expect(onExisting.lines.find((row) => row.id === id)?.entryId).toBe("e-fp1-s2");

    // A pair nothing is written about yet: exactly one row is added for it.
    const created = associateLine(withSentence, id, { meditationId: "fp1", symbolId: null });
    const made = created.entries[created.entries.length - 1]!;
    expect(made).toMatchObject({ meditationId: "fp1", symbolId: null, isNew: true });
    expect(created.lines.find((row) => row.id === id)?.entryId).toBe(made.id);

    // …and a second sentence for the same pair reuses it rather than making a
    // second row: two rows for one pair are what the store refuses (`entryExists`).
    const { draft: withTwo, id: second } = addSentence(created);
    const shared = associateLine(withTwo, second, { meditationId: "fp1", symbolId: null });
    expect(shared.entries.filter((row) => row.meditationId === "fp1" && !row.symbolId)).toHaveLength(1);
    expect(shared.lines.find((row) => row.id === second)?.entryId).toBe(made.id);
  });

  it("puts a sentence back among the orphans when both chips are cleared", () => {
    const { draft: withSentence, id } = addSentence(draftFromLibrary(viewOf()));
    const paired = associateLine(withSentence, id, { meditationId: "fp1", symbolId: "s1" });
    const cleared = associateLine(paired, id, { meditationId: null, symbolId: null });
    expect(cleared.lines.find((row) => row.id === id)?.entryId).toBeNull();
    expect(sentenceRows(cleared)[0]?.line.id).toBe(id);
    // The row it was written about is left alone: an association is a pointer, not
    // a move of the row's own sentences.
    expect(linesOf(cleared, "e-fp1-s1").map((row) => row.text)).toEqual(["A", "B"]);
  });

  it("writes a re-associated sentence, because its row is part of it", async () => {
    const before = draftFromLibrary(viewOf());
    const draft = {
      ...before,
      lines: before.lines.map((row) =>
        row.id === "e-fp1-s1-a0" ? { ...row, entryId: "e-fp1-s2" } : row,
      ),
    };
    const port = writes();
    await commitDatabaseDraft({ writes: port, workspaceId: "ws1", before, draft });
    expect(port.log).toContain("line:e-fp1-s1-a0:A");
  });

  it("writes a new sentence after the row it names", async () => {
    const before = draftFromLibrary(viewOf());
    const { draft: withSentence, id } = addSentence(before);
    const paired = associateLine(withSentence, id, { meditationId: "fp1", symbolId: null });
    const made = paired.entries[paired.entries.length - 1]!;
    const draft = {
      ...paired,
      lines: paired.lines.map((row) => (row.id === id ? { ...row, text: "Ground" } : row)),
    };
    const port = writes();
    const report = await commitDatabaseDraft({ writes: port, workspaceId: "ws1", before, draft });
    const entryWrite = port.log.indexOf(`entry:${made.id}:fp1:-`);
    const lineWrite = port.log.indexOf(`line:${id}:Ground`);
    // The row is written first: the line names it, and a line pointing at a row the
    // store has never seen is what `saveLine` refuses.
    expect(entryWrite).toBeGreaterThanOrEqual(0);
    expect(lineWrite).toBeGreaterThan(entryWrite);
    expect({ names: report.names, total: report.total }).toEqual({ names: [], total: 0 });
    // The other half of the answer (`P2 · 4`): the rows a screen patches from, named
    // here rather than found again by re-reading the store.
    expect(report.changes.updated.entries.map((row) => row.id)).toEqual([made.id]);
    expect(report.changes.updated.intentions.map((row) => row.id)).toEqual([id]);
  });

  it("refuses a blank sentence before it writes anything, so a half-saved draft is impossible", async () => {
    // The owner's round 20 report, reduced to the rule behind it: the point they made on
    // the spot survived Save while the sentence written for it did not, and all the screen
    // said was "Save failed". Every write in a commit is its own transaction, so the guard
    // has to run before the first one rather than where the store refuses the sentence.
    const before = draftFromLibrary(viewOf());
    const { draft: withSentence, id } = addSentence(before);
    const paired = associateLine(withSentence, id, { meditationId: "fp1", symbolId: null });
    const draft = {
      ...paired,
      lines: paired.lines.map((row) => (row.id === id ? { ...row, text: "   " } : row)),
    };
    const port = writes();
    await expect(
      commitDatabaseDraft({ writes: port, workspaceId: "ws1", before, draft }),
    ).rejects.toThrow(CATALOG_ERRORS.textRequired);
    expect(port.log, "not one row was written").toEqual([]);
  });

  it("gives a meditation made beside an affirmation the Points type", () => {
    // The owner's round 21 report: they typed a body part into an affirmation's meditation
    // chip, and the row arrived as the first live type — a chakra — so it was in the wrong
    // tab, its page drew the chakra-only fields, and the affirmation written for it read as
    // if it belonged to a chakra. The a sentence is about a place on the body.
    const types = viewOf().meditationTypes;
    const beside = emptyRecord("meditation", "ws1", types, "affirmations");
    expect((beside.source as Meditation).typeId).toBe(POINT_TYPE_ID);
    // Karuna's rows are chakra × symbol, so a row made there is a chakra…
    const karuna = emptyRecord("meditation", "ws1", types, "entries");
    expect((karuna.source as Meditation).typeId).toBe(CHAKRA_TYPE_ID);
    // …a meditation table still answers for itself, whatever the cell that asked…
    const inTable = emptyRecord(meditationTableId(POINT_TYPE_ID), "ws1", types);
    expect((inTable.source as Meditation).typeId).toBe(POINT_TYPE_ID);
    // …and a caller with no table at all keeps the reader's first type.
    expect((emptyRecord("meditation", "ws1", types).source as Meditation).typeId).toBe(
      types[0]!.id,
    );
    expect((emptyRecord("meditation", "ws1", types).source as Meditation).locationText).toBe("");
  });

  it("writes an orphan with no entry, and no order of its own to keep", async () => {
    const before = draftFromLibrary(viewOf());
    const { draft: withSentence, id } = addSentence(before);
    const draft = {
      ...withSentence,
      lines: withSentence.lines.map((row) => (row.id === id ? { ...row, text: "I am calm" } : row)),
    };
    const port = writes();
    await commitDatabaseDraft({ writes: port, workspaceId: "ws1", before, draft });
    expect(port.log).toContain(`line:${id}:I am calm`);
    // `reorderLines` takes an entry id, so a sentence written about nothing is not
    // in any order write — its own `sortOrder` is what the line write carries.
    expect(
      port.log.filter((line) => line.startsWith("line-order:")).every((line) => !line.includes(id)),
    ).toBe(true);
  });
});

/**
 * Karuna (§5.1) and the meditation tables' own `Intentions` cell (§5.3).
 *
 * The two belong together: a meditation's own row — the one with no symbol — is
 * what its `Intentions` cell writes into *and* what its Karuna table draws, so a
 * test that changes one of those rules without the other fails here.
 */
describe("Karuna", () => {
  /**
   * Two types and three meditations, so the *order* of the headings is testable as
   * well as their set:
   *
   * - Root (Chakra) has two pairs and its own symbol-less row;
   * - Heart (Chakra) has nothing but its own row, so it is not a heading at all;
   * - Liver (Point) has one pair, and comes after both chakras despite being first
   *   in its own type — a meditation's `sortOrder` is its place *inside* its type;
   * - one row names a symbol and no meditation, which is the heading that has no
   *   meditation to be named by.
   */
  function karunaView(): LibraryView {
    const library = makeLibrary({
      meditationTypes: [
        makeMeditationType({ id: "ct1", name: "Chakras", sortOrder: 0 }),
        makeMeditationType({ id: "pt1", name: "Points", sortOrder: 1 }),
      ],
      meditations: [
        makeMeditation("fp1", "Root", { typeId: "ct1", sortOrder: 0 }),
        makeMeditation("fp2", "Heart", { typeId: "ct1", sortOrder: 1 }),
        makeMeditation("fp3", "Liver", { typeId: "pt1", sortOrder: 0 }),
      ],
      symbols: [makeSymbol("s1", "Lam"), makeSymbol("s2", "Earth")],
      ...makeEntries([
        { meditationId: "fp1", symbolId: "s1", texts: ["A"] },
        { meditationId: "fp1", symbolId: "s2", texts: ["B"] },
        { meditationId: "fp1", symbolId: null, texts: ["Root alone"] },
        { meditationId: "fp2", symbolId: null, texts: ["Heart alone"] },
        { meditationId: "fp3", symbolId: "s1", texts: ["C"] },
        { meditationId: null, symbolId: "s2", texts: ["No heading"] },
      ]),
    });
    return {
      ...library,
      plans: [],
      logs: [],
      sessionsThisWeek: 0,
      mediaAssets: [],
    };
  }

  it("heads a table for every meditation with a pair, in type order", () => {
    expect(karunaGroups(draftFromLibrary(karunaView())).map((group) => group.name)).toEqual([
      "Root",
      "Liver",
      "No meditation",
    ]);
  });

  it("draws the meditation's own row as well, because it is a real row", () => {
    const root = karunaGroups(draftFromLibrary(karunaView()))[0]!;
    expect(root.rows.map((row) => row.symbolId)).toEqual(["s1", "s2", null]);
  });

  it("puts a row with no meditation under a heading that says so, and last", () => {
    const groups = karunaGroups(draftFromLibrary(karunaView()));
    const unowned = groups[groups.length - 1]!;
    expect(unowned.meditationId).toBeNull();
    expect(unowned.rows.map((row) => row.symbolId)).toEqual(["s2"]);
  });


  it("gives the `＋` the meditation's own row, and never a second row for one pair", () => {
    const draft = draftFromLibrary(karunaView());
    // Root's own row is there already, so the press asks for a row that exists: a
    // second one for the same pair is what the store refuses (`entryExists`).
    const again = addKarunaRow(draft, "fp1", 0);
    expect(
      again.entries.filter((row) => row.meditationId === "fp1" && row.symbolId === null),
    ).toHaveLength(1);

    // Liver has a pair and no own row, so the press makes one — the same row its own
    // `Intentions` cell would make — and puts it after the pair, where it was asked
    // for.
    const made = addKarunaRow(draft, "fp3", 1);
    expect(
      made.entries.filter((row) => row.meditationId === "fp3" && row.symbolId === null),
    ).toHaveLength(1);
    expect(
      karunaGroups(made)
        .find((group) => group.meditationId === "fp3")!
        .rows.map((row) => row.symbolId),
    ).toEqual(["s1", null]);
  });

  it("keeps a drop inside its heading, and leaves every other heading's rows alone", () => {
    const draft = draftFromLibrary(karunaView());
    const groups = karunaGroups(draft);
    const root = groups.find((group) => group.meditationId === "fp1")!;
    const swapped = [root.rows[1]!, root.rows[0]!, root.rows[2]!];
    const after = setEntriesOrder(
      draft,
      groups.flatMap((group) =>
        group.meditationId === "fp1"
          ? swapped.map((row) => row.id)
          : group.rows.map((row) => row.id),
      ),
    );
    expect(karunaOrder(after).slice(0, 3)).toEqual(swapped.map((row) => row.id));
    expect(
      karunaGroups(after).find((group) => group.meditationId === "fp3")!.rows.map((row) => row.symbolId),
    ).toEqual(["s1"]);
    // A row the drawing does not name — a meditation whose only row is its own — is
    // not dropped from the list by a move somewhere else.
    expect(after.entries).toHaveLength(draft.entries.length);
  });

  it("writes a meditation's first sentence, making the row that holds it", () => {
    const draft = draftFromLibrary(viewOf());
    expect(meditationLines(draft, "fp1")).toEqual([]);

    const { draft: withLine } = addMeditationLine(draft, "fp1", "I am rooted");
    expect(meditationEntry(withLine, "fp1")).toMatchObject({
      meditationId: "fp1",
      symbolId: null,
      isNew: true,
    });
    expect(meditationLines(withLine, "fp1").map((row) => row.text)).toEqual(["I am rooted"]);

    // The second press uses the row the first one made rather than making another.
    const { draft: withTwo } = addMeditationLine(withLine, "fp1", "And calm");
    expect(
      withTwo.entries.filter((row) => row.meditationId === "fp1" && row.symbolId === null),
    ).toHaveLength(1);
    expect(meditationLines(withTwo, "fp1").map((row) => row.text)).toEqual([
      "I am rooted",
      "And calm",
    ]);
  });

  it("holds the meditation's symbol-less lines and not its pairs'", () => {
    const draft = draftFromLibrary(karunaView());
    expect(meditationLines(draft, "fp1").map((row) => row.text)).toEqual(["Root alone"]);
    expect(linesOf(draft, "e-fp1-s1").map((row) => row.text)).toEqual(["A"]);
  });

  it("writes a meditation's new sentence after the row it names", async () => {
    const before = draftFromLibrary(viewOf());
    const { draft } = addMeditationLine(before, "fp1", "I am rooted");
    const made = meditationEntry(draft, "fp1")!;
    const port = writes();
    await commitDatabaseDraft({ writes: port, workspaceId: "ws1", before, draft });
    const entryWrite = port.log.indexOf(`entry:${made.id}:fp1:-`);
    const lineWrite = port.log.findIndex((line) => line.endsWith(":I am rooted"));
    expect(entryWrite).toBeGreaterThanOrEqual(0);
    expect(lineWrite).toBeGreaterThan(entryWrite);
  });
});
