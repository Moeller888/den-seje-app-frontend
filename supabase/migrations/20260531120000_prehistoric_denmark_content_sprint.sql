-- Section 81 — Prehistoric Denmark Content Sprint
-- 50 questions: Grade 3 (25) + Grade 4 (25). Opens Grade 3 for the first time.
-- Bands: B1×18, B2×16, B3×12, B4×4
-- Grade 3: B1×10, B2×8, B3×6, B4×1
-- Grade 4: B1×8, B2×8, B3×6, B4×3
-- Domain: prehistoric_denmark. Grade 3–4 readability. Short sentences. Concrete vocabulary.

-- ─── GRADE 3 · BAND 1 (10 questions) ─────────────────────────────────────────

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var Stenalderen?","options":["En lang tid hvor folk brugte sten til at lave redskaber","En tid da der kun var sten og ingen dyr","En tid da folk boede i sten-slotte","Et sted hvor der var mange sten"],"correct":"En lang tid hvor folk brugte sten til at lave redskaber","accepted_answers":["En lang tid hvor folk brugte sten til at lave redskaber"],"review_text":"Stenalderen er opkaldt efter sten. Folk lavede knive og spyd af sten. Det var meget, meget lang tid siden."}'::jsonb,
  'mc','short','{"concepts":["Stenalder","sten","redskaber"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad spiste folk i den tidlige Stenalder?","options":["Dyr de jagede og bær og svampe de samlede","Brød og mælk fra butikken","Kun fisk fra havet","Frugt fra haver de dyrkede"],"correct":"Dyr de jagede og bær og svampe de samlede","accepted_answers":["Dyr de jagede og bær og svampe de samlede"],"review_text":"De tidligste folk i Danmark jagede dyr og samlede mad fra naturen. De dyrkede ikke marker. De fandt al mad i skoven og ved vandet."}'::jsonb,
  'mc','short','{"concepts":["jæger-samler","mad","jagt","indsamling"],"misconception_type":"scope_confusion","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad lavede folk redskaber af i Stenalderen?","options":["Flint — en hård sten man kan slå skarpe kanter af","Jern og stål som smedene lavede","Træ og plastik","Guld og sølv"],"correct":"Flint — en hård sten man kan slå skarpe kanter af","accepted_answers":["Flint — en hård sten man kan slå skarpe kanter af"],"review_text":"Flint er en særlig hård sten. Man kan slå stykker af den så det bliver meget skarpt. Det er som en naturlig kniv."}'::jsonb,
  'mc','short','{"concepts":["flint","redskaber","Stenalder","materiale"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad boede folk i under den tidlige Stenalder?","options":["I telte af dyrehud eller under åben himmel","I murstenshuse med vinduer","I høje bygninger af træ","I underjordiske huler under byer"],"correct":"I telte af dyrehud eller under åben himmel","accepted_answers":["I telte af dyrehud eller under åben himmel"],"review_text":"De tidligste folk i Danmark boede ikke samme sted hele tiden. De flyttede efter dyrene. Derfor brugte de lette telte der let kunne flyttes."}'::jsonb,
  'mc','short','{"concepts":["hjem","telt","dyrehud","nomader","misconception-hulemænd"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvilke dyr levede der i Danmark i Stenalderen?","options":["Elge, urokser, vildsvin og bævere","Løver, elefanter og giraffer","Kun fugle og fisk","Katte og hunde som kæledyr"],"correct":"Elge, urokser, vildsvin og bævere","accepted_answers":["Elge, urokser, vildsvin og bævere"],"review_text":"Stenalderens Danmark var fuld af vilde dyr. Elge var store hjorte. Urokser var kæmpe vilde køer. Folk jagede disse dyr til mad."}'::jsonb,
  'mc','short','{"concepts":["dyr","Stenalder","jagt","elg","urokse"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er Bronzealderen opkaldt efter?","options":["Et metal der hedder bronze — lavet af kobber og tin blandet sammen","Et dyr der hed bronzen","En by der hed Bronze","Et bjerg med masser af guld"],"correct":"Et metal der hedder bronze — lavet af kobber og tin blandet sammen","accepted_answers":["Et metal der hedder bronze — lavet af kobber og tin blandet sammen"],"review_text":"Bronze er et metal. Det laves ved at smelte kobber og tin sammen. I Bronzealderen lærte folk at lave redskaber og smykker af bronze."}'::jsonb,
  'mc','short','{"concepts":["bronze","Bronzealder","kobber","tin","metal"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er Jernalderen opkaldt efter?","options":["Jern — et metal der er stærkere og mere almindeligt end bronze","Et dyr der hed jernet","En skov der var fuld af jernstænger","En periode da alt var lavet af jern"],"correct":"Jern — et metal der er stærkere og mere almindeligt end bronze","accepted_answers":["Jern — et metal der er stærkere og mere almindeligt end bronze"],"review_text":"Jern er et stærkt metal. Man fandt det i de danske moser. Da folk lærte at bruge jern, lavede de endnu bedre redskaber end af bronze."}'::jsonb,
  'mc','short','{"concepts":["jern","Jernalder","metal","redskaber"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvornår begyndte folk i Danmark at dyrke marker?","options":["I den sene Stenalder — for cirka 6000 år siden","For 100 år siden","Allerede i Bronzealderen","Aldrig — folk i Danmark jagtede altid"],"correct":"I den sene Stenalder — for cirka 6000 år siden","accepted_answers":["I den sene Stenalder — for cirka 6000 år siden"],"review_text":"For cirka 6000 år siden lærte folk i Danmark at dyrke korn og holde husdyr. Det ændrede alt. De behøvede ikke flytte mere."}'::jsonb,
  'mc','short','{"concepts":["landbrug","Stenalder","marker","husdyr"],"misconception_type":"temporal_confusion","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad lavede folk tøj af i forhistorisk Danmark?","options":["Dyrehud og uld fra får","Bomuld og nylon","Blade og plastik","Papir og metal"],"correct":"Dyrehud og uld fra får","accepted_answers":["Dyrehud og uld fra får"],"review_text":"Tøj i forhistorisk Danmark var lavet af det folk havde. De brugte hud fra dyr og uld fra får. Tøjet holdt dem varme om vinteren."}'::jsonb,
  'mc','short','{"concepts":["tøj","dyrehud","uld","klæder"],"misconception_type":"anachronism","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er en gravhøj?","options":["En stor jordbanke der dækker over et gravkammer","Et sted man gemte mad til vinteren","Et fort til at forsvare landsbyen","Et sted børn legede"],"correct":"En stor jordbanke der dækker over et gravkammer","accepted_answers":["En stor jordbanke der dækker over et gravkammer"],"review_text":"En gravhøj er en høj jordbanke. Under den ligger der et gravkammer. De vigtigste folk blev begravet der med deres ting."}'::jsonb,
  'mc','short','{"concepts":["gravhøj","begravelse","jordbanke","gravkammer"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',3,1
);

