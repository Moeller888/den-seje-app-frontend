// Lærligverse L5 + L3 END TO END on the real isolated stack (D-110): served_mode, the server's hint log
// (request-hint) and the atomic attempt context (process-event → process_*_with_context → K1's _v2).
//
// Runs only where the stack HAS the schema: L1 K1 (20261103110000) AND migration 20261108043500 (served_mode +
// question_hint_requests). On this experiment branch that is the K1 lane (replay profile k1), where the workflow
// also turns on LAERLIGVERSE_SERVED_MODE, LAERLIGVERSE_ATTEMPT_CONTEXT and LAERLIGVERSE_HINTS. Everywhere else
// (the production mirror) the probe finds no such schema and every test is SKIPPED with that reason — never
// marked expected-to-fail.
//
// The items are the reviewed source-criticism items (fixtures/kildekritik-questions.json) with the
// teacher-approved hints (#656) in content.hints, under the TEST objective test_kildekritik_ophav. The database is
// the oracle: every claim is checked in question_instances / question_hint_requests / question_attempts.
import { test, expect } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { assertIsolated, SYNTHETIC_EMAIL_DOMAIN } from "./isolation-guard.mjs";
import { k1InStack } from "./k1-probe.mjs";
import { assessObjectives, observationFromAttemptRow } from "../../laerligverse/host/bridge/evidence.js";

assertIsolated(process.env);

const SUPA = process.env.ISOLATED_SUPABASE_URL.replace(/\/+$/, "");
const ANON = process.env.ISOLATED_SUPABASE_ANON_KEY;
const SERVICE = process.env.ISOLATED_SUPABASE_SERVICE_KEY;
const RUN = (process.env.GITHUB_RUN_ID || "local") + "-" + (process.env.GITHUB_RUN_ATTEMPT || "1");
const svc = { apikey: SERVICE, authorization: `Bearer ${SERVICE}` };
const json = { "content-type": "application/json" };
const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/kildekritik-questions.json", import.meta.url), "utf8"));
const OBJECTIVE = FIXTURE[0].learning_objective;
const ITEM = Object.fromEntries(FIXTURE.map((r) => [r.learning_step, r]));

/** L3/L5 present? true only when served_mode AND the hint log answer; a missing object is false; anything else fails loud. */
async function l35InStack(request) {
  const probe = async (path) => {
    const r = await request.get(`${SUPA}/rest/v1/${path}`, { headers: svc });
    if (r.status() === 200) return true;
    const body = await r.text();
    if ([400, 404].includes(r.status()) && /served_mode|question_hint_requests|42703|42P01|PGRST20[0-9]|does not exist|schema cache/.test(body)) return false;
    throw new Error(`L3/L5 probe ${path}: unexpected ${r.status()} ${body.slice(0, 200)}`);
  };
  return (await probe("question_instances?select=served_mode&limit=0")) && (await probe("question_hint_requests?select=id&limit=0"));
}

test.describe.configure({ mode: "serial" });

let READY = false;
let WHY = "";
test.beforeAll(async ({ request }) => {
  const k1 = await k1InStack(request, SUPA, { apikey: SERVICE, authorization: `Bearer ${SERVICE}` });
  const l35 = k1 ? await l35InStack(request) : false;
  READY = k1 && l35;
  WHY = !k1 ? "L1 K1 is not in this isolated stack (production mirror)" : !l35 ? "migration 20261108043500 (served_mode, hint log) is not in this stack" : "";
  if (!READY) return;
  const have = await (await request.get(`${SUPA}/rest/v1/questions?select=id&learning_objective=eq.${OBJECTIVE}`, { headers: svc })).json();
  if (have.length === 0) {
    const rows = FIXTURE.map((r) => ({
      type: "mc_single", content: r.content, difficulty: 500, is_active: true, question_type: "auto",
      learning_objective: r.learning_objective, answer_format: "mc", answer_type: "short",
      metadata: { domain: r.learning_objective, concepts: ["kildekritik"], cognitive_skill: "analysis", synthetic: true, fixture: "D-332", learning_step: r.learning_step },
      target_grade: 8, difficulty_band: 3,
    }));
    const ins = await request.post(`${SUPA}/rest/v1/questions`, { headers: { ...svc, ...json, prefer: "return=minimal" }, data: rows });
    expect(ins.status(), await ins.text()).toBe(201);
  }
});
test.beforeEach(({}, testInfo) => {
  test.skip(!READY, WHY);
  test.skip(testInfo.project.name !== "chromium", "backend path: once per run");
});

