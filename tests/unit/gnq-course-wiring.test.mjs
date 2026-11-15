// D-362 courses (owner 2026-11-15): get-next-question's course mode, pinned at source level, and course.ts's pure parts.
// The server walk is tests/unit/f07-course-completion.test.mjs; the regular request's byte-for-byte parity with the
// deployed function is get-next-question-release-gate.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  COURSE_OBJECTIVES, courseSummary, enrolmentFrom, isCourseCompleted, itemOutcome, parseCourseRequest, practiceAvailable,
} from "../../supabase/functions/get-next-question/course.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const INDEX = readFileSync(join(ROOT, "supabase/functions/get-next-question/index.ts"), "utf8").split("\r\n").join("\n");
const COURSE_TS = readFileSync(join(ROOT, "supabase/functions/get-next-question/course.ts"), "utf8");

test("parseCourseRequest: only a known course, only historie, never with D-329 targeting; actions are a fixed list", () => {
  assert.deepEqual(parseCourseRequest({}, "historie", false), { mode: "none", keep: false });
  assert.deepEqual(parseCourseRequest(null, "historie", false), { mode: "none", keep: false });
  assert.deepEqual(parseCourseRequest({ keep_course_rounds: true }, "historie", false), { mode: "none", keep: true });
  assert.deepEqual(parseCourseRequest({ keep_course_rounds: "yes" }, "historie", false), { mode: "none", keep: false });
  assert.deepEqual(parseCourseRequest({ course: "pilot_d362" }, "historie", false), { mode: "course", course: "pilot_d362", action: null });
  assert.deepEqual(parseCourseRequest({ course: "pilot_d362", course_action: "practice" }, "historie", false), { mode: "course", course: "pilot_d362", action: "practice" });
  for (const bad of ["pilot_x", "revolutions_democracy", "", 7, ["pilot_d362"], { id: "pilot_d362" }]) {
    assert.deepEqual(parseCourseRequest({ course: bad }, "historie", false), { mode: "error", status: 400, error: "invalid_course" }, JSON.stringify(bad));
  }
  assert.equal(parseCourseRequest({ course: "pilot_d362" }, "engelsk", false).error, "course_subject");
  assert.equal(parseCourseRequest({ course: "pilot_d362" }, "historie", true).error, "course_and_objective");
  assert.equal(parseCourseRequest({ course: "pilot_d362", course_action: "skip" }, "historie", false).error, "invalid_course_action");
  assert.equal(parseCourseRequest({ course_action: "practice" }, "historie", false).error, "course_action_without_course");
  assert.deepEqual([...COURSE_OBJECTIVES], ["pilot_d362"]);
});

test("enrolmentFrom: only an ACTIVE enrolment in an ACTIVE catalogued course counts", () => {
  const ok = [{ status: "active", completed_at: null, summary_acknowledged_at: null, courses: { title: "Grundloven af 1849", topics: ["a"], is_active: true } }];
  assert.deepEqual(enrolmentFrom("pilot_d362", ok), { course: "pilot_d362", title: "Grundloven af 1849", topics: ["a"], completedAt: null, acknowledged: false });
  assert.equal(enrolmentFrom("pilot_d362", [{ ...ok[0], status: "revoked" }]), null);
  assert.equal(enrolmentFrom("pilot_d362", [{ ...ok[0], courses: { ...ok[0].courses, is_active: false } }]), null);
  assert.equal(enrolmentFrom("pilot_d362", []), null);
  assert.equal(enrolmentFrom("pilot_d362", null), null);
  assert.equal(enrolmentFrom("pilot_d362", [{ ...ok[0], summary_acknowledged_at: "2026-11-15T10:00:00Z", completed_at: "2026-11-15T09:00:00Z" }]).acknowledged, true);
});

