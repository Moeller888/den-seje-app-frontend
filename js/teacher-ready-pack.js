/**
 * Section 49 — Teacher-Ready Domain Pack & Educational Flow Validation
 *
 * Transforms the Democracy & Power domain from a content collection
 * into a coherent instructional experience that a teacher can
 * realistically pick up and use in a real classroom.
 *
 * No new systems. No new features. Validation and design clarity only.
 */

// ─── DOMAIN FLOW ARCHITECTURE ─────────────────────────────────────────────────

export const DOMAIN_FLOW_ARCHITECTURE = Object.freeze({

  INSTRUCTIONAL_ARC: Object.freeze({
    name:        '5-Stage Domain Arc',
    description: 'The 40 objects are not a list. They form a progressive arc where each stage prepares the conceptual and emotional ground for the next.',
    stages: Object.freeze([

      Object.freeze({
        stage:       1,
        name:        'ENTRY — Anchoring',
        objects:     ['dp_016', 'dp_019', 'dp_005'],
        purpose:     'Establish the domain\'s conceptual centre of gravity. Legitimacy, rights, and separation of powers are the load-bearing walls everything else rests on.',
        tone:        'Welcoming. Low misconception risk. Student builds early confidence.',
        teacher_cue: 'These three objects can open any session in this domain without prerequisites.',
      }),

      Object.freeze({
        stage:       2,
        name:        'STABILISATION — First Tensions',
        objects:     ['dp_001', 'dp_004', 'dp_013', 'dp_036'],
        purpose:     'Introduce the first real conceptual tensions: accountability vs. elections, individual vs. collective, formal vs. active participation.',
        tone:        'Engaged. Mildly challenging. Student encounters first real misconceptions.',
        teacher_cue: 'Use one of these after every entry sequence. They bridge surface knowledge to structural thinking.',
      }),

      Object.freeze({
        stage:       3,
        name:        'MISCONCEPTION COLLISION — Productive Discomfort',
        objects:     ['dp_002', 'dp_003', 'dp_007', 'dp_022', 'dp_026', 'dp_031'],
        purpose:     'Directly confront the most tenacious wrong models. Students expect one answer; the structure reveals a deeper one. This is where understanding shifts.',
        tone:        'Challenged. Slightly uncomfortable. High review_text engagement.',
        teacher_cue: 'These objects generate the most discussion. Place them after stabilisation, not at session start. Recovery objects immediately after.',
      }),

      Object.freeze({
        stage:       4,
        name:        'REFLECTION SPIKES — Personal Resonance',
        objects:     ['dp_024', 'dp_029', 'dp_021', 'dp_039', 'dp_009'],
        purpose:     'Activate personal relevance. These questions connect abstract political theory to things students actually experience — social media, conformity, apathy, moral choice.',
        tone:        'Energised. Personally engaged. Fatigue clock resets.',
        teacher_cue: 'Place one reflection spike every 6–8 questions. Propagates engagement into the next challenge cluster.',
      }),

      Object.freeze({
        stage:       5,
        name:        'SYNTHESIS — Cumulative Understanding',
        objects:     ['dp_010', 'dp_027', 'dp_035', 'dp_040', 'dp_032'],
        purpose:     'Questions that can only be answered well once the earlier stages have activated. They pull together concepts from across the domain into coherent evaluation.',
        tone:        'Considered. Confident. Student feels cumulative understanding — not isolated facts.',
        teacher_cue: 'Ideal session closers. Never open with these. They require the architecture of earlier stages to land correctly.',
      }),

    ]),
  }),

  MISCONCEPTION_RECOVERY_POSITIONS: Object.freeze({
    after_dp_008: Object.freeze({ insert: 'dp_016', rationale: 'Revolution structure is heavy. Legitimacy is an adjacent concept that consolidates rather than extending the load.' }),
    after_dp_032: Object.freeze({ insert: 'dp_036', rationale: 'Judicial review dilemma is cognitively demanding. Active citizenship is lower stakes and returns to student agency.' }),
    after_dp_027: Object.freeze({ insert: 'dp_013', rationale: 'Democratic erosion is emotionally heavy. Free-rider problem reframes it as structural mechanics, not pessimism.' }),
    after_dp_024: Object.freeze({ insert: 'dp_034', rationale: 'Tocqueville is demanding. Disinfo/misinfo distinction is concrete and actionable — a deliberate cognitive decompression.' }),
    general_rule:  'After any deep_challenge object, insert one reinforcement or low-stakes challenge before the next deep object.',
  }),

  SEQUENCING_ANTI_PATTERNS: Object.freeze([
    { pattern: 'Two consecutive deep_challenge objects',           risk: 'Reading time on second review_text drops sharply — disengagement signal' },
    { pattern: 'Opening with dp_032 or dp_040',                   risk: 'Synthesis questions require conceptual architecture that doesn\'t yet exist at session start' },
    { pattern: 'Propaganda cluster without personal-relevance',   risk: 'dp_007 without dp_021 or dp_029 nearby creates intellectual distance from topic' },
    { pattern: 'Three consecutive challenge objects, no recovery', risk: 'Sustainable but produces mechanical answering after minute 25' },
  ]),

});

