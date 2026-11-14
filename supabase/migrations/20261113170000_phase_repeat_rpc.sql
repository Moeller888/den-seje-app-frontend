-- ============================================================================
-- D-362 / F-07 — gentagelse inden for en fase (ejerens beslutning 2026-11-13: forsøgt ≠ korrekt ≠ mestret).
-- IKKE ANVENDT. Kun via apply_migration med særskilt ejerautorisation for netop denne fil (D-110). Listet i
-- NOT_IN_PRODUCTION (tests/isolated/schema/replay-plan.mjs).
--
-- Hvorfor en ny funktion: get-next-question (phase-gate.ts) lader først eleven forlade en fase, når hver opgave i
-- fasen er besvaret korrekt eller har brugt sine gentagelser. Den eneste gentagelsesvej i dag,
-- request_repeat_level_question_for_student, nægter med vilje, så længe der findes en uservet opgave i elevens
-- scope (anti-farming, E2). Under fasespærren er de senere faser netop uservede — så eleven ville få
-- "no_questions" i stedet for at øve den opgave, hun svarede forkert på. Læsningen klarer TypeScript; det er
-- GENÅBNINGEN (en skrivning, som skal vogtes på serveren), der kræver denne funktion.
--
-- Hvad den gør: genåbner præcis én af elevens egne, besvarede, automatisk bedømte instanser blandt de spørgsmål,
-- get-next-question har udledt som den aktuelle fases (p_question_ids, server-afledt — aldrig fra klienten), og
-- KUN hvis det seneste svar er forkert og instansen har færre end p_max_repeats gentagelser. Ældste svar først.
-- Samme vagter som request_repeat_level_question_for_student i øvrigt: ingen åben instans, aktivt spørgsmål med
-- niveau, i elevens domæner, serverbart, ikke fritekst/lærerbedømt. Rigtige svar kan aldrig genåbnes her, så
-- belønningen for en gentagelse (2 XP + 1 mønt) kan ikke høstes på opgaver, eleven allerede kan.
-- Genåbningen er identisk med den eksisterende: answered=false, svar og dom nulstilles, repeat_count + 1, og MC får
-- spørgsmålets aktuelle facit.
--
-- FJERNELSE: DROP FUNCTION public.request_repeat_phase_question_for_student(uuid, text[], uuid[], integer);
-- (get-next-question kalder den kun, når fasespærren beder om en fasegentagelse.)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.request_repeat_phase_question_for_student(
  p_student_id   uuid,
  p_domains      text[],
  p_question_ids uuid[],
  p_max_repeats  integer DEFAULT 2
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
  IF p_student_id IS NULL OR p_domains IS NULL OR cardinality(p_domains) = 0
     OR p_question_ids IS NULL OR cardinality(p_question_ids) = 0
     OR p_max_repeats IS NULL OR p_max_repeats < 1 OR p_max_repeats > 10 THEN
    RETURN NULL;
  END IF;
  -- The pupil already has an open question: serve that, never a new repeat (idx_one_open_question).
  IF EXISTS (
    SELECT 1 FROM public.question_instances qi
    WHERE qi.student_id = p_student_id AND qi.answered = false
  ) THEN
    RETURN NULL;
  END IF;
  -- Only a WRONG latest answer of a question of the current phase, with repeats left. Oldest answer first.
  SELECT qi.id
  INTO v_instance_id
  FROM public.question_instances qi
    JOIN public.questions q ON q.id = qi.question_id
  WHERE qi.student_id   = p_student_id
    AND qi.question_id  = ANY (p_question_ids)
    AND qi.answered     = true
    AND qi.was_correct  = false
    AND qi.repeat_count < p_max_repeats
    AND qi.teacher_score IS NULL
    AND q.is_active
    AND q.difficulty_level IS NOT NULL
    AND q.answer_format <> 'text'
    AND coalesce(q.answer_type, 'short') <> 'long'
    AND public.question_is_servable(q.answer_format, q.answer_type, q.content)
    AND q.learning_objective = ANY (p_domains)
  ORDER BY qi.answered_at ASC NULLS FIRST, qi.id
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
    AND answered = true
    AND was_correct = false;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  -- MC: the key follows the question's current content.correct (same rule as the level repeat).
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

COMMENT ON FUNCTION public.request_repeat_phase_question_for_student(uuid, text[], uuid[], integer) IS
  'D-362: reopens one of the pupil''s own wrong, auto-graded answers among the server-derived current-phase questions (repeats left, oldest first). Backend only.';

REVOKE ALL ON FUNCTION public.request_repeat_phase_question_for_student(uuid, text[], uuid[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_repeat_phase_question_for_student(uuid, text[], uuid[], integer) TO service_role;
