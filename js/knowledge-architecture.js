// ── Knowledge Architecture & Intellectual Progression Contract v1 ─────────────
// Defines how DEN SEJE APP understands knowledge itself — concepts, relationships,
// misconceptions, and the structure of genuine intellectual progression.
//
// PHILOSOPHY: Questions are the surface. Concepts are the substance.
// A platform that understands only question outcomes is teaching recall.
// A platform that understands concepts and their relationships is teaching thinking.
//
// This file answers: HOW DOES THE SYSTEM UNDERSTAND LEARNING ITSELF?
//
// Complements:
//   pedagogical-depth.js    — HOW DOES IT FEEL TO LEARN
//   educational-meaning.js  — WHAT DOES PROGRESSION MEAN
//   platform-coherence.js   — HOW THE PLATFORM FEELS AS ONE THING
//
// All future question design, sequencing, feedback, and progression systems
// should be evaluated against this knowledge architecture.

// ── Knowledge Model Audit ─────────────────────────────────────────────────────
// How the platform currently models knowledge — and where the structural gaps are.

export const KNOWLEDGE_MODEL_AUDIT = Object.freeze({
  CURRENT_MODEL: {
    description:  'The platform currently models knowledge as a flat collection of question-answer pairs, organized by subject category',
    strengths: [
      'Clean question delivery — the quiz state machine is technically sound',
      'Category organisation provides coarse subject grouping',
      'Review feedback field exists — the infrastructure for deeper feedback is present',
      'XP and progression acknowledge engagement over time',
    ],
    structural_gaps: [
      {
        gap:      'No concept layer',
        detail:   'Questions are organised by topic but not by underlying concept. "Which year was the French Revolution?" and "What structural conditions make revolutions likely?" are both history questions, but they test entirely different cognitive operations.',
        severity: 'HIGH — this is the foundational gap',
      },
      {
        gap:      'No misconception awareness',
        detail:   'Wrong answers are registered but not analysed. The system knows the student answered incorrectly — it does not know whether they confused two concepts, inverted a causal relationship, or simply did not know the fact.',
        severity: 'HIGH — the most educationally significant gap',
      },
      {
        gap:      'No cognitive skill tagging',
        detail:   'Questions are not differentiated by cognitive operation: recall, comprehension, application, analysis, causal reasoning, evaluation. All questions are treated as equivalent cognitive tasks.',
        severity: 'MED',
      },
      {
        gap:      'No concept relationship graph',
        detail:   'The system has no model of how concepts relate to each other. Learning "democracy" is not connected to having learned "revolution" or "power". Conceptual build-up is invisible to the system.',
        severity: 'MED',
      },
      {
        gap:      'No transfer potential modelling',
        detail:   'Some questions test knowledge that transfers broadly across domains. Others test narrow recall. The system treats them identically.',
        severity: 'LOW — future opportunity',
      },
      {
        gap:      'No interdisciplinary linking',
        detail:   'A question about economic inequality connects to mathematics, history, and political science. The system does not represent these connections.',
        severity: 'LOW — future opportunity',
      },
    ],
  },
  VERDICT: 'The platform has strong delivery infrastructure and weak knowledge modelling. The highest-leverage improvement is adding a concept and misconception layer — not more questions.',
});

// ── Concept Architecture ──────────────────────────────────────────────────────
// Moving from isolated questions toward concept-based learning.
// This is a philosophy for how knowledge should be structured — not a database schema.

