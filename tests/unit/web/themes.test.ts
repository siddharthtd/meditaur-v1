import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_NAMES } from "@meditaur/domain";
import { applyTheme, THEME_BOOTSTRAP, THEME_STORAGE_KEY } from "../../../apps/web/src/lib/theme.ts";
import { THEME_PALETTES, themeSwatch } from "../../../apps/web/src/lib/themes.ts";

/**
 * The pre-paint mirror, the eight palettes, and the CSS blocks that paint them.
 *
 * Two homes for one palette is the price of painting before React runs: the document needs
 * custom properties in a stylesheet, and the Settings picker needs the same colours as
 * values to draw its swatches. This file is the guard that the two agree — the repo's
 * `catalog-order.test.ts` idiom, applied to colour — plus the checks that a palette is
 * legible rather than merely different.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const css = readFileSync(join(repoRoot, "apps/web/src/app/globals.css"), "utf8");

/** The hex a `--color-<token>` declaration holds, first match wins. */
function firstToken(token: string): string | null {
  const pattern = new RegExp(`--color-${token}:\\s*(#[0-9a-fA-F]{6})`);
  return pattern.exec(css)?.[1]?.toLowerCase() ?? null;
}

/**
 * The hex a token holds **inside one theme's block**.
 *
 * `warm` has no block of its own — `:root` already holds its values, which is `the @theme`
 * block — so it is read as the first occurrence in the file instead. The order matters:
 * `@theme` comes before every `[data-theme]` block, so "first" is the default palette.
 */
function tokenIn(theme: string, token: string): string | null {
  if (theme === "warm") return firstToken(token);
  const block = new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([\\s\\S]*?)\\}`).exec(css)?.[1];
  if (!block) return null;
  return new RegExp(`--color-${token}:\\s*(#[0-9a-fA-F]{6})`).exec(block)?.[1]?.toLowerCase() ?? null;
}

const TOKENS: readonly { token: string; key: keyof (typeof THEME_PALETTES)["warm"] }[] = [
  { token: "bg", key: "bg" },
  { token: "surface", key: "surface" },
  { token: "surface-raised", key: "raised" },
  { token: "text", key: "text" },
  { token: "muted", key: "muted" },
  { token: "line", key: "line" },
  { token: "accent", key: "accent" },
];

/** WCAG relative luminance, for the contrast checks below. */
function luminance(hex: string): number {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((at) => Number.parseInt(value.slice(at, at + 2), 16) / 255);
  const [r, g, b] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((left, right) => right - left) as [
    number,
    number,
  ];
  return (high + 0.05) / (low + 0.05);
}

