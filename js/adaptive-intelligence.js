/**
 * Section 38 — Adaptive Concept Intelligence: Design Contract
 *
 * Documents the philosophy, state machines, and implementation decisions
 * for the adaptive learning system activated in Section 38.
 *
 * NOT an implementation file. The authoritative specification for WHY
 * the system adapts as it does.
 */

// ─── INFRASTRUCTURE ACTIVATION AUDIT ─────────────────────────────────────────

export const ACTIVATION_AUDIT = Object.freeze({

  LIVE_FROM_SECTION_37: Object.freeze({
    METADATA_COLUMN:       'questions.metadata JSONB — concepts, cognitive_skill, misconception_type, difficulty_type, review_text',
    MISCONCEPTION_SIGNAL:  'question_instances.misconception_signal TEXT — recorded on incorrect answers when question has misconception_type',
    REVIEW_TEXT_FLOW:      'content.review_text → get-next-question → process-event response → app.js feedback display',
    CONCEPT_STATE_RPC:     'get_concept_states(student_id) → JSONB map of concept → stable|emerging|uncertain|misconception_prone',
  }),

  LIVE_FROM_SECTION_38: Object.freeze({
    WAVE_STATE_MACHINE:    'app.js: sessionWavePhase state machine — challenge|reinforcement|recovery|deep_challenge',
    SESSION_CONTEXT:       'app.js passes session_context {wave_phase, consecutive_incorrect, last_misconception_type} to get-next-question on every call',
    WAVE_SORTING:          'get-next-question: sortByWave() reorders candidate questions by metadata.difficulty_type + metadata.cognitive_skill preferences',
    MISCONCEPTION_TYPE_RETURN: 'process-event returns misconception_type in response body — app.js stores as lastMisconceptionType for next call',
    TARGETED_RECOVERY:     'In recovery phase + lastMisconceptionType set: questions with matching misconception_type + factual difficulty get highest wave score',
  }),

  WHAT_REQUIRES_METADATA: Object.freeze({
    WAVE_SORTING:          'Only re-orders questions that have metadata. Null metadata = wave score 0 = original order preserved.',
    TARGETED_RECOVERY:     'Only activates when question has misconception_type in metadata. Otherwise: generic recovery (factual preference).',
    MISCONCEPTION_RETURN:  'Only returns misconception_type if question had it in metadata. Null otherwise — no error.',
    CONCEPT_STATE:         'Only meaningful when questions have metadata.concepts populated. Empty concepts → returns {}.',
  }),

});

// ─── CHALLENGE-WAVE STATE MACHINE ─────────────────────────────────────────────

export const WAVE_STATE_MACHINE = Object.freeze({

  STATES: Object.freeze({
    challenge: {
      label: 'Challenge',
      description: 'Standard mixed difficulty. Starting state. Slight preference for conceptual/applied questions.',
      transitions: {
        after_4_consecutive_correct: 'deep_challenge',
        after_1_incorrect: 'reinforcement',
      },
    },
    deep_challenge: {
      label: 'Deep Challenge',
      description: 'Student is in flow. Prefers analytical/synthesis questions to match cognitive momentum.',
      transitions: {
        after_1_incorrect: 'reinforcement',
      },
    },
    reinforcement: {
      label: 'Reinforcement',
      description: 'After one mistake. Prefers conceptual/comprehension questions to consolidate understanding.',
      transitions: {
        after_2_consecutive_correct: 'challenge',
        after_2_consecutive_incorrect: 'recovery',
      },
    },
    recovery: {
      label: 'Recovery',
      description: 'After 2+ consecutive mistakes. Prefers factual/recall questions to restore confidence. Targeted recovery if lastMisconceptionType is known.',
      transitions: {
        after_3_consecutive_correct: 'challenge',
      },
    },
  }),

  TRANSITION_LOGIC: Object.freeze({
    CORRECT_PATH:   'consecutive_correct++ → check deep_challenge or recovery exit thresholds',
    INCORRECT_PATH: 'consecutive_correct = 0, consecutive_incorrect++ → check reinforcement or recovery entry',
    RESET_ON_PAGE:  'All wave state resets on page load — no persistence. Session-local only.',
  }),

  WHY_NOT_PERSISTENT: 'Wave state is cognitive pacing, not student ability measurement. A student who struggled yesterday is not in recovery today. Fresh session = fresh rhythm.',

});

