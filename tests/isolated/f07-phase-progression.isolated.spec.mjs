// F-07 / D-362: the whole pilot — all SEVEN stimulus questions — through the REAL chain on the isolated stack:
// this commit's get-next-question (phase gate, phase repeat) and process-event over HTTP, local Auth and Postgres,
// and the quiz in the browser.
//
// WHERE IT RUNS: the dispatch-only F07 lane of .github/workflows/isolated-e2e.yml (input profile = f07). That lane
// replays the phase repeat function (TEST_PROFILES.f07: 20261113170000, NOT_IN_PRODUCTION), serves the Edge Functions
// with production's selection settings (LEVEL_ENGINE=v1, QUESTION_MIX_ENGINE=shadow, no Lærligverse flag) and sets
// F07_LANE=1. In that lane a missing function or a failed seed FAILS the run (never a silent skip), and a check step
// requires the expected number of executed tests. In every other lane the function is absent and the tests are
// skipped. The replay never stores question rows: the seven pilot rows are seeded here, ACTIVE, from the pilot
// migration's own JSON (20261108090100, byte for byte its content), in this throwaway database only.
// How to run: docs/operations/f07-isolated-e2e.md.
//
// Backend (chromium once), the real Edge Functions over HTTP:
//   1. phase order (S1 first), a reload keeps the open round (D-362 P1), a wrong answer is practised in its phase
//      before the next phase, no no_questions, nothing grading-related in a payload, 10 / 2 XP, a re-submit pays nothing;
//   2. a pupil without the pilot domain is never served a pilot row;
//   3. two tabs at once when a phase repeat is due: both get the SAME open round, never no_questions;
//   4. all answers wrong: every question at most 1 + 2 attempts, the pupil always moves on, never no_questions.
// Browser (every project): each of the seven stimuli is shown; the image description opens (and has a read-aloud
//   control whenever the source text has one — audio itself cannot play without a voice in CI); all seven are
//   answered in the quiz (MC by click, numbers by typing) in phase order.
//
// COURSE MODEL (owner decisions 2026-11-15, migration 20261115130000, also replayed by TEST_PROFILES.f07): access is an
// ENROLMENT granted through grant_course_enrolment by a (synthetic) super_admin; active_domains is untouched — the
// pupils here have active_domains = NULL ("all history"). The course is requested with `course: "pilot_d362"`; after
// the seventh task the server answers course_complete (the pupil's real figures), never the generic S1 repeat. In the
// browser the pupil chooses the course, sees the summary, chooses "Fortsæt med historie" and gets REGULAR history (one
// regular row is seeded for that), and a reload shows neither the summary nor the offer again.
import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { assertIsolated, SYNTHETIC_EMAIL_DOMAIN } from "./isolation-guard.mjs";

assertIsolated(process.env);

const BASE = process.env.ISOLATED_BASE_URL.replace(/\/+$/, "");
const SUPA = process.env.ISOLATED_SUPABASE_URL.replace(/\/+$/, "");
const ANON = process.env.ISOLATED_SUPABASE_ANON_KEY;
const SERVICE = process.env.ISOLATED_SUPABASE_SERVICE_KEY;
const RUN = (process.env.GITHUB_RUN_ID || "local") + "-" + (process.env.GITHUB_RUN_ATTEMPT || "1");
const F07_LANE = process.env.F07_LANE === "1";
const svc = { apikey: SERVICE, authorization: `Bearer ${SERVICE}` };
const json = { "content-type": "application/json" };
const OBJECTIVE = "pilot_d362";
const PHASES = ["introduktion", "forståelsestjek", "selvstændig anvendelse"];
const MAX_REPEATS = 2;

// The seven pilot rows exactly as the migration stores them, labelled S1–S7 by level.
const SQL = readFileSync(new URL("../../supabase/migrations/20261108090100_stimulus_pilot_content.sql", import.meta.url), "utf8");
const PILOT = JSON.parse(/\$pilot\$(\[[\s\S]*\])\$pilot\$::jsonb/.exec(SQL)[1]).sort((a, b) => a.difficulty_level - b.difficulty_level);
const BY_QUESTION = new Map(PILOT.map((r, i) => [r.content.question, { label: `S${i + 1}`, rank: PHASES.indexOf(r.metadata.pilot_phase), row: r }]));
const GRADING_KEYS = ["correct", "accepted_answers", "review_text", "correct_answer", "pilot_phase", "pilot_skill"];
// The summary's topic names (#671 metadata.pilot_skill; "Opgave n" only for a row without one).
const SKILLS = PILOT.map((r, i) => r.metadata.pilot_skill ?? `Opgave ${i + 1}`);

