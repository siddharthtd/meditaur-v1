import type { FocusPoint, Intention, Symbol } from "@meditaur/domain";
import { Button } from "@meditaur/ui";
import { AssociatedWith, associationLabel } from "./AssociatedWith";
import { CatalogCard } from "./CatalogCard";
import { DeleteButton } from "./DeleteButton";
import { EditorChrome } from "./EditorChrome";
import { EditorField, EditorSection } from "./EditorSection";
import {
  type AssocMode,
  type ListMode,
  type Screen,
} from "./library-model";
import { CatalogDataTable } from "./CatalogDataTable";

export function IntentionEditor({
  screen,
  focusPoints,
  symbols,
  deleteArmed,
  deleteImpact,
  error,
  onBack,
  onChange,
  onChangeMode,
  onPickFocus,
  onPickSymbol,
  onSave,
  onDelete,
}: {
  screen: Extract<Screen, { type: "intention" }>;
  focusPoints: FocusPoint[];
  symbols: Symbol[];
  deleteArmed: boolean;
  /** What else the delete would take with it, while armed. */
  deleteImpact?: string | null;
  error: string | null;
  onBack: () => void;
  onChange: (intention: Intention) => void;
  onChangeMode: (mode: AssocMode) => void;
  onPickFocus: () => void;
  onPickSymbol: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const intention = screen.value;
  return (
    <EditorChrome
      title={screen.isNew ? "New intention" : "Intention"}
      error={error}
      onBack={onBack}
      actions={
        <Button tier="primary" size="lg" onClick={onSave}>
          Save
        </Button>
      }
    >
      <EditorSection title="Details">
        <EditorField label="Text">
          <textarea
            aria-label="Intention"
            value={intention.text}
            onChange={(e) => onChange({ ...intention, text: e.target.value })}
            className="min-h-24 rounded-2xl bg-surface px-4 py-4 text-lg text-text"
          />
        </EditorField>
      </EditorSection>
      <AssociatedWith
        intention={intention}
        mode={screen.mode}
        focusPoints={focusPoints}
        symbols={symbols}
        onChangeMode={onChangeMode}
        onPickFocus={onPickFocus}
        onPickSymbol={onPickSymbol}
      />
      {screen.isNew ? null : (
        <DeleteButton
          label="Delete intention"
          armedLabel="Delete this intention?"
          armed={deleteArmed}
          impact={deleteImpact}
          onClick={onDelete}
        />
      )}
    </EditorChrome>
  );
}

export function IntentionsList({
  intentions,
  focusPoints,
  symbols,
  listMode,
  armedId,
  deleteNotice,
  onEdit,
  onDelete,
}: {
  intentions: Intention[];
  focusPoints: FocusPoint[];
  symbols: Symbol[];
  listMode: ListMode;
  /** The card whose delete is armed, if any. */
  armedId: string | null;
  /** What the armed card's delete would take with it. */
  deleteNotice?: string | null;
  onEdit: (intention: Intention) => void;
  onDelete: (intention: Intention) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {listMode === "table" ? (
        <CatalogDataTable
          columns={[
            { key: "text", label: "Text" },
            { key: "association", label: "Associated with" },
          ]}
          rows={intentions.map((row) => ({
            id: row.id,
            cells: [row.text, associationLabel(row, focusPoints, symbols)],
            onOpen: () => onEdit(row),
          }))}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {intentions.map((row) => (
            <CatalogCard
              key={row.id}
              title={row.text}
              subtitle={associationLabel(row, focusPoints, symbols)}
              onEdit={() => onEdit(row)}
              deleteArmed={armedId === row.id}
              deleteNotice={deleteNotice}
              onDelete={() => onDelete(row)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
