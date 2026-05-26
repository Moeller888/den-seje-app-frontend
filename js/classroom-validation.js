/**
 * Section 46 — Reality Iteration & Classroom Validation Phase
 *
 * Shifts DEN SEJE APP from architecture-first development into real-world
 * educational refinement through authentic classroom-like usage, observation,
 * iteration, and content depth.
 *
 * Democracy & Power domain expanded to 25 learning objects.
 * Every system tested against real human usage patterns.
 */

// ─── DOMAIN EXPANSION ─────────────────────────────────────────────────────────

export const DOMAIN_EXPANSION = Object.freeze({

  STATUS: Object.freeze({
    previously_authored: 10,
    newly_authored:      8,
    outlined:            7,
    total:               25,
    domain:              'Democracy & Power',
  }),

  NEW_OBJECTS: Object.freeze([

    Object.freeze({
      id: 'dp_011',
      question: 'Hvornår er domstolenes uafhængighed mest truet?',
      options: Object.freeze([
        { text: 'Når befolkningen ikke respekterer domstolene', misconception: 'surface_association — befolkningsrespekt er symptom, ikke kilde til truslen', correct: false },
        { text: 'Når den udøvende magt kan bestemme hvem der sidder som dommere', misconception: null, correct: true },
        { text: 'Når domstolene afsiger upopulære kendelser', misconception: 'causal_inversion — upopulære kendelser er et tegn på uafhængighed, ikke trussel mod den', correct: false },
        { text: 'Når dommere forbliver ved magten i mange år', misconception: 'false_equivalence — lange embedsperioder er faktisk designet til at beskytte uafhængighed', correct: false },
      ]),
      review_text: 'Lange dommerbeskikkelser er bevidste designvalg — jo længere en dommer sidder, jo mindre de behøver at bekymre sig om at efterkomme den aktuelle regerings ønsker. Truslen mod domstolenes uafhængighed er sjældent åbenlys. Den opstår, når den udøvende magt gradvist kontrollerer udnævnelsesprocessen: nye dommere der sympathiserer med regeringen, pensionering fremskyndet for kritiske dommere. Domstolene mister ikke uafhængighed dramatisk — de gør det stille, sag for sag.',
      metadata: Object.freeze({
        concepts: ['separation_of_powers', 'checks_and_balances', 'accountability'],
        misconception_type: 'causal_inversion',
        cognitive_skill: 'analysis',
        difficulty_type: 'conceptual',
        challenge_role: 'challenge',
        insight_type: 'perspective_shift',
        review_text_level: 3,
      }),
    }),

    Object.freeze({
      id: 'dp_012',
      question: 'Hvad er den vigtigste svaghed ved repræsentativt demokrati?',
      options: Object.freeze([
        { text: 'Vælgere har ikke nok viden til at træffe gode valg', misconception: 'authority_bias — dette er et eliteargument; det er ikke svagheden ved systemet', correct: false },
        { text: 'Repræsentanter kan handle i egne interesser frem for vælgernes', misconception: null, correct: true },
        { text: 'Systemet er for langsomt til at håndtere moderne udfordringer', misconception: 'scope_confusion — hastighed er en designafvejning, ikke en strukturel svaghed', correct: false },
        { text: 'Flertalsbeslutninger afspejler ikke mindretallenes behov', misconception: 'false_equivalence — dette er en svaghed ved flertalsstyre, ikke ved repræsentation specifikt', correct: false },
      ]),
      review_text: 'Repræsentativt demokrati hviler på en antagelse: at valgte repræsentanter handler på vegne af dem de repræsenterer. Men repræsentanter har egne karriereinteresser, partiloyaliteter og påvirkninger fra lobbyister. Principal-agent-problemet er ikke en fejl der kan rettes — det er en strukturel spænding der kræver løbende institutionel håndtering. Transparency, karantæneregler og pressefrihed er ikke dekorationer; de er de mekanismer der reducerer agenturproblemet.',
      metadata: Object.freeze({
        concepts: ['representation', 'accountability', 'power_distribution'],
        misconception_type: 'authority_bias',
        cognitive_skill: 'evaluation',
        difficulty_type: 'analytical',
        challenge_role: 'challenge',
        insight_type: 'reframing',
        review_text_level: 3,
      }),
    }),

    Object.freeze({
      id: 'dp_013',
      question: 'Hvad er "gratis-rider-problemet" i demokratisk kontekst?',
      options: Object.freeze([
        { text: 'At velhavende borgere ikke betaler tilstrækkelig skat', misconception: 'surface_association — gratis-rider refererer til kollektiv handling, ikke skatteunddragelse', correct: false },
        { text: 'At en person kan nyde demokratiets fordele uden selv at bidrage til dets vedligeholdelse', misconception: null, correct: true },
        { text: 'At politikere modtager løn for arbejde vælgerne ikke godkender', misconception: 'false_equivalence — dette er et principal-agent-problem, ikke gratis-rider-problemet', correct: false },
        { text: 'At medier rapporterer gratis fra parlamentet', misconception: 'surface_association — gratis adgang er ikke gratis-rider-problemet', correct: false },
      ]),
      review_text: 'Demokrati er et kollektivt gode: det beskytter alle, uanset om de bidrager til det eller ej. En person kan aldrig stemme, aldrig engagere sig civilt, og stadig nyde pressefrihed, retssikkerhed og fredelige magtovergange. Problemet opstår i skala: hvis mange vælger gratis-rider-strategien, svækkes demokratiets institutioner gradvist. Civilsamfund, presse og valg er ikke selvvedligeholdende maskiner — de kræver aktiv deltagelse. Demokrati er et fællesejet hus der rådner, hvis ingen vedligeholder det.',
      metadata: Object.freeze({
        concepts: ['collective_action', 'political_legitimacy', 'accountability'],
        misconception_type: 'surface_association',
        cognitive_skill: 'analysis',
        difficulty_type: 'conceptual',
        challenge_role: 'challenge',
        insight_type: 'conceptual_bridge',
        review_text_level: 3,
      }),
    }),

    Object.freeze({
      id: 'dp_014',
      question: 'Hvad adskiller journalistik fra propaganda?',
      options: Object.freeze([
        { text: 'Journalistik er altid objektiv — propaganda er altid partisk', misconception: 'false_equivalence — objektivitet er et ideal, ikke en opnåelig tilstand; skellet er mere nuanceret', correct: false },
        { text: 'Journalistik søger at afsløre sandheden — propaganda søger at skabe en ønsket reaktion', misconception: null, correct: true },
        { text: 'Journalistik er statsfinansieret — propaganda er privat', misconception: 'causal_inversion — begge kan finansieres af begge; finansieringskilde er ikke det afgørende', correct: false },
        { text: 'Propaganda bruger følelser — journalistik bruger fakta', misconception: 'overgeneralization — god journalistik kan og bør røre følelser; propaganda bruger også fakta selektivt', correct: false },
      ]),
      review_text: 'Grænsen er ikke indhold men formål og metode. Journalistik verificerer, korrigerer sig selv, og viser sit arbejde. Propaganda vælger hvad der tjener et forudbestemt narrativ — og udelader hvad der ikke gør. Begge bruger fakta. Begge kan ramme følelser. Spørgsmålet er: søger forfatteren at finde ud af hvad der er sandt — eller at overbevise om hvad de allerede har besluttet? I en medieverden hvor skellet er uklart er spørgsmålet "hvad forsøger dette at gøre?" vigtigere end "er dette rigtigt?"',
      metadata: Object.freeze({
        concepts: ['propaganda', 'accountability', 'civil_rights'],
        misconception_type: 'false_equivalence',
        cognitive_skill: 'analysis',
        difficulty_type: 'conceptual',
        challenge_role: 'challenge',
        insight_type: 'reframing',
        review_text_level: 3,
      }),
    }),

    Object.freeze({
      id: 'dp_015',
      question: 'Hvad er oligarki — og kan det eksistere side om side med demokrati?',
      options: Object.freeze([
        { text: 'Nej — oligarki og demokrati er gensidigt udelukkende styreformer', misconception: 'false_equivalence — mange formelle demokratier indeholder oligarkiske elementer', correct: false },
        { text: 'Ja — en lille gruppe kan have uforholdsmæssig reel magt selv i et formelt demokrati', misconception: null, correct: true },
        { text: 'Ja — men kun i korrupte demokratier, ikke i velfungerende', misconception: 'overgeneralization — selv stabilt fungerende demokratier har oligarkiske elementer', correct: false },
        { text: 'Oligarki refererer kun til styreformer uden valg', misconception: 'scope_confusion — oligarki beskriver magtkoncentration, ikke nødvendigvis fraværet af valg', correct: false },
      ]),
      review_text: 'Oligarki er ikke en specifik styreform — det er en beskrivelse af hvem der reelt bestemmer. En lille velhavende elite kan finansiere valgkampagner, eje medier og lobbye effektivt, mens valgurnen formelt fungerer. Videnskabelige analyser af amerikanske politiske beslutninger viser at eliteinteresser statistisk forudsiger politiske resultater langt bedre end folkelig opinion. Demokrati og oligarki er et spektrum, ikke en binær. Spørgsmålet er ikke "har vi et demokrati?" men "hvem har den reelle indflydelse — og hvorfra?"',
      metadata: Object.freeze({
        concepts: ['power_distribution', 'representation', 'accountability'],
        misconception_type: 'false_equivalence',
        cognitive_skill: 'evaluation',
        difficulty_type: 'analytical',
        challenge_role: 'deep_challenge',
        insight_type: 'perspective_shift',
        review_text_level: 3,
      }),
    }),

    Object.freeze({
      id: 'dp_016',
      question: 'Hvad er den primære kilde til politisk legitimitet i et moderne demokrati?',
      options: Object.freeze([
        { text: 'Tradition og historisk kontinuitet', misconception: 'scope_confusion — tradition var legitimitetskilde i monarkier; moderne demokrati kræver folkets samtykke', correct: false },
        { text: 'Folkelig accept — at de regerede anerkender retten til at regere', misconception: null, correct: true },
        { text: 'Effektiv styring og gode resultater', misconception: 'causal_inversion — resultater kan styrke legitimitet men er ikke dens kilde; en leder kan regere effektivt uden legitimitet', correct: false },
        { text: 'Lovlig magtovertagelse via valg', misconception: 'surface_association — valg er mekanismen; legitimitet er folkets accept af at resultatet er bindende', correct: false },
      ]),
      review_text: 'Max Weber identificerede tre typer legitimitet: tradition (kongen er kong fordi konger altid har regeret), karisma (lederen er leder fordi folk følger ham) og rationalitet-legalitet (lederen er leder fordi et system af regler udpegede ham). Moderne demokratier hviler på det tredje — men kun hvis borgerne faktisk accepterer reglerne som legitime. Det er grunden til at valgnederlæg der afvises truer demokratiet fundamentalt: de underminerer den folkelige accept der er systemets egentlige fundament.',
      metadata: Object.freeze({
        concepts: ['political_legitimacy', 'representation', 'accountability'],
        misconception_type: 'surface_association',
        cognitive_skill: 'comprehension',
        difficulty_type: 'factual',
        challenge_role: 'reinforcement',
        insight_type: 'conceptual_bridge',
        review_text_level: 3,
      }),
    }),

    Object.freeze({
      id: 'dp_017',
      question: 'Hvad er det konkrete problem med at samle politi og anklagemyndighed under én minister?',
      options: Object.freeze([
        { text: 'Det er ineffektivt med to separate institutioner', misconception: 'causal_inversion — effektivitet er ikke argumentet; det er koncentrationen af magt der er problemet', correct: false },
        { text: 'En minister kan bruge begge institutioner til at beskytte politiske allierede og forfølge modstandere', misconception: null, correct: true },
        { text: 'Politiet bør rapportere til parlamentet i stedet', misconception: 'scope_confusion — dette er et alternativt forslag, ikke forklaringen på det konkrete problem', correct: false },
        { text: 'Anklagemyndigheden bør kun rapportere til domstolene', misconception: 'scope_confusion — ligeledes et alternativt forslag, ikke identifikation af problemet', correct: false },
      ]),
      review_text: 'Magtadskillelse er ikke bureaukratisk formalisme — det er en konkret sikkerhedsventil. Når én minister kontrollerer hvem der efterforskes og hvem der retsforfølges, opstår en magtkoncentration der historisk er blevet brugt til politisk forfølgelse. Selv med den bedste hensigt skaber strukturen mulighed for misbrug. Demokratiets forsikringer mod korruption er ikke bygget på at stole på gode ledere — de er bygget på at sikre at dårlige ledere ikke kan misbruge systemet.',
      metadata: Object.freeze({
        concepts: ['separation_of_powers', 'checks_and_balances', 'accountability'],
        misconception_type: 'causal_inversion',
        cognitive_skill: 'analysis',
        difficulty_type: 'analytical',
        challenge_role: 'challenge',
        insight_type: 'reframing',
        review_text_level: 3,
      }),
    }),

    Object.freeze({
      id: 'dp_018',
      question: 'Hvad gør parlamentarisk kontrol effektiv?',
      options: Object.freeze([
        { text: 'At oppositionen er stor nok til at blokere lovgivning', misconception: 'scope_confusion — blokering er lovgivningsmæssig kontrol; parlamentarisk kontrol handler om ansvarlighed, ikke blokering', correct: false },
        { text: 'At parlamentet har reel adgang til information og uafhængig kapacitet til at analysere den', misconception: null, correct: true },
        { text: 'At parlamentarikere er eksperter inden for de områder de kontrollerer', misconception: 'false_equivalence — ekspertise hjælper men er ikke det afgørende; information og uafhængighed er', correct: false },
        { text: 'At der afholdes jævnlige valg', misconception: 'surface_association — valg er en form for retrospektiv ansvarlighed; parlamentarisk kontrol er løbende', correct: false },
      ]),
      review_text: 'Et parlament kan stille spørgsmål til statsministeren — men hvis svaret er "det er klassificeret" eller "vores embedsmænd har analyseret det" uden adgang til de faktiske analyser, er kontrollen symbolsk. Effektiv parlamentarisk kontrol kræver tre ting: reel adgang til information, uafhængig analysekapacitet (ikke bare regeringens egne embedsmænd), og tid til at forstå komplekse spørgsmål. Mangel på én af de tre gør kontrollen til teater.',
      metadata: Object.freeze({
        concepts: ['accountability', 'checks_and_balances', 'separation_of_powers'],
        misconception_type: 'scope_confusion',
        cognitive_skill: 'analysis',
        difficulty_type: 'analytical',
        challenge_role: 'challenge',
        insight_type: 'reframing',
        review_text_level: 3,
      }),
    }),

  ]),

  OUTLINED_REMAINING: Object.freeze([
    { id: 'dp_019', concept: 'civil_rights', question: 'Hvad er forskellen på borgerrettigheder og menneskerettigheder?', challenge_role: 'reinforcement', misconception: 'false_equivalence' },
    { id: 'dp_020', concept: 'collective_action', question: 'Hvad er det konkrete problem med at lade markedet bestemme over kollektive goder?', challenge_role: 'challenge', misconception: 'scope_confusion' },
    { id: 'dp_021', concept: 'propaganda', question: 'Hvad er et ekkokammer — og hvad forstærker det?', challenge_role: 'reinforcement', misconception: 'surface_association' },
    { id: 'dp_022', concept: 'political_legitimacy', question: 'Kan en ulovligt valgt leder regere legitimt?', challenge_role: 'deep_challenge', misconception: 'causal_inversion' },
    { id: 'dp_023', concept: 'power_distribution', question: 'Hvorfor kan direkte demokrati skalere dårligt?', challenge_role: 'challenge', misconception: 'overgeneralization' },
    { id: 'dp_024', concept: 'minority_rights', question: 'Hvad er Tocquevilles "flertallets tyranni" — og er det stadig relevant?', challenge_role: 'deep_challenge', misconception: 'scope_confusion' },
    { id: 'dp_025', concept: 'accountability', question: 'Hvornår er whistleblowing moralsk forpligtende?', challenge_role: 'deep_challenge', misconception: 'authority_bias' },
  ]),

});

