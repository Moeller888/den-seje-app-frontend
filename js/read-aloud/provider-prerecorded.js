// ── Pre-recorded (Piper) read-aloud provider (157O) ──────────────────────────
// The DECIDED primary provider (157A): play a pre-generated Piper clip via the
// js/audio.js graceful-playback pattern. Returns false when no clip exists for the
// key, so the facade falls back to the on-device Web Speech provider. Image/audio data
// is local; nothing is uploaded.

import { clipPathFor, hasClips } from "./manifest.js";

const PROVIDER_ID = "prerecorded";

/**
 * @param {{clipPathFor?:(key:string|null)=>string|null, hasClips?:()=>boolean}} [options]
 *        Clip lookup; defaults to the shipped manifest (injectable for tests).
 */
export function createPrerecordedProvider(options) {
  const opts = options && typeof options === "object" ? options : {};
  const resolveClip = typeof opts.clipPathFor === "function" ? opts.clipPathFor : clipPathFor;
  const anyClips = typeof opts.hasClips === "function" ? opts.hasClips : hasClips;
  let _current = null;
  let _finish = null;
  let _request = null;

  function notify(req, state) {
    try { if (req && typeof req.onState === "function") req.onState(state); }
    catch (_e) { /* UI callbacks can never break playback */ }
  }

  function stop() {
    try {
      if (_current) { _current.pause(); _current.currentTime = 0; }
    } catch (_e) { /* ignore */ }
    _current = null;
    _request = null;
    const finish = _finish;
    _finish = null;
    try { if (typeof finish === "function") finish("ended"); } catch (_e) { /* ignore */ }
  }

  return {
    id: PROVIDER_ID,

    /** Supported only when audio playback exists AND at least one clip is shipped. */
    isSupported() {
      try { return typeof Audio !== "undefined" && anyClips() === true; } catch (_e) { return false; }
    },

    /** True only when a clip exists for this exact request. */
    canSpeak(req) {
      try { return this.isSupported() && !!resolveClip(req && req.clipKey); } catch (_e) { return false; }
    },

    async speak(req) {
      try {
        const path = resolveClip(req && req.clipKey);
        if (!path) return false; // no clip → let the facade fall back
        stop();
        const el = new Audio(path);
        _current = el;
        _request = req;
        const rate = Number(req && req.rate);
        el.playbackRate = Number.isFinite(rate) ? Math.min(2, Math.max(0.6, rate)) : 1;
        let completed = false;
        _finish = (state) => {
          if (completed) return;
          completed = true;
          _current = null;
          notify(req, state);
          _request = null;
        };
        el.addEventListener("playing", () => notify(req, "speaking"), { once: true });
        el.addEventListener("ended", () => {
          const finish = _finish;
          _finish = null;
          if (typeof finish === "function") finish("ended");
        }, { once: true });
        el.addEventListener("error", () => {
          const finish = _finish;
          _finish = null;
          if (typeof finish === "function") finish("error");
        }, { once: true });
        await el.play();        // resolves when playback starts
        return true;
      } catch (_e) {
        // The facade retries this same request with the next provider, so it has not
        // ended: drop its finish callback before stopping to avoid a false "ended".
        _finish = null;
        stop();
        return false;           // failed to play → fall back
      }
    },

    stop,

    pause() {
      try {
        if (!_current || _current.paused) return false;
        _current.pause();
        notify(_request, "paused");
        return true;
      } catch (_e) {
        return false;
      }
    },

    resume() {
      try {
        if (!_current || !_current.paused) return false;
        void _current.play();
        notify(_request, "speaking");
        return true;
      } catch (_e) {
        return false;
      }
    },

    listVoices() { return []; },
  };
}
