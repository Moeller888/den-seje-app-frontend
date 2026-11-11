// F-07 stimulus, the FULL chain on the isolated stack (D-362, "vej B" readiness; D-110):
//
//   this commit's get-next-question (Edge Runtime, replayed production schema)
//     → serves an ACTIVE question that carries content.stimulus
//   → this commit's quiz in a real browser (index.html + app.js + js/stimulus.js, the deploy bundle)
//     → shows the stimulus, the question and the options
//   → the pupil answers
//   → this commit's process-event (process_question_attempt) grades it
//   → the database holds the right state: the round answered, was_correct as given, the reward paid once.
//
// The fixture is two of the D-362 pilot rows (an image row and a source row), seeded ACTIVE into the
// throwaway database by tests/isolated/seed/stimulus-chain-questions.mjs with learning_objective
// 'pilot_d362'. A pupil gets them only when profiles.active_domains contains 'pilot_d362' — set here with
// the service role, like the separate owner-approved production action for the test account (D-362).
//
// What it proves, per browser project (each with its own synthetic pupil):
//   1. the get-next-question response the browser receives carries content.stimulus with exactly the
//      contract's fields and NO grading data anywhere (no correct, accepted_answers, review_text,
//      misconception_type, …, and not the explanation text);
//   2. the quiz shows the stimulus — the image loaded from this site's assets/stimulus/ (naturalWidth > 0),
//      or the source's title, text and credit — with the question and its options;
//   3. a right first answer: "Ja! 🎯", the round answered and correct, exactly 10 XP + 5 coins; a re-submit
//      of the same round (right or wrong) changes nothing;
//   4. a wrong answer: the reflection with the explanation, the stimulus still on screen, the round answered
//      and wrong, nothing paid;
//   5. the repeat of the wrong round (get-next-question's repeat path) carries the stimulus again; answered
//      right it pays the repeat amount, 2 XP + 1 coin (D-211), and nothing more.
// And once per run (chromium): a pupil WITHOUT the pilot domain — active_domains = ['revolutions_democracy'],
// the rows' faglige domain, same grade — exhausts the whole unserved pool through the real
// get-next-question and is never served a fixture row.
//
// LIMITS: without Edge secrets the level engine and the format mix are off here; H5 submissions are off in
// the client. On test/f07-strategy-a-prodlike the workflow serves the functions with production's secrets
// LEVEL_ENGINE=v1 and QUESTION_MIX_ENGINE=shadow and tells this spec so through ISOLATED_LEVEL_ENGINE=v1;
// only the regular pupil's expected scope depends on it. Nothing reaches production: the guard refuses the
// run first, and a tripwire aborts and records any request to a production host.
import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { assertIsolated, installProdTripwire, SYNTHETIC_EMAIL_DOMAIN } from "./isolation-guard.mjs";
import { stimulusChainQuestions, STIMULUS_CHAIN_OBJECTIVE, STIMULUS_CHAIN_GRADE, STIMULUS_CHAIN_FIXTURE } from "./seed/stimulus-chain-questions.mjs";

assertIsolated(process.env);

const BASE = process.env.ISOLATED_BASE_URL.replace(/\/+$/, "");
const SUPA = process.env.ISOLATED_SUPABASE_URL.replace(/\/+$/, "");
const ANON = process.env.ISOLATED_SUPABASE_ANON_KEY;
const SERVICE = process.env.ISOLATED_SUPABASE_SERVICE_KEY;
const RUN = (process.env.GITHUB_RUN_ID || "local") + "-" + (process.env.GITHUB_RUN_ATTEMPT || "1");
// The level engine the Edge Functions were served with: unset = off, "v1" = on. Anything else refuses.
const LEVEL_ENGINE = process.env.ISOLATED_LEVEL_ENGINE ?? "off";
if (!["off", "v1"].includes(LEVEL_ENGINE)) throw new Error("ISOLATED_LEVEL_ENGINE must be unset or \"v1\"");
const svc = { apikey: SERVICE, authorization: `Bearer ${SERVICE}` };
const json = { "content-type": "application/json" };

// The fixture as seeded (same module, same pilot file).
const FIXTURES = stimulusChainQuestions();

