-- Section 71 — Grade 7 Content Expansion Sprint
-- Adds 30 new Grade 7 Democracy & Power questions (dp_041–dp_070)
-- Band distribution: Band 1 (7), Band 2 (10), Band 3 (8), Band 4 (5)
-- All questions: target_grade=7, domain=democracy_power, answer_format=mc, is_active=false
-- Grade 7 pool after this migration: 8 existing + 30 new = 38 questions

-- ─── BAND 1 — Factual / Recall / Reinforcement / Conceptual Bridge ───────────

-- dp_041
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad betyder det, at Danmark er et demokrati?","options":["At alle borgere har en stemme og kan påvirke, hvem der bestemmer","At den klogeste person i landet bestemmer","At alle altid er enige om, hvad der skal ske","At regeringen gør, hvad medierne siger"],"correct":"At alle borgere har en stemme og kan påvirke, hvem der bestemmer","review_text":"Demokrati betyder folkestyre. I et demokrati har alle borgere over 18 år ret til at stemme og dermed indflydelse på, hvem der styrer landet. Det er ikke de klogeste, de rigeste eller medierne der bestemmer — det er folket."}'::jsonb,
  'mc', 'short',
  '{"concepts":["demokrati","folkestyre","stemmerettighed"],"misconception_type":"surface_association","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 1
);

-- dp_042
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er Folketingets vigtigste opgave?","options":["At vedtage og ændre landets love","At vælge Danmarks bedste fodboldhold","At bestemme hvad der sker i andre lande","At kontrollere, hvad borgerne tænker"],"correct":"At vedtage og ændre landets love","review_text":"Folketinget er Danmarks parlament — den lovgivende magt. Dets vigtigste opgave er at vedtage, ændre og ophæve love. Regeringen foreslår ofte love, men det er Folketinget der beslutter. Uden Folketing intet demokrati."}'::jsonb,
  'mc', 'short',
  '{"concepts":["Folketing","lovgivende magt","parlamentarisme"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 1
);

-- dp_043
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvornår må man stemme til Folketingsvalget?","options":["Fra 18 år som dansk statsborger","Fra 15 år, hvis man er med i et parti","Fra 21 år med gyldigt pas","Alle der bor i Danmark i over 1 år"],"correct":"Fra 18 år som dansk statsborger","review_text":"I Danmark har man stemmeret til Folketing svalget fra det år man fylder 18, og man skal være dansk statsborger. Bopæl i Danmark er ikke nok alene. Aldersgrænsen sikrer, at man er myndig og har ansvar for sine valg."}'::jsonb,
  'mc', 'short',
  '{"concepts":["stemmeret","statsborgerskab","Folketing svalg"],"misconception_type":"overgeneralization","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 1
);

-- dp_044
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad gør en lov anderledes fra en personlig mening?","options":["En lov vedtages af Folketing et og gælder alle — en personlig mening gælder kun den der har den","En lov er altid korrekt — en personlig mening kan være forkert","En lov ændres aldrig — en personlig mening kan skifte","Loven bestemmes af eksperter — meningen af normale borgere"],"correct":"En lov vedtages af Folketing et og gælder alle — en personlig mening gælder kun den der har den","review_text":"En lov er et bindende beslutning vedtaget af Folketing et — den gælder alle og kan håndhæves. En personlig mening er en privat holdning uden bindende kraft. Forskellen handler om myndighed og rækkevidde — ikke om rigtigt og forkert."}'::jsonb,
  'mc', 'short',
  '{"concepts":["lov","mening","Folketing","myndighed"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 1
);

-- dp_045
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvem bestemmer, hvem der bliver statsminister i Danmark?","options":["Den der kan samle et flertal i Folketing et","Dronningen vælger frit den hun stoler mest på","Den politiker der fik flest personlige stemmer","Medierne og befolkningsundersøgelserne"],"correct":"Den der kan samle et flertal i Folketing et","review_text":"Statsministeren er ikke nødvendigvis den der fik flest stemmer — det er den der kan danne en regering med flertal i Folketing et. Dronningen udpeger formelt statsministeren, men det er i praksis bestemt af Folketing ets mandatfordeling."}'::jsonb,
  'mc', 'short',
  '{"concepts":["statsminister","flertal","parlamentarisme","regeringsdannelse"],"misconception_type":"surface_association","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 1
);

