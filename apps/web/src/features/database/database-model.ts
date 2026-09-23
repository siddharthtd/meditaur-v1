import { fieldKeyFor, newRowVersion, type LibraryView } from "@meditaur/application";
import {
  copyStages,
  createId,
  DEFAULT_FOCUS_DURATION_MS,
  defaultEarEq,
  INTENTION_STAGES,
  type BinauralPreset,
  type CellType,
  type Entry,
  type FieldDef,
  type FieldOption,
  type FieldScope,
  type FieldValue,
  type Meditation,
  type Intention,
  type MeditationType,
  type RefKind,
  type Symbol,
} from "@meditaur/domain";
import type { DatabaseTable } from "./database-tables";
import { meditationTableTypeId } from "./database-tables";
import { liveTypes } from "../library/library-model";

/**
 * The Database's draft.
 *
 * §7: the Database holds a draft while the reader is on the screen, and **Save**
 * commits it — changed rows, lines and order, new or changed columns and options,
 * then the orphan sweep. Leaving discards, which is the one place in this app
 * where that is true, and why leaving is interrupted rather than silently
 * forgetting (§12.24).
 *
 * The model is deliberately plain data with pure helpers beside it: the grid is a
 * view of this, the commit below is the only thing that writes, and both are
 * testable without a browser.
 */
export type DraftEntry = {
  id: string;
  meditationId: string | null;
  symbolId: string | null;
  sortOrder: number;
  archivedAt: number | null;
  /** False until Save stores it, so the sweep can tell a draft from a row. */
  isNew: boolean;
};

export type DraftLine = {
  id: string;
  /**
   * The row this sentence is written about, or `null` for an **orphan**: a
   * sentence that exists and is about nothing yet, which is what the Affirmations
   * table holds until something is associated with it (§2.1).
   */
  entryId: string | null;
  text: string;
  sortOrder: number;
  archivedAt: number | null;
  isNew: boolean;
};

/**
 * One row of a record table (Chakras, Symbols, Presets).
 *
 * A record's own fields are edited where they have always been edited — the record
 * view, which is that record's editor — so the grid carries the ones a table shows:
 * the name, the builtins that table has, and the payload a preset needs to be
 * written back whole.
 */
export type DraftRecord = {
  id: string;
  isNew: boolean;
  sortOrder: number;
  archivedAt: number | null;
  name: string;
  /** Builtin text columns by key: `location`, `description`, `usage`. */
  builtins: Record<string, string>;
  /**
   * The record's own non-text fields, shown as columns rather than on a page.
   *
   * The owner's answer to where a chakra's picture, default sound and binaural
   * setting live now that `Add` and `Edit` land in the grid: *"Add them as columns
   * in the Chakras table."* They are lifted out of `source` so the row can be
   * *compared* — `sameRecord` is what decides whether Save writes at all, and a
   * change buried inside `source` is invisible to it.
   */
  pictureAssetId: string | null;
  defaultBinauralPresetId: string | null;
  binauralEnabled: boolean;
  /** The stored record, for the fields this table does not show as columns. */
  source: Meditation | Symbol | BinauralPreset | MeditationType;
};

export type DraftColumn = {
  id: string;
  scope: FieldScope;
  /**
   * The type this column belongs to, or `null` for every type.
   *
   * It is not edited in the grid — a column is added to the table the reader is
   * looking at, and round 15's second phase turns each type into a table of its own — but it travels
   * through the draft so a stored column is written back with the type it had
   * rather than silently widened to every type.
   */
  typeId: string | null;
  key: string;
  label: string;
  description: string;
  cellType: CellType;
  refKind: RefKind | null;
  sortOrder: number;
  isNew: boolean;
};

export type DraftOption = {
  id: string;
  fieldDefId: string;
  label: string;
  sortOrder: number;
  isNew: boolean;
};

/** `${entityId}:${fieldDefId}` → the stored text. An empty string means no value. */
export type DraftValues = Record<string, string>;

export type DraftState = {
  entries: DraftEntry[];
  /**
   * The one list of sentences (§2.1): the rows' own lines and the orphans
   * together. A row's Intentions cell draws its own, the Affirmations table draws
   * every one of them, and both write here — so a sentence has one home and one
   * write path rather than one per surface.
   */
  lines: DraftLine[];
  /**
   * Every meditation, whatever type it belongs to. A type's table shows the ones
   * whose `typeId` is that type — the split is a filter, not a second store.
   */
  meditations: DraftRecord[];
  symbols: DraftRecord[];
  presets: DraftRecord[];
  /** One row per meditation type: the Types table (§8, §12.6). */
  types: DraftRecord[];
  columns: DraftColumn[];
  options: DraftOption[];
  values: DraftValues;
};

export function valueKey(entityId: string, fieldDefId: string): string {
  return `${entityId}:${fieldDefId}`;
}

function meditationRecord(row: Meditation): DraftRecord {
  return {
    id: row.id,
    isNew: false,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt,
    name: row.name,
    builtins: { location: row.locationText },
    pictureAssetId: row.representationAssetId,
    defaultBinauralPresetId: row.defaultBinauralPresetId,
    binauralEnabled: row.binauralEnabled,
    source: row,
  };
}

function symbolRecord(row: Symbol): DraftRecord {
  return {
    id: row.id,
    isNew: false,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt,
    name: row.name,
    builtins: { description: row.description, usage: row.usage },
    pictureAssetId: row.imageAssetId,
    defaultBinauralPresetId: null,
    binauralEnabled: true,
    source: row,
  };
}

