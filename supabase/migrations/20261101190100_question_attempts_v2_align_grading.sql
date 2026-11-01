-- H5 integration 2 of 2 (D-266, D-273, D-280, D-290 G1): process_question_attempt_v2 grades exactly
-- as process_question_attempt does after D-290 G1, and only then may service_role call it.
--
-- WHY: H5 must grade exactly as the live answer path does. 20261030211428's _v2 grades as production
-- did before 2026-11-01, and differs from today's process_question_attempt in two places:
--   * D-280 part 1 (20261031194600, applied 2026-11-01) accepts the reviewed earlier versions of a
--     correct option when the alias list has TWO OR MORE entries; _v2 requires EXACTLY two. D-280
--     part 2 gives four questions three entries, and there the two would disagree.
--   * D-290 G1 (20261101150000) compares with the meaning-bearing characters kept
--     (normalize_choice_answer: letters incl. æøå, apostrophes, punctuation) and numbers numerically
--     (normalize_number_answer), and never matches an empty or unparseable key; _v2 drops everything
--     outside [a-z0-9]. A possessive "'s" vs "s'", a key of only æ/ø/å, a sign or a decimal comma
--     would be graded differently.
--
-- WHAT CHANGES: in process_question_attempt_v2, the alias condition `= 2` becomes `>= 2` (and its
-- comment), and the comparison becomes G1's lines, character for character apart from the variable
-- names (two new local variables hold the normalised answer and key). Nothing else: signature, return
-- shape, round check, replay, frozen result, rewards, streak, quests, misconception signal, SECURITY
-- DEFINER, search_path and EXECUTE (service_role only) are as in 20261030211428 —
-- tests/unit/question-attempts-v2-bootstrap.test.mjs proves that the bodies differ in exactly those
-- lines and that the result grades and pays as process_question_attempt (first answers, repeats,
-- aliases, G1's cases). process_text_answer_v2 is unchanged: neither D-280 nor G1 changes
-- process_text_answer.
--
-- GUARD (before anything changes), each failure stops the migration:
--   * H5's schema exists (20261030211428 or 20261101190000);
--   * process_question_attempt has G1's body (md5 2e05e769…) — D-280 part 1's body (328ea8f9…), or
--     any other, is refused: H5 is never aligned with a grading the live path does not use;
--   * G1's two helpers have G1's bodies, are IMMUTABLE with search_path "", belong to the owner of
--     process_question_attempt (so the SECURITY DEFINER _v2, owned by the same role, may call them)
--     and no API role (PUBLIC, anon, authenticated, service_role) can EXECUTE them;
--   * process_text_answer_v2 has its 20261030211428 body;
--   * process_question_attempt_v2 has its 20261030211428 body or this file's (a second run changes
--     nothing).
-- The result is checked afterwards (body, SECURITY DEFINER, search_path, EXECUTE, owner).
-- ATOMIC: guard, replacement, EXECUTE rights and the check are ONE statement (one DO block; the
-- function is created by EXECUTE of the statement verbatim), so a failed check keeps the previous
-- _v2 whether or not the runner wraps the file in a transaction.
-- 20261101190000 leaves process_question_attempt_v2 without EXECUTE for service_role; this file grants
-- it back together with the aligned body. So no API role can ever call _v2 with the old grading.
--
-- No row is written or changed. Nothing calls _v2 before H5 is activated.
-- ROLLBACK (before activation): DROP the H5 objects (20261101190000's header). After activation:
-- forward-fix (D-273). Rolling G1 back after this file drops G1's helpers, and _v2 then fails loudly
-- instead of grading — it never falls back to the old grading.
-- Applying this file to production needs its own owner authorisation (D-110): apply_migration only,
-- never `supabase db push`, and only after 20261101150000 (G1) and 20261101190000.

DO $h5_align$
DECLARE
  v_hash text;
  r      record;
BEGIN
  IF to_regclass('public.question_attempts') IS NULL THEN
    RAISE EXCEPTION 'H5 alignment: question_attempts findes ikke — anvend 20261030211428 eller 20261101190000 først';
  END IF;
  SELECT md5(prosrc) INTO v_hash FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.process_question_attempt(uuid,uuid,text,bigint)');
  IF v_hash IS DISTINCT FROM '2e05e769a102f61ffef0ea4dd550c55b' THEN
    RAISE EXCEPTION 'H5 alignment: process_question_attempt har ikke D-290 G1''s krop (md5 %) — anvend 20261101150000 først', v_hash;
  END IF;
  FOR r IN SELECT * FROM (VALUES
      ('public.normalize_choice_answer(text)', '281addc21850a8c6b9f40f6bd8609ad9'),
      ('public.normalize_number_answer(text)', '3dadb6e137855796327637872ee32395')
    ) AS t(sig, md5)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
                   WHERE p.oid = to_regprocedure(r.sig) AND md5(p.prosrc) = r.md5 AND p.provolatile = 'i'
                     AND NOT p.prosecdef AND p.proconfig = ARRAY['search_path=""']
                     AND p.proowner = (SELECT proowner FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.process_question_attempt(uuid,uuid,text,bigint)'))) THEN
      RAISE EXCEPTION 'H5 alignment: % har ikke D-290 G1''s krop, IMMUTABLE, search_path eller ejer', r.sig;
    END IF;
    IF (SELECT p.proacl FROM pg_catalog.pg_proc p WHERE p.oid = to_regprocedure(r.sig)) IS NULL
       OR EXISTS (SELECT 1 FROM unnest((SELECT p.proacl::text[] FROM pg_catalog.pg_proc p WHERE p.oid = to_regprocedure(r.sig))) a
                  WHERE a LIKE '=%' OR a LIKE 'anon=%' OR a LIKE 'authenticated=%' OR a LIKE 'service_role=%')
       OR has_function_privilege('anon', r.sig, 'EXECUTE')
       OR has_function_privilege('authenticated', r.sig, 'EXECUTE')
       OR has_function_privilege('service_role', r.sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'H5 alignment: % kan kaldes af en API-rolle', r.sig;
    END IF;
  END LOOP;
  SELECT md5(prosrc) INTO v_hash FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.process_text_answer_v2(uuid,uuid,text,boolean,integer,uuid,text,text)');
  IF v_hash IS DISTINCT FROM 'f880984680d52b20d07c628a9dfae474' THEN
    RAISE EXCEPTION 'H5 alignment: process_text_answer_v2 har en ukendt krop (md5 %)', v_hash;
  END IF;
  SELECT md5(prosrc) INTO v_hash FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)');
  IF v_hash IS NULL OR v_hash NOT IN ('943d03820fe4756f5a72c6f0a5d77d7d', '8a7696147df978e250918b2c93e20577') THEN
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
$function$;$h5_align_ddl$;
  EXECUTE $h5_align_ddl$REVOKE ALL ON FUNCTION public.process_question_attempt_v2(uuid, uuid, text, integer, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;$h5_align_ddl$;
  EXECUTE $h5_align_ddl$GRANT EXECUTE ON FUNCTION public.process_question_attempt_v2(uuid, uuid, text, integer, uuid, text, text)
  TO service_role;$h5_align_ddl$;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
                 WHERE p.oid = to_regprocedure('public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)') AND md5(p.prosrc) = '8a7696147df978e250918b2c93e20577'
                   AND p.prosecdef AND p.proconfig = ARRAY['search_path=""']
                   AND NOT EXISTS (SELECT 1 FROM unnest(p.proacl::text[]) a
                                   WHERE a LIKE '=%' OR a LIKE 'anon=%' OR a LIKE 'authenticated=%'))
     OR NOT has_function_privilege('service_role', 'public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)', 'EXECUTE')
     OR (SELECT proowner FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.process_question_attempt_v2(uuid,uuid,text,integer,uuid,text,text)'))
        IS DISTINCT FROM (SELECT proowner FROM pg_catalog.pg_proc WHERE oid = to_regprocedure('public.process_question_attempt(uuid,uuid,text,bigint)')) THEN
    RAISE EXCEPTION 'H5 alignment: process_question_attempt_v2 blev ikke som forventet';
  END IF;
END
$h5_align$;
