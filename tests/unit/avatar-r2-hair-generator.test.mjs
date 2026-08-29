// The hair generator spends money. These tests guard the contract that limits how much.
//
// They are deliberately a mix of BEHAVIOUR (the prompt it builds) and SOURCE assertions (that it
// contains no retry loop and no fallback model). The source half is unusual and justified: a retry
// is not observable from the outside without actually paying for the failure it retries, so the
// only cheap way to prove it cannot happen is to read the code and fail if a loop appears.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  MODEL, SIZE, BACKGROUND, OUTPUT_FORMAT, MAX_REQUESTS, RETRIES, ENDPOINT,
  STYLES, ALLOWED_STYLES, TEMPLATE_PATH, OUT_ROOT, buildPrompt, requestConfig,
} from "../../tools/avatar/openai-generate-hair-item.mjs";
import { STYLE_TARGETS } from "../../tools/avatar/check-r2-hair-candidate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const SRC = readFileSync(join(REPO, "tools", "avatar", "openai-generate-hair-item.mjs"), "utf8");
const TPL = readFileSync(join(REPO, TEMPLATE_PATH), "utf8");

// ── the request contract ──────────────────────────────────────────────────────────────────────

test("the model is pinned and there is no fallback", () => {
  assert.equal(MODEL, "gpt-image-2-2026-04-21");
  const code = SRC.replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/fallback\s*[:=]\s*["'][^"']+["']/.test(code), "a fallback model has appeared");
  assert.equal((code.match(/gpt-image/g) || []).length, 1, "a second model id is referenced");
});

test("size, transparency and format are frozen at the values the gate requires", () => {
  assert.equal(SIZE, "1024x1536");
  assert.equal(BACKGROUND, "transparent");
  assert.equal(OUTPUT_FORMAT, "png");
  assert.equal(ENDPOINT, "https://api.openai.com/v1/images/generations",
    "generation endpoint, not edits");
});

test("the budget is one request and the retry count is zero", () => {
  assert.equal(MAX_REQUESTS, 1);
  assert.equal(RETRIES, 0);
});