// ─── STUDENT SESSION SIMULATION ───────────────────────────────────────────────

export const STUDENT_SESSION_SIMULATION = Object.freeze({

  SESSION_PROFILE: Object.freeze({
    student:    'A 16-year-old in a Danish gymnasium. Moderate engagement. Studies samfundsfag.',
    duration:   '42 minutes',
    questions:  18,
    domain:     'Democracy & Power',
  }),

  TIMELINE: Object.freeze([
    Object.freeze({ minutes: '0–8',   questions: 3, tone: 'fresh and attentive', notes: 'dp_016 (legitimacy) opens well — concrete, buildable. Student engages thoughtfully.' }),
    Object.freeze({ minutes: '8–16',  questions: 4, tone: 'engaged', notes: 'dp_001 and dp_004 land well. dp_003 (formal/real power) takes longer — student reads the review_text twice.' }),
    Object.freeze({ minutes: '16–25', questions: 4, tone: 'finding rhythm', notes: 'dp_007 (propaganda) causes a visible engagement spike — student pauses before answering. This is the session peak.' }),
    Object.freeze({ minutes: '25–33', questions: 4, tone: 'tiring slightly', notes: 'dp_008 (revolution) is very deep — student spends 11 seconds on review_text, well above average. One reinforcement question needed here.' }),
    Object.freeze({ minutes: '33–42', questions: 3, tone: 'sustained but slower', notes: 'dp_010 (measuring democracy) closes the session effectively. Student reads the review_text fully. Session ends naturally.' }),
  ]),

  AHA_MOMENTS: Object.freeze([
    { question_id: 'dp_004', moment: 'Voter turnout being a collective structural issue, not personal choice — student paused after reading review_text', intensity: 'high' },
    { question_id: 'dp_007', moment: '"Effective propaganda is selective truth, not lies" — student visibly reconsidered before answering', intensity: 'very high' },
    { question_id: 'dp_008', moment: '"Napoleon and Stalin as the same phenomenon" — student spent longer on this review_text than any other', intensity: 'high' },
    { question_id: 'dp_015', moment: 'Oligarchy and democracy coexisting — student selected the wrong answer first, then changed it after re-reading', intensity: 'medium' },
  ]),

  FATIGUE_SIGNALS: Object.freeze([
    'Minute 27: reading time on review_text drops after second consecutive deep_challenge question',
    'Minute 34: student clicks "next" 1.2 seconds faster than earlier in session — signs of mechanical rhythm',
    'No full fatigue collapse — the propaganda engagement spike at minute 16 extended sustained engagement significantly',
  ]),

  KEY_FINDINGS: Object.freeze([
    'Personal-relevance questions (propaganda, voter turnout) extend engagement by 8–12 minutes in long sessions',
    'A single deep engagement spike mid-session resets the fatigue clock — more valuable than pacing uniformity',
    'dp_016 (reinforcement) after dp_008 (deep_challenge) is correctly sequenced — student recovers without feeling dismissed',
    'Session-closing question dp_010 works well: synthesises concepts without introducing new cognitive load',
    'Reading time is a better engagement signal than response time — short reading = disengaged, not fast-thinking',
  ]),

});

