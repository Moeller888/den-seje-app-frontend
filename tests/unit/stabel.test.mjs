import { test } from "node:test";
import assert from "node:assert/strict";
import { placePlate, PERFECT_PX, PERFECT_UNIT, grownSize, sweepSpeed, GROW_STEP, MAX_SIZE } from "../../js/stabel-logic.js";

const base = { x: 56, w: 168 };

test("an exact drop keeps the whole plate", () => {
  const placed = placePlate({ x: 56, w: 168 }, base);
  assert.equal(placed.hit, true);
  assert.equal(placed.perfect, true);
  assert.deepEqual(placed.plate, base);
});

test("a near drop within the snap still counts as perfect", () => {
  const placed = placePlate({ x: 56 + PERFECT_PX, w: 168 }, base);
  assert.equal(placed.perfect, true);
  assert.deepEqual(placed.plate, base);
});

test("overhang on the right is cut off", () => {
  const placed = placePlate({ x: 80, w: 168 }, base);
  assert.equal(placed.hit, true);
  assert.equal(placed.perfect, false);
  assert.deepEqual(placed.plate, { x: 80, w: 144 });
});

test("overhang on the left is cut off", () => {
  const placed = placePlate({ x: 20, w: 168 }, base);
  assert.equal(placed.hit, true);
  assert.deepEqual(placed.plate, { x: 56, w: 132 });
});

test("a complete miss does not place a plate", () => {
  const placed = placePlate({ x: 240, w: 168 }, base);
  assert.equal(placed.hit, false);
  assert.equal(placed.plate, null);
});

test("touching at an edge is a miss, and bad sizes never throw", () => {
  assert.equal(placePlate({ x: 224, w: 168 }, base).hit, false);
  assert.equal(placePlate({ x: 10, w: 0 }, base).hit, false);
  assert.equal(placePlate(null, base).hit, false);
});

test("in world units a drop within PERFECT_UNIT snaps to the plate below", () => {
  const unit = { x: -0.5, w: 1 };
  const placed = placePlate({ x: -0.5 + PERFECT_UNIT / 2, w: 1 }, unit, PERFECT_UNIT);
  assert.equal(placed.perfect, true);
  assert.deepEqual(placed.plate, unit);
  const off = placePlate({ x: -0.5 + 0.2, w: 1 }, unit, PERFECT_UNIT);
  assert.equal(off.perfect, false);
  assert.ok(Math.abs(off.plate.w - 0.8) < 1e-9);
});

test("only every third perfect in a row grows the plate, and never past MAX_SIZE", () => {
  assert.equal(grownSize(1, 0.5), 0.5);
  assert.equal(grownSize(2, 0.5), 0.5);
  assert.ok(Math.abs(grownSize(3, 0.5) - (0.5 + GROW_STEP)) < 1e-9);
  assert.equal(grownSize(6, 1.05), MAX_SIZE);
  assert.equal(grownSize(0, 0.5), 0.5);
  assert.equal(grownSize(3, 0), 0);
  assert.equal(grownSize(3, NaN), 0);
});

test("the sweep speeds up with the tower and levels off at 50 plates", () => {
  assert.equal(sweepSpeed(0), 1.85);
  assert.ok(sweepSpeed(10) > sweepSpeed(0));
  assert.equal(sweepSpeed(50), sweepSpeed(80));
  assert.equal(sweepSpeed(NaN), 1.85);
});

test("the page pays through claim_stabel_reward once per round, never through the quiz path", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../../js/stabel.js", import.meta.url), "utf8");
  assert.equal(src.match(/supabase\.rpc\(/g)?.length, 1);
  assert.match(src, /supabase\.rpc\("claim_stabel_reward", \{ p_plates: Math\.floor\(plates\) \}\)/);
  assert.equal(src.match(/claimCoins\(state\.plates, state\.round\)/g)?.length, 1);
  assert.equal(src.includes("process-event"), false);
  assert.match(src, /Mønterne kunne ikke gemmes/);
});
