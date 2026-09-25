import { KeyHints } from "@meditaur/ui";
import { useEffect } from "react";

/**
 * What a screen says when the record it was asked for is not in the store.
 *
 * Never reached by pressing anything: a bookmark, a reload or a browser history entry that
 * asks for a record the reader has since deleted — or one a `Restore catalog` replaced — which
 * is why the app empties the address as it lands. Four screens can say it: a meditation and a
 * symbol in the library, a Database record, and the binaural panel for a meditation that has
 * gone.
 *
 * The owner's round 20: *"There is no need for a separate back button, just have the Esc Back
 * directive double as a back button."* These were the one place that could not be done as
 * written, because the screen drew a `Back` button and no legend to make pressable — so the
 * legend is what it draws now, and Escape works here exactly as it does everywhere else. It is
 * the last `Back` button in the app, and there is none.
 */
export function GoneScreen({ message, onBack }: { message: string; onBack: () => void }) {
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
      <p className="text-lg">{message}</p>
      {/* The legend is in the bar, like every other screen's: a dead end is one sentence with
          nothing else on it, and the foot of the window is where a reader looks for the way out.
          `mt-auto` is what puts it there rather than under the sentence. */}
      <div className="sticky bottom-0 z-10 mt-auto flex flex-wrap items-center justify-end gap-3 border-t border-line bg-bg/95 py-4 backdrop-blur">
        <KeyHints hints={[{ keys: ["Esc"], label: "back", onPress: onBack }]} />
      </div>
    </main>
  );
}
