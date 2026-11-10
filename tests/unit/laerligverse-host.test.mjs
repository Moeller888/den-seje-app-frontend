// D-321: the Lærligverse host (laerligverse/host/) — generation, session, origins, backend wiring, serving
// and deploy isolation. MOCK fetch only: the real backend is proven by
// tests/isolated/laerligverse-host.isolated.spec.mjs on the isolated stack.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateModule, drift, OUTPUTS } from "../../tools/laerligverse/generate-host-bridge.mjs";
import { renderHostPage, hostCsp, hostHandler, HOST_FILES, DEV_FILES } from "../../tools/laerligverse/host-page.mjs";
import { assertOrigin, createEdgeCaller, createLaerligverseHost, passwordSessionProvider, supabaseSessionProvider } from "../../laerligverse/host/host-core.js";
import { RUNTIME_HTML, ROOT_FILES, ASSET_DIRS, MANDATORY } from "../../tools/cloudflare-build-static.mjs";

const GAME = "http://127.0.0.1:4331";
const SUPA = "http://127.0.0.1:54321";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.pupil-access-token.sig";
const ID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const P = "laerligverse.bridge/2";

// ── Generation ───────────────────────────────────────────────────────────────────────────────────
test("the committed host bridge is exactly what the generator makes from the TypeScript source (no drift)", () => {
  assert.deepEqual(drift(), []);
});

test("the generator refuses bare imports, surviving .ts specifiers and (outside dev files) the test adapter", () => {
  assert.throws(() => generateModule('import { x } from "pkg";\nexport const y = x;', "a.ts"), /bare import/);
  assert.throws(() => generateModule('import { x } from "./test-service.ts";\nexport const y = x;', "b.ts"), /test adapter/);
  assert.match(generateModule('import { x } from "./service.ts";\nexport const y: number = x;', "c.ts"), /from "\.\/service\.js"/);
  assert.ok(OUTPUTS.filter((o) => o.dev).every((o) => o.to.startsWith("bridge/test-service") || o.to.startsWith("dev/")));
});

// ── Deploy isolation ─────────────────────────────────────────────────────────────────────────────
test("laerligverse/ is not deployed: not a runtime page, not a root file, not under a copied asset directory", () => {
  const all = [...RUNTIME_HTML, ...ROOT_FILES, ...MANDATORY, ...ASSET_DIRS.map((d) => d.dir)];
  assert.ok(all.every((x) => !x.startsWith("laerligverse")), "laerligverse must not reach dist-cloudflare without an owner decision");
});

// ── Origins ──────────────────────────────────────────────────────────────────────────────────────
test("only exact ASCII origins are trusted: https, or http on loopback", () => {
  for (const ok of ["https://verden.xn--lrlig-sra.dk", "http://127.0.0.1:4331", "http://localhost:5173"]) assert.equal(assertOrigin(ok), ok);
  for (const bad of ["*", "null", "", "https://lærlig.dk", "http://evil.example", "https://a.dk/path", "https://a.dk/", "https://a.dk?x=1", 5, null]) {
    assert.throws(() => assertOrigin(bad), undefined, String(bad));
  }
});

// ── Sessions ─────────────────────────────────────────────────────────────────────────────────────
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const hit = routes.find((r) => String(url).includes(r.match));
    if (!hit) throw new TypeError("network down");
    const body = typeof hit.body === "function" ? hit.body(init) : hit.body;
    return { ok: hit.status < 400, status: hit.status, json: async () => body };
  };
  return { fn, calls };
}

test("the edge caller sends a FRESH token on every call and makes NO request when signed out", async () => {
  let token = "t1";
  const f = fakeFetch([{ match: "/functions/v1/", status: 200, body: { ok: true } }]);
  const call = createEdgeCaller({ supabaseUrl: SUPA, anonKey: "anon", session: { getAccessToken: async () => token }, fetchImpl: f.fn });
  await call("get-next-question", { subject: "historie" });
  token = "t2";
  await call("process-event", { question_instance_id: ID, answer: "x" });
  assert.deepEqual(f.calls.map((c) => c.init.headers.authorization), ["Bearer t1", "Bearer t2"]);
  token = null;
  assert.deepEqual(await call("process-event", {}), { status: 401, body: { error: "Unauthorized", reason: "signed_out" } });
  assert.equal(f.calls.length, 2, "signed out: no network request");
  await assert.rejects(call("delete-everything", {}), /unknown function/);
});

