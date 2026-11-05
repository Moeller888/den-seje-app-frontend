// Tal-svar (answer_format containing "number", F-01b): the one-line number field of the quiz
// (app.js → renderOptions, ANSWER_RENDERERS.NUMBER) and the parsing of what the pupil typed.
//
// THE CONTRACT IS WHOLE NUMBERS. F-01's number questions ask for years and counts, so the field
// accepts an integer and nothing else. What it does with the text:
//   ""  / only spaces              → invalid ("Skriv et tal …"), NEVER 0. Number("") is 0, which used
//                                    to send "0" for an empty field.
//   "0", "1849", "-50", "007"      → valid; sent as the canonical integer "0", "1849", "-50", "7".
//   "−50" (U+2212), "–50", "—50"   → valid, "-50" — the same minus signs the server folds.
//   "1 849", "1 849", "1.849" → valid, "1849": a Danish thousands separator (space, no-break
//                                    space, narrow no-break space, thin space, or a dot) ONLY when every
//                                    group after the first has exactly three digits and one kind of
//                                    separator is used. "1 84", "1.8490", "1 849.000" are refused.
//   "12.34", "1849,0", "1849,5"    → invalid: a decimal. The contract is integers, so the field asks
//                                    for a whole number instead of guessing ("1849,0" too).
//   "år 1849", "i 1849", "i år 1849", "1849.", "1849!"
//                                  → valid, "1849": a leading "år" / "i" / "i år" and ONE trailing
//                                    full stop or exclamation mark never change the number, so a pupil
//                                    who writes a little sentence is not stopped (F-01 QA). Nothing else
//                                    around the number is dropped: "ca. 1849", "1849 teser", "1849,"
//                                    are still refused with a message.
//   "+5"                           → invalid: the server's grading has no plus sign ("+5" never
//                                    matches), so the field asks for the number without it.
//   "abc", "18a9", "5 kr", "1/2"   → invalid: only digits.
//   longer than NUMBER_MAX_LENGTH  → invalid: too long.
//
// AGREEMENT WITH THE SERVER. Grading is public.normalize_number_answer (D-290 G1, migration
// 20261101150000; TS twin supabase/functions/_shared/answer-normalize.ts normalizeNumber). The browser
// only ever sends a canonical integer string matching /^(0|-?[1-9][0-9]*)$/, and the server normalises
// every such string to itself, so the server grades exactly the integer the pupil sees accepted. The one
// place the browser reads more than the server would on the raw text is the Danish thousands DOT: the
// server reads a raw "1.849" as the decimal 1.849, but the browser never sends it raw — it sends "1849",
// which the pupil meant. Everything the server would read differently (a plus sign, a decimal) is refused
// here with a message, never sent. Correctness itself is decided by the server only.
//
// The document is injected so the control can be unit-tested without a browser.

export const NUMBER_MAX_LENGTH = 20;

export const NUMBER_ERRORS = Object.freeze({
  EMPTY: "empty",
  TOO_LONG: "too_long",
  PLUS: "plus",
  DECIMAL: "decimal",
  GROUPING: "grouping",
  NOT_A_NUMBER: "not_a_number",
});

export const NUMBER_MESSAGES = Object.freeze({
  [NUMBER_ERRORS.EMPTY]: "Skriv et tal, før du sender.",
  [NUMBER_ERRORS.TOO_LONG]: `Tallet er for langt. Skriv højst ${NUMBER_MAX_LENGTH} tegn.`,
  [NUMBER_ERRORS.PLUS]: "Skriv tallet uden plustegn.",
  [NUMBER_ERRORS.DECIMAL]: "Svaret skal være et helt tal. Skriv det uden komma og decimaler.",
  [NUMBER_ERRORS.GROUPING]: "Skriv tallet uden mellemrum, eller med tre cifre i hver gruppe (fx 1 849).",
  [NUMBER_ERRORS.NOT_A_NUMBER]: "Skriv kun cifre (0–9). Et minus foran er tilladt.",
});

export const NUMBER_LABEL = "Skriv dit svar som et tal";
export const NUMBER_PLACEHOLDER = "Skriv et tal";

export const NUMBER_INPUT_ATTRIBUTES = Object.freeze({
  type: "text",
  autocomplete: "off",
  autocorrect: "off",
  autocapitalize: "none",
  spellcheck: "false",
  enterkeyhint: "send",
  maxlength: String(NUMBER_MAX_LENGTH),
});

// The minus signs and spaces the server folds (public.normalize_number_answer's translate()).
const MINUS = /[−–—]/g;
const GROUP_SPACE = /[   ]/g;

// Words and punctuation around the number that never change it (see the table above). Applied once
// each, after trimming; the rest of the text must still be a number on its own.
const LEADING_WORDS = /^(?:i\s+år|år|i)\s+(?=[-+0-9])/i;
const TRAILING_STOP = /(?<=[0-9])[.!]$/;

const INTEGER = /^-?[0-9]+$/;
const SPACE_GROUPED = /^-?[0-9]{1,3}( [0-9]{3})+$/;
const DOT_GROUPED = /^-?[0-9]{1,3}(\.[0-9]{3})+$/;
const DECIMAL = /^-?[0-9]+([ .][0-9]+)*[.,][0-9]+$/;

