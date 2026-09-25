// Stabel — pure placement. No DOM, no rewards.
// A plate lands on the one below. The overlap stays; the rest is cut off.
// A near-exact drop snaps to the plate below so the tower does not drift.

export const PERFECT_PX = 6;

// The tower is drawn in world units: the first plate is 1 × 1.
// A drop within PERFECT_UNIT of the plate below counts as perfect.
export const PERFECT_UNIT = 0.03;
// Every GROW_EVERY perfect drops in a row the plate grows back a little, capped at MAX_SIZE.
export const GROW_EVERY = 3;
export const GROW_STEP = 0.07;
export const MAX_SIZE = 1.08;

/**
 * @param {{x:number,w:number}} mover
 * @param {{x:number,w:number}} base
 * @param {number} [perfectPx]
 * @returns {{hit:boolean, perfect:boolean, plate:{x:number,w:number}|null}}
 */
export function placePlate(mover, base, perfectPx = PERFECT_PX) {
  const mx = Number(mover?.x);
  const mw = Number(mover?.w);
  const bx = Number(base?.x);
  const bw = Number(base?.w);
  if (![mx, mw, bx, bw].every(Number.isFinite) || mw <= 0 || bw <= 0) {
    return { hit: false, perfect: false, plate: null };
  }
  const left = Math.max(mx, bx);
  const right = Math.min(mx + mw, bx + bw);
  const w = right - left;
  if (w <= 0) return { hit: false, perfect: false, plate: null };
  const limit = Number.isFinite(perfectPx) && perfectPx >= 0 ? perfectPx : PERFECT_PX;
  const aligned = Math.abs(mx - bx) <= limit && Math.abs(mw - bw) <= limit;
  if (aligned) return { hit: true, perfect: true, plate: { x: bx, w: bw } };
  return { hit: true, perfect: false, plate: { x: left, w } };
}

/**
 * The size a plate grows to after a perfect drop. Unchanged unless the streak hits GROW_EVERY.
 * @param {number} combo  perfect drops in a row, including this one
 * @param {number} size
 * @returns {number}
 */
export function grownSize(combo, size) {
  const s = Number(size);
  if (!Number.isFinite(s) || s <= 0) return 0;
  const c = Math.floor(Number(combo));
  if (!Number.isFinite(c) || c <= 0 || c % GROW_EVERY !== 0) return s;
  return Math.min(MAX_SIZE, Math.max(s, s + GROW_STEP));
}

/**
 * Sliding speed (radians per second of the sine sweep) for a tower of `plates` plates.
 * @param {number} plates
 * @returns {number}
 */
export function sweepSpeed(plates) {
  const n = Number(plates);
  const clamped = Number.isFinite(n) && n > 0 ? Math.min(n, 50) : 0;
  return 1.85 + clamped * 0.055;
}
