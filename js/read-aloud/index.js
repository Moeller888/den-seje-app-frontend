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
  let _activeProvider = null;
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

  /** The single request shape every provider sees, for both canSpeak() and speak(). */
  function buildRequest(text, opts) {
    const o = opts && typeof opts === "object" ? opts : {};
    const segments = Array.isArray(o.segments)
      ? o.segments.filter((s) => s && typeof s.text === "string" && s.text.trim().length > 0 &&
          typeof s.lang === "string" && s.lang.length > 0)
      : [];
    const req = {
      text: typeof text === "string" ? text : "",
      clipKey: o.clipKey || hashKey(text),
      lang: o.lang || "da-DK",
      rate: o.rate,
      voiceURI: typeof o.voiceURI === "string" ? o.voiceURI : null,
      onBoundary: typeof o.onBoundary === "function" ? o.onBoundary : undefined,
      onState: typeof o.onState === "function" ? o.onState : undefined,
    };
    if (segments.length > 0) req.segments = segments;
    return req;
  }

  /** A provider without canSpeak() can voice any request it supports. Never throws. */
  function providerCanSpeak(p, req) {
    try {
      if (!p.isSupported()) return false;
      return typeof p.canSpeak === "function" ? p.canSpeak(req) === true : true;
    } catch (_e) {
      return false;
    }
  }

  function stopProviders() {
    try { providers().forEach((provider) => { try { provider.stop(); } catch (_e) { /* ignore */ } }); }
    catch (_e) { /* ignore */ }
    _activeProvider = null;
  }

  return {
    /** True only when enabled AND at least one provider is supported. Never throws. */
    isAvailable() {
      try { return enabled && anySupported(); } catch (_e) { return false; }
    },

    /**
     * Whether at least one provider can actually voice this text (same options as speak).
     * Callers render read-aloud controls only when this is true. Never throws.
     * @param {string} text
     * @param {{clipKey?:string, lang?:string, segments?:{text:string, lang:string}[]}} [opts]
     * @returns {boolean}
     */
    canSpeak(text, opts) {
      try {
        if (!enabled || typeof text !== "string" || text.trim().length === 0) return false;
        const req = buildRequest(text, opts);
        return providers().some((p) => providerCanSpeak(p, req));
      } catch (_e) {
        return false;
      }
    },

    /**
     * Speak text. Tries pre-recorded clip first, then on-device speech. Returns true
     * if any provider produced audio. No-op (false) when disabled. Never throws.
     * @param {string} text
     * @param {{clipKey?:string, lang?:string, segments?:{text:string, lang:string}[],
     *          rate?:number, voiceURI?:string,
     *          onBoundary?:(boundary:{charIndex:number,charLength:number})=>void,
     *          onState?:(state:"speaking"|"paused"|"ended"|"error")=>void}} [opts]
     *        `segments` — read the text as language runs, each with its own voice
     *        (English subject: Danish frame + English words). Invalid runs are dropped.
     * @returns {Promise<boolean>}
     */
    async speak(text, opts) {
      try {
        if (!enabled) return false;
        const req = buildRequest(text, opts);
        stopProviders();
        for (const p of providers()) {
          try {
            if (!providerCanSpeak(p, req)) continue;
            if (await p.speak(req)) {
              _activeProvider = p;
              return true;
            }
          } catch (_e) { /* try next provider */ }
        }
        return false;
      } catch (_e) {
        return false;
      }
    },

    /** Stop any in-progress read-aloud. Never throws. */
    stop() {
      stopProviders();
    },

    /** Pause the active provider where supported. */
    pause() {
      try {
        return !!(_activeProvider && typeof _activeProvider.pause === "function" && _activeProvider.pause());
      } catch (_e) {
        return false;
      }
    },

    /** Resume the active provider where supported. */
    resume() {
      try {
        return !!(_activeProvider && typeof _activeProvider.resume === "function" && _activeProvider.resume());
      } catch (_e) {
        return false;
      }
    },

    /** Device voices available for one language, best-quality first. */
    getVoices(lang = "da-DK") {
      try {
        for (const provider of providers()) {
          if (typeof provider.listVoices !== "function") continue;
          const voices = provider.listVoices(lang);
          if (Array.isArray(voices) && voices.length > 0) return voices;
        }
        return [];
      } catch (_e) {
        return [];
      }
    },
  };
}
