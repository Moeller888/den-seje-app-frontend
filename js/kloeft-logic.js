// Kløft — pure shaft logic. No DOM, no rewards.
// A shard falls down a shaft. In the right-hand wall a cleft slides up and down. Tap while the
// shard is level with the cleft; the middle third of the cleft is perfect. Tapping beside it, or
// letting the shard reach the bottom, ends the round. Every hit makes the cleft narrower and the
// shard faster, and the cleft moves quicker.
// All heights are fractions of the shaft: 0 is the top, 1 is the bottom.

// The shard starts just above the shaft and the round ends when it passes FLOOR.
export const START_Y = -0.16;
export const FLOOR = 1.08;
// Fraction of the cleft's half-height, from its middle, that counts as perfect.
export const PERFECT_FRACTION = 0.34;

const START_CLEFT = 0.26;
const MIN_CLEFT = 0.1;
const CLEFT_STEP = 0.01;
const START_SPEED = 0.46;
const MAX_SPEED = 1.15;
const SPEED_STEP = 0.045;
const SWAY = 0.3;

function hitsOf(hits) {
  const n = Math.floor(Number(hits));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Cleft height and fall speed (shaft heights per second) after `hits` hits.
 * @param {number} hits
 * @returns {{cleft:number, speed:number}}
 */
export function difficulty(hits) {
  const h = hitsOf(hits);
  return {
    cleft: Math.max(MIN_CLEFT, START_CLEFT - h * CLEFT_STEP),
    speed: Math.min(MAX_SPEED, START_SPEED + h * SPEED_STEP),
  };
}

/**
 * Where the middle of the cleft is at time `t` (seconds) after `hits` hits. It sways on a sine
 * and is kept far enough from the ends that the whole cleft stays inside the shaft.
 * @param {number} t
 * @param {number} hits
 * @param {number} cleft  cleft height
 */
export function cleftCenter(t, hits, cleft) {
  const h = hitsOf(hits);
  const time = Number.isFinite(Number(t)) ? Number(t) : 0;
  const c = Number.isFinite(Number(cleft)) && Number(cleft) > 0 ? Number(cleft) : START_CLEFT;
  const freq = 0.9 + Math.min(h, 18) * 0.08;
  const raw = 0.5 + Math.sin(time * freq + h * 0.4) * SWAY;
  const pad = c / 2 + 0.02;
  return Math.min(1 - pad, Math.max(pad, raw));
}

/** Is the shard level with the cleft? */
export function inCleft(shardY, center, cleft) {
  const y = Number(shardY);
  const m = Number(center);
  const c = Number(cleft);
  if (![y, m, c].every(Number.isFinite) || c <= 0) return false;
  return Math.abs(y - m) <= c / 2;
}

/** Is the shard within the middle PERFECT_FRACTION of the cleft? */
export function isPerfect(shardY, center, cleft) {
  if (!inCleft(shardY, center, cleft)) return false;
  return Math.abs(Number(shardY) - Number(center)) <= (Number(cleft) / 2) * PERFECT_FRACTION;
}
