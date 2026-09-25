import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { NEUTRAL_ACCENT, accentStyle, type Accent } from "./accents.ts";

/**
 * Button — UI_DESIGN.md §1.4.
 *
 * Two orthogonal axes: `tier` is what a button *is*; `size` adapts to the
 * *layout* it sits in — compact in rows and toolbars, `lg`/`xl` only where one
 * action owns the screen. Placement is fixed by the same section: the way back is
 * the `Esc back` legend in the sticky bottom bar, beside the screen's primary action
 * (round 8's place, which round 25 restored and now guards), secondary actions sit
 * inline with their content, and destructive actions sit at the bottom of the row
 * they remove, behind an arm/confirm step.
 */
export type ButtonTier = "primary" | "secondary" | "tertiary" | "destructive";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

/**
 * Layout context decides the size; compact in rows, large only for a page CTA.
 *
 * Every metric is a literal `px`, never Tailwind's rem scale, so the whole button
 * — label, height and padding — holds its size whatever the reader's text size is
 * (the owner's round 14: "reflect the size in all the texts, not the text on the
 * button"). The measurements are the ones the app's 18px default root produced,
 * so `Medium` looks unchanged and `Small`/`XL` leave the controls in place.
 */
const SIZES: Record<ButtonSize, string> = {
  sm: "h-[40px] rounded-[14px] px-[14px] text-[16px]",
  md: "h-[50px] rounded-[14px] px-[18px] text-[18px]",
  lg: "h-[63px] rounded-[18px] px-[27px] text-[20px]",
  // Run-mode controls only: IMPLEMENTATION.md keeps those at the 64px floor.
  xl: "min-h-[72px] rounded-[18px] px-[27px] text-[20px]",
};

/**
 * The same sizes, square and without a label's padding.
 *
 * The owner's round 19, on the session screen's transport: *"make pause-skip-stop
 * buttons all of same size, no text only symbols of pause, skip, stop so that they
 * take up less space, restart should be just the circular arrow besides these
 * buttons"*. A wordless control has nothing to pad, and every one of them is the
 * same square, so a row of them lines up whatever glyphs they carry.
 *
 * The label is not dropped, only unprinted: an icon-only button is announced by its
 * `aria-label`, which the caller must pass.
 *
 * The square is set with `min-w` **and** `max-w` rather than `w`, and that is not
 * belt-and-braces: `BASE` carries `w-fit`, so a `w-[64px]` here would be the same
 * utility as the base's and the winner would be whichever Tailwind happened to emit
 * last — which is how the transport squares first came out as tall as they were wide
 * of their glyph (29px, and 18px for the `↺`). A minimum and a maximum are different
 * properties, so there is nothing left to lose to.
 */
const ICON_SIZES: Record<ButtonSize, string> = {
  sm: "h-[40px] min-w-[40px] max-w-[40px] rounded-[14px] px-0 text-[16px]",
  md: "h-[50px] min-w-[50px] max-w-[50px] rounded-[14px] px-0 text-[18px]",
  lg: "h-[63px] min-w-[63px] max-w-[63px] rounded-[18px] px-0 text-[20px]",
  // The run-mode square: `xl`'s own minimum is its label's height, so the wordless
  // transport control is the 64px floor exactly.
  xl: "h-[64px] min-w-[64px] max-w-[64px] rounded-[18px] px-0 text-[20px]",
};

const BASE =
  "inline-flex w-fit items-center justify-center gap-[9px] whitespace-nowrap transition " +
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
      className="h-[18px] w-[18px] shrink-0 fill-none stroke-current stroke-[1.5]"
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
  /** Chakra (or neutral) tint. See `accentForMeditation` in accents.ts. */
  accent?: Accent;
  /**
   * A destructive button that has been pressed once and is waiting for its
   * confirm press — the arm step in IMPLEMENTATION.md's UI rules. Idle, a
   * destructive button is an outline; armed, it is filled with a light red, and
   * the confirming press fills it dark, so the second press reads as the one
   * that does it. The caller owns the state (and its 5-second disarm).
   */
  armed?: boolean;
  /**
   * A control whose whole face is a glyph, named by its `aria-label`.
   *
   * Square, at the same height as its `size` (so it sits in a labelled row without
   * moving it), and with the label's padding removed — see {@link ICON_SIZES}.
   */
  iconOnly?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  tier = "secondary",
  size = "md",
  accent = NEUTRAL_ACCENT,
  armed = false,
  iconOnly = false,
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
      className={`${BASE} ${iconOnly ? ICON_SIZES[size] : SIZES[size]} ${tone} ${className}`.trim()}
      style={{ ...(accentStyle(accent) as CSSProperties | null), ...style }}
      {...rest}
    >
      {tier === "destructive" ? <TrashIcon /> : null}
      {children}
    </button>
  );
}