// Not serial: one failing test must not hide the others (CI run 43619749472: backend 3 failed and backend 4 + the
// browser test "did not run"). With one worker, a failure restarts the worker and beforeAll runs again (idempotent).
let inProfile = false;
let ADMIN = null;
const REGULAR_CONTENT = { type: "mc", question: "F07 E2E almindelig historie: Hvornår blev Grundloven underskrevet?", options: ["1660", "1849", "1915", "1953"], correct: "1849", accepted_answers: ["1849"] };
test.beforeAll(async ({ request }) => {
  expect(PILOT.length, "the pilot migration holds seven rows").toBe(7);
  const fn = await request.post(`${SUPA}/rest/v1/rpc/request_repeat_phase_question_for_student`,
    { headers: { ...svc, ...json }, data: { p_student_id: null, p_domains: null, p_question_ids: null, p_max_repeats: 2 } });
  if (fn.status() === 404 && !F07_LANE) return; // another lane: nothing to test here
  expect(fn.status(), `F07 lane: the phase repeat function must exist (${await fn.text()})`).toBe(200);
  const cat = await request.get(`${SUPA}/rest/v1/courses?select=course_id,title&course_id=eq.${OBJECTIVE}`, { headers: svc });
  expect(cat.status(), `F07 lane: the course catalogue must exist (${await cat.text()})`).toBe(200);
  expect((await cat.json()).length, "the approved pilot course is catalogued").toBe(1);
  inProfile = true;
  ADMIN = await makeUser(request, `admin-${Date.now()}`, "super_admin");
  // One REGULAR history row, so "Fortsæt med historie" has something to serve (the replay stores no question rows).
  const reg = await (await request.get(`${SUPA}/rest/v1/questions?select=id&metadata->>f07_e2e=eq.regular`, { headers: svc })).json();
  if (reg.length === 0) {
    const ins = await request.post(`${SUPA}/rest/v1/questions`, { headers: { ...svc, ...json, prefer: "return=minimal" }, data: [{
      type: "mc_single", content: REGULAR_CONTENT, answer_format: "mc", answer_type: "short", metadata: { f07_e2e: "regular" },
      difficulty: 2, question_type: "auto", is_active: true, learning_objective: "revolutions_democracy", target_grade: 7,
      difficulty_band: 2, difficulty_level: 6000,
    }] });
    expect(ins.status(), await ins.text()).toBe(201);
  }
  // Seed the seven pilot rows ACTIVE (the later, separate owner activation — here only), once per stack.
  const have = await (await request.get(`${SUPA}/rest/v1/questions?select=id&learning_objective=eq.${OBJECTIVE}&metadata->>pilot_form=eq.stimulus`, { headers: svc })).json();
  if (have.length !== 7) {
    expect(have.length, "either none or all seven pilot rows").toBe(0);
    const rows = PILOT.map((r) => ({
      type: r.type, content: r.content, answer_format: r.answer_format, answer_type: "short", metadata: r.metadata,
      difficulty: r.difficulty_band, question_type: "auto", is_active: true, learning_objective: OBJECTIVE, target_grade: 7,
      difficulty_band: r.difficulty_band, difficulty_level: r.difficulty_level,
    }));
    const ins = await request.post(`${SUPA}/rest/v1/questions`, { headers: { ...svc, ...json, prefer: "return=minimal" }, data: rows });
    expect(ins.status(), await ins.text()).toBe(201);
  }
  const active = await (await request.get(`${SUPA}/rest/v1/questions?select=id&learning_objective=eq.${OBJECTIVE}&is_active=eq.true`, { headers: svc })).json();
  expect(active.length, "seven active pilot rows in the isolated stack").toBe(7);
});
test.beforeEach(() => { test.skip(!inProfile, "not the F07 lane (the phase repeat function is absent)"); });
// The browser test's evidence (URL, console errors, failed requests), attached to the report when it fails.
let browserEvidence = null;
test.afterEach(async ({}, testInfo) => {
  if (browserEvidence && testInfo.status !== testInfo.expectedStatus) {
    await testInfo.attach("f07-browser-evidence", { body: browserEvidence(), contentType: "text/plain" });
    console.log(`F07 browser evidence (${testInfo.project.name}):\n${browserEvidence()}`);
  }
  browserEvidence = null;
});

