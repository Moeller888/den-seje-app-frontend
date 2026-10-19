// 157P — cached Azure Neural read-aloud: clip identity, Worker cache, auth, protocol and the
// browser provider. Azure, R2 and the browser are replaced by in-memory doubles here; the
// real-audio check lives in the browser test run against `wrangler dev`.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalTtsRequest, normalizeTtsText, ttsKey, ttsClipPaths, TTS_VOICES, TTS_LIMITS, TTS_CACHE_VERSION,
} from "../../js/read-aloud/tts-key.js";
import { createClipService, validateTtsBody } from "../../worker/clip-service.js";
import {
  TtsError, buildSsml, synthesizeAzure, parseBinaryFrame, wordBoundariesFrom,
} from "../../worker/azure-tts.js";
import { authenticateTtsRequest, createSupabaseVerifier, safeEqual } from "../../worker/auth.js";
import worker, { TtsClipCoordinator } from "../../worker/index.js";
import { alignWords, wordIndexAt, wallClockMs, createAzureProvider } from "../../js/read-aloud/provider-azure.js";

afterEach(() => {
  delete globalThis.Audio;
});

// ── Doubles ──────────────────────────────────────────────────────────────────

function fakeBucket() {
  const objects = new Map();
  const log = [];
  function wrap(key, entry, range) {
    const bytes = entry.bytes;
    let offset = 0;
    let length = bytes.length;
    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range.get("range") || "");
      if (match) {
        offset = Number(match[1]);
        length = (match[2] ? Number(match[2]) + 1 : bytes.length) - offset;
      }
    }
    const slice = bytes.subarray(offset, offset + length);
    return {
      key,
      size: bytes.length,
      httpEtag: '"' + key.length + '"',
      range: range ? { offset, length } : undefined,
      body: slice,
      writeHttpMetadata(headers) {
        if (entry.options && entry.options.httpMetadata) {
          headers.set("content-type", entry.options.httpMetadata.contentType);
        }
      },
      async text() { return new TextDecoder().decode(slice); },
    };
  }
  return {
    objects,
    log,
    async get(key, options) {
      log.push(["get", key]);
      const entry = objects.get(key);
      return entry ? wrap(key, entry, options && options.range) : null;
    },
    async head(key) {
      const entry = objects.get(key);
      return entry ? wrap(key, entry) : null;
    },
    async put(key, value, options) {
      log.push(["put", key]);
      const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
      objects.set(key, { bytes, options });
    },
  };
}

function fakeSynth(result) {
  const calls = [];
  const synthesize = async (canonical) => {
    calls.push(canonical);
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (result instanceof Error) throw result;
    return result || { audio: new Uint8Array([0xff, 0xfb, 1, 2, 3]), words: [{ w: "Hej", t: 50, d: 300 }] };
  };
  return { calls, synthesize };
}

async function canonicalOf(text, segments) {
  const checked = canonicalTtsRequest(text, segments);
  assert.equal(checked.ok, true, JSON.stringify(checked));
  return { canonical: checked.value, key: await ttsKey(checked.value) };
}

// ── Clip identity (shared by browser, Worker and generator) ──────────────────

test("clip identity: text is normalised, same-language runs merge, voices are fixed", async () => {
  assert.equal(normalizeTtsText("  Hvad  betyder\n'sun'?  "), "Hvad betyder 'sun'?");
  const a = canonicalTtsRequest("Hvad betyder 'sun'?", [
    { text: "Hvad", lang: "da-DK" }, { text: " betyder ", lang: "da-DK" }, { text: "'sun'?", lang: "en-GB" },
  ]);
  assert.equal(a.ok, true);
  assert.deepEqual(a.value.segments, [
    { lang: "da-DK", voice: "da-DK-ChristelNeural", text: "Hvad betyder" },
    { lang: "en-GB", voice: "en-GB-SoniaNeural", text: "'sun'?" },
  ]);
  assert.equal(a.value.v, TTS_CACHE_VERSION);
  assert.equal(TTS_VOICES["da-DK"], "da-DK-ChristelNeural");
});

