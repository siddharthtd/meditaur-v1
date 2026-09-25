import { KeyHints } from "@meditaur/ui";
import { useEffect, type ReactNode } from "react";

/**
 * The shared screen shell — UI_DESIGN.md §4.
 *
 * Every screen is a top bar (the way back top-left, then the title), scrollable
 * content, and an optional fixed bottom bar holding the screen's single primary
 * action. The primary action is never left wherever the last content block
 * happens to end.
 *
 * Escape goes back, on every screen built from this shell: it lives here rather
 * than in each editor so a new screen cannot forget it. It is the same thing the
 * way back does, including leaving unsaved drafts behind.
 *
 * There is **one** way back, and it is the legend itself. The owner's round 20:
 * *"There is no need for a separate back button, just have the Esc Back directive
 * double as a back button, if people want to go back, they can use that button."*
 * So the hint is a real button that does what Escape does — which is also what it
 * has to be, now that a screen with a `Back` button and an `Esc back` legend was
 * writing the same instruction twice.
 *
 * It sits in the **bottom bar, beside the screen's primary action** — the owner's round 8
 * (*"the Esc back instruction should be at the same place everywhere … it was next to the
 * save/edit button"*), which is where the run screen and the Database grid have always kept
 * theirs. The legend had drifted back up to the title line and nothing failed, because
 * `integrity.test.ts` read that each shell drew a *pressable* legend and never *where*: round 25
 * put it back and the guard now reads the place as well. The bar is drawn on every screen this
 * shell builds, action or not, because the legend lives in it.
 */
export function EditorChrome({
  title,
  error,
  onBack,
  actions,
  children,
}: {
  title: string;
  error: string | null;
  onBack: () => void;
  /** The one primary action for this screen, in the sticky bottom bar. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);
  return (
    <main className="flex min-h-[100dvh] flex-col gap-6">
      <h1 className="text-3xl">{title}</h1>
      <div className="flex flex-col gap-6">{children}</div>
      {error ? <p className="text-lg text-destructive">{error}</p> : null}
      {/* The legend and the screen's one primary action, in the bar that survives scrolling —
          the legend first so it sits beside the action, the way the Database's own bar draws it.
          A screen with no `actions` still gets the bar: the way back is not optional. */}
      <div className="sticky bottom-0 z-10 mt-auto flex flex-wrap items-center justify-end gap-3 border-t border-line bg-bg/95 py-4 backdrop-blur">
        <KeyHints hints={[{ keys: ["Esc"], label: "back", onPress: onBack }]} />
        {actions}
      </div>
    </main>
  );
}
