// ── Read-aloud clip manifest (157O) ──────────────────────────────────────────
// Pre-generated Piper clips are a static, offline deliverable (the Piper TTS run is a
// content task, like the avatar art — not produced here). This manifest maps a stable
// clipKey → a served path under /assets/audio/readaloud/. It is EMPTY by default, so
// the pre-recorded provider reports "no clip" and the facade falls back to Web Speech.
//
// Convention: name each clip by hashKey(questionText) so the Piper pipeline and the
// frontend agree on keys with no per-question wiring. New version = new filename
// (immutable, long-cache) — never mutate a shipped clip.

const READALOUD_MANIFEST = {
  // "ra_1a2b3c4d": "/assets/audio/readaloud/ra_1a2b3c4d.mp3",
};

/**
 * Resolve a clip path for a key, or null when no clip exists.
 * @param {string|null|undefined} clipKey
 * @returns {string|null}
 */
export function clipPathFor(clipKey) {
  if (typeof clipKey !== "string" || clipKey.length === 0) return null;
  const p = READALOUD_MANIFEST[clipKey];
  return typeof p === "string" && p.length > 0 ? p : null;
}

/**
 * Stable clip key for a piece of text (djb2). The Piper pipeline names clips by the
 * same hash. Returns null on failure.
 * @param {string} text
 * @returns {string|null}
 */
export function hashKey(text) {
  try {
    const s = String(text);
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) | 0;
    return "ra_" + (h >>> 0).toString(16);
  } catch (_e) {
    return null;
  }
}
