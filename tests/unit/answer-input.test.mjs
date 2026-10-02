// "Stav til" — the short typed answer renderer (js/answer-input.js) and its wiring in app.js.
//
// Pins the renderer contract: which answer control each interaction type gets, that the short-text
// field switches off every browser spelling aid, that Enter and the button both hand the RAW text
// to the existing submit flow, that an empty answer is never sent, and that MC, number and the
// long teacher-reviewed answer are untouched. The server side — the authoritative evaluator — is
// pinned at source level, because process-event is a Deno function this suite cannot run.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ANSWER_RENDERERS,
  SHORT_TEXT_INPUT_ATTRIBUTES,
  SHORT_TEXT_EMPTY_HINT,
  resolveAnswerRenderer,
  isSubmittableTextAnswer,
  buildShortTextAnswer,
} from "../../js/answer-input.js";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

// ── Minimal fake DOM: just what the control uses ─────────────────────────────────────────────────
function fakeElement(tagName) {
  const attrs = new Map();
  const listeners = new Map();
  return {
    tagName: tagName.toUpperCase(),
    value: "",
    id: "",
    className: "",
    textContent: "",
    style: {},
    focused: 0,
    onclick: null,
    setAttribute(name, value) { attrs.set(name, String(value)); },
    getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
    removeAttribute(name) { attrs.delete(name); },
    hasAttribute(name) { return attrs.has(name); },
    addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) ?? []), fn]); },
    focus() { this.focused++; },
    // Dispatches a keydown and reports whether the handler called preventDefault.
    key(key, extra = {}) {
      let prevented = false;
      const event = { key, isComposing: false, ...extra, preventDefault() { prevented = true; } };
      for (const fn of listeners.get("keydown") ?? []) fn(event);
      return prevented;
    },
  };
}
const fakeDocument = { createElement: (tag) => fakeElement(tag) };

function build() {
  const calls = [];
  const control = buildShortTextAnswer(fakeDocument, {
    onSubmit: (raw, btn) => calls.push({ raw, btn }),
    describedBy: "question",
  });
  return { ...control, calls };
}

const q = (answer_format, answer_type, content = { question: "Stav til: hund" }) =>
  ({ answer_format, answer_type, content });

// ── Renderer selection ──────────────────────────────────────────────────────────────────────────
test("text + short → the one-line short-text renderer", () => {
  assert.equal(resolveAnswerRenderer(q("text", "short")), ANSWER_RENDERERS.SHORT_TEXT);
  assert.equal(resolveAnswerRenderer(q("TEXT", "Short")), ANSWER_RENDERERS.SHORT_TEXT);
});

test("text without an answer_type is short (get-next-question sends answer_type || 'short')", () => {
  assert.equal(resolveAnswerRenderer(q("text", undefined)), ANSWER_RENDERERS.SHORT_TEXT);
  assert.equal(resolveAnswerRenderer(q("text", null)), ANSWER_RENDERERS.SHORT_TEXT);
});

test("text + long keeps the long teacher-reviewed renderer", () => {
  assert.equal(resolveAnswerRenderer(q("text", "long")), ANSWER_RENDERERS.LONG_TEXT);
  assert.equal(resolveAnswerRenderer(q("text", " LONG ")), ANSWER_RENDERERS.LONG_TEXT);
});

test("force_text wins over every format, exactly as before", () => {
  const content = { question: "x", force_text: true };
  for (const f of ["mc", "number", "text", "anything"]) {
    assert.equal(resolveAnswerRenderer(q(f, "short", content)), ANSWER_RENDERERS.FORCE_TEXT, f);
  }
});

test("mc and number keep their renderers", () => {
  assert.equal(resolveAnswerRenderer(q("mc", "short")), ANSWER_RENDERERS.CHOICE);
  assert.equal(resolveAnswerRenderer(q("mc_4", "short")), ANSWER_RENDERERS.CHOICE);
  assert.equal(resolveAnswerRenderer(q("number", "short")), ANSWER_RENDERERS.NUMBER);
  assert.equal(resolveAnswerRenderer(q("number_year", "short")), ANSWER_RENDERERS.NUMBER);
});

test("an unknown or missing format is unsupported — never silently option buttons", () => {
  for (const f of ["true_false", "cloze", "order", "", null, undefined, 42]) {
    assert.equal(resolveAnswerRenderer(q(f, "short")), ANSWER_RENDERERS.UNSUPPORTED, String(f));
  }
});

test("malformed questions never throw", () => {
  for (const bad of [null, undefined, {}, { content: null }, { content: "x", answer_format: "text" }]) {
    assert.doesNotThrow(() => resolveAnswerRenderer(bad));
  }
  assert.equal(resolveAnswerRenderer({ content: "x", answer_format: "text" }), ANSWER_RENDERERS.SHORT_TEXT);
});

// ── The short-text control ──────────────────────────────────────────────────────────────────────
test("short text renders <input type=\"text\">, not a textarea", () => {
  const { input } = build();
  assert.equal(input.tagName, "INPUT");
  assert.equal(input.getAttribute("type"), "text");
});

