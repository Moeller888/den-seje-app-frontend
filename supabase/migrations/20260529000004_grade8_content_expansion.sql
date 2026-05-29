-- Section 74 — Grade 8 Content Expansion Sprint
-- WW2 domain: fills Grade 8 Band 1 gap (0→10) and Band 3 gap (2→10)
-- Band distribution: Band 1 (10), Band 3 (8) — total 18 new questions
-- All questions: target_grade=8, domain=world_war_2, answer_format=mc, is_active=true

-- ─── BAND 1 — Factual / Recall ──────────────────────────────────────────────

-- g8_ww2_b1_01
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvem var Storbritanniens statsminister under det meste af 2. Verdenskrig?","options":["Winston Churchill","Neville Chamberlain","Clement Attlee","Anthony Eden"],"correct":"Winston Churchill","accepted_answers":["Winston Churchill"],"review_text":"Winston Churchill blev statsminister i maj 1940, da krigen for alvor truede Storbritannien. Han er berømt for sine motiverende taler og sin urokkelige vilje til at modstå Tyskland. Han ledede landet igennem krigens hårdeste år frem til valgnederlaget i juli 1945."}'::jsonb,
  'mc', 'short',
  '{"concepts":["Churchill","britisk lederskab","de allierede"],"misconception_type":"surface_association","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"world_war_2"}'::jsonb,
  'mc_single', 1, 'auto', true, 'world_war_2', 8, 1
);

-- g8_ww2_b1_02
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad betød militærbegrebet \"Blitzkrieg\"?","options":["Lynkrig — et hurtigt koordineret angreb med tanks og fly","Gaskrigsførelse fra 1. Verdenskrig","Søblokade for at udsulte fjenden","Forsvarsstilling i skyttegrave"],"correct":"Lynkrig — et hurtigt koordineret angreb med tanks og fly","accepted_answers":["Lynkrig — et hurtigt koordineret angreb med tanks og fly"],"review_text":"Blitzkrieg er tysk for lynkrig. Taktikken kombinerede hurtige panserstyrker, fly og infanteri i koordinerede angreb for at bryde igennem fjendtlige linjer, inden modstanderen kunne reagere. Det var centralt i Tysklands hurtige erobringer i 1939-40 — Polen faldt på 5 uger, Frankrig på 46 dage."}'::jsonb,
  'mc', 'short',
  '{"concepts":["Blitzkrieg","tysk taktik","panserkrig"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"world_war_2"}'::jsonb,
  'mc_single', 1, 'auto', true, 'world_war_2', 8, 1
);

-- g8_ww2_b1_03
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er Holocaust?","options":["Den nazistiske systematiske udryddelse af jøder og andre grupper","Et navn for krigens første store slag i Polen","En fredskonference der afsluttede krigen i 1945","En militær operation i Nordafrika"],"correct":"Den nazistiske systematiske udryddelse af jøder og andre grupper","accepted_answers":["Den nazistiske systematiske udryddelse af jøder og andre grupper"],"review_text":"Holocaust er betegnelsen for den nazistiske folkemord, hvor ca. 6 millioner jøder og millioner af andre — herunder romaer, handikappede og politiske modstandere — blev systematisk myrdet. Det var resultatet af nazisternes racistiske ideologi og industrialiserede massehenrettelse i koncentrationslejre som Auschwitz."}'::jsonb,
  'mc', 'short',
  '{"concepts":["Holocaust","folkemord","nazisme","antisemitisme"],"misconception_type":"scope_confusion","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"world_war_2"}'::jsonb,
  'mc_single', 1, 'auto', true, 'world_war_2', 8, 1
);

