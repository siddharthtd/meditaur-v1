import { deleteMark, type Clock } from "@meditaur/domain";
import type { SupabaseDataLike } from "./supabase.ts";

/**
 * The write a delete makes: the row, re-written with the mark on it, one revision on.
 *
 * It lives here rather than in either adapter because both of them delete, and the one
 * detail that would drift apart if it were copied is the mark itself — so it is not
 * copied: the three values come from `deleteMark` in the domain
 * (`packages/domain/src/delete-mark.ts`), which is the same function the device's own
 * store marks with. This module only spells them in the cloud's column names.
 *
 * Two things *are* this module's job:
 *
 * - The row is **read first**, because a delete names an id and nothing else, and the
 *   mark has to land on the row's own contents rather than replacing them with a
 *   partial row.
 * - The `columns` flags, because the tables are not the same shape: `plan_blocks` has
 *   neither `revision` nor `updated_at` (its mark is the mark alone, which is enough
 *   because a pull reads a plan's blocks by `plan_id` rather than by a watermark).
 *
 * A row this store does not hold is the caller's business, not this function's: both
 * adapters treat it as "nothing to mark" rather than as an error, because a delete can
 * arrive twice or name a row that only ever existed on the other device.
 */
export async function markRowDeleted(input: {
  client: SupabaseDataLike;
  clock: Clock;
  table: string;
  row: Record<string, unknown>;
  columns?: { updatedAt?: boolean; revision?: boolean };
}): Promise<void> {
  const { client, clock, table, row } = input;
  const mark = deleteMark(clock.nowMs(), { revision: row.revision as number | undefined });
  await client.upsert(table, {
    ...row,
    deleted_at: new Date(mark.deletedAt).toISOString(),
    ...(input.columns?.updatedAt === false
      ? {}
      : { updated_at: new Date(mark.updatedAt).toISOString() }),
    ...(input.columns?.revision === false ? {} : { revision: mark.revision }),
  });
}

/**
 * The read side, for a row that came from Postgres: `null`, or a column that is not
 * there at all, means live.
 *
 * The camel-case twin of this is `notDeleted` (`packages/domain/src/delete-mark.ts`).
 * Both cloud adapters read through this one so a marked row cannot be drawn by one of
 * them and hidden by the other — which is exactly how the mark's first cloud slice
 * landed: the plan adapter filtered, the catalogue adapter did not.
 */
export function liveRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.filter((row) => row.deleted_at == null);
}
