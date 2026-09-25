import type { ReactNode } from "react";

/**
 * KeyHints — the keyboard legend, in one shape everywhere.
 *
 * The owner's round 5, plan-screen item 4: "All the places where Esc is going to
 * enable going back, state it on the page like you do inside the one-time chakra
 * meditation view (Space pause -> skip Esc end), also while we are at it, can you
 * do a better job at representing this information? what is the arrow button
 * supposed to be?" The old line — `Space pause · → skip · Esc end` — read as a
 * sentence with a mystery glyph in it, and it promised `→ skip` on a screen where
 * skipping was a no-op.
 *
 * So the keys are drawn as keys (a bordered cap, the way a keyboard's own
 * legends are printed), each with one plain label after it, and a caller passes
 * **only the keys that do something right now**. A hint that lies is worse than
 * no hint.
 */
export type KeyHint = {
  /** The caps to draw, e.g. `["Esc"]`, or `["Shift", "Space"]` for a chord. */
  keys: string[];
  /** What the keys do, in the reader's words — `back`, `skip`, `end the session`. */
  label: string;
  /**
   * Given, the legend is a control as well as a legend: pressing it does exactly
   * what the keys do.
   *
   * The owner's round 20 removed the separate `Back` button — *"there is no need
   * for a separate back button, just have the Esc Back directive double as a back
   * button, if people want to go back, they can use that button"* — so on those
   * screens the written-down key **is** the way back, and it works without a
   * keyboard. It is one control, not two, because a screen that says "Esc back"
   * next to a `Back` button is saying the same thing twice.
   */
  onPress?: () => void;
};

/** A key cap at rest: the bordered cap, the way a keyboard prints its legends. */
const CAP =
  "rounded-md border border-line bg-surface-raised px-2 py-0.5 font-sans text-xs text-text";

/**
 * A cap inside a control drops its own border: the control's outline is the one
 * the reader is meant to read as pressable, and two nested rectangles read as a
 * mistake rather than as a key inside a button.
 */
const CAP_IN_CONTROL = "rounded-md bg-surface-raised px-2 py-0.5 font-sans text-xs text-text";

/** The pressable legend — the shape of a `tertiary` button, made of the key. */
const CONTROL =
  "flex items-center gap-1.5 rounded-[14px] border border-line bg-surface px-3 py-1.5 transition " +
  "hover:bg-surface-raised active:scale-95 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function KeyHints({
  hints,
  className = "",
}: {
  hints: KeyHint[];
  className?: string;
}): ReactNode {
  if (hints.length === 0) return null;
  return (
    <ul className={`flex flex-wrap items-center gap-x-4 gap-y-1 ${className}`.trim()}>
      {hints.map((hint) => {
        const caps = hint.keys.map((key) => (
          <kbd key={key} className={hint.onPress ? CAP_IN_CONTROL : CAP}>
            {key}
          </kbd>
        ));
        const label = <span className="text-xs text-muted">{hint.label}</span>;
        return (
          <li
            key={`${hint.keys.join("+")}-${hint.label}`}
            className="flex items-center gap-1.5"
          >
            {hint.onPress ? (
              // The caps and the label are the button's own content, so its
              // accessible name is exactly what is written — "Esc back".
              <button type="button" onClick={hint.onPress} className={CONTROL}>
                {caps}
                {label}
              </button>
            ) : (
              <>
                {caps}
                {label}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
