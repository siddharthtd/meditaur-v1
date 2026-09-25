"use client";

import { useSession } from "@/features/auth/SessionProvider";
import { Button, KeyHints } from "@meditaur/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BinauralPreset, Meditation, Symbol } from "@meditaur/domain";
import type { LibraryView, MeditaurApp } from "@meditaur/application";
import { errorText } from "@/lib/error-text";
import {
  databaseTables,
  parseDatabaseTable,
  DATABASE_COLUMNS_KEY,
  DATABASE_TABLE_KEY,
  DATABASE_HINT_KEY,
  recordTableOf,
  type DatabaseTable,
  type MeditationTable,
  type RecordTable,
} from "./database-tables";
import {
  addOption,
  addRecord,
  commitDatabaseDraft,
  draftFromLibrary,
  dropRecord,
  emptyRecord,
  mergeRecords,
  recordsOf,
  type DatabaseWrites,
  type DraftColumn,
  type DraftEntry,
  type DraftLine,
  type DraftState,
} from "./database-model";
import { DatabaseTable as Grid } from "./DatabaseTable";
import { activeFilters } from "./grid-filter";
import type { CellRecords } from "./DatabaseCells";

/**
 * What another screen asked the Database to do on the way in.
 *
 * Two things, and both are **creating**. `Add …` on a browse tab wants a **row in the
 * grid** to type into — the owner's ask — and `Add preset` wants an empty preset in its
 * editor, because a preset with no row in the store has no id for an address to name.
 * The request travels in the address (`database-route.ts`), which is what makes it
 * survive the navigation.
 *
 * Opening an **existing** record is not here any more: the owner's round 22 gave a record
 * an address of its own (`record-route.ts`), where one screen reads it and edits it in
 * place. Round 20's `record` kind and its `edit` predecessor are both gone with the second
 * screen they used to open.
 *
 * Since the owner's round 15 a grid request names a **generated** table: the shared
 * Symbols table, or one meditation type's table (`meditation:<id>`). The library's
 * `Add` on a type's tab is what sends the second.
 */
export type DatabaseRequest =
  | { kind: "add"; table: GridTable }
  | { kind: "new-record"; table: "presets" };

/** The tables a grid request can name: Symbols, or one type's meditations. */
export type GridTable = "symbols" | MeditationTable;

/** The half of a request the grid itself can act on. */
export type GridRequest = Extract<DatabaseRequest, { kind: "add" }>;

/**
 * The Database tab (§5–§7).
 *
 * It owns one thing the rest of the library does not: a **draft**. Rows, lines,
 * columns, options and cell values are edited here and stored by `Save`; leaving
 * discards, which is the one place in this app where that is true and the reason
 * leaving is interrupted (§12.24). The record tables' own rows are edited on the
 * record view instead, which is that record's editor — see `DatabaseRecord`.
 */
