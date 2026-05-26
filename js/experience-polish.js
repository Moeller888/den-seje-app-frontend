/**
 * Section 44 — Reference Experience Polish Sprint: Design Contract
 *
 * Stops expanding architecture and begins refining the actual lived
 * educational experience into something elegant, calm, pedagogically
 * meaningful, and genuinely enjoyable to use.
 *
 * The thesis: a system can be architecturally brilliant and still feel
 * exhausting. This pass asks "how does this actually feel to use?"
 */

// ─── REFERENCE FLOW ───────────────────────────────────────────────────────────

export const REFERENCE_FLOW = Object.freeze({

  CHOSEN_FLOW: 'The student review moment + the teacher review_text revision cycle',

  WHY_THIS_FLOW: Object.freeze([
    'The student review moment is where all adaptive and enrichment work becomes visible',
    'The teacher revision cycle is the highest-friction authoring step in the current design',
    'Both happen under cognitive load — student after a wrong answer, teacher after a long day',
    'Polishing these two moments polishes the highest-leverage points in the entire platform',
    'If these feel calm and warm, the platform feels calm and warm',
  ]),

  STUDENT_MOMENT: Object.freeze({
    trigger:     'Student answers incorrectly',
    experience:  'Wrong indicator → review_text appears → student reads → next question',
    duration:    '15–45 seconds of reading and reorientation',
    stakes:      'This is the primary learning moment — not the question, not the answer, but this',
    polish_goal: 'Student should feel: "I understand now" — not "I was punished"',
  }),

  TEACHER_MOMENT: Object.freeze({
    trigger:     'Teacher notices 65% misconception rate on a question',
    experience:  'Opens authoring view → sees current review_text → refines one sentence → saves',
    duration:    '2–5 minutes of craft attention',
    stakes:      'Teacher\'s revision will be read by every subsequent student',
    polish_goal: 'Teacher should feel: "I improved something real" — not "I navigated a form"',
  }),

});

// ─── FRICTION AUDIT ───────────────────────────────────────────────────────────

export const FRICTION_AUDIT = Object.freeze({

  QUESTION: '"What would quietly exhaust someone after 45 minutes?"',

  STUDENT_FRICTION: Object.freeze([
    Object.freeze({
      friction:  'review_text appears at full opacity instantly',
      effect:    'Jarring transition — student has not finished processing the wrong-answer moment',
      fix:       'Fade in over 300ms with a 150ms delay after wrong indicator — give the moment space',
    }),
    Object.freeze({
      friction:  'review_text is a wall of text with no visual hierarchy',
      effect:    'First sentence is the most important; it gets lost in a paragraph',
      fix:       'First sentence in larger weight. Body in reading-optimised size and line-height.',
    }),
    Object.freeze({
      friction:  'Wrong indicator and review_text compete for attention simultaneously',
      effect:    'Student reads neither properly — split visual attention at a critical moment',
      fix:       'Wrong indicator fades out before review_text fully fades in — sequential, not parallel',
    }),
    Object.freeze({
      friction:  'Next question arrives immediately after review_text',
      effect:    'Student has not finished reading before the next question is visible',
      fix:       'Next question loads only after explicit student action ("I understand") or after 8s minimum',
    }),
    Object.freeze({
      friction:  'Every interaction feels the same pace regardless of question difficulty',
      effect:    'After 30 minutes the rhythm becomes monotonous — cognitive flattening',
      fix:       'Deep challenge questions have a slightly longer review pause than recall questions',
    }),
  ]),

  TEACHER_FRICTION: Object.freeze([
    Object.freeze({
      friction:  'All metadata fields visible simultaneously in authoring view',
      effect:    'Teacher sees misconception_type, cognitive_skill, difficulty_type, challenge_role, insight_type all at once — cognitive overload',
      fix:       'Progressive disclosure: Layer 0 fields only by default. Layer 1–3 behind a gentle "enrich further" affordance.',
    }),
    Object.freeze({
      friction:  'review_text editing is a plain textarea with no context',
      effect:    'Teacher cannot see how the text will appear to students while writing',
      fix:       'Side-by-side preview: left = edit, right = student view. Real-time update.',
    }),
    Object.freeze({
      friction:  'No visual signal of enrichment depth progress',
      effect:    'Teacher does not know if their question is Layer 0, 2, or 3 at a glance',
      fix:       'Quiet enrichment depth indicator — a simple horizontal bar, 4 segments, fills as layers complete',
    }),
    Object.freeze({
      friction:  'QA prompts all appear at once in a list',
      effect:    'Five questions simultaneously creates decision fatigue before the teacher begins',
      fix:       'One QA prompt at a time. Answer it. Next appears. Completion is felt as progression.',
    }),
    Object.freeze({
      friction:  'Saving gives no clear confirmation that the revision reached students',
      effect:    'Teacher feels uncertain whether their revision actually affected anything',
      fix:       'Quiet confirmation: "Your revision is live for all students from this moment."',
    }),
  ]),

  SHARED_FRICTION: Object.freeze([
    'Field labels use technical jargon (misconception_type, cognitive_skill) without plain-language help',
    'No natural stopping points — both student and teacher sessions lack graceful exit moments',
    'Visual density is uniform — nothing is quieter than anything else',
    'Error states (wrong answers, save failures) feel abrupt rather than handled gracefully',
  ]),

});

