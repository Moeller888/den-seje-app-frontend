// Answer-input selection and the "stav til" (short typed answer) control for the quiz renderer
// (app.js → renderOptions). Question Interaction model: ARCHITECTURE.md → "Question Interaction
// model" — one renderer per interaction type, chosen from answer_format (+ answer_type for text).
//
// WHICH RENDERER
// The order mirrors renderOptions() exactly, so moving the decision here changes nothing for an
// existing question:
//   force_text (content flag)          → "force_text"   textarea, unchanged
//   answer_format contains "number"    → "number"       single input, unchanged
//   answer_format "text" + type "long" → "long_text"    textarea + teacher review, unchanged
//   answer_format "text" otherwise     → "short_text"   one-line input — "stav til"
//   answer_format contains "mc"        → "choice"       option buttons, unchanged
//   answer_format "match"              → "match_pairs"  Match par (js/match-pairs.js)
//   anything else                      → "unsupported"  visible error, never option buttons
//
// "text" without an answer_type is short: get-next-question already sends `answer_type || "short"`,
// and only an explicit "long" is a teacher-reviewed answer.
//
// THE SHORT-TEXT CONTROL
// The pupil is being tested on spelling, so the browser must not help: no spellcheck underline, no
// autocorrect, no automatic capital letter, no autocomplete suggestions. The raw text is handed to
// the existing submit flow untouched — no trimming, case folding or transliteration here; æ, ø and
// å reach the server exactly as typed. Normalisation and the correct/incorrect decision belong to
// the server evaluator (_shared/answer-evaluation.ts), never to the client.
//
// The document is injected so the control can be unit-tested without a browser.

export const ANSWER_RENDERERS = Object.freeze({
  FORCE_TEXT: "force_text",
  NUMBER: "number",
  LONG_TEXT: "long_text",
  SHORT_TEXT: "short_text",
  CHOICE: "choice",
  MATCH_PAIRS: "match_pairs",
  UNSUPPORTED: "unsupported",
});

export function resolveAnswerRenderer(question) {
  const content = question && typeof question.content === "object" ? question.content : null;
  if (content && content.force_text === true) return ANSWER_RENDERERS.FORCE_TEXT;

  const format = typeof question?.answer_format === "string" ? question.answer_format.toLowerCase() : "";
  if (format.includes("number")) return ANSWER_RENDERERS.NUMBER;

  if (format === "text") {
    const type = typeof question?.answer_type === "string" ? question.answer_type.trim().toLowerCase() : "";
    return type === "long" ? ANSWER_RENDERERS.LONG_TEXT : ANSWER_RENDERERS.SHORT_TEXT;
  }

  if (format.includes("mc")) return ANSWER_RENDERERS.CHOICE;

  if (format === "match") return ANSWER_RENDERERS.MATCH_PAIRS;

  return ANSWER_RENDERERS.UNSUPPORTED;
}

// Attributes that switch off every form of browser help with spelling. `autocorrect` is Safari's,
// `autocapitalize` matters on phone keyboards ("none" is the canonical value; browsers rewrite the
// legacy alias "off" to it), `enterkeyhint` labels the phone's Enter key "Send".
// `maxlength` keeps an accidental paste from becoming a request: a "stav til" answer is a word or a
// short phrase, and 100 characters is far above any real one (the server never needs more).
export const SHORT_TEXT_MAX_LENGTH = 100;

export const SHORT_TEXT_INPUT_ATTRIBUTES = Object.freeze({
  type: "text",
  spellcheck: "false",
  autocorrect: "off",
  autocapitalize: "none",
  autocomplete: "off",
  enterkeyhint: "send",
  maxlength: String(SHORT_TEXT_MAX_LENGTH),
});

export const SHORT_TEXT_LABEL = "Skriv dit svar";
export const SHORT_TEXT_PLACEHOLDER = "Skriv dit svar her";
export const SHORT_TEXT_EMPTY_HINT = "Skriv et svar, før du sender.";

