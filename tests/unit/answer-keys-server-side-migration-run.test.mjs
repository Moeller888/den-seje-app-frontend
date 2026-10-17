// RUNTIME proof for migration 20261016160000_answer_keys_server_side_rpcs (step A of keeping answer
// keys server-side — audit findings E1 and E2, 2026-10-16). The SQL file is executed UNMODIFIED against
// a real PostgreSQL (PGlite, in-process WebAssembly — no Docker, no network), on a fixture that
// reproduces the LIVE state read on 2026-10-16 (read-only D-110 audit): questions readable by PUBLIC
// through "allow read questions"; question_instances with its unique indexes, RLS, the two SELECT
// policies and client INSERT already revoked; the live bodies and EXECUTE grants of
// get_unserved_questions, request_repeat_question and process_question_attempt.
//
// HONEST LIMITS:
//   - PGlite is PostgreSQL 18.x; production is 17.6.
//   - auth.uid() reads `test.uid`. PostgREST is not in the loop: a client call is modelled as the same
//     statement run as role anon/authenticated with auth.uid() = the caller; the Edge Function's
//     backend call as role service_role.
//   - The streak/quest helpers are no-op stand-ins.
//   - Step A only ADDS. The old client entry points stay until step B; their unchanged state is
//     asserted here so B's effect is measurable. Passing is not permission to apply (D-110).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = "20261016160000_answer_keys_server_side_rpcs.sql";
const MIGRATION = readFileSync(join(ROOT, "supabase", "migrations", FILE), "utf8");

const T1 = "00000000-0000-4000-8000-0000000000a1";   // teacher
const P1 = "00000000-0000-4000-8000-000000000001";   // pupil, grade 7, unplaced
const P2 = "00000000-0000-4000-8000-000000000002";   // pupil, grade 7, unplaced
const P3 = "00000000-0000-4000-8000-000000000003";   // pupil, already placed

const HISTORY = ["prehistoric_denmark", "vikings", "middle_ages", "reformation_monarchy", "enlightenment",
  "revolutions_democracy", "industrialisation", "world_war_1", "world_war_2", "cold_war", "democracy_power"];

// 12 placement-eligible history MC questions (bands 1×4, 2×4, 3×2, 4×2, grade 7), plus distractors.
const HQ = [];
const bands = [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4, 4];
bands.forEach((band, i) => {
  const n = String(i + 1).padStart(2, "0");
  HQ.push({ id: `00000000-0000-4000-8000-0000000001${n}`, band, key: `Svar${n}`,
    lo: i % 2 === 0 ? "vikings" : "world_war_2" });
});
const Q_EN = "00000000-0000-4000-8000-000000000201";     // English MC — never placement, never historie
const Q_G9 = "00000000-0000-4000-8000-000000000202";     // grade-9 MC — out of a grade-7 scope
const Q_STAV = "00000000-0000-4000-8000-000000000203";   // "stav til" (text/short)

const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;
const mcContent = (q, key) => JSON.stringify({ question: `Spørgsmål ${q}?`, options: [key, "Forkert A", "Forkert B", "Forkert C"],
  correct: key, accepted_answers: [key], review_text: `Det er ${key}.` });

