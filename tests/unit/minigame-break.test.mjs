// D-347 spillepauser — the client side: js/minigame-break.js (quiz), js/minigame-pass.js (game pages) and
// their wiring into app.js and the seven game pages. The server side is proven at runtime by
// minigame-breaks-migration-run.test.mjs; the browser journey by tests/minigame-break.spec.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MINIGAME_CATALOG, YES_LABEL, NO_LABEL, OFFER_SUBTEXT, gameByKey, offerHeading, quizUrl, breakGameUrl,
  isOfferId, createVisibleTimer, parseAfterAnswer, checkBreakAfterAnswer, respondToOffer,
} from "../../js/minigame-break.js";
import { readPass } from "../../js/minigame-pass.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(REPO, rel), "utf8").split("\r\n").join("\n");
const ID = "3f2c9a1e-7b4d-4c2a-9e1f-0a1b2c3d4e5f";
const GAMES = ["stabel", "husk", "naal", "kloeft", "hop", "brud", "slope"];

// ── registry ──────────────────────────────────────────────────────────────────────────────────────

test("the catalog is the seven existing games, each with its own page, and the server enables the same keys", () => {
  assert.deepEqual(MINIGAME_CATALOG.map((g) => g.key), GAMES);
  assert.deepEqual(MINIGAME_CATALOG.map((g) => g.name), ["Stabel", "Husk", "Nål", "Kløft", "Hop", "Brud", "Slope"]);
  for (const g of MINIGAME_CATALOG) {
    assert.equal(g.page, g.key + ".html");
    assert.ok(read(g.page).includes(`id="${g.key}-root"`), g.key);
  }
  const sql = read("supabase/migrations/20261105090000_minigame_breaks.sql");
  const seed = /INSERT INTO public\.minigame_break_games \(game_key\) VALUES\s*([^;]+?)\s*ON CONFLICT/.exec(sql);
  assert.ok(seed, "seed statement");
  assert.deepEqual([...seed[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]), GAMES);
  assert.equal(Object.isFrozen(MINIGAME_CATALOG), true);
});