// Fields that grade an answer: none may appear anywhere in a payload sent before the answer.
const GRADING_KEYS = ["correct", "accepted_answers", "review_text", "misconception_type", "facit", "tolerance", "criteria", "correct_answer", "pairs", "items"];
// The browser-facing contract (supabase/functions/_shared/question-dto.ts, stimulus.ts).
const RESPONSE_KEYS = ["question_instance_id", "round_no", "content", "answer_format", "answer_type", "metadata", "wave_phase", "is_repeat"];
const PUBLIC_METADATA_KEYS = ["difficulty_type", "cognitive_skill", "challenge_role", "insight_type", "concepts", "domain"];
const STIMULUS_KEYS = { image: ["kind", "file", "alt", "caption", "credit"], source: ["kind", "text", "title", "credit"], audio: ["kind", "file", "transcript", "title", "credit"] };
const CREDIT_KEYS = ["source", "creator", "year", "license"];
// The fixed avatar identity global-setup gives the primary pupil, so the identity prompt never covers the quiz.
const IDENTITY = () => ({ v: 1, body_type: "neutral", hairstyle: "default", chosen_at: new Date().toISOString() });

test.describe.configure({ mode: "serial" });

function keysDeep(value, out = new Set()) {
  if (Array.isArray(value)) for (const v of value) keysDeep(v, out);
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) { out.add(k); keysDeep(v, out); }
  return out;
}

// A synthetic pupil at grade 7 with the given teacher filter (active_domains), signed in for API calls.
async function makePupil(request, tag, activeDomains) {
  const email = `stimulus-${tag}-${RUN}@${SYNTHETIC_EMAIL_DOMAIN}`;
  const password = createHash("sha256").update(`isolated-stimulus-${tag}:${RUN}`).digest("base64url");
  const created = await request.post(`${SUPA}/auth/v1/admin/users`, { headers: svc, data: { email, password, email_confirm: true } });
  expect(created.status(), "local Auth must create the synthetic pupil").toBe(200);
  const id = (await created.json()).id;
  const profile = await request.post(`${SUPA}/rest/v1/profiles`, {
    headers: { ...svc, ...json, prefer: "return=minimal" },
    data: { id, role: "student", full_name: `Syntetisk stimulus-elev ${tag}`, selected_grade: STIMULUS_CHAIN_GRADE,
      active_domains: activeDomains, avatar_identity: IDENTITY(), equipped_slots: {}, active_theme: "default" },
  });
  expect(profile.status(), await profile.text()).toBe(201);
  const stored = (await (await request.get(`${SUPA}/rest/v1/profiles?select=active_domains,selected_grade&id=eq.${id}`, { headers: svc })).json())[0];
  expect(stored, "the profile carries the scope this test relies on").toEqual({ active_domains: activeDomains, selected_grade: STIMULUS_CHAIN_GRADE });
  const signIn = await request.post(`${SUPA}/auth/v1/token?grant_type=password`, { headers: { apikey: ANON }, data: { email, password } });
  expect(signIn.status()).toBe(200);
  return { id, email, password, token: (await signIn.json()).access_token };
}
const asPupil = (p) => ({ apikey: ANON, authorization: `Bearer ${p.token}` });

const progressOf = async (request, p) => {
  const rows = await (await request.get(`${SUPA}/rest/v1/student_progress?select=xp,coins,correct_answers&student_id=eq.${p.id}`, { headers: svc })).json();
  expect(rows.length, "exactly one progress row").toBe(1);
  return { xp: rows[0].xp ?? 0, coins: rows[0].coins ?? 0, correct_answers: rows[0].correct_answers ?? 0 };
};
const instanceOf = async (request, id) => {
  const rows = await (await request.get(`${SUPA}/rest/v1/question_instances?select=id,student_id,question_id,answered,was_correct,user_answer,repeat_count&id=eq.${id}`, { headers: svc })).json();
  expect(rows.length, `instance ${id} exists`).toBe(1);
  return rows[0];
};
const answerViaApi = (request, p, instanceId, answer) => request.post(`${SUPA}/functions/v1/process-event`, {
  headers: { ...asPupil(p), ...json },
  data: { student_id: p.id, question_instance_id: instanceId, answer, question_shown_at: Date.now() },
});

const isFn = (name) => (r) => r.url().startsWith(`${SUPA}/functions/v1/${name}`) && r.request().method() === "POST";

// The fixture rows as stored: id by question text.
let fixtureIds = new Map();