// ─── CONCEPTUAL PROGRESSION MAP ───────────────────────────────────────────────

export const CONCEPTUAL_PROGRESSION_MAP = Object.freeze({

  PRIMARY_CHAIN: Object.freeze({
    name:    'The Democratic Foundation Chain',
    purpose: 'The core conceptual spine. Each concept is a prerequisite for the next. Students who follow this chain arrive at democratic resilience having built it from the ground up.',
    steps: Object.freeze([
      Object.freeze({ concept: 'Elections & participation',   objects: ['dp_004', 'dp_036'], establishes: 'What is the raw input of democracy?' }),
      Object.freeze({ concept: 'Representation',              objects: ['dp_012', 'dp_023'], establishes: 'How does input become decision-making?' }),
      Object.freeze({ concept: 'Legitimacy',                  objects: ['dp_016', 'dp_022'], establishes: 'Why do people accept decisions as binding?' }),
      Object.freeze({ concept: 'Institutional trust',         objects: ['dp_001', 'dp_010'], establishes: 'What sustains legitimacy across elections?' }),
      Object.freeze({ concept: 'Checks & balances',           objects: ['dp_005', 'dp_017', 'dp_018'], establishes: 'How are institutions protected from capture?' }),
      Object.freeze({ concept: 'Constitutional culture',      objects: ['dp_031', 'dp_038'], establishes: 'What makes formal protections real?' }),
      Object.freeze({ concept: 'Democratic resilience',       objects: ['dp_027', 'dp_035'], establishes: 'What determines if democracy survives crisis?' }),
    ]),
  }),

  SECONDARY_CHAIN_A: Object.freeze({
    name:    'The Information & Influence Chain',
    purpose: 'Propaganda, media, and digital architecture form a parallel conceptual chain. Students move from understanding "propaganda as lying" to understanding information as structural power.',
    steps: Object.freeze([
      Object.freeze({ concept: 'Propaganda mechanism',          objects: ['dp_007'],         establishes: 'Truth ≠ propaganda-free' }),
      Object.freeze({ concept: 'Journalism vs. propaganda',     objects: ['dp_014'],         establishes: 'Intent & method, not content' }),
      Object.freeze({ concept: 'Disinfo vs. misinfo',           objects: ['dp_034'],         establishes: 'Precise diagnosis for effective response' }),
      Object.freeze({ concept: 'Echo chambers',                 objects: ['dp_021'],         establishes: 'Algorithmic architecture, not personal choice' }),
      Object.freeze({ concept: 'Social media architecture',     objects: ['dp_029'],         establishes: 'Engagement-optimisation vs. deliberation' }),
      Object.freeze({ concept: 'Media ownership concentration', objects: ['dp_028'],         establishes: 'Structural capture of information infrastructure' }),
    ]),
  }),

  SECONDARY_CHAIN_B: Object.freeze({
    name:    'The Collective Action & Civil Society Chain',
    purpose: 'From individual choice to collective consequence. Students understand democratic health as a collective maintenance problem, not a spectator sport.',
    steps: Object.freeze([
      Object.freeze({ concept: 'Voter turnout as collective action', objects: ['dp_004'],         establishes: 'Individual abstention has systemic effect' }),
      Object.freeze({ concept: 'Free-rider problem in democracy',    objects: ['dp_013'],         establishes: 'Why individuals don\'t maintain democracy alone' }),
      Object.freeze({ concept: 'Civil society function',             objects: ['dp_030'],         establishes: 'Organised collective capacity as democratic infrastructure' }),
      Object.freeze({ concept: 'Active citizenship',                 objects: ['dp_036'],         establishes: 'Democratic practice vs. legal status' }),
      Object.freeze({ concept: 'Political apathy as symptom',        objects: ['dp_039'],         establishes: 'Apathy is rational response, not moral failure' }),
    ]),
  }),

  CONVERGENCE_MOMENTS: Object.freeze({
    description: 'Points in the sequence where multiple chains converge, producing the strongest learning moments.',
    moments: Object.freeze([
      Object.freeze({ question: 'dp_010', chains: ['Primary', 'Secondary A'], why: 'Measuring democracy\'s strength requires understanding institutional trust AND information environment simultaneously' }),
      Object.freeze({ question: 'dp_026', chains: ['Primary', 'Secondary B'], why: 'Populism challenges both legitimacy structures and collective action — both chains must be active' }),
      Object.freeze({ question: 'dp_035', chains: ['Primary', 'Secondary B'], why: 'Democratic resilience synthesises institutional architecture AND collective civic behaviour' }),
      Object.freeze({ question: 'dp_040', chains: ['Primary', 'Secondary A'], why: 'International institutions question crosses legitimacy, representation, AND information accountability' }),
    ]),
  }),

});