-- ─── GRADE 3 · BAND 2 (8 questions) ─────────────────────────────────────────

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvorfor flyttede folk tit i den tidlige Stenalder?","options":["De fulgte dyrene — og dyrene vandrede med årstiderne","De kedede sig og ville se nye steder","Kongen beordrede dem til at flytte","Deres huse var på hjul"],"correct":"De fulgte dyrene — og dyrene vandrede med årstiderne","accepted_answers":["De fulgte dyrene — og dyrene vandrede med årstiderne"],"review_text":"Folk i den tidlige Stenalder levede af at jage. Dyrene bevægede sig med årstiderne. Så måtte folk også flytte for at have mad nok."}'::jsonb,
  'mc','short','{"concepts":["nomader","jæger-samler","flytning","årstider","dyr"],"misconception_type":"causal_inversion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad ændrede sig da folk begyndte at dyrke marker?","options":["De kunne bo samme sted hele livet — de behøvede ikke flytte efter dyrene","De holdt op med at spise kød","De begyndte at bo alene","Ingenting ændrede sig"],"correct":"De kunne bo samme sted hele livet — de behøvede ikke flytte efter dyrene","accepted_answers":["De kunne bo samme sted hele livet — de behøvede ikke flytte efter dyrene"],"review_text":"Da folk dyrkede marker, boede de fast. De byggede bedre huse. De samlede mad nok til vinteren. Det var en kæmpe forandring."}'::jsonb,
  'mc','short','{"concepts":["landbrug","fast bopæl","forandring","huse"],"misconception_type":"causal_inversion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvorfor var gode redskaber vigtige for de første folk i Danmark?","options":["Redskaber hjalp dem med at jage, skære mad, bygge huse og lave tøj","Redskaber var kun til pynt","Redskaber var kun brugt af chefer","Redskaber var ikke vigtige — folk klarede sig uden"],"correct":"Redskaber hjalp dem med at jage, skære mad, bygge huse og lave tøj","accepted_answers":["Redskaber hjalp dem med at jage, skære mad, bygge huse og lave tøj"],"review_text":"Redskaber var hverdagens nødvendige ting. En god flintkniv til at skære kød. Et spyd til at jage. En nål til at sy tøj. Uden redskaber var livet meget sværere."}'::jsonb,
  'mc','short','{"concepts":["redskaber","jagt","bygge","tøj","hverdagsliv"],"misconception_type":"scope_confusion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvorfor var bronze bedre end flint til redskaber?","options":["Bronze kunne smeltes til en god form og gik ikke i stykker som flint","Bronze var gratis og let at finde","Flint var giftig mens bronze var sikker","Bronze smeltede i solen og var bedre at bruge flydende"],"correct":"Bronze kunne smeltes til en god form og gik ikke i stykker som flint","accepted_answers":["Bronze kunne smeltes til en god form og gik ikke i stykker som flint"],"review_text":"Flint kan brækkes. Bronze kan smeltes og støbes i en form. Man kan lave præcis den form man vil. Og bronze kan slibes skarp igen."}'::jsonb,
  'mc','short','{"concepts":["bronze","flint","redskaber","smeltning","form"],"misconception_type":"false_equivalence","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvorfor var jern bedre end bronze?","options":["Jern var hårdere og let at finde i de danske moser","Jern var billigere fordi det kom fra udlandet","Bronze ruster men jern gør ikke","Jern er lettere at smelte end bronze"],"correct":"Jern var hårdere og let at finde i de danske moser","accepted_answers":["Jern var hårdere og let at finde i de danske moser"],"review_text":"For at lave bronze skulle man have kobber OG tin. De fandtes ikke i Danmark. Jern kunne folk finde i de danske moser. Det betød at alle kunne lave jernredskaber."}'::jsonb,
  'mc','short','{"concepts":["jern","bronze","moser","myremalm","tilgængelighed"],"misconception_type":"false_equivalence","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvordan fik folk i forhistorisk Danmark ting de ikke selv kunne lave?","options":["De byttede — gav noget de havde til folk der havde det de manglede","De bestilte det på nettet","De rejste til butikker i Europa","De stjal det fra hinanden"],"correct":"De byttede — gav noget de havde til folk der havde det de manglede","accepted_answers":["De byttede — gav noget de havde til folk der havde det de manglede"],"review_text":"Der var ingen butikker. Men der var byttehandel. Rav fra den danske kyst var meget værdifuldt. Folk byttede rav mod bronze fra andre lande."}'::jsonb,
  'mc','short','{"concepts":["handel","byttehandel","rav","bronze","udveksling"],"misconception_type":"anachronism","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Boede forhistoriske folk i Danmark alene eller i grupper?","options":["I grupper — familien og nabofamilier boede og arbejdede tæt sammen","Altid alene i skoven","Kun mænd boede sammen — kvinder boede alene","I kæmpe byer med tusindvis af mennesker"],"correct":"I grupper — familien og nabofamilier boede og arbejdede tæt sammen","accepted_answers":["I grupper — familien og nabofamilier boede og arbejdede tæt sammen"],"review_text":"Folk boede i grupper. Det var nødvendigt. En familie alene kunne ikke jage store dyr. Grupper af familier hjalp hinanden og delte maden."}'::jsonb,
  'mc','short','{"concepts":["gruppe","fællesskab","familie","samarbejde","misconception-alle-levede-alene"],"misconception_type":"overgeneralization","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad viser det at folk brugte meget tid og mange arme på at bygge gravhøje?","options":["At den begravede person var vigtig og respekteret i gruppen","At de ikke havde andet at lave","At de var bange for de døde","At gravhøje var let at bygge"],"correct":"At den begravede person var vigtig og respekteret i gruppen","accepted_answers":["At den begravede person var vigtig og respekteret i gruppen"],"review_text":"En gravhøj kræver meget arbejde. Mange folk måtte hjælpe med at bære jord. Det viser at den begravede person var vigtig og respekteret."}'::jsonb,
  'mc','short','{"concepts":["gravhøj","respekt","begravelse","vigtighed","fællesskab"],"misconception_type":"causal_inversion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',3,2
);

