import { fail } from "./app-error.ts";
import type { AudioPort } from "./audio-port.ts";
import type { Clock } from "./clock.ts";
import type { CompiledBlock, SessionSnapshot } from "./models.ts";

export type SessionStatus =
  | "idle"
  | "loaded"
  | "running"
  | "paused"
  | "awaitingSkip"
  | "completed";

export type EngineEvent =
  | {
      type: "tick";
      remainingMs: number;
      blockIndex: number;
      cycleIndex: number;
    }
  | { type: "blockStart"; blockIndex: number; cycleIndex: number; block: CompiledBlock }
  | { type: "blockEnd"; blockIndex: number }
  | { type: "alarm" }
  | { type: "cycleStart"; cycleIndex: number }
  | { type: "completed" };

export type PublicSessionState = {
  status: SessionStatus;
  instanceId: string | null;
  remainingMs: number;
  blockIndex: number;
  cycleIndex: number;
  block: CompiledBlock | null;
  autoAdvance: boolean;
  /** So the screen can say `cycle 2 of 3`, and stay quiet on a single cycle. */
  cycleCount: number;
  cycleUntilStopped: boolean;
};

export function sessionIsLive(status: SessionStatus): boolean {
  return status === "running" || status === "paused" || status === "awaitingSkip";
}

type Listener = (event: EngineEvent) => void;
type StoreListener = () => void;

export class SessionEngine {
  private snapshot: SessionSnapshot | null = null;
  private status: SessionStatus = "idle";
  private blockIndex = 0;
  private cycleIndex = 0;
  private remainingMs = 0;
  private deadline = 0;
  private pausedRemaining = 0;
  private lastDisplayedSec: number | null = null;
  private expiryTimer: unknown = null;
  private displayTimer: unknown = null;
  private alarmTimer: unknown = null;
  private readonly eventListeners = new Set<Listener>();
  private readonly storeListeners = new Set<StoreListener>();
  private view: PublicSessionState = {
    status: "idle",
    instanceId: null,
    remainingMs: 0,
    blockIndex: 0,
    cycleIndex: 0,
    block: null,
    autoAdvance: false,
    cycleCount: 1,
    cycleUntilStopped: false,
  };

  constructor(
    private readonly clock: Clock,
    private readonly audio: AudioPort,
  ) {}

  subscribe(listener: Listener): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  subscribeStore(onStoreChange: StoreListener): () => void {
    this.storeListeners.add(onStoreChange);
    return () => {
      this.storeListeners.delete(onStoreChange);
    };
  }

  getSnapshot(): PublicSessionState {
    return this.view;
  }

  load(snapshot: SessionSnapshot): void {
    if (sessionIsLive(this.status)) {
      fail("session.alreadyRunning", "A session is already running");
    }
    this.clearTimers();
    this.snapshot = snapshot;
    this.status = "loaded";
    this.blockIndex = 0;
    this.cycleIndex = 0;
    this.remainingMs = snapshot.blocks[0]?.durationMs ?? 0;
    this.lastDisplayedSec = null;
    this.commit();
  }

  async start(): Promise<void> {
    if (!this.snapshot) {
      fail("session.notLoaded", "No session loaded");
    }
    if (this.status === "running") {
      return;
    }
    await this.audio.resume();
    if (this.status === "paused") {
      this.status = "running";
      this.armBlock(this.pausedRemaining);
      return;
    }
    if (this.status === "awaitingSkip") {
      this.skipToNext();
      return;
    }
    if (this.status === "completed" || this.status === "idle") {
      return;
    }
    this.cycleIndex = 0;
    this.blockIndex = 0;
    this.emit({ type: "cycleStart", cycleIndex: 0 });
    this.status = "running";
    this.beginBlock();
  }

  pause(): void {
    if (this.status !== "running") {
      return;
    }
    this.pausedRemaining = Math.max(0, this.deadline - this.clock.nowMs());
    this.remainingMs = this.pausedRemaining;
    this.clearTimers();
    this.audio.suspend();
    this.status = "paused";
    this.commit();
  }

  async resume(): Promise<void> {
    if (this.status !== "paused") {
      return;
    }
    await this.audio.resume();
    this.status = "running";
    this.armBlock(this.pausedRemaining);
  }

  stop(): void {
    this.clearTimers();
    this.audio.fadeOutBinaural();
    this.audio.setAmbient(null, false);
    this.audio.suspend();
    if (this.snapshot) {
      this.status = "loaded";
      this.blockIndex = 0;
      this.cycleIndex = 0;
      this.remainingMs = this.snapshot.blocks[0]?.durationMs ?? 0;
    } else {
      this.status = "idle";
      this.remainingMs = 0;
    }
    this.commit();
  }

  skipToNext(): void {
    if (!this.snapshot) {
      return;
    }
    if (this.status !== "running" && this.status !== "awaitingSkip") {
      return;
    }
    this.clearTimers();
    if (!this.snapshot.stopBinauralOnAlarm) {
      this.audio.restoreBinaural();
    }
    this.advance();
  }

  setAutoAdvance(value: boolean): void {
    if (!this.snapshot) {
      return;
    }
    this.snapshot = { ...this.snapshot, autoAdvance: value };
    this.commit();
  }

