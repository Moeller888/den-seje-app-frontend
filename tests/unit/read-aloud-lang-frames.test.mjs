// English-subject read-aloud: the question frame decides the language of quotes and options
// (js/read-aloud/lang-segments.js), checked over every English question in the repository's
// migrations, and followed all the way to the Azure voice the Worker asks for.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { segmentQuestion, segmentOption, LANG_DA, LANG_EN } from "../../js/read-aloud/lang-segments.js";
import { createAzureProvider } from "../../js/read-aloud/provider-azure.js";
import { TTS_VOICES } from "../../js/read-aloud/tts-key.js";
import worker, { TtsClipCoordinator } from "../../worker/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Compact form: English runs as [EN:…], Danish runs plain.
const fmt = (segs) => segs.map((s) => (s.lang === LANG_EN ? `[EN:${s.text}]` : s.text)).join(" ");
const q = (text) => fmt(segmentQuestion(text));
const opts = (question, options) => options.map((o) => fmt(segmentOption(o, question, options)));

// ── The two frame errors found in the English corpus (2026-11-13) ────────────
test("plural of an English word: the options are English even when they are Danish words", () => {
  // "men" and "mens" are also Danish ("but", "while"); the frame asks for an English form.
  assert.deepEqual(opts("Hvad er flertal af 'man'?", ["mans", "mens", "men", "manes"]),
    ["[EN:mans]", "[EN:mens]", "[EN:men]", "[EN:manes]"]);
});

test("synonym of an English word: the quoted word is English even when it is a Danish word", () => {
  // "end" is also Danish ("than"); the frame asks for a synonym of the English word.
  assert.equal(q("Hvilket ord betyder næsten det samme som 'end'?"),
    "Hvilket ord betyder næsten det samme som [EN:'end'?]");
});

test("deliberately mixed texts keep their Danish parts", () => {
  assert.deepEqual(opts("Hvad hedder 'mor' og 'far' på engelsk?", ["mum og dad", "aunt og uncle"]),
    ["[EN:mum] og [EN:dad]", "[EN:aunt] og [EN:uncle]"]);
  assert.deepEqual(opts("Hvad er 'bigger' et eksempel på?", ["Flertal af big", "Det modsatte af big"]),
    ["Flertal af [EN:big]", "Det modsatte af [EN:big]"]);
  // A word-form frame that asks for the word "på engelsk" still quotes Danish.
  assert.equal(q("Hvad er det modsatte af 'varm' på engelsk?"), "Hvad er det modsatte af 'varm' på engelsk?");
});