-- ─── GRADE 3 · BAND 3 (6 questions) ─────────────────────────────────────────

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var den største forandring da folk begyndte at dyrke marker?","options":["Folk behøvede ikke flytte mere og kunne bygge rigtige landsbyer","Folk holdt op med at spise kød og fisk for evigt","Dyrene forsvandt fordi folk dyrkede marker i stedet","Folk begyndte at krige mod hinanden om marker"],"correct":"Folk behøvede ikke flytte mere og kunne bygge rigtige landsbyer","accepted_answers":["Folk behøvede ikke flytte mere og kunne bygge rigtige landsbyer"],"review_text":"Bondelivet ændrede alt. Fast bopæl. Rigtige huse. Mad til vinteren. Det skabte grundlaget for landsbyer og fællesskab."}'::jsonb,
  'mc','short','{"concepts":["landbrug","fast bopæl","landsby","forandring"],"misconception_type":"causal_inversion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',3,'auto',true,'prehistoric_denmark',3,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Er det rigtigt at alle i en stenaldergruppe jagede dyr?","options":["Nej — kvinder, ældre og børn samlede bær og planter mens de unge mænd oftest jagede","Ja — alle jagede, også børn og ældre","Ja — ingen samlede planter, alle jagede","Nej — ingen jagede, alle samlede kun planter"],"correct":"Nej — kvinder, ældre og børn samlede bær og planter mens de unge mænd oftest jagede","accepted_answers":["Nej — kvinder, ældre og børn samlede bær og planter mens de unge mænd oftest jagede"],"review_text":"Der var arbejdsdeling. Ikke alle jagede. Mange samlede bær og rødder. Det var også en vigtig del af maden. Mange grupper fik mere mad fra indsamling end fra jagt."}'::jsonb,
  'mc','short','{"concepts":["arbejdsdeling","jagt","indsamling","misconception-alle-jagede","kønsroller"],"misconception_type":"overgeneralization","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',3,'auto',true,'prehistoric_denmark',3,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad viser det at forhistoriske folk lavede præcise flintknive og smukke bronzesmykker?","options":["At de var intelligente og dygtige — det kræver store evner at lave sådanne ting","At de kopierede redskaberne fra bøger","At de var heldige og fandt tingene i naturen","At det var nemt og alle kunne gøre det"],"correct":"At de var intelligente og dygtige — det kræver store evner at lave sådanne ting","accepted_answers":["At de var intelligente og dygtige — det kræver store evner at lave sådanne ting"],"review_text":"At slå en flintkniv kræver præcision og viden. At støbe et bronzesmykke kræver at forstå varme og form. Forhistoriske folk var meget dygtige håndværkere."}'::jsonb,
  'mc','short','{"concepts":["intelligens","håndværk","flint","bronze","misconception-primitive-folk"],"misconception_type":"overgeneralization","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',3,'auto',true,'prehistoric_denmark',3,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Er det rigtigt at folk i Danmark levede på præcis samme måde i hele Stenalderen?","options":["Nej — Stenalderen varer næsten 10.000 år og meget ændrede sig. Jægere blev bønder","Ja — intet ændrede sig i hele Stenalderen","Ja — folk levede altid ens fordi de ikke var smarte nok til at ændre noget","Nej — folk levede forskelligt men kun fordi vejret ændrede sig"],"correct":"Nej — Stenalderen varer næsten 10.000 år og meget ændrede sig. Jægere blev bønder","accepted_answers":["Nej — Stenalderen varer næsten 10.000 år og meget ændrede sig. Jægere blev bønder"],"review_text":"Stenalderen er ikke ét øjeblik. Den varer næsten 10.000 år. I det tidsrum ændrede folk sig fra jægere til bønder. Det er en kæmpe forandring."}'::jsonb,
  'mc','short','{"concepts":["forandring","Stenalder","tid","misconception-ingen-forandring"],"misconception_type":"temporal_confusion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',3,'auto',true,'prehistoric_denmark',3,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvordan ændrede hjemmene sig fra jæger-samler til bonde-tid?","options":["Fra lette flytbare telte til faste træhuse med stråtag","Fra træhuse til telte da det blev koldere","Fra stenhuse til plasticteltet","Hjemmene ændrede sig slet ikke"],"correct":"Fra lette flytbare telte til faste træhuse med stråtag","accepted_answers":["Fra lette flytbare telte til faste træhuse med stråtag"],"review_text":"Jæger-samlere brugte lette telte fordi de ofte flyttede. Da folk blev bønder og boede fast, byggede de rigtige huse af træ med stråtag."}'::jsonb,
  'mc','short','{"concepts":["hjem","telt","træhus","forandring","bønder"],"misconception_type":"causal_inversion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',3,'auto',true,'prehistoric_denmark',3,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er forkert ved forestillingen om at stenalderfolk lavede primitive og dumme redskaber?","options":["Flintredskaber kan være ekstremt skarpe — skarpere end mange moderne knive","Forestillingen er korrekt — stenalderredskaber var meget primitive","Flintredskaber var kun til pynt","Stenalderfolk brugte slet ikke redskaber"],"correct":"Flintredskaber kan være ekstremt skarpe — skarpere end mange moderne knive","accepted_answers":["Flintredskaber kan være ekstremt skarpe — skarpere end mange moderne knive"],"review_text":"Flint kan slås til en ekstremt skarp æg. Det kræver stor dygtighed. Stenalderfolk var mesterlige redskabsmagere — ikke primitive."}'::jsonb,
  'mc','short','{"concepts":["flint","skarphed","dygtighed","misconception-primitive-redskaber","håndværk"],"misconception_type":"overgeneralization","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',3,'auto',true,'prehistoric_denmark',3,3
);

