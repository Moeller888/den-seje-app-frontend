/**
 * Section 42 — Teacher Authoring Workspace & Pedagogical Tooling: Design Contract
 *
 * Documents the philosophy, UX principles, and interaction design for
 * teacher-centered authoring tooling activated in Section 42.
 *
 * NOT an implementation file. The authoritative specification for WHY
 * the authoring workspace should feel the way it does — and why that matters
 * as much as the underlying pedagogical architecture.
 */

// ─── TEACHER WORKFLOW AUDIT ───────────────────────────────────────────────────

export const WORKFLOW_AUDIT = Object.freeze({

  CURRENT_AUTHORING_REALITY: Object.freeze({
    QUESTION_CREATION:   'Direct DB insert or admin interface — no dedicated authoring flow',
    METADATA_EDITING:    'Manual JSONB editing — technically functional, humanly opaque',
    REVIEW_TEXT_EDITING: 'No dedicated writing surface — inserted as content.review_text JSONB field',
    CONCEPT_TAGGING:     'Free-text array — no vocabulary enforcement, no suggestions',
    MISCONCEPTION_TYPE:  'Free-text field — drift inevitable without controlled vocabulary',
    QA_REVIEW:           'No systematic review surface — quality is remembered, not supported',
    CONTENT_DISCOVERY:   'Admin question_performance view — functional but analytics-heavy',
  }),

  TEACHER_FRUSTRATION_SOURCES: Object.freeze([
    'Having to know JSONB structure to enrich a question — technical barrier for pedagogical work',
    'No suggestion context for cognitive_skill or difficulty_type — arbitrary without reference',
    'review_text field has no writing guidance — blank field invites blank writing',
    'Misconception_type is free-text — inconsistent values accumulate invisibly',
    'No signal that a question needs attention — gaps are invisible until students suffer them',
    'Enrichment feels like data entry, not educational craftsmanship',
    'No sense of progress or completion — the work feels boundless',
  ]),

  COGNITIVE_OVERLOAD_SIGNALS: Object.freeze([
    'More than 5 simultaneous fields visible = cognitive load collapse',
    'No field grouping by pedagogical purpose = random-looking form',
    'No context for why a field matters = fields feel bureaucratic',
    'Mandatory enrichment pressure = teacher anxiety',
    'Visible analytics during authoring = performance pressure displacing creativity',
  ]),

  VERDICT: 'The architecture is excellent. The authoring experience does not yet match it. Great educational systems lose teachers at the interface layer — not at the philosophy layer.',

});

// ─── TEACHER EXPERIENCE CONTRACT ─────────────────────────────────────────────

export const TEACHER_EXPERIENCE_CONTRACT = Object.freeze({

  EMOTIONAL_GOAL: 'When a teacher closes the authoring workspace, they should feel: "I made something good today." Not: "I processed data today."',

  WORKSPACE_CHARACTER: Object.freeze({
    CALM:        'No visual noise, no status anxiety, no competing priorities on screen',
    SPACIOUS:    'Each authoring surface has room to think — not cramped into a single form',
    GUIDED:      'The workspace knows what would help next and offers it — never demands it',
    UNDERSTANDABLE: 'Every field has a plain-language purpose a non-technical educator can hold',
    REFLECTIVE:  'The writing surfaces invite slow, thoughtful composition — not rushed entry',
    CRAFT_ORIENTED: 'The aesthetic communicates that educational content is skilled work, not data production',
  }),

  WHAT_THE_WORKSPACE_COMMUNICATES: Object.freeze([
    '"Your pedagogical judgment is the authority here — we assist, not override"',
    '"Your content grows better over time — nothing you do today is final or permanent"',
    '"Every piece of work you do here directly affects how a student learns"',
    '"This is a craft workspace — take your time, think carefully"',
    '"You can always save a partial draft and return — no enrichment must happen all at once"',
  ]),

  WHAT_THE_WORKSPACE_NEVER_COMMUNICATES: Object.freeze([
    '"You have X questions below quality threshold" — no performance pressure',
    '"Your enrichment rate is Y% of colleagues" — no comparison',
    '"This content failed QA" without human-readable explanation and a clear next step',
    '"Field required before continuing" for any enrichment field — progressive is always valid',
    '"AI has improved your question" without explicit author review and confirmation',
  ]),

});

