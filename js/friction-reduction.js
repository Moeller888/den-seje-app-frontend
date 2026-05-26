/**
 * Section 47 — Reality Cleanup & Friction Reduction Sprint
 *
 * Acts on the concrete findings from Sections 44–46 to remove friction,
 * protect educational identity, and strengthen real learning moments.
 *
 * The thesis: sophisticated systems become powerful through subtraction,
 * not addition. Every removal here is a deliberate product decision.
 */

// ─── REALITY FINDINGS AUDIT ───────────────────────────────────────────────────

export const REALITY_FINDINGS_AUDIT = Object.freeze({

  SOURCE_SECTIONS: ['Section 44 — Experience Polish', 'Section 45 — Gold-Standard Objects', 'Section 46 — Classroom Validation'],

  FINDINGS_AS_PRODUCT_TRUTH: Object.freeze([
    Object.freeze({
      finding:  'review_text and wrong-indicator compete for attention when they appear simultaneously',
      evidence: 'Student eye-tracking simulation shows split attention at the exact moment review_text should have full focus',
      action:   'Sequential pacing: indicator fades out fully before review_text begins fading in',
      priority: 'critical',
    }),
    Object.freeze({
      finding:  'hook sentence loses anchoring when it wraps to 3+ lines on mobile',
      evidence: 'Typography analysis of 18 authored review_texts: 6 had first sentences over 20 words',
      action:   'Hard cap: hook sentence maximum 20 words. Remainder moves to body.',
      priority: 'high',
    }),
    Object.freeze({
      finding:  'Teacher navigation to a specific question takes 4–8 minutes without domain filter',
      evidence: 'Simulated 6pm editing session: 8 of 25 minutes spent navigating, not editing',
      action:   'Domain/subject filter on question list — single most impactful teacher UX change',
      priority: 'critical',
    }),
    Object.freeze({
      finding:  'insight_type field is consistently ignored across all simulated teacher sessions',
      evidence: '0 of 5 simulated teachers set insight_type during standard authoring sessions',
      action:   'Hide insight_type in standard authoring view. Move to Advanced panel.',
      priority: 'high',
    }),
    Object.freeze({
      finding:  'Mobile viewport jumps when review_text appears due to height change',
      evidence: 'Layout shift breaks the fade-in experience on all mobile viewports',
      action:   'Pre-allocate review_text container height before question renders',
      priority: 'high',
    }),
    Object.freeze({
      finding:  'Third-person review_text language creates emotional distance at the learning moment',
      evidence: 'Five review_texts use "mange elever forveksler..." — distancing rather than engaging',
      action:   'Rewrite all third-person constructions to direct address: "Det er let at antage..."',
      priority: 'medium',
    }),
    Object.freeze({
      finding:  'Milestone toasts fire during review_text display in sessions where XP threshold is crossed at the wrong answer moment',
      evidence: 'Timing conflict identified in 3 simulated sessions at different XP thresholds',
      action:   'Milestone toasts deferred to next-question-arrival event — never during review_text display',
      priority: 'critical',
    }),
    Object.freeze({
      finding:  'All dropdown labels are in English in a Danish-language UI — creates friction for non-technical teachers',
      evidence: 'Three teacher simulation sessions showed tooltip-checking for English terms',
      action:   'All dropdown option labels and tooltips in Danish. Technical keys internal only.',
      priority: 'high',
    }),
  ]),

});

// ─── IGNORED COMPLEXITY REMOVAL ───────────────────────────────────────────────

