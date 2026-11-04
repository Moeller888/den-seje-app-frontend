// D-110: the isolated E2E database's schema is built from the repository — CI baseline, CI function
// stubs, then the replay plan — and the build is fail-closed. Runs the REAL engine
// (tests/isolated/schema/replay.mjs) on PGlite with a minimal platform stub; the CI job runs the same
// engine on the Supabase local stack (PostgreSQL 17) through psql.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { replaySchema, baselineSql, stubsSql, migrationFiles, readMigration } from "../isolated/schema/replay.mjs";
import { planReplay, SCHEMA_PART, extractSchemaPart, MANUALLY_APPLIED_IN_PRODUCTION, preconditionCheckSql } from "../isolated/schema/replay-plan.mjs";
import { bootstrapMarkerSql } from "../isolated/seed/seed-guard.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PLATFORM = readFileSync(join(ROOT, "tests", "isolated", "schema", "pglite-platform.sql"), "utf8");
const TOKEN = "0123456789abcdef0123456789abcdef";

async function platformDb() {
  const db = new PGlite();
  await db.exec(PLATFORM);
  await db.exec(bootstrapMarkerSql(TOKEN));
  return db;
}
const executor = (db) => ({ exec: (s) => db.exec(s), query: async (s) => (await db.query(s)).rows });
const one = async (db, sql) => (await db.query(sql)).rows[0];

let db, result;
before(async () => {
  db = await platformDb();
  result = await replaySchema(executor(db));
});

test("the full replay succeeds: baseline, stubs and every planned migration apply with no failure", () => {
  assert.deepEqual(result.failures, []);
  const names = result.steps.map((s) => s.name);
  assert.equal(names[0], "(ci-baseline.sql)");
  assert.equal(names[1], "(ci-function-stubs.sql)");
  assert.ok(names.includes("prestige.sql"));
  assert.ok(names.indexOf("prestige.sql") === names.indexOf("20260519000300_leaderboard.sql") - 1, "prestige.sql right before its anchor");
  assert.equal(names.at(-1), "(question-row filter off)");
  const applied = result.plan.filter((p) => p.action === "apply").length;
  assert.equal(result.steps.length, applied + 2 + 1 + result.manual.length + 1);
});

