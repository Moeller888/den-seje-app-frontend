// Lærligverse (D-309): the learning bridge against the REAL backend, on the isolated stack (D-110).
//
// The game end (BridgeClient) and the host end (BridgeHost) are the shipped classes from
// adventure-engine/packages/learning-bridge, wired like two windows (structured clone, origin and source
// checks). The host's backend is LaerligTaskService calling THIS commit's Edge Functions
// (get-next-question, process-event) with a synthetic pupil's session; grading, recording and rewards
// happen in the replayed production functions in the local PostgreSQL. The database is the oracle,
// read with the local service key — never by the bridge.
//
// Not covered here (and not claimed): a browser host page. The browser-level isolation of host and game
// is covered by adventure-engine/e2e/archive.spec.ts (with the test adapter).
import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { assertIsolated, SYNTHETIC_EMAIL_DOMAIN } from "./isolation-guard.mjs";
import {
  BridgeClient,
  BridgeHost,
  PROTOCOL,
  ServiceError,
  createLaerligTaskService,
} from "../../adventure-engine/packages/learning-bridge/src/index.ts";

assertIsolated(process.env);

const SUPA = process.env.ISOLATED_SUPABASE_URL.replace(/\/+$/, "");
const ANON = process.env.ISOLATED_SUPABASE_ANON_KEY;
const SERVICE = process.env.ISOLATED_SUPABASE_SERVICE_KEY;
const RUN = (process.env.GITHUB_RUN_ID || "local") + "-" + (process.env.GITHUB_RUN_ATTEMPT || "1");
const svc = { apikey: SERVICE, authorization: `Bearer ${SERVICE}` };
const GAME_ORIGIN = "http://127.0.0.1:4321";
const HOST_ORIGIN = "http://127.0.0.1:4320";
const CHECK = { objectiveId: "hist.besaettelsen.h4", purpose: "check", surface: "world", contextKey: "arkivskab" };

test.describe.configure({ mode: "serial" });

/** One synthetic pupil: grade 8, the teacher's domain filter set to world_war_2 (subject targeting). */
async function makePupil(request, name) {
  const email = `lv-${name}-${RUN}@${SYNTHETIC_EMAIL_DOMAIN}`;
  const password = createHash("sha256").update(`isolated-lv:${name}:${RUN}`).digest("base64url");
  const created = await request.post(`${SUPA}/auth/v1/admin/users`, { headers: svc, data: { email, password, email_confirm: true } });
  expect(created.status(), "local Auth must create the synthetic pupil").toBe(200);
  const id = (await created.json()).id;
  const profile = await request.post(`${SUPA}/rest/v1/profiles`, {
    headers: { ...svc, "content-type": "application/json", prefer: "return=minimal" },
    data: { id, role: "student", full_name: `Syntetisk Lærligverse-elev ${name}`, selected_grade: 8, active_domains: ["world_war_2"], equipped_slots: {}, active_theme: "default" },
  });
  expect(profile.status(), await profile.text()).toBe(201);
  const signIn = await request.post(`${SUPA}/auth/v1/token?grant_type=password`, { headers: { apikey: ANON }, data: { email, password } });
  expect(signIn.status()).toBe(200);
  return { id, token: (await signIn.json()).access_token };
}

// ── Database oracle (service key; the bridge never has it) ─────────────────────────────────────────
const progress = async (request, pupil) =>
  (await (await request.get(`${SUPA}/rest/v1/student_progress?select=xp,coins,correct_answers&student_id=eq.${pupil.id}`, { headers: svc })).json())[0] ?? { xp: 0, coins: 0, correct_answers: 0 };
const instances = async (request, pupil) =>
  await (await request.get(`${SUPA}/rest/v1/question_instances?select=id,answered,was_correct,user_answer,correct_answer,question_id&student_id=eq.${pupil.id}&order=created_at`, { headers: svc })).json();
const questionOf = async (request, questionId) =>
  (await (await request.get(`${SUPA}/rest/v1/questions?select=content,learning_objective,target_grade&id=eq.${questionId}`, { headers: svc })).json())[0];

