-- ============================================================================
-- D-362 — pilotindhold for F-07 Stimulus (kilde, billede) i historie: Grundloven 1849.
-- KUN DATA. IKKE ANVENDT. INAKTIVT.
--
-- Hvad: 7 spørgsmål i de eksisterende formater multiple choice (mc) og tal (number), som hver har et
-- content.stimulus (docs/ARCHITECTURE.md "Stimulus contract (F-07)", supabase/functions/_shared/stimulus.ts).
-- Bygget på de godkendte eksempler i tools/stimulus/examples/grundloven-1849.json og
-- grundloven-1849-forloeb.json. Forløb: introduktion → forståelsestjek → selvstændig anvendelse.
-- Emne: Grundloven 1849 (fagligt revolutions_democracy, som metadata.domain angiver), 7. klasse,
-- sværhedsniveau 5.800–6.700 på skalaen 1–10.000 (target_grade/difficulty_band er cellen i
-- docs/difficulty-scale-design.md §4.1).
-- ADGANG: learning_objective er 'pilot_d362', ikke 'revolutions_democracy'. Pilotens adgang: kun en elev,
-- hvis active_domains indeholder pilot_d362. get-next-question bygger domænerne på serveren
-- (scope.ts: profilens active_domains eller de faste HISTORY_DOMAINS), og alle udvælgelses-RPC'er
-- filtrerer på learning_objective = ANY(p_domains). Eleven kan ikke selv skrive active_domains.
-- Kendt rest: elevens lærer kan tildele pilot_d362 via set_student_domains, når rækkerne er aktive
-- (docs/decisions/D-362.md). Tests: tests/unit/task-forms-pilot-scope.test.mjs.
-- Faglig oversigt til ejerens review: docs/operations/task-forms-pilot-content-review.md.
--
-- Ingen lydopgave: lydfilen grundloven-1849-valgret.wav findes ikke i assets/stimulus/ (den skal
-- indtales med den licenserede stemme først). Fortællingen fra lydklippet er i stedet brugt som en
-- skrevet kilde. Den eneste mediefil, der refereres, er assets/stimulus/grundloven-1849-tidslinje.svg.
--
-- KAN GEMMES I PRODUKTION I DAG: formaterne mc og number med content.type 'mc'/'number' opfylder
-- produktionens questions_answer_format_check og content_valid_check uændret. Et stimulus ændrer
-- hverken bedømmelse eller belønning. Det SENDES først til eleven, når get-next-question fra main er
-- deployet (question-dto.ts), og først når rækkerne er aktiveret.
--
-- INAKTIV: is_active = false er skrevet fast i SQL'en herunder (ikke i data), så ingen række kan
-- serveres, før en SEPARAT, ejergodkendt aktivering sætter is_active = true.
-- MARKØR: metadata.pilot = 'D-362' og metadata.pilot_form = 'stimulus'.
--
-- ANVENDELSE: kun via apply_migration med særskilt ejerautorisation for netop denne fil (D-110,
-- docs/migration-workflow-policy.md). Aldrig `supabase db push`. Listet i NOT_IN_PRODUCTION
-- (tests/isolated/schema/replay-plan.mjs). Rækkefølge og GO'er: docs/decisions/D-362.md.
-- En genkørsel fejler højlydt på unique_question_text (ingen dobbelte rækker).
--
-- FJERNELSE (mens rækkerne er inaktive og ingen elev har svaret):
--   DELETE FROM public.questions
--   WHERE metadata->>'pilot' = 'D-362' AND metadata->>'pilot_form' = 'stimulus' AND is_active = false;
-- Har rækkerne været aktive, sættes de i stedet inaktive (is_active = false), så elevernes
-- svarhistorik bevares.
--
-- Tests: tests/unit/task-forms-pilot-content.test.mjs.
-- ============================================================================

INSERT INTO public.questions (type, content, answer_format, answer_type, metadata, difficulty, question_type,
                              is_active, learning_objective, target_grade, difficulty_band, difficulty_level)
SELECT
  r->>'type', r->'content', r->>'answer_format', 'short', r->'metadata',
  (r->>'difficulty_band')::int, 'auto',
  false,
  'pilot_d362', 7, (r->>'difficulty_band')::smallint, (r->>'difficulty_level')::int
