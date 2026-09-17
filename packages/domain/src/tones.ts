import { fail } from "./app-error.ts";
import { createId } from "./ids.ts";

export const MAX_TONES_PER_EAR = 16;
export const MIN_HZ = 20;
export const MAX_HZ = 20000;
export const DEFAULT_CARRIER_HZ = 200;
export const MIN_BEAT_HZ = 0.5;
export const MAX_BEAT_HZ = 40;

export type Tone = {
  id: string;
  hz: number;
  gain: number;
};

export function clampHz(hz: number): number {
  if (!Number.isFinite(hz)) {
    fail("tone.frequency", "Frequency must be a finite number");
  }
  return Math.min(MAX_HZ, Math.max(MIN_HZ, hz));
}

export function clampGain(gain: number): number {
  if (!Number.isFinite(gain)) {
    return 0;
  }
  return Math.min(1, Math.max(0, gain));
}

export function clampTone(tone: Tone): Tone {
  return { ...tone, hz: clampHz(tone.hz), gain: clampGain(tone.gain) };
}

export function busGain(toneCount: number): number {
  return 1 / Math.sqrt(Math.max(toneCount, 1));
}

export function addTone(tones: Tone[], tone: Omit<Tone, "id"> & { id?: string }): Tone[] {
  if (tones.length >= MAX_TONES_PER_EAR) {
    fail("tone.cap", `At most ${MAX_TONES_PER_EAR} tones per ear`);
  }
  const next = clampTone({
    id: tone.id ?? createId(),
    hz: tone.hz,
    gain: tone.gain,
  });
  return [...tones, next];
}

export function removeTone(tones: Tone[], id: string): Tone[] {
  return tones.filter((tone) => tone.id !== id);
}

export function classicBinauralPair(
  carrierHz: number,
  beatHz: number,
  gain: number,
): { left: Tone; right: Tone } {
  if (!Number.isFinite(carrierHz) || !Number.isFinite(beatHz)) {
    fail("tone.carrierBeat", "Carrier and beat must be finite");
  }
  if (beatHz < MIN_BEAT_HZ || beatHz > MAX_BEAT_HZ) {
    fail("tone.beatRange", `Beat must be between ${MIN_BEAT_HZ} and ${MAX_BEAT_HZ} Hz`);
  }
  const g = clampGain(gain);
  return {
    left: { id: createId(), hz: clampHz(carrierHz + beatHz / 2), gain: g },
    right: { id: createId(), hz: clampHz(carrierHz - beatHz / 2), gain: g },
  };
}
