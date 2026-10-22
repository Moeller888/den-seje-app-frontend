-- Sværhedsskala 1-10.000, migration B: niveauvalg, niveau-gentagelse og elevens niveau pr. fag.
--
-- WHY. docs/difficulty-scale-design.md §5-§6 (owner decisions B1-B8 2026-10-20, E1-E5 2026-10-22, path A
-- 2026-10-22). Migration A (20261020120000) added the storage: questions.difficulty_level and
-- student_subject_level. This file adds the logic get-next-question uses when its Edge secret
-- LEVEL_ENGINE is "v1". With LEVEL_ENGINE unset nothing here is called: applying it changes nothing.
--
-- PREREQUISITES (in this order; each needs its own owner approval, D-110):
--   1. 20261019150000_question_format_mix (#351): public.question_is_servable is used below;
--   2. 20261020120000_difficulty_scale_a: difficulty_level, student_subject_level,
--      difficulty_level_from_grade_band.
--
-- WHAT THIS ADDS — no existing table, function, policy or grant is changed
--   student_level_fold_log
--       One row per question instance whose verdict has moved a pupil's level (PRIMARY KEY on the
--       instance id). This is what makes the level update EXACTLY ONCE per answer: a double submit, a
--       retried request, a concurrent request or a later rewrite of answered_at can never fold the same
--       instance twice. It is also the first per-attempt log since 2026-03-08 (level before/after).
--   advance_student_level(student, subject, grade) → level, seed_level, seed_source, answered, newly_folded
--       Creates the pupil's row for the subject on first use (seed: §4.2 — for historie a completed
--       placement band, otherwise the grade's start band from app.js GRADE_START_BAND, otherwise 2; the
--       level is difficulty_level_from_grade_band(grade, band), 143 without a grade). Then folds every
--       NEW first verdict of the subject into the level, in (answered_at, id) order, behind a row lock:
--         step = max(15, round(150 / sqrt(answered + 1)))   correct: +step   incorrect: −3·step
--         clamped to 1..10000 (B3: the pupil settles where ~75 % of answers are right).
--       Folded: auto-graded verdicts only (was_correct set, never a teacher-graded long answer, never a
--       teacher-scored instance), first answers only (repeat_count = 0), the subject's questions only.
--       The seed is fixed at creation: the grade is a starting point, never a ceiling or a reset (B4).
--       Placement measures history only (20261019120000), so it seeds historie only.
--   get_level_questions_for_student(student, level, domains, limit 50) → candidates
--       Active questions WITH a difficulty_level in the given domains that the pupil has never been
--       served and whose format is servable (#351's rule), nearest level first, then
--       md5(student_id || question_id) (deterministic per pupil, different between pupils). No grade
--       ceiling (B4). Inactive questions and questions without a level are never returned.
--       Fast path: the nearest 300 active questions above and below the level per domain, read through
--       idx_questions_objective_level, are filtered first; when that window cannot prove the answer
--       (fewer than `limit` valid questions strictly inside it) the full search runs instead. Same
--       result either way — see the proof in the function body and docs/operations/level-engine-rollout.md §4.
--   request_repeat_level_question_for_student(student, domains) → instance id | NULL
--       #351's request_repeat_question_servable_for_student with the level engine's pool: "exhausted"
--       means no active, levelled, servable unserved question is left in the domains, and only levelled
--       questions are reopened. Every guard is kept: no repeat while an instance is open; auto-graded,
--       never teacher-graded, active questions only; incorrect first, oldest first; a lost race → NULL.
--   idx_qi_student_answered — (student_id, answered_at, id) WHERE answered, for the fold.
--
-- PRIVILEGES. All three functions are SECURITY INVOKER with a pinned search_path and EXECUTE for
-- service_role only (the live default privileges would otherwise give anon and authenticated EXECUTE):
-- the Edge function calls them through the backend client, and service_role already holds SELECT,
-- INSERT, UPDATE and DELETE on every table they touch (verified read-only 2026-10-22), so no
-- privilege escalation is needed. A client that somehow got EXECUTE would still run with its own
-- rights: no write privilege on student_subject_level or student_level_fold_log, no read of
-- questions. student_level_fold_log: RLS on, no policies, no privileges for PUBLIC/anon/authenticated.
--
-- Må KUN anvendes via apply_migration med særskilt ejer-autorisation (D-110), efter forudsætningerne.

-- ── 1. Exactly-once log of folded verdicts ──────────────────────────────────
CREATE TABLE public.student_level_fold_log (
  question_instance_id uuid        PRIMARY KEY REFERENCES public.question_instances(id) ON DELETE CASCADE,
  student_id           uuid        NOT NULL,
  subject              text        NOT NULL CHECK (subject IN ('historie', 'engelsk', 'dansk')),
  was_correct          boolean     NOT NULL,
  level_before         integer     NOT NULL CHECK (level_before BETWEEN 1 AND 10000),
  level_after          integer     NOT NULL CHECK (level_after BETWEEN 1 AND 10000),
  folded_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_student_level_fold_log_student
  ON public.student_level_fold_log (student_id, subject, folded_at);

COMMENT ON TABLE public.student_level_fold_log IS
  'One row per question instance whose verdict moved the pupil''s level (advance_student_level): the '
  'primary key makes the level update exactly-once. Server-only. See 20261022120000.';

ALTER TABLE public.student_level_fold_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.student_level_fold_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.student_level_fold_log TO service_role;

CREATE INDEX idx_qi_student_answered
  ON public.question_instances (student_id, answered_at, id)
  WHERE answered;

-- ── 2. The pupil's level per subject ────────────────────────────────────────
CREATE FUNCTION public.advance_student_level(
  p_student_id uuid,
  p_subject    text,
  p_grade      smallint
)
RETURNS TABLE (
  level        integer,
  seed_level   integer,
  seed_source  text,
  answered     integer,
  newly_folded integer
)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_band     smallint;
  v_source   text;
  v_seed     integer;
  v_state    public.student_subject_level%ROWTYPE;
  v_level    integer;
  v_answered integer;
  v_before   integer;
  v_step     integer;
  v_new      integer = 0;
  v_rows     integer;
  r          record;
BEGIN
  IF p_student_id IS NULL THEN
    RAISE EXCEPTION 'missing_student_id';
  END IF;
  IF p_subject IS NULL OR p_subject NOT IN ('historie', 'engelsk', 'dansk') THEN
    RAISE EXCEPTION 'invalid_subject: %', p_subject;
  END IF;

  -- Seed (used only when the row is created). Placement measures history only.
  IF p_subject = 'historie' THEN
    SELECT s.band INTO v_band
    FROM public.placement_sessions s
    WHERE s.student_id = p_student_id
      AND s.completed_at IS NOT NULL
      AND s.band BETWEEN 1 AND 5;
  END IF;

  IF v_band IS NOT NULL THEN
    v_source = 'placement';
  ELSIF p_grade BETWEEN 3 AND 9 THEN
    v_band   = CASE p_grade WHEN 8 THEN 2 WHEN 9 THEN 3 ELSE 1 END;   -- app.js GRADE_START_BAND
    v_source = 'grade';
  ELSE
    v_band   = 2;
    v_source = 'default';
  END IF;
  v_seed = coalesce(public.difficulty_level_from_grade_band(p_grade, v_band), 143);

  INSERT INTO public.student_subject_level (student_id, subject, level)
  VALUES (p_student_id, p_subject, v_seed)
  ON CONFLICT (student_id, subject) DO NOTHING;

  -- Serialises every fold of this pupil and subject: a concurrent call waits here.
  SELECT * INTO v_state
  FROM public.student_subject_level sl
  WHERE sl.student_id = p_student_id AND sl.subject = p_subject
  FOR UPDATE;

  v_level    = v_state.level;
  v_answered = v_state.answered;

  FOR r IN
    SELECT qi.id, qi.was_correct
    FROM public.question_instances qi
      JOIN public.questions q ON q.id = qi.question_id
    WHERE qi.student_id = p_student_id
      AND qi.answered = true
      AND qi.was_correct IS NOT NULL
      AND qi.answered_at IS NOT NULL
      AND qi.repeat_count = 0                       -- first answers only
      AND qi.teacher_score IS NULL                  -- never teacher-graded work
      AND coalesce(q.answer_type, 'short') <> 'long'
      AND CASE p_subject
            WHEN 'engelsk' THEN q.learning_objective = 'english'
            WHEN 'dansk'   THEN q.learning_objective = 'danish'
            ELSE q.learning_objective IS NOT NULL AND q.learning_objective NOT IN ('english', 'danish')
          END
      AND NOT EXISTS (
        SELECT 1 FROM public.student_level_fold_log f WHERE f.question_instance_id = qi.id
      )
    ORDER BY qi.answered_at, qi.id
  LOOP
    v_before = v_level;
    v_step = greatest(15, round((150 / sqrt(v_answered + 1))::numeric)::integer);
    IF r.was_correct THEN
      v_level = least(10000, v_level + v_step);
    ELSE
      v_level = greatest(1, v_level - 3 * v_step);
    END IF;

    INSERT INTO public.student_level_fold_log
      (question_instance_id, student_id, subject, was_correct, level_before, level_after)
    VALUES (r.id, p_student_id, p_subject, r.was_correct, v_before, v_level)
    ON CONFLICT (question_instance_id) DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 1 THEN
      v_answered = v_answered + 1;
      v_new = v_new + 1;
    ELSE
      v_level = v_before;                          -- already folded elsewhere: no second step
    END IF;
  END LOOP;

  IF v_new > 0 THEN
    UPDATE public.student_subject_level sl
    SET level = v_level, answered = v_answered, updated_at = now()
    WHERE sl.student_id = p_student_id AND sl.subject = p_subject;
  END IF;

  RETURN QUERY SELECT v_level, v_seed, v_source, v_answered, v_new;
END;
$$;

COMMENT ON FUNCTION public.advance_student_level(uuid, text, smallint) IS
  'Folds each new first, auto-graded verdict of a subject exactly once (student_level_fold_log) into the '
  'pupil''s level 1-10000: +max(15, round(150/sqrt(n+1))) if correct, −3× if not. Seed per §4.2, fixed at '
  'creation. service_role only, SECURITY INVOKER. See 20261022120000.';

REVOKE ALL ON FUNCTION public.advance_student_level(uuid, text, smallint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_student_level(uuid, text, smallint) TO service_role;

-- ── 3. Nearest-level candidates ─────────────────────────────────────────────
CREATE FUNCTION public.get_level_questions_for_student(
  p_student_id uuid,
  p_level      integer,
  p_domains    text[],
  p_limit      integer DEFAULT 50
)
RETURNS TABLE (
  id                 uuid,
  content            jsonb,
  answer_format      text,
  answer_type        text,
  metadata           jsonb,
  difficulty_band    integer,
  learning_objective text,
  difficulty_level   integer
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
-- Plan every statement with the call's actual domain and level. A cached generic plan estimates a
-- domain's rows as 1/ndistinct of the table and then prefers reading the whole subject plus a sort
-- over the window's ordered index scan (measured on PostgreSQL 17, docs/operations/level-engine-rollout.md §4).
SET plan_cache_mode = force_custom_plan
AS $$
DECLARE
  v_window    CONSTANT integer := 300;
  v_limit     integer;
  v_objective text;
  v_part      uuid[];
  v_fetched   integer;
  v_farthest  integer;
  v_near      uuid[] := '{}';
  v_cut       integer;
  v_ids       uuid[];
BEGIN
  IF p_student_id IS NULL THEN
    RAISE EXCEPTION 'missing_student_id';
  END IF;
  IF p_level IS NULL OR p_level NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'invalid_level: %', p_level;
  END IF;
  IF p_domains IS NULL OR cardinality(p_domains) = 0 THEN
    RAISE EXCEPTION 'missing_domains';
  END IF;

  v_limit := least(greatest(coalesce(p_limit, 50), 1), 100);

  -- FAST PATH: per domain, the nearest v_window active questions at or above p_level and the nearest
  -- v_window below it, read in level order from idx_questions_objective_level (20261020120000) — two
  -- ordered index scans that stop after v_window rows. question_is_servable and the served-check then
  -- run on at most 2 × v_window rows per domain instead of on the whole subject.
  --
  -- Why it gives exactly the full search's answer. A branch that returned fewer than v_window rows
  -- holds every active question on its side. A branch that returned v_window rows ("truncated") holds
  -- every question strictly nearer than its farthest row (an ordered LIMIT never skips a smaller
  -- distance). So below v_cut — the smallest farthest-distance over the truncated branches — the window
  -- holds EVERY active question, and with it every valid one. If v_limit valid questions lie below
  -- v_cut, they are the full search's first v_limit, in the same order (same ORDER BY). Ties at
  -- v_cut itself are excluded, because the window may hold only some of them.
  --
  -- One domain at a time, so the planner sees the domain and the level as values (plan_cache_mode
  -- below) and estimates each branch's rows correctly; with the domain as a join value it
  -- underestimates them and reads the whole subject through a bitmap or sequential scan plus a sort.
  FOR v_objective IN
    SELECT DISTINCT d.objective FROM unnest(p_domains) AS d(objective) WHERE d.objective IS NOT NULL
  LOOP
    SELECT coalesce(array_agg(w.id), '{}'), count(*), max(w.difficulty_level) - p_level
    INTO v_part, v_fetched, v_farthest
    FROM (
      SELECT q.id, q.difficulty_level
      FROM public.questions q
      WHERE q.is_active = true AND q.learning_objective = v_objective AND q.difficulty_level >= p_level
      ORDER BY q.difficulty_level ASC
      LIMIT v_window
    ) w;
    v_near := v_near || v_part;
    IF v_fetched = v_window THEN
      v_cut := least(v_cut, v_farthest);
    END IF;

    SELECT coalesce(array_agg(w.id), '{}'), count(*), p_level - min(w.difficulty_level)
    INTO v_part, v_fetched, v_farthest
    FROM (
      SELECT q.id, q.difficulty_level
      FROM public.questions q
      WHERE q.is_active = true AND q.learning_objective = v_objective AND q.difficulty_level < p_level
      ORDER BY q.difficulty_level DESC
      LIMIT v_window
    ) w;
    v_near := v_near || v_part;
    IF v_fetched = v_window THEN
      v_cut := least(v_cut, v_farthest);
    END IF;
  END LOOP;

  SELECT array_agg(c.id ORDER BY c.dist, c.tiebreak, c.id)
  INTO v_ids
  FROM (
    SELECT q.id, abs(q.difficulty_level - p_level) AS dist, md5(p_student_id::text || q.id::text) AS tiebreak
    FROM public.questions q
    WHERE q.id = ANY (v_near)
      AND (v_cut IS NULL OR abs(q.difficulty_level - p_level) < v_cut)
      AND public.question_is_servable(q.answer_format, q.answer_type, q.content)
      AND NOT EXISTS (
        SELECT 1 FROM public.question_instances qi
        WHERE qi.student_id = p_student_id AND qi.question_id = q.id
      )
    ORDER BY abs(q.difficulty_level - p_level), md5(p_student_id::text || q.id::text), q.id
    LIMIT v_limit
  ) c;

  IF coalesce(cardinality(v_ids), 0) = v_limit THEN
    RETURN QUERY
    SELECT q.id, q.content, q.answer_format, q.answer_type, q.metadata, q.difficulty_band::integer,
           q.learning_objective, q.difficulty_level
    FROM public.questions q
    WHERE q.id = ANY (v_ids)
    ORDER BY array_position(v_ids, q.id);
    RETURN;
  END IF;

  -- FALLBACK: the window held fewer than v_limit valid questions (many inactive, served or unservable
  -- rows near the level, or a small bank). The full search over the subject — the definition.
  RETURN QUERY
  SELECT q.id, q.content, q.answer_format, q.answer_type, q.metadata, q.difficulty_band::integer,
         q.learning_objective, q.difficulty_level
  FROM public.questions q
  WHERE q.is_active = true
    AND q.difficulty_level IS NOT NULL
    AND q.learning_objective = ANY (p_domains)
    AND public.question_is_servable(q.answer_format, q.answer_type, q.content)
    AND NOT EXISTS (
      SELECT 1 FROM public.question_instances qi
      WHERE qi.student_id = p_student_id AND qi.question_id = q.id
    )
  ORDER BY abs(q.difficulty_level - p_level), md5(p_student_id::text || q.id::text), q.id
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.get_level_questions_for_student(uuid, integer, text[], integer) IS
  'Level engine candidates: active, levelled, servable, never-served questions in the domains, nearest '
  'difficulty_level first, then md5(student_id||question_id). No grade ceiling. service_role only, '
  'SECURITY INVOKER. See 20261022120000.';

REVOKE ALL ON FUNCTION public.get_level_questions_for_student(uuid, integer, text[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_level_questions_for_student(uuid, integer, text[], integer) TO service_role;

-- ── 4. Repeat when the level engine's pool is exhausted ─────────────────────
CREATE FUNCTION public.request_repeat_level_question_for_student(
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

  RETURN v_instance_id;
END;
$$;

COMMENT ON FUNCTION public.request_repeat_level_question_for_student(uuid, text[]) IS
  'Level engine repeat: #351''s servable repeat without the grade ceiling, over levelled questions only. '
  'service_role only, SECURITY INVOKER. See 20261022120000.';

REVOKE ALL ON FUNCTION public.request_repeat_level_question_for_student(uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_repeat_level_question_for_student(uuid, text[]) TO service_role;
