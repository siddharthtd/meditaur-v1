import type { SupabaseDataLike } from "../../packages/db/src/supabase.ts";

/**
 * An in-memory `SupabaseDataLike`, for adapter tests that must not reach a network.
 *
 * It is a **fake** rather than a mock: it stores rows and answers questions about
 * them, because what the catalogue adapter has to get right is what it writes and in
 * which shape — a mock that only counted calls would let a mapper that spoke the
 * domain's column names pass every test.
 *
 * Three of its behaviours are deliberately the real table's rather than convenient:
 *
 * - An `upsert` merges on the table's identity columns, which is what PostgREST's
 *   `on conflict` does with the columns it was given. `field_values` is the one table
 *   whose identity is a pair, so the fake carries that fact the way the server does.
 * - An `insert` that would duplicate that identity **throws**, because the table has a
 *   primary key and the real client returns an error (`createSupabaseEventsPort` is
 *   the one caller, and its doc says a collision is visible rather than retried).
 * - `selectRange` orders by the column it filters on and stops at `limit`, which is
 *   the shape a pull reads: newest-last, bounded, from a watermark.
 */
export function fakeSupabaseData(
  initial: Record<string, Record<string, unknown>[]> = {},
): {
  client: SupabaseDataLike;
  /** The rows a table holds, for assertions and for seeding between steps. */
  rows(table: string): Record<string, unknown>[];
  /** Every request, in order, so a test can prove a delete touched nothing. */
  calls: string[];
} {
  const tables = new Map<string, Record<string, unknown>[]>();
  for (const [table, rows] of Object.entries(initial)) {
    tables.set(table, rows.map((row) => ({ ...row })));
  }
  const calls: string[] = [];

  /** The table's identity columns: what a row *is* when an upsert has to merge. */
  function identity(table: string): string[] {
    return table === "field_values" ? ["entity_id", "field_def_id"] : ["id"];
  }

  function tableRows(table: string): Record<string, unknown>[] {
    let rows = tables.get(table);
    if (!rows) {
      rows = [];
      tables.set(table, rows);
    }
    return rows;
  }

  const sameKey = (left: Record<string, unknown>, right: Record<string, unknown>, keys: string[]) =>
    keys.every((key) => left[key] === right[key]);

  function matching(
    table: string,
    where: (row: Record<string, unknown>) => boolean,
  ): Record<string, unknown>[] {
    return tableRows(table).filter(where);
  }

  return {
    calls,
    rows: (table) => tableRows(table).map((row) => ({ ...row })),
    client: {
      async select(table, column, value, columns) {
        calls.push(`select ${table} ${columns} where ${column}=${String(value)}`);
        return matching(table, (row) => row[column] === value).map((row) => ({ ...row }));
      },
      async selectRange(table, column, value, columns, limit) {
        calls.push(`selectRange ${table} ${columns} where ${column}>${String(value)}`);
        return matching(table, (row) => (row[column] as never) > (value as never))
          .sort((left, right) => (left[column] as number) - (right[column] as number))
          .slice(0, limit)
          .map((row) => ({ ...row }));
      },
      async selectIn(table, column, values, columns) {
        calls.push(`selectIn ${table} ${columns} where ${column} in ${values.length}`);
        if (values.length === 0) return [];
        return matching(table, (row) => values.includes(row[column] as string)).map((row) => ({
          ...row,
        }));
      },
      async updateWhere(table, values, where) {
        calls.push(`updateWhere ${table} ${Object.keys(where).join("+")}`);
        const hit = matching(table, (row) =>
          Object.entries(where).every(([column, value]) => row[column] === value),
        );
        for (const row of hit) Object.assign(row, values);
        return hit.map((row) => ({ ...row }));
      },
      async insert(table, values) {
        calls.push(`insert ${table}`);
        const keys = identity(table);
        if (matching(table, (row) => sameKey(row, values, keys)).length > 0) {
          // The real client returns an error here, and this port's `fail` is what the
          // other fakes in the suite lean on: a duplicate is not a merge.
          throw new Error(`duplicate key in ${table}: ${keys.map((k) => String(values[k])).join(",")}`);
        }
        tableRows(table).push({ ...values });
        return [{ ...values }];
      },
      async upsert(table, values) {
        calls.push(`upsert ${table}`);
        const keys = identity(table);
        const existing = matching(table, (row) => sameKey(row, values, keys))[0];
        // A merge, like `on conflict do update set` with the columns it was given —
        // which is why the adapter can send a whole row and a tombstone can send a
        // read row plus two marks.
        if (existing) {
          Object.assign(existing, values);
          return [{ ...existing }];
        }
        tableRows(table).push({ ...values });
        return [{ ...values }];
      },
    },
  };
}
