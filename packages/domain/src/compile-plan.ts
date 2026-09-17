import { fail } from "./app-error.ts";
import { createId } from "./ids.ts";
import type {
  BinauralPreset,
  CompiledBlock,
  CompiledSymbolGroup,
  CompiledTable,
  FieldDef,
  FieldValue,
  FocusPoint,
  FocusSymbolBinding,
  Intention,
  MediaAsset,
  Plan,
  SessionSnapshot,
  Symbol,
  TableView,
} from "./models.ts";
import { MAX_TONES_PER_EAR } from "./tones.ts";

export const SNAPSHOT_SCHEMA_VERSION = 3;
export const SNAPSHOT_KEEP_PER_PLAN = 5;
export const SESSION_LOG_LIST_LIMIT = 50;

export type CompileLibrary = {
  focusPoints: FocusPoint[];
  symbols: Symbol[];
  bindings: FocusSymbolBinding[];
  intentions: Intention[];
  fieldDefs: FieldDef[];
  fieldValues: FieldValue[];
  tableViews: TableView[];
  presets: BinauralPreset[];
  mediaAssets?: MediaAsset[];
};

export type CompileOptions = {
  now?: number;
  id?: () => string;
  durationOverrideMs?: number | null;
  /**
   * The reader's `Stop binaural when alarm rings` preference, resolved by the
   * caller. It used to be a per-plan field as well, which meant the Settings
   * switch and the plan switch could disagree and only the plan one was ever
   * read — so the preference is the single source now.
   */
  stopBinauralOnAlarm?: boolean;
};

export const BUILTIN_COLUMNS = {
  name: "Name",
  description: "Description",
  usage: "Usage",
  intentions: "Intentions",
} as const;

export const BUILTIN_COLUMN_KEYS = Object.keys(BUILTIN_COLUMNS) as Array<
  keyof typeof BUILTIN_COLUMNS
>;

function indexBy<T>(items: T[], key: (item: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(key(item), item);
  }
  return map;
}

function pairKey(focusPointId: string | null, symbolId: string | null): string {
  return `${focusPointId ?? ""}:${symbolId ?? ""}`;
}

function requireListed<T>(
  id: string | null,
  map: Map<string, T>,
  blockId: string,
  kind: string,
): T | undefined {
  if (id == null) return undefined;
  const row = map.get(id);
  if (!row) {
    fail("compile.missingRef", `Block ${blockId} points at a missing ${kind}`);
  }
  return row;
}

function assertToneCap(preset: BinauralPreset): void {
  if (preset.leftTones.length > MAX_TONES_PER_EAR || preset.rightTones.length > MAX_TONES_PER_EAR) {
    fail("compile.toneCap", `At most ${MAX_TONES_PER_EAR} tones per ear`);
  }
}

function boundSymbolsForFocus(
  focusPointId: string,
  bindings: FocusSymbolBinding[],
  symbolById: Map<string, Symbol>,
): Symbol[] {
  return [...bindings]
    .filter((row) => row.focusPointId === focusPointId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((row) => symbolById.get(row.symbolId))
    .filter((symbol): symbol is Symbol => Boolean(symbol));
}

function groupForSymbol(
  focusPointId: string,
  symbol: Symbol,
  intentByPair: Map<string, string[]>,
): CompiledSymbolGroup {
  return {
    name: symbol.name,
    description: symbol.description,
    usage: symbol.usage,
    imageAssetId: symbol.imageAssetId ?? null,
    intentions: intentByPair.get(pairKey(focusPointId, symbol.id)) ?? [],
  };
}

function compileTable(
  view: TableView,
  symbols: Symbol[],
  bindings: FocusSymbolBinding[],
  intentions: Intention[],
  fieldDefs: FieldDef[],
  fieldValues: FieldValue[],
  currentSymbolId: string | null,
  currentFocusPointId: string | null,
): CompiledTable {
  const symbolDefs = fieldDefs.filter((d) => d.entityType === "symbol");
  const defByKey = indexBy(symbolDefs, (d) => d.key);
  const symbolById = indexBy(symbols, (s) => s.id);
  let rowsSymbols = symbols;
  if (view.symbolFilter === "block") {
    rowsSymbols = currentSymbolId ? symbols.filter((s) => s.id === currentSymbolId) : [];
  } else if (view.symbolFilter === "focusPoint") {
    rowsSymbols = currentFocusPointId
      ? boundSymbolsForFocus(currentFocusPointId, bindings, symbolById)
      : [];
  }
  const columns = view.columnKeys.map((key) => ({
    key,
    label:
      (key in BUILTIN_COLUMNS
        ? BUILTIN_COLUMNS[key as keyof typeof BUILTIN_COLUMNS]
        : undefined) ??
      defByKey.get(key)?.label ??
      key,
  }));
  const intentByPair = new Map<string, string[]>();
  for (const row of [...intentions].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!row.symbolId || !row.focusPointId) continue;
    const key = pairKey(row.focusPointId, row.symbolId);
    const list = intentByPair.get(key) ?? [];
    list.push(row.text);
    intentByPair.set(key, list);
  }
  const valueKey = (entityId: string, fieldDefId: string) => `${entityId}:${fieldDefId}`;
  const values = new Map<string, string>();
  for (const fv of fieldValues) {
    values.set(valueKey(fv.entityId, fv.fieldDefId), fv.text);
  }
  const rows = rowsSymbols.map((symbol) =>
    view.columnKeys.map((key) => {
      if (key === "name") return symbol.name;
      if (key === "description") return symbol.description;
      if (key === "usage") return symbol.usage;
      if (key === "intentions" || key === "affirmations") {
        const pair = currentFocusPointId
          ? (intentByPair.get(pairKey(currentFocusPointId, symbol.id)) ?? [])
          : [];
        return pair.join(" · ");
      }
      const def = defByKey.get(key);
      if (!def) return "";
      return values.get(valueKey(symbol.id, def.id)) ?? "";
    }),
  );
  return { viewName: view.name, columns, rows };
}

