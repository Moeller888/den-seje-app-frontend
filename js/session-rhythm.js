// Section 55 — Session Rhythm & Cognitive Fatigue Pass
//
// Core principle: SUSTAINABLE COGNITIVE RHYTHM OVER CONSTANT CHALLENGE INTENSITY.
// A great learning session is not a sequence of hard problems.
// It is a sequence of experiences that maintain the student's capacity to think.

export const SESSION_RHYTHM_PHILOSOPHY = {
  core: 'The session is the product, not the individual question',
  error: 'Optimizing individual questions without optimizing the sequence that delivers them',
  standard: 'A 20-minute session should leave students feeling intellectually energized, not mentally depleted',
  model: 'Musical pacing — tension, release, variation, return — not mechanical escalation',
  danger: 'Same-rhythm fatigue: all questions at the same intensity flatten engagement faster than difficulty does',
};

// The reflection density gate — implemented in app.js (Section 55).
// After 2 consecutive reflection states (student wrong twice in a row, both with review_text),
// the 3rd incorrect+reviewText auto-advances instead of entering reflection state.
export const REFLECTION_DENSITY_GATE = {
  threshold: 2,
  trigger: 'sessionConsecutiveReflections >= 2 — third consecutive incorrect+reviewText',
  behavior: 'Auto-advance after 2000ms, show correct answer only — no reflection panel',
  reset: 'Any correct answer or pending answer resets sessionConsecutiveReflections to 0',
  rationale: [
    'Two reflections back-to-back: the student is metabolizing two new insights simultaneously',
    'Three reflections back-to-back: the first insight has not had time to settle before the third arrives',
    'The gate does not reduce content quality — the insight exists in the question database',
    'The gate reduces cognitive stacking: not every mistake can be fully processed in real time',
    'Recovery after a losing streak is more valuable than maximizing insight delivery per mistake',
  ],
  what_this_is_not: [
    'Not a reward for wrong answers',
    'Not a shortcut that skips important content',
    'Not engagement optimization',
    'A cognitive breathing room mechanism — the insight will recur in future sessions',
  ],
};

// Session energy profiles for Democracy & Power domain questions.
// Energy = composite of: cognitive intensity + reflection demand + abstraction density + destabilization strength.
export const QUESTION_ENERGY_PROFILES = {
  heavy: {
    description: 'High cognitive intensity, deep reflection demand, strong destabilization, needs recovery after',
    characteristics: [
      'Introduces structural contradiction (e.g., revolutionaries reproducing power structures)',
      'Challenges a belief the student likely holds (e.g., majority rule can be tyranny)',
      'Requires holding multiple abstractions simultaneously (e.g., legitimacy vs. legality)',
      'Has emotionally charged framing (e.g., political apathy in youth)',
    ],
    examples: [
      'dp_008: Revolutionaries reproduce the structures they overthrew',
      'dp_024: A majority can oppress a minority without a single law forbidding anything',
      'dp_039: Is political youth apathy actually the students fault?',
      'dp_019: Human rights follow your humanity — citizen rights are granted by your state',
      'dp_032: Unelected judges can strike down laws passed by the people — is that democratic?',
    ],
    session_note: 'Two heavy questions in sequence is the maximum before a lighter moment is needed',
  },
  medium: {
    description: 'Moderate cognitive engagement, grounded in concrete examples, recovers naturally',
    characteristics: [
      'Introduces one clear concept with a concrete anchor',
      'Challenges one assumption, not a framework',
      'Review_text lands cleanly without requiring prior abstractions',
    ],
    examples: [
      'dp_004: Voter turnout as collective action problem',
      'dp_021: Echo chambers — platforms designed for engagement, not truth',
      'dp_016: What actually gives a political leader the right to decide?',
      'dp_026: Can citizens criticize those in power in a democracy?',
      'dp_038: Why do many democracies limit how long a leader can serve?',
    ],
  },
  light: {
    description: 'Clear concept, low abstraction, fast cognitive resolution, creates breathing room',
    characteristics: [
      'Student likely knows the concept or can reason to it intuitively',
      'Correct answer satisfying rather than destabilizing',
      'Review_text reinforces rather than reframes',
      'Natural recovery moment in a longer sequence',
    ],
    examples: [
      'dp_001: What makes a leader an autocrat?',
      'dp_007: What makes propaganda effective?',
      'dp_030: What role do civil society organizations play?',
    ],
    session_note: 'Light questions are not easier — they are structurally different. They give the brain space to consolidate.',
  },
};

// Session flow audit: what a 20-question session looked like before Section 55.
export const SESSION_FLOW_AUDIT = {
  problem_1_reflection_stacking: {
    scenario: 'Student answers 3 questions incorrectly in a row, all with review_text',
    old_behavior: 'Three consecutive full reflection states — student reads ~150 words of insight back-to-back-to-back',
    emotional_outcome: 'Reflection begins to feel like punishment. Third review_text is scanned, not read.',
    cognitive_outcome: 'First insight has not settled before second arrives. Third is mostly noise.',
    fix: 'Reflection density gate: maximum 2 consecutive reflections before auto-advance',
  },
  problem_2_same_wave_plateau: {
    scenario: 'Student stays in "challenge" wave for 15 questions',
    existing_mechanism: 'NUZO wave already handles this via consecutive tracking',
    note: 'Wave system is already correct — no additional change needed here',
  },
  problem_3_no_session_length_awareness: {
    scenario: 'get-next-question has no knowledge of how long the session has been running',
    old_behavior: 'Session context sent only wave_phase, consecutive_incorrect, last_misconception_type',
    fix: 'Add session_question_count to session context — enables future backend sequencing',
    current_backend_usage: 'Not yet used by get-next-question, but architecture is now in place',
  },
};

