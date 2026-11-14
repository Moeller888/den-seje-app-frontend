// get-next-question phase gate (D-362 / F-07, ../../supabase/functions/get-next-question/phase-gate.ts):
// attempted ≠ secured ≠ needs support ≠ the provisional indicator, the rule for leaving a phase, the phase repeat list, the authored order of the
// introduction, the three reads (recording stub), and the wiring in index.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PHASE_ORDER, MAX_REPEATS, phaseRank, itemStatus, courseState, gateByPhase, applyPhaseGate } from "../../supabase/functions/get-next-question/phase-gate.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const INDEX = readFileSync(join(ROOT, "supabase", "functions", "get-next-question", "index.ts"), "utf8");
const [INTRO, UNDERSTAND, APPLY] = PHASE_ORDER;
const q = (id, phase, lvl = 5000, lo = "pilot_d362") => ({ id, learning_objective: lo, difficulty_level: lvl, metadata: phase === undefined ? { domain: "x" } : { pilot_phase: phase } });
const H = (o) => ({ answered: true, open: false, wasCorrect: null, repeatCount: 0, firstCorrect: null, ...o });

test("phaseRank: the three phases in order; no phase = null; anything else = -1 (never served)", () => {
  assert.deepEqual(PHASE_ORDER, ["introduktion", "forståelsestjek", "selvstændig anvendelse"]);
  assert.equal(phaseRank({ pilot_phase: INTRO }), 0);
  assert.equal(phaseRank({ pilot_phase: UNDERSTAND }), 1);
  assert.equal(phaseRank({ pilot_phase: APPLY }), 2);
  assert.equal(phaseRank({ pilot_phase: "forståelsestjek" }), 1, "NFD input is normalised");
  for (const m of [null, undefined, {}, { domain: "vikings" }, "x", 7]) assert.equal(phaseRank(m), null);
  for (const m of [{ pilot_phase: "anvendelse" }, { pilot_phase: 2 }, { pilot_phase: "" }]) assert.equal(phaseRank(m), -1);
});

test("itemStatus: attempted, secured and needs support are different things", () => {
  assert.equal(MAX_REPEATS, 2);
  assert.equal(itemStatus(undefined), "unserved");
  assert.equal(itemStatus(H({ answered: false, open: true })), "open");
  assert.equal(itemStatus(H({ wasCorrect: true })), "secured");
  assert.equal(itemStatus(H({ wasCorrect: true, repeatCount: 2 })), "secured", "secured on a repeat");
  assert.equal(itemStatus(H({ wasCorrect: false })), "retry", "attempted, wrong → practise again");
  assert.equal(itemStatus(H({ wasCorrect: false, repeatCount: 1 })), "retry");
  assert.equal(itemStatus(H({ wasCorrect: false, repeatCount: 2 })), "needs_support", "after MAX_REPEATS repeats: never a lock, the gap is recorded");
});

const ROWS = [q("s1", INTRO, 5800), q("s2", INTRO, 5900), q("s3", UNDERSTAND, 6100), q("s4", UNDERSTAND, 6200), q("s6", APPLY, 6450)];
const ALL = new Set(ROWS.map((r) => r.id));

test("courseState: a phase is left only when every question is secured or needs support; wrong answers are repeated first", () => {
  let c = courseState("pilot_d362", ROWS, new Map(), ALL);
  assert.equal(c.current, 0); assert.deepEqual(c.repeatIds, []);
  // both intro questions attempted, one wrong → stay in the intro, repeat the wrong one
  c = courseState("pilot_d362", ROWS, new Map([["s1", H({ wasCorrect: true, firstCorrect: true })], ["s2", H({ wasCorrect: false, firstCorrect: false })]]), ALL);
  assert.equal(c.current, 0, "attempted is NOT enough to leave the phase");
  assert.deepEqual(c.repeatIds, ["s2"]);
  // spacing: while a question of the phase is unserved, no repeat yet
  c = courseState("pilot_d362", ROWS, new Map([["s2", H({ wasCorrect: false })]]), ALL);
  assert.deepEqual(c.repeatIds, [], "s1 is still new: it comes before the repeat of s2");
  // corrected on a repeat → secured → next phase; first-time count shows it was not independent
  c = courseState("pilot_d362", ROWS, new Map([["s1", H({ wasCorrect: true, firstCorrect: true })], ["s2", H({ wasCorrect: true, repeatCount: 1, firstCorrect: false })]]), ALL);
  assert.equal(c.current, 1);
  assert.equal(c.phases[0].completed, true);
  assert.equal(c.phases[0].provisionalIndicator, true, "1 of 2 first-time correct = half → provisional indicator only");
  assert.equal(c.phases[0].firstTimeCorrect, 1);
});

