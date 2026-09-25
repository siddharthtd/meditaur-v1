import { app } from "@/composition";
import { useSession } from "@/features/auth/SessionProvider";
import { NONE_PICK_ID } from "@meditaur/application";
import {
  CHAKRA_TYPE_ID,
  type BinauralPreset,
  type Entry,
  type FieldDef,
  type FieldValue,
  type Meditation,
  type MeditationType,
  type Symbol,
} from "@meditaur/domain";
import {
  Button,
  LatchButton,
  PickerPage,
  TileGrid,
  accentForMeditation,
  accentStyle,
} from "@meditaur/ui";
import { DurationSteppers } from "../DurationSteppers";
import { CatalogCard } from "./CatalogCard";
import { CatalogDataTable, type DataCell } from "./CatalogDataTable";
import { EditorChrome } from "./EditorChrome";
import { CustomFields, EditorField, EditorSection, type FieldDelete } from "./EditorSection";
import { ImageFrame } from "./ImageFrame";
import {
  columnIsInPool,
  MEDITATION_BUILTIN_COLUMNS,
  poolColumns,
  resolveColumns,
  sortSymbolsForPicker,
  SYMBOL_BUILTIN_COLUMNS,
  typeName,
  typeTiles,
  type ListMode,
} from "./library-model";

/**
 * What a record editor edits: the row, and whether it has ever been stored.
 *
 * It used to be a `Screen`, which tied the editor to the screen stack. It is a
 * plain pair now because the Database's record view hands it a **draft** — the
 * Database holds one and commits it on Save (§7) — and the two callers should not
 * have to agree on a navigation shape to share a form.
 */
export type MeditationDraft = { value: Meditation; isNew: boolean };
export type SymbolDraft = { value: Symbol; isNew: boolean };
export type PresetDraft = { value: BinauralPreset; isNew: boolean };

export function MeditationPresetPicker({
  value,
  presets,
  onBack,
  onSelect,
}: {
  value: string | null;
  presets: BinauralPreset[];
  onBack: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <main>
      <PickerPage
        title="Default sound"
        items={[
          { id: NONE_PICK_ID, label: "None" },
          ...presets.map((p) => ({ id: p.id, label: p.name })),
        ]}
        selectedId={value ?? NONE_PICK_ID}
        onBack={onBack}
        onSelect={onSelect}
      />
    </main>
  );
}

