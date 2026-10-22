// RUNTIME proof for migration 20261018170000_answer_keys_client_paths_lockdown (step B of keeping answer
// keys server-side — audit findings E1/E2, 2026-10-16). Both SQL files — step A
// (20261016160000_answer_keys_server_side_rpcs, live as remote 20261018095931) and this one — are executed
// UNMODIFIED against a real PostgreSQL (PGlite, in-process WebAssembly — no Docker, no network), on a
// fixture that reproduces the LIVE state read on 2026-10-18 (read-only D-110 audit):
//   * questions: RLS on, "allow read questions" FOR SELECT TO public USING (true), table privileges ALL
//     for anon and authenticated;
//   * question_instances: the full 22-column shape, RLS on, the pupil and teacher SELECT policies, and
//     TABLE-level SELECT/UPDATE/DELETE/TRUNCATE for anon and authenticated (so every column — the key
//     included — is readable by the row's owner);
//   * auth_profile_role() exactly as live; get_unserved_questions with EXECUTE for PUBLIC, anon,
//     authenticated and service_role; request_repeat_question with EXECUTE for authenticated and
//     service_role; process_question_attempt as live (backend only).
// Every role is exercised for real — anon, a pupil, a teacher, a super_admin and the backend — rather
// than reading policy text.
//
// HONEST LIMITS:
//   - PGlite is PostgreSQL 18.x; production is 17.6.
//   - auth.uid() reads `test.uid`. PostgREST is not in the loop: a client request is modelled as the
//     same SQL statement run as the caller's role with auth.uid() = the caller. A PostgREST embed
//     (question_instances?select=...,questions(content)) is modelled as the equivalent LEFT JOIN, which
//     PostgreSQL checks with the same table/column privileges and RLS.
//   - Passing here is not permission to apply. Applying needs its own owner authorisation (D-110), and
//     only after this PR's frontend (server-side placement) is live.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE_A = "20261016160000_answer_keys_server_side_rpcs.sql";
const FILE_B = "20261018170000_answer_keys_client_paths_lockdown.sql";
const MIGRATION_A = readFileSync(join(ROOT, "supabase", "migrations", FILE_A), "utf8");
const MIGRATION_B = readFileSync(join(ROOT, "supabase", "migrations", FILE_B), "utf8");

const T1 = "00000000-0000-4000-8000-0000000000a1";   // teacher of P1
const T2 = "00000000-0000-4000-8000-0000000000a2";   // another teacher (no pupils)
const SA = "00000000-0000-4000-8000-0000000000a9";   // super_admin
const P1 = "00000000-0000-4000-8000-000000000001";   // pupil (teacher T1), grade 7, unplaced
const P2 = "00000000-0000-4000-8000-000000000002";   // pupil (no teacher)

const QI_COLUMNS = ["id", "student_id", "question_id", "correct_answer", "difficulty_at_time", "mastery_snapshot",
  "created_at", "answered", "answered_at", "is_correct", "xp_awarded", "next_due", "next_review_at",
  "incorrect_attempts", "user_answer", "was_correct", "teacher_feedback", "teacher_score", "reviewed_at",
  "reviewed_by", "misconception_signal", "repeat_count"];
const CLIENT_READABLE = QI_COLUMNS.filter((c) => c !== "correct_answer");
const HISTORY = ["prehistoric_denmark", "vikings", "middle_ages", "reformation_monarchy", "enlightenment",
  "revolutions_democracy", "industrialisation", "world_war_1", "world_war_2", "cold_war", "democracy_power"];