const FIXTURE = `
  CREATE ROLE anon NOBYPASSRLS; CREATE ROLE authenticated NOBYPASSRLS; CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  INSERT INTO auth.users VALUES ('${T1}'), ('${P1}'), ('${P2}'), ('${P3}');

  CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text NOT NULL, teacher_id uuid,
    selected_grade smallint, active_domains text[], placement_band smallint, current_band smallint);
  INSERT INTO public.profiles (id, role, teacher_id, selected_grade, placement_band) VALUES
    ('${T1}', 'teacher', NULL, NULL, NULL), ('${P1}', 'student', '${T1}', 7, NULL),
    ('${P2}', 'student', '${T1}', 7, NULL), ('${P3}', 'student', '${T1}', 7, 2);
  GRANT SELECT ON public.profiles TO anon, authenticated, service_role;
  GRANT UPDATE (placement_band, current_band) ON public.profiles TO authenticated;

  CREATE TABLE public.questions (id uuid PRIMARY KEY, content jsonb NOT NULL, answer_format text NOT NULL,
    answer_type text DEFAULT 'short', is_active boolean NOT NULL DEFAULT true, learning_objective text,
    target_grade smallint, difficulty_band smallint, metadata jsonb);
  ${HQ.map((q) => `INSERT INTO public.questions (id, content, answer_format, learning_objective, target_grade, difficulty_band)
    VALUES ('${q.id}', ${sqlStr(mcContent(q.id, q.key))}, 'mc', '${q.lo}', 7, ${q.band});`).join("\n  ")}
  INSERT INTO public.questions (id, content, answer_format, learning_objective, target_grade, difficulty_band) VALUES
    ('${Q_EN}', ${sqlStr(mcContent("en", "Apple"))}, 'mc', 'english', 7, 1),
    ('${Q_G9}', ${sqlStr(mcContent("g9", "Svar99"))}, 'mc', 'cold_war', 9, 1);
  INSERT INTO public.questions (id, content, answer_format, answer_type, learning_objective, target_grade, difficulty_band) VALUES
    ('${Q_STAV}', '{"question":"Stav til: landet?","correct":"Polen","accepted_answers":["Polen"]}', 'text', 'short', 'world_war_2', 7, 1);
  ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
  GRANT ALL ON public.questions TO anon, authenticated, service_role;
  CREATE POLICY "allow read questions" ON public.questions AS PERMISSIVE FOR SELECT TO public USING (true);

  CREATE TABLE public.student_progress (student_id uuid PRIMARY KEY, xp integer DEFAULT 0, coins integer DEFAULT 0,
    correct_answers integer DEFAULT 0, total_correct_answers integer DEFAULT 0);
  INSERT INTO public.student_progress (student_id) VALUES ('${P1}'), ('${P2}'), ('${P3}');
  GRANT ALL ON public.student_progress TO service_role;

  CREATE TABLE public.question_instances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    correct_answer text NOT NULL, difficulty_at_time integer NOT NULL DEFAULT 1, mastery_snapshot integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), answered boolean NOT NULL DEFAULT false, answered_at timestamptz,
    next_review_at timestamptz, user_answer text, was_correct boolean, teacher_score integer,
    repeat_count integer NOT NULL DEFAULT 0
  );
  CREATE UNIQUE INDEX idx_student_question_instance ON public.question_instances (student_id, question_id);
  CREATE UNIQUE INDEX idx_one_open_question ON public.question_instances (student_id) WHERE (answered = false);
  ALTER TABLE public.question_instances ENABLE ROW LEVEL SECURITY;
  GRANT SELECT, UPDATE, DELETE ON public.question_instances TO anon, authenticated;
  GRANT ALL ON public.question_instances TO service_role;
  CREATE POLICY "students read own question_instances" ON public.question_instances
    AS PERMISSIVE FOR SELECT TO authenticated USING (student_id = (SELECT auth.uid() AS uid));

  CREATE FUNCTION public.update_streak(uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION public.update_quest_progress_for_answer(uuid, boolean, integer) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION public.update_weekly_quest_progress_for_answer(uuid, boolean, integer) RETURNS void LANGUAGE sql AS $$ SELECT $$;

  -- LIVE get_unserved_questions (pg_get_functiondef, 2026-10-16). EXECUTE: anon, authenticated, service_role.
  CREATE FUNCTION public.get_unserved_questions(p_grade smallint, p_domains text[])
   RETURNS TABLE(id uuid, content jsonb, answer_format text, answer_type text, metadata jsonb, difficulty_band integer)
   LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
    SELECT q.id, q.content, q.answer_format, q.answer_type, q.metadata, q.difficulty_band FROM questions q
    WHERE q.is_active = true AND (p_grade IS NULL OR q.target_grade IS NULL OR q.target_grade <= p_grade)
      AND (p_domains IS NULL OR q.learning_objective = ANY(p_domains))
      AND NOT EXISTS (SELECT 1 FROM question_instances qi WHERE qi.student_id = auth.uid() AND qi.question_id = q.id)
    LIMIT 50;
  $function$;
  GRANT EXECUTE ON FUNCTION public.get_unserved_questions(smallint, text[]) TO anon, authenticated, service_role;

  -- LIVE request_repeat_question (pg_get_functiondef, 2026-10-16). EXECUTE: authenticated, service_role.
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
    WHERE qi.student_id = v_uid AND qi.answered = true AND qi.teacher_score IS NULL AND q.is_active
      AND q.answer_format <> 'text' AND coalesce(q.answer_type, 'short') <> 'long'
      AND (p_grade IS NULL OR q.target_grade IS NULL OR q.target_grade <= p_grade)
      AND (p_domains IS NULL OR q.learning_objective = ANY(p_domains))
    ORDER BY (qi.was_correct IS NOT FALSE), qi.answered_at ASC NULLS FIRST LIMIT 1;
    IF v_instance_id IS NULL THEN RETURN NULL; END IF;
    UPDATE public.question_instances SET answered = false, user_answer = NULL, was_correct = NULL, answered_at = NULL,
      next_review_at = now(), repeat_count = repeat_count + 1
    WHERE id = v_instance_id AND student_id = v_uid AND answered = true;
    IF NOT FOUND THEN RETURN NULL; END IF;
    RETURN v_instance_id;
  END;
  $function$;
  REVOKE EXECUTE ON FUNCTION public.request_repeat_question(smallint, text[]) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.request_repeat_question(smallint, text[]) TO authenticated, service_role;

  -- LIVE process_question_attempt (2026-10-16), backend-only.
  CREATE FUNCTION public.process_question_attempt(p_student_id uuid, p_question_instance_id uuid, p_answer text, p_question_shown_at bigint)
   RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  DECLARE v_instance record; v_correct boolean := false; v_answer text; v_correct_answer text;
    v_rows_updated integer; v_is_repeat boolean := false; v_xp integer := 0; v_coins integer := 0;
  BEGIN
    SELECT qi.*, q.answer_format INTO v_instance FROM question_instances qi JOIN questions q ON q.id = qi.question_id
     WHERE qi.id = p_question_instance_id AND qi.student_id = p_student_id;
    IF v_instance IS NULL THEN RAISE EXCEPTION 'Instance not found'; END IF;
    IF v_instance.answered = true THEN
      RETURN json_build_object('status', CASE WHEN v_instance.was_correct = true THEN 'correct'
        WHEN v_instance.was_correct = false THEN 'incorrect' ELSE 'pending' END, 'correct_answer', v_instance.correct_answer);
    END IF;
    v_is_repeat := coalesce(v_instance.repeat_count, 0) > 0;
    IF v_instance.answer_format = 'text' THEN
      UPDATE question_instances SET answered = true, answered_at = now(), user_answer = p_answer, was_correct = null
       WHERE id = v_instance.id AND answered = false;
      RETURN json_build_object('status', 'pending', 'correct_answer', null);
    END IF;
    v_answer         := trim(regexp_replace(lower(p_answer),                   '[^a-z0-9]', '', 'g'));
    v_correct_answer := trim(regexp_replace(lower(v_instance.correct_answer), '[^a-z0-9]', '', 'g'));
    IF v_answer = v_correct_answer THEN v_correct := true; END IF;
    UPDATE question_instances SET answered = true, answered_at = now(), user_answer = p_answer, was_correct = v_correct
     WHERE id = v_instance.id AND answered = false;
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated = 0 THEN
      RETURN json_build_object('status', CASE WHEN v_correct THEN 'correct' ELSE 'incorrect' END, 'correct_answer', v_instance.correct_answer);
    END IF;
    IF v_correct THEN
      IF v_is_repeat THEN
        v_xp := 2; UPDATE student_progress SET xp = COALESCE(xp, 0) + v_xp WHERE student_id = p_student_id;
      ELSE
        v_xp := 10; v_coins := 5;
        UPDATE student_progress SET xp = COALESCE(xp, 0) + v_xp, coins = COALESCE(coins, 0) + v_coins,
          correct_answers = COALESCE(correct_answers, 0) + 1, total_correct_answers = COALESCE(total_correct_answers, 0) + 1
         WHERE student_id = p_student_id;
      END IF;
    END IF;
    PERFORM public.update_streak(p_student_id);
    IF NOT v_is_repeat THEN
      PERFORM public.update_quest_progress_for_answer(p_student_id, v_correct, CASE WHEN v_correct THEN 10 ELSE 0 END);
      PERFORM public.update_weekly_quest_progress_for_answer(p_student_id, v_correct, CASE WHEN v_correct THEN 10 ELSE 0 END);
    END IF;
    RETURN json_build_object('status', CASE WHEN v_correct THEN 'correct' ELSE 'incorrect' END, 'correct_answer', v_instance.correct_answer);
  END;
  $function$;
  REVOKE EXECUTE ON FUNCTION public.process_question_attempt(uuid, uuid, text, bigint) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.process_question_attempt(uuid, uuid, text, bigint) TO service_role;
`;