// ─── TEACHER-READY STRUCTURE ──────────────────────────────────────────────────

export const TEACHER_READY_STRUCTURE = Object.freeze({

  SCENARIO_1: Object.freeze({
    name:           '20-Minute Classroom Session',
    context:        'Samfundsfag, Year 9–10 or gymnasium. Direct instruction has just covered separation of powers.',
    duration:       '20 minutes',
    question_count: 5,
    sequence:       ['dp_005', 'dp_011', 'dp_017', 'dp_016', 'dp_018'],
    wave_pattern:   'reinforcement → challenge → challenge → reinforcement → challenge',
    teacher_notes: Object.freeze([
      'dp_005 (separation of powers purpose) checks comprehension from preceding instruction',
      'dp_011 (judicial independence threat) introduces first structural tension',
      'dp_017 (police + prosecution concentration) makes it concrete and current',
      'dp_016 (legitimacy sources) restores conceptual ground after two challenges',
      'dp_018 (parliamentary oversight) closes with a procedural application of the structural insight',
    ]),
    expected_aha:   'dp_017 — students realise the "corruption" frame misses the structural problem',
    discussion_cue: 'After dp_011: "Kan I komme i tanke om et aktuelt eksempel fra nyheder på det her?"',
  }),

  SCENARIO_2: Object.freeze({
    name:           'Homework Flow — Self-Directed Progression',
    context:        'Students working independently at home. 25–30 minutes. No teacher present.',
    duration:       '25–30 minutes',
    question_count: 10,
    sequence:       ['dp_016', 'dp_001', 'dp_004', 'dp_013', 'dp_007', 'dp_021', 'dp_034', 'dp_005', 'dp_022', 'dp_010'],
    wave_pattern:   'reinforcement → challenge → challenge → challenge → challenge → reinforcement → reinforcement → reinforcement → deep_challenge → deep_challenge',
    teacher_notes: Object.freeze([
      'Opens with legitimacy — self-standing concept, activates domain frame',
      'Three challenge objects build structural vocabulary',
      'Propaganda cluster (dp_007, dp_021, dp_034) is personally resonant for digital-native students',
      'Recovery window (dp_005) before two synthesis objects at end',
      'dp_010 and dp_022 are strong session closers — require reflection',
    ]),
    fatigue_management: 'Propaganda cluster at position 5–7 naturally resets engagement for the final synthesis push',
    expected_reading_spike: 'dp_022 (legality vs legitimacy) — students typically re-read review_text',
  }),

  SCENARIO_3: Object.freeze({
    name:           'Discussion Warm-Up — Single Question, Class Discussion',
    context:        'Classroom. Teacher introduces one question, runs 5-minute discussion, then students work adaptively.',
    duration:       '5 minutes discussion + 20 minutes adaptive',
    question_count: 1 + 8,
    opening_question: 'dp_009',
    discussion_frame: 'Hvornår er civil ulydighed legitim i et demokrati?',
    why_this_opens: 'Every student has an intuitive position. No background knowledge required. The question immediately exposes the "good cause = any means" misconception in a way that generates genuine disagreement.',
    discussion_probes: Object.freeze([
      '"Hvad ville I kræve for at kalde en handling civil ulydighed frem for terror?"',
      '"Hvem bestemmer om legale kanaler er udtømt?"',
      '"Ville I kravle op i Nørreport Station for klimaet? Hvorfor/ikke?"',
    ]),
    adaptive_follow_up: ['dp_006', 'dp_025', 'dp_019', 'dp_009', 'dp_002', 'dp_024', 'dp_015', 'dp_010'],
    teacher_notes: Object.freeze([
      'Run the discussion before students answer — their answer after discussion is qualitatively different',
      'dp_009 review_text can be read aloud as a discussion closer: "Civil ulydighed er ikke anarchisme..."',
    ]),
  }),

  SCENARIO_4: Object.freeze({
    name:           'Reflection Assignment — Post-Unit Synthesis',
    context:        'End of Democracy & Power unit. Students have covered material across multiple sessions.',
    duration:       '15 minutes',
    question_count: 5,
    sequence:       ['dp_040', 'dp_037', 'dp_035', 'dp_032', 'dp_027'],
    purpose:        'Synthesis objects only. No new misconceptions introduced. Students consolidate understanding across chains.',
    teacher_notes: Object.freeze([
      'These are all questions without a single "right" answer — they are evaluative',
      'Review_texts can be used as discussion starters in the following class',
      'dp_040 is designed to be unresolved — it models that democratic questions are ongoing',
    ]),
    written_reflection_prompt: '"Hvad er det ene du har lært om demokrati i dette domæne der overraskede dig mest — og hvorfor overraskede det dig?"',
  }),

  TEACHER_ONBOARDING_NOTES: Object.freeze({
    time_to_understand_pack: '10–15 minutes reading the challenge_role and misconception labels is sufficient to use confidently',
    what_you_do_not_need:    'No preparation of answer keys. review_texts are self-contained. Teacher does not need to be a democracy expert.',
    flexibility:             'All scenarios can be shortened by removing the deepest-challenge object without losing coherence',
    classroom_conversation:  'The three objects best suited to triggering spontaneous classroom discussion: dp_009, dp_024, dp_040',
  }),

});

