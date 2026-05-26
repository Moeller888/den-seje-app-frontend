/**
 * Section 39 — Educational Content Intelligence: Design Contract
 *
 * Documents the philosophy, authoring standards, and quality systems
 * for educational content activated in Section 39.
 *
 * NOT an implementation file. The authoritative specification for WHY
 * the content must be as crafted as the engine that delivers it.
 */

// ─── CONTENT QUALITY AUDIT ────────────────────────────────────────────────────

export const CONTENT_QUALITY_AUDIT = Object.freeze({

  CORE_CRITERION: '"Would a thoughtful teacher respect this content?" — the single audit question',

  SHALLOW_PATTERNS: Object.freeze([
    'Pure recall with no conceptual hook: "What year did X happen?"',
    'Distractors that are obviously wrong to anyone with minimal knowledge',
    'review_text that restates the correct answer without adding context',
    'No misconception_type available — teacher cannot diagnose error patterns',
    'Isolated facts with no concept links to adjacent knowledge',
    'Questions that test trivia, not understanding',
    'Wrong answers chosen for availability, not for diagnostic value',
    'Explanation that says "the correct answer is X" instead of "this matters because"',
  ]),

  QUALITY_SIGNALS: Object.freeze([
    'Question requires reasoning, not just memory retrieval',
    'Wrong answers represent real student thinking patterns',
    'review_text deepens understanding rather than restating the answer',
    'Concept links enable interdisciplinary insight',
    'misconception_type is identifiable and pedagogically meaningful',
    'A teacher could use this question to open a class discussion',
    'Student who gets it wrong learns something from the explanation',
    'Student who gets it right still gains perspective from the question context',
  ]),

  ENGINE_WITHOUT_CONTENT: 'A powerful adaptive engine with shallow content still produces shallow learning. Section 38 built the sequencing intelligence. Section 39 asks: does the content deserve it?',

});

// ─── GOLD-STANDARD QUESTION CONTRACT ─────────────────────────────────────────

export const QUESTION_AUTHORING_CONTRACT = Object.freeze({

  WHAT_A_QUESTION_MUST_DO: Object.freeze([
    'Activate genuine curiosity — not just test knowledge',
    'Reward conceptual understanding over memorization',
    'Make thinking visible — right answer requires a mental step',
    'Respect the student as an intelligent person',
    'Open toward adjacent questions rather than closing into isolated fact',
    'Have a correct answer that feels satisfying, not arbitrary',
  ]),

  WHAT_A_QUESTION_MUST_NOT_DO: Object.freeze([
    'Test recall of specific years, names, or figures with no conceptual scaffolding',
    'Use ambiguity as a difficulty device — difficulty should be conceptual, not linguistic',
    'Create "gotcha" questions that punish careful thinking',
    'Rely on obscure vocabulary to filter responses rather than testing understanding',
    'Reward test-taking strategy over subject knowledge',
    'Make students feel stupid for not knowing a date or figure',
  ]),

  QUALITY_DIMENSIONS: Object.freeze({
    CURIOSITY_ACTIVATION: 'Does this question make the student want to know more?',
    COGNITIVE_DEPTH:      'Does answering require reasoning, not just retrieval?',
    EDUCATIONAL_RESPECT:  'Would a thoughtful teacher be proud to use this?',
    MISCONCEPTION_VALUE:  'Do the wrong answers reveal real thinking patterns?',
    INSIGHT_POTENTIAL:    'Could this question connect to something bigger?',
    DISCUSSION_POTENTIAL: 'Could a teacher use this to start a conversation?',
  }),

  EXEMPLAR_QUESTION: Object.freeze({
    WEAK:  '"In what year did the French Revolution begin?" — tests memorization only',
    BETTER: '"Which of the following best explains why popular uprisings succeed?" — tests causal reasoning',
    STRONG: '"Why did the storming of the Bastille become a symbol even though it freed very few prisoners?" — tests conceptual understanding of symbolism and collective action',
  }),

});

// ─── MISCONCEPTION-AWARE WRITING ─────────────────────────────────────────────

