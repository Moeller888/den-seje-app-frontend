-- D-384 (F8): en åben KURSUSrunde parkeres, så den almindelige platform aldrig blokeres af et kursus.
--
-- RODÅRSAG. idx_one_open_question er UNIQUE (student_id) WHERE answered = false: højst én ubesvaret runde pr. elev.
-- D-383 (20261120150000) frigiver ikke længere en aktiv kursusrunde ved fagskift (den skal ikke tabes), og
-- get-next-question serverer den kun inde i den serverstyrede sekvens. En elev, der forlader et kursus midt i en
-- opgave, får derfor "course_round_open" i ALLE andre fag — permanent, hvis Lærligverset er slået fra. At lukke
-- runden som besvaret er udelukket: sekvensen (learning-sequence.ts nextStep) tæller answered = true som gennemført
-- og ville rykke eleven frem uden svar. At slette den er udelukket: den kan bære hints, præsentation og snapshot.
--
-- MODEL (samme række; samme id, svar, hints, præsentationsdata og K1-snapshot — intet nyt tilstandssystem):
--   aktiv åben     answered = false AND parked_at IS NULL       højst én pr. elev   (idx_one_open_question, nu "aktiv")
--   parkeret åben  answered = false AND parked_at IS NOT NULL   højst én pr. elev OG læringsmål
--                                                                (idx_one_parked_course_round)
--   besvaret       answered = true  AND parked_at IS NULL       (CHECK: en parkeret runde kan ikke besvares)
-- Kursusidentiteten er læringsmålet (questions.learning_objective): det er den identitet, sekvensen allerede
-- udleder trinnet fra (get-next-question læser historikken pr. mål). Et unikt indeks kan ikke slå op i questions,
-- så målet gemmes i den serverejede kolonne parked_objective, som KUN park-funktionen sætter. Antallet af
-- parkerede runder er dermed begrænset af antallet af kursusmål — aldrig ubegrænset.
--
-- FREMADKOMPATIBILITET (afgørende for tilbageførsel): parkering sætter next_review_at = 'infinity'. Alle versioner af
-- get-next-question læser forfaldne runder med next_review_at <= now(), så ENHVER Edge Function — også dem fra før
-- denne migration (#739-kandidaten, produktionens a7450b0f) — ser aldrig en parkeret runde i forfaldsløkken, og det
-- delvise idx_one_open_question lader dem indsætte en ny almindelig opgave. Genoptagelse sætter next_review_at =
-- rundens created_at (forfalden efter ethvert ur; se resume-funktionen). Se docs/decisions/D-384.md "Tilbageførsel".
--
-- ÆNDRINGER:
--   1. kolonnerne parked_at og parked_objective + to CHECK-begrænsninger;
--   2. idx_one_open_question genopbygges som "én AKTIV åben" + idx_one_parked_course_round;
--   3. triggeren question_instances_parked_guard: et svar på en parkeret runde afvises med SQLSTATE LQ409
--      'course_round_parked' (CHECK'en er den hårde bund; triggeren giver svarvejene en genkendelig fejl);
--   4. park_open_course_round(uuid) og resume_parked_course_round(uuid, text, text): SECURITY DEFINER, kun
--      service_role (get-next-question);
--   5. de tre gentagelsesfunktioner: vagten "ingen ubesvaret runde" tæller ikke en parkeret runde (ellers ville en
--      parkeret kursusrunde spærre gentagelser i alle fag);
--   6. release_open_question_outside: en INAKTIV parkeret runde frigives som før (D-316) og mister parkeringen i
--      samme sætning; en aktiv parkeret kursusrunde røres aldrig (D-383's regel, uændret);
--   7. adgang: anon/authenticated får aldrig UPDATE på de tre nye kolonner (L5-mønstret fra 20261108043500, se 7);
--   8. activation_no (serverens generationsnummer for rundens AKTIVERING): resume_parked_course_round tæller det op.
--      Samme runde (samme id, samme round_no) kan nemlig vises i en fane FØR parkeringen og i en anden EFTER
--      genoptagelsen; round_no (H5) og submission_id skelner ikke de to. get-next-question udleverer nummeret med
--      LAERLIGVERSE_COURSE_PARKING=on, browseren sender det med svaret, og process-event afviser et svar fra en
--      tidligere aktivering (409 stale_activation) FØR nogen svarfunktion kaldes. En runde, der aldrig er genoptaget,
--      har 0, og så accepteres et svar uden nummer (alle eksisterende klienter og svarveje er uændrede).
-- Kroppene i 5 og 6 er D-383's, ordret, med kun de markerede linjer tilføjet. Signaturer, SECURITY, search_path,
-- grants og kommentarer er uændrede. Ingen eksisterende data ændres (ingen række er parkeret før denne fil).
--
-- IKKE anvendt i produktion. Må KUN anvendes via apply_migration med særskilt ejer-autorisation (D-110,
-- docs/migration-workflow-policy.md). Kræver D-383 (20261120150000). RÆKKEFØLGE: denne migration FØR
-- get-next-question med LAERLIGVERSE_COURSE_PARKING=on (uden flaget kalder funktionen ingen af de nye RPC'er).
--
-- TILBAGEFØRSEL (kun hvis INGEN række er parkeret — kontrollér først:
--   SELECT count(*) FROM public.question_instances WHERE parked_at IS NOT NULL;  -- skal være 0;
--   er den ikke 0: roll-forward, se D-384.md):
--   DROP FUNCTION public.park_open_course_round(uuid);
--   DROP FUNCTION public.resume_parked_course_round(uuid, text, text);
--   DROP TRIGGER question_instances_parked_guard ON public.question_instances;
--   DROP FUNCTION public.question_instances_parked_guard();
--   DROP INDEX public.idx_one_parked_course_round;
--   DROP INDEX public.idx_one_open_question;
--   CREATE UNIQUE INDEX idx_one_open_question ON public.question_instances (student_id) WHERE answered = false;
--   ALTER TABLE public.question_instances DROP COLUMN parked_objective, DROP COLUMN parked_at,
--     DROP COLUMN activation_no;  -- tager CHECK'ene med
--   og de fire funktioner fra 20261120150000 (deres kroppe, ordret).
--   Kolonne-UPDATE (7) behøver ingen tilbageførsel: de tre kolonner forsvinder med DROP COLUMN.
--   (activation_no > 0 betyder kun, at runden har været genoptaget; at droppe den mister ingen elevdata, men en Edge
--   Function med LAERLIGVERSE_COURSE_PARKING=on kræver kolonnen: slå flaget fra FØR tilbageførslen.)

SET lock_timeout = '5s';

-- ── 0. Vagt: præcis D-383's kroppe (eller denne fils egne, så en ny kørsel er tilladt) ─────────────
DO $parking_guard$
DECLARE
  expected CONSTANT jsonb := '{
    "public.request_repeat_question_for_student(uuid,smallint,text[])": ["c14b90ccd4d05e12473083b072eaefba", "f21252b7f5ba341697613beb3ad2302f"],
    "public.request_repeat_question_servable_for_student(uuid,smallint,text[])": ["b23d72a1d167a94246e5b7243c25cdbd", "e69545d93975d3da5b5de0c29e9b522a"],
    "public.request_repeat_level_question_for_student(uuid,text[])": ["410d0ab6fb67c329a573cf3f73973921", "881b68b8cc997205d83dc5532e152bf9"],
    "public.release_open_question_outside(text[])": ["e52e69fa3374a5838293977f0057b34d", "72f2a0f3579b2ce758031ce7f47724e3"]
  }';
  f text;
BEGIN
  FOR f IN SELECT key FROM jsonb_each(expected) LOOP
    IF NOT coalesce((expected -> f) ? (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(f)), false) THEN
      RAISE EXCEPTION 'COURSE_PARKING: % er ændret siden gennemgangen; kræver ny gennemgang', f;
    END IF;
  END LOOP;
  IF to_regprocedure('public.question_is_course_item(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'COURSE_PARKING: D-383 (question_is_course_item) mangler';
  END IF;
  -- Indekset skal være det kendte: enten produktionens (answered = false) eller denne fils (en ny kørsel).
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_one_open_question'
                 AND indexdef IN ('CREATE UNIQUE INDEX idx_one_open_question ON public.question_instances USING btree (student_id) WHERE (answered = false)',
                                  'CREATE UNIQUE INDEX idx_one_open_question ON public.question_instances USING btree (student_id) WHERE ((answered = false) AND (parked_at IS NULL))')) THEN
    RAISE EXCEPTION 'COURSE_PARKING: idx_one_open_question er ikke den kendte definition';
  END IF;
END
$parking_guard$;

-- ── 1. Kolonner og begrænsninger ─────────────────────────────────────────────────────────────────
ALTER TABLE public.question_instances ADD COLUMN IF NOT EXISTS parked_at timestamptz;
ALTER TABLE public.question_instances ADD COLUMN IF NOT EXISTS parked_objective text;
ALTER TABLE public.question_instances DROP CONSTRAINT IF EXISTS question_instances_parked_consistent;
ALTER TABLE public.question_instances ADD CONSTRAINT question_instances_parked_consistent
  CHECK ((parked_at IS NULL) = (parked_objective IS NULL));
ALTER TABLE public.question_instances DROP CONSTRAINT IF EXISTS question_instances_parked_is_open;
ALTER TABLE public.question_instances ADD CONSTRAINT question_instances_parked_is_open
  CHECK (parked_at IS NULL OR answered = false);
COMMENT ON COLUMN public.question_instances.parked_at IS
  'D-384: set while an open COURSE round is parked (the pupil left the course); NULL otherwise. Server-owned: only park_open_course_round / resume_parked_course_round / release_open_question_outside write it.';
COMMENT ON COLUMN public.question_instances.parked_objective IS
  'D-384: the learning objective (course) a parked round belongs to, copied from the question at parking time; NULL when not parked. Server-owned.';
-- ADD COLUMN … NOT NULL DEFAULT 0 er en ren katalogændring (PostgreSQL ≥ 11): ingen omskrivning af tabellen.
ALTER TABLE public.question_instances ADD COLUMN IF NOT EXISTS activation_no integer NOT NULL DEFAULT 0;
ALTER TABLE public.question_instances DROP CONSTRAINT IF EXISTS question_instances_activation_no_nonnegative;
ALTER TABLE public.question_instances ADD CONSTRAINT question_instances_activation_no_nonnegative
  CHECK (activation_no >= 0);
COMMENT ON COLUMN public.question_instances.activation_no IS
  'D-384: how many times this round was resumed after parking (0 = never). get-next-question hands it out with the round; process-event refuses an answer carrying an older number (409 stale_activation). Server-owned: only resume_parked_course_round writes it.';

-- ── 2. Én AKTIV åben opgave pr. elev; højst én parkeret pr. elev og kursusmål ─────────────────────
DROP INDEX public.idx_one_open_question;
CREATE UNIQUE INDEX idx_one_open_question ON public.question_instances (student_id)
  WHERE answered = false AND parked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_parked_course_round ON public.question_instances (student_id, parked_objective)
  WHERE parked_at IS NOT NULL;

-- ── 3. Et svar på en parkeret runde afvises, uanset svarvej ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.question_instances_parked_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.answered IS TRUE AND NEW.parked_at IS NOT NULL THEN
    RAISE EXCEPTION 'course_round_parked'
      USING ERRCODE = 'LQ409',
            DETAIL = 'The course round is parked; it is resumed inside its course. Nothing was recorded.';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.question_instances_parked_guard() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS question_instances_parked_guard ON public.question_instances;
CREATE TRIGGER question_instances_parked_guard
  BEFORE UPDATE OF answered ON public.question_instances
  FOR EACH ROW EXECUTE FUNCTION public.question_instances_parked_guard();

-- ── 4. Parkering og genoptagelse (kun get-next-question, service_role) ──────────────────────────
-- Begge tager elevens transaktionslås (pg_advisory_xact_lock på elevens id), så to faner, en dobbeltklik eller et
-- forsinket gentaget kald for SAMME elev aldrig parkerer og genoptager samtidigt. Et svar tager ikke låsen: det
-- serialiseres på rækkelåsen, og triggeren i 3 afviser et svar, der når en parkeret runde.

-- Parkér elevens AKTIVE åbne runde, hvis den er en aktiv kursusopgave med et læringsmål. Returnerer rundens id,
-- eller NULL (ingen aktiv åben runde, eller den er ikke en kursusopgave: intet ændres).
-- 23505 (idx_one_parked_course_round): en anden runde i samme kursus er allerede parkeret — intet ændres; kalderen
-- falder tilbage til D-383's svar (course_round_open).
CREATE OR REPLACE FUNCTION public.park_open_course_round(p_student_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF p_student_id IS NULL THEN
    RAISE EXCEPTION 'park_open_course_round: student_id mangler' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('d384:' || p_student_id::text, 0));
  UPDATE public.question_instances qi
  SET    parked_at        = now(),
         parked_objective = q.learning_objective,
         next_review_at   = 'infinity'
  FROM   public.questions q
  WHERE  qi.question_id = q.id
    AND  qi.student_id  = p_student_id
    AND  qi.answered    = false
    AND  qi.parked_at  IS NULL
    AND  q.is_active    = true
    AND  q.learning_objective IS NOT NULL
    AND  public.question_is_course_item(q.metadata)
  RETURNING qi.id INTO v_id;
  RETURN v_id;
END;
$function$;

-- Skift til kurset p_objective i serverens trin p_step (D-338): først parkeres en AKTIV kursusrunde fra et ANDET
-- kursus (eleven skiftede kursus), derefter genoptages den parkerede runde i dette kursus.
--   'resumed'       den parkerede runde er aktiv igen (samme id; next_review_at = rundens created_at, så den serveres som forfalden uanset urforskydning)
--   'none'          intet parkeret i dette kursus
--   'other_active'  en anden runde er aktiv (fx en almindelig opgave): den parkerede bliver parkeret, intet tabes
--   'wrong_step'    den parkerede runde hører til et andet trin end serverens (indholdet er flyttet): den bliver
--                   parkeret; get-next-question svarer som for en aktiv runde i forkert trin (409)
--   'inactive'      spørgsmålet er deaktiveret: runden bliver parkeret og frigives af release_open_question_outside
CREATE OR REPLACE FUNCTION public.resume_parked_course_round(p_student_id uuid, p_objective text, p_step text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_parked record;
BEGIN
  IF p_student_id IS NULL OR p_objective IS NULL OR p_step IS NULL THEN
    RAISE EXCEPTION 'resume_parked_course_round: argument mangler' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('d384:' || p_student_id::text, 0));

  -- Kursusskift: en aktiv kursusrunde fra et andet kursus parkeres (samme regel som park_open_course_round). Er en
  -- runde i DET kursus allerede parkeret (23505), bliver den aktive stående: så svarer funktionen other_active nedenfor.
  BEGIN
  UPDATE public.question_instances qi
  SET    parked_at        = now(),
         parked_objective = q.learning_objective,
         next_review_at   = 'infinity'
  FROM   public.questions q
  WHERE  qi.question_id = q.id
    AND  qi.student_id  = p_student_id
    AND  qi.answered    = false
    AND  qi.parked_at  IS NULL
    AND  q.is_active    = true
    AND  q.learning_objective IS NOT NULL
    AND  q.learning_objective IS DISTINCT FROM p_objective
    AND  public.question_is_course_item(q.metadata);
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  SELECT qi.id, q.is_active, q.metadata ->> 'learning_step' AS step
  INTO   v_parked
  FROM   public.question_instances qi JOIN public.questions q ON q.id = qi.question_id
  WHERE  qi.student_id = p_student_id AND qi.parked_at IS NOT NULL AND qi.parked_objective = p_objective
  FOR UPDATE OF qi;
  IF NOT FOUND THEN RETURN 'none'; END IF;
  IF v_parked.is_active IS NOT TRUE THEN RETURN 'inactive'; END IF;
  IF v_parked.step IS DISTINCT FROM p_step THEN RETURN 'wrong_step'; END IF;
  IF EXISTS (SELECT 1 FROM public.question_instances
             WHERE student_id = p_student_id AND answered = false AND parked_at IS NULL) THEN
    RETURN 'other_active';
  END IF;
  BEGIN
    UPDATE public.question_instances
    -- next_review_at: rundens OPRETTELSE, ikke now(). get-next-question læser forfaldne runder med
    -- next_review_at <= Edge-urets tid (millisekunder); databasens now() (mikrosekunder, et andet ur) kan ligge EFTER
    -- den, og så var den genoptagne runde ikke forfalden: funktionen forsøgte en ny runde og svarede 409
    -- open_question_exists (fundet på ægte PostgreSQL 17, D-384 stale-tab-testen). created_at ligger altid før både
    -- parkeringen og genoptagelsen, uanset urforskydning; LEAST(…, now()) er værnet, hvis den skulle mangle.
    SET    parked_at = NULL, parked_objective = NULL, next_review_at = LEAST(created_at, now()),
           activation_no = activation_no + 1  -- en ny AKTIVERING af samme runde: en ældre fanes svar er forældet
    WHERE  id = v_parked.id;
  EXCEPTION WHEN unique_violation THEN
    -- A new active round was inserted concurrently (get-next-question does not take the pupil lock): it wins.
    RETURN 'other_active';
  END;
  RETURN 'resumed';
END;
$function$;

REVOKE ALL ON FUNCTION public.park_open_course_round(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resume_parked_course_round(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.park_open_course_round(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resume_parked_course_round(uuid, text, text) TO service_role;
COMMENT ON FUNCTION public.park_open_course_round(uuid) IS
  'D-384: parks the pupil''s active open course round (same row, nothing answered) so the ordinary quiz can continue. Backend only.';
COMMENT ON FUNCTION public.resume_parked_course_round(uuid, text, text) IS
  'D-384: inside the server sequence, parks an active course round of another course and resumes the parked round of this course in the server''s step. Backend only.';

-- ── 5. Gentagelser: en parkeret kursusrunde spærrer ikke (D-383's kroppe + én linje i vagten) ──────
CREATE OR REPLACE FUNCTION public.request_repeat_question_for_student(
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
      AND qi.parked_at IS NULL              -- D-384: a parked course round does not block repeats
  ) THEN
    RETURN NULL;
  END IF;

  -- Repeats are a last resort, verified against the server-derived scope. D-383: course items are not
  -- the ordinary quiz's pool, so an unserved one does not block repeats.
  IF EXISTS (
    SELECT 1
    FROM public.questions q
    WHERE q.is_active
      AND (p_grade IS NULL OR q.target_grade IS NULL OR q.target_grade <= p_grade)
      AND (p_domains IS NULL OR q.learning_objective = ANY(p_domains))
      AND NOT public.question_is_course_item(q.metadata)
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
    AND NOT public.question_is_course_item(q.metadata)   -- D-383: never reopen a course round
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

  -- MC: the key follows the question's current content.correct, exactly as a new instance from
  -- get-next-question gets it, so a corrected text is never graded against an old key. A separate
  -- statement on purpose: under READ COMMITTED it takes its own snapshot AFTER the reopen above,
  -- which waits for any concurrent writer holding question_instances — so a question correction
  -- committed meanwhile is seen. Other formats keep their key (a Match par key is per instance).
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

CREATE OR REPLACE FUNCTION public.request_repeat_question_servable_for_student(
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
      AND qi.parked_at IS NULL              -- D-384: a parked course round does not block repeats
  ) THEN
    RETURN NULL;
  END IF;

  -- Repeats are a last resort, verified against the server-derived scope: no SERVABLE unserved
  -- question may remain (the same rule the candidate window uses). D-383: course items do not count.
  IF EXISTS (
    SELECT 1
    FROM public.questions q
    WHERE q.is_active
      AND (p_grade IS NULL OR q.target_grade IS NULL OR q.target_grade <= p_grade)
      AND (p_domains IS NULL OR q.learning_objective = ANY(p_domains))
      AND public.question_is_servable(q.answer_format, q.answer_type, q.content)
      AND NOT public.question_is_course_item(q.metadata)
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
    AND NOT public.question_is_course_item(q.metadata)   -- D-383: never reopen a course round
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

  -- MC: the key follows the question's current content.correct, exactly as a new instance from
  -- get-next-question gets it, so a corrected text is never graded against an old key. A separate
  -- statement on purpose: under READ COMMITTED it takes its own snapshot AFTER the reopen above,
  -- which waits for any concurrent writer holding question_instances — so a question correction
  -- committed meanwhile is seen. Other formats keep their key (a Match par key is per instance).
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

CREATE OR REPLACE FUNCTION public.request_repeat_level_question_for_student(
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
      AND qi.parked_at IS NULL              -- D-384: a parked course round does not block repeats
  ) THEN
    RETURN NULL;
  END IF;

  -- Repeats are a last resort: no question the level engine could still serve may remain (D-383: the level
  -- engine never serves a course item, so an unserved one does not count).
  IF EXISTS (
    SELECT 1
    FROM public.questions q
    WHERE q.is_active
      AND q.difficulty_level IS NOT NULL
      AND q.learning_objective = ANY (p_domains)
      AND public.question_is_servable(q.answer_format, q.answer_type, q.content)
      AND NOT public.question_is_course_item(q.metadata)
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
    AND NOT public.question_is_course_item(q.metadata)   -- D-383: never reopen a course round
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

  -- MC: the key follows the question's current content.correct, exactly as a new instance from
  -- get-next-question gets it, so a corrected text is never graded against an old key. A separate
  -- statement on purpose: under READ COMMITTED it takes its own snapshot AFTER the reopen above,
  -- which waits for any concurrent writer holding question_instances — so a question correction
  -- committed meanwhile is seen. Other formats keep their key (a Match par key is per instance).
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

-- ── 6. Fagskift: D-383's frigivelse; en inaktiv parkeret runde mister parkeringen i samme sætning ─────
CREATE OR REPLACE FUNCTION public.release_open_question_outside(p_domains text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_closed  INTEGER;
  v_deleted INTEGER;
  v_kept    INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_domains IS NULL OR array_length(p_domains, 1) IS NULL THEN
    RAISE EXCEPTION 'invalid_domains';
  END IF;

  -- D-316: a round is also released when its question is inactive (deactivated after it was served).
  UPDATE public.question_instances qi
  SET    answered    = true,
         answered_at = now(),
         parked_at        = NULL,   -- D-384: an inactive parked round is released like any other
         parked_objective = NULL
  FROM   public.questions q
  WHERE  qi.question_id  = q.id
    AND  qi.student_id   = v_user_id
    AND  qi.answered     = false
    AND  qi.user_answer IS NULL
    AND  qi.repeat_count > 0
    AND  (q.is_active IS NOT TRUE
          OR ((q.learning_objective IS NULL OR NOT (q.learning_objective = ANY (p_domains)))
              AND NOT public.question_is_course_item(q.metadata)));

  GET DIAGNOSTICS v_closed = ROW_COUNT;

  -- D-316 history guard: a round-1 instance that already carries H5 history (question_attempts) is never
  -- deleted — the attempts' foreign key would cascade. The H5 invariant makes this state impossible for
  -- every API path (an attempt is written only by _v2, which closes the round in the same transaction;
  -- every reopen raises repeat_count, enforced by H5's round guard; no API role may INSERT attempts), so
  -- this only catches a state forced past the triggers. Such a round is CLOSED instead (as a repeat is):
  -- the row and every attempt stay, the pupil is still released. Dynamic SQL, because before H5 the table
  -- does not exist; then there is no history to protect.
  IF to_regclass('public.question_attempts') IS NOT NULL THEN
    EXECUTE $guarded$
      UPDATE public.question_instances qi
      SET    answered    = true,
             answered_at = now(),
             parked_at        = NULL,
             parked_objective = NULL
      FROM   public.questions q
      WHERE  qi.question_id  = q.id
        AND  qi.student_id   = $1
        AND  qi.answered     = false
        AND  qi.user_answer IS NULL
        AND  qi.repeat_count = 0
        AND  (q.is_active IS NOT TRUE
              OR ((q.learning_objective IS NULL OR NOT (q.learning_objective = ANY ($2)))
                  AND NOT public.question_is_course_item(q.metadata)))
        AND  EXISTS (SELECT 1 FROM public.question_attempts a WHERE a.question_instance_id = qi.id)$guarded$
    USING v_user_id, p_domains;
    GET DIAGNOSTICS v_kept = ROW_COUNT;
    v_closed := v_closed + v_kept;
  END IF;

  DELETE FROM public.question_instances qi
  USING  public.questions q
  WHERE  qi.question_id  = q.id
    AND  qi.student_id   = v_user_id
    AND  qi.answered     = false
    AND  qi.user_answer IS NULL
    AND  qi.repeat_count = 0
    AND  (q.is_active IS NOT TRUE
          OR ((q.learning_objective IS NULL OR NOT (q.learning_objective = ANY (p_domains)))
              AND NOT public.question_is_course_item(q.metadata)));

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN v_closed + v_deleted;
END;
$function$;

-- ── 7. Adgang: eleven kan aldrig selv skrive parkeringen ─────────────────────────────────────────
-- question_instances har ingen UPDATE-politik for elever, så RLS lader en elev-UPDATE ramme 0 rækker. Det er ikke
-- nok alene: hvor anon/authenticated stadig har UPDATE på HELE tabellen (produktionen i dag; L3/L5 i
-- 20261108043500 er ikke anvendt), dækker tabelrettigheden også nye kolonner, og en kolonne-REVOKE har ingen
-- virkning (prototypens fund). Derfor L5-mønstret: tabelrettigheden erstattes af kolonnerettigheder for alle
-- kolonner UNDTAGEN parked_at, parked_objective og activation_no. Har rollerne allerede kun kolonnerettigheder (L5 anvendt), får de
-- nye kolonner ingen rettighed, og der er intet at gøre. service_role (BYPASSRLS, tabelrettighed) er uændret.
DO $parking_acl$
DECLARE
  v_role text;
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO v_cols
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.question_instances'::regclass AND a.attnum > 0 AND NOT a.attisdropped
    AND a.attname NOT IN ('parked_at', 'parked_objective', 'activation_no', 'served_mode');
  FOR v_role IN
    SELECT r.rolname FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated')
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_class c, LATERAL aclexplode(c.relacl) x
                  WHERE c.oid = 'public.question_instances'::regclass AND x.grantee = r.oid AND x.privilege_type = 'UPDATE')
    ORDER BY r.rolname
  LOOP
    EXECUTE format('REVOKE UPDATE ON public.question_instances FROM %I', v_role);
    EXECUTE format('GRANT UPDATE (%s) ON public.question_instances TO %I', v_cols, v_role);
  END LOOP;
END
$parking_acl$;

-- ── 8. Verifikation: alt eller intet ─────────────────────────────────────────────────────────────
DO $parking_verify$
DECLARE
  r text;
  c text;
  p text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN CONTINUE; END IF;
    IF has_table_privilege(r, 'public.question_instances', 'UPDATE') THEN
      RAISE EXCEPTION 'COURSE_PARKING: % har stadig UPDATE på hele question_instances', r;
    END IF;
    FOREACH c IN ARRAY ARRAY['parked_at', 'parked_objective', 'activation_no'] LOOP
      FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE'] LOOP
        IF has_column_privilege(r, 'public.question_instances', c, p) THEN
          RAISE EXCEPTION 'COURSE_PARKING: % har % på question_instances.%', r, p, c;
        END IF;
      END LOOP;
    END LOOP;
    IF has_function_privilege(r, 'public.park_open_course_round(uuid)', 'EXECUTE')
       OR has_function_privilege(r, 'public.resume_parked_course_round(uuid, text, text)', 'EXECUTE') THEN
      RAISE EXCEPTION 'COURSE_PARKING: % kan kalde parkering/genoptagelse', r;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role', 'public.park_open_course_round(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.resume_parked_course_round(uuid, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'COURSE_PARKING: service_role mangler EXECUTE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'question_instances_parked_guard'
                 AND tgrelid = 'public.question_instances'::regclass AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'COURSE_PARKING: triggeren question_instances_parked_guard mangler';
  END IF;
END
$parking_verify$;

RESET lock_timeout;
