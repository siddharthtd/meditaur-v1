import {
  CHAKRA_TYPE_ID,
  DEFAULT_FOCUS_DURATION_MS,
  DEFAULT_REIKI_SYSTEM,
  fail,
  normalizePlanDisplay,
  parsePlanBlocks,
  POINT_TYPE_ID,
  PROTECTION_TYPE_ID,
  SEEDED_MEDITATION_TYPES,
  type BinauralPreset,
  type Entry,
  type FieldDef,
  type FieldOption,
  type FieldScope,
  type FieldValue,
  type Meditation,
  type Intention,
  type MediaAsset,
  type MeditationType,
  type Plan,
  type SessionLog,
  type Symbol,
  type Versioned,
} from "@meditaur/domain";

export const CATALOG_BACKUP_SCHEMA_VERSION = 9;

export const CATALOG_BACKUP_ERRORS = {
  invalid: "That file is not a Meditaur catalog",
  version: "That catalog file is a newer format",
} as const;

function backupFail(key: keyof typeof CATALOG_BACKUP_ERRORS): never {
  fail(`catalogBackup.${key}`, CATALOG_BACKUP_ERRORS[key]);
}

/**
 * A whole catalogue, as one file.
 *
 * 6 is the Database: an association is an `entries` row and a line belongs to one,
 * a column has a type, and the tables that used to hold those relationships are
 * gone. 7 is meditation types, 8 is the rename — a meditation's row is
 * `meditations` and the field that names one is `meditationId` — and 9 is the
 * affirmations an affirmations stage replays. The owner's round 16 merged those
 * sentences into `intentions` as rows with no pair, and **that cost no version**: a
 * v9 file's `affirmations` are read as what they are — sentences about nothing yet
 * — and the shape is already one `intentions` array can hold, so there is nothing a
 * v10 would say that a v9 does not. A file written by any earlier version still
 * restores: a key the new word replaced is read under the old one, and a table a
 * file predates is simply absent, because a backup is the one thing a reader keeps
 * for exactly the moment the app has moved on.
 */
export type CatalogBackup = {
  schemaVersion: typeof CATALOG_BACKUP_SCHEMA_VERSION;
  exportedAt: number;
  workspaceId: string;
  meditations: Meditation[];
  /**
   * The meditation types, since v7. A v6 file has none — every row it holds was a
   * meditation of kind chakra, point or custom — and the four seeded types are
   * rebuilt from their ids when such a file is read.
   */
  meditationTypes: MeditationType[];
  symbols: Symbol[];
  entries: Entry[];
  /**
   * Every sentence, in `sortOrder`. A sentence with no pair is an orphan — the
   * owner's round 16 merged the affirmations into this list rather than giving them
   * a key of their own, so a v9 file's `affirmations` are read into it with
   * `entryId: null` (`parseCatalogBackup`).
   */
  intentions: Intention[];
  fieldDefs: FieldDef[];
  fieldOptions: FieldOption[];
  fieldValues: FieldValue[];
  presets: BinauralPreset[];
  mediaAssets: MediaAsset[];
  blobs: Record<string, { mimeType: string; data: string }>;
  plans: Plan[];
  /**
   * Finished sessions. The app keeps the most recent `SESSION_LOG_LIST_LIMIT`
   * (50) and prunes beyond that, so this is the whole of the history that exists
   * rather than a window onto a longer one.
   */
  logs: SessionLog[];
};

/**
 * A deterministic id for a row that an older file only implies.
 *
 * Version 5 named a pair by a binding row and by the `meditationId` / `symbolId`
 * on each line, so restoring one has to mint the entry the new model needs. The id
 * is derived from the pair rather than randomised on purpose: restoring the same
 * file twice merges by id, and a random id would leave the reader with every row
 * twice the second time they restored it.
 *
 * Four FNV-1a passes with different seeds fill a uuid. It is not a security
 * hash — nothing here needs one — it only has to be stable for one file and
 * different for different pairs.
 */
function stableId(parts: string[]): string {
  const seedText = parts.join("\u0000");
  const words: number[] = [];
  for (const seed of [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b]) {
    let hash = seed >>> 0;
    for (let index = 0; index < seedText.length; index += 1) {
      hash ^= seedText.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    words.push(hash >>> 0);
  }
  const hex = words.map((word) => word.toString(16).padStart(8, "0")).join("");
  // Version and variant nibbles are set so the result is a well-formed uuid.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function requireObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    backupFail("invalid");
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown): string {
  if (typeof value !== "string") {
    backupFail("invalid");
  }
  return value;
}

function requireNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    backupFail("invalid");
  }
  return value;
}

function requireArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    backupFail("invalid");
  }
  return value;
}

/**
 * A backup written before the catalogue rows carried a revision simply has no
 * revision: the column is new and an old export must still restore. Versioning
 * starts at 0, and the write that follows the restore stamps the first one.
 */
function versionOf(row: { revision?: unknown; updatedAt?: unknown }): Versioned {
  return {
    revision: typeof row.revision === "number" ? row.revision : 0,
    updatedAt: typeof row.updatedAt === "number" ? row.updatedAt : 0,
  };
}

function requireIdRows<T extends { id: string }>(value: unknown): T[] {
  return requireArray(value).map((row) => {
    const item = requireObject(row);
    const id = requireString(item.id);
    if (!id) {
      backupFail("invalid");
    }
    return row as T;
  });
}

function typeIdOfLegacyRow(row: { kind?: unknown; name?: unknown }): string {
  const kind = typeof row.kind === "string" ? row.kind : "";
  if (kind === "chakra") return CHAKRA_TYPE_ID;
  // `custom` was only ever the seeded Protection, which is the Protection type
  // now. Anything else a reader had marked custom was a meditation that is not a
  // chakra, and it lands on Point — a restore is not the place to throw a row away.
  if (kind === "custom" && row.name === "Protection") return PROTECTION_TYPE_ID;
  return POINT_TYPE_ID;
}

function normalizeMeditation(row: Meditation, workspaceId: string): Meditation {
  const legacy = row as unknown as { kind?: unknown; typeId?: unknown };
  return {
    ...row,
    workspaceId: row.workspaceId || workspaceId,
    typeId:
      typeof legacy.typeId === "string" && legacy.typeId
        ? legacy.typeId
        : typeIdOfLegacyRow(row),
    defaultDurationMs: row.defaultDurationMs ?? DEFAULT_FOCUS_DURATION_MS,
    description: row.description ?? null,
    governs: row.governs ?? null,
    colour: row.colour ?? null,
    element: row.element ?? null,
    representationAssetId: row.representationAssetId ?? null,
    representationDescription: row.representationDescription ?? null,
    binauralEnabled: row.binauralEnabled !== false,
    // A file written before stages restores a meditation that follows its type's
    // template, which is what `null` means everywhere (`stagesForMeditation`).
    stages: Array.isArray(row.stages) ? row.stages : null,
    // A file written before rows kept an order restores in the order it stored
    // them in: the array is the reader's order, so the index is the sort order.
    sortOrder: row.sortOrder ?? 0,
    archivedAt: row.archivedAt ?? null,
  };
}

function normalizeSymbol(row: Symbol, workspaceId: string): Symbol {
  return {
    id: row.id,
    workspaceId: row.workspaceId || workspaceId,
    name: row.name,
    description: row.description,
    usage: row.usage,
    imageAssetId: row.imageAssetId ?? null,
    // A file written before the field restores as what its rows are: until the
    // owner's round 16 the app shipped one system, so `karuna_reiki` is not a
    // default of convenience but the answer a version-9 file cannot give because it
    // had no field to give it in. A file that *does* name a system — this version's
    // own export, once a reader has set one — keeps it, spelling included, which is
    // why the value is taken as it stands rather than re-derived.
    reikiSystem: row.reikiSystem ?? DEFAULT_REIKI_SYSTEM,
    sortOrder: row.sortOrder ?? 0,
    archivedAt: row.archivedAt ?? null,
    ...versionOf(row),
  };
}

/**
 * A line as a file written before the Database describes it: about a chakra, a
 * symbol, or the pair — and not about a row, because there was no row to be about.
 * `entriesFromLegacy` is what turns a list of these into rows.
 */
type LegacyLine = {
  id: string;
  workspaceId: string;
  meditationId: string | null;
  symbolId: string | null;
  sortOrder: number;
  text: string;
  version: Versioned;
};

function pairKey(meditationId: string | null, symbolId: string | null): string {
  return `${meditationId ?? ""}:${symbolId ?? ""}`;
}

