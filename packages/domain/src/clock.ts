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
