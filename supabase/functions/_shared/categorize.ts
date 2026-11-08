// Kategorisering (categorize, F-05): the pupil places 4–8 items in 2–3 categories ("årsag / virkning",
// "før / efter 1849", "vedvarende / ikke-vedvarende", "støtter / modsiger påstanden"). This file is the SERVER
// contract for the kind — stored content, the per-instance key, the browser layout and the shape of an
// answer. It decides nothing about rewards and does not grade: correctness is decided by
// public.process_question_attempt exactly as for multiple choice, Match par and Rækkefølge ("GRADING").
//
// THE FACIT IS NEVER RANDOMISED
// Which category an item belongs to is AUTHORED (content.items[i].category) and reviewed with the content.
// Only the PRESENTATION of the items is shuffled, once per instance, so the authored order (often grouped by
// category) gives nothing away; the categories keep their authored order. The browser never receives the
// category of any item — only the item texts in display order and the category labels.
//
// STORED CONTENT (questions row: answer_format "categorize", answer_type "short")
//   content.question     string, the task ("Hvilke kendetegn hører til enevælden, og hvilke til …?")
//   content.categories   CATEGORIZE_MIN_CATEGORIES..CATEGORIZE_MAX_CATEGORIES unique, non-empty labels
//                        (≤ 40 chars), in the order they are shown
//   content.items        CATEGORIZE_MIN_ITEMS..CATEGORIZE_MAX_ITEMS objects { text, category }: text unique,
//                        non-empty (≤ 80 chars); category = one of content.categories (exact label). Every
//                        category holds at least one item. Categories MAY hold different numbers of items.
//   content.options      must be ABSENT (get-next-question's v1 path maps unknown formats to "mc"; without
//                        options the row is skipped, never shown as multiple choice)
//   review_text          recommended: WHY the items belong where they do (the feedback after a wrong answer)
//
// THE KEY (question_instances.correct_answer, server-only)
//   "3:1,0:0,2:1,1:0" = display position 0 shows authored item 3, whose category is 1; position 1 shows
// item 0 (category 0); … One "item:category" pair per display position. The key carries the facit, so it
// never leaves the server before the pupil has answered (as for every format); the layout is rebuilt from
// its item part alone.
//
// GRADING
// The browser sends one category index per DISPLAY position as JSON, e.g. [1,0,1,0]. canonicalCategorizeAnswer()
// checks only the SHAPE — every position placed, every index a category — and writes it in the key's form
// with the key's item part: "3:1,0:0,2:1,1:0". process-event hands that string to process_question_attempt,
// which compares it with the key through normalize_choice_answer (since D-290 G1: lower-cased, whitespace
// collapsed, punctuation kept — the two strings must match exactly, which the shared canonical form
// guarantees exactly when every item is placed right) and awards exactly as for MC: ALL OR NOTHING, one
// reward path. A malformed or incomplete answer is refused before the RPC: nothing is recorded and nothing
// is awarded.
//
// GUESSING (categorizeGuessChance): a pupil placing every item at random is right with probability 1/kⁿ
// (k categories, n items); one who also knows that no category is empty, 1/S(n,k) where S counts the
// placements that use every category. 2 × 4: 1/16 (1/14); 2 × 6: 1/64 (1/62); 3 × 6: 1/729 (1/540).
// These are FLOORS for a pupil who knows nothing. Partial knowledge raises the chance steeply: a pupil sure of
// 4 of 6 items in 2 categories guesses the last 2 with 1/4. A category count shown on screen would cut the
// chance further (2 × 6 split 3+3 → 1/20); this kind never shows counts.
//
// Pure TypeScript with no Deno or network imports, so the Node unit suite tests exactly what the Edge
// Functions run.

export const CATEGORIZE_MIN_CATEGORIES = 2;
export const CATEGORIZE_MAX_CATEGORIES = 3;
export const CATEGORIZE_MIN_ITEMS = 4;
export const CATEGORIZE_MAX_ITEMS = 8;
export const CATEGORIZE_MAX_TEXT_LENGTH = 80;
export const CATEGORIZE_MAX_LABEL_LENGTH = 40;
// Authoring: a task a pure guess solves more often than this is practice, not evidence. 1/20 matches
// Rækkefølge, where 4 items (1/24) is the evidence size: here 2 categories × 4 items (1/14) is practice,
// 2 × 5 (1/30) and up is evidence.
export const CATEGORIZE_EVIDENCE_GUESS_LIMIT = 1 / 20;

