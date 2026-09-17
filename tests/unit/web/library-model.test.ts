import { describe, expect, it, vi } from "vitest";
import {
  assocModeOf,
  binauralDraftKey,
  FOCUS_BUILTIN_COLUMNS,
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

  it("derives the association mode from the ids", () => {
    const base = { id: "i1", workspaceId: "ws1", sortOrder: 0, text: "x" };
    expect(assocModeOf({ ...base, focusPointId: null, symbolId: null })).toBe("none");
    expect(assocModeOf({ ...base, focusPointId: "fp1", symbolId: null })).toBe("focus");
    expect(assocModeOf({ ...base, focusPointId: null, symbolId: "s1" })).toBe("symbol");
    expect(assocModeOf({ ...base, focusPointId: "fp1", symbolId: "s1" })).toBe("both");
  });

  it("keeps the custom field pools separate", () => {
    const defs = [
      makeFieldDef({ id: "fd1", entityType: "symbol", key: "seed", label: "Seed", sortOrder: 1 }),
      makeFieldDef({
        id: "fd2",
        entityType: "focusPoint",
        key: "mantra",
        label: "Mantra",
        sortOrder: 0,
      }),
    ];
    expect(poolColumns(FOCUS_BUILTIN_COLUMNS, defs, "focusPoint").map((c) => c.key)).toEqual([
      ...FOCUS_BUILTIN_COLUMNS.map((c) => c.key),
      "mantra",
    ]);
    expect(poolColumns(SYMBOL_BUILTIN_COLUMNS, defs, "symbol").map((c) => c.key)).toEqual([
      ...SYMBOL_BUILTIN_COLUMNS.map((c) => c.key),
      "seed",
    ]);
  });

  it("drops binaural drafts whose focus point is gone, and keeps the rest", () => {
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
