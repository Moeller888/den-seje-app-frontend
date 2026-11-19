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
-- Tre rækker bærer også et stimulus (F-07): § 35 over kategoriseringen C2 og en fortællende kilde over O2 og O4.
-- Slutrevision 2026-11-19 (stadig uden ejerens faglige godkendelse): O1 (stavnsbåndets ophævelse begynder 1788),
-- O2 (Rigsforsamlingen tilbage i facit, egen kilde, nu forståelsestjek bånd 2), O3 (bro fra 1849), C2 (husmanden),
-- C3 (Kongeloven som enevældens grundlov, kun feedback) og C4 (kategorien "Enevældens indførelse 1660–1661").
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
-- Faglig og didaktisk hovedrevision 2026-11-19 (ejerens GO til LOKAL revision; ejerens faglige godkendelse er
-- IKKE givet): alle 8 rækker er skrevet om (ord, elementer og review_text), O4 har fået en kilde og C2 otte personer.
-- metadata.pilot_skill er tilføjet, fordi rækkerne har samme learning_objective og pilot_phase som S1–S7 og derfor
-- indgår i forløbet pilot_d362, når de aktiveres (course.ts bruger pilot_skill i opsummeringen, ellers "Opgave N").
-- Facit og begrundelser: docs/operations/task-forms-pilot-content-review.md.
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
 "metadata":{"pilot":"D-362","pilot_form":"order","pilot_phase":"forståelsestjek","domain":"revolutions_democracy","concepts":["kronologi","enevælde","stavnsbånd","Grundloven 1849","kvinders valgret"],"cognitive_skill":"comprehension","difficulty_type":"factual","challenge_role":"reinforcement","insight_type":"conceptual_bridge","pilot_skill":"Fire årstal fra 1660 til 1915"},
 "content":{
  "question":"Sæt de fire begivenheder i den rækkefølge, de skete. Start med den ældste.",
  "items":["Enevælden indføres, og kongen får al magt","Ophævelsen af stavnsbåndet begynder","Grundloven underskrives, og kongen må dele magten","Kvinder får valgret til Rigsdagen"],
  "sequence":"chronological",
  "correct":"-",
  "review_text":"Enevælden blev indført i 1660. Stavnsbåndet bandt bondekarle til det gods, hvor de var født. I 1788 blev det besluttet at ophæve det, men det skete gradvist: først fra år 1800 gjaldt friheden alle. Grundloven blev underskrevet i 1849, og kvinder fik valgret til Rigsdagen i 1915. En hjælp næste gang: Grundloven tog magt fra kongen, så den må komme efter enevælden, og kvinders valgret kom først længe efter Grundloven. Rækkefølgen viser kun, hvornår tingene skete. Den viser ikke i sig selv, at den ene begivenhed skabte den næste."}},
{"answer_format":"order","difficulty_band":2,"difficulty_level":6270,
 "metadata":{"pilot":"D-362","pilot_form":"order","pilot_phase":"forståelsestjek","domain":"revolutions_democracy","concepts":["kronologi","Martsdagene","Den Grundlovgivende Rigsforsamling","Grundloven 1849"],"cognitive_skill":"comprehension","difficulty_type":"factual","challenge_role":"reinforcement","insight_type":"conceptual_bridge","pilot_skill":"Vejen til Grundloven 1848–1849"},
 "content":{
  "question":"Læs teksten. Sæt begivenhederne i 1848–1849 i den rækkefølge, de skete. Start med den ældste.",
  "items":["Frederik 7. bliver konge","Martsdagene: borgere kræver en ny regering","Den Grundlovgivende Rigsforsamling træder sammen","Frederik 7. underskriver Grundloven"],
  "sequence":"chronological",
  "correct":"-",
  "review_text":"Frederik 7. blev konge den 20. januar 1848. Den 21. marts 1848 gik borgere i optog til Christiansborg og krævede en ny regering. Det kaldes Martsdagene. Den 23. oktober 1848 trådte Den Grundlovgivende Rigsforsamling sammen for at forhandle om en grundlov. Den 5. juni 1849 underskrev Frederik 7. Grundloven. Teksten fortalte om de fire begivenheder i en anden rækkefølge, så du skulle bruge måned og år. Tjek begge dele: januar og marts 1848 kommer før oktober 1848, og 1849 kommer til sidst.",
  "stimulus":{"kind":"source","title":"Fra enevælde til grundlov",
   "text":"Grundloven: Den 5. juni 1849 underskrev Frederik 7. Danmarks Riges Grundlov. Den begrænsede kongens magt.\n\nRigsforsamlingen: Den Grundlovgivende Rigsforsamling skulle forhandle om en ny grundlov. De fleste medlemmer var valgt, og resten var udpeget af kongen. Den trådte sammen i oktober 1848.\n\nKongen: Frederik 7. blev konge i januar 1848, da hans far, Christian 8., døde.\n\nMartsdagene: I marts 1848 gik borgere i København i optog til Christiansborg og krævede en ny regering. Den nye konge gav efter og udnævnte en ny regering.",
   "credit":{"source":"Lærlig, fortællende tekst. Tidspunkter efter lex.dk (Frederik 7., Den Grundlovgivende Rigsforsamling, Junigrundloven)","year":"2026"}}}},
{"answer_format":"order","difficulty_band":4,"difficulty_level":6650,
 "metadata":{"pilot":"D-362","pilot_form":"order","pilot_phase":"selvstændig anvendelse","domain":"revolutions_democracy","concepts":["lovgivning","Folketinget","demokrati i Danmark"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","challenge_role":"challenge","insight_type":"concept_clarification","pilot_skill":"Sådan bliver en lov til i dag"},
 "content":{
  "question":"I 1849 skulle kongen og Rigsdagen give lovene sammen. Hvordan bliver love til i Danmark i dag? Sæt de typiske trin i den rigtige rækkefølge.",
  "items":["Lovforslaget fremsættes i Folketinget, oftest af en minister","Partiernes ordførere debatterer forslagets formål i salen","Et udvalg stiller spørgsmål og skriver en betænkning","Folketinget stemmer om udvalgets ændringsforslag","Folketinget stemmer om hele lovforslaget og vedtager det","Kongen underskriver loven sammen med en minister, og den kundgøres"],
  "sequence":"process",
  "correct":"-",
  "review_text":"I 1849 gav kongen og Rigsdagen lovene sammen. I dag er det Folketinget, der vedtager lovene, og kongens underskrift gælder kun sammen med en ministers underskrift (§ 14). Grundloven kræver, at et lovforslag behandles tre gange i Folketinget (§ 41). Både regeringen og hvert enkelt folketingsmedlem kan fremsætte lovforslag (§ 21 og § 41), men oftest er det en minister. Ved 1. behandling debatterer partiernes ordførere forslagets formål. Derefter sendes forslaget normalt til et udvalg, som stiller spørgsmål til ministeren og skriver en betænkning, ofte med ændringsforslag. Udvalget står ikke i Grundloven, men er den faste praksis. Ved 2. behandling stemmer Folketinget om ændringsforslagene, og ved 3. behandling stemmer det om hele forslaget. Senest 30 dage efter skal kongen stadfæste loven med sin underskrift (§ 22). Så bliver loven kundgjort, altså offentliggjort i Lovtidende. Et tip: tænk over, hvad hvert trin bygger på. Man kan fx ikke stemme om udvalgets ændringsforslag, før udvalget har lavet dem."}},
{"answer_format":"order","difficulty_band":3,"difficulty_level":6550,
 "metadata":{"pilot":"D-362","pilot_form":"order","pilot_phase":"selvstændig anvendelse","domain":"revolutions_democracy","concepts":["kronologi","systemskiftet","grundlovsændringer","valgret"],"cognitive_skill":"comprehension","difficulty_type":"factual","challenge_role":"challenge","insight_type":"conceptual_bridge","pilot_skill":"Demokratiet efter 1849"},
 "content":{
  "question":"Læs teksten. Sæt de fem ændringer i den rækkefølge, de skete. Start med den ældste.",
  "items":["Grundloven giver en del af mændene valgret","Systemskiftet: for første gang danner flertallet i Folketinget regering","Kvinder og tjenestefolk får valgret til Rigsdagen","Landstinget afskaffes, og Folketinget bliver det eneste ting","Valgretsalderen sænkes til 18 år"],
  "sequence":"chronological",
  "correct":"-",
  "review_text":"Grundloven kom i 1849. Ved systemskiftet i 1901 dannede Venstre, som havde flertal i Folketinget, for første gang regering. I 1915 fik kvinder og tjenestefolk valgret til Rigsdagen. Med grundloven af 1953 blev Landstinget afskaffet, og Folketinget blev det eneste ting. I 1978 blev valgretsalderen sænket til 18 år. Teksten fortalte om valgretten, Rigsdagen og regeringen hver for sig, så du skulle samle årstallene fra alle tre dele. Husk især systemskiftet: siden 1901 har det i praksis været flertallet i Folketinget og ikke kongen alene, der afgør, hvem der kan regere.",
  "stimulus":{"kind":"source","title":"Demokratiet efter 1849",
   "text":"Valgretten: Med Grundloven i 1849 fik en del af mændene valgret. I 1915 fik kvinder og tjenestefolk valgret til Rigsdagen. Valgretsalderen blev sat ned flere gange, og siden 1978 har den været 18 år.\n\nRigsdagen: I 1849 fik Rigsdagen to dele, Folketinget og Landstinget. Landstinget blev afskaffet med en ny grundlov i 1953. Siden da har Folketinget været det eneste ting.\n\nRegeringen: Efter 1849 valgte kongen stadig selv sine ministre, også når flertallet i Folketinget var imod dem. Ved systemskiftet i 1901 fik Venstre, som havde flertal i Folketinget, for første gang lov at danne regering. Det blev begyndelsen på reglen om, at en regering ikke må have et flertal i Folketinget imod sig. Reglen kom først ind i Grundloven i 1953.",
   "credit":{"source":"Lærlig, fortællende tekst. Årstal efter danmarkshistorien.lex.dk og Velfærdsministeriet: Valgretten gennem tiderne frem til 1978 (2009)","year":"2026"}}}},
{"answer_format":"categorize","difficulty_band":1,"difficulty_level":5850,
 "metadata":{"pilot":"D-362","pilot_form":"categorize","pilot_phase":"introduktion","pilot_practice":true,"domain":"revolutions_democracy","concepts":["enevælde","folkestyre"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","challenge_role":"entry_level","insight_type":"concept_clarification","pilot_skill":"Enevælde og folkestyre"},
 "content":{
  "question":"Hvilke kendetegn passer på enevælde, og hvilke passer på folkestyre?",
  "categories":["Enevælde","Folkestyre"],
  "items":[
   {"text":"Én person har al magten","category":"Enevælde"},
   {"text":"Kongens ord er lov","category":"Enevælde"},
   {"text":"Vælgerne stemmer ved valg","category":"Folkestyre"},
   {"text":"Magten kommer fra folket","category":"Folkestyre"}],
  "correct":"-",
  "review_text":"Under enevælde har én person, kongen, al magten, og det, kongen siger, er lov. Folkestyre betyder, at magten kommer fra folket: vælgerne stemmer ved valg om, hvem der skal bestemme. Pas på: at magten er delt mellem flere, er ikke nok til at kalde det folkestyre. Før 1660 delte kongen og adelen magten, men folket bestemte intet. Husk: i et folkestyre er det vælgerne, der giver magten."}},
{"answer_format":"categorize","difficulty_band":3,"difficulty_level":6500,
 "metadata":{"pilot":"D-362","pilot_form":"categorize","pilot_phase":"selvstændig anvendelse","domain":"revolutions_democracy","concepts":["valgret","Grundloven 1849","fattighjælp","kildeanvendelse"],"cognitive_skill":"application","difficulty_type":"applied","challenge_role":"challenge","insight_type":"conceptual_bridge","pilot_skill":"Brug af § 35 på otte personer"},
 "content":{
  "question":"Brug § 35. Hvem havde valgret til Folketinget i 1849, og hvem havde ikke? Om alle otte gælder, medmindre andet står: De er ustraffede, har indfødsret, styrer selv deres penge og ejendele og har boet samme sted i mange år. Ingen har fået hjælp fra fattigvæsenet.",
  "categories":["Valgret","Ingen valgret"],
  "items":[
   {"text":"Gårdmand på 52 år med egen husstand","category":"Valgret"},
   {"text":"Skolelærer på 35 år med eget hjem","category":"Valgret"},
   {"text":"Daglejer på 40 år, der bor til leje med sin familie","category":"Valgret"},
   {"text":"Væver på 45 år med eget hjem, har betalt sin fattighjælp tilbage","category":"Valgret"},
   {"text":"Gårdmandens kone på 45 år","category":"Ingen valgret"},
   {"text":"Tjenestekarl på 38 år, der bor hos sin arbejdsgiver","category":"Ingen valgret"},
   {"text":"Smed på 27 år med eget værksted og hjem","category":"Ingen valgret"},
   {"text":"Husmand på 60 år med eget hjem og ubetalt fattighjælp, som ikke er eftergivet","category":"Ingen valgret"}],
  "correct":"-",
  "review_text":"Gårdmanden, skolelæreren og daglejeren er mænd over 30 med eget hjem, og de opfylder de fælles krav, så de havde valgret. Det gælder også daglejeren, der bor til leje: man skulle ikke eje noget. Væveren havde valgret, for hans fattighjælp er betalt tilbage, og så tager § 35 b ikke valgretten. Gårdmandens kone havde ikke valgret, for § 35 gav kun mænd valgret. Tjenestekarlen er i privat tjeneste uden egen husstand (a). Smeden er under 30 år. Husmanden har fået hjælp fra fattigvæsenet, som hverken er betalt tilbage eller eftergivet (b). Tjek hver person mod alle krav, og find det ene krav, der afgør sagen.",
  "stimulus":{"kind":"source","title":"Danmarks Riges Grundlov, 5. juni 1849, § 35",
   "text":"Valgret til Folkethinget har enhver uberygtet Mand, som har Indfødsret, naar han har fyldt sit 30te Aar, medmindre han:\na) uden at have egen Huusstand staaer i privat Tjenesteforhold;\nb) nyder eller har nydt Understøttelse af Fattigvæsenet, som ikke er enten eftergiven eller tilbagebetalt;\nc) er ude af Raadigheden over sit Bo;\nd) ikke har havt fast Bopæl i eet Aar i den Valgkreds eller den Stad, hvori han opholder sig paa den Tid, Valget foregaaer.\n\nOrdforklaringer: uberygtet = ikke straffet for noget vanærende · Indfødsret = ret som dansk statsborger · Huusstand = eget hjem · privat Tjenesteforhold = arbejde som tjenestefolk hos en anden · Fattigvæsenet = den offentlige hjælp til fattige · eftergiven = eftergivet: han behøvede ikke at betale hjælpen tilbage · ude af Raadigheden over sit Bo = må ikke selv styre sine penge og ejendele · Valgkreds = det område, man stemmer i · Stad = by.",
   "credit":{"source":"Danmarks Riges Grundlov af 5. juni 1849, § 35 (gengivet efter danmarkshistorien.lex.dk). Ordforklaringer: Lærlig","year":"1849","license":"Offentligt domæne"}}}},
{"answer_format":"categorize","difficulty_band":3,"difficulty_level":6400,
 "metadata":{"pilot":"D-362","pilot_form":"categorize","pilot_phase":"selvstændig anvendelse","domain":"revolutions_democracy","concepts":["enevælde","Grundloven 1849","magtens tredeling","frihedsrettigheder"],"cognitive_skill":"application","difficulty_type":"conceptual","challenge_role":"challenge","insight_type":"concept_clarification","pilot_skill":"Før og efter Grundloven 1849"},
 "content":{
  "question":"Hvilke kendetegn hører til enevælden, og hvilke til styret efter Grundloven 1849?",
  "categories":["Enevælden (1660–1849)","Efter Grundloven 1849"],
  "items":[
   {"text":"Kongen giver og ophæver love alene","category":"Enevælden (1660–1849)"},
   {"text":"Kongeloven fra 1665 er rigets grundlov","category":"Enevælden (1660–1849)"},
   {"text":"Ingen valgt forsamling vedtager lovene","category":"Enevælden (1660–1849)"},
   {"text":"Rigsdagen og kongen vedtager lovene sammen","category":"Efter Grundloven 1849"},
   {"text":"Borgerne må slutte sig sammen i foreninger uden at få tilladelse først","category":"Efter Grundloven 1849"},
   {"text":"En del af mændene kan stemme ved valg til Folketinget","category":"Efter Grundloven 1849"}],
  "correct":"-",
  "review_text":"Under enevælden gav og ophævede kongen lovene alene. Kongeloven fra 1665 var enevældens grundlov: den gav kongen al magt. Grundloven af 1849 afløste den med et helt nyt styre. Fra 1834 fandtes der valgte stænderforsamlinger, men de kunne kun give råd: de vedtog ikke lovene. Grundloven af 5. juni 1849 delte magten: Rigsdagen og kongen vedtager lovene sammen (§ 2). Grundloven gav også borgerne frihedsrettigheder, fx retten til at gå sammen i foreninger uden at få tilladelse først (foreningsfriheden, § 92). Og en del af mændene fik valgret til Folketinget (§ 35), men ikke alle: der var flere krav end alder og køn. Et tip: spørg dig selv, hvem der giver lovene, og om de er valgt."}},
{"answer_format":"categorize","difficulty_band":4,"difficulty_level":6800,
 "metadata":{"pilot":"D-362","pilot_form":"categorize","pilot_phase":"selvstændig anvendelse","domain":"revolutions_democracy","concepts":["enevælde","arvekongedømme","Grundloven 1849","grundloven 1915","valgret"],"cognitive_skill":"analysis","difficulty_type":"factual","challenge_role":"deep_challenge","insight_type":"conceptual_bridge","pilot_skill":"Hvornår kom ændringerne"},
 "content":{
  "question":"Hvornår kom hver ændring? Placér den ved den tid, hvor den blev indført.",
  "categories":["Enevældens indførelse 1660–1661","Grundloven 1849","Grundloven 1915"],
  "items":[
   {"text":"Kongen får al magt","category":"Enevældens indførelse 1660–1661"},
   {"text":"Kongemagten bliver arvelig, så kongen ikke længere skal vælges","category":"Enevældens indførelse 1660–1661"},
   {"text":"En del af mændene får valgret til Folketinget","category":"Grundloven 1849"},
   {"text":"Kongen og Rigsdagen skal vedtage lovene sammen","category":"Grundloven 1849"},
   {"text":"Rigsdagen får to kamre: Folketinget og Landstinget","category":"Grundloven 1849"},
   {"text":"Kvinder får valgret til Rigsdagen","category":"Grundloven 1915"},
   {"text":"Tjenestefolk uden egen husstand får valgret","category":"Grundloven 1915"}],
  "correct":"-",
  "review_text":"I 1660 blev Danmark et arvekongedømme. Før valgte adelen i rigsrådet i praksis kongen, men nu gik kronen i arv. Kort efter, i januar 1661, overdrog en ny lov, Enevoldsarveregeringsakten, kongen al magt. Begge dele hører derfor til enevældens indførelse 1660–1661. Grundloven 1849 delte magten, så kongen og Rigsdagen skulle vedtage lovene sammen. Den gav Rigsdagen to kamre, Folketinget og Landstinget, og en del af mændene fik valgret til Folketinget. Grundloven 1915 gav kvinder og tjenestefolk uden egen husstand valgret til Rigsdagen, og de stemte første gang ved folketingsvalget i 1918. Et tip: spørg, om ændringen handler om kongens magt (1660–1661), om at dele magten (1849) eller om at give valgret til grupper, der var holdt ude i 1849 (1915)."}}
]$pilot$::jsonb) AS r;