test("clip identity: equal requests share one key; text, language and version change it", async () => {
  const one = await canonicalOf("Hvad er  hovedstaden?");
  const two = await canonicalOf(" Hvad er hovedstaden? ");
  assert.equal(one.key, two.key);
  assert.match(one.key, /^[0-9a-f]{64}$/);
  assert.equal(ttsClipPaths(one.key).audio, "/tts/v" + TTS_CACHE_VERSION + "/" + one.key + ".mp3");
  const other = await canonicalOf("Hvad er hovedstaden");
  assert.notEqual(one.key, other.key);
  const english = await canonicalOf("sun", [{ text: "sun", lang: "en-GB" }]);
  const danish = await canonicalOf("sun", [{ text: "sun", lang: "da-DK" }]);
  assert.notEqual(english.key, danish.key);
  const bumped = await ttsKey({ ...one.canonical, v: one.canonical.v + 1 });
  assert.notEqual(bumped, one.key);
  const otherVoice = await ttsKey({ ...one.canonical, segments: [{ ...one.canonical.segments[0], voice: "da-DK-JeppeNeural" }] });
  assert.notEqual(otherVoice, one.key);
});

test("clip identity: invalid input is rejected with a stable reason", () => {
  assert.equal(canonicalTtsRequest("   ").error, "empty_text");
  assert.equal(canonicalTtsRequest("x".repeat(TTS_LIMITS.maxChars + 1)).error, "text_too_long");
  assert.equal(canonicalTtsRequest("Hej\u0007").error, "invalid_text");
  assert.equal(canonicalTtsRequest("Hej", [{ text: "Hej", lang: "de-DE" }]).error, "unsupported_language");
  assert.equal(canonicalTtsRequest("Hej", [{ text: 5, lang: "da-DK" }]).error, "invalid_text");
  assert.equal(canonicalTtsRequest("a", Array.from({ length: 25 }, () => ({ text: "a", lang: "da-DK" }))).error, "too_many_segments");
  assert.equal(canonicalTtsRequest(undefined).error, "missing_text");
});

// ── Worker: request validation ───────────────────────────────────────────────

test("worker validation: only text and language runs are accepted", () => {
  assert.equal(validateTtsBody({ text: "Hej" }).ok, true);
  assert.equal(validateTtsBody({ segments: [{ text: "Hej", lang: "da-DK" }] }).ok, true);
  assert.equal(validateTtsBody(null).error, "invalid_body");
  assert.equal(validateTtsBody([]).error, "invalid_body");
  assert.equal(validateTtsBody({ text: "Hej", student: "Anna" }).error, "unexpected_field");
  assert.equal(validateTtsBody({ segments: [{ text: "Hej", lang: "da-DK", voice: "x" }] }).error, "unexpected_field");
  assert.equal(validateTtsBody({ segments: "Hej" }).error, "invalid_segment");
  assert.equal(validateTtsBody({ text: 42 }).error, "invalid_text");
  assert.equal(validateTtsBody({ text: "" }).error, "empty_text");
});

// ── Worker: clip cache ───────────────────────────────────────────────────────

test("clip cache: miss synthesises once, stores audio before metadata", async () => {
  const bucket = fakeBucket();
  const azure = fakeSynth();
  const service = createClipService({ bucket, synthesize: azure.synthesize, now: () => "2026-10-19T00:00:00.000Z" });
  const { canonical, key } = await canonicalOf("Hej");
  const { meta, created } = await service.getOrCreate(canonical, key);
  assert.equal(created, true);
  assert.equal(azure.calls.length, 1);
  assert.equal(meta.audio, ttsClipPaths(key).audio);
  assert.deepEqual(meta.words, [{ w: "Hej", t: 50, d: 300 }]);
  assert.equal(meta.segments[0].voice, "da-DK-ChristelNeural");
  const puts = bucket.log.filter(([op]) => op === "put").map(([, name]) => name);
  assert.deepEqual(puts, [ttsClipPaths(key).audio.slice(1), ttsClipPaths(key).meta.slice(1)]);
  assert.equal(bucket.objects.get(puts[0]).options.httpMetadata.contentType, "audio/mpeg");
});