test("the 10-minute interval (D-364) is defined once, in the SQL function, and not repeated on the client", () => {
  // The effective definition is the LAST migration (in timestamp order) that (re)creates the function.
  const files = readdirSync(join(REPO, "supabase/migrations")).filter((f) => /^\d{14}_.*\.sql$/.test(f)).sort();
  const defining = files.filter((f) =>
    /CREATE OR REPLACE FUNCTION public\.minigame_break_after_answer\(/.test(read("supabase/migrations/" + f)));
  assert.deepEqual(defining, ["20261105090000_minigame_breaks.sql", "20261107090000_minigame_break_interval_10min.sql"]);
  const last = read("supabase/migrations/" + defining.at(-1));
  assert.match(last, /c_interval\s+CONSTANT integer\s+:= 600;\s+-- MINIGAME_INTERVAL_SECONDS: 10 minutes/);
  assert.equal((last.match(/c_interval\s+CONSTANT/g) || []).length, 1);
  for (const f of ["js/minigame-break.js", "js/minigame-pass.js", "app.js"]) {
    assert.equal(/\b1200\b/.test(read(f).replace(/\/\/.*$/gm, "")), false, f);
  }
  for (const f of ["js/minigame-break.js", "js/minigame-pass.js"]) {
    assert.equal(/\b600\b/.test(read(f).replace(/\/\/.*$/gm, "")), false, f);
  }
});

test("the pupil-facing texts say 10 minutes, never 20 (D-364)", () => {
  const pass = read("js/minigame-pass.js");
  const spil = read("spil.html");
  assert.ok(pass.includes("Når du har arbejdet med dine opgaver i 10 minutter, får du tilbudt et spil."));
  assert.ok(spil.includes("Når du har arbejdet med dine opgaver i 10 minutter, får du tilbudt en lille spillepause med et minispil."));
  for (const [name, s] of [["minigame-pass.js", pass], ["spil.html", spil], ["minigame-break.js", read("js/minigame-break.js")]]) {
    assert.equal(/20 minutter/.test(s), false, name);
  }
});

test("gameByKey knows exactly the catalog", () => {
  assert.equal(gameByKey("brud").name, "Brud");
  for (const bad of ["", "spil", "BRUD", null, undefined, 3, "__proto__"]) assert.equal(gameByKey(bad), null);
});

// ── the dialog's words ────────────────────────────────────────────────────────────────────────────

test("the offer says exactly 'Har du lyst til et spil {navn}?' with the two prescribed answers", () => {
  assert.equal(offerHeading("Brud"), "Har du lyst til et spil Brud?");
  assert.equal(offerHeading("Nål"), "Har du lyst til et spil Nål?");
  assert.equal(YES_LABEL, "Ja tak");
  assert.equal(NO_LABEL, "Nej, ellers tak");
  assert.equal(OFFER_SUBTEXT, "Du har arbejdet godt! Har du lyst til en lille spillepause?");
  const src = read("js/minigame-break.js");
  for (const banned of ["Spil nu", "Lad os spille", "Måske senere", "Spring over", '"Nej tak"', "Accepter", "Afvis"]) {
    assert.equal(src.includes(banned), false, banned);
  }
  // A native modal dialog; Escape does not close it (no third, ambiguous answer).
  assert.match(src, /dialog\.showModal\(\)/);
  assert.match(src, /addEventListener\("cancel", \(event\) => event\.preventDefault\(\)\)/);
  assert.match(src, /if \(done\) return;\s+done = true;\s+yes\.disabled = true;\s+no\.disabled = true;/);
});

// ── addresses ─────────────────────────────────────────────────────────────────────────────────────

test("the game address carries only the pass and a known subject; the way back keeps the subject", () => {
  const brud = gameByKey("brud");
  assert.equal(breakGameUrl(brud, ID, "historie"), "brud.html?pause=" + ID);
  assert.equal(breakGameUrl(brud, ID, "dansk"), "brud.html?pause=" + ID + "&fag=dansk");
  assert.equal(breakGameUrl(brud, ID, "<script>"), "brud.html?pause=" + ID);
  assert.equal(breakGameUrl(brud, "not-a-uuid", "dansk"), null);
  assert.equal(breakGameUrl(null, ID), null);
  assert.equal(quizUrl("engelsk"), "index.html?fag=engelsk");
  assert.equal(quizUrl("historie"), "index.html");
  assert.equal(quizUrl("javascript:alert(1)"), "index.html");
  assert.deepEqual(readPass("?pause=" + ID + "&fag=dansk"), { offerId: ID, subject: "dansk" });
  assert.deepEqual(readPass("?pause=1' OR 1=1&fag=x"), { offerId: null, subject: null });
  assert.deepEqual(readPass(""), { offerId: null, subject: null });
  assert.deepEqual(readPass(undefined), { offerId: null, subject: null });
  assert.equal(isOfferId(ID.toUpperCase()), true);
  assert.equal(isOfferId(ID + "x"), false);
});

// ── visible time ──────────────────────────────────────────────────────────────────────────────────

function fakeDoc() {
  const listeners = new Set();
  return {
    visibilityState: "visible",
    addEventListener: (t, f) => { if (t === "visibilitychange") listeners.add(f); },
    removeEventListener: (t, f) => { if (t === "visibilitychange") listeners.delete(f); },
    set(state) { this.visibilityState = state; for (const f of listeners) f(); },
    listeners,
  };
}

test("visible time: counts only while the page is visible, restarts per question, ignores clock jumps", () => {
  let t = 0;
  const doc = fakeDoc();
  const timer = createVisibleTimer({ now: () => t, doc });
  t = 30_000;
  assert.equal(timer.seconds(), 30);
  doc.set("hidden");                     // the pupil switches tab for 10 minutes
  t = 630_000;
  assert.equal(timer.seconds(), 30, "background time does not count");
  doc.set("visible");
  t = 645_000;
  assert.equal(timer.seconds(), 45);
  timer.restart();                       // next question
  assert.equal(timer.seconds(), 0);
  t = 640_000;                           // a clock going backwards never gives negative time
  assert.equal(timer.seconds(), 0);
  timer.dispose();
  assert.equal(doc.listeners.size, 0, "the listener is removed");
});

test("visible time: a page that starts hidden counts nothing until shown", () => {
  let t = 0;
  const doc = fakeDoc();
  doc.visibilityState = "hidden";
  const timer = createVisibleTimer({ now: () => t, doc });
  t = 100_000;
  assert.equal(timer.seconds(), 0);
  doc.set("visible");
  t = 112_500;
  assert.equal(timer.seconds(), 12);
});

// ── server replies ────────────────────────────────────────────────────────────────────────────────

test("parseAfterAnswer accepts only a well-formed offer for a known game", () => {
  assert.deepEqual(parseAfterAnswer({ status: "ok", offer: null }), { offer: null, valid: true });
  assert.deepEqual(parseAfterAnswer({ status: "ok", offer: { id: ID, game: "husk" } }).offer, { id: ID, game: gameByKey("husk") });
  for (const bad of [null, undefined, "x", [], {}, { status: "error" }, { status: "ok", offer: { id: "x", game: "husk" } },
    { status: "ok", offer: { id: ID, game: "tetris" } }, { status: "ok", offer: "brud" }]) {
    assert.equal(parseAfterAnswer(bad).offer, null, JSON.stringify(bad));
  }
});

function fakeClient(reply) {
  const calls = [];
  return {
    calls,
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (reply instanceof Error) throw reply;
      return typeof reply === "function" ? reply(fn, args) : reply;
    },
  };
}

