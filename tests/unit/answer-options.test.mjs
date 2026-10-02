// Question Interaction Foundation: choice-option preparation (js/answer-options.js).
//
// Pins two things: the legacy "mc" behaviour is unchanged (pad to four from the WWII-year pool,
// then shuffle), and no other answer_format can ever receive padded options — so a future
// true/false task cannot be shown random years.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  LEGACY_MC_PAD_POOL,
  shouldPadToFour,
  ensureFourOptions,
  prepareChoiceOptions,
} from "../../js/answer-options.js";

// Deterministic rng for tests: cycles through fixed values.
function seq(...values) {
  let i = 0;
  return () => values[i++ % values.length];
}

test("only answer_format 'mc' is padded", () => {
  assert.equal(shouldPadToFour("mc"), true);
  assert.equal(shouldPadToFour(" MC "), true);
  for (const f of ["true_false", "mc_multi", "multi_select", "text", "number", "", null, undefined, 3]) {
    assert.equal(shouldPadToFour(f), false, `format ${String(f)}`);
  }
});

test("mc with four distinct options keeps exactly those four (shuffled only)", () => {
  const opts = ["hund", "kat", "fugl", "hest"];
  const out = prepareChoiceOptions(opts, "mc", seq(0.1, 0.9, 0.4, 0.7, 0.2, 0.6));
  assert.equal(out.length, 4);
  assert.deepEqual([...out].sort(), [...opts].sort());
});

test("mc with fewer than four options is still padded from the legacy pool (unchanged)", () => {
  const out = prepareChoiceOptions(["a", "b", "c"], "mc", seq(0, 0.5));
  assert.equal(out.length, 4);
  const added = out.filter((o) => !["a", "b", "c"].includes(o));
  assert.equal(added.length, 1);
  assert.ok(LEGACY_MC_PAD_POOL.includes(added[0]));
});

test("a two-choice true/false task is NEVER padded with years", () => {
  const out = prepareChoiceOptions(["Sandt", "Falsk"], "true_false");
  assert.deepEqual(out, ["Sandt", "Falsk"]);
  assert.equal(out.some((o) => LEGACY_MC_PAD_POOL.includes(o)), false);
});

test("non-mc choice formats are returned as authored: order kept, duplicates removed", () => {
  assert.deepEqual(prepareChoiceOptions(["b", "a", "b", "c"], "multi_select"), ["b", "a", "c"]);
});

test("malformed options never crash and never invent options outside mc", () => {
  assert.deepEqual(prepareChoiceOptions(null, "true_false"), []);
  assert.deepEqual(prepareChoiceOptions("abc", "true_false"), []);
  assert.equal(prepareChoiceOptions(undefined, "mc", seq(0, 0.2, 0.4, 0.6, 0.8)).length, 4);
});

test("ensureFourOptions keeps distinct authored options and never duplicates", () => {
  const out = ensureFourOptions(["x", "x", "y"], seq(0, 0, 0.99, 0.5));
  assert.equal(new Set(out).size, out.length);
  assert.ok(out.includes("x") && out.includes("y"));
  assert.equal(out.length, 4);
});

test("app.js uses prepareChoiceOptions and no longer defines its own padding", () => {
  const src = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  assert.match(src, /import \{ prepareChoiceOptions \} from "\.\/js\/answer-options\.js";/);
  assert.match(src, /options = prepareChoiceOptions\(options, format\);/);
  assert.equal(/function ensureFourOptions/.test(src), false);
});
