import { app } from "@/composition";
import { NONE_PICK_ID } from "@meditaur/application";
import type {
  BinauralPreset,
  FieldDef,
  FieldValue,
  FocusPoint,
  FocusSymbolBinding,
  Intention,
  Symbol,
} from "@meditaur/domain";
import { Button, PickerPage, TileGrid, accentForFocusPoint, accentStyle } from "@meditaur/ui";
import { DurationSteppers } from "../DurationSteppers";
import { CatalogCard } from "./CatalogCard";
import { CatalogDataTable, type DataCell } from "./CatalogDataTable";
import { DeleteButton } from "./DeleteButton";
import { EditorChrome } from "./EditorChrome";
import { CustomFields, EditorField, EditorSection, type FieldDelete } from "./EditorSection";
import { FocusManage } from "./FocusManage";
import { ImageFrame } from "./ImageFrame";
import {
  FOCUS_BUILTIN_COLUMNS,
  KIND_TILES,
  poolColumns,
  resolveColumns,
  sortSymbolsForPicker,
  SYMBOL_BUILTIN_COLUMNS,
  type ListMode,
  type Screen,
} from "./library-model";

export function FocusPresetPicker({
  screen,
  presets,
  onBack,
  onSelect,
}: {
  screen: Extract<Screen, { type: "pick-focus-preset" }>;
  presets: BinauralPreset[];
  onBack: () => void;
  onSelect: (id: string) => void;
}) {
  const focus = screen.value;
  return (
    <main>
      <PickerPage
        title="Default sound"
        items={[
          { id: NONE_PICK_ID, label: "None" },
          ...presets.map((p) => ({ id: p.id, label: p.name })),
        ]}
        selectedId={focus.defaultBinauralPresetId ?? NONE_PICK_ID}
        onBack={onBack}
        onSelect={onSelect}
      />
    </main>
  );
}

export function FocusPicker({
  focusPoints,
  onBack,
  onSelect,
}: {
  focusPoints: FocusPoint[];
  onBack: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <main>
      <PickerPage
        title="Focus point"
        items={focusPoints.map((fp) => ({
          id: fp.id,
          label: fp.name,
          hint: fp.locationText,
        }))}
        onBack={onBack}
        onSelect={onSelect}
      />
    </main>
  );
}