async function db({ migrated = true } = {}) {
  const pg = new PGlite();
  await pg.exec(FIXTURE);
  if (migrated) await pg.exec(MIGRATION);
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
    return { rows: r.rows };
  } catch (e) {
    await pg.exec("ROLLBACK");
    return { error: String(e.message), code: e.code ?? null };
  }
}

const KEY_FIELD = /"(correct|correct_answer|accepted_answers?|answers?|facit|solutions?|tolerance|criteria|review_text)"\s*:/i;
const keyOf = (id) => HQ.find((q) => q.id === id)?.key;
const progress = async (pg, uid) => (await pg.query("SELECT xp, coins, correct_answers FROM public.student_progress WHERE student_id = $1", [uid])).rows[0];

// Server-side instance creation, as get-next-question/instance-insert.ts does it (service_role).
async function serve(pg, uid, qid, { answered = false, wasCorrect = null, answeredAt = null } = {}) {
  const r = await as(pg, "service_role", "",
    `INSERT INTO public.question_instances (student_id, question_id, correct_answer, answered, was_correct, user_answer, answered_at, next_review_at)
     VALUES ($1, $2, (SELECT content->>'correct' FROM public.questions WHERE id = $2), $3, $4, CASE WHEN $3 THEN 'x' END, $5, now())
     RETURNING id`, [uid, qid, answered, wasCorrect, answeredAt], true);
  assert.ok(!r.error, r.error);
  return r.rows[0].id;
}

