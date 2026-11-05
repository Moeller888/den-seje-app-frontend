
// The Spil menu is the entrance to the quizzes. Since D-347 the minigames are NOT listed here: they are
// offered only as a spillepause inside the quiz, after 20 minutes of active quiz time.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(REPO, rel), "utf8");
const GAMES = ["stabel", "husk", "naal", "kloeft", "hop", "brud", "slope"];

test("hubben åbner Spil-menuen", () => {
  const hub = read("hub.html");
  assert.match(hub, /getElementById\("playBtn"\)\.onclick\s*=\s*\(\)\s*=>\s*\{\s*window\.location\.href\s*=\s*"spil\.html";\s*\}/);
  assert.equal(hub.includes("kampBtn"), false);
  assert.equal(hub.includes("kamp.html"), false);
  assert.equal(hub.includes("Videnkamp"), false);
});

test("spil.html har de tre quizzer — og ingen minispil (D-347)", () => {
  const page = read("spil.html");
  assert.match(page, /noindex/);
  assert.match(page, /href="index\.html"/);
  assert.match(page, /href="index\.html\?fag=engelsk"/);
  assert.match(page, /href="index\.html\?fag=dansk"/);
  assert.match(page, /href="hub\.html"/);
  assert.match(page, />Quiz</);
  for (const game of GAMES) {
    assert.equal(page.includes(game + ".html"), false, game + " er stadig i menuen");
  }
  assert.equal(page.includes("Minigames"), false);
  assert.equal(page.includes('role="tab"'), false);
  assert.equal(page.includes("kamp.html"), false);
  assert.equal(page.includes("Videnkamp"), false);
  // The pupil is told where the games went.
  assert.match(page, /tilbudt en lille spillepause/);
  const js = read("js/spil.js").replace(/\/\/.*$/gm, "");
  assert.equal(js.includes("minigames"), false);
  assert.equal(js.includes("fane"), false);
});

test("ingen side i appen linker frit til et minispil", () => {
  const pages = ["hub.html", "index.html", "spil.html", "shop.html", "avatar.html", "themes.html",
    "achievements.html", "collection.html", "leaderboard.html", "app.js", "js/spil.js"];
  for (const p of pages) {
    const src = read(p);
    for (const game of GAMES) {
      assert.equal(new RegExp('href="' + game + '\\.html').test(src), false, p + " → " + game);
    }
  }
});

test("quizzen sender tilbage til menuen, og spillene sender tilbage til quizzen", () => {
  const quiz = read("index.html");
  assert.match(quiz, /id="menu-btn"[^>]*>[^<]*Spil/);
  assert.match(quiz, /window\.location\.href\s*=\s*"spil\.html"/);
  for (const game of GAMES) {
    const html = read(game + ".html");
    assert.equal(html.includes("spil.html"), false, game);
    assert.equal((html.match(/href="index\.html"/g) || []).length, 2, game);
    assert.match(html, />← Quizzen</, game);
    assert.match(html, />Tilbage til quizzen</, game);
  }
});