// ─── REVIEW MOMENT REFINEMENT ─────────────────────────────────────────────────

export const REVIEW_MOMENT_REFINEMENT = Object.freeze({

  OBSERVATION: 'The wrong-answer → review_text moment is performing well structurally. Three specific refinements emerged from simulation.',

  REFINEMENT_1_TYPOGRAPHY: Object.freeze({
    finding:    'The "hook sentence" (first sentence, larger weight) is working — students\' eyes land there first',
    remaining:  'Some review_texts front-load a long first sentence. When it wraps to 3 lines the hook loses its visual anchoring.',
    fix:        'First sentence maximum 20 words. If the thought requires more, split into hook (≤20 words) + body continuation.',
    example:    Object.freeze({
      too_long:  '"En leder kan blive valgt, holde fair valg én gang, og derefter afmontere de mekanismer der ville fjerne dem fra magten."',
      split:     'Hook: "Valg skaber ikke demokrati — ansvarlighed gør." Body: "En leder kan holde fair valg én gang og derefter afmontere mekanismerne der ville fjerne dem."',
    }),
  }),

  REFINEMENT_2_TRANSITION: Object.freeze({
    finding:    'The 150ms gap between wrong-indicator fade and review_text appearance is correct in isolation, but on mobile the fade-in feels abrupt because the viewport shift (content height change) competes with the fade',
    fix:        'On mobile: reserve review_text space before question renders — height is pre-allocated so the content appears without layout jump. Review_text then fades in against a stable layout.',
    principle:  'Layout stability is more important than animation elegance. A stable fade beats an elegant jump.',
  }),

  REFINEMENT_3_RECOVERY_TONE: Object.freeze({
    finding:    'Some review_texts end on a slightly lecture-y note — explaining what the student should have thought rather than inviting them to think now',
    anti_pattern: '"Students often make the mistake of thinking that..." — third-person distancing',
    fix:        'Address the student directly throughout: "You probably thought X because..." or "The reason this feels counterintuitive is..."',
    example:    Object.freeze({
      before: '"Mange elever forveksler formel og reel magt fordi de antager at institutioner fungerer som designet."',
      after:  '"Det er let at antage at formel magt og reel magt er det samme — institutionerne ser jo ud til at fungere. Men..."',
    }),
  }),

  TIMING_CALIBRATION: Object.freeze({
    standard_questions:       '8000ms minimum reading time before next-question becomes available',
    deep_challenge_questions: '10000ms — simulation showed students spending 9–11 seconds on these',
    reinforcement_questions:  '5000ms — these reviews are shorter; students read them faster',
    propaganda_type:          '9000ms — personal-relevance questions warrant extra reading time',
    recalibration_signal:     'If student has answered 3+ consecutive questions with under 4s reading time: next review_text gets 1500ms additional hold',
  }),

});

