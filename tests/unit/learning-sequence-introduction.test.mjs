// LP-13 / K9 prototype: the introduction step in _shared/learning-sequence.ts, OFF unless a caller passes
// { introduction: true }. Proves: off = exactly nextStep(historyFromRows(rows)) on a matrix of histories; on = the
// introduction first until a tagged row has a server presented_at; a client cannot satisfy it with anything else.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INTRODUCTION_STEP, historyFromRows, introductionPresented, nextStep, nextStepWithIntroduction,
} from "../../supabase/functions/_shared/learning-sequence.ts";

const T0 = Date.parse("2026-11-09T10:00:00Z");
const row = (step, { answered = true, was_correct = true, answered_at = "2026-11-09T09:00:00Z", presented_at = null } = {}) =>
  ({ answered, was_correct, answered_at, presented_at, questions: { metadata: { learning_step: step } } });
const HISTORIES = [
  [], [row("guided_practice", { was_correct: false })], [row("guided_practice")],
  [row("guided_practice"), row("independent_application")],
  [row("guided_practice"), row("independent_application"), row("transfer", { answered_at: "2026-11-08T09:00:00Z" })],
  [row("introduction", { answered: false, presented_at: "2026-11-09T08:00:00Z" })], "not an array", null,
];

test("off (no option, or false): exactly nextStep(historyFromRows(rows)) — the existing policy is untouched", () => {
  for (const h of HISTORIES) {
    const expected = nextStep(historyFromRows(h), T0);
    assert.deepEqual(nextStepWithIntroduction(h, T0), expected, JSON.stringify(h));
    assert.deepEqual(nextStepWithIntroduction(h, T0, { introduction: false }), expected);
    assert.deepEqual(nextStepWithIntroduction(h, T0, {}), expected);
  }
  // An introduction row is invisible to the existing history: it is not a known step.
  assert.deepEqual(historyFromRows([row("introduction")])[0].step, null);
});

test("on: the introduction comes first until the server registered its presentation; then the sequence as before", () => {
  assert.deepEqual(nextStepWithIntroduction([], T0, { introduction: true }), { state: "introduction", step: INTRODUCTION_STEP, policy: "laerligverse-test-policy-v0" });
  const served = [row("introduction", { answered: false })];
  assert.equal(nextStepWithIntroduction(served, T0, { introduction: true }).state, "introduction", "served but not presented");
  const presented = [row("introduction", { answered: false, presented_at: "2026-11-09T09:30:00Z" })];
  assert.deepEqual(nextStepWithIntroduction(presented, T0, { introduction: true }), nextStep([], T0));
  const later = [...presented, row("guided_practice")];
  assert.deepEqual(nextStepWithIntroduction(later, T0, { introduction: true }), nextStep(historyFromRows(later), T0));
});

test("only a server presented_at on an introduction-tagged row counts — never an answer, another step or a client field", () => {
  for (const r of [
    row("introduction", { presented_at: "" }), row("introduction", { presented_at: 1 }), row("guided_practice", { presented_at: "2026-11-09T09:00:00Z" }),
    { ...row("introduction"), presented: true }, { presented_at: "2026-11-09T09:00:00Z", questions: null }, { presented_at: "2026-11-09T09:00:00Z" },
  ]) assert.equal(introductionPresented([r]), false, JSON.stringify(r));
  assert.equal(introductionPresented(null), false);
  assert.equal(introductionPresented([row("introduction", { presented_at: "2026-11-09T09:00:00Z" })]), true);
});
