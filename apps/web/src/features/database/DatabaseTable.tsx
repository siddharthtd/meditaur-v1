"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, EYEBROW_CLASS, KeyHints, LatchButton } from "@meditaur/ui";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { FieldScope, Meditation } from "@meditaur/domain";
import type { LibraryView } from "@meditaur/application";
import {
  addColumn,
  addKarunaRow,
  addLine,
  addMeditationLine,
  addOption,
  addRecord,
  addSentence,
  associateLine,
  columnHoldsValue,
  focusFromRecord,
  karunaGroups,
  karunaSelection,
  linesOf,
  meditationEntry,
  meditationLines,
  optionsOf,
  recordsOf,
  renameColumn,
  sentenceRows,
  setEntriesOrder,
  type DraftColumn,
  type DraftEntry,
  type DraftLine,
  type DraftRecord,
  type DraftState,
  type DraftValues,
  type KarunaGroup,
  type SentenceRow,
} from "./database-model";
import {
  ChipPicker,
  ColumnMenu,
  DurationCell,
  ImageCell,
  LinesCell,
  REVEAL,
  ReferenceCell,
  SelectCell,
  TextCell,
  cellTypeLabel,
  type CellRecords,
} from "./DatabaseCells";
import type { DatabaseTable, RecordTable } from "./database-tables";
import { meditationTableTypeId, recordTableOf } from "./database-tables";
import { recordMeditationTypeId } from "./database-model";
import { columnIsInPool } from "../library/library-model";
import type { MeditationType } from "@meditaur/domain";

/**
 * The Database's grid (§6).
 *
 * It is one table of the four, drawn from the draft the screen holds. Everything
 * here is a **view over the draft** — a cell edit, a new row, a reordered column —
 * and nothing writes to the store: Save is the only thing that does (§7), which is
 * why leaving discards and why leaving is interrupted.
 *
 * Rows and columns are keyed by id and placed at once: the order is written into
 * the draft before the drop lands, so nothing animates into place (the rule the
 * planner and the library already follow).
 */
export type DatabaseTableProps = {
  table: DatabaseTable;
  /** Needed to mint a record row that Save can store (a row is workspace-scoped). */
  workspaceId: string;
  /** Every type: a new meditation row is given the first live one. */
  types: MeditationType[];
  draft: DraftState;
  view: LibraryView;
  records: CellRecords;
  /**
   * A patch to the draft, or a function of the newest draft.
   *
   * The function form is what the asynchronous paths use — a create from a search
   * bar, a picture write — because their answer arrives after the reload that a
   * stale `draft` closure would undo. `setDraft` already accepts both.
   */
  onDraft: (next: DraftState | ((current: DraftState) => DraftState)) => void;
  onOpenRecord: (table: RecordTable, id: string) => void;
  onNewRecord: (table: RecordTable) => void;
  onArchiveEntry: (row: DraftEntry) => void;
  onRemoveEntry: (row: DraftEntry) => void;
  onArchiveLine: (line: DraftLine) => void;
  onRemoveLine: (line: DraftLine) => void;
  /** A record row's own two verbs (§4): a chakra, a symbol or a preset. */
  onArchiveRecord: (table: DatabaseTable, id: string) => void;
  onRemoveRecord: (table: DatabaseTable, id: string) => void;
  /** What archiving this record would take, for the box its `×` opens. */
  onDescribeRecord: (table: DatabaseTable, id: string) => Promise<void>;
  onRemoveColumn: (column: DraftColumn) => void;
  /** A new option for a `select` column, answered with its id. */
  onAddOption: (column: DraftColumn, label: string) => Promise<string | null>;
  /** §6.2's context-aware create: a name that matches nothing, made and chosen. */
  onCreateRecord: (
    kind: "meditation" | "symbols" | "presets",
    name: string,
  ) => Promise<string | null>;
  armed: string | null;
  onArm: (id: string | null) => void;
  notice: string | null;
  imageUrls: Record<string, string>;
  onUploadImage: (file: File, column: DraftColumn, entityId: string) => void;
  /** A chakra's or a symbol's own picture — a column, not a cell value. */
  onUploadPicture: (file: File, entityId: string) => void;
  /** The binaural config is a whole screen, so its column opens it. */
  onOpenBinaural: (focus: Meditation) => void;
  /** The row the shell asked for (a library `Edit`), so its name takes the caret. */
  focusRecordId?: string | null;
  /**
   * The reader's filter, matched against a row's **key** and nothing else.
   *
   * The owner's round 17: *"Add filter functionality to all the tabs in the database
   * based on the key. So, for chakras, there should be a chakra key searching for
   * that chakra should filter."* The key is what a row *is* — a record's name, a
   * sentence's text, a pair's meditation and symbol — so the box narrows the table
   * without the reader having to guess which column it is searching.
   */
  filter: string;
  /** Columns taken out of this table's view, by `columnKey`. */
  hiddenColumns: string[];
  /** Whether the headings are showing their `×`, from the toolbar's press. */
  editingColumns: boolean;
  onToggleColumn: (key: string) => void;
};

type GridColumn =
  | { kind: "builtin"; key: string; label: string; scope: FieldScope; width?: string }
  | { kind: "custom"; column: DraftColumn };

/** One built-in column, with the width it gets when its key's is not the right one. */
type BuiltinColumn = { key: string; label: string; width?: string };

/** The columns a meditation table draws, whichever type it belongs to. */
const MEDITATION_BUILTIN_COLUMNS: BuiltinColumn[] = [
  { key: "name", label: "Name" },
  { key: "location", label: "Location" },
  { key: "picture", label: "Picture" },
  { key: "defaultSound", label: "Default sound" },
  { key: "binaural", label: "Binaural" },
  // §5.3: the meditation's own sentences — the lines that carry no symbol, which
  // are the ones that would otherwise have no table to be written in. It is last
  // because it is the column that takes what the others leave, the way an entry's
  // own Intentions cell does.
  { key: "intentions", label: "Intentions" },
];

const BUILTIN_COLUMNS: Record<
  "symbols" | "presets" | "types" | "affirmations",
  BuiltinColumn[]
> = {
  symbols: [
    { key: "name", label: "Name" },
    { key: "picture", label: "Picture" },
    { key: "description", label: "Description" },
    { key: "usage", label: "Usage" },
  ],
  presets: [
    { key: "name", label: "Name" },
    { key: "sound", label: "Sound" },
  ],
  /** A type's own columns are its meditations' and its stage template's; the row
   *  itself carries a name and an order (§8, §12.6). */
  types: [{ key: "name", label: "Name" }],
  /**
   * An affirmation's row is a **sentence**, so this table has two built-ins: the
   * sentence — the cell a reader types into, and the one that takes the caret when
   * a row arrives — and the Association, which is the pair the sentence is written
   * about (§5.2). Neither is a record's name: the sentence never routes through
   * `name`, which is the trap that once wrote `builtins.text` and dropped the saved
   * row for having no name.
   */
  affirmations: [
    { key: "name", label: "Affirmation", width: "min-w-[28rem]" },
    { key: "association", label: "Associated with" },
  ],
};

/**
 * The builtin columns of a table.
 *
 * A type's table is a meditation table, so it draws the meditation columns; the
 * Types table draws only a name. The two are one lookup rather than a branch at
 * every use.
 */
function builtinColumnsOf(table: DatabaseTable): BuiltinColumn[] {
  return meditationTableTypeId(table)
    ? MEDITATION_BUILTIN_COLUMNS
    : BUILTIN_COLUMNS[table as "symbols" | "presets" | "types" | "affirmations"];
}

/**
 * How wide a record table's own columns are. A `kind` is one word; a location is
 * a short phrase; a description or a usage is a sentence. Left to itself the
 * auto layout gave them all the same width, which parked a quarter of the table
 * on the word "chakra".
 */
const BUILTIN_WIDTH: Record<string, string> = {
  name: "min-w-44",
  kind: "w-32",
  sound: "w-32",
  location: "w-56",
  picture: "w-24",
  defaultSound: "w-48",
  // The switch alone since §5.4: `Tune` moved to the sound it tunes, which is what
  // the extra width was for, and the label is the column's own word rather than the
  // row's name repeated in every line.
  binaural: "w-32",
  description: "w-64",
  usage: "w-64",
  // Two chips, and the pair is what the reader scans the table along.
  association: "min-w-56",
};

/**
 * The builtin columns that are a *field* of the row rather than one of its text
 * columns — a chakra's picture, its default sound, its binaural setting, and a
 * sentence's Association.
 *
 * The Association is one for the same reason: its value is a pair of references,
 * not a string, so it is drawn as a cell of its own and never as a text box.
 */
function isRecordColumn(key: string): boolean {
  return (
    key === "picture" ||
    key === "defaultSound" ||
    key === "binaural" ||
    key === "intentions" ||
    key === "association"
  );
}

/** What the copy calls one row of a table. "Record" is spec vocabulary and never
 *  reaches the reader (§12.32). */