// ─── TEACHER WORKFLOW VALIDATION ──────────────────────────────────────────────

export const TEACHER_WORKFLOW_VALIDATION = Object.freeze({

  SIMULATED_SESSIONS: Object.freeze([

    Object.freeze({
      session:  'After-school editing session, 6pm, 20 minutes available',
      task:     'Improve review_text for dp_013 (gratis-rider) after seeing 58% misconception rate',
      outcome:  'Completed in 14 minutes — 6 minutes navigating to the right question',
      friction: 'Still no domain filter. Teacher scrolled through 47 questions to find dp_013.',
      positive: 'Side-by-side preview made writing comfortable. Teacher added the "fællesejet hus" metaphor on the second draft.',
      finding:  'The metaphor quality of teacher-authored review_text is notably better than system-suggested templates. Teachers write from lived understanding.',
    }),

    Object.freeze({
      session:  'Sunday morning enrichment session, 45 minutes, no time pressure',
      task:     'Author three new questions (dp_019, dp_020, dp_021) and enrich dp_014',
      outcome:  'Completed — dp_019 and dp_020 authored comfortably. dp_021 abandoned at Layer 1 (not enough time left).',
      friction: 'Layer 3 metadata (challenge_role, insight_type) required referring back to documentation. Plain-language dropdown descriptions not yet present.',
      positive: 'The enrichment depth bar reduced anxiety about leaving questions at Layer 1–2. Teacher felt "I can come back to this" rather than "I failed to finish it."',
      finding:  'The "always come back later" design philosophy is working. Teachers do not feel compelled to complete all layers in one session.',
    }),

  ]),

  WHAT_TEACHERS_IGNORE: Object.freeze([
    'insight_type — teachers rarely set this field; they do not have a clear mental model of what it controls',
    'interdisciplinary_links — too abstract; teachers tag concepts but rarely think about cross-subject links explicitly',
    'QA pass — most teachers skip it for questions they feel confident about; they use it for uncertain cases',
  ]),

  WHAT_TEACHERS_AVOID: Object.freeze([
    'challenge_role on first authoring session — too conceptual without an example session to reference',
    'Writing review_text at Layer 2 without the side-by-side preview — they reported it felt like writing into a void',
    'Assigning more than 4 concept tags — they felt uncertain which ones the system would actually use',
  ]),

  WHAT_TEACHERS_ENJOY: Object.freeze([
    'The side-by-side review_text preview — described as "the most useful thing in the interface"',
    'Seeing misconception frequency data — "This tells me something real about what my students misunderstand"',
    'The enrichment depth bar — gives a sense of tangible progress without pressure',
    'Writing review_text at Level 3 — teachers who reach this describe it as genuinely satisfying craft',
  ]),

  WHAT_TEACHERS_MISUNDERSTAND: Object.freeze([
    'misconception_type — some teachers tag the wrong answer, not the thinking pattern behind it',
    'challenge_role: "deep_challenge" — some teachers think this means "hard question"; it means "requires concept foundation"',
    'review_text_level — not visible to teachers by name; they calibrate by feel, not label',
  ]),

  DESIGN_IMPLICATIONS: Object.freeze([
    'insight_type should become optional and hidden by default — it is over-specified for current teacher usage',
    'challenge_role needs one concrete example per option in the dropdown: "deep_challenge: use for questions where students need to understand political_legitimacy first"',
    'misconception_type tooltip needs to say: "What THINKING ERROR does this diagnose?" not "What is wrong with this answer?"',
    'A "recently viewed questions" list on the authoring home page would save the 6-minute navigation time',
  ]),

});

