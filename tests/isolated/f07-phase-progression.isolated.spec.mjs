// F-07 / D-362: the whole pilot — all SEVEN stimulus questions — through the REAL chain on the isolated stack:
// this commit's get-next-question (phase gate, phase repeat) and process-event over HTTP, local Auth and Postgres,
// and the quiz in the browser.
//
// RUNS ONLY in the replay profile "f07" (tests/isolated/schema/replay-plan.mjs TEST_PROFILES.f07), which replays the
// phase repeat function (20261113170000, NOT_IN_PRODUCTION). In any other lane the probe below finds it missing and
// every test is skipped (nothing to assert there). The replay never stores question rows: the seven pilot rows are
// seeded here, ACTIVE, from the pilot migration's own JSON (20261108090100, byte for byte its content), in this
// throwaway database only. How to run it in CI: docs/operations/f07-isolated-e2e.md.
//
// Proves (backend, chromium once):
//   * a pilot pupil meets the questions in phase order (introduktion → forståelsestjek → anvendelse), S1 first;
//   * a reload / second request while a pilot round is open serves the SAME round (the D-362 P1 fix);
//   * a wrong answer is practised in its own phase before the next phase (phase repeat, round 2), never
//     no_questions; a number question is answered with digits; nothing grading-related is in a payload;
//   * every right first answer pays 10 XP + 5 coins, a right repeat 2 + 1, nothing twice.
// Proves (browser, every project): the quiz shows each of the seven stimuli (image with its description to open and
//   have read aloud, or the source text), and a pupil can answer all seven — MC by click, numbers by typing.
// Does NOT prove: production data or settings (synthetic stack), read-aloud audio (no TTS provider in CI).
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
const svc = { apikey: SERVICE, authorization: `Bearer ${SERVICE}` };
const json = { "content-type": "application/json" };
const OBJECTIVE = "pilot_d362";
const PHASES = ["introduktion", "forståelsestjek", "selvstændig anvendelse"];

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
  if (fn.status() === 404) return; // not the f07 lane: the function does not exist
  expect(fn.status(), await fn.text()).toBe(200);
  inProfile = true;
  // Seed the seven pilot rows ACTIVE (the later, separate owner activation — here only), once per stack.
  const have = await (await request.get(`${SUPA}/rest/v1/questions?select=id&learning_objective=eq.${OBJECTIVE}&metadata->>pilot_form=eq.stimulus`, { headers: svc })).json();
  if (have.length === 7) return;
  expect(have.length, "either none or all seven pilot rows").toBe(0);
  const rows = PILOT.map((r) => ({
    type: r.type, content: r.content, answer_format: r.answer_format, answer_type: "short", metadata: r.metadata,
    difficulty: r.difficulty_band, question_type: "auto", is_active: true, learning_objective: OBJECTIVE, target_grade: 7,
    difficulty_band: r.difficulty_band, difficulty_level: r.difficulty_level,
  }));
  const ins = await request.post(`${SUPA}/rest/v1/questions`, { headers: { ...svc, ...json, prefer: "return=minimal" }, data: rows });
  expect(ins.status(), await ins.text()).toBe(201);
});
test.beforeEach(() => { test.skip(!inProfile, "replay profile f07 not in this lane (the phase repeat function is absent)"); });

async function makePupil(request, tag) {
  const email = `f07-phase-${tag}-${RUN}@${SYNTHETIC_EMAIL_DOMAIN}`;
  const password = createHash("sha256").update(`isolated-f07-phase-${tag}:${RUN}`).digest("base64url");
  const created = await request.post(`${SUPA}/auth/v1/admin/users`, { headers: svc, data: { email, password, email_confirm: true } });
  expect(created.status(), "local Auth must create the synthetic pupil").toBe(200);
  const id = (await created.json()).id;
  const profile = await request.post(`${SUPA}/rest/v1/profiles`, {
    headers: { ...svc, ...json, prefer: "return=minimal" },
    data: { id, role: "student", full_name: `Syntetisk F-07-elev ${tag}`, selected_grade: 7, active_domains: [OBJECTIVE], equipped_slots: {}, active_theme: "default" },
  });
  expect(profile.status(), await profile.text()).toBe(201);
  const signIn = await request.post(`${SUPA}/auth/v1/token?grant_type=password`, { headers: { apikey: ANON }, data: { email, password } });
  expect(signIn.status()).toBe(200);
  return { id, email, password, token: (await signIn.json()).access_token };
}
const asPupil = (p) => ({ apikey: ANON, authorization: `Bearer ${p.token}` });
const xpOf = async (request, p) => (await (await request.get(`${SUPA}/rest/v1/student_progress?select=xp,coins&student_id=eq.${p.id}`, { headers: svc })).json())[0] ?? { xp: 0, coins: 0 };
const keysDeep = (v, out = new Set()) => { if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { out.add(k); keysDeep(x, out); } return out; };

