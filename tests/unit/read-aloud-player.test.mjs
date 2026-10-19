import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createWebSpeechProvider, listSpeechVoices } from "../../js/read-aloud/provider-webspeech.js";
import { readableTokens, attachReadAloudControl, attachOptionReadAloudControl } from "../../js/read-aloud/adapters/quiz.js";
import { createReadAloud } from "../../js/read-aloud/index.js";
import { createPrerecordedProvider } from "../../js/read-aloud/provider-prerecorded.js";
import { hashKey } from "../../js/read-aloud/manifest.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function installSpeech(voices) {
  const spoken = [];
  const synth = {
    paused: false,
    getVoices: () => voices,
    cancel() {},
    speak(utterance) { spoken.push(utterance); },
    pause() { this.paused = true; },
    resume() { this.paused = false; },
  };
  globalThis.window = { speechSynthesis: synth };
  globalThis.SpeechSynthesisUtterance = function (text) { this.text = text; };
  return { spoken, synth };
}

// Minimal HTMLAudioElement double. `play` decides whether playback starts or fails.
function installAudio(play = () => Promise.resolve()) {
  const created = [];
  globalThis.Audio = function (src) {
    this.src = src;
    this.paused = true;
    this.listeners = {};
    this.addEventListener = (name, fn) => { this.listeners[name] = fn; };
    this.pause = () => { this.paused = true; };
    this.play = () => { this.paused = false; return play(); };
    created.push(this);
  };
  return created;
}

// A clip only for `text`, the way a shipped Piper manifest would resolve it.
function clipFor(text) {
  return createPrerecordedProvider({
    clipPathFor: (key) => (key === hashKey(text) ? "/assets/audio/readaloud/" + key + ".mp3" : null),
    hasClips: () => true,
  });
}

afterEach(() => {
  delete globalThis.window;
  delete globalThis.SpeechSynthesisUtterance;
  delete globalThis.Audio;
});

const voice = (name, lang, voiceURI = name) => ({ name, lang, voiceURI });

test("the reading track preserves every character and records exact word offsets", () => {
  const text = "Hvad betyder 'sol'?";
  const tokens = readableTokens(text);
  assert.equal(tokens.map((token) => token.text).join(""), text);
  assert.deepEqual(tokens.filter((token) => token.word).map(({ text: value, start, end }) => ({ value, start, end })), [
    { value: "Hvad", start: 0, end: 4 },
    { value: "betyder", start: 5, end: 12 },
    { value: "'sol'?", start: 13, end: 19 },
  ]);
});

test("voice list is Danish-only and ordered by quality", () => {
  installSpeech([
    voice("Microsoft Helle", "da-DK", "helle"),
    voice("English Natural", "en-GB", "english"),
    voice("Microsoft Christel Online (Natural)", "da-DK", "christel"),
  ]);
  assert.deepEqual(listSpeechVoices("da-DK").map((item) => item.voiceURI), ["christel", "helle"]);
});

test("saved speed and voice are applied to the utterance", async () => {
  const { spoken } = installSpeech([
    voice("Microsoft Christel Online (Natural)", "da-DK", "christel"),
    voice("Microsoft Jeppe Online (Natural)", "da-DK", "jeppe"),
  ]);
  const provider = createWebSpeechProvider();
  assert.equal(await provider.speak({ text: "Hej", lang: "da-DK", rate: 1.25, voiceURI: "jeppe" }), true);
  assert.equal(spoken.length, 1);
  assert.equal(spoken[0].rate, 1.25);
  assert.equal(spoken[0].voice.voiceURI, "jeppe");
});

test("word boundaries keep their position across Danish and English runs", async () => {
  const { spoken } = installSpeech([
    voice("Dansk", "da-DK", "da"),
    voice("English", "en-GB", "en"),
  ]);
  const boundaries = [];
  const states = [];
  const provider = createWebSpeechProvider();
  await provider.speak({
    text: "Hvad sun",
    lang: "da-DK",
    segments: [{ text: "Hvad", lang: "da-DK" }, { text: "sun", lang: "en-GB" }],
    onBoundary: (boundary) => boundaries.push(boundary),
    onState: (state) => states.push(state),
  });
  spoken[0].onstart();
  spoken[1].onboundary({ name: "word", charIndex: 0, charLength: 3 });
  spoken[0].onend();
  spoken[1].onend();
  assert.deepEqual(boundaries, [{ charIndex: 5, charLength: 3 }]);
  assert.deepEqual(states, ["speaking", "ended"]);
});

test("pause, resume and stop report a deterministic player state", async () => {
  const { synth } = installSpeech([voice("Dansk", "da-DK", "da")]);
  const states = [];
  const provider = createWebSpeechProvider();
  await provider.speak({ text: "Hej", onState: (state) => states.push(state) });
  assert.equal(provider.pause(), true);
  assert.equal(synth.paused, true);
  assert.equal(provider.resume(), true);
  assert.equal(synth.paused, false);
  provider.stop();
  assert.deepEqual(states, ["paused", "speaking", "ended"]);
});

