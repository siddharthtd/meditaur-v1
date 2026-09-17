import type { CompiledBinaural } from "@meditaur/domain";

export type ToneOsc = {
  hz: number;
  gain: number;
  ear: "left" | "right";
};

export type GraphSpec = {
  leftOscillators: ToneOsc[];
  rightOscillators: ToneOsc[];
  leftEqHz: number[];
  rightEqHz: number[];
  busGainLeft: number;
  busGainRight: number;
  alarmConnectedToEq: boolean;
};

export function graphSpecFromPreset(preset: CompiledBinaural): GraphSpec {
  return {
    leftOscillators: preset.leftTones.map((t) => ({
      hz: t.hz,
      gain: t.gain,
      ear: "left",
    })),
    rightOscillators: preset.rightTones.map((t) => ({
      hz: t.hz,
      gain: t.gain,
      ear: "right",
    })),
    leftEqHz: preset.eqLeft.bands.map((b) => b.hz),
    rightEqHz: preset.eqRight.bands.map((b) => b.hz),
    busGainLeft: 1 / Math.sqrt(Math.max(preset.leftTones.length, 1)),
    busGainRight: 1 / Math.sqrt(Math.max(preset.rightTones.length, 1)),
    alarmConnectedToEq: false,
  };
}