function optionalString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function legacyLine(
  row: Record<string, unknown>,
  workspaceId: string,
  focusWs: Map<string, string>,
  parentOfSymbol: Map<string, string>,
): LegacyLine {
  const symbolId = (row.symbolId as string | null | undefined) ?? null;
  const meditationId =
    ((row.meditationId as string | null | undefined) || null) ??
    ((row.focusPointId as string | null | undefined) || null) ??
    (symbolId ? (parentOfSymbol.get(symbolId) ?? null) : null);
  return {
    id: requireString(row.id),
    workspaceId:
      optionalString(row.workspaceId) ||
      (meditationId ? (focusWs.get(meditationId) ?? "") : "") ||
      workspaceId,
    meditationId,
    symbolId,
    sortOrder: requireNumber(row.sortOrder),
    text: requireString(row.text),
    version: versionOf(row as { revision?: unknown; updatedAt?: unknown }),
  };
}

type LegacyBinding = { meditationId: string; symbolId: string; sortOrder: number };

/**
 * The rows an older file implies, and its lines repointed at them.
 *
 * A row is derived for every pair the file names — one per binding, then one per
 * distinct pair a line was written about. A line that pointed at no pair is the
 * **orphan** the merged model holds (the owner's round 16, §2.1): it keeps its own
 * row in `intentions` with `entryId: null`, and no entry is derived for it, because
 * a pair of two nulls is what the reader not having chosen one means.
 */
function entriesFromLegacy(input: {
  lines: LegacyLine[];
  bindings: LegacyBinding[];
  workspaceId: string;
  focusWs: Map<string, string>;
  symbolWs: Map<string, string>;
}): { entries: Entry[]; lines: Intention[] } {
  const entries = new Map<string, Entry>();
  const ensure = (
    meditationId: string | null,
    symbolId: string | null,
    sortOrder: number,
  ): Entry => {
    const key = pairKey(meditationId, symbolId);
    const existing = entries.get(key);
    if (existing) return existing;
    const entry: Entry = {
      id: stableId([key]),
      workspaceId:
        (meditationId ? input.focusWs.get(meditationId) : undefined) ??
        (symbolId ? input.symbolWs.get(symbolId) : undefined) ??
        input.workspaceId,
      meditationId,
      symbolId,
      sortOrder,
      archivedAt: null,
      revision: 0,
      updatedAt: 0,
    };
    entries.set(key, entry);
    return entry;
  };

  for (const binding of input.bindings) {
    ensure(binding.meditationId, binding.symbolId, binding.sortOrder);
  }
  const lines: Intention[] = [];
  for (const line of input.lines) {
    // A sentence an old file wrote about *nothing* is kept, as an orphan: the
    // merged model can hold it (the owner's round 16, §2.1), and dropping a
    // reader's sentence because it named no pair is a loss the app no longer has
    // any reason to make. It reads in the Affirmations table until something is
    // associated with it.
    const entry = line.meditationId || line.symbolId
      ? ensure(line.meditationId, line.symbolId, line.sortOrder)
      : null;
    lines.push({
      id: line.id,
      workspaceId: line.workspaceId || entry?.workspaceId || input.workspaceId,
      entryId: entry?.id ?? null,
      sortOrder: line.sortOrder,
      text: line.text,
      archivedAt: null,
      ...line.version,
    });
  }
  return { entries: [...entries.values()], lines };
}

function parseEntries(value: unknown, workspaceId: string): Entry[] {
  return requireIdRows<Entry & { focusPointId?: unknown }>(value).map((row) => ({
    ...row,
    workspaceId: row.workspaceId || workspaceId,
    meditationId: row.meditationId ?? (row.focusPointId as string | null) ?? null,
    symbolId: row.symbolId ?? null,
    sortOrder: row.sortOrder ?? 0,
    archivedAt: row.archivedAt ?? null,
    ...versionOf(row),
  }));
}

function parseIntentions(value: unknown, workspaceId: string): Intention[] {
  return requireIdRows<Intention>(value).map((row) => ({
    ...row,
    workspaceId: row.workspaceId || workspaceId,
    // An orphan is a sentence about nothing yet, which is what the Affirmations
    // table holds until the reader associates it.
    entryId: typeof row.entryId === "string" && row.entryId.length > 0 ? row.entryId : null,
    sortOrder: row.sortOrder ?? 0,
    text: row.text,
    archivedAt: row.archivedAt ?? null,
    ...versionOf(row),
  }));
}