export type CategorizeItem = { text: string; category: number };
export type CategorizeContent = { categories: string[]; items: CategorizeItem[] };
export type CategorizeLayout = { categories: string[]; items: string[] };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// The stored content with each item's category as an index into categories, or a thrown Error naming the
// contract break.
export function parseCategorizeContent(rawContent: unknown): CategorizeContent {
  if (!isPlainObject(rawContent)) throw new Error("categorize: content must be an object");
  if (rawContent.options !== undefined) throw new Error("categorize: content.options must be absent");
  const cats = rawContent.categories;
  if (!Array.isArray(cats) || cats.length < CATEGORIZE_MIN_CATEGORIES || cats.length > CATEGORIZE_MAX_CATEGORIES) {
    throw new Error(`categorize: content.categories must hold ${CATEGORIZE_MIN_CATEGORIES}-${CATEGORIZE_MAX_CATEGORIES} labels`);
  }
  const categories: string[] = [];
  for (const c of cats) {
    if (typeof c !== "string" || c.trim().length === 0) throw new Error("categorize: every category must be a non-empty label");
    if (c.trim().length > CATEGORIZE_MAX_LABEL_LENGTH) throw new Error(`categorize: a category label is longer than ${CATEGORIZE_MAX_LABEL_LENGTH} characters`);
    categories.push(c.trim());
  }
  if (new Set(categories.map((c) => c.toLowerCase())).size !== categories.length) {
    throw new Error("categorize: category labels must be unique");
  }
  const raw = rawContent.items;
  if (!Array.isArray(raw) || raw.length < CATEGORIZE_MIN_ITEMS || raw.length > CATEGORIZE_MAX_ITEMS) {
    throw new Error(`categorize: content.items must hold ${CATEGORIZE_MIN_ITEMS}-${CATEGORIZE_MAX_ITEMS} items`);
  }
  const items: CategorizeItem[] = [];
  for (const it of raw) {
    if (!isPlainObject(it)) throw new Error("categorize: every item must be { text, category }");
    const text = it.text;
    if (typeof text !== "string" || text.trim().length === 0) throw new Error("categorize: every item needs non-empty text");
    if (text.trim().length > CATEGORIZE_MAX_TEXT_LENGTH) throw new Error(`categorize: an item is longer than ${CATEGORIZE_MAX_TEXT_LENGTH} characters`);
    const category = typeof it.category === "string" ? categories.indexOf(it.category.trim()) : -1;
    if (category < 0) throw new Error("categorize: every item's category must be one of content.categories");
    items.push({ text: text.trim(), category });
  }
  if (new Set(items.map((i) => i.text.toLowerCase())).size !== items.length) {
    throw new Error("categorize: item texts must be unique");
  }
  for (let c = 0; c < categories.length; c++) {
    if (!items.some((i) => i.category === c)) throw new Error("categorize: every category must hold at least one item");
  }
  return { categories, items };
}

// The chance that a pure guess is right: { any } when every placement is equally likely (1/kⁿ),
// { nonEmpty } when the pupil also knows no category is empty (1/surjections). Throws on sizes outside
// the contract.
export function categorizeGuessChance(itemCount: number, categoryCount: number): { any: number; nonEmpty: number } {
  if (!Number.isInteger(itemCount) || itemCount < CATEGORIZE_MIN_ITEMS || itemCount > CATEGORIZE_MAX_ITEMS
    || !Number.isInteger(categoryCount) || categoryCount < CATEGORIZE_MIN_CATEGORIES || categoryCount > CATEGORIZE_MAX_CATEGORIES) {
    throw new Error("categorizeGuessChance: size outside the contract");
  }
  const binom = (n: number, r: number): number => { let v = 1; for (let i = 1; i <= r; i++) v = (v * (n - r + i)) / i; return v; };
  let surjections = 0;
  for (let j = 0; j <= categoryCount; j++) surjections += (j % 2 === 0 ? 1 : -1) * binom(categoryCount, j) * (categoryCount - j) ** itemCount;
  return { any: 1 / categoryCount ** itemCount, nonEmpty: 1 / surjections };
}

// Authoring check: errors are contract breaks (row skipped); warnings are review prompts. Never throws.
export function validateCategorizeContent(rawContent: unknown, reviewText?: unknown): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  let parsed: CategorizeContent | null = null;
  try { parsed = parseCategorizeContent(rawContent); } catch (e) { errors.push((e as Error).message); }
  if (parsed) {
    const chance = categorizeGuessChance(parsed.items.length, parsed.categories.length).nonEmpty;
    if (chance > CATEGORIZE_EVIDENCE_GUESS_LIMIT) {
      warnings.push(`categorize: a pure guess is right 1 in ${Math.round(1 / chance)} — use as practice, not as evidence (add items)`);
    }
    if (typeof reviewText !== "string" || reviewText.trim().length === 0) {
      warnings.push("categorize: no review_text — a wrong answer would get the correct placement without the reason");
    }
  }
  return { errors, warnings };
}