-- dp_046
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er en rettighed?","options":["Noget man har krav på i kraft af at være person — uanset hvad man har gjort","En belønning man optjener ved god opførsel","Noget der gives af staten og kan fjernes igen","En fordel man køber sig til med penge"],"correct":"Noget man har krav på i kraft af at være person — uanset hvad man har gjort","review_text":"En rettighed er noget du har krav på i kraft af at være et menneske — det er ikke en belønning. Grundlæggende rettigheder som ytringsfrihed og ligebehandling gælder alle, selv dem der har gjort noget forkert. Det er ideen bag menneskerettigheder."}'::jsonb,
  'mc', 'short',
  '{"concepts":["rettigheder","menneskerettigheder","universalitet"],"misconception_type":"false_equivalence","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 1
);

-- dp_047
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er Grundloven?","options":["Danmarks vigtigste lov der sætter rammerne for statens opbygning og borgernes grundlæggende rettigheder","En gammel lov der ikke gælder mere","En aftale mellem Danmark og EU om fælles regler","Folketing ets mødeplan for hele året"],"correct":"Danmarks vigtigste lov der sætter rammerne for statens opbygning og borgernes grundlæggende rettigheder","review_text":"Grundloven fra 1849 er Danmarks højeste lov. Den beskriver, hvordan staten er opbygget — med Folketing, regering og domstole — og den garanterer borgernes grundlæggende rettigheder. Ingen anden lov må bryde Grundloven."}'::jsonb,
  'mc', 'short',
  '{"concepts":["Grundloven","forfatning","rettigheder","statens opbygning"],"misconception_type":"surface_association","cognitive_skill":"recall","difficulty_type":"factual","insight_type":"conceptual_bridge","challenge_role":"reinforcement","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 1
);

-- ─── BAND 2 — Conceptual / Comprehension / Reinforcement / Reframing ─────────

-- dp_048
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvorfor er regelmæssige valg vigtigt for demokratiet?","options":["For at befolkningen regelmæssigt kan skifte ud eller beholde dem der bestemmer","For at politikerne kan vise deres popularitet","For at medierne har noget spændende at skrive om","Fordi EU kræver det af alle medlemslande"],"correct":"For at befolkningen regelmæssigt kan skifte ud eller beholde dem der bestemmer","review_text":"Valg er demokratiets kontrolmekanisme. Hvis en leder ved, at han kan stemmes ud om fire år, har han grund til at lytte til borgerne. Uden regelmæssige valg kan magthavere ignorere befolkningens ønsker uden konsekvens."}'::jsonb,
  'mc', 'short',
  '{"concepts":["valg","ansvarlighed","demokratisk kontrol"],"misconception_type":"surface_association","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 2
);

-- dp_049
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvorfor tæller en lærers stemme det samme som en direktørs ved valget?","options":["Fordi alle borgere er formelt lige — uanset job, penge eller uddannelse","Fordi direktøren allerede har mere indflydelse på andre måder","Fordi Folketing et besluttede at udligne uligheden ved valg","Fordi stemmer tælles anonymt og ingen ved hvem der stemmer hvad"],"correct":"Fordi alle borgere er formelt lige — uanset job, penge eller uddannelse","review_text":"Én person, én stemme er demokratiets ligehedsprincip. Formelt er alle stemmer lige — uanset social status, rigdom eller uddannelse. Det betyder ikke at alle har samme reelle indflydelse, men ved stemmeboksen er alle lige."}'::jsonb,
  'mc', 'short',
  '{"concepts":["formel lighed","én stemme","demokratisk princip"],"misconception_type":"false_equivalence","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 2
);

-- dp_050
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvorfor er der politiske partier — hvad gør de for demokratiet?","options":["De samler borgere med fælles syn og giver vælgerne overskuelige valg","De bestemmer lovene i stedet for Folketing et","De sikrer at den rigeste kandidat vinder valget","De forhindrer uenighed og skaber enighed i Folketing et"],"correct":"De samler borgere med fælles syn og giver vælgerne overskuelige valg","review_text":"Partier organiserer politisk mangfoldighed. Uden partier skulle vælgerne forholde sig til hundredvis af individuelle kandidater. Partier samler holdninger i overskuelige blokke — og giver vælgerne et reelt valg."}'::jsonb,
  'mc', 'short',
  '{"concepts":["politiske partier","vælgere","politisk organisering"],"misconception_type":"surface_association","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 2
);