export function compilePlan(
  plan: Plan,
  library: CompileLibrary,
  options: CompileOptions = {},
): SessionSnapshot {
  if (plan.blocks.length === 0) {
    fail("compile.empty", "Plan has no blocks");
  }
  if (!plan.cycleUntilStopped && plan.cycleCount < 1) {
    fail("compile.cycleCount", "cycleCount must be >= 1");
  }
  const focusById = indexBy(library.focusPoints, (f) => f.id);
  const symbolById = indexBy(library.symbols, (s) => s.id);
  const presetById = indexBy(library.presets, (p) => p.id);
  const viewById = indexBy(library.tableViews, (v) => v.id);
  const assetById = indexBy(library.mediaAssets ?? [], (a) => a.id);
  const symbolsByFocus = new Map<string, Symbol[]>();
  for (const binding of [...library.bindings].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const symbol = symbolById.get(binding.symbolId);
    if (!symbol) continue;
    const list = symbolsByFocus.get(binding.focusPointId) ?? [];
    list.push(symbol);
    symbolsByFocus.set(binding.focusPointId, list);
  }
  const intentByPair = new Map<string, string[]>();
  for (const row of [...library.intentions].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!row.focusPointId) continue;
    const key = pairKey(row.focusPointId, row.symbolId);
    const list = intentByPair.get(key) ?? [];
    list.push(row.text);
    intentByPair.set(key, list);
  }
  const nextSymbolIndex = new Map<string, number>();
  const durationOverride = options.durationOverrideMs ?? null;
  const blocks: CompiledBlock[] = plan.blocks
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((block) => {
      if (block.type === "focus" && !block.focusPointId) {
        fail("compile.focusRequired", `Focus block ${block.id} requires a focus point`);
      }
      const focus = requireListed(block.focusPointId, focusById, block.id, "focus point");
      let symbol: Symbol | undefined;
      let showAll = false;
      if (block.type === "focus" && focus) {
        if (block.symbolId) {
          symbol = requireListed(block.symbolId, symbolById, block.id, "symbol");
        } else if (block.symbolScope === "all") {
          showAll = true;
        } else {
          const list = symbolsByFocus.get(focus.id) ?? [];
          if (list.length > 0) {
            const idx = nextSymbolIndex.get(focus.id) ?? 0;
            symbol = list[idx % list.length];
            nextSymbolIndex.set(focus.id, idx + 1);
          }
        }
      } else if (block.symbolId) {
        requireListed(block.symbolId, symbolById, block.id, "symbol");
      }
      const preset = requireListed(block.binauralPresetId, presetById, block.id, "preset");
      if (preset) {
        assertToneCap(preset);
      }
      const view = requireListed(block.tableViewId, viewById, block.id, "table view");
      requireListed(block.ambientAssetId, assetById, block.id, "ambient audio");
      const alarm = requireListed(block.alarmAssetId, assetById, block.id, "alarm audio");
      const table = view
        ? compileTable(
            view,
            library.symbols,
            library.bindings,
            library.intentions,
            library.fieldDefs,
            library.fieldValues,
            symbol?.id ?? null,
            focus?.id ?? null,
          )
        : null;
      const focusIntentions = focus ? (intentByPair.get(pairKey(focus.id, null)) ?? []) : [];
      let symbolGroups: CompiledSymbolGroup[] = [];
      if (focus && showAll) {
        symbolGroups = (symbolsByFocus.get(focus.id) ?? []).map((row) =>
          groupForSymbol(focus.id, row, intentByPair),
        );
      } else if (focus && symbol) {
        symbolGroups = [groupForSymbol(focus.id, symbol, intentByPair)];
      }
      const intentions = [
        ...focusIntentions,
        ...symbolGroups.flatMap((group) => group.intentions),
      ];
      const binauralAllowed = plan.binauralEnabled !== false && focus?.binauralEnabled !== false;
      return {
        blockId: block.id,
        type: block.type,
        durationMs: durationOverride ?? block.durationMs,
        focusPointName: focus?.name ?? null,
        symbolName: showAll ? null : (symbol?.name ?? null),
        intentions,
        focusIntentions,
        symbolGroups,
        table,
        binaural:
          binauralAllowed && preset
            ? {
                leftTones: preset.leftTones.map((t) => ({ ...t })),
                rightTones: preset.rightTones.map((t) => ({ ...t })),
                fadeInMs: preset.fadeInMs,
                fadeOutMs: preset.fadeOutMs,
                eqLeft: { bands: preset.eqLeft.bands.map((b) => ({ ...b })) },
                eqRight: { bands: preset.eqRight.bands.map((b) => ({ ...b })) },
              }
            : null,
        ambientAssetId: block.ambientAssetId,
        alarmAssetId: block.alarmAssetId,
        alarmDurationMs: alarm?.durationMs ?? 0,
      };
    });
  return {
    instanceId: (options.id ?? createId)(),
    planId: plan.id,
    compiledAt: options.now ?? Date.now(),
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    autoAdvance: plan.autoAdvance,
    stopBinauralOnAlarm: options.stopBinauralOnAlarm ?? true,
    cycleCount: plan.cycleCount,
    cycleUntilStopped: plan.cycleUntilStopped,
    blocks,
  };
}