export function MeditationPicker({
  meditations,
  onBack,
  onSelect,
}: {
  meditations: Meditation[];
  onBack: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <main>
      <PickerPage
        title="Meditation"
        items={meditations.map((fp) => ({
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

export function MeditationEditor({
  screen,
  presets,
  types,
  fieldDefs,
  fieldDrafts,
  fieldDelete,
  representationUrl,
  error,
  onBack,
  onChange,
  onPickPreset,
  onUploadRepresentation,
  onDraftChange,
  onAddField,
  onToggleBinaural,
  onOpenBinaural,
  onSave,
}: {
  screen: MeditationDraft;
  presets: BinauralPreset[];
  /** Every type, so the `Type` control offers what the store actually holds. */
  types: MeditationType[];
  fieldDefs: FieldDef[];
  fieldDrafts: Record<string, string>;
  /** The two-press delete each custom field carries on its heading line. */
  fieldDelete: FieldDelete;
  representationUrl: string | null;
  error: string | null;
  onBack: () => void;
  onChange: (focus: Meditation) => void;
  onPickPreset: () => void;
  onUploadRepresentation: (file: File | undefined) => void;
  onDraftChange: (fieldDefId: string, text: string) => void;
  onAddField: () => void;
  onToggleBinaural: (enabled: boolean) => void;
  onOpenBinaural: () => void;
  onSave: () => void;
}) {
  const { flags } = useSession();
  const focus = screen.value;
  // The chakra's own sections belong to the seeded Chakra type. Which *type* a row
  // is became data (the owner's round 15); which of these sections is a built-in
  // field for that type is still a fact about the code, and it is stated here as
  // the one id rather than as a word a reader can rename away.
  const showChakra = focus.typeId === CHAKRA_TYPE_ID;
  const focusFields = [...fieldDefs]
    .filter(
      (def) =>
        def.archivedAt == null &&
        def.scope === "meditation" &&
        columnIsInPool(def, focus.typeId),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <EditorChrome
      title={screen.isNew ? "New meditation" : "Meditation"}
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
          <span className="text-lg text-muted">Type</span>
          {/* `sm`: a few fixed choices inside a form are a control, not the
              screen's point — the owner's round 8, library item 1. The choices
              are the store's types, so one added later appears here at once. */}
          <TileGrid
            value={focus.typeId}
            onChange={(typeId) => onChange({ ...focus, typeId })}
            tiles={typeTiles(types)}
            size="sm"
          />
        </div>
        <EditorField label="Name">
          <input
            aria-label="Meditation name"
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
        {/* The sounds are the `binaural` flag's (`P0 · 35`, slice 35d): off, the picker
            and the config's own switch are not drawn, and the meditation keeps the
            preset it names — the session will compile silent rather than be edited. */}
        {flags.binaural ? (
          <div className="flex flex-col gap-2">
            <span className="text-lg text-muted">Default sound</span>
            <Button
              size="sm"
              accent={accentForMeditation(focus)}
              aria-label="Default sound"
              className="w-full justify-start"
              onClick={onPickPreset}
            >
              {presets.find((p) => p.id === focus.defaultBinauralPresetId)?.name ?? "None"}
            </Button>
          </div>
        ) : null}
      </EditorSection>
      {showChakra && flags.binaural ? (
        <EditorSection title="Binaural">
          <LatchButton
            label={focus.binauralEnabled ? "Binaural on" : "Binaural off"}
            pressed={focus.binauralEnabled}
            onChange={onToggleBinaural}
          />
          <Button size="sm" onClick={onOpenBinaural}>
            Open binaural config
          </Button>
        </EditorSection>
      ) : null}
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
              className={`ring-2 ${accentForMeditation(focus).ring}`}
              style={accentStyle(accentForMeditation(focus)) ?? undefined}
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
        <EditorSection title="Rows and intentions">
          <p className="text-lg text-muted">
            The symbols this chakra is paired with, and every intention written about
            them, live in the Database — one row per pair, with the fixups and the
            archive in the same place.
          </p>
          <CustomFields
            defs={focusFields}
            drafts={fieldDrafts}
            onDraftChange={onDraftChange}
            onAdd={onAddField}
            fieldDelete={fieldDelete}
          />
        </EditorSection>
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
  error,
  onBack,
  onChange,
  onDraftChange,
  onUploadImage,
  onAddField,
  onSave,
}: {
  screen: SymbolDraft;
  fieldDefs: FieldDef[];
  fieldDrafts: Record<string, string>;
  /** The two-press delete each custom field carries on its heading line. */
  fieldDelete: FieldDelete;
  imageUrl: string | null;
  error: string | null;
  onBack: () => void;
  onChange: (symbol: Symbol) => void;
  onDraftChange: (fieldDefId: string, text: string) => void;
  onUploadImage: (file: File | undefined) => void;
  onAddField: () => void;
  onSave: () => void;
}) {
  const symbol = screen.value;
  const symbolFields = [...fieldDefs]
    .filter((d) => d.archivedAt == null && d.scope === "symbol")
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
          view listed them — the owner's round 6. It is the meditation's
          section, and the meditation's "Add custom fields" button. */}
      <CustomFields
        defs={symbolFields}
        drafts={fieldDrafts}
        onDraftChange={onDraftChange}
        onAdd={onAddField}
        fieldDelete={fieldDelete}
      />
    </EditorChrome>
  );
}

export function MeditationList({
  meditations,
  types,
  entries,
  fieldDefs,
  fieldValues,
  imageUrls,
  columnKeys,
  listMode,
  onOpenRecord,
  typeId,
}: {
  meditations: Meditation[];
  types: MeditationType[];
  entries: Entry[];
  fieldDefs: FieldDef[];
  fieldValues: FieldValue[];
  imageUrls: Record<string, string>;
  columnKeys: string[] | null;
  listMode: ListMode;
  onOpenRecord: (focus: Meditation) => void;
  /** The type whose tab this is: the pool the reader's columns are drawn from. */
  typeId: string | null;
}) {
  const rowCount = (meditationId: string) =>
    entries.filter((row) => row.archivedAt == null && row.meditationId === meditationId).length;
  const focusDefs = [...fieldDefs]
    .filter(
      (def) =>
        def.archivedAt == null &&
        def.scope === "meditation" &&
        columnIsInPool(def, typeId),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const available = poolColumns(MEDITATION_BUILTIN_COLUMNS, fieldDefs, "meditation", typeId);
  const selected = resolveColumns(columnKeys, available.map((col) => col.key));
  const shown = available.filter((col) => selected.includes(col.key));
  const cellFor = (focus: Meditation, key: string): DataCell => {
    if (key === "name") return focus.name;
    if (key === "image") {
      return {
        imageSrc: focus.representationAssetId
          ? (imageUrls[focus.representationAssetId] ?? null)
          : null,
        alt: focus.name,
      };
    }
    if (key === "type") return typeName(types, focus.typeId);
    if (key === "location") return focus.locationText;
    if (key === "symbols") return String(rowCount(focus.id));
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
            rows={meditations.map((fp) => ({
              id: fp.id,
              cells: shown.map((col) => cellFor(fp, col.key)),
              // The row opens the record; editing is a press away from there. It
              // used to open the editor, which meant going "in" landed you in a form.
              onOpen: () => onOpenRecord(fp),
            }))}
          />
        </>
      ) : (
        meditations.map((fp) => {
          const accent = accentForMeditation(fp);
          const count = rowCount(fp.id);
          return (
            <CatalogCard
              key={fp.id}
              title={fp.name}
              subtitle={`${typeName(types, fp.typeId)} · ${fp.locationText}${
                count > 0 ? ` · ${count} row${count === 1 ? "" : "s"}` : ""
              }`}
              imageSrc={
                fp.representationAssetId ? (imageUrls[fp.representationAssetId] ?? null) : null
              }
              imageAlt={fp.name}
              imageClassName={`h-12 w-12 ring-1 ${accent.ring}`}
              imageStyle={accentStyle(accent) ?? undefined}
              onOpen={() => onOpenRecord(fp)}
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
  onOpenRecord,
}: {
  symbols: Symbol[];
  fieldDefs: FieldDef[];
  fieldValues: FieldValue[];
  imageUrls: Record<string, string>;
  columnKeys: string[] | null;
  listMode: ListMode;
  onOpenRecord: (symbol: Symbol) => void;
}) {
  const ordered = sortSymbolsForPicker(symbols);
  const symbolDefs = [...fieldDefs]
    .filter((def) => def.archivedAt == null && def.scope === "symbol")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const available = poolColumns(SYMBOL_BUILTIN_COLUMNS, fieldDefs, "symbol");
  const selected = resolveColumns(columnKeys, available.map((col) => col.key));
  const shown = available.filter((col) => selected.includes(col.key));
  const cellFor = (symbol: Symbol, key: string): DataCell => {
    if (key === "name") return symbol.name;
    if (key === "image") {
      return {
        imageSrc: symbol.imageAssetId ? (imageUrls[symbol.imageAssetId] ?? null) : null,
        alt: symbol.name,
      };
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
              onOpen: () => onOpenRecord(s),
            }))}
          />
        </>
      ) : (
        ordered.map((s) => (
          <CatalogCard
            key={s.id}
            title={s.name}
            subtitle={s.description}
            imageSrc={s.imageAssetId ? (imageUrls[s.imageAssetId] ?? null) : null}
            imageAlt={s.name}
            imageClassName="h-12 w-12 ring-1 ring-line"
            onOpen={() => onOpenRecord(s)}
          />
        ))
      )}
    </section>
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