-- dp_051
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er ytringsfrihed — har den grænser?","options":["Retten til at udtrykke holdninger og meninger — med grænser som direkte trusler og falske anklager","Retten til at sige præcis hvad man vil — uden nogen grænser overhovedet","Kun retten til at kritisere politikere — ikke private personer","Retten til at ytre sig, men kun hvis man er enig med flertallet"],"correct":"Retten til at udtrykke holdninger og meninger — med grænser som direkte trusler og falske anklager","review_text":"Ytringsfrihed er en grundlæggende demokratisk rettighed — men den er ikke ubegrænset. Direkte trusler, bagvaskelse og opfordring til vold er eksempler på ytringer der ikke er beskyttet. Grænsen handler om, hvornår ytringen konkret skader andre."}'::jsonb,
  'mc', 'short',
  '{"concepts":["ytringsfrihed","grænser","rettigheder","ansvar"],"misconception_type":"overgeneralization","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 2
);

-- dp_052
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er forskellen på kommunen og staten i Danmark?","options":["Kommunen styrer lokale opgaver som skoler og ældrepleje — staten styrer nationale anliggender som forsvar og udenrigspolitik","Staten er større end kommunen og bestemmer derfor mere","Kommunen styres af borgerne direkte — staten styres af politikere","Staten bestemmer hvad kommunerne må gøre — kommunerne har ingen selvstændig magt"],"correct":"Kommunen styrer lokale opgaver som skoler og ældrepleje — staten styrer nationale anliggender som forsvar og udenrigspolitik","review_text":"Danmark har et decentraliseret styre. Kommunerne tager sig af nære opgaver — daginstitutioner, folkeskoler, ældrepleje — mens staten (Folketing et og regeringen) tager sig af forsvar, udenrigspolitik, lovgivning og store velfærdsydelser."}'::jsonb,
  'mc', 'short',
  '{"concepts":["kommune","stat","decentralisering","opgavefordeling"],"misconception_type":"scope_confusion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 2
);

-- dp_053
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er formålet med at betale skat?","options":["At betale for fælles goder som hospitaler, uddannelse og veje","At give staten mulighed for at kontrollere borgerne","At straffe dem der tjener mere end gennemsnittet","At finansiere politikernes løn og privilegier"],"correct":"At betale for fælles goder som hospitaler, uddannelse og veje","review_text":"Skat er det centrale finansieringssystem for velfærdsstaten. Når vi betaler skat, betaler vi kollektivt for ydelser som ingen enkelt borger kan finansiere alene — gratis skoler, hospitaler, infrastruktur og sociale sikkerhedsnet."}'::jsonb,
  'mc', 'short',
  '{"concepts":["skat","velfærdsstat","kollektive goder","finansiering"],"misconception_type":"false_equivalence","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 2
);

-- dp_054
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er forskellen på en regel i skolen og en national lov?","options":["Love vedtages af Folketing et og gælder alle i landet — skoleregler gælder kun på skolen","Begge gælder alle i Danmark — skolen er bare et eksempel","En lov er strengere — skoleregler har ingen konsekvenser","Der er ingen forskel, regler er regler"],"correct":"Love vedtages af Folketing et og gælder alle i landet — skoleregler gælder kun på skolen","review_text":"Regler kan have meget forskellig rækkevidde. En skoleregel gælder kun inden for skolen og sættes af skolens ledelse. En national lov gælder for alle i hele landet og vedtages af Folketing et — og kan håndhæves med retlige konsekvenser."}'::jsonb,
  'mc', 'short',
  '{"concepts":["lov","regler","rækkevidde","Folketing"],"misconception_type":"scope_confusion","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 2
);

