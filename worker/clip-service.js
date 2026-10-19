// ── Read-aloud clip cache (157P) ─────────────────────────────────────────────
// Get-or-create for one clip in R2. Runs inside the per-clip Durable Object, so every
// request for the same key — from any browser, anywhere — lands in ONE instance, and the
// in-flight map below collapses concurrent misses into a single Azure call.
//
// Write order is audio first, metadata last: the metadata object is the commit marker.
// A crash between the two leaves an orphan MP3 that the next request simply overwrites
// with identical bytes; a reader never sees metadata pointing at missing audio.

import { canonicalTtsRequest, canonicalText, ttsClipPaths, ttsObjectKeys } from "../js/read-aloud/tts-key.js";

export const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

/**
 * Validate a POST /api/tts body. Only text and language runs are accepted; any other field
 * is rejected so nothing but question/answer text can reach the synthesiser.
 * @returns {{ok:true, value:object} | {ok:false, error:string}}
 */
export function validateTtsBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "invalid_body" };
  for (const field of Object.keys(body)) {
    if (field !== "text" && field !== "segments") return { ok: false, error: "unexpected_field" };
  }
  if (body.segments !== undefined && !Array.isArray(body.segments)) return { ok: false, error: "invalid_segment" };
  if (Array.isArray(body.segments)) {
    for (const segment of body.segments) {
      if (!segment || typeof segment !== "object" || Array.isArray(segment)) return { ok: false, error: "invalid_segment" };
      for (const field of Object.keys(segment)) {
        if (field !== "text" && field !== "lang") return { ok: false, error: "unexpected_field" };
      }
    }
  }
  if (body.text !== undefined && typeof body.text !== "string") return { ok: false, error: "invalid_text" };
  return canonicalTtsRequest(body.text, body.segments);
}

/** The public metadata object stored next to the MP3. */
export function buildClipMeta(key, canonical, result, createdAt) {
  const words = Array.isArray(result.words) ? result.words : [];
  const last = words.length > 0 ? words[words.length - 1] : null;
  return {
    v: canonical.v,
    key,
    audio: ttsClipPaths(key).audio,
    format: canonical.format,
    segments: canonical.segments.map((run) => ({ lang: run.lang, voice: run.voice, text: run.text })),
    text: canonicalText(canonical),
    words,
    approxDurationMs: last ? last.t + last.d : 0,
    bytes: result.audio.length,
    createdAt,
  };
}

/**
 * @param {{bucket:{get:Function, put:Function},
 *          synthesize:(canonical:object) => Promise<{audio:Uint8Array, words:object[]}>,
 *          now?:() => string}} deps
 */
export function createClipService(deps) {
  const bucket = deps.bucket;
  const synthesize = deps.synthesize;
  const now = typeof deps.now === "function" ? deps.now : () => new Date().toISOString();
  const inflight = new Map();

  async function readMeta(key) {
    const object = await bucket.get(ttsObjectKeys(key).meta);
    if (!object) return null;
    return JSON.parse(await object.text());
  }

  async function create(canonical, key) {
    const again = await readMeta(key);
    if (again) return { meta: again, created: false };
    const result = await synthesize(canonical);
    const meta = buildClipMeta(key, canonical, result, now());
    const objects = ttsObjectKeys(key);
    await bucket.put(objects.audio, result.audio, {
      httpMetadata: { contentType: "audio/mpeg", cacheControl: IMMUTABLE_CACHE },
    });
    await bucket.put(objects.meta, JSON.stringify(meta), {
      httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: IMMUTABLE_CACHE },
    });
    return { meta, created: true };
  }

  return {
    readMeta,

    /** Cached metadata, or synthesise exactly once per key. Errors propagate (nothing stored). */
    async getOrCreate(canonical, key) {
      const cached = await readMeta(key);
      if (cached) return { meta: cached, created: false };
      const running = inflight.get(key);
      // Waiters share the one synthesis but did not cause it: only the starter reports `created`.
      if (running) return running.then((result) => ({ meta: result.meta, created: false }));
      const job = create(canonical, key).finally(() => { inflight.delete(key); });
      inflight.set(key, job);
      return job;
    },
  };
}