const RECORD_NOUN = {
  focus: "chakra",
  symbols: "symbol",
  presets: "preset",
  types: "type",
  affirmations: "affirmation",
} as const;

/** The noun for a table's rows, for the row-invitation and its label. */
function recordNoun(table: DatabaseTable): string {
  return meditationTableTypeId(table) ? "meditation" : RECORD_NOUN[table as keyof typeof RECORD_NOUN];
}

/**
 * `a` or `an`, so the invitation reads as English.
 *
 * The noun after it is the reader's — `affirmation` is the one that needs `an`
 * today — and an article chosen by the word is cheaper than a second list that can
 * drift from the first.
 */
function withArticle(noun: string): string {
  return `${/^[aeiou]/.test(noun) ? "an" : "a"} ${noun}`;
}

/**
 * The grid's chrome — written once so the four tables cannot drift apart.
 *
 * The shape is a spreadsheet's, not a form's: the whole grid is one surface with
 * a header band, a hairline under every row and a highlight that follows the
 * pointer. Before this, the grid was bare `<td>`s on the page background, so
 * nothing said where a row began or which column a value belonged to, and every
 * cell drew its own outlined box — the owner's "shitty visual basic type
 * interface".
 *
 * `border-separate` is deliberate and older than this pass: a `position: sticky`
 * cell does not behave inside a `border-collapse` table, and the leading column
 * is pinned (§12.27). With `border-spacing: 0` the hairlines still sit flush,
 * which is why only bottom borders are drawn — a top and a bottom would double.
 */
const HEAD_CELL = "border-b border-line px-3 py-2 text-left align-bottom";
/**
 * `bg-surface`, and it is not decoration: a pinned cell sits at `z-20` *above* the
 * columns that scroll under it while it is stuck, so a header cell with no fill of
 * its own is a window onto the row below. That is the text box the owner saw drawn
 * over `Tune` (item 6, §5.4) — invisible in the class list, because the defect was
 * the *absence* of one. The header band is one colour, so naming it is the fix;
 * the body cells inherit the row's fill instead, because theirs moves.
 */
const HEAD_LEAD = `${HEAD_CELL} sticky left-0 z-20 border-r border-line/60 bg-surface`;
/**
 * The second pinned column of a **record table**: its `Name`.
 *
 * `left-32` is the leading cell's own width in the same spacing scale, so the two
 * stay in step — the trap §12.4 of this round records. §12.27's rule is kept rather
 * than dropped: what a row *is* sticks beside the row's own controls, so scrolling
 * right never leaves the reader unsure which row they are on. That is the owner's
 * item 6, where the name scrolled away while only the `Open` column stayed behind.
 *
 * The lead's width is a **minimum and a width together** (`w-32 min-w-32`), and that
 * is the whole of a defect measured in the browser on 2026-09-20. A pinned pair is
 * only in step while the leading column is exactly the width the pin is offset by,
 * and neither half of the pair holds on its own: the grid's tables sit at **minimum**
 * layout once they overflow, where a `w-*` is ignored and the column collapsed to its
 * content's 119.6px under a pin at Karuna's 108px — painting over the right edge of
 * the row's `×` — and a `min-w-*` alone is *grown* past when the table has slack to
 * share (Karuna's lead measured 168.5px). One token as both clamps the column from
 * both sides, so it is 144px at the design's 18px root however the table is laid out,
 * and the pin starts exactly where it ends.
 *
 * It is one step wider than Karuna's because a record's leading cell carries a control
 * Karuna's does not: `Open`.
 */
const HEAD_NAME_LEAD = `${HEAD_CELL} sticky left-32 z-20 border-r border-line/60 bg-surface`;
/**
 * The second pinned column of **Karuna**: its `Symbol`.
 *
 * `left-24` is that grid's own leading width (`w-24 min-w-24`), whose three controls —
 * the handle, the `×` and the insert `＋` — fit inside it with room to spare.
 */
const HEAD_SYMBOL_LEAD = `${HEAD_CELL} sticky left-24 z-20 border-r border-line/60 bg-surface`;
const BODY_CELL = "border-b border-line/50 px-2 py-0.5 align-top";
/** `bg-inherit`: the pinned cell takes the row's own fill, so the highlight moves
 *  with it and scrolled content never shows through. */
const BODY_LEAD = `${BODY_CELL} sticky left-0 z-10 border-r border-line/60 bg-inherit`;
/** The body half of `HEAD_NAME_LEAD`, at the same `left-32`. */
const BODY_NAME_LEAD = `${BODY_CELL} sticky left-32 z-10 border-r border-line/60 bg-inherit`;
/** The body half of `HEAD_SYMBOL_LEAD`, at the same `left-24`. */
const BODY_SYMBOL_LEAD = `${BODY_CELL} sticky left-24 z-10 border-r border-line/60 bg-inherit`;
/** One row: the pointer's fill lives here, and the pinned cell follows it. */
const ROW = "group align-top bg-surface transition-colors hover:bg-surface-raised";
const HEAD_LABEL = "text-sm font-medium text-muted";
/** The narrow last cell every row carries, so the table's edges line up. */
const TAIL_CELL = "w-10 border-b border-line/50 p-0";

/** The columns of one table: its own, then the reader's own additions. */
function scopeOf(table: DatabaseTable): FieldScope {
  if (table === "entries") return "entry";
  if (table === "symbols") return "symbol";
  // An affirmation is its own pool too (§12.4): a column added to the sentences
  // must not appear on the chakras, and the other way round.
  if (table === "affirmations") return "affirmation";
  // A type's own columns are its meditations' columns (§12.4). The Types table
  // draws none of them — `customColumns` is empty there — so this is only ever
  // read for a meditation table.
  return "meditation";
}