-- dp_055
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad adskiller en nyhedsartikel fra et opslag på sociale medier?","options":["Nyhedsartikler har redaktionel kontrol og kildecheck — sociale medier kræver det ikke","Nyhedsartikler er altid sande — sociale medier er altid falske","Sociale medier er hurtigere og derfor mere præcise","Der er ingen reel forskel — begge kan indeholde fejl"],"correct":"Nyhedsartikler har redaktionel kontrol og kildecheck — sociale medier kræver det ikke","review_text":"Journalistik er et fag med etiske regler: kildecheck, faktuel kontrol og redaktionel vurdering. Sociale medier kræver intet af dette. Det gør ikke alle nyhedsartikler sande eller alle sociale medieopslag falske — men ansvarsstrukturen er fundamentalt forskellig."}'::jsonb,
  'mc', 'short',
  '{"concepts":["journalistik","sociale medier","kildecheck","mediekritik"],"misconception_type":"false_equivalence","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 2
);

-- dp_056
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad vil det sige at høre »begge sider« i en politisk debat?","options":["At man lytter til de stærkeste argumenter for modstående synspunkter","At man siger sig enig med alle for at undgå konflikt","At man deler sin tid ligeligt med to politiske partier","At man ikke behøver tage stilling — fordi begge sider kan have ret"],"correct":"At man lytter til de stærkeste argumenter for modstående synspunkter","review_text":"At høre begge sider handler ikke om at finde en midterposition eller undgå konflikt. Det handler om at tage modstandernes bedste argumenter seriøst — og vurdere dem kritisk — inden man danner sin holdning. Det er fundamentalt for demokratisk meningsdannelse."}'::jsonb,
  'mc', 'short',
  '{"concepts":["politisk debat","argumentation","kritisk tænkning","meningsdannelse"],"misconception_type":"false_equivalence","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 2
);

-- dp_057
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er censur?","options":["Statens blokering eller fjernelse af information eller ytringer","Mediernes valg om ikke at bringe en bestemt historie","Borgernes aktive fravalg af at læse bestemte nyheder","En politikers afvisning af at kommentere en sag"],"correct":"Statens blokering eller fjernelse af information eller ytringer","review_text":"Censur er specifikt, når staten eller en myndighed blokerer, fjerner eller forbyder ytringer og information. Det er en anden kategori end mediernes redaktionelle valg eller borgernes personlige fravalg. Censur udgør en trussel mod ytringsfriheden."}'::jsonb,
  'mc', 'short',
  '{"concepts":["censur","ytringsfrihed","stat","myndighed"],"misconception_type":"surface_association","cognitive_skill":"comprehension","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"reinforcement","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 2
);

-- ─── BAND 3 — Conceptual / Analysis / Challenge / Reframing+Perspective ──────

-- dp_058
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvorfor er en fri presse vigtig for demokratiet?","options":["Fordi pressen kan afsløre, hvad politikere og myndigheder gør — og holde dem ansvarlige","Fordi folk har ret til underholdning og nyheder","Fordi pressen sikrer, at regeringen får gode råd","Fordi pressen forhindrer borgerne i at sprede falske nyheder"],"correct":"Fordi pressen kan afsløre, hvad politikere og myndigheder gør — og holde dem ansvarlige","review_text":"En fri presse er demokratiets »vagthund«. Den overvåger magthaverne og offentliggør oplysninger, som borgerne har brug for for at tage stilling. Uden uafhængig presse kan magthavere agere i det skjulte — og demokratiets kontrol svækkes fundamentalt."}'::jsonb,
  'mc', 'short',
  '{"concepts":["pressefrihed","vagthundfunktion","demokratisk kontrol","accountability"],"misconception_type":"surface_association","cognitive_skill":"analysis","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"challenge","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 3
);

-- dp_059
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvorfor er politisk uenighed normalt i et demokrati — ikke et problem?","options":["Det er normalt fordi mennesker har forskellige interesser og værdier der legitimt fører til uenighed","Fordi politikerne bevidst skaber uenighed for at beholde deres jobs","Fordi befolkningen ikke er veluddannet nok til at enes","Det er faktisk et problem — et godt demokrati kræver enighed"],"correct":"Det er normalt fordi mennesker har forskellige interesser og værdier der legitimt fører til uenighed","review_text":"Uenighed er demokratiets råstof — ikke en fejl. Mennesker har ægte, legitime forskelle i interesser og værdier. Demokratiet er det system, der håndterer denne uenighed fredeligt og struktureret. Et demokrati uden uenighed er ikke nødvendigvis stærkt — det kan blot betyde undertrykkelse."}'::jsonb,
  'mc', 'short',
  '{"concepts":["politisk uenighed","pluralisme","konflikt","demokratisk normalitet"],"misconception_type":"false_equivalence","cognitive_skill":"analysis","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"challenge","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 3
);

