-- Section 77 — Vikings Content Sprint
-- 50 production-ready Viking questions for Grades 4–5
-- Distribution: Grade 4 (25) + Grade 5 (25)
-- Bands: B1×15, B2×15, B3×12, B4×8
-- Concepts: daily life, trade, travel, beliefs, settlements, farming, crafts, exploration, social structure, raids
-- All questions: domain=vikings, is_active=true, 100% review_text

-- ─── PREREQUISITE: Expand target_grade constraint to allow Grades 3–9 ─────────
-- Previous constraint limited target_grade to [7, 8, 9].
-- History Curriculum Architecture requires Grades 3–9.

ALTER TABLE public.questions
  DROP CONSTRAINT questions_target_grade_check;

ALTER TABLE public.questions
  ADD CONSTRAINT questions_target_grade_check
  CHECK (target_grade IS NULL OR (target_grade >= 3 AND target_grade <= 9));

-- ─── GRADE 4 · BAND 1 (9 questions) ─────────────────────────────────────────

-- vk_g4b1_01 — Daily life
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad spiste vikinger til hverdag?","options":["Havregrød, brød, fisk og kål","Hamburger og pommes frites","Pasta og pizza","Ris og nudler"],"correct":"Havregrød, brød, fisk og kål","accepted_answers":["Havregrød, brød, fisk og kål"],"review_text":"Vikinger spiste simpel mad: havregrød, rugbrød, fisk og kål. De dyrkede selv korn og grøntsager og fiskede i søer og havet. Maden var enkel, men nærende."}'::jsonb,
  'mc','short','{"concepts":["vikinge-kost","dagligliv","landbrug"],"misconception_type":"anachronism","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',1,'auto',true,'vikings',4,1
);

-- vk_g4b1_02 — Trade
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad solgte vikinger når de handlede med andre folk?","options":["Pels, rav og slaver","Biler og maskiner","Sukker og kaffe","Porcelæn og silke"],"correct":"Pels, rav og slaver","accepted_answers":["Pels, rav og slaver"],"review_text":"Vikinger handlede med pels, rav og slaver. De sejlede til fjerne lande for at bytte disse varer mod guld, sølv og andre ting. Handel var ligeså vigtigt som plyndring."}'::jsonb,
  'mc','short','{"concepts":["handel","eksportvarer","vikinge-økonomi"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',1,'auto',true,'vikings',4,1
);

-- vk_g4b1_03 — Misconception: horned helmets
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvordan så en rigtig vikinge-hjelm ud?","options":["Glat metalskål uden horn","En stor hjelm med to horn","En træhjelm malet rød","En hjelm med en fugl på toppen"],"correct":"Glat metalskål uden horn","accepted_answers":["Glat metalskål uden horn"],"review_text":"Vikinger bar IKKE hornede hjelme i krig! Det er en myte. Rigtige vikinge-hjelme var simple metalkapper — glatte og praktiske. Myten om hornede hjelme stammer fra en tegning lavet i 1800-tallet."}'::jsonb,
  'mc','short','{"concepts":["vikinge-hjelm","myte","arkæologi"],"misconception_type":"popular_myth","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',1,'auto',true,'vikings',4,1
);

-- vk_g4b1_04 — Settlements
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad hed det hus de fleste vikinger boede i?","options":["Langhus","Slot","Lejlighed","Telt"],"correct":"Langhus","accepted_answers":["Langhus"],"review_text":"Vikinger boede i langhuse — lange, smalle huse bygget af træ og tørv. Hele familien boede under ét tag. Om vinteren holdt dyren i husets ene ende alle lidt varmere."}'::jsonb,
  'mc','short','{"concepts":["langhus","vikinge-bolig","bopladser"],"misconception_type":"anachronism","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',1,'auto',true,'vikings',4,1
);

-- vk_g4b1_05 — Misconception: not all warriors (farming)
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad lavede de fleste vikinger til hverdag?","options":["Dyrkede jord og passede dyr","Kæmpede i krige","Sejlede rundt og plyndrede","Byggede slotte"],"correct":"Dyrkede jord og passede dyr","accepted_answers":["Dyrkede jord og passede dyr"],"review_text":"Flertallet af vikinger var bønder! De dyrkede korn, passede køer, får og grise. Kun en lille del af vikingerne var krigere eller handelsmænd der rejste langt hjemmefra."}'::jsonb,
  'mc','short','{"concepts":["vikingebønder","dagligliv","misconception-alle-krigere"],"misconception_type":"overgeneralization","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',1,'auto',true,'vikings',4,1
);

-- vk_g4b1_06 — Beliefs
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad hed vikingernes vigtigste guder?","options":["Odin, Thor og Freja","Zeus, Hera og Poseidon","Jupiter, Mars og Venus","Ra, Osiris og Isis"],"correct":"Odin, Thor og Freja","accepted_answers":["Odin, Thor og Freja"],"review_text":"Vikinger troede på mange guder. De vigtigste var Odin (gudernes far), Thor (tordenens gud) og Freja (kærlighedens gudinde). Deres religion kaldes norrøn mytologi."}'::jsonb,
  'mc','short','{"concepts":["norrøn mytologi","Odin","Thor","Freja"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',1,'auto',true,'vikings',4,1
);

-- vk_g4b1_07 — Travel/Navigation
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad hed vikingernes berømte skib?","options":["Langskib","Dampskib","U-båd","Flåde"],"correct":"Langskib","accepted_answers":["Langskib"],"review_text":"Vikingernes langskib var særligt. Det var langt og smalt, kunne både sejles og ros, og var fladt nok til at sejle op ad floder. Det var grunden til at vikinger kunne rejse så langt."}'::jsonb,
  'mc','short','{"concepts":["langskib","vikinges teknologi","navigation"],"misconception_type":"anachronism","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',1,'auto',true,'vikings',4,1
);

-- vk_g4b1_08 — Social structure
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvem bestemte i en vikingelandsby?","options":["Den lokale høvding eller rige bonde","En fjern konge der aldrig besøgte dem","Præsten","Den ældste kvinde i landsbyen"],"correct":"Den lokale høvding eller rige bonde","accepted_answers":["Den lokale høvding eller rige bonde"],"review_text":"I vikingelandsbyer bestemte lokale høvdinge eller rige bønder. Der var ikke én stor leder for alle vikinger. Magt kom fra at have mange dyr, land og folk der støttede dig."}'::jsonb,
  'mc','short','{"concepts":["vikingekraft","høvding","lokalstyre"],"misconception_type":"overgeneralization","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',1,'auto',true,'vikings',4,1
);