test("the replayed schema has production's key objects", async () => {
  for (const rel of ["profiles", "questions", "question_instances", "student_progress", "avatar_generation_jobs", "titles", "weekly_quests"]) {
    assert.ok((await one(db, `SELECT to_regclass('public.${rel}') IS NOT NULL AS ok`)).ok, rel);
  }
  // 20261027120000 (D-211) replaced process_question_attempt only because the schema part of
  // 20261018143726 left exactly production's body (its md5 guard): the chain is byte-faithful.
  // 20261031194600 (D-280 part 1, applied as remote 20261101101401 on 2026-11-01) then replaced it
  // again, behind its own md5 guard. 20261101150000 (D-290 G1, applied as remote 20261102064630 on
  // 2026-11-02) replaced it once more; this is the body production reported after that.
  const pqa = await one(db, `SELECT md5(prosrc) m FROM pg_proc WHERE oid = 'public.process_question_attempt(uuid,uuid,text,bigint)'::regprocedure`);
  assert.equal(pqa.m, "2e05e769a102f61ffef0ea4dd550c55b");
  // 20261101140000's schema part (D-290 G2, applied as remote 20261102071826 on 2026-11-02): the
  // open-round guard exactly as production reported it — body, SECURITY DEFINER, search_path, no API
  // EXECUTE — and its trigger.
  const g2 = await one(db, `SELECT md5(p.prosrc) m, p.prosecdef s, p.proconfig c, p.proacl::text[] a
    FROM pg_proc p WHERE p.oid = 'public.guard_open_round_requires_active_question()'::regprocedure`);
  assert.deepEqual(g2, { m: "e5627de108be67869a4615490a6857a2", s: true, c: ['search_path=""'], a: ["postgres=X/postgres"] });
  const g2t = await one(db, `SELECT pg_get_triggerdef(t.oid) d FROM pg_trigger t WHERE t.tgname = 'open_round_requires_active_question'
    AND t.tgrelid = 'public.question_instances'::regclass`);
  assert.match(g2t.d, /BEFORE INSERT OR UPDATE OF answered, question_id ON public\.question_instances FOR EACH ROW EXECUTE FUNCTION/);
  // 20261101170000 (D-292, applied as remote 20261102073618 on 2026-11-02): grant_achievement_rewards
  // claims before it pays. NOT the old body production had before (63b8347d…, pays twice under
  // overlapping calls), and no EXECUTE for PUBLIC or anon — exactly as production reported it.
  const gar = await one(db, `SELECT md5(p.prosrc) m, p.prosecdef s, p.proconfig c, p.proacl::text[] a,
      (SELECT count(*)::int FROM pg_proc q WHERE q.proname = 'grant_achievement_rewards') n,
      has_function_privilege('anon', p.oid, 'EXECUTE') anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') auth,
      has_function_privilege('service_role', p.oid, 'EXECUTE') svc
    FROM pg_proc p WHERE p.oid = 'public.grant_achievement_rewards(text[])'::regprocedure`);
  // 20261102100000 (D-316, applied as remote 20261102123618 on 2026-11-02): release_open_question_outside
  // also releases an open round on an inactive question, with the history guard — the body production
  // reported after the application.
  const rel = await one(db, `SELECT md5(prosrc) m FROM pg_proc WHERE oid = 'public.release_open_question_outside(text[])'::regprocedure`);
  assert.equal(rel.m, "b80c1c7857ecc90bdbd7b6175b65c78f");
  // 20261101210000 (D-298 H2, applied as remote 20261102182750 on 2026-11-02): the answer history cannot
  // be deleted with its question — both foreign keys to questions are ON DELETE RESTRICT.
  const h2 = (await db.query(`SELECT conrelid::regclass::text AS t, pg_get_constraintdef(oid) AS d FROM pg_constraint
    WHERE contype = 'f' AND confrelid = 'public.questions'::regclass ORDER BY 1`)).rows;
  assert.deepEqual(h2, [
    { t: "question_instances", d: "FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE RESTRICT" },
    { t: "student_answers", d: "FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE RESTRICT" },
  ]);
  // 20261101190000 (H5 bootstrap, applied as remote 20261104095423 on 2026-11-04): the H5 schema exists,
  // process_text_answer_v2 is for service_role only and the round guard is on question_instances.
  // 20261101190100 (H5 alignment, applied as remote 20261104140659 on 2026-11-04):
  // process_question_attempt_v2 has the aligned grading (D-280 and G1), and service_role alone may call it.
  const h5 = await one(db, `SELECT to_regclass('public.question_attempts') IS NOT NULL t,
      (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)')) mc,
      has_function_privilege('service_role', 'public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)', 'EXECUTE') mc_svc,
      has_function_privilege('authenticated', 'public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)', 'EXECUTE') mc_auth,
      has_function_privilege('service_role', 'public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text)', 'EXECUTE') text_svc,
      has_function_privilege('authenticated', 'public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text)', 'EXECUTE') text_auth,
      EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'question_instances_round_guard' AND tgrelid = 'public.question_instances'::regclass) guard`);
  assert.deepEqual(h5, { t: true, mc: "8a7696147df978e250918b2c93e20577", mc_svc: true, mc_auth: false, text_svc: true, text_auth: false, guard: true });
  // 20261027160000 (D-237, applied as remote 20261104155040 on 2026-11-04): no relation in public grants
  // TRUNCATE or MAINTAIN to anon or authenticated, as in production; service_role keeps them.
  const d237 = await db.query(`SELECT c.relname, r.role, p.priv FROM pg_class c
      CROSS JOIN (VALUES ('anon'), ('authenticated')) r(role) CROSS JOIN (VALUES ('TRUNCATE'), ('MAINTAIN')) p(priv)
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'v', 'm', 'p')
      AND has_table_privilege(r.role, c.oid, p.priv) ORDER BY 1, 2, 3`);
  assert.deepEqual(d237.rows, [], "no API role holds TRUNCATE or MAINTAIN in public");
  assert.equal((await one(db, `SELECT has_table_privilege('service_role', 'public.profiles', 'TRUNCATE') t`)).t, true);
  // 20261103100000 (D-327, applied as remote 20261104163310 on 2026-11-04): an H5 attempt cannot vanish
  // with its instance — question_attempts_instance_fkey is ON DELETE NO ACTION, not deferrable; the
  // account key stays ON DELETE CASCADE.
  const d327 = await db.query(`SELECT conname, pg_get_constraintdef(oid) d, condeferrable def FROM pg_constraint
    WHERE conrelid = 'public.question_attempts'::regclass AND contype = 'f' ORDER BY conname`);
  assert.deepEqual(d327.rows, [
    { conname: "question_attempts_instance_fkey", d: "FOREIGN KEY (question_instance_id, student_id) REFERENCES question_instances(id, student_id)", def: false },
    { conname: "question_attempts_student_id_fkey", d: "FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE", def: false },
  ]);
  assert.notEqual(gar.m, "63b8347dd4d72d40ced43e8728b5ab87", "the replay must not carry the old, double-paying body");
  assert.deepEqual(gar, { m: "fc8d729f8b0166815fe2647805ce2e60", s: true, c: ["search_path=public"],
    a: ["postgres=X/postgres", "authenticated=X/postgres", "service_role=X/postgres"], n: 1, anon: false, auth: true, svc: true });
  // 20260826000000's schema part: 'cancelled' is a valid job status.
  const chk = await one(db, `SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conname = 'generation_jobs_status_valid'`);
  assert.match(chk.d, /cancelled/);
  // 20261020120000 (A) is applied in production (remote 20261030045204). The md5 is the body
  // production reported on 2026-10-30.
  const lvl = await one(db, `SELECT md5(prosrc) m FROM pg_proc WHERE oid = 'public.difficulty_level_from_grade_band(integer,integer)'::regprocedure`);
  assert.equal(lvl.m, "3c6504217ad747cbdbda4d1482ccd6fb");
  assert.ok((await one(db, `SELECT to_regclass('public.student_subject_level') IS NOT NULL AS ok`)).ok, "student_subject_level");
  assert.ok((await one(db, `SELECT to_regclass('public.idx_questions_objective_level') IS NOT NULL AS ok`)).ok, "idx_questions_objective_level");
});