// Whitespace alone is not an answer. The check never alters what is sent.
export function isSubmittableTextAnswer(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// After an incorrect "stav til" answer that has an explanation (review_text), the quiz shows the
// explanation panel instead of "Svaret er …". The spelling itself must still be stated plainly:
// the correct spelling from the server's graded response, and what the pupil actually typed (the
// field is hidden in that state). Display only — this never decides correctness. Null when the
// server sent no correct answer, so the caller shows the explanation alone, as before.
export function shortTextCorrection(correctAnswer, typedAnswer) {
  if (typeof correctAnswer !== "string" || correctAnswer.trim().length === 0) return null;
  const correct = correctAnswer.trim();
  const typed = typeof typedAnswer === "string" ? typedAnswer.trim() : "";
  return typed ? `Det staves: ${correct} — du skrev: ${typed}` : `Det staves: ${correct}`;
}

// Builds the one-line input, the submit button and an announced hint for an empty attempt.
// onSubmit(rawText, button) is the existing submitAnswer — the quiz state machine stays in charge.
//
// WHILE AN ANSWER IS ON ITS WAY
// submitAnswer is async and already refuses a second call outside AWAITING_ANSWER, so a double
// Enter can never reach the server twice. The control adds the matching user-facing behaviour:
//   * a second Enter/click while the first is pending does nothing (no second onSubmit call);
//   * the field is read-only and aria-busy, so the pupil cannot edit an answer that is already sent;
//   * when submitAnswer hands the answer back for another try — it re-enables the button after a
//     network or server error — the field becomes editable again, keeps the typed text and gets
//     focus, so the pupil can simply press Enter again. On success the button stays disabled and the
//     next question replaces the control; nothing is refocused.
// A synchronous onSubmit (tests, or a future caller) behaves exactly as before.
export function buildShortTextAnswer(doc, { onSubmit, describedBy = null } = {}) {
  if (!doc || typeof doc.createElement !== "function") {
    throw new Error("buildShortTextAnswer: a document is required");
  }
  if (typeof onSubmit !== "function") {
    throw new Error("buildShortTextAnswer: onSubmit is required");
  }

  const input = doc.createElement("input");
  for (const [name, value] of Object.entries(SHORT_TEXT_INPUT_ATTRIBUTES)) {
    input.setAttribute(name, value);
  }
  input.id = "short-answer-input";
  input.className = "short-answer-input";
  input.setAttribute("aria-label", SHORT_TEXT_LABEL);
  input.setAttribute("placeholder", SHORT_TEXT_PLACEHOLDER);

  // role="alert" announces the hint to screen readers when it is filled; empty, it says nothing.
  const hint = doc.createElement("p");
  hint.id = "short-answer-hint";
  hint.className = "feedback-error";
  hint.setAttribute("role", "alert");
  hint.textContent = "";
  // No margin: an empty hint takes no space between the field and the button.
  if (hint.style) hint.style.margin = "0";

  // The question text describes the field, so a screen reader reads the task with the input.
  input.setAttribute("aria-describedby", describedBy ? `${describedBy} ${hint.id}` : hint.id);

  const button = doc.createElement("button");
  button.setAttribute("type", "button");
  button.className = "submit-btn";
  button.textContent = "Send svar";

  let inFlight = false;

  const clearEmptyHint = () => {
    input.removeAttribute("aria-invalid");
    hint.textContent = "";
  };

  const settle = () => {
    input.removeAttribute("aria-busy");
    // submitAnswer re-enables the button only when the answer was NOT accepted (error / retry).
    // Accepted: the answer stays locked (read-only, no further submit) until the next question
    // replaces this control. Handed back: editable again, text kept, focus on the field.
    if (button.disabled) return;
    inFlight = false;
    input.readOnly = false;
    if (typeof input.focus === "function") input.focus();
  };

  const submit = () => {
    if (inFlight) return false;
    const raw = input.value;
    if (!isSubmittableTextAnswer(raw)) {
      input.setAttribute("aria-invalid", "true");
      hint.textContent = SHORT_TEXT_EMPTY_HINT;
      if (typeof input.focus === "function") input.focus();
      return false;
    }
    clearEmptyHint();
    const pending = onSubmit(raw, button);
    if (pending && typeof pending.then === "function") {
      inFlight = true;
      input.readOnly = true;
      input.setAttribute("aria-busy", "true");
      pending.then(settle, settle);
    }
    return true;
  };

  button.onclick = submit;

  // Typing after an empty attempt removes the error at once — the pupil is already fixing it.
  input.addEventListener("input", () => {
    if (input.hasAttribute("aria-invalid") && isSubmittableTextAnswer(input.value)) clearEmptyHint();
  });

  input.addEventListener("keydown", (e) => {
    // isComposing: Enter that confirms an IME composition is not a submit.
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  });

  return { input, button, hint, submit };
}