// The real Edge Function, as app.js calls it. A 409 (phase_state_changed, a lost race) is retried once, as the client does.
async function nextQuestion(request, p) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await request.post(`${SUPA}/functions/v1/get-next-question`, { headers: { ...asPupil(p), ...json }, data: { subject: "historie" } });
    if (res.status() === 409 && attempt === 0) continue;
    expect(res.status(), await res.text()).toBe(200);
    return await res.json();
  }
}
const answer = (request, p, instanceId, value) => request.post(`${SUPA}/functions/v1/process-event`, {
  headers: { ...asPupil(p), ...json }, data: { student_id: p.id, question_instance_id: instanceId, answer: value, question_shown_at: Date.now() },
});

test("backend: all seven in phase order; a reload keeps the open round; a wrong answer is practised in its phase; rewards once", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "backend path: once per run");
  test.slow();
  const p = await makePupil(request, "api");
  const start = await xpOf(request, p);
  let expectXp = 0;
  const path = [];
  const tries = new Map();
  const secured = new Set();
  for (let step = 0; step < 20 && secured.size < 7; step++) {
    const q = await nextQuestion(request, p);
    expect(q.step, `no_questions before all seven were secured: ${path.join(" ")}`).not.toBe("no_questions");
    const meta = BY_QUESTION.get(q?.content?.question);
    expect(meta, `served a pilot row: ${JSON.stringify(q).slice(0, 200)}`).toBeTruthy();
    // nothing that grades the answer, and no phase tag, reaches the browser
    const keys = keysDeep(q);
    for (const k of GRADING_KEYS) expect(keys.has(k), `payload carries ${k}`).toBe(false);
    if (step === 0) {
      // P1: a reload / second tab while the round is open gets the SAME round, never a deleted one
      const again = await nextQuestion(request, p);
      expect(again.question_instance_id, "the open pilot round survives a second request").toBe(q.question_instance_id);
    }
    const k = (tries.get(meta.label) ?? 0) + 1; tries.set(meta.label, k);
    const right = !(meta.label === "S1" && k === 1); // S1 wrong once, everything else right
    const value = right ? meta.row.content.correct : (meta.row.content.options ?? []).find((o) => o !== meta.row.content.correct);
    const res = await answer(request, p, q.question_instance_id, value);
    expect(res.status(), await res.text()).toBe(200);
    expect((await res.json()).status).toBe(right ? "correct" : "incorrect");
    if (right) { expectXp += k === 1 ? 10 : 2; secured.add(meta.label); }
    path.push(`${meta.label}${k > 1 ? "r" : ""}${right ? "+" : "-"}@${meta.rank}`);
  }
  console.log(`F07 phase path: ${path.join(" ")}`);
  const ranks = path.map((s) => Number(s.split("@")[1]));
  expect(ranks.every((r, i) => i === 0 || r >= ranks[i - 1]), `phases never step back: ${path.join(" ")}`).toBe(true);
  expect(path[0]).toMatch(/^S1-@0$/);
  expect(path.slice(0, 3).map((s) => s.split("@")[0]), "S2 (spacing), then the S1 repeat, before any later phase").toEqual(["S1-", "S2+", "S1r+"]);
  expect(secured.size).toBe(7);
  expect((await xpOf(request, p)).xp - start.xp, "10 XP per right first answer, 2 per right repeat").toBe(expectXp);
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
  for (let i = 0; i < 7; i++) {
    const r = await pending;
    expect(r.status()).toBe(200);
    const body = await r.json();
    const meta = BY_QUESTION.get(body?.content?.question);
    expect(meta, `served a pilot row: ${JSON.stringify(body).slice(0, 160)}`).toBeTruthy();
    seen.push(meta.label);
    await expect(page.locator('#question[data-state="ready"]')).toBeVisible({ timeout: 20000 });
    const st = meta.row.content.stimulus;
    const fig = page.locator(`#stimulus figure.stimulus-kind-${st.kind}`);
    await expect(fig).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#stimulus figure")).toHaveCount(1);
    if (st.kind === "image") {
      await expect(fig.locator("img.stimulus-image")).toHaveAttribute("alt", st.alt);
      // F-07 accessibility: the picture's information can be opened as text (and read aloud where a voice exists)
      const desc = fig.locator("details.stimulus-image-description");
      await desc.locator("summary").click();
      await expect(desc.locator("#stimulus-image-text")).toContainText(st.alt.slice(0, 40));
    } else {
      await expect(fig.locator("blockquote")).toContainText(st.text.split("\n")[0]);
    }
    await expect(page.locator("#question")).toContainText(meta.row.content.question);
    pending = page.waitForResponse(isGnq, { timeout: 30000 });
    if (meta.row.answer_format === "number") {
      await page.locator("#number-answer-input").fill(meta.row.content.correct);
      await page.locator("#number-answer-input").press("Enter");
    } else {
      await page.locator("#options button", { hasText: meta.row.content.correct }).first().click();
    }
    await expect(page.locator("#feedback")).toHaveText("Ja! 🎯");
  }
  expect(new Set(seen).size, `all seven met: ${seen.join(" ")}`).toBe(7);
  expect(seen[0]).toBe("S1");
  const ranks = seen.map((l) => BY_QUESTION.get(PILOT[Number(l.slice(1)) - 1].content.question).rank);
  expect(ranks.every((r, i) => i === 0 || r >= ranks[i - 1]), `phase order in the browser: ${seen.join(" ")}`).toBe(true);
});
