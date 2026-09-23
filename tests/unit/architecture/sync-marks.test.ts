import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The catalogue's delete mark, in all three descriptions of the product.
 *
 * `P2 · 3`'s first slice. Sync settles two devices per row and never asks the reader
 * (DECISIONS.md §7), so a delete has to travel as a row with a later revision rather
 * than as an absence — and that needs a column, a device's own copy of it, and the
 * index a pull reads. The three lists are the same list written three ways, which is
 * exactly the kind of thing that drifts silently: a table added to the domain and
 * forgotten in the SQL has no way to say it was deleted, and nothing would notice
 * until two devices disagreed about it.
 *
 * The last two cases make the list exhaustive rather than a floor: every mark and
 * every index in the migration has to be one this file knows about.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function readRepo(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8");
}

/** Escape a literal for a regular expression. */
function literal(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The migration with its `--` comments dropped.
 *
 * A retired name in *prose* is history — this file's own comment names
 * `focus_points` to explain why the column is on `meditations` — while a retired
 * name in a **statement** is a migration that fails the moment it is applied. The
 * cases below are about the statements.
 */
function statements(sqlText: string): string {
  return sqlText
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

const MIGRATION = "supabase/migrations/20260921140000_sync_delete_marks.sql";

/** One row per catalogue table: what SQL calls it, what Dexie calls it, its index. */
const MARKS = [
  ["meditations", "focusPoints", "meditations_workspace_updated"],
  ["symbols", "symbols", "symbols_workspace_updated"],
  ["intentions", "intentions", "intentions_workspace_updated"],
  ["field_defs", "fieldDefs", "field_defs_workspace_updated"],
  ["field_options", "fieldOptions", "field_options_workspace_updated"],
  ["field_values", "fieldValuesByEntity", "field_values_updated_at"],
  ["binaural_presets", "presets", "binaural_presets_workspace_updated"],
  ["media_assets", "mediaAssets", "media_assets_workspace_updated"],
  ["entries", "entries", "entries_workspace_updated"],
  ["meditation_types", "meditationTypes", "meditation_types_workspace_updated"],
] as const;

describe("the catalogue's delete mark", () => {
  const models = readRepo("packages/domain/src/models.ts");
  const dexie = readRepo("packages/db/src/schema.ts");
  const sql = readRepo(MIGRATION);

  it("is the one thing that makes a row a row sync compares", () => {
    // It lives on `Versioned` rather than on each row, which is the honest place:
    // the mark and the revision are two halves of one fact, and a catalogue row that
    // is not `Versioned` is not a row the protocol carries at all.
    expect(models).toMatch(
      /export type Versioned = \{[\s\S]*?revision: number;[\s\S]*?updatedAt: number;[\s\S]*?deletedAt\?: number \| null;[\s\S]*?\};/,
    );
    // Deliberately not the archive's column: archiving is the reader's undo and the
    // Archive page draws those rows, while this mark is final and invisible.
    expect(models).toMatch(/export type Archived = Versioned & \{[\s\S]*?archivedAt: number \| null;/);
  });

  it("gives every catalogue table the mark, and a pull an index to read it with", () => {
    for (const [table, , index] of MARKS) {
      expect(sql, `${table} has no delete mark`).toMatch(
        new RegExp(`alter table public\\.${table}\\s+add column if not exists deleted_at timestamptz;`),
      );
      // A pull asks "this workspace's rows that moved since my watermark", so the
      // index leads with the workspace — except on `field_values`, which has none.
      const columns =
        table === "field_values" ? "(updated_at desc)" : "(workspace_id, updated_at desc)";
      expect(sql, `${table}'s index is not the read a pull makes`).toMatch(
        new RegExp(
          `create index if not exists ${index}\\s+on public\\.${table} ${literal(columns)}`,
        ),
      );
    }

    // ...and nothing else: the list above is the whole of it, not a floor.
    expect(sql.match(/alter table public\./g) ?? []).toHaveLength(MARKS.length);
    expect(sql.match(/create index if not exists /g) ?? []).toHaveLength(MARKS.length);
  });

  it("names the tables the latest migration left, not the ones init.sql created", () => {
    // `focus_points` has been `meditations` since the owner's round 15
    // (`20260919140000_rename_meditations.sql`) — and this case exists because the
    // first draft of this migration named the old one, which failed the moment the
    // local stack replayed the history: `check` cannot see it, because nothing in the
    // edit loop runs SQL. The list below is every table this schema has retired.
    const ddl = statements(sql);
    for (const retired of ["focus_points", "focus_symbol_bindings", "affirmations", "table_views"]) {
      expect(ddl, `${retired} is a retired table`).not.toContain(retired);
    }
  });

  it("writes the mark into the rows a device already holds", () => {
    const v27 = dexie.slice(dexie.indexOf("this.version(27)"), dexie.indexOf("export const db"));
    expect(v27.length, "v27 is gone").toBeGreaterThan(0);
    for (const [, table] of MARKS) {
      expect(v27, `${table} is not backfilled`).toContain(`"${table}"`);
      // The *store* name, which is what `tx.table()` takes — the property on the
      // class is a different word for one of them (`meditations!` holds the store
      // `focusPoints`, because a store's name cannot change once a version ran).
      expect(dexie, `${table} is not a store`).toMatch(new RegExp(`${table}: "`));
    }
    expect(v27).toContain("deletedAt: null");
    // `plans` is deliberately out: a plan is versioned by `revision` alone, so its
    // tombstone belongs to the slice that adds its cloud adapter.
    expect(v27).not.toContain('"plans"');
  });
});
