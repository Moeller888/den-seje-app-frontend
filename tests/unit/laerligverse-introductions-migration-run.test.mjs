// RUNTIME proof for the LP-13 / K9 prototype migration 20261110043500_laerligverse_introductions (PGlite, full isolated
// replay, file UNMODIFIED): the introduction as a server step WITHOUT an answer key.
//
// Proves: the content can never carry an answer-like key and a version is immutable; one active introduction per
// objective; serve_introduction (none / served / resumed / completed, a refresh resumes the SAME round);
// complete_introduction and mark_introduction_presented are set once, in server time, never before served, idempotent
// on the request id (replay) and never moved by another id (already_*); another pupil's round is not_found; the trigger
// refuses every direct way around it; no client privilege at all (RLS on, 42501 as anon/authenticated); an open
// introduction never blocks the quiz (it is not a question_instances row); the introduction text is the approved
// intro-content.ts verbatim and contains none of the sequence's answers.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { replaySchema, readMigration } from "../isolated/schema/replay.mjs";
import { NOT_IN_PRODUCTION, planReplay } from "../isolated/schema/replay-plan.mjs";
import { bootstrapMarkerSql } from "../isolated/seed/seed-guard.mjs";
import { INTRO_CARDS } from "../../adventure-engine/packages/archive-prototype/src/intro-content.ts";
import { decideIntroduction, publicIntroduction } from "../../supabase/functions/_shared/introduction.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = "20261110043500_laerligverse_introductions.sql";
const FIXTURE = JSON.parse(readFileSync(join(ROOT, "tests", "isolated", "fixtures", "kildekritik-introduction.json"), "utf8"));
const ITEMS = JSON.parse(readFileSync(join(ROOT, "tests", "isolated", "fixtures", "kildekritik-questions.json"), "utf8"));

let db;
let rerunSame;
before(async () => {
  db = new PGlite();
  await db.exec(readFileSync(join(ROOT, "tests", "isolated", "schema", "pglite-platform.sql"), "utf8"));
  await db.exec(bootstrapMarkerSql("0123456789abcdef0123456789abcdef"));
  const r = await replaySchema({ exec: (s) => db.exec(s), query: async (s) => (await db.query(s)).rows });
  assert.deepEqual(r.failures, []);
  await db.exec(readMigration(FILE));
  const snap = async () => JSON.stringify((await db.query(`SELECT proname, md5(prosrc), proacl::text FROM pg_proc WHERE proname LIKE '%introduction%' ORDER BY 1`)).rows);
  const s1 = await snap();
  await db.exec(readMigration(FILE));
  rerunSame = s1 === (await snap());
  await db.query(`INSERT INTO public.learning_introductions (learning_objective, content) VALUES ($1, $2::jsonb)`, [FIXTURE.learning_objective, JSON.stringify(FIXTURE.content)]);
});

const code = async (p) => { try { await p; return null; } catch (e) { return e.code ?? String(e.message); } };
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
async function pupil() {
  const id = randomUUID();
  await db.query(`INSERT INTO auth.users (id) VALUES ($1)`, [id]);
  return id;
}
async function as(role, sql, params = [], sub = null) {
  await db.exec(`SET ROLE ${role}`);
  if (sub) await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [sub]);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("RESET ROLE"); await db.exec(`SELECT set_config('request.jwt.claim.sub', '', false)`); }
}
const svc = async (sql, params) => (await as("service_role", sql, params))[0].r;
const serveIntro = (p, objective = FIXTURE.learning_objective) => svc(`SELECT public.serve_introduction($1, $2) AS r`, [p, objective]);
const complete = (p, round, rid) => svc(`SELECT public.complete_introduction($1, $2, $3) AS r`, [p, round, rid]);
const present = (p, round, rid) => svc(`SELECT public.mark_introduction_presented($1, $2, $3) AS r`, [p, round, rid]);

test("the file: unique version, NOT_IN_PRODUCTION, one DO block, D-110 header; a re-run changes nothing", () => {
  const files = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
  assert.equal(files.filter((f) => f.slice(0, 14) === FILE.slice(0, 14)).length, 1);
  assert.match(NOT_IN_PRODUCTION[FILE] ?? "", /not applied in production/);
  assert.equal(planReplay(files, readMigration).plan.find((p) => p.file === FILE).action, "skip");
  const sql = readMigration(FILE);
  assert.match(sql, /NOT APPLIED IN PRODUCTION\. Applying it needs a separate owner authorisation/);
  const body = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim();
  assert.ok(body.startsWith("DO $intro$") && body.endsWith("$intro$;"));
  assert.equal(rerunSame, true);
});

