import type { FieldDef, FieldEntityType } from "@meditaur/domain";
import { Button, TileGrid } from "@meditaur/ui";
import { CatalogCard } from "./CatalogCard";
import { DeleteButton } from "./DeleteButton";
import { EditorChrome } from "./EditorChrome";
import { EditorField, EditorSection } from "./EditorSection";
import type { Screen } from "./library-model";

const ENTITY_TILES: { id: FieldEntityType; label: string }[] = [
  { id: "symbol", label: "Symbol" },
  { id: "focusPoint", label: "Focus point" },
];

export function FieldDefEditor({
  screen,
  deleteArmed,
  deleteImpact,
  error,
  onBack,
  onChange,
  onSave,
  onDelete,
}: {
  screen: Extract<Screen, { type: "field-def" }>;
  deleteArmed: boolean;
  /** What else the delete would take with it, while armed. */
  deleteImpact?: string | null;
  error: string | null;
  onBack: () => void;
  onChange: (def: FieldDef) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const def = screen.value;
  /**
   * The pool the field was made for, when it was made from an entity's editor.
   *
   * `returnTo` is that editor — the focus point's or the symbol's — so the pool
   * is already the one that asked for the field, and the owner's round 9 says so
   * plainly: "the field should apply to the focus point or symbol that initiated
   * the field addition". It is stated rather than asked. The tiles stay on the
   * route that has no such entity, which is the Fields tab's own `Add`, and that
   * is where a field's pool is chosen.
   */
  const pool = screen.returnTo
    ? def.entityType === "focusPoint"
      ? "Every focus point"
      : "Every symbol"
    : null;
  return (
    <EditorChrome
      title={screen.isNew ? "New field" : "Field"}
      error={error}
      onBack={onBack}
      actions={
        <Button tier="primary" size="lg" onClick={onSave}>
          Save
        </Button>
      }
    >
      <EditorSection title="Applies to">
        {pool ? (
          <p className="text-lg text-muted">{pool}. A field is shared by all of them.</p>
        ) : (
          <TileGrid
            value={def.entityType}
            onChange={(entityType) => onChange({ ...def, entityType })}
            tiles={ENTITY_TILES}
          />
        )}
      </EditorSection>
      <EditorSection title="Custom field">
        <EditorField label="Heading">
          <input
            aria-label="Field heading"
            value={def.label}
            onChange={(e) => onChange({ ...def, label: e.target.value })}
            className="min-h-16 rounded-2xl bg-surface px-4 text-2xl font-semibold text-text"
          />
        </EditorField>
        {/* The identifier this field is stored under is derived from the heading
            (`fieldKeyFor`), so the reader is asked what the field *is* instead of
            being asked to invent a slug for it — the owner's round 6. */}
        <EditorField label="Description">
          <input
            aria-label="Field description"
            value={def.description}
            onChange={(e) => onChange({ ...def, description: e.target.value })}
            className="min-h-16 rounded-2xl bg-surface px-4 text-lg text-text"
          />
        </EditorField>
      </EditorSection>
      {screen.isNew ? null : (
        <DeleteButton
          label="Delete field"
          armedLabel={`Delete ${def.label}?`}
          armed={deleteArmed}
          impact={deleteImpact}
          onClick={onDelete}
        />
      )}
    </EditorChrome>
  );
}

export function FieldsList({
  fieldDefs,
  filter,
  onFilter,
  armedId,
  deleteNotice,
  onEdit,
  onDelete,
}: {
  fieldDefs: FieldDef[];
  /** Owned by the library toolbar, which is where the Add action lives (§3.2). */
  filter: "all" | FieldEntityType;
  onFilter: (filter: "all" | FieldEntityType) => void;
  /** The card whose delete is armed, if any. */
  armedId: string | null;
  /** What the armed card's delete would take with it. */
  deleteNotice?: string | null;
  onEdit: (def: FieldDef) => void;
  onDelete: (def: FieldDef) => void;
}) {
  const shown = [...fieldDefs]
    .filter((def) => filter === "all" || def.entityType === filter)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <section className="flex flex-col gap-3">
      <TileGrid
        value={filter}
        onChange={onFilter}
        tiles={[{ id: "all", label: "All" }, ...ENTITY_TILES]}
      />
      <div className="flex flex-col gap-2">
        {shown.map((def) => (
          <CatalogCard
            key={def.id}
            title={def.label}
            subtitle={`${def.entityType === "focusPoint" ? "Focus point" : "Symbol"}${
              def.description ? ` · ${def.description}` : ""
            }`}
            onEdit={() => onEdit(def)}
            deleteArmed={armedId === def.id}
            deleteNotice={deleteNotice}
            onDelete={() => onDelete(def)}
          />
        ))}
      </div>
    </section>
  );
}
