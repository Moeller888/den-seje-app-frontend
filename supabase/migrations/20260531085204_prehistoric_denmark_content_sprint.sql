-- Section 81 — Prehistoric Denmark Content Sprint
-- 50 questions: Grade 3 (25) + Grade 4 (25). Opens Grade 3 for the first time.
-- Bands: B1×18, B2×16, B3×12, B4×4

-- ─── GRADE 3 · BAND 1 (10 questions) ─────────────────────────────────────────

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var Stenalderen?","options":["En lang tid hvor folk brugte sten til at lave redskaber","En tid da der kun var sten og ingen dyr","En tid da folk boede i sten-slotte","Et sted hvor der var mange sten"],"correct":"En lang tid hvor folk brugte sten til at lave redskaber","accepted_answers":["En lang tid hvor folk brugte sten til at lave redskaber"],"review_text":"Stenalderen er opkaldt efter sten. Folk lavede knive og spyd af sten. Det var meget, meget lang tid siden."}'::jsonb,
  'mc','short','{"concepts":["Stenalder","sten","redskaber"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad spiste folk i den tidlige Stenalder?","options":["Dyr de jagede og baer og svampe de samlede","Broed og maelk fra butikken","Kun fisk fra havet","Frugt fra haver de dyrkede"],"correct":"Dyr de jagede og baer og svampe de samlede","accepted_answers":["Dyr de jagede og baer og svampe de samlede"],"review_text":"De tidligste folk i Danmark jagede dyr og samlede mad fra naturen. De dyrkede ikke marker. De fandt al mad i skoven og ved vandet."}'::jsonb,
  'mc','short','{"concepts":["jaeger-samler","mad","jagt","indsamling"],"misconception_type":"scope_confusion","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad lavede folk redskaber af i Stenalderen?","options":["Flint en hard sten man kan slaa skarpe kanter af","Jern og staal som smedene lavede","Trae og plastik","Guld og soelv"],"correct":"Flint en hard sten man kan slaa skarpe kanter af","accepted_answers":["Flint en hard sten man kan slaa skarpe kanter af"],"review_text":"Flint er en saerlig hard sten. Man kan slaa stykker af den saa det bliver meget skarpt. Det er som en naturlig kniv."}'::jsonb,
  'mc','short','{"concepts":["flint","redskaber","Stenalder","materiale"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad boede folk i under den tidlige Stenalder?","options":["I telte af dyrehud eller under aben himmel","I murstenshuse med vinduer","I hoeje bygninger af trae","I underjordiske huler under byer"],"correct":"I telte af dyrehud eller under aben himmel","accepted_answers":["I telte af dyrehud eller under aben himmel"],"review_text":"De tidligste folk i Danmark boede ikke samme sted hele tiden. De flyttede efter dyrene. Derfor brugte de lette telte der let kunne flyttes."}'::jsonb,
  'mc','short','{"concepts":["hjem","telt","dyrehud","nomader"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvilke dyr levede der i Danmark i Stenalderen?","options":["Elge, urokser, vildsvin og baevere","Loever, elefanter og giraffer","Kun fugle og fisk","Katte og hunde som kaeledyr"],"correct":"Elge, urokser, vildsvin og baevere","accepted_answers":["Elge, urokser, vildsvin og baevere"],"review_text":"Stenalderens Danmark var fuld af vilde dyr. Elge var store hjorte. Urokser var kaempe vilde koeer. Folk jagede disse dyr til mad."}'::jsonb,
  'mc','short','{"concepts":["dyr","Stenalder","jagt","elg","urokse"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er Bronzealderen opkaldt efter?","options":["Et metal der hedder bronze lavet af kobber og tin blandet sammen","Et dyr der hed bronzen","En by der hed Bronze","Et bjerg med masser af guld"],"correct":"Et metal der hedder bronze lavet af kobber og tin blandet sammen","accepted_answers":["Et metal der hedder bronze lavet af kobber og tin blandet sammen"],"review_text":"Bronze er et metal. Det laves ved at smelte kobber og tin sammen. I Bronzealderen laerte folk at lave redskaber og smykker af bronze."}'::jsonb,
  'mc','short','{"concepts":["bronze","Bronzealder","kobber","tin","metal"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er Jernalderen opkaldt efter?","options":["Jern et metal der er stærkere og mere almindeligt end bronze","Et dyr der hed jernet","En skov der var fuld af jernstaenger","En periode da alt var lavet af jern"],"correct":"Jern et metal der er stærkere og mere almindeligt end bronze","accepted_answers":["Jern et metal der er stærkere og mere almindeligt end bronze"],"review_text":"Jern er et staerkt metal. Man fandt det i de danske moser. Da folk laerte at bruge jern, lavede de endnu bedre redskaber end af bronze."}'::jsonb,
  'mc','short','{"concepts":["jern","Jernalder","metal","redskaber"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvornaar begyndte folk i Danmark at dyrke marker?","options":["I den sene Stenalder for cirka 6000 aar siden","For 100 aar siden","Allerede i Bronzealderen","Aldrig folk i Danmark jagtede altid"],"correct":"I den sene Stenalder for cirka 6000 aar siden","accepted_answers":["I den sene Stenalder for cirka 6000 aar siden"],"review_text":"For cirka 6000 aar siden laerte folk i Danmark at dyrke korn og holde husdyr. Det aendrede alt. De behoevede ikke flytte mere."}'::jsonb,
  'mc','short','{"concepts":["landbrug","Stenalder","marker","husdyr"],"misconception_type":"temporal_confusion","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad lavede folk toj af i forhistorisk Danmark?","options":["Dyrehud og uld fra faar","Bomuld og nylon","Blade og plastik","Papir og metal"],"correct":"Dyrehud og uld fra faar","accepted_answers":["Dyrehud og uld fra faar"],"review_text":"Toj i forhistorisk Danmark var lavet af det folk havde. De brugte hud fra dyr og uld fra faar. Tojet holdt dem varme om vinteren."}'::jsonb,
  'mc','short','{"concepts":["toj","dyrehud","uld","klaeder"],"misconception_type":"anachronism","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er en gravhoj?","options":["En stor jordbanke der daekker over et gravkammer","Et sted man gemte mad til vinteren","Et fort til at forsvare landsbyen","Et sted born legede"],"correct":"En stor jordbanke der daekker over et gravkammer","accepted_answers":["En stor jordbanke der daekker over et gravkammer"],"review_text":"En gravhoj er en hoj jordbanke. Under den ligger der et gravkammer. De vigtigste folk blev begravet der med deres ting."}'::jsonb,
  'mc','short','{"concepts":["gravhoj","begravelse","jordbanke","gravkammer"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',3,1
);

