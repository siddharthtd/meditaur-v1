import { newRowVersion } from "@meditaur/application";
import {
  BUILTIN_COLUMN_KEYS,
  createId,
  DEFAULT_FOCUS_DURATION_MS,
  type BinauralPreset,
  type FieldDef,
  type FieldEntityType,
  type FieldValue,
  type FocusKind,
  type FocusPoint,
  type Intention,
  type Symbol,
  type SymbolFilter,
  type TableView,
} from "@meditaur/domain";

export type TableId =
  | "focus"
  | "symbols"
  | "intentions"
  | "fields"
  | "audio"
  | "presets"
  | "views"
  | "plans"
  | "history";

export const LIBRARY_TABLE_STORAGE_KEY = "meditaur:libraryTable";
export const LIBRARY_LIST_MODE_KEY = "meditaur:libraryListMode";
export const LIBRARY_COLUMNS_KEY = "meditaur:libraryColumns";
export const BINAURAL_DRAFT_KEY_PREFIX = "meditaur:binauralDraft:";

export const TABLE_IDS: TableId[] = [
  "focus",
  "symbols",
  "intentions",
  "fields",
  "audio",
  "presets",
  "views",
  "plans",
  "history",
];

export type ListMode = "cards" | "table";

export type AssocMode = "none" | "focus" | "symbol" | "both";

export type Screen =
  | { type: "list" }
  | { type: "pick-focus" }
  | { type: "pick-bind-symbol"; focusId: string }
  | { type: "pick-intention-focus"; draft: Intention; returnTo: Screen }
  | { type: "pick-intention-symbol"; draft: Intention; returnTo: Screen }
  | { type: "pick-focus-preset"; value: FocusPoint; isNew: boolean }
  | { type: "focus"; value: FocusPoint; isNew: boolean }
  | { type: "focus-sheet"; focusId: string }
  | { type: "symbol"; value: Symbol; isNew: boolean }
  | { type: "symbol-sheet"; symbolId: string }
  | { type: "field-def"; value: FieldDef; isNew: boolean; returnTo?: Screen }
  | { type: "intention"; value: Intention; isNew: boolean; mode: AssocMode; returnToFocusId?: string }
  | { type: "preset"; value: BinauralPreset; isNew: boolean }
  | { type: "table-view"; value: TableView; isNew: boolean }
  | { type: "binaural-config"; focusId: string };

/**
 * What one screen *is*, for the scroll memory (`useScreenScroll`).
 *
 * A screen's position belongs to the entry it is about, not to the screen type:
 * coming back to this focus point's editor should land where you left it, and
 * opening a different focus point should start at the top. The id is part of the
 * key for the same reason — and it is the id, not the draft, so typing a name
 * does not look like a different screen.
 */
export function screenId(screen: Screen): string {
  switch (screen.type) {
    case "focus":
    case "symbol":
    case "field-def":
    case "preset":
    case "table-view":
    case "intention":
      return `${screen.type}:${screen.value.id}`;
    case "focus-sheet":
      return `focus-sheet:${screen.focusId}`;
    case "symbol-sheet":
      return `symbol-sheet:${screen.symbolId}`;
    case "binaural-config":
      return `binaural-config:${screen.focusId}`;
    case "pick-bind-symbol":
      return `pick-bind-symbol:${screen.focusId}`;
    case "pick-focus-preset":
      return `pick-focus-preset:${screen.value.id}`;
    default:
      // `list` (keyed by its tab, in `Library`), and the pickers whose position
      // only lasts the one visit.
      return screen.type;
  }
}

export const KIND_TILES: { id: FocusKind; label: string }[] = [
  { id: "chakra", label: "Chakra" },
  { id: "point", label: "Point" },
  { id: "custom", label: "Custom" },
];

export const FILTER_TILES: { id: SymbolFilter; label: string }[] = [
  { id: "block", label: "This block" },
  { id: "focusPoint", label: "Focus point" },
  { id: "all", label: "All symbols" },
];

