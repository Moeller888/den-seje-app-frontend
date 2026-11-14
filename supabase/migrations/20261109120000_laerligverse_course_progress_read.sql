-- Lærligverse F10-B2: the teacher's separate course-progress view ("Kursusforløb") — ONE read RPC.
--
-- NOT APPLIED IN PRODUCTION. Applying it needs a separate owner authorisation (D-110); the frontend that
-- calls it is behind ENABLE_COURSE_PROGRESS_VIEW = false (js/course-progress-view.js), so nothing calls it
-- before both the product GO and the migration GO. The CLI's database-push command is forbidden
-- (docs/migration-workflow-policy.md).
--
-- Contract: docs/laerligverse/kursusvisning-ui-kontrakt.md §5 (binding), laererstatistik-adskillelse.md B,
-- evidens-datakontrakt.md. It ADDS one function and changes nothing else: no table, column, index, policy,
-- trigger, view or existing function; no row is written. The ordinary mastery figures (get_student_overview,
-- get_teacher_visibility, the domain view) are untouched.
--
-- public.get_course_progress(p_student_id uuid) RETURNS jsonb
--
-- GATE — the get_student_overview gate (20261029150000), mirrored statement for statement, plus the
-- pupil's own row, which the UI contract §5 requires ("caller er eleven selv, elevens lærer eller
-- super_admin"):
--   not signed in                      → NULL
--   no profile / any other role        → NULL
--   target not a pupil                 → NULL
--   teacher, pupil of another teacher  → NULL
--   pupil asking about another pupil   → NULL
-- Every refusal is the same NULL as an unknown id: nothing confirms that a pupil exists.
-- SECURITY DEFINER because question_attempts has no client SELECT policy and question_instances is read
-- across the teacher boundary exactly like get_student_overview does; search_path is EMPTY and every
-- object is schema-qualified; EXECUTE for authenticated only (revoked from PUBLIC, anon, service_role).
--
-- WHAT IS READ — the pupil's own rows only:
--   question_instances  joined to questions; a COURSE ITEM is a question whose metadata is an object with
--                       the key learning_step (D-338). Ordinary questions never appear.
--   question_attempts   (H5) when the table exists; mode and hints_used only when those columns exist
--                       (L1 K1, 20261103110000, not applied in production). Detected at run time, read
--                       with dynamic SQL built from constant fragments only (no caller input in the text).
-- Never returned: correct answers, answer texts, question content, feedback texts, other pupils.
--
-- RESULT
--   { version: 1, rules: "evidence.ts@<sha256-12>",
--     sources: { attempt_log, mode, hints },          -- which optional sources exist in this database
--     objectives: [ { objective_id, started_at,        -- first served course instance in the objective
--                     steps: [ one entry per served instance, ordered by served_at ] } ] }
--   step entry:
--     step              questions.metadata.learning_step (text as authored)
--     status            'answered' | 'served'
--     correct           the FIRST answer's verdict (attempt_no = 1), or NULL when not known
--     attempt_no        the number of the first CORRECT attempt (1 = the first answer), NULL when not solved
--                       or not known
--     hints_used        hints before the first answer — NULL unless registered by the server (see HINTS)
--     mode              the first attempt's recorded mode (K1), NULL when not registered
--     evidence          'practice' | 'shown_independently' | 'not_shown' | 'unknown'
--     first_answer_at   when the first answer was registered, NULL when not known
--     served_at, grading, source ('attempt' | 'instance' | NULL)
--     sequence          { answered, was_correct, answered_at } — exactly the question_instances fields
--                       get-next-question reads for the sequence (learning-sequence.ts historyFromRows)
--   completed_at is deliberately NOT computed here: "sequence complete" is learning-sequence.ts nextStep()
--   (provisional test policy laerligverse-test-policy-v0, LP-13 open). A second copy of that policy in SQL
--   would drift; the browser runs a parity-tested port of nextStep over `sequence` instead.
--
-- FIRST ANSWERS ONLY, NO DOUBLE COUNT. One entry per instance; its first answer is the attempt row with
-- attempt_no = 1 when the H5 log has one, otherwise the instance itself if it was never repeated
-- (repeat_count = 0). A repeat overwrites the instance (20261029150000 KNOWN), so a repeated instance
-- without attempt 1 in the log has NO known first answer: correct, first_answer_at and attempt_no are NULL —
-- never guessed. An instance and its attempts are never two answers.
--
-- HINTS. Under K1 alone process-event writes the constants mode 'quiz_v1' and hints_used 0
-- (text-answer-rpc.ts L1_ATTEMPT_CONTEXT); that 0 is not a registered fact. hints_used is therefore
-- reported only when the attempt's mode is a server-derived learning mode (anything but quiz_v1), which is
-- the case only with L5 + L3 (#653) on. Otherwise NULL — "ikke registreret", never 0.
--
-- EVIDENCE — the evidence.ts (D-330) `independent` working state, per step's first answer:
--   practice steps (guided_practice, revision: mayBecomeEvidence = false) → 'practice'
--   unknown step tag                                                       → 'unknown'
--   served, not answered                                                   → 'not_shown'
--   first answer not known (NULL verdict)                                  → 'unknown'   (*)
--   correct, mode ∈ {check, review, application}, hints_used = 0           → 'shown_independently'
--   correct, mode or hints not registered                                  → 'unknown'
--   anything else (incorrect, with help, non-assessment mode)              → 'not_shown'
--   (*) the one addition to evidence.ts, which calls a NULL verdict "not observed": here a first answer the
--   server no longer knows (overwritten by a repeat) or a pending teacher grade is unknown, not "not shown".
-- 'shown_independently' is performance on that task at that time (evidence.ts `independent`), NOT K4
-- eligibility (K5 validity and registered exposure are not established) and never "learned".
-- rules = evidence.ts@3d4a7c1c269c pins the classifier source this mirrors
-- (tests/unit/course-progress-rpc-migration-run.test.mjs fails when evidence.ts changes).
--
-- ROLLBACK: DROP FUNCTION IF EXISTS public.get_course_progress(uuid);  (nothing else depends on it)

CREATE OR REPLACE FUNCTION public.get_course_progress(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_rules     CONSTANT text := 'evidence.ts@3d4a7c1c269c';
  v_uid       uuid := (SELECT auth.uid());
  v_role      text;
  v_target_ok boolean;
  v_attempts  regclass := pg_catalog.to_regclass('public.question_attempts');
  v_has_mode  boolean := false;
  v_has_hints boolean := false;
  v_src       text;
  v_objectives jsonb;
BEGIN
  -- Not signed in: nothing, and no error that would confirm anything.
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  -- The role comes from the database, keyed on the verified JWT subject.
  SELECT p.role INTO v_role
  FROM public.profiles p
  WHERE p.id = v_uid;

  -- A missing profile is an unknown answer, and an unknown answer is not permission.
  IF v_role IS NULL OR v_role NOT IN ('teacher', 'super_admin', 'student') THEN
    RETURN NULL;
  END IF;

  -- The target must be a pupil: of this teacher, any pupil for super_admin, or the pupil themself.
  SELECT true INTO v_target_ok
  FROM public.profiles s
  WHERE s.id = p_student_id
    AND s.role = 'student'
    AND (
      v_role = 'super_admin'
      OR (v_role = 'teacher' AND s.teacher_id = v_uid)
      OR (v_role = 'student' AND s.id = v_uid)
    );

  IF v_target_ok IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  -- Optional sources: the H5 attempt log, and K1's mode / hints_used on it.
  IF v_attempts IS NOT NULL THEN
    v_has_mode := EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = v_attempts AND a.attname = 'mode' AND a.attnum > 0 AND NOT a.attisdropped);
    v_has_hints := EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = v_attempts AND a.attname = 'hints_used' AND a.attnum > 0 AND NOT a.attisdropped);
    v_src := pg_catalog.format(
      'SELECT qa.question_instance_id, qa.attempt_no, qa.was_correct, qa.answered_at, qa.grading::text AS grading, '
      || '%s AS mode, %s AS hints_used FROM public.question_attempts qa WHERE qa.student_id = $1',
      CASE WHEN v_has_mode THEN 'qa.mode::text' ELSE 'NULL::text' END,
      CASE WHEN v_has_hints THEN 'qa.hints_used::integer' ELSE 'NULL::integer' END);
  ELSE
    v_src := 'SELECT NULL::uuid AS question_instance_id, NULL::integer AS attempt_no, NULL::boolean AS was_correct, '
      || 'NULL::timestamptz AS answered_at, NULL::text AS grading, NULL::text AS mode, NULL::integer AS hints_used '
      || 'WHERE false';
  END IF;

  EXECUTE pg_catalog.format($q$
    WITH att AS (%s),
    inst AS (
      SELECT qi.id, qi.created_at, qi.answered, qi.was_correct, qi.answered_at,
             COALESCE(qi.repeat_count, 0) AS repeat_count,
             q.learning_objective AS objective,
             q.metadata ->> 'learning_step' AS step
      FROM public.question_instances qi
      JOIN public.questions q ON q.id = qi.question_id
      WHERE qi.student_id = $1
        AND q.learning_objective IS NOT NULL
        AND pg_catalog.jsonb_typeof(q.metadata) = 'object'
        AND q.metadata ? 'learning_step'
    ),
    facts AS (
      SELECT i.*,
             fa.attempt_no  AS fa_no,
             fa.was_correct AS fa_correct,
             fa.answered_at AS fa_at,
             fa.grading     AS fa_grading,
             fa.mode        AS fa_mode,
             fa.hints_used  AS fa_hints,
             ag.n           AS n_attempts,
             ag.first_correct_no
      FROM inst i
      LEFT JOIN LATERAL (
        SELECT a.attempt_no, a.was_correct, a.answered_at, a.grading, a.mode, a.hints_used
        FROM att a
        WHERE a.question_instance_id = i.id AND a.attempt_no = 1
      ) fa ON true
      LEFT JOIN LATERAL (
        SELECT pg_catalog.count(*)::integer AS n,
               pg_catalog.min(a.attempt_no) FILTER (WHERE a.was_correct) AS first_correct_no
        FROM att a
        WHERE a.question_instance_id = i.id
      ) ag ON true
    ),
    calc AS (
      SELECT f.*,
             CASE WHEN f.fa_no IS NOT NULL THEN 'attempt'
                  WHEN f.n_attempts = 0 AND f.repeat_count = 0 AND f.answered THEN 'instance'
             END AS first_source,
             (f.answered OR f.n_attempts > 0 OR f.repeat_count > 0) AS was_answered,
             COALESCE(f.step, '') IN ('guided_practice', 'revision') AS practice_step,
             COALESCE(f.step, '') IN ('independent_application', 'transfer', 'revisit') AS assessment_step
      FROM facts f
    ),
    shaped AS (
      SELECT c.*,
             CASE c.first_source WHEN 'attempt' THEN c.fa_correct WHEN 'instance' THEN c.was_correct END AS first_correct,
             CASE c.first_source WHEN 'attempt' THEN c.fa_at WHEN 'instance' THEN c.answered_at END AS first_at,
             CASE WHEN c.first_source = 'attempt' THEN c.fa_mode END AS first_mode,
             CASE WHEN c.first_source = 'attempt' AND c.fa_mode IS NOT NULL AND c.fa_mode <> 'quiz_v1'
                  THEN c.fa_hints END AS first_hints,
             CASE WHEN c.fa_no IS NOT NULL THEN c.first_correct_no
                  WHEN c.first_source = 'instance' AND c.was_correct IS TRUE THEN 1
             END AS solved_at,
             CASE WHEN c.first_source = 'attempt' THEN c.fa_grading END AS first_grading
      FROM calc c
    ),
    steps AS (
      SELECT s.objective, s.created_at, s.id,
             pg_catalog.jsonb_build_object(
               'step', s.step,
               'status', CASE WHEN s.was_answered THEN 'answered' ELSE 'served' END,
               'correct', s.first_correct,
               'attempt_no', s.solved_at,
               'hints_used', s.first_hints,
               'mode', s.first_mode,
               'evidence', CASE
                 WHEN s.practice_step THEN 'practice'
                 WHEN NOT s.assessment_step THEN 'unknown'
                 WHEN NOT s.was_answered THEN 'not_shown'
                 WHEN s.first_correct IS NULL THEN 'unknown'
                 WHEN s.first_correct AND s.first_mode IN ('check', 'review', 'application') AND s.first_hints = 0
                   THEN 'shown_independently'
                 WHEN s.first_correct AND (s.first_mode IS NULL OR s.first_hints IS NULL) THEN 'unknown'
                 ELSE 'not_shown'
               END,
               'first_answer_at', s.first_at,
               'served_at', s.created_at,
               'grading', s.first_grading,
               'source', s.first_source,
               'sequence', pg_catalog.jsonb_build_object(
                 'answered', s.answered,
                 'was_correct', s.was_correct,
                 'answered_at', s.answered_at)
             ) AS step_json
      FROM shaped s
    )
    SELECT COALESCE(pg_catalog.jsonb_agg(o.obj ORDER BY o.objective), '[]'::jsonb)
    FROM (
      SELECT st.objective,
             pg_catalog.jsonb_build_object(
               'objective_id', st.objective,
               'started_at', pg_catalog.min(st.created_at),
               'steps', pg_catalog.jsonb_agg(st.step_json ORDER BY st.created_at, st.id)
             ) AS obj
      FROM steps st
      GROUP BY st.objective
    ) o
  $q$, v_src)
  INTO v_objectives
  USING p_student_id;

  RETURN pg_catalog.jsonb_build_object(
    'version', 1,
    'rules', c_rules,
    'sources', pg_catalog.jsonb_build_object(
      'attempt_log', v_attempts IS NOT NULL,
      'mode', v_has_mode,
      'hints', v_has_hints),
    'objectives', COALESCE(v_objectives, '[]'::jsonb));
END;
$$;

REVOKE ALL     ON FUNCTION public.get_course_progress(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_course_progress(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_course_progress(uuid) FROM service_role;
GRANT  EXECUTE ON FUNCTION public.get_course_progress(uuid) TO authenticated;
