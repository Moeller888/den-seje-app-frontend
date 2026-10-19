// The Spil menu is the entrance to the quiz and to the games.
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
  assert.match(page, /href="husk\.html"/);
  assert.match(page, /href="naal\.html"/);
  assert.match(page, /href="kloeft\.html"/);
  assert.match(page, /href="hop\.html"/);
  assert.match(page, /href="brud\.html"/);
  assert.match(page, /href="slope\.html"/);
  assert.match(page, /href="hub\.html"/);
  assert.match(page, />Quiz</);
  assert.match(page, />Stabel</);
  assert.match(page, />Husk</);
  assert.match(page, />Nål</);
  assert.match(page, />Kløft</);
  assert.match(page, />Hop</);
  assert.match(page, />Brud</);
  assert.match(page, />Slope</);
  assert.equal(page.includes("kamp.html"), false);
  assert.equal(page.includes("Videnkamp"), false);
});

test("spillene ligger under fanen Minigames, quizzerne under Fag", () => {
  const page = read("spil.html");
  const panel = (id) => {
    const m = page.match(new RegExp('<nav[^>]*id="' + id + '"[^>]*>([\\s\\S]*?)</nav>'));
    assert.ok(m, "mangler " + id);
    return m[1];
  };
  assert.match(page, /role="tab"[^>]*id="spil-tab-fag"[^>]*>Fag</);
  assert.match(page, /role="tab"[^>]*id="spil-tab-minigames"[^>]*>Minigames</);
  const fag = panel("spil-panel-fag");
  const mini = panel("spil-panel-minigames");
  assert.match(fag, /href="index\.html"/);
  assert.match(fag, /href="index\.html\?fag=engelsk"/);
  for (const game of ["stabel", "husk", "naal", "kloeft", "hop", "brud", "slope"]) {
    assert.match(mini, new RegExp('href="' + game + '\\.html"'), game);
    assert.equal(fag.includes(game + ".html"), false, game + " ligger under Fag");
  }
  assert.equal(mini.includes("index.html"), false);
  const js = read("js/spil.js");
  assert.match(js, /get\("fane"\)/);
  assert.match(js, /"minigames"/);
});

test("quizzen og spillene sender tilbage til menuen", () => {
  const quiz = read("index.html");
  assert.match(quiz, /id="menu-btn"[^>]*>[^<]*Spil/);
  assert.match(quiz, /window\.location\.href\s*=\s*"spil\.html"/);
  // Minigames send back to the Minigames tab, not to the quizzes.
  for (const game of ["stabel", "husk", "naal", "kloeft", "hop", "brud", "slope"]) {
    const html = read(game + ".html");
    assert.match(html, /href="spil\.html\?fane=minigames"/, game);
    assert.equal(html.includes('href="spil.html"'), false, game);
  }
});