// ─── PROGRESSIVE AUTHORING FLOW ──────────────────────────────────────────────

export const PROGRESSIVE_AUTHORING_FLOW = Object.freeze({

  PHILOSOPHY: 'The authoring workspace reveals complexity progressively — only showing the next enrichment layer when the teacher is ready for it. Depth is always available; overwhelm is never the default.',

  LAYER_FLOW: Object.freeze({
    LAYER_0: Object.freeze({
      label: 'Write the question',
      fields: ['Question stem', 'Answer options', 'Correct answer'],
      guidance: 'Write the question you want students to think about. Everything else can come later.',
      completion_signal: 'Question can be saved and served to students immediately.',
      next_prompt: '"Want to add feedback for when students get this wrong?" (dismissable)',
    }),
    LAYER_1: Object.freeze({
      label: 'Add context and feedback',
      fields: ['Review text', 'Concepts (2–4)', 'Difficulty level'],
      guidance: 'When a student gets this wrong, what should they understand? Write for that moment.',
      completion_signal: 'Question now participates in adaptive sequencing. Wave sorting active.',
      next_prompt: '"Want to mark which wrong answer reveals a common misconception?" (dismissable)',
    }),
    LAYER_2: Object.freeze({
      label: 'Teach the misconception',
      fields: ['Misconception type', 'Cognitive skill', 'Challenge role'],
      guidance: 'Which wrong answer would a student with partial understanding choose? Name that pattern.',
      completion_signal: 'Targeted recovery activates. Concept health tracking online.',
      next_prompt: '"Does this question connect to ideas in other subjects?" (dismissable)',
    }),
    LAYER_3: Object.freeze({
      label: 'Deepen the connections',
      fields: ['Interdisciplinary links', 'Insight type', 'Review text upgrade (Level 3+)'],
      guidance: 'What bigger idea does this question touch? Where does this pattern appear in other domains?',
      completion_signal: 'Full learning object. Maximum adaptive and pedagogical value.',
      next_prompt: null,
    }),
  }),

  PROGRESSIVE_DISCLOSURE_PRINCIPLES: Object.freeze([
    'Never show Layer 2 fields until Layer 0 is saved',
    'Each layer transition is teacher-initiated — never automatic',
    'Every layer is independently saveable — partial enrichment is always valid',
    'The workspace remembers where the teacher left off',
    '"Not now" on any layer prompt is always a valid response, stored without judgment',
  ]),

});

// ─── REVIEW_TEXT WRITING EXPERIENCE ──────────────────────────────────────────

export const REVIEW_TEXT_WRITING = Object.freeze({

  PHILOSOPHY: 'The review_text editor is the heart of pedagogical craftsmanship. It deserves a dedicated writing surface — not a text input inside a metadata form.',

  EDITOR_DESIGN_PRINCIPLES: Object.freeze({
    BREATHING_ROOM:   'Full-width writing surface, comfortable line height, generous padding — writing should feel spacious',
    CONTEXT_VISIBLE:  'The question and correct answer are visible while writing review_text — context is always present',
    WORD_COUNT_GUIDE: 'Gentle indication of 2–4 sentence ideal length — shown as a range, not a hard limit',
    LEVEL_INDICATOR:  'Soft label showing current review_text level (Level 0–3) based on content analysis — descriptive, not prescriptive',
    PROMPT_STARTERS:  'Optional sentence starters available on request: "This happens because...", "What makes this tricky is...", "This connects to..."',
    NO_SPELL_CORRECTION: 'Academic vocabulary and subject-specific terms should not be auto-corrected away',
  ]),

  WRITING_PROMPTS: Object.freeze({
    MISCONCEPTION_ANCHOR: 'Think about why a student might choose the wrong answer. What did they probably believe? Start from there.',
    CONCEPT_CONNECTOR:    'If this concept appeared in a different subject, what would it look like? That connection might be worth naming.',
    CAUSAL_FRAME:         '"What caused X to happen?" is a more powerful frame than "X happened because Y." Write for the student who asked why.',
    INSIGHT_INVITATION:   'What about this is counter-intuitive? What would surprise a curious student?',
  }),

  REVIEW_TEXT_LEVEL_FEEDBACK: Object.freeze({
    LEVEL_0: Object.freeze({
      signal:  'review_text restates the correct answer',
      message: 'This tells students what — but not why. Consider starting with what the student probably believed when they chose the wrong answer.',
    }),
    LEVEL_1: Object.freeze({
      signal:  'review_text explains the fact in context',
      message: 'Good — students understand the context. A further step: what bigger concept does this illustrate?',
    }),
    LEVEL_2: Object.freeze({
      signal:  'review_text connects to a concept',
      message: 'Strong pedagogical feedback. If this question touches other domains, naming that connection could make it memorable.',
    }),
    LEVEL_3: Object.freeze({
      signal:  'review_text invites reflection or shows counter-intuition',
      message: 'This is the gold standard. Students who get this wrong will finish reading better educated than students who got it right.',
    }),
  }),

});