-- g8_ww2_b1_04
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvornår trådte USA officielt ind i 2. Verdenskrig?","options":["December 1941 — efter Japans angreb på Pearl Harbor","September 1939 — da krigen startede","Juni 1944 — på D-dag","August 1943 — da Mussolini faldt"],"correct":"December 1941 — efter Japans angreb på Pearl Harbor","accepted_answers":["December 1941 — efter Japans angreb på Pearl Harbor"],"review_text":"USA trådte ind i krigen den 8. december 1941, dagen efter Japans angreb på flådebasis Pearl Harbor på Hawaii. Angrebet kostede over 2.400 amerikaneres liv og fik den amerikanske Kongres til at erklære Japan krig. Dage efter erklærede Tyskland og Italien USA krig — og dermed var USA i krig på begge oceaner."}'::jsonb,
  'mc', 'short',
  '{"concepts":["Pearl Harbor","USA i krigen","1941"],"misconception_type":"temporal_confusion","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"world_war_2"}'::jsonb,
  'mc_single', 1, 'auto', true, 'world_war_2', 8, 1
);

-- g8_ww2_b1_05
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var Axis-magterne?","options":["Alliancen mellem Tyskland, Italien og Japan","Alliancen mellem USA, Storbritannien og Frankrig","Et militærpagtsystem fra 1. Verdenskrig","FN''s forgænger oprettet i 1944"],"correct":"Alliancen mellem Tyskland, Italien og Japan","accepted_answers":["Alliancen mellem Tyskland, Italien og Japan"],"review_text":"Axis-magterne — eller Aksen — var den militære alliance ledet af Nazi-Tyskland, Fascist-Italien og Kejserriget Japan. De delte autoritære styreformer og ønsket om territorial ekspansion. Alliancen var formelt etableret med Tripartitpagten i september 1940 og stod i direkte opposition til de Allierede."}'::jsonb,
  'mc', 'short',
  '{"concepts":["Axis","Tripartitpagten","krigens parter"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"world_war_2"}'::jsonb,
  'mc_single', 1, 'auto', true, 'world_war_2', 8, 1
);

-- g8_ww2_b1_06
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var en koncentrationslejr?","options":["Et fangekompleks oprettet af nazisterne til forfølgelse, tvangsarbejde og udryddelse","Et interneringslejr for krigsfanger reguleret af Genèvekonventionen","Et arbejdslejr til frivillig krigsindustri","En karantænestation for civile under bombetogter"],"correct":"Et fangekompleks oprettet af nazisterne til forfølgelse, tvangsarbejde og udryddelse","accepted_answers":["Et fangekompleks oprettet af nazisterne til forfølgelse, tvangsarbejde og udryddelse"],"review_text":"Nazisterne oprettede et netværk af koncentrationslejre fra 1933. Under krigen voksede systemet massivt. Lejrene holdt politiske modstandere, jøder, romaer og andre forfulgte grupper. De største — Auschwitz-Birkenau, Treblinka og Sobibor — fungerede som egentlige udryddelseslejre med gaskamre og krematorier."}'::jsonb,
  'mc', 'short',
  '{"concepts":["koncentrationslejr","Holocaust","nazistisk terror"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"world_war_2"}'::jsonb,
  'mc_single', 1, 'auto', true, 'world_war_2', 8, 1
);

-- g8_ww2_b1_07
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var Nürnberg-lovene?","options":["Racelovgivning fra 1935 der fratog jøder det tyske statsborgerskab","Fredsaftalen der afsluttede 1. Verdenskrig i 1918","Retssagen mod nazistiske krigsforbrydere i 1945-46","Tyske militærlove om tvangsindkaldelse"],"correct":"Racelovgivning fra 1935 der fratog jøder det tyske statsborgerskab","accepted_answers":["Racelovgivning fra 1935 der fratog jøder det tyske statsborgerskab"],"review_text":"Nürnberg-lovene var to racistiske love vedtaget i 1935 i Nazityskland. De fratog jøder det tyske statsborgerskab og forbød ægteskab og seksuelle relationer mellem jøder og ikke-jøder. Lovene var et tidligt skridt i den systematiske juridiske forfølgelse af jøder — en optrapning der endte med Holocaust."}'::jsonb,
  'mc', 'short',
  '{"concepts":["Nürnberg-lovene","antisemitisme","racelovgivning"],"misconception_type":"temporal_confusion","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"world_war_2"}'::jsonb,
  'mc_single', 1, 'auto', true, 'world_war_2', 8, 1
);

