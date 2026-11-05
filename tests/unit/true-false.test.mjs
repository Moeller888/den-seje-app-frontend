// Sandt/falsk (true_false, F-02): the server contract (_shared/true-false.ts), the registry entry
// (built, NOT servable, guessFloor 0.5), the public payload, the get-next-question / process-event
// routing it relies on WITHOUT any change to those functions, renderer resolution, and the browser
// control (js/true-false.js) on a minimal fake DOM. The real-engine behaviour is
// tests/true-false-ui.spec.ts; grading and rewards on production's SQL are tests/unit/true-false-grading.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  TRUE_FALSE_FORMAT, TRUE_FALSE_OPTIONS, isTrueFalseOption, parseTrueFalseContent, trueFalseKey,
  validateTrueFalseContent,
} from "../../supabase/functions/_shared/true-false.ts";
import { toPublicQuestion, PUBLIC_CONTENT_KEYS } from "../../supabase/functions/_shared/question-dto.ts";
import {
  INTERACTION_KINDS, KIND_ORDER, classifyQuestion, isServableKind, servableWireFormat,
} from "../../supabase/functions/_shared/interaction-kinds.ts";
import { resolveAnswerRenderer, ANSWER_RENDERERS } from "../../js/answer-input.js";
import { prepareChoiceOptions } from "../../js/answer-options.js";
import * as client from "../../js/true-false.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

const CONTENT = {
  question: "Danmark erklærede Tyskland krig den 9. april 1940.",
  correct: "Falsk",
  review_text: "Tyskland besatte Danmark uden krigserklæring.",
};
const ROW = { answer_format: "true_false", answer_type: "short", content: CONTENT };

// ── Server contract ──────────────────────────────────────────────────────────────────────────────

test("contract: the statement and an option-text key are accepted; the key is content.correct", () => {
  assert.equal(TRUE_FALSE_FORMAT, "true_false");
  assert.deepEqual([...TRUE_FALSE_OPTIONS], ["Sandt", "Falsk"]);
  assert.ok(Object.isFrozen(TRUE_FALSE_OPTIONS));
  assert.deepEqual(parseTrueFalseContent(CONTENT), { statement: CONTENT.question, correct: "Falsk" });
  assert.equal(trueFalseKey(CONTENT), "Falsk");
  assert.equal(trueFalseKey({ question: "Jorden er rund.", correct: "Sandt" }), "Sandt");
  for (const v of ["Sandt", "Falsk"]) assert.equal(isTrueFalseOption(v), true);
  for (const v of ["sandt", "FALSK", " Sandt", "true", "false", "Ja", true, false, 1, 0, null, undefined, ""]) {
    assert.equal(isTrueFalseOption(v), false, JSON.stringify(v));
  }
});

test("contract: anything else is refused with a reason — never served half-built", () => {
  const cases = [
    [null, /Invalid content/],
    ["Sandt", /Invalid content/],
    [[CONTENT], /Invalid content/],
    [{ ...CONTENT, options: ["Sandt", "Falsk"] }, /must not carry options/],
    [{ ...CONTENT, options: null }, /must not carry options/],
    [{ ...CONTENT, question: "" }, /Missing question text/],
    [{ ...CONTENT, question: "   " }, /Missing question text/],
    [{ ...CONTENT, question: 7 }, /Missing question text/],
    [{ question: CONTENT.question }, /needs correct "Sandt" or "Falsk"/],
    [{ ...CONTENT, correct: "sandt" }, /needs correct/],
    [{ ...CONTENT, correct: true }, /needs correct/],
    [{ ...CONTENT, correct: "Ja" }, /needs correct/],
  ];
  for (const [content, reason] of cases) {
    assert.throws(() => parseTrueFalseContent(content), reason, JSON.stringify(content));
    assert.throws(() => trueFalseKey(content), reason);
  }
});