-- vk_g4b1_09 — Exploration
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvem opdagede Amerika ca. 500 år før Columbus?","options":["Leif Eriksson","Erik den Røde","Harald Blåtand","Knud den Store"],"correct":"Leif Eriksson","accepted_answers":["Leif Eriksson"],"review_text":"Vikingen Leif Eriksson nåede Amerika ca. år 1000 — næsten 500 år før Columbus! Han kaldte stedet Vinland. Arkæologer har fundet et rigtigt vikinge-sted i Canada som bevis."}'::jsonb,
  'mc','short','{"concepts":["Leif Eriksson","Vinland","opdagelsesrejser"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',1,'auto',true,'vikings',4,1
);

-- ─── GRADE 4 · BAND 2 (8 questions) ─────────────────────────────────────────

-- vk_g4b2_01 — Trade (Misconception: not only raiders)
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Vikingerne handlede med folk i fjerne lande. Hvad fik de til gengæld?","options":["Sølv, krydderier og silke fra øst","Biler og elektronik","Is og sne fra Grønland","Guldmønter lavet i Danmark"],"correct":"Sølv, krydderier og silke fra øst","accepted_answers":["Sølv, krydderier og silke fra øst"],"review_text":"Vikingerne var dygtige handelsfolk. Langs floderne i Rusland nåede de helt til Konstantinopel og arabiske byer. Der byttede de pels og slaver mod sølv og luksusvarer. Det var ikke kun plyndring."}'::jsonb,
  'mc','short','{"concepts":["handel","handelsvarer","Konstantinopel","misconception-kun-plyndring"],"misconception_type":"overgeneralization","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',2,'auto',true,'vikings',4,2
);

-- vk_g4b2_02 — Misconception: not all warriors
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad lavede vikinger der IKKE var krigere?","options":["Handlede, fiskede, lavede håndværk og dyrkede jord","Sad hjemme og ventede på nyheder","Spillede og hvilede sig","Gik i krig for sjov"],"correct":"Handlede, fiskede, lavede håndværk og dyrkede jord","accepted_answers":["Handlede, fiskede, lavede håndværk og dyrkede jord"],"review_text":"Langt de fleste vikinger var aldrig i kamp. De var bønder, fiskere, håndværkere og handelsfolk. Vikinge-samfundet var meget lig vores — folk arbejdede og levede et normalt hverdagsliv."}'::jsonb,
  'mc','short','{"concepts":["vikinge-hverdagsliv","misconception-alle-krigere","erhverv"],"misconception_type":"overgeneralization","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',2,'auto',true,'vikings',4,2
);

-- vk_g4b2_03 — Crafts
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var vikingerne særligt dygtige til at lave med deres hænder?","options":["Smykker, våben og skibe af høj kvalitet","Computere og robotter","Plastiklegetøj og balloner","Cement og stålbroer"],"correct":"Smykker, våben og skibe af høj kvalitet","accepted_answers":["Smykker, våben og skibe af høj kvalitet"],"review_text":"Vikinge-håndværkere var mestre. De lavede smukke smykker af sølv, skarpe sværd og verdens mest avancerede skibe. Vikinge-genstande var så gode at de blev solgt over hele Europa."}'::jsonb,
  'mc','short','{"concepts":["håndværk","smykker","skibsbygning","misconception-primitive"],"misconception_type":"overgeneralization","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',2,'auto',true,'vikings',4,2
);

-- vk_g4b2_04 — Settlements (langhus function)
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var særligt smart ved vikingernes langhus?","options":["Dyrene boede i den ene ende og holdt huset varmt om vinteren","Det havde centralvarme og badeværelse","Det var lavet af beton og holdt i tusindvis af år","Det havde tre etager og mange rum"],"correct":"Dyrene boede i den ene ende og holdt huset varmt om vinteren","accepted_answers":["Dyrene boede i den ene ende og holdt huset varmt om vinteren"],"review_text":"I et langhus boede både folk og dyr! Dyrene levede i den ene ende af huset. Kroppens varme fra dyrene hjalp med at varme huset om vinteren. Det lød måske ulækkert, men det var smart."}'::jsonb,
  'mc','short','{"concepts":["langhus","varme","vikinge-design"],"misconception_type":"anachronism","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',2,'auto',true,'vikings',4,2
);

-- vk_g4b2_05 — Beliefs: Valhalla
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad troede vikinger der skete med tapre krigere der døde i kamp?","options":["De kom til Valhalla — en stor fest-hal for helte","De kom til himlen som kristne gør","De blev genfødt som dyr","Ingenting — vikinger troede ikke på et efterliv"],"correct":"De kom til Valhalla — en stor fest-hal for helte","accepted_answers":["De kom til Valhalla — en stor fest-hal for helte"],"review_text":"Vikinger troede at tapre krigere der døde i kamp kom til Valhalla — Odins store hal. Der ville de spise, drikke og kæmpe for evigt. Det var den højeste ære en viking kunne opnå."}'::jsonb,
  'mc','short','{"concepts":["Valhalla","norrøn religion","efterlivet"],"misconception_type":"false_equivalence","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',2,'auto',true,'vikings',4,2
);

-- vk_g4b2_06 — Navigation
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad brugte vikinger til at finde vej på havet?","options":["Stjerner, solen og kystlinje","GPS og mobiltelefon","Et stort landkort","Radar og computer"],"correct":"Stjerner, solen og kystlinje","accepted_answers":["Stjerner, solen og kystlinje"],"review_text":"Vikinge-navigatorer var ekstremt dygtige. De brugte solen om dagen, stjernerne om natten, og fulgte kyster og fugle. De sejlede fra Norge til Island — 800 km — uden instrumenter."}'::jsonb,
  'mc','short','{"concepts":["navigation","stjerner","vikinge-sejlads","misconception-primitive"],"misconception_type":"overgeneralization","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',2,'auto',true,'vikings',4,2
);

-- vk_g4b2_07 — Social structure: thrall
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var en \"thrall\" i vikinge-samfundet?","options":["En slave der arbejdede for andre og ikke var fri","En kriger med særlige rettigheder","En rig bonde med meget jord","En konges nærmeste rådgiver"],"correct":"En slave der arbejdede for andre og ikke var fri","accepted_answers":["En slave der arbejdede for andre og ikke var fri"],"review_text":"Vikinge-samfundet var delt i tre klasser: jarler (rigmænd), karler (frie bønder) og thraller (slaver). Thraller ejedes af andre og havde ingen rettigheder. Slaveri var en vigtig del af vikinge-samfundet."}'::jsonb,
  'mc','short','{"concepts":["thrall","slaveri","vikinge-klasser","social struktur"],"misconception_type":"scope_confusion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',2,'auto',true,'vikings',4,2
);

