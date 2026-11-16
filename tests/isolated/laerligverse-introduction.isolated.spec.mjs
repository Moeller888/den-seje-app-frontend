// PR #664 (owner GO 2026-11-15): the INTRODUCTION CHAIN on the REAL backend of the isolated stack (D-110) — local Auth,
// this commit's Edge Functions (get-next-question, introduction-progress, process-event) and PostgreSQL with the
// replay profile "introduction" (K1 → L3/L5 → K9 → introductions, none applied in production). The workflow serves
// the functions with LAERLIGVERSE_INTRODUCTION=on and LAERLIGVERSE_PRESENTED=on in that lane ONLY.
//
// RUNS ONLY in the introduction lane (REPLAY_PROFILE=introduction, chromium); everywhere else it is skipped with that
// reason — and in that lane tests/isolated/require-complete-run.mjs fails the job if a single test did not run.
//
// The DATABASE is the oracle, never the screen: every step reads introduction_rounds, question_instances,
// question_attempts and student_progress directly with the service key.
//
// THREE FACTS KEPT APART: "shown" (introduction_rounds.presented_at) ≠ "worked" (a question_attempts row) ≠
// "mastered" (what the approved rules derive from answers). The introduction pays nothing and is not evidence.
//
// HONEST LIMIT: the Lærligverse host and game have no SERVER introduction view yet (the archive prototype shows its own
// local intro cards; the bridge has no introduction message). So this is a BROWSER-BASED INTEGRATION / API TEST: the
// pupil signs in through the real login page in the browser, and the test then makes the requests a host will make, over
// HTTP with that sign-in's own session token. It does not test what the pupil sees. Rendering a server introduction
// inside the host is a separate frontend step (F11-B: laerligverse-intro-visible.isolated.spec.mjs). Calls made with
// fetch from inside the login page failed in this lane with "Failed to fetch" (runs 43709089926 and 43711249866).
// F11-A (run 43878328954) established the cause: the TEST's documents — a route.fulfill() stub without a network
// address, then route.abort()'s Chromium error page — tripped Chromium's Local Network Access; not the product.
import { test, expect } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { assertIsolated, SYNTHETIC_EMAIL_DOMAIN } from "./isolation-guard.mjs";

assertIsolated(process.env);

const LANE = process.env.REPLAY_PROFILE === "introduction";
const BASE = process.env.ISOLATED_BASE_URL.replace(/\/+$/, "");
const SUPA = process.env.ISOLATED_SUPABASE_URL.replace(/\/+$/, "");
const ANON = process.env.ISOLATED_SUPABASE_ANON_KEY;
const SERVICE = process.env.ISOLATED_SUPABASE_SERVICE_KEY;
const RUN = (process.env.GITHUB_RUN_ID || "local") + "-" + (process.env.GITHUB_RUN_ATTEMPT || "1");
const svc = { apikey: SERVICE, authorization: `Bearer ${SERVICE}` };
const json = { "content-type": "application/json" };
const INTRO = JSON.parse(readFileSync(new URL("./fixtures/kildekritik-introduction.json", import.meta.url), "utf8"));
const ITEMS = JSON.parse(readFileSync(new URL("./fixtures/kildekritik-questions.json", import.meta.url), "utf8"));
// A SEPARATE test objective: the other isolated specs use the fixture's objective in a sequence and must never meet
// an introduction there. The content is the approved fixture verbatim.
const OBJECTIVE = `${INTRO.learning_objective}_intro_e2e`;
// The reviewed guided-practice item, under this objective. questions has a unique index on the question text, and
// the fixture's own row exists under the fixture's objective, so this copy carries a visibly marked test text.
const SOURCE = ITEMS.find((r) => r.learning_step === "guided_practice");
const PRACTICE = { ...SOURCE, content: { ...SOURCE.content, question: `${SOURCE.content.question} (introduktionsforløb, testkopi)` } };

test.describe.configure({ mode: "serial" });
test.beforeEach(({}, testInfo) => {
  test.skip(!LANE, "runs only in the isolated introduction lane (REPLAY_PROFILE=introduction); require-complete-run.mjs fails that lane if it does not run");
  test.skip(testInfo.project.name !== "chromium", "backend chain: once per run");
});

