import type {
  BinauralPreset,
  FieldDef,
  FieldValue,
  FocusPoint,
  FocusSymbolBinding,
  Intention,
  Symbol,
} from "@meditaur/domain";
import { Button } from "@meditaur/ui";
import { EditorChrome } from "./EditorChrome";
import { ImageFrame } from "./ImageFrame";

/**
 * A focus point's read-only view — the owner's round 4, library item 8: "in the
 * open view in library for any chakra/symbol etc, there should be no editable or
 * selectable options, only displaying current statuses and values of configured
 * fields. Whatever you remove from here should be added to the edit mode".
 *
 * So this screen used to be the management screen as well: it bound and unbound
 * symbols, wrote intentions and custom fields, and flipped the binaural switch.
 * All of that moved into the editor (`FocusManage`), because a page you open to
 * *read* one thing should not be a page where a stray press changes it, and
 * because the two jobs had grown into one screen that did neither cleanly. What
 * is left here displays: the chakra block, the custom field values, the symbols
 * in `Rotate next` order, the intention lines, and the binaural state. Editing
 * is one press away, through the `Edit` action in the bottom bar.
 */
export function FocusSheet({
  focus,
  symbols,
  bindings,
  intentions,
  presets,
  fieldDefs,
  fieldValues,
  representationUrl,
  symbolImageUrls,
  error,
  onBack,
  onEdit,
}: {
  focus: FocusPoint;
  symbols: Symbol[];
  bindings: FocusSymbolBinding[];
  intentions: Intention[];
  presets: BinauralPreset[];
  fieldDefs: FieldDef[];
  fieldValues: FieldValue[];
  representationUrl: string | null;
  symbolImageUrls: Record<string, string>;
  error: string | null;
  onBack: () => void;
  onEdit: () => void;
}) {
  const bound = [...bindings]
    .filter((row) => row.focusPointId === focus.id)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((row) => symbols.find((s) => s.id === row.symbolId))
    .filter((s): s is Symbol => Boolean(s));
  const scoped = intentions
    .filter((row) => row.focusPointId === focus.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const focusFields = [...fieldDefs]
    .filter((d) => d.entityType === "focusPoint")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const presetName =
    presets.find((p) => p.id === focus.defaultBinauralPresetId)?.name ?? "None";
  const valueOf = (def: FieldDef): string =>
    fieldValues.find((row) => row.entityId === focus.id && row.fieldDefId === def.id)?.text ?? "";
  return (
    <EditorChrome
      title={focus.name}
      error={error}
      onBack={onBack}
      actions={
        <Button tier="primary" size="lg" onClick={onEdit}>
          Edit
        </Button>
      }
    >
      <p className="text-lg text-muted">
        {focus.kind} · {focus.locationText}
      </p>
      {focus.kind === "chakra" ? (
        <section className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
          <h2 className="text-xl text-text">Chakra</h2>
          {focus.description ? <p className="text-muted">{focus.description}</p> : null}
          {focus.governs ? <p className="text-muted">Governs: {focus.governs}</p> : null}
          {focus.colour ? <p className="text-muted">Colour: {focus.colour}</p> : null}
          {focus.element ? <p className="text-muted">Element: {focus.element}</p> : null}
          <div className="flex items-center gap-3">
            <ImageFrame src={representationUrl} alt={`${focus.name} representation`} />
            {focus.representationDescription ? (
              <p className="text-muted">{focus.representationDescription}</p>
            ) : null}
          </div>
        </section>
      ) : null}
      {/* Each custom field is its own heading here, not a line under one
          `Custom fields` heading — the owner's round 6: "remove that heading
          from the open (non-edit) view and replace the heading with the actual
          field heading". A focus point with no custom fields renders nothing
          rather than an empty heading that explains no value. */}
      {focusFields.map((def) => (
        <section key={def.id} className="flex flex-col gap-2">
          <h2 className="text-xl text-text">{def.label}</h2>
          {def.description ? <p className="text-sm text-muted">{def.description}</p> : null}
          <p className="text-lg">{valueOf(def) || "—"}</p>
        </section>
      ))}
      <section className="flex flex-col gap-2">
        <h2 className="text-xl text-text">Symbols</h2>
        {bound.length === 0 ? (
          <p className="text-muted">No symbols attached.</p>
        ) : (
          bound.map((symbol) => (
            <div key={symbol.id} className="flex items-center gap-3 rounded-2xl bg-surface p-3">
              <ImageFrame
                src={symbolImageUrls[symbol.id] ?? null}
                alt={symbol.name}
                className="h-12 w-12"
              />
              <p className="min-w-0 flex-1 truncate text-lg">{symbol.name}</p>
            </div>
          ))
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-xl text-text">Intentions</h2>
        {scoped.length === 0 ? (
          <p className="text-muted">No intentions yet.</p>
        ) : (
          scoped.map((row) => {
            const symbol = row.symbolId ? symbols.find((s) => s.id === row.symbolId) : null;
            return (
              <div key={row.id} className="rounded-2xl bg-surface px-4 py-3">
                <p className="text-lg">{row.text}</p>
                <p className="text-sm text-muted">{symbol ? symbol.name : "Focus only"}</p>
              </div>
            );
          })
        )}
      </section>
      <section className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
        <h2 className="text-xl text-text">Binaural</h2>
        <p className="text-muted">Preset: {presetName}</p>
        <p className="text-muted">
          Binaural beats: {focus.binauralEnabled === false ? "off" : "on"}
        </p>
      </section>
    </EditorChrome>
  );
}