// ── The file itself ─────────────────────────────────────────────────────────────────────────────
test("the migration applies on the live-shaped schema", async () => {
  const pg = await db();
  const fns = (await pg.query(`SELECT p.oid::regprocedure::text AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('start_placement','submit_placement','get_unserved_questions_for_student','request_repeat_question_for_student')
    ORDER BY 1`)).rows.map((r) => r.sig);
  assert.deepEqual(fns, ["get_unserved_questions_for_student(uuid,smallint,text[])",
    "request_repeat_question_for_student(uuid,smallint,text[])", "start_placement()", "submit_placement(jsonb)"]);
});

test("step A changes no existing function, policy or privilege (B takes the client paths away)", async () => {
  const snapshot = async (pg) => (await pg.query(`
    SELECT json_build_object(
      'fns', (SELECT json_agg(p.proname || ':' || md5(p.prosrc) || ':' || coalesce(p.proacl::text, '') ORDER BY p.proname)
              FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
              AND p.proname IN ('get_unserved_questions','request_repeat_question','process_question_attempt')),
      'policies', (SELECT json_agg(tablename || ':' || policyname || ':' || cmd ORDER BY 1) FROM pg_policies
                   WHERE tablename IN ('questions','question_instances')),
      'tables', (SELECT json_agg(c.relname || ':' || coalesce(c.relacl::text, '') || ':' || c.relrowsecurity ORDER BY 1)
                 FROM pg_class c WHERE c.relname IN ('questions','question_instances','profiles'))) AS s`)).rows[0].s;
  assert.deepEqual(await snapshot(await db()), await snapshot(await db({ migrated: false })));
});

