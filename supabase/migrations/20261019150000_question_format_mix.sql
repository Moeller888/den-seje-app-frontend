-- The format mix (fordeling af opgaveformer) for get-next-question v2: a stratified per-pupil candidate
-- window, ONE servable-format rule shared by selection and repeats, and a server-owned difficulty band.
--
-- THE PROBLEMS (read-only measurements, 2026-10-19/20)
--   1. get_unserved_questions_for_student ends in `LIMIT 50` with no ORDER BY: the 50 candidates are the
--      first 50 rows of the heap. The two live "Stav til" rows sit at physical positions 1846–1847 of
--      2,101 active rows, so a new pupil practically never gets them, and every pupil sees the same rows.
--   2. request_repeat_question_for_student starts a repeat only when NO unserved question is left in
--      scope — counting rows of every format. A selector that (correctly) refuses formats the client
--      cannot show (e.g. a future "match") would then see an empty pool while the repeat check sees a
--      full one: the pupil gets "no questions" although answered questions could be repeated.
--   3. The band that steers selection came from the browser. A server replay of the newest N verdicts
--      forgets earned progression once old answers leave the window, and question_instances keeps only
--      the LATEST verdict of an instance (a repeat overwrites it). There is no live per-attempt log:
--      question_attempt_audit and analytics_question_attempts have had no writes since 2026-03-08.
--
-- WHAT THIS ADDS — nothing existing is changed
--   question_is_servable(answer_format, answer_type, content)   IMMUTABLE predicate
--       The SQL twin of supabase/functions/_shared/interaction-kinds.ts (classifyQuestion + servable):
--       true only for a canonical (lower-case, trimmed) format the server, the grading path and the
--       browser all treat the same way AND whose kind is servable today. "match" (Match par) is NOT
--       servable yet. Kept in lock-step with the TS registry by a parity test
--       (tests/unit/question-format-mix-migration-run.test.mjs). Unknown formats are never servable —
--       they can never fall back to multiple choice.
--   get_question_candidates_for_student(student, grade, domains, per_group DEFAULT 20)
--       Same scope predicate as get_unserved_questions_for_student, restricted to servable rows; up to
--       per_group rows per (answer_format, answer_type, force_text, difficulty_band), ranked
--       md5(student_id || question_id): deterministic per pupil, different between pupils.
--   request_repeat_question_servable_for_student(student, grade, domains)
--       The body of request_repeat_question_for_student (live, verified identical 2026-10-20) with ONE
--       change: "the scope is exhausted" and "this instance may be repeated" both mean "no SERVABLE
--       unserved question is left" / "the repeated question is servable". Every guard is kept: no
--       repeat while the pupil has an open question; auto-graded, never teacher-graded, active
--       questions only; same scope; incorrect first, oldest first; a lost race returns NULL. Rewards
--       stay process_question_attempt's (2 XP for a repeat).
--   student_band_state + advance_student_band(student, grade)
--       A server-owned fold of the pupil's verdicts, the SAME rule as app.js adjustDifficultyBand and
--       get-next-question/server-band.ts foldBand: 3 correct in a row → +1 (max 5), 2 incorrect in a row
--       → −1 (min 1). Each verdict is folded EXACTLY ONCE, in (answered_at, id) order, behind a cursor:
--       earned progression is kept for ever, and a repeat that is answered again gets a new answered_at
--       and is folded as the new attempt it is (the earlier verdict was folded when it was given).
--       Seed: a completed placement_sessions.band, else the grade's start band (app.js
--       GRADE_START_BAND), else 2. The fold restarts from the seed when the seed changes (placement
--       completed later, grade changed) or when the cursor's instance no longer exists (history
--       deleted). Per pupil the fold is serialised (row lock), so concurrent calls never double-count.
--       The cursor relies on one invariant: process_question_attempt / process_text_answer write
--       answered_at = now() in the SAME UPDATE as the verdict, and a pupil's next answer can start only
--       after the previous one committed (idx_one_open_question), so one pupil's verdict timestamps
--       strictly increase in commit order. Teacher grading writes teacher_score, never was_correct.
--       profiles.current_band / placement_band (client-writable) and any request field are NOT inputs.
--
-- PRIVILEGES. Every function has a pinned search_path and EXECUTE for service_role only; all but the pure
-- predicate question_is_servable (SECURITY INVOKER, reads nothing) are SECURITY DEFINER. student_band_state has RLS enabled, no policies, and no privileges for PUBLIC, anon or
-- authenticated. No existing policy, RLS setting, grant, table or function is changed.
--
-- NOTHING CHANGES WHEN THIS IS APPLIED: the live get-next-question calls none of these until a build
-- with the format mix is deployed AND its Edge secret QUESTION_MIX_ENGINE is set ("shadow" calls
-- advance_student_band and the candidate function to log; only "v2" serves from them).
--
-- Applying this needs its own owner authorisation (D-110) through apply_migration — never db push —
-- and the security review it was prepared for.

