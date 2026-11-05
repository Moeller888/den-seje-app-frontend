-- F-01 Talopgaver: 30 historiespørgsmål med ét entydigt heltalssvar (årstal) — INDSÆTTES INAKTIVE.
--
-- HVAD MIGRATIONEN GØR
-- Indsætter 30 nye spørgsmål med answer_format = 'number', answer_type = 'short', is_active = false,
-- faste UUID'er og metadata.content_batch = 'f01_number_history_v1'. Intet andet ændres: ingen skema-,
-- rettigheds- eller RLS-ændring, ingen eksisterende række røres, og ingen elev kan få spørgsmålene,
-- før en SÆRSKILT aktiveringsbeslutning sætter is_active = true.
--
-- KONVENTIONER (som de øvrige historie-indholdsmigrationer)
--   type 'number_input' (packages/question-contract), question_type 'auto', difficulty = difficulty_band,
--   learning_objective = et eksisterende historiedomæne (get-next-question/scope.ts HISTORY_DOMAINS),
--   target_grade 4-8, difficulty_band 1-4, metadata-mønster som 20261019120002 (domain, concepts,
--   cognitive_skill, difficulty_type, misconception_type, challenge_role, insight_type).
--   difficulty_level = public.difficulty_level_from_grade_band(target_grade, difficulty_band)
--   (migration A's formel, samme værdi som backfillen gav alt eksisterende indhold).
--   content: question, correct (heltal som TEKST, fx "1849"), accepted_answers [correct], review_text.
--   content.correct bliver question_instances.correct_answer (get-next-question normalizeContent) og
--   bedømmes af process_question_attempt med normalize_number_answer (G1, 20261101150000).
--   Hver spørgsmålstekst siger, hvilket format svaret skal have ("Skriv årstallet med fire cifre.").
--
-- SERVERBARHED NÅR AKTIVERET (bevist i tests/unit/f01-number-questions-migration-run.test.mjs)
--   question_is_servable('number','short',content) = true; get_level_questions_for_student vælger dem
--   (aktive, med difficulty_level, i historiedomænerne); get-next-question mapAnswerFormat → "number";
--   js/answer-input.js → rendereren "number".
--
-- SIKKERHEDSNET
-- Én DO-blok = én sætning: alt eller intet. Blokken stopper, hvis et af de faste id'er eller en af
-- spørgsmålsteksterne allerede findes, eller hvis de nødvendige databasefunktioner mangler, og den
-- efterprøver resultatet (30 inaktive, serverbare talrækker med niveau), før den slutter. Kørt to gange
-- fejler anden kørsel højlydt uden at ændre noget.
--
-- TILBAGERULNING (særskilt ejerautorisation): spørgsmålene er inaktive og er aldrig blevet serveret, så
--   DELETE FROM public.questions q
--    WHERE q.metadata ->> 'content_batch' = 'f01_number_history_v1'
--      AND q.is_active = false
--      AND NOT EXISTS (SELECT 1 FROM public.question_instances qi WHERE qi.question_id = q.id);
-- skal slette præcis 30 rækker. Er en række blevet aktiveret/serveret, deaktiveres den i stedet.
--
-- Må KUN anvendes via apply_migration med særskilt ejerautorisation (D-110). Aldrig `supabase db push`.
-- Aktivering kræver en særskilt aktiveringsbeslutning og er IKKE en del af denne migration.

DO $f01_number$
DECLARE
  c_batch CONSTANT text := 'f01_number_history_v1';
  c_rows  CONSTANT jsonb := $rows$[
    {"id":"0b1fada0-a5a0-4344-af88-c4c41a0b35ba","domain":"vikings","grade":4,"band":2,"concept":"vikingetiden",
     "question":"I hvilket år angreb vikinger klostret Lindisfarne i England – det angreb, der ofte regnes som vikingetidens begyndelse? Skriv årstallet med cifre.",
     "correct":"793",
     "review_text":"Vikinger plyndrede klostret på øen Lindisfarne i 793. Angrebet regnes ofte som starten på vikingetiden."},
    {"id":"d84cbbf9-5e2a-4d00-ae38-01b27d371d4f","domain":"vikings","grade":5,"band":3,"concept":"vikingetiden",
     "question":"Vikingetiden sluttede ikke på én dag, men ét år bruges ofte som afslutningen: året, hvor den norske vikingekonge Harald Hårdråde faldt i slaget ved Stamford Bridge i England, og hvor Vilhelm Erobreren kort efter vandt slaget ved Hastings. Hvilket år var det? Skriv årstallet med fire cifre.",
     "correct":"1066",
     "review_text":"I 1066 faldt Harald Hårdråde ved Stamford Bridge, og kort efter erobrede Vilhelm Erobreren England ved Hastings. De store vikingetogter var forbi, og året bruges ofte som vikingetidens afslutning (nogle bøger siger blot ca. 1050)."},
    {"id":"136d57cd-c83a-4161-896b-0c7ab1bbca87","domain":"middle_ages","grade":6,"band":2,"concept":"Kalmarunionen",
     "question":"I hvilket år blev Kalmarunionen dannet, da Erik af Pommern blev kronet som konge over Danmark, Norge og Sverige i Kalmar? Skriv årstallet med fire cifre.",
     "correct":"1397",
     "review_text":"Dronning Margrete 1. samlede de tre nordiske riger. I 1397 blev Erik af Pommern kronet i Kalmar, og unionen blev dannet."},
    {"id":"91ac3214-d67e-4ead-b8ec-5548ae717ba7","domain":"reformation_monarchy","grade":6,"band":2,"concept":"reformationen",
     "question":"Munken Martin Luther mente, at man ikke kunne købe sig til Guds tilgivelse, og offentliggjorde derfor sine teser mod kirkens afladshandel. I hvilket år skete det? Skriv årstallet med fire cifre.",
     "correct":"1517",
     "review_text":"Martin Luther offentliggjorde sine teser mod afladshandlen i 1517. Det regnes som begyndelsen på reformationen i Europa."},
    {"id":"57a52c42-49a5-40f6-9dc2-7a140f9c9861","domain":"reformation_monarchy","grade":6,"band":1,"concept":"reformationen",
     "question":"Martin Luther kritiserede kirkens salg af afladsbreve i en række teser (påstande), som blev starten på reformationen. Hvor mange teser offentliggjorde han? Skriv antallet med cifre.",
     "correct":"95",
     "review_text":"Luther skrev 95 teser, hvor han kritiserede kirkens salg af afladsbreve."},
    {"id":"1e342141-07e9-497b-ad59-5469ba7d7a74","domain":"reformation_monarchy","grade":6,"band":2,"concept":"reformationen",
     "question":"I hvilket år blev reformationen indført i Danmark under Christian 3.? Skriv årstallet med fire cifre.",
     "correct":"1536",
     "review_text":"Efter Grevens Fejde indførte Christian 3. reformationen i 1536. Danmark blev protestantisk (luthersk)."},
    {"id":"75e2e707-8906-46a4-8905-5506758b6ef7","domain":"reformation_monarchy","grade":7,"band":3,"concept":"Roskildefreden",
     "question":"I hvilket år mistede Danmark Skåne, Halland og Blekinge til Sverige ved freden i Roskilde? Skriv årstallet med fire cifre.",
     "correct":"1658",
     "review_text":"Ved Roskildefreden i 1658 måtte Danmark afstå Skåne, Halland og Blekinge til Sverige."},
    {"id":"0ccd509b-c398-4c86-b150-340d5157e8ef","domain":"reformation_monarchy","grade":7,"band":4,"concept":"enevælden",
     "question":"I hvilket år underskrev Frederik 3. Kongeloven, enevældens grundlov? Skriv årstallet med fire cifre.",
     "correct":"1665",
     "review_text":"Enevælden blev indført i 1660. Fem år efter, i 1665, underskrev Frederik 3. Kongeloven, der slog fast, at kongen havde al magt. Loven blev holdt hemmelig og først trykt i 1709."},
    {"id":"19e8db79-8dca-46a1-8f38-820a4f4d7b42","domain":"enlightenment","grade":7,"band":3,"concept":"landboreformerne",
     "question":"Stavnsbåndet bandt unge bondekarle til det gods, hvor de var født. I hvilket år kom forordningen om stavnsbåndets ophævelse, som var en del af landboreformerne? Skriv årstallet med fire cifre.",
     "correct":"1788",
     "review_text":"Stavnsbåndet bandt bondekarle til det gods, de var født på. Forordningen om ophævelsen kom i 1788 som en del af landboreformerne; den gjaldt fuldt ud fra 1800."},
    {"id":"5aec1adf-d242-4e05-9402-d481afdc94fc","domain":"revolutions_democracy","grade":7,"band":1,"concept":"Den Franske Revolution",
     "question":"I hvilket år stormede folket i Paris fængslet Bastillen ved starten af Den Franske Revolution? Skriv årstallet med fire cifre.",
     "correct":"1789",
     "review_text":"Stormen på Bastillen den 14. juli 1789 regnes som starten på Den Franske Revolution."},
    {"id":"24353074-a2f5-4312-be10-4a31e2a3edda","domain":"revolutions_democracy","grade":7,"band":3,"concept":"Englandskrigene",
     "question":"Danmark havde sluttet et forbund om væbnet neutralitet med Rusland, Sverige og Preussen. Storbritannien svarede ved at angribe den danske flåde i Slaget på Reden ud for København. I hvilket år skete det? Skriv årstallet med fire cifre.",
     "correct":"1801",
     "review_text":"Slaget på Reden blev udkæmpet den 2. april 1801. Briterne ville bryde neutralitetsforbundet, som skadede deres handel og krigsførelse mod Frankrig."},
    {"id":"7366ad09-a830-494b-ab8e-b3a982639159","domain":"revolutions_democracy","grade":7,"band":3,"concept":"Englandskrigene",
     "question":"Briterne frygtede, at Napoleon ville tage den danske flåde. Derfor bombarderede de København og sejlede bagefter flåden med til England. I hvilket år skete det? Skriv årstallet med fire cifre.",
     "correct":"1807",
     "review_text":"I september 1807 bombarderede briterne København og tog den danske flåde. Bagefter gik Danmark i forbund med Napoleons Frankrig."},
    {"id":"1a706f09-e3d8-44d8-8f5c-1a0a91049229","domain":"revolutions_democracy","grade":7,"band":4,"concept":"Kielerfreden",
     "question":"Danmark havde stået på Napoleons side og var på den tabende side i krigen. I hvilket år måtte Danmark derfor afstå Norge til Sverige ved freden i Kiel? Skriv årstallet med fire cifre.",
     "correct":"1814",
     "review_text":"Ved Kielerfreden i januar 1814 måtte Danmark afstå Norge til Sverige, fordi Danmark havde været allieret med den tabende Napoleon. Danmark og Norge havde været forenet i over 400 år."},
    {"id":"bc416271-06e6-4934-86d2-15f04cb21a48","domain":"industrialisation","grade":7,"band":3,"concept":"jernbanen",
     "question":"Jernbanen var et af industrialiseringens store fremskridt. I hvilket år åbnede den første jernbane i kongeriget Danmark, mellem København og Roskilde? Skriv årstallet med fire cifre.",
     "correct":"1847",
     "review_text":"Jernbanen mellem København og Roskilde åbnede i 1847. Den var den første jernbane i selve kongeriget Danmark."},
    {"id":"8580a396-13eb-4f72-b62f-51b5ce5729d9","domain":"revolutions_democracy","grade":7,"band":1,"concept":"Grundloven",
     "question":"I hvilket år underskrev Frederik 7. Danmarks første grundlov? Skriv årstallet med fire cifre.",
     "correct":"1849",
     "review_text":"Den 5. juni 1849 underskrev Frederik 7. Grundloven. Enevælden sluttede, og Danmark fik folkestyre."},
    {"id":"2b805de9-64dc-4cc3-aa74-8ee3bde56880","domain":"revolutions_democracy","grade":7,"band":2,"concept":"krigen 1864",
     "question":"I hvilket år tabte Danmark krigen mod Preussen og Østrig, hvor slaget ved Dybbøl blev udkæmpet? Skriv årstallet med fire cifre.",
     "correct":"1864",
     "review_text":"I 1864 tabte Danmark krigen mod Preussen og Østrig. Slaget ved Dybbøl var den 18. april 1864, og Danmark mistede hertugdømmerne."},
    {"id":"b54cb455-1cd0-4698-94b0-dc30f848e9df","domain":"industrialisation","grade":8,"band":4,"concept":"andelsbevægelsen",
     "question":"I et andelsmejeri ejede bønderne mejeriet sammen og delte overskuddet efter, hvor meget mælk de leverede. I hvilket år startede Danmarks første andelsmejeri i Hjedding i Vestjylland? Skriv årstallet med fire cifre.",
     "correct":"1882",
     "review_text":"Det første andelsmejeri startede i Hjedding i 1882. Bønderne ejede mejeriet sammen og delte overskuddet."},
    {"id":"3b98248e-1435-4f97-bc22-0ed6b991f7bf","domain":"democracy_power","grade":7,"band":4,"concept":"systemskiftet",
     "question":"I hvilket år kom systemskiftet, hvor kongen accepterede en regering, der havde flertal i Folketinget? Skriv årstallet med fire cifre.",
     "correct":"1901",
     "review_text":"Ved systemskiftet i 1901 udnævnte Christian 9. en regering fra Venstre, som havde flertal i Folketinget."},
    {"id":"f14c8c34-df88-4854-aece-24683b00bf49","domain":"world_war_1","grade":7,"band":1,"concept":"Første Verdenskrig",
     "question":"Skuddene i Sarajevo, hvor den østrigske tronfølger blev dræbt, udløste en krig mellem Europas stormagter. I hvilket år begyndte Første Verdenskrig? Skriv årstallet med fire cifre.",
     "correct":"1914",
     "review_text":"Første Verdenskrig begyndte i sommeren 1914, efter at den østrigske tronfølger var blevet skudt i Sarajevo."},
    {"id":"68a32a50-24be-4b8a-8cb6-1f5392f878e0","domain":"democracy_power","grade":7,"band":2,"concept":"kvinders valgret",
     "question":"I hvilket år fik danske kvinder stemmeret til Rigsdagen ved en ændring af grundloven? Skriv årstallet med fire cifre.",
     "correct":"1915",
     "review_text":"Grundlovsændringen den 5. juni 1915 gav kvinder stemmeret til Rigsdagen. Ved kommunalvalg havde de fået stemmeret allerede i 1908."},
    {"id":"9ee75260-5ee4-4ef0-9996-3cc3dc5ac45e","domain":"world_war_1","grade":7,"band":2,"concept":"Første Verdenskrig",
     "question":"I hvilket år sluttede kampene i Første Verdenskrig med våbenstilstanden den 11. november? Skriv årstallet med fire cifre.",
     "correct":"1918",
     "review_text":"Våbenstilstanden den 11. november 1918 afsluttede kampene i Første Verdenskrig."},
    {"id":"aec57645-34d3-4906-b3db-ef0a2d9e8caf","domain":"world_war_1","grade":8,"band":2,"concept":"Genforeningen",
     "question":"I hvilket år blev Sønderjylland genforenet med Danmark efter en folkeafstemning? Skriv årstallet med fire cifre.",
     "correct":"1920",
     "review_text":"Efter folkeafstemningerne i 1920 kom Nordslesvig (Sønderjylland) tilbage til Danmark. Det kaldes Genforeningen."},
    {"id":"97ad0124-df8a-41eb-8f24-bfbd4a8613ab","domain":"world_war_2","grade":7,"band":1,"concept":"Anden Verdenskrig",
     "question":"I hvilket år begyndte Anden Verdenskrig med Tysklands angreb på Polen? Skriv årstallet med fire cifre.",
     "correct":"1939",
     "review_text":"Tyskland angreb Polen den 1. september 1939. To dage senere erklærede Storbritannien og Frankrig Tyskland krig."},
    {"id":"0c50d1fc-f78b-46f0-a4c1-845bc46fbe98","domain":"world_war_2","grade":7,"band":1,"concept":"besættelsen",
     "question":"I hvilket år besatte Tyskland Danmark den 9. april? Skriv årstallet med fire cifre.",
     "correct":"1940",
     "review_text":"Tyskland besatte Danmark den 9. april 1940. Besættelsen varede til maj 1945."},
    {"id":"9550e603-06b5-4033-bf48-1db20deda12d","domain":"world_war_2","grade":7,"band":3,"concept":"besættelsen",
     "question":"I hvilket år brød samarbejdspolitikken sammen den 29. august efter Augustoprøret? Skriv årstallet med fire cifre.",
     "correct":"1943",
     "review_text":"Efter strejker og uroligheder i august 1943 gik regeringen af den 29. august 1943, og samarbejdspolitikken brød sammen."},
    {"id":"e182b27d-f49e-427a-9b0c-356794b92128","domain":"world_war_2","grade":7,"band":1,"concept":"befrielsen",
     "question":"I hvilket år blev Danmark befriet den 5. maj? Skriv årstallet med fire cifre.",
     "correct":"1945",
     "review_text":"Om aftenen den 4. maj 1945 kom budskabet om den tyske kapitulation, og den 5. maj 1945 var Danmark befriet. Bornholm var en undtagelse: her overgav tyskerne sig først den 9. maj til sovjetiske tropper."},
    {"id":"9bfef73d-becf-4e63-a383-3366d0cb760a","domain":"cold_war","grade":8,"band":3,"concept":"NATO",
     "question":"Efter besættelsen opgav Danmark sin gamle neutralitetspolitik og søgte sikkerhed hos Vesten under den kolde krig. I hvilket år blev Danmark medlem af forsvarsalliancen NATO? Skriv årstallet med fire cifre.",
     "correct":"1949",
     "review_text":"Danmark var med til at grundlægge NATO i 1949 sammen med blandt andre USA, Storbritannien og Norge. Erfaringen fra 9. april 1940 viste, at neutralitet ikke havde beskyttet landet."},
    {"id":"ac2c4969-75e4-458c-b751-929c2ab66c20","domain":"cold_war","grade":8,"band":3,"concept":"Berlinmuren",
     "question":"Tusindvis af østtyskere flygtede hvert år til Vesten gennem Berlin. I hvilket år byggede Østtyskland derfor Berlinmuren? Skriv årstallet med fire cifre.",
     "correct":"1961",
     "review_text":"Østtyskland byggede Berlinmuren i august 1961 for at stoppe flugten fra øst til vest."},
    {"id":"59841bff-71c3-4f71-9c4d-054f45f7db68","domain":"cold_war","grade":8,"band":2,"concept":"EF",
     "question":"Danskerne stemte ja til EF (i dag EU) ved en folkeafstemning i 1972. I hvilket år blev Danmark så medlem af EF? Skriv årstallet med fire cifre.",
     "correct":"1973",
     "review_text":"Danmarks medlemskab blev vedtaget ved en folkeafstemning i 1972, og den 1. januar 1973 blev Danmark medlem af EF."},
    {"id":"a3d72c9a-049a-4717-95f3-e58b580e9e77","domain":"cold_war","grade":7,"band":2,"concept":"Berlinmuren",
     "question":"Berlinmuren var et symbol på den kolde krigs deling af Europa. I hvilket år faldt Berlinmuren, da grænsen mellem Øst- og Vestberlin blev åbnet? Skriv årstallet med fire cifre.",
     "correct":"1989",
     "review_text":"Berlinmuren faldt den 9. november 1989. Året efter blev Øst- og Vesttyskland genforenet."}
  ]$rows$::jsonb;

  v_n integer;
BEGIN
  -- ── Forudsætninger: stop ved enhver afvigelse ────────────────────────────────────────────────
  IF to_regprocedure('public.difficulty_level_from_grade_band(integer,integer)') IS NULL
     OR to_regprocedure('public.question_is_servable(text,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'F-01: difficulty_level_from_grade_band eller question_is_servable mangler (migration #351/A ikke anvendt)';
  END IF;

  SELECT count(DISTINCT r.id) INTO v_n
    FROM jsonb_to_recordset(c_rows) AS r(id uuid);
  IF v_n <> 30 OR jsonb_array_length(c_rows) <> 30 THEN
    RAISE EXCEPTION 'F-01: forventede 30 unikke rækker i datasættet, fandt %', v_n;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.questions q
     WHERE q.id IN (SELECT r.id FROM jsonb_to_recordset(c_rows) AS r(id uuid))
        OR q.content ->> 'question' IN (SELECT r.question FROM jsonb_to_recordset(c_rows) AS r(question text))
        OR q.metadata ->> 'content_batch' = c_batch
  ) THEN
    RAISE EXCEPTION 'F-01: et af spørgsmålene findes allerede (id, tekst eller batch) — intet ændret';
  END IF;

  -- ── Indsæt 30 inaktive talspørgsmål ─────────────────────────────────────────────────────────
  INSERT INTO public.questions (
    id, type, content, difficulty, is_active, question_type, learning_objective,
    answer_format, answer_type, metadata, target_grade, difficulty_band, difficulty_level
  )
  SELECT
    r.id,
    'number_input',
    jsonb_build_object(
      'question',         r.question,
      'correct',          r.correct,
      'accepted_answers', jsonb_build_array(r.correct),
      'review_text',      r.review_text
    ),
    r.band,
    false,
    'auto',
    r.domain,
    'number',
    'short',
    jsonb_build_object(
      'domain',             r.domain,
      'concepts',           jsonb_build_array('årstal', r.concept),
      'cognitive_skill',    'recall',
      'difficulty_type',    'factual',
      'misconception_type', 'surface_association',
      'challenge_role',     CASE WHEN r.band >= 4 THEN 'challenge' ELSE 'reinforcement' END,
      'insight_type',       CASE WHEN r.band >= 4 THEN 'reframing' ELSE 'conceptual_bridge' END,
      'content_batch',      c_batch
    ),
    r.grade,
    r.band,
    public.difficulty_level_from_grade_band(r.grade, r.band)
  FROM jsonb_to_recordset(c_rows) AS r(
    id uuid, domain text, grade smallint, band smallint, concept text,
    question text, correct text, review_text text
  );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 30 THEN
    RAISE EXCEPTION 'F-01: indsættelsen ramte % rækker, forventet 30', v_n;
  END IF;

  -- ── Efterprøvning ───────────────────────────────────────────────────────────────────────────
  SELECT count(*) INTO v_n
    FROM public.questions q
   WHERE q.metadata ->> 'content_batch' = c_batch
     AND q.is_active = false
     AND q.answer_format = 'number'
     AND q.answer_type = 'short'
     AND q.difficulty_level IS NOT NULL
     AND q.content ->> 'correct' ~ '^[1-9][0-9]*$'
     AND public.question_is_servable(q.answer_format, q.answer_type, q.content);
  IF v_n <> 30 THEN
    RAISE EXCEPTION 'F-01: % af 30 rækker har den forventede slutform', v_n;
  END IF;
END
$f01_number$;