export const CONCEPT_ARCHITECTURE = Object.freeze({
  CORE_PRINCIPLE: 'Questions are how we probe understanding. Concepts are what we are trying to build. The system should know the difference.',

  CONCEPT_GRAPH_PHILOSOPHY: {
    description:   'A concept graph models ideas and their relationships. It is not a curriculum map — it is a map of meaning.',
    NODES:         'Concepts: stable intellectual ideas that recur across questions and domains',
    EDGES:         'Relationships: causal (A causes B), compositional (A is part of B), contrastive (A is not B), temporal (A precedes B), analogical (A is like B in domain X)',
    PURPOSE:       'When a student engages with a question, the system can know which concepts are being exercised — and which conceptual neighbours might be worth reinforcing',
  },

  EXAMPLE_CONCEPT_CLUSTERS: {
    HISTORY: {
      core_concepts:  ['revolution', 'power', 'democracy', 'class', 'industrialisation', 'nationalism', 'colonialism', 'sovereignty'],
      relationships:  [
        { from: 'revolution', to: 'power', type: 'redistribution', description: 'revolutions redistribute power between social groups' },
        { from: 'industrialisation', to: 'class', type: 'produces', description: 'industrialisation produces new class structures' },
        { from: 'democracy', to: 'sovereignty', type: 'grounds', description: 'democracy grounds sovereignty in the people' },
        { from: 'nationalism', to: 'revolution', type: 'enables', description: 'nationalism can function as a mobilising force for revolution' },
      ],
    },
    SCIENCE: {
      core_concepts:  ['energy', 'systems', 'equilibrium', 'adaptation', 'causality', 'evolution', 'entropy', 'emergence'],
      relationships:  [
        { from: 'systems', to: 'equilibrium', type: 'tends_toward', description: 'systems tend toward equilibrium states' },
        { from: 'entropy', to: 'equilibrium', type: 'drives', description: 'entropy drives systems toward equilibrium' },
        { from: 'adaptation', to: 'evolution', type: 'mechanism_of', description: 'adaptation is the mechanism through which evolution operates' },
        { from: 'causality', to: 'systems', type: 'structures', description: 'causal chains structure how systems change over time' },
      ],
    },
    MATHEMATICS: {
      core_concepts:  ['proportionality', 'abstraction', 'representation', 'structure', 'transformation', 'proof', 'pattern', 'equivalence'],
      relationships:  [
        { from: 'abstraction', to: 'pattern', type: 'extracts', description: 'abstraction extracts patterns from specific instances' },
        { from: 'representation', to: 'structure', type: 'reveals', description: 'a good representation makes mathematical structure visible' },
        { from: 'transformation', to: 'equivalence', type: 'preserves', description: 'mathematical transformations preserve equivalence under defined operations' },
        { from: 'proof', to: 'structure', type: 'demonstrates', description: 'proof demonstrates that a structural relationship must hold' },
      ],
    },
  },

  PRACTICAL_IMPLICATIONS: {
    QUESTION_DESIGN: 'Every question should be designed with at least one primary concept in mind. What understanding is this question exercising?',
    REVIEW_FEEDBACK: 'Review feedback can explicitly name and illuminate the concept — "this question is about X, which is connected to Y"',
    SEQUENCING:      'After a student encounters a concept through one question, subsequent questions can deliberately reinforce or extend that concept',
    MISCONCEPTIONS:  'The concept graph makes misconceptions more precise: the student confused concept A with concept B, where the edge between them is causal direction',
  },
});

// ── Question Metadata Philosophy ──────────────────────────────────────────────
// A richer internal model for questions — not for surveillance, but for
// better educational structure and more intelligent feedback.

export const QUESTION_METADATA_PHILOSOPHY = Object.freeze({
  CORE_PRINCIPLE: 'Metadata makes questions educationally legible. A question with no metadata is a question the system cannot learn from.',

  ETHICS_STATEMENT: 'This metadata is for educational improvement — not student profiling. It enriches the system\'s understanding of knowledge, not the system\'s knowledge of the student.',

  PROPOSED_METADATA_FIELDS: {
    concepts: {
      type:    'string[]',
      purpose: 'Which intellectual concepts does this question exercise?',
      example: ['revolution', 'causality'],
    },
    cognitive_skill: {
      type:    'string (enum)',
      values:  ['recall', 'comprehension', 'application', 'causal_reasoning', 'comparison', 'evaluation', 'synthesis'],
      purpose: 'What cognitive operation does a correct answer require?',
      example: 'causal_reasoning',
    },
    difficulty_type: {
      type:    'string (enum)',
      values:  ['factual', 'conceptual', 'analytical', 'transfer'],
      purpose: 'What kind of challenge does this question present?',
      example: 'conceptual',
    },
    misconception_target: {
      type:    'string (optional)',
      purpose: 'What common misconception does a wrong answer reveal?',
      example: 'revolution_as_chaos_not_structural_transition',
    },
    insight_type: {
      type:    'string (optional)',
      values:  ['factual_discovery', 'conceptual_linking', 'reframing', 'pattern_recognition', 'competence_moment'],
      purpose: 'What kind of insight does the review feedback aim to create?',
      example: 'reframing',
    },
    transfer_potential: {
      type:    'string (low/med/high)',
      purpose: 'How broadly does the understanding developed here apply to other domains?',
      example: 'high',
    },
    interdisciplinary: {
      type:    'string[] (optional)',
      purpose: 'Which other subject areas does this question connect to?',
      example: ['political_science', 'economics', 'sociology'],
    },
  },

  EXAMPLE_ENRICHED_QUESTION: {
    text:                 'Hvad var den primære årsag til den Franske Revolution i 1789?',
    concepts:             ['revolution', 'class', 'power'],
    cognitive_skill:      'causal_reasoning',
    difficulty_type:      'analytical',
    misconception_target: 'revolution_as_sudden_not_structural',
    insight_type:         'reframing',
    transfer_potential:   'high',
    interdisciplinary:    ['economics', 'sociology', 'political_science'],
    review_feedback:      'Revolutionen var ikke et pludseligt udbrud men et strukturelt kollaps: en svag statskasse, en privilegeret adel og en nær-sultende bondeklasse — tre strukturelle spændinger der til sidst nåede et brudpunkt.',
  },

  IMPLEMENTATION_NOTE: 'This metadata does not need to be used computationally on day one. Its first value is editorial: it makes question authors think more carefully about what they are teaching and why.',
});

