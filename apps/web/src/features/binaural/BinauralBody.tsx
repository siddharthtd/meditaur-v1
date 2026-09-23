"use client";

import {
  addTone,
  classicBinauralPair,
  DEFAULT_CARRIER_HZ,
  GRAPHIC_BANDS_HZ,
  MAX_TONES_PER_EAR,
  removeTone,
  setBandGain,
  type BinauralPreset,
  type Tone,
} from "@meditaur/domain";
import { Button, LatchButton, Stepper, TileGrid } from "@meditaur/ui";
import type { ReactNode } from "react";
import { useState } from "react";

/** The part of a preset these controls own. */
export type BinauralValues = Pick<
  BinauralPreset,
  "leftTones" | "rightTones" | "fadeInMs" | "fadeOutMs" | "eqLeft" | "eqRight"
>;

/** What the mixer wants, built from one place instead of four. */
export function binauralMixPayload(value: BinauralValues) {
  return {
    leftTones: value.leftTones,
    rightTones: value.rightTones,
    fadeInMs: value.fadeInMs,
    fadeOutMs: value.fadeOutMs,
    eqLeft: value.eqLeft,
    eqRight: value.eqRight,
  };
}

const BANDS = [
  { id: "delta", label: "Delta 2 Hz", beat: 2 },
  { id: "theta", label: "Theta 6 Hz", beat: 6 },
  { id: "alpha", label: "Alpha 10 Hz", beat: 10 },
  { id: "beta", label: "Beta 18 Hz", beat: 18 },
  { id: "gamma", label: "Gamma 40 Hz", beat: 40 },
] as const;

/**
 * The binaural controls themselves — one body, three screens.
 *
 * The owner's round 5, library item 1: "there is no need to have a button for
 * open tuner, just have the tuner right below the name […] the buttons inside
 * tuner are also shaby, can you bring them up to the spec?" Bringing the tuner
 * into the preset editor made three screens show the same controls — the preset
 * editor, a meditation's binaural config, and `/tuner` — and two of them had
 * drifted: the config screen passed an EQ band's *index* where the domain helper
 * wants its *frequency*, so dragging one band could move another. One body fixes
 * that by construction.
 *
 * The body owns the ear switch, the tone rows, the EQ bands and the fade
 * steppers. What it does *not* own is where the values go: the tuner saves each
 * change as you make it, the config screen keeps a draft, and the preset editor
 * holds them until `Save`, so the caller passes `onChange` and a `preview` slot.
 */
export function BinauralBody({
  value,
  onChange,
  showFades = true,
  showBandTiles = false,
  preview,
  onError,
}: {
  value: BinauralValues;
  onChange: (next: BinauralValues) => void;
  /** Fade in/out, in ms. The tuner hides them; a saved preset wants them. */
  showFades?: boolean;
  /** The five classic beat-rate tiles, for the standalone tuner. */
  showBandTiles?: boolean;
  /** The caller's preview buttons (`Try`/`Stop`, `Play`/`Stop`). */
  preview?: ReactNode;
  onError?: (message: string | null) => void;
}): ReactNode {
  const [ear, setEar] = useState<"left" | "right">("left");
  const [eqLink, setEqLink] = useState(true);
  const tones = ear === "left" ? value.leftTones : value.rightTones;
  const eq = ear === "left" ? value.eqLeft : value.eqRight;

  const updateTones = (nextTones: Tone[]) => {
    onChange(
      ear === "left" ? { ...value, leftTones: nextTones } : { ...value, rightTones: nextTones },
    );
  };

  const addBeat = (beatHz: number) => {
    try {
      onError?.(null);
      const pair = classicBinauralPair(DEFAULT_CARRIER_HZ, beatHz, 0.4);
      onChange({
        ...value,
        leftTones: addTone(value.leftTones, pair.left),
        rightTones: addTone(value.rightTones, pair.right),
      });
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Cannot add the pair");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <TileGrid
        value={ear}
        onChange={setEar}
        tiles={[
          { id: "left", label: "Left ear" },
          { id: "right", label: "Right ear" },
        ]}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => {
            try {
              onError?.(null);
              updateTones(addTone(tones, { hz: 200, gain: 0.4 }));
            } catch (err) {
              onError?.(err instanceof Error ? err.message : "Cannot add a tone");
            }
          }}
          disabled={tones.length >= MAX_TONES_PER_EAR}
        >
          Add tone ({tones.length}/{MAX_TONES_PER_EAR})
        </Button>
        <Button onClick={() => addBeat(8)}>Add beat pair</Button>
      </div>
      {showBandTiles ? (
        <TileGrid
          tiles={BANDS.map((band) => ({ id: band.id, label: band.label }))}
          onChange={(id) => addBeat(BANDS.find((band) => band.id === id)?.beat ?? 8)}
        />
      ) : null}
      {tones.map((tone) => (
        <div key={tone.id} className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
          <Stepper
            label="Hz"
            value={Math.round(tone.hz)}
            min={20}
            max={20000}
            step={1}
            onChange={(hz) =>
              updateTones(tones.map((row) => (row.id === tone.id ? { ...row, hz } : row)))
            }
          />
          <Stepper
            label="Gain"
            value={tone.gain}
            min={0}
            max={1}
            step={0.05}
            format={(n) => n.toFixed(2)}
            onChange={(gain) =>
              updateTones(tones.map((row) => (row.id === tone.id ? { ...row, gain } : row)))
            }
          />
          <Button
            tier="destructive"
            size="md"
            className="w-full"
            onClick={() => updateTones(removeTone(tones, tone.id))}
          >
            Remove tone
          </Button>
        </div>
      ))}
      {showFades ? (
        <>
          <Stepper
            label="Fade in ms"
            value={value.fadeInMs}
            min={0}
            max={5000}
            step={10}
            onChange={(fadeInMs) => onChange({ ...value, fadeInMs })}
          />
          <Stepper
            label="Fade out ms"
            value={value.fadeOutMs}
            min={0}
            max={5000}
            step={10}
            onChange={(fadeOutMs) => onChange({ ...value, fadeOutMs })}
          />
        </>
      ) : null}
      <LatchButton pressed={eqLink} onChange={setEqLink} label="Link EQ ears" />
      {GRAPHIC_BANDS_HZ.map((hz) => (
        <Stepper
          key={hz}
          label={`${hz} Hz`}
          value={eq.bands.find((band) => band.hz === hz)?.gainDb ?? 0}
          min={-12}
          max={12}
          step={1}
          format={(n) => `${n} dB`}
          onChange={(gainDb) => {
            // Bands are addressed by frequency, which is what the stored EQ is
            // keyed on. Passing the array index (the config screen used to) works
            // only while the band order happens to match.
            const nextEar = setBandGain(eq, hz, gainDb);
            if (eqLink) {
              onChange({ ...value, eqLeft: nextEar, eqRight: nextEar });
            } else if (ear === "left") {
              onChange({ ...value, eqLeft: nextEar });
            } else {
              onChange({ ...value, eqRight: nextEar });
            }
          }}
        />
      ))}
      {preview ? <div className="flex flex-wrap items-center gap-3">{preview}</div> : null}
    </div>
  );
}