// ─── WAVE SCORE LOGIC ─────────────────────────────────────────────────────────

export const WAVE_SCORE_LOGIC = Object.freeze({

  PHILOSOPHY: 'Wave scoring is additive bias, not absolute filtering. A high-scoring question is preferred — not required. If no high-scoring question exists, the system falls back to original order.',

  SCORING_TABLE: Object.freeze({
    recovery: {
      'difficulty_type = factual':                    '+10 (primary preference)',
      'cognitive_skill = recall':                     '+5 (secondary preference)',
      'misconception_type matches lastMisconception': '+8 (targeted recovery bonus)',
      'no matching metadata':                         '0 (neutral — original order)',
    },
    reinforcement: {
      'difficulty_type = conceptual':    '+8 (primary preference)',
      'cognitive_skill = comprehension': '+5 (secondary preference)',
      'no matching metadata':            '0 (neutral)',
    },
    deep_challenge: {
      'difficulty_type = analytical':                  '+10 (primary preference)',
      'difficulty_type = applied':                     '+7 (secondary preference)',
      'cognitive_skill = synthesis or evaluation':     '+5 (tertiary preference)',
      'no matching metadata':                          '0 (neutral)',
    },
    challenge: {
      'no reordering applied':  'Original DB order preserved — performance win',
    },
  }),

  TRANSPARENCY: 'Every preference decision maps directly to pedagogical reasoning. There are no opaque weights. A teacher who reads the code understands exactly what happened.',

});

// ─── MISCONCEPTION-AWARE ADAPTATION ──────────────────────────────────────────

export const MISCONCEPTION_ADAPTATION = Object.freeze({

  DATA_PATH: Object.freeze([
    '1. Student answers incorrectly',
    '2. process-event: misconception_type extracted from question.metadata (may be null)',
    '3. process-event: response includes misconception_type in body',
    '4. app.js: lastMisconceptionType = data.misconception_type ?? null',
    '5. Next call to get-next-question: session_context.last_misconception_type = lastMisconceptionType',
    '6. get-next-question: if wavePhase === recovery AND lastMisconceptionType set → +8 score for matching misconception_type with factual difficulty',
    '7. Student receives a targeted recovery question for the specific misconception they showed',
  ]),

  EXAMPLE_SCENARIO: Object.freeze({
    student_action: 'Answers "What caused the French Revolution?" incorrectly (causal_inversion misconception)',
    system_records: 'question_instances.misconception_signal = "causal_inversion"',
    system_returns: 'process-event response: { misconception_type: "causal_inversion" }',
    app_stores:     'lastMisconceptionType = "causal_inversion"',
    next_question:  'In recovery phase, get-next-question prefers: difficulty_type=factual + misconception_type=causal_inversion',
    effect:         'Student gets a simpler causal question to rebuild their causal reasoning on firm ground',
  }),

  ETHICAL_CONSTRAINTS: Object.freeze([
    'Targeted recovery helps the student — it does not label them as "causal_inversion prone"',
    'lastMisconceptionType resets to null on page load — no stigma carries across sessions',
    'The student never sees misconception_type or any label derived from it',
    'Teachers see misconception_signal aggregated — not live student labeling',
    'If no matching recovery question exists, the system serves any factual question — graceful fallback',
  ]),

});

// ─── CONCEPT STATE TRACKING ───────────────────────────────────────────────────

