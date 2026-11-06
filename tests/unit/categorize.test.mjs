// Kategorisering (categorize, F-05): the contract (_shared/categorize.ts), the guess chance, the public
// payload (_shared/question-dto.ts), the registry, the get-next-question and process-event wiring (source
// level), the browser control (js/categorize.js) on a fake DOM, the quiz wiring, and the example content.
//
// Pins: each item's category is AUTHORED and never randomised — only the presentation of the items is
// shuffled; the browser receives the labels and the texts in the shown order and nothing that names an
// item's category; an answer is accepted only as a complete placement in the instance's categories,
// written in the key's form; the kind is built but NOT servable; the control works by buttons (mouse,
// touch, keyboard), announces every placement, refuses an incomplete send visibly, never sends twice, and
// hands a failed send back with the placement kept.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CATEGORIZE_MIN_CATEGORIES, CATEGORIZE_MAX_CATEGORIES, CATEGORIZE_MIN_ITEMS, CATEGORIZE_MAX_ITEMS,
  parseCategorizeContent, validateCategorizeContent, categorizeGuessChance, createCategorizeKey,
  parseCategorizeKey, categorizeLayout, canonicalCategorizeAnswer,
} from "../../supabase/functions/_shared/categorize.ts";
import { toPublicQuestion, PUBLIC_CONTENT_KEYS } from "../../supabase/functions/_shared/question-dto.ts";
import { INTERACTION_KINDS, KIND_ORDER, classifyQuestion, isServableKind, servableWireFormat } from "../../supabase/functions/_shared/interaction-kinds.ts";
import { resolveAnswerRenderer, ANSWER_RENDERERS } from "../../js/answer-input.js";
import * as client from "../../js/categorize.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

const EXAMPLE = JSON.parse(read("tools/stimulus/examples/grundloven-1849-kategorisering.json"));
const CONTENT = EXAMPLE.row.content;
const CATS = CONTENT.categories;
const TEXTS = CONTENT.items.map((i) => i.text);
const seq = (values) => { let i = 0; return () => values[i++ % values.length]; };
// normalize_choice_answer since D-290 G1: lower-cased, whitespace collapsed, punctuation kept.
const normalize = (s) => String(s).normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();

// ── Contract ───────────────────────────────────────────────────────────────────────────────────
test("contract: 2–3 unique labels, 4–8 unique items each in a named category, no empty category; anything else is refused", () => {
  const parsed = parseCategorizeContent(CONTENT);
  assert.deepEqual(parsed.categories, CATS);
  assert.deepEqual(parsed.items.map((i) => i.category), [0, 0, 0, 1, 1, 1]);
  assert.deepEqual([CATEGORIZE_MIN_CATEGORIES, CATEGORIZE_MAX_CATEGORIES, CATEGORIZE_MIN_ITEMS, CATEGORIZE_MAX_ITEMS], [2, 3, 4, 8]);
  const it = (text, category) => ({ text, category });
  const four = [it("a", "A"), it("b", "A"), it("c", "B"), it("d", "B")];
  // Categories may hold different numbers of items (3 + 1 is valid).
  assert.equal(parseCategorizeContent({ categories: ["A", "B"], items: [it("a", "A"), it("b", "A"), it("c", "A"), it("d", "B")] }).items.length, 4);
  const breaks = [
    null, [], {}, { categories: ["A"], items: four }, { categories: ["A", "B", "C", "D"], items: four },
    { categories: ["A", "a"], items: four }, { categories: ["A", ""], items: four }, { categories: ["A", "x".repeat(41)], items: four },
    { categories: ["A", "B"], items: four.slice(0, 3) }, { categories: ["A", "B"], items: [...four, ...four.map((x, i) => it(`e${i}`, "A")), it("z", "B")] },
    { categories: ["A", "B"], items: [...four.slice(0, 3), it("A", "C")] }, { categories: ["A", "B"], items: [...four.slice(0, 3), it("C", "B")].map((x, i) => (i === 3 ? it("a", "B") : x)) },
    { categories: ["A", "B"], items: [...four.slice(0, 3), "d"] }, { categories: ["A", "B"], items: [...four.slice(0, 3), it("", "B")] },
    { categories: ["A", "B"], items: [...four.slice(0, 3), it("x".repeat(81), "B")] },
    { categories: ["A", "B", "C"], items: four }, // C is empty
    { categories: ["A", "B"], items: four, options: ["A", "B"] },
  ];
  for (const b of breaks) assert.throws(() => parseCategorizeContent(b), /categorize:/, JSON.stringify(b)?.slice(0, 80));
});