// 12 placement-eligible history MC questions (bands 1x4, 2x4, 3x2, 4x2) + one "stav til" text question.
const HQ = [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4, 4].map((band, i) => {
  const n = String(i + 1).padStart(2, "0");
  return { id: `00000000-0000-4000-8000-0000000001${n}`, band, key: `Svar${n}`, lo: i % 2 ? "world_war_2" : "vikings" };
});
const Q_STAV = "00000000-0000-4000-8000-000000000203";
const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;
const mc = (id, key) => JSON.stringify({ question: `Spørgsmål ${id}?`, options: [key, "Forkert A", "Forkert B"],
  correct: key, accepted_answers: [key], review_text: `Det er ${key}.` });

const FIXTURE = `
  CREATE ROLE anon NOBYPASSRLS; CREATE ROLE authenticated NOBYPASSRLS; CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  INSERT INTO auth.users VALUES ('${T1}'), ('${T2}'), ('${SA}'), ('${P1}'), ('${P2}');

  CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text NOT NULL, teacher_id uuid, selected_grade smallint,
    active_domains text[], placement_band smallint, current_band smallint);
  INSERT INTO public.profiles (id, role, teacher_id, selected_grade) VALUES
    ('${T1}', 'teacher', NULL, NULL), ('${T2}', 'teacher', NULL, NULL), ('${SA}', 'super_admin', NULL, NULL),
    ('${P1}', 'student', '${T1}', 7), ('${P2}', 'student', NULL, 7);
  GRANT SELECT ON public.profiles TO anon, authenticated, service_role;

  -- LIVE auth_profile_role() (pg_get_functiondef, 2026-10-18); EXECUTE as live (default PUBLIC).
  CREATE FUNCTION public.auth_profile_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
    AS $function$ SELECT role FROM profiles WHERE id = auth.uid(); $function$;

  CREATE TABLE public.questions (id uuid PRIMARY KEY, content jsonb NOT NULL, answer_format text NOT NULL,
    answer_type text DEFAULT 'short', is_active boolean NOT NULL DEFAULT true, learning_objective text,
    target_grade smallint, difficulty_band smallint, metadata jsonb);
  ${HQ.map((q) => `INSERT INTO public.questions (id, content, answer_format, learning_objective, target_grade, difficulty_band)
    VALUES ('${q.id}', ${sqlStr(mc(q.id, q.key))}, 'mc', '${q.lo}', 7, ${q.band});`).join("\n  ")}
  INSERT INTO public.questions (id, content, answer_format, answer_type, learning_objective, target_grade, difficulty_band) VALUES
    ('${Q_STAV}', '{"question":"Stav til: landet?","correct":"Polen","accepted_answers":["Polen"]}', 'text', 'short', 'world_war_2', 7, 1);
  ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
  GRANT ALL ON public.questions TO anon, authenticated, service_role;
  CREATE POLICY "allow read questions" ON public.questions AS PERMISSIVE FOR SELECT TO public USING (true);

  CREATE TABLE public.student_progress (student_id uuid PRIMARY KEY, xp integer DEFAULT 0, coins integer DEFAULT 0,
    correct_answers integer DEFAULT 0, total_correct_answers integer DEFAULT 0);
  INSERT INTO public.student_progress (student_id) VALUES ('${P1}'), ('${P2}');
  GRANT ALL ON public.student_progress TO service_role;

  CREATE TABLE public.question_instances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    correct_answer text NOT NULL, difficulty_at_time integer NOT NULL DEFAULT 1, mastery_snapshot integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), answered boolean NOT NULL DEFAULT false, answered_at timestamptz,
    is_correct boolean, xp_awarded integer DEFAULT 0, next_due timestamptz, next_review_at timestamptz,
    incorrect_attempts integer DEFAULT 0, user_answer text, was_correct boolean, teacher_feedback text,
    teacher_score integer, reviewed_at timestamp, reviewed_by uuid, misconception_signal text,
    repeat_count integer NOT NULL DEFAULT 0
  );
  CREATE UNIQUE INDEX idx_student_question_instance ON public.question_instances (student_id, question_id);
  CREATE UNIQUE INDEX idx_one_open_question ON public.question_instances (student_id) WHERE (answered = false);
  ALTER TABLE public.question_instances ENABLE ROW LEVEL SECURITY;
  -- LIVE privileges (relacl 2026-10-18): anon/authenticated rwdDxtm — INSERT already revoked.
  GRANT SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.question_instances TO anon, authenticated;
  GRANT ALL ON public.question_instances TO service_role;
  CREATE POLICY "students read own question_instances" ON public.question_instances
    AS PERMISSIVE FOR SELECT TO authenticated USING (student_id = (SELECT auth.uid() AS uid));
  CREATE POLICY "teachers read own students question_instances" ON public.question_instances
    AS PERMISSIVE FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM profiles s
      WHERE s.id = question_instances.student_id AND s.teacher_id = (SELECT auth.uid() AS uid) AND s.role = 'student'));

  CREATE FUNCTION public.update_streak(uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION public.update_quest_progress_for_answer(uuid, boolean, integer) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION public.update_weekly_quest_progress_for_answer(uuid, boolean, integer) RETURNS void LANGUAGE sql AS $$ SELECT $$;

  -- LIVE get_unserved_questions; LIVE ACL includes PUBLIC.
  CREATE FUNCTION public.get_unserved_questions(p_grade smallint, p_domains text[])
   RETURNS TABLE(id uuid, content jsonb, answer_format text, answer_type text, metadata jsonb, difficulty_band integer)
   LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
    SELECT q.id, q.content, q.answer_format, q.answer_type, q.metadata, q.difficulty_band FROM questions q
    WHERE q.is_active = true AND (p_grade IS NULL OR q.target_grade IS NULL OR q.target_grade <= p_grade)
      AND (p_domains IS NULL OR q.learning_objective = ANY(p_domains))
      AND NOT EXISTS (SELECT 1 FROM question_instances qi WHERE qi.student_id = auth.uid() AND qi.question_id = q.id)
    LIMIT 50;
  $function$;
  GRANT EXECUTE ON FUNCTION public.get_unserved_questions(smallint, text[]) TO PUBLIC, anon, authenticated, service_role;

  -- LIVE request_repeat_question (minimal faithful body: the guards and the reopen).
  CREATE FUNCTION public.request_repeat_question(p_grade smallint, p_domains text[])
   RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  DECLARE v_uid uuid := (SELECT auth.uid()); v_instance_id uuid;
  BEGIN
    IF v_uid IS NULL THEN RETURN NULL; END IF;
    IF EXISTS (SELECT 1 FROM public.question_instances qi WHERE qi.student_id = v_uid AND qi.answered = false) THEN RETURN NULL; END IF;
    IF EXISTS (SELECT 1 FROM public.questions q WHERE q.is_active
        AND (p_grade IS NULL OR q.target_grade IS NULL OR q.target_grade <= p_grade)
        AND (p_domains IS NULL OR q.learning_objective = ANY(p_domains))
        AND NOT EXISTS (SELECT 1 FROM public.question_instances qi WHERE qi.student_id = v_uid AND qi.question_id = q.id)) THEN
      RETURN NULL; END IF;
    SELECT qi.id INTO v_instance_id FROM public.question_instances qi JOIN public.questions q ON q.id = qi.question_id
    WHERE qi.student_id = v_uid AND qi.answered = true AND qi.teacher_score IS NULL AND q.is_active AND q.answer_format <> 'text'
      AND (p_domains IS NULL OR q.learning_objective = ANY(p_domains))
    ORDER BY (qi.was_correct IS NOT FALSE), qi.answered_at ASC NULLS FIRST LIMIT 1;
    IF v_instance_id IS NULL THEN RETURN NULL; END IF;
    UPDATE public.question_instances SET answered = false, user_answer = NULL, was_correct = NULL, answered_at = NULL,
      next_review_at = now(), repeat_count = repeat_count + 1 WHERE id = v_instance_id AND student_id = v_uid AND answered = true;
    IF NOT FOUND THEN RETURN NULL; END IF;
    RETURN v_instance_id;
  END;
  $function$;
  REVOKE EXECUTE ON FUNCTION public.request_repeat_question(smallint, text[]) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.request_repeat_question(smallint, text[]) TO authenticated, service_role;

  -- LIVE process_question_attempt (MC / number award path), backend only.
  CREATE FUNCTION public.process_question_attempt(p_student_id uuid, p_question_instance_id uuid, p_answer text, p_question_shown_at bigint)
   RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  DECLARE v_instance record; v_correct boolean := false; v_rows integer; v_is_repeat boolean;
  BEGIN
    SELECT qi.*, q.answer_format INTO v_instance FROM question_instances qi JOIN questions q ON q.id = qi.question_id
     WHERE qi.id = p_question_instance_id AND qi.student_id = p_student_id;
    IF v_instance IS NULL THEN RAISE EXCEPTION 'Instance not found'; END IF;
    IF v_instance.answered THEN RETURN json_build_object('status', 'already', 'correct_answer', v_instance.correct_answer); END IF;
    v_is_repeat := coalesce(v_instance.repeat_count, 0) > 0;
    v_correct := trim(regexp_replace(lower(p_answer), '[^a-z0-9]', '', 'g')) = trim(regexp_replace(lower(v_instance.correct_answer), '[^a-z0-9]', '', 'g'));
    UPDATE question_instances SET answered = true, answered_at = now(), user_answer = p_answer, was_correct = v_correct
     WHERE id = v_instance.id AND answered = false;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 1 AND v_correct THEN
      IF v_is_repeat THEN UPDATE student_progress SET xp = xp + 2 WHERE student_id = p_student_id;
      ELSE UPDATE student_progress SET xp = xp + 10, coins = coins + 5 WHERE student_id = p_student_id; END IF;
    END IF;
    RETURN json_build_object('status', CASE WHEN v_correct THEN 'correct' ELSE 'incorrect' END, 'correct_answer', v_instance.correct_answer);
  END;
  $function$;
  REVOKE EXECUTE ON FUNCTION public.process_question_attempt(uuid, uuid, text, bigint) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.process_question_attempt(uuid, uuid, text, bigint) TO service_role;
`;

