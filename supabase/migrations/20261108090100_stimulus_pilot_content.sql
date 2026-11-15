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
-- Faglig revision 2026-11-15 (ejerens GO): S2, S4, S5 og S6 er skrevet om, S1, S3 og S7 justeret. S5 er nu mc
-- med § 2 (magtens tredeling) i stedet for et regnestykke på tidslinjen: 6 mc og 1 tal (S3), kun S1 har billede.
-- Faktatjek og begrundelser for hvert svar: samme oversigt. Filen er stadig IKKE anvendt i produktionen.
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
 "metadata":{"pilot":"D-362","pilot_form":"stimulus","pilot_phase":"introduktion","domain":"revolutions_democracy","concepts":["enevælde","indskrænket monarki","Grundloven 1849"],"cognitive_skill":"recall","difficulty_type":"factual","challenge_role":"entry_level","insight_type":"conceptual_bridge","pilot_skill":"Styreformen før 1849: enevælde"},
 "content":{"type":"mc",
  "question":"Se tidslinjen. Hvilken styreform havde Danmark lige før Grundloven i 1849?",
  "options":["Folkestyre","Enevælde","Republik","Kongedømme med valgt rigsdag"],
  "correct":"Enevælde","accepted_answers":["Enevælde"],
  "review_text":"Fra 1660 til 1849 havde kongen al magt. Det kaldes enevælde. Med Grundloven i 1849 blev Danmark et kongedømme med en valgt rigsdag. Grundloven kaldte det et \"indskrænket monarki\": Danmark havde stadig en konge, men han havde ikke længere al magt. Nu skulle kongen give lovene sammen med Rigsdagen. Det var begyndelsen på vejen mod folkestyre. Kun en del af mændene fik valgret, og kvinder fik den først i 1915.",
  "stimulus":{"kind":"image","file":"grundloven-1849-tidslinje.svg",
   "alt":"Lodret tidslinje fra 1660 til 1849. En rød bjælke mærket 'Enevælde' går fra 1660 til 1849. En grøn bjælke mærket 'Mod folkestyre' begynder i 1849. Markeringer: 1660 enevælden indføres, og kongen får al magt. 1788 stavnsbåndet ophæves. 5. juni 1849 Grundloven underskrives – på vej mod folkestyre.",
   "caption":"Fra enevælde mod folkestyre.",
   "credit":{"source":"Lærlig, egen tegning","year":"2026"}}}},
{"type":"mc_single","answer_format":"mc","difficulty_band":1,"difficulty_level":5900,
 "metadata":{"pilot":"D-362","pilot_form":"stimulus","pilot_phase":"introduktion","domain":"revolutions_democracy","concepts":["valgret","Grundloven 1849","kvinders valgret","Rigsdagen"],"cognitive_skill":"application","difficulty_type":"factual","challenge_role":"entry_level","insight_type":"conceptual_bridge","pilot_skill":"Hvem fik valgret i 1849"},
 "content":{"type":"mc",
  "question":"Læs teksten. Alle fire personer har indfødsret og er ikke straffet. De styrer selv deres penge og ejendele og har boet i deres valgkreds i mange år. Ingen af dem har fået hjælp fra fattigvæsenet. Hvem af dem kunne stemme ved valget til Folketinget i 1849?",
  "options":["Karen, 45 år, enke, driver sin egen gård","Ole, 28 år, smed, bor i sit eget hus","Mads, 50 år, tjenestekarl, bor hos den gårdmand, han arbejder for","Anders, 34 år, daglejer, bor i sit eget hus med sin familie"],
  "correct":"Anders, 34 år, daglejer, bor i sit eget hus med sin familie","accepted_answers":["Anders, 34 år, daglejer, bor i sit eget hus med sin familie"],
  "review_text":"Kun Anders kunne stemme. Han er en mand over 30 år, og han har sit eget hjem, så han er ikke tjenestefolk uden eget hjem. Det var ikke ejendom, der gav valgret: også en daglejer med eget hjem kunne stemme. Karen er en kvinde, og kvinder fik ikke valgret. Ole er under 30 år. Mads er tjenestekarl og bor hos sin arbejdsgiver uden eget hjem.",
  "stimulus":{"kind":"source","title":"Hvem måtte stemme i 1849?",
   "text":"Den 5. juni 1849 underskrev kong Frederik 7. Danmarks første grundlov. Nu skulle kongen give lovene sammen med en rigsdag. Rigsdagen havde to dele: Folketinget og Landstinget. Mænd med valgret kunne stemme ved valg til Folketinget.\n\nMen langt fra alle fik valgret. Kvinder fik ikke valgret. Det fik heller ikke mænd under 30 år. Tjenestefolk, der levede hos deres arbejdsgiver uden eget hjem, fik heller ikke valgret. Det samme gjaldt fattige, der havde fået hjælp fra fattigvæsenet, som de ikke havde betalt tilbage og heller ikke var blevet fritaget for at betale.\n\nEn mand skulle også have indfødsret, altså være dansk statsborger, og han skulle have boet fast i sin valgkreds i mindst et år. Det var ikke et krav at eje et hus eller en gård. Kun omkring 15 procent af befolkningen fik valgret.",
   "credit":{"source":"Lærlig, fortællende tekst efter Grundloven af 1849, § 34–35. Tallet 15 procent: danmarkshistorien.lex.dk","year":"2026"}}}},
{"type":"number","answer_format":"number","difficulty_band":2,"difficulty_level":6100,
 "metadata":{"pilot":"D-362","pilot_form":"stimulus","pilot_phase":"forståelsestjek","domain":"revolutions_democracy","concepts":["valgret","Grundloven 1849","kildelæsning"],"cognitive_skill":"comprehension","difficulty_type":"factual","challenge_role":"reinforcement","insight_type":"concept_clarification","pilot_skill":"Alderskravet i Grundlovens § 35"},
 "content":{"type":"number",
  "question":"Læs kilden. Folketinget var dengang den ene af Rigsdagens to dele. Hvor gammel skulle en mand mindst være for at få valgret til Folketinget? Skriv kun tallet.",
  "correct":"30","accepted_answers":["30"],
  "review_text":"Der står \"naar han har fyldt sit 30te Aar\". Det betyder: når han er fyldt 30 år. En mand skulle altså være mindst 30 år. Folketinget i 1849 var ikke det samme som Folketinget i dag: det var den ene af Rigsdagens to dele, og den anden hed Landstinget.",
  "stimulus":{"kind":"source","title":"Danmarks Riges Grundlov, 5. juni 1849, § 35",
   "text":"Valgret til Folkethinget har enhver uberygtet Mand, som har Indfødsret, naar han har fyldt sit 30te Aar, medmindre han:\na) uden at have egen Huusstand staaer i privat Tjenesteforhold;\nb) nyder eller har nydt Understøttelse af Fattigvæsenet, som ikke er enten eftergiven eller tilbagebetalt;\nc) er ude af Raadigheden over sit Bo;\nd) ikke har havt fast Bopæl i eet Aar i den Valgkreds eller den Stad, hvori han opholder sig paa den Tid, Valget foregaaer.\n\nOrdforklaringer: uberygtet = ikke straffet for noget vanærende · Indfødsret = ret som dansk statsborger · Huusstand = eget hjem · privat Tjenesteforhold = arbejde som tjenestefolk hos en anden · Fattigvæsenet = den offentlige hjælp til fattige · eftergiven = eftergivet: han behøvede ikke at betale hjælpen tilbage · ude af Raadigheden over sit Bo = må ikke selv styre sine penge og ejendele · Valgkreds = det område, man stemmer i · Stad = by.",
   "credit":{"source":"Danmarks Riges Grundlov af 5. juni 1849, § 35 (gengivet efter danmarkshistorien.lex.dk). Ordforklaringer: Lærlig","year":"1849","license":"Offentligt domæne"}}}},
{"type":"mc_single","answer_format":"mc","difficulty_band":2,"difficulty_level":6200,
 "metadata":{"pilot":"D-362","pilot_form":"stimulus","pilot_phase":"forståelsestjek","domain":"revolutions_democracy","concepts":["valgret","fattighjælp","kildelæsning"],"cognitive_skill":"comprehension","difficulty_type":"inferential","challenge_role":"reinforcement","insight_type":"concept_clarification","pilot_skill":"Reglen om fattighjælp i § 35"},
 "content":{"type":"mc",
  "question":"Læs kilden. En mand havde fået hjælp fra fattigvæsenet. Hvornår havde han alligevel valgret, hvis han opfyldte de andre krav?",
  "options":["Når han havde fyldt 40 år og fået eget hjem","Når han blev tjenestekarl og flyttede ind hos en gårdmand","Når hjælpen var betalt tilbage eller eftergivet","Aldrig, for hjælpen tog valgretten for altid"],
  "correct":"Når hjælpen var betalt tilbage eller eftergivet","accepted_answers":["Når hjælpen var betalt tilbage eller eftergivet"],
  "review_text":"§ 35 b siger, at hjælp fra fattigvæsenet kun tog valgretten, hvis den hverken var eftergivet eller betalt tilbage. Eftergivet betyder, at han ikke behøvede at betale hjælpen tilbage. Var hjælpen betalt tilbage eller eftergivet, havde han valgret, hvis han opfyldte de andre krav. At blive 40 år eller få eget hjem ændrer ikke på hjælpen. En tjenestekarl, der bor hos sin arbejdsgiver uden eget hjem, havde slet ikke valgret (§ 35 a).",
  "stimulus":{"kind":"source","title":"Danmarks Riges Grundlov, 5. juni 1849, § 35",
   "text":"Valgret til Folkethinget har enhver uberygtet Mand, som har Indfødsret, naar han har fyldt sit 30te Aar, medmindre han:\na) uden at have egen Huusstand staaer i privat Tjenesteforhold;\nb) nyder eller har nydt Understøttelse af Fattigvæsenet, som ikke er enten eftergiven eller tilbagebetalt;\nc) er ude af Raadigheden over sit Bo;\nd) ikke har havt fast Bopæl i eet Aar i den Valgkreds eller den Stad, hvori han opholder sig paa den Tid, Valget foregaaer.\n\nOrdforklaringer: uberygtet = ikke straffet for noget vanærende · Indfødsret = ret som dansk statsborger · Huusstand = eget hjem · privat Tjenesteforhold = arbejde som tjenestefolk hos en anden · Fattigvæsenet = den offentlige hjælp til fattige · eftergiven = eftergivet: han behøvede ikke at betale hjælpen tilbage · ude af Raadigheden over sit Bo = må ikke selv styre sine penge og ejendele · Valgkreds = det område, man stemmer i · Stad = by.",
   "credit":{"source":"Danmarks Riges Grundlov af 5. juni 1849, § 35 (gengivet efter danmarkshistorien.lex.dk). Ordforklaringer: Lærlig","year":"1849","license":"Offentligt domæne"}}}},
{"type":"mc_single","answer_format":"mc","difficulty_band":2,"difficulty_level":6250,
 "metadata":{"pilot":"D-362","pilot_form":"stimulus","pilot_phase":"forståelsestjek","domain":"revolutions_democracy","concepts":["magtens tredeling","dømmende magt","Grundloven 1849"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","challenge_role":"reinforcement","insight_type":"concept_clarification","pilot_skill":"Magtens tredeling i § 2"},
 "content":{"type":"mc",
  "question":"Læs kilden. Før 1849 havde kongen al magt. Nu blev magten delt i tre. Forestil dig, at en mand i 1850 er anklaget for at have stjålet en hest. Hvem har efter § 2 den magt, der skal afgøre, om han er skyldig?",
  "options":["Domstolene","Kongen","Rigsdagen","Kongen og Rigsdagen sammen"],
  "correct":"Domstolene","accepted_answers":["Domstolene"],
  "review_text":"§ 2 deler magten i tre. Den lovgivende magt, som vedtager lovene, havde kongen og Rigsdagen sammen. Den udøvende magt, som sørger for, at lovene bliver ført ud i livet, havde kongen. Den dømmende magt, som dømmer efter lovene, havde domstolene. Derfor er det domstolene, der afgør, om manden er skyldig, ikke kongen eller Rigsdagen.",
  "stimulus":{"kind":"source","title":"Danmarks Riges Grundlov, 5. juni 1849, § 2 (gengivet med nutidig retskrivning)",
   "text":"§ 2: Den lovgivende magt er hos kongen og Rigsdagen i forening. Den udøvende magt er hos kongen. Den dømmende magt er hos domstolene.\n\nOrdforklaringer: lovgivende = som vedtager lovene · udøvende = som sørger for, at lovene bliver ført ud i livet · dømmende = som dømmer efter lovene · i forening = sammen · domstolene = rettens dommere.",
   "credit":{"source":"Danmarks Riges Grundlov af 5. juni 1849, § 2, gengivet med nutidig retskrivning (danmarkshistorien.lex.dk). Ordforklaringer: Lærlig","year":"1849","license":"Offentligt domæne"}}}},
{"type":"mc_single","answer_format":"mc","difficulty_band":3,"difficulty_level":6450,
 "metadata":{"pilot":"D-362","pilot_form":"stimulus","pilot_phase":"selvstændig anvendelse","domain":"revolutions_democracy","concepts":["valgret","fattighjælp","kildeanvendelse"],"cognitive_skill":"application","difficulty_type":"applied","challenge_role":"challenge","insight_type":"conceptual_bridge","pilot_skill":"Brug af § 35 på fire personer"},
 "content":{"type":"mc",
  "question":"Brug § 35 på fire mænd ved et valg i 1850. Alle fire er uberygtede, har indfødsret og styrer selv deres penge og ejendele. De har boet i valgkredsen i mange år, og ingen af dem har fået hjælp fra fattigvæsenet, medmindre andet står. Hvem af dem havde valgret til Folketinget?",
  "options":["Peder, 40 år, tjenestekarl, bor hos den gårdmand, han arbejder for","Niels, 50 år, smed med eget hjem, har betalt sin fattighjælp tilbage","Hans, 45 år, gårdmand med eget hjem, flyttede til valgkredsen for et halvt år siden","Jens, 29 år, købmand med eget hjem og egen butik"],
  "correct":"Niels, 50 år, smed med eget hjem, har betalt sin fattighjælp tilbage","accepted_answers":["Niels, 50 år, smed med eget hjem, har betalt sin fattighjælp tilbage"],
  "review_text":"Kun Niels havde valgret. Han havde fået hjælp fra fattigvæsenet, men den var betalt tilbage, og så tog den ikke valgretten (b). Han er over 30 år, har eget hjem, styrer selv sine penge og har boet i valgkredsen i mange år. Peder er i privat tjeneste uden eget hjem (a). Hans har boet under et år i valgkredsen (d). Jens er under 30 år.",
  "stimulus":{"kind":"source","title":"Danmarks Riges Grundlov, 5. juni 1849, § 35",
   "text":"Valgret til Folkethinget har enhver uberygtet Mand, som har Indfødsret, naar han har fyldt sit 30te Aar, medmindre han:\na) uden at have egen Huusstand staaer i privat Tjenesteforhold;\nb) nyder eller har nydt Understøttelse af Fattigvæsenet, som ikke er enten eftergiven eller tilbagebetalt;\nc) er ude af Raadigheden over sit Bo;\nd) ikke har havt fast Bopæl i eet Aar i den Valgkreds eller den Stad, hvori han opholder sig paa den Tid, Valget foregaaer.\n\nOrdforklaringer: uberygtet = ikke straffet for noget vanærende · Indfødsret = ret som dansk statsborger · Huusstand = eget hjem · privat Tjenesteforhold = arbejde som tjenestefolk hos en anden · Fattigvæsenet = den offentlige hjælp til fattige · eftergiven = eftergivet: han behøvede ikke at betale hjælpen tilbage · ude af Raadigheden over sit Bo = må ikke selv styre sine penge og ejendele · Valgkreds = det område, man stemmer i · Stad = by.",
   "credit":{"source":"Danmarks Riges Grundlov af 5. juni 1849, § 35 (gengivet efter danmarkshistorien.lex.dk). Ordforklaringer: Lærlig","year":"1849","license":"Offentligt domæne"}}}},
{"type":"mc_single","answer_format":"mc","difficulty_band":4,"difficulty_level":6700,
 "metadata":{"pilot":"D-362","pilot_form":"stimulus","pilot_phase":"selvstændig anvendelse","domain":"revolutions_democracy","concepts":["magtens tredeling","Rigsdagen","Grundloven 1849"],"cognitive_skill":"application","difficulty_type":"conceptual","challenge_role":"challenge","insight_type":"concept_clarification","pilot_skill":"Hvem giver lovene efter § 2"},
 "content":{"type":"mc",
  "question":"Læs kilden. Forestil dig, at begge dele af Rigsdagen i 1850 vedtager en ny skolelov. Men kongen vil ikke give sit samtykke. Bliver forslaget til lov?",
  "options":["Ja, for kongen har kun den udøvende magt","Ja, for Rigsdagen er valgt af vælgerne","Nej, for loven kræver også kongens ja","Ja, hvis domstolene siger god for loven"],
  "correct":"Nej, for loven kræver også kongens ja","accepted_answers":["Nej, for loven kræver også kongens ja"],
  "review_text":"Ifølge § 2 har kongen og Rigsdagen den lovgivende magt i forening, altså sammen. § 29 siger, at kongens samtykke kræves, før noget, Rigsdagen har vedtaget, bliver til lov. Vil kongen ikke give sit samtykke, bliver forslaget ikke til lov. Kongen havde altså ikke kun den udøvende magt: han var også med til at give lovene. Domstolene har den dømmende magt, ikke den lovgivende. At Rigsdagen er valgt, er ikke nok.",
  "stimulus":{"kind":"source","title":"Danmarks Riges Grundlov, 5. juni 1849, § 2 og § 29 (gengivet med nutidig retskrivning)",
   "text":"§ 2: Den lovgivende magt er hos kongen og Rigsdagen i forening. Den udøvende magt er hos kongen. Den dømmende magt er hos domstolene.\n§ 29: Kongens samtykke kræves for at give en rigsdagsbeslutning lovskraft.\n\nOrdforklaringer: lovgivende = som vedtager lovene · udøvende = som sørger for, at lovene bliver ført ud i livet · dømmende = som dømmer efter lovene · i forening = sammen · samtykke = ja, tilladelse · rigsdagsbeslutning = noget, Rigsdagen har vedtaget · lovskraft = gyldighed som lov.",
   "credit":{"source":"Danmarks Riges Grundlov af 5. juni 1849, § 2 og § 29, gengivet med nutidig retskrivning (danmarkshistorien.lex.dk). Ordforklaringer: Lærlig","year":"1849","license":"Offentligt domæne"}}}}
]$pilot$::jsonb) AS r;
