-- Sandt/falsk er en træningsform: svaret giver XP og logges, men flytter aldrig elevens niveau (D-353).
--
-- EJERBESLUTNING 2026-11-05. Opgaveformer, hvor et gæt er rigtigt mindst halvdelen af gangene
-- (registry'ets gættegulv >= 0.5 i supabase/functions/_shared/interaction-kinds.ts, i dag kun
-- true_false), er træning og ikke dokumenteret mestring. Eleven får den normale XP, svaret registreres
-- som før (question_instances, H5's question_attempts), men svaret må hverken hæve eller sænke niveauet
-- og må ikke tælle med i de optællinger, der styrer niveauskift. Reglen gælder rigtige og forkerte svar.
-- Det er ikke en straf; det er en adskillelse mellem træning og mestringsevidens.
--
-- HVOR NIVEAUET FLYTTES. Kun to databasefunktioner folder et svar ind i en elevs niveau, og begge læser
-- svarene fra question_instances (skrevet af svarvejene) — aldrig fra en request:
--   advance_student_level   (20261029120000, LIVE: LEVEL_ENGINE=v1 for alle elever siden 2026-11-04)
--       +step ved rigtigt, −3·step ved forkert, step = max(15, round(150/sqrt(answered+1))).
--   advance_student_band    (20261019150000, kaldes kun med QUESTION_MIX_ENGINE=v2 — ikke live)
--       3 rigtige i træk → +1 bånd, 2 forkerte i træk → −1 bånd.
-- Alle svarveje — process_question_attempt (legacy), process_question_attempt_v2 (H5/K1), gentagne
-- forsøg og genindsendelser — ender som en verdict i question_instances; ingen af dem rører niveauet
-- direkte. Et filter i de to folder dækker derfor hver vej.
--
-- HVAD DENNE FIL ÆNDRER
--   1. NY: public.answer_format_moves_level(answer_format) → boolean. Den eneste SQL-liste over
--      træningsformater (i dag kun 'true_false'). NULL og alle andre formater (mc, number, text, match)
--      → true = uændret adfærd. tests/unit/true-false-practice-only-level-migration-run.test.mjs holder
--      listen lig med registry'ets formater med gættegulv >= 0.5, så de to ikke kan glide fra hinanden.
--   2. advance_student_level: ÉN ny linje i foldens WHERE (formatet læses fra public.questions via
--      instansens question_id, som serveren har sat). Et træningssvar vælges aldrig: ingen fold-log-række,
--      `answered` tælles ikke op (så step-størrelsen er urørt), niveauet er uændret.
--   3. advance_student_band: samme filter som NOT EXISTS, så et svar uden spørgsmålsrække foldes
--      præcis som før. Cursoren peger aldrig på et træningssvar.
-- Resten af begge kroppe er byte-identisk med produktionens (md5 af prosrc verificeret read-only
-- 2026-11-05: advance_student_level 4147c559353946a64c3ea1c791d19635, advance_student_band
-- 0c6856ac2ae63eb2cd7ba3ce5d21ceb0). Vagten nedenfor stopper filen, hvis produktionen har en anden krop.
-- Signaturer, SECURITY-type, search_path, ejer og EXECUTE-rettigheder er uændrede (CREATE OR REPLACE
-- bevarer ACL; den gentages alligevel eksplicit).
--
-- SIKKERHED. Klassificeringen bygger kun på betroet serverdata: questions.answer_format (elever kan ikke
-- skrive questions) for det question_id, get-next-question har indsat (question_instances er serverejet
-- siden 2026-10-16). Ingen af funktionerne tager et format som argument, så et format i en request kan
-- ikke påvirke niveauet. XP, mønter og værnene mod dobbelt udbetaling ligger i svarfunktionerne og er
-- ikke rørt.
--
-- KENDT GRÆNSE. Formatet læses ved foldetid. Ændrer en administrator senere et spørgsmåls answer_format
-- fra true_false til et niveauformat, foldes de endnu ikke foldede svar på det spørgsmål ved næste fold.
-- Spørgsmålsformater ændres ikke i dag; et skift kræver også nyt indhold (content-constraints).
--
-- RÆKKEFØLGE. Skal anvendes FØR sandt/falsk-opgaver aktiveres (20261105120000 + is_active). I dag findes
-- ingen true_false-rækker, så filen ændrer intet målbart, når den anvendes: alle nuværende svar foldes
-- præcis som før. Den afhænger ikke af 20261105120000 og kan anvendes før eller efter den.
--
-- IKKE ANVENDT I PRODUKTION. Står i tests/isolated/schema/replay-plan.mjs NOT_IN_PRODUCTION, indtil den er
-- anvendt (særskilt ejer-GO, D-110: apply_migration, aldrig db push) og verificeret.
-- Tilbagerulning: genskab de to funktioner fra 20261029120000 og 20261019150000 (CREATE OR REPLACE med
-- de oprindelige kroppe) og DROP FUNCTION public.answer_format_moves_level(text).

-- ── 0. Vagt: kun oven på de reviewede produktionskroppe ─────────────────────
DO $tfl_guard$
DECLARE
  v_level text;
  v_band  text;
BEGIN
  SELECT md5(p.prosrc) INTO v_level FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.advance_student_level(uuid,text,smallint)');
  SELECT md5(p.prosrc) INTO v_band FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.advance_student_band(uuid,smallint)');
  IF v_level IS DISTINCT FROM '4147c559353946a64c3ea1c791d19635' THEN
    RAISE EXCEPTION 'D-353: advance_student_level has an unreviewed body (md5 %); stop', coalesce(v_level, 'missing');
  END IF;
  IF v_band IS DISTINCT FROM '0c6856ac2ae63eb2cd7ba3ce5d21ceb0' THEN
    RAISE EXCEPTION 'D-353: advance_student_band has an unreviewed body (md5 %); stop', coalesce(v_band, 'missing');
  END IF;
END
$tfl_guard$;

-- ── 1. Træningsformater: den ene SQL-liste ──────────────────────────────────
CREATE FUNCTION public.answer_format_moves_level(p_answer_format text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT p_answer_format IS NULL OR p_answer_format <> ALL (ARRAY['true_false']::text[])
$$;

COMMENT ON FUNCTION public.answer_format_moves_level(text) IS
  'false for training formats (guess rate >= 0.5: true_false) — their answers give XP and are logged but '
  'never move a pupil''s level or band; true for every other format and NULL. Read by advance_student_level '
  'and advance_student_band. See 20261105173000 (D-353).';

REVOKE ALL ON FUNCTION public.answer_format_moves_level(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.answer_format_moves_level(text) TO service_role;

-- ── 2. advance_student_level: træningssvar foldes ikke ──────────────────────
CREATE OR REPLACE FUNCTION public.advance_student_level(
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
      AND public.answer_format_moves_level(q.answer_format)   -- D-353: training formats never fold
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
  'pupil''s level 1-10000: +max(15, round(150/sqrt(n+1))) if correct, −3× if not. Training formats '
  '(answer_format_moves_level = false: true_false) are never folded or counted (D-353). Seed per §4.2, fixed '
  'at creation. service_role only, SECURITY INVOKER. See 20261029120000, 20261105173000.';

REVOKE ALL ON FUNCTION public.advance_student_level(uuid, text, smallint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_student_level(uuid, text, smallint) TO service_role;

-- ── 3. advance_student_band: samme regel på formatmix-vejen ─────────────────
CREATE OR REPLACE FUNCTION public.advance_student_band(
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
      AND NOT EXISTS (                              -- D-353: training formats never fold
        SELECT 1 FROM public.questions q
        WHERE q.id = qi.question_id AND NOT public.answer_format_moves_level(q.answer_format)
      )
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
  'difficulty band: 3 correct → +1, 2 incorrect → −1, 1..5. Training formats (answer_format_moves_level = '
  'false: true_false) are never folded (D-353). Seed: completed placement, else grade start band, else 2. '
  'service_role only. See 20261019150000, 20261105173000.';

REVOKE ALL ON FUNCTION public.advance_student_band(uuid, smallint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_student_band(uuid, smallint) TO service_role;
