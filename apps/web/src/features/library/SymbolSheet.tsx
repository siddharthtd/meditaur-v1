import type { FieldDef, FieldValue, FocusPoint, Symbol } from "@meditaur/domain";
import { Button } from "@meditaur/ui";
import { EditorChrome } from "./EditorChrome";
import { ImageFrame } from "./ImageFrame";

/**
 * A symbol's read-only view — the owner's round 4, library item 8: "there should
 * be no editable or selectable options, only displaying current statuses and
 * values of configured fields".
 *
 * Opening a card lands here, and everything that *changes* a symbol lives one
 * press away in its editor. So this screen holds no inputs, no switches and no
 * remove buttons: it answers "what is this, and where is it used?" and nothing
 * else. `FocusSheet` is the same shape for focus points.
 */
export function SymbolSheet({
  symbol,
  imageUrl,
  fieldDefs,
  fieldValues,
  attachedTo,
  error,
  onBack,
  onEdit,
}: {
  symbol: Symbol;
  imageUrl: string | null;
  fieldDefs: FieldDef[];
  fieldValues: FieldValue[];
  /** The focus points this symbol is bound to, by name, in binding order. */
  attachedTo: string[];
  error: string | null;
  onBack: () => void;
  onEdit: () => void;
}) {
  const fields = [...fieldDefs]
    .filter((def) => def.entityType === "symbol")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const valueOf = (def: FieldDef): string =>
    fieldValues.find((row) => row.entityId === symbol.id && row.fieldDefId === def.id)?.text ?? "";
  return (
    <EditorChrome
      title={symbol.name}
      error={error}
      onBack={onBack}
      actions={
        <Button tier="primary" size="lg" onClick={onEdit}>
          Edit
        </Button>
      }
    >
      <ImageFrame src={imageUrl} alt={symbol.name} className="h-40 w-40" />
      {symbol.description ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-xl text-text">Description</h2>
          <p className="text-muted">{symbol.description}</p>
        </section>
      ) : null}
      {symbol.usage ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-xl text-text">Usage</h2>
          <p className="text-muted">{symbol.usage}</p>
        </section>
      ) : null}
      {/* One heading per custom field, in the field's own words — the owner's
          round 6 removed the shared `Custom fields` heading from the open view
          and asked for the field's heading in its place. No fields, nothing
          rendered. */}
      {fields.map((def) => (
        <section key={def.id} className="flex flex-col gap-2">
          <h2 className="text-xl text-text">{def.label}</h2>
          {def.description ? <p className="text-sm text-muted">{def.description}</p> : null}
          <p className="text-lg">{valueOf(def) || "—"}</p>
        </section>
      ))}
      <section className="flex flex-col gap-2">
        <h2 className="text-xl text-text">Attached to</h2>
        {attachedTo.length === 0 ? (
          <p className="text-muted">Not attached to a focus point.</p>
        ) : (
          attachedTo.map((name) => (
            <p key={name} className="text-lg">
              {name}
            </p>
          ))
        )}
      </section>
    </EditorChrome>
  );
}

/** The focus points a symbol is bound to, named and in binding order. */
export function attachedFocusNames(
  symbolId: string,
  bindings: { symbolId: string; focusPointId: string; sortOrder: number }[],
  focusPoints: FocusPoint[],
): string[] {
  return bindings
    .filter((row) => row.symbolId === symbolId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((row) => focusPoints.find((fp) => fp.id === row.focusPointId)?.name)
    .filter((name): name is string => Boolean(name));
}