// A synthetic pupil (active_domains NULL = all history unless given), enrolled in the course through the authorised
// server path (grant_course_enrolment as the synthetic super_admin) unless enrol is false.
async function makePupil(request, tag, { domains = null, enrol = true } = {}) {
  const p = await makeUser(request, tag, "student", domains);
  if (enrol) {
    const g = await request.post(`${SUPA}/rest/v1/rpc/grant_course_enrolment`, { headers: { ...asPupil(ADMIN), ...json }, data: { p_student_id: p.id, p_course_id: OBJECTIVE } });
    expect(g.status(), await g.text()).toBe(200);
    expect(await g.json(), "the super_admin grants the course").toBe("granted");
  }
  return p;
}
async function makeUser(request, tag, role, domains = null) {
  const email = `f07-phase-${tag}-${RUN}@${SYNTHETIC_EMAIL_DOMAIN}`;
  const password = createHash("sha256").update(`isolated-f07-phase-${tag}:${RUN}`).digest("base64url");
  const created = await request.post(`${SUPA}/auth/v1/admin/users`, { headers: svc, data: { email, password, email_confirm: true } });
  expect(created.status(), "local Auth must create the synthetic pupil").toBe(200);
  const id = (await created.json()).id;
  const profile = await request.post(`${SUPA}/rest/v1/profiles`, {
    headers: { ...svc, ...json, prefer: "return=minimal" },
    // A pupil who has already chosen an avatar identity, like every returning pupil: without chosen_at, index.html
    // shows the identity prompt (Section 152C) and waits for a choice BEFORE the first question is fetched (CI run
    // 43619749472: no get-next-question call in firefox/webkit). The prompt itself is not part of F-07.
    data: { id, role, full_name: `Syntetisk F-07-${role} ${tag}`, selected_grade: role === "student" ? 7 : null, active_domains: domains, equipped_slots: {}, active_theme: "default",
      avatar_identity: { v: 1, body_type: "neutral", chosen_at: "2026-11-14T00:00:00.000Z" } },
  });
  expect(profile.status(), await profile.text()).toBe(201);
  const signIn = await request.post(`${SUPA}/auth/v1/token?grant_type=password`, { headers: { apikey: ANON }, data: { email, password } });
  expect(signIn.status()).toBe(200);
  return { id, email, password, token: (await signIn.json()).access_token };
}
const asPupil = (p) => ({ apikey: ANON, authorization: `Bearer ${p.token}` });
const progressOf = async (request, p) => (await (await request.get(`${SUPA}/rest/v1/student_progress?select=xp,coins&student_id=eq.${p.id}`, { headers: svc })).json())[0] ?? { xp: 0, coins: 0 };
const keysDeep = (v, out = new Set()) => { if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { out.add(k); keysDeep(x, out); } return out; };

// One raw call of the real Edge Function, as app.js makes it.
// Course requests by default (`course`, as app.js sends it in the course); `{}` = a regular historie request.
const IN_COURSE = { course: OBJECTIVE };
const gnqRaw = (request, p, extra = IN_COURSE) => request.post(`${SUPA}/functions/v1/get-next-question`, { headers: { ...asPupil(p), ...json }, data: { subject: "historie", ...extra } });
// With the client's behaviour: one retry after an error (409 phase_state_changed after a lost race).
async function nextQuestion(request, p, extra = IN_COURSE) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await gnqRaw(request, p, extra);
    if (res.status() === 409 && attempt === 0) continue;
    expect(res.status(), await res.text()).toBe(200);
    return await res.json();
  }
}
const answer = (request, p, instanceId, value) => request.post(`${SUPA}/functions/v1/process-event`, {
  headers: { ...asPupil(p), ...json }, data: { student_id: p.id, question_instance_id: instanceId, answer: value, question_shown_at: Date.now() },
});
const wrongFor = (row) => (row.answer_format === "number" ? String(Number(row.content.correct) + 1) : row.content.options.find((o) => o !== row.content.correct));
const metaOf = (q) => {
  const meta = BY_QUESTION.get(q?.content?.question);
  expect(meta, `served a pilot row: ${JSON.stringify(q).slice(0, 200)}`).toBeTruthy();
  return meta;
};
const nonDecreasing = (ranks) => ranks.every((r, i) => i === 0 || r >= ranks[i - 1]);