test("clip cache: hit never calls Azure", async () => {
  const bucket = fakeBucket();
  const azure = fakeSynth();
  const service = createClipService({ bucket, synthesize: azure.synthesize });
  const { canonical, key } = await canonicalOf("Hej");
  await service.getOrCreate(canonical, key);
  const again = await service.getOrCreate(canonical, key);
  assert.equal(again.created, false);
  assert.equal(azure.calls.length, 1);
});

test("clip cache: concurrent requests for one text are synthesised and paid for once", async () => {
  const bucket = fakeBucket();
  const azure = fakeSynth();
  const service = createClipService({ bucket, synthesize: azure.synthesize });
  const { canonical, key } = await canonicalOf("Hvad er hovedstaden?");
  const results = await Promise.all(Array.from({ length: 12 }, () => service.getOrCreate(canonical, key)));
  assert.equal(azure.calls.length, 1);
  assert.ok(results.every((r) => r.meta.key === key));
  // Only the request that actually synthesised reports `created` (it drives the cost/audit log line).
  assert.equal(results.filter((r) => r.created).length, 1);
  assert.equal(bucket.log.filter(([op]) => op === "put").length, 2);
});

test("clip cache: an Azure error stores nothing and the next request retries", async () => {
  const bucket = fakeBucket();
  let fail = true;
  let calls = 0;
  const service = createClipService({
    bucket,
    synthesize: async () => {
      calls += 1;
      if (fail) throw new TtsError("azure_timeout");
      return { audio: new Uint8Array([1, 2]), words: [] };
    },
  });
  const { canonical, key } = await canonicalOf("Hej");
  await assert.rejects(service.getOrCreate(canonical, key), (error) => error.code === "azure_timeout");
  assert.equal(bucket.objects.size, 0);
  fail = false;
  const { created } = await service.getOrCreate(canonical, key);
  assert.equal(created, true);
  assert.equal(calls, 2);
});

// ── Worker: Azure WebSocket protocol ─────────────────────────────────────────

function binaryAudioFrame(bytes) {
  const header = new TextEncoder().encode("X-RequestId:1\r\nContent-Type:audio/mpeg\r\nPath:audio\r\n");
  const frame = new Uint8Array(2 + header.length + bytes.length);
  frame[0] = header.length >> 8;
  frame[1] = header.length & 0xff;
  frame.set(header, 2);
  frame.set(bytes, 2 + header.length);
  return frame.buffer;
}

function fakeAzureSocket(script) {
  const listeners = {};
  const sent = [];
  const socket = {
    sent,
    closed: false,
    addEventListener(name, fn) { listeners[name] = fn; },
    send(message) {
      sent.push(message);
      if (String(message).includes("Path: ssml")) setTimeout(() => script(listeners), 0);
    },
    close() { socket.closed = true; },
  };
  return socket;
}