// ─── REVIEW_TEXT POLISH ───────────────────────────────────────────────────────

export const REVIEW_TEXT_POLISH = Object.freeze({

  TYPOGRAPHY: Object.freeze({
    first_sentence_size:  '15px — slightly larger than body, draws the eye first',
    first_sentence_weight: '500 — readable emphasis without heaviness',
    body_size:            '13px',
    body_line_height:     '1.75 — generous breathing room for educational reading',
    body_color:           'var(--text-secondary) — softer than primary; this is context, not command',
    max_line_length:      '65 characters — optimal for reading comfort without eye tracking fatigue',
    paragraph_spacing:    '12px — separates thoughts without visual gaps that fragment flow',
  }),

  TIMING: Object.freeze({
    wrong_indicator_duration:    '600ms — enough to register, not so long it lingers',
    review_text_delay:           '150ms after wrong indicator fades — sequential, not competitive',
    review_text_fade_in:         '300ms ease-in — gentle entrance that matches the reading pace',
    minimum_reading_time:        '8000ms — student must spend at least 8 seconds with review_text',
    next_question_trigger:       'Explicit action ("next") OR 8s minimum + scroll-to-bottom signal',
    deep_challenge_pause:        'Add 1500ms extra minimum reading time for deep_challenge questions',
  }),

  VISUAL_HIERARCHY: Object.freeze({
    structure: Object.freeze([
      'Hook sentence — first, larger, draws attention to the key insight',
      'Explanatory body — standard size, explains the concept',
      'Conceptual link — italicised, connects to adjacent knowledge',
      'Optional reflective hook — smaller, muted — "notice that..." or "watch for this..."',
    ]),
    visual_separator: 'Thin horizontal rule between body and conceptual link — creates reading rhythm',
    icon_optional:    'A subtle concept-tag chip for the primary concept — not required, never intrusive',
  }),

  EMOTIONAL_TONE: Object.freeze([
    'Never starts with "Incorrect" or "Wrong" — the wrong indicator already communicated that',
    'Addresses the student directly: "The Bastille held only 7 prisoners" — not "students often..."',
    'Ends with a sense of expansion, not closure: "watch for this pattern..." opens the next thought',
    'The tone is: a thoughtful person explaining something interesting, not a system delivering feedback',
    'No exclamation marks. No "Great try!" No patronising encouragement.',
  ]),

  ANTI_PATTERNS: Object.freeze([
    '"The correct answer is B." — restates without explaining',
    '"Don\'t worry, this is a common mistake." — patronising',
    'review_text longer than 80 words — reading fatigue sets in',
    'Starting with the wrong answer: "You chose X" — student knows; move forward',
    'Academic register: "The dialectical tension between..." — excludes rather than includes',
  ]),

});

// ─── TEACHER AUTHORING COMFORT ────────────────────────────────────────────────

