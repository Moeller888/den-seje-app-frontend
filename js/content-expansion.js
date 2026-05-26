/**
 * Section 48 — Gold-Standard Content Expansion Sprint: Democracy & Power Pack
 *
 * Completes dp_019–dp_025 and adds dp_026–dp_040.
 * Total domain: 40 fully authored gold-standard learning objects.
 *
 * Each object: strong conceptual target, named misconception, realistic
 * distractors, Level 3 review_text, adaptive challenge role.
 * No placeholders. Not one shallow recall question.
 */

// ─── CONCEPT MAP ──────────────────────────────────────────────────────────────

export const CONCEPT_MAP = Object.freeze({

  NODES: Object.freeze([
    'political_legitimacy',
    'separation_of_powers',
    'minority_rights',
    'collective_action',
    'representation',
    'checks_and_balances',
    'propaganda',
    'power_distribution',
    'civil_rights',
    'accountability',
    'populism',
    'authoritarian_drift',
    'media_and_democracy',
    'civil_society',
    'democratic_resilience',
  ]),

  EDGES: Object.freeze([
    { from: 'propaganda',           to: 'political_legitimacy',  relation: 'erodes' },
    { from: 'media_and_democracy',  to: 'accountability',        relation: 'enables or undermines' },
    { from: 'populism',             to: 'minority_rights',       relation: 'threatens' },
    { from: 'populism',             to: 'political_legitimacy',  relation: 'exploits' },
    { from: 'collective_action',    to: 'civil_society',         relation: 'requires' },
    { from: 'civil_society',        to: 'democratic_resilience', relation: 'builds' },
    { from: 'authoritarian_drift',  to: 'separation_of_powers',  relation: 'dismantles' },
    { from: 'authoritarian_drift',  to: 'checks_and_balances',   relation: 'circumvents' },
    { from: 'power_distribution',   to: 'representation',        relation: 'distorts' },
    { from: 'accountability',       to: 'political_legitimacy',  relation: 'sustains' },
    { from: 'checks_and_balances',  to: 'democratic_resilience', relation: 'anchor' },
    { from: 'minority_rights',      to: 'civil_rights',          relation: 'subset of' },
    { from: 'propaganda',           to: 'media_and_democracy',   relation: 'exploits' },
    { from: 'collective_action',    to: 'accountability',        relation: 'produces' },
  ]),

  SEQUENCING_PRINCIPLE: 'Questions should move along edges — each concept preparing the conceptual ground for the next. Never introduce a node without its neighbours being activated first.',

});

// ─── MISCONCEPTION FAMILIES ───────────────────────────────────────────────────

export const MISCONCEPTION_FAMILIES = Object.freeze({

  FAMILY_1: Object.freeze({
    name:        '"Democracy = majority rule"',
    core_error:  'Conflates the decision procedure (majority vote) with the system (democracy). Ignores minority protection, institutional constraints, and constitutional limits.',
    questions:   ['dp_002', 'dp_004', 'dp_024', 'dp_032'],
    antidote:    'Majority rule is the input mechanism. Democracy requires additional outputs: minority rights, rule of law, institutional accountability. The two are not synonymous.',
  }),

  FAMILY_2: Object.freeze({
    name:        '"Propaganda = lying"',
    core_error:  'Treats propaganda as factually false content. Misses that effective propaganda uses selective truths, framing, and emotional loading — often without a single false claim.',
    questions:   ['dp_007', 'dp_014', 'dp_021', 'dp_034'],
    antidote:    'Propaganda is characterised by intent and method, not factual accuracy. The question is: what is being omitted, and why?',
  }),

  FAMILY_3: Object.freeze({
    name:        '"Strong leaders create stable democracies"',
    core_error:  'Conflates short-term decisiveness with long-term institutional health. Historical pattern reversal: strong personal power tends to hollow out the institutions that stabilise democracy.',
    questions:   ['dp_001', 'dp_008', 'dp_027', 'dp_038'],
    antidote:    'Democratic stability comes from institutional strength, not personal strength. The two are often in tension — strong leaders have structural incentives to weaken constraints on themselves.',
  }),

  FAMILY_4: Object.freeze({
    name:        '"Institutions matter less than good intentions"',
    core_error:  'Relies on actor-level explanation (good/bad people) instead of structural explanation (good/bad incentive structures). Ignores that institutions shape behaviour regardless of intentions.',
    questions:   ['dp_005', 'dp_017', 'dp_031', 'dp_035'],
    antidote:    'Democratic design assumes that bad actors will exist. The question is: does the system survive them? Institutions that rely on good intentions are not robust institutions.',
  }),

  FAMILY_5: Object.freeze({
    name:        '"Elections alone guarantee democracy"',
    core_error:  'Confuses the minimal condition (competitive elections) with the sufficient condition (full democratic functioning). Many authoritarian regimes hold elections.',
    questions:   ['dp_010', 'dp_016', 'dp_022', 'dp_023'],
    antidote:    'Elections are a necessary but insufficient condition for democracy. What matters is whether losers accept results, whether independent institutions function, and whether fundamental rights are protected between elections.',
  }),

  FAMILY_6: Object.freeze({
    name:        '"Democratic participation = individual choice with no collective effect"',
    core_error:  'Treats civic behaviour as purely private. Misses the collective action structure: when everyone reasons this way, the aggregate outcome is democratic decay.',
    questions:   ['dp_004', 'dp_013', 'dp_030', 'dp_036'],
    antidote:    'Gratis-rider logic applied to democracy produces predictable degradation. Individual abstention is individually rational but collectively self-defeating. This is the democratic collective action problem.',
  }),

});

// ─── COMPLETED OBJECTS (dp_019–dp_025) ────────────────────────────────────────

