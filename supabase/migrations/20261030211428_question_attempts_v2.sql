-- Permanent answer history with protection against stale submissions (D-266, H5) — PR 1 of 6:
-- the database half only. Nothing in production calls the objects created here until PR 2–4
-- (get-next-question, process-event, app.js) are deployed and the activation step (PR 5) is
-- separately approved. Applying this file changes no existing behaviour.
--
-- WHY
-- A repeat reopens the pupil's existing question_instances row and overwrites the first answer
-- (D-263 §8.2). question_attempts keeps every answer as its own append-only row. The owner made
-- protection against stale submissions a binding condition (D-266 §1, point 7): an answer that
-- belongs to an earlier round must never be accepted in a new round, and a technical retry must
-- never register or pay out again. H5 (owner decision 2026-10-30) fixes the mechanism:
--   * round_no      = question_instances.repeat_count + 1, issued by the server with the question
--                     (get-next-question, PR 2). Only the server opens rounds (insert or
--                     request_repeat_*), and every reopen raises repeat_count by exactly 1 — the
--                     guard trigger below makes that an invariant instead of a convention.
--   * submission_id = a uuid the browser creates once per deliberate answer and re-sends unchanged
--                     on a technical retry (app.js, PR 4). Stored per pupil, unique.
--   * the result the pupil was shown is frozen in the attempt row, so a replay returns exactly the
--     original result even if the question's content, aliases or answer key change later.
--
-- WHAT THIS FILE CREATES
--   0. Preconditions: the two answer functions whose reward rules the _v2 functions mirror, and the
--      five functions that reopen or release rounds, still have the bodies the analysis was made
--      against (md5 of prosrc, read from production 2026-10-30); no other function updates
--      answered or repeat_count in question_instances; question_instances has no trigger yet. Any
--      mismatch stops the migration.
--   1. UNIQUE (id, student_id) on question_instances, the target of the composite FK. id is already
--      the primary key, so no existing row can violate it and no row is changed.
--   2. public.question_attempts: one row per registered answer, with the frozen result, the amounts
--      the function actually added, and the submission/round it came from. RLS on, no policies;
--      no privilege for PUBLIC, anon or authenticated; service_role may only SELECT.
--   3. Append-only: a BEFORE UPDATE trigger rejects every update, for every role. Rows disappear
--      only through ON DELETE CASCADE (pupil deleted, or instance deleted).
--   4. Round guard on question_instances: repeat_count may change, and answered may go from true to
--      false, ONLY together, as one reopen with repeat_count + 1. All nine functions that update
--      question_instances in production comply (verified 2026-10-30): process_question_attempt and
--      process_text_answer (false → true), release_open_question_outside (false → true; its DELETE
--      branch is not an UPDATE), the four request_repeat_* (true → false with + 1), and the two
--      review_answer overloads (teacher fields only — the trigger does not even fire for them,
--      it is limited to UPDATE OF answered, repeat_count). process-event's own writes
--      (user_answer, misconception_signal, next_review_at) do not touch those columns either.
--   5. process_question_attempt_v2 (MC / number) and process_text_answer_v2 (short text). Same
--      grading, amounts, streak and quest calls as the live functions they mirror, plus the round
--      check, the submission replay, the attempt row and the misconception signal in ONE
--      transaction. Callable by service_role only.
--
-- WHAT THIS FILE DOES NOT DO
--   * process_question_attempt and process_text_answer are NOT changed: their bodies, signatures and
--     grants stay as they are, so the live answer flow keeps working while PR 2–4 are prepared.
--     Retiring them (REVOKE EXECUTE from service_role) is the separately approved activation (PR 5).
--   * No backfill and no data change: question_attempts starts empty, and no existing
--     question_instances row is updated. Open rounds (43 on 2026-10-30) need nothing: their round_no
--     is derived from the repeat_count they already have.
--   * Long answers and teacher reviews are not covered (H4 and D-266 step 5). The history must not
--     be called complete while they are missing.
--
-- THE _v2 CONTRACT (every expected case is an outcome, never an exception)
--   recorded            the answer was registered now; status, correct_answer, review_text,
--                       misconception_type, xp_awarded, coins_awarded, round_no
--   replay              this submission_id was registered before (same instance, round and answer):
--                       the frozen original result, nothing is written or paid
--   round_closed        round_no is the current round, but the round is already closed (answered by
--                       another submission, or released at a subject switch); nothing is written
--   stale_round         round_no belongs to an earlier round; nothing is written
--   submission_conflict the submission_id was used for another instance, round or answer
--   not_found           no such instance for this pupil
--   invalid_request     missing/invalid input, a round_no ahead of the current round, or an
--                       instance that belongs to the other answer path
-- Order of checks, all after the row lock: replay → answer path → round → closed → register.
--
-- TRANSACTION SAFETY
-- The instance row is locked first (SELECT … FOR UPDATE), so two calls for the same instance run
-- one after the other; the second sees the first's committed attempt (READ COMMITTED: every
-- statement after the lock takes a new snapshot) and returns replay or round_closed. Every write —
-- the answer on the instance, the misconception signal, XP/coins/counters, streak, quests and the
-- attempt row — happens in one sub-block after all checks; any error rolls all of it back. The only
-- error turned into an outcome is a unique violation on question_attempts_submission_key (the same
-- submission_id racing on two different instances): the sub-block is rolled back first, so nothing
-- is kept. The unique keys are the last line of defence, not the mechanism.
--
-- ROLLBACK (before activation nothing calls these objects): DROP FUNCTION the two _v2 functions,
-- DROP TRIGGER question_instances_round_guard, DROP TABLE public.question_attempts, DROP the two
-- trigger functions, ALTER TABLE public.question_instances DROP CONSTRAINT
-- question_instances_id_student_id_key. After activation, rollback is forward-fix by default; see
-- the activation runbook (PR 5).
--
-- Applying this file to production needs its own owner authorisation (D-110): apply_migration
-- only, never `supabase db push`.

