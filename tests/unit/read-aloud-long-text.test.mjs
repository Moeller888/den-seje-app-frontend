// D-362 / F-07 — read-aloud of long texts: a lossless split into valid TTS requests
// (js/read-aloud/tts-chunks.js) and one continuous reading of the parts (js/read-aloud/provider-azure.js).
// Audio, the cache and the Worker are in-memory doubles; no network, no Azure. These tests prove the
// order, the limits and the control flow — NOT how Azure pronounces the words (that needs a human
// listening check, which is still outstanding).
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { canonicalTtsRequest, normalizeTtsText, ttsKey, ttsClipPaths, TTS_LIMITS } from "../../js/read-aloud/tts-key.js";
import { splitTextForTts, planTtsRequests, TTS_MAX_PARTS } from "../../js/read-aloud/tts-chunks.js";
import { createAzureProvider } from "../../js/read-aloud/provider-azure.js";
import { createReadAloud } from "../../js/read-aloud/index.js";
import { uniqueClips } from "../../tools/read-aloud/generate-clips.mjs";

const MAX = TTS_LIMITS.maxChars;
const FIXTURE = JSON.parse(readFileSync(new URL("../fixtures/d362-approved-pilot-rows.json", import.meta.url), "utf8"));
const S = FIXTURE.rows.map((row, i) => ({ label: `S${i + 1}`, row, text: row.content.stimulus.text ?? row.content.stimulus.alt }));
const byLabel = (label) => S.find((s) => s.label === label);

// Every provider made here is stopped after its test, so a failing assertion never leaves a ticking timer behind.
const made = [];
function azure(options) {
  const provider = createAzureProvider(options);
  made.push(provider);
  return provider;
}
afterEach(() => {
  for (const provider of made.splice(0)) { try { provider.stop(); } catch (_e) { /* ignore */ } }
  delete globalThis.Audio;
});

// ── helpers ─────────────────────────────────────────────────────────────────

function words(text) {
  return text.normalize("NFC").split(/\s+/u).filter(Boolean);
}

