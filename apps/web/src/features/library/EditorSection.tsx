import { Button } from "@meditaur/ui";
import type { FieldDef } from "@meditaur/domain";
import type { ReactNode } from "react";

/**
 * One section of an editor form: a `text-xl` heading with an optional action on
 * its heading line, and the section's controls under it.
 *
 * The app's editors had drifted into two shapes — some stacked a bare label and
 * control per field, others had sections — and the owner's round 6 asked for one
 * of them: "clean up the buttons and the layout, I want the small buttons like
 * there are in the rest of the application", for the meditation, the symbol and
 * the intention editors alike. This is that shape, in one place so a new editor
 * cannot invent a fourth.
 *
 * Actions on the heading line are `sm`: a heading line is a row, and §1.4 gives
 * rows the compact size.
 */
export function EditorSection({
  title,
  action,
  children,
}: {
  title: string;
  /** The section's own action, e.g. `Add custom fields`. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl text-text">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * A labelled control in an editor form — the app's field language: the field's
 * name in muted text over its control.
 */
export function EditorField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-lg text-muted">{label}</span>
      {children}
    </label>
  );
}

/**
 * The custom fields of one entity, as the editor for that entity shows them.
 *
 * The same section on the meditation's editor and the symbol's editor, because
 * the owner asked for exactly that ("Same behavior with the chakra/focuspoint"),
 * and because the symbol's editor had none at all: "Symbol edit doesn't have any
 * input for custom fields, but the view UI shows custom fields."
 *
 * Each field is **its own section, titled by its own heading** — the owner's
 * round 9: "you take input and present it as heading and description yet still
 * you add it under the custom fields heading. I wanted it as its own field." A
 * field is not an item in a list of custom fields, it is another field of the
 * entity, so it reads like `Details` or `Symbols` and sits among them. Nothing
 * renders the wrapper heading any more, and the description is not drawn here:
 * it is the field's own note, and it belongs where the field is described (the
 * Fields tab's card, and the entity's open view).
 */
export type FieldDelete = {
  /** The field whose delete is armed, if any. */
  armedId: string | null;
  /** What that delete would take with it, while armed. */
  impact: string | null;
  onArm: (def: FieldDef) => void;
  onDelete: (def: FieldDef) => void;
};

export function CustomFields({
  defs,
  drafts,
  onDraftChange,
  onAdd,
  onSave,
  fieldDelete,
}: {
  /** The field definitions of this entity's pool, in `sortOrder`. */
  defs: FieldDef[];
  drafts: Record<string, string>;
  onDraftChange: (fieldDefId: string, text: string) => void;
  onAdd: () => void;
  /** Writes the drafts. Absent for an editor whose `Save` already does. */
  onSave?: () => void;
  /**
   * The delete each field carries on its own heading line. It is the pool's
   * field that goes, not just this entity's value, which is why it is the
   * app's two-press delete with its sentence.
   */
  fieldDelete: FieldDelete;
}) {
  return (
    <>
      {defs.map((def) => {
        const armed = fieldDelete.armedId === def.id;
        return (
          <EditorSection
            key={def.id}
            title={def.label}
            action={
              <Button
                tier="destructive"
                size="sm"
                armed={armed}
                onClick={() => (armed ? fieldDelete.onDelete(def) : fieldDelete.onArm(def))}
              >
                {/* Named, the way every other destructive control in the app
                    is: the second press is what the first one meant. */}
                {armed ? `Delete ${def.label}?` : `Delete ${def.label}`}
              </Button>
            }
          >
            <input
              aria-label={def.label}
              value={drafts[def.id] ?? ""}
              onChange={(e) => onDraftChange(def.id, e.target.value)}
              className="min-h-16 rounded-2xl bg-surface px-4 text-lg text-text"
            />
            {armed && fieldDelete.impact ? (
              <p className="text-sm text-destructive">{fieldDelete.impact}</p>
            ) : null}
          </EditorSection>
        );
      })}
      {defs.length === 0 ? (
        <p className="text-muted">
          No custom fields yet. Press Add custom fields to make one; it then appears here and in
          the table views.
        </p>
      ) : null}
      {/* The add belongs to the fields, not to a wrapper heading, so it is its
          own line at the foot of the list (the owner's round 9). */}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={onAdd}>
          Add custom fields
        </Button>
        {onSave && defs.length > 0 ? (
          <Button size="sm" tier="primary" onClick={onSave}>
            Save fields
          </Button>
        ) : null}
      </div>
    </>
  );
}
