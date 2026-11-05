// F-01b — the number answer (js/number-answer.js): parsing of what the pupil typed and the control.
//
// Pins: empty is never 0, a whole number is sent as its canonical integer, Danish thousands separators
// only when unambiguous, decimals / plus sign / letters refused with a Danish message, and that every
// value the browser sends is one the server's grading (normalize_number_answer, D-290 G1; TS twin
// _shared/answer-normalize.ts normalizeNumber) maps to itself — so the server grades exactly the integer
// the browser accepted.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  NUMBER_ERRORS, NUMBER_MESSAGES, NUMBER_MAX_LENGTH, NUMBER_INPUT_ATTRIBUTES,
  parseNumberAnswer, buildNumberAnswer,
} from "../../js/number-answer.js";
import { normalizeNumber } from "../../supabase/functions/_shared/answer-normalize.ts";

const ok = (raw, value) => assert.deepEqual(parseNumberAnswer(raw), { ok: true, value }, JSON.stringify(raw));
const bad = (raw, error) => {
  const r = parseNumberAnswer(raw);
  assert.equal(r.ok, false, JSON.stringify(raw));
  assert.equal(r.error, error, JSON.stringify(raw));
  assert.equal(r.message, NUMBER_MESSAGES[error]);
};

test("empty and whitespace-only are invalid, never 0", () => {
  bad("", NUMBER_ERRORS.EMPTY);
  bad("   ", NUMBER_ERRORS.EMPTY);
  bad(" \t", NUMBER_ERRORS.EMPTY);
  bad(undefined, NUMBER_ERRORS.EMPTY);
  bad(null, NUMBER_ERRORS.EMPTY);
  bad(5, NUMBER_ERRORS.EMPTY);
});

test("whole numbers: 0, positive, negative, leading zeros, surrounding spaces", () => {
  ok("0", "0");
  ok("1849", "1849");
  ok("-50", "-50");
  ok("  1849  ", "1849");
  ok("007", "7");
  ok("-007", "-7");
  ok("-0", "0");
  ok("000", "0");
  ok("−50", "-50"); // U+2212 minus, folded like the server
  ok("–50", "-50");
});

test("Danish thousands separators only when every group has exactly three digits", () => {
  ok("1 849", "1849");
  ok("1 849", "1849");
  ok("1 849", "1849");
  ok("1.849", "1849");
  ok("12 345 678", "12345678");
  ok("1.000.000", "1000000");
  ok("-1 849", "-1849");
  bad("1 84", NUMBER_ERRORS.GROUPING);
  bad("18 49", NUMBER_ERRORS.GROUPING);
  bad("1 849.000", NUMBER_ERRORS.GROUPING); // two kinds of separator
  bad("1849 000 0", NUMBER_ERRORS.GROUPING);
});

test("decimals are refused, not guessed", () => {
  bad("12.34", NUMBER_ERRORS.DECIMAL);
  bad("1849,0", NUMBER_ERRORS.DECIMAL);
  bad("1849,5", NUMBER_ERRORS.DECIMAL);
  bad("1,849", NUMBER_ERRORS.DECIMAL);
  bad("1.8490", NUMBER_ERRORS.DECIMAL);
  bad("1 849,5", NUMBER_ERRORS.DECIMAL);
  bad("-0,5", NUMBER_ERRORS.DECIMAL);
});

test("plus sign, letters and other characters are refused", () => {
  bad("+5", NUMBER_ERRORS.PLUS);
  bad("abc", NUMBER_ERRORS.NOT_A_NUMBER);
  bad("18a9", NUMBER_ERRORS.NOT_A_NUMBER);
  bad("5 kr", NUMBER_ERRORS.NOT_A_NUMBER);
  bad("1/2", NUMBER_ERRORS.NOT_A_NUMBER);
  bad("-", NUMBER_ERRORS.NOT_A_NUMBER);
  bad("--5", NUMBER_ERRORS.NOT_A_NUMBER);
  bad("1e3", NUMBER_ERRORS.NOT_A_NUMBER);
  bad("0x10", NUMBER_ERRORS.NOT_A_NUMBER);
  bad("١٨٤٩", NUMBER_ERRORS.NOT_A_NUMBER); // non-ASCII digits: the server reads [0-9] only
});

