// ── Read-aloud clip identity (157P) ──────────────────────────────────────────
// ONE definition of "which clip is this", shared by the browser provider, the Cloudflare
// Worker (worker/) and the offline generator (tools/read-aloud/). All three build the same
// canonical request and hash it the same way, so Edge, Chrome, Firefox and Safari ask for
// the same URL and receive the same cached file.
//
// The key covers: normalised text per language run, the run languages, the voice names,
// the audio format and TTS_CACHE_VERSION. Changing any of them yields a new key (= a new
// file); a shipped clip is never overwritten. Bump TTS_CACHE_VERSION to re-voice everything.

export const TTS_CACHE_VERSION = 1;

/** Azure Neural voice per supported language run. The only voices production plays. */
export const TTS_VOICES = Object.freeze({
  "da-DK": "da-DK-ChristelNeural",
  "en-GB": "en-GB-SoniaNeural",
});

export const TTS_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

/** Input limits, enforced identically in the browser and the Worker. */
export const TTS_LIMITS = Object.freeze({ maxChars: 800, maxSegments: 24 });

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;

/** NFC, whitespace collapsed to single spaces, trimmed. Non-strings become "". */
export function normalizeTtsText(value) {
  if (typeof value !== "string") return "";
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

/**
 * Build the canonical synthesis request. Adjacent runs of the same language are merged so
 * the voice only switches where the language does.
 * @param {string} text
 * @param {{text:string, lang:string}[]} [segments]
 * @returns {{ok:true, value:{v:number, format:string, segments:{lang:string, voice:string, text:string}[]}}
 *          | {ok:false, error:string}}
 */
export function canonicalTtsRequest(text, segments) {
  try {
    if (typeof text !== "string" && !Array.isArray(segments)) return { ok: false, error: "missing_text" };
    if (typeof text === "string" && CONTROL_CHARS.test(text)) return { ok: false, error: "invalid_text" };
    const source = Array.isArray(segments) && segments.length > 0
      ? segments
      : [{ text, lang: "da-DK" }];
    if (source.length > TTS_LIMITS.maxSegments) return { ok: false, error: "too_many_segments" };

    const runs = [];
    for (const segment of source) {
      if (!segment || typeof segment !== "object") return { ok: false, error: "invalid_segment" };
      if (typeof segment.text !== "string" || CONTROL_CHARS.test(segment.text)) return { ok: false, error: "invalid_text" };
      const lang = typeof segment.lang === "string" ? segment.lang : "";
      if (!Object.prototype.hasOwnProperty.call(TTS_VOICES, lang)) return { ok: false, error: "unsupported_language" };
      const runText = normalizeTtsText(segment.text);
      if (!runText) continue;
      const last = runs.length > 0 ? runs[runs.length - 1] : null;
      if (last && last.lang === lang) last.text = last.text + " " + runText;
      else runs.push({ lang, voice: TTS_VOICES[lang], text: runText });
    }
    if (runs.length === 0) return { ok: false, error: "empty_text" };
    const chars = runs.reduce((sum, run) => sum + run.text.length, 0);
    if (chars > TTS_LIMITS.maxChars) return { ok: false, error: "text_too_long" };
    return { ok: true, value: { v: TTS_CACHE_VERSION, format: TTS_FORMAT, segments: runs } };
  } catch (_e) {
    return { ok: false, error: "invalid_request" };
  }
}

/** Plain text of a canonical request (runs joined by a space). */
export function canonicalText(canonical) {
  const runs = canonical && Array.isArray(canonical.segments) ? canonical.segments : [];
  return runs.map((run) => run.text).join(" ");
}

/**
 * SHA-256 (hex) of the canonical request. Field order is fixed here, not taken from the input.
 * @returns {Promise<string>}
 */
export async function ttsKey(canonical) {
  const stable = JSON.stringify({
    v: canonical.v,
    format: canonical.format,
    segments: canonical.segments.map((run) => [run.lang, run.voice, run.text]),
  });
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(stable));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const TTS_KEY_PATTERN = /^[0-9a-f]{64}$/u;

/** Public, immutable paths of one clip. Same for every browser. */
export function ttsClipPaths(key) {
  const base = "/tts/v" + TTS_CACHE_VERSION + "/" + key;
  return { audio: base + ".mp3", meta: base + ".json" };
}

/** R2 object names of one clip (the public path without the leading slash). */
export function ttsObjectKeys(key) {
  const paths = ttsClipPaths(key);
  return { audio: paths.audio.slice(1), meta: paths.meta.slice(1) };
}