-- ─── GRADE 3 · BAND 2 (8 questions) ─────────────────────────────────────────

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvorfor flyttede folk tit i den tidlige Stenalder?","options":["De fulgte dyrene og dyrene vandrede med aarstiderne","De kedede sig og ville se nye steder","Kongen beordrede dem til at flytte","Deres huse var paa hjul"],"correct":"De fulgte dyrene og dyrene vandrede med aarstiderne","accepted_answers":["De fulgte dyrene og dyrene vandrede med aarstiderne"],"review_text":"Folk i den tidlige Stenalder levede af at jage. Dyrene bevagede sig med aarstiderne. Saa maatte folk ogsaa flytte for at have mad nok."}'::jsonb,
  'mc','short','{"concepts":["nomader","jaeger-samler","flytning","aarstider","dyr"],"misconception_type":"causal_inversion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad aendrede sig da folk begyndte at dyrke marker?","options":["De kunne bo samme sted hele livet og behoevede ikke flytte efter dyrene","De holdt op med at spise kod","De begyndte at bo alene","Ingenting aendrede sig"],"correct":"De kunne bo samme sted hele livet og behoevede ikke flytte efter dyrene","accepted_answers":["De kunne bo samme sted hele livet og behoevede ikke flytte efter dyrene"],"review_text":"Da folk dyrkede marker, boede de fast. De byggede bedre huse. De samlede mad nok til vinteren. Det var en kaempe forandring."}'::jsonb,
  'mc','short','{"concepts":["landbrug","fast bopael","forandring","huse"],"misconception_type":"causal_inversion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvorfor var gode redskaber vigtige for de forste folk i Danmark?","options":["Redskaber hjalp dem med at jage, skaere mad, bygge huse og lave toj","Redskaber var kun til pynt","Redskaber var kun brugt af chefer","Redskaber var ikke vigtige"],"correct":"Redskaber hjalp dem med at jage, skaere mad, bygge huse og lave toj","accepted_answers":["Redskaber hjalp dem med at jage, skaere mad, bygge huse og lave toj"],"review_text":"Redskaber var hverdagens nodvendige ting. En god flintkniv til at skaere kod. Et spyd til at jage. En naal til at sy toj. Uden redskaber var livet meget svaerere."}'::jsonb,
  'mc','short','{"concepts":["redskaber","jagt","bygge","toj","hverdagsliv"],"misconception_type":"scope_confusion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvorfor var bronze bedre end flint til redskaber?","options":["Bronze kunne smeltes til en god form og gik ikke i stykker som flint","Bronze var gratis og let at finde","Flint var giftig mens bronze var sikker","Bronze smeltede i solen og var bedre at bruge flydende"],"correct":"Bronze kunne smeltes til en god form og gik ikke i stykker som flint","accepted_answers":["Bronze kunne smeltes til en god form og gik ikke i stykker som flint"],"review_text":"Flint kan braekkes. Bronze kan smeltes og stoebes i en form. Man kan lave praecis den form man vil. Og bronze kan slibes skarp igen."}'::jsonb,
  'mc','short','{"concepts":["bronze","flint","redskaber","smeltning","form"],"misconception_type":"false_equivalence","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvorfor var jern bedre end bronze?","options":["Jern var haardere og let at finde i de danske moser","Jern var billigere fordi det kom fra udlandet","Bronze ruster men jern goer ikke","Jern er lettere at smelte end bronze"],"correct":"Jern var haardere og let at finde i de danske moser","accepted_answers":["Jern var haardere og let at finde i de danske moser"],"review_text":"For at lave bronze skulle man have kobber OG tin. De fandtes ikke i Danmark. Jern kunne folk finde i de danske moser. Det betod at alle kunne lave jernredskaber."}'::jsonb,
  'mc','short','{"concepts":["jern","bronze","moser","myremalm","tilgaengelighed"],"misconception_type":"false_equivalence","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvordan fik folk i forhistorisk Danmark ting de ikke selv kunne lave?","options":["De byttede og gav noget de havde til folk der havde det de manglede","De bestilte det paa nettet","De rejste til butikker i Europa","De stjal det fra hinanden"],"correct":"De byttede og gav noget de havde til folk der havde det de manglede","accepted_answers":["De byttede og gav noget de havde til folk der havde det de manglede"],"review_text":"Der var ingen butikker. Men der var byttehandel. Rav fra den danske kyst var meget vaerdifuldt. Folk byttede rav mod bronze fra andre lande."}'::jsonb,
  'mc','short','{"concepts":["handel","byttehandel","rav","bronze","udveksling"],"misconception_type":"anachronism","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Boede forhistoriske folk i Danmark alene eller i grupper?","options":["I grupper og familien og nabofamilier boede og arbejdede taet sammen","Altid alene i skoven","Kun maend boede sammen kvinder boede alene","I kaempe byer med tusindvis af mennesker"],"correct":"I grupper og familien og nabofamilier boede og arbejdede taet sammen","accepted_answers":["I grupper og familien og nabofamilier boede og arbejdede taet sammen"],"review_text":"Folk boede i grupper. Det var nodvendigt. En familie alene kunne ikke jage store dyr. Grupper af familier hjalp hinanden og delte maden."}'::jsonb,
  'mc','short','{"concepts":["gruppe","faellesskab","familie","samarbejde"],"misconception_type":"overgeneralization","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad viser det at folk brugte mange arme paa at bygge gravhoje?","options":["At den begravede person var vigtig og respekteret i gruppen","At de ikke havde andet at lave","At de var bange for de dode","At gravhoje var let at bygge"],"correct":"At den begravede person var vigtig og respekteret i gruppen","accepted_answers":["At den begravede person var vigtig og respekteret i gruppen"],"review_text":"En gravhoj kraever meget arbejde. Mange folk maatte hjaelpe med at baere jord. Det viser at den begravede person var vigtig og respekteret."}'::jsonb,
  'mc','short','{"concepts":["gravhoj","respekt","begravelse","vigtighed","faellesskab"],"misconception_type":"causal_inversion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',3,2
);

