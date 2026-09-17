"use client";

import { app } from "@/composition";
import { useSession } from "@/features/auth/SessionProvider";
import { errorText } from "@/lib/error-text";
import { getMixer } from "@/runtime";
import { BinauralBody, binauralMixPayload } from "@/features/binaural/BinauralBody";
import type { BinauralPreset } from "@meditaur/domain";
import { Button, EYEBROW_CLASS } from "@meditaur/ui";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function Tuner() {
  const presetId = useSearchParams().get("preset");
  const [preset, setPreset] = useState<BinauralPreset | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    ready: sessionReady,
    userId: sessionUserId,
    workspaceId: sessionWorkspaceId,
  } = useSession();

  useEffect(() => {
    if (!sessionReady || !sessionWorkspaceId) return;
    void (async () => {
      try {
        const library = await app.getLibrary(sessionWorkspaceId);
        const row =
          (presetId ? library.presets.find((item) => item.id === presetId) : null) ??
          library.presets[0] ??
          null;
        if (row) setPreset(row);
      } catch (err) {
        setError(errorText(err, "Could not load the tuner"));
      }
    })();
  }, [sessionReady, sessionWorkspaceId, presetId]);

  /** This screen has no Save: it writes each change as it is made, which is what
   *  makes it a tuner rather than an editor. The preset editor is where a sound
   *  is composed deliberately, with a Save. */
  const persist = async (next: BinauralPreset) => {
    setPreset(next);
    await app.savePreset(next);
    if (playing) {
      getMixer("tuner").setBinaural(binauralMixPayload(next));
    }
  };

  const play = async () => {
    if (!sessionUserId || !preset) return;
    const prefs = await app.getPreferences(sessionUserId);
    const mixer = getMixer("tuner");
    mixer.setMasterVolume(prefs?.masterVolume ?? 0.7);
    mixer.setAlarmVolume(prefs?.alarmVolume ?? 0.6);
    await mixer.resume();
    mixer.setBinaural(binauralMixPayload(preset));
    setPlaying(true);
  };

  const stop = () => {
    const mixer = getMixer("tuner");
    mixer.fadeOutBinaural();
    mixer.suspend();
    setPlaying(false);
  };

  if (!preset) {
    return error ? (
      <p className="text-lg text-destructive">{error}</p>
    ) : (
      <p className="text-lg">Loading tuner…</p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        {/* The heading names the sound — that is the question this screen
            answers — with the eyebrow saying which screen it is. */}
        <p className={EYEBROW_CLASS}>Tuner</p>
        <h1 className="text-3xl font-semibold">{preset.name}</h1>
        <p className="text-muted">
          Headphones required. Each ear has its own tone list. Add beat pair inserts a
          classic left/right offset. EQ is per-ear peaking filters. Changes are saved
          as you make them — this screen is a live tuner, not an editor.
        </p>
      </div>
      <BinauralBody
        value={preset}
        onChange={(next) => void persist({ ...preset, ...next })}
        showFades
        showBandTiles
        onError={setError}
        preview={
          <>
            <Button tier="primary" size="lg" onClick={() => void play()} disabled={playing}>
              Play
            </Button>
            <Button size="lg" onClick={stop} disabled={!playing}>
              Stop
            </Button>
          </>
        }
      />
      {error ? <p className="text-destructive">{error}</p> : null}
    </div>
  );
}