-- ─── GRADE 3 · BAND 4 (1 question) ──────────────────────────────────────────

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad kan vi lære af at studere hvordan de første folk i Danmark levede?","options":["At mennesker altid har løst problemer og skabt ting til at gøre livet bedre","At forhistoriske folk var dumme og ikke forstod noget","At intet har ændret sig siden Stenalderen","At vi ikke kan lære noget af fortiden"],"correct":"At mennesker altid har løst problemer og skabt ting til at gøre livet bedre","accepted_answers":["At mennesker altid har løst problemer og skabt ting til at gøre livet bedre"],"review_text":"De første danskere fandt ud af at jage, samle, dyrke, bygge og handle. Hvert problem fik en løsning. Det er præcis hvad mennesker stadig gør i dag."}'::jsonb,
  'mc','short','{"concepts":["historisk lektie","problemløsning","menneske","kontinuitet"],"misconception_type":"temporal_confusion","cognitive_skill":"evaluation","difficulty_type":"applied","insight_type":"perspective_shift","challenge_role":"deep_challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',4,'auto',true,'prehistoric_denmark',3,4
);

-- ─── GRADE 4 · BAND 1 (8 questions) ─────────────────────────────────────────

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad kaldes de to hovedperioder i Danmarks Stenalder?","options":["Ældre Stenalder (jæger-samlere) og Yngre Stenalder (bønder)","Tidlig Stenalder og Sen Stenalder — begge med bønder","Kold Stenalder og Varm Stenalder","Flint-tid og Lerkar-tid"],"correct":"Ældre Stenalder (jæger-samlere) og Yngre Stenalder (bønder)","accepted_answers":["Ældre Stenalder (jæger-samlere) og Yngre Stenalder (bønder)"],"review_text":"Danmarks Stenalder deles i to. Ældre Stenalder: folk jagede og samlede. Yngre Stenalder: folk begyndte at dyrke marker og holde husdyr. Det er to meget forskellige måder at leve på."}'::jsonb,
  'mc','short','{"concepts":["Ældre Stenalder","Yngre Stenalder","periodisering","jæger-samler","bønder"],"misconception_type":"temporal_confusion","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad fandt arkæologer i store køkkenmøddinger ved Danmarks kyst?","options":["Millioner af muslinge- og østersskaller — rester fra mange måltider","Guld og bronzesmykker fra handelen","Ruiner af store stenhuse","Skriftlige tekster om jægerlivet"],"correct":"Millioner af muslinge- og østersskaller — rester fra mange måltider","accepted_answers":["Millioner af muslinge- og østersskaller — rester fra mange måltider"],"review_text":"Køkkenmøddinger er affaldsbunker fra stenalderfolk. De består mest af muslingeskaller. De fortæller os at kystfolk spiste massivt af havets dyr. Det er madhistorie i affaldet."}'::jsonb,
  'mc','short','{"concepts":["køkkenmøddinger","muslinger","kyst","arkæologi","mad"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad skulle til for at lave bronze?","options":["Man smeltede kobber og tin sammen — ingen af dem fandtes i Danmark","Man smed flintsten hårdt mod hinanden","Man kogte jern og kobber i vand","Man fandt bronze-sten i Danmark"],"correct":"Man smeltede kobber og tin sammen — ingen af dem fandtes i Danmark","accepted_answers":["Man smeltede kobber og tin sammen — ingen af dem fandtes i Danmark"],"review_text":"Bronze laves af kobber og tin. Danmark har hverken kobber eller tin. Det betød at folk skulle handle med lande langt borte for at skaffe materialerne."}'::jsonb,
  'mc','short','{"concepts":["bronze","kobber","tin","handel","råmaterialer"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvorfra fik folk i Danmarks Jernalder jern?","options":["Fra myremalm — en jernforbindelse der dannede sig i de danske moser","Fra handelsskibe fra Asien","Fra miner dybt under jorden i Jylland","Fra meteoritter der faldt fra himlen"],"correct":"Fra myremalm — en jernforbindelse der dannede sig i de danske moser","accepted_answers":["Fra myremalm — en jernforbindelse der dannede sig i de danske moser"],"review_text":"Myremalm er jernforbindelser der samler sig i mosernes bund. Det fandtes overalt i Danmark. Det betød at alle kunne lave jern — ikke kun dem der handlede med udlandet."}'::jsonb,
  'mc','short','{"concepts":["myremalm","jern","moser","Jernalder","tilgængelighed"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er en dysse?","options":["Et gravkammer fra Yngre Stenalder — store sten sat op som vægge med en stor dæksten på toppen","En slags brønd til drikkevand","Et hegn af store sten rundt om en landsby","Et sted man ofrede mad til guderne"],"correct":"Et gravkammer fra Yngre Stenalder — store sten sat op som vægge med en stor dæksten på toppen","accepted_answers":["Et gravkammer fra Yngre Stenalder — store sten sat op som vægge med en stor dæksten på toppen"],"review_text":"Dysser er Danmarks ældste gravmonumenter. Store sten bærer en dæksten. Inde i kammeret begravede man de døde. Over 700 dysser findes stadig i Danmark."}'::jsonb,
  'mc','short','{"concepts":["dysse","gravkammer","Yngre Stenalder","sten","gravmonument"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er rav og hvorfra kommer det?","options":["Hærdet planteharpiks — ofte gul-brun og gennemsigtig. Det skylles op på de danske strande","Et metal man fandt i Danmarks fjorde","Et instrument man brugte til at spille musik","En type korn man dyrkede i Bronzealderen"],"correct":"Hærdet planteharpiks — ofte gul-brun og gennemsigtig. Det skylles op på de danske strande","accepted_answers":["Hærdet planteharpiks — ofte gul-brun og gennemsigtig. Det skylles op på de danske strande"],"review_text":"Rav er fossil planteharpiks. Det er smuk og gennemsigtig. Det skylles op på de danske strande. I Bronzealderen var rav ekstremt værdifuldt og folk rejste langt for at handle med det."}'::jsonb,
  'mc','short','{"concepts":["rav","harpiks","strand","handel","Bronzealder"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvilke husdyr holdt de første bønder i Danmark?","options":["Kvæg, får, geder og svin","Heste, kameler og æsler","Ulve, ræve og hjorte","Katte og kaniner"],"correct":"Kvæg, får, geder og svin","accepted_answers":["Kvæg, får, geder og svin"],"review_text":"De første bønder i Danmark tæmmede vilde dyr og avlede dem som husdyr. Kvæg gav kød og mælk. Får gav uld og kød. Svin spiste affald og gav kød."}'::jsonb,
  'mc','short','{"concepts":["husdyr","kvæg","får","svin","bønder"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er et moseleg?","options":["Et menneske bevaret i tusindvis af år i en mose fordi mosen er sur og iltfattig","Et kunstigt menneskefigur lavet af ler til religiøse formål","Et skelet af et forhistorisk dyr fundet i en dansk mose","Et redskab brugt til at dyrke moser"],"correct":"Et menneske bevaret i tusindvis af år i en mose fordi mosen er sur og iltfattig","accepted_answers":["Et menneske bevaret i tusindvis af år i en mose fordi mosen er sur og iltfattig"],"review_text":"Moser bevarer organisk materiale. Moselig er rigtige mennesker fra for 2000-2500 år siden. Man kan se deres ansigt og hud. Tollandmanden er det mest berømte moseleg fra Danmark."}'::jsonb,
  'mc','short','{"concepts":["moseleg","bevaring","mose","Tollandmanden","Jernalder"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',4,1
);

