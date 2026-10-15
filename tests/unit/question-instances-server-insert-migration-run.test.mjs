// RUNTIME proof for migration 20261015120000_question_instances_server_owned_insert. The SQL file is
// executed UNMODIFIED against a real PostgreSQL (PGlite, in-process WebAssembly — no Docker, no
// network), on a fixture that reproduces the LIVE question_instances state of 2026-10-15 (read-only
// D-110 audit): RLS on, the two duplicate INSERT policies and the two SELECT policies exactly as
// pg_policies reports them, table-wide privileges for anon/authenticated/service_role, the
// one-row-per-question and one-open-question unique indexes, and the column defaults. The two award
// functions are the LIVE bodies of process_question_attempt and process_text_answer (verbatim apart
// from formatting); their streak/quest helpers are no-op stand-ins.
//
// HONEST LIMITS:
//   - PGlite is PostgreSQL 18.x; production is 17.6.
//   - auth.uid() reads `test.uid`. PostgREST is not in the loop: a pupil's REST call is modelled as
//     the same statement run as role authenticated with auth.uid() = the pupil.
//   - The short-text verdict is computed with the real evaluator (_shared/answer-evaluation.ts)
//     against the instance key, exactly as process-event does, and paid through the real RPC.
//   - Passing here is not permission to apply. Applying needs its own owner authorisation (D-110),
//     and get-next-question with ./instance-insert.ts must be deployed first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { isTextAnswerCorrect } from "../../supabase/functions/_shared/answer-evaluation.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = "20261015120000_question_instances_server_owned_insert.sql";
const MIGRATION = readFileSync(join(ROOT, "supabase", "migrations", FILE), "utf8");

const T1 = "00000000-0000-4000-8000-0000000000a1";   // teacher of P1
const P1 = "00000000-0000-4000-8000-000000000001";   // pupil
const P2 = "00000000-0000-4000-8000-000000000002";   // another pupil (no teacher)
const Q_MC = "00000000-0000-4000-8000-0000000000c1";       // active MC, key "Polen"
const Q_INACTIVE = "00000000-0000-4000-8000-0000000000c2"; // inactive MC, key "1939"
const Q_TEXT = "00000000-0000-4000-8000-0000000000c3";     // active short text, key "Norge"
const Q_MC2 = "00000000-0000-4000-8000-0000000000c4";      // active MC, key "Danmark"
const I_OLD = "00000000-0000-4000-8000-0000000000e1";      // P1's existing, answered history row

