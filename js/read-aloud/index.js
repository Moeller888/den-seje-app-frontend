// ── Read-aloud service facade (157O) ─────────────────────────────────────────
// Single entry point for read-aloud. Hides providers entirely; callers just ask it to
// speak text. Default-off, fail-soft, zero-cost. Provider order: PRE-RECORDED (Piper
// clip, preferred) → WEB SPEECH (on-device fallback). The first provider that actually
// produces audio wins.
//
// No upload, no third-party service (Web Speech runs on-device; clips are first-party
// static assets). Built on the js/audio.js graceful-no-op philosophy.

import { assertReadAloudProvider } from "./provider.js";
import { createPrerecordedProvider } from "./provider-prerecorded.js";
import { createWebSpeechProvider } from "./provider-webspeech.js";
import { hashKey } from "./manifest.js";

// Master switch (157O). ACTIVATED (Web Speech only; Piper manifest stays empty).
// On-device, no consent, fail-soft — see docs/157o-read-aloud.md §activation.
export const ENABLE_READ_ALOUD = true;

/** Whether the read-aloud flag is on (no capability check). No side effects. */
export function isReadAloudEnabled() {
  return ENABLE_READ_ALOUD === true;
}

/**
 * Create a read-aloud service.
 * @param {{enabled?:boolean, providers?:import('./provider.js').ReadAloudProvider[]}} [config]
 */
export function createReadAloud(config) {
  const cfg = config && typeof config === "object" ? config : {};
  const enabled = cfg.enabled !== undefined ? !!cfg.enabled : (ENABLE_READ_ALOUD === true);

  let _providers = null;
  function providers() {
    if (_providers) return _providers;
    const list = Array.isArray(cfg.providers) && cfg.providers.length > 0
      ? cfg.providers
      : [createPrerecordedProvider(), createWebSpeechProvider()];
    _providers = list.map(assertReadAloudProvider);
    return _providers;
  }

  function anySupported() {
    try { return providers().some((p) => p.isSupported()); } catch (_e) { return false; }
  }

  return {
    /** True only when enabled AND at least one provider is supported. Never throws. */
    isAvailable() {
      try { return enabled && anySupported(); } catch (_e) { return false; }
    },

    /**
     * Speak text. Tries pre-recorded clip first, then on-device speech. Returns true
     * if any provider produced audio. No-op (false) when disabled. Never throws.
     * @param {string} text
     * @param {{clipKey?:string, lang?:string}} [opts]
     * @returns {Promise<boolean>}
     */
    async speak(text, opts) {
      try {
        if (!enabled) return false;
        const o = opts && typeof opts === "object" ? opts : {};
        const req = {
          text: typeof text === "string" ? text : "",
          clipKey: o.clipKey || hashKey(text),
          lang: o.lang || "da-DK",
        };
        for (const p of providers()) {
          try {
            if (!p.isSupported()) continue;
            if (await p.speak(req)) return true;
          } catch (_e) { /* try next provider */ }
        }
        return false;
      } catch (_e) {
        return false;
      }
    },

    /** Stop any in-progress read-aloud. Never throws. */
    stop() {
      try { providers().forEach((p) => { try { p.stop(); } catch (_e) { /* ignore */ } }); }
      catch (_e) { /* ignore */ }
    },
  };
}