test("itemOutcome / summary: completed ≠ right ≠ needs support; no mastery field", () => {
  assert.equal(itemOutcome("secured", true, 0), "first_try");
  assert.equal(itemOutcome("secured", false, 1), "after_repetition");
  assert.equal(itemOutcome("secured", null, 2), "after_repetition");
  assert.equal(itemOutcome("secured", null, 0), "first_try");
  assert.equal(itemOutcome("needs_support", false, 2), "needs_support");
  assert.equal(itemOutcome("open", null, 0), null);
  const state = { objective: "pilot_d362", current: null, repeatIds: [], phases: [
    { items: [{ id: "a", status: "secured", firstCorrect: true, repeatCount: 0, skill: "A" }, { id: "b", status: "secured", firstCorrect: false, repeatCount: 1, skill: null }] },
    { items: [{ id: "c", status: "needs_support", firstCorrect: false, repeatCount: 2, skill: "C" }] },
  ] };
  const s = courseSummary(state);
  assert.deepEqual(s, { total: 3, completed: 3, first_try_correct: 1, correct_after_repetition: 1, needs_support: 1,
    items: [{ skill: "A", outcome: "first_try" }, { skill: "Opgave 2", outcome: "after_repetition" }, { skill: "C", outcome: "needs_support" }] });
  assert.equal("mastered" in s || "mastery" in s, false);
  assert.equal(practiceAvailable(state), true);
  assert.equal(practiceAvailable({ ...state, phases: [state.phases[0]] }), false);
  assert.equal(isCourseCompleted(state), true);
  assert.equal(isCourseCompleted({ ...state, current: 1 }), false);
  assert.equal(isCourseCompleted({ ...state, phases: [] }), false, "a course without rows is never 'completed'");
  assert.equal(/mastered|mestret/.test(COURSE_TS.replace(/\/\/.*$/gm, "")), false, "the module never computes mastery");
});

test("index.ts: the course block runs only for a course request, after targeting and before the release", () => {
  const parse = INDEX.indexOf("const courseReq = parseCourseRequest(body, scope.subject, targeting.mode === \"on\");");
  const targeting = INDEX.indexOf("const targeting = resolveObjectiveTargeting(");
  const enrolRead = INDEX.indexOf('.from("course_enrolments")\n        .select("status, completed_at, summary_acknowledged_at, courses!inner(title, topics, is_active)")');
  const release = INDEX.search(/"release_open_question_outside",\s*\{ p_domains: scope\.releaseDomains \}/);
  assert.ok(targeting > 0 && parse > targeting && enrolRead > parse && release > enrolRead, "targeting → parse → enrolment → release");
  assert.match(INDEX, /if \(courseReq\.mode === "course"\) \{\s*const \{ data: enrolRows, error: enrolError \} = await admin\(\)/);
  assert.match(INDEX, /\.eq\("student_id", student_id\)\s*\.eq\("course_id", courseReq\.course\)\s*\.limit\(1\);/);
  assert.match(INDEX, /if \(enrolment === null\) \{\s*return new Response\(JSON\.stringify\(\{ error: "course_not_available" \}\), \{[\s\S]{0,120}status: 403,/);
  assert.match(INDEX, /if \(courseReq\.mode === "none" && courseReq\.keep && scope\.subject === "historie"\) \{/);
  assert.match(INDEX, /\.select\("course_id"\)\s*\.eq\("student_id", student_id\)\s*\.eq\("status", "active"\);/);
});

test("index.ts: after the course the summary comes before any insert or repeat; practice only when practiceAvailable", () => {
  const gate = INDEX.indexOf("sortedQuestions = gate.allowed;");
  const done = INDEX.indexOf("if (enrolment !== null && isCourseCompleted(courseState)) {");
  const loop = INDEX.indexOf("for (const q of sortedQuestions)");
  assert.ok(gate > 0 && done > gate && loop > done, "gate → course completion → insert loop");
  const block = INDEX.slice(done, loop);
  assert.match(block, /await admin\(\)\.rpc\("record_course_completion", \{ p_student_id: student_id, p_course_id: enrolment\.course \}\)/);
  assert.match(block, /courseReq\.action === "practice" && practiceAvailable\(courseState\)/);
  assert.match(block, /courseCompleteBody\(enrolment, courseState, enrolment\.acknowledged\)/);
  // Every question response carries the course tag only in a course request (courseTag is {} otherwise).
  assert.equal((INDEX.match(/\.\.\.courseTag\(/g) ?? []).length, 3, "due, repeat and new-question responses");
  assert.match(INDEX, /const courseTag = \(objective: unknown\) => \(enrolment !== null && objective === enrolment\.course \? \{ course_id: enrolment\.course \} : \{\}\);/);
});
