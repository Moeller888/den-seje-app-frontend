-- ============================================================================
-- Anti-gætte-pause i quizzen (D-350, se docs/quiz-anti-guess-cooldown.md)
--
-- REGLEN (godkendt af produktejeren):
--   10 endeligt, automatisk bedømte FORKERTE quizsvar inden for et rullende vindue på 60 sekunder
--   giver 120 sekunders pause fra quizbesvarelser. Det tiende svar behandles normalt (bedømmes,
--   gemmes, betales efter de eksisterende regler) — pausen starter i samme transaktion, lige efter.
--   Rigtige svar nulstiller ikke tælleren. Fejl fra før en pause tæller aldrig mod en ny pause.
--
-- VINDUESDEFINITION (autoritativ, serverens tid):
--   Et forkert svar tæller, når dets tidsstempel t opfylder  t > now() - window  OG  t > counted_from.
--   now() er transaktionens starttid i PostgreSQL — det er det samme tidspunkt, svarfunktionerne skriver
--   i answered_at. Et svar præcis 60,000 s gammelt tæller IKKE (streng ulighed).
--
-- HVOR (og hvorfor her):
--   Alle bedømmende svarfunktioner — process_question_attempt, process_text_answer og H5's
--   process_question_attempt_v2 / process_text_answer_v2 — afslutter et svar med ÉN UPDATE af
--   public.question_instances, der sætter answered false → true og was_correct i samme sætning, i samme
--   transaktion som XP, mønter, streak og quests. To triggere på netop den overgang dækker derfor alle
--   svarveje (gammel vej, H5, et direkte kald med backend-nøglen) uden at ændre én eneste af de
--   md5-låste svarfunktioner (H5/D-280/G1/K1 hviler på deres kroppe):
--     * quiz_cooldown_guard     BEFORE UPDATE: under en aktiv pause afvises svaret med SQLSTATE LQ429
--                               ('quiz_cooldown_active'). Hele svarfunktionens transaktion rulles
--                               tilbage: intet gemmes, intet betales, ingen streak/quest/statistik.
--     * quiz_cooldown_register  AFTER UPDATE: et forkert svar registreres; ved tærsklen startes pausen.
--   Bedømmelsen er og bliver svarfunktionernes: triggerne læser kun deres resultat (was_correct).
--
-- HVAD TÆLLER IKKE:
--   * lange svar (questions.answer_type = 'long') og alt, en lærer bedømmer (reviewed_by/teacher_score),
--     også hvis en lærer senere sætter was_correct = false — ingen tilbagevirkende pause;
--   * svar uden endelig bedømmelse (was_correct IS NULL — fx tekst via process_question_attempt);
--   * lukning/frigivelse af runder (release_open_question_outside sætter ikke was_correct);
--   * gentagne kald for et allerede besvaret spørgsmål (svarfunktionernes CAS answered = false ændrer
--     ingen række → ingen trigger), H5-replays, afviste eller fejlede kald (rullet tilbage), og
--     forsøg under pausen (afvist i BEFORE-triggeren, før noget skrives).
--
-- SAMTIDIGHED:
--   Begge triggere låser elevens række i quiz_cooldown_state (SELECT … FOR UPDATE) — én lås pr. elev,
--   altid taget EFTER svarets egen rækkelås på question_instances, så rækkefølgen er den samme på alle
--   veje (ingen deadlock). To samtidige svar fra to faner serialiseres: det andet venter, læser den
--   committede tilstand og afvises, hvis det første startede en pause. idx_one_open_question tillader
--   desuden kun ét åbent spørgsmål pr. elev ad gangen.
--
-- DATA OG ADGANG:
--   quiz_cooldown_config  én række; den ENESTE kilde til 10 / 60 / 120.
--   quiz_cooldown_state   én række pr. elev: de seneste forkerte tidspunkter (højst tærsklen), pausens
--                         start/slut og counted_from. Ingen API-rolle kan skrive den; authenticated kan
--                         kun læse student_id og cooldown_until i SIN EGEN række (kolonne-grant + politik
--                         quiz_cooldown_state_read_own_end) — aldrig fejltidspunkter eller antal.
--   quiz_cooldown_events  log, der kun tilføjes til: én række pr. udløst pause (elev, start, slut,
--                         årsagskode, spørgsmålsinstans som korrelations-id). Intet svarindhold.
--   get_my_quiz_cooldown() den indloggede elevs EGEN pause: {active, ends_at, server_now}. Afslører
--                         hverken tærskel, vindue eller antal fejl. SECURITY INVOKER (læser via den
--                         ovenstående kolonne-grant og politik).
--   RLS er slået til på alle tre tabeller; config og events har ingen politikker, og anon/authenticated
--   har ingen rettigheder til dem eller til identity-sekvensen.
--   SECURITY DEFINER kun på triggerne, fordi de skal skrive i tabeller, ingen API-rolle må røre; tom
--   search_path og fuldt kvalificerede navne; ingen API-rolle har EXECUTE.
--
-- KØRSEL: ét DO-blok-forløb, atomisk også uden en omsluttende transaktion. Findes et af objekterne i
-- forvejen, stopper migrationen uden ændringer (anvendes præcis én gang). Kræver ingen andre ikke-anvendte
-- migrationer. Rollback: docs/quiz-anti-guess-cooldown.md §Rollback.
-- ============================================================================