test.beforeAll(async ({ request }) => {
  if (!LANE) return;
  // Fail loud if the lane lacks the schema it claims (the workflow checks it too).
  for (const table of ["introduction_rounds", "learning_introductions", "question_hint_requests"]) {
    const r = await request.get(`${SUPA}/rest/v1/${table}?select=*&limit=0`, { headers: svc });
    expect(r.status(), `${table} must exist in the introduction lane: ${await r.text()}`).toBe(200);
  }
  const k9 = await request.get(`${SUPA}/rest/v1/question_instances?select=presented_at&limit=0`, { headers: svc });
  expect(k9.status(), "K9's presented_at must exist").toBe(200);
  const have = await (await request.get(`${SUPA}/rest/v1/learning_introductions?select=id&learning_objective=eq.${OBJECTIVE}`, { headers: svc })).json();
  if (have.length === 0) {
    const ins = await request.post(`${SUPA}/rest/v1/learning_introductions`, {
      headers: { ...svc, ...json, prefer: "return=minimal" }, data: { learning_objective: OBJECTIVE, content: INTRO.content },
    });
    expect(ins.status(), await ins.text()).toBe(201);
  }
  const q = await (await request.get(`${SUPA}/rest/v1/questions?select=id&learning_objective=eq.${OBJECTIVE}`, { headers: svc })).json();
  if (q.length === 0) {
    const ins = await request.post(`${SUPA}/rest/v1/questions`, {
      headers: { ...svc, ...json, prefer: "return=minimal" },
      data: [{
        type: "mc_single", content: PRACTICE.content, difficulty: 500, is_active: true, question_type: "auto",
        learning_objective: OBJECTIVE, answer_format: "mc", answer_type: "short",
        metadata: { domain: OBJECTIVE, concepts: ["kildekritik"], cognitive_skill: "analysis", synthetic: true, fixture: "PR-664", learning_step: "guided_practice" },
        target_grade: 8, difficulty_band: 3,
      }],
    });
    expect(ins.status(), await ins.text()).toBe(201);
  }
});

async function makePupil(request, label) {
  const tag = `${label}-${RUN}`.replace(/[^A-Za-z0-9-]/g, "");
  const email = `intro-${tag}@${SYNTHETIC_EMAIL_DOMAIN}`;
  const password = createHash("sha256").update(`isolated-intro:${tag}`).digest("base64url");
  const created = await request.post(`${SUPA}/auth/v1/admin/users`, { headers: svc, data: { email, password, email_confirm: true } });
  expect(created.status()).toBe(200);
  const id = (await created.json()).id;
  const profile = await request.post(`${SUPA}/rest/v1/profiles`, {
    headers: { ...svc, ...json, prefer: "return=minimal" },
    data: { id, role: "student", full_name: `Syntetisk introduktionselev ${label}`, selected_grade: 8, active_domains: [OBJECTIVE], equipped_slots: {}, active_theme: "default" },
  });
  expect(profile.status(), await profile.text()).toBe(201);
  // A known, non-default progression state, so "unchanged" is a real comparison.
  const progress = await request.post(`${SUPA}/rest/v1/student_progress`, {
    headers: { ...svc, ...json, prefer: "resolution=merge-duplicates,return=minimal" },
    data: { student_id: id, xp: 100, coins: 50, mastery_level: 3, current_streak: 2, longest_streak: 5 },
  });
  expect(progress.status(), await progress.text()).toBeLessThan(300);
  return { id, email, password };
}
async function signIn(request, p) {
  const r = await request.post(`${SUPA}/auth/v1/token?grant_type=password`, { headers: { apikey: ANON }, data: { email: p.email, password: p.password } });
  expect(r.status()).toBe(200);
  return (await r.json()).access_token;
}
/** Sign in through the REAL login page; the page after login is not loaded (no app code runs for this pupil). */
async function browserSignIn(page, p) {
  // The navigation login.js starts after sign-in is ABORTED, so the pupil stays on the real login.html of the local
  // build (served from 127.0.0.1). A page fulfilled by the test instead has no network address, and Chromium then
  // refuses its requests to the loopback stack (local network access): run 43709089926, "Failed to fetch".
  let redirected;
  const redirect = new Promise((resolve) => { redirected = resolve; });
  await page.route(/\/(hub|index|teacher|admin|reset-password)\.html/, (route) => {
    redirected(route.request().url());
    return route.abort();
  });
  await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
  const auth = page.waitForResponse((r) => r.url().startsWith(`${SUPA}/auth/v1/token`) && r.request().method() === "POST");
  await page.fill("#email", p.email);
  await page.fill("#password", p.password);
  await page.locator("#loginBtn").click();
  const res = await auth;
  expect(res.status(), "sign-in must be answered by the LOCAL Auth").toBe(200);
  const token = (await res.json()).access_token;
  expect(typeof token).toBe("string");
  // login.js sends a pupil to the Hub; that navigation is aborted above, so no app code runs for this pupil.
  expect(await redirect, "a pupil is sent to the Hub").toMatch(/\/hub\.html/);
  expect(new URL(page.url()).pathname).toMatch(/\/login\.html$/);
  return token;
}
const post = async (request, token, fn, body, headers = {}) => {
  const r = await request.post(`${SUPA}/functions/v1/${fn}`, { headers: { apikey: ANON, authorization: `Bearer ${token}`, ...json, ...headers }, data: body });
  return { status: r.status(), body: await r.json().catch(() => null) };
};
const next = (token, extra = {}) => ({ subject: "historie", learning_objective: OBJECTIVE, sequence: true, ...extra });