export const MISCONCEPTION_AUTHORING = Object.freeze({

  PHILOSOPHY: 'Distractors should teach diagnostically — not deceive performatively. A wrong answer is not a trap. It is a mirror.',

  WHY_STUDENTS_CHOOSE_WRONG: Object.freeze([
    'Causal inversion — confusing cause and effect ("the revolution caused the poverty" vs "poverty fuelled the revolution")',
    'Overgeneralization — applying a rule beyond its valid scope',
    'Terminology trap — knowing a word but misunderstanding its meaning',
    'Surface pattern matching — choosing the answer that sounds most like the question',
    'Temporal confusion — misplacing an event in a sequence',
    'Scope confusion — applying a local fact globally or vice versa',
    'False authority — choosing the most famous name in the list',
  ]),

  DISTRACTOR_AUTHORING_PRINCIPLES: Object.freeze([
    'Each wrong answer should represent a specific, nameable misconception',
    'Wrong answers should be plausible to someone with partial understanding',
    'Wrong answers should never be obviously silly or clearly irrelevant',
    'The "trap" answer should be the one that reflects the most common real error',
    'Distractors should be parallel in structure to the correct answer',
    'Avoid answers that are technically true but in the wrong context',
  ]),

  MISCONCEPTION_TAXONOMY: Object.freeze({
    causal_inversion:    'Student reverses cause and effect relationships',
    overgeneralization:  'Student applies a rule to cases outside its valid scope',
    false_equivalence:   'Student treats two similar but distinct concepts as identical',
    temporal_confusion:  'Student misplaces events in time or sequence',
    scope_confusion:     'Student applies local truth globally or global truth locally',
    surface_association: 'Student chooses answer based on keyword matching, not reasoning',
    authority_bias:      'Student chooses the most famous/prominent option regardless of correctness',
  }),

  DIAGNOSTIC_VALUE: 'When a teacher sees that 60% of students chose "causal_inversion" on a French Revolution question, they know exactly what to address in tomorrow\'s class.',

});

// ─── REVIEW_TEXT CRAFTSMANSHIP ────────────────────────────────────────────────

export const REVIEW_TEXT_PHILOSOPHY = Object.freeze({

  CORE_PRINCIPLE: 'review_text is not output. It is a conversation. It should say something the correct answer alone cannot.',

  QUALITY_LADDER: Object.freeze({
    LEVEL_0: Object.freeze({
      label: 'Raw answer',
      example: '"Correct answer: 1789."',
      problem: 'States the fact without building understanding. Student learns nothing from being wrong.',
    }),
    LEVEL_1: Object.freeze({
      label: 'Contextual explanation',
      example: '"The French Revolution began in 1789 when the Bastille was stormed — a symbolic moment where public anger became political action."',
      improvement: 'Adds context. Student understands why the answer is what it is.',
    }),
    LEVEL_2: Object.freeze({
      label: 'Conceptual connection',
      example: '"This moment matters because it shows how collective frustration can transform into political power — a pattern that appears in revolutions across centuries."',
      improvement: 'Connects to bigger idea. Student gains insight beyond the specific fact.',
    }),
    LEVEL_3: Object.freeze({
      label: 'Reflective deepening',
      example: '"Notice that the Bastille held only 7 prisoners when stormed. What made it powerful was not what it held — but what it represented. Symbols sometimes matter more than facts."',
      improvement: 'Invites reflection. Student is challenged to think about WHY this was meaningful.',
      status: 'Gold standard — currently requires teacher authoring per question',
    }),
  }),

  WRITING_PRINCIPLES: Object.freeze([
    'Start from the misconception, not the correct answer — address WHY students go wrong',
    'Explain the concept, not just the fact — "this matters because" not "the answer is"',
    'Connect to adjacent knowledge — "this pattern also appears in..."',
    'Use active voice and concrete imagery — avoid academic abstraction',
    'Write for the student who just got it wrong — they are frustrated; meet them there',
    'Keep it concise — one insight per review_text, not a lecture',
    'Avoid "actually" and "simply" — they feel condescending',
  ]),

  ANTI_PATTERNS: Object.freeze([
    'Restating the question stem with the answer inserted',
    'Adding unrelated historical context that does not address the misconception',
    'Using academic vocabulary the student does not yet have',
    'Writing from the teacher perspective ("students often confuse...") instead of student perspective',
    'Adding trivia that is interesting but not pedagogically connected',
    'Making the student feel foolish for their wrong answer',
  ]),

});

// ─── CONCEPT-LINK WRITING ─────────────────────────────────────────────────────