const FIXTURE = `
  CREATE ROLE anon NOBYPASSRLS; CREATE ROLE authenticated NOBYPASSRLS; CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

  CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text NOT NULL, teacher_id uuid);
  INSERT INTO public.profiles VALUES ('${T1}', 'teacher', NULL), ('${P1}', 'student', '${T1}'), ('${P2}', 'student', NULL);
  GRANT SELECT ON public.profiles TO anon, authenticated, service_role;

  CREATE TABLE public.questions (id uuid PRIMARY KEY, content jsonb NOT NULL, answer_format text NOT NULL,
    answer_type text DEFAULT 'short', is_active boolean NOT NULL DEFAULT true);
  INSERT INTO public.questions VALUES
    ('${Q_MC}',       '{"question":"Hvem?","options":["Polen","Norge"],"correct":"Polen"}', 'mc', 'short', true),
    ('${Q_INACTIVE}', '{"question":"Hvornår?","options":["1939","1940"],"correct":"1939"}', 'mc', 'short', false),
    ('${Q_TEXT}',     '{"question":"Hvilket land?","correct":"Norge","accepted_answers":["Norge"]}', 'text', 'short', true),
    ('${Q_MC2}',      '{"question":"Hvor?","options":["Danmark","Sverige"],"correct":"Danmark"}', 'mc', 'short', true);
  GRANT ALL ON public.questions TO anon, authenticated, service_role;

  CREATE TABLE public.student_progress (student_id uuid PRIMARY KEY, xp integer DEFAULT 0, coins integer DEFAULT 0,
    correct_answers integer DEFAULT 0, total_correct_answers integer DEFAULT 0);
  INSERT INTO public.student_progress (student_id) VALUES ('${P1}'), ('${P2}');
  GRANT ALL ON public.student_progress TO anon, authenticated, service_role;

  -- question_instances as live (columns, defaults, unique indexes, RLS, policies, privileges).
  CREATE TABLE public.question_instances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL DEFAULT auth.uid(),
    question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    correct_answer text NOT NULL,
    difficulty_at_time integer NOT NULL,
    mastery_snapshot integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    answered boolean NOT NULL DEFAULT false,
    answered_at timestamptz, is_correct boolean, xp_awarded integer DEFAULT 0, next_due timestamptz,
    next_review_at timestamptz, incorrect_attempts integer DEFAULT 0, user_answer text, was_correct boolean,
    teacher_feedback text, teacher_score integer, reviewed_at timestamp, reviewed_by uuid,
    misconception_signal text, repeat_count integer NOT NULL DEFAULT 0
  );
  CREATE UNIQUE INDEX idx_student_question_instance ON public.question_instances (student_id, question_id);
  CREATE UNIQUE INDEX idx_one_open_question ON public.question_instances (student_id) WHERE (answered = false);
  ALTER TABLE public.question_instances ENABLE ROW LEVEL SECURITY;
  GRANT ALL ON public.question_instances TO anon, authenticated, service_role;
  CREATE POLICY "Students can insert own instances" ON public.question_instances
    AS PERMISSIVE FOR INSERT TO public WITH CHECK (student_id = auth.uid());
  CREATE POLICY "students can insert their own instances" ON public.question_instances
    AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id);
  CREATE POLICY "students read own question_instances" ON public.question_instances
    AS PERMISSIVE FOR SELECT TO authenticated USING (student_id = (SELECT auth.uid() AS uid));
  CREATE POLICY "teachers read own students question_instances" ON public.question_instances
    AS PERMISSIVE FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM profiles s
      WHERE s.id = question_instances.student_id AND s.teacher_id = (SELECT auth.uid() AS uid) AND s.role = 'student'));

  -- P1's existing history: one answered MC row.
  INSERT INTO public.question_instances (id, student_id, question_id, correct_answer, difficulty_at_time,
      mastery_snapshot, answered, answered_at, user_answer, was_correct, created_at)
    VALUES ('${I_OLD}', '${P1}', '${Q_MC2}', 'Danmark', 1, 1, true, '2026-09-01T10:00:05Z', 'Danmark', true, '2026-09-01T10:00:00Z');

  -- No-op stand-ins for the streak / quest helpers the award functions call.
  CREATE FUNCTION public.update_streak(uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION public.update_quest_progress_for_answer(uuid, boolean, integer) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION public.update_weekly_quest_progress_for_answer(uuid, boolean, integer) RETURNS void LANGUAGE sql AS $$ SELECT $$;

  -- LIVE body of process_question_attempt (2026-10-15).
  CREATE FUNCTION public.process_question_attempt(p_student_id uuid, p_question_instance_id uuid, p_answer text, p_question_shown_at bigint)
   RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  DECLARE
    v_instance record; v_correct boolean := false; v_answer text; v_correct_answer text;
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

  -- LIVE body of process_text_answer (2026-10-15).
  CREATE FUNCTION public.process_text_answer(p_instance_id uuid, p_user_id uuid, p_user_answer text, p_is_correct boolean)
   RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  DECLARE v_rows_updated INTEGER; v_next_review TIMESTAMPTZ;
  BEGIN
    v_next_review := CASE p_is_correct WHEN true THEN now() + INTERVAL '1 day' ELSE now() + INTERVAL '10 minutes' END;
    UPDATE question_instances SET user_answer = p_user_answer, was_correct = p_is_correct, answered = true,
      answered_at = now(), next_review_at = v_next_review
     WHERE id = p_instance_id AND student_id = p_user_id AND answered = false;
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated = 0 THEN RETURN 'already_processed'; END IF;
    IF p_is_correct THEN
      UPDATE student_progress SET xp = COALESCE(xp, 0) + 10, coins = COALESCE(coins, 0) + 5,
        correct_answers = COALESCE(correct_answers, 0) + 1, total_correct_answers = COALESCE(total_correct_answers, 0) + 1
       WHERE student_id = p_user_id;
    END IF;
    PERFORM update_streak(p_user_id);
    PERFORM update_quest_progress_for_answer(p_user_id, p_is_correct, CASE WHEN p_is_correct THEN 10 ELSE 0 END);
    PERFORM public.update_weekly_quest_progress_for_answer(p_user_id, p_is_correct, CASE WHEN p_is_correct THEN 10 ELSE 0 END);
    RETURN CASE p_is_correct WHEN true THEN 'rewarded' ELSE 'recorded' END;
  END;
  $function$;
  -- Live EXECUTE lockdown (D-110): only the backend.
  REVOKE EXECUTE ON FUNCTION public.process_question_attempt(uuid, uuid, text, bigint), public.process_text_answer(uuid, uuid, text, boolean) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.process_question_attempt(uuid, uuid, text, bigint), public.process_text_answer(uuid, uuid, text, boolean) TO service_role;
`;