test("content: the approved intro-content.ts cards verbatim, and none of the sequence's answers, details, hints or reviews", () => {
  assert.deepEqual(FIXTURE.content.cards, INTRO_CARDS.map((c) => ({ title: c.title, text: c.text })));
  assert.deepEqual(publicIntroduction(FIXTURE.content), { cards: FIXTURE.content.cards });
  const payload = JSON.stringify(publicIntroduction(FIXTURE.content));
  for (const item of ITEMS) {
    const secrets = [item.content.correct, ...(item.content.accepted_answers ?? []), ...(item.content.option_details ?? []), item.content.review_text, ...(item.content.hints ?? [])];
    for (const s of secrets.filter((x) => typeof x === "string" && x.length > 0)) assert.equal(payload.includes(s), false, `${item.tag}: ${s.slice(0, 40)}`);
  }
});

test("an introduction can never carry an answer-like key; a version is immutable; one active per objective", async () => {
  for (const key of ["correct", "correct_answer", "accepted_answers", "options", "option_details", "hints", "review_text", "pairs", "items", "categories"]) {
    assert.equal(await code(db.query(`INSERT INTO public.learning_introductions (learning_objective, content) VALUES ('x_${key}', $1::jsonb)`,
      [JSON.stringify({ cards: [{ title: "t", text: "x" }], [key]: "a" })])), "23514", key);
  }
  assert.equal(await code(db.query(`INSERT INTO public.learning_introductions (learning_objective, content) VALUES ('x_nocards', '{"text":"x"}')`)), "23514");
  assert.equal(await code(db.query(`UPDATE public.learning_introductions SET content = '{"cards":[{"title":"t","text":"y"}]}' WHERE learning_objective = $1`, [FIXTURE.learning_objective])), "23514");
  assert.equal(await code(db.query(`INSERT INTO public.learning_introductions (learning_objective, version, content) VALUES ($1, 2, $2::jsonb)`,
    [FIXTURE.learning_objective, JSON.stringify(FIXTURE.content)])), "23505", "a second ACTIVE version");
  assert.match((await one(`SELECT content_sha256 FROM public.learning_introductions WHERE learning_objective = $1`, [FIXTURE.learning_objective])).content_sha256, /^[0-9a-f]{64}$/);
});

test("serve: none for an objective without one; served once, a refresh resumes the SAME round; completed → the sequence continues", async () => {
  const p = await pupil();
  assert.deepEqual(await serveIntro(p, "no_such_objective"), { outcome: "none" });
  const a = await serveIntro(p);
  assert.equal(a.outcome, "served");
  assert.ok(decideIntroduction(a).kind === "show");
  const b = await serveIntro(p);
  assert.equal(b.outcome, "resumed");
  assert.equal(b.round_id, a.round_id);
  assert.equal(b.served_at, a.served_at, "a refresh never re-serves");
  assert.equal((await one(`SELECT count(*)::int c FROM public.introduction_rounds WHERE student_id = $1`, [p])).c, 1);
  const rid = randomUUID();
  assert.equal((await complete(p, a.round_id, rid)).outcome, "recorded");
  const c = await serveIntro(p);
  assert.equal(c.outcome, "completed");
  assert.deepEqual(decideIntroduction(c), { kind: "continue" });
  assert.equal("content" in c, false, "a completed introduction is not served again");
});

test("complete / present: set once in server time, idempotent per request id, never moved by another id, foreign → not_found", async () => {
  const p = await pupil();
  const other = await pupil();
  const { round_id } = await serveIntro(p);
  const served = (await one(`SELECT served_at FROM public.introduction_rounds WHERE id = $1`, [round_id])).served_at;
  assert.deepEqual(await complete(other, round_id, randomUUID()), { outcome: "not_found" });
  assert.deepEqual(await present(other, round_id, randomUUID()), { outcome: "not_found" });
  const pr = randomUUID();
  const p1 = await present(p, round_id, pr);
  assert.equal(p1.outcome, "recorded");
  assert.deepEqual(await present(p, round_id, pr), { ...p1, outcome: "replay" });
  assert.deepEqual(await present(p, round_id, randomUUID()), { ...p1, outcome: "already_recorded" });
  const cr = randomUUID();
  const c1 = await complete(p, round_id, cr);
  assert.equal(c1.outcome, "recorded");
  assert.deepEqual(await complete(p, round_id, cr), { ...c1, outcome: "replay" }, "a retry or refresh gives the same result");
  assert.deepEqual(await complete(p, round_id, randomUUID()), { ...c1, outcome: "already_completed" });
  const row = await one(`SELECT served_at, presented_at, completed_at FROM public.introduction_rounds WHERE id = $1`, [round_id]);
  assert.ok(row.presented_at >= served && row.completed_at >= served, "never before served");
  assert.deepEqual(await complete(p, randomUUID(), randomUUID()), { outcome: "not_found" });
  assert.deepEqual(await complete(null, round_id, randomUUID()), { outcome: "invalid_request", reason: "missing_identity" });
});

