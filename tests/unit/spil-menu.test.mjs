// The Spil menu is the one entrance to the quiz and to Videnkamp.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(REPO, rel), "utf8");

test("hubben åbner Spil-menuen og har ikke et separat Videnkamp-punkt", () => {
  const hub = read("hub.html");
  assert.match(hub, /getElementById\("playBtn"\)\.onclick\s*=\s*\(\)\s*=>\s*\{\s*window\.location\.href\s*=\s*"spil\.html";\s*\}/);
  assert.equal(hub.includes("kampBtn"), false);
  assert.equal(hub.includes("kamp.html"), false);
});

test("spil.html er et internt menupunkt med quiz og Videnkamp", () => {
  const page = read("spil.html");
  assert.match(page, /noindex/);
  assert.match(page, /href="index\.html"/);
  assert.match(page, /href="kamp\.html"/);
  assert.match(page, /href="hub\.html"/);
  assert.match(page, /js\/spil\.js/);
  assert.match(page, /Videnkamp/);
  assert.match(page, />Quiz</);
});

test("quizzen og Videnkamp sender tilbage til menuen", () => {
  const quiz = read("index.html");
  assert.match(quiz, /id="menu-btn"[^>]*>[^<]*Spil/);
  assert.match(quiz, /window\.location\.href\s*=\s*"spil\.html"/);
  assert.match(read("kamp.html"), /id="kamp-back"[^>]*>[^<]*Spil/);
  assert.match(read("js/kamp.js"), /window\.location\.href\s*=\s*"spil\.html"/);
  assert.match(read("js/kamp.js"), /window\.location\.href\s*=\s*"hub\.html"/);
});