-- ─── GRADE 3 · BAND 3 (6 questions) ─────────────────────────────────────────

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var den storste forandring da folk begyndte at dyrke marker?","options":["Folk behoevede ikke flytte mere og kunne bygge rigtige landsbyer","Folk holdt op med at spise kod og fisk for evigt","Dyrene forsvandt fordi folk dyrkede marker i stedet","Folk begyndte at krige mod hinanden om marker"],"correct":"Folk behoevede ikke flytte mere og kunne bygge rigtige landsbyer","accepted_answers":["Folk behoevede ikke flytte mere og kunne bygge rigtige landsbyer"],"review_text":"Bondelivet aendrede alt. Fast bopael. Rigtige huse. Mad til vinteren. Det skabte grundlaget for landsbyer og faellesskab."}'::jsonb,
  'mc','short','{"concepts":["landbrug","fast bopael","landsby","forandring"],"misconception_type":"causal_inversion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',3,'auto',true,'prehistoric_denmark',3,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Er det rigtigt at alle i en stenaldergruppe jagede dyr?","options":["Nej kvinder, aeldre og born samlede baer og planter mens de unge maend oftest jagede","Ja alle jagede ogsaa born og aeldre","Ja ingen samlede planter alle jagede","Nej ingen jagede alle samlede kun planter"],"correct":"Nej kvinder, aeldre og born samlede baer og planter mens de unge maend oftest jagede","accepted_answers":["Nej kvinder, aeldre og born samlede baer og planter mens de unge maend oftest jagede"],"review_text":"Der var arbejdsdeling. Ikke alle jagede. Mange samlede baer og rodder. Det var ogsaa en vigtig del af maden. Mange grupper fik mere mad fra indsamling end fra jagt."}'::jsonb,
  'mc','short','{"concepts":["arbejdsdeling","jagt","indsamling","koensroller"],"misconception_type":"overgeneralization","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',3,'auto',true,'prehistoric_denmark',3,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad viser det at forhistoriske folk lavede praecise flintknive og smukke bronzesmykker?","options":["At de var intelligente og dygtige det kraever store evner at lave saadanne ting","At de kopierede redskaberne fra boeger","At de var heldige og fandt tingene i naturen","At det var nemt og alle kunne goere det"],"correct":"At de var intelligente og dygtige det kraever store evner at lave saadanne ting","accepted_answers":["At de var intelligente og dygtige det kraever store evner at lave saadanne ting"],"review_text":"At slaa en flintkniv kraever praecision og viden. At stoebe et bronzesmykke kraever at forstaae varme og form. Forhistoriske folk var meget dygtige haandvaerkere."}'::jsonb,
  'mc','short','{"concepts":["intelligens","haandvaerk","flint","bronze","primitive-folk"],"misconception_type":"overgeneralization","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',3,'auto',true,'prehistoric_denmark',3,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Er det rigtigt at folk levede paa praecis samme maade i hele Stenalderen?","options":["Nej Stenalderen varer naesten 10.000 aar og meget aendrede sig. Jaegere blev boender","Ja intet aendrede sig i hele Stenalderen","Ja folk levede altid ens fordi de ikke var smarte nok til at aendre noget","Nej folk levede forskelligt men kun fordi vejret aendrede sig"],"correct":"Nej Stenalderen varer naesten 10.000 aar og meget aendrede sig. Jaegere blev boender","accepted_answers":["Nej Stenalderen varer naesten 10.000 aar og meget aendrede sig. Jaegere blev boender"],"review_text":"Stenalderen er ikke et ojeblik. Den varer naesten 10.000 aar. I det tidsrum aendrede folk sig fra jaegere til boender. Det er en kaempe forandring."}'::jsonb,
  'mc','short','{"concepts":["forandring","Stenalder","tid","ingen-forandring"],"misconception_type":"temporal_confusion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',3,'auto',true,'prehistoric_denmark',3,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvordan aendrede hjemmene sig fra jaeger-samler til bonde-tid?","options":["Fra lette flytbare telte til faste traehuse med straatag","Fra traehuse til telte da det blev koldere","Fra stenhuse til plasticteltet","Hjemmene aendrede sig slet ikke"],"correct":"Fra lette flytbare telte til faste traehuse med straatag","accepted_answers":["Fra lette flytbare telte til faste traehuse med straatag"],"review_text":"Jaeger-samlere brugte lette telte fordi de ofte flyttede. Da folk blev boender og boede fast, byggede de rigtige huse af trae med straatag."}'::jsonb,
  'mc','short','{"concepts":["hjem","telt","traehus","forandring","boender"],"misconception_type":"causal_inversion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',3,'auto',true,'prehistoric_denmark',3,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er forkert ved forestillingen om at stenalderfolk lavede primitive redskaber?","options":["Flintredskaber kan vaere ekstremt skarpe og det kraever stor dygtighed at lave dem","Forestillingen er korrekt stenalderredskaber var meget primitive","Flintredskaber var kun til pynt","Stenalderfolk brugte slet ikke redskaber"],"correct":"Flintredskaber kan vaere ekstremt skarpe og det kraever stor dygtighed at lave dem","accepted_answers":["Flintredskaber kan vaere ekstremt skarpe og det kraever stor dygtighed at lave dem"],"review_text":"Flint kan slaas til en ekstremt skarp aeg. Det kraever stor dygtighed. Stenalderfolk var mesterlige redskabsmagere."}'::jsonb,
  'mc','short','{"concepts":["flint","skarphed","dygtighed","primitive-redskaber","haandvaerk"],"misconception_type":"overgeneralization","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',3,'auto',true,'prehistoric_denmark',3,3
);