test.beforeAll(async ({ request }) => {
  const rows = await (await request.get(
    `${SUPA}/rest/v1/questions?select=id,content,is_active,learning_objective,target_grade,answer_format&metadata->>fixture=eq.${STIMULUS_CHAIN_FIXTURE}`,
    { headers: svc })).json();
  expect(rows.length, "seed.mjs seeded the two stimulus fixture rows").toBe(2);
  for (const r of rows) {
    const fx = FIXTURES.find((f) => f.content.question === r.content?.question);
    expect(fx, `stored row "${r.content?.question}" is a fixture row`).toBeTruthy();
    expect({ is_active: r.is_active, learning_objective: r.learning_objective, target_grade: r.target_grade, answer_format: r.answer_format })
      .toEqual({ is_active: true, learning_objective: STIMULUS_CHAIN_OBJECTIVE, target_grade: STIMULUS_CHAIN_GRADE, answer_format: "mc" });
    expect(r.content).toEqual(fx.content);
    fixtureIds.set(fx.content.question, r.id);
  }
  // Nothing else is in the pilot scope, so the pilot pupil's whole pool is these two rows.
  const scope = await (await request.get(`${SUPA}/rest/v1/questions?select=id&is_active=eq.true&learning_objective=eq.${STIMULUS_CHAIN_OBJECTIVE}`, { headers: svc })).json();
  expect(scope.length).toBe(2);
});

// The get-next-question payload: the stimulus's contract fields only, no grading data anywhere.
function expectCleanPayload(body, fx, { repeat = false } = {}) {
  for (const k of Object.keys(body)) expect(RESPONSE_KEYS, `unexpected response field ${k}`).toContain(k);
  expect(body.question_instance_id).toBeTruthy();
  expect(body.answer_format).toBe("mc");
  expect(body.round_no).toBe(repeat ? 2 : 1);
  if (repeat) expect(body.is_repeat).toBe(true);
  else expect(body.is_repeat).toBeUndefined();
  expect(Object.keys(body.content).sort()).toEqual(["options", "question", "stimulus", "type"]);
  expect(body.content.question).toBe(fx.content.question);
  expect(body.content.options).toEqual(fx.content.options);
  const s = body.content.stimulus;
  for (const k of Object.keys(s)) expect(STIMULUS_KEYS[fx.content.stimulus.kind], `stimulus.${k}`).toContain(k);
  for (const k of Object.keys(s.credit)) expect(CREDIT_KEYS, `stimulus.credit.${k}`).toContain(k);
  expect(s).toEqual(fx.content.stimulus);
  if (body.metadata !== null) for (const k of Object.keys(body.metadata)) expect(PUBLIC_METADATA_KEYS, `metadata.${k}`).toContain(k);
  const keys = keysDeep(body);
  for (const k of GRADING_KEYS) expect(keys.has(k), `payload carries ${k}`).toBe(false);
  for (const k of ["synthetic", "fixture", "pilot", "pilot_form", "pilot_phase"]) expect(keys.has(k), `payload carries metadata.${k}`).toBe(false);
  expect(JSON.stringify(body).includes(fx.content.review_text), "the explanation is not in the payload").toBe(false);
}

const creditLine = (c) => "Kilde: " + [c.creator, c.source, c.year, c.license].filter((v) => typeof v === "string" && v.trim()).map((v) => v.trim()).join(" · ");

// The stimulus on screen, above the question and its options.
async function expectStimulusShown(page, fx) {
  const st = fx.content.stimulus;
  const fig = page.locator(`#stimulus figure.stimulus-kind-${st.kind}`);
  await expect(fig).toBeVisible({ timeout: 15000 });
  await expect(fig.locator("figcaption")).toHaveText(creditLine(st.credit));
  if (st.kind === "image") {
    await expect(fig.locator(".stimulus-label")).toHaveText("Billede");
    const img = fig.locator("img.stimulus-image");
    await expect(img).toHaveAttribute("alt", st.alt);
    await expect.poll(() => img.evaluate((el) => el.complete && el.naturalWidth > 0), { message: "the image loaded", timeout: 15000 }).toBe(true);
    const src = new URL(await img.evaluate((el) => el.currentSrc));
    expect(src.origin, "served by this site").toBe(new URL(BASE).origin);
    expect(src.pathname).toBe(`/assets/stimulus/${st.file}`);
    if (st.caption) await expect(fig.locator(".stimulus-caption")).toHaveText(st.caption);
  } else {
    await expect(fig.locator(".stimulus-label")).toHaveText("Kilde");
    if (st.title) await expect(fig.locator(".stimulus-title")).toHaveText(st.title);
    await expect(fig.locator("blockquote")).toContainText(st.text);
  }
  await expect(page.locator("#question")).toContainText(fx.content.question);
  for (const o of fx.content.options) await expect(page.locator("#options button", { hasText: o }).first()).toBeVisible();
}

const option = (page, text) => page.locator("#options button", { hasText: text }).first();
const fixtureFor = (body) => {
  const fx = FIXTURES.find((f) => f.content.question === body?.content?.question);
  expect(fx, `served a fixture row, got ${JSON.stringify(body)?.slice(0, 200)}`).toBeTruthy();
  return fx;
};