test("azure protocol: audio chunks and word boundaries are collected until turn.end", async () => {
  let connectedTo = null;
  let headers = null;
  const socket = fakeAzureSocket((on) => {
    on.message({ data: "X-RequestId:1\r\nPath:turn.start\r\n\r\n{}" });
    on.message({ data: "X-RequestId:1\r\nPath:audio.metadata\r\n\r\n" + JSON.stringify({ Metadata: [
      { Type: "WordBoundary", Data: { Offset: 1000000, Duration: 2500000, text: { Text: "Hvad", Length: 4, BoundaryType: "WordBoundary" } } },
      { Type: "WordBoundary", Data: { Offset: 4000000, Duration: 1000000, text: { Text: "?", Length: 1, BoundaryType: "PunctuationBoundary" } } },
    ] }) });
    on.message({ data: binaryAudioFrame(new Uint8Array([1, 2, 3])) });
    on.message({ data: binaryAudioFrame(new Uint8Array([4, 5])) });
    on.message({ data: "X-RequestId:1\r\nPath:turn.end\r\n\r\n" });
  });
  const { canonical } = await canonicalOf("Hvad <er> 'sun'?", [
    { text: "Hvad <er>", lang: "da-DK" }, { text: "'sun'?", lang: "en-GB" },
  ]);
  const result = await synthesizeAzure(canonical, {
    key: "test-key", region: "northeurope",
    connect: async (url, h) => { connectedTo = url; headers = h; return socket; },
  });
  assert.deepEqual(Array.from(result.audio), [1, 2, 3, 4, 5]);
  assert.deepEqual(result.words, [{ w: "Hvad", t: 100, d: 250 }]);
  assert.match(connectedTo, /^https:\/\/northeurope\.tts\.speech\.microsoft\.com\/cognitiveservices\/websocket\/v1\?X-ConnectionId=[0-9a-f]{32}$/);
  assert.equal(headers["Ocp-Apim-Subscription-Key"], "test-key");
  assert.ok(!connectedTo.includes("test-key"), "the key never goes into a URL");
  const ssml = socket.sent.find((m) => m.includes("Path: ssml"));
  assert.ok(ssml.includes('<voice name="da-DK-ChristelNeural">Hvad &lt;er&gt;</voice><voice name="en-GB-SoniaNeural">&apos;sun&apos;?</voice>'));
  assert.ok(socket.sent.some((m) => m.includes('"wordBoundaryEnabled":true')));
  assert.equal(socket.closed, true);
});

test("azure protocol: timeout, early close and missing config fail with key-free codes", async () => {
  const { canonical } = await canonicalOf("Hej");
  const silent = fakeAzureSocket(() => {});
  await assert.rejects(
    synthesizeAzure(canonical, { key: "k", region: "northeurope", timeoutMs: 20, connect: async () => silent }),
    (error) => error instanceof TtsError && error.code === "azure_timeout" && !error.message.includes("k ") ,
  );
  const closing = fakeAzureSocket((on) => on.close({ code: 1007 }));
  await assert.rejects(
    synthesizeAzure(canonical, { key: "k", region: "northeurope", connect: async () => closing }),
    (error) => error.code === "azure_rejected",
  );
  const empty = fakeAzureSocket((on) => on.message({ data: "Path:turn.end\r\n\r\n" }));
  await assert.rejects(
    synthesizeAzure(canonical, { key: "k", region: "northeurope", connect: async () => empty }),
    (error) => error.code === "azure_empty_audio",
  );
  await assert.rejects(synthesizeAzure(canonical, { key: "", region: "northeurope" }), (e) => e.code === "azure_not_configured");
  await assert.rejects(synthesizeAzure(canonical, { key: "k", region: "evil.example/x" }), (e) => e.code === "azure_not_configured");
});

test("azure protocol: frame helpers", () => {
  const parsed = parseBinaryFrame(binaryAudioFrame(new Uint8Array([9])));
  assert.equal(parsed.headers.path, "audio");
  assert.deepEqual(Array.from(parsed.audio), [9]);
  assert.deepEqual(wordBoundariesFrom("not json"), []);
  assert.ok(buildSsml({ segments: [{ voice: "da-DK-ChristelNeural", text: "a & b" }] }).includes("a &amp; b"));
});

// ── Worker: authentication ───────────────────────────────────────────────────

const SUPABASE_URL = "https://example.supabase.co";

function b64url(bytes) {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signingKit() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const jwks = { keys: [{ ...jwk, kid: "kid-1", alg: "ES256", use: "sig" }] };
  let jwksFetches = 0;
  const fetchImpl = async (url) => {
    jwksFetches += 1;
    assert.equal(url, SUPABASE_URL + "/auth/v1/.well-known/jwks.json");
    return new Response(JSON.stringify(jwks), { status: 200 });
  };
  async function sign(claims, header = { alg: "ES256", kid: "kid-1", typ: "JWT" }) {
    const head = b64url(new TextEncoder().encode(JSON.stringify(header)));
    const body = b64url(new TextEncoder().encode(JSON.stringify(claims)));
    const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, new TextEncoder().encode(head + "." + body));
    return head + "." + body + "." + b64url(new Uint8Array(signature));
  }
  const claims = (extra) => ({
    sub: "user-1", role: "authenticated", aud: "authenticated",
    iss: SUPABASE_URL + "/auth/v1", exp: Math.floor(Date.now() / 1000) + 600, ...extra,
  });
  return { fetchImpl, sign, claims, fetches: () => jwksFetches };
}