/**
 * The pupil's authenticated Edge Function caller, as the host page would hold it. `faults` lets a test
 * lose a request BEFORE it is sent, or lose the RESPONSE AFTER the server has processed it.
 */
function edgeCaller(request, pupil, faults = []) {
  const log = [];
  const call = async (fn, body) => {
    const fault = fn === "process-event" ? faults.shift() : undefined;
    if (fault === "before") {
      log.push({ fn, sent: false });
      throw new TypeError("network down before the request");
    }
    const res = await request.post(`${SUPA}/functions/v1/${fn}`, { headers: { apikey: ANON, authorization: `Bearer ${pupil.token}` }, data: body });
    const parsed = await res.json().catch(() => null);
    log.push({ fn, sent: true, status: res.status() });
    if (fault === "after") throw new TypeError("connection lost after the server answered");
    if (fault === "hang") return new Promise(() => {}); // processed, but the response never arrives
    return { status: res.status(), body: parsed };
  };
  return { call, log };
}

/** Host and game wired like two windows (origin + source + structured clone), host backed by the REAL service. */
function world(service, hostOptions = {}) {
  const hostWin = { w: "host" };
  const gameWin = { w: "game" };
  const toGame = [];
  const rejects = [];
  const ctx = {};
  let n = 0;
  const randomId = () => `${RUN.replace(/[^A-Za-z0-9]/g, "")}x${(++n).toString(36)}`;
  ctx.host = new BridgeHost({
    gameOrigin: GAME_ORIGIN, gameWindow: gameWin, service, randomId,
    retryDelaysMs: [100, 200, 400], callTimeoutMs: 20_000,
    post: (m) => { toGame.push(m); const data = structuredClone(m); queueMicrotask(() => ctx.client.onMessage({ origin: HOST_ORIGIN, source: hostWin, data })); },
    onReject: (r) => rejects.push(r),
    ...hostOptions,
  });
  ctx.client = new BridgeClient({
    hostOrigin: HOST_ORIGIN, hostWindow: hostWin, randomId, kinds: ["choice", "short_text"], contentId: "arkivskabet", contentVersion: "0_1_0",
    post: (m) => { const data = structuredClone(m); queueMicrotask(() => void ctx.host.onMessage({ origin: GAME_ORIGIN, source: gameWin, data })); },
  });
  const raw = (data, origin = GAME_ORIGIN, source = gameWin) => ctx.host.onMessage({ origin, source, data: structuredClone(data) });
  return { host: ctx.host, client: ctx.client, toGame, rejects, raw };
}

const flag = { laerligverseBackend: true };
const service = (request, pupil, faults) => {
  const caller = edgeCaller(request, pupil, faults);
  return { svc: createLaerligTaskService(flag, { call: caller.call, subject: "historie" }), log: caller.log };
};

/** The option id the game would have to choose for the right / a wrong answer — looked up server-side. */
async function optionFor(request, pupil, task, wantCorrect) {
  const rows = await instances(request, pupil);
  const row = rows.at(-1);
  const opts = task.stimulus.options;
  const key = row.correct_answer;
  const match = opts.find((o) => (o.label === key) === wantCorrect);
  expect(match, "the served options contain the key exactly once").toBeTruthy();
  return match.id;
}

let A, B;

test.beforeAll(async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "backend path: once per run");
  A = await makePupil(request, "a");
  B = await makePupil(request, "b");
});

test("a real backend question comes through the bridge: subject-targeted, whitelisted, no key, no instance id", async ({ request }) => {
  const { svc: s } = service(request, A);
  const w = world(s);
  expect(await w.client.connect()).toBeNull();
  const task = await w.client.requestTask(CHECK);
  expect(task.kind).toBe("choice");
  expect(task.mode).toBe("quiz_v1");
  expect(task.hintsAvailable).toBe(0);
  expect(task.stimulus.prompt).toMatch(/^Syntetisk spørgsmål G8-world_war_2-/);
  const rows = await instances(request, A);
  expect(rows).toHaveLength(1);
  expect(rows[0].answered).toBe(false);
  const q = await questionOf(request, rows[0].question_id);
  expect(q.learning_objective).toBe("world_war_2");
  // What crossed the bridge: no instance uuid, no key field, no review text, no question id.
  const seen = JSON.stringify(w.toGame);
  for (const secret of [rows[0].id, rows[0].question_id, q.content.review_text, "correct_answer", "accepted_answers"]) expect(seen).not.toContain(secret);
});

