// ── Web Speech read-aloud provider (157O) ────────────────────────────────────
// On-device fallback (browser SpeechSynthesis). Zero-cost, no files, no network, no
// upload — runs entirely on the device. Used when no pre-recorded Piper clip exists.
// Danish voice availability/quality varies by device, hence pre-recorded is preferred;
// this guarantees read-aloud still works before clips are produced.

const PROVIDER_ID = "webspeech";

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
