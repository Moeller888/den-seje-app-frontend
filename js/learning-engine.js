/**
 * Section 37 — Learning System Engine: Design Contract & Architecture
 *
 * This file documents the philosophy, architecture, and implementation decisions
 * of the learning engine infrastructure added in Section 37.
 *
 * It is NOT an implementation file. It is a living specification:
 * the authoritative reference for WHY this system is built as it is.
 */

// ─── ARCHITECTURE AUDIT ───────────────────────────────────────────────────────

export const ARCHITECTURE_AUDIT = Object.freeze({

  WHAT_EXISTS_TODAY: Object.freeze({
    QUESTION_FLOW: 'get-next-question → question_instances row → process-event → {status, correct_answer}',
    FEEDBACK_LEVEL: 'Level 0: bare correct answer string on incorrect. "❌ Forkert – korrekt svar: 1789"',
    SEQUENCING: 'Due instances first (spaced repetition by next_review_at), then new questions in DB order. No concept awareness.',
    METADATA: 'questions.content = {question, options, correct}. No concepts. No cognitive_skill. No review_text.',
    MISCONCEPTION_TRACKING: 'None. Wrong answers disappear into was_correct=false with no diagnostic signal.',
    CONCEPT_TRACKING: 'None. System knows correctness percentages only.',
    PROGRESSION_SIGNAL: 'XP and coins. No conceptual dimension.',
  }),

  WHAT_SECTION_37_ADDS: Object.freeze({
    METADATA_COLUMN: 'questions.metadata JSONB — teacher-authored learning architecture per question',
    MISCONCEPTION_SIGNAL: 'question_instances.misconception_signal TEXT — diagnostic signal when student answers incorrectly',
    REVIEW_TEXT_FLOW: 'review_text from content or metadata → get-next-question passes it → process-event returns it on incorrect → app.js displays it',
    FEEDBACK_UPGRADE: 'Level 0 → Level 1/2: review_text replaces bare correct-answer string when present',
    MISCONCEPTION_RECORDING: 'process-event fire-and-forget: records misconception_type to question_instances.misconception_signal on incorrect',
    READING_TIME: 'Incorrect delay increases from 2000ms to 3200ms when review_text is present',
  }),

  WHAT_IS_NOT_CHANGED: Object.freeze({
    STATE_MACHINE: 'IDLE → LOADING_QUESTION → AWAITING_ANSWER → SUBMITTING_ANSWER → TRANSITIONING. Unchanged.',
    REWARD_ENGINE: 'XP and coin awards. Unchanged. No new metrics.',
    SPACED_REPETITION: 'next_review_at scheduling. Unchanged.',
    IDEMPOTENCY: 'CAS guards in RPCs. Unchanged.',
    RLS: 'Row-level security. Unchanged.',
    TEST_BEHAVIOR: 'Playwright tests pass identically — review_text is null for all existing questions.',
  }),

});

// ─── METADATA SCHEMA ──────────────────────────────────────────────────────────