const rows = async (request, path) => {
  const r = await request.get(`${SUPA}/rest/v1/${path}`, { headers: svc });
  const text = await r.text();
  expect(r.status(), `${path}: ${text}`).toBe(200);
  return JSON.parse(text);
};
const rounds = (request, p) => rows(request, `introduction_rounds?select=id,introduction_id,served_at,presented_at,presented_request_id,completed_at,completion_request_id&student_id=eq.${p.id}`);
const instances = (request, p) => rows(request, `question_instances?select=id,answered,repeat_count,presented_at&student_id=eq.${p.id}&order=created_at`);
const attempts = (request, p) => rows(request, `question_attempts?select=question_instance_id,attempt_no,status,xp_awarded,coins_awarded,mode&student_id=eq.${p.id}&order=created_at`);
/** Everything a reward, mastery or level could move — read straight from the database. */
async function rewardState(request, p) {
  return {
    progress: await rows(request, `student_progress?select=*&student_id=eq.${p.id}`),
    subject: await rows(request, `student_subject_level?select=*&student_id=eq.${p.id}`),
    folds: await rows(request, `student_level_fold_log?select=*&student_id=eq.${p.id}`),
    attempts: await attempts(request, p),
    events: await rows(request, `student_events?select=*&student_id=eq.${p.id}`),
  };
}

