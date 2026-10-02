// English-subject read-aloud: Danish/English language runs (js/read-aloud/lang-segments.js)
// and their playback with one voice per language (provider-webspeech.js).
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { segmentQuestion, segmentOption, LANG_DA, LANG_EN } from "../../js/read-aloud/lang-segments.js";
import { createWebSpeechProvider } from "../../js/read-aloud/provider-webspeech.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Compact form: English runs as [EN:…], Danish runs plain.
const fmt = (segs) => segs.map((s) => (s.lang === LANG_EN ? `[EN:${s.text}]` : s.text)).join(" ");
const q = (text) => fmt(segmentQuestion(text));
const opts = (question, options) => options.map((o) => fmt(segmentOption(o, question, options)));

// ── Questions ─────────────────────────────────────────────────────────────────
test("quoted English inside a Danish frame", () => {
  assert.equal(q("Hvad betyder 'sun'?"), "Hvad betyder [EN:'sun'?]");
  assert.equal(q("Hvilket ord mangler? 'I ___ a dog.'"), "Hvilket ord mangler? [EN:'I ___ a dog.']");
  assert.equal(q("Hvad betyder 'put on' i 'Put on your coat'?"),
    "Hvad betyder [EN:'put on'] i [EN:'Put on your coat'?]");
});

test("quoted Danish when the question asks for the English word", () => {
  assert.equal(q("Hvad hedder 'kat' på engelsk?"), "Hvad hedder 'kat' på engelsk?");
  assert.equal(q("Hvilket ord betyder 'farlig'?"), "Hvilket ord betyder 'farlig'?");
  assert.equal(q("Hvilken sætning betyder 'Jeg kan ikke svømme'?"), "Hvilken sætning betyder 'Jeg kan ikke svømme'?");
  // …but a synonym question quotes English.
  assert.equal(q("Hvilket ord betyder næsten det samme som 'start'?"),
    "Hvilket ord betyder næsten det samme som [EN:'start'?]");
});

test("apostrophes inside English stay inside the quote", () => {
  assert.equal(q("Hvad betyder 'Don't worry!'?"), "Hvad betyder [EN:'Don't worry!'?]");
  assert.equal(q("Læs: 'Jack's dog is called Max.' Hvem er Max?"),
    "Læs: [EN:'Jack's dog is called Max.'] Hvem er Max?");
});

test("a quote is one language: names and false friends inside it do not switch", () => {
  assert.equal(q("Læs: 'Tom has a red ball.' Hvilken farve har bolden?"),
    "Læs: [EN:'Tom has a red ball.'] Hvilken farve har bolden?");
  assert.equal(q("Læs: 'Max likes milk, but he doesn't like juice.' Hvad kan Max IKKE lide?"),
    "Læs: [EN:'Max likes milk, but he doesn't like juice.'] Hvad kan Max IKKE lide?");
  assert.equal(q("Hvad betyder 'He let the cat out of the bag'?"),
    "Hvad betyder [EN:'He let the cat out of the bag'?]");
});

test("an unquoted dash list after the question is English", () => {
  assert.equal(q("Hvilket ord passer IKKE ind? red – blue – dog – green"),
    "Hvilket ord passer IKKE ind? [EN:red – blue – dog – green]");
  assert.equal(q("Hvilket ord passer IKKE ind? January – March – May – Monday"),
    "Hvilket ord passer IKKE ind? [EN:January – March – May – Monday]");
});

test("plain Danish stays one Danish run", () => {
  assert.deepEqual(segmentQuestion("Hvad hedder tallet 3 på engelsk?"),
    [{ text: "Hvad hedder tallet 3 på engelsk?", lang: LANG_DA }]);
});

// ── Options ───────────────────────────────────────────────────────────────────
test("options translate into Danish after 'Hvad betyder'", () => {
  assert.deepEqual(opts("Hvad betyder 'sun'?", ["sø", "sol", "sne", "sko"]), ["sø", "sol", "sne", "sko"]);
});

