import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { NEUTRAL_ACCENT, accentStyle, type Accent } from "./accents.ts";

/**
 * Button — UI_DESIGN.md §1.4.
 *
 * Two orthogonal axes: `tier` is what a button *is*; `size` adapts to the
 * *layout* it sits in — compact in rows and toolbars, `lg`/`xl` only where one
 * action owns the screen. Placement is fixed by the same section: back is
 * top-left and tertiary, the primary action lives in a sticky bottom bar,
 * secondary actions sit inline with their content, and destructive actions sit
 * at the bottom of the row they remove, behind an arm/confirm step.
 */
export type ButtonTier = "primary" | "secondary" | "tertiary" | "destructive";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

/** Layout context decides the size; compact in rows, large only for a page CTA. */
const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 rounded-xl px-3 text-sm",
  md: "h-11 rounded-xl px-4 text-base",
  lg: "h-14 rounded-2xl px-6 text-lg",
  // Run-mode controls only: IMPLEMENTATION.md keeps those at the 64px floor.
  xl: "min-h-16 rounded-2xl px-6 text-lg",
};

const BASE =
  "inline-flex w-fit items-center justify-center gap-2 whitespace-nowrap transition " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
  "disabled:pointer-events-none disabled:opacity-50 " +
  // A press has to be visible, or a button that works reads as one that does not:
  // these shrink and dim while held, so every control answers the finger.
  "active:scale-95 active:opacity-80";

/** Destructive actions pair the hue with a trash icon — colour alone never
 *  carries a safety-critical signal. */
function TrashIcon(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0 fill-none stroke-current stroke-[1.5]"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4M6.7 6.5v5M9.3 6.5v5" />
    </svg>
  );
}

export type ButtonProps = {
  tier?: ButtonTier;
  size?: ButtonSize;
  /** Chakra (or neutral) tint. See `accentForFocusPoint` in accents.ts. */
  accent?: Accent;
  /**
   * A destructive button that has been pressed once and is waiting for its
   * confirm press — the arm step in IMPLEMENTATION.md's UI rules. Idle, a
   * destructive button is an outline; armed, it is filled with a light red, and
   * the confirming press fills it dark, so the second press reads as the one
   * that does it. The caller owns the state (and its 5-second disarm).
   */
  armed?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  tier = "secondary",
  size = "md",
  accent = NEUTRAL_ACCENT,
  armed = false,
  className = "",
  children,
  style,
  ...rest
}: ButtonProps): ReactNode {
  const tone =
    tier === "primary"
      ? `${accent.solid} font-medium`
      : tier === "secondary"
        ? `${accent.outline} font-medium`
        : tier === "destructive"
          ? armed
            ? "border border-destructive bg-destructive/20 font-medium text-destructive " +
              "active:bg-destructive active:text-text"
            : "border border-destructive bg-transparent font-medium text-destructive"
          : "bg-transparent text-muted hover:text-text";

  return (
    <button
      type="button"
      className={`${BASE} ${SIZES[size]} ${tone} ${className}`.trim()}
      style={{ ...(accentStyle(accent) as CSSProperties | null), ...style }}
      {...rest}
    >
      {tier === "destructive" ? <TrashIcon /> : null}
      {children}
    </button>
  );
}
