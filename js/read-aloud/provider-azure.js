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
//
// Long texts (D-362 / F-07): a text over the per-request limit is planned as a few ordinary
// requests ("parts", js/read-aloud/tts-chunks.js) and read as ONE reading: the parts play one
// after another on the same audio element (an element started by the pupil's tap may keep
// playing, also in Safari), the next part is fetched while the current one plays (one part
// ahead, never all at once), and pause/resume/stop act on the whole reading. A text that fits is
// one part — the same request and the same cached clip as before.

import { ttsKey, ttsClipPaths } from "./tts-key.js";
import { planTtsRequests } from "./tts-chunks.js";

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
 * @param {number} [from]  where to start searching (the end of the previous part of a long text)
 * @returns {{charIndex:number, charLength:number, t:number, d:number}[]}
 */
export function alignWords(text, words, from = 0) {
  const source = typeof text === "string" ? text : "";
  const lower = source.toLocaleLowerCase("da-DK");
  const timeline = [];
  let cursor = Number.isInteger(from) && from > 0 ? Math.min(from, source.length) : 0;
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
  const inflight = new Map();

  let _audio = null;
  let _request = null;
  let _finish = null;
  let _timer = null;
  let _generation = 0;
  // Long texts: between two parts (the next one is loading), and a pause pressed in that gap.
  let _between = false;
  let _held = false;
  let _resumeAction = null;

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
    _between = false;
    _held = false;
    _resumeAction = null;
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
  async function loadClip(canonical, key) {
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

  /** One clip per key: from memory, or one shared load (a prefetch and a restart never ask twice). */
  function clipFor(canonical, key) {
    if (memo.has(key)) return Promise.resolve(memo.get(key));
    if (inflight.has(key)) return inflight.get(key);
    const pending = loadClip(canonical, key).finally(() => { inflight.delete(key); });
    inflight.set(key, pending);
    return pending;
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

  function applyRate(el, rate) {
    // Setting a new src resets playbackRate to defaultPlaybackRate, so both are set for every part.
    try { el.defaultPlaybackRate = rate; } catch (_e) { /* older engines */ }
    el.playbackRate = rate;
    el.preservesPitch = true;
  }

  async function playWithTimeout(el) {
    let timer = null;
    const timedOut = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("play_timeout")), timeouts.playMs);
    });
    try {
      await Promise.race([el.play(), timedOut]);
    } finally {
      clearTimeout(timer);
    }
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

    /** Any valid text within the limits can be voiced (cached, or synthesised once); a long text as parts. */
    canSpeak(req) {
      try {
        return this.isSupported() && planTtsRequests(req && req.text, req && req.segments).ok === true;
      } catch (_e) {
        return false;
      }
    },

    async speak(req) {
      stop();
      const run = _generation;
      const live = () => run === _generation;
      try {
        const plan = planTtsRequests(req && req.text, req && req.segments);
        if (!plan.ok) return false;
        const parts = plan.parts;
        // One load per part and reading; started for part i+1 while part i plays (one ahead).
        const loads = new Map();
        const load = (i) => {
          if (!loads.has(i)) {
            const pending = ttsKey(parts[i]).then((key) => clipFor(parts[i], key));
            pending.catch(() => { /* a failed prefetch is reported only when its part is due */ });
            loads.set(i, pending);
          }
          return loads.get(i);
        };
        const first = await load(0);
        if (!live()) return false; // stopped or replaced while loading

        const text = typeof req.text === "string" ? req.text : "";
        const wanted = Number(req && req.rate);
        const rate = Number.isFinite(wanted) ? Math.min(MAX_RATE, Math.max(MIN_RATE, wanted)) : 1;
        const el = new Audio(first.audio);
        el.preload = "auto";
        applyRate(el, rate);
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
          if (!live()) return;
          const finish = _finish;
          _finish = null;
          _audio = null;
          _request = null;
          _between = false;
          _held = false;
          _resumeAction = null;
          if (typeof finish === "function") finish(state);
        };

        let index = 0;
        let cursor = 0;
        let tick = () => {};
        // Where part i begins in the shown text (when the text is already NFC, as pupil texts are).
        const starts = Array.isArray(plan.starts) && text === text.normalize("NFC") ? plan.starts : null;
        const usePart = (i, meta) => {
          index = i;
          if (starts && Number.isInteger(starts[i])) cursor = Math.max(cursor, starts[i]);
          const timeline = alignWords(text, meta.words, cursor);
          if (timeline.length > 0) cursor = timeline[timeline.length - 1].charIndex + timeline[timeline.length - 1].charLength;
          tick = highlighter(el, timeline, req);
        };
        const advance = async (i) => {
          stopTicking();
          _between = true;
          let meta;
          try { meta = await load(i); } catch (_e) { end("error"); return; }
          if (!live()) return;
          const go = () => {
            if (!live()) return;
            _between = false;
            usePart(i, meta);
            el.src = meta.audio;
            applyRate(el, rate);
            playWithTimeout(el).catch(() => end("error"));
          };
          if (_held) { _resumeAction = go; return; }
          go();
        };

        usePart(0, first);
        el.addEventListener("timeupdate", () => { if (live() && !_between) tick(); });
        el.addEventListener("playing", () => {
          if (!live()) return;
          notify(req, "speaking");
          startTicking(() => tick());
          if (index + 1 < parts.length) load(index + 1);
        });
        el.addEventListener("ended", () => {
          if (!live() || _between) return;
          if (index + 1 < parts.length) void advance(index + 1);
          else end("ended");
        });
        el.addEventListener("error", () => { if (live() && !_between) end("error"); });

        await playWithTimeout(el);
        return live();
      } catch (_e) {
        if (live()) {
          _finish = null; // a failed start has not "ended"; the caller shows the error state
          stop();
        }
        return false;
      }
    },

    stop,

    pause() {
      try {
        if (_between) {
          // Between two parts of a long text: the next part waits until the pupil resumes.
          if (!_request) return false;
          if (!_held) { _held = true; notify(_request, "paused"); }
          return true;
        }
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
        if (_held) {
          _held = false;
          notify(_request, "speaking");
          const action = _resumeAction;
          _resumeAction = null;
          if (typeof action === "function") action(); // else the part still loading starts when it arrives
          return true;
        }
        if (_between) return false;
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
