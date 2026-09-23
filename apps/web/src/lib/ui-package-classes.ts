/**
 * Class names that only `packages/ui` writes.
 *
 * Tailwind builds this app's stylesheet from `apps/web`, and its source scan
 * does not reach the sibling `packages/ui` package — not through automatic
 * detection, not through `@source`, and not through the PostCSS plugin's
 * `base` option (all three were tried and verified against the built CSS). The
 * class strings in that package are therefore never generated, and the failure
 * is quiet: a missing `bg-chakra-heart` leaves the element with no fill, which
 * reads as a styling choice rather than a bug.
 *
 * So the tokens those components name are pinned here, in a file the scan does
 * see. Text is all Tailwind reads — none of this is imported at runtime.
 *
 * When the scan can see `packages/ui` (a Tailwind fix, or a decision to move
 * the primitives into the app), delete this file: the literals in the package
 * are the real source.
 */

/** Button — sizes and the focus ring. Every metric is a literal px, so a control
 *  keeps its size whatever the reader's text size is. The last four are the
 *  icon-only squares (`iconOnly`), which the round-19 transport uses. */
const BUTTON_SIZES =
  "h-[40px] rounded-[14px] px-[14px] text-[16px] " +
  "h-[50px] rounded-[14px] px-[18px] text-[18px] " +
  "h-[63px] rounded-[18px] px-[27px] text-[20px] " +
  "min-h-[72px] rounded-[18px] px-[27px] text-[20px] " +
  "h-[40px] min-w-[40px] max-w-[40px] rounded-[14px] px-0 text-[16px] " +
  "h-[50px] min-w-[50px] max-w-[50px] rounded-[14px] px-0 text-[18px] " +
  "h-[63px] min-w-[63px] max-w-[63px] rounded-[18px] px-0 text-[20px] " +
  "h-[64px] min-w-[64px] max-w-[64px] rounded-[18px] px-0 text-[20px]";

/** Button — base, tiers, the trash icon, and the armed destructive fill. */
const BUTTON_TIERS =
  "inline-flex w-fit items-center justify-center gap-[9px] whitespace-nowrap " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
  "disabled:pointer-events-none disabled:opacity-50 " +
  "font-medium bg-transparent text-accent hover:text-text " +
  "border border-destructive text-destructive bg-destructive/20 " +
  "active:bg-destructive active:text-text " +
  "h-[18px] w-[18px] shrink-0 fill-none stroke-current stroke-[1.5]";

/** Every control answers a press: Button, LatchButton, Stepper, TileGrid. */
const PRESS =
  "transition active:scale-95 active:opacity-80 hover:bg-surface-raised";

/** accents.ts — the neutral accent and the seven chakra tints. */
const ACCENT_TINTS =
  "bg-accent text-bg border border-accent bg-transparent text-accent ring-accent " +
  "bg-chakra-root text-text border border-chakra-root text-chakra-root ring-chakra-root " +
  "bg-chakra-hara text-bg border border-chakra-hara text-chakra-hara ring-chakra-hara " +
  "bg-chakra-solar-plexus text-bg border border-chakra-solar-plexus " +
  "text-chakra-solar-plexus ring-chakra-solar-plexus " +
  "bg-chakra-heart text-bg border border-chakra-heart text-chakra-heart ring-chakra-heart " +
  "bg-chakra-throat text-bg border border-chakra-throat text-chakra-throat ring-chakra-throat " +
  "bg-chakra-third-eye text-text border border-chakra-third-eye " +
  "text-chakra-third-eye ring-chakra-third-eye " +
  "bg-chakra-crown text-bg border border-chakra-crown text-chakra-crown ring-chakra-crown";

/** LatchButton — the track-and-thumb switch, full-width and compact. */
const SWITCH =
  "flex min-h-16 w-full items-center justify-between gap-4 rounded-2xl border border-line " +
  "bg-surface px-4 py-4 text-left text-lg font-medium text-text transition " +
  "h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-base active:opacity-80 " +
  "flex shrink-0 items-center gap-3 text-sm text-muted " +
  "inline-flex shrink-0 items-center rounded-full transition-colors " +
  "bg-chakra-heart bg-line inline-block rounded-full bg-text shadow " +
  "transition-transform h-6 w-10 h-4 w-4 translate-x-5 h-7 w-12 h-5 w-5 translate-x-6 translate-x-1";

/** PickerPage — the back button, the text bar, and the option rows. The rows
 *  truncate on purpose: the Button base is `whitespace-nowrap`, which let a
 *  long hint spill out of its row (the owner: "the text overflows and looks
 *  shabby"). */
const PICKER =
  "flex flex-col gap-4 flex items-center gap-3 min-h-14 rounded-xl bg-surface px-4 text-lg " +
  "text-text text-2xl flex flex-col gap-2 w-full justify-start py-3 text-lg " +
  "flex flex-col items-start gap-1 text-sm font-normal opacity-70 " +
  "flex items-start gap-2 min-h-14 min-w-0 flex-1 h-auto min-h-14 w-full justify-start " +
  "flex w-full min-w-0 flex-col items-start gap-1 w-full truncate text-left text-lg " +
  "text-sm font-normal text-muted text-lg text-destructive text-lg text-muted min-w-0";

/** Stepper — both sizes. The numeric picker is the one primitive that is
 *  compact inside a plan card (`size="sm"`) and page-level everywhere else. */
const STEPPER =
  "flex items-center justify-between rounded-2xl bg-surface gap-4 px-4 py-3 gap-2 px-2 py-2 " +
  "truncate text-lg text-text text-xs text-muted shrink-0 items-center gap-3 " +
  "h-14 w-14 rounded-xl text-2xl h-11 w-11 text-xl bg-surface-raised " +
  "text-center tabular-nums text-accent min-w-20 min-w-10";

/** TimeWheel — the alarm-clock minutes/seconds columns. Two sizes, each with one
 *  fixed row height: the row *is* the value, and that geometry is what keeps the
 *  two columns lined up (§1.7). */
const TIME_WHEEL =
  "flex flex-col items-center gap-1 w-11 text-2xl text-xs w-14 text-4xl text-sm " +
  "relative select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
  "pointer-events-none absolute inset-x-0 rounded-xl bg-surface-raised " +
  "time-wheel h-full w-full cursor-ns-resize snap-y snap-mandatory overflow-y-scroll overscroll-contain " +
  "flex snap-center items-center justify-center tabular-nums text-text text-muted " +
  "top-1/2 -translate-y-1/2 px-1 text-center";

/** TileGrid — a small fixed set of choices, full size (`md`) and the compact row
 *  a control inside a form uses (`sm`, the meditation's `Kind`). The two
 *  containers differ: `md` is a grid, `sm` a wrapping row. */
const TILE_GRID =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 flex flex-wrap gap-2 " +
  "min-h-16 rounded-2xl px-4 py-4 text-lg min-h-11 rounded-xl px-3 text-base font-medium";

/** KeyHints — the keyboard legend. */
const KEY_HINTS =
  "flex flex-wrap items-center gap-x-4 gap-y-1 flex items-center gap-1.5 " +
  "rounded-md border border-line bg-surface-raised px-2 py-0.5 font-sans text-xs text-text " +
  "text-xs text-muted";

export const UI_PACKAGE_CLASSES = [
  BUTTON_SIZES,
  BUTTON_TIERS,
  PRESS,
  ACCENT_TINTS,
  SWITCH,
  PICKER,
  STEPPER,
  TILE_GRID,
  TIME_WHEEL,
  KEY_HINTS,
].join(" ");
