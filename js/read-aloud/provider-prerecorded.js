// ── Pre-recorded (Piper) read-aloud provider (157O) ──────────────────────────
// The DECIDED primary provider (157A): play a pre-generated Piper clip via the
// js/audio.js graceful-playback pattern. Returns false when no clip exists for the
// key, so the facade falls back to the on-device Web Speech provider. Image/audio data
// is local; nothing is uploaded.

import { clipPathFor } from "./manifest.js";

const PROVIDER_ID = "prerecorded";

export function createPrerecordedProvider() {
  let _current = null;

  function stop() {
    try {
      if (_current) { _current.pause(); _current.currentTime = 0; }
    } catch (_e) { /* ignore */ }
    _current = null;
  }

  return {
    id: PROVIDER_ID,

    isSupported() {
      try { return typeof Audio !== "undefined"; } catch (_e) { return false; }
    },

    async speak(req) {
      try {
        const path = clipPathFor(req && req.clipKey);
        if (!path) return false; // no clip → let the facade fall back
        stop();
        const el = new Audio(path);
        _current = el;
        await el.play();        // resolves when playback starts
        return true;
      } catch (_e) {
        return false;           // failed to play → fall back
      }
    },

    stop,
  };
}
