import {
  DEFAULT_FOCUS_DURATION_MS,
  fail,
  parsePlanBlocks,
  type BinauralPreset,
  type FieldDef,
  type FieldValue,
  type FocusPoint,
  type FocusSymbolBinding,
  type Intention,
  type MediaAsset,
  type Plan,
  type Symbol,
  type TableView,
  type Versioned,
} from "@meditaur/domain";

export const CATALOG_BACKUP_SCHEMA_VERSION = 4;

export const CATALOG_BACKUP_ERRORS = {
  invalid: "That file is not a Meditaur catalog",
  version: "That catalog file is a newer format",
} as const;

function backupFail(key: keyof typeof CATALOG_BACKUP_ERRORS): never {
  fail(`catalogBackup.${key}`, CATALOG_BACKUP_ERRORS[key]);
}

export type CatalogBackup = {
  schemaVersion: typeof CATALOG_BACKUP_SCHEMA_VERSION;
  exportedAt: number;
  workspaceId: string;
  focusPoints: FocusPoint[];
  symbols: Symbol[];
  bindings: FocusSymbolBinding[];
  intentions: Intention[];
  fieldDefs: FieldDef[];
  fieldValues: FieldValue[];
  tableViews: TableView[];
  presets: BinauralPreset[];
  mediaAssets: MediaAsset[];
  blobs: Record<string, { mimeType: string; data: string }>;
  plans: Plan[];
};

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

function normalizeFocusPoint(row: FocusPoint, workspaceId: string): FocusPoint {
  return {
    ...row,
    workspaceId: row.workspaceId || workspaceId,
    kind: (row as { kind: string }).kind === "body" ? "point" : row.kind,
    defaultDurationMs: row.defaultDurationMs ?? DEFAULT_FOCUS_DURATION_MS,
    description: row.description ?? null,
    governs: row.governs ?? null,
    colour: row.colour ?? null,
    element: row.element ?? null,
    representationAssetId: row.representationAssetId ?? null,
    representationDescription: row.representationDescription ?? null,
    binauralEnabled: row.binauralEnabled !== false,
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
    ...versionOf(row),
  };
}

function normalizeIntention(
  row: Intention & { workspaceId?: string },
  workspaceId: string,
  focusWs: Map<string, string>,
): Intention {
  const focusPointId = row.focusPointId || null;
  return {
    id: row.id,
    workspaceId:
      row.workspaceId ||
      (focusPointId ? focusWs.get(focusPointId) : undefined) ||
      workspaceId,
    focusPointId,
    symbolId: row.symbolId ?? null,
    sortOrder: row.sortOrder,
    text: row.text,
    ...versionOf(row),
  };
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
  return requireIdRows<FieldDef>(value).map((row) => ({
    ...row,
    workspaceId: row.workspaceId || workspaceId,
    entityType: row.entityType === "focusPoint" ? "focusPoint" : "symbol",
    // A backup written before the field carried a description simply has none:
    // the column is new, and an old export must still restore.
    description: row.description ?? "",
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
      blocks: parsePlanBlocks(plan.blocks),
    };
  });
}

