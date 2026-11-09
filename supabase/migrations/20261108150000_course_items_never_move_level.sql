-- Lærligverse: en kursusopgave flytter aldrig elevens almindelige niveau, bånd eller lærerens
-- mestringstal — IKKE ANVENDT I PRODUKTION.
--
-- PROBLEM (fundet i F10-B, 2026-11-06): advance_student_level folder hvert førstesvar, hvis
-- learning_objective ikke er 'english'/'danish', ind i elevens HISTORIEniveau — også svar på et
-- Lærligverse-kursusmål (Arkivskabet/kildekritik). Et forløb med andre formål (vejledt øvelse, revision,
-- anvendelse, transfer) ville dermed flytte elevens almindelige historieniveau ved næste almindelige
-- quizkald (get-next-question/level-flow.ts kalder funktionen på hvert ikke-målrettet kald under
-- LEVEL_ENGINE=v1). advance_student_band har slet intet fagfilter. Lærerens klasseoversigt, elevoversigt
-- og koncepttilstande ville tælle kursussvar med i den almindelige mestringsprocent.
--
-- EJERBESLUTNING (F10-B2, 2026-11-07): almindelig faglig mestring adskilles fra kursusresultater;
-- Arkivskabets undervisningsopgaver må ikke forvride elevens almindelige mestringsprocent.
--
-- KURSUSMARKØREN: et spørgsmål er en kursusopgave, når questions.metadata har nøglen 'learning_step'
-- (D-338: hvert trin i et serverstyret forløb bærer sit trin; _shared/learning-sequence.ts læser det).
-- Markøren ligger på spørgsmålet (forfattet indhold), aldrig i requesten, så klienten kan ikke vælge den.
-- Produktionen har 0 af 2763 spørgsmål med nøglen (læst read-only 2026-11-07), så intet eksisterende
-- spørgsmål skifter side og intet tal, en lærer ser i dag, ændres. Ét spørgsmål har metadata NULL;
-- derfor coalesce (ellers ville NULL ? ... gøre prædikatet NULL og udelukke det).
--
-- HVAD MIGRATIONEN GØR: ét prædikat mere i hver af de fem funktioner, #623 allerede afgrænser for
-- sandt/falsk. Intet andet ændres: samme signatur, returform, SECURITY DEFINER/INVOKER, volatilitet,
-- search_path, ejer og rettigheder (CREATE OR REPLACE).
--   advance_student_level   niveaumotoren (LEVEL_ENGINE=v1)            et kursussvar foldes ikke
--   advance_student_band    bånd-motoren (format-mix-ruten)            et kursussvar foldes ikke
--   get_teacher_visibility  klasseoversigt: bånd, % rigtige, trend     kursussvar tælles ikke med
--   get_student_overview    elevoversigt: rigtig-procent, forsøg       kursussvar tælles ikke med (tæller OG nævner)
--   get_concept_states      koncepttilstande                           kursussvar tælles ikke med
-- BEVIDST IKKE RØRT (særskilt beslutning, se docs/laerligverse/laererstatistik-adskillelse.md):
--   belønningsvejen (process_question_attempt / _v2): XP, coins, streak og student_progress.
--   total_correct_answers ("Rigtige førstesvar i alt, alle opgavetyper", achievements) er uændrede;
--   domæneprocenten i student-detail.js (beregnes i browseren) og en kursusprogressionsvisning.
--
-- AFHÆNGIGHED OG RÆKKEFØLGE: bygger på 20261105115000_true_false_mastery_exclusion.sql (#623). Kroppene
-- her er #623's kroppe plus prædikatet; vagten kræver #623's EFTER-md5 (eller denne migrations egen, så
-- en genkørsel accepteres). Anvendes EFTER 20261105115000 og FØR Arkivskabets spørgsmål seedes i
-- produktionen. Uden #623 stopper vagten, før noget ændres.
--
-- HISTORISKE DATA: produktionen har 0 kursusopgaver; student_level_fold_log er append-only, så intet
-- skal genberegnes.
--
-- TILBAGERULNING (særskilt ejerautorisation): anvend #623's fem kroppe igen (vagtens "før"-md5); de
-- står byte for byte i 20261105115000_true_false_mastery_exclusion.sql.
--
-- Må KUN anvendes via apply_migration med særskilt ejerautorisation (D-110), aldrig via CLI-push.