// ── Every known English question frame ───────────────────────────────────────
// [frame, question, options, expected question, expected options]
const FRAMES = [
  ["passer", "Hvilket ord passer: 'My brother ___ football every Saturday.'", ["play", "plays", "is playing"],
    "Hvilket ord passer: [EN:'My brother ___ football every Saturday.']", ["[EN:play]", "[EN:plays]", "[EN:is playing]"]],
  ["passer, Danish-looking options", "Hvilket ord passer: 'Those ___ are very tall.'", ["mans", "men", "mens"],
    "Hvilket ord passer: [EN:'Those ___ are very tall.']", ["[EN:mans]", "[EN:men]", "[EN:mens]"]],
  ["mangler", "Hvilket ord mangler? 'You ___ my friend.'", ["are", "is", "am"],
    "Hvilket ord mangler? [EN:'You ___ my friend.']", ["[EN:are]", "[EN:is]", "[EN:am]"]],
  ["passer IKKE (dash list)", "Hvilket ord passer IKKE ind? red – blue – dog – green", ["red", "blue", "dog", "green"],
    "Hvilket ord passer IKKE ind? [EN:red – blue – dog – green]", ["[EN:red]", "[EN:blue]", "[EN:dog]", "[EN:green]"]],
  ["hedder … på engelsk", "Hvad hedder 'kat' på engelsk?", ["cow", "cat", "car"],
    "Hvad hedder 'kat' på engelsk?", ["[EN:cow]", "[EN:cat]", "[EN:car]"]],
  ["hedder … på engelsk i '…'", "Hvad hedder 'stige' på engelsk i 'Dad climbed the ___ to clean the roof.'?", ["ladder", "stairs", "lift"],
    "Hvad hedder 'stige' på engelsk i [EN:'Dad climbed the ___ to clean the roof.'?]", ["[EN:ladder]", "[EN:stairs]", "[EN:lift]"]],
  ["regnestykke på engelsk", "Hvad er 'two plus three' på engelsk?", ["five", "six", "four"],
    "Hvad er [EN:'two plus three'] på engelsk?", ["[EN:five]", "[EN:six]", "[EN:four]"]],
  ["betyder 'x'?", "Hvad betyder 'dog' på dansk?", ["hund", "kat", "fugl"],
    "Hvad betyder [EN:'dog'] på dansk?", ["hund", "kat", "fugl"]],
  ["betyder 'x'?", "Hvad betyder 'basement'?", ["kælder", "køkken", "loft"],
    "Hvad betyder [EN:'basement'?]", ["kælder", "køkken", "loft"]],
  ["betyder 'x' i '…'", "Hvad betyder 'fair' i 'That's not fair!'?", ["smukt", "retfærdigt", "lyst"],
    "Hvad betyder [EN:'fair'] i [EN:'That's not fair!'?]", ["smukt", "retfærdigt", "lyst"]],
  ["hvilket ord betyder 'dansk'", "Hvilket ord betyder 'farlig'?", ["dangerous", "different", "difficult"],
    "Hvilket ord betyder 'farlig'?", ["[EN:dangerous]", "[EN:different]", "[EN:difficult]"]],
  ["hvilken sætning betyder 'dansk'", "Hvilken sætning betyder 'Jeg kan ikke svømme'?", ["I can't swim.", "I can swim."],
    "Hvilken sætning betyder 'Jeg kan ikke svømme'?", ["[EN:I can't swim.]", "[EN:I can swim.]"]],
  ["synonym", "Hvilket ord betyder næsten det samme som 'happy'?", ["glad", "sad", "bad"],
    "Hvilket ord betyder næsten det samme som [EN:'happy'?]", ["[EN:glad]", "[EN:sad]", "[EN:bad]"]],
  ["synonym of a Danish-looking word", "Hvilket ord betyder næsten det samme som 'end'?", ["finish", "begin", "start"],
    "Hvilket ord betyder næsten det samme som [EN:'end'?]", ["[EN:finish]", "[EN:begin]", "[EN:start]"]],
  ["modsatte", "Hvad er det modsatte af 'hot'?", ["cold", "warm", "big"],
    "Hvad er det modsatte af [EN:'hot'?]", ["[EN:cold]", "[EN:warm]", "[EN:big]"]],
  ["datid af", "Hvad er datid af 'eat'?", ["ate", "eated", "eaten"],
    "Hvad er datid af [EN:'eat'?]", ["[EN:ate]", "[EN:eated]", "[EN:eaten]"]],
  ["flertal af", "Hvad er flertal af 'man'?", ["mans", "mens", "men"],
    "Hvad er flertal af [EN:'man'?]", ["[EN:mans]", "[EN:mens]", "[EN:men]"]],
  ["Læs: … (Danish answers)", "Læs: 'Tom has a red ball.' Hvilken farve har bolden?", ["rød", "blå", "grøn"],
    "Læs: [EN:'Tom has a red ball.'] Hvilken farve har bolden?", ["rød", "blå", "grøn"]],
  ["Læs: … (loanword in a Danish answer)", "Læs: 'Ali was ill on Monday.' Hvorfor var Ali ikke i skole?", ["Det var weekend", "Han var syg"],
    "Læs: [EN:'Ali was ill on Monday.'] Hvorfor var Ali ikke i skole?", ["Det var weekend", "Han var syg"]],
  ["hvilken farve", "Hvilken farve er 'red'?", ["blå", "rød", "gul"],
    "Hvilken farve er [EN:'red'?]", ["blå", "rød", "gul"]],
  ["mixed answers", "Hvad betyder 'What time is it?' og hvad kan man svare?", ["Hvad er klokken? – It's three o'clock."],
    "Hvad betyder [EN:'What time is it?'] og hvad kan man svare?", ["Hvad er klokken? – [EN:It's three o'clock.]"]],
];

