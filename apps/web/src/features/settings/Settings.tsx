"use client";

import { app } from "@/composition";
import { useSession } from "@/features/auth/SessionProvider";
import { applyTextSize } from "@/lib/text-size";
import { errorText } from "@/lib/error-text";
import { volumeFromTens, volumeToTens } from "@/lib/settings-volume";
import type { UserPreferences } from "@meditaur/domain";
import { LatchButton, Stepper, TileGrid } from "@meditaur/ui";
import { useEffect, useRef, useState } from "react";

export function Settings() {
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { ready, userId } = useSession();
  // Every write must carry the revision the store last handed back, so saves are
  // chained and each one rebases on `stored`: two quick toggles cannot both send
  // the same revision (which a compare-and-swap would refuse), and the values
  // written are whatever the reader has on screen by then.
  const stored = useRef<UserPreferences | null>(null);
  const shown = useRef<UserPreferences | null>(null);
  const writes = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    if (!ready || !userId) return;
    void (async () => {
      try {
        const loaded = await app.getPreferences(userId);
        stored.current = loaded;
        shown.current = loaded;
        setPrefs(loaded);
      } catch (err) {
        setLoadError(errorText(err, "Could not load settings"));
      }
    })();
  }, [ready, userId]);

  const save = (patch: Partial<UserPreferences>) => {
    const current = shown.current;
    if (!current) return;
    const optimistic = { ...current, ...patch };
    shown.current = optimistic;
    setPrefs(optimistic);
    setSaveError(null);
    applyTextSize(optimistic.textSize);
    writes.current = writes.current
      .then(async () => {
        const base = stored.current ?? optimistic;
        const saved = await app.savePreferences({ ...base, ...shown.current });
        stored.current = saved;
        // Adopt the revision the store returned but keep the reader's live
        // values: a toggle made while this write was in flight is queued next.
        const live = shown.current;
        shown.current = live
          ? { ...live, revision: saved.revision, updatedAt: saved.updatedAt }
          : saved;
        setPrefs(shown.current);
      })
      .catch((err) => {
        // The write was refused, so what is on screen is not what is stored.
        shown.current = stored.current;
        setPrefs(stored.current);
        setSaveError(errorText(err, "Could not save settings"));
      });
  };

  if (loadError) {
    return <p className="text-lg text-destructive">{loadError}</p>;
  }

  if (!prefs) {
    return <p className="text-lg">Loading settings…</p>;
  }

  return (
    <main className="flex flex-col gap-4">
      {saveError ? <p className="text-lg text-destructive">{saveError}</p> : null}
      {/* No page title: the navigation bar above already says `Settings`. */}
      <LatchButton
        label="Stop binaural when alarm rings"
        pressed={prefs.stopBinauralOnAlarm}
        onChange={(stopBinauralOnAlarm) => save({ stopBinauralOnAlarm })}
      />
      <LatchButton
        label="Auto-advance by default"
        pressed={prefs.autoAdvance}
        onChange={(autoAdvance) => save({ autoAdvance })}
      />
      {/* The alarm's own switch. Session-level like the two above it, so what this
          decides is the value a **new** plan is created with — an existing plan
          carries its own, and the planner is where that one is set (§12.21). */}
      <LatchButton
        label="Alarm by default"
        pressed={prefs.alarmEnabled}
        onChange={(alarmEnabled) => save({ alarmEnabled })}
      />
      <LatchButton
        label="Speak intentions (TTS)"
        pressed={prefs.ttsEnabled}
        onChange={(ttsEnabled) => save({ ttsEnabled })}
      />
      {/* Volume is 0–10 in steps of 1 (the owner's round 16, §5.5), and the store
          keeps its `0..1` gain: the two helpers are the whole of the conversion, so
          the stepper's own numbers are the ones a reader reads and presses. A
          stored value that is not a whole tenth — an older row stepped by `0.05` —
          shows as the nearest number and is only rewritten by a press. */}
      <Stepper
        label="Alarm volume"
        value={volumeToTens(prefs.alarmVolume)}
        min={0}
        max={10}
        onChange={(tens) => save({ alarmVolume: volumeFromTens(tens) })}
      />
      <Stepper
        label="Master volume"
        value={volumeToTens(prefs.masterVolume)}
        min={0}
        max={10}
        onChange={(tens) => save({ masterVolume: volumeFromTens(tens) })}
      />
      <p className="text-lg text-muted">Text size</p>
      <TileGrid
        value={prefs.textSize}
        onChange={(textSize) => save({ textSize })}
        tiles={[
          { id: "sm", label: "Small" },
          { id: "md", label: "Medium" },
          { id: "lg", label: "Large" },
          { id: "xl", label: "XL" },
        ]}
      />
    </main>
  );
}
