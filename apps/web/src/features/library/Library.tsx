"use client";

import { useArmedFlag, useArmedId } from "@/lib/armed";
import { useScreenScroll } from "@/lib/screen-scroll";
import { app } from "@/composition";
import { useSession } from "@/features/auth/SessionProvider";
import { catalogRestoreError, errorText } from "@/lib/error-text";
import {
  NONE_PICK_ID,
  PLAN_ERRORS,
  newRowVersion,
  type DeleteKind,
} from "@meditaur/application";
import {
  BUILTIN_COLUMN_KEYS,
  classicBinauralPair,
  createId,
  defaultEarEq,
  type BinauralPreset,
  type FieldDef,
  type FieldEntityType,
  type FieldValue,
  type FocusPoint,
  type FocusSymbolBinding,
  type Intention,
  type MediaAsset,
  type SessionLog,
  type Symbol,
  type TableView,
} from "@meditaur/domain";
import { Button, LatchButton } from "@meditaur/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SymbolPicker } from "./SymbolPicker";
import { attachedFocusNames, SymbolSheet } from "./SymbolSheet";
import { AudioList } from "./AudioTable";
import { BinauralConfigScreen } from "./BinauralConfig";
import { CatalogBackupPanel } from "./CatalogBackupPanel";
import { LibraryColumnPicker } from "./CatalogDataTable";
import type { FieldDelete } from "./EditorSection";
import { FieldDefEditor, FieldsList } from "./FieldsTable";
import { FocusSheet } from "./FocusSheet";
import {
  FocusEditor,
  FocusList,
  FocusPicker,
  FocusPresetPicker,
  saveFieldDrafts,
  saveSymbolWithDrafts,
  SymbolEditor,
  SymbolsList,
} from "./FocusTable";
import { HistoryList } from "./HistoryTable";
import { IntentionEditor, IntentionsList } from "./IntentionsTable";
import {
  assocModeOf,
  draftsForFocus,
  draftsForSymbol,
  emptyFocusPoint,
  FOCUS_BUILTIN_COLUMNS,
  nextSortOrder,
  poolColumns,
  pruneBinauralDrafts,
  readLibraryTable,
  readListMode,
  readTableColumns,
  resolveColumns,
  screenId,
  sortSymbolsForPicker,
  SYMBOL_BUILTIN_COLUMNS,
  toggleOrdered,
  writeLibraryTable,
  writeListMode,
  writeTableColumns,
  type AssocMode,  type ListMode,
  type Screen,
  type TableId,
} from "./library-model";
import { PlansList } from "./PlansTable";
import { PresetEditor, PresetsList } from "./PresetsTable";
import { TableViewEditor, ViewsList } from "./ViewsTable";

/** The tab strip, in the TableId order (UI_DESIGN.md §3.1). */
const LIBRARY_TABS: { id: TableId; label: string }[] = [
  { id: "focus", label: "Focus points" },
  { id: "symbols", label: "Symbols" },
  { id: "intentions", label: "Intentions" },
  { id: "fields", label: "Fields" },
  { id: "audio", label: "Audio files" },
  { id: "presets", label: "Presets" },
  { id: "views", label: "Views" },
  { id: "plans", label: "Plans" },
  { id: "history", label: "History" },
];

/** Only these three render in cards or a table, so only they get the toggle. */
const LIST_MODE_TABS: TableId[] = ["focus", "symbols", "intentions"];