test("backend 1: all seven in phase order; a reload keeps the open round; a wrong answer is practised in its phase; rewards once", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "backend path: once per run");
  test.slow();
  const p = await makePupil(request, "api");
  const start = await progressOf(request, p);
  let expectXp = 0;
  const path = [];
  const tries = new Map();
  const secured = new Set();
  for (let step = 0; step < 20 && secured.size < 7; step++) {
    const q = await nextQuestion(request, p);
    expect(q.step, `no_questions before all seven were secured: ${path.join(" ")}`).not.toBe("no_questions");
    const meta = metaOf(q);
    const keys = keysDeep(q);
    for (const k of GRADING_KEYS) expect(keys.has(k), `payload carries ${k}`).toBe(false);
    if (step === 0) {
      const again = await nextQuestion(request, p);
      expect(again.question_instance_id, "the open pilot round survives a second request (reload)").toBe(q.question_instance_id);
    }
    const k = (tries.get(meta.label) ?? 0) + 1; tries.set(meta.label, k);
    // Every course round is tagged with the course; a phase repeat is round 2+ — what app.js shows as "Gentagelse".
    expect(q.course_id, "a course round carries the course").toBe(OBJECTIVE);
    expect(q.round_no, `${meta.label}: round ${k}`).toBe(k);
    const right = !(meta.label === "S1" && k === 1); // S1 wrong once, everything else right
    const res = await answer(request, p, q.question_instance_id, right ? meta.row.content.correct : wrongFor(meta.row));
    expect(res.status(), await res.text()).toBe(200);
    expect((await res.json()).status).toBe(right ? "correct" : "incorrect");
    if (right) {
      expectXp += k === 1 ? 10 : 2; secured.add(meta.label);
      // a re-submit of the same round (a network retry) pays nothing
      const xpNow = (await progressOf(request, p)).xp;
      const again = await answer(request, p, q.question_instance_id, meta.row.content.correct);
      expect(again.status()).toBe(200);
      expect((await progressOf(request, p)).xp, "no second payment for the same answer").toBe(xpNow);
    }
    path.push(`${meta.label}${k > 1 ? "r" : ""}${right ? "+" : "-"}@${meta.rank}`);
  }
  console.log(`F07 backend path: ${path.join(" ")}`);
  expect(nonDecreasing(path.map((s) => Number(s.split("@")[1]))), `phases never step back: ${path.join(" ")}`).toBe(true);
  expect(path.slice(0, 3).map((s) => s.split("@")[0]), "S1 first; S2 (spacing), then the S1 repeat, before any later phase").toEqual(["S1-", "S2+", "S1r+"]);
  expect(secured.size).toBe(7);
  const paid = await progressOf(request, p);
  expect(paid.xp - start.xp, "10 XP per right first answer, 2 per right repeat").toBe(expectXp);
  // The summary: the pupil's real figures (S1 right after its repeat, the other six right first time), no XP for it.
  const done = await nextQuestion(request, p);
  expect(done.step).toBe("course_complete");
  expect([done.summary.total, done.summary.completed, done.summary.first_try_correct, done.summary.correct_after_repetition, done.summary.needs_support]).toEqual([7, 7, 6, 1, 0]);
  expect(done.choices.practice, "nothing wrong left → no practice").toBe(false);
  const again = await nextQuestion(request, p);
  expect(again.step, "a reload: the same summary, no new completion").toBe("course_complete");
  const after = await progressOf(request, p);
  expect([after.xp, after.coins], "opening the summary pays nothing").toEqual([paid.xp, paid.coins]);
});

