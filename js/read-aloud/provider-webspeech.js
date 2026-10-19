// ── Web Speech read-aloud provider (157O) ────────────────────────────────────
// Zero-cost browser speech with deterministic voice choice, playback controls and
// word-boundary events for the visual reading track. Nothing is uploaded by app code.

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

function availableVoices() {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis ||
        typeof window.speechSynthesis.getVoices !== "function") return [];
    const voices = window.speechSynthesis.getVoices();
    return Array.isArray(voices) ? voices : [];
  } catch (_e) {
    return [];
  }
}

/**
 * List voices for one language, best quality first while preserving browser order
 * within a quality tier. Returned objects contain no browser-specific methods.
 */
export function listSpeechVoices(lang = "da-DK") {
  try {
    const want = typeof lang === "string" && lang ? lang.toLowerCase() : "da-dk";
    const base = want.split("-")[0];
    return availableVoices()
      .map((voice, index) => ({ voice, index }))
      .filter(({ voice }) => {
        const voiceLang = voice && typeof voice.lang === "string"
          ? voice.lang.toLowerCase().replace("_", "-")
          : "";
        return voiceLang.split("-")[0] === base;
      })
      .sort((a, b) => voiceQuality(b.voice) - voiceQuality(a.voice) || a.index - b.index)
      .map(({ voice }) => ({
        name: typeof voice.name === "string" && voice.name ? voice.name : "Ukendt stemme",
        voiceURI: typeof voice.voiceURI === "string" ? voice.voiceURI : "",
        lang: typeof voice.lang === "string" ? voice.lang : lang,
      }))
      .filter((voice) => voice.voiceURI.length > 0);
  } catch (_e) {
    return [];
  }
}

function pickVoice(lang, requestedVoiceURI) {
  try {
    const voices = availableVoices();
    if (voices.length === 0) return null;
    const want = (typeof lang === "string" && lang ? lang : "da-DK").toLowerCase();
    const base = want.split("-")[0];

    if (typeof requestedVoiceURI === "string" && requestedVoiceURI) {
      const requested = voices.find((voice) => {
        const voiceLang = voice && typeof voice.lang === "string"
          ? voice.lang.toLowerCase().replace("_", "-")
          : "";
        return voice && voice.voiceURI === requestedVoiceURI && voiceLang.split("-")[0] === base;
      });
      if (requested) return requested;
    }

    let exact = null;
    let exactQ = -1;
    let same = null;
    let sameQ = -1;
    for (const voice of voices) {
      const voiceLang = voice && typeof voice.lang === "string"
        ? voice.lang.toLowerCase().replace("_", "-")
        : "";
      if (!voiceLang) continue;
      const quality = voiceQuality(voice);
      if (voiceLang === want && quality > exactQ) { exact = voice; exactQ = quality; }
      if (voiceLang.split("-")[0] === base && quality > sameQ) { same = voice; sameQ = quality; }
    }
    return exact || same || null;
  } catch (_e) {
    return null;
  }
}

function warmVoices() {
  try { availableVoices(); } catch (_e) { /* speech still works with the default voice */ }
}

function safeRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(2, Math.max(0.6, n));
}

function wordLength(text, index, reported) {
  if (Number.isFinite(reported) && reported > 0) return reported;
  try {
    const match = String(text).slice(index).match(/^[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/u);
    return match ? match[0].length : 1;
  } catch (_e) {
    return 1;
  }
}

function locateParts(text, segments, fallbackLang) {
  const runs = Array.isArray(segments)
    ? segments.filter((segment) => segment && typeof segment.text === "string" && segment.text.trim())
    : [];
  if (runs.length === 0) return [{ text, lang: fallbackLang, offset: 0 }];

  let cursor = 0;
  return runs.map((run) => {
    let offset = text.indexOf(run.text, cursor);
    if (offset < 0) {
      const trimmed = run.text.trim();
      offset = trimmed ? text.indexOf(trimmed, cursor) : -1;
    }
    if (offset < 0) offset = cursor;
    cursor = Math.max(cursor, offset + run.text.length);
    return {
      text: run.text,
      lang: typeof run.lang === "string" && run.lang ? run.lang : fallbackLang,
      offset,
    };
  });
}

function notify(req, state) {
  try { if (req && typeof req.onState === "function") req.onState(state); }
  catch (_e) { /* UI callbacks can never break speech */ }
}

export function createWebSpeechProvider() {
  warmVoices();
  let activeFinish = null;
  let activeNotify = null;

  function finish(state) {
    const done = activeFinish;
    activeFinish = null;
    activeNotify = null;
    try { if (typeof done === "function") done(state); } catch (_e) { /* fail-soft */ }
  }

  function stop() {
    try {
      if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    } catch (_e) { /* fail-soft */ }
    finish("ended");
  }

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

    /** Speech synthesis can read any non-empty text once the browser supports it. */
    canSpeak(req) {
      try {
        return this.isSupported() && !!(req && typeof req.text === "string" && req.text.trim());
      } catch (_e) {
        return false;
      }
    },

    async speak(req) {
      try {
        if (!this.isSupported()) return false;
        const text = req && typeof req.text === "string" ? req.text : "";
        const lang = req && typeof req.lang === "string" && req.lang ? req.lang : "da-DK";
        const parts = locateParts(text, req && req.segments, lang)
          .filter((part) => part.text.trim().length > 0);
        if (parts.length === 0) return false;

        stop();
        let remaining = parts.length;
        let completed = false;
        const complete = (state) => {
          if (completed) return;
          completed = true;
          notify(req, state);
        };
        activeFinish = complete;
        activeNotify = (state) => notify(req, state);
        // cancel() reports the replaced utterances asynchronously; only the current request may react.
        const isCurrent = () => activeFinish === complete;

        for (const part of parts) {
          const utterance = new SpeechSynthesisUtterance(part.text);
          utterance.lang = part.lang;
          utterance.rate = safeRate(req && req.rate);
          const voice = pickVoice(utterance.lang, req && req.voiceURI);
          if (voice) utterance.voice = voice;
          utterance.onstart = () => { if (isCurrent()) notify(req, "speaking"); };
          utterance.onboundary = (event) => {
            try {
              if (!isCurrent()) return;
              if (event && event.name && event.name !== "word") return;
              const localIndex = event && Number.isFinite(event.charIndex) ? event.charIndex : 0;
              if (req && typeof req.onBoundary === "function") {
                req.onBoundary({
                  charIndex: part.offset + localIndex,
                  charLength: wordLength(part.text, localIndex, event && event.charLength),
                });
              }
            } catch (_e) { /* highlighting is optional */ }
          };
          utterance.onend = () => {
            if (!isCurrent()) return;
            remaining -= 1;
            if (remaining === 0) finish("ended");
          };
          utterance.onerror = () => { if (isCurrent()) finish("error"); };
          window.speechSynthesis.speak(utterance);
        }
        return true;
      } catch (_e) {
        stop();
        return false;
      }
    },

    stop,

    pause() {
      try {
        const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
        if (!synth || typeof synth.pause !== "function" || synth.paused) return false;
        synth.pause();
        if (typeof activeNotify === "function") activeNotify("paused");
        return true;
      } catch (_e) {
        return false;
      }
    },

    resume() {
      try {
        const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
        if (!synth || typeof synth.resume !== "function" || !synth.paused) return false;
        synth.resume();
        if (typeof activeNotify === "function") activeNotify("speaking");
        return true;
      } catch (_e) {
        return false;
      }
    },

    listVoices(lang) {
      return listSpeechVoices(lang);
    },
  };
}
