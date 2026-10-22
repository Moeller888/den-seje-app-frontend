-- Placement keeps Danish out, as it already keeps English out.
--
-- WHY. The placement assessment measures the pupil's HISTORY level (its band seeds the history quiz).
-- start_placement() selects every active MC question within the grade except learning_objective
-- 'english'. The new Danish questions (20261019120001_danish_grade3_5, learning_objective 'danish')
-- would otherwise be drawn into placement for any pupil in grade 3 or above.
--
-- WHAT CHANGES. start_placement() is redefined with ONE line different from its definition in
-- 20261016160000_answer_keys_server_side_rpcs:
--     AND q.learning_objective <> 'english'
--   → AND q.learning_objective NOT IN ('english', 'danish')
-- Both exclude a NULL learning_objective, as before. Signature, SECURITY DEFINER, search_path,
-- errors, return shape, session reuse and grants are unchanged (the grants are restated below).
-- tests/unit/placement-excludes-danish-migration-run.test.mjs proves the one-line difference.
--
-- ORDER. Apply this BEFORE 20261019120001_danish_grade3_5.
-- Before applying, diff the LIVE start_placement() (pg_get_functiondef) against the 20261016160000
-- body: if live differs, stop — this file must then be rebuilt from the live body.
-- Må KUN anvendes via apply_migration med særskilt ejer-autorisation (D-110).

CREATE OR REPLACE FUNCTION public.start_placement()
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
        AND q.learning_objective NOT IN ('english', 'danish')  -- placement measures history level only
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
