import { Button, KeyHints } from "@meditaur/ui";
import { useEffect, type ReactNode } from "react";

/**
 * The shared screen shell — UI_DESIGN.md §4.
 *
 * Every screen is a top bar (back button top-left, then the title), scrollable
 * content, and an optional fixed bottom bar holding the screen's single primary
 * action. Back is always a tertiary text button; the primary action is never
 * left wherever the last content block happens to end.
 *
 * Escape goes back, on every screen built from this shell: it lives here rather
 * than in each editor so a new screen cannot forget it. It is the same thing the
 * Back button does, including leaving unsaved drafts behind.
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
      <div className="flex flex-col gap-2">
        <Button tier="tertiary" size="sm" onClick={onBack} className="-ml-3">
          Back
        </Button>
        <h1 className="text-3xl">{title}</h1>
      </div>
      <div className="flex flex-col gap-6">{children}</div>
      {error ? <p className="text-lg text-destructive">{error}</p> : null}
      {actions ? (
        <div className="sticky bottom-0 z-10 mt-auto flex flex-wrap items-center gap-3 border-t border-line bg-bg/95 py-4 backdrop-blur">
          {actions}
          {/* Every screen built from this shell is left with Escape, and the
              reader only finds that out if it is written down (the owner's
              round 5, plan-screen item 4) — beside the screen's primary action,
              in the bar that survives scrolling, which is where the run screen
              puts its own legend (the owner's round 8, library item 2). */}
          <KeyHints
            className="hidden lg:flex"
            hints={[{ keys: ["Esc"], label: "back" }]}
          />
        </div>
      ) : null}
    </main>
  );
}