-- vk_g4b2_08 — Raids: Lindisfarne
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvornår startede vikingernes angreb på klostre i Europa?","options":["Ca. år 793 — angrebet på klosteret Lindisfarne i England","Ca. år 1000 da Columbus sejlede","I middelalderen ca. år 1200","Da den romerske kejser bestemte det"],"correct":"Ca. år 793 — angrebet på klosteret Lindisfarne i England","accepted_answers":["Ca. år 793 — angrebet på klosteret Lindisfarne i England"],"review_text":"Vikingetiden starter med angrebet på klosteret Lindisfarne i England i år 793. Klostre var nemme mål: de lå ved kysten, var rige på guld og sølv, og havde ingen soldater til forsvar."}'::jsonb,
  'mc','short','{"concepts":["Lindisfarne","793","vikingetiden begyndelse","klosterangreb"],"misconception_type":"temporal_confusion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',2,'auto',true,'vikings',4,2
);

-- ─── GRADE 4 · BAND 3 (5 questions) ─────────────────────────────────────────

-- vk_g4b3_01 — Trade: why good at it
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvorfor var vikingerne så gode til at handle med folk langt væk?","options":["Fordi de byggede skibe der kunne sejle på både hav og floder — og de kendte ruterne","Fordi alle folk elskede vikinger og ikke frygtede dem","Fordi de havde monopol på alle verdens varer","Fordi de var de eneste der overhovedet kunne sejle"],"correct":"Fordi de byggede skibe der kunne sejle på både hav og floder — og de kendte ruterne","accepted_answers":["Fordi de byggede skibe der kunne sejle på både hav og floder — og de kendte ruterne"],"review_text":"Vikinge-skibe kunne sejle på åbent hav OG op ad smalle floder. Det betød at vikinger kunne nå langt ind i kontinentet — langt fra kysten. Via floderne i Rusland nåede de helt til Arabien."}'::jsonb,
  'mc','short','{"concepts":["handel","skibsdesign","handelsruter","causal_chain"],"misconception_type":"false_equivalence","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"vikings"}'::jsonb,
  'mc_single',3,'auto',true,'vikings',4,3
);

-- vk_g4b3_02 — Misconception: women
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad ved vi om vikinge-kvinder fra arkæologiske fund?","options":["De kunne eje land, kræve skilsmisse og nogle blev begravet med våben som krigere","De måtte kun lave mad og sy — ingen andre opgaver","De er usynlige i historien — vi ved næsten ingenting","De fulgte altid mændene og var fuldstændig afhængige"],"correct":"De kunne eje land, kræve skilsmisse og nogle blev begravet med våben som krigere","accepted_answers":["De kunne eje land, kræve skilsmisse og nogle blev begravet med våben som krigere"],"review_text":"Vikinge-kvinder havde overraskende mange rettigheder. De kunne eje jord og kræve skilsmisse. Fund viser at nogle kvinder er begravet med våben. De styrede hjemmet og handelen mens mænd var væk."}'::jsonb,
  'mc','short','{"concepts":["vikinge-kvinder","rettigheder","misconception-kun-mænd","arkæologi"],"misconception_type":"overgeneralization","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"challenge","domain":"vikings"}'::jsonb,
  'mc_single',3,'auto',true,'vikings',4,3
);

-- vk_g4b3_03 — Exploration: why
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad drev vikingerne til at udforske så fjerne steder som Island og Grønland?","options":["Mangel på jord hjemme og mulighed for rigdom og ny jord","Ren eventyrlyst og kedsomhed","En konges direkte ordre til alle vikinger","Religionens krav om at rejse"],"correct":"Mangel på jord hjemme og mulighed for rigdom og ny jord","accepted_answers":["Mangel på jord hjemme og mulighed for rigdom og ny jord"],"review_text":"Vikingernes ekspansion skyldtes dels mangel på jord i Skandinavien — befolkningen voksede. Dels var der muligheder for handel og rigdom udenlands. Det var ikke kun eventyrlyst — det var praktisk nødvendighed."}'::jsonb,
  'mc','short','{"concepts":["ekspansion","befolkningsvækst","migration","årsager"],"misconception_type":"surface_association","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"vikings"}'::jsonb,
  'mc_single',3,'auto',true,'vikings',4,3
);

-- vk_g4b3_04 — Social structure: tinget
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var \"tinget\" i vikinge-samfundet?","options":["En forsamling hvor frie mænd mødtes for at løse stridigheder og vedtage regler","Et fængsel for kriminelle","Et marked for handel","Et religiøst møde til gudetjeneste"],"correct":"En forsamling hvor frie mænd mødtes for at løse stridigheder og vedtage regler","accepted_answers":["En forsamling hvor frie mænd mødtes for at løse stridigheder og vedtage regler"],"review_text":"Tinget var en tidlig form for demokrati! Frie mænd mødtes for at afgøre stridigheder og diskutere regler. Det viser at vikinge-samfundet ikke kun handlede om vold — det havde et retssystem."}'::jsonb,
  'mc','short','{"concepts":["ting","demokrati","retssystem","vikinge-styre"],"misconception_type":"overgeneralization","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"vikings"}'::jsonb,
  'mc_single',3,'auto',true,'vikings',4,3
);

-- vk_g4b3_05 — Crafts: what it tells us (not primitive)
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad fortæller vikingernes avancerede smykker og skibsbygning os om dem?","options":["At de var teknisk dygtige og langt fra primitive","At de stjal alle ideerne fra andre folk","At kun konger og jarler havde adgang til godt håndværk","At de kopierede romernes teknikker direkte"],"correct":"At de var teknisk dygtige og langt fra primitive","accepted_answers":["At de var teknisk dygtige og langt fra primitive"],"review_text":"Vikinge-håndværket viser høj teknisk kunnen: sølvsmykker krævede præcisionsværktøj, og langskibets fleksible skrog var ingeniørkunst. Vikinger var ikke primitive — de var innovative."}'::jsonb,
  'mc','short','{"concepts":["håndværk","misconception-primitive","teknologi","innovation"],"misconception_type":"overgeneralization","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"vikings"}'::jsonb,
  'mc_single',3,'auto',true,'vikings',4,3
);

