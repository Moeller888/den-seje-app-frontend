// Rækkefølge / tidslinje (order_items, F-04): the pupil puts 3–6 items in the right order. This file is
// the SERVER contract for the kind — stored content, the per-instance key, the browser layout and the
// shape of an answer. It decides nothing about rewards and does not grade: correctness is decided by
// public.process_question_attempt exactly as for multiple choice and Match par ("GRADING" below).
//
// THE FACIT IS NEVER RANDOMISED (owner, 2026-11-05)
// The correct order is the AUTHORED order of content.items — fixed by the subject, reviewed with the
// content. Only the PRESENTATION is shuffled, once per instance: the instance stores where each item was
// SHOWN, so a due or repeated instance looks exactly as it did, and the browser never receives anything
// that names an item's rank — only the texts in display order.
//
// STORED CONTENT (questions row: answer_format "order", answer_type "short")
//   content.question   string, the task ("Sæt begivenhederne i den rækkefølge, de skete")
//   content.items      ORDER_MIN_ITEMS..ORDER_MAX_ITEMS unique, non-empty strings (≤ 80 chars) in the
//                      CORRECT order — first item first
//   content.sequence   "chronological" | "process" | "logical" — what the order means (required):
//                        chronological  what happened first (a time order — NOT a claim that one event
//                                       caused the next; content must not present it as one)
//                        process        how something is done or happens, step by step
//                        logical        an order that follows from a subject relationship (smallest →
//                                       largest, general → specific, …)
//   content.options    must be ABSENT (get-next-question's v1 path maps unknown formats to "mc"; without
//                      options the row is skipped, never shown as multiple choice)
//   review_text        recommended: WHY this is the order (the feedback after a wrong answer)
//
// THE KEY (question_instances.correct_answer, server-only)
//   "2,0,3,1" = the item with authored rank 0 was shown at display position 2, rank 1 at position 0, …
// i.e. the display positions of the items IN THE CORRECT ORDER. It is never the identity (the list is
// never shown already solved).
//
// GRADING
// The browser sends the pupil's order as JSON: the DISPLAY positions from top to bottom, e.g. [2,0,3,1].
// canonicalOrderAnswer() checks only the SHAPE — a permutation of 0..n-1 — and writes it in the key's
// form. process-event hands that string to process_question_attempt, which compares it with the key
// (both stripped to [a-z0-9]: with at most 6 items every position is one digit, so "2,0,3,1" → "2031" is
// unambiguous) and awards exactly as for MC: all or nothing, one reward path. A malformed answer is
// refused before the RPC: nothing is recorded and nothing is awarded.
//
// GUESSING: a random order of n items is right with probability 1/n! (3 → 17 %, 4 → 4.2 %, 5 → 0.8 %,
// 6 → 0.14 %), so an all-or-nothing answer of 4+ items is strong evidence; 3 items is a practice size.
//
// Pure TypeScript with no Deno or network imports, so the Node unit suite tests exactly what the Edge
// Functions run.

export const ORDER_MIN_ITEMS = 3;
export const ORDER_MAX_ITEMS = 6;
export const ORDER_MAX_TEXT_LENGTH = 80;
export const ORDER_SEQUENCES = Object.freeze(["chronological", "process", "logical"] as const);
export type OrderSequence = typeof ORDER_SEQUENCES[number];

// Authoring guidance: how many items a difficulty band should hold (4 is the default evidence size).
export const RECOMMENDED_ITEMS_BY_BAND: Readonly<Record<number, readonly [number, number]>> = Object.freeze({
  1: [3, 4], 2: [4, 4], 3: [4, 5], 4: [5, 6], 5: [5, 6],
});

export type OrderContent = { items: string[]; sequence: OrderSequence };
export type OrderLayout = { items: string[]; sequence: OrderSequence };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// The stored content as { items, sequence }, or a thrown Error naming the contract break.
export function parseOrderContent(rawContent: unknown): OrderContent {
  if (!isPlainObject(rawContent)) throw new Error("order: content must be an object");
  if (rawContent.options !== undefined) throw new Error("order: content.options must be absent");
  const items = rawContent.items;
  if (!Array.isArray(items) || items.length < ORDER_MIN_ITEMS || items.length > ORDER_MAX_ITEMS) {
    throw new Error(`order: content.items must hold ${ORDER_MIN_ITEMS}-${ORDER_MAX_ITEMS} items`);
  }
  const texts: string[] = [];
  for (const it of items) {
    if (typeof it !== "string" || it.trim().length === 0) throw new Error("order: every item must be non-empty text");
    if (it.trim().length > ORDER_MAX_TEXT_LENGTH) throw new Error(`order: an item is longer than ${ORDER_MAX_TEXT_LENGTH} characters`);
    texts.push(it.trim());
  }
  if (new Set(texts.map((t) => t.toLowerCase())).size !== texts.length) {
    throw new Error("order: items must be unique (otherwise two orders would be right)");
  }
  const sequence = rawContent.sequence;
  if (typeof sequence !== "string" || !(ORDER_SEQUENCES as readonly string[]).includes(sequence)) {
    throw new Error(`order: content.sequence must be one of ${ORDER_SEQUENCES.join(", ")}`);
  }
  return { items: texts, sequence: sequence as OrderSequence };
}