export function FocusEditor({
  screen,
  presets,
  symbols,
  bindings,
  intentions,
  fieldDefs,
  fieldDrafts,
  fieldDelete,
  symbolImageUrls,
  representationUrl,
  deleteArmed,
  deleteImpact,
  error,
  onBack,
  onChange,
  onPickPreset,
  onUploadRepresentation,
  onAttachSymbol,
  onUnbind,
  onReorderSymbols,
  onOpenIntention,
  onAddIntention,
  onDeleteIntention,
  onReorderIntentions,
  onDraftChange,
  onSaveFields,
  onAddField,
  onToggleBinaural,
  onOpenBinaural,
  onSave,
  onDelete,
}: {
  screen: Extract<Screen, { type: "focus" }>;
  presets: BinauralPreset[];
  symbols: Symbol[];
  bindings: FocusSymbolBinding[];
  intentions: Intention[];
  fieldDefs: FieldDef[];
  fieldDrafts: Record<string, string>;
  /** The two-press delete each custom field carries on its heading line. */
  fieldDelete: FieldDelete;
  symbolImageUrls: Record<string, string>;
  representationUrl: string | null;
  deleteArmed: boolean;
  /** What else the delete would take with it, while armed. */
  deleteImpact?: string | null;
  error: string | null;
  onBack: () => void;
  onChange: (focus: FocusPoint) => void;
  onPickPreset: () => void;
  onUploadRepresentation: (file: File | undefined) => void;
  onAttachSymbol: () => void;
  onUnbind: (symbolId: string) => void;
  onReorderSymbols: (symbolIds: string[]) => void;
  onOpenIntention: (intention: Intention) => void;
  onAddIntention: () => void;
  onDeleteIntention: (intention: Intention) => void;
  onReorderIntentions: (intentionIds: string[]) => void;
  onDraftChange: (fieldDefId: string, text: string) => void;
  onSaveFields: () => void;
  onAddField: () => void;
  onToggleBinaural: (enabled: boolean) => void;
  onOpenBinaural: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const focus = screen.value;
  const showChakra = focus.kind === "chakra";
  const presetName = presets.find((p) => p.id === focus.defaultBinauralPresetId)?.name ?? "None";
  return (
    <EditorChrome
      title={screen.isNew ? "New focus point" : "Focus point"}
      error={error}
      onBack={onBack}
      actions={
        <Button tier="primary" size="lg" onClick={onSave}>
          Save
        </Button>
      }
    >
      <EditorSection title="Details">
        <div className="flex flex-col gap-2">
          <span className="text-lg text-muted">Kind</span>
          {/* `sm`: three fixed choices inside a form are a control, not the
              screen's point — the owner's round 8, library item 1. */}
          <TileGrid
            value={focus.kind}
            onChange={(kind) => onChange({ ...focus, kind })}
            tiles={KIND_TILES}
            size="sm"
          />
        </div>
        <EditorField label="Name">
          <input
            aria-label="Focus name"
            value={focus.name}
            onChange={(e) => onChange({ ...focus, name: e.target.value })}
            className="min-h-16 rounded-2xl bg-surface px-4 text-2xl font-semibold text-text"
          />
        </EditorField>
        <EditorField label="Location">
          <input
            aria-label="Location"
            value={focus.locationText}
            onChange={(e) => onChange({ ...focus, locationText: e.target.value })}
            className="min-h-16 rounded-2xl bg-surface px-4 text-lg text-text"
          />
        </EditorField>
        <div className="flex flex-col gap-2">
          <span className="text-lg text-muted">Default duration</span>
          <DurationSteppers
            durationMs={focus.defaultDurationMs}
            onChange={(defaultDurationMs) => onChange({ ...focus, defaultDurationMs })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-lg text-muted">Default sound</span>
          <Button
            size="sm"
            accent={accentForFocusPoint(focus)}
            aria-label="Default sound"
            className="w-full justify-start"
            onClick={onPickPreset}
          >
            {presets.find((p) => p.id === focus.defaultBinauralPresetId)?.name ?? "None"}
          </Button>
        </div>
      </EditorSection>
      {showChakra ? (
        <EditorSection title="Chakra">
          <EditorField label="Description">
            <textarea
              aria-label="Description"
              value={focus.description ?? ""}
              onChange={(e) => onChange({ ...focus, description: e.target.value || null })}
              className="min-h-24 rounded-2xl bg-surface px-4 py-4 text-lg text-text"
            />
          </EditorField>
          <EditorField label="Governs">
            <input
              aria-label="Governs"
              value={focus.governs ?? ""}
              onChange={(e) => onChange({ ...focus, governs: e.target.value || null })}
              className="min-h-16 rounded-2xl bg-surface px-4 text-lg text-text"
            />
          </EditorField>
          <EditorField label="Colour">
            <input
              aria-label="Colour"
              value={focus.colour ?? ""}
              onChange={(e) => onChange({ ...focus, colour: e.target.value || null })}
              className="min-h-16 rounded-2xl bg-surface px-4 text-lg text-text"
            />
          </EditorField>
          <EditorField label="Element">
            <input
              aria-label="Element"
              value={focus.element ?? ""}
              onChange={(e) => onChange({ ...focus, element: e.target.value || null })}
              className="min-h-16 rounded-2xl bg-surface px-4 text-lg text-text"
            />
          </EditorField>
          <div className="flex flex-col gap-2">
            <span className="text-lg text-muted">Representation</span>
            <ImageFrame
              src={representationUrl}
              alt="Representation"
              className={`ring-2 ${accentForFocusPoint(focus).ring}`}
              style={accentStyle(accentForFocusPoint(focus)) ?? undefined}
            />
            <input
              aria-label="Representation image"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => onUploadRepresentation(e.target.files?.[0])}
            />
            <input
              aria-label="Representation description"
              value={focus.representationDescription ?? ""}
              onChange={(e) =>
                onChange({ ...focus, representationDescription: e.target.value || null })
              }
              placeholder="Representation description"
              className="min-h-16 rounded-2xl bg-surface px-4 text-lg text-text"
            />
          </div>
        </EditorSection>
      ) : null}
      {screen.isNew ? null : (
        <FocusManage
          focus={focus}
          symbols={symbols}
          bindings={bindings}
          intentions={intentions}
          fieldDefs={fieldDefs}
          fieldDrafts={fieldDrafts}
          fieldDelete={fieldDelete}
          symbolImageUrls={symbolImageUrls}
          presetName={presetName}
          onAttachSymbol={onAttachSymbol}
          onUnbind={onUnbind}
          onReorderSymbols={onReorderSymbols}
          onOpenIntention={onOpenIntention}
          onAddIntention={onAddIntention}
          onDeleteIntention={onDeleteIntention}
          onReorderIntentions={onReorderIntentions}
          onDraftChange={onDraftChange}
          onSaveFields={onSaveFields}
          onAddField={onAddField}
          onToggleBinaural={onToggleBinaural}
          onOpenBinaural={onOpenBinaural}
        />
      )}
      {screen.isNew ? null : (
        <DeleteButton
          label="Delete focus point"
          armedLabel={`Delete ${focus.name}?`}
          armed={deleteArmed}
          impact={deleteImpact}
          onClick={onDelete}
        />
      )}
    </EditorChrome>
  );
}

export function SymbolEditor({
  screen,
  fieldDefs,
  fieldDrafts,
  fieldDelete,
  imageUrl,
  deleteArmed,
  deleteImpact,
  error,
  onBack,
  onChange,
  onDraftChange,
  onUploadImage,
  onAddField,
  onSaveFields,
  onSave,
  onDelete,
}: {
  screen: Extract<Screen, { type: "symbol" }>;
  fieldDefs: FieldDef[];
  fieldDrafts: Record<string, string>;
  /** The two-press delete each custom field carries on its heading line. */
  fieldDelete: FieldDelete;
  imageUrl: string | null;
  deleteArmed: boolean;
  /** What else the delete would take with it, while armed. */
  deleteImpact?: string | null;
  error: string | null;
  onBack: () => void;
  onChange: (symbol: Symbol) => void;
  onDraftChange: (fieldDefId: string, text: string) => void;
  onUploadImage: (file: File | undefined) => void;
  onAddField: () => void;
  onSaveFields: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const symbol = screen.value;
  const symbolFields = [...fieldDefs]
    .filter((d) => d.entityType === "symbol")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <EditorChrome
      title={screen.isNew ? "New symbol" : "Symbol"}
      error={error}
      onBack={onBack}
      actions={
        <Button tier="primary" size="lg" onClick={onSave}>
          Save
        </Button>
      }
    >
      <EditorSection title="Details">
        <EditorField label="Name">
          <input
            aria-label="Symbol name"
            value={symbol.name}
            onChange={(e) => onChange({ ...symbol, name: e.target.value })}
            className="min-h-16 rounded-2xl bg-surface px-4 text-2xl font-semibold text-text"
          />
        </EditorField>
        <EditorField label="Image">
          <ImageFrame src={imageUrl} alt={symbol.name || "Symbol"} />
          <input
            aria-label="Symbol image"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => onUploadImage(e.target.files?.[0])}
          />
        </EditorField>
        <EditorField label="Description">
          <input
            aria-label="Description"
            value={symbol.description}
            onChange={(e) => onChange({ ...symbol, description: e.target.value })}
            className="min-h-16 rounded-2xl bg-surface px-4 text-lg text-text"
          />
        </EditorField>
        <EditorField label="Usage">
          <input
            aria-label="Usage"
            value={symbol.usage}
            onChange={(e) => onChange({ ...symbol, usage: e.target.value })}
            className="min-h-16 rounded-2xl bg-surface px-4 text-lg text-text"
          />
        </EditorField>
      </EditorSection>
      {/* The symbol's editor had no custom fields at all, while its read-only
          view listed them — the owner's round 6. It is the focus point's
          section, and the focus point's "Add custom fields" button. */}
      <CustomFields
        defs={symbolFields}
        drafts={fieldDrafts}
        onDraftChange={onDraftChange}
        onAdd={onAddField}
        onSave={onSaveFields}
        fieldDelete={fieldDelete}
      />
      {screen.isNew ? null : (
        <DeleteButton
          label="Delete symbol"
          armedLabel={`Delete ${symbol.name}?`}
          armed={deleteArmed}
          impact={deleteImpact}
          onClick={onDelete}
        />
      )}
    </EditorChrome>
  );
}