test("checkBreakAfterAnswer sends the instance and visible seconds, and fails soft on every error", async () => {
  const ok = fakeClient({ data: { status: "ok", offer: { id: ID, game: "brud" } }, error: null });
  assert.deepEqual(await checkBreakAfterAnswer(ok, "inst-1", 42.9), { offer: { id: ID, game: gameByKey("brud") }, error: null });
  assert.deepEqual(ok.calls, [{ fn: "minigame_break_after_answer", args: { p_question_instance_id: "inst-1", p_visible_seconds: 42 } }]);

  const noVisible = fakeClient({ data: { status: "ok", offer: null }, error: null });
  await checkBreakAfterAnswer(noVisible, "inst-1", Number.NaN);
  assert.equal(noVisible.calls[0].args.p_visible_seconds, null);

  for (const [client, why] of [
    [fakeClient({ data: null, error: { message: "function does not exist" } }), "rpc_error"],
    [fakeClient(new Error("network")), "threw"],
    [fakeClient({ data: { status: "ok", offer: { id: "bad" } }, error: null }), "invalid_reply"],
  ]) {
    assert.deepEqual(await checkBreakAfterAnswer(client, "inst-1", 1), { offer: null, error: why });
  }
  assert.equal((await checkBreakAfterAnswer(null, "inst-1", 1)).offer, null);
  assert.equal((await checkBreakAfterAnswer(ok, null, 1)).offer, null);
});

test("respondToOffer is ok only when the server confirms the requested choice", async () => {
  const accepted = fakeClient({ data: { status: "ok", offer_status: "accepted" }, error: null });
  assert.deepEqual(await respondToOffer(accepted, ID, true), { ok: true, offerStatus: "accepted" });
  assert.deepEqual(accepted.calls[0], { fn: "minigame_break_respond", args: { p_offer_id: ID, p_accept: true } });
  const conflict = fakeClient({ data: { status: "conflict", offer_status: "declined" }, error: null });
  assert.deepEqual(await respondToOffer(conflict, ID, true), { ok: false, offerStatus: "declined" });
  assert.deepEqual(await respondToOffer(fakeClient(new Error("x")), ID, false), { ok: false, offerStatus: null });
});

// ── wiring: the quiz ──────────────────────────────────────────────────────────────────────────────

