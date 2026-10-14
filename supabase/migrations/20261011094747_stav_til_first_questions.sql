-- Opgaveformer — "stav til": de første aktive korte tekstspørgsmål.
--
-- HVAD MIGRATIONEN GØR
-- Gør præcis to spørgsmål aktive med answer_format = 'text' og answer_type = 'short', så den
-- færdige stav til-renderer (js/answer-input.js, PR #288) og den autoritative tekstbedømmer
-- (_shared/answer-evaluation.ts, process-event) får rigtigt indhold i produktion:
--
--   1. b88f169a-f959-4d8b-bc9b-846fb36017fb  (findes, inaktiv siden legacy_cleanup 2026-03-08)
--      "Hvilket land invaderede Tyskland 1. september 1939?"  →  Polen
--      Indholdet beholdes uændret; der tilføjes kun en forklaring (review_text). Aktiveres, og
--      deactivated_at / deactivation_reason ryddes (aktive spørgsmål har aldrig disse felter sat).
--
--   2. 88b65a03-c2ea-428f-a5e6-80d5da83362f  (NYT, fast UUID)
--      "Hvilket land besatte Tyskland samme dag som Danmark, den 9. april 1940?"  →  Norge
--      Erstatter d02db9bf (Belgien), som IKKE er egnet: ved Vestoffensiven i maj 1940 invaderede
--      Tyskland både Belgien, Nederlandene og Luxembourg, så et rigtigt svar som "Holland" ville
--      blive bedømt forkert ved eksakt match. d02db9bf røres ikke og forbliver inaktiv.
--
-- Ejerbeslutning 2026-10-11: Polen + nyt Norge-spørgsmål, begge med en kort forklaring.
--
-- HVAD MIGRATIONEN IKKE GØR
-- Ingen ændring af skema, funktioner, rettigheder, RLS, belønning eller andre spørgsmål.
-- Bedømmelse og belønning er uændrede: serveren afgør korrekthed med eksakt match efter
-- normalisering mod correct + accepted_answers; process_text_answer giver 10 XP + 5 mønter én gang
-- pr. instans (CAS på answered = false). Tekstspørgsmål genåbnes aldrig af request_repeat_question.
--
-- SIKKERHEDSNET
-- Alt sker i ÉN DO-blok, dvs. én sætning: enten lykkes det hele, eller intet ændres. Blokken
-- stopper med en fejl, hvis udgangstilstanden ikke er præcis den, der blev målt read-only
-- 2026-10-11 (se forudsætningerne nedenfor), og den efterprøver resultatet, før den slutter.
-- Kørt to gange fejler den anden kørsel højlydt (Polen er så allerede aktiv) uden at ændre noget.
--
-- ROLLBACK (særskilt ejerautorisation; præcis den modsatte ændring):
--
--   DO $rollback$
--   DECLARE n integer;
--   BEGIN
--     UPDATE public.questions
--        SET is_active           = false,
--            deactivated_at      = '2026-03-08 16:52:55.128162+00',
--            deactivation_reason = 'legacy_cleanup',
--            content             = content - 'review_text'
--      WHERE id = 'b88f169a-f959-4d8b-bc9b-846fb36017fb' AND is_active = true;
--     GET DIAGNOSTICS n = ROW_COUNT;
--     IF n <> 1 THEN RAISE EXCEPTION 'rollback: Polen-rækken var ikke aktiv (% rækker)', n; END IF;
--
--     -- Norge slettes kun, hvis ingen elev har fået det; ellers deaktiveres det, så elevernes
--     -- historik (question_instances) bevares.
--     IF EXISTS (SELECT 1 FROM public.question_instances
--                 WHERE question_id = '88b65a03-c2ea-428f-a5e6-80d5da83362f') THEN
--       UPDATE public.questions
--          SET is_active = false, deactivated_at = now(), deactivation_reason = 'stav_til_rollback'
--        WHERE id = '88b65a03-c2ea-428f-a5e6-80d5da83362f';
--     ELSE
--       DELETE FROM public.questions WHERE id = '88b65a03-c2ea-428f-a5e6-80d5da83362f';
--     END IF;
--     GET DIAGNOSTICS n = ROW_COUNT;
--     IF n <> 1 THEN RAISE EXCEPTION 'rollback: Norge-rækken fandtes ikke (% rækker)', n; END IF;
--   END
--   $rollback$;
--
-- Må KUN anvendes via apply_migration med særskilt ejerautorisation (D-110). Aldrig `supabase db push`.

DO $stav_til$
DECLARE
  c_polen CONSTANT uuid := 'b88f169a-f959-4d8b-bc9b-846fb36017fb';
  c_norge CONSTANT uuid := '88b65a03-c2ea-428f-a5e6-80d5da83362f';

  -- Polens indhold præcis som målt live 2026-10-11 (jsonb-lighed: nøglerækkefølge er ligegyldig).
  c_polen_content CONSTANT jsonb := jsonb_build_object(
    'question',         'Hvilket land invaderede Tyskland 1. september 1939?',
    'correct',          'Polen',
    'accepted_answers', jsonb_build_array('Polen')
  );
  c_polen_review CONSTANT text :=
    'Tyskland angreb Polen den 1. september 1939. To dage senere erklærede Storbritannien og '
    'Frankrig Tyskland krig – det var starten på Anden Verdenskrig.';

  c_norge_content CONSTANT jsonb := jsonb_build_object(
    'question',         'Hvilket land besatte Tyskland samme dag som Danmark, den 9. april 1940?',
    'correct',          'Norge',
    'accepted_answers', jsonb_build_array('Norge'),
    'review_text',      'Den 9. april 1940 besatte Tyskland både Danmark og Norge. Danmark overgav '
                        'sig samme dag, mens Norge kæmpede imod i omkring to måneder.'
  );

  v_row public.questions%ROWTYPE;
  v_n   integer;
BEGIN
  -- ── Forudsætninger: stop ved enhver afvigelse ────────────────────────────────────────────────
  SELECT * INTO v_row FROM public.questions WHERE id = c_polen;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'stav til: Polen-spørgsmålet % findes ikke', c_polen;
  END IF;
  IF v_row.is_active IS DISTINCT FROM false
     OR v_row.answer_format IS DISTINCT FROM 'text'
     OR v_row.answer_type IS DISTINCT FROM 'short'
     OR v_row.question_type IS DISTINCT FROM 'auto'
     OR v_row.learning_objective IS DISTINCT FROM 'world_war_2'
     OR v_row.target_grade IS DISTINCT FROM 7
     OR v_row.difficulty_band IS DISTINCT FROM 1
     OR v_row.deactivation_reason IS DISTINCT FROM 'legacy_cleanup'
     OR v_row.content IS DISTINCT FROM c_polen_content THEN
    RAISE EXCEPTION 'stav til: Polen-spørgsmålet % har ikke den forventede udgangstilstand '
                    '(is_active=%, answer_format=%, answer_type=%, content=%)',
      c_polen, v_row.is_active, v_row.answer_format, v_row.answer_type, v_row.content;
  END IF;

  IF EXISTS (SELECT 1 FROM public.questions WHERE id = c_norge) THEN
    RAISE EXCEPTION 'stav til: Norge-spørgsmålet % findes allerede', c_norge;
  END IF;

  IF EXISTS (SELECT 1 FROM public.questions WHERE is_active AND answer_format = 'text') THEN
    RAISE EXCEPTION 'stav til: der findes allerede aktive tekstspørgsmål — udgangstilstanden er ændret';
  END IF;

  -- ── 1. Polen: tilføj forklaring og aktivér ───────────────────────────────────────────────────
  UPDATE public.questions
     SET content             = content || jsonb_build_object('review_text', c_polen_review),
         is_active           = true,
         deactivated_at      = NULL,
         deactivation_reason = NULL
   WHERE id = c_polen
     AND is_active = false;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'stav til: Polen-opdateringen ramte % rækker, forventet 1', v_n;
  END IF;

  -- ── 2. Norge: nyt spørgsmål med fast UUID ────────────────────────────────────────────────────
  -- Samme felter som Polen-rækken (domæne, klassetrin, bånd, metadata-mønster); type følger
  -- spørgsmålskontrakten (packages/question-contract: 'text_input'). content_hash er NULL som for
  -- de øvrige indholdsmigrationer.
  INSERT INTO public.questions (
    id, type, content, difficulty, is_active, question_type, learning_objective,
    answer_format, answer_type, metadata, target_grade, difficulty_band
  ) VALUES (
    c_norge, 'text_input', c_norge_content, 1, true, 'auto', 'world_war_2',
    'text', 'short',
    jsonb_build_object(
      'domain',             'world_war_2',
      'insight_type',       'conceptual_bridge',
      'challenge_role',     'reinforcement',
      'cognitive_skill',    'recall',
      'difficulty_type',    'factual',
      'misconception_type', 'surface_association'
    ),
    7, 1
  );

  -- ── Efterprøvning ───────────────────────────────────────────────────────────────────────────
  SELECT count(*) INTO v_n
    FROM public.questions
   WHERE is_active AND answer_format = 'text';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'stav til: % aktive tekstspørgsmål efter migrationen, forventet 2', v_n;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.questions
     WHERE id = c_polen AND is_active AND answer_type = 'short'
       AND content = c_polen_content || jsonb_build_object('review_text', c_polen_review)
  ) THEN
    RAISE EXCEPTION 'stav til: Polen-rækken har ikke det forventede slutindhold';
  END IF;
END
$stav_til$;