test("auth: a valid Supabase token passes; expired, foreign or tampered tokens do not", async () => {
  const kit = await signingKit();
  const verify = createSupabaseVerifier({ supabaseUrl: SUPABASE_URL, fetchImpl: kit.fetchImpl });
  assert.deepEqual(await verify(await kit.sign(kit.claims())), { ok: true, sub: "user-1" });
  assert.equal((await verify(await kit.sign(kit.claims({ exp: 1 })))).error, "expired_token");
  assert.equal((await verify(await kit.sign(kit.claims({ iss: "https://evil.example/auth/v1" })))).error, "wrong_issuer");
  assert.equal((await verify(await kit.sign(kit.claims({ role: "anon" })))).error, "not_authenticated");
  const token = await kit.sign(kit.claims());
  const tampered = token.split(".");
  tampered[1] = b64url(new TextEncoder().encode(JSON.stringify(kit.claims({ sub: "someone-else" }))));
  assert.equal((await verify(tampered.join("."))).error, "bad_signature");
  assert.equal((await verify(await kit.sign(kit.claims(), { alg: "HS256", kid: "kid-1" }))).error, "unsupported_token");
  assert.equal((await verify("abc")).error, "malformed_token");
  assert.equal(kit.fetches(), 1, "the JWKS is cached");
});

test("auth: admin token must match the secret exactly; bearer token is required otherwise", async () => {
  const secret = "s".repeat(40);
  const env = { TTS_ADMIN_TOKEN: secret };
  const neverVerify = async () => { throw new Error("should not verify"); };
  const req = (headers) => new Request("https://x.test/api/tts", { method: "POST", headers });
  assert.equal((await authenticateTtsRequest(req({ "x-tts-admin-token": secret }), env, neverVerify)).kind, "admin");
  assert.equal((await authenticateTtsRequest(req({ "x-tts-admin-token": secret + "x" }), env, neverVerify)).ok, false);
  assert.equal((await authenticateTtsRequest(req({ "x-tts-admin-token": "short" }), { TTS_ADMIN_TOKEN: "short" }, neverVerify)).ok, false);
  assert.equal((await authenticateTtsRequest(req({}), env, neverVerify)).error, "missing_token");
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
});

// ── Worker: HTTP surface ─────────────────────────────────────────────────────

function fakeEnv(overrides) {
  const bucket = fakeBucket();
  const azure = fakeSynth();
  const limits = { user: true, global: true, calls: [] };
  const coordinators = new Map();
  const env = {
    SUPABASE_URL,
    TTS_ADMIN_TOKEN: "a".repeat(40),
    TTS_BUCKET: bucket,
    ASSETS: { fetch: async () => new Response("asset 404", { status: 404 }) },
    TTS_USER_RATE_LIMIT: { limit: async ({ key }) => { limits.calls.push(key); return { success: limits.user }; } },
    TTS_GLOBAL_RATE_LIMIT: { limit: async ({ key }) => { limits.calls.push(key); return { success: limits.global }; } },
    TTS_CLIP: {
      idFromName: (name) => name,
      get(id) {
        if (!coordinators.has(id)) {
          const instance = new TtsClipCoordinator({}, env);
          instance.service = createClipService({ bucket, synthesize: azure.synthesize });
          coordinators.set(id, instance);
        }
        const instance = coordinators.get(id);
        return { fetch: (url, init) => instance.fetch(new Request(url, init)) };
      },
    },
    ...(overrides || {}),
  };
  return { env, bucket, azure, limits };
}