// ── Intellectual Progression ──────────────────────────────────────────────────
// What progression means intellectually — not as difficulty escalation,
// but as deepening conceptual understanding.

export const INTELLECTUAL_PROGRESSION = Object.freeze({
  CORE_PRINCIPLE: 'Intellectual progression is not harder questions forever. It is a widening and deepening of the student\'s understanding of the world.',

  PROGRESSION_DIMENSIONS: {
    CONCEPTUAL_DEPTH: {
      description: 'The student moves from surface facts to underlying concepts',
      early:       '"The French Revolution began in 1789" — factual anchor',
      middle:      '"The French Revolution was caused by fiscal crisis, social inequality, and Enlightenment ideas" — causal understanding',
      advanced:    '"Revolutions occur when structural contradictions outpace institutional capacity for change" — conceptual model that transfers to other contexts',
    },
    CONCEPTUAL_BREADTH: {
      description: 'The student connects an idea to an increasing number of related concepts',
      example:     'Understanding "energy" connects to: chemistry (chemical energy), physics (kinetic/potential), biology (metabolism), economics (energy markets), climate (energy systems)',
      design:      'Questions and review feedback can deliberately build these connections over time',
    },
    TRANSFER_STRENGTH: {
      description: 'The student can apply understanding from one domain to another',
      early:       'Student knows specific facts about specific events',
      advanced:    'Student recognises the structural pattern of "revolution" in contexts they have never studied',
      design:      'High transfer_potential questions should appear after conceptual grounding questions',
    },
    COGNITIVE_FLUENCY: {
      description: 'The student\'s ability to use concepts effortlessly — concepts become thinking tools rather than vocabulary items',
      signal:      'The student who has genuinely internalised "causality" as a concept does not need to think about it consciously — they apply it automatically to new material',
    },
    REFLECTIVE_CAPACITY: {
      description: 'The student can think about their own thinking — noticing what they know, what they do not know, and how their understanding has developed',
      design:      'Review feedback can scaffold this: "you answered this incorrectly earlier — now consider why you answered it correctly"',
    },
  },

  WHAT_PROGRESSION_IS_NOT: {
    NOT_harder_forever:    'Linear difficulty escalation produces anxiety, not understanding',
    NOT_more_facts:        'Accumulating more isolated facts is not intellectual progression — it is storage expansion',
    NOT_optimization:      'A student who has learned to optimise for correct answers has not necessarily learned the material',
    NOT_completion:        'Finishing a category is not the same as understanding the concepts it exercises',
  },
});

// ── Misconception Architecture ────────────────────────────────────────────────
// The most educationally significant gap in the current system.
// Wrong answers are diagnostic — they reveal the structure of misunderstanding.