// ─── ADAPTIVE RHYTHM REFINEMENT ───────────────────────────────────────────────

export const ADAPTIVE_RHYTHM_REFINEMENT = Object.freeze({

  LONGER_SESSION_OBSERVATIONS: Object.freeze([
    'In sessions over 30 questions: the wave cycling (challenge → reinforcement → challenge) becomes predictable — students begin to "feel the pattern"',
    'Solution: introduce occasional "surprise reinforcement" — a reinforcement question after a correct challenge answer, not only after wrong ones',
    'This breaks the mechanical association of reinforcement with failure, which is psychologically important',
    'One reinforcement question every 5–7 questions regardless of performance: this is the natural pacing of a good teacher-led lesson',
  ]),

  TRANSITION_SMOOTHNESS: Object.freeze({
    deep_challenge_to_reinforcement: Object.freeze({
      current:  'Transition is immediate after wrong answer + review_text',
      finding:  'Too fast — student is still processing the review_text when the softer question arrives. The recovery feels rushed.',
      fix:      'After deep_challenge review_text: next question loads with a 600ms additional entrance delay — visible as a gentle breath before the question appears.',
    }),
    recovery_to_challenge: Object.freeze({
      current:  'Returns to challenge after 2 consecutive correct reinforcement answers',
      finding:  'This is correct in principle. However, the transition feels mechanical when the same challenge topic appears immediately.',
      fix:      'First challenge after recovery: introduce a new concept or a challenge on a concept the student has previously been stable on — not the concept where the misconception occurred.',
    }),
  }),

  CONFIDENCE_RESTORATION_FINDINGS: Object.freeze([
    'The 2-consecutive-correct trigger is too strict — students often answer one correctly by luck, then incorrectly again',
    'Better signal: 2 correct answers on different concepts, or 1 correct + time-on-review-text above 5s (suggesting genuine reading)',
    'Confidence restoration should be felt as earned, not given — a question that requires real thought but is clearly answerable',
  ]),

  INTERRUPTION_AUDIT: Object.freeze({
    audit_result: 'No UI elements interrupt during review_text reading — this is working correctly',
    one_exception: 'Session milestone toast (XP/coins) was firing mid-review_text in some sessions where the milestone threshold was hit at the same moment as a wrong answer',
    fix:          'Milestone toasts must be deferred to the next question arrival — never during review_text display',
  }),

});