test("a correct answer is graded by process-event, recorded once, rewarded once (10 XP, 5 coins)", async ({ request }) => {
  const { svc: s, log } = service(request, A);
  const w = world(s);
  await w.client.connect();
  const task = await w.client.requestTask(CHECK); // the open instance from the previous test is served again
  expect((await instances(request, A))).toHaveLength(1);
  const before = await progress(request, A);
  const r = await w.client.act(task.instanceToken, { kind: "choice", payload: { optionId: await optionFor(request, A, task, true) } });
  expect(r).toMatchObject({ outcome: "correct", evidence: "none", retryable: false });
  expect(r.feedback.correctAnswer).toBe((await instances(request, A))[0].correct_answer);
  expect(await instances(request, A)).toMatchObject([{ answered: true, was_correct: true }]);
  expect(await progress(request, A)).toEqual({ xp: before.xp + 10, coins: before.coins + 5, correct_answers: before.correct_answers + 1 });
  expect(log.filter((l) => l.fn === "process-event")).toHaveLength(1);
});

test("a wrong answer is graded incorrect, pays nothing; the key arrives only with the verdict; a NEW task follows", async ({ request }) => {
  const { svc: s } = service(request, A);
  const w = world(s);
  await w.client.connect();
  const task = await w.client.requestTask(CHECK);
  const rows = await instances(request, A);
  expect(rows).toHaveLength(2); // a new instance: the first one is closed
  expect(JSON.stringify(w.toGame)).not.toContain(`"correctAnswer":"${rows[1].correct_answer}"`);
  const before = await progress(request, A);
  const r = await w.client.act(task.instanceToken, { kind: "choice", payload: { optionId: await optionFor(request, A, task, false) } });
  expect(r.outcome).toBe("incorrect");
  expect(r.feedback.correctAnswer).toBe(rows[1].correct_answer);
  expect(r.feedback.text).toContain("Det rigtige svar er");
  expect((await instances(request, A))[1]).toMatchObject({ answered: true, was_correct: false });
  expect(await progress(request, A)).toEqual(before);
  const next = await w.client.requestTask(CHECK);
  expect(next.stimulus.prompt).not.toBe(task.stimulus.prompt);
});

test("duplicates: a replayed postMessage, a double click and two racing commits make ONE server call and ONE reward", async ({ request }) => {
  const { svc: s, log } = service(request, A);
  const w = world(s);
  await w.client.connect();
  const task = await w.client.requestTask(CHECK); // the open instance from the previous test
  const optionId = await optionFor(request, A, task, true);
  const before = await progress(request, A);
  const msg = { protocol: PROTOCOL, type: "task.action", nonce: w.host.sessionNonce, requestId: `dup${RUN.replace(/\W/g, "")}`, instanceToken: task.instanceToken, action: { kind: "choice", payload: { optionId } }, clientSeq: 1 };
  await Promise.all([w.raw(msg), w.raw(msg), w.raw(msg), w.client.act(task.instanceToken, msg.action), w.client.act(task.instanceToken, msg.action)]);
  await expect.poll(() => w.toGame.filter((m) => m.type === "task.result").length).toBeGreaterThanOrEqual(3);
  for (let i = 0; i < 3; i++) await w.raw(msg); // replays after the verdict
  expect(log.filter((l) => l.fn === "process-event")).toHaveLength(1);
  expect(await progress(request, A)).toEqual({ xp: before.xp + 10, coins: before.coins + 5, correct_answers: before.correct_answers + 1 });
  expect(new Set(w.toGame.filter((m) => m.type === "task.result").map((m) => m.outcome))).toEqual(new Set(["correct"]));
});