export function FocusList({
  focusPoints,
  bindings,
  fieldDefs,
  fieldValues,
  imageUrls,
  columnKeys,
  listMode,
  armedId,
  deleteNotice,
  onOpenSheet,
  onEditFocus,
  onDeleteFocus,
}: {
  focusPoints: FocusPoint[];
  bindings: FocusSymbolBinding[];
  fieldDefs: FieldDef[];
  fieldValues: FieldValue[];
  imageUrls: Record<string, string>;
  columnKeys: string[] | null;
  listMode: ListMode;
  /** The card whose delete is armed, if any. */
  armedId: string | null;
  /** What the armed card's delete would take with it. */
  deleteNotice?: string | null;
  onOpenSheet: (focus: FocusPoint) => void;
  onEditFocus: (focus: FocusPoint) => void;
  onDeleteFocus: (focus: FocusPoint) => void;
}) {
  const symbolCount = (focusId: string) =>
    bindings.filter((row) => row.focusPointId === focusId).length;
  const focusDefs = [...fieldDefs]
    .filter((def) => def.entityType === "focusPoint")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const available = poolColumns(FOCUS_BUILTIN_COLUMNS, fieldDefs, "focusPoint");
  const selected = resolveColumns(columnKeys, available.map((col) => col.key));
  const shown = available.filter((col) => selected.includes(col.key));
  const cellFor = (focus: FocusPoint, key: string): DataCell => {
    if (key === "name") return focus.name;
    if (key === "image") return { imageSrc: imageUrls[focus.id] ?? null, alt: focus.name };
    if (key === "kind") return focus.kind;
    if (key === "location") return focus.locationText;
    if (key === "symbols") return String(symbolCount(focus.id));
    const def = focusDefs.find((row) => row.key === key);
    if (!def) return "";
    return (
      fieldValues.find((row) => row.entityId === focus.id && row.fieldDefId === def.id)?.text ?? ""
    );
  };
  return (
    <section className="flex flex-col gap-3">
      {listMode === "table" ? (
        <>
          <CatalogDataTable
            columns={shown}
            rows={focusPoints.map((fp) => ({
              id: fp.id,
              cells: shown.map((col) => cellFor(fp, col.key)),
              // The row opens the read-only view; editing is a press away from
              // there, or the card's `Edit`. It used to open the editor, which
              // meant going "in" landed you in a form.
              onOpen: () => onOpenSheet(fp),
            }))}
          />
        </>
      ) : (
        focusPoints.map((fp) => {
          const accent = accentForFocusPoint(fp);
          const count = symbolCount(fp.id);
          return (
            <CatalogCard
              key={fp.id}
              title={fp.name}
              subtitle={`${fp.kind} · ${fp.locationText}${
                count > 0 ? ` · ${count} symbol${count === 1 ? "" : "s"}` : ""
              }`}
              imageSrc={imageUrls[fp.id] ?? null}
              imageAlt={fp.name}
              imageClassName={`h-12 w-12 ring-1 ${accent.ring}`}
              imageStyle={accentStyle(accent) ?? undefined}
              onOpen={() => onOpenSheet(fp)}
              onEdit={() => onEditFocus(fp)}
              deleteArmed={armedId === fp.id}
              deleteNotice={deleteNotice}
              onDelete={() => onDeleteFocus(fp)}
            />
          );
        })
      )}
    </section>
  );
}