async function db({ migrated }) {
  const pg = new PGlite();
  await pg.exec(FIXTURE);
  if (migrated) await pg.exec(MIGRATION);
  return pg;
}

// One statement as `role` with auth.uid() = uid. Rolled back unless keep = true.
// Returns { rows } or { error } — an error is a value here, not an exception.
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

const denied = (r) => Boolean(r.error) && /permission denied/i.test(r.error);

// A pupil's direct REST insert of their own instance with a key of their choosing.
const FORGE = `INSERT INTO public.question_instances (student_id, question_id, correct_answer, difficulty_at_time, mastery_snapshot)
               VALUES ($1, $2, $3, 1, 1) RETURNING id`;

// The backend (admin client): what get-next-question/instance-insert.ts writes.
const SERVER_INSERT = `INSERT INTO public.question_instances (student_id, question_id, answered, correct_answer,
                         difficulty_at_time, mastery_snapshot, next_review_at)
                       VALUES ($1, $2, false, $3, 1, 1, now()) RETURNING id`;

const progress = async (pg, id) => (await pg.query("SELECT xp, coins, correct_answers FROM public.student_progress WHERE student_id = $1", [id])).rows[0];
const allRows = async (pg) => (await pg.query("SELECT * FROM public.question_instances ORDER BY id")).rows;

// process-event, MC / number path: the backend calls process_question_attempt.
const answerMc = async (pg, uid, instanceId, answer) =>
  (await as(pg, "service_role", null, "SELECT public.process_question_attempt($1, $2, $3, 0) AS r", [uid, instanceId, answer], true)).rows[0].r;

// process-event, short-text path: ownership, evaluator against the instance key, then the RPC.
async function answerText(pg, uid, instanceId, answer) {
  const inst = (await pg.query(
    `SELECT qi.student_id, qi.correct_answer, q.content FROM public.question_instances qi
       JOIN public.questions q ON q.id = qi.question_id WHERE qi.id = $1`, [instanceId])).rows[0];
  if (inst.student_id !== uid) return { http: 403 };
  const isCorrect = isTextAnswerCorrect(answer, inst.correct_answer, inst.content?.accepted_answers);
  const rpc = (await as(pg, "service_role", null, "SELECT public.process_text_answer($1, $2, $3, $4) AS r",
    [instanceId, uid, answer, isCorrect], true)).rows[0].r;
  return { http: 200, status: isCorrect ? "correct" : "incorrect", rpc };
}

