// ── Learning Experience & Pedagogical Depth Contract v1 ──────────────────────
// Defines how learning actually feels in DEN SEJE APP — the cognitive,
// emotional, and psychological quality of the act of learning itself.
//
// PHILOSOPHY: Rewarding answers is the floor, not the ceiling. The deepest
// educational systems create curiosity, discovery, insight, and the quiet
// satisfaction of genuine understanding. This file defines what it means to
// learn well — not just to answer correctly.
//
// This file answers: HOW DOES IT FEEL TO LEARN HERE?
//
// Complements:
//   educational-meaning.js   — WHAT DOES PROGRESSION MEAN
//   platform-coherence.js    — HOW THE PLATFORM FEELS AS ONE THING
//   avatar-continuity.js     — HOW THE CHARACTER PERSISTS
//
// All future question design, feedback systems, pacing decisions, and
// interaction patterns should be evaluated against this contract.

// ── Learning Experience Audit ─────────────────────────────────────────────────
// What learning currently feels like — and where the gaps are.

export const LEARNING_EXPERIENCE_AUDIT = Object.freeze({
  STRENGTHS: [
    {
      area:    'Quiz state machine (IDLE → LOADING → AWAITING → SUBMITTING → TRANSITIONING)',
      finding: 'Clean, predictable flow. The student is never confused about what state they are in.',
    },
    {
      area:    'Feedback timing (150ms correct/incorrect response)',
      finding: 'Fast enough to feel immediate, controlled enough to not feel rushed.',
    },
    {
      area:    'Review feedback field (#review-feedback)',
      finding: 'The infrastructure for showing the correct answer exists. This is the most important pedagogical moment in the quiz.',
    },
    {
      area:    'XP bar progression (350ms ease)',
      finding: 'Satisfying, proportional, never disruptive. Feels like earned acknowledgment.',
    },
    {
      area:    'Reduced-motion support',
      finding: 'Accessible by design. Students with motion sensitivity are not excluded.',
    },
  ],
  GAPS: [
    {
      area:     'Review feedback content quality',
      finding:  'The infrastructure exists, but the pedagogical depth of the review text is the most important open variable. A review that merely restates the correct answer teaches less than one that briefly explains why.',
      severity: 'HIGH — the highest-leverage pedagogical investment in the platform',
    },
    {
      area:     'Question sequencing philosophy',
      finding:  'No documented philosophy for how questions are ordered or paced. Random ordering may produce cognitive fatigue patterns (too many hard questions consecutively) or shallow engagement (too many easy ones).',
      severity: 'MED',
    },
    {
      area:     'Cognitive pacing within a session',
      finding:  'No mechanism for deliberate cognitive breathing room — alternating challenge levels, moment of consolidation, or rhythm variation.',
      severity: 'MED',
    },
    {
      area:     'Discovery and insight support',
      finding:  'The current quiz loop is answer-process-next. There is no designed space for "aha" moments, conceptual connections, or reflective pauses.',
      severity: 'MED',
    },
    {
      area:     'Wrong-answer pedagogical moment',
      finding:  'The shake animation correctly communicates "that path is closed." But the review feedback that follows is the actual learning moment — it must not be an afterthought.',
      severity: 'HIGH',
    },
    {
      area:     'Long-session cognitive texture',
      finding:  'After 40 questions, the quiz experience is structurally identical to the first question. This is cognitively flat. Real learning benefits from rhythm variation.',
      severity: 'LOW — not a current product failure, but a long-term depth opportunity',
    },
  ],
});

// ── Question Design Contract ──────────────────────────────────────────────────
// What makes a question good in this educational universe.
// This is a brief for question authors, not a technical specification.

