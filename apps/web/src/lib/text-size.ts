import type { UserPreferences } from "@meditaur/domain";

/**
 * The pre-paint mirror of `UserPreferences.textSize`.
 *
 * The preference itself lives in Dexie, which is async, so the app cannot know
 * the reader's text size until after hydration — and the root layout has to
 * paint something before that. Without this mirror the document rendered at the
 * default size and then jumped, which reads as a flash on every load.
 *
 * Dexie stays the source of truth: this is written only by `applyTextSize`
 * below, which is called from the settings screen and from `TextSizeSync` on
 * every load. A blocked `localStorage` costs the flash back, nothing else.
 */
export const TEXT_SIZE_STORAGE_KEY = "meditaur:textSize";

const TEXT_SIZES: readonly UserPreferences["textSize"][] = ["md", "lg", "xl"];

/** Paints the preference and records it for the next load's first paint. */
export function applyTextSize(size: UserPreferences["textSize"]): void {
  document.documentElement.dataset.textSize = size;
  try {
    localStorage.setItem(TEXT_SIZE_STORAGE_KEY, size);
  } catch {
    // Cosmetic: a blocked store must not break the app shell.
  }
}

/**
 * The script that runs before the first paint, as a blocking inline script in
 * `<head>`. Next offers no hook for "read storage before hydration", and this is
 * the same approach the theme pickers use.
 *
 * It is built from a literal key and a literal size list, so nothing here is
 * interpolated from user input.
 */
export const TEXT_SIZE_BOOTSTRAP = [
  "try{",
  `var v=localStorage.getItem(${JSON.stringify(TEXT_SIZE_STORAGE_KEY)});`,
  `if(${TEXT_SIZES.map((size) => `v===${JSON.stringify(size)}`).join("||")}){`,
  "document.documentElement.dataset.textSize=v;",
  "}",
  "}catch(e){}",
].join("");
