// RUNTIME proof for migration 20261111120000_review_answer_single_payout (model B: adjustable postings),
// single session (PGlite, in-process). The simultaneous-call proof is
// review-answer-single-payout-concurrency.test.mjs (real PostgreSQL in CI).
//
// Fixture: production's state, read-only catalog 2026-11-11 — review_answer(uuid,integer,text,uuid) with
// production's EXACT body (prosrc, base64, md5 310f72f4… asserted), SECURITY DEFINER, search_path public,
// pg_temp, EXECUTE service_role only; the 3-argument overload with the isolated replay's stub body. Synthetic
// users only.
//
// Cases: negative control (production's body pays on every call, also for an MC answer); the guard refuses an
// unreviewed body and changes nothing; first review pays the score's amount; the same review again pays
// nothing; a correction up pays the difference, down takes it back, back again restores it — the postings
// always sum to the current score's amount; auto-graded / unanswered / question-less instances post nothing;
// a review from before the migration is recognised as paid (legacy baseline), corrections from there move
// only the difference; an invalid score is refused before any write; a missing progress row and a correction
// below 0 XP raise and leave nothing behind; the ledger is append-only even for the owner; signature /
// SECURITY DEFINER / search_path / ACL; the 3-argument overload is unchanged; the ledger is closed to the
// API roles; a re-run is accepted.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PROD_BODY, PROD_FUNCTION } from "../support/review-answer-prod-preimage.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const FILE = "supabase/migrations/20261111120000_review_answer_single_payout.sql";
const PROD_MD5 = "310f72f44b3720c25e24a4d14307a3df";
const NEW_MD5 = "f0ac2d912b94b958360ca99a9d0a1028";
const SIG4 = "public.review_answer(uuid,integer,text,uuid)";
const SIG3 = "public.review_answer(uuid,integer,text)";

// The isolated replay's 3-argument stub (tests/isolated/schema/ci-function-stubs.sql), with production's grants.
function stubFunctions() {
  const src = read("tests/isolated/schema/ci-function-stubs.sql");
  const at = (sig) => {
    const start = src.indexOf(`CREATE OR REPLACE FUNCTION public.review_answer(${sig})`);
    assert.ok(start >= 0, sig);
    const a = src.indexOf("$$", start) + 2;
    const b = src.indexOf("$$", a);
    return src.slice(start, src.indexOf(";", b) + 1);
  };
  return {
    four: at("p_instance_id uuid, p_score integer, p_feedback text, p_teacher_id uuid"),
    three: at("p_instance_id uuid, p_score integer, p_feedback text"),
  };
}

