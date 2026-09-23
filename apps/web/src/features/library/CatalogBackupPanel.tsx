import { Button } from "@meditaur/ui";
import { useRef, type ChangeEvent } from "react";

/**
 * Backup and restore as a compact toolbar action — UI_DESIGN.md §3.2 step 4.
 * Export visibility is a hard guardrail: pre-accounts users have device-only
 * data, so this stays reachable from every library table, just not as a panel
 * competing with the tabs.
 *
 * Both halves are ordinary `Button`s in one row. `Restore` used to be a `<label>`
 * wrapping its own file input, and a label sitting in the page's column flex
 * stretches: it drew a full-width bordered bar under the last list, which read as
 * a divider *between* two displays rather than as an action (the owner's round
 * 14). The picker is now the button's hidden half, the same shape the Audio files
 * tab uses.
 */
export function CatalogBackupPanel({
  onDownload,
  onRestore,
}: {
  onDownload: () => void;
  onRestore: (file: File | undefined) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared so choosing the same file twice still fires.
    event.target.value = "";
    onRestore(file);
  };
  return (
    <div className="flex w-fit flex-wrap items-center gap-2">
      <Button size="sm" onClick={onDownload}>
        Download catalog
      </Button>
      <Button size="sm" onClick={() => input.current?.click()}>
        Restore catalog
      </Button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        aria-label="Restore catalog"
        // The button above *is* the control; the picker is its hidden half, so
        // it is kept out of the accessibility tree — an `input[type=file]` has
        // the `button` role, and two controls called `Restore catalog` is
        // exactly what a screen reader (and a strict locator) should not find.
        aria-hidden="true"
        tabIndex={-1}
        className="sr-only"
        onChange={choose}
      />
    </div>
  );
}
