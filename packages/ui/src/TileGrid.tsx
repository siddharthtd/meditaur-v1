import type { ReactNode } from "react";

type Tile<T extends string> = {
  id: T;
  label: string;
};

/**
 * TileGrid — a small fixed set of choices, no dropdown (UI_DESIGN.md §1.6).
 *
 * `md` is the default: full-width tiles in a grid, for a choice that is the
 * point of the screen. `sm` is the same choice in the compact row the rest of
 * the app uses for a control that sits *inside* a form — the owner's round 8,
 * library item 1: "the kind heading lets you choose between chakra, point and
 * custom. It doesn't need this big of buttons, bring them up to spec". Only the
 * size changes; the selected tile stays the filled accent one, and `aria-pressed`
 * (unchanged by size) is what says which one that is.
 */
export type TileGridSize = "sm" | "md";

export function TileGrid<T extends string>({
  tiles,
  value,
  onChange,
  size = "md",
}: {
  tiles: Tile<T>[];
  value?: T;
  onChange: (id: T) => void;
  size?: TileGridSize;
}): ReactNode {
  const compact = size === "sm";
  return (
    <div className={compact ? "flex flex-wrap gap-2" : "grid grid-cols-2 gap-3 sm:grid-cols-3"}>
      {tiles.map((tile) => {
        const selected = tile.id === value;
        return (
          <button
            key={tile.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(tile.id)}
            className={`${
              compact
                ? "min-h-11 rounded-xl px-3 text-base"
                : "min-h-16 rounded-2xl px-4 py-4 text-lg"
            } font-medium transition active:scale-95 active:opacity-80 ${
              selected
                ? "bg-accent text-bg"
                : "bg-surface text-text hover:bg-surface-raised"
            }`}
          >
            {tile.label}
          </button>
        );
      })}
    </div>
  );
}
