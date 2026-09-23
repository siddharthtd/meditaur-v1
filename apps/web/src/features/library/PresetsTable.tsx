import type { BinauralPreset } from "@meditaur/domain";
import { Button } from "@meditaur/ui";
import { BinauralBody } from "../binaural/BinauralBody";
import { CatalogCard } from "./CatalogCard";
import { DeleteButton } from "./DeleteButton";
import { EditorChrome } from "./EditorChrome";
import type { PresetDraft } from "./MeditationTable";

/**
 * A preset, with its sound under its name.
 *
 * The owner's round 5, library item 1: "there is no need to have a button for
 * open tuner, just have the tuner right below the name (what is the need for
 * L1/R1 tones heading?) […] Another issue was that there was no back button from
 * this page, which will also be fixed when you bring all the contents of this
 * page on its parent." So: the tones, the EQ and the fades are here, under the
 * name; the `L1/R1 tones` line is gone (the card in the list already says it);
 * `Duplicate` moved out to the card, next to `Edit`; and `Back` (and Escape)
 * work, because this is a screen inside the library rather than a route of its
 * own. `/tuner` still exists, for a URL that opens one preset on its own.
 */
export function PresetEditor({
  screen,
  deleteArmed,
  deleteImpact,
  error,
  onBack,
  onChange,
  onSave,
  onDelete,
}: {
  screen: PresetDraft;
  deleteArmed: boolean;
  /** What else the delete would take with it, while armed. */
  deleteImpact?: string | null;
  error: string | null;
  onBack: () => void;
  onChange: (preset: BinauralPreset) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const preset = screen.value;
  return (
    <EditorChrome
      title={screen.isNew ? "New preset" : "Preset"}
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
          aria-label="Preset name"
          value={preset.name}
          onChange={(e) => onChange({ ...preset, name: e.target.value })}
          className="min-h-16 rounded-2xl bg-surface px-4 text-2xl font-semibold text-text"
        />
      </label>
      <BinauralBody
        value={preset}
        onChange={(next) => onChange({ ...preset, ...next })}
      />
      {screen.isNew ? null : (
        <DeleteButton
          label="Delete preset"
          armedLabel={`Delete ${preset.name}?`}
          armed={deleteArmed}
          impact={deleteImpact}
          onClick={onDelete}
        />
      )}
    </EditorChrome>
  );
}

export function PresetsList({
  presets,
  armedId,
  deleteNotice,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  presets: BinauralPreset[];
  /** The card whose delete is armed, if any. */
  armedId: string | null;
  /** What the armed card's delete would take with it. */
  deleteNotice?: string | null;
  onEdit: (preset: BinauralPreset) => void;
  /** Copies a preset onto a new id, from the card — see the owner's round 5. */
  onDuplicate: (preset: BinauralPreset) => void;
  onDelete: (preset: BinauralPreset) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {presets.map((preset) => (
          <CatalogCard
            key={preset.id}
            title={preset.name}
            subtitle={`L${preset.leftTones.length} / R${preset.rightTones.length} tones`}
            actions={
              <Button
                size="sm"
                aria-label={`Duplicate ${preset.name}`}
                onClick={() => onDuplicate(preset)}
              >
                Duplicate
              </Button>
            }
            onEdit={() => onEdit(preset)}
            deleteArmed={armedId === preset.id}
            deleteNotice={deleteNotice}
            onDelete={() => onDelete(preset)}
          />
        ))}
      </div>
    </section>
  );
}
