-- D-280: længdesporet fjernes fra de 10 mest viste MC-spørgsmål i prioritet 1.
--
-- I de ti spørgsmål var det rigtige svar mindst 1,5× og mindst 10 tegn længere end det længste
-- forkerte, så en elev kunne gætte det ud fra længden. Ejeren godkendte teksterne og den direkte
-- rettelse (ikke versionsskifte) i chatten 2026-10-31.
--
-- Hvad migrationen ændrer:
--   1. process_question_attempt: aliaslisten (metadata.danish_orthography_correct_aliases) må have
--      to eller flere gennemgåede versioner af facit, ikke kun præcis to. Reglen er ellers uændret:
--      aliaserne gælder kun, når både det gemte facit og det nuværende content.correct står i listen.
--   2. De tre gentagelsesveje, som get-next-question kalder (request_repeat_question_for_student,
--      ..._servable_for_student og request_repeat_level_question_for_student): ved genåbning af en
--      MC-besvarelse sættes correct_answer til spørgsmålets nuværende content.correct, ligesom ved en
--      ny besvarelse. Andre formater beholder deres facit. request_repeat_question (auth.uid-varianten)
--      ændres ikke: kun postgres har EXECUTE, og ingen deployet kode kalder den.
--   3. De ti spørgsmål: spørgsmålstekst (3 af 10), svarmuligheder og content.correct, plus en alias-
--      liste med alle tidligere rigtige svartekster og den nye. Alle andre felter i content og
--      metadata er uændrede (review_text, accepted_answers, concepts …). Kun åbne besvarelser
--      (answered = false) af de ti spørgsmål får det nye facit; besvarede besvarelser, elevsvar,
--      resultater, XP, mønter og statistik ændres ikke.
--
-- Overgang: en elev, der har den gamle side åben, kan indsende både den gamle og den nye rigtige
-- svartekst (aliaserne). Ved de fire spørgsmål, der allerede havde retstavningsaliaser, bevares den
-- gamle stavemåde også.
--
-- Spørgsmålene findes på deres (unikke) spørgsmålstekst og kontrolleres mod md5 af content og
-- metadata fra read-only preflight i produktion 2026-10-31. Antallet af åbne besvarelser og deres
-- gemte facit er også fra preflight. Enhver afvigelse afbryder hele migrationen, også
-- funktionsændringerne. Er alle ti allerede rettet, gør den intet.
--
-- IKKE anvendt i produktion. Må KUN anvendes via apply_migration med særskilt ejer-autorisation
-- (D-110, docs/migration-workflow-policy.md). Preflight skal gentages umiddelbart før anvendelse.

-- ── 0. Vagt: funktionerne skal være præcis de versioner, produktionen kører ─────────────────────
-- md5(prosrc) [før, efter]: før er læst i produktionen 2026-10-31 (catalog only), efter er denne
-- migrations egne kroppe (så en ny kørsel er tilladt). Alt andet afbryder migrationen.
DO $mc_length_cue_guard$
DECLARE
  expected CONSTANT jsonb := '{
    "public.process_question_attempt(uuid,uuid,text,bigint)": ["8f698c5b45ecfe9a1988215dd8849d67", "328ea8f9a4fd260407b582dcecb7dfdf"],
    "public.request_repeat_question_for_student(uuid,smallint,text[])": ["b27c917b9225bca58ad756e7952c49db", "9cae1869428170353842aeea7c20b478"],
    "public.request_repeat_question_servable_for_student(uuid,smallint,text[])": ["e31009c5924d0fbe4f11731df7f94290", "8d3bd29f6a10c0ed2015242163891d83"],
    "public.request_repeat_level_question_for_student(uuid,text[])": ["ee153327dae5a5686e9c5efd247d27c0", "56604915f7750b3ff8c8923b62487b46"]
  }';
  f text;
BEGIN
  FOR f IN SELECT key FROM jsonb_each(expected) LOOP
    IF NOT coalesce((expected -> f) ? (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(f)), false) THEN
      RAISE EXCEPTION 'MC_LENGTH_CUE: % er ændret siden preflight; kræver ny gennemgang', f;
    END IF;
  END LOOP;
END
$mc_length_cue_guard$;