const T = "00000000-0000-4000-8000-0000000000a1";       // teacher
const P1 = "00000000-0000-4000-8000-0000000000b1";      // pupil with progress
const P2 = "00000000-0000-4000-8000-0000000000b2";      // pupil WITHOUT a progress row
const Q_LONG = "00000000-0000-4000-8000-0000000000c1";  // answer_type long
const Q_MC = "00000000-0000-4000-8000-0000000000c2";    // short mc
const Q_TEXT = "00000000-0000-4000-8000-0000000000c3";  // short text
const Q_NUM = "00000000-0000-4000-8000-0000000000c4";   // short number
const i = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const FIXTURE = `
  CREATE ROLE anon NOLOGIN NOINHERIT NOBYPASSRLS;
  CREATE ROLE authenticated NOLOGIN NOINHERIT NOBYPASSRLS;
  CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE TABLE public.questions (id uuid PRIMARY KEY, answer_type text, answer_format text);
  CREATE TABLE public.question_instances (
    id uuid PRIMARY KEY, student_id uuid, question_id uuid REFERENCES public.questions(id),
    answered boolean DEFAULT false, user_answer text, was_correct boolean,
    teacher_score integer, teacher_feedback text, reviewed_at timestamp without time zone, reviewed_by uuid);
  CREATE TABLE public.student_progress (student_id uuid PRIMARY KEY, xp integer, coins integer, level integer);
  ALTER TABLE public.question_instances ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.student_progress ENABLE ROW LEVEL SECURITY;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
  INSERT INTO public.questions VALUES
    ('${Q_LONG}', 'long', 'text'), ('${Q_MC}', 'short', 'mc'), ('${Q_TEXT}', 'short', 'text'), ('${Q_NUM}', 'short', 'number');
  INSERT INTO public.student_progress VALUES ('${P1}', 95, 40, 1);
  INSERT INTO public.question_instances (id, student_id, question_id, answered, user_answer, was_correct, teacher_score) VALUES
    ('${i(1)}', '${P1}', '${Q_LONG}', false, 'Et langt svar med mange ord', NULL, NULL),  -- long, awaiting teacher
    ('${i(2)}', '${P1}', '${Q_MC}',   true,  'B', true,  NULL),                           -- MC, already paid
    ('${i(3)}', '${P1}', '${Q_TEXT}', true,  'hund', false, NULL),                        -- short text, auto-graded
    ('${i(4)}', '${P1}', '${Q_NUM}',  true,  '42', true, NULL),                           -- number, already paid
    ('${i(5)}', '${P1}', '${Q_LONG}', false, NULL, NULL, NULL),                           -- long, never answered
    ('${i(6)}', '${P1}', '${Q_LONG}', false, 'Bedømt før migrationen', NULL, 3),          -- reviewed before (3)
    ('${i(7)}', '${P1}', '${Q_LONG}', false, 'Et andet langt svar', NULL, NULL),          -- long, corrections
    ('${i(8)}', '${P1}', '${Q_TEXT}', true,  'pending tekst', NULL, NULL),                -- text pending (pqa)
    ('${i(9)}', '${P2}', '${Q_LONG}', false, 'Svar fra elev uden progress', NULL, NULL),  -- no progress row
    ('${i(10)}', '${P1}', '${Q_LONG}', false, '   ', NULL, NULL),                         -- blank answer
    ('${i(11)}', '${P1}', NULL,        false, 'Svar uden spørgsmål', NULL, NULL),         -- question missing
    ('${i(12)}', '${P1}', '${Q_LONG}', false, 'Bedømt 2 før migrationen', NULL, 2);       -- reviewed before (2)
`;

async function prodDb({ fourBody = PROD_FUNCTION } = {}) {
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(fourBody);
  await db.exec(stubFunctions().three);
  await db.exec(`REVOKE EXECUTE ON FUNCTION public.review_answer(uuid, integer, text) FROM PUBLIC;
                 GRANT EXECUTE ON FUNCTION public.review_answer(uuid, integer, text) TO service_role;`);
  return db;
}
const one = async (db, sql, params) => (await db.query(sql, params)).rows[0];
const xp = async (db, id = P1) => (await one(db, "SELECT xp, level FROM public.student_progress WHERE student_id = $1", [id]));
const review = async (db, inst, score, fb = "fb") =>
  (await one(db, "SELECT public.review_answer($1, $2, $3, $4) AS r", [inst, score, fb, T])).r;
const md5Of = async (db, sig) => (await one(db, `SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = to_regprocedure('${sig}')`))?.m ?? null;
const meta = async (db, sig) => one(db, `SELECT pg_get_function_result(oid) AS result, prosecdef, proconfig,
  proacl::text AS acl, pg_get_userbyid(proowner) AS owner FROM pg_proc WHERE oid = to_regprocedure('${sig}')`);
const postings = async (db, inst) => (await db.query(
  `SELECT question_instance_id, student_id, teacher_id, kind, previous_score, score, xp_delta, coins_delta, entitled_xp, applied
   FROM public.teacher_review_postings ${inst ? "WHERE question_instance_id = $1" : ""} ORDER BY id`, inst ? [inst] : [])).rows;
const sumFor = async (db, inst) => Number((await one(db,
  "SELECT coalesce(sum(xp_delta), 0) AS s FROM public.teacher_review_postings WHERE question_instance_id = $1", [inst])).s);
const XP_FOR = { 1: 0, 2: 10, 3: 25, 4: 50 };
const R = (status, xp_awarded) => ({ status, xp_awarded, coins_awarded: 0 });

