// Section 54 — Reflection State & Review Moment Experience Pass
//
// Core principle: THE REVIEW MOMENT IS THE LEARNING CENTER OF THE PLATFORM.
// Every incorrect answer has a review_text. That text is a designed pedagogical artifact.
// The old flow buried it in red bold text and auto-advanced after 3.2 seconds.
// This is the fix.

export const REFLECTION_PHILOSOPHY = {
  core: 'The review_text is not a punishment — it is the insight the question was built to deliver',
  old_problem: 'review_text was appended to "❌ Forkert — " in #feedback: bold, red, 13px, auto-dismissed in 3.2s',
  new_approach: 'REFLECTING state: student controls progression, review_text gets its own visual space',
  principle: 'Mistake → pause → insight → forward. Not: mistake → red text → auto-advance.',
};

// The REFLECTING state — new node in the UI state machine.
export const REFLECTING_STATE = {
  name: 'REFLECTING',
  entered_from: 'SUBMITTING_ANSWER',
  exits_to: 'TRANSITIONING',
  trigger_condition: 'data.status === "incorrect" && data.review_text !== null',
  exit_mechanism: 'Student clicks #reflection-continue ("Videre →")',
  fallback: 'If no review_text: auto-advance after 2000ms (unchanged behavior)',
};

// Full state machine including REFLECTING.
export const STATE_MACHINE = {
  IDLE: ['LOADING_QUESTION'],
  LOADING_QUESTION: ['AWAITING_ANSWER'],
  AWAITING_ANSWER: ['SUBMITTING_ANSWER'],
  SUBMITTING_ANSWER: ['TRANSITIONING', 'AWAITING_ANSWER', 'REFLECTING'],
  REFLECTING: ['TRANSITIONING'],
  TRANSITIONING: ['LOADING_QUESTION'],
};

// Temporal sequence for the incorrect+reviewText path.
export const TEMPORAL_SEQUENCE = [
  { t: '0ms',   event: 'submitAnswer called, buttons disabled, SUBMITTING_ANSWER' },
  { t: 'async', event: 'process-event returns: status=incorrect, review_text=...' },
  { t: '+0ms',  event: 'playSound("error"), shake animation, feedback = "❌ Forkert"' },
  { t: '+0ms',  event: 'fetchProgress() completes' },
  { t: '+400ms',event: 'enterReflectionState() called: SUBMITTING_ANSWER → REFLECTING' },
  { t: '+400ms',event: '#question dims to opacity 0.3 (data-state="reflecting")' },
  { t: '+400ms',event: '#review-feedback shows with reflectIn animation (300ms ease)' },
  { t: '+400ms',event: '#options hidden, #reflection-continue shown' },
  { t: '+600ms', event: '#reflection-continue receives focus (keyboard-accessible)' },
  { t: 'click', event: 'REFLECTING → TRANSITIONING → loadAndRenderQuestion()' },
];

// Visual hierarchy during REFLECTING state.
export const VISUAL_HIERARCHY = {
  question: {
    state: 'dimmed — opacity 0.3 via #question[data-state="reflecting"]',
    role: 'Background reference — no longer the focal point',
    transition: '300ms ease opacity transition',
  },
  feedback: {
    state: 'cleared — textContent = "" after 400ms',
    role: 'Not needed during reflection; brief "❌ Forkert" served its purpose',
  },
  review_panel: {
    element: '#review-feedback',
    state: 'display:block with .visible class — reflectIn animation',
    typography: '16px / 1.75 line-height — readable, not cramped',
    visual: 'border-left: 3px solid --accent — accent-colored left rule',
    background: '--bg-main — visually recessed within the card',
    role: 'The focal point. The insight the question was designed to deliver.',
  },
  continue_btn: {
    element: '#reflection-continue',
    state: 'display:block — becomes only interactive element',
    style: 'Neutral: --btn-bg background, no accent color — not urgent, not celebratory',
    focus: 'Auto-focused after 200ms — keyboard users do not need to navigate',
    role: 'Student controls when they move forward. No time pressure.',
  },
  options: {
    state: 'display:none — hidden during reflection',
    restore: 'Set to "" at start of loadAndRenderQuestion — CSS flex takes over',
  },
};

// Review panel CSS contract.
export const REVIEW_PANEL_CSS = {
  default_state: 'display: none — invisible until reflection',
  visible_state: 'display: block + animation: reflectIn 300ms ease forwards',
  animation: '@keyframes reflectIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }',
  font_size: '16px — larger than surrounding text (was 13px)',
  line_height: '1.75 — generous spacing for reading dense content',
  color: 'var(--text-main) — full contrast, not muted',
  padding: '16px 18px',
  background: 'var(--bg-main)',
  border_radius: '10px',
  border_left: '3px solid var(--accent)',
  reduced_motion: 'animation: none — respects prefers-reduced-motion',
};

// What was wrong with the old flow — documented for future reference.
export const OLD_FLOW_AUDIT = {
  problems: [
    'review_text was concatenated to "❌ Forkert — " and placed in #feedback — bold, red, 14px',
    'Auto-advance fired 3200ms after answer regardless of reading speed or text length',
    '#review-feedback existed in DOM but was never used — CSS: margin-top:6px; color:var(--text-muted); 13px',
    'Student had no agency over when to proceed',
    'Long review_texts were cut off visually — #feedback had no overflow handling',
    'The review_text competed with the error color for attention and lost',
  ],
  root_cause: 'The review_text was treated as an annotation to the error state, not as a separate learning moment',
};

// Conditions where REFLECTING state is NOT entered.
export const FALLBACK_CONDITIONS = [
  {
    condition: 'data.status === "incorrect" && !data.review_text',
    behavior: 'Show "❌ Forkert – korrekt svar: X", auto-advance after 2000ms (unchanged)',
  },
  {
    condition: 'data.status === "correct"',
    behavior: 'Auto-advance after 600ms (unchanged)',
  },
  {
    condition: 'data.status === "pending"',
    behavior: 'Auto-advance after 1000ms (unchanged)',
  },
];

// Cleanup contract — loadAndRenderQuestion resets all reflection state.
export const CLEANUP_CONTRACT = {
  when: 'At the start of loadAndRenderQuestion(), before getNextQuestion()',
  operations: [
    'optionsContainer.style.display = "" — restore flex from CSS',
    'reviewFeedback.textContent = "" — clear previous review text',
    'reviewFeedback.classList.remove("visible") — hide panel, remove animation',
    'reflectionContinue.style.display = "none" — hide continue button',
  ],
  why: 'Idempotent cleanup — safe to run even if no reflection occurred',
};
