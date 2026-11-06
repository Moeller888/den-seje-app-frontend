// Kategorisering (categorize, F-05) — the quiz control where the pupil places 4–8 items in 2–3 categories.
// Server contract: supabase/functions/_shared/categorize.ts. The browser receives only the category labels
// and the item texts in the instance's SHOWN order; it never knows an item's category and never decides
// correctness. It sends one category index per shown item, e.g. "[1,0,1,0]".
//
// HOW A PUPIL ANSWERS (the same for mouse, touch and keyboard — every control is a real <button>)
//   * each item is a labelled group with one button per category (≥ 44 px); pressing one places the item
//     there (aria-pressed), pressing another moves it; nothing is dragged, so it works on a small screen,
//     with a switch device and with a screen reader;
//   * every placement is announced in a polite live region: "Kongeloven fra 1665: Enevælden";
//   * "Svar" sends once, and only when every item is placed — otherwise it says how many are missing and
//     sends nothing; the control locks while the answer is on its way;
//   * if the answer is handed back (network or server error), the control unlocks with the placement kept.
// No counts per category are shown: they would give the answer away in part (see the guess chance in the
// server contract).
//
// The document is injected so the control can be unit-tested without a browser.

export const CATEGORIZE_TEXT = Object.freeze({
  instructions: "Placér hvert element i den kategori, det hører til.",
  submit: "Svar",
  placed: (text, category) => `${text}: ${category}`,
  missing: (count) => (count === 1
    ? "Placér det sidste element, før du sender."
    : `Placér alle elementer, før du sender. ${count} mangler.`),
});

const MIN_CATEGORIES = 2;
const MAX_CATEGORIES = 3;
const MIN_ITEMS = 4;
const MAX_ITEMS = 8;

const uniqueTexts = (list) => new Set(list.map((t) => t.trim().toLowerCase())).size === list.length;
const nonEmptyTexts = (list) => list.every((t) => typeof t === "string" && t.trim().length > 0);

// The layout from the question payload, or null when it breaks the contract (2–3 unique labels, 4–8
// unique non-empty item texts). The caller shows the visible error for null.
export function readCategorizeLayout(content) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;
  const layout = content.categorize;
  if (!layout || typeof layout !== "object" || Array.isArray(layout)) return null;
  const { categories, items } = layout;
  if (!Array.isArray(categories) || categories.length < MIN_CATEGORIES || categories.length > MAX_CATEGORIES) return null;
  if (!Array.isArray(items) || items.length < MIN_ITEMS || items.length > MAX_ITEMS) return null;
  if (!nonEmptyTexts(categories) || !nonEmptyTexts(items)) return null;
  if (!uniqueTexts(categories) || !uniqueTexts(items)) return null;
  return { categories: [...categories], items: [...items] };
}

// After a wrong answer: the correct placement in words, from the layout and the key the server revealed
// ("item:category" per shown position). null when the key does not fit the layout.
export function categorizeCorrectionText(layout, key) {
  if (!layout || !Array.isArray(layout.items) || !Array.isArray(layout.categories) || typeof key !== "string") return null;
  const parts = key.split(",");
  if (parts.length !== layout.items.length) return null;
  const categoryOf = [];
  for (const p of parts) {
    const m = /^(\d):(\d)$/.exec(p);
    if (!m || Number(m[2]) >= layout.categories.length) return null;
    categoryOf.push(Number(m[2]));
  }
  const groups = layout.categories.map((label, c) => {
    const members = layout.items.filter((_, i) => categoryOf[i] === c);
    return members.length > 0 ? `${label}: ${members.join(", ")}.` : null;
  }).filter((g) => g !== null);
  return "Den rigtige fordeling — " + groups.join(" ");
}