// What recovery actually means in this platform.
export const RECOVERY_MECHANICS = {
  what_creates_recovery: [
    'A correct answer on a question the student feels good about — validation without challenge',
    'A lighter question after a heavy reflection moment — cognitive decompression',
    'A concrete question after several abstract ones — grounding',
    'A question where the student reasons through the answer rather than knowing it — active engagement without destabilization',
    'Shorter review_text after a long one — visual relief',
  ],
  what_does_not_create_recovery: [
    'Points, coins, animations, level-up overlays — these are reward mechanics, not cognitive recovery',
    'Easier questions that feel condescending — breaks intellectual trust',
    'Encouraging messages ("Godt gået!") — patronizing, not restorative',
    'Faster question delivery — speed is not relief',
  ],
  platform_implementation: [
    'NUZO wave system handles recovery at the sequencing level (recovery phase)',
    'Reflection density gate handles recovery at the reflection level',
    'Question energy profiles inform future sequencing decisions',
  ],
};

// Fatigue patterns observed across long sessions.
export const FATIGUE_PATTERNS = [
  {
    name: 'Reflection fatigue',
    onset: 'After 2–3 consecutive reflection states',
    symptom: 'Third review_text is scanned not read. Student clicks continue before finishing.',
    mechanism: 'Cognitive stacking: new insights arriving before prior ones settle',
    addressed_by: 'Reflection density gate (Section 55)',
  },
  {
    name: 'Same-rhythm fatigue',
    onset: 'After 5–8 questions at the same cognitive intensity level',
    symptom: 'Questions begin to feel mechanical. Student answers faster, attends less.',
    mechanism: 'Cognitive adaptation: constant challenge intensity is not stimulating after initial engagement',
    addressed_by: 'NUZO wave system (Section 51) — already implemented',
  },
  {
    name: 'Abstract density fatigue',
    onset: 'After 3+ consecutive high-abstraction questions',
    symptom: 'Student stops connecting ideas. Answers become more random.',
    mechanism: 'Working memory saturation: abstract noun chains without concrete anchors exhaust parse capacity',
    addressed_by: 'Readability calibration (Section 52) + Youth-near rewrite (Section 53)',
  },
  {
    name: 'Late-session drift',
    onset: 'After 25+ questions in a single session',
    symptom: 'Attention begins to drift between questions. Environmental interruptions increase.',
    mechanism: 'Sustained focus depletion — not conceptual fatigue but attentional resource exhaustion',
    addressed_by: 'Future: session length awareness in get-next-question via session_question_count',
  },
];

// Mobile session sustainability.
export const MOBILE_RHYTHM = {
  thumb_fatigue: {
    pattern: 'Same interaction motor pattern repeated 20+ times — tap, read, tap, read',
    onset: 'Not a real fatigue concern on mobile — tap friction is low enough to sustain',
    real_risk: 'Holding phone in same position for 15+ minutes — physical discomfort, not interaction fatigue',
  },
  reading_fatigue: {
    pattern: 'Long review_text strings on small screens require more eye movement per sentence',
    risk: 'Heavy questions with 4–6 sentence review_texts feel longer on mobile',
    addressed_by: 'Readability standard: max 6 sentences, rhythm variation, opener hook',
  },
  transition_fatigue: {
    pattern: 'Rapid question transitions feel abrupt on mobile — less spatial context than desktop',
    addressed_by: 'Transition timing already calibrated: 600ms (correct), 2000ms (incorrect no review)',
  },
  attention_drift: {
    pattern: 'Phone sessions are frequently interrupted (notifications, environment)',
    implication: 'Question context must be immediately re-readable after a 30-second interruption',
    addressed_by: 'Question stems are short and self-contained after Section 53 rewrite',
  },
};

// The canonical session rhythm standard.
export const SESSION_RHYTHM_STANDARD = {
  reflection_density: {
    rule: 'Maximum 2 consecutive reflection states before auto-advance fallback',
    why: 'Cognitive stacking: the third insight cannot be metabolized before the first has settled',
  },
  wave_pacing: {
    rule: 'NUZO wave handles macro-rhythm: recovery → reinforcement → challenge → deep_challenge',
    why: 'Session intensity follows a natural learning curve, not a monotonic escalation',
  },
  session_context: {
    rule: 'session_question_count passed to backend — enables future length-aware sequencing',
    why: 'A 5-question session and a 30-question session should feel different at the sequencing level',
  },
  content_quality: {
    rule: 'Rhythm management never reduces conceptual quality — it manages the delivery cadence',
    why: 'Breathing room is not simplification. Recovery is not dumbing down.',
  },
  philosophy: 'The session should feel like a conversation with a thoughtful teacher — not a question machine that never pauses.',
};