DO $guard$
DECLARE
  r record;
  v text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.advance_student_level(uuid,text,smallint)', 'cf8ae40c07296fbe99e7b0834f6b017a', '8debeef51844d67bff5325cf1da61d41'),
    ('public.advance_student_band(uuid,smallint)', '509f3d885c40e1a1208926f61bf68bec', '511f0beeaf5bc8510523f15783e615ff'),
    ('public.get_teacher_visibility(uuid)', '550b0f6ba75b32b3a694cbea96f6b0d7', '3bb71927ec1d36810c05156d511e9301'),
    ('public.get_student_overview(uuid)', 'c181592350bbe46476b10809bdf7bb62', 'e0e123f6d64d198a4408fa901ade557b'),
    ('public.get_concept_states(uuid)', '612a3e225a4c3fc3f1591f9a14390a67', '7e12075dbbb34063494b1ccd4651a6b8')
  ) AS t(sig, before_md5, after_md5)
  LOOP
    SELECT md5(prosrc) INTO v FROM pg_proc WHERE oid = to_regprocedure(r.sig);
    IF v IS NULL THEN
      RAISE EXCEPTION 'course items exclusion: % findes ikke', r.sig;
    END IF;
    IF v <> r.before_md5 AND v <> r.after_md5 THEN
      RAISE EXCEPTION 'course items exclusion: % har en ureviewet krop (md5 %), stop — er #623 (20261105115000) anvendt?', r.sig, v;
    END IF;
  END LOOP;
END
$guard$;

CREATE OR REPLACE FUNCTION public.advance_student_level(p_student_id uuid, p_subject text, p_grade smallint)
 RETURNS TABLE(level integer, seed_level integer, seed_source text, answered integer, newly_folded integer)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      AND q.answer_format IS DISTINCT FROM 'true_false'  -- Sandt/falsk: comprehension check, never level evidence
      AND NOT (coalesce(q.metadata, '{}'::jsonb) ? 'learning_step')  -- Kursusopgave (D-338-trin): forløbstræning, aldrig niveauevidens
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
$function$;