export const QUESTION_DESIGN_CONTRACT = Object.freeze({
  CORE_PRINCIPLE: 'A good question makes the student curious about the answer before they know what it is.',

  QUALITIES_OF_A_GOOD_QUESTION: {
    CURIOSITY_ACTIVATION: {
      description: 'The question itself is interesting — the student wants to know the answer',
      test:        'Would the student be curious about this question if they saw it in a book, with no XP attached?',
      anti_pattern: 'Questions that feel like bureaucratic checkpoints — "which year was X?" without context that makes it matter',
    },
    CONCEPTUAL_CLARITY: {
      description: 'The question tests genuine understanding, not surface recall',
      test:        'Could a student who understood the concept answer this correctly — even if they had not memorised this specific fact?',
      anti_pattern: 'Gotcha questions designed to trip up students who understand but have not memorised a specific phrasing',
    },
    MEANINGFUL_CHALLENGE: {
      description: 'The question presents genuine cognitive engagement — not trivial, not overwhelming',
      test:        'Is the student stretched — but not snapped?',
      anti_pattern: 'Artificially difficult questions that test edge-case trivia rather than core understanding',
    },
    INSIGHT_POTENTIAL: {
      description: 'The correct answer — especially after a wrong attempt — has the potential to create genuine insight',
      test:        'Would a student who got this wrong and then saw the correct answer feel that they learned something?',
      anti_pattern: 'Questions where the correct answer is arbitrary and provides no understanding',
    },
    INTELLECTUAL_RESPECT: {
      description: 'The question treats the student as a thinking person, not a memory bank',
      test:        'Does the question invite reasoning, or just retrieval?',
      anti_pattern: 'Pure rote recall without contextual anchoring that makes the fact meaningful',
    },
  },

  REVIEW_FEEDBACK_PHILOSOPHY: {
    principle:   'The review feedback shown after a wrong answer is the highest-leverage pedagogical moment in the platform',
    GOOD:        'Brief (1–2 sentences), explanatory (tells the student WHY), memorable (creates a mental anchor), calm (informational not judgmental)',
    NOT_GOOD:    'Just restating the correct answer. "The answer is X." — this is a correction, not an explanation.',
    example_bad:  'Svaret var: 1789',
    example_good: 'Den Franske Revolution begyndte i 1789 — det år Bastillen stormededes og det gamle regime begyndte at krakelere.',
    tone:        'The voice of a thoughtful teacher who finds this genuinely interesting — not a test answer key',
  },

  WRONG_ANSWER_OPTIONS: {
    principle:   'In multiple-choice, wrong answer options should be thoughtfully wrong — not randomly wrong',
    GOOD:        'Wrong options that represent common misconceptions or genuinely confusable alternatives',
    NOT_GOOD:    'Wrong options so obviously wrong they make the question trivially easy',
    purpose:     'Thoughtfully wrong options make the question intellectually honest and more cognitively engaging',
  },
});

// ── Curiosity Architecture ────────────────────────────────────────────────────
// Systems and design patterns that encourage wondering, exploration, and
// the intrinsic desire to understand.

export const CURIOSITY_ARCHITECTURE = Object.freeze({
  CORE_PRINCIPLE: 'Curiosity cannot be manufactured — but it can be protected. Remove the things that kill it: anxiety, urgency, shame, and meaningless repetition.',

  CURIOSITY_KILLERS: [
    'Time pressure — the student rushes to an answer before they have fully engaged with the question',
    'Shame on wrong answers — the student becomes risk-averse rather than exploratory',
    'Meaningless repetition — the student knows the answer before they finish reading the question',
    'Reward salience — when the XP popup is more visually prominent than the review feedback, the student reads the reward before the insight',
    'Cognitive overload — too many consecutive hard questions breaks the exploratory state',
    'Competitive pressure — if the student is thinking about rank while answering, they are not thinking about the question',
  ],

  CURIOSITY_SUPPORTS: [
    'Question framing that hints at why the answer matters — not just what it is',
    'Review feedback that briefly illuminates the "why" — creating a small story around the correct answer',
    'A calm, unhurried interface that does not rush the student to the next question',
    'Challenge variation that creates contrast — after a hard question, an accessible one restores curiosity',
    'The absence of time pressure — the student can sit with a question',
    'Interesting wrong answer options that make the question a genuine puzzle',
  ],

  PATTERN_RECOGNITION_SUPPORT: {
    principle:   'The most satisfying cognitive experience is noticing a pattern — connecting this question to previous knowledge',
    design:      'Review feedback can explicitly make connections: "like the previous question about X, this also involves Y principle"',
    long_term:   'A student who has answered 500 questions and notices conceptual recurrences across them is experiencing genuine deep learning',
  },

  DISCOVERY_JOY: {
    principle:   'The feeling of "I didn\'t know that, but now I do, and it\'s interesting" is the core emotional product the platform delivers',
    design:      'Every wrong answer followed by a genuine explanatory insight is a discovery moment. The platform\'s highest quality output.',
    frequency:   'Even one genuine discovery per session is sufficient. Not every question needs to be revelatory.',
  },
});