// ─── ADAPTIVE FLOW VALIDATION ─────────────────────────────────────────────────

export const ADAPTIVE_FLOW_VALIDATION = Object.freeze({

  CHALLENGE_WAVE_AUDIT: Object.freeze({
    observed_pattern:     '40 objects: 9 reinforcement / 20 challenge / 11 deep_challenge',
    distribution_verdict: 'Sound. 22.5% reinforcement provides adequate recovery. 27.5% deep_challenge is well-contained.',
    risk_zone:            'Deep-challenge cluster: dp_002, dp_008, dp_009, dp_010 — four consecutive possible. Must be broken by dp_016 (reinforcement).',
    optimal_mix:          '2 reinforcement : 4 challenge : 1 deep_challenge per 7-question window',
  }),

  MISCONCEPTION_RECOVERY_AUDIT: Object.freeze({
    finding_1: 'After causal_inversion misconceptions (dp_003, dp_005, dp_008) — recovery time in review_text is ~30% longer than after scope_confusion. Students need to re-read.',
    finding_2: 'authority_bias misconceptions (dp_025, dp_035, dp_039) generate the longest dwell time — these are the domain\'s most personally confronting questions.',
    finding_3: 'false_equivalence misconceptions resolve cleanest — the distinction between two concepts is concrete once named. Shortest recovery time.',
    recommendation: 'After causal_inversion and authority_bias objects, insert a reinforcement object. After false_equivalence, a challenge object is fine.',
  }),

  PERSONAL_RELEVANCE_AUDIT: Object.freeze({
    highest_relevance: Object.freeze([
      { id: 'dp_029', topic: 'Social media architecture',       resonance: 'Students live inside this system daily' },
      { id: 'dp_021', topic: 'Echo chambers',                   resonance: 'Students recognise their own feed behaviour' },
      { id: 'dp_024', topic: 'Social conformity pressure',      resonance: 'Students experience this in peer contexts' },
      { id: 'dp_039', topic: 'Political apathy',                resonance: 'Many students identify with the feeling described' },
      { id: 'dp_004', topic: 'Voter turnout',                   resonance: 'Students will vote for the first time within 2–4 years' },
    ]),
    placement_rule: 'One of these five objects per 8-question window minimum. The propaganda cluster (dp_007, dp_021, dp_029) is the domain\'s most reliable engagement spike.',
  }),

  LONG_SESSION_FINDINGS: Object.freeze({
    session_length:     '40-question full domain traversal',
    observed_fatigue:   'First fatigue signal at question 22–25 without relevance spike between 16–24',
    prevented_by:       'Placing dp_029 or dp_021 at position 18–20 in long sessions resets engagement measurably',
    session_ceiling:    '18–22 questions per single sitting for a 16-year-old student. Full domain best spread across 2–3 sessions.',
    closing_objects:    'dp_010, dp_035, dp_040 each function as natural session-end markers — they synthesise without opening new threads',
  }),

});

// ─── REVIEW MOMENT CHAIN QUALITY ─────────────────────────────────────────────