test("options are English after 'på engelsk' and for grammar", () => {
  assert.deepEqual(opts("Hvad hedder 'kat' på engelsk?", ["cow", "cat", "car", "cap"]),
    ["[EN:cow]", "[EN:cat]", "[EN:car]", "[EN:cap]"]);
  assert.deepEqual(opts("Hvad er datid af 'eat'?", ["ate", "eated", "eaten", "eats"]),
    ["[EN:ate]", "[EN:eated]", "[EN:eaten]", "[EN:eats]"]);
  assert.deepEqual(opts("Hvilket ord betyder næsten det samme som 'happy'?", ["glad", "sad", "bad", "mad"]),
    ["[EN:glad]", "[EN:sad]", "[EN:bad]", "[EN:mad]"]);
});

test("one-word false friends keep the group's language", () => {
  assert.deepEqual(opts("Hvad betyder 'chicken'?", ["kylling", "kirke", "ko", "køkken"]),
    ["kylling", "kirke", "ko", "køkken"]);
  assert.deepEqual(opts("Hvad betyder 'leg'?", ["læbe", "leg", "ben", "lår"]), ["læbe", "leg", "ben", "lår"]);
});

test("mixed options switch inside the option", () => {
  assert.deepEqual(opts("Hvad hedder 'mor' og 'far' på engelsk?", ["mum og dad", "teacher og parent"]),
    ["[EN:mum] og [EN:dad]", "[EN:teacher] og [EN:parent]"]);
  assert.deepEqual(
    opts("Hvad betyder 'What time is it?' og hvad kan man svare?",
      ["Hvad er dato? – It's Monday.", "Hvad er klokken? – It's three o'clock."]),
    ["Hvad er dato? – [EN:It's Monday.]", "Hvad er klokken? – [EN:It's three o'clock.]"]);
  assert.deepEqual(opts("Hvad er 'bigger' et eksempel på?", ["Flertal af big", "Datid af big"]),
    ["Flertal af [EN:big]", "Datid af [EN:big]"]);
});

test("quotes inside a Danish option are English", () => {
  assert.equal(fmt(segmentOption("'Their' betyder deres, 'there' betyder der",
    "Hvad er forskellen på 'their' og 'there'?", ["De betyder det samme"])),
    "[EN:'Their'] betyder deres, [EN:'there'] betyder der");
});

test("Danish loanwords do not switch a Danish option", () => {
  assert.deepEqual(opts("Læs: 'Ali was ill on Monday.' Hvorfor var Ali ikke i skole?",
    ["Det var weekend", "Han var syg"]), ["Det var weekend", "Han var syg"]);
});

test("punctuation is never a run of its own (voices would read it aloud)", () => {
  for (const s of segmentQuestion("Hvad betyder 'sun'?")) assert.match(s.text, /[\p{L}\p{N}]/u);
  assert.deepEqual(segmentQuestion("Hvad betyder 'sun'?").map((s) => s.text), ["Hvad betyder", "'sun'?"]);
});

test("fail-soft on bad input", () => {
  assert.deepEqual(segmentQuestion(""), []);
  assert.deepEqual(segmentQuestion(null), []);
  assert.deepEqual(segmentOption(undefined, "x", []), []);
  assert.doesNotThrow(() => segmentOption("hund", null, null));
  assert.doesNotThrow(() => segmentQuestion("'''unbalanced ' quotes"));
});