export const TEACHER_AUTHORING_COMFORT = Object.freeze({

  PHILOSOPHY: 'The authoring experience should feel like sitting down with a craft — not opening a form.',

  FIELD_CLARITY: Object.freeze({
    'concepts':           Object.freeze({ label: 'What is this question about?', example: 'revolution, symbolism', tooltip: 'These tags help the system know when to show this question in a student\'s learning arc.' }),
    'misconception_type': Object.freeze({ label: 'What thinking error does this diagnose?', example: 'causal_inversion', tooltip: 'The most common wrong-thinking pattern this question is designed to catch.' }),
    'review_text':        Object.freeze({ label: 'What should a student understand after getting this wrong?', example: 'Not the answer — the concept.', tooltip: 'This is the most important field. Write for the student who just got it wrong.' }),
    'cognitive_skill':    Object.freeze({ label: 'What kind of thinking does this require?', example: 'evaluation vs. recall', tooltip: 'From simple recall (remembering) to evaluation (judging between competing ideas).' }),
    'challenge_role':     Object.freeze({ label: 'When in a student\'s learning arc should this appear?', example: 'deep_challenge = after the basics are stable', tooltip: 'The system uses this to sequence questions adaptively.' }),
  }),

  VISUAL_BREATHING_ROOM: Object.freeze([
    'Layer 0 form: max 3 fields visible. White space dominates. Nothing feels crowded.',
    'Layer 1 enrichment: fields appear one group at a time with a quiet transition',
    'Layer 2 review_text: full screen writing surface. No surrounding noise.',
    'Layer 3 adaptive metadata: collapsible panel. Collapsed by default for first-time authors.',
    'Between fields: 16px minimum spacing. Never let two input areas touch.',
    'Labels: 12px, muted colour. They guide without competing with the content.',
  ]),

  EDITING_CONFIDENCE: Object.freeze([
    'Auto-save with a quiet indicator: a small dot that goes green — no "Save" button required for drafts',
    'Undo available for all field changes — teacher never feels trapped by an accidental edit',
    'Review_text word count displayed softly: ">80 words may be too long to read comfortably"',
    'Concept autocomplete drawn from existing tags — teacher builds a shared vocabulary naturally',
    'Enrichment depth bar updates as fields are filled — quiet progress without gamification pressure',
    'QA available on demand — never mandatory, never blocking',
  ]),

  GENTLE_GUIDANCE: Object.freeze([
    'First time a teacher opens review_text: a quiet placeholder example at Level 1 — fades when they start typing',
    'First time a teacher sees misconception_type dropdown: a short one-line tooltip with an example',
    'No required fields after Layer 0. Every prompt after is an invitation.',
    'No asterisks. No error messages for missing optional fields.',
    'When a teacher leaves Layer 0 without enriching: "You can always add more later." No urgency.',
  ]),

});

// ─── ADAPTIVE RHYTHM ──────────────────────────────────────────────────────────

export const ADAPTIVE_RHYTHM = Object.freeze({

  PHILOSOPHY: 'The learning rhythm should feel alive and humane — not reactive or mechanical.',

  TIMING_BEATS: Object.freeze({
    question_arrival:       '0ms — immediate; no loading animation for questions already cached',
    answer_feedback:        '200ms after selection — slight delay makes feedback feel considered, not instant',
    wrong_indicator:        '600ms display, then fade over 200ms',
    review_text_entrance:   '150ms delay after wrong indicator fades, then 300ms fade-in',
    minimum_review_time:    '8000ms for standard questions, 9500ms for deep_challenge',
    next_question_load:     'Only on explicit action or after minimum time + scroll signal',
    between_questions:      '400ms crossfade — questions should not snap; they should arrive',
    wave_phase_transition:  'Silent — no UI announcement; the change is felt in question character',
  }),

  PACING_PHILOSOPHY: Object.freeze([
    'A correct answer on a recall question: fast and satisfying — the student earned momentum',
    'A correct answer on a deep_challenge question: a beat longer — recognise the difficulty',
    'An incorrect answer: deliberately slower — this is the learning moment, not a setback to rush past',
    'Reinforcement phase: questions feel slightly more accessible — this is recovery, not punishment',
    'Recovery phase: questions are noticeably calmer — the system is generous after sustained struggle',
    'Long session (>30 questions): gradually reduce challenge intensity without announcing it',
  ]),

  INTERRUPTION_RULES: Object.freeze([
    'Never show a notification during review_text reading time',
    'Never show a loading state if content loads in under 600ms — flash of loading is worse than waiting',
    'Never animate two things simultaneously in the student view — visual competition fractures focus',
    'Challenge-wave changes: invisible to the student. No "difficulty adjusted" messages.',
    'Session milestones (XP, streaks): displayed after next question loads — never during review',
  ]),

  RECOVERY_CADENCE: Object.freeze({
    trigger:           '2+ incorrect answers in a row on deep_challenge or challenge phase questions',
    initial_response:  'Next question is reinforcement — same concept, lower cognitive demand',
    duration:          '2–3 reinforcement questions before returning to challenge phase',
    return_signal:     '2 consecutive correct reinforcement answers — quiet return to challenge',
    teacher_visibility: 'Aggregate recovery frequency visible in teacher inspection — not per-student',
  }),

});

// ─── VISUAL & COGNITIVE SIMPLICITY ───────────────────────────────────────────