test("the chain: browser sign-in → introduction served → 'shown' registered once (replay, new id) → completed → first guided-practice task; no reward until an answer", async ({ page, request }) => {
  const p = await makePupil(request, "chain");
  const token = await browserSignIn(page, p);
  const start = await rewardState(request, p);
  const unchanged = async (label) => expect(await rewardState(request, p), `${label}: no XP, coins, mastery, level, attempt or event`).toEqual(start);

  // 1. The server serves the introduction (no task exists yet), with the approved content and no answer key.
  const intro = await post(request, token, "get-next-question", next());
  expect(intro.status, JSON.stringify(intro.body)).toBe(200);
  expect(intro.body).toMatchObject({ step: "introduction", learning_objective: OBJECTIVE, learning_step: "introduction" });
  expect(intro.body.content).toEqual(INTRO.content);
  expect(JSON.stringify(intro.body)).not.toMatch(/"(correct|correct_answer|accepted_answers|options|hints|review_text)"/);
  const roundId = intro.body.introduction_round_id;
  let rs = await rounds(request, p);
  expect(rs).toHaveLength(1);
  expect(rs[0]).toMatchObject({ id: roundId, presented_at: null, completed_at: null });
  expect(await instances(request, p), "an introduction is not a task round").toEqual([]);
  await unchanged("served");

  // 2. A refresh, and a pupil who asks straight for the task: the SAME introduction again, still no task.
  const again = await post(request, token, "get-next-question", next({ learning_step: "guided_practice" }));
  expect(again.body).toMatchObject({ step: "introduction", introduction_round_id: roundId });
  expect(await instances(request, p)).toEqual([]);
  expect(await rounds(request, p)).toHaveLength(1);

  // 3. "Shown" is reported and registered once, in server time.
  const rid = randomUUID();
  const shown = await post(request, token, "introduction-progress", { action: "presented", round_id: roundId, request_id: rid });
  expect(shown.status, JSON.stringify(shown.body)).toBe(200);
  expect(shown.body.outcome).toBe("recorded");
  rs = await rounds(request, p);
  expect(rs[0].presented_request_id).toBe(rid);
  const presentedAt = rs[0].presented_at;
  expect(Date.parse(presentedAt)).toBeGreaterThanOrEqual(Date.parse(rs[0].served_at));
  await unchanged("shown");
  // 4. The SAME report again (a retry after a lost reply): the original time; a NEW id: the time never moves.
  const replay = await post(request, token, "introduction-progress", { action: "presented", round_id: roundId, request_id: rid });
  expect(replay).toEqual({ status: 200, body: { outcome: "replay", at: shown.body.at } });
  const otherId = await post(request, token, "introduction-progress", { action: "presented", round_id: roundId, request_id: randomUUID() });
  expect(otherId).toEqual({ status: 200, body: { outcome: "already_recorded", at: shown.body.at } });
  rs = await rounds(request, p);
  expect(rs).toHaveLength(1);
  expect([rs[0].presented_at, rs[0].presented_request_id]).toEqual([presentedAt, rid]);
  // Shown is not completed: the sequence still serves the introduction.
  expect((await post(request, token, "get-next-question", next())).body.step).toBe("introduction");
  await unchanged("shown again");

  // 5. Completed (and its retry): the sequence may move on — still nothing paid.
  const cid = randomUUID();
  const done = await post(request, token, "introduction-progress", { action: "completed", round_id: roundId, request_id: cid });
  expect(done.status).toBe(200);
  expect(done.body.outcome).toBe("recorded");
  expect(await post(request, token, "introduction-progress", { action: "completed", round_id: roundId, request_id: cid }))
    .toEqual({ status: 200, body: { outcome: "replay", at: done.body.at } });
  rs = await rounds(request, p);
  expect(rs[0].completion_request_id).toBe(cid);
  expect(rs[0].presented_at, "completing never moves the 'shown' time").toBe(presentedAt);
  await unchanged("completed");

  // 6. The server's next step: the first guided-practice task, in practice mode.
  const task = await post(request, token, "get-next-question", next());
  expect(task.status, JSON.stringify(task.body)).toBe(200);
  expect(task.body).toMatchObject({ learning_objective: OBJECTIVE, learning_step: "guided_practice", mode: "practice" });
  expect(task.body.content.question).toBe(PRACTICE.content.question);
  const inst = await instances(request, p);
  expect(inst).toHaveLength(1);
  expect(inst[0]).toMatchObject({ id: task.body.question_instance_id, answered: false, presented_at: null });
  await unchanged("first task served");
  // The task's own "shown" (K9) is not an answer either.
  const taskShown = await post(request, token, "introduction-progress", { action: "presented", question_instance_id: task.body.question_instance_id, round_no: task.body.round_no });
  expect(taskShown.status, JSON.stringify(taskShown.body)).toBe(200);
  expect(taskShown.body.outcome).toBe("recorded");
  expect((await instances(request, p))[0].answered).toBe(false);
  await unchanged("task shown");

  // 7. Only the ANSWER moves progression, by the existing rules: correct pays the server's reward, once.
  const sub = randomUUID();
  const answer = { question_instance_id: task.body.question_instance_id, answer: PRACTICE.content.correct, question_shown_at: Date.now(), round_no: task.body.round_no, submission_id: sub };
  const graded = await post(request, token, "process-event", answer);
  expect(graded.status, JSON.stringify(graded.body)).toBe(200);
  expect(graded.body).toMatchObject({ outcome: "recorded", status: "correct" });
  const at = await attempts(request, p);
  expect(at).toHaveLength(1);
  // LAERLIGVERSE_SERVED_MODE is off in this lane (as everywhere), so under K1 process-event records its constant
  // mode "quiz_v1" — the documented behaviour (migration 20261109120000, HINTS); the introduction changes nothing here.
  expect(at[0]).toMatchObject({ attempt_no: 1, status: "correct", mode: "quiz_v1" });
  expect(at[0].xp_awarded).toBeGreaterThan(0);
  const after = (await rows(request, `student_progress?select=xp,coins&student_id=eq.${p.id}`))[0];
  expect(after.xp - start.progress[0].xp).toBe(at[0].xp_awarded);
  expect(after.coins - start.progress[0].coins).toBe(at[0].coins_awarded);
  // A replayed answer (a retried request) pays nothing again; a late introduction report changes nothing.
  expect((await post(request, token, "process-event", answer)).body.outcome).toBe("replay");
  expect((await post(request, token, "introduction-progress", { action: "presented", round_id: roundId, request_id: rid })).body.outcome).toBe("replay");
  expect(await attempts(request, p)).toHaveLength(1);
  expect((await rows(request, `student_progress?select=xp,coins&student_id=eq.${p.id}`))[0]).toEqual(after);
  expect((await rounds(request, p))[0].presented_at).toBe(presentedAt);
});