// ── Whole English corpus (migrations): never throws, never loses text ─────────
function englishCorpus() {
  const dir = join(REPO, "supabase", "migrations");
  const out = [];
  for (const f of readdirSync(dir).filter((n) => n.includes("english")).sort()) {
    const sql = readFileSync(join(dir, f), "utf8");
    for (const m of sql.matchAll(/\$\$(\{"question".*?)\$\$::jsonb/gs)) {
      const c = JSON.parse(m[1]);
      out.push({ q: c.question, o: c.options });
    }
    const arr = /jsonb_array_elements\(\$\$(\[.*?\])\$\$/s.exec(sql);
    if (arr) for (const e of JSON.parse(arr[1])) out.push({ q: e.q, o: e.o });
  }
  return out;
}
const squash = (s) => s.replace(/\s+/g, "");

test("every English question and option segments without losing text", () => {
  const corpus = englishCorpus();
  assert.ok(corpus.length >= 1000, `expected the English corpus, got ${corpus.length}`);
  for (const item of corpus) {
    const qs = segmentQuestion(item.q);
    assert.equal(squash(qs.map((s) => s.text).join("")), squash(item.q), item.q);
    for (const s of qs) assert.ok(s.lang === LANG_DA || s.lang === LANG_EN);
    for (const o of item.o) {
      const os = segmentOption(o, item.q, item.o);
      assert.equal(squash(os.map((s) => s.text).join("")), squash(o), `${item.q} → ${o}`);
    }
  }
});

// ── Playback: one voice per language run ──────────────────────────────────────
function installSpeech(voices) {
  const spoken = [];
  globalThis.window = {
    speechSynthesis: { getVoices: () => voices, cancel: () => {}, speak: (u) => { spoken.push(u); } },
  };
  globalThis.SpeechSynthesisUtterance = function (text) { this.text = text; };
  return spoken;
}
afterEach(() => {
  delete globalThis.window;
  delete globalThis.SpeechSynthesisUtterance;
});
const v = (name, lang) => ({ name, lang, voiceURI: name });

test("runs are queued in order, each with its own language voice", async () => {
  const spoken = installSpeech([
    v("Microsoft Helle - Danish (Denmark)", "da-DK"),
    v("Microsoft Christel Online (Natural) - Danish (Denmark)", "da-DK"),
    v("Microsoft Aria Online (Natural) - English (United States)", "en-US"),
    v("Microsoft Sonia Online (Natural) - English (United Kingdom)", "en-GB"),
  ]);
  const ok = await createWebSpeechProvider().speak({
    text: "Hvad betyder 'sun'?", lang: "da-DK", segments: segmentQuestion("Hvad betyder 'sun'?"),
  });
  assert.equal(ok, true);
  assert.deepEqual(spoken.map((u) => [u.text, u.lang, u.voice.name]), [
    ["Hvad betyder", "da-DK", "Microsoft Christel Online (Natural) - Danish (Denmark)"],
    ["'sun'?", "en-GB", "Microsoft Sonia Online (Natural) - English (United Kingdom)"],
  ]);
});

test("English falls back to another English voice, never to a Danish one", async () => {
  let spoken = installSpeech([v("Google dansk", "da-DK"), v("Google US English", "en-US")]);
  await createWebSpeechProvider().speak({ text: "x", segments: [{ text: "sun", lang: "en-GB" }] });
  assert.equal(spoken[0].voice.name, "Google US English");

  spoken = installSpeech([v("Google dansk", "da-DK")]);
  await createWebSpeechProvider().speak({ text: "x", segments: [{ text: "sun", lang: "en-GB" }] });
  assert.equal(spoken[0].voice, undefined); // browser default for en-GB
  assert.equal(spoken[0].lang, "en-GB");
});

test("without runs the whole text is read in Danish as before", async () => {
  const spoken = installSpeech([v("Google dansk", "da-DK")]);
  await createWebSpeechProvider().speak({ text: "Hvad betyder 'sun'?" });
  assert.deepEqual(spoken.map((u) => [u.text, u.lang]), [["Hvad betyder 'sun'?", "da-DK"]]);
});

// ── Wiring ────────────────────────────────────────────────────────────────────
test("the quiz passes the subject (and question/options) to the read-aloud controls", () => {
  const app = readFileSync(join(REPO, "app.js"), "utf8");
  assert.match(app, /attachReadAloudControl\(questionElement, question\.content\.question, \{ subject: currentSubject \}\)/);
  assert.match(app, /attachOptionReadAloudControl\(row, option, \{ subject: currentSubject, question: content\.question, options \}\)/);
  const adapter = readFileSync(join(REPO, "js", "read-aloud", "adapters", "quiz.js"), "utf8");
  assert.match(adapter, /context\.subject !== "engelsk"/); // only the English subject is segmented
});