async function db({ b = true } = {}) {
  const pg = new PGlite();
  await pg.exec(FIXTURE);
  await pg.exec(MIGRATION_A);
  if (b) await pg.exec(MIGRATION_B);
  return pg;
}

// One statement as `role` with auth.uid() = uid. Rolled back unless keep = true.
async function as(pg, role, uid, sql, params = [], keep = false) {
  await pg.exec("BEGIN");
  try {
    await pg.exec(`SET LOCAL ROLE ${role}`);
    await pg.query("SELECT set_config('test.uid', $1, true)", [uid ?? ""]);
    const r = await pg.query(sql, params);
    await pg.exec(keep ? "COMMIT" : "ROLLBACK");
    return { rows: r.rows, count: r.affectedRows ?? null };
  } catch (e) {
    await pg.exec("ROLLBACK");
    return { error: String(e.message), code: e.code ?? null };
  }
}

// Server-side instance creation, as get-next-question/instance-insert.ts does it (service_role).
async function serve(pg, uid, qid, { answered = false, wasCorrect = null, answeredAt = null, userAnswer = null } = {}) {
  const r = await as(pg, "service_role", "",
    `INSERT INTO public.question_instances (student_id, question_id, correct_answer, answered, was_correct, user_answer, answered_at, next_review_at)
     VALUES ($1, $2, (SELECT content->>'correct' FROM public.questions WHERE id = $2), $3, $4, $5, $6, now()) RETURNING id`,
    [uid, qid, answered, wasCorrect, userAnswer, answeredAt], true);
  assert.ok(!r.error, r.error);
  return r.rows[0].id;
}
const KEYISH = /"(correct|correct_answer|accepted_answers|facit|tolerance|criteria)"\s*:/;

