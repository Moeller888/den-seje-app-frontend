/**
 * Section 40 — Pedagogical Enrichment Pipeline: Design Contract
 *
 * Documents the architecture, extension points, and authoring standards
 * for the Pedagogical Enrichment Pipeline activated in Section 40.
 *
 * NOT an implementation file. The authoritative specification for HOW
 * question authoring evolves from content entry into learning-object generation.
 */

// ─── PIPELINE ARCHITECTURE AUDIT ─────────────────────────────────────────────

export const PIPELINE_AUDIT = Object.freeze({

  CURRENT_INGESTION_FLOW: Object.freeze([
    '1. Author (teacher/admin) composes question content manually',
    '2. Content inserted directly into questions table as JSONB: { question, options, correct, review_text? }',
    '3. answer_format set: mc | text | number',
    '4. answer_type set: short | long',
    '5. metadata column exists (Section 37) but is null for most questions',
    '6. question_instances created by get-next-question when student first encounters question',
    '7. process-event evaluates answer, records misconception_signal, returns review_text',
  ]),

  EXISTING_EXTENSION_POINTS: Object.freeze({
    'questions.content JSONB':        'Holds {question, options, correct, review_text}. review_text flows through get-next-question → process-event → app.js (Section 37)',
    'questions.metadata JSONB':       'Holds {concepts, cognitive_skill, misconception_type, difficulty_type, review_text}. Wave-aware scoring reads difficulty_type (Section 38)',
    'question_instances.misconception_signal': 'Records misconception_type on incorrect answers (Section 38)',
    'get-next-question wave scoring': 'sortByWave() reads metadata.difficulty_type + cognitive_skill (Section 38)',
    'get_concept_states RPC':         'Derives concept health from answered question_instances (Section 38)',
  }),

  WHAT_IS_MISSING: Object.freeze([
    'challenge_role metadata — which wave phase this question is designed for',
    'insight_type metadata — what cognitive insight this question develops',
    'interdisciplinary_links metadata — cross-domain concept connections',
    'pedagogical QA validation — systematic review before question goes live',
    'distractor misconception mapping — which distractor maps to which misconception',
    'concept relationship metadata — core vs supporting vs transferable concepts',
  ]),

  ENRICHMENT_APPROACH: 'Extend the existing questions.metadata JSONB — no schema migration required for new fields. All new fields are additive. Existing questions without new fields degrade gracefully.',

});

// ─── LEARNING OBJECT MODEL ────────────────────────────────────────────────────

export const LEARNING_OBJECT_MODEL = Object.freeze({

  PHILOSOPHY: 'A learning object is not a question with metadata attached. It is a pedagogically complete instructional unit: the question, the feedback, the diagnostic signal, and the adaptive context, authored as an integrated whole.',

  TARGET_SHAPE: Object.freeze({
    content: Object.freeze({
      question:       'string — the question stem',
      options:        'string[] — for MC questions',
      correct:        'string — the correct answer',
      review_text:    'string | null — Level 1–2 feedback shown on incorrect answers',
    }),

    metadata: Object.freeze({
      concepts:              'string[] — knowledge domains this touches (e.g. ["revolution", "collective_action"])',
      cognitive_skill:       'recall | comprehension | analysis | synthesis | evaluation | application',
      difficulty_type:       'factual | conceptual | analytical | applied',
      misconception_type:    'string | null — primary misconception this question diagnoses',
      challenge_role:        'challenge | reinforcement | recovery | reflection | transfer',
      insight_type:          'string | null — causal_chain | systems_shift | historical_parallel | conceptual_transfer',
      interdisciplinary_links: 'string[] — adjacent domains (e.g. ["political_science", "sociology"])',
    }),
  }),

  BACKWARD_COMPATIBILITY: 'All metadata fields are optional. A question with null metadata scores 0 in wave sorting and preserves original order. No existing question breaks.',

  TEACHER_VISIBILITY: 'Every field in metadata has a plain-language meaning a teacher can understand and edit. There are no algorithmic weights or black-box scores stored here.',

});

// ─── CONCEPT EXTRACTION LAYER ─────────────────────────────────────────────────

