import { getMixer } from "@/runtime";
import {
  classicBinauralPair,
  createId,
  defaultEarEq,
  type BinauralPreset,
  type FocusPoint,
} from "@meditaur/domain";
import { Button, LatchButton } from "@meditaur/ui";
import { BinauralBody, binauralMixPayload } from "../binaural/BinauralBody";
import { useEffect, useState } from "react";
import { EditorChrome } from "./EditorChrome";
import {
  clearBinauralDraft,
  readBinauralDraft,
  writeBinauralDraft,
  type BinauralDraftPayload,
} from "./library-model";

function draftFromPreset(preset: BinauralPreset): BinauralDraftPayload {
  return {
    name: preset.name,
    leftTones: preset.leftTones.map((t) => ({ ...t })),
    rightTones: preset.rightTones.map((t) => ({ ...t })),
    fadeInMs: preset.fadeInMs,
    fadeOutMs: preset.fadeOutMs,
    eqLeft: { bands: preset.eqLeft.bands.map((b) => ({ ...b })) },
    eqRight: { bands: preset.eqRight.bands.map((b) => ({ ...b })) },
    sourcePresetId: preset.id,
    revision: preset.revision,
  };
}

function emptyDraft(): BinauralDraftPayload {
  const pair = classicBinauralPair(200, 8, 0.45);
  return {
    name: "",
    leftTones: [pair.left],
    rightTones: [pair.right],
    fadeInMs: 40,
    fadeOutMs: 40,
    eqLeft: defaultEarEq(),
    eqRight: defaultEarEq(),
    sourcePresetId: null,
    revision: 0,
  };
}

export function BinauralConfigScreen({
  focus,
  presets,
  error,
  onBack,
  onError,
  onSavePreset,
  onToggleBinaural,
}: {
  focus: FocusPoint;
  presets: BinauralPreset[];
  error: string | null;
  onBack: () => void;
  onError: (message: string | null) => void;
  onSavePreset: (preset: BinauralPreset) => Promise<void>;
  onToggleBinaural: (enabled: boolean) => Promise<void>;
}) {
  const assigned = focus.defaultBinauralPresetId
    ? presets.find((p) => p.id === focus.defaultBinauralPresetId) ?? null
    : null;
  const [draft, setDraft] = useState<BinauralDraftPayload>(() => {
    return readBinauralDraft(focus.id) ?? (assigned ? draftFromPreset(assigned) : emptyDraft());
  });
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    writeBinauralDraft(focus.id, draft);
  }, [focus.id, draft]);

  useEffect(() => {
    return () => {
      getMixer("tuner").fadeOutBinaural();
    };
  }, []);

  const updateDraft = (next: BinauralDraftPayload) => {
    setDraft(next);
    if (playing) {
      getMixer("tuner").setBinaural(binauralMixPayload(next));
    }
  };

  const tryPreview = async () => {
    onError(null);
    try {
      getMixer("tuner").setBinaural(binauralMixPayload(draft));
      setPlaying(true);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not preview");
    }
  };

  const stopPreview = () => {
    getMixer("tuner").fadeOutBinaural();
    setPlaying(false);
  };

  const revert = () => {
    stopPreview();
    clearBinauralDraft(focus.id);
    setDraft(assigned ? draftFromPreset(assigned) : emptyDraft());
  };

  const duplicate = () => {
    updateDraft({
      ...draft,
      name: draft.name ? `${draft.name} copy` : "Untitled copy",
      sourcePresetId: null,
    });
  };

  const save = async () => {
    onError(null);
    try {
      stopPreview();
      // The name rule (trim, then reject an empty one) belongs to the
      // application, which reports it as `catalog.nameRequired` and trims for
      // the write. Validating it here as well only gave the rule a second home
      // and a second copy of the message; the catch below shows the same text.
      const preset: BinauralPreset = {
        id: draft.sourcePresetId ?? createId(),
        workspaceId: focus.workspaceId,
        name: draft.name,
        leftTones: draft.leftTones,
        rightTones: draft.rightTones,
        fadeInMs: draft.fadeInMs,
        fadeOutMs: draft.fadeOutMs,
        eqLeft: draft.eqLeft,
        eqRight: draft.eqRight,
        // The draft carries the revision of whatever preset it is editing (0 for
        // a new one), so a save moves the row on instead of restarting it.
        revision: draft.revision,
        updatedAt: 0,
      };
      await onSavePreset(preset);
      clearBinauralDraft(focus.id);
      onBack();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <EditorChrome
      title={`Binaural · ${focus.name}`}
      error={error}
      onBack={onBack}
      actions={
        <Button tier="primary" size="lg" onClick={() => void save()}>
          Save
        </Button>
      }
    >
      <LatchButton
        pressed={focus.binauralEnabled !== false}
        onChange={(enabled) => void onToggleBinaural(enabled)}
        label="Binaural beats"
      />
      <label className="flex flex-col gap-2">
        <span className="text-lg text-muted">Preset name</span>
        <input
          aria-label="Preset name"
          value={draft.name}
          onChange={(e) => updateDraft({ ...draft, name: e.target.value })}
          className="min-h-16 rounded-2xl bg-surface px-4 text-lg text-text"
        />
      </label>
      <BinauralBody
        value={draft}
        onChange={(next) => updateDraft({ ...draft, ...next })}
        showFades
        preview={
          <>
            <Button onClick={() => void (playing ? stopPreview() : tryPreview())}>
              {playing ? "Stop" : "Try"}
            </Button>
            <Button onClick={duplicate}>Duplicate</Button>
            <Button onClick={revert}>Revert</Button>
          </>
        }
      />
    </EditorChrome>
  );
}
