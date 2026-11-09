-- ============================================================================================================
-- FORSLAG TIL H5/K1-SPORET — IKKE EN MIGRATION. Ligger bevidst uden for supabase/migrations og anvendes ingen
-- steder. Kun tests/unit/course-progress-rewards-k1-proposal-run.test.mjs indlæser filen i en PGlite-testdatabase.
-- Begrundelse, rækkefølge og præcise linjeændringer: docs/laerligverse/forslag-k1-belonning-kursussvar.md.
--
-- Lærligverse (Arkivskabet): en kursusopgave betales IKKE pr. svar. XP/coins kommer kun fra
-- award_course_milestones (migration 20261108171500, kladde). Prædikatet — samme kursusmarkør som #647 og
-- learning-sequence.ts stepOf:
--     coalesce(<spørgsmålets metadata>, '{}'::jsonb) ? 'learning_step'
-- For en kursusopgave: 0 XP og 0 coins (første svar OG gentagelse), correct_answers/total_correct_answers
-- øges ikke, daglige og ugentlige quests rykkes ikke. UÆNDRET: rettelsen, update_streak, forsøgsrækken i
-- question_attempts (med xp_awarded = coins_awarded = 0), idempotens/replay, svarformen, signatur, SECURITY
-- DEFINER, search_path, ejer og EXECUTE (CREATE OR REPLACE). Almindelige opgaver betales præcis som før.
--
-- GRUNDLAG (produktionens kroppe uden K1; md5(prosrc) læst i den isolerede replay, som for
-- process_question_attempt er bekræftet lig produktionen, 2e05e769…):
--   process_question_attempt(uuid,uuid,text,bigint)                       2e05e769a102f61ffef0ea4dd550c55b  20261101150000_grading_meaningful_characters.sql:104
--   process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)    8a7696147df978e250918b2c93e20577  20261101190100_question_attempts_v2_align_grading.sql:90
--   process_text_answer(uuid,uuid,text,boolean)                           e80727ea87ffdc64988e5a09dcb20356  20260524000000_weekly_quests.sql:203
--   process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text) f880984680d52b20d07c628a9dfae474  20261030211428_question_attempts_v2.sql:438 (via 20261101190000:496)
-- EFTER dette forslag:
--   process_question_attempt      a91a651c32b8f0d4a8efad588f2f78dd
--   process_question_attempt_v2   f241c2115ec48441efc9e695b028d2d2
--   process_text_answer           62589388dae732ad79ca8f893027785d
--   process_text_answer_v2        098969e41b5c85a00e21a733093d7ecb
-- award_course_milestones nægter at udbetale (outcome 'reward_path_not_ready'), så længe en af de fire
-- funktioner har en anden krop end EFTER-kroppene ovenfor.
--
-- RÆKKEFØLGE: hvis K1 (20261103110000) eller L3's hint-log (20261108043500) anvendes FØRST, skal de samme
-- fire ændringer laves i DERES kroppe af _v2-funktionerne (nye signaturer), og vagtlisten i
-- award_course_milestones skal opdateres i samme ændring. #623/#647 rører ikke disse funktioner.
-- ============================================================================================================

DO $guard$
DECLARE
  r record;
  v text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.process_question_attempt(uuid,uuid,text,bigint)', '2e05e769a102f61ffef0ea4dd550c55b', 'a91a651c32b8f0d4a8efad588f2f78dd'),
    ('public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)', '8a7696147df978e250918b2c93e20577', 'f241c2115ec48441efc9e695b028d2d2'),
    ('public.process_text_answer(uuid,uuid,text,boolean)', 'e80727ea87ffdc64988e5a09dcb20356', '62589388dae732ad79ca8f893027785d'),
    ('public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text)', 'f880984680d52b20d07c628a9dfae474', '098969e41b5c85a00e21a733093d7ecb')
  ) AS t(sig, before_md5, after_md5)
  LOOP
    SELECT md5(prosrc) INTO v FROM pg_proc WHERE oid = to_regprocedure(r.sig);
    IF v IS NULL THEN
      RAISE EXCEPTION 'forslag kursussvar: % findes ikke — er K1 anvendt? Så skal forslaget flyttes til K1''s kroppe', r.sig;
    END IF;
    IF v <> r.before_md5 AND v <> r.after_md5 THEN
      RAISE EXCEPTION 'forslag kursussvar: % har en ureviewet krop (md5 %), stop', r.sig, v;
    END IF;
  END LOOP;
END
$guard$;

CREATE OR REPLACE FUNCTION public.process_question_attempt(p_student_id uuid, p_question_instance_id uuid, p_answer text, p_question_shown_at bigint)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_instance       record;
  v_correct        boolean := false;
  v_answer         text;
  v_correct_answer text;
  v_rows_updated   integer;
  v_is_repeat      boolean := false;
  v_xp             integer := 0;
  v_coins          integer := 0;
  v_orthography_aliases jsonb;
  v_is_course      boolean := false;