export const CONCEPT_EXTRACTION = Object.freeze({

  PHILOSOPHY: 'The system should understand ideas — not just prompts. Concepts are the semantic fingerprint of a question.',

  CONCEPT_TIERS: Object.freeze({
    CORE:         'The primary concept the question tests (1–2 concepts). Student must understand this to answer correctly.',
    SUPPORTING:   'Adjacent concepts that give the core concept context (2–4 concepts). Student gains understanding through these.',
    TRANSFERABLE: 'Concepts that link this question to other domains. Enable interdisciplinary insight.',
  }),

  CONCEPT_TAXONOMY_EXAMPLES: Object.freeze({
    history:  '["revolution", "democracy", "social_hierarchy", "power_shift", "collective_action", "legitimacy", "symbolism"]',
    science:  '["energy", "systems", "equilibrium", "adaptation", "feedback_loop", "emergence", "causality"]',
    math:     '["proportionality", "abstraction", "transformation", "pattern", "proof", "approximation"]',
    language: '["framing", "metaphor", "persuasion", "audience", "register", "ambiguity", "connotation"]',
    economics: '["scarcity", "incentives", "trade_off", "comparative_advantage", "market_equilibrium", "externality"]',
  }),

  EXTRACTION_PRINCIPLES: Object.freeze([
    'Tag concepts by what the question tests, not what the question mentions',
    'A question about Napoleon may test "legitimacy" rather than just "Napoleon"',
    'Use noun phrases that would transfer to other questions in other subjects',
    'Prefer 2–4 concepts over exhaustive tagging — precision over coverage',
    'Only tag transferable concepts where a genuine insight bridge exists',
  ]),

  AUTHORING_GUIDANCE: 'Ask: "If this question were about a different historical event, what concepts would still apply?" Those are your transferable concepts.',

});

// ─── MISCONCEPTION PREDICTION LAYER ──────────────────────────────────────────

export const MISCONCEPTION_PREDICTION = Object.freeze({

  PHILOSOPHY: 'Wrong answers should become diagnostic signals — not random noise. Predicting misconceptions before authoring distractors produces pedagogically superior wrong answers.',

  PREDICTION_SEQUENCE: Object.freeze([
    '1. Identify the correct causal/conceptual chain the question requires',
    '2. Ask: where in this chain could a student reason incorrectly?',
    '3. Name the specific error type from the taxonomy',
    '4. Author a distractor that a student with that specific error would choose',
    '5. Assign misconception_type to that distractor so get_concept_states can track it',
  ]),

  PREDICTION_TAXONOMY: Object.freeze({
    causal_inversion:    'Student reverses direction of a cause-effect relationship',
    overgeneralization:  'Student applies a valid rule to a domain where it does not hold',
    false_equivalence:   'Student treats two similar-sounding concepts as identical',
    temporal_confusion:  'Student misorders events in a sequence',
    scope_confusion:     'Student applies a local truth globally or a global truth locally',
    surface_association: 'Student pattern-matches on keywords rather than reasoning through the concept',
    authority_bias:      'Student selects the most famous/prominent option regardless of accuracy',
    part_whole_error:    'Student confuses a specific case with the general principle it illustrates',
  }),

  DIAGNOSTIC_CHAIN: 'When a student gets a question wrong, misconception_signal is recorded in question_instances. get_concept_states aggregates these to derive concept health. Teachers can see which misconception patterns are most common across a class — enabling targeted instruction at the class level, not just the individual.',

});

// ─── PEDAGOGICAL DISTRACTOR GENERATION ───────────────────────────────────────

