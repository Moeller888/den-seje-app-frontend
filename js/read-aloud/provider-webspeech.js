// ── Web Speech read-aloud provider (157O) ────────────────────────────────────
// On-device fallback (browser SpeechSynthesis). Zero-cost, no files, no network, no
// upload — runs entirely on the device. Used when no pre-recorded Piper clip exists.
// Danish voice availability/quality varies by device, hence pre-recorded is preferred;
// this guarantees read-aloud still works before clips are produced.

const PROVIDER_ID = "webspeech";

// Pick a Danish voice from the synth's list, preferring an exact match to `lang`
// (e.g. "da-DK"), then any Danish voice ("da*"). Returns null when voices are not
// yet loaded or none is Danish — the caller then speaks with `utterance.lang` only,
// so read-aloud still works (browser default voice). Never throws.
function pickDanishVoice(lang) {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis ||
        typeof window.speechSynthesis.getVoices !== "function") return null;
    const voices = window.speechSynthesis.getVoices();
    if (!Array.isArray(voices) || voices.length === 0) return null; // not loaded yet → no hard fail
    const want = (typeof lang === "string" && lang ? lang : "da-DK").toLowerCase();
    let exact = null;
    let danish = null;
    for (const v of voices) {
      const vlang = (v && typeof v.lang === "string" ? v.lang : "").toLowerCase();
      if (vlang.length === 0) continue;
      if (exact === null && vlang === want) exact = v;
      if (danish === null && vlang.indexOf("da") === 0) danish = v;
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
