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
 */

/**
 * @typedef {Object} ReadAloudProvider
 * @property {string} id
 * @property {() => boolean} isSupported
 * @property {(req: ReadAloudRequest) => Promise<boolean>} speak  // true = produced audio
 * @property {() => void} stop
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