export const DISTRACTOR_GENERATION = Object.freeze({

  PHILOSOPHY: 'A distractor is not a wrong answer. It is a hypothesis about how students think. Author it to be diagnostic, not merely incorrect.',

  QUALITY_CONTRACT: Object.freeze({
    PLAUSIBILITY:    'Plausible to a student who has partial understanding — not obviously absurd',
    MISCONCEPTION:   'Each distractor maps to a specific, nameable misconception from the taxonomy',
    PARALLELISM:     'Grammatically and structurally parallel to the correct answer',
    DIAGNOSTICITY:   'A teacher can identify which misconception a student has based on which distractor they chose',
    NO_TRICKERY:     'Distractors should not rely on ambiguous wording or gotcha phrasing',
  }),

  BEFORE_AFTER: Object.freeze({
    WEAK_EXAMPLE: Object.freeze({
      question:   '"Why did the storming of the Bastille matter?"',
      distractors: ['Because of geography', 'It was a big building', '1912'],
      problem:     'None of these represent real student thinking. They are noise.',
    }),
    STRONG_EXAMPLE: Object.freeze({
      question:   '"Why did the storming of the Bastille matter?"',
      distractors: [
        'It freed thousands of political prisoners (part_whole_error — only 7 were freed)',
        'It started a military campaign against Austria (temporal_confusion — Austria came later)',
        'It was ordered by King Louis XVI (authority_bias + causal_inversion — he opposed it)',
      ],
      improvement: 'Each distractor maps to a specific, predictable reasoning error. A teacher reading these can diagnose exactly what a student misunderstood.',
    }),
  }),

  THREE_DISTRACTOR_RULE: 'For 4-option MC: target 3 named misconceptions. If you cannot name the misconception, the distractor is not pedagogically defensible. Write a different one.',

});

// ─── REVIEW_TEXT ENRICHMENT ───────────────────────────────────────────────────

export const REVIEW_TEXT_ENRICHMENT = Object.freeze({

  PHILOSOPHY: 'review_text is the most direct pedagogical act the platform performs. Every word should earn its place by building understanding, not restating the answer.',

  FIVE_LEVEL_LADDER: Object.freeze({
    LEVEL_1: Object.freeze({
      label: 'Factual clarification',
      template: '"The answer is X because Y."',
      example: '"The Bastille was stormed in 1789, marking the beginning of the French Revolution."',
      use_when: 'Pure factual question where context adds nothing — use sparingly',
    }),
    LEVEL_2: Object.freeze({
      label: 'Conceptual explanation',
      template: '"This works because [underlying concept]."',
      example: '"The Bastille was stormed because public frustration had become collective political action — a threshold moment in revolutionary dynamics."',
      use_when: 'Conceptual or applied questions — the standard for most questions',
    }),
    LEVEL_3: Object.freeze({
      label: 'Causal framing',
      template: '"X happened because Y, which caused Z."',
      example: '"When the Bastille fell, it mattered less for who was freed (only 7 prisoners) than for what it proved: the king could no longer control the streets. That loss of legitimacy drove the Revolution forward."',
      use_when: 'Questions about causality, sequences, mechanisms',
    }),
    LEVEL_4: Object.freeze({
      label: 'Interdisciplinary link',
      template: '"This pattern also appears in [adjacent domain] when [parallel situation]."',
      example: '"This shift from individual grievance to collective action is studied in sociology as social movement theory — the same dynamic appears in labor strikes, civil rights movements, and independence struggles."',
      use_when: 'Questions with genuine interdisciplinary insight potential',
    }),
    LEVEL_5: Object.freeze({
      label: 'Reflective insight',
      template: '"Notice that [non-obvious implication] — this means [conceptual takeaway]."',
      example: '"Notice that what made the Bastille powerful was not its military value but its symbolic value. This is worth remembering: in politics, perception of power often matters more than power itself."',
      use_when: 'Questions where the insight is genuinely surprising or counter-intuitive',
    }),
  }),

  DEFAULT_TARGET: 'Level 2–3 for most questions. Level 4–5 reserved for questions with genuine interdisciplinary or philosophical depth. Level 1 is a fallback, not a target.',

  MISCONCEPTION_ANCHORING: 'Write review_text from the misconception, not the answer. Start by naming what the student probably thought, then redirect toward the concept. Never make the student feel foolish.',

});

// ─── ADAPTIVE LEARNING METADATA ──────────────────────────────────────────────

