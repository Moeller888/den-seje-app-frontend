import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  WORLD_W, WORLD_H, COLS, ROWS, BALL_R, PAD_W, PAD_Y, MAX_BALL_SPEED, MAX_LEVEL_SPEED,
  layoutBricks, clampPaddle, launchVelocity, nextLevelSpeed, stepBall,
} from "../../js/brud-logic.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(REPO, rel), "utf8");
const DT = 1 / 60;

test("a wall is 7 × 4 live bricks inside the world, not overlapping", () => {
  const bricks = layoutBricks();
  assert.equal(bricks.length, COLS * ROWS);
  for (const b of bricks) {
    assert.equal(b.alive, true);
    assert.ok(b.x >= 0 && b.x + b.w <= WORLD_W && b.y >= 0 && b.y + b.h < PAD_Y);
  }
  for (let i = 0; i < bricks.length; i++) {
    for (let j = i + 1; j < bricks.length; j++) {
      const a = bricks[i];
      const b = bricks[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.equal(overlap, false);
    }
  }
});

test("the paddle stays inside the walls", () => {
  assert.equal(clampPaddle(-100), PAD_W / 2 + 8);
  assert.equal(clampPaddle(9999), WORLD_W - PAD_W / 2 - 8);
  assert.equal(clampPaddle(180), 180);
  assert.equal(clampPaddle(Number.NaN), WORLD_W / 2);
});

test("the ball launches upwards, more steeply than 80 units per second", () => {
  for (const tilt of [0, 0.25, 0.5, 0.75, 0.999]) {
    const v = launchVelocity(1, tilt);
    assert.ok(v.vy < -80, `tilt ${tilt}`);
  }
  assert.ok(Math.abs(launchVelocity(1, 0.5).vx) < 1e-9);
  assert.ok(Number.isFinite(launchVelocity(undefined, undefined).vy));
});

test("each cleared wall speeds the game up, to a cap", () => {
  assert.ok(Math.abs(nextLevelSpeed(1) - 1.12) < 1e-9);
  assert.equal(nextLevelSpeed(1.65), MAX_LEVEL_SPEED);
});

test("the walls and the ceiling bounce the ball; a side wall spoils a clean shot", () => {
  const left = { x: BALL_R + 1, y: 200, vx: -300, vy: -10, clean: true };
  stepBall(left, 180, [], DT);
  assert.ok(left.vx > 0 && left.clean === false);
  const top = { x: 180, y: BALL_R + 1, vx: 0, vy: -300, clean: true };
  stepBall(top, 180, [], DT);
  assert.ok(top.vy > 0 && top.clean === true);
});

test("the paddle sends the ball back up, angled by where it hit, never faster than the cap", () => {
  const centre = { x: 180, y: PAD_Y - BALL_R - 1, vx: 0, vy: 300, clean: false };
  const r = stepBall(centre, 180, [], DT);
  assert.equal(r.paddle, true);
  assert.ok(centre.vy < 0 && Math.abs(centre.vx) < 1e-9 && centre.clean === true);
  const edge = { x: 180 + PAD_W / 2 - 2, y: PAD_Y - BALL_R - 1, vx: 0, vy: 600, clean: false };
  stepBall(edge, 180, [], DT);
  assert.ok(edge.vx > 0 && edge.vy < 0);
  assert.ok(Math.hypot(edge.vx, edge.vy) <= MAX_BALL_SPEED + 1e-6);
});

test("a brick hit straight off the paddle is perfect; the next one is not", () => {
  const bricks = layoutBricks();
  const target = bricks[bricks.length - 1];
  const ball = { x: target.x + target.w / 2, y: target.y + target.h + BALL_R + 1, vx: 0, vy: -300, clean: true };
  const first = stepBall(ball, 180, bricks, DT);
  assert.equal(first.brick, bricks.length - 1);
  assert.equal(first.perfect, true);
  assert.equal(bricks[first.brick].alive, false);
  assert.ok(ball.vy > 0, "the ball bounces back off the brick");
  assert.equal(ball.clean, false);
});

test("missing the paddle loses the ball", () => {
  const ball = { x: 20, y: WORLD_H, vx: 0, vy: 400, clean: false };
  let r = { lost: false };
  for (let i = 0; i < 30 && !r.lost; i++) r = stepBall(ball, 300, [], DT);
  assert.equal(r.lost, true);
});

test("a paddle that follows the ball keeps it up and clears a whole wall", () => {
  const bricks = layoutBricks();
  const ball = { x: 180, y: PAD_Y - 12, ...launchVelocity(1, 0.3), clean: true };
  let broken = 0;
  for (let i = 0; i < 60 * 120 && broken < bricks.length; i++) {
    const r = stepBall(ball, clampPaddle(ball.x + 6), bricks, DT);
    assert.equal(r.lost, false, `lost after ${broken} bricks`);
    if (r.brick >= 0) broken += 1;
  }
  assert.equal(broken, bricks.length);
});

test("the Brud page is internal, pays nothing and goes back to the menu", () => {
  const page = read("brud.html");
  assert.match(page, /noindex/);
  assert.match(page, /href="spil\.html"/);
  assert.match(page, /src="js\/brud\.js"/);
  const js = read("js/brud.js");
  assert.equal(js.includes(".rpc("), false, "Brud pays no coins");
  assert.doesNotMatch(js, /Math\.random\s*\(/);
});