// ── E2: the browser cannot name a scope ─────────────────────────────────────────────────────────
test("the new key-bearing and repeat functions are backend-only", async () => {
  const pg = await db();
  for (const [sql, params] of [
    ["SELECT * FROM public.get_unserved_questions_for_student($1, 7::smallint, $2::text[])", [P1, HISTORY]],
    ["SELECT public.request_repeat_question_for_student($1, 7::smallint, ARRAY['nonexistent']::text[])", [P1]],
  ]) {
    for (const role of ["anon", "authenticated"]) {
      const r = await as(pg, role, role === "anon" ? "" : P1, sql, params);
      assert.match(r.error ?? "", /permission denied/, `${role} must not run: ${sql.slice(0, 60)}`);
    }
    const ok = await as(pg, "service_role", "", sql, params);
    assert.ok(!ok.error, ok.error);
  }
});

test("a mini-scope cannot provoke a repeat: the server scope still has unserved questions", async () => {
  const pg = await db();
  await serve(pg, P1, HQ[0].id, { answered: true, wasCorrect: false, answeredAt: "2026-10-01T10:00:00Z" });
  // The server-derived scope (grade 7, all history domains) still has unserved questions → no repeat.
  const r = await as(pg, "service_role", "", "SELECT public.request_repeat_question_for_student($1, 7::smallint, $2::text[]) AS id", [P1, HISTORY]);
  assert.equal(r.rows[0].id, null);
  // And the pupil cannot call it with a scope of their own choosing.
  const forged = await as(pg, "authenticated", P1, "SELECT public.request_repeat_question_for_student($1, 7::smallint, ARRAY['nonexistent']::text[])", [P1]);
  assert.match(forged.error, /permission denied/);
  const after = await pg.query("SELECT answered, repeat_count FROM public.question_instances WHERE student_id = $1", [P1]);
  assert.deepEqual(after.rows, [{ answered: true, repeat_count: 0 }], "nothing was reopened");
});

test("pool exhaustion still works through the server: oldest incorrect first, 2 XP, one open at a time", async () => {
  const pg = await db();
  // P1 has answered every grade-7 history question; two incorrectly.
  let t = Date.parse("2026-10-01T10:00:00Z");
  const ids = {};
  for (const q of [...HQ, { id: Q_STAV }]) {
    const wrong = q.id === HQ[3].id || q.id === HQ[7].id;
    ids[q.id] = await serve(pg, P1, q.id, { answered: true, wasCorrect: !wrong, answeredAt: new Date(t += 60_000).toISOString() });
  }
  const unserved = await as(pg, "service_role", "", "SELECT id FROM public.get_unserved_questions_for_student($1, 7::smallint, $2::text[])", [P1, HISTORY]);
  assert.deepEqual(unserved.rows, [], "the server-derived pool is empty");

  const rep = await as(pg, "service_role", "", "SELECT public.request_repeat_question_for_student($1, 7::smallint, $2::text[]) AS id", [P1, HISTORY], true);
  assert.equal(rep.rows[0].id, ids[HQ[3].id], "the oldest incorrect answer comes back first");
  const row = (await pg.query("SELECT answered, repeat_count, user_answer FROM public.question_instances WHERE id = $1", [ids[HQ[3].id]])).rows[0];
  assert.deepEqual(row, { answered: false, repeat_count: 1, user_answer: null });

  const again = await as(pg, "service_role", "", "SELECT public.request_repeat_question_for_student($1, 7::smallint, $2::text[]) AS id", [P1, HISTORY]);
  assert.equal(again.rows[0].id, null, "never a second open question");

  const before = await progress(pg, P1);
  const ans = await as(pg, "service_role", "", "SELECT public.process_question_attempt($1, $2, $3, 0) AS r", [P1, ids[HQ[3].id], HQ[3].key], true);
  assert.equal(ans.rows[0].r.status, "correct");
  const after = await progress(pg, P1);
  assert.deepEqual({ xp: after.xp - before.xp, coins: after.coins - before.coins, correct: after.correct_answers - before.correct_answers },
    { xp: 2, coins: 0, correct: 0 }, "a repeat earns the unchanged reduced award only");

  const next = await as(pg, "service_role", "", "SELECT public.request_repeat_question_for_student($1, 7::smallint, $2::text[]) AS id", [P1, HISTORY]);
  assert.equal(next.rows[0].id, ids[HQ[7].id], "then the next incorrect one");
});

