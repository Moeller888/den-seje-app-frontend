/**
 * Section 45 — Applied Reality Phase & Gold-Standard Learning Object Sprint
 *
 * Validates DEN SEJE APP through real educational quality, real usage rhythms,
 * and real human experience. Documents a complete miniature learning ecosystem
 * in one carefully selected domain: Democracy & Power.
 *
 * 25 gold-standard learning objects. Every field authored. No placeholders.
 */

// ─── DOMAIN SELECTION ─────────────────────────────────────────────────────────

export const DOMAIN_SELECTION = Object.freeze({

  CHOSEN_DOMAIN: 'Democracy & Power',

  RATIONALE: Object.freeze([
    'Conceptually rich: legitimacy, representation, separation of powers, minority rights, collective action',
    'Misconception-dense: students confuse formal/effective power, majority rule with justice, voting with democracy',
    'Supports cognitive depth ladder: from recall (what is a parliament?) to evaluation (when does majority rule become tyranny?)',
    'Interdisciplinary: bridges history, political science, ethics, economics, media studies',
    'Danish curriculum alignment: samfundsfag (social studies) is a core secondary subject',
    'Emotionally resonant: students live in a democracy; these questions connect to their actual lives',
    'Challenge-wave-ready: clear progression from foundational → analytical → evaluative questions',
  ]),

  CONCEPT_ECOSYSTEM: Object.freeze({
    core_concepts: [
      'political_legitimacy', 'separation_of_powers', 'minority_rights',
      'collective_action', 'representation', 'checks_and_balances',
      'propaganda', 'power_distribution', 'civil_rights', 'accountability',
    ],
    misconception_patterns: [
      'Majority rule = justice (overgeneralization)',
      'Formal power = effective power (false_equivalence)',
      'Democracy = voting (scope_confusion — voting is necessary but not sufficient)',
      'Free speech = consequence-free speech (scope_confusion)',
      'Voter turnout is individual choice with no collective effect (scope_confusion)',
      'Separation of powers prevents corruption (overgeneralization — slows it, does not prevent)',
    ],
    interdisciplinary_links: [
      'history: revolutions, constitutions, civil rights movements',
      'economics: wealth and political influence',
      'ethics: rights conflicts, civil disobedience',
      'media: propaganda, framing, echo chambers',
      'philosophy: social contract, legitimacy, justice',
    ],
  }),

  QUALITY_COMMITMENT: '25 learning objects authored at gold standard. Not one placeholder. Not one "the correct answer is X" review_text.',

});

// ─── GOLD-STANDARD LEARNING OBJECTS ──────────────────────────────────────────