test("guess chance: 1/kⁿ, or 1/(placements using every category) — computed for the task, not assumed", () => {
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} vs ${b}`);
  close(categorizeGuessChance(4, 2).any, 1 / 16); close(categorizeGuessChance(4, 2).nonEmpty, 1 / 14);
  close(categorizeGuessChance(6, 2).any, 1 / 64); close(categorizeGuessChance(6, 2).nonEmpty, 1 / 62);
  close(categorizeGuessChance(6, 3).any, 1 / 729); close(categorizeGuessChance(6, 3).nonEmpty, 1 / 540);
  close(categorizeGuessChance(8, 3).nonEmpty, 1 / 5796);
  // Brute force for 5 items in 3 categories: count the placements that leave no category empty.
  let onto = 0;
  for (let x = 0; x < 3 ** 5; x++) { const d = new Set(); let v = x; for (let i = 0; i < 5; i++) { d.add(v % 3); v = Math.floor(v / 3); } if (d.size === 3) onto++; }
  close(categorizeGuessChance(5, 3).nonEmpty, 1 / onto);
  assert.throws(() => categorizeGuessChance(3, 2));
  assert.throws(() => categorizeGuessChance(4, 4));
});

test("authoring check: a task a guess solves more often than 1 in 20 is practice; a missing reason is flagged", () => {
  assert.deepEqual(validateCategorizeContent(CONTENT, CONTENT.review_text), { errors: [], warnings: [] });
  const small = { categories: ["A", "B"], items: [{ text: "a", category: "A" }, { text: "b", category: "A" }, { text: "c", category: "B" }, { text: "d", category: "B" }] };
  assert.ok(validateCategorizeContent(small, "x").warnings.some((w) => /1 in 14 .*practice/.test(w)));
  assert.ok(validateCategorizeContent(CONTENT, "").warnings.some((w) => /no review_text/.test(w)));
  assert.ok(validateCategorizeContent(null).errors.length > 0, "never throws");
});

// ── Key: the presentation is shuffled, the facit never ────────────────────────────────────────
test("key: one item:category pair per shown position; items a permutation, categories the AUTHORED ones", () => {
  const parsed = parseCategorizeContent(CONTENT);
  for (let k = 0; k < 300; k++) {
    const key = createCategorizeKey(parsed);
    const pairs = parseCategorizeKey(key, 6, 2);
    assert.ok(pairs, key);
    for (const p of pairs) assert.equal(p.category, parsed.items[p.item].category, "the facit is authored, never drawn");
  }
  assert.equal(createCategorizeKey(parsed, seq([0, 0, 0, 0, 0])), createCategorizeKey(parsed, seq([0, 0, 0, 0, 0])), "an injected source is used as given");
  assert.throws(() => createCategorizeKey(parsed, () => 9), /out of range/);
  assert.throws(() => createCategorizeKey({ categories: ["A", "B"], items: [] }));
  for (const bad of [null, "", "0:0,1:0,2:1", "0:0,1:0,2:1,2:1", "0:0,1:0,2:1,9:1", "0:0,1:0,2:1,3:3", "a:b,c:d,e:f,g:h", "0-0,1-0,2-1,3-1", "10:0,1:0,2:1,3:1"]) {
    assert.equal(parseCategorizeKey(bad), null, String(bad));
  }
  assert.equal(parseCategorizeKey("0:0,1:0,2:1,3:2", 4, 2), null, "a category the task does not have");
});

test("key: shuffles the presentation — over many draws every item is shown first at least once", () => {
  const parsed = parseCategorizeContent(CONTENT);
  const firsts = new Set();
  for (let k = 0; k < 400; k++) firsts.add(parseCategorizeKey(createCategorizeKey(parsed))[0].item);
  assert.equal(firsts.size, 6);
});

test("layout: labels in authored order and the texts in SHOWN order, rebuilt from the key; a stale key is refused", () => {
  const key = "3:1,0:0,5:1,1:0,4:1,2:0";
  assert.deepEqual(categorizeLayout(CONTENT, key), { categories: CATS, items: [TEXTS[3], TEXTS[0], TEXTS[5], TEXTS[1], TEXTS[4], TEXTS[2]] });
  assert.throws(() => categorizeLayout(CONTENT, "3:0,0:0,5:1,1:0,4:1,2:0"), /no longer matches/, "an item's category changed after the instance was drawn");
  assert.throws(() => categorizeLayout(CONTENT, "0:0,1:0,2:0,3:1"), /valid instance key/);
  assert.throws(() => categorizeLayout(CONTENT, null));
});

test("answer: one category per shown item, in the key's form; incomplete or out-of-range is refused; shape only", () => {
  const key = "3:1,0:0,5:1,1:0,4:1,2:0";
  assert.equal(canonicalCategorizeAnswer("[1,0,1,0,1,0]", key), key, "right placement → exactly the key");
  assert.equal(canonicalCategorizeAnswer([0, 0, 1, 0, 1, 0], key), "3:0,0:0,5:1,1:0,4:1,2:0", "a wrong placement is still a valid answer");
  for (const bad of ["", "x", "[1,0,1,0,1]", "[1,0,1,0,1,null]", "[1,0,1,0,1,2]", "[1,0,1,0,1,-1]", "[1,0,1,0,1,0.5]", "{}",
    "[\"1\",0,1,0,1,0]", "[" + "1,".repeat(40) + "1]", null, 5, [[1], 0, 1, 0, 1, 0]]) {
    assert.equal(canonicalCategorizeAnswer(bad, key), null, String(bad));
  }
  assert.equal(canonicalCategorizeAnswer("[0,0,0,0]", "bad"), null);
  // Graded as process_question_attempt does: equal exactly when every item is right.
  assert.equal(normalize(canonicalCategorizeAnswer("[1,0,1,0,1,0]", key)), normalize(key));
  for (let i = 0; i < 6; i++) {
    const a = [1, 0, 1, 0, 1, 0]; a[i] = 1 - a[i];
    assert.notEqual(normalize(canonicalCategorizeAnswer(JSON.stringify(a), key)), normalize(key), `item ${i} wrong`);
  }
});

// ── Payload: no facit leaves ───────────────────────────────────────────────────────────────────
test("payload: content.categorize holds labels and shown texts only — never items, categories per item, key or explanation", () => {
  assert.ok(PUBLIC_CONTENT_KEYS.includes("categorize"));
  const key = "3:1,0:0,5:1,1:0,4:1,2:0";
  const pub = toPublicQuestion({ ...CONTENT, correct: "ignored" }, "categorize", null, key);
  assert.deepEqual(pub.content, { question: CONTENT.question, categorize: { categories: CATS, items: [TEXTS[3], TEXTS[0], TEXTS[5], TEXTS[1], TEXTS[4], TEXTS[2]] } });
  const json = JSON.stringify(pub);
  for (const leak of ['"category"', '"items":[{', '"correct"', '"review_text"', key, "3:1"]) assert.equal(json.includes(leak), false, leak);
  assert.throws(() => toPublicQuestion(CONTENT, "categorize", null, undefined), "no key → row skipped");
});

// ── Registry: built, NOT servable ──────────────────────────────────────────────────────────────
test("registry: categorize is classified, has its own wire format and renderer, is appended last and NOT servable", () => {
  const row = { answer_format: "categorize", answer_type: "short", content: CONTENT };
  assert.equal(classifyQuestion(row), "categorize");
  assert.deepEqual({ ...INTERACTION_KINDS.categorize }, { wireFormat: "categorize", renderer: "categorize", servable: false, base: false, maxShare: 0.15, teacherGraded: false, guessFloor: null });
  assert.equal(KIND_ORDER[KIND_ORDER.length - 1], "categorize", "appended: existing tie-breaks unchanged");
  assert.equal(isServableKind("categorize"), false);
  assert.equal(servableWireFormat(row), null, "the v2 mix never serves it");
  assert.equal(classifyQuestion({ ...row, content: { ...CONTENT, force_text: true } }), null);
  assert.equal(classifyQuestion({ ...row, answer_type: "long" }), null);
  assert.equal(resolveAnswerRenderer({ answer_format: "categorize", content: {} }), ANSWER_RENDERERS.CATEGORIZE);
});

// ── Server wiring (source level) ───────────────────────────────────────────────────────────────
test("get-next-question: the key is drawn once at instance creation; open and repeated rounds read it like Match par", () => {
  const index = code(read("supabase/functions/get-next-question/index.ts"));
  assert.match(index, /if \(answer_format === "categorize"\) \{\s*return \{ question, correct: createCategorizeKey\(parseCategorizeContent\(raw\)\) \};\s*\}/);
  assert.match(index, /const KEYED_FORMATS: ReadonlySet<string> = new Set\(\["match", "order", "categorize"\]\);/);
});

test("process-event: a placement is shape-checked before the RPC and then graded by process_question_attempt like MC", () => {
  const raw = read("supabase/functions/process-event/index.ts");
  assert.match(code(raw), /import \{ canonicalCategorizeAnswer \} from "\.\.\/_shared\/categorize\.ts";/);
  const at = raw.indexOf('if (format === "categorize") {');
  assert.ok(at > 0 && at < raw.indexOf("PATH 3"), "before the RPC path");
  const block = raw.slice(at, raw.indexOf("PATH 3"));
  assert.match(block, /const canonical = canonicalCategorizeAnswer\(answer, correct_answer\)/);
  assert.match(block, /if \(canonical === null\) \{\s*return new Response\(\s*JSON\.stringify\(\{ status: "invalid", error: "Placér alle elementer, før du sender\." \}\)[\s\S]*?status: 400/);
  assert.match(block, /gradedAnswer = canonical/);
});

// ── Browser control on a fake DOM ──────────────────────────────────────────────────────────────
function fakeElement(tagName) {
  const attrs = new Map();
  const listeners = new Map();
  const el = {
    tagName: tagName.toUpperCase(), id: "", className: "", textContent: "", dataset: {}, children: [], parent: null,
    disabled: false, focused: 0,
    setAttribute(n, v) { attrs.set(n, String(v)); },
    getAttribute(n) { return attrs.has(n) ? attrs.get(n) : null; },
    removeAttribute(n) { attrs.delete(n); },
    appendChild(c) {
      if (c.parent) c.parent.children = c.parent.children.filter((x) => x !== c);
      c.parent = el; el.children.push(c); return c;
    },
    addEventListener(t, fn) { listeners.set(t, [...(listeners.get(t) ?? []), fn]); },
    focus() { el.focused++; },
    click() { if (!el.disabled) for (const fn of listeners.get("click") ?? []) fn({}); },
  };
  return el;
}
const fakeDocument = { createElement: (t) => fakeElement(t) };
const LAYOUT = { categories: ["Før 1849", "Efter 1849"], items: ["B", "D", "A", "C"] };

test("browser: readCategorizeLayout accepts the payload contract only", () => {
  assert.deepEqual(client.readCategorizeLayout({ categorize: LAYOUT }), LAYOUT);
  for (const bad of [null, {}, { categorize: null }, { categorize: { categories: ["x"], items: ["a", "b", "c", "d"] } },
    { categorize: { categories: ["x", "y"], items: ["a", "b", "c"] } }, { categorize: { categories: ["x", "X"], items: ["a", "b", "c", "d"] } },
    { categorize: { categories: ["x", "y"], items: ["a", "a", "c", "d"] } }, { categorize: { categories: ["x", "y"], items: ["a", "b", "c", ""] } },
    { categorize: { categories: ["x", "y", "z", "w"], items: ["a", "b", "c", "d"] } }]) {
    assert.equal(client.readCategorizeLayout(bad), null, JSON.stringify(bad));
  }
});

test("browser: instructions, a labelled list, one labelled group per item with a button per category, a live region and Svar", () => {
  const c = client.buildCategorizeAnswer(fakeDocument, { layout: LAYOUT, onSubmit: () => {}, describedBy: "question" });
  const [instructions, list, live, submit] = c.root.children;
  assert.equal(instructions.textContent, "Placér hvert element i den kategori, det hører til.");
  assert.equal(list.tagName, "UL");
  assert.equal(list.getAttribute("aria-labelledby"), "categorize-instructions");
  assert.equal(list.getAttribute("aria-describedby"), "question");
  assert.equal(live.getAttribute("aria-live"), "polite");
  assert.equal(submit.textContent, "Svar");
  assert.deepEqual(list.children.map((li) => li.children[0].children[0].textContent), ["B", "D", "A", "C"], "shown order");
  assert.equal(list.children[0].children[0].className, "categorize-head", "the text heads its item");
  const group = list.children[0].children[1];
  assert.equal(group.getAttribute("role"), "group");
  assert.equal(group.getAttribute("aria-labelledby"), "categorize-item-0");
  assert.deepEqual(c.rows[0].choices.map((b) => [b.textContent, b.getAttribute("type"), b.getAttribute("aria-pressed")]),
    [["Før 1849", "button", "false"], ["Efter 1849", "button", "false"]]);
  assert.equal(c.root.children.some((ch) => /\d+ \/ \d+|antal/i.test(ch.textContent)), false, "no counts per category are shown");
});

test("browser: placing announces it and marks it pressed; moving an item unpresses the old category; Svar sends once", () => {
  const sent = [];
  const c = client.buildCategorizeAnswer(fakeDocument, { layout: LAYOUT, onSubmit: (v) => { sent.push(v); } });
  const live = c.root.children[2];
  c.rows[2].choices[0].click();
  assert.equal(live.textContent, "A: Før 1849");
  assert.equal(c.rows[2].choices[0].getAttribute("aria-pressed"), "true");
  c.rows[2].choices[1].click();
  assert.equal(c.rows[2].choices[0].getAttribute("aria-pressed"), "false", "one category per item");
  assert.equal(c.rows[2].choices[1].getAttribute("aria-pressed"), "true");
  c.rows[2].choices[0].click();
  c.rows[0].choices[1].click(); c.rows[1].choices[1].click(); c.rows[3].choices[0].click();
  assert.deepEqual(c.current(), [1, 1, 0, 0]);
  c.submit.click();
  c.submit.click();
  assert.deepEqual(sent, ["[1,1,0,0]"], "sent once; a second click does nothing");
  assert.equal(c.choose(0, 0), false, "locked after sending");
  assert.equal(c.rows[0].choices[0].disabled, true);
});

test("browser: an incomplete placement is refused visibly — nothing sent, how many are missing, focus on the first", () => {
  const sent = [];
  const c = client.buildCategorizeAnswer(fakeDocument, { layout: LAYOUT, onSubmit: (v) => { sent.push(v); } });
  c.rows[0].choices[0].click(); c.rows[2].choices[1].click();
  assert.equal(c.send(), false);
  assert.equal(c.root.children[2].textContent, "Placér alle elementer, før du sender. 2 mangler.");
  assert.ok(c.rows[1].choices[0].focused >= 1, "focus on the first unplaced item");
  c.rows[1].choices[0].click();
  c.submit.click();
  assert.equal(c.root.children[2].textContent, "Placér det sidste element, før du sender.");
  assert.deepEqual(sent, []);
  assert.equal(c.choose(3, 0), true, "still open");
  c.submit.click();
  assert.deepEqual(sent, ["[0,0,1,0]"]);
  assert.equal(c.choose(9, 0), false);
  assert.equal(client.buildCategorizeAnswer(fakeDocument, { layout: LAYOUT, onSubmit: () => {} }).choose(0, 5), false, "no such category");
});

test("browser: an answer handed back (buttons re-enabled) unlocks with the placement kept; an accepted one stays locked", async () => {
  let release;
  const c = client.buildCategorizeAnswer(fakeDocument, { layout: LAYOUT, onSubmit: () => new Promise((r) => { release = r; }) });
  for (let i = 0; i < 4; i++) c.choose(i, i % 2);
  c.send();
  assert.equal(c.root.getAttribute("aria-busy"), "true");
  c.submit.disabled = false; // submitAnswer re-enables the buttons after a network/server error
  release(); await Promise.resolve(); await Promise.resolve();
  assert.equal(c.root.getAttribute("aria-busy"), null);
  assert.ok(c.submit.focused >= 1);
  assert.deepEqual(c.current(), [0, 1, 0, 1], "placement kept");
  assert.equal(c.choose(0, 1), true, "can be changed again");
  const c2 = client.buildCategorizeAnswer(fakeDocument, { layout: LAYOUT, onSubmit: () => Promise.resolve() });
  for (let i = 0; i < 4; i++) c2.choose(i, 0);
  c2.send(); await Promise.resolve(); await Promise.resolve();
  assert.equal(c2.choose(0, 1), false);
});

test("browser: after a wrong answer the correct placement is stated in the shown texts, grouped by category", () => {
  assert.equal(client.categorizeCorrectionText(LAYOUT, "1:0,3:1,0:0,2:1"), "Den rigtige fordeling — Før 1849: B, A. Efter 1849: D, C.");
  for (const bad of [null, "", "1:0,3:1,0:0", "1:0,3:1,0:0,2:2", "a,b,c,d", "1-0,3-1,0-0,2-1"]) assert.equal(client.categorizeCorrectionText(LAYOUT, bad), null, String(bad));
  assert.equal(client.categorizeCorrectionText(null, "1:0,3:1,0:0,2:1"), null);
});

// ── Quiz wiring (source level) ─────────────────────────────────────────────────────────────────
test("app.js: the categorize renderer is built from js/categorize.js; a wrong answer names the correct placement, never the key", () => {
  const app = code(read("app.js"));
  assert.match(app, /import \{ buildCategorizeAnswer, categorizeCorrectionText, readCategorizeLayout \} from "\.\/js\/categorize\.js";/);
  const block = app.slice(app.indexOf("if (renderer === ANSWER_RENDERERS.CATEGORIZE) {"), app.indexOf("if (renderer === ANSWER_RENDERERS.LONG_TEXT) {"));
  assert.match(block, /const layout = readCategorizeLayout\(content\);/);
  assert.match(block, /onSubmit: submitAnswer,/);
  assert.match(block, /attachReadAloud: attachOptionReadAloudControl,/);
  assert.match(block, /logError\("INVALID_CATEGORIZE_LAYOUT"/);
  const wrong = app.slice(app.indexOf("currentRenderer === ANSWER_RENDERERS.CATEGORIZE && currentCategorizeControl) {"), app.indexOf('feedback.textContent = "Svaret er "'));
  assert.match(wrong, /categorizeCorrectionText\(currentCategorizeControl\.layout, data\.correct_answer\)/);
  assert.match(wrong, /feedback\.textContent = "Ikke helt\. " \+ correctPlacement;/);
  assert.match(app, /currentCategorizeControl = null;/);
  assert.match(app, /\|\| renderer === ANSWER_RENDERERS\.CATEGORIZE\) \{/);
  assert.match(read("index.html"), /<link rel="stylesheet" href="css\/categorize\.css">/);
});

// ── Example content ────────────────────────────────────────────────────────────────────────────
test("example: the Grundloven 1849 task keeps the contract, has a reason, and is evidence-sized (no warnings)", () => {
  assert.equal(EXAMPLE.row.answer_format, "categorize");
  assert.deepEqual(validateCategorizeContent(CONTENT, CONTENT.review_text), { errors: [], warnings: [] });
  for (const t of [CONTENT.question, ...CATS, ...TEXTS, CONTENT.review_text]) {
    assert.equal(/Ã|�|\bae\b|\boe\b/.test(t), false, `Danish text intact: ${t}`);
  }
});