export const CONCEPT_LINK_PHILOSOPHY = Object.freeze({

  GOAL: 'Knowledge should feel connected and alive — not a collection of isolated facts.',

  INTERDISCIPLINARY_BRIDGES: Object.freeze({
    'history ↔ politics':     'Power, legitimacy, collective action, representation',
    'math ↔ physics':         'Models, approximation, measurement, force',
    'biology ↔ systems':      'Feedback loops, emergence, adaptation, resilience',
    'language ↔ persuasion':  'Framing, metaphor, tone, audience',
    'geography ↔ economics':  'Resource distribution, trade routes, comparative advantage',
    'art ↔ culture':          'Expression, identity, historical context, aesthetic judgment',
  }),

  HOW_TO_WRITE_CONCEPT_LINKS: Object.freeze([
    'Tag questions with concepts from adjacent domains where genuine connections exist',
    'write review_text that draws the connection explicitly: "this same tension appears in..."',
    'Avoid forced connections — only link where the insight is real and meaningful',
    'Use concept links to help students build a mental web, not a list',
    'Prioritize connections that surprise students productively',
  ]),

  METADATA_IMPLEMENTATION: Object.freeze({
    EXAMPLE_QUESTION: '"Why did the storming of the Bastille succeed as a political act despite its military insignificance?"',
    CONCEPTS:         '["revolution", "symbolism", "collective_action", "political_legitimacy"]',
    INTERDISCIPLINARY: 'Links to political science (legitimacy), sociology (collective action), semiotics (symbolism)',
    COGNITIVE_SKILL:  'evaluation — student must judge the relationship between military and symbolic dimensions',
  }),

});

// ─── INSIGHT-ORIENTED DISTRACTOR DESIGN ──────────────────────────────────────

export const DISTRACTOR_DESIGN = Object.freeze({

  MOVE_AWAY_FROM: Object.freeze([
    'Obviously impossible answers ("Napoleon did it" when question is pre-Napoleon)',
    'Random noise distractors with no connection to the topic',
    'Answers that are clearly wrong to any student who read the chapter',
    'Distractors that exist to fill space rather than teach',
  ]),

  MOVE_TOWARD: Object.freeze([
    'Plausible misconceptions — answers a student with partial understanding would choose',
    'Partial-understanding traps — answers that are true in a different context',
    'Conceptual confusion — answers that reflect genuine reasoning errors',
    'Reasoning diagnostics — each wrong answer maps to a specific thinking pattern',
  ]),

  DISTRACTOR_QUALITY_TEST: Object.freeze([
    '"Could a student who studied but misunderstood this concept choose this wrong answer?" → Good distractor',
    '"Does this wrong answer reveal something about how the student is thinking?" → Good distractor',
    '"Would a teacher be able to use this wrong answer to diagnose a misconception?" → Good distractor',
    '"Is this wrong answer obviously absurd to anyone with minimal knowledge?" → Bad distractor',
    '"Did I choose this wrong answer because it was easy to write?" → Bad distractor',
  ]),

});

// ─── PEDAGOGICAL QA SYSTEM ────────────────────────────────────────────────────

export const PEDAGOGICAL_QA = Object.freeze({

  REVIEW_DIMENSIONS: Object.freeze({
    CONCEPTUAL_CLARITY:     'Is the question unambiguous to a careful reader?',
    EDUCATIONAL_VALUE:      'Does this question develop understanding, not just recall?',
    MISCONCEPTION_QUALITY:  'Do the wrong answers represent real thinking patterns?',
    REVIEW_TEXT_QUALITY:    'Does the review_text add insight beyond the correct answer?',
    CURIOSITY_POTENTIAL:    'Does this question make the student curious?',
    EMOTIONAL_TONE:         'Is this question respectful and engaging, not condescending?',
    CHALLENGE_APPROPRIATENESS: 'Is the difficulty genuine, not fake (obscure vocabulary, tricks)?',
    INTELLECTUAL_DIGNITY:   'Would a thoughtful educator be comfortable using this?',
  }),

  REJECTION_CRITERIA: Object.freeze([
    'Question tests a date or name with no conceptual scaffolding',
    'At least one distractor is obviously absurd',
    'review_text only restates the correct answer',
    'Question relies on ambiguity rather than genuine cognitive challenge',
    'A student could get this correct by test-taking strategy rather than subject knowledge',
    'The question has no pedagogical purpose beyond assessment compliance',
  ]),

  SCORING_THRESHOLD: 'A question must pass at least 6 of 8 quality dimensions before it enters the active question bank. Teacher override available.',

  TEACHER_OVERRIDE: 'Teachers can approve questions that fail QA if they have pedagogical context the system lacks. Human judgment supersedes algorithmic review.',

});

// ─── TEACHER AUTHORING WORKFLOW ───────────────────────────────────────────────