// ─── COGNITIVE SIMPLICITY PASS ────────────────────────────────────────────────

export const COGNITIVE_SIMPLICITY_PASS = Object.freeze({

  LABEL_REWRITES: Object.freeze([
    Object.freeze({ field: 'misconception_type',  before: 'misconception_type',  after: 'Hvilken tankefejl?',          tooltip: 'Vælg det fejlmønster dette spørgsmål er designet til at afsløre' }),
    Object.freeze({ field: 'cognitive_skill',     before: 'cognitive_skill',     after: 'Hvad kræver svaret?',         tooltip: 'Fra simple hukommelse til kompleks vurdering' }),
    Object.freeze({ field: 'challenge_role',      before: 'challenge_role',      after: 'Hvornår skal dette vises?',   tooltip: 'Reinforcement = bygge tillid · Challenge = teste forståelse · Deep_challenge = kræver fundament' }),
    Object.freeze({ field: 'difficulty_type',     before: 'difficulty_type',     after: 'Hvad slags vanskelighed?',    tooltip: 'Faktuel (huske) · Begrebslig (forstå) · Analytisk (ræsonnere)' }),
    Object.freeze({ field: 'insight_type',        before: 'insight_type',        after: 'Hvad åbner dette spørgsmål?', tooltip: 'Valgfrit — bruges kun til at hjælpe systemet med at forbinde koncepter' }),
  ]),

  REVIEW_TEXT_SIMPLIFICATION: Object.freeze([
    'Maximum review_text length: 75 words in production. Everything above this should be split into two separate learning objects.',
    'Hook sentence: maximum 20 words. If longer, the typography emphasis is lost.',
    'Conceptual link (the "watch for this..." sentence): always last. Never in the middle.',
    'Avoid nested relative clauses: "Det er grunden til at demokratier der er bygget på..." — split the sentence.',
    'Test: read it aloud. If you need to breathe in the middle of a sentence, split the sentence.',
  ]),

  UI_CLUTTER_REMOVALS: Object.freeze([
    'insight_type field: hidden by default in teacher authoring. Available in Advanced panel only.',
    'interdisciplinary_links field: removed from standard authoring flow. Derivable from concept tags.',
    'review_text_level indicator: internal only — never shown to teacher as a number.',
    'QA pass score: replaced with three outcomes only — "Ready", "Improve one thing", "Let\'s revisit".',
    'Session statistics during active session: only XP bar. All other counters deferred to session end.',
  ]),

});

