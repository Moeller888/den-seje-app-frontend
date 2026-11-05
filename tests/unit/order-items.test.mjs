// Rækkefølge / tidslinje (order_items, F-04): the contract (_shared/order-items.ts), the public payload
// (_shared/question-dto.ts), the registry, the get-next-question and process-event wiring (source level),
// the browser control (js/order-items.js) on a fake DOM, and the quiz wiring.
//
// Pins: the facit is the AUTHORED order and is never randomised — only the presentation is shuffled
// (never shown already solved); the browser receives the texts in the shown order and nothing that names
// a rank; an answer is accepted only as a permutation of the shown positions, written in the key's form;
// the kind is built but NOT servable; the control works by buttons (mouse, touch, keyboard), announces
// every move, never sends twice, and hands a failed send back with the order kept.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ORDER_MIN_ITEMS, ORDER_MAX_ITEMS, ORDER_SEQUENCES, parseOrderContent, validateOrderContent,
  createOrderKey, parseOrderKey, orderLayout, canonicalOrderAnswer,
} from "../../supabase/functions/_shared/order-items.ts";
import { toPublicQuestion, PUBLIC_CONTENT_KEYS } from "../../supabase/functions/_shared/question-dto.ts";
import { INTERACTION_KINDS, classifyQuestion, isServableKind, servableWireFormat } from "../../supabase/functions/_shared/interaction-kinds.ts";
import { resolveAnswerRenderer, ANSWER_RENDERERS } from "../../js/answer-input.js";
import * as client from "../../js/order-items.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

const ITEMS = ["Grundloven underskrives (1849)", "Krigen mod Preussen og Østrig (1864)", "Kvinder får valgret til Rigsdagen (1915)", "Genforeningen (1920)"];
const CONTENT = { question: "Sæt begivenhederne i den rækkefølge, de skete.", items: ITEMS, sequence: "chronological", review_text: "1849, 1864, 1915, 1920." };
const seq = (values) => { let i = 0; return () => values[i++ % values.length]; };

// ── Contract ───────────────────────────────────────────────────────────────────────────────────
test("contract: 3–6 unique texts in the CORRECT order and a known sequence kind; anything else is refused", () => {
  assert.deepEqual(parseOrderContent(CONTENT), { items: ITEMS, sequence: "chronological" });
  assert.deepEqual([...ORDER_SEQUENCES], ["chronological", "process", "logical"]);
  assert.equal(ORDER_MIN_ITEMS, 3);
  assert.equal(ORDER_MAX_ITEMS, 6);
  const breaks = [
    null, [], {}, { ...CONTENT, items: ITEMS.slice(0, 2) }, { ...CONTENT, items: [...ITEMS, "a", "b", "c"] },
    { ...CONTENT, items: [...ITEMS.slice(0, 3), ITEMS[0].toUpperCase()] }, { ...CONTENT, items: ["a", "b", ""] },
    { ...CONTENT, items: ["a", "b", 3] }, { ...CONTENT, items: ["a", "b", "x".repeat(81)] },
    { ...CONTENT, sequence: undefined }, { ...CONTENT, sequence: "causal" }, { ...CONTENT, options: ["a", "b"] },
  ];
  for (const b of breaks) assert.throws(() => parseOrderContent(b), /order:/, JSON.stringify(b)?.slice(0, 60));
});

test("authoring check: band guidance, < 4 items is practice, a missing reason, and causal wording on a time order", () => {
  assert.deepEqual(validateOrderContent(CONTENT, 2, CONTENT.review_text), { errors: [], warnings: [] });
  const three = validateOrderContent({ ...CONTENT, items: ITEMS.slice(0, 3) }, 2, "x");
  assert.ok(three.warnings.some((w) => /band 2 recommends 4-4/.test(w)));
  assert.ok(three.warnings.some((w) => /fewer than 4 items/.test(w)));
  assert.ok(validateOrderContent(CONTENT, 2, "").warnings.some((w) => /no review_text/.test(w)));
  assert.ok(validateOrderContent(CONTENT, 2, "Grundloven førte til krigen i 1864.").warnings.some((w) => /causal wording/.test(w)));
  assert.deepEqual(validateOrderContent({ ...CONTENT, sequence: "process" }, 2, "Derfor kommer trin 2 efter trin 1.").warnings, []);
  assert.ok(validateOrderContent(null).errors.length > 0, "never throws");
});

