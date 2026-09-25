"use client";

import { themeSwatch } from "@/lib/themes";
import { THEME_INFO, THEME_NAMES, type ThemeName } from "@meditaur/domain";
import type { ReactNode } from "react";

/**
 * The eight colour schemes, as eight pressable tiles (`P2 · 46`).
 *
 * Not a `TileGrid`: that control is a row of words for a fixed few choices, and this one has
 * to show **colour** — a scheme named "Sea Glass" means nothing until you see it. Each tile
 * draws three dots of its own palette (ground, surface, accent) over a patch of its ground,
 * so the choice is visual rather than verbal, and it carries `aria-pressed` so the selected
 * one is not signalled by colour alone.
 *
 * The tile reads its hexes from `THEME_PALETTES` (`@/lib/themes`), which is the palette's
 * declared home — this is the one component allowed to paint a raw hex, and it paints the
 * values rather than spelling them. Everything else on the screen uses the token classes,
 * which is why one `data-theme` swap repaints the tile's own border and label too.
 *
 * A press applies at once — `applyTheme` writes the attribute, so the preview *is* the app —
 * and the caller saves it like any other preference.
 */
export function ThemePicker({
  value,
  onChange,
}: {
  value: ThemeName;
  onChange: (next: ThemeName) => void;
}): ReactNode {
  return (
    <div
      role="group"
      aria-label="Colour scheme"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      {THEME_NAMES.map((theme) => {
        const swatch = themeSwatch(theme);
        const info = THEME_INFO[theme];
        const selected = theme === value;
        return (
          <button
            key={theme}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(theme)}
            className={`flex flex-col gap-2 rounded-2xl border p-3 text-left transition active:scale-95 ${
              selected ? "border-accent bg-surface-raised" : "border-line bg-surface"
            }`}
          >
            <span
              aria-hidden="true"
              className="flex items-center gap-2 rounded-xl p-2"
              style={{ background: swatch.bg }}
            >
              <span className="h-5 w-5 rounded-full" style={{ background: swatch.surface }} />
              <span className="h-5 w-5 rounded-full" style={{ background: swatch.accent }} />
            </span>
            <span className="text-base font-medium text-text">{info.label}</span>
            <span className="text-sm text-muted">{info.summary}</span>
          </button>
        );
      })}
    </div>
  );
}