export function Library() {
  const router = useRouter();
  const [table, setTable] = useState<TableId>("focus");
  const [listMode, setListMode] = useState<ListMode>(() => readListMode("focus"));
  const [columnKeys, setColumnKeys] = useState<string[] | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [focusPoints, setFocusPoints] = useState<FocusPoint[]>([]);
  const [symbols, setSymbols] = useState<Symbol[]>([]);
  const [bindings, setBindings] = useState<FocusSymbolBinding[]>([]);
  const [intentions, setIntentions] = useState<Intention[]>([]);
  const [fieldDefs, setFieldDefs] = useState<FieldDef[]>([]);
  const [fieldValues, setFieldValues] = useState<FieldValue[]>([]);
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, string>>({});
  const [presets, setPresets] = useState<BinauralPreset[]>([]);
  const [tableViews, setTableViews] = useState<TableView[]>([]);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [planNames, setPlanNames] = useState<{ id: string; name: string }[]>([]);
  const [logs, setLogs] = useState<SessionLog[]>([]);
  const [sessionsThisWeek, setSessionsThisWeek] = useState(0);
  const [screen, setScreen] = useState<Screen>({ type: "list" });
  const [error, setError] = useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = useArmedFlag();
  // The card whose delete is armed on its second press. One id covers every
  // list, so arming a card in one section cannot leave another section armed.
  const [armedCardId, setArmedCardId] = useArmedId();
  /** The "what else goes" line for the armed card, and for the armed editor. */
  const [cardImpact, setCardImpact] = useState<string | null>(null);
  const [editorImpact, setEditorImpact] = useState<string | null>(null);
  /** Which entity the in-flight impact sentence belongs to. */
  const impactToken = useRef<string | null>(null);
  const [fieldFilter, setFieldFilter] = useState<"all" | FieldEntityType>("all");
  /** The custom field whose in-editor delete is armed, and what that takes. */
  const [armedFieldId, setArmedFieldId] = useArmedId();
  const [fieldImpact, setFieldImpact] = useState<string | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const mediaUrlsRef = useRef<Record<string, string>>({});
  // The screen a save should read once it has joined on a picture upload; a ref
  // because the save may run from a closure created before the upload finished.
  const screenRef = useRef(screen);
  screenRef.current = screen;

  const saveFocusPointNow = async () => {
    const current = screenRef.current;
    if (current.type !== "focus") return;
    const chosen = await chosenPictureFor(current.value.id);
    const value = chosen
      ? { ...current.value, representationAssetId: chosen }
      : current.value;
    await persistThen(() => app.saveFocusPoint(value), sheetOf(value.id));
  };

  /**
   * The screen's unsaved draft, picture upload included.
   *
   * This is what the editor's own Save writes, and what a route out of the
   * editor writes first. It covers both entity editors — the focus point's and
   * the symbol's — because both of them now hand over to another screen (`Add
   * custom fields`) and neither of those routes may eat what has been typed.
   */
  const saveEditorDraft = async (): Promise<void> => {
    const current = screenRef.current;
    if (current.type === "focus") {
      const chosen = await chosenPictureFor(current.value.id);
      await app.saveFocusPoint(
        chosen ? { ...current.value, representationAssetId: chosen } : current.value,
      );
      return;
    }
    if (current.type === "symbol") {
      const chosen = await chosenPictureFor(current.value.id);
      const value = chosen ? { ...current.value, imageAssetId: chosen } : current.value;
      await saveSymbolWithDrafts(value, fieldDefs, fieldDrafts, fieldValues);
    }
  };

  const saveSymbolNow = async () => {
    const current = screenRef.current;
    if (current.type !== "symbol") return;
    const chosen = await chosenPictureFor(current.value.id);
    const value = chosen ? { ...current.value, imageAssetId: chosen } : current.value;
    await persistThen(() => saveSymbolWithDrafts(value, fieldDefs, fieldDrafts, fieldValues), {
      type: "symbol-sheet",
      symbolId: value.id,
    });
  };
  const {
    ready: sessionReady,
    userId: sessionUserId,
    workspaceId: sessionWorkspaceId,
  } = useSession();

  const revokeMediaUrls = useCallback((urls: Record<string, string>) => {
    for (const url of Object.values(urls)) URL.revokeObjectURL(url);
  }, []);

  /** Forgets one asset's blob URL, for when that asset is gone. */
  const forgetMediaUrl = useCallback(
    (id: string) => {
      const url = mediaUrlsRef.current[id];
      if (!url) return;
      URL.revokeObjectURL(url);
      const next = { ...mediaUrlsRef.current };
      delete next[id];
      mediaUrlsRef.current = next;
      setMediaUrls(next);
    },
    [],
  );

  const urlForAsset = useCallback(async (id: string | null): Promise<string | null> => {
    if (!id) return null;
    const cached = mediaUrlsRef.current[id];
    if (cached) return cached;
    const bytes = await app.getMediaBytes(id);
    if (!bytes) return null;
    // The blob store keeps the mime type; the app facade only hands back bytes.
    // Leave the type off so <img> sniffs the real format instead of a wrong one.
    const url = URL.createObjectURL(new Blob([bytes]));
    mediaUrlsRef.current = { ...mediaUrlsRef.current, [id]: url };
    setMediaUrls(mediaUrlsRef.current);
    return url;
  }, []);

  const loadSymbolImages = useCallback(
    async (rows: Symbol[]) => {
      await Promise.all(rows.map((s) => urlForAsset(s.imageAssetId)));
    },
    [urlForAsset],
  );

  const reload = useCallback(async (ws: string) => {
    // The blob URLs deliberately survive a reload. Asset ids are immutable, so
    // a cached URL stays correct, and revoking here made every image in the
    // library go blank and get re-decoded after every save (review M7). The
    // cache is dropped on unmount and per asset on delete.
    const library = await app.getLibrary(ws);
    // A deleted focus point would otherwise strand its binaural draft in this
    // tab for the rest of the session; this is the only place the live set is
    // known.
    pruneBinauralDrafts(library.focusPoints.map((fp) => fp.id));
    setFocusPoints(library.focusPoints);
    setSymbols(library.symbols);
    setBindings(library.bindings);
    setIntentions(library.intentions);
    setFieldDefs(library.fieldDefs);
    setFieldValues(library.fieldValues);
    setPresets(library.presets);
    setTableViews(library.tableViews);
    setMediaAssets(library.mediaAssets);
    setPlanNames(library.plans);
    setLogs(library.logs);
    setSessionsThisWeek(library.sessionsThisWeek);
  }, [revokeMediaUrls]);

  useEffect(() => {
    if (!sessionReady || !sessionWorkspaceId) return;
    setUserId(sessionUserId ?? "");
    setWorkspaceId(sessionWorkspaceId);
    void (async () => {
      try {
        await reload(sessionWorkspaceId);
      } catch (err) {
        setError(errorText(err, "Could not load the library"));
      }
    })();
  }, [sessionReady, sessionUserId, sessionWorkspaceId, reload]);

  useEffect(() => {
    setTable(readLibraryTable());
  }, []);

  // The one place blob URLs are released, now that reloads keep them.
  useEffect(
    () => () => {
      revokeMediaUrls(mediaUrlsRef.current);
      mediaUrlsRef.current = {};
    },
    [revokeMediaUrls],
  );

  useEffect(() => {
    setListMode(readListMode(table));
    setColumnKeys(readTableColumns(table));
  }, [table]);

  useEffect(() => {
    if (table === "symbols") void loadSymbolImages(symbols);
  }, [table, symbols, loadSymbolImages]);

  useEffect(() => {
    if (table !== "focus") return;
    void Promise.all(focusPoints.map((fp) => urlForAsset(fp.representationAssetId)));
  }, [table, focusPoints, urlForAsset]);

  useEffect(() => {
    if (screen.type !== "focus-sheet") return;
    const focus = focusPoints.find((fp) => fp.id === screen.focusId);
    if (!focus) return;
    void urlForAsset(focus.representationAssetId);
    const bound = bindings
      .filter((row) => row.focusPointId === focus.id)
      .map((row) => symbols.find((s) => s.id === row.symbolId))
      .filter((s): s is Symbol => Boolean(s));
    void loadSymbolImages(bound);
  }, [screen, focusPoints, bindings, symbols, urlForAsset, loadSymbolImages]);

  useEffect(() => {
    if (screen.type !== "focus") return;
    void urlForAsset(screen.value.representationAssetId);
  }, [screen, urlForAsset]);

  useEffect(() => {
    if (screen.type !== "symbol") return;
    void urlForAsset(screen.value.imageAssetId);
  }, [screen, urlForAsset]);

  useEffect(() => {
    if (screen.type !== "symbol-sheet") return;
    const symbol = symbols.find((s) => s.id === screen.symbolId);
    void urlForAsset(symbol?.imageAssetId ?? null);
  }, [screen, symbols, urlForAsset]);

  // Each screen — and each tab of the list — remembers where it was scrolled
  // to, so coming back from a nested screen (an intention, a picker) lands where
  // you left rather than at the top, and a screen opened for the first time
  // starts at the top instead of inheriting the list's offset.
  useScreenScroll(screen.type === "list" ? `list:${table}` : screenId(screen));

  const selectTable = (id: TableId) => {
    setArmedCardId(null);
    setTable(id);
    writeLibraryTable(id);
  };

  const onListMode = (mode: ListMode) => {
    setListMode(mode);
    writeListMode(table, mode);
  };

  const onColumnsChange = (keys: string[]) => {
    setColumnKeys(keys);
    writeTableColumns(table, keys);
  };

  const downloadCatalog = async () => {
    if (!workspaceId) return;
    setError(null);
    try {
      const backup = await app.exportCatalog(workspaceId);
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "meditaur-catalog.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(errorText(err, "Could not download catalog"));
    }
  };

  const restoreCatalog = async (file: File | undefined) => {
    if (!workspaceId || !file) return;
    setError(null);
    try {
      const raw: unknown = JSON.parse(await file.text());
      await app.importCatalog(workspaceId, raw);
      await reload(workspaceId);
    } catch (err) {
      setError(catalogRestoreError(err));
    }
  };

  const backToList = () => {
    setScreen({ type: "list" });
    setDeleteArmed(false);
    setArmedCardId(null);
    setFieldDrafts({});
    setError(null);
  };

  const persistThen = async (work: () => Promise<unknown>, next: Screen) => {
    if (!workspaceId) return;
    setError(null);
    try {
      await work();
      await reload(workspaceId);
      setScreen(next);
      setDeleteArmed(false);
      setArmedCardId(null);
    } catch (err) {
      setError(errorText(err, "Save failed"));
    }
  };

  const persist = async (work: () => Promise<unknown>) => {
    await persistThen(work, { type: "list" });
  };

  /**
   * Save, reload the lists, and stay where you are.
   *
   * The focus point's editor is the one screen that manages *other* rows (its
   * symbols, its intentions, its custom fields), and every one of those actions
   * persists on the spot — the draft focus point must not be thrown away just
   * because a symbol was unbound under it.
   */
  const persistStay = async (work: () => Promise<unknown>) => {
    if (!workspaceId) return;
    setError(null);
    try {
      await work();
      await reload(workspaceId);
      setDeleteArmed(false);
      setArmedCardId(null);
    } catch (err) {
      setError(errorText(err, "Save failed"));
    }
  };

  /**
   * Save the editor's draft, then leave for a picker, the binaural config, or a
   * new custom field.
   *
   * Those screens come back with a `Back`, and the draft would be gone when they
   * did — so the unsaved name or description is written first, and a save that
   * fails keeps the reader on the editor with the message rather than losing the
   * edit behind a navigation.
   */
  const saveDraftThen = async (next: () => Screen) => {
    if (!workspaceId) return;
    setError(null);
    try {
      await saveEditorDraft();
      await reload(workspaceId);
      setScreen(next());
      setDeleteArmed(false);
      setArmedCardId(null);
    } catch (err) {
      setError(errorText(err, "Save failed"));
    }
  };

  /**
   * The picture the reader just chose, and the entity they chose it for.
   *
   * A file input's `onChange` writes the asset asynchronously and returns at
   * once, so the editor used to be saveable while that write was still in
   * flight — and it then persisted the value from before the upload, silently
   * dropping the picture. Reactive state cannot fix that by itself: React
   * commits the updated screen asynchronously too, so a save that merely waits
   * for the upload can still read the pre-upload value. The save therefore joins
   * on this promise and merges the asset id itself, and only for the entity the
   * picture was chosen for — otherwise opening a second editor and saving would
   * hand it the first one's picture.
   */
  const pendingPicture = useRef<{ entityId: string; assetId: Promise<string | null> } | null>(
    null,
  );

  const chosenPictureFor = async (entityId: string): Promise<string | null> => {
    const pending = pendingPicture.current;
    if (!pending || pending.entityId !== entityId) return null;
    return await pending.assetId;
  };

  const openLibraryPlan = async (planId: string) => {
    if (!userId || !workspaceId) return;
    setError(null);
    const opened = await app.openPlan(userId, workspaceId, planId);
    if (!opened) {
      setError(PLAN_ERRORS.missing);
      return;
    }
    router.push("/plan");
  };

  const uploadMedia = async (kind: MediaAsset["kind"], file: File | undefined) => {
    if (!workspaceId || !file) return;
    setError(null);
    setArmedCardId(null);
    try {
      const bytes = await file.arrayBuffer();
      const ctx = new AudioContext();
      let durationMs = 0;
      try {
        const decoded = await ctx.decodeAudioData(bytes.slice(0));
        durationMs = Math.round(decoded.duration * 1000);
      } finally {
        await ctx.close();
      }
      const base = file.name.replace(/\.[^.]+$/, "");
      await app.saveMediaAsset({
        workspaceId,
        kind,
        name: base || file.name,
        bytes,
        mimeType: file.type,
        durationMs,
      });
      await reload(workspaceId);
    } catch (err) {
      setError(errorText(err, "Could not add audio"));
    }
  };

  const uploadImage = async (file: File | undefined): Promise<string | null> => {
    if (!workspaceId || !file) return null;
    setError(null);
    try {
      const bytes = await file.arrayBuffer();
      const base = file.name.replace(/\.[^.]+$/, "");
      const asset = await app.saveMediaAsset({
        workspaceId,
        kind: "image",
        name: base || file.name,
        bytes,
        mimeType: file.type,
        durationMs: 0,
      });
      await reload(workspaceId);
      await urlForAsset(asset.id);
      return asset.id;
    } catch (err) {
      setError(errorText(err, "Could not add image"));
      return null;
    }
  };

  const addFocus = () => {
    if (!workspaceId) return;
    setError(null);
    setDeleteArmed(false);
    setScreen({
      type: "focus",
      isNew: true,
      value: emptyFocusPoint(workspaceId, presets[0]?.id ?? null),
    });
  };

  const addSymbol = () => {
    if (!workspaceId) return;
    setDeleteArmed(false);
    setError(null);
    const id = createId();
    setFieldDrafts(draftsForSymbol(id, fieldDefs, fieldValues));
    setScreen({
      type: "symbol",
      isNew: true,
      value: {
        id,
        workspaceId,
        name: "",
        description: "",
        usage: "",
        imageAssetId: null,
        ...newRowVersion(),
      },
    });
  };

  const addPreset = () => {
    if (!workspaceId) return;
    setError(null);
    setDeleteArmed(false);
    const pair = classicBinauralPair(200, 8, 0.45);
    setScreen({
      type: "preset",
      isNew: true,
      value: {
        id: createId(),
        workspaceId,
        name: "",
        leftTones: [pair.left],
        rightTones: [pair.right],
        fadeInMs: 40,
        fadeOutMs: 40,
        eqLeft: defaultEarEq(),
        eqRight: defaultEarEq(),
        ...newRowVersion(),
      },
    });
  };

  /**
   * `Duplicate` on a preset card: the sound is saved first (so a card that was
   * edited but not saved is not copied stale), then copied onto a new id.
   *
   * It used to sit inside the preset editor, which the owner's round 5 moved out
   * to the card — copying a sound is something you decide while looking at the
   * list, not after opening one.
   */
  const duplicatePreset = async (preset: BinauralPreset) => {
    if (!workspaceId) return;
    setError(null);
    setDeleteArmed(false);
    try {
      const saved = await app.savePreset(preset);
      await app.duplicatePreset(workspaceId, saved.id);
      await reload(workspaceId);
      setScreen({ type: "list" });
    } catch (err) {
      setError(errorText(err, "Could not duplicate preset"));
    }
  };

  const addTableView = () => {
    if (!workspaceId) return;
    setError(null);
    setDeleteArmed(false);
    setScreen({
      type: "table-view",
      isNew: true,
      value: {
        id: createId(),
        workspaceId,
        name: "",
        columnKeys: [...BUILTIN_COLUMN_KEYS],
        symbolFilter: "block",
        ...newRowVersion(),
      },
    });
  };

  /**
   * The blank field editor, as a screen — built, not navigated to, so an editor
   * can save its own draft before going there.
   *
   * `returnTo` is the screen that made the field: a focus point's or a symbol's
   * editor. Making a custom field is part of editing that entity, so saving the
   * field comes back to it (the same shape the intention editor has), and the
   * new field's box is already there to type in.
   */
  const fieldDefScreen = (
    entityType: FieldEntityType,
    returnTo?: Screen,
  ): Screen | null => {
    if (!workspaceId) return null;
    return {
      type: "field-def",
      isNew: true,
      returnTo,
      value: {
        id: createId(),
        workspaceId,
        entityType,
        // The key is empty here on purpose: the application derives it from the
        // heading on the first save (`fieldKeyFor`), so nothing on this screen
        // has to ask the reader for one.
        key: "",
        label: "",
        description: "",
        sortOrder: nextSortOrder(fieldDefs.filter((d) => d.entityType === entityType)),
        ...newRowVersion(),
      },
    };
  };

  const addFieldDef = (entityType: FieldEntityType = "symbol", returnTo?: Screen) => {
    const next = fieldDefScreen(entityType, returnTo);
    if (!next) return;
    setError(null);
    setDeleteArmed(false);
    setScreen(next);
  };

  const openFocusSheet = (focusId: string) => {
    setError(null);
    setDeleteArmed(false);
    setFieldDrafts(draftsForFocus(focusId, fieldDefs, fieldValues));
    setScreen({ type: "focus-sheet", focusId });
  };

  /** The details editor for one focus point, from its card or from its sheet. */
  const editFocusDetails = (focus: FocusPoint) => {
    setError(null);
    setDeleteArmed(false);
    setFieldDrafts(draftsForFocus(focus.id, fieldDefs, fieldValues));
    void urlForAsset(focus.representationAssetId);
    setScreen({ type: "focus", value: focus, isNew: false });
  };

  /** The read-only view for one symbol, from its card, its row, or its editor. */
  const openSymbolSheet = (symbolId: string) => {
    setError(null);
    setDeleteArmed(false);
    setScreen({ type: "symbol-sheet", symbolId });
  };

  /** The editor for one symbol, from its card or from its read-only view. */
  const editSymbolDetails = (symbol: Symbol) => {
    setError(null);
    setDeleteArmed(false);
    setFieldDrafts(draftsForSymbol(symbol.id, fieldDefs, fieldValues));
    void urlForAsset(symbol.imageAssetId);
    setScreen({ type: "symbol", value: symbol, isNew: false });
  };

  /**
   * The focus point's editor, as a navigation target — what a picker comes back
   * to. The draft is taken from the store rather than from a screen that is no
   * longer on the stack, because every route here saves the draft first.
   */
  const focusEditorOf = (focusId: string): Screen => {
    const focus = focusPoints.find((fp) => fp.id === focusId);
    return focus
      ? { type: "focus", value: focus, isNew: false }
      : { type: "focus-sheet", focusId };
  };

  /**
   * The two-press delete behind every card's `Delete`: the first press arms that
   * one card (`Delete <name>?`), the second runs the work. Nothing is removed on
   * a single press, matching the arm step the editors already use — and arming a
   * second card re-arms only that one, because a single id is kept.
   */
  /**
   * The first press of a card's delete: arm it, and say what else goes with it.
   * `getDeletionImpact` answers with a sentence ("This also removes 3 blocks
   * from 2 plans.") or nothing at all, and the sentence is shown under the armed
   * button rather than in a dialog — the arm step is the confirmation.
   */
  const cardDelete = (id: string, kind: DeleteKind, work: () => Promise<unknown>) => {
    if (armedCardId !== id) {
      setArmedCardId(id);
      setError(null);
      void impactOf(kind, id, setCardImpact);
      return;
    }
    setArmedCardId(null);
    setCardImpact(null);
    impactToken.current = null;
    void persistThen(work, { type: "list" });
  };

  /** The impact sentence for one entity, ignored if the workspace is not ready. */
  const impactOf = async (
    kind: DeleteKind,
    id: string,
    apply: (text: string | null) => void,
  ) => {
    if (!workspaceId) return;
    // The sentence is fetched, so it can land after the reader has armed a
    // different row. A stale sentence is worse than none: it puts a wrong
    // "this also removes …" under a destructive button. The token makes the
    // last arm the only one that may paint.
    const token = `${kind}:${id}`;
    impactToken.current = token;
    const current = () => impactToken.current === token;
    try {
      const text = await app.getDeletionImpact(workspaceId, kind, id);
      if (current()) apply(text);
    } catch {
      // The sentence is a courtesy: if it cannot be read, the arm step still
      // works and the delete still cascades.
      if (current()) apply(null);
    }
  };

  /**
   * The two-press delete a custom field carries on its own heading line, in the
   * editor it was added from.
   *
   * The owner's round 9: "there is no UI button for deleting a field once
   * added". A field belongs to its whole pool, not to the entity whose editor
   * made it, so this presses twice and says what else goes — the values typed
   * into it, and the column in every view that had it — exactly as the Fields
   * tab's card delete does. The field's own screen keeps its `Delete field`
   * button; this one is what sits beside the box the reader is looking at.
   */
  const fieldDelete: FieldDelete = {
    armedId: armedFieldId,
    impact: fieldImpact,
    onArm: (def) => {
      setArmedFieldId(def.id);
      setError(null);
      void impactOf("field", def.id, setFieldImpact);
    },
    onDelete: (def) => {
      if (!workspaceId) return;
      setArmedFieldId(null);
      setFieldImpact(null);
      impactToken.current = null;
      void persistStay(() => app.deleteFieldDef(workspaceId, def.id));
    },
  };

  /** The blank intention editor, as a screen — built, not navigated to, so a
   *  caller can save its own draft before going there. */
  const newIntentionScreen = (
    focusPointId: string | null,
    symbolId: string | null,
    returnToFocusId?: string,
  ): Screen | null => {
    if (!workspaceId) return null;
    return {
      type: "intention",
      isNew: true,
      returnToFocusId,
      mode: assocModeOf({ focusPointId, symbolId }),
      value: {
        id: createId(),
        workspaceId,
        focusPointId,
        symbolId,
        sortOrder: nextSortOrder(
          intentions.filter(
            (row) => row.focusPointId === focusPointId && row.symbolId === symbolId,
          ),
        ),
        text: "",
        ...newRowVersion(),
      },
    };
  };

  const addIntentionFromList = () => {
    const next = newIntentionScreen(null, null);
    if (!next) return;
    setDeleteArmed(false);
    setError(null);
    setScreen(next);
  };

  const sheetOf = (focusId: string): Screen => ({ type: "focus-sheet", focusId });

  const hintForSymbol = (symbolId: string): string | undefined => {
    const names = bindings
      .filter((row) => row.symbolId === symbolId)
      .map((row) => focusPoints.find((fp) => fp.id === row.focusPointId)?.name)
      .filter((name): name is string => Boolean(name));
    return names.length > 0 ? names.join(" · ") : undefined;
  };

  const armDelete = (
    kind: DeleteKind,
    id: string,
    work: () => Promise<unknown>,
    next: Screen = { type: "list" },
  ) => {
    if (!deleteArmed) {
      setDeleteArmed(true);
      void impactOf(kind, id, setEditorImpact);
      return;
    }
    setEditorImpact(null);
    impactToken.current = null;
    void persistThen(work, next);
  };

  /**
   * A drag in the editor's symbol list: the new order becomes the `sortOrder` of
   * every binding of this focus point, because `Rotate next` walks them in that
   * order. The whole list is written rather than the two swapped rows — a drag
   * can move a row many places, and stale orders in between would re-sort
   * differently the next time the list is read.
   *
   * The list is redrawn here, before the write, so that the row is already in
   * its new place in the commit that lets it go. The editor reads `bindings`,
   * and waiting for the write and the reload that follows it meant the reader
   * watched the row snap back to where it came from and then walk to where they
   * had dropped it — the owner's round 9: "It should behave exactly like the
   * draggable cards on the plan page … when I drop the dragged intention or
   * symbol up or down, it should just magnetically get fit." The planner has
   * always worked this way: its `onDragEnd` reorders the plan it is already
   * holding. The reload that follows replaces this with the stored order, which
   * is the same arrangement.
   */
  const reorderBindings = (focusId: string, symbolIds: string[]) => {
    setBindings((current) =>
      current.map((row) => {
        const index = row.focusPointId === focusId ? symbolIds.indexOf(row.symbolId) : -1;
        return index < 0 ? row : { ...row, sortOrder: index };
      }),
    );
    return persistStay(() =>
      Promise.all(
        symbolIds.map((symbolId, index) => {
          const row = bindings.find(
            (b) => b.focusPointId === focusId && b.symbolId === symbolId,
          );
          return row ? app.saveBinding({ ...row, sortOrder: index }) : Promise.resolve();
        }),
      ),
    );
  };

  /** A drag in the editor's intention list, the same way. */
  const reorderIntentions = (intentionIds: string[]) => {
    setIntentions((current) =>
      current.map((row) => {
        const index = intentionIds.indexOf(row.id);
        return index < 0 ? row : { ...row, sortOrder: index };
      }),
    );
    return persistStay(() =>
      Promise.all(
        intentionIds.map((id, index) => {
          const row = intentions.find((r) => r.id === id);
          return row ? app.saveIntention({ ...row, sortOrder: index }) : Promise.resolve();
        }),
      ),
    );
  };

  const changeIntentionMode = (intention: Intention, mode: AssocMode): Intention => {
    if (mode === "none") return { ...intention, focusPointId: null, symbolId: null };
    if (mode === "focus") return { ...intention, symbolId: null };
    if (mode === "symbol") return { ...intention, focusPointId: null };
    return intention;
  };

  const saveFocusBinauralToggle = async (focus: FocusPoint, enabled: boolean) => {
    if (!workspaceId) return;
    setError(null);
    try {
      await app.saveFocusPoint({ ...focus, binauralEnabled: enabled });
      await reload(workspaceId);
    } catch (err) {
      setError(errorText(err, "Save failed"));
    }
  };

  if (!workspaceId) {
    return error ? (
      <p className="text-lg text-destructive">{error}</p>
    ) : (
      <p className="text-lg">Loading library…</p>
    );
  }

  if (screen.type === "pick-focus-preset") {
    const focus = screen.value;
    return (
      <FocusPresetPicker
        screen={screen}
        presets={presets}
        onBack={() => setScreen({ type: "focus", value: focus, isNew: screen.isNew })}
        onSelect={(id) => {
          setDeleteArmed(false);
          setScreen({
            type: "focus",
            isNew: screen.isNew,
            value: {
              ...focus,
              defaultBinauralPresetId: id === NONE_PICK_ID ? null : id,
            },
          });
        }}
      />
    );
  }

  if (screen.type === "pick-bind-symbol") {
    const bound = new Set(
      bindings.filter((row) => row.focusPointId === screen.focusId).map((row) => row.symbolId),
    );
    const available = symbols.filter((s) => !bound.has(s.id));
    return (
      <SymbolPicker
        title="Attach symbol"
        items={sortSymbolsForPicker(available).map((s) => ({
          id: s.id,
          label: s.name,
          hint: hintForSymbol(s.id),
        }))}
        onBack={() => setScreen(focusEditorOf(screen.focusId))}
        onSelect={(id) =>
          void persistStay(
            () =>
              app.saveBinding({
                focusPointId: screen.focusId,
                symbolId: id,
                sortOrder: nextSortOrder(
                  bindings.filter((row) => row.focusPointId === screen.focusId),
                ),
              }),
          )
        }
      />
    );
  }

  if (screen.type === "pick-intention-focus") {
    return (
      <FocusPicker
        focusPoints={focusPoints}
        onBack={() => setScreen(screen.returnTo)}
        onSelect={(id) => {
          setDeleteArmed(false);
          const updated = { ...screen.draft, focusPointId: id };
          if (screen.returnTo.type === "intention") {
            setScreen({ ...screen.returnTo, value: updated });
          }
        }}
      />
    );
  }

  if (screen.type === "pick-intention-symbol") {
    return (
      <SymbolPicker
        title="Symbol"
        items={sortSymbolsForPicker(symbols).map((s) => ({
          id: s.id,
          label: s.name,
          hint: s.usage,
        }))}
        onBack={() => setScreen(screen.returnTo)}
        onSelect={(id) => {
          setDeleteArmed(false);
          const updated = { ...screen.draft, symbolId: id };
          if (screen.returnTo.type === "intention") {
            setScreen({ ...screen.returnTo, value: updated });
          }
        }}
      />
    );
  }

  if (screen.type === "binaural-config") {
    const focus = focusPoints.find((fp) => fp.id === screen.focusId);
    if (!focus) {
      return (
        <main className="flex flex-col gap-6">
          <p className="text-lg">That focus point is gone.</p>
          <Button tier="tertiary" size="sm" onClick={backToList}>
            Back
          </Button>
        </main>
      );
    }
    return (
      <BinauralConfigScreen
        focus={focus}
        presets={presets}
        error={error}
        onBack={() => setScreen(focusEditorOf(focus.id))}
        onError={setError}
        onSavePreset={async (preset) => {
          await app.savePreset(preset);
          await app.saveFocusPoint({ ...focus, defaultBinauralPresetId: preset.id });
          await reload(workspaceId);
        }}
        onToggleBinaural={(enabled) => saveFocusBinauralToggle(focus, enabled)}
      />
    );
  }

  if (screen.type === "focus-sheet") {
    const focus = focusPoints.find((fp) => fp.id === screen.focusId);
    if (!focus) {
      return (
        <main className="flex flex-col gap-6">
          <p className="text-lg">That focus point is gone.</p>
          <Button tier="tertiary" size="sm" onClick={backToList}>
            Back
          </Button>
        </main>
      );
    }
    const symbolImageUrls = Object.fromEntries(
      symbols
        .filter((s) => s.imageAssetId && mediaUrls[s.imageAssetId])
        .map((s) => [s.id, mediaUrls[s.imageAssetId!]!]),
    );
    return (
      <FocusSheet
        focus={focus}
        symbols={symbols}
        bindings={bindings}
        intentions={intentions}
        presets={presets}
        fieldDefs={fieldDefs}
        fieldValues={fieldValues}
        representationUrl={
          focus.representationAssetId ? mediaUrls[focus.representationAssetId] ?? null : null
        }
        symbolImageUrls={symbolImageUrls}
        error={error}
        onBack={backToList}
        onEdit={() => editFocusDetails(focus)}
      />
    );
  }

  if (screen.type === "focus") {
    const focus = screen.value;
    return (
      <FocusEditor
        screen={screen}
        presets={presets}
        symbols={symbols}
        bindings={bindings}
        intentions={intentions}
        fieldDefs={fieldDefs}
        fieldDrafts={fieldDrafts}
        fieldDelete={fieldDelete}
        symbolImageUrls={Object.fromEntries(
          symbols
            .filter((s) => s.imageAssetId && mediaUrls[s.imageAssetId])
            .map((s) => [s.id, mediaUrls[s.imageAssetId!]!]),
        )}
        representationUrl={
          focus.representationAssetId ? mediaUrls[focus.representationAssetId] ?? null : null
        }
        deleteArmed={deleteArmed}
        deleteImpact={editorImpact}
        error={error}
        onBack={() => (screen.isNew ? backToList() : setScreen(sheetOf(focus.id)))}
        onChange={(next) => {
          setDeleteArmed(false);
          setScreen({ ...screen, value: next });
        }}
        onPickPreset={() => {
          setError(null);
          setDeleteArmed(false);
          setScreen({ type: "pick-focus-preset", value: focus, isNew: screen.isNew });
        }}
        onUploadRepresentation={(file) => {
          const entityId = focus.id;
          pendingPicture.current = {
            entityId,
            assetId: (async () => {
              const assetId = await uploadImage(file);
              if (!assetId) return null;
              setDeleteArmed(false);
              setScreen((current) =>
                current.type === "focus"
                  ? { ...current, value: { ...current.value, representationAssetId: assetId } }
                  : current,
              );
              return assetId;
            })(),
          };
        }}
        onAttachSymbol={() => {
          const bound = new Set(
            bindings.filter((row) => row.focusPointId === focus.id).map((row) => row.symbolId),
          );
          if (symbols.filter((s) => !bound.has(s.id)).length === 0) {
            setError(symbols.length === 0 ? "Add a symbol first" : "All symbols are attached");
            return;
          }
          void saveDraftThen(() => ({ type: "pick-bind-symbol", focusId: focus.id }));
        }}
        onUnbind={(symbolId) =>
          void persistStay(() => app.deleteBinding(workspaceId, focus.id, symbolId))
        }
        onReorderSymbols={(symbolIds) => reorderBindings(focus.id, symbolIds)}
        onOpenIntention={(row) => {
          setError(null);
          setDeleteArmed(false);
          // Any route out of the editor writes the draft first: the intention
          // screen comes back with `Back`, and a half-typed name would be gone.
          void saveDraftThen(() => ({
            type: "intention",
            value: row,
            isNew: false,
            mode: assocModeOf(row),
            returnToFocusId: focus.id,
          }));
        }}
        onAddIntention={() => {
          const next = newIntentionScreen(focus.id, null, focus.id);
          if (!next) return;
          setError(null);
          setDeleteArmed(false);
          void saveDraftThen(() => next);
        }}
        onDeleteIntention={(row) => void persistStay(() => app.deleteIntention(row.id))}
        onReorderIntentions={reorderIntentions}
        onDraftChange={(fieldDefId, text) => {
          setDeleteArmed(false);
          setFieldDrafts((current) => ({ ...current, [fieldDefId]: text }));
        }}
        onSaveFields={() =>
          void persistStay(() =>
            saveFieldDrafts(
              focus.id,
              fieldDefs.filter((def) => def.entityType === "focusPoint"),
              fieldDrafts,
              fieldValues,
            ),
          )
        }
        onAddField={() => {
          const next = fieldDefScreen("focusPoint", screen);
          if (!next) return;
          setError(null);
          setDeleteArmed(false);
          void saveDraftThen(() => next);
        }}
        onToggleBinaural={(enabled) =>
          void persistStay(() => app.saveFocusPoint({ ...focus, binauralEnabled: enabled }))
        }
        onOpenBinaural={() => {
          setError(null);
          setDeleteArmed(false);
          void saveDraftThen(() => ({ type: "binaural-config", focusId: focus.id }));
        }}
        onSave={() => void saveFocusPointNow()}
        onDelete={() =>
          armDelete("focus", focus.id, () => app.deleteFocusPoint(workspaceId, focus.id))
        }
      />
    );
  }

  if (screen.type === "symbol-sheet") {
    const symbol = symbols.find((s) => s.id === screen.symbolId);
    if (!symbol) {
      return (
        <main className="flex flex-col gap-6">
          <p className="text-lg">That symbol is gone.</p>
          <Button tier="tertiary" size="sm" onClick={backToList}>
            Back
          </Button>
        </main>
      );
    }
    return (
      <SymbolSheet
        symbol={symbol}
        imageUrl={symbol.imageAssetId ? mediaUrls[symbol.imageAssetId] ?? null : null}
        fieldDefs={fieldDefs}
        fieldValues={fieldValues}
        attachedTo={attachedFocusNames(symbol.id, bindings, focusPoints)}
        error={error}
        onBack={backToList}
        onEdit={() => editSymbolDetails(symbol)}
      />
    );
  }

  if (screen.type === "symbol") {
    return (
      <SymbolEditor
        screen={screen}
        fieldDefs={fieldDefs}
        fieldDrafts={fieldDrafts}
        fieldDelete={fieldDelete}
        imageUrl={
          screen.value.imageAssetId ? mediaUrls[screen.value.imageAssetId] ?? null : null
        }
        deleteArmed={deleteArmed}
        deleteImpact={editorImpact}
        error={error}
        onBack={() =>
          screen.isNew ? backToList() : openSymbolSheet(screen.value.id)
        }
        onChange={(symbol) => {
          setDeleteArmed(false);
          setScreen({ ...screen, value: symbol });
        }}
        onDraftChange={(fieldDefId, text) => {
          setDeleteArmed(false);
          setFieldDrafts((current) => ({ ...current, [fieldDefId]: text }));
        }}
        onAddField={() => {
          const next = fieldDefScreen("symbol", screen);
          if (!next) return;
          setError(null);
          setDeleteArmed(false);
          void saveDraftThen(() => next);
        }}
        onSaveFields={() =>
          void persistStay(() =>
            saveFieldDrafts(
              screen.value.id,
              fieldDefs.filter((def) => def.entityType === "symbol"),
              fieldDrafts,
              fieldValues,
            ),
          )
        }
        onUploadImage={(file) => {
          const entityId = screen.value.id;
          pendingPicture.current = {
            entityId,
            assetId: (async () => {
              const assetId = await uploadImage(file);
              if (!assetId) return null;
              setDeleteArmed(false);
              setScreen((current) =>
                current.type === "symbol"
                  ? { ...current, value: { ...current.value, imageAssetId: assetId } }
                  : current,
              );
              return assetId;
            })(),
          };
        }}
        onSave={() => void saveSymbolNow()}
        onDelete={() =>
          armDelete("symbol", screen.value.id, () =>
            app.deleteSymbol(workspaceId, screen.value.id),
          )
        }
      />
    );
  }

  if (screen.type === "field-def") {
    const afterField: Screen = screen.returnTo ?? { type: "list" };
    return (
      <FieldDefEditor
        screen={screen}
        deleteArmed={deleteArmed}
        deleteImpact={editorImpact}
        error={error}
        onBack={() => setScreen(afterField)}
        onChange={(def) => {
          setDeleteArmed(false);
          setScreen({ ...screen, value: def });
        }}
        onSave={() => void persistThen(() => app.saveFieldDef(screen.value), afterField)}
        onDelete={() =>
          armDelete("field", screen.value.id, () =>
            app.deleteFieldDef(workspaceId, screen.value.id),
            afterField,
          )
        }
      />
    );
  }

  if (screen.type === "intention") {
    const afterIntention: Screen = screen.returnToFocusId
      ? focusEditorOf(screen.returnToFocusId)
      : { type: "list" };
    const intentionScreen = screen;
    return (
      <IntentionEditor
        screen={intentionScreen}
        focusPoints={focusPoints}
        symbols={symbols}
        deleteArmed={deleteArmed}
        deleteImpact={editorImpact}
        error={error}
        onBack={() => setScreen(afterIntention)}
        onChange={(intention) => {
          setDeleteArmed(false);
          setScreen({ ...screen, value: intention });
        }}
        onChangeMode={(mode) => {
          setDeleteArmed(false);
          setScreen({
            ...screen,
            mode,
            value: changeIntentionMode(screen.value, mode),
          });
        }}
        onPickFocus={() => {
          setDeleteArmed(false);
          setScreen({
            type: "pick-intention-focus",
            draft: screen.value,
            returnTo: screen,
          });
        }}
        onPickSymbol={() => {
          setDeleteArmed(false);
          setScreen({
            type: "pick-intention-symbol",
            draft: screen.value,
            returnTo: screen,
          });
        }}
        onSave={() => void persistThen(() => app.saveIntention(screen.value), afterIntention)}
        onDelete={() =>
          armDelete("binding", screen.value.id, () => app.deleteIntention(screen.value.id), afterIntention)
        }
      />
    );
  }

  if (screen.type === "preset") {
    return (
      <PresetEditor
        screen={screen}
        deleteArmed={deleteArmed}
        deleteImpact={editorImpact}
        error={error}
        onBack={backToList}
        onChange={(preset) => {
          setDeleteArmed(false);
          setScreen({ ...screen, value: preset });
        }}
        onSave={() => void persist(() => app.savePreset(screen.value))}
        onDelete={() =>
          armDelete("preset", screen.value.id, () =>
            app.deletePreset(workspaceId, screen.value.id),
          )
        }
      />
    );
  }

  if (screen.type === "table-view") {
    return (
      <TableViewEditor
        screen={screen}
        fieldDefs={fieldDefs}
        deleteArmed={deleteArmed}
        deleteImpact={editorImpact}
        error={error}
        onBack={backToList}
        onChange={(view) => {
          setDeleteArmed(false);
          setScreen({ ...screen, value: view });
        }}
        onSave={() => void persist(() => app.saveTableView(screen.value))}
        onDelete={() =>
          armDelete("table", screen.value.id, () =>
            app.deleteTableView(workspaceId, screen.value.id),
          )
        }
      />
    );
  }

  // The column picker is a toolbar action (UI_DESIGN.md §3.2 item 3), so the
  // library owns the available-column list for the active table and the list
  // components only render rows. Only the two tables that have columns get it.
  const columnPool =
    table === "focus"
      ? poolColumns(FOCUS_BUILTIN_COLUMNS, fieldDefs, "focusPoint")
      : table === "symbols"
        ? poolColumns(SYMBOL_BUILTIN_COLUMNS, fieldDefs, "symbol")
        : [];
  const selectedColumns = resolveColumns(
    columnKeys,
    columnPool.map((col) => col.key),
  );
  // The Add action sits top-right in a fixed spot for the table it belongs to
  // (UI_DESIGN.md §3.2). Fields and Audio keep their own in-list add rows: their
  // add action is plural (three field kinds, two audio kinds) rather than one.
  const addAction =
    table === "focus" ? (
      <Button tier="secondary" onClick={addFocus}>
        Add focus point
      </Button>
    ) : table === "symbols" ? (
      <Button tier="secondary" onClick={addSymbol}>
        Add symbol
      </Button>
    ) : table === "intentions" ? (
      <Button tier="secondary" onClick={addIntentionFromList}>
        Add intention
      </Button>
    ) : table === "presets" ? (
      <Button tier="secondary" onClick={addPreset}>
        Add preset
      </Button>
    ) : table === "views" ? (
      <Button tier="secondary" onClick={addTableView}>
        Add table view
      </Button>
    ) : table === "fields" ? (
      <Button
        tier="secondary"
        onClick={() => addFieldDef(fieldFilter === "focusPoint" ? "focusPoint" : "symbol")}
      >
        Add {fieldFilter === "focusPoint" ? "focus point" : "symbol"} field
      </Button>
    ) : table === "audio" ? (
      // An upload needs a label wrapping a file input, so these are styled to
      // match the secondary tier rather than being Button itself.
      <div className="flex flex-wrap items-center gap-2">
        {(["ambient", "alarm"] as const).map((kind) => (
          <label
            key={kind}
            className="inline-flex h-11 cursor-pointer items-center rounded-xl border border-accent px-4 text-base text-accent"
          >
            Add {kind} file
            <input
              type="file"
              accept="audio/*"
              aria-label={`${kind} audio file`}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                void uploadMedia(kind, file);
              }}
            />
          </label>
        ))}
      </div>
    ) : null;

  return (
    <main className="flex flex-col gap-4">
      {/* No page title: the navigation bar above says `Library`, and the tab
          strip below says which section is open, so a third label repeating
          either of them is noise. What sits here instead is the one thing that
          belongs to the whole library rather than to a section: backup and
          restore, which process every tab at once. */}
      <div className="flex flex-wrap items-center gap-2">
        <CatalogBackupPanel
          onDownload={() => void downloadCatalog()}
          onRestore={(file) => void restoreCatalog(file)}
        />
      </div>
      {/* A persistent tab strip mirroring the nine TableId values exactly. The
          section switching and the remembered last section are unchanged: this
          is the chrome. */}
      <nav
        aria-label="Library sections"
        className="sticky top-0 z-10 flex gap-2 overflow-x-auto bg-bg/95 py-2 backdrop-blur [scroll-snap-type:x_proximity]"
      >
        {LIBRARY_TABS.map((tab) => (
          <Button
            key={tab.id}
            size="sm"
            tier={table === tab.id ? "primary" : "tertiary"}
            onClick={() => selectTable(tab.id)}
            className="shrink-0 snap-start"
          >
            {tab.label}
          </Button>
        ))}
      </nav>
      {/* The section's own row: the Add action takes the place the section
          heading used to hold (the tab above already names the section), and
          the view controls sit at the far end. */}
      <div className="flex flex-wrap items-center gap-3">
        {addAction}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* One switch, not two buttons: the section is either a list of cards
              or the table, and turning the table on is what brings the column
              filter with it. Only the three sections that have a table get it. */}
          {LIST_MODE_TABS.includes(table) ? (
            <LatchButton
              size="sm"
              label="Table"
              pressed={listMode === "table"}
              onChange={(on) => onListMode(on ? "table" : "cards")}
            />
          ) : null}
          {columnPool.length > 0 && listMode === "table" ? (
            // `key` resets the open panel when the tab changes, so the toolbar
            // never shows one table's columns over another table.
            <LibraryColumnPicker
              key={table}
              columns={columnPool}
              selected={selectedColumns}
              onToggle={(key) =>
                onColumnsChange(
                  toggleOrdered(selectedColumns, key, columnPool.map((col) => col.key)),
                )
              }
            />
          ) : null}
        </div>
      </div>
      {table === "focus" ? (
        <FocusList
          focusPoints={focusPoints}
          bindings={bindings}
          fieldDefs={fieldDefs}
          fieldValues={fieldValues}
          imageUrls={Object.fromEntries(
            focusPoints
              .filter((fp) => fp.representationAssetId && mediaUrls[fp.representationAssetId])
              .map((fp) => [fp.id, mediaUrls[fp.representationAssetId!]!]),
          )}
          columnKeys={columnKeys}
          listMode={listMode}
          armedId={armedCardId}
          deleteNotice={cardImpact}
          onOpenSheet={(fp) => openFocusSheet(fp.id)}
          onEditFocus={editFocusDetails}          onDeleteFocus={(fp) =>
            cardDelete(fp.id, "focus", () => app.deleteFocusPoint(workspaceId, fp.id))
          }
        />
      ) : null}
      {table === "symbols" ? (
        <SymbolsList
          symbols={symbols}
          fieldDefs={fieldDefs}
          fieldValues={fieldValues}
          imageUrls={Object.fromEntries(
            symbols
              .filter((s) => s.imageAssetId && mediaUrls[s.imageAssetId])
              .map((s) => [s.id, mediaUrls[s.imageAssetId!]!]),
          )}
          columnKeys={columnKeys}
          listMode={listMode}
          armedId={armedCardId}
          deleteNotice={cardImpact}
          onOpenSheet={(s) => openSymbolSheet(s.id)}
          onEdit={editSymbolDetails}
          onDelete={(s) => cardDelete(s.id, "symbol", () => app.deleteSymbol(workspaceId, s.id))}
        />
      ) : null}
      {table === "intentions" ? (
        <IntentionsList
          intentions={intentions}
          focusPoints={focusPoints}
          symbols={symbols}
          listMode={listMode}
          armedId={armedCardId}
          deleteNotice={cardImpact}
          onEdit={(row) => {
            setError(null);
            setDeleteArmed(false);
            setScreen({ type: "intention", value: row, isNew: false, mode: assocModeOf(row) });
          }}
          onDelete={(row) => cardDelete(row.id, "binding", () => app.deleteIntention(row.id))}
        />
      ) : null}
      {table === "fields" ? (
        <FieldsList
          fieldDefs={fieldDefs}
          filter={fieldFilter}
          onFilter={setFieldFilter}
          armedId={armedCardId}
          deleteNotice={cardImpact}
          onEdit={(def) => {
            setError(null);
            setDeleteArmed(false);
            setScreen({ type: "field-def", value: def, isNew: false });
          }}
          onDelete={(def) => cardDelete(def.id, "field", () => app.deleteFieldDef(workspaceId, def.id))}
        />
      ) : null}
      {table === "presets" ? (
        <PresetsList
          presets={presets}
          armedId={armedCardId}
          deleteNotice={cardImpact}
          onEdit={(preset) => {
            setError(null);
            setDeleteArmed(false);
            setScreen({ type: "preset", value: preset, isNew: false });
          }}
          onDuplicate={(preset) => void duplicatePreset(preset)}
          onDelete={(preset) =>
            cardDelete(preset.id, "preset", () => app.deletePreset(workspaceId, preset.id))
          }
        />
      ) : null}
      {table === "views" ? (
        <ViewsList
          tableViews={tableViews}
          armedId={armedCardId}
          deleteNotice={cardImpact}
          onEdit={(view) => {
            setError(null);
            setDeleteArmed(false);
            setScreen({ type: "table-view", value: view, isNew: false });
          }}
          onDelete={(view) => cardDelete(view.id, "table", () => app.deleteTableView(workspaceId, view.id))}
        />
      ) : null}
      {table === "audio" ? (
        <AudioList
          mediaAssets={mediaAssets}
          armedId={armedCardId}
          deleteNotice={cardImpact}
          onDelete={(asset) =>
            cardDelete(asset.id, "media", async () => {
              await app.deleteMediaAsset(workspaceId, asset.id);
              forgetMediaUrl(asset.id);
            })
          }
        />
      ) : null}
      {table === "plans" ? <PlansList planNames={planNames} onOpen={(id) => void openLibraryPlan(id)} /> : null}
      {table === "history" ? (
        <HistoryList
          sessionsThisWeek={sessionsThisWeek}
          logs={logs}
          planNames={planNames}
          onOpen={(id) => void openLibraryPlan(id)}
        />
      ) : null}
      {error ? <p className="text-lg text-destructive">{error}</p> : null}
    </main>
  );
}