// ── Key: the presentation is shuffled, the facit never ────────────────────────────────────────
test("key: a permutation of display positions, never the identity, from the crypto source by default", () => {
  for (let n = ORDER_MIN_ITEMS; n <= ORDER_MAX_ITEMS; n++) {
    for (let k = 0; k < 200; k++) {
      const key = createOrderKey(n);
      const pos = parseOrderKey(key, n);
      assert.ok(pos, key);
      assert.notDeepEqual(pos, Array.from({ length: n }, (_, i) => i), "never shown already solved");
    }
  }
  // An injected source is used as given (deterministic for tests).
  assert.equal(createOrderKey(4, seq([0, 0, 0])), createOrderKey(4, seq([0, 0, 0])));
  assert.throws(() => createOrderKey(2));
  assert.throws(() => createOrderKey(7));
  assert.throws(() => createOrderKey(4, () => 9), /out of range/);
  for (const bad of [null, "", "0,1", "0,0,1,2", "0,1,2,9", "a,b,c,d", "0,1,2,3,4,5,6", "10,1,2", "0;1;2"]) {
    assert.equal(parseOrderKey(bad), null, String(bad));
  }
  assert.equal(parseOrderKey("1,2,0,3", 3), null, "wrong size");
});

test("the identity draw is rotated, so the same source always gives the same non-identity key", () => {
  // Fisher–Yates with j = i at every step keeps the identity; it must come out rotated.
  const identitySource = (max) => max - 1;
  const key = createOrderKey(4, identitySource);
  assert.notEqual(key, "0,1,2,3");
  assert.deepEqual(parseOrderKey(key, 4).slice().sort(), [0, 1, 2, 3]);
});

test("layout: the texts in SHOWN order, rebuilt from the key alone; the authored order is the facit", () => {
  const key = "2,0,3,1"; // rank 0 shown at position 2, rank 1 at 0, rank 2 at 3, rank 3 at 1
  assert.deepEqual(orderLayout(CONTENT, key), { items: [ITEMS[1], ITEMS[3], ITEMS[0], ITEMS[2]], sequence: "chronological" });
  // Reading the shown positions in the key's order gives back the authored (correct) order.
  const shown = orderLayout(CONTENT, key).items;
  assert.deepEqual(key.split(",").map(Number).map((p) => shown[p]), ITEMS);
  assert.throws(() => orderLayout(CONTENT, "0,1,2"), /valid instance key/);
  assert.throws(() => orderLayout(CONTENT, null));
});

test("answer: only a permutation of the shown positions, in the key's form; shape only, never a verdict", () => {
  const key = "2,0,3,1";
  assert.equal(canonicalOrderAnswer("[2,0,3,1]", key), "2,0,3,1");
  assert.equal(canonicalOrderAnswer([0, 1, 2, 3], key), "0,1,2,3", "a wrong order is still a valid answer");
  for (const bad of ["", "x", "[2,0,3]", "[2,0,3,3]", "[2,0,3,4]", "[2,0,3,-1]", "[2,0,3,1.5]", "{}", "[\"2\",0,3,1]",
    "[" + "1,".repeat(40) + "1]", null, 5, [[2], 0, 3, 1]]) {
    assert.equal(canonicalOrderAnswer(bad, key), null, String(bad));
  }
  assert.equal(canonicalOrderAnswer("[0,1,2]", "bad"), null);
  // Graded as process_question_attempt does (normalize_choice_answer since D-290 G1: lower-cased,
  // whitespace collapsed, punctuation kept): equal only when right.
  const strip = (s) => s.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
  assert.equal(strip(canonicalOrderAnswer("[2,0,3,1]", key)), strip(key));
  assert.notEqual(strip(canonicalOrderAnswer("[0,2,3,1]", key)), strip(key));
});

// ── Payload: no facit leaves ───────────────────────────────────────────────────────────────────
test("payload: content.order holds the shown texts and the sequence kind — never items, key or explanation", () => {
  assert.ok(PUBLIC_CONTENT_KEYS.includes("order"));
  const key = "2,0,3,1";
  const pub = toPublicQuestion({ ...CONTENT, correct: "ignored" }, "order", null, key);
  assert.deepEqual(pub.content, { question: CONTENT.question, order: { items: [ITEMS[1], ITEMS[3], ITEMS[0], ITEMS[2]], sequence: "chronological" } });
  const json = JSON.stringify(pub);
  for (const leak of ['"items":["Grundloven', '"correct"', '"review_text"', '"2,0,3,1"', key]) assert.equal(json.includes(leak), false, leak);
  assert.throws(() => toPublicQuestion(CONTENT, "order", null, undefined), "no key → row skipped");
  assert.throws(() => toPublicQuestion({ ...CONTENT, items: ["a"] }, "order", null, key));
});