export const MISCONCEPTION_ARCHITECTURE = Object.freeze({
  CORE_PRINCIPLE: 'A wrong answer is not a null signal — it is the most information-rich event in the learning system. Understanding WHY a student answered incorrectly is more valuable than knowing they did.',

  MISCONCEPTION_TAXONOMY: {
    RECALL_GAP: {
      description: 'The student did not know the fact',
      signal:      'Likely to be corrected by straightforward exposure to the correct answer',
      review_tone: 'Informational: "The answer is X. Here is the context that makes it memorable."',
    },
    CONCEPTUAL_CONFUSION: {
      description: 'The student confused two related but distinct concepts',
      example:     'Confusing "democracy" with "republic", or "velocity" with "speed"',
      signal:      'The wrong answer often represents the other concept',
      review_tone: 'Disambiguating: "These two concepts are often confused because... The key difference is..."',
    },
    CAUSAL_INVERSION: {
      description: 'The student has the causal relationship backwards',
      example:     'Believing industrialisation caused the British Empire, rather than the reverse',
      signal:      'The student understands both concepts but has the direction wrong',
      review_tone: 'Clarifying: "The direction of causality here is important. X caused Y because..."',
    },
    PATTERN_MISRECOGNITION: {
      description: 'The student applied a correct pattern in the wrong context',
      example:     'Applying a rule that works in Newtonian physics to a quantum context',
      signal:      'The wrong answer demonstrates genuine reasoning from a correct principle',
      review_tone: 'Appreciating and redirecting: "This reasoning is correct in context X — here, though, the relevant context is Y..."',
    },
    TERMINOLOGY_CONFUSION: {
      description: 'The student understands the concept but does not know the term',
      signal:      'The student may be able to explain the concept correctly when asked differently',
      review_tone: 'Vocabulary-bridging: "The term for what you are thinking of is X. It refers to..."',
    },
    OVERGENERALIZATION: {
      description: 'The student applied a rule too broadly — beyond its actual domain',
      example:     'Applying the principle of natural selection to cultural change as if it were biological evolution',
      signal:      'The wrong answer shows conceptual confidence that has outrun conceptual precision',
      review_tone: 'Boundary-setting: "This principle applies well to X — in Y, the key difference is..."',
    },
  },

  DESIGN_IMPLICATIONS: {
    WRONG_OPTION_DESIGN:    'Multiple-choice wrong options should represent specific misconception types — not arbitrary wrong answers',
    REVIEW_FEEDBACK_TARGET: 'Review feedback should address the most common misconception for this question — not just state the correct answer',
    METADATA_USE:           'misconception_target in question metadata enables review feedback writers to address the right misunderstanding',
    LONG_TERM_VALUE:        'As the system accumulates question metadata, patterns in wrong answers become visible — which misconceptions recur, which concepts are most frequently confused',
  },
});

// ── Adaptive Review Philosophy ────────────────────────────────────────────────
// The highest-leverage future system: review feedback that understands concepts
// and misconceptions, not just correct answers.

export const ADAPTIVE_REVIEW_PHILOSOPHY = Object.freeze({
  CORE_PRINCIPLE: 'Feedback that knows what the student misunderstood is categorically more valuable than feedback that states what is correct.',

  FEEDBACK_INTELLIGENCE_LEVELS: {
    LEVEL_0: {
      name:        'Correct Answer',
      example:     '"Svaret var: 1789"',
      value:       'Minimal — confirms the student was wrong but teaches nothing about why',
    },
    LEVEL_1: {
      name:        'Contextual Answer',
      example:     '"Den Franske Revolution begyndte i 1789 — det år Bastillen stormededes."',
      value:       'Low — adds a memorable detail but no conceptual explanation',
    },
    LEVEL_2: {
      name:        'Conceptual Explanation',
      example:     '"Den Franske Revolution begyndte i 1789. Revolutioner opstår typisk ikke pludseligt — de er strukturelle spændinger der når et brudpunkt. Her var det statslig bankerot, social ulighed og politisk udelukkelse."',
      value:       'HIGH — explains the concept, not just the fact. Creates transferable understanding.',
    },
    LEVEL_3: {
      name:        'Misconception-Targeted',
      example:     '"Den Franske Revolution begyndte i 1789. Mange tror revolutioner er spontane folkeoprør — men historisk er de næsten altid strukturelle kollaps. Spontaniteten er synlig; strukturen er årsagen."',
      value:       'HIGHEST — addresses the specific misunderstanding, creates deeper conceptual revision.',
    },
  },

  FEEDBACK_DESIGN_PRINCIPLES: {
    CONCEPT_FIRST:    'Name the concept before explaining the fact: "This question is about causality in historical change — specifically..."',
    MISCONCEPTION:    'Address the likely misunderstanding, not just the correct answer: "It is tempting to think X because... but the key insight is..."',
    CONNECTION:       'Link to related concepts: "This connects to what we saw in questions about [related concept]..."',
    TRANSFER_PROMPT:  'Gesture toward broader application: "This same pattern appears in [other domain]..."',
    BREVITY:          '2–3 sentences maximum. Enough to illuminate, not so much it becomes a lecture.',
    TONE:             'Intellectually warm and genuinely interested — not clinical or textbook-like',
  },

  ETHICS_OF_ADAPTIVE_FEEDBACK: {
    principle:  'Adaptive feedback is ethically bounded by its purpose: to serve the student\'s understanding, not to profile them',
    acceptable: 'Feedback that is richer because the question metadata is richer',
    acceptable2: 'Feedback that addresses common misconceptions for this type of question',
    NOT_acceptable: 'Feedback that reveals or implies data about the individual student\'s profile',
    NOT_acceptable2: 'Feedback that uses the student\'s wrong-answer history to make inferences about their intelligence',
  },
});