// ── The file ────────────────────────────────────────────────────────────────────────────────────
test("migration B applies after A on the live-shaped schema", async () => {
  const pg = await db();
  const pol = (await pg.query("SELECT policyname FROM pg_policies WHERE tablename = 'questions' ORDER BY 1")).rows.map((r) => r.policyname);
  assert.deepEqual(pol, ["staff read questions"]);
});

test("B changes privileges and the questions policy only — no function body, no other policy, no data", async () => {
  const snap = async (pg) => (await pg.query(`SELECT json_build_object(
      'fns', (SELECT json_agg(p.proname || ':' || md5(p.prosrc) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'),
      'qi_policies', (SELECT json_agg(policyname || ':' || qual ORDER BY policyname) FROM pg_policies WHERE tablename = 'question_instances'),
      'rows', (SELECT md5(string_agg(t::text, ',' ORDER BY t::text)) FROM (SELECT * FROM public.questions) t)) AS s`)).rows[0].s;
  assert.deepEqual(await snap(await db()), await snap(await db({ b: false })));
});

// ── P4: questions ───────────────────────────────────────────────────────────────────────────────
test("P4: anon cannot read the question bank at all", async () => {
  const pg = await db();
  const r = await as(pg, "anon", "", "SELECT id, content FROM public.questions");
  assert.match(r.error ?? "", /permission denied/);
  const before = await as(await db({ b: false }), "anon", "", "SELECT count(*)::int AS n FROM public.questions");
  assert.equal(before.rows[0].n, 13, "negative control: before B, anon read every question (keys included)");
});

