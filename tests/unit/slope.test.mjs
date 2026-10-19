import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  R, STEER_MAX, SEG_LEN, MIN_LANE, MAX_LANE_SHIFT, CALM, rollSpeed, segment, segmentAt, onTrack, hitsBlock,
  clearance, isNearMiss, stepBall,
} from "../../js/slope-logic.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(REPO, rel), "utf8");
const DT = 1 / 60;

function track(seed, count) {
  const segs = [];
  let prev = null;
  for (let i = 0; i < count; i++) {
    prev = segment(i, seed, prev);
    segs.push(prev);
  }
  return segs;
}

// Rolls a ball down a track like the page does. `pilot(ball, segs)` returns -1, 0 or 1.
function simulate(seed, pilot, maxRows = 40, maxSeconds = 120) {
  const segs = track(seed, maxRows * 2 + CALM + 4);
  const ball = { x: 0, z: 0, vx: 0 };
  let rows = 0;
  let time = 0;
  while (time < maxSeconds && rows < maxRows) {
    time += DT;
    const result = stepBall(ball, pilot(ball, segs), segs, DT);
    if (result !== "ok") return { rows, result };
    for (const s of segs) {
      if (s.blocks.length > 0 && !s.scored && ball.z > s.blocks[0].z1) { s.scored = true; rows += 1; }
    }
  }
  return { rows, result: "ok" };
}

// Steers for the middle of the next row's lane; close to a segment edge, for the overlap with the next.
function autopilot(ball, segs) {
  const here = segmentAt(ball.z, segs);
  if (!here) return 0;
  const next = segs[here.index + 1] || here;
  const row = ball.z < here.z0 + 6 + 0.9 ? here : next;
  let target = row.lane;
  const toEdge = here.z0 + here.len - ball.z;
  if (toEdge < 2.5 && row !== here) {
    const lo = Math.max(here.center - here.w / 2, next.center - next.w / 2) + R;
    const hi = Math.min(here.center + here.w / 2, next.center + next.w / 2) - R;
    target = Math.max(lo, Math.min(hi, target));
  }
  // Wants to roll sideways in proportion to the distance left, so it brakes before the target.
  const want = Math.max(-STEER_MAX, Math.min(STEER_MAX, (target - ball.x) * 6));
  const dv = want - ball.vx;
  if (Math.abs(dv) < 0.3) return 0;
  return dv > 0 ? 1 : -1;
}

test("the ball speeds up down the track, up to a cap", () => {
  assert.equal(rollSpeed(0), 9);
  assert.ok(rollSpeed(200) > rollSpeed(10));
  assert.equal(rollSpeed(100000), 19);
  assert.equal(rollSpeed(-5), 9);
  assert.equal(rollSpeed(NaN), 9);
});

test("the track is deterministic per seed and differs between seeds", () => {
  assert.deepEqual(track(3, 30), track(3, 30));
  const a = track(1, 30).map((s) => s.center.toFixed(3) + s.lane.toFixed(3)).join();
  const b = track(2, 30).map((s) => s.center.toFixed(3) + s.lane.toFixed(3)).join();
  assert.notEqual(a, b);
});

test("the first segments are calm: straight and without blocks", () => {
  const segs = track(7, CALM);
  for (const s of segs) {
    assert.equal(s.center, 0);
    assert.equal(s.blocks.length, 0);
  }
});

test("every row leaves a lane at least MIN_LANE wide, on the floor", () => {
  for (let seed = 1; seed <= 20; seed++) {
    for (const s of track(seed, 80)) {
      const left = s.center - s.w / 2;
      const right = s.center + s.w / 2;
      assert.ok(s.lane - MIN_LANE / 2 >= left - 1e-9 && s.lane + MIN_LANE / 2 <= right + 1e-9, `seed ${seed} seg ${s.index}`);
      for (const b of s.blocks) {
        assert.ok(b.x1 <= s.lane - MIN_LANE / 2 + 1e-9 || b.x0 >= s.lane + MIN_LANE / 2 - 1e-9, `block in lane, seed ${seed} seg ${s.index}`);
        assert.ok(b.x0 >= left - 1e-9 && b.x1 <= right + 1e-9);
        assert.equal(b.z0, s.z0 + 6);
      }
    }
  }
});