test("authoring check: errors for contract breaks, a warning for a missing explanation, never throws", () => {
  assert.deepEqual(validateTrueFalseContent(CONTENT), { errors: [], warnings: [] });
  assert.deepEqual(validateTrueFalseContent({ question: "Q", correct: "Sandt" }, { review_text: "Fordi." }),
    { errors: [], warnings: [] }, "metadata.review_text counts, as in process-event extractReviewText");
  assert.deepEqual(validateTrueFalseContent({ question: "Q", correct: "Sandt" }).warnings,
    ["review_text is recommended: explain why the statement is true or false"]);
  assert.deepEqual(validateTrueFalseContent({ question: "Q", correct: "Sandt", review_text: "  " }).warnings.length, 1);
  for (const bad of [null, undefined, 3, { question: "Q" }, { question: "Q", correct: "Sandt", options: [] }]) {
    const r = validateTrueFalseContent(bad);
    assert.equal(r.errors.length, 1, JSON.stringify(bad));
    assert.deepEqual(r.warnings, []);
  }
});

// ── Registry ─────────────────────────────────────────────────────────────────────────────────────

test("registry: true_false is classified, has its own wire format and renderer, and is NOT servable", () => {
  const spec = INTERACTION_KINDS.true_false;
  assert.deepEqual({ ...spec }, {
    wireFormat: "true_false", renderer: "true_false", servable: false, base: false, maxShare: 0,
    teacherGraded: false, guessFloor: 0.5,
  });
  assert.ok(Object.isFrozen(spec));
  assert.equal(KIND_ORDER[KIND_ORDER.length - 1], "true_false", "appended: existing tie-breaks unchanged");
  assert.equal(classifyQuestion(ROW), "true_false");
  assert.equal(classifyQuestion({ answer_format: "true_false" }), "true_false");
  assert.equal(isServableKind("true_false"), false);
  assert.equal(servableWireFormat(ROW), null, "never handed out by the v2 mix");
  // Disagreeing stored fields name no kind.
  for (const row of [
    { answer_format: "True_False" }, { answer_format: " true_false" }, { answer_format: "true_false", answer_type: "long" },
    { answer_format: "true_false", answer_type: "Short" }, { answer_format: "true_false", content: { force_text: true } },
    { answer_format: "truefalse" }, { answer_format: "tf" },
  ]) assert.equal(classifyQuestion(row), null, JSON.stringify(row));
});

test("registry: guessFloor is 0.5 for true_false and null (unknown, never 0) for every other kind", () => {
  for (const k of KIND_ORDER) {
    const g = INTERACTION_KINDS[k].guessFloor;
    if (k === "true_false") assert.equal(g, 0.5);
    else assert.equal(g, null, k);
  }
});