// ── The vulnerability, live today ───────────────────────────────────────────────────────────────
test("OLD state: a pupil inserts an instance with their own key and is paid for it (MC, inactive question)", async () => {
  const pg = await db({ migrated: false });
  const r = await as(pg, "authenticated", P1, FORGE, [P1, Q_INACTIVE, "anything"], true);
  assert.ok(!r.error, r.error);
  const before = await progress(pg, P1);
  const res = await answerMc(pg, P1, r.rows[0].id, "anything");
  assert.equal(res.status, "correct", "graded against the pupil's own key");
  const after = await progress(pg, P1);
  assert.equal(after.xp - before.xp, 10);
  assert.equal(after.coins - before.coins, 5);
});

test("OLD state: the same works for short text — the evaluator reads the forged instance key", async () => {
  const pg = await db({ migrated: false });
  const r = await as(pg, "authenticated", P1, FORGE, [P1, Q_TEXT, "zzz"], true);
  assert.ok(!r.error, r.error);
  const res = await answerText(pg, P1, r.rows[0].id, "zzz");
  assert.deepEqual({ status: res.status, rpc: res.rpc }, { status: "correct", rpc: "rewarded" });
});

test("OLD state: a pupil can also forge a whole answered history row, teacher fields included", async () => {
  const pg = await db({ migrated: false });
  const r = await as(pg, "authenticated", P1,
    `INSERT INTO public.question_instances (student_id, question_id, correct_answer, difficulty_at_time, mastery_snapshot,
       answered, was_correct, user_answer, teacher_score, teacher_feedback, reviewed_by)
     VALUES ($1, $2, 'x', 1, 1, true, true, 'x', 3, 'Flot', $3) RETURNING id`, [P1, Q_MC, T1]);
  assert.ok(!r.error, r.error);
});

// ── After the migration ─────────────────────────────────────────────────────────────────────────
test("1. after: a pupil can no longer insert any instance — own key, inactive question or forged history", async () => {
  const pg = await db({ migrated: true });
  assert.ok(denied(await as(pg, "authenticated", P1, FORGE, [P1, Q_INACTIVE, "anything"])));
  assert.ok(denied(await as(pg, "authenticated", P1, FORGE, [P1, Q_MC, "Polen"])), "not even the honest key");
  assert.ok(denied(await as(pg, "authenticated", P1, FORGE, [P1, Q_TEXT, "zzz"])));
  assert.ok(denied(await as(pg, "authenticated", P1,
    `INSERT INTO public.question_instances (question_id, correct_answer, difficulty_at_time, mastery_snapshot, answered, was_correct)
     VALUES ($1, 'x', 1, 1, true, true)`, [Q_MC])), "relying on the student_id default does not help");
  assert.ok(denied(await as(pg, "authenticated", P1, FORGE, [P2, Q_MC, "Polen"])), "nor for another pupil");
  assert.equal((await allRows(pg)).length, 1, "only the existing history row exists");
});

test("2. after: anon cannot insert either", async () => {
  const pg = await db({ migrated: true });
  assert.ok(denied(await as(pg, "anon", null, FORGE, [P1, Q_MC, "Polen"])));
});

test("3. after: no forged instance means nothing to be paid for — rewards cannot be self-awarded", async () => {
  const pg = await db({ migrated: true });
  const before = await progress(pg, P1);
  const r = await as(pg, "authenticated", P1, FORGE, [P1, Q_INACTIVE, "anything"], true);
  assert.ok(denied(r));
  // The award RPCs remain backend-only (EXECUTE lockdown) — a pupil cannot call them directly either.
  assert.ok(denied(await as(pg, "authenticated", P1, "SELECT public.process_question_attempt($1, $2, 'x', 0)", [P1, I_OLD])));
  assert.ok(denied(await as(pg, "authenticated", P1, "SELECT public.process_text_answer($1, $2, 'x', true)", [I_OLD, P1])));
  assert.deepEqual(await progress(pg, P1), before);
});

