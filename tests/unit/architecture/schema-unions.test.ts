import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The union drift guard the 2026-09-15 review asked for.
 *
 * Domain types, Dexie, and `supabase/migrations` are supposed to describe one
 * product. The integrity test compares a few column names; it cannot see a union
 * that the domain narrows and Postgres never learned about, which is how
 * `text_size`, `symbol_filter`, and the media `kind` were all left unconstrained.
 *
 * This reads the unions out of the domain and asserts the migrations constrain
 * the matching column to exactly those values.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function migrations(): string {
  const dir = join(repoRoot, "supabase/migrations");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(dir, name), "utf8"))
    .join("\n");
}

/**
 * Reads a union either as an alias (`export type SymbolFilter = "a" | "b";`)
 * or as an object field (`textSize: "sm" | "md" | "lg" | "xl";`), so the caller
 * names whichever the domain uses.
 */
function unionValues(source: string, name: string): string[] {
  // A leading `|` is allowed because a long union is written one value per line
  // (`export type CellType =\n  | "text"\n  | ...`), and the guard should read the
  // domain as it is rather than dictate how it is laid out.
  const pattern = `(?:export type ${name}\\s*=|[\\.\\s]${name}\\s*:)\\s*\\|?\\s*((?:"[^"]+"\\s*\\|?\\s*)+)`;
  const match = new RegExp(pattern).exec(source);
  if (!match) throw new Error(`no union found for ${name} in the domain models`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map(([, value]) => value);
}

const models = read("packages/domain/src/models.ts");
const sql = migrations();

function expectConstrained(column: string, values: string[]): void {
  // A column name can appear in more than one table with a different union —
  // `kind` is a focus-point kind and a media kind — so this looks for the check
  // that matches the union under test, then insists it is exactly that union.
  const lines = sql.split("\n").filter((line) => line.includes(`${column} in (`));
  const matching = lines.filter((line) => values.every((value) => line.includes(`'${value}'`)));
  expect(
    matching.length,
    `no check constrains ${column} to ${values.join(", ")}; found: ${lines.join(" | ") || "none"}`,
  ).toBeGreaterThan(0);

  for (const line of matching) {
    const allowed = [...line.matchAll(/'([^']+)'/g)].map(([, value]) => value);
    expect(allowed.sort()).toEqual([...values].sort());
  }
}

describe("schema unions", () => {
  it("constrains every union column to the values the domain allows", () => {
    expectConstrained("text_size", unionValues(models, "textSize"));
    expectConstrained("scope", unionValues(models, "FieldScope"));
    expectConstrained("cell_type", unionValues(models, "CellType"));
    expectConstrained("ref_kind", unionValues(models, "RefKind"));
    expectConstrained("kind", unionValues(models, "MediaKind"));
    // The owner's round 16 added the systems a symbol can belong to, and the column
    // is nullable on purpose: a symbol the reader adds names none, which is what
    // keeps it out of the flag's reach (`isSymbolSystemEnabled`).
    expectConstrained("reiki_system", unionValues(models, "ReikiSystem"));
  });

  it("reads the unions it is asserting on", () => {
    // A typo in a name would otherwise make the helper throw at import time with
    // no clue which check stopped working.
    expect(unionValues(models, "textSize")).toEqual(["sm", "md", "lg", "xl"]);
    expect(unionValues(models, "MediaKind")).toEqual(["ambient", "alarm", "image"]);
    expect(unionValues(models, "FieldScope")).toEqual([
      "entry",
      "meditation",
      "symbol",
      "affirmation",
    ]);
    expect(unionValues(models, "RefKind")).toEqual(["meditation", "symbol", "preset"]);
    expect(unionValues(models, "ReikiSystem")).toEqual([
      "karuna_reiki",
      "usui_reiki",
      "reiki_master",
    ]);
    expect(unionValues(models, "CellType")).toEqual([
      "text",
      "longText",
      "number",
      "duration",
      "date",
      "image",
      "reference",
      "select",
    ]);
  });
});