test("P4: a pupil cannot read questions — directly or through an embed — so no content.correct / accepted_answers", async () => {
  const pg = await db();
  await serve(pg, P1, HQ[0].id);
  const direct = await as(pg, "authenticated", P1, "SELECT id, content FROM public.questions");
  assert.deepEqual(direct.rows, [], "RLS returns no question rows to a pupil");
  const keys = await as(pg, "authenticated", P1,
    "SELECT content->>'correct' AS c, content->'accepted_answers' AS a FROM public.questions WHERE id = $1", [HQ[0].id]);
  assert.deepEqual(keys.rows, []);
  const embed = await as(pg, "authenticated", P1,
    "SELECT qi.id, q.content FROM public.question_instances qi LEFT JOIN public.questions q ON q.id = qi.question_id WHERE qi.student_id = $1", [P1]);
  assert.equal(embed.rows.length, 1);
  assert.equal(embed.rows[0].content, null, "the embedded question is invisible to the pupil");
  const before = await as(await db({ b: false }), "authenticated", P1, "SELECT content FROM public.questions WHERE id = $1", [HQ[0].id]);
  assert.match(JSON.stringify(before.rows), KEYISH, "negative control: before B the pupil read the key");
});

test("P4: teachers and super_admin keep reading the bank (teacher.js / student-detail.js)", async () => {
  const pg = await db();
  await serve(pg, P1, HQ[0].id, { answered: true, wasCorrect: false, userAnswer: "Forkert A" });
  for (const uid of [T1, SA]) {
    const r = await as(pg, "authenticated", uid, "SELECT id, content FROM public.questions");
    assert.equal(r.rows?.length, 13, `role of ${uid} reads the bank`);
  }
  // student-detail.js: the pupil's answers with question metadata, through the teacher's own scope.
  const t = await as(pg, "authenticated", T1,
    `SELECT qi.is_correct, qi.was_correct, q.learning_objective, q.difficulty_band, q.content->>'correct' AS shown_key
       FROM public.question_instances qi LEFT JOIN public.questions q ON q.id = qi.question_id WHERE qi.student_id = $1`, [P1]);
  assert.equal(t.rows.length, 1);
  assert.equal(t.rows[0].learning_objective, "vikings");
  assert.equal(t.rows[0].shown_key, HQ[0].key, "the teacher view can still show the right answer");
  // A teacher without that pupil sees no instance (RLS unchanged).
  assert.deepEqual((await as(pg, "authenticated", T2, "SELECT id FROM public.question_instances WHERE student_id = $1", [P1])).rows, []);
});