export function DatabaseTable(props: DatabaseTableProps) {
  const { table, draft, onDraft } = props;
  /** The column just added, so its heading takes the keyboard (§6.4). */
  const [newColumnId, setNewColumnId] = useState<string | null>(null);
  /** The column whose own menu is open, and where its heading cell stands. */
  const [menu, setMenu] = useState<{ id: string; anchor: { left: number; top: number } } | null>(
    null,
  );
  /** Which row's lines are open in the phone's focused editor (§6.3). */
  const [linesEditorFor, setLinesEditorFor] = useState<string | null>(null);
  /** The row just added — a record or a sentence — so its leading cell takes the
   *  keyboard. */
  const [newRowId, setNewRowId] = useState<string | null>(null);
  /**
   * Karuna's heading: the one meditation whose table is drawn, or `null` for every
   * table stacked in series (§5.1).
   */
  const [karunaFor, setKarunaFor] = useState<string | null>(null);
  /** A row the shell asked for (a library `Edit`) is the fallback when this grid
   *  has not just made one of its own. */
  const caretRowId = newRowId ?? props.focusRecordId ?? null;
  /**
   * The page this table's rows open, or `null` when they have none.
   *
   * A type's row is edited in the grid and a sentence's table is not a record table
   * at all, so neither has a page — and `Open` is drawn only where there is one,
   * because a control that cannot act is not a control.
   */
  const recordPage = recordTableOf(table);
  /** The heading cell the open column menu belongs to, so a press on the chip that
   *  opened it is not read as a press somewhere else. */
  const menuRoot = useRef<HTMLElement | null>(null);

  const scope = scopeOf(table);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  /**
   * The Association cell (§5.2): the pair the sentence is written about, drawn with
   * the same two searchable chips Karuna's rows use.
   *
   * A pick finds or makes the draft's row for that pair and points the sentence at
   * it, which is the one thing that puts the sentence in a chakra's table and in
   * this one at the same time. Either `×` clears that half of the pair and clearing
   * both puts the sentence back among the orphans. Nothing else is drawn here: a
   * sentence is not a meditation, so it has no binaural setting to tune.
   */
  const associationCell = (row: SentenceRow) => {
    const pair = {
      meditationId: row.entry?.meditationId ?? null,
      symbolId: row.entry?.symbolId ?? null,
    };
    const associate = (next: { meditationId: string | null; symbolId: string | null }) =>
      props.onDraft((current) => associateLine(current, row.line.id, next));
    const live = <T extends { id: string; name: string; archivedAt: number | null }>(rows: T[]) =>
      rows.filter((item) => item.archivedAt == null).map((item) => ({ id: item.id, label: item.name }));
    return (
      <div className="flex items-center gap-1">
        <span data-association="meditation">
          <ChipPicker
            value={pair.meditationId ?? ""}
            label={
              props.records.meditations.find((item) => item.id === pair.meditationId)?.name ??
              "＋ meditation"
            }
            placeholder="Find a meditation"
            options={live(props.records.meditations)}
            records={props.records}
            onPick={(id) => associate({ ...pair, meditationId: id })}
            onOpen={() =>
              pair.meditationId && props.onOpenRecord("meditation", pair.meditationId)
            }
            onClear={() => associate({ ...pair, meditationId: null })}
            onCreate={async (name) => {
              const id = await props.onCreateRecord("meditation", name);
              if (id) associate({ ...pair, meditationId: id });
              return id;
            }}
          />
        </span>
        <span data-association="symbol">
          <ChipPicker
            value={pair.symbolId ?? ""}
            label={
              props.records.symbols.find((item) => item.id === pair.symbolId)?.name ?? "＋ symbol"
            }
            placeholder="Find a symbol"
            options={live(props.records.symbols)}
            records={props.records}
            onPick={(id) => associate({ ...pair, symbolId: id })}
            onOpen={() => pair.symbolId && props.onOpenRecord("symbols", pair.symbolId)}
            onClear={() => associate({ ...pair, symbolId: null })}
            onCreate={async (name) => {
              const id = await props.onCreateRecord("symbols", name);
              if (id) associate({ ...pair, symbolId: id });
              return id;
            }}
          />
        </span>
      </div>
    );
  };

  /**
   * One cell of a sentence's row (§5.2).
   *
   * A sentence is a line, not a record, so its cells are the line's: the sentence
   * itself in the table's leading column — the one cell a reader scans down — and
   * the Association beside it. Its own columns are the `affirmation` pool's and draw
   * exactly as they do over any other row, which is what keeps one `TextCell` and one
   * `ChipPicker` behind both tables.
   */
  const sentenceCell = (column: GridColumn, row: SentenceRow) => {
    if (column.kind === "builtin") {
      // The Association is the one record column a sentence has (`isRecordColumn`
      // also names the chakras' cells, and a sentence is not a chakra).
      if (column.key === "association") return associationCell(row);
      return (
        <TextCell
          value={row.line.text}
          label={`${row.line.text.trim() || "New affirmation"} — ${column.label}`}
          long
          strong
          autoFocus={caretRowId === row.line.id}
          onCommit={(text) =>
            props.onDraft((current) => ({
              ...current,
              lines: current.lines.map((line) =>
                line.id === row.line.id ? { ...line, text } : line,
              ),
            }))
          }
        />
      );
    }
    return recordControl(column, {
      id: row.line.id,
      name: row.line.text,
      builtins: {},
      source: row.line,
    });
  };

  /**
   * The filter, and the one question every table asks of it.
   *
   * `matches` is handed a row's **key**, never a cell and never a column: a table
   * filters by what its rows *are*. So a chakra is found by its name, a sentence by
   * its words, and a Karuna row by the pair it names — which is also what its cells
   * are labelled with (`rowLabel`), so what the reader types is what they can see.
   */
  const needle = props.filter.trim().toLowerCase();
  const matches = (text: string | null | undefined) =>
    needle === "" || (text ?? "").toLowerCase().includes(needle);

  /** The stored rows of a record table, which is what the grid draws.
   *
   * The filter is applied **here**, at the one place a table's rows are read, so
   * every table gets it from the same sentence and none of them can be left out of
   * it — which is what the owner reported about Karuna.
   */
  const recordRows = (which: DatabaseTable): DraftRecord[] =>
    recordsOf(draft, which).filter((row) => matches(row.name));
  /** The sentences this table draws, filtered by their own words (§5.2). */
  const sentenceList =
    table === "affirmations" ? sentenceRows(draft).filter((row) => matches(row.line.text)) : [];
  /** The rows on screen, in order — what the drag works against.
   *
   * Karuna's rows are dragged inside their own heading, so each of its tables
   * carries its own list (`dropInGroup`) and none of them is this one. */
  const rowIds =
    table === "affirmations"
      ? sentenceList.map((row) => row.line.id)
      : recordRows(table).map((row) => row.id);
  const customColumns = useMemo(
    () =>
      // The Types table has no custom columns: a type's own columns are its
      // meditations' pool rule), and its stage template is edited as cells once that lands.
      table === "types"
        ? []
        : draft.columns
            .filter(
              (column) =>
                column.scope === scope && columnIsInPool(column, meditationTableTypeId(table)),
            )
            .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
    [draft.columns, scope, table],
  );
  const allColumns: GridColumn[] =
    table === "entries"
      ? customColumns.map((column) => ({ kind: "custom" as const, column }))
      : [
          ...builtinColumnsOf(table).map((builtin) => ({
            kind: "builtin" as const,
            ...builtin,
            scope,
          })),
          ...customColumns.map((column) => ({ kind: "custom" as const, column })),
        ];
  /**
   * The columns the reader has not taken out of the view.
   *
   * A **view** setting and not a stored one: the column still exists, still holds
   * its values and is still what a plan's Display names — this only stops it being
   * drawn, which is what the toolbar's `Edit table` offers. Keeping the list by
   * `columnKey` is what lets one press hide a builtin (`builtin:name`) and a reader's
   * own column (`column:<id>`) without the two namespaces leaking into each other.
   */
  const hidden = new Set(props.hiddenColumns);
  const columns = allColumns.filter((column) => !hidden.has(columnKey(column)));
  /** Every cell a row draws: Karuna's two pinned leads, the reader's columns, and
   *  the narrow tail the table's right edge lines up with. The other tables draw a
   *  controls lead, the pinned name and the tail instead. */
  const columnCount = columns.length + (table === "entries" ? 4 : 2);

  /**
   * Karuna's tables, and the selector's own options.
   *
   * The options are the unfiltered list: the selector is a *filter over the same
   * tables* (§5.1), so what it can name is exactly what the stack would draw — a
   * meditation with no symbol-carrying row is not offered and never becomes an empty
   * table. A filter that names a heading nothing has any more (its last symbol was
   * cleared) falls back to the stack rather than to a blank page.
   */
  const karunaAll = table === "entries" ? karunaGroups(draft) : [];
  /** The heading the reader picked, for the selector's own label. */
  const karunaPicked =
    karunaFor === null
      ? null
      : (karunaAll.find((group) => group.meditationId === karunaFor) ?? null);
  const karuna = karunaSelection(karunaAll, karunaFor);

  /**
   * The same groups, with the filter applied — and item 12 of the owner's round 17
   * is why it exists at all: *"There is no filter functionality in Karuna table in
   * database."* It was the one tab with no way to narrow it, and its rows are the
   * ones that grow without bound.
   *
   * A heading goes once nothing under it matches, and a heading the filter *names* is
   * kept whole — a reader searching for a chakra wants its rows, all of them, not the
   * ones that happen to repeat its own name in the pair label.
   */
  const karunaVisible = karuna
    .map((group) => ({
      ...group,
      rows: group.rows.filter(
        (row, index) => matches(group.name) || matches(rowLabel(row, props.records, index)),
      ),
    }))
    .filter((group) => group.rows.length > 0);

  /**
   * Whether this column is the row's own identity, and so pinned beside the
   * controls cell.
   *
   * Every record table's first built-in is its `Name` — `Affirmation` on the
   * sentences, which is a row's `name` in the draft like any other — and the
   * owner's item 6 is that it must not scroll away. Karuna pins its `Symbol` the
   * same way, as a lead cell of its own.
   */
  const columnIsPinned = (column: GridColumn) =>
    table !== "entries" && column.kind === "builtin" && column.key === "name";

  /** The heading cell's own classes, so the pinned one and the rest cannot drift. */
  const headingCellClass = (column: GridColumn) => {
    const width =
      column.kind === "builtin" ? (column.width ?? BUILTIN_WIDTH[column.key] ?? "") : "min-w-32";
    return `${columnIsPinned(column) ? HEAD_NAME_LEAD : HEAD_CELL} ${width}`;
  };

  const bodyCellClass = (column: GridColumn) =>
    columnIsPinned(column) ? BODY_NAME_LEAD : BODY_CELL;

  const setValue = (entityId: string, fieldDefId: string, text: string) => {
    const key = `${entityId}:${fieldDefId}`;
    props.onDraft((current) => {
      const values: DraftValues = { ...current.values };
      if (text.trim()) values[key] = text;
      else delete values[key];
      return { ...current, values };
    });
  };

  /**
   * A line's text, wherever the line is drawn.
   *
   * A sentence has one write path, so the entries table's cell, a meditation's own
   * cell and the phone editor cannot disagree about what it says.
   */
  const editLine = (id: string, text: string) =>
    props.onDraft((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.id === id ? { ...line, text } : line)),
    }));

  /** `＋` on a meditation's own Intentions cell: the line, and the row to hold it
   *  when the reader has never written about this meditation alone (§5.3). */
  const addMeditationIntent = (meditationId: string) => {
    const { draft: next } = addMeditationLine(draft, meditationId);
    props.onDraft(next);
  };

  /**
   * §6.3's phone path: the cell opens a focused editor below the row rather than
   * stretching it, with the same handles the cell itself carries.
   *
   * It is one function because two cells now hold lines — an entry's own pair, and
   * a meditation's (§5.3) — and a second copy of the editor is a second place for
   * the two to drift apart.
   */
  const focusedLines = (entryId: string | null, lines: DraftLine[], onAdd: () => void) => (
    <tr className="bg-surface">
      <td colSpan={columnCount} className="border-b border-line/50 px-2 py-2">
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
          <div className="flex items-center justify-between">
            <span className={EYEBROW_CLASS}>Intentions</span>
            <Button size="sm" tier="tertiary" onClick={() => setLinesEditorFor(null)}>
              Done
            </Button>
          </div>
          <LinesCell
            lines={lines}
            compact
            onAdd={onAdd}
            onEdit={editLine}
            armedId={props.armed}
            onArm={props.onArm}
            onMoveUp={(id) => props.onDraft(moveLine(draft, entryId, id, -1))}
            onMoveDown={(id) => props.onDraft(moveLine(draft, entryId, id, 1))}
            onMoveTo={(id, to) => props.onDraft(moveLineTo(draft, entryId, id, to))}
          />
        </div>
      </td>
    </tr>
  );

  /**
   * `＋` adds a column **there** — in the grid, with a heading to type into and
   * cells under it to fill.
   *
   * The owner's ask: "adding a column should literally add a column, header should
   * look like a textbox and the cells below should also look like text boxes that I
   * can fill. No need for a new menu at the bottom of the page." So the form that
   * collected a heading, a description and a type *before* the column existed is
   * gone: the column is usable the moment it lands (§6.4), and what it holds is a
   * control on its own heading line.
   */
  const addColumnAt = (at?: number) => {
    const { draft: next, column } = addColumn(
      draft,
      {
        scope,
        label: "",
        description: "",
        cellType: "text",
        refKind: null,
        // A column added while a type's table is open belongs to that type, so
        // the pool it is in is the table it was added to (§12.4).
        typeId: meditationTableTypeId(table),
      },
      at,
    );
    onDraft(next);
    setNewColumnId(column.id);
  };

  const patchColumn = (id: string, patch: Partial<DraftColumn>) => {
    props.onDraft((current) => ({
      ...current,
      columns: current.columns.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    }));
  };

  /** One of a record's own fields, as its column edits it. */
  const patchRecord = (id: string, patch: Partial<DraftRecord>) => {
    props.onDraft((current) => ({
      ...current,
      ...recordsWith(current, table, id, (row) => ({ ...row, ...patch })),
    }));
  };

  const cellFor = (
    column: GridColumn,
    record: { id: string; builtins: Record<string, string>; name: string; source: unknown },
  ) => {
    if (column.kind === "builtin") {
      if (column.key === "name") return record.name;
      if (column.key === "sound") {
        const preset = record.source as { leftTones?: { hz: number }[]; binauralEnabled?: boolean };
        return preset.leftTones?.length ? `${preset.leftTones[0]?.hz} Hz` : "—";
      }
      return record.builtins[column.key] ?? "";
    }
    return draft.values[`${record.id}:${column.column.id}`] ?? "";
  };

  const recordControl = (
    column: GridColumn,
    record: {
      id: string;
      name: string;
      builtins: Record<string, string>;
      source: unknown;
    },
  ) => {
    // A record's own non-text fields, shown as columns rather than on a page — the
    // owner's answer to where a chakra's picture, default sound and binaural
    // setting live once `Add` and `Edit` land here.
    if (column.kind === "builtin" && isRecordColumn(column.key)) {
      const row = record as DraftRecord;
      if (column.key === "picture") {
        return (
          <ImageCell
            value={row.pictureAssetId ?? ""}
            url={row.pictureAssetId ? (props.imageUrls[row.pictureAssetId] ?? null) : null}
            alt={`${row.name || "Row"} picture`}
            onUpload={(file) => props.onUploadPicture(file, row.id)}
          />
        );
      }
      if (column.key === "defaultSound") {
        const live = props.records.presets.filter((preset) => preset.archivedAt == null);
        return (
          <div className="flex items-center gap-1">
            <ChipPicker
              value={row.defaultBinauralPresetId ?? ""}
              label={
                live.find((preset) => preset.id === row.defaultBinauralPresetId)?.name ?? "…"
              }
              placeholder="Find a sound"
              options={live.map((preset) => ({ id: preset.id, label: preset.name }))}
              records={props.records}
              onPick={(id) => patchRecord(row.id, { defaultBinauralPresetId: id })}
              onClear={() => patchRecord(row.id, { defaultBinauralPresetId: null })}
              onOpen={() => {
                if (row.defaultBinauralPresetId) {
                  props.onOpenRecord("presets", row.defaultBinauralPresetId);
                }
              }}
            />
            {/* The config is a whole screen, not a cell, so it needs a control that
                opens it — and that control sits with the sound it tunes, which is
                where the owner asked for it rather than beside the switch (item 6).
                It is drawn whether or not the row has a sound yet, because the
                screen edits the meditation rather than this chip; the shell writes
                the draft before it hands over, so nothing typed here is lost to the
                trip. */}
            <button
              type="button"
              className={`rounded-md px-2 py-1 text-sm text-muted transition hover:bg-bg/50 hover:text-text active:scale-95 ${REVEAL}`}
              onClick={() => props.onOpenBinaural(focusFromRecord(row))}
            >
              Tune
            </button>
          </div>
        );
      }
      // §5.3: a meditation's own sentences — the ones with no symbol to be grouped
      // under, which are the lines of the one entry that names this meditation and
      // nothing else. The `＋` makes that row when the reader has never written
      // about this meditation on its own, so the first sentence is one press away.
      if (column.key === "intentions") {
        const entryId = meditationEntry(draft, row.id)?.id ?? null;
        const lines = meditationLines(draft, row.id);
        return (
          <div className="flex flex-col">
            {/* On a phone the lines open in a focused editor below the row (§6.3),
                exactly as an entry's do: the grid stays readable instead of growing
                a row. */}
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-muted transition hover:bg-bg/40 hover:text-text sm:hidden"
              onClick={() => setLinesEditorFor(meditationEditorKey(row.id))}
            >
              <span aria-hidden="true">☰</span>
              {`${lines.length} intentions`}
            </button>
            <div className="hidden sm:block">
              <LinesCell
                lines={lines}
                onAdd={() => addMeditationIntent(row.id)}
                onEdit={editLine}
                armedId={props.armed}
                onArm={props.onArm}
                onMoveUp={(id) => props.onDraft(moveLine(draft, entryId, id, -1))}
                onMoveDown={(id) => props.onDraft(moveLine(draft, entryId, id, 1))}
                onMoveTo={(id, to) => props.onDraft(moveLineTo(draft, entryId, id, to))}
              />
            </div>
          </div>
        );
      }
      // The switch and nothing else (§5.4): `Tune` moved to the sound, and the
      // label is the column's own word — a name repeated in every line of a table
      // is the width the owner asked back. The tooltip keeps the row's name for a
      // pointer that wants to be sure which switch it is on.
      // The binaural cell is the switch and nothing else (the owner's round 17):
      // the column is already headed `Binaural`, so the word was the heading said
      // twice. The name survives as the switch's own label.
      return (
        <div title={`Binaural for ${row.name || "this row"}`}>
          <LatchButton
            label="Binaural"
            labelHidden
            pressed={row.binauralEnabled}
            size="sm"
            onChange={(next) => patchRecord(row.id, { binauralEnabled: next })}
          />
        </div>
      );
    }
    if (column.kind === "builtin") {
      if (column.key === "sound") {
        return (
          <span className="block px-2 py-0.5 text-sm text-muted">
            {String(cellFor(column, record))}
          </span>
        );
      }
      const key = column.key;
      return (
        <TextCell
          value={cellFor(column, record)}
          label={`${record.name || "New record"} — ${column.label}`}
          // A record's name is the one cell a reader scans down, so it is the one
          // that is not plain body text — and a row that has just been added puts
          // the caret in it.
          strong={key === "name"}
          autoFocus={key === "name" && caretRowId === record.id}
          onCommit={(text) => {
            if (key === "name") {
              props.onDraft((current) => ({
                ...current,
                ...recordsWith(current, table, record.id, (row) => ({ ...row, name: text })),
              }));
              return;
            }
            props.onDraft((current) => ({
              ...current,
              ...recordsWith(current, table, record.id, (row) => ({
                ...row,
                builtins: { ...row.builtins, [key]: text },
              })),
            }));
          }}
        />
      );
    }
    const def = column.column;
    const value = cellFor(column, record);
    if (def.cellType === "duration") {
      return <DurationCell value={value} onCommit={(text) => setValue(record.id, def.id, text)} />;
    }
    if (def.cellType === "image") {
      return (
        <ImageCell
          value={value}
          url={value ? (props.imageUrls[value] ?? null) : null}
          alt="Column image"
          onUpload={(file) => props.onUploadImage(file, def, record.id)}
        />
      );
    }
    if (def.cellType === "select") {
      return (
        <SelectCell
          value={value}
          column={def}
          options={optionsOf(draft, def.id)}
          records={props.records}
          onPick={(optionId) => setValue(record.id, def.id, optionId)}
          onClear={() => setValue(record.id, def.id, "")}
          onCreate={async (label) => {
            const id = await props.onAddOption(def, label);
            if (id) setValue(record.id, def.id, id);
            return id;
          }}
        />
      );
    }
    if (def.cellType === "reference") {
      return (
        <ReferenceCell
          value={value}
          column={def}
          records={props.records}
          onPick={(recordId) => setValue(record.id, def.id, recordId)}
          onOpen={(kind, id) =>
            props.onOpenRecord(kind === "meditation" ? "meditation" : kind === "symbol" ? "symbols" : "presets", id)
          }
          onClear={() => setValue(record.id, def.id, "")}
          onCreate={async (name) => {
            const table =
              (def.refKind ?? "meditation") === "meditation"
                ? ("meditation" as const)
                : (def.refKind ?? "meditation") === "symbol"
                  ? ("symbols" as const)
                  : ("presets" as const);
            const id = await props.onCreateRecord(table, name);
            if (!id) return null;
            setValue(record.id, def.id, id);
            return id;
          }}
        />
      );
    }
    return (
      <TextCell
        value={value}
        label={`${record.name || "Row"} — ${def.label}`}
        long={def.cellType === "longText"}
        numeric={def.cellType === "number"}
        onCommit={(text) => setValue(record.id, def.id, text)}
      />
    );
  };

  /**
   * The row `+` on the Affirmations table: a sentence arrives **here**, in the
   * group it was asked for.
   *
   * `addSentence` makes an orphan and this gives it the pressed row's pair, so a
   * reader adding a second sentence to a chakra's list gets it in that chakra's
   * list — not at the foot of the orphans, where an unassociated sentence belongs
   * and where a `+` pressed on a chakra's row would otherwise send them.
   */
  const insertSentence = (row: SentenceRow) => {
    const { draft: next, id } = addSentence(draft);
    props.onDraft(
      moveSentence(
        associateLine(next, id, {
          meditationId: row.entry?.meditationId ?? null,
          symbolId: row.entry?.symbolId ?? null,
        }),
        id,
        row.line.id,
      ),
    );
    setNewRowId(id);
  };

  /**
   * A row dropped somewhere else is placed **at once** (§6.1): the move is written
   * into the draft before the drop finishes, so nothing animates into place. The
   * keyboard sensor is the second path to the same order — the handle takes the
   * focus, and Space/arrows/Space reorders — because a pointer-only drag is not
   * something a screen-reader reader discovers unprompted.
   */
  const onDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    if (table === "affirmations") {
      props.onDraft(moveSentence(draft, String(event.active.id), String(event.over.id)));
      return;
    }
    const ids = rowIds;
    const from = ids.indexOf(String(event.active.id));
    const to = ids.indexOf(String(event.over.id));
    if (from < 0 || to < 0) return;
    const id = String(event.active.id);
    props.onDraft({
      ...draft,
      ...recordsWith(draft, table, id, (row) => row, to),
    });
  };

  /**
   * A row dropped inside its own heading (§5.1).
   *
   * A heading is its own drag context, so a drop that would move a row *across* one
   * cannot be made: a row's owner is what its symbol chip says, and a drag that
   * moved it between headings would re-associate it — a data change disguised as an
   * order change. Ordering inside a heading is the reader's, and it is written at
   * once like every other order here (§6.1): the whole list is rebuilt in the order
   * the headings draw it, so a row's place is its place inside its group and there
   * is no second order to keep in step.
   */
  const dropInGroup = (group: KarunaGroup, id: string, overId: string) => {
    const rows = [...group.rows];
    const from = rows.findIndex((row) => row.id === id);
    const to = rows.findIndex((row) => row.id === overId);
    if (from < 0 || to < 0) return;
    const [moved] = rows.splice(from, 1);
    if (!moved) return;
    rows.splice(Math.max(0, Math.min(to, rows.length)), 0, moved);
    props.onDraft(
      setEntriesOrder(
        draft,
        karunaAll.flatMap((item) =>
          item.meditationId === group.meditationId
            ? rows.map((row) => row.id)
            : item.rows.map((row) => row.id),
        ),
      ),
    );
  };

  /**
   * One of the reader's columns, as a heading.
   *
   * Written once because Karuna draws a heading per table (§5.1) and every group
   * table is otherwise the same table: a second copy of the heading is a second
   * place for the two to drift apart.
   *
   * `group` is the *cell*, and it is the nearest one: a control in here must answer
   * its own heading, never the row the pointer happens to be crossing below it.
   * Widths are hints, not `w-full`: in an auto-layout table a `width: 100%` column
   * resolves against the table's own width and the table grows to 500000px. Naming
   * the *others* is what leaves the name (or the intentions) the rest of the row.
   */
  const headingCell = (column: GridColumn) => (
    <th key={columnKey(column)} className={`group ${headingCellClass(column)}`}>
      <div className="flex items-center gap-1">
        {column.kind === "builtin" ? (
          <span className={`${HEAD_LABEL} truncate`}>{column.label}</span>
        ) : (
          <>
            {/* §6.1, the owner's ask: a column's heading is a text box in the grid.
                It arrived empty; it is named here. */}
            <ColumnHeading
              column={column.column}
              autoFocus={newColumnId === column.column.id}
              onRename={(label) => props.onDraft(renameColumn(draft, column.column.id, label))}
            />
            {/* What it holds, on its own heading line — the one thing the removed
                form asked for that has nowhere else to be. Quiet until the pointer
                or the keyboard is on it, like every other control in this grid. */}
            <button
              type="button"
              aria-label={`What the ${column.column.label || "new"} column holds`}
              className={`flex h-6 shrink-0 items-center rounded px-1 text-xs text-muted transition-colors hover:bg-bg/50 hover:text-text ${REVEAL}`}
              onClick={(event) => {
                if (menu?.id === column.column.id) {
                  setMenu(null);
                  return;
                }
                const box = event.currentTarget.getBoundingClientRect();
                menuRoot.current = event.currentTarget.closest("th");
                setMenu({ id: column.column.id, anchor: { left: box.left, top: box.bottom + 4 } });
              }}
            >
              {cellTypeLabel(column.column.cellType)}
            </button>
            <ColumnX
              column={column.column}
              removable={!columnHoldsValue(draft, column.column)}
              armed={props.armed === column.column.id}
              onArm={props.onArm}
              onRemove={props.onRemoveColumn}
            />
          </>
        )}
        {/* §6.1: the heading `+` inserts *there*, into the reader's own columns. A
            builtin has no position of its own to insert at — the leads are the
            table's, not a column's — and the Types table has none to add. */}
        {table !== "types" && column.kind === "custom" ? (
          <InsertButton
            label={`Insert a column before ${column.column.label || "this one"}`}
            onPress={() =>
              // The index `addColumn` wants counts that scope's own columns, and a
              // record table draws its builtins first — so those are not positions.
              // Counted over **every** column rather than the drawn ones: a column
              // the reader has hidden still stands where it stands.
              addColumnAt(
                allColumns
                  .slice(0, allColumns.indexOf(column))
                  .filter((row) => row.kind === "custom").length,
              )
            }
          />
        ) : null}
        {/* The toolbar's `Edit table` (the owner's round 17), and the second half of
            its ask: a heading gets an `×` that takes the column out of the **view**.
            The column is not deleted — it still holds its values and a plan's Display
            can still name it — which is what makes this safe to offer on a builtin
            like `Location` as well as on a column the reader added. */}
        {props.editingColumns ? (
          <button
            type="button"
            aria-label={`Remove the ${columnLabelOf(column)} column from this table`}
            title="Remove this column from the table"
            onClick={() => props.onToggleColumn(columnKey(column))}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-bg/50 hover:text-destructive active:scale-95"
          >
            ✕
          </button>
        ) : null}
      </div>
    </th>
  );

  /** The last heading cell: `＋` appends a column. A type's table has none to add —
   *  its columns are its meditations'. */
  const addColumnCell = () => (
    <th className={`${HEAD_CELL} w-10 px-1`}>
      {table === "types" ? null : (
        <button
          type="button"
          aria-label="Add a column at the end"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-surface-raised hover:text-text active:scale-95"
          onClick={() => addColumnAt()}
        >
          ＋
        </button>
      )}
    </th>
  );

  return (
    // `data-table` names the *kind* of table, not the generated id: a type's table
    // is a meditation table whatever type it belongs to, so the attribute stays
    // stable while its rows and its columns do not (the owner's round 15).
    // `data-type-id` is the type it belongs to, for a test that has to tell two of
    // them apart.
    <section
      className="flex flex-col gap-3"
      data-table={meditationTableTypeId(table) ? "meditation" : table}
      data-type-id={meditationTableTypeId(table) ?? undefined}
    >
      {table === "entries" ? (
        // Karuna (§5.1): the meditation is the table's **heading** now, so the table
        // is one per meditation and the stack is what "all of them" looks like. The
        // selector filters that same stack rather than being a second way to reach
        // the rows — which is why it is drawn here and not as a filter on a flat
        // list.
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
            <span className={EYEBROW_CLASS}>Meditation</span>
            {/* The same searchable auto-complete the cells use: nothing in this app
                is a `<select>`, and a heading is worth searching for. A meditation
                with no symbol-carrying row is not in the list, so choosing one can
                never open an empty table. */}
            <ChipPicker
              value={karunaFor ?? ""}
              label={karunaPicked?.name ?? "All meditations"}
              placeholder="Find a meditation"
              options={karunaAll
                .filter((group) => group.meditationId !== null)
                .map((group) => ({ id: group.meditationId!, label: group.name }))}
              records={props.records}
              onPick={(id) => setKarunaFor(id)}
              onClear={() => setKarunaFor(null)}
            />
          </div>
          {karunaVisible.map((group) => (
            <section
              key={group.meditationId ?? "none"}
              data-karuna-group={group.meditationId ?? "none"}
              className="flex flex-col rounded-2xl border border-line bg-surface"
            >
              {/* The heading sits *outside* the table's own scroll container, and
                  that is load-bearing: a sticky element cannot escape an
                  `overflow` ancestor, so a heading inside it would stick to the
                  table's own top and never to the reader's view. This is what
                  updates as the stack scrolls: each heading holds the top until
                  the next one pushes it up (§5.1). */}
              <h3
                data-karuna-heading=""
                className="sticky top-0 z-30 rounded-t-2xl border-b border-line bg-surface px-4 py-2 text-sm font-medium text-text"
              >
                {group.name}
              </h3>
              <div className="overflow-x-auto">
                {/* One drag context per heading. A row's owner is what its symbol
                    chip says, so a drag that could cross a heading would
                    re-associate the row — a data change disguised as an order
                    change — and its own context cannot offer that drop at all
                    (§5.1). The order *inside* the heading still works. */}
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event) => {
                    if (!event.over || event.active.id === event.over.id) return;
                    dropInGroup(group, String(event.active.id), String(event.over.id));
                  }}
                >
                  <table className="w-full min-w-[40rem] border-separate border-spacing-0 text-left text-base">
                    <thead>
                      <tr className="bg-surface">
                        <th className={`${HEAD_LEAD} w-24 min-w-24`}>
                          <span className="sr-only">Row</span>
                        </th>
                        <th className={`${HEAD_SYMBOL_LEAD} w-40`}>
                          <span className={HEAD_LABEL}>Symbol</span>
                        </th>
                        <th className={HEAD_CELL}>
                          <span className={HEAD_LABEL}>Intentions</span>
                        </th>
                        {columns.map((column) => headingCell(column))}
                        {addColumnCell()}
                      </tr>
                    </thead>
                    <tbody>
                      <SortableContext
                        items={group.rows.map((row) => row.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {group.rows.map((row, index) => (
                          <Fragment key={row.id}>
                            <SortableRow id={row.id}>
                              {(handle) => (
                                <>
                                  {/* The row's own controls, and nothing else: the
                                      meditation is the heading above it now, so
                                      this cell carries what a reader does *to* the
                                      row rather than what the row is made of. */}
                                  <td className={`${BODY_LEAD} w-24 min-w-24`}>
                                    <div className="flex items-center gap-1">
                                      <RowHandle
                                        row={row}
                                        attributes={handle.attributes}
                                        listeners={handle.listeners}
                                      />
                                      <RowX
                                        id={row.id}
                                        draft={row.isNew}
                                        armed={props.armed === row.id}
                                        notice={props.armed === row.id ? props.notice : null}
                                        onArm={props.onArm}
                                        onArchive={() => props.onArchiveEntry(row)}
                                        onRemove={() => props.onRemoveEntry(row)}
                                      />
                                      <InsertButton
                                        label="Insert a row here"
                                        onPress={() =>
                                          props.onDraft(
                                            addKarunaRow(draft, group.meditationId, index),
                                          )
                                        }
                                      />
                                    </div>
                                  </td>
                                  <td className={`${BODY_SYMBOL_LEAD} w-40`}>
                                    <div className="flex items-center gap-1">
                                      <ChipPicker
                                        value={row.symbolId ?? ""}
                                        label={
                                          props.records.symbols.find(
                                            (s) => s.id === row.symbolId,
                                          )?.name ?? "＋ symbol"
                                        }
                                        placeholder="Find a symbol"
                                        options={props.records.symbols
                                          .filter((s) => s.archivedAt == null)
                                          .map((s) => ({ id: s.id, label: s.name }))}
                                        records={props.records}
                                        onPick={(id) =>
                                          props.onDraft((current) =>
                                            replaceEntry(current, row.id, { symbolId: id }),
                                          )
                                        }
                                        onOpen={() =>
                                          row.symbolId &&
                                          props.onOpenRecord("symbols", row.symbolId)
                                        }
                                        onClear={() =>
                                          props.onDraft((current) =>
                                            replaceEntry(current, row.id, { symbolId: null }),
                                          )
                                        }
                                        onCreate={async (name) => {
                                          const id = await props.onCreateRecord("symbols", name);
                                          if (id) {
                                            props.onDraft((current) =>
                                              replaceEntry(current, row.id, { symbolId: id }),
                                            );
                                          }
                                          return id;
                                        }}
                                      />
                                    </div>
                                  </td>
                                  <td className={BODY_CELL}>
                                    {/* On a phone the lines open in a focused editor
                                        below the row (§6.3): the grid stays
                                        readable instead of growing a row. */}
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-muted transition hover:bg-bg/40 hover:text-text sm:hidden"
                                      onClick={() => setLinesEditorFor(row.id)}
                                    >
                                      <span aria-hidden="true">☰</span>
                                      {`${linesOf(draft, row.id).length} intentions`}
                                    </button>
                                    <div className="hidden sm:block">
                                      <LinesCell
                                        lines={linesOf(draft, row.id)}
                                        onAdd={() => props.onDraft(addLine(draft, row.id))}
                                        onEdit={editLine}
                                        armedId={props.armed}
                                        onArm={props.onArm}
                                        onMoveUp={(id) =>
                                          props.onDraft(moveLine(draft, row.id, id, -1))
                                        }
                                        onMoveDown={(id) =>
                                          props.onDraft(moveLine(draft, row.id, id, 1))
                                        }
                                        onMoveTo={(id, to) =>
                                          props.onDraft(moveLineTo(draft, row.id, id, to))
                                        }
                                      />
                                    </div>
                                  </td>
                                  {columns.map((column) =>
                                    column.kind === "custom" ? (
                                      <td key={columnKey(column)} className={BODY_CELL}>
                                        <TextCell
                                          value={cellFor(column, {
                                            id: row.id,
                                            name: "",
                                            builtins: {},
                                            source: row,
                                          })}
                                          label={`${rowLabel(row, props.records, index)} — ${
                                            column.column.label
                                          }`}
                                          long={column.column.cellType === "longText"}
                                          numeric={column.column.cellType === "number"}
                                          onCommit={(text) =>
                                            setValue(row.id, column.column.id, text)
                                          }
                                        />
                                      </td>
                                    ) : null,
                                  )}
                                  <td className={TAIL_CELL} />
                                </>
                              )}
                            </SortableRow>
                            {linesEditorFor === row.id
                              ? focusedLines(row.id, linesOf(draft, row.id), () =>
                                  props.onDraft(addLine(draft, row.id)),
                                )
                              : null}
                          </Fragment>
                        ))}
                      </SortableContext>
                      {/* §5.1's `＋` is the heading's own row: a new row is a row of
                          *this* meditation, because that is what the heading says it
                          is. `Add a row` is the same invitation every table ends
                          with, scoped here to the heading it belongs to. */}
                      <tr className="bg-surface">
                        <td colSpan={columnCount} className="px-1 py-1">
                          <button
                            type="button"
                            aria-label="Add a row"
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted transition hover:bg-surface-raised hover:text-text active:scale-[0.99]"
                            onClick={() =>
                              props.onDraft(
                                addKarunaRow(draft, group.meditationId, group.rows.length),
                              )
                            }
                          >
                            <span aria-hidden="true">＋</span>
                            New row
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </DndContext>
              </div>
            </section>
          ))}
        </div>
      ) : (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        {/* One surface, not a scatter of cells on the page background: the card is
            what makes the header band and the row hairlines read as a table. */}
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="overflow-x-auto">
        {/* `min-w-[40rem]` rather than `min-w-max`: a max-content floor was what
            kept the grid wider than a 1024-wide laptop, so the table scrolled
            sideways on a screen with room to spare. This still parts the columns
            on a phone — where the sideways scroll is the point — and lets them
            give way on a desktop that is merely narrower. */}
        <table className="w-full min-w-[40rem] border-separate border-spacing-0 text-left text-base">
          <thead>
            <tr className="bg-surface">
              {/* The leading cell: what a reader does *to* the row. What the row
                  *is* is the column pinned beside it — its `Name` (§5.4) — because a
                  record table is scanned down its name. `w-32 min-w-32` is that pin's
                  own `left-32`, clamped from both sides: a width alone is ignored on a
                  table at minimum layout and a minimum alone is grown past on one with
                  slack. */}
              <th className={`${HEAD_LEAD} w-32 min-w-32`}>
                <span className="sr-only">Row</span>
              </th>
              {columns.map((column) => headingCell(column))}
              {addColumnCell()}
            </tr>
          </thead>
          <tbody>
            <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
            {table === "affirmations"
              ? // A sentence is a line of the draft, not a record, so its row is
                // drawn from the lines themselves: the drag handle and the `×` are
                // the ones an entry's intentions carry, and the two cells are the
                // sentence and the pair it is written about (§5.2).
                sentenceList.map((row) => (
                  <SortableRow key={row.line.id} id={row.line.id}>
                    {(handle) => (
                      <>
                    <td className={BODY_LEAD}>
                      <div className="flex items-center gap-1">
                        <RowHandle
                          row={row.line}
                          attributes={handle.attributes}
                          listeners={handle.listeners}
                        />
                        {/* §4: the same `×` → box a line has everywhere else,
                            because that is what a sentence is — the box names
                            what it is about to do, and `describe` already answers
                            for a line. */}
                        <RowX
                          id={row.line.id}
                          draft={row.line.isNew}
                          armed={props.armed === row.line.id}
                          notice={props.armed === row.line.id ? props.notice : null}
                          onArm={props.onArm}
                          onArchive={() => props.onArchiveLine(row.line)}
                          onRemove={() => props.onRemoveLine(row.line)}
                        />
                        <InsertButton
                          label="Insert a sentence here"
                          onPress={() => insertSentence(row)}
                        />
                      </div>
                    </td>
                    {columns.map((column) => (
                      <td key={columnKey(column)} className={bodyCellClass(column)}>
                        {sentenceCell(column, row)}
                      </td>
                    ))}
                    <td className={TAIL_CELL} />
                      </>
                    )}
                  </SortableRow>
                  ))
                : recordRows(table).map((record) => (
                  <Fragment key={record.id}>
                  <SortableRow id={record.id}>
                    {(handle) => (
                      <>
                    <td className={BODY_LEAD}>
                      <div className="flex items-center gap-1">
                        <RowHandle
                          row={record}
                          attributes={handle.attributes}
                          listeners={handle.listeners}
                        />
                        {/* `Open` only for a record that has a page: a type's row is
                            edited in the grid, so it would be a control that cannot
                            act. */}
                        {recordPage ? (
                          <button
                            type="button"
                            className={`rounded-md px-2 py-1 text-sm text-muted transition hover:bg-bg/50 hover:text-text active:scale-95 ${REVEAL}`}
                            onClick={() => props.onOpenRecord(recordPage, record.id)}
                          >
                            Open
                          </button>
                        ) : null}
                        {/* §4: a record's row carries the same `×` → box as an
                            entry's row does — Archive on one tap, Remove on two. A
                            record's permanent delete is still offered only on the
                            Archive page; the box here names what it would take. */}
                        <RowX
                          id={record.id}
                          draft={record.isNew}
                          armed={props.armed === record.id}
                          notice={props.armed === record.id ? props.notice : null}
                          onArm={(id) => {
                            props.onArm(id);
                            if (id) void props.onDescribeRecord(table, id);
                          }}
                          onArchive={() => props.onArchiveRecord(table, record.id)}
                          onRemove={() => props.onRemoveRecord(table, record.id)}
                        />
                      </div>
                    </td>
                    {columns.map((column) => (
                      <td key={columnKey(column)} className={bodyCellClass(column)}>
                        {recordControl(column, record)}
                      </td>
                    ))}
                    <td className={TAIL_CELL} />
                      </>
                    )}
                  </SortableRow>
                  {/* §6.3's phone path, for the meditation tables' own Intentions
                      cell: the row opens the focused editor instead of growing. */}
                  {linesEditorFor === meditationEditorKey(record.id)
                    ? focusedLines(
                        meditationEntry(draft, record.id)?.id ?? null,
                        meditationLines(draft, record.id),
                        () => addMeditationIntent(record.id),
                      )
                    : null}
                  </Fragment>
                ))}
            </SortableContext>
            {/* The foot of the grid is a row that reads as an invitation, not as a
                stray `＋` in an empty cell: this is Notion's `New`, and it is the
                one place a reader adds a row without aiming at a heading. */}
            <tr className="bg-surface">
              <td colSpan={columnCount} className="px-1 py-1">
                <button
                  type="button"
                  aria-label={`Add ${withArticle(recordNoun(table))}`}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted transition hover:bg-surface-raised hover:text-text active:scale-[0.99]"
                  onClick={() => {
                    // A row arrives **here**, to type into. Only a preset keeps its
                    // own page — its sound is the point of it, and that page is
                    // where the owner wants presets made. Karuna draws this
                    // invitation per heading instead: its rows belong to one.
                    if (table === "affirmations") {
                      // A new sentence arrives an orphan (§5.2): nothing is written
                      // about it until the reader says so.
                      const { draft: next, id } = addSentence(draft);
                      props.onDraft(next);
                      setNewRowId(id);
                      return;
                    }
                    if (table === "presets") {
                      props.onNewRecord(table);
                      return;
                    }
                    const { draft: next, record } = addRecord(draft, table, props.workspaceId, props.types);
                    props.onDraft(next);
                    setNewRowId(record.id);
                  }}
                >
                  <span aria-hidden="true">＋</span>
                  New {recordNoun(table)}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        </div>
        </div>
      </DndContext>
      )}

      {/* A column's own menu: what it holds and what it is for. It floats under the
          heading line it belongs to — the owner's "no need for a new menu at the
          bottom of the page" — and the heading itself is edited in the grid. */}
      {menu && draft.columns.some((row) => row.id === menu.id) ? (
        <ColumnMenu
          column={draft.columns.find((row) => row.id === menu.id)!}
          anchor={menu.anchor}
          rootRef={menuRoot}
          onPatch={(patch) => patchColumn(menu.id, patch)}
          onClose={() => setMenu(null)}
        />
      ) : null}

      {/* The legend sits with the screen's action, which is Save in the bar below
          — here it is only the reminder of what `Esc` does while a cell is open.
          A `div`, not a `p`: the hints are a list, and a list inside a paragraph is
          invalid HTML — React says so as a hydration error in the console. */}
      <div className="text-sm text-muted">
        <KeyHints hints={[{ keys: ["Esc"], label: "cancel the cell, then back" }]} />
      </div>
    </section>
  );
}