-- dp_060
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Kan man nyde demokratiets fordele uden selv at bidrage?","options":["Ja, men demokratiet svækkes på sigt hvis for mange tænker sådan","Nej — dem der ikke bidrager mister automatisk deres rettigheder","Ja fuldt ud — det er pointen med et velfærdssamfund","Nej — det er ulovligt at undlade at stemme i Danmark"],"correct":"Ja, men demokratiet svækkes på sigt hvis for mange tænker sådan","review_text":"Det er muligt at nyde demokratiets fordele — fri uddannelse, retssikkerhed, valgret — uden at bidrage aktivt. Men demokratiet bygger på borgernes deltagelse. Hvis for mange vælger den passive rolle, svækkes det politiske fundament, og magthaverne mister incitamenter til at lytte til borgerne."}'::jsonb,
  'mc', 'short',
  '{"concepts":["gratis-rider-problematik","demokratisk deltagelse","kollektiv handling","ansvarlighed"],"misconception_type":"scope_confusion","cognitive_skill":"analysis","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"challenge","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 3
);

-- dp_061
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er problemet med altid at gøre hvad flertallet vil?","options":["Flertallet kan stemme for at begrænse en minoritets grundlæggende rettigheder","Flertallet tager aldrig fejl — problemet er at minoriteterne bremser fremskridtet","Problemet er at flertallet skifter for ofte til at man kan følge det","Der er intet problem — demokrati er netop flertalsstyre"],"correct":"Flertallet kan stemme for at begrænse en minoritets grundlæggende rettigheder","review_text":"Rent flertalsstyre kaldes »majoritetsdiktatur«. Et demokrati beskytter ikke kun flertallet — det beskytter også mindretallenes grundlæggende rettigheder. Grundloven og menneskerettighederne sætter grænser for, hvad et flertal lovligt kan beslutte."}'::jsonb,
  'mc', 'short',
  '{"concepts":["flertalsstyre","minoritetsbeskyttelse","majoritetsdiktatur","rettigheder"],"misconception_type":"overgeneralization","cognitive_skill":"analysis","difficulty_type":"conceptual","insight_type":"perspective_shift","challenge_role":"challenge","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 3
);

-- dp_062
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad kan en 7. klasses elev konkret gøre for at påvirke politiske beslutninger?","options":["Deltage i skoleråd, skrive til politikere, engagere sig i organisationer eller møde op til borgermøder","Vente til man er 18 — ingen mulighed for påvirkning før stemmeret","Donere penge til det parti man synes bedst om","Kun følge med i nyhederne og danne sig en mening"],"correct":"Deltage i skoleråd, skrive til politikere, engagere sig i organisationer eller møde op til borgermøder","review_text":"Demokratisk deltagelse starter ikke ved 18. Unge kan deltage i elevråd og skoleråd, kontakte lokale politikere, melde sig ind i ungdomsorganisationer, deltage i demonstrationer eller borgermøder. Politikere lytter til organiserede stemmer — uanset alder."}'::jsonb,
  'mc', 'short',
  '{"concepts":["demokratisk deltagelse","unges indflydelse","politisk engagement","civilsamfund"],"misconception_type":"authority_bias","cognitive_skill":"analysis","difficulty_type":"conceptual","insight_type":"perspective_shift","challenge_role":"challenge","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 3
);

-- dp_063
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Kan en influencer på sociale medier have politisk magt?","options":["Ja — den der kan forme millioners opfattelse af politiske spørgsmål, har reel indflydelse","Nej — politisk magt kræver et politisk mandat","Kun hvis influenceren er officielt tilknyttet et parti","Nej — sociale medier har ingen reel politisk virkning"],"correct":"Ja — den der kan forme millioners opfattelse af politiske spørgsmål, har reel indflydelse","review_text":"Magt handler om evnen til at påvirke andres beslutninger og handlinger. Den der kan forme millioners politiske opfattelse, har reel politisk indflydelse — uanset om de har et formelt mandat. Det er kernen i debatten om sociale mediers demokratiske rolle."}'::jsonb,
  'mc', 'short',
  '{"concepts":["magt","influencer","sociale medier","politisk indflydelse"],"misconception_type":"surface_association","cognitive_skill":"analysis","difficulty_type":"conceptual","insight_type":"perspective_shift","challenge_role":"challenge","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 3
);