function post(body, headers) {
  const all = { "content-type": "application/json", "x-tts-admin-token": "a".repeat(40), ...(headers || {}) };
  for (const name of Object.keys(all)) if (all[name] === null) delete all[name];
  return new Request("https://lærlig.test/api/tts", {
    method: "POST",
    headers: all,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("worker http: miss creates the clip, then GET serves the same immutable file", async () => {
  const { env, azure } = fakeEnv();
  const created = await worker.fetch(post({ text: "Hej" }), env);
  assert.equal(created.status, 200);
  const meta = await created.json();
  assert.equal(azure.calls.length, 1);
  const audio = await worker.fetch(new Request("https://lærlig.test" + meta.audio), env);
  assert.equal(audio.status, 200);
  assert.equal(audio.headers.get("content-type"), "audio/mpeg");
  assert.equal(audio.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(audio.headers.get("accept-ranges"), "bytes");
  const ranged = await worker.fetch(new Request("https://lærlig.test" + meta.audio, { headers: { range: "bytes=0-1" } }), env);
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers.get("content-range"), "bytes 0-1/5");
  const json = await worker.fetch(new Request("https://lærlig.test" + meta.audio.replace(/\.mp3$/, ".json")), env);
  assert.equal((await json.json()).key, meta.key);
  // A second POST is a cache hit: no Azure, no rate limit.
  const again = await worker.fetch(post({ text: "Hej" }), env);
  assert.equal(again.status, 200);
  assert.equal(azure.calls.length, 1);
});

test("worker http: unknown clips are 404 and never cached; other paths go to the assets", async () => {
  const { env } = fakeEnv();
  const missing = await worker.fetch(new Request("https://lærlig.test/tts/v" + TTS_CACHE_VERSION + "/" + "0".repeat(64) + ".mp3"), env);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("cache-control"), "no-store");
  const other = await worker.fetch(new Request("https://lærlig.test/tts/v1/../../.env"), env);
  assert.equal(await other.text(), "asset 404");
  const put = await worker.fetch(new Request("https://lærlig.test/tts/v" + TTS_CACHE_VERSION + "/" + "0".repeat(64) + ".mp3", { method: "PUT" }), env);
  assert.equal(put.status, 405);
});

test("worker http: auth, input validation, origin and rate limits guard every miss", async () => {
  const { env, azure, limits } = fakeEnv();
  assert.equal((await worker.fetch(post({ text: "Hej" }, { "x-tts-admin-token": "wrong" }), env)).status, 401);
  const noAuth = new Request("https://lærlig.test/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal((await worker.fetch(noAuth, env)).status, 401);
  assert.equal((await worker.fetch(post("{not json"), env)).status, 400);
  const tooLong = await worker.fetch(post({ text: "x".repeat(TTS_LIMITS.maxChars + 1) }), env);
  assert.equal(tooLong.status, 400);
  assert.equal((await tooLong.json()).error, "text_too_long");
  assert.equal((await worker.fetch(post({ text: "Hej", name: "Anna" }), env)).status, 400);
  assert.equal((await worker.fetch(post({ text: "x".repeat(20000) }), env)).status, 413);
  assert.equal((await worker.fetch(post({ text: "Hej" }, { origin: "https://evil.example" }), env)).status, 403);
  assert.equal((await worker.fetch(new Request("https://lærlig.test/api/tts"), env)).status, 405);
  assert.equal(azure.calls.length, 0);
  assert.deepEqual(limits.calls, [], "admin (generator) requests are not rate limited");

  // A signed-in pupil is rate limited on misses.
  const kit = await signingKit();
  const realFetch = globalThis.fetch;
  globalThis.fetch = kit.fetchImpl;
  try {
    const userEnv = fakeEnv({ SUPABASE_URL });
    userEnv.limits.user = false;
    const token = await kit.sign(kit.claims());
    const limited = await worker.fetch(post({ text: "Hej" }, { "x-tts-admin-token": null, authorization: "Bearer " + token }), userEnv.env);
    assert.equal(limited.status, 429);
    assert.deepEqual(userEnv.limits.calls, ["user:user-1"]);
    assert.equal(userEnv.azure.calls.length, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("worker http: an Azure failure is a calm 5xx with a key-free code; nothing is cached", async () => {
  const { env, bucket } = fakeEnv();
  const failing = new TtsClipCoordinator({}, env);
  failing.service = createClipService({ bucket, synthesize: async () => { throw new TtsError("azure_timeout"); } });
  env.TTS_CLIP = { idFromName: (n) => n, get: () => ({ fetch: (url, init) => failing.fetch(new Request(url, init)) }) };
  const response = await worker.fetch(post({ text: "Hej" }), env);
  assert.equal(response.status, 504);
  assert.deepEqual(await response.json(), { error: "azure_timeout" });
  assert.equal(bucket.objects.size, 0);
});

test("worker http: missing bindings answer 503 instead of failing open", async () => {
  const { env } = fakeEnv({ TTS_USER_RATE_LIMIT: undefined });
  assert.equal((await worker.fetch(post({ text: "Hej" }), env)).status, 503);
});

// ── Browser provider ─────────────────────────────────────────────────────────

test("timing: words align to the shown text and follow the media clock at every speed", () => {
  const text = "Hvad betyder 'sun' — og hvad betyder 'moon'?";
  const timeline = alignWords(text, [
    { w: "Hvad", t: 0, d: 200 }, { w: "betyder", t: 250, d: 300 }, { w: "sun", t: 600, d: 300 },
    { w: "og", t: 1000, d: 100 }, { w: "hvad", t: 1150, d: 150 }, { w: "betyder", t: 1350, d: 300 },
    { w: "moon", t: 1700, d: 300 }, { w: "ukendt", t: 1900, d: 100 },
  ]);
  assert.deepEqual(timeline.map((w) => text.slice(w.charIndex, w.charIndex + w.charLength)),
    ["Hvad", "betyder", "sun", "og", "hvad", "betyder", "moon"]);
  assert.equal(timeline[5].charIndex, text.lastIndexOf("betyder"), "a repeated word lands on its own occurrence");
  assert.equal(wordIndexAt(timeline, -1), -1);
  assert.equal(wordIndexAt(timeline, 260), 1);
  // At 1.5× the audio element's currentTime advances 1.5 media-ms per wall-ms: after 400 ms
  // of wall time the clock reads 600 ms and "sun" is highlighted; at 0.75× it is still "betyder".
  assert.equal(wordIndexAt(timeline, 400 * 1.5), 2);
  assert.equal(wordIndexAt(timeline, 400 * 0.75), 1);
  assert.equal(wallClockMs(600, 1.5), 400);
  assert.equal(wallClockMs(600, 0.75), 800);
});

function installAudio() {
  const created = [];
  globalThis.Audio = function (src) {
    this.src = src;
    this.paused = true;
    this.currentTime = 0;
    this.listeners = {};
    this.addEventListener = (name, fn) => { (this.listeners[name] ||= []).push(fn); };
    this.emit = (name) => { for (const fn of this.listeners[name] || []) fn(); };
    this.removeAttribute = () => {};
    this.pause = () => { this.paused = true; };
    this.play = () => { this.paused = false; this.emit("playing"); return Promise.resolve(); };
    created.push(this);
  };
  return created;
}

function clipServer({ cached = true, synthStatus = 200, hang = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (hang) {
      return new Promise((_, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    }
    const key = String(url).match(/([0-9a-f]{64})/);
    if (String(url).endsWith(".json")) {
      if (!cached) return new Response("nf", { status: 404 });
      return new Response(JSON.stringify({ key: key[1], audio: ttsClipPaths(key[1]).audio, words: [
        { w: "Hvad", t: 0, d: 200 }, { w: "er", t: 300, d: 100 },
      ] }), { status: 200 });
    }
    if (url === "/api/tts") {
      if (synthStatus !== 200) return new Response(JSON.stringify({ error: "azure_timeout" }), { status: synthStatus });
      const body = JSON.parse(init.body);
      const checked = canonicalTtsRequest(undefined, body.segments);
      const k = await ttsKey(checked.value);
      return new Response(JSON.stringify({ key: k, audio: ttsClipPaths(k).audio, words: [] }), { status: 200 });
    }
    return new Response("?", { status: 500 });
  };
  return { calls, fetchImpl };
}

test("provider: a cached clip plays from its public URL; highlight follows currentTime", async () => {
  const audio = installAudio();
  const server = clipServer();
  const provider = createAzureProvider({ fetchImpl: server.fetchImpl, getAccessToken: async () => "tok" });
  const states = [];
  const boundaries = [];
  const req = { text: "Hvad er det?", rate: 1.5, onState: (s) => states.push(s), onBoundary: (b) => boundaries.push(b) };
  assert.equal(provider.canSpeak(req), true);
  assert.equal(await provider.speak(req), true);
  const { key } = await canonicalOf("Hvad er det?");
  assert.equal(audio[0].src, ttsClipPaths(key).audio);
  assert.equal(audio[0].playbackRate, 1.5);
  assert.equal(server.calls.length, 1, "a hit never POSTs");
  audio[0].currentTime = 0.35;
  audio[0].emit("timeupdate");
  assert.deepEqual(boundaries, [{ charIndex: 0, charLength: 4 }, { charIndex: 5, charLength: 2 }]);

  assert.equal(provider.pause(), true);
  assert.equal(provider.resume(), true);
  audio[0].emit("ended");
  assert.deepEqual(states, ["speaking", "paused", "speaking", "ended"]);
  provider.stop();

  // Same text again ("Forfra"): same URL, metadata from memory, no second request.
  assert.equal(await provider.speak({ text: "Hvad er det?" }), true);
  assert.equal(audio[1].src, audio[0].src);
  assert.equal(server.calls.length, 1);
  provider.stop();
});

test("provider: a miss asks the Worker once, with only the text runs and the user's token", async () => {
  installAudio();
  const server = clipServer({ cached: false });
  const provider = createAzureProvider({ fetchImpl: server.fetchImpl, getAccessToken: async () => "tok" });
  assert.equal(await provider.speak({ text: "Hvad betyder sun?", segments: [
    { text: "Hvad betyder", lang: "da-DK" }, { text: "sun?", lang: "en-GB" },
  ] }), true);
  const synth = server.calls.find((c) => c.url === "/api/tts");
  assert.equal(synth.init.headers.authorization, "Bearer tok");
  assert.deepEqual(JSON.parse(synth.init.body), { segments: [
    { text: "Hvad betyder", lang: "da-DK" }, { text: "sun?", lang: "en-GB" },
  ] });
  provider.stop();
});

test("provider: Azure errors and timeouts fail calmly — no other voice is used", async () => {
  installAudio();
  const failing = createAzureProvider({ fetchImpl: clipServer({ cached: false, synthStatus: 502 }).fetchImpl, getAccessToken: async () => "tok" });
  const states = [];
  assert.equal(await failing.speak({ text: "Hej", onState: (s) => states.push(s) }), false);
  assert.deepEqual(states, [], "a failed start never reports a false 'ended'");

  const hanging = createAzureProvider({ fetchImpl: clipServer({ hang: true }).fetchImpl, timeouts: { metaMs: 20 } });
  const started = Date.now();
  assert.equal(await hanging.speak({ text: "Hej" }), false);
  assert.ok(Date.now() - started < 1000);

  const signedOut = createAzureProvider({ fetchImpl: clipServer({ cached: false }).fetchImpl, getAccessToken: async () => null });
  assert.equal(await signedOut.speak({ text: "Hej" }), false);

  globalThis.Audio = function () {
    this.addEventListener = () => {};
    this.pause = () => {};
    this.play = () => new Promise(() => {}); // never starts
  };
  const stuck = createAzureProvider({ fetchImpl: clipServer().fetchImpl, timeouts: { playMs: 20 } });
  assert.equal(await stuck.speak({ text: "Hej" }), false);
});

test("provider: stop while loading cancels the old request (next question)", async () => {
  const audio = installAudio();
  const server = clipServer();
  const provider = createAzureProvider({ fetchImpl: server.fetchImpl });
  const pending = provider.speak({ text: "Første spørgsmål" });
  provider.stop();
  assert.equal(await pending, false);
  assert.equal(audio.length, 0, "nothing plays after the pupil moved on");
});