export function buildCategorizeAnswer(doc, { layout, onSubmit, describedBy = null, attachReadAloud = null, readAloudContext = undefined } = {}) {
  if (!doc || typeof doc.createElement !== "function") throw new Error("buildCategorizeAnswer: a document is required");
  if (typeof onSubmit !== "function") throw new Error("buildCategorizeAnswer: onSubmit is required");
  if (!layout || !Array.isArray(layout.items) || !Array.isArray(layout.categories)) {
    throw new Error("buildCategorizeAnswer: a layout is required");
  }

  const n = layout.items.length;
  // placement[i] = the category index chosen for the item shown at position i, or null.
  const placement = Array.from({ length: n }, () => null);

  const root = doc.createElement("div");
  root.className = "categorize";
  root.id = "categorize";

  const instructions = doc.createElement("p");
  instructions.id = "categorize-instructions";
  instructions.className = "categorize-instructions";
  instructions.textContent = CATEGORIZE_TEXT.instructions;
  root.appendChild(instructions);

  const list = doc.createElement("ul");
  list.className = "categorize-list";
  list.setAttribute("aria-labelledby", instructions.id);
  if (describedBy) list.setAttribute("aria-describedby", describedBy);
  root.appendChild(list);

  const live = doc.createElement("p");
  live.className = "categorize-live";
  live.setAttribute("aria-live", "polite");
  live.setAttribute("role", "status");
  root.appendChild(live);

  const submit = doc.createElement("button");
  submit.setAttribute("type", "button");
  submit.className = "submit-btn categorize-submit";
  submit.textContent = CATEGORIZE_TEXT.submit;
  root.appendChild(submit);

  let locked = false;
  const rows = layout.items.map((text, position) => {
    const li = doc.createElement("li");
    li.className = "categorize-item";
    li.dataset.position = String(position);
    // The text and its read-aloud button share one line; the category buttons go below.
    const head = doc.createElement("div");
    head.className = "categorize-head";
    const label = doc.createElement("span");
    label.className = "categorize-text";
    label.id = `categorize-item-${position}`;
    label.textContent = text;
    head.appendChild(label);
    li.appendChild(head);
    const group = doc.createElement("div");
    group.className = "categorize-choices";
    group.setAttribute("role", "group");
    group.setAttribute("aria-labelledby", label.id);
    const choices = layout.categories.map((category, c) => {
      const b = doc.createElement("button");
      b.setAttribute("type", "button");
      b.className = "categorize-choice";
      b.dataset.category = String(c);
      b.textContent = category;
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => { choose(position, c); });
      group.appendChild(b);
      return b;
    });
    li.appendChild(group);
    if (typeof attachReadAloud === "function") {
      try { attachReadAloud(head, text, readAloudContext); } catch (_e) { /* fail-soft: the item stays */ }
    }
    list.appendChild(li);
    return { li, label, choices, text };
  });

  function render() {
    rows.forEach((r, position) => {
      r.choices.forEach((b, c) => {
        const on = placement[position] === c;
        b.setAttribute("aria-pressed", on ? "true" : "false");
        b.className = on ? "categorize-choice is-selected" : "categorize-choice";
        b.disabled = locked;
      });
      r.li.className = placement[position] === null ? "categorize-item" : "categorize-item is-placed";
    });
    submit.disabled = locked;
  }

  // Places the item shown at `position` in category `c`. False when nothing changed.
  function choose(position, c) {
    if (locked) return false;
    if (!Number.isInteger(position) || position < 0 || position >= n) return false;
    if (!Number.isInteger(c) || c < 0 || c >= layout.categories.length) return false;
    placement[position] = c;
    render();
    live.textContent = CATEGORIZE_TEXT.placed(rows[position].text, layout.categories[c]);
    return true;
  }

  const settle = () => {
    root.removeAttribute("aria-busy");
    // submitAnswer re-enables the answer buttons only when the answer was NOT accepted.
    if (submit.disabled) return;
    locked = false;
    render();
    if (typeof submit.focus === "function") submit.focus();
  };

  function send() {
    if (locked) return false;
    const missing = placement.filter((c) => c === null).length;
    if (missing > 0) {
      // Fail loud, send nothing: the pupil sees and hears how many are left; focus goes to the first one.
      live.textContent = CATEGORIZE_TEXT.missing(missing);
      const first = rows[placement.indexOf(null)].choices[0];
      if (first && typeof first.focus === "function") first.focus();
      return false;
    }
    locked = true;
    render();
    const pending = onSubmit(JSON.stringify(placement), submit);
    if (pending && typeof pending.then === "function") {
      root.setAttribute("aria-busy", "true");
      pending.then(settle, settle);
    }
    return true;
  }
  submit.addEventListener("click", () => { send(); });

  render();
  return { root, rows, submit, choose, send, current: () => [...placement] };
}
