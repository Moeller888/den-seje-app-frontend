-- D-383: kursusopgaver holdes ude af den almindelige quiz (databasedelen).
--
-- En KURSUSOPGAVE er et spørgsmål, hvis metadata har nøglen learning_step (D-338's trinmærke, som
-- get-next-question læser med stepOf). Ejerens beslutning 2026-11-20 (D-383): mærket på opgaven afgør det,
-- ikke domænet. Pilotdomæner (pilot_*, D-362) er bevidst almindelig quiz og berøres ikke.
--
-- Hvorfor i databasen: get-next-question kan selv springe kursusopgaver over blandt de kandidater, den får
-- (det gør den, se scope.ts isCourseItem), men to slags kald kan den ikke rette bagefter:
--   1. gentagelserne GENÅBNER en besvarelse i selve kaldet (en sideeffekt), og deres vagt "ingen ubesvaret
--      opgave er tilbage" ville ellers tælle kursusopgaver med og spærre gentagelser for altid;
--   2. niveaumotorens kandidatvindue ville kunne fyldes med kursusopgaver og skubbe almindelige ud.
-- Alle fire funktioner kaldes KUN af den almindelige quiz: et målrettet kursuskald (D-329) tager aldrig
-- niveauruten og når aldrig gentagelsestrinnet. Derfor er filteret ubetinget her.
--   get_level_questions_for_student            vinduet og fallback: + NOT question_is_course_item
--   request_repeat_question_for_student        vagten og genåbningen: + NOT question_is_course_item
--   request_repeat_question_servable_for_student  vagten og genåbningen: + NOT question_is_course_item
--   request_repeat_level_question_for_student  vagten og genåbningen: + NOT question_is_course_item
-- Og fagskiftet (kaldt af den almindelige quiz og af et målrettet kald, men frigivelse er aldrig rigtigt for en
-- kursusrunde, se afsnit 4):
--   release_open_question_outside              en aktiv kursusrunde frigives aldrig (en inaktiv stadig)
-- Ingen andre ændringer: signaturer, ejer, SECURITY DEFINER/INVOKER, search_path, plan_cache_mode, grants
-- og kommentarer er uændrede. Ingen data ændres. Kandidatvinduets eksakthedsargument holder: filteret er,
-- ligesom question_is_servable, en gyldighedsbetingelse efter vinduet, ikke en del af vinduets indeksscan.
--
-- IKKE anvendt i produktion. Må KUN anvendes via apply_migration med særskilt ejer-autorisation
-- (D-110, docs/migration-workflow-policy.md). RÆKKEFØLGE: denne migration FØR get-next-question med D-383 deployes
-- (en gammel gentagelseskrop kan ellers genåbne en kursusrunde, før funktionen ser, at den ikke må serveres; se
-- D-383 "Rækkefølge" og course-items-version-matrix.test.mjs).

-- ── 0. Vagt: funktionerne skal være præcis de versioner, produktionen kører ─────────────────────
-- md5(prosrc) [før, efter]: før er kroppene fra 20261029120000, 20261031194600 og 20261102100000 (alle anvendt i
-- produktion), efter er denne migrations egne kroppe (så en ny kørsel er tilladt). Alt andet afbryder.
DO $course_items_guard$
DECLARE
  expected CONSTANT jsonb := '{
    "public.get_level_questions_for_student(uuid,integer,text[],integer)": ["9e5862b287f6f41066eb876667c426a7", "8a48fc8ad4268eae0e4e9299d9f8be07"],
    "public.request_repeat_question_for_student(uuid,smallint,text[])": ["2ac19e786310b59051a44aed96b5bf46", "c14b90ccd4d05e12473083b072eaefba"],
    "public.request_repeat_question_servable_for_student(uuid,smallint,text[])": ["092555368551a096c29d6e60f58c17b1", "b23d72a1d167a94246e5b7243c25cdbd"],
    "public.release_open_question_outside(text[])": ["b80c1c7857ecc90bdbd7b6175b65c78f", "e52e69fa3374a5838293977f0057b34d"],
    "public.request_repeat_level_question_for_student(uuid,text[])": ["db8280ddee20254e876be7fb1fc57e4d", "410d0ab6fb67c329a573cf3f73973921"]
  }';
  f text;
BEGIN
  FOR f IN SELECT key FROM jsonb_each(expected) LOOP
    IF NOT coalesce((expected -> f) ? (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(f)), false) THEN
      RAISE EXCEPTION 'COURSE_ITEMS: % er ændret siden gennemgangen; kræver ny gennemgang', f;
    END IF;
  END LOOP;
END
$course_items_guard$;

-- ── 1. Definitionen ──────────────────────────────────────────────────────────────────────────────
-- Samme regel som scope.ts isCourseItem: et JSON-objekt med nøglen learning_step, uanset værdien (et ugyldigt
-- trin er stadig en opgave til et forløb, aldrig til den almindelige quiz). NULL og alt andet: ikke kursus.
CREATE OR REPLACE FUNCTION public.question_is_course_item(p_metadata jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_typeof(p_metadata) = 'object' AND p_metadata ? 'learning_step', false);
$$;

COMMENT ON FUNCTION public.question_is_course_item(jsonb) IS
  'D-383: a Lærligverse course item (metadata has the key learning_step, D-338). Such questions are never '
  'served, repeated or reopened by the ordinary quiz. Same rule as get-next-question scope.ts isCourseItem.';

REVOKE ALL ON FUNCTION public.question_is_course_item(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.question_is_course_item(jsonb) TO service_role;

-- ── 2. Niveaumotorens kandidater ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_level_questions_for_student(
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
  -- D-383: "valid" also means "not a course item" (question_is_course_item), checked like
  -- question_is_servable on the window's rows, so the argument is unchanged.
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
      AND NOT public.question_is_course_item(q.metadata)
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
    AND NOT public.question_is_course_item(q.metadata)
    AND NOT EXISTS (
      SELECT 1 FROM public.question_instances qi
      WHERE qi.student_id = p_student_id AND qi.question_id = q.id
    )
  ORDER BY abs(q.difficulty_level - p_level), md5(p_student_id::text || q.id::text), q.id
  LIMIT v_limit;
END;
$$;

-- ── 3. Gentagelser: en kursusopgave genåbnes aldrig af den almindelige quiz ─────────────────────
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

-- ── 4. Fagskift: en åben kursusrunde frigives aldrig af den almindelige quiz ──────────────────────
-- Før: et kald til den almindelige quiz i et andet fag lukkede eller slettede elevens åbne kursusrunde (den lå
-- uden for fagets domæner), så forløbet mistede den uden at eleven så det. Nu bliver en kursusrunde stående; den
-- genoptages i forløbet (get-next-question serverer den kun i sekvensen og siger det ellers). Undtagelse som før:
-- en runde, hvis spørgsmål er INAKTIVT, frigives stadig — den kan aldrig serveres og ville ellers spærre eleven.
-- Kroppen er D-316's (20261102100000, anvendt i produktion) med præcis de tre betingelser ændret.
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
         answered_at = now()
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
             answered_at = now()
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