-- ─── GRADE 4 · BAND 4 (3 questions) ─────────────────────────────────────────

-- vk_g4b4_01 — Perspectives: raids
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Klosteret Lindisfarne og vikingerne — to syn på den samme hændelse i år 793?","options":["Munkene oplevede det som meningsløs vold; vikingerne så det som en velplanlagt og profitabel ekspedition","Alle syntes det var en fejl og var kede af det","Begge parter var enige om at det var retfærdigt","Vikingerne angreb ved en fejltagelse"],"correct":"Munkene oplevede det som meningsløs vold; vikingerne så det som en velplanlagt og profitabel ekspedition","accepted_answers":["Munkene oplevede det som meningsløs vold; vikingerne så det som en velplanlagt og profitabel ekspedition"],"review_text":"Perspektiv er afgørende i historie. For munkene var angrebet uforståeligt og grusomt. For vikingerne var det en velplanlagt tur til et rigt, ubeskyttet mål. Begge oplevelser er sande — hændelsen er den samme."}'::jsonb,
  'mc','short','{"concepts":["perspektiv","Lindisfarne","raids","historisk forståelse"],"misconception_type":"causal_inversion","cognitive_skill":"evaluation","difficulty_type":"applied","insight_type":"perspective_shift","challenge_role":"deep_challenge","domain":"vikings"}'::jsonb,
  'mc_single',4,'auto',true,'vikings',4,4
);

-- vk_g4b4_02 — Trade vs raids complexity
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Var vikinger primært handelsfolk eller plyndrere?","options":["Begge dele — den samme person kunne handle fredeligt ét sted og plyndre et andet","Udelukkende handelsfolk der aldrig plyndrede","Udelukkende plyndrere der aldrig handlede","Ingen af delene — de var primært bønder der aldrig rejste"],"correct":"Begge dele — den samme person kunne handle fredeligt ét sted og plyndre et andet","accepted_answers":["Begge dele — den samme person kunne handle fredeligt ét sted og plyndre et andet"],"review_text":"Den samme viking der handlede i Konstantinopel kunne plyndre et kloster på vejen hjem. Kontekst og mulighed bestemte adfærden. Det gør vikinger svære at sætte i én boks — de var komplekse mennesker."}'::jsonb,
  'mc','short','{"concepts":["kompleksitet","handel","plyndring","vikinge-identitet"],"misconception_type":"false_equivalence","cognitive_skill":"evaluation","difficulty_type":"applied","insight_type":"perspective_shift","challenge_role":"deep_challenge","domain":"vikings"}'::jsonb,
  'mc_single',4,'auto',true,'vikings',4,4
);

-- vk_g4b4_03 — Ting and democratic limits
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Tinget minder om demokrati — men hvad var den vigtige forskel fra demokrati i dag?","options":["Kun frie mænd deltog — kvinder og thraller var udelukket","Det var identisk med moderne demokrati","Det var et diktatur, slet ikke demokrati","Alle — inklusive slaver — havde lige stemme"],"correct":"Kun frie mænd deltog — kvinder og thraller var udelukket","accepted_answers":["Kun frie mænd deltog — kvinder og thraller var udelukket"],"review_text":"Tinget var bemærkelsesværdigt — men ikke universelt. Demokratiets idé var til stede. Men kvinder, thraller og udlændinge var udelukket. Det minder os om at demokrati historisk set altid har haft grænser."}'::jsonb,
  'mc','short','{"concepts":["ting","demokrati","begrænsninger","historisk sammenligning"],"misconception_type":"overgeneralization","cognitive_skill":"evaluation","difficulty_type":"applied","insight_type":"perspective_shift","challenge_role":"deep_challenge","domain":"vikings"}'::jsonb,
  'mc_single',4,'auto',true,'vikings',4,4
);

-- ─── GRADE 5 · BAND 1 (6 questions) ─────────────────────────────────────────

-- vk_g5b1_01 — Exploration: Greenland
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad kaldte vikingerne det store ø-land vest for Island?","options":["Grønland","Canada","Vinland","Irland"],"correct":"Grønland","accepted_answers":["Grønland"],"review_text":"Erik den Røde opdagede Grønland ca. år 982. Han gav det det grønne navn for at tiltrække bosættere — selvom Grønland i virkeligheden er dækket af is. Et tidligt eksempel på smart markedsføring."}'::jsonb,
  'mc','short','{"concepts":["Grønland","Erik den Røde","opdagelse","navngivning"],"misconception_type":"surface_association","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',1,'auto',true,'vikings',5,1
);

-- vk_g5b1_02 — Trade: Hedeby
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var Hedeby i vikingetiden?","options":["En stor vikinge-handelsby ved grænsen til Tyskland","Et berømt vikingeslags sted","Et langt krigsskib","En norrøn gud for handel"],"correct":"En stor vikinge-handelsby ved grænsen til Tyskland","accepted_answers":["En stor vikinge-handelsby ved grænsen til Tyskland"],"review_text":"Hedeby var Skandinaviens vigtigste handelsby i vikingetiden. Den lå på grænsen mellem dansk og tysk territorium og var et knudepunkt for handel mellem nord og syd."}'::jsonb,
  'mc','short','{"concepts":["Hedeby","handelsby","vikinge-økonomi"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',1,'auto',true,'vikings',5,1
);

-- vk_g5b1_03 — Beliefs: Ragnarøk
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var Ragnarøk i norrøn mytologi?","options":["Den store kamp ved verdens ende, hvor guder og monstre kæmpede","Et vikinge-slagskib med mange roere","En norrøn gudinde for kærlighed","En årstidsfest om foråret"],"correct":"Den store kamp ved verdens ende, hvor guder og monstre kæmpede","accepted_answers":["Den store kamp ved verdens ende, hvor guder og monstre kæmpede"],"review_text":"Ragnarøk var vikingernes fortælling om verdens ende. I en kæmpe kamp ville guder og monstre ødelægge hinanden. Derefter ville en ny og bedre verden opstå."}'::jsonb,
  'mc','short','{"concepts":["Ragnarøk","norrøn mytologi","verdens ende"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',1,'auto',true,'vikings',5,1
);

