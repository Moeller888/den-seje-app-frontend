// Nål — pure arc logic. No DOM, no rewards.
// A needle sweeps around a dial. A bright arc sits ahead of it. Tap while the needle is inside the
// arc; the centre fifth is perfect. Tapping outside, or letting the needle pass through the arc
// without a tap, ends the round. Every hit makes the next arc shorter and the needle faster.

export const TAU = Math.PI * 2;

// Fraction of the arc, measured from its centre to either side, that counts as perfect.
export const PERFECT_FRACTION = 0.2;
// Every FLIP_EVERY hits the needle turns around.
export const FLIP_EVERY = 7;

const START_WIDTH = 0.78;
const MIN_WIDTH = 0.26;
const WIDTH_STEP = 0.03;
const START_SPEED = 1.35;
const MAX_SPEED = 3.5;
const SPEED_STEP = 0.1;

/** An angle folded into [0, 2π). Non-numbers become 0. */
export function norm(a) {
  const n = Number(a);
  if (!Number.isFinite(n)) return 0;
  return ((n % TAU) + TAU) % TAU;
}

/** The shortest distance between two angles, in [0, π]. */
export function angDist(a, b) {
  let d = norm(Number(a) - Number(b));
  if (d > Math.PI) d -= TAU;
  return Math.abs(d);
}

/**
 * Is `angle` inside the arc that starts at `start` and runs `width` radians forward?
 * Handles arcs that wrap past 2π.
 */
export function inArc(angle, start, width) {
  const w = Number(width);
  if (!Number.isFinite(w) || w <= 0) return false;
  const a = norm(angle);
  const s = norm(start);
  const end = s + w;
  if (end <= TAU) return a >= s && a < end;
  return a >= s || a < end - TAU;
}

/** A hit is perfect when the needle is within PERFECT_FRACTION of the arc from its centre. */
export function isPerfect(angle, start, width) {
  const w = Number(width);
  if (!inArc(angle, start, w)) return false;
  return angDist(angle, Number(start) + w / 2) <= w * PERFECT_FRACTION;
}

/**
 * Arc width (radians) and needle speed (radians per second) after `hits` hits.
 * @param {number} hits
 * @returns {{width:number, speed:number}}
 */
export function difficulty(hits) {
  const n = Math.floor(Number(hits));
  const h = Number.isFinite(n) && n > 0 ? n : 0;
  return {
    width: Math.max(MIN_WIDTH, START_WIDTH - h * WIDTH_STEP),
    speed: Math.min(MAX_SPEED, START_SPEED + h * SPEED_STEP),
  };
}

/** True when hit number `hits` turns the needle around. */
export function flipsAfter(hits) {
  const n = Math.floor(Number(hits));
  return Number.isFinite(n) && n > 0 && n % FLIP_EVERY === 0;
}

/**
 * Where the next arc starts: `lead` radians ahead of the needle in the direction it travels.
 * @param {number} angle  needle angle
 * @param {number} dir    +1 or -1
 * @param {number} lead   radians ahead of the needle
 * @param {number} width  arc width
 */
export function nextArcStart(angle, dir, lead, width) {
  const d = dir < 0 ? -1 : 1;
  // Going backwards the needle meets the arc's far end first, so the arc is shifted by its width.
  return d > 0 ? norm(angle + lead) : norm(angle - lead - width);
}