export const CONCEPT_STATE_TRACKING = Object.freeze({

  RPC: 'get_concept_states(student_id) → JSONB',

  STATE_DERIVATION: Object.freeze({
    misconception_prone: '2+ incorrect answers with misconception_signal on questions sharing this concept',
    stable:              '3+ correct answers AND 0 incorrect answers on this concept',
    uncertain:           'Mix of correct and incorrect answers on this concept',
    emerging:            '1 correct answer and no incorrect yet — or first time seen',
  }),

  EXAMPLE_RETURN: Object.freeze({
    revolution:  'uncertain',
    demokrati:   'stable',
    kausalitet:  'misconception_prone',
    evolution:   'emerging',
  }),

  TEACHER_USE: 'Teacher dashboard can call get_concept_states(student_id) to show class heatmap. Which concepts are stable across the class? Which are misconception_prone?',

  STUDENT_ISOLATION: 'get_concept_states() is scoped entirely to one student_id via SECURITY DEFINER. No cross-student data is possible.',

  CURRENT_STATUS: 'RPC is live in production. Not yet called from frontend in production (Phase 2 — teacher dashboard). Infrastructure is ready.',

});

// ─── RECOVERY FLOW ────────────────────────────────────────────────────────────

export const RECOVERY_FLOW = Object.freeze({

  TRIGGER: '2+ consecutive incorrect answers → sessionWavePhase = "recovery"',

  WHAT_CHANGES: Object.freeze({
    QUESTION_SELECTION: 'get-next-question prefers difficulty_type=factual, cognitive_skill=recall questions',
    TARGETED:           'If lastMisconceptionType known: also boost questions with matching misconception_type',
    DELAY:              'No change — delay is driven by review_text presence, not wave phase',
    FEEDBACK:           'No change — review_text still shown if available',
  }),

  RECOVERY_EXIT: '3 consecutive correct answers → return to challenge phase, reset consecutive_correct',

  DESIGN_PRINCIPLE: 'Recovery is not punishment mode. It is a confidence restoration rhythm. The student should feel the questions becoming more accessible — not feel punished by easier questions. The system never announces that it is in recovery mode.',

  ANTI_PATTERNS: Object.freeze([
    'Do NOT show "you are in recovery mode" to the student',
    'Do NOT increase XP requirements in recovery',
    'Do NOT skip recovery for "advanced" students — all students need rhythm',
    'Do NOT make recovery questions feel obviously easier — factual questions should still be interesting',
  ]),

});

// ─── REFLECTIVE FEEDBACK LEVELS ───────────────────────────────────────────────

export const REFLECTIVE_FEEDBACK = Object.freeze({

  CURRENT_IMPLEMENTATION: Object.freeze({
    LEVEL_0: 'No review_text in metadata → "❌ Forkert – korrekt svar: X"',
    LEVEL_1_2: 'review_text in metadata → "❌ Forkert — " + review_text (contextual/conceptual)',
  }),

  FUTURE_LEVELS: Object.freeze({
    LEVEL_3: {
      label: 'Misconception-targeted feedback',
      trigger: 'Selected incorrect option matches a known misconception variant in metadata',
      example: 'Student chose "Napoleon" → feedback specifically addresses Napoleon/Revolution confusion',
      status: 'Requires metadata.option_misconceptions JSONB — not yet implemented',
    },
    LEVEL_4: {
      label: 'Reflective prompt',
      trigger: 'Student has stable understanding of concept (from concept_states)',
      example: '"This connects to what you know about democracy — how does power shift in both cases?"',
      status: 'Requires concept_states integration in frontend — future phase',
    },
  }),

  PHILOSOPHY: 'Feedback is not output. Feedback is a conversation. Each level asks more of the student\'s thinking — but only when the foundation is ready.',

});

// ─── CONFIDENCE STABILIZATION ─────────────────────────────────────────────────