async function makePupil(request, label, { course = true } = {}) {
  const tag = `${label}-${RUN}`.replace(/[^A-Za-z0-9-]/g, "");
  const email = `l35-${tag}@${SYNTHETIC_EMAIL_DOMAIN}`;
  const password = createHash("sha256").update(`isolated-l35:${tag}`).digest("base64url");
  const created = await request.post(`${SUPA}/auth/v1/admin/users`, { headers: svc, data: { email, password, email_confirm: true } });
  expect(created.status()).toBe(200);
  const id = (await created.json()).id;
  const profile = await request.post(`${SUPA}/rest/v1/profiles`, {
    headers: { ...svc, ...json, prefer: "return=minimal" },
    data: { id, role: "student", full_name: `Syntetisk L3/L5-elev ${label}`, selected_grade: course ? 8 : 7,
      ...(course ? { active_domains: [OBJECTIVE] } : {}), equipped_slots: {}, active_theme: "default" },
  });
  expect(profile.status(), await profile.text()).toBe(201);
  const r = await request.post(`${SUPA}/auth/v1/token?grant_type=password`, { headers: { apikey: ANON }, data: { email, password } });
  expect(r.status()).toBe(200);
  return { id, token: (await r.json()).access_token };
}
const as = (p) => ({ apikey: ANON, authorization: `Bearer ${p.token}`, ...json });
const next = async (request, p) => {
  const r = await request.post(`${SUPA}/functions/v1/get-next-question`, { headers: as(p), data: { subject: "historie", learning_objective: OBJECTIVE, sequence: true } });
  expect(r.status(), await r.text()).toBe(200);
  return await r.json();
};
const hint = (request, p, served, level, requestId = randomUUID()) => request.post(`${SUPA}/functions/v1/request-hint`, {
  headers: as(p), data: { question_instance_id: served.question_instance_id, round_no: served.round_no, level, request_id: requestId },
});
const answer = (request, p, served, text, submissionId = randomUUID(), extra = {}) => request.post(`${SUPA}/functions/v1/process-event`, {
  headers: as(p), data: { question_instance_id: served.question_instance_id, answer: text, question_shown_at: Date.now(), round_no: served.round_no, submission_id: submissionId, ...extra },
});
const servedModeOf = async (request, id) => (await (await request.get(`${SUPA}/rest/v1/question_instances?select=served_mode&id=eq.${id}`, { headers: svc })).json())[0]?.served_mode;
const loggedLevels = async (request, id) => (await (await request.get(`${SUPA}/rest/v1/question_hint_requests?select=hint_level,request_id&question_instance_id=eq.${id}&order=hint_level`, { headers: svc })).json());
const attemptsOf = async (request, p) => await (await request.get(`${SUPA}/rest/v1/question_attempts?select=question_instance_id,submission_id,attempt_no,grading,was_correct,is_repeat,answered_at,mode,hints_used,xp_awarded,coins_awarded,status&student_id=eq.${p.id}&order=created_at`, { headers: svc })).json();
const progress = async (request, p) => (await (await request.get(`${SUPA}/rest/v1/student_progress?select=xp,coins&student_id=eq.${p.id}`, { headers: svc })).json())[0] ?? { xp: 0, coins: 0 };
const FORGED = { mode: "check", served_mode: "application", hints_used: 0, hints: 0, p_mode: "review", p_hints_used: 0 };