// ── Challenge & Mastery Rhythm ────────────────────────────────────────────────
// Healthy challenge pacing — engaging and sustainable over long sessions.

export const CHALLENGE_MASTERY_RHYTHM = Object.freeze({
  CORE_PRINCIPLE: 'Challenge is not a dial to turn up — it is a rhythm to maintain. The goal is engagement, not difficulty.',

  CHALLENGE_WAVE_PHILOSOPHY: {
    description:  'Cognitive engagement is naturally rhythmic — periods of stretch followed by periods of consolidation',
    pattern:      'Hard → accessible → hard → accessible. Not monotone escalation, not constant intensity.',
    outcome:      'The accessible question after a hard one is not a relief from learning — it is consolidation of what was just encountered',
    anti_pattern: 'Linear escalation that presumes the student must always be at the edge of their capability',
  },

  MASTERY_STABILIZATION: {
    description:  'After a student answers several questions correctly in an area, they need a period of stable success before the next challenge level',
    purpose:      'Confidence is built on consistent success at a level before moving up. Premature escalation prevents mastery consolidation.',
    signal:       'A student answering 3–4 consecutive questions correctly should feel settled, not immediately challenged again',
  },

  COGNITIVE_BREATHING_ROOM: {
    description:  'Not every question in a session should require maximum cognitive effort',
    design:       'Questions that feel familiar and accessible serve a function — they let the student feel competent, restore confidence, and consolidate recent learning',
    anti_pattern: '"Easy questions are wasted time." They are not. They are recovery and consolidation.',
  },

  FLOW_STATE_SUPPORT: {
    description:  'The challenge-skill balance known to produce flow: challenging enough to require attention, accessible enough to feel achievable',
    design:       'The quiz state machine is already well-suited to flow — clean transitions, no distractions, predictable structure. The challenge level of the questions is what determines whether flow occurs.',
    protection:   'The calm interface, unhurried pacing, and absence of anxiety-inducing elements all support flow entry and maintenance',
  },

  HEALTHY_DIFFICULTY_LANGUAGE: {
    principle:   'Difficulty should be framed as "this question requires more thinking" — not "this is a hard question"',
    implication: 'The platform\'s visual and emotional language should not signal that difficulty is bad or that easy questions are unchallenging — both are valuable.',
  },
});

// ── Wrong Answer Experience Design ────────────────────────────────────────────
// The pedagogical and emotional design of the most important learning moment.