for (const [frame, question, options, wantQ, wantO] of FRAMES) {
  test(`frame "${frame}": ${question}`, () => {
    assert.equal(q(question), wantQ);
    assert.deepEqual(opts(question, options), wantO);
  });
}

// ── Whole English corpus: every frame-decided language holds ─────────────────
// Reads only repository files; deterministic. The expectations come from the wording of the
// question, written here independently of the segmenter's rules. Only frames that decide the
// language are checked, and inside them the deliberately mixed parts are allowed: Danish
// connectors between English words ("mum og dad") and quoted spans inside an option.
function englishCorpus() {
  const dir = join(REPO, "supabase", "migrations");
  const out = [];
  for (const f of readdirSync(dir).filter((n) => n.includes("english")).sort()) {
    const sql = readFileSync(join(dir, f), "utf8");
    for (const m of sql.matchAll(/\$\$(\{"question".*?)\$\$::jsonb/gs)) {
      const c = JSON.parse(m[1]);
      out.push({ file: f, q: c.question, o: c.options });
    }
    const arr = /jsonb_array_elements\(\$\$(\[.*?\])\$\$/s.exec(sql);
    if (arr) for (const e of JSON.parse(arr[1])) out.push({ file: f, q: e.q, o: e.o });
  }
  return out;
}

// A quoted span: ' … ' whose quote marks are not between letters ("don't" stays inside).
const QUOTE_RE = /(?<!\p{L})'((?:[^']|(?<=\p{L})'(?=\p{L}))+)'(?!\p{L})/gu;
const WORD_RE = /\p{L}+(?:'\p{L}+)*/gu;
const CONNECTORS = new Set(["og", "eller"]);

// Language of every character of `text`, from its segments (runs appear in order).
function langAt(text, segments) {
  const at = new Array(text.length).fill(null);
  let from = 0;
  for (const s of segments) {
    const i = text.indexOf(s.text, from);
    if (i < 0) return null;
    for (let k = i; k < i + s.text.length; k++) at[k] = s.lang;
    from = i + s.text.length;
  }
  return at;
}
// Words of text[start, end) whose language is not `want`.
function wrongWords(text, at, start, end, want, allowConnectors) {
  const bad = [];
  for (const m of text.slice(start, end).matchAll(WORD_RE)) {
    if (allowConnectors && CONNECTORS.has(m[0].toLowerCase())) continue;
    if (at[start + m.index] !== want) bad.push(m[0]);
  }
  return bad;
}

// What the wording decides: the language of the quotes before / after the frame phrase,
// and of the answer options. null = not decided by the frame, not checked.
function expectation(question) {
  const lower = question.toLowerCase();
  if (lower.includes("på engelsk")) return { beforePhrase: lower.indexOf("på engelsk"), options: LANG_EN };
  if (/^hvilke[nt]? (ord|form) (passer|mangler)\b/.test(lower)) return { quote: LANG_EN, options: LANG_EN };
  if (/samme som|modsatte|\b(datid|flertal|ental|nutid|førnutid|tillægsform|grundform|navneform) af\b/.test(lower)) {
    return { quote: LANG_EN, options: LANG_EN };
  }
  if (/^hvad betyder '[^']+'( på dansk)?\??$/.test(lower) || /^hvad betyder '[^']+' i '/.test(lower)) {
    return { quote: LANG_EN, options: LANG_DA };
  }
  if (/^læs: '/.test(lower)) return { firstQuote: LANG_EN };
  return null;
}
// The example sentence after "…på engelsk i '…'" is either the English sentence with the gap
// ("i 'Dad climbed the ___.'") or the Danish context of the Danish word ("'kop' … i 'en kop te'").
// Any other sentence is not decided by the wording and is not checked.
function contextSentenceLang(sentence, askedQuotes) {
  if (/_{2,}/.test(sentence)) return LANG_EN;
  const s = sentence.toLowerCase();
  const asked = askedQuotes.map((y) => y.text.slice(1, -1).toLowerCase());
  return asked.some((w) => w.length > 0 && s.includes(w.slice(0, Math.max(3, w.length - 2)))) ? LANG_DA : null;
}
// A quoted arithmetic task ("Hvad er 'two plus three' på engelsk?") is English: the pupil
// works it out and answers in English.
const ARITHMETIC = /\b(plus|minus|times)\b/;
// Danish frame words: never read with the English voice outside a quote.
const DA_FRAME_WORDS = new Set(["hvad", "hvilket", "hvilken", "hvilke", "betyder", "hedder", "ord", "ordet",
  "mangler", "passer", "sætningen", "dansk", "engelsk", "flertal", "datid", "modsatte", "samme", "læs"]);

const SEGMENTER = { question: segmentQuestion, option: segmentOption };

function frameProblems(item, seg = SEGMENTER) {
  const problems = [];
  const qs = seg.question(item.q);
  const at = langAt(item.q, qs);
  if (!at) return [`question runs do not map back onto the text: ${fmt(qs)}`];
  const quotes = [...item.q.matchAll(QUOTE_RE)].map((m) => ({ start: m.index, end: m.index + m[0].length, text: m[0] }));
  const inQuote = (i) => quotes.some((x) => i >= x.start && i < x.end);
  for (const m of item.q.matchAll(WORD_RE)) {
    if (!inQuote(m.index) && DA_FRAME_WORDS.has(m[0].toLowerCase()) && at[m.index] !== LANG_DA) {
      problems.push(`frame word "${m[0]}" is read in English`);
    }
  }
  const want = expectation(item.q);
  if (!want) return problems;
  quotes.forEach((x, n) => {
    let lang = want.quote || null;
    if (want.firstQuote && n === 0) lang = want.firstQuote;
    if (want.beforePhrase !== undefined) {
      if (x.start < want.beforePhrase) lang = ARITHMETIC.test(x.text) ? LANG_EN : LANG_DA;
      else lang = contextSentenceLang(x.text, quotes.filter((y) => y.start < want.beforePhrase));
    }
    if (!lang) return;
    const bad = wrongWords(item.q, at, x.start, x.end, lang, false);
    if (bad.length) problems.push(`quote ${x.text} should be ${lang}: ${bad.join(", ")}`);
  });
  if (want.options) {
    for (const o of item.o) {
      const os = seg.option(o, item.q, item.o);
      const oat = langAt(o, os);
      if (!oat) { problems.push(`option runs do not map back onto "${o}"`); continue; }
      const oquotes = [...o.matchAll(QUOTE_RE)].map((m) => [m.index, m.index + m[0].length]);
      let cursor = 0;
      const bad = [];
      for (const [s, e] of [...oquotes, [o.length, o.length]]) {
        bad.push(...wrongWords(o, oat, cursor, s, want.options, want.options === LANG_EN));
        cursor = e;
      }
      // A Danish answer may carry an English expression ("fair play i sport"); it is wrong only
      // when English is no longer the minority of its words.
      const words = [...o.replace(QUOTE_RE, " ").matchAll(WORD_RE)].length;
      if (want.options === LANG_DA && bad.length * 2 < words) continue;
      if (bad.length) problems.push(`option "${o}" should be ${want.options}: ${bad.join(", ")} → ${fmt(os)}`);
    }
  }
  return problems;
}

test("every English question in the migrations follows its frame's language", () => {
  const corpus = englishCorpus();
  assert.ok(corpus.length >= 6000, `expected the English corpus, got ${corpus.length}`);
  let decided = 0;
  const failures = [];
  for (const item of corpus) {
    if (expectation(item.q)) decided++;
    const problems = frameProblems(item);
    if (problems.length) failures.push(`${item.file}: ${item.q}\n    ${problems.join("\n    ")}`);
  }
  assert.ok(decided >= 4500, `the frame rules should decide most of the corpus, decided ${decided}`);
  assert.equal(failures.length, 0, `${failures.length} question(s) read with the wrong voice:\n${failures.slice(0, 20).join("\n")}`);
});

test("the corpus check reports a wrong voice and accepts the deliberately mixed texts", () => {
  const allDanish = {
    question: (text) => [{ text, lang: LANG_DA }],
    option: (text) => [{ text, lang: LANG_DA }],
  };
  const allEnglish = {
    question: (text) => [{ text, lang: LANG_EN }],
    option: (text) => [{ text, lang: LANG_EN }],
  };
  // The two errors fixed here, as the segmenter used to read them.
  assert.deepEqual(frameProblems({ q: "Hvad er flertal af 'man'?", o: ["mens", "men"] }, allDanish), [
    "quote 'man' should be en-GB: man",
    "option \"mens\" should be en-GB: mens → mens",
    "option \"men\" should be en-GB: men → men",
  ]);
  assert.deepEqual(frameProblems({ q: "Hvilket ord betyder næsten det samme som 'end'?", o: [] }, allDanish),
    ["quote 'end' should be en-GB: end"]);
  // Danish frame words and Danish translation answers read in English.
  assert.deepEqual(frameProblems({ q: "Hvad betyder 'sun'?", o: ["sol"] }, allEnglish), [
    "frame word \"Hvad\" is read in English",
    "frame word \"betyder\" is read in English",
    "option \"sol\" should be da-DK: sol → [EN:sol]",
  ]);
  // Deliberately mixed: "og" between English words, quoted English inside a Danish option.
  assert.deepEqual(frameProblems({ q: "Hvad hedder 'mor' og 'far' på engelsk?", o: ["mum og dad"] }), []);
  assert.deepEqual(frameProblems({ q: "Hvad er 'two plus three' på engelsk?", o: ["five"] }), []);
});

// ── End to end: segments → browser provider → Worker → Azure SSML voices ─────
// The real provider, Worker, clip coordinator and Azure client run; only the network to
// Azure is replaced by a socket that records the SSML it is sent.
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete globalThis.Audio;
});

// In-memory R2 bucket (whole objects; the provider plays audio through Audio, not fetch).
function memoryBucket() {
  const objects = new Map();
  const wrap = (key, entry) => ({
    key,
    size: entry.bytes.length,
    httpEtag: '"' + key.length + '"',
    body: entry.bytes,
    writeHttpMetadata(headers) {
      if (entry.options && entry.options.httpMetadata) headers.set("content-type", entry.options.httpMetadata.contentType);
    },
    async text() { return new TextDecoder().decode(entry.bytes); },
  });
  return {
    async get(key) { const e = objects.get(key); return e ? wrap(key, e) : null; },
    async head(key) { const e = objects.get(key); return e ? wrap(key, e) : null; },
    async put(key, value, options) {
      objects.set(key, { bytes: typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value), options });
    },
  };
}

