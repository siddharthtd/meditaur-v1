import {
  classicBinauralPair,
  DEFAULT_FOCUS_DURATION_MS,
  DEFAULT_PLAN_DISPLAY,
  DEFAULT_REIKI_SYSTEM,
  defaultEarEq,
  type BinauralPreset,
  type CompileLibrary,
  type Entry,
  type FieldDef,
  type FieldOption,
  type Meditation,
  type Intention,
  type MeditationType,
  type Plan,
  type PlanBlock,
  type PlanBlockStage,
  type Symbol,
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

export function makeMeditation(id: string, name: string, extra: Partial<Meditation> = {}): Meditation {
  return {
    id,
    workspaceId: "ws1",
    name,
    typeId: "ct1",
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
    // `null` is "follow my type's template", which is what a fixture wants unless a
    // test is about a meditation's own copy of it.
    stages: null,
    sortOrder: 0,
    archivedAt: null,
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
    // The system the app shipped until the owner's round 16, so a fixture reads as
    // the catalogue's own rows do. A test about the flag passes its own value.
    reikiSystem: DEFAULT_REIKI_SYSTEM,
    sortOrder: 0,
    archivedAt: null,
    revision: 0,
    updatedAt: 0,
    ...extra,
  };
}

/**
 * One sentence built on its own, rather than as one of a row's lines.
 *
 * The owner's round 16, §2.1 merged an affirmation into the intention, so this is
 * the same row `makeLines` builds — and `entryId: null` is its default, because the
 * sentence that needs a fixture of its own is the **orphan**: the one the
 * Affirmations table holds until something is associated with it.
 */
export function makeIntention(
  id: string,
  text: string,
  extra: Partial<Intention> = {},
): Intention {
  return {
    id,
    workspaceId: "ws1",
    entryId: null,
    sortOrder: 0,
    text,
    archivedAt: null,
    revision: 0,
    updatedAt: 0,
    ...extra,
  };
}

/**
 * A row of the Entries table: the association, and the lines' home.
 *
 * The fixture numbers them `e1`, `e2`, … in the order the library lists them, so a
 * test can say which pair it means without spelling out a uuid.
 */
export function makeEntry(
  meditationId: string | null,
  symbolId: string | null,
  sortOrder: number,
  extra: Partial<Entry> = {},
): Entry {
  return {
    id: `e-${meditationId ?? "none"}-${symbolId ?? "none"}`,
    workspaceId: "ws1",
    meditationId,
    symbolId,
    sortOrder,
    archivedAt: null,
    revision: 0,
    updatedAt: 0,
    ...extra,
  };
}

/** The lines of one row, numbered from zero in the order they read. */
export function makeLines(entryId: string, texts: string[], workspaceId = "ws1"): Intention[] {
  return texts.map((text, index) => ({
    id: `${entryId}-a${index}`,
    workspaceId,
    entryId,
    sortOrder: index,
    text,
    archivedAt: null,
    revision: 0,
    updatedAt: 0,
  }));
}

/**
 * A table's rows and the lines inside them, built together.
 *
 * A test that says which pairs it means should not also have to thread ids through
 * a second list: the entries are numbered from the list, and every line carries the
 * id of the row it belongs to.
 */
export function makeEntries(
  rows: { meditationId: string | null; symbolId: string | null; texts?: string[] }[],
): { entries: Entry[]; intentions: Intention[] } {
  const entries = rows.map((row, index) => makeEntry(row.meditationId, row.symbolId, index));
  const intentions = entries.flatMap((entry, index) =>
    makeLines(entry.id, rows[index]?.texts ?? []),
  );
  return { entries, intentions };
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
    sortOrder: 0,
    archivedAt: null,
    revision: 0,
    updatedAt: 0,
    ...extra,
  };
}

export function makeFieldOption(extra: Partial<FieldOption> = {}): FieldOption {
  return {
    id: "opt1",
    workspaceId: "ws1",
    fieldDefId: "fd1",
    label: "Earth",
    sortOrder: 0,
    revision: 0,
    updatedAt: 0,
    ...extra,
  };
}

export function makeFieldDef(extra: Partial<FieldDef> = {}): FieldDef {
  return {
    id: "fd1",
    workspaceId: "ws1",
    scope: "symbol",
    typeId: null,
    cellType: "text",
    refKind: null,
    key: "seed",
    label: "Seed",
    description: "",
    sortOrder: 0,
    archivedAt: null,
    revision: 0,
    updatedAt: 0,
    ...extra,
  };
}