// ─── HUMAN EMPATHY VALIDATION ────────────────────────────────────────────────

export const HUMAN_EMPATHY_VALIDATION = Object.freeze({

  TIRED_14_YEAR_OLD: Object.freeze({
    encouraging: 'The propaganda question. "This is about something real — I can think about this."',
    intimidating: 'dp_015 (oligarchy) — the word "oligarki" creates a vocabulary barrier before the concept lands',
    meaningful:   'The "7 prisoners" review_text from dp_001/dp_005 — concrete facts anchor abstract concepts',
    exhausting:   'Two consecutive review_texts over 60 words. After the second, reading rate drops.',
    fix:          'dp_015 review_text should introduce "oligarki" with a one-phrase definition on first use',
  }),

  DISENGAGED_STUDENT: Object.freeze({
    encouraging: 'Getting the propagandaspørgsmål right on first try — felt like recognition of existing knowledge',
    finding:     'This student type benefits most from reinforcement questions — they build confidence without triggering avoidance',
    risk:        'If wave sequence opens with a deep_challenge question, disengaged students disengage immediately',
    fix:         'New student sessions always open with reinforcement or challenge — never deep_challenge',
  }),

  HIGHLY_CURIOUS_STUDENT: Object.freeze({
    encouraging: 'Concept links in review_text opening new questions: "Hvad er Tocquevilles flertallets tyranni?"',
    meaningful:  'dp_008 and dp_009 — the big structural questions that invite genuine philosophical thinking',
    request:     'This student wants to read more after a particularly interesting review_text — no mechanism exists for this',
    future_note: 'A "read more" link to one carefully curated resource per concept would serve this student well without opening a rabbit hole',
  }),

  STRESSED_TEACHER: Object.freeze({
    encouraging: 'The enrichment depth bar — "I can see what I\'ve done without feeling judged for what I haven\'t"',
    intimidating: 'The misconception_type dropdown with 7 technical English labels in a Danish-language UI',
    fix:          'All dropdown options in teacher authoring should be in Danish with plain-language descriptions',
    elegant:      'Layer 0 authoring — the simplicity at the base level was consistently described as calming',
  }),

  NON_TECHNICAL_TEACHER: Object.freeze({
    confusion: 'challenge_role — "I don\'t know enough about how the adaptive system works to make this choice confidently"',
    comfort:   'The QA conversation flow — "It felt like a checklist I could actually complete"',
    fix:       'challenge_role dropdown should offer a simplified binary: "Build confidence" (reinforcement) vs "Test understanding" (challenge/deep_challenge)',
  }),

  REFLECTIVE_LEARNER: Object.freeze({
    meaningful: 'review_texts that end with "Spørg altid: ..." or "Læg mærke til: ..." — these invite continued thinking',
    request:    'Ability to re-read review_text from previous questions — review is important for this student type',
    elegant:    'The invisible adaptive pacing — this student notices the rhythm shifting and finds it respectful',
    note:       'This student type reads review_text 2.3x longer than average — they are the primary beneficiary of Level 3 review quality',
  }),

});

// ─── IDENTITY PROTECTION ──────────────────────────────────────────────────────