-- g8_ww2_b1_08
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var \"De Store Tre\" under 2. Verdenskrig?","options":["Betegnelsen for USA, Storbritannien og Sovjetunionen som de dominerende allierede","De tre lande der underskrev Tripartitpagten","De tre militærgeneraler der ledte D-dag","Frankrig, Polen og Belgien som de første til at blive angrebet"],"correct":"Betegnelsen for USA, Storbritannien og Sovjetunionen som de dominerende allierede","accepted_answers":["Betegnelsen for USA, Storbritannien og Sovjetunionen som de dominerende allierede"],"review_text":"De Store Tre betegnede de tre dominerende allierede magter: USA (Roosevelt/Truman), Storbritannien (Churchill) og Sovjetunionen (Stalin). De koordinerede krigsstrategien og mødtes ved de afgørende konferencer i Teheran (1943), Jalta (1945) og Potsdam (1945) for at bestemme krigens retning og efterkrigstidens Europa."}'::jsonb,
  'mc', 'short',
  '{"concepts":["De Store Tre","Roosevelt","Churchill","Stalin","allierede ledere"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"world_war_2"}'::jsonb,
  'mc_single', 1, 'auto', true, 'world_war_2', 8, 1
);

-- g8_ww2_b1_09
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var Gestapo?","options":["Nazisternes hemmelige statspoliti der overvågede og forfulgte regimets modstandere","En militær efterretningsenhed der analyserede fjendens operationer","Nazisternes propagandaministerium under Goebbels","Et specialkorps til beskyttelse af tyske byer"],"correct":"Nazisternes hemmelige statspoliti der overvågede og forfulgte regimets modstandere","accepted_answers":["Nazisternes hemmelige statspoliti der overvågede og forfulgte regimets modstandere"],"review_text":"Gestapo (Geheime Staatspolizei) var Nazi-Tysklands hemmelige statspoliti, oprettet i 1933. Det stod for overvågning, anholdelse og forhør af alle mistænkt for at modstå regimet — jøder, kommunister, modstandskæmpere og udenlandske agenter. Gestapo arbejdede tæt med SS og var ansvarlig for deportationer til koncentrationslejrene."}'::jsonb,
  'mc', 'short',
  '{"concepts":["Gestapo","nazistisk terror","SS","politistat"],"misconception_type":"scope_confusion","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"world_war_2"}'::jsonb,
  'mc_single', 1, 'auto', true, 'world_war_2', 8, 1
);

-- g8_ww2_b1_10
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad betød den danske besættelse fra 1940 i praksis?","options":["Tyske tropper kontrollerede landet militært, men den danske regering fortsatte i funktion","Danmark blev opdelt i en vestlig og østlig zone under de allierede og Axis-magterne","Den danske kongefamilie flygtede og landet ophørte at eksistere som stat","Danmark sluttede sig frivilligt til den tyske Axis-alliance"],"correct":"Tyske tropper kontrollerede landet militært, men den danske regering fortsatte i funktion","accepted_answers":["Tyske tropper kontrollerede landet militært, men den danske regering fortsatte i funktion"],"review_text":"Da tyske tropper invaderede Danmark den 9. april 1940, valgte den danske regering at samarbejde frem for at kæmpe. Det betød, at Danmark formelt bevarede sin regering og kongemagt under besættelsen — i modsætning til mange andre besatte lande. Samarbejdspolitikken varede til august 1943, da den brød endeligt sammen."}'::jsonb,
  'mc', 'short',
  '{"concepts":["besættelsen","Danmark 1940","samarbejdspolitik"],"misconception_type":"overgeneralization","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"world_war_2"}'::jsonb,
  'mc_single', 1, 'auto', true, 'world_war_2', 8, 1
);