test("password sign-in (local only) keeps tokens in memory, refreshes before expiry and signs out on a failed refresh", async () => {
  let now = 1_000_000;
  let refreshOk = true;
  const f = fakeFetch([
    { match: "grant_type=password", status: 200, body: { access_token: "a1", refresh_token: "r1", expires_in: 120 } },
    { match: "grant_type=refresh_token", status: 200, body: () => (refreshOk ? { access_token: "a2", refresh_token: "r2", expires_in: 3600 } : { error: "invalid" }) },
    { match: "/auth/v1/logout", status: 204, body: null },
  ]);
  const events = [];
  const s = passwordSessionProvider({ supabaseUrl: SUPA, anonKey: "anon", fetchImpl: f.fn, now: () => now });
  s.onChange((e) => events.push(e));
  assert.equal(await s.signIn("elev@e2e.invalid", "pw"), true);
  assert.equal(await s.getAccessToken(), "a1");
  now += 70_000; // inside the 60 s refresh window
  assert.equal(await s.getAccessToken(), "a2");
  await s.signOut();
  assert.equal(await s.getAccessToken(), null);
  assert.ok(f.calls.some((c) => c.url.endsWith("/auth/v1/logout")));
  // a failed refresh signs the pupil out
  await s.signIn("elev@e2e.invalid", "pw");
  refreshOk = false;
  f.calls.length = 0;
  now += 1_000_000;
  assert.equal(await s.getAccessToken(), null);
  assert.deepEqual(events, ["signed-in", "refreshed", "signed-out", "signed-in", "signed-out"]);
});

test("the supabase-js session provider asks the client for the token and stops after SIGNED_OUT", async () => {
  let cb = null;
  let gets = 0;
  const supabase = { auth: {
    getSession: async () => { gets++; return { data: { session: { access_token: "sb-token" } } }; },
    signOut: async () => {},
    onAuthStateChange: (f) => { cb = f; },
  } };
  const s = supabaseSessionProvider(supabase);
  assert.equal(await s.getAccessToken(), "sb-token");
  cb("SIGNED_OUT");
  assert.equal(await s.getAccessToken(), null);
  assert.equal(gets, 1);
});

// ── The host end to end, in memory (mock backend) ────────────────────────────────────────────────
function harness({ token = TOKEN, flags = { laerligverseBackend: true } } = {}) {
  const gameWindow = { w: "game" };
  const posted = [];
  let current = token;
  const f = fakeFetch([
    { match: "get-next-question", status: 200, body: { question_instance_id: ID, round_no: 1, answer_format: "mc", answer_type: "short", content: { question: "Hvornår?", options: ["9. april 1940", "29. august 1943"] } } },
    { match: "process-event", status: 200, body: { status: "correct", correct_answer: "9. april 1940", review_text: null } },
  ]);
  let n = 0;
  const host = createLaerligverseHost({
    gameOrigin: GAME, gameWindow, postToGame: (m) => posted.push(structuredClone(m)),
    session: { getAccessToken: async () => current }, supabaseUrl: SUPA, anonKey: "anon",
    flags, randomId: () => `r${++n}`, fetchImpl: f.fn,
  });
  const send = (data) => host.handleMessage({ origin: GAME, source: gameWindow, data });
  return { host, posted, f, send, signOut: () => { current = null; } };
}

test("the host refuses to start without the feature flag", () => {
  assert.throws(() => harness({ flags: { laerligverseBackend: false } }), /disabled/);
});

test("handshake → task → action: the backend gets the pupil's token; the game NEVER sees it", async () => {
  const h = harness();
  await h.send({ protocol: P, type: "hello", msgId: "h1", supports: [P], kinds: ["choice"], contentId: "arkivskabet", contentVersion: "1" });
  const nonce = h.posted.at(-1).nonce;
  await h.send({ protocol: P, type: "task.request", nonce, requestId: "q1", objectiveId: "hist.h4", purpose: "check", surface: "world", contextKey: "arkivskab" });
  const present = h.posted.find((m) => m.type === "task.present");
  assert.ok(present);
  await h.send({ protocol: P, type: "task.action", nonce, requestId: "q2", instanceToken: present.instanceToken, action: { kind: "choice", payload: { optionId: "o1" } }, clientSeq: 1 });
  assert.equal(h.posted.at(-1).type, "task.result");
  assert.equal(h.posted.at(-1).outcome, "correct");
  assert.ok(h.f.calls.every((c) => c.init.headers.authorization === `Bearer ${TOKEN}`));
  const seenByGame = JSON.stringify(h.posted);
  for (const secret of [TOKEN, "Bearer", "anon", ID, "authorization"]) assert.ok(!seenByGame.includes(secret), `the game saw ${secret}`);
});

