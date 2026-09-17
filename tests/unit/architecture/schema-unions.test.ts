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
 * or as an object field (`textSize: "md" | "lg" | "xl";`), so the caller names
 * whichever the domain uses.
 */
function unionValues(source: string, name: string): string[] {
  const pattern = `(?:export type ${name}\\s*=|[\\.\\s]${name}\\s*:)\\s*((?:"[^"]+"\\s*\\|?\\s*)+)`;
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
    expectConstrained("symbol_filter", unionValues(models, "SymbolFilter"));
    expectConstrained("entity_type", unionValues(models, "FieldEntityType"));
    expectConstrained("kind", unionValues(models, "MediaKind"));
  });

  it("reads the unions it is asserting on", () => {
    // A typo in a name would otherwise make the helper throw at import time with
    // no clue which check stopped working.
    expect(unionValues(models, "textSize")).toEqual(["md", "lg", "xl"]);
    expect(unionValues(models, "SymbolFilter")).toEqual(["block", "focusPoint", "all"]);
    expect(unionValues(models, "FieldEntityType")).toEqual(["symbol", "focusPoint"]);
    expect(unionValues(models, "MediaKind")).toEqual(["ambient", "alarm", "image"]);
  });
});
