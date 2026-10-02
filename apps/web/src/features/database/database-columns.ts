import { flagIsOn, type FeatureFlags } from "@meditaur/domain";

import { meditationTableTypeId, type DatabaseTable } from "./database-tables";

/**
 * The built-in columns of the Database's grid.
 *
 * These used to live in `DatabaseTable.tsx`, which outgrew one reading: the column vocabulary is
 * data and two small lookups, while that file is the grid's rendering. The file-size ratchet
 * (`P3 · 50`) is what made the split deliberate rather than gradual, and the table grew a `Tag`
 * column in the same pass (`P4 · 60`).
 *
 * A builtin column is one **the app draws** rather than one the reader added: a meditation's
 * Location, its picture, its switch, a sentence's Association. A custom column is a `FieldDef` and
 * arrives with the reader's catalogue, so the two are drawn from different lists here and merged
 * into one `GridColumn` by the table.
 */

/** One built-in column, with the width it gets when its key's is not the right one. */
export type BuiltinColumn = { key: string; label: string; width?: string };

/** The columns a meditation table draws, whichever type it belongs to. */
export const MEDITATION_BUILTIN_COLUMNS: BuiltinColumn[] = [
  { key: "name", label: "Name" },
  { key: "location", label: "Location" },
  { key: "picture", label: "Picture" },
  { key: "defaultSound", label: "Default sound" },
  { key: "binaural", label: "Binaural" },
  // §5.3: the meditation's own sentences — the lines that carry no symbol, which
  // are the ones that would otherwise have no table to be written in. It is last
  // because it is the column that takes what the others leave, the way an entry's
  // own Intentions cell does.
  { key: "intentions", label: "Intentions" },
];

export const BUILTIN_COLUMNS: Record<
  "symbols" | "presets" | "types" | "affirmations",
  BuiltinColumn[]
> = {
  symbols: [
    { key: "name", label: "Name" },
    { key: "picture", label: "Picture" },
    { key: "description", label: "Description" },
    { key: "usage", label: "Usage" },
  ],
  presets: [
    { key: "name", label: "Name" },
    { key: "sound", label: "Sound" },
  ],
  /** A type's own columns are its meditations' and its stage template's; the row
   *  itself carries a name and an order (§8, §12.6). */
  types: [{ key: "name", label: "Name" }],
  /**
   * An affirmation's row is a **sentence**, so this table has three built-ins: the
   * sentence — the cell a reader types into, and the one that takes the caret when
   * a row arrives — the Association, which is the pair the sentence is written
   * about (§5.2), and the Tag, which says what kind of sentence it is. None is a
   * record's name: the sentence never routes through `name`, which is the trap that
   * once wrote `builtins.text` and dropped the saved row for having no name.
   */
  affirmations: [
    { key: "name", label: "Affirmation", width: "min-w-[28rem]" },
    { key: "association", label: "Associated with" },
    // What kind of sentence the row is (`P4 · 60`), which is what a declaration stage reads.
    { key: "tag", label: "Tag", width: "min-w-40" },
  ],
};

/** The two columns that exist for the sounds: the preset a row defaults to, and its switch. */
const BINAURAL_COLUMNS: readonly string[] = ["defaultSound", "binaural"];

/**
 * The builtin columns of a table.
 *
 * A type's table is a meditation table, so it draws the meditation columns; the
 * Types table draws only a name. The two are one lookup rather than a branch at
 * every use.
 */
export function builtinColumnsOf(table: DatabaseTable, flags?: FeatureFlags | null): BuiltinColumn[] {
  if (!meditationTableTypeId(table)) {
    return BUILTIN_COLUMNS[table as "symbols" | "presets" | "types" | "affirmations"];
  }
  // The two binaural columns leave with the flag (`P0 · 35`, slice 35d): one holds the
  // sound a row defaults to and the other is its switch, so both are ways into a tone.
  // The `Edit table` toolbar draws this same list, which is what stops the column being
  // added back by hand — and a stored column key that is no longer here is simply not
  // drawn, the way a key whose column was deleted is not.
  return MEDITATION_BUILTIN_COLUMNS.filter(
    (row) => !BINAURAL_COLUMNS.includes(row.key) || flagIsOn(flags, "binaural"),
  );
}

/**
 * The builtin columns that are a *field* of the row rather than one of its text
 * columns — a chakra's picture, its default sound, its binaural setting, and a
 * sentence's Association.
 *
 * The Association is one for the same reason: its value is a pair of references,
 * not a string, so it is drawn as a cell of its own and never as a text box.
 */
export function isRecordColumn(key: string): boolean {
  return (
    key === "picture" ||
    key === "defaultSound" ||
    key === "binaural" ||
    key === "intentions" ||
    key === "association"
  );
}