test("the teacher's domains are respected: a repeat only comes from the domains it is given", async () => {
  const pg = await db();
  let t = Date.parse("2026-10-01T10:00:00Z");
  for (const q of HQ) await serve(pg, P1, q.id, { answered: true, wasCorrect: false, answeredAt: new Date(t += 60_000).toISOString() });
  // The world_war_2 "stav til" question is still unserved, so that domain's pool is not empty: no repeat.
  const early = await as(pg, "service_role", "", "SELECT public.request_repeat_question_for_student($1, 7::smallint, ARRAY['world_war_2']::text[]) AS id", [P1]);
  assert.equal(early.rows[0].id, null, "an unserved question in the scope blocks a repeat");
  await serve(pg, P1, Q_STAV, { answered: true, wasCorrect: true, answeredAt: new Date(t += 60_000).toISOString() });
  // HQ[0] (vikings) is the oldest overall; HQ[1] is the oldest world_war_2 question.
  const r = await as(pg, "service_role", "", "SELECT public.request_repeat_question_for_student($1, 7::smallint, ARRAY['world_war_2']::text[]) AS id", [P1]);
  assert.ok(r.rows[0].id, "with the domain's pool exhausted a repeat is returned");
  const qid = (await pg.query("SELECT question_id FROM public.question_instances WHERE id = $1", [r.rows[0].id])).rows[0].question_id;
  assert.equal(qid, HQ[1].id);
});

test("first-time answers are graded and rewarded server-side, unchanged", async () => {
  const pg = await db();
  const right = await serve(pg, P1, HQ[0].id);
  const r1 = await as(pg, "service_role", "", "SELECT public.process_question_attempt($1, $2, $3, 0) AS r", [P1, right, HQ[0].key], true);
  assert.equal(r1.rows[0].r.status, "correct");
  assert.deepEqual(await progress(pg, P1), { xp: 10, coins: 5, correct_answers: 1 });
  const wrong = await serve(pg, P1, HQ[1].id);
  const r2 = await as(pg, "service_role", "", "SELECT public.process_question_attempt($1, $2, 'Forkert A', 0) AS r", [P1, wrong], true);
  assert.equal(r2.rows[0].r.status, "incorrect");
  assert.deepEqual(await progress(pg, P1), { xp: 10, coins: 5, correct_answers: 1 }, "a wrong answer pays nothing");
  assert.equal((await pg.query("SELECT was_correct FROM public.question_instances WHERE id = $1", [wrong])).rows[0].was_correct, false);
});

test("pupil A cannot read pupil B's instance or key, and cannot run the backend selection for B", async () => {
  const pg = await db();
  await serve(pg, P1, HQ[0].id);
  const r = await as(pg, "authenticated", P2, "SELECT id, correct_answer FROM public.question_instances WHERE student_id = $1", [P1]);
  assert.deepEqual(r.rows, []);
  const s = await as(pg, "authenticated", P2, "SELECT * FROM public.get_unserved_questions_for_student($1, 7::smallint, NULL)", [P1]);
  assert.match(s.error, /permission denied/);
});

// ── E1: placement without the key ───────────────────────────────────────────────────────────────
test("start_placement returns display data only — no answer key at any depth", async () => {
  const pg = await db();
  const r = await as(pg, "authenticated", P1, "SELECT public.start_placement() AS q", [], true);
  assert.ok(!r.error, r.error);
  const items = r.rows[0].q;
  assert.equal(items.length, 10, "3 + 3 + 2 + 2");
  for (const it of items) assert.deepEqual(Object.keys(it).sort(), ["difficulty_band", "id", "options", "question"]);
  assert.equal(KEY_FIELD.test(JSON.stringify(items)), false);
  const ids = items.map((i) => i.id);
  assert.ok(!ids.includes(Q_EN) && !ids.includes(Q_G9) && !ids.includes(Q_STAV), "history MC within the grade only");
  const byBand = items.reduce((m, i) => ({ ...m, [i.difficulty_band]: (m[i.difficulty_band] ?? 0) + 1 }), {});
  assert.deepEqual(byBand, { 1: 3, 2: 3, 3: 2, 4: 2 });
});