// Authoring check: errors are contract breaks (row skipped); warnings are review prompts. Never throws.
export function validateOrderContent(rawContent: unknown, difficultyBand?: unknown, reviewText?: unknown): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  let parsed: OrderContent | null = null;
  try { parsed = parseOrderContent(rawContent); } catch (e) { errors.push((e as Error).message); }
  if (parsed) {
    const band = Number(difficultyBand);
    const rec = RECOMMENDED_ITEMS_BY_BAND[band];
    if (rec && (parsed.items.length < rec[0] || parsed.items.length > rec[1])) {
      warnings.push(`order: band ${band} recommends ${rec[0]}-${rec[1]} items, got ${parsed.items.length}`);
    }
    if (parsed.items.length < 4) warnings.push("order: fewer than 4 items — a guess is right 1 in 6; use as practice, not as evidence");
    if (typeof reviewText !== "string" || reviewText.trim().length === 0) {
      warnings.push("order: no review_text — a wrong answer would get the correct order without the reason");
    }
    if (parsed.sequence === "chronological" && typeof reviewText === "string"
      && /\b(derfor|fordi|førte til|forårsagede|resulterede i)\b/i.test(reviewText)) {
      warnings.push("order: a chronological review_text uses causal wording — check that the cause is documented, not just implied by the order");
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

const formatKey = (positions: readonly number[]): string => positions.join(",");

// A fresh key for an instance with `itemCount` items: a Fisher–Yates shuffle of the presentation that
// is never the identity (the list is never shown already solved).
export function createOrderKey(itemCount: number, randomInt: RandomInt = cryptoRandomInt): string {
  if (!Number.isInteger(itemCount) || itemCount < ORDER_MIN_ITEMS || itemCount > ORDER_MAX_ITEMS) {
    throw new Error("createOrderKey: invalid item count");
  }
  // shown[p] = the authored rank shown at display position p.
  const shown = Array.from({ length: itemCount }, (_, i) => i);
  for (let i = itemCount - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) throw new Error("createOrderKey: random source out of range");
    [shown[i], shown[j]] = [shown[j], shown[i]];
  }
  if (shown.every((v, i) => v === i)) shown.push(shown.shift() as number); // rotate: still a shuffle
  const positionOfRank = new Array<number>(itemCount);
  shown.forEach((rank, position) => { positionOfRank[rank] = position; });
  return formatKey(positionOfRank);
}

// The key as an array (index = authored rank, value = display position), or null when it is not a
// permutation of the right size (itemCount omitted: any valid size).
export function parseOrderKey(key: unknown, itemCount?: number): number[] | null {
  if (typeof key !== "string" || key.length > 2 * ORDER_MAX_ITEMS) return null;
  const parts = key.split(",");
  if (parts.length < ORDER_MIN_ITEMS || parts.length > ORDER_MAX_ITEMS) return null;
  if (itemCount !== undefined && parts.length !== itemCount) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d$/.test(p)) return null;
    out.push(Number(p));
  }
  const sorted = [...out].sort((a, b) => a - b);
  return sorted.every((v, i) => v === i) ? out : null;
}

// What the browser may see: the item texts in display order and the kind of sequence. Throws when the
// content or the key is unusable, so the caller skips the row.
export function orderLayout(rawContent: unknown, key: unknown): OrderLayout {
  const { items, sequence } = parseOrderContent(rawContent);
  const positions = parseOrderKey(key, items.length);
  if (positions === null) throw new Error("Order question has no valid instance key");
  const shown = new Array<string>(items.length);
  positions.forEach((position, rank) => { shown[position] = items[rank]; });
  return { items: shown, sequence };
}

// The pupil's order in the key's canonical form, or null when it is not a permutation of the key's
// display positions. Accepts the JSON string the browser sends or the parsed array. Shape only.
export function canonicalOrderAnswer(answer: unknown, key: unknown): string | null {
  const positions = parseOrderKey(key);
  if (positions === null) return null;
  const n = positions.length;
  let parsed: unknown = answer;
  if (typeof answer === "string") {
    if (answer.length > 64) return null;
    try { parsed = JSON.parse(answer); } catch { return null; }
  }
  if (!Array.isArray(parsed) || parsed.length !== n) return null;
  const seen = new Set<number>();
  for (const p of parsed) {
    if (!Number.isInteger(p) || p < 0 || p >= n || seen.has(p)) return null;
    seen.add(p);
  }
  return formatKey(parsed as number[]);
}