function parseBindings(value: unknown): FocusSymbolBinding[] {
  return requireArray(value).map((row) => {
    const item = requireObject(row);
    return {
      focusPointId: requireString(item.focusPointId),
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

function migrateV1(raw: Record<string, unknown>, workspaceId: string): {
  focusPoints: FocusPoint[];
  symbols: Symbol[];
  bindings: FocusSymbolBinding[];
  intentions: Intention[];
} {
  const focusPoints = requireIdRows<FocusPoint>(raw.focusPoints).map((row) =>
    normalizeFocusPoint(row, workspaceId),
  );
  const focusWs = new Map(focusPoints.map((row) => [row.id, row.workspaceId]));
  const bindings: FocusSymbolBinding[] = [];
  const parent = new Map<string, string>();
  const symbols = requireIdRows<Symbol & { focusPointId?: string; sortOrder?: number }>(
    raw.symbols,
  ).map((row) => {
    if (row.focusPointId) {
      parent.set(row.id, row.focusPointId);
      bindings.push({
        focusPointId: row.focusPointId,
        symbolId: row.id,
        sortOrder: row.sortOrder ?? 0,
      });
    }
    return normalizeSymbol(row, workspaceId);
  });
  const intentions = requireIdRows<Intention & { symbolId?: string | null }>(
    raw.affirmations,
  ).map((row) =>
    normalizeIntention(
      {
        id: row.id,
        workspaceId,
        focusPointId: row.focusPointId || (row.symbolId ? (parent.get(row.symbolId) ?? null) : null),
        symbolId: row.symbolId ?? null,
        sortOrder: row.sortOrder,
        text: row.text,
        ...versionOf(row),
      },
      workspaceId,
      focusWs,
    ),
  );
  return { focusPoints, symbols, bindings, intentions };
}

function migrateLegacyIntentions(
  raw: Record<string, unknown>,
  workspaceId: string,
  focusWs: Map<string, string>,
): Intention[] {
  const source = raw.intentions ?? raw.affirmations;
  return requireIdRows<Intention>(source).map((row) =>
    normalizeIntention(row, workspaceId, focusWs),
  );
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
  const migrated =
    schemaVersion === 1
      ? migrateV1(raw, workspaceId)
      : (() => {
          const focusPoints = requireIdRows<FocusPoint>(raw.focusPoints).map((row) =>
            normalizeFocusPoint(row, workspaceId),
          );
          const focusWs = new Map(focusPoints.map((row) => [row.id, row.workspaceId]));
          return {
            focusPoints,
            symbols: requireIdRows<Symbol>(raw.symbols).map((row) =>
              normalizeSymbol(row, workspaceId),
            ),
            bindings: parseBindings(raw.bindings ?? []),
            intentions: migrateLegacyIntentions(raw, workspaceId, focusWs),
          };
        })();
  const tableViews = requireIdRows<TableView>(raw.tableViews).map((row) => ({
    ...row,
    ...versionOf(row),
    columnKeys: (row.columnKeys ?? []).map((key) =>
      key === "affirmations" ? "intentions" : key,
    ),
  }));
  return {
    schemaVersion: CATALOG_BACKUP_SCHEMA_VERSION,
    exportedAt: requireNumber(raw.exportedAt),
    workspaceId,
    focusPoints: migrated.focusPoints,
    symbols: migrated.symbols,
    bindings: migrated.bindings,
    intentions: migrated.intentions,
    fieldDefs: parseFieldDefs(raw.fieldDefs, workspaceId),
    fieldValues: parseFieldValues(raw.fieldValues),
    tableViews,
    presets: requireIdRows<BinauralPreset>(raw.presets).map((row) => ({
      ...row,
      ...versionOf(row),
    })),
    mediaAssets: requireIdRows<MediaAsset>(raw.mediaAssets).map((row) => ({
      ...row,
      ...versionOf(row),
    })),
    blobs: parseBlobs(raw.blobs),
    plans: parsePlans(raw.plans),
  };
}

export function bindCatalogToWorkspace(
  backup: CatalogBackup,
  workspaceId: string,
): CatalogBackup {
  return {
    ...backup,
    workspaceId,
    focusPoints: backup.focusPoints.map((row) => ({ ...row, workspaceId })),
    symbols: backup.symbols.map((row) => ({ ...row, workspaceId })),
    intentions: backup.intentions.map((row) => ({ ...row, workspaceId })),
    fieldDefs: backup.fieldDefs.map((row) => ({ ...row, workspaceId })),
    tableViews: backup.tableViews.map((row) => ({ ...row, workspaceId })),
    presets: backup.presets.map((row) => ({ ...row, workspaceId })),
    mediaAssets: backup.mediaAssets.map((row) => ({ ...row, workspaceId })),
    blobs: backup.blobs,
    plans: backup.plans.map((row) => ({ ...row, workspaceId })),
  };
}
