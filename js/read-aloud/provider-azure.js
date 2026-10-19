// ── Cached Azure Neural read-aloud provider (157P) ───────────────────────────
// The normal production provider. Every browser plays the SAME file: the clip key is the
// SHA-256 of the canonical request (js/read-aloud/tts-key.js), so Edge, Chrome, Firefox and
// Safari fetch the same /tts/v<N>/<key>.mp3 and the same word timings.
//
//   1. GET  /tts/v<N>/<key>.json   cached clip (public, immutable)          → play
//   2. POST /api/tts {text,segments} only on a miss, with the user's token  → play
//
// Only the question/answer text and its language runs are sent; never a name or user data
// (the access token is used by the Worker for authentication and rate limiting only).
// Word highlighting follows the audio element's own media clock (currentTime), so the
// timings stay correct at every playback rate and across pause/resume.

import { canonicalTtsRequest, ttsKey, ttsClipPaths } from "./tts-key.js";

const PROVIDER_ID = "azure-cached";
const MIN_RATE = 0.5;
const MAX_RATE = 2;
const TICK_MS = 50;
const MEMO_LIMIT = 200;

export const TTS_TIMEOUTS = Object.freeze({ metaMs: 8000, synthesizeMs: 25000, playMs: 12000 });

/**
 * Map Azure word boundaries onto positions in the text the UI shows. Words are searched in
 * order from the previous match, so repeated words land on the right occurrence; a word that
 * cannot be found is dropped (speech continues, that word is simply not highlighted).
 * @param {string} text
 * @param {{w:string, t:number, d:number}[]} words
 * @returns {{charIndex:number, charLength:number, t:number, d:number}[]}
 */
export function alignWords(text, words) {
  const source = typeof text === "string" ? text : "";
  const lower = source.toLocaleLowerCase("da-DK");
  const timeline = [];
  let cursor = 0;
  for (const word of Array.isArray(words) ? words : []) {
    if (!word || typeof word.w !== "string" || !word.w || !Number.isFinite(word.t)) continue;
    let at = source.indexOf(word.w, cursor);
    if (at < 0) at = lower.indexOf(word.w.toLocaleLowerCase("da-DK"), cursor);
    if (at < 0) continue;
    timeline.push({ charIndex: at, charLength: word.w.length, t: word.t, d: Number.isFinite(word.d) ? word.d : 0 });
    cursor = at + word.w.length;
  }
  return timeline;
}

/**
 * Index of the word being spoken at a media time (ms), or -1 before the first word.
 * Media time is the audio element's currentTime, which already runs faster or slower with
 * playbackRate — so no separate scaling of the stored timings is needed or wanted.
 */
export function wordIndexAt(timeline, mediaMs) {
  if (!Array.isArray(timeline) || !Number.isFinite(mediaMs)) return -1;
  let found = -1;
  for (let i = 0; i < timeline.length; i++) {
    if (timeline[i].t <= mediaMs) found = i;
    else break;
  }
  return found;
}

/** Wall-clock milliseconds until a word starts, at a given playback rate. */
export function wallClockMs(mediaMs, rate) {
  const r = Number.isFinite(rate) && rate > 0 ? rate : 1;
  return mediaMs / r;
}

async function defaultAccessToken() {
  try {
    const client = typeof window !== "undefined" && window.supabase && window.supabase.auth;
    if (!client || typeof client.getSession !== "function") return null;
    const { data } = await client.getSession();
    const token = data && data.session && data.session.access_token;
    return typeof token === "string" && token.length > 0 ? token : null;
  } catch (_e) {
    return null;
  }
}

/**
 * @param {{fetchImpl?:typeof fetch, getAccessToken?:() => Promise<string|null>,
 *          timeouts?:{metaMs?:number, synthesizeMs?:number, playMs?:number}}} [options]
 */