-- ─── GRADE 4 · BAND 2 (8 questions) ─────────────────────────────────────────

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var den vigtigste fordel ved bronze sammenlignet med flint?","options":["Bronze kunne støbes i enhver form og slibes skarp igen — flint brekkede og kunne ikke repareres","Bronze var gratis mens flint kostede mange dage at lave","Bronze var tungere og bedre til at slå fjender","Bronze var smukkere og det var det eneste der betød noget"],"correct":"Bronze kunne støbes i enhver form og slibes skarp igen — flint brekkede og kunne ikke repareres","accepted_answers":["Bronze kunne støbes i enhver form og slibes skarp igen — flint brekkede og kunne ikke repareres"],"review_text":"Flintredskaber er engangsredskaber. Når de brækker, laver man et nyt. Bronze kan støbes, slibes og omformes igen og igen. Det var en revolution i redskabsteknologi."}'::jsonb,
  'mc','short','{"concepts":["bronze","flint","redskabsteknologi","støbning","slibning"],"misconception_type":"false_equivalence","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvorfor ændrede jernet magtbalancen i forhistorisk Danmark?","options":["Jern fandtes i moserne overalt — alle kunne skaffe det. Bronze krævede sjælne råmaterialer fra udlandet som kun de rige havde råd til","Jern var billigere fordi det var lettere at lave end bronze","Jern var et religiøst metal som præster delte ud gratis","Jern var svagere end bronze men mere ærefuldt at eje"],"correct":"Jern fandtes i moserne overalt — alle kunne skaffe det. Bronze krævede sjælne råmaterialer fra udlandet som kun de rige havde råd til","accepted_answers":["Jern fandtes i moserne overalt — alle kunne skaffe det. Bronze krævede sjælne råmaterialer fra udlandet som kun de rige havde råd til"],"review_text":"Med bronze var man afhængig af dyr handel med udlandet. Myremalm fandtes overalt i Danmark. Da jernet kom, kunne langt flere familier lave deres egne redskaber. Metal blev tilgængeligt for alle."}'::jsonb,
  'mc','short','{"concepts":["jern","bronze","magt","tilgængelighed","myremalm"],"misconception_type":"causal_inversion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad betød det for et landområde da folk gik fra jæger-samler til bondeliv?","options":["Landsbyer opstod — folk boede fast og byggede huse, kornlagre og indhegninger","Folk begyndte at bo endnu mere spredt fordi de nu ejede jord","Landsbyer forsvandt og folk boede atter alene i skoven","Ingenting ændrede sig — folk boede på samme måde"],"correct":"Landsbyer opstod — folk boede fast og byggede huse, kornlagre og indhegninger","accepted_answers":["Landsbyer opstod — folk boede fast og byggede huse, kornlagre og indhegninger"],"review_text":"Fast bosættelse skabte et nyt landskab. Huse. Kornlagre. Hegn om markerne. Husdyrfolde. Det synlige præg på landskabet begyndte her. Danmarks præg på naturen startede med de første bønder."}'::jsonb,
  'mc','short','{"concepts":["landsby","fast bopæl","landbrug","landskab","huse"],"misconception_type":"causal_inversion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad fortæller fund af rav i Sydeuropa og bronzevarer i Danmark os?","options":["At danske folk handlede med folk langt borte — der var et handelsnetværk der strakte sig fra Danmark til Middelhavet","At folk fra Danmark rejste til Sydeuropa på ferie","At der var krig og plyndring mellem Danmark og Sydeuropa","At genstande bevæger sig tilfældigt"],"correct":"At danske folk handlede med folk langt borte — der var et handelsnetværk der strakte sig fra Danmark til Middelhavet","accepted_answers":["At danske folk handlede med folk langt borte — der var et handelsnetværk der strakte sig fra Danmark til Middelhavet"],"review_text":"Ravsmykker fra Danmarks kyster er fundet i Grækenland. Bronzevarer fra Centraleuropa er fundet i Danmark. Det er beviser for handel over kæmpe afstande. Bronzealderns Danmark var forbundet med Europa."}'::jsonb,
  'mc','short','{"concepts":["rav","handel","Bronzealder","Europa","handelsnetværk"],"misconception_type":"scope_confusion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad antyder store gravhøje med mange rige gravgaver om bronzealderssamfundet?","options":["At der var store sociale forskelle — nogle var meget rige og magtfulde og andre var fattige","At alle i samfundet fik lige store grave","At der ikke var sociale forskelle — alle hjalp hinanden","At gravhøje kun var dekorative uden at betyde noget om status"],"correct":"At der var store sociale forskelle — nogle var meget rige og magtfulde og andre var fattige","accepted_answers":["At der var store sociale forskelle — nogle var meget rige og magtfulde og andre var fattige"],"review_text":"En stor gravhøj med bronzevåben og importerede varer fortæller om en meget rig person. Enkle grave uden genstande fortæller om de fattige. Bronzealderens Danmark havde tydelige sociale lag."}'::jsonb,
  'mc','short','{"concepts":["gravhøj","sociale forskelle","status","Bronzealder","gravgaver"],"misconception_type":"false_equivalence","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad fortæller fund af offergenstande i søer og moser om forhistoriske folk?","options":["At de havde religiøse overbevisninger og ofrede værdifulde ting til guder eller ånder","At de smed affald i søerne","At de gemte værdisager i søerne for at beskytte dem mod tyveri","At de mistede tingene ved et uheld"],"correct":"At de havde religiøse overbevisninger og ofrede værdifulde ting til guder eller ånder","accepted_answers":["At de havde religiøse overbevisninger og ofrede værdifulde ting til guder eller ånder"],"review_text":"Bronzesværd og smykker fundet i søer og moser er bevidste ofringer. Man kastede værdifulde ting i vandet som gave til overnaturlige kræfter. Det viser at forhistoriske folk havde en kompleks åndelig verden."}'::jsonb,
  'mc','short','{"concepts":["ofring","religion","mose","åndelig","overbevisning"],"misconception_type":"scope_confusion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad betyder det at et forhistorisk samfund har arbejdsdeling?","options":["Ikke alle laver det samme — nogen er bønder, nogen er håndværkere, nogen er handlende","At alle i landsbyen skiftes til at lave det samme arbejde","At kvinder og mænd altid laver præcis det samme","At arbejde er delt i dag-arbejde og nat-arbejde"],"correct":"Ikke alle laver det samme — nogen er bønder, nogen er håndværkere, nogen er handlende","accepted_answers":["Ikke alle laver det samme — nogen er bønder, nogen er håndværkere, nogen er handlende"],"review_text":"I et jæger-samler-samfund gør alle nogenlunde det samme. I et bondesamfund kan nogen specialisere sig. En god flinthugger laver redskaber til andre. En potter laver lerkar til alle. Det øger produktiviteten."}'::jsonb,
  'mc','short','{"concepts":["arbejdsdeling","specialisering","håndværk","bondesamfund","produktion"],"misconception_type":"scope_confusion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad viser Tollandmandens velbevaredede ansigt og krop os om moseligenes betydning?","options":["At vi kan se et rigtigt menneske fra for 2400 år siden — hans ansigt, hud og hvad han spiste til sin sidste middag","At moserne er farlige og dræber alle der falder i dem","At Tollandmanden er en statue lavet i oldtiden","At alle i Jernalderen endte i moser"],"correct":"At vi kan se et rigtigt menneske fra for 2400 år siden — hans ansigt, hud og hvad han spiste til sin sidste middag","accepted_answers":["At vi kan se et rigtigt menneske fra for 2400 år siden — hans ansigt, hud og hvad han spiste til sin sidste middag"],"review_text":"Tollandmanden er bevaret som om han netop er død. Vi kender hans ansigt. Vi ved hvad han spiste. Hans læderhue sidder stadig på hans hoved. Moserne er Danmarkshistoriens bedste tidskapsel."}'::jsonb,
  'mc','short','{"concepts":["Tollandmanden","moseleg","bevaring","Jernalder","arkæologi"],"misconception_type":"false_equivalence","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',4,2
);

