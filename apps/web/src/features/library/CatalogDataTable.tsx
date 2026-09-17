import { Button, LatchButton } from "@meditaur/ui";
import { useState } from "react";
import { ImageFrame } from "./ImageFrame";
import type { LibraryColumn } from "./library-model";

export type DataCell = string | { imageSrc: string | null; alt: string };

/**
 * The per-table toolbar's column action — UI_DESIGN.md §3.2 item 3. The column
 * toggles used to sit in the page flow under the table, which pushed the table
 * around as they were used; they now open from the toolbar the table belongs to.
 *
 * The panel is a plain disclosure rather than a native popover: the project
 * bans `<select>` and keeps one interaction model, and a disclosure is
 * keyboard-reachable without extra work. It is scrollable because a workspace
 * can add many custom fields.
 */
export function LibraryColumnPicker({
  columns,
  selected,
  onToggle,
}: {
  columns: LibraryColumn[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button
        tier={open ? "primary" : "secondary"}
        size="sm"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Columns
      </Button>
      {open ? (
        <div className="absolute right-0 top-full z-20 mt-2 flex max-h-[70vh] w-64 flex-col gap-2 overflow-y-auto rounded-2xl border border-line bg-surface-raised p-3">
          {columns.map((col) => (
            <LatchButton
              key={col.key}
              label={col.label}
              pressed={selected.includes(col.key)}
              onChange={() => onToggle(col.key)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CatalogDataTable({
  columns,
  rows,
}: {
  columns: LibraryColumn[];
  rows: { id: string; cells: DataCell[]; onOpen: () => void }[];
}) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-surface">
      <table className="min-w-full text-left text-lg">
        <thead>
          <tr className="border-b border-line text-muted">
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-3 font-medium">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            // The whole row opens the entry, not just its name: a table is read
            // across, and aiming at one cell to act on the row is a smaller
            // target than the owner wants on a tablet. The first cell keeps a
            // real button so the row is still reachable from the keyboard.
            <tr
              key={row.id}
              className="cursor-pointer border-b border-line/60 active:bg-surface-raised"
              onClick={row.onOpen}
            >
              {row.cells.map((cell, index) => (
                <td key={`${row.id}-${index}`} className="px-4 py-3">
                  {typeof cell === "string" ? (
                    index === 0 ? (
                      <button
                        type="button"
                        className="text-left text-text"
                        onClick={(event) => {
                          event.stopPropagation();
                          row.onOpen();
                        }}
                      >
                        {cell}
                      </button>
                    ) : (
                      <span className="text-muted">{cell}</span>
                    )
                  ) : (
                    <ImageFrame src={cell.imageSrc} alt={cell.alt} className="h-12 w-12" />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