test("refusals: another pupil, no session, bad or manipulated requests, a wrong method — nothing registered, nothing paid", async ({ request }) => {
  const a = await makePupil(request, "owner");
  const b = await makePupil(request, "intruder");
  const ta = await signIn(request, a);
  const tb = await signIn(request, b);
  const intro = await post(request, ta, "get-next-question", next());
  expect(intro.body.step).toBe("introduction");
  const roundId = intro.body.introduction_round_id;
  const startA = await rewardState(request, a);
  const startB = await rewardState(request, b);

  // Another pupil's round looks exactly like a missing one, for both actions.
  for (const action of ["presented", "completed"]) {
    expect(await post(request, tb, "introduction-progress", { action, round_id: roundId, request_id: randomUUID() }))
      .toEqual({ status: 404, body: { outcome: "not_found", error: "Not found" } });
  }
  expect((await post(request, ta, "introduction-progress", { action: "presented", round_id: randomUUID(), request_id: randomUUID() })).status).toBe(404);
  // No session, a forged token, the anon key as a session: 401.
  expect((await post(request, "", "introduction-progress", { action: "presented", round_id: roundId, request_id: randomUUID() })).status).toBe(401);
  expect((await post(request, "forged.session.token", "introduction-progress", { action: "completed", round_id: roundId, request_id: randomUUID() })).status).toBe(401);
  expect((await post(request, ANON, "introduction-progress", { action: "completed", round_id: roundId, request_id: randomUUID() })).status).toBe(401);
  // Malformed and manipulated bodies: 400, and no client-supplied pupil, time or reward is ever used.
  for (const [body, reason] of [
    [{ action: "presented", round_id: "not-a-uuid", request_id: randomUUID() }, "invalid_round_id"],
    [{ action: "presented", round_id: roundId }, "invalid_request_id"],
    [{ action: "graded", round_id: roundId, request_id: randomUUID() }, "invalid_action"],
    [{ action: "presented", question_instance_id: randomUUID(), round_no: 0 }, "invalid_round_no"],
    [[], "invalid_body"],
  ]) {
    const r = await post(request, ta, "introduction-progress", body);
    expect(r, JSON.stringify(body)).toEqual({ status: 400, body: { outcome: "invalid_request", reason, error: "Invalid request" } });
  }
  const forged = await post(request, tb, "introduction-progress", {
    action: "presented", round_id: roundId, request_id: randomUUID(), student_id: a.id, presented_at: "2000-01-01T00:00:00Z", xp: 1000, coins: 1000, mastery_level: 10,
  });
  expect(forged.status, "a body field can never name the pupil: B is still B, and A's round is not B's").toBe(404);
  const r = await request.get(`${SUPA}/functions/v1/introduction-progress`, { headers: { apikey: ANON, authorization: `Bearer ${ta}` } });
  expect(r.status()).toBe(405);
  // The client roles cannot touch the tables directly, not even their own rows.
  for (const [method, path, data] of [["get", `introduction_rounds?select=*&student_id=eq.${a.id}`], ["patch", `introduction_rounds?id=eq.${roundId}`, { completed_at: new Date().toISOString() }],
    ["post", "introduction_rounds", { student_id: a.id }], ["get", "learning_introductions?select=content"]]) {
    const res = await request[method](`${SUPA}/rest/v1/${path}`, { headers: { apikey: ANON, authorization: `Bearer ${ta}`, ...json }, ...(data ? { data } : {}) });
    expect(res.status(), `${method} ${path} as the pupil`).toBeGreaterThanOrEqual(400);
  }
  const rpc = await request.post(`${SUPA}/rest/v1/rpc/complete_introduction`, { headers: { apikey: ANON, authorization: `Bearer ${ta}`, ...json }, data: { p_student_id: a.id, p_round_id: roundId, p_request_id: randomUUID() } });
  expect(rpc.status(), "the pupil cannot call the database function directly").toBeGreaterThanOrEqual(400);

  const rs = await rounds(request, a);
  expect(rs).toHaveLength(1);
  expect(rs[0]).toMatchObject({ presented_at: null, completed_at: null });
  expect(await rounds(request, b)).toEqual([]);
  expect(await rewardState(request, a)).toEqual(startA);
  expect(await rewardState(request, b)).toEqual(startB);
});

