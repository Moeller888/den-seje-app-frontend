// Slope — pure downhill logic. No DOM, no rewards.
// A ball rolls down a track on its own and keeps getting faster. Steer left and right to stay on
// the track and to slip through the gap in each row of blocks. Every row passed counts; passing a
// row with the ball close to a block's edge makes it perfect. Rolling off the track, or into a
// block, ends the round.
// World units: x is sideways (0 = start line), z is distance down the track, the floor is y = 0.

export const R = 0.32;
// Sideways speed cap and how fast the ball reaches it.
export const STEER_MAX = 6.2;
export const STEER_ACC = 40;
export const SEG_LEN = 12;
// Where in a segment its row of blocks stands, and how deep the blocks are.
export const ROW_AT = 6;
export const ROW_DEPTH = 0.9;
export const BLOCK_H = 0.9;
// The free lane in every row is at least this wide, and moves at most MAX_LANE_SHIFT per row.
export const MIN_LANE = 1.5;
export const MAX_LANE_SHIFT = 2.4;
// A row passed with the ball this close to a block's edge is perfect.
export const NEAR_MISS = 0.3;
// Segments this far from the start line are calm: wide, straight, no blocks.
export const CALM = 3;

const START_SPEED = 9;
const MAX_SPEED = 19;
const SPEED_PER_UNIT = 0.02;
const MIN_W = 3.4;
const MAX_W = 5.6;
const MAX_SHIFT = 1.2;
const MAX_CENTER = 3;

// Deterministic noise in [0, 1): the same input always gives the same track.
export function hash(n) {
  const s = Math.sin(Number(n) * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Rolling speed (world units per second) at distance `z` down the track. */
export function rollSpeed(z) {
  const d = Number(z);
  const s = Number.isFinite(d) && d > 0 ? d : 0;
  return Math.min(MAX_SPEED, START_SPEED + s * SPEED_PER_UNIT);
}

/**
 * Segment number `index` of the track, built on from the previous one. Deterministic in
 * (index, seed, prev); a different seed gives a different track.
 * @param {number} index
 * @param {number} seed
 * @param {{center:number, lane:number}|null} prev  the segment before, or null for the first
 * @returns {{index:number, z0:number, len:number, center:number, w:number, lane:number,
 *   blocks:{x0:number,x1:number,z0:number,z1:number,scored:boolean}[]}}
 */
export function segment(index, seed, prev) {
  const i = Number.isFinite(Number(index)) && Number(index) > 0 ? Math.floor(Number(index)) : 0;
  const sd = Number.isFinite(Number(seed)) ? (Math.abs(Math.floor(Number(seed))) % 1000) * 97.3 : 0;
  const z0 = i * SEG_LEN;
  const prevCenter = prev && Number.isFinite(prev.center) ? prev.center : 0;
  const prevLane = prev && Number.isFinite(prev.lane) ? prev.lane : prevCenter;

  if (i < CALM) {
    return { index: i, z0, len: SEG_LEN, center: 0, w: MAX_W, lane: 0, blocks: [] };
  }

  const shift = (hash(i * 1.31 + sd + 2) * 2 - 1) * MAX_SHIFT;
  const center = clamp(prevCenter + shift, -MAX_CENTER, MAX_CENTER);
  const w = MIN_W + hash(i * 1.73 + sd + 5) * (MAX_W - MIN_W);
  const left = center - w / 2;
  const right = center + w / 2;

  const laneW = Math.min(w, MIN_LANE + hash(i * 2.11 + sd + 7) * 0.8);
  const lo = Math.max(left + laneW / 2, prevLane - MAX_LANE_SHIFT);
  const hi = Math.min(right - laneW / 2, prevLane + MAX_LANE_SHIFT);
  // lo > hi only if the track swung far from the last lane; then the lane hugs the near side.
  const lane = lo <= hi
    ? lo + hash(i * 2.57 + sd + 11) * (hi - lo)
    : clamp(prevLane, left + laneW / 2, right - laneW / 2);

  const bz0 = z0 + ROW_AT;
  const bz1 = bz0 + ROW_DEPTH;
  const blocks = [];
  const pick = hash(i * 3.03 + sd + 13);
  const wantLeft = pick < 0.7;
  const wantRight = pick > 0.3;
  if (wantLeft && lane - laneW / 2 - left > 0.3) {
    blocks.push({ x0: left, x1: lane - laneW / 2, z0: bz0, z1: bz1, scored: false });
  }
  if (wantRight && right - (lane + laneW / 2) > 0.3) {
    blocks.push({ x0: lane + laneW / 2, x1: right, z0: bz0, z1: bz1, scored: false });
  }
  return { index: i, z0, len: SEG_LEN, center, w, lane, blocks };
}

/**
 * The segment under distance `z`, or null.
 * @param {number} z
 * @param {{z0:number,len:number}[]} segments
 */
export function segmentAt(z, segments) {
  if (!Array.isArray(segments)) return null;
  const d = Number(z);
  if (!Number.isFinite(d)) return null;
  for (const s of segments) {
    if (s && d >= s.z0 && d < s.z0 + s.len) return s;
  }
  return null;
}

/** Is the ball's centre over the floor of the track? */
export function onTrack(x, z, segments) {
  const s = segmentAt(z, segments);
  if (!s) return false;
  return Math.abs(Number(x) - s.center) <= s.w / 2;
}

/** Does a ball at (x, z) touch the block? Circle against rectangle, seen from above. */
export function hitsBlock(x, z, b) {
  if (!b) return false;
  const cx = clamp(Number(x), b.x0, b.x1);
  const cz = clamp(Number(z), b.z0, b.z1);
  const dx = Number(x) - cx;
  const dz = Number(z) - cz;
  return dx * dx + dz * dz < R * R;
}

/**
 * Space between the ball's edge and the nearest block edge in a row. Infinity with no blocks.
 * @param {number} x
 * @param {{x0:number,x1:number}[]} blocks
 */
export function clearance(x, blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return Infinity;
  let best = Infinity;
  for (const b of blocks) {
    const gap = Number(x) < b.x0 ? b.x0 - Number(x) - R : Number(x) - b.x1 - R;
    if (Number.isFinite(gap)) best = Math.min(best, gap);
  }
  return best;
}

/** A row passed this close to a block is perfect. */
export function isNearMiss(gap) {
  const g = Number(gap);
  return Number.isFinite(g) && g >= 0 && g < NEAR_MISS;
}

/**
 * Advances the ball by `dt` seconds. Changes `ball` in place.
 * @param {{x:number, z:number, vx:number}} ball
 * @param {number} steer  -1 left, 0 straight, 1 right
 * @param {{z0:number,len:number,center:number,w:number,blocks:object[]}[]} segments
 * @param {number} dt
 * @returns {"ok"|"fall"|"hit"}
 */
export function stepBall(ball, steer, segments, dt) {
  const input = steer < 0 ? -1 : steer > 0 ? 1 : 0;
  const target = input * STEER_MAX;
  const dv = target - ball.vx;
  const maxDv = STEER_ACC * dt;
  ball.vx += clamp(dv, -maxDv, maxDv);
  ball.x += ball.vx * dt;
  ball.z += rollSpeed(ball.z) * dt;

  const segs = Array.isArray(segments) ? segments : [];
  for (const s of segs) {
    if (!s || !Array.isArray(s.blocks)) continue;
    for (const b of s.blocks) {
      if (hitsBlock(ball.x, ball.z, b)) return "hit";
    }
  }
  if (!onTrack(ball.x, ball.z, segs)) return "fall";
  return "ok";
}