// ── Learning Sequencing ───────────────────────────────────────────────────────
// Healthy intellectual sequencing — structured and alive.

export const LEARNING_SEQUENCING = Object.freeze({
  CORE_PRINCIPLE: 'A sequence of questions is not a queue — it is a pedagogical argument for how understanding builds.',

  SEQUENCING_PRINCIPLES: {
    CONCEPT_INTRODUCTION: {
      description: 'A new concept should first be encountered in its most accessible, concrete form',
      example:     '"What happened in the French Revolution?" before "What structural conditions make revolutions more likely?"',
      purpose:     'Factual anchor before conceptual framework',
    },
    CONCEPTUAL_REINFORCEMENT: {
      description: 'After a concept is introduced, it should recur in varied contexts to build robustness',
      example:     'The concept of "causality" appearing in history, then science, then mathematics questions',
      purpose:     'Cross-context encounters create genuine conceptual understanding, not just domain-specific recall',
    },
    MISCONCEPTION_ADDRESS: {
      description: 'If question metadata identifies a common misconception, a subsequent question can deliberately target it',
      example:     'After a question where students commonly confuse democracy with majority rule, a follow-up question tests the limits of majority rule',
      purpose:     'Proactive misconception correction rather than passive wrong-answer accumulation',
    },
    CHALLENGE_WAVE: {
      description: 'Difficulty should alternate: stretch → consolidate → stretch → consolidate',
      purpose:     'Cognitive breathing room is not wasted time — it is mastery stabilisation',
    },
    TRANSFER_MOMENT: {
      description: 'After conceptual grounding, a question that requires applying the concept in a new context',
      purpose:     'Transfer moments test whether understanding is genuine — whether the student owns the concept, not just the answer',
    },
    INSIGHT_BRIDGE: {
      description: 'Occasionally, a question sequence is designed to produce a specific insight — a sequence where the last question reframes everything before it',
      purpose:     'These are the highest-value moments in the learning system — when understanding restructures itself',
    },
  },

  WHAT_RANDOM_SEQUENCING_MISSES: [
    'Conceptual build-up: questions that would be easier in the right order feel arbitrary in random order',
    'Misconception prevention: a question that corrects a common misconception has no value before the misconception is established',
    'Transfer moments: a transfer question before conceptual grounding is confusing rather than challenging',
    'Challenge wave rhythm: random ordering produces random cognitive load distribution',
  ],
});

// ── Intellectual Identity Formation ──────────────────────────────────────────
// Supporting the development of healthy intellectual self-perception.
// From "I earn points" toward "I am becoming someone who understands."