test("4. after: the backend (service_role = admin client) still creates instances", async () => {
  const pg = await db({ migrated: true });
  const r = await as(pg, "service_role", null, SERVER_INSERT, [P1, Q_MC, "Polen"], true);
  assert.ok(!r.error, r.error);
  const row = (await pg.query("SELECT * FROM public.question_instances WHERE id = $1", [r.rows[0].id])).rows[0];
  assert.equal(row.student_id, P1);
  assert.equal(row.answered, false);
  assert.equal(row.was_correct, null);
  assert.equal(row.teacher_score, null);
  assert.equal(row.repeat_count, 0);
});

test("5. after: the MC reward path is unchanged — correct pays 10/5 once, incorrect pays nothing", async () => {
  const pg = await db({ migrated: true });
  const a = (await as(pg, "service_role", null, SERVER_INSERT, [P1, Q_MC, "Polen"], true)).rows[0].id;
  const p0 = await progress(pg, P1);
  assert.equal((await answerMc(pg, P1, a, "Polen")).status, "correct");
  const p1 = await progress(pg, P1);
  assert.deepEqual({ xp: p1.xp - p0.xp, coins: p1.coins - p0.coins, c: p1.correct_answers - p0.correct_answers }, { xp: 10, coins: 5, c: 1 });
  // Double submission: reported, never paid twice.
  assert.equal((await answerMc(pg, P1, a, "Polen")).status, "correct");
  assert.deepEqual(await progress(pg, P1), p1);

  const b = (await as(pg, "service_role", null, SERVER_INSERT, [P2, Q_MC, "Polen"], true)).rows[0].id;
  const q0 = await progress(pg, P2);
  assert.equal((await answerMc(pg, P2, b, "Norge")).status, "incorrect");
  assert.deepEqual(await progress(pg, P2), q0);
});

test("6. after: the short-text reward path is unchanged — correct, normalised, wrong, double, ownership", async () => {
  const pg = await db({ migrated: true });
  const a = (await as(pg, "service_role", null, SERVER_INSERT, [P1, Q_TEXT, "Norge"], true)).rows[0].id;
  const p0 = await progress(pg, P1);
  assert.deepEqual(await answerText(pg, P2, a, "Norge"), { http: 403 }, "another pupil's instance is refused");
  assert.deepEqual(await answerText(pg, P1, a, "  nORGE. "), { http: 200, status: "correct", rpc: "rewarded" });
  const p1 = await progress(pg, P1);
  assert.equal(p1.xp - p0.xp, 10);
  assert.equal(p1.coins - p0.coins, 5);
  assert.equal((await answerText(pg, P1, a, "Norge")).rpc, "already_processed");
  assert.deepEqual(await progress(pg, P1), p1, "never paid twice");

  const b = (await as(pg, "service_role", null, SERVER_INSERT, [P2, Q_TEXT, "Norge"], true)).rows[0].id;
  const q0 = await progress(pg, P2);
  assert.deepEqual(await answerText(pg, P2, b, "Sverige"), { http: 200, status: "incorrect", rpc: "recorded" });
  assert.deepEqual(await progress(pg, P2), q0);
});

test("7. after: reading is unchanged — own rows, the teacher's pupils, nobody else's", async () => {
  const pg = await db({ migrated: true });
  await as(pg, "service_role", null, SERVER_INSERT, [P2, Q_MC, "Polen"], true);
  const own = await as(pg, "authenticated", P1, "SELECT id FROM public.question_instances");
  assert.deepEqual(own.rows.map((r) => r.id), [I_OLD]);
  const other = await as(pg, "authenticated", P2, "SELECT id, student_id FROM public.question_instances");
  assert.deepEqual(other.rows.map((r) => r.student_id), [P2]);
  const teacher = await as(pg, "authenticated", T1, "SELECT id FROM public.question_instances");
  assert.deepEqual(teacher.rows.map((r) => r.id), [I_OLD], "T1 sees P1 (own pupil), not P2");
  assert.deepEqual((await as(pg, "anon", null, "SELECT id FROM public.question_instances")).rows, []);
});