-- vk_g5b1_04 — Social structure: jarl
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad betød det at være \"jarl\" i vikinge-samfundet?","options":["At høre til den rige og magtfulde adellige klasse","At være slave uden rettigheder","At være en fri bonde med lidt jord","At være en rejsende handelsmand"],"correct":"At høre til den rige og magtfulde adellige klasse","accepted_answers":["At høre til den rige og magtfulde adellige klasse"],"review_text":"En jarl var vikingernes adelsmand — han ejede meget land og mange folk og havde politisk indflydelse. Jarler betalte ikke skat; de modtog den. Det engelske ord \"earl\" stammer direkte fra \"jarl\"."}'::jsonb,
  'mc','short','{"concepts":["jarl","vikinge-klasser","adel","magt"],"misconception_type":"scope_confusion","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',1,'auto',true,'vikings',5,1
);

-- vk_g5b1_05 — Crafts: runer
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var runer?","options":["Vikingernes skrifttegn hugget i sten, metal eller træ","En slags vikinge-sværd med speciel form","Et musikinstrument til religiøse ritualer","En type skib til lange rejser"],"correct":"Vikingernes skrifttegn hugget i sten, metal eller træ","accepted_answers":["Vikingernes skrifttegn hugget i sten, metal eller træ"],"review_text":"Runer var vikingernes alfabet. De blev primært hugget i sten (runestene), metal og træ til mindesmærker og ejernavne. Danmark har over 200 runestene — verdens største samling."}'::jsonb,
  'mc','short','{"concepts":["runer","skrift","runestene","vikinge-kultur"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',1,'auto',true,'vikings',5,1
);

-- vk_g5b1_06 — Farming
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad dyrkede vikinger på deres marker?","options":["Byg, rug og havre","Ris, majs og bananer","Kartofler og tomater","Kaffe og the"],"correct":"Byg, rug og havre","accepted_answers":["Byg, rug og havre"],"review_text":"Vikinger dyrkede primært korn: byg til øl og mad, rug til brød og havre til grød og dyrefoder. Kartofler og majs fandtes ikke i Europa endnu — de kom fra Amerika."}'::jsonb,
  'mc','short','{"concepts":["landbrug","afgrøder","vikinge-økonomi"],"misconception_type":"anachronism","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',1,'auto',true,'vikings',5,1
);

-- ─── GRADE 5 · BAND 2 (7 questions) ─────────────────────────────────────────

-- vk_g5b2_01 — Exploration: Vinland
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad skete med vikingernes bosættelse i Vinland (Nordamerika)?","options":["Den blev opgivet efter få år — sandsynligvis pga. konflikter med de oprindelige folk","Den blomstrede og blev en stor koloni i 200 år","Den eksisterede aldrig — det er en myte","Den blev overtaget af Columbus da han ankom"],"correct":"Den blev opgivet efter få år — sandsynligvis pga. konflikter med de oprindelige folk","accepted_answers":["Den blev opgivet efter få år — sandsynligvis pga. konflikter med de oprindelige folk"],"review_text":"Vikingerne nåede Nordamerika ca. år 1000 men opgav stedet efter få år. Konflikter med de oprindelige folk — som vikingerne kaldte Skrællingerne — var sandsynligvis for kostbare. Modsat Columbus kom vikingerne ikke for at blive."}'::jsonb,
  'mc','short','{"concepts":["Vinland","Nordamerika","bosættelse","Skrællingerne"],"misconception_type":"false_equivalence","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',2,'auto',true,'vikings',5,2
);

-- vk_g5b2_02 — Misconception: only Denmark
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad dækkede vikingernes verden geografisk?","options":["Fra Nordamerika i vest til Konstantinopel og arabiske byer i øst","Kun Danmark og Norge","Kun Nordeuropa og England","Kun de skandinaviske lande — de sejlede aldrig til Sydeuropa"],"correct":"Fra Nordamerika i vest til Konstantinopel og arabiske byer i øst","accepted_answers":["Fra Nordamerika i vest til Konstantinopel og arabiske byer i øst"],"review_text":"Vikingernes rækkevidde var enorm. Normanner koloniserede Sicilien. Rus-vikinger nåede Konstantinopel. Leif Eriksson nåede Amerika. Arabiske sølvmønter er fundet i Sverige. Vikingernes verden var bogstaveligt talt global."}'::jsonb,
  'mc','short','{"concepts":["vikinge-geografi","misconception-kun-Danmark","handelsruter","globalt netværk"],"misconception_type":"overgeneralization","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',2,'auto',true,'vikings',5,2
);

-- vk_g5b2_03 — Trade: Rus routes
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad brugte vikingerne floderne i Rusland til?","options":["Som handelsveje fra Skandinavien ind til Konstantinopel og arabiske byer","Som forsvarslinje mod fjender","Som drikkevandskilder til langskibene","Som grænser mellem vikinge-territorier"],"correct":"Som handelsveje fra Skandinavien ind til Konstantinopel og arabiske byer","accepted_answers":["Som handelsveje fra Skandinavien ind til Konstantinopel og arabiske byer"],"review_text":"Vikingerne brugte de store russiske floder (Volga, Dnjepr) som motorveje ind i Østeuropa. Via disse ruter nåede de Konstantinopel og islamiske lande. Arabiske sølvmønter fundet i Sverige beviser at handelen var aktiv."}'::jsonb,
  'mc','short','{"concepts":["Rusland","handelsruter","Volga","Konstantinopel"],"misconception_type":"scope_confusion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',2,'auto',true,'vikings',5,2
);

-- vk_g5b2_04 — Women: archaeology
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad viser arkæologiske begravelser om vikinge-kvinders position?","options":["Nøgler i begravelser viser autoritet over husholdet; visse kvinder er begravet med våben","At kvinder var ubetydelige og er svære at finde i arkæologien","At kvinder altid blev begravet med mad og tøj — aldrig med magt-symboler","At alle kvinder var slaver eller thraller"],"correct":"Nøgler i begravelser viser autoritet over husholdet; visse kvinder er begravet med våben","accepted_answers":["Nøgler i begravelser viser autoritet over husholdet; visse kvinder er begravet med våben"],"review_text":"Arkæologi er vores vigtigste kilde til vikinge-kvinders liv. Nøgler i kvindebergivelser symboliserer autoritet over husholdet — hun kontrollerede ressourcerne. Visse begravelser indeholder sværd og spyd, hvilket antyder at kvindekrigere ikke var ren myte."}'::jsonb,
  'mc','short','{"concepts":["vikinge-kvinder","arkæologi","magt","misconception-kun-mænd"],"misconception_type":"overgeneralization","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',2,'auto',true,'vikings',5,2
);

