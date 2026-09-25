import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "./Button.tsx";
import { KeyHints } from "./KeyHints.tsx";

/** Enter takes the typed name — say so, beside the action it belongs to. */
const PICKER_KEYS = [{ keys: ["Enter"], label: "choose" }];

export type PickerItem = {
  id: string;
  label: string;
  hint?: string;
};

/**
 * PickerPage — the one way the app asks "which one?".
 *
 * The owner's fourth review, library item 9: "I'd have a text bar there which
 * allows you to choose from the available options and filters automatically. If
 * invalid input is entered, don't save the selection, rather send an error
 * message." So the text bar is the control, not a filter bolted on top of a
 * list:
 *
 * - typing filters the options as you go (against the hint too, so a symbol can
 *   be found by where it is used);
 * - `Choose`, or Enter, commits what you typed — an exact name, or the single
 *   remaining option when the filter has narrowed to one;
 * - a name that matches nothing **chooses nothing** and says so, because
 *   accepting a typo would silently point an intention at the wrong symbol;
 * - the list stays, so the picker still works when the name cannot be recalled.
 *
 * Long labels and hints are the other half of that item ("the text overflows and
 * looks shabby"): every row truncates to its own width. The button's base
 * carries `whitespace-nowrap`, so without that a symbol's usage preview spills
 * out of the row it belongs to.
 */
export function PickerPage({
  title,
  items,
  selectedId,
  onSelect,
  onBack,
  multi,
}: {
  title: string;
  items: PickerItem[];
  selectedId?: string;
  /** The single pick's answer. A set picker carries `multi` instead. */
  onSelect?: (id: string) => void;
  onBack?: () => void;
  /**
   * Given, the page is a **set picker** rather than a choice.
   *
   * The owner's round 22: a point block clubs several points into one pass, so "which one?"
   * has no single answer and the block's field is a **set**. Every row becomes a switch that
   * toggles in place and `Done` is the one action — the typed bar stays as a filter, and
   * `Choose` and its error path are the single-pick page's, so neither is drawn here.
   */
  multi?: {
    selected: string[];
    onToggle: (id: string) => void;
    onDone: () => void;
  };
}): ReactNode {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const typed = query.trim();
  const filtered = useMemo(() => {
    const q = typed.toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) || (item.hint ?? "").toLowerCase().includes(q),
    );
  }, [items, typed]);
  // Escape is the universal way back (IMPLEMENTATION.md's UI rules), so the
  // picker draws it as a control of its own rather than leaving it to a keyboard.
  useEffect(() => {
    if (!onBack) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  const choose = () => {
    if (!typed) {
      setError("Type a name, or press one of the options below.");
      return;
    }
    const exact = items.find((item) => item.label.toLowerCase() === typed.toLowerCase());
    const only = filtered.length === 1 ? filtered[0] : undefined;
    const chosen = exact ?? only;
    if (!chosen) {
      setError(`Nothing matches “${typed}”, so nothing was chosen.`);
      return;
    }
    onSelect?.(chosen.id);
  };
  return (
    <div className="flex min-h-[100dvh] flex-col gap-4">
      <h1 className="text-2xl">{title}</h1>
      <form
        className="flex items-start gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          // A set picker commits nothing from the bar: the bar narrows the list and
          // nothing else, and every press on a row is already the answer.
          if (!multi) choose();
        }}
      >
        <input
          aria-label={`${title} picker`}
          placeholder={multi ? "Filter by name" : "Type a name"}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setError(null);
          }}
          className="min-h-14 min-w-0 flex-1 rounded-xl bg-surface px-4 text-lg text-text"
        />
        {/* Beside the picker's own primary action, which is where every other
            screen keeps its key legend (the owner's round 8, library item 2). */}
        <KeyHints
          className="hidden lg:flex"
          hints={multi ? [{ keys: ["Enter"], label: "filter" }] : PICKER_KEYS}
        />
      </form>
      {error ? <p className="text-lg text-destructive">{error}</p> : null}
      <ul className="flex flex-col gap-2">
        {filtered.map((item) => {
          const on = multi ? multi.selected.includes(item.id) : item.id === selectedId;
          return (
            <li key={item.id} className="min-w-0">
              <Button
                tier={on ? "primary" : "secondary"}
                aria-pressed={multi ? on : undefined}
                onClick={() => (multi ? multi.onToggle(item.id) : onSelect?.(item.id))}
                className="h-auto min-h-14 w-full justify-start py-3"
              >
                <span className="flex w-full min-w-0 flex-col items-start gap-1">
                  <span className="w-full truncate text-left text-lg text-text">{item.label}</span>
                  {item.hint ? (
                    <span className="w-full truncate text-left text-sm font-normal text-muted">
                      {item.hint}
                    </span>
                  ) : null}
                </span>
              </Button>
            </li>
          );
        })}
      </ul>
      {filtered.length === 0 && !error ? (
        <p className="text-lg text-muted">Nothing matches “{typed}”.</p>
      ) : null}
      {/* One bar, holding the way back and the picker's own action, which is where every other
          screen keeps them (the owner's round 8, restored for the picker in round 25: it used to
          be the exception, with the legend in the title's row and `Choose` in the text bar).
          `Choose` is no longer the form's submit, and it does not need to be: the form still
          commits on `Enter`, and both paths run `choose`. */}
      <div className="sticky bottom-0 z-10 mt-auto flex flex-wrap items-center justify-end gap-3 border-t border-line bg-bg/95 py-4 backdrop-blur">
        {onBack ? (
          <KeyHints hints={[{ keys: ["Esc"], label: "back", onPress: onBack }]} />
        ) : null}
        {multi ? (
          <>
            <p className="mr-auto text-sm text-muted">
              {multi.selected.length === 0
                ? "This block runs nothing yet."
                : `${multi.selected.length} chosen.`}
            </p>
            <Button tier="primary" size="lg" onClick={multi.onDone}>
              Done
            </Button>
          </>
        ) : (
          <Button tier="primary" size="lg" onClick={choose}>
            Choose
          </Button>
        )}
      </div>
    </div>
  );
}
