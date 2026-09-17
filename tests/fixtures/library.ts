import {
  classicBinauralPair,
  DEFAULT_FOCUS_DURATION_MS,
  defaultEarEq,
  type BinauralPreset,
  type CompileLibrary,
  type FieldDef,
  type FocusPoint,
  type FocusSymbolBinding,
  type Intention,
  type Plan,
  type PlanBlock,
  type Symbol,
  type TableView,
  type UserPreferences,
} from "@meditaur/domain";

/**
 * The versioning fields a row carries before it is written: what a test builds
 * rather than reads from a store. The write under test replaces both.
 */
export const NEW_ROW_VERSION: { revision: number; updatedAt: number } = {
  revision: 0,
  updatedAt: 0,
};

export function makeFocus(id: string, name: string, extra: Partial<FocusPoint> = {}): FocusPoint {
  return {
    id,
    workspaceId: "ws1",
    name,
    kind: "chakra",
    locationText: name,
    defaultBinauralPresetId: "preset1",
    defaultDurationMs: DEFAULT_FOCUS_DURATION_MS,
    description: null,
    governs: null,
    colour: null,
    element: null,
    representationAssetId: null,
    representationDescription: null,
    binauralEnabled: true,
    revision: 0,
    updatedAt: 0,
    ...extra,
  };
}

export function makeSymbol(id: string, name: string, extra: Partial<Symbol> = {}): Symbol {
  return {
    id,
    workspaceId: "ws1",
    name,
    description: `${name} description`,
    usage: `${name} usage`,
    imageAssetId: null,
    revision: 0,
    updatedAt: 0,
    ...extra,
  };
}

export function makeBinding(
  focusPointId: string,
  symbolId: string,
  sortOrder: number,
): FocusSymbolBinding {
  return { focusPointId, symbolId, sortOrder };
}

export function makeIntentions(
  focusPointId: string | null,
  symbolId: string | null,
  texts: string[],
  workspaceId = "ws1",
): Intention[] {
  return texts.map((text, i) => ({
    id: `${focusPointId ?? "none"}-${symbolId ?? "focus"}-a${i}`,
    workspaceId,
    focusPointId,
    symbolId,
    sortOrder: i,
    text,
    revision: 0,
    updatedAt: 0,
  }));
}

export function makePreset(extra: Partial<BinauralPreset> = {}): BinauralPreset {
  const pair = classicBinauralPair(200, 8, 0.4);
  return {
    id: "preset1",
    workspaceId: "ws1",
    name: "Theta",
    leftTones: [pair.left],
    rightTones: [pair.right],
    fadeInMs: 40,
    fadeOutMs: 40,
    eqLeft: defaultEarEq(),
    eqRight: defaultEarEq(),
    revision: 0,
    updatedAt: 0,
    ...extra,
  };
}

export function makeTableView(extra: Partial<TableView> = {}): TableView {
  return {
    id: "view1",
    workspaceId: "ws1",
    name: "Symbols",
    columnKeys: ["name", "description", "intentions"],
    symbolFilter: "block",
    revision: 0,
    updatedAt: 0,
    ...extra,
  };
}

export function makeFieldDef(extra: Partial<FieldDef> = {}): FieldDef {
  return {
    id: "fd1",
    workspaceId: "ws1",
    entityType: "symbol",
    key: "seed",
    label: "Seed",
    description: "",
    sortOrder: 0,
    revision: 0,
    updatedAt: 0,
    ...extra,
  };
}

export function makeBlock(
  id: string,
  sortOrder: number,
  type: PlanBlock["type"],
  extra: Partial<PlanBlock> = {},
): PlanBlock {
  return {
    id,
    sortOrder,
    type,
    durationMs: 1000,
    focusPointId: type === "focus" ? "fp1" : null,
    symbolId: null,
    symbolScope: "rotate",
    binauralPresetId: "preset1",
    tableViewId: "view1",
    ambientAssetId: null,
    alarmAssetId: null,
    ...extra,
  };
}

export function makePrefs(extra: Partial<UserPreferences> = {}): UserPreferences {
  return {
    userId: "u1",
    stopBinauralOnAlarm: true,
    autoAdvance: true,
    masterVolume: 0.7,
    alarmVolume: 0.6,
    ttsEnabled: false,
    textSize: "lg",
    lastPlanId: "plan1",
    revision: 0,
    updatedAt: 0,
    ...extra,
  };
}

export function makePlan(blocks: PlanBlock[], extra: Partial<Plan> = {}): Plan {
  return {
    id: "plan1",
    workspaceId: "ws1",
    name: "Session",
    cycleCount: 1,
    cycleUntilStopped: false,
    autoAdvance: true,
    binauralEnabled: true,
    revision: 0,
    blocks,
    ...extra,
  };
}

export function makeLibrary(extra: Partial<CompileLibrary> = {}): CompileLibrary {
  return {
    focusPoints: [makeFocus("fp1", "Root"), makeFocus("fp2", "Heart")],
    symbols: [makeSymbol("s1", "Lam"), makeSymbol("s2", "Earth"), makeSymbol("s3", "Yam")],
    bindings: [
      makeBinding("fp1", "s1", 0),
      makeBinding("fp1", "s2", 1),
      makeBinding("fp2", "s3", 0),
    ],
    intentions: [
      ...makeIntentions("fp1", "s1", ["I am grounded", "I am safe"]),
      ...makeIntentions("fp1", "s2", ["Body is home"]),
      ...makeIntentions("fp2", "s3", ["I am open"]),
    ],
    fieldDefs: [],
    fieldValues: [],
    tableViews: [makeTableView()],
    presets: [makePreset()],
    ...extra,
  };
}
