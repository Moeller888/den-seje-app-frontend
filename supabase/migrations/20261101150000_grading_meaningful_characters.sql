-- ============================================================================
-- D-290 (G1, from D-285) — grading keeps meaning-bearing characters and compares numbers numerically.
--
-- NOT APPLIED IN PRODUCTION. Applying it needs a separate owner authorisation (D-110,
-- docs/migration-workflow-policy.md). The isolated replay skips it (NOT_IN_PRODUCTION) until it is
-- applied, as for D-280, whose process_question_attempt body it builds on.
--
-- WHY: process_question_attempt compares lower(answer) and lower(key) after dropping everything
-- outside [a-z0-9]. Two active English possessive questions therefore grade a wrong option as correct
-- ("'s" = "s'"), a key of only æ/ø/å normalises to "", and numbers lose sign, decimal comma and slash.
--
-- WHAT CHANGES (and nothing else)
--   1. Two new internal helpers, the SQL twins of _shared/answer-normalize.ts (parity-tested):
--      normalize_choice_answer(text) and normalize_number_answer(text). IMMUTABLE, search_path '',
--      no EXECUTE for any API role (process_question_attempt runs as their owner). Upper-case letters
--      are lowered explicitly first, so the result does not depend on the database collation.
--   2. process_question_attempt(uuid,uuid,text,bigint): re-created from the EXACT production body
--      (20261031194600, md5(prosrc) 328ea8f9a4fd260407b582dcecb7dfdf, read-only catalog 2026-11-01)
--      with ONLY the three grading lines replaced. Rewards, repeat award, quests, streak, aliases,
--      the CAS, signature, SECURITY DEFINER, search_path and EXECUTE are unchanged.
-- No row is changed; history is not re-graded (D-290 G3).
--
-- GUARD: replaces only production's body (328ea8f9…) or this file's own (2e05e769a102f61ffef0ea4dd550c55b, re-run).
--
-- ROLLBACK: docs/operations/grading-meaningful-characters-rollback.md.
-- ============================================================================

DO $g1_guard$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(p.prosrc) INTO v_md5 FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.process_question_attempt(uuid,uuid,text,bigint)');
  IF v_md5 IS NULL OR v_md5 NOT IN ('328ea8f9a4fd260407b582dcecb7dfdf', '2e05e769a102f61ffef0ea4dd550c55b') THEN
    RAISE EXCEPTION 'D-290: process_question_attempt has an unreviewed body (md5 %); stop', coalesce(v_md5, 'missing');
  END IF;
END
$g1_guard$;

-- ── 1. The SQL twins of supabase/functions/_shared/answer-normalize.ts (parity-tested) ──────────

CREATE OR REPLACE FUNCTION public.normalize_choice_answer(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $norm_choice$
  SELECT CASE WHEN p IS NULL THEN '' ELSE
    regexp_replace(
      regexp_replace(
        lower(translate(
          translate(normalize(p, NFC), E'‘’ʼ′`´   ', repeat(chr(39), 6) || '   '),
          'ÆØÅÄÖÜÉÈÊËÁÀÂÍÌÎÏÓÒÔÚÙÛÑÇ',
          'æøåäöüéèêëáàâíìîïóòôúùûñç')),
        E'[ \t\n\r]+', ' ', 'g'),
      E'^[ \t\n\r]+|[ \t\n\r]+$', '', 'g')
  END
$norm_choice$;

CREATE OR REPLACE FUNCTION public.normalize_number_answer(p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $norm_number$
DECLARE
  s   text;
  neg boolean;
  i   text;
  f   text;
BEGIN
  IF p IS NULL THEN
    RETURN NULL;
  END IF;
  s := translate(normalize(p, NFC), E'−–—   ', '---   ');
  s := regexp_replace(s, E'^[ \t\n\r]+|[ \t\n\r]+$', '', 'g');
  IF s ~ '^-?[0-9]{1,3}( [0-9]{3})+([.,][0-9]+)?$' THEN
    s := replace(s, ' ', '');
  END IF;
  IF s !~ '^-?[0-9]+([.,][0-9]+)?$' THEN
    RETURN NULL;
  END IF;
  s := replace(s, ',', '.');
  neg := left(s, 1) = '-';
  IF neg THEN
    s := substr(s, 2);
  END IF;
  i := split_part(s, '.', 1);
  f := split_part(s, '.', 2);
  i := regexp_replace(i, '^0+([0-9])', '\1');
  f := regexp_replace(f, '0+$', '');
  IF i = '0' AND f = '' THEN
    neg := false;
  END IF;
  RETURN CASE WHEN neg THEN '-' ELSE '' END || i || CASE WHEN f <> '' THEN '.' || f ELSE '' END;
END
$norm_number$;

REVOKE ALL ON FUNCTION public.normalize_choice_answer(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.normalize_number_answer(text) FROM PUBLIC, anon, authenticated, service_role;

-- ── 2. process_question_attempt: only the grading lines change ─────────────────────────────────

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

  IF v_correct THEN
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
  IF NOT v_is_repeat THEN
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