-- ── 0. Preconditions ─────────────────────────────────────────────────────────
DO $pre$
DECLARE
  v_expected CONSTANT jsonb := jsonb_build_object(
    'public.process_question_attempt(uuid,uuid,text,bigint)',                    '8f698c5b45ecfe9a1988215dd8849d67',
    'public.process_text_answer(uuid,uuid,text,boolean)',                        'e80727ea87ffdc64988e5a09dcb20356',
    'public.release_open_question_outside(text[])',                              '7b7693b3bff869a113e8e97e16bb456a',
    'public.request_repeat_question(smallint,text[])',                           '54ab9354d309c014e94e902fd6f885f4',
    'public.request_repeat_question_for_student(uuid,smallint,text[])',          'b27c917b9225bca58ad756e7952c49db',
    'public.request_repeat_question_servable_for_student(uuid,smallint,text[])', 'e31009c5924d0fbe4f11731df7f94290',
    'public.request_repeat_level_question_for_student(uuid,text[])',             'ee153327dae5a5686e9c5efd247d27c0');
  r      record;
  v_hash text;
BEGIN
  FOR r IN SELECT key, value FROM jsonb_each_text(v_expected) LOOP
    SELECT md5(p.prosrc) INTO v_hash FROM pg_catalog.pg_proc p WHERE p.oid = to_regprocedure(r.key);
    IF v_hash IS NULL THEN
      RAISE EXCEPTION 'H5 PR 1: % findes ikke — migrationen er analyseret mod en anden database', r.key;
    END IF;
    IF v_hash IS DISTINCT FROM r.value THEN
      RAISE EXCEPTION 'H5 PR 1: % er ændret siden analysen 2026-10-30 (md5 %, forventet %) — gennemgå rundevagten og _v2 igen', r.key, v_hash, r.value;
    END IF;
  END LOOP;

  -- Only an UPDATE that names answered or repeat_count can fire the round guard (it is limited to
  -- UPDATE OF answered, repeat_count), so only such writers need to be known. Writers that touch other
  -- columns only (the teacher-review functions: teacher_score, teacher_feedback, reviewed_*) cannot
  -- trip it and are not listed.
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosrc ~* 'update\s+(public\.)?question_instances\M'
      AND p.prosrc ~* '\m(answered|repeat_count)\M'
      AND p.oid::regprocedure::text NOT IN (SELECT to_regprocedure(k)::text FROM jsonb_object_keys(v_expected) AS k)
  LOOP
    RAISE EXCEPTION 'H5 PR 1: en ukendt funktion opdaterer answered/repeat_count i question_instances: % — rundevagten er ikke vurderet mod den', r.sig;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
             WHERE t.tgrelid = 'public.question_instances'::regclass AND NOT t.tgisinternal) THEN
    RAISE EXCEPTION 'H5 PR 1: question_instances har allerede en trigger — rundevagten er analyseret uden';
  END IF;