export const ASSOC_TILES: { id: AssocMode; label: string }[] = [
  { id: "none", label: "None" },
  { id: "focus", label: "Focus point" },
  { id: "symbol", label: "Symbol" },
  { id: "both", label: "Both" },
];

export type LibraryColumn = { key: string; label: string; image?: boolean };

export const FOCUS_BUILTIN_COLUMNS: LibraryColumn[] = [
  { key: "name", label: "Name" },
  { key: "image", label: "Image", image: true },
  { key: "kind", label: "Kind" },
  { key: "location", label: "Location" },
  { key: "symbols", label: "Symbols" },
];

export const SYMBOL_BUILTIN_COLUMNS: LibraryColumn[] = [
  { key: "name", label: "Name" },
  { key: "image", label: "Image", image: true },
  { key: "description", label: "Description" },
  { key: "usage", label: "Usage" },
];

/** Built-in columns first, then the custom field defs of that entity pool. */
export function poolColumns(
  builtins: LibraryColumn[],
  defs: FieldDef[],
  entityType: FieldEntityType,
): LibraryColumn[] {
  return [
    ...builtins,
    ...[...defs]
      .filter((def) => def.entityType === entityType)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((def) => ({ key: def.key, label: def.label })),
  ];
}

export function parseLibraryTableId(raw: string | null): TableId {
  if (raw === "affirmations") return "intentions";
  if (raw && TABLE_IDS.includes(raw as TableId)) return raw as TableId;
  return "focus";
}

export function readLibraryTable(): TableId {
  try {
    return parseLibraryTableId(sessionStorage.getItem(LIBRARY_TABLE_STORAGE_KEY));
  } catch {
    return "focus";
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

export function binauralDraftKey(focusPointId: string): string {
  return `${BINAURAL_DRAFT_KEY_PREFIX}${focusPointId}`;
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

export function readBinauralDraft(focusPointId: string): BinauralDraftPayload | null {
  try {
    const raw = sessionStorage.getItem(binauralDraftKey(focusPointId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BinauralDraftPayload;
    return { ...parsed, revision: parsed.revision ?? 0 };
  } catch {
    return null;
  }
}

export function writeBinauralDraft(focusPointId: string, draft: BinauralDraftPayload): void {
  try {
    sessionStorage.setItem(binauralDraftKey(focusPointId), JSON.stringify(draft));
  } catch {
    return;
  }
}

export function clearBinauralDraft(focusPointId: string): void {
  try {
    sessionStorage.removeItem(binauralDraftKey(focusPointId));
  } catch {
    return;
  }
}

/**
 * Drops the drafts of focus points that no longer exist.
 *
 * A draft is keyed by focus point and is only removed on save, try, or revert —
 * so a reader who opens the binaural config and leaves without choosing leaves
 * its draft behind, and deleting the focus point strands it for good. Nothing
 * else enumerates those keys, so this runs with each library load, which is the
 * only moment the live set is known.
 */
export function pruneBinauralDrafts(liveFocusPointIds: Iterable<string>): void {
  try {
    const live = new Set<string>();
    for (const id of liveFocusPointIds) live.add(binauralDraftKey(id));
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

export function toggleColumn(columnKeys: string[], key: string): string[] {
  return toggleOrdered(columnKeys, key, [...BUILTIN_COLUMN_KEYS]);
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
  return draftsForEntity(symbolId, defs.filter((d) => d.entityType === "symbol"), values);
}

export function draftsForFocus(
  focusId: string,
  defs: FieldDef[],
  values: FieldValue[],
): Record<string, string> {
  return draftsForEntity(focusId, defs.filter((d) => d.entityType === "focusPoint"), values);
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

export function assocModeOf(intention: Pick<Intention, "focusPointId" | "symbolId">): AssocMode {
  if (intention.focusPointId && intention.symbolId) return "both";
  if (intention.focusPointId) return "focus";
  if (intention.symbolId) return "symbol";
  return "none";
}

export function emptyFocusPoint(workspaceId: string, presetId: string | null): FocusPoint {
  return {
    id: createId(),
    workspaceId,
    name: "",
    kind: "custom",
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
    ...newRowVersion(),
  };
}