function columnKey(column: GridColumn): string {
  return column.kind === "builtin" ? `builtin:${column.key}` : `column:${column.column.id}`;
}

/** What a column's heading reads, for its own controls' accessible names. */
function columnLabelOf(column: GridColumn): string {
  return column.kind === "builtin" ? column.label : column.column.label || "new";
}

/**
 * A custom column's heading, as a text box in the grid.
 *
 * The owner's ask: "adding a column should literally add a column, header should
 * look like a textbox and the cells below should also look like text boxes that I
 * can fill." So a heading is a live control like a cell is: it holds what is being
 * typed, commits on `Enter` or on blur, and `Escape` puts the stored heading back
 * without reaching the screen's own `Escape` (§12.25).
 */
function ColumnHeading({
  column,
  autoFocus,
  onRename,
}: {
  column: DraftColumn;
  /** A column that has just landed takes the keyboard, so naming it is one step. */
  autoFocus: boolean;
  onRename: (label: string) => void;
}) {
  const [heading, setHeading] = useState(column.label);
  const ref = useRef<HTMLInputElement>(null);
  /** What the draft last said, so the sync below cannot fire on mount and steal the
   *  focus this component was just given. */
  const synced = useRef(column.label);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  // The draft is the truth: a save derives the column's key and a create from a
  // search bar can name it, and the box follows either.
  useEffect(() => {
    if (synced.current === column.label) return;
    synced.current = column.label;
    setHeading(column.label);
  }, [column.label]);
  return (
    <input
      ref={ref}
      value={heading}
      aria-label={column.label ? `${column.label} column heading` : "New column heading"}
      placeholder="Untitled"
      onChange={(event) => setHeading(event.target.value)}
      onBlur={() => onRename(heading)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
          return;
        }
        if (event.key === "Escape") {
          event.stopPropagation();
          setHeading(column.label);
        }
      }}
      className="min-w-24 rounded-md bg-transparent px-1 py-0.5 text-sm font-medium text-text outline-none transition-colors placeholder:text-muted/50 hover:bg-bg/40 focus:bg-bg focus:ring-2 focus:ring-accent/40"
    />
  );
}