function presetRecord(row: BinauralPreset): DraftRecord {
  return {
    id: row.id,
    isNew: false,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt,
    name: row.name,
    builtins: {},
    pictureAssetId: null,
    defaultBinauralPresetId: null,
    binauralEnabled: true,
    source: row,
  };
}

/**
 * A meditation type as a row of the Types table (§12.6).
 *
 * The table shows a name and an order, because that is what this phase gives a
 * type; its stage template and its columns are edited elsewhere (round 15, 2026-09-19), and
 * they live on `source` so a save writes the row back whole.
 */
function typeRecord(row: MeditationType): DraftRecord {
  return {
    id: row.id,
    isNew: false,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt,
    name: row.name,
    builtins: {},
    pictureAssetId: null,
    defaultBinauralPresetId: null,
    binauralEnabled: true,
    source: row,
  };
}

/** Which type a record row is a meditation of, or `null` when it is not one. */
export function recordMeditationTypeId(record: DraftRecord): string | null {
  const source = record.source as Partial<Meditation>;
  return typeof source.typeId === "string" ? source.typeId : null;
}

/** The draft the reader starts from: what the store holds, in the reader's order. */
export function draftFromLibrary(view: LibraryView): DraftState {
  const values: DraftValues = {};
  for (const row of view.fieldValues) {
    values[valueKey(row.entityId, row.fieldDefId)] = row.text;
  }
  return {
    entries: view.entries.map((row) => ({
      id: row.id,
      meditationId: row.meditationId,
      symbolId: row.symbolId,
      sortOrder: row.sortOrder,
      archivedAt: row.archivedAt,
      isNew: false,
    })),
    lines: view.intentions.map((row) => ({
      id: row.id,
      entryId: row.entryId,
      text: row.text,
      sortOrder: row.sortOrder,
      archivedAt: row.archivedAt,
      isNew: false,
    })),
    meditations: view.meditations.map(meditationRecord),
    symbols: view.symbols.map(symbolRecord),
    presets: view.presets.map(presetRecord),
    types: view.meditationTypes.map(typeRecord),
    columns: view.fieldDefs.map((row) => ({
      id: row.id,
      scope: row.scope,
      key: row.key,
      label: row.label,
      description: row.description,
      cellType: row.cellType,
      refKind: row.refKind,
      typeId: row.typeId,
      sortOrder: row.sortOrder,
      isNew: false,
    })),
    options: view.fieldOptions.map((row) => ({
      id: row.id,
      fieldDefId: row.fieldDefId,
      label: row.label,
      sortOrder: row.sortOrder,
      isNew: false,
    })),
    values,
  };
}

/**
 * The rows a table draws.
 *
 * A type's table is a **filter** over the one meditation list rather than a
 * separate store: which table a meditation is in *is* its `typeId`, so there is
 * nothing to keep in step.
 */
export function recordsOf(draft: DraftState, table: DatabaseTable): DraftRecord[] {
  if (table === "symbols") return draft.symbols;
  if (table === "presets") return draft.presets;
  if (table === "types") return draft.types;
  const typeId = meditationTableTypeId(table);
  if (typeId) return draft.meditations.filter((row) => recordMeditationTypeId(row) === typeId);
  return [];
}

export function replaceRecords(
  draft: DraftState,
  table: DatabaseTable,
  records: DraftRecord[],
): DraftState {
  if (table === "symbols") return { ...draft, symbols: records };
  if (table === "presets") return { ...draft, presets: records };
  if (table === "types") return { ...draft, types: records };
  const typeId = meditationTableTypeId(table);
  if (!typeId) return draft;
  // Only this type's rows are replaced; the other types' rows keep their place in
  // the one list, so a save on one table cannot reindex another's order.
  const rest = draft.meditations.filter((row) => recordMeditationTypeId(row) !== typeId);
  return { ...draft, meditations: [...rest, ...records] };
}

/**
 * One group's sentences, in order: a row's own lines, or — with `null` — the
 * orphans the Affirmations table holds (§2.1).
 */