FROM jsonb_array_elements($pilot$[
{"type":"mc_single","answer_format":"mc","difficulty_band":1,"difficulty_level":5800,
 "metadata":{"pilot":"D-362","pilot_form":"stimulus","pilot_phase":"introduktion","domain":"revolutions_democracy","concepts":["enevælde","folkestyre","Grundloven 1849"],"cognitive_skill":"recall","difficulty_type":"factual","challenge_role":"entry_level","insight_type":"conceptual_bridge"},
 "content":{"type":"mc",
  "question":"Se tidslinjen. Hvilken styreform havde Danmark lige før Grundloven i 1849?",
  "options":["Folkestyre","Enevælde","Republik","Diktatur"],
  "correct":"Enevælde","accepted_answers":["Enevælde"],
  "review_text":"Fra 1660 til 1849 havde kongen al magt. Det kaldes enevælde. Med Grundloven i 1849 fik Danmark folkestyre.",
  "stimulus":{"kind":"image","file":"grundloven-1849-tidslinje.svg",
   "alt":"Lodret tidslinje fra 1660 til 1849. En rød bjælke mærket 'Enevælde' går fra 1660 til 1849. En grøn bjælke mærket 'Folkestyre' begynder i 1849. Markeringer: 1660 enevælden indføres, og kongen får al magt. 1788 stavnsbåndet ophæves. 5. juni 1849 Grundloven underskrives.",
   "caption":"Fra enevælde til folkestyre.",
   "credit":{"source":"Lærlig, egen tegning","year":"2026"}}}},
{"type":"mc_single","answer_format":"mc","difficulty_band":1,"difficulty_level":5900,
 "metadata":{"pilot":"D-362","pilot_form":"stimulus","pilot_phase":"introduktion","domain":"revolutions_democracy","concepts":["valgret","Grundloven 1849","kvinders valgret"],"cognitive_skill":"comprehension","difficulty_type":"factual","challenge_role":"entry_level","insight_type":"conceptual_bridge"},
 "content":{"type":"mc",
  "question":"Læs teksten. Hvem af disse fik IKKE valgret i 1849?",
  "options":["En mand på 40 år med egen gård","En mand på 55 år med eget værksted","En kvinde på 40 år med egen gård","En mand på 35 år med egen butik"],
  "correct":"En kvinde på 40 år med egen gård","accepted_answers":["En kvinde på 40 år med egen gård"],
  "review_text":"Grundloven i 1849 gav kun mænd valgret. Kvinder fik først valgret til Rigsdagen i 1915.",
  "stimulus":{"kind":"source","title":"Hvem måtte stemme i 1849?",
   "text":"Den 5. juni 1849 underskrev kong Frederik 7. Danmarks første grundlov. Nu skulle folket være med til at bestemme gennem valg til Rigsdagen. Men langt fra alle fik lov at stemme. Kvinder fik ikke valgret. Det fik heller ikke mænd under 30 år, tjenestefolk uden egen husstand og fattige, der fik hjælp fra fattigvæsenet.",
   "credit":{"source":"Lærlig, fortællende tekst","year":"2026"}}}},
{"type":"number","answer_format":"number","difficulty_band":2,"difficulty_level":6100,
 "metadata":{"pilot":"D-362","pilot_form":"stimulus","pilot_phase":"forståelsestjek","domain":"revolutions_democracy","concepts":["valgret","Grundloven 1849","kildelæsning"],"cognitive_skill":"comprehension","difficulty_type":"factual","challenge_role":"reinforcement","insight_type":"concept_clarification"},
 "content":{"type":"number",
  "question":"Læs kilden. Hvor gammel skulle en mand mindst være for at få valgret til Folketinget? Skriv alderen med cifre.",
  "correct":"30","accepted_answers":["30"],
  "review_text":"Der står \"naar han har fyldt sit 30te Aar\". En mand skulle altså være fyldt 30 år.",
  "stimulus":{"kind":"source","title":"Danmarks Riges Grundlov, 5. juni 1849, § 35",
   "text":"Valgret til Folkethinget har enhver uberygtet Mand, som har Indfødsret, naar han har fyldt sit 30te Aar, medmindre han:\na) uden at have egen Huusstand staaer i privat Tjenesteforhold;\nb) nyder eller har nydt Understøttelse af Fattigvæsenet, som ikke er enten eftergiven eller tilbagebetalt;\nc) er ude af Raadigheden over sit Bo;\nd) ikke har havt fast Bopæl i eet Aar i den Valgkreds eller den Stad, hvori han opholder sig paa den Tid, Valget foregaaer.\n\nOrdforklaringer: uberygtet = ikke straffet for noget vanærende · Huusstand = eget hjem · Fattigvæsenet = den offentlige hjælp til fattige · Bo = formue og ejendele.",
   "credit":{"source":"Danmarks Riges Grundlov af 5. juni 1849, § 35 (gengivet efter danmarkshistorien.lex.dk). Ordforklaringer: Lærlig","year":"1849","license":"Offentligt domæne"}}}},
{"type":"mc_single","answer_format":"mc","difficulty_band":2,"difficulty_level":6200,
 "metadata":{"pilot":"D-362","pilot_form":"stimulus","pilot_phase":"forståelsestjek","domain":"revolutions_democracy","concepts":["valgret","kvinders valgret","kildelæsning"],"cognitive_skill":"comprehension","difficulty_type":"inferential","challenge_role":"reinforcement","insight_type":"concept_clarification"},
 "content":{"type":"mc",
  "question":"Læs kilden. Hvilket ord i § 35 viser, at kun mænd kunne få valgret?",
  "options":["Indfødsret","Huusstand","Fattigvæsenet","Mand"],
  "correct":"Mand","accepted_answers":["Mand"],
  "review_text":"§ 35 giver valgret til \"enhver uberygtet Mand\". Derfor kunne kun mænd få valgret, og kvinder fik den først i 1915. Men ikke alle mænd: de skulle også have indfødsret, være fyldt 30 år, have egen husstand og ikke modtage hjælp fra fattigvæsenet.",
  "stimulus":{"kind":"source","title":"Danmarks Riges Grundlov, 5. juni 1849, § 35",
   "text":"Valgret til Folkethinget har enhver uberygtet Mand, som har Indfødsret, naar han har fyldt sit 30te Aar, medmindre han:\na) uden at have egen Huusstand staaer i privat Tjenesteforhold;\nb) nyder eller har nydt Understøttelse af Fattigvæsenet, som ikke er enten eftergiven eller tilbagebetalt;\nc) er ude af Raadigheden over sit Bo;\nd) ikke har havt fast Bopæl i eet Aar i den Valgkreds eller den Stad, hvori han opholder sig paa den Tid, Valget foregaaer.\n\nOrdforklaringer: uberygtet = ikke straffet for noget vanærende · Huusstand = eget hjem · Fattigvæsenet = den offentlige hjælp til fattige · Bo = formue og ejendele.",
   "credit":{"source":"Danmarks Riges Grundlov af 5. juni 1849, § 35 (gengivet efter danmarkshistorien.lex.dk). Ordforklaringer: Lærlig","year":"1849","license":"Offentligt domæne"}}}},
{"type":"number","answer_format":"number","difficulty_band":2,"difficulty_level":6250,
 "metadata":{"pilot":"D-362","pilot_form":"stimulus","pilot_phase":"forståelsestjek","domain":"revolutions_democracy","concepts":["enevælde","kronologi","tidslinje"],"cognitive_skill":"application","difficulty_type":"applied","challenge_role":"reinforcement","insight_type":"conceptual_bridge"},
 "content":{"type":"number",
  "question":"Se tidslinjen. Hvor mange år varede enevælden i Danmark? Skriv antallet med cifre.",
  "correct":"189","accepted_answers":["189"],
  "review_text":"Enevælden blev indført i 1660 og sluttede med Grundloven i 1849. 1849 − 1660 = 189 år.",
  "stimulus":{"kind":"image","file":"grundloven-1849-tidslinje.svg",
   "alt":"Lodret tidslinje fra 1660 til 1849. En rød bjælke mærket 'Enevælde' går fra 1660 til 1849. En grøn bjælke mærket 'Folkestyre' begynder i 1849. Markeringer: 1660 enevælden indføres, og kongen får al magt. 1788 stavnsbåndet ophæves. 5. juni 1849 Grundloven underskrives.",
   "caption":"Fra enevælde til folkestyre.",
   "credit":{"source":"Lærlig, egen tegning","year":"2026"}}}},
{"type":"mc_single","answer_format":"mc","difficulty_band":3,"difficulty_level":6450,
 "metadata":{"pilot":"D-362","pilot_form":"stimulus","pilot_phase":"selvstændig anvendelse","domain":"revolutions_democracy","concepts":["valgret","Grundloven 1849","kildeanvendelse"],"cognitive_skill":"application","difficulty_type":"applied","challenge_role":"challenge","insight_type":"conceptual_bridge"},
 "content":{"type":"mc",
  "question":"Brug § 35 på fire mænd i 1849. Alle er uberygtede og har indfødsret. Hvem af dem havde valgret til Folketinget?",
  "options":["Peder, 40 år, tjenestekarl, bor hos den gårdmand, han arbejder for","Niels, 50 år, har fået hjælp af fattigvæsenet og ikke betalt den tilbage","Hans, 45 år, gårdmand med egen husstand, har boet i sognet i 20 år","Jens, 26 år, smed med eget værksted, har boet i byen i fem år"],
  "correct":"Hans, 45 år, gårdmand med egen husstand, har boet i sognet i 20 år","accepted_answers":["Hans, 45 år, gårdmand med egen husstand, har boet i sognet i 20 år"],
  "review_text":"Kun Hans opfylder alle krav. Peder er i privat tjeneste uden egen husstand (a). Niels har fået fattighjælp, som ikke er betalt tilbage (b). Jens er under 30 år.",
  "stimulus":{"kind":"source","title":"Danmarks Riges Grundlov, 5. juni 1849, § 35",
   "text":"Valgret til Folkethinget har enhver uberygtet Mand, som har Indfødsret, naar han har fyldt sit 30te Aar, medmindre han:\na) uden at have egen Huusstand staaer i privat Tjenesteforhold;\nb) nyder eller har nydt Understøttelse af Fattigvæsenet, som ikke er enten eftergiven eller tilbagebetalt;\nc) er ude af Raadigheden over sit Bo;\nd) ikke har havt fast Bopæl i eet Aar i den Valgkreds eller den Stad, hvori han opholder sig paa den Tid, Valget foregaaer.\n\nOrdforklaringer: uberygtet = ikke straffet for noget vanærende · Huusstand = eget hjem · Fattigvæsenet = den offentlige hjælp til fattige · Bo = formue og ejendele.",
   "credit":{"source":"Danmarks Riges Grundlov af 5. juni 1849, § 35 (gengivet efter danmarkshistorien.lex.dk). Ordforklaringer: Lærlig","year":"1849","license":"Offentligt domæne"}}}},
{"type":"mc_single","answer_format":"mc","difficulty_band":4,"difficulty_level":6700,
 "metadata":{"pilot":"D-362","pilot_form":"stimulus","pilot_phase":"selvstændig anvendelse","domain":"revolutions_democracy","concepts":["magtens tredeling","Rigsdagen","Grundloven 1849"],"cognitive_skill":"application","difficulty_type":"conceptual","challenge_role":"challenge","insight_type":"concept_clarification"},
 "content":{"type":"mc",
  "question":"Læs kilden. Efter 1849 skal en ny lov vedtages. Hvem skal være enige, før den kan blive til lov?",
  "options":["Kongen og Rigsdagen","Kongen alene","Rigsdagen alene","Kongen og domstolene"],
  "correct":"Kongen og Rigsdagen","accepted_answers":["Kongen og Rigsdagen"],
  "review_text":"§ 2 siger, at den lovgivende magt er hos kongen og Rigsdagen i forening. En lov kræver altså, at begge er enige. Domstolene har den dømmende magt, ikke den lovgivende.",
  "stimulus":{"kind":"source","title":"Danmarks Riges Grundlov, 5. juni 1849, § 2 (gengivet med nutidig retskrivning)",
   "text":"Den lovgivende magt er hos kongen og Rigsdagen i forening. Den udøvende magt er hos kongen. Den dømmende magt er hos domstolene.\n\nOrdforklaringer: lovgivende = som vedtager lovene · udøvende = som sørger for, at lovene bliver ført ud i livet · dømmende = som dømmer efter lovene · i forening = sammen.",
   "credit":{"source":"Danmarks Riges Grundlov af 5. juni 1849, § 2, gengivet med nutidig retskrivning (danmarkshistorien.lex.dk). Ordforklaringer: Lærlig","year":"1849","license":"Offentligt domæne"}}}}
]$pilot$::jsonb) AS r;