test("start_placement is deterministic and reuses an open session; placed pupils and teachers get none", async () => {
  const pg = await db();
  const a = await as(pg, "authenticated", P1, "SELECT public.start_placement() AS q", [], true);
  const b = await as(pg, "authenticated", P1, "SELECT public.start_placement() AS q", [], true);
  assert.deepEqual(a.rows[0].q, b.rows[0].q);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM public.placement_sessions")).rows[0].n, 1);
  assert.deepEqual((await as(pg, "authenticated", P3, "SELECT public.start_placement() AS q")).rows[0].q, []);
  assert.match((await as(pg, "authenticated", T1, "SELECT public.start_placement()")).error, /not_a_student/);
  assert.match((await as(pg, "anon", "", "SELECT public.start_placement()")).error, /permission denied/);
});

test("submit_placement grades server-side, writes the band once, and returns only the band", async () => {
  const pg = await db();
  const items = (await as(pg, "authenticated", P1, "SELECT public.start_placement() AS q", [], true)).rows[0].q;
  const all = items.map((i) => ({ question_id: i.id, answer: keyOf(i.id) }));
  const r = await as(pg, "authenticated", P1, "SELECT public.submit_placement($1::jsonb) AS band", [JSON.stringify(all)], true);
  assert.equal(r.rows[0].band, 4, "23 points");
  assert.equal((await pg.query("SELECT placement_band FROM public.profiles WHERE id = $1", [P1])).rows[0].placement_band, 4);
  const again = await as(pg, "authenticated", P1, "SELECT public.submit_placement($1::jsonb)", [JSON.stringify(all)]);
  assert.match(again.error, /placement_already_submitted/, "a session is submitted once — no oracle");
});

test("submit_placement cannot be gamed: foreign questions, duplicates and malformed input", async () => {
  const pg = await db();
  const items = (await as(pg, "authenticated", P1, "SELECT public.start_placement() AS q", [], true)).rows[0].q;
  const band1 = items.filter((i) => i.difficulty_band === 1);
  const forged = [
    // first answer to each band-1 question is wrong; the later right one must not count
    ...band1.map((i) => ({ question_id: i.id, answer: "Forkert A" })),
    ...band1.map((i) => ({ question_id: i.id, answer: keyOf(i.id) })),
    // a question outside the session, answered right
    { question_id: Q_G9, answer: "Svar99" },
    { question_id: "not-a-uuid", answer: "x" }, "junk", 42,
  ];
  const r = await as(pg, "authenticated", P1, "SELECT public.submit_placement($1::jsonb) AS band", [JSON.stringify(forged)], true);
  assert.equal(r.rows[0].band, 1, "0 points: duplicates count once, foreign questions never");
  for (const bad of [null, "{}", JSON.stringify(Array.from({ length: 51 }, () => ({})))]) {
    const p = await db();
    await as(p, "authenticated", P1, "SELECT public.start_placement()", [], true);
    assert.match((await as(p, "authenticated", P1, "SELECT public.submit_placement($1::jsonb)", [bad])).error ?? "", /invalid_answers/);
  }
  assert.match((await as(pg, "authenticated", P2, "SELECT public.submit_placement('[]'::jsonb)")).error, /no_placement_session/,
    "pupil B has no session of their own and cannot touch A's");
  assert.equal((await pg.query("SELECT placement_band FROM public.profiles WHERE id = $1", [P2])).rows[0].placement_band, null);
});

test("placement_sessions is server-only", async () => {
  const pg = await db();
  for (const role of ["anon", "authenticated"]) {
    const r = await as(pg, role, role === "anon" ? "" : P1, "SELECT * FROM public.placement_sessions");
    assert.match(r.error ?? "", /permission denied/, role);
  }
});

test("the migration version is not shared with any other migration", () => {
  const same = readdirSync(join(ROOT, "supabase", "migrations")).filter((n) => n.startsWith("20261016160000_"));
  assert.deepEqual(same, [FILE]);
});
