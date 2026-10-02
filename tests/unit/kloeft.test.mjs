import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { START_Y, FLOOR, difficulty, cleftCenter, inCleft, isPerfect } from "../../js/kloeft-logic.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(REPO, rel), "utf8");

test("the shard starts above the shaft and is lost below it", () => {
  assert.ok(START_Y < 0);
  assert.ok(FLOOR > 1);
});

test("every hit narrows the cleft and speeds the shard, within limits", () => {
  const a = difficulty(0);
  const b = difficulty(6);
  assert.ok(b.cleft < a.cleft && b.speed > a.speed);
  assert.deepEqual(difficulty(-1), a);
  assert.deepEqual(difficulty(null), a);
  const late = difficulty(500);
  assert.equal(late.cleft, 0.1);
  assert.equal(late.speed, 1.15);
});

test("the cleft always stays whole inside the shaft", () => {
  for (const hits of [0, 5, 18, 40]) {
    const { cleft } = difficulty(hits);
    for (let t = 0; t < 30; t += 0.07) {
      const c = cleftCenter(t, hits, cleft);
      assert.ok(c - cleft / 2 >= 0 && c + cleft / 2 <= 1, `hits ${hits}, t ${t}: ${c}`);
    }
  }
  assert.ok(Number.isFinite(cleftCenter(undefined, "x", -1)));
});

test("the cleft moves over time", () => {
  assert.notEqual(cleftCenter(0, 0, 0.26), cleftCenter(1, 0, 0.26));
});

test("level with the cleft is a hit, its middle third is perfect", () => {
  const center = 0.5;
  const cleft = 0.2;
  assert.equal(inCleft(0.5, center, cleft), true);
  assert.equal(inCleft(0.59, center, cleft), true);
  assert.equal(inCleft(0.61, center, cleft), false);
  assert.equal(isPerfect(0.53, center, cleft), true);
  assert.equal(isPerfect(0.56, center, cleft), false);
  assert.equal(inCleft(Number.NaN, center, cleft), false);
  assert.equal(inCleft(0.5, center, 0), false);
});

test("the Kløft page is internal, pays nothing and goes back to the menu", () => {
  const page = read("kloeft.html");
  assert.match(page, /noindex/);
  assert.match(page, /href="spil\.html"/);
  assert.match(page, /src="js\/kloeft\.js"/);
  const js = read("js/kloeft.js");
  assert.equal(js.includes(".rpc("), false, "Kløft pays no coins");
  assert.doesNotMatch(js, /Math\.random\s*\(/);
});