test("neighbouring segments overlap and lanes move a bounded amount", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const segs = track(seed, 80);
    for (let i = 1; i < segs.length; i++) {
      const a = segs[i - 1];
      const b = segs[i];
      const overlap = Math.min(a.center + a.w / 2, b.center + b.w / 2) - Math.max(a.center - a.w / 2, b.center - b.w / 2);
      assert.ok(overlap >= 2, `seed ${seed} seg ${i} overlap ${overlap}`);
      assert.ok(Math.abs(b.lane - a.lane) <= MAX_LANE_SHIFT + 0.4, `seed ${seed} seg ${i} lane shift`);
      assert.equal(b.z0 - a.z0, SEG_LEN);
    }
  }
});

test("a careful player can roll past 40 rows on every seed", () => {
  for (let seed = 1; seed <= 12; seed++) {
    const run = simulate(seed, autopilot, 40);
    assert.equal(run.result, "ok", `seed ${seed} ended with ${run.result} after ${run.rows} rows`);
    assert.equal(run.rows, 40);
  }
});

test("rolling straight on ends the round", () => {
  let ended = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const run = simulate(seed, () => 0, 40);
    if (run.result !== "ok") ended += 1;
  }
  assert.ok(ended >= 10, `only ${ended} of 12 straight runs ended`);
});

test("segmentAt, onTrack and hitsBlock", () => {
  const segs = track(5, 6);
  assert.equal(segmentAt(0, segs)?.index, 0);
  assert.equal(segmentAt(SEG_LEN + 0.5, segs)?.index, 1);
  assert.equal(segmentAt(-1, segs), null);
  assert.equal(segmentAt(5, null), null);
  assert.equal(onTrack(0, 1, segs), true);
  assert.equal(onTrack(10, 1, segs), false);
  assert.equal(onTrack(0, -3, segs), false);
  const b = { x0: 0, x1: 1, z0: 5, z1: 6 };
  assert.equal(hitsBlock(0.5, 5.5, b), true);
  assert.equal(hitsBlock(-R - 0.01, 5.5, b), false);
  assert.equal(hitsBlock(-R + 0.05, 5.5, b), true);
  assert.equal(hitsBlock(0.5, 4.5, b), false);
  assert.equal(hitsBlock(0.5, 5.5, null), false);
});

test("a row passed close to a block's edge is a near miss", () => {
  const blocks = [{ x0: -3, x1: -1 }, { x0: 1, x1: 3 }];
  assert.equal(clearance(0, []), Infinity);
  assert.ok(Math.abs(clearance(0, blocks) - (1 - R)) < 1e-9);
  assert.equal(isNearMiss(clearance(0, blocks)), false);
  assert.equal(isNearMiss(clearance(-1 + R + 0.1, blocks)), true);
  assert.equal(isNearMiss(-0.1), false);
  assert.equal(isNearMiss(NaN), false);
});

test("steering is smooth and capped", () => {
  const segs = track(1, 4);
  const ball = { x: 0, z: 0, vx: 0 };
  stepBall(ball, 1, segs, DT);
  assert.ok(ball.vx > 0 && ball.vx < 1);
  for (let i = 0; i < 60; i++) stepBall(ball, 1, segs, DT);
  assert.ok(ball.vx <= 6.2 + 1e-9);
  const right = { x: 0, z: 0, vx: 0 };
  assert.equal(stepBall(right, 0, segs, DT), "ok");
  assert.equal(right.x, 0);
});

test("Slope pays nothing and keeps only a local record", () => {
  const page = read("js/slope.js");
  assert.match(page, /dsj_slope_best/);
  assert.equal(page.includes("process-event"), false);
  assert.equal(page.includes("awardCoins"), false);
  assert.equal(page.includes("Math.random"), false);
  assert.equal(read("js/slope-logic.js").includes("Math.random"), false);
  assert.match(read("slope.html"), /noindex/);
});