END
$pre$;

-- ── 1. Composite FK target ───────────────────────────────────────────────────
ALTER TABLE public.question_instances
  ADD CONSTRAINT question_instances_id_student_id_key UNIQUE (id, student_id);

-- ── 2. The attempt log ───────────────────────────────────────────────────────
CREATE TABLE public.question_attempts (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  question_instance_id     uuid        NOT NULL,
  student_id               uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  attempt_no               integer     NOT NULL CHECK (attempt_no >= 1),
  submission_id            uuid        NOT NULL,
  grading                  text        NOT NULL CHECK (grading IN ('auto', 'teacher')),
  status                   text        NOT NULL,
  was_correct              boolean,
  user_answer              text        NOT NULL,
  answer_format            text        NOT NULL,
  answer_type              text        NOT NULL,
  is_repeat                boolean     NOT NULL,
  correct_answer_shown     text,
  review_text_shown        text,
  misconception_type_shown text,
  answered_at              timestamptz NOT NULL,
  xp_awarded               integer     NOT NULL CHECK (xp_awarded >= 0),
  coins_awarded            integer     NOT NULL CHECK (coins_awarded >= 0),
  source                   text        NOT NULL
    CHECK (source IN ('process_question_attempt_v2', 'process_text_answer_v2')),
  created_at               timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT question_attempts_result_check CHECK (
    (grading = 'auto' AND was_correct IS NOT NULL
      AND status = CASE WHEN was_correct THEN 'correct' ELSE 'incorrect' END)
    OR (grading = 'teacher' AND was_correct IS NULL AND status = 'pending')),
  CONSTRAINT question_attempts_round_key UNIQUE (question_instance_id, attempt_no),
  CONSTRAINT question_attempts_submission_key UNIQUE (student_id, submission_id),
  CONSTRAINT question_attempts_instance_fkey FOREIGN KEY (question_instance_id, student_id)
    REFERENCES public.question_instances (id, student_id) ON DELETE CASCADE
);

CREATE INDEX question_attempts_student_answered_idx
  ON public.question_attempts (student_id, answered_at, id);

COMMENT ON TABLE public.question_attempts IS
  'Append-only answer history (D-266, H5). One row per registered answer, written only by process_question_attempt_v2 / process_text_answer_v2. Not complete: long answers and teacher reviews are not covered yet.';

ALTER TABLE public.question_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.question_attempts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.question_attempts TO service_role;

-- ── 3. Append-only ───────────────────────────────────────────────────────────
CREATE FUNCTION public.question_attempts_reject_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'question_attempts er append-only: forsøg % kan ikke ændres', OLD.id
    USING ERRCODE = 'restrict_violation';
END;
$function$;

REVOKE ALL ON FUNCTION public.question_attempts_reject_update() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER question_attempts_append_only
  BEFORE UPDATE ON public.question_attempts
  FOR EACH ROW EXECUTE FUNCTION public.question_attempts_reject_update();