DO $qc$
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- ── Forudsætninger ────────────────────────────────────────────────────────
  IF to_regclass('public.question_instances') IS NULL OR to_regclass('public.questions') IS NULL THEN
    RAISE EXCEPTION 'quiz-cooldown: question_instances/questions findes ikke; intet ændret';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_attribute
      WHERE attrelid = 'public.question_instances'::regclass AND NOT attisdropped
        AND attname IN ('student_id', 'question_id', 'answered', 'was_correct', 'reviewed_by', 'teacher_score')) <> 6
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
                    WHERE attrelid = 'public.questions'::regclass AND attname = 'answer_type' AND NOT attisdropped) THEN
    RAISE EXCEPTION 'quiz-cooldown: forventede kolonner mangler; intet ændret';
  END IF;
  IF to_regclass('public.quiz_cooldown_config') IS NOT NULL
     OR to_regclass('public.quiz_cooldown_state') IS NOT NULL
     OR to_regclass('public.quiz_cooldown_events') IS NOT NULL
     OR to_regprocedure('public.get_my_quiz_cooldown()') IS NOT NULL
     OR to_regprocedure('public.quiz_cooldown_guard()') IS NOT NULL
     OR to_regprocedure('public.quiz_cooldown_register()') IS NOT NULL THEN
    RAISE EXCEPTION 'quiz-cooldown: et eller flere objekter findes allerede (anvendes kun én gang); intet ændret';
  END IF;

  -- ── 1. Konfiguration: én række, én kilde ──────────────────────────────────
  EXECUTE $ddl$
    CREATE TABLE public.quiz_cooldown_config (
      id                      boolean PRIMARY KEY DEFAULT true CHECK (id),
      wrong_answer_threshold  integer NOT NULL CHECK (wrong_answer_threshold BETWEEN 1 AND 1000),
      window_seconds          integer NOT NULL CHECK (window_seconds BETWEEN 1 AND 86400),
      cooldown_seconds        integer NOT NULL CHECK (cooldown_seconds BETWEEN 1 AND 86400),
      updated_at              timestamptz NOT NULL DEFAULT now()
    )$ddl$;
  EXECUTE $ddl$
    INSERT INTO public.quiz_cooldown_config (id, wrong_answer_threshold, window_seconds, cooldown_seconds)
    VALUES (true, 10, 60, 120)$ddl$;

  -- ── 2. Tilstand pr. elev ──────────────────────────────────────────────────
  EXECUTE $ddl$
    CREATE TABLE public.quiz_cooldown_state (
      student_id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      recent_wrong_at      timestamptz[] NOT NULL DEFAULT '{}',
      counted_from         timestamptz,
      cooldown_started_at  timestamptz,
      cooldown_until       timestamptz,
      updated_at           timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT quiz_cooldown_state_period CHECK (
        (cooldown_started_at IS NULL) = (cooldown_until IS NULL)
        AND (cooldown_until IS NULL OR cooldown_until > cooldown_started_at))
    )$ddl$;

  -- ── 3. Log over udløste pauser (kun tilføjelse) ───────────────────────────
  EXECUTE $ddl$
    CREATE TABLE public.quiz_cooldown_events (
      id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      student_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      started_at            timestamptz NOT NULL,
      ends_at               timestamptz NOT NULL,
      reason_code           text NOT NULL CHECK (reason_code IN ('wrong_answer_burst')),
      question_instance_id  uuid,
      created_at            timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT quiz_cooldown_events_period CHECK (ends_at > started_at)
    )$ddl$;
  EXECUTE $ddl$CREATE INDEX quiz_cooldown_events_student_started ON public.quiz_cooldown_events (student_id, started_at)$ddl$;

  -- ── 4. Adgang: RLS uden politikker, ingen API-rettigheder ─────────────────
  EXECUTE $ddl$ALTER TABLE public.quiz_cooldown_config ENABLE ROW LEVEL SECURITY$ddl$;
  EXECUTE $ddl$ALTER TABLE public.quiz_cooldown_state  ENABLE ROW LEVEL SECURITY$ddl$;
  EXECUTE $ddl$ALTER TABLE public.quiz_cooldown_events ENABLE ROW LEVEL SECURITY$ddl$;
  EXECUTE $ddl$REVOKE ALL ON TABLE public.quiz_cooldown_config, public.quiz_cooldown_state, public.quiz_cooldown_events FROM PUBLIC, anon, authenticated$ddl$;
  -- The identity sequence gets the project's default sequence grants (anon, authenticated) — revoke them.
  EXECUTE $ddl$REVOKE ALL ON SEQUENCE public.quiz_cooldown_events_id_seq FROM PUBLIC, anon, authenticated$ddl$;
  -- The one thing a pupil may read: WHEN their own pause ends (never the wrong-answer times or count).
  -- Column privilege + own-row policy, so get_my_quiz_cooldown() can be SECURITY INVOKER.
  EXECUTE $ddl$GRANT SELECT (student_id, cooldown_until) ON public.quiz_cooldown_state TO authenticated$ddl$;
  EXECUTE $ddl$
    CREATE POLICY quiz_cooldown_state_read_own_end ON public.quiz_cooldown_state
    FOR SELECT TO authenticated
    USING (student_id = (SELECT auth.uid()))$ddl$;

  -- ── 5. Afvisning under pause (BEFORE) ─────────────────────────────────────
  EXECUTE $ddl$