/**
 * A custom column's `X`.
 *
 * §4: the control is **not drawn** once the column holds a value, and the press is
 * a single one because there is nothing to protect — the empty-only rule already
 * is the safety net. That is also why a control that cannot do anything is not
 * drawn rather than drawn disabled.
 */
function ColumnX({
  column,
  removable,
  armed,
  onArm,
  onRemove,
}: {
  column: DraftColumn;
  removable: boolean;
  armed: boolean;
  onArm: (id: string | null) => void;
  onRemove: (column: DraftColumn) => void;
}) {
  if (!removable) return null;
  return (
    <button
      type="button"
      aria-label={`Remove the ${column.label} column`}
      className={`rounded px-1 text-muted transition-colors hover:bg-destructive/15 hover:text-destructive ${
        armed ? "opacity-100" : REVEAL
      }`}
      onMouseDown={(event) => {
        event.preventDefault();
        if (armed) {
          onArm(null);
          onRemove(column);
          return;
        }
        onRemove(column);
      }}
    >
      ×
    </button>
  );
}

/**
 * A row's `X` → box: **Archive** on one tap, **Remove** on two (§4, §12.22).
 *
 * The box names what it is about to do, because a line's `X` and a row's `X` look
 * the same and do different things. The cost sentence comes from the application
 * (`getDeletionImpact`) and is passed in as `notice`, so the wording lives in one
 * place.
 *
 * A row the store has never seen collapses to one action: there is nothing to
 * archive, so `Archive` is not drawn for it and the sentence says why.
 */
