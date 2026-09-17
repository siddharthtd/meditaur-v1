import { describe, expect, it } from "vitest";
import { WebAudioMixer } from "@meditaur/audio-web";
import { classicBinauralPair, defaultEarEq } from "@meditaur/domain";

class FakeParam {
  value = 0;
  linearRampToValueAtTime(): void {}
  cancelScheduledValues(): void {}
}

class FakeNode {
  readonly connections: { node: FakeNode; output: number; input: number }[] = [];
  connect(node: FakeNode, output = 0, input = 0): FakeNode {
    this.connections.push({ node, output, input });
    return node;
  }
  disconnect(): void {}
}

class FakeOsc extends FakeNode {
  type = "sine";
  frequency = new FakeParam();
  started = false;
  start(): void {
    this.started = true;
  }
  stop(): void {}
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeFilter extends FakeNode {
  type = "peaking";
  frequency = new FakeParam();
  Q = new FakeParam();
  gain = new FakeParam();
}

class FakeMerger extends FakeNode {
  constructor(readonly channels: number) {
    super();
  }
}

class FakeContext {
  currentTime = 0;
  state = "running";
  destination = new FakeNode();
  oscillators: FakeOsc[] = [];
  mergers: FakeMerger[] = [];
  sources: Array<FakeNode & { started: boolean; stopped: boolean; loop: boolean }> = [];
  createGain(): FakeGain {
    return new FakeGain();
  }
  createOscillator(): FakeOsc {
    const osc = new FakeOsc();
    this.oscillators.push(osc);
    return osc;
  }
  createBiquadFilter(): FakeFilter {
    return new FakeFilter();
  }
  createChannelMerger(n: number): FakeMerger {
    const m = new FakeMerger(n);
    this.mergers.push(m);
    return m;
  }
  createBufferSource(): FakeNode & {
    buffer: null;
    loop: boolean;
    started: boolean;
    stopped: boolean;
    start: () => void;
    stop: () => void;
  } {
    const src = Object.assign(new FakeNode(), {
      buffer: null,
      loop: false,
      started: false,
      stopped: false,
      start() {
        this.started = true;
      },
      stop() {
        this.stopped = true;
      },
    });
    this.sources.push(src);
    return src;
  }
  resume(): Promise<void> {
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    return Promise.resolve();
  }
}

describe("WebAudioMixer", () => {
  it("starts one oscillator per tone and a 2-channel merger", async () => {
    const ctx = new FakeContext();
    const mixer = new WebAudioMixer(() => ctx as unknown as AudioContext);
    await mixer.resume();
    const pair = classicBinauralPair(200, 8, 0.4);
    mixer.setBinaural({
      leftTones: [pair.left, { id: "x", hz: 300, gain: 0.3 }],
      rightTones: [pair.right],
      fadeInMs: 40,
      fadeOutMs: 40,
      eqLeft: defaultEarEq(),
      eqRight: defaultEarEq(),
    });
    expect(ctx.oscillators).toHaveLength(3);
    expect(ctx.mergers[0]?.channels).toBe(2);
    expect(mixer.lastSpec?.leftOscillators).toHaveLength(2);
  });

  it("routes alarm to master, not through EQ", async () => {
    const ctx = new FakeContext();
    const mixer = new WebAudioMixer(() => ctx as unknown as AudioContext);
    await mixer.resume();
    mixer.playAlarm(null);
    expect(mixer.alarmThroughEq).toBe(false);
  });

  it("stops looping ambient when the engine clears it", async () => {
    const ctx = new FakeContext();
    const mixer = new WebAudioMixer(
      () => ctx as unknown as AudioContext,
      async () => ({}) as AudioBuffer,
    );
    await mixer.resume();
    mixer.setAmbient("rain1", true);
    await Promise.resolve();
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.sources[0]?.started).toBe(true);
    expect(ctx.sources[0]?.loop).toBe(true);
    mixer.setAmbient(null, false);
    expect(ctx.sources[0]?.stopped).toBe(true);
  });

  it("ignores a stale alarm decode after a newer playAlarm", async () => {
    const ctx = new FakeContext();
    let finishStale: (buffer: AudioBuffer) => void = () => {};
    const stale = new Promise<AudioBuffer>((resolve) => {
      finishStale = resolve;
    });
    const mixer = new WebAudioMixer(() => ctx as unknown as AudioContext, async (assetId) => {
      if (assetId === "stale") return stale;
      return {} as AudioBuffer;
    });
    await mixer.resume();
    mixer.playAlarm("stale");
    mixer.playAlarm("fresh");
    await Promise.resolve();
    expect(ctx.sources).toHaveLength(1);
    finishStale({} as AudioBuffer);
    await Promise.resolve();
    expect(ctx.sources).toHaveLength(1);
  });
});