export const METADATA_SCHEMA = Object.freeze({

  FIELD_DEFINITIONS: Object.freeze({
    concepts: {
      type: 'TEXT[]',
      description: 'Core concepts this question activates in the student mind',
      examples: ['revolution', 'magt', 'demokrati'],
      purpose: 'Enables concept-graph tracking and intelligent sequencing',
    },
    cognitive_skill: {
      type: 'TEXT (enum)',
      values: ['recall', 'comprehension', 'causal_reasoning', 'transfer', 'synthesis', 'evaluation'],
      description: 'The cognitive operation this question requires',
      purpose: 'Enables cognitive diversity in session sequencing',
    },
    misconception_type: {
      type: 'TEXT (enum)',
      values: ['recall_gap', 'conceptual_confusion', 'causal_inversion', 'pattern_misrecognition', 'terminology_confusion', 'overgeneralization'],
      description: 'The specific misconception this question is designed to expose or correct',
      purpose: 'Enables misconception_signal recording and targeted feedback',
    },
    difficulty_type: {
      type: 'TEXT (enum)',
      values: ['factual', 'conceptual', 'applied', 'analytical'],
      description: 'The nature of the difficulty — not just easy/hard but how it is hard',
      purpose: 'Enables challenge-wave sequencing and cognitive pacing',
    },
    review_text: {
      type: 'TEXT',
      description: 'Educational explanation shown when student answers incorrectly. 1–2 sentences.',
      format: 'NOT "Korrekt svar: X". Instead: context, causality, meaning.',
      example: 'Den Franske Revolution begyndte i 1789, det år Bastillen stormededes og det gamle regime begyndte at krakelere under pres fra sult og politisk krise.',
      purpose: 'Upgrades feedback from Level 0 (bare answer) to Level 2 (conceptual explanation)',
    },
    insight_type: {
      type: 'TEXT (enum)',
      values: ['causal', 'comparative', 'definitional', 'relational', 'evaluative'],
      description: 'The type of intellectual insight this question can produce',
      purpose: 'Future: enables insight-bridge sequencing between concept clusters',
    },
    transfer_potential: {
      type: 'TEXT (enum)',
      values: ['low', 'medium', 'high'],
      description: 'How transferable the concept is to other domains',
      purpose: 'Future: enables interdisciplinary connection moments',
    },
    interdisciplinary: {
      type: 'TEXT[]',
      description: 'Other school subjects this concept connects to',
      examples: ['matematik', 'samfundsfag', 'biologi'],
      purpose: 'Future: enables cross-subject insight bridges',
    },
  }),

  EXAMPLE_ENRICHED_QUESTION: Object.freeze({
    content: {
      question: 'Hvad var den primære årsag til Den Franske Revolutions udbrud i 1789?',
      options: ['Napoleon Bonapartes magtovertagelse', 'Folkets sult, skattebyrde og oplysningstidens ideer', 'Englands invasion af Frankrig', 'Kongens afskaffelse af parlamentet'],
      correct: 'Folkets sult, skattebyrde og oplysningstidens ideer',
      review_text: 'Den Franske Revolution var ikke én begivenhed men en krise der byggede op over årtier: dårlige høst, statsgæld fra krige, og oplysningstidens ideer om frihed og lighed skabte en eksplosiv blanding i 1789.',
    },
    metadata: {
      concepts: ['revolution', 'kausalitet', 'klasse', 'oplysning'],
      cognitive_skill: 'causal_reasoning',
      misconception_type: 'causal_inversion',
      difficulty_type: 'conceptual',
      insight_type: 'causal',
      transfer_potential: 'high',
      interdisciplinary: ['samfundsfag', 'filosofi'],
    },
  }),

  DESIGN_PRINCIPLES: Object.freeze({
    HUMAN_READABLE: 'Every field is in plain language. No opaque codes. A teacher reading a question row can understand all metadata.',
    TEACHER_EDITABLE: 'Teachers add metadata via the admin interface or direct table edit. No algorithm generates it.',
    OPTIONAL: 'All metadata fields are optional. A question with null metadata behaves identically to pre-Section-37.',
    ADDITIVE: 'Metadata fields expand capability without replacing existing mechanics. Spaced repetition still works.',
    ETHICAL: 'Metadata serves the student\'s learning — not algorithmic engagement optimization.',
  }),

});

// ─── REVIEW TEXT FLOW ─────────────────────────────────────────────────────────

export const REVIEW_TEXT_FLOW = Object.freeze({

  DATA_PATH: [
    '1. Teacher adds review_text to questions.content (JSON field) or questions.metadata.review_text',
    '2. get-next-question: normalizeContent() extracts review_text from content, passes it in response',
    '3. app.js: stores review_text silently in data (not used until answer submitted)',
    '4. Student answers incorrectly',
    '5. process-event: extracts review_text from questions.content/metadata, returns it in response body',
    '6. app.js: displays review_text in #feedback div instead of bare correct-answer string',
    '7. Delay extends from 2000ms to 3200ms so student has time to read',
  ],

  FEEDBACK_UPGRADE: Object.freeze({
    LEVEL_0: {
      label: 'Bare answer (current default for questions without review_text)',
      display: '"❌ Forkert – korrekt svar: 1789"',
      value: 'None. Student knows the answer but has no context or understanding.',
    },
    LEVEL_1_2: {
      label: 'Review text (activated when metadata.review_text or content.review_text exists)',
      display: '"❌ Forkert — Den Franske Revolution begyndte i 1789, det år Bastillen stormededes..."',
      value: 'Student receives context, causality, narrative. Learning moment instead of correction moment.',
    },
  }),

  PHILOSOPHY: 'A wrong answer is not a failure. It is the highest-value learning moment in the session. The 800ms the student spends reading review_text is worth more than three correct answers.',

});