export const ADAPTIVE_METADATA = Object.freeze({

  PHILOSOPHY: 'Metadata should serve the learning engine — but it should also be readable by a teacher who has never heard of wave scoring. No field should require algorithmic context to understand.',

  CHALLENGE_ROLE: Object.freeze({
    challenge:      'Standard difficulty — suited for a student in normal flow',
    reinforcement:  'After one mistake — tests same concept at slightly reduced cognitive load',
    recovery:       'After 2+ mistakes — most accessible version of this concept',
    reflection:     'Connects two previously seen concepts — tests conceptual integration',
    transfer:       'Applies concept in a new domain — highest cognitive demand',
  }),

  COGNITIVE_SKILL_EXTENDED: Object.freeze({
    recall:             'Can the student retrieve a specific fact?',
    comprehension:      'Can the student explain what something means?',
    causality:          'Can the student explain why something happened?',
    comparison:         'Can the student identify meaningful similarities and differences?',
    analysis:           'Can the student break a complex idea into its components?',
    synthesis:          'Can the student combine multiple concepts into a new understanding?',
    evaluation:         'Can the student judge the relative importance or quality of ideas?',
    pattern_recognition: 'Can the student identify a recurring structure across contexts?',
    application:        'Can the student use a concept to solve a new problem?',
  }),

  INSIGHT_TYPE: Object.freeze({
    causal_chain:       'This question develops understanding of how causes link to effects',
    systems_shift:      'This question develops understanding of how systems change state',
    historical_parallel: 'This question connects a historical pattern to a recurring structure',
    conceptual_transfer: 'This question moves a concept from its origin domain to a new one',
    false_assumption:   'This question reveals an assumption the student holds that is wrong',
    threshold_concept:  'Getting this right represents a genuine shift in understanding — not just a fact learned',
  }),

  METADATA_COMPLETENESS_TIERS: Object.freeze({
    TIER_0: 'No metadata → wave score 0, original order, no concept tracking. Functional but unenriched.',
    TIER_1: 'difficulty_type + cognitive_skill → wave scoring activates. Basic adaptive routing works.',
    TIER_2: 'Tier 1 + concepts + misconception_type → concept state tracking activates. Diagnostic capability online.',
    TIER_3: 'Tier 2 + review_text + challenge_role + insight_type → full learning object. Maximum pedagogical value.',
  }),

});

// ─── PEDAGOGICAL QA LAYER ─────────────────────────────────────────────────────

export const PEDAGOGICAL_QA_PIPELINE = Object.freeze({

  VALIDATION_SEQUENCE: Object.freeze([
    '1. STRUCTURE CHECK: Does the question have a clear stem, valid options, and a correct answer?',
    '2. DISTRACTOR CHECK: Is at least one distractor mappable to a named misconception?',
    '3. REVIEW_TEXT CHECK: Does review_text explain the concept (not just restate the answer)?',
    '4. CONCEPT CHECK: Are 1–4 concepts tagged using natural-language domain nouns?',
    '5. COGNITIVE SKILL CHECK: Is cognitive_skill assigned from the extended taxonomy?',
    '6. DIFFICULTY CHECK: Is difficulty_type assigned and appropriate to the content?',
    '7. DIGNITY CHECK: Does the question treat students as intelligent learners?',
    '8. INSIGHT CHECK: Could a thoughtful teacher use this to start a discussion?',
  ]),

  AUTOMATIC_REJECTION_SIGNALS: Object.freeze([
    'All distractors are obviously absurd to any student who read the material',
    'review_text is shorter than the question stem and contains only the correct answer',
    'No concept is tagged (for questions that have been explicitly reviewed)',
    'Question relies on an obscure detail that has no conceptual significance',
    'difficulty_type is "analytical" but cognitive_skill is "recall" — contradiction',
    'misconception_type is set but no distractor reflects that misconception',
  ]),

  TEACHER_OVERRIDE: Object.freeze({
    PRINCIPLE: 'Automatic QA is a first-pass filter, not a final judge. Teachers may approve questions that fail automated checks when they have pedagogical context the system lacks.',
    OVERRIDE_FIELD: 'metadata.qa_override: { approved_by: "teacher_name", reason: "..." }',
    AUDIT_TRAIL: 'All overrides are logged — not to police teachers, but to improve the QA rules over time.',
  }),

  QUALITY_OVER_QUANTITY: 'The pipeline should make it harder to ship a bad question than to ship no question. A question that fails QA is not lost — it enters a review queue for enrichment.',

});

// ─── HUMAN AUTHORING & OVERRIDE ARCHITECTURE ─────────────────────────────────