-- ─── GRADE 3 · BAND 4 (1 question) ──────────────────────────────────────────

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad kan vi laere af at studere hvordan de forste folk i Danmark levede?","options":["At mennesker altid har loest problemer og skabt ting til at goere livet bedre","At forhistoriske folk var dumme og ikke forstod noget","At intet har aendret sig siden Stenalderen","At vi ikke kan laere noget af fortiden"],"correct":"At mennesker altid har loest problemer og skabt ting til at goere livet bedre","accepted_answers":["At mennesker altid har loest problemer og skabt ting til at goere livet bedre"],"review_text":"De forste danskere fandt ud af at jage, samle, dyrke, bygge og handle. Hvert problem fik en loesning. Det er praecis hvad mennesker stadig goer i dag."}'::jsonb,
  'mc','short','{"concepts":["historisk lektie","problemloesning","menneske","kontinuitet"],"misconception_type":"temporal_confusion","cognitive_skill":"evaluation","difficulty_type":"applied","insight_type":"perspective_shift","challenge_role":"deep_challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',4,'auto',true,'prehistoric_denmark',3,4
);

-- ─── GRADE 4 · BAND 1 (8 questions) ─────────────────────────────────────────

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad kaldes de to hovedperioder i Danmarks Stenalder?","options":["Aeldre Stenalder med jaeger-samlere og Yngre Stenalder med boender","Tidlig Stenalder og Sen Stenalder begge med boender","Kold Stenalder og Varm Stenalder","Flint-tid og Lerkar-tid"],"correct":"Aeldre Stenalder med jaeger-samlere og Yngre Stenalder med boender","accepted_answers":["Aeldre Stenalder med jaeger-samlere og Yngre Stenalder med boender"],"review_text":"Danmarks Stenalder deles i to. Aeldre Stenalder: folk jagede og samlede. Yngre Stenalder: folk begyndte at dyrke marker og holde husdyr. Det er to meget forskellige maader at leve paa."}'::jsonb,
  'mc','short','{"concepts":["Aeldre Stenalder","Yngre Stenalder","periodisering","jaeger-samler","boender"],"misconception_type":"temporal_confusion","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad fandt arkaeologer i store koekkenmoeddinger ved Danmarks kyst?","options":["Millioner af muslinge- og ostersskaller rester fra mange maaltider","Guld og bronzesmykker fra handelen","Ruiner af store stenhuse","Skriftlige tekster om jaegerlivet"],"correct":"Millioner af muslinge- og ostersskaller rester fra mange maaltider","accepted_answers":["Millioner af muslinge- og ostersskaller rester fra mange maaltider"],"review_text":"Koekkenmoeddinger er affaldsbunker fra stenalderfolk. De bestaer mest af muslingeskaller. De fortaeller os at kystfolk spiste massivt af havets dyr."}'::jsonb,
  'mc','short','{"concepts":["koekkenmoeddinger","muslinger","kyst","arkaeologi","mad"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad skulle til for at lave bronze?","options":["Man smeltede kobber og tin sammen og ingen af dem fandtes i Danmark","Man smed flintsten haardt mod hinanden","Man kogte jern og kobber i vand","Man fandt bronze-sten i Danmark"],"correct":"Man smeltede kobber og tin sammen og ingen af dem fandtes i Danmark","accepted_answers":["Man smeltede kobber og tin sammen og ingen af dem fandtes i Danmark"],"review_text":"Bronze laves af kobber og tin. Danmark har hverken kobber eller tin. Det betod at folk skulle handle med lande langt borte for at skaffe materialerne."}'::jsonb,
  'mc','short','{"concepts":["bronze","kobber","tin","handel","raematerialer"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvorfra fik folk i Danmarks Jernalder jern?","options":["Fra myremalm en jernforbindelse der dannede sig i de danske moser","Fra handelsskibe fra Asien","Fra miner dybt under jorden i Jylland","Fra meteoritter der faldt fra himlen"],"correct":"Fra myremalm en jernforbindelse der dannede sig i de danske moser","accepted_answers":["Fra myremalm en jernforbindelse der dannede sig i de danske moser"],"review_text":"Myremalm er jernforbindelser der samler sig i mosernes bund. Det fandtes overalt i Danmark. Det betod at alle kunne lave jern og ikke kun dem der handlede med udlandet."}'::jsonb,
  'mc','short','{"concepts":["myremalm","jern","moser","Jernalder","tilgaengelighed"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er en dysse?","options":["Et gravkammer fra Yngre Stenalder med store sten som vaegge og en stor daeksten paa toppen","En slags broend til drikkevand","Et hegn af store sten rundt om en landsby","Et sted man ofrede mad til guderne"],"correct":"Et gravkammer fra Yngre Stenalder med store sten som vaegge og en stor daeksten paa toppen","accepted_answers":["Et gravkammer fra Yngre Stenalder med store sten som vaegge og en stor daeksten paa toppen"],"review_text":"Dysser er Danmarks aeldste gravmonumenter. Store sten baerer en daeksten. Inde i kammeret begravede man de dode. Over 700 dysser findes stadig i Danmark."}'::jsonb,
  'mc','short','{"concepts":["dysse","gravkammer","Yngre Stenalder","sten","gravmonument"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er rav og hvorfra kommer det?","options":["Haerdet planteharpiks oftest gul-brun og gennemsigtig der skylles op paa de danske strande","Et metal man fandt i Danmarks fjorde","Et instrument man brugte til at spille musik","En type korn man dyrkede i Bronzealderen"],"correct":"Haerdet planteharpiks oftest gul-brun og gennemsigtig der skylles op paa de danske strande","accepted_answers":["Haerdet planteharpiks oftest gul-brun og gennemsigtig der skylles op paa de danske strande"],"review_text":"Rav er fossil planteharpiks. Det er smukt og gennemsigtigt. Det skylles op paa de danske strande. I Bronzealderen var rav ekstremt vaerdifuldt."}'::jsonb,
  'mc','short','{"concepts":["rav","harpiks","strand","handel","Bronzealder"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvilke husdyr holdt de forste boender i Danmark?","options":["Kvaeg, faar, geder og svin","Heste, kameler og aeesler","Ulve, raeve og hjorte","Katte og kaniner"],"correct":"Kvaeg, faar, geder og svin","accepted_answers":["Kvaeg, faar, geder og svin"],"review_text":"De forste boender i Danmark taemmede vilde dyr og avlede dem som husdyr. Kvaeg gav kod og maelk. Faar gav uld og kod. Svin spiste affald og gav kod."}'::jsonb,
  'mc','short','{"concepts":["husdyr","kvaeg","faar","svin","boender"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er et moseleg?","options":["Et menneske bevaret i tusindvis af aar i en mose fordi mosen er sur og iltfattig","Et kunstigt menneskefigur lavet af ler til religioese formal","Et skelet af et forhistorisk dyr fundet i en dansk mose","Et redskab brugt til at dyrke moser"],"correct":"Et menneske bevaret i tusindvis af aar i en mose fordi mosen er sur og iltfattig","accepted_answers":["Et menneske bevaret i tusindvis af aar i en mose fordi mosen er sur og iltfattig"],"review_text":"Moser bevarer organisk materiale. Moselig er rigtige mennesker fra for 2000-2500 aar siden. Man kan se deres ansigt og hud. Tollandmanden er det mest beromte moseleg fra Danmark."}'::jsonb,
  'mc','short','{"concepts":["moseleg","bevaring","mose","Tollandmanden","Jernalder"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',1,'auto',true,'prehistoric_denmark',4,1
);