-- dp_064
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad sker der med demokratiet, hvis mange holder op med at stole på det?","options":["Demokratiet svækkes: institutionerne fungerer teknisk, men folk accepterer ikke beslutninger som legitime","Ingenting — demokratiet er baseret på love der gælder uanset folk tror på det","Systemet bryder automatisk sammen og erstattes af noget bedre","Folk vil begynde at stemme mere aktivt for at forbedre systemet"],"correct":"Demokratiet svækkes: institutionerne fungerer teknisk, men folk accepterer ikke beslutninger som legitime","review_text":"Demokrati kræver legitimitet — befolkningens tro på, at systemet er retfærdigt og værd at bakke op. Uden legitimitet kan institutionerne stadig eksistere på papiret, men folk ignorerer, omgår eller aktivt modvirker dem. Det er et tidligt tegn på demokratisk erosion."}'::jsonb,
  'mc', 'short',
  '{"concepts":["legitimitet","tillid","demokratisk erosion","institutioner"],"misconception_type":"scope_confusion","cognitive_skill":"analysis","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"challenge","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 3
);

-- dp_065
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Hvad er en ret — og hvad er en pligt — i et demokrati?","options":["En rettighed er noget du kræver for dig selv — en pligt er noget du skylder samfundet","En rettighed er gratis — en pligt koster penge","En rettighed gives af staten — en pligt er selvvalgt","Der er ingen forskel — i et demokrati er alt frivilligt"],"correct":"En rettighed er noget du kræver for dig selv — en pligt er noget du skylder samfundet","review_text":"Demokratiet balancerer rettigheder og pligter. Din ytringsfrihed er en rettighed — noget du kan hævde over for staten. Din pligt til at betale skat eller møde op som vidne i retten er noget samfundet kræver af dig. Begge er nødvendige for et fungerende demokrati."}'::jsonb,
  'mc', 'short',
  '{"concepts":["rettigheder","pligter","demokratisk kontrakt","borger"],"misconception_type":"false_equivalence","cognitive_skill":"analysis","difficulty_type":"conceptual","insight_type":"reframing","challenge_role":"challenge","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 3
);

-- ─── BAND 4 — Analytical / Evaluation / Deep Challenge / Perspective Shift ───

-- dp_066
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Kan et demokrati vedtage en lov der er uretfærdig — og stadig kalde sig et demokrati?","options":["Ja — demokrati garanterer en fair PROCES, ikke at resultatet altid er rigtigt","Nej — en uretfærdig lov er per definition udemokratisk","Nej — domstolene ville automatisk stoppe en uretfærdig lov","Ja, men kun hvis loven vedtages med 2/3 flertal i Folketing et"],"correct":"Ja — demokrati garanterer en fair PROCES, ikke at resultatet altid er rigtigt","review_text":"Demokrati handler om procedurer: fri debat, valg, flertalsbeslutning, rettigheder. Men en demokratisk besluttet lov kan sagtens være uretfærdig. Det er netop derfor demokratiet suppleres med menneskerettigheder og domstole — som yderligere kontroller udover selve den demokratiske proces."}'::jsonb,
  'mc', 'short',
  '{"concepts":["demokratisk procedure","retfærdighed","flertalsstyre","kontroller"],"misconception_type":"overgeneralization","cognitive_skill":"evaluation","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"deep_challenge","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 4
);

-- dp_067
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Er det et problem, hvis mange unge stemmer præcis som deres yndlingsinfluencer anbefaler?","options":["Ja — demokratiet forudsætter at vælgere danner egne holdninger, ikke blot kopierer andres","Nej — at følge folk man stoler på er en rationel strategi","Nej — politikere forsøger jo selv at overtale vælgerne, det er det samme","Ja, men kun hvis influenceren er betalt for anbefalingen"],"correct":"Ja — demokratiet forudsætter at vælgere danner egne holdninger, ikke blot kopierer andres","review_text":"Demokratiet forudsætter informerede borgere der tager selvstændigt stilling. Politisk overtalelse (fra medier, debatter, partier) er en del af systemet. Men at kopiere en andens stemme uden refleksion underminerer ideen om informeret samtykke — og gør én sårbar over for manipulation."}'::jsonb,
  'mc', 'short',
  '{"concepts":["influencer","politisk autonomi","meningsdannelse","demokratisk deltagelse"],"misconception_type":"causal_inversion","cognitive_skill":"evaluation","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"deep_challenge","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 4
);

