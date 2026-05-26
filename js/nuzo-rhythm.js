// Section 51 — NUZO Adaptive Learning Rhythm & Conceptual Tension Calibration
//
// NUZO = Zone of Proximal Development (ZPD)-informed adaptive rhythm architecture.
//
// Core principle: adaptation through CONCEPTUAL TENSION management — not difficulty escalation.
// The system asks WHAT KIND of challenge a learner is ready for, not HOW HARD it should be.
//
// ZPD definition (Vygotsky):
//   The space between what a learner can do alone and what they can do with support.
//   Optimal learning happens at the EDGE of current understanding — not beyond it.
//   Beyond ZPD = anxiety. Below ZPD = boredom. Inside ZPD = growth.

export const NUZO_PHILOSOPHY = {
  name: 'NUZO — Zone of Proximal Development-Informed Adaptive Rhythm',
  principle: 'Adapt through conceptual tension management, not difficulty escalation',
  anti_pattern: 'Difficulty ladders, performance ranking, punishment loops, optimization pressure',
  goal: 'Sustainable intellectual growth — not maximal challenge',
  emotional_contract: 'Psychological safety, educational dignity, humane pacing',
  adaptation_signal: 'Conceptual readiness — not correct-answer count',
  core_insight: 'A learner grows at the edge of their understanding. The system's job is to find that edge — not to push past it.',
};

// Eight dimensions that collectively describe CONCEPTUAL TENSION.
// These are NOT difficulty scores. They describe the nature of the challenge.
export const TENSION_DIMENSIONS = [
  {
    id: 'abstraction_depth',
    danish: 'Abstraktionsdybde',
    description: 'How far the concept is from concrete, observable reality. High abstraction requires learner to operate without sensory anchors.',
    example_low: 'dp_016 — legitimitet som hverdagsbegreb',
    example_high: 'dp_022 — legitimitet uden legalitet (Weber-analyse)',
  },
  {
    id: 'misconception_destabilization',
    danish: 'Misforståelsesdestabilisering',
    description: 'How aggressively the question challenges a held belief. High destabilization requires emotional safety to process.',
    example_low: 'dp_034 — definitional distinction (desinformation vs misinformation)',
    example_high: 'dp_026 — populisme destabiliserer folkesuverenitetsforståelsen',
  },
  {
    id: 'cognitive_load',
    danish: 'Kognitiv belastning',
    description: 'Number of simultaneous concepts the learner must hold. High load requires prior stabilization.',
    example_low: 'dp_005 — ét princip: magtadskillelse',
    example_high: 'dp_032 — domstolsprøvelse (demokrati + flertal + grænser + uvalgte + legitimitet)',
  },
  {
    id: 'emotional_intensity',
    danish: 'Emotionel intensitet',
    description: 'How personally or politically charged the concept is. High intensity requires trust in the platform.',
    example_low: 'dp_013 — gratis-rider-problemet (analytisk)',
    example_high: 'dp_024 — flertallets tyranni og cancel culture',
  },
  {
    id: 'reflection_demand',
    danish: 'Refleksionskrav',
    description: 'Whether the question requires the learner to pause and reconsider a prior assumption. Cannot be rushed.',
    example_low: 'dp_019 — definition efterfulgt af bekræftelse',
    example_high: 'dp_008 — revolutioner reproducerer magtstrukturer (kontraintuitiv)',
  },
  {
    id: 'synthesis_complexity',
    danish: 'Syntesekompleksitet',
    description: 'Whether the answer requires combining multiple concepts into a new understanding.',
    example_low: 'dp_016 — recall af legitimitetsdefinition',
    example_high: 'dp_035 — demokratisk overlevelse som normativt valg (Levitsky/Ziblatt)',
  },
  {
    id: 'recovery_requirement',
    danish: 'Genopbygningsbehov',
    description: 'How much stabilization is needed after this object before the next challenge.',
    high_recovery: ['dp_024', 'dp_026', 'dp_032', 'dp_035', 'dp_040'],
    low_recovery: ['dp_016', 'dp_019', 'dp_034', 'dp_036'],
  },
  {
    id: 'personal_relevance',
    danish: 'Personlig resonans',
    description: 'Whether the concept connects to the learner\'s daily life. High relevance accelerates consolidation.',
    example_high: 'dp_021 — ekkokamre (algoritmefeed, sociale medier)',
    example_high_2: 'dp_039 — politisk apati (rationel passivitet)',
  },
];

