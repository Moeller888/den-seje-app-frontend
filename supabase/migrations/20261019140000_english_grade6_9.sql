-- Engelsk 6.-9. klasse — fortsættelse af 20261001000000_english_grade3_5 og batch 2 (3.-5.)
-- 120 MC-spørgsmål: learning_objective='english', target_grade 6/7/8/9 (30/30/30/30),
-- difficulty_band 1-4. Ordforråd, hverdagsudtryk, grammatik og læseforståelse.
-- Spørgsmålene stilles på dansk med engelske ord/sætninger, som de eksisterende engelskopgaver.
--
-- Leveres kun, når eleven vælger "Engelsk" på Spil-siden (subject='engelsk' i get-next-question).
-- Historie-tilstanden og placement-testen holder allerede 'english' ude.
--
-- Uses dollar-quoting ($$) throughout. All is_active=true.
-- Må KUN anvendes via apply_migration med særskilt ejer-autorisation (D-110).

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'library'?","options":["bibliotek","boghandel","skole","laboratorium"],"correct":"bibliotek","accepted_answers":["bibliotek"],"review_text":"'Library' betyder bibliotek. En boghandel hedder 'bookshop'."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',6,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder 'vejr' på engelsk?","options":["whether","weather","water","winter"],"correct":"weather","accepted_answers":["weather"],"review_text":"Vejr hedder 'weather'. 'Whether' udtales næsten ens, men betyder 'om'."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',6,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'She ___ to school every day.'","options":["go","going","goes","gone"],"correct":"goes","accepted_answers":["goes"],"review_text":"Ved he/she/it i nutid får udsagnsordet -s eller -es: she goes."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',6,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvordan spørger man høfligt om vej til stationen på engelsk?","options":["Sorry, I am the station.","Please, the station is me.","Thanks, station where?","Excuse me, where is the station?"],"correct":"Excuse me, where is the station?","accepted_answers":["Excuse me, where is the station?"],"review_text":"'Excuse me' bruger man for at få nogens opmærksomhed høfligt."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',6,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Tom has a sister and two brothers.' Hvor mange søskende har Tom?","options":["3","2","1","4"],"correct":"3","accepted_answers":["3"],"review_text":"En søster (sister) og to brødre (brothers) er tre søskende."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',6,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er flertal af 'child'?","options":["childs","children","childes","child"],"correct":"children","accepted_answers":["children"],"review_text":"'Child' er uregelmæssigt: one child, two children."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',6,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'hungry'?","options":["vred","træt","sulten","glad"],"correct":"sulten","accepted_answers":["sulten"],"review_text":"'Hungry' betyder sulten. Vred hedder 'angry'."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',6,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder 'onsdag' på engelsk?","options":["Thursday","Tuesday","Monday","Wednesday"],"correct":"Wednesday","accepted_answers":["Wednesday"],"review_text":"Onsdag hedder 'Wednesday'. Ugedage skrives med stort på engelsk."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',6,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'Yesterday we ___ football.'","options":["played","play","plays","playing"],"correct":"played","accepted_answers":["played"],"review_text":"'Yesterday' viser datid: we played."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',6,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'expensive'?","options":["billig","dyr","gratis","stor"],"correct":"dyr","accepted_answers":["dyr"],"review_text":"'Expensive' betyder dyr. Billig hedder 'cheap'."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',6,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'How much is it?'","options":["Hvor mange er der?","Hvor er det?","Hvad koster det?","Hvad er klokken?"],"correct":"Hvad koster det?","accepted_answers":["Hvad koster det?"],"review_text":"'How much is it?' spørger om prisen."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',6,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'It was raining, so Lisa took her umbrella.' Hvorfor tog Lisa sin paraply?","options":["Fordi det var varmt","Fordi hun skulle i skole","Fordi den var ny","Fordi det regnede"],"correct":"Fordi det regnede","accepted_answers":["Fordi det regnede"],"review_text":"'So' betyder 'så' – det regnede, så hun tog paraplyen."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',6,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'There ___ two cats in the garden.'","options":["are","is","am","be"],"correct":"are","accepted_answers":["are"],"review_text":"Flere katte: there are. Én kat: there is."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',6,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder 'køkken' på engelsk?","options":["chicken","kitchen","kingdom","kitten"],"correct":"kitchen","accepted_answers":["kitchen"],"review_text":"Køkken hedder 'kitchen'. 'Chicken' er en kylling, 'kitten' en killing."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',6,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'I have ___ apple.'","options":["a","some","an","many"],"correct":"an","accepted_answers":["an"],"review_text":"Foran en vokallyd bruger man 'an': an apple."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',6,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'neighbour'?","options":["nevø","ven","lærer","nabo"],"correct":"nabo","accepted_answers":["nabo"],"review_text":"'Neighbour' betyder nabo. Nevø hedder 'nephew'."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',6,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'He ___ his homework yet.' (Han har ikke lavet sine lektier endnu.)","options":["hasn't done","didn't do","doesn't do","not done"],"correct":"hasn't done","accepted_answers":["hasn't done"],"review_text":"'Yet' bruges med førnutid: he hasn't done it yet."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',6,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Ben missed the bus, so he ran all the way to school and arrived out of breath.' Hvordan kom Ben i skole?","options":["Han tog bussen","Han løb","Han cyklede","Hans mor kørte ham"],"correct":"Han løb","accepted_answers":["Han løb"],"review_text":"Han missede bussen og løb hele vejen ('ran all the way')."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',6,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'to borrow'?","options":["at købe","at sælge","at låne (af nogen)","at give væk"],"correct":"at låne (af nogen)","accepted_answers":["at låne (af nogen)"],"review_text":"'Borrow' er at låne af nogen. At låne ud til nogen hedder 'lend'."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',6,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er datid af 'buy'?","options":["buyed","brought","buys","bought"],"correct":"bought","accepted_answers":["bought"],"review_text":"Buy – bought. 'Brought' er datid af 'bring'."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',6,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'Never mind'?","options":["Det gør ikke noget","Pas på","Aldrig igen","Kom ind"],"correct":"Det gør ikke noget","accepted_answers":["Det gør ikke noget"],"review_text":"'Never mind' siger man, når noget ikke er vigtigt: det gør ikke noget."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',6,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er det modsatte af 'early'?","options":["soon","late","fast","first"],"correct":"late","accepted_answers":["late"],"review_text":"Early betyder tidlig, late betyder sen."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',6,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'This is ___ book. It belongs to me.'","options":["me","I","my","mine"],"correct":"my","accepted_answers":["my"],"review_text":"Foran et navneord bruger man 'my': my book. 'Mine' står alene: it is mine."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',6,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Although the test was hard, Anna smiled when she got it back.' Hvad kan man udlede?","options":["Hun dumpede","Hun glemte testen","Testen var let","Hun klarede sig nok godt"],"correct":"Hun klarede sig nok godt","accepted_answers":["Hun klarede sig nok godt"],"review_text":"Testen var svær, men hun smilede – hun har nok klaret sig godt."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',6,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'If it rains tomorrow, we ___ stay inside.'","options":["will","would","did","are"],"correct":"will","accepted_answers":["will"],"review_text":"If + nutid, will + verbum: If it rains, we will stay inside."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',6,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'to explain'?","options":["at udforske","at forklare","at eksplodere","at undskylde"],"correct":"at forklare","accepted_answers":["at forklare"],"review_text":"'Explain' betyder at forklare. At udforske hedder 'explore'."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',6,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'She is ___ than her brother.'","options":["more tall","tallest","taller","tall"],"correct":"taller","accepted_answers":["taller"],"review_text":"Korte tillægsord får -er, når man sammenligner to: taller than."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',6,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'I'm looking forward to it'?","options":["Jeg leder efter det","Jeg ser fremad","Jeg har glemt det","Jeg glæder mig til det"],"correct":"Jeg glæder mig til det","accepted_answers":["Jeg glæder mig til det"],"review_text":"'Look forward to' betyder at glæde sig til."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',6,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder 'sundhed' på engelsk?","options":["health","wealth","help","heat"],"correct":"health","accepted_answers":["health"],"review_text":"Sundhed hedder 'health'. 'Wealth' betyder rigdom."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',6,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'The shop was closed, so Mia went home without any milk.' Hvorfor fik Mia ikke mælk?","options":["Hun havde ingen penge","Butikken var lukket","Hun glemte det","Mælken var udsolgt"],"correct":"Butikken var lukket","accepted_answers":["Butikken var lukket"],"review_text":"'The shop was closed' – butikken var lukket."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',6,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'environment'?","options":["regering","underholdning","miljø","udstyr"],"correct":"miljø","accepted_answers":["miljø"],"review_text":"'Environment' betyder miljø. Regering hedder 'government'."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',7,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'They ___ watching TV right now.'","options":["is","was","be","are"],"correct":"are","accepted_answers":["are"],"review_text":"'Right now' viser, at det sker nu. They are watching."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',7,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder 'venskab' på engelsk?","options":["friendship","friendly","friends","friendness"],"correct":"friendship","accepted_answers":["friendship"],"review_text":"Venskab hedder 'friendship'. 'Friendly' betyder venlig."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',7,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'Could you help me, please?'","options":["Skal jeg hjælpe dig?","Kan du hjælpe mig?","Hjælp mig nu!","Har du brug for hjælp?"],"correct":"Kan du hjælpe mig?","accepted_answers":["Kan du hjælpe mig?"],"review_text":"'Could you…, please?' er en høflig måde at bede om noget på."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',7,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Jake is allergic to nuts, so he never eats peanut butter.' Hvorfor spiser Jake ikke peanutbutter?","options":["Han kan ikke lide smagen","Det er for dyrt","Han er allergisk over for nødder","Han er mæt"],"correct":"Han er allergisk over for nødder","accepted_answers":["Han er allergisk over for nødder"],"review_text":"'Allergic to nuts' – han er allergisk over for nødder."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',7,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er datid af 'go'?","options":["goed","gone","goes","went"],"correct":"went","accepted_answers":["went"],"review_text":"Go – went – gone. 'Gone' bruges efter have/has."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',7,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'reliable'?","options":["pålidelig","læselig","venlig","farlig"],"correct":"pålidelig","accepted_answers":["pålidelig"],"review_text":"'Reliable' betyder pålidelig – man kan stole på det."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',7,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er det modsatte af 'cheap'?","options":["cheerful","expensive","easy","poor"],"correct":"expensive","accepted_answers":["expensive"],"review_text":"Cheap betyder billig, expensive betyder dyr."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',7,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'I have lived here ___ 2015.'","options":["for","from","since","at"],"correct":"since","accepted_answers":["since"],"review_text":"'Since' bruges med et tidspunkt (since 2015), 'for' med en periode (for ten years)."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',7,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'to achieve'?","options":["at opgive","at ankomme","at arkivere","at opnå"],"correct":"at opnå","accepted_answers":["at opnå"],"review_text":"'Achieve' betyder at opnå. At ankomme hedder 'arrive'."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',7,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'The book ___ by a famous author.'","options":["was written","wrote","was wrote","has write"],"correct":"was written","accepted_answers":["was written"],"review_text":"Passiv: was + datids tillægsform. Write – wrote – written."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',7,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Despite the cold, hundreds of people gathered in the square to protest.' Hvad betyder 'despite'?","options":["på grund af","på trods af","før","efter"],"correct":"på trods af","accepted_answers":["på trods af"],"review_text":"'Despite' betyder på trods af – de mødte op, selvom det var koldt."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',7,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'It's up to you'?","options":["Det er over dig","Du skal op","Det bestemmer du","Det er din tur til at rejse dig"],"correct":"Det bestemmer du","accepted_answers":["Det bestemmer du"],"review_text":"'It's up to you' betyder, at det er dit valg."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',7,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder 'beslutning' på engelsk?","options":["division","description","discussion","decision"],"correct":"decision","accepted_answers":["decision"],"review_text":"Beslutning hedder 'decision'. 'Discussion' er en diskussion."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',7,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'He doesn't like coffee, and ___ do I.'","options":["neither","either","so","too"],"correct":"neither","accepted_answers":["neither"],"review_text":"Efter en nægtende sætning bruger man 'neither do I' – heller ikke jeg."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',7,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'to improve'?","options":["at improvisere","at forbedre","at bevise","at importere"],"correct":"at forbedre","accepted_answers":["at forbedre"],"review_text":"'Improve' betyder at forbedre. At bevise hedder 'prove'."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',7,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'If I ___ you, I would apologise.'","options":["am","be","were","will be"],"correct":"were","accepted_answers":["were"],"review_text":"I tænkte situationer bruger man 'were': If I were you."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',7,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Sam kept checking his phone and tapping his foot while he waited.' Hvordan har Sam det nok?","options":["Han er afslappet","Han sover","Han er sulten","Han er utålmodig"],"correct":"Han er utålmodig","accepted_answers":["Han er utålmodig"],"review_text":"Han tjekker telefonen og tripper med foden. Han er utålmodig."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',7,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'to persuade'?","options":["at overtale","at forfølge","at forberede","at udsætte"],"correct":"at overtale","accepted_answers":["at overtale"],"review_text":"'Persuade' betyder at overtale. At forfølge hedder 'pursue'."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',7,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'This is the girl ___ won the race.'","options":["which","who","whose","whom"],"correct":"who","accepted_answers":["who"],"review_text":"Om personer bruger man 'who'. 'Which' bruges om ting og dyr."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',7,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'It's a piece of cake'?","options":["Det er et stykke kage","Det er lækkert","Det er meget let","Det er dyrt"],"correct":"Det er meget let","accepted_answers":["Det er meget let"],"review_text":"Udtrykket betyder, at noget er meget let."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',7,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'nevertheless'?","options":["aldrig","derfor","desuden","alligevel"],"correct":"alligevel","accepted_answers":["alligevel"],"review_text":"'Nevertheless' betyder alligevel eller ikke desto mindre."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',7,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning er korrekt?","options":["She has been to London twice.","She has been in London twice ago.","She have been to London twice.","She was been to London twice."],"correct":"She has been to London twice.","accepted_answers":["She has been to London twice."],"review_text":"Førnutid: she has been. 'Ago' kan ikke bruges med førnutid."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',7,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: '\"Great, another rainy Monday,\" Ella muttered as she looked out of the window.' Hvad mener Ella?","options":["Hun elsker regn","Hun er ironisk og glæder sig ikke","Hun glæder sig til mandag","Hun er ligeglad"],"correct":"Hun er ironisk og glæder sig ikke","accepted_answers":["Hun er ironisk og glæder sig ikke"],"review_text":"Hun siger 'great', men mumler om regn. Hun mener det modsatte – hun er ironisk."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',7,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'By the time we arrived, the film ___.'","options":["has started","starts","had started","was start"],"correct":"had started","accepted_answers":["had started"],"review_text":"Noget, der skete før noget andet i fortiden, står i førdatid: had started."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',7,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'to deny'?","options":["at definere","at levere","at beslutte","at benægte"],"correct":"at benægte","accepted_answers":["at benægte"],"review_text":"'Deny' betyder at benægte. At levere hedder 'deliver'."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',7,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning er korrekt?","options":["I'm used to getting up early.","I'm used to get up early.","I use to getting up early.","I'm use to getting up early."],"correct":"I'm used to getting up early.","accepted_answers":["I'm used to getting up early."],"review_text":"'Be used to' + -ing betyder at være vant til: I'm used to getting up early."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',7,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'to break the ice'?","options":["at ødelægge noget","at få en samtale i gang","at fryse","at holde op med at tale"],"correct":"at få en samtale i gang","accepted_answers":["at få en samtale i gang"],"review_text":"At bryde isen er at få en samtale i gang, når stemningen er stiv."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',7,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'evidence'?","options":["begivenhed","undgåelse","beviser","udvikling"],"correct":"beviser","accepted_answers":["beviser"],"review_text":"'Evidence' betyder beviser. En begivenhed hedder 'event'."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',7,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'The new park was supposed to open in May. It is now October, and the gates are still locked.' Hvad kan man udlede?","options":["Parken åbnede i maj","Parken er lukket for vinteren","Parken er blevet revet ned","Åbningen er blevet forsinket"],"correct":"Åbningen er blevet forsinket","accepted_answers":["Åbningen er blevet forsinket"],"review_text":"Den skulle åbne i maj, men er stadig lukket i oktober. Den er forsinket."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',7,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'government'?","options":["regering","guvernante","udstyr","virksomhed"],"correct":"regering","accepted_answers":["regering"],"review_text":"'Government' betyder regering."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',8,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'I ___ never seen snow before.'","options":["has","have","am","did"],"correct":"have","accepted_answers":["have"],"review_text":"Førnutid med 'I': I have never seen."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',8,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder 'uddannelse' på engelsk?","options":["edition","election","education","eduction"],"correct":"education","accepted_answers":["education"],"review_text":"Uddannelse hedder 'education'. 'Election' er et valg."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',8,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'I couldn't agree more'?","options":["Jeg er uenig","Jeg kan ikke mere","Jeg forstår det ikke","Jeg er helt enig"],"correct":"Jeg er helt enig","accepted_answers":["Jeg er helt enig"],"review_text":"Man kunne ikke være mere enig – altså helt enig."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',8,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Most teenagers in the survey said they sleep less than eight hours a night.' Hvad handler sætningen om?","options":["Hvor meget unge sover","Hvor meget unge spiser","Hvor længe unge går i skole","Hvor mange unge der laver lektier"],"correct":"Hvor meget unge sover","accepted_answers":["Hvor meget unge sover"],"review_text":"'Sleep less than eight hours a night' – det handler om søvn."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',8,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er datid af 'teach'?","options":["teached","taught","thought","teaches"],"correct":"taught","accepted_answers":["taught"],"review_text":"Teach – taught. 'Thought' er datid af 'think'."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',8,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'to suggest'?","options":["at lykkes","at lide","at foreslå","at sukke"],"correct":"at foreslå","accepted_answers":["at foreslå"],"review_text":"'Suggest' betyder at foreslå. At lykkes hedder 'succeed'."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',8,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er det modsatte af 'increase'?","options":["include","improve","inspire","decrease"],"correct":"decrease","accepted_answers":["decrease"],"review_text":"Increase betyder at stige, decrease at falde."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',8,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'English ___ in many countries.'","options":["is spoken","speaks","is speaking","spoke"],"correct":"is spoken","accepted_answers":["is spoken"],"review_text":"Sproget taler ikke selv – det bliver talt. Passiv: is spoken."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',8,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'opinion'?","options":["mulighed","mening","operation","modstand"],"correct":"mening","accepted_answers":["mening"],"review_text":"'Opinion' betyder mening. Mulighed hedder 'option' eller 'opportunity'."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',8,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'You ___ wear a helmet. It's the law.'","options":["might","could","must","would"],"correct":"must","accepted_answers":["must"],"review_text":"'Must' bruges om noget, man skal. Det er loven."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',8,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Buy now! Only today – 50% off all trainers!' Hvad er formålet med teksten?","options":["At informere om sport","At fortælle en historie","At advare mod noget","At få læseren til at købe"],"correct":"At få læseren til at købe","accepted_answers":["At få læseren til at købe"],"review_text":"Det er en reklame. 'Buy now' og 'only today' skal få læseren til at købe."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',8,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'to keep an eye on something'?","options":["at holde øje med noget","at have ondt i øjet","at lukke øjnene","at kigge væk"],"correct":"at holde øje med noget","accepted_answers":["at holde øje med noget"],"review_text":"Udtrykket betyder at holde øje med noget."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',8,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder 'fordomme' på engelsk?","options":["prediction","prejudice","preference","pressure"],"correct":"prejudice","accepted_answers":["prejudice"],"review_text":"Fordomme hedder 'prejudice'. 'Prediction' er en forudsigelse."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',8,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'He asked me where I ___.'","options":["did live","do live","lived","living"],"correct":"lived","accepted_answers":["lived"],"review_text":"I indirekte spørgsmål bruger man almindelig ordstilling og flytter tiden: where I lived."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',8,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'to avoid'?","options":["at aflevere","at undskylde","at vinde","at undgå"],"correct":"at undgå","accepted_answers":["at undgå"],"review_text":"'Avoid' betyder at undgå."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',8,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'If I had studied harder, I ___ the exam.'","options":["would have passed","would pass","will pass","had passed"],"correct":"would have passed","accepted_answers":["would have passed"],"review_text":"Tænkt fortid: If I had…, I would have…"}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',8,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'The company claims its new phone is the best on the market. However, independent tests show it is average.' Hvad viser teksten?","options":["At telefonen er den bedste","At firmaets påstand ikke holder ifølge uafhængige test","At testene er lavet af firmaet","At telefonen ikke findes endnu"],"correct":"At firmaets påstand ikke holder ifølge uafhængige test","accepted_answers":["At firmaets påstand ikke holder ifølge uafhængige test"],"review_text":"'However' viser en modsætning: uafhængige test siger, at telefonen kun er middel."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',8,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'to estimate'?","options":["at beundre","at etablere","at anslå","at fjerne"],"correct":"at anslå","accepted_answers":["at anslå"],"review_text":"'Estimate' betyder at anslå eller vurdere omtrent."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',8,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'The house ___ roof was damaged has been repaired.'","options":["who's","which","that's","whose"],"correct":"whose","accepted_answers":["whose"],"review_text":"'Whose' viser ejerskab: huset, hvis tag blev skadet."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',8,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'to beat around the bush'?","options":["at undgå at komme til sagen","at arbejde i haven","at slå nogen","at løbe hurtigt"],"correct":"at undgå at komme til sagen","accepted_answers":["at undgå at komme til sagen"],"review_text":"Udtrykket betyder at gå uden om det vigtige – som katten om den varme grød."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',8,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'reluctant'?","options":["pålidelig","modvillig","ivrig","relevant"],"correct":"modvillig","accepted_answers":["modvillig"],"review_text":"'Reluctant' betyder modvillig – man gør det nødigt."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',8,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning er korrekt?","options":["She suggested to go to the cinema.","She suggested go to the cinema.","She suggested going to the cinema.","She suggested goes to the cinema."],"correct":"She suggested going to the cinema.","accepted_answers":["She suggested going to the cinema."],"review_text":"Efter 'suggest' bruger man -ing: suggested going."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',8,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'The door slammed. Silence. Then footsteps.' Hvilken virkning har de korte sætninger?","options":["De gør teksten sjov","De forklarer baggrunden","De beskriver en person","De skaber spænding"],"correct":"De skaber spænding","accepted_answers":["De skaber spænding"],"review_text":"Korte sætninger giver tempo og pauser – det skaber spænding."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',8,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'Hardly ___ the room when the phone rang.'","options":["had she entered","she had entered","she entered","did she entered"],"correct":"had she entered","accepted_answers":["had she entered"],"review_text":"Efter 'hardly' i starten bytter man om: Hardly had she entered."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',8,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'to undermine'?","options":["at understrege","at svække","at underskrive","at forstå"],"correct":"at svække","accepted_answers":["at svække"],"review_text":"'Undermine' betyder at svække noget, ofte gradvist."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',8,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning er korrekt?","options":["I wish I have more time.","I wish I would have more time yesterday.","I wish I had more time.","I wish I am having more time."],"correct":"I wish I had more time.","accepted_answers":["I wish I had more time."],"review_text":"Efter 'I wish' om nutiden bruger man datid: I wish I had."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',8,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'to be on the fence'?","options":["at sidde på et hegn","at være udenfor","at være sikker","at være i tvivl om, hvad man mener"],"correct":"at være i tvivl om, hvad man mener","accepted_answers":["at være i tvivl om, hvad man mener"],"review_text":"Man sidder på hegnet mellem to sider – man har ikke valgt."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',8,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'bias'?","options":["skævhed eller fordom i en bestemt retning","en slags bus","en stavefejl","en fordel i sport"],"correct":"skævhed eller fordom i en bestemt retning","accepted_answers":["skævhed eller fordom i en bestemt retning"],"review_text":"'Bias' betyder, at noget er skævt eller farvet i én retning."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',8,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Studies funded by a sugar company found that sugar is not linked to weight gain.' Hvorfor bør man være kritisk?","options":["Undersøgelsen er for ny","Afsenderen har en interesse i resultatet","Sukker er sundt","Der står ikke, hvem der har betalt den"],"correct":"Afsenderen har en interesse i resultatet","accepted_answers":["Afsenderen har en interesse i resultatet"],"review_text":"Sukkerfirmaet har betalt undersøgelsen og tjener på resultatet."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',8,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'society'?","options":["sikkerhed","sociale medier","samfund","sundhed"],"correct":"samfund","accepted_answers":["samfund"],"review_text":"'Society' betyder samfund."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',9,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'She has worked here ___ ten years.'","options":["since","from","during","for"],"correct":"for","accepted_answers":["for"],"review_text":"'For' bruges med en periode: for ten years."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',9,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder 'ansvar' på engelsk?","options":["responsibility","response","respect","reliability"],"correct":"responsibility","accepted_answers":["responsibility"],"review_text":"Ansvar hedder 'responsibility'. 'Response' er et svar."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',9,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'That makes sense'?","options":["Det gør ondt","Det giver mening","Det laver sjov","Det er forkert"],"correct":"Det giver mening","accepted_answers":["Det giver mening"],"review_text":"'Make sense' betyder at give mening."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',9,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Unemployment fell by 2% last year.' Hvad skete der?","options":["Arbejdsløsheden steg","Lønningerne steg","Arbejdsløsheden faldt","Priserne faldt"],"correct":"Arbejdsløsheden faldt","accepted_answers":["Arbejdsløsheden faldt"],"review_text":"'Unemployment' er arbejdsløshed, og 'fell' betyder faldt."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',9,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er datid af 'catch'?","options":["catched","cought","catches","caught"],"correct":"caught","accepted_answers":["caught"],"review_text":"Catch – caught – caught."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',9,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'to consider'?","options":["at overveje","at bestå af","at konkludere","at kontrollere"],"correct":"at overveje","accepted_answers":["at overveje"],"review_text":"'Consider' betyder at overveje. At bestå af hedder 'consist of'."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',9,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er det modsatte af 'ancient'?","options":["angry","modern","annual","anxious"],"correct":"modern","accepted_answers":["modern"],"review_text":"Ancient betyder gammel/oldtids-, modern betyder moderne."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',1,'auto',true,'english',9,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'The results ___ next week.'","options":["will announce","announce","will be announced","announcing"],"correct":"will be announced","accepted_answers":["will be announced"],"review_text":"Resultaterne offentliggør ikke selv – de bliver offentliggjort. Passiv: will be announced."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',9,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'to claim'?","options":["at klatre","at rydde op","at klage","at påstå"],"correct":"at påstå","accepted_answers":["at påstå"],"review_text":"'Claim' betyder at påstå. At klatre hedder 'climb'."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',9,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'I'm not sure ___ he will come.'","options":["whether","weather","what","which"],"correct":"whether","accepted_answers":["whether"],"review_text":"'Whether' betyder om. 'Weather' betyder vejr."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',9,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Critics argue that the new law limits free speech, while supporters say it protects people from hate.' Hvad beskriver sætningen?","options":["En lov, alle er enige om","To modsatte synspunkter på en lov","En nyhed om vejret","En persons dagbog"],"correct":"To modsatte synspunkter på en lov","accepted_answers":["To modsatte synspunkter på en lov"],"review_text":"Kritikere mener én ting, tilhængere en anden – to modsatte synspunkter."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',9,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'to take something for granted'?","options":["at give noget væk","at tage noget med","at tage noget for givet","at være taknemmelig"],"correct":"at tage noget for givet","accepted_answers":["at tage noget for givet"],"review_text":"Udtrykket betyder at tage noget for givet."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',9,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder 'ligestilling' på engelsk?","options":["quality","equipment","quantity","equality"],"correct":"equality","accepted_answers":["equality"],"review_text":"Ligestilling hedder 'equality'. 'Quality' er kvalitet."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',9,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'Not only ___ late, but he also forgot his books.'","options":["was he","he was","he is","did he"],"correct":"was he","accepted_answers":["was he"],"review_text":"Efter 'not only' i starten bytter man om: Not only was he late."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',9,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'sustainable'?","options":["overraskende","bæredygtig","mistænkelig","tilstrækkelig"],"correct":"bæredygtig","accepted_answers":["bæredygtig"],"review_text":"'Sustainable' betyder bæredygtig."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"english"}$$::jsonb,
  'mc_single',2,'auto',true,'english',9,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'He denied ___ the window.'","options":["to break","break","breaking","broke"],"correct":"breaking","accepted_answers":["breaking"],"review_text":"Efter 'deny' bruger man -ing: denied breaking."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',9,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'The speaker paused, looked at the audience and lowered her voice: \"This could happen to any of us.\"' Hvad vil taleren opnå?","options":["At få publikum til at grine","At afslutte talen hurtigt","At skjule sin mening","At gøre det alvorligt og få publikum til at føle sig berørt"],"correct":"At gøre det alvorligt og få publikum til at føle sig berørt","accepted_answers":["At gøre det alvorligt og få publikum til at føle sig berørt"],"review_text":"Pausen og den lave stemme skaber alvor. 'Any of us' gør publikum personligt berørt."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',9,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'to emphasise'?","options":["at understrege","at efterligne","at undskylde","at udelade"],"correct":"at understrege","accepted_answers":["at understrege"],"review_text":"'Emphasise' betyder at understrege."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',9,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning er korrekt?","options":["The number of students have increased.","The number of students has increased.","The number of students are increasing.","The number of student has increased."],"correct":"The number of students has increased.","accepted_answers":["The number of students has increased."],"review_text":"Grundleddet er 'the number' (antallet), som er ental: has increased."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',9,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'to jump to conclusions'?","options":["at hoppe højt","at afslutte et projekt","at drage forhastede konklusioner","at springe over en opgave"],"correct":"at drage forhastede konklusioner","accepted_answers":["at drage forhastede konklusioner"],"review_text":"Man konkluderer for hurtigt uden at kende alle fakta."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',9,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'ambiguous'?","options":["ambitiøs","venlig","anonym","tvetydig"],"correct":"tvetydig","accepted_answers":["tvetydig"],"review_text":"'Ambiguous' betyder tvetydig – det kan forstås på flere måder. Ambitiøs hedder 'ambitious'."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',9,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'It's time we ___ home.'","options":["went","go","will go","going"],"correct":"went","accepted_answers":["went"],"review_text":"Efter 'It's time we' bruger man datid: It's time we went."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',3,'auto',true,'english',9,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'In the novel, the old house slowly falls apart as the family drifts apart.' Hvad symboliserer huset nok?","options":["Vejret","Familiens forhold","Byens økonomi","Forfatterens barndom"],"correct":"Familiens forhold","accepted_answers":["Familiens forhold"],"review_text":"Huset forfalder samtidig med familien. Det symboliserer familiens forhold."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',9,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'Had I known, I ___ differently.'","options":["will act","acted","would have acted","would act yesterday"],"correct":"would have acted","accepted_answers":["would have acted"],"review_text":"'Had I known' er tænkt fortid. Så følger 'would have acted'."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',9,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'to exaggerate'?","options":["at undersøge","at udelukke","at forklare","at overdrive"],"correct":"at overdrive","accepted_answers":["at overdrive"],"review_text":"'Exaggerate' betyder at overdrive."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',9,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning er korrekt?","options":["Rarely have I seen such a beautiful view.","Rarely I have seen such a beautiful view.","Rarely have I saw such a beautiful view.","Rarely I saw have such a beautiful view."],"correct":"Rarely have I seen such a beautiful view.","accepted_answers":["Rarely have I seen such a beautiful view."],"review_text":"Efter 'rarely' i starten bytter man om: Rarely have I seen."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',9,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'the elephant in the room'?","options":["et meget stort dyr","et åbenlyst problem, som ingen taler om","en stor fejl i et regnestykke","en person, der fylder meget"],"correct":"et åbenlyst problem, som ingen taler om","accepted_answers":["et åbenlyst problem, som ingen taler om"],"review_text":"Alle kan se elefanten, men ingen nævner den – et problem, man undgår at tale om."}$$::jsonb,
  'mc','short',$${"concepts":["hverdagsudtryk"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',9,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'to appeal to emotions'?","options":["at klage over følelser","at skjule følelser","at appellere til følelser","at måle følelser"],"correct":"at appellere til følelser","accepted_answers":["at appellere til følelser"],"review_text":"I argumentation kaldes det patos: at appellere til følelser."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',9,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: '\"We will fight for every job,\" the politician said, standing in front of the closed factory.' Hvorfor står politikeren foran fabrikken?","options":["Fordi hun arbejder der","Fordi det regnede","For at sælge fabrikken","For at gøre budskabet stærkere med et billede"],"correct":"For at gøre budskabet stærkere med et billede","accepted_answers":["For at gøre budskabet stærkere med et billede"],"review_text":"Den lukkede fabrik er et stærkt billede bag budskabet om job."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"english"}$$::jsonb,
  'mc_single',4,'auto',true,'english',9,4
);