export const VISUAL_COGNITIVE_SIMPLICITY = Object.freeze({

  DENSITY_REDUCTION: Object.freeze([
    'One focal point per screen state — question, or answer feedback, or review_text — never all three',
    'Remove all UI chrome not needed for the current action: when reading review_text, everything else fades',
    'Answer options: max 4, never 5. Fifth option is always cognitive overload.',
    'Progress indicators: present but peripheral — a quiet bar, never a counter in the primary view',
    'XP/coin updates: a brief toast after the next question — never during the learning moment',
  ]),

  PROGRESSIVE_DISCLOSURE: Object.freeze({
    student_view: Object.freeze([
      'Question text and options only — no metadata, no concept tags, no difficulty label',
      'After answer: feedback indicator only — review_text appears after a beat',
      'After review_text: a single action ("next") — no session stats, no streak counter during flow',
    ]),
    teacher_authoring_view: Object.freeze([
      'Layer 0: question, correct answer, 3 options — nothing else visible',
      'Layer 1 trigger: a quiet "add more context" affordance — not a tab, not a form section',
      'Layer 2 trigger: "write the review" — appears only after Layer 1 is complete',
      'Layer 3 trigger: "position in learning arc" — appears only after Layer 2 is complete',
    ]),
  }),

  FOCUS_SURFACES: Object.freeze({
    student_reading:  'During review_text: question stem fades to 40% opacity — review_text is the focus',
    teacher_writing:  'During review_text editing: all metadata fields collapse — writing surface expands',
    qa_prompting:     'During QA: only the current prompt visible — all others hidden until answered',
  }),

  EMOTIONAL_CALMNESS: Object.freeze([
    'Colour: desaturated during reading moments — high saturation is for action moments',
    'Motion: all transitions ease-in-out — nothing bounces, nothing springs',
    'Sound: none by default — audio is opt-in for students who want it',
    'Density: generous line-height everywhere. Text should breathe.',
    'Error states: never red warnings. Incorrect answers: a gentle amber or muted colour.',
    'Success states: brief and understated — a quiet green, not a celebration animation',
  ]),

});

// ─── LONG-SESSION SUSTAINABILITY ─────────────────────────────────────────────

export const LONG_SESSION_SUSTAINABILITY = Object.freeze({

  FATIGUE_PATTERNS: Object.freeze({
    'minutes 0–15':  'Fresh — rhythm feels good, questions feel interesting',
    'minutes 15–30': 'Engaged — some fatigue beginning; review_text should be consistently readable',
    'minutes 30–45': 'Tiring — without variety, cognitive flattening sets in; challenge must modulate',
    'minutes 45–60': 'Fatigued — review_text overload becomes real; longer texts feel punishing',
    'beyond 60':     'Should not be designed for — platform should gently encourage a break',
  ]),

  ANTI_FATIGUE_MECHANISMS: Object.freeze([
    'Wave phase naturally varies challenge — prevents monotony without visible intervention',
    'review_text at Level 1 is acceptable fatigue-relief: short, clear, non-demanding',
    'Not all questions need Level 3 review_text — a session of mixed depths is healthier than 60 Level 3s',
    'Concept variety: the system should not serve 10 consecutive "revolution" questions',
    'After 20 questions: quiet prompt to take a break — not a hard stop, not a nag. A gentle suggestion.',
  ]),

  NATURAL_STOPPING_MOMENTS: Object.freeze([
    'After a correct answer on a challenge question: a natural moment to pause and feel satisfied',
    'After a concept transitions from emerging → developing: a quiet acknowledgement — "You\'re building something here"',
    'After 25 questions: a soft "good session" signal — encourages completing at a natural endpoint',
    'Session summary only shows what advanced — not what was wrong, not a score',
  ]),

  REVIEW_TEXT_DOSE: Object.freeze({
    max_review_per_session:   'Maximum 8 full Level 3 review_texts per 45-minute session',
    recovery_mode_review:     'Reinforcement phase questions can have shorter review_text — 1–2 sentences',
    review_text_fatigue_sign: 'If student spends less than 4s on review_text after minute 40, system notes this — not punished, just observed',
  }),

});

// ─── EMPATHY PERSPECTIVES ─────────────────────────────────────────────────────