export type RandomInt = (maxExclusive: number) => number;

export const cryptoRandomInt: RandomInt = (maxExclusive) => {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 256) {
    throw new Error("cryptoRandomInt: range must be 1..256");
  }
  const limit = 256 - (256 % maxExclusive); // rejection sampling: no modulo bias
  const buf = new Uint8Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % maxExclusive;
  }
};

type KeyPair = { item: number; category: number };
const formatKey = (pairs: readonly KeyPair[]): string => pairs.map((p) => `${p.item}:${p.category}`).join(",");

// A fresh key for an instance: a Fisher–Yates shuffle of the item presentation, with each shown item's
// authored category. The identity order is allowed here (nothing is "solved" by the order alone).
export function createCategorizeKey(content: CategorizeContent, randomInt: RandomInt = cryptoRandomInt): string {
  const n = content?.items?.length;
  if (!Number.isInteger(n) || n < CATEGORIZE_MIN_ITEMS || n > CATEGORIZE_MAX_ITEMS) {
    throw new Error("createCategorizeKey: invalid item count");
  }
  const shown = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) throw new Error("createCategorizeKey: random source out of range");
    [shown[i], shown[j]] = [shown[j], shown[i]];
  }
  return formatKey(shown.map((item) => ({ item, category: content.items[item].category })));
}

// The key as pairs per display position, or null when it is not one: item indexes a permutation of
// 0..n-1, categories 0..k-1 (k omitted: any up to the maximum), n in range (itemCount omitted: any).
export function parseCategorizeKey(key: unknown, itemCount?: number, categoryCount?: number): KeyPair[] | null {
  if (typeof key !== "string" || key.length > 4 * CATEGORIZE_MAX_ITEMS) return null;
  const parts = key.split(",");
  if (parts.length < CATEGORIZE_MIN_ITEMS || parts.length > CATEGORIZE_MAX_ITEMS) return null;
  if (itemCount !== undefined && parts.length !== itemCount) return null;
  const maxCat = categoryCount ?? CATEGORIZE_MAX_CATEGORIES;
  const out: KeyPair[] = [];
  for (const p of parts) {
    const m = /^(\d):(\d)$/.exec(p);
    if (!m) return null;
    const item = Number(m[1]);
    const category = Number(m[2]);
    if (category >= maxCat) return null;
    out.push({ item, category });
  }
  const items = out.map((p) => p.item).sort((a, b) => a - b);
  return items.every((v, i) => v === i) ? out : null;
}

// What the browser may see: the category labels and the item texts in display order — never a category of
// an item. Throws when the content or the key is unusable, or the key's categories disagree with the
// content (a stale key after an edit), so the caller skips the row.
export function categorizeLayout(rawContent: unknown, key: unknown): CategorizeLayout {
  const { categories, items } = parseCategorizeContent(rawContent);
  const pairs = parseCategorizeKey(key, items.length, categories.length);
  if (pairs === null) throw new Error("Categorize question has no valid instance key");
  if (pairs.some((p) => items[p.item].category !== p.category)) {
    throw new Error("Categorize question's instance key no longer matches its content");
  }
  return { categories: [...categories], items: pairs.map((p) => items[p.item].text) };
}

// The pupil's placement in the key's canonical form, or null when it is not one category index per
// display position. Accepts the JSON string the browser sends or the parsed array. Shape only.
export function canonicalCategorizeAnswer(answer: unknown, key: unknown): string | null {
  const pairs = parseCategorizeKey(key);
  if (pairs === null) return null;
  let parsed: unknown = answer;
  if (typeof answer === "string") {
    if (answer.length > 64) return null;
    try { parsed = JSON.parse(answer); } catch { return null; }
  }
  if (!Array.isArray(parsed) || parsed.length !== pairs.length) return null;
  // Every category holds at least one item (the contract), so the key's highest category is the last one:
  // an index above it names no category on screen.
  const categoryCount = Math.max(...pairs.map((p) => p.category)) + 1;
  for (const c of parsed) {
    if (!Number.isInteger(c) || c < 0 || c >= categoryCount) return null;
  }
  return formatKey(pairs.map((p, i) => ({ item: p.item, category: parsed[i] as number })));
}
