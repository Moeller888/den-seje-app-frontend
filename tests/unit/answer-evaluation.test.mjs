// Question Interaction Foundation: the authoritative short-text evaluator used by process-event.
//
// Imports the real module process-event imports (supabase/functions/_shared/answer-evaluation.ts),
// so these tests pin exactly the rule that decides correct/incorrect — and therefore XP — in prod.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  normalizeTextAnswer,
  acceptedAnswerSet,
  isTextAnswerCorrect,
} from "../../supabase/functions/_shared/answer-evaluation.ts";

// ── exact matches ──────────────────────────────────────────────────────────────

test("dog = dog", () => {
  assert.equal(isTextAnswerCorrect("dog", "dog"), true);
});

test("case is ignored deterministically: Dog = dog, DOG = dog, dog = Dog", () => {
  assert.equal(isTextAnswerCorrect("Dog", "dog"), true);
  assert.equal(isTextAnswerCorrect("DOG", "dog"), true);
  assert.equal(isTextAnswerCorrect("dog", "Dog"), true);
});

test("extra whitespace is accepted: leading, trailing and inner runs collapse", () => {
  assert.equal(isTextAnswerCorrect("  dog  ", "dog"), true);
  assert.equal(isTextAnswerCorrect("ice   cream", "ice cream"), true);
  assert.equal(isTextAnswerCorrect("ice\tcream", "ice cream"), true);
  assert.equal(isTextAnswerCorrect("ice\ncream", "ice cream"), true);
  assert.equal(isTextAnswerCorrect("ice cream", "ice cream"), true, "non-breaking space");
});

test("whitespace is collapsed, not removed: icecream is not ice cream", () => {
  assert.equal(isTextAnswerCorrect("icecream", "ice cream"), false);
});

test("sentence punctuation at the ends is ignored; inside the answer it counts", () => {
  assert.equal(isTextAnswerCorrect("dog.", "dog"), true);
  assert.equal(isTextAnswerCorrect("Yes!", "yes"), true);
  assert.equal(isTextAnswerCorrect("What is it?", "What is it"), true);
  assert.equal(isTextAnswerCorrect("i,ce", "ice"), false);
});

// ── no substring / prefix matching (the bug this foundation removes) ─────────

test("a is NOT correct for apple", () => {
  assert.equal(isTextAnswerCorrect("a", "apple"), false);
});

test("app is NOT correct for apple", () => {
  assert.equal(isTextAnswerCorrect("app", "apple"), false);
});

test("a longer answer containing the correct one is NOT correct", () => {
  assert.equal(isTextAnswerCorrect("apples", "apple"), false);
  assert.equal(isTextAnswerCorrect("an apple a day", "apple"), false);
  assert.equal(isTextAnswerCorrect("pineapple", "apple"), false);
});

test("ca is NOT correct for cat (the concrete failure of the old substring rule)", () => {
  assert.equal(isTextAnswerCorrect("ca", "cat"), false);
  assert.equal(isTextAnswerCorrect("cats", "cat"), false);
});

test("no fuzzy matching: a one-letter typo is wrong", () => {
  assert.equal(isTextAnswerCorrect("aple", "apple"), false);
  assert.equal(isTextAnswerCorrect("appel", "apple"), false);
});

// ── Danish letters ─────────────────────────────────────────────────────────────

test("æ, ø and å are preserved and must match", () => {
  assert.equal(isTextAnswerCorrect("æble", "æble"), true);
  assert.equal(isTextAnswerCorrect("Æble", "æble"), true);
  assert.equal(isTextAnswerCorrect("ØL", "øl"), true);
  assert.equal(isTextAnswerCorrect("Århus", "århus"), true);
  assert.equal(normalizeTextAnswer("Søster"), "søster");
});

test("æ/ø/å are never transliterated: ae/oe/aa do not match", () => {
  assert.equal(isTextAnswerCorrect("aeble", "æble"), false);
  assert.equal(isTextAnswerCorrect("oel", "øl"), false);
  assert.equal(isTextAnswerCorrect("aarhus", "århus"), false);
  assert.equal(isTextAnswerCorrect("ble", "æble"), false);
});