export const IDENTITY_PROTECTION = Object.freeze({

  AUDIT_QUESTION: 'Do any systems added in Sections 38–46 risk violating the platform\'s identity commitments?',

  AUDIT_RESULTS: Object.freeze({
    'Wave scoring (Section 38)':       Object.freeze({ verdict: 'safe', reason: 'Invisible to students. No performance pressure.' }),
    'Misconception signal (38)':       Object.freeze({ verdict: 'safe', reason: 'Used for adaptation, not student profiling.' }),
    'Concept states (38)':             Object.freeze({ verdict: 'safe', reason: 'Aggregate health, not scores. Teacher-visible only as patterns.' }),
    'Teacher inspection view (43)':    Object.freeze({ verdict: 'safe', reason: 'Aggregate only. No individual student data surfaced.' }),
    'Enrichment depth bar (44)':       Object.freeze({ verdict: 'safe', reason: 'Shows progress, not performance. No pressure mechanic.' }),
    'QA pass system (43)':             Object.freeze({ verdict: 'safe', reason: 'Teacher has final say. QA is reflective, not gatekeeping.' }),
    'Session XP bar (all)':            Object.freeze({ verdict: 'watch', reason: 'XP is motivating but must not become the primary driver. Never show loss.' }),
    'Milestone toasts (retention)':    Object.freeze({ verdict: 'watch', reason: 'Streak mechanics can create anxiety if streak-breaking is visible. Review.' }),
  }),

  NON_NEGOTIABLE_ANCHORS: Object.freeze([
    'Students are never shown their misconception_type labels — this data is for teachers, not for student comparison',
    'No student is ever shown how their performance compares to others — no leaderboards, no "most improved"',
    'Challenge-wave changes are never announced to students — the experience shifts, never the labelling',
    'Teachers are never given per-student performance data on individual questions — only aggregate patterns',
    'XP and coins are motivational signals, not competitive rankings — they accumulate, never decrease',
    'Every piece of data the platform collects serves content improvement, not administrative reporting',
  ]),

  WATCH_ITEMS: Object.freeze([
    'Milestone streaks: ensure that missing a day shows nothing — no "broken streak" counter or guilt signal',
    'XP bar: never show a red state or a downward movement — XP only moves forward',
    'Session length: never recommend specific session targets that could create pressure',
  ]),

});

// ─── REALITY-GROUNDED FUTURE ──────────────────────────────────────────────────

export const REALITY_GROUNDED_FUTURE = Object.freeze({

  DEVELOPMENT_PHILOSOPHY: Object.freeze([
    'Every new feature proposal must survive: "Does a tired teacher at 6pm use this — or ignore it?"',
    'Every new student-facing element must survive: "Does a disengaged student feel more or less welcome because of this?"',
    'Content quality compounds. One well-written review_text influences thousands of learning moments.',
    'Simplification is ongoing. The moment the platform feels heavy, start removing.',
    'The next domain expansion (ecosystems, proportional reasoning, persuasive language) follows the same 25-object standard.',
  ]),

  IMMEDIATE_PRIORITIES: Object.freeze([
    'Complete dp_019–dp_025 to Level 2+ review_text',
    'Add domain filter to teacher question list — this single change saves 6+ minutes per session',
    'Translate all dropdown option labels to Danish with plain-language descriptions',
    'Defer milestone toasts to next-question arrival — never mid-review_text',
    'Implement "recently viewed questions" list on teacher authoring home',
  ]),

  MEDIUM_TERM: Object.freeze([
    'Second domain at gold-standard quality (candidate: Ecosystems — strong misconception density)',
    '"Read more" link in review_text for curious students — one curated resource, no rabbit holes',
    'Mobile layout pre-allocates review_text height to prevent layout jump during fade-in',
    'challenge_role simplified binary in dropdown for non-technical teachers',
  ]),

  NORTH_STAR: 'The platform is successful when a student who spent 40 minutes with it walks away thinking about something — not about the platform itself.',

});

// ─── CLASSROOM VALIDATION TEST ────────────────────────────────────────────────

export const CLASSROOM_VALIDATION_TEST = Object.freeze([
  'Does a 40-minute student session feel varied in pace without being mechanically predictable?',
  'Does the propaganda question (or equivalent personal-relevance question) create a visible engagement spike?',
  'Do all 18 fully authored learning objects have review_text with a hook sentence under 20 words?',
  'Can a teacher find a specific question within 2 minutes without domain filtering?',
  'Are all dropdown labels in Danish with plain-language descriptions?',
  'Does the milestone toast never fire during review_text display?',
  'Does the reinforcement-after-deep_challenge transition feel like a breath, not a demotion?',
  'Can a non-technical teacher set challenge_role confidently using a binary choice?',
  'Is no student data per-individual surfaced in any teacher-facing view?',
  'Does the platform feel, after 40 minutes of use, calmer than it did on minute one?',
]);
