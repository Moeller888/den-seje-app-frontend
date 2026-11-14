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
const GRADING_KEYS = ["correct", "accepted_answers", "review_text", "correct_answer", "pilot_phase"];

test.describe.configure({ mode: "serial" });

let inProfile = false;
test.beforeAll(async ({ request }) => {
  expect(PILOT.length, "the pilot migration holds seven rows").toBe(7);
  const fn = await request.post(`${SUPA}/rest/v1/rpc/request_repeat_phase_question_for_student`,
    { headers: { ...svc, ...json }, data: { p_student_id: null, p_domains: null, p_question_ids: null, p_max_repeats: 2 } });
  if (fn.status() === 404 && !F07_LANE) return; // another lane: nothing to test here
  expect(fn.status(), `F07 lane: the phase repeat function must exist (${await fn.text()})`).toBe(200);
  inProfile = true;
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

async function makePupil(request, tag, domains = [OBJECTIVE]) {
  const email = `f07-phase-${tag}-${RUN}@${SYNTHETIC_EMAIL_DOMAIN}`;
  const password = createHash("sha256").update(`isolated-f07-phase-${tag}:${RUN}`).digest("base64url");
  const created = await request.post(`${SUPA}/auth/v1/admin/users`, { headers: svc, data: { email, password, email_confirm: true } });
  expect(created.status(), "local Auth must create the synthetic pupil").toBe(200);
  const id = (await created.json()).id;
  const profile = await request.post(`${SUPA}/rest/v1/profiles`, {
    headers: { ...svc, ...json, prefer: "return=minimal" },
    data: { id, role: "student", full_name: `Syntetisk F-07-elev ${tag}`, selected_grade: 7, active_domains: domains, equipped_slots: {}, active_theme: "default" },
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
const gnqRaw = (request, p) => request.post(`${SUPA}/functions/v1/get-next-question`, { headers: { ...asPupil(p), ...json }, data: { subject: "historie" } });
// With the client's behaviour: one retry after an error (409 phase_state_changed after a lost race).
async function nextQuestion(request, p) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await gnqRaw(request, p);
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
  expect((await progressOf(request, p)).xp - start.xp, "10 XP per right first answer, 2 per right repeat").toBe(expectXp);
});

test("backend 2: a pupil without the pilot domain is never served a pilot row", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "backend path: once per run");
  const p = await makePupil(request, "noaccess", ["revolutions_democracy"]);
  for (let i = 0; i < 3; i++) {
    const q = await nextQuestion(request, p);
    if (q.step === "no_questions") break;
    expect(BY_QUESTION.has(q?.content?.question), "a regular pupil got a pilot question").toBe(false);
    const qi = q.question_instance_id;
    await answer(request, p, qi, "x");
  }
  const rows = await (await request.get(`${SUPA}/rest/v1/question_instances?select=question_id&student_id=eq.${p.id}`, { headers: svc })).json();
  const pilotIds = (await (await request.get(`${SUPA}/rest/v1/questions?select=id&learning_objective=eq.${OBJECTIVE}`, { headers: svc })).json()).map((r) => r.id);
  expect(rows.filter((r) => pilotIds.includes(r.question_id)), "no pilot instance for a regular pupil").toEqual([]);
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
  const p = await makePupil(request, `ui-${testInfo.project.name}`);
  await login(page, p);
  const isGnq = (r) => r.url().startsWith(`${SUPA}/functions/v1/get-next-question`) && r.request().method() === "POST";
  let pending = page.waitForResponse(isGnq, { timeout: 30000 });
  await page.goto(`${BASE}/index.html`);
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
  console.log(`F07 browser (${testInfo.project.name}): ${seen.join(" ")}; read-aloud control — source: ${sourceHasPlayer}, image description: ${imageHasPlayer}`);
  expect(new Set(seen).size, `all seven met: ${seen.join(" ")}`).toBe(7);
  expect(seen[0]).toBe("S1");
  expect(nonDecreasing(seen.map((l) => BY_QUESTION.get(PILOT[Number(l.slice(1)) - 1].content.question).rank)), `phase order: ${seen.join(" ")}`).toBe(true);
  // Read-aloud: the image description gets the same control as the source text (same adapter). Whether a voice exists
  // in this browser is the environment's business — but where the source has a control, the description must too.
  if (sourceHasPlayer) expect(imageHasPlayer, "the image description is readable aloud wherever the source text is").toBe(true);
});