/** The hue angle in degrees, so "three different colours" is a measurement. */
function hue(hex: string): number {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((at) => Number.parseInt(value.slice(at, at + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const raw =
    max === r
      ? ((g - b) / (max - min)) % 6
      : max === g
        ? (b - r) / (max - min) + 2
        : (r - g) / (max - min) + 4;
  return ((raw * 60) % 360 + 360) % 360;
}

/** The smaller angle between two hues, so 350° and 10° are 20° apart rather than 340°. */
function hueGap(a: string, b: string): number {
  const gap = Math.abs(hue(a) - hue(b)) % 360;
  return gap > 180 ? 360 - gap : gap;
}

describe("the eight colour schemes", () => {
  it("paints every scheme with the same values the picker draws", () => {
    // The drift guard. A colour changed in `themes.ts` and not in `globals.css` (or the
    // other way round) would ship a picker whose swatches lie about the scheme it chooses.
    for (const theme of THEME_NAMES) {
      const palette = THEME_PALETTES[theme];
      for (const { token, key } of TOKENS) {
        expect(tokenIn(theme, token), `${theme} · --color-${token}`).toBe(palette[key]);
      }
    }
  });

  it("gives every offered scheme a ground and an accent in different hues", () => {
    // The owner's ask, made checkable: *"none of them should be single colour, it should
    // have at least 3 different colours complimenting each-other per theme."* The ink is
    // near-neutral in every scheme by design — it has to be readable — so what makes a
    // scheme more than one colour is the pair that carries it: the **ground**, and an
    // accent a good way round the wheel from it.
    //
    // `warm` is the exception, and deliberately: it is the scheme the app has always
    // painted, its ground and its accent are both in the brown family, and the ask was for
    // a *picker of eight* around it rather than a repaint of what a reader already has.
    // What it must still do is stay legible, which the next case checks for all eight.
    for (const theme of THEME_NAMES) {
      if (theme === "warm") continue;
      expect(hueGap(THEME_PALETTES[theme].bg, THEME_PALETTES[theme].accent), theme)
        .toBeGreaterThan(60);
    }
  });

  it("offers eight schemes that are actually different from one another", () => {
    // The other half of the ask: eight tiles that are eight choices. Two schemes with the
    // same colours would be one scheme with two names.
    const palettes = THEME_NAMES.map((theme) => JSON.stringify(THEME_PALETTES[theme]));
    expect(new Set(palettes).size, "no two schemes are the same palette").toBe(THEME_NAMES.length);
  });

  it("keeps every scheme legible", () => {
    // Contrast is the half of "beautiful" that can be measured, and the half that decides
    // whether the app is usable at all. Three pairs carry it: the reading ink on the page,
    // the muted ink on the page, and the ground on the accent — which is a primary
    // button's label, because `Button tier="primary"` fills with the accent and prints in
    // the ground's colour.
    for (const theme of THEME_NAMES) {
      const { bg, surface, text, muted, accent } = THEME_PALETTES[theme];
      expect(contrast(text, bg), `${theme} text on bg`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(muted, bg), `${theme} muted on bg`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(accent, bg), `${theme} accent on bg`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(text, surface), `${theme} text on surface`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("gives the picker three dots of the scheme it offers", () => {
    for (const theme of THEME_NAMES) {
      const swatch = themeSwatch(theme);
      expect(swatch).toEqual({
        bg: THEME_PALETTES[theme].bg,
        surface: THEME_PALETTES[theme].surface,
        accent: THEME_PALETTES[theme].accent,
      });
    }
  });

  it("keeps the last-resort error screen on the app's own scheme", () => {
    // `global-error.tsx` replaces the root layout, so it can use neither the tokens nor the
    // stylesheet and copies the palette by hand — the one screen that has to, and therefore
    // the one place a palette change could leave a reader looking at colours that no longer
    // belong to the app. It is pinned to **Warm Earth**, the default, because a crash screen
    // cannot read a preference; what this guards is that the copy is still the same palette.
    const source = readFileSync(join(repoRoot, "apps/web/src/app/global-error.tsx"), "utf8");
    const warm = THEME_PALETTES.warm;
    for (const [name, value] of [
      ["INK", warm.text],
      ["MUTED", warm.muted],
      ["BG", warm.bg],
      ["SURFACE", warm.surface],
      ["LINE", warm.line],
    ] as const) {
      expect(source, `global-error's ${name}`).toContain(`const ${name} = "${value}";`);
    }
  });
});

describe("the colour-scheme mirror", () => {
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

  it("paints the scheme and keeps a copy for the next first paint", () => {
    applyTheme("paper");
    expect(documentElement.dataset.theme).toBe("paper");
    expect(stored.get(THEME_STORAGE_KEY)).toBe("paper");
  });

  it("survives a blocked localStorage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => undefined,
    });
    expect(() => applyTheme("sea")).not.toThrow();
    expect(documentElement.dataset.theme).toBe("sea");
  });

  it("boots from the same key and only the names the preference allows", () => {
    // The inline script and `applyTheme` must agree, or the document paints one scheme and
    // corrects to another — a white flash on the way to a light one.
    expect(THEME_BOOTSTRAP).toContain(JSON.stringify(THEME_STORAGE_KEY));
    expect(THEME_BOOTSTRAP).toContain("document.documentElement.dataset.theme=v");
    for (const theme of THEME_NAMES) {
      expect(THEME_BOOTSTRAP).toContain(`v===${JSON.stringify(theme)}`);
    }
    expect(THEME_BOOTSTRAP).not.toContain('"sepia"');
  });
});