-- ── 1. process_question_attempt: to eller flere gennemgåede facitversioner som aliaser ──────
CREATE OR REPLACE FUNCTION public.process_question_attempt(p_student_id uuid, p_question_instance_id uuid, p_answer text, p_question_shown_at bigint)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_instance       record;
  v_correct        boolean := false;
  v_answer         text;
  v_correct_answer text;
  v_rows_updated   integer;
  v_is_repeat      boolean := false;
  v_xp             integer := 0;
  v_coins          integer := 0;
  v_orthography_aliases jsonb;
BEGIN

  SELECT qi.*, q.answer_format, q.content AS question_content, q.metadata AS question_metadata
  INTO v_instance
  FROM question_instances qi
  JOIN questions q ON q.id = qi.question_id
  WHERE qi.id         = p_question_instance_id
    AND qi.student_id = p_student_id;

  IF v_instance IS NULL THEN
    RAISE EXCEPTION 'Instance not found';
  END IF;

  -- Only reviewed earlier versions of this question's correct option are aliases: an old spelling
  -- and/or an earlier wording, two or more entries, always including the current content.correct.
  -- The stored answer key and all historical pupil answers/results remain unchanged.
  v_orthography_aliases := v_instance.question_metadata->'danish_orthography_correct_aliases';
  IF jsonb_typeof(v_orthography_aliases) IS DISTINCT FROM 'array' THEN
    v_orthography_aliases := '[]'::jsonb;
  END IF;
  IF jsonb_array_length(v_orthography_aliases) >= 2
     AND v_orthography_aliases ? v_instance.correct_answer
     AND v_orthography_aliases ? (v_instance.question_content->>'correct') THEN
    v_instance.correct_answer := v_instance.question_content->>'correct';
  ELSE
    v_orthography_aliases := '[]'::jsonb;
  END IF;

  IF v_instance.answered = true THEN
    RETURN json_build_object(
      'status', CASE
        WHEN v_instance.was_correct = true  THEN 'correct'
        WHEN v_instance.was_correct = false THEN 'incorrect'
        ELSE 'pending'
      END,
      'correct_answer', v_instance.correct_answer
    );
  END IF;

  v_is_repeat := coalesce(v_instance.repeat_count, 0) > 0;

  IF v_instance.answer_format = 'text' THEN
    UPDATE question_instances
    SET answered = true, answered_at = now(), user_answer = p_answer, was_correct = null
    WHERE id = v_instance.id AND answered = false;

    RETURN json_build_object('status', 'pending', 'correct_answer', null);
  END IF;

  v_answer         := trim(regexp_replace(lower(p_answer),                   '[^a-z0-9]', '', 'g'));
  v_correct_answer := trim(regexp_replace(lower(v_instance.correct_answer), '[^a-z0-9]', '', 'g'));

  IF v_answer = v_correct_answer OR v_orthography_aliases ? p_answer THEN
    v_correct := true;
  END IF;

  UPDATE question_instances
  SET
    answered    = true,
    answered_at = now(),
    user_answer = p_answer,
    was_correct = v_correct
  WHERE id       = v_instance.id
    AND answered = false;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  -- A concurrent call already scored this instance: award nothing, report the same result.
  IF v_rows_updated = 0 THEN
    RETURN json_build_object(
      'status',         CASE WHEN v_correct THEN 'correct' ELSE 'incorrect' END,
      'correct_answer', v_instance.correct_answer
    );
  END IF;

  IF v_correct THEN
    IF v_is_repeat THEN
      -- A repeat earns a token amount: 1 coin and 2 XP (D-211, owner decision 2026-10-26).
      -- correct_answers and total_correct_answers stay put: they feed the accuracy figure
      -- teachers read, and re-answers of already known material would inflate it.
      v_coins := 1;
      v_xp    := 2;
      UPDATE student_progress
      SET
        xp    = COALESCE(xp, 0) + v_xp,
        coins = COALESCE(coins, 0) + v_coins
      WHERE student_id = p_student_id;
    ELSE
      v_xp    := 10;
      v_coins := 5;
      UPDATE student_progress
      SET
        xp                    = COALESCE(xp, 0) + v_xp,
        coins                 = COALESCE(coins, 0) + v_coins,
        correct_answers       = COALESCE(correct_answers, 0) + 1,
        total_correct_answers = COALESCE(total_correct_answers, 0) + 1
      WHERE student_id = p_student_id;
    END IF;
  END IF;

  -- A streak measures showing up, which a pupil practising repeats has genuinely done.
  PERFORM public.update_streak(p_student_id);

  -- Quest progress is NOT advanced by repeats: quest rewards are coins, and the pool-exhausted
  -- pupil could otherwise complete quests indefinitely on questions they already know.
  IF NOT v_is_repeat THEN
    PERFORM public.update_quest_progress_for_answer(
      p_student_id,
      v_correct,
      CASE WHEN v_correct THEN 10 ELSE 0 END
    );
    PERFORM public.update_weekly_quest_progress_for_answer(
      p_student_id,
      v_correct,
      CASE WHEN v_correct THEN 10 ELSE 0 END
    );
  END IF;

  RETURN json_build_object(
    'status',         CASE WHEN v_correct THEN 'correct' ELSE 'incorrect' END,
    'correct_answer', v_instance.correct_answer
  );