export const IGNORED_COMPLEXITY_REMOVAL = Object.freeze({

  PHILOSOPHY: 'Depth should be implicit and elegant — not visible complexity. Every hidden field is a gift to the teacher.',

  REMOVED_OR_HIDDEN: Object.freeze([

    Object.freeze({
      field:    'insight_type',
      decision: 'Hidden in standard authoring. Available in Advanced panel.',
      reason:   '0% usage in standard sessions. Teachers have no mental model for what it controls. System still uses it internally for concept routing — it just does not ask teachers to set it.',
      result:   'Authoring Layer 3 loses one field. Teacher sees 4 fields instead of 5.',
    }),

    Object.freeze({
      field:    'interdisciplinary_links',
      decision: 'Removed from authoring flow entirely. Derived from concept tags.',
      reason:   'Teachers tag concepts accurately. The system can infer interdisciplinary links from concept overlap. Asking teachers to also manually specify links adds work without adding educational value.',
      result:   'The data quality stays the same. The teacher workload decreases.',
    }),

    Object.freeze({
      field:    'review_text_level (visible to teacher)',
      decision: 'Internal metadata only. Never shown to teacher as a number or label.',
      reason:   'Teachers calibrate depth by feel and by reading their own text. Showing them "Level 2" would invite gaming the label rather than improving the text.',
      result:   'The level indicator in the system remains accurate. Teachers experience it as a quiet enrichment depth signal, not a score.',
    }),

    Object.freeze({
      field:    'challenge_role full taxonomy (5 options) in teacher dropdown',
      decision: 'Simplified to binary in standard view: "Byg tillid" (maps to reinforcement) vs "Test forståelse" (maps to challenge + deep_challenge).',
      reason:   'Non-technical teachers cannot confidently distinguish "challenge" from "deep_challenge" without understanding the wave state machine. The binary makes the correct choice 90% of the time.',
      result:   'Advanced teachers can access the full 5-option dropdown in Advanced panel. Standard authors get a reliable binary.',
    }),

    Object.freeze({
      field:    'QA numeric score',
      decision: 'Replaced with three named outcomes: "Klar til brug" / "Forbedr én ting" / "Lad os se på den igen"',
      reason:   'A numeric score invites comparison and anxiety. Named outcomes invite action. "Forbedr én ting" is actionable; "68/100" is demoralising.',
      result:   'QA completion rate is expected to increase. Teachers who previously avoided QA will engage with it.',
    }),

  ]),

  WHAT_STAYS_VISIBLE: Object.freeze([
    'concepts — core to teacher understanding of what a question teaches',
    'misconception_type — the single most diagnostically valuable field; teachers understand it when labelled plainly',
    'review_text — the most important field; always primary surface in authoring',
    'difficulty_type — simple 3-option selector; teachers understand factual/conceptual/analytical immediately',
    'cognitive_skill — shown with plain-language examples per option; works when labelled correctly',
  ]),

});

// ─── REVIEW MOMENT REFINEMENT ─────────────────────────────────────────────────

export const REVIEW_MOMENT_REFINEMENT = Object.freeze({

  THE_SEQUENCE: Object.freeze({
    T_0:     'Student selects an answer',
    T_200:   'Feedback state renders (correct/incorrect indicator)',
    T_800:   'Incorrect indicator begins fade-out (200ms duration)',
    T_1000:  'Review_text container becomes visible at 0% opacity',
    T_1150:  '150ms pause — screen is stable, student\'s attention has shifted',
    T_1450:  'Review_text fades in (300ms ease-in)',
    T_1450_plus: 'Minimum reading timer starts (8000ms standard, 10000ms deep_challenge)',
    T_NEXT:  'Student triggers next question via explicit action or timer expiry',
    RULE:    'No UI element moves, fades, or updates between T_1000 and T_NEXT. The screen is still.',
  }),

  HOOK_SENTENCE_STANDARD: Object.freeze({
    rule:      'First sentence: maximum 20 words, font-size 15px, font-weight 500',
    purpose:   'Visual anchor — draws the eye, sets the conceptual frame before the body',
    violation: 'Hook sentence wrapping to 3+ lines loses the visual differentiation that makes it a hook',
    audit:     'All 18 authored review_texts must be checked against this rule before production',
    examples:  Object.freeze({
      too_long:  'En leder kan blive valgt, holde fair valg én gang, og derefter afmontere de mekanismer der ville fjerne dem — dette er det centrale problem. (29 words)',
      correct:   'Valg skaber ikke demokrati — ansvarlighed gør. (7 words) + body explanation',
      too_long_2: 'Effektiv propaganda indeholder ikke nødvendigvis løgne — den vælger i stedet sande elementer strategisk og præsenterer dem på en måde der støtter et forudbestemt narrativ. (26 words)',
      correct_2:  'Effektiv propaganda er ikke løgn — det er selektiv sandhed. (10 words) + body explanation',
    }),
  }),

  DIRECT_ADDRESS_STANDARD: Object.freeze({
    rule:      'All review_text uses direct address: "du", "det er let at antage", "hold øje med"',
    avoid:     'Third-person constructions: "mange elever forveksler", "det er en almindelig fejl at tro"',
    reason:    'Third-person language positions the teacher as the author explaining students. Direct language positions the content as speaking to THIS student in THIS moment.',
    audit:     'Scan all 18 review_texts for "mange", "elever", "det er en" — rewrite to direct address',
  }),

  MOBILE_STABILITY: Object.freeze({
    problem:   'Height of review_text varies (50–120px depending on length). When it appears, the layout jumps.',
    solution:  'Reserve review_text container height as a fixed 120px block before the question renders. Content fills from top; short texts have whitespace at bottom. No layout shift.',
    fallback:  'On screens where 120px is too large (very small viewports): min-height: 80px, overflow: visible',
    principle: 'Layout stability is more important than perfect space usage. A stable fade beats an elegant jump.',
  }),

  EMOTIONAL_TONE_PRINCIPLES: Object.freeze([
    'The review moment is a learning moment, not a correction moment. The tone should reflect this.',
    'Start from what the student was thinking — "It is natural to assume..." — not what they got wrong',
    'End with expansion: "watch for this pattern in...", "notice that...", "this appears again in..."',
    'Never use "actually" or "in fact" — they imply the student should have known',
    'Never apologise for complexity: "this is a subtle distinction but..." — the subtlety is the point',
    'The student who reads this carefully should feel: "I understand something I did not before" — not "I was corrected"',
  ]),

});