// Wave phases re-interpreted through NUZO lens.
// Each phase is a learning rhythm state, not a performance bracket.
export const WAVE_PHASE_NUZO = {
  recovery: {
    danish: 'Genopbygning',
    trigger: '2+ forkerte i træk',
    rhythm_state: 'Stabilisering efter destabilisering',
    goal: 'Genopbyg kognitiv base — ikke test fejl',
    prefers: {
      difficulty_type: 'factual',
      cognitive_skill: 'recall',
      insight_type: 'conceptual_bridge',
      challenge_role: 'reinforcement',
    },
    teacher_signal: 'Eleven er midlertidigt ude af ZPD — systemet søger genindtræden',
    anti_pattern: 'Fortsæt med svære spørgsmål fordi eleven "burde forstå det"',
  },
  reinforcement: {
    danish: 'Stabilisering',
    trigger: '1 forkert',
    rhythm_state: 'Konsolidering af ustabil forståelse',
    goal: 'Befæst begrebet — reducer kognitiv load — tilbyd perspektivskifte',
    prefers: {
      difficulty_type: 'conceptual',
      cognitive_skill: 'comprehension',
      insight_type: 'reframing',
      challenge_role: 'reinforcement',
    },
    teacher_signal: 'Eleven er i grænseomraadet — systemet konsoliderer før næste spænding',
    anti_pattern: 'Sæt eleven tilbage i rotation omgående efter ét fejlsvar',
  },
  challenge: {
    danish: 'Tankespænding',
    trigger: 'Neutral / baseline',
    rhythm_state: 'Produktiv kognitiv spænding',
    goal: 'Introducer ny begrebsvinkel — udford forståelsen uden at overvælde',
    prefers: {
      difficulty_type: 'conceptual',
      insight_type: 'conceptual_bridge',
      challenge_role: 'challenge',
    },
    teacher_signal: 'Eleven er i ZPD — systemet introducerer afpasset begrebsspænding',
    anti_pattern: 'Opfatte denne fase som "let" og eskalere kunstigt',
  },
  deep_challenge: {
    danish: 'Begrebsovergang',
    trigger: '3+ korrekte i træk',
    rhythm_state: 'Abstraktion shift — kræver syntese',
    goal: 'Flyt abstraktionsniveau — kræv at eleven forbinder begreber på ny',
    prefers: {
      difficulty_type: 'analytical',
      cognitive_skill: 'synthesis',
      insight_type: 'perspective_shift',
      challenge_role: 'deep_challenge',
    },
    teacher_signal: 'Eleven er over ZPDs bund — systemet udforsker den øvre kant',
    anti_pattern: 'Opfatte dette som "belønning" for gode præstationer',
  },
};

// Misconception families and their recovery requirements.
// causal_inversion requires the most careful recovery — learner has inverted cause/effect.
export const MISCONCEPTION_RECOVERY_MAP = {
  surface_association: {
    danish: 'Overfladekoblingsforvirring',
    recovery_speed: 'moderate',
    stepping_stones: false,
    approach: 'Vis præcist HVAD der fejlagtigt kobles — definer begge begreber separat',
    example_dp: ['dp_001', 'dp_013', 'dp_016'],
  },
  overgeneralization: {
    danish: 'Overgeneralisering',
    recovery_speed: 'moderate',
    stepping_stones: true,
    approach: 'Introducer modsætningseksempel — vis grænsen for det generelle princip',
    example_dp: ['dp_002', 'dp_005', 'dp_009'],
  },
  false_equivalence: {
    danish: 'Falsk ækvivalens',
    recovery_speed: 'slow',
    stepping_stones: true,
    approach: 'Vis den præcise forskel — undgå "men begge er..." — kræver definitional precision',
    example_dp: ['dp_003', 'dp_006', 'dp_015', 'dp_019'],
  },
  causal_inversion: {
    danish: 'Kausal inversion',
    recovery_speed: 'very_slow',
    stepping_stones: true,
    emotional_support: true,
    approach: 'Genopbyg årsagskæden fra bund — eleven har byttet om på årsag og virkning. Kræver konkrete eksempler. Mest krævende misforståelsestype.',
    example_dp: ['dp_007', 'dp_011', 'dp_022', 'dp_029'],
  },
  authority_bias: {
    danish: 'Autoritetsbias',
    recovery_speed: 'slow',
    stepping_stones: true,
    approach: 'Udskift "hvem siger det" med "hvad siger strukturen" — skift fokus fra person til system',
    example_dp: ['dp_008', 'dp_012', 'dp_025', 'dp_035'],
  },
  scope_confusion: {
    danish: 'Kontekstforvirring',
    recovery_speed: 'moderate',
    stepping_stones: false,
    approach: 'Præcisér det korrekte analyseniveau — individ vs. system, kort vs. lang sigt',
    example_dp: ['dp_004', 'dp_010', 'dp_018', 'dp_024'],
  },
};