test("B as production has it: fold log, indexes, the three functions, INVOKER, ACL, RLS — and no rows", async () => {
  // 20261029120000 (B) is applied in production (remote 20261030094958). The md5s are the bodies
  // production reported on 2026-10-30.
  const fold = await one(db, `SELECT c.relrowsecurity rls, c.relacl::text acl,
                                (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) policies
                              FROM pg_class c WHERE c.oid = 'public.student_level_fold_log'::regclass`);
  assert.equal(fold.rls, true);
  assert.equal(fold.policies, 0);
  assert.equal(fold.acl, "{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}");
  const idx = async (name) => (await one(db, `SELECT pg_get_indexdef(to_regclass('public.${name}')) d`)).d;
  assert.equal(await idx("student_level_fold_log_pkey"), "CREATE UNIQUE INDEX student_level_fold_log_pkey ON public.student_level_fold_log USING btree (question_instance_id)");
  assert.equal(await idx("idx_student_level_fold_log_student"), "CREATE INDEX idx_student_level_fold_log_student ON public.student_level_fold_log USING btree (student_id, subject, folded_at)");
  assert.equal(await idx("idx_qi_student_answered"), "CREATE INDEX idx_qi_student_answered ON public.question_instances USING btree (student_id, answered_at, id) WHERE answered");
  const fns = (await db.query(`SELECT p.proname, md5(p.prosrc) m, p.prosecdef, p.proconfig::text cfg, p.proacl::text acl,
                                 has_function_privilege('public', p.oid, 'EXECUTE') pub,
                                 has_function_privilege('anon', p.oid, 'EXECUTE') anon,
                                 has_function_privilege('authenticated', p.oid, 'EXECUTE') auth,
                                 has_function_privilege('service_role', p.oid, 'EXECUTE') svc
                               FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
                                 AND p.proname IN ('advance_student_level', 'get_level_questions_for_student', 'request_repeat_level_question_for_student')
                               ORDER BY p.proname`)).rows;
  assert.deepEqual(fns.map((f) => [f.proname, f.m]), [
    ["advance_student_level", "4147c559353946a64c3ea1c791d19635"],
    ["get_level_questions_for_student", "9e5862b287f6f41066eb876667c426a7"],
    // D-280 part 1 (20261031194600, remote 20261101101401) replaced it; production's body after that.
    ["request_repeat_level_question_for_student", "db8280ddee20254e876be7fb1fc57e4d"],
  ]);
  for (const f of fns) {
    assert.equal(f.prosecdef, false, `${f.proname} is SECURITY INVOKER`);
    assert.match(f.cfg, /search_path=public, pg_temp/, `${f.proname} pins search_path`);
    assert.equal(f.acl, "{postgres=X/postgres,service_role=X/postgres}", f.proname);
    assert.deepEqual([f.pub, f.anon, f.auth, f.svc], [false, false, false, true], f.proname);
  }
  // Applying the migrations writes no level: neither the pupil's level nor the fold log has a row.
  for (const t of ["student_subject_level", "student_level_fold_log"]) {
    assert.equal((await one(db, `SELECT count(*)::int n FROM public.${t}`)).n, 0, t);
  }
});

