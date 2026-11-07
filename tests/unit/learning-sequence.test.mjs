// D-338: the server-directed learning sequence. Offline: the real policy module that get-next-question (and the
// local demo) runs, plus source checks of index.ts. The real backend is in tests/isolated/learning-sequence.isolated.spec.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  POLICY_ID, REVISIT_AFTER_HOURS, STEPS, STEP_IDS, checkRequestedStep, historyFromRows, nextStep, stepOf,
} from "../../supabase/functions/_shared/learning-sequence.ts";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const INDEX = strip(readFileSync(join(REPO, "supabase/functions/get-next-question/index.ts"), "utf8"));
const T0 = Date.parse("2026-11-04T08:00:00.000Z");
const iso = (h) => new Date(T0 + h * 3_600_000).toISOString();
const done = (step, wasCorrect, h = 0) => ({ step, answered: true, wasCorrect, answeredAt: iso(h) });

test("steps, modes and roles: practice steps can never become evidence; assessment steps can (later, under K4)", () => {
  assert.deepEqual(STEP_IDS, ["guided_practice", "revision", "independent_application", "transfer", "revisit"]);
  for (const s of STEPS) assert.equal(s.mayBecomeEvidence, s.kind === "assessment", s.id);
  assert.deepEqual(STEPS.map((s) => s.mode), ["practice", "practice", "check", "application", "review"]);
  assert.match(POLICY_ID, /test-policy/);
});

test("pupil A (new): starts at guided practice; an unanswered (open) round does not move the sequence", () => {
  assert.equal(nextStep([], T0).step, "guided_practice");
  assert.equal(nextStep([{ step: "guided_practice", answered: false, wasCorrect: null, answeredAt: null }], T0).step, "guided_practice");
});

test("pupil B (wrong practice): revision is inserted once; after it the sequence moves on, whatever the verdict", () => {
  assert.equal(nextStep([done("guided_practice", false)], T0).step, "revision");
  assert.equal(nextStep([done("guided_practice", false), done("revision", false, 1)], T0).step, "independent_application");
  // A later correct practice answer cancels the need for revision (the LATEST practice answer counts).
  assert.equal(nextStep([done("guided_practice", false), done("guided_practice", true, 1)], T0).step, "independent_application");
});

test("pupil C (right practice): no revision; application, then transfer, then the revisit WAITS until it is due", () => {
  const h = [done("guided_practice", true), done("independent_application", true, 1)];
  assert.equal(nextStep(h, T0).step, "transfer");
  const afterTransfer = [...h, done("transfer", true, 2)];
  const waiting = nextStep(afterTransfer, T0 + 3 * 3_600_000);
  assert.equal(waiting.state, "waiting");
  assert.equal(waiting.dueAt, iso(2 + REVISIT_AFTER_HOURS));
  assert.equal(nextStep(afterTransfer, T0 + (2 + REVISIT_AFTER_HOURS) * 3_600_000).step, "revisit");
  assert.equal(nextStep([...afterTransfer, done("revisit", true, 30)], T0 + 40 * 3_600_000).state, "complete");
});

test("pupil E (skipping): a client may NAME the current step, never choose another one", () => {
  const d = nextStep([], T0);
  assert.deepEqual(checkRequestedStep(undefined, d), { ok: true });
  assert.deepEqual(checkRequestedStep("guided_practice", d), { ok: true });
  assert.deepEqual(checkRequestedStep("transfer", d), { ok: false, status: 409, error: "learning_step_not_current" });
  assert.deepEqual(checkRequestedStep("revisit", d), { ok: false, status: 409, error: "learning_step_not_current" });
  for (const bad of ["mastery", "", 3, ["transfer"], { step: "transfer" }]) {
    assert.deepEqual(checkRequestedStep(bad, d), { ok: false, status: 400, error: "invalid_learning_step" }, JSON.stringify(bad));
  }
  // While waiting for the revisit, even "revisit" is not current.
  const waiting = nextStep([done("guided_practice", true), done("independent_application", true), done("transfer", true)], T0);
  assert.equal(checkRequestedStep("revisit", waiting).ok, false);
});

test("no mastery, no level, no evidence: the decision carries only a step, a mode and the policy id", () => {
  for (const d of [nextStep([], T0), nextStep([done("guided_practice", true), done("independent_application", true), done("transfer", true), done("revisit", true, 30)], T0 + 1e9)]) {
    for (const k of Object.keys(d)) assert.ok(["state", "step", "mode", "policy", "dueAt"].includes(k), k);
    assert.equal(/master|mestr|level|evidence|xp|coins/i.test(JSON.stringify(d)), false);
  }
});

test("untagged or unknown step tags never count; malformed rows are safe", () => {
  assert.equal(stepOf({ learning_step: "guided_practice" }), "guided_practice");
  for (const m of [null, undefined, {}, { learning_step: "mastered" }, { learning_step: 3 }, "x"]) assert.equal(stepOf(m), null);
  assert.deepEqual(historyFromRows(null), []);
  const rows = historyFromRows([{ answered: true, was_correct: false, answered_at: iso(0), questions: { metadata: { learning_step: "guided_practice" } } }, { answered: true, questions: null }]);
  assert.deepEqual(rows[0], { step: "guided_practice", answered: true, wasCorrect: false, answeredAt: iso(0) });
  assert.equal(rows[1].step, null);
  // An answered untagged item does not complete any step.
  assert.equal(nextStep(rows.slice(1), T0).step, "guided_practice");
});

test("index.ts: the sequence runs only with the secret ON, targeting ON and body.sequence — off-path calls unchanged", () => {
  assert.match(INDEX, /if \(targeting\.mode === "on" && Deno\.env\.get\("LAERLIGVERSE_SEQUENCE"\) === "on" && body\?\.sequence === true\) \{/);
  // The step comes from the SERVER's history read, scoped to the verified pupil and the targeted objective.
  assert.match(INDEX, /\.select\("answered, was_correct, answered_at, questions!inner\(learning_objective, metadata\)"\)\s*\.eq\("student_id", student_id\)\s*\.eq\("questions\.learning_objective", targeting\.objective\);/);
  assert.match(INDEX, /const decision = nextStep\(historyFromRows\(historyRows\), Date\.now\(\)\);/);
  assert.match(INDEX, /const requested = checkRequestedStep\(body\?\.learning_step, decision\);/);
});

test("index.ts: only the current step's items are candidates; an open round in another step is refused; the step is echoed", () => {
  assert.match(INDEX, /if \(sequence !== null && stepOf\(q\.metadata\) !== sequence\.step\) continue;/);
  assert.match(INDEX, /error: "open_question_other_step"/);
  assert.match(INDEX, /reason: "step_exhausted", learning_step: sequence\.step/);
  assert.equal((INDEX.match(/\.\.\.\(sequence !== null \? \{ learning_step: sequence\.step, mode: sequence\.mode \} : \{\}\),/g) ?? []).length, 3);
});