test("backend 2: a pupil without the pilot domain is never served a pilot row", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "backend path: once per run");
  const p = await makePupil(request, "noaccess", { domains: ["revolutions_democracy"], enrol: false });
  const denied = await gnqRaw(request, p);
  expect(denied.status(), "a course request without an enrolment").toBe(403);
  expect((await denied.json()).error).toBe("course_not_available");
  for (let i = 0; i < 3; i++) {
    const q = await nextQuestion(request, p, {});
    if (q.step === "no_questions") break;
    expect(BY_QUESTION.has(q?.content?.question), "a regular pupil got a pilot question").toBe(false);
    const qi = q.question_instance_id;
    await answer(request, p, qi, "x");
  }
  const rows = await (await request.get(`${SUPA}/rest/v1/question_instances?select=question_id&student_id=eq.${p.id}`, { headers: svc })).json();
  const pilotIds = (await (await request.get(`${SUPA}/rest/v1/questions?select=id&learning_objective=eq.${OBJECTIVE}`, { headers: svc })).json()).map((r) => r.id);
  expect(rows.filter((r) => pilotIds.includes(r.question_id)), "no pilot instance for a regular pupil").toEqual([]);
  // The pupil cannot enrol themself: neither through the grant function nor by writing the table.
  const self = await request.post(`${SUPA}/rest/v1/rpc/grant_course_enrolment`, { headers: { ...asPupil(p), ...json }, data: { p_student_id: p.id, p_course_id: OBJECTIVE } });
  expect(self.status(), "self-enrolment through the function").not.toBe(200);
  expect(await self.text()).toContain("not_authorized");
  const write = await request.post(`${SUPA}/rest/v1/course_enrolments`, { headers: { ...asPupil(p), ...json, prefer: "return=minimal" }, data: { student_id: p.id, course_id: OBJECTIVE } });
  expect(write.status(), "self-enrolment by writing the table").not.toBe(201);
  expect((await gnqRaw(request, p)).status(), "still no course").toBe(403);

  // Revoked mid-course: an enrolled pupil with an open course round loses the course on the next request, and gets
  // regular history (never a pilot row) — the course progress already answered stays in place.
  const r = await makePupil(request, "revoked");
  const first = await nextQuestion(request, r);
  expect(first.course_id).toBe(OBJECTIVE);
  expect((await (await answer(request, r, first.question_instance_id, metaOf(first).row.content.correct)).json()).status).toBe("correct");
  const open = await nextQuestion(request, r);
  expect(open.course_id, "a second course round is open").toBe(OBJECTIVE);
  const rv = await request.post(`${SUPA}/rest/v1/rpc/revoke_course_enrolment`, { headers: { ...asPupil(ADMIN), ...json }, data: { p_student_id: r.id, p_course_id: OBJECTIVE } });
  expect(await rv.json(), "the super_admin revokes").toBe("revoked");
  const gone = await gnqRaw(request, r);
  expect(gone.status(), "the course after a revoke").toBe(403);
  expect((await gone.json()).error).toBe("course_not_available");
  for (let i = 0; i < 2; i++) {
    const q = await nextQuestion(request, r, { keep_course_rounds: true });
    if (q.step === "no_questions") break;
    expect(BY_QUESTION.has(q?.content?.question), "a revoked pupil got a pilot question").toBe(false);
    expect(q.course_id).toBeUndefined();
    await answer(request, r, q.question_instance_id, "x");
  }
  const kept = await (await request.get(`${SUPA}/rest/v1/question_instances?select=id&student_id=eq.${r.id}&answered=eq.true&id=eq.${first.question_instance_id}`, { headers: svc })).json();
  expect(kept.length, "the answered course round is kept after the revoke").toBe(1);
});