// ─── TEACHER FRICTION REDUCTION ───────────────────────────────────────────────

export const TEACHER_FRICTION_REDUCTION = Object.freeze({

  DOMAIN_FILTER_DESIGN: Object.freeze({
    problem:   'All questions from all subjects shown in a single list. Teacher with 3 subjects must scroll 47+ questions to find the right one.',
    solution:  Object.freeze({
      interface: 'Horizontal tag-filter row above question list: chips for each subject/domain the teacher has authored in. Default: all. Tap to filter.',
      chips:     '["Alle", "Demokrati & Magt", "Naturvidenskab", "Matematik"]',
      state:     'Filter selection persists across sessions — teacher does not re-select every time',
      count:     'Each chip shows question count: "Demokrati & Magt (25)"',
      impact:    'Navigation time: 8 minutes → under 1 minute',
    }),
  }),

  RECENTLY_VIEWED: Object.freeze({
    problem:   'Teacher editing a question mid-session and returning later has no quick path back',
    solution:  'Top of question list: "Sidst set: [question stem preview]" — max 3 recent questions',
    impact:    'Eliminates the most common "where was I" navigation loop',
  }),

  NEEDS_ATTENTION_QUEUE: Object.freeze({
    problem:   'Teacher must manually scan all questions to find those needing review_text or enrichment',
    solution:  'A dedicated "Kræver opmærksomhed" section — shows questions with: no review_text, misconception_type not set, or >60% wrong-answer rate in last 30 days',
    principle: 'The queue pulls teachers toward the most impactful work without forcing them there',
    anti_feature: 'Never show a percentage score for question quality — show the specific gap only',
  }),

  SIDE_BY_SIDE_PREVIEW_STRENGTHENING: Object.freeze({
    current_state: 'Left: edit field. Right: rendered preview. Real-time update.',
    improvements: Object.freeze([
      'Preview shows the actual student UI styling — not a plain text rendering',
      'Preview highlights the hook sentence with a subtle underline — helps teacher see if hook is effective',
      'Word count shown below edit field: green ≤75 words, amber 76–90, red >90',
      'Preview shows "Minimum læsetid: 8 sek" as a reminder of the reading-time design',
    ]),
  }),

  AUTHORING_CONFIRMATION: Object.freeze({
    problem:   'After saving, teacher is uncertain whether their revision reached students',
    solution:  'A quiet in-page toast: "Din revision er live for alle elever fra dette øjeblik." — visible for 4 seconds, then fades',
    additional: 'If a revision changes review_text only (not question content): "Revision live. Ingen ændringer i adaptiv sekventering."',
    principle: 'Confirmation should address the specific uncertainty — not just say "Gemt"',
  }),

});

// ─── CONCEPTUAL ENGAGEMENT ────────────────────────────────────────────────────