BEGIN

  SELECT qi.*, q.answer_format, q.content AS question_content, q.metadata AS question_metadata
  INTO v_instance
  FROM question_instances qi
  JOIN questions q ON q.id = qi.question_id
  WHERE qi.id         = p_question_instance_id
    AND qi.student_id = p_student_id;

  IF v_instance IS NULL THEN
    RAISE EXCEPTION 'Instance not found';
  END IF;

  -- Only reviewed earlier versions of this question's correct option are aliases: an old spelling
  -- and/or an earlier wording, two or more entries, always including the current content.correct.
  -- The stored answer key and all historical pupil answers/results remain unchanged.
  v_orthography_aliases := v_instance.question_metadata->'danish_orthography_correct_aliases';
  IF jsonb_typeof(v_orthography_aliases) IS DISTINCT FROM 'array' THEN
    v_orthography_aliases := '[]'::jsonb;
  END IF;
  IF jsonb_array_length(v_orthography_aliases) >= 2
     AND v_orthography_aliases ? v_instance.correct_answer
     AND v_orthography_aliases ? (v_instance.question_content->>'correct') THEN
    v_instance.correct_answer := v_instance.question_content->>'correct';
  ELSE
    v_orthography_aliases := '[]'::jsonb;
  END IF;

  IF v_instance.answered = true THEN
    RETURN json_build_object(
      'status', CASE
        WHEN v_instance.was_correct = true  THEN 'correct'
        WHEN v_instance.was_correct = false THEN 'incorrect'
        ELSE 'pending'
      END,
      'correct_answer', v_instance.correct_answer
    );
  END IF;

  v_is_repeat := coalesce(v_instance.repeat_count, 0) > 0;
  -- Lærligverse (FORSLAG): kursusopgave (questions.metadata har 'learning_step') → 0 XP/coins pr. svar, tællere og quests urørt.
  v_is_course := coalesce(v_instance.question_metadata, '{}'::jsonb) ? 'learning_step';

  IF v_instance.answer_format = 'text' THEN
    UPDATE question_instances
    SET answered = true, answered_at = now(), user_answer = p_answer, was_correct = null
    WHERE id = v_instance.id AND answered = false;

    RETURN json_build_object('status', 'pending', 'correct_answer', null);
  END IF;

  -- D-290 (G1): meaning-bearing characters count (letters incl. æøå, apostrophes, punctuation);
  -- numbers compare numerically. An empty or unparseable key never matches. Aliases are unchanged.
  IF v_instance.answer_format LIKE '%number%' THEN
    v_answer         := public.normalize_number_answer(p_answer);
    v_correct_answer := public.normalize_number_answer(v_instance.correct_answer);
  ELSE
    v_answer         := public.normalize_choice_answer(p_answer);
    v_correct_answer := public.normalize_choice_answer(v_instance.correct_answer);
  END IF;

  IF (v_correct_answer IS NOT NULL AND v_correct_answer <> '' AND v_answer = v_correct_answer)
     OR v_orthography_aliases ? p_answer THEN
    v_correct := true;
  END IF;

  UPDATE question_instances
  SET
    answered    = true,
    answered_at = now(),
    user_answer = p_answer,
    was_correct = v_correct
  WHERE id       = v_instance.id
    AND answered = false;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  -- A concurrent call already scored this instance: award nothing, report the same result.
  IF v_rows_updated = 0 THEN
    RETURN json_build_object(
      'status',         CASE WHEN v_correct THEN 'correct' ELSE 'incorrect' END,
      'correct_answer', v_instance.correct_answer
    );
  END IF;

  IF v_correct AND NOT v_is_course THEN
    IF v_is_repeat THEN
      -- A repeat earns a token amount: 1 coin and 2 XP (D-211, owner decision 2026-10-26).
      -- correct_answers and total_correct_answers stay put: they feed the accuracy figure
      -- teachers read, and re-answers of already known material would inflate it.
      v_coins := 1;
      v_xp    := 2;
      UPDATE student_progress
      SET
        xp    = COALESCE(xp, 0) + v_xp,
        coins = COALESCE(coins, 0) + v_coins
      WHERE student_id = p_student_id;
    ELSE
      v_xp    := 10;
      v_coins := 5;
      UPDATE student_progress
      SET
        xp                    = COALESCE(xp, 0) + v_xp,
        coins                 = COALESCE(coins, 0) + v_coins,
        correct_answers       = COALESCE(correct_answers, 0) + 1,
        total_correct_answers = COALESCE(total_correct_answers, 0) + 1
      WHERE student_id = p_student_id;
    END IF;
  END IF;

  -- A streak measures showing up, which a pupil practising repeats has genuinely done.
  PERFORM public.update_streak(p_student_id);

  -- Quest progress is NOT advanced by repeats: quest rewards are coins, and the pool-exhausted
  -- pupil could otherwise complete quests indefinitely on questions they already know.
  IF NOT v_is_repeat AND NOT v_is_course THEN
    PERFORM public.update_quest_progress_for_answer(
      p_student_id,
      v_correct,
      CASE WHEN v_correct THEN 10 ELSE 0 END
    );
    PERFORM public.update_weekly_quest_progress_for_answer(
      p_student_id,
      v_correct,
      CASE WHEN v_correct THEN 10 ELSE 0 END
    );
  END IF;

  RETURN json_build_object(
    'status',         CASE WHEN v_correct THEN 'correct' ELSE 'incorrect' END,
    'correct_answer', v_instance.correct_answer
  );