function audioFrame(bytes) {
  const header = new TextEncoder().encode("Path:audio\r\n");
  const frame = new Uint8Array(2 + header.length + bytes.length);
  frame[0] = header.length >> 8;
  frame[1] = header.length & 0xff;
  frame.set(header, 2);
  frame.set(bytes, 2 + header.length);
  return frame.buffer;
}

// Azure double for the Worker's outbound WebSocket: answers every SSML turn with a little audio.
function azureDouble() {
  const ssml = [];
  globalThis.fetch = async (url, init) => {
    if (!String(url).includes(".tts.speech.microsoft.com/")) throw new Error("unexpected fetch " + url);
    const listeners = {};
    const socket = {
      accept() {},
      addEventListener(name, fn) { listeners[name] = fn; },
      close() {},
      send(message) {
        if (!String(message).includes("Path: ssml")) return;
        ssml.push(String(message).split("\r\n\r\n").slice(1).join("\r\n\r\n"));
        setTimeout(() => {
          listeners.message({ data: audioFrame(new Uint8Array([0xff, 0xfb, 1, 2])) });
          listeners.message({ data: "X-RequestId:1\r\nPath:turn.end\r\n\r\n" });
        }, 0);
      },
    };
    return { status: 101, webSocket: socket, init };
  };
  return ssml;
}

