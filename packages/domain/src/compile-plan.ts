import { fail } from "./app-error.ts";
import { createId } from "./ids.ts";
import type {
  BinauralPreset,
  CompiledBlock,
  CompiledFact,
  CompiledSymbolGroup,
  Entry,
  FieldDef,
  FieldOption,
  FieldValue,
  Meditation,
  Intention,
  MediaAsset,
  MeditationType,
  Plan,
  PlanDisplayArea,
  PlanDisplayColumn,
  RefKind,
  SessionSnapshot,
  Symbol,
} from "./models.ts";
import { MAX_TONES_PER_EAR } from "./tones.ts";
import { blockStages, stagesDurationMs } from "./stages.ts";
import {
  AREA_OF_SCOPE,
  BUILTIN_AREA_COLUMNS,
  DEFAULT_PLAN_DISPLAY,
} from "./plan-display.ts";
import { entryIsVisible, isLive, lineIsVisible, livenessOf } from "./visibility.ts";

export const SNAPSHOT_SCHEMA_VERSION = 6;
export const SNAPSHOT_KEEP_PER_PLAN = 5;
export const SESSION_LOG_LIST_LIMIT = 50;

/**
 * The sentences written about one meditation, in the reader's order.
 *
 * The owner's round 16, §2.1: a sentence is one table and a block reads its **own**
 * meditation's. The order is the pairs' first and then the sentences' — which is the
 * order the Karuna table draws them in — so a Protection block reads what
 * Protection's rows say, in the order the reader arranged them.
 *
 * A sentence with no pair (`entryId: null`) is not about any meditation, so it is
 * nobody's: it lives in the Affirmations tab until something is associated with it.
 */
export function sentencesForMeditation(
  meditationId: string | null,
  entries: Entry[],
  intentions: Intention[],
): string[] {
  if (!meditationId) return [];
  const byOrder = (a: { sortOrder: number; id: string }, b: { sortOrder: number; id: string }) =>
    a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
  const sentences: string[] = [];
  for (const entry of entries.filter((row) => row.meditationId === meditationId).sort(byOrder)) {
    for (const line of intentions.filter((row) => row.entryId === entry.id).sort(byOrder)) {
      // A blank line is left out: the app refuses to store one, and a backup file
      // can carry anything, so compile does not take a row of spaces for a sentence.
      if (line.text.trim().length > 0) sentences.push(line.text);
    }
  }
  return sentences;
}

export type CompileLibrary = {
  meditations: Meditation[];
  /**
   * The meditation types, archived ones included.
   *
   * Compile itself does not need them — every block names its meditation — but the
   * library and the Database are built from this same read, so the types travel
   * with the catalogue rather than costing a second round trip.
   */
  meditationTypes: MeditationType[];
  symbols: Symbol[];
  entries: Entry[];
  /**
   * Every sentence in the workspace, archived ones included, orphans included.
   *
   * A block whose stages include an affirmations stage reads the ones written about
   * its **own** meditation (§2.1), so this travels with the catalogue for the same
   * reason the types do — the Database is built from this same read — and
   * `sentencesForMeditation` is who reads it.
   */
  intentions: Intention[];
  fieldDefs: FieldDef[];
  fieldOptions: FieldOption[];
  fieldValues: FieldValue[];
  presets: BinauralPreset[];
  mediaAssets?: MediaAsset[];
};

export type CompileOptions = {
  now?: number;
  id?: () => string;
  /**
   * Every stage runs this long, whatever its template says.
   *
   * This is the e2e hook (`meditaur:e2eDurationMs`): a suite cannot wait nine
   * minutes for a chakra's block, and a session whose stages were *removed* rather
   * than shortened would not be the session the suite is testing. It applies to each
   * stage, so a three-stage block stays three stages.
   */
  durationOverrideMs?: number | null;
  /**
   * The reader's `Stop binaural when alarm rings` preference, resolved by the
   * caller. It used to be a per-plan field as well, which meant the Settings
   * switch and the plan switch could disagree and only the plan one was ever
   * read — so the preference is the single source now.
   */
  stopBinauralOnAlarm?: boolean;
};

function indexBy<T>(items: T[], key: (item: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(key(item), item);
  }
  return map;
}