export function linesOf(draft: DraftState, entryId: string | null): DraftLine[] {
  return draft.lines
    .filter((row) => row.entryId === entryId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

/**
 * The row a meditation's **own** sentences hang off: the pair that names it and no
 * symbol (§5.3, §2.4).
 *
 * A chakra's symbol-less lines need a row to belong to, and that row is a pair like
 * any other — the store insists on one row per pair (`entryExists`), which is why
 * this is a lookup and never a second home for the lines. `null` is "the reader has
 * never written about this meditation on its own", which is a state and not a hole.
 */
export function meditationEntry(draft: DraftState, meditationId: string): DraftEntry | null {
  return (
    draft.entries.find(
      (row) => row.meditationId === meditationId && row.symbolId === null && row.archivedAt == null,
    ) ?? null
  );
}

/**
 * A meditation's own sentences, in order — what its `Intentions` cell holds.
 *
 * Asking creates nothing: a meditation with no such row has no lines, which is what
 * its cell draws as the empty invitation until the reader presses `＋`.
 */
export function meditationLines(draft: DraftState, meditationId: string): DraftLine[] {
  const entry = meditationEntry(draft, meditationId);
  return entry ? linesOf(draft, entry.id) : [];
}

/**
 * `＋` on a meditation's own Intentions cell: the line, and the row to hold it if
 * this is the first one (§5.3).
 *
 * A row the reader has never written about does not exist, so the press makes it —
 * which is what leaves a chakra one tap from a sentence instead of a page of setup.
 * `addEntry` and `addLine` both append, so the row and the line are the last of
 * each, and the line's id comes back because the caller is what puts the caret in
 * it.
 */
export function addMeditationLine(
  draft: DraftState,
  meditationId: string,
  text = "",
): { draft: DraftState; lineId: string } {
  const known = meditationEntry(draft, meditationId);
  const withRow = known ? draft : addEntry(draft, { meditationId, symbolId: null });
  const entryId = known?.id ?? withRow.entries[withRow.entries.length - 1]!.id;
  const withLine = addLine(withRow, entryId, text);
  return { draft: withLine, lineId: withLine.lines[withLine.lines.length - 1]!.id };
}

/** A sentence as the Affirmations table draws it: the line, and the pair it is
 *  written about — `null` for the orphan (§5.2). */
export type SentenceRow = { line: DraftLine; entry: DraftEntry | null };

/**
 * Every live sentence in the workspace, in the order the Affirmations table draws
 * them (§5.2).
 *
 * The table is the one surface for **every** sentence, so it reads the lines
 * themselves rather than the rows they hang off: an orphan has no row to be read
 * from, and a sentence whose row is hidden is still a sentence the reader wrote.
 * The order is the store's — a sentence's place is its place inside its group,
 * which is what a reload restores — and the archived ones belong to the Archive
 * page, exactly as an archived row does in Karuna.
 */
export function sentenceRows(draft: DraftState): SentenceRow[] {
  return draft.lines
    .filter((line) => line.archivedAt == null)
    .sort(
      (a, b) =>
        (a.entryId ?? "").localeCompare(b.entryId ?? "") ||
        a.sortOrder - b.sortOrder ||
        a.id.localeCompare(b.id),
    )
    .map((line) => ({
      line,
      entry: line.entryId ? (draft.entries.find((row) => row.id === line.entryId) ?? null) : null,
    }));
}

/**
 * A new sentence, written about nothing yet (§5.2).
 *
 * It is a draft line like any other and reaches the store only through Save, so
 * the id comes back with it: the caller is what puts the caret in it.
 */
export function addSentence(draft: DraftState): { draft: DraftState; id: string } {
  const id = createId();
  const row: DraftLine = {
    id,
    entryId: null,
    text: "",
    sortOrder:
      draft.lines
        .filter((line) => line.entryId === null)
        .reduce((max, line) => Math.max(max, line.sortOrder), -1) + 1,
    archivedAt: null,
    isNew: true,
  };
  return { draft: { ...draft, lines: [...draft.lines, row] }, id };
}

/**
 * Change what a sentence is written about (§5.2) — the whole of the Association
 * cell, and the reason the Affirmations table and a row's Intentions cell cannot
 * disagree.
 *
 * The pair **is** the row, so a pick finds the draft's row for it and makes one
 * when the reader has never written about that pair before. Two rows for one pair
 * are therefore impossible by construction, which is what the store insists on
 * anyway (`entryExists`) and what makes "find or create" the only correct answer.
 * Both halves empty puts the sentence back among the orphans — the state the table
 * exists to show.
 */
export function associateLine(
  draft: DraftState,
  lineId: string,
  next: { meditationId: string | null; symbolId: string | null },
): DraftState {
  const line = draft.lines.find((row) => row.id === lineId);
  if (!line) return draft;
  if (!next.meditationId && !next.symbolId) {
    return {
      ...draft,
      lines: draft.lines.map((row) => (row.id === lineId ? { ...row, entryId: null } : row)),
    };
  }
  const found = draft.entries.find(
    (row) => row.meditationId === next.meditationId && row.symbolId === next.symbolId,
  );
  const made = found ? draft : addEntry(draft, next);
  const entryId = found?.id ?? made.entries[made.entries.length - 1]!.id;
  // The sentence takes the foot of its new group: the place it held among the
  // orphans means nothing there, and a sentence the reader has just associated
  // must not land above the ones that were already written about that row.
  const sortOrder =
    draft.lines.reduce(
      (max, row) => (row.entryId === entryId ? Math.max(max, row.sortOrder) : max),
      -1,
    ) + 1;
  return {
    ...draft,
    entries: made.entries,
    lines: draft.lines.map((row) => (row.id === lineId ? { ...row, entryId, sortOrder } : row)),
  };
}

/**
 * A scope's columns, narrowed to one type's pool when a type is named (§12.4).
 *
 * `typeId === null` means "every type's columns", which is what a table that is
 * not a type's — Symbols, Karuna — draws.
 */
export function columnsOf(
  draft: DraftState,
  scope: FieldScope,
  typeId: string | null = null,
): DraftColumn[] {
  return draft.columns
    .filter(
      (row) => row.scope === scope && (typeId == null || row.typeId == null || row.typeId === typeId),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

export function optionsOf(draft: DraftState, fieldDefId: string): DraftOption[] {
  return draft.options
    .filter((row) => row.fieldDefId === fieldDefId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

/** A row's visible state: the visibility rule, over the draft (§3.1). */
export function rowIsVisible(draft: DraftState, row: DraftEntry): boolean {
  if (row.archivedAt != null) return false;
  if (row.meditationId) {
    const focus = draft.meditations.find((item) => item.id === row.meditationId);
    if (!focus || focus.archivedAt != null) return false;
  }
  if (row.symbolId) {
    const symbol = draft.symbols.find((item) => item.id === row.symbolId);
    if (!symbol || symbol.archivedAt != null) return false;
  }
  return true;
}

/** The rows the grid draws, in order. */
export function visibleRows(draft: DraftState): DraftEntry[] {
  return draft.entries
    .filter((row) => rowIsVisible(draft, row))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

/**
 * The meditations in the order the catalogue reads them: their type first, then
 * their own place in it.
 *
 * A meditation's `sortOrder` is its place **inside its type** — the tables are a
 * filter over the one list, so two types number from zero independently — which is
 * why the type has to be ranked first rather than the two orders being mixed.
 */
function meditationOrder(draft: DraftState): DraftRecord[] {
  const typeRank = new Map(
    [...draft.types]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
      .map((row, index) => [row.id, index]),
  );
  return draft.meditations
    .filter((row) => row.archivedAt == null)
    .sort(
      (a, b) =>
        (typeRank.get(recordMeditationTypeId(a) ?? "") ?? 0) -
          (typeRank.get(recordMeditationTypeId(b) ?? "") ?? 0) ||
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name),
    );
}

/** One heading of Karuna: the meditation it belongs to, and the rows under it. */
export type KarunaGroup = {
  /** The meditation, or `null` for the rows whose heading is missing (§5.1). */
  meditationId: string | null;
  name: string;
  rows: DraftEntry[];
};

/** A group's rows, in the order they are drawn: they are a list like any other's. */
function rowsInOrder(rows: DraftEntry[]): DraftEntry[] {
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

/**
 * Karuna's tables, in the order they are drawn (§5.1).
 *
 * A meditation is offered when it has at least one **symbol-carrying** row: the
 * owner's rule, said generally, so a chakra is a table and a point with no such row
 * is not — a heading with nothing under it is a table that should not have been
 * drawn.
 *
 * A group then draws **every** one of that meditation's rows, its symbol-less one
 * included. That row is a real row — the one the meditation's own `Intentions` cell
 * writes into — and leaving it out would be a row the reader can neither see nor
 * make from here, since a new row is a row of *this* meditation and the store
 * refuses a second row for one pair (`entryExists`).
 *
 * The rows with **no** meditation come last rather than nowhere: a row is not
 * dropped for having an empty heading, and naming the group is what says what is
 * missing.
 */
export function karunaGroups(draft: DraftState): KarunaGroup[] {
  const rows = visibleRows(draft);
  const groups: KarunaGroup[] = [];
  for (const record of meditationOrder(draft)) {
    const own = rows.filter((row) => row.meditationId === record.id);
    if (!own.some((row) => row.symbolId !== null)) continue;
    groups.push({ meditationId: record.id, name: record.name, rows: rowsInOrder(own) });
  }
  const unowned = rows.filter((row) => row.meditationId === null);
  if (unowned.length > 0) {
    groups.push({ meditationId: null, name: "No meditation", rows: rowsInOrder(unowned) });
  }
  return groups;
}

/**
 * The headings Karuna draws for the meditation the reader picked.
 *
 * `null` is "no filter" — the whole stack — and the **unowned** heading (the
 * sentences written about a symbol and no meditation) has a `meditationId` of
 * `null` too. Matching those two on the id alone made "no filter" select that one
 * heading: a single symbol-only sentence collapsed the whole stack to itself, with
 * no way back, because the selector's options all name a meditation and pressing
 * `✕` sets the choice back to `null`. So the two are told apart here, by the
 * caller's intent, and the unowned heading is only ever drawn as part of the stack.
 * It is deliberately not an option in the selector for the same reason: there is no
 * id a reader could name it by.
 */
export function karunaSelection(
  groups: KarunaGroup[],
  meditationId: string | null,
): KarunaGroup[] {
  if (meditationId === null) return groups;
  const picked = groups.find((group) => group.meditationId === meditationId);
  return picked ? [picked] : groups;
}

/**
 * The store's one entry list, rewritten in the order the grid draws it.
 *
 * A row's place is its place **inside its group** (§5.1) — the order a drop inside a
 * heading was made in — so the drawing is what says where each row sits, and writing
 * the whole list from it keeps one order rather than two that have to agree. A row
 * the drawing did not name keeps its stored place at the foot instead of being
 * dropped out of the list.
 */
export function setEntriesOrder(draft: DraftState, ids: string[]): DraftState {
  const place = new Map(ids.map((id, index) => [id, index]));
  const ordered = [...draft.entries].sort(
    (a, b) => (place.get(a.id) ?? ids.length) - (place.get(b.id) ?? ids.length),
  );
  return { ...draft, entries: reindex(ordered) };
}

/** Every row the drawing names, in the order it draws them — what
 *  `setEntriesOrder` takes after a drop or an insert. */
export function karunaOrder(draft: DraftState): string[] {
  return karunaGroups(draft).flatMap((group) => group.rows.map((row) => row.id));
}

/**
 * `＋` in one of Karuna's headings: the meditation's **own** row, made when it has
 * none (§5.1, §5.3).
 *
 * A new row is a pair, and a pair is unique — the store refuses a second row for one
 * (`entryExists`) — so a heading has exactly one symbol-less row: the one the
 * meditation's own `Intentions` cell writes into. The press asks for *that* row,
 * which is what keeps the two surfaces on one row instead of racing to make two of
 * it. A row that is already there keeps the place it has, because a press is not a
 * move; only a row this press makes lands where it was pressed.
 */
export function addKarunaRow(
  draft: DraftState,
  meditationId: string | null,
  at: number,
): DraftState {
  const group = karunaGroups(draft).find((item) => item.meditationId === meditationId);
  if (group?.rows.some((row) => row.symbolId === null)) return draft;
  const rows = group?.rows ?? [];
  const before = rows[at - 1]?.sortOrder;
  const after = rows[at]?.sortOrder;
  const row: DraftEntry = {
    id: createId(),
    meditationId,
    symbolId: null,
    // Between its neighbours, so the row lands where the press was whatever the
    // stored order looks like: `setEntriesOrder` below is what makes it dense.
    sortOrder: before === undefined ? (after ?? 1) - 1 : after === undefined ? before + 1 : (before + after) / 2,
    archivedAt: null,
    isNew: true,
  };
  const withRow: DraftState = { ...draft, entries: [...draft.entries, row] };
  return setEntriesOrder(withRow, karunaOrder(withRow));
}

/**
 * Whether a column holds anything.
 *
 * The rule that decides if the header's `X` is drawn at all (§4): a column with a
 * value in any row cannot be removed, and a control that cannot do anything is not
 * drawn. A draft value counts — it is about to be stored.
 */
export function columnHoldsValue(draft: DraftState, def: DraftColumn): boolean {
  return Object.entries(draft.values).some(
    ([key, text]) => text.trim().length > 0 && key.endsWith(`:${def.id}`),
  );
}

export function optionIsUsed(draft: DraftState, option: DraftOption): boolean {
  return Object.entries(draft.values).some(
    ([key, text]) => text === option.id && key.endsWith(`:${option.fieldDefId}`),
  );
}

export function addColumn(
  draft: DraftState,
  input: {
    scope: FieldScope;
    label: string;
    description: string;
    cellType: CellType;
    refKind: RefKind | null;
    /**
     * The type the column is added to, or `null` for every type.
     *
     * A column added while a type's table is open belongs to that type, which is
     * what keeps a Thanks Giving column off a Protection row (§12.4). The scope
     * and the type together are a column's pool.
     */
    typeId?: string | null;
  },
  at?: number,
): { draft: DraftState; column: DraftColumn } {
  const scope = draft.columns.filter((row) => row.scope === input.scope);
  const column: DraftColumn = {
    id: createId(),
    scope: input.scope,
    typeId: input.typeId ?? null,
    key: "",
    label: input.label,
    description: input.description,
    cellType: input.cellType,
    refKind: input.cellType === "reference" ? (input.refKind ?? "meditation") : null,
    sortOrder: scope.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1,
    isNew: true,
  };
  // The key is derived from the heading, once, exactly as the application does when
  // it stores the column — the grid needs it before Save so a cell can be typed
  // into immediately (§6.4). A column added in place has no heading yet, so it has
  // no key yet either: freezing `field` onto a column the reader is about to call
  // `Element` is a key nobody would ever choose. `renameColumn` mints it when the
  // heading is first written, and an unnamed column is never stored at all.
  column.key = column.label.trim()
    ? fieldKeyFor(
        { id: column.id, label: column.label, scope: column.scope },
        draft.columns.map((row) => ({ id: row.id, key: row.key, scope: row.scope })),
      )
    : "";
  const columns = [...draft.columns, column];
  // §6.1's heading `+`: the column lands where it was asked for, not at the foot.
  // The order is written now and Save reads it, like every other order here.
  const ordered =
    at === undefined
      ? columns
      : reindex(moveItem(columns.filter((row) => row.scope === input.scope), column.id, at));
  const rest = columns.filter((row) => row.scope !== input.scope);
  return { draft: { ...draft, columns: [...ordered, ...rest] }, column };
}

/**
 * A column's heading, written where the reader types it — in its own header (§6.1).
 *
 * The `key` is minted from the first heading written and never moves again: a later
 * rename must not move it, or a plan's Display would lose the column it pinned.
 */
export function renameColumn(draft: DraftState, id: string, label: string): DraftState {
  return {
    ...draft,
    columns: draft.columns.map((row) => {
      if (row.id !== id) return row;
      const next = { ...row, label };
      if (!next.key.trim() && next.label.trim()) {
        next.key = fieldKeyFor(
          { id: next.id, label: next.label, scope: next.scope },
          draft.columns.map((other) => ({ id: other.id, key: other.key, scope: other.scope })),
        );
      }
      return next;
    }),
  };
}

export function addOption(
  draft: DraftState,
  columnId: string,
  label: string,
): { draft: DraftState; option: DraftOption } {
  const existing = optionsOf(draft, columnId);
  const option: DraftOption = {
    id: createId(),
    fieldDefId: columnId,
    label,
    sortOrder: existing.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1,
    isNew: true,
  };
  return { draft: { ...draft, options: [...draft.options, option] }, option };
}

/** A new, empty row: a chakra, a symbol, or neither — a draft the reader fills in. */
export function addEntry(
  draft: DraftState,
  input?: Partial<Pick<DraftEntry, "meditationId" | "symbolId">>,
  /** §6.1's heading `+` on a row: the new row lands here rather than at the foot. */
  at?: number,
): DraftState {
  const row: DraftEntry = {
    id: createId(),
    meditationId: input?.meditationId ?? null,
    symbolId: input?.symbolId ?? null,
    sortOrder: draft.entries.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1,
    archivedAt: null,
    isNew: true,
  };
  const rows = [...draft.entries, row];
  const ordered = at === undefined ? rows : reindex(moveItem(rows, row.id, at));
  return { ...draft, entries: ordered };
}

export function addLine(draft: DraftState, entryId: string, text = ""): DraftState {
  const row: DraftLine = {
    id: createId(),
    entryId,
    text,
    sortOrder: linesOf(draft, entryId).reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1,
    archivedAt: null,
    isNew: true,
  };
  return { ...draft, lines: [...draft.lines, row] };
}

/** Rows are keyed by id and placed at once: the order is written before the drop lands (§6.1). */
export function moveItem<T extends { id: string }>(items: T[], id: string, toIndex: number): T[] {
  const from = items.findIndex((row) => row.id === id);
  if (from < 0) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (!moved) return items;
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, moved);
  return next;
}

/** Reindex every row of a list, so the order is dense and matches the drawing. */
export function reindex<T extends { id: string; sortOrder: number }>(items: T[]): T[] {
  return items.map((row, index) => ({ ...row, sortOrder: index }));
}

/**
 * What a reload adds to a draft that has edits in it.
 *
 * The **store owns records** and the **draft owns rows, lines, values and
 * columns** — so a reload brings in records the draft has never seen (a symbol
 * typed into a search bar, a chakra made on the spot) and leaves everything else
 * exactly as the reader left it. Replacing the draft wholesale was wrong in both
 * directions: it undid a press that had answered from an async write, and it threw
 * away edits that had not been saved yet.
 */
export function mergeRecords(current: DraftState, next: DraftState): DraftState {
  const add = <T extends { id: string }>(kept: T[], incoming: T[]): T[] => [
    ...kept,
    ...incoming.filter((row) => !kept.some((known) => known.id === row.id)),
  ];
  return {
    ...current,
    meditations: add(current.meditations, next.meditations),
    symbols: add(current.symbols, next.symbols),
    presets: add(current.presets, next.presets),
    types: add(current.types, next.types),
  };
}

/** A record that stepped aside: the draft stops drawing it. */
export function dropRecord(draft: DraftState, table: DatabaseTable, id: string): DraftState {
  const without = <T extends { id: string }>(rows: T[]): T[] => rows.filter((row) => row.id !== id);
  if (table === "symbols") return { ...draft, symbols: without(draft.symbols) };
  if (table === "presets") return { ...draft, presets: without(draft.presets) };
  if (table === "types") return { ...draft, types: without(draft.types) };
  // A meditation lives in one list whatever table it is drawn in, so dropping it
  // is the same act wherever it was drawn from.
  return meditationTableTypeId(table) ? { ...draft, meditations: without(draft.meditations) } : draft;
}

export function emptyRecord(
  /** A table of the grid, or the record page's own `focus` name for a meditation. */
  table: DatabaseTable | "meditation",
  workspaceId: string,
  /** The live types, so a brand-new meditation can be given the first one. */
  types: MeditationType[],
): DraftRecord {
  const id = createId();
  if (table === "types") {
    const type: MeditationType = {
      id,
      workspaceId,
      name: "",
      // A new type runs one intentions stage: a block of it has to have *a* timer,
      // and the reader edits the row's own stage cells from there.
      stages: copyStages(INTENTION_STAGES),
      sortOrder: 0,
      archivedAt: null,
      ...newRowVersion(),
    };
    return typeRecord(type);
  }
  if (table === "presets") {
    const preset: BinauralPreset = {
      id,
      workspaceId,
      name: "",
      leftTones: [],
      rightTones: [],
      fadeInMs: 40,
      fadeOutMs: 40,
      eqLeft: defaultEarEq(),
      eqRight: defaultEarEq(),
      sortOrder: 0,
      archivedAt: null,
      ...newRowVersion(),
    };
    return presetRecord(preset);
  }
  if (table === "symbols") {
    const symbol: Symbol = {
      id,
      workspaceId,
      name: "",
      description: "",
      usage: "",
      imageAssetId: null,
      sortOrder: 0,
      archivedAt: null,
      ...newRowVersion(),
    };
    return symbolRecord(symbol);
  }
  const focus: Meditation = {
    id,
    workspaceId,
    name: "",
    // A row with no type at all could not be shown, or filtered, anywhere: it
    // starts on the type whose table it was added in, and on the reader's first
    // type only when the table does not name one.
    typeId: (table === "meditation" ? null : meditationTableTypeId(table)) ?? liveTypes(types)[0]?.id ?? "",
    locationText: "",
    defaultBinauralPresetId: null,
    defaultDurationMs: DEFAULT_FOCUS_DURATION_MS,
    description: null,
    governs: null,
    colour: null,
    element: null,
    representationAssetId: null,
    representationDescription: null,
    binauralEnabled: true,
    // It follows its type until the reader gives it stages of its own.
    stages: null,
    sortOrder: 0,
    archivedAt: null,
    ...newRowVersion(),
  };
  return meditationRecord(focus);
}

/**
 * A record row that exists only in the draft until Save.
 *
 * The owner's ask: `Add` in the library, and the row's own `＋`, put a row **in the
 * grid** to type into — not a page. So a new record is a draft row like a new
 * entry row is: unnamed, unsaved, and simply not written if the reader leaves it
 * that way (`commitRecords` skips a record with no name).
 */
export function addRecord(
  draft: DraftState,
  table: DatabaseTable,
  workspaceId: string,
  types: MeditationType[],
): { draft: DraftState; record: DraftRecord } {
  const rows = recordsOf(draft, table);
  const record: DraftRecord = {
    ...emptyRecord(table, workspaceId, types),
    isNew: true,
    sortOrder: rows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1,
  };
  return { draft: replaceRecords(draft, table, [...rows, record]), record };
}

/* ------------------------------------------------------------------ saving -- */

export type DatabaseWrites = {
  saveEntry(entry: Entry): Promise<Entry>;
  deleteEntry(workspaceId: string, entryId: string): Promise<void>;
  saveLine(line: Intention): Promise<Intention>;
  saveFieldDef(def: FieldDef): Promise<FieldDef>;
  deleteFieldDef(workspaceId: string, fieldDefId: string): Promise<void>;
  saveFieldOption(option: FieldOption): Promise<FieldOption>;
  deleteFieldOption(workspaceId: string, optionId: string): Promise<void>;
  saveFieldValue(value: FieldValue): Promise<FieldValue>;
  saveMeditation(focus: Meditation): Promise<Meditation>;
  saveSymbol(symbol: Symbol): Promise<Symbol>;
  savePreset(preset: BinauralPreset): Promise<BinauralPreset>;
  saveMeditationType(row: MeditationType): Promise<MeditationType>;
  reorderEntries(workspaceId: string, entryIds: string[]): Promise<void>;
  reorderLines(workspaceId: string, entryId: string, lineIds: string[]): Promise<void>;
  sweepOrphanedEntries(
    workspaceId: string,
    entryIds: string[],
  ): Promise<{ swept: { id: string; label: string }[]; total: number }>;
};

export type SweepReport = { names: string[]; total: number };

function entryFrom(row: DraftEntry): Entry {
  return {
    id: row.id,
    // The workspace is filled in by the caller's writes; the port ignores it.
    workspaceId: "",
    meditationId: row.meditationId,
    symbolId: row.symbolId,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt,
    ...newRowVersion(),
  };
}

function sameEntry(a: DraftEntry, b: DraftEntry): boolean {
  return (
    a.meditationId === b.meditationId &&
    a.symbolId === b.symbolId &&
    a.sortOrder === b.sortOrder &&
    a.archivedAt === b.archivedAt
  );
}

function sameLine(a: DraftLine, b: DraftLine): boolean {
  // `entryId` is part of it: re-associating a sentence is a write like any other,
  // and a line whose row changed is a line whose stored row is now wrong.
  return (
    a.text === b.text &&
    a.entryId === b.entryId &&
    a.sortOrder === b.sortOrder &&
    a.archivedAt === b.archivedAt
  );
}

/**
 * Commit the draft (§7), in the order the plan gives: rows, lines and order, then
 * columns and options, then the orphan sweep.
 *
 * A row the reader emptied is **not written**: it is handed to the sweep, which
 * archives the stored row and reports it by name. That is what makes
 * "cleared and then filled in again before Save" survive — by the time this runs,
 * the draft says the row has a reference, so it is written like any other.
 */
export async function commitDatabaseDraft(input: {
  writes: DatabaseWrites;
  workspaceId: string;
  before: DraftState;
  draft: DraftState;
}): Promise<SweepReport> {
  const { writes, workspaceId, before, draft } = input;
  const beforeEntries = new Map(before.entries.map((row) => [row.id, row]));
  const orphans: string[] = [];

  for (const row of draft.entries) {
    const previous = beforeEntries.get(row.id);
    if (!row.meditationId && !row.symbolId) {
      // Nothing left to point at. A row that was never stored is simply gone; a
      // stored one is swept, which is the one thing Save reports.
      if (!row.isNew && row.archivedAt == null) orphans.push(row.id);
      continue;
    }
    if (previous && sameEntry(previous, row)) continue;
    await writes.saveEntry({ ...entryFrom(row), workspaceId });
  }

  const beforeLines = new Map(before.lines.map((row) => [row.id, row]));
  for (const line of draft.lines) {
    const previous = beforeLines.get(line.id);
    if (previous && sameLine(previous, line)) continue;
    await writes.saveLine({
      id: line.id,
      workspaceId,
      entryId: line.entryId,
      sortOrder: line.sortOrder,
      text: line.text,
      archivedAt: line.archivedAt,
      ...newRowVersion(),
    });
  }

  // Order last, and only for rows that survived: a swept row has no place to keep.
  const order = draft.entries
    .filter((row) => row.meditationId || row.symbolId)
    .map((row) => row.id);
  await writes.reorderEntries(workspaceId, order);
  for (const [entryId, ids] of lineOrderByEntry(draft)) {
    await writes.reorderLines(workspaceId, entryId, ids);
  }

  const beforeColumns = new Map(before.columns.map((row) => [row.id, row]));
  for (const column of draft.columns) {
    // A column with no heading is not stored — the same rule as a row with nothing
    // to point at: it was never a column, only the place one is about to be.
    if (!column.label.trim()) continue;
    const previous = beforeColumns.get(column.id);
    if (
      previous &&
      previous.label === column.label &&
      previous.description === column.description &&
      previous.cellType === column.cellType &&
      previous.refKind === column.refKind &&
      previous.typeId === column.typeId &&
      previous.sortOrder === column.sortOrder
    ) {
      continue;
    }
    const stored = await writes.saveFieldDef({
      id: column.id,
      workspaceId,
      scope: column.scope,
      typeId: column.typeId,
      key: column.key,
      label: column.label,
      description: column.description,
      cellType: column.cellType,
      refKind: column.refKind,
      sortOrder: column.sortOrder,
      archivedAt: null,
      ...newRowVersion(),
    });
    // The application mints the key when it is blank; the draft learns it, so a
    // later save of the same column is a rename rather than a new key.
    column.key = stored.key;
    column.id = stored.id;
  }

  const beforeOptions = new Map(before.options.map((row) => [row.id, row]));
  for (const option of draft.options) {
    const previous = beforeOptions.get(option.id);
    if (previous && previous.label === option.label && previous.sortOrder === option.sortOrder) {
      continue;
    }
    await writes.saveFieldOption({
      id: option.id,
      workspaceId,
      fieldDefId: option.fieldDefId,
      label: option.label,
      sortOrder: option.sortOrder,
      ...newRowVersion(),
    });
  }

  for (const [key, text] of Object.entries(draft.values)) {
    if (text === (before.values[key] ?? "")) continue;
    const separator = key.lastIndexOf(":");
    await writes.saveFieldValue({
      entityId: key.slice(0, separator),
      fieldDefId: key.slice(separator + 1),
      text,
      ...newRowVersion(),
    });
  }

  await commitRecords(writes, workspaceId, before, draft);

  const swept = await writes.sweepOrphanedEntries(workspaceId, orphans);
  return { names: swept.swept.map((row) => row.label), total: swept.total };
}

function lineOrderByEntry(draft: DraftState): Map<string, string[]> {
  const byEntry = new Map<string, DraftLine[]>();
  for (const line of draft.lines) {
    // An orphan has no group to be reordered inside; its own `sortOrder` is what
    // the store keeps, and the line write above is what carries it there.
    if (line.entryId === null) continue;
    const list = byEntry.get(line.entryId) ?? [];
    list.push(line);
    byEntry.set(line.entryId, list);
  }
  const out = new Map<string, string[]>();
  for (const [entryId, rows] of byEntry) {
    out.set(
      entryId,
      [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)).map((row) => row.id),
    );
  }
  return out;
}

/**
 * A chakra as its row currently stands, for the screen that has to be handed one.
 *
 * The binaural config writes a `Meditation` back whole, so handing it the row's
 * *stored* record would put a stale name or picture back with the toggle. It gets
 * the draft's own version instead.
 */
export function focusFromRecord(record: DraftRecord): Meditation {
  return focusFrom(record);
}

function focusFrom(record: DraftRecord): Meditation {
  const source = record.source as Meditation;
  return {
    ...source,
    name: record.name,
    locationText: record.builtins.location ?? "",
    // The type is not a cell of the grid: it is the table the record lives in.
    typeId: source.typeId,
    representationAssetId: record.pictureAssetId,
    defaultBinauralPresetId: record.defaultBinauralPresetId,
    binauralEnabled: record.binauralEnabled,
    sortOrder: record.sortOrder,
    archivedAt: record.archivedAt,
  };
}

function symbolFrom(record: DraftRecord): Symbol {
  const source = record.source as Symbol;
  return {
    ...source,
    name: record.name,
    description: record.builtins.description ?? "",
    usage: record.builtins.usage ?? "",
    imageAssetId: record.pictureAssetId,
    sortOrder: record.sortOrder,
    archivedAt: record.archivedAt,
  };
}

function presetFrom(record: DraftRecord): BinauralPreset {
  const source = record.source as BinauralPreset;
  return {
    ...source,
    name: record.name,
    sortOrder: record.sortOrder,
    archivedAt: record.archivedAt,
  };
}

/**
 * A type as its row currently stands.
 *
 * The row carries fields this table does not draw — its stage template (round 15, 2026-09-19) and
 * anything else added later — so the draft's `source` is spread first and only the
 * cells the table shows are written over it.
 */
function typeFrom(record: DraftRecord): MeditationType {
  const source = record.source as MeditationType;
  return {
    ...source,
    name: record.name,
    sortOrder: record.sortOrder,
    archivedAt: record.archivedAt,
  };
}

async function commitRecords(
  writes: DatabaseWrites,
  workspaceId: string,
  before: DraftState,
  draft: DraftState,
): Promise<void> {
  // Every meditation, in one group, whatever table it was drawn in: the tables
  // are filters, so the store's one list is what has to be compared.
  const groups: ["meditation" | "symbols" | "presets" | "types", DraftRecord[], DraftRecord[]][] = [
    ["meditation", before.meditations, draft.meditations],
    ["symbols", before.symbols, draft.symbols],
    ["presets", before.presets, draft.presets],
    ["types", before.types, draft.types],
  ];
  for (const [table, beforeRows, afterRows] of groups) {
    const previousById = new Map(beforeRows.map((row) => [row.id, row]));
    for (const record of afterRows) {
      const previous = previousById.get(record.id);
      if (previous && sameRecord(previous, record)) continue;
      if (!record.name.trim()) continue;
      record.source =
        table === "types"
          ? await writes.saveMeditationType({ ...typeFrom(record), workspaceId })
          : table === "symbols"
            ? await writes.saveSymbol({ ...symbolFrom(record), workspaceId })
            : table === "presets"
              ? await writes.savePreset({ ...presetFrom(record), workspaceId })
              : await writes.saveMeditation({ ...focusFrom(record), workspaceId });
      record.isNew = false;
      record.archivedAt = record.source.archivedAt;
      record.sortOrder = record.source.sortOrder;
    }
  }
}

function sameRecord(a: DraftRecord, b: DraftRecord): boolean {
  if (a.name !== b.name || a.sortOrder !== b.sortOrder || a.archivedAt !== b.archivedAt) {
    return false;
  }
  if (
    a.pictureAssetId !== b.pictureAssetId ||
    a.defaultBinauralPresetId !== b.defaultBinauralPresetId ||
    a.binauralEnabled !== b.binauralEnabled
  ) {
    return false;
  }
  const keys = new Set([...Object.keys(a.builtins), ...Object.keys(b.builtins)]);
  for (const key of keys) {
    if ((a.builtins[key] ?? "") !== (b.builtins[key] ?? "")) return false;
  }
  return true;
}