test("spellcheck is false", () => {
  assert.equal(build().input.getAttribute("spellcheck"), "false");
});

test("autocorrect, autocapitalize and autocomplete are off", () => {
  const { input } = build();
  assert.equal(input.getAttribute("autocorrect"), "off");
  assert.equal(input.getAttribute("autocapitalize"), "none", "canonical value; \"off\" is a legacy alias");
  assert.equal(input.getAttribute("autocomplete"), "off");
  assert.deepEqual(Object.keys(SHORT_TEXT_INPUT_ATTRIBUTES).sort(),
    ["autocapitalize", "autocomplete", "autocorrect", "enterkeyhint", "spellcheck", "type"]);
});

test("the field is labelled and described for screen readers", () => {
  const { input, hint, button } = build();
  assert.ok(input.getAttribute("aria-label"));
  assert.equal(input.getAttribute("aria-describedby"), "question short-answer-hint");
  assert.equal(hint.getAttribute("role"), "alert");
  assert.equal(button.tagName, "BUTTON");
  assert.equal(button.getAttribute("type"), "button");
  assert.equal(button.textContent, "Send svar");
});

test("Enter sends the answer", () => {
  const { input, button, calls } = build();
  input.value = "hund";
  assert.equal(input.key("Enter"), true, "Enter is consumed");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].raw, "hund");
  assert.equal(calls[0].btn, button, "the submit button is passed on, like the other renderers");
});

test("Enter that confirms an IME composition does not send", () => {
  const { input, calls } = build();
  input.value = "hund";
  input.key("Enter", { isComposing: true });
  assert.equal(calls.length, 0);
});

test("other keys never send", () => {
  const { input, calls } = build();
  input.value = "hund";
  assert.equal(input.key("a"), false);
  assert.equal(input.key("Tab"), false);
  assert.equal(calls.length, 0);
});

test("the submit button sends the same raw text as Enter", () => {
  const viaEnter = build();
  const viaButton = build();
  for (const c of [viaEnter, viaButton]) c.input.value = "  Hund. ";
  viaEnter.input.key("Enter");
  viaButton.button.onclick();
  assert.equal(viaEnter.calls[0].raw, "  Hund. ");
  assert.equal(viaButton.calls[0].raw, "  Hund. ", "no trimming, case folding or punctuation removal on the client");
});

test("an empty or whitespace-only answer is not sent, and the pupil is told why", () => {
  for (const value of ["", "   ", "\t\n", " "]) {
    const { input, hint, button, calls } = build();
    input.value = value;
    input.key("Enter");
    button.onclick();
    assert.equal(calls.length, 0, JSON.stringify(value));
    assert.equal(input.getAttribute("aria-invalid"), "true");
    assert.equal(hint.textContent, SHORT_TEXT_EMPTY_HINT);
    assert.ok(input.focused > 0, "focus returns to the field");
  }
});

test("a valid answer after an empty attempt clears the error", () => {
  const { input, hint, calls } = build();
  input.key("Enter");
  input.value = "kat";
  input.key("Enter");
  assert.equal(calls.length, 1);
  assert.equal(input.hasAttribute("aria-invalid"), false);
  assert.equal(hint.textContent, "");
});

test("æ, ø and å reach the submit flow exactly as typed", () => {
  for (const word of ["blåbærgrød", "Ærø", "ØRESUND", "åg", "don’t"]) {
    const { input, calls } = build();
    input.value = word;
    input.key("Enter");
    assert.equal(calls[0].raw, word, word);
  }
});

test("isSubmittableTextAnswer never alters, only judges emptiness", () => {
  assert.equal(isSubmittableTextAnswer("å"), true);
  assert.equal(isSubmittableTextAnswer(" x "), true);
  for (const v of ["", "  ", null, undefined, 3, {}]) assert.equal(isSubmittableTextAnswer(v), false);
});

test("buildShortTextAnswer fails loud without a document or a submit handler", () => {
  assert.throws(() => buildShortTextAnswer(null, { onSubmit: () => {} }), /document is required/);
  assert.throws(() => buildShortTextAnswer(fakeDocument, {}), /onSubmit is required/);
});

// ── Wiring in app.js (source level — app.js runs only in the browser) ──────────────────────────
const APP = read("../../app.js");
const renderOptionsSrc = (() => {
  const start = APP.indexOf("function renderOptions(question)");
  const end = APP.indexOf("async function loadAndRenderQuestion()");
  assert.ok(start > 0 && end > start, "renderOptions found");
  return APP.slice(start, end);
})();

test("app.js selects renderers through resolveAnswerRenderer", () => {
  assert.match(APP, /import \{ ANSWER_RENDERERS, resolveAnswerRenderer, buildShortTextAnswer \} from "\.\/js\/answer-input\.js";/);
  assert.match(renderOptionsSrc, /const renderer = resolveAnswerRenderer\(question\);/);
});