test("fixture: production's body is reproduced byte for byte (md5(prosrc) 310f72f4…)", async () => {
  assert.equal(createHash("md5").update(PROD_BODY, "utf8").digest("hex"), PROD_MD5);
  const db = await prodDb();
  assert.equal(await md5Of(db, SIG4), PROD_MD5);
  const m = await meta(db, SIG4);
  assert.equal(m.result, "void");
  assert.equal(m.prosecdef, true);
});

test("NEGATIVE CONTROL: production's body pays on every call, also for an already-paid MC answer", async () => {
  const db = await prodDb();
  await review(db, i(1), 3);
  await review(db, i(1), 3);
  assert.equal((await xp(db)).xp, 95 + 25 + 25, "a re-review pays again");
  await review(db, i(2), 4);
  assert.equal((await xp(db)).xp, 95 + 25 + 25 + 50, "an MC answer is paid again");
});

test("the guard refuses an unreviewed body and changes nothing", async () => {
  const db = await prodDb({ fourBody: stubFunctions().four });
  const before = await md5Of(db, SIG4);
  assert.notEqual(before, PROD_MD5);
  await assert.rejects(db.exec(read(FILE)), /unreviewed body/);
  assert.equal(await md5Of(db, SIG4), before, "the function is untouched");
  assert.equal((await one(db, "SELECT to_regclass('public.teacher_review_postings') AS t")).t, null, "no table created");
});

test("the guard refuses when the function is missing", async () => {
  const db = await prodDb();
  await db.exec("DROP FUNCTION public.review_answer(uuid, integer, text, uuid)");
  await assert.rejects(db.exec(read(FILE)), /unreviewed body \(md5 missing\)/);
});

async function migrated() {
  const db = await prodDb();
  const three = { md5: await md5Of(db, SIG3), meta: await meta(db, SIG3) };
  await db.exec(read(FILE));
  return { db, three };
}

test("after the migration: new body, same signature, SECURITY DEFINER, search_path '', service_role only", async () => {
  const { db, three } = await migrated();
  assert.equal(await md5Of(db, SIG4), NEW_MD5);
  const m = await meta(db, SIG4);
  assert.equal(m.result, "jsonb");
  assert.equal(m.prosecdef, true);
  assert.deepEqual(m.proconfig, ['search_path=""']);
  const grantees = m.acl.replace(/[{}]/g, "").split(",").map((e) => e.split("=")[0]).sort();
  assert.deepEqual(grantees, [m.owner, "service_role"], `ACL ${m.acl}`);
  assert.equal(await md5Of(db, SIG3), three.md5, "the 3-argument overload is untouched");
  assert.deepEqual(await meta(db, SIG3), three.meta);
  for (const role of ["anon", "authenticated"]) {
    for (const sig of [SIG4, SIG3]) {
      assert.equal((await one(db, `SELECT has_function_privilege('${role}', '${sig}', 'EXECUTE') AS ok`)).ok, false, `${role} ${sig}`);
    }
  }
  assert.equal((await one(db, `SELECT has_function_privilege('service_role', '${SIG4}', 'EXECUTE') AS ok`)).ok, true);
});

test("the ledger is closed to the API roles (RLS on, no grant except service_role SELECT)", async () => {
  const { db } = await migrated();
  const t = await one(db, "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.teacher_review_postings'::regclass");
  assert.equal(t.relrowsecurity, true);
  for (const role of ["anon", "authenticated"]) {
    for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      assert.equal((await one(db, `SELECT has_table_privilege('${role}', 'public.teacher_review_postings', '${priv}') AS ok`)).ok, false, `${role} ${priv}`);
    }
  }
  for (const priv of ["INSERT", "UPDATE", "DELETE"]) {
    assert.equal((await one(db, `SELECT has_table_privilege('service_role', 'public.teacher_review_postings', '${priv}') AS ok`)).ok, false, `service_role ${priv}`);
  }
  assert.equal((await one(db, "SELECT has_table_privilege('service_role', 'public.teacher_review_postings', 'SELECT') AS ok")).ok, true);
});