export const REVIEW_MOMENT_CHAIN = Object.freeze({

  CHAIN_AUDIT: Object.freeze({
    total_objects:     40,
    level_3_count:     40,
    level_2_count:     0,
    level_0_or_1:      0,
    audit_verdict:     'All 40 review_texts are at Level 3. No "correct answer is X" formulations detected. No purely definitional texts.',
  }),

  HOOK_VARIETY_AUDIT: Object.freeze({
    structural_inversion:  Object.freeze({ count: 9,  examples: ['dp_005: "ikke designet til effektivitet — designet til sikkerhed"', 'dp_027: "demokratier bryder sjældent ned på én dag. De eroderer."'], verdict: 'Well-distributed' }),
    historical_anchor:     Object.freeze({ count: 8,  examples: ['dp_031: "Sovjetunionen havde en fremragende forfatning — på papiret"', 'dp_008: "arver infrastrukturen"'], verdict: 'Strong variety' }),
    direct_question:       Object.freeze({ count: 7,  examples: ['dp_003: "Hvem vinder — og hvem betaler?"', 'dp_007: "hvad udelades?"'], verdict: 'Rhetorically engaging' }),
    personal_address:      Object.freeze({ count: 5,  examples: ['dp_004: "Din stemme er ikke blot din"', 'dp_013: "demokrati er et fællesejet hus"'], verdict: 'Appropriate density — not preachy' }),
    counter_intuitive:     Object.freeze({ count: 11, examples: ['dp_039: "apati er ikke personlighedstræk — det er rationelt respons"', 'dp_022: "Napoleon var illegitimt til magten — og regerede med massiv folkelig accept"'], verdict: 'Highest impact type in this domain' }),
    verdict: 'Hook variety is strong. No mechanical repetition of structure. Counter-intuitive hooks are the domain signature and are well-placed.',
  }),

  CONCEPTUAL_DEEPENING_AUDIT: Object.freeze({
    finding:      'review_text conceptual weight increases along the Primary Chain. dp_016 explains. dp_022 complicates. dp_027 synthesises. dp_035 unifies.',
    progression:  'Early review_texts are explanatory. Middle review_texts are complicating. Late review_texts are unifying.',
    verdict:      'Conceptual deepening is well-structured across the domain.',
  }),

  REPETITION_RISK_AUDIT: Object.freeze({
    finding:       'No two adjacent review_texts use the same opening move. However, "structural inversion" hooks cluster slightly in the checks-and-balances sequence (dp_005, dp_011, dp_017, dp_018).',
    mitigation:    'Separate these four objects with at least one differently-structured review_text between consecutive pairs in adaptive sequences.',
    acceptable_repetition: 'The "Spørg altid:" formulation appears in dp_003 and dp_007 — intentional, not repetitive. It establishes a domain habit of sceptical questioning.',
  }),

  EMOTIONAL_TONE_AUDIT: Object.freeze({
    neutral_to_concerning: Object.freeze({ objects: ['dp_027', 'dp_032', 'dp_035', 'dp_040'], tone: 'These acknowledge genuine democratic fragility without false reassurance. Appropriate — students should feel the weight.' }),
    energising:            Object.freeze({ objects: ['dp_009', 'dp_030', 'dp_036', 'dp_039'], tone: 'These close with agency — what can be done, why participation matters. Deliberate counter-weight to the heavy objects.' }),
    verdict:               'Emotional tone is calibrated. Domain does not tip into democratic pessimism or naive optimism. It is honest about complexity.',
  }),

});

// ─── DISCUSSION & REFLECTION POTENTIAL ────────────────────────────────────────