test("after sign-out a commit is refused as session_expired WITHOUT any backend request", async () => {
  const h = harness();
  await h.send({ protocol: P, type: "hello", msgId: "h1", supports: [P], kinds: ["choice"], contentId: "c", contentVersion: "1" });
  const nonce = h.posted.at(-1).nonce;
  await h.send({ protocol: P, type: "task.request", nonce, requestId: "q1", objectiveId: "x", purpose: "check", surface: "world", contextKey: "k" });
  const present = h.posted.find((m) => m.type === "task.present");
  const before = h.f.calls.length;
  h.signOut();
  await h.send({ protocol: P, type: "task.action", nonce, requestId: "q2", instanceToken: present.instanceToken, action: { kind: "choice", payload: { optionId: "o1" } }, clientSeq: 1 });
  assert.deepEqual(h.posted.at(-1), { protocol: P, type: "error", nonce, requestId: "q2", code: "session_expired" });
  assert.equal(h.f.calls.length, before);
});

test("a destroyed host (page left) answers nothing more", async () => {
  const h = harness();
  h.host.destroy();
  await h.send({ protocol: P, type: "hello", msgId: "h1", supports: [P], kinds: ["choice"], contentId: "c", contentVersion: "1" });
  assert.equal(h.posted.length, 0);
});

// ── The page and its server ──────────────────────────────────────────────────────────────────────
test("the page gets a strict CSP and a config that can never close its script tag", () => {
  const html = renderHostPage({ mode: "isolated-test", gameOrigin: GAME, gameUrl: `${GAME}/game.html`, supabaseUrl: SUPA, anonKey: "</script><script>alert(1)</script>" });
  assert.ok(!html.includes("</script><script>alert(1)"));
  assert.match(html, /default-src 'none'; script-src 'self'/);
  assert.match(html, /connect-src http:\/\/127\.0\.0\.1:54321/);
  assert.match(html, /frame-src http:\/\/127\.0\.0\.1:4331/);
  assert.ok(!html.includes("__LV_"));
  assert.match(hostCsp({ gameOrigin: GAME, supabaseOrigin: null }), /connect-src 'none'/);
  assert.throws(() => hostCsp({ gameOrigin: "*", supabaseOrigin: null }));
});

test("the test adapter exists only in the local didactic demo, never in the isolated test", () => {
  assert.throws(() => renderHostPage({ mode: "isolated-test", backend: "test-adapter", gameOrigin: GAME, gameUrl: `${GAME}/game.html` }), /only for the local preview/);
  const serve = (handler, url) => {
    let status = 0;
    handler({ url }, { writeHead: (s) => (status = s), end: () => {} });
    return status;
  };
  const real = hostHandler("<html></html>");
  const demo = hostHandler("<html></html>", { dev: true });
  for (const f of DEV_FILES) {
    assert.equal(serve(real, `/${f}`), 404, `${f} must not be served outside the demo`);
    assert.equal(serve(demo, `/${f}`), 200);
  }
  for (const f of HOST_FILES) assert.equal(serve(real, `/${f}`), 200, f);
  for (const bad of ["/../package.json", "/%2e%2e/.env", "/bridge/../../tools/laerligverse/serve-local.mjs", "/host-core.js/x", "/%E0%A4%A"]) assert.equal(serve(real, bad), 404, bad);
});

test("the host app reads no secret from the URL and stores no token in web storage", () => {
  const app = readFileSync(new URL("../../laerligverse/host/host-app.js", import.meta.url), "utf8");
  assert.ok(!/location\.(search|hash)|URLSearchParams/.test(app), "configuration must not come from the URL");
  assert.ok(!/(localStorage|sessionStorage)\.setItem/.test(app), "the host app must not write tokens to storage");
});