test("no real question row lands: the content filter was on for the whole replay and is gone afterwards", async () => {
  assert.equal((await one(db, "SELECT count(*)::int n FROM public.questions")).n, 0);
  assert.equal((await one(db, "SELECT count(*)::int n FROM pg_trigger WHERE tgname = 'isolated_ci_discard_question_rows'")).n, 0);
});

test("review_answer stubs: production's signatures, EXECUTE for service_role only after the lockdown", async () => {
  for (const sig of ["public.review_answer(uuid,integer,text,uuid)", "public.review_answer(uuid,integer,text)"]) {
    const f = await one(db, `SELECT prosecdef, proconfig::text c FROM pg_proc WHERE oid = '${sig}'::regprocedure`);
    assert.equal(f.prosecdef, true, sig);
    assert.match(f.c, /search_path=public, pg_temp/);
    for (const [role, want] of [["anon", false], ["authenticated", false], ["service_role", true]]) {
      assert.equal((await one(db, `SELECT has_function_privilege('${role}', '${sig}', 'EXECUTE') x`)).x, want, `${sig} ${role}`);
    }
  }
});

// Stub behaviour, on a fresh database each (success AND failure paths).
async function stubDb() {
  const d = await platformDb();
  await d.exec(baselineSql());
  await d.exec(stubsSql());
  await d.exec(`INSERT INTO auth.users (id, email) VALUES
    ('00000000-0000-4000-8000-000000000001', 'pupil@e2e.invalid'),
    ('00000000-0000-4000-8000-000000000002', 'teacher@e2e.invalid');`);
  return d;
}
const P = "00000000-0000-4000-8000-000000000001", T = "00000000-0000-4000-8000-000000000002";