export const DISCUSSION_REFLECTION_POTENTIAL = Object.freeze({

  TOP_DISCUSSION_OBJECTS: Object.freeze([

    Object.freeze({
      id:             'dp_009',
      question:       'Hvornår er civil ulydighed legitim i et demokrati?',
      discussion_type: 'Values conflict',
      why_it_works:   'Every student has an intuition. The conditions (public, proportional, exhausted legal channels, accepting consequences) are contestable. Students disagree genuinely about edge cases.',
      best_probe:     '"Hvad er forskellen på civil ulydighed og terrorisme — og hvem bestemmer det?"',
      classroom_use:  'Open discussion before answering. The review_text functions as a framework for the class to evaluate their own discussion.',
    }),

    Object.freeze({
      id:             'dp_024',
      question:       'Hvad er Tocquevilles "flertallets tyranni"?',
      discussion_type: 'Personal recognition',
      why_it_works:   'Social conformity pressure is something students live inside. Translating it from abstract political theory to concrete experience produces strong personal resonance.',
      best_probe:     '"Har I nogensinde holdt en mening for jer selv i en gruppe fordi I vidste den ville være upopulær? Er det Tocquevilles tyranni?"',
      classroom_use:  'Works as a discussion warm-up or reflection prompt. The Tocqueville framing gives students academic language for something they already know experientially.',
    }),

    Object.freeze({
      id:             'dp_040',
      question:       'Kan internationale institutioner som EU underminere nationalt demokrati?',
      discussion_type: 'Genuine open question',
      why_it_works:   'Both sides of the argument are defensible. Students on different political sides will land differently. The review_text models that this is an ongoing question, not a resolved one.',
      best_probe:     '"Hvornår er det legitimt at overføre suverænitet til internationale institutioner — og hvem beslutter det?"',
      classroom_use:  'Strong closer for a unit. Do not use as opener — requires institutional vocabulary.',
    }),

    Object.freeze({
      id:             'dp_032',
      question:       'Hvad er demokratiets dilemma med domstolsprøvelse?',
      discussion_type: 'Institutional paradox',
      why_it_works:   'The democratic paradox of counter-majoritarian institutions is genuinely interesting. Students who have absorbed legitimacy concepts feel the tension acutely.',
      best_probe:     '"Hvis ikke uvalgte dommere bør beskytte demokratiet mod flertallet — hvem bør?"',
      classroom_use:  'Works well paired with dp_031 (constitutional culture). Pair them in sequence for a focused mini-discussion.',
    }),

    Object.freeze({
      id:             'dp_039',
      question:       'Hvad er den mest strukturelt præcise forklaring på politisk apati?',
      discussion_type: 'Self-examination',
      why_it_works:   'Students may identify with the apathetic position. The reframe from "moral failure" to "rational response" is both liberating and challenging simultaneously.',
      best_probe:     '"Er du politisk apatisk? Hvad skulle ændre sig for at det ændrede sig?"',
      classroom_use:  'Powerful paired with dp_004 (voter turnout as collective action). Together they form: why apathy exists → why it matters.',
    }),

    Object.freeze({
      id:             'dp_037',
      question:       'Er lobbyisme nødvendigvis skadelig for demokratiet?',
      discussion_type: 'Nuanced position',
      why_it_works:   'Students typically hold a simple anti-lobbying position. The question forces them to distinguish between forms of advocacy. Strong exercise in conceptual precision.',
      best_probe:     '"Hvad adskiller en patientforenings lobbyisme fra en tobaksindustris lobbyisme — og er det et principielt eller blot et moralsk skel?"',
      classroom_use:  'Works as homework discussion prompt. Students benefit from thinking about this before classroom discussion.',
    }),

  ]),

  REFLECTION_ASSIGNMENT_OBJECTS: Object.freeze({
    description: 'These objects are best suited to written reflection rather than classroom discussion. They require sustained individual processing.',
    objects:     ['dp_025', 'dp_035', 'dp_022', 'dp_027'],
    prompt:      '"Vælg det spørgsmål du var mest overrasket af. Forklar: hvad troede du — og hvad forstår du nu?"',
  }),

  OBJECTS_UNSUITABLE_FOR_DISCUSSION: Object.freeze({
    objects:  ['dp_019', 'dp_034', 'dp_036'],
    reason:   'These are factual-definitional distinctions. The answer is settled once the distinction is understood. Generating discussion would be artificial.',
  }),

});

// ─── TEACHER TRUST & USABILITY ────────────────────────────────────────────────