test("app.js: the module is loaded dynamically and fail-soft (the quiz never depends on it)", () => {
  const app = read("app.js");
  assert.equal(/^import [^;]*minigame-break/m.test(app), false, "no static import");
  assert.match(app, /import\("\.\/js\/minigame-break\.js"\)\.catch\(/);
});

test("app.js: a break is considered only after a registered answer, and offered before the next question loads", () => {
  const app = read("app.js");
  const submit = app.slice(app.indexOf("async function submitAnswer("), app.indexOf("async function getNextQuestion("));
  const check = submit.indexOf("requestBreakCheck(currentInstanceId)");
  assert.ok(check > 0);
  // after the error and invalid-response exits, before any status branch
  assert.ok(check > submit.indexOf('logError("INVALID_RESPONSE", data)'));
  assert.ok(check < submit.indexOf('if (data.status === "pending") {'));
  assert.match(submit, /if \(data\.status === "correct" \|\| data\.status === "incorrect" \|\| data\.status === "pending"\) \{\s+requestBreakCheck\(currentInstanceId\);/);
  assert.equal((app.match(/requestBreakCheck\(/g) || []).length, 2, "defined once, called once");

  const load = app.slice(app.indexOf("async function loadAndRenderQuestion("));
  const offer = load.indexOf("if (await offerBreakIfDue()) return;");
  assert.ok(offer > 0 && offer < load.indexOf("await getNextQuestion()"), "offered before the next question is fetched");
  // D-350 × D-347 (owner 2026-11-05): an anti-gætte-pause comes FIRST; an offer earned by the same answer
  // is held (heldBreakOffer) and offered when the pause is over — never during it, never dropped.
  const pause = load.indexOf("syncCooldownFromServer({ afterWrongAnswer: true })");
  assert.ok(pause > 0 && pause < offer, "the pause check precedes the offer");
  assert.match(load, /if \(await syncCooldownFromServer\(\{ afterWrongAnswer: true \}\)\) \{\s+const earned = await takeBreakOffer\(\);\s+if \(earned\) heldBreakOffer = earned;\s+return;\s+\}/);
  assert.match(app, /const offer = heldBreakOffer \?\? await takeBreakOffer\(\);\s+heldBreakOffer = null;/);
  // D-347 adds no states and no transitions to the quiz state machine. The one later transition out of
  // TRANSITIONING is the anti-gætte-pause's COOLDOWN (D-350, docs/quiz-anti-guess-cooldown.md) — nothing
  // of the break's.
  assert.match(app, /TRANSITIONING: \["LOADING_QUESTION", "COOLDOWN"\]/);
  assert.equal((app.match(/UI_STATES\.[A-Z_]+/g) || []).some((s) => /BREAK|MINIGAME/.test(s)), false);
  // A page restored from the back/forward cache after leaving for a game is reloaded.
  assert.match(app, /if \(event\.persisted && leftForBreak\) window\.location\.reload\(\);/);
});

test("index.html loads the dialog's stylesheet", () => {
  assert.match(read("index.html"), /href="css\/minigame-break\.css"/);
});

// ── wiring: the seven game pages ──────────────────────────────────────────────────────────────────

test("every game redeems a pass before anything is playable, plays one round, and offers the way back", () => {
  for (const g of GAMES) {
    const js = read(`js/${g}.js`);
    assert.match(js, /import \{ enterBreakGame \} from "\.\/minigame-pass\.js";/, g);
    assert.match(js, new RegExp(`pass = await enterBreakGame\\(\\{ client: supabase, gameKey: "${g}" \\}\\);\\s+if \\(!pass\\) return;`), g);
    assert.match(js, /function startRound\(\) \{\s+if \(!pass \|\| !pass\.beginRound\(\)\) return;/, g);
    assert.equal((js.match(/pass\?\.endRound\(\);/g) || []).length, 1, g);
    // the pass is redeemed right after the auth guard, before the canvas/board is wired up
    assert.ok(js.indexOf("enterBreakGame({") < js.indexOf(`$("${g}-start")?.addEventListener`), g);
    assert.match(read(`${g}.html`), /href="css\/minigame-break\.css"/, g);
  }
});

test("no minigame pays anything (D-347): no game calls an RPC — Stabel included — and the pass module pays nothing", () => {
  for (const g of GAMES) {
    const code = read(`js/${g}.js`).replace(/\/\/.*$/gm, "");
    assert.equal(/\.rpc\(|functions\.invoke\(|\.from\(/.test(code), false, g + " talks to the backend directly");
    assert.equal(code.includes("claim_stabel_reward"), false, g);
  }
  const pass = read("js/minigame-pass.js");
  assert.deepEqual([...pass.matchAll(/rpc\("([a-z_]+)"/g)].map((m) => m[1]), ["minigame_break_start", "minigame_break_finish"]);
  const brk = read("js/minigame-break.js");
  assert.deepEqual([...brk.matchAll(/rpc\("([a-z_]+)"/g)].map((m) => m[1]), ["minigame_break_after_answer", "minigame_break_respond"]);
  const code = (src) => src.replace(/\/\/.*$/gm, "");   // comments may explain; code may not pay
  for (const src of [pass, brk].map(code)) {
    for (const banned of [/process-event/, /student_progress/, /\bcoins?\b/i, /\bxp\b/i, /Math\.random/]) {
      assert.equal(banned.test(src), false, String(banned));
    }
  }
});

test("the pass module: the start button stays disabled until the pass is redeemed; 'Igen' is hidden", () => {
  const src = read("js/minigame-pass.js");
  const disable = src.indexOf("if (startBtn) startBtn.disabled = true;");
  const redeem = src.indexOf("await redeem(client, pass.offerId, gameKey)");
  const enable = src.indexOf("if (startBtn) startBtn.disabled = false;");
  assert.ok(disable > 0 && disable < redeem && redeem < enable);
  assert.match(src, /if \(again\) again\.hidden = true;/);
  assert.match(src, /hist\.replaceState\(null, "", loc\.pathname\)/, "the spent pass leaves the address bar");
});