// ── P3: question_instances.correct_answer ───────────────────────────────────────────────────────
test("P3: the effective privileges hide correct_answer from every client role", async () => {
  const pg = await db();
  const r = (await pg.query(`SELECT has_table_privilege('authenticated', 'public.question_instances', 'SELECT') AS auth_tbl,
      has_column_privilege('authenticated', 'public.question_instances', 'correct_answer', 'SELECT') AS auth_key,
      has_table_privilege('anon', 'public.question_instances', 'SELECT') AS anon_tbl,
      has_column_privilege('anon', 'public.question_instances', 'correct_answer', 'SELECT') AS anon_key,
      has_column_privilege('service_role', 'public.question_instances', 'correct_answer', 'SELECT') AS svc_key`)).rows[0];
  assert.deepEqual(r, { auth_tbl: false, auth_key: false, anon_tbl: false, anon_key: false, svc_key: true });
  for (const col of CLIENT_READABLE) {
    const ok = (await pg.query("SELECT has_column_privilege('authenticated', 'public.question_instances', $1, 'SELECT') AS ok", [col])).rows[0].ok;
    assert.equal(ok, true, `authenticated keeps SELECT on ${col}`);
  }
  const before = (await (await db({ b: false })).query(
    "SELECT has_column_privilege('authenticated', 'public.question_instances', 'correct_answer', 'SELECT') AS k")).rows[0].k;
  assert.equal(before, true, "negative control: table-level SELECT exposed the key column before B");
});

test("P3: a pupil reads their own non-secret columns, but never the key — not by name, not via '*'", async () => {
  const pg = await db();
  const id = await serve(pg, P1, HQ[0].id);
  const ok = await as(pg, "authenticated", P1, `SELECT ${CLIENT_READABLE.join(", ")} FROM public.question_instances WHERE student_id = $1`, [P1]);
  assert.equal(ok.rows?.length, 1, ok.error);
  const byName = await as(pg, "authenticated", P1, "SELECT correct_answer FROM public.question_instances WHERE id = $1", [id]);
  assert.match(byName.error ?? "", /permission denied/);
  const star = await as(pg, "authenticated", P1, "SELECT * FROM public.question_instances WHERE id = $1", [id]);
  assert.match(star.error ?? "", /permission denied/, "'*' expands to the key column and is refused, never a partial row");
  const filter = await as(pg, "authenticated", P1, "SELECT id FROM public.question_instances WHERE correct_answer = $1", [HQ[0].key]);
  assert.match(filter.error ?? "", /permission denied/, "the key cannot be probed through a filter either");
  // get-reviewed-answers (pupil client) keeps working.
  const rev = await as(pg, "authenticated", P1,
    "SELECT id, user_answer, teacher_feedback, teacher_score, reviewed_at FROM public.question_instances WHERE student_id = $1 AND teacher_score IS NOT NULL", [P1]);
  assert.ok(!rev.error, rev.error);
  const before = await as(await db({ b: false }), "authenticated", P1, "SELECT correct_answer FROM public.question_instances WHERE student_id = $1", [P1]);
  assert.ok(Array.isArray(before.rows), "negative control: before B the owner could select the key");
});