export const HUMAN_AUTHORING_ARCHITECTURE = Object.freeze({

  CORE_PRINCIPLE: 'The pipeline assists pedagogical craftsmanship — it does not replace it. Every enrichment step is inspectable, editable, and overridable by a teacher.',

  AUTHORING_LAYERS: Object.freeze({
    LAYER_0: 'Raw question entry — teacher writes question, options, correct answer. No metadata required.',
    LAYER_1: 'Basic tagging — teacher assigns difficulty_type and cognitive_skill. Wave scoring activates.',
    LAYER_2: 'Concept tagging — teacher tags concepts and misconception_type. Diagnostic capability activates.',
    LAYER_3: 'Full enrichment — teacher writes review_text, assigns challenge_role and insight_type. Maximum pedagogical value.',
  }),

  PROGRESSIVE_ENRICHMENT: 'Questions can be shipped at Layer 0 and enriched later. The system degrades gracefully at every layer. Teachers prioritize enrichment based on which questions students encounter most.',

  ANTI_AUTHORITY_PRINCIPLES: Object.freeze([
    'No metadata is set automatically without teacher review — suggestions require confirmation',
    'Teachers can edit any generated suggestion before saving',
    'Teacher edits always take precedence over system suggestions',
    'The system never silently overwrites teacher-authored metadata',
    'QA failure shows clear human-readable reasoning, not algorithmic scores',
    'Teachers can inspect every field the adaptive engine reads for any question',
  ]),

  TEACHER_TRUST_SIGNALS: Object.freeze({
    TRANSPARENCY:  'Every adaptive decision is explainable in one sentence',
    INSPECTABILITY: 'Teachers can see exactly which metadata fields drove sequencing for any question',
    REVERSIBILITY:  'Any metadata change takes effect immediately — no cache, no delay',
    OWNERSHIP:     'Questions belong to the teacher who authored them — the system is a tool, not an authority',
  }),

});

// ─── FUTURE PIPELINE EVOLUTION ────────────────────────────────────────────────

export const FUTURE_PIPELINE = Object.freeze({

  PHASE_NEXT: Object.freeze({
    TEACHER_AUTHORING_UI:   'Admin interface with structured metadata forms — teachers tag concepts via dropdown, not JSON',
    SUGGESTION_LAYER:       'System suggests difficulty_type and cognitive_skill based on question stem — teacher confirms',
    DISTRACTOR_REVIEW_UI:   'Visual mapping of distractor → misconception_type — teacher approves each link',
    REVIEW_TEXT_PREVIEW:    'Live preview of how review_text appears to student during authoring',
    QA_DASHBOARD:           'Teacher-readable QA report per question — which checks passed, which need attention',
  }),

  LONG_TERM: Object.freeze({
    CONCEPT_GRAPH:          'Questions form a concept graph — sequencing follows knowledge prerequisites, not random order',
    CLASS_DIAGNOSTIC:       'Misconception aggregates across class → teacher sees which errors are systemic vs individual',
    INTERDISCIPLINARY_MAP:  'Questions with shared transferable concepts can be surfaced across subjects — transfer learning',
    CONTENT_HEALTH_SCORE:   'Each question accumulates a health score from student performance + misconception signal quality',
  ]),

  NORTH_STAR: 'The pipeline becomes a living pedagogical system where content improves over time — not because an algorithm rewrites it, but because real student data gives teachers better information to refine their questions.',

});

// ─── PRE-SHIP CHECKLIST ───────────────────────────────────────────────────────

export const PIPELINE_TEST = Object.freeze([
  'Can a teacher add a question at Layer 0 (no metadata) and have it work in the student flow?',
  'Does adding difficulty_type to a question immediately affect its wave scoring?',
  'Does misconception_type on a question enable targeted recovery when student answers incorrectly?',
  'Is every metadata field readable by a non-technical teacher without documentation?',
  'Does a question with null metadata preserve its original DB order (score 0)?',
  'Does the QA layer produce human-readable rejection reasoning?',
  'Can a teacher override a QA rejection with a documented reason?',
  'Does concept tagging feed into get_concept_states without any additional migration?',
  'Is the progressive enrichment path (Layer 0 → Layer 3) achievable in a single editing session?',
  'Does the learning engine behave identically whether metadata is null or fully populated?',
]);
