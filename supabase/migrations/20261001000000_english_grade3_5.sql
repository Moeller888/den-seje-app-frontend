-- Engelsk 3.-5. klasse — første engelsk-indhold på platformen
-- 90 MC-spørgsmål: learning_objective='english', target_grade 3/4/5 (30/30/30),
-- difficulty_band 1-4. Ordforråd, hverdagsudtryk, grammatik og læseforståelse.
-- Spørgsmålene stilles på dansk med engelske ord/sætninger — tilpasset 8-11-årige.
--
-- Leveres kun, når eleven vælger "Engelsk" på Spil-siden (subject='engelsk' i get-next-question).
-- Historie-tilstanden filtrerer 'english' fra, så engelsk ikke blandes ind i historie.
-- Placement-testen (app.js) filtrerer også 'english' fra.
--
-- Uses dollar-quoting ($$) throughout. All is_active=true.
-- Må KUN anvendes via apply_migration med særskilt ejer-autorisation (D-110).

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'dog' på dansk?","options":["hund","kat","fugl","hest"],"correct":"hund","accepted_answers":["hund"],"review_text":"'Dog' betyder hund. En lille hund hedder 'puppy' på engelsk."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder 'kat' på engelsk?","options":["cow","cat","car","cap"],"correct":"cat","accepted_answers":["cat"],"review_text":"Kat hedder 'cat'. Pas på: 'car' er en bil, og 'cap' er en kasket."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken farve er 'red'?","options":["blå","grøn","rød","gul"],"correct":"rød","accepted_answers":["rød"],"review_text":"'Red' er rød. Blå = blue, grøn = green, gul = yellow."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder tallet 3 på engelsk?","options":["tree","two","ten","three"],"correct":"three","accepted_answers":["three"],"review_text":"3 hedder 'three'. 'Tree' lyder næsten ens, men betyder træ!"}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad siger man på engelsk, når man møder nogen?","options":["Hello!","Goodbye!","Sorry!","Thank you!"],"correct":"Hello!","accepted_answers":["Hello!"],"review_text":"'Hello' betyder hej. 'Goodbye' siger man, når man går."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'sun'?","options":["sø","sol","sne","sko"],"correct":"sol","accepted_answers":["sol"],"review_text":"'Sun' betyder sol. Søndag hedder 'Sunday' — solens dag."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder 'æble' på engelsk?","options":["orange","banana","apple","pear"],"correct":"apple","accepted_answers":["apple"],"review_text":"Æble hedder 'apple'. 'Pear' er en pære."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'thank you'?","options":["undskyld","farvel","godnat","tak"],"correct":"tak","accepted_answers":["tak"],"review_text":"'Thank you' betyder tak. Undskyld hedder 'sorry'."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder 'hus' på engelsk?","options":["house","horse","mouse","hose"],"correct":"house","accepted_answers":["house"],"review_text":"Hus hedder 'house'. 'Horse' er en hest, og 'mouse' er en mus."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'big'?","options":["lille","stor","glad","hurtig"],"correct":"stor","accepted_answers":["stor"],"review_text":"'Big' betyder stor. Det modsatte er 'small' — lille."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad svarer du, når nogen spørger: 'What is your name?'","options":["I am eight.","I like pizza.","My name is Emma.","It is blue."],"correct":"My name is Emma.","accepted_answers":["My name is Emma."],"review_text":"'What is your name?' betyder 'Hvad hedder du?'. Du svarer med dit navn: 'My name is …'."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'How old are you?'","options":["Hvordan har du det?","Hvor bor du?","Hvad hedder du?","Hvor gammel er du?"],"correct":"Hvor gammel er du?","accepted_answers":["Hvor gammel er du?"],"review_text":"'How old' betyder 'hvor gammel'. Du kan svare: 'I am nine' — jeg er ni."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord mangler? 'I ___ a dog.'","options":["have","has","is","are"],"correct":"have","accepted_answers":["have"],"review_text":"Med 'I' (jeg) siger man 'have': 'I have a dog' — jeg har en hund."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder 'mandag' på engelsk?","options":["Sunday","Monday","Friday","Tuesday"],"correct":"Monday","accepted_answers":["Monday"],"review_text":"Mandag = Monday. På engelsk skriver man altid ugedage med stort."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket dyr siger 'moo'?","options":["a dog","a cat","a cow","a duck"],"correct":"a cow","accepted_answers":["a cow"],"review_text":"En ko (cow) siger 'moo'. En hund siger 'woof', og en and siger 'quack'."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'I am happy'?","options":["Jeg er sulten","Jeg er træt","Jeg er sur","Jeg er glad"],"correct":"Jeg er glad","accepted_answers":["Jeg er glad"],"review_text":"'Happy' betyder glad. Sulten = hungry, træt = tired."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder 'mor' og 'far' på engelsk?","options":["mum og dad","sister og brother","girl og boy","aunt og uncle"],"correct":"mum og dad","accepted_answers":["mum og dad"],"review_text":"Mor = mum (eller mom), far = dad. Søster = sister, bror = brother."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder tallet 12 på engelsk?","options":["twenty","twelve","eleven","two"],"correct":"twelve","accepted_answers":["twelve"],"review_text":"12 = twelve. 11 = eleven, 20 = twenty."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'Good morning'?","options":["Godnat","Goddag","Godmorgen","Godt gået"],"correct":"Godmorgen","accepted_answers":["Godmorgen"],"review_text":"'Morning' er morgen. Godnat hedder 'Good night'."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken kropsdel er 'head'?","options":["hånd","hals","hæl","hoved"],"correct":"hoved","accepted_answers":["hoved"],"review_text":"'Head' er hoved. Hånd = hand, fod = foot."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer IKKE ind? red – blue – dog – green","options":["dog","red","blue","green"],"correct":"dog","accepted_answers":["dog"],"review_text":"Red, blue og green er farver. 'Dog' er et dyr, så det passer ikke ind."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',3,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'I like ice cream'?","options":["Jeg spiser is i dag","Jeg kan lide is","Jeg vil have is","Jeg har ikke is"],"correct":"Jeg kan lide is","accepted_answers":["Jeg kan lide is"],"review_text":"'I like' betyder 'jeg kan lide'. Is hedder 'ice cream' — 'iskold creme'."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',3,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er flertal af 'cat' (flere katte)?","options":["cates","caten","cats","cat"],"correct":"cats","accepted_answers":["cats"],"review_text":"På engelsk sætter man oftest bare et -s på: one cat, two cats."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',3,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Tom has a red ball.' Hvilken farve har bolden?","options":["Blå","Grøn","Gul","Rød"],"correct":"Rød","accepted_answers":["Rød"],"review_text":"'Red' betyder rød, så Toms bold er rød."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',3,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket spørgsmål betyder 'Hvor er du?'","options":["Where are you?","Who are you?","What are you?","How are you?"],"correct":"Where are you?","accepted_answers":["Where are you?"],"review_text":"Where = hvor (sted). Who = hvem, what = hvad, how = hvordan."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',3,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'Can I have some water, please?'","options":["Jeg har ikke noget vand","Må jeg få noget vand?","Hvor er vandet?","Vil du have vand?"],"correct":"Må jeg få noget vand?","accepted_answers":["Må jeg få noget vand?"],"review_text":"'Can I have …, please?' er en høflig måde at spørge om at få noget."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',3,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord betyder det modsatte af 'hot'?","options":["warm","wet","cold","old"],"correct":"cold","accepted_answers":["cold"],"review_text":"Hot = varm/hed, cold = kold. 'Warm' betyder også varm, men lidt mindre."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',3,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder den 1. måned i året på engelsk?","options":["June","Monday","March","January"],"correct":"January","accepted_answers":["January"],"review_text":"Årets første måned er January. Måneder skrives også med stort på engelsk."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',3,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'I have two cats and one dog.' Hvor mange dyr har personen?","options":["3","2","1","4"],"correct":"3","accepted_answers":["3"],"review_text":"To katte (two cats) og én hund (one dog) giver tre dyr i alt."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',3,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning om søsteren er rigtig?","options":["She are my sister.","She is my sister.","She am my sister.","She be my sister."],"correct":"She is my sister.","accepted_answers":["She is my sister."],"review_text":"Med 'she' (hun) bruger man 'is': She is … — I am, you are, she is."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',3,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'school'?","options":["skål","skov","skole","sko"],"correct":"skole","accepted_answers":["skole"],"review_text":"'School' betyder skole. Det udtales 'skuul'."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder 'grøn' på engelsk?","options":["grey","great","grow","green"],"correct":"green","accepted_answers":["green"],"review_text":"Grøn = green. Grå = grey."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'tired'?","options":["træt","tyk","tørstig","tidlig"],"correct":"træt","accepted_answers":["træt"],"review_text":"'Tired' betyder træt. Tørstig hedder 'thirsty'."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder 'vinter' på engelsk?","options":["window","winter","water","wind"],"correct":"winter","accepted_answers":["winter"],"review_text":"Vinter = winter. 'Window' er et vindue og 'wind' er vind."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder tallet 20 på engelsk?","options":["twelve","two","twenty","thirty"],"correct":"twenty","accepted_answers":["twenty"],"review_text":"20 = twenty. 12 = twelve, 30 = thirty."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'See you tomorrow!'?","options":["Vi ses i går!","Se på mig!","Godmorgen!","Vi ses i morgen!"],"correct":"Vi ses i morgen!","accepted_answers":["Vi ses i morgen!"],"review_text":"Tomorrow = i morgen. Yesterday = i går."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'birthday'?","options":["fødselsdag","badedag","brødtid","bondegård"],"correct":"fødselsdag","accepted_answers":["fødselsdag"],"review_text":"'Birthday' betyder fødselsdag. 'Happy birthday!' = Tillykke med fødselsdagen!"}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder 'bord' på engelsk?","options":["tablet","table","chair","bed"],"correct":"table","accepted_answers":["table"],"review_text":"Bord = table. Stol = chair, seng = bed."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord mangler? 'He ___ football every day.'","options":["play","playing","plays","is play"],"correct":"plays","accepted_answers":["plays"],"review_text":"Med he/she/it sætter man -s på verbet i nutid: I play, he plays."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad svarer man på 'How are you?'","options":["I'm ten years old.","I'm from Denmark.","I'm a girl.","I'm fine, thank you."],"correct":"I'm fine, thank you.","accepted_answers":["I'm fine, thank you."],"review_text":"'How are you?' betyder 'Hvordan har du det?'. Et typisk svar er 'I'm fine, thank you'."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er flertal af 'child'?","options":["children","childs","childes","childen"],"correct":"children","accepted_answers":["children"],"review_text":"'Child' er et uregelmæssigt ord: one child, two children. Ligesom på dansk: et barn, to børn."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'kitchen'?","options":["kylling","køkken","kirke","kælder"],"correct":"køkken","accepted_answers":["køkken"],"review_text":"'Kitchen' betyder køkken. Kylling = chicken — de ligner hinanden!"}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder 'onsdag' på engelsk?","options":["Thursday","Tuesday","Wednesday","Weekend"],"correct":"Wednesday","accepted_answers":["Wednesday"],"review_text":"Onsdag = Wednesday (udtales 'wens-dei'). Tirsdag = Tuesday, torsdag = Thursday."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord mangler? 'There ___ three apples on the table.'","options":["is","am","be","are"],"correct":"are","accepted_answers":["are"],"review_text":"Når der er flere ting, bruger man 'are': there is one apple, there are three apples."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'My favourite colour is blue'?","options":["Min yndlingsfarve er blå","Jeg har en blå farve","Min bedste ven er blå","Blå er en farve"],"correct":"Min yndlingsfarve er blå","accepted_answers":["Min yndlingsfarve er blå"],"review_text":"'Favourite' betyder yndlings-. My favourite food = min yndlingsmad."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder 'lærer' på engelsk?","options":["learner","teacher","student","preacher"],"correct":"teacher","accepted_answers":["teacher"],"review_text":"Lærer = teacher. En elev hedder 'pupil' eller 'student'."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder 'sommerfugl' på engelsk?","options":["summerfly","butterfish","butterfly","bird"],"correct":"butterfly","accepted_answers":["butterfly"],"review_text":"Sommerfugl = butterfly — ordret 'smørflue'. Sjovt, ikke?"}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Anna gets up at seven. She eats breakfast and goes to school.' Hvad gør Anna først?","options":["Hun spiser morgenmad","Hun går i skole","Hun går i seng","Hun står op"],"correct":"Hun står op","accepted_answers":["Hun står op"],"review_text":"'Gets up' betyder står op. Det sker klokken syv, før hun spiser morgenmad (breakfast)."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',4,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning betyder 'Jeg kan ikke svømme'?","options":["I can't swim.","I don't swim now.","I can swim.","I won't swim."],"correct":"I can't swim.","accepted_answers":["I can't swim."],"review_text":"Can't = can not = kan ikke. 'I can swim' betyder 'jeg kan svømme'."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',4,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er klokken, når man siger 'half past three'?","options":["halv tre","halv fire","kvart over tre","tre"],"correct":"halv fire","accepted_answers":["halv fire"],"review_text":"Pas på! 'Half past three' betyder en halv time EFTER tre, altså 3.30 — det vi kalder halv fire."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',4,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer? 'This is ___ book.' (bogen tilhører mig)","options":["me","I","my","mine"],"correct":"my","accepted_answers":["my"],"review_text":"'My' betyder min/mit foran et navneord: my book, my dog."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',4,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer IKKE ind? apple – banana – carrot – pear","options":["apple","banana","pear","carrot"],"correct":"carrot","accepted_answers":["carrot"],"review_text":"Apple, banana og pear er frugt. 'Carrot' (gulerod) er en grøntsag."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',4,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'Turn left'?","options":["Drej til venstre","Drej til højre","Gå ligeud","Vend om"],"correct":"Drej til venstre","accepted_answers":["Drej til venstre"],"review_text":"Left = venstre, right = højre, straight on = ligeud."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',4,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er det modsatte af 'early'?","options":["fast","late","last","old"],"correct":"late","accepted_answers":["late"],"review_text":"Early = tidlig, late = sen. 'I am late' betyder 'jeg kommer for sent'."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',4,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning er et spørgsmål?","options":["You like cats.","I like cats.","Do you like cats?","Cats like you."],"correct":"Do you like cats?","accepted_answers":["Do you like cats?"],"review_text":"Mange spørgsmål på engelsk starter med 'Do': Do you …? = Kan du …/Gør du …?"}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',4,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Ben is taller than Sam, but Sam is taller than Lisa.' Hvem er højest?","options":["Sam","Lisa","De er lige høje","Ben"],"correct":"Ben","accepted_answers":["Ben"],"review_text":"Ben er højere end Sam, og Sam er højere end Lisa. Så Ben er den højeste."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',4,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord mangler? 'Yesterday I ___ to the beach.'","options":["went","go","goes","going"],"correct":"went","accepted_answers":["went"],"review_text":"'Yesterday' (i går) viser datid. Datid af 'go' er uregelmæssig: go → went."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',4,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'I'm looking forward to the holiday'?","options":["Jeg kigger frem mod ferien på et kort","Jeg glæder mig til ferien","Jeg har lige haft ferie","Jeg kan ikke lide ferie"],"correct":"Jeg glæder mig til ferien","accepted_answers":["Jeg glæder mig til ferien"],"review_text":"'Look forward to' er et udtryk, der betyder 'at glæde sig til'. Man kan ikke altid oversætte ord for ord!"}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',4,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning om broren er rigtig?","options":["My brother don't like milk.","My brother not like milk.","My brother doesn't like milk.","My brother doesn't likes milk."],"correct":"My brother doesn't like milk.","accepted_answers":["My brother doesn't like milk."],"review_text":"Med he/she (min bror = he) bruger man 'doesn't' + verbet uden -s: he doesn't like."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',4,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er det engelske ord for 'nøgle'?","options":["knee","keep","kiss","key"],"correct":"key","accepted_answers":["key"],"review_text":"Nøgle = key (udtales 'kii'). Knee er knæ."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',4,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'weather'?","options":["vejr","vand","vej","vinter"],"correct":"vejr","accepted_answers":["vejr"],"review_text":"'Weather' betyder vejr. 'What's the weather like?' = Hvordan er vejret?"}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',5,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder 'sulten' på engelsk?","options":["angry","hungry","hurry","funny"],"correct":"hungry","accepted_answers":["hungry"],"review_text":"Sulten = hungry. Angry = vred, funny = sjov."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',5,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'library'?","options":["boghandel","laboratorium","bibliotek","lærer"],"correct":"bibliotek","accepted_answers":["bibliotek"],"review_text":"'Library' betyder bibliotek. En boghandel hedder 'bookshop'."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',5,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder 'venner' på engelsk?","options":["fries","fiends","frogs","friends"],"correct":"friends","accepted_answers":["friends"],"review_text":"Ven = friend, venner = friends."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',5,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'island'?","options":["ø","Island (landet)","is","indsø"],"correct":"ø","accepted_answers":["ø"],"review_text":"'Island' betyder ø — s'et siges ikke: 'ai-land'. Landet Island hedder 'Iceland'."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',5,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'Excuse me'?","options":["Tak for mad","Undskyld mig","Velkommen","Farvel"],"correct":"Undskyld mig","accepted_answers":["Undskyld mig"],"review_text":"'Excuse me' bruger man, når man vil have nogens opmærksomhed eller komme forbi."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',5,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder 'efterår' på britisk engelsk?","options":["august","summer","autumn","spring"],"correct":"autumn","accepted_answers":["autumn"],"review_text":"Efterår = autumn. Amerikanerne siger ofte 'fall'. Forår = spring."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',5,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord mangler? 'She ___ watching TV right now.'","options":["are","am","do","is"],"correct":"is","accepted_answers":["is"],"review_text":"'Right now' (lige nu) bruger man med 'is/am/are + -ing': She is watching."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',5,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er datid af 'eat'?","options":["ate","eated","eaten","eats"],"correct":"ate","accepted_answers":["ate"],"review_text":"'Eat' er uregelmæssig: I eat (nu), I ate (i går)."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',5,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'I'm good at drawing'?","options":["Jeg kan godt lide at tegne","Jeg er god til at tegne","Jeg tegner lige nu","Jeg vil gerne tegne"],"correct":"Jeg er god til at tegne","accepted_answers":["Jeg er god til at tegne"],"review_text":"'Good at' betyder 'god til'. I'm good at football = Jeg er god til fodbold."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',5,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord betyder 'farlig'?","options":["delicious","different","dangerous","difficult"],"correct":"dangerous","accepted_answers":["dangerous"],"review_text":"Dangerous = farlig. Delicious = lækker, difficult = svær."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',5,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord mangler? 'I have ___ apple and ___ banana.'","options":["a … an","a … a","an … an","an … a"],"correct":"an … a","accepted_answers":["an … a"],"review_text":"Man bruger 'an' foran en vokallyd (an apple) og 'a' foran en konsonantlyd (a banana)."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',5,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'neighbour'?","options":["nabo","nevø","natur","nøgle"],"correct":"nabo","accepted_answers":["nabo"],"review_text":"'Neighbour' betyder nabo. 'gh' siges ikke — det udtales 'nejbor'."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',5,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er den engelske ordstilling i 'Jeg spiser ofte pizza'?","options":["I eat often pizza.","I often eat pizza.","Often I pizza eat.","I pizza often eat."],"correct":"I often eat pizza.","accepted_answers":["I often eat pizza."],"review_text":"På engelsk står ord som 'often', 'always' og 'never' typisk FØR verbet: I often eat."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',5,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'What time is it?'","options":["Hvor lang tid tager det?","Hvornår kommer du?","Hvad er klokken?","Hvad dag er det?"],"correct":"Hvad er klokken?","accepted_answers":["Hvad er klokken?"],"review_text":"Man kan svare: 'It's ten o'clock' — klokken er ti."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',5,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Mia wanted to play outside, but it was raining. So she read a book instead.' Hvorfor læste Mia?","options":["Fordi hun kedede sig i skolen","Fordi hun skulle til prøve","Fordi hendes ven var syg","Fordi det regnede"],"correct":"Fordi det regnede","accepted_answers":["Fordi det regnede"],"review_text":"'But it was raining' (men det regnede) forklarer, hvorfor hun blev inde og læste i stedet (instead)."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',5,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning om biografturen er rigtig?","options":["They were at the cinema last night.","They was at the cinema last night.","They is at the cinema last night.","They be at the cinema last night."],"correct":"They were at the cinema last night.","accepted_answers":["They were at the cinema last night."],"review_text":"Datid af 'be': I/he/she was — you/we/they were."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',5,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er 'bigger' et eksempel på?","options":["Flertal af big","At sammenligne to ting (større)","Datid af big","Det modsatte af big"],"correct":"At sammenligne to ting (større)","accepted_answers":["At sammenligne to ting (større)"],"review_text":"Når man sammenligner, sætter man -er på korte tillægsord: big → bigger → biggest."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',5,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er det mest høflige?","options":["Help me!","You help me.","Could you help me, please?","Help me now."],"correct":"Could you help me, please?","accepted_answers":["Could you help me, please?"],"review_text":"'Could you …, please?' er en meget høflig måde at bede om hjælp på."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',5,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer? 'This is the ___ day of my life!' (allerbedste)","options":["good","better","goodest","best"],"correct":"best","accepted_answers":["best"],"review_text":"'Good' er uregelmæssig: good → better → best. 'Goodest' findes ikke."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',5,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'It's raining cats and dogs'?","options":["Det regner meget kraftigt","Der falder dyr ned fra himlen","Katte og hunde leger i regnen","Det holder op med at regne"],"correct":"Det regner meget kraftigt","accepted_answers":["Det regner meget kraftigt"],"review_text":"Det er et udtryk (idiom). Det betyder 'det øsregner' — ligesom vi siger 'det styrtregner'."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',5,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord mangler? 'If it is sunny tomorrow, we ___ go to the beach.'","options":["would","will","was","did"],"correct":"will","accepted_answers":["will"],"review_text":"'Will' bruges om fremtiden: we will go = vi tager afsted. 'Tomorrow' viser, at det er i morgen."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',5,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket spørgsmålsord bruger man om tid?","options":["Where","Who","When","Why"],"correct":"When","accepted_answers":["When"],"review_text":"When = hvornår. Where = hvor, who = hvem, why = hvorfor."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',5,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Jack's dog is called Max. Max loves running in the park.' Hvem er Max?","options":["Jacks bror","Jacks ven","Parkens vagt","Jacks hund"],"correct":"Jacks hund","accepted_answers":["Jacks hund"],"review_text":"'Jack's dog is called Max' betyder 'Jacks hund hedder Max'. 's viser ejerskab."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',5,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning beskriver noget, der skal ske i fremtiden?","options":["I'm going to visit my grandma tomorrow.","I visited my grandma yesterday.","I visit my grandma every week.","I am visiting my grandma now."],"correct":"I'm going to visit my grandma tomorrow.","accepted_answers":["I'm going to visit my grandma tomorrow."],"review_text":"'Going to' + 'tomorrow' viser fremtid: noget man har planlagt."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',5,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'The shop opens at 9 and closes at 5. Sara arrived at 6.' Hvad skete der?","options":["Sara var for tidlig","Butikken var lukket","Butikken åbnede lige","Sara købte meget"],"correct":"Butikken var lukket","accepted_answers":["Butikken var lukket"],"review_text":"Butikken lukker kl. 5 (closes at 5), og Sara kom kl. 6 (arrived at 6). Så var den lukket."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',5,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er forskellen på 'their' og 'there'?","options":["De betyder det samme","'Their' betyder der, 'there' betyder deres","'Their' betyder deres, 'there' betyder der","'There' er kun til steder i England"],"correct":"'Their' betyder deres, 'there' betyder der","accepted_answers":["'Their' betyder deres, 'there' betyder der"],"review_text":"De udtales ens, men betyder noget forskelligt: their house = deres hus, over there = derovre."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',5,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning om London er rigtig?","options":["I have never be to London.","I never have went to London.","I has never been to London.","I have never been to London."],"correct":"I have never been to London.","accepted_answers":["I have never been to London."],"review_text":"'Have been' = har været. 'I have never been to London' = jeg har aldrig været i London."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',5,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'He is a bit shy'?","options":["Han er lidt genert","Han er lidt syg","Han er en smule sur","Han er meget sød"],"correct":"Han er lidt genert","accepted_answers":["Han er lidt genert"],"review_text":"'Shy' betyder genert. 'A bit' betyder lidt."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',5,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Although Leo was tired, he finished his homework.' Hvad betyder 'although'?","options":["fordi","selvom","derfor","bagefter"],"correct":"selvom","accepted_answers":["selvom"],"review_text":"'Although' betyder selvom: Selvom Leo var træt, lavede han sine lektier færdige."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',5,4
);