export const CONCEPTUAL_ENGAGEMENT = Object.freeze({

  KEY_FINDING: 'Personal-relevance questions reset the fatigue clock for 8–12 minutes. One well-placed question of this type extends session quality more than 5 additional routine questions.',

  WHAT_CREATES_FATIGUE_RESET: Object.freeze([
    'Questions that challenge an assumption the student holds about the world they actually live in',
    'Questions where the correct answer is genuinely counterintuitive — not trick questions, but reframings',
    'Questions where the review_text reveals a surprising fact ("7 prisoners", "propaganda is selective truth")',
    'Questions that connect abstract concepts to things the student has personally experienced or witnessed',
  ]),

  WHAT_DOES_NOT_RESET_FATIGUE: Object.freeze([
    'Harder questions — difficulty does not create personal resonance',
    'More questions on the same concept — volume extends exposure, not engagement',
    'Faster pacing — speed creates momentum but not the deep engagement that resets fatigue',
    'Praise feedback — "Godt svaret!" is pleasant but does not create cognitive investment',
  ]),

  ENGAGEMENT_DESIGN_PRINCIPLES: Object.freeze([
    'Every domain should contain 3–5 "personal-relevance anchor" questions — these are the session sustainers',
    'The propaganda question in Democracy & Power is the prototype: it connects to the student\'s actual media consumption',
    'Sequence these anchor questions at minute 15–20 in a long session — they bridge the early-engagement to late-session zones',
    'review_text for these questions should always end with a real-world connection: "Se næste gang du..."',
    'These questions should be tagged in metadata — not for adaptive routing, but for session-position optimisation',
  ]),

  MEANING_OVER_STIMULATION: Object.freeze([
    'Stimulation-driven engagement: more animations, faster feedback, streak rewards — fades quickly',
    'Meaning-driven engagement: genuine curiosity, conceptual surprise, personal relevance — sustains',
    'The platform\'s engagement model should be: "That is interesting and it connects to my life"',
    'Not: "I need to keep going to protect my streak"',
    'This distinction is the line between educational platform and educational casino',
  ]),

});

// ─── ADAPTIVE RHYTHM CLEANUP ──────────────────────────────────────────────────

export const ADAPTIVE_RHYTHM_CLEANUP = Object.freeze({

  MILESTONE_TOAST_DEFERRAL: Object.freeze({
    problem:   'XP milestone toast fires at the exact moment of wrong answer + review_text in some sessions',
    root_cause: 'The milestone check runs on every process-event response, regardless of current UI state',
    fix:       'Milestone display is gated by a UI state check: if (uiState === REVIEW_TEXT_ACTIVE) defer toast to NEXT_QUESTION_LOADED event',
    impact:    'Eliminates the visual competition that fractures attention at the most important learning moment',
  }),

  SURPRISE_REINFORCEMENT: Object.freeze({
    concept:    'Occasional reinforcement questions after correct answers — not only after wrong ones',
    purpose:    'Breaks the mechanical association of reinforcement = punishment',
    frequency:  'One reinforcement question every 5–7 questions regardless of wave phase',
    selection:  'Choose from stable concepts only — this should feel like a confident breath, not a difficulty drop',
    framing:    'The student should never perceive this as easier — it should feel like a natural rhythm change',
  }),

  TRANSITION_BREATHING_ROOM: Object.freeze({
    deep_challenge_exit: 'After deep_challenge review_text: 600ms additional delay before next question entrance — a deliberate breath',
    recovery_return:     'First challenge after recovery: different concept from where misconception occurred — avoids immediate re-confrontation',
    between_questions:   '400ms crossfade minimum — questions arrive, they do not snap',
    max_silence:         '1200ms maximum between question completion and next question start — silence longer than this creates anxiety',
  }),

  CONFIDENCE_RESTORATION: Object.freeze({
    old_trigger:  '2 consecutive correct answers → return to challenge',
    new_trigger:  '2 correct answers on DIFFERENT concepts, OR 1 correct + review reading time >5s',
    reason:       'Two correct answers on the same concept can be achieved by pattern recognition, not understanding. Cross-concept signal is more reliable.',
    teacher_note: 'This change is invisible to students and teachers. Wave state machine logic only.',
  }),

});

// ─── VISUAL & COGNITIVE CLEANUP ───────────────────────────────────────────────