-- ─── BAND 3 — Analysis / Synthesis ──────────────────────────────────────────

-- g8_ww2_b3_01
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var det primære strategiske formål med Operation Overlord (D-dag) i juni 1944?","options":["At åbne en vestlig front og dermed tvinge Tyskland til at kæmpe på to fronter samtidig","At generobre Nordafrika og afskære Axis-magternes olieforsyning","At sænke den tyske flåde i Nordsøen og bryde handelsblokaden","At beskytte neutrale lande som Spanien og Sverige mod tysk invasion"],"correct":"At åbne en vestlig front og dermed tvinge Tyskland til at kæmpe på to fronter samtidig","accepted_answers":["At åbne en vestlig front og dermed tvinge Tyskland til at kæmpe på to fronter samtidig"],"review_text":"D-dag den 6. juni 1944 i Normandiet var den største amfibieroperation i historien. Det strategiske formål var at etablere en vestlig front og dele de tyske ressourcer, som allerede var presset af Sovjet i øst. To-frontskrigen var afgørende — ingen magt i historien har vundet en to-fronts krig i lang tid. Det accelererede Tysklands sammenbrud."}'::jsonb,
  'mc', 'short',
  '{"concepts":["D-dag","Operation Overlord","to-frontskrig","strategi"],"misconception_type":"causal_inversion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"challenge","domain":"world_war_2"}'::jsonb,
  'mc_single', 3, 'auto', true, 'world_war_2', 8, 3
);

-- g8_ww2_b3_02
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var den vigtigste strategiske konsekvens af Slaget om Stalingrad for Tyskland?","options":["Det markerede overgangen fra offensiv til defensiv — Tyskland tog aldrig strategisk initiativ igen på Østfronten","Det tvang Sovjet til at søge fredsforhandlinger for at undgå yderligere tab","Det åbnede vejen for en tysk fremrykning mod Kaukasus og oliefeltene","Det ødelagde den britiske forsyningslinje til Indien via Suez"],"correct":"Det markerede overgangen fra offensiv til defensiv — Tyskland tog aldrig strategisk initiativ igen på Østfronten","accepted_answers":["Det markerede overgangen fra offensiv til defensiv — Tyskland tog aldrig strategisk initiativ igen på Østfronten"],"review_text":"Slaget om Stalingrad (1942-43) kostede Tysklands 6. Armé over 800.000 mand i tab. Men det vigtigste var den strategiske konsekvens: efter Stalingrad var den tyske hær aldrig igen i stand til at lancere store offensive operationer på Østfronten. Initiativet gik permanent over til Sovjet, som drev tyskerne tilbage det næste halvandet år frem til Berlin."}'::jsonb,
  'mc', 'short',
  '{"concepts":["Stalingrad","vendepunkt","Østfronten","strategisk initiative"],"misconception_type":"causal_inversion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"challenge","domain":"world_war_2"}'::jsonb,
  'mc_single', 3, 'auto', true, 'world_war_2', 8, 3
);

-- g8_ww2_b3_03
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var den primære langsigtede konsekvens af Japans angreb på Pearl Harbor?","options":["USA trådte ind i krigen og tilførte de allierede en industrikapacitet Axis-magterne ikke kunne matche","Japan vandt varig kontrol over Stillehavet og isolerede Australien","USA erklærede kun Japan krig og holdt sig neutral over for Europa","Storbritanniens Stillehavsflåde blev totalt tilintetgjort"],"correct":"USA trådte ind i krigen og tilførte de allierede en industrikapacitet Axis-magterne ikke kunne matche","accepted_answers":["USA trådte ind i krigen og tilførte de allierede en industrikapacitet Axis-magterne ikke kunne matche"],"review_text":"Pearl Harbor trak USA ind i krigen — men den afgørende konsekvens var ikke de militære tab i havnen. Det var USA''s enorma industrikapacitet: landet producerede fly, skibe og ammunition i et tempo, Axis-magterne umuligt kunne matche. USA byggede fx 300.000 fly under krigen mod Tysklands 119.000. Den industrielle asymmetri afgjorde krigen."}'::jsonb,
  'mc', 'short',
  '{"concepts":["Pearl Harbor","USA","industrikapacitet","krigens udfald"],"misconception_type":"surface_association","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"challenge","domain":"world_war_2"}'::jsonb,
  'mc_single', 3, 'auto', true, 'world_war_2', 8, 3
);