  /**
   * The current block's length, set by the reader.
   *
   * The owner's round 5, plan-screen item 2: the one-tap focus session used to
   * open on a frozen `2:00` with no way to say "five minutes instead". The
   * reader sets it before starting, and can still change it while the block runs
   * or is paused — the block's remaining time moves by the same difference, so
   * asking for five more minutes adds five minutes and asking for less takes
   * them off. Set while the alarm rings it is ignored: that block is over.
   */
  setBlockDuration(durationMs: number): void {
    const block = this.currentBlock();
    if (!block || !this.snapshot || durationMs <= 0) {
      return;
    }
    if (this.status !== "loaded" && this.status !== "running" && this.status !== "paused") {
      return;
    }
    const delta = durationMs - block.durationMs;
    this.snapshot = {
      ...this.snapshot,
      blocks: this.snapshot.blocks.map((row, index) =>
        index === this.blockIndex ? { ...row, durationMs } : row,
      ),
    };
    if (this.status === "loaded") {
      this.remainingMs = durationMs;
      this.commit();
      return;
    }
    if (this.status === "paused") {
      this.pausedRemaining = Math.max(0, this.pausedRemaining + delta);
      this.remainingMs = this.pausedRemaining;
      this.commit();
      return;
    }
    const remaining = Math.max(0, this.deadline - this.clock.nowMs());
    this.armBlock(Math.max(0, remaining + delta));
  }

  private beginBlock(): void {
    const block = this.currentBlock();
    if (!block || !this.snapshot) {
      this.complete();
      return;
    }
    this.audio.setBinaural(block.binaural);
    this.audio.setAmbient(block.ambientAssetId, Boolean(block.ambientAssetId));
    this.emit({
      type: "blockStart",
      blockIndex: this.blockIndex,
      cycleIndex: this.cycleIndex,
      block,
    });
    this.status = "running";
    this.armBlock(block.durationMs);
  }

  private armBlock(durationMs: number): void {
    this.clearTimers();
    this.deadline = this.clock.nowMs() + durationMs;
    this.remainingMs = durationMs;
    this.lastDisplayedSec = null;
    this.emitTick();
    this.commit();
    this.expiryTimer = this.clock.setTimeout(() => this.onExpiry(), durationMs);
    this.armDisplay();
  }

  private armDisplay(): void {
    const remaining = Math.max(0, this.deadline - this.clock.nowMs());
    this.remainingMs = remaining;
    const displayed = Math.ceil(remaining / 1000);
    if (displayed !== this.lastDisplayedSec) {
      this.lastDisplayedSec = displayed;
      this.emitTick();
      this.commit();
    }
    if (remaining <= 0) {
      return;
    }
    const nextBoundary = (Math.ceil(remaining / 1000) - 1) * 1000;
    const wait = Math.max(1, remaining - nextBoundary);
    this.displayTimer = this.clock.setTimeout(() => this.armDisplay(), wait);
  }

  private emitTick(): void {
    this.emit({
      type: "tick",
      remainingMs: Math.max(0, this.deadline - this.clock.nowMs()),
      blockIndex: this.blockIndex,
      cycleIndex: this.cycleIndex,
    });
  }

  private onExpiry(): void {
    const block = this.currentBlock();
    if (!block || !this.snapshot) {
      this.complete();
      return;
    }
    this.clearTimers();
    this.remainingMs = 0;
    this.emit({ type: "blockEnd", blockIndex: this.blockIndex });
    if (this.snapshot.stopBinauralOnAlarm) {
      this.audio.fadeOutBinaural();
    } else {
      this.audio.duckBinaural();
    }
    this.audio.playAlarm(block.alarmAssetId);
    this.emit({ type: "alarm" });
    const holdMs = block.alarmDurationMs > 0 ? block.alarmDurationMs : 200;
    if (this.snapshot.autoAdvance) {
      this.alarmTimer = this.clock.setTimeout(() => {
        if (!this.snapshot?.stopBinauralOnAlarm) {
          this.audio.restoreBinaural();
        }
        this.advance();
      }, holdMs);
    } else {
      this.status = "awaitingSkip";
      this.commit();
    }
  }

  private advance(): void {
    if (!this.snapshot) {
      return;
    }
    this.blockIndex += 1;
    if (this.blockIndex >= this.snapshot.blocks.length) {
      this.cycleIndex += 1;
      if (this.snapshot.cycleUntilStopped || this.cycleIndex < this.snapshot.cycleCount) {
        this.blockIndex = 0;
        this.emit({ type: "cycleStart", cycleIndex: this.cycleIndex });
        this.beginBlock();
        return;
      }
      this.complete();
      return;
    }
    this.beginBlock();
  }

  private complete(): void {
    this.clearTimers();
    this.audio.fadeOutBinaural();
    this.audio.setAmbient(null, false);
    this.status = "completed";
    this.remainingMs = 0;
    this.emit({ type: "completed" });
    this.commit();
  }

  private currentBlock(): CompiledBlock | null {
    return this.snapshot?.blocks[this.blockIndex] ?? null;
  }

  private clearTimers(): void {
    this.clock.clear(this.expiryTimer);
    this.clock.clear(this.displayTimer);
    this.clock.clear(this.alarmTimer);
    this.expiryTimer = null;
    this.displayTimer = null;
    this.alarmTimer = null;
  }

  private emit(event: EngineEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  private commit(): void {
    this.view = {
      status: this.status,
      instanceId: this.snapshot?.instanceId ?? null,
      remainingMs: this.remainingMs,
      blockIndex: this.blockIndex,
      cycleIndex: this.cycleIndex,
      block: this.currentBlock(),
      autoAdvance: this.snapshot?.autoAdvance ?? false,
      cycleCount: this.snapshot?.cycleCount ?? 1,
      cycleUntilStopped: this.snapshot?.cycleUntilStopped ?? false,
    };
    for (const listener of this.storeListeners) {
      listener();
    }
  }
}
