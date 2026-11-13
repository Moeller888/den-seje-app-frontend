-- Lærligverse: afgrænset belønning for meningsfuld progression i Arkivskabet — IKKE ANVENDT I PRODUKTION.
--
-- EJERBESLUTNING (bindende): "Eleverne skal kunne modtage XP og coins for meningsfuld progression i
-- Arkivskabet, men kursusopgaver må ikke forvride deres almindelige faglige mestring."
-- Modellen, satserne og begrundelsen står i docs/laerligverse/belonningsmodel.md.
--
-- HVAD MIGRATIONEN GØR (og intet andet)
--   1. Ny tabel public.course_progress_rewards: en append-only bog over kursusmilepæle, én række pr.
--      (student_id, milestone_key) — UNIQUE, så en milepæl højst kan udbetales én gang.
--      RLS er slået til. Eleven må LÆSE sine egne rækker (én SELECT-politik, auth.uid() = student_id) og
--      intet andet; ingen API-rolle må INSERT/UPDATE/DELETE/TRUNCATE. Kun service_role må INSERT (og SELECT).
--   2. Ny funktion public.award_course_milestones(p_student_id uuid, p_objective text) RETURNS jsonb.
--      SECURITY INVOKER, search_path '' (alle navne er skemakvalificerede), EXECUTE KUN for service_role
--      (Edge-funktionen course-progress kalder den med den verificerede user.id). Den GENBEREGNER
--      berettigelsen ud fra serverens egne data (question_instances + questions.metadata.learning_step)
--      — aldrig ud fra noget, kalderen påstår — indsætter nyoptjente milepæle med ON CONFLICT DO NOTHING
--      og krediterer XP og coins i student_progress (samme kolonner som den almindelige belønningsvej)
--      KUN for de rækker, der faktisk blev indsat, i samme transaktion.
--
-- KURSUSMARKØREN: et spørgsmål er en kursusopgave, når questions.metadata->>'learning_step' er et af de
-- fem trin i supabase/functions/_shared/learning-sequence.ts (STEP_IDS). Markøren ligger på det forfattede
-- spørgsmål, aldrig i requesten.
--
-- MILEPÆLE (nøgle → betingelse, alt læst fra serverdata for eleven og målet):
--   step:<mål>:<trin>     første registrerede svar i trinnet (guided_practice, independent_application,
--                         transfer, revisit). revision belønnes IKKE (0): ellers kunne et bevidst forkert
--                         svar i vejledt øvelse betale sig.
--   check:<mål>:<trin>    første rigtige svar (was_correct = true) i et vurderingstrin
--                         (independent_application, transfer, revisit).
--   sequence:<mål>        REGISTRERING (0 XP, 0 coins): hele forløbet er gennemført efter testpolitikken
--                         laerligverse-test-policy-v0 (samme regel som nextStep → 'complete'). Gennemført er
--                         ikke det samme som bestået: registreringen sker også, når alle kontroller var forkerte.
--   sequence_bonus:<mål>  FORLØBSBONUS: forløbet er gennemført OG eleven har bestået mindst én relevant kontrol
--                         i det (ejerprincip 2026-11-10: "En elev skal have bestået mindst én relevant
--                         kontrolopgave, før en kursusmilepælsbonus kan udbetales").
--   milestone:sequences:3 / milestone:sequences:10   antal forløb MED bonus (læst fra bogen selv) — altså
--                         kun forløb, hvor mindst én relevant kontrol er bestået.
--
-- RELEVANT KONTROL (ét sted i koden, CTE'en "passed"): et svar i et vurderingstrin (independent_application
-- = check, transfer = application, revisit = review), som serveren har registreret som rigtigt
-- (was_correct = true). På den gamle vej kan serveren ikke se, om det var FØRSTE forsøg (en gentagelse
-- genåbner instansen), eller om der blev brugt hjælp. Når K1 (question_attempts.attempt_no) og L3
-- (registrerede hints) er anvendt, kan "passed" strammes til første forsøg uden registreret hjælp i én
-- ændring af netop den CTE; allerede udbetalte rækker røres ikke.
--
-- MIDLERTIDIG BEGRÆNSNING — LANGE SVAR: lange svar (questions.answer_type = 'long') bedømmes af læreren via
-- Edge-funktionen review-answer, som lægger XP direkte i student_progress pr. bedømmelse (og igen ved en ny
-- bedømmelse). Den vej er ikke beskyttet mod kursusopgaver endnu. Indtil den er det, nægter funktionen at
-- udbetale for et kursusmål, der indeholder en kursusopgave med lange svar ('long_answer_items_blocked',
-- intet skrives). Det er en bevidst, midlertidig begrænsning, ikke en udelukkelse af lange svar fra
-- Arkivskabet; den ophæves med en ny migration, når review-answer er beskyttet (se
-- docs/laerligverse/forslag-k1-belonning-kursussvar.md) — den migration skal også lade en lærerbedømt lang
-- besvarelse tælle (et langt svar forbliver answered = false; teacher_score sættes ved bedømmelsen).
--
-- HVAD DEN IKKE RØRER: total_correct_answers, correct_answers, level, mastery_*, streak, quests,
-- student_subject_level, student_band_state, student_level_fold_log, question_instances, questions og
-- alle belønnings-RPC'er (process_question_attempt / _v2 / process_text_answer / _v2) er uændrede.
--
-- SAMTIDIGHED: funktionen tager først rækkelåsen på elevens student_progress-række (FOR UPDATE), så to
-- samtidige kald for samme elev serialiseres; den anden ser den førstes rækker og indsætter intet.
-- Uafhængigt af låsen gør UNIQUE + ON CONFLICT DO NOTHING det umuligt at indsætte en milepæl to gange,
-- og der krediteres kun for indsatte rækker. Fejler noget midtvejs, ruller hele transaktionen tilbage
-- (både bog og kredit), så et nyt forsøg betaler præcis én gang.
--
-- DOBBELTBETALINGSVAGT: i dag betaler belønnings-RPC'erne også kursussvar (10 XP + 5 coins, tællere, quests).
-- Funktionen LÆSER derfor kun katalogets md5(prosrc) af de fire svarfunktioner og review_answer (4 argumenter,
-- lærerbedømmelsens XP-vej) og udbetaler intet
-- (outcome 'reward_path_not_ready', ingen skrivning), medmindre hver af dem har en af EFTER-kroppene fra
-- forslaget til H5/K1-sporet (docs/laerligverse/forslag-k1-belonning-kursussvar.sql). Migrationen ændrer
-- ikke selv nogen belønningsfunktion.
--
-- FLAG: Edge-funktionen course-progress er slukket, medmindre LAERLIGVERSE_COURSE_REWARDS er præcis "on".
-- Uden kald af funktionen sker der intet — tabellen forbliver tom.
--
-- TILBAGERULNING (særskilt ejerautorisation; kun mens ingen milepæl er udbetalt, ellers skal udbetalte
-- XP/coins først vurderes af ejeren):
--   DROP FUNCTION public.award_course_milestones(uuid, text);
--   DROP TABLE public.course_progress_rewards;
--
-- Må KUN anvendes via apply_migration med særskilt ejerautorisation (D-110), aldrig via CLI-push.

CREATE TABLE public.course_progress_rewards (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  milestone_key      text NOT NULL CHECK (char_length(milestone_key) BETWEEN 1 AND 300),
  kind               text NOT NULL CHECK (kind IN ('step_completed', 'check_passed', 'sequence_completed', 'sequence_bonus', 'course_milestone')),
  learning_objective text,
  learning_step      text CHECK (learning_step IS NULL OR learning_step IN
                       ('guided_practice', 'revision', 'independent_application', 'transfer', 'revisit')),
  xp_awarded         integer NOT NULL CHECK (xp_awarded >= 0),
  coins_awarded      integer NOT NULL CHECK (coins_awarded >= 0),
  policy             text NOT NULL,
  rates_version      text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT course_progress_rewards_once UNIQUE (student_id, milestone_key)
);

ALTER TABLE public.course_progress_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY course_progress_rewards_select_own ON public.course_progress_rewards
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = student_id);

