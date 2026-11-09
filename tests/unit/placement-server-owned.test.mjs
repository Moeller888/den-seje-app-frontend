// Security regression: the browser never gets an answer key and never decides its own placement band
// (audit finding E1, 2026-10-16). Offline — a source check of app.js and index.html.
//
// BEFORE: app.js read 10 questions straight from the `questions` table (content.correct included),
// graded them in the browser and wrote profiles.placement_band itself. Later the test ran through
// start_placement() and submit_placement(). NOW: pupils no longer take the test (D-356) and the client
// code is gone (D-360). tests/placement-e2e.spec.ts proves the start in the browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const APP = stripComments(readFileSync(join(REPO, "app.js"), "utf8"));
const INDEX = readFileSync(join(REPO, "index.html"), "utf8");

test("the placement test is gone from the client (D-360)", () => {
  for (const name of ["runPlacementFlow", "fetchPlacementQuestions", "submitPlacement", "start_placement", "submit_placement"]) {
    assert.equal(APP.includes(name), false, `app.js still mentions ${name}`);
  }
  assert.equal(/placement-(overlay|question|options|option-btn|selected)/.test(APP + INDEX), false,
    "the overlay and its styles are gone");
});

test("a band from the former test still decides the start, after the earned band", () => {
  assert.match(APP, /\.select\("placement_band, current_band"\)/);
  assert.match(APP, /await loadAdaptiveBands\(\);\s*if \(persistedBand !== null\)/);
  assert.match(APP, /else if \(placementBand !== null\) \{\s*currentDifficultyBand = placementBand;/);
});

test("app.js never reads the questions table", () => {
  assert.equal(/\.from\(\s*["'`]questions["'`]\s*\)/.test(APP), false,
    "the browser must not read the question bank (P4)");
});

test("the browser never writes placement_band", () => {
  assert.equal(/update\(\s*\{\s*placement_band/.test(APP), false, "client write of placement_band removed");
  // The current_band contract (persisted every 10 answers by the client) is unchanged.
  assert.match(APP, /\.update\(\{ current_band: currentDifficultyBand \}\)/);
});