export const COMPLETED_OBJECTS = Object.freeze([

  Object.freeze({
    id: 'dp_019',
    question: 'Hvad er forskellen på borgerrettigheder og menneskerettigheder?',
    options: Object.freeze([
      { text: 'De er synonyme begreber — begge beskytter individers frihed', misconception: 'false_equivalence — de overlapper men er ikke identiske; kilden og bæreren af rettighederne adskiller sig fundamentalt', correct: false },
      { text: 'Menneskerettigheder gælder alle mennesker i kraft af at være mennesker — borgerrettigheder gives og håndhæves af specifikke stater over for deres borgere', misconception: null, correct: true },
      { text: 'Borgerrettigheder er lovfæstede — menneskerettigheder er blot moralske principper uden juridisk kraft', misconception: 'scope_confusion — menneskerettigheder er kodificeret i internationale traktater og er juridisk bindende for stater der har ratificeret dem', correct: false },
      { text: 'Menneskerettigheder gælder kun i krigssituationer — borgerrettigheder i fredstid', misconception: 'surface_association — kontekstlig forveksling; skellet handler om kilde, ikke kontekst', correct: false },
    ]),
    review_text: 'Skellet er ikke kun semantisk — det er et spørgsmål om hvem der garanterer dig hvad. Borgerrettigheder afhænger af din relation til en stat: de kan i princippet fratages ved at fratage statsborgerskab. Menneskerettigheder hviler på en anden antagelse: at visse rettigheder følger med menneskelig eksistens, ikke med pas. FN\'s erklæring af 1948 var et direkte svar på Holocaust — en anerkendelse af at statssuverænitet ikke kan beskytte rettighederne, fordi staten selv var bødlen. Det er grunden til at menneskerettigheder eksplicit er formuleret som noget der binder stater udefra.',
    metadata: Object.freeze({
      concepts: ['civil_rights', 'minority_rights', 'political_legitimacy'],
      misconception_type: 'false_equivalence',
      cognitive_skill: 'comprehension',
      difficulty_type: 'factual',
      challenge_role: 'reinforcement',
      insight_type: 'conceptual_bridge',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_020',
    question: 'Hvad er det konkrete problem med at lade markedet bestemme over kollektive goder som rent vand eller national forsvar?',
    options: Object.freeze([
      { text: 'Markeder er ineffektive til at producere kollektive goder', misconception: 'scope_confusion — ineffektivitet er konsekvensen, ikke årsagen; det er incitamentsstrukturen der er problemet', correct: false },
      { text: 'Kollektive goder er for vigtige til at overlade til private interesser', misconception: 'surface_association — en normativ påstand der ikke forklarer den strukturelle mekanisme', correct: false },
      { text: 'Ingen kan ekskluderes fra at nyde dem og ingen kan tvinges til at betale — markedet mangler mekanismen til at finansiere dem', misconception: null, correct: true },
      { text: 'Private virksomheder vil altid underprise kollektive goder for at maksimere profit', misconception: 'causal_inversion — virksomheder vil faktisk overprise eller slet ikke udbyde dem; underprisning er ikke mekanismen', correct: false },
    ]),
    review_text: 'Markedet finansierer goder ved at ekskludere dem der ikke betaler. Det fungerer for brød og software. Det fungerer ikke for ren luft, biodiversitet og national forsvar — fordi ingen kan ekskluderes fra at nyde dem, og én persons forbrug ikke reducerer en andens. Resultatet: alle ønsker godet, men ingen har individuelt incitament til at finansiere det. Markedet leverer for lidt, eller slet intet. Det er ikke markedets fejl — det er dets logik. Demokratisk kollektiv finansiering er ikke ideologisk modstand mod markedet. Det er løsningen på et præcist strukturelt problem markedet ikke kan løse alene.',
    metadata: Object.freeze({
      concepts: ['collective_action', 'power_distribution', 'political_legitimacy'],
      misconception_type: 'scope_confusion',
      cognitive_skill: 'analysis',
      difficulty_type: 'conceptual',
      challenge_role: 'challenge',
      insight_type: 'reframing',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_021',
    question: 'Hvad er et ekkokammer — og hvad er den primære mekanisme der skaber det?',
    options: Object.freeze([
      { text: 'En gruppe ligesindede der bevidst undgår at høre modargumenter', misconception: 'surface_association — forudsætter bevidst fravalg; ekkokamre er oftest algoritmisk konstruerede, ikke valgte', correct: false },
      { text: 'Et informationsmiljø der konstant bekræfter eksisterende overbevisninger — skabt primært af platformalgoritmer der optimerer engagement frem for indsigt', misconception: null, correct: true },
      { text: 'Et medie der kun formidler ét politisk synspunkt', misconception: 'false_equivalence — det er partisan media; et ekkokammer er den personaliserede filtrering der opstår rundt om den individuelle bruger', correct: false },
      { text: 'En politisk kultur der ikke tolererer offentlig uenighed', misconception: 'scope_confusion — det beskriver politisk konformitetspres, ikke det algoritmiske ekkokammer', correct: false },
    ]),
    review_text: 'Ekkokamre opstår ikke primært fordi folk er ideologisk snæversynede — de opstår fordi platforme er designet til engagement, og bekræftelse genererer mere engagement end modsigelse. En bruger der klikker på ét politisk perspektiv ser gradvist mere af det — ikke som valg, men som algoritmisk konsekvens. Det farlige er ikke at ekkokamre gør folk mere ekstreme (evidensen er blandet). Det er at de gør det muligt at leve i en faktuel virkelighed der er strukturelt adskilt fra modpartens. Politisk dialog kræver delt faktuel bund. Ekkokamre eroderer den bund — stille, personaliseret, en feed ad gangen.',
    metadata: Object.freeze({
      concepts: ['propaganda', 'media_and_democracy', 'civil_society'],
      misconception_type: 'surface_association',
      cognitive_skill: 'analysis',
      difficulty_type: 'conceptual',
      challenge_role: 'reinforcement',
      insight_type: 'perspective_shift',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_022',
    question: 'Kan en leder der kom til magten ulovligt alligevel regere legitimt?',
    options: Object.freeze([
      { text: 'Nej — uden lovlig magtovertagelse er ethvert styre pr. definition illegitimt', misconception: 'causal_inversion — forveksler legalitet med legitimitet; det er to analytisk adskilte begreber', correct: false },
      { text: 'Nej — demokratisk legitimitet kræver altid procedurelt korrekte valg', misconception: 'overgeneralization — dette er en normativ definition; den empiriske analyse er en anden', correct: false },
      { text: 'Ja — legitimitet er uafhængig af legalitet; en leder kan have reel folkelig accept uden at have fulgt juridiske procedurer', misconception: null, correct: true },
      { text: 'Ja — men kun midlertidigt, indtil et nyt lovligt valg kan afholdes', misconception: 'scope_confusion — påfører en normativ betingelse på et empirisk begreb', correct: false },
    ]),
    review_text: 'Max Weber adskillede legalitet og legitimitet som begreber med god grund. Legitimitet er sociologisk: er de regerede faktisk villige til at acceptere autoritetens ret til at regere? Napoleon var i mange henseender illegitimt til magten — og regerede alligevel med massiv folkelig accept. Omvendt kan en leder vinde et lovligt valg og gradvist miste al legitimitet — som Mugabe i Zimbabwe, der i årtier vandt valg mens den reelle accept smuldrede. Legitimitetsbegrebet er analytisk vigtigt præcis fordi det adskiller den formelle procedure fra den sociale virkelighed. Begge tæller — men de er ikke det samme.',
    metadata: Object.freeze({
      concepts: ['political_legitimacy', 'representation', 'accountability'],
      misconception_type: 'causal_inversion',
      cognitive_skill: 'evaluation',
      difficulty_type: 'analytical',
      challenge_role: 'deep_challenge',
      insight_type: 'conceptual_bridge',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_023',
    question: 'Hvorfor kan direkte demokrati skalere dårligt til moderne nationalstater?',
    options: Object.freeze([
      { text: 'Borgere mangler tilstrækkelig viden til at træffe informerede beslutninger om komplekse emner', misconception: 'overgeneralization — et eliteargument der ikke adresserer det strukturelle skaleringsprobelm', correct: false },
      { text: 'Folk er for uenige til at nå konsensus i store grupper', misconception: 'surface_association — uenighed eksisterer i alle systemer; det er ikke skaleringsproblemet', correct: false },
      { text: 'Direkte demokrati kræver at alle borgere deltager aktivt i alle beslutninger — i komplekse stater er dette logistisk og kognitivt umuligt at opretholde', misconception: null, correct: true },
      { text: 'Direkte demokrati er sårbart over for flertalstyranni', misconception: 'false_equivalence — dette er et retfærdighedsproblem, ikke et skaleringsprobelm; de er analytisk adskilte', correct: false },
    ]),
    review_text: 'Athen praktiserede direkte demokrati med måske 30.000–50.000 deltagelsesberettigede — og selv dér var det logistisk krævende. En moderne nation med 6 millioner borgere kan ikke afholde daglige folkeafstemninger om hvert lovforslag. Men problemet er ikke kun logistisk. Det er kognitivt: en enkelt lov kan indeholde hundredvis af tekniske, juridiske og sociale afvejninger. Borgere kan have stærke og legitime meninger om formål uden kapacitet til at evaluere implementeringsvalg. Det er ikke et argument mod folkelig deltagelse — det er argumentet for repræsentation som specialisering af én demokratisk funktion: beslutningstagning i kompleksitet.',
    metadata: Object.freeze({
      concepts: ['representation', 'collective_action', 'political_legitimacy'],
      misconception_type: 'overgeneralization',
      cognitive_skill: 'evaluation',
      difficulty_type: 'analytical',
      challenge_role: 'challenge',
      insight_type: 'reframing',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_024',
    question: 'Hvad er Tocquevilles "flertallets tyranni" — og er det primært et juridisk eller socialt fænomen?',
    options: Object.freeze([
      { text: 'Primært juridisk — flertallet vedtager love der systematisk skader mindretal', misconception: 'scope_confusion — Tocqueville identificerede det sociale pres som det dybere og mere gennemgribende fænomen', correct: false },
      { text: 'Et historisk begreb om jakobinernes terrorstyre under Frankrigs Revolution', misconception: 'surface_association — Tocqueville observerede USA i 1830\'erne, ikke Frankrig under Revolutionen', correct: false },
      { text: 'Et argument for at demokrati er en ringere styreform end aristokrati', misconception: 'causal_inversion — Tocqueville var ikke antidemokratisk; han ville identificere demokratiets indre farer for at styrke det', correct: false },
      { text: 'Primært socialt — majoritetskulturens konformitetspres der kvæler afvigende meninger uden en enkelt lov', misconception: null, correct: true },
    ]),
    review_text: 'Tocqueville observerede i 1830\'ernes USA at det mest effektive tyranni ikke behøver love. En majoritetskulturs sociale pres til at tænke, mene og opføre sig korrekt kan være mere effektivt end statens lov — fordi det ikke efterlader synlige mærker. Ingen piskede ikke-konformister. Men den sociale udelukkelse, forretningsboykot og kulturelle isolation var reelle konsekvenser. Tocqueville kaldte det "tyranni over sindet." Er det stadig relevant? Sociale mediers mobkultur, cancel culture og platformkonformitetspres er 21. århundredes version af præcis det fænomen Tocqueville beskrev 190 år siden.',
    metadata: Object.freeze({
      concepts: ['minority_rights', 'civil_rights', 'political_legitimacy'],
      misconception_type: 'scope_confusion',
      cognitive_skill: 'evaluation',
      difficulty_type: 'analytical',
      challenge_role: 'deep_challenge',
      insight_type: 'perspective_shift',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_025',
    question: 'Hvornår er whistleblowing moralsk forpligtende — frem for blot moralsk tilladt?',
    options: Object.freeze([
      { text: 'Altid — borgere har en demokratisk pligt til at afsløre magtmisbrug', misconception: 'overgeneralization — ignorerer proportionalitet og personlig risiko; pligt kræver mere præcis definition', correct: false },
      { text: 'Kun når man er legalt beskyttet imod konsekvenser', misconception: 'scope_confusion — legal beskyttelse er en betingelse for sikkerhed, ikke for moralsk forpligtelse', correct: false },
      { text: 'Whistleblowing er altid et personligt valg — ingen kan moralsk forpligtes til at sætte sig selv i fare', misconception: 'authority_bias — absolutiserer den individuelle selvbeskyttelse og ignorerer kollektiv skade', correct: false },
      { text: 'Når skaden er alvorlig og systematisk, alle interne kanaler er udtømt, og afsløringen er proportional med skaden', misconception: null, correct: true },
    ]),
    review_text: 'Snowden, Ellsberg, Manning — whistleblowere opererer i en etisk gråzone der ikke kan reduceres til "lyd et horn og vær en helt." Den moralske forpligtelse afhænger af tre faktorer: alvorlighed (er skaden reelt alvorlig, ikke blot pinlig for institutionen?), udtømning (er interne kanaler forsøgt eller umulige?), og proportionalitet (retter afsløringen sig mod skaden — ikke mod alt hvad institutionen gemmer?). Det moralsk overbevisende tilfælde for whistleblowing er ikke "systemet er korrupt generelt." Det er: "denne konkrete skade forvolder denne konkrete lide, og ingen andre stopper den." Generaliseret systemkritik er aktivisme. Det er noget andet.',
    metadata: Object.freeze({
      concepts: ['accountability', 'civil_rights', 'checks_and_balances'],
      misconception_type: 'authority_bias',
      cognitive_skill: 'evaluation',
      difficulty_type: 'analytical',
      challenge_role: 'deep_challenge',
      insight_type: 'reframing',
      review_text_level: 3,
    }),
  }),

]);

// ─── EXPANDED OBJECTS (dp_026–dp_040) ─────────────────────────────────────────

export const EXPANDED_OBJECTS = Object.freeze([

  Object.freeze({
    id: 'dp_026',
    question: 'Hvad adskiller populisme fra legitim demokratisk protest?',
    options: Object.freeze([
      { text: 'Populisme er ulovlig politisk mobilisering — demokratisk protest er lovlig', misconception: 'false_equivalence — populisme kan godt være fuldstændig lovlig; skellet er ikke juridisk', correct: false },
      { text: 'Populisme positionerer "det ægte folk" mod en korrupt "elite" som to homogene blokke — demokratisk protest udfordrer specifikke beslutninger inden for et delt system', misconception: null, correct: true },
      { text: 'Populisme har altid ekstremistiske politiske mål', misconception: 'overgeneralization — populisme er en politisk grammatik, ikke et sæt politikker; det kan bære venstre- eller højreorienterede mål', correct: false },
      { text: 'Populisme er altid antidemokratisk', misconception: 'overgeneralization — venstreorienteret populisme har historisk set udvidet demokratisk deltagelse i visse kontekster', correct: false },
    ]),
    review_text: 'Populisme er ikke en politik — det er en narrativ struktur. Den opdeler samfundet i to rene og homogene grupper: "det ægte folk" og "den korrupte elite." Problemet er homogeniteten. Demokratiet bygger på antagelsen om at "folket" er pluralt og har modstridende legitime interesser. Populisme kræver at "folket" er ét, med én vilje — og at enhver der er uenig enten er del af eliten eller forråder folket. Det gør kompromis til forræderi. Det gør opposition til fjendtlighed. Og det underminerer den institutionelle respekt som demokratiet kræver at alle parter — inkl. taberne — opretholder.',
    metadata: Object.freeze({
      concepts: ['populism', 'political_legitimacy', 'minority_rights'],
      misconception_type: 'false_equivalence',
      cognitive_skill: 'analysis',
      difficulty_type: 'conceptual',
      challenge_role: 'challenge',
      insight_type: 'reframing',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_027',
    question: 'Hvad er det tidligste advarselstegn på at et demokrati er ved at erodere?',
    options: Object.freeze([
      { text: 'Åbenlys valgsvindel ved et nationalt valg', misconception: 'surface_association — åbenlys svindel er ofte et sent symptom; erosionen begynder stille', correct: false },
      { text: 'Politisk vold og offentlige optøjer', misconception: 'surface_association — vold er typisk konsekvens af erosion, ikke dens begyndelse', correct: false },
      { text: 'En leder der vinder med meget stort flertal', misconception: 'false_equivalence — store mandater er ikke i sig selv erosive', correct: false },
      { text: 'Systematisk svækkelse af de institutioner der begrænser regeringens magt — domstole, presse og valgkommissioner', misconception: null, correct: true },
    ]),
    review_text: 'Demokratier bryder sjældent ned på én dag. De eroderer. Levitsky og Ziblatt (How Democracies Die) identificerede mønsteret: først undermineres normerne der beskytter institutionerne — respekt for domstolenes kendelser, accept af valgresultater, afhold fra at kalde oppositionen kriminelle. Dernæst svækkes de formelle institutioner: domstolsbesætning, valgkommissionssammensætning, presselovgivning. Først bagefter kommer det åbne autokrati. Kerneobservationen: erosionen sker inden for demokratiets egne regler. Den kommende autokrat vinder et lovligt valg — og bruger derefter den lovlige magt til at afmontere systemets begrænsninger.',
    metadata: Object.freeze({
      concepts: ['authoritarian_drift', 'checks_and_balances', 'democratic_resilience'],
      misconception_type: 'surface_association',
      cognitive_skill: 'evaluation',
      difficulty_type: 'analytical',
      challenge_role: 'deep_challenge',
      insight_type: 'perspective_shift',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_028',
    question: 'Hvornår udgør koncentration af medieejerskab en specifik demokratisk trussel?',
    options: Object.freeze([
      { text: 'Altid — privat medieejerskab er strukturelt problematisk for demokratiet', misconception: 'overgeneralization — mange velfungerende demokratier har stærke private medier', correct: false },
      { text: 'Kun når alle medier ejes af staten', misconception: 'surface_association — statsejerskab er den åbenlyse trussel; privat koncentration er den mere subtile og hyppigere', correct: false },
      { text: 'Når ejeren bruger medierne til at fremme egne politiske og forretningsmæssige interesser frem for at informere borgere', misconception: null, correct: true },
      { text: 'Kun i lande uden public service-medier som DR', misconception: 'scope_confusion — public service reducerer men eliminerer ikke problemet ved privat mediekoncentration', correct: false },
    ]),
    review_text: 'Mediefrihed er ikke kun frihed fra staten. Det er frihed til at rapportere — uanset ejerens interesser. En mediekoncern med seks aviser, tre tv-kanaler og ejendomsinvesteringer har strukturelle interesser i regulering af disse sektorer. Redaktioner censureres sjældent åbenlyst. De selvregulerer: journalister lærer hurtigt hvilke historier der aldrig bliver til forsider. Pluralisme i medieejerskab er ikke blot konkurrencepolitik — det er demokratisk infrastruktur. Et demokrati der kræver informerede borgere men ikke beskytter mediemangfoldighed, stoler på at private ejere generøst informerer mod egne interesser.',
    metadata: Object.freeze({
      concepts: ['media_and_democracy', 'accountability', 'power_distribution'],
      misconception_type: 'surface_association',
      cognitive_skill: 'evaluation',
      difficulty_type: 'analytical',
      challenge_role: 'challenge',
      insight_type: 'reframing',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_029',
    question: 'Hvad er den mest præcise måde sociale medier strukturelt svækker demokratisk deliberation?',
    options: Object.freeze([
      { text: 'Sociale medier spreder misinformation der erstatter faktuel viden', misconception: 'causal_inversion — misinformation er et symptom; den primære strukturelle mekanisme er incitamentsdesignet', correct: false },
      { text: 'Folk bruger for meget tid på underholdning og for lidt på politik', misconception: 'surface_association — tidsallokeringsproblem er ikke det strukturelle problem', correct: false },
      { text: 'Sociale medier er for nemme at manipulere af udenlandske aktører', misconception: 'scope_confusion — et reelt men sekundært problem; den primære mekanisme er intern', correct: false },
      { text: 'Platforme belønner emotionel og polariserende kommunikation frem for nuanceret argumentation, fordi det genererer mere engagement', misconception: null, correct: true },
    ]),
    review_text: 'Problemet med sociale medier og demokrati er ikke indholdet — det er arkitekturen. Platforme optimerer for engagement: det der genererer reaktioner er outrage, identitetsmarkering og bekræftelse. En præcis, nuanceret analyse genererer færre reaktioner end et skarpt partisanopslag. Platformen er teknisk neutral overfor indhold men strukturelt ikke-neutral overfor tone. Resultatet er ikke et informationsproblem men et deliberationsproblem: de institutionelle incitamenter diskriminerer systematisk mod den kommunikationsform demokrati kræver — langsom, nuanceret, faktabaseret, kompromisvillig.',
    metadata: Object.freeze({
      concepts: ['media_and_democracy', 'propaganda', 'collective_action'],
      misconception_type: 'causal_inversion',
      cognitive_skill: 'analysis',
      difficulty_type: 'analytical',
      challenge_role: 'challenge',
      insight_type: 'conceptual_bridge',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_030',
    question: 'Hvad er civilsamfundets vigtigste demokratiske funktion?',
    options: Object.freeze([
      { text: 'At supplere statens velfærdsopgaver med frivillige tjenester', misconception: 'scope_confusion — service er én funktion; den demokratiske kernefunktion er en anden', correct: false },
      { text: 'At mobilisere borgere til at stemme ved valg', misconception: 'surface_association — mobilisering er én aktivitet; civilsamfundets demokratiske funktion er strukturelt dybere', correct: false },
      { text: 'At give borgere mulighed for at mødes og dyrke fælles interesser', misconception: 'false_equivalence — den sociale funktion er ikke det samme som den demokratiske funktion', correct: false },
      { text: 'At skabe institutioner og netværk der fungerer uafhængigt af staten og dermed modvirker magtkoncentration og bygger kollektiv handlekapacitet', misconception: null, correct: true },
    ]),
    review_text: 'Tocqueville beundrede amerikanske foreninger mere end nogen anden demokratisk institution. Han så i dem det der reelt adskillede demokratiet fra blot at være en statsform: borgere der lærte at koordinere og handle kollektivt uden statens initiativ. Fagforeninger, borgergrupper, presseklubber, religiøse samfund — disse institutioner skaber kapacitet til kollektiv handling og udgør en strukturel modkraft mod statens ekspansion. Når de svækkes, svækkes demokratiets muskler. Det er ikke et sentimentalt argument — det er strukturelt: et folk der ikke kan organisere sig uafhængigt, kan ikke holde staten ansvarlig.',
    metadata: Object.freeze({
      concepts: ['civil_society', 'collective_action', 'democratic_resilience'],
      misconception_type: 'scope_confusion',
      cognitive_skill: 'synthesis',
      difficulty_type: 'conceptual',
      challenge_role: 'challenge',
      insight_type: 'conceptual_bridge',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_031',
    question: 'Hvad gør en forfatning til mere end et stykke papir?',
    options: Object.freeze([
      { text: 'At den er tilstrækkeligt detaljeret til at dække alle juridiske situationer', misconception: 'false_equivalence — detaljerede forfatninger kan ignoreres ligeså let som korte', correct: false },
      { text: 'At den er demokratisk vedtaget med kvalificeret flertal', misconception: 'scope_confusion — vedtagelsesmetoden sikrer ikke fremtidig efterlevelse', correct: false },
      { text: 'At den er skrevet af folket direkte frem for af politikere', misconception: 'surface_association — oprindelsen garanterer ikke håndhævelse', correct: false },
      { text: 'At centrale institutioner og aktører faktisk retter ind efter den — og at der er håndhævelsesmekanismer når de ikke gør det', misconception: null, correct: true },
    ]),
    review_text: 'Sovjetunionen havde en fremragende forfatning — på papiret. Den garanterede ytrings-, forsamlings- og religionsfrihed. Ingen efterlevede den. Nordkorea har en forfatning der beskytter "personlig frihed og privatliv." Forfatningers kraft kommer ikke fra teksten — den kommer fra den politiske kultur og de institutionelle mekanismer der omgiver den. Domstole der tager teksten alvorligt. Politikere der accepterer dens begrænsninger som legitime selv når det er ubelejligt. En offentlighed der kender og kræver sine rettigheder. Teksten er rammesætningen. Kulturen er motoren.',
    metadata: Object.freeze({
      concepts: ['checks_and_balances', 'political_legitimacy', 'democratic_resilience'],
      misconception_type: 'false_equivalence',
      cognitive_skill: 'evaluation',
      difficulty_type: 'conceptual',
      challenge_role: 'challenge',
      insight_type: 'reframing',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_032',
    question: 'Hvad er demokratiets dilemma med domstolsprøvelse af lovgivning?',
    options: Object.freeze([
      { text: 'Domstolsprøvelse er udemokratisk fordi uvalgte dommere ophæver folkevalgtes beslutninger', misconception: 'scope_confusion — præsenterer kun den ene side af en reel spænding uden at forstå dens funktion', correct: false },
      { text: 'Domstolsprøvelse er et neutralt juridisk redskab uden politisk dimension', misconception: 'false_equivalence — domstolsprøvelse er inherent politisk i sine konsekvenser uanset om intentionen er neutral', correct: false },
      { text: 'Det er en mekanisme der beskytter demokratiets grundlæg ved at begrænse demokratiets flertal — dilemmaet er at uvalgte dommere dermed fastlægger demokratiets grænser', misconception: null, correct: true },
      { text: 'Domstolsprøvelse er kun nødvendig i lande med upålidelige parlamenter', misconception: 'overgeneralization — selv velfungerende parlamenter kan vedtage grundlovsstridige love', correct: false },
    ]),
    review_text: 'Domstolsprøvelse er demokratiets selvmodsigelsesmekanisme: et instrument der beskytter demokratiets grundlag ved at begrænse demokratiets flertal. Majoriteten kan ikke stemme sig til at fratage mindretal grundlæggende rettigheder — og domstolene håndhæver grænsen. Men dilemmaet er ægte: hvem valgte disse dommere til at fastlægge demokratiets egne grænser? USA\'s højesteretsdommere sidder livslangt og former politisk virkelighed for generationer. Der er ingen perfekt løsning — kun erkendelsen at demokratiet kræver begrænsning af sit eget flertal for at beskytte de grundlæg demokratiet hviler på.',
    metadata: Object.freeze({
      concepts: ['checks_and_balances', 'separation_of_powers', 'minority_rights'],
      misconception_type: 'scope_confusion',
      cognitive_skill: 'evaluation',
      difficulty_type: 'analytical',
      challenge_role: 'deep_challenge',
      insight_type: 'conceptual_bridge',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_033',
    question: 'Hvornår er politiske partier afgørende for demokratiet — og hvornår truer de det?',
    options: Object.freeze([
      { text: 'Partier er altid gavnlige fordi de organiserer politisk deltagelse i skala', misconception: 'overgeneralization — partier kan danne karteller der udelukker ny konkurrence', correct: false },
      { text: 'Partier truer altid demokratiet fordi de skaber partisan loyalitet frem for saglig vurdering', misconception: 'overgeneralization — partisan loyalitet er uundgåeligt i partisystemer og ikke i sig selv udemokratisk', correct: false },
      { text: 'Partier er afgørende når de aggregerer interesser og koordinerer — de truer demokratiet når de danner karteller der fastsætter regler der beskytte dem mod ny konkurrence', misconception: null, correct: true },
      { text: 'Partier er primært truende i flerpartisystemer der producerer politisk instabilitet', misconception: 'causal_inversion — flerpartisystemer er generelt mere repræsentative end topartisystemer', correct: false },
    ]),
    review_text: 'Et politisk parti er demokratiets koordineringsinstrument: det samler borgere med sammenfaldende interesser og muliggør politisk handling i skala. Uden partier er demokratisk koordination umulig. Men modne partisystemer kan degenerere til karteller: etablerede partier aftaler institutionelle regler der gør det svært for udfordrere at komme ind — valgbarhedstærskler, medieregler, offentlig partifinansiering der favoriserer eksisterende aktører. Ikke nødvendigvis korruption. Blot strukturel selvinteresse. Et sundt demokrati kræver partier — og mekanismer der holder dem konkurrenceudsatte.',
    metadata: Object.freeze({
      concepts: ['representation', 'power_distribution', 'accountability'],
      misconception_type: 'overgeneralization',
      cognitive_skill: 'evaluation',
      difficulty_type: 'analytical',
      challenge_role: 'challenge',
      insight_type: 'reframing',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_034',
    question: 'Hvad er den vigtige forskel på desinformation og misinformation?',
    options: Object.freeze([
      { text: 'Desinformation er digital — misinformation er analog', misconception: 'false_equivalence — mediumet er irrelevant; skellet er intentionen', correct: false },
      { text: 'Desinformation stammer fra udenlandske aktører — misinformation fra indenlandske', misconception: 'scope_confusion — oprindelseslandet definerer ikke begreberne', correct: false },
      { text: 'Misinformation er altid mildere end desinformation fordi den ikke er bevidst', misconception: 'overgeneralization — uforsætlig spredning kan forvole samme eller større skade end intentionel', correct: false },
      { text: 'Desinformation spredes med bevidst hensigt om at vildlede — misinformation spredes af fejlinformerede der tror de deler noget sandt', misconception: null, correct: true },
    ]),
    review_text: 'Skellet er ikke trivielt — det bestemmer respons-strategien. Desinformation kræver modstrategier rettet mod den bevidste afsender: platformansvar, eksponering af intentioner, modinformation. Misinformation kræver modstrategier rettet mod sprederen: bedre mediefærdigheder, korrektioner der ikke præsenteres som anklager. At kalde en fejlinformeret person en bevidst løgner skaber defensivt modstand og reducerer sandsynlighed for korrektion. Præcision i begreberne er ikke akademisk petitesse — det er forudsætning for effektiv reaktion. Forkert diagnose producerer forkert medicin.',
    metadata: Object.freeze({
      concepts: ['propaganda', 'media_and_democracy', 'accountability'],
      misconception_type: 'false_equivalence',
      cognitive_skill: 'comprehension',
      difficulty_type: 'factual',
      challenge_role: 'reinforcement',
      insight_type: 'reframing',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_035',
    question: 'Hvad er den afgørende faktor for om et demokrati overlever en alvorlig krise?',
    options: Object.freeze([
      { text: 'Styrken af landets militære institutioner og evne til at opretholde orden', misconception: 'authority_bias — militær styrke kan beskytte men er ofte selve truslen mod demokratiet i krise', correct: false },
      { text: 'Landets økonomiske velstand som buffer mod politisk radikalisering', misconception: 'causal_inversion — velhavende demokratier har også kollapset; Weimar-Tyskland var industrialiseret', correct: false },
      { text: 'Fraværet af udenlandsk indblanding i demokratiske processer', misconception: 'scope_confusion — vigtig faktor, men ikke den afgørende interne variabel', correct: false },
      { text: 'Borgeres og eliternes villighed til at respektere demokratiets procedurer selv når resultatet er ugunstigt for dem', misconception: null, correct: true },
    ]),
    review_text: 'Demokratier overlever ikke kriser fordi institutionerne er stærke nok til at modstå. Institutioner er stærke fordi nøgleaktørerne — partier, embedsmænd, militær, domstole — vælger at respektere dem selv under pres. Weimar-republikken kollapsede ikke fordi institutionerne teknisk fejlede. Det kollapsede fordi de aktører der stod for institutionerne valgte ikke at forsvare dem. Det afgørende er det Levitsky og Ziblatt kalder gensidig tolerance og institutionel selvkontrol: vilje til at acceptere modpartens legitime sejr og undlade at bruge alle tilladte midler til at ødelægge dem. Disse er ikke formelle regler. De er normer. Og normer er sårbare.',
    metadata: Object.freeze({
      concepts: ['democratic_resilience', 'political_legitimacy', 'checks_and_balances'],
      misconception_type: 'authority_bias',
      cognitive_skill: 'synthesis',
      difficulty_type: 'analytical',
      challenge_role: 'deep_challenge',
      insight_type: 'perspective_shift',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_036',
    question: 'Hvad er forskellen på at have formelt statsborgerskab og at være aktiv demokratisk deltager?',
    options: Object.freeze([
      { text: 'Alle statsborgere er per definition demokratiske deltagere idet de alle er underlagt demokratiets regler', misconception: 'false_equivalence — statsborgerskab er en juridisk status; demokratisk deltagelse er en praksis', correct: false },
      { text: 'Aktiv demokratisk deltagelse kræver uddannelse og politisk viden', misconception: 'authority_bias — dette er et eksklusionstræk der ikke definerer begrebsskellet', correct: false },
      { text: 'Aktiv demokratisk deltagelse er at stemme ved valg', misconception: 'scope_confusion — stemning er minimal deltagelse; det fulde begreb rummer langt mere', correct: false },
      { text: 'Formel statsborger har juridisk status og rettigheder — aktiv demokratisk deltager bidrager til det civile og politiske liv der giver demokratiet substans', misconception: null, correct: true },
    ]),
    review_text: 'Man kan besidde et pas og aldrig bidrage til det demokrati passet tilhører. Formel statsborgerskab er en juridisk kategori — den giver rettigheder og pålægger visse pligter. Demokratisk deltagelse er en praksis: at informere sig, diskutere, organisere sig, holde magthavere ansvarlige. Et demokrati kan have 100% formelle statsborgere og nul aktiv demokratisk kapacitet, hvis ingen deltager. Omvendt kan et samfund med begrænset formel ret have stærk demokratisk kultur. Retten til at deltage og kapaciteten til at gøre det er to vidt forskellige ting — og begge kræver aktiv investering for at eksistere.',
    metadata: Object.freeze({
      concepts: ['collective_action', 'civil_society', 'representation'],
      misconception_type: 'false_equivalence',
      cognitive_skill: 'comprehension',
      difficulty_type: 'conceptual',
      challenge_role: 'reinforcement',
      insight_type: 'reframing',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_037',
    question: 'Er lobbyisme nødvendigvis skadelig for demokratiet?',
    options: Object.freeze([
      { text: 'Ja — lobbyisme giver organiserede interesser uforholdsmæssig indflydelse', misconception: 'overgeneralization — sand for visse former for lobbyisme, men ikke al interessevaretagelse', correct: false },
      { text: 'Ja — kun vælgernes stemme bør forme politiske beslutninger', misconception: 'scope_confusion — reducerer demokratisk input til én kanal og ignorerer behovet for saglig information fra berørte parter', correct: false },
      { text: 'Nej — lobbyisme er blot erhvervslivets ytringsfrihed', misconception: 'false_equivalence — reducerer lobbyisme til ytringsfrihed og ignorerer strukturelle magtasymmetrier', correct: false },
      { text: 'Nej — lobbyisme er en form for politisk deltagelse der kan informere beslutningstagere, men asymmetrien kræver regulering og transparens', misconception: null, correct: true },
    ]),
    review_text: 'Lobbyisme er ikke ét fænomen. En patientforening der informerer parlamentarikere om konsekvenserne af et sundhedslovforslag er noget andet end en tobaksindustri der ansætter konsulenter til at forsinke videnskabeligt begrundet regulering. Begge er lobbyisme. Problemet er asymmetrien: velfinansierede interesser kan lobbye kontinuerligt og professionelt; diffuse offentlige interesser kan det ikke. Løsningen er regulering, gennemsigtighed og institutionel modvægt — ikke forbud. Et forbud mod lobbyisme ville flytte indflydelse til uofficielle kanaler. Det ville ikke eliminere den. Det ville blot gøre den usynlig.',
    metadata: Object.freeze({
      concepts: ['power_distribution', 'accountability', 'representation'],
      misconception_type: 'overgeneralization',
      cognitive_skill: 'evaluation',
      difficulty_type: 'analytical',
      challenge_role: 'challenge',
      insight_type: 'reframing',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_038',
    question: 'Hvad er det stærkeste strukturelle argument for tidsbegrænsning af politiske embeder?',
    options: Object.freeze([
      { text: 'Det sikrer at nye og friske perspektiver kontinuerligt introduceres i politikken', misconception: 'causal_inversion — det er en fordel, men ikke det primære strukturelle argument', correct: false },
      { text: 'Det er et udtryk for det demokratiske princip om at magt regelmæssigt bør cirkulere', misconception: 'surface_association — sandt, men ikke den strukturelt præcise begrundelse', correct: false },
      { text: 'Det forhindrer populære ledere i at akkumulere for stor folkelig støtte', misconception: 'false_equivalence — at begrænse folkelig støtte er ikke et demokratisk argument', correct: false },
      { text: 'Det reducerer de strukturelle incitamenter til at kapre institutioner ved at begrænse den periode hvori en leder kan drage fordel af dem', misconception: null, correct: true },
    ]),
    review_text: 'Tidsbegrænsning er ikke designet til at bringe variation — det er designet til at reducere institutionel kapring. En leder der ved de sidder i otte år og ikke kan sidde i tolv, har reducerede incitamenter til at cementere personlig magt permanent. En leder uden tidsbegrænsning har alle incitamenter til at investere i at kontrollere de institutioner der skulle kontrollere dem. Franklin D. Roosevelts fire præsidentvalg — dog under ekstraordinære omstændigheder — førte direkte til den 22. tillæg der begrænsede fremtidige præsidenter. Argumentet er ikke at magt korrumperer mennesker. Det er at magt skaber strukturelle incitamenter der korrumperer systemer.',
    metadata: Object.freeze({
      concepts: ['accountability', 'checks_and_balances', 'authoritarian_drift'],
      misconception_type: 'causal_inversion',
      cognitive_skill: 'evaluation',
      difficulty_type: 'analytical',
      challenge_role: 'challenge',
      insight_type: 'reframing',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_039',
    question: 'Hvad er den mest strukturelt præcise forklaring på udbredt politisk apati?',
    options: Object.freeze([
      { text: 'Folk er for selvoptaget og materialistiske til at bry sig om fællesskabet', misconception: 'authority_bias — en moralsk dom der ikke undersøger de institutionelle betingelser', correct: false },
      { text: 'Uddannelsesniveauet er for lavt til at borgere kan engagere sig meningsfuldt', misconception: 'authority_bias — empirisk ubegrundet og ignorerer at apati også findes i højtuddannede grupper', correct: false },
      { text: 'Sociale medier har erstattet politisk engagement med underholdning', misconception: 'causal_inversion — en korrelat, ikke en root cause', correct: false },
      { text: 'Politiske systemer leverer ikke resultater der er meningsfulde i borgernes liv, eller borgere oplever ikke at have reelle valgmuligheder der afspejler deres præferencer', misconception: null, correct: true },
    ]),
    review_text: 'Apati er ikke personlighedstræk — det er rationelt respons på institutionelle vilkår. Når alle partier konvergerer til centrum, er marginaldifferencen lav. Når politiske processer er uigennemsigtige og ekspertdominerede, virker deltagelse meningsløs. Når sociale problemer er uløste trods årtiers opmærksomhed, er scepticisme rationel. Politisk apati er ikke demokratiets kerne-problem. Det er demokratiets symptom. At løse apati kræver at løse det den er et rationelt svar på: reelt valg, reelt responsivt styre, reelt meningsfulde konsekvenser af at deltage frem for at forblive passiv.',
    metadata: Object.freeze({
      concepts: ['collective_action', 'representation', 'political_legitimacy'],
      misconception_type: 'authority_bias',
      cognitive_skill: 'evaluation',
      difficulty_type: 'analytical',
      challenge_role: 'challenge',
      insight_type: 'perspective_shift',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_040',
    question: 'Kan internationale institutioner som EU underminere nationalt demokrati?',
    options: Object.freeze([
      { text: 'Ja — internationale institutioner er pr. definition udemokratiske fordi de ikke er direkte folkevalgte', misconception: 'overgeneralization — ikke alle internationale institutioner har samme demokratiske legitimationskæde', correct: false },
      { text: 'Nej — Danmark valgte selv at deltage og kan forlade EU', misconception: 'scope_confusion — frivillig indgang løser ikke det løbende demokratiske ansvarlighedsproblem', correct: false },
      { text: 'Nej — internationale institutioner beskytter demokratiet mod nationalstaternes excesses', misconception: 'overgeneralization — sandt i mange tilfælde; men ikke en altomfattende konklusion', correct: false },
      { text: 'Ja — men det afhænger af om beslutningerne er demokratisk forankret, transparente og underlagt reel politisk kontrol', misconception: null, correct: true },
    ]),
    review_text: 'EU-regulering vedtages af institutioner der er demokratisk legitimerede men på anden vis end nationale parlamenter. Er dette demokratisk underminering? Det er et ægte spørgsmål. Argumentet for: borgere kan ikke stemme direkte om EU-lovgivning der regulerer store dele af hverdagslivet. Argumentet imod: Europaparlamentet er valgt direkte, nationale regeringer er repræsenteret i Rådet, og stater valgte frivilligt at overføre suverænitet. Det er ikke et spørgsmål med ét rigtigt svar — men det er et spørgsmål alle demokratier i et globalt integreret system skal stille sig løbende. Demokratisk kontrol skal følge magt — og magt bevæger sig opad.',
    metadata: Object.freeze({
      concepts: ['representation', 'accountability', 'political_legitimacy'],
      misconception_type: 'overgeneralization',
      cognitive_skill: 'evaluation',
      difficulty_type: 'analytical',
      challenge_role: 'deep_challenge',
      insight_type: 'conceptual_bridge',
      review_text_level: 3,
    }),
  }),

]);

// ─── CHALLENGE WAVE DESIGN ────────────────────────────────────────────────────

export const CHALLENGE_WAVE_DESIGN = Object.freeze({

  DOMAIN_SUMMARY: Object.freeze({
    total_objects:       40,
    reinforcement:       9,
    challenge:          20,
    deep_challenge:     11,
    recommended_session_mix: '2 reinforcement → 3 challenge → 1 deep_challenge → 1 reinforcement → 2 challenge → 1 deep_challenge',
  }),

  OPENING_SEQUENCE: Object.freeze({
    ids:     ['dp_016', 'dp_019', 'dp_005', 'dp_001'],
    rationale: 'dp_016 grounds legitimacy as the domain\'s anchor concept. dp_019 builds foundational rights vocabulary. dp_005 introduces separation of powers with low misconception risk. dp_001 delivers first conceptual tension: leadership ≠ democracy.',
  }),

  PERSONAL_RELEVANCE_SPIKES: Object.freeze({
    ids:     ['dp_007', 'dp_021', 'dp_029', 'dp_004'],
    finding: 'Section 46 finding: a single high-relevance question extends sustained engagement by 8–12 minutes. Place one of these every 6–8 questions.',
  }),

  RECOVERY_POSITIONS: Object.freeze({
    ids:     ['dp_016', 'dp_019', 'dp_034', 'dp_036'],
    rationale: 'After a deep_challenge object, insert one reinforcement or factual object before the next deep question. Prevents cognitive overload from consecutive high-challenge items.',
  }),

  CLOSING_SEQUENCE: Object.freeze({
    ids:     ['dp_010', 'dp_035', 'dp_040'],
    rationale: 'These questions synthesise across concepts without introducing new cognitive load. Appropriate session closers — they feel conclusive rather than introducing new threads.',
  }),

  FATIGUE_PREVENTION: Object.freeze({
    rule:            'Never sequence more than two deep_challenge questions consecutively.',
    personal_spike:  'Place one personal-relevance question (dp_007, dp_021, dp_029) per 8-question window.',
    reading_signal:  'Review text reading time below 3 seconds signals disengagement — next question should be reinforcement or personal relevance.',
  }),

});

// ─── REVIEW_TEXT CRAFTSMANSHIP ─────────────────────────────────────────────────

export const REVIEW_TEXT_CRAFTSMANSHIP_48 = Object.freeze({

  DOMAIN_SIGNATURE_MOVES: Object.freeze([
    'The surprising counter-example: "Weimar-Tyskland var industrialiseret", "Nordkorea har en forfatning der beskytter frihed"',
    'The structural inversion: "ikke designet til at gøre demokrati effektivt — designet til at gøre det sikkert"',
    'The precise question that reframes: "Hvem vinder — og hvem betaler?", "Hvad forsøger dette at gøre?"',
    'The historical anchor: Napoleon/Stalin, FDR/22nd Amendment, Tocqueville/USA 1830, Weber/legitimacy types',
    'The direct address that preserves dignity: "Det er let at tænke..." not "Mange elever fejler her..."',
  ]),

  HOOK_ANALYSIS: Object.freeze({
    strongest_in_domain: Object.freeze([
      { id: 'dp_008', hook: 'En revolution erstatter personerne — men arver infrastrukturen', why: 'Immediate inversion of what students expect' },
      { id: 'dp_027', hook: 'Demokratier bryder sjældent ned på én dag. De eroderer.', why: 'Simple declarative sentence that destabilizes a naive model' },
      { id: 'dp_031', hook: 'Sovjetunionen havde en fremragende forfatning — på papiret.', why: 'Historical specificity that lands before explanation begins' },
      { id: 'dp_007', hook: 'Effektiv propaganda er ikke løgn — det er sand information strategisk udvalgt og indrammet.', why: 'Directly contradicts the intuitive model' },
    ]),
    hook_rule: 'Hook sentence ≤ 20 words. No "In this question we explore..." — open with the insight itself.',
  }),

  LEVEL_PROGRESSION: Object.freeze({
    LEVEL_0: 'Restates the correct answer. No learning.',
    LEVEL_1: 'Explains the definition. Student learns the term.',
    LEVEL_2: 'Explains the why. Student understands the purpose.',
    LEVEL_3: 'Invites reflection. Student is challenged to notice the pattern elsewhere in the world. Gold standard.',
    TARGET:  'All objects in this domain are Level 3.',
  }),

});

// ─── INTERDISCIPLINARY CONNECTIONS ────────────────────────────────────────────

export const INTERDISCIPLINARY_CONNECTIONS = Object.freeze({

  HISTORY: Object.freeze({
    objects:     ['dp_008', 'dp_009', 'dp_027', 'dp_031'],
    connections: [
      'dp_008: French Revolution → Napoleon, Russian Revolution → Stalin — structural reproduction of power',
      'dp_009: King, Gandhi, Mandela — civil disobedience conditions met and not met',
      'dp_027: Weimar collapse, Hungary 2010s, Turkey 2010s — democratic erosion pattern',
      'dp_031: Soviet constitution, North Korea constitution — text without culture',
    ],
  }),

  ECONOMICS: Object.freeze({
    objects:     ['dp_020', 'dp_037', 'dp_015'],
    connections: [
      'dp_020: Public goods theory — market failures that require democratic coordination',
      'dp_037: Lobbying asymmetry — well-funded interests vs. diffuse public interests',
      'dp_015: Princeton study on US politics — elite preferences predict outcomes better than popular opinion',
    ],
  }),

  PHILOSOPHY: Object.freeze({
    objects:     ['dp_022', 'dp_024', 'dp_025'],
    connections: [
      'dp_022: Weber\'s legitimacy types — tradition, charisma, rational-legal',
      'dp_024: Tocqueville\'s tyranny of the majority — social vs. legal dimension',
      'dp_025: Civil disobedience ethics — King, Gandhi, Rawls on moral conditions',
    ],
  }),

  MEDIA_STUDIES: Object.freeze({
    objects:     ['dp_007', 'dp_014', 'dp_021', 'dp_028', 'dp_029', 'dp_034'],
    connections: [
      'dp_007: Propaganda as selective truth — not fabrication',
      'dp_014: Journalism vs. propaganda — intent and method, not content',
      'dp_021: Echo chambers — algorithmic architecture, not personal choice',
      'dp_028: Media ownership concentration — structural capture of democratic information infrastructure',
      'dp_029: Social media incentives — outrage-optimisation vs. deliberation',
      'dp_034: Disinfo vs. misinfo — response strategy depends on intent diagnosis',
    ],
  }),

  STUDENT_DAILY_LIFE: Object.freeze({
    objects:     ['dp_004', 'dp_021', 'dp_024', 'dp_029', 'dp_036'],
    connections: [
      'dp_004: Voter turnout — students will vote for the first time within 2–4 years',
      'dp_021: Echo chambers — students experience these on TikTok and Instagram daily',
      'dp_024: Social conformity pressure — students live this in peer contexts',
      'dp_029: Social media architecture — students are inside the engagement-optimised system',
      'dp_036: Active citizenship — connects abstract democratic theory to their actual choices',
    ],
  }),

});

// ─── CONTENT QUALITY AUDIT ────────────────────────────────────────────────────

export const CONTENT_QUALITY_AUDIT = Object.freeze({

  ANTI_TRIVIA_CHECKLIST: Object.freeze([
    { criterion: 'Does the question target a real misconception, not a knowledge gap?',         verdict: 'PASS — all 40 objects authored from misconception first' },
    { criterion: 'Are all distractors plausible to a thoughtful student?',                       verdict: 'PASS — every distractor has a named misconception label' },
    { criterion: 'Does the review_text explain why the misconception felt reasonable?',          verdict: 'PASS — all at Level 3 with hook + inversion + reflection' },
    { criterion: 'Does any question feel like a pub quiz fact?',                                  verdict: 'NONE — all questions target structural understanding' },
    { criterion: 'Does any review_text start with "The correct answer is..."?',                  verdict: 'NONE — confirmed' },
    { criterion: 'Are there questions a student could answer correctly without understanding?',  verdict: 'MINIMAL — reinforcement objects can be answered by recall but review_text delivers depth regardless' },
  ]),

  SHALLOW_VS_DEEP_EXAMPLE: Object.freeze({
    topic:   'Propaganda',
    SHALLOW: Object.freeze({
      question:     'Hvad er propaganda?',
      problem:      'Tests recall of a definition. Student who memorises "biased information" passes. No understanding required.',
      review_text:  'Propaganda er information der bruges til at fremme en bestemt politisk sag.',
    }),
    DEEP: Object.freeze({
      question:     'Hvad gør propaganda mest effektiv?',
      insight:      'Forces student to think about the mechanism, not just the label. The answer challenges the "propaganda = lies" misconception.',
      review_text:  'Effektiv propaganda er ikke løgn — det er sand information strategisk udvalgt og indrammet. Propagandister vælger sandheder der bekræfter en narrativ — og udelader sandheder der modsiger den. Det gør den svær at afvise: "Men det er jo sandt!" Kritisk tænkning er ikke at identificere løgne — det er at spørge: hvad udelades?',
    }),
  }),

  DOMAIN_COVERAGE: Object.freeze({
    concepts_with_3_plus_questions: ['political_legitimacy', 'accountability', 'checks_and_balances', 'propaganda', 'minority_rights'],
    concepts_with_1_to_2_questions: ['populism', 'authoritarian_drift', 'media_and_democracy', 'civil_society', 'democratic_resilience'],
    gap_note: 'Civil society and authoritarian drift are underrepresented — strong territory for future expansion.',
  }),

});

// ─── ADAPTIVE DOMAIN RHYTHM ───────────────────────────────────────────────────

export const ADAPTIVE_DOMAIN_RHYTHM = Object.freeze({

  WAVE_ARCHITECTURE: Object.freeze({
    challenge:      'Core objects that introduce conceptual tension. Student expects one answer; the correct one requires distinction.',
    reinforcement:  'Objects that consolidate a concept already introduced. Lower distractor deception; review_text adds depth not correction.',
    deep_challenge: 'Objects that require synthesis across multiple concepts or evaluation of genuine trade-offs. Place after warm-up; never open a session.',
  }),

  EMOTIONAL_PACING: Object.freeze({
    observation: 'Section 46 simulation: single high-relevance engagement spike at minute 16 extended sustained engagement by 8–12 minutes.',
    rule:        'Personal relevance > pacing uniformity. One genuine engagement spike is more valuable than consistent moderate engagement.',
    triggers:    ['dp_007 (propaganda)', 'dp_021 (echo chambers)', 'dp_029 (social media)', 'dp_024 (conformity pressure)', 'dp_004 (voter turnout)'],
  }),

  CONCEPT_REINFORCEMENT: Object.freeze({
    pattern: 'Introduce concept → challenge with misconception → reinforce with simpler angle → deepen with synthesis',
    example: 'dp_016 (legitimacy intro) → dp_022 (legality vs legitimacy) → dp_001 (accountability) → dp_035 (resilience synthesis)',
  }),

  SESSION_SUSTAINABILITY: Object.freeze({
    max_consecutive_deep_challenge: 2,
    personal_relevance_frequency:   'Every 8 questions minimum',
    closing_question_type:          'Synthesis or reinforcement — not deep challenge',
    reading_time_threshold:         'Below 3 seconds on review_text = disengagement signal — insert recovery question',
  }),

});

// ─── FUTURE CONTENT PHILOSOPHY ────────────────────────────────────────────────

export const FUTURE_CONTENT_PHILOSOPHY = Object.freeze({

  PRINCIPLE: 'Questions that do not change understanding have no value. The standard is not "correct" — the standard is "illuminating."',

  NEXT_DOMAIN_CRITERIA: Object.freeze([
    'Misconception-dense: students have real wrong models, not just missing information',
    'Conceptually networked: concepts connect to each other and to existing domains',
    'Personally resonant: students encounter this domain in their lived experience',
    'Danish curriculum relevance: aligns with secondary education subject matter',
    'Emotionally sustainable: neither nihilistic nor falsely reassuring — honest about complexity',
  ]),

  CANDIDATE_DOMAINS: Object.freeze([
    { domain: 'Økonomi & Ulighed',     rationale: 'Misconception-dense: correlation/causation, market efficiency myths, inequality measurement' },
    { domain: 'Klima & Handling',      rationale: 'Personally resonant; rich misconceptions about individual vs structural change' },
    { domain: 'Kriminalitet & Straf',  rationale: 'Strong authority_bias misconceptions; connects to legitimacy and civil rights' },
    { domain: 'Global Magt & Geopolitik', rationale: 'Natural extension of Democracy & Power; misconceptions about sovereignty and intervention' },
  ]),

  QUALITY_GATE: Object.freeze({
    before_publishing: [
      'Does this question begin from a real student misconception?',
      'Would a thoughtful student genuinely choose a wrong answer?',
      'Does the review_text explain why the misconception was understandable?',
      'Does the review_text end with something that invites the student to notice a pattern?',
      'Has the question been read aloud to check for awkward phrasing?',
    ],
    rejection_criteria: [
      'Any distractor a student would only choose if they knew nothing',
      'Any review_text that begins with "The correct answer is"',
      'Any question that could appear unchanged in a Trivial Pursuit game',
      'Any review_text over 120 words',
    ],
  }),

  CRAFTSMANSHIP_STANDARD: 'DEN SEJE APP\'s long-term quality depends not on the number of questions but on whether each question earns its place. A domain of 40 excellent questions is worth more than 400 mediocre ones. Hold the standard.',

});

// ─── CONTENT EXPANSION TEST ───────────────────────────────────────────────────

export const CONTENT_EXPANSION_TEST = Object.freeze({

  VERIFY: Object.freeze([
    'COMPLETED_OBJECTS contains exactly 7 objects (dp_019–dp_025)',
    'EXPANDED_OBJECTS contains exactly 15 objects (dp_026–dp_040)',
    'All 22 new objects have review_text_level: 3',
    'All 22 new objects have a named misconception_type',
    'No review_text begins with "Det korrekte svar er" or "The correct answer is"',
    'All hook sentences are ≤ 20 words',
    'No two consecutive objects have challenge_role: deep_challenge',
    'CHALLENGE_WAVE_DESIGN.DOMAIN_SUMMARY.total_objects === 40',
  ]),

  DOMAIN_TOTALS: Object.freeze({
    dp_001_to_010: 'gold-standard-objects.js — 10 fully authored',
    dp_011_to_018: 'classroom-validation.js  — 8 fully authored',
    dp_019_to_025: 'content-expansion.js     — 7 newly completed',
    dp_026_to_040: 'content-expansion.js     — 15 newly authored',
    total:         40,
  }),

});
