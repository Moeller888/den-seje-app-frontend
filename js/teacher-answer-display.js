// What the teacher's per-pupil page (student-detail.html) shows for one answered task: the question,
// the pupil's answer and the facit. Pure functions with no DOM or network access, so the Node unit suite
// tests exactly what the page runs (tests/unit/teacher-answer-display.test.mjs).
//
// WHY THIS EXISTS
// Rækkefølge (answer_format "order", F-04) and Kategorisering ("categorize", F-05) are graded
// automatically. Their stored answer is a list of DISPLAY positions ("2,0,3,1" / "3:1,0:0,2:1,1:0") that
// only means something together with the per-instance key (question_instances.correct_answer), and the
// teacher's client may not read that key (D-209 / E2). Their content carries correct: "-". So for these
// two formats the page shows:
//   FACIT  the authored facit from the question's own content (content.items in order / grouped by
//          content.categories) — content the teacher's client reads already;
//   SVAR   whether the pupil was right (question_instances.was_correct) and a plain statement that the
//          pupil's exact order / placement is not shown yet — never the raw position list.
// Every other format (mc, number, text, long text) gets exactly the strings the page showed before.
//
// FORMAT DETECTION
// questions.answer_format decides when it is a string. Only when it is missing does the content's shape
// decide (order: items = strings + a sequence; categorize: categories + items with a category). Content
// that does not have the expected shape never crashes the page: the facit falls back to the old lookup.

export const ORDER_ANSWER_NOT_SHOWN = "Elevens rækkefølge vises ikke her endnu.";
export const CATEGORIZE_ANSWER_NOT_SHOWN = "Elevens placering af punkterne vises ikke her endnu.";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function orderItems(content) {
  if (!isPlainObject(content)) return null;
  const items = content.items;
  if (!Array.isArray(items) || items.length === 0) return null;
  if (!items.every(isNonEmptyString)) return null;
  return items;
}

function categorizeParts(content) {
  if (!isPlainObject(content)) return null;
  const categories = content.categories;
  const items = content.items;
  if (!Array.isArray(categories) || categories.length === 0) return null;
  if (!categories.every(isNonEmptyString)) return null;
  if (!Array.isArray(items) || items.length === 0) return null;
  for (const item of items) {
    if (!isPlainObject(item)) return null;
    if (!isNonEmptyString(item.text)) return null;
    if (typeof item.category !== "string" || !categories.includes(item.category)) return null;
  }
  return { categories, items };
}

// "order" | "categorize" | null (null = any other format: the page keeps its old behaviour).
export function detectAnswerFormat(answerFormat, content) {
  if (typeof answerFormat === "string" && answerFormat.trim() !== "") {
    const format = answerFormat.trim().toLowerCase();
    if (format === "order") return "order";
    if (format === "categorize") return "categorize";
    return null;
  }
  if (orderItems(content) !== null && isPlainObject(content) && typeof content.sequence === "string") {
    return "order";
  }
  if (categorizeParts(content) !== null) return "categorize";
  return null;
}

// "1. A → 2. B → 3. C", or null when content.items is not a list of texts.
export function formatOrderFacit(content) {
  const items = orderItems(content);
  if (items === null) return null;
  return items.map((text, i) => `${i + 1}. ${text}`).join(" → ");
}

// "Årsag: a, b; Virkning: c", categories in their authored order, items in their authored order;
// null when the content does not have that shape.
export function formatCategorizeFacit(content) {
  const parts = categorizeParts(content);
  if (parts === null) return null;
  return parts.categories
    .map((category) => {
      const texts = parts.items.filter((item) => item.category === category).map((item) => item.text);
      return `${category}: ${texts.length > 0 ? texts.join(", ") : "(ingen)"}`;
    })
    .join("; ");
}

function legacyQuestion(content) {
  const c = isPlainObject(content) ? content : {};
  return c.question ?? c.text ?? "(mangler spørgsmål)";
}

function legacyFacit(content) {
  const c = isPlainObject(content) ? content : {};
  return c.answer ?? c.correct ?? c.correct_answer ?? "(intet facit)";
}

function autoGradedAnswer(wasCorrect, notShown) {
  if (wasCorrect === true) return `Rigtigt (rettet automatisk). ${notShown}`;
  if (wasCorrect === false) return `Forkert (rettet automatisk). ${notShown}`;
  return notShown;
}

// { question, answer, facit } for one row. `content` is the parsed questions.content, `answerFormat`
// questions.answer_format, `userAnswer` question_instances.user_answer, `wasCorrect`
// question_instances.was_correct. Any of them may be missing.
export function describeReviewItem({ content, answerFormat, userAnswer, wasCorrect } = {}) {
  const question = legacyQuestion(content);
  const format = detectAnswerFormat(answerFormat, content);

  if (format === "order") {
    return {
      question,
      answer: autoGradedAnswer(wasCorrect, ORDER_ANSWER_NOT_SHOWN),
      facit: formatOrderFacit(content) ?? legacyFacit(content),
    };
  }
  if (format === "categorize") {
    return {
      question,
      answer: autoGradedAnswer(wasCorrect, CATEGORIZE_ANSWER_NOT_SHOWN),
      facit: formatCategorizeFacit(content) ?? legacyFacit(content),
    };
  }
  return {
    question,
    answer: userAnswer ?? "(intet svar)",
    facit: legacyFacit(content),
  };
}