-- vk_g5b2_05 — Beliefs: skjaldekunst
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var skaldekunst, og hvad fortæller den os om vikingerne?","options":["Kompleks poesi om helte og guder — den viser at vikinger havde en rig mundtlig kulturtradition","En slags musik spillet på primitive instrumenter","Vikingernes matematiske beregninger til navigation","Et magisk ritual til at kalde på guderne"],"correct":"Kompleks poesi om helte og guder — den viser at vikinger havde en rig mundtlig kulturtradition","accepted_answers":["Kompleks poesi om helte og guder — den viser at vikinger havde en rig mundtlig kulturtradition"],"review_text":"Skjaldene var professionelle digtere ved vikingefyrsters hof. Skaldekunst var teknisk kompliceret med avancerede rim og metaforer. At huske og fremføre lange digte krævede intelligens — vikinger var langt fra primitive."}'::jsonb,
  'mc','short','{"concepts":["skaldekunst","skjald","mundtlig kultur","misconception-primitive"],"misconception_type":"overgeneralization","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',2,'auto',true,'vikings',5,2
);

-- vk_g5b2_06 — Raids: why monasteries
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvorfor angreb vikinger præcis klostre og ikke fæstninger?","options":["Klostre var rige, lå ved kysten og var ubeskyttede — den perfekte kombination","Fordi vikinger hadede den kristne religion","Fordi klostre altid lå i skovene langt væk fra folk","Fordi vikingerne selv var kristne og ville teste kirken"],"correct":"Klostre var rige, lå ved kysten og var ubeskyttede — den perfekte kombination","accepted_answers":["Klostre var rige, lå ved kysten og var ubeskyttede — den perfekte kombination"],"review_text":"Klosterangreb var rationel strategi: klostre opbevarede guld og sølv, lå direkte ved kysten (nem flugt til skibet), og forsvaredes ikke af soldater. Det var ikke religiøs krig — det var effektiv plyndring."}'::jsonb,
  'mc','short','{"concepts":["klostre","angrebsstrategi","plyndring","kausal forklaring"],"misconception_type":"causal_inversion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',2,'auto',true,'vikings',5,2
);

-- vk_g5b2_07 — Settlement: vikinge-byer
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var karakteristisk for en vikinge-handelsby som Hedeby?","options":["Den voksede organisk rundt om havnen med håndværkere og handelsfolk — ingen central planlægning","Den var nøjagtig som en moderne by med rytteveje og kloaksystem","Den eksisterede ikke — vikinger boede kun på landet","Den var styret af en valgt borgmester med politistyrke"],"correct":"Den voksede organisk rundt om havnen med håndværkere og handelsfolk — ingen central planlægning","accepted_answers":["Den voksede organisk rundt om havnen med håndværkere og handelsfolk — ingen central planlægning"],"review_text":"Vikinge-byer som Hedeby og Ribe var handelsbyer — de voksede rundt om havne og markeder. Ingen byplanlægning eller fast administration. Men de var pulserende steder med håndværkere, handelsfolk og religiøs aktivitet."}'::jsonb,
  'mc','short','{"concepts":["Hedeby","handelsby","bydannelse","urbanisering"],"misconception_type":"anachronism","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"vikings"}'::jsonb,
  'mc_single',2,'auto',true,'vikings',5,2
);

-- ─── GRADE 5 · BAND 3 (7 questions) ─────────────────────────────────────────

-- vk_g5b3_01 — Navigation as evidence (not primitive)
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad viser vikingernes navigationsevner om dem som civilisation?","options":["At de var avancerede inden for astronomi og matematisk tænkning — langt fra primitive","At de var heldige og sejlede i blinde ud fra eventyrlyst","At de kopierede arabernes og romernes navigationsmetoder","At de aldrig sejlede i åbent hav — kun langs kyster"],"correct":"At de var avancerede inden for astronomi og matematisk tænkning — langt fra primitive","accepted_answers":["At de var avancerede inden for astronomi og matematisk tænkning — langt fra primitive"],"review_text":"At navigere fra Norge til Island uden instrumenter krævede præcis forståelse af stjernernes position og havets strømme. Vikingernes solsten (et krystal der finder solen bag skyer) var genial optisk teknologi. Navigationsfejl betød død — de fejlede sjældent."}'::jsonb,
  'mc','short','{"concepts":["navigation","astronomi","misconception-primitive","teknologi"],"misconception_type":"overgeneralization","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"challenge","domain":"vikings"}'::jsonb,
  'mc_single',3,'auto',true,'vikings',5,3
);

-- vk_g5b3_02 — Trade consequences for Scandinavia
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var konsekvensen af vikingernes handelsnetværk for Skandinavien?","options":["Skandinavien fik arabisk sølv og byzantinske varer og blev trukket ind i en global økonomi","Skandinavien forblev fuldstændig isoleret fra resten af verden","Handelsnetværket skabte kun krige og ingen velstand","Skandinavien eksporterede kun fisk og importerede ingenting"],"correct":"Skandinavien fik arabisk sølv og byzantinske varer og blev trukket ind i en global økonomi","accepted_answers":["Skandinavien fik arabisk sølv og byzantinske varer og blev trukket ind i en global økonomi"],"review_text":"Handelen transformerede Skandinavien. Arabiske sølvmønter stimulerede en pengeøkonomi. Kontakt med kristne lande banede vejen for Skandinaviens kristning. Vikingetiden var Skandinaviens globaliseringsmoment."}'::jsonb,
  'mc','short','{"concepts":["handel","konsekvenser","globalisering","vikinge-økonomi"],"misconception_type":"causal_inversion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"vikings"}'::jsonb,
  'mc_single',3,'auto',true,'vikings',5,3
);

-- vk_g5b3_03 — Class distinction: karl vs thrall
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var den afgørende forskel på en \"karl\" og en \"thrall\" i vikinge-samfundet?","options":["Karl var fri — kunne eje land og stemme på tinget. Thrall var ejet — kunne sælges og arves som kvæg","Det var blot to dialekter af det norrøne ord for bonde","De levede identisk men med forskellige titler","Thrall var øverst i hierarkiet med flest privilegier"],"correct":"Karl var fri — kunne eje land og stemme på tinget. Thrall var ejet — kunne sælges og arves som kvæg","accepted_answers":["Karl var fri — kunne eje land og stemme på tinget. Thrall var ejet — kunne sælges og arves som kvæg"],"review_text":"Frihed var den absolutte skillelinje i vikinge-samfundet. Karl betalte skat og mødtes på tinget. Thrall tilhørte juridisk sin ejer — som et stykke kvæg. Mange thraller i England og Irland endte i Skandinavien via handel."}'::jsonb,
  'mc','short','{"concepts":["karl","thrall","frihed","slaveri","klasseforskelle"],"misconception_type":"scope_confusion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"vikings"}'::jsonb,
  'mc_single',3,'auto',true,'vikings',5,3
);

