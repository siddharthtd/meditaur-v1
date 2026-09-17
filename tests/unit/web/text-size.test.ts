import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTextSize,
  TEXT_SIZE_BOOTSTRAP,
  TEXT_SIZE_STORAGE_KEY,
} from "../../../apps/web/src/lib/text-size.ts";

describe("text size", () => {
  const stored = new Map<string, string>();
  const documentElement = { dataset: {} as Record<string, string> };

  beforeEach(() => {
    stored.clear();
    documentElement.dataset = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => {
        stored.set(key, value);
      },
      removeItem: (key: string) => {
        stored.delete(key);
      },
    });
    vi.stubGlobal("document", { documentElement });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("paints the size and keeps a copy for the next first paint", () => {
    applyTextSize("xl");
    expect(documentElement.dataset.textSize).toBe("xl");
    expect(stored.get(TEXT_SIZE_STORAGE_KEY)).toBe("xl");

    applyTextSize("md");
    expect(documentElement.dataset.textSize).toBe("md");
    expect(stored.get(TEXT_SIZE_STORAGE_KEY)).toBe("md");
  });

  it("survives a blocked localStorage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => undefined,
    });
    expect(() => applyTextSize("lg")).not.toThrow();
    expect(documentElement.dataset.textSize).toBe("lg");
  });

  it("boots from the same key and only the sizes the preference allows", () => {
    // The inline script and `applyTextSize` must agree, or the document paints
    // one size and corrects to another.
    expect(TEXT_SIZE_BOOTSTRAP).toContain(JSON.stringify(TEXT_SIZE_STORAGE_KEY));
    expect(TEXT_SIZE_BOOTSTRAP).toContain("document.documentElement.dataset.textSize=v");
    for (const size of ['"md"', '"lg"', '"xl"']) {
      expect(TEXT_SIZE_BOOTSTRAP).toContain(`v===${size}`);
    }
    // "sm" is not a text size, so the script must not accept it.
    expect(TEXT_SIZE_BOOTSTRAP).not.toContain('"sm"');
  });
});
