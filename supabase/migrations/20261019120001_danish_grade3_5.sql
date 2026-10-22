-- Dansk 3.-5. klasse — første dansk-indhold på platformen
-- 90 MC-spørgsmål: learning_objective='danish', target_grade 3/4/5 (30/30/30),
-- difficulty_band 1-4. Stavning, ordforråd, grammatik, tegnsætning og læseforståelse.
-- Tilpasset 8-11-årige; samme indholds- og metadata-mønster som 20261001000000_english_grade3_5.
--
-- Leveres kun, når eleven vælger "Dansk" på Spil-siden (subject='dansk' i get-next-question).
-- Historie-tilstanden filtrerer 'danish' fra, så dansk ikke blandes ind i historie.
-- Placement-testen holder også 'danish' ude (20261019120000_placement_exclude_danish, anvendes først).
--
-- Uses dollar-quoting ($$) throughout. All is_active=true.
-- Må KUN anvendes via apply_migration med særskilt ejer-autorisation (D-110).

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt?","options":["hund","hunt","hundd","hunnd"],"correct":"hund","accepted_answers":["hund"],"review_text":"Hund staves med -nd til sidst – ligesom mund og sund."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er det modsatte af 'stor'?","options":["høj","lille","tung","bred"],"correct":"lille","accepted_answers":["lille"],"review_text":"Det modsatte af stor er lille. En elefant er stor, en mus er lille."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er et navneord?","options":["løbe","glad","bil","hurtigt"],"correct":"bil","accepted_answers":["bil"],"review_text":"Et navneord er en ting, et dyr eller en person. Man kan sætte 'en' eller 'et' foran: en bil."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket tegn skal stå til sidst i sætningen 'Hvad hedder du'?","options":[".","!",",","?"],"correct":"?","accepted_answers":["?"],"review_text":"Det er et spørgsmål, så der skal et spørgsmålstegn til sidst."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Mia har en rød cykel. Hun cykler til skole hver dag.' Hvilken farve har Mias cykel?","options":["rød","blå","grøn","gul"],"correct":"rød","accepted_answers":["rød"],"review_text":"Der står i teksten, at Mia har en rød cykel."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt?","options":["skolle","skole","sgole","skoole"],"correct":"skole","accepted_answers":["skole"],"review_text":"Skole staves s-k-o-l-e med ét l."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er flertal af 'en kat'?","options":["kats","katter","katte","kaate"],"correct":"katte","accepted_answers":["katte"],"review_text":"Én kat, to katte. Flertal betyder, at der er flere end én."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning er skrevet rigtigt?","options":["jeg kan lide is.","jeg Kan lide is.","Jeg kan lide is","Jeg kan lide is."],"correct":"Jeg kan lide is.","accepted_answers":["Jeg kan lide is."],"review_text":"En sætning starter med stort bogstav og slutter med punktum."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',3,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'sulten'?","options":["at man gerne vil spise","at man er træt","at man er glad","at man fryser"],"correct":"at man gerne vil spise","accepted_answers":["at man gerne vil spise"],"review_text":"Når man er sulten, vil man gerne have noget at spise."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt?","options":["pie","pige","pigge","pihe"],"correct":"pige","accepted_answers":["pige"],"review_text":"Pige staves med g, selvom man næsten ikke kan høre det."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er et udsagnsord?","options":["bord","rød","hoppe","sol"],"correct":"hoppe","accepted_answers":["hoppe"],"review_text":"Et udsagnsord er noget, man gør. Man kan sætte 'at' foran: at hoppe."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Ole tog sin jakke på, fordi det regnede.' Hvorfor tog Ole jakke på?","options":["Fordi han skulle i skole","Fordi det var varmt","Fordi han var sulten","Fordi det regnede"],"correct":"Fordi det regnede","accepted_answers":["Fordi det regnede"],"review_text":"Ordet 'fordi' fortæller grunden: Det regnede."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket tegn bruger man, når man råber eller udbryder noget, fx 'Av'?","options":["!",".","?",","],"correct":"!","accepted_answers":["!"],"review_text":"Udråbstegnet (!) bruger man, når man råber eller udbryder noget."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord betyder næsten det samme som 'begynde'?","options":["slutte","starte","stoppe","vente"],"correct":"starte","accepted_answers":["starte"],"review_text":"At begynde og at starte betyder næsten det samme."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er et tillægsord?","options":["spise","hus","blød","under"],"correct":"blød","accepted_answers":["blød"],"review_text":"Et tillægsord fortæller, hvordan noget er: en blød pude."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord rimer på 'mus'?","options":["mås","mund","mos","hus"],"correct":"hus","accepted_answers":["hus"],"review_text":"Mus og hus rimer, fordi de slutter med den samme lyd: -us."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',3,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'I går ___ jeg en tur i parken.'","options":["løb","løbte","løbede","løber"],"correct":"løb","accepted_answers":["løb"],"review_text":"Datid af 'løber' er 'løb'. Det er et uregelmæssigt udsagnsord."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',3,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt?","options":["jem","hjem","hjæm","hjemm"],"correct":"hjem","accepted_answers":["hjem"],"review_text":"Hjem har et stumt h foran j – ligesom hjul og hjerte."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',3,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Sofie fik en hundehvalp til sin fødselsdag. Den hedder Bølle og er brun.' Hvad hedder hvalpen?","options":["Sofie","Brun","Bølle","Hvalp"],"correct":"Bølle","accepted_answers":["Bølle"],"review_text":"Der står, at hvalpen hedder Bølle. Sofie er pigen, der fik den."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',3,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning er skrevet rigtigt?","options":["I sommer var emma i aarhus.","i sommer var Emma i Aarhus.","I Sommer var Emma i Aarhus.","I sommer var Emma i Aarhus."],"correct":"I sommer var Emma i Aarhus.","accepted_answers":["I sommer var Emma i Aarhus."],"review_text":"Sætningen starter med stort bogstav, og navne på personer og byer skrives med stort."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',3,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er det modsatte af 'tidlig'?","options":["sen","hurtig","lys","ny"],"correct":"sen","accepted_answers":["sen"],"review_text":"Det modsatte af tidlig er sen: tidligt om morgenen, sent om aftenen."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',3,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'Der står ___ træ i haven.'","options":["en","et","de","nogle"],"correct":"et","accepted_answers":["et"],"review_text":"Det hedder et træ. Nogle navneord har 'en', andre har 'et'."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',3,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt?","options":["schov","sjof","sjov","shov"],"correct":"sjov","accepted_answers":["sjov"],"review_text":"Sjov staves med sj – ligesom sjælden og sjal."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',3,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Lukas glemte sin madpakke. I frikvarteret gav Ali ham halvdelen af sin.' Hvordan var Ali?","options":["doven","sur","bange","hjælpsom"],"correct":"hjælpsom","accepted_answers":["hjælpsom"],"review_text":"Ali delte sin mad med Lukas. Det er hjælpsomt."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',3,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er flertal af 'et barn'?","options":["børn","barner","barne","barns"],"correct":"børn","accepted_answers":["børn"],"review_text":"Ét barn, to børn. Ordet ændrer sig helt i flertal."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',3,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Sne er ___. Hvilket ord er stavet rigtigt?","options":["vid","hvid","hvidd","vidd"],"correct":"hvid","accepted_answers":["hvid"],"review_text":"Farven staves med stumt h: hvid. 'Vid' er et andet ord, der betyder bred."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',3,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning er skrevet rigtigt?","options":["Hvornår kommer bussen.","hvornår kommer bussen?","Hvornår kommer bussen?","Hvornår kommer bussen!"],"correct":"Hvornår kommer bussen?","accepted_answers":["Hvornår kommer bussen?"],"review_text":"Det er et spørgsmål: stort bogstav først og spørgsmålstegn til sidst."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',3,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder det at 'hviske'?","options":["at råbe højt","at synge","at grine","at tale meget stille"],"correct":"at tale meget stille","accepted_answers":["at tale meget stille"],"review_text":"Når man hvisker, taler man så stille, at kun den ved siden af kan høre det."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',3,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er udsagnsordet i sætningen 'Katten sover i sofaen'?","options":["sover","Katten","sofaen","i"],"correct":"sover","accepted_answers":["sover"],"review_text":"'Sover' er det, katten gør. Derfor er det udsagnsordet."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',3,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Det var mørkt og koldt. Sneen faldt, og børnene byggede en snemand.' Hvilken årstid er det nok?","options":["sommer","vinter","forår","efterår"],"correct":"vinter","accepted_answers":["vinter"],"review_text":"Sne, kulde og en snemand passer bedst til vinter."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',3,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt?","options":["sykel","cyckel","cykel","cykkel"],"correct":"cykel","accepted_answers":["cykel"],"review_text":"Cykel staves med c i starten og ét k."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er flertal af 'en bog'?","options":["boger","bogs","bøgger","bøger"],"correct":"bøger","accepted_answers":["bøger"],"review_text":"Én bog, to bøger. O'et bliver til ø i flertal."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er det modsatte af 'åben'?","options":["lukket","tom","stille","mørk"],"correct":"lukket","accepted_answers":["lukket"],"review_text":"En dør kan være åben eller lukket."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning er skrevet rigtigt?","options":["min bror hedder Jonas.","Min bror hedder Jonas.","Min bror hedder jonas.","Min Bror hedder Jonas."],"correct":"Min bror hedder Jonas.","accepted_answers":["Min bror hedder Jonas."],"review_text":"Stort bogstav i starten af sætningen og i navnet Jonas – ikke i 'bror'."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Ahmed spiller fodbold hver tirsdag og torsdag.' Hvor mange dage om ugen spiller Ahmed fodbold?","options":["1","3","2","7"],"correct":"2","accepted_answers":["2"],"review_text":"Tirsdag og torsdag er to dage."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er et tillægsord i sætningen 'Den gamle mand gik en tur'?","options":["mand","gik","tur","gamle"],"correct":"gamle","accepted_answers":["gamle"],"review_text":"'Gamle' fortæller, hvordan manden er. Det er et tillægsord."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt?","options":["hjul","hjull","hjuhl","jhul"],"correct":"hjul","accepted_answers":["hjul"],"review_text":"Hjul har stumt h foran j – ligesom hjem og hjerte."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord betyder næsten det samme som 'smuk'?","options":["grim","flot","træt","lav"],"correct":"flot","accepted_answers":["flot"],"review_text":"Smuk og flot betyder næsten det samme."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',4,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'I går ___ vi pizza.'","options":["spisede","spist","spiste","spiser"],"correct":"spiste","accepted_answers":["spiste"],"review_text":"Datid af 'spiser' er 'spiste'."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt?","options":["vem","hvæm","wem","hvem"],"correct":"hvem","accepted_answers":["hvem"],"review_text":"Hvem har et stumt h – ligesom hvad, hvor og hvorfor."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvor skal kommaet stå i 'Jeg købte æbler pærer og bananer'?","options":["Jeg købte æbler, pærer og bananer.","Jeg købte, æbler pærer og bananer.","Jeg købte æbler pærer, og bananer.","Jeg, købte æbler pærer og bananer."],"correct":"Jeg købte æbler, pærer og bananer.","accepted_answers":["Jeg købte æbler, pærer og bananer."],"review_text":"I en opremsning sætter man komma mellem tingene – men ikke foran 'og'."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Freja kiggede ud ad vinduet og sukkede. Regnen ville ikke holde op, og turen til stranden måtte vente.' Hvordan har Freja det?","options":["glad","skuffet","vred","bange"],"correct":"skuffet","accepted_answers":["skuffet"],"review_text":"Freja sukker, fordi turen til stranden må vente. Hun er skuffet."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er en 'fødselar'?","options":["en der laver mad","en der bager kage","en der har fødselsdag","en der er syg"],"correct":"en der har fødselsdag","accepted_answers":["en der har fødselsdag"],"review_text":"Fødselaren er den, der har fødselsdag."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'Jeg har ___ æble i tasken.'","options":["en","den","de","et"],"correct":"et","accepted_answers":["et"],"review_text":"Det hedder et æble."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt?","options":["giraf","schiraf","girraf","sjiraf"],"correct":"giraf","accepted_answers":["giraf"],"review_text":"Giraf staves med g, selvom g'et lyder som 'sj'."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder det tegn, der står til sidst i et spørgsmål?","options":["udråbstegn","spørgsmålstegn","punktum","komma"],"correct":"spørgsmålstegn","accepted_answers":["spørgsmålstegn"],"review_text":"Et spørgsmål slutter med spørgsmålstegn (?)."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',4,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er et stedord i sætningen 'Hun gav sin mor en gave'?","options":["gav","mor","Hun","gave"],"correct":"Hun","accepted_answers":["Hun"],"review_text":"Et stedord bruges i stedet for et navn. 'Hun' står i stedet for pigens navn."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',4,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt?","options":["fødselsdau","føselsdag","fødsesdag","fødselsdag"],"correct":"fødselsdag","accepted_answers":["fødselsdag"],"review_text":"Fødselsdag er sat sammen af fødsel og dag – med et s imellem."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',4,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'nysgerrig'?","options":["at man gerne vil vide mere","at man er bange","at man er sur","at man er doven"],"correct":"at man gerne vil vide mere","accepted_answers":["at man gerne vil vide mere"],"review_text":"En nysgerrig person vil gerne vide og finde ud af mere."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',4,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Bussen kørte kl. 8.00. Jonas kom til stoppestedet kl. 8.05.' Hvad skete der?","options":["Jonas nåede bussen","Jonas kom for sent til bussen","Jonas kom for tidligt","Jonas kørte i bil"],"correct":"Jonas kom for sent til bussen","accepted_answers":["Jonas kom for sent til bussen"],"review_text":"Bussen kørte fem minutter før Jonas kom. Han kom for sent."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',4,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er flertal af 'en mand'?","options":["mander","manne","mænd","mands"],"correct":"mænd","accepted_answers":["mænd"],"review_text":"Én mand, to mænd. A bliver til æ i flertal."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',4,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning er skrevet rigtigt?","options":["Vi skal til københavn på fredag.","Vi skal til København på Fredag.","vi skal til København på fredag.","Vi skal til København på fredag."],"correct":"Vi skal til København på fredag.","accepted_answers":["Vi skal til København på fredag."],"review_text":"Bynavne skrives med stort, men ugedage skrives med lille."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',4,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt?","options":["skjorte","sjorte","skiorte","skorte"],"correct":"skjorte","accepted_answers":["skjorte"],"review_text":"Skjorte staves med skj."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',4,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'Det er den ___ is, jeg har smagt.'","options":["godeste","bedste","bedre","mest gode"],"correct":"bedste","accepted_answers":["bedste"],"review_text":"God – bedre – bedst. Det er den bedste is."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',4,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Selvom Liva var træt, blev hun ved med at træne, til hun kunne lave en vejrmølle.' Hvad siger teksten om Liva?","options":["Hun er doven","Hun kan ikke lide at træne","Hun giver ikke let op","Hun gik tidligt i seng"],"correct":"Hun giver ikke let op","accepted_answers":["Hun giver ikke let op"],"review_text":"Liva træner videre, selvom hun er træt. Hun giver ikke let op."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',4,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder udtrykket 'at have sommerfugle i maven'?","options":["at være sulten","at have ondt i maven","at være glad for dyr","at være nervøs"],"correct":"at være nervøs","accepted_answers":["at være nervøs"],"review_text":"Når man har sommerfugle i maven, er man nervøs eller spændt."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',4,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt?","options":["chokolade","sjokolade","chokoladde","schokolade"],"correct":"chokolade","accepted_answers":["chokolade"],"review_text":"Chokolade staves med ch, selvom det lyder som 'sj'."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',4,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning er skrevet rigtigt?","options":["Mor sagde, kom ind og spis!","Mor sagde: »Kom ind og spis!«","Mor sagde »kom ind og spis«","Mor sagde: kom ind, og spis!"],"correct":"Mor sagde: »Kom ind og spis!«","accepted_answers":["Mor sagde: »Kom ind og spis!«"],"review_text":"Det, nogen siger, står i anførselstegn. Foran står der kolon, og replikken starter med stort."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',4,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er et navneord i sætningen 'Den søde pige spiller klaver'?","options":["søde","spiller","klaver","Den"],"correct":"klaver","accepted_answers":["klaver"],"review_text":"Klaver er en ting – man kan sige 'et klaver'. Derfor er det et navneord."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',4,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Vinden rev i træerne, og tagstenene raslede. Far lukkede vinduerne og hentede lommelygten.' Hvorfor hentede far nok lommelygten?","options":["Fordi han skulle ud at gå tur","Fordi det var lyst","Fordi han ville læse","Fordi strømmen måske ville gå"],"correct":"Fordi strømmen måske ville gå","accepted_answers":["Fordi strømmen måske ville gå"],"review_text":"Det stormer. Far gør sig klar, hvis strømmen går og lyset forsvinder."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',4,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er flertal af 'en fod'?","options":["fødder","foder","føder","foddere"],"correct":"fødder","accepted_answers":["fødder"],"review_text":"Én fod, to fødder."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',5,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt?","options":["vejjr","vejr","veijr","væjr"],"correct":"vejr","accepted_answers":["vejr"],"review_text":"Vejr staves v-e-j-r."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',5,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er det modsatte af 'billig'?","options":["fattig","gratis","dyr","lav"],"correct":"dyr","accepted_answers":["dyr"],"review_text":"Noget, der koster meget, er dyrt. Det modsatte af billig er dyr."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',5,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning er skrevet rigtigt?","options":["Hvad skal vi have til aftensmad.","hvad skal vi have til aftensmad?","Hvad skal vi have til Aftensmad?","Hvad skal vi have til aftensmad?"],"correct":"Hvad skal vi have til aftensmad?","accepted_answers":["Hvad skal vi have til aftensmad?"],"review_text":"Stort bogstav først, spørgsmålstegn til sidst – og 'aftensmad' skrives med lille."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',5,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Klassen skulle på lejrskole i tre dage. De tog af sted mandag.' Hvilken dag kom de nok hjem?","options":["onsdag","tirsdag","torsdag","fredag"],"correct":"onsdag","accepted_answers":["onsdag"],"review_text":"Mandag, tirsdag og onsdag er tre dage. De kom nok hjem onsdag."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',5,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er et udsagnsord?","options":["skrift","skrive","skrivebord","skriftlig"],"correct":"skrive","accepted_answers":["skrive"],"review_text":"Man kan sætte 'at' foran et udsagnsord: at skrive."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',5,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt?","options":["schælden","sjællen","sjælden","sjældn"],"correct":"sjælden","accepted_answers":["sjælden"],"review_text":"Sjælden staves med sj og ld."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',5,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er et synonym?","options":["et ord, der betyder det modsatte","et ord, der rimer","et meget langt ord","et ord, der betyder det samme som et andet ord"],"correct":"et ord, der betyder det samme som et andet ord","accepted_answers":["et ord, der betyder det samme som et andet ord"],"review_text":"Et synonym betyder det samme som et andet ord, fx glad og fornøjet."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',5,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'I går ___ vi i skoven.'","options":["gik","gåede","gået","går"],"correct":"gik","accepted_answers":["gik"],"review_text":"Datid af 'går' er 'gik'."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',5,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt?","options":["interesant","interessant","intresant","interressant"],"correct":"interessant","accepted_answers":["interessant"],"review_text":"Interessant har ét r og to s'er: interessant."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',5,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvor skal kommaet stå i 'Når det regner tager jeg gummistøvler på'?","options":["Når, det regner tager jeg gummistøvler på.","Når det, regner tager jeg gummistøvler på.","Når det regner, tager jeg gummistøvler på.","Når det regner tager jeg, gummistøvler på."],"correct":"Når det regner, tager jeg gummistøvler på.","accepted_answers":["Når det regner, tager jeg gummistøvler på."],"review_text":"Kommaet står efter ledsætningen 'Når det regner', før resten af sætningen."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',5,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er et antonym?","options":["et ord, der betyder det samme","et navn på en by","et udsagnsord","et ord, der betyder det modsatte af et andet ord"],"correct":"et ord, der betyder det modsatte af et andet ord","accepted_answers":["et ord, der betyder det modsatte af et andet ord"],"review_text":"Et antonym betyder det modsatte, fx varm og kold."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',5,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Emil smilede bredt, da han fik sin prøve tilbage. Han havde øvet sig hele weekenden.' Hvorfor smilede Emil nok?","options":["Han havde klaret sig godt","Han havde glemt at øve sig","Han var træt","Weekenden var forbi"],"correct":"Han havde klaret sig godt","accepted_answers":["Han havde klaret sig godt"],"review_text":"Emil havde øvet sig og smiler, da han ser prøven. Han har nok klaret sig godt."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',5,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'Jeg har aldrig ___ en elefant.'","options":["så","set","se","ser"],"correct":"set","accepted_answers":["set"],"review_text":"Efter 'har' bruger man formen 'set': Jeg har set."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',5,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt?","options":["restorant","restaurang","restaurant","ristorant"],"correct":"restaurant","accepted_answers":["restaurant"],"review_text":"Restaurant kommer fra fransk og staves r-e-s-t-a-u-r-a-n-t."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',5,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket tegn sætter man mellem ordene i en opremsning som 'rød gul og blå'?","options":["punktum","spørgsmålstegn","kolon","komma"],"correct":"komma","accepted_answers":["komma"],"review_text":"Man sætter komma mellem tingene i en opremsning: rød, gul og blå."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',5,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er et forholdsord i sætningen 'Bogen ligger under sengen'?","options":["under","Bogen","ligger","sengen"],"correct":"under","accepted_answers":["under"],"review_text":"Et forholdsord fortæller, hvor noget er i forhold til noget andet: under sengen."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',5,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt?","options":["nøvendig","nødvendig","nødvenig","nødvendi"],"correct":"nødvendig","accepted_answers":["nødvendig"],"review_text":"Nødvendig staves med d to steder: nød-vendig."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',5,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder udtrykket 'at tage benene på nakken'?","options":["at lave gymnastik","at falde","at løbe meget hurtigt","at gå langsomt"],"correct":"at løbe meget hurtigt","accepted_answers":["at løbe meget hurtigt"],"review_text":"At tage benene på nakken betyder at løbe så hurtigt, man kan."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',5,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Selvom de var blevet advaret, gik drengene ud på isen. Pludselig hørte de et højt knæk.' Hvad skete der nok?","options":["Isen blev tykkere","Drengene vandt et løb","Solen gik ned","Isen begyndte at revne"],"correct":"Isen begyndte at revne","accepted_answers":["Isen begyndte at revne"],"review_text":"Et højt knæk på isen betyder, at isen revner. Derfor var de blevet advaret."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',5,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er grundleddet i sætningen 'Om morgenen spiser min lillesøster havregryn'?","options":["min lillesøster","havregryn","spiser","Om morgenen"],"correct":"min lillesøster","accepted_answers":["min lillesøster"],"review_text":"Grundleddet er den, der gør noget. Hvem spiser? Min lillesøster."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',5,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning er skrevet rigtigt?","options":["Sommerferien starter i Juli, og vi rejser til Norge.","Sommerferien starter i juli, og vi rejser til Norge.","Sommerferien starter i juli, og vi rejser til norge.","sommerferien starter i juli, og vi rejser til Norge."],"correct":"Sommerferien starter i juli, og vi rejser til Norge.","accepted_answers":["Sommerferien starter i juli, og vi rejser til Norge."],"review_text":"Måneder skrives med lille, men navne på lande skrives med stort."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',5,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"I hvilket ord kan man ikke høre d'et?","options":["dag","dukke","mand","drage"],"correct":"mand","accepted_answers":["mand"],"review_text":"I 'mand' er d'et stumt. I de andre ord kan man høre d'et i starten."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',5,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er udsagnsleddet i sætningen 'Mormor har bagt boller'?","options":["Mormor","boller","bagt boller","har bagt"],"correct":"har bagt","accepted_answers":["har bagt"],"review_text":"Udsagnsleddet er det, der sker: 'har bagt'. Det kan bestå af flere ord."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',5,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'at overdrive'?","options":["at gøre noget større eller værre, end det er","at køre forbi nogen","at give op","at sige sandheden"],"correct":"at gøre noget større eller værre, end det er","accepted_answers":["at gøre noget større eller værre, end det er"],"review_text":"Når man overdriver, får man noget til at lyde større eller værre, end det er."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',5,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Ida rakte hånden op igen og igen, men læreren valgte hver gang en anden. Til sidst lagde hun armene over kors.' Hvad viser det, Ida gør til sidst?","options":["at hun fryser","at hun er blevet irriteret","at hun er glad","at hun vil sove"],"correct":"at hun er blevet irriteret","accepted_answers":["at hun er blevet irriteret"],"review_text":"Ida bliver aldrig valgt. Armene over kors viser, at hun er blevet irriteret."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',5,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt?","options":["desvære","desværrre","desværre","desvere"],"correct":"desværre","accepted_answers":["desværre"],"review_text":"Desværre staves med to r'er: des-værre."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',5,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning bruger kolon rigtigt?","options":["Du skal huske: tre ting madpakke, drikkedunk og regntøj.","Du skal: huske tre ting madpakke, drikkedunk og regntøj.","Du skal huske tre ting madpakke: drikkedunk og regntøj.","Du skal huske tre ting: madpakke, drikkedunk og regntøj."],"correct":"Du skal huske tre ting: madpakke, drikkedunk og regntøj.","accepted_answers":["Du skal huske tre ting: madpakke, drikkedunk og regntøj."],"review_text":"Kolon står lige før det, man opremser: tre ting: madpakke, drikkedunk og regntøj."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',5,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder 'en hest' i flertal, bestemt form?","options":["hestene","hestne","heste","hesterne"],"correct":"hestene","accepted_answers":["hestene"],"review_text":"En hest – heste – hestene. 'Hestene' er flertal i bestemt form."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',5,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Ræven så druerne hænge højt oppe. Den sprang og sprang, men nåede dem ikke. »De er alligevel sure,« sagde den og gik.' Hvorfor siger ræven, at druerne er sure?","options":["Fordi den havde smagt dem","Fordi den ikke kunne nå dem","Fordi druerne var grønne","Fordi den ikke kunne lide frugt"],"correct":"Fordi den ikke kunne nå dem","accepted_answers":["Fordi den ikke kunne nå dem"],"review_text":"Ræven har ikke smagt druerne. Den siger, de er sure, fordi den ikke kunne nå dem."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',5,4
);
