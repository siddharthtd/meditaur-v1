import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Every Dexie table has to be inside the one transaction scope.
 *
 * `dexieRunInTransaction` is the single read-modify-write transaction the local
 * store has, and its table list is hand-written. A table that exists in
 * `schema.ts` and is missing from that list does not fail at compile time, does
 * not fail in any unit test, and does not fail when the code that uses it runs
 * *outside* a transaction — it fails with
 *
 *   Failed to execute 'objectStore' on 'IDBTransaction': The specified object
 *   store was not found
 *
 * the moment a use case that runs inside the scope touches it. That is exactly
 * what happened when `meditationTypes` arrived (2026-09-19): every catalogue save
 * that also touched a type — adding a column, restoring a backup — broke, and the
 * e2e suite was the first thing to notice.
 *
 * This reads both files as source and asserts the lists agree. It is deliberately
 * source-text-based, like the integrity test's other structural guards: the point
 * is to catch the *omission*, which is invisible to the type system.
 */
function readRepo(relativePath: string): string {
  return readFileSync(new URL(`../../../${relativePath}`, import.meta.url), "utf8");
}

/** The table properties a Dexie class declares. */
function declaredTables(): string[] {
  const schema = readRepo("packages/db/src/schema.ts");
  const names = [...schema.matchAll(/^\s{2}([a-zA-Z]+)!: (?:EntityTable|Table)</gm)].map(
    ([, name]) => name!,
  );
  expect(names.length, "the Dexie class declares tables").toBeGreaterThan(15);
  return names;
}

/**
 * Tables that are deliberately *not* in the one read-modify-write scope, each with
 * the reason. A new table belongs here or in the scope, and this file is where that
 * decision gets written down — the shape the service worker's shell test uses.
 */
const OUTSIDE_THE_SCOPE: Record<string, string> = {
  workspaces: "claimed by `adopt` in a transaction of its own (`packages/db/src/identity.ts`)",
  members: "the same claim transaction as `workspaces`",
  events: "append-only: written on its own, never read back inside a save",
  syncState: "a sync's own watermark, per table: written on its own by the protocol, never inside a save",
  accountFlags: "the mirror of the account's flags: written only from an accepted cloud read, never inside a save",
};

/** The tables the local write paths declare: the main scope, plus the claim. */
function scopedTables(): string[] {
  const sources = ["packages/db/src/ports.ts", "packages/db/src/identity.ts"].map(readRepo);
  const names = new Set<string>();
  for (const source of sources) {
    for (const [, list] of source.matchAll(/db\.transaction\(\s*"rw",\s*(\[[\s\S]*?\])/g)) {
      for (const [, table] of list!.matchAll(/db\.([a-zA-Z]+)/g)) names.add(table!);
    }
  }
  expect(names.size, "the write paths declare a scope").toBeGreaterThan(2);
  return [...names];
}

describe("the local transaction scope", () => {
  it("accounts for every table the Dexie class declares", () => {
    const scope = scopedTables();
    const unaccounted = declaredTables().filter(
      (table) => !scope.includes(table) && !(table in OUTSIDE_THE_SCOPE),
    );
    expect(
      unaccounted,
      `add these to a db.transaction scope, or to OUTSIDE_THE_SCOPE with a reason: ${unaccounted.join(", ")}`,
    ).toEqual([]);
  });

  it("names no table the class does not declare", () => {
    const declared = declaredTables();
    const extra = [...scopedTables(), ...Object.keys(OUTSIDE_THE_SCOPE)].filter(
      (table) => !declared.includes(table),
    );
    expect(extra, `these are not tables any more: ${extra.join(", ")}`).toEqual([]);
  });
});