test("courseState: never locked — questions that need support let the pupil leave the phase, and the gap is recorded", () => {
  const c = courseState("pilot_d362", ROWS, new Map([["s1", H({ wasCorrect: false, repeatCount: 2, firstCorrect: false })], ["s2", H({ wasCorrect: true, repeatCount: 2, firstCorrect: false })]]), ALL);
  assert.equal(c.current, 1, "moves on");
  assert.equal(c.phases[0].completed, true);
  assert.equal(c.phases[0].provisionalIndicator, false); assert.equal(c.phases[0].allSecured, false); assert.deepEqual(c.phases[0].needsSupport, ["s1"], "needs support is recorded");
  assert.deepEqual(c.repeatIds, []);
});

test("courseState: secured only by repeats (0 first-time correct) is completed and all secured, but the provisional indicator stays false", () => {
  const c = courseState("pilot_d362", ROWS, new Map([["s1", H({ wasCorrect: true, repeatCount: 1, firstCorrect: false })], ["s2", H({ wasCorrect: true, repeatCount: 1, firstCorrect: false })]]), ALL);
  assert.equal(c.phases[0].completed, true);
  assert.equal(c.phases[0].allSecured, true); assert.equal(c.phases[0].provisionalIndicator, false);
});

test("courseState: an unserved row the engine cannot serve (not a candidate) never blocks the course", () => {
  const c = courseState("pilot_d362", ROWS, new Map([["s1", H({ wasCorrect: true })]]), new Set(["s3", "s4", "s6"]));
  assert.equal(c.current, 1, "s2 is neither answered nor servable → ignored");
});

test("gateByPhase: holds later phases, keeps the engine order inside understanding, authored order inside the introduction", () => {
  const courses = [courseState("pilot_d362", ROWS, new Map(), ALL)];
  const cands = [q("s6", APPLY, 6450), q("n1"), q("s2", INTRO, 5900), q("s3", UNDERSTAND, 6100), q("u", "ukendt"), q("s1", INTRO, 5800), q("n2")];
  const g = gateByPhase(cands, courses);
  // engine order was n1, s2, s1, n2 → the intro slots are re-filled in authored order s1, s2; unphased untouched
  assert.deepEqual(g.allowed.map((c) => c.id), ["n1", "s1", "s2", "n2"]);
  assert.equal(g.held, 2);
  assert.deepEqual(g.unknownPhase, ["u"]);
  const later = [courseState("pilot_d362", ROWS, new Map([["s1", H({ wasCorrect: true })], ["s2", H({ wasCorrect: true })]]), ALL)];
  assert.deepEqual(gateByPhase([q("s4", UNDERSTAND, 6200), q("s3", UNDERSTAND, 6100)], later).allowed.map((c) => c.id), ["s4", "s3"], "understanding keeps the engine's (adaptive) order");
});

function stubClient(tables) {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        select(cols) {
          const f = { table, cols, eq: [], in: [] };
          calls.push(f);
          const qb = {
            eq(c, v) { f.eq.push([c, v]); return qb; },
            in(c, v) { f.in.push([c, v]); return qb; },
            then(res, rej) {
              let rows = tables[table] ?? [];
              for (const [c, v] of f.eq) rows = rows.filter((r) => r[c] === v);
              for (const [c, v] of f.in) rows = rows.filter((r) => v.includes(r[c]));
              return Promise.resolve({ data: rows, error: null }).then(res, rej);
            },
          };
          return qb;
        },
      };
    },
  };
}

test("applyPhaseGate: no phased candidate → no read at all", async () => {
  const c = stubClient({});
  const r = await applyPhaseGate(c, "pupil", [q("n1"), q("n2")]);
  assert.equal(r.applied, false); assert.equal(c.calls.length, 0); assert.deepEqual(r.repeatIds, []);
});