-- ── 4. Round guard ───────────────────────────────────────────────────────────
CREATE FUNCTION public.question_instances_round_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.repeat_count IS DISTINCT FROM OLD.repeat_count OR (OLD.answered AND NOT NEW.answered) THEN
    IF NOT (OLD.answered AND NOT NEW.answered AND NEW.repeat_count = OLD.repeat_count + 1) THEN
      RAISE EXCEPTION 'question_instances_round_guard: en runde kan kun genåbnes med repeat_count + 1'
        USING ERRCODE = 'check_violation',
              DETAIL  = format('instance %s: answered %s -> %s, repeat_count %s -> %s',
                               OLD.id, OLD.answered, NEW.answered, OLD.repeat_count, NEW.repeat_count);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.question_instances_round_guard() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER question_instances_round_guard
  BEFORE UPDATE OF answered, repeat_count ON public.question_instances
  FOR EACH ROW EXECUTE FUNCTION public.question_instances_round_guard();

-- ── 5a. MC / number ──────────────────────────────────────────────────────────
-- Grading and rewards mirror process_question_attempt (md5 8f698c5b…, D-211): the Danish
-- orthography aliases, the normalised comparison, 10 XP + 5 coins + both counters for a first
-- correct answer, 2 XP + 1 coin for a correct repeat, update_streak always, quests only when not a
-- repeat. p_review_text and p_misconception_type are what process-event shows today for a wrong
-- answer (extractReviewText / extractMisconceptionType); they are frozen in the attempt and the
-- misconception signal is written in this transaction instead of a separate request.
CREATE FUNCTION public.process_question_attempt_v2(
  p_student_id           uuid,
  p_question_instance_id uuid,
  p_answer               text,
  p_round_no             integer,
  p_submission_id        uuid,
  p_review_text          text,
  p_misconception_type   text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_instance   public.question_instances%ROWTYPE;
  v_attempt    public.question_attempts%ROWTYPE;
  v_format     text;
  v_type       text;
  v_content    jsonb;
  v_metadata   jsonb;
  v_aliases    jsonb;
  v_key        text;
  v_correct    boolean := false;
  v_is_repeat  boolean;
  v_xp         integer := 0;
  v_coins      integer := 0;
  v_review     text;
  v_misc       text;
  v_now        timestamptz := now();
  v_rows       integer;
  v_constraint text;
BEGIN
  IF p_student_id IS NULL OR p_question_instance_id IS NULL OR p_submission_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'missing_identity');
  END IF;
  IF p_round_no IS NULL OR p_round_no < 1 THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'invalid_round');
  END IF;
  IF p_answer IS NULL OR p_answer = '' THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'missing_answer');
  END IF;

  SELECT qi.* INTO v_instance
  FROM public.question_instances qi
  WHERE qi.id = p_question_instance_id AND qi.student_id = p_student_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;

  SELECT a.* INTO v_attempt
  FROM public.question_attempts a
  WHERE a.student_id = p_student_id AND a.submission_id = p_submission_id;

  IF FOUND THEN
    IF v_attempt.question_instance_id = p_question_instance_id
       AND v_attempt.attempt_no = p_round_no
       AND v_attempt.user_answer = p_answer
       AND v_attempt.source = 'process_question_attempt_v2' THEN
      RETURN jsonb_build_object(
        'outcome',            'replay',
        'status',             v_attempt.status,
        'correct_answer',     v_attempt.correct_answer_shown,
        'review_text',        v_attempt.review_text_shown,
        'misconception_type', v_attempt.misconception_type_shown,
        'xp_awarded',         v_attempt.xp_awarded,
        'coins_awarded',      v_attempt.coins_awarded,
        'round_no',           v_attempt.attempt_no);
    END IF;
    RETURN jsonb_build_object('outcome', 'submission_conflict');
  END IF;

  SELECT q.answer_format, q.answer_type, q.content, q.metadata
  INTO v_format, v_type, v_content, v_metadata
  FROM public.questions q
  WHERE q.id = v_instance.question_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'process_question_attempt_v2: spørgsmålet til instans % findes ikke', v_instance.id;
  END IF;

  -- process-event's routing: answer_type 'long' → long path; a format containing 'text' → short text.
  IF coalesce(v_type, '') = 'long' OR strpos(lower(coalesce(v_format, '')), 'text') > 0 THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'answer_path');
  END IF;

  IF p_round_no < v_instance.repeat_count + 1 THEN
    RETURN jsonb_build_object('outcome', 'stale_round');
  END IF;
  IF p_round_no > v_instance.repeat_count + 1 THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'round_ahead');
  END IF;
  IF v_instance.answered THEN
    RETURN jsonb_build_object('outcome', 'round_closed');
  END IF;

  -- Only the reviewed old/new spellings of this question's correct option are aliases.
  v_aliases := v_metadata -> 'danish_orthography_correct_aliases';
  IF jsonb_typeof(v_aliases) IS DISTINCT FROM 'array' THEN
    v_aliases := '[]'::jsonb;
  END IF;
  IF jsonb_array_length(v_aliases) = 2
     AND v_aliases ? v_instance.correct_answer
     AND v_aliases ? (v_content ->> 'correct') THEN
    v_key := v_content ->> 'correct';
  ELSE
    v_key := v_instance.correct_answer;
    v_aliases := '[]'::jsonb;
  END IF;

  IF trim(regexp_replace(lower(p_answer), '[^a-z0-9]', '', 'g'))
       = trim(regexp_replace(lower(v_key), '[^a-z0-9]', '', 'g'))
     OR v_aliases ? p_answer THEN
    v_correct := true;
  END IF;

  v_is_repeat := v_instance.repeat_count > 0;
  v_review    := CASE WHEN v_correct THEN NULL ELSE nullif(p_review_text, '') END;
  v_misc      := CASE WHEN v_correct THEN NULL ELSE nullif(p_misconception_type, '') END;

  BEGIN
    UPDATE public.question_instances
    SET answered             = true,
        answered_at          = v_now,
        user_answer          = p_answer,
        was_correct          = v_correct,
        misconception_signal = coalesce(v_misc, misconception_signal)
    WHERE id = v_instance.id AND student_id = p_student_id AND answered = false;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'process_question_attempt_v2: instans % blev ikke besvaret (% rækker) trods rækkelås', v_instance.id, v_rows;
    END IF;

    IF v_correct THEN
      IF v_is_repeat THEN
        -- A repeat earns a token amount: 1 coin and 2 XP (D-211); the accuracy counters stay put.
        UPDATE public.student_progress
        SET xp    = COALESCE(xp, 0) + 2,
            coins = COALESCE(coins, 0) + 1
        WHERE student_id = p_student_id;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows = 1 THEN v_xp := 2; v_coins := 1; END IF;
      ELSE
        UPDATE public.student_progress
        SET xp                    = COALESCE(xp, 0) + 10,
            coins                 = COALESCE(coins, 0) + 5,
            correct_answers       = COALESCE(correct_answers, 0) + 1,
            total_correct_answers = COALESCE(total_correct_answers, 0) + 1
        WHERE student_id = p_student_id;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows = 1 THEN v_xp := 10; v_coins := 5; END IF;
      END IF;
    END IF;

    PERFORM public.update_streak(p_student_id);

    -- Quests are not advanced by repeats (D-211).
    IF NOT v_is_repeat THEN
      PERFORM public.update_quest_progress_for_answer(
        p_student_id, v_correct, CASE WHEN v_correct THEN 10 ELSE 0 END);
      PERFORM public.update_weekly_quest_progress_for_answer(
        p_student_id, v_correct, CASE WHEN v_correct THEN 10 ELSE 0 END);
    END IF;

    INSERT INTO public.question_attempts (
      question_instance_id, student_id, attempt_no, submission_id, grading, status, was_correct,
      user_answer, answer_format, answer_type, is_repeat, correct_answer_shown, review_text_shown,
      misconception_type_shown, answered_at, xp_awarded, coins_awarded, source)
    VALUES (
      v_instance.id, p_student_id, v_instance.repeat_count + 1, p_submission_id, 'auto',
      CASE WHEN v_correct THEN 'correct' ELSE 'incorrect' END, v_correct,
      p_answer, coalesce(v_format, ''), coalesce(nullif(v_type, ''), 'short'), v_is_repeat, v_key,
      v_review, v_misc, v_now, v_xp, v_coins, 'process_question_attempt_v2')
    RETURNING * INTO v_attempt;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'question_attempts_submission_key' THEN
        RETURN jsonb_build_object('outcome', 'submission_conflict');
      END IF;
      RAISE;
  END;

  RETURN jsonb_build_object(
    'outcome',            'recorded',
    'status',             v_attempt.status,
    'correct_answer',     v_attempt.correct_answer_shown,
    'review_text',        v_attempt.review_text_shown,
    'misconception_type', v_attempt.misconception_type_shown,
    'xp_awarded',         v_attempt.xp_awarded,
    'coins_awarded',      v_attempt.coins_awarded,
    'round_no',           v_attempt.attempt_no);