export const EMPATHY_PERSPECTIVES = Object.freeze({

  TIRED_TEACHER: Object.freeze({
    who:          'A secondary school teacher. 5pm after a full teaching day. Opens the platform to review one question.',
    internal:     '"I have 20 minutes. I just want to make this review_text better and leave."',
    design_need:  'Gets straight to the editing surface. No dashboard. No loading sequence. One question, one field, one save.',
    fail_state:   'Spends 10 minutes navigating to the right question, then runs out of time.',
    success_state: 'Edits one review_text in 3 minutes. Saves. Sees "your revision is live." Feels effective.',
  }),

  TIRED_STUDENT: Object.freeze({
    who:          'A 14-year-old. After school at 4pm. Slightly resistant. Doing this because they agreed to.',
    internal:     '"I\'ll do 10 minutes. If it\'s boring I\'ll stop."',
    design_need:  'Questions should feel interesting — not like homework. review_text should feel like a discovery, not a correction.',
    fail_state:   'Third wrong answer in a row with dense review_texts. Closes the app.',
    success_state: 'Gets a question wrong, reads review_text ("only 7 prisoners — I never knew that"), feels genuinely curious.',
  }),

  CURIOUS_STUDENT: Object.freeze({
    who:          'A student who genuinely enjoys learning. 45 minutes in, still going.',
    internal:     '"I want to know more about this concept."',
    design_need:  'The conceptual link at the end of review_text opens new directions. concept_state reaching stable feels like real progress.',
    fail_state:   'Platform does not grow with them — same pace regardless of their engagement.',
    success_state: '"watch for this pattern in other revolutions" → student is now thinking beyond the question.',
  }),

  HESITANT_TEACHER: Object.freeze({
    who:          'A teacher who is not comfortable with technology. First time opening the authoring workspace.',
    internal:     '"I don\'t want to break anything."',
    design_need:  'Layer 0 is so simple it cannot be wrong. Every other layer is clearly optional.',
    fail_state:   'Sees misconception_type, cognitive_skill, challenge_role all at once. Closes the tab.',
    success_state: 'Creates a question, saves it, sees it described as "ready to use". Feels capable.',
  }),

  REFLECTIVE_LEARNER: Object.freeze({
    who:          'A student who pauses before answering. Takes review_text seriously.',
    internal:     '"Wait, I thought I understood this. Let me read this again."',
    design_need:  'review_text is always available to re-read. No time pressure to dismiss it.',
    fail_state:   'review_text disappears before they finish reading. Next question is already loading.',
    success_state: 'Student re-reads the review, feels the concept settle. Moves forward with genuine understanding.',
  ]),

});

// ─── FUTURE QUALITY THINKING ──────────────────────────────────────────────────

export const FUTURE_QUALITY_THINKING = Object.freeze({

  PROTECTING_IDENTITY: Object.freeze([
    'Every new feature must be evaluated against: "Does this make the experience calmer or noisier?"',
    'Dashboard requests are always "add more" — the default answer is restraint',
    'The platform should feel lighter after a year of use, not heavier',
    'New metadata fields: only if they create a noticeably better student or teacher experience',
    'Analytics must serve teachers\' reflection — not administrators\' reporting',
  ]),

  DASHBOARD_CREEP_PREVENTION: Object.freeze([
    'No feature should survive the question: "Who experiences this as calmer and warmer?"',
    'Aggregate metrics for teachers: maximum 3 per question view',
    'Student-facing information during a session: maximum 2 persistent elements (XP bar, question counter)',
    'Every added element must remove something else — net information density stays flat',
  ]),

  SIMPLICITY_AS_CRAFT: Object.freeze([
    'Removing a poorly-timed animation is craftsmanship',
    'Reducing review_text from 90 words to 55 is craftsmanship',
    'Making one metadata label clearer is craftsmanship',
    'Simplicity in an educational platform is not a compromise — it is the product',
  ]),

  YEARS_OF_USE: Object.freeze({
    'year 1': 'Platform feels fresh and responsive — novelty carries some friction',
    'year 2': 'Platform feels familiar — friction that was tolerated becomes obvious',
    'year 3': 'Platform must feel calm and invisible — friction causes abandonment',
    'design implication': 'Build year-3 experience quality into year-1 decisions',
  }),

  NORTH_STAR: 'The platform should feel, after years of use, like a trusted colleague — not like software you have to remember how to use.',

});

// ─── EXPERIENCE POLISH TEST ───────────────────────────────────────────────────

export const EXPERIENCE_POLISH_TEST = Object.freeze([
  'Does review_text fade in after the wrong indicator has faded out — never simultaneously?',
  'Is the first sentence of review_text visually distinct from the body?',
  'Can a student always re-read review_text before moving to the next question?',
  'Does the teacher authoring view show only Layer 0 fields on first open?',
  'Does a 45-minute student session feel varied in pace, not monotonous?',
  'Can a tired teacher edit a review_text in under 4 minutes from a cold start?',
  'Are there natural stopping points in both student and teacher sessions?',
  'Does nothing in the student view animate simultaneously with review_text?',
  'Do all metadata field labels use plain language, not technical jargon?',
  'After a year of use, does the platform feel calmer or noisier than on day one?',
]);
