import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PW, JUMP_SPEED, COYOTE, runSpeed, segment, isEarlyJump, nextHazard, canJump, stepBody,
} from "../../js/hop-logic.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(REPO, rel), "utf8");
const DT = 1 / 60;

function freshBody() {
  return { x: 0, y: 0, vy: 0, grounded: true, jumpUsed: false, leftGround: -1 };
}

// Builds a course like the page does and runs it. `jumpAt(distance)` decides when to jump.
function simulate(seed, jumpAt, maxScore = 30, maxSeconds = 120) {
  const body = freshBody();
  const platforms = [{ x: -3, w: 8 }];
  const gaps = [];
  const blocks = [];
  let cursor = 5;
  let score = 0;
  const scored = new Set();
  let time = 0;
  const fill = () => {
    while (cursor < body.x + 16) {
      const seg = segment(cursor, seed);
      gaps.push({ x: cursor, w: seg.gapW });
      cursor += seg.gapW;
      platforms.push({ x: cursor, w: seg.platW });
      if (seg.block) blocks.push({ x: cursor + seg.block.offset, w: seg.block.w, h: seg.block.h });
      cursor += seg.platW;
    }
  };
  fill();
  while (time < maxSeconds && score < maxScore) {
    time += DT;
    const d = nextHazard(body.x, gaps, blocks);
    if (jumpAt(d) && canJump(body, time)) {
      body.vy = JUMP_SPEED;
      body.grounded = false;
      body.jumpUsed = true;
    }
    if (stepBody(body, platforms, blocks, runSpeed(score), time, DT) === "fail") return { score, failed: true };
    fill();
    for (const s of [...gaps, ...blocks]) {
      if (!scored.has(s) && body.x >= s.x + s.w) { scored.add(s); score += 1; }
    }
  }
  return { score, failed: false };
}

test("the run speeds up with the score, up to a cap", () => {
  assert.equal(runSpeed(0), 5.1);
  assert.ok(runSpeed(10) > runSpeed(1));
  assert.equal(runSpeed(1000), 8.4);
  assert.equal(runSpeed(-5), 5.1);
});

test("the course is deterministic per seed and differs between seeds", () => {
  assert.deepEqual(segment(12.5, 3), segment(12.5, 3));
  const a = [0, 5, 10, 15].map((c) => segment(c, 1).gapW);
  const b = [0, 5, 10, 15].map((c) => segment(c, 2).gapW);
  assert.notDeepEqual(a, b);
  for (let c = 0; c < 200; c += 3.3) {
    const seg = segment(c, 7);
    assert.ok(seg.gapW >= 1.05 && seg.gapW <= 1.6);
    assert.ok(seg.platW >= 2.4 && seg.platW <= 4.0);
  }
  assert.doesNotThrow(() => segment(undefined, null));
});

test("an early jump is one taken 0.7–1.9 units before the next hazard", () => {
  assert.equal(isEarlyJump(1.2), true);
  assert.equal(isEarlyJump(0.5), false);
  assert.equal(isEarlyJump(2.5), false);
  assert.equal(isEarlyJump(null), false);
});

test("the nearest hazard ahead is measured from the figure's front", () => {
  assert.equal(nextHazard(0, [{ x: 3, w: 1 }], [{ x: 2, w: 0.5 }]), 2 - PW);
  assert.equal(nextHazard(5, [{ x: 3, w: 1 }], []), null);
  assert.equal(nextHazard(0, null, undefined), null);
});

test("a jump works on the ground and just after an edge, but only once in the air", () => {
  assert.equal(canJump({ grounded: true, jumpUsed: false, leftGround: -1 }, 5), true);
  assert.equal(canJump({ grounded: false, jumpUsed: false, leftGround: 5 }, 5 + COYOTE / 2), true);
  assert.equal(canJump({ grounded: false, jumpUsed: false, leftGround: 5 }, 5 + COYOTE * 2), false);
  assert.equal(canJump({ grounded: false, jumpUsed: true, leftGround: 5 }, 5.01), false);
  assert.equal(canJump(null, 0), false);
});

test("running on flat ground stays grounded", () => {
  const body = freshBody();
  for (let i = 0; i < 60; i++) assert.equal(stepBody(body, [{ x: -3, w: 100 }], [], 5, i * DT, DT), "ok");
  assert.equal(body.grounded, true);
  assert.equal(body.y, 0);
  assert.ok(body.x > 4.9);
});

test("never jumping ends the round in the first gap or block", () => {
  for (const seed of [1, 2, 3]) {
    const r = simulate(seed, () => false);
    assert.equal(r.failed, true);
    assert.equal(r.score, 0);
  }
});

test("running into a block ends the round", () => {
  const body = freshBody();
  let result = "ok";
  for (let i = 0; i < 120 && result === "ok"; i++) {
    result = stepBody(body, [{ x: -3, w: 100 }], [{ x: 2, w: 0.52, h: 0.82 }], 5, i * DT, DT);
  }
  assert.equal(result, "fail");
  assert.ok(body.x < 2.1);
});

// Searches for a sequence of jumps that clears `goal` hazards: at every frame a jump is possible it
// tries running on first, then jumping, and backs up on a fail. Proves the course is fair.
function solvable(seed, goal) {
  const platforms = [{ x: -3, w: 8 }];
  const gaps = [];
  const blocks = [];
  let cursor = 5;
  while (cursor < 300) {
    const seg = segment(cursor, seed);
    gaps.push({ x: cursor, w: seg.gapW });
    cursor += seg.gapW;
    platforms.push({ x: cursor, w: seg.platW });
    if (seg.block) blocks.push({ x: cursor + seg.block.offset, w: seg.block.w, h: seg.block.h });
    cursor += seg.platW;
  }
  const hazards = [...gaps, ...blocks];
  const cleared = (x) => hazards.filter((s) => x >= s.x + s.w).length;
  const tried = new Set();
  function run(body, t) {
    for (;;) {
      const score = cleared(body.x);
      if (score >= goal) return true;
      if (canJump(body, t + DT)) {
        const key = Math.round(body.x * 60);
        if (!tried.has(key)) {
          tried.add(key);
          const wait = { ...body };
          if (stepBody(wait, platforms, blocks, runSpeed(score), t + DT, DT) === "ok" && run(wait, t + DT)) return true;
          const jump = { ...body, vy: JUMP_SPEED, grounded: false, jumpUsed: true };
          return stepBody(jump, platforms, blocks, runSpeed(score), t + DT, DT) === "ok" && run(jump, t + DT);
        }
      }
      t += DT;
      if (stepBody(body, platforms, blocks, runSpeed(score), t, DT) === "fail") return false;
    }
  }
  return run(freshBody(), 0);
}

test("every course can be cleared: a run of jumps exists past 20 hazards, on many seeds", () => {
  for (let seed = 1; seed <= 12; seed++) assert.equal(solvable(seed, 20), true, `seed ${seed}`);
});

test("a well-timed early jump clears the first hazard", () => {
  for (const seed of [1, 2, 3]) {
    const r = simulate(seed, (d) => isEarlyJump(d) && d < 1.1, 1);
    assert.equal(r.failed, false);
    assert.equal(r.score, 1);
  }
});

test("the Hop page is internal, pays nothing and goes back to the menu", () => {
  const page = read("hop.html");
  assert.match(page, /noindex/);
  assert.match(page, /href="spil\.html"/);
  assert.match(page, /src="js\/hop\.js"/);
  const js = read("js/hop.js");
  assert.equal(js.includes(".rpc("), false, "Hop pays no coins");
  assert.doesNotMatch(js, /Math\.random\s*\(/);
});
