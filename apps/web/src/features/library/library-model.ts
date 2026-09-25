import { newRowVersion } from "@meditaur/application";
import {
  classicBinauralPair,
  createId,
  DEFAULT_FOCUS_DURATION_MS,
  defaultEarEq,
  flagIsOn,
  type BinauralPreset,
  type FeatureFlags,
  type FieldDef,
  type FieldScope,
  type FieldValue,
  type MeditationType,
  type Meditation,
  type Symbol,
} from "@meditaur/domain";

/**
 * The library's tabs.
 *
 * `Intentions`, `Views` and `Fields` are gone: one screen replaced them, and on
 * 2026-09-19 that screen — the **Database** — left this strip for a nav entry of
 * its own. What is left here browses the catalogue; nothing on this page writes.
 *
 * The strip is **generated** (the owner's round 15, §8): one tab per live
 * meditation type, then the fixed screens below. A type is a row, so a reader who
 * adds one gets a tab with nothing to register — which is why the type tabs are
 * namespaced (`type:<id>`) rather than bare ids: a type's tab id must stay the
 * same when its *name* is edited, so the scroll memory and the stored
 * `meditaur:libraryTable` value survive a rename.
 */
export type FixedTableId = "symbols" | "archive" | "audio" | "presets" | "plans" | "history";
export type TableId = FixedTableId | `type:${string}`;

export const LIBRARY_TABLE_STORAGE_KEY = "meditaur:libraryTable";
export const LIBRARY_LIST_MODE_KEY = "meditaur:libraryListMode";
export const LIBRARY_COLUMNS_KEY = "meditaur:libraryColumns";
export const BINAURAL_DRAFT_KEY_PREFIX = "meditaur:binauralDraft:";
export const TYPE_TAB_PREFIX = "type:";

/** The fixed screens, in the order they follow the type tabs. */
export const FIXED_LIBRARY_TABS: { id: FixedTableId; label: string }[] = [
  { id: "symbols", label: "Symbols" },
  { id: "archive", label: "Archive" },
  { id: "audio", label: "Audio files" },
  { id: "presets", label: "Presets" },
  { id: "plans", label: "Plans" },
  { id: "history", label: "History" },
];

export function typeTabId(typeId: string): TableId {
  return `${TYPE_TAB_PREFIX}${typeId}`;
}

/** The type a tab belongs to, or `null` for one of the fixed screens. */
export function typeTabTypeId(table: TableId | null): string | null {
  if (!table || !table.startsWith(TYPE_TAB_PREFIX)) return null;
  const id = table.slice(TYPE_TAB_PREFIX.length);
  return id.length > 0 ? id : null;
}

/** The tabs that browse a list with cards or a table, and so get the Columns picker. */
export function isListTab(table: TableId | null): boolean {
  return typeTabTypeId(table) != null || table === "symbols";
}

/** The whole strip: one tab per live type, then the fixed ones (§12.23). */
export function libraryTabs(
  types: MeditationType[],
  flags?: FeatureFlags | null,
): { id: TableId; label: string }[] {
  return [
    ...liveTypes(types).map((row) => ({ id: typeTabId(row.id), label: row.name })),
    // The Presets tab is the binaural sound catalogue, and every row in it opens the
    // preset editor — so it leaves with the `binaural` flag (`P0 · 35`, slice 35d). The
    // rows stay in the store and come back with the flag.
    ...FIXED_LIBRARY_TABS.filter((row) => row.id !== "presets" || flagIsOn(flags, "binaural")),
  ];
}

export type ListMode = "cards" | "table";

/**
 * One screen, and it reads: the list. A chakra's and a symbol's page used to be screens in
 * this stack as well, and the owner's round 22 made them a **route** of their own
 * (`record-route.ts`) — one record, one address, opened and edited on one screen. Everything
 * that *writes* was already out of reach here, so what is left is the list and the two
 * questions the list asks about a table: what the tabs are, and which one is open.
 */
export type Screen = { type: "list" };

/**
 * What one screen *is*, for the scroll memory (`useScreenScroll`).
 *
 * A screen's position belongs to the list's own tab, so the id is the table's — see
 * `Library`'s call. A record's position is keyed by the record, in `RecordScreen`.
 */
export function screenId(screen: Screen): string {
  return screen.type;
}

/**
 * The live types, in the reader's order, for the screens that only read them.
 *
 * A type is a row (the owner's round 15), so "which types are there" is a question
 * about the store, not about this file: a reader who adds one gets it in every
 * picker, every tab and every Database table with nothing to register.
 */