// ─── MISCONCEPTION & CONCEPT TOOLING ─────────────────────────────────────────

export const MISCONCEPTION_TOOLING = Object.freeze({

  PHILOSOPHY: 'Suggestions should feel assistive — not authoritative. The teacher proposes; the vocabulary supports. The teacher always decides.',

  MISCONCEPTION_TAG_INTERFACE: Object.freeze({
    INPUT_MODE:    'Dropdown with named misconception types — teacher selects, never free-types',
    EACH_OPTION_HAS: 'Plain-language label + one-sentence description of the error pattern it names',
    ASSIGNMENT:    'Teacher selects which distractor option the misconception applies to — visual association',
    PREVIEW:       'After selection, show: "Students who choose [option B] likely believe [misconception description]"',
    OVERRIDE:      '"Add custom misconception type" available at bottom of dropdown — for edge cases',
  }),

  CONCEPT_TAG_INTERFACE: Object.freeze({
    INPUT_MODE:    'Tag input with autocomplete from existing concept vocabulary',
    SUGGESTION:    'System suggests concepts based on question text — teacher confirms or dismisses each',
    VISUAL:        'Accepted tags appear as chips with × to remove — lightweight and reversible',
    RELATIONSHIP:  'Optional: teacher can mark one concept as "core" by clicking — changes chip style',
    LIMIT:         'Soft limit of 6 concepts with gentle reminder: "Most effective questions focus on 2–4 core ideas"',
  }),

  COGNITIVE_SKILL_SELECTOR: Object.freeze({
    INPUT_MODE:    'Visual card selector — each cognitive_skill shown as a card with label + example',
    EXAMPLES:      '"recall: Can the student remember a specific fact?" — grounding the taxonomy in practical terms',
    SELECTION:     'Single select — one dominant cognitive skill per question',
    GUIDANCE:      'Tooltip available on each card showing: "Questions like this often fit this level when they require [description]"',
  }),

  SUGGESTIONS_PRINCIPLES: Object.freeze([
    'Suggestions are shown as proposals, not pre-fills — teacher actively accepts or dismisses',
    'Every suggestion can be dismissed permanently for this question without affecting other questions',
    'System never auto-saves a suggestion — teacher action always required',
    'Suggestion confidence is never shown — it creates false authority',
    'If no suggestion makes sense, the teacher writes their own — field is always freely editable',
  ]),

});

// ─── PEDAGOGICAL QA INTERFACE ─────────────────────────────────────────────────