test("Unicode-safe: a decomposed å (a + combining ring) equals the precomposed å", () => {
  const decomposed = "århus";
  assert.notEqual(decomposed, "århus");
  assert.equal(isTextAnswerCorrect(decomposed, "århus"), true);
});

test("typographic apostrophes from phone keyboards equal the plain apostrophe", () => {
  assert.equal(isTextAnswerCorrect("don’t", "don't"), true);
  assert.equal(isTextAnswerCorrect("don't", "don’t"), true);
  assert.equal(isTextAnswerCorrect("dont", "don't"), false);
});

// ── accepted_answers ───────────────────────────────────────────────────────────

test("accepted_answers works: a named variant is correct", () => {
  assert.equal(isTextAnswerCorrect("mom", "mum", ["mom"]), true);
  assert.equal(isTextAnswerCorrect("Mom", "mum", ["mom"]), true);
  assert.equal(isTextAnswerCorrect("mum", "mum", ["mom"]), true);
});

test("an alternative that is not named is rejected", () => {
  assert.equal(isTextAnswerCorrect("mommy", "mum", ["mom"]), false);
  assert.equal(isTextAnswerCorrect("mother", "mum", ["mom"]), false);
  assert.equal(isTextAnswerCorrect("mom", "mum"), false, "no accepted_answers → only the correct answer");
});

test("accepted_answers variants are also exact, never substrings", () => {
  assert.equal(isTextAnswerCorrect("colo", "colour", ["color"]), false);
  assert.equal(isTextAnswerCorrect("color", "colour", ["color"]), true);
});

test("malformed accepted_answers are ignored, never matched", () => {
  assert.equal(isTextAnswerCorrect("dog", "dog", "dog"), true, "string instead of array → ignored, primary still works");
  assert.equal(isTextAnswerCorrect("cat", "dog", "cat"), false);
  assert.equal(isTextAnswerCorrect("", "dog", ["", "  "]), false);
  assert.equal(isTextAnswerCorrect("1", "dog", [1, null, undefined, {}, ["1"]]), false);
  assert.deepEqual([...acceptedAnswerSet("Dog", [" dog ", "", 5, "Hound"])], ["dog", "hound"]);
});

// ── defensive inputs ───────────────────────────────────────────────────────────

test("empty or whitespace-only answers are never correct", () => {
  assert.equal(isTextAnswerCorrect("", "dog"), false);
  assert.equal(isTextAnswerCorrect("   ", "dog"), false);
  assert.equal(isTextAnswerCorrect(".", "dog"), false);
});

test("missing correct answer never makes anything correct", () => {
  assert.equal(isTextAnswerCorrect("dog", ""), false);
  assert.equal(isTextAnswerCorrect("dog", null), false);
  assert.equal(isTextAnswerCorrect("", ""), false);
  assert.equal(isTextAnswerCorrect("", null, []), false);
});

test("non-string answers are rejected, never coerced", () => {
  assert.equal(isTextAnswerCorrect(null, "dog"), false);
  assert.equal(isTextAnswerCorrect(undefined, "dog"), false);
  assert.equal(isTextAnswerCorrect(12, "12"), false);
  assert.equal(isTextAnswerCorrect(["dog"], "dog"), false);
  assert.equal(normalizeTextAnswer({ toString: () => "dog" }), "");
});

test("deterministic: the same input always gives the same result", () => {
  for (let i = 0; i < 50; i++) {
    assert.equal(isTextAnswerCorrect(" Æble. ", "æble", ["apple"]), true);
    assert.equal(isTextAnswerCorrect("app", "apple", ["apple pie"]), false);
  }
});

// ── wiring: process-event uses this evaluator, and the substring rule is gone ──

test("process-event evaluates short text with isTextAnswerCorrect and passes accepted_answers", () => {
  const src = readFileSync(new URL("../../supabase/functions/process-event/index.ts", import.meta.url), "utf8");
  assert.match(src, /from "\.\.\/_shared\/answer-evaluation\.ts"/);
  assert.match(src, /isTextAnswerCorrect\(answer, correct_answer, questionContent\?\.accepted_answers\)/);
  assert.equal(/\.includes\(c\)|c\.includes\(u\)|function isTextCorrect/.test(src), false, "substring evaluator must not return");
});