test("first review pays the score's amount once; the same review again (retry, double click) pays nothing", async () => {
  const { db } = await migrated();
  assert.deepEqual(await review(db, i(1), 3, "Godt"), R("rewarded", 25));
  assert.deepEqual(await xp(db), { xp: 120, level: 2 }, "XP + level formula unchanged: floor(120/100)+1");
  assert.deepEqual(await postings(db), [{ question_instance_id: i(1), student_id: P1, teacher_id: T, kind: "award",
    previous_score: null, score: 3, xp_delta: 25, coins_delta: 0, entitled_xp: 25, applied: true }]);
  for (let k = 0; k < 3; k++) assert.deepEqual(await review(db, i(1), 3, "Godt"), R("unchanged", 0));
  assert.deepEqual(await xp(db), { xp: 120, level: 2 }, "no second payout");
  assert.equal((await postings(db)).length, 1, "a repeated review writes no posting");
});

test("corrections: up pays the difference, down takes it back, back again restores it; history is kept", async () => {
  const { db } = await migrated();
  const steps = [[2, "rewarded", 10], [4, "adjusted", 40], [1, "adjusted", -50], [2, "adjusted", 10], [2, "unchanged", 0], [3, "adjusted", 15]];
  for (const [score, status, delta] of steps) {
    assert.deepEqual(await review(db, i(7), score), R(status, delta), `score ${score}`);
    assert.equal(await sumFor(db, i(7)), XP_FOR[score], `after ${score}: postings sum to the current score's amount`);
    assert.equal((await xp(db)).xp, 95 + XP_FOR[score], `after ${score}: the pupil holds exactly that amount`);
    const row = await one(db, "SELECT teacher_score FROM public.question_instances WHERE id = $1", [i(7)]);
    assert.equal(row.teacher_score, score);
  }
  const ledger = await postings(db, i(7));
  assert.deepEqual(ledger.map((p) => [p.kind, p.previous_score, p.score, p.xp_delta, p.entitled_xp]),
    [["award", null, 2, 10, 10], ["adjustment", 2, 4, 40, 50], ["adjustment", 4, 1, -50, 0],
     ["adjustment", 1, 2, 10, 10], ["adjustment", 2, 3, 15, 25]], "every change is one posting, none rewritten");
  assert.deepEqual(await xp(db), { xp: 120, level: 2 }, "level follows the formula, also after a correction down");
});

test("score 1 first: an 'award' posting of 0 XP settles the instance; a later 4 pays 50 as an adjustment", async () => {
  const { db } = await migrated();
  assert.deepEqual(await review(db, i(1), 1), R("rewarded", 0));
  assert.deepEqual(await xp(db), { xp: 95, level: 1 }, "progress not touched at 0 XP");
  assert.deepEqual(await review(db, i(1), 1), R("unchanged", 0));
  assert.deepEqual(await review(db, i(1), 4), R("adjusted", 50));
  assert.equal((await xp(db)).xp, 145);
});

test("auto-graded, unanswered, blank or question-less instances: the review is recorded, nothing is posted", async () => {
  const { db } = await migrated();
  for (const inst of [i(2), i(3), i(4), i(5), i(10), i(11)]) {
    for (const score of [4, 1, 4]) {
      assert.deepEqual(await review(db, inst, score), R("not_teacher_graded", 0), inst);
    }
    const r = await one(db, "SELECT teacher_score, reviewed_by FROM public.question_instances WHERE id = $1", [inst]);
    assert.deepEqual(r, { teacher_score: 4, reviewed_by: T }, `${inst}: the teacher's queue moves on`);
  }
  assert.deepEqual(await xp(db), { xp: 95, level: 1 }, "an already-paid MC answer is never paid again");
  assert.deepEqual(await postings(db), []);
});

test("the pending text format (process_question_attempt: was_correct NULL) is teacher-graded", async () => {
  const { db } = await migrated();
  assert.deepEqual(await review(db, i(8), 2), R("rewarded", 10));
  assert.equal((await xp(db)).xp, 105);
});