test("pilot pupil: the real get-next-question serves the stimulus, the quiz shows it, the real process-event grades it, the reward is paid once", async ({ page, context, request }, testInfo) => {
  test.slow(); // three questions with the quiz's own transitions (600 ms, the reflection) in one flow
  const hits = [];
  await installProdTripwire(context, hits);
  const pupil = await makePupil(request, `pilot-${testInfo.project.name}`, [STIMULUS_CHAIN_OBJECTIVE]);

  // Sign in through the real login page (local Auth); a pupil lands on the Hub, the quiz is index.html.
  await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", pupil.email);
  await page.fill("#password", pupil.password);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${BASE}/hub.html`, { timeout: 20000 });

  // ── 1. first question ──
  const gnq1 = page.waitForResponse(isFn("get-next-question"), { timeout: 30000 });
  await page.goto(`${BASE}/index.html`);
  const r1 = await gnq1;
  expect(r1.status()).toBe(200);
  const p1 = await r1.json();
  const fx1 = fixtureFor(p1);
  expectCleanPayload(p1, fx1);
  await expect(page.locator('#question[data-state="ready"]')).toBeVisible({ timeout: 20000 });
  await expectStimulusShown(page, fx1);
  const inst1 = await instanceOf(request, p1.question_instance_id);
  expect(inst1).toMatchObject({ student_id: pupil.id, question_id: fixtureIds.get(fx1.content.question), answered: false, repeat_count: 0 });
  const base = await progressOf(request, pupil);

  // A right first answer.
  const pe1 = page.waitForResponse(isFn("process-event"));
  const gnq2 = page.waitForResponse(isFn("get-next-question"), { timeout: 30000 });
  await option(page, fx1.content.correct).click();
  const a1 = await pe1;
  expect(a1.status()).toBe(200);
  expect((await a1.json()).status).toBe("correct");
  await expect(page.locator("#feedback")).toHaveText("Ja! 🎯");
  expect(await instanceOf(request, inst1.id)).toMatchObject({ answered: true, was_correct: true, user_answer: fx1.content.correct, repeat_count: 0 });
  const afterFirst = await progressOf(request, pupil);
  expect(afterFirst, "a right first answer pays 10 XP + 5 coins (process_question_attempt)").toEqual(
    { xp: base.xp + 10, coins: base.coins + 5, correct_answers: base.correct_answers + 1 });

  // A re-submit of the same round — the same answer (a network retry) or another one — changes nothing.
  for (const again of [fx1.content.correct, fx1.content.options.find((o) => o !== fx1.content.correct)]) {
    const res = await answerViaApi(request, pupil, inst1.id, again);
    expect(res.status(), await res.text()).toBe(200);
    expect((await res.json()).status, "the recorded result, not a new grading").toBe("correct");
  }
  expect(await progressOf(request, pupil), "nothing paid twice").toEqual(afterFirst);
  expect(await instanceOf(request, inst1.id)).toMatchObject({ answered: true, was_correct: true, user_answer: fx1.content.correct });

  // ── 2. the other fixture row, answered wrong ──
  const r2 = await gnq2;
  expect(r2.status()).toBe(200);
  const p2 = await r2.json();
  const fx2 = fixtureFor(p2);
  expect(fx2.content.question, "the second question is the other fixture row").not.toBe(fx1.content.question);
  expectCleanPayload(p2, fx2);
  await expect(page.locator('#question[data-state="ready"]')).toBeVisible({ timeout: 20000 });
  await expectStimulusShown(page, fx2);
  // Exactly one stimulus on screen: the first question's material was replaced, not kept.
  await expect(page.locator("#stimulus figure")).toHaveCount(1);
  const inst2Id = p2.question_instance_id;
  expect(await instanceOf(request, inst2Id)).toMatchObject({ question_id: fixtureIds.get(fx2.content.question), answered: false, repeat_count: 0 });

  const wrong = fx2.content.options.find((o) => o !== fx2.content.correct);
  const pe2 = page.waitForResponse(isFn("process-event"));
  await option(page, wrong).click();
  const a2 = await pe2;
  expect(a2.status()).toBe(200);
  const a2body = await a2.json();
  expect(a2body.status).toBe("incorrect");
  expect(a2body.correct_answer, "the key comes back only after the answer is recorded").toBe(fx2.content.correct);
  // The reflection (app.js enterReflectionState): the explanation process-event returned after grading.
  await expect(page.locator("#review-feedback")).toHaveText(fx2.content.review_text, { timeout: 10000 });
  await expect(page.locator(`#stimulus figure.stimulus-kind-${fx2.content.stimulus.kind}`), "the material stays while the pupil reads why").toBeVisible();
  expect(await instanceOf(request, inst2Id)).toMatchObject({ answered: true, was_correct: false, user_answer: wrong, repeat_count: 0 });
  expect(await progressOf(request, pupil), "nothing for a wrong answer").toEqual(afterFirst);

  // ── 3. the pool is exhausted: get-next-question's repeat path reopens the wrong round, stimulus included ──
  const gnq3 = page.waitForResponse(isFn("get-next-question"), { timeout: 30000 });
  await page.locator("#reflection-continue").click();
  const r3 = await gnq3;
  expect(r3.status()).toBe(200);
  const p3 = await r3.json();
  expect(p3.question_instance_id, "the wrong round comes back first").toBe(inst2Id);
  expectCleanPayload(p3, fx2, { repeat: true });
  await expect(page.locator('#question[data-state="ready"]')).toBeVisible({ timeout: 20000 });
  await expectStimulusShown(page, fx2);
  expect(await instanceOf(request, inst2Id)).toMatchObject({ answered: false, repeat_count: 1 });

  const pe3 = page.waitForResponse(isFn("process-event"));
  await option(page, fx2.content.correct).click();
  const a3 = await pe3;
  expect(a3.status()).toBe(200);
  expect((await a3.json()).status).toBe("correct");
  await expect(page.locator("#feedback")).toHaveText("Ja! 🎯");
  expect(await instanceOf(request, inst2Id)).toMatchObject({ answered: true, was_correct: true, user_answer: fx2.content.correct, repeat_count: 1 });
  expect(await progressOf(request, pupil), "a repeat pays 2 XP + 1 coin and does not count as a new correct answer (D-211)").toEqual(
    { xp: afterFirst.xp + 2, coins: afterFirst.coins + 1, correct_answers: afterFirst.correct_answers });

  expect(hits, "no request may go to a production host").toEqual([]);
});

