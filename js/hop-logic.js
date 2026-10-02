// Hop — pure runner logic. No DOM, no rewards.
// A figure runs right on its own. Tap to jump over gaps and blocks. Every cleared gap or block
// scores and speeds the run up. A jump taken early — well before the next hazard — makes that
// hazard perfect. Falling into a gap, or running into a block or a platform's side, ends the round.
// World units: the figure is PW wide and PH tall, the ground is y = 0, x grows to the right.

export const PW = 0.46;
export const PH = 0.78;
export const GRAVITY = 32;
export const JUMP_SPEED = 11.6;
// A jump still counts this long (seconds) after running off an edge.
export const COYOTE = 0.1;
// Below this height the figure has fallen out of the world.
export const FALL_LIMIT = -1.35;
// An early jump: the next hazard is this far (world units) ahead of the figure's front.
export const PERFECT_MIN = 0.7;
export const PERFECT_MAX = 1.9;

const START_RUN = 5.1;
const MAX_RUN = 8.4;
const RUN_STEP = 0.12;

// Deterministic noise in [0, 1) — no Math.random.
export function hash(n) {
  const s = Math.sin(Number(n) * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Running speed (world units per second) after `score` cleared hazards. */
export function runSpeed(score) {
  const n = Math.floor(Number(score));
  const s = Number.isFinite(n) && n > 0 ? n : 0;
  return Math.min(MAX_RUN, START_RUN + s * RUN_STEP);
}

/**
 * The next stretch of course starting at `cursor`: a gap, then a platform, maybe a block on it.
 * Deterministic in (cursor, seed); a different seed gives a different course.
 * @returns {{gapW:number, platW:number, block:{offset:number,w:number,h:number}|null}}
 */
export function segment(cursor, seed) {
  const c = Number.isFinite(Number(cursor)) ? Number(cursor) : 0;
  const sd = Number.isFinite(Number(seed)) ? (Math.abs(Math.floor(Number(seed))) % 1000) * 97.3 : 0;
  const gapW = 1.05 + hash(c + sd + 1) * 0.55;
  const at = c + gapW;
  const platW = 2.4 + hash(at + sd + 3) * 1.6;
  const block = hash(at + sd + 9) > 0.45 ? { offset: platW * 0.55, w: 0.52, h: 0.82 } : null;
  return { gapW, platW, block };
}

/** An early jump makes the next hazard perfect. `distance` is from the figure's front to it. */
export function isEarlyJump(distance) {
  const d = Number(distance);
  return Number.isFinite(d) && d > PERFECT_MIN && d < PERFECT_MAX;
}

/**
 * Distance from the figure's front to the nearest gap or block ahead, or null if none.
 * @param {number} x
 * @param {{x:number,w:number}[]} gaps
 * @param {{x:number,w:number}[]} blocks
 */
export function nextHazard(x, gaps, blocks) {
  const front = Number(x) + PW;
  let best = null;
  for (const list of [gaps, blocks]) {
    if (!Array.isArray(list)) continue;
    for (const s of list) {
      const d = Number(s?.x) - front;
      if (Number.isFinite(d) && d > 0 && (best === null || d < best)) best = d;
    }
  }
  return best;
}

/**
 * Can the figure jump now? On the ground, or within COYOTE seconds of leaving it, once per air time.
 * @param {{grounded:boolean, jumpUsed:boolean, leftGround:number}} body
 * @param {number} time
 */
export function canJump(body, time) {
  if (!body) return false;
  if (body.grounded) return true;
  if (body.jumpUsed) return false;
  return Number(time) - Number(body.leftGround) < COYOTE;
}

/**
 * Advances the figure by `dt` seconds. Changes `body` in place.
 * @param {{x:number,y:number,vy:number,grounded:boolean,jumpUsed:boolean,leftGround:number}} body
 * @param {{x:number,w:number}[]} platforms
 * @param {{x:number,w:number,h:number}[]} blocks
 * @param {number} run   running speed
 * @param {number} time  game time after this step
 * @param {number} dt
 * @returns {"ok"|"fail"}
 */
export function stepBody(body, platforms, blocks, run, time, dt) {
  const plats = Array.isArray(platforms) ? platforms : [];
  const blks = Array.isArray(blocks) ? blocks : [];
  const wasGround = body.grounded;
  body.vy -= GRAVITY * dt;
  body.y += body.vy * dt;
  body.x += run * dt;

  const footL = body.x + 0.06;
  const footR = body.x + PW - 0.06;
  let supported = false;
  let supportY = 0;
  for (const p of plats) {
    if (footR > p.x && footL < p.x + p.w) supported = true;
  }
  for (const b of blks) {
    if (footR > b.x && footL < b.x + b.w && body.y <= b.h + 0.25 && body.y >= b.h - 0.2) {
      supported = true;
      supportY = Math.max(supportY, b.h);
    }
  }

  if (supported && body.vy <= 0 && body.y <= supportY + 0.04 && body.y >= supportY - 0.35) {
    body.y = supportY;
    body.vy = 0;
    body.grounded = true;
    body.jumpUsed = false;
  } else if (supported && body.y < supportY - 0.35) {
    return "fail";            // ran into the side of a platform from below
  } else {
    body.grounded = false;
    if (wasGround) body.leftGround = time;
  }

  for (const b of blks) {
    const hitX = body.x < b.x + b.w && body.x + PW > b.x;
    const inside = body.y < b.h - 0.08 && body.y + PH > 0.05;
    if (hitX && inside) return "fail";
  }
  if (body.y < FALL_LIMIT) return "fail";
  return "ok";
}