test("simultaneous requests and a lost connection: one round, one registration, one task instance; a new session resumes the same task", async ({ request }) => {
  const p = await makePupil(request, "race");
  const token = await signIn(request, p);
  const start = await rewardState(request, p);
  // Two tabs ask at once: one introduction round, the same id for both.
  const served = await Promise.all([0, 1, 2, 3].map(() => post(request, token, "get-next-question", next())));
  for (const s of served) expect(s.body.step, JSON.stringify(s.body)).toBe("introduction");
  expect(new Set(served.map((s) => s.body.introduction_round_id)).size).toBe(1);
  const roundId = served[0].body.introduction_round_id;
  expect(await rounds(request, p)).toHaveLength(1);
  // Five copies of the same "shown" report at once (a client retrying while the first is in flight): one write.
  const rid = randomUUID();
  const shown = await Promise.all([0, 1, 2, 3, 4].map(() => post(request, token, "introduction-progress", { action: "presented", round_id: roundId, request_id: rid })));
  for (const s of shown) expect(s.status).toBe(200);
  expect(shown.filter((s) => s.body.outcome === "recorded")).toHaveLength(1);
  expect(shown.filter((s) => s.body.outcome === "replay")).toHaveLength(4);
  expect(new Set(shown.map((s) => s.body.at)).size).toBe(1);
  // "Completed" from two tabs with different ids at once: exactly one recorded.
  const done = await Promise.all([randomUUID(), randomUUID()].map((id) => post(request, token, "introduction-progress", { action: "completed", round_id: roundId, request_id: id })));
  expect(done.map((d) => d.body.outcome).sort()).toEqual(["already_completed", "recorded"]);
  expect(await rewardState(request, p)).toEqual(start);
  // The first task, asked for by four tabs at once: ONE open instance. The contract for a tab that loses the race for
  // idx_one_open_question is an explicit 409 open_question_exists (get-next-question/objective-target.ts), never a
  // second instance and never "exhausted"; its retry gets the winner's instance.
  const tasks = await Promise.all([0, 1, 2, 3].map(() => post(request, token, "get-next-question", next())));
  const won = tasks.filter((t) => t.status === 200);
  for (const t of tasks) {
    if (t.status === 200) expect(t.body, JSON.stringify(t.body)).toMatchObject({ learning_step: "guided_practice", mode: "practice" });
    else expect(t, JSON.stringify(t)).toEqual({ status: 409, body: { error: "open_question_exists" } });
  }
  expect(won.length, "at least one tab gets the task").toBeGreaterThanOrEqual(1);
  expect(new Set(won.map((t) => t.body.question_instance_id)).size, "every winner got the same instance").toBe(1);
  const retry = await post(request, token, "get-next-question", next());
  expect(retry.status).toBe(200);
  expect(retry.body.question_instance_id, "a losing tab's retry gets the same instance").toBe(won[0].body.question_instance_id);
  expect(await instances(request, p)).toHaveLength(1);
  // The connection is lost; the pupil signs in again (a new session): the same task, the same content, no new
  // introduction and no new instance — the server, not the browser, holds the state.
  const fresh = await signIn(request, p);
  const resumed = await post(request, fresh, "get-next-question", next());
  expect(resumed.body).toMatchObject({ question_instance_id: retry.body.question_instance_id, learning_step: "guided_practice", round_no: retry.body.round_no });
  expect(resumed.body.content).toEqual(retry.body.content);
  expect(await instances(request, p)).toHaveLength(1);
  expect(await rounds(request, p)).toHaveLength(1);
  expect(await rewardState(request, p)).toEqual(start);
});