function workerEnv() {
  const coordinators = new Map();
  const env = {
    SUPABASE_URL: "https://example.supabase.co",
    TTS_ADMIN_TOKEN: "a".repeat(40),
    AZURE_SPEECH_KEY: "test-key",
    AZURE_SPEECH_REGION: "northeurope",
    TTS_BUCKET: memoryBucket(),
    ASSETS: { fetch: async () => new Response("asset 404", { status: 404 }) },
    TTS_USER_RATE_LIMIT: { limit: async () => ({ success: true }) },
    TTS_GLOBAL_RATE_LIMIT: { limit: async () => ({ success: true }) },
    TTS_CLIP: {
      idFromName: (name) => name,
      get(id) {
        if (!coordinators.has(id)) coordinators.set(id, new TtsClipCoordinator({}, env));
        const instance = coordinators.get(id);
        return { fetch: (url, init) => instance.fetch(new Request(url, init)) };
      },
    },
  };
  return env;
}

// The provider's requests go to the Worker. Sign-in is covered by the Worker's own tests;
// here the admin header stands in for the pupil's verified session.
function providerToWorker(env) {
  return async (url, init) => {
    const headers = { ...(init && init.headers) };
    if (url === "/api/tts") headers["x-tts-admin-token"] = env.TTS_ADMIN_TOKEN;
    return worker.fetch(new Request("https://lærlig.test" + url, { ...init, headers }), env);
  };
}

