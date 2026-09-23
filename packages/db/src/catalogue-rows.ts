import type { Entry, Intention, ReikiSystem, Symbol } from "@meditaur/domain";
import { timeFromRow, timeToRow } from "./row-time.ts";

/**
 * The three catalogue rows that are a name and a reference: `symbols`, `entries`
 * and `intentions`.
 *
 * They share a module because they share a shape — no nested JSON, no array, and
 * every optional field either absent or a plain column — which is the whole of what
 * a mapper pair has to say about them. The meditations pair, which does hold
 * `jsonb`, lives in `meditation-row.ts`; the ones still to come are `plans` with
 * `plan_blocks`, the presets, the media assets, the types, and the three field
 * tables (`P2 · 3`, slice 2).
 */
export function symbolRow(symbol: Symbol): Record<string, unknown> {
  return {
    id: symbol.id,
    workspace_id: symbol.workspaceId,
    name: symbol.name,
    description: symbol.description,
    usage: symbol.usage,
    image_asset_id: symbol.imageAssetId,
    // Absent is a real state and its own column value: a reader's own symbol
    // belongs to no system, and `null` is how that travels. Substituting a default
    // here would quietly place it in one.
    reiki_system: symbol.reikiSystem ?? null,
    sort_order: symbol.sortOrder,
    archived_at: timeToRow(symbol.archivedAt),
    deleted_at: timeToRow(symbol.deletedAt ?? null),
    revision: symbol.revision,
    updated_at: new Date(symbol.updatedAt).toISOString(),
  };
}

export function symbolFromRow(row: Record<string, unknown>): Symbol {
  const system = row.reiki_system;
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: row.name as string,
    description: (row.description as string | null | undefined) ?? "",
    usage: (row.usage as string | null | undefined) ?? "",
    imageAssetId: (row.image_asset_id as string | null | undefined) ?? null,
    // A null column is the absent field, not a value: `normalizeSymbol` is what
    // decides what an unplaced symbol means, and it can only do that if this stays
    // undefined rather than becoming some default here.
    ...(system == null ? {} : { reikiSystem: system as ReikiSystem }),
    sortOrder: (row.sort_order as number | undefined) ?? 0,
    archivedAt: timeFromRow(row.archived_at),
    deletedAt: timeFromRow(row.deleted_at),
    revision: (row.revision as number | undefined) ?? 0,
    updatedAt: timeFromRow(row.updated_at) ?? 0,
  };
}

export function entryRow(entry: Entry): Record<string, unknown> {
  return {
    id: entry.id,
    workspace_id: entry.workspaceId,
    meditation_id: entry.meditationId,
    symbol_id: entry.symbolId,
    sort_order: entry.sortOrder,
    archived_at: timeToRow(entry.archivedAt),
    deleted_at: timeToRow(entry.deletedAt ?? null),
    revision: entry.revision,
    updated_at: new Date(entry.updatedAt).toISOString(),
  };
}

export function entryFromRow(row: Record<string, unknown>): Entry {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    // Half a reference is a real row — a chakra alone or a symbol alone — so both
    // sides default to `null` rather than to each other.
    meditationId: (row.meditation_id as string | null | undefined) ?? null,
    symbolId: (row.symbol_id as string | null | undefined) ?? null,
    sortOrder: (row.sort_order as number | undefined) ?? 0,
    archivedAt: timeFromRow(row.archived_at),
    deletedAt: timeFromRow(row.deleted_at),
    revision: (row.revision as number | undefined) ?? 0,
    updatedAt: timeFromRow(row.updated_at) ?? 0,
  };
}

export function intentionRow(intention: Intention): Record<string, unknown> {
  return {
    id: intention.id,
    workspace_id: intention.workspaceId,
    entry_id: intention.entryId,
    sort_order: intention.sortOrder,
    text: intention.text,
    archived_at: timeToRow(intention.archivedAt),
    deleted_at: timeToRow(intention.deletedAt ?? null),
    revision: intention.revision,
    updated_at: new Date(intention.updatedAt).toISOString(),
  };
}

export function intentionFromRow(row: Record<string, unknown>): Intention {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    // `null` is the orphan — a sentence written about nothing yet — which is a
    // state the Affirmations tab draws, not a hole to fill in (`Intention`).
    entryId: (row.entry_id as string | null | undefined) ?? null,
    sortOrder: (row.sort_order as number | undefined) ?? 0,
    text: (row.text as string | null | undefined) ?? "",
    archivedAt: timeFromRow(row.archived_at),
    deletedAt: timeFromRow(row.deleted_at),
    revision: (row.revision as number | undefined) ?? 0,
    updatedAt: timeFromRow(row.updated_at) ?? 0,
  };
}