export function DatabaseTab({
  app,
  workspaceId,
  view,
  imageUrls,
  onReload,
  onOpenRecord,
  onNewRecord,
  onOpenBinaural,
  request,
  onRequestHandled,
  onDirtyChange,
  onError,
  onLeave,
}: {
  app: MeditaurApp;
  workspaceId: string;
  view: LibraryView;
  imageUrls: Record<string, string>;
  onReload: () => Promise<void>;
  onOpenRecord: (table: RecordTable, id: string) => void;
  onNewRecord: (table: RecordTable) => void;
  /** The binaural config is a whole screen, so a column of the grid opens it. */
  onOpenBinaural: (focus: Meditation) => void;
  /** What the library asked for on the way in, acted on once. */
  request: GridRequest | null;
  onRequestHandled: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onError: (message: string | null) => void;
  onLeave: () => void;
}) {
  const { flags } = useSession();
  /**
   * The tables the strip offers (`P0 · 35`, slice 35c).
   *
   * Asked once here, because three things read the same list: the rail, the current
   * table's label, and which table a plain `/database` lands on. The rows behind the
   * two Karuna tables are untouched — this is the door, not the data.
   */
  const tables = useMemo(
    () => databaseTables(view.meditationTypes, flags),
    [view.meditationTypes, flags],
  );
  const [table, setTable] = useState<DatabaseTable>(() =>
    parseDatabaseTable(safeSession(DATABASE_TABLE_KEY), view.meditationTypes, flags),
  );
  const [baseline, setBaseline] = useState<DraftState>(() => draftFromLibrary(view));
  const [draft, setDraft] = useState<DraftState>(() => draftFromLibrary(view));
  const [armed, setArmed] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /**
   * The grid's three **view** settings, which are the reader's and nobody else's.
   *
   * The owner's round 17: *"Add filter functionality to all the tabs in the database
   * based on the key … Columns should be able to be removed (Add an edit table
   * button which should enable x button next to every column heading which removes
   * the column where-ever not required by the user)."* None of the three is a draft
   * edit: a filter narrows what is drawn, and a hidden column is still stored, still
   * holds its values and is still something a plan's Display can name. That is why
   * they are state here rather than in `DraftState`, where they would make the screen
   * dirty for a change `Save` has nothing to write.
   */
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [editingColumns, setEditingColumns] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<Record<string, string[]>>(() =>
    readHiddenColumns(),
  );
  const [hintSeen, setHintSeen] = useState(() => safeSession(DATABASE_HINT_KEY) === "1");
  /** The row an `Add …` request wants the caret in. */
  const [focusRowId, setFocusRowId] = useState<string | null>(null);
  const loadedAt = useRef(view);
  /** Set by `Save`, so the reload it triggers is read as "this is stored". */
  const justSaved = useRef(false);
  const draftRef = useRef(draft);
  const baselineRef = useRef(baseline);
  draftRef.current = draft;
  baselineRef.current = baseline;
  /**
   * A picture that has been chosen but not written yet.
   *
   * A file input's `onChange` starts an asynchronous asset write and returns at
   * once, and React commits the patch it leaves behind later still — so a `Save`
   * pressed right after choosing a picture could store the row without it. Save
   * joins this and applies it itself, which is the race the record editor already
   * carries a fix for (`DatabaseRecord`'s `pendingPicture`).
   */
  const pendingPicture = useRef<Promise<((current: DraftState) => DraftState) | null> | null>(null);

  // A reload replaces the draft's starting point — after a Save, or after a row
  // was archived — and the draft follows it, because everything in it has been
  // written by then. A reload that arrives *while* there are unsaved edits cannot
  // safely do that, so it merges instead: that is what brings a record made from a
  // search bar into view without undoing the press that made it (`mergeRecords`).
  useEffect(() => {
    if (loadedAt.current === view) return;
    loadedAt.current = view;
    const next = draftFromLibrary(view);
    // A Save wrote everything in the draft, so the reloaded draft *is* what is
    // stored: it is taken whole and the screen is clean again. Without this the
    // baseline came from the view as it stood before the reload, and the screen
    // stayed "dirty" with nothing left to save.
    if (justSaved.current || sameDraft(draftRef.current, baselineRef.current)) {
      setDraft(next);
    } else {
      setDraft((current) => mergeRecords(current, next));
    }
    justSaved.current = false;
    setBaseline(next);
  }, [view]);

  const dirty = !sameDraft(draft, baseline);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  /**
   * Which table is in front of the reader.
   *
   * Defined **above** its first use — the effect below changes the table when a request
   * arrives — because `no-use-before-define` is on for every file now, and a `const` helper
   * called above its own line is a `ReferenceError` waiting for the one path that reaches it
   * (the owner's round 22, where exactly that took a whole screen down).
   */
  const changeTable = (next: DatabaseTable) => {
    setTable(next);
    setArmed(null);
    setNotice(null);
    // The filters belong to the tab they were typed in: a chakra's name means nothing
    // in the Presets table, and carrying them across would show a table the reader did
    // not ask to narrow. The column view *is* remembered per table, below.
    setFilters({});
    setEditingColumns(false);
    try {
      sessionStorage.setItem(DATABASE_TABLE_KEY, next);
    } catch {
      // The tab memory is a convenience; a browser that refuses it still works.
    }
  };

  /**
   * The library's `Add …`, acted on once.
   *
   * `Add` puts a record row **in the grid** to type into. It is the only request the
   * grid itself acts on: everything else that arrives in the address is a page, and
   * the shell takes it (`DatabaseScreen`).
   */
  useEffect(() => {
    if (!request) return;
    onRequestHandled();
    changeTable(request.table);
    const { draft: next, record } = addRecord(
      draftRef.current,
      request.table,
      workspaceId,
      view.meditationTypes,
    );
    setDraft(next);
    setFocusRowId(record.id);
  }, [request, onRequestHandled, workspaceId]);

  const records: CellRecords = useMemo(
    () => ({
      meditations: view.meditations,
      symbols: view.symbols,
      presets: view.presets,
    }),
    [view.meditations, view.symbols, view.presets],
  );

  /**
   * A remembered table that a flag hides falls back to the strip's landing table, the way
   * the library treats a remembered tab (`P0 · 35`, slice 35c).
   *
   * It matters because the table is **state** and the strip is only what draws it: a
   * reader whose Karuna is off would otherwise still be shown the Karuna grid after a
   * reload, with no button to leave it by.
   */
  useEffect(() => {
    // `changeTable` is a fresh closure each render and is deliberately not a dependency:
    // the guard above is what keeps this effect from doing anything on the renders where
    // the table is already offered.
    if (tables.some((row) => row.id === table)) return;
    changeTable(parseDatabaseTable(null, view.meditationTypes, flags));
  }, [tables, table, view.meditationTypes, flags]);

  /**
   * One heading's `×`: out of the view, not out of the store.
   *
   * Kept per table, so hiding a chakra's `Location` column does not hide the Symbols
   * table's `Description`, and remembered for the session the way the tab itself is
   * (`DATABASE_TABLE_KEY`) — a browser that refuses the storage still gets the
   * behaviour for as long as the screen is open.
   */
  const toggleColumn = (key: string) => {
    setHiddenColumns((current) => {
      const rows = current[table] ?? [];
      const next = {
        ...current,
        [table]: rows.includes(key) ? rows.filter((row) => row !== key) : [...rows, key],
      };
      writeHiddenColumns(next);
      return next;
    });
  };

  /**
   * One column's filter: opened with an empty text, narrowed as the reader types, and closed
   * by `null` (the heading's own `⌕`, or `Escape` in the input).
   *
   * It is state here rather than in the grid because it is a **view** setting, like the hidden
   * columns: it narrows what is drawn and `Save` has nothing to write. It stays in memory
   * rather than in `sessionStorage` because the old box did — a way of looking, not a setting.
   */
  const setColumnFilter = (key: string, value: string | null) => {
    setFilters((current) => {
      if (value !== null) return { ...current, [key]: value };
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  /** The filters that are actually narrowing something, for the sentence beside the toolbar. */
  const filtering = activeFilters(filters);
  /** The columns this table is not drawing.  */
  const hiddenHere = hiddenColumns[table] ?? [];
  /** `Edit table`'s escape hatch: put every column it can see back in the view. */
  const showAllColumns = () => {
    setHiddenColumns((current) => {
      const next = { ...current, [table]: [] };
      writeHiddenColumns(next);
      return next;
    });
  };

  const describe = useCallback(
    async (
      kind: "entry" | "line" | "meditation" | "meditationType" | "symbol" | "preset",
      id: string,
      mode: "archive" | "delete",
    ) => {
      try {
        setNotice(await app.getDeletionImpact(workspaceId, kind, id, mode));
      } catch {
        setNotice(null);
      }
    },
    [app, workspaceId],
  );

  /**
   * A record row's `×` → box: **Archive** on one tap, **Remove** on two (§4).
   *
   * A record's tables name their kinds differently from the application, so the
   * translation lives here rather than in the grid. The Types table is the one with
   * no page; a type is a record too (the owner's round 15), archived like one, and
   * removing one takes its meditations with it — the sentence `describe` fetches is
   * what says so.
   *
   * The Affirmations table is deliberately absent: its rows are **lines** now (§2.1),
   * not records, so the grid hands them to the line path instead — the same
   * archive-or-remove an intention inside Karuna already offers.
   */
  const recordKind = (
    table: DatabaseTable,
  ): "meditation" | "symbol" | "preset" | "meditationType" => {
    const page = recordTableOf(table);
    if (page === "symbols") return "symbol";
    if (page === "presets") return "preset";
    if (page === "meditation") return "meditation";
    return "meditationType";
  };

  const archiveRecordRow = async (table: DatabaseTable, id: string) => {
    setArmed(null);
    setNotice(null);
    try {
      await app.archiveRecord(workspaceId, recordKind(table), id);
      // The grid is a draft over the store, so hiding the row is this screen's job
      // as well: an archived record stops being drawn here at once.
      setDraft((current) => dropRecord(current, table, id));
      setBaseline((current) => dropRecord(current, table, id));
      await onReload();
    } catch (err) {
      setError(errorText(err, "Could not archive it"));
    }
  };

  const removeRecordRow = async (table: DatabaseTable, id: string) => {
    setArmed(null);
    setNotice(null);
    // The same rule as an entry row: a record the store has never seen is removed
    // by dropping it from the draft, because there is nothing else to remove.
    const rows = recordsOf(draft, table);
    if (rows.some((row) => row.id === id && row.isNew)) {
      setDraft((current) => dropRecord(current, table, id));
      return;
    }
    try {
      const page = recordTableOf(table);
      if (page === "meditation") await app.deleteMeditation(workspaceId, id);
      else if (page === "symbols") await app.deleteSymbol(workspaceId, id);
      else if (page === "presets") await app.deletePreset(workspaceId, id);
      else await app.deleteMeditationType(workspaceId, id);
      await onReload();
    } catch (err) {
      setError(errorText(err, "Could not remove it"));
    }
  };

  /** Writes one image asset and answers with it, so a cell can point at it. */
  const savePictureAsset = (file: File) =>
    file.arrayBuffer().then((bytes) =>
      app.saveMediaAsset({
        workspaceId,
        kind: "image",
        name: file.name,
        bytes,
        mimeType: file.type,
        durationMs: 0,
      }),
    );

  const writes: DatabaseWrites = useMemo(
    () => ({
      saveEntry: (entry) => app.saveEntry(entry),
      deleteEntry: (ws, id) => app.deleteEntry(ws, id),
      saveLine: (line) => app.saveLine(line),
      saveFieldDef: (def) => app.saveFieldDef(def),
      deleteFieldDef: (ws, id) => app.deleteFieldDef(ws, id),
      saveFieldOption: (option) => app.saveFieldOption(option),
      deleteFieldOption: (ws, id) => app.deleteFieldOption(ws, id),
      saveFieldValue: (value) => app.saveFieldValue(value),
      saveMeditation: (focus) => app.saveMeditation(focus),
      saveSymbol: (symbol) => app.saveSymbol(symbol),
      savePreset: (preset) => app.savePreset(preset),
      saveMeditationType: (row) => app.saveMeditationType(row),
      reorderEntries: (ws, ids) => app.reorderEntries(ws, ids),
      reorderLines: (ws, entryId, ids) => app.reorderLines(ws, entryId, ids),
      sweepOrphanedEntries: (ws, ids) => app.sweepOrphanedEntries(ws, ids),
    }),
    [app],
  );

  const save = async (): Promise<boolean> => {
    setError(null);
    setReport(null);
    setSaving(true);
    try {
      // Whatever a picture write has left in flight is part of this save.
      const pending = pendingPicture.current;
      pendingPicture.current = null;
      const patch = pending ? await pending : null;
      const swept = await commitDatabaseDraft({
        writes,
        workspaceId,
        before: baseline,
        draft: patch ? patch(draft) : draft,
      });
      // What is on screen *is* what is stored from here on, so the reload that
      // follows should take the draft whole (`justSaved`) rather than treat it as
      // a set of unsaved edits.
      justSaved.current = true;
      await onReload();
      setReport(sweepSentence(swept.names, swept.total));
      setNotice(null);
      setArmed(null);
      return true;
    } catch (err) {
      justSaved.current = false;
      setError(errorText(err, "Save failed"));
      onError(null);
      return false;
    } finally {
      setSaving(false);
    }
  };

  /**
   * A row's press, which now **leaves this screen**.
   *
   * A meditation's or a symbol's page is the library's (the owner's round 20), and a
   * preset's is this screen's own editor — either way the reader is going somewhere, and
   * this screen is holding the only copy of an unsaved cell. So the draft is written
   * first, which is the rule `Tune` already follows (`onOpenBinaural` below), and a save
   * that fails keeps the reader where they are.
   */
  const openRecord = async (which: RecordTable, id: string) => {
    if (dirty && !(await save())) return;
    onOpenRecord(which, id);
  };

  /**
   * Drops one row from the draft, and the lines written against it.
   *
   * This is the whole of removing a row the store has never seen: `deleteEntry`
   * looks the row up and answers a missing one by returning, so a `Remove` on a
   * just-inserted row used to close its box and change nothing — which read as a
   * control that was not working, or not even arming (the owner's round 14). A
   * draft row's lines live only in the draft too, so they go with it; otherwise
   * `commitDatabaseDraft` would write lines pointing at an entry with no row.
   */
  const dropDraftEntry = (id: string) => {
    setDraft((current) => ({
      ...current,
      entries: current.entries.filter((row) => row.id !== id),
      lines: current.lines.filter((line) => line.entryId !== id),
    }));
  };

  const archiveEntry = async (row: DraftEntry) => {
    setArmed(null);
    setNotice(null);
    // Never stored, so there is nothing to archive and nothing to restore: the
    // row exists only here, and dropping it *is* the act. The grid does not draw
    // `Archive` for a draft row — this is the guard behind that.
    if (row.isNew) {
      dropDraftEntry(row.id);
      return;
    }
    try {
      await app.archiveEntry(workspaceId, row.id);
      await onReload();
    } catch (err) {
      setError(errorText(err, "Could not archive the row"));
    }
  };

  const removeEntry = async (row: DraftEntry) => {
    setArmed(null);
    setNotice(null);
    if (row.isNew) {
      dropDraftEntry(row.id);
      return;
    }
    try {
      await app.deleteEntry(workspaceId, row.id);
      await onReload();
    } catch (err) {
      setError(errorText(err, "Could not remove the row"));
    }
  };

  /**
   * Drops one sentence from the draft **and** its baseline: it is archived or gone
   * now, and the grid should stop drawing it and stop calling the screen dirty for
   * it.
   *
   * This is the rule a record row already follows (`archiveRecordRow`), and a
   * sentence needs it for the same reason: waiting for the reload does not work
   * while the draft holds unsaved edits, because that reload **merges** — a merge
   * brings records in and leaves lines alone, so an archived or removed sentence
   * would sit in the grid until the next clean load.
   */
  const forgetLine = (id: string) => {
    const drop = (current: DraftState): DraftState => ({
      ...current,
      lines: current.lines.filter((line) => line.id !== id),
    });
    setDraft(drop);
    setBaseline(drop);
  };

  const archiveLine = async (line: DraftLine) => {
    setArmed(null);
    setNotice(null);
    try {
      await app.archiveLine(workspaceId, line.id);
      forgetLine(line.id);
      await onReload();
    } catch (err) {
      setError(errorText(err, "Could not archive the line"));
    }
  };

  const removeLine = async (line: DraftLine) => {
    setArmed(null);
    setNotice(null);
    // A sentence the store has never seen is removed by dropping it from the draft
    // and nothing else — the same rule a draft row follows. `deleteLine` looks the
    // line up and answers a missing one by returning, so the press otherwise closed
    // its box and changed nothing (the owner's round 14, which is why the row case
    // already has `dropDraftEntry`).
    if (line.isNew) {
      forgetLine(line.id);
      return;
    }
    try {
      await app.deleteLine(workspaceId, line.id);
      forgetLine(line.id);
      await onReload();
    } catch (err) {
      setError(errorText(err, "Could not remove the line"));
    }
  };

  /**
   * A column's `X`.
   *
   * A column that has never been stored is simply dropped from the draft; a stored
   * one that holds nothing is removed on the spot, because §4 draws that control
   * only while the column is empty and the empty-only rule already is the whole
   * safety net. There is nothing here for Save to protect.
   */
  const removeColumn = async (column: DraftColumn) => {
    setArmed(null);
    setError(null);
    if (column.isNew) {
      setDraft({
        ...draft,
        columns: draft.columns.filter((row) => row.id !== column.id),
      });
      return;
    }
    try {
      await app.deleteFieldDef(workspaceId, column.id);
      await onReload();
    } catch (err) {
      setError(errorText(err, "Could not remove the column"));
    }
  };

  /**
   * §6.2's context-aware create: a name typed into a reference or select search
   * bar that matches nothing is offered as a new record, made here and handed back
   * to the cell that asked for it.
   *
   * The new record is written straight to the store rather than into the draft —
   * a record is not a cell value — and the cell's own value still waits for Save
   * like every other edit on the screen.
   */
  const createRecord = async (
    kind: "meditation" | "symbols" | "presets",
    name: string,
    /** The table the control that asked was drawn in, when it is a cell's own. */
    drawnIn?: DatabaseTable,
  ): Promise<string | null> => {
    setError(null);
    try {
      const empty = emptyRecord(kind, workspaceId, view.meditationTypes, drawnIn);
      if (kind === "meditation") {
        const saved = await app.saveMeditation({ ...(empty.source as Meditation), name });
        await onReload();
        return saved.id;
      }
      if (kind === "symbols") {
        const saved = await app.saveSymbol({ ...(empty.source as Symbol), name });
        await onReload();
        return saved.id;
      }
      const saved = await app.savePreset({ ...(empty.source as BinauralPreset), name });
      await onReload();
      return saved.id;
    } catch (err) {
      setError(errorText(err, `Could not add the ${kind === "meditation" ? "meditation" : "record"}`));
      return null;
    }
  };

  /**
   * `Esc` goes back, and one press never does two things (§12.25).
   *
   * A cell that has the press has already stopped it, so this listener — which
   * sits above the tree, on `window` — only ever sees the press that means
   * "back". What "back" costs is the shell's business: it is the shell that asks
   * before unsaved edits are thrown away.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onLeave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onLeave]);

  const dismissHint = () => {
    setHintSeen(true);
    try {
      sessionStorage.setItem(DATABASE_HINT_KEY, "1");
    } catch {
      // A one-time hint that cannot be remembered is still a hint.
    }
  };

  return (
    <section className="flex flex-col gap-4 pb-24">
      {/* §5.2: the table switcher. Four views of one store, so it is a segmented
          rail rather than four loose commands — the library's own tab strip, one
          size down and scoped to the grid it changes. */}
      <div
        data-database-tables=""
        className="flex w-fit flex-wrap items-center gap-1 rounded-2xl border border-line bg-surface p-1.5"
      >
        {tables.map((row) => (
          <Button
            key={row.id}
            size="sm"
            tier={row.id === table ? "primary" : "tertiary"}
            aria-pressed={row.id === table}
            onClick={() => changeTable(row.id)}
          >
            {row.label}
          </Button>
        ))}
      </div>

      {hintSeen ? null : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
          <p className="text-sm text-muted">
            Drag the <span className="text-text">⠿</span> at the left of a row to move it —
            intentions have one too. Each heading has a <span className="text-text">＋</span>{" "}
            for a new column. Nothing is stored until you press Save.
          </p>
          <Button size="sm" tier="tertiary" onClick={dismissHint}>
            Got it
          </Button>
        </div>
      )}

      {/* The grid's own toolbar (the owner's round 17): the `Edit table` press that puts an
          `×` on every heading, and what the reader's own column filters are doing. Both are
          view settings — neither touches the draft, so neither makes the screen dirty and
          neither is what `Save` writes.

          The single filter box that used to sit here is gone (the owner's round 22): the
          filters are **per column** now, opened from each heading, and the sentence below is
          what tells the reader which columns are narrowing the table. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          tier={editingColumns ? "primary" : "tertiary"}
          aria-pressed={editingColumns}
          onClick={() => setEditingColumns((on) => !on)}
        >
          Edit table
        </Button>
        {editingColumns && hiddenHere.length > 0 ? (
          <Button size="sm" onClick={showAllColumns}>
            {`Show ${hiddenHere.length} hidden column${hiddenHere.length === 1 ? "" : "s"}`}
          </Button>
        ) : null}
        {filtering.length > 0 ? (
          <p className="text-sm text-muted">
            {`Narrowed by ${filtering.length} column filter${
              filtering.length === 1 ? "" : "s"
            }: ${filtering.map(([, text]) => `“${text.trim()}”`).join(", ")}.`}
          </p>
        ) : null}
      </div>

      <Grid
        table={table}
        workspaceId={workspaceId}
        types={view.meditationTypes}
        focusRowId={focusRowId}
        draft={draft}
        view={view}
        records={records}
        filters={filters}
        onFilter={setColumnFilter}
        hiddenColumns={hiddenHere}
        editingColumns={editingColumns}
        onToggleColumn={toggleColumn}
        onDraft={setDraft}
        onOpenRecord={(which, id) => void openRecord(which, id)}
        onNewRecord={onNewRecord}
        onArchiveEntry={(row) => void archiveEntry(row)}
        onRemoveEntry={(row) => void removeEntry(row)}
        onArchiveLine={(line) => void archiveLine(line)}
        onRemoveLine={(line) => void removeLine(line)}
        onArchiveRecord={(table, id) => void archiveRecordRow(table, id)}
        onRemoveRecord={(table, id) => void removeRecordRow(table, id)}
        onDescribeRecord={(table, id) => describe(recordKind(table), id, "archive")}
        onRemoveColumn={(column) => void removeColumn(column)}
        onAddOption={(column, label) => {
          // The new option is answered with its id, so the cell that asked for it
          // chooses it — §6.2's "add as a new option to this column" in one press.
          const { draft: withOption, option } = addOption(draft, column.id, label);
          setDraft(withOption);
          return Promise.resolve(option.id);
        }}
        armed={armed}
        onArm={(id) => {
          setArmed(id);
          setNotice(null);
          if (id) {
            const row = draft.entries.find((item) => item.id === id);
            const line = draft.lines.find((item) => item.id === id);
            if (row) void describe("entry", id, "archive");
            else if (line) void describe("line", id, "archive");
          }
        }}
        notice={notice}
        imageUrls={imageUrls}
        onCreateRecord={createRecord}
        onUploadImage={async (file, column, entityId) => {
          const job = (async (): Promise<((current: DraftState) => DraftState) | null> => {
            try {
              const asset = await savePictureAsset(file);
              return (current) => ({
                ...current,
                values: { ...current.values, [`${entityId}:${column.id}`]: asset.id },
              });
            } catch (err) {
              setError(errorText(err, "Could not add the picture"));
              return null;
            }
          })();
          pendingPicture.current = job;
          const patch = await job;
          if (patch) setDraft(patch);
          await onReload();
        }}
        onUploadPicture={async (file, entityId) => {
          // A record's own picture is an asset the record points at, not a cell
          // value: it patches the row, and Save writes it with everything else.
          const job = (async (): Promise<((current: DraftState) => DraftState) | null> => {
            try {
              const asset = await savePictureAsset(file);
              return (current) => ({
                ...current,
                meditations: current.meditations.map((row) =>
                  row.id === entityId ? { ...row, pictureAssetId: asset.id } : row,
                ),
                symbols: current.symbols.map((row) =>
                  row.id === entityId ? { ...row, pictureAssetId: asset.id } : row,
                ),
              });
            } catch (err) {
              setError(errorText(err, "Could not add the picture"));
              return null;
            }
          })();
          pendingPicture.current = job;
          const patch = await job;
          if (patch) setDraft(patch);
          await onReload();
        }}
        onOpenBinaural={async (focus) => {
          // The config is another screen and this one is holding the draft, so the
          // draft is written before the shell swaps it in — the rule `saveDraftThen`
          // keeps everywhere else, and the one place here where leaving does *not*
          // mean discarding.
          if (dirty && !(await save())) return;
          onOpenBinaural(focus);
        }}
      />
      {/* §5.4: the bar is sticky, Save is dim until there are changes and primary
          once there are, the small "Unsaved changes" hint sits beside it, and the
          `Esc back` legend sits with the action it belongs to. Save stays a direct
          child of the bar: its legend is found through the button's parent. */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex flex-wrap items-center justify-end gap-3 border-t border-line bg-surface/95 px-4 py-3 shadow-[0_-10px_30px_-18px_rgba(0,0,0,0.9)] backdrop-blur">
        {error ? <p className="mr-auto text-sm text-destructive">{error}</p> : null}
        {report ? <p className="mr-auto text-sm text-muted">{report}</p> : null}
        {dirty && !report && !error ? (
          <p className="mr-auto text-sm text-muted">Unsaved changes</p>
        ) : null}
        {/* The legend *is* the way back (the owner's round 20): a `Back` button
            sitting beside an `Esc back` legend is the same instruction written
            twice, and of the two the legend is the one that also works from a
            keyboard. */}
        <KeyHints hints={[{ keys: ["Esc"], label: "back", onPress: onLeave }]} />
        <Button
          tier="primary"
          size="lg"
          disabled={!dirty || saving}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </section>
  );
}

/** The Save report: what the sweep took, named up to five (§12.26). */
function sweepSentence(names: string[], total: number): string | null {
  if (total === 0) return "Saved.";
  const rest = total - names.length;
  return `Saved. ${names.join(", ")}${rest > 0 ? ` and ${rest} other${rest === 1 ? "" : "s"}` : ""} had nothing left to point at; they are in the Archive.`;
}

function sameDraft(a: DraftState, b: DraftState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function safeSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * The hidden-column lists this session remembers, or none.
 *
 * Read defensively because it is `sessionStorage` and not a store: anything could be
 * in there — an older build's shape, a hand-set value, a key another tab wrote — and
 * a preference that will not parse is not a reason to refuse to open the Database.
 * An unknown table id is simply never asked for.
 */
function readHiddenColumns(): Record<string, string[]> {
  const raw = safeSession(DATABASE_COLUMNS_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue;
      out[key] = value.filter((row): row is string => typeof row === "string");
    }
    return out;
  } catch {
    return {};
  }
}

function writeHiddenColumns(rows: Record<string, string[]>): void {
  try {
    sessionStorage.setItem(DATABASE_COLUMNS_KEY, JSON.stringify(rows));
  } catch {
    // A view preference that cannot be remembered is still a view preference.
  }
}