-- dp_068
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Kan for meget frihed faktisk skade et demokrati?","options":["Ja — ubegrænset ytringsfrihed kan bruges til systematisk at sprede løgne der underminerer folks tillid til demokratiet","Nej — mere frihed er altid bedre for et demokrati","Ja, men kun hvis friheden fører til kriminalitet","Nej — begrænsning af friheden er altid værre end konsekvenserne"],"correct":"Ja — ubegrænset ytringsfrihed kan bruges til systematisk at sprede løgne der underminerer folks tillid til demokratiet","review_text":"Friheder kan i yderpunkter modvirke det de er sat i verden for at beskytte. Ubegrænset ytringsfrihed kan give organiserede aktører mulighed for at sprede systematisk desinformation på en skala, der underminerer borgernes fælles virkelighedsopfattelse — og dermed selve grundlaget for demokratisk debat."}'::jsonb,
  'mc', 'short',
  '{"concepts":["ytringsfrihed","desinformation","demokratisk paradoks","frihed"],"misconception_type":"false_equivalence","cognitive_skill":"evaluation","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"deep_challenge","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 4
);

-- dp_069
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Mange vælger ikke at stemme. Hvad er den egentlige forklaring?","options":["Folk oplever ikke at have reel indflydelse — systemet reagerer ikke på dem","Folk er for dovne og uansvarlige til at stemme","Stemmestederne er for svære at komme til","Folk er tilfredse med de nuværende politikere og ser ingen grund til at ændre noget"],"correct":"Folk oplever ikke at have reel indflydelse — systemet reagerer ikke på dem","review_text":"Forskning viser at lav valgdeltagelse sjældent skyldes dovenskab. Det hænger typisk sammen med oplevelsen af politisk afmagt — at systemet ikke lytter til folk som en selv. Det er et demokratisk signal, ikke en individuel fejl, og kræver at man spørger: hvem ekskluderer systemet?"}'::jsonb,
  'mc', 'short',
  '{"concepts":["valgdeltagelse","politisk afmagt","eksklusion","demokratisk legitimitet"],"misconception_type":"authority_bias","cognitive_skill":"evaluation","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"deep_challenge","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 4
);

-- dp_070
INSERT INTO public.questions (content, answer_format, answer_type, metadata, type, difficulty, question_type, is_active, learning_objective, target_grade, difficulty_band) VALUES (
  '{"question":"Kan et demokrati overleve, selvom mange borgere er passive?","options":["Ja, midlertidigt — men over tid svækkes institutionerne når borgerne holder op med at bakke op om dem","Ja fuldt ud — institutionerne er selvbærende uanset borgernes engagement","Nej — demokratiet ophører øjeblikkeligt når under halvdelen stemmer","Ja — passivitet er i sig selv en politisk holdning der ikke skader demokratiet"],"correct":"Ja, midlertidigt — men over tid svækkes institutionerne når borgerne holder op med at bakke op om dem","review_text":"Demokratiske institutioner kan fungere teknisk i lang tid uden aktiv borgerstøtte. Men de henter deres autoritet fra borgernes opbakning. Gradvis passivitet svækker legitimiteten, åbner for populistisk kapring og reducerer systemets evne til at modstå pres. Demokrati er ikke en maskine — det er en praksis."}'::jsonb,
  'mc', 'short',
  '{"concepts":["demokratisk modstandsdygtighed","borgerskab","passivitet","legitimitet"],"misconception_type":"scope_confusion","cognitive_skill":"evaluation","difficulty_type":"analytical","insight_type":"perspective_shift","challenge_role":"deep_challenge","domain":"democracy_power"}'::jsonb,
  'mc_single', 1, 'auto', false, 'democracy_power', 7, 4
);