-- vk_g5b3_04 — Grønland naming: strategic thinking
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvorfor kaldte Erik den Røde den isglacierede ø for \"Grønland\"?","options":["Han navngav det strategisk for at tiltrække bosættere — et tidligt eksempel på markedsføring","Han lavede en fejl — han troede faktisk at det var grønt","Han ville skjule øens beliggenhed for fjender og konkurrenter","Det var det rigtige navn dengang da klimaet var varmere"],"correct":"Han navngav det strategisk for at tiltrække bosættere — et tidligt eksempel på markedsføring","accepted_answers":["Han navngav det strategisk for at tiltrække bosættere — et tidligt eksempel på markedsføring"],"review_text":"Erik den Røde var landsforvist fra Island og fandt Grønland. Han kaldte det Grønland for at gøre det attraktivt for bosættere. Det var bevidst markedsføring 1000 år før moderne PR. Det viser strategisk tænkning."}'::jsonb,
  'mc','short','{"concepts":["Grønland","Erik den Røde","strategi","navngivning"],"misconception_type":"surface_association","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"vikings"}'::jsonb,
  'mc_single',3,'auto',true,'vikings',5,3
);

-- vk_g5b3_05 — Religion and social order
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad var forholdet mellem norrøn religion og vikinge-samfundet?","options":["Guderne legitimerede social orden — Odin for adel, Thor for bønder — og religion var vævet ind i handel, krig og årstider","Religion var privat og adskilt fra politik og erhverv","Vikingerne var i virkeligheden ateister — mytologien var kun underholdning","Religion eksisterede kun i poesi og kunst, ikke i dagliglivet"],"correct":"Guderne legitimerede social orden — Odin for adel, Thor for bønder — og religion var vævet ind i handel, krig og årstider","accepted_answers":["Guderne legitimerede social orden — Odin for adel, Thor for bønder — og religion var vævet ind i handel, krig og årstider"],"review_text":"Odin var gudernes og krigsaristokratiets gud. Thor var den frie bonders gud. Markeder åbnede med rituelle ofringer. Sæsoner fulgte gudernes fest-cyklus. Religion var ikke privat tro — det var samfundets lim."}'::jsonb,
  'mc','short','{"concepts":["norrøn religion","social orden","Odin","Thor","blót"],"misconception_type":"false_equivalence","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"vikings"}'::jsonb,
  'mc_single',3,'auto',true,'vikings',5,3
);

-- vk_g5b3_06 — Misconception: complexity
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er det mest præcise billede af vikinger som helhed?","options":["Komplekse mennesker der var handelsfolk, krigere, bønder og kulturformidlere — afhængig af kontekst","Altid krigeriske barbarer der kun plyndrede","Altid fredelige handelsfolk der aldrig brugte vold","Simple folk med simpelt liv og ingen ambitioner"],"correct":"Komplekse mennesker der var handelsfolk, krigere, bønder og kulturformidlere — afhængig af kontekst","accepted_answers":["Komplekse mennesker der var handelsfolk, krigere, bønder og kulturformidlere — afhængig af kontekst"],"review_text":"Vikinger var ikke ét ting. Den samme person der handlede i Konstantinopel var bonde om sommeren og måske plyndrende høvding om efteråret. Konteksten bestemte adfærden. Historie handler om kompleksitet, ikke enkle etiketter."}'::jsonb,
  'mc','short','{"concepts":["vikinge-kompleksitet","historisk forståelse","misconception-barbarer"],"misconception_type":"overgeneralization","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"challenge","domain":"vikings"}'::jsonb,
  'mc_single',3,'auto',true,'vikings',5,3
);

-- vk_g5b3_07 — Longship technology
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad viser langskibets design om vikingernes teknologiske niveau?","options":["At skibsbygning krævede metallurgi, avanceret træbehandling og generationers erfaring — det var ingeniørkunst","At skibene var tilfældige og byggedes hurtigt af ufaglærte","At vikingerne kopierede skibsdesignet direkte fra romerne","At teknologien var enkel og enhver bonde kunne bygge et langskib"],"correct":"At skibsbygning krævede metallurgi, avanceret træbehandling og generationers erfaring — det var ingeniørkunst","accepted_answers":["At skibsbygning krævede metallurgi, avanceret træbehandling og generationers erfaring — det var ingeniørkunst"],"review_text":"Et langskib var vikingetidens vartegn. Klinkebyggeri (overlappende planker) gav fleksibilitet. Fladt køl tillod grundt vand. Symmetrisk design betød skibet kunne sejles begge veje. Alt dette krævede metallurgi, præcis træbehandling og generationers viden."}'::jsonb,
  'mc','short','{"concepts":["langskib","skibsbygning","teknologi","misconception-primitive"],"misconception_type":"overgeneralization","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"vikings"}'::jsonb,
  'mc_single',3,'auto',true,'vikings',5,3
);

-- ─── GRADE 5 · BAND 4 (5 questions) ─────────────────────────────────────────

-- vk_g5b4_01 — Perspectives: terror vs. trade
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvordan oplevede befolkningerne i England og Frankrig vikingerne — og hvordan oplevede vikingerne sandsynligvis sig selv?","options":["Lokale oplevede terror og tab; vikingerne oplevede legitime ekspeditioner der gav rigdom og ære","Begge parter syntes det var en fair handel og ingen var sure","Vikingerne var skamfulde over deres handlinger og undskyldede sig","Lokale folk elskede vikingerne og handelede gerne med dem"],"correct":"Lokale oplevede terror og tab; vikingerne oplevede legitime ekspeditioner der gav rigdom og ære","accepted_answers":["Lokale oplevede terror og tab; vikingerne oplevede legitime ekspeditioner der gav rigdom og ære"],"review_text":"Historiens ofre og aktører oplever den samme hændelse radikalt forskelligt. En irsk munk oplever terrorisme. Vikingen oplever en vellykket forretningsrejse med ære og rigdom. Begge perspektiver er autentiske. Historikeren skal forstå begge."}'::jsonb,
  'mc','short','{"concepts":["perspektiv","raids","ofre","aktører","historisk forståelse"],"misconception_type":"causal_inversion","cognitive_skill":"evaluation","difficulty_type":"applied","insight_type":"perspective_shift","challenge_role":"deep_challenge","domain":"vikings"}'::jsonb,
  'mc_single',4,'auto',true,'vikings',5,4
);

