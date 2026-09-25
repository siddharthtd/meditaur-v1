import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The watermark store (`P2 · 3`, slice 3), in the four places it has to exist at once.
 *
 * The protocol remembers how far it has got per table (`DECISIONS.md` §12), and the one
 * mistake in this area that nothing else can see is a Dexie table that is **declared
 * but never versioned**: the unit suite has no IndexedDB, so the first thing to notice
 * is a runtime "object store was not found" in a browser — which is how `meditationTypes`
 * broke every save once (2026-09-19). So this reads the source and requires the port,
 * the table, its version and the adapter to agree.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function readRepo(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("the sync watermark store", () => {
  const domainPorts = readRepo("packages/domain/src/ports.ts");
  const domainIndex = readRepo("packages/domain/src/index.ts");
  const schema = readRepo("packages/db/src/schema.ts");
  const ports = readRepo("packages/db/src/ports.ts");
  const dbIndex = readRepo("packages/db/src/index.ts");

  it("is a port in the domain, in the shape the protocol asks for", () => {
    // Two marks, because the two directions ask different stores: `pushedAt` is where
    // this device stopped sending, `pulledAt` where it stopped reading.
    expect(domainPorts).toMatch(
      /export type SyncWatermark = \{[\s\S]*?table: string;[\s\S]*?pushedAt: number;[\s\S]*?pulledAt: number;[\s\S]*?\};/,
    );
    expect(domainPorts).toMatch(
      /export type SyncStatePort = \{[\s\S]*?get\(table: string\): Promise<SyncWatermark \| null>;[\s\S]*?save\(mark: SyncWatermark\): Promise<void>;[\s\S]*?\};/,
    );
    expect(domainIndex, "the port is not exported").toContain("SyncStatePort,");
  });

  it("is a Dexie table the class declares and a version creates", () => {
    expect(schema).toMatch(/^\s{2}syncState!: EntityTable<SyncWatermark, "table">;/m);
    // The half that fails at runtime rather than at compile time when it is missing.
    expect(schema, "no version creates the store").toMatch(
      /this\.version\(28\)\.stores\(\{ syncState: "table" \}\)/,
    );
  });

  it("has an adapter, and the package exports it", () => {
    expect(ports).toMatch(/export const dexieSyncState: SyncStatePort = \{/);
    expect(ports).toContain("db.syncState.get(table)");
    expect(ports).toContain("db.syncState.put(mark)");
    expect(dbIndex, "the adapter is not exported").toContain("dexieSyncState");
  });

  it("is written on its own, and the deliberate-outside list says so", () => {
    // The protocol writes a mark outside any save, so the table lives on
    // `OUTSIDE_THE_SCOPE` with its reason — the other half of the rule
    // `tests/unit/db/transaction-scope.test.ts` enforces.
    expect(readRepo("tests/unit/db/transaction-scope.test.ts")).toMatch(/\n {2}syncState: "/);
  });
});