export const WRONG_ANSWER_EXPERIENCE = Object.freeze({
  CORE_PRINCIPLE: 'A wrong answer is the beginning of learning — not the end of an attempt.',

  THE_LEARNING_MOMENT_SEQUENCE: {
    MOMENT_1: { ms: '0–150',     event: 'Incorrect feedback (shake animation, error color)',       purpose: 'Signal: that path is closed. Brief, mechanical, non-emotional.' },
    MOMENT_2: { ms: '150–400',   event: 'Avatar enters FOCUSED breathing state',                   purpose: 'Signal: attentive recalibration — not distress.' },
    MOMENT_3: { ms: '400–800',   event: 'Correct answer revealed + review feedback appears',        purpose: 'THE LEARNING MOMENT. This must be designed with the most care.' },
    MOMENT_4: { ms: '800–2000',  event: 'Student reads the review feedback',                        purpose: 'Cognitive: the insight is being processed. UI should be quiet.' },
    MOMENT_5: { ms: '2000+',     event: 'Next question loads',                                      purpose: 'The student moves forward with new information.' },
  },

  REVIEW_FEEDBACK_IS_THE_PRODUCT: {
    principle:   'The review feedback text shown after a wrong answer is the highest-value content the platform delivers',
    reason:      'This is the moment when the student\'s cognitive state is most receptive — they were wrong, they are curious about why, they are ready to receive an explanation',
    design:      'The review feedback deserves the most editorial attention of any text on the platform',
    length:      '1–2 sentences. Enough to illuminate. Not so much that it feels like a lecture.',
    tone:        'Warm, matter-of-fact, genuinely interesting — the voice of a knowledgeable friend',
  },

  EMOTIONAL_SAFETY_REQUIREMENTS: {
    NO_SHAME:        'No visual, copy, or animation that communicates judgment of the student',
    NO_URGENCY:      'The transition to the review feedback is calm — not rushed past the wrong state',
    NO_COMPARISON:   'No indication of how other students did on this question',
    NO_PENALTY:      'No XP deduction, no coin penalty, no streak impact for individual wrong answers',
    NO_ACCUMULATION: 'The emotional state of being wrong does not carry over to the next question — each question starts fresh',
  },

  WRONG_AS_OPPORTUNITY: {
    insight:     'Students who answer incorrectly and then read a genuine explanation are in the optimal state for deep learning — engaged, curious, receptive',
    design:      'The wrong-answer flow should feel like entering a learning moment, not surviving a failure',
    long_term:   'A student who has made 500 mistakes on this platform and received 500 genuine explanations has had 500 learning moments. That is extraordinary.',
  },
});

// ── Discovery & Insight Design ────────────────────────────────────────────────
// How the platform supports "aha" moments, conceptual realization, and the
// emotional experience of understanding.

export const DISCOVERY_INSIGHT_DESIGN = Object.freeze({
  CORE_PRINCIPLE: 'The feeling of understanding something you did not understand before is the deepest emotional product the platform can deliver. Design for this.',

  TYPES_OF_INSIGHT: {
    FACTUAL_DISCOVERY:    'Learning a fact that is genuinely surprising or interesting — "I didn\'t know that"',
    CONCEPTUAL_LINKING:   'Connecting this question to something previously learned — "this is like the other thing"',
    REFRAMING:            'A wrong answer reveals that a misconception has been corrected — "I thought X, but actually Y"',
    PATTERN_RECOGNITION:  'Noticing a recurring principle across different question domains — "this applies to everything"',
    COMPETENCE_MOMENT:    'Answering a hard question correctly and feeling genuinely capable — not just lucky',
  },

  DESIGN_PRINCIPLES_FOR_INSIGHT: {
    SPACE:           'Insight requires cognitive space — a moment to register. The quiz transition timing should not rush past the review feedback.',
    SURPRISE:        'The best review feedback creates mild surprise — the explanation is slightly more interesting than expected',
    CONNECTION:      'Review feedback that links the new information to something the student likely already knows creates stronger retention',
    BREVITY:         'Short explanations are processed more deeply than long ones. One good sentence outweighs three adequate ones.',
    WARMTH:          'The tone of the explanation affects how it is received. A warm, interested voice is more effective than a clinical, textbook voice.',
  },

  THE_AHA_MOMENT_ENVIRONMENT: {
    description:   'Some conditions make insight more likely',
    SUPPORTS:      ['A calm, unhurried interface that does not rush the student', 'Review feedback that is genuinely explanatory', 'A wrong answer that has created genuine curiosity about why', 'The absence of anxiety about performance or rank'],
    PREVENTS:      ['Time pressure', 'Shame about wrong answers', 'Reward animations that pull attention from the insight', 'Cognitive overload from consecutive hard questions'],
  },
});