// ── Registry: built, NOT servable ──────────────────────────────────────────────────────────────
test("registry: order is classified, has its own wire format and renderer, and is NOT servable", () => {
  const row = { answer_format: "order", answer_type: "short", content: CONTENT };
  assert.equal(classifyQuestion(row), "order_items");
  assert.deepEqual({ ...INTERACTION_KINDS.order_items }, { wireFormat: "order", renderer: "order_items", servable: false, base: false, maxShare: 0.15, teacherGraded: false, guessFloor: null });
  // guessFloor null: the chance of a random order depends on the item count (1/(n! − 1) with the identity
  // excluded from the shown order), so it is not a fixed property of the kind (interaction-kinds.ts).
  assert.equal(isServableKind("order_items"), false);
  assert.equal(servableWireFormat(row), null, "the v2 mix never serves it");
  assert.equal(classifyQuestion({ ...row, content: { ...CONTENT, force_text: true } }), null);
  assert.equal(classifyQuestion({ ...row, answer_type: "long" }), null);
  assert.equal(resolveAnswerRenderer({ answer_format: "order", content: {} }), ANSWER_RENDERERS.ORDER_ITEMS);
});

// ── Server wiring (source level) ───────────────────────────────────────────────────────────────
test("get-next-question: the key is drawn once at instance creation; open and repeated rounds read it like Match par", () => {
  const index = code(read("supabase/functions/get-next-question/index.ts"));
  assert.match(index, /if \(answer_format === "order"\) \{\s*return \{ question, correct: createOrderKey\(parseOrderContent\(raw\)\.items\.length\) \};\s*\}/);
  assert.match(index, /const KEYED_FORMATS: ReadonlySet<string> = new Set\(\["match", "order"\]\);/);
  // v1 maps "order" to "mc" (unknown format) and the row, having no options, is skipped — never shown as MC.
  assert.match(index, /function mapAnswerFormat\(format: string \| null\) \{[\s\S]*?return "mc";\s*\}/);
});

