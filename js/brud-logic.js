// Brud — pure breakout logic. No DOM, no rewards.
// Keep the ball up with the paddle and break the bricks. A brick hit straight off the paddle — no
// wall bounce and no other brick in between — is perfect. A cleared wall is rebuilt and the ball
// gets faster. Every paddle hit also speeds the ball up by PADDLE_ACCEL, up to MAX_BALL_SPEED, so a
// round cannot drag on. The ball dropping past the paddle ends the round.
// Everything is in a fixed world of WORLD_W × WORLD_H units; the page scales it onto the canvas,
// so a resize mid-round never moves a brick.

export const WORLD_W = 360;
export const WORLD_H = 420;
export const COLS = 7;
export const ROWS = 4;
export const BALL_R = 7;
export const PAD_W = 80;
export const PAD_Y = WORLD_H * 0.84;
export const PAD_SPEED = 420;
// At the cap the ball moves 15 units per 1/60 s step — less than the paddle's catch window (21) and
// a brick's hit window (30), so it can never pass through either between two steps.
export const MAX_BALL_SPEED = 900;
export const PADDLE_ACCEL = 1.06;
export const MAX_LEVEL_SPEED = 1.7;

const LAUNCH_SPEED = 300;
const LEVEL_STEP = 0.12;

/** A full wall of live bricks. */
export function layoutBricks() {
  const pad = Math.max(16, WORLD_W * 0.06);
  const top = WORLD_H * 0.2;
  const gap = 6;
  const bw = (WORLD_W - pad * 2 - gap * (COLS - 1)) / COLS;
  const bh = 16;
  const bricks = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      bricks.push({ x: pad + c * (bw + gap), y: top + r * (bh + gap), w: bw, h: bh, row: r, alive: true });
    }
  }
  return bricks;
}

/** Keeps the paddle's centre inside the walls. */
export function clampPaddle(x) {
  const n = Number(x);
  const half = PAD_W / 2;
  if (!Number.isFinite(n)) return WORLD_W / 2;
  return Math.min(WORLD_W - half - 8, Math.max(half + 8, n));
}

/**
 * Launch velocity: mostly straight up, tilted by `tilt` in [0, 1) (0.5 is straight up).
 * @param {number} speed  level speed factor, 1 at the start
 * @param {number} tilt
 */
export function launchVelocity(speed, tilt) {
  const t = Number.isFinite(Number(tilt)) ? Number(tilt) : 0.5;
  const s = Number.isFinite(Number(speed)) && Number(speed) > 0 ? Number(speed) : 1;
  const angle = -Math.PI / 2 + (t * 2 - 1) * 0.35;
  const sp = LAUNCH_SPEED * s;
  let vy = Math.sin(angle) * sp;
  if (vy > -80) vy = -220;
  return { vx: Math.cos(angle) * sp, vy };
}

/** The level speed after clearing a wall. */
export function nextLevelSpeed(speed) {
  const s = Number.isFinite(Number(speed)) ? Number(speed) : 1;
  return Math.min(MAX_LEVEL_SPEED, s + LEVEL_STEP);
}

/**
 * Advances the ball by `dt` seconds. Changes `ball` and `bricks` in place.
 * `ball.clean` is true from a paddle bounce until a wall bounce or a brick.
 * @param {{x:number,y:number,vx:number,vy:number,clean:boolean}} ball
 * @param {number} padX  paddle centre
 * @param {{x:number,y:number,w:number,h:number,alive:boolean}[]} bricks
 * @param {number} dt
 * @returns {{paddle:boolean, brick:number, perfect:boolean, lost:boolean}}
 *   brick is the index of the brick broken this step, or -1
 */
export function stepBall(ball, padX, bricks, dt) {
  const out = { paddle: false, brick: -1, perfect: false, lost: false };
  const list = Array.isArray(bricks) ? bricks : [];
  const r = BALL_R;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  if (ball.x < r) {
    ball.x = r;
    ball.vx = Math.abs(ball.vx);
    ball.clean = false;
  } else if (ball.x > WORLD_W - r) {
    ball.x = WORLD_W - r;
    ball.vx = -Math.abs(ball.vx);
    ball.clean = false;
  }
  if (ball.y < r) {
    ball.y = r;
    ball.vy = Math.abs(ball.vy);
  }

  const half = PAD_W / 2;
  if (ball.vy > 0 && ball.y >= PAD_Y - r && ball.y <= PAD_Y + 14 && ball.x >= padX - half && ball.x <= padX + half) {
    ball.y = PAD_Y - r;
    const hit = (ball.x - padX) / half;
    const sp = Math.min(MAX_BALL_SPEED, Math.hypot(ball.vx, ball.vy) * PADDLE_ACCEL);
    ball.vx = hit * sp * 0.85;
    ball.vy = -Math.sqrt(Math.max(40, sp * sp - ball.vx * ball.vx));
    ball.clean = true;
    out.paddle = true;
  }

  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (!b || !b.alive) continue;
    if (ball.x + r < b.x || ball.x - r > b.x + b.w || ball.y + r < b.y || ball.y - r > b.y + b.h) continue;
    b.alive = false;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    if (Math.abs(ball.x - cx) / b.w > Math.abs(ball.y - cy) / b.h) ball.vx *= -1;
    else ball.vy *= -1;
    out.brick = i;
    out.perfect = ball.clean === true;
    ball.clean = false;
    break;
  }

  if (ball.y > WORLD_H + 20) out.lost = true;
  return out;
}
