import type { ReactNode } from "react";

/**
 * Stepper — a numeric picker for values that are not minutes and seconds
 * (Hz, gain, dB, ms), UI_DESIGN.md §1.7. Durations use `TimeWheel`, where a
 * wheel reads better than a pair of buttons.
 *
 * `size` adapts to the layout, exactly as `Button`'s does: `md` is the
 * page-level control, `sm` is the same control inside a plan block card, where
 * two 56px buttons crowd a 256px card. Both sizes stay at or above the 44px tap
 * floor — `sm` is smaller than `md`, never smaller than a fingertip.
 */
export type StepperSize = "md" | "sm";

const SIZES: Record<
  StepperSize,
  { row: string; label: string; controls: string; button: string; value: string }
> = {
  md: {
    row: "gap-4 px-4 py-3",
    label: "text-lg text-text",
    controls: "gap-3",
    button: "h-14 w-14 rounded-xl text-2xl",
    value: "min-w-20 text-xl",
  },
  sm: {
    row: "gap-2 px-2 py-2",
    label: "text-xs text-muted",
    controls: "gap-2",
    button: "h-11 w-11 rounded-xl text-xl",
    value: "min-w-10 text-lg",
  },
};

export function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  size = "md",
  format = String,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  size?: StepperSize;
  format?: (n: number) => string;
}): ReactNode {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const sizing = SIZES[size];
  return (
    <div
      className={`flex items-center justify-between rounded-2xl bg-surface ${sizing.row}`}
    >
      <span className={`truncate ${sizing.label}`}>{label}</span>
      <div className={`flex shrink-0 items-center ${sizing.controls}`}>
        <button
          type="button"
          aria-label={`decrease ${label}`}
          className={`${sizing.button} bg-surface-raised text-text transition active:scale-95 active:opacity-80`}
          onClick={() => onChange(clamp(Number((value - step).toFixed(6))))}
        >
          −
        </button>
        <span className={`text-center tabular-nums text-accent ${sizing.value}`}>
          {format(value)}
        </span>
        <button
          type="button"
          aria-label={`increase ${label}`}
          className={`${sizing.button} bg-surface-raised text-text transition active:scale-95 active:opacity-80`}
          onClick={() => onChange(clamp(Number((value + step).toFixed(6))))}
        >
          +
        </button>
      </div>
    </div>
  );
}