test("process-event: an order is shape-checked before the RPC and then graded by process_question_attempt like MC", () => {
  const raw = read("supabase/functions/process-event/index.ts");
  const pe = code(raw);
  assert.match(pe, /import \{ canonicalOrderAnswer \} from "\.\.\/_shared\/order-items\.ts";/);
  const block = raw.slice(raw.indexOf('if (format === "order") {'), raw.indexOf("PATH 3"));
  assert.match(block, /const canonical = canonicalOrderAnswer\(answer, correct_answer\)/);
  assert.match(block, /if \(canonical === null\) \{\s*return new Response\(\s*JSON\.stringify\(\{ status: "invalid"[\s\S]*?status: 400/);
  assert.match(block, /gradedAnswer = canonical/);
  // The shape check runs before the RPC path, which grades the canonical string.
  assert.ok(raw.indexOf('if (format === "order") {') > 0 && raw.indexOf('if (format === "order") {') < raw.indexOf("PATH 3"));
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
const LAYOUT = { items: ["B", "D", "A", "C"], sequence: "chronological" };
const shownTexts = (c) => c.root.children[1].children.map((li) => li.children[0].textContent);

test("browser: readOrderLayout accepts the payload contract only", () => {
  assert.deepEqual(client.readOrderLayout({ order: LAYOUT }), LAYOUT);
  for (const bad of [null, {}, { order: null }, { order: { items: ["a", "b"], sequence: "chronological" } },
    { order: { items: ["a", "a", "b"], sequence: "chronological" } }, { order: { items: ["a", "b", "c"], sequence: "x" } },
    { order: { items: ["a", "b", ""], sequence: "process" } }]) {
    assert.equal(client.readOrderLayout(bad), null, JSON.stringify(bad));
  }
});

test("browser: instructions by sequence kind, a labelled list, a live region and the Svar button", () => {
  const c = client.buildOrderAnswer(fakeDocument, { layout: LAYOUT, onSubmit: () => {}, describedBy: "question" });
  const [instructions, list, live, submit] = c.root.children;
  assert.equal(instructions.textContent, "Sæt begivenhederne i den rækkefølge, de skete. Det første øverst.");
  assert.equal(list.tagName, "OL");
  assert.equal(list.getAttribute("aria-labelledby"), "order-instructions");
  assert.equal(list.getAttribute("aria-describedby"), "question");
  assert.equal(live.getAttribute("aria-live"), "polite");
  assert.equal(submit.textContent, "Svar");
  assert.deepEqual(shownTexts(c), ["B", "D", "A", "C"]);
  // Every move button is a typed, named button; the edges are disabled.
  assert.equal(c.rows[0].up.getAttribute("type"), "button");
  assert.equal(c.rows[0].up.getAttribute("aria-label"), "Flyt op: B");
  assert.equal(c.rows[0].up.disabled, true);
  assert.equal(c.rows[3].down.disabled, true);
  for (const seqKind of ["process", "logical"]) {
    const other = client.buildOrderAnswer(fakeDocument, { layout: { ...LAYOUT, sequence: seqKind }, onSubmit: () => {} });
    assert.equal(other.root.children[0].textContent, client.ORDER_TEXT[seqKind]);
  }
});

test("browser: moving announces the new place, keeps focus on the moved item, and Svar sends the order once", () => {
  const sent = [];
  const c = client.buildOrderAnswer(fakeDocument, { layout: LAYOUT, onSubmit: (v) => { sent.push(v); } });
  const live = c.root.children[2];
  // Put A (shown at position 2) first: up, up.
  c.rows[2].up.click();
  assert.equal(live.textContent, "A er nu nummer 2 af 4");
  assert.ok(c.rows[2].up.focused >= 1, "focus stays on the moved item's button");
  c.rows[2].up.click();
  assert.equal(live.textContent, "A er nu nummer 1 af 4");
  assert.equal(c.rows[2].up.disabled, true, "at the top");
  assert.ok(c.rows[2].down.focused >= 1, "at the edge focus moves to the other button");
  assert.deepEqual(shownTexts(c), ["A", "B", "D", "C"]);
  c.rows[3].up.click(); // C above D
  assert.deepEqual(shownTexts(c), ["A", "B", "C", "D"]);
  assert.deepEqual(c.current(), [2, 0, 3, 1]);
  c.submit.click();
  c.submit.click();
  assert.deepEqual(sent, ["[2,0,3,1]"], "sent once; a second click does nothing");
  assert.equal(c.move(0, 1), false, "locked after sending");
});

test("browser: an answer handed back (buttons re-enabled) unlocks with the order kept; an accepted one stays locked", async () => {
  let release;
  const c = client.buildOrderAnswer(fakeDocument, { layout: LAYOUT, onSubmit: () => new Promise((r) => { release = r; }) });
  c.rows[2].up.click();
  c.send();
  assert.equal(c.root.getAttribute("aria-busy"), "true");
  c.submit.disabled = false; // submitAnswer re-enables the buttons after a network/server error
  release(); await Promise.resolve(); await Promise.resolve();
  assert.equal(c.root.getAttribute("aria-busy"), null);
  assert.ok(c.submit.focused >= 1);
  assert.deepEqual(shownTexts(c), ["B", "A", "D", "C"], "order kept");
  assert.equal(c.move(2, -1), true, "can be changed again");
  // Accepted: submitAnswer leaves the buttons disabled → stays locked.
  const c2 = client.buildOrderAnswer(fakeDocument, { layout: LAYOUT, onSubmit: () => Promise.resolve() });
  c2.send(); await Promise.resolve(); await Promise.resolve();
  assert.equal(c2.move(0, 1), false);
});

test("browser: after a wrong answer the correct order is stated in the shown texts", () => {
  assert.equal(client.orderCorrectionText(LAYOUT, "2,0,3,1"), "Den rigtige rækkefølge: A → B → C → D");
  for (const bad of [null, "", "2,0,3", "2,0,3,9", "2,2,3,1", "a,b,c,d"]) assert.equal(client.orderCorrectionText(LAYOUT, bad), null, String(bad));
  assert.equal(client.orderCorrectionText(null, "2,0,3,1"), null);
});

// ── Quiz wiring (source level) ─────────────────────────────────────────────────────────────────
test("app.js: the order renderer is built from js/order-items.js; a wrong answer names the correct order, never the key", () => {
  const app = code(read("app.js"));
  assert.match(app, /import \{ buildOrderAnswer, orderCorrectionText, readOrderLayout \} from "\.\/js\/order-items\.js";/);
  const block = app.slice(app.indexOf("if (renderer === ANSWER_RENDERERS.ORDER_ITEMS) {"), app.indexOf("if (renderer === ANSWER_RENDERERS.LONG_TEXT) {"));
  assert.match(block, /const layout = readOrderLayout\(content\);/);
  assert.match(block, /onSubmit: submitAnswer,/);
  assert.match(block, /attachReadAloud: attachOptionReadAloudControl,/);
  assert.match(block, /logError\("INVALID_ORDER_LAYOUT"/);
  // Without an explanation: the correct order in words, never "Svaret er 2,0,3,1".
  const wrong = app.slice(app.indexOf("currentRenderer === ANSWER_RENDERERS.ORDER_ITEMS && currentOrderControl) {"), app.indexOf('feedback.textContent = "Svaret er "'));
  assert.match(wrong, /orderCorrectionText\(currentOrderControl\.layout, data\.correct_answer\)/);
  assert.match(wrong, /feedback\.textContent = "Ikke helt\. " \+ correctOrder;/);
  assert.match(app, /currentOrderControl = null;/);
  assert.match(app, /\|\| renderer === ANSWER_RENDERERS\.ORDER_ITEMS\) \{/);
  assert.match(read("index.html"), /<link rel="stylesheet" href="css\/order-items\.css">/);
});