// Rhythm roles for the 40 Democracy & Power learning objects.
// Mapped from metadata.challenge_role — NOT a difficulty score.
export const DEMOCRACY_POWER_RHYTHM_ROLES = {
  stabilisering: {
    count: 6,
    objects: ['dp_005', 'dp_016', 'dp_019', 'dp_021', 'dp_034', 'dp_036'],
    function: 'Establish conceptual anchors. Low cognitive load. Safe re-entry after recovery.',
  },
  tankespænding: {
    count: 21,
    objects: [
      'dp_001', 'dp_003', 'dp_004', 'dp_007', 'dp_011', 'dp_012', 'dp_013',
      'dp_014', 'dp_017', 'dp_018', 'dp_020', 'dp_023', 'dp_026', 'dp_028',
      'dp_029', 'dp_030', 'dp_031', 'dp_033', 'dp_037', 'dp_038', 'dp_039',
    ],
    function: 'Introduce productive tension. Challenge misconceptions. Expand conceptual territory.',
  },
  begrebsovergang: {
    count: 13,
    objects: [
      'dp_002', 'dp_006', 'dp_008', 'dp_009', 'dp_010',
      'dp_015', 'dp_022', 'dp_024', 'dp_025', 'dp_027',
      'dp_032', 'dp_035', 'dp_040',
    ],
    function: 'Shift abstraction level. Require synthesis. Demand learner restructure prior understanding.',
  },
};

// Reflection cadence: intentional rhythm alternation.
// The system should not produce constant cognitive pressure.
export const REFLECTION_CADENCE = {
  principle: 'Breathing room is not a pause — it is when consolidation happens',
  pattern: ['tankespænding', 'stabilisering', 'tankespænding', 'tankespænding', 'begrebsovergang', 'stabilisering'],
  after_deep_challenge: 'Always insert stabilisering or tankespænding before next begrebsovergang',
  after_recovery: 'Minimum 2 stabilisering objects before returning to tankespænding',
  after_insight: 'When review_text is long/complex — allow cognitive rest before next challenge',
};

// Emotional safety rules. These are non-negotiable.
export const EMOTIONAL_SAFETY_RULES = [
  'Never imply the learner is "bad at" the subject — wrong answers are learning events, not failures',
  'Never escalate purely because the learner is on a correct streak — growth is not the same as speed',
  'Never return immediately to the misconception that triggered recovery — give conceptual distance first',
  'Never make difficulty visible to the learner — they should feel intellectual growth, not performance metrics',
  'Never use language that implies ranking — this platform has no leaderboard of comprehension',
  'Recovery phases should feel like a natural conversation shift — not a punishment or setback',
];

// Teacher-facing vocabulary for adaptive rhythm.
// Teachers should recognize their own pedagogical language.
export const TEACHER_LANGUAGE = {
  tankespænding: 'Produktiv intellektuel spænding — det øjeblik eleven mærker at de ikke helt ved det endnu',
  stabilisering: 'Konsolidering — systemet befæster forståelsen, inden det introducerer ny kompleksitet',
  genopbygning: 'Støttet genindtræden i ZPD efter destabilisering — som at vende til kendt ground',
  begrebsovergang: 'Abstraktion shift — eleven bevæger sig til et nyt forståelsesniveau',
  refleksionskadence: 'Det intentionelle pusterum der giver begrebet tid til at sætte sig',
  rytmeprofil: 'Hvad slags udfordring dette læreobjekt repræsenterer — ikke hvor svært det er',
};
