/**
 * Clock abstraction for all media players (phase 4). Players never read wall
 * time: headless runs use the engine's simulated scheduler, tests a manual
 * clock, and the browser the engine scheduler driven by requestAnimationFrame.
 */

export interface Clock {
  /** Milliseconds on this clock. */
  now(): number;
  /** Run `fn` after `ms`; returns a handle for `clearTimer`. */
  setTimer(ms: number, fn: () => void): number;
  clearTimer(id: number): void;
}

/** Anything with the engine scheduler's timer API. */
export interface SchedulerLike {
  readonly now: number;
  setTimer(ms: number, fn: () => void): number;
  clearTimer(id: number): void;
}

/** A clock on the engine's simulated time (deterministic, 60 Hz logic). */
export function schedulerClock(sched: SchedulerLike): Clock {
  return {
    now: () => sched.now,
    setTimer: (ms, fn) => sched.setTimer(ms, fn),
    clearTimer: (id) => sched.clearTimer(id),
  };
}

/** Manual clock for unit tests: time only moves with `advance`. Timers fire in due order, ties in creation order. */
export class ManualClock implements Clock {
  private t = 0;
  private seq = 0;
  private readonly timers = new Map<number, { due: number; seq: number; fn: () => void }>();

  now(): number {
    return this.t;
  }

  setTimer(ms: number, fn: () => void): number {
    const id = ++this.seq;
    this.timers.set(id, { due: this.t + Math.max(0, ms), seq: id, fn });
    return id;
  }

  clearTimer(id: number): void {
    this.timers.delete(id);
  }

  get pending(): number {
    return this.timers.size;
  }

  advance(ms: number): void {
    const until = this.t + ms;
    for (;;) {
      let next: [number, { due: number; seq: number; fn: () => void }] | undefined;
      for (const e of this.timers) {
        if (e[1].due <= until && (next === undefined || e[1].due < next[1].due || (e[1].due === next[1].due && e[1].seq < next[1].seq))) next = e;
      }
      if (next === undefined) break;
      this.timers.delete(next[0]);
      this.t = next[1].due;
      next[1].fn();
    }
    this.t = until;
  }
}