END;
$function$;

CREATE OR REPLACE FUNCTION public.process_question_attempt_v2(p_student_id uuid, p_question_instance_id uuid, p_answer text, p_round_no integer, p_submission_id uuid, p_review_text text, p_misconception_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
  v_is_course  boolean;
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
  -- Lærligverse (FORSLAG): kursusopgave (questions.metadata har 'learning_step') → 0 XP/coins pr. svar, tællere og quests urørt.
  v_is_course := coalesce(v_metadata, '{}'::jsonb) ? 'learning_step';
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

    IF v_correct AND NOT v_is_course THEN
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
    IF NOT v_is_repeat AND NOT v_is_course THEN
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

CREATE OR REPLACE FUNCTION public.process_text_answer(p_instance_id uuid, p_user_id uuid, p_user_answer text, p_is_correct boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rows_updated INTEGER;
  v_next_review  TIMESTAMPTZ;
  v_is_course    boolean;
BEGIN
  -- Lærligverse (FORSLAG): kursusopgave (questions.metadata har 'learning_step') → 0 XP/coins pr. svar, tællere og quests urørt.
  SELECT coalesce(q.metadata, '{}'::jsonb) ? 'learning_step' INTO v_is_course
  FROM question_instances qi JOIN questions q ON q.id = qi.question_id
  WHERE qi.id = p_instance_id AND qi.student_id = p_user_id;
  v_is_course := coalesce(v_is_course, false);

  v_next_review := CASE p_is_correct
    WHEN true THEN now() + INTERVAL '1 day'
    ELSE            now() + INTERVAL '10 minutes'
  END;

  UPDATE question_instances
  SET
    user_answer    = p_user_answer,
    was_correct    = p_is_correct,
    answered       = true,
    answered_at    = now(),
    next_review_at = v_next_review
  WHERE id         = p_instance_id
    AND student_id = p_user_id
    AND answered   = false;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RETURN 'already_processed';
  END IF;

  IF p_is_correct AND NOT v_is_course THEN
    UPDATE student_progress
    SET
      xp                    = COALESCE(xp, 0) + 10,
      coins                 = COALESCE(coins, 0) + 5,
      correct_answers       = COALESCE(correct_answers, 0) + 1,
      total_correct_answers = COALESCE(total_correct_answers, 0) + 1
    WHERE student_id = p_user_id;
  END IF;

  PERFORM update_streak(p_user_id);
  IF NOT v_is_course THEN
    PERFORM update_quest_progress_for_answer(
      p_user_id,
      p_is_correct,
      CASE WHEN p_is_correct THEN 10 ELSE 0 END
    );
    PERFORM public.update_weekly_quest_progress_for_answer(
      p_user_id,
      p_is_correct,
      CASE WHEN p_is_correct THEN 10 ELSE 0 END
    );
  END IF;

  RETURN CASE p_is_correct WHEN true THEN 'rewarded' ELSE 'recorded' END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_text_answer_v2(p_instance_id uuid, p_user_id uuid, p_user_answer text, p_is_correct boolean, p_round_no integer, p_submission_id uuid, p_review_text text, p_misconception_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
  v_is_course  boolean;
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

  -- Lærligverse (FORSLAG): kursusopgave (questions.metadata har 'learning_step') → 0 XP/coins pr. svar, tællere og quests urørt.
  SELECT q.answer_format, q.answer_type, coalesce(q.metadata, '{}'::jsonb) ? 'learning_step'
  INTO v_format, v_type, v_is_course
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

    IF p_is_correct AND NOT v_is_course THEN
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
    IF NOT v_is_course THEN
      PERFORM public.update_quest_progress_for_answer(
        p_user_id, p_is_correct, CASE WHEN p_is_correct THEN 10 ELSE 0 END);
      PERFORM public.update_weekly_quest_progress_for_answer(
        p_user_id, p_is_correct, CASE WHEN p_is_correct THEN 10 ELSE 0 END);
    END IF;

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