export const TEACHER_AUTHORING = Object.freeze({

  PHILOSOPHY: 'The system should empower teachers — not replace them. Every metadata field should be understandable and writable by a thoughtful non-technical teacher.',

  METADATA_FIELD_GUIDE: Object.freeze({
    'concepts':           'Tags for what this question is about (e.g., ["revolution", "symbolism"]). Use natural language nouns.',
    'difficulty_type':    'factual | conceptual | analytical | applied — what kind of thinking does this require?',
    'cognitive_skill':    'recall | comprehension | analysis | synthesis | evaluation | application — Bloom\'s taxonomy level',
    'misconception_type': 'The specific thinking error this question diagnoses (e.g., "causal_inversion")',
    'review_text':        'What a student should understand after getting this wrong. Explain the concept, not the answer.',
  }),

  AUTHORING_WORKFLOW: Object.freeze([
    '1. Write the question stem — focus on the concept you want students to reason about',
    '2. Write the correct answer — it should feel satisfying and clear',
    '3. Write 3 distractors — one for each major misconception pattern you expect',
    '4. Assign misconception_type to the most diagnostic wrong answer',
    '5. Write review_text — start from the misconception, explain the concept',
    '6. Tag concepts — what knowledge domains does this question touch?',
    '7. Assign difficulty_type and cognitive_skill from the taxonomy',
    '8. Read it back as a student — does it feel fair and intellectually honest?',
  ]),

  WHAT_TEACHERS_SHOULD_NEVER_NEED_TO_DO: Object.freeze([
    'Write JSON by hand in the production UI',
    'Understand wave-scoring weights or adaptive algorithms',
    'Know which questions are in which wave phase',
    'Predict student sequencing outcomes',
    'Modify database records directly',
  ]),

  TEACHER_INTERFACE_PRINCIPLES: Object.freeze([
    'Every field has a plain-language label and tooltip',
    'Dropdown selectors for difficulty_type and cognitive_skill (no free-text errors)',
    'Preview of how review_text will appear to the student',
    'Clear visual distinction between what is required and what is optional',
    'One-click QA check before saving',
  ]),

});

// ─── FUTURE CONTENT INTELLIGENCE ECOSYSTEM ───────────────────────────────────

export const FUTURE_CONTENT_ECOSYSTEM = Object.freeze({

  VISION: 'Over time, the platform accumulates not just questions — but conceptual wisdom. Each question becomes part of an intellectual fabric, not just a quiz bank.',

  CONTENT_LONGEVITY: Object.freeze([
    'Questions are tagged by concept, not by topic — they outlast curriculum changes',
    'review_text is authored to remain true beyond specific syllabi',
    'Misconception patterns are universal — causal_inversion appears in history, biology, economics',
    'Concept links become curriculum — the connections between ideas are the education',
  ]),

  QUALITY_ACCUMULATION: Object.freeze([
    'Each teacher-authored review_text raises the bar for the next',
    'Misconception data from real students improves distractor quality over time',
    'High-QA-scoring questions become templates for future authoring',
    'Teacher feedback on student misconception patterns feeds back into question improvement',
  ]),

  WHAT_TO_AVOID: Object.freeze([
    'Content-farm degeneration: quantity optimization at the expense of quality',
    'AI-generated question banks without teacher curation and pedagogical review',
    'Assessment pressure driving shallow question design ("we need 500 questions by Friday")',
    'Treating content as infrastructure rather than as the primary educational product',
    'Separating content authoring from pedagogical intent',
  ]),

  NORTH_STAR: 'The platform becomes a place where students feel that learning is genuinely worth doing — because every question, explanation, and connection was crafted by a thoughtful educator who believed that content quality is learning quality.',

});

// ─── PRE-SHIP CHECKLIST ───────────────────────────────────────────────────────

export const CONTENT_INTELLIGENCE_TEST = Object.freeze([
  'Does every question in the active bank have at least a difficulty_type tag?',
  'Do all distractors represent real misconception patterns, not obvious fakes?',
  'Is review_text present for all questions where teachers have flagged common errors?',
  'Does review_text explain the concept rather than restate the answer?',
  'Is misconception_type set for at least one distractor per question where applicable?',
  'Have concept tags been assigned to all questions with interdisciplinary potential?',
  'Can a teacher write a complete question with metadata without technical assistance?',
  'Does the pedagogical QA system surface rejection criteria clearly to authors?',
  'Is there no question in the bank that would embarrass a thoughtful educator?',
  'Does the content system feel like educational craftsmanship, not content production?',
]);