test("practice step: served_mode = practice; hints 1 then 2 with the fixture text, a retry counts once; the attempt records mode and hints from the SERVER, a replay is identical, a later hint is refused", async ({ request }) => {
  const p = await makePupil(request, "practice");
  const s = await next(request, p);
  expect(s).toMatchObject({ learning_step: "guided_practice", mode: "practice", hints_available: ITEM.guided_practice.content.hints.length });
  expect("hints" in s.content, "hint texts never reach the client with the task").toBe(false);
  expect(await servedModeOf(request, s.question_instance_id)).toBe("practice");

  const rid = randomUUID();
  const h1 = await hint(request, p, s, 1, rid);
  expect(h1.status(), await h1.text()).toBe(200);
  expect(await h1.json()).toMatchObject({ outcome: "recorded", level: 1, text: ITEM.guided_practice.content.hints[0].trim(), hints_remaining: 2 });
  const again = await hint(request, p, s, 1, rid);
  expect(await again.json()).toMatchObject({ outcome: "replay", level: 1, text: ITEM.guided_practice.content.hints[0].trim() });
  const h2 = await hint(request, p, s, 2);
  expect(await h2.json()).toMatchObject({ outcome: "recorded", level: 2, text: ITEM.guided_practice.content.hints[1].trim(), hints_remaining: 1 });
  expect((await loggedLevels(request, s.question_instance_id)).map((r) => r.hint_level)).toEqual([1, 2]);

  const sub = randomUUID();
  const a = await answer(request, p, s, ITEM.guided_practice.content.correct, sub, FORGED);
  expect(a.status(), await a.text()).toBe(200);
  const first = await a.json();
  expect(first).toMatchObject({ outcome: "recorded", status: "correct", xp_awarded: 10, coins_awarded: 5 });
  const rows = await attemptsOf(request, p);
  expect(rows).toEqual([expect.objectContaining({ question_instance_id: s.question_instance_id, mode: "practice", hints_used: 2, was_correct: true })]);

  const replay = await answer(request, p, s, ITEM.guided_practice.content.correct, sub);
  expect(replay.status()).toBe(200);
  expect({ ...(await replay.json()), outcome: "recorded" }).toEqual(first);
  expect(await attemptsOf(request, p)).toEqual(rows);

  const late = await hint(request, p, s, 3);
  expect(late.status()).toBe(409);
  expect(await late.json()).toMatchObject({ outcome: "round_closed" });
  expect(await attemptsOf(request, p)).toEqual(rows);
  expect((await loggedLevels(request, s.question_instance_id)).length).toBe(2);

  // The next step is an assessment step: no hints there, and an unhinted correct answer is recorded as check / 0.
  const c = await next(request, p);
  expect(c).toMatchObject({ learning_step: "independent_application", mode: "check", hints_available: 0 });
  expect(await servedModeOf(request, c.question_instance_id)).toBe("check");
  const none = await hint(request, p, c, 1);
  expect(none.status()).toBe(409);
  expect(await none.json()).toMatchObject({ outcome: "hint_unavailable", hints_available: 0 });
  expect((await (await answer(request, p, c, ITEM.independent_application.content.correct)).json()).outcome).toBe("recorded");
  const all = await attemptsOf(request, p);
  expect(all.map(({ mode, hints_used, was_correct }) => ({ mode, hints_used, was_correct })))
    .toEqual([{ mode: "practice", hints_used: 2, was_correct: true }, { mode: "check", hints_used: 0, was_correct: true }]);

  // The teacher-facing classification (learning-bridge evidence.ts) over these server rows.
  const subOf = (id) => all.find((r) => r.question_instance_id === id).submission_id;
  const [assessment] = assessObjectives(all.map((r) => observationFromAttemptRow({ ...r, learning_objective: OBJECTIVE })));
  expect(assessment.states.supported.status, "the hinted correct practice answer is practice WITH help").toBe("observed");
  expect(assessment.states.supported.basis).toContain(subOf(s.question_instance_id));
  expect(assessment.states.independent.status, "the unhinted correct check answer is shown independently").toBe("observed");
  expect(assessment.states.independent.basis).toContain(subOf(c.question_instance_id));
  expect(assessment.states.independent.basis, "the hinted practice answer is NOT independent").not.toContain(subOf(s.question_instance_id));
});

test("revision step (two hints): levels are sequential, and level 3 is hint_unavailable — nothing logged for it", async ({ request }) => {
  const p = await makePupil(request, "revision");
  const g = await next(request, p);
  expect((await (await answer(request, p, g, ITEM.guided_practice.content.options.find((o) => o !== ITEM.guided_practice.content.correct))).json()).status).toBe("incorrect");
  const r = await next(request, p);
  expect(r).toMatchObject({ learning_step: "revision", mode: "practice", hints_available: 2 });
  const skip = await hint(request, p, r, 2);
  expect(skip.status()).toBe(400);
  expect(await skip.json()).toMatchObject({ outcome: "invalid_request", reason: "level_out_of_order" });
  expect((await (await hint(request, p, r, 1)).json()).text).toBe(ITEM.revision.content.hints[0].trim());
  expect((await (await hint(request, p, r, 2)).json()).text).toBe(ITEM.revision.content.hints[1].trim());
  const three = await hint(request, p, r, 3);
  expect(three.status()).toBe(409);
  expect(await three.json()).toMatchObject({ outcome: "hint_unavailable", hints_available: 2 });
  expect((await loggedLevels(request, r.question_instance_id)).map((x) => x.hint_level)).toEqual([1, 2]);
  expect((await (await answer(request, p, r, ITEM.revision.content.correct)).json()).outcome).toBe("recorded");
  expect((await attemptsOf(request, p)).map((a) => [a.mode, a.hints_used])).toEqual([["practice", 0], ["practice", 2]]);
});

test("parallel hint + answer (Promise.all): exactly one attempt, and its hints_used equals the levels logged", async ({ request }) => {
  for (let i = 0; i < 3; i++) {
    const p = await makePupil(request, `race${i}`);
    const s = await next(request, p);
    const [h, a] = await Promise.all([hint(request, p, s, 1), answer(request, p, s, ITEM.guided_practice.content.correct)]);
    expect([200, 409]).toContain(h.status());
    expect((await a.json()).outcome).toBe("recorded");
    const rows = await attemptsOf(request, p);
    expect(rows).toHaveLength(1);
    expect(rows[0].hints_used, "logged levels = counted levels").toBe((await loggedLevels(request, s.question_instance_id)).length);
  }
});