// ─── MISCONCEPTION SIGNALING ──────────────────────────────────────────────────

export const MISCONCEPTION_SIGNALING = Object.freeze({

  MECHANISM: Object.freeze({
    TRIGGER: 'Student answers incorrectly AND question has metadata.misconception_type',
    ACTION: 'process-event: fire-and-forget UPDATE question_instances SET misconception_signal = misconception_type',
    RESULT: 'question_instances row now carries the diagnostic signal for this specific wrong answer',
    SAFETY: 'Fire-and-forget: non-fatal. Does not affect reward flow, idempotency, or response shape.',
  }),

  MISCONCEPTION_TAXONOMY: Object.freeze({
    recall_gap: 'Student has never learned or does not remember. Fix: review with context.',
    conceptual_confusion: 'Student confuses two related concepts. Fix: explicit comparison.',
    causal_inversion: 'Student inverts cause and effect. Hardest to correct. Fix: causal narrative.',
    pattern_misrecognition: 'Student recognizes surface pattern, misses deeper concept. Fix: same concept in new context.',
    terminology_confusion: 'Student knows concept but uses wrong term. Fix: precise language.',
    overgeneralization: 'Student applies a correct rule to wrong domain. Fix: boundary and exceptions.',
  }),

  FUTURE_USE: Object.freeze({
    TEACHER_DASHBOARD: 'Teachers can see: "8 students confused causal_inversion on this question → reteach"',
    SEQUENCING: 'System can prioritize misconception-targeted questions for students with repeated signals',
    FEEDBACK_UPGRADE: 'Level 3 feedback: misconception-targeted text replaces generic review_text',
  }),

  ETHICAL_CONSTRAINT: 'misconception_signal is educational diagnostic data. It is never surfaced to the student as a label ("you are a causal_inversion student"). It informs system behavior and teacher tooling only.',

});

// ─── CONCEPT PROGRESSION TRACKING ────────────────────────────────────────────

export const CONCEPT_PROGRESSION = Object.freeze({

  PHILOSOPHY: 'Concept progression is not a score. It is a confidence signal. Four states describe where a student is in their relationship with a concept.',

  CONFIDENCE_STATES: Object.freeze({
    stable: {
      label: 'Stable',
      description: 'Consistent correct answers across multiple question types and contexts. The concept is internalized.',
      signal: '3+ correct across cognitive_skill diversity',
    },
    emerging: {
      label: 'Emerging',
      description: 'Correct on factual/recall questions but not yet on causal_reasoning or transfer. Understanding is building.',
      signal: 'Correct on recall, incorrect or untested on causal_reasoning/transfer',
    },
    uncertain: {
      label: 'Uncertain',
      description: 'Mixed results. Student sometimes gets it right, sometimes wrong. Consolidation needed.',
      signal: 'Mixed correct/incorrect on similar question types',
    },
    misconception_prone: {
      label: 'Misconception-prone',
      description: 'Repeated incorrect answers with consistent misconception_signal. Active conceptual conflict to resolve.',
      signal: '2+ identical misconception_signal values on same concept',
    },
  }),

  IMPLEMENTATION_APPROACH: 'Lightweight derivation from existing question_instances data. No separate tracking table needed Phase 1. Query: group question_instances by concept (via metadata.concepts), aggregate was_correct and misconception_signal.',

  WHAT_IT_IS_NOT: 'Not a ranking. Not a score. Not surfaced to students as a grade. It is invisible infrastructure that informs question sequencing and teacher tooling.',

});

// ─── ADAPTIVE REVIEW FEEDBACK ENGINE ─────────────────────────────────────────

