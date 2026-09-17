import type { AudioPort, CompiledBinaural } from "@meditaur/domain";
import { busGain } from "@meditaur/domain";
import { graphSpecFromPreset } from "./graph-spec.ts";

export type MediaLoader = (assetId: string) => Promise<AudioBuffer | null>;

type ActiveGraph = {
  oscs: OscillatorNode[];
  fade: GainNode;
};

export class WebAudioMixer implements AudioPort {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private alarmGain: GainNode | null = null;
  private duckGain: GainNode | null = null;
  private active: ActiveGraph | null = null;
  private ambientSrc: AudioBufferSourceNode | null = null;
  private ambientGen = 0;
  private alarmGen = 0;
  lastSpec: ReturnType<typeof graphSpecFromPreset> | null = null;
  alarmThroughEq = false;

  constructor(
    private readonly createContext: () => AudioContext = () => new AudioContext(),
    private readonly loadMedia: MediaLoader = async () => null,
  ) {}

  getContext(): AudioContext | null {
    return this.ctx;
  }

  async resume(): Promise<void> {
    this.ensureGraph();
    if (this.ctx?.state === "suspended") {
      await this.ctx.resume();
    }
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  setBinaural(preset: CompiledBinaural | null): void {
    this.ensureGraph();
    if (!this.ctx || !this.master) {
      return;
    }
    this.lastSpec = preset ? graphSpecFromPreset(preset) : null;
    if (this.active) {
      this.fadeOutGraph(this.active, preset?.fadeOutMs ?? 40);
      this.active = null;
    }
    if (!preset) {
      return;
    }
    this.restoreBinaural();
    this.active = this.buildBinaural(preset);
  }

  fadeOutBinaural(): void {
    if (this.active) {
      this.fadeOutGraph(this.active, 40);
      this.active = null;
    }
  }

  duckBinaural(): void {
    this.rampDuck(0.08, 0.04);
  }

  restoreBinaural(): void {
    this.rampDuck(1, 0.08);
  }

  setAlarmVolume(value: number): void {
    this.ensureGraph();
    if (this.alarmGain) {
      this.alarmGain.gain.value = value;
    }
  }

  playAlarm(assetId: string | null): void {
    this.ensureGraph();
    if (!this.ctx || !this.alarmGain) {
      return;
    }
    this.alarmThroughEq = false;
    const gen = ++this.alarmGen;
    if (assetId) {
      void this.loadMedia(assetId).then((buffer) => {
        if (gen !== this.alarmGen) {
          return;
        }
        if (!buffer || !this.ctx || !this.alarmGain) {
          this.playBeep();
          return;
        }
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(this.alarmGain);
        src.start();
      });
      return;
    }
    this.playBeep();
  }

  setAmbient(assetId: string | null, playing: boolean): void {
    this.ensureGraph();
    this.stopAmbient();
    const gen = ++this.ambientGen;
    if (!playing || !assetId || !this.ctx || !this.ambientGain) {
      return;
    }
    void this.loadMedia(assetId).then((buffer) => {
      if (gen !== this.ambientGen || !buffer || !this.ctx || !this.ambientGain) {
        return;
      }
      this.stopAmbient();
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(this.ambientGain);
      src.start();
      this.ambientSrc = src;
    });
  }

  setMasterVolume(value: number): void {
    this.ensureGraph();
    if (this.master) {
      this.master.gain.value = value;
    }
  }

  private ensureGraph(): void {
    if (this.ctx) {
      return;
    }
    const ctx = this.createContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.ambientGain = ctx.createGain();
    this.ambientGain.connect(this.master);
    this.alarmGain = ctx.createGain();
    this.alarmGain.gain.value = 0.6;
    this.alarmGain.connect(this.master);
    this.duckGain = ctx.createGain();
    this.duckGain.connect(this.master);
  }

  private buildBinaural(preset: CompiledBinaural): ActiveGraph {
    const ctx = this.ctx!;
    const merger = ctx.createChannelMerger(2);
    const fade = ctx.createGain();
    fade.gain.value = 0;
    merger.connect(fade);
    fade.connect(this.duckGain ?? this.master!);
    const fadeMs = Math.max(20, preset.fadeInMs);
    fade.gain.linearRampToValueAtTime(1, ctx.currentTime + fadeMs / 1000);
    const oscs: OscillatorNode[] = [];
    this.buildEar(preset, "left", 0, merger, oscs);
    this.buildEar(preset, "right", 1, merger, oscs);
    return { oscs, fade };
  }

  private buildEar(
    preset: CompiledBinaural,
    ear: "left" | "right",
    mergerChannel: number,
    merger: ChannelMergerNode,
    oscs: OscillatorNode[],
  ): void {
    const ctx = this.ctx!;
    const tones = ear === "left" ? preset.leftTones : preset.rightTones;
    const eq = ear === "left" ? preset.eqLeft : preset.eqRight;
    const bus = ctx.createGain();
    bus.gain.value = busGain(tones.length);
    let node: AudioNode = bus;
    for (const band of eq.bands) {
      const filter = ctx.createBiquadFilter();
      filter.type = "peaking";
      filter.frequency.value = band.hz;
      filter.Q.value = band.q;
      filter.gain.value = band.gainDb;
      node.connect(filter);
      node = filter;
    }
    node.connect(merger, 0, mergerChannel);
    const now = ctx.currentTime;
    for (const tone of tones) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = tone.hz;
      const g = ctx.createGain();
      g.gain.value = tone.gain;
      osc.connect(g);
      g.connect(bus);
      osc.start(now);
      oscs.push(osc);
    }
  }

  private fadeOutGraph(graph: ActiveGraph, fadeOutMs: number): void {
    if (!this.ctx) {
      return;
    }
    const end = this.ctx.currentTime + Math.max(20, fadeOutMs) / 1000;
    graph.fade.gain.cancelScheduledValues(this.ctx.currentTime);
    graph.fade.gain.linearRampToValueAtTime(0, end);
    for (const osc of graph.oscs) {
      try {
        osc.stop(end);
      } catch {
        /* already stopped */
      }
    }
  }

  private rampDuck(value: number, seconds: number): void {
    this.ensureGraph();
    if (!this.ctx || !this.duckGain) {
      return;
    }
    const now = this.ctx.currentTime;
    this.duckGain.gain.cancelScheduledValues(now);
    this.duckGain.gain.linearRampToValueAtTime(value, now + seconds);
  }

  private stopAmbient(): void {
    if (!this.ambientSrc) {
      return;
    }
    try {
      this.ambientSrc.stop();
    } catch {
      /* already stopped */
    }
    this.ambientSrc.disconnect();
    this.ambientSrc = null;
  }

  private playBeep(): void {
    if (!this.ctx || !this.alarmGain) {
      return;
    }
    const osc = this.ctx.createOscillator();
    osc.frequency.value = 880;
    osc.connect(this.alarmGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }
}
