-- H5 integration 1 of 2 (D-266, D-273): the H5 schema on a database that already runs D-280 part 1.
--
-- WHY THIS FILE EXISTS
-- 20261030211428_question_attempts_v2 creates the H5 schema and refuses to run unless
-- process_question_attempt and the three request_repeat_* functions have the bodies its analysis
-- was made against (md5 8f698c5b…, b27c917b…, e31009c5…, ee153327…). Production applied D-280 part 1
-- (20261031194600, applied 2026-11-01 as 20261101101401) and D-278 (20261031190000, applied as
-- 20261101101441) first, so those functions now have D-280's bodies and that file can no longer be
-- applied there — by design. It is not edited (merged migrations are append-only). This file brings
-- BOTH histories to the same, verified H5 schema:
--
--   repository replay   20261030211428 → D-278 → D-280 part 1 → THIS FILE (verifies, changes nothing)
--   production          D-280 part 1 + D-278 → THIS FILE (creates the H5 schema)
--
-- and 20261101140100 then aligns process_question_attempt_v2 with D-280's grading in both.
--
-- HOW (no condition is ever skipped silently)
--   1. State check, before anything is changed:
--      * the seven functions that update question_instances.answered / repeat_count must have
--        exactly the bodies production runs after D-280 part 1 (md5 below; read 2026-11-01); any
--        other body stops the migration;
--      * no other function may update answered or repeat_count (the same scan as 20261030211428,
--        which also knows the two _v2 functions once they exist);
--      * the H5 objects (table, index, unique key, four functions, two triggers) must be either ALL
--        absent — then nothing else may trigger on question_instances, and the schema is created — or
--        ALL present — then nothing is created. Anything in between stops the migration.
--   2. Creation: the statements of sections 1–6 of 20261030211428, byte for byte (each one EXECUTEd
--      verbatim; tests/unit/question-attempts-v2-bootstrap.test.mjs proves the identity).
--   3. Final check, in BOTH states, after the creation and inside the same block: every H5 object exactly as 20261030211428 creates it — function
--      bodies (md5), SECURITY DEFINER, search_path, EXECUTE, columns, named constraints, the foreign
--      key, the index, RLS without policies, table privileges and exactly the two triggers. A
--      database that does not match stops here.
-- ATOMIC: the state check, the creation and the final check are ONE statement (one DO block). A
-- failure anywhere — also in the final check, after every object was created — rolls back the whole
-- block, whether the runner wraps the file in a transaction or runs each statement on its own
-- (tests/unit/question-attempts-v2-bootstrap.test.mjs proves both). A failed run leaves nothing to
-- clean up and can simply be run again once the cause is fixed.
-- process_question_attempt_v2 keeps the original grading here (aliases only with EXACTLY two
-- entries); 20261101140100 changes it to D-280's rule. Nothing calls either _v2 function before H5
-- is activated (process-event in production is version 34, ENABLE_H5_SUBMISSIONS = false).
--
-- WHAT THIS FILE DOES NOT DO
--   No row is written or changed: question_attempts starts empty; question_instances only gains the
--   unique key (id is already the primary key, so no row can violate it) and the round guard, which
--   all seven writers obey (each reopen sets answered = false together with repeat_count + 1;
--   D-280's extra UPDATE of correct_answer does not name answered or repeat_count).
--   The legacy answer functions, D-278's functions and D-280's functions are not touched.
--
-- ROLLBACK (before activation nothing calls these objects): the rollback in 20261030211428's header —
-- DROP the two _v2 functions, DROP TRIGGER question_instances_round_guard, DROP TABLE
-- public.question_attempts, DROP the two trigger functions, ALTER TABLE public.question_instances DROP
-- CONSTRAINT question_instances_id_student_id_key. After activation: forward-fix (D-273).
--
-- Applying this file to production needs its own owner authorisation (D-110): apply_migration only,
-- never `supabase db push`.

-- ── 1–3. State check, creation and final check: one block, so all of it or nothing ───────────────
DO $h5_bootstrap$
DECLARE
  v_expected CONSTANT jsonb := jsonb_build_object(
    'public.process_question_attempt(uuid,uuid,text,bigint)',                  '328ea8f9a4fd260407b582dcecb7dfdf',
    'public.process_text_answer(uuid,uuid,text,boolean)',                      'e80727ea87ffdc64988e5a09dcb20356',
    'public.release_open_question_outside(text[])',                            '7b7693b3bff869a113e8e97e16bb456a',
    'public.request_repeat_question(smallint,text[])',                         '54ab9354d309c014e94e902fd6f885f4',
    'public.request_repeat_question_for_student(uuid,smallint,text[])',        '2ac19e786310b59051a44aed96b5bf46',
    'public.request_repeat_question_servable_for_student(uuid,smallint,text[])', '092555368551a096c29d6e60f58c17b1',
    'public.request_repeat_level_question_for_student(uuid,text[])',           'db8280ddee20254e876be7fb1fc57e4d');
  r         record;
  v_hash    text;
  v_present integer;
  v_cols    text;
  v_cons    text;
BEGIN
  FOR r IN SELECT key, value FROM jsonb_each_text(v_expected) LOOP
    SELECT md5(p.prosrc) INTO v_hash FROM pg_catalog.pg_proc p WHERE p.oid = to_regprocedure(r.key);
    IF v_hash IS NULL THEN
      RAISE EXCEPTION 'H5 bootstrap: % findes ikke', r.key;
    END IF;
    IF v_hash IS DISTINCT FROM r.value THEN
      RAISE EXCEPTION 'H5 bootstrap: % har ikke D-280 del 1''s krop (md5 %, forventet %) — gennemgå rundevagten og _v2 igen', r.key, v_hash, r.value;
    END IF;
  END LOOP;

  -- The same bodies with another security mode are another database: production runs six of the
  -- seven as SECURITY DEFINER and request_repeat_level_question_for_student as SECURITY INVOKER.
  FOR r IN SELECT key FROM jsonb_each_text(v_expected) LOOP
    IF (SELECT p.prosecdef FROM pg_catalog.pg_proc p WHERE p.oid = to_regprocedure(r.key))
       IS DISTINCT FROM (r.key <> 'public.request_repeat_level_question_for_student(uuid,text[])') THEN
      RAISE EXCEPTION 'H5 bootstrap: % har ikke produktionens SECURITY DEFINER/INVOKER', r.key;
    END IF;
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosrc ~* 'update\s+(public\.)?question_instances\M'
      AND p.prosrc ~* '\m(answered|repeat_count)\M'
      AND p.oid::regprocedure::text NOT IN (SELECT to_regprocedure(k)::text FROM jsonb_object_keys(v_expected) AS k)
      AND p.oid NOT IN (SELECT o FROM (VALUES (to_regprocedure('public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)')),
                                              (to_regprocedure('public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text)'))) AS v(o) WHERE o IS NOT NULL)
  LOOP
    RAISE EXCEPTION 'H5 bootstrap: en ukendt funktion opdaterer answered/repeat_count i question_instances: % — rundevagten er ikke vurderet mod den', r.sig;
  END LOOP;

  SELECT (to_regclass('public.question_attempts') IS NOT NULL)::int
       + (to_regclass('public.question_attempts_student_answered_idx') IS NOT NULL)::int
       + (EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'question_instances_id_student_id_key'
                    AND conrelid = 'public.question_instances'::regclass))::int
       + (to_regprocedure('public.question_attempts_reject_update()') IS NOT NULL)::int
       + (to_regprocedure('public.question_instances_round_guard()') IS NOT NULL)::int
       + (to_regprocedure('public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)') IS NOT NULL)::int
       + (to_regprocedure('public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text)') IS NOT NULL)::int
       + (EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'question_attempts_append_only' AND NOT tgisinternal))::int
       + (EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'question_instances_round_guard'
                    AND tgrelid = 'public.question_instances'::regclass))::int
  INTO v_present;

  IF v_present = 9 THEN
    -- Repository replay: 20261030211428 created the schema. Nothing is created; step 3 verifies it.
    RAISE NOTICE 'H5 bootstrap: H5-skemaet findes (20261030211428 er anvendt) — intet oprettes, alt kontrolleres';
  ELSIF v_present = 0 THEN
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
               WHERE t.tgrelid = 'public.question_instances'::regclass AND NOT t.tgisinternal) THEN
      RAISE EXCEPTION 'H5 bootstrap: question_instances har allerede en trigger — rundevagten er analyseret uden';
    END IF;
    RAISE NOTICE 'H5 bootstrap: H5-skemaet oprettes (sektion 1–6 fra 20261030211428, uændret)';

    EXECUTE $h5_ddl_01$ALTER TABLE public.question_instances
  ADD CONSTRAINT question_instances_id_student_id_key UNIQUE (id, student_id);$h5_ddl_01$;

    EXECUTE $h5_ddl_02$CREATE TABLE public.question_attempts (
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
);$h5_ddl_02$;

    EXECUTE $h5_ddl_03$CREATE INDEX question_attempts_student_answered_idx
  ON public.question_attempts (student_id, answered_at, id);$h5_ddl_03$;

    EXECUTE $h5_ddl_04$COMMENT ON TABLE public.question_attempts IS
  'Append-only answer history (D-266, H5). One row per registered answer, written only by process_question_attempt_v2 / process_text_answer_v2. Not complete: long answers and teacher reviews are not covered yet.';$h5_ddl_04$;

    EXECUTE $h5_ddl_05$ALTER TABLE public.question_attempts ENABLE ROW LEVEL SECURITY;$h5_ddl_05$;

    EXECUTE $h5_ddl_06$REVOKE ALL ON TABLE public.question_attempts FROM PUBLIC, anon, authenticated, service_role;$h5_ddl_06$;

    EXECUTE $h5_ddl_07$GRANT SELECT ON TABLE public.question_attempts TO service_role;$h5_ddl_07$;

    EXECUTE $h5_ddl_08$CREATE FUNCTION public.question_attempts_reject_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'question_attempts er append-only: forsøg % kan ikke ændres', OLD.id
    USING ERRCODE = 'restrict_violation';
