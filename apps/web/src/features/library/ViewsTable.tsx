import { BUILTIN_COLUMN_KEYS, BUILTIN_COLUMNS, type FieldDef, type TableView } from "@meditaur/domain";
import { Button, LatchButton, TileGrid } from "@meditaur/ui";
import { CatalogCard } from "./CatalogCard";
import { DeleteButton } from "./DeleteButton";
import { EditorChrome } from "./EditorChrome";
import { FILTER_TILES, toggleColumn, type Screen } from "./library-model";

export function TableViewEditor({
  screen,
  fieldDefs,
  deleteArmed,
  deleteImpact,
  error,
  onBack,
  onChange,
  onSave,
  onDelete,
}: {
  screen: Extract<Screen, { type: "table-view" }>;
  fieldDefs: FieldDef[];
  deleteArmed: boolean;
  /** What else the delete would take with it, while armed. */
  deleteImpact?: string | null;
  error: string | null;
  onBack: () => void;
  onChange: (view: TableView) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const view = screen.value;
  return (
    <EditorChrome
      title={screen.isNew ? "New table view" : "Table view"}
      error={error}
      onBack={onBack}
      actions={
        <Button tier="primary" size="lg" onClick={onSave}>
          Save
        </Button>
      }
    >
      <label className="flex flex-col gap-2">
        <span className="text-lg text-muted">Name</span>
        <input
          aria-label="Table view name"
          value={view.name}
          onChange={(e) => onChange({ ...view, name: e.target.value })}
          className="min-h-16 rounded-2xl bg-surface px-4 text-2xl font-semibold text-text"
        />
      </label>
      <div className="flex flex-col gap-2">
        <span className="text-lg text-muted">Rows</span>
        <TileGrid
          value={view.symbolFilter}
          onChange={(symbolFilter) => onChange({ ...view, symbolFilter })}
          tiles={FILTER_TILES}
        />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-lg text-muted">Columns</span>
        {BUILTIN_COLUMN_KEYS.map((key) => (
          <LatchButton
            key={key}
            label={BUILTIN_COLUMNS[key]}
            pressed={view.columnKeys.includes(key)}
            onChange={() => onChange({ ...view, columnKeys: toggleColumn(view.columnKeys, key) })}
          />
        ))}
        {[...fieldDefs]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((def) => (
            <LatchButton
              key={def.id}
              label={def.label}
              pressed={view.columnKeys.includes(def.key)}
              onChange={() => onChange({ ...view, columnKeys: toggleColumn(view.columnKeys, def.key) })}
            />
          ))}
      </div>
      {screen.isNew ? null : (
        <DeleteButton
          label="Delete table view"
          armedLabel={`Delete ${view.name}?`}
          armed={deleteArmed}
          impact={deleteImpact}
          onClick={onDelete}
        />
      )}
    </EditorChrome>
  );
}

export function ViewsList({
  tableViews,
  armedId,
  deleteNotice,
  onEdit,
  onDelete,
}: {
  tableViews: TableView[];
  /** The card whose delete is armed, if any. */
  armedId: string | null;
  /** What the armed card's delete would take with it. */
  deleteNotice?: string | null;
  onEdit: (view: TableView) => void;
  onDelete: (view: TableView) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {tableViews.map((view) => (
          <CatalogCard
            key={view.id}
            title={view.name}
            subtitle={`${view.columnKeys.length} columns · ${view.symbolFilter}`}
            onEdit={() => onEdit(view)}
            deleteArmed={armedId === view.id}
            deleteNotice={deleteNotice}
            onDelete={() => onDelete(view)}
          />
        ))}
      </div>
    </section>
  );
}