test("applyPhaseGate: three reads, all scoped (active questions without content; the pupil's own state; first-round verdicts)", async () => {
  const qs = ROWS.map((r) => ({ ...r, is_active: true })).concat([{ ...q("z", INTRO), is_active: false }]);
  const inst = [
    { id: "i1", student_id: "pupil", question_id: "s1", answered: true, was_correct: true, repeat_count: 0 },
    { id: "i2", student_id: "pupil", question_id: "s2", answered: true, was_correct: false, repeat_count: 0 },
    { id: "ix", student_id: "other", question_id: "s2", answered: true, was_correct: true, repeat_count: 0 },
  ];
  const fold = [
    { question_instance_id: "i1", student_id: "pupil", was_correct: true },
    { question_instance_id: "i2", student_id: "pupil", was_correct: false },
    { question_instance_id: "ix", student_id: "other", was_correct: true },
  ];
  const c = stubClient({ questions: qs, question_instances: inst, student_level_fold_log: fold });
  const r = await applyPhaseGate(c, "pupil", [q("s3", UNDERSTAND, 6100), q("s4", UNDERSTAND, 6200), q("s6", APPLY, 6450)]);
  assert.equal(r.applied, true);
  assert.deepEqual(r.allowed, [], "s2 wrong → still in the introduction");
  assert.deepEqual(r.repeatIds, ["s2"], "→ phase repeat of s2");
  assert.deepEqual(c.calls.map((x) => [x.table, x.cols, x.eq]), [
    ["questions", "id, learning_objective, metadata, difficulty_level", [["is_active", true]]],
    ["question_instances", "id, question_id, answered, was_correct, repeat_count", [["student_id", "pupil"]]],
    ["student_level_fold_log", "question_instance_id, was_correct", [["student_id", "pupil"]]],
  ]);
  assert.equal(r.courses[0].phases[0].firstTimeCorrect, 1, "only the pupil's own first-round verdicts count");
});

test("applyPhaseGate: in the LAST phase (no new phased candidate left) the pupil's pilot_* domain still runs the gate → phase repeat", async () => {
  const qs = ROWS.map((r) => ({ ...r, is_active: true }));
  const inst = ROWS.map((r, i) => ({ id: `i${i}`, student_id: "pupil", question_id: r.id, answered: true, was_correct: r.id !== "s6", repeat_count: 0 }));
  const c = stubClient({ questions: qs, question_instances: inst, student_level_fold_log: [] });
  const none = await applyPhaseGate(c, "pupil", []);
  assert.equal(none.applied, false, "without the domain hint nothing is known");
  const r = await applyPhaseGate(stubClient({ questions: qs, question_instances: inst, student_level_fold_log: [] }), "pupil", [], ["vikings", "pilot_d362"]);
  assert.equal(r.applied, true);
  assert.deepEqual(r.repeatIds, ["s6"], "the wrong application question is repeated in its own phase");
  const regular = stubClient({});
  assert.equal((await applyPhaseGate(regular, "pupil", [], ["vikings", "cold_war"])).applied, false);
  assert.equal(regular.calls.length, 0, "regular domains never cause a read");
});

test("applyPhaseGate: a read error is thrown (loud 500), never a silent open gate", async () => {
  const c = { from: () => ({ select: () => { const qb = { eq: () => qb, in: () => qb, then: (res) => Promise.resolve({ data: null, error: new Error("boom") }).then(res) }; return qb; } }) };
  await assert.rejects(applyPhaseGate(c, "pupil", [q("a", INTRO)]), /boom/);
  await assert.rejects(applyPhaseGate(stubClient({}), "", [q("a", INTRO)]), /missing student id/);
});