test("8. existing history is untouched by the migration — byte for byte", async () => {
  const pg = await db({ migrated: false });
  const before = JSON.stringify(await allRows(pg));
  await pg.exec(MIGRATION);
  assert.equal(JSON.stringify(await allRows(pg)), before);
});

test("9. resulting privileges and policies: INSERT gone for anon/authenticated, everything else as before", async () => {
  const pg = await db({ migrated: true });
  const priv = async (role, p) => (await pg.query("SELECT has_table_privilege($1, 'public.question_instances', $2) AS ok", [role, p])).rows[0].ok;
  assert.equal(await priv("authenticated", "INSERT"), false);
  assert.equal(await priv("anon", "INSERT"), false);
  assert.equal(await priv("service_role", "INSERT"), true);
  for (const role of ["anon", "authenticated"]) {
    for (const p of ["SELECT", "UPDATE", "DELETE"]) assert.equal(await priv(role, p), true, `${role} ${p} unchanged`);
  }
  const policies = (await pg.query(
    "SELECT policyname, cmd FROM pg_policies WHERE tablename = 'question_instances' ORDER BY policyname")).rows;
  assert.deepEqual(policies, [
    { policyname: "students read own question_instances", cmd: "SELECT" },
    { policyname: "teachers read own students question_instances", cmd: "SELECT" },
  ]);
  const rls = (await pg.query("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.question_instances'::regclass")).rows[0];
  assert.equal(rls.relrowsecurity, true);
});

test("10. applied twice, the second run fails loudly and changes nothing", async () => {
  const pg = await db({ migrated: true });
  const before = JSON.stringify(await allRows(pg));
  await assert.rejects(pg.exec(MIGRATION), /does not exist/);
  assert.equal(JSON.stringify(await allRows(pg)), before);
});

test("11. the documented rollback restores the old behaviour exactly", async () => {
  const pg = await db({ migrated: true });
  const header = MIGRATION.split("\n").filter((l) => /^--   (GRANT|CREATE POLICY|  AS PERMISSIVE)/.test(l))
    .map((l) => l.replace(/^--\s{3}/, "")).join("\n");
  assert.match(header, /GRANT INSERT ON public\.question_instances TO anon, authenticated;/);
  await pg.exec(header);
  const r = await as(pg, "authenticated", P1, FORGE, [P1, Q_MC, "x"]);
  assert.ok(!r.error, "rollback re-opens the client insert, exactly as before");
  const policies = (await pg.query(
    "SELECT policyname, roles::text, with_check FROM pg_policies WHERE tablename = 'question_instances' AND cmd = 'INSERT' ORDER BY policyname")).rows;
  assert.deepEqual(policies.map((p) => p.policyname), ["Students can insert own instances", "students can insert their own instances"]);
});

test("12. the file does only what it says: two DROP POLICY and one REVOKE INSERT, nothing else", () => {
  const code = MIGRATION.replace(/--.*$/gm, "").split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  assert.deepEqual(code, [
    'DROP POLICY "Students can insert own instances" ON public.question_instances',
    'DROP POLICY "students can insert their own instances" ON public.question_instances',
    "REVOKE INSERT ON public.question_instances FROM PUBLIC, anon, authenticated",
  ]);
});

test("13. the file sorts after the newest migration live when it was written (stav_til_first_questions)", () => {
  const files = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
  assert.ok(files.includes(FILE));
  assert.ok(FILE.slice(0, 14) > "20261011094747", "after the repo file of the newest live migration");
});
