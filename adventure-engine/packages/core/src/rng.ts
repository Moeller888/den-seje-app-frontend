/**
 * Seeded, serializable PRNG: xoshiro128** (spec 01 A6.3, 05 E2 `rng`).
 * Core never uses Math.random().
 */

export interface RngState {
  readonly algorithm: "xoshiro128**";
  /** Four 32-bit words as 32 lowercase hex characters. */
  readonly state: string;
}

const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;

/** cyrb128 string hash → four 32-bit seeds. */
function hashSeed(seed: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const out: [number, number, number, number] = [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0,
  ];
  // xoshiro must not start in the all-zero state.
  if (out.every((w) => w === 0)) out[0] = 1;
  return out;
}

export class Rng {
  private s: [number, number, number, number];

  private constructor(s: [number, number, number, number]) {
    this.s = s;
  }

  static fromSeed(seed: string): Rng {
    return new Rng(hashSeed(seed));
  }

  static fromState(state: RngState): Rng {
    if (state.algorithm !== "xoshiro128**" || !/^[0-9a-f]{32}$/.test(state.state)) {
      throw new Error(`invalid RNG state ${JSON.stringify(state)}`);
    }
    const words = [0, 1, 2, 3].map((i) => Number.parseInt(state.state.slice(i * 8, i * 8 + 8), 16)) as [number, number, number, number];
    if (words.every((w) => w === 0)) throw new Error("invalid RNG state: all zero");
    return new Rng(words);
  }

  /** Continue from a serialized state in place (load, spec 05 E2: random choices continue deterministically). */
  restore(state: RngState): void {
    this.s = Rng.fromState(state).s;
  }

  serialize(): RngState {
    return { algorithm: "xoshiro128**", state: this.s.map((w) => w.toString(16).padStart(8, "0")).join("") };
  }

  nextUint32(): number {
    const s = this.s;
    const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] = (s[2] ^ s[0]) >>> 0;
    s[3] = (s[3] ^ s[1]) >>> 0;
    s[1] = (s[1] ^ s[2]) >>> 0;
    s[0] = (s[0] ^ s[3]) >>> 0;
    s[2] = (s[2] ^ t) >>> 0;
    s[3] = rotl(s[3], 11);
    return result;
  }

  /** Uniform integer in [0, n) without modulo bias (rejection sampling). */
  int(n: number): number {
    if (!Number.isInteger(n) || n <= 0 || n > 0x100000000) throw new RangeError(`Rng.int: n must be an integer in [1, 2^32], got ${n}`);
    const limit = Math.floor(0x100000000 / n) * n;
    for (;;) {
      const x = this.nextUint32();
      if (x < limit) return x % n;
    }
  }

  /** Uniform integer in [min, max] (inclusive). */
  intRange(min: number, max: number): number {
    if (max < min) throw new RangeError(`Rng.intRange: max < min (${min}, ${max})`);
    return min + this.int(max - min + 1);
  }
}
