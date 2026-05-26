-- Section 50 — Live Curriculum Deployment & Learning Object Operationalization
-- Democracy & Power domain: dp_001–dp_040 (40 learning objects)
-- Rollback: DELETE FROM public.questions WHERE metadata->>'domain' = 'democracy_power';

-- dp_001
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvad er den vigtigste forskel på en demokratisk leder og en autonom leder?","options":["En demokratisk leder vælges — en autokrat udnævnes","En demokratisk leder kan afsættes af dem de leder — en autokrat kan ikke","En demokratisk leder regerer med flertallets støtte","En demokratisk leder har færre beføjelser"],"correct":"En demokratisk leder kan afsættes af dem de leder — en autokrat kan ikke","review_text":"Valg skaber ikke demokrati — ansvarlighed gør. En leder kan blive valgt, holde fair valg én gang, og derefter afmontere mekanismerne der ville fjerne dem. Det der adskiller demokrati er ikke processen til at komme til magten, men muligheden for at blive afsat. Spørg altid: \"Hvem holder dette leder ansvarlig — og hvordan?\""}$$::jsonb,
  'mc', 'short',
  $${"concepts":["political_legitimacy","accountability","representation"],"misconception_type":"surface_association","cognitive_skill":"analysis","difficulty_type":"conceptual","insight_type":"conceptual_bridge","challenge_role":"challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_002
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvorfor kan et demokrati lovligt gennemføre uretfærdige love?","options":["Fordi demokratier ikke har nogen højere autoritet end parlamentet","Fordi flertallet kan stemme for love der skader mindretal","Fordi demokratier prioriterer stabilitet over retfærdighed","Fordi demokratiske love afspejler den almene vilje"],"correct":"Fordi flertallet kan stemme for love der skader mindretal","review_text":"Demokrati løser et magtproblem — hvem bestemmer? — men ikke et retfærdighedsproblem — er det rigtigt? Et flertal på 51% kan stemme for love der skader de resterende 49%. Derfor tilføjer de fleste demokratier yderligere beskyttelse: forfatningsgaranterede rettigheder, uafhængige domstole, minoritetsrettigheder. Demokrati er nødvendigt men ikke tilstrækkeligt for retfærdighed. Det er derfor borgerrettigheder kræver aktiv beskyttelse — ikke blot flertalsgodkendelse."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["minority_rights","political_legitimacy","checks_and_balances"],"misconception_type":"overgeneralization","cognitive_skill":"evaluation","difficulty_type":"analytical","insight_type":"conceptual_bridge","challenge_role":"deep_challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_003
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvad er forskellen på formel magt og reel magt i et demokrati?","options":["Formel magt er lovlig — reel magt er ulovlig","Formel magt er hvad institutioner officielt besidder — reel magt er hvem der faktisk former beslutninger","Formel magt tilhører politikere — reel magt tilhører vælgerne","De to er i et velfungerende demokrati identiske"],"correct":"Formel magt er hvad institutioner officielt besidder — reel magt er hvem der faktisk former beslutninger","review_text":"Et parlament kan have formel magt til at vedtage love — men lobbyister, medier og storkapital kan forme hvilke love der overhovedet foreslås. Et land kan have formel pressefrihed — men hvis alle medier ejes af én interessegruppe, former den interessen den reelle dagsorden. Demokrati kræver ikke blot formelle institutioner, men aktiv sikring af at formel magt ikke kapres af reel magt. Spørg altid: \"Hvem vinder — og hvem betaler?\""}$$::jsonb,
  'mc', 'short',
  $${"concepts":["power_distribution","accountability","representation"],"misconception_type":"false_equivalence","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_004
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvorfor er stemmedeltagelse et kollektivt anliggende snarere end et rent personligt valg?","options":["Fordi staten kan tvinge borgere til at stemme","Fordi lav deltagelse systematisk favoriserer bestemte grupper og forvrider det demokratiske resultat","Fordi det er en borgerlig pligt der er moralsk bindende","Fordi demokrati kræver enstemmighed for at være legitimt"],"correct":"Fordi lav deltagelse systematisk favoriserer bestemte grupper og forvrider det demokratiske resultat","review_text":"Når bestemte grupper ikke stemmer — typisk unge, lavindkomst, og marginaliserede — vinder de tilbageværende stemmer mere vægt. Politikere tilpasser sig herefter: de designerpolitik for dem der stemmer. Lavt valgdeltagelse er ikke neutral udeladelse — det er en systematisk fordrejning af hvem demokratiet tjener. Din stemme er ikke blot din; dens fravær omformer hvad alle andres stemmer betyder."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["collective_action","representation","political_legitimacy"],"misconception_type":"scope_confusion","cognitive_skill":"evaluation","difficulty_type":"conceptual","insight_type":"conceptual_bridge","challenge_role":"challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_005
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvad er det primære formål med magtadskillelse i et demokrati?","options":["At forhindre korruption","At sikre at ingen enkelt aktør kan udøve magt uhindret","At øge demokratisk effektivitet ved at specialisere funktioner","At repræsentere alle befolkningsgrupper i styret"],"correct":"At sikre at ingen enkelt aktør kan udøve magt uhindret","review_text":"Magtadskillelse er ikke designet til at gøre demokrati effektivt — det er designet til at gøre det sikkert. Trias politica (lovgivende, udøvende, dømmende) skaber friktion med vilje. Hvert organ kan bremse de andre. Denne friktion er ikke en fejl; den er en sikkerhedsventil mod den ene aktør der ellers gradvist kunne kapre alle tre funktioner. Læg mærke til: stærke demokratier er ofte langsomme demokratier. Det er ikke tilfældigt."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["separation_of_powers","checks_and_balances","accountability"],"misconception_type":"overgeneralization","cognitive_skill":"evaluation","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_006
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvorfor kan ytringsfrihed og beskyttelse mod hadefuld tale eksistere som samtidige rettigheder?","options":["Fordi ytringsfrihed aldrig var absolut — der har altid været grænser","Fordi hadefuld tale ikke er rigtig tale og derfor ikke er beskyttet","Fordi ytringsfrihed gælder individer, ikke grupper","Fordi demokratier vælger ytringsfrihed over beskyttelse"],"correct":"Fordi ytringsfrihed aldrig var absolut — der har altid været grænser","review_text":"Ytringsfrihed har aldrig betydet ret til at sige alt uden konsekvens. Det har altid indeholdt grænser: falsk vidnesbyrd, direkte trusler, paniksignal i en fyldt biograf. Spørgsmålet er ikke \"ytringsfrihed vs. censur\" — det er \"hvor trækkes grænsen og hvem bestemmer det?\" Forskellige demokratier trækker grænsen forskelligt. Det er en legitim politisk debat — ikke en absolutistisk fejl hos den ene side."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["civil_rights","checks_and_balances","political_legitimacy"],"misconception_type":"false_equivalence","cognitive_skill":"evaluation","difficulty_type":"analytical","insight_type":"conceptual_bridge","challenge_role":"deep_challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_007
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvad gør propaganda mest effektiv?","options":["At den er åbenlys løgn — folk kan bedre genkende den","At den indeholder tilstrækkeligt mange sande elementer til at føles troværdig","At den kun rammer ukritiske modtagere","At den skabes af staten og distribueres bredt"],"correct":"At den indeholder tilstrækkeligt mange sande elementer til at føles troværdig","review_text":"Effektiv propaganda er ikke løgn — det er sand information strategisk udvalgt og indrammet. En statistik kan være korrekt og stadig vildlede, hvis den præsenteres uden kontekst. Propagandister vælger sandheder der bekræfter en narrativ — og udelader sandheder der modsiger den. Det gør den svær at afvise: \"Men det er jo sandt!\" Kritisk tænkning handler ikke om at identificere løgne — det handler om at spørge: hvad udelades?"}$$::jsonb,
  'mc', 'short',
  $${"concepts":["propaganda","power_distribution","accountability"],"misconception_type":"causal_inversion","cognitive_skill":"analysis","difficulty_type":"conceptual","insight_type":"perspective_shift","challenge_role":"challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_008
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvorfor reproducerer revolutioner ofte de magtstrukturer de omvæltede?","options":["Fordi revolutionære leder er hyklere","Fordi magtstrukturerne der overtages former dem der overtager dem","Fordi idealer kompromitteres af praktiske nødvendigheder","Fordi befolkninger ønsker stabilitet frem for forandring"],"correct":"Fordi magtstrukturerne der overtages former dem der overtager dem","review_text":"En revolution erstatter personerne — men arver infrastrukturen: bureaukratiet, politiet, skatteapparatet, informationsnetværkerne. Disse strukturer har en indre logik der påvirker enhver der bruger dem. En revolutionær der skal administrere et imperium opdager hurtigt at imperiet ikke administreres på andre måder end dem der eksisterede. Strukturer former aktører mindst ligeså meget som aktører former strukturer. Det er grunden til at Frankrigs revolution producerede Napoleon og Ruslands producerede Stalin."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["power_distribution","political_legitimacy","accountability"],"misconception_type":"authority_bias","cognitive_skill":"synthesis","difficulty_type":"analytical","insight_type":"conceptual_bridge","challenge_role":"deep_challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_009
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvornår er civil ulydighed legitim i et demokrati?","options":["Aldrig — demokrati tilbyder legale kanaler til forandring","Når legale kanaler er udtømt og den lov der brydes er klart uretfærdig","Altid — en retfærdig sag legitimerer altid midlerne","Kun når flertallet støtter aktionen"],"correct":"Når legale kanaler er udtømt og den lov der brydes er klart uretfærdig","review_text":"Civil ulydighed er ikke anarchisme — det er en præcis historisk praksis med klare betingelser. King, Gandhi og Mandela satte dem: handlingen er offentlig og åben, loven der brydes er den uretfærdige lov, aktøren accepterer konsekvenserne, legale midler er forsøgt udtømt. Disse betingelser er ikke formalistiske; de er det der adskiller civil ulydighed fra vold og terrorisme. Demokratiet selv er bygget på en tidlig form for civil ulydighed mod britisk styre."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["civil_rights","political_legitimacy","minority_rights"],"misconception_type":"overgeneralization","cognitive_skill":"evaluation","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"deep_challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_010
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvad er det mest præcise mål for et demokratis styrke?","options":["Valgdeltagelsens størrelse","Graden hvortil institutionerne fungerer uafhængigt af dem der midlertidigt sidder ved magten","Antallet af politiske partier i parlamentet","Borgernes tilfredshed med den siddende regering"],"correct":"Graden hvortil institutionerne fungerer uafhængigt af dem der midlertidigt sidder ved magten","review_text":"Et demokratis sande styrke måles ikke i godt vejr — det måles i storm. Når en taber accepterer valgnederlaget. Når domstolene afsiger kendelser mod den siddende regering. Når pressen rapporterer frit om magthavernes fejl. Disse institutioner er stærke præcis fordi de fungerer uafhængigt af de mennesker der i øjeblikket bruger dem. Et demokrati der kun fungerer når de rigtige mennesker er ved magten — er ikke et demokrati."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["political_legitimacy","checks_and_balances","accountability"],"misconception_type":"scope_confusion","cognitive_skill":"evaluation","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"deep_challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_011
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvornår er domstolenes uafhængighed mest truet?","options":["Når befolkningen ikke respekterer domstolene","Når den udøvende magt kan bestemme hvem der sidder som dommere","Når domstolene afsiger upopulære kendelser","Når dommere forbliver ved magten i mange år"],"correct":"Når den udøvende magt kan bestemme hvem der sidder som dommere","review_text":"Lange dommerbeskikkelser er bevidste designvalg — jo længere en dommer sidder, jo mindre de behøver at bekymre sig om at efterkomme den aktuelle regerings ønsker. Truslen mod domstolenes uafhængighed er sjældent åbenlys. Den opstår, når den udøvende magt gradvist kontrollerer udnævnelsesprocessen: nye dommere der sympathiserer med regeringen, pensionering fremskyndet for kritiske dommere. Domstolene mister ikke uafhængighed dramatisk — de gør det stille, sag for sag."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["separation_of_powers","checks_and_balances","accountability"],"misconception_type":"causal_inversion","cognitive_skill":"analysis","difficulty_type":"conceptual","insight_type":"perspective_shift","challenge_role":"challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_012
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvad er den vigtigste svaghed ved repræsentativt demokrati?","options":["Vælgere har ikke nok viden til at træffe gode valg","Repræsentanter kan handle i egne interesser frem for vælgernes","Systemet er for langsomt til at håndtere moderne udfordringer","Flertalsbeslutninger afspejler ikke mindretallenes behov"],"correct":"Repræsentanter kan handle i egne interesser frem for vælgernes","review_text":"Repræsentativt demokrati hviler på en antagelse: at valgte repræsentanter handler på vegne af dem de repræsenterer. Men repræsentanter har egne karriereinteresser, partiloyaliteter og påvirkninger fra lobbyister. Principal-agent-problemet er ikke en fejl der kan rettes — det er en strukturel spænding der kræver løbende institutionel håndtering. Transparency, karantæneregler og pressefrihed er ikke dekorationer; de er de mekanismer der reducerer agenturproblemet."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["representation","accountability","power_distribution"],"misconception_type":"authority_bias","cognitive_skill":"evaluation","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_013
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvad er \"gratis-rider-problemet\" i demokratisk kontekst?","options":["At velhavende borgere ikke betaler tilstrækkelig skat","At en person kan nyde demokratiets fordele uden selv at bidrage til dets vedligeholdelse","At politikere modtager løn for arbejde vælgerne ikke godkender","At medier rapporterer gratis fra parlamentet"],"correct":"At en person kan nyde demokratiets fordele uden selv at bidrage til dets vedligeholdelse","review_text":"Demokrati er et kollektivt gode: det beskytter alle, uanset om de bidrager til det eller ej. En person kan aldrig stemme, aldrig engagere sig civilt, og stadig nyde pressefrihed, retssikkerhed og fredelige magtovergange. Problemet opstår i skala: hvis mange vælger gratis-rider-strategien, svækkes demokratiets institutioner gradvist. Civilsamfund, presse og valg er ikke selvvedligeholdende maskiner — de kræver aktiv deltagelse. Demokrati er et fællesejet hus der rådner, hvis ingen vedligeholder det."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["collective_action","political_legitimacy","accountability"],"misconception_type":"surface_association","cognitive_skill":"analysis","difficulty_type":"conceptual","insight_type":"conceptual_bridge","challenge_role":"challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_014
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvad adskiller journalistik fra propaganda?","options":["Journalistik er altid objektiv — propaganda er altid partisk","Journalistik søger at afsløre sandheden — propaganda søger at skabe en ønsket reaktion","Journalistik er statsfinansieret — propaganda er privat","Propaganda bruger følelser — journalistik bruger fakta"],"correct":"Journalistik søger at afsløre sandheden — propaganda søger at skabe en ønsket reaktion","review_text":"Grænsen er ikke indhold men formål og metode. Journalistik verificerer, korrigerer sig selv, og viser sit arbejde. Propaganda vælger hvad der tjener et forudbestemt narrativ — og udelader hvad der ikke gør. Begge bruger fakta. Begge kan ramme følelser. Spørgsmålet er: søger forfatteren at finde ud af hvad der er sandt — eller at overbevise om hvad de allerede har besluttet? I en medieverden hvor skellet er uklart er spørgsmålet \"hvad forsøger dette at gøre?\" vigtigere end \"er dette rigtigt?\""}$$::jsonb,
  'mc', 'short',
  $${"concepts":["propaganda","accountability","civil_rights"],"misconception_type":"false_equivalence","cognitive_skill":"analysis","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_015
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvad er oligarki — og kan det eksistere side om side med demokrati?","options":["Nej — oligarki og demokrati er gensidigt udelukkende styreformer","Ja — en lille gruppe kan have uforholdsmæssig reel magt selv i et formelt demokrati","Ja — men kun i korrupte demokratier, ikke i velfungerende","Oligarki refererer kun til styreformer uden valg"],"correct":"Ja — en lille gruppe kan have uforholdsmæssig reel magt selv i et formelt demokrati","review_text":"Oligarki er ikke en specifik styreform — det er en beskrivelse af hvem der reelt bestemmer. En lille velhavende elite kan finansiere valgkampagner, eje medier og lobbye effektivt, mens valgurnen formelt fungerer. Videnskabelige analyser af amerikanske politiske beslutninger viser at eliteinteresser statistisk forudsiger politiske resultater langt bedre end folkelig opinion. Demokrati og oligarki er et spektrum, ikke en binær. Spørgsmålet er ikke \"har vi et demokrati?\" men \"hvem har den reelle indflydelse — og hvorfra?\""}$$::jsonb,
  'mc', 'short',
  $${"concepts":["power_distribution","representation","accountability"],"misconception_type":"false_equivalence","cognitive_skill":"evaluation","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"deep_challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_016
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvad er den primære kilde til politisk legitimitet i et moderne demokrati?","options":["Tradition og historisk kontinuitet","Folkelig accept — at de regerede anerkender retten til at regere","Effektiv styring og gode resultater","Lovlig magtovertagelse via valg"],"correct":"Folkelig accept — at de regerede anerkender retten til at regere","review_text":"Max Weber identificerede tre typer legitimitet: tradition (kongen er kong fordi konger altid har regeret), karisma (lederen er leder fordi folk følger ham) og rationalitet-legalitet (lederen er leder fordi et system af regler udpegede ham). Moderne demokratier hviler på det tredje — men kun hvis borgerne faktisk accepterer reglerne som legitime. Det er grunden til at valgnederlæg der afvises truer demokratiet fundamentalt: de underminerer den folkelige accept der er systemets egentlige fundament."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["political_legitimacy","representation","accountability"],"misconception_type":"surface_association","cognitive_skill":"comprehension","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_017
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvad er det konkrete problem med at samle politi og anklagemyndighed under én minister?","options":["Det er ineffektivt med to separate institutioner","En minister kan bruge begge institutioner til at beskytte politiske allierede og forfølge modstandere","Politiet bør rapportere til parlamentet i stedet","Anklagemyndigheden bør kun rapportere til domstolene"],"correct":"En minister kan bruge begge institutioner til at beskytte politiske allierede og forfølge modstandere","review_text":"Magtadskillelse er ikke bureaukratisk formalisme — det er en konkret sikkerhedsventil. Når én minister kontrollerer hvem der efterforskes og hvem der retsforfølges, opstår en magtkoncentration der historisk er blevet brugt til politisk forfølgelse. Selv med den bedste hensigt skaber strukturen mulighed for misbrug. Demokratiets forsikringer mod korruption er ikke bygget på at stole på gode ledere — de er bygget på at sikre at dårlige ledere ikke kan misbruge systemet."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["separation_of_powers","checks_and_balances","accountability"],"misconception_type":"causal_inversion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_018
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvad gør parlamentarisk kontrol effektiv?","options":["At oppositionen er stor nok til at blokere lovgivning","At parlamentet har reel adgang til information og uafhængig kapacitet til at analysere den","At parlamentarikere er eksperter inden for de områder de kontrollerer","At der afholdes jævnlige valg"],"correct":"At parlamentet har reel adgang til information og uafhængig kapacitet til at analysere den","review_text":"Et parlament kan stille spørgsmål til statsministeren — men hvis svaret er \"det er klassificeret\" eller \"vores embedsmænd har analyseret det\" uden adgang til de faktiske analyser, er kontrollen symbolsk. Effektiv parlamentarisk kontrol kræver tre ting: reel adgang til information, uafhængig analysekapacitet (ikke bare regeringens egne embedsmænd), og tid til at forstå komplekse spørgsmål. Mangel på én af de tre gør kontrollen til teater."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["accountability","checks_and_balances","separation_of_powers"],"misconception_type":"scope_confusion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_019
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvad er forskellen på borgerrettigheder og menneskerettigheder?","options":["De er synonyme begreber — begge beskytter individers frihed","Menneskerettigheder gælder alle mennesker i kraft af at være mennesker — borgerrettigheder gives og håndhæves af specifikke stater over for deres borgere","Borgerrettigheder er lovfæstede — menneskerettigheder er blot moralske principper uden juridisk kraft","Menneskerettigheder gælder kun i krigssituationer — borgerrettigheder i fredstid"],"correct":"Menneskerettigheder gælder alle mennesker i kraft af at være mennesker — borgerrettigheder gives og håndhæves af specifikke stater over for deres borgere","review_text":"Skellet er ikke kun semantisk — det er et spørgsmål om hvem der garanterer dig hvad. Borgerrettigheder afhænger af din relation til en stat: de kan i princippet fratages ved at fratage statsborgerskab. Menneskerettigheder hviler på en anden antagelse: at visse rettigheder følger med menneskelig eksistens, ikke med pas. FN's erklæring af 1948 var et direkte svar på Holocaust — en anerkendelse af at statssuverænitet ikke kan beskytte rettighederne, fordi staten selv var bødlen. Det er grunden til at menneskerettigheder eksplicit er formuleret som noget der binder stater udefra."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["civil_rights","minority_rights","political_legitimacy"],"misconception_type":"false_equivalence","cognitive_skill":"comprehension","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_020
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvad er det konkrete problem med at lade markedet bestemme over kollektive goder som rent vand eller national forsvar?","options":["Markeder er ineffektive til at producere kollektive goder","Kollektive goder er for vigtige til at overlade til private interesser","Ingen kan ekskluderes fra at nyde dem og ingen kan tvinges til at betale — markedet mangler mekanismen til at finansiere dem","Private virksomheder vil altid underprise kollektive goder for at maksimere profit"],"correct":"Ingen kan ekskluderes fra at nyde dem og ingen kan tvinges til at betale — markedet mangler mekanismen til at finansiere dem","review_text":"Markedet finansierer goder ved at ekskludere dem der ikke betaler. Det fungerer for brød og software. Det fungerer ikke for ren luft, biodiversitet og national forsvar — fordi ingen kan ekskluderes fra at nyde dem, og én persons forbrug ikke reducerer en andens. Resultatet: alle ønsker godet, men ingen har individuelt incitament til at finansiere det. Markedet leverer for lidt, eller slet intet. Det er ikke markedets fejl — det er dets logik. Demokratisk kollektiv finansiering er ikke ideologisk modstand mod markedet. Det er løsningen på et præcist strukturelt problem markedet ikke kan løse alene."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["collective_action","power_distribution","political_legitimacy"],"misconception_type":"scope_confusion","cognitive_skill":"analysis","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_021
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvad er et ekkokammer — og hvad er den primære mekanisme der skaber det?","options":["En gruppe ligesindede der bevidst undgår at høre modargumenter","Et informationsmiljø der konstant bekræfter eksisterende overbevisninger — skabt primært af platformalgoritmer der optimerer engagement frem for indsigt","Et medie der kun formidler ét politisk synspunkt","En politisk kultur der ikke tolererer offentlig uenighed"],"correct":"Et informationsmiljø der konstant bekræfter eksisterende overbevisninger — skabt primært af platformalgoritmer der optimerer engagement frem for indsigt","review_text":"Ekkokamre opstår ikke primært fordi folk er ideologisk snæversynede — de opstår fordi platforme er designet til engagement, og bekræftelse genererer mere engagement end modsigelse. En bruger der klikker på ét politisk perspektiv ser gradvist mere af det — ikke som valg, men som algoritmisk konsekvens. Det farlige er ikke at ekkokamre gør folk mere ekstreme (evidensen er blandet). Det er at de gør det muligt at leve i en faktuel virkelighed der er strukturelt adskilt fra modpartens. Politisk dialog kræver delt faktuel bund. Ekkokamre eroderer den bund — stille, personaliseret, en feed ad gangen."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["propaganda","media_and_democracy","civil_society"],"misconception_type":"surface_association","cognitive_skill":"analysis","difficulty_type":"conceptual","insight_type":"perspective_shift","challenge_role":"reinforcement","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_022
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Kan en leder der kom til magten ulovligt alligevel regere legitimt?","options":["Nej — uden lovlig magtovertagelse er ethvert styre pr. definition illegitimt","Nej — demokratisk legitimitet kræver altid procedurelt korrekte valg","Ja — legitimitet er uafhængig af legalitet; en leder kan have reel folkelig accept uden at have fulgt juridiske procedurer","Ja — men kun midlertidigt, indtil et nyt lovligt valg kan afholdes"],"correct":"Ja — legitimitet er uafhængig af legalitet; en leder kan have reel folkelig accept uden at have fulgt juridiske procedurer","review_text":"Max Weber adskillede legalitet og legitimitet som begreber med god grund. Legitimitet er sociologisk: er de regerede faktisk villige til at acceptere autoritetens ret til at regere? Napoleon var i mange henseender illegitimt til magten — og regerede alligevel med massiv folkelig accept. Omvendt kan en leder vinde et lovligt valg og gradvist miste al legitimitet — som Mugabe i Zimbabwe, der i årtier vandt valg mens den reelle accept smuldrede. Legitimitetsbegrebet er analytisk vigtigt præcis fordi det adskiller den formelle procedure fra den sociale virkelighed. Begge tæller — men de er ikke det samme."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["political_legitimacy","representation","accountability"],"misconception_type":"causal_inversion","cognitive_skill":"evaluation","difficulty_type":"analytical","insight_type":"conceptual_bridge","challenge_role":"deep_challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_023
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvorfor kan direkte demokrati skalere dårligt til moderne nationalstater?","options":["Borgere mangler tilstrækkelig viden til at træffe informerede beslutninger om komplekse emner","Folk er for uenige til at nå konsensus i store grupper","Direkte demokrati kræver at alle borgere deltager aktivt i alle beslutninger — i komplekse stater er dette logistisk og kognitivt umuligt at opretholde","Direkte demokrati er sårbart over for flertalstyranni"],"correct":"Direkte demokrati kræver at alle borgere deltager aktivt i alle beslutninger — i komplekse stater er dette logistisk og kognitivt umuligt at opretholde","review_text":"Athen praktiserede direkte demokrati med måske 30.000–50.000 deltagelsesberettigede — og selv dér var det logistisk krævende. En moderne nation med 6 millioner borgere kan ikke afholde daglige folkeafstemninger om hvert lovforslag. Men problemet er ikke kun logistisk. Det er kognitivt: en enkelt lov kan indeholde hundredvis af tekniske, juridiske og sociale afvejninger. Borgere kan have stærke og legitime meninger om formål uden kapacitet til at evaluere implementeringsvalg. Det er ikke et argument mod folkelig deltagelse — det er argumentet for repræsentation som specialisering af én demokratisk funktion: beslutningstagning i kompleksitet."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["representation","collective_action","political_legitimacy"],"misconception_type":"overgeneralization","cognitive_skill":"evaluation","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_024
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvad er Tocquevilles \"flertallets tyranni\" — og er det primært et juridisk eller socialt fænomen?","options":["Primært juridisk — flertallet vedtager love der systematisk skader mindretal","Et historisk begreb om jakobinernes terrorstyre under Frankrigs Revolution","Et argument for at demokrati er en ringere styreform end aristokrati","Primært socialt — majoritetskulturens konformitetspres der kvæler afvigende meninger uden en enkelt lov"],"correct":"Primært socialt — majoritetskulturens konformitetspres der kvæler afvigende meninger uden en enkelt lov","review_text":"Tocqueville observerede i 1830'ernes USA at det mest effektive tyranni ikke behøver love. En majoritetskulturs sociale pres til at tænke, mene og opføre sig korrekt kan være mere effektivt end statens lov — fordi det ikke efterlader synlige mærker. Ingen piskede ikke-konformister. Men den sociale udelukkelse, forretningsboykot og kulturelle isolation var reelle konsekvenser. Tocqueville kaldte det \"tyranni over sindet.\" Er det stadig relevant? Sociale mediers mobkultur, cancel culture og platformkonformitetspres er 21. århundredes version af præcis det fænomen Tocqueville beskrev 190 år siden."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["minority_rights","civil_rights","political_legitimacy"],"misconception_type":"scope_confusion","cognitive_skill":"evaluation","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"deep_challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_025
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvornår er whistleblowing moralsk forpligtende — frem for blot moralsk tilladt?","options":["Altid — borgere har en demokratisk pligt til at afsløre magtmisbrug","Kun når man er legalt beskyttet imod konsekvenser","Whistleblowing er altid et personligt valg — ingen kan moralsk forpligtes til at sætte sig selv i fare","Når skaden er alvorlig og systematisk, alle interne kanaler er udtømt, og afsløringen er proportional med skaden"],"correct":"Når skaden er alvorlig og systematisk, alle interne kanaler er udtømt, og afsløringen er proportional med skaden","review_text":"Snowden, Ellsberg, Manning — whistleblowere opererer i en etisk gråzone der ikke kan reduceres til \"lyd et horn og vær en helt.\" Den moralske forpligtelse afhænger af tre faktorer: alvorlighed (er skaden reelt alvorlig, ikke blot pinlig for institutionen?), udtømning (er interne kanaler forsøgt eller umulige?), og proportionalitet (retter afsløringen sig mod skaden — ikke mod alt hvad institutionen gemmer?). Det moralsk overbevisende tilfælde for whistleblowing er ikke \"systemet er korrupt generelt.\" Det er: \"denne konkrete skade forvolder denne konkrete lide, og ingen andre stopper den.\" Generaliseret systemkritik er aktivisme. Det er noget andet."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["accountability","civil_rights","checks_and_balances"],"misconception_type":"authority_bias","cognitive_skill":"evaluation","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"deep_challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_026
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvad adskiller populisme fra legitim demokratisk protest?","options":["Populisme er ulovlig politisk mobilisering — demokratisk protest er lovlig","Populisme positionerer \"det ægte folk\" mod en korrupt \"elite\" som to homogene blokke — demokratisk protest udfordrer specifikke beslutninger inden for et delt system","Populisme har altid ekstremistiske politiske mål","Populisme er altid antidemokratisk"],"correct":"Populisme positionerer \"det ægte folk\" mod en korrupt \"elite\" som to homogene blokke — demokratisk protest udfordrer specifikke beslutninger inden for et delt system","review_text":"Populisme er ikke en politik — det er en narrativ struktur. Den opdeler samfundet i to rene og homogene grupper: \"det ægte folk\" og \"den korrupte elite.\" Problemet er homogeniteten. Demokratiet bygger på antagelsen om at \"folket\" er pluralt og har modstridende legitime interesser. Populisme kræver at \"folket\" er ét, med én vilje — og at enhver der er uenig enten er del af eliten eller forråder folket. Det gør kompromis til forræderi. Det gør opposition til fjendtlighed. Og det underminerer den institutionelle respekt som demokratiet kræver at alle parter — inkl. taberne — opretholder."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["populism","political_legitimacy","minority_rights"],"misconception_type":"false_equivalence","cognitive_skill":"analysis","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_027
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvad er det tidligste advarselstegn på at et demokrati er ved at erodere?","options":["Åbenlys valgsvindel ved et nationalt valg","Politisk vold og offentlige optøjer","En leder der vinder med meget stort flertal","Systematisk svækkelse af de institutioner der begrænser regeringens magt — domstole, presse og valgkommissioner"],"correct":"Systematisk svækkelse af de institutioner der begrænser regeringens magt — domstole, presse og valgkommissioner","review_text":"Demokratier bryder sjældent ned på én dag. De eroderer. Levitsky og Ziblatt (How Democracies Die) identificerede mønsteret: først undermineres normerne der beskytter institutionerne — respekt for domstolenes kendelser, accept af valgresultater, afhold fra at kalde oppositionen kriminelle. Dernæst svækkes de formelle institutioner: domstolsbesætning, valgkommissionssammensætning, presselovgivning. Først bagefter kommer det åbne autokrati. Kerneobservationen: erosionen sker inden for demokratiets egne regler. Den kommende autokrat vinder et lovligt valg — og bruger derefter den lovlige magt til at afmontere systemets begrænsninger."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["authoritarian_drift","checks_and_balances","democratic_resilience"],"misconception_type":"surface_association","cognitive_skill":"evaluation","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"deep_challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_028
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvornår udgør koncentration af medieejerskab en specifik demokratisk trussel?","options":["Altid — privat medieejerskab er strukturelt problematisk for demokratiet","Kun når alle medier ejes af staten","Når ejeren bruger medierne til at fremme egne politiske og forretningsmæssige interesser frem for at informere borgere","Kun i lande uden public service-medier som DR"],"correct":"Når ejeren bruger medierne til at fremme egne politiske og forretningsmæssige interesser frem for at informere borgere","review_text":"Mediefrihed er ikke kun frihed fra staten. Det er frihed til at rapportere — uanset ejerens interesser. En mediekoncern med seks aviser, tre tv-kanaler og ejendomsinvesteringer har strukturelle interesser i regulering af disse sektorer. Redaktioner censureres sjældent åbenlyst. De selvregulerer: journalister lærer hurtigt hvilke historier der aldrig bliver til forsider. Pluralisme i medieejerskab er ikke blot konkurrencepolitik — det er demokratisk infrastruktur. Et demokrati der kræver informerede borgere men ikke beskytter mediemangfoldighed, stoler på at private ejere generøst informerer mod egne interesser."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["media_and_democracy","accountability","power_distribution"],"misconception_type":"surface_association","cognitive_skill":"evaluation","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_029
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvad er den mest præcise måde sociale medier strukturelt svækker demokratisk deliberation?","options":["Sociale medier spreder misinformation der erstatter faktuel viden","Folk bruger for meget tid på underholdning og for lidt på politik","Sociale medier er for nemme at manipulere af udenlandske aktører","Platforme belønner emotionel og polariserende kommunikation frem for nuanceret argumentation, fordi det genererer mere engagement"],"correct":"Platforme belønner emotionel og polariserende kommunikation frem for nuanceret argumentation, fordi det genererer mere engagement","review_text":"Problemet med sociale medier og demokrati er ikke indholdet — det er arkitekturen. Platforme optimerer for engagement: det der genererer reaktioner er outrage, identitetsmarkering og bekræftelse. En præcis, nuanceret analyse genererer færre reaktioner end et skarpt partisanopslag. Platformen er teknisk neutral overfor indhold men strukturelt ikke-neutral overfor tone. Resultatet er ikke et informationsproblem men et deliberationsproblem: de institutionelle incitamenter diskriminerer systematisk mod den kommunikationsform demokrati kræver — langsom, nuanceret, faktabaseret, kompromisvillig."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["media_and_democracy","propaganda","collective_action"],"misconception_type":"causal_inversion","cognitive_skill":"analysis","difficulty_type":"analytical","insight_type":"conceptual_bridge","challenge_role":"challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_030
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvad er civilsamfundets vigtigste demokratiske funktion?","options":["At supplere statens velfærdsopgaver med frivillige tjenester","At mobilisere borgere til at stemme ved valg","At give borgere mulighed for at mødes og dyrke fælles interesser","At skabe institutioner og netværk der fungerer uafhængigt af staten og dermed modvirker magtkoncentration og bygger kollektiv handlekapacitet"],"correct":"At skabe institutioner og netværk der fungerer uafhængigt af staten og dermed modvirker magtkoncentration og bygger kollektiv handlekapacitet","review_text":"Tocqueville beundrede amerikanske foreninger mere end nogen anden demokratisk institution. Han så i dem det der reelt adskillede demokratiet fra blot at være en statsform: borgere der lærte at koordinere og handle kollektivt uden statens initiativ. Fagforeninger, borgergrupper, presseklubber, religiøse samfund — disse institutioner skaber kapacitet til kollektiv handling og udgør en strukturel modkraft mod statens ekspansion. Når de svækkes, svækkes demokratiets muskler. Det er ikke et sentimentalt argument — det er strukturelt: et folk der ikke kan organisere sig uafhængigt, kan ikke holde staten ansvarlig."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["civil_society","collective_action","democratic_resilience"],"misconception_type":"scope_confusion","cognitive_skill":"synthesis","difficulty_type":"conceptual","insight_type":"conceptual_bridge","challenge_role":"challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_031
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvad gør en forfatning til mere end et stykke papir?","options":["At den er tilstrækkeligt detaljeret til at dække alle juridiske situationer","At den er demokratisk vedtaget med kvalificeret flertal","At den er skrevet af folket direkte frem for af politikere","At centrale institutioner og aktører faktisk retter ind efter den — og at der er håndhævelsesmekanismer når de ikke gør det"],"correct":"At centrale institutioner og aktører faktisk retter ind efter den — og at der er håndhævelsesmekanismer når de ikke gør det","review_text":"Sovjetunionen havde en fremragende forfatning — på papiret. Den garanterede ytrings-, forsamlings- og religionsfrihed. Ingen efterlevede den. Nordkorea har en forfatning der beskytter \"personlig frihed og privatliv.\" Forfatningers kraft kommer ikke fra teksten — den kommer fra den politiske kultur og de institutionelle mekanismer der omgiver den. Domstole der tager teksten alvorligt. Politikere der accepterer dens begrænsninger som legitime selv når det er ubelejligt. En offentlighed der kender og kræver sine rettigheder. Teksten er rammesætningen. Kulturen er motoren."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["checks_and_balances","political_legitimacy","democratic_resilience"],"misconception_type":"false_equivalence","cognitive_skill":"evaluation","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_032
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvad er demokratiets dilemma med domstolsprøvelse af lovgivning?","options":["Domstolsprøvelse er udemokratisk fordi uvalgte dommere ophæver folkevalgtes beslutninger","Domstolsprøvelse er et neutralt juridisk redskab uden politisk dimension","Det er en mekanisme der beskytter demokratiets grundlæg ved at begrænse demokratiets flertal — dilemmaet er at uvalgte dommere dermed fastlægger demokratiets grænser","Domstolsprøvelse er kun nødvendig i lande med upålidelige parlamenter"],"correct":"Det er en mekanisme der beskytter demokratiets grundlæg ved at begrænse demokratiets flertal — dilemmaet er at uvalgte dommere dermed fastlægger demokratiets grænser","review_text":"Domstolsprøvelse er demokratiets selvmodsigelsesmekanisme: et instrument der beskytter demokratiets grundlag ved at begrænse demokratiets flertal. Majoriteten kan ikke stemme sig til at fratage mindretal grundlæggende rettigheder — og domstolene håndhæver grænsen. Men dilemmaet er ægte: hvem valgte disse dommere til at fastlægge demokratiets egne grænser? USA's højesteretsdommere sidder livslangt og former politisk virkelighed for generationer. Der er ingen perfekt løsning — kun erkendelsen at demokratiet kræver begrænsning af sit eget flertal for at beskytte de grundlæg demokratiet hviler på."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["checks_and_balances","separation_of_powers","minority_rights"],"misconception_type":"scope_confusion","cognitive_skill":"evaluation","difficulty_type":"analytical","insight_type":"conceptual_bridge","challenge_role":"deep_challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_033
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvornår er politiske partier afgørende for demokratiet — og hvornår truer de det?","options":["Partier er altid gavnlige fordi de organiserer politisk deltagelse i skala","Partier truer altid demokratiet fordi de skaber partisan loyalitet frem for saglig vurdering","Partier er afgørende når de aggregerer interesser og koordinerer — de truer demokratiet når de danner karteller der fastsætter regler der beskytte dem mod ny konkurrence","Partier er primært truende i flerpartisystemer der producerer politisk instabilitet"],"correct":"Partier er afgørende når de aggregerer interesser og koordinerer — de truer demokratiet når de danner karteller der fastsætter regler der beskytte dem mod ny konkurrence","review_text":"Et politisk parti er demokratiets koordineringsinstrument: det samler borgere med sammenfaldende interesser og muliggør politisk handling i skala. Uden partier er demokratisk koordination umulig. Men modne partisystemer kan degenerere til karteller: etablerede partier aftaler institutionelle regler der gør det svært for udfordrere at komme ind — valgbarhedstærskler, medieregler, offentlig partifinansiering der favoriserer eksisterende aktører. Ikke nødvendigvis korruption. Blot strukturel selvinteresse. Et sundt demokrati kræver partier — og mekanismer der holder dem konkurrenceudsatte."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["representation","power_distribution","accountability"],"misconception_type":"overgeneralization","cognitive_skill":"evaluation","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_034
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvad er den vigtige forskel på desinformation og misinformation?","options":["Desinformation er digital — misinformation er analog","Desinformation stammer fra udenlandske aktører — misinformation fra indenlandske","Misinformation er altid mildere end desinformation fordi den ikke er bevidst","Desinformation spredes med bevidst hensigt om at vildlede — misinformation spredes af fejlinformerede der tror de deler noget sandt"],"correct":"Desinformation spredes med bevidst hensigt om at vildlede — misinformation spredes af fejlinformerede der tror de deler noget sandt","review_text":"Skellet er ikke trivielt — det bestemmer respons-strategien. Desinformation kræver modstrategier rettet mod den bevidste afsender: platformansvar, eksponering af intentioner, modinformation. Misinformation kræver modstrategier rettet mod sprederen: bedre mediefærdigheder, korrektioner der ikke præsenteres som anklager. At kalde en fejlinformeret person en bevidst løgner skaber defensivt modstand og reducerer sandsynlighed for korrektion. Præcision i begreberne er ikke akademisk petitesse — det er forudsætning for effektiv reaktion. Forkert diagnose producerer forkert medicin."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["propaganda","media_and_democracy","accountability"],"misconception_type":"false_equivalence","cognitive_skill":"comprehension","difficulty_type":"factual","insight_type":"reframing","challenge_role":"reinforcement","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_035
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvad er den afgørende faktor for om et demokrati overlever en alvorlig krise?","options":["Styrken af landets militære institutioner og evne til at opretholde orden","Landets økonomiske velstand som buffer mod politisk radikalisering","Fraværet af udenlandsk indblanding i demokratiske processer","Borgeres og eliternes villighed til at respektere demokratiets procedurer selv når resultatet er ugunstigt for dem"],"correct":"Borgeres og eliternes villighed til at respektere demokratiets procedurer selv når resultatet er ugunstigt for dem","review_text":"Demokratier overlever ikke kriser fordi institutionerne er stærke nok til at modstå. Institutioner er stærke fordi nøgleaktørerne — partier, embedsmænd, militær, domstole — vælger at respektere dem selv under pres. Weimar-republikken kollapsede ikke fordi institutionerne teknisk fejlede. Det kollapsede fordi de aktører der stod for institutionerne valgte ikke at forsvare dem. Det afgørende er det Levitsky og Ziblatt kalder gensidig tolerance og institutionel selvkontrol: vilje til at acceptere modpartens legitime sejr og undlade at bruge alle tilladte midler til at ødelægge dem. Disse er ikke formelle regler. De er normer. Og normer er sårbare."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["democratic_resilience","political_legitimacy","checks_and_balances"],"misconception_type":"authority_bias","cognitive_skill":"synthesis","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"deep_challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_036
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvad er forskellen på at have formelt statsborgerskab og at være aktiv demokratisk deltager?","options":["Alle statsborgere er per definition demokratiske deltagere idet de alle er underlagt demokratiets regler","Aktiv demokratisk deltagelse kræver uddannelse og politisk viden","Aktiv demokratisk deltagelse er at stemme ved valg","Formel statsborger har juridisk status og rettigheder — aktiv demokratisk deltager bidrager til det civile og politiske liv der giver demokratiet substans"],"correct":"Formel statsborger har juridisk status og rettigheder — aktiv demokratisk deltager bidrager til det civile og politiske liv der giver demokratiet substans","review_text":"Man kan besidde et pas og aldrig bidrage til det demokrati passet tilhører. Formel statsborgerskab er en juridisk kategori — den giver rettigheder og pålægger visse pligter. Demokratisk deltagelse er en praksis: at informere sig, diskutere, organisere sig, holde magthavere ansvarlige. Et demokrati kan have 100% formelle statsborgere og nul aktiv demokratisk kapacitet, hvis ingen deltager. Omvendt kan et samfund med begrænset formel ret have stærk demokratisk kultur. Retten til at deltage og kapaciteten til at gøre det er to vidt forskellige ting — og begge kræver aktiv investering for at eksistere."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["collective_action","civil_society","representation"],"misconception_type":"false_equivalence","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_037
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Er lobbyisme nødvendigvis skadelig for demokratiet?","options":["Ja — lobbyisme giver organiserede interesser uforholdsmæssig indflydelse","Ja — kun vælgernes stemme bør forme politiske beslutninger","Nej — lobbyisme er blot erhvervslivets ytringsfrihed","Nej — lobbyisme er en form for politisk deltagelse der kan informere beslutningstagere, men asymmetrien kræver regulering og transparens"],"correct":"Nej — lobbyisme er en form for politisk deltagelse der kan informere beslutningstagere, men asymmetrien kræver regulering og transparens","review_text":"Lobbyisme er ikke ét fænomen. En patientforening der informerer parlamentarikere om konsekvenserne af et sundhedslovforslag er noget andet end en tobaksindustri der ansætter konsulenter til at forsinke videnskabeligt begrundet regulering. Begge er lobbyisme. Problemet er asymmetrien: velfinansierede interesser kan lobbye kontinuerligt og professionelt; diffuse offentlige interesser kan det ikke. Løsningen er regulering, gennemsigtighed og institutionel modvægt — ikke forbud. Et forbud mod lobbyisme ville flytte indflydelse til uofficielle kanaler. Det ville ikke eliminere den. Det ville blot gøre den usynlig."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["power_distribution","accountability","representation"],"misconception_type":"overgeneralization","cognitive_skill":"evaluation","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_038
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvad er det stærkeste strukturelle argument for tidsbegrænsning af politiske embeder?","options":["Det sikrer at nye og friske perspektiver kontinuerligt introduceres i politikken","Det er et udtryk for det demokratiske princip om at magt regelmæssigt bør cirkulere","Det forhindrer populære ledere i at akkumulere for stor folkelig støtte","Det reducerer de strukturelle incitamenter til at kapre institutioner ved at begrænse den periode hvori en leder kan drage fordel af dem"],"correct":"Det reducerer de strukturelle incitamenter til at kapre institutioner ved at begrænse den periode hvori en leder kan drage fordel af dem","review_text":"Tidsbegrænsning er ikke designet til at bringe variation — det er designet til at reducere institutionel kapring. En leder der ved de sidder i otte år og ikke kan sidde i tolv, har reducerede incitamenter til at cementere personlig magt permanent. En leder uden tidsbegrænsning har alle incitamenter til at investere i at kontrollere de institutioner der skulle kontrollere dem. Franklin D. Roosevelts fire præsidentvalg — dog under ekstraordinære omstændigheder — førte direkte til den 22. tillæg der begrænsede fremtidige præsidenter. Argumentet er ikke at magt korrumperer mennesker. Det er at magt skaber strukturelle incitamenter der korrumperer systemer."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["accountability","checks_and_balances","authoritarian_drift"],"misconception_type":"causal_inversion","cognitive_skill":"evaluation","difficulty_type":"analytical","insight_type":"reframing","challenge_role":"challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_039
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Hvad er den mest strukturelt præcise forklaring på udbredt politisk apati?","options":["Folk er for selvoptaget og materialistiske til at bry sig om fællesskabet","Uddannelsesniveauet er for lavt til at borgere kan engagere sig meningsfuldt","Sociale medier har erstattet politisk engagement med underholdning","Politiske systemer leverer ikke resultater der er meningsfulde i borgernes liv, eller borgere oplever ikke at have reelle valgmuligheder der afspejler deres præferencer"],"correct":"Politiske systemer leverer ikke resultater der er meningsfulde i borgernes liv, eller borgere oplever ikke at have reelle valgmuligheder der afspejler deres præferencer","review_text":"Apati er ikke personlighedstræk — det er rationelt respons på institutionelle vilkår. Når alle partier konvergerer til centrum, er marginaldifferencen lav. Når politiske processer er uigennemsigtige og ekspertdominerede, virker deltagelse meningsløs. Når sociale problemer er uløste trods årtiers opmærksomhed, er scepticisme rationel. Politisk apati er ikke demokratiets kerne-problem. Det er demokratiets symptom. At løse apati kræver at løse det den er et rationelt svar på: reelt valg, reelt responsivt styre, reelt meningsfulde konsekvenser af at deltage frem for at forblive passiv."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["collective_action","representation","political_legitimacy"],"misconception_type":"authority_bias","cognitive_skill":"evaluation","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);