function installAudio() {
  globalThis.Audio = function (src) {
    this.src = src;
    this.paused = true;
    this.currentTime = 0;
    this.addEventListener = () => {};
    this.removeAttribute = () => {};
    this.pause = () => { this.paused = true; };
    this.play = () => { this.paused = false; return Promise.resolve(); };
  };
}

// <voice name="…">text</voice> pairs of one SSML document, XML entities decoded.
function voicesOf(ssml) {
  const decode = (s) => s.replace(/<break[^>]*\/>/g, " ").replace(/&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  return [...ssml.matchAll(/<voice name="([^"]+)">(.*?)<\/voice>/g)].map((m) => [m[1], decode(m[2])]);
}

async function spokenVoices(text, segments) {
  const ssml = azureDouble();
  const env = workerEnv();
  installAudio();
  const provider = createAzureProvider({ fetchImpl: providerToWorker(env), getAccessToken: async () => "tok" });
  assert.equal(await provider.speak({ text, segments }), true, text);
  provider.stop();
  assert.equal(ssml.length, 1, "one Azure synthesis per new clip");
  return voicesOf(ssml[0]);
}

test("the Danish and English runs reach Azure as Christel and Sonia", async () => {
  assert.equal(TTS_VOICES[LANG_DA], "da-DK-ChristelNeural");
  assert.equal(TTS_VOICES[LANG_EN], "en-GB-SoniaNeural");
  const question = "Hvilket ord betyder næsten det samme som 'end'?";
  assert.deepEqual(await spokenVoices(question, segmentQuestion(question)), [
    ["da-DK-ChristelNeural", "Hvilket ord betyder næsten det samme som"],
    ["en-GB-SoniaNeural", "'end'?"],
  ]);
});

test("every option of a plural question is spoken by the English voice", async () => {
  const question = "Hvad er flertal af 'man'?";
  const options = ["mans", "mens", "men", "manes"];
  for (const option of options) {
    assert.deepEqual(await spokenVoices(option, segmentOption(option, question, options)),
      [["en-GB-SoniaNeural", option]], option);
  }
});

test("a mixed option switches voice only where the language does", async () => {
  const question = "Hvad hedder 'mor' og 'far' på engelsk?";
  const options = ["mum og dad", "aunt og uncle"];
  assert.deepEqual(await spokenVoices("mum og dad", segmentOption("mum og dad", question, options)), [
    ["en-GB-SoniaNeural", "mum"], ["da-DK-ChristelNeural", "og"], ["en-GB-SoniaNeural", "dad"],
  ]);
});

test("a Danish translation answer is spoken by the Danish voice", async () => {
  const question = "Hvad betyder 'basement'?";
  const options = ["kælder", "køkken", "kirke", "loft"];
  assert.deepEqual(await spokenVoices("kælder", segmentOption("kælder", question, options)),
    [["da-DK-ChristelNeural", "kælder"]]);
  assert.deepEqual(await spokenVoices(question, segmentQuestion(question)), [
    ["da-DK-ChristelNeural", "Hvad betyder"], ["en-GB-SoniaNeural", "'basement'?"],
  ]);
});