CREATE FUNCTION public.quiz_cooldown_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_type  text;
  v_until timestamptz;
BEGIN
  -- Kun automatisk bedømte svar: lange svar og lærerbedømte svar spærres aldrig.
  SELECT q.answer_type INTO v_type FROM public.questions q WHERE q.id = NEW.question_id;
  IF v_type = 'long' OR NEW.reviewed_by IS NOT NULL OR NEW.teacher_score IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Én låsbar række pr. elev; låsen serialiserer elevens svar (se SAMTIDIGHED i headeren).
  INSERT INTO public.quiz_cooldown_state (student_id) VALUES (NEW.student_id)
  ON CONFLICT (student_id) DO NOTHING;
  SELECT s.cooldown_until INTO v_until
  FROM public.quiz_cooldown_state s
  WHERE s.student_id = NEW.student_id
  FOR UPDATE;

  IF v_until IS NOT NULL AND v_until > now() THEN
    RAISE EXCEPTION 'quiz_cooldown_active'
      USING ERRCODE = 'LQ429',
            DETAIL  = to_char(v_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  END IF;

  RETURN NEW;
END;
$fn$$ddl$;

  -- ── 6. Registrering og aktivering (AFTER) ─────────────────────────────────
  EXECUTE $ddl$
CREATE FUNCTION public.quiz_cooldown_register()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_type      text;
  v_cfg       public.quiz_cooldown_config%ROWTYPE;
  v_state     public.quiz_cooldown_state%ROWTYPE;
  v_floor     timestamptz;
  v_recent    timestamptz[];
  v_now       timestamptz := now();
BEGIN
  SELECT q.answer_type INTO v_type FROM public.questions q WHERE q.id = NEW.question_id;
  IF v_type = 'long' OR NEW.reviewed_by IS NOT NULL OR NEW.teacher_score IS NOT NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_cfg FROM public.quiz_cooldown_config WHERE id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'quiz_cooldown_config mangler';
  END IF;

  INSERT INTO public.quiz_cooldown_state (student_id) VALUES (NEW.student_id)
  ON CONFLICT (student_id) DO NOTHING;
  SELECT * INTO v_state FROM public.quiz_cooldown_state WHERE student_id = NEW.student_id FOR UPDATE;

  -- Rullende vindue: kun t > now() - window og t > counted_from (fejl fra før sidste pause tæller ikke).
  v_floor := greatest(v_now - make_interval(secs => v_cfg.window_seconds), coalesce(v_state.counted_from, '-infinity'::timestamptz));

  SELECT coalesce(array_agg(t ORDER BY t), '{}')
  INTO v_recent
  FROM (
    SELECT t FROM unnest(v_state.recent_wrong_at || v_now) AS u(t)
    WHERE t > v_floor
    ORDER BY t DESC
    LIMIT v_cfg.wrong_answer_threshold
  ) w;

  IF cardinality(v_recent) >= v_cfg.wrong_answer_threshold THEN
    UPDATE public.quiz_cooldown_state
    SET recent_wrong_at     = '{}',
        counted_from        = v_now,
        cooldown_started_at = v_now,
        cooldown_until      = v_now + make_interval(secs => v_cfg.cooldown_seconds),
        updated_at          = v_now
    WHERE student_id = NEW.student_id;

    INSERT INTO public.quiz_cooldown_events (student_id, started_at, ends_at, reason_code, question_instance_id)
    VALUES (NEW.student_id, v_now, v_now + make_interval(secs => v_cfg.cooldown_seconds), 'wrong_answer_burst', NEW.id);
  ELSE
    UPDATE public.quiz_cooldown_state
    SET recent_wrong_at = v_recent,
        updated_at      = v_now
    WHERE student_id = NEW.student_id;
  END IF;

  RETURN NULL;
END;
$fn$$ddl$;

  EXECUTE $ddl$
    CREATE TRIGGER quiz_cooldown_guard
    BEFORE UPDATE OF answered ON public.question_instances
    FOR EACH ROW
    WHEN (OLD.answered = false AND NEW.answered = true AND NEW.was_correct IS NOT NULL)
    EXECUTE FUNCTION public.quiz_cooldown_guard()$ddl$;
  EXECUTE $ddl$
    CREATE TRIGGER quiz_cooldown_register
    AFTER UPDATE OF answered ON public.question_instances
    FOR EACH ROW
    WHEN (OLD.answered = false AND NEW.answered = true AND NEW.was_correct = false)
    EXECUTE FUNCTION public.quiz_cooldown_register()$ddl$;

  -- ── 7. Elevens egen status (til genindlæsning og andre faner/enheder) ─────
  EXECUTE $ddl$
CREATE FUNCTION public.get_my_quiz_cooldown()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $fn$
  SELECT jsonb_build_object(
    'active',     coalesce(s.cooldown_until > now(), false),
    'ends_at',    CASE WHEN s.cooldown_until > now() THEN s.cooldown_until END,
    'server_now', now()
  )
  FROM (SELECT 1) one
  LEFT JOIN (SELECT st.student_id, st.cooldown_until FROM public.quiz_cooldown_state st) s
    ON s.student_id = (SELECT auth.uid());
$fn$$ddl$;

  EXECUTE $ddl$REVOKE ALL ON FUNCTION public.quiz_cooldown_guard()    FROM PUBLIC, anon, authenticated, service_role$ddl$;
  EXECUTE $ddl$REVOKE ALL ON FUNCTION public.quiz_cooldown_register() FROM PUBLIC, anon, authenticated, service_role$ddl$;
  EXECUTE $ddl$REVOKE ALL ON FUNCTION public.get_my_quiz_cooldown()   FROM PUBLIC, anon$ddl$;
  EXECUTE $ddl$GRANT EXECUTE ON FUNCTION public.get_my_quiz_cooldown() TO authenticated, service_role$ddl$;

  -- ── Slutkontrol ───────────────────────────────────────────────────────────
  IF (SELECT count(*) FROM pg_catalog.pg_trigger
      WHERE tgrelid = 'public.question_instances'::regclass
        AND tgname IN ('quiz_cooldown_guard', 'quiz_cooldown_register') AND tgenabled = 'O') <> 2
     OR has_function_privilege('authenticated', 'public.quiz_cooldown_register()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_my_quiz_cooldown()', 'EXECUTE')
     OR has_sequence_privilege('authenticated', 'public.quiz_cooldown_events_id_seq', 'USAGE,SELECT,UPDATE')
     OR has_column_privilege('authenticated', 'public.quiz_cooldown_state', 'recent_wrong_at', 'SELECT')
     OR has_table_privilege('authenticated', 'public.quiz_cooldown_state', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('anon', 'public.quiz_cooldown_events', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'quiz-cooldown: slutkontrol fejlede; intet ændret';
  END IF;
END
$qc$;