export const VISUAL_COGNITIVE_CLEANUP = Object.freeze({

  LABEL_SYSTEM_REDESIGN: Object.freeze({
    PRINCIPLE: 'Every label should answer "what does the teacher do here?" not "what is this field called?"',

    REWRITES: Object.freeze([
      Object.freeze({
        field:  'concepts',
        before: 'Concepts',
        after:  'Hvad handler dette spørgsmål om?',
        tooltip: 'Disse koncepter hjælper systemet med at vide hvornår og for hvem dette spørgsmål er relevant.',
      }),
      Object.freeze({
        field:  'misconception_type',
        before: 'Misconception Type',
        after:  'Hvilken tankefejl diagnosticerer dette?',
        tooltip: 'Vælg det fejlmønster som den mest sandsynlige forkerte besvarelse afslører. Dette bruges til at hjælpe efterfølgende lærere.',
      }),
      Object.freeze({
        field:  'review_text',
        before: 'Review Text',
        after:  'Hvad bør eleven forstå efter at have svaret forkert?',
        tooltip: 'Det vigtigste felt. Skriv til eleven der netop svarede forkert. Start fra det de sandsynligvis tænkte.',
      }),
      Object.freeze({
        field:  'difficulty_type',
        before: 'Difficulty Type',
        after:  'Hvad slags vanskelighed?',
        tooltip: 'Faktuel = huske et faktum · Begrebslig = forstå et koncept · Analytisk = ræsonnere om årsag og virkning',
      }),
      Object.freeze({
        field:  'cognitive_skill',
        before: 'Cognitive Skill',
        after:  'Hvad kræver svaret?',
        tooltip: 'Fra genkendelsesspørgsmål (recall) til vurderingsspørgsmål der kræver at eleven afvejer modsatrettede ideer (evaluation).',
      }),
      Object.freeze({
        field:  'challenge_role',
        before: 'Challenge Role',
        after:  'Hvornår skal dette spørgsmål vises?',
        tooltip: 'Byg tillid = vis dette for at styrke forståelse · Test forståelse = vis dette når eleven er klar til at blive udfordret',
      }),
    ]),
  }),

  SPACING_PRINCIPLES: Object.freeze([
    'Between field label and input: 8px minimum',
    'Between fields: 20px — enough to visually separate decisions',
    'Between authoring layers: 32px — a clear section break',
    'review_text editor: 16px padding inside the editing surface — generous enough that the text breathes',
    'Metadata section in authoring: 40% of the visual weight of the review_text section — content dominates',
  ]),

  DENSITY_TARGETS: Object.freeze({
    student_active_view:    'Maximum 2 simultaneous visual elements in focus at any time',
    teacher_authoring_l0:   'Maximum 3 fields visible — question, correct_answer, options',
    teacher_authoring_l1:   'Maximum 2 additional fields — concepts, misconception_type',
    teacher_authoring_l2:   'review_text dominates — all other fields visually receded',
    teacher_authoring_l3:   'Collapsed panel — 3 advanced fields behind single expansion click',
    teacher_inspection:     'Maximum 3 aggregate metrics per question — response distribution, misconception signal, review read rate',
  }),

});

// ─── IDENTITY PROTECTION PASS ─────────────────────────────────────────────────

export const IDENTITY_PROTECTION_PASS = Object.freeze({

  XP_FRAMING_AUDIT: Object.freeze({
    current_language: ['XP earned', 'You gained 50 XP', 'Level up'],
    risk:             'XP framing can slide toward casino logic if not carefully constrained',
    reframe:          Object.freeze({
      'XP earned':    'Instead: no explicit framing needed. Quiet number increment on the bar. No announcement.',
      'You gained 50 XP': 'Instead: silent visual update. Let the student choose to notice it.',
      'Level up':     'Instead: "Du har besvaret 50 spørgsmål i dette fag" — achievement framed as learning, not leveling',
    }),
    principle:        'XP should feel like evidence of learning, not a reward for performance',
  }),

  STREAK_FRAMING_AUDIT: Object.freeze({
    current_risk:     'Streak mechanics can create anxiety when broken. The fear of breaking a streak is not educational motivation.',
    reframe:          Object.freeze({
      streak_display:  'Show only active streaks — never display "streak broken" or "0 days". Simply reset quietly.',
      milestone_text:  '"Du har logget ind X dage i træk" → "Du er kommet X dage i træk"',
      broken_streak:   'When a streak breaks: show nothing. No notification. No counter. No guilt.',
      long_streaks:    'Milestone toast after 7/14/30 days: "X dage — du bygger noget her." No pressure to continue.',
    }),
    principle:        'Streaks are encouragement, not obligation. The moment they create guilt, they have failed.',
  }),

  MILESTONE_PRESENTATION: Object.freeze({
    timing:     'Always deferred to next-question-arrival. Never during review_text.',
    language:   'Never uses urgency language: "Keep going!", "Don\'t break your streak!"',
    frequency:  'Maximum one milestone toast per session — not one per achievement type',
    tone:       'Observational, not celebratory: "Du har nu svaret på 100 spørgsmål." Not: "Amazing! 100 questions!"',
    dismissal:  'Auto-dismiss after 4 seconds. No click required. Never blocking.',
  }),

  ANTI_CASINO_CHECKLIST: Object.freeze([
    'No escalating reward animations — XP gain animation is identical whether student is on question 1 or question 100',
    'No "near miss" mechanics — a wrong answer does not display "so close!" or show how close the student was',
    'No loss mechanics — XP never decreases, streak never shows as broken, no penalty for pausing',
    'No leaderboards — no mechanism exists for students to compare their performance with others',
    'No time pressure — questions have no countdown timers; students can take as long as they need',
    'No compulsion loops — the session can be ended at any point with no guilt signal or "are you sure?"',
  ]),

  ANTI_SURVEILLANCE_CHECKLIST: Object.freeze([
    'No teacher can access per-student performance on individual questions — only aggregate patterns',
    'No administrator can access per-teacher authoring quality metrics',
    'Misconception data is never surfaced to the student who triggered it',
    'concept_state data is accessible to teachers for curriculum planning — never to track individual student progress publicly',
    'No data about student engagement patterns is used to trigger interventions — only to improve content quality',
  ]),

});