-- Produktionens standardrettigheder giver nye tabeller ALL til anon, authenticated og service_role:
-- alt fjernes eksplicit, og kun det nødvendige gives tilbage.
REVOKE ALL ON TABLE public.course_progress_rewards FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.course_progress_rewards TO authenticated;
GRANT SELECT, INSERT ON TABLE public.course_progress_rewards TO service_role;

CREATE FUNCTION public.award_course_milestones(p_student_id uuid, p_objective text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  c_policy  constant text := 'laerligverse-test-policy-v0';
  c_rates   constant text := 'course-rewards-v0.1-provisional';
  v_role    text;
  v_locked  uuid;
  v_awarded jsonb := '[]'::jsonb;
  v_xp      integer := 0;
  v_coins   integer := 0;
  v_seq     integer;
  r         record;
BEGIN
  IF p_student_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'missing_student', 'awarded', '[]'::jsonb,
                              'xp_awarded', 0, 'coins_awarded', 0);
  END IF;
  IF p_objective IS NULL OR char_length(btrim(p_objective)) = 0 OR char_length(p_objective) > 200 THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'reason', 'invalid_objective', 'awarded', '[]'::jsonb,
                              'xp_awarded', 0, 'coins_awarded', 0);
  END IF;

  -- Dobbeltbetalingsvagt: så længe en betalende vej stadig betaler kursusopgaver pr. svar/bedømmelse, udbetales
  -- intet. Hver overload af de fire svarfunktioner skal have en af de reviewede EFTER-kroppe fra
  -- docs/laerligverse/forslag-k1-belonning-kursussvar.sql, process_question_attempt skal findes, og
  -- review_answer (4 argumenter, lærerbedømmelse) skal have forslagets krop, der giver kursusopgaver 0 XP.
  IF NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc p
       WHERE p.oid = to_regprocedure('public.process_question_attempt(uuid,uuid,text,bigint)')
         AND md5(p.prosrc) = 'a91a651c32b8f0d4a8efad588f2f78dd')
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc p
       WHERE p.oid = to_regprocedure('public.review_answer(uuid,integer,text,uuid)')
         AND md5(p.prosrc) = 'd3e08630604112b593c218cc07ad496b')
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('process_question_attempt', 'process_question_attempt_v2', 'process_text_answer', 'process_text_answer_v2')
         AND md5(p.prosrc) NOT IN ('a91a651c32b8f0d4a8efad588f2f78dd', 'f241c2115ec48441efc9e695b028d2d2',
                                   '62589388dae732ad79ca8f893027785d', '098969e41b5c85a00e21a733093d7ecb')) THEN
    RETURN jsonb_build_object('outcome', 'reward_path_not_ready', 'awarded', '[]'::jsonb, 'xp_awarded', 0, 'coins_awarded', 0);
  END IF;

  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = p_student_id;
  IF v_role IS DISTINCT FROM 'student' THEN
    RETURN jsonb_build_object('outcome', 'not_a_student', 'awarded', '[]'::jsonb, 'xp_awarded', 0, 'coins_awarded', 0);
  END IF;

  -- Serialiserer samtidige kald for samme elev (se hovedet).
  SELECT sp.student_id INTO v_locked FROM public.student_progress sp WHERE sp.student_id = p_student_id FOR UPDATE;
  IF v_locked IS NULL THEN
    RETURN jsonb_build_object('outcome', 'no_progress_row', 'awarded', '[]'::jsonb, 'xp_awarded', 0, 'coins_awarded', 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.questions q
    WHERE q.learning_objective = p_objective
      AND q.metadata->>'learning_step' IN ('guided_practice', 'revision', 'independent_application', 'transfer', 'revisit')
  ) THEN
    RETURN jsonb_build_object('outcome', 'not_a_course_objective', 'awarded', '[]'::jsonb, 'xp_awarded', 0, 'coins_awarded', 0);
  END IF;

  -- Midlertidig begrænsning (se hovedet): et kursusmål med lange svar udbetaler intet, før review-answer er beskyttet.
  IF EXISTS (
    SELECT 1 FROM public.questions q
    WHERE q.learning_objective = p_objective
      AND q.metadata->>'learning_step' IN ('guided_practice', 'revision', 'independent_application', 'transfer', 'revisit')
      AND q.answer_type = 'long'
  ) THEN
    RETURN jsonb_build_object('outcome', 'long_answer_items_blocked', 'awarded', '[]'::jsonb, 'xp_awarded', 0, 'coins_awarded', 0);
  END IF;

  FOR r IN
    WITH hist AS (
      SELECT q.metadata->>'learning_step' AS step, qi.was_correct, qi.answered_at, qi.id
      FROM public.question_instances qi
      JOIN public.questions q ON q.id = qi.question_id
      WHERE qi.student_id = p_student_id
        AND qi.answered = true
        AND q.learning_objective = p_objective
        AND q.metadata->>'learning_step' IN ('guided_practice', 'revision', 'independent_application', 'transfer', 'revisit')
    ),
    -- Relevante beståede kontroller: ét sted, så kravet kan strammes (første forsøg, uden hjælp) med K1/L3.
    passed AS (
      SELECT h.step FROM hist h
      WHERE h.step IN ('independent_application', 'transfer', 'revisit') AND h.was_correct = true
    ),
    done AS (
      SELECT
        EXISTS (SELECT 1 FROM hist WHERE step = 'guided_practice')         AS practice,
        EXISTS (SELECT 1 FROM hist WHERE step = 'revision')                AS revision,
        EXISTS (SELECT 1 FROM hist WHERE step = 'independent_application') AS application,
        EXISTS (SELECT 1 FROM hist WHERE step = 'transfer')                AS transfer,
        EXISTS (SELECT 1 FROM hist WHERE step = 'revisit')                 AS revisit,
        (SELECT h.was_correct FROM hist h WHERE h.step = 'guided_practice'
          ORDER BY h.answered_at DESC NULLS LAST, h.id DESC LIMIT 1)       AS latest_practice_correct,
        EXISTS (SELECT 1 FROM passed)                                     AS any_check_passed
    ),
    complete AS (
      SELECT d.* FROM done d
      WHERE d.practice
        AND (d.latest_practice_correct IS DISTINCT FROM false OR d.revision)
        AND d.application AND d.transfer AND d.revisit
    ),
    earned AS (
      -- Første registrerede svar i et trin (revision giver 0 og står derfor ikke her).
      SELECT 'step:' || p_objective || ':' || s.step AS milestone_key, 'step_completed' AS kind, s.step AS learning_step,
             s.xp, s.coins, s.ord
      FROM (VALUES ('guided_practice', 3, 1, 10), ('independent_application', 3, 1, 20),
                   ('transfer', 3, 1, 30), ('revisit', 3, 1, 40)) AS s(step, xp, coins, ord)
      WHERE EXISTS (SELECT 1 FROM hist h WHERE h.step = s.step)
      UNION ALL
      -- Første rigtige svar i et vurderingstrin.
      SELECT 'check:' || p_objective || ':' || c.step, 'check_passed', c.step, c.xp, c.coins, c.ord
      FROM (VALUES ('independent_application', 8, 4, 21), ('transfer', 8, 4, 31), ('revisit', 8, 4, 41)) AS c(step, xp, coins, ord)
      WHERE EXISTS (SELECT 1 FROM passed p WHERE p.step = c.step)
      UNION ALL
      -- Registrering: hele forløbet er gennemført efter testpolitikken (nextStep → 'complete'). 0 XP, 0 coins.
      SELECT 'sequence:' || p_objective, 'sequence_completed', NULL, 0, 0, 50
      FROM complete
      UNION ALL
      -- Forløbsbonus: gennemført OG mindst én relevant kontrol bestået.
      SELECT 'sequence_bonus:' || p_objective, 'sequence_bonus', NULL, 25, 10, 51
      FROM complete c
      WHERE c.any_check_passed
    )
    SELECT * FROM earned ORDER BY ord
  LOOP
    WITH ins AS (
      INSERT INTO public.course_progress_rewards
        (student_id, milestone_key, kind, learning_objective, learning_step, xp_awarded, coins_awarded, policy, rates_version)
      VALUES (p_student_id, r.milestone_key, r.kind, p_objective, r.learning_step, r.xp, r.coins, c_policy, c_rates)
      ON CONFLICT (student_id, milestone_key) DO NOTHING
      RETURNING milestone_key, kind, learning_step, xp_awarded, coins_awarded
    )
    SELECT v_awarded || coalesce(jsonb_agg(jsonb_build_object('milestone_key', ins.milestone_key, 'kind', ins.kind,
             'learning_step', ins.learning_step, 'xp', ins.xp_awarded, 'coins', ins.coins_awarded)), '[]'::jsonb),
           v_xp + coalesce(sum(ins.xp_awarded), 0), v_coins + coalesce(sum(ins.coins_awarded), 0)
      INTO v_awarded, v_xp, v_coins
    FROM ins;
  END LOOP;

  -- Kursusmilepæle: antal forløb MED bonus (mindst én bestået relevant kontrol), læst fra bogen selv.
  SELECT count(*)::int INTO v_seq FROM public.course_progress_rewards
  WHERE student_id = p_student_id AND kind = 'sequence_bonus';

  FOR r IN
    SELECT 'milestone:sequences:' || m.n AS milestone_key, m.xp, m.coins
    FROM (VALUES (3, 30, 15), (10, 75, 40)) AS m(n, xp, coins)
    WHERE v_seq >= m.n
    ORDER BY m.n
  LOOP
    WITH ins AS (
      INSERT INTO public.course_progress_rewards
        (student_id, milestone_key, kind, learning_objective, learning_step, xp_awarded, coins_awarded, policy, rates_version)
      VALUES (p_student_id, r.milestone_key, 'course_milestone', NULL, NULL, r.xp, r.coins, c_policy, c_rates)
      ON CONFLICT (student_id, milestone_key) DO NOTHING
      RETURNING milestone_key, kind, xp_awarded, coins_awarded
    )
    SELECT v_awarded || coalesce(jsonb_agg(jsonb_build_object('milestone_key', ins.milestone_key, 'kind', ins.kind,
             'learning_step', NULL, 'xp', ins.xp_awarded, 'coins', ins.coins_awarded)), '[]'::jsonb),
           v_xp + coalesce(sum(ins.xp_awarded), 0), v_coins + coalesce(sum(ins.coins_awarded), 0)
      INTO v_awarded, v_xp, v_coins
    FROM ins;
  END LOOP;

  -- Kredit kun for indsatte rækker, samme kolonner som den almindelige belønningsvej, samme transaktion.
  IF v_xp > 0 OR v_coins > 0 THEN
    UPDATE public.student_progress
    SET xp    = COALESCE(xp, 0) + v_xp,
        coins = COALESCE(coins, 0) + v_coins
    WHERE student_id = p_student_id;
  END IF;

  RETURN jsonb_build_object(
    'outcome',       CASE WHEN jsonb_array_length(v_awarded) > 0 THEN 'awarded' ELSE 'nothing_new' END,
    'learning_objective', p_objective,
    'policy',        c_policy,
    'rates_version', c_rates,
    'awarded',       v_awarded,
    'xp_awarded',    v_xp,
    'coins_awarded', v_coins
  );
END;
$$;

REVOKE ALL ON FUNCTION public.award_course_milestones(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_course_milestones(uuid, text) TO service_role;