-- ── 1. The servable-format rule ─────────────────────────────────────────────
CREATE FUNCTION public.question_is_servable(
  p_answer_format text,
  p_answer_type   text,
  p_content       jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    -- The server's mapAnswerFormat is case- and space-sensitive, the browser lower-cases.
    WHEN p_answer_format IS NULL OR p_answer_format = ''
      OR p_answer_format <> lower(btrim(p_answer_format)) THEN false
    -- process-event compares answer_type = 'long' exactly; the browser trims and lower-cases.
    WHEN p_answer_type IS NOT NULL AND p_answer_type <> lower(btrim(p_answer_type)) THEN false
    -- Teacher-graded long answer: only "text" is also SHOWN as a long answer.
    WHEN coalesce(nullif(p_answer_type, ''), 'short') = 'long' THEN
      p_answer_format = 'text' AND (p_content -> 'force_text') IS DISTINCT FROM 'true'::jsonb
    WHEN coalesce(nullif(p_answer_type, ''), 'short') <> 'short' THEN false
    -- Match par: registered in the TS registry, no renderer and no grading path yet.
    WHEN p_answer_format = 'match' THEN false
    -- Server tests "mc" first, the browser "number" first: a format containing both is ambiguous.
    WHEN p_answer_format LIKE 'mc%' AND p_answer_format LIKE '%number%' THEN false
    WHEN (p_content -> 'force_text') IS NOT DISTINCT FROM 'true'::jsonb THEN p_answer_format LIKE 'mc%'
    WHEN p_answer_format LIKE 'mc%' THEN true
    WHEN p_answer_format LIKE '%number%' THEN true
    WHEN p_answer_format = 'text' THEN true
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.question_is_servable(text, text, jsonb) IS
  'SQL twin of _shared/interaction-kinds.ts classifyQuestion + servable: true only for formats server, '
  'grading and browser agree on and the client can show. Kept in lock-step by a parity test. See 20261019150000.';

REVOKE ALL ON FUNCTION public.question_is_servable(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.question_is_servable(text, text, jsonb) TO service_role;

-- ── 2. Stratified per-pupil candidate window ────────────────────────────────
CREATE FUNCTION public.get_question_candidates_for_student(
  p_student_id uuid,
  p_grade      smallint,
  p_domains    text[],
  p_per_group  integer DEFAULT 20
)
RETURNS TABLE (
  id                 uuid,
  content            jsonb,
  answer_format      text,
  answer_type        text,
  metadata           jsonb,
  difficulty_band    integer,
  learning_objective text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH eligible AS (
    SELECT q.id, q.content, q.answer_format, q.answer_type, q.metadata, q.difficulty_band,
           q.learning_objective,
           md5(p_student_id::text || q.id::text) AS rank_key
    FROM public.questions q
    WHERE p_student_id IS NOT NULL
      AND q.is_active = true
      AND (p_grade IS NULL OR q.target_grade IS NULL OR q.target_grade <= p_grade)
      AND (p_domains IS NULL OR q.learning_objective = ANY(p_domains))
      AND public.question_is_servable(q.answer_format, q.answer_type, q.content)
      AND NOT EXISTS (
        SELECT 1
        FROM public.question_instances qi
        WHERE qi.student_id  = p_student_id
          AND qi.question_id = q.id
      )
  ),
  ranked AS (
    SELECT e.*,
           row_number() OVER (
             PARTITION BY e.answer_format,
                          coalesce(e.answer_type, 'short'),
                          (e.content ->> 'force_text') IS NOT DISTINCT FROM 'true',
                          e.difficulty_band
             ORDER BY e.rank_key, e.id
           ) AS group_rank
    FROM eligible e
  )
  SELECT r.id, r.content, r.answer_format, r.answer_type, r.metadata, r.difficulty_band::integer,
         r.learning_objective
  FROM ranked r
  WHERE r.group_rank <= least(greatest(coalesce(p_per_group, 20), 1), 50)
  ORDER BY r.rank_key, r.id;
$$;

COMMENT ON FUNCTION public.get_question_candidates_for_student(uuid, smallint, text[], integer) IS
  'Stratified per-pupil candidate window for new questions (format mix). Scope predicate of '
  'get_unserved_questions_for_student, servable formats only; up to p_per_group rows per (answer_format, '
  'answer_type, force_text, difficulty_band), ranked md5(student_id||question_id). service_role only. See 20261019150000.';

REVOKE ALL ON FUNCTION public.get_question_candidates_for_student(uuid, smallint, text[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_question_candidates_for_student(uuid, smallint, text[], integer) TO service_role;

-- ── 3. Repeat when the SERVABLE pool is exhausted ───────────────────────────
CREATE FUNCTION public.request_repeat_question_servable_for_student(
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

  RETURN v_instance_id;
END;
$$;

COMMENT ON FUNCTION public.request_repeat_question_servable_for_student(uuid, smallint, text[]) IS
  'request_repeat_question_for_student with exhaustion and repeat eligibility judged on servable formats '
  'only (question_is_servable), so selection and repeats agree on what the pool holds. service_role only. See 20261019150000.';

REVOKE ALL ON FUNCTION public.request_repeat_question_servable_for_student(uuid, smallint, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_repeat_question_servable_for_student(uuid, smallint, text[]) TO service_role;

-- ── 4. Server-owned difficulty band ─────────────────────────────────────────
CREATE TABLE public.student_band_state (
  student_id    uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  seed          smallint    NOT NULL CHECK (seed BETWEEN 1 AND 5),
  band          smallint    NOT NULL CHECK (band BETWEEN 1 AND 5),
  correct_run   smallint    NOT NULL DEFAULT 0 CHECK (correct_run BETWEEN 0 AND 3),
  incorrect_run smallint    NOT NULL DEFAULT 0 CHECK (incorrect_run BETWEEN 0 AND 2),
  folded        integer     NOT NULL DEFAULT 0 CHECK (folded >= 0),
  cursor_at     timestamptz,
  cursor_id     uuid,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((cursor_at IS NULL) = (cursor_id IS NULL))
);

COMMENT ON TABLE public.student_band_state IS
  'Server-owned fold of a pupil''s verdicts into a difficulty band (advance_student_band). No client '
  'access. See 20261019150000.';

ALTER TABLE public.student_band_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.student_band_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.student_band_state TO service_role;

CREATE FUNCTION public.advance_student_band(
  p_student_id uuid,
  p_grade      smallint
)
RETURNS TABLE (
  band         smallint,
  seed         smallint,
  seed_source  text,
  folded       integer,
  newly_folded integer
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_seed      smallint;
  v_source    text;
  v_state     public.student_band_state%ROWTYPE;
  v_band      smallint;
  v_cr        smallint;
  v_ir        smallint;
  v_folded    integer;
  v_new       integer = 0;
  v_cursor_at timestamptz;
  v_cursor_id uuid;
  r           record;
BEGIN
  IF p_student_id IS NULL THEN
    RAISE EXCEPTION 'missing_student_id';
  END IF;

  SELECT s.band
  INTO v_seed
  FROM public.placement_sessions s
  WHERE s.student_id = p_student_id
    AND s.completed_at IS NOT NULL
    AND s.band BETWEEN 1 AND 5;

  IF v_seed IS NOT NULL THEN
    v_source = 'placement';
  ELSIF p_grade BETWEEN 3 AND 9 THEN
    v_seed   = CASE p_grade WHEN 8 THEN 2 WHEN 9 THEN 3 ELSE 1 END;   -- app.js GRADE_START_BAND
    v_source = 'grade';
  ELSE
    v_seed   = 2;
    v_source = 'default';
  END IF;

  INSERT INTO public.student_band_state (student_id, seed, band)
  VALUES (p_student_id, v_seed, v_seed)
  ON CONFLICT (student_id) DO NOTHING;

  SELECT *
  INTO v_state
  FROM public.student_band_state st
  WHERE st.student_id = p_student_id
  FOR UPDATE;

  IF v_state.seed <> v_seed
     OR (v_state.cursor_id IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM public.question_instances qi
           WHERE qi.id = v_state.cursor_id AND qi.student_id = p_student_id)) THEN
    -- Seed changed or history deleted: fold again from the seed.
    v_band = v_seed; v_cr = 0; v_ir = 0; v_folded = 0; v_cursor_at = NULL; v_cursor_id = NULL;
  ELSE
    v_band = v_state.band; v_cr = v_state.correct_run; v_ir = v_state.incorrect_run;
    v_folded = v_state.folded; v_cursor_at = v_state.cursor_at; v_cursor_id = v_state.cursor_id;
  END IF;

  FOR r IN
    SELECT qi.id, qi.answered_at, qi.was_correct
    FROM public.question_instances qi
    WHERE qi.student_id = p_student_id
      AND qi.answered = true
      AND qi.was_correct IS NOT NULL
      AND qi.answered_at IS NOT NULL
      AND (v_cursor_at IS NULL OR (qi.answered_at, qi.id) > (v_cursor_at, v_cursor_id))
    ORDER BY qi.answered_at, qi.id
  LOOP
    IF r.was_correct THEN
      v_ir = 0;
      v_cr = least(v_cr + 1, 3);
      IF v_cr >= 3 AND v_band < 5 THEN
        v_band = v_band + 1;
        v_cr = 0;
      END IF;
    ELSE
      v_cr = 0;
      v_ir = least(v_ir + 1, 2);
      IF v_ir >= 2 AND v_band > 1 THEN
        v_band = v_band - 1;
        v_ir = 0;
      END IF;
    END IF;
    v_folded = v_folded + 1;
    v_new = v_new + 1;
    v_cursor_at = r.answered_at;
    v_cursor_id = r.id;
  END LOOP;

  UPDATE public.student_band_state st
  SET seed          = v_seed,
      band          = v_band,
      correct_run   = v_cr,
      incorrect_run = v_ir,
      folded        = v_folded,
      cursor_at     = v_cursor_at,
      cursor_id     = v_cursor_id,
      updated_at    = now()
  WHERE st.student_id = p_student_id;

  RETURN QUERY SELECT v_band, v_seed, v_source, v_folded, v_new;
END;
$$;

COMMENT ON FUNCTION public.advance_student_band(uuid, smallint) IS
  'Folds each new verdict of a pupil exactly once ((answered_at, id) order, cursor) into the server-owned '
  'difficulty band: 3 correct → +1, 2 incorrect → −1, 1..5. Seed: completed placement, else grade start '
  'band, else 2. service_role only. See 20261019150000.';

REVOKE ALL ON FUNCTION public.advance_student_band(uuid, smallint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_student_band(uuid, smallint) TO service_role;
