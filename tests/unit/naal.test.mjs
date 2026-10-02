import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TAU, norm, angDist, inArc, isPerfect, difficulty, flipsAfter, nextArcStart, FLIP_EVERY } from "../../js/naal-logic.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(REPO, rel), "utf8");
const close = (a, b) => Math.abs(a - b) < 1e-9;

test("angles fold into one turn, and bad input never throws", () => {
  assert.ok(close(norm(TAU + 1), 1));
  assert.ok(close(norm(-1), TAU - 1));
  assert.equal(norm(Number.NaN), 0);
  assert.equal(norm(undefined), 0);
  assert.ok(close(angDist(0.1, TAU - 0.1), 0.2));
});

test("the arc holds its own span, also when it wraps past a full turn", () => {
  assert.equal(inArc(1, 0.5, 1), true);
  assert.equal(inArc(1.6, 0.5, 1), false);
  assert.equal(inArc(0.4, 0.5, 1), false);
  assert.equal(inArc(0.2, TAU - 0.3, 0.6), true);
  assert.equal(inArc(TAU - 0.1, TAU - 0.3, 0.6), true);
  assert.equal(inArc(0.4, TAU - 0.3, 0.6), false);
  assert.equal(inArc(1, 0.5, 0), false);
});

test("only the centre fifth on either side of the middle is perfect", () => {
  const start = 1;
  const width = 1;
  assert.equal(isPerfect(1.5, start, width), true);
  assert.equal(isPerfect(1.5 + 0.19, start, width), true);
  assert.equal(isPerfect(1.5 + 0.25, start, width), false);
  assert.equal(isPerfect(3, start, width), false);
});

test("every hit narrows the arc and speeds the needle, within limits", () => {
  const a = difficulty(0);
  const b = difficulty(5);
  assert.ok(b.width < a.width && b.speed > a.speed);
  assert.deepEqual(difficulty(-3), a);
  assert.deepEqual(difficulty("x"), a);
  const late = difficulty(1000);
  assert.equal(late.width, 0.26);
  assert.equal(late.speed, 3.5);
});

test("the needle turns around every seventh hit", () => {
  assert.equal(FLIP_EVERY, 7);
  assert.equal(flipsAfter(7), true);
  assert.equal(flipsAfter(14), true);
  assert.equal(flipsAfter(6), false);
  assert.equal(flipsAfter(0), false);
});

test("the next arc lies ahead of the needle in the direction it travels", () => {
  const width = 0.5;
  const fwd = nextArcStart(1, 1, 1.2, width);
  assert.ok(close(fwd, 2.2));
  assert.equal(inArc(1, fwd, width), false);
  const back = nextArcStart(1, -1, 1.2, width);
  assert.ok(close(norm(back + width), norm(1 - 1.2)), "going backwards the far end faces the needle");
  assert.equal(inArc(1, back, width), false);
});

test("the Nål page is internal, pays nothing and goes back to the menu", () => {
  const page = read("naal.html");
  assert.match(page, /noindex/);
  assert.match(page, /href="spil\.html"/);
  assert.match(page, /src="js\/naal\.js"/);
  const js = read("js/naal.js");
  assert.equal(js.includes(".rpc("), false, "Nål pays no coins");
  assert.doesNotMatch(js, /Math\.random\s*\(/);
});