END;
$function$;

-- ── 5b. Short text ───────────────────────────────────────────────────────────
-- Rewards mirror process_text_answer (md5 e80727ea…): correctness comes from process-event's
-- isTextAnswerCorrect (p_is_correct); a correct answer earns 10 XP + 5 coins + both counters;
-- next_review_at is 1 day (correct) or 10 minutes (wrong); update_streak and both quest helpers
-- always run. Like the live function it has no repeat rule (short-text questions are never reopened
-- by request_repeat_*, which skip answer_format 'text'); is_repeat is still recorded truthfully.
CREATE FUNCTION public.process_text_answer_v2(
  p_instance_id        uuid,
  p_user_id            uuid,
  p_user_answer        text,
  p_is_correct         boolean,
  p_round_no           integer,
  p_submission_id      uuid,
  p_review_text        text,
  p_misconception_type text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_instance   public.question_instances%ROWTYPE;
  v_attempt    public.question_attempts%ROWTYPE;
  v_format     text;
  v_type       text;
  v_xp         integer := 0;
  v_coins      integer := 0;
  v_review     text;
  v_misc       text;
  v_now        timestamptz := now();
  v_rows       integer;
  v_constraint text;
BEGIN
  IF p_user_id IS NULL OR p_instance_id IS NULL OR p_submission_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'missing_identity');
  END IF;
  IF p_round_no IS NULL OR p_round_no < 1 THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'invalid_round');
  END IF;
  IF p_user_answer IS NULL OR p_user_answer = '' THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'missing_answer');
  END IF;
  IF p_is_correct IS NULL THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'missing_verdict');
  END IF;

  SELECT qi.* INTO v_instance
  FROM public.question_instances qi
  WHERE qi.id = p_instance_id AND qi.student_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;

  SELECT a.* INTO v_attempt
  FROM public.question_attempts a
  WHERE a.student_id = p_user_id AND a.submission_id = p_submission_id;

  IF FOUND THEN
    IF v_attempt.question_instance_id = p_instance_id
       AND v_attempt.attempt_no = p_round_no
       AND v_attempt.user_answer = p_user_answer
       AND v_attempt.source = 'process_text_answer_v2' THEN
      RETURN jsonb_build_object(
        'outcome',            'replay',
        'status',             v_attempt.status,
        'correct_answer',     v_attempt.correct_answer_shown,
        'review_text',        v_attempt.review_text_shown,
        'misconception_type', v_attempt.misconception_type_shown,
        'xp_awarded',         v_attempt.xp_awarded,
        'coins_awarded',      v_attempt.coins_awarded,
        'round_no',           v_attempt.attempt_no);
    END IF;
    RETURN jsonb_build_object('outcome', 'submission_conflict');
  END IF;

  SELECT q.answer_format, q.answer_type
  INTO v_format, v_type
  FROM public.questions q
  WHERE q.id = v_instance.question_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'process_text_answer_v2: spørgsmålet til instans % findes ikke', v_instance.id;
  END IF;

  IF coalesce(v_type, '') = 'long' OR strpos(lower(coalesce(v_format, '')), 'text') = 0 THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'answer_path');
  END IF;

  IF p_round_no < v_instance.repeat_count + 1 THEN
    RETURN jsonb_build_object('outcome', 'stale_round');
  END IF;
  IF p_round_no > v_instance.repeat_count + 1 THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'round_ahead');
  END IF;
  IF v_instance.answered THEN
    RETURN jsonb_build_object('outcome', 'round_closed');
  END IF;

  v_review := CASE WHEN p_is_correct THEN NULL ELSE nullif(p_review_text, '') END;
  v_misc   := CASE WHEN p_is_correct THEN NULL ELSE nullif(p_misconception_type, '') END;

  BEGIN
    UPDATE public.question_instances
    SET user_answer          = p_user_answer,
        was_correct          = p_is_correct,
        answered             = true,
        answered_at          = v_now,
        next_review_at       = CASE WHEN p_is_correct THEN v_now + interval '1 day'
                                    ELSE v_now + interval '10 minutes' END,
        misconception_signal = coalesce(v_misc, misconception_signal)
    WHERE id = v_instance.id AND student_id = p_user_id AND answered = false;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'process_text_answer_v2: instans % blev ikke besvaret (% rækker) trods rækkelås', v_instance.id, v_rows;
    END IF;

    IF p_is_correct THEN
      UPDATE public.student_progress
      SET xp                    = COALESCE(xp, 0) + 10,
          coins                 = COALESCE(coins, 0) + 5,
          correct_answers       = COALESCE(correct_answers, 0) + 1,
          total_correct_answers = COALESCE(total_correct_answers, 0) + 1
      WHERE student_id = p_user_id;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows = 1 THEN v_xp := 10; v_coins := 5; END IF;
    END IF;

    PERFORM public.update_streak(p_user_id);
    PERFORM public.update_quest_progress_for_answer(
      p_user_id, p_is_correct, CASE WHEN p_is_correct THEN 10 ELSE 0 END);
    PERFORM public.update_weekly_quest_progress_for_answer(
      p_user_id, p_is_correct, CASE WHEN p_is_correct THEN 10 ELSE 0 END);

    INSERT INTO public.question_attempts (
      question_instance_id, student_id, attempt_no, submission_id, grading, status, was_correct,
      user_answer, answer_format, answer_type, is_repeat, correct_answer_shown, review_text_shown,
      misconception_type_shown, answered_at, xp_awarded, coins_awarded, source)
    VALUES (
      v_instance.id, p_user_id, v_instance.repeat_count + 1, p_submission_id, 'auto',
      CASE WHEN p_is_correct THEN 'correct' ELSE 'incorrect' END, p_is_correct,
      p_user_answer, coalesce(v_format, ''), coalesce(nullif(v_type, ''), 'short'),
      v_instance.repeat_count > 0, v_instance.correct_answer, v_review, v_misc, v_now, v_xp, v_coins,
      'process_text_answer_v2')
    RETURNING * INTO v_attempt;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'question_attempts_submission_key' THEN
        RETURN jsonb_build_object('outcome', 'submission_conflict');
      END IF;
      RAISE;
  END;

  RETURN jsonb_build_object(
    'outcome',            'recorded',
    'status',             v_attempt.status,
    'correct_answer',     v_attempt.correct_answer_shown,
    'review_text',        v_attempt.review_text_shown,
    'misconception_type', v_attempt.misconception_type_shown,
    'xp_awarded',         v_attempt.xp_awarded,
    'coins_awarded',      v_attempt.coins_awarded,
    'round_no',           v_attempt.attempt_no);
END;
$function$;

-- ── 6. Privileges: backend only ──────────────────────────────────────────────
-- The public schema's default privileges grant EXECUTE on every new function to anon,
-- authenticated and service_role, and PostgreSQL grants it to PUBLIC. Both _v2 functions trust
-- p_student_id / p_user_id and p_is_correct, so only service_role (process-event's admin client,
-- after auth.getUser() and the ownership check) may call them.
REVOKE ALL ON FUNCTION public.process_question_attempt_v2(uuid, uuid, text, integer, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_question_attempt_v2(uuid, uuid, text, integer, uuid, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.process_text_answer_v2(uuid, uuid, text, boolean, integer, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_text_answer_v2(uuid, uuid, text, boolean, integer, uuid, text, text)
  TO service_role;