export const ADAPTIVE_REVIEW_ENGINE = Object.freeze({

  FOUR_LEVELS: Object.freeze({
    LEVEL_0: {
      name: 'Bare Answer',
      trigger: 'No review_text in content or metadata',
      display: '"❌ Forkert – korrekt svar: " + correct_answer',
      educational_value: 'Correction only. Zero context. Student knows what but not why.',
    },
    LEVEL_1: {
      name: 'Contextual Answer',
      trigger: 'review_text present, generic context',
      display: '"❌ Forkert — " + review_text (narrative context)',
      educational_value: 'Student understands when and how. Narrative frame.',
    },
    LEVEL_2: {
      name: 'Conceptual Explanation',
      trigger: 'review_text present, conceptually rich',
      display: '"❌ Forkert — " + review_text (activates concept network)',
      educational_value: 'Student understands why. Concept activated.',
    },
    LEVEL_3: {
      name: 'Misconception-Targeted',
      trigger: 'Future: review_text tailored to detected misconception_signal',
      display: 'Feedback addresses the specific wrong belief the student demonstrated',
      educational_value: 'Maximum. Student\'s actual misunderstanding is directly addressed.',
    },
  }),

  REVIEW_TEXT_GUIDELINES: Object.freeze({
    LENGTH: '1–2 sentences. Enough for the 800–2000ms learning moment. Not an essay.',
    TONE: 'Curious, not corrective. "In fact..." not "You were wrong because..."',
    CONTENT: 'Context, causality, narrative. Not: "The answer is X." Yes: "X because Y, which led to Z."',
    EXAMPLE_BAD: '"Svaret var: 1789."',
    EXAMPLE_GOOD: '"Den Franske Revolution begyndte i 1789 — det år Bastillen stormededes og det gamle regime begyndte at krakelere under pres fra sult og politisk krise."',
    LANGUAGE: 'Danish. Match the voice of the question.',
  }),

});

// ─── CHALLENGE-WAVE SEQUENCING ────────────────────────────────────────────────

export const CHALLENGE_WAVE_SEQUENCING = Object.freeze({

  CURRENT_SEQUENCING: 'Due instances (by next_review_at) then new questions in DB insertion order. No concept awareness. No difficulty_type awareness. No cognitive_skill diversity.',

  TARGET_SEQUENCING_LOGIC: Object.freeze({
    CONCEPT_INTRODUCTION: 'First encounter with a concept: factual/recall difficulty_type, comprehension cognitive_skill',
    CONCEPT_REINFORCEMENT: '2–3 questions deepening same concept: conceptual/applied difficulty_type',
    MISCONCEPTION_ADDRESS: 'After incorrect: prioritize questions with matching misconception_type for same concepts',
    CHALLENGE_WAVE: 'Progressive difficulty within a concept cluster: factual → conceptual → applied → analytical',
    TRANSFER_MOMENT: 'After stability: introduce same concept in new context (transfer cognitive_skill)',
    INSIGHT_BRIDGE: 'Connect two stable concept clusters via a question that spans them (insight_type: relational)',
  }),

  IMPLEMENTATION_PATH: 'get-next-question can use metadata.concepts + metadata.difficulty_type + metadata.cognitive_skill to sort the candidate question pool. Phase 2 work.',

  WHAT_RANDOM_MISSES: [
    'No conceptual momentum — student cannot build on previous question',
    'No misconception recovery — wrong answers are forgotten immediately',
    'No cognitive pacing — hard analytical questions after easy recall creates cognitive whiplash',
    'No transfer moments — concept understanding never tested in new context',
    'No insight bridges — cross-concept connections never emerge',
    'No challenge-wave rhythm — session feels neither building nor sustainable',
  ],

});

// ─── INTELLECTUAL PROGRESSION LANGUAGE ───────────────────────────────────────

export const INTELLECTUAL_PROGRESSION_LANGUAGE = Object.freeze({

  PHILOSOPHY: 'The language we use to describe student progress shapes their identity as a learner. Score identity ("you got 80%") produces fragility. Process identity ("you are developing causal reasoning") produces resilience.',

  GROWTH_LANGUAGE_EXAMPLES: Object.freeze({
    CAUSAL_REASONING: {
      score: '"Du klarede historiedelen godt."',
      growth: '"Du er ved at udvikle en stærk fornemmelse for årsag og virkning i historiske begivenheder."',
    },
    PERSISTENCE: {
      score: '"Du svarede forkert 3 gange."',
      growth: '"Du arbejdede med et svært koncept og kom tættere på hver gang."',
    },
    BREAKTHROUGH: {
      score: '"Dit score steg med 15%."',
      growth: '"Du klarede en opgave i dag som du ikke kunne for en uge siden. Det er reel vækst."',
    },
    CONCEPT_MASTERY: {
      score: '"Du har besvaret 12 spørgsmål korrekt."',
      growth: '"Du behersker nu grundprincipperne bag demokratiets udvikling."',
    },
  }),

  LANGUAGE_RULES: Object.freeze({
    AVOID: [
      'Ranking language ("bedre end andre studerende")',
      'Fixed intelligence language ("du er klog / du er ikke klog")',
      'Punishment language ("forkert", "fejl", "du burde vide")',
      'Pressure language ("kun X spørgsmål tilbage")',
      'Score obsession ("din præcision er X%")',
    ],
    PREFER: [
      'Process language ("du arbejdede med", "du opdagede", "du prøvede")',
      'Concept language ("du forstår nu", "du er ved at mestre")',
      'Curiosity language ("interessant spørgsmål", "det er faktisk mere komplekst")',
      'Growth language ("tættere på", "stærkere end sidst", "du er ved at")',
      'Resilience language ("et forkert svar er information, ikke dom")',
    ],
  }),

});

