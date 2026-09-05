// D-121 pins an exact prompt by SHA-256. This test is what makes that pin mean something.
//
// The pre-merge verification of PR #227 failed on precisely this: the authorised prompt existed
// only inside tools/avatar/build/, which is gitignored, so the wording D-121 authorises could not
// be reconstructed from the repository at all. A hash in a register row is not a contract if the
// bytes it names live nowhere a fresh clone can reach. D-113 recorded the harder version of the
// same lesson — an approved artefact in a gitignored directory was destroyed by an authorised
// cleanup and recovered only by luck.
//
// So the prompt is tracked as a fixture, and this test fails if its bytes ever drift from the
// values D-121 names. It runs on a fresh clone and needs no network, no key and no build output.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const FIXTURE = join(REPO, "tools", "avatar", "fixtures", "northstar-d-refinement", "refinement-prompt.md");
const REGISTER = join(REPO, "docs", "project-state.md");
const FENCE = "`".repeat(3);

// The values D-121 names. Changing either of these means changing what was authorised.
const FILE_BYTES = 6488;
const FILE_SHA = "2380fcd7d2fe4c4ac4da87a46d0f9a4762d792d463c8b427f7d920ac670952a5";
const PROMPT_BYTES = 3494;
const PROMPT_SHA = "166b1ee25eee341abbc51ffaa361ce85f08c9d1f60826080a04ae2f6b8ec70f9";

const sha = (b) => createHash("sha256").update(b).digest("hex");
const raw = readFileSync(FIXTURE);

/** The text actually sent: the single fenced block. Same extraction the adapter uses. */
function promptBody(md) {
  const lines = md.split("\n");
  const fences = [];
  for (let i = 0; i < lines.length; i++) if (lines[i].trimEnd() === FENCE) fences.push(i);
  assert.equal(fences.length, 2, "the prompt file must contain exactly one fenced block");
  return Buffer.from(lines.slice(fences[0] + 1, fences[1]).join("\n").replace(/\s+$/, ""), "utf8");
}

test("the authorised prompt is tracked, not left in a gitignored build directory", () => {
  assert.ok(raw.length > 0, "the fixture must exist in the repository");
  assert.ok(!FIXTURE.includes(join("avatar", "build")), "the fixture must not live under tools/avatar/build/");
});

test("the prompt file is byte-for-byte what D-121 names", () => {
  assert.equal(raw.length, FILE_BYTES);
  assert.equal(sha(raw), FILE_SHA);
});

test("the text actually sent is byte-for-byte what D-121 names", () => {
  const body = promptBody(raw.toString("utf8"));
  assert.equal(body.length, PROMPT_BYTES);
  assert.equal(sha(body), PROMPT_SHA);
});

test("the prompt is an edit of the existing candidate, addressing all four inputs", () => {
  const body = promptBody(raw.toString("utf8")).toString("utf8");
  assert.match(body, /^Edit the boy in Image 1\./, "it must be an edit, not a fresh generation");
  assert.match(body, /NOT a new\s+character/, "it must say it is not a new character");
  for (const n of [1, 2, 3, 4]) assert.ok(body.includes("Image " + n), "the prompt must address Image " + n);
});

test("the prompt keeps the identity and forbids the rejected outfit", () => {
  const body = promptBody(raw.toString("utf8")).toString("utf8");
  for (const kept of ["the same boy", "the same face", "the same warm tan skin tone",
    "the same dark brown tousled hair", "the same plain solid grey short-sleeve t-shirt",
    "the same blue jeans", "the same light grey sneakers"]) {
    assert.ok(body.includes(kept), "the prompt must preserve: " + kept);
  }
  for (const banned of ["no green clothing", "no star", "no logo", "no wristbands", "no cargo pocket", "no background"]) {
    assert.ok(body.includes(banned), "the prompt must forbid: " + banned);
  }
});

test("the prompt does not try to line the hair up with a measurement line", () => {
  // Anchoring the hair tip to the cranium crown is what invalidated the first audit's fit factor.
  const body = promptBody(raw.toString("utf8")).toString("utf8");
  assert.match(body, /do NOT try to line the tips of the hair up with any measurement line/);
  assert.match(body, /The hair may rise naturally above the top of the cranium/);
});

test("D-121 cites the tracked fixture and the same two hashes", () => {
  const row = readFileSync(REGISTER, "utf8").split("\n").find((l) => l.startsWith("| **D-121** |"));
  assert.ok(row, "D-121 must exist in the register");
  assert.ok(row.includes("tools/avatar/fixtures/northstar-d-refinement/refinement-prompt.md"),
    "D-121 must cite the TRACKED path, not a gitignored build path");
  assert.ok(row.includes(FILE_SHA), "D-121 must cite the prompt file hash");
  assert.ok(row.includes(PROMPT_SHA), "D-121 must cite the sent-text hash");
});