function pairKey(meditationId: string | null, symbolId: string | null): string {
  return `${meditationId ?? ""}:${symbolId ?? ""}`;
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

/**
 * What a builtin column reads for a record, or null when the key is not one of
 * that area's builtins — which is how a stored display key that no longer exists
 * (a column the reader deleted) is skipped rather than rendered blank.
 */
function builtinValue(
  area: PlanDisplayArea,
  key: string,
  record: Meditation | Symbol | null,
): string | null {
  if (area === "meditation") {
    if (!record || !("locationText" in record)) return null;
    if (key === "name") return record.name;
    if (key === "location") return record.locationText;
    return null;
  }
  if (area === "symbol") {
    if (!record || !("usage" in record)) return null;
    if (key === "name") return record.name;
    if (key === "description") return record.description;
    if (key === "usage") return record.usage;
    return null;
  }
  return null;
}

function builtinLabel(area: PlanDisplayArea, key: string): string {
  return BUILTIN_AREA_COLUMNS[area].find((column) => column.key === key)?.label ?? key;
}

/** What a stored cell says, once its cell type has had its say. */
function cellText(
  def: FieldDef,
  raw: string | undefined,
  input: {
    options: Map<string, FieldOption>;
    recordNames: Map<string, string>;
    assetNames: Map<string, string>;
  },
): string {
  if (!raw) return "";
  if (def.cellType === "select") return input.options.get(raw)?.label ?? "";
  if (def.cellType === "reference") {
    const kind: RefKind = def.refKind ?? "meditation";
    return input.recordNames.get(`${kind}:${raw}`) ?? "";
  }
  if (def.cellType === "image") return input.assetNames.get(raw) ?? "";
  return raw;
}

/** Everything a fact needs that does not change from record to record. */
type FactScope = {
  display: PlanDisplayColumn[];
  fields: FieldDef[];
  values: Map<string, string>;
  options: Map<string, FieldOption>;
  recordNames: Map<string, string>;
  assetNames: Map<string, string>;
};

/**
 * The facts one column list resolves to for one record.
 *
 * Two things are dropped rather than rendered: a key that matches no builtin and
 * no field — a column the reader deleted, whose display row is still listed — and
 * a value that is empty. A heading with nothing under it is not information, and
 * a session screen is the worst place to discover that.
 */
function factsFor(
  scope: FactScope,
  input: {
    area: PlanDisplayArea;
    entityId: string | null;
    record: Meditation | Symbol | null;
  },
): CompiledFact[] {
  const facts: CompiledFact[] = [];
  for (const column of scope.display) {
    if (!column.shown || column.area !== input.area) continue;
    // The key has to come from this area's table: two tables can both have a
    // `notes` column, and only the scope says which one a value belongs to.
    const def = scope.fields.find(
      (row) => row.key === column.key && AREA_OF_SCOPE[row.scope] === input.area,
    );
    if (!def) {
      const builtin = builtinValue(input.area, column.key, input.record);
      if (builtin) {
        facts.push({
          key: column.key,
          label: builtinLabel(input.area, column.key),
          value: builtin,
          pinned: column.pinned,
        });
      }
      continue;
    }
    if (!input.entityId) continue;
    const value = cellText(def, scope.values.get(`${input.entityId}:${def.id}`), scope);
    if (value) {
      facts.push({ key: def.key, label: def.label, value, pinned: column.pinned });
    }
  }
  return facts;
}

function groupForSymbol(
  meditationId: string | null,
  symbol: Symbol,
  input: FactScope & {
    intentByPair: Map<string, string[]>;
    entryIdByPair: Map<string, string>;
  },
): CompiledSymbolGroup {
  const pair = pairKey(meditationId, symbol.id);
  // "Symbol-only lines join the block whose symbol matches" (§10): a line written
  // about a symbol on its own belongs to that symbol's box wherever the symbol
  // appears, so it reads first and the pair's own lines follow.
  const solo = meditationId ? (input.intentByPair.get(pairKey(null, symbol.id)) ?? []) : [];
  return {
    name: symbol.name,
    description: symbol.description,
    usage: symbol.usage,
    imageAssetId: symbol.imageAssetId ?? null,
    facts: factsFor(input, { area: "symbol", entityId: symbol.id, record: symbol }),
    entryFacts: factsFor(input, {
      area: "entry",
      entityId: input.entryIdByPair.get(pair) ?? null,
      record: null,
    }),
    intentions: [...solo, ...(input.intentByPair.get(pair) ?? [])],
  };
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
  // The visibility rule, applied once and then relied on (§3.1). An archived row
  // is simply not in these collections, so everything downstream — the block
  // list, the symbols in play, the lines — is visible-or-absent by construction.
  const live = livenessOf(library);
  const liveMeditations = library.meditations.filter(isLive);
  const liveSymbols = library.symbols.filter(isLive);
  const liveEntries = library.entries.filter((entry) => entryIsVisible(entry, live));
  const liveEntryIds = new Set(liveEntries.map((entry) => entry.id));
  const liveLines = library.intentions.filter((line) => lineIsVisible(line, liveEntryIds));
  // The reader's own sentences, in their order, for each block that reads them.
  // Only a block with an affirmations stage carries any, and only the ones written
  // about **its own** meditation: a Thanks Giving stage reads Thanks Giving's, a
  // Protection stage reads Protection's — including the rows that carry a symbol,
  // which is where the seeded Protection sentence lives (§2.1, item 0.1). A blank
  // line is left out: the app refuses to store one, and a backup file can carry
  // anything, so compile does not take a row of spaces for a sentence.

  const focusById = indexBy(liveMeditations, (f) => f.id);
  const symbolById = indexBy(liveSymbols, (s) => s.id);
  const presetById = indexBy(library.presets.filter(isLive), (p) => p.id);
  const typeById = indexBy(library.meditationTypes, (t) => t.id);
  const assetById = indexBy(library.mediaAssets ?? [], (a) => a.id);
  const focusIsArchived = new Set(
    library.meditations.filter((row) => !isLive(row)).map((row) => row.id),
  );
  const symbolIsArchived = new Set(
    library.symbols.filter((row) => !isLive(row)).map((row) => row.id),
  );

  // The symbols in play come from the entries, not from a bindings table: an
  // entry that names a chakra and a symbol *is* the association.
  const entryIdByPair = new Map<string, string>();
  const symbolsByMeditation = new Map<string, Symbol[]>();
  for (const entry of [...liveEntries].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const key = pairKey(entry.meditationId, entry.symbolId);
    if (!entryIdByPair.has(key)) entryIdByPair.set(key, entry.id);
    if (!entry.meditationId || !entry.symbolId) continue;
    const symbol = symbolById.get(entry.symbolId);
    if (!symbol) continue;
    const list = symbolsByMeditation.get(entry.meditationId) ?? [];
    list.push(symbol);
    symbolsByMeditation.set(entry.meditationId, list);
  }

  const intentByPair = new Map<string, string[]>();
  for (const line of [...liveLines].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const entry = liveEntries.find((row) => row.id === line.entryId);
    if (!entry) continue;
    const key = pairKey(entry.meditationId, entry.symbolId);
    const list = intentByPair.get(key) ?? [];
    list.push(line.text);
    intentByPair.set(key, list);
  }

  const values = new Map<string, string>();
  for (const row of library.fieldValues) {
    values.set(`${row.entityId}:${row.fieldDefId}`, row.text);
  }
  const recordNames = new Map<string, string>();
  for (const row of liveMeditations) recordNames.set(`meditation:${row.id}`, row.name);
  for (const row of liveSymbols) recordNames.set(`symbol:${row.id}`, row.name);
  for (const row of library.presets.filter(isLive)) recordNames.set(`preset:${row.id}`, row.name);
  const factScope: FactScope = {
    display: plan.display?.columns ?? DEFAULT_PLAN_DISPLAY.columns,
    fields: library.fieldDefs.filter(isLive),
    values,
    options: indexBy(library.fieldOptions, (row) => row.id),
    recordNames,
    assetNames: new Map((library.mediaAssets ?? []).map((row) => [row.id, row.name])),
  };

  const nextSymbolIndex = new Map<string, number>();
  const blocks: CompiledBlock[] = [];
  for (const block of plan.blocks.slice().sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!block.meditationId) {
      // The owner's round 15 deleted cool-off, so a block that names nothing has
      // nothing to run. A stored block that did is dropped on the way in
      // (`parsePlanBlocks`), which is why reaching this is a broken plan rather
      // than an old one.
      fail("compile.meditationRequired", `Block ${block.id} requires a meditation`);
    }
    // A block whose meditation is archived steps aside rather than being removed: it
    // stays in the plan, is not shown and is not compiled, and Restore reveals it
    // where it was again (the owner's rule, 2026-09-18).
    if (block.meditationId && focusIsArchived.has(block.meditationId)) continue;
    const focus = requireListed(block.meditationId, focusById, block.id, "meditation");
    let symbol: Symbol | undefined;
    let showAll = false;
    if (focus) {
      if (block.symbolId) {
        // An archived symbol is not a missing one: the block keeps its place and
        // goes back to walking whatever the meditation still has, exactly as it does
        // when the symbol is deleted.
        symbol = symbolIsArchived.has(block.symbolId)
          ? undefined
          : requireListed(block.symbolId, symbolById, block.id, "symbol");
      } else if (block.symbolScope === "all") {
        showAll = true;
      } else {
        const list = symbolsByMeditation.get(focus.id) ?? [];
        if (list.length > 0) {
          const idx = nextSymbolIndex.get(focus.id) ?? 0;
          symbol = list[idx % list.length];
          nextSymbolIndex.set(focus.id, idx + 1);
        }
      }
    }
    const preset = requireListed(block.binauralPresetId, presetById, block.id, "preset");
    if (preset) {
      assertToneCap(preset);
    }
    // The block's own Display, or the plan's (the owner's round 17). Asked once per
    // block rather than once per plan, because the panel moved onto the meditation
    // and a circuit's Thanks Giving does not want the same columns as its chakras.
    const blockScope: FactScope = block.display
      ? { ...factScope, display: block.display.columns }
      : factScope;
    requireListed(block.ambientAssetId, assetById, block.id, "ambient audio");
    const alarm = requireListed(block.alarmAssetId, assetById, block.id, "alarm audio");
    const focusIntentions = focus ? (intentByPair.get(pairKey(focus.id, null)) ?? []) : [];
    let symbolGroups: CompiledSymbolGroup[] = [];
    if (focus && showAll) {
      symbolGroups = (symbolsByMeditation.get(focus.id) ?? []).map((row) =>
        groupForSymbol(focus.id, row, { ...blockScope, intentByPair, entryIdByPair }),
      );
    } else if (symbol) {
      symbolGroups = [
        groupForSymbol(focus?.id ?? null, symbol, { ...blockScope, intentByPair, entryIdByPair }),
      ];
    }
    const intentions = [
      ...focusIntentions,
      ...symbolGroups.flatMap((group) => group.intentions),
    ];
    const binauralAllowed = plan.binauralEnabled !== false && focus?.binauralEnabled !== false;
    // The stages this block runs, and its length as their sum. A block that names
    // no meditation — a cool-off block — keeps the single stage it was read with.
    const stages = blockStages(
      block,
      focus ?? null,
      focus ? (typeById.get(focus.typeId) ?? null) : null,
    );
    const overrideMs = options.durationOverrideMs ?? null;
    const timedStages =
      overrideMs == null
        ? stages
        : stages.map((row) => ({ ...row, durationMs: Math.max(0, overrideMs) }));
    blocks.push({
      blockId: block.id,
      // The stages' lengths added up, computed once here rather than on every tick.
      durationMs: stagesDurationMs(timedStages),
      stages: timedStages,
      affirmations: timedStages.some((row) => row.kind === "affirmations")
        ? sentencesForMeditation(focus?.id ?? null, liveEntries, liveLines)
        : [],
      meditationName: focus?.name ?? null,
      meditationTypeName: focus
        ? (typeById.get(focus.typeId)?.name ?? null)
        : null,
      symbolName: showAll ? null : (symbol?.name ?? null),
      intentions,
      focusIntentions,
      meditationFacts: focus
        ? factsFor(blockScope, { area: "meditation", entityId: focus.id, record: focus })
        : [],
      symbolGroups,
      // This block's own switch if it has one, and the plan's otherwise — the
      // reader's round 17 order of precedence, and the reason a plan whose blocks
      // say nothing behaves exactly as it did (§12.21).
      alarmEnabled: block.alarmEnabled ?? plan.alarmEnabled !== false,
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
    });
  }
  if (blocks.length === 0) {
    // Every block stepped aside because its chakra is archived. Saying so beats
    // handing the run screen a session with nothing in it.
    fail("compile.allArchived", "Every block in this plan is archived");
  }
  return {
    instanceId: (options.id ?? createId)(),
    planId: plan.id,
    compiledAt: options.now ?? Date.now(),
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    autoAdvance: plan.autoAdvance,
    alarmEnabled: plan.alarmEnabled !== false,
    stopBinauralOnAlarm: options.stopBinauralOnAlarm ?? true,
    cycleCount: plan.cycleCount,
    cycleUntilStopped: plan.cycleUntilStopped,
    blocks,
  };
}
