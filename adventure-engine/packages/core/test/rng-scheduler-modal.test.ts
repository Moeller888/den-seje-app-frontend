import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ModalLocks, Rng, Scheduler, TICK_MS } from "../src/index.ts";

describe("Rng (spec 01 A6.3)", () => {
  it("is deterministic per seed and differs between seeds", () => {
    const a = Rng.fromSeed("s");
    const b = Rng.fromSeed("s");
    const c = Rng.fromSeed("t");
    const seqA = Array.from({ length: 5 }, () => a.nextUint32());
    expect(Array.from({ length: 5 }, () => b.nextUint32())).toEqual(seqA);
    expect(Array.from({ length: 5 }, () => c.nextUint32())).not.toEqual(seqA);
  });

  it("serializes and resumes exactly (TS-E10 groundwork)", () => {
    const a = Rng.fromSeed("resume");
    a.int(10);
    const state = a.serialize();
    expect(state.algorithm).toBe("xoshiro128**");
    expect(state.state).toMatch(/^[0-9a-f]{32}$/);
    const b = Rng.fromState(state);
    expect(Array.from({ length: 100 }, () => b.int(1000))).toEqual(Array.from({ length: 100 }, () => a.int(1000)));
  });

  it("rejects invalid state", () => {
    expect(() => Rng.fromState({ algorithm: "xoshiro128**", state: "zz" })).toThrow(/invalid RNG state/);
    expect(() => Rng.fromState({ algorithm: "xoshiro128**", state: "0".repeat(32) })).toThrow(/all zero/);
    expect(() => Rng.fromState({ algorithm: "other" as "xoshiro128**", state: "1".repeat(32) })).toThrow();
  });

  it("int/intRange stay in range (property) and validate arguments", () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 1, max: 1000 }), (seed, n) => {
        const r = Rng.fromSeed(seed);
        const x = r.int(n);
        const y = r.intRange(5, 5 + n);
        return x >= 0 && x < n && Number.isInteger(x) && y >= 5 && y <= 5 + n;
      }),
    );
    const r = Rng.fromSeed("x");
    expect(() => r.int(0)).toThrow(RangeError);
    expect(() => r.int(1.5)).toThrow(RangeError);
    expect(() => r.intRange(3, 2)).toThrow(RangeError);
    expect(r.int(0x100000000)).toBeGreaterThanOrEqual(0);
  });

  it("rejection sampling retries values above the limit", () => {
    // n = 3·2^30 makes the limit 3·2^30, so roughly a quarter of draws are rejected.
    const r = Rng.fromSeed("reject");
    for (let i = 0; i < 64; i++) expect(r.int(3 * 2 ** 30)).toBeLessThan(3 * 2 ** 30);
  });
});

describe("Scheduler (spec 01 A6)", () => {
  it("runs work LIFO and pushInOrder keeps the given order", () => {
    const s = new Scheduler();
    const out: string[] = [];
    s.push(() => out.push("first-pushed"));
    s.pushInOrder([() => out.push("a"), () => out.push("b")]);
    s.drain();
    expect(out).toEqual(["a", "b", "first-pushed"]);
  });

  it("drain is not re-entrant and runs idle hooks until quiescent", () => {
    const s = new Scheduler();
    const out: string[] = [];
    let produced = false;
    s.onIdle(() => {
      if (produced) return false;
      produced = true;
      s.push(() => out.push("from-idle"));
      return true;
    });
    s.push(() => {
      s.drain();
      out.push("work");
    });
    s.drain();
    expect(out).toEqual(["work", "from-idle"]);
  });

  it("fires timers in (due, insertion) order and supports cancellation", () => {
    const s = new Scheduler();
    const out: string[] = [];
    s.setTimer(10, () => out.push("10a"));
    s.setTimer(5, () => out.push("5"));
    const cancelled = s.setTimer(7, () => out.push("7"));
    s.setTimer(10, () => out.push("10b"));
    s.clearTimer(cancelled);
    expect(s.pendingTimers).toBe(3);
    s.advance(9);
    expect(out).toEqual(["5"]);
    expect(s.now).toBe(9);
    s.advance(1);
    expect(out).toEqual(["5", "10a", "10b"]);
  });

  it("settle fires zero-delay timers; time never moves backwards", () => {
    const s = new Scheduler();
    let fired = 0;
    s.setTimer(0, () => fired++);
    s.settle();
    expect(fired).toBe(1);
    expect(() => s.advanceTo(-1)).toThrow(RangeError);
    expect(() => s.advance(-1)).toThrow(RangeError);
    expect(() => s.setTimer(-1, () => {})).toThrow(RangeError);
    expect(() => s.setTimer(Number.POSITIVE_INFINITY, () => {})).toThrow(RangeError);
  });

  it("60 Hz logic ticks", () => {
    const s = new Scheduler();
    expect(TICK_MS).toBeCloseTo(16.6667, 3);
    s.advanceTicks(60);
    expect(s.now).toBeCloseTo(1000, 9);
    expect(s.tick).toBe(60);
    s.advanceTicks(0);
    expect(s.tick).toBe(60);
    expect(() => s.advanceTicks(-1)).toThrow(RangeError);
    expect(() => s.advanceTicks(1.5)).toThrow(RangeError);
  });

  it("long timer chains do not recurse", () => {
    const s = new Scheduler();
    let n = 0;
    const step = (): void => {
      n++;
      if (n < 20000) s.setTimer(0, step);
    };
    s.setTimer(0, step);
    s.settle();
    expect(n).toBe(20000);
  });
});

describe("ModalLocks (spec 04 D7)", () => {
  it("reference counts handles; double release is a no-op", () => {
    const events: string[] = [];
    const m = new ModalLocks((e, lock, count) => events.push(`${e}:${lock.reason}:${count}`));
    const a = m.acquire("x", "r1");
    const b = m.acquire("y", "r2");
    expect(m.count).toBe(2);
    expect(m.isModal).toBe(true);
    expect(m.list().map((l) => l.reason)).toEqual(["x", "y"]);
    expect(m.release(a)).toBe(true);
    expect(m.release(a)).toBe(false);
    expect(m.release(b)).toBe(true);
    expect(m.isModal).toBe(false);
    expect(events).toEqual(["acquire:x:1", "acquire:y:2", "release:x:1", "release:y:0"]);
    expect(new ModalLocks().acquire("z", "r")).toBe(1);
  });
});