export const INTELLECTUAL_IDENTITY = Object.freeze({
  CORE_PRINCIPLE: 'The most durable educational outcome is a student who identifies as a curious, capable thinker — not a student who earned points.',

  GROWTH_IDENTITY_PRINCIPLES: {
    NOT_FIXED_INTELLIGENCE: {
      principle:  'The platform must never imply that intellectual ability is fixed',
      design:     'No framing that treats wrong answers as evidence of intellectual limitation',
      language:   '"You answered this incorrectly — here is the understanding that makes it clear" not "This was too hard for you"',
    },
    GROWTH_NARRATIVE: {
      principle:  'The student should be able to see themselves growing — not just accumulating',
      design:     'Progress should feel like "I understand more of the world" — not "I have more XP"',
      signal:     'Review feedback that illuminates genuine understanding contributes directly to growth narrative',
    },
    COGNITIVE_STRENGTH_AWARENESS: {
      principle:  'Students can develop awareness of their own thinking strengths over time',
      examples:   ['Pattern recognition: noticing when you tend to see underlying structures', 'Causal reasoning: tendency to ask "why" before accepting explanations', 'Conceptual connection: noticing when two domains are structurally similar'],
      design:     'These are not ranked or scored — they are qualities of mind that emerge through sustained engagement',
      NOT:        'A dashboard showing "your causal reasoning score is 67%" — this is reductive and creates performance anxiety',
    },
    INTELLECTUAL_CONFIDENCE: {
      principle:  'True intellectual confidence is the ability to engage with difficult material without anxiety',
      source:     'It comes from accumulated experience of being wrong, understanding why, and returning stronger — not from being consistently correct',
      design:     'The wrong-answer experience design in Section 35 directly builds the conditions for genuine intellectual confidence',
    },
  },

  IDENTITY_LANGUAGE: {
    PREFER: [
      '"Du er ved at forstå det her emne dybere"',
      '"Du har nu mødt dette begreb i tre forskellige sammenhænge"',
      '"Din vej til det rigtige svar viser at du tænker over strukturen"',
    ],
    AVOID: [
      '"Dit score i denne kategori er X%"',
      '"Du er i top 20% for dette emne"',
      '"Du har besvaret X spørgsmål korrekt i træk"',
    ],
    REASONING: 'External ranking frames intelligence as a competition. Growth framing frames intelligence as a practice.',
  },
});

// ── Future Learning Ecosystem ─────────────────────────────────────────────────
// How the knowledge architecture scales into a meaningful intellectual ecosystem.

export const FUTURE_LEARNING_ECOSYSTEM = Object.freeze({
  LIFELONG_CURIOSITY: {
    principle:  'The knowledge architecture should make the student more curious about the world — not just better at answering quiz questions',
    mechanism:  'Concept graphs that gesture beyond the platform: "this concept appears in economics, climate science, and political philosophy"',
    test:       'A student who has used the platform for a year should feel that their relationship with ideas has deepened — not just their familiarity with the platform',
  },
  DEEP_CONCEPTUAL_CULTURE: {
    principle:  'The platform should cultivate an ethos where understanding concepts is more valued than collecting correct answers',
    signals:    ['Review feedback that illuminates concepts rather than merely confirming answers', 'Sequencing that builds conceptual understanding deliberately', 'A platform that treats wrong answers as the most interesting educational data'],
  },
  CLASSROOM_INTELLIGENCE: {
    principle:  'Teachers who use the platform should find that students develop better conceptual vocabulary and cross-domain thinking — not just better quiz scores',
    mechanism:  'Question design informed by concept architecture produces questions that develop transferable understanding',
    test:       'A teacher reviewing a student\'s learning history should be able to say "they understand X concept" — not just "they answered Y questions correctly"',
  },
  REFLECTIVE_ECOSYSTEM: {
    principle:  'In the long term, the platform can support genuine intellectual reflection — looking back at a learning journey and seeing conceptual development',
    design:     'Not as a dashboard of statistics, but as a narrative: "earlier this year you found this concept difficult — now you can see it from three angles"',
    ethics:     'This must be voluntary, private, and framed around growth — never around comparison or ranking',
  },
  ANTI_OPTIMISATION: {
    principle:  'The knowledge architecture must be protected from being optimised against itself',
    risk:       'If the metadata becomes visible to students, some will optimise for the metadata rather than the understanding',
    protection: 'The metadata is for the system\'s educational intelligence — not for student-facing metrics',
  },
});

// ── Knowledge Architecture Test ───────────────────────────────────────────────
// Eight questions for evaluating any question, sequence, or knowledge-system decision.

export const KNOWLEDGE_ARCHITECTURE_TEST = Object.freeze([
  'Does this question exercise a clearly identified concept — or is it testing isolated recall?',
  'If a student answers this incorrectly, does the review feedback address the likely misconception — or merely state the correct answer?',
  'Does this question\'s position in a sequence make conceptual sense — does the preceding question prepare the student for this one?',
  'Could a student who answered this correctly have done so without understanding the underlying concept?',
  'Does the review feedback build a transferable understanding — one the student could use in a different domain?',
  'Would a thoughtful teacher look at this review feedback and say it captures what genuinely matters about this question?',
  'Does this system support the student\'s growth identity — or does it reduce them to a performance metric?',
  'In five years, will the students who engaged deeply with this knowledge architecture think in better concepts — or will they just have answered more questions?',
]);