export function createAzureProvider(options) {
  const opts = options && typeof options === "object" ? options : {};
  const doFetch = typeof opts.fetchImpl === "function"
    ? opts.fetchImpl
    : (...args) => globalThis.fetch(...args);
  const getAccessToken = typeof opts.getAccessToken === "function" ? opts.getAccessToken : defaultAccessToken;
  const timeouts = { ...TTS_TIMEOUTS, ...(opts.timeouts && typeof opts.timeouts === "object" ? opts.timeouts : {}) };
  const memo = new Map();

  let _audio = null;
  let _request = null;
  let _finish = null;
  let _timer = null;
  let _generation = 0;

  function notify(req, state) {
    try { if (req && typeof req.onState === "function") req.onState(state); }
    catch (_e) { /* UI callbacks can never break playback */ }
  }

  function stopTicking() {
    if (_timer !== null) { clearInterval(_timer); _timer = null; }
  }

  function stop() {
    _generation += 1;
    stopTicking();
    try { if (_audio) { _audio.pause(); _audio.removeAttribute && _audio.removeAttribute("src"); } } catch (_e) { /* ignore */ }
    _audio = null;
    _request = null;
    const finish = _finish;
    _finish = null;
    try { if (typeof finish === "function") finish("ended"); } catch (_e) { /* ignore */ }
  }

  async function fetchWithTimeout(url, init, ms) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = setTimeout(() => { if (controller) controller.abort(); }, ms);
    try {
      return await doFetch(url, { ...(init || {}), ...(controller ? { signal: controller.signal } : {}) });
    } finally {
      clearTimeout(timer);
    }
  }

  function remember(key, meta) {
    if (memo.size >= MEMO_LIMIT) memo.delete(memo.keys().next().value);
    memo.set(key, meta);
  }

  function validMeta(meta, key) {
    return !!meta && typeof meta === "object" && meta.key === key &&
      typeof meta.audio === "string" && meta.audio === ttsClipPaths(key).audio && Array.isArray(meta.words);
  }

  /** Cached metadata, else one synthesis request. Throws on any failure. */
  async function clipFor(canonical, key) {
    if (memo.has(key)) return memo.get(key);
    const cached = await fetchWithTimeout(ttsClipPaths(key).meta, { headers: { accept: "application/json" } }, timeouts.metaMs);
    let meta = null;
    if (cached.ok) {
      meta = await cached.json();
    } else if (cached.status === 404) {
      const token = await getAccessToken();
      if (!token) throw new Error("not_signed_in");
      const created = await fetchWithTimeout("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + token },
        body: JSON.stringify({ segments: canonical.segments.map((run) => ({ text: run.text, lang: run.lang })) }),
      }, timeouts.synthesizeMs);
      if (!created.ok) throw new Error("synthesis_" + created.status);
      meta = await created.json();
    } else {
      throw new Error("meta_" + cached.status);
    }
    if (!validMeta(meta, key)) throw new Error("invalid_meta");
    remember(key, meta);
    return meta;
  }

  /** Highlighter for one clip: emits a boundary whenever the spoken word changes. */
  function highlighter(el, timeline, req) {
    let last = -1;
    return () => {
      try {
        const index = wordIndexAt(timeline, el.currentTime * 1000);
        if (index === last || index < 0) return;
        last = index;
        if (typeof req.onBoundary === "function") {
          req.onBoundary({ charIndex: timeline[index].charIndex, charLength: timeline[index].charLength });
        }
      } catch (_e) { /* highlighting is optional */ }
    };
  }

  function startTicking(tick) {
    stopTicking();
    _timer = setInterval(tick, TICK_MS);
    tick();
  }

  return {
    id: PROVIDER_ID,

    isSupported() {
      try {
        return typeof Audio !== "undefined" && typeof globalThis.fetch === "function" &&
          !!(globalThis.crypto && globalThis.crypto.subtle);
      } catch (_e) {
        return false;
      }
    },

    /** Any valid text within the limits can be voiced (cached, or synthesised once). */
    canSpeak(req) {
      try {
        return this.isSupported() && canonicalTtsRequest(req && req.text, req && req.segments).ok === true;
      } catch (_e) {
        return false;
      }
    },

    async speak(req) {
      stop();
      const run = _generation;
      try {
        const checked = canonicalTtsRequest(req && req.text, req && req.segments);
        if (!checked.ok) return false;
        const key = await ttsKey(checked.value);
        const meta = await clipFor(checked.value, key);
        if (run !== _generation) return false; // stopped or replaced while loading

        const timeline = alignWords(req.text, meta.words);
        const el = new Audio(meta.audio);
        el.preload = "auto";
        const rate = Number(req && req.rate);
        el.playbackRate = Number.isFinite(rate) ? Math.min(MAX_RATE, Math.max(MIN_RATE, rate)) : 1;
        el.preservesPitch = true;
        _audio = el;
        _request = req;
        let completed = false;
        _finish = (state) => {
          if (completed) return;
          completed = true;
          stopTicking();
          notify(req, state);
        };
        const end = (state) => {
          if (run !== _generation) return;
          const finish = _finish;
          _finish = null;
          _audio = null;
          _request = null;
          if (typeof finish === "function") finish(state);
        };
        const tick = highlighter(el, timeline, req);
        el.addEventListener("timeupdate", () => { if (run === _generation) tick(); });
        el.addEventListener("playing", () => {
          if (run !== _generation) return;
          notify(req, "speaking");
          startTicking(tick);
        });
        el.addEventListener("ended", () => end("ended"), { once: true });
        el.addEventListener("error", () => end("error"), { once: true });

        let timer = null;
        const timedOut = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("play_timeout")), timeouts.playMs);
        });
        try {
          await Promise.race([el.play(), timedOut]);
        } finally {
          clearTimeout(timer);
        }
        return run === _generation;
      } catch (_e) {
        if (run === _generation) {
          _finish = null; // a failed start has not "ended"; the caller shows the error state
          stop();
        }
        return false;
      }
    },

    stop,

    pause() {
      try {
        if (!_audio || _audio.paused) return false;
        _audio.pause();
        stopTicking();
        notify(_request, "paused");
        return true;
      } catch (_e) {
        return false;
      }
    },

    resume() {
      try {
        if (!_audio || !_audio.paused) return false;
        void _audio.play();
        return true;
      } catch (_e) {
        return false;
      }
    },

    listVoices() { return []; },
  };
}
