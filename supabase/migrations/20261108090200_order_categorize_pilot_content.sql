-- ============================================================================
-- D-362 — pilotindhold for F-04 Rækkefølge (answer_format 'order') og F-05 Kategorisering
-- (answer_format 'categorize') i historie: Grundloven 1849 og demokratiet i Danmark.
-- KUN DATA. IKKE ANVENDT. INAKTIVT.
--
-- KAN IKKE ANVENDES FØR 20261108090000_order_categorize_activation.sql ER ANVENDT. Produktionens
-- questions_answer_format_check og content_valid_check afviser i dag rækker med answer_format 'order'
-- og 'categorize'. Guarden herunder stopper filen med en klar besked, hvis aktiveringen mangler.
-- Aktiveringen har selv forudsætninger (Q-21: process-event fra main; get-next-question fra den commit,
-- der indeholder D-362). Rækkefølge og GO'er: docs/decisions/D-362.md.
--
-- Hvad: 4 rækkefølge-opgaver og 4 kategoriseringsopgaver, learning_objective 'pilot_d362' (fagligt
-- revolutions_democracy, som metadata.domain angiver), 7. klasse, sværhedsniveau 5.850–6.800 på skalaen
-- 1–10.000 (target_grade/difficulty_band er cellen i docs/difficulty-scale-design.md §4.1).
-- ADGANG: learning_objective er et eget mål, fordi pilotens adgang skal være: kun en elev, hvis
-- active_domains indeholder pilot_d362. get-next-question bygger domænerne på serveren (scope.ts), og alle
-- udvælgelses-RPC'er filtrerer på learning_objective = ANY(p_domains). Eleven kan ikke selv skrive
-- active_domains. Kendt rest: elevens lærer kan tildele pilot_d362 via set_student_domains, når rækkerne er
-- aktive (docs/decisions/D-362.md). Tests: tests/unit/task-forms-pilot-scope.test.mjs. Kontrakterne: supabase/functions/_shared/order-items.ts og
-- categorize.ts. Facit er det FORFATTEDE: rækkefølgen af content.items (første element først) og hvert
-- elements content.items[i].category. Kun præsentationen blandes, pr. instans, af serveren.
-- content.correct er '-': det kræves af constraints (auto_requires_correct, content_valid_check), men
-- læses aldrig for de to formater; nøglen trækkes pr. instans og gemmes i question_instances.correct_answer.
-- Én række bærer også et stimulus (F-07): § 35 over kategoriseringen.
-- Faglig oversigt til ejerens review: docs/operations/task-forms-pilot-content-review.md.
--
-- INAKTIV: is_active = false er skrevet fast i SQL'en herunder (ikke i data), så ingen række kan
-- serveres, før en SEPARAT, ejergodkendt aktivering sætter is_active = true — én type ad gangen.
-- MARKØR: metadata.pilot = 'D-362' og metadata.pilot_form = 'order' eller 'categorize'.
--
-- ANVENDELSE: kun via apply_migration med særskilt ejerautorisation for netop denne fil (D-110,
-- docs/migration-workflow-policy.md). Aldrig `supabase db push`. Listet i NOT_IN_PRODUCTION
-- (tests/isolated/schema/replay-plan.mjs). En genkørsel fejler højlydt på unique_question_text.
--
-- FJERNELSE (mens rækkerne er inaktive og ingen elev har svaret):
--   DELETE FROM public.questions
--   WHERE metadata->>'pilot' = 'D-362' AND metadata->>'pilot_form' IN ('order', 'categorize')
--     AND is_active = false;
-- Har rækkerne været aktive, sættes de i stedet inaktive (is_active = false), så elevernes
-- svarhistorik bevares. Rækkerne skal være væk, før aktiveringsmigrationen eventuelt rulles tilbage.
--
-- Tests: tests/unit/task-forms-pilot-content.test.mjs.
-- ============================================================================

DO $d362_guard$
DECLARE
  v_fmt text;
  v_cnt text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_fmt FROM pg_constraint c
  WHERE c.conrelid = 'public.questions'::regclass AND c.conname = 'questions_answer_format_check';
  SELECT pg_get_constraintdef(c.oid) INTO v_cnt FROM pg_constraint c
  WHERE c.conrelid = 'public.questions'::regclass AND c.conname = 'content_valid_check';
  IF to_regprocedure('public.order_items_content_is_valid(jsonb)') IS NULL
     OR to_regprocedure('public.categorize_content_is_valid(jsonb)') IS NULL
     OR coalesce(v_fmt, '') NOT LIKE '%order_items_content_is_valid%'
     OR coalesce(v_fmt, '') NOT LIKE '%categorize_content_is_valid%'
     OR coalesce(v_cnt, '') NOT LIKE '%order_items_content_is_valid%'
     OR coalesce(v_cnt, '') NOT LIKE '%categorize_content_is_valid%' THEN
    RAISE EXCEPTION 'D-362: 20261108090000_order_categorize_activation.sql is not applied; this content cannot be stored yet. Stop.';
  END IF;
