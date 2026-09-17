import { Button } from "@meditaur/ui";

/**
 * Backup and restore as a compact toolbar action — UI_DESIGN.md §3.2 step 4.
 * Export visibility is a hard guardrail: pre-accounts users have device-only
 * data, so this stays reachable from every library table, just not as a panel
 * competing with the tabs.
 */
export function CatalogBackupPanel({
  onDownload,
  onRestore,
}: {
  onDownload: () => void;
  onRestore: (file: File | undefined) => void;
}) {
  return (
    <>
      <Button size="sm" onClick={onDownload}>
        Download catalog
      </Button>
      <label className="inline-flex h-9 cursor-pointer items-center rounded-xl border border-line px-3 text-sm text-muted">
        Restore catalog
        <input
          type="file"
          accept="application/json,.json"
          aria-label="Restore catalog"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            onRestore(file);
          }}
        />
      </label>
    </>
  );
}