const DRAFT_ROW_NOTICE = "Not saved yet — removing it drops the row.";

function RowX({
  id,
  draft = false,
  armed,
  notice,
  onArm,
  onArchive,
  onRemove,
}: {
  id: string;
  /** The row is a draft: never stored, so only `Remove` means anything. */
  draft?: boolean;
  armed: boolean;
  notice: string | null;
  onArm: (id: string | null) => void;
  onArchive: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-col items-start gap-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={draft ? "Remove this row" : "Archive this row, or remove it"}
          className={`rounded px-1 text-muted transition-colors hover:bg-destructive/15 hover:text-destructive ${
            armed ? "opacity-100" : REVEAL
          }`}
          onClick={() => onArm(armed ? null : id)}
        >
          ×
        </button>
        {armed ? (
          <>
            {draft ? null : (
              <Button size="sm" tier="tertiary" onClick={onArchive}>
                Archive
              </Button>
            )}
            <Button size="sm" tier="destructive" onClick={onRemove}>
              Remove
            </Button>
          </>
        ) : null}
      </div>
      {armed && (draft || notice) ? (
        <p className="text-sm text-destructive">{draft ? DRAFT_ROW_NOTICE : notice}</p>
      ) : null}
    </div>
  );
}

/** The listener props a sortable gives its handle, whatever dnd-kit calls them. */
type HandleListeners = ReturnType<typeof useSortable>["listeners"];