/**
 * One meditation type. `ct1` is the Chakra the focus fixtures belong to, so a test
 * that asks "which type is this?" gets an answer that names it.
 *
 * Its template is one intentions stage of a second, so a block materialised from it
 * is a single stage a test can reason about; a test about the seeded three-stage
 * template passes its own `stages`.
 */
export function makeMeditationType(extra: Partial<MeditationType> = {}): MeditationType {
  return {
    id: "ct1",
    workspaceId: "ws1",
    name: "Chakras",
    stages: [stageFixture(1000)],
    sortOrder: 0,
    archivedAt: null,
    revision: 0,
    updatedAt: 0,
    ...extra,
  };
}

/** One stage, for a fixture that needs a specific kind or length. */
export function stageFixture(
  durationMs: number,
  extra: Partial<PlanBlockStage> = {},
): PlanBlockStage {
  return {
    key: "focus",
    label: "Focus",
    kind: "focus",
    durationMs,
    binaural: true,
    autoScroll: false,
    ...extra,
  };
}

/**
 * One plan block: a meditation, with **one** stage of the length the caller names.
 *
 * The engine tests built a block with a single `durationMs` before stages existed,
 * and one stage of that length is the same session — so the fixture keeps its old
 * spelling and the tests keep testing what they were testing. A test about several
 * stages passes `stages` in `extra`, and one about a block whose meditation is gone
 * passes `meditationId: null`.
 *
 * There is no `type` to pass: the owner's round 15 deleted cool-off, so every block
 * is a meditation block and the argument that used to say which is gone with it.
 */
export function makeBlock(
  id: string,
  sortOrder: number,
  extra: Partial<PlanBlock> & { durationMs?: number } = {},
): PlanBlock {
  const { durationMs = 1000, ...rest } = extra;
  return {
    id,
    sortOrder,
    stages: [stageFixture(durationMs)],
    meditationId: "fp1",
    symbolId: null,
    symbolScope: "rotate",
    binauralPresetId: "preset1",
    ambientAssetId: null,
    alarmAssetId: null,
    // Both `null` by default, which is what a block the reader has never opened the
    // editor on says: the plan's answer stands (the owner's round 17).
    alarmEnabled: null,
    display: null,
    ...rest,
  };
}

export function makePrefs(extra: Partial<UserPreferences> = {}): UserPreferences {
  return {
    userId: "u1",
    stopBinauralOnAlarm: true,
    autoAdvance: true,
    alarmEnabled: true,
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
    alarmEnabled: true,
    binauralEnabled: true,
    revision: 0,
    display: { columns: [...DEFAULT_PLAN_DISPLAY.columns] },
    blocks,
    ...extra,
  };
}

/**
 * The six rows the fixture's library holds, and the lines inside them.
 *
 * Built from one list so the entries and their lines cannot drift: `entries` is the
 * rows it names and `intentions` is every line they hold.
 */
function entryFixtures(): { entries: Entry[]; intentions: Intention[] } {
  const rows: { meditationId: string | null; symbolId: string | null; texts: string[] }[] = [
    { meditationId: "fp1", symbolId: "s1", texts: ["I am grounded", "I am safe"] },
    { meditationId: "fp1", symbolId: "s2", texts: ["Body is home"] },
    { meditationId: "fp2", symbolId: "s3", texts: ["I am open"] },
  ];
  const entries = rows.map((row, index) =>
    makeEntry(row.meditationId, row.symbolId, index),
  );
  const intentions = entries.flatMap((entry, index) =>
    makeLines(entry.id, rows[index]!.texts),
  );
  return { entries, intentions };
}

export function makeLibrary(extra: Partial<CompileLibrary> = {}): CompileLibrary {
  const { entries, intentions } = entryFixtures();
  return {
    meditationTypes: [makeMeditationType()],
    meditations: [makeMeditation("fp1", "Root"), makeMeditation("fp2", "Heart")],
    symbols: [makeSymbol("s1", "Lam"), makeSymbol("s2", "Earth"), makeSymbol("s3", "Yam")],
    entries,
    intentions,
    fieldDefs: [],
    fieldOptions: [],
    fieldValues: [],
    presets: [makePreset()],
    ...extra,
  };
}