test("short text hands the raw answer to the existing submitAnswer — no parallel submit path", () => {
  const block = renderOptionsSrc.slice(renderOptionsSrc.indexOf("ANSWER_RENDERERS.SHORT_TEXT"));
  assert.match(block, /buildShortTextAnswer\(document, \{\s*onSubmit: submitAnswer,/);
  assert.match(block, /input\.focus\(\);/);
  assert.equal(/supabase\.functions\.invoke/.test(renderOptionsSrc), false, "renderers never call the server");
});

test("long text keeps the textarea, Shift+Enter newline and the OCR control", () => {
  const start = renderOptionsSrc.indexOf("renderer === ANSWER_RENDERERS.LONG_TEXT");
  const block = renderOptionsSrc.slice(start, renderOptionsSrc.indexOf("ANSWER_RENDERERS.UNSUPPORTED"));
  assert.ok(start > 0);
  assert.match(block, /document\.createElement\("textarea"\)/);
  assert.match(block, /e\.key === "Enter" && !e\.shiftKey/);
  assert.match(block, /attachOcrControl\(textarea, optionsContainer\);/);
  assert.match(block, /submitAnswer\(textarea\.value, btn\);/);
});

test("number rendering is unchanged", () => {
  const start = renderOptionsSrc.indexOf("renderer === ANSWER_RENDERERS.NUMBER");
  const block = renderOptionsSrc.slice(start, renderOptionsSrc.indexOf("ANSWER_RENDERERS.SHORT_TEXT"));
  assert.ok(start > 0);
  assert.match(block, /const val = Number\(input\.value\);/);
  assert.match(block, /submitAnswer\(String\(val\), btn\);/);
  assert.match(block, /if \(e\.key === "Enter"\) btn\.onclick\(\);/);
});

test("MC rendering is unchanged: padding, option buttons and the per-option read-aloud row", () => {
  assert.match(renderOptionsSrc, /options = prepareChoiceOptions\(options, format\);/);
  assert.match(renderOptionsSrc, /btn\.onclick = \(\) => submitAnswer\(option, btn\);/);
  assert.match(renderOptionsSrc, /row\.className = "option-row";/);
  assert.match(renderOptionsSrc, /attachOptionReadAloudControl\(row, option, \{ subject: currentSubject, question: content\.question, options \}\);/);
});

test("an unsupported format fails loud with a way out and never reaches AWAITING_ANSWER", () => {
  const block = renderOptionsSrc.slice(renderOptionsSrc.indexOf("renderer === ANSWER_RENDERERS.UNSUPPORTED"));
  assert.match(block, /logError\("UNSUPPORTED_ANSWER_FORMAT"/);
  assert.match(block, /msg\.setAttribute\("role", "alert"\);/);
  assert.match(block, /hubBtn\.id = "go-hub-btn";/);
  assert.match(block, /return false;/);
  assert.match(APP, /if \(!renderOptions\(question\)\) \{[\s\S]*?uiState = "IDLE";[\s\S]*?questionElement\.dataset\.state = "error";[\s\S]*?return;\s*\}\s*setUIState\(UI_STATES\.AWAITING_ANSWER\);/);
});

test("the question prompt keeps its read-aloud control (no speech-to-text added)", () => {
  assert.match(APP, /attachReadAloudControl\(questionElement, question\.content\.question, \{ subject: currentSubject \}\);/);
  const input = read("../../js/answer-input.js");
  assert.equal(/SpeechRecognition|webkitSpeechRecognition|getUserMedia/.test(input), false);
});

test("an incorrect answer still shows the correct spelling from the server", () => {
  assert.match(APP, /feedback\.textContent = "Svaret er " \+ \(data\.correct_answer \?\? "ukendt"\) \+ " — husk det nu\.";/);
});

// ── The server evaluator stays authoritative ────────────────────────────────────────────────────
test("process-event still evaluates short text with isTextAnswerCorrect + accepted_answers", () => {
  const pe = read("../../supabase/functions/process-event/index.ts");
  assert.match(pe, /import \{ isTextAnswerCorrect \} from "\.\.\/_shared\/answer-evaluation\.ts";/);
  assert.match(pe, /isTextAnswerCorrect\(answer, correct_answer, questionContent\?\.accepted_answers\)/);
  assert.match(pe, /"process_text_answer"/);
  // The long answer path is checked first and stays teacher-reviewed.
  assert.ok(pe.indexOf('answerType === "long"') < pe.indexOf('format.includes("text")'));
});

test("get-next-question delivers text questions as text, with their answer_type", () => {
  const gnq = read("../../supabase/functions/get-next-question/index.ts");
  assert.match(gnq, /if \(format\.includes\("text"\)\) return "text";/);
  assert.match(gnq, /answer_type: q\.answer_type \|\| "short",/);
});

test("the client never sends accepted_answers or decides correctness", () => {
  const input = read("../../js/answer-input.js");
  assert.equal(/accepted_answers|isTextAnswerCorrect|normalize\(/.test(input.replace(/^\/\/.*$/gm, "")), false);
});