test("the trigger refuses every direct way around it; insert always starts served-only", async () => {
  const p = await pupil();
  const { round_id } = await serveIntro(p);
  for (const set of ["served_at = now() - interval '1 day'", "student_id = gen_random_uuid()", "content_sha256 = 'x'",
    `completed_at = now() + interval '1 hour', completion_request_id = '${randomUUID()}'`]) {
    assert.ok(await code(db.query(`UPDATE public.introduction_rounds SET ${set} WHERE id = $1`, [round_id])), set);
  }
  assert.equal(await code(db.query(`UPDATE public.introduction_rounds SET completed_at = now() WHERE id = $1`, [round_id])), "23514", "time without a request id");
  await complete(p, round_id, randomUUID());
  assert.ok(await code(db.query(`UPDATE public.introduction_rounds SET completed_at = now(), completion_request_id = $2 WHERE id = $1`, [round_id, randomUUID()])), "set once");
  const p2 = await pupil();
  const intro = (await one(`SELECT id, content_sha256 FROM public.learning_introductions WHERE learning_objective = $1`, [FIXTURE.learning_objective]));
  const r = await one(`INSERT INTO public.introduction_rounds (student_id, introduction_id, content_sha256, served_at, completed_at, completion_request_id)
    VALUES ($1, $2, $3, now() - interval '1 day', now(), $4) RETURNING served_at > now() - interval '1 minute' AS fresh, completed_at`, [p2, intro.id, intro.content_sha256, randomUUID()]);
  assert.deepEqual(r, { fresh: true, completed_at: null }, "an insert can never arrive completed or back-dated");
});

test("no client privilege: anon/authenticated can neither read nor write the tables nor call the functions; RLS on; INVOKER", async () => {
  const p = await pupil();
  const { round_id } = await serveIntro(p);
  for (const role of ["anon", "authenticated"]) {
    for (const [sql, args] of [
      [`SELECT * FROM public.learning_introductions`, []], [`SELECT * FROM public.introduction_rounds`, []],
      [`UPDATE public.introduction_rounds SET completed_at = now() WHERE id = $1`, [round_id]],
      [`SELECT public.complete_introduction($1, $2, $3)`, [p, round_id, randomUUID()]],
      [`SELECT public.serve_introduction($1, 'x')`, [p]],
      [`SELECT public.mark_introduction_presented($1, $2, $3)`, [p, round_id, randomUUID()]],
    ]) assert.equal(await code(as(role, sql, args, p)), "42501", `${role}: ${sql}`);
  }
  const rows = (await db.query(`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('learning_introductions','introduction_rounds') ORDER BY 1`)).rows;
  assert.deepEqual(rows.map((r) => r.relrowsecurity), [true, true]);
  const definers = (await db.query(`SELECT proname FROM pg_proc WHERE proname IN ('serve_introduction','complete_introduction','mark_introduction_presented','introduction_rounds_guard','learning_introductions_guard') AND prosecdef`)).rows;
  assert.deepEqual(definers, []);
});

test("an open introduction never blocks the quiz: it is not a question_instances round, and no grading path names the tables", async () => {
  const p = await pupil();
  await db.query(`INSERT INTO public.profiles (id, role, selected_grade) VALUES ($1, 'student', 7)`, [p]);
  await serveIntro(p);
  const q = (await one(`INSERT INTO public.questions (type, content, difficulty, is_active, question_type, learning_objective, answer_format, answer_type, metadata, target_grade)
    VALUES ('mc', '{"question":"intro-block?","options":["a","b"],"correct":"a"}', 1, true, 'auto', 'test_intro', 'mc', 'short', '{}', 7) RETURNING id`)).id;
  await db.query(`INSERT INTO public.question_instances (student_id, question_id, correct_answer, difficulty_at_time, mastery_snapshot) VALUES ($1, $2, 'a', 1, 1)`, [p, q]);
  const readers = (await db.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public'
    AND (p.prosrc ILIKE '%introduction_rounds%' OR p.prosrc ILIKE '%learning_introductions%') ORDER BY 1`)).rows.map((r) => r.proname);
  // Only the three functions and the two guards (which name the tables in their messages) — no grading path.
  assert.deepEqual(readers, ["complete_introduction", "introduction_rounds_guard", "learning_introductions_guard", "mark_introduction_presented", "serve_introduction"]);
});
