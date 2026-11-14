-- Dansk 6.-9. klasse — fortsættelse af 20261019120001_danish_grade3_5
-- 120 MC-spørgsmål: learning_objective='danish', target_grade 6/7/8/9 (30/30/30/30),
-- difficulty_band 1-4. Stavning, ordforråd, grammatik, tegnsætning, læseforståelse og litteratur
-- (virkemidler, fortæller, genrer, argumentation). Samme indholds- og metadata-mønster som 3.-5.
--
-- Leveres kun, når eleven vælger "Dansk" på Spil-siden (subject='dansk' i get-next-question).
-- Placement holder 'danish' ude (20261019120000_placement_exclude_danish, anvendes først).
--
-- Uses dollar-quoting ($$) throughout. All is_active=true.
-- Må KUN anvendes via apply_migration med særskilt ejer-autorisation (D-110).

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt? Man bruger det, når man forklarer noget nærmere.","options":["nemlig","nemli","nemmelig","nämlig"],"correct":"nemlig","accepted_answers":["nemlig"],"review_text":"Nemlig staves med ét m og -lig til sidst."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',6,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'enig'?","options":["at være alene","at have samme mening","at være uenig","at være træt"],"correct":"at have samme mening","accepted_answers":["at have samme mening"],"review_text":"Når man er enig, har man samme mening som en anden."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',6,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er nutid af 'at skrive'?","options":["skrev","skrevet","skriver","skrive"],"correct":"skriver","accepted_answers":["skriver"],"review_text":"Nutid er det, der sker nu: Jeg skriver."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',6,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning om højtider er skrevet rigtigt?","options":["Jul og Påske er højtider.","jul og påske er højtider.","Jul og påske er Højtider.","Jul og påske er højtider."],"correct":"Jul og påske er højtider.","accepted_answers":["Jul og påske er højtider."],"review_text":"Højtider som jul og påske skrives med lille begyndelsesbogstav."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',6,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Mads lagde telefonen væk og åbnede bogen. Prøven var i morgen.' Hvad skal Mads nok?","options":["læse op til prøven","spille på telefonen","sove","ringe til en ven"],"correct":"læse op til prøven","accepted_answers":["læse op til prøven"],"review_text":"Han lægger telefonen væk og åbner bogen dagen før prøven. Han skal læse op."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',6,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er et biord i sætningen 'Vi spiser ofte pasta'?","options":["Vi","ofte","spiser","pasta"],"correct":"ofte","accepted_answers":["ofte"],"review_text":"Biord fortæller noget om, hvordan, hvor eller hvor tit noget sker. 'Ofte' fortæller hvor tit."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',6,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt? Det betyder 'i virkeligheden'.","options":["egentli","eentlig","egentlig","ejentlig"],"correct":"egentlig","accepted_answers":["egentlig"],"review_text":"Egentlig staves med g – selvom man ikke kan høre det."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',6,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er det modsatte af 'positiv'?","options":["glad","stor","rolig","negativ"],"correct":"negativ","accepted_answers":["negativ"],"review_text":"Positiv og negativ er hinandens modsætninger."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',6,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad hedder 'et øje' i flertal, bestemt form?","options":["øjnene","øjerne","øjene","øjnerne"],"correct":"øjnene","accepted_answers":["øjnene"],"review_text":"Et øje – øjne – øjnene."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',6,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt? Det betyder 'naturligvis'.","options":["selvføllelig","selvfølgelig","selfølgelig","selvfølgeli"],"correct":"selvfølgelig","accepted_answers":["selvfølgelig"],"review_text":"Selvfølgelig er sat sammen af selv og følgelig."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',6,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvor skal kommaet stå i 'Da klokken ringede gik alle ud'?","options":["Da, klokken ringede gik alle ud.","Da klokken, ringede gik alle ud.","Da klokken ringede, gik alle ud.","Da klokken ringede gik, alle ud."],"correct":"Da klokken ringede, gik alle ud.","accepted_answers":["Da klokken ringede, gik alle ud."],"review_text":"Kommaet står efter ledsætningen 'Da klokken ringede'."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',6,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'at improvisere'?","options":["at øve sig længe","at give op","at kopiere andre","at finde på noget i øjeblikket"],"correct":"at finde på noget i øjeblikket","accepted_answers":["at finde på noget i øjeblikket"],"review_text":"At improvisere er at finde på noget, mens det sker, uden at have planlagt det."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',6,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Hver gang Sara skulle fremlægge, rystede hendes hænder, og stemmen blev tynd.' Hvordan har Sara det med at fremlægge?","options":["Hun er nervøs","Hun glæder sig","Hun keder sig","Hun er vred"],"correct":"Hun er nervøs","accepted_answers":["Hun er nervøs"],"review_text":"Rystende hænder og en tynd stemme viser, at Sara er nervøs."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',6,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad kalder man en kort fortælling, hvor dyr taler som mennesker, og hvor der er en lære til sidst?","options":["en roman","en fabel","en reportage","en opskrift"],"correct":"en fabel","accepted_answers":["en fabel"],"review_text":"En fabel har ofte talende dyr og en morale – en lære – til sidst."}$$::jsonb,
  'mc','short',$${"concepts":["litteratur"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',6,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'Hun har ___ hele bogen.'","options":["læser","læste","læst","læse"],"correct":"læst","accepted_answers":["læst"],"review_text":"Efter 'har' bruger man formen 'læst': Hun har læst."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',6,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt? Det er en person, der fx konstruerer broer og maskiner.","options":["ingenjør","inginiør","ingeniøre","ingeniør"],"correct":"ingeniør","accepted_answers":["ingeniør"],"review_text":"Ingeniør staves i-n-g-e-n-i-ø-r."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',6,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er genstandsleddet i sætningen 'Malthe sparkede bolden'?","options":["bolden","Malthe","sparkede","sparkede bolden"],"correct":"bolden","accepted_answers":["bolden"],"review_text":"Genstandsleddet er det, handlingen går ud over. Hvad sparkede Malthe? Bolden."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',6,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning med et indirekte spørgsmål er skrevet rigtigt?","options":["Hun spurgte om vi ville med?","Hun spurgte, om vi ville med.","Hun spurgte, om vi ville med?","hun spurgte, om vi ville med."],"correct":"Hun spurgte, om vi ville med.","accepted_answers":["Hun spurgte, om vi ville med."],"review_text":"Et indirekte spørgsmål ('om vi ville med') slutter med punktum, ikke spørgsmålstegn."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',6,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder udtrykket 'at gå som katten om den varme grød'?","options":["at have meget travlt","at være sulten","at undgå at sige det vigtige direkte","at lave mad"],"correct":"at undgå at sige det vigtige direkte","accepted_answers":["at undgå at sige det vigtige direkte"],"review_text":"Man går uden om det vigtige, ligesom en kat der ikke tør tage den varme grød."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',6,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Morfar tørrede brillerne og så længe på det gamle billede. »Det var dengang,« sagde han stille.' Hvad føler morfar nok?","options":["Han er vred","Han keder sig","Han er bange","Han tænker vemodigt tilbage"],"correct":"Han tænker vemodigt tilbage","accepted_answers":["Han tænker vemodigt tilbage"],"review_text":"Han ser længe på billedet og taler stille om 'dengang'. Han er vemodig."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',6,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er en jeg-fortæller?","options":["en fortæller, der selv er en person i historien","en fortæller, der ved alt om alle","en forfatter, der skriver et brev","en person, der læser højt"],"correct":"en fortæller, der selv er en person i historien","accepted_answers":["en fortæller, der selv er en person i historien"],"review_text":"En jeg-fortæller er med i historien og fortæller med 'jeg'."}$$::jsonb,
  'mc','short',$${"concepts":["litteratur"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',6,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt? Det betyder underlig.","options":["mærkeli","mærkelig","mærklig","merkelig"],"correct":"mærkelig","accepted_answers":["mærkelig"],"review_text":"Mærkelig staves med æ og -lig til sidst."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',6,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er bindeordet i 'Jeg blev hjemme, fordi jeg var syg'?","options":["Jeg","blev","fordi","syg"],"correct":"fordi","accepted_answers":["fordi"],"review_text":"Bindeord binder sætninger sammen. 'Fordi' binder grunden til resten."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',6,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket virkemiddel er brugt i 'Solen smilede til os'?","options":["rim","overdrivelse","sammenligning","besjæling"],"correct":"besjæling","accepted_answers":["besjæling"],"review_text":"Solen får en menneskelig egenskab – den smiler. Det kaldes besjæling."}$$::jsonb,
  'mc','short',$${"concepts":["litteratur"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',6,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning har kommaet det rigtige sted?","options":["Hvis du kommer i morgen, kan vi bage.","Hvis du kommer, i morgen kan vi bage.","Hvis, du kommer i morgen kan vi bage.","Hvis du kommer i morgen kan, vi bage."],"correct":"Hvis du kommer i morgen, kan vi bage.","accepted_answers":["Hvis du kommer i morgen, kan vi bage."],"review_text":"Kommaet står efter hele ledsætningen 'Hvis du kommer i morgen'."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',6,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'konsekvens'?","options":["en slags konkurrence","en følge af noget, man har gjort","en hemmelighed","en undskyldning"],"correct":"en følge af noget, man har gjort","accepted_answers":["en følge af noget, man har gjort"],"review_text":"En konsekvens er det, der sker som følge af noget, man har gjort."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',6,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er datid af 'at sidde'?","options":["siddede","sidte","sad","sat"],"correct":"sad","accepted_answers":["sad"],"review_text":"I går sad jeg. 'Sat' er datid af 'at sætte'."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',6,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt? Det er en person, man ikke kender.","options":["fremed","fræmmed","fremmet","fremmed"],"correct":"fremmed","accepted_answers":["fremmed"],"review_text":"Fremmed staves med to m'er og d til sidst."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',6,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Alle lo, da Victor faldt over tasken. Victor lo med – men da han kom hjem, smækkede han døren.' Hvad viser teksten?","options":["at Victor skjulte, at han var ked af det","at Victor syntes, det var sjovt hele tiden","at Victor var træt","at tasken var hans"],"correct":"at Victor skjulte, at han var ked af det","accepted_answers":["at Victor skjulte, at han var ked af det"],"review_text":"Han lo med, men smækkede døren derhjemme. Han skjulte, hvordan han havde det."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',6,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er en morale?","options":["den første sætning i en tekst","den lære, man kan drage af en historie","navnet på hovedpersonen","stedet, hvor historien foregår"],"correct":"den lære, man kan drage af en historie","accepted_answers":["den lære, man kan drage af en historie"],"review_text":"Moralen er den lære, historien vil give læseren."}$$::jsonb,
  'mc','short',$${"concepts":["litteratur"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',6,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt? Man siger det, når man har gjort noget forkert.","options":["unskyld","undskyl","undskyld","undskylld"],"correct":"undskyld","accepted_answers":["undskyld"],"review_text":"Undskyld staves med d to steder: un-d-skyl-d."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',7,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder det at være 'kritisk'?","options":["at være syg","at være glad for alt","at tale højt","at vurdere noget grundigt og ikke bare tro på det"],"correct":"at vurdere noget grundigt og ikke bare tro på det","accepted_answers":["at vurdere noget grundigt og ikke bare tro på det"],"review_text":"At være kritisk er at vurdere noget grundigt, før man tror på det."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',7,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken ordklasse er 'smukke' i 'de smukke blomster'?","options":["tillægsord","navneord","udsagnsord","biord"],"correct":"tillægsord","accepted_answers":["tillægsord"],"review_text":"'Smukke' fortæller, hvordan blomsterne er. Det er et tillægsord."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',7,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning om skoleskemaet er skrevet rigtigt?","options":["Vi har Dansk om mandagen.","Vi har dansk om mandagen.","Vi har dansk om Mandagen.","vi har dansk om mandagen."],"correct":"Vi har dansk om mandagen.","accepted_answers":["Vi har dansk om mandagen."],"review_text":"Skolefag og ugedage skrives med lille begyndelsesbogstav."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',7,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Selvom billetten var dyr, købte Nora den. Koncerten havde hun ventet på i et år.' Hvorfor købte Nora billetten?","options":["Billetten var billig","Hun fik den gratis","Hun havde glædet sig længe til koncerten","Hun skulle give den væk"],"correct":"Hun havde glædet sig længe til koncerten","accepted_answers":["Hun havde glædet sig længe til koncerten"],"review_text":"Hun havde ventet et år på koncerten – derfor købte hun billetten, selvom den var dyr."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',7,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad kalder man også hovedpersonen i en fortælling?","options":["antagonist","illustrator","redaktør","protagonist"],"correct":"protagonist","accepted_answers":["protagonist"],"review_text":"Hovedpersonen kaldes protagonist. Modstanderen kaldes antagonist."}$$::jsonb,
  'mc','short',$${"concepts":["litteratur"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',7,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt? Det er en person, der kører fx bus eller taxa.","options":["chauffør","chaufør","sjaufør","chauffeur"],"correct":"chauffør","accepted_answers":["chauffør"],"review_text":"Chauffør staves med ch og to f'er."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',7,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord betyder næsten det samme som 'begejstret'?","options":["skuffet","entusiastisk","ligeglad","træt"],"correct":"entusiastisk","accepted_answers":["entusiastisk"],"review_text":"Begejstret og entusiastisk betyder næsten det samme."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',7,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er grundleddet i 'I går købte min far en ny bil'?","options":["en ny bil","købte","min far","I går"],"correct":"min far","accepted_answers":["min far"],"review_text":"Grundleddet er den, der gør noget. Hvem købte? Min far."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',7,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt? Det betyder, at man gør noget som sit arbejde.","options":["profesionel","professionell","proffesionel","professionel"],"correct":"professionel","accepted_answers":["professionel"],"review_text":"Professionel har ét f, to s'er og ét l til sidst."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',7,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning om lande og sprog er skrevet rigtigt?","options":["Hun er fra Tyskland og taler tysk.","Hun er fra tyskland og taler tysk.","Hun er fra Tyskland og taler Tysk.","hun er fra Tyskland og taler tysk."],"correct":"Hun er fra Tyskland og taler tysk.","accepted_answers":["Hun er fra Tyskland og taler tysk."],"review_text":"Lande skrives med stort, men sprog skrives med lille."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',7,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'at argumentere'?","options":["at være uenig uden at sige hvorfor","at give grunde for sin mening","at skændes højt","at skifte emne"],"correct":"at give grunde for sin mening","accepted_answers":["at give grunde for sin mening"],"review_text":"Når man argumenterer, giver man grunde til, at ens mening er rigtig."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',7,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Klokken var 23. Lyden af nøglen i døren fik mor til at rejse sig fra sofaen med armene over kors.' Hvad sker der nok?","options":["Mor skal i seng","Der er indbrud","Nogen kommer for sent hjem, og mor er utilfreds","Mor er glad for besøg"],"correct":"Nogen kommer for sent hjem, og mor er utilfreds","accepted_answers":["Nogen kommer for sent hjem, og mor er utilfreds"],"review_text":"Det er sent, og armene over kors viser, at mor er utilfreds med, at nogen kommer så sent."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',7,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er en metafor?","options":["en sammenligning med 'som'","et ord, der rimer","en lang beskrivelse af et sted","et billedligt udtryk uden 'som', fx 'hun er en stjerne'"],"correct":"et billedligt udtryk uden 'som', fx 'hun er en stjerne'","accepted_answers":["et billedligt udtryk uden 'som', fx 'hun er en stjerne'"],"review_text":"En metafor siger, at noget ER noget andet: 'Hun er en stjerne.' Med 'som' er det en sammenligning."}$$::jsonb,
  'mc','short',$${"concepts":["litteratur"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',7,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'Hvis jeg ___ rig, ville jeg rejse jorden rundt.'","options":["var","er","været","være"],"correct":"var","accepted_answers":["var"],"review_text":"Efter 'hvis' i en tænkt situation bruger man datid: Hvis jeg var rig."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',7,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt? Det betyder ros og respekt for det, man har gjort.","options":["anderkendelse","anerkendelse","anerkendelsse","anerkendelze"],"correct":"anerkendelse","accepted_answers":["anerkendelse"],"review_text":"Anerkendelse staves a-n-e-r-k-e-n-d-e-l-s-e."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',7,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken ordklasse er 'under' i 'Katten sidder under bordet'?","options":["biord","bindeord","forholdsord","navneord"],"correct":"forholdsord","accepted_answers":["forholdsord"],"review_text":"'Under' fortæller, hvor katten er i forhold til bordet. Det er et forholdsord."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',7,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvor skal kommaet stå i 'Efter at vi havde spist gik vi en tur'?","options":["Efter, at vi havde spist gik vi en tur.","Efter at vi, havde spist gik vi en tur.","Efter at vi havde spist gik, vi en tur.","Efter at vi havde spist, gik vi en tur."],"correct":"Efter at vi havde spist, gik vi en tur.","accepted_answers":["Efter at vi havde spist, gik vi en tur."],"review_text":"Kommaet står efter ledsætningen 'Efter at vi havde spist'."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',7,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'at slå to fluer med ét smæk'?","options":["at klare to ting på én gang","at være meget vred","at gøre noget forkert","at fange insekter"],"correct":"at klare to ting på én gang","accepted_answers":["at klare to ting på én gang"],"review_text":"Man får to ting gjort med én handling."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',7,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Han kiggede på uret for tredje gang. Bussen skulle være kommet for tyve minutter siden.' Hvordan har han det nok?","options":["afslappet","utålmodig","glad","søvnig"],"correct":"utålmodig","accepted_answers":["utålmodig"],"review_text":"Han kigger igen og igen på uret, mens bussen er forsinket. Han er utålmodig."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',7,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad kalder man stedet i en fortælling, hvor spændingen er størst?","options":["anslag","slutning","klimaks","præsentation"],"correct":"klimaks","accepted_answers":["klimaks"],"review_text":"Klimaks er højdepunktet. Anslaget er starten, der sætter historien i gang."}$$::jsonb,
  'mc','short',$${"concepts":["litteratur"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',7,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt? Det betyder 'nok' eller 'formentlig'.","options":["sandsynlivis","sansynligvis","sandsynlighvis","sandsynligvis"],"correct":"sandsynligvis","accepted_answers":["sandsynligvis"],"review_text":"Sandsynligvis staves med d og -ligvis til sidst."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',7,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'to ___ huse'?","options":["små","lille","lilles","mindre"],"correct":"små","accepted_answers":["små"],"review_text":"Lille hedder små i flertal: et lille hus, to små huse."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',7,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket virkemiddel er brugt i 'Han var så sulten, at han kunne spise en hel hest'?","options":["besjæling","overdrivelse","rim","metafor"],"correct":"overdrivelse","accepted_answers":["overdrivelse"],"review_text":"Ingen kan spise en hel hest. Det er en overdrivelse for at vise, hvor sulten han er."}$$::jsonb,
  'mc','short',$${"concepts":["litteratur"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',7,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning med en råbt advarsel er skrevet rigtigt?","options":["Hun råbte, »pas på!«","Hun råbte: pas på!","Hun råbte: »Pas på!«","Hun råbte »Pas på«!"],"correct":"Hun råbte: »Pas på!«","accepted_answers":["Hun råbte: »Pas på!«"],"review_text":"Kolon før replikken, anførselstegn om den, stort begyndelsesbogstav og udråbstegnet inden for anførselstegnene."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',7,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er ironi?","options":["at tale meget langsomt","at fortælle en sand historie","at gentage sig selv","at sige det modsatte af det, man mener"],"correct":"at sige det modsatte af det, man mener","accepted_answers":["at sige det modsatte af det, man mener"],"review_text":"Ironi er at sige det modsatte af det, man mener – fx 'Dejligt vejr!' i silende regn."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',7,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er udsagnsleddet i 'Mine venner skal spille fodbold i morgen'?","options":["skal spille","Mine venner","fodbold","i morgen"],"correct":"skal spille","accepted_answers":["skal spille"],"review_text":"Udsagnsleddet er alle udsagnsordene: 'skal spille'."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',7,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt? Det betyder meget spændende og fængslende.","options":["fasinerende","fascinerende","fascinernde","fashinerende"],"correct":"fascinerende","accepted_answers":["fascinerende"],"review_text":"Fascinerende staves med sc."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',7,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: '»Flot klaret,« sagde Jonas og himlede med øjnene, da Emil tabte bolden igen.' Hvad mener Jonas?","options":["Han roser Emil ærligt","Han er bange for Emil","Han er ironisk og synes ikke, det var flot","Han har ikke set det"],"correct":"Han er ironisk og synes ikke, det var flot","accepted_answers":["Han er ironisk og synes ikke, det var flot"],"review_text":"Han himler med øjnene. Han siger 'flot', men mener det modsatte – han er ironisk."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',7,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er en novelle?","options":["en meget lang roman i flere bind","et digt med rim","en avisartikel","en kort fortælling med få personer og ét centralt forløb"],"correct":"en kort fortælling med få personer og ét centralt forløb","accepted_answers":["en kort fortælling med få personer og ét centralt forløb"],"review_text":"En novelle er kort, har få personer og handler om ét forløb."}$$::jsonb,
  'mc','short',$${"concepts":["litteratur"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',7,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt? Det er det, man bruger, når man fokuserer på en opgave.","options":["koncentration","koncentation","konsentration","koncentratjon"],"correct":"koncentration","accepted_answers":["koncentration"],"review_text":"Koncentration staves med c og -tion til sidst."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',8,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'objektiv'?","options":["meget personlig","neutral og uden at tage parti","forkert","hemmelig"],"correct":"neutral og uden at tage parti","accepted_answers":["neutral og uden at tage parti"],"review_text":"Objektiv betyder neutral – man holder sine egne følelser ude."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',8,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken ordklasse er 'hurtigt' i 'Hun cykler hurtigt'?","options":["tillægsord","udsagnsord","biord","navneord"],"correct":"biord","accepted_answers":["biord"],"review_text":"'Hurtigt' fortæller, hvordan hun cykler. Her er det et biord."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',8,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning om en avis er skrevet rigtigt?","options":["Vi læste en artikel i politiken.","vi læste en artikel i Politiken.","Vi læste en Artikel i Politiken.","Vi læste en artikel i Politiken."],"correct":"Vi læste en artikel i Politiken.","accepted_answers":["Vi læste en artikel i Politiken."],"review_text":"Navne på aviser skrives med stort. Almindelige navneord som 'artikel' skrives med lille."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',8,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Ifølge en undersøgelse bruger unge i gennemsnit tre timer om dagen på sociale medier.' Hvad er sætningen et eksempel på?","options":["en påstand, der bygger på en undersøgelse","et digt","en personlig mening uden belæg","en opskrift"],"correct":"en påstand, der bygger på en undersøgelse","accepted_answers":["en påstand, der bygger på en undersøgelse"],"review_text":"Sætningen henviser til en undersøgelse. Den bygger altså på noget, man har målt."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',8,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad kalder man den, der fortæller historien inde i teksten?","options":["forfatteren","fortælleren","modtageren","illustratoren"],"correct":"fortælleren","accepted_answers":["fortælleren"],"review_text":"Forfatteren skriver teksten. Fortælleren er stemmen, der fortæller inde i teksten."}$$::jsonb,
  'mc','short',$${"concepts":["litteratur"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',8,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt? Det fortæller, hvor god en ting er.","options":["kvaletet","kvallitet","kvalitet","qvalitet"],"correct":"kvalitet","accepted_answers":["kvalitet"],"review_text":"Kvalitet staves k-v-a-l-i-t-e-t."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',8,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'at påvirke'?","options":["at undgå noget","at gentage noget","at glemme noget","at have indflydelse på noget"],"correct":"at have indflydelse på noget","accepted_answers":["at have indflydelse på noget"],"review_text":"At påvirke er at have indflydelse på noget eller nogen."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',8,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er genstandsleddet i 'Læreren gav eleverne en opgave'?","options":["en opgave","eleverne","Læreren","gav"],"correct":"en opgave","accepted_answers":["en opgave"],"review_text":"Hvad gav læreren? En opgave. 'Eleverne' er hensynsleddet – dem, der får den."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',8,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt? Det handler om naturen, luften og vandet omkring os.","options":["miljøe","miljø","milljø","miljö"],"correct":"miljø","accepted_answers":["miljø"],"review_text":"Miljø staves m-i-l-j-ø."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',8,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvor skal kommaet stå i 'Fordi det var koldt tog hun en hue på'?","options":["Fordi, det var koldt tog hun en hue på.","Fordi det var, koldt tog hun en hue på.","Fordi det var koldt, tog hun en hue på.","Fordi det var koldt tog hun, en hue på."],"correct":"Fordi det var koldt, tog hun en hue på.","accepted_answers":["Fordi det var koldt, tog hun en hue på."],"review_text":"Kommaet står efter ledsætningen 'Fordi det var koldt'."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',8,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord betyder det modsatte af 'optimistisk'?","options":["glad","energisk","realistisk","pessimistisk"],"correct":"pessimistisk","accepted_answers":["pessimistisk"],"review_text":"En optimist tror på det bedste, en pessimist frygter det værste."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',8,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Køb nu! Kun i dag – halv pris på alle sko!' Hvad er formålet med teksten?","options":["at få læseren til at købe","at fortælle en historie","at informere om vejret","at underholde med en vits"],"correct":"at få læseren til at købe","accepted_answers":["at få læseren til at købe"],"review_text":"Det er en reklame. Den vil have læseren til at købe – og skynde sig."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',8,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er en allitteration?","options":["når ord rimer til sidst","når flere ord tæt på hinanden starter med samme lyd","når en ting får menneskelige egenskaber","når man overdriver"],"correct":"når flere ord tæt på hinanden starter med samme lyd","accepted_answers":["når flere ord tæt på hinanden starter med samme lyd"],"review_text":"Fx 'store, stærke Svend'. Ordene starter med samme lyd."}$$::jsonb,
  'mc','short',$${"concepts":["litteratur"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',8,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken form passer: 'Opgaven skal ___ inden fredag.'","options":["afleverer","afleverede","afleveres","afleveret"],"correct":"afleveres","accepted_answers":["afleveres"],"review_text":"Opgaven afleverer ikke selv – den bliver afleveret. Derfor passiv: skal afleveres."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',8,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt? Det betyder 'som regel' eller 'i det hele taget'.","options":["generalt","genereldt","djenerelt","generelt"],"correct":"generelt","accepted_answers":["generelt"],"review_text":"Generelt staves g-e-n-e-r-e-l-t."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',8,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning står i passiv?","options":["Kagen blev spist af børnene.","Børnene spiste kagen.","Børnene spiser kage.","Børnene vil spise kagen."],"correct":"Kagen blev spist af børnene.","accepted_answers":["Kagen blev spist af børnene."],"review_text":"I passiv er det, handlingen går ud over, i fokus: Kagen blev spist."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',8,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning er skrevet rigtigt, når man siger noget direkte til Sofie?","options":["Sofie kom lige her!","Sofie, kom lige her!","Sofie: kom lige her!","Sofie; kom lige her!"],"correct":"Sofie, kom lige her!","accepted_answers":["Sofie, kom lige her!"],"review_text":"Når man taler direkte til nogen, sætter man komma efter navnet. Uden komma betyder det, at Sofie kom."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',8,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'at have is i maven'?","options":["at have ondt i maven","at være sulten","at være rolig i en svær situation","at fryse"],"correct":"at være rolig i en svær situation","accepted_answers":["at være rolig i en svær situation"],"review_text":"Man bevarer roen, selv når det er svært."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',8,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Skolen bør have længere frikvarterer. Elever, der bevæger sig, lærer bedre.' Hvad er den første sætning?","options":["et belæg","en ordforklaring","et citat","en påstand"],"correct":"en påstand","accepted_answers":["en påstand"],"review_text":"Den første sætning er påstanden. Den anden sætning er belægget, der støtter den."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',8,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken slags fortæller kender alle personers tanker og følelser?","options":["en alvidende fortæller","en jeg-fortæller","en fortæller, der kun følger én person","en ydre fortæller"],"correct":"en alvidende fortæller","accepted_answers":["en alvidende fortæller"],"review_text":"En alvidende fortæller ved alt – også hvad alle personerne tænker."}$$::jsonb,
  'mc','short',$${"concepts":["litteratur"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',8,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt? Det er en samtale, hvor man udveksler forskellige meninger.","options":["diskution","diskussion","diskusion","dikussion"],"correct":"diskussion","accepted_answers":["diskussion"],"review_text":"Diskussion staves med -ssion til sidst."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',8,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er bindeordet i 'Hun var træt, men hun fortsatte'?","options":["Hun","træt","men","fortsatte"],"correct":"men","accepted_answers":["men"],"review_text":"'Men' binder de to sætninger sammen og viser en modsætning."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',8,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er temaet i en tekst?","options":["navnet på forfatteren","antallet af kapitler","titlen på første afsnit","det overordnede emne, teksten handler om"],"correct":"det overordnede emne, teksten handler om","accepted_answers":["det overordnede emne, teksten handler om"],"review_text":"Temaet er det store emne bag handlingen, fx venskab, svigt eller frihed."}$$::jsonb,
  'mc','short',$${"concepts":["litteratur"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',8,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning om indkøbslisten er skrevet rigtigt?","options":["Der var tre ting på listen: mælk, brød og æg.","Der var tre ting på listen, mælk: brød og æg.","Der var: tre ting på listen mælk, brød og æg.","Der var tre ting på listen; mælk, brød, og æg."],"correct":"Der var tre ting på listen: mælk, brød og æg.","accepted_answers":["Der var tre ting på listen: mælk, brød og æg."],"review_text":"Kolon står lige før opremsningen."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',8,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'at generalisere'?","options":["at gøre noget meget præcist","at sige, at noget gælder for alle, ud fra få eksempler","at give en ordre","at undersøge noget grundigt"],"correct":"at sige, at noget gælder for alle, ud fra få eksempler","accepted_answers":["at sige, at noget gælder for alle, ud fra få eksempler"],"review_text":"Fx 'Alle teenagere er dovne' – ud fra nogle få. Det er en generalisering."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',8,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er et stedord i 'Mormor gav os en kage'?","options":["Mormor","gav","os","kage"],"correct":"os","accepted_answers":["os"],"review_text":"'Os' står i stedet for navnene på dem, der fik kagen. Det er et stedord."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',8,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt? Det er et forsøg, man laver for at undersøge noget.","options":["ekspriment","experiment","eksperimant","eksperiment"],"correct":"eksperiment","accepted_answers":["eksperiment"],"review_text":"På dansk staves eksperiment med ks."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',8,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Hun svarede ikke på beskeden. Telefonen lå med skærmen nedad, og hun stirrede ud ad vinduet.' Hvad kan man udlede?","options":["Hun vil ikke tale med nogen lige nu","Hendes telefon er gået i stykker","Hun er glad og travl","Hun venter på et opkald"],"correct":"Hun vil ikke tale med nogen lige nu","accepted_answers":["Hun vil ikke tale med nogen lige nu"],"review_text":"Hun lægger skærmen nedad og svarer ikke. Hun trækker sig – hun vil være i fred."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',8,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er et symbol i en tekst?","options":["et ord, der rimer","en ting, der står for noget større, fx en due for fred","en replik","en overskrift"],"correct":"en ting, der står for noget større, fx en due for fred","accepted_answers":["en ting, der står for noget større, fx en due for fred"],"review_text":"Et symbol er en ting, der betyder mere end sig selv – som duen, der står for fred."}$$::jsonb,
  'mc','short',$${"concepts":["litteratur"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',8,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt? Det passer her: 'Dyre sko er ikke ___ bedre.'","options":["nødvendivis","nøvendigvis","nødvendigvis","nødvændigvis"],"correct":"nødvendigvis","accepted_answers":["nødvendigvis"],"review_text":"Nødvendigvis staves med d to steder og -igvis til sidst."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',9,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'subjektiv'?","options":["helt neutral","videnskabeligt bevist","meget lang","præget af ens egen mening og følelser"],"correct":"præget af ens egen mening og følelser","accepted_answers":["præget af ens egen mening og følelser"],"review_text":"Subjektiv er det modsatte af objektiv: præget af ens egen mening."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',9,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken ordklasse er 'og'?","options":["bindeord","forholdsord","biord","stedord"],"correct":"bindeord","accepted_answers":["bindeord"],"review_text":"'Og' binder ord og sætninger sammen. Det er et bindeord."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',9,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning med en dato er skrevet rigtigt?","options":["Jeg er født den 3 maj 2011.","Jeg er født den 3. maj 2011.","Jeg er født den 3. Maj 2011.","Jeg er født den 3.maj 2011."],"correct":"Jeg er født den 3. maj 2011.","accepted_answers":["Jeg er født den 3. maj 2011."],"review_text":"Punktum efter tallet, mellemrum og månedens navn med lille."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',9,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Undersøgelsen omfattede kun 12 elever fra én skole.' Hvad er problemet, hvis man bruger den til at sige noget om alle elever i Danmark?","options":["Den er for gammel","Den er skrevet på dansk","Den er for lille til at gælde for alle","Der er ingen problemer"],"correct":"Den er for lille til at gælde for alle","accepted_answers":["Den er for lille til at gælde for alle"],"review_text":"12 elever fra én skole er for få til at sige noget om alle elever i landet."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',9,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad kalder man en tekst, der vil overbevise læseren om en mening?","options":["en fortællende tekst","en instruerende tekst","en beskrivende tekst","en argumenterende tekst"],"correct":"en argumenterende tekst","accepted_answers":["en argumenterende tekst"],"review_text":"En argumenterende tekst vil overbevise. En instruerende tekst fortæller, hvordan man gør noget."}$$::jsonb,
  'mc','short',$${"concepts":["litteratur"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',9,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt? Det betyder, at man passer på og tager sig af noget.","options":["ansvarlig","ansvarli","ansvalig","anssvarlig"],"correct":"ansvarlig","accepted_answers":["ansvarlig"],"review_text":"Ansvarlig er sat sammen af ansvar og -lig."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',9,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'relevant'?","options":["at det er sjovt","at det har betydning for sagen","at det er gammelt","at det er forkert"],"correct":"at det har betydning for sagen","accepted_answers":["at det har betydning for sagen"],"review_text":"Noget relevant har betydning for det, man taler om."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',1,'auto',true,'danish',9,1
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er grundleddet i 'Hvornår kommer dine forældre hjem?'","options":["Hvornår","kommer","dine forældre","hjem"],"correct":"dine forældre","accepted_answers":["dine forældre"],"review_text":"Hvem kommer? Dine forældre. Grundleddet kan stå efter udsagnsordet i spørgsmål."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',9,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt? Det er det, der sker som følge af en handling.","options":["konsekvents","konsækvens","kondsekvens","konsekvens"],"correct":"konsekvens","accepted_answers":["konsekvens"],"review_text":"Konsekvens staves k-o-n-s-e-k-v-e-n-s."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',9,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvor skal kommaet stå i 'Selvom det regnede spillede vi videre'?","options":["Selvom det regnede, spillede vi videre.","Selvom, det regnede spillede vi videre.","Selvom det, regnede spillede vi videre.","Selvom det regnede spillede, vi videre."],"correct":"Selvom det regnede, spillede vi videre.","accepted_answers":["Selvom det regnede, spillede vi videre."],"review_text":"Kommaet står efter ledsætningen 'Selvom det regnede'."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',9,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad betyder 'at analysere'?","options":["at gætte","at undersøge noget grundigt ved at dele det op","at skrive af","at gøre noget hurtigt"],"correct":"at undersøge noget grundigt ved at dele det op","accepted_answers":["at undersøge noget grundigt ved at dele det op"],"review_text":"Når man analyserer, deler man noget op og undersøger delene grundigt."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',9,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Ministeren lovede flere lærere. Et halvt år senere var der færre.' Hvad antyder teksten?","options":["at ministeren var lærer","at der kom flere lærere","at løftet ikke blev holdt","at skolerne lukkede"],"correct":"at løftet ikke blev holdt","accepted_answers":["at løftet ikke blev holdt"],"review_text":"Der blev lovet flere, men der kom færre. Løftet blev ikke holdt."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',9,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er en kronik?","options":["en kort nyhed","et digt","en tegneserie","en længere debatartikel i en avis, skrevet af en person udefra"],"correct":"en længere debatartikel i en avis, skrevet af en person udefra","accepted_answers":["en længere debatartikel i en avis, skrevet af en person udefra"],"review_text":"En kronik er en længere debattekst i en avis, typisk skrevet af en ekspert eller en borger."}$$::jsonb,
  'mc','short',$${"concepts":["litteratur"],"cognitive_skill":"comprehension","difficulty_type":"conceptual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',9,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord passer: 'Hvis jeg havde vidst det, ___ jeg være kommet.'","options":["ville","vil","vile","villet"],"correct":"ville","accepted_answers":["ville"],"review_text":"Tænkt fortid: Hvis jeg havde vidst det, ville jeg være kommet."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',9,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt? Det er en styreform, hvor folket vælger, hvem der bestemmer.","options":["demokrasi","demokrati","demograti","dæmokrati"],"correct":"demokrati","accepted_answers":["demokrati"],"review_text":"Demokrati staves med k og -ti til sidst."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"reinforcement","insight_type":"conceptual_bridge","domain":"danish"}$$::jsonb,
  'mc_single',2,'auto',true,'danish',9,2
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket led er 'i morgen' i 'Vi tager til Aarhus i morgen'?","options":["grundled","genstandsled","biled","udsagnsled"],"correct":"biled","accepted_answers":["biled"],"review_text":"'I morgen' fortæller hvornår. Det er et biled (et tidsadverbial)."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',9,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning med indirekte tale er skrevet rigtigt?","options":["Han sagde: at han var syg.","Han sagde »at han var syg«.","Han sagde; at han var syg.","Han sagde, at han var syg."],"correct":"Han sagde, at han var syg.","accepted_answers":["Han sagde, at han var syg."],"review_text":"Indirekte tale med 'at' står uden kolon og anførselstegn."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',9,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er kildekritik?","options":["at vurdere, om en kilde er troværdig","at skrive en kilde af","at kritisere en forfatter","at finde vand"],"correct":"at vurdere, om en kilde er troværdig","accepted_answers":["at vurdere, om en kilde er troværdig"],"review_text":"Kildekritik er at spørge: Hvem står bag, hvorfor, og kan jeg stole på det?"}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',9,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Firmaet bag undersøgelsen, der viser at slik er sundt, sælger selv slik.' Hvad bør man være opmærksom på?","options":["at slik er sundt","at afsenderen har en interesse i resultatet","at undersøgelsen er ny","at firmaet er stort"],"correct":"at afsenderen har en interesse i resultatet","accepted_answers":["at afsenderen har en interesse i resultatet"],"review_text":"Firmaet tjener penge på slik. Derfor har det en interesse i, hvad undersøgelsen viser."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',9,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er en anafor?","options":["når en tekst slutter med et spørgsmål","når to ord rimer","når flere sætninger eller linjer starter med det samme ord","når en ting beskrives med farver"],"correct":"når flere sætninger eller linjer starter med det samme ord","accepted_answers":["når flere sætninger eller linjer starter med det samme ord"],"review_text":"Fx 'Vi vil have frihed. Vi vil have retfærdighed.' Gentagelsen i starten er en anafor."}$$::jsonb,
  'mc','short',$${"concepts":["litteratur"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',9,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt? Det bruges om to linjer, der aldrig mødes.","options":["paralel","parralel","parallell","parallel"],"correct":"parallel","accepted_answers":["parallel"],"review_text":"Parallel har to l'er i midten og ét l til sidst."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',9,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken ordklasse er 'sig' i 'Hun vaskede sig'?","options":["stedord","navneord","biord","udsagnsord"],"correct":"stedord","accepted_answers":["stedord"],"review_text":"'Sig' er et stedord, der peger tilbage på 'hun'."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',3,'auto',true,'danish',9,3
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er en åben slutning?","options":["en slutning, hvor alt bliver forklaret","en slutning, hvor læseren selv må tolke, hvad der sker","en tekst uden titel","en slutning, hvor alle dør"],"correct":"en slutning, hvor læseren selv må tolke, hvad der sker","accepted_answers":["en slutning, hvor læseren selv må tolke, hvad der sker"],"review_text":"Ved en åben slutning får læseren ikke svaret – man må selv tolke."}$$::jsonb,
  'mc','short',$${"concepts":["litteratur"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',9,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken sætning bruger tankestreg rigtigt?","options":["Der var kun én ting – tilbage at vente.","Der – var kun én ting tilbage at vente.","Der var kun én ting tilbage – at vente.","Der var kun én ting tilbage at – vente."],"correct":"Der var kun én ting tilbage – at vente.","accepted_answers":["Der var kun én ting tilbage – at vente."],"review_text":"Tankestregen giver en pause før det, der skal fremhæves: at vente."}$$::jsonb,
  'mc','short',$${"concepts":["tegnsætning"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',9,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er retorik?","options":["læren om tal","læren om planter","læren om gamle sprog","læren om at tale og skrive overbevisende"],"correct":"læren om at tale og skrive overbevisende","accepted_answers":["læren om at tale og skrive overbevisende"],"review_text":"Retorik handler om, hvordan man overbeviser med ord."}$$::jsonb,
  'mc','short',$${"concepts":["ordforråd"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',9,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilken af disse er en ledsætning?","options":["fordi han havde travlt","han havde travlt","Han løb hjem.","Løb hjem!"],"correct":"fordi han havde travlt","accepted_answers":["fordi han havde travlt"],"review_text":"En ledsætning kan ikke stå alene og starter ofte med et bindeord som 'fordi'."}$$::jsonb,
  'mc','short',$${"concepts":["grammatik"],"cognitive_skill":"application","difficulty_type":"applied","misconception_type":"overgeneralization","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',9,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvilket ord er stavet rigtigt? Det passer her: 'Jeg begyndte at ___ mig for musik.'","options":["interesere","interessere","intresere","interressere"],"correct":"interessere","accepted_answers":["interessere"],"review_text":"Interessere har ét r og to s'er – ligesom interessant."}$$::jsonb,
  'mc','short',$${"concepts":["stavning"],"cognitive_skill":"recall","difficulty_type":"factual","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',9,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Læs: 'Han lovede at ringe. Telefonen forblev tavs hele weekenden.' Hvordan viser teksten skuffelsen?","options":["Den bruger rim","Den lader personen græde højt","Den viser den gennem situationen i stedet for at sige det direkte","Den skriver direkte, at nogen er skuffet"],"correct":"Den viser den gennem situationen i stedet for at sige det direkte","accepted_answers":["Den viser den gennem situationen i stedet for at sige det direkte"],"review_text":"Teksten siger aldrig 'skuffet'. Den tavse telefon viser det – man viser i stedet for at fortælle."}$$::jsonb,
  'mc','short',$${"concepts":["læseforståelse"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',9,4
);

INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  $${"question":"Hvad er etos i en argumentation?","options":["at man appellerer til følelser","at man bruger tal og fakta","at man gentager sig selv","at afsenderen virker troværdig"],"correct":"at afsenderen virker troværdig","accepted_answers":["at afsenderen virker troværdig"],"review_text":"Etos er troværdighed. Patos er følelser, og logos er fornuft og fakta."}$$::jsonb,
  'mc','short',$${"concepts":["litteratur"],"cognitive_skill":"analysis","difficulty_type":"inferential","misconception_type":"surface_association","challenge_role":"challenge","insight_type":"reframing","domain":"danish"}$$::jsonb,
  'mc_single',4,'auto',true,'danish',9,4
);