test("wiring: the gate runs after all three routes and before the insert loop; its repeat list feeds ONLY the phase repeat RPC", () => {
  assert.match(INDEX, /import \{ MAX_REPEATS, applyPhaseGate, type PhaseReadClient \} from "\.\/phase-gate\.ts";/);
  const gate = INDEX.indexOf("await applyPhaseGate(admin() as unknown as PhaseReadClient, student_id, sortedQuestions, subjectDomains, { level: pupilLevel })");
  const loop = INDEX.indexOf("for (const q of sortedQuestions)");
  assert.ok(gate > 0 && loop > gate && gate > INDEX.lastIndexOf("sortedQuestions = sortByWave("));
  assert.match(INDEX, /if \(gate\.applied\) \{[\s\S]{0,1600}sortedQuestions = gate\.allowed;\s*phaseRepeatIds = gate\.repeatIds;/);
  assert.match(INDEX, /const phaseRepeat = !inserted && phaseRepeatIds\.length > 0\s*\? await admin\(\)\.rpc\(\s*"request_repeat_phase_question_for_student",\s*\{ p_student_id: student_id, p_domains: subjectDomains, p_question_ids: phaseRepeatIds, p_max_repeats: MAX_REPEATS \}\s*\)\s*: null;/);
  // the phase repeat comes first; only without it does the generic repeat run, unchanged
  assert.match(INDEX, /const \{ data: repeatId, error: repeatError \} = phaseRepeat \?\? \(route\.repeatArgs !== "student\+domains"/);
  assert.ok(INDEX.indexOf("const phaseRepeat =") > INDEX.indexOf('if (!inserted && targeting.mode === "on")'), "never for a targeted request");
  assert.equal((INDEX.match(/request_repeat_phase_question_for_student/g) ?? []).length, 2, "the comment above the gate + the one call");
  // the level is the level engine's, set only on that route
  assert.match(INDEX, /sortedQuestions = ordered;\s*pupilLevel = level\.level;/);
});

test("wiring (race): a phase repeat that returns no row answers 409 phase_state_changed, never no_questions", () => {
  const at = INDEX.indexOf("const phaseRepeat =");
  const generic = INDEX.indexOf("if (!inserted) {", at);
  const between = INDEX.slice(at, generic);
  assert.match(between, /if \(phaseRepeat !== null && !phaseRepeat\.error && !phaseRepeat\.data\) \{/);
  assert.match(between, /JSON\.stringify\(\{ error: "phase_state_changed" \}\)[\s\S]{0,200}status: 409/);
  assert.equal(/no_questions/.test(between.replace(/\/\/.*$/gm, "")), false, "no no_questions response in code between the phase repeat and the generic repeat");
  // the client fetches again once on any error (app.js getNextQuestion) — the retry reaches the due step / a fresh gate
  const app = readFileSync(join(ROOT, "app.js"), "utf8");
  assert.match(app, /if \(error\) \{\s*await new Promise\(resolve => setTimeout\(resolve, 500\)\);\s*\(\{ data, error \} = await supabase\.functions\.invoke\("get-next-question"/);
});

// A stub client with rpc for the per-course candidates.
function stubWithRpc(tables, rpcRows) {
  const c = stubClient(tables);
  c.rpcCalls = [];
  c.rpc = (fn, args) => { c.rpcCalls.push([fn, args]); return Promise.resolve({ data: rpcRows(args), error: null }); };
  return c;
}

test("candidate window: a crowded 50-window cannot hide the current phase — with the level, the course's own candidates are fetched", async () => {
  const qs = ROWS.map((r) => ({ ...r, is_active: true }));
  const filler = Array.from({ length: 50 }, (_, i) => q(`n${i}`)); // 50 unphased candidates fill the engine window
  // without the fetch: the intro rows are NOT in the window → the gate cannot prove them unservable → conservative hold
  const conservative = await applyPhaseGate(stubClient({ questions: qs, question_instances: [], student_level_fold_log: [] }), "pupil",
    [...filler, q("s3", UNDERSTAND, 6100)], ["pilot_d362"]);
  assert.equal(conservative.courses[0].current, 0, "intro still pending (window full) — no later phase slips through");
  assert.equal(conservative.allowed.some((c) => c.id === "s3"), false);
  // with the level: one RPC per course, that domain only; the intro rows join the allowed list in authored order
  const c = stubWithRpc({ questions: qs, question_instances: [], student_level_fold_log: [] },
    (args) => ROWS.filter(() => args.p_domains.length === 1 && args.p_domains[0] === "pilot_d362").map((r) => ({ ...r, content: { question: r.id } })));
  const r = await applyPhaseGate(c, "pupil", [...filler, q("s3", UNDERSTAND, 6100)], ["pilot_d362"], { level: 5857 });
  assert.deepEqual(c.rpcCalls, [["get_level_questions_for_student", { p_student_id: "pupil", p_level: 5857, p_domains: ["pilot_d362"], p_limit: 100 }]]);
  assert.equal(r.fetched, 4, "s1, s2, s4, s6 were outside the window");
  assert.deepEqual(r.allowed.filter((x) => phaseRank(x.metadata) !== null).map((x) => x.id), ["s1", "s2"], "only the intro, in authored order");
  assert.equal(r.allowed.filter((x) => phaseRank(x.metadata) === null).length, 50, "unphased candidates untouched");
});

test("candidate window: below the cap, a row the engine does not offer is provably unservable and never blocks", async () => {
  const qs = ROWS.map((r) => ({ ...r, is_active: true }));
  const r = await applyPhaseGate(stubClient({ questions: qs, question_instances: [{ id: "i1", student_id: "pupil", question_id: "s1", answered: true, was_correct: true, repeat_count: 0 }], student_level_fold_log: [] }),
    "pupil", [q("s3", UNDERSTAND, 6100), q("s4", UNDERSTAND, 6200), q("s6", APPLY, 6450)], ["pilot_d362"]);
  assert.equal(r.courses[0].current, 1, "s2 is neither answered nor offered (window not full) → ignored, never a dead end");
});