/** Every invariant of the split contract, for one text. */
function assertContract(text, pieces, label = "") {
  assert.equal(pieces.join(""), text.normalize("NFC"), `${label}: lossless, in order`);
  assert.equal(normalizeTtsText(pieces.join("")), normalizeTtsText(text), `${label}: same spoken text`);
  for (const piece of pieces) {
    assert.ok(normalizeTtsText(piece).length > 0, `${label}: no empty piece`);
    assert.ok(normalizeTtsText(piece).length <= MAX, `${label}: piece of ${normalizeTtsText(piece).length} > ${MAX}`);
    assert.equal(canonicalTtsRequest(piece).ok, true, `${label}: every piece is a valid TTS request`);
  }
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

const SENTENCE = "Grundloven af 1849 gav mange mænd valgret til Folketinget, men ikke alle. ";

// ── 1–17: the split ─────────────────────────────────────────────────────────

test("split 1: empty, whitespace-only and non-string input give no pieces and no request", () => {
  for (const value of ["", "   ", "\n\n\t", null, undefined, 42, {}]) {
    assert.deepEqual(splitTextForTts(value), []);
  }
  assert.deepEqual(planTtsRequests(""), { ok: false, error: "empty_text" });
  assert.deepEqual(planTtsRequests("   "), { ok: false, error: "empty_text" });
  assert.equal(planTtsRequests(undefined).ok, false);
});

test("split 2–4: one character, 799 and exactly 800 characters stay ONE unchanged request", async () => {
  for (const text of ["a", "x".repeat(MAX - 1), "y".repeat(MAX)]) {
    assert.deepEqual(splitTextForTts(text), [text]);
    const plan = planTtsRequests(text);
    assert.equal(plan.ok, true);
    assert.equal(plan.parts.length, 1);
    // Exactly the request it always was: same canonical value, same key, so cached clips still match.
    assert.deepEqual(plan.parts[0], canonicalTtsRequest(text).value);
    assert.equal(await ttsKey(plan.parts[0]), await ttsKey(canonicalTtsRequest(text).value));
  }
});

test("split 5: 801 characters become two valid parts", () => {
  const text = (SENTENCE.repeat(20)).slice(0, MAX + 1);
  assert.equal(normalizeTtsText(text).length, MAX + 1);
  const pieces = splitTextForTts(text);
  assert.equal(pieces.length, 2);
  assertContract(text, pieces, "801");
  assert.equal(canonicalTtsRequest(text).error, "text_too_long", "the per-request limit itself is unchanged");
});

test("split 6: a 898-character § 35 source is cut at its paragraph break (law text | word explanations)", () => {
  const text = byLabel("S3").text;
  assert.equal(normalizeTtsText(text).length, 897);
  assert.equal(text.length, 898);
  const pieces = splitTextForTts(text);
  assert.equal(pieces.length, 2);
  assertContract(text, pieces, "S3");
  assert.match(pieces[0], /Valget foregaaer\.\n\n$/u);
  assert.match(pieces[1], /^Ordforklaringer: /u);
});

test("split 7–8: 1,600 and 5,000 characters stay within the limit and the part cap", () => {
  for (const size of [1600, 5000]) {
    const text = SENTENCE.repeat(Math.ceil(size / SENTENCE.length)).slice(0, size);
    const pieces = splitTextForTts(text);
    assertContract(text, pieces, String(size));
    assert.ok(pieces.length >= Math.ceil(normalizeTtsText(text).length / MAX));
    assert.ok(pieces.length <= Math.ceil(normalizeTtsText(text).length / MAX) + 1, `${size}: ${pieces.length} parts`);
    for (const piece of pieces.slice(0, -1)) assert.match(piece, /[.,]\s$/u, `${size}: cut at a sentence or clause end`);
  }
  const huge = "ord ".repeat(MAX * TTS_MAX_PARTS);
  assert.deepEqual(planTtsRequests(huge), { ok: false, error: "text_too_long" }, "above the cap: no player, as before");
});

test("split 9–10: no full stops → cut at a space; no spaces at all → cut inside the word, nothing lost", () => {
  const noStops = "ordet ".repeat(300);
  const a = splitTextForTts(noStops);
  assertContract(noStops, a, "no stops");
  for (const piece of a.slice(0, -1)) assert.match(piece, / $/u);

  const noSpaces = "Raadighedenoversitbo".repeat(100);
  const b = splitTextForTts(noSpaces);
  assertContract(noSpaces, b, "no spaces");
  assert.ok(b.length === 3);
});

test("split 11: many line breaks — paragraphs and lines are preferred cut points", () => {
  const lines = Array.from({ length: 60 }, (_, i) => `Linje ${i + 1}: en kort sætning om 1849`).join("\n");
  const pieces = splitTextForTts(lines);
  assertContract(lines, pieces, "lines");
  for (const piece of pieces.slice(0, -1)) assert.match(piece, /\n$/u, "cut after a whole line");
  const paragraphs = Array.from({ length: 8 }, () => SENTENCE.repeat(2)).join("\n\n\n");
  const p = splitTextForTts(paragraphs);
  assertContract(paragraphs, p, "paragraphs");
  for (const piece of p.slice(0, -1)) assert.match(piece, /\n\n+$/u, "cut after a whole paragraph");
});

test("split 12: Danish letters, NFC and surrogate pairs are never broken", () => {
  const danish = "Æbleskiver, øl og ål på Ærø blev nævnt i år. ".repeat(30);
  assertContract(danish, splitTextForTts(danish), "æøå");
  const decomposed = "å".repeat(500) + " slut"; // "å" as a + combining ring: NFC first
  const d = splitTextForTts(decomposed);
  assertContract(decomposed, d, "NFD");
  assert.ok(d.join("").includes("å") && !d.join("").includes("̊"));
  const emoji = "😀".repeat(900); // 1,800 code units, no space: a hard cut must keep each pair whole
  const e = splitTextForTts(emoji);
  assertContract(emoji, e, "emoji");
  for (const piece of e) assert.equal(piece.length % 2, 0, "no half surrogate pair");
  // A combining mark with no precomposed form stays with its letter even at a hard cut.
  const mark = String.fromCodePoint(0x0353);
  const combining = "x".repeat(MAX - 1) + "q" + mark + "y".repeat(5);
  const c = splitTextForTts(combining);
  assertContract(combining, c, "combining");
  assert.ok(c[1].startsWith("q" + mark), "the letter moves with its mark");
});

test("split 13: the historical words of the § 35 sources each stay whole inside one part", () => {
  const historical = ["Folkethinget", "Huusstand", "30te Aar", "Indfødsret", "Fattigvæsenet", "Raadigheden over sit Bo", "§ 35", "1849"];
  for (const label of ["S2", "S3", "S4", "S6"]) {
    const { text } = byLabel(label);
    const pieces = splitTextForTts(text);
    for (const phrase of historical) {
      const inText = text.split(phrase).length - 1;
      const inPieces = pieces.reduce((n, p) => n + p.split(phrase).length - 1, 0);
      assert.equal(inPieces, inText, `${label}: "${phrase}" is never cut`);
    }
  }
});

test("split 14: length is measured after normalisation (spaces, blanks) — exactly the TTS contract", () => {
  const spaced = "ord" + " ".repeat(2000) + "slut"; // 2,007 raw characters, 8 after normalisation
  assert.deepEqual(splitTextForTts(spaced), [spaced]);
  assert.equal(planTtsRequests(spaced).parts.length, 1);
  // A gap-fill blank is one pause: "__" is never cut in half (that would read two underscores).
  const blanks = ("You ___ my friend. ").repeat(60);
  const pieces = splitTextForTts(blanks);
  assertContract(blanks, pieces, "blanks");
  for (const piece of pieces) assert.doesNotMatch(piece, /^_|[^_]_$/u);
  const hard = "x".repeat(MAX - 1) + "____" + "y".repeat(50);
  const h = splitTextForTts(hard);
  assertContract(hard, h, "hard blank");
  assert.ok(h.every((p) => !p.endsWith("_") || p.endsWith("____")), "the blank stays in one piece");
});

test("split 15–17: joined parts are the original text; no part over the limit; no word lost or repeated (200 random texts)", () => {
  const rand = seeded(1849);
  const vocabulary = ["Folkethinget", "Huusstand", "30te", "Aar", "§", "35", "Indfødsret", "f.eks.", "den", "5.", "juni",
    "Æ", "ø", "å", "Kongen", "gav", "lovene.", "Men", "hvem?", "ja!", "–", "eller,", "og;", "bl.a.", "Stad", "=", "by."];
  for (let n = 0; n < 200; n++) {
    const size = 1 + Math.floor(rand() * 4000);
    let text = "";
    while (text.length < size) {
      const r = rand();
      text += vocabulary[Math.floor(rand() * vocabulary.length)] + (r < 0.03 ? "\n\n" : r < 0.06 ? "\n" : " ");
    }
    const pieces = splitTextForTts(text);
    assertContract(text, pieces, `random ${n}`);
    assert.deepEqual(pieces.flatMap(words), words(text), `random ${n}: same words, same order`);
  }
});

test("split: an abbreviation or a Danish ordinal is not taken for a sentence end", () => {
  const filler = "a ".repeat(220);
  const text = filler + "det gjaldt f.eks. Anders " + filler + "den 5. juni " + filler;
  const pieces = splitTextForTts(text);
  assertContract(text, pieces, "abbr");
  for (const piece of pieces.slice(0, -1)) {
    assert.ok(!piece.endsWith("f.eks. ") && !piece.endsWith("5. "), `cut after an abbreviation: ${JSON.stringify(piece.slice(-12))}`);
  }
});

test("plan: language runs are kept — an English run that is cut is still read by the English voice", () => {
  const english = "The constitution of 1849 gave many men the vote. ".repeat(30);
  const plan = planTtsRequests(english, [{ text: "Læs teksten:", lang: "da-DK" }, { text: english, lang: "en-GB" }]);
  assert.equal(plan.ok, true);
  assert.ok(plan.parts.length >= 2);
  // The Danish frame does not fit with the long English run, so it is read first on its own.
  assert.deepEqual(plan.parts[0].segments.map((r) => r.lang), ["da-DK"]);
  for (const part of plan.parts.slice(1)) assert.deepEqual(part.segments.map((r) => [r.lang, r.voice]), [["en-GB", "en-GB-SoniaNeural"]]);
  const spoken = plan.parts.flatMap((p) => p.segments).map((r) => r.text).join(" ");
  assert.equal(normalizeTtsText(spoken), normalizeTtsText("Læs teksten: " + english));
  for (const part of plan.parts) assert.ok(part.segments.reduce((n, r) => n + r.text.length, 0) <= MAX);
  // Invalid input keeps its own reason (never hidden behind a split).
  assert.equal(planTtsRequests("x", [{ text: "x", lang: "fr-FR" }]).error, "unsupported_language");
  assert.equal(planTtsRequests("bad\u0007text").error, "invalid_text");
});

// ── F-07: the owner-approved pupil texts (byte for byte) ────────────────────

test("F-07: the fixture is the approved content of 63bb8b97, byte for byte", () => {
  const sha = createHash("sha256").update(JSON.stringify(FIXTURE.rows)).digest("hex");
  assert.equal(sha, "da1f49b72447c560339274c9a347b6ef1ba966d1069513b4ac9bf3ffa9f9da6e");
  assert.equal(FIXTURE.contentSha256, sha);
  assert.equal(FIXTURE.sourceCommit, "63bb8b9783d12b95840581faabcdd40d488b01ab");
  assert.equal(FIXTURE.rows.length, 7);
});

test("F-07: S2, S3, S4 and S6 can now be read aloud (2 parts each); S1, S5, S7 are one unchanged request", async () => {
  const expected = { S1: 1, S2: 2, S3: 2, S4: 2, S5: 1, S6: 2, S7: 1 };
  const provider = azure({ fetchImpl: async () => new Response("", { status: 404 }) });
  globalThis.Audio = function () {};
  for (const { label, text } of S) {
    const plan = planTtsRequests(text);
    assert.equal(plan.ok, true, label);
    assert.equal(plan.parts.length, expected[label], `${label}: parts`);
    assert.equal(provider.canSpeak({ text }), true, `${label}: the player is rendered`);
    if (expected[label] === 1) assert.deepEqual(plan.parts[0], canonicalTtsRequest(text).value, `${label}: same clip as before`);
    else assert.equal(canonicalTtsRequest(text).error, "text_too_long", `${label}: this is the text that had no player`);
    assertContract(text, splitTextForTts(text), label);
  }
  // Questions and answer options of all seven are short: one request each, unchanged.
  for (const { label, row } of S) {
    for (const value of [row.content.question, ...(row.content.options || [])]) {
      assert.deepEqual(planTtsRequests(value).parts, [canonicalTtsRequest(value).value], `${label}: ${value}`);
    }
  }
});

test("F-07: the clip generator pre-generates exactly the parts the browser will ask for", async () => {
  const { clips, rejected } = await uniqueClips(S.map((s) => ({ text: s.text })));
  assert.equal(rejected, 0, "no approved text is rejected any more");
  // S3, S4 and S6 share the § 35 source and S5/S7 the § 2 source: S1 (1) + S2 (2) + § 35 (2) + § 2 (1) = 6 clips.
  const keys = new Set();
  for (const { text } of S) for (const part of planTtsRequests(text).parts) keys.add(await ttsKey(part));
  assert.equal(clips.size, 6);
  assert.equal(clips.size, keys.size);
  assert.deepEqual([...clips.keys()].sort(), [...keys].sort());
});

// ── playback: one continuous reading ────────────────────────────────────────

function installAudio() {
  const created = [];
  globalThis.Audio = function (src) {
    this.src = src;
    this.paused = true;
    this.currentTime = 0;
    this.plays = [];
    this.listeners = {};
    this.addEventListener = (name, fn) => { (this.listeners[name] ||= []).push(fn); };
    this.emit = (name) => { for (const fn of this.listeners[name] || []) fn(); };
    this.removeAttribute = (name) => { if (name === "src") this.src = ""; };
    this.pause = () => { this.paused = true; };
    this.play = () => {
      this.plays.push(this.src);
      if (globalThis.__failPlayFor && this.src.includes(globalThis.__failPlayFor)) return Promise.reject(new Error("NotAllowedError"));
      this.paused = false;
      this.emit("playing");
      return Promise.resolve();
    };
    created.push(this);
  };
  return created;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

/**
 * Clip server double. `words(key)` gives each clip its word timings; `gate(key)` may return a
 * promise to delay that clip's metadata; `status(key)` may fail one clip.
 */
function clipServer({ cached = true, gate = () => null, status = () => 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    const match = String(url).match(/([0-9a-f]{64})\.json$/);
    if (match) {
      const key = match[1];
      const wait = gate(key);
      if (wait) await wait;
      if (status(key) !== 200) return new Response("x", { status: status(key) });
      if (!cached) return new Response("nf", { status: 404 });
      return new Response(JSON.stringify({ key, audio: ttsClipPaths(key).audio, words: [] }), { status: 200 });
    }
    if (url === "/api/tts") {
      const body = JSON.parse(init.body);
      const checked = canonicalTtsRequest(undefined, body.segments);
      assert.equal(checked.ok, true, "the Worker only ever receives requests within its limits");
      const key = await ttsKey(checked.value);
      return new Response(JSON.stringify({ key, audio: ttsClipPaths(key).audio, words: [] }), { status: 200 });
    }
    return new Response("?", { status: 500 });
  };
  return { calls, fetchImpl, metaCalls: () => calls.filter((c) => c.url.endsWith(".json")).map((c) => c.url) };
}

async function partKeys(text) {
  const plan = planTtsRequests(text);
  return Promise.all(plan.parts.map((p) => ttsKey(p)));
}

const LONG = byLabel("S3").text; // 2 parts
// 3 parts, every sentence different (identical parts would share one clip key).
const LONGER = Array.from({ length: 30 }, (_, i) => `Sætning nummer ${i + 1} handler om Grundloven af 1849 og valgretten. `).join("");

test("playback: the parts play in order on ONE audio element, without another tap", async () => {
  const audio = installAudio();
  const server = clipServer();
  const provider = azure({ fetchImpl: server.fetchImpl });
  const states = [];
  const keys = await partKeys(LONG);
  assert.equal(await provider.speak({ text: LONG, onState: (s) => states.push(s) }), true);
  assert.equal(audio.length, 1);
  assert.equal(audio[0].src, ttsClipPaths(keys[0]).audio);
  await flush();
  assert.deepEqual(server.metaCalls(), keys.map((k) => ttsClipPaths(k).meta), "part 2 is fetched while part 1 plays");
  audio[0].emit("ended");
  await flush();
  assert.equal(audio.length, 1, "no second element");
  assert.equal(audio[0].src, ttsClipPaths(keys[1]).audio);
  assert.deepEqual(audio[0].plays, [ttsClipPaths(keys[0]).audio, ttsClipPaths(keys[1]).audio]);
  assert.deepEqual(states, ["speaking", "speaking"], "no 'ended' between the parts");
  audio[0].emit("ended");
  assert.deepEqual(states, ["speaking", "speaking", "ended"]);
});

test("playback: only one part ahead is fetched — never all parts at once", async () => {
  installAudio();
  const server = clipServer();
  const provider = azure({ fetchImpl: server.fetchImpl });
  const keys = await partKeys(LONGER);
  assert.equal(keys.length, 3);
  await provider.speak({ text: LONGER });
  await flush();
  assert.deepEqual(server.metaCalls(), keys.slice(0, 2).map((k) => ttsClipPaths(k).meta));
  provider.stop();
});

test("playback: pause and resume inside a part keep the position; 'Forfra' starts the whole text again", async () => {
  const audio = installAudio();
  const provider = azure({ fetchImpl: clipServer().fetchImpl });
  const states = [];
  const keys = await partKeys(LONG);
  await provider.speak({ text: LONG, onState: (s) => states.push(s) });
  audio[0].emit("ended");
  await flush();
  audio[0].currentTime = 3.2;
  assert.equal(provider.pause(), true);
  assert.equal(audio[0].paused, true);
  assert.equal(provider.resume(), true);
  assert.equal(audio[0].currentTime, 3.2, "resumed where it paused");
  assert.equal(audio[0].src, ttsClipPaths(keys[1]).audio, "still the second part");
  assert.deepEqual(states.slice(-3), ["speaking", "paused", "speaking"]);
  // Restart after a pause: a new reading from part 1 (the UI's "Forfra" calls speak again).
  provider.pause();
  assert.equal(await provider.speak({ text: LONG }), true);
  assert.equal(audio[0].paused, true, "the old reading is stopped");
  assert.equal(audio[1].src, ttsClipPaths(keys[0]).audio);
  provider.stop();
});

test("playback: a pause in the gap between two parts holds the next part until resume", async () => {
  const audio = installAudio();
  const keys = await partKeys(LONG);
  const slow = deferred();
  const server = clipServer({ gate: (key) => (key === keys[1] ? slow.promise : null) });
  const provider = azure({ fetchImpl: server.fetchImpl });
  const states = [];
  await provider.speak({ text: LONG, onState: (s) => states.push(s) });
  audio[0].emit("ended");
  assert.equal(provider.pause(), true, "pause works while the next part loads");
  assert.equal(states.at(-1), "paused");
  slow.resolve();
  await flush(); await flush();
  assert.equal(audio[0].plays.length, 1, "the next part does not start while paused");
  assert.equal(provider.resume(), true);
  assert.equal(states.at(-1) === "speaking", true);
  assert.equal(audio[0].src, ttsClipPaths(keys[1]).audio);
  assert.equal(audio[0].plays.length, 2);
  provider.stop();
});

test("playback: stop in the middle of a long reading — a late part never starts (next question)", async () => {
  const audio = installAudio();
  const keys = await partKeys(LONG);
  const slow = deferred();
  const provider = azure({ fetchImpl: clipServer({ gate: (key) => (key === keys[1] ? slow.promise : null) }).fetchImpl });
  const states = [];
  await provider.speak({ text: LONG, onState: (s) => states.push(s) });
  audio[0].emit("ended"); // waiting for part 2
  provider.stop(); // the pupil moves on: app.js → stopReadAloud()
  assert.deepEqual(states, ["speaking", "ended"], "the player returns to idle");
  slow.resolve();
  await flush(); await flush();
  assert.equal(audio[0].plays.length, 1, "the delayed part 2 never plays");
  assert.equal(audio[0].paused, true);
  assert.equal(provider.pause(), false);
  assert.equal(provider.resume(), false);
});

test("playback: a quick switch between two buttons — only the newest reading ever plays", async () => {
  const audio = installAudio();
  const keysA = await partKeys(LONG);
  const slowA = deferred();
  const provider = azure({ fetchImpl: clipServer({ gate: (key) => (key === keysA[0] ? slowA.promise : null) }).fetchImpl });
  const first = provider.speak({ text: LONG });   // source button (slow server)
  const second = provider.speak({ text: "Hvem fik valgret i 1849?" }); // question button, tapped right after
  assert.equal(await second, true);
  slowA.resolve();
  assert.equal(await first, false, "the overtaken reading reports no audio");
  assert.equal(audio.length, 1, "no element was ever created for the old reading");
  assert.ok(!audio[0].src.includes(keysA[0]));
  provider.stop();
});

test("playback: a double tap never starts two readings at the same time", async () => {
  const audio = installAudio();
  const provider = azure({ fetchImpl: clipServer().fetchImpl });
  const [a, b] = await Promise.all([provider.speak({ text: LONG }), provider.speak({ text: LONG })]);
  assert.deepEqual([a, b], [false, true]);
  assert.equal(audio.filter((el) => !el.paused).length, 1);
  provider.stop();
});

test("playback: a part that fails shows the calm error state; nothing hangs and nothing else speaks", async () => {
  const audio = installAudio();
  const keys = await partKeys(LONG);
  const provider = azure({ fetchImpl: clipServer({ status: (key) => (key === keys[1] ? 503 : 200) }).fetchImpl });
  const states = [];
  assert.equal(await provider.speak({ text: LONG, onState: (s) => states.push(s) }), true, "part 1 still plays");
  audio[0].emit("ended");
  await flush(); await flush();
  assert.deepEqual(states, ["speaking", "error"]);
  assert.equal(audio[0].plays.length, 1);
  assert.equal(provider.pause(), false, "back to idle: the pupil can tap again");

  // A later part whose play() is refused (e.g. a browser policy) also ends in the error state.
  const audio2 = installAudio();
  globalThis.__failPlayFor = keys[1];
  try {
    const p2 = azure({ fetchImpl: clipServer().fetchImpl });
    const s2 = [];
    await p2.speak({ text: LONG, onState: (s) => s2.push(s) });
    audio2[0].emit("ended");
    await flush(); await flush();
    assert.deepEqual(s2, ["speaking", "error"]);
  } finally {
    delete globalThis.__failPlayFor;
  }
  // The first part failing is a failed start, exactly as for a short text.
  installAudio();
  const p3 = azure({ fetchImpl: clipServer({ status: (key) => (key === keys[0] ? 500 : 200) }).fetchImpl });
  const s3 = [];
  assert.equal(await p3.speak({ text: LONG, onState: (s) => s3.push(s) }), false);
  assert.deepEqual(s3, []);
});

test("cache: a hit costs no POST; a repeated reading is served from memory; a miss POSTs each part once, within the limit", async () => {
  installAudio();
  const hit = clipServer();
  const provider = azure({ fetchImpl: hit.fetchImpl, getAccessToken: async () => "tok" });
  await provider.speak({ text: LONG });
  await flush();
  provider.stop();
  const before = hit.calls.length;
  assert.equal(hit.calls.filter((c) => c.url === "/api/tts").length, 0);
  await provider.speak({ text: LONG });
  await flush();
  assert.equal(hit.calls.length, before, "same text again: no request at all");
  provider.stop();

  installAudio();
  const miss = clipServer({ cached: false });
  const p2 = azure({ fetchImpl: miss.fetchImpl, getAccessToken: async () => "tok" });
  const audio = installAudio();
  await p2.speak({ text: LONG });
  audio[0].emit("ended");
  await flush(); await flush();
  const posts = miss.calls.filter((c) => c.url === "/api/tts");
  assert.equal(posts.length, 2, "one synthesis per part, no duplicate for the prefetched part");
  for (const post of posts) {
    assert.equal(post.init.headers.authorization, "Bearer tok");
    const body = JSON.parse(post.init.body);
    assert.deepEqual(Object.keys(body), ["segments"]);
    assert.ok(body.segments[0].text.length <= MAX);
    assert.equal(body.segments[0].lang, "da-DK");
  }
  p2.stop();
});

test("speed: every part plays at the chosen rate (playbackRate and defaultPlaybackRate)", async () => {
  const audio = installAudio();
  const provider = azure({ fetchImpl: clipServer().fetchImpl });
  await provider.speak({ text: LONG, rate: 1.25 });
  assert.equal(audio[0].playbackRate, 1.25);
  audio[0].emit("ended");
  await flush();
  assert.equal(audio[0].playbackRate, 1.25);
  assert.equal(audio[0].defaultPlaybackRate, 1.25);
  provider.stop();
});

test("highlighting: words of part 2 are found AFTER part 1 in the shown text", async () => {
  const audio = installAudio();
  const text = byLabel("S3").text;
  const keys = await partKeys(text);
  const fetchImpl = async (url) => {
    const key = String(url).match(/([0-9a-f]{64})\.json$/)[1];
    const words = key === keys[0] ? [{ w: "Valgret", t: 0, d: 100 }] : [{ w: "Indfødsret", t: 0, d: 100 }];
    return new Response(JSON.stringify({ key, audio: ttsClipPaths(key).audio, words }), { status: 200 });
  };
  const boundaries = [];
  const provider = azure({ fetchImpl });
  await provider.speak({ text, onBoundary: (b) => boundaries.push(b) });
  audio[0].emit("ended");
  await flush();
  audio[0].emit("timeupdate");
  assert.equal(boundaries[0].charIndex, 0);
  assert.equal(boundaries.at(-1).charIndex, text.lastIndexOf("Indfødsret"), "the explanation's 'Indfødsret', not the law's");
  provider.stop();
});

test("facade: the shared service makes a long text speakable and stops it like any other", async () => {
  const audio = installAudio();
  const ra = createReadAloud({ providers: [createAzureProvider({ fetchImpl: clipServer().fetchImpl })] });
  assert.equal(ra.canSpeak(LONG), true);
  assert.equal(await ra.speak(LONG), true);
  assert.equal(ra.pause(), true);
  assert.equal(ra.resume(), true);
  ra.stop();
  assert.equal(audio[0].paused, true);
  assert.equal(ra.canSpeak("ord ".repeat(MAX * TTS_MAX_PARTS)), false, "beyond the cap the player stays hidden");
});
