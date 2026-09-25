import type { RecordTable } from "../database/database-tables";

/**
 * A record's own address.
 *
 * The owner's round 21 is why this file exists. Before it, one record had two
 * addresses and two screens: the Library's read-only page at
 * `/library?mode=open&record=…&id=…` and the Database's editor at
 * `/database?mode=record&table=…&id=…`, with the reader travelling between them and
 * the app keeping a flag whose only job was remembering which door they came
 * through. The owner's answer was that opening a record and editing it are **one**
 * screen — so a record needs **one** address, and it belongs to neither screen.
 *
 * It is a static path with a query rather than `/record/<kind>/<id>` on purpose: the
 * offline shell caches *documents*, so a per-id path means picking one record to
 * cache, and both screens that came before it are already this shape.
 *
 * `from` is the one piece that is not about the record: `Esc` leaves the record for
 * the screen it was opened from, and that screen is not something the record can work
 * out for itself. It rides in the address so it survives a reload, and so a link
 * shared between two readers is not a link that guesses. `from` missing — a bookmark,
 * a typed address — reads as the Library, which is where the app's lists live.
 */
export const RECORD_HREF = "/record";

/** The door a record was opened from, which is all `Esc` needs to know. */
export type RecordDoor = "library" | "database";

/** The record kinds that have a page. `presets` has one, and it *is* its editor. */
export type RecordKind = RecordTable;

export function recordHref(request: {
  kind: RecordKind;
  id: string;
  from: RecordDoor;
}): string {
  const params = new URLSearchParams({
    kind: request.kind,
    id: request.id,
    from: request.from,
  });
  return `${RECORD_HREF}?${params.toString()}`;
}

/**
 * The request in the address bar, or `null` for a plain `/record`.
 *
 * The kind is one of three literals — a record page is *not* per type, because a
 * meditation's page is the same page whatever type it is — so this needs no
 * knowledge of the store, unlike the Database's own reader.
 */
export function readRecordRequest(
  search: string,
): { kind: RecordKind; id: string; from: RecordDoor } | null {
  const params = new URLSearchParams(search);
  const kind = params.get("kind");
  const id = params.get("id");
  if (!id) return null;
  if (kind !== "meditation" && kind !== "symbols" && kind !== "presets") return null;
  return { kind, id, from: params.get("from") === "database" ? "database" : "library" };
}