-- ─── GRADE 4 · BAND 3 (6 questions) ─────────────────────────────────────────

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er forkert ved forestillingen om at landbruget spredte sig hurtigt til Danmark?","options":["Landbruget bredte sig langsomt over generationer — jæger-samlere og bønder levede side om side i lang tid","Forestillingen er korrekt — landbruget nåede Danmark på under 10 år","Landbruget spredte sig hurtigt fordi alle straks forstod det var bedre","Landbruget opstod selvstændigt i Danmark uden påvirkning udefra"],"correct":"Landbruget bredte sig langsomt over generationer — jæger-samlere og bønder levede side om side i lang tid","accepted_answers":["Landbruget bredte sig langsomt over generationer — jæger-samlere og bønder levede side om side i lang tid"],"review_text":"Overgangen fra jæger-samler til bonde tog tusindvis af år i Skandinavien. De to livsstile eksisterede side om side i lang tid. Det var ikke en pludselig revolution men en langsom forandring."}'::jsonb,
  'mc','short','{"concepts":["landbrug","spredning","langsom forandring","jæger-samler","misconception-pludselig-forandring"],"misconception_type":"temporal_confusion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',3,'auto',true,'prehistoric_denmark',4,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er forkert ved det typiske caveman-billede af forhistoriske folk?","options":["De fleste forhistoriske folk i Danmark boede ikke i huler men i telte eller træhuse — og var langt mere sofistikerede end myten antyder","Billedet er korrekt — alle forhistoriske folk boede i huler","Det eneste forkerte er at de ikke havde ild","Billedet er korrekt men kun for folk i Sydeuropa — ikke i Danmark"],"correct":"De fleste forhistoriske folk i Danmark boede ikke i huler men i telte eller træhuse — og var langt mere sofistikerede end myten antyder","accepted_answers":["De fleste forhistoriske folk i Danmark boede ikke i huler men i telte eller træhuse — og var langt mere sofistikerede end myten antyder"],"review_text":"Hulemanden er en myte. De fleste forhistoriske folk i Nordeuropa boede i telte eller træhuse. De havde avancerede redskaber, handel, smykker og ceremonier. De var fulde menneskevæsener."}'::jsonb,
  'mc','short','{"concepts":["caveman-myte","huler","telte","træhuse","misconception-primitive-folk"],"misconception_type":"overgeneralization","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',3,'auto',true,'prehistoric_denmark',4,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad skete der ud over udveksling af varer når forhistoriske folk handlede med hinanden?","options":["Ideer, teknikker og skikke spredte sig også — handel forbandt kulturer og ændrede dem begge","Ingenting — folk byttede kun ting og gik hjem uden at tale med hinanden","Folk forsøgte altid at bedrage hinanden og handel skabte altid krig","Kun varer spredte sig — folk holdt alle ideer for sig selv"],"correct":"Ideer, teknikker og skikke spredte sig også — handel forbandt kulturer og ændrede dem begge","accepted_answers":["Ideer, teknikker og skikke spredte sig også — handel forbandt kulturer og ændrede dem begge"],"review_text":"Handel er ikke kun bytning af ting. Når folk mødte hinanden, udvekslede de teknikker og ideer. Det er sådan ny viden spreder sig. Handel var kulturens motor i forhistorien."}'::jsonb,
  'mc','short','{"concepts":["handel","idéspredning","kultur","kontakt","diffusion"],"misconception_type":"scope_confusion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',3,'auto',true,'prehistoric_denmark',4,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad betød det for magtbalancen i samfundet at jern kunne laves overalt i Danmark?","options":["Magten spredte sig fra de få der kontrollerede bronzehandelen til langt flere familier der nu selv kunne lave jern","Jernet centraliserede magten da kun konger ejede jernsmeltningsanlæg","Jernet ændrede intet i magtbalancen","Jernet gav kirken al magt da de kontrollerede jernproduktionen"],"correct":"Magten spredte sig fra de få der kontrollerede bronzehandelen til langt flere familier der nu selv kunne lave jern","accepted_answers":["Magten spredte sig fra de få der kontrollerede bronzehandelen til langt flere familier der nu selv kunne lave jern"],"review_text":"I Bronzealderen var bronze en eksklusiv ressource som kun de rige kunne skaffe. Med myremalm fra de danske moser kunne alle producere jern. Metalredskaber blev tilgængelige for alle — ikke kun eliten."}'::jsonb,
  'mc','short','{"concepts":["jern","magt","fordeling","bronze","demokratisering"],"misconception_type":"causal_inversion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',3,'auto',true,'prehistoric_denmark',4,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvorfor er forandring i forhistorien svær at se fra den enkeltes perspektiv?","options":["Forandring var langsom og gradvis — ingen oplevede at Stenalderen sluttede, men over generationer ændrede alt sig","Forandring var hurtig og alle oplevede store ændringer i løbet af et liv","Folk oplevede ingen forandring fordi livet altid var det samme","Forandring kom altid fra krig og var altid voldsom og synlig"],"correct":"Forandring var langsom og gradvis — ingen oplevede at Stenalderen sluttede, men over generationer ændrede alt sig","accepted_answers":["Forandring var langsom og gradvis — ingen oplevede at Stenalderen sluttede, men over generationer ændrede alt sig"],"review_text":"Ingen i forhistorien oplevede sig selv som del af et historisk skift. Bedsteforældrenes liv var lidt anderledes end børnebørnenes. Over 10 generationer ændrede alt sig dramatisk — men ingen mærkede det som et brud."}'::jsonb,
  'mc','short','{"concepts":["forandring","gradvis","generationer","perspektiv","tid"],"misconception_type":"temporal_confusion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',3,'auto',true,'prehistoric_denmark',4,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er Danmarks geografiske position og hvad betød den i forhistorien?","options":["Danmark er bro mellem Skandinavien og Europa — handel og ideer flød igennem landet begge veje","Danmark var isoleret og upåvirket af resten af Europa","Danmark var den vigtigste metalproducent i Europa","Danmark var det eneste sted i verden med forhistoriske folk"],"correct":"Danmark er bro mellem Skandinavien og Europa — handel og ideer flød igennem landet begge veje","accepted_answers":["Danmark er bro mellem Skandinavien og Europa — handel og ideer flød igennem landet begge veje"],"review_text":"Danmark ligger der Skandinavien møder kontinentet. Ravvejen gik nord-syd. Sejlruter langs kysterne forbandt vest og øst. Det betød at danske folk var i centrum for nordeuropæisk handel i tusindvis af år."}'::jsonb,
  'mc','short','{"concepts":["geografi","bro","handel","Skandinavien","Europa"],"misconception_type":"scope_confusion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',3,'auto',true,'prehistoric_denmark',4,3
);