function parseFieldValues(value: unknown): FieldValue[] {
  return requireArray(value).map((row) => {
    const item = requireObject(row);
    const entityId =
      typeof item.entityId === "string"
        ? item.entityId
        : typeof item.symbolId === "string"
          ? item.symbolId
          : backupFail("invalid");
    return {
      entityId: requireString(entityId),
      fieldDefId: requireString(item.fieldDefId),
      text: requireString(item.text),
      ...versionOf(item),
    };
  });
}

function parseFieldDefs(value: unknown, workspaceId: string): FieldDef[] {
  return requireIdRows<FieldDef & { entityType?: unknown }>(value).map((row) => ({
    ...row,
    workspaceId: row.workspaceId || workspaceId,
    // A backup written before the column had a type says `entityType`, and one
    // written before there was a third table only knew the two. Both read as a
    // scope, and a column that never held anything is plain text.
    scope: scopeOf(row.scope, row.entityType),
    cellType: row.cellType ?? "text",
    refKind: refKindOf(row.refKind),
    archivedAt: row.archivedAt ?? null,
    description: row.description ?? "",
    sortOrder: row.sortOrder ?? 0,
    ...versionOf(row),
  }));
}

/**
 * A stored scope, under either word for the middle member.
 *
 * `focusPoint` was that member's name until v8, and the rows a v7 file carries on
 * from a v6 one still say it — the rename is a word, not a meaning, so a column set
 * that was about a meditation stays about one instead of failing the whole file.
 */
function scopeOf(scope: unknown, entityType: unknown): FieldScope {
  if (scope === "meditation" || scope === "focusPoint") return "meditation";
  if (scope === "entry" || scope === "symbol") return scope;
  return scopeFromEntityType(entityType);
}

function refKindOf(refKind: unknown): FieldDef["refKind"] {
  if (refKind === "meditation" || refKind === "focusPoint") return "meditation";
  if (refKind === "symbol" || refKind === "preset") return refKind;
  return null;
}

function scopeFromEntityType(value: unknown): FieldScope {
  return value === "meditation" || value === "focusPoint" ? "meditation" : "symbol";
}

function parseFieldOptions(value: unknown, workspaceId: string): FieldOption[] {
  if (value === undefined) return [];
  return requireIdRows<FieldOption>(value).map((row) => ({
    ...row,
    workspaceId: row.workspaceId || workspaceId,
    fieldDefId: requireString(row.fieldDefId),
    label: requireString(row.label),
    sortOrder: row.sortOrder ?? 0,
    ...versionOf(row),
  }));
}

function parsePlans(value: unknown): Plan[] {
  return requireIdRows<Plan>(value).map((plan) => {
    if (!Array.isArray(plan.blocks)) {
      backupFail("invalid");
    }
    return {
      ...plan,
      binauralEnabled: plan.binauralEnabled !== false,
      // A file written before the plan carried a display gets the app's default,
      // exactly as a plan stored by the older build does.
      display: normalizePlanDisplay(plan.display),
      blocks: parsePlanBlocks(plan.blocks),
    };
  });
}

function parseBindings(value: unknown): LegacyBinding[] {
  if (value === undefined) return [];
  return requireArray(value).map((row) => {
    const item = requireObject(row);
    return {
      meditationId: requireString(item.meditationId ?? item.focusPointId),
      symbolId: requireString(item.symbolId),
      sortOrder: requireNumber(item.sortOrder),
    };
  });
}

function parseBlobs(value: unknown): CatalogBackup["blobs"] {
  if (value === undefined) {
    return {};
  }
  const raw = requireObject(value);
  const blobs: CatalogBackup["blobs"] = {};
  for (const [id, row] of Object.entries(raw)) {
    if (!id) {
      backupFail("invalid");
    }
    const item = requireObject(row);
    blobs[id] = {
      mimeType: requireString(item.mimeType),
      data: requireString(item.data),
    };
  }
  return blobs;
}

/**
 * A version-1 file: symbols carried their chakra and their order, and the
 * affirmations were written about a symbol. Both are read into the shape the
 * version-2 files use — a binding per symbol and a line per affirmation — so that
 * everything after this point has one legacy shape to interpret, not two.
 */