test("a pupil cannot write served_mode, the attempts or the hint log with their own JWT, nor ask for a hint on another pupil's instance", async ({ request }) => {
  const p = await makePupil(request, "attacker");
  const other = await makePupil(request, "victim");
  const mine = await next(request, p);
  const theirs = await next(request, other);
  const refused = (r) => [401, 403].includes(r.status());
  const patchMode = await request.patch(`${SUPA}/rest/v1/question_instances?id=eq.${mine.question_instance_id}`, { headers: { ...as(p), prefer: "return=representation" }, data: { served_mode: "check" } });
  expect(refused(patchMode) || (patchMode.status() === 200 && (await patchMode.json()).length === 0), `served_mode PATCH: ${patchMode.status()}`).toBe(true);
  expect(await servedModeOf(request, mine.question_instance_id)).toBe("practice");
  const patchOther = await request.patch(`${SUPA}/rest/v1/question_instances?id=eq.${theirs.question_instance_id}`, { headers: { ...as(p), prefer: "return=representation" }, data: { next_review_at: new Date().toISOString() } });
  expect(refused(patchOther) || (patchOther.status() === 200 && (await patchOther.json()).length === 0), `other pupil's instance: ${patchOther.status()}`).toBe(true);
  for (const [method, path, data] of [
    ["post", "question_hint_requests", { student_id: p.id, question_instance_id: mine.question_instance_id, round_no: 1, hint_level: 1, request_id: randomUUID() }],
    ["get", "question_hint_requests?select=*", undefined],
    ["patch", `question_attempts?student_id=eq.${p.id}`, { hints_used: 0 }],
    ["post", "rpc/request_question_hint", { p_student_id: p.id, p_question_instance_id: mine.question_instance_id, p_round_no: 1, p_level: 1, p_request_id: randomUUID() }],
    ["post", "rpc/process_question_attempt_with_context", { p_student_id: p.id, p_question_instance_id: mine.question_instance_id, p_answer: "x", p_round_no: 1, p_submission_id: randomUUID(), p_review_text: null, p_misconception_type: null }],
  ]) {
    const r = await request[method](`${SUPA}/rest/v1/${path}`, { headers: as(p), ...(data ? { data } : {}) });
    expect(refused(r) || (path.startsWith("rpc/") && r.status() === 404), `${method} ${path}: ${r.status()} ${await r.text()}`).toBe(true);
  }
  const foreign = await hint(request, p, theirs, 1);
  expect(foreign.status()).toBe(404);
  expect(await foreign.json()).toMatchObject({ outcome: "not_found" });
  expect(await loggedLevels(request, theirs.question_instance_id)).toEqual([]);
  expect(await loggedLevels(request, mine.question_instance_id)).toEqual([]);
});

test("an ordinary (non-course) quiz answer still records quiz_v1 / 0 hints and pays exactly as before: 10 XP + 5 coins", async ({ request }) => {
  const p = await makePupil(request, "quiz", { course: false });
  const before = await progress(request, p);
  const r = await request.post(`${SUPA}/functions/v1/get-next-question`, { headers: as(p), data: { subject: "historie" } });
  expect(r.status(), await r.text()).toBe(200);
  const s = await r.json();
  expect(s.question_instance_id, JSON.stringify(s)).toBeTruthy();
  expect("learning_step" in s || "hints_available" in s, "an ordinary quiz reply is unchanged").toBe(false);
  expect(await servedModeOf(request, s.question_instance_id)).toBe(null);
  const key = (await (await request.get(`${SUPA}/rest/v1/question_instances?select=correct_answer&id=eq.${s.question_instance_id}`, { headers: svc })).json())[0].correct_answer;
  const a = await answer(request, p, s, key, randomUUID(), FORGED);
  expect(a.status(), await a.text()).toBe(200);
  expect(await a.json()).toMatchObject({ outcome: "recorded", status: "correct", xp_awarded: 10, coins_awarded: 5 });
  expect((await attemptsOf(request, p)).map(({ mode, hints_used, xp_awarded, coins_awarded }) => ({ mode, hints_used, xp_awarded, coins_awarded })))
    .toEqual([{ mode: "quiz_v1", hints_used: 0, xp_awarded: 10, coins_awarded: 5 }]);
  expect(await progress(request, p)).toEqual({ xp: before.xp + 10, coins: before.coins + 5 });
});
