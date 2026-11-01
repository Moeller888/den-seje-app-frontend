# L1 K1 — tilbagerulning af svarlogens nye felter

Migration: `supabase/migrations/20261101220000_l1_k1_attempt_context.sql`.

Tilbagerulningen kræver ejerens **særskilte godkendelse** og køres som ét `apply_migration`-kald
(D-110). Den er kun mulig, **før det første forsøg er skrevet**: den fjerner de seks kolonner, og
historik må aldrig gå tabt. Er `question_attempts` ikke tom, afbryder den uden ændringer.

Den genskaber `process_question_attempt_v2` og `process_text_answer_v2` med deres kroppe fra
`20261101190100` og `20261030211428` (md5 `8a769614…` og `f8809846…`) og deres rettigheder.

```sql
-- ROLLBACK L1 K1 — restores H5's attempt table and _v2 functions; only while no attempt exists.
SET LOCAL lock_timeout = '5s';

DO $k1_rb$
DECLARE
  v_rows bigint;
BEGIN
  SELECT count(*) INTO v_rows FROM public.question_attempts;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'K1 rollback: question_attempts har % række(r); historik slettes ikke; intet ændret', v_rows;
  END IF;
  EXECUTE $k1_ddl$DROP FUNCTION public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text,text,integer)$k1_ddl$;
  EXECUTE $k1_ddl$DROP FUNCTION public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text,text,integer)$k1_ddl$;
  EXECUTE $k1_ddl$ALTER TABLE public.question_attempts
    DROP CONSTRAINT question_attempts_interval_first_round_check,
    DROP CONSTRAINT question_attempts_objectives_versioned_check,
    DROP COLUMN mode, DROP COLUMN hints_used, DROP COLUMN server_interval_ms,
    DROP COLUMN objective_ids, DROP COLUMN objective_mapping_version, DROP COLUMN question_content_sha256$k1_ddl$;
  EXECUTE $k1_ddl$CREATE OR REPLACE FUNCTION public.process_question_attempt_v2(
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
  v_norm_answer text;
  v_norm_key   text;
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

  -- D-290 (G1): meaning-bearing characters count (letters incl. æøå, apostrophes, punctuation);
  -- numbers compare numerically. An empty or unparseable key never matches. Aliases are unchanged.
  IF v_format LIKE '%number%' THEN
    v_norm_answer := public.normalize_number_answer(p_answer);
    v_norm_key    := public.normalize_number_answer(v_key);
  ELSE
    v_norm_answer := public.normalize_choice_answer(p_answer);
    v_norm_key    := public.normalize_choice_answer(v_key);
  END IF;

  IF (v_norm_key IS NOT NULL AND v_norm_key <> '' AND v_norm_answer = v_norm_key)
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
$function$$k1_ddl$;
  EXECUTE $k1_ddl$CREATE FUNCTION public.process_text_answer_v2(
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
$function$$k1_ddl$;
  EXECUTE $k1_ddl$REVOKE ALL ON FUNCTION public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text) FROM PUBLIC, anon, authenticated, service_role$k1_ddl$;
  EXECUTE $k1_ddl$GRANT EXECUTE ON FUNCTION public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text) TO service_role$k1_ddl$;
  EXECUTE $k1_ddl$REVOKE ALL ON FUNCTION public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text) FROM PUBLIC, anon, authenticated, service_role$k1_ddl$;
  EXECUTE $k1_ddl$GRANT EXECUTE ON FUNCTION public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text) TO service_role$k1_ddl$;
END
$k1_rb$;
```

**Efterkontrol (read-only):** de to `_v2`-funktioner har igen md5 `8a7696147df978e250918b2c93e20577`
og `f880984680d52b20d07c628a9dfae474`, kun `service_role` har EXECUTE, og `question_attempts` har ikke
længere kolonnerne `mode`, `hints_used`, `server_interval_ms`, `objective_ids`,
`objective_mapping_version` og `question_content_sha256`.