/** The heading `+`: light, always there on a phone, on hover and focus on a computer. */
function InsertButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`flex h-6 w-6 items-center justify-center rounded text-xs text-muted transition hover:bg-bg/50 hover:text-text active:scale-95 ${REVEAL}`}
      onClick={onPress}
    >
      ＋
    </button>
  );
}

/**
 * One grid row, and the handle props the row's own cell spreads onto its grip.
 *
 * The transform is dnd-kit's and it is only in play *during* the drag: the drop
 * itself writes the order and re-renders, which is the rule §6.1 asks for. A table
 * row can carry a transform, so the <tr> is the sortable node and no wrapper is
 * needed around the table.
 */
function SortableRow({
  id,
  children,
}: {
  id: string;
  children: (handle: {
    attributes: DraggableAttributes;
    listeners: HandleListeners;
  }) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`${ROW} ${isDragging ? "opacity-60" : ""}`}
    >
      {children({ attributes, listeners })}
    </tr>
  );
}

/**
 * The grip, and the whole of a row's reordering.
 *
 * `↑`/`↓` sat beside it until the owner's round 14 — "since there already is a
 * handle for dragging and dropping, the up down arrows are not required". That
 * reverses §12.30, which had kept the pair for anyone who could not use the
 * keyboard sensor; the keyboard sensor is still the second way in (Space, arrows,
 * Space), and the handle it lands on says so through its own `aria-label`.
 */