test("P3: teacher flows keep their exact columns (teacher.js / student-detail.js) and also cannot read the key", async () => {
  const pg = await db();
  await serve(pg, P1, HQ[0].id, { answered: true, wasCorrect: true, answeredAt: "2026-10-18T10:00:00Z", userAnswer: HQ[0].key });
  for (const cols of ["student_id, answered_at", "student_id, created_at, user_answer, teacher_score, question_id",
    "id, user_answer, teacher_score, teacher_feedback, created_at, question_id", "is_correct, was_correct", "answered_at"]) {
    const r = await as(pg, "authenticated", T1, `SELECT ${cols} FROM public.question_instances WHERE student_id = $1`, [P1]);
    assert.equal(r.rows?.length, 1, `${cols}: ${r.error ?? ""}`);
  }
  assert.match((await as(pg, "authenticated", T1, "SELECT correct_answer FROM public.question_instances")).error ?? "", /permission denied/);
});

test("process-event v33's pupil-client next_review_at UPDATE stays a harmless 0-row no-op, not an error", async () => {
  const pg = await db();
  const id = await serve(pg, P1, HQ[0].id);
  const r = await as(pg, "authenticated", P1,
    "UPDATE public.question_instances SET next_review_at = now() WHERE id = $1 AND student_id = $2", [id, P1]);
  assert.ok(!r.error, r.error);
  assert.equal(r.count, 0, "no UPDATE policy: 0 rows, as before");
});

// ── P2 + E2 legacy RPCs ─────────────────────────────────────────────────────────────────────────
test("P2/E2: the legacy RPCs are executable by no client role (and not by the backend either)", async () => {
  const pg = await db();
  const calls = [
    "SELECT * FROM public.get_unserved_questions(7::smallint, NULL::text[])",
    "SELECT public.request_repeat_question(7::smallint, ARRAY['nonexistent']::text[])",
  ];
  for (const sql of calls) {
    for (const [role, uid] of [["anon", ""], ["authenticated", P1], ["service_role", ""]]) {
      const r = await as(pg, role, uid, sql);
      assert.match(r.error ?? "", /permission denied/, `${role}: ${sql}`);
    }
  }
  // Negative control: before B, anon pulled keys through get_unserved_questions.
  const before = await as(await db({ b: false }), "anon", "", "SELECT content FROM public.get_unserved_questions(7::smallint, NULL::text[])");
  assert.match(JSON.stringify(before.rows), KEYISH);
});

test("E2: a pupil cannot provoke a repeat with a mini-scope through the legacy or the new entry point", async () => {
  // The exploit: the pupil has answered every "vikings" question while world_war_2 is still unserved.
  // Naming the mini-scope ['vikings'] makes "the pool is empty" true, so a repeat is handed out early.
  const vikings = HQ.filter((q) => q.lo === "vikings");
  const setUp = async (pg) => {
    let t = Date.parse("2026-10-01T10:00:00Z");
    for (const q of vikings) await serve(pg, P1, q.id, { answered: true, wasCorrect: false, answeredAt: new Date(t += 60_000).toISOString() });
  };
  const pg = await db();
  await setUp(pg);
  const legacy = await as(pg, "authenticated", P1, "SELECT public.request_repeat_question(7::smallint, ARRAY['vikings']::text[])");
  assert.match(legacy.error ?? "", /permission denied/);
  const fresh = await as(pg, "authenticated", P1, "SELECT public.request_repeat_question_for_student($1, 7::smallint, ARRAY['vikings']::text[])", [P1]);
  assert.match(fresh.error ?? "", /permission denied/);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM public.question_instances WHERE repeat_count > 0 OR NOT answered")).rows[0].n, 0,
    "nothing was reopened");
  // The backend, with the SERVER scope (all history domains), refuses: world_war_2 is still unserved.
  const server = await as(pg, "service_role", "", "SELECT public.request_repeat_question_for_student($1, 7::smallint, $2::text[]) AS id", [P1, HISTORY]);
  assert.equal(server.rows[0].id, null);
  // Negative control: before B the legacy entry point reopened a row on the mini-scope.
  const old = await db({ b: false });
  await setUp(old);
  const hit = await as(old, "authenticated", P1, "SELECT public.request_repeat_question(7::smallint, ARRAY['vikings']::text[]) AS id");
  assert.ok(hit.rows?.[0]?.id, "the old exploit worked before B");
});

