// Match par (match_pairs): the pupil connects each item in a left column with the item in a right
// column that belongs to it. This file is the SERVER contract for the kind — stored content, the
// per-instance answer key, the browser layout and the shape of an answer. It decides nothing about
// rewards and does not grade: correctness is decided by public.process_question_attempt, exactly as
// for multiple choice and numbers (see "GRADING" below), so Match par has no grading path of its own.
//
// STORED CONTENT (questions row: answer_format "match", answer_type "short")
//   content.question   string, the task ("Forbind landet med hovedstaden")
//   content.pairs      MATCH_MIN_PAIRS..MATCH_MAX_PAIRS objects { left: string, right: string } in the
//                      authored order; every left text is unique and every right text is unique, so
//                      no answer can be right in two ways
//   content.options    must be ABSENT: get-next-question's v1 path maps an unknown format to "mc", and
//                      a match row without options then fails the MC payload check and is skipped —
//                      it is never shown as multiple choice
// Nothing else in content is read. difficulty_band / target_grade differentiate as for any question;
// RECOMMENDED_PAIRS_BY_BAND is the authoring guidance for how many pairs a band should hold.
//
// THE ANSWER KEY (question_instances.correct_answer, server-only)
// The left column is shown in authored order; the right column is shuffled ONCE, when the instance is
// created, and the shuffle is stored as the instance's key:
//   "0:2,1:0,2:1"  = left item 0 belongs with right DISPLAY position 2, left 1 with right 0, …
// The key alone rebuilds the browser layout (right display position j shows pairs[i].right where
// key[i] = j), so a due or repeated instance looks exactly as it did when it was first served, and the
// browser never receives anything that names which right item belongs to which left item — only two
// lists of texts. The shuffle is never the identity, so "straight across" is never the answer.
//
// GRADING
// The browser sends its connections as JSON, [[left, right], …] in display positions.
// canonicalMatchAnswer() checks only the SHAPE — exactly one connection per left item and per right
// item — and writes it in the key's canonical form, sorted by left. process-event then hands that string
// to process_question_attempt, which compares it with the key (both lower-cased and stripped to
// [a-z0-9], so "0:2,1:0,2:1" and the key compare as "021021"; with at most 6 pairs every position is one
// digit, so the stripped form is unambiguous) and awards XP, coins, streak, quests and the reduced
// repeat award exactly as it does for MC. An incomplete or malformed answer is rejected before the RPC:
// nothing is recorded and nothing is awarded.
//
// Pure TypeScript with no Deno or network imports, so the Node unit suite tests exactly what the Edge
// Functions run.

export const MATCH_MIN_PAIRS = 2;
export const MATCH_MAX_PAIRS = 6;
export const MATCH_MAX_TEXT_LENGTH = 80;

// Authoring guidance per difficulty band (1–5): more pairs are harder to hold in mind at once. A band
// outside this table, or a count outside its range, is a content warning, not a serving error.
export const RECOMMENDED_PAIRS_BY_BAND: Readonly<Record<number, readonly [number, number]>> = Object.freeze({
  1: Object.freeze([2, 3]) as readonly [number, number],
  2: Object.freeze([3, 4]) as readonly [number, number],
  3: Object.freeze([4, 4]) as readonly [number, number],
  4: Object.freeze([4, 5]) as readonly [number, number],
  5: Object.freeze([5, 6]) as readonly [number, number],
});

export type MatchPair = { left: string; right: string };
export type MatchLayout = { left: string[]; right: string[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isItemText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= MATCH_MAX_TEXT_LENGTH;
}

// The authored pairs, or a thrown Error naming what is wrong. Used both when an instance is created and
// when its layout is rebuilt, so a row that breaks the contract is skipped rather than served half-built.
export function parseMatchPairs(rawContent: unknown): MatchPair[] {
  if (!isPlainObject(rawContent)) throw new Error("Invalid content");
  if (rawContent.options !== undefined) throw new Error("Match question must not carry options");
  const pairs = rawContent.pairs;
  if (!Array.isArray(pairs) || pairs.length < MATCH_MIN_PAIRS || pairs.length > MATCH_MAX_PAIRS) {
    throw new Error(`Match question needs ${MATCH_MIN_PAIRS}-${MATCH_MAX_PAIRS} pairs`);
  }
  const out: MatchPair[] = [];
  for (const p of pairs) {
    if (!isPlainObject(p) || !isItemText(p.left) || !isItemText(p.right)) {
      throw new Error("Match pair needs a non-empty left and right text");
    }
    out.push({ left: p.left, right: p.right });
  }
  // Compared case- and space-insensitively: two items a pupil cannot tell apart are the same item.
  const norm = (s: string) => s.trim().toLowerCase();
  if (new Set(out.map((p) => norm(p.left))).size !== out.length) throw new Error("Match question has duplicate left items");
  if (new Set(out.map((p) => norm(p.right))).size !== out.length) throw new Error("Match question has duplicate right items");
  return out;
}

// Authoring check: contract errors (the row would be skipped) and warnings (it would be served, but
// does not follow the guidance). Never throws.
export function validateMatchContent(rawContent: unknown, difficultyBand: unknown): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  let pairs: MatchPair[] = [];
  try {
    pairs = parseMatchPairs(rawContent);
  } catch (e) {
    errors.push((e as Error).message);
  }
  if (!isPlainObject(rawContent) || typeof rawContent.question !== "string" || rawContent.question.trim().length === 0) {
    errors.push("Missing question text");
  }
  if (errors.length === 0) {
    const range = Number.isInteger(difficultyBand) ? RECOMMENDED_PAIRS_BY_BAND[difficultyBand as number] : undefined;
    if (!range) warnings.push("difficulty_band 1-5 is required to check the pair count");
    else if (pairs.length < range[0] || pairs.length > range[1]) {
      warnings.push(`band ${difficultyBand} recommends ${range[0]}-${range[1]} pairs, this question has ${pairs.length}`);
    }
  }
  return { errors, warnings };
}