test("ensure_student_progress stub: a pupil gets one progress row with table defaults; a teacher gets none", async () => {
  const d = await stubDb();
  await d.exec(`INSERT INTO public.profiles (id, role) VALUES ('${P}', 'student'), ('${T}', 'teacher')`);
  const rows = (await d.query("SELECT student_id, xp, coins, level FROM public.student_progress")).rows;
  assert.deepEqual(rows, [{ student_id: P, xp: 0, coins: 0, level: 1 }]);
  // A second profile insert for the same id fails on the profile's own key, never duplicates progress.
  await assert.rejects(d.exec(`INSERT INTO public.profiles (id, role) VALUES ('${P}', 'student')`), /duplicate key/);
  assert.equal((await one(d, "SELECT count(*)::int n FROM public.student_progress")).n, 1);
});

async function withInstance() {
  const d = await stubDb();
  await d.exec(`INSERT INTO public.profiles (id, role) VALUES ('${P}', 'student');
    INSERT INTO public.questions (id, type, content, difficulty, question_type, answer_format, learning_objective, is_active)
      VALUES ('00000000-0000-4000-8000-0000000000aa', 'open', '{"question":"q","correct":"a","type":"text"}', 1, 'open', 'text', 'x', false);
    INSERT INTO public.question_instances (id, student_id, question_id, correct_answer, difficulty_at_time, mastery_snapshot)
      VALUES ('00000000-0000-4000-8000-0000000000bb', '${P}', '00000000-0000-4000-8000-0000000000aa', 'a', 1, 1);`);
  return d;
}
const I = "00000000-0000-4000-8000-0000000000bb";

test("review_answer(4) stub: records the review; an unknown instance raises (the Edge Function answers 500)", async () => {
  const d = await withInstance();
  await d.exec(`SELECT public.review_answer('${I}', 3, 'godt', '${T}')`);
  const r = await one(d, `SELECT teacher_score, teacher_feedback, reviewed_by, reviewed_at IS NOT NULL AS at FROM public.question_instances WHERE id = '${I}'`);
  assert.deepEqual(r, { teacher_score: 3, teacher_feedback: "godt", reviewed_by: T, at: true });
  await assert.rejects(d.exec(`SELECT public.review_answer('00000000-0000-4000-8000-0000000000cc', 3, 'x', '${T}')`), /Instance not found/);
  // No XP effect inside the stub (documented gap): progress unchanged.
  assert.equal((await one(d, `SELECT xp FROM public.student_progress WHERE student_id = '${P}'`)).xp, 0);
});

test("review_answer(3) stub: no caller → Unauthorized; first review ok; second → already_reviewed, unchanged", async () => {
  const d = await withInstance();
  await assert.rejects(d.exec(`SELECT public.review_answer('${I}', 2, 'x')`), /Unauthorized/);
  await d.exec(`SELECT set_config('request.jwt.claim.sub', '${T}', false)`);
  assert.deepEqual((await one(d, `SELECT public.review_answer('${I}', 2, 'første') r`)).r, { status: "ok" });
  assert.deepEqual((await one(d, `SELECT public.review_answer('${I}', 4, 'anden') r`)).r, { status: "already_reviewed" });
  const r = await one(d, `SELECT teacher_score, teacher_feedback, reviewed_by FROM public.question_instances WHERE id = '${I}'`);
  assert.deepEqual(r, { teacher_score: 2, teacher_feedback: "første", reviewed_by: T });
});

// ── Fail-closed engine ───────────────────────────────────────────────────────────────────────────
const fakeFiles = (extra) => {
  const files = migrationFiles();
  const sql = new Map(files.map((f) => [f, null]));
  for (const [f, s] of Object.entries(extra)) sql.set(f, s);
  return { files: [...sql.keys()], readSql: (f) => (sql.get(f) ?? readMigration(f)) };
};

test("fail-closed: one failing statement in any applied migration fails the replay and names the file", async () => {
  const d = await platformDb();
  const bad = "20991231000000_ci_broken.sql";
  const { files, readSql } = fakeFiles({ [bad]: "ALTER TABLE public.no_such_table ADD COLUMN x int;" });
  const r = await replaySchema({ ...executor(d), files, readSql });
  assert.deepEqual(r.failures.map((f) => f.name), [bad]);
  assert.match(r.failures[0].error, /no_such_table/);
});

