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

// Pick a voice for `lang` from the synth's list, preferring an exact match (e.g.
// "da-DK", "en-GB"), then any voice of the same language ("da*", "en*"). Within each
// of those groups the most natural voice wins (voiceQuality); ties keep the browser's
// list order. Returns null when voices are not yet loaded or none matches the
// language — the caller then speaks with `utterance.lang` only, so read-aloud still
// works (browser default voice). Never picks a voice of another language. Never throws.
function pickVoice(lang) {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis ||
        typeof window.speechSynthesis.getVoices !== "function") return null;
    const voices = window.speechSynthesis.getVoices();
    if (!Array.isArray(voices) || voices.length === 0) return null; // not loaded yet → no hard fail
    const want = (typeof lang === "string" && lang ? lang : "da-DK").toLowerCase();
    let exact = null;
    let exactQ = -1;
    const base = want.split("-")[0];
    let same = null;
    let sameQ = -1;
    for (const v of voices) {
      const vlang = (v && typeof v.lang === "string" ? v.lang : "").toLowerCase().replace("_", "-");
      if (vlang.length === 0) continue;
      const q = voiceQuality(v);
      if (vlang === want && q > exactQ) { exact = v; exactQ = q; }
      if (vlang.split("-")[0] === base && q > sameQ) { same = v; sameQ = q; }
    }
    return exact || same || null;
  } catch (_e) {
    return null;
  }
}

// Start loading the device's voice list ahead of the first click. Chrome only begins
// loading voices on the first getVoices() call and returns [] until they arrive, so
// without this the first "🔊" click of a page always got the default (robotic) voice.
// The provider is created when the 🔊 button renders, so the list is ready by the time
// the student clicks. Fire-and-forget; never throws.
function warmVoices() {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis ||
        typeof window.speechSynthesis.getVoices !== "function") return;
    window.speechSynthesis.getVoices();
  } catch (_e) { /* fail-soft: speak() still works with the default voice */ }
}

export function createWebSpeechProvider() {
  warmVoices();
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
        const lang = (req && typeof req.lang === "string" && req.lang) ? req.lang : "da-DK";
        // Language runs (English subject): each run gets its own voice; speechSynthesis
        // queues them, so they play in order. Without runs the whole text is one run.
        const runs = req && Array.isArray(req.segments)
          ? req.segments.filter((s) => s && typeof s.text === "string" && s.text.trim().length > 0)
          : [];
        const parts = runs.length > 0 ? runs : [{ text, lang }];
        if (parts.every((p) => p.text.trim().length === 0)) return false;
        window.speechSynthesis.cancel(); // stop anything in progress
        for (const p of parts) {
          const u = new SpeechSynthesisUtterance(p.text);
          u.lang = (typeof p.lang === "string" && p.lang) ? p.lang : lang;
          const voice = pickVoice(u.lang); // prefer the most natural voice of that language
          if (voice) u.voice = voice;      // else fall back to the browser default voice
          window.speechSynthesis.speak(u);
        }
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