-- g8_ww2_b3_04
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var Lend-Lease Acts afgørende bidrag til krigsførelsen, inden USA selv trådte ind?","options":["USA forsynede de allierede med materiel og ressourcer uden krav om øjeblikkelig betaling — og holdt dem kæmpende","USA udlånte trænede soldater til britiske enheder i Europa og Nordafrika","De allierede stillede koloniområder som garanti for amerikanske krigsomkostninger","Canada og Australien overtog den britiske forsyningslinje som tak for hjælpen"],"correct":"USA forsynede de allierede med materiel og ressourcer uden krav om øjeblikkelig betaling — og holdt dem kæmpende","accepted_answers":["USA forsynede de allierede med materiel og ressourcer uden krav om øjeblikkelig betaling — og holdt dem kæmpende"],"review_text":"Lend-Lease Act fra marts 1941 — otte måneder inden USA kom i krig — tillod USA at sende fly, tanks, mad og råmaterialer til allierede lande uden krav om betaling under krigen. Programmet sendte over 50 milliarder dollar i hjælp (ca. 700 milliarder nutidspriser) primært til Storbritannien og Sovjet. Det var en forudsætning for, at de allierede overhovedet holdt stand."}'::jsonb,
  'mc', 'short',
  '{"concepts":["Lend-Lease","USA","materiel","allierede styrke"],"misconception_type":"scope_confusion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"challenge","domain":"world_war_2"}'::jsonb,
  'mc_single', 3, 'auto', true, 'world_war_2', 8, 3
);

-- g8_ww2_b3_05
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var det primære formål med Marshallplanen efter krigen?","options":["At genopbygge Europas økonomi og dermed reducere risikoen for kommunistisk magtovertagelse","At straffe Aksemagterne og sikre krigsskadeserstatning til de besatte lande","At oprette NATO som kollektivt militært forsvar mod Sovjet","At sikre britiske og franske kolonier i Afrika og Asien mod national frigørelse"],"correct":"At genopbygge Europas økonomi og dermed reducere risikoen for kommunistisk magtovertagelse","accepted_answers":["At genopbygge Europas økonomi og dermed reducere risikoen for kommunistisk magtovertagelse"],"review_text":"Marshallplanen (1948-52) gav ca. 13 milliarder dollars til genopbygning af de vesteuropæiske lande. Begrundelsen var tosidet: humanitær hjælp til krigsødelagte lande OG politisk kalkule — et stabilt, velstående Vesteuropa ville modstå kommunistisk indflydelse, som Sovjet aktivt forsøgte at sprede i det kaotiske efterkrigseuropa. Det var starten på den Kolde Krig."}'::jsonb,
  'mc', 'short',
  '{"concepts":["Marshallplanen","Kold Krig","efterkrigstiden","kommunisme"],"misconception_type":"causal_inversion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"challenge","domain":"world_war_2"}'::jsonb,
  'mc_single', 3, 'auto', true, 'world_war_2', 8, 3
);

