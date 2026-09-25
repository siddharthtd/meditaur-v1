/**
 * The eight colour schemes, and what each one is called (`P2 · 46`).
 *
 * The owner's round 24: *"To increase the visual appeal, I want to allow users to use some
 * color-scheme picker so that they can update the appearance, accents, button colours,
 * background etc as per their choice. There is no need to have huge customization in this
 * area, only a pre-offered diverse 8 different themes should be good enough."*
 *
 * This module is the **vocabulary**: the names, in one list, and the words the picker shows
 * for them. The colours themselves are the app's business — `apps/web/src/lib/themes.ts`
 * holds the hexes and `apps/web/src/app/globals.css` holds the token blocks a painted
 * document reads, with a guard that the two agree — because `packages/domain` may not know
 * a CSS variable from a hex.
 *
 * **The names are stored values, not labels.** They travel to the cloud in
 * `user_preferences.theme` and the migration constrains the column to exactly this list, so
 * renaming one later is a migration rather than a copy change (`schema-unions.test.ts`
 * enforces the pair).
 *
 * The default is the scheme the app has always had, which is what makes the feature
 * harmless: a device whose row predates the field, a build with no cloud and a reader who
 * has never opened Settings all paint exactly as they did.
 */
export const THEME_NAMES = [
  "warm",
  "midnight",
  "forest",
  "copper",
  "plum",
  "paper",
  "sea",
  "sakura",
] as const;

export type ThemeName = (typeof THEME_NAMES)[number];

/** The scheme the app paints with until a reader chooses another: Warm Earth, as it was. */
export const DEFAULT_THEME: ThemeName = "warm";

/**
 * What each scheme is called, and the line under it in the picker.
 *
 * The label names the **colours** rather than the mood: a reader choosing a scheme is
 * choosing what the app will look like, and "Warm Earth" tells them more about that than
 * "Calm" would.
 */
export type ThemeInfo = {
  label: string;
  summary: string;
};

export const THEME_INFO: Readonly<Record<ThemeName, ThemeInfo>> = {
  warm: {
    label: "Warm Earth",
    summary: "The app's own scheme: near-black brown, cream ink, a sandstone accent.",
  },
  midnight: {
    label: "Midnight Indigo",
    summary: "Deep indigo ground with cool ink and a sea-green accent.",
  },
  forest: {
    label: "Forest",
    summary: "Forest-black ground with warm ink and an amber accent.",
  },
  copper: {
    label: "Slate & Copper",
    summary: "Cool slate ground with a copper accent — the one warm-on-cool pair.",
  },
  plum: {
    label: "Plum Noir",
    summary: "Aubergine ground with pale ink and a gold accent.",
  },
  paper: {
    label: "Paper",
    summary: "A light scheme: warm off-white pages with a deep teal accent.",
  },
  sea: {
    label: "Sea Glass",
    summary: "A light scheme: pale blue-grey pages with a warm coral accent.",
  },
  sakura: {
    label: "Sakura",
    summary: "A light scheme: blush pages with dark ink and a deep violet accent.",
  },
};

/**
 * Whether a scheme is a light one, for the few places that must know rather than paint.
 *
 * The picker uses it to group the eight — the three light schemes sit together, after the
 * five dark ones — and a test uses it to check that a light scheme's ink really is darker
 * than its ground.
 */
export const LIGHT_THEMES: readonly ThemeName[] = ["paper", "sea", "sakura"];

export function themeIsLight(theme: ThemeName): boolean {
  return LIGHT_THEMES.includes(theme);
}

/**
 * A stored value, read as the scheme it names.
 *
 * Anything this build does not know — a key from a version that named a scheme
 * differently, a hand-edited row, a value that is not a string — reads as the default
 * rather than as a broken screen, which is the same reading `normalizeFeatureFlags` gives
 * a sparse flags row.
 */
export function normalizeTheme(stored: unknown): ThemeName {
  return typeof stored === "string" && (THEME_NAMES as readonly string[]).includes(stored)
    ? (stored as ThemeName)
    : DEFAULT_THEME;
}
