import type { CompiledBinaural } from "./models.ts";

export type AudioPort = {
  resume(): Promise<void> | void;
  suspend(): void;
  setBinaural(preset: CompiledBinaural | null): void;
  fadeOutBinaural(): void;
  duckBinaural(): void;
  restoreBinaural(): void;
  playAlarm(assetId: string | null): void;
  setAmbient(assetId: string | null, playing: boolean): void;
  setMasterVolume(value: number): void;
  setAlarmVolume(value: number): void;
};

export class RecordingAudioPort implements AudioPort {
  readonly calls: string[] = [];
  lastPreset: CompiledBinaural | null = null;

  resume(): void {
    this.calls.push("resume");
  }

  suspend(): void {
    this.calls.push("suspend");
  }

  setBinaural(preset: CompiledBinaural | null): void {
    this.lastPreset = preset;
    this.calls.push(preset ? `setBinaural:${preset.leftTones.length}:${preset.rightTones.length}` : "setBinaural:null");
  }

  fadeOutBinaural(): void {
    this.calls.push("fadeOutBinaural");
  }

  duckBinaural(): void {
    this.calls.push("duckBinaural");
  }

  restoreBinaural(): void {
    this.calls.push("restoreBinaural");
  }

  playAlarm(assetId: string | null): void {
    this.calls.push(`playAlarm:${assetId ?? "beep"}`);
  }

  setAmbient(assetId: string | null, playing: boolean): void {
    this.calls.push(`setAmbient:${assetId ?? "none"}:${playing}`);
  }

  setMasterVolume(value: number): void {
    this.calls.push(`setMasterVolume:${value}`);
  }

  setAlarmVolume(value: number): void {
    this.calls.push(`setAlarmVolume:${value}`);
  }
}