-- g8_ww2_b3_06
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvorfor faldt Frankrig så hurtigt i maj-juni 1940 til trods for en stor hær?","options":["Tysklands panserstyrker brød igennem Ardennerne og omgik den befæstede Maginot-linje","Frankrig valgte at overgive sig uden kamp for at skåne den civile befolkning","Den britiske hær forlod Frankrig inden den tyske invasion begyndte","Frankrig manglede et moderne luftforsvar og kunne ikke beskytte sine byer"],"correct":"Tysklands panserstyrker brød igennem Ardennerne og omgik den befæstede Maginot-linje","accepted_answers":["Tysklands panserstyrker brød igennem Ardennerne og omgik den befæstede Maginot-linje"],"review_text":"Frankrig byggede Maginot-linjen — et massivt befæstet forsvarssystem langs grænsen til Tyskland — men troede Ardennerne (tæt skov og bjerge) var uigennemtrængeligt for panserstyrker. Det udnyttede Tyskland: panserdivisioner brød hurtigt igennem og omringede de franske og britiske styrker nord for gennembruddets punkt. Paris faldt den 14. juni 1940 — 46 dage efter invasionen."}'::jsonb,
  'mc', 'short',
  '{"concepts":["Frankrig 1940","Maginot-linjen","Ardennerne","Blitzkrieg"],"misconception_type":"causal_inversion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"challenge","domain":"world_war_2"}'::jsonb,
  'mc_single', 3, 'auto', true, 'world_war_2', 8, 3
);

-- g8_ww2_b3_07
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var FN''s primære formål ved oprettelsen i 1945?","options":["At forhindre fremtidige krige gennem internationalt diplomati og kollektiv sikkerhed","At administrere de besatte tyske og japanske territorier under de allierede","At koordinere Vestens militære forsvar mod en mulig sovjetisk ekspansion","At sikre, at de allierede stormagter fik varig kontrol over globale ressourcer"],"correct":"At forhindre fremtidige krige gennem internationalt diplomati og kollektiv sikkerhed","accepted_answers":["At forhindre fremtidige krige gennem internationalt diplomati og kollektiv sikkerhed"],"review_text":"FN (Forenede Nationer) blev grundlagt i 1945 som erstatning for det mislykkede Folkeforbund, der ikke havde formået at forhindre 2. Verdenskrig. Kerneformålet var et forum for diplomatisk løsning af konflikter og kollektiv sikkerhed. Sikkerhedsrådet med vetomagt til stormagterne (USA, Sovjet, UK, Frankrig, Kina) afspejler direkte krigens magtbalance."}'::jsonb,
  'mc', 'short',
  '{"concepts":["FN","international orden","efterkrigstiden","kollektiv sikkerhed"],"misconception_type":"false_equivalence","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"challenge","domain":"world_war_2"}'::jsonb,
  'mc_single', 3, 'auto', true, 'world_war_2', 8, 3
);

-- g8_ww2_b3_08
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var atomvåbnenes strategiske funktion i krigens afslutning i Stillehavet?","options":["De demonstrerede en teknologisk kapacitet Japan ikke kunne gengælde — og overbeviste Japan om, at kapitulation var den eneste udvej","De eliminerede fuldstændig den japanske flåde og umuliggjorde fortsat forsyning af øerne","De ødelagde Japans industrielle produktionsanlæg i Manchuriet og Korea","De tvang Sovjet til at trække sin nylige krigserklæring mod Japan tilbage"],"correct":"De demonstrerede en teknologisk kapacitet Japan ikke kunne gengælde — og overbeviste Japan om, at kapitulation var den eneste udvej","accepted_answers":["De demonstrerede en teknologisk kapacitet Japan ikke kunne gengælde — og overbeviste Japan om, at kapitulation var den eneste udvej"],"review_text":"Atombombe-angrebene på Hiroshima (6. august) og Nagasaki (9. august 1945) dræbte over 200.000 mennesker. Den strategiske virkning var, at Japan stod over for en destruktiv teknologi, de ikke besad og ikke kunne gengælde. Kombineret med Sovjet-krigserklæringen og de katastrofale tab ved Iwo Jima og Okinawa, besluttede kejser Hirohito at overgive sig den 15. august 1945."}'::jsonb,
  'mc', 'short',
  '{"concepts":["atombombe","Hiroshima","Japans kapitulation","Stillehavskrigen"],"misconception_type":"causal_inversion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"challenge","domain":"world_war_2"}'::jsonb,
  'mc_single', 3, 'auto', true, 'world_war_2', 8, 3
);
