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

  return ANSWER_RENDERERS.UNSUPPORTED;
}

// Attributes that switch off every form of browser help with spelling. `autocorrect` is Safari's,
// `autocapitalize` matters on phone keyboards ("none" is the canonical value; browsers rewrite the
// legacy alias "off" to it), `enterkeyhint` labels the phone's Enter key "Send".
export const SHORT_TEXT_INPUT_ATTRIBUTES = Object.freeze({
  type: "text",
  spellcheck: "false",
  autocorrect: "off",
  autocapitalize: "none",
  autocomplete: "off",
  enterkeyhint: "send",
});

export const SHORT_TEXT_LABEL = "Skriv dit svar";
export const SHORT_TEXT_EMPTY_HINT = "Skriv et svar, før du sender.";

// Whitespace alone is not an answer. The check never alters what is sent.
export function isSubmittableTextAnswer(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// Builds the one-line input, the submit button and an announced hint for an empty attempt.
// onSubmit(rawText, button) is the existing submitAnswer — the quiz state machine stays in charge.
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

  const submit = () => {
    const raw = input.value;
    if (!isSubmittableTextAnswer(raw)) {
      input.setAttribute("aria-invalid", "true");
      hint.textContent = SHORT_TEXT_EMPTY_HINT;
      if (typeof input.focus === "function") input.focus();
      return false;
    }
    input.removeAttribute("aria-invalid");
    hint.textContent = "";
    onSubmit(raw, button);
    return true;
  };

  button.onclick = submit;

  input.addEventListener("keydown", (e) => {
    // isComposing: Enter that confirms an IME composition is not a submit.
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  });

  return { input, button, hint, submit };
}