export const CONFIDENCE_STABILIZATION = Object.freeze({

  COLLAPSE_PREVENTION: Object.freeze({
    TRIGGER:   '2 consecutive incorrect answers',
    MECHANISM: 'recovery wave phase → factual question preference',
    EFFECT:    'Student experiences easier question → likely correct → confidence begins returning',
    EXIT:      '3 consecutive correct answers → return to challenge phase',
  }),

  WHAT_WE_AVOID: Object.freeze([
    'Uninterrupted difficulty escalation',
    'Monotonically increasing challenge (cognitive exhaustion)',
    'Punishment spirals (wrong answer → harder question → wrong again → even harder)',
    'Visible feedback about performance trajectory ("you\'re on a losing streak")',
    'Competitive framing against other students',
  ]),

  PSYCHOLOGICAL_SAFETY: 'The student\'s emotional relationship with the subject is as important as their conceptual understanding. A student who begins to dread the platform has lost the learning. Confidence stabilization protects the relationship.',

});

// ─── TEACHER TRANSPARENCY ─────────────────────────────────────────────────────

export const TEACHER_TRANSPARENCY_38 = Object.freeze({

  WHAT_TEACHERS_SEE: Object.freeze({
    WAVE_LOGIC:         'Fully documented in code comments and this design contract — no black box',
    MISCONCEPTION_DATA: 'question_instances.misconception_signal is queryable per student and question',
    CONCEPT_STATES:     'get_concept_states(student_id) returns plain JSONB — teachers can run this query',
    SCORING_TABLE:      'WAVE_SCORE_LOGIC.SCORING_TABLE above documents every scoring decision',
  }),

  HOW_TO_EXPLAIN: Object.freeze({
    TO_STUDENT:  '"The app notices when you get questions wrong and gives you slightly easier ones to help you rebuild."',
    TO_TEACHER:  '"After 2 wrong answers, the system prefers factual questions for that student until they get 3 right in a row. It uses the question\'s difficulty_type tag to decide."',
    TO_PARENT:   '"The app adjusts the difficulty rhythm based on how the student is doing in that session."',
    TO_ADMIN:    '"Wave phase is session-local state derived from consecutive_correct/incorrect counts. It influences question ordering via metadata.difficulty_type scoring. No permanent student state is modified."',
  }),

  ETHICAL_COMPLIANCE: Object.freeze([
    'No student is ever ranked or compared to others',
    'No misconception label persists across sessions',
    'Wave state resets on every page load',
    'All adaptation decisions are deterministic and auditable',
    'Teachers can override by adding/editing question metadata',
    'No algorithmic recommendation that teachers cannot inspect',
  ]),

});

// ─── FUTURE CONCEPT INTELLIGENCE ─────────────────────────────────────────────

export const FUTURE_CONCEPT_INTELLIGENCE = Object.freeze({

  PHASE_3_FRONTEND: 'teacher.html calls get_concept_states() per student → concept health heatmap for class',
  PHASE_4_SEQUENCING: 'get-next-question uses concept states to prioritize misconception_prone concept clusters',
  PHASE_5_REFLECTIVE: 'Stable concept triggers Level 4 reflective prompts that connect to adjacent concepts',
  PHASE_6_CURRICULUM: 'Concept graph defines curriculum scaffolding — questions are ordered by concept readiness',
  PHASE_7_CROSS_SUBJECT: 'transfer_potential metadata enables insight bridges across subject boundaries',

  NORTH_STAR: 'The system becomes genuinely intelligent about each student\'s conceptual map — not their performance score. The goal is a student who thinks more clearly, not a student who scores higher.',

});

// ─── PRE-SHIP CHECKLIST ───────────────────────────────────────────────────────

export const ADAPTIVE_INTELLIGENCE_TEST = Object.freeze([
  'Does wave phase start as "challenge" on every page load?',
  'After 4 consecutive correct answers, does wave phase transition to "deep_challenge"?',
  'After 2 consecutive incorrect, does wave phase transition to "recovery"?',
  'After 3 consecutive correct in recovery, does wave phase return to "challenge"?',
  'Does get-next-question receive session_context in the request body?',
  'Does process-event return misconception_type in the response for incorrect MC answers?',
  'Does app.js store lastMisconceptionType after an incorrect answer?',
  'Does the wave sorting preserve original order when no questions have metadata?',
  'Does get_concept_states() return {} when no questions have metadata.concepts?',
  'Does wave state never appear in the student-facing UI?',
]);