-- ─── GRADE 4 · BAND 4 (3 questions) ─────────────────────────────────────────

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad fortæller forhistorisk teknologi — fra flint til bronze til jern — om menneskelig intelligens?","options":["At mennesker konstant eksperimenterer og forbedrer — intelligens og nysgerrighed er ikke noget nyt","At folk i forhistorien var heldige og opdagede ting tilfældigt","At teknologi kun udvikler sig hurtigt — i forhistorien ændrede den sig næsten ikke","At kun folk i Sydeuropa opfandt ting — Norden kopierede blot"],"correct":"At mennesker konstant eksperimenterer og forbedrer — intelligens og nysgerrighed er ikke noget nyt","accepted_answers":["At mennesker konstant eksperimenterer og forbedrer — intelligens og nysgerrighed er ikke noget nyt"],"review_text":"Fra den perfekt huggede flintdolk til den smukt støbte bronzelur — forhistorisk teknologi viser høj intelligens og kreativitet. Det viser at menneskelig nysgerrighed og opfindsomhed er fundamental — ikke noget der opstod med skriften."}'::jsonb,
  'mc','short','{"concepts":["teknologi","intelligens","eksperimentering","flint","bronze","jern"],"misconception_type":"overgeneralization","cognitive_skill":"evaluation","difficulty_type":"applied","insight_type":"perspective_shift","challenge_role":"deep_challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',4,'auto',true,'prehistoric_denmark',4,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Vi finder mange gravhøje fra Bronzealderen men næsten ingen huse. Hvad forklarer det?","options":["Gravhøje var lavet af sten og jord der holder i tusindvis af år. Huse var af træ der rådner væk","Bronzealdersfolk boede ikke i huse — de levede udenfor hele året","Bronzealdersfolk byggede ikke huse — kun grave","Husene er fjernet af arkæologer for at gøre plads til gravhøje"],"correct":"Gravhøje var lavet af sten og jord der holder i tusindvis af år. Huse var af træ der rådner væk","accepted_answers":["Gravhøje var lavet af sten og jord der holder i tusindvis af år. Huse var af træ der rådner væk"],"review_text":"Det vi finder afhænger af hvad der overlever. Sten og jord holder. Træ rådner. Så vi ser gravhøjene men ikke husene. Det er ikke et tegn på at husene var uvigtige — det er et tegn på hvad materialer holder i 3-4.000 år."}'::jsonb,
  'mc','short','{"concepts":["bevaringsbias","gravhøj","hus","materiale","arkæologi"],"misconception_type":"causal_inversion","cognitive_skill":"evaluation","difficulty_type":"applied","insight_type":"perspective_shift","challenge_role":"deep_challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',4,'auto',true,'prehistoric_denmark',4,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er den vigtigste lektie fra forhistorisk Danmark til os i dag?","options":["At mennesker altid har tilpasset sig og skabt nye løsninger — forandring og opfindsomhed er ikke noget nyt under solen","At forhistorisk liv var bedre og vi bør vende tilbage til det","At intet af det forhistoriske folk lærte er relevant i dag","At kun de intelligente folk overlevede og det er dem vi nedstammer fra"],"correct":"At mennesker altid har tilpasset sig og skabt nye løsninger — forandring og opfindsomhed er ikke noget nyt under solen","accepted_answers":["At mennesker altid har tilpasset sig og skabt nye løsninger — forandring og opfindsomhed er ikke noget nyt under solen"],"review_text":"Fra de første jægere til bronzestøberne til jernalderens bønder — alle løste problemerne foran dem med de midler de havde. Det er præcis hvad mennesker gør i dag. Historien er ikke fortid — det er spejlet vi ser os selv i."}'::jsonb,
  'mc','short','{"concepts":["lektie","tilpasning","opfindsomhed","kontinuitet","historisk forståelse"],"misconception_type":"temporal_confusion","cognitive_skill":"evaluation","difficulty_type":"applied","insight_type":"perspective_shift","challenge_role":"deep_challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',4,'auto',true,'prehistoric_denmark',4,4
);