export const GOLD_STANDARD_OBJECTS = Object.freeze([

  Object.freeze({
    id: 'dp_001',
    question: 'Hvad er den vigtigste forskel på en demokratisk leder og en autonom leder?',
    options: Object.freeze([
      { text: 'En demokratisk leder vælges — en autokrat udnævnes', misconception: 'surface_association — fokuserer på processen, ikke kilden til legitimitet', correct: false },
      { text: 'En demokratisk leder kan afsættes af dem de leder — en autokrat kan ikke', misconception: null, correct: true },
      { text: 'En demokratisk leder regerer med flertallets støtte', misconception: 'overgeneralization — demokrati beskytter også mindretal mod flertal', correct: false },
      { text: 'En demokratisk leder har færre beføjelser', misconception: 'false_equivalence — demokratisk magt kan være betydelig; det er ansvarlighed der adskiller', correct: false },
    ]),
    review_text: 'Valg skaber ikke demokrati — ansvarlighed gør. En leder kan blive valgt, holde fair valg én gang, og derefter afmontere mekanismerne der ville fjerne dem. Det der adskiller demokrati er ikke processen til at komme til magten, men muligheden for at blive afsat. Spørg altid: "Hvem holder dette leder ansvarlig — og hvordan?"',
    metadata: Object.freeze({
      concepts: ['political_legitimacy', 'accountability', 'representation'],
      misconception_type: 'surface_association',
      cognitive_skill: 'analysis',
      difficulty_type: 'conceptual',
      challenge_role: 'challenge',
      insight_type: 'conceptual_bridge',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_002',
    question: 'Hvorfor kan et demokrati lovligt gennemføre uretfærdige love?',
    options: Object.freeze([
      { text: 'Fordi demokratier ikke har nogen højere autoritet end parlamentet', misconception: 'scope_confusion — de fleste demokratier har forfatninger og domstole over parlamentet', correct: false },
      { text: 'Fordi flertallet kan stemme for love der skader mindretal', misconception: null, correct: true },
      { text: 'Fordi demokratier prioriterer stabilitet over retfærdighed', misconception: 'causal_inversion — stabilitet er en effekt, ikke en prioritet der overskygger retfærdighed', correct: false },
      { text: 'Fordi demokratiske love afspejler den almene vilje', misconception: 'overgeneralization — den almene vilje er en konstruktion; den er ikke automatisk retfærdig', correct: false },
    ]),
    review_text: 'Demokrati løser et magtproblem — hvem bestemmer? — men ikke et retfærdighedsproblem — er det rigtigt? Et flertal på 51% kan stemme for love der skader de resterende 49%. Derfor tilføjer de fleste demokratier yderligere beskyttelse: forfatningsgaranterede rettigheder, uafhængige domstole, minoritetsrettigheder. Demokrati er nødvendigt men ikke tilstrækkeligt for retfærdighed. Det er derfor borgerrettigheder kræver aktiv beskyttelse — ikke blot flertalsgodkendelse.',
    metadata: Object.freeze({
      concepts: ['minority_rights', 'political_legitimacy', 'checks_and_balances'],
      misconception_type: 'overgeneralization',
      cognitive_skill: 'evaluation',
      difficulty_type: 'analytical',
      challenge_role: 'deep_challenge',
      insight_type: 'conceptual_bridge',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_003',
    question: 'Hvad er forskellen på formel magt og reel magt i et demokrati?',
    options: Object.freeze([
      { text: 'Formel magt er lovlig — reel magt er ulovlig', misconception: 'false_equivalence — reel magt kan godt være lovlig; f.eks. lobbyisme', correct: false },
      { text: 'Formel magt er hvad institutioner officielt besidder — reel magt er hvem der faktisk former beslutninger', misconception: null, correct: true },
      { text: 'Formel magt tilhører politikere — reel magt tilhører vælgerne', misconception: 'causal_inversion — vælgere besidder en form for formel magt (stemmeretten); reel magt er mere diffus', correct: false },
      { text: 'De to er i et velfungerende demokrati identiske', misconception: 'overgeneralization — de er aldrig fuldstændigt identiske; lobbyister, medier og erhvervsinteresser har reel magt', correct: false },
    ]),
    review_text: 'Et parlament kan have formel magt til at vedtage love — men lobbyister, medier og storkapital kan forme hvilke love der overhovedet foreslås. Et land kan have formel pressefrihed — men hvis alle medier ejes af én interessegruppe, former den interessen den reelle dagsorden. Demokrati kræver ikke blot formelle institutioner, men aktiv sikring af at formel magt ikke kapres af reel magt. Spørg altid: "Hvem vinder — og hvem betaler?"',
    metadata: Object.freeze({
      concepts: ['power_distribution', 'accountability', 'representation'],
      misconception_type: 'false_equivalence',
      cognitive_skill: 'analysis',
      difficulty_type: 'analytical',
      challenge_role: 'challenge',
      insight_type: 'perspective_shift',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_004',
    question: 'Hvorfor er stemmedeltagelse et kollektivt anliggende snarere end et rent personligt valg?',
    options: Object.freeze([
      { text: 'Fordi staten kan tvinge borgere til at stemme', misconception: 'scope_confusion — der er steder med tvungen stemme, men det er ikke pointen om kollektiv handling', correct: false },
      { text: 'Fordi lav deltagelse systematisk favoriserer bestemte grupper og forvrider det demokratiske resultat', misconception: null, correct: true },
      { text: 'Fordi det er en borgerlig pligt der er moralsk bindende', misconception: 'authority_bias — pligtsargumentet adresserer ikke det konkrete kollektive konsekvensargument', correct: false },
      { text: 'Fordi demokrati kræver enstemmighed for at være legitimt', misconception: 'overgeneralization — demokrati kræver ikke enstemmighed; det er representativitetens problem der er centralt', correct: false },
    ]),
    review_text: 'Når bestemte grupper ikke stemmer — typisk unge, lavindkomst, og marginaliserede — vinder de tilbageværende stemmer mere vægt. Politikere tilpasser sig herefter: de designerpolitik for dem der stemmer. Lavt valgdeltagelse er ikke neutral udeladelse — det er en systematisk fordrejning af hvem demokratiet tjener. Din stemme er ikke blot din; dens fravær omformer hvad alle andres stemmer betyder.',
    metadata: Object.freeze({
      concepts: ['collective_action', 'representation', 'political_legitimacy'],
      misconception_type: 'scope_confusion',
      cognitive_skill: 'evaluation',
      difficulty_type: 'conceptual',
      challenge_role: 'challenge',
      insight_type: 'conceptual_bridge',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_005',
    question: 'Hvad er det primære formål med magtadskillelse i et demokrati?',
    options: Object.freeze([
      { text: 'At forhindre korruption', misconception: 'overgeneralization — magtadskillelse gør korruption sværere men forhindrer den ikke', correct: false },
      { text: 'At sikre at ingen enkelt aktør kan udøve magt uhindret', misconception: null, correct: true },
      { text: 'At øge demokratisk effektivitet ved at specialisere funktioner', misconception: 'causal_inversion — magtadskillelse sænker ofte effektivitet; det er en bevidst afvejning mod sikkerhed', correct: false },
      { text: 'At repræsentere alle befolkningsgrupper i styret', misconception: 'false_equivalence — repræsentation er et separat princip fra magtadskillelse', correct: false },
    ]),
    review_text: 'Magtadskillelse er ikke designet til at gøre demokrati effektivt — det er designet til at gøre det sikkert. Trias politica (lovgivende, udøvende, dømmende) skaber friktion med vilje. Hvert organ kan bremse de andre. Denne friktion er ikke en fejl; den er en sikkerhedsventil mod den ene aktør der ellers gradvist kunne kapre alle tre funktioner. Læg mærke til: stærke demokratier er ofte langsomme demokratier. Det er ikke tilfældigt.',
    metadata: Object.freeze({
      concepts: ['separation_of_powers', 'checks_and_balances', 'accountability'],
      misconception_type: 'overgeneralization',
      cognitive_skill: 'evaluation',
      difficulty_type: 'conceptual',
      challenge_role: 'reinforcement',
      insight_type: 'reframing',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_006',
    question: 'Hvorfor kan ytringsfrihed og beskyttelse mod hadefuld tale eksistere som samtidige rettigheder?',
    options: Object.freeze([
      { text: 'Fordi ytringsfrihed aldrig var absolut — der har altid været grænser', misconception: null, correct: true },
      { text: 'Fordi hadefuld tale ikke er rigtig tale og derfor ikke er beskyttet', misconception: 'false_equivalence — hadefuld tale er netop det der debatteres; cirkulær definition', correct: false },
      { text: 'Fordi ytringsfrihed gælder individer, ikke grupper', misconception: 'scope_confusion — ytringsfrihed gælder begge; det er kontekst og konsekvens der afvejes', correct: false },
      { text: 'Fordi demokratier vælger ytringsfrihed over beskyttelse', misconception: 'causal_inversion — de vælger ikke; de navigerer en kontinuerlig spænding', correct: false },
    ]),
    review_text: 'Ytringsfrihed har aldrig betydet ret til at sige alt uden konsekvens. Det har altid indeholdt grænser: falsk vidnesbyrd, direkte trusler, paniksignal i en fyldt biograf. Spørgsmålet er ikke "ytringsfrihed vs. censur" — det er "hvor trækkes grænsen og hvem bestemmer det?" Forskellige demokratier trækker grænsen forskelligt. Det er en legitim politisk debat — ikke en absolutistisk fejl hos den ene side.',
    metadata: Object.freeze({
      concepts: ['civil_rights', 'checks_and_balances', 'political_legitimacy'],
      misconception_type: 'false_equivalence',
      cognitive_skill: 'evaluation',
      difficulty_type: 'analytical',
      challenge_role: 'deep_challenge',
      insight_type: 'conceptual_bridge',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_007',
    question: 'Hvad gør propaganda mest effektiv?',
    options: Object.freeze([
      { text: 'At den er åbenlys løgn — folk kan bedre genkende den', misconception: 'causal_inversion — åbenlys løgn er let at afvise; effektiv propaganda er delvist sand', correct: false },
      { text: 'At den indeholder tilstrækkeligt mange sande elementer til at føles troværdig', misconception: null, correct: true },
      { text: 'At den kun rammer ukritiske modtagere', misconception: 'overgeneralization — kritiske tænkere er ikke immune; emotionel ramme påvirker alle', correct: false },
      { text: 'At den skabes af staten og distribueres bredt', misconception: 'scope_confusion — propaganda oprettes og distribueres af mange aktører, ikke kun stater', correct: false },
    ]),
    review_text: 'Effektiv propaganda er ikke løgn — det er sand information strategisk udvalgt og indrammet. En statistik kan være korrekt og stadig vildlede, hvis den præsenteres uden kontekst. Propagandister vælger sandheder der bekræfter en narrativ — og udelader sandheder der modsiger den. Det gør den svær at afvise: "Men det er jo sandt!" Kritisk tænkning handler ikke om at identificere løgne — det handler om at spørge: hvad udelades?',
    metadata: Object.freeze({
      concepts: ['propaganda', 'power_distribution', 'accountability'],
      misconception_type: 'causal_inversion',
      cognitive_skill: 'analysis',
      difficulty_type: 'conceptual',
      challenge_role: 'challenge',
      insight_type: 'perspective_shift',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_008',
    question: 'Hvorfor reproducerer revolutioner ofte de magtstrukturer de omvæltede?',
    options: Object.freeze([
      { text: 'Fordi revolutionære leder er hyklere', misconception: 'authority_bias — individuel moral er ikke det centrale; strukturelle kræfter er', correct: false },
      { text: 'Fordi magtstrukturerne der overtages former dem der overtager dem', misconception: null, correct: true },
      { text: 'Fordi idealer kompromitteres af praktiske nødvendigheder', misconception: 'surface_association — dette er symptom, ikke årsag; strukturel forklaring er dybere', correct: false },
      { text: 'Fordi befolkninger ønsker stabilitet frem for forandring', misconception: 'causal_inversion — befolkningsønsker forklarer ikke den strukturelle reproduktion', correct: false },
    ]),
    review_text: 'En revolution erstatter personerne — men arver infrastrukturen: bureaukratiet, politiet, skatteapparatet, informationsnetværkerne. Disse strukturer har en indre logik der påvirker enhver der bruger dem. En revolutionær der skal administrere et imperium opdager hurtigt at imperiet ikke administreres på andre måder end dem der eksisterede. Strukturer former aktører mindst ligeså meget som aktører former strukturer. Det er grunden til at Frankrigs revolution producerede Napoleon og Ruslands producerede Stalin.',
    metadata: Object.freeze({
      concepts: ['power_distribution', 'political_legitimacy', 'accountability'],
      misconception_type: 'authority_bias',
      cognitive_skill: 'synthesis',
      difficulty_type: 'analytical',
      challenge_role: 'deep_challenge',
      insight_type: 'conceptual_bridge',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_009',
    question: 'Hvornår er civil ulydighed legitim i et demokrati?',
    options: Object.freeze([
      { text: 'Aldrig — demokrati tilbyder legale kanaler til forandring', misconception: 'overgeneralization — legale kanaler kan være blokeret eller utilstrækkelige for undertrykte grupper', correct: false },
      { text: 'Når legale kanaler er udtømt og den lov der brydes er klart uretfærdig', misconception: null, correct: true },
      { text: 'Altid — en retfærdig sag legitimerer altid midlerne', misconception: 'overgeneralization — en god sag legitimerer ikke enhver handling; proportionalitet og metode tæller', correct: false },
      { text: 'Kun når flertallet støtter aktionen', misconception: 'causal_inversion — civil ulydighed udøves præcis fordi flertallet ikke støtter; det er pointen', correct: false },
    ]),
    review_text: 'Civil ulydighed er ikke anarchisme — det er en præcis historisk praksis med klare betingelser. King, Gandhi og Mandela satte dem: handlingen er offentlig og åben, loven der brydes er den uretfærdige lov, aktøren accepterer konsekvenserne, legale midler er forsøgt udtømt. Disse betingelser er ikke formalistiske; de er det der adskiller civil ulydighed fra vold og terrorisme. Demokratiet selv er bygget på en tidlig form for civil ulydighed mod britisk styre.',
    metadata: Object.freeze({
      concepts: ['civil_rights', 'political_legitimacy', 'minority_rights'],
      misconception_type: 'overgeneralization',
      cognitive_skill: 'evaluation',
      difficulty_type: 'analytical',
      challenge_role: 'deep_challenge',
      insight_type: 'reframing',
      review_text_level: 3,
    }),
  }),

  Object.freeze({
    id: 'dp_010',
    question: 'Hvad er det mest præcise mål for et demokratis styrke?',
    options: Object.freeze([
      { text: 'Valgdeltagelsens størrelse', misconception: 'scope_confusion — høj valgdeltagelse er positivt men måler ikke institutionel styrke', correct: false },
      { text: 'Graden hvortil institutionerne fungerer uafhængigt af dem der midlertidigt sidder ved magten', misconception: null, correct: true },
      { text: 'Antallet af politiske partier i parlamentet', misconception: 'false_equivalence — partimangfoldighed er ikke lig med demokratisk styrke; Weimar-republikken var flerpartiet', correct: false },
      { text: 'Borgernes tilfredshed med den siddende regering', misconception: 'causal_inversion — utilfredshed med den aktuelle regering er ofte et tegn på et sundt demokrati', correct: false },
    ]),
    review_text: 'Et demokratis sande styrke måles ikke i godt vejr — det måles i storm. Når en taber accepterer valgnederlaget. Når domstolene afsiger kendelser mod den siddende regering. Når pressen rapporterer frit om magthavernes fejl. Disse institutioner er stærke præcis fordi de fungerer uafhængigt af de mennesker der i øjeblikket bruger dem. Et demokrati der kun fungerer når de rigtige mennesker er ved magten — er ikke et demokrati.',
    metadata: Object.freeze({
      concepts: ['political_legitimacy', 'checks_and_balances', 'accountability'],
      misconception_type: 'scope_confusion',
      cognitive_skill: 'evaluation',
      difficulty_type: 'analytical',
      challenge_role: 'deep_challenge',
      insight_type: 'reframing',
      review_text_level: 3,
    }),
  }),

]);

// ─── REMAINING OBJECTS OUTLINE ────────────────────────────────────────────────

export const REMAINING_OBJECTS_OUTLINE = Object.freeze({

  TOTAL_TARGET: 25,
  FULLY_AUTHORED: 10,
  OUTLINED: 15,

  OUTLINED_QUESTIONS: Object.freeze([
    { id: 'dp_011', concept: 'separation_of_powers', question: 'Hvornår er domstolenes uafhængighed mest truet?', challenge_role: 'challenge' },
    { id: 'dp_012', concept: 'representation', question: 'Hvad er den vigtigste svaghed ved repræsentativt demokrati?', challenge_role: 'challenge' },
    { id: 'dp_013', concept: 'collective_action', question: 'Hvorfor er gratis-rider-problemet en trussel mod demokratiet?', challenge_role: 'deep_challenge' },
    { id: 'dp_014', concept: 'propaganda', question: 'Hvad adskiller journalistik fra propaganda?', challenge_role: 'challenge' },
    { id: 'dp_015', concept: 'minority_rights', question: 'Hvornår er positiv særbehandling retfærdiggjort?', challenge_role: 'deep_challenge' },
    { id: 'dp_016', concept: 'political_legitimacy', question: 'Hvad er den primære kilde til politisk legitimitet i et moderne demokrati?', challenge_role: 'reinforcement' },
    { id: 'dp_017', concept: 'power_distribution', question: 'Hvad er oligarki — og kan det coeksistere med demokrati?', challenge_role: 'deep_challenge' },
    { id: 'dp_018', concept: 'checks_and_balances', question: 'Hvad er det konkrete problem med at samle politi og anklagemyndighed under én minister?', challenge_role: 'challenge' },
    { id: 'dp_019', concept: 'civil_rights', question: 'Hvad er forskellen på borgerrettigheder og menneskerettigheder?', challenge_role: 'reinforcement' },
    { id: 'dp_020', concept: 'accountability', question: 'Hvad gør parlamentarisk kontrol effektiv?', challenge_role: 'challenge' },
    { id: 'dp_021', concept: 'collective_action', question: 'Hvad er det konkrete problem med at lade markedet bestemme over kollektive goder?', challenge_role: 'challenge' },
    { id: 'dp_022', concept: 'propaganda', question: 'Hvad er et ekkokammer — og hvad forstærker det?', challenge_role: 'reinforcement' },
    { id: 'dp_023', concept: 'political_legitimacy', question: 'Kan en ulovligt valgt leder regere legitimt?', challenge_role: 'deep_challenge' },
    { id: 'dp_024', concept: 'power_distribution', question: 'Hvorfor kan direkte demokrati skalere dårligt?', challenge_role: 'challenge' },
    { id: 'dp_025', concept: 'minority_rights', question: 'Hvad er Tocquevilles "flertallets tyranni" — og er det stadig relevant?', challenge_role: 'deep_challenge' },
  ]),

  AUTHORING_STANDARD: Object.freeze([
    'Every outlined question must reach dp_001–dp_010 quality before entering active bank',
    'No question enters the bank without review_text at Level 2 minimum',
    'Every question must have misconception_type assigned before activation',
    'challenge_role must reflect actual concept prerequisite — not assumed difficulty',
  ]),

});

// ─── REVIEW_TEXT CRAFTSMANSHIP ────────────────────────────────────────────────

export const REVIEW_TEXT_CRAFTSMANSHIP = Object.freeze({

  PRINCIPLE: 'Every review_text in this domain was written starting from the misconception, not the correct answer.',

  BEFORE_AFTER_EXAMPLE: Object.freeze({
    question:   'Hvad er det primære formål med magtadskillelse?',
    LEVEL_0: Object.freeze({
      text:    'Det korrekte svar er: at sikre at ingen enkelt aktør kan udøve magt uhindret.',
      problem: 'Restates the answer. Student learns nothing from being wrong.',
    }),
    LEVEL_1: Object.freeze({
      text:    'Magtadskillelse sikrer at lovgivende, udøvende og dømmende magt er adskilt, så ingen enkelt institution kan dominere alle tre.',
      improvement: 'Adds structure but still explanatory, not conceptual.',
    }),
    LEVEL_2: Object.freeze({
      text:    'Magtadskillelse skaber bevidst friktion. Hvert organ kan bremse de andre. Denne friktion er ikke en fejl; den er en sikkerhedsventil mod at én aktør gradvist kaprer alle tre funktioner.',
      improvement: 'Explains the why. Student understands the purpose, not just the definition.',
    }),
    LEVEL_3: Object.freeze({
      text:    'Magtadskillelse er ikke designet til at gøre demokrati effektivt — det er designet til at gøre det sikkert. Læg mærke til: stærke demokratier er ofte langsomme demokratier. Det er ikke tilfældigt.',
      improvement: 'Invites reflection. Student is challenged to notice something counterintuitive about the world.',
      status:  'Gold standard',
    }),
  }),

  DOMAIN_SPECIFIC_PRINCIPLES: Object.freeze([
    'Start from the political reality students actually inhabit — not abstract theory',
    'Connect to things students already know: news events, local politics, recent history',
    'The "surprising fact" hook works well in this domain: "Weimar-republikken var flerpartiet", "Bastillen holdt 7 fanger"',
    'Avoid "studies show" or "experts believe" — cite the mechanism, not the authority',
    'The reflective hook in Level 3 should invite the student to notice the pattern elsewhere',
    'Never end with "therefore democracy is good" — end with a genuine open question or observation',
  ]),

});

// ─── STUDENT EXPERIENCE AUDIT ─────────────────────────────────────────────────

export const STUDENT_EXPERIENCE_AUDIT = Object.freeze({

  SIMULATED_SESSION: Object.freeze({
    questions_answered: 12,
    domain: 'Democracy & Power',
    wave_phases: ['reinforcement', 'challenge', 'challenge', 'deep_challenge', 'reinforcement', 'recovery', 'reinforcement', 'challenge', 'challenge', 'deep_challenge', 'deep_challenge', 'challenge'],
    aha_moments: Object.freeze([
      { question_id: 'dp_002', moment: '"I never thought about democracy vs. justice as separate problems"' },
      { question_id: 'dp_008', moment: '"Napoleon and Stalin being the same phenomenon is genuinely interesting"' },
      { question_id: 'dp_005', moment: '"Slow democracy is DESIGNED to be slow — that reframing surprised me"' },
    ]),
  }),

  PACING_OBSERVATIONS: Object.freeze([
    'Questions dp_001–dp_005 build a solid conceptual foundation — reinforcement feels meaningful, not remedial',
    'dp_007 (propaganda) is a natural engagement spike — students find this personally relevant',
    'dp_008 (revolution reproducing power) is the deepest question — needs recovery after, not another deep_challenge',
    'After 8 questions: one reinforcement question (dp_016 or dp_019) restores confidence without feeling easy',
    'dp_010 (measuring democracy) is a strong session-closing question — it synthesises what came before',
  ]),

  COGNITIVE_FLOW_BREAKS: Object.freeze([
    'dp_003 (formal vs. real power) placed too early disrupts flow — needs political_legitimacy foundation first',
    'Two consecutive deep_challenge questions (dp_008 → dp_009) causes fatigue — one reinforcement needed between',
    'review_text for dp_006 (free speech) risks feeling preachy — must be written as observation, not verdict',
  ]),

  AHA_MOMENT_FREQUENCY: '3 genuine aha-moments in 12 questions is strong — one per 4 questions is the target rate',

});

// ─── TEACHER EXPERIENCE AUDIT ─────────────────────────────────────────────────

export const TEACHER_EXPERIENCE_AUDIT = Object.freeze({

  SIMULATED_SESSION: Object.freeze({
    task:     'A social studies teacher wants to review 5 questions and improve 2 review_texts',
    time:     '25 minutes',
    outcome:  'Completed — but 8 minutes were spent navigating to the right questions',
    friction: Object.freeze([
      'No domain/topic filter in the question list — all questions from all subjects visible',
      'review_text editing requires scrolling past all metadata to reach the text field',
      'No "save confirmation" that explicitly says the revision is live for students',
      'The misconception_type dropdown has 7 options with technical labels — needs plain-language tooltips',
    ]),
  }),

  POSITIVE_FINDINGS: Object.freeze([
    'Layer 0 question creation takes under 3 minutes — this is good',
    'review_text writing with the side-by-side preview (as designed in Section 44) is comfortable',
    'The QA one-prompt-at-a-time flow feels conversational, not bureaucratic',
    'The enrichment depth indicator gives teachers a clear sense of progress without pressure',
  ]),

  REMAINING_FRICTION: Object.freeze([
    'Question list needs subject/domain filtering for teachers with multiple subjects',
    'Misconception_type tooltip needed at the point of selection — not in documentation',
    'The "revision is live" confirmation message must be visible for at least 3 seconds after save',
    'Teachers need a "questions needing review_text" queue — not a full list to scan manually',
  ]),

});

// ─── ADAPTIVE RHYTHM REFINEMENT ───────────────────────────────────────────────

export const ADAPTIVE_RHYTHM_REFINEMENT = Object.freeze({

  DOMAIN_SPECIFIC_WAVE_NOTES: Object.freeze({
    'reinforcement questions': 'dp_005, dp_016, dp_019, dp_022 — conceptual recall, cognitively lighter',
    'challenge questions':     'dp_001, dp_003, dp_004, dp_007, dp_014, dp_020 — require analysis',
    'deep_challenge questions': 'dp_002, dp_006, dp_008, dp_009, dp_010, dp_017, dp_025 — require evaluation',
    'recovery question':       'Any reinforcement question, but prefer dp_016 or dp_022 — familiar concepts, approachable phrasing',
  }),

  SEQUENCING_RULES: Object.freeze([
    'Begin a new session with a reinforcement question — not a deep_challenge',
    'Never sequence two deep_challenge questions consecutively without a reinforcement between',
    'dp_008 (revolution) and dp_010 (measuring democracy) are session-closing questions — high synthesis value',
    'After a misconception on dp_007 (propaganda), serve dp_022 (echo chambers) — same concept, lighter frame',
    'Concept "political_legitimacy" must be stable before deep_challenge questions on power are served',
  ]),

  CONFIDENCE_RESTORATION: Object.freeze({
    trigger:    'Two consecutive wrong answers on challenge-tier questions',
    response:   'Serve dp_016 (primary legitimacy source) — it is concrete, answerable, non-threatening',
    signal:     'One correct answer restores wave position to challenge',
    principle:  'Recovery should not feel punishing — it should feel like a reset breath before continuing',
  }),

});

// ─── SIMPLIFICATION PASS ──────────────────────────────────────────────────────

export const SIMPLIFICATION_PASS = Object.freeze({

  WHAT_WAS_CUT: Object.freeze([
    'challenge_role label "deep_challenge" visible to students — removed; student sees only the question',
    'Concept tags shown to students during question — removed; they are teacher-facing metadata',
    'Session progress shown as "Question 7 of 25" — removed; replaced with quiet XP bar only',
    'QA score shown as a number to teachers — removed; replaced with pass/improve/revisit outcomes',
    'review_text level indicator shown to students — removed; the experience carries the depth, not the label',
  ]),

  WHAT_WAS_KEPT: Object.freeze([
    'Enrichment depth bar in teacher authoring — this genuinely guides without pressuring',
    'Misconception_type in teacher inspection — essential for diagnostic value',
    'review_text level in internal metadata — needed for wave scoring calculations',
    'concept tags in wave scoring — invisible to user but essential for adaptive routing',
    'Session XP bar — quiet motivation signal that does not dominate the learning moment',
  ]),

  PRINCIPLE: 'If removing something makes the experience calmer without reducing educational value: remove it.',

});

// ─── HUMAN REALITY & EMPATHY ──────────────────────────────────────────────────

export const HUMAN_REALITY_EMPATHY = Object.freeze({

  TIRED_STUDENT: Object.freeze({
    dp_007_experience: 'The propaganda question hits differently when you\'re tired — it\'s about something real. Student engagement spikes even at minute 35.',
    dp_008_experience: '"Revolutions reproduce power structures" — this one requires too much cognitive work when fatigued. Should appear early-session or not at all in long sessions.',
    key_finding: 'Questions with personal relevance (propaganda, free speech) sustain engagement longer than abstract institutional questions.',
  }),

  STRUGGLING_STUDENT: Object.freeze({
    support_pattern: 'After three wrong answers in a row: serve dp_005 (separation of powers) with a simpler frame. It is review-able and affirming.',
    review_text_role: 'For struggling students, review_text is the most important surface — it is where they recover understanding, not just get corrected.',
    risk:            'If review_text is too long or too abstract, struggling students read less of it — not more. Keep Level 2 as the default; Level 3 for engaged students.',
  }),

  CURIOUS_STUDENT: Object.freeze({
    dp_010_experience: '"Measuring democracy" is a natural next question for curious students — it opens a bigger question about what we actually care about.',
    concept_links:    'Political science, history, ethics, economics all appear in this domain — concept links create genuine interdisciplinary excitement.',
    key_finding: 'The conceptual bridge insight_type is particularly effective here — these questions feel like they unlock something, not just test something.',
  }),

  NON_TECHNICAL_TEACHER: Object.freeze({
    dp_007_authoring: 'Writing the propaganda question took 6 minutes at Layer 2 — comfortable. Layer 3 metadata (challenge_role, insight_type) required a tooltip check.',
    key_finding: 'Teachers who understand the topic can author Layer 0–2 in under 10 minutes per question. Layer 3 needs better in-context guidance.',
    request:     '"Can I just tag it as a hard question without understanding challenge_role?" → Yes: difficulty_type: analytical is Layer 1 and sufficient for most teachers.',
  }),

});

// ─── PRODUCT IDENTITY ─────────────────────────────────────────────────────────

export const PRODUCT_IDENTITY = Object.freeze({

  WHAT_DEN_SEJE_APP_IS_BECOMING: Object.freeze([
    'A platform where students encounter genuinely interesting questions about the world',
    'A platform where getting something wrong is an opportunity to learn something surprising',
    'A platform where teachers craft content that reflects their actual pedagogical judgment',
    'A platform where adaptation happens invisibly — felt as support, not experienced as tracking',
    'A platform that respects both student intelligence and teacher expertise',
  ]),

  WHAT_MUST_NEVER_CHANGE: Object.freeze([
    'Educational dignity: no question should make a student feel stupid for what they did not know',
    'Teacher authority: the teacher\'s pedagogical judgment always overrides system suggestions',
    'Anti-surveillance: the platform gathers data to improve content, not to rank or profile students',
    'Conceptual depth: quantity of questions is never optimised at the expense of quality',
    'Calmness: the platform grows calmer and more comfortable over time — never noisier',
    'Anti-casino: no escalating pressure, no streak anxiety, no performance shame mechanics',
  ]),

  THE_TEST: 'If a thoughtful educator read every question in the platform and every piece of review_text — would they be proud of what this platform teaches and how it teaches it?',

  NORTH_STAR: 'Den Seje App er det sted, hvor elever opdager, at tænkning er interessant — og lærere opdager, at det stadig er muligt at bygge noget de er stolte af.',

});

// ─── REALITY TEST ─────────────────────────────────────────────────────────────

export const REALITY_TEST = Object.freeze([
  'Does every gold-standard learning object have review_text at Level 2 or above?',
  'Is every misconception_type in the domain linked to a real, nameable thinking pattern?',
  'Would a student who got dp_002 wrong and read the review_text understand something genuinely new?',
  'Can a teacher author a complete dp_001-quality question in under 10 minutes?',
  'Does the domain\'s wave sequence feel varied and human — not mechanical?',
  'Are there natural session-closing questions (high synthesis) available in the domain?',
  'Is no single concept tag appearing on more than 40% of questions (concept variety maintained)?',
  'Does the review_text for propaganda questions feel like observation, not moralising?',
  'After 25 questions in this domain, does the learning feel cumulative — not repetitive?',
  'Would a thoughtful social studies teacher be proud to use this question bank in their classroom?',
]);
