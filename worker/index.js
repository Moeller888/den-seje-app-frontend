// ── lærlig.dk Worker (157P) ──────────────────────────────────────────────────
// Static assets are still served by the asset layer BEFORE this script runs (wrangler.jsonc
// "assets"); this script only sees requests no asset matched. It owns exactly two things:
//
//   GET|HEAD /tts/v<N>/<sha256>.mp3|.json   cached read-aloud clip + word timings, from R2
//   POST     /api/tts                       get-or-create one clip (auth + rate limit)
//
// Everything else is handed back to the asset layer, which answers with the 404 page.
// The Azure key lives only in this Worker's secrets (AZURE_SPEECH_KEY).

import { canonicalText, ttsKey, ttsObjectKeys, TTS_CACHE_VERSION, TTS_KEY_PATTERN } from "../js/read-aloud/tts-key.js";
import { authenticateTtsRequest, createSupabaseVerifier } from "./auth.js";
import { IMMUTABLE_CACHE, createClipService, validateTtsBody } from "./clip-service.js";
import { TtsError, synthesizeAzure } from "./azure-tts.js";

const MAX_BODY_BYTES = 16 * 1024;
const CLIP_PATH = new RegExp("^/tts/v" + TTS_CACHE_VERSION + "/([0-9a-f]{64})\\.(mp3|json)$");

const STATUS_BY_ERROR = {
  azure_not_configured: 503,
  azure_auth: 503,
  azure_timeout: 504,
};

function json(status, body, extra) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...(extra || {}) },
  });
}

let _verifier = null;
function verifierFor(env) {
  if (!_verifier) _verifier = createSupabaseVerifier({ supabaseUrl: env.SUPABASE_URL });
  return _verifier;
}

async function serveClip(request, env, key, kind) {
  const objectKey = kind === "mp3" ? ttsObjectKeys(key).audio : ttsObjectKeys(key).meta;
  const missing = () => new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  if (request.method === "HEAD") {
    const head = await env.TTS_BUCKET.head(objectKey);
    if (!head) return missing();
    const headers = new Headers();
    head.writeHttpMetadata(headers);
    headers.set("etag", head.httpEtag);
    headers.set("content-length", String(head.size));
    headers.set("accept-ranges", "bytes");
    headers.set("cache-control", IMMUTABLE_CACHE);
    return new Response(null, { status: 200, headers });
  }
  const wantsRange = kind === "mp3" && request.headers.has("range");
  const object = await env.TTS_BUCKET.get(objectKey, wantsRange ? { range: request.headers } : undefined);
  if (!object) return missing();
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", IMMUTABLE_CACHE);
  headers.set("x-content-type-options", "nosniff");
  // Safari plays <audio> only from servers that answer byte ranges with 206.
  const range = object.range;
  if (wantsRange && range && typeof range.offset === "number") {
    const length = typeof range.length === "number" ? range.length : object.size - range.offset;
    headers.set("content-range", "bytes " + range.offset + "-" + (range.offset + length - 1) + "/" + object.size);
    headers.set("content-length", String(length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set("content-length", String(object.size));
  return new Response(object.body, { status: 200, headers });
}

async function handleSynthesize(request, env) {
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== new URL(request.url).origin) return json(403, { error: "cross_origin" });
  if (!env.TTS_BUCKET || !env.TTS_CLIP || !env.TTS_USER_RATE_LIMIT || !env.TTS_GLOBAL_RATE_LIMIT) {
    return json(503, { error: "tts_not_configured" });
  }
  if (!/^application\/json\b/i.test(request.headers.get("content-type") || "")) return json(415, { error: "json_required" });
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return json(413, { error: "body_too_large" });

  const auth = await authenticateTtsRequest(request, env, verifierFor(env));
  if (!auth.ok) return json(401, { error: "unauthorized" });

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return json(413, { error: "body_too_large" });
  let body;
  try { body = JSON.parse(raw); } catch (_e) { return json(400, { error: "invalid_json" }); }
  const checked = validateTtsBody(body);
  if (!checked.ok) return json(400, { error: checked.error });
  const canonical = checked.value;
  const key = await ttsKey(canonical);

  // Cache hit: no rate limit, no Durable Object, no Azure.
  const existing = await env.TTS_BUCKET.get(ttsObjectKeys(key).meta);
  if (existing) return json(200, JSON.parse(await existing.text()));

  if (auth.kind === "user") {
    const user = await env.TTS_USER_RATE_LIMIT.limit({ key: "user:" + auth.subject });
    if (!user.success) return json(429, { error: "rate_limited" }, { "retry-after": "60" });
    const global = await env.TTS_GLOBAL_RATE_LIMIT.limit({ key: "global" });
    if (!global.success) return json(429, { error: "rate_limited" }, { "retry-after": "60" });
  }

  // One Durable Object per clip key: concurrent misses for the same text meet in one place.
  const stub = env.TTS_CLIP.get(env.TTS_CLIP.idFromName(key));
  const response = await stub.fetch("https://tts-clip.internal/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, canonical }),
  });
  const payload = await response.json();
  return json(response.status, payload);
}

export class TtsClipCoordinator {
  constructor(state, env) {
    this.env = env;
    this.service = createClipService({
      bucket: env.TTS_BUCKET,
      synthesize: (canonical) => synthesizeAzure(canonical, {
        key: env.AZURE_SPEECH_KEY,
        region: env.AZURE_SPEECH_REGION,
        timeoutMs: 20000,
      }),
    });
  }

  async fetch(request) {
    try {
      const { key, canonical } = await request.json();
      if (typeof key !== "string" || !TTS_KEY_PATTERN.test(key) || (await ttsKey(canonical)) !== key) {
        return json(400, { error: "invalid_request" });
      }
      const { meta, created } = await this.service.getOrCreate(canonical, key);
      if (created) {
        // Key-free audit line: clip id and size only, never the text or a user.
        console.log(JSON.stringify({ event: "tts_clip_created", key, chars: canonicalText(canonical).length, bytes: meta.bytes }));
      }
      return json(200, meta);
    } catch (error) {
      const code = error instanceof TtsError ? error.code : "tts_failed";
      console.log(JSON.stringify({ event: "tts_clip_failed", code }));
      return json(STATUS_BY_ERROR[code] || 502, { error: code });
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      const clip = CLIP_PATH.exec(url.pathname);
      if (clip) {
        if (request.method !== "GET" && request.method !== "HEAD") return json(405, { error: "method_not_allowed" }, { allow: "GET, HEAD" });
        if (!env.TTS_BUCKET) return json(503, { error: "tts_not_configured" });
        return await serveClip(request, env, clip[1], clip[2]);
      }
      if (url.pathname === "/api/tts") {
        if (request.method !== "POST") return json(405, { error: "method_not_allowed" }, { allow: "POST" });
        return await handleSynthesize(request, env);
      }
    } catch (_e) {
      console.log(JSON.stringify({ event: "tts_request_failed" }));
      return json(500, { error: "tts_failed" });
    }
    return env.ASSETS.fetch(request);
  },
};
