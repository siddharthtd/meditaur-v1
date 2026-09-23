import type { MeditationType } from "@meditaur/domain";
import {
  databaseTables,
  meditationTableTypeId,
  type DatabaseTable,
  type MeditationTable,
} from "./database-tables";
import type { DatabaseRequest } from "./DatabaseTab";

/**
 * The Database's own address.
 *
 * It used to be a tab of the library, which meant the screen could be handed a
 * request as a prop. A route cannot: the address is the only thing that survives
 * the navigation, so the request travels in the query string. That has a second
 * benefit the prop never had — `Add symbol` is a link a reader can reload, and
 * land back in the same row.
 */
export const DATABASE_HREF = "/database";

/** The tables a request can put a row in: the shared one and every type's. */
export type GridTable = "symbols" | MeditationTable;

export function databaseHref(request: DatabaseRequest): string {
  const params = new URLSearchParams({ mode: request.kind, table: request.table });
  if (request.kind !== "add" && request.kind !== "new-record") params.set("id", request.id);
  return `${DATABASE_HREF}?${params.toString()}`;
}

/**
 * Whether a query value names a table the reader can actually put a row in.
 *
 * The type tables are the store's rows, so this asks the rows rather than a list
 * in this file: a request that named an archived type would otherwise land on the
 * first table and add a row of the wrong kind, which is worse than doing nothing.
 */
function isGridTable(table: string | null, types: MeditationType[]): table is GridTable {
  if (table === "symbols") return true;
  if (!table || meditationTableTypeId(table as DatabaseTable) == null) return false;
  return databaseTables(types).some((row) => row.id === table);
}

/**
 * The request in the address bar, read once on the way in.
 *
 * Anything it does not recognise is not a request: a plain `/database` is the
 * grid, opening on whichever table the reader had last, which the grid itself
 * remembers in `sessionStorage`. The types are needed because a type's table is a
 * row, not a literal — see `isGridTable`.
 */
export function readDatabaseRequest(search: string, types: MeditationType[]): DatabaseRequest | null {
  const params = new URLSearchParams(search);
  const mode = params.get("mode");
  const table = params.get("table");
  const id = params.get("id");

  if (mode === "add" && isGridTable(table, types)) {
    return { kind: "add", table };
  }
  if (mode === "edit" && isGridTable(table, types) && id) {
    return { kind: "edit", table, id };
  }
  if (mode === "record" && table === "presets" && id) {
    return { kind: "record", table, id };
  }
  if (mode === "new-record" && table === "presets") {
    return { kind: "new-record", table };
  }
  return null;
}
