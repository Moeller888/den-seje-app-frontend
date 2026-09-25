// Stabel — pure placement. No DOM, no rewards.
// A plate lands on the one below. The overlap stays; the rest is cut off.
// A near-exact drop snaps to the plate below so the tower does not drift.

export const PERFECT_PX = 6;

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