function migrateV1(
  raw: Record<string, unknown>,
  workspaceId: string,
): { symbols: Symbol[]; bindings: LegacyBinding[]; lines: LegacyLine[] } {
  const parent = new Map<string, string>();
  const bindings: LegacyBinding[] = [];
  const symbols = requireIdRows<Symbol & { meditationId?: string; focusPointId?: string; sortOrder?: number }>(
    raw.symbols,
  ).map((row) => {
    // A v1 file's symbol named its chakra under the old word.
    const meditationId = row.meditationId ?? row.focusPointId;
    if (meditationId) {
      parent.set(row.id, meditationId);
      bindings.push({
        meditationId,
        symbolId: row.id,
        sortOrder: row.sortOrder ?? 0,
      });
    }
    return normalizeSymbol(row, workspaceId);
  });
  const lines = requireArray(raw.affirmations).map((row) =>
    legacyLine(requireObject(row), workspaceId, new Map(), parent),
  );
  return { symbols, bindings, lines };
}

/** A version-2 to version-5 file: a bindings table and pair-scoped lines. */
function legacyFromRows(
  raw: Record<string, unknown>,
  workspaceId: string,
): { symbols: Symbol[]; bindings: LegacyBinding[]; lines: LegacyLine[] } {
  const symbols = requireIdRows<Symbol>(raw.symbols).map((row) =>
    normalizeSymbol(row, workspaceId),
  );
  const bindings = parseBindings(raw.bindings);
  const source = raw.intentions ?? raw.affirmations;
  const lines = requireArray(source).map((row) =>
    legacyLine(requireObject(row), workspaceId, new Map(), new Map()),
  );
  return { symbols, bindings, lines };
}