CREATE OR REPLACE FUNCTION public.advance_student_band(p_student_id uuid, p_grade smallint)
 RETURNS TABLE(band smallint, seed smallint, seed_source text, folded integer, newly_folded integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      AND NOT EXISTS (                              -- Sandt/falsk: comprehension check, never band evidence
        SELECT 1 FROM public.questions q
        WHERE q.id = qi.question_id AND q.answer_format = 'true_false')
      AND NOT EXISTS (                              -- Kursusopgave (D-338-trin): forløbstræning, aldrig båndevidens
        SELECT 1 FROM public.questions q
        WHERE q.id = qi.question_id AND coalesce(q.metadata, '{}'::jsonb) ? 'learning_step')
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
$function$;

CREATE OR REPLACE FUNCTION public.get_teacher_visibility(p_teacher_id uuid)
 RETURNS TABLE(student_id uuid, display_name text, selected_grade smallint, placement_band smallint, current_band smallint, total_attempts integer, recent_correct_pct integer, trend text, active_domains text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
  v_role text;
BEGIN
  -- Not signed in: nothing, and no error that would confirm anything.
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  -- The role comes from the database, keyed on the verified JWT subject.
  SELECT p.role INTO v_role
  FROM public.profiles p
  WHERE p.id = v_uid;

  -- A missing profile is an unknown answer, and an unknown answer is not permission.
  IF v_role IS NULL OR v_role <> 'teacher' THEN
    RETURN;
  END IF;

  -- A teacher may ask only about themselves. Another id is answered exactly like "no pupils".
  IF p_teacher_id IS DISTINCT FROM v_uid THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH
  my_students AS (
    SELECT
      p.id,
      COALESCE(NULLIF(split_part(u.email, '@', 1), ''), 'Elev')::TEXT AS display_name,
      p.selected_grade,
      p.placement_band,
      p.active_domains
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.teacher_id = v_uid
      AND p.role = 'student'
  ),
  -- Scored answers only: a pending text answer or a closed, unanswered repeat has no result.
  ranked AS (
    SELECT
      qi.student_id       AS sid,
      qi.was_correct,
      COALESCE(qi.repeat_count, 0) = 0 AS first_attempt,
      q.difficulty_band,
      ROW_NUMBER() OVER (
        PARTITION BY qi.student_id
        ORDER BY COALESCE(qi.answered_at, qi.created_at) DESC
      ) AS rn
    FROM public.question_instances qi
    JOIN public.questions q ON q.id = qi.question_id
    WHERE qi.student_id IN (SELECT id FROM my_students)
      AND qi.answered = true
      AND qi.was_correct IS NOT NULL
      AND q.answer_format IS DISTINCT FROM 'true_false'  -- Sandt/falsk: never in band, % or trend
      AND NOT (coalesce(q.metadata, '{}'::jsonb) ? 'learning_step')  -- Kursusopgave: kursusprogression, aldrig almindelig mestring
  ),
  agg AS (
    SELECT
      r.sid,
      ROUND(AVG(r.difficulty_band) FILTER (WHERE r.rn <= 10))::SMALLINT AS current_band,
      COUNT(*) FILTER (WHERE r.first_attempt)::INTEGER AS first_attempts,
      CASE
        WHEN COUNT(*) FILTER (WHERE r.rn <= 20) = 0 THEN 0
        ELSE ROUND(
          100.0 * COUNT(*) FILTER (WHERE r.rn <= 20 AND r.was_correct = true) /
          NULLIF(COUNT(*) FILTER (WHERE r.rn <= 20), 0)
        )::INTEGER
      END AS recent_correct_pct,
      CASE
        WHEN COUNT(*) FILTER (WHERE r.rn <= 10) < 5 THEN 'stable'
        WHEN COUNT(*) FILTER (WHERE r.rn BETWEEN 11 AND 20) < 5 THEN 'stable'
        WHEN (AVG(r.was_correct::INT) FILTER (WHERE r.rn <= 10) -
              AVG(r.was_correct::INT) FILTER (WHERE r.rn BETWEEN 11 AND 20)) > 0.15 THEN 'improving'
        WHEN (AVG(r.was_correct::INT) FILTER (WHERE r.rn BETWEEN 11 AND 20) -
              AVG(r.was_correct::INT) FILTER (WHERE r.rn <= 10)) > 0.15 THEN 'struggling'
        ELSE 'stable'
      END AS trend
    FROM ranked r
    GROUP BY r.sid
  )
  SELECT
    ms.id,
    ms.display_name,
    ms.selected_grade,
    ms.placement_band,
    COALESCE(ag.current_band, 1::SMALLINT),
    COALESCE(ag.first_attempts, 0),
    COALESCE(ag.recent_correct_pct, 0),
    COALESCE(ag.trend, 'stable'),
    ms.active_domains
  FROM my_students ms
  LEFT JOIN agg ag ON ag.sid = ms.id
  ORDER BY ms.display_name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_student_overview(p_student_id uuid)
 RETURNS TABLE(email text, xp integer, level integer, correct_ratio numeric, total_correct_answers integer, total_attempts integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
  v_role text;
BEGIN
  -- Not signed in: nothing, and no error that would confirm anything.
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  -- The role comes from the database, keyed on the verified JWT subject.
  SELECT p.role INTO v_role
  FROM public.profiles p
  WHERE p.id = v_uid;

  -- A missing profile is an unknown answer, and an unknown answer is not permission.
  IF v_role IS NULL OR v_role NOT IN ('teacher', 'super_admin') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    u.email::text                           AS email,
    COALESCE(sp.xp, 0)                      AS xp,
    COALESCE(sp.level, 1)                   AS level,
    -- first-attempt answers only, with the zero-attempt guard
    CASE
      WHEN COALESCE(fa.attempts, 0) > 0
        THEN round(fa.correct::numeric / fa.attempts::numeric * 100::numeric, 1)
      ELSE 0::numeric
    END                                     AS correct_ratio,
    COALESCE(sp.total_correct_answers, 0)   AS total_correct_answers,
    COALESCE(fa.attempts, 0)                AS total_attempts
  FROM public.profiles s
    JOIN auth.users u
      ON u.id = s.id
    LEFT JOIN public.student_progress sp
      ON sp.student_id = s.id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::integer                              AS attempts,
        COUNT(*) FILTER (WHERE qi.was_correct)::integer AS correct
      FROM public.question_instances qi
      WHERE qi.student_id = s.id
        AND qi.answered = true
        AND qi.was_correct IS NOT NULL
        AND COALESCE(qi.repeat_count, 0) = 0
        AND NOT EXISTS (                            -- Sandt/falsk: shown apart, never in the mastery ratio
          SELECT 1 FROM public.questions q
          WHERE q.id = qi.question_id AND q.answer_format = 'true_false')
        AND NOT EXISTS (                            -- Kursusopgave: kursusprogression, aldrig i mestringsforholdet
          SELECT 1 FROM public.questions q
          WHERE q.id = qi.question_id AND coalesce(q.metadata, '{}'::jsonb) ? 'learning_step')
    ) fa ON true
  WHERE s.id = p_student_id
    AND s.role = 'student'
    AND (
      v_role = 'super_admin'
      OR s.teacher_id = v_uid
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_concept_states(p_student_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_result   JSONB;
  v_caller   UUID    := auth.uid();
  v_internal BOOLEAN := v_caller IS NULL AND session_user IN ('postgres', 'supabase_admin');
BEGIN
  IF p_student_id IS NULL THEN
    RAISE EXCEPTION 'invalid_student' USING ERRCODE = '22023';
  END IF;

  IF NOT v_internal THEN
    IF v_caller IS NULL THEN
      RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
    END IF;
    IF v_caller IS DISTINCT FROM p_student_id
       AND NOT EXISTS (
         SELECT 1 FROM public.profiles s
          WHERE s.id = p_student_id AND s.role = 'student' AND s.teacher_id = v_caller
            AND public.auth_profile_role() = 'teacher'
       )
       AND public.auth_profile_role() IS DISTINCT FROM 'super_admin'
    THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT jsonb_object_agg(concept, state) INTO v_result
  FROM (
    SELECT
      concept,
      CASE
        WHEN count(CASE WHEN qi.misconception_signal IS NOT NULL AND qi.was_correct = false THEN 1 END) >= 2
          THEN 'misconception_prone'
        WHEN count(CASE WHEN qi.was_correct = true  THEN 1 END) >= 3
         AND count(CASE WHEN qi.was_correct = false THEN 1 END) = 0
          THEN 'stable'
        WHEN count(CASE WHEN qi.was_correct = true  THEN 1 END) >= 1
         AND count(CASE WHEN qi.was_correct = false THEN 1 END) >= 1
          THEN 'uncertain'
        ELSE 'emerging'
      END AS state
    FROM public.question_instances qi
    JOIN public.questions q ON q.id = qi.question_id
    CROSS JOIN jsonb_array_elements_text(q.metadata -> 'concepts') AS concept
    WHERE qi.student_id   = p_student_id
      AND qi.answered     = true
      AND q.metadata      IS NOT NULL
      AND jsonb_typeof(q.metadata -> 'concepts') = 'array'
      AND q.answer_format IS DISTINCT FROM 'true_false'  -- Sandt/falsk: comprehension check, never concept evidence
      AND NOT (coalesce(q.metadata, '{}'::jsonb) ? 'learning_step')  -- Kursusopgave: kursusprogression, aldrig koncept-evidens
    GROUP BY concept
  ) concept_states;

  RETURN COALESCE(v_result, '{}'::JSONB);
END;
$function$;

DO $verify$
DECLARE
  r record;
  v text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.advance_student_level(uuid,text,smallint)', '8debeef51844d67bff5325cf1da61d41'),
    ('public.advance_student_band(uuid,smallint)', '511f0beeaf5bc8510523f15783e615ff'),
    ('public.get_teacher_visibility(uuid)', '3bb71927ec1d36810c05156d511e9301'),
    ('public.get_student_overview(uuid)', 'e0e123f6d64d198a4408fa901ade557b'),
    ('public.get_concept_states(uuid)', '7e12075dbbb34063494b1ccd4651a6b8')
  ) AS t(sig, after_md5)
  LOOP
    SELECT md5(prosrc) INTO v FROM pg_proc WHERE oid = to_regprocedure(r.sig);
    IF v IS DISTINCT FROM r.after_md5 THEN
      RAISE EXCEPTION 'course items exclusion: % fik md5 %, forventet %', r.sig, v, r.after_md5;
    END IF;
  END LOOP;
END
$verify$;