// ── Cognitive Pacing & Long-Session Learning ──────────────────────────────────
// How the platform feels cognitively after 20–40 minutes of continuous use.

export const COGNITIVE_PACING = Object.freeze({
  CORE_PRINCIPLE: 'Sustained intellectual engagement is different from sustained activity. The goal is for the student to still be thinking — not just answering.',

  FATIGUE_PATTERNS: {
    COGNITIVE_FLATTENING: {
      description: 'After many questions, the student processes answers mechanically rather than thoughtfully',
      cause:       'Monotone question structure, no rhythm variation, no sense of accumulating understanding',
      signal:      'The student is answering quickly and correctly but not learning — pattern-matching rather than understanding',
    },
    REWARD_EXHAUSTION: {
      description: 'The XP and coin rewards become invisible — the student stops registering them',
      cause:       'Consistent reward stimuli habituate — the nervous system stops responding to them',
      implication: 'This is actually healthy. The reward is doing its job of acknowledging, not dominating. Intrinsic engagement should take over.',
    },
    CHALLENGE_MONOTONY: {
      description: 'Every question feels like the same level of effort',
      cause:       'No deliberate rhythm variation in question difficulty',
      remedy:      'Deliberate cognitive breathing room — accessible questions that restore confidence and consolidate learning',
    },
  },

  LONG_SESSION_DESIGN_PRINCIPLES: [
    'Rhythm variation: a sequence of question difficulties should feel like waves, not a flat line',
    'Cognitive consolidation: after 15–20 questions, a brief natural pause point (even just visual breathing room) supports retention',
    'Progress awareness: the student should occasionally be able to feel the arc of a session — not just the current question',
    'Intrinsic engagement: after the extrinsic rewards have habituated, genuine curiosity and mastery satisfaction should carry the session',
    'Stop-gracefully design: the platform should make it easy to stop at a satisfying moment — not create artificial cliffhangers that trap the student',
  ],

  COGNITIVE_LOAD_MANAGEMENT: {
    principle:   'The interface should carry as little cognitive load as possible, so the student\'s full attention is on the question',
    implications: [
      'The UI should be visually calm during question engagement — no competing animations',
      'Navigation and utility elements should not demand attention while a question is active',
      'The avatar breathing at 52px should be calm enough not to pull focus from the question text',
    ],
  },
});

// ── Pedagogical Emotional Design ──────────────────────────────────────────────
// The emotional tone of the act of learning itself.

