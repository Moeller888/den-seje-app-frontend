-- Keep answer keys server-side, step A of two: ADD the server-owned paths. Nothing is taken away here.
--
-- THE PROBLEM (read-only audit, 2026-10-16)
-- The correct answer reaches the browser before the pupil answers, through four independent paths:
--   P1  get-next-question returns content.correct (normalizeContent passes it through).
--   P2  get_unserved_questions(smallint, text[]) is SECURITY DEFINER, EXECUTE for anon AND
--       authenticated, and returns questions.content — key included — for any grade/domain scope.
--   P3  question_instances.correct_answer is SELECT-able by the row's owner (column grant + RLS).
--   P4  questions has the policy "allow read questions" USING (true) for PUBLIC: anyone holding the
--       public publishable key can read the whole question bank, keys included, without logging in.
-- The placement assessment (app.js) is built on P4: it reads content.correct and grades in the
-- browser. And request_repeat_question(smallint, text[]) (E2) is EXECUTE for authenticated with a
-- caller-chosen grade/domain scope, so a pupil can name an empty mini-scope, get a repeat, answer it,
-- and repeat that without end.
--
-- WHY TWO MIGRATIONS
-- D-110: a migration is applied only after it is merged, and the frontend deploys on merge. Taking
-- the client paths away first would break the live quiz and placement before their replacements
-- exist. So:
--   A (this file)  adds the replacements only — new functions and one new table. No existing
--                  policy, privilege or function is changed, so applying A changes no behaviour.
--   then           get-next-question and process-event are deployed to use them (server-side reads,
--                  sanitised payload), and the frontend placement moves to start/submit_placement.
--   B (later PR)   takes P2/P3/P4 and the old repeat entry point away from clients.
--
-- WHAT THIS ADDS
--   1. placement_sessions — one server-chosen placement set per pupil. No client access at all.
--   2. start_placement()  — authenticated. Picks the pupil's placement questions server-side and
--      returns ONLY what is needed to show them (id, question, options, difficulty_band). No key.
--   3. submit_placement(jsonb) — authenticated. Grades the answers server-side against the session,
--      once, writes profiles.placement_band and returns only the band. It cannot be used as an
--      oracle: answers count only for the session's own questions, and a session is submitted once.
--   4. get_unserved_questions_for_student(uuid, smallint, text[]) — service_role only. The same
--      selection as get_unserved_questions, for a student id the Edge Function has verified, so the
--      backend can keep reading full content while no client can.
--   5. request_repeat_question_for_student(uuid, smallint, text[]) — service_role only. The same
--      repeat selection and the same guards as request_repeat_question, for a verified student id.
--      get-next-question derives the grade (profiles.selected_grade) and the domains
--      (profiles.active_domains + the subject) server-side; the browser can no longer name a scope.
--
-- WHAT THIS DOES NOT DO
-- No policy, RLS setting or table privilege on questions or question_instances is changed. The
-- existing get_unserved_questions, request_repeat_question, process_question_attempt and
-- release_open_question_outside are not redefined. No reward amount changes: a repeat is still 2 XP,
-- and placement awards nothing, as before. No spaced-repetition structure is introduced.
--
-- Applying this needs its own owner authorisation (D-110) through apply_migration — never db push.

-- ── 1. Placement sessions ────────────────────────────────────────────────────
CREATE TABLE public.placement_sessions (
  student_id   uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  question_ids uuid[]      NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  band         smallint    CHECK (band BETWEEN 1 AND 4)
);

COMMENT ON TABLE public.placement_sessions IS
  'Server-chosen placement set per pupil (start_placement / submit_placement). No client access: '
  'the questions are graded server-side and only the resulting band is returned. See 20261016160000.';

ALTER TABLE public.placement_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.placement_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.placement_sessions TO service_role;