test("late events from a cancelled utterance never end the request that replaced it", async () => {
  const { spoken } = installSpeech([voice("Dansk", "da-DK", "da")]);
  const first = [];
  const second = [];
  const boundaries = [];
  const provider = createWebSpeechProvider();
  await provider.speak({ text: "Første", onState: (state) => first.push(state) });
  await provider.speak({
    text: "Anden",
    onState: (state) => second.push(state),
    onBoundary: (boundary) => boundaries.push(boundary),
  });
  // Browsers report the cancelled utterance asynchronously (Chrome: error, Firefox: end).
  spoken[0].onstart();
  spoken[0].onboundary({ name: "word", charIndex: 0, charLength: 6 });
  spoken[0].onerror({ error: "interrupted" });
  spoken[0].onend();
  spoken[1].onstart();
  assert.deepEqual(first, ["ended"]);
  assert.deepEqual(second, ["speaking"]);
  assert.deepEqual(boundaries, []);
  spoken[1].onend();
  assert.deepEqual(second, ["speaking", "ended"]);
});

test("support: no Web Speech + empty clip manifest → nothing can speak and no control renders", async () => {
  installAudio(); // audio playback exists, but no clip is shipped
  assert.equal(createPrerecordedProvider().isSupported(), false);
  const ra = createReadAloud({ enabled: true });
  assert.equal(ra.isAvailable(), false);
  assert.equal(ra.canSpeak("Hvad er hovedstaden?"), false);
  assert.equal(await ra.speak("Hvad er hovedstaden?"), false);

  // The shared adapter leaves the prompt untouched and adds no 🔊 beside an option.
  let appended = 0;
  const prompt = { textContent: "Hvad er hovedstaden?", appendChild: () => { appended++; } };
  const row = { appendChild: () => { appended++; } };
  assert.doesNotThrow(() => attachReadAloudControl(prompt, "Hvad er hovedstaden?"));
  assert.doesNotThrow(() => attachOptionReadAloudControl(row, "København"));
  assert.equal(appended, 0);
  assert.equal(prompt.textContent, "Hvad er hovedstaden?");
});

test("support: Web Speech available → any text can be spoken", async () => {
  installSpeech([voice("Dansk", "da-DK", "da")]);
  const ra = createReadAloud({ enabled: true });
  assert.equal(ra.isAvailable(), true);
  assert.equal(ra.canSpeak("Hvad er hovedstaden?"), true);
  assert.equal(ra.canSpeak("   "), false);
  assert.equal(await ra.speak("Hvad er hovedstaden?"), true);
});

test("support: no Web Speech + a matching local clip → that text is still read aloud", async () => {
  const audio = installAudio();
  const ra = createReadAloud({ enabled: true, providers: [clipFor("Hej"), createWebSpeechProvider()] });
  assert.equal(ra.canSpeak("Hej"), true);
  const states = [];
  assert.equal(await ra.speak("Hej", { onState: (state) => states.push(state) }), true);
  assert.equal(audio.length, 1);
  assert.equal(audio[0].src, "/assets/audio/readaloud/" + hashKey("Hej") + ".mp3");
  audio[0].listeners.playing();
  audio[0].listeners.ended();
  assert.deepEqual(states, ["speaking", "ended"]);
});

test("support: no Web Speech + no matching clip → that text cannot be spoken", async () => {
  const audio = installAudio();
  const ra = createReadAloud({ enabled: true, providers: [clipFor("Hej"), createWebSpeechProvider()] });
  assert.equal(ra.isAvailable(), true); // a clip exists, just not for this text
  assert.equal(ra.canSpeak("Farvel"), false);
  assert.equal(await ra.speak("Farvel"), false);
  assert.equal(audio.length, 0);
});

test("a failed clip falls back to Web Speech without a false 'ended' in between", async () => {
  installAudio(() => Promise.reject(new Error("404")));
  const { spoken } = installSpeech([voice("Dansk", "da-DK", "da")]);
  const ra = createReadAloud({ enabled: true, providers: [clipFor("Hej"), createWebSpeechProvider()] });
  const states = [];
  assert.equal(await ra.speak("Hej", { onState: (state) => states.push(state) }), true);
  assert.equal(spoken.length, 1);
  spoken[0].onstart();
  assert.deepEqual(states, ["speaking"]);
});

test("every student surface using the adapter ships the shared player styles", () => {
  for (const page of ["index.html", "stabel.html", "husk.html", "naal.html", "kloeft.html", "hop.html", "brud.html", "slope.html"]) {
    const html = readFileSync(join(REPO, page), "utf8");
    assert.match(html, /<link rel="stylesheet" href="css\/read-aloud\.css">/, page);
  }
});
