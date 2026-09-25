import { test } from "node:test";
import assert from "node:assert/strict";
import { placePlate, PERFECT_PX } from "../../js/stabel-logic.js";

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