test("a review from before the migration is recognised as paid; corrections move only the difference", async () => {
  const db = await prodDb();
  const before = (await db.query("SELECT * FROM public.question_instances ORDER BY id")).rows;
  const progressBefore = (await db.query("SELECT * FROM public.student_progress ORDER BY student_id")).rows;
  await db.exec(read(FILE));
  assert.deepEqual((await db.query("SELECT * FROM public.question_instances ORDER BY id")).rows, before);
  assert.deepEqual((await db.query("SELECT * FROM public.student_progress ORDER BY student_id")).rows, progressBefore);
  assert.deepEqual(await postings(db), [], "the migration back-fills nothing");
  // Old score 3 (25 XP recognised): the same score again changes nothing, 4 pays the 25 difference.
  assert.deepEqual(await review(db, i(6), 3), R("unchanged", 0));
  assert.equal((await xp(db)).xp, 95);
  assert.deepEqual(await review(db, i(6), 4), R("adjusted", 25));
  assert.equal((await xp(db)).xp, 120);
  assert.deepEqual((await postings(db, i(6))).map((p) => [p.kind, p.score, p.xp_delta, p.entitled_xp, p.applied]),
    [["legacy_baseline", 3, 25, 25, false], ["adjustment", 4, 25, 50, true]]);
  // Old score 2 (10 recognised) corrected down to 1 takes back 10.
  assert.deepEqual(await review(db, i(12), 1), R("adjusted", -10));
  assert.equal((await xp(db)).xp, 110);
});

test("an invalid score is refused before anything is written", async () => {
  const { db } = await migrated();
  for (const bad of [0, 5, -1, null]) {
    await assert.rejects(review(db, i(1), bad), /Invalid score/, String(bad));
  }
  const r = await one(db, "SELECT teacher_score, reviewed_at FROM public.question_instances WHERE id = $1", [i(1)]);
  assert.deepEqual(r, { teacher_score: null, reviewed_at: null });
  assert.deepEqual(await postings(db), []);
});

test("partial failure: unknown instance, missing progress row and a correction below 0 XP raise and leave nothing behind", async () => {
  const { db } = await migrated();
  await assert.rejects(review(db, i(999), 4), /Instance not found/);
  await assert.rejects(review(db, i(9), 4), /student_progress missing/);
  const r = await one(db, "SELECT teacher_score, reviewed_at FROM public.question_instances WHERE id = $1", [i(9)]);
  assert.deepEqual(r, { teacher_score: null, reviewed_at: null }, "the failed review was rolled back");
  assert.deepEqual(await postings(db), [], "no posting for a rolled-back review");
  // XP lowered outside the ledger (nothing in production does this today): a correction down must not go below 0.
  await review(db, i(1), 4);
  await db.exec(`UPDATE public.student_progress SET xp = 10 WHERE student_id = '${P1}'`);
  await assert.rejects(review(db, i(1), 1), /XP negative/);
  assert.equal((await xp(db)).xp, 10, "XP unchanged");
  assert.equal((await one(db, "SELECT teacher_score FROM public.question_instances WHERE id = $1", [i(1)])).teacher_score, 4, "review rolled back");
  assert.equal((await postings(db, i(1))).length, 1, "posting rolled back");
});

test("the ledger is append-only, even for the table owner", async () => {
  const { db } = await migrated();
  await review(db, i(1), 4);
  await assert.rejects(db.exec("UPDATE public.teacher_review_postings SET xp_delta = 0"), /append-only/);
  await assert.rejects(db.exec("DELETE FROM public.teacher_review_postings"), /append-only/);
  assert.equal(await sumFor(db, i(1)), 50);
});

test("only service_role can call it; the API roles are refused", async () => {
  const { db } = await migrated();
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(review(db, i(1), 4), /permission denied/);
    await db.exec("RESET ROLE");
  }
  await db.exec("SET ROLE service_role");
  assert.equal((await review(db, i(1), 4)).status, "rewarded");
  await db.exec("RESET ROLE");
  assert.equal((await xp(db)).xp, 145);
});

test("re-running the migration is accepted and changes nothing", async () => {
  const { db } = await migrated();
  await review(db, i(1), 3);
  await db.exec(read(FILE));
  assert.equal(await md5Of(db, SIG4), NEW_MD5);
  assert.equal((await postings(db)).length, 1, "the ledger survives a re-run");
  assert.deepEqual(await review(db, i(1), 3), R("unchanged", 0));
  assert.deepEqual(await review(db, i(1), 4), R("adjusted", 25));
});
