import type { MeditationType } from "@meditaur/domain";
import { liveTypes } from "../library/library-model";

/**
 * The Database's own tables (§5.2).
 *
 * They lived in the library's model while the Database was a tab of the library.
 * It is a screen of its own now, so its table list, its labels, and the keys that
 * remember which one the reader had open live beside it — the library has no
 * reason to know what tables the store has, and no longer does.
 *
 * Since the owner's round 15 the list is **generated** (§8): one table per live
 * meditation type, then the fixed ones — Karuna, Symbols, Presets and **Types**.
 * A type is a row, so a reader who adds one gets a table with nothing to register,
 * and the type's own table is where its meditations live and where its columns are
 * added. The type tables are namespaced (`meditation:<id>`) for the same reason
 * the library's tabs are: an id has to survive its type being renamed.
 */
export type FixedDatabaseTable = "entries" | "symbols" | "presets" | "affirmations" | "types";
/** A table that belongs to one meditation type. */
export type MeditationTable = `meditation:${string}`;
export type DatabaseTable = FixedDatabaseTable | MeditationTable;

export const MEDITATION_TABLE_PREFIX = "meditation:";

export const FIXED_DATABASE_TABLES: { id: FixedDatabaseTable; label: string }[] = [
  // The owner's round 16 renames the table's copy and nothing else: the id stays
  // `entries`, because it is a **stored** value — the remembered table and a
  // `?table=entries` link from anywhere older both have to keep landing here (§5.1).
  { id: "entries", label: "Karuna" },
  { id: "symbols", label: "Symbols" },
  { id: "presets", label: "Presets" },
  // §8: "one per live type, plus Karuna, Symbols, Presets, Affirmations and
  // **Types**". The affirmations are the reader's own sentences, and their table is
  // where they write them (§12.10).
  { id: "affirmations", label: "Affirmations" },
  { id: "types", label: "Types" },
];

export const DATABASE_TABLE_KEY = "meditaur:databaseTable";
export const DATABASE_HINT_KEY = "meditaur:databaseHintSeen";
/**
 * Which columns the reader has taken out of each table's **view**.
 *
 * The owner's round 17: *"Columns should be able to be removed (Add an edit table
 * button which should enable x button next to every column heading which removes
 * the column where-ever not required by the user)."* Removing here means out of the
 * view and nothing else — the column is still stored, still holds its values and is
 * still something a plan's Display can name — which is why this is a preference and
 * not a draft edit.
 *
 * Per table, `columnKey`-shaped (`builtin:name`, `column:<id>`), and remembered for
 * the session the way the remembered tab is: a browser that refuses the storage
 * still gets the behaviour while the screen is open.
 */
export const DATABASE_COLUMNS_KEY = "meditaur:databaseColumns";

/** The table a type's meditations live in. */
export function meditationTableId(typeId: string): MeditationTable {
  return `${MEDITATION_TABLE_PREFIX}${typeId}`;
}

/**
 * The three record kinds that have an editor of their own (§5.5).
 *
 * A record page edits a *record* — a meditation, a symbol, a preset — and every
 * meditation's page is the same page whatever table it was opened from, so this is
 * a smaller set than `DatabaseTable` and the two are mapped explicitly.
 */
export type RecordTable = "meditation" | "symbols" | "presets";

/** The record page a table's rows open, or `null` when its rows have no page. */
export function recordTableOf(table: DatabaseTable): RecordTable | null {
  if (table === "symbols") return "symbols";
  if (table === "presets") return "presets";
  return meditationTableTypeId(table) ? "meditation" : null;
}

/** The type a table belongs to, or `null` for one of the fixed tables. */
export function meditationTableTypeId(table: string): string | null {
  if (!table.startsWith(MEDITATION_TABLE_PREFIX)) return null;
  const id = table.slice(MEDITATION_TABLE_PREFIX.length);
  return id.length > 0 ? id : null;
}

/** The whole strip: one table per live type, then the fixed ones (§8). */
export function databaseTables(types: MeditationType[]): { id: DatabaseTable; label: string }[] {
  return [
    ...liveTypes(types).map((row) => ({ id: meditationTableId(row.id), label: row.name })),
    ...FIXED_DATABASE_TABLES,
  ];
}

/** What a table is called in a heading, from the rows that name it. */
export function databaseTableLabel(table: DatabaseTable, types: MeditationType[]): string {
  const typeId = meditationTableTypeId(table);
  if (typeId) return types.find((row) => row.id === typeId)?.name ?? "Meditations";
  return FIXED_DATABASE_TABLES.find((row) => row.id === table)?.label ?? table;
}

/**
 * The table a stored value or a request names.
 *
 * A plain `/database` opens on **Karuna**, which is where it has always opened —
 * the id is still `entries`, so an old link, a remembered table and the seed all
 * arrive at the same place. The two ids that are not in the strip are answered from
 * the rows: `focus` was the one table every meditation lived in before the owner's
 * round 15 split it per type, and a `meditation:<id>` whose type has since been
 * archived is gone from the strip too. Both land on the first live type's table,
 * which is where the reader's meditations are and the same tab the library falls
 * back to.
 */
export function parseDatabaseTable(
  raw: string | null,
  types: MeditationType[] = [],
): DatabaseTable {
  const live = databaseTables(types);
  if (raw && live.some((row) => row.id === raw)) return raw as DatabaseTable;
  if (raw === "focus" || (raw && meditationTableTypeId(raw) != null)) {
    const first = live.find((row) => meditationTableTypeId(row.id) != null);
    if (first) return first.id;
  }
  return "entries";
}
