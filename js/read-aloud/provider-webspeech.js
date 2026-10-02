// ── Web Speech read-aloud provider (157O) ────────────────────────────────────
// On-device fallback (browser SpeechSynthesis). Zero-cost, no files, no network, no
// upload — runs entirely on the device. Used when no pre-recorded Piper clip exists.
// Danish voice availability/quality varies by device, hence pre-recorded is preferred;
// this guarantees read-aloud still works before clips are produced.

const PROVIDER_ID = "webspeech";

// Quality tier of a voice, judged from its name/voiceURI (higher = more natural).
// Browsers expose neural voices next to old robotic ones under the same language,
// so the first Danish voice in the list is often the worst one (e.g. "Microsoft
// Helle" on Windows). Known tiers:
//   4 — "Natural": Edge neural voices ("Microsoft Christel Online (Natural)").
//   3 — "Premium": Apple premium voices.
//   2 — "Enhanced": Apple enhanced voices.
//   1 — "Google": Chrome's Google voices ("Google dansk").
//   0 — anything else (device default quality).
// Deterministic: same voice → same tier. Never throws.
function voiceQuality(v) {
  try {
    const name = v && typeof v.name === "string" ? v.name : "";
    const uri = v && typeof v.voiceURI === "string" ? v.voiceURI : "";
    const id = (name + " " + uri).toLowerCase();
    if (id.indexOf("natural") !== -1) return 4;
    if (id.indexOf("premium") !== -1) return 3;
    if (id.indexOf("enhanced") !== -1) return 2;
    if (id.indexOf("google") !== -1) return 1;
    return 0;
  } catch (_e) {
    return 0;
  }
}

// Pick a Danish voice from the synth's list, preferring an exact match to `lang`
// (e.g. "da-DK"), then any Danish voice ("da*"). Within each of those groups the
// most natural voice wins (voiceQuality); ties keep the browser's list order.
// Returns null when voices are not yet loaded or none is Danish — the caller then
// speaks with `utterance.lang` only, so read-aloud still works (browser default
// voice). Never throws.
function pickDanishVoice(lang) {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis ||
        typeof window.speechSynthesis.getVoices !== "function") return null;
    const voices = window.speechSynthesis.getVoices();
    if (!Array.isArray(voices) || voices.length === 0) return null; // not loaded yet → no hard fail
    const want = (typeof lang === "string" && lang ? lang : "da-DK").toLowerCase();
    let exact = null;
    let exactQ = -1;
    let danish = null;
    let danishQ = -1;
    for (const v of voices) {
      const vlang = (v && typeof v.lang === "string" ? v.lang : "").toLowerCase();
      if (vlang.length === 0) continue;
      const q = voiceQuality(v);
      if (vlang === want && q > exactQ) { exact = v; exactQ = q; }
      if (vlang.indexOf("da") === 0 && q > danishQ) { danish = v; danishQ = q; }
    }
    return exact || danish || null;
  } catch (_e) {
    return null;
  }
}

export function createWebSpeechProvider() {
  return {
    id: PROVIDER_ID,

    isSupported() {
      try {
        return typeof window !== "undefined" &&
          "speechSynthesis" in window &&
          typeof SpeechSynthesisUtterance !== "undefined";
      } catch (_e) {
        return false;
      }
    },

    async speak(req) {
      try {
        if (!this.isSupported()) return false;
        const text = req && typeof req.text === "string" ? req.text : "";
        if (text.trim().length === 0) return false;
        window.speechSynthesis.cancel(); // stop anything in progress
        const u = new SpeechSynthesisUtterance(text);
        u.lang = (req && typeof req.lang === "string" && req.lang) ? req.lang : "da-DK";
        const voice = pickDanishVoice(u.lang); // prefer a Danish voice when one is available
        if (voice) u.voice = voice;            // else fall back to the browser default voice
        window.speechSynthesis.speak(u);
        return true;
      } catch (_e) {
        return false;
      }
    },

    stop() {
      try { if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel(); }
      catch (_e) { /* ignore */ }
    },
  };
}