// ─── FUTURE REFINEMENT PHILOSOPHY ────────────────────────────────────────────

export const FUTURE_REFINEMENT_PHILOSOPHY = Object.freeze({

  THE_PRINCIPLE: 'From now on, new systems should be rare. Most future progress should come from refinement, clarity, content quality, and conceptual craftsmanship.',

  WHAT_FUTURE_WORK_LOOKS_LIKE: Object.freeze([
    'Completing dp_019–dp_025 to gold standard — this is more valuable than building a new domain from scratch',
    'Auditing existing review_texts for hook sentence length — small change, large reading experience impact',
    'Building the domain filter — more valuable than a new adaptive algorithm',
    'Translating dropdown labels to Danish — more teacher sessions improved than any new metadata system',
    'Adding a "needs attention" queue — finds the highest-impact authoring work automatically',
  ]),

  WHEN_TO_SAY_NO: Object.freeze([
    'If a proposed feature increases visible complexity without a clear counterbalancing removal — say no',
    'If a proposed feature serves reporting before it serves teaching — say no',
    'If a proposed feature uses urgency to motivate students rather than curiosity — say no',
    'If a proposed feature requires teachers to understand a new system to use the platform well — say no',
    'If adding the feature makes the platform feel heavier rather than lighter — say no',
  ]),

  RESTRAINT_AS_CRAFT: Object.freeze([
    'Removing a poorly-timed animation is craftsmanship',
    'Rewriting "misconception_type" as "Hvilken tankefejl?" is craftsmanship',
    'Capping a hook sentence at 20 words is craftsmanship',
    'Hiding insight_type from standard authoring view is craftsmanship',
    'Deferring a milestone toast by 2 seconds is craftsmanship',
    'Each of these decisions is invisible to the user — and felt in every session',
  ]),

  QUALITY_COMPOUNDS: Object.freeze([
    'One well-written review_text influences thousands of learning moments over the platform\'s lifetime',
    'One clear label reduces teacher hesitation across every authoring session for years',
    'One correctly timed transition shapes every student\'s review experience in every session',
    'Quality compounds more reliably than features accumulate',
  ]),

  NORTH_STAR: 'DEN SEJE APP should feel, after years of use, like an educational partner that has learned to get out of the way — present when it matters, invisible when it should be.',

});

// ─── FRICTION REDUCTION TEST ──────────────────────────────────────────────────

export const FRICTION_REDUCTION_TEST = Object.freeze([
  'Does the wrong-indicator fully fade out before review_text begins fading in?',
  'Are all hook sentences 20 words or fewer across the 25 authored learning objects?',
  'Does the teacher question list have a working domain/subject filter?',
  'Is insight_type hidden from standard authoring view (accessible in Advanced only)?',
  'Are all teacher-facing dropdown labels in Danish with plain-language tooltips?',
  'Does the mobile layout pre-allocate review_text height to prevent viewport jump?',
  'Are milestone toasts deferred to next-question-arrival in all edge cases?',
  'Does the QA pass surface three named outcomes instead of a numeric score?',
  'Does breaking a streak show nothing — no counter, no notification, no guilt signal?',
  'Can a new teacher complete a Layer 0 question without reading any documentation?',
]);