-- vk_g5b4_02 — Slavery and civilization paradox
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad fortæller vikingernes slavesystem os om kategorien \"civiliseret\" kontra \"barbarisk\"?","options":["At folk med ting-demokrati, skaldekunst og avanceret handel simultaneously praktiserede slaveri — civiliseret og barbarisk er ikke rene kategorier","At vikinger var barbariske fordi de ejede slaver og dermed var anderledes end os","At slaveri beviser at vikinger aldrig var kulturelt avancerede","At vikingernes slaveri var anderledes og mere humant end andre former for slaveri"],"correct":"At folk med ting-demokrati, skaldekunst og avanceret handel simultaneously praktiserede slaveri — civiliseret og barbarisk er ikke rene kategorier","accepted_answers":["At folk med ting-demokrati, skaldekunst og avanceret handel simultaneously praktiserede slaveri — civiliseret og barbarisk er ikke rene kategorier"],"review_text":"Vikinger skabte demokratiske forsamlinger og rig poesi — og slaveriets handelsøkonomi. Dette paradoks er ikke unikt: Athen (demokratiets fødested) ejede slaver. USA (frihedens land) praktiserede slaveri i 200 år. Historien er sjældent enkel."}'::jsonb,
  'mc','short','{"concepts":["slaveri","civiliseret","barbarisk","historisk kompleksitet","paradoks"],"misconception_type":"false_equivalence","cognitive_skill":"evaluation","difficulty_type":"applied","insight_type":"perspective_shift","challenge_role":"deep_challenge","domain":"vikings"}'::jsonb,
  'mc_single',4,'auto',true,'vikings',5,4
);

-- vk_g5b4_03 — Valhalla and risk-taking
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad betød troen på Valhalla for vikingernes vilje til at tage farlige risici?","options":["Troen på heroisk efterliv reducerede frygten for døden og øgede villighed til farlige ekspeditioner — religion og handling var forbundet","Det betød ingenting — folk frygtede altid døden uanset religion","Det fik vikingerne til aktivt at søge en hurtig død","Religion og handling var fuldstændig adskilt i vikinge-samfundet"],"correct":"Troen på heroisk efterliv reducerede frygten for døden og øgede villighed til farlige ekspeditioner — religion og handling var forbundet","accepted_answers":["Troen på heroisk efterliv reducerede frygten for døden og øgede villighed til farlige ekspeditioner — religion og handling var forbundet"],"review_text":"Valhalla-troen var ikke bare mytologi — det var en funktionel ideologi. At tro på at tapperhed belønnes med evig fest reducerede rationelt frygten for en farlig ekspedition. Religiøse forestillinger påvirker adfærd. Historikere analyserer religion som en social kraft."}'::jsonb,
  'mc','short','{"concepts":["Valhalla","religion","adfærd","ideologi","risiko"],"misconception_type":"false_equivalence","cognitive_skill":"evaluation","difficulty_type":"applied","insight_type":"perspective_shift","challenge_role":"deep_challenge","domain":"vikings"}'::jsonb,
  'mc_single',4,'auto',true,'vikings',5,4
);

-- vk_g5b4_04 — Vinland: discovery without consequence
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er den historiske pointe ved at vikinger nåede Amerika 500 år før Columbus — men ikke koloniserede det?","options":["At opdagelse alene ikke skaber historisk forandring — det kræver kapacitet og vedvarende tilstedeværelse","At vikingerne ikke var dygtige navigatorer og kom derhen ved et uheld","At Columbus opdagede Amerika som den egentlige første — vikingerne var der ikke rigtigt","At Nordamerika var tomt og ubeboet da begge ankom"],"correct":"At opdagelse alene ikke skaber historisk forandring — det kræver kapacitet og vedvarende tilstedeværelse","accepted_answers":["At opdagelse alene ikke skaber historisk forandring — det kræver kapacitet og vedvarende tilstedeværelse"],"review_text":"Vikinger nåede Amerika — men det skabte ingen historisk forandring. Columbus'' rejse udløste 500 år med europæisk kolonisering. Hvad var forskellen? I 1492 var Europa klar: stærkere skibe, økonomi og motivation. I år 1000 var vikingerne for få og konflikterne for kostbare. Opdagelse er ikke det samme som historisk konsekvens."}'::jsonb,
  'mc','short','{"concepts":["Vinland","Columbus","opdagelse","historisk konsekvens","kontekst"],"misconception_type":"causal_inversion","cognitive_skill":"evaluation","difficulty_type":"applied","insight_type":"perspective_shift","challenge_role":"deep_challenge","domain":"vikings"}'::jsonb,
  'mc_single',4,'auto',true,'vikings',5,4
);

-- vk_g5b4_05 — Trade and state formation
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad fortæller vikinge-handelsbyer os om forholdet mellem handel og politisk centralisering?","options":["Handelsbyers rigdom finansierede hære og administration — og bidrog til at løse stammestater langsomt blev til kongedømmer","Handelsbyer og kongedømmer opstod uafhængigt af hinanden","Handel skabte kun kaos og forhindrede politisk organisation","Kongedømmer opstod altid inden handelsbyer — aldrig omvendt"],"correct":"Handelsbyers rigdom finansierede hære og administration — og bidrog til at løse stammestater langsomt blev til kongedømmer","accepted_answers":["Handelsbyers rigdom finansierede hære og administration — og bidrog til at løse stammestater langsomt blev til kongedømmer"],"review_text":"Der er en direkte forbindelse mellem handel, rigdom og politisk centralisering. Handelsbyerne skabte overskud der kunne finansiere hære. Kong Harald Blåtand brugte rigdommen til at samle Danmark. Vikingetidens slutning er netop denne transformation: løse stammesamfund der bliver kongedømmer."}'::jsonb,
  'mc','short','{"concepts":["handel","statsdannelse","kongedømme","politisk centralisering","Harald Blåtand"],"misconception_type":"causal_inversion","cognitive_skill":"evaluation","difficulty_type":"applied","insight_type":"perspective_shift","challenge_role":"deep_challenge","domain":"vikings"}'::jsonb,
  'mc_single',4,'auto',true,'vikings',5,4
);