-- ─── GRADE 4 · BAND 2 (8 questions) ─────────────────────────────────────────

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var den vigtigste fordel ved bronze sammenlignet med flint?","options":["Bronze kunne stoebes i enhver form og slibes skarp igen mens flint braekke og ikke kunne repareres","Bronze var gratis mens flint kostede mange dage at lave","Bronze var tungere og bedre til at slaa fjender","Bronze var smukkere og det var det eneste der betod noget"],"correct":"Bronze kunne stoebes i enhver form og slibes skarp igen mens flint braekke og ikke kunne repareres","accepted_answers":["Bronze kunne stoebes i enhver form og slibes skarp igen mens flint braekke og ikke kunne repareres"],"review_text":"Flintredskaber er engangsredskaber. Naar de braekker, laver man et nyt. Bronze kan stoebes, slibes og omformes igen og igen. Det var en revolution i redskabsteknologi."}'::jsonb,
  'mc','short','{"concepts":["bronze","flint","redskabsteknologi","stoebning","slibning"],"misconception_type":"false_equivalence","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvorfor aendrede jernet magtbalancen i forhistorisk Danmark?","options":["Jern fandtes i moserne overalt saa alle kunne skaffe det. Bronze kraevede sjaeldne raematerialer fra udlandet som kun de rige havde raad til","Jern var billigere fordi det var lettere at lave end bronze","Jern var et religioest metal som praester delte ud gratis","Jern var svagere end bronze men mere aerefuldt at eje"],"correct":"Jern fandtes i moserne overalt saa alle kunne skaffe det. Bronze kraevede sjaeldne raematerialer fra udlandet som kun de rige havde raad til","accepted_answers":["Jern fandtes i moserne overalt saa alle kunne skaffe det. Bronze kraevede sjaeldne raematerialer fra udlandet som kun de rige havde raad til"],"review_text":"Med bronze var man afhaengig af dyr handel med udlandet. Myremalm fandtes overalt i Danmark. Da jernet kom, kunne langt flere familier lave deres egne redskaber."}'::jsonb,
  'mc','short','{"concepts":["jern","bronze","magt","tilgaengelighed","myremalm"],"misconception_type":"causal_inversion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad betod det for et landomraade da folk gik fra jaeger-samler til bondeliv?","options":["Landsbyer opstod og folk boede fast og byggede huse, kornlagre og indhegninger","Folk begyndte at bo endnu mere spredt fordi de nu ejede jord","Landsbyer forsvandt og folk boede atter alene i skoven","Ingenting aendrede sig folk boede paa samme maade"],"correct":"Landsbyer opstod og folk boede fast og byggede huse, kornlagre og indhegninger","accepted_answers":["Landsbyer opstod og folk boede fast og byggede huse, kornlagre og indhegninger"],"review_text":"Fast bosaettelse skabte et nyt landskab. Huse. Kornlagre. Hegn om markerne. Husdyrfolde. Det synlige praeg paa landskabet begyndte her."}'::jsonb,
  'mc','short','{"concepts":["landsby","fast bopael","landbrug","landskab","huse"],"misconception_type":"causal_inversion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad fortaeller fund af rav i Sydeuropa og bronzevarer i Danmark os?","options":["At danske folk handlede med folk langt borte og der var et handelsnetvaerk fra Danmark til Middelhavet","At folk fra Danmark rejste til Sydeuropa paa ferie","At der var krig og plyndring mellem Danmark og Sydeuropa","At genstande bevaeaeger sig tilfaeldigt"],"correct":"At danske folk handlede med folk langt borte og der var et handelsnetvaerk fra Danmark til Middelhavet","accepted_answers":["At danske folk handlede med folk langt borte og der var et handelsnetvaerk fra Danmark til Middelhavet"],"review_text":"Ravsmykker fra Danmarks kyster er fundet i Graekenland. Bronzevarer fra Centraleuropa er fundet i Danmark. Det er beviser for handel over kaempe afstande."}'::jsonb,
  'mc','short','{"concepts":["rav","handel","Bronzealder","Europa","handelsnetvaerk"],"misconception_type":"scope_confusion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad antyder store gravhoje med mange rige gravgaver om bronzealderssamfundet?","options":["At der var store sociale forskelle og nogle var meget rige og magtfulde og andre var fattige","At alle i samfundet fik lige store grave","At der ikke var sociale forskelle og alle hjalp hinanden","At gravhoje kun var dekorative"],"correct":"At der var store sociale forskelle og nogle var meget rige og magtfulde og andre var fattige","accepted_answers":["At der var store sociale forskelle og nogle var meget rige og magtfulde og andre var fattige"],"review_text":"En stor gravhoj med bronzevaaaben og importerede varer fortaeller om en meget rig person. Enkle grave uden genstande fortaeller om de fattige. Bronzealderens Danmark havde tydelige sociale lag."}'::jsonb,
  'mc','short','{"concepts":["gravhoj","sociale forskelle","status","Bronzealder","gravgaver"],"misconception_type":"false_equivalence","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad fortaeller fund af offergenstande i soeer og moser om forhistoriske folk?","options":["At de havde religioese overbevisninger og ofrede vaerdifulde ting til guder eller aander","At de smed affald i soerne","At de gemte vaerdisager i soerne for at beskytte dem mod tyveri","At de mistede tingene ved et uheld"],"correct":"At de havde religioese overbevisninger og ofrede vaerdifulde ting til guder eller aander","accepted_answers":["At de havde religioese overbevisninger og ofrede vaerdifulde ting til guder eller aander"],"review_text":"Bronzesvaerd og smykker fundet i soeer og moser er bevidste ofringer. Man kastede vaerdifulde ting i vandet som gave til overnaturlige kraefter. Det viser at forhistoriske folk havde en kompleks aandelig verden."}'::jsonb,
  'mc','short','{"concepts":["ofring","religion","mose","aandelig","overbevisning"],"misconception_type":"scope_confusion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad betyder det at et forhistorisk samfund har arbejdsdeling?","options":["Ikke alle laver det samme og nogen er boender nogen er haandvaerkere nogen er handlende","At alle i landsbyen skiftes til at lave det samme arbejde","At kvainder og maend altid laver praecis det samme","At arbejde er delt i dag-arbejde og nat-arbejde"],"correct":"Ikke alle laver det samme og nogen er boender nogen er haandvaerkere nogen er handlende","accepted_answers":["Ikke alle laver det samme og nogen er boender nogen er haandvaerkere nogen er handlende"],"review_text":"I et jaeger-samler-samfund goer alle nogenlunde det samme. I et bondesamfund kan nogen specialisere sig. En god flinthugger laver redskaber til andre. En potter laver lerkar til alle."}'::jsonb,
  'mc','short','{"concepts":["arbejdsdeling","specialisering","haandvaerk","bondesamfund","produktion"],"misconception_type":"scope_confusion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad viser Tollandmandens velbevaredede ansigt og krop om moseligenes betydning?","options":["At vi kan se et rigtigt menneske fra for 2400 aar siden og hans ansigt, hud og hvad han spiste til sin sidste middag","At moserne er farlige og draeber alle der falder i dem","At Tollandmanden er en statue lavet i oldtiden","At alle i Jernalderen endte i moser"],"correct":"At vi kan se et rigtigt menneske fra for 2400 aar siden og hans ansigt, hud og hvad han spiste til sin sidste middag","accepted_answers":["At vi kan se et rigtigt menneske fra for 2400 aar siden og hans ansigt, hud og hvad han spiste til sin sidste middag"],"review_text":"Tollandmanden er bevaret som om han netop er doed. Vi kender hans ansigt. Vi ved hvad han spiste. Hans laederhue sidder stadig paa hans hoved. Moserne er Danmarkshistoriens bedste tidskapsel."}'::jsonb,
  'mc','short','{"concepts":["Tollandmanden","moseleg","bevaring","Jernalder","arkaeologi"],"misconception_type":"false_equivalence","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',2,'auto',true,'prehistoric_denmark',4,2
);

