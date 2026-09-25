// The Spil menu is the entrance to the quiz and to Stabel.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(REPO, rel), "utf8");

test("hubben åbner Spil-menuen", () => {
  const hub = read("hub.html");
  assert.match(hub, /getElementById\("playBtn"\)\.onclick\s*=\s*\(\)\s*=>\s*\{\s*window\.location\.href\s*=\s*"spil\.html";\s*\}/);
  assert.equal(hub.includes("kampBtn"), false);
  assert.equal(hub.includes("kamp.html"), false);
  assert.equal(hub.includes("Videnkamp"), false);
});

test("spil.html har quiz og Stabel, ikke Videnkamp", () => {
  const page = read("spil.html");
  assert.match(page, /noindex/);
  assert.match(page, /href="index\.html"/);
  assert.match(page, /href="stabel\.html"/);
  assert.match(page, /href="hub\.html"/);
  assert.match(page, />Quiz</);
  assert.match(page, />Stabel</);
  assert.equal(page.includes("kamp.html"), false);
  assert.equal(page.includes("Videnkamp"), false);
});

test("quizzen og Stabel sender tilbage til menuen", () => {
  const quiz = read("index.html");
  assert.match(quiz, /id="menu-btn"[^>]*>[^<]*Spil/);
  assert.match(quiz, /window\.location\.href\s*=\s*"spil\.html"/);
  assert.match(read("stabel.html"), /href="spil\.html"/);
});
