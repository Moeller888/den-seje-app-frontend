// K3 (D-282 / LP-15, D-285): the proposed grading normalisation for multiple choice, force_text and
// numbers — PURE functions, NOT wired into any grading path. Production still grades with
// process_question_attempt's legacy rule (lower(), then drop everything outside [a-z0-9]);
// `legacyNormalize` below mirrors that rule exactly so reports can compare the two.
// Switching production to these rules needs a SQL twin, a migration and a separate owner GO.
//
// Why: the legacy rule drops letters and signs that carry meaning —
//   "'s" and "s'" both become "s"; "father's" and "fathers" collide; "ø" becomes "" (empty);
//   "æ" vs "ae", "1,5" vs "15", "-5" vs "5" and "1/2" vs "12" compare equal.
// The new rules keep every letter (æ, ø, å included), the apostrophe and all punctuation for choices,
// and compare numbers numerically.
//
// Pure TypeScript with no Deno or network imports, so the Node unit suite tests exactly this module.

// ── Legacy (production today), for reports only ───────────────────────────────────────────────────

// process_question_attempt: trim(regexp_replace(lower(x), '[^a-z0-9]', '', 'g')).
export function legacyNormalize(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

// ── Choices (multiple choice, force_text) ─────────────────────────────────────────────────────────

const APOSTROPHES = /[‘’ʼ′`´]/g; // ‘ ’ ʼ ′ ` ´ → '

// NFC, typographic apostrophes → ', lower case, whitespace runs → one space, trimmed.
// Nothing else is removed: letters (æ, ø, å …), digits, apostrophes and punctuation all count.
export function normalizeChoice(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFC")
    .replace(APOSTROPHES, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// The answer is correct when it normalises to the key, or is one of the reviewed Danish spellings
// (metadata.danish_orthography_correct_aliases — matched on the RAW answer, exactly as production does).
// An empty normalised key never matches anything.
export function isChoiceCorrect(answer: unknown, correct: unknown, aliases?: unknown): boolean {
  const key = normalizeChoice(correct);
  if (key !== "" && normalizeChoice(answer) === key) return true;
  return Array.isArray(aliases) && typeof answer === "string" && aliases.includes(answer);
}

// ── Numbers ───────────────────────────────────────────────────────────────────────────────────────

const MINUS = /[−–—]/g; // − – — → -
const THOUSANDS = /^-?\d{1,3}( \d{3})+([.,]\d+)?$/; // "1 000", "12 345,5"
const PLAIN = /^-?\d+([.,]\d+)?$/;

// The canonical decimal string of a number answer, or null when it is not a number.
// "1,5" → "1.5", "−5" → "-5", "1 000" → "1000", "007" → "7", "2,50" → "2.5", "-0" → "0".
// Fractions ("1/2"), units ("5 kr") and words are NOT numbers here: they are wrong, never an error.
export function normalizeNumber(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  let s = String(value).normalize("NFC").trim().replace(MINUS, "-").replace(/ | /g, " ");
  if (THOUSANDS.test(s)) s = s.replace(/ /g, "");
  if (!PLAIN.test(s)) return null;
  s = s.replace(",", ".");
  let negative = s.startsWith("-");
  if (negative) s = s.slice(1);
  let [int, frac = ""] = s.split(".");
  int = int.replace(/^0+(?=\d)/, "");
  frac = frac.replace(/0+$/, "");
  if (int === "0" && frac === "") negative = false;
  return `${negative ? "-" : ""}${int}${frac ? "." + frac : ""}`;
}

// Exact numeric equality on the canonical strings, or |a − b| <= tolerance when a tolerance > 0 is given.
export function isNumberCorrect(answer: unknown, correct: unknown, tolerance: unknown = 0): boolean {
  const a = normalizeNumber(answer);
  const c = normalizeNumber(correct);
  if (a === null || c === null) return false;
  const tol = typeof tolerance === "number" && Number.isFinite(tolerance) && tolerance > 0 ? tolerance : 0;
  if (tol === 0) return a === c;
  return Math.abs(Number(a) - Number(c)) <= tol;
}