test("the SERVER guarantee itself: two simultaneous process-event calls on one instance pay once", async ({ request }) => {
  const { svc: s } = service(request, B);
  const w = world(s);
  await w.client.connect();
  const task = await w.client.requestTask(CHECK);
  const row = (await instances(request, B)).at(-1);
  const before = await progress(request, B);
  const hit = () => request.post(`${SUPA}/functions/v1/process-event`, { headers: { apikey: ANON, authorization: `Bearer ${B.token}` }, data: { question_instance_id: row.id, answer: row.correct_answer, question_shown_at: Date.now() } });
  const res = await Promise.all([hit(), hit(), hit(), hit()]);
  for (const r of res) expect(r.status()).toBe(200);
  expect(await progress(request, B)).toEqual({ xp: before.xp + 10, coins: before.coins + 5, correct_answers: before.correct_answers + 1 });
  void task;
});

test("network lost BEFORE the request: retried, recorded once", async ({ request }) => {
  const { svc: s, log } = service(request, A, ["before"]);
  const w = world(s);
  await w.client.connect();
  const task = await w.client.requestTask(CHECK);
  const before = await progress(request, A);
  const r = await w.client.act(task.instanceToken, { kind: "choice", payload: { optionId: await optionFor(request, A, task, true) } });
  expect(r.outcome).toBe("correct");
  expect(log.filter((l) => l.fn === "process-event").map((l) => l.sent)).toEqual([false, true]);
  expect(await progress(request, A)).toEqual({ xp: before.xp + 10, coins: before.coins + 5, correct_answers: before.correct_answers + 1 });
});

test("response lost AFTER the server recorded an INCORRECT answer: the retry recovers the ORIGINAL verdict, nothing twice", async ({ request }) => {
  const { svc: s, log } = service(request, A, ["after"]);
  const w = world(s);
  await w.client.connect();
  const task = await w.client.requestTask(CHECK);
  const before = await progress(request, A);
  const r = await w.client.act(task.instanceToken, { kind: "choice", payload: { optionId: await optionFor(request, A, task, false) } });
  expect(r.outcome).toBe("incorrect");
  const pe = log.filter((l) => l.fn === "process-event");
  expect(pe).toHaveLength(2);
  expect(pe.every((l) => l.sent && l.status === 200)).toBe(true);
  expect((await instances(request, A)).at(-1)).toMatchObject({ answered: true, was_correct: false });
  expect(await progress(request, A)).toEqual(before);
});

test("response never arrives (timeout) after a CORRECT answer was recorded: retry returns it, paid once", async ({ request }) => {
  const { svc: s, log } = service(request, A, ["hang"]);
  const w = world(s, { callTimeoutMs: 4000 });
  await w.client.connect();
  const task = await w.client.requestTask(CHECK);
  const before = await progress(request, A);
  const r = await w.client.act(task.instanceToken, { kind: "choice", payload: { optionId: await optionFor(request, A, task, true) } });
  expect(r.outcome).toBe("correct");
  expect(log.filter((l) => l.fn === "process-event")).toHaveLength(2);
  expect(await progress(request, A)).toEqual({ xp: before.xp + 10, coins: before.coins + 5, correct_answers: before.correct_answers + 1 });
});

test("game reload before the commit resumes the SAME server instance (init.openTask); no new instance", async ({ request }) => {
  const { svc: s } = service(request, A);
  const w = world(s);
  await w.client.connect();
  const task = await w.client.requestTask(CHECK);
  const count = (await instances(request, A)).length;
  const resumed = await w.client.connect(); // a reloaded iframe says hello again
  expect(resumed?.instanceToken).toBe(task.instanceToken);
  expect((await instances(request, A)).length).toBe(count);
  // A HOST reload loses the host's memory, but the server serves the open instance first.
  const fresh = world(service(request, A).svc);
  await fresh.client.connect();
  const again = await fresh.client.requestTask(CHECK);
  expect(again.stimulus.prompt).toBe(task.stimulus.prompt);
  expect((await instances(request, A)).length).toBe(count);
  const r = await fresh.client.act(again.instanceToken, { kind: "choice", payload: { optionId: await optionFor(request, A, again, true) } });
  expect(r.outcome).toBe("correct");
});

