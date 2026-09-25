import { THEME_NAMES, type ThemeName } from "@meditaur/domain";

/**
 * The pre-paint mirror of `UserPreferences.theme`.
 *
 * The preference itself lives in Dexie, which is async, so the app cannot know which
 * scheme a reader chose until after hydration — and the document has to paint something
 * before that. Without this mirror every load paints Warm Earth and then jumps to the
 * reader's scheme, which on a light one is a white flash. `text-size.ts` is the same shape
 * for the same reason, and `TextSizeSync`/`ThemeSync` are its two loaders.
 *
 * Dexie stays the source of truth: this is written only by `applyTheme` below, which the
 * Settings picker and `ThemeSync` both call. A blocked `localStorage` costs the flash back
 * and nothing else.
 */
export const THEME_STORAGE_KEY = "meditaur:theme";

/** Paints the scheme and records it for the next load's first paint. */
export function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Cosmetic: a blocked store must not break the app shell.
  }
}

/**
 * The script that runs before the first paint, as a blocking inline script in `<head>`.
 *
 * Built from a literal key and the domain's own list of names, so nothing here is
 * interpolated from user input — the same rule `TEXT_SIZE_BOOTSTRAP` follows. An unknown
 * value paints nothing, which leaves the `@theme` default in place rather than inventing a
 * scheme.
 */
export const THEME_BOOTSTRAP = [
  "try{",
  `var v=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});`,
  `if(${THEME_NAMES.map((theme) => `v===${JSON.stringify(theme)}`).join("||")}){`,
  "document.documentElement.dataset.theme=v;",
  "}",
  "}catch(e){}",
].join("");