test("guessFloor changes no live behaviour: no code outside the registry reads it", () => {
  const hits = [];
  const walk = (dir) => {
    for (const name of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${name}`;
      if (statSync(join(ROOT, rel)).isDirectory()) { walk(rel); continue; }
      if (!/\.(ts|js|mjs|sql)$/.test(name)) continue;
      if (rel === "supabase/functions/_shared/interaction-kinds.ts") continue;
      if (code(read(rel)).includes("guessFloor")) hits.push(rel);
    }
  };
  for (const dir of ["supabase/functions", "js", "supabase/migrations"]) walk(dir);
  for (const f of ["app.js"]) if (code(read(f)).includes("guessFloor")) hits.push(f);
  assert.deepEqual(hits, []);
});

// ── Public payload ───────────────────────────────────────────────────────────────────────────────

test("public payload: only the statement leaves — no key, no options, no explanation", () => {
  const pub = toPublicQuestion({ ...CONTENT, accepted_answers: ["Falsk"] }, "true_false", { domain: "world_war_2", review_text: "x" });
  assert.deepEqual(pub.content, { question: CONTENT.question });
  assert.deepEqual(pub.metadata, { domain: "world_war_2" });
  for (const k of Object.keys(pub.content)) assert.ok(PUBLIC_CONTENT_KEYS.includes(k));
  assert.equal(JSON.stringify(pub).includes("Falsk"), false, "the key value is nowhere in the payload");
  assert.equal(JSON.stringify(pub).includes("Tyskland besatte"), false, "nor the explanation");
  // A row that breaks the contract is refused here — before get-next-question inserts the instance.
  assert.throws(() => toPublicQuestion({ ...CONTENT, correct: "ja" }, "true_false", null), /needs correct/);
  assert.throws(() => toPublicQuestion({ ...CONTENT, options: ["Sandt", "Falsk"] }, "true_false", null), /must not carry options/);
  // Under the deployed v1 (before F-03) a stored true_false row is mapped to "mc" and has no options: skipped,
  // never shown as MC. Since F-03 v1 skips it before that (mapAnswerFormat null).
  assert.throws(() => toPublicQuestion(CONTENT, "mc", null), /MC question missing valid options/);
});

// ── get-next-question and process-event: the routing this kind relies on, unchanged ──────────────

const INDEX_CODE = code(read("supabase/functions/get-next-question/index.ts"));
const fromIndex = (re, sig, plain) => {
  const m = INDEX_CODE.match(re);
  assert.ok(m, `${sig} not found in index.ts`);
  return new Function(`return (${m[0].replace(sig, plain)});`)();
};

test("get-next-question: v1 skips true_false (mapAnswerFormat null since F-03, never \"mc\"); the key is content.correct", () => {
  const mapAnswerFormat = fromIndex(/function mapAnswerFormat\(format: string \| null\) \{[\s\S]*?\n\}/,
    "format: string | null", "format");
  assert.equal(mapAnswerFormat("true_false"), null);
  // normalizeContent as-is (its Match par branch needs createMatchKey, which a true_false row never reaches).
  const src = INDEX_CODE.match(/function normalizeContent\(raw: any, answer_format: string\) \{[\s\S]*?\n\}/);
  assert.ok(src, "normalizeContent not found in index.ts");
  const normalizeContent = new Function("createMatchKey", "parseMatchPairs",
    `return (${src[0].replace("raw: any, answer_format: string", "raw, answer_format")});`)(
    () => { throw new Error("not reached"); }, () => { throw new Error("not reached"); });
  assert.deepEqual(normalizeContent(CONTENT, "true_false"), { question: CONTENT.question, correct: "Falsk" });
  assert.throws(() => normalizeContent(CONTENT, "mc"), /MC question missing valid options/);
  // Insert order on the new-question path: the key is extracted, then the payload builder validates the
  // contract, and only then is the instance inserted — so a bad key is skipped, never stored.
  const at = (s) => INDEX_CODE.indexOf(s);
  assert.ok(at("normalized = normalizeContent(q.content, format);") > 0);
  assert.ok(at("normalized = normalizeContent(q.content, format);") < at("pub = toPublicQuestion(q.content, format, q.metadata, normalized.correct);"));
  assert.ok(at("pub = toPublicQuestion(q.content, format, q.metadata, normalized.correct);") < at("await insertQuestionInstance("));
});

test("process-event: a true_false answer takes the MC path to process_question_attempt, unchanged", () => {
  const pe = code(read("supabase/functions/process-event/index.ts"));
  assert.match(pe, /if \(answerType === "long"\) \{/);
  assert.match(pe, /if \(format\.includes\("text"\)\) \{/);
  assert.match(pe, /if \(format === "match"\) \{/);
  assert.equal("true_false".includes("text"), false, "not the text path");
  assert.equal(pe.includes("true_false"), false, "process-event has no special case for it");
  assert.ok(pe.indexOf('if (format === "match") {') < pe.indexOf("await callProcessQuestionAttempt("));
});

// ── Browser ──────────────────────────────────────────────────────────────────────────────────────

test("renderer: a true_false payload resolves to the true_false renderer; force_text still wins", () => {
  assert.equal(ANSWER_RENDERERS.TRUE_FALSE, "true_false");
  assert.equal(INTERACTION_KINDS.true_false.renderer, ANSWER_RENDERERS.TRUE_FALSE);
  assert.equal(resolveAnswerRenderer({ answer_format: "true_false", content: { question: "Q" } }), "true_false");
  assert.equal(resolveAnswerRenderer({ answer_format: "TRUE_FALSE", content: { question: "Q" } }), "true_false");
  assert.equal(resolveAnswerRenderer(ROW), "true_false");
  assert.equal(resolveAnswerRenderer({ answer_format: "true_false", content: { question: "Q", force_text: true } }), "force_text");
  for (const f of ["truefalse", "tf", "true-false"]) {
    assert.equal(resolveAnswerRenderer({ answer_format: f, content: { question: "Q" } }), "unsupported", f);
  }
  // The legacy padding to four options applies to "mc" only: two answers stay two.
  assert.deepEqual(prepareChoiceOptions(["Sandt", "Falsk"], "true_false"), ["Sandt", "Falsk"]);
});

test("browser: the answers are the server's option texts; the content check matches the payload contract", () => {
  assert.deepEqual([...client.TRUE_FALSE_OPTIONS], [...TRUE_FALSE_OPTIONS]);
  const pub = toPublicQuestion(CONTENT, "true_false", null);
  assert.deepEqual(client.readTrueFalseContent(pub.content), { statement: CONTENT.question });
  for (const bad of [null, undefined, "Q", [], {}, { question: "" }, { question: "  " }, { question: 3 },
    { question: "Q", options: ["Sandt", "Falsk"] }, { question: "Q", options: null }]) {
    assert.equal(client.readTrueFalseContent(bad), null, JSON.stringify(bad));
  }
});

function fakeElement(tagName) {
  const attrs = new Map();
  const listeners = new Map();
  return {
    tagName: tagName.toUpperCase(), id: "", className: "", textContent: "", dataset: {}, children: [],
    disabled: false, focused: 0,
    setAttribute(n, v) { attrs.set(n, String(v)); },
    getAttribute(n) { return attrs.has(n) ? attrs.get(n) : null; },
    removeAttribute(n) { attrs.delete(n); },
    hasAttribute(n) { return attrs.has(n); },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(t, fn) { listeners.set(t, [...(listeners.get(t) ?? []), fn]); },
    focus() { this.focused++; },
    click() { for (const fn of listeners.get("click") ?? []) fn({}); },
    key(key) {
      let prevented = false;
      for (const fn of listeners.get("keydown") ?? []) fn({ key, preventDefault() { prevented = true; } });
      return prevented;
    },
  };
}
const fakeDocument = { createElement: (t) => fakeElement(t) };

test("control: two typed buttons in a labelled group, described by the question", () => {
  const c = client.buildTrueFalseAnswer(fakeDocument, { onSubmit: () => {}, describedBy: "question" });
  assert.equal(c.root.id, "true-false");
  const [instructions, group] = c.root.children;
  assert.equal(instructions.textContent, "Er udsagnet sandt eller falsk?");
  assert.equal(group.getAttribute("role"), "group");
  assert.equal(group.getAttribute("aria-labelledby"), instructions.id);
  assert.deepEqual(c.buttons.map((b) => b.textContent), ["Sandt", "Falsk"]);
  for (const b of c.buttons) {
    assert.equal(b.tagName, "BUTTON");
    assert.equal(b.getAttribute("type"), "button");
    assert.equal(b.getAttribute("aria-pressed"), "false");
    assert.equal(b.getAttribute("aria-describedby"), "question");
  }
  assert.equal(c.selected(), null);
  assert.throws(() => client.buildTrueFalseAnswer(null, { onSubmit: () => {} }), /document is required/);
  assert.throws(() => client.buildTrueFalseAnswer(fakeDocument, {}), /onSubmit is required/);
});

test("control: a click sends the option text and the button once; arrows move focus and send nothing", () => {
  const calls = [];
  const c = client.buildTrueFalseAnswer(fakeDocument, { onSubmit: (a, b) => { calls.push([a, b]); } });
  const [sandt, falsk] = c.buttons;
  assert.equal(sandt.key("ArrowRight"), true);
  assert.equal(falsk.focused, 1);
  assert.equal(falsk.key("ArrowLeft"), true);
  assert.equal(sandt.focused, 1);
  assert.equal(sandt.key("End"), true);
  assert.equal(falsk.key("Home"), true);
  assert.equal(sandt.key("ArrowUp"), true, "already first: handled, no move");
  assert.equal(sandt.key("a"), false, "other keys are left alone (Enter/Space are the button's own)");
  assert.deepEqual(calls, []);
  falsk.click();
  assert.deepEqual(calls, [["Falsk", falsk]]);
  assert.equal(falsk.getAttribute("aria-pressed"), "true");
  assert.equal(c.selected(), "Falsk");
  sandt.click();
  assert.equal(c.choose(0), false);
  assert.equal(calls.length, 1, "one answer per question");
  assert.equal(c.choose(5), false);
});

test("control: accepted answers stay locked; an answer handed back (buttons re-enabled) can be given again", async () => {
  let release;
  const calls = [];
  const c = client.buildTrueFalseAnswer(fakeDocument, {
    onSubmit: (a) => { calls.push(a); for (const b of c.buttons) b.disabled = true; return new Promise((r) => { release = r; }); },
  });
  const [sandt, falsk] = c.buttons;
  sandt.click();
  assert.equal(c.root.getAttribute("aria-busy"), "true");
  falsk.click();
  assert.deepEqual(calls, ["Sandt"], "nothing more while the answer is on its way");
  // Handed back: submitAnswer re-enables the buttons after a network or server error.
  for (const b of c.buttons) b.disabled = false;
  release();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(c.root.hasAttribute("aria-busy"), false);
  assert.equal(sandt.getAttribute("aria-pressed"), "false");
  assert.equal(sandt.focused, 1, "focus returns to the answer");
  falsk.click();
  assert.deepEqual(calls, ["Sandt", "Falsk"]);
  // Accepted: the buttons stay disabled, so the control stays locked.
  release();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(falsk.getAttribute("aria-pressed"), "true");
  sandt.click();
  assert.deepEqual(calls, ["Sandt", "Falsk"]);
});

// ── app.js wiring (source level) ─────────────────────────────────────────────────────────────────

test("app.js: the true_false renderer is built from js/true-false.js; malformed content reaches the visible error", () => {
  const app = code(read("app.js"));
  assert.match(app, /import \{ buildTrueFalseAnswer, readTrueFalseContent \} from "\.\/js\/true-false\.js";/);
  const block = app.slice(app.indexOf("if (renderer === ANSWER_RENDERERS.TRUE_FALSE) {"),
    app.indexOf("if (renderer === ANSWER_RENDERERS.LONG_TEXT) {"));
  assert.match(block, /if \(readTrueFalseContent\(content\)\) \{/);
  assert.match(block, /buildTrueFalseAnswer\(document, \{\s*onSubmit: submitAnswer,\s*describedBy: questionElement\.id,\s*\}\)/);
  assert.match(block, /return true;/);
  assert.match(block, /logError\("INVALID_TRUE_FALSE_CONTENT"/);
  assert.match(app, /if \(renderer === ANSWER_RENDERERS\.UNSUPPORTED \|\| renderer === ANSWER_RENDERERS\.MATCH_PAIRS\s*\|\| renderer === ANSWER_RENDERERS\.TRUE_FALSE\) \{/);
  // The statement gets the quiz's read-aloud player like every question text.
  assert.match(app, /attachReadAloudControl\(questionElement, question\.content\.question, \{ subject: currentSubject \}\);/);
  // Its stylesheet is on the quiz page.
  assert.match(read("index.html"), /<link rel="stylesheet" href="css\/true-false\.css">/);
});