test("fail-closed: a broken baseline stops the replay before any migration", async () => {
  const d = await platformDb();
  await d.exec("CREATE TABLE public.questions (id int)"); // the baseline's CREATE TABLE now collides
  const r = await replaySchema(executor(d));
  assert.equal(r.failures.length, 1);
  assert.equal(r.failures[0].name, "(ci-baseline.sql)");
  assert.equal(r.steps.length, 1);
});

test("fail-closed: without the stubs the lockdown's precondition check reports both review_answer overloads missing", async () => {
  const d = await platformDb();
  await d.exec(baselineSql());
  const missing = (await d.query(preconditionCheckSql("20260919000000_review_answer_execute_lockdown.sql"))).rows.map((x) => x.missing);
  assert.deepEqual(missing.sort(), ["public.review_answer(uuid,integer,text)", "public.review_answer(uuid,integer,text,uuid)"]);
  await d.exec(stubsSql());
  assert.deepEqual((await d.query(preconditionCheckSql("20260919000000_review_answer_execute_lockdown.sql"))).rows, []);
});

test("SCHEMA_PART: markers occur exactly once; the applied part is the schema statement, verbatim from the file", () => {
  for (const [file, part] of Object.entries(SCHEMA_PART)) {
    const sql = readMigration(file);
    const got = extractSchemaPart(file, sql);
    assert.ok(sql.includes(got.trim().replace(/;$/, "")), file);
    assert.match(got.replace(/--[^\n]*/g, "").trim(), /^(CREATE OR REPLACE FUNCTION|CREATE FUNCTION|alter table|CREATE TABLE IF NOT EXISTS)/i, file);
    if (file === "20261101140000_deactivate_two_misgraded_questions.sql") {
      // D-290 G2: only the guard — never the DO block that deactivates production's two questions.
      assert.doesNotMatch(got, /\bDO \$|UPDATE public\.questions|is_active = false/i, `${file}: no data part`);
      assert.match(got, /CREATE TRIGGER open_round_requires_active_question/, `${file}: the trigger`);
    }
    assert.doesNotMatch(got, /\bfrom public\.avatar_generation_jobs\b|_d107_targets/i, `${file}: no data part`);
    if (file === "20261029170000_mc_grading_compensation.sql") {
      // D-254: only the locked table — never the DO block that writes student_progress and the audit rows.
      assert.doesNotMatch(got, /\bDO \$|\bstudent_progress\b|\bINSERT\s+INTO\b/i, `${file}: no data part`);
      assert.match(got, /REVOKE ALL ON TABLE public\.progress_corrections FROM PUBLIC, anon, authenticated, service_role;/, `${file}: lockdown`);
    }
    assert.throws(() => extractSchemaPart(file, sql + "\n" + part.start), /exactly once/);
  }
});

test("manual files have an anchor that is an applied migration", () => {
  const { plan } = planReplay(migrationFiles(), readMigration);
  for (const [f, m] of Object.entries(MANUALLY_APPLIED_IN_PRODUCTION)) {
    assert.ok(plan.some((p) => p.file === m.before && p.action === "apply"), `${f} → ${m.before}`);
    assert.ok(m.reason.length > 20);
  }
});