// ── The server paths keep working after B ───────────────────────────────────────────────────────
test("the backend selection, repeat and grading still work (get-next-question / process-event)", async () => {
  const pg = await db();
  const unserved = await as(pg, "service_role", "", "SELECT id, content FROM public.get_unserved_questions_for_student($1, 7::smallint, $2::text[])", [P1, HISTORY]);
  assert.equal(unserved.rows.length, 13);
  const id = await serve(pg, P1, HQ[0].id);
  const key = (await as(pg, "service_role", "", "SELECT correct_answer, q.content->'accepted_answers' AS acc FROM public.question_instances qi JOIN public.questions q ON q.id = qi.question_id WHERE qi.id = $1", [id])).rows[0];
  assert.equal(key.correct_answer, HQ[0].key, "the grading read (process-event/instance-read.ts) still sees the key");
  const r = await as(pg, "service_role", "", "SELECT public.process_question_attempt($1, $2, $3, 0) AS r", [P1, id, HQ[0].key], true);
  assert.equal(r.rows[0].r.status, "correct");
  assert.deepEqual((await pg.query("SELECT xp, coins FROM public.student_progress WHERE student_id = $1", [P1])).rows[0], { xp: 10, coins: 5 });
  // Pool exhausted for world_war_2 → the backend repeat path returns the incorrect one.
  let t = Date.parse("2026-10-02T10:00:00Z");
  for (const q of [...HQ.filter((x) => x.lo === "world_war_2"), { id: Q_STAV }]) {
    await serve(pg, P2, q.id, { answered: true, wasCorrect: q.id !== HQ[1].id, answeredAt: new Date(t += 60_000).toISOString() });
  }
  const rep = await as(pg, "service_role", "", "SELECT public.request_repeat_question_for_student($1, 7::smallint, ARRAY['world_war_2']::text[]) AS id", [P2], true);
  const qid = (await pg.query("SELECT question_id, repeat_count FROM public.question_instances WHERE id = $1", [rep.rows[0].id])).rows[0];
  assert.deepEqual(qid, { question_id: HQ[1].id, repeat_count: 1 });
});

test("placement still works after B — the pupil cannot read questions, but start/submit_placement can", async () => {
  const pg = await db();
  const s = await as(pg, "authenticated", P1, "SELECT public.start_placement() AS q", [], true);
  assert.ok(!s.error, s.error);
  const items = s.rows[0].q;
  assert.equal(items.length, 10);
  assert.equal(KEYISH.test(JSON.stringify(items)), false, "no key in the placement payload");
  const again = await as(pg, "authenticated", P1, "SELECT public.start_placement() AS q", [], true);
  assert.deepEqual(again.rows[0].q, items, "a refresh reuses the same session");
  const answers = items.map((i) => ({ question_id: i.id, answer: HQ.find((q) => q.id === i.id).key }));
  const sub = await as(pg, "authenticated", P1, "SELECT public.submit_placement($1::jsonb) AS band", [JSON.stringify(answers)], true);
  assert.equal(sub.rows[0].band, 4);
  assert.equal((await pg.query("SELECT placement_band FROM public.profiles WHERE id = $1", [P1])).rows[0].placement_band, 4);
  const twice = await as(pg, "authenticated", P1, "SELECT public.submit_placement($1::jsonb)", [JSON.stringify(answers)]);
  assert.match(twice.error ?? "", /placement_already_submitted/, "no second submission — placement is not a key oracle");
});

test("the migration version is not shared with any other migration", () => {
  const same = readdirSync(join(ROOT, "supabase", "migrations")).filter((n) => n.startsWith("20261018170000_"));
  assert.deepEqual(same, [FILE_B]);
});