-- ─── GRADE 4 · BAND 3 (6 questions) ─────────────────────────────────────────

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er forkert ved forestillingen om at landbruget spredte sig hurtigt til Danmark?","options":["Landbruget bredte sig langsomt over generationer og jaeger-samlere og boender levede side om side i lang tid","Forestillingen er korrekt landbruget naaede Danmark paa under 10 aar","Landbruget spredte sig hurtigt fordi alle straks forstod det var bedre","Landbruget opstod selvstaendigt i Danmark uden paavirkning udefra"],"correct":"Landbruget bredte sig langsomt over generationer og jaeger-samlere og boender levede side om side i lang tid","accepted_answers":["Landbruget bredte sig langsomt over generationer og jaeger-samlere og boender levede side om side i lang tid"],"review_text":"Overgangen fra jaeger-samler til bonde tog tusindvis af aar i Skandinavien. De to livsstile eksisterede side om side i lang tid. Det var ikke en pludselig revolution men en langsom forandring."}'::jsonb,
  'mc','short','{"concepts":["landbrug","spredning","langsom forandring","jaeger-samler","pludselig forandring"],"misconception_type":"temporal_confusion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',3,'auto',true,'prehistoric_denmark',4,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er forkert ved det typiske caveman-billede af forhistoriske folk?","options":["De fleste forhistoriske folk i Danmark boede ikke i huler men i telte eller traehuse og var langt mere sofistikerede end myten antyder","Billedet er korrekt alle forhistoriske folk boede i huler","Det eneste forkerte er at de ikke havde ild","Billedet er korrekt men kun for folk i Sydeuropa ikke i Danmark"],"correct":"De fleste forhistoriske folk i Danmark boede ikke i huler men i telte eller traehuse og var langt mere sofistikerede end myten antyder","accepted_answers":["De fleste forhistoriske folk i Danmark boede ikke i huler men i telte eller traehuse og var langt mere sofistikerede end myten antyder"],"review_text":"Hulemanden er en myte. De fleste forhistoriske folk i Nordeuropa boede i telte eller traehuse. De havde avancerede redskaber, handel, smykker og ceremonier. De var fulde menneskevaeesener."}'::jsonb,
  'mc','short','{"concepts":["caveman-myte","huler","telte","traehuse","primitive-folk"],"misconception_type":"overgeneralization","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',3,'auto',true,'prehistoric_denmark',4,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad skete der ud over udveksling af varer naar forhistoriske folk handlede med hinanden?","options":["Ideer, teknikker og skikke spredte sig ogsaa og handel forbandt kulturer og aendrede dem begge","Ingenting folk byttede kun ting og gik hjem uden at tale med hinanden","Folk forsogte altid at bedrage hinanden og handel skabte altid krig","Kun varer spredte sig folk holdt alle ideer for sig selv"],"correct":"Ideer, teknikker og skikke spredte sig ogsaa og handel forbandt kulturer og aendrede dem begge","accepted_answers":["Ideer, teknikker og skikke spredte sig ogsaa og handel forbandt kulturer og aendrede dem begge"],"review_text":"Handel er ikke kun bytning af ting. Naar folk modte hinanden, udvekslede de teknikker og ideer. Det er saadan ny viden spreder sig. Handel var kulturens motor i forhistorien."}'::jsonb,
  'mc','short','{"concepts":["handel","idespredning","kultur","kontakt","diffusion"],"misconception_type":"scope_confusion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',3,'auto',true,'prehistoric_denmark',4,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad betod det for magtbalancen i samfundet at jern kunne laves overalt i Danmark?","options":["Magten spredte sig fra de faa der kontrollerede bronzehandelen til langt flere familier der nu selv kunne lave jern","Jernet centraliserede magten da kun konger ejede jernsmeltningsanlaeg","Jernet aendrede intet i magtbalancen","Jernet gav kirken al magt"],"correct":"Magten spredte sig fra de faa der kontrollerede bronzehandelen til langt flere familier der nu selv kunne lave jern","accepted_answers":["Magten spredte sig fra de faa der kontrollerede bronzehandelen til langt flere familier der nu selv kunne lave jern"],"review_text":"I Bronzealderen var bronze en eksklusiv ressource som kun de rige kunne skaffe. Med myremalm fra de danske moser kunne alle producere jern. Metalredskaber blev tilgaengelige for alle."}'::jsonb,
  'mc','short','{"concepts":["jern","magt","fordeling","bronze","demokratisering"],"misconception_type":"causal_inversion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',3,'auto',true,'prehistoric_denmark',4,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvorfor er forandring i forhistorien svaer at se fra den enkeltes perspektiv?","options":["Forandring var langsom og gradvis og ingen oplevede at Stenalderen sluttede men over generationer aendrede alt sig","Forandring var hurtig og alle oplevede store aendringer i lobet af et liv","Folk oplevede ingen forandring fordi livet altid var det samme","Forandring kom altid fra krig og var altid voldsom og synlig"],"correct":"Forandring var langsom og gradvis og ingen oplevede at Stenalderen sluttede men over generationer aendrede alt sig","accepted_answers":["Forandring var langsom og gradvis og ingen oplevede at Stenalderen sluttede men over generationer aendrede alt sig"],"review_text":"Ingen i forhistorien oplevede sig selv som del af et historisk skift. Bedsteforaeldrenes liv var lidt anderledes end borneborns. Over 10 generationer aendrede alt sig dramatisk men ingen maerkede det som et brud."}'::jsonb,
  'mc','short','{"concepts":["forandring","gradvis","generationer","perspektiv","tid"],"misconception_type":"temporal_confusion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',3,'auto',true,'prehistoric_denmark',4,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var Danmarks geografiske position og hvad betod den i forhistorien?","options":["Danmark er bro mellem Skandinavien og Europa og handel og ideer flod igennem landet begge veje","Danmark var isoleret og upavirket af resten af Europa","Danmark var den vigtigste metalproducent i Europa","Danmark var det eneste sted i verden med forhistoriske folk"],"correct":"Danmark er bro mellem Skandinavien og Europa og handel og ideer flod igennem landet begge veje","accepted_answers":["Danmark er bro mellem Skandinavien og Europa og handel og ideer flod igennem landet begge veje"],"review_text":"Danmark ligger der Skandinavien moeder kontinentet. Ravvejen gik nord-syd. Sejlruter langs kysterne forbandt vest og ost. Det betod at danske folk var i centrum for nordeuropaeisk handel i tusindvis af aar."}'::jsonb,
  'mc','short','{"concepts":["geografi","bro","handel","Skandinavien","Europa"],"misconception_type":"scope_confusion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',3,'auto',true,'prehistoric_denmark',4,3
);

