// ── Read-aloud provider contract (157O) ──────────────────────────────────────
// Strict, swappable interface for text-to-speech backends. The app depends only on
// this contract via the facade (index.js), never on a specific engine. The decided
// primary is a PRE-RECORDED (Piper) clip provider; an on-device Web Speech provider is
// the fail-soft fallback so read-aloud works before clips are produced.
//
// A provider's speak() returns true only if it actually produced audio, so the facade
// can fall through to the next provider when one cannot speak a given request.

/**
 * @typedef {Object} ReadAloudRequest
 * @property {string} text
 * @property {string|null} clipKey   // stable key for a pre-recorded clip
 * @property {string} lang           // e.g. "da-DK"
 * @property {{text:string, lang:string}[]} [segments]  // optional language runs; a provider
 *           that can switch voices reads these in order, else it reads `text`
 * @property {number} [rate]         // playback speed, clamped by the provider
 * @property {string|null} [voiceURI] // preferred device voice; ignored when unavailable
 * @property {(boundary:{charIndex:number,charLength:number}) => void} [onBoundary]
 * @property {(state:"speaking"|"paused"|"ended"|"error") => void} [onState]
 */

/**
 * @typedef {Object} ReadAloudProvider
 * @property {string} id
 * @property {() => boolean} isSupported
 * @property {(req: ReadAloudRequest) => boolean} [canSpeak]  // can it voice THIS request?
 *           Omitted = any request is speakable when supported. The UI only renders controls
 *           when at least one provider can speak the text, so a new provider (e.g. a paid
 *           cloud voice) plugs in by implementing this contract — no UI change.
 * @property {(req: ReadAloudRequest) => Promise<boolean>} speak  // true = produced audio
 * @property {() => void} stop
 * @property {() => boolean} [pause]
 * @property {() => boolean} [resume]
 * @property {(lang:string) => {name:string,voiceURI:string,lang:string}[]} [listVoices]
 */

/**
 * Validate a read-aloud provider. Throws on violation; returns the provider.
 * @param {any} p
 * @returns {ReadAloudProvider}
 */
export function assertReadAloudProvider(p) {
  if (!p || typeof p !== "object") throw new Error("read-aloud provider: missing");
  if (typeof p.id !== "string" || p.id.length === 0) throw new Error("read-aloud provider: invalid id");
  for (const m of ["isSupported", "speak", "stop"]) {
    if (typeof p[m] !== "function") throw new Error("read-aloud provider '" + p.id + "': missing " + m);
  }
  return p;
}