test("a pupil without the pilot domain exhausts the real get-next-question pool and is never served a fixture row", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "backend path: once per run");
  test.slow();
  // The rows' faglige domain at the same grade: the closest a regular pupil gets to the pilot rows.
  const pupil = await makePupil(request, "regular", ["revolutions_democracy"]);
  // The pupil's scope as the selection that runs defines it: the classic path (get_unserved_questions_for_student)
  // stops at the pupil's grade; LEVEL_ENGINE=v1 (get_level_questions_for_student, 20261029120000) has no grade
  // ceiling and takes only rows on the difficulty scale.
  const scopeFilter = LEVEL_ENGINE === "v1" ? "difficulty_level=not.is.null" : `target_grade=lte.${STIMULUS_CHAIN_GRADE}`;
  const pool = await (await request.get(
    `${SUPA}/rest/v1/questions?select=id&is_active=eq.true&learning_objective=eq.revolutions_democracy&${scopeFilter}`,
    { headers: svc })).json();
  expect(pool.length, "the regular pool is live").toBeGreaterThan(0);
  const fixtures = [...fixtureIds.values()];
  const served = [];
  let last = null;
  for (let i = 0; i < pool.length + 2; i++) {
    const res = await request.post(`${SUPA}/functions/v1/get-next-question`, { headers: { ...asPupil(pupil), ...json }, data: { subject: "historie" } });
    expect(res.status(), await res.text()).toBe(200);
    last = await res.json();
    if (!last.question_instance_id || last.is_repeat) break;
    expect(last.content?.stimulus, "a regular question carries no stimulus").toBeUndefined();
    const inst = await instanceOf(request, last.question_instance_id);
    expect(fixtures, "a fixture row was served to a pupil without the pilot domain").not.toContain(inst.question_id);
    served.push(inst.question_id);
    // Answer it (the backend key, read with the service role) so the next call draws a new question.
    const key = (await (await request.get(`${SUPA}/rest/v1/question_instances?select=correct_answer&id=eq.${inst.id}`, { headers: svc })).json())[0].correct_answer;
    const ans = await answerViaApi(request, pupil, inst.id, key);
    expect(ans.status(), await ans.text()).toBe(200);
  }
  // The whole unserved pool was drawn, every row once, before the pool was declared exhausted.
  expect(new Set(served).size).toBe(served.length);
  expect([...served].sort(), "every question in the pupil's scope was served").toEqual(pool.map((r) => r.id).sort());
  expect(last?.is_repeat === true || last?.step === "no_questions", `the pool ends in a repeat or no_questions: ${JSON.stringify(last)?.slice(0, 200)}`).toBe(true);
  if (last?.question_instance_id) expect(fixtures).not.toContain((await instanceOf(request, last.question_instance_id)).question_id);
});