export const QA_INTERFACE = Object.freeze({

  PHILOSOPHY: 'QA should feel like reading a colleague\'s work and thinking "this is good — here\'s one thing I\'d consider." Not: running a content through a checklist machine.',

  REVIEW_MODE_DESIGN: Object.freeze({
    LAYOUT:        'Question shown in student-facing format — review happens in context of actual experience',
    CHECKS:        '5 gentle prompts shown one at a time — never all at once',
    TONE:          'Each prompt is phrased as a question, not a gate: "Is it clear why the correct answer is right?" not "Clarity: FAILED"',
    INTERACTION:   '"Yes, this is clear" / "I want to improve this" — not pass/fail binary',
    RESULT:        'Question marked as reviewed — no score, no rating, no ranking',
    OVERRIDE_FLOW: '"I\'m happy with this as-is" available at any prompt — respect for teacher judgment',
  }),

  FIVE_REVIEW_PROMPTS: Object.freeze([
    '"When a student reads this question, is it immediately clear what\'s being asked?"',
    '"If a student chooses a wrong answer, would they understand something meaningful from the feedback?"',
    '"Do the wrong answers represent real thinking patterns — not just random alternatives?"',
    '"Is the difficulty here conceptual — or just obscure vocabulary or tricky wording?"',
    '"Would you be comfortable if a student felt challenged but not confused or demeaned by this?"',
  ]),

  QA_OUTCOME_STATES: Object.freeze({
    REVIEWED:     'Teacher confirmed the question — shown as a quiet indicator, not a badge',
    IMPROVING:    'Teacher flagged for enrichment — enters enrichment queue with specific prompt',
    UNREVIEWED:   'Default state for new questions — not shown as urgent unless high-traffic',
  }),

  WHAT_QA_NEVER_DOES: Object.freeze([
    'Block a question from reaching students',
    'Show a score or rating',
    'Compare the question to other teacher\'s questions',
    'Require justification for skipping a prompt',
    'Automatically mark a question as failing without teacher review',
  ]),

});

// ─── CONTENT HEALTH VISIBILITY ────────────────────────────────────────────────

export const CONTENT_HEALTH_VISIBILITY = Object.freeze({

  PHILOSOPHY: 'Teachers should be able to see what needs attention — not how much they\'ve done. The difference matters: one creates craftsmanship awareness, the other creates productivity anxiety.',

  HEALTH_VIEW_DESIGN: Object.freeze({
    FOCUS:         'Questions that would benefit from attention — not questions that "failed"',
    SORTING:       'Sorted by educational impact (encounter frequency × enrichment gap) — not by creation date',
    DISPLAY:       'Each question shown with: title excerpt, encounter count, enrichment tier, one specific next-step suggestion',
    EMOTIONAL_TONE: 'Framing is "this question is ready to be enriched" not "this question is incomplete"',
    BATCH_SIZE:    'Default view: 10 questions maximum — prevents overwhelm',
  }),

  VISIBILITY_SIGNALS: Object.freeze({
    HIGH_IMPACT_GAP:    'Question encountered >50× with no review_text — shown prominently with count and specific prompt',
    MISCONCEPTION_MISS: 'Question >60% wrong-answer rate with no misconception_type — shown with distractor context',
    ENRICHMENT_READY:   'Question at Tier 0 with >10 encounters — shown as "ready for first enrichment"',
    HEALTHY_SIGNAL:     'Questions with complete enrichment and healthy wrong-answer rates — shown in a "doing well" section',
  }),

  ANTI_VISIBILITY: Object.freeze([
    'No "% complete" progress bars — they create completion-anxiety',
    'No red/warning color coding for unenriched questions — they are Tier 0, not failures',
    'No comparison to past periods ("you enriched 3 fewer questions this week")',
    'No individual teacher enrichment tracking visible to other teachers',
    'No automatic emails or notifications about enrichment targets',
  ]),

});

// ─── TEACHER TRUST & EDUCATIONAL ETHICS ──────────────────────────────────────

export const TEACHER_TRUST_ETHICS = Object.freeze({

  CORE_COMMITMENT: 'The platform will never use its visibility into teacher authoring behavior to evaluate, rank, or pressure teachers. That data exists to improve the platform — not to manage the people using it.',

  SURVEILLANCE_CONSTRAINTS: Object.freeze([
    'Teacher editing patterns are never shared with school administrators',
    'Enrichment rates are never shown to peers or leadership',
    'Time spent on questions is never tracked or displayed',
    'QA pass/fail history is visible only to the authoring teacher',
    'No "last edited by" attribution on public-facing content — only internal author history',
  ]),

  OVERRIDE_ARCHITECTURE: Object.freeze({
    PRINCIPLE:        'Teacher override is not a workaround. It is a first-class operation.',
    HOW_IT_WORKS:     'Any system suggestion can be overridden with one click — no justification required',
    OVERRIDE_STORAGE: 'Override is stored with a simple flag — visible to the teacher, not surfaced to analytics',
    OVERRIDE_RESPECT: 'Overridden suggestions are not re-suggested for that question unless teacher explicitly resets',
  ]),

  PEDAGOGICAL_AUTHORITY: Object.freeze([
    'The teacher\'s misconception_type choice overrides any system inference',
    'The teacher\'s review_text overrides any system template',
    'The teacher\'s concept tags override any system suggestion',
    'The teacher\'s QA decision ("this is fine as-is") ends the QA loop for that question',
    'Teachers can mark any system suggestion as "not relevant for this question" — permanently',
  ]),

  TRANSPARENCY_COMMITMENTS: Object.freeze({
    ADAPTIVE_LOGIC:     'Every adaptive decision is explainable: "This question appeared because student is in recovery phase with causal_inversion misconception signal"',
    METADATA_EFFECT:    'Teacher can see exactly how their metadata affects question sequencing: "Marking this as difficulty_type=factual means it scores +10 in recovery phase"',
    STUDENT_DATA:       'Student misconception data shown at the aggregate concept level — never at the individual question-attempt level in the teacher\'s daily view',
    QA_REASONING:       'If automatic QA flags a question, the flag explains itself in plain language without jargon',
  }),

});