END
$d362_guard$;

INSERT INTO public.questions (type, content, answer_format, answer_type, metadata, difficulty, question_type,
                              is_active, learning_objective, target_grade, difficulty_band, difficulty_level)
SELECT
  r->>'answer_format', r->'content', r->>'answer_format', 'short', r->'metadata',
  (r->>'difficulty_band')::int, 'auto',
  false,
  'pilot_d362', 7, (r->>'difficulty_band')::smallint, (r->>'difficulty_level')::int
FROM jsonb_array_elements($pilot$[
{"answer_format":"order","difficulty_band":2,"difficulty_level":6050,
 "metadata":{"pilot":"D-362","pilot_form":"order","pilot_phase":"forståelsestjek","domain":"revolutions_democracy","concepts":["kronologi","enevælde","Grundloven 1849","kvinders valgret"],"cognitive_skill":"comprehension","difficulty_type":"factual","challenge_role":"reinforcement","insight_type":"conceptual_bridge"},
 "content":{
  "question":"Sæt begivenhederne fra enevælden til kvindernes valgret i den rækkefølge, de skete.",
  "items":["Enevælden indføres","Stavnsbåndet ophæves","Grundloven underskrives","Kvinder får valgret til Rigsdagen"],
  "sequence":"chronological",
  "correct":"-",
  "review_text":"Enevælden blev indført i 1660, stavnsbåndet blev ophævet i 1788, Grundloven blev underskrevet i 1849, og kvinder fik valgret til Rigsdagen i 1915. Rækkefølgen viser, hvornår tingene skete. Den siger ikke i sig selv, at den ene begivenhed var årsag til den næste."}},
{"answer_format":"order","difficulty_band":3,"difficulty_level":6350,
 "metadata":{"pilot":"D-362","pilot_form":"order","pilot_phase":"selvstændig anvendelse","domain":"revolutions_democracy","concepts":["kronologi","Martsdagene","Den Grundlovgivende Rigsforsamling","Grundloven 1849"],"cognitive_skill":"recall","difficulty_type":"factual","challenge_role":"challenge","insight_type":"conceptual_bridge"},
 "content":{
  "question":"Sæt begivenhederne i 1848–1849 i den rækkefølge, de skete.",
  "items":["Frederik 7. bliver konge","Borgere går i optog til Christiansborg (Martsdagene)","Den Grundlovgivende Rigsforsamling træder sammen","Grundloven underskrives"],
  "sequence":"chronological",
  "correct":"-",
  "review_text":"Frederik 7. blev konge i januar 1848. Den 21. marts 1848 gik borgere i optog til Christiansborg med krav om en ny regering (Martsdagene). I oktober 1848 trådte Den Grundlovgivende Rigsforsamling sammen for at forhandle om en grundlov. Den 5. juni 1849 underskrev Frederik 7. Grundloven."}},
{"answer_format":"order","difficulty_band":4,"difficulty_level":6650,
 "metadata":{"pilot":"D-362","pilot_form":"order","pilot_phase":"selvstændig anvendelse","domain":"revolutions_democracy","concepts":["lovgivning","Folketinget","demokrati i Danmark"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","challenge_role":"challenge","insight_type":"concept_clarification"},
 "content":{
  "question":"Sådan bliver et lovforslag til lov i Danmark i dag. Sæt trinene i den rigtige rækkefølge.",
  "items":["En minister fremsætter lovforslaget i Folketinget","Partiernes ordførere debatterer forslagets formål i salen","Et udvalg stiller spørgsmål og skriver en betænkning","Folketinget stemmer om udvalgets ændringsforslag","Folketinget stemmer om hele lovforslaget og vedtager det","Kongen underskriver loven, og den kundgøres i Lovtidende"],
  "sequence":"process",
  "correct":"-",
  "review_text":"Grundloven kræver, at et lovforslag behandles tre gange i Folketinget (§ 41). Oftest fremsætter en minister forslaget. Ved 1. behandling debatterer partiernes ordførere forslagets formål. Derefter undersøger et udvalg forslaget, stiller spørgsmål til ministeren og skriver en betænkning, ofte med ændringsforslag. Ved 2. behandling stemmer Folketinget om ændringsforslagene. Ved 3. behandling stemmer Folketinget om hele lovforslaget. Er det vedtaget, stadfæster kongen loven med sin underskrift sammen med en minister, og loven kundgøres i Lovtidende."}},
{"answer_format":"order","difficulty_band":4,"difficulty_level":6750,
 "metadata":{"pilot":"D-362","pilot_form":"order","pilot_phase":"selvstændig anvendelse","domain":"revolutions_democracy","concepts":["kronologi","systemskiftet","grundlovsændringer","valgret"],"cognitive_skill":"recall","difficulty_type":"factual","challenge_role":"deep_challenge","insight_type":"conceptual_bridge"},
 "content":{
  "question":"Sæt begivenhederne i demokratiets historie fra 1849 til i dag i den rækkefølge, de skete.",
  "items":["Grundloven underskrives","Systemskiftet","Kvinder får valgret til Rigsdagen","Landstinget afskaffes","Valgretsalderen sænkes til 18 år"],
  "sequence":"chronological",
  "correct":"-",
  "review_text":"Grundloven blev underskrevet i 1849. Ved systemskiftet i 1901 dannede Venstre, der havde flertal i Folketinget, for første gang regering. Kvinder fik valgret til Rigsdagen i 1915. Med grundloven af 1953 blev Landstinget afskaffet, og Folketinget blev det eneste ting. I 1978 blev valgretsalderen sænket til 18 år."}},
{"answer_format":"categorize","difficulty_band":1,"difficulty_level":5850,
 "metadata":{"pilot":"D-362","pilot_form":"categorize","pilot_phase":"introduktion","pilot_practice":true,"domain":"revolutions_democracy","concepts":["enevælde","folkestyre"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","challenge_role":"entry_level","insight_type":"concept_clarification"},
 "content":{
  "question":"Hvilke kendetegn passer på enevælde, og hvilke passer på folkestyre?",
  "categories":["Enevælde","Folkestyre"],
  "items":[
   {"text":"Én person har al magten","category":"Enevælde"},
   {"text":"Kongens ord er lov","category":"Enevælde"},
   {"text":"Vælgerne stemmer ved valg","category":"Folkestyre"},
   {"text":"Magten er delt mellem flere","category":"Folkestyre"}],
  "correct":"-",
  "review_text":"Under enevælde har én person, kongen, al magten, og det, kongen siger, er lov. I et folkestyre vælger vælgerne ved valg, hvem der skal bestemme, og magten er delt mellem flere."}},
{"answer_format":"categorize","difficulty_band":2,"difficulty_level":6150,
 "metadata":{"pilot":"D-362","pilot_form":"categorize","pilot_phase":"selvstændig anvendelse","domain":"revolutions_democracy","concepts":["valgret","Grundloven 1849","kildeanvendelse"],"cognitive_skill":"application","difficulty_type":"applied","challenge_role":"reinforcement","insight_type":"conceptual_bridge"},
 "content":{
  "question":"Brug § 35. Hvem havde valgret til Folketinget i 1849, og hvem havde ikke? Alle er ustraffede, har indfødsret og har boet samme sted i mange år.",
  "categories":["Valgret","Ingen valgret"],
  "items":[
   {"text":"Gårdmand på 52 år med egen husstand","category":"Valgret"},
   {"text":"Skolelærer på 35 år med eget hjem","category":"Valgret"},
   {"text":"Købmand på 41 år med egen butik og bolig","category":"Valgret"},
   {"text":"Gårdmandens kone på 45 år","category":"Ingen valgret"},
   {"text":"Tjenestekarl på 38 år, der bor hos sin arbejdsgiver","category":"Ingen valgret"},
   {"text":"Smed på 27 år med eget værksted","category":"Ingen valgret"},
   {"text":"Husmand på 60 år, der får hjælp fra fattigvæsenet","category":"Ingen valgret"}],
  "correct":"-",
  "review_text":"Gårdmanden, skolelæreren og købmanden er mænd over 30 med eget hjem, så de havde valgret. Konen havde ikke valgret, for § 35 giver kun mænd valgret. Tjenestekarlen er i privat tjeneste uden egen husstand (a). Smeden er under 30 år. Husmanden får hjælp fra fattigvæsenet (b).",
  "stimulus":{"kind":"source","title":"Danmarks Riges Grundlov, 5. juni 1849, § 35",
   "text":"Valgret til Folkethinget har enhver uberygtet Mand, som har Indfødsret, naar han har fyldt sit 30te Aar, medmindre han:\na) uden at have egen Huusstand staaer i privat Tjenesteforhold;\nb) nyder eller har nydt Understøttelse af Fattigvæsenet, som ikke er enten eftergiven eller tilbagebetalt;\nc) er ude af Raadigheden over sit Bo;\nd) ikke har havt fast Bopæl i eet Aar i den Valgkreds eller den Stad, hvori han opholder sig paa den Tid, Valget foregaaer.\n\nOrdforklaringer: uberygtet = ikke straffet for noget vanærende · Huusstand = eget hjem · Fattigvæsenet = den offentlige hjælp til fattige · Bo = formue og ejendele.",
   "credit":{"source":"Danmarks Riges Grundlov af 5. juni 1849, § 35 (gengivet efter danmarkshistorien.lex.dk). Ordforklaringer: Lærlig","year":"1849","license":"Offentligt domæne"}}}},
{"answer_format":"categorize","difficulty_band":3,"difficulty_level":6400,
 "metadata":{"pilot":"D-362","pilot_form":"categorize","pilot_phase":"selvstændig anvendelse","domain":"revolutions_democracy","concepts":["enevælde","Grundloven 1849","magtens tredeling","frihedsrettigheder"],"cognitive_skill":"application","difficulty_type":"conceptual","challenge_role":"challenge","insight_type":"concept_clarification"},
 "content":{
  "question":"Hvilke kendetegn hører til enevælden, og hvilke til styret efter Grundloven 1849?",
  "categories":["Enevælden (1660–1849)","Efter Grundloven 1849"],
  "items":[
   {"text":"Kongen giver og ophæver love alene","category":"Enevælden (1660–1849)"},
   {"text":"Kongeloven fra 1665 er rigets grundlov","category":"Enevælden (1660–1849)"},
   {"text":"Ingen valgt forsamling vedtager lovene","category":"Enevælden (1660–1849)"},
   {"text":"Rigsdagen og kongen vedtager lovene sammen","category":"Efter Grundloven 1849"},
   {"text":"Borgerne har ret til at danne foreninger uden at få tilladelse først","category":"Efter Grundloven 1849"},
   {"text":"Mænd over 30 med egen husstand kan stemme","category":"Efter Grundloven 1849"}],
  "correct":"-",
  "review_text":"Under enevælden samlede kongen al magten, og Kongeloven fra 1665 gav ham den; stænderforsamlingerne fra 1830'erne kunne kun rådgive. Grundloven af 5. juni 1849 delte magten: Rigsdagen og kongen giver lovene sammen, kongen har den udøvende magt, og domstolene dømmer (§ 2). Grundloven gav også borgerne frihedsrettigheder, fx retten til at danne foreninger uden at få tilladelse først (foreningsfriheden, § 92). Valgretten gjaldt mænd over 30 med egen husstand (§ 35)."}},
{"answer_format":"categorize","difficulty_band":4,"difficulty_level":6800,
 "metadata":{"pilot":"D-362","pilot_form":"categorize","pilot_phase":"selvstændig anvendelse","domain":"revolutions_democracy","concepts":["enevælde","Grundloven 1849","grundloven 1915","valgret"],"cognitive_skill":"analysis","difficulty_type":"factual","challenge_role":"deep_challenge","insight_type":"conceptual_bridge"},
 "content":{
  "question":"Hvornår kom hver ændring? Placér den ved det år, hvor den blev indført.",
  "categories":["Enevælden 1660","Grundloven 1849","Grundloven 1915"],
  "items":[
   {"text":"Kongen får al magt","category":"Enevælden 1660"},
   {"text":"Adelen mister retten til at vælge kongen","category":"Enevælden 1660"},
   {"text":"Mænd over 30 med egen husstand får valgret","category":"Grundloven 1849"},
   {"text":"Kongen og Rigsdagen skal vedtage lovene sammen","category":"Grundloven 1849"},
   {"text":"Rigsdagen får to kamre: Folketinget og Landstinget","category":"Grundloven 1849"},
   {"text":"Kvinder får valgret til Rigsdagen","category":"Grundloven 1915"},
   {"text":"Tjenestefolk uden egen husstand får valgret","category":"Grundloven 1915"}],
  "correct":"-",
  "review_text":"I 1660 blev enevælden indført: kongen fik al magt, og kongemagten blev arvelig, så adelen ikke længere valgte kongen. Grundloven 1849 delte magten, så kongen og Rigsdagen skulle vedtage lovene sammen, gav Rigsdagen to kamre (Folketinget og Landstinget) og gav valgret til mænd over 30 med egen husstand. Grundloven 1915 gav kvinder og tjenestefolk valgret til Rigsdagen."}}
]$pilot$::jsonb) AS r;
