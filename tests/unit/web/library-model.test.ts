import { describe, expect, it, vi } from "vitest";
import {
  binauralDraftKey,
  MEDITATION_BUILTIN_COLUMNS,
  poolColumns,
  pruneBinauralDrafts,
  resolveColumns,
  sortSymbolsForPicker,
  SYMBOL_BUILTIN_COLUMNS,
  toggleOrdered,
} from "../../../apps/web/src/features/library/library-model.ts";
import { makeFieldDef, makeSymbol } from "../../fixtures/library.ts";

describe("library model helpers", () => {
  it("sorts symbols in pickers by name", () => {
    const rows = [makeSymbol("s1", "Zonar"), makeSymbol("s2", "Rama"), makeSymbol("s3", "Halu")];
    expect(sortSymbolsForPicker(rows).map((s) => s.name)).toEqual(["Halu", "Rama", "Zonar"]);
  });

  it("keeps the custom field pools separate", () => {
    const defs = [
      makeFieldDef({ id: "fd1", scope: "symbol", key: "seed", label: "Seed", sortOrder: 1 }),
      makeFieldDef({
        id: "fd2",
        scope: "meditation",
        key: "mantra",
        label: "Mantra",
        sortOrder: 0,
      }),
    ];
    expect(poolColumns(MEDITATION_BUILTIN_COLUMNS, defs, "meditation").map((c) => c.key)).toEqual([
      ...MEDITATION_BUILTIN_COLUMNS.map((c) => c.key),
      "mantra",
    ]);
    expect(poolColumns(SYMBOL_BUILTIN_COLUMNS, defs, "symbol").map((c) => c.key)).toEqual([
      ...SYMBOL_BUILTIN_COLUMNS.map((c) => c.key),
      "seed",
    ]);
  });

  it("leaves an archived column out of a table's columns", () => {
    const defs = [
      makeFieldDef({ id: "fd1", scope: "symbol", key: "seed", label: "Seed" }),
      makeFieldDef({ id: "fd2", scope: "symbol", key: "gone", label: "Gone", archivedAt: 5 }),
    ];
    expect(poolColumns(SYMBOL_BUILTIN_COLUMNS, defs, "symbol").map((c) => c.key)).toEqual([
      ...SYMBOL_BUILTIN_COLUMNS.map((c) => c.key),
      "seed",
    ]);
  });

  it("keeps one type's columns out of another type's pool, and the shared ones in", () => {
    const defs = [
      makeFieldDef({ id: "fd1", scope: "meditation", key: "governs", label: "Governs", typeId: "ct1" }),
      makeFieldDef({ id: "fd2", scope: "meditation", key: "affirm", label: "Affirmations", typeId: "ct2" }),
      makeFieldDef({ id: "fd3", scope: "meditation", key: "notes", label: "Notes" }),
    ];
    const keys = (typeId: string | null) =>
      poolColumns(MEDITATION_BUILTIN_COLUMNS, defs, "meditation", typeId).map((c) => c.key);

    // §12.4: a Thanks Giving column cannot leak onto a Protection row, and a
    // chakra's own column cannot leak the other way.
    expect(keys("ct1")).toContain("governs");
    expect(keys("ct1")).not.toContain("affirm");
    expect(keys("ct2")).toContain("affirm");
    expect(keys("ct2")).not.toContain("governs");
    // `typeId: null` is the reader's own column: it is in every type's pool.
    expect(keys("ct1")).toContain("notes");
    expect(keys("ct2")).toContain("notes");
    // A pool that is not a type's — Symbols, Entries — draws the shared ones only.
    expect(keys(null)).toEqual([...MEDITATION_BUILTIN_COLUMNS.map((c) => c.key), "notes"]);
  });

  it("drops binaural drafts whose meditation is gone, and keeps the rest", () => {
    const store = new Map<string, string>([
      [binauralDraftKey("fp1"), "{}"],
      [binauralDraftKey("fp-deleted"), "{}"],
      ["meditaur:libraryTable", "focus"],
      ["meditaur:binauralDraftKept", "{}"],
    ]);
    vi.stubGlobal("sessionStorage", {
      get length() {
        return store.size;
      },
      key: (index: number) => [...store.keys()][index] ?? null,
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });

    pruneBinauralDrafts(["fp1", "fp2"]);

    expect(store.has(binauralDraftKey("fp1"))).toBe(true);
    expect(store.has(binauralDraftKey("fp-deleted"))).toBe(false);
    // Only drafts are swept: the section memory and a lookalike prefix stay.
    expect(store.has("meditaur:libraryTable")).toBe(true);
    expect(store.has("meditaur:binauralDraftKept")).toBe(true);
    vi.unstubAllGlobals();
  });

  it("toggles and resolves table columns against the canonical order", () => {
    const order = ["name", "image", "kind"];
    expect(toggleOrdered(["name", "image", "kind"], "image", order)).toEqual(["name", "kind"]);
    expect(toggleOrdered(["name", "kind"], "image", order)).toEqual(["name", "image", "kind"]);
    expect(resolveColumns(["kind", "name"], order)).toEqual(["name", "kind"]);
    expect(resolveColumns(null, order)).toEqual(order);
  });
});