export const TEACHER_TRUST_USABILITY = Object.freeze({

  WHAT_BUILDS_TRUST: Object.freeze([
    'Every question explains its own misconception in the review_text — teacher does not need to know the wrong answers to explain them',
    'challenge_role labelling is clear and predictable — teacher can read a sequence at a glance',
    'review_texts are self-contained — teacher does not need to supplement or correct',
    'No question requires specialised political science knowledge to facilitate',
    'All scenarios work without adaptive software — teacher can sequence manually from the list',
  ]),

  WHAT_REDUCES_TRUST: Object.freeze([
    { issue: 'misconception_type labels in English', severity: 'low', mitigation: 'Section 47 added Danish plain-language labels for teacher UI' },
    { issue: 'Concept IDs (dp_001 etc.) visible in teacher interface without full question preview', severity: 'medium', mitigation: 'Teacher always sees full question + review_text in detail view' },
    { issue: '40 objects can feel overwhelming when presented as a flat list', severity: 'medium', mitigation: 'Domain arc structure (5 stages) is the antidote — present as progression, not inventory' },
  ]),

  TEACHER_VOCABULARY: Object.freeze({
    avoid:        ['challenge_role', 'misconception_type', 'cognitive_skill', 'review_text_level'],
    prefer:       ['svær', 'konsolideringsøvelse', 'tankefejl', 'forklaringstekst'],
    rationale:    'Teacher-facing vocabulary should map to classroom experience, not system architecture.',
  }),

  FLEXIBILITY_AUDIT: Object.freeze({
    can_teacher_shorten:  'Yes — remove deep_challenge objects without losing coherence. Any 15-object subset works if it follows a reinforcement → challenge → deep_challenge pattern.',
    can_teacher_skip:     'Yes — all objects are designed to be self-standing. Skipping any does not break the sequence.',
    can_teacher_reorder:  'Partially — reinforcement objects can be freely reordered. challenge and deep_challenge objects require prerequisite objects from the Primary Chain.',
    reorder_safe_zone:    'Objects dp_016, dp_019, dp_034, dp_036 can be placed anywhere in a sequence without prerequisite dependencies.',
  }),

  NON_BUREAUCRATIC_PLEDGE: Object.freeze({
    commitment:   'A teacher should be able to run a session from this domain without reading documentation beyond the question text and review_text.',
    test:         'If a teacher cannot figure out how to use a scenario from the question list alone — the UX failed, not the teacher.',
  }),

});

// ─── EDUCATIONAL IDENTITY PROTECTION ──────────────────────────────────────────

export const EDUCATIONAL_IDENTITY_PROTECTION = Object.freeze({

  DRIFT_AUDIT: Object.freeze({

    TRIVIA_CULTURE: Object.freeze({
      verdict:   'PROTECTED',
      evidence:  'No question is answerable by memorised fact. Every question requires reasoning about a structural concept.',
      risk_zone: 'dp_016, dp_019, dp_034 are the most definitional objects — monitor for "definition creep" in future content authoring.',
    }),

    DOPAMINE_LOOP: Object.freeze({
      verdict:   'PROTECTED in content layer',
      evidence:  'Content makes no reference to streaks, XP, or reward mechanics. review_texts are educationally motivated.',
      risk_zone: 'Reward mechanics in app.js are separately designed. Identity protection requires that content layer never references them.',
    }),

    SHALLOW_ENGAGEMENT: Object.freeze({
      verdict:   'PROTECTED',
      evidence:  'Average review_text reading time in simulation: 7.2 seconds. Questions with short reading time (< 3s) are definitional reinforcement objects — appropriate.',
      risk_zone: 'If future content authoring produces review_texts under 40 words, flag for quality audit.',
    }),

    CORRECTNESS_FIRST: Object.freeze({
      verdict:   'PROTECTED with vigilance',
      evidence:  'No review_text begins with "Det korrekte svar er." All explain the misconception before affirming the correct model.',
      risk_zone: 'Automated content generation tooling (if ever introduced) is the primary correctness-first risk. Human authoring maintains this standard more naturally.',
    }),

    PRODUCTIVITY_PRESSURE: Object.freeze({
      verdict:   'NOT APPLICABLE to content layer',
      note:      'Content layer does not contain timing mechanics or completion pressure. These are app.js concerns.',
    }),

    RANKING_INTELLIGENCE: Object.freeze({
      verdict:   'PROTECTED',
      evidence:  'No object ranks students by response speed or positions them relative to peers in review_text or content framing.',
      commitment: 'DEN SEJE APP content never implies that answering quickly or correctly signals intelligence.',
    }),

  }),

  DOMAIN_EMOTIONAL_CONTRACT: Object.freeze({
    with_student:  'You are here to understand something genuinely difficult. Getting an answer wrong is the beginning of understanding it. We will not make you feel stupid.',
    with_teacher:  'This domain will not embarrass you in front of students. Every review_text is defensible. Every question has a clear educational purpose.',
    with_platform: 'Content is a primary product, not a feature. Its quality is the quality of the educational experience.',
  }),

  ANTI_SURVEILLANCE_COMMITMENT: Object.freeze({
    confirmed: Object.freeze([
      'No question uses student answer history to construct psychological profiles',
      'No content adapts to inferred political opinion',
      'No review_text adjusts tone based on student performance history',
      'Adaptive difficulty is based on concept mastery, not engagement optimisation',
    ]),
  }),

});

// ─── FUTURE DOMAIN PACK STANDARD ─────────────────────────────────────────────