-- ─── GRADE 4 · BAND 4 (3 questions) ─────────────────────────────────────────

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad fortaeller forhistorisk teknologi fra flint til bronze til jern om menneskelig intelligens?","options":["At mennesker konstant eksperimenterer og forbedrer og intelligens og nysgerrighed er ikke noget nyt","At folk i forhistorien var heldige og opdagede ting tilfaeldigt","At teknologi kun udvikler sig hurtigt og i forhistorien aendrede den sig naesten ikke","At kun folk i Sydeuropa opfandt ting og Norden kopierede blot"],"correct":"At mennesker konstant eksperimenterer og forbedrer og intelligens og nysgerrighed er ikke noget nyt","accepted_answers":["At mennesker konstant eksperimenterer og forbedrer og intelligens og nysgerrighed er ikke noget nyt"],"review_text":"Fra den perfekt huggede flintdolk til den smukt stoebte bronzelur viser forhistorisk teknologi hoj intelligens og kreativitet. Det viser at menneskelig nysgerrighed og opfindsomhed er fundamental."}'::jsonb,
  'mc','short','{"concepts":["teknologi","intelligens","eksperimentering","flint","bronze","jern"],"misconception_type":"overgeneralization","cognitive_skill":"evaluation","difficulty_type":"applied","insight_type":"perspective_shift","challenge_role":"deep_challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',4,'auto',true,'prehistoric_denmark',4,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Vi finder mange gravhoje fra Bronzealderen men naesten ingen huse. Hvad forklarer det bedst?","options":["Gravhoje var lavet af sten og jord der holder i tusindvis af aar. Huse var af trae der raadner vaek","Bronzealdersfolk boede ikke i huse de levede udenfor hele aret","Bronzealdersfolk byggede ikke huse kun grave","Husene er fjernet af arkaeologer for at goere plads til gravhoje"],"correct":"Gravhoje var lavet af sten og jord der holder i tusindvis af aar. Huse var af trae der raadner vaek","accepted_answers":["Gravhoje var lavet af sten og jord der holder i tusindvis af aar. Huse var af trae der raadner vaek"],"review_text":"Det vi finder afhaenger af hvad der overlever. Sten og jord holder. Trae raadner. Saa vi ser gravhojene men ikke husene. Det er ikke et tegn paa at husene var uvigtige men et tegn paa hvad materialer holder i 3-4000 aar."}'::jsonb,
  'mc','short','{"concepts":["bevaringsbias","gravhoj","hus","materiale","arkaeologi"],"misconception_type":"causal_inversion","cognitive_skill":"evaluation","difficulty_type":"applied","insight_type":"perspective_shift","challenge_role":"deep_challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',4,'auto',true,'prehistoric_denmark',4,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er den vigtigste lektie fra forhistorisk Danmark til os i dag?","options":["At mennesker altid har tilpasset sig og skabt nye loesninger og forandring og opfindsomhed er ikke noget nyt under solen","At forhistorisk liv var bedre og vi bor vende tilbage til det","At intet af det forhistoriske folk laerte er relevant i dag","At kun de intelligente folk overlevede og det er dem vi nedstammer fra"],"correct":"At mennesker altid har tilpasset sig og skabt nye loesninger og forandring og opfindsomhed er ikke noget nyt under solen","accepted_answers":["At mennesker altid har tilpasset sig og skabt nye loesninger og forandring og opfindsomhed er ikke noget nyt under solen"],"review_text":"Fra de forste jaegere til bronzestoeberne til jernalderens boender loeste alle problemerne foran dem med de midler de havde. Det er praecis hvad mennesker goer i dag. Historien er ikke fortid men det spejl vi ser os selv i."}'::jsonb,
  'mc','short','{"concepts":["lektie","tilpasning","opfindsomhed","kontinuitet","historisk forstaelse"],"misconception_type":"temporal_confusion","cognitive_skill":"evaluation","difficulty_type":"applied","insight_type":"perspective_shift","challenge_role":"deep_challenge","domain":"prehistoric_denmark"}'::jsonb,
  'mc_single',4,'auto',true,'prehistoric_denmark',4,4
);;