test("backend 3: two tabs at once when a phase repeat is due get the SAME open round, never no_questions", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "backend path: once per run");
  const p = await makePupil(request, "tabs");
  // both introduction questions answered wrong → the next call is a phase repeat
  for (let i = 0; i < 2; i++) {
    const q = await nextQuestion(request, p);
    const meta = metaOf(q);
    expect(meta.rank).toBe(0);
    expect((await (await answer(request, p, q.question_instance_id, wrongFor(meta.row))).json()).status).toBe("incorrect");
  }
  const beforeRace = await progressOf(request, p);
  const [a, b] = await Promise.all([gnqRaw(request, p), gnqRaw(request, p)]);
  const statuses = [a.status(), b.status()].sort();
  for (const s of statuses) expect([200, 409], `tab answered ${s}`).toContain(s);
  // the client retries an error once: both tabs end on the same open round
  const qa = a.status() === 200 ? await a.json() : await nextQuestion(request, p);
  const qb = b.status() === 200 ? await b.json() : await nextQuestion(request, p);
  for (const q of [qa, qb]) expect(q.step, "never no_questions in a race").not.toBe("no_questions");
  expect(qa.question_instance_id, "both tabs show the same round").toBe(qb.question_instance_id);
  expect(metaOf(qa).rank, "the repeat stays in the introduction").toBe(0);
  const open = await (await request.get(`${SUPA}/rest/v1/question_instances?select=id,repeat_count&student_id=eq.${p.id}&answered=eq.false`, { headers: svc })).json();
  expect(open, "exactly one open round: the reopened phase repeat (round 2)").toEqual([{ id: qa.question_instance_id, repeat_count: 1 }]);
  const afterRace = await progressOf(request, p);
  expect([afterRace.xp, afterRace.coins], "the race itself pays nothing").toEqual([beforeRace.xp, beforeRace.coins]);
  // Answering the shared round pays the repeat amount ONCE; the second tab's submit of the same round pays nothing.
  const meta = metaOf(qa);
  expect((await (await answer(request, p, qa.question_instance_id, meta.row.content.correct)).json()).status).toBe("correct");
  const paid = await progressOf(request, p);
  expect(paid.xp - afterRace.xp, "a right repeat: 2 XP").toBe(2);
  expect((await answer(request, p, qb.question_instance_id, meta.row.content.correct)).status()).toBe(200);
  expect((await progressOf(request, p)).xp, "the other tab's submit of the same round pays nothing").toBe(paid.xp);
});

test("backend 4: all answers wrong — at most 1 + 2 attempts per question, the pupil always moves on, never no_questions", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "backend path: once per run");
  test.slow();
  const p = await makePupil(request, "allwrong");
  const tries = new Map();
  const ranks = [];
  const start = await progressOf(request, p);
  // 7 questions × 3 attempts = 21 rounds complete the course; after that the existing generic repeat begins.
  for (let step = 0; step < 21; step++) {
    const q = await nextQuestion(request, p);
    expect(q.step, `no_questions after ${step} rounds`).not.toBe("no_questions");
    const meta = metaOf(q);
    const k = (tries.get(meta.label) ?? 0) + 1; tries.set(meta.label, k);
    ranks.push(meta.rank);
    const res = await answer(request, p, q.question_instance_id, wrongFor(meta.row));
    expect((await res.json()).status).toBe("incorrect");
  }
  expect(nonDecreasing(ranks), `phases never step back: ${ranks.join("")}`).toBe(true);
  expect([...tries.keys()].sort(), "all seven met").toEqual(["S1", "S2", "S3", "S4", "S5", "S6", "S7"]);
  for (const [label, k] of tries) expect(k, `${label}: 1 + ${MAX_REPEATS} attempts`).toBe(1 + MAX_REPEATS);
  const end = await progressOf(request, p);
  expect([end.xp - start.xp, end.coins - start.coins], "wrong answers pay nothing").toEqual([0, 0]);
  // The course is complete: the summary with the pupil's actual figures, never the generic repeat on its own.
  const done = await nextQuestion(request, p);
  expect(done.step, "after the course: the summary").toBe("course_complete");
  expect([done.summary.total, done.summary.completed, done.summary.first_try_correct, done.summary.correct_after_repetition, done.summary.needs_support]).toEqual([7, 7, 0, 0, 7]);
  expect(done.summary.items.map((i) => i.skill).sort(), "every task is named by its topic").toEqual([...SKILLS].sort());
  expect(done.choices.practice, "there is something to practise").toBe(true);
  expect(done.acknowledged).toBe(false);
  for (const k of ["correct", "accepted_answers", "review_text", "options"]) expect(keysDeep(done).has(k), `summary carries ${k}`).toBe(false);
  const completedAt = async () => (await (await request.get(`${SUPA}/rest/v1/course_enrolments?select=completed_at,summary_acknowledged_at&student_id=eq.${p.id}`, { headers: svc })).json())[0];
  const first = await completedAt();
  expect(first.completed_at, "the first completion is recorded").toBeTruthy();

  // "Øv det, jeg er usikker på": one wrong answer is reopened (a tagged repeat round); a right answer pays the repeat
  // amount; then the UPDATED summary — never a right answer reopened, never a new completion.
  const practice = await nextQuestion(request, p, { course: OBJECTIVE, course_action: "practice" });
  expect(practice.course_id, "practice serves a course round").toBe(OBJECTIVE);
  expect(practice.round_no > 1, "a repeat round").toBe(true);
  const before = await progressOf(request, p);
  expect((await (await answer(request, p, practice.question_instance_id, metaOf(practice).row.content.correct)).json()).status).toBe("correct");
  expect((await progressOf(request, p)).xp - before.xp, "a right repeat: 2 XP").toBe(2);
  const updated = await nextQuestion(request, p);
  expect(updated.step).toBe("course_complete");
  expect([updated.summary.completed, updated.summary.correct_after_repetition, updated.summary.needs_support]).toEqual([7, 1, 6]);
  expect((await completedAt()).completed_at, "practice never moves the completion").toBe(first.completed_at);

  // "Fortsæt med historie" / "Gå til hub": acknowledged once; from then on the course answers acknowledged: true, so
  // the client never shows the summary on its own again (no loop).
  const ack = await request.post(`${SUPA}/rest/v1/rpc/acknowledge_course_summary`, { headers: { ...asPupil(p), ...json }, data: { p_course_id: OBJECTIVE } });
  expect(await ack.json()).toBe(true);
  const seen = await nextQuestion(request, p);
  expect([seen.step, seen.acknowledged]).toEqual(["course_complete", true]);
  const regular = await nextQuestion(request, p, { keep_course_rounds: true });
  expect(regular.step === "no_questions" || !BY_QUESTION.has(regular?.content?.question), "regular history after the course").toBe(true);
});