-- ── 2. start_placement ───────────────────────────────────────────────────────
-- Same selection the browser made (active MC history questions, difficulty bands 1-4 as 3+3+2+2,
-- target_grade within the pupil's grade, grade 7 when none is set), except that the choice is made
-- here and is deterministic per pupil instead of Math.random(). An open session is reused, so
-- reloading the page shows the same questions. Fewer than 5 usable questions returns [] — the client
-- then skips placement exactly as it did for "insufficient_questions".
CREATE FUNCTION public.start_placement()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := (SELECT auth.uid());
  v_profile record;
  v_session record;
  v_grade   smallint;
  v_ids     uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT p.role, p.selected_grade, p.placement_band
  INTO v_profile
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF NOT FOUND OR v_profile.role IS DISTINCT FROM 'student' THEN
    RAISE EXCEPTION 'not_a_student';
  END IF;

  -- Already placed: nothing to show.
  IF v_profile.placement_band IS NOT NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  v_grade := coalesce(v_profile.selected_grade, 7);

  SELECT s.question_ids, s.completed_at
  INTO v_session
  FROM public.placement_sessions s
  WHERE s.student_id = v_uid
  FOR UPDATE;

  IF FOUND AND v_session.completed_at IS NULL THEN
    v_ids := v_session.question_ids;
  ELSE
    WITH candidates AS (
      SELECT q.id,
             md5(v_uid::text || q.id::text) AS ord,
             row_number() OVER (
               PARTITION BY q.difficulty_band
               ORDER BY md5(v_uid::text || q.id::text), q.id
             ) AS rn,
             q.difficulty_band
      FROM public.questions q
      WHERE q.is_active
        AND q.answer_format = 'mc'
        AND q.difficulty_band IN (1, 2, 3, 4)
        AND q.learning_objective <> 'english'            -- placement measures history level only
        AND (q.target_grade IS NULL OR q.target_grade <= v_grade)
        AND jsonb_typeof(q.content -> 'options') = 'array'
        AND jsonb_array_length(q.content -> 'options') >= 2
        AND coalesce(q.content ->> 'question', '') <> ''
    )
    SELECT array_agg(c.id ORDER BY c.ord, c.id)
    INTO v_ids
    FROM candidates c
    WHERE c.rn <= CASE c.difficulty_band WHEN 1 THEN 3 WHEN 2 THEN 3 WHEN 3 THEN 2 ELSE 2 END;

    IF coalesce(array_length(v_ids, 1), 0) < 5 THEN
      RETURN '[]'::jsonb;
    END IF;

    INSERT INTO public.placement_sessions (student_id, question_ids)
    VALUES (v_uid, v_ids)
    ON CONFLICT (student_id) DO UPDATE
      SET question_ids = EXCLUDED.question_ids,
          created_at   = now(),
          completed_at = NULL,
          band         = NULL;
  END IF;

  -- Display data only. Options are passed through as strings only; the key never leaves.
  RETURN coalesce((
    SELECT jsonb_agg(
             jsonb_build_object(
               'id',              q.id,
               'question',        q.content ->> 'question',
               'options',         coalesce((
                                    SELECT jsonb_agg(o ORDER BY oi)
                                    FROM jsonb_array_elements(q.content -> 'options') WITH ORDINALITY AS e(o, oi)
                                    WHERE jsonb_typeof(o) = 'string'
                                  ), '[]'::jsonb),
               'difficulty_band', q.difficulty_band
             )
             ORDER BY x.ord
           )
    FROM unnest(v_ids) WITH ORDINALITY AS x(id, ord)
      JOIN public.questions q ON q.id = x.id
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.start_placement() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_placement() TO authenticated;

-- ── 3. submit_placement ──────────────────────────────────────────────────────
-- p_answers: [{ "question_id": "<uuid>", "answer": "<option text>" }, ...]. Scoring is the browser's
-- old rule, unchanged: a correct answer on band N scores N points (max 3*1 + 3*2 + 2*3 + 2*4 = 23);
-- >= 18 -> band 4, >= 12 -> 3, >= 6 -> 2, otherwise 1. "Correct" is the old exact comparison of the
-- chosen option text with content.correct. Only the session's own questions count, each once (the
-- first answer given), so a forged list cannot score a question twice or probe other questions.
CREATE FUNCTION public.submit_placement(p_answers jsonb)
RETURNS smallint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := (SELECT auth.uid());
  v_session record;
  v_score   integer := 0;
  v_band    smallint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array' OR jsonb_array_length(p_answers) > 50 THEN
    RAISE EXCEPTION 'invalid_answers';
  END IF;

  SELECT s.question_ids, s.completed_at
  INTO v_session
  FROM public.placement_sessions s
  WHERE s.student_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_placement_session';
  END IF;

  IF v_session.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'placement_already_submitted';
  END IF;

  WITH given AS (
    SELECT (e ->> 'question_id')::uuid AS question_id,
           e ->> 'answer'              AS answer,
           ord
    FROM jsonb_array_elements(p_answers) WITH ORDINALITY AS t(e, ord)
    WHERE jsonb_typeof(e) = 'object'
      AND (e ->> 'question_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  first_answer AS (
    SELECT DISTINCT ON (g.question_id) g.question_id, g.answer
    FROM given g
    WHERE g.question_id = ANY (v_session.question_ids)
    ORDER BY g.question_id, g.ord
  )
  SELECT coalesce(sum(q.difficulty_band) FILTER (WHERE fa.answer = q.content ->> 'correct'), 0)
  INTO v_score
  FROM first_answer fa
    JOIN public.questions q ON q.id = fa.question_id;

  v_band := CASE
    WHEN v_score >= 18 THEN 4
    WHEN v_score >= 12 THEN 3
    WHEN v_score >= 6  THEN 2
    ELSE 1
  END;

  UPDATE public.profiles
  SET placement_band = v_band
  WHERE id = v_uid;

  UPDATE public.placement_sessions
  SET completed_at = now(),
      band         = v_band
  WHERE student_id = v_uid;

  RETURN v_band;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_placement(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_placement(jsonb) TO authenticated;

-- ── 4. get_unserved_questions_for_student ────────────────────────────────────
-- Identical selection to get_unserved_questions (same predicate, same LIMIT, same columns), but for
-- an explicit student id instead of auth.uid(): it is called by get-next-question through the
-- backend client, with the verified user.id, so full content (and so the key that becomes
-- question_instances.correct_answer) stays inside the server. A NULL id returns nothing.
CREATE FUNCTION public.get_unserved_questions_for_student(
  p_student_id uuid,
  p_grade      smallint,
  p_domains    text[]
)
RETURNS TABLE (
  id              uuid,
  content         jsonb,
  answer_format   text,
  answer_type     text,
  metadata        jsonb,
  difficulty_band integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT q.id, q.content, q.answer_format, q.answer_type, q.metadata, q.difficulty_band
  FROM public.questions q
  WHERE p_student_id IS NOT NULL
    AND q.is_active = true
    AND (p_grade IS NULL OR q.target_grade IS NULL OR q.target_grade <= p_grade)
    AND (p_domains IS NULL OR q.learning_objective = ANY(p_domains))
    AND NOT EXISTS (
      SELECT 1
      FROM public.question_instances qi
      WHERE qi.student_id  = p_student_id
        AND qi.question_id = q.id
    )
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.get_unserved_questions_for_student(uuid, smallint, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_unserved_questions_for_student(uuid, smallint, text[]) TO service_role;

-- ── 5. request_repeat_question_for_student ───────────────────────────────────
-- The body of request_repeat_question (20261002000000) with the caller's auth.uid() replaced by a
-- verified student id, and EXECUTE for the backend only. Every guard is kept: no repeat while the
-- pupil has an open question; no repeat while any unserved question remains in scope; auto-graded,
-- never teacher-graded, active questions only; incorrect first, oldest answer first; a lost race
-- returns NULL. The scope is no longer the browser's: get-next-question passes the grade and domains
-- it derived from the pupil's profile. The award stays process_question_attempt's (2 XP for a repeat).
CREATE FUNCTION public.request_repeat_question_for_student(
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

  RETURN v_instance_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_repeat_question_for_student(uuid, smallint, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_repeat_question_for_student(uuid, smallint, text[]) TO service_role;