function invalid(error) {
  return { ok: false, error, message: NUMBER_MESSAGES[error] };
}

function canonicalInteger(s) {
  let negative = s.startsWith("-");
  let digits = negative ? s.slice(1) : s;
  digits = digits.replace(/^0+(?=[0-9])/, "");
  if (digits === "0") negative = false;
  return `${negative ? "-" : ""}${digits}`;
}

// { ok: true, value } with value the canonical integer string to send, or
// { ok: false, error, message } with error one of NUMBER_ERRORS and a Danish message for the pupil.
export function parseNumberAnswer(raw) {
  if (typeof raw !== "string") return invalid(NUMBER_ERRORS.EMPTY);
  const trimmed = raw.normalize("NFC").replace(MINUS, "-").replace(GROUP_SPACE, " ").trim();
  if (trimmed.length === 0) return invalid(NUMBER_ERRORS.EMPTY);
  if (trimmed.length > NUMBER_MAX_LENGTH) return invalid(NUMBER_ERRORS.TOO_LONG);
  const s = trimmed.replace(LEADING_WORDS, "").replace(TRAILING_STOP, "");
  if (s.startsWith("+")) return invalid(NUMBER_ERRORS.PLUS);

  if (INTEGER.test(s)) return { ok: true, value: canonicalInteger(s) };
  if (SPACE_GROUPED.test(s)) return { ok: true, value: canonicalInteger(s.replace(/ /g, "")) };
  if (DOT_GROUPED.test(s)) return { ok: true, value: canonicalInteger(s.replace(/\./g, "")) };

  if (s.includes(",") && DECIMAL.test(s)) return invalid(NUMBER_ERRORS.DECIMAL);
  if (/^-?[0-9]+\.[0-9]+$/.test(s)) return invalid(NUMBER_ERRORS.DECIMAL);
  if (/^-?[0-9]+([ .][0-9]+)+$/.test(s)) return invalid(NUMBER_ERRORS.GROUPING);
  if (DECIMAL.test(s)) return invalid(NUMBER_ERRORS.DECIMAL);
  return invalid(NUMBER_ERRORS.NOT_A_NUMBER);
}

// Builds the number field, its announced error line and the submit button.
// onSubmit(canonical, button) is the quiz's submitAnswer: the state machine stays in charge, and a
// second call outside AWAITING_ANSWER is refused there. Enter and the button run the same submit().
//
// INVALID INPUT: nothing is sent; the error line says why (role="alert"), the field is aria-invalid and
// keeps focus, so the pupil corrects it and sends again. Typing clears the error.
// WHILE AN ANSWER IS ON ITS WAY (an async onSubmit): a second Enter/click does nothing, and the field is
// read-only. When submitAnswer hands the answer back (it re-enables the button after an error) the field
// is editable again with the text kept; on success it stays locked until the next question replaces it.
export function buildNumberAnswer(doc, { onSubmit, describedBy = null } = {}) {
  if (!doc || typeof doc.createElement !== "function") {
    throw new Error("buildNumberAnswer: a document is required");
  }
  if (typeof onSubmit !== "function") {
    throw new Error("buildNumberAnswer: onSubmit is required");
  }

  const input = doc.createElement("input");
  for (const [name, value] of Object.entries(NUMBER_INPUT_ATTRIBUTES)) {
    input.setAttribute(name, value);
  }
  input.id = "number-answer-input";
  input.className = "number-answer-input";
  input.setAttribute("aria-label", NUMBER_LABEL);
  input.setAttribute("placeholder", NUMBER_PLACEHOLDER);

  const hint = doc.createElement("p");
  hint.id = "number-answer-hint";
  hint.className = "feedback-error";
  hint.setAttribute("role", "alert");
  hint.textContent = "";
  if (hint.style) hint.style.margin = "0";

  input.setAttribute("aria-describedby", describedBy ? `${describedBy} ${hint.id}` : hint.id);

  const button = doc.createElement("button");
  button.setAttribute("type", "button");
  button.className = "submit-btn";
  button.textContent = "Svar";

  let inFlight = false;

  const clearError = () => {
    input.removeAttribute("aria-invalid");
    hint.textContent = "";
  };

  const settle = () => {
    input.removeAttribute("aria-busy");
    if (button.disabled) return;
    inFlight = false;
    input.readOnly = false;
    if (typeof input.focus === "function") input.focus();
  };

  const submit = () => {
    if (inFlight) return false;
    const parsed = parseNumberAnswer(input.value);
    if (!parsed.ok) {
      input.setAttribute("aria-invalid", "true");
      hint.textContent = parsed.message;
      if (typeof input.focus === "function") input.focus();
      return false;
    }
    clearError();
    const pending = onSubmit(parsed.value, button);
    if (pending && typeof pending.then === "function") {
      inFlight = true;
      input.readOnly = true;
      input.setAttribute("aria-busy", "true");
      pending.then(settle, settle);
    }
    return true;
  };

  button.onclick = submit;

  input.addEventListener("input", () => {
    if (input.hasAttribute("aria-invalid")) clearError();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  });

  return { input, button, hint, submit };
}