test("SOURCE: exactly one fetch, and it is not inside a loop or a retry", () => {
  const code = SRC.replace(/^\s*\/\/.*$/gm, "");
  assert.equal((code.match(/await fetch\(/g) || []).length, 1, "more than one fetch call");
  assert.ok(!/for\s*\([^)]*\)\s*\{[^}]*fetch\(/s.test(code), "a fetch appears inside a for loop");
  assert.ok(!/while\s*\([^)]*\)\s*\{[^}]*fetch\(/s.test(code), "a fetch appears inside a while loop");
  assert.ok(!/catch[\s\S]{0,200}fetch\(/.test(code), "a fetch appears inside a catch — that is a retry");
  // Retry CONSTRUCTS, not the word: the file says "no retry" in prose and in a failure message,
  // and matching the word alone made this test fail on its own subject matter.
  assert.ok(!/\bsetTimeout\b|\bsleep\b|\bbackoff\b/i.test(code), "a delay primitive has appeared");
  assert.ok(!/\battempts?\s*(\+\+|--|\+=|-=)/.test(code), "an attempt counter has appeared");
  assert.ok(!/\bretry\s*\(/.test(code), "a retry() call has appeared");
});

test("SOURCE: the key is read from the environment and never printed or written", () => {
  const code = SRC.replace(/^\s*\/\/.*$/gm, "");
  assert.ok(/process\.env\.OPENAI_API_KEY/.test(code), "the key is not read from the environment");
  assert.ok(!/sk-[A-Za-z0-9]/.test(SRC), "something that looks like a key is hardcoded");
  // Count the KEY IDENTIFIER only. Counting /KEY/ also matched the substring inside
  // OPENAI_API_KEY, so the limit was measuring the wrong thing.
  const uses = code.match(/(?<!_)\bKEY\b/g) || [];
  assert.ok(uses.length <= 4, `the key identifier is referenced ${uses.length} times; the request needs at most 4`);
  // The only permitted mention of the env var in output is the presence check, which prints a
  // literal and never the value.
  assert.ok(!/console\.\w+\([^)]*\$\{KEY\}/.test(code), "the key value is interpolated into output");
  assert.ok(!/console\.\w+\([^)]*\bKEY\b[^)]*\)/.test(code.replace(/process\.env\.OPENAI_API_KEY \? "present" : "MISSING"/, "")),
    "the key identifier reaches a log line");
  assert.ok(!/writeFileSync\([^)]*\bKEY\b/.test(code), "the key reaches a file");
  // The manifest is written to disk, so assert directly that it cannot carry the header.
  assert.ok(!/manifest[\s\S]{0,400}Authorization/.test(code), "the manifest can carry the Authorization header");
});

test("SOURCE: output goes only to the gitignored build root, and is never overwritten", () => {
  assert.equal(OUT_ROOT.replace(/\\/g, "/"), "tools/avatar/build/r2-hair-gen");
  const code = SRC.replace(/^\s*\/\/.*$/gm, "");
  assert.ok(/refusing to overwrite/.test(code), "the overwrite guard is gone");
  assert.ok(!/assets\/avatar-r2/.test(code), "the generator can reach the runtime asset directory");
  assert.ok(!/R2_MANIFEST/.test(code), "the generator can reach the manifest");
});

// ── styles and geometry ───────────────────────────────────────────────────────────────────────

test("only the seven allowlisted styles are accepted", () => {
  assert.deepEqual([...ALLOWED_STYLES].sort(),
    ["afro", "buzz", "curly", "long", "ponytail", "short", "tousled"].sort());
  for (const junk of ["mullet", "", "constructor", "__proto__", "SHORT"]) {
    assert.throws(() => buildPrompt(junk), /unknown style/, `${junk} must be refused`);
  }
});

test("the width and lowest-point percentages are the gate's own measured targets", () => {
  // Not copied from another style and not invented: re-derived from STYLE_TARGETS here, so a
  // change to the measurements breaks this test rather than silently drifting from the artwork.
  for (const style of ["short", "tousled", "curly", "long", "ponytail", "buzz"]) {
    const t = STYLE_TARGETS[style];
    assert.equal(STYLES[style].w, Math.round((t.xHi - t.xLo) / 160 * 100), `${style} width`);
    assert.equal(STYLES[style].low, Math.round(t.lowestY / 240 * 100), `${style} lowest point`);
  }
});

test("afro deliberately keeps the fix-round geometry that was actually accepted", () => {
  // Round 3's afro was rejected by the owner as too low and too big; w 40 / top 1 / low 18 is what
  // produced the asset that shipped. Re-deriving it from STYLE_TARGETS would undo that decision.
  assert.deepEqual({ w: STYLES.afro.w, top: STYLES.afro.top, low: STYLES.afro.low },
    { w: 40, top: 1.0, low: 18 });
});

// ── the prompt ────────────────────────────────────────────────────────────────────────────────

test("the prompt template is tracked, not embedded in the tool", () => {
  const code = SRC.replace(/^\s*\/\/.*$/gm, "");
  assert.ok(/readFileSync\(join\(repoRoot, TEMPLATE_PATH\)/.test(code),
    "the template is no longer read from the tracked fixture");
  assert.ok(!/A single isolated HAIR LAYER/.test(SRC), "the prompt has been inlined into the tool");
  assert.match(TPL, /A single isolated HAIR LAYER/);
});

test("the round-1 framing defect cannot come back", () => {
  // "Fill the canvas exactly; do not add margins" is what made all seven round-1 candidates
  // 1.6–2.1x oversized (D-111 §3). It must never reappear in the template.
  assert.ok(!/fill the canvas exactly/i.test(TPL));
  assert.ok(!/do not add margins/i.test(TPL));
  assert.match(TPL, /Do NOT scale the hair up to fill the frame/);
  assert.match(TPL, /Generous empty\ntransparent margins/);
});

test("the prompt states the four things the hair must do", () => {
  const p = buildPrompt("short");
  assert.match(p, /SITS ON TOP OF an invisible head/);          // sits on the skull
  assert.match(p, /VOLUME ABOVE the skull/);                     // volume above the crown line
  assert.match(p, /must rise WELL ABOVE that line, not start at/); // not level with the crown
  assert.match(p, /The hair is SMALL within a mostly EMPTY canvas/); // must not fill the canvas
});

test("the prompt carries this style's geometry and no leftover tokens", () => {
  const p = buildPrompt("short");
  assert.match(p, /about 35% of the image WIDTH/);
  assert.match(p, /begins about 7\.9% of the way down/);
  assert.match(p, /reaches only about 23% of the way down/);
  assert.match(p, /the entire bottom 77% of the canvas/);
  assert.ok(!/\{\{|\}\}/.test(p), "an unsubstituted token survived");
});

test("it is a hair layer only — the prompt excludes every other body part", () => {
  const p = buildPrompt("short");
  for (const part of ["NO head", "NO face", "NO eyes", "NO ears", "NO skin", "NO neck",
                      "NO shoulders", "NO body", "NO clothing", "NO accessories"]) {
    assert.ok(p.includes(part), `the prompt no longer excludes: ${part}`);
  }
  assert.match(p, /NEUTRAL GREYSCALE only/, "the luminance-map requirement is gone");
});

test("requestConfig reports the whole contract without the key", () => {
  const c = requestConfig("short");
  assert.equal(c.n, 1);
  assert.equal(c.maxRequests, 1);
  assert.equal(c.retries, 0);
  assert.equal(c.fallbackModel, null);
  assert.equal(c.promptSha256.length, 64);
  assert.ok(!JSON.stringify(c).includes("OPENAI_API_KEY"), "the config mentions the key");
});