// ─── FUTURE HUMANE PEDAGOGICAL TOOLING ───────────────────────────────────────

export const FUTURE_HUMANE_TOOLING = Object.freeze({

  GUIDING_QUESTION: 'After three years: is this still a place where teachers feel like craftspeople — or has it become another LMS they endure?',

  ANTI_LMS_PRINCIPLES: Object.freeze([
    'Every new feature is evaluated against: "Does this serve the teacher\'s pedagogical work, or does it serve someone else\'s reporting needs?"',
    'No feature that primarily exists to generate analytics is acceptable',
    'Teacher time in the workspace should decrease over time as enrichment accumulates — not increase',
    'Onboarding a new teacher should feel like introducing them to a craft workspace — not training them on enterprise software',
    'The complexity ceiling is the cognitive load of Layer 3 enrichment — nothing should exceed this',
  ]),

  COLLABORATIVE_CRAFTSMANSHIP_FUTURE: Object.freeze({
    CO_AUTHORING:       'Multiple teachers can enrich the same question — with attribution and change history',
    SHARED_REVIEW_TEXT: 'A teacher whose review_text is particularly effective can share it as a model — others can adapt, not copy',
    CONCEPT_CONSENSUS:  'When multiple teachers tag the same concepts independently, the system notes the agreement — reinforcing taxonomy',
    MISCONCEPTION_LIBRARY: 'Over time, the most reliably predictive misconception types emerge as a shared vocabulary — teachers learn from the pattern',
  }),

  TEACHER_ONBOARDING_EXPERIENCE: Object.freeze({
    DAY_1:    'Write one question at Layer 0. See it reach a student. Feel the connection.',
    WEEK_1:   'Add review_text to the three questions that got the most wrong answers. Read the writing guidance once.',
    MONTH_1:  'Complete a concept tagging pass for your subject area. See how the adaptive sequencing changes.',
    MONTH_3:  'Attempt one full Layer 3 enrichment on your most educationally significant question.',
    PRINCIPLE: 'Onboarding is paced by impact — not by feature coverage.',
  }),

  NORTH_STAR: 'In five years, a teacher who has been using this workspace says: "I understand my students\' misconceptions better than I did before — because the platform helped me think clearly about what they\'re likely to misunderstand." That is the measure of success. Not enrichment rate. Not QA scores. That.',

});

// ─── PRE-SHIP CHECKLIST ───────────────────────────────────────────────────────

export const WORKSPACE_TEST = Object.freeze([
  'Can a teacher complete Layer 0 authoring without seeing any metadata fields?',
  'Is every metadata field accompanied by a plain-language explanation of its pedagogical purpose?',
  'Does the review_text editor show the question and correct answer while writing?',
  'Can a teacher dismiss a layer enrichment prompt without that dismissal being tracked?',
  'Do misconception_type options appear as a dropdown with plain-language descriptions?',
  'Is the content health view sorted by impact × enrichment gap (not creation date)?',
  'Does QA review show one prompt at a time — not all five simultaneously?',
  'Is there no percentage completion bar anywhere in the authoring workspace?',
  'Can a teacher override any system suggestion with one click and no justification?',
  'After completing a question, does the workspace feel like craft — not data entry?',
]);