-- dp_040
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective) VALUES (
  $${"question":"Kan internationale institutioner som EU underminere nationalt demokrati?","options":["Ja — internationale institutioner er pr. definition udemokratiske fordi de ikke er direkte folkevalgte","Nej — Danmark valgte selv at deltage og kan forlade EU","Nej — internationale institutioner beskytter demokratiet mod nationalstaternes excesses","Ja — men det afhænger af om beslutningerne er demokratisk forankret, transparente og underlagt reel politisk kontrol"],"correct":"Ja — men det afhænger af om beslutningerne er demokratisk forankret, transparente og underlagt reel politisk kontrol","review_text":"EU-regulering vedtages af institutioner der er demokratisk legitimerede men på anden vis end nationale parlamenter. Er dette demokratisk underminering? Det er et ægte spørgsmål. Argumentet for: borgere kan ikke stemme direkte om EU-lovgivning der regulerer store dele af hverdagslivet. Argumentet imod: Europaparlamentet er valgt direkte, nationale regeringer er repræsenteret i Rådet, og stater valgte frivilligt at overføre suverænitet. Det er ikke et spørgsmål med ét rigtigt svar — men det er et spørgsmål alle demokratier i et globalt integreret system skal stille sig løbende. Demokratisk kontrol skal følge magt — og magt bevæger sig opad."}$$::jsonb,
  'mc', 'short',
  $${"concepts":["representation","accountability","political_legitimacy"],"misconception_type":"overgeneralization","cognitive_skill":"evaluation","difficulty_type":"analytical","insight_type":"conceptual_bridge","challenge_role":"deep_challenge","domain":"democracy_power"}$$::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power'
);