// A uniform integer in [0, maxExclusive) from the platform's cryptographic generator (Deno and Node
// both provide globalThis.crypto). Injected in tests.
export type RandomInt = (maxExclusive: number) => number;

export const cryptoRandomInt: RandomInt = (maxExclusive) => {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 256) {
    throw new Error("cryptoRandomInt: range must be 1..256");
  }
  // Rejection sampling: no modulo bias.
  const limit = 256 - (256 % maxExclusive);
  const buf = new Uint8Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % maxExclusive;
  }
};

function formatKey(rightPositionOfLeft: readonly number[]): string {
  return rightPositionOfLeft.map((r, l) => `${l}:${r}`).join(",");
}

// A fresh key for an instance of a question with `pairCount` pairs: a Fisher–Yates shuffle of the
// right column that is never the identity.
export function createMatchKey(pairCount: number, randomInt: RandomInt = cryptoRandomInt): string {
  if (!Number.isInteger(pairCount) || pairCount < MATCH_MIN_PAIRS || pairCount > MATCH_MAX_PAIRS) {
    throw new Error("createMatchKey: invalid pair count");
  }
  // order[j] = the authored pair shown at right display position j.
  const order = Array.from({ length: pairCount }, (_, i) => i);
  for (let i = pairCount - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) throw new Error("createMatchKey: random source out of range");
    [order[i], order[j]] = [order[j], order[i]];
  }
  // Identity would line every pair up straight across; rotate by one instead (still a valid shuffle,
  // and deterministic, so no second draw is needed).
  if (order.every((v, i) => v === i)) order.push(order.shift() as number);
  const rightPositionOfLeft = new Array<number>(pairCount);
  order.forEach((pairIndex, position) => { rightPositionOfLeft[pairIndex] = position; });
  return formatKey(rightPositionOfLeft);
}

// The key as an array (index = left position, value = right display position), or null when it is not
// a complete key for `pairCount` pairs (pairCount omitted: any valid size).
export function parseMatchKey(key: unknown, pairCount?: number): number[] | null {
  if (typeof key !== "string") return null;
  const parts = key.split(",");
  if (parts.length < MATCH_MIN_PAIRS || parts.length > MATCH_MAX_PAIRS) return null;
  if (pairCount !== undefined && parts.length !== pairCount) return null;
  const out: number[] = [];
  for (let i = 0; i < parts.length; i++) {
    const m = /^(\d):(\d)$/.exec(parts[i]);
    if (!m || Number(m[1]) !== i) return null;
    out.push(Number(m[2]));
  }
  const sorted = [...out].sort((a, b) => a - b);
  return sorted.every((v, i) => v === i) ? out : null;
}

// What the browser may see: the left texts in authored order and the right texts in the instance's
// shuffled order. Throws when the content or the key is unusable, so the caller skips the row.
export function matchLayout(rawContent: unknown, key: unknown): MatchLayout {
  const pairs = parseMatchPairs(rawContent);
  const positions = parseMatchKey(key, pairs.length);
  if (positions === null) throw new Error("Match question has no valid instance key");
  const right = new Array<string>(pairs.length);
  positions.forEach((position, pairIndex) => { right[position] = pairs[pairIndex].right; });
  return { left: pairs.map((p) => p.left), right };
}

// The pupil's connections in the key's canonical form, or null when they are not exactly one
// connection per left and per right item for a question of the key's size. Accepts the JSON string the
// browser sends, or the already-parsed array. Shape only — never a verdict.
export function canonicalMatchAnswer(answer: unknown, key: unknown): string | null {
  const positions = parseMatchKey(key);
  if (positions === null) return null;
  const n = positions.length;
  let parsed: unknown = answer;
  if (typeof answer === "string") {
    if (answer.length > 200) return null;
    try { parsed = JSON.parse(answer); } catch { return null; }
  }
  if (!Array.isArray(parsed) || parsed.length !== n) return null;
  const rightOfLeft = new Array<number>(n).fill(-1);
  const usedRight = new Set<number>();
  for (const c of parsed) {
    if (!Array.isArray(c) || c.length !== 2) return null;
    const [l, r] = c;
    if (!Number.isInteger(l) || !Number.isInteger(r) || l < 0 || l >= n || r < 0 || r >= n) return null;
    if (rightOfLeft[l] !== -1 || usedRight.has(r)) return null;
    rightOfLeft[l] = r;
    usedRight.add(r);
  }
  return formatKey(rightOfLeft);
}