test("the public baseline is sanitised: no function body, row data, address, key, token or URL", () => {
  const sql = baselineSql();
  const code = sql.replace(/--[^\n]*/g, "");
  assert.doesNotMatch(code, /CREATE (OR REPLACE )?FUNCTION|\$function\$|\$\$/i, "no function body");
  assert.doesNotMatch(code, /\bINSERT\s+INTO\b|\bCOPY\b|\bUPDATE\s+public\.\w+\s+SET\b/i, "no rows");
  assert.doesNotMatch(sql, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, "no e-mail address");
  assert.doesNotMatch(sql, /https?:\/\//, "no URL");
  assert.doesNotMatch(sql, /eyJ[A-Za-z0-9_-]{10,}|sb_(publishable|secret)_|service_role_key/i, "no key or token");
  assert.doesNotMatch(sql, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, "no uuid literal");
  assert.doesNotMatch(sql, /tjzbehwfagiwpwodsgwg|lærlig|xn--lrlig/i, "no production identifier");
});

test("the stubs file carries no production body: every stub is short and declares what it does not prove", () => {
  const sql = stubsSql();
  assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/g) || []).length, 3);
  assert.equal((sql.match(/^--\s+NOT:/gm) || []).length, 3, "each stub documents its gap");
  assert.doesNotMatch(sql, /🔥|xp \+ v_xp_gain|coalesce\(coins/i, "not production's text");
});

test("catalog data files write only to catalog tables (plus the one documented profiles UPDATE)", async () => {
  const { CATALOG_DATA, CATALOG_TABLES } = await import("../isolated/schema/replay-plan.mjs");
  for (const f of Object.keys(CATALOG_DATA)) {
    const sql = readMigration(f).replace(/--[^\n]*/g, "");
    const writes = [...sql.matchAll(/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?"?([a-z_]+)"?/gi)].map((m) => m[2].toLowerCase());
    assert.ok(writes.length > 0, `${f} writes something`);
    for (const t of writes) {
      const ok = CATALOG_TABLES.includes(t) || (f === "20260521000001_wings_to_back_slot.sql" && t === "profiles");
      assert.ok(ok, `${f} writes ${t}`);
    }
    assert.doesNotMatch(sql, /\bDELETE\b|\bTRUNCATE\b/i, `${f} deletes nothing`);
  }
});

// The replay CLI runs assertSeedTarget BEFORE the schema exists (public.questions absent).
const GUARD_ENV = Object.freeze({
  ISOLATED_E2E: "1", ISOLATED_BASE_URL: "http://127.0.0.1:8788", ISOLATED_SUPABASE_URL: "http://127.0.0.1:54321",
  ISOLATED_DB_TOKEN: TOKEN,
});

test("target check before the schema: an empty public schema with this run's marker passes", async () => {
  const { assertSeedTarget } = await import("../isolated/seed/seed-guard.mjs");
  const d = await platformDb();
  const r = await assertSeedTarget({ query: async (s) => (await d.query(s)).rows, env: GUARD_ENV });
  assert.deepEqual(r, { ok: true, questions: 0, users: 0 });
});

test("target check before the schema: public with tables but no questions table is refused, nothing executed", async () => {
  const { assertSeedTarget } = await import("../isolated/seed/seed-guard.mjs");
  const d = await platformDb();
  await d.exec("CREATE TABLE public.some_real_table (id int)");
  await assert.rejects(assertSeedTarget({ query: async (s) => (await d.query(s)).rows, env: GUARD_ENV }), /public has tables but no questions table/);
});

// Owner decision 2026-10-28 (option B): the repository's request-password-help depends on
// public.reserve_password_help, so the isolated schema carries the REAL migration (not a stub) —
// recorded as repository-ahead-of-production drift. Its behaviour, on synthetic rows.
test("reserve_password_help: the real migration is replayed, as drift, and locked to service_role", async () => {
  const p = result.plan.find((s) => s.file === "20260808010000_password_help_reserve_rpc.sql");
  assert.equal(p.action, "apply");
  assert.match(p.reason, /repository ahead of production/);
  const src = readFileSync(join(ROOT, "supabase", "migrations", "20260808010000_password_help_reserve_rpc.sql"), "utf8");
  const f = await one(db, `SELECT prosrc FROM pg_proc WHERE oid = 'public.reserve_password_help(uuid,uuid,integer,integer)'::regprocedure`);
  assert.ok(src.includes(f.prosrc.trim()), "the replayed body is the migration's own");
  for (const [role, want] of [["anon", false], ["authenticated", false], ["service_role", true]]) {
    assert.equal((await one(db, `SELECT has_function_privilege('${role}', 'public.reserve_password_help(uuid,uuid,integer,integer)', 'EXECUTE') x`)).x, want, role);
  }
});