END;
$function$;$h5_ddl_08$;

    EXECUTE $h5_ddl_09$REVOKE ALL ON FUNCTION public.question_attempts_reject_update() FROM PUBLIC, anon, authenticated, service_role;$h5_ddl_09$;

    EXECUTE $h5_ddl_10$CREATE TRIGGER question_attempts_append_only
  BEFORE UPDATE ON public.question_attempts
  FOR EACH ROW EXECUTE FUNCTION public.question_attempts_reject_update();$h5_ddl_10$;

    EXECUTE $h5_ddl_11$CREATE FUNCTION public.question_instances_round_guard()
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
$function$;$h5_ddl_11$;

    EXECUTE $h5_ddl_12$REVOKE ALL ON FUNCTION public.question_instances_round_guard() FROM PUBLIC, anon, authenticated, service_role;$h5_ddl_12$;

    EXECUTE $h5_ddl_13$CREATE TRIGGER question_instances_round_guard
  BEFORE UPDATE OF answered, repeat_count ON public.question_instances
  FOR EACH ROW EXECUTE FUNCTION public.question_instances_round_guard();$h5_ddl_13$;

    EXECUTE $h5_ddl_14$CREATE FUNCTION public.process_question_attempt_v2(
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
$function$;$h5_ddl_14$;

    EXECUTE $h5_ddl_15$CREATE FUNCTION public.process_text_answer_v2(
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
$function$;$h5_ddl_15$;

    EXECUTE $h5_ddl_16$REVOKE ALL ON FUNCTION public.process_question_attempt_v2(uuid, uuid, text, integer, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;$h5_ddl_16$;

    EXECUTE $h5_ddl_17$GRANT EXECUTE ON FUNCTION public.process_question_attempt_v2(uuid, uuid, text, integer, uuid, text, text)
  TO service_role;$h5_ddl_17$;

    EXECUTE $h5_ddl_18$REVOKE ALL ON FUNCTION public.process_text_answer_v2(uuid, uuid, text, boolean, integer, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;$h5_ddl_18$;

    EXECUTE $h5_ddl_19$GRANT EXECUTE ON FUNCTION public.process_text_answer_v2(uuid, uuid, text, boolean, integer, uuid, text, text)
  TO service_role;$h5_ddl_19$;
  ELSE
    RAISE EXCEPTION 'H5 bootstrap: H5-skemaet findes kun delvist (% af 9 objekter) — ukendt tilstand, intet ændres', v_present;
  END IF;

  -- ── 3. Final check (both states) ──────────────────────────────────────────────────────────────
  -- Function bodies (md5 of prosrc is the body text verbatim: the same on every PostgreSQL version),
  -- SECURITY DEFINER and search_path exactly as 20261030211428 creates them.
  FOR r IN SELECT * FROM (VALUES
      ('public.question_attempts_reject_update()', ARRAY['3910dd2d931eca0309ee82b303bb3cd8'], false),
      ('public.question_instances_round_guard()',  ARRAY['c557309ad7e8853c6aa0af555e282246'], false),
      ('public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text)', ARRAY['f880984680d52b20d07c628a9dfae474'], true),
      ('public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)', ARRAY['943d03820fe4756f5a72c6f0a5d77d7d'], true)
    ) AS t(sig, md5s, definer)
  LOOP
    IF to_regprocedure(r.sig) IS NULL THEN
      RAISE EXCEPTION 'H5 bootstrap: % mangler', r.sig;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
                   WHERE p.oid = to_regprocedure(r.sig) AND md5(p.prosrc) = ANY (r.md5s)
                     AND p.prosecdef = r.definer AND p.proconfig = ARRAY['search_path=""']) THEN
      RAISE EXCEPTION 'H5 bootstrap: % har ikke den forventede krop, SECURITY DEFINER eller search_path', r.sig;
    END IF;
  END LOOP;

  -- EXECUTE: the two answer functions for service_role only; the trigger functions for no API role.
  IF NOT has_function_privilege('service_role', 'public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'H5 bootstrap: service_role mangler EXECUTE på _v2';
  END IF;
  FOR r IN SELECT p.oid::regprocedure::text AS sig, p.proacl::text[] AS acl FROM pg_catalog.pg_proc p
           WHERE p.oid IN (to_regprocedure('public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)'), to_regprocedure('public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text)'),
                           to_regprocedure('public.question_attempts_reject_update()'),
                           to_regprocedure('public.question_instances_round_guard()')) LOOP
    IF r.acl IS NULL OR EXISTS (SELECT 1 FROM unnest(r.acl) a WHERE a LIKE '=%' OR a LIKE 'anon=%' OR a LIKE 'authenticated=%') THEN
      RAISE EXCEPTION 'H5 bootstrap: % kan kaldes af PUBLIC, anon eller authenticated', r.sig;
    END IF;
  END LOOP;
  IF has_function_privilege('service_role', 'public.question_attempts_reject_update()', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.question_instances_round_guard()', 'EXECUTE') THEN
    RAISE EXCEPTION 'H5 bootstrap: triggerfunktionerne må ikke kunne kaldes af service_role';
  END IF;

  -- Owner: SECURITY DEFINER runs as the owner, so the H5 objects must belong to the role that owns
  -- the answer path (process_question_attempt) and question_instances — compared, never named.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
             WHERE p.oid IN (to_regprocedure('public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)'), to_regprocedure('public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text)'),
                             to_regprocedure('public.question_attempts_reject_update()'),
                             to_regprocedure('public.question_instances_round_guard()'))
               AND p.proowner IS DISTINCT FROM (SELECT proowner FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.process_question_attempt(uuid,uuid,text,bigint)')))
     OR (SELECT relowner FROM pg_catalog.pg_class WHERE oid = to_regclass('public.question_attempts'))
        IS DISTINCT FROM (SELECT relowner FROM pg_catalog.pg_class WHERE oid = 'public.question_instances'::regclass) THEN
    RAISE EXCEPTION 'H5 bootstrap: H5-objekterne ejes ikke af samme rolle som svarvejen og question_instances';
  END IF;

  -- The table: columns (name, type, NOT NULL) and its named constraints. NOT NULL constraints that
  -- newer PostgreSQL versions list in pg_constraint (contype 'n') are covered by the column check.
  SELECT string_agg(format('%s %s %s', a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull::text), ', ' ORDER BY a.attnum)
  INTO v_cols FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = to_regclass('public.question_attempts') AND a.attnum > 0 AND NOT a.attisdropped;
  IF v_cols IS DISTINCT FROM 'id uuid true, question_instance_id uuid true, student_id uuid true, attempt_no integer true, submission_id uuid true, grading text true, status text true, was_correct boolean false, user_answer text true, answer_format text true, answer_type text true, is_repeat boolean true, correct_answer_shown text false, review_text_shown text false, misconception_type_shown text false, answered_at timestamp with time zone true, xp_awarded integer true, coins_awarded integer true, source text true, created_at timestamp with time zone true' THEN
    RAISE EXCEPTION 'H5 bootstrap: question_attempts har ikke de forventede kolonner: %', v_cols;
  END IF;
  SELECT string_agg(c.conname::text || ':' || c.contype::text, ' ' ORDER BY c.conname) INTO v_cons
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid = to_regclass('public.question_attempts') AND c.contype IN ('p', 'u', 'f', 'c');
  IF v_cons IS DISTINCT FROM 'question_attempts_attempt_no_check:c question_attempts_coins_awarded_check:c question_attempts_grading_check:c question_attempts_instance_fkey:f question_attempts_pkey:p question_attempts_result_check:c question_attempts_round_key:u question_attempts_source_check:c question_attempts_student_id_fkey:f question_attempts_submission_key:u question_attempts_xp_awarded_check:c' THEN
    RAISE EXCEPTION 'H5 bootstrap: question_attempts har ikke de forventede constraints: %', v_cons;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
                 WHERE c.conname = 'question_attempts_instance_fkey' AND c.conrelid = to_regclass('public.question_attempts')
                   AND c.confrelid = to_regclass('public.question_instances') AND c.confdeltype = 'c'
                   AND (SELECT array_agg(a.attname ORDER BY k.n) FROM unnest(c.confkey) WITH ORDINALITY k(attnum, n)
                        JOIN pg_catalog.pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum) = ARRAY['id', 'student_id']::name[]) THEN
    RAISE EXCEPTION 'H5 bootstrap: question_attempts_instance_fkey peger ikke på question_instances (id, student_id) med ON DELETE CASCADE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
                 WHERE c.conname = 'question_instances_id_student_id_key' AND c.conrelid = to_regclass('public.question_instances') AND c.contype = 'u') THEN
    RAISE EXCEPTION 'H5 bootstrap: question_instances_id_student_id_key mangler';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ic ON ic.oid = i.indexrelid
                 WHERE ic.relname = 'question_attempts_student_answered_idx' AND i.indrelid = to_regclass('public.question_attempts')
                   AND (SELECT array_agg(a.attname ORDER BY k.n) FROM unnest(i.indkey::int2[]) WITH ORDINALITY k(attnum, n)
                        JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum) = ARRAY['student_id', 'answered_at', 'id']::name[]) THEN
    RAISE EXCEPTION 'H5 bootstrap: question_attempts_student_answered_idx mangler eller har forkerte kolonner';
  END IF;

  -- RLS on, no policies; service_role may only read; no API role may write.
  IF NOT (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = to_regclass('public.question_attempts'))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = to_regclass('public.question_attempts')) THEN
    RAISE EXCEPTION 'H5 bootstrap: question_attempts skal have RLS slået til og ingen policies';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.question_attempts', 'SELECT')
     OR has_table_privilege('service_role', 'public.question_attempts', 'INSERT, UPDATE, DELETE, TRUNCATE')
     OR has_table_privilege('authenticated', 'public.question_attempts', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
     OR has_table_privilege('anon', 'public.question_attempts', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE') THEN
    RAISE EXCEPTION 'H5 bootstrap: rettighederne på question_attempts er ikke de forventede';
  END IF;

  -- Exactly the two H5 triggers: BEFORE UPDATE FOR EACH ROW (tgtype 19); the round guard only on
  -- UPDATE OF answered, repeat_count (checked by column NAME — attribute numbers differ per database).
  IF (SELECT count(*) FROM pg_catalog.pg_trigger t WHERE NOT t.tgisinternal
        AND t.tgrelid IN (to_regclass('public.question_attempts'), to_regclass('public.question_instances'))) <> 2
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
                    WHERE t.tgname = 'question_attempts_append_only' AND t.tgrelid = to_regclass('public.question_attempts')
                      AND t.tgfoid = to_regprocedure('public.question_attempts_reject_update()') AND t.tgtype = 19
                      AND t.tgenabled = 'O' AND cardinality(t.tgattr::int2[]) = 0)
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
                    WHERE t.tgname = 'question_instances_round_guard' AND t.tgrelid = to_regclass('public.question_instances')
                      AND t.tgfoid = to_regprocedure('public.question_instances_round_guard()') AND t.tgtype = 19
                      AND t.tgenabled = 'O'
                      AND (SELECT array_agg(a.attname ORDER BY a.attname) FROM unnest(t.tgattr::int2[]) k(attnum)
                           JOIN pg_catalog.pg_attribute a ON a.attrelid = t.tgrelid AND a.attnum = k.attnum) = ARRAY['answered', 'repeat_count']::name[]) THEN
    RAISE EXCEPTION 'H5 bootstrap: triggerne på question_attempts og question_instances er ikke præcis de to H5-triggere';
  END IF;
END
$h5_bootstrap$;
