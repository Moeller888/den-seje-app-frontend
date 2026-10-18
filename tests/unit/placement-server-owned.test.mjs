// Security regression: the placement assessment never gives the browser an answer key (audit finding E1,
// 2026-10-16). Offline — a source check of app.js and index.html, plus the server contract it relies on.
//
// BEFORE: app.js read 10 questions straight from the `questions` table (content.correct included),
// graded them in the browser and wrote profiles.placement_band itself. That made the whole bank
// readable by any pupil (and, through the PUBLIC policy, by anyone) and let the browser decide its own
// band. NOW: start_placement() returns display data only, submit_placement() grades server-side once
// and writes the band; the browser only collects which option the pupil chose.
//   The live flow (overlay → answers → band in the DB) is exercised by tests/placement-e2e.spec.ts; the
// server functions by tests/unit/answer-keys-server-side-migration-run.test.mjs and
// tests/unit/answer-keys-client-paths-lockdown-migration-run.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const APP = stripComments(readFileSync(join(REPO, "app.js"), "utf8"));
const INDEX = readFileSync(join(REPO, "index.html"), "utf8");

const start = APP.indexOf("async function loadAdaptiveBands()");
const end = APP.indexOf("// ── End placement system", start) !== -1
  ? APP.indexOf("// ── End placement system", start)
  : APP.indexOf("const DOMAIN_LABEL", start);
const PLACEMENT = APP.slice(start, end);

test("the placement block is found", () => {
  assert.ok(start > 0 && end > start, "placement section not found in app.js");
  assert.match(PLACEMENT, /async function runPlacementFlow\(\)/);
});

test("app.js never reads the questions table", () => {
  assert.equal(/\.from\(\s*["'`]questions["'`]\s*\)/.test(APP), false,
    "the browser must not read the question bank (P4) — placement uses start_placement()");
});

test("placement gets its questions from start_placement() and grades through submit_placement()", () => {
  assert.match(PLACEMENT, /supabase\.rpc\("start_placement"\)/);
  assert.match(PLACEMENT, /supabase\.rpc\("submit_placement", \{ p_answers: answers \}\)/);
  // Only the pupil's choice per question goes back — never a verdict or score.
  assert.match(PLACEMENT, /answers\.push\(\{ question_id: q\.id, answer: chosen \}\);/);
  assert.equal(/\bscore\b|isCorrect|wasCorrect|calculatePlacementBand/.test(PLACEMENT), false,
    "no browser-side grading");
});

test("no answer key is read, kept or compared in the placement code", () => {
  for (const re of [/\.correct\b/, /correct_answer/, /accepted_answers/, /\bfacit\b/, /tolerance/, /\.content\b/]) {
    assert.equal(re.test(PLACEMENT), false, `placement code touches ${re}`);
  }
  assert.match(PLACEMENT, /const questionText = q\.question;/);
  assert.match(PLACEMENT, /const options = \[\.\.\.q\.options\]/);
});

test("the band is written by the server: the browser no longer updates placement_band", () => {
  assert.equal(/update\(\s*\{\s*placement_band/.test(APP), false, "client write of placement_band removed");
  assert.match(PLACEMENT, /placementBand = band;/);
  // The current_band contract (persisted every 10 answers by the client) is unchanged.
  assert.match(APP, /\.update\(\{ current_band: currentDifficultyBand \}\)/);
});

test("failures are loud and never leave the pupil stuck", () => {
  assert.match(PLACEMENT, /logError\("PLACEMENT_START_ERROR", error\)/);
  assert.match(PLACEMENT, /logError\("PLACEMENT_SUBMIT_ERROR", error\)/);
  assert.match(PLACEMENT, /logEvent\("PLACEMENT_SKIPPED", \{ reason: "insufficient_questions"/,
    "fewer than 5 usable questions still skips placement as before");
  assert.match(PLACEMENT, /Vi kunne ikke gemme dit udgangspunkt/, "a failed submit is shown, not swallowed");
  assert.match(PLACEMENT, /overlay\.style\.display = "none";\s*resolve\(\);/, "the overlay always closes");
});

test("the UI marks the chosen option, never correct/incorrect", () => {
  assert.match(PLACEMENT, /btn\.classList\.add\("placement-selected"\);/);
  assert.equal(/placement-(correct|incorrect)/.test(APP + INDEX), false);
  assert.match(INDEX, /\.placement-option-btn\.placement-selected \{/);
});
