// K3 (D-285): the proposed grading normalisation — pure functions, NOT wired into grading.
// Pins L1-A6 and the three defect patterns the read-only production report found (2026-11-01), on
// synthetic items. The legacy mirror must equal production's rule (process_question_attempt).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  legacyNormalize, normalizeChoice, isChoiceCorrect, normalizeNumber, isNumberCorrect,
} from "../../supabase/functions/_shared/answer-normalize.ts";

test("legacyNormalize mirrors production's rule, and that rule is still production's", () => {
  // The live MC rule (20261027120000): lower(), then drop everything outside [a-z0-9].
  const sql = readFileSync(new URL("../../supabase/migrations/20261027120000_repeat_answer_coin_reward.sql", import.meta.url), "utf8");
  assert.match(sql, /trim\(regexp_replace\(lower\(p_answer\),\s*'\[\^a-z0-9\]', '', 'g'\)\)/);
  assert.equal(legacyNormalize("My Father's Car."), "myfatherscar");
  assert.equal(legacyNormalize("Ærø 1,5"), "r15");
  assert.equal(legacyNormalize(42), "");
});

test("the three defect patterns: legacy grades a wrong option correct; the new rule does not", () => {
  // 1. apostrophe position (possessive): "'s" vs "s'"
  assert.equal(legacyNormalize("'s"), legacyNormalize("s'"));
  assert.equal(isChoiceCorrect("s'", "'s"), false);
  assert.equal(isChoiceCorrect("'s", "'s"), true);
  // 2. a sentence differing only by the apostrophe
  assert.equal(legacyNormalize("Tom's dog is big."), legacyNormalize("Toms dog is big."));
  assert.equal(isChoiceCorrect("Toms dog is big.", "Tom's dog is big."), false);
  // 3. a key made only of æ/ø/å normalises to "" under legacy
  assert.equal(legacyNormalize("ø"), "");
  assert.equal(normalizeChoice("ø"), "ø");
  assert.equal(isChoiceCorrect("å", "ø"), false);
  assert.equal(isChoiceCorrect("Ø", "ø"), true);
});

test("choices: æ ≠ ae, case and whitespace ignored, typographic apostrophes unified, NFC", () => {
  assert.equal(isChoiceCorrect("ae", "æ"), false);
  assert.equal(isChoiceCorrect("Frø", "frø"), true);
  assert.equal(isChoiceCorrect("frø", "får"), false);
  assert.equal(isChoiceCorrect("  ice   cream ", "Ice cream"), true);
  assert.equal(isChoiceCorrect("Tom’s", "Tom's"), true);
  assert.equal(isChoiceCorrect("å", "å"), true);              // a + combining ring = å
  assert.equal(isChoiceCorrect("Paris.", "Paris"), false);           // punctuation counts
  assert.equal(isChoiceCorrect("", ""), false);                      // an empty key never matches
  assert.equal(isChoiceCorrect(null, "x"), false);
});

test("choices: reviewed Danish aliases are matched on the raw answer, exactly as production does", () => {
  assert.equal(isChoiceCorrect("Prinsessen", "prinsesse", ["Prinsessen"]), true);
  assert.equal(isChoiceCorrect("prinsessen", "prinsesse", ["Prinsessen"]), false);
  assert.equal(isChoiceCorrect("x", "y", "not-an-array"), false);
});

test("numbers (L1-A6): 1,5 ≠ 15; −5 ≠ 5; 1 000 = 1000; 1.5 = 1,5; non-numbers are wrong, never an error", () => {
  assert.equal(isNumberCorrect("1,5", "15"), false);
  assert.equal(isNumberCorrect("−5", "5"), false);
  assert.equal(isNumberCorrect("-5", "−5"), true);
  assert.equal(isNumberCorrect("1 000", "1000"), true);
  assert.equal(isNumberCorrect("12 345,50", "12345.5"), true);
  assert.equal(isNumberCorrect("1.5", "1,5"), true);
  assert.equal(isNumberCorrect("007", "7"), true);
  assert.equal(isNumberCorrect("-0", "0"), true);
  for (const bad of ["1/2", "5 kr", "fem", "", "1,2,3", "1 00", "--5", "1.", ".5", null, undefined, {}]) {
    assert.equal(normalizeNumber(bad), null, String(bad));
    assert.equal(isNumberCorrect(bad, "5"), false, String(bad));
  }
  assert.equal(normalizeNumber(1945), "1945");
});

test("numbers: tolerance is opt-in and absolute; invalid tolerances mean exact", () => {
  assert.equal(isNumberCorrect("3,14", "3.1416", 0.01), true);
  assert.equal(isNumberCorrect("3,14", "3.1416"), false);
  for (const t of [-1, Number.NaN, "0.5", null]) assert.equal(isNumberCorrect("3", "3.4", t), false);
});

test("the module is pure: no Deno, network, env or database access", () => {
  const src = readFileSync(new URL("../../supabase/functions/_shared/answer-normalize.ts", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => !l.trim().startsWith("//")).join("\n");   // code only, not comments
  for (const forbidden of [/\bDeno\b/, /\bfetch\(/, /createClient/, /process\.env/, /^import /m]) {
    assert.equal(forbidden.test(src), false, String(forbidden));
  }
});

test("NOT wired: no Edge Function or migration uses the new rule yet (switching needs its own GO)", () => {
  const pe = readFileSync(new URL("../../supabase/functions/process-event/index.ts", import.meta.url), "utf8");
  assert.equal(/answer-normalize/.test(pe), false);
});