test("a leading år / i / i år and one trailing full stop or ! never change the number (F-01 QA)", () => {
  ok("år 1849", "1849");
  ok("År 1849", "1849");
  ok("i 1849", "1849");
  ok("I år 1849", "1849");
  ok("i år 1 849", "1849");
  ok("1849.", "1849");
  ok("1849!", "1849");
  ok("  år 1849.  ", "1849");
  ok("1.849.", "1849");
  ok("95.", "95");
  ok("år -50", "-50");
  // Only those forms: everything else around the number is still refused with a message.
  bad("ca. 1849", NUMBER_ERRORS.NOT_A_NUMBER);
  bad("1849 teser", NUMBER_ERRORS.NOT_A_NUMBER);
  bad("år", NUMBER_ERRORS.NOT_A_NUMBER);
  bad("år1849", NUMBER_ERRORS.NOT_A_NUMBER);
  bad("1849,", NUMBER_ERRORS.NOT_A_NUMBER);
  bad("1849..", NUMBER_ERRORS.NOT_A_NUMBER);
  bad("1849.!", NUMBER_ERRORS.NOT_A_NUMBER);
  bad("i i 1849", NUMBER_ERRORS.NOT_A_NUMBER);
  bad(".", NUMBER_ERRORS.NOT_A_NUMBER);
  bad("1849,5.", NUMBER_ERRORS.DECIMAL);
  bad("år +5", NUMBER_ERRORS.PLUS);
});

test("very long input is refused", () => {
  ok("9".repeat(NUMBER_MAX_LENGTH), "9".repeat(NUMBER_MAX_LENGTH));
  bad("9".repeat(NUMBER_MAX_LENGTH + 1), NUMBER_ERRORS.TOO_LONG);
  bad("1".repeat(10000), NUMBER_ERRORS.TOO_LONG);
});

test("every message is Danish prose with real æøå, none empty", () => {
  for (const e of Object.values(NUMBER_ERRORS)) assert.ok(NUMBER_MESSAGES[e] && NUMBER_MESSAGES[e].length > 5, e);
  assert.match(NUMBER_MESSAGES[NUMBER_ERRORS.EMPTY], /før/);
  assert.equal(/Ã|�/.test(Object.values(NUMBER_MESSAGES).join(" ")), false);
});

test("agreement with the server: every accepted value is a fixed point of the server's normalisation", () => {
  const inputs = ["0", "-0", "1849", "-50", "007", "1 849", "1 849", "1.849", "12 345 678", "−50", "9".repeat(20)];
  for (const raw of inputs) {
    const r = parseNumberAnswer(raw);
    assert.equal(r.ok, true, raw);
    assert.match(r.value, /^(0|-?[1-9][0-9]*)$/, raw);
    assert.equal(normalizeNumber(r.value), r.value, `server normalises ${r.value} to itself`);
  }
  // The forms with words or a full stop around the number are sent as a canonical integer as well.
  for (const raw of ["år 1849", "i år 1849", "1849.", "1849!", "1.849."]) {
    const r = parseNumberAnswer(raw);
    assert.equal(r.ok, true, raw);
    assert.equal(r.value, "1849", raw);
    assert.equal(normalizeNumber(r.value), r.value, raw);
  }
  // Where the browser accepts the raw text the server could also read, both agree on the number.
  for (const raw of ["1849", "-50", "007", "1 849", "−50", "-0"]) {
    assert.equal(normalizeNumber(raw), parseNumberAnswer(raw).value, raw);
  }
  // What the server would read differently is refused here, never sent: a plus sign never matches on
  // the server, and a decimal is not a whole number.
  assert.equal(normalizeNumber("+5"), null);
  assert.equal(parseNumberAnswer("+5").ok, false);
  assert.equal(normalizeNumber("1849,5"), "1849.5");
  assert.equal(parseNumberAnswer("1849,5").ok, false);
});