// ─── TEACHER TRANSPARENCY ─────────────────────────────────────────────────────

export const TEACHER_TRANSPARENCY = Object.freeze({

  CORE_PRINCIPLE: 'Every adaptive behavior must be explainable to a teacher in plain language. No black boxes. No algorithmic mysteries.',

  WHAT_TEACHERS_CAN_SEE: Object.freeze({
    QUESTION_METADATA: 'teachers can read and edit questions.metadata directly in the admin interface',
    MISCONCEPTION_PATTERNS: 'teachers can see misconception_signal aggregated per concept per student',
    FEEDBACK_TEXT: 'teachers author the review_text — the system displays it, not generates it',
    SEQUENCING_LOGIC: 'teachers understand: "questions are ordered by concept clusters and difficulty wave"',
    CONCEPT_STATUS: 'teachers can see: "student has 3 causal_inversion signals on the Revolution concept"',
  }),

  ANTI_BLACK_BOX_RULES: Object.freeze([
    'The system never adapts in ways the teacher cannot understand or override',
    'Metadata is human-readable JSON — not encoded integers or opaque weights',
    'review_text is teacher-authored — the system does not generate feedback automatically',
    'misconception_signal records what happened — it does not assign a permanent label',
    'All learning signals can be reset, overridden, or cleared by a teacher',
    'No student is ever shown their misconception_signal values — it is teacher-facing only',
  ]),

  GDPR_ALIGNMENT: 'All learning data is scoped to the student\'s educational context. No data is sold, shared, or used for purposes beyond improving that student\'s learning experience in this platform.',

});

// ─── FUTURE LEARNING ENGINE ───────────────────────────────────────────────────

export const FUTURE_LEARNING_ENGINE = Object.freeze({

  PHASE_2_SEQUENCING: 'get-next-question uses metadata to serve concept-cluster sequences instead of random order',
  PHASE_3_LEVEL_3_FEEDBACK: 'process-event selects misconception-targeted review_text based on student\'s selected incorrect option',
  PHASE_4_TEACHER_DASHBOARD: 'teacher.html shows concept health heatmap: which concepts are stable/uncertain/misconception-prone per class',
  PHASE_5_CONCEPT_CURRICULUM: 'Concept graph defines curriculum structure — questions are organized by concept, not by topic list',
  PHASE_6_REFLECTIVE_PROMPTS: 'After completing a concept cluster: "What did you notice about how power changes during revolutions?"',
  PHASE_7_INTERDISCIPLINARY: 'Insight bridges between subject-specific concept clusters: history ↔ samfundsfag ↔ philosophy',

  ETHICAL_NORTH_STAR: 'The system becomes more useful to students over time — not more addictive. The goal is graduation from the platform with genuine curiosity, not perpetual engagement.',

  ANTI_OPTIMISATION: 'We do not optimize for: session length, daily active users, streak preservation, or correctness rate. We optimize for: conceptual depth, misconception resolution, and intellectual curiosity.',

});

// ─── PRE-SHIP CHECKLIST ───────────────────────────────────────────────────────

export const LEARNING_ENGINE_TEST = Object.freeze([
  'Does a question with review_text in content show it after incorrect answer?',
  'Does a question with metadata.review_text show it after incorrect answer?',
  'Does a question without review_text still show "Forkert – korrekt svar: X"?',
  'Does an incorrect answer with misconception_type set misconception_signal in question_instances?',
  'Does a correct answer NOT set misconception_signal?',
  'Does the delay extend to 3200ms when review_text is present?',
  'Does the existing Playwright test still pass with no review_text in test questions?',
  'Can a teacher read and understand all metadata fields without documentation?',
  'Is misconception_signal never shown to the student?',
  'Does null metadata leave all existing behavior unchanged?',
]);
