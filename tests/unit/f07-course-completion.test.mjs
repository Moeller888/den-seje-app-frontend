// F-07 / D-362 course mode end to end on the SERVER side (PGlite, synthetic pupils only; owner decisions 2026-11-15).
//
// Each request does what get-next-question does in course mode, in index.ts's order and with the real code:
//   parseCourseRequest + the enrolment read (course.ts, migration 20261115130000) → courseScope → the due step (an open
//   round is resumed first) → loadLevelPlan (LEVEL_ENGINE=v1) → applyPhaseGate → after the course: record the FIRST
//   completion (record_course_completion), practice or summary (course.ts) → else insert / phase repeat → and the
//   answer through process_question_attempt (the path every deployed client uses).
// Regular (no `course`) requests are scope.ts's deriveQuestionScope, unchanged; their byte-for-byte parity with the
// deployed function is pinned in get-next-question-release-gate.test.mjs.
// Not covered here: the HTTP layer and the browser (the isolated F07 lane), and real concurrency (one PGlite
// connection: the two tabs are interleaved in order).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { replaySchema } from "../isolated/schema/replay.mjs";
import { bootstrapMarkerSql } from "../isolated/seed/seed-guard.mjs";
import { loadLevelPlan } from "../../supabase/functions/get-next-question/level-flow.ts";
import { HISTORY_DOMAINS, courseScope, deriveQuestionScope } from "../../supabase/functions/get-next-question/scope.ts";
import { applyPhaseGate, MAX_REPEATS } from "../../supabase/functions/get-next-question/phase-gate.ts";
import {
  courseCompleteBody, enrolmentFrom, isCourseCompleted, parseCourseRequest, practiceAvailable,
} from "../../supabase/functions/get-next-question/course.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const COURSE = "pilot_d362";
let db, ROWS = [], REGULAR = [];
const LABEL = new Map();
const ADMIN = uid(8000);