export function SymbolsList({
  symbols,
  fieldDefs,
  fieldValues,
  imageUrls,
  columnKeys,
  listMode,
  armedId,
  deleteNotice,
  onOpenSheet,
  onEdit,
  onDelete,
}: {
  symbols: Symbol[];
  fieldDefs: FieldDef[];
  fieldValues: FieldValue[];
  imageUrls: Record<string, string>;
  columnKeys: string[] | null;
  listMode: ListMode;
  /** The card whose delete is armed, if any. */
  armedId: string | null;
  /** What the armed card's delete would take with it. */
  deleteNotice?: string | null;
  onOpenSheet: (symbol: Symbol) => void;
  onEdit: (symbol: Symbol) => void;
  onDelete: (symbol: Symbol) => void;
}) {
  const ordered = sortSymbolsForPicker(symbols);
  const symbolDefs = [...fieldDefs]
    .filter((def) => def.entityType === "symbol")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const available = poolColumns(SYMBOL_BUILTIN_COLUMNS, fieldDefs, "symbol");
  const selected = resolveColumns(columnKeys, available.map((col) => col.key));
  const shown = available.filter((col) => selected.includes(col.key));
  const cellFor = (symbol: Symbol, key: string): DataCell => {
    if (key === "name") return symbol.name;
    if (key === "image") {
      return { imageSrc: imageUrls[symbol.id] ?? null, alt: symbol.name };
    }
    if (key === "description") return symbol.description;
    if (key === "usage") return symbol.usage;
    const def = symbolDefs.find((row) => row.key === key);
    if (!def) return "";
    return (
      fieldValues.find((row) => row.entityId === symbol.id && row.fieldDefId === def.id)?.text ?? ""
    );
  };
  return (
    <section className="flex flex-col gap-3">
      {listMode === "table" ? (
        <>
          <CatalogDataTable
            columns={shown}
            rows={ordered.map((s) => ({
              id: s.id,
              cells: shown.map((col) => cellFor(s, col.key)),
              onOpen: () => onOpenSheet(s),
            }))}
          />
        </>
      ) : (
        ordered.map((s) => (
          <CatalogCard
            key={s.id}
            title={s.name}
            subtitle={s.description}
            imageSrc={imageUrls[s.id] ?? null}
            imageAlt={s.name}
            imageClassName="h-12 w-12 ring-1 ring-line"
            onOpen={() => onOpenSheet(s)}
            onEdit={() => onEdit(s)}
            deleteArmed={armedId === s.id}
            deleteNotice={deleteNotice}
            onDelete={() => onDelete(s)}
          />
        ))
      )}
    </section>
  );
}

export async function saveSymbolWithDrafts(
  symbol: Symbol,
  fieldDefs: FieldDef[],
  fieldDrafts: Record<string, string>,
  stored: FieldValue[] = [],
): Promise<void> {
  await app.saveSymbol(symbol);
  await saveFieldDrafts(
    symbol.id,
    fieldDefs.filter((d) => d.entityType === "symbol"),
    fieldDrafts,
    stored,
  );
}

/**
 * Writes one entity's custom field values from the editor's drafts.
 *
 * `saveFieldValue` clears a value whose text is blank, so an emptied box removes
 * the row rather than storing an empty string.
 */
export async function saveFieldDrafts(
  entityId: string,
  defs: FieldDef[],
  fieldDrafts: Record<string, string>,
  stored: FieldValue[] = [],
): Promise<void> {
  for (const def of defs) {
    // The box is typed into, not read from the store, so the row's revision has
    // to come in with it: a write stamped 1 over and over would say the value had
    // never moved since the beginning of time.
    const revision = stored.find((row) => row.fieldDefId === def.id)?.revision ?? 0;
    await app.saveFieldValue({
      entityId,
      fieldDefId: def.id,
      text: fieldDrafts[def.id] ?? "",
      revision,
      updatedAt: 0,
    });
  }
}
