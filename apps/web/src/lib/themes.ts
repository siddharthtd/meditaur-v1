import { THEME_NAMES, type ThemeName } from "@meditaur/domain";

/**
 * The eight colour schemes, as the hexes each one paints (`P2 · 46`).
 *
 * The domain owns the **names** (`packages/domain/src/themes.ts`: the list, the labels and
 * which ones are light), because a name is a stored value. The colours are here, because
 * they are the app's, and this module is read twice: `apps/web/src/app/globals.css` holds
 * the same values as CSS custom properties (the document has to paint before React runs,
 * and a hex cannot travel from TypeScript into a stylesheet), and the Settings picker draws
 * each scheme's three dots from this record.
 *
 * **Two homes for one palette is a drift waiting to happen, so a guard reads both**:
 * `tests/unit/web/themes.test.ts` compares every value below with the CSS token blocks and
 * fails if they disagree. Change a colour here and the test tells you which block in
 * `globals.css` still says the old one.
 *
 * Each scheme is a family of at least three hues rather than one colour at three
 * brightnesses — the owner's ask was *"none of them should be single colour, it should have
 * at least 3 different colours complimenting each-other per theme"* — so the ground, the ink
 * and the accent are chosen to sit next to each other without matching, and `muted` and
 * `line` are tuned toward the family's own temperature.
 */
export type ThemePalette = {
  /** The page. */
  bg: string;
  /** Cards, rows and sections. */
  surface: string;
  /** Nested content inside a card. */
  raised: string;
  /** Primary reading ink. */
  text: string;
  /** Labels and secondary text. */
  muted: string;
  /** Hairlines and borders. */
  line: string;
  /** The filled/outlined tint: buttons, selection, rings, the scrollbar. */
  accent: string;
};

export const THEME_PALETTES: Readonly<Record<ThemeName, ThemePalette>> = {
  // The app's own scheme, unchanged: `@theme` in globals.css carries these very values as
  // the document's default, so a reader who has never opened Settings paints Warm Earth.
  warm: {
    bg: "#17120d",
    surface: "#241c16",
    raised: "#2f251d",
    text: "#f3e9d6",
    muted: "#a89a86",
    line: "#3b2f24",
    accent: "#d8c9a8",
  },
  midnight: {
    bg: "#0e1020",
    surface: "#171a2e",
    raised: "#202442",
    text: "#eaeaf2",
    muted: "#a9aab8",
    line: "#2c3253",
    accent: "#4fbfa0",
  },
  forest: {
    bg: "#0f1511",
    surface: "#18211a",
    raised: "#202b22",
    text: "#eceee6",
    muted: "#b3ac9c",
    line: "#2c3b30",
    accent: "#d9a24a",
  },
  copper: {
    bg: "#12161b",
    surface: "#1b2027",
    raised: "#242b34",
    text: "#e9edf2",
    muted: "#a3adb8",
    line: "#2d343e",
    accent: "#d0834f",
  },
  plum: {
    bg: "#140d17",
    surface: "#1e1424",
    raised: "#281b30",
    text: "#f0eaf3",
    muted: "#b5a8bd",
    line: "#33243c",
    accent: "#e0bb52",
  },
  paper: {
    bg: "#f6f1e7",
    surface: "#fffdf8",
    raised: "#efe6d6",
    text: "#2a2118",
    muted: "#6b5c4a",
    line: "#d9ccb6",
    accent: "#2f6f86",
  },
  sea: {
    bg: "#eef3f5",
    surface: "#fbfdfe",
    raised: "#dfeaee",
    text: "#16232a",
    muted: "#4e6570",
    line: "#c2d5dc",
    accent: "#a34c38",
  },
  sakura: {
    bg: "#faf0f1",
    surface: "#fffbfb",
    raised: "#f6e3e6",
    text: "#2b1d20",
    muted: "#6d5357",
    line: "#e4c9ce",
    accent: "#5b4fa8",
  },
};

/** The dots a picker draws for a scheme: its ground, its surface and its accent. */
export function themeSwatch(theme: ThemeName): { bg: string; surface: string; accent: string } {
  const palette = THEME_PALETTES[theme];
  return { bg: palette.bg, surface: palette.surface, accent: palette.accent };
}

/** Every scheme, in the order the picker offers them: the app's, the darks, the lights. */
export const THEME_ORDER: readonly ThemeName[] = THEME_NAMES;