// ── The control ─────────────────────────────────────────────────────────────────────────────────
function fakeElement(tagName) {
  const attrs = new Map();
  const listeners = new Map();
  return {
    tagName: tagName.toUpperCase(), value: "", id: "", className: "", textContent: "", style: {},
    focused: 0, readOnly: false, disabled: false, onclick: null,
    setAttribute(n, v) { attrs.set(n, String(v)); },
    getAttribute(n) { return attrs.has(n) ? attrs.get(n) : null; },
    removeAttribute(n) { attrs.delete(n); },
    hasAttribute(n) { return attrs.has(n); },
    addEventListener(t, fn) { listeners.set(t, [...(listeners.get(t) ?? []), fn]); },
    focus() { this.focused++; },
    type(v) { this.value = v; for (const fn of listeners.get("input") ?? []) fn({}); },
    key(key, extra = {}) {
      let prevented = false;
      const ev = { key, isComposing: false, ...extra, preventDefault() { prevented = true; } };
      for (const fn of listeners.get("keydown") ?? []) fn(ev);
      return prevented;
    },
  };
}
const doc = { createElement: (t) => fakeElement(t) };

test("the field: attributes, label, an empty alert line, and the Svar button", () => {
  const { input, hint, button } = buildNumberAnswer(doc, { onSubmit: () => {}, describedBy: "question" });
  for (const [n, v] of Object.entries(NUMBER_INPUT_ATTRIBUTES)) assert.equal(input.getAttribute(n), v, n);
  assert.equal(input.getAttribute("aria-describedby"), "question number-answer-hint");
  assert.equal(hint.getAttribute("role"), "alert");
  assert.equal(hint.textContent, "");
  assert.equal(button.textContent, "Svar");
  assert.throws(() => buildNumberAnswer(doc, {}), /onSubmit/);
  assert.throws(() => buildNumberAnswer(null, { onSubmit: () => {} }), /document/);
});

test("empty: nothing is sent, the error is shown and announced, typing clears it, then it sends", () => {
  const sent = [];
  const { input, hint, button } = buildNumberAnswer(doc, { onSubmit: (v) => sent.push(v) });
  assert.equal(button.onclick(), false);
  assert.equal(input.key("Enter"), true);
  assert.deepEqual(sent, []);
  assert.equal(hint.textContent, NUMBER_MESSAGES[NUMBER_ERRORS.EMPTY]);
  assert.equal(input.getAttribute("aria-invalid"), "true");
  assert.ok(input.focused > 0);
  input.type("1 849");
  assert.equal(hint.textContent, "");
  assert.equal(input.hasAttribute("aria-invalid"), false);
  input.key("Enter");
  assert.deepEqual(sent, ["1849"]);
});

test("Enter and the button send the same canonical value through onSubmit", () => {
  const sent = [];
  const a = buildNumberAnswer(doc, { onSubmit: (v, b) => sent.push([v, b === a.button]) });
  a.input.value = "1.849";
  a.button.onclick();
  const b = buildNumberAnswer(doc, { onSubmit: (v, btn) => sent.push([v, btn === b.button]) });
  b.input.value = "1849";
  b.input.key("Enter");
  assert.deepEqual(sent, [["1849", true], ["1849", true]]);
});

test("while a send is pending, a repeated Enter or click sends nothing more; a hand-back re-opens the field", async () => {
  const sent = [];
  let release;
  const control = buildNumberAnswer(doc, {
    onSubmit: (v, btn) => { sent.push(v); btn.disabled = true; return new Promise((r) => { release = () => { btn.disabled = false; r(); }; }); },
  });
  control.input.value = "-50";
  control.input.key("Enter");
  control.input.key("Enter");
  control.button.onclick();
  assert.deepEqual(sent, ["-50"]);
  assert.equal(control.input.readOnly, true);
  assert.equal(control.input.getAttribute("aria-busy"), "true");
  release(); // submitAnswer re-enabled the button: the answer was handed back (network error)
  await new Promise((r) => setImmediate(r));
  assert.equal(control.input.readOnly, false);
  assert.equal(control.input.value, "-50");
  control.input.key("Enter");
  assert.deepEqual(sent, ["-50", "-50"]);
});

test("Enter that confirms an IME composition is not a submit", () => {
  const sent = [];
  const { input } = buildNumberAnswer(doc, { onSubmit: (v) => sent.push(v) });
  input.value = "5";
  assert.equal(input.key("Enter", { isComposing: true }), false);
  assert.deepEqual(sent, []);
});
