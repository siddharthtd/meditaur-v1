import type { Versioned } from "./models.ts";

/**
 * The rules a sync run asks, as pure functions of rows and watermarks (`P2 · 3`,
 * slice 3).
 *
 * They live in the domain rather than beside the protocol, and the reason is the
 * package graph: the protocol is an adapter's job (`packages/db/src/sync.ts`) and the
 * store's reads are `packages/db/src/ports.ts`'s, and `packages/db` may only import
 * *this* package. A rule that the two halves of a sync each re-implemented is a row
 * that travels twice or not at all.
 *
 * **Watermarks are timestamps in the rows' own clock**, which is the client's
 * (`Versioned.updatedAt`) on both sides — a row's timestamp is written by whichever
 * device saved it and travels with the row. Both halves are deliberately conservative
 * about the millisecond they stop on, because a tie is not hypothetical here: one
 * cascade writes several rows with the *same* timestamp (`deleteEntry` marks a row and
 * its lines at one `at`), and the seed writes hundreds that way.
 *
 * These functions are what the protocol's own tests drive; nothing here reads a store,
 * a clock or a network.
 */

/**
 * The rows a push owes the cloud: the ones that reached the watermark.
 *
 * `>=` rather than `>`, and that is the whole function. A watermark that has passed
 * one row of a tie group must not hide its siblings, so the watermark is a **floor**
 * rather than a fence; the cost is that the rows sitting exactly on it are sent again
 * on the next run, which an upsert makes free (the same reason a catalogue save is an
 * upsert at all).
 */
export function rowsPast<T extends Pick<Versioned, "updatedAt">>(
  rows: T[],
  watermark: number,
): T[] {
  return rows.filter((row) => row.updatedAt >= watermark);
}

/**
 * The watermark a push may move to: the last row it actually **wrote**.
 *
 * Never backwards, and never at all for a batch that wrote nothing — a push that was
 * refused, or that found no rows, leaves the mark where it was so the next run asks
 * the same question. This is the half of §12's rule that keeps a row edited *during* a
 * push from being missed: the mark stops at what was sent, so the newer copy is still
 * past it.
 */
export function pushedWatermark(
  previous: number,
  written: Pick<Versioned, "updatedAt">[],
): number {
  if (written.length === 0) return previous;
  return Math.max(previous, ...written.map((row) => row.updatedAt));
}

/**
 * The watermark a pull may move to: one millisecond **behind** the newest row the
 * batch saw.
 *
 * The pull's read is `updated_at > watermark` and it comes back in batches, so a tie
 * on the boundary is how a row gets lost for ever: a batch that ends inside a group of
 * rows sharing one timestamp steps over the rest of the group, and the next run — whose
 * watermark has already passed them — never looks again. Standing one millisecond
 * behind re-reads those rows, and the merge settles them for nothing, because the
 * second look sees the same revisions and writes nothing.
 *
 * Never backwards, and never at all for an empty batch, for the same reason
 * `pushedWatermark` does not move.
 */
export function pullWatermarkAfter(
  previous: number,
  observed: Pick<Versioned, "updatedAt">[],
): number {
  if (observed.length === 0) return previous;
  return Math.max(previous, Math.max(...observed.map((row) => row.updatedAt)) - 1);
}

/**
 * Which of two copies of a row **is** the row: the higher revision, quietly
 * (`DECISIONS.md` §7).
 *
 * A copy the store has never held wins by definition. Equal revisions are a tie the
 * incoming copy loses, which is what makes a second look at the same row write
 * nothing. A delete mark needs no rule of its own: it is a row with a later revision
 * (`delete-mark.ts`), so it settles exactly like every other change.
 */
export function incomingWins(
  incoming: Pick<Versioned, "revision">,
  local: Pick<Versioned, "revision"> | null,
): boolean {
  if (!local) return true;
  return incoming.revision > local.revision;
}
