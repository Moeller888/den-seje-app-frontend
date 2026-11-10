// js/teacher-answer-display.js — what student-detail.html shows the teacher for one answered task.
// Rækkefølge / Kategorisering: the authored facit and right/wrong, never the raw position list.
// Every other format: exactly the strings the page showed before.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectAnswerFormat,
  formatOrderFacit,
  formatCategorizeFacit,
  describeReviewItem,
  ORDER_ANSWER_NOT_SHOWN,
  CATEGORIZE_ANSWER_NOT_SHOWN,
} from "../../js/teacher-answer-display.js";

const ORDER = {
  question: "Sæt begivenhederne i den rækkefølge, de skete",
  items: ["Grundloven", "Første Verdenskrig", "Genforeningen"],
  sequence: "chronological",
  correct: "-",
};

const CATEGORIZE = {
  question: "Hvad hører til enevælden, og hvad til demokratiet?",
  categories: ["Enevælde", "Demokrati"],
  items: [
    { text: "Kongeloven", category: "Enevælde" },
    { text: "Frie valg", category: "Demokrati" },
    { text: "Kongen har al magt", category: "Enevælde" },
    { text: "Grundloven", category: "Demokrati" },
  ],
  correct: "-",
};

// The page's code before this change, verbatim, as the reference for every other format.
function legacy(content, userAnswer) {
  return {
    question: content.question ?? content.text ?? "(mangler spørgsmål)",
    answer: userAnswer ?? "(intet svar)",
    facit: content.answer ?? content.correct ?? content.correct_answer ?? "(intet facit)",
  };
}

// ── format detection ─────────────────────────────────────────────────────────────────────────

test("answer_format decides when it is a string", () => {
  assert.equal(detectAnswerFormat("order", {}), "order");
  assert.equal(detectAnswerFormat("ORDER", null), "order");
  assert.equal(detectAnswerFormat("categorize", undefined), "categorize");
  // A declared other format wins over an order-shaped content.
  assert.equal(detectAnswerFormat("mc", ORDER), null);
  assert.equal(detectAnswerFormat("text", CATEGORIZE), null);
});

test("without answer_format the content's shape decides", () => {
  assert.equal(detectAnswerFormat(null, ORDER), "order");
  assert.equal(detectAnswerFormat(undefined, CATEGORIZE), "categorize");
  assert.equal(detectAnswerFormat("", ORDER), "order");
  // Items without a sequence are not Rækkefølge.
  assert.equal(detectAnswerFormat(null, { items: ["a", "b"] }), null);
  // An item whose category is not a listed category is not Kategorisering.
  assert.equal(detectAnswerFormat(null, { categories: ["A"], items: [{ text: "x", category: "B" }] }), null);
  for (const c of [null, undefined, 5, "tekst", [], {}, { question: "Hvad?", options: ["a"], correct: "a" }]) {
    assert.equal(detectAnswerFormat(null, c), null, JSON.stringify(c));
  }
});

// ── facit text ───────────────────────────────────────────────────────────────────────────────

test("Rækkefølge facit: the authored items, numbered, in order", () => {
  assert.equal(formatOrderFacit(ORDER), "1. Grundloven → 2. Første Verdenskrig → 3. Genforeningen");
});

test("Kategorisering facit: the items grouped by category, both in authored order", () => {
  assert.equal(formatCategorizeFacit(CATEGORIZE),
    "Enevælde: Kongeloven, Kongen har al magt; Demokrati: Frie valg, Grundloven");
  assert.equal(formatCategorizeFacit({ categories: ["A", "B"], items: [{ text: "x", category: "A" }] }),
    "A: x; B: (ingen)");
});

test("malformed content gives no facit text and never throws", () => {
  const bad = [null, undefined, 0, "x", [], {}, { items: null }, { items: [] }, { items: ["a", 2] },
    { items: ["a", ""] }, { categories: "A", items: [] }, { categories: ["A"], items: [null] },
    { categories: ["A"], items: [{ text: "", category: "A" }] }, { categories: [""], items: [{ text: "x", category: "" }] }];
  for (const c of bad) {
    assert.equal(formatOrderFacit(c), null, JSON.stringify(c));
    assert.equal(formatCategorizeFacit(c), null, JSON.stringify(c));
  }
});

// ── the whole row ────────────────────────────────────────────────────────────────────────────

