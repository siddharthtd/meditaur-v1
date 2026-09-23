export type Clock = {
  nowMs(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clear(id: unknown): void;
};

export const systemClock: Clock = {
  nowMs: () => Date.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clear: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
};

type Timer = { when: number; fn: () => void };

export class FakeClock implements Clock {
  private now = 0;
  private nextId = 1;
  private readonly timers = new Map<number, Timer>();

  nowMs(): number {
    return this.now;
  }

  setTimeout(fn: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.timers.set(id, { when: this.now + Math.max(0, ms), fn });
    return id;
  }

  clear(id: unknown): void {
    if (typeof id === "number") {
      this.timers.delete(id);
    }
  }

  /**
   * Move the wall clock without letting the timers that are now overdue fire.
   *
   * `advance` is time as a *running* tab sees it: every timer that comes due
   * runs. This is the other case — a hidden tab, where time passes and the
   * browser simply does not run the callbacks. A test uses it to hand the engine
   * a deadline that is already in the past while its timer is still pending,
   * which is the situation `SessionEngine.resync()` exists to answer.
   */
  setNow(ms: number): void {
    this.now = ms;
  }

  advance(ms: number): void {
    const target = this.now + ms;
    for (;;) {
      let soonest: { id: number; when: number; fn: () => void } | null = null;
      for (const [id, timer] of this.timers) {
        if (timer.when <= target && (!soonest || timer.when < soonest.when)) {
          soonest = { id, when: timer.when, fn: timer.fn };
        }
      }
      if (!soonest) {
        this.now = target;
        return;
      }
      this.timers.delete(soonest.id);
      this.now = soonest.when;
      soonest.fn();
    }
  }
}
