import type { ReactNode } from "react";

/**
 * A real track-and-thumb switch — UI_DESIGN.md §1.5 — in place of the old
 * "block that changes fill colour". The name, props, and `aria-pressed` are
 * unchanged so every call site is untouched, and the outer tappable area stays
 * at the existing 64px floor even though the visual switch is smaller.
 *
 * `size` adapts to the layout like `Button`'s: `md` is the full-width row a
 * whole setting gets, `sm` is the same switch inline in a toolbar, where a
 * 64px row would be page furniture rather than an action. `sm` keeps the 44px
 * tap floor, drops the redundant On/Off word (the thumb says it), and shrinks
 * the track to match.
 */
export type LatchSize = "md" | "sm";

export function LatchButton({
  label,
  pressed,
  onChange,
  size = "md",
}: {
  label: string;
  pressed: boolean;
  onChange: (next: boolean) => void;
  size?: LatchSize;
}): ReactNode {
  const compact = size === "sm";
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      className={
        compact
          ? "flex h-11 shrink-0 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-base font-medium text-text transition active:opacity-80"
          : "flex min-h-16 w-full items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-4 py-4 text-left text-lg font-medium text-text transition active:opacity-80"
      }
    >
      <span>{label}</span>
      <span className="flex shrink-0 items-center gap-3">
        {compact ? null : (
          <span className="text-sm text-muted">{pressed ? "On" : "Off"}</span>
        )}
        <span
          aria-hidden="true"
          className={`inline-flex shrink-0 items-center rounded-full transition-colors ${
            compact ? "h-6 w-10" : "h-7 w-12"
          } ${pressed ? "bg-chakra-heart" : "bg-line"}`}
        >
          <span
            className={`inline-block rounded-full bg-text shadow transition-transform ${
              compact
                ? `h-4 w-4 ${pressed ? "translate-x-5" : "translate-x-1"}`
                : `h-5 w-5 ${pressed ? "translate-x-6" : "translate-x-1"}`
            }`}
          />
        </span>
      </span>
    </button>
  );
}