test("Rækkefølge row: right/wrong from was_correct, the note, the facit — never the raw positions", () => {
  const wrong = describeReviewItem({ content: ORDER, answerFormat: "order", userAnswer: "2,0,1", wasCorrect: false });
  assert.deepEqual(wrong, {
    question: ORDER.question,
    answer: `Forkert (rettet automatisk). ${ORDER_ANSWER_NOT_SHOWN}`,
    facit: "1. Grundloven → 2. Første Verdenskrig → 3. Genforeningen",
  });
  const right = describeReviewItem({ content: ORDER, answerFormat: "order", userAnswer: "[2,0,1]", wasCorrect: true });
  assert.equal(right.answer, `Rigtigt (rettet automatisk). ${ORDER_ANSWER_NOT_SHOWN}`);
  const unknown = describeReviewItem({ content: ORDER, answerFormat: "order", userAnswer: "2,0,1", wasCorrect: null });
  assert.equal(unknown.answer, ORDER_ANSWER_NOT_SHOWN);
  assert.equal(ORDER_ANSWER_NOT_SHOWN, "Elevens rækkefølge vises ikke her endnu.");
  for (const r of [wrong, right, unknown]) {
    assert.ok(!r.answer.includes("2,0,1") && !r.answer.includes("["), r.answer);
  }
});

test("Kategorisering row (shape-detected): right/wrong, the note, the grouped facit", () => {
  const r = describeReviewItem({ content: CATEGORIZE, answerFormat: null, userAnswer: "3:1,0:0,2:0,1:1", wasCorrect: true });
  assert.deepEqual(r, {
    question: CATEGORIZE.question,
    answer: `Rigtigt (rettet automatisk). ${CATEGORIZE_ANSWER_NOT_SHOWN}`,
    facit: "Enevælde: Kongeloven, Kongen har al magt; Demokrati: Frie valg, Grundloven",
  });
  assert.equal(CATEGORIZE_ANSWER_NOT_SHOWN, "Elevens placering af punkterne vises ikke her endnu.");
});

test("declared order/categorize with malformed content: old facit lookup, still no raw answer", () => {
  const o = describeReviewItem({ content: { question: "Defekt", correct: "-" }, answerFormat: "order", userAnswer: "[1,0]", wasCorrect: false });
  assert.deepEqual(o, { question: "Defekt", answer: `Forkert (rettet automatisk). ${ORDER_ANSWER_NOT_SHOWN}`, facit: "-" });
  const c = describeReviewItem({ content: null, answerFormat: "categorize", userAnswer: "0:1", wasCorrect: undefined });
  assert.deepEqual(c, { question: "(mangler spørgsmål)", answer: CATEGORIZE_ANSWER_NOT_SHOWN, facit: "(intet facit)" });
});

test("mc, number, text and long text rows are exactly what the page showed before", () => {
  const cases = [
    [{ question: "Hvad er 2 + 2?", options: ["3", "4", "5"], correct: "4" }, "mc", "4"],
    [{ question: "Hvad er 3 · 4?", answer: "12" }, "number", "12"],
    [{ question: "Stav til: øl & æbler", answer: "øl & æbler" }, "text", "øl & æbler"],
    [{ text: "Forklar hvorfor", correct_answer: "Fordi" }, "text", "Fordi …"],
    [{ question: "Forklar" }, "text", "Et langt svar"],
    [{ question: "Nul som facit", answer: 0 }, "number", "0"],
    [{}, "mc", null],
    [{ question: "Uden format", correct: "a" }, null, "a"],
    [{ question: "Uden format", correct: "a" }, undefined, undefined],
  ];
  for (const [content, answerFormat, userAnswer] of cases) {
    for (const wasCorrect of [true, false, null, undefined]) {
      assert.deepEqual(describeReviewItem({ content, answerFormat, userAnswer, wasCorrect }), legacy(content, userAnswer),
        JSON.stringify([content, answerFormat, userAnswer, wasCorrect]));
    }
  }
});

test("missing or non-object content never throws and uses the old placeholders", () => {
  for (const content of [null, undefined, 7, "tekst", []]) {
    assert.deepEqual(describeReviewItem({ content, answerFormat: "mc", userAnswer: "x" }),
      { question: "(mangler spørgsmål)", answer: "x", facit: "(intet facit)" });
  }
  assert.deepEqual(describeReviewItem(), { question: "(mangler spørgsmål)", answer: "(intet svar)", facit: "(intet facit)" });
});
