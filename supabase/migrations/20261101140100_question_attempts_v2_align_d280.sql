-- H5 integration 2 of 2 (D-266, D-273, D-280): process_question_attempt_v2 grades as D-280 does.
--
-- D-280 part 1 (20261031194600, in production since 2026-11-01) lets process_question_attempt accept
-- the reviewed earlier versions of a correct option when the alias list has TWO OR MORE entries; the
-- _v2 function from 20261030211428 still requires EXACTLY two. D-280 part 2 gives four of its ten
-- questions three entries, and for those the two functions would disagree: a pupil with the page
-- from before the change who clicks the earlier correct text, or an open instance still keyed with
-- the earlier text when the pupil sees the new options, is RIGHT for process_question_attempt and
-- WRONG for _v2. H5 must grade exactly as the live answer path does.
--
-- WHAT CHANGES: in process_question_attempt_v2, the alias condition `= 2` becomes `>= 2` (and its
-- comment). Nothing else: signature, return shape, round check, replay, frozen result, rewards,
-- streak, quests, misconception signal, SECURITY DEFINER, search_path and EXECUTE (service_role only)
-- are as in 20261030211428 — tests/unit/question-attempts-v2-bootstrap.test.mjs proves that the two
-- bodies differ in exactly those lines and that the result grades as process_question_attempt for
-- every D-280 case. With the change the whole grading is D-280's: the same alias condition, the same
-- normalisation (lower-case, [a-z0-9] only), the same exact alias match, the same key returned.
-- process_text_answer_v2 is unchanged: D-280 does not change process_text_answer.
--
-- GUARD: H5's schema must exist (20261030211428 or 20261101140000), process_question_attempt must
-- have D-280 part 1's body, process_text_answer_v2 its 20261030211428 body, and
-- process_question_attempt_v2 either its 20261030211428 body or this file's (a second run changes
-- nothing). Anything else stops the migration. The result is checked afterwards.
-- ATOMIC: guard, replacement, EXECUTE rights and the check are ONE statement (one DO block; the
-- function is created by EXECUTE of the statement verbatim), so a failed check keeps the previous
-- _v2 whether or not the runner wraps the file in a transaction.
--
-- No row is written or changed. Nothing calls _v2 before H5 is activated.
-- ROLLBACK (before activation): recreate the function from 20261030211428 (section 5a). After
-- activation: forward-fix (D-273).
-- Applying this file to production needs its own owner authorisation (D-110): apply_migration only,
-- never `supabase db push`.

DO $h5_align$
DECLARE
  v_hash text;
BEGIN
  IF to_regclass('public.question_attempts') IS NULL THEN
    RAISE EXCEPTION 'H5 alignment: question_attempts findes ikke — anvend 20261030211428 eller 20261101140000 først';
  END IF;
  SELECT md5(prosrc) INTO v_hash FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.process_question_attempt(uuid,uuid,text,bigint)');
  IF v_hash IS DISTINCT FROM '328ea8f9a4fd260407b582dcecb7dfdf' THEN
    RAISE EXCEPTION 'H5 alignment: process_question_attempt har ikke D-280 del 1''s krop (md5 %)', v_hash;
  END IF;
  SELECT md5(prosrc) INTO v_hash FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text)');
  IF v_hash IS DISTINCT FROM 'f880984680d52b20d07c628a9dfae474' THEN
    RAISE EXCEPTION 'H5 alignment: process_text_answer_v2 har en ukendt krop (md5 %)', v_hash;
  END IF;
  SELECT md5(prosrc) INTO v_hash FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)');
  IF v_hash IS NULL OR v_hash NOT IN ('943d03820fe4756f5a72c6f0a5d77d7d', 'adbecf897a64eeace416e1cff9d021a9') THEN
    RAISE EXCEPTION 'H5 alignment: process_question_attempt_v2 har en ukendt krop (md5 %)', v_hash;
  END IF;

  EXECUTE $h5_align_ddl$CREATE OR REPLACE FUNCTION public.process_question_attempt_v2(
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

  -- Only reviewed earlier versions of this question's correct option are aliases: two or more
  -- entries (D-280), always including both the stored key and the current content.correct.
  v_aliases := v_metadata -> 'danish_orthography_correct_aliases';
  IF jsonb_typeof(v_aliases) IS DISTINCT FROM 'array' THEN
    v_aliases := '[]'::jsonb;
  END IF;
  IF jsonb_array_length(v_aliases) >= 2
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
$function$;$h5_align_ddl$;
  EXECUTE $h5_align_ddl$REVOKE ALL ON FUNCTION public.process_question_attempt_v2(uuid, uuid, text, integer, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;$h5_align_ddl$;
  EXECUTE $h5_align_ddl$GRANT EXECUTE ON FUNCTION public.process_question_attempt_v2(uuid, uuid, text, integer, uuid, text, text)
  TO service_role;$h5_align_ddl$;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
                 WHERE p.oid = to_regprocedure('public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)') AND md5(p.prosrc) = 'adbecf897a64eeace416e1cff9d021a9'
                   AND p.prosecdef AND p.proconfig = ARRAY['search_path=""']
                   AND NOT EXISTS (SELECT 1 FROM unnest(p.proacl::text[]) a
                                   WHERE a LIKE '=%' OR a LIKE 'anon=%' OR a LIKE 'authenticated=%'))
     OR NOT has_function_privilege('service_role', 'public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'H5 alignment: process_question_attempt_v2 blev ikke som forventet';
  END IF;
END
$h5_align$;
