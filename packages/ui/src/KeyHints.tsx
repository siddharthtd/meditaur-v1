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
};

export function KeyHints({
  hints,
  className = "",
}: {
  hints: KeyHint[];
  className?: string;
}): ReactNode {  if (hints.length === 0) return null;
  return (
    <ul className={`flex flex-wrap items-center gap-x-4 gap-y-1 ${className}`.trim()}>
      {hints.map((hint) => (
        <li key={`${hint.keys.join("+")}-${hint.label}`} className="flex items-center gap-1.5">
          {hint.keys.map((key) => (
            <kbd
              key={key}
              className="rounded-md border border-line bg-surface-raised px-2 py-0.5 font-sans text-xs text-text"
            >
              {key}
            </kbd>
          ))}
          <span className="text-xs text-muted">{hint.label}</span>
        </li>
      ))}
    </ul>
  );
}