export function liveTypes(types: MeditationType[]): MeditationType[] {
  return [...types]
    .filter((row) => row.archivedAt == null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** The live types as `TileGrid` tiles, for the one control that picks one. */
export function typeTiles(types: MeditationType[]): { id: string; label: string }[] {
  return liveTypes(types).map((row) => ({ id: row.id, label: row.name }));
}

/** What a meditation's type is called. `-` when the row is gone. */
export function typeName(types: MeditationType[], typeId: string): string {
  return types.find((row) => row.id === typeId)?.name ?? "-";
}

export type LibraryColumn = { key: string; label: string; image?: boolean };

export const MEDITATION_BUILTIN_COLUMNS: LibraryColumn[] = [
  { key: "name", label: "Name" },
  { key: "image", label: "Image", image: true },
  { key: "type", label: "Type" },
  { key: "location", label: "Location" },
  { key: "symbols", label: "Symbols" },
];

export const SYMBOL_BUILTIN_COLUMNS: LibraryColumn[] = [
  { key: "name", label: "Name" },
  { key: "image", label: "Image", image: true },
  { key: "description", label: "Description" },
  { key: "usage", label: "Usage" },
];

/**
 * Whether a column belongs to a pool.
 *
 * A column belongs to one type, or to every type (`typeId === null`, §12.4). The
 * pool it is drawn in is the difference: a Thanks Giving column must not appear
 * on a Protection row, in that row's editor, or in the tab that lists it.
 */
export function columnIsInPool(def: { typeId: string | null }, typeId: string | null): boolean {
  return def.typeId == null || def.typeId === typeId;
}

/** Built-in columns first, then the custom field defs of that scope's pool. */
export function poolColumns(
  builtins: LibraryColumn[],
  defs: FieldDef[],
  scope: FieldScope,
  /** The type whose pool this is, or `null` for a pool that is not a type's. */
  typeId: string | null = null,
): LibraryColumn[] {
  return [
    ...builtins,
    ...[...defs]
      .filter(
        (def) =>
          def.archivedAt == null && def.scope === scope && columnIsInPool(def, typeId),
      )
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((def) => ({ key: def.key, label: def.label })),
  ];
}

/**
 * The tab a stored value names, or `null` when it names none.
 *
 * `focus` was this strip's one tab for every meditation until the owner's round
 * 15 split it into a tab per type, and `affirmations`, `intentions`, `views` and
 * `fields` were replaced by the Database before that. All of them answer `null`,
 * which the screen reads as "the first tab" — the first live type — because the
 * first tab is a question about the store and this function only sees a string.
 */
export function parseLibraryTableId(raw: string | null): TableId | null {
  if (!raw) return null;
  if ((FIXED_LIBRARY_TABS as { id: string }[]).some((row) => row.id === raw)) {
    return raw as FixedTableId;
  }
  if (raw.startsWith(TYPE_TAB_PREFIX) && raw.length > TYPE_TAB_PREFIX.length) {
    return raw as TableId;
  }
  return null;
}

export function readLibraryTable(): TableId | null {
  try {
    return parseLibraryTableId(sessionStorage.getItem(LIBRARY_TABLE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeLibraryTable(id: TableId): void {
  try {
    sessionStorage.setItem(LIBRARY_TABLE_STORAGE_KEY, id);
  } catch {
    return;
  }
}

export function readListMode(table: TableId): ListMode {
  try {
    const raw = sessionStorage.getItem(`${LIBRARY_LIST_MODE_KEY}:${table}`);
    return raw === "table" ? "table" : "cards";
  } catch {
    return "cards";
  }
}

export function writeListMode(table: TableId, mode: ListMode): void {
  try {
    sessionStorage.setItem(`${LIBRARY_LIST_MODE_KEY}:${table}`, mode);
  } catch {
    return;
  }
}

export function binauralDraftKey(meditationId: string): string {
  return `${BINAURAL_DRAFT_KEY_PREFIX}${meditationId}`;
}

export type BinauralDraftPayload = {
  name: string;
  leftTones: BinauralPreset["leftTones"];
  rightTones: BinauralPreset["rightTones"];
  fadeInMs: number;
  fadeOutMs: number;
  eqLeft: BinauralPreset["eqLeft"];
  eqRight: BinauralPreset["eqRight"];
  sourcePresetId: string | null;
  /**
   * The revision of the preset this draft is editing, or 0 for a new one. The
   * draft is what carries it, because the screen saves a preset it did not read:
   * without this the write would stamp 1 over whatever the row had reached.
   */
  revision: number;
};

export function readBinauralDraft(meditationId: string): BinauralDraftPayload | null {
  try {
    const raw = sessionStorage.getItem(binauralDraftKey(meditationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BinauralDraftPayload;
    return { ...parsed, revision: parsed.revision ?? 0 };
  } catch {
    return null;
  }
}

export function writeBinauralDraft(meditationId: string, draft: BinauralDraftPayload): void {
  try {
    sessionStorage.setItem(binauralDraftKey(meditationId), JSON.stringify(draft));
  } catch {
    return;
  }
}

export function clearBinauralDraft(meditationId: string): void {
  try {
    sessionStorage.removeItem(binauralDraftKey(meditationId));
  } catch {
    return;
  }
}

/**
 * Drops the drafts of meditations that no longer exist.
 *
 * A draft is keyed by meditation and is only removed on save, try, or revert —
 * so a reader who opens the binaural config and leaves without choosing leaves
 * its draft behind, and deleting the meditation strands it for good. Nothing
 * else enumerates those keys, so this runs with each library load, which is the
 * only moment the live set is known.
 */
export function pruneBinauralDrafts(liveMeditationIds: Iterable<string>): void {
  try {
    const live = new Set<string>();
    for (const id of liveMeditationIds) live.add(binauralDraftKey(id));
    const doomed: string[] = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (!key || !key.startsWith(BINAURAL_DRAFT_KEY_PREFIX)) continue;
      if (!live.has(key)) doomed.push(key);
    }
    for (const key of doomed) sessionStorage.removeItem(key);
  } catch {
    return;
  }
}

type ColumnStore = Record<string, string[]>;

function readColumnStore(): ColumnStore {
  try {
    const raw = sessionStorage.getItem(LIBRARY_COLUMNS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as ColumnStore;
  } catch {
    return {};
  }
}

/**
 * Which columns a browse tab shows, for the session.
 *
 * `null` means "every column", so a reader who has never opened the picker sees
 * the table as it is, and a column added later appears rather than staying hidden
 * behind a selection made before it existed. The Database has no such setting: a
 * column there *is* the table, and what a session shows lives on the plan.
 */
export function readTableColumns(table: TableId): string[] | null {
  const stored = readColumnStore()[table];
  if (!Array.isArray(stored)) return null;
  return stored.filter((key): key is string => typeof key === "string");
}

export function writeTableColumns(table: TableId, keys: string[]): void {
  const store = readColumnStore();
  store[table] = keys;
  try {
    sessionStorage.setItem(LIBRARY_COLUMNS_KEY, JSON.stringify(store));
  } catch {
    return;
  }
}

/** Keep only selectable columns, in canonical order; null selection means "all". */
export function resolveColumns(selected: string[] | null, order: string[]): string[] {
  if (!selected) return [...order];
  const on = new Set(selected);
  return order.filter((key) => on.has(key));
}

export function toggleOrdered(selected: string[], key: string, order: string[]): string[] {
  const on = new Set(selected);
  if (on.has(key)) on.delete(key);
  else on.add(key);
  const inOrder = order.filter((k) => on.has(k));
  const rest = selected.filter((k) => !order.includes(k) && on.has(k));
  if (on.has(key) && !order.includes(key) && !rest.includes(key)) rest.push(key);
  return [...inOrder, ...rest];
}

export function draftsForEntity(
  entityId: string,
  defs: FieldDef[],
  values: FieldValue[],
): Record<string, string> {
  return Object.fromEntries(
    defs.map((def) => {
      const row = values.find((v) => v.entityId === entityId && v.fieldDefId === def.id);
      return [def.id, row?.text ?? ""];
    }),
  );
}

export function draftsForSymbol(
  symbolId: string,
  defs: FieldDef[],
  values: FieldValue[],
): Record<string, string> {
  return draftsForEntity(symbolId, defs.filter((d) => d.scope === "symbol"), values);
}

export function draftsForMeditation(
  meditationId: string,
  defs: FieldDef[],
  values: FieldValue[],
  /** The meditation's own type: its pool, plus the shared columns (§12.4). */
  typeId: string | null = null,
): Record<string, string> {
  return draftsForEntity(
    meditationId,
    defs.filter((d) => d.scope === "meditation" && columnIsInPool(d, typeId)),
    values,
  );
}

export function nextSortOrder(items: { sortOrder: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1;
}

/** §3.2 — pickers list symbols by name. */
export function sortSymbolsForPicker(symbols: Symbol[]): Symbol[] {
  return [...symbols].sort((a, b) => a.name.localeCompare(b.name));
}

export function formatDurationMs(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

export function emptyMeditation(
  workspaceId: string,
  presetId: string | null,
  /** The type a brand-new meditation belongs to: the first live one. */
  typeId: string,
): Meditation {
  return {
    id: createId(),
    workspaceId,
    name: "",
    typeId,
    locationText: "",
    defaultBinauralPresetId: presetId,
    defaultDurationMs: DEFAULT_FOCUS_DURATION_MS,
    description: null,
    governs: null,
    colour: null,
    element: null,
    representationAssetId: null,
    representationDescription: null,
    binauralEnabled: true,
    // A new row follows its type: no copy of its own until the reader tunes one,
    // which is what `null` means (`stagesForMeditation`).
    stages: null,
    sortOrder: 0,
    archivedAt: null,
    ...newRowVersion(),
  };
}

export function emptySymbol(workspaceId: string): Symbol {
  return {
    id: createId(),
    workspaceId,
    name: "",
    description: "",
    usage: "",
    imageAssetId: null,
    sortOrder: 0,
    archivedAt: null,
    ...newRowVersion(),
  };
}

export function emptyPreset(workspaceId: string): BinauralPreset {
  const pair = classicBinauralPair(200, 8, 0.45);
  return {
    id: createId(),
    workspaceId,
    name: "",
    leftTones: [pair.left],
    rightTones: [pair.right],
    fadeInMs: 40,
    fadeOutMs: 40,
    eqLeft: defaultEarEq(),
    eqRight: defaultEarEq(),
    sortOrder: 0,
    archivedAt: null,
    ...newRowVersion(),
  };
}