export const PEDAGOGICAL_EMOTIONAL_DESIGN = Object.freeze({
  CORE_PRINCIPLE: 'Learning should feel safe, curious, and occasionally delightful — never urgent, shameful, or performative.',

  EMOTIONAL_REGISTER_OF_LEARNING: {
    CALM_FOCUS:          'The baseline emotional state of engaged learning. Alert but not tense.',
    SAFE_CURIOSITY:      'The student can wonder freely — including about questions they are uncertain about — without fearing the consequence of being wrong.',
    THOUGHTFUL_CHALLENGE: 'Difficulty is experienced as invitation rather than threat. "This requires thinking" rather than "this is a test of my worth."',
    INTELLECTUAL_WARMTH:  'The platform treats the student as a thinking person who finds things interesting. Not as a score to optimise.',
    COMPOSED_PROGRESS:    'The feeling of moving forward steadily — not racing, not stalling, but making sustained, meaningful progress.',
    RESILIENT_PERSISTENCE: 'After a wrong answer, the student returns to CALM_FOCUS rather than collapsing into anxiety.',
  },

  FORBIDDEN_LEARNING_EMOTIONS: {
    URGENCY:                 'The student should never feel they are running out of time to understand something',
    PANIC:                   'Difficulty should never trigger an anxiety response',
    PERFORMANCE_THEATER:     'The student should not feel they are being watched and judged, but rather that they are thinking privately',
    COMPETITIVE_INTELLIGENCE: '"I must be smarter than the other students" as a motivator — this is extrinsic and produces brittle, anxiety-driven learning',
    SHAME_ACCUMULATION:      'Each wrong answer starting fresh — not a running tally of inadequacy',
  },

  EDUCATIONAL_WARMTH_PRINCIPLE: {
    description: 'The platform should feel like learning with a knowledgeable, patient, interested companion — not like taking an exam',
    avatar_role: 'The avatar\'s calm presence, stable breathing, and composed neutral expression reinforce this emotional register. It is attentive but not evaluating.',
    tone_role:   'The review feedback voice, the feedback text, the level-up language — all should carry the same warmth and intellectual interest',
  },
});

// ── Future Learning Universe ──────────────────────────────────────────────────
// How the pedagogical principles scale into a lasting, psychologically healthy
// educational ecosystem.

export const FUTURE_LEARNING_UNIVERSE = Object.freeze({
  DEEP_LEARNING_CULTURE: {
    principle:  'The platform should cultivate a culture where depth is valued — not just speed or volume',
    signals:    ['A student who takes time with a question is rewarded the same as one who answers quickly', 'Review feedback that reveals genuine intellectual interest in the subject', 'Achievements that mark understanding depth, not just answer count'],
  },
  HEALTHY_MASTERY: {
    principle:  'Mastery should feel like a deepening relationship with a subject — not a completion bar',
    design:     'The student who has answered 1000 questions about mathematics should feel that mathematics has become more interesting, not less',
    anti_pattern: 'The student who has answered 1000 questions and feels they have "finished" mathematics',
  },
  LIFELONG_CURIOSITY: {
    principle:  'The best outcome for a student using this platform is that they become more curious about the world outside the platform',
    test:       'Has the platform made the student more likely to ask questions independently — in class, at home, about what they see around them?',
    design:     'Review feedback that gestures toward the larger subject — "this is part of a bigger question about X" — supports curiosity beyond the quiz',
  },
  CLASSROOM_INTEGRATION_PHILOSOPHY: {
    principle:  'The pedagogical design must be compatible with how good teachers think about learning',
    means:      ['Questions that test genuine understanding, not gotcha trivia', 'Wrong-answer experiences that model healthy mistake culture', 'Progress that teachers can point to as evidence of genuine learning'],
  },
  REFLECTIVE_GROWTH: {
    principle:  'The deepest learning is retrospective — the student who looks back and sees how much they have understood is more motivated than the student counting forward toward a goal',
    design:     'The platform\'s progression system should feel as meaningful looking backward as looking forward',
  },
});

// ── Pedagogical Depth Test ────────────────────────────────────────────────────
// Eight questions for evaluating any question, feedback, or learning system.

export const PEDAGOGICAL_TEST = Object.freeze([
  'Would the student be curious about this question even without XP attached?',
  'If the student got this wrong, would the review feedback make them genuinely understand — not just know the correct answer?',
  'Does this learning moment protect curiosity — or does it produce anxiety, urgency, or shame?',
  'After a 40-minute session, does the student feel intellectually enriched — or just tired and rewarded?',
  'Would a thoughtful teacher look at this question and feel it respects the student\'s intelligence?',
  'Does this system make wrong answers feel like learning moments — not punishments?',
  'Is the interface quiet enough during the question that the student\'s full attention is on the material?',
  'In five years, will students who used this platform be more curious about the world — or just better at answering this platform\'s questions?',
]);