async function login(page, p) {
  await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", p.email);
  await page.fill("#password", p.password);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${BASE}/hub.html`, { timeout: 20000 });
}

test("browser: the quiz shows each of the seven stimuli and the pupil answers all seven (MC by click, numbers by typing)", async ({ page, request }, testInfo) => {
  test.slow();
  // Evidence on failure (CI has no trace viewer at hand): the page's URL, console errors and failed requests are
  // attached to the JSON report.
  const evidence = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") evidence.push(`console.${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on("pageerror", (e) => evidence.push(`pageerror: ${String(e?.message ?? e).slice(0, 300)}`));
  page.on("requestfailed", (r) => evidence.push(`requestfailed: ${r.method()} ${r.url().slice(0, 200)} — ${r.failure()?.errorText ?? "?"}`));
  page.on("response", (r) => { if (r.status() >= 400) evidence.push(`http ${r.status()}: ${r.request().method()} ${r.url().slice(0, 200)}`); });
  browserEvidence = () => [`url: ${page.url()}`, ...evidence].join("\n");
  const p = await makePupil(request, `ui-${testInfo.project.name}`);
  await login(page, p);
  const isGnq = (r) => r.url().startsWith(`${SUPA}/functions/v1/get-next-question`) && r.request().method() === "POST";
  await page.goto(`${BASE}/index.html`);
  await expect(page.locator("#identity-overlay"), "no identity prompt for a pupil who has chosen").toBeHidden();
  // The enrolled pupil chooses the course (the offer appears before any question is fetched).
  await expect(page.locator("#course-offer")).toBeVisible({ timeout: 20000 });
  let pending = page.waitForResponse(isGnq, { timeout: 30000 });
  await page.locator("#course-start-btn").click();
  const seen = [];
  let sourceHasPlayer = null;
  let imageHasPlayer = null;
  for (let i = 0; i < 7; i++) {
    const r = await pending;
    expect(r.status()).toBe(200);
    const meta = metaOf(await r.json());
    seen.push(meta.label);
    await expect(page.locator('#question[data-state="ready"]')).toBeVisible({ timeout: 20000 });
    const st = meta.row.content.stimulus;
    const fig = page.locator(`#stimulus figure.stimulus-kind-${st.kind}`);
    await expect(fig).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#stimulus figure")).toHaveCount(1);
    if (st.kind === "image") {
      await expect(fig.locator("img.stimulus-image")).toHaveAttribute("alt", st.alt);
      const desc = fig.locator("details.stimulus-image-description");
      await desc.locator("summary").click();
      await expect(desc.locator("#stimulus-image-text")).toContainText(st.alt.slice(0, 40));
      if (imageHasPlayer === null) imageHasPlayer = (await desc.locator(".read-aloud-player").count()) > 0;
    } else {
      await expect(fig.locator("blockquote")).toContainText(st.text.split("\n")[0]);
      if (sourceHasPlayer === null) sourceHasPlayer = (await fig.locator(".read-aloud-player").count()) > 0;
    }
    await expect(page.locator("#question")).toContainText(meta.row.content.question);
    pending = page.waitForResponse(isGnq, { timeout: 30000 });
    if (meta.row.answer_format === "number") {
      await page.locator("#number-answer-input").fill(String(meta.row.content.correct));
      await page.locator("#number-answer-input").press("Enter");
    } else {
      await page.locator("#options button", { hasText: meta.row.content.correct }).first().click();
    }
    await expect(page.locator("#feedback")).toHaveText("Ja! 🎯");
  }
  // After the seventh answer (owner decision 2026-11-15): app.js fetches again after 600 ms (`pending` was created
  // before the click, so the call cannot be missed); the course is complete → course_complete with the pupil's real
  // figures, and the summary replaces the question. No S1 repeat.
  const after = await pending;
  expect(after.status(), "the fetch after the seventh answer").toBe(200);
  const afterBody = await after.json();
  console.log(`F07 browser (${testInfo.project.name}) after the course: ${JSON.stringify({ step: afterBody?.step ?? null, summary: afterBody?.summary ? { ...afterBody.summary, items: afterBody.summary.items?.length } : null, acknowledged: afterBody?.acknowledged ?? null })}`);
  expect(afterBody.step).toBe("course_complete");
  expect([afterBody.summary.completed, afterBody.summary.first_try_correct, afterBody.summary.needs_support]).toEqual([7, 7, 0]);
  await expect(page.locator("#course-summary")).toBeVisible({ timeout: 20000 });
  await expect(page.locator("#course-summary-title")).toHaveText("Du har gennemført forløbet om Grundloven af 1849!");
  await expect(page.locator("#course-summary-completed")).toHaveText("Du har svaret på 7 af 7 opgaver.");
  await expect(page.locator("#course-summary-first-try")).toHaveText("Rigtigt første gang: 7");
  for (const skill of SKILLS) await expect(page.locator("#course-summary-items"), `topic shown: ${skill}`).toContainText(skill);
  await expect(page.locator("#course-practice-btn"), "nothing to practise → no practice button").toHaveCount(0);
  // "Fortsæt med historie": the summary is acknowledged, and the next question is REGULAR history.
  const regular = page.waitForResponse(isGnq, { timeout: 30000 });
  await page.locator("#course-continue-btn").click();
  const reg = await (await regular).json();
  expect(reg?.content?.question, "regular history after the course").toBe(REGULAR_CONTENT.question);
  expect(reg.course_id, "not a course question").toBeUndefined();
  await expect(page.locator("#question")).toContainText(REGULAR_CONTENT.question);
  await expect(page.locator("#course-repeat-badge")).toHaveCount(0);
  // A reload shows neither the offer nor the summary again.
  await page.reload();
  await expect(page.locator("#question")).toContainText(REGULAR_CONTENT.question, { timeout: 20000 });
  await expect(page.locator("#course-offer")).toHaveCount(0);
  await expect(page.locator("#course-summary")).toHaveCount(0);
  console.log(`F07 browser (${testInfo.project.name}): ${seen.join(" ")}; read-aloud control — source: ${sourceHasPlayer}, image description: ${imageHasPlayer}`);
  expect(new Set(seen).size, `all seven met: ${seen.join(" ")}`).toBe(7);
  expect(seen[0]).toBe("S1");
  expect(nonDecreasing(seen.map((l) => BY_QUESTION.get(PILOT[Number(l.slice(1)) - 1].content.question).rank)), `phase order: ${seen.join(" ")}`).toBe(true);
  // Read-aloud: the image description gets the same control as the source text (same adapter). Whether a voice exists
  // in this browser is the environment's business — but where the source has a control, the description must too.
  if (sourceHasPlayer) expect(imageHasPlayer, "the image description is readable aloud wherever the source text is").toBe(true);
});
