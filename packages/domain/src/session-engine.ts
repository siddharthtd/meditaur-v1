import { fail } from "./app-error.ts";
import type { AudioPort } from "./audio-port.ts";
import type { Clock } from "./clock.ts";
import type { CompiledBlock, CompiledStage, SessionSnapshot } from "./models.ts";
import { DEFAULT_ALARM_ENABLED } from "./plan-blocks.ts";

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
      blockRemainingMs: number;
      blockIndex: number;
      stageIndex: number;
      cycleIndex: number;
    }
  | { type: "blockStart"; blockIndex: number; cycleIndex: number; block: CompiledBlock }
  | { type: "blockEnd"; blockIndex: number }
  | { type: "stageStart"; blockIndex: number; stageIndex: number; stage: CompiledStage }
  | { type: "stageEnd"; blockIndex: number; stageIndex: number }
  | { type: "alarm" }
  | { type: "cycleStart"; cycleIndex: number }
  | { type: "completed" };

export type PublicSessionState = {
  status: SessionStatus;
  instanceId: string | null;
  /** What is left of the *stage* on screen — the number the big clock reads. */
  remainingMs: number;
  /** What is left of the block: the stage plus every stage after it. */
  blockRemainingMs: number;
  blockIndex: number;
  /** Which stage of the block is running, and how many it has. */
  stageIndex: number;
  stageCount: number;
  stage: CompiledStage | null;
  cycleIndex: number;
  block: CompiledBlock | null;
  autoAdvance: boolean;
  /**
   * The alarm for the block on screen: its own answer where it has one, and the
   * plan's behind it (the owner's round 17). The run screen's latch writes the
   * block, so this can change as the session walks from one meditation to the next.
   */
  alarmEnabled: boolean;
  /** So the screen can say `cycle 2 of 3`, and stay quiet on a single cycle. */
  cycleCount: number;
  cycleUntilStopped: boolean;
  /**
   * The block on screen is over and its alarm is ringing (or waiting to be
   * skipped), so there is nothing to pause: the screen draws `Skip`/`Stop` and
   * leaves the Pause control out rather than offering a press with no effect.
   */
  holdingAlarm: boolean;
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
  /**
   * Which stage of the block is running.
   *
   * The engine walks stages inside a block and only leaves the block — with its
   * alarm — when the *last* stage is done (§12.11). `skipToNext` still hops a whole
   * block, because that is what the reader asks for when a block is over.
   */
  private stageIndex = 0;
  private cycleIndex = 0;
  private remainingMs = 0;
  private deadline = 0;
  private pausedRemaining = 0;
  private lastDisplayedSec: number | null = null;
  private expiryTimer: unknown = null;
  private displayTimer: unknown = null;
  private alarmTimer: unknown = null;
  /**
   * The block on screen has run out and its alarm is ringing, or is waiting for
   * the reader to skip it. Nothing may arm a block until that is done with.
   *
   * Without this, the block's own end was indistinguishable from a running
   * block: pressing Pause while the alarm rang cleared the hold timer and left a
   * `0 ms` block to resume into, which expired at once and rang *the same alarm
   * a second time* (measured; the review's finding is summarised in
   * docs/HISTORY.md). `setStageDuration`
   * promises in its own doc that it is ignored while the alarm rings; this flag
   * is what makes that true, and `resync()` would otherwise expire the same
   * block again on a tab that came back mid-alarm.
   */
  private holdingAlarm = false;
  private readonly eventListeners = new Set<Listener>();
  private readonly storeListeners = new Set<StoreListener>();
  private view: PublicSessionState = {
    status: "idle",
    instanceId: null,
    remainingMs: 0,
    blockRemainingMs: 0,
    blockIndex: 0,
    stageIndex: 0,
    stageCount: 0,
    stage: null,
    cycleIndex: 0,
    block: null,
    autoAdvance: false,
    alarmEnabled: DEFAULT_ALARM_ENABLED,
    cycleCount: 1,
    cycleUntilStopped: false,
    holdingAlarm: false,
  };
  /**
   * Whether the position on screen is the reader's rather than the walk's.
   *
   * `loaded` means two different things: "nothing has run yet" — the state `load()`
   * and `stop()` leave behind, which is always block 0 stage 0 — and "the reader
   * has moved the session to a stage by hand and it is waiting for Start"
   * (`seek`). Only the second may survive a `start()`, because the first has to
   * begin at the beginning.
   */
  private positioned = false;

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
    this.holdingAlarm = false;
    this.positioned = false;
    this.snapshot = snapshot;
    this.status = "loaded";
    this.blockIndex = 0;
    this.stageIndex = 0;
    this.cycleIndex = 0;
    this.remainingMs = this.stageOf(snapshot.blocks[0] ?? null, 0)?.durationMs ?? 0;
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
    await this.wakeAudio();
    if (this.status === "paused") {
      this.status = "running";
      this.armStage(this.pausedRemaining);
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
    // A stage the reader moved to by hand is where the session begins: `seek` is
    // how a card on the screen, a click on a stage and an arrow key all say
    // "start here", and only that flag is what makes holding the position safe.
    // `load()` and `stop()` clear it, so an ordinary Start still begins at the
    // plan's first block.
    if (!this.positioned) this.blockIndex = 0;
    this.emit({ type: "cycleStart", cycleIndex: 0 });
    this.status = "running";
    this.positioned = false;
    this.beginBlock(this.stageIndex);
  }

  pause(): void {
    // A paused alarm hold is not a state to be in: the block is over and the
    // alarm is ringing. See `holdingAlarm` — pausing here used to leave a
    // `0 ms` block behind, and resuming rang the same alarm twice.
    if (this.status !== "running" || this.holdingAlarm) {
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
    await this.wakeAudio();
    this.status = "running";
    this.armStage(this.pausedRemaining);
  }

  /**
   * Ask the audio layer to start, and never let its answer stop the clock.
   *
   * `AudioPort.resume()` is a promise the browser can reject — `NotAllowedError`
   * while the reader has not yet touched the page, a device that went away — and
   * this used to be awaited uncaught, so `start()` rejected with the machine
   * still `loaded`: a session that looked started and was not. The clock is the
   * product and the sound is the accompaniment, so a session with no sound is
   * the better failure; the reader still gets the timer, the stages and the
   * alarm asset's own gap.
   */
  private async wakeAudio(): Promise<void> {
    try {
      await this.audio.resume();
    } catch {
      // Deliberately swallowed: see above. There is nowhere to report it that
      // would not risk stopping the session the reader just started.
    }
  }

  stop(): void {
    this.clearTimers();
    // Stop ends the block the alarm belonged to, so nothing is holding when the
    // reader starts again.
    this.holdingAlarm = false;
    this.positioned = false;
    this.audio.fadeOutBinaural();
    this.audio.setAmbient(null, false);
    this.audio.suspend();
    if (this.snapshot) {
      this.status = "loaded";
      this.blockIndex = 0;
      this.stageIndex = 0;
      this.cycleIndex = 0;
      this.remainingMs = this.stageOf(this.snapshot.blocks[0] ?? null, 0)?.durationMs ?? 0;
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

  /**
   * Move the session to a stage **without running it**, and clear its clock.
   *
   * The owner's round 17, and one method for four asks that are the same ask: the
   * `→`/`←` keys step a stage or a meditation at a time, `Restart` puts a stage
   * back to the length it was set to, and picking a stage on the screen before
   * Start decides where the session begins. All four mean *"put me here, and let
   * me press Start"* — so the target stage is armed at its **own full length**
   * rather than resumed part-way, nothing is ticking, and the screen draws Start
   * again. The reader's rule for the first of these is exact: *"hold until start is
   * pressed. Not paused at all, clock should be cleared."*
   *
   * `paused` would be the other candidate and is deliberately not used: a pause
   * remembers how much of the stage was left, and this is the one move that must
   * forget it. Refused while the alarm rings, like `pause()` — the block on screen
   * is over and `Skip`/`Stop` are the honest presses — and refused while the walk
   * has finished, because a completed session has nowhere to hold.
   */
  seek(blockIndex: number, stageIndex: number): void {
    if (!this.snapshot || this.holdingAlarm) return;
    if (this.status === "idle" || this.status === "completed") return;
    const block = this.snapshot.blocks[blockIndex];
    const stage = this.stageOf(block ?? null, stageIndex);
    if (!block || !stage) return;
    this.clearTimers();
    this.audio.fadeOutBinaural();
    this.audio.setAmbient(null, false);
    this.audio.suspend();
    this.blockIndex = blockIndex;
    this.stageIndex = stageIndex;
    this.remainingMs = Math.max(0, stage.durationMs);
    this.status = "loaded";
    this.positioned = true;
    this.lastDisplayedSec = null;
    this.commit();
  }

  setAutoAdvance(value: boolean): void {
    if (!this.snapshot) {
      return;
    }
    this.snapshot = { ...this.snapshot, autoAdvance: value };
    this.commit();
  }

  /**
   * The reader's `Alarm` switch, beside `Auto-advance` on the screen.
   *
   * It writes the **block on screen** (the owner's round 17, item 13): the alarm is
   * no longer one answer for a whole plan, because a circuit can hold a silent Thanks
   * Giving beside seven ringing chakras. A block that has never been asked takes the
   * plan's answer (`null`), so a plan nobody has edited still behaves as §12.21
   * describes — the plan's switch decides — and this press is what gives the block
   * an answer of its own.
   */
  setAlarmEnabled(value: boolean): void {
    if (!this.snapshot) {
      return;
    }
    this.snapshot = {
      ...this.snapshot,
      blocks: this.snapshot.blocks.map((row, index) =>
        index === this.blockIndex ? { ...row, alarmEnabled: value } : row,
      ),
    };
    this.commit();
  }

  /**
   * The current stage's length, set by the reader.
   *
   * The owner's round 5 asked for a block whose length can be set before and during
   * a run; round 15 gave a block several stages, so the control moved to the stage
   * that is showing and this method moved with it. The stage's remaining time moves
   * by the same difference, so asking for five more minutes adds five and asking
   * for less takes them off. Set while the alarm rings it is ignored: that block is
   * over.
   *
   * **Zero is a length.** The owner's round 11: `0:00` is allowed, and means the
   * stage ends the moment it starts. Refusing zero was the whole reason the minutes
   * wheel would not come to rest on `0` while the seconds wheel read `00`, which
   * reads as a stuck wheel rather than as a rule.
   */
  setStageDuration(durationMs: number, stageIndex: number = this.stageIndex): void {
    const block = this.currentBlock();
    if (!block || !this.snapshot || durationMs < 0) {
      return;
    }
    if (
      this.holdingAlarm ||
      (this.status !== "loaded" && this.status !== "running" && this.status !== "paused")
    ) {
      return;
    }
    // Before Start nothing has run, so any stage's row is editable — that is what
    // "the timers are editable before Start" means. Once it is running, only the
    // stage that is playing or waiting can move: the ones behind it are gone.
    const target = this.status === "loaded" ? stageIndex : this.stageIndex;
    if (target !== stageIndex && this.status !== "loaded") {
      return;
    }
    const editing = block.stages[target];
    if (!editing) {
      return;
    }
    const delta = durationMs - editing.durationMs;
    const stages = block.stages.map((row, index) =>
      index === target ? { ...row, durationMs } : row,
    );
    this.snapshot = {
      ...this.snapshot,
      blocks: this.snapshot.blocks.map((row, index) =>
        index === this.blockIndex
          ? { ...row, stages, durationMs: row.durationMs + delta }
          : row,
      ),
    };
    if (target !== this.stageIndex) {
      this.commit();
      return;
    }
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
    this.armStage(Math.max(0, remaining + delta));
  }

  /**
   * One of the current stage's own switches, set by the reader — `binaural` or
   * `autoScroll`.
   *
   * The owner's §7: "changing a stage's binaural or auto-scroll takes effect at
   * that stage (and for binaural, immediately if it is the stage playing)". Both are
   * per stage (§12.21), so this follows `setStageDuration`'s rule about *which* row
   * is editable: before Start any of them, afterwards only the one playing. A stage
   * whose `binaural` changes while it is playing is applied to the tones at once —
   * that is the "immediately" half — and the stage after it hears the difference at
   * its own boundary, which is what `beginStage` already does.
   */
  setStageFlag(
    flag: "binaural" | "autoScroll",
    value: boolean,
    stageIndex: number = this.stageIndex,
  ): void {
    const block = this.currentBlock();
    if (!block || !this.snapshot || this.holdingAlarm) {
      return;
    }
    if (this.status !== "loaded" && this.status !== "running" && this.status !== "paused") {
      return;
    }
    const target = this.status === "loaded" ? stageIndex : this.stageIndex;
    if (target !== stageIndex && this.status !== "loaded") {
      return;
    }
    const editing = block.stages[target];
    if (!editing || editing[flag] === value) {
      return;
    }
    const stages = block.stages.map((row, index) =>
      index === target ? { ...row, [flag]: value } : row,
    );
    this.snapshot = {
      ...this.snapshot,
      blocks: this.snapshot.blocks.map((row, index) =>
        index === this.blockIndex ? { ...row, stages } : row,
      ),
    };
    if (flag === "binaural" && target === this.stageIndex && this.status !== "loaded") {
      // The stage on screen is the one that changed, so the tones move now rather
      // than at the next boundary: `beginStage`'s rule, run early.
      this.audio.setBinaural(value ? block.binaural : null);
    }
    this.commit();
  }

  /**
   * Re-check the clock against the current deadline right now.
   *
   * A hidden tab throttles or suspends `setTimeout`, so the engine can be
   * holding a timer that came due several minutes ago and simply has not run.
   * Coming back to the tab calls this rather than waiting for it, so a block
   * that ended while nobody was looking is expired at the moment it is looked at
   * again — with the same `blockEnd` and `alarm` events, in the same order, as a
   * timer that fired on time. Safe to call at any time; a no-op outside
   * `running`.
   */
  resync(): void {
    if (this.status !== "running") {
      return;
    }
    if (this.clock.nowMs() >= this.deadline) {
      this.expireIfCurrent(this.deadline, this.stageIndex);
      return;
    }
    this.armDisplay();
  }

  private beginBlock(stageIndex = 0): void {
    const block = this.currentBlock();
    if (!block || !this.snapshot) {
      this.complete();
      return;
    }
    this.audio.setAmbient(block.ambientAssetId, Boolean(block.ambientAssetId));
    this.emit({
      type: "blockStart",
      blockIndex: this.blockIndex,
      cycleIndex: this.cycleIndex,
      block,
    });
    this.status = "running";
    this.beginStage(stageIndex, true);
  }

  /**
   * Start the stage at `index` of the current block.
   *
   * Binaural is **per stage**: it is set once for the block, from the stage that
   * starts it, and a boundary only touches it when the two stages disagree (§12.12)
   * — so turning it off for the intentions does not restart it for the symbols, and
   * a stage that shares the flag before it hears one continuous tone.
   *
   * `enteringBlock` is that "once for the block": a block the reader begins in the
   * middle of — a Start on a selected stage, an arrow key — has no stage boundary
   * before it, so the comparison with the stage above it would find two stages that
   * agree and never set the tones at all.
   */
  private beginStage(index: number, enteringBlock = false): void {
    const block = this.currentBlock();
    const stage = this.stageOf(block, index);
    if (!block || !stage) {
      this.complete();
      return;
    }
    const previous = enteringBlock ? null : this.stageOf(block, index - 1);
    if (!previous || previous.binaural !== stage.binaural) {
      this.audio.setBinaural(stage.binaural ? block.binaural : null);
    }
    this.stageIndex = index;
    this.emit({ type: "stageStart", blockIndex: this.blockIndex, stageIndex: index, stage });
    this.armStage(stage.durationMs);
  }

  private armStage(durationMs: number): void {
    this.clearTimers();
    // A stage is being armed, so whatever came before it is finished with.
    this.holdingAlarm = false;
    const deadline = this.clock.nowMs() + durationMs;
    this.deadline = deadline;
    this.remainingMs = durationMs;
    this.lastDisplayedSec = null;
    this.emitTick();
    this.commit();
    this.expiryTimer = this.clock.setTimeout(
      () => this.expireIfCurrent(deadline, this.stageIndex),
      durationMs,
    );
    this.armDisplay();
  }

  private armDisplay(): void {
    // Idempotent on purpose. `resync()` re-arms this chain when the tab comes
    // back, and the link that was already pending is still pending — without the
    // clear the two chains would each keep scheduling the next one.
    this.clock.clear(this.displayTimer);
    this.displayTimer = null;
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
      blockRemainingMs: this.blockRemainingMs(),
      blockIndex: this.blockIndex,
      stageIndex: this.stageIndex,
      cycleIndex: this.cycleIndex,
    });
  }

  /** One stage of a block, or null when the index is past its last. */
  private stageOf(block: CompiledBlock | null, index: number): CompiledStage | null {
    return block?.stages[index] ?? null;
  }

  private currentStage(): CompiledStage | null {
    return this.stageOf(this.currentBlock(), this.stageIndex);
  }

  /**
   * What is left of the whole block: this stage, plus every stage after it.
   *
   * The header promises the block's length, the big clock reads the stage's; both
   * come from here so they can never disagree about how the block is going.
   */
  private blockRemainingMs(): number {
    const block = this.currentBlock();
    if (!block) return 0;
    const stage = this.stageOf(block, this.stageIndex);
    if (!stage) return 0;
    const rest = block.stages
      .slice(this.stageIndex + 1)
      .reduce((total, row) => total + Math.max(0, row.durationMs), 0);
    const remaining =
      this.status === "paused"
        ? this.pausedRemaining
        : Math.max(0, this.deadline - this.clock.nowMs());
    return remaining + rest;
  }

  /**
   * The expiry the armed timer meant to deliver — and nothing else.
   *
   * A timer can still run after the block it belonged to is gone: the tab was
   * hidden, `resync()` expired the block on the way back, and only then does the
   * callback the browser was already sitting on fire. `clearTimeout` cannot
   * unqueue a task that has been queued, so `clearTimers()` alone is not enough.
   * The deadline a timer was armed for identifies the block it belonged to, so
   * anything that moved on in the meantime — a new block, a pause, a stop, a
   * completion — leaves an older deadline behind and this refuses, instead of
   * expiring the block that replaced it. `FakeClock` cannot reproduce the queued
   * task (its `clear` really does drop the timer), so this guard is reachable in
   * a browser, not in a unit test.
   */
  private expireIfCurrent(deadline: number, stageIndex: number): void {
    if (
      this.status !== "running" ||
      this.holdingAlarm ||
      this.deadline !== deadline ||
      this.stageIndex !== stageIndex
    ) {
      return;
    }
    this.onExpiry();
  }

  /**
   * The current stage is over.
   *
   * The owner's §12.11: the alarm rings **once**, at the end of the whole block, so
   * a stage boundary is a boundary and nothing else — no alarm, no tone restart, no
   * pause. The block's own end is the last stage's end, and it behaves exactly as it
   * did when a block had one timer.
   */
  private onExpiry(): void {
    const block = this.currentBlock();
    if (!block || !this.snapshot) {
      this.complete();
      return;
    }
    this.clearTimers();
    this.remainingMs = 0;
    const nextStage = this.stageIndex + 1;
    if (nextStage < block.stages.length) {
      this.emit({
        type: "stageEnd",
        blockIndex: this.blockIndex,
        stageIndex: this.stageIndex,
      });
      this.beginStage(nextStage);
      return;
    }
    // The block is over from here on, whether the alarm holds or the reader is
    // asked to skip. Set — and committed — before anything below can re-enter,
    // so a listener that pauses, re-syncs or sets a length during the ring is
    // refused, and the screen stops drawing a Pause for a block that has ended.
    this.holdingAlarm = true;
    this.commit();
    this.emit({ type: "stageEnd", blockIndex: this.blockIndex, stageIndex: this.stageIndex });
    this.emit({ type: "blockEnd", blockIndex: this.blockIndex });
    // The alarm's own switch, **this block's** (§12.4, and the owner's round 17 for
    // whose answer it is). Off, nothing sounds and nothing is ducked: the tones carry
    // straight on into the next stage, which is what a stage boundary does — the duck
    // below exists to make room for the alarm, and there is no alarm to make room
    // for. The reader still gets the same choice about moving on, so `autoAdvance`
    // decides exactly as it does below.
    if (block.alarmEnabled === false) {
      if (this.snapshot.autoAdvance || !this.hasNextBlock()) {
        this.advance();
      } else {
        this.status = "awaitingSkip";
        this.commit();
      }
      return;
    }
    if (this.snapshot.stopBinauralOnAlarm) {
      this.audio.fadeOutBinaural();
    } else {
      this.audio.duckBinaural();
    }
    this.audio.playAlarm(block.alarmAssetId);
    this.emit({ type: "alarm" });
    const holdMs = block.alarmDurationMs > 0 ? block.alarmDurationMs : 200;
    // `autoAdvance` only decides anything while there is a block after this one.
    // At the end of the session it is not a choice, it is the end, and stopping
    // there handed the reader a Stop/Skip pair whose only honest press was Stop.
    if (this.snapshot.autoAdvance || !this.hasNextBlock()) {
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
    this.holdingAlarm = false;
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

  /**
   * Is there a block after the one on screen — later in this cycle, or the same
   * block again on a repeat?
   *
   * `advance()` is the walk; this is the question of whether that walk would go
   * anywhere. `onExpiry` asks it so that `autoAdvance: false` only ever means
   * "stop and let me choose" while there is still something to choose between.
   * At the last block there is not, and stopping there left the reader holding a
   * Stop/Skip pair whose only honest press was Stop — which is what the owner hit
   * in round 11, run A: the clock read `0:00`, the alarm had rung, and the session
   * had not finished.
   */
  private hasNextBlock(): boolean {
    if (!this.snapshot) return false;
    if (this.blockIndex + 1 < this.snapshot.blocks.length) return true;
    return (
      this.snapshot.cycleUntilStopped || this.cycleIndex + 1 < this.snapshot.cycleCount
    );
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
      try {
        listener(event);
      } catch {
        // A listener is a *reader* of the engine, never a driver of it. One
        // that throws — a screen mid-render, a store subscriber — used to take
        // the whole timer chain with it, because `emitTick`/`armStage` call this
        // on the way to arming the block's expiry. The session stopped dead and
        // said nothing. Swallowed rather than reported: there is no reporting
        // path here that could not fail the same way, and the clock matters more
        // than the message.
      }
    }
  }

  private commit(): void {
    this.view = {
      status: this.status,
      instanceId: this.snapshot?.instanceId ?? null,
      remainingMs: this.remainingMs,
      blockRemainingMs: this.blockRemainingMs(),
      blockIndex: this.blockIndex,
      stageIndex: this.stageIndex,
      stageCount: this.currentBlock()?.stages.length ?? 0,
      stage: this.currentStage(),
      cycleIndex: this.cycleIndex,
      block: this.currentBlock(),
      autoAdvance: this.snapshot?.autoAdvance ?? false,
      // The block on screen first, and the plan's answer behind it: a session keeps
      // the plan's stamp until a block (or the reader's press) says otherwise.
      alarmEnabled:
        this.currentBlock()?.alarmEnabled ?? this.snapshot?.alarmEnabled ?? DEFAULT_ALARM_ENABLED,
      cycleCount: this.snapshot?.cycleCount ?? 1,
      cycleUntilStopped: this.snapshot?.cycleUntilStopped ?? false,
      holdingAlarm: this.holdingAlarm,
    };
    for (const listener of this.storeListeners) {
      listener();
    }
  }
}
