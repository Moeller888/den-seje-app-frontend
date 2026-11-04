-- D-280, del 1 af 2: svarvejene, før de ti spørgsmål rettes (20261031194700).
--
-- Ejeren godkendte 2026-10-31 at rette de 10 mest viste MC-spørgsmål med længdespor direkte. En
-- besvarelse gemmer kun sit facit; tekst og svarmuligheder hentes altid fra spørgsmålet. Før
-- spørgsmålene ændres, skal svarvejene derfor kunne håndtere et ændret facit:
--   1. process_question_attempt: aliaslisten (metadata.danish_orthography_correct_aliases) må have
--      to eller flere gennemgåede versioner af facit, ikke kun præcis to. Reglen er ellers uændret:
--      aliaserne gælder kun, når både det gemte facit og det nuværende content.correct står i listen.
--   2. De tre gentagelsesveje, som get-next-question kalder (request_repeat_question_for_student,
--      ..._servable_for_student og request_repeat_level_question_for_student): genåbningen er uændret,
--      og en ny sætning bagefter sætter en MC-besvarelses correct_answer til spørgsmålets nuværende
--      content.correct, ligesom ved en ny besvarelse. Andre formater beholder deres facit.
--      request_repeat_question (auth.uid-varianten) ændres ikke: kun postgres har EXECUTE, og ingen
--      deployet kode kalder den.
--
-- Hvorfor en særskilt fil: en anden session ser først de nye funktionskroppe efter commit. Lå de i
-- samme transaktion som rettelsen af spørgsmålene, kunne en genåbning, der ventede på den, køre den
-- gamle krop bagefter og efterlade en åben besvarelse med gammelt facit og nye svarmuligheder.
-- Ingen data ændres her. Ejer, EXECUTE, SECURITY DEFINER/INVOKER og search_path er uændrede.
--
-- IKKE anvendt i produktion. Må KUN anvendes via apply_migration med særskilt ejer-autorisation
-- (D-110, docs/migration-workflow-policy.md), og FØR 20261031194700.

-- ── 0. Vagt: funktionerne skal være præcis de versioner, produktionen kører ─────────────────────
-- md5(prosrc) [før, efter]: før er læst i produktionen 2026-10-31 (catalog only), efter er denne
-- migrations egne kroppe (så en ny kørsel er tilladt). Alt andet afbryder migrationen.
DO $mc_length_cue_guard$
DECLARE
  expected CONSTANT jsonb := '{
    "public.process_question_attempt(uuid,uuid,text,bigint)": ["8f698c5b45ecfe9a1988215dd8849d67", "328ea8f9a4fd260407b582dcecb7dfdf"],
    "public.request_repeat_question_for_student(uuid,smallint,text[])": ["b27c917b9225bca58ad756e7952c49db", "2ac19e786310b59051a44aed96b5bf46"],
    "public.request_repeat_question_servable_for_student(uuid,smallint,text[])": ["e31009c5924d0fbe4f11731df7f94290", "092555368551a096c29d6e60f58c17b1"],
    "public.request_repeat_level_question_for_student(uuid,text[])": ["ee153327dae5a5686e9c5efd247d27c0", "db8280ddee20254e876be7fb1fc57e4d"]
  }';
  f text;
BEGIN
  FOR f IN SELECT key FROM jsonb_each(expected) LOOP
    IF NOT coalesce((expected -> f) ? (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(f)), false) THEN
      RAISE EXCEPTION 'MC_LENGTH_CUE: % er ændret siden preflight; kræver ny gennemgang', f;
    END IF;
  END LOOP;
END
$mc_length_cue_guard$;

-- ── 1. process_question_attempt: to eller flere gennemgåede facitversioner som aliaser ──────
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

  v_answer         := trim(regexp_replace(lower(p_answer),                   '[^a-z0-9]', '', 'g'));
  v_correct_answer := trim(regexp_replace(lower(v_instance.correct_answer), '[^a-z0-9]', '', 'g'));

  IF v_answer = v_correct_answer OR v_orthography_aliases ? p_answer THEN
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