END;
$function$;

-- ── 2. Gentagelser: MC-facit følger det nuværende content.correct ved genåbning ───────────
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

  -- Repeats are a last resort, verified against the server-derived scope.
  IF EXISTS (
    SELECT 1
    FROM public.questions q
    WHERE q.is_active
      AND (p_grade IS NULL OR q.target_grade IS NULL OR q.target_grade <= p_grade)
      AND (p_domains IS NULL OR q.learning_objective = ANY(p_domains))
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
  ORDER BY
    (qi.was_correct IS NOT FALSE),          -- false sorts first
    qi.answered_at ASC NULLS FIRST
  LIMIT 1;

  IF v_instance_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- MC: the key follows the question's current content.correct on reopen, exactly as a new instance
  -- from get-next-question gets it, so a corrected text is never graded against an old key. Other
  -- formats keep their key (a Match par key is drawn per instance).
  UPDATE public.question_instances qi
  SET answered       = false,
      user_answer    = NULL,
      was_correct    = NULL,
      answered_at    = NULL,
      next_review_at = now(),
      repeat_count   = qi.repeat_count + 1,
      correct_answer = CASE
                         WHEN q.answer_format = 'mc' AND jsonb_typeof(q.content -> 'correct') = 'string'
                           THEN q.content ->> 'correct'
                         ELSE qi.correct_answer
                       END
  FROM public.questions q
  WHERE qi.id = v_instance_id
    AND qi.student_id = p_student_id
    AND qi.answered = true                    -- lost race: another call already reopened it
    AND q.id = qi.question_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

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
  -- question may remain (the same rule the candidate window uses).
  IF EXISTS (
    SELECT 1
    FROM public.questions q
    WHERE q.is_active
      AND (p_grade IS NULL OR q.target_grade IS NULL OR q.target_grade <= p_grade)
      AND (p_domains IS NULL OR q.learning_objective = ANY(p_domains))
      AND public.question_is_servable(q.answer_format, q.answer_type, q.content)
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
  ORDER BY
    (qi.was_correct IS NOT FALSE),          -- false sorts first
    qi.answered_at ASC NULLS FIRST
  LIMIT 1;

  IF v_instance_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- MC: the key follows the question's current content.correct on reopen, exactly as a new instance
  -- from get-next-question gets it, so a corrected text is never graded against an old key. Other
  -- formats keep their key (a Match par key is drawn per instance).
  UPDATE public.question_instances qi
  SET answered       = false,
      user_answer    = NULL,
      was_correct    = NULL,
      answered_at    = NULL,
      next_review_at = now(),
      repeat_count   = qi.repeat_count + 1,
      correct_answer = CASE
                         WHEN q.answer_format = 'mc' AND jsonb_typeof(q.content -> 'correct') = 'string'
                           THEN q.content ->> 'correct'
                         ELSE qi.correct_answer
                       END
  FROM public.questions q
  WHERE qi.id = v_instance_id
    AND qi.student_id = p_student_id
    AND qi.answered = true                    -- lost race: another call already reopened it
    AND q.id = qi.question_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

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

  -- Repeats are a last resort: no question the level engine could still serve may remain.
  IF EXISTS (
    SELECT 1
    FROM public.questions q
    WHERE q.is_active
      AND q.difficulty_level IS NOT NULL
      AND q.learning_objective = ANY (p_domains)
      AND public.question_is_servable(q.answer_format, q.answer_type, q.content)
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
  ORDER BY
    (qi.was_correct IS NOT FALSE),
    qi.answered_at ASC NULLS FIRST
  LIMIT 1;

  IF v_instance_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- MC: the key follows the question's current content.correct on reopen, exactly as a new instance
  -- from get-next-question gets it, so a corrected text is never graded against an old key. Other
  -- formats keep their key (a Match par key is drawn per instance).
  UPDATE public.question_instances qi
  SET answered       = false,
      user_answer    = NULL,
      was_correct    = NULL,
      answered_at    = NULL,
      next_review_at = now(),
      repeat_count   = qi.repeat_count + 1,
      correct_answer = CASE
                         WHEN q.answer_format = 'mc' AND jsonb_typeof(q.content -> 'correct') = 'string'
                           THEN q.content ->> 'correct'
                         ELSE qi.correct_answer
                       END
  FROM public.questions q
  WHERE qi.id = v_instance_id
    AND qi.student_id = p_student_id
    AND qi.answered = true
    AND q.id = qi.question_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN v_instance_id;
END;
$$;

-- ── 3. De ti spørgsmål og facit på de åbne besvarelser ──────────────────────
-- Alt kontrolleres, før der skrives. Enhver afvigelse fra preflight afbryder hele migrationen,
-- også funktionsændringerne ovenfor (én transaktion).
DO $mc_length_cue$
DECLARE
  patches CONSTANT jsonb := $patches$
[{"question_before":"Hvad betød det lutherske princip om frelse ved tro alene?","objective":"reformation_monarchy","grade":7,"band":1,"before_hash":"573cb2c85c85d11f8692f2707a6bf1fb","after_hash":"b29c9900792e9c0c50bc4cad1f4969d9","before_metadata_hash":"a1d7e03f3ecb72e48fc79f40106f4b44","after_metadata_hash":"cbfa64948069e78ba8d857abd500edc9","correct_before":"At mennesket frelstes af sin tro på Gud og ikke ved at kobe afladsbreve eller gøre gode gerninger","question_after":"Hvad betød det lutherske princip om frelse ved tro alene?","options_after":["At man blev frelst ved tro på Gud, ikke ved gode gerninger","At kun præster og munke kunne opnå Guds frelse efter døden","At man skulle på pilgrimsrejse til Rom for at blive frelst","At man blev frelst ved at betale en afgift til kirken"],"correct_after":"At man blev frelst ved tro på Gud, ikke ved gode gerninger","aliases_before":["At mennesket frelstes af sin tro paa Gud og ikke ved at kobe afladsbreve eller goere gode gerninger","At mennesket frelstes af sin tro på Gud og ikke ved at kobe afladsbreve eller gøre gode gerninger"],"aliases_after":["At mennesket frelstes af sin tro paa Gud og ikke ved at kobe afladsbreve eller goere gode gerninger","At mennesket frelstes af sin tro på Gud og ikke ved at kobe afladsbreve eller gøre gode gerninger","At man blev frelst ved tro på Gud, ikke ved gode gerninger"],"open_keys":{}},
{"question_before":"Hvad brugte fabriksejere børn til under industrialiseringen?","objective":"industrialisation","grade":7,"band":1,"before_hash":"c143f44266645a9f4ca7ad8d1b3b5347","after_hash":"7ec6743a79f486bb0de3fe86937ed7f2","before_metadata_hash":"b3307e81e637aec76ba0f6e8f1516831","after_metadata_hash":"3e431b14188ac1b35099fad3014af1fa","correct_before":"Børn arbejdede i miner og fabrikker fordi de var billigere end voksne og kunne krybe ind i smalle tunneler","question_after":"Hvorfor blev børn brugt som arbejdskraft i miner og fabrikker under industrialiseringen?","options_after":["Fordi de fik lav løn og kunne komme ind på trange steder","Fordi loven krævede, at alle børn skulle have et arbejde","Fordi børn var stærkere og mere udholdende end voksne","Fordi fabriksejerne ville give børnene en god uddannelse"],"correct_after":"Fordi de fik lav løn og kunne komme ind på trange steder","aliases_before":null,"aliases_after":["Børn arbejdede i miner og fabrikker fordi de var billigere end voksne og kunne krybe ind i smalle tunneler","Fordi de fik lav løn og kunne komme ind på trange steder"],"open_keys":{}},
{"question_before":"Hvad er Bronzealderen opkaldt efter?","objective":"prehistoric_denmark","grade":3,"band":1,"before_hash":"75d3123ada653d921c622572d180d63a","after_hash":"49210230c206c9ddd1a1fade47763bc4","before_metadata_hash":"9b3e6e8e8056c30e17de29bc617be454","after_metadata_hash":"4ed1bebf25f7983d87967370866fcd23","correct_before":"Et metal der hedder bronze lavet af kobber og tin blandet sammen","question_after":"Hvad er Bronzealderen opkaldt efter?","options_after":["Metallet bronze, som laves af kobber og tin","En berømt høvding, som folk kaldte Bronze","En gammel by i Danmark, som engang hed Bronze","Den brune farve, som mange ting havde dengang"],"correct_after":"Metallet bronze, som laves af kobber og tin","aliases_before":null,"aliases_after":["Et metal der hedder bronze lavet af kobber og tin blandet sammen","Metallet bronze, som laves af kobber og tin"],"open_keys":{}},
{"question_before":"Hvad er en ret — og hvad er en pligt — i et demokrati?","objective":"democracy_power","grade":7,"band":3,"before_hash":"fb2d963800453267568a41735e6c639d","after_hash":"27adb1f9b424408343e0fea05ded5f7b","before_metadata_hash":"e6bee8a1a24a47c709a928c2b3884b91","after_metadata_hash":"c4531f5e4aa61e114ae7e91ca981c255","correct_before":"En rettighed er noget du kræver for dig selv — en pligt er noget du skylder samfundet","question_after":"Hvad er en ret — og hvad er en pligt — i et demokrati?","options_after":["En ret har du krav på – en pligt er noget, du er forpligtet til","En ret er noget, du er forpligtet til – en pligt har du krav på","En ret skal du altid betale for – en pligt er helt frivillig","Der er ingen forskel – begge dele er noget, du selv vælger"],"correct_after":"En ret har du krav på – en pligt er noget, du er forpligtet til","aliases_before":null,"aliases_after":["En rettighed er noget du kræver for dig selv — en pligt er noget du skylder samfundet","En ret har du krav på – en pligt er noget, du er forpligtet til"],"open_keys":{}},
{"question_before":"Hvad er Grundloven?","objective":"democracy_power","grade":7,"band":1,"before_hash":"5c8c28bda0dc3b40185bbeb98970b96d","after_hash":"9b418b5c821800be24845a6b80cf5cc9","before_metadata_hash":"5d93c9a9cb6667b67cd71b876b23ff78","after_metadata_hash":"20d121682bee27924571013fdc9d8b83","correct_before":"Danmarks vigtigste lov der sætter rammerne for statens opbygning og borgernes grundlæggende rettigheder","question_after":"Hvad er Grundloven?","options_after":["Danmarks øverste lov om statens styre og borgernes rettigheder","En gammel lov fra enevælden, som slet ikke længere gælder i dag","En aftale mellem Danmark og EU om fælles regler for alle lande","Den lov, der fastsætter, hvor meget skat alle borgere skal betale"],"correct_after":"Danmarks øverste lov om statens styre og borgernes rettigheder","aliases_before":null,"aliases_after":["Danmarks vigtigste lov der sætter rammerne for statens opbygning og borgernes grundlæggende rettigheder","Danmarks øverste lov om statens styre og borgernes rettigheder"],"open_keys":{"Danmarks vigtigste lov der sætter rammerne for statens opbygning og borgernes grundlæggende rettigheder":1}},
{"question_before":"Hvad lavede folk redskaber af i Stenalderen?","objective":"prehistoric_denmark","grade":3,"band":1,"before_hash":"22c5bbd9b25607a866aa5a6bc46b2d86","after_hash":"7d2dcf201c6f649b8ca062a1384242ec","before_metadata_hash":"2d911969b147e415de40296649ed9109","after_metadata_hash":"373903842be83441b14fc97efedf0ce5","correct_before":"Flint en hard sten man kan slå skarpe kanter af","question_after":"Hvilken slags sten brugte folk i Stenalderen til skarpe redskaber som økser og knive?","options_after":["Flint","Kridt","Rav","Marmor"],"correct_after":"Flint","aliases_before":["Flint en hard sten man kan slaa skarpe kanter af","Flint en hard sten man kan slå skarpe kanter af"],"aliases_after":["Flint en hard sten man kan slaa skarpe kanter af","Flint en hard sten man kan slå skarpe kanter af","Flint"],"open_keys":{}},
{"question_before":"Hvad spiste folk i den tidlige Stenalder?","objective":"prehistoric_denmark","grade":3,"band":1,"before_hash":"e841aacd5c22ab5a5e8b31141d7f8064","after_hash":"df6f4024d2a8bd72e839e40b3a2249d0","before_metadata_hash":"2c79092b95a9218f8bead241c92dc352","after_metadata_hash":"7b4103bf9eeb4d19b1279fe16b6f71cf","correct_before":"Dyr de jagede og bær og svampe de samlede","question_after":"Hvad spiste folk i den tidlige Stenalder?","options_after":["Vildt, fisk, nødder og bær fra naturen","Korn og grøntsager fra deres egne marker","Kød og mælk fra deres egne køer og grise","Brød og kager fra deres egne bagerovne"],"correct_after":"Vildt, fisk, nødder og bær fra naturen","aliases_before":["Dyr de jagede og baer og svampe de samlede","Dyr de jagede og bær og svampe de samlede"],"aliases_after":["Dyr de jagede og baer og svampe de samlede","Dyr de jagede og bær og svampe de samlede","Vildt, fisk, nødder og bær fra naturen"],"open_keys":{}},
{"question_before":"Hvad var formålet med propaganda under Første Verdenskrig?","objective":"world_war_1","grade":7,"band":2,"before_hash":"8f8102e4ef1272d5355901aaf58214c6","after_hash":"077adf17b9c933f56e7da35c80f5f0c5","before_metadata_hash":"45b7234d894dfb7a02abac869e4e44fe","after_metadata_hash":"c7558e5bd0f5f5a3d1d26d2423eeb918","correct_before":"At holde befolkningens moral oppe, rekruttere soldater og fremstille fjenden som ond","question_after":"Hvad var formålet med propaganda under Første Verdenskrig?","options_after":["At styrke moralen, hverve soldater og vise fjenden som ond","At give befolkningen objektiv information om krigens forløb","At koordinere militære operationer mellem de allierede lande","At sende beskeder og ordrer til soldaterne ved fronten"],"correct_after":"At styrke moralen, hverve soldater og vise fjenden som ond","aliases_before":null,"aliases_after":["At holde befolkningens moral oppe, rekruttere soldater og fremstille fjenden som ond","At styrke moralen, hverve soldater og vise fjenden som ond"],"open_keys":{"At holde befolkningens moral oppe, rekruttere soldater og fremstille fjenden som ond":2}},
{"question_before":"Hvad var Reformationen?","objective":"reformation_monarchy","grade":6,"band":1,"before_hash":"8076d964c68e82dce2e970e2707fe5d4","after_hash":"7b2d40729080df103f0de7a41a603c20","before_metadata_hash":"bfff18b230965cd0d3d7527eca45b38d","after_metadata_hash":"8b1c44272ab0db4d5c8094962db9c286","correct_before":"En religiøs og politisk bevægelse der brød med den katolske kirke og skabte den protestantiske kirke","question_after":"Hvad var Reformationen?","options_after":["Et religiøst og politisk opgør med den katolske kirke","En reform af den katolske kirke, som paven selv godkendte","En fredsaftale mellem alle de katolske lande i hele Europa","En bevægelse, der ville afskaffe al religion i hele Europa"],"correct_after":"Et religiøst og politisk opgør med den katolske kirke","aliases_before":["En religioes og politisk bevaegelse der brued med den katolske kirke og skabte den protestantiske kirke","En religiøs og politisk bevægelse der brød med den katolske kirke og skabte den protestantiske kirke"],"aliases_after":["En religioes og politisk bevaegelse der brued med den katolske kirke og skabte den protestantiske kirke","En religiøs og politisk bevægelse der brød med den katolske kirke og skabte den protestantiske kirke","Et religiøst og politisk opgør med den katolske kirke"],"open_keys":{}},
{"question_before":"Hvorfor er regelmæssige valg vigtigt for demokratiet?","objective":"democracy_power","grade":7,"band":2,"before_hash":"65c1e9cfd2cbd101c63631f163c041e9","after_hash":"529e355a24e46c6f7be4fb8c94fdc28d","before_metadata_hash":"0e588e050a9107b7ad018af8371838e4","after_metadata_hash":"b7c46f8f59b12dcf1aa48e7927c903d1","correct_before":"For at befolkningen regelmæssigt kan skifte ud eller beholde dem der bestemmer","question_after":"Hvorfor er regelmæssige valg vigtige for demokratiet?","options_after":["Så borgerne kan beholde eller skifte dem, der bestemmer","Så den siddende regering altid kan blive ved magten","Så alle partier får lige mange pladser i Folketinget","Så landets dommere kan blive udskiftet med jævne mellemrum"],"correct_after":"Så borgerne kan beholde eller skifte dem, der bestemmer","aliases_before":null,"aliases_after":["For at befolkningen regelmæssigt kan skifte ud eller beholde dem der bestemmer","Så borgerne kan beholde eller skifte dem, der bestemmer"],"open_keys":{"For at befolkningen regelmæssigt kan skifte ud eller beholde dem der bestemmer":1}}]
$patches$;
  p             jsonb;
  ids           uuid[] := '{}';
  hits          integer;
  target        public.questions%ROWTYPE;
  n_todo        integer := 0;
  n_done        integer := 0;
  i             integer;
  k             text;
  expected_open integer;
  open_total    integer;
  rows_done     integer;
  new_content   jsonb;
  new_metadata  jsonb;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  -- Korte skrivelåse: antallet af åbne besvarelser og deres facit kan ikke ændre sig mellem
  -- kontrol og skrivning, og ingen ny besvarelse kan oprettes med det gamle facit imens.
  LOCK TABLE public.questions IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.question_instances IN SHARE ROW EXCLUSIVE MODE;

  IF jsonb_array_length(patches) <> 10 THEN
    RAISE EXCEPTION 'MC_LENGTH_CUE: forventede 10 spørgsmål, fik %', jsonb_array_length(patches);
  END IF;

  -- 3a. Preflight: find og kontrollér alle ti, før der skrives noget.
  FOR i IN 0 .. jsonb_array_length(patches) - 1 LOOP
    p := patches -> i;

    SELECT count(*) INTO hits FROM public.questions q
    WHERE q.content ->> 'question' IN (p ->> 'question_before', p ->> 'question_after');
    IF hits <> 1 THEN
      RAISE EXCEPTION 'MC_LENGTH_CUE: forventede præcis ét spørgsmål "%", fandt %', p ->> 'question_before', hits;
    END IF;
    SELECT * INTO target FROM public.questions q
    WHERE q.content ->> 'question' IN (p ->> 'question_before', p ->> 'question_after')
    FOR UPDATE;

    IF target.answer_format IS DISTINCT FROM 'mc'
       OR target.is_active IS NOT TRUE
       OR target.learning_objective IS DISTINCT FROM p ->> 'objective'
       OR target.target_grade IS DISTINCT FROM (p ->> 'grade')::smallint
       OR target.difficulty_band IS DISTINCT FROM (p ->> 'band')::smallint THEN
      RAISE EXCEPTION 'MC_LENGTH_CUE: "%" er ikke det forventede aktive mc-spørgsmål', p ->> 'question_before';
    END IF;

    IF md5(target.content::text) = p ->> 'after_hash'
       AND md5(target.metadata::text) = p ->> 'after_metadata_hash' THEN
      n_done := n_done + 1;               -- allerede rettet af denne migration
    ELSIF md5(target.content::text) = p ->> 'before_hash'
       AND md5(target.metadata::text) = p ->> 'before_metadata_hash' THEN
      n_todo := n_todo + 1;

      IF target.content -> 'correct' IS DISTINCT FROM p -> 'correct_before'
         OR (SELECT count(*) FROM jsonb_array_elements(target.content -> 'options') o
             WHERE o = p -> 'correct_before') <> 1 THEN
        RAISE EXCEPTION 'MC_LENGTH_CUE: facit i "%" er ikke den forventede førværdi', p ->> 'question_before';
      END IF;
      -- A question without aliases has none in metadata (SQL NULL); the patch says JSON null.
      IF coalesce(target.metadata -> 'danish_orthography_correct_aliases', 'null'::jsonb) IS DISTINCT FROM (p -> 'aliases_before') THEN
        RAISE EXCEPTION 'MC_LENGTH_CUE: aliaser i "%" er ikke de forventede', p ->> 'question_before';
      END IF;
      IF jsonb_array_length(p -> 'options_after') <> 4
         OR (SELECT count(DISTINCT o) FROM jsonb_array_elements(p -> 'options_after') o) <> 4
         OR (SELECT count(*) FROM jsonb_array_elements(p -> 'options_after') o
             WHERE o = p -> 'correct_after') <> 1 THEN
        RAISE EXCEPTION 'MC_LENGTH_CUE: nye svarmuligheder for "%" er ugyldige', p ->> 'question_before';
      END IF;

      -- Åbne besvarelser: præcis det forventede antal, og hvert gemt facit er et af de opregnede.
      SELECT coalesce(sum(value::integer), 0) INTO expected_open FROM jsonb_each_text(p -> 'open_keys');
      SELECT count(*) INTO open_total FROM public.question_instances qi
      WHERE qi.question_id = target.id AND qi.answered = false;
      IF open_total <> expected_open THEN
        RAISE EXCEPTION 'MC_LENGTH_CUE: "%" har % åbne besvarelser, forventede %', p ->> 'question_before', open_total, expected_open;
      END IF;
      FOR k IN SELECT key FROM jsonb_each_text(p -> 'open_keys') LOOP
        SELECT count(*) INTO hits FROM public.question_instances qi
        WHERE qi.question_id = target.id AND qi.answered = false AND qi.correct_answer = k;
        IF hits <> (p -> 'open_keys' ->> k)::integer THEN
          RAISE EXCEPTION 'MC_LENGTH_CUE: åbne facit for "%" afviger fra preflight', p ->> 'question_before';
        END IF;
      END LOOP;
    ELSE
      RAISE EXCEPTION 'MC_LENGTH_CUE: indholdet i "%" er ændret siden preflight; kræver ny gennemgang', p ->> 'question_before';
    END IF;

    ids := ids || target.id;
  END LOOP;

  IF n_done > 0 AND n_todo > 0 THEN
    RAISE EXCEPTION 'MC_LENGTH_CUE: blandet tilstand (% rettet, % ikke); kræver ny gennemgang', n_done, n_todo;
  END IF;
  IF n_todo = 0 THEN
    RETURN;                               -- alle ti er allerede rettet: intet at gøre
  END IF;

  -- 3b. Skriv: spørgsmålet og facit på dets åbne besvarelser, i samme transaktion.
  FOR i IN 0 .. jsonb_array_length(patches) - 1 LOOP
    p := patches -> i;
    SELECT * INTO target FROM public.questions WHERE id = ids[i + 1];

    new_content := target.content || jsonb_build_object(
      'question', p -> 'question_after',
      'options',  p -> 'options_after',
      'correct',  p -> 'correct_after');
    new_metadata := target.metadata || jsonb_build_object(
      'danish_orthography_correct_aliases', p -> 'aliases_after');
    IF md5(new_content::text) IS DISTINCT FROM p ->> 'after_hash'
       OR md5(new_metadata::text) IS DISTINCT FROM p ->> 'after_metadata_hash' THEN
      RAISE EXCEPTION 'MC_LENGTH_CUE: uventet resultat for "%"', p ->> 'question_before';
    END IF;

    UPDATE public.questions SET content = new_content, metadata = new_metadata WHERE id = target.id;

    UPDATE public.question_instances qi
    SET correct_answer = p ->> 'correct_after'
    WHERE qi.question_id = target.id
      AND qi.answered = false
      AND qi.correct_answer = p ->> 'correct_before';
    GET DIAGNOSTICS rows_done = ROW_COUNT;
    SELECT coalesce(sum(value::integer), 0) INTO expected_open FROM jsonb_each_text(p -> 'open_keys');
    IF rows_done <> expected_open THEN
      RAISE EXCEPTION 'MC_LENGTH_CUE: % åbne facit opdateret for "%", forventede %', rows_done, p ->> 'question_before', expected_open;
    END IF;
  END LOOP;
END
$mc_length_cue$;