test("security: forged origin, wrong window, wrong nonce, unknown token, manipulated option, reward messages — no server effect", async ({ request }) => {
  const { svc: s, log } = service(request, A);
  const w = world(s);
  await w.client.connect();
  const task = await w.client.requestTask(CHECK);
  const before = await progress(request, A);
  const rows = await instances(request, A);
  const good = { protocol: PROTOCOL, type: "task.action", nonce: w.host.sessionNonce, requestId: "sec1", instanceToken: task.instanceToken, action: { kind: "choice", payload: { optionId: "o1" } }, clientSeq: 1 };
  await w.raw(good, "https://evil.example");
  await w.raw({ ...good, requestId: "sec2" }, GAME_ORIGIN, { w: "other" });
  await w.raw({ ...good, requestId: "sec3", nonce: "forged" });
  expect(w.rejects).toEqual(["origin", "source", "nonce"]);
  // The instance uuid itself (as if leaked) is not a token the host issued.
  await expect(w.client.act(rows.at(-1).id, good.action)).rejects.toMatchObject({ code: "unknown_task" });
  await expect(w.client.act(task.instanceToken, { kind: "choice", payload: { optionId: "o99" } })).rejects.toMatchObject({ code: "invalid_message" });
  await expect(w.client.act(task.instanceToken, { kind: "short_text", payload: { text: rows.at(-1).correct_answer } })).rejects.toMatchObject({ code: "kind_mismatch" });
  for (const forged of [{ protocol: PROTOCOL, type: "reward.grant", xp: 999, coins: 999 }, { ...good, requestId: "sec4", xp: 999 }, { ...good, requestId: "sec5", evidence: "evidence" }]) await w.raw(forged);
  await expect(w.client.hint(task.instanceToken, 1)).rejects.toMatchObject({ code: "hint_unavailable" });
  expect(log.filter((l) => l.fn === "process-event")).toHaveLength(0);
  expect(await progress(request, A)).toEqual(before);
  expect((await instances(request, A)).at(-1).answered).toBe(false);
});

test("another pupil's instance is refused by the server (403), and pays nothing", async ({ request }) => {
  const row = (await instances(request, A)).at(-1); // A's open instance
  expect(row.answered).toBe(false);
  const before = await progress(request, B);
  const res = await request.post(`${SUPA}/functions/v1/process-event`, { headers: { apikey: ANON, authorization: `Bearer ${B.token}` }, data: { question_instance_id: row.id, answer: row.correct_answer, question_shown_at: Date.now() } });
  expect(res.status()).toBe(403);
  expect((await instances(request, A)).at(-1).answered).toBe(false);
  expect(await progress(request, B)).toEqual(before);
});

test("expired session / logout while the game is open: session_expired, nothing recorded, no automatic resend", async ({ request }) => {
  const pupil = { ...A };
  const { svc: s, log } = service(request, pupil);
  const w = world(s);
  await w.client.connect();
  const task = await w.client.requestTask(CHECK);
  const before = await progress(request, A);
  const out = await request.post(`${SUPA}/auth/v1/logout?scope=global`, { headers: { apikey: ANON, authorization: `Bearer ${A.token}` } });
  expect([200, 204]).toContain(out.status());
  pupil.token = "expired.session.token";
  await expect(w.client.act(task.instanceToken, { kind: "choice", payload: { optionId: "o1" } })).rejects.toMatchObject({ code: "session_expired" });
  expect(log.filter((l) => l.fn === "process-event").map((l) => l.status)).toEqual([401]);
  expect((await instances(request, A)).at(-1).answered).toBe(false);
  expect(await progress(request, A)).toEqual(before);
  // get-next-question reports a bad session as 500 {error:"Unauthorized"}; the adapter maps it the same way.
  const fresh = world(service(request, pupil).svc);
  await fresh.client.connect();
  await expect(fresh.client.requestTask(CHECK)).rejects.toMatchObject({ code: "session_expired" });
});

test("the integration cannot be built without the flag", () => {
  expect(() => createLaerligTaskService({ laerligverseBackend: false }, { call: async () => ({ status: 200, body: {} }), subject: "historie" })).toThrow(/disabled/);
  expect(ServiceError).toBeTruthy();
});
