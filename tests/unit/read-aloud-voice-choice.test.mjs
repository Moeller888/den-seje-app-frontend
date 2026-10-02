// Web Speech read-aloud must pick the most natural Danish voice on the device,
// not just the first Danish one in the browser's list.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createWebSpeechProvider } from "../../js/read-aloud/provider-webspeech.js";

// Minimal browser stub: records the last utterance handed to speak().
function installSpeech(voices) {
  const spoken = [];
  globalThis.window = {
    speechSynthesis: {
      getVoices: () => voices,
      cancel: () => {},
      speak: (u) => { spoken.push(u); },
    },
  };
  globalThis.SpeechSynthesisUtterance = function (text) { this.text = text; };
  return spoken;
}

afterEach(() => {
  delete globalThis.window;
  delete globalThis.SpeechSynthesisUtterance;
});

const v = (name, lang, voiceURI = name) => ({ name, lang, voiceURI });

test("Edge on Windows: neural Christel beats robotic Helle listed first", async () => {
  const spoken = installSpeech([
    v("Microsoft Helle - Danish (Denmark)", "da-DK"),
    v("Microsoft Mark - English (United States)", "en-US"),
    v("Microsoft Christel Online (Natural) - Danish (Denmark)", "da-DK"),
    v("Microsoft Jeppe Online (Natural) - Danish (Denmark)", "da-DK"),
  ]);
  assert.equal(await createWebSpeechProvider().speak({ text: "Hej" }), true);
  assert.equal(spoken.length, 1);
  assert.equal(spoken[0].voice.name, "Microsoft Christel Online (Natural) - Danish (Denmark)");
  assert.equal(spoken[0].lang, "da-DK");
});

test("Chrome on Windows: Google dansk beats Microsoft Helle", async () => {
  const spoken = installSpeech([
    v("Microsoft Helle - Danish (Denmark)", "da-DK"),
    v("Google dansk", "da-DK"),
  ]);
  await createWebSpeechProvider().speak({ text: "Hej" });
  assert.equal(spoken[0].voice.name, "Google dansk");
});

test("Apple: premium beats enhanced beats compact", async () => {
  const spoken = installSpeech([
    v("Sara", "da-DK", "com.apple.voice.compact.da-DK.Sara"),
    v("Sara (Enhanced)", "da-DK", "com.apple.voice.enhanced.da-DK.Sara"),
    v("Magnus (Premium)", "da-DK", "com.apple.voice.premium.da-DK.Magnus"),
  ]);
  await createWebSpeechProvider().speak({ text: "Hej" });
  assert.equal(spoken[0].voice.name, "Magnus (Premium)");
});

test("equal quality keeps the browser's list order (deterministic)", async () => {
  const spoken = installSpeech([
    v("Microsoft Christel Online (Natural) - Danish (Denmark)", "da-DK"),
    v("Microsoft Jeppe Online (Natural) - Danish (Denmark)", "da-DK"),
  ]);
  await createWebSpeechProvider().speak({ text: "Hej" });
  assert.equal(spoken[0].voice.name, "Microsoft Christel Online (Natural) - Danish (Denmark)");
});

test("never picks a non-Danish voice, even a natural one", async () => {
  const spoken = installSpeech([
    v("Microsoft Aria Online (Natural) - English (United States)", "en-US"),
    v("Microsoft Helle - Danish (Denmark)", "da-DK"),
  ]);
  await createWebSpeechProvider().speak({ text: "Hej" });
  assert.equal(spoken[0].voice.name, "Microsoft Helle - Danish (Denmark)");
});

test("no Danish voice / voices not loaded → default voice, still speaks", async () => {
  let spoken = installSpeech([v("Microsoft Mark - English (United States)", "en-US")]);
  assert.equal(await createWebSpeechProvider().speak({ text: "Hej" }), true);
  assert.equal(spoken[0].voice, undefined);
  assert.equal(spoken[0].lang, "da-DK");

  spoken = installSpeech([]);
  assert.equal(await createWebSpeechProvider().speak({ text: "Hej" }), true);
  assert.equal(spoken[0].voice, undefined);
});

test("malformed voice entries never throw", async () => {
  const spoken = installSpeech([null, {}, { lang: 42 }, v("Google dansk", "da-DK")]);
  assert.equal(await createWebSpeechProvider().speak({ text: "Hej" }), true);
  assert.equal(spoken[0].voice.name, "Google dansk");
});
