-- Lærligverse: en kursusopgave flytter aldrig elevens almindelige niveau eller bånd — IKKE ANVENDT I PRODUKTION.
--
-- PROBLEM (fundet i F10-B, 2026-11-06): advance_student_level folder hvert førstesvar, hvis
-- learning_objective ikke er 'english'/'danish', ind i elevens HISTORIEniveau — også svar på et
-- Lærligverse-kursusmål (Arkivskabet/kildekritik). Et forløb med andre formål (vejledt øvelse, revision,
-- anvendelse, transfer) ville dermed flytte elevens almindelige historieniveau ved næste almindelige
-- quizkald (get-next-question/level-flow.ts kalder funktionen på hvert ikke-målrettet kald under
-- LEVEL_ENGINE=v1). advance_student_band har slet intet fagfilter og ville også folde dem ind i båndet.
--
-- KURSUSMARKØREN: et spørgsmål er en kursusopgave, når questions.metadata har nøglen 'learning_step'
-- (D-338: hvert trin i et serverstyret forløb bærer sit trin; _shared/learning-sequence.ts læser det).
-- Markøren ligger på spørgsmålet (forfattet indhold), aldrig i requesten, så klienten kan ikke vælge den.
-- Produktionen har 0 af 2763 spørgsmål med nøglen (læst read-only 2026-11-07), så intet eksisterende
-- spørgsmål skifter side. Ét spørgsmål har metadata NULL; derfor coalesce (ellers ville NULL ? ... gøre
-- prædikatet NULL og udelukke det).
--
-- HVAD MIGRATIONEN GØR: ét prædikat mere i de to fold-funktioner. Intet andet ændres: samme signatur,
-- returform, SECURITY DEFINER/INVOKER, volatilitet, search_path, ejer og rettigheder (CREATE OR REPLACE).
--   advance_student_level   niveaumotoren (LEVEL_ENGINE=v1)     et kursussvar foldes ikke
--   advance_student_band    bånd-motoren (format-mix-ruten)     et kursussvar foldes ikke
-- BEVIDST IKKE RØRT: lærerens visninger (get_teacher_visibility, get_student_overview,
-- get_concept_states). Om kursussvar skal tælle med i lærerens historie-% er en særskilt
-- produktbeslutning. XP/coins følger den almindelige belønningsvej (uændret). Gentagelser
-- (repeat_count > 0) foldes i forvejen ikke i niveauet.
--
-- AFHÆNGIGHED OG RÆKKEFØLGE: bygger på 20261105115000_true_false_mastery_exclusion.sql (#623). Kroppene
-- her er #623's kroppe plus prædikatet; vagten kræver #623's EFTER-md5 (eller denne migrations egen, så
-- en genkørsel accepteres). Anvendes EFTER 20261105115000 og FØR Arkivskabets spørgsmål seedes i
-- produktionen. Uden #623 stopper vagten, før noget ændres.
--
-- HISTORISKE DATA: produktionen har 0 kursusopgaver; student_level_fold_log er append-only, så intet
-- skal genberegnes.
--
-- TILBAGERULNING (særskilt ejerautorisation): anvend #623's to kroppe igen (vagtens "før"-md5).
--
-- Må KUN anvendes via apply_migration med særskilt ejerautorisation (D-110), aldrig via CLI-push.

DO $guard$
DECLARE
  r record;
  v text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.advance_student_level(uuid,text,smallint)', 'cf8ae40c07296fbe99e7b0834f6b017a', '8debeef51844d67bff5325cf1da61d41'),
    ('public.advance_student_band(uuid,smallint)', '509f3d885c40e1a1208926f61bf68bec', '511f0beeaf5bc8510523f15783e615ff')
  ) AS t(sig, before_md5, after_md5)
  LOOP
    SELECT md5(prosrc) INTO v FROM pg_proc WHERE oid = to_regprocedure(r.sig);
    IF v IS NULL THEN
      RAISE EXCEPTION 'course items fold exclusion: % findes ikke', r.sig;
    END IF;
    IF v <> r.before_md5 AND v <> r.after_md5 THEN
      RAISE EXCEPTION 'course items fold exclusion: % har en ureviewet krop (md5 %), stop — er #623 (20261105115000) anvendt?', r.sig, v;
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

DO $verify$
DECLARE
  r record;
  v text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.advance_student_level(uuid,text,smallint)', '8debeef51844d67bff5325cf1da61d41'),
    ('public.advance_student_band(uuid,smallint)', '511f0beeaf5bc8510523f15783e615ff')
  ) AS t(sig, after_md5)
  LOOP
    SELECT md5(prosrc) INTO v FROM pg_proc WHERE oid = to_regprocedure(r.sig);
    IF v IS DISTINCT FROM r.after_md5 THEN
      RAISE EXCEPTION 'course items fold exclusion: % fik md5 %, forventet %', r.sig, v, r.after_md5;
    END IF;
  END LOOP;
END
$verify$;