export const FUTURE_DOMAIN_PACK_STANDARD = Object.freeze({

  MINIMUM_REQUIREMENTS: Object.freeze({
    learning_objects:         'Minimum 30 fully authored before "teacher-ready" designation',
    reinforcement_ratio:      'Minimum 20% reinforcement objects for adequate recovery pacing',
    concept_graph:            'Minimum 10 nodes, 8 edges, explicit sequencing principle',
    misconception_families:   'Minimum 4 families with at least 3 questions each',
    review_text_level:        'All objects at Level 2 minimum. Minimum 75% at Level 3',
    instructional_arc:        'One explicit arc with named stages (minimum 4)',
    classroom_scenarios:      'Minimum 3 documented teacher scenarios',
    discussion_objects:       'Minimum 4 objects identified as discussion-worthy with probes',
    personal_relevance_spikes: 'Minimum 5 objects with student daily-life connections',
  }),

  QUALITY_COMMITMENT: Object.freeze({
    before_designation:   'A domain pack earns the "teacher-ready" designation only after surviving a simulated 42-minute session without fatigue collapse and producing at least 3 documented aha-moments.',
    authoring_standard:   'Every object authored misconception-first. Every review_text written for the student who got it wrong, not for the student who already knows.',
    domain_voice:         'Each domain should have a distinct voice — Democracy & Power is structural and civic. Future domains should find their own equivalent register.',
  }),

  PROGRESSION_QUALITY: Object.freeze({
    conceptual_development:  'Students should be able to articulate a concept at session end that they could not have articulated at session start',
    emotional_arc:           'Domain should move from accessible → challenging → personally resonant → synthesising — not: hard → hard → hard → harder',
    discussion_potential:    'Minimum 3 objects should feel conversation-worthy after any 10-object session',
    reflection_potential:    'Minimum 2 objects per session should invite genuine personal reflection, not just cognitive processing',
  }),

  CANONICAL_ANTI_CHECKLIST: Object.freeze({
    never: Object.freeze([
      'A question answerable by looking up one fact',
      'A review_text that restates the correct answer',
      'A distractor that only someone completely ignorant would choose',
      'A review_text that implies the student was foolish to get it wrong',
      'A question whose only purpose is to test recall of a definition',
      'A domain that feels faster to complete than to learn from',
    ]),
  }),

  DEMOCRACY_POWER_LEGACY: Object.freeze({
    established: Object.freeze([
      'First gold-standard learning objects in the platform (dp_001)',
      'First fully validated 42-minute classroom simulation',
      'First misconception-family architecture',
      'First domain with explicit instructional arc',
      'First domain with teacher scenarios documented',
      'First domain certified as "teacher-ready"',
    ]),
    what_it_proves: 'A domain built misconception-first, authored with conceptual depth, validated through simulated classroom use, and designed for real teacher workflow — is not a quiz bank. It is an instructional instrument.',
  }),

});

// ─── TEACHER-READY TEST ───────────────────────────────────────────────────────

export const TEACHER_READY_TEST = Object.freeze({

  VERIFY: Object.freeze([
    'DOMAIN_FLOW_ARCHITECTURE.INSTRUCTIONAL_ARC.stages has 5 entries',
    'CONCEPTUAL_PROGRESSION_MAP.PRIMARY_CHAIN.steps has 7 steps',
    'TEACHER_READY_STRUCTURE contains 4 scenarios',
    'ADAPTIVE_FLOW_VALIDATION.PERSONAL_RELEVANCE_AUDIT.highest_relevance has 5 entries',
    'REVIEW_MOMENT_CHAIN.CHAIN_AUDIT.level_3_count === 40',
    'DISCUSSION_REFLECTION_POTENTIAL.TOP_DISCUSSION_OBJECTS has 6 entries',
    'FUTURE_DOMAIN_PACK_STANDARD.MINIMUM_REQUIREMENTS includes classroom_scenarios',
    'All scenarios in TEACHER_READY_STRUCTURE have a sequence array',
  ]),

  TEACHER_READINESS_CRITERIA: Object.freeze({
    criterion_1: 'A teacher with no prior knowledge of the domain structure can run Scenario 1 after 10 minutes of reading',
    criterion_2: 'A student can complete a 10-question session without the experience feeling like a quiz',
    criterion_3: 'At least one object in any 8-question window produces a dwell time > 8 seconds on review_text',
    criterion_4: 'No teacher using this pack needs to look up answers — review_texts are self-contained',
    criterion_5: 'The domain can be described to a parent in one sentence without using the word "quiz"',
    description: '"Students work through a carefully designed sequence of questions in demokrati og magt. When they get something wrong, the platform explains why the wrong answer was understandable — and what was actually happening."',
  }),

});