export function encodeCatalogBlob(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < view.length; i += chunk) {
    binary += String.fromCharCode(...view.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function decodeCatalogBlob(data: string): ArrayBuffer {
  try {
    const binary = atob(data);
    const view = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      view[i] = binary.charCodeAt(i);
    }
    return view.buffer;
  } catch {
    backupFail("invalid");
  }
}

/**
 * Session history, which a file written before v5 does not carry.
 *
 * The same shape as the missing-`blobs` case: no key means none, not a broken
 * file. A log names the plan it came from and that plan travels in the same
 * file, so a full round trip brings the pair back together.
 */
function parseLogs(value: unknown, workspaceId: string): SessionLog[] {
  if (value === undefined) return [];
  return requireArray(value).map((row) => {
    const item = requireObject(row);
    return {
      id: requireString(item.id),
      workspaceId: requireString(item.workspaceId) || workspaceId,
      planId: requireString(item.planId),
      completedAt: requireNumber(item.completedAt),
      blockCount: requireNumber(item.blockCount),
      totalDurationMs: requireNumber(item.totalDurationMs),
    };
  });
}

export function parseCatalogBackup(value: unknown): CatalogBackup {
  const raw = requireObject(value);
  const schemaVersion = raw.schemaVersion;
  if (typeof schemaVersion !== "number") {
    backupFail("invalid");
  }
  if (schemaVersion > CATALOG_BACKUP_SCHEMA_VERSION) {
    backupFail("version");
  }
  if (schemaVersion < 1 || schemaVersion > CATALOG_BACKUP_SCHEMA_VERSION) {
    backupFail("invalid");
  }
  const workspaceId = requireString(raw.workspaceId);
  // A file written before the rename keys its rows `focusPoints`. Reading the old
  // key here is the whole of what v8 asks of v7 — the rows themselves are the
  // shape they always were.
  const meditations = requireIdRows<Meditation>(raw.meditations ?? raw.focusPoints).map(
    (row) => normalizeMeditation(row, workspaceId),
  );
  const focusWs = new Map(meditations.map((row) => [row.id, row.workspaceId]));
  /**
   * The types this file carries, or the four seeded ones when it predates them.
   *
   * A v6 file's rows still name a type — the migration reads their old `kind` into
   * the seeded ids — so rebuilding the seeded rows is what makes such a file
   * restore whole rather than leaving every meditation pointing at a row that is
   * not there.
   */
  const meditationTypes = Array.isArray(raw.meditationTypes)
    ? requireIdRows<MeditationType>(raw.meditationTypes).map((row, index) => ({
        ...row,
        workspaceId: row.workspaceId || workspaceId,
        name: row.name ?? "Untitled type",
        // A type written before stages keeps an empty template rather than being
        // handed the chakra's three: the reader's own type is not a chakra, and an
        // empty template is a block that runs nothing, which the Database's `Stages`
        // section is where the reader fills in.
        stages: Array.isArray(row.stages) ? row.stages : [],
        sortOrder: row.sortOrder ?? index,
        archivedAt: row.archivedAt ?? null,
        ...versionOf(row),
      }))
    : SEEDED_MEDITATION_TYPES.map((row, sortOrder) => ({
        ...row,
        workspaceId,
        sortOrder,
        archivedAt: null,
        revision: 0,
        updatedAt: 0,
      }));
  const legacy = schemaVersion === 1
    ? migrateV1(raw, workspaceId)
    : legacyFromRows(raw, workspaceId);
  const symbolWs = new Map(legacy.symbols.map((row) => [row.id, row.workspaceId]));
  // A file written by this version already has rows, and its lines already name
  // them. Anything older has to have both derived — that is the whole of the
  // upgrade, and it is derived rather than randomised so restoring the same file
  // twice merges by id instead of doubling the catalogue.
  const related = Array.isArray(raw.entries)
    ? {
        entries: parseEntries(raw.entries, workspaceId),
        lines: parseIntentions(raw.intentions, workspaceId),
      }
    : entriesFromLegacy({
        lines: legacy.lines,
        bindings: legacy.bindings,
        workspaceId,
        focusWs,
        symbolWs,
      });
  return {
    schemaVersion: CATALOG_BACKUP_SCHEMA_VERSION,
    exportedAt: requireNumber(raw.exportedAt),
    workspaceId,
    meditations,
    meditationTypes,
    symbols: legacy.symbols,
    // A v9 file's sentences are this version's **orphans**: written about nothing
    // yet, which is exactly what a row with no pair is. `affirmations` is also a
    // name this file has used twice before — up to v5 it keyed the reader's
    // **lines**, which `legacyFromRows` read above, so the key counts as sentences
    // only from v9 on and an older file's rows are not read twice.
    //
    // Absent from a file the reader had none in, and an empty list is the honest
    // reading either way: a restore adds rows and never deletes the ones the device
    // already holds, so "none in this file" cannot mean "none at all".
    intentions: [
      ...related.lines,
      ...(schemaVersion >= 9 && Array.isArray(raw.affirmations)
        ? requireIdRows<Intention>(raw.affirmations).map((row, index) => ({
            ...row,
            workspaceId: row.workspaceId || workspaceId,
            entryId: null,
            text: row.text ?? "",
            sortOrder: row.sortOrder ?? index,
            archivedAt: row.archivedAt ?? null,
            ...versionOf(row),
          }))
        : []),
    ],
    entries: related.entries,
    fieldDefs: parseFieldDefs(raw.fieldDefs, workspaceId),
    fieldOptions: parseFieldOptions(raw.fieldOptions, workspaceId),
    fieldValues: parseFieldValues(raw.fieldValues),
    presets: requireIdRows<BinauralPreset>(raw.presets).map((row) => ({
      ...row,
      sortOrder: row.sortOrder ?? 0,
      archivedAt: row.archivedAt ?? null,
      ...versionOf(row),
    })),
    mediaAssets: requireIdRows<MediaAsset>(raw.mediaAssets).map((row, index) => ({
      ...row,
      // An old file's rows carry no order at all, and the file's own array is the
      // order the export walked — so that is the order they come back in, rather
      // than every row landing on 0 and being re-sorted by id.
      sortOrder: row.sortOrder ?? index,
      ...versionOf(row),
    })),
    blobs: parseBlobs(raw.blobs),
    plans: parsePlans(raw.plans),
    logs: parseLogs(raw.logs, workspaceId),
  };
}

export function bindCatalogToWorkspace(
  backup: CatalogBackup,
  workspaceId: string,
): CatalogBackup {
  return {
    ...backup,
    workspaceId,
    meditationTypes: backup.meditationTypes.map((row) => ({ ...row, workspaceId })),
    meditations: backup.meditations.map((row) => ({ ...row, workspaceId })),
    symbols: backup.symbols.map((row) => ({ ...row, workspaceId })),
    entries: backup.entries.map((row) => ({ ...row, workspaceId })),
    intentions: backup.intentions.map((row) => ({ ...row, workspaceId })),
    fieldDefs: backup.fieldDefs.map((row) => ({ ...row, workspaceId })),
    fieldOptions: backup.fieldOptions.map((row) => ({ ...row, workspaceId })),
    presets: backup.presets.map((row) => ({ ...row, workspaceId })),
    mediaAssets: backup.mediaAssets.map((row) => ({ ...row, workspaceId })),
    blobs: backup.blobs,
    plans: backup.plans.map((row) => ({ ...row, workspaceId })),
    logs: backup.logs.map((row) => ({ ...row, workspaceId })),
  };
}
