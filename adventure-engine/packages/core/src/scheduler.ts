/**
 * Deterministic cooperative scheduler (spec 01 A6).
 *
 * - Simulated time in milliseconds; no wall clock.
 * - Logic tick: 60 Hz (TICK_MS). Timers have millisecond precision; ticks drive
 *   continuous systems (movement in later phases).
 * - A single LIFO work stack gives depth-first execution "until the first wait
 *   point" without recursion, so long chains/cycles cannot overflow the call stack.
 */

export const TICK_HZ = 60;
export const TICK_MS = 1000 / TICK_HZ;

interface Timer {
  readonly id: number;
  readonly due: number;
  readonly seq: number;
  readonly fn: () => void;
}

export class Scheduler {
  private nowMs = 0;
  private seq = 0;
  private nextTimerId = 1;
  private readonly timers: Timer[] = [];
  private readonly cancelled = new Set<number>();
  private readonly work: Array<() => void> = [];
  private draining = false;
  /** Hooks invoked when the work stack becomes empty; return true if new work was produced. */
  private readonly idleHooks: Array<() => boolean> = [];

  get now(): number {
    return this.nowMs;
  }

  get tick(): number {
    return Math.floor((this.nowMs + 1e-9) / TICK_MS);
  }

  onIdle(hook: () => boolean): void {
    this.idleHooks.push(hook);
  }

  /** Push a work item; it runs before items pushed earlier (LIFO). */
  push(fn: () => void): void {
    this.work.push(fn);
  }

  /** Push several items so that items[0] runs first. */
  pushInOrder(fns: ReadonlyArray<() => void>): void {
    for (let i = fns.length - 1; i >= 0; i--) this.work.push(fns[i] as () => void);
  }

  /** Run all work until quiescent (no recursion). Re-entrant calls are no-ops. */
  drain(): void {
    if (this.draining) return;
    this.draining = true;
    try {
      for (;;) {
        while (this.work.length > 0) (this.work.pop() as () => void)();
        let more = false;
        for (const hook of this.idleHooks) more = hook() || more;
        if (!more && this.work.length === 0) break;
      }
    } finally {
      this.draining = false;
    }
  }

  setTimer(delayMs: number, fn: () => void): number {
    if (!(delayMs >= 0) || !Number.isFinite(delayMs)) throw new RangeError(`timer delay must be a finite number >= 0, got ${delayMs}`);
    const timer: Timer = { id: this.nextTimerId++, due: this.nowMs + delayMs, seq: this.seq++, fn };
    // Insert keeping (due, seq) order.
    let lo = 0;
    let hi = this.timers.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const t = this.timers[mid] as Timer;
      if (t.due < timer.due || (t.due === timer.due && t.seq < timer.seq)) lo = mid + 1;
      else hi = mid;
    }
    this.timers.splice(lo, 0, timer);
    return timer.id;
  }

  clearTimer(id: number): void {
    this.cancelled.add(id);
  }

  get pendingTimers(): number {
    return this.timers.filter((t) => !this.cancelled.has(t.id)).length;
  }

  /** Fire all timers due at or before `untilMs`, in (due, seq) order, then set the clock to `untilMs`. */
  advanceTo(untilMs: number): void {
    if (untilMs < this.nowMs) throw new RangeError(`cannot move time backwards (${untilMs} < ${this.nowMs})`);
    this.drain();
    for (;;) {
      const next = this.timers[0];
      if (next === undefined || next.due > untilMs) break;
      this.timers.shift();
      if (this.cancelled.delete(next.id)) continue;
      this.nowMs = next.due;
      next.fn();
      this.drain();
    }
    this.nowMs = untilMs;
  }

  advance(ms: number): void {
    if (!(ms >= 0)) throw new RangeError(`advance needs ms >= 0, got ${ms}`);
    this.advanceTo(this.nowMs + ms);
  }

  advanceTicks(n: number): void {
    if (!Number.isInteger(n) || n < 0) throw new RangeError(`advanceTicks needs a non-negative integer, got ${n}`);
    this.advanceTo((this.tick + n) * TICK_MS);
  }

  /** Process work plus timers due exactly now (zero-duration completions). */
  settle(): void {
    this.advanceTo(this.nowMs);
  }
}