const TYPES = { p_student_id: "uuid", p_subject: "text", p_grade: "smallint", p_level: "integer", p_domains: "text[]", p_limit: "integer", p_question_ids: "uuid[]", p_max_repeats: "integer", p_course_id: "text" };
function pgClient() {
  return {
    async rpc(fn, args) {
      const keys = Object.keys(args);
      try {
        const r = await db.query(`SELECT * FROM public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}::${TYPES[k]}`).join(", ")})`, keys.map((k) => args[k]));
        return { data: r.rows, error: null };
      } catch (e) { return { data: null, error: e }; }
    },
    from(table) {
      return { select(cols) {
        const f = { eq: [], in: [] };
        const qb = {
          eq(c, v) { f.eq.push([c, v]); return qb; }, in(c, v) { f.in.push([c, v]); return qb; },
          then(res, rej) {
            const where = [...f.eq.map(([c], i) => `${c} = $${i + 1}`), ...f.in.map(([c], j) => `${c}::text = ANY($${f.eq.length + j + 1}::text[])`)];
            return db.query(`SELECT ${cols} FROM public.${table}${where.length ? " WHERE " + where.join(" AND ") : ""}`, [...f.eq.map((x) => x[1]), ...f.in.map((x) => x[1])])
              .then((r) => ({ data: r.rows, error: null }), (e) => ({ data: null, error: e })).then(res, rej);
          },
        };
        return qb;
      } };
    },
  };
}
const asService = async (fn) => { await db.exec("SET ROLE service_role"); try { return await fn(); } finally { await db.exec("RESET ROLE"); } };
async function asUser(sub, fn) {
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [sub]);
  await db.exec("SET ROLE authenticated");
  try { return await fn(); } finally { await db.exec("RESET ROLE"); await db.query("SELECT set_config('request.jwt.claim.sub', '', false)"); }
}

before(async () => {
  db = new PGlite();
  await db.exec(read("tests/isolated/schema/pglite-platform.sql"));
  await db.exec(bootstrapMarkerSql("0123456789abcdef0123456789abcdef"));
  const r = await replaySchema({ exec: (s) => db.exec(s), query: async (s) => (await db.query(s)).rows });
  assert.deepEqual(r.failures, []);
  await db.exec(read("supabase/migrations/20261108090100_stimulus_pilot_content.sql"));
  await db.exec(read("supabase/migrations/20261113170000_phase_repeat_rpc.sql"));
  await db.exec(read("supabase/migrations/20261115130000_course_enrolments.sql"));
  const act = await db.query(`UPDATE public.questions SET is_active = true WHERE metadata->>'pilot' = 'D-362' AND metadata->>'pilot_form' = 'stimulus'
    RETURNING id, difficulty_level, content, metadata, answer_format`);
  ROWS = act.rows.sort((a, b) => a.difficulty_level - b.difficulty_level);
  ROWS.forEach((q, i) => LABEL.set(q.id, `S${i + 1}`));
  // Regular history: a few active questions near grade-7 level in two history domains.
  for (const [i, lo] of [[0, "revolutions_democracy"], [1, "revolutions_democracy"], [2, "vikings"], [3, "vikings"]].map(([i, lo]) => [i, lo])) {
    const q = (await db.query(`INSERT INTO public.questions (type, content, answer_format, answer_type, metadata, difficulty, question_type,
        is_active, learning_objective, target_grade, difficulty_band, difficulty_level)
      VALUES ('mc_single', $1::jsonb, 'mc', 'short', '{}'::jsonb, 2, 'auto', true, $2, 7, 2, $3) RETURNING id, learning_objective`,
    [JSON.stringify({ type: "mc", question: `F07KURSUS almindelig ${i}: vælg A`, options: ["A", "B", "C", "D"], correct: "A", accepted_answers: ["A"] }), lo, 6000 + i * 10])).rows[0];
    REGULAR.push(q);
    LABEL.set(q.id, `R${i}`);
  }
  await db.query("INSERT INTO auth.users (id, email) VALUES ($1, 'kursus-admin@example.test')", [ADMIN]);
  await db.query("INSERT INTO public.profiles (id, role) VALUES ($1, 'super_admin')", [ADMIN]);
  assert.equal(ROWS.length, 7);
});
after(async () => { await db?.close(); });

let n = 8100;
async function pupil({ domains = null, enrol = true } = {}) {
  const id = uid(n++);
  await db.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [id, `kursus-${n}@example.test`]);
  await db.query("INSERT INTO public.profiles (id, role, selected_grade, active_domains) VALUES ($1, 'student', 7, $2::text[])", [id, domains]);
  if (enrol) await asUser(ADMIN, () => db.query("SELECT public.grant_course_enrolment($1, $2)", [id, COURSE]));
  return id;
}
const wallet = async (p) => (await db.query("SELECT coalesce((SELECT xp FROM public.student_progress WHERE student_id = $1), 0) AS xp, coalesce((SELECT coins FROM public.student_progress WHERE student_id = $1), 0) AS coins", [p])).rows[0];
const enrolmentRow = async (p) => (await db.query("SELECT status, completed_at, summary_acknowledged_at FROM public.course_enrolments WHERE student_id = $1 AND course_id = $2", [p, COURSE])).rows[0] ?? null;

// One get-next-question request. body: { course, course_action } as the client sends it.
async function request(p, body = {}) {
  const client = pgClient();
  const prof = (await db.query("SELECT selected_grade, active_domains FROM public.profiles WHERE id = $1", [p])).rows[0];
  let scope = deriveQuestionScope(prof, "historie");
  const req = parseCourseRequest(body, scope.subject, false);
  if (req.mode === "error") return { status: req.status, error: req.error };
  let enrolment = null;
  if (req.mode === "course") {
    const rows = (await db.query(`SELECT e.status, e.completed_at::text, e.summary_acknowledged_at::text,
        json_build_object('title', c.title, 'topics', c.topics, 'is_active', c.is_active) AS courses
      FROM public.course_enrolments e JOIN public.courses c ON c.course_id = e.course_id WHERE e.student_id = $1 AND e.course_id = $2 LIMIT 1`, [p, req.course])).rows;
    enrolment = enrolmentFrom(req.course, rows);
    if (!enrolment) return { status: 403, error: "course_not_available" };
    scope = courseScope(scope, enrolment.course);
  }
  // Due step: an open round is resumed before anything else.
  const open = (await db.query("SELECT qi.id, qi.repeat_count, q.learning_objective FROM public.question_instances qi JOIN public.questions q ON q.id = qi.question_id WHERE qi.student_id = $1 AND qi.answered = false LIMIT 1", [p])).rows[0];
  if (open) return { status: 200, qi: open.id, label: LABEL.get((await db.query("SELECT question_id FROM public.question_instances WHERE id = $1", [open.id])).rows[0].question_id), round_no: open.repeat_count + 1, course_id: enrolment && open.learning_objective === enrolment.course ? enrolment.course : undefined, resumed: true };
  const plan = await loadLevelPlan(client, { studentId: p, subject: "historie", grade: scope.grade, domains: scope.subjectDomains, wavePhase: "challenge", lastMisconceptionType: null, mixEngine: "shadow" });
  let list = plan.ordered, repeatIds = [], courseState;
  const g = await applyPhaseGate(client, p, plan.ordered, scope.subjectDomains, { level: plan.level.level });
  if (g.applied) { list = g.allowed; repeatIds = g.repeatIds; if (enrolment) courseState = g.courses.find((c) => c.objective === enrolment.course); }
  let practice = false;
  if (enrolment && isCourseCompleted(courseState)) {
    const at = (await asService(() => client.rpc("record_course_completion", { p_student_id: p, p_course_id: enrolment.course }))).data[0].record_course_completion;
    if (at === null) return { status: 403, error: "course_not_available" };
    if (req.action === "practice" && practiceAvailable(courseState)) { practice = true; list = []; repeatIds = []; }
    else return { status: 200, body: courseCompleteBody(enrolment, courseState, enrolment.acknowledged) };
  }
  const next = list.find((c) => c && c.content);
  if (next) {
    const qi = (await db.query(`INSERT INTO public.question_instances (student_id, question_id, answered, correct_answer, difficulty_at_time, mastery_snapshot, next_review_at)
      VALUES ($1, $2, false, $3, 1, 1, now()) RETURNING id`, [p, next.id, next.content.correct])).rows[0].id;
    return { status: 200, qi, label: LABEL.get(next.id), round_no: 1, course_id: enrolment && next.learning_objective === enrolment.course ? enrolment.course : undefined };
  }
  const r = repeatIds.length > 0
    ? await asService(() => client.rpc("request_repeat_phase_question_for_student", { p_student_id: p, p_domains: scope.subjectDomains, p_question_ids: repeatIds, p_max_repeats: MAX_REPEATS }))
    : await asService(() => client.rpc("request_repeat_level_question_for_student", { p_student_id: p, p_domains: scope.subjectDomains }));
  if (r.error) throw r.error;
  const id = Object.values(r.data?.[0] ?? {})[0] ?? null;
  if (!id) return practice ? { status: 200, body: courseCompleteBody(enrolment, courseState, enrolment.acknowledged) } : { status: 200, body: { step: "no_questions" } };
  const row = (await db.query("SELECT qi.repeat_count, qi.question_id, q.learning_objective FROM public.question_instances qi JOIN public.questions q ON q.id = qi.question_id WHERE qi.id = $1", [id])).rows[0];
  return { status: 200, qi: id, label: LABEL.get(row.question_id), round_no: row.repeat_count + 1, is_repeat: true, course_id: enrolment && row.learning_objective === enrolment.course ? enrolment.course : undefined };
}
async function answer(p, qi, ok) {
  const q = (await db.query("SELECT q.content FROM public.question_instances qi JOIN public.questions q ON q.id = qi.question_id WHERE qi.id = $1", [qi])).rows[0].content;
  const wrong = q.options ? q.options.find((o) => o !== q.correct) : String(Number(q.correct) + 1);
  return asService(async () => (await db.query("SELECT public.process_question_attempt($1, $2, $3, 0) AS r", [p, qi, ok ? q.correct : wrong])).rows[0].r);
}
// Walks the course until course_complete. decide(label, attempt) → right?
async function walkCourse(p, decide = () => true, max = 40) {
  const path = [], tries = new Map();
  for (let k = 0; k < max; k++) {
    const r = await request(p, { course: COURSE });
    if (r.body) return { path, end: r.body };
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.equal(r.course_id, COURSE, `every served question is tagged as the course: ${r.label}`);
    assert.ok(ROWS.some((q) => LABEL.get(q.id) === r.label), `only course questions in the course: ${r.label}`);
    const t = (tries.get(r.label) ?? 0) + 1; tries.set(r.label, t);
    const ok = decide(r.label, t);
    await answer(p, r.qi, ok);
    path.push(`${r.label}${r.is_repeat ? "r" : ""}${ok ? "+" : "-"}`);
  }
  return { path, end: null };
}

test("access: no enrolment → 403 course_not_available; a course request needs historie; a regular request never sees pilot rows", async () => {
  const p = await pupil({ enrol: false });
  assert.deepEqual(await request(p, { course: COURSE }), { status: 403, error: "course_not_available" });
  assert.deepEqual(await request(p, { course: "revolutions_democracy" }), { status: 400, error: "invalid_course" });
  assert.deepEqual(parseCourseRequest({ course: COURSE }, "engelsk", false), { mode: "error", status: 400, error: "course_subject" });
  assert.deepEqual(parseCourseRequest({ course_action: "practice" }, "historie", false), { mode: "error", status: 400, error: "course_action_without_course" });
  const r = await request(p, {});
  assert.ok(REGULAR.some((q) => LABEL.get(q.id) === r.label), `regular history: ${r.label}`);
  assert.equal(r.course_id, undefined);
});

test("NULL active_domains + enrolment: the course serves only the 7 pilot tasks; regular history stays all history, never a pilot row", async () => {
  const p = await pupil({ domains: null });
  assert.deepEqual(deriveQuestionScope({ selected_grade: 7, active_domains: null }, "historie").subjectDomains, [...HISTORY_DOMAINS]);
  const w = await walkCourse(p, () => true);
  assert.equal(w.end.step, "course_complete");
  assert.equal(w.path.length, 7, w.path.join(" "));
  assert.equal(w.path[0], "S1+");
  // Continue with regular history: only regular rows, never the S1 repeat.
  for (let k = 0; k < 3; k++) {
    const r = await request(p, {});
    assert.ok(REGULAR.some((q) => LABEL.get(q.id) === r.label), `regular: ${r.label}`);
    await answer(p, r.qi, true);
  }
});

test("explicit history domains + enrolment: the course is unchanged; regular history keeps the teacher's domains", async () => {
  const p = await pupil({ domains: ["vikings"] });
  const w = await walkCourse(p, () => true);
  assert.equal(w.end.step, "course_complete");
  const r = await request(p, {});
  assert.equal(LABEL.get(REGULAR.find((q) => q.learning_objective === "vikings").id).startsWith("R"), true);
  assert.ok(["R2", "R3"].includes(r.label), `only the assigned domain: ${r.label}`);
});

test("everything right: summary 7 first-try, no needs support, practice NOT offered (it would reopen a right answer)", async () => {
  const p = await pupil();
  const { end } = await walkCourse(p, () => true);
  assert.deepEqual(end.course, { id: COURSE, title: "Grundloven af 1849", topics: ["Enevælde og indskrænket monarki", "Valgretten i 1849", "At læse Grundlovens § 35", "Magtens tredeling i § 2"] });
  assert.deepEqual([end.summary.total, end.summary.completed, end.summary.first_try_correct, end.summary.correct_after_repetition, end.summary.needs_support], [7, 7, 7, 0, 0]);
  // The label is the row's metadata.pilot_skill (#671's revised content); main's older rows have none → "Opgave n".
  assert.deepEqual(end.summary.items.map((i) => i.skill), ROWS.map((q, i) => q.metadata.pilot_skill ?? `Opgave ${i + 1}`), "in authored order");
  assert.deepEqual(end.choices, { practice: false, history: true, hub: true });
  assert.equal(end.acknowledged, false);
  const json = JSON.stringify(end);
  assert.equal(/"(correct|accepted_answers|options|review_text|question)"\s*:/.test(json), false, "no answer key or content field in the summary");
  // (The course's TOPICS name concepts such as "Enevælde" by design; the per-task part must not carry a facit.)
  const items = JSON.stringify(end.summary);
  for (const q of ROWS) if (String(q.content.correct).length > 3) assert.equal(items.includes(q.content.correct), false, `no facit text: ${q.content.correct}`);
  assert.equal(/"[0-9a-f]{8}-[0-9a-f]{4}-/.test(JSON.stringify(end.summary)), false, "no ids in the summary");
  const again = await request(p, { course: COURSE, course_action: "practice" });
  assert.equal(again.body?.step, "course_complete", "practice without a wrong answer → the summary, never a right answer reopened");
});

test("everything wrong: each task 1 + MAX_REPEATS tries, never no_questions, summary 7 needs support, practice offered and bounded to wrong answers", async () => {
  const p = await pupil();
  const w0 = await wallet(p);
  const { path, end } = await walkCourse(p, () => false);
  assert.equal(path.length, 7 * (1 + MAX_REPEATS), path.join(" "));
  assert.deepEqual([end.summary.first_try_correct, end.summary.correct_after_repetition, end.summary.needs_support], [0, 0, 7]);
  assert.equal(end.choices.practice, true);
  assert.deepEqual(await wallet(p), w0, "wrong answers pay nothing");
  // Practice: one wrong task reopened by the existing generic repeat (wrong answers first); right → 2 XP + 1 coin.
  const pr = await request(p, { course: COURSE, course_action: "practice" });
  assert.equal(pr.is_repeat, true);
  assert.equal(pr.course_id, COURSE, "a course repeat is tagged (the client's \"Gentagelse\" label)");
  assert.ok(pr.round_no > 1 + MAX_REPEATS, `beyond the phase repeats: round ${pr.round_no}`);
  await answer(p, pr.qi, true);
  const after1 = await request(p, { course: COURSE });
  assert.deepEqual([after1.body.summary.correct_after_repetition, after1.body.summary.needs_support], [1, 6], "the summary follows the pupil's actual answers");
  const w = await wallet(p);
  assert.deepEqual([w.xp - w0.xp, w.coins - w0.coins], [2, 1]);
});

test("first completion is recorded once: a reload, a second tab and later practice never create a new completion", async () => {
  const p = await pupil();
  const { end } = await walkCourse(p, (l, k) => !(l === "S7" && k <= 1 + MAX_REPEATS)); // S7 needs support
  assert.equal(end.summary.needs_support, 1);
  const first = (await enrolmentRow(p)).completed_at;
  assert.ok(first);
  const reload = await request(p, { course: COURSE });              // reload of the summary
  const tab2 = await request(p, { course: COURSE });                // a second tab
  assert.equal(reload.body.step, "course_complete");
  assert.equal(tab2.body.step, "course_complete");
  assert.equal(reload.body.acknowledged, false, "not acknowledged: the client shows the summary again");
  const pr = await request(p, { course: COURSE, course_action: "practice" });
  assert.equal(pr.label, "S7");
  await answer(p, pr.qi, true);
  await request(p, { course: COURSE });
  assert.equal((await enrolmentRow(p)).completed_at.getTime(), first.getTime(), "completed_at = the FIRST completion");
});

test("acknowledge: after \"Fortsæt\" the summary is acknowledged once; later course requests say so, the pupil goes on in regular history", async () => {
  const p = await pupil();
  await walkCourse(p, () => true);
  assert.equal(await asUser(p, async () => (await db.query("SELECT public.acknowledge_course_summary($1) AS r", [COURSE])).rows[0].r), true);
  const r = await request(p, { course: COURSE });
  assert.equal(r.body.step, "course_complete");
  assert.equal(r.body.acknowledged, true, "the client goes straight to regular history (no summary loop)");
  const t1 = (await enrolmentRow(p)).summary_acknowledged_at;
  assert.equal(await asUser(p, async () => (await db.query("SELECT public.acknowledge_course_summary($1) AS r", [COURSE])).rows[0].r), true, "second tab: idempotent");
  assert.equal((await enrolmentRow(p)).summary_acknowledged_at.getTime(), t1.getTime());
  const reg = await request(p, {});
  assert.ok(reg.label.startsWith("R"));
});

test("interrupted course: the open round is resumed in the course and survives a regular request with the verified keep", async () => {
  const p = await pupil();
  const a = await request(p, { course: COURSE });
  assert.equal(a.label, "S1");
  // Reload in the course: same round.
  const b = await request(p, { course: COURSE });
  assert.deepEqual([b.qi, b.resumed], [a.qi, true]);
  // The pupil switches to regular history: the new client sends keep_course_rounds; index.ts verifies the ACTIVE
  // enrolment and keeps the course round in the release domains (simulated here with that same rule).
  const keep = (await db.query("SELECT course_id FROM public.course_enrolments WHERE student_id = $1 AND status = 'active'", [p])).rows.map((r) => r.course_id);
  const domains = [...deriveQuestionScope({ selected_grade: 7, active_domains: null }, "historie").releaseDomains, ...keep];
  const released = await asUser(p, async () => (await db.query("SELECT public.release_open_question_outside($1::text[]) AS n", [domains])).rows[0].n);
  assert.equal(released, 0, "the open course round is not deleted");
  const back = await request(p, { course: COURSE });
  assert.equal(back.qi, a.qi, "back in the course: the same round");
});

test("access revoked during the course: course requests 403, nothing deleted from the history; regular history goes on", async () => {
  const p = await pupil();
  const a = await request(p, { course: COURSE });
  await answer(p, a.qi, true);
  await asUser(ADMIN, () => db.query("SELECT public.revoke_course_enrolment($1, $2)", [p, COURSE]));
  assert.deepEqual(await request(p, { course: COURSE }), { status: 403, error: "course_not_available" });
  const answered = (await db.query("SELECT count(*)::int AS c FROM public.question_instances WHERE student_id = $1 AND answered", [p])).rows[0].c;
  assert.equal(answered, 1, "the answered course history is kept");
  const reg = await request(p, {});
  assert.ok(reg.label.startsWith("R"), `regular history: ${reg.label}`);
  // Re-grant: the pupil continues where they were (S2 next), the history intact.
  await answer(p, reg.qi, true);
  await asUser(ADMIN, () => db.query("SELECT public.grant_course_enrolment($1, $2)", [p, COURSE]));
  const back = await request(p, { course: COURSE });
  assert.equal(back.label, "S2");
});

test("a regular pupil (no enrolment, no course param) is never touched by the course logic", async () => {
  const p = await pupil({ enrol: false, domains: ["revolutions_democracy"] });
  const s = deriveQuestionScope({ selected_grade: 7, active_domains: ["revolutions_democracy"] }, "historie");
  assert.deepEqual(s.releaseDomains, [...HISTORY_DOMAINS], "release domains unchanged");
  assert.deepEqual(parseCourseRequest({ subject: "historie" }, "historie", false), { mode: "none", keep: false });
  const r = await request(p, {});
  assert.ok(["R0", "R1"].includes(r.label));
  assert.equal(r.course_id, undefined);
  assert.equal(await enrolmentRow(p), null);
});
