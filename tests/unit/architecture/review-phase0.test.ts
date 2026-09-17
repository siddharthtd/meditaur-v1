import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Guards for the critical fixes in docs/ARCHITECTURE_REVIEW.md. They are
// text-based on purpose: the tools image has no browser, so a real IndexedDB
// upgrade cannot run in the unit gate. The Dexie primary-key rule below is the
// one the runtime aborts on, so it is the invariant worth pinning.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function readRepo(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

const DELETED = "<deleted>";

type DexieVersion = { version: number; primaryKeys: Map<string, string> };

function dexieVersions(schema: string): DexieVersion[] {
  return schema
    .split(/this\.version\(/)
    .slice(1)
    .map((block) => {
      const version = Number(block.slice(0, block.indexOf(")")));
      const stores = block.match(/\.stores\(\{([\s\S]*?)\}\)/);
      const primaryKeys = new Map<string, string>();
      if (stores) {
        for (const line of stores[1].split("\n")) {
          const match = line.match(/^\s*([A-Za-z0-9_]+):\s*(null|"([^"]*)")/);
          if (!match) continue;
          primaryKeys.set(
            match[1],
            match[2] === "null" ? DELETED : match[3].split(",")[0].trim(),
          );
        }
      }
      return { version, primaryKeys };
    });
}

describe("architectural review phase 0", () => {
  it("never changes a Dexie table's primary key across versions", () => {
    const versions = dexieVersions(readRepo("packages/db/src/schema.ts"));
    expect(versions.length).toBeGreaterThan(0);
    expect(versions.some((row) => row.version === 7)).toBe(true);

    const seen = new Map<string, string>();
    for (const { version, primaryKeys } of versions) {
      for (const [table, primaryKey] of primaryKeys) {
        const previous = seen.get(table);
        // Dropping a table is always safe; re-adding one after a drop is a new
        // table and may use any key. Only a changed key aborts the upgrade.
        if (primaryKey !== DELETED && previous !== undefined && previous !== DELETED) {
          expect(primaryKey, `table ${table} in version ${version}`).toBe(previous);
        }
        seen.set(table, primaryKey);
      }
    }

    // Field values moved to a new table name because Dexie refuses to re-key a
    // table; the v1 table is dropped once its rows are copied.
    expect(seen.get("fieldValues")).toBe(DELETED);
    expect(seen.get("fieldValuesByEntity")).toBe("[entityId+fieldDefId]");
  });

  it("reads and writes field values through the re-keyed table only", () => {
    const ports = readRepo("packages/db/src/ports.ts");
    expect(ports).toMatch(/db\.fieldValuesByEntity\b/);
    expect(ports).not.toMatch(/db\.fieldValues\b/);
  });

  it("drops the polymorphic field_values foreign key", () => {
    const sql = readRepo("supabase/migrations/20260915120000_field_values_entity_fk.sql");
    expect(sql).toMatch(/drop constraint/i);
    expect(sql).toMatch(/rel\.relname = 'field_values'/);
    expect(sql).toMatch(/con\.confrelid = 'public\.symbols'::regclass/);
  });

  it("keeps the plan revision compare-and-swap in one transaction", () => {
    const app = readRepo("packages/application/src/create-app.ts");
    const start = app.indexOf("savePlan: async (plan) =>");
    const end = app.indexOf("compileAndStoreSession: async (plan, userId) =>");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const savePlan = app.slice(start, end);
    expect(savePlan).toContain("ports.runInTransaction");
    expect(savePlan).toContain('planFail("conflict")');
    expect(savePlan).toContain("ports.plans.save(next)");
  });
});