function RowHandle({
  row,
  attributes,
  listeners,
}: {
  row: { id: string };
  attributes: DraggableAttributes;
  listeners: HandleListeners;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1" data-row={row.id}>
      <button
        type="button"
        aria-label="Drag row"
        className={`touch-none cursor-grab rounded px-0.5 text-base text-muted transition-colors hover:text-text ${REVEAL}`}
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true">⠿</span>
      </button>
    </div>
  );
}

function replaceEntry(draft: DraftState, id: string, patch: Partial<DraftEntry>): DraftState {
  return { ...draft, entries: draft.entries.map((row) => (row.id === id ? { ...row, ...patch } : row)) };
}

/**
 * What a row of Karuna is called, for a cell's accessible name.
 *
 * A row is a chakra, a symbol, or a pair, and it has no name of its own — so the
 * name is the pair, by the names the reader sees, and `Row 3` is what is left when
 * neither side has been chosen yet.
 */
function rowLabel(row: DraftEntry, records: CellRecords, index: number): string {
  const name = (id: string | null, kind: "meditation" | "symbol"): string | null => {
    if (!id) return null;
    const found =
      kind === "meditation"
        ? records.meditations.find((item) => item.id === id)?.name
        : records.symbols.find((item) => item.id === id)?.name;
    return found ?? null;
  };
  const parts = [name(row.meditationId, "meditation"), name(row.symbolId, "symbol")].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" × ") : `Row ${index + 1}`;
}


function moveLine(draft: DraftState, entryId: string | null, id: string, delta: number): DraftState {
  const rows = linesOf(draft, entryId);
  const from = rows.findIndex((row) => row.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= rows.length) return draft;
  return moveLineTo(draft, entryId, id, to);
}

/** A dropped line's place, counted among that entry's own lines (§6.3). */
function moveLineTo(
  draft: DraftState,
  entryId: string | null,
  id: string,
  to: number,
): DraftState {
  const rows = linesOf(draft, entryId);
  const from = rows.findIndex((row) => row.id === id);
  if (from < 0) return draft;
  const [moved] = rows.splice(from, 1);
  if (!moved) return draft;
  rows.splice(Math.max(0, Math.min(to, rows.length)), 0, moved);
  const order = new Map(rows.map((row, index) => [row.id, index]));
  return {
    ...draft,
    lines: draft.lines.map((line) =>
      line.entryId === entryId && order.has(line.id)
        ? { ...line, sortOrder: order.get(line.id)! }
        : line,
    ),
  };
}

/**
 * The key a meditation's focused line editor is remembered under.
 *
 * An ordinary row's editor is keyed by the **entry** its lines hang off. A
 * meditation's own lines hang off a row that may not exist yet — the reader has
 * never written about this meditation alone — so the meditation is the handle, and
 * the prefix is what keeps the two kinds of key from colliding.
 */
function meditationEditorKey(meditationId: string): string {
  return `meditation:${meditationId}`;
}

/**
 * A dropped sentence's place, counted among the sentences written about the same
 * thing (§5.2).
 *
 * A sentence's order is its order **inside its group** — the row it is written
 * about, or the orphans — because that is the order the store keeps and the one a
 * reload restores. A drop onto a sentence written about something else is not a
 * move: it would re-associate the row, which is a data change disguised as an
 * order change (the rule §5.1 states for Karuna's rows).
 */
function moveSentence(draft: DraftState, id: string, overId: string): DraftState {
  const line = draft.lines.find((row) => row.id === id);
  if (!line) return draft;
  const to = linesOf(draft, line.entryId).findIndex((row) => row.id === overId);
  if (to < 0) return draft;
  return moveLineTo(draft, line.entryId, id, to);
}

/** A record table's rows, with one of them moved to a new place. */
function recordsWith(
  draft: DraftState,
  table: DatabaseTable,
  id: string,
  patch: (row: DraftState["meditations"][number]) => DraftState["meditations"][number],
  to?: number,
): Partial<DraftState> {
  const typeId = meditationTableTypeId(table);
  const key: "meditations" | "symbols" | "presets" | "types" =
    table === "symbols"
      ? "symbols"
      : table === "presets"
        ? "presets"
        : table === "types"
          ? "types"
          : "meditations";
  // A type's table is a filter over the one meditation list, so it patches and
  // reorders its own subset and puts it back.
  const rows =
    key === "meditations" && typeId
      ? draft.meditations.filter((row) => recordMeditationTypeId(row) === typeId)
      : draft[key];
  const patched = rows.map((row) => (row.id === id ? patch(row) : row));
  const from = patched.findIndex((row) => row.id === id);
  let ordered = patched;
  if (to !== undefined && from >= 0) {
    const next = [...patched];
    const [moved] = next.splice(from, 1);
    if (moved) {
      next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
      ordered = next;
    }
  }
  const reordered = ordered.map((row, index) => ({ ...row, sortOrder: index }));
  if (key !== "meditations" || !typeId) return { [key]: reordered };
  const rest = draft.meditations.filter((row) => recordMeditationTypeId(row) !== typeId);
  return { meditations: [...rest, ...reordered] };
}

/** A new option for a `select` column, in the draft (§6.4's "add as a new option"). */
export function withNewOption(
  draft: DraftState,
  column: DraftColumn,
  label: string,
): DraftState {
  return addOption(draft, column.id, label).draft;
}

export type { DraftColumn, DraftLine };