-- ── 2. Gentagelser: MC-facit følger det nuværende content.correct ved genåbning ───────────
CREATE OR REPLACE FUNCTION public.request_repeat_question_for_student(
  p_student_id uuid,
  p_grade      smallint,
  p_domains    text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_instance_id uuid;
BEGIN
  IF p_student_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- The pupil already has an open question: serve that, never a new repeat (idx_one_open_question).
  IF EXISTS (
    SELECT 1 FROM public.question_instances qi
    WHERE qi.student_id = p_student_id AND qi.answered = false
  ) THEN
    RETURN NULL;
  END IF;

  -- Repeats are a last resort, verified against the server-derived scope.
  IF EXISTS (
    SELECT 1
    FROM public.questions q
    WHERE q.is_active
      AND (p_grade IS NULL OR q.target_grade IS NULL OR q.target_grade <= p_grade)
      AND (p_domains IS NULL OR q.learning_objective = ANY(p_domains))
      AND NOT EXISTS (
        SELECT 1 FROM public.question_instances qi
        WHERE qi.student_id = p_student_id AND qi.question_id = q.id
      )
  ) THEN
    RETURN NULL;
  END IF;

  -- Incorrect first, oldest answer first within each group.
  SELECT qi.id
  INTO v_instance_id
  FROM public.question_instances qi
    JOIN public.questions q ON q.id = qi.question_id
  WHERE qi.student_id  = p_student_id
    AND qi.answered    = true
    AND qi.teacher_score IS NULL            -- never reopen teacher-graded work
    AND q.is_active
    AND q.answer_format <> 'text'           -- auto-graded only: no teacher-owned state
    AND coalesce(q.answer_type, 'short') <> 'long'
    AND (p_grade IS NULL OR q.target_grade IS NULL OR q.target_grade <= p_grade)
    AND (p_domains IS NULL OR q.learning_objective = ANY(p_domains))
  ORDER BY
    (qi.was_correct IS NOT FALSE),          -- false sorts first
    qi.answered_at ASC NULLS FIRST
  LIMIT 1;

  IF v_instance_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.question_instances
  SET answered       = false,
      user_answer    = NULL,
      was_correct    = NULL,
      answered_at    = NULL,
      next_review_at = now(),
      repeat_count   = repeat_count + 1
  WHERE id = v_instance_id
    AND student_id = p_student_id
    AND answered = true;                    -- lost race: another call already reopened it

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- MC: the key follows the question's current content.correct, exactly as a new instance from
  -- get-next-question gets it, so a corrected text is never graded against an old key. A separate
  -- statement on purpose: under READ COMMITTED it takes its own snapshot AFTER the reopen above,
  -- which waits for any concurrent writer holding question_instances — so a question correction
  -- committed meanwhile is seen. Other formats keep their key (a Match par key is per instance).
  UPDATE public.question_instances qi
  SET correct_answer = q.content ->> 'correct'
  FROM public.questions q
  WHERE qi.id = v_instance_id
    AND q.id = qi.question_id
    AND q.answer_format = 'mc'
    AND jsonb_typeof(q.content -> 'correct') = 'string'
    AND qi.correct_answer IS DISTINCT FROM q.content ->> 'correct';

  RETURN v_instance_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_repeat_question_servable_for_student(
  p_student_id uuid,
  p_grade      smallint,
  p_domains    text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_instance_id uuid;
BEGIN
  IF p_student_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- The pupil already has an open question: serve that, never a new repeat (idx_one_open_question).
  IF EXISTS (
    SELECT 1 FROM public.question_instances qi
    WHERE qi.student_id = p_student_id AND qi.answered = false
  ) THEN
    RETURN NULL;
  END IF;

  -- Repeats are a last resort, verified against the server-derived scope: no SERVABLE unserved
  -- question may remain (the same rule the candidate window uses).
  IF EXISTS (
    SELECT 1
    FROM public.questions q
    WHERE q.is_active
      AND (p_grade IS NULL OR q.target_grade IS NULL OR q.target_grade <= p_grade)
      AND (p_domains IS NULL OR q.learning_objective = ANY(p_domains))
      AND public.question_is_servable(q.answer_format, q.answer_type, q.content)
      AND NOT EXISTS (
        SELECT 1 FROM public.question_instances qi
        WHERE qi.student_id = p_student_id AND qi.question_id = q.id
      )
  ) THEN
    RETURN NULL;
  END IF;

  -- Incorrect first, oldest answer first within each group.
  SELECT qi.id
  INTO v_instance_id
  FROM public.question_instances qi
    JOIN public.questions q ON q.id = qi.question_id
  WHERE qi.student_id  = p_student_id
    AND qi.answered    = true
    AND qi.teacher_score IS NULL            -- never reopen teacher-graded work
    AND q.is_active
    AND q.answer_format <> 'text'           -- auto-graded only: no teacher-owned state
    AND coalesce(q.answer_type, 'short') <> 'long'
    AND public.question_is_servable(q.answer_format, q.answer_type, q.content)
    AND (p_grade IS NULL OR q.target_grade IS NULL OR q.target_grade <= p_grade)
    AND (p_domains IS NULL OR q.learning_objective = ANY(p_domains))
  ORDER BY
    (qi.was_correct IS NOT FALSE),          -- false sorts first
    qi.answered_at ASC NULLS FIRST
  LIMIT 1;

  IF v_instance_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.question_instances
  SET answered       = false,
      user_answer    = NULL,
      was_correct    = NULL,
      answered_at    = NULL,
      next_review_at = now(),
      repeat_count   = repeat_count + 1
  WHERE id = v_instance_id
    AND student_id = p_student_id
    AND answered = true;                    -- lost race: another call already reopened it

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- MC: the key follows the question's current content.correct, exactly as a new instance from
  -- get-next-question gets it, so a corrected text is never graded against an old key. A separate
  -- statement on purpose: under READ COMMITTED it takes its own snapshot AFTER the reopen above,
  -- which waits for any concurrent writer holding question_instances — so a question correction
  -- committed meanwhile is seen. Other formats keep their key (a Match par key is per instance).
  UPDATE public.question_instances qi
  SET correct_answer = q.content ->> 'correct'
  FROM public.questions q
  WHERE qi.id = v_instance_id
    AND q.id = qi.question_id
    AND q.answer_format = 'mc'
    AND jsonb_typeof(q.content -> 'correct') = 'string'
    AND qi.correct_answer IS DISTINCT FROM q.content ->> 'correct';

  RETURN v_instance_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_repeat_level_question_for_student(
  p_student_id uuid,
  p_domains    text[]
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_instance_id uuid;
BEGIN
  IF p_student_id IS NULL OR p_domains IS NULL OR cardinality(p_domains) = 0 THEN
    RETURN NULL;
  END IF;

  -- The pupil already has an open question: serve that, never a new repeat (idx_one_open_question).
  IF EXISTS (
    SELECT 1 FROM public.question_instances qi
    WHERE qi.student_id = p_student_id AND qi.answered = false
  ) THEN
    RETURN NULL;
  END IF;

  -- Repeats are a last resort: no question the level engine could still serve may remain.
  IF EXISTS (
    SELECT 1
    FROM public.questions q
    WHERE q.is_active
      AND q.difficulty_level IS NOT NULL
      AND q.learning_objective = ANY (p_domains)
      AND public.question_is_servable(q.answer_format, q.answer_type, q.content)
      AND NOT EXISTS (
        SELECT 1 FROM public.question_instances qi
        WHERE qi.student_id = p_student_id AND qi.question_id = q.id
      )
  ) THEN
    RETURN NULL;
  END IF;

  -- Incorrect first, oldest answer first within each group.
  SELECT qi.id
  INTO v_instance_id
  FROM public.question_instances qi
    JOIN public.questions q ON q.id = qi.question_id
  WHERE qi.student_id  = p_student_id
    AND qi.answered    = true
    AND qi.teacher_score IS NULL
    AND q.is_active
    AND q.difficulty_level IS NOT NULL
    AND q.answer_format <> 'text'
    AND coalesce(q.answer_type, 'short') <> 'long'
    AND public.question_is_servable(q.answer_format, q.answer_type, q.content)
    AND q.learning_objective = ANY (p_domains)
  ORDER BY
    (qi.was_correct IS NOT FALSE),
    qi.answered_at ASC NULLS FIRST
  LIMIT 1;

  IF v_instance_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.question_instances
  SET answered       = false,
      user_answer    = NULL,
      was_correct    = NULL,
      answered_at    = NULL,
      next_review_at = now(),
      repeat_count   = repeat_count + 1
  WHERE id = v_instance_id
    AND student_id = p_student_id
    AND answered = true;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- MC: the key follows the question's current content.correct, exactly as a new instance from
  -- get-next-question gets it, so a corrected text is never graded against an old key. A separate
  -- statement on purpose: under READ COMMITTED it takes its own snapshot AFTER the reopen above,
  -- which waits for any concurrent writer holding question_instances — so a question correction
  -- committed meanwhile is seen. Other formats keep their key (a Match par key is per instance).
  UPDATE public.question_instances qi
  SET correct_answer = q.content ->> 'correct'
  FROM public.questions q
  WHERE qi.id = v_instance_id
    AND q.id = qi.question_id
    AND q.answer_format = 'mc'
    AND jsonb_typeof(q.content -> 'correct') = 'string'
    AND qi.correct_answer IS DISTINCT FROM q.content ->> 'correct';

  RETURN v_instance_id;
END;
$$;