test("reserve_password_help: reservation, cooldown, daily cap — each audited — and refused bad input", async () => {
  const pupil = "00000000-0000-4000-8000-00000000a001", teacher = "00000000-0000-4000-8000-00000000a002";
  await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${pupil}', 'ph-pupil@e2e.invalid'), ('${teacher}', 'ph-teacher@e2e.invalid')`);
  const reserve = (cool, cap) => one(db, `SELECT decision, request_id FROM public.reserve_password_help('${pupil}', '${teacher}', ${cool}, ${cap})`);
  const rows = async () => (await db.query(`SELECT status, failure_reason FROM public.password_help_requests WHERE student_id = '${pupil}' ORDER BY created_at, id`)).rows;

  const first = await reserve(60, 3);
  assert.equal(first.decision, "reserved");
  assert.ok(first.request_id);
  assert.equal((await reserve(60, 3)).decision, "suppressed_cooldown", "a second request inside the cooldown");
  assert.equal((await reserve(0, 1)).decision, "suppressed_daily_cap", "the reservation counts against the cap");
  const audit = await rows();
  assert.deepEqual(audit.map((r) => r.status).sort(), ["reserved", "suppressed_cooldown", "suppressed_daily_cap"]);
  assert.ok(audit.some((r) => r.failure_reason === "cooldown_60m"));
  assert.ok(audit.some((r) => r.failure_reason === "cap_1_per_24h"));

  // Suppressions are audit facts, not attempts: with cooldown 0 the budget still has room.
  assert.equal((await reserve(0, 3)).decision, "reserved");

  await assert.rejects(db.query(`SELECT * FROM public.reserve_password_help(NULL, '${teacher}', 60, 3)`), /student id is required/);
  await assert.rejects(db.query(`SELECT * FROM public.reserve_password_help('${pupil}', '${teacher}', -1, 3)`), /invalid rate-limit parameters/);
  await assert.rejects(db.query(`SELECT * FROM public.reserve_password_help('${pupil}', '${teacher}', 60, 0)`), /invalid rate-limit parameters/);
  assert.equal((await rows()).length, 4, "a refused call writes nothing");
});

// The replayed state — H5 PR 1 (20261030211428, replayed by owner decision), D-280 part 1, G1, G2's guard,
// the H5 bootstrap and the H5 alignment, as production has them since 2026-11-04 — ends with the aligned
// _v2. A second run of the alignment changes nothing (rolled back, so no other test sees it), and a second
// run of the bootstrap is refused (it only accepts the pre-alignment _v2) and changes nothing.
test("the replay ends with H5 aligned: a second alignment run changes nothing, a second bootstrap run is refused", async () => {
  const V2 = "public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)";
  const state = () => one(db, `SELECT md5(prosrc) m, proacl::text acl FROM pg_proc WHERE oid = '${V2}'::regprocedure`);
  const before = await state();
  assert.deepEqual(before, { m: "8a7696147df978e250918b2c93e20577", acl: "{postgres=X/postgres,service_role=X/postgres}" },
    "the replay applied the alignment: G1's grading, EXECUTE for service_role only");
  await db.exec("BEGIN");
  try {
    await db.exec(readMigration("20261101190100_question_attempts_v2_align_grading.sql"));
    assert.deepEqual(await state(), before, "a second alignment run changes nothing");
  } finally {
    await db.exec("ROLLBACK");
  }
  await assert.rejects(db.exec(readMigration("20261101190000_question_attempts_v2_bootstrap.sql")),
    /H5 bootstrap: public\.process_question_attempt_v2\(uuid,uuid,text,integer,uuid,text,text\) har ikke den forventede krop/);
  assert.deepEqual(await state(), before, "the refused bootstrap changed nothing");
});
