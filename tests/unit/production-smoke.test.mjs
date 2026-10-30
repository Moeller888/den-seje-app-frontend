// D-110 phase D2 — tools/production-smoke.mjs and .github/workflows/production-smoke.yml.
// No network: every request goes to a fake fetch, and the bundle is a temporary directory.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SITE, FUNCTIONS_BASE, GITHUB_API, OPTIONS_FUNCTIONS, MUST_404, CLOUDFLARE_APP,
  routeTables, bundleFiles, makePolicy, assertAllowed, makeRequest, selfCheck, runSmoke,
} from "../../tools/production-smoke.mjs";

const read = (p) => readFileSync(new URL(p, new URL("../../", import.meta.url)), "utf8").split("\r\n").join("\n");
const REPO = "Moeller888/den-seje-app-frontend";
const SHA = "a".repeat(40);
const OTHER = "b".repeat(40);
const RULES = ["/ /landing.html 200", "/priser /priser.html 200"];

function fakeBundle() {
  const dir = mkdtempSync(join(tmpdir(), "smoke-"));
  mkdirSync(join(dir, "js"));
  mkdirSync(join(dir, "assets"));
  const files = {
    "404.html": "<html>404</html>", "landing.html": "<html>landing</html>", "priser.html": "<html>priser</html>",
    "hub.html": "<html>hub</html>", "js/login.js": "console.log(1);", "assets/a b.png": "PNG", "_redirects": RULES.join("\n"),
  };
  for (const [f, c] of Object.entries(files)) writeFileSync(join(dir, f), c);
  return { dir, content: files };
}

const TYPES = { html: "text/html", js: "text/javascript", png: "image/png" };
function res(status, body = "", headers = {}) {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const buf = Buffer.from(body);
  return { status, headers: { get: (k) => h.get(k.toLowerCase()) ?? null }, arrayBuffer: async () => buf, text: async () => buf.toString(), json: async () => JSON.parse(buf.toString()) };
}

// A production that serves exactly the fake bundle; `over` replaces single answers.
function fakeProduction(content, over = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, ...init });
    const key = `${init.method} ${url}`;
    if (over[key]) return over[key](calls.filter((c) => `${c.method} ${c.url}` === key).length);
    if (url === `${GITHUB_API}/repos/${REPO}/commits/${SHA}/check-runs?per_page=100`) {
      return res(200, JSON.stringify({ check_runs: [{ name: "Workers Builds: den-seje-app-frontend", app: { slug: CLOUDFLARE_APP }, status: "completed", conclusion: "success", completed_at: "2026-10-30T08:31:40Z" }] }));
    }
    if (url === `${GITHUB_API}/repos/${REPO}/commits/main`) return res(200, JSON.stringify({ sha: SHA }));
    if (init.method === "OPTIONS") return res(200, "ok", { "access-control-allow-origin": "*" });
    const path = decodeURI(new URL(url).pathname);
    if (path === "/") return res(200, content["landing.html"], { "content-type": "text/html" });
    if (path === "/priser") return res(200, content["priser.html"], { "content-type": "text/html" });
    if (path === "/landing.html") return res(301, "", { location: `${SITE}/` });
    if (path === "/priser.html") return res(301, "", { location: "/priser" });
    const f = path.slice(1);
    if (f in content && f !== "_redirects") return res(200, content[f], { "content-type": TYPES[f.split(".").pop()] });
    return res(404, content["404.html"], { "content-type": "text/html" });
  };
  return { fetchImpl, calls };
}

const FAST = { deployAttempts: 3, deployWaitMs: 0, contentAttempts: 3, contentWaitMs: 0 };
async function smoke(over = {}, mutate = (c) => c) {
  const { dir, content } = fakeBundle();
  try {
    const files = bundleFiles(dir);
    const routes = routeTables(RULES);
    const policy = makePolicy({ repo: REPO, sha: SHA, files, routes });
    const prod = fakeProduction(mutate({ ...content }), over);
    const request = makeRequest({ policy, fetchImpl: prod.fetchImpl, githubToken: "gh-token" });
    let error = null;
    try { await runSmoke({ request, repo: REPO, sha: SHA, distDir: dir, files, routes, limits: FAST, sleep: async () => {}, log: () => {} }); }
    catch (e) { error = String(e?.message ?? e); }
    return { error, calls: prod.calls };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const policyFor = () => makePolicy({ repo: REPO, sha: SHA, files: ["hub.html", "assets/a b.png"], routes: routeTables(RULES) });

test("guard: allows only GET of bundle paths, OPTIONS of the listed functions and two exact GitHub reads", () => {
  const p = policyFor();
  for (const [m, u] of [
    ["GET", `${SITE}/hub.html`], ["GET", `${SITE}/assets/a%20b.png`], ["GET", `${SITE}/`], ["GET", `${SITE}/priser`], ["GET", `${SITE}/package.json`],
    ...OPTIONS_FUNCTIONS.map((f) => ["OPTIONS", FUNCTIONS_BASE + f]),
    ["GET", `${GITHUB_API}/repos/${REPO}/commits/${SHA}/check-runs?per_page=100`], ["GET", `${GITHUB_API}/repos/${REPO}/commits/main`],
  ]) assert.doesNotThrow(() => assertAllowed(m, u, p), `${m} ${u}`);
});

test("guard: refuses every write method, on every destination", () => {
  const p = policyFor();
  for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
    for (const u of [`${SITE}/hub.html`, FUNCTIONS_BASE + "get-next-question", `${GITHUB_API}/repos/${REPO}/commits/main`]) {
      assert.throws(() => assertAllowed(m, u, p), /refused/, `${m} ${u}`);
    }
  }
});

test("guard: refuses foreign destinations, Supabase data paths and anything not exactly listed", () => {
  const p = policyFor();
  for (const [m, u] of [
    ["GET", "https://tjzbehwfagiwpwodsgwg.supabase.co/rest/v1/profiles"],
    ["GET", "https://tjzbehwfagiwpwodsgwg.supabase.co/auth/v1/user"],
    ["GET", "https://tjzbehwfagiwpwodsgwg.supabase.co/storage/v1/object/x"],
    ["GET", FUNCTIONS_BASE + "get-next-question"],
    ["OPTIONS", FUNCTIONS_BASE + "reset-student"], ["OPTIONS", FUNCTIONS_BASE + "get-next-question?x=1"], ["OPTIONS", FUNCTIONS_BASE + "get-next-question/x"],
    ["HEAD", `${SITE}/hub.html`], ["OPTIONS", `${SITE}/hub.html`],
    ["GET", "http://xn--lrlig-sra.dk/hub.html"], ["GET", `${SITE}/hub.html?x=1`], ["GET", `${SITE}/hub.html#x`], ["GET", "https://u:p@xn--lrlig-sra.dk/hub.html"],
    // Dot segments are resolved by the URL parser first, so a traversal can only land on an exact listed path.
    ["GET", `${SITE}/not-in-bundle.html`], ["GET", `${SITE}/%2e%2e/KUN%20TIL%20MIG.txt`], ["GET", `${SITE}/js/%2e%2e/.env.local`], ["GET", "https://evil.example/hub.html"],
    ["GET", `${GITHUB_API}/repos/${REPO}/commits/${OTHER}/check-runs?per_page=100`], ["GET", `${GITHUB_API}/repos/other/repo/commits/main`], ["GET", `${GITHUB_API}/user`],
    ["GET", "not a url"],
  ]) assert.throws(() => assertAllowed(m, u, p), /refused/, `${m} ${u}`);
});

test("policy refuses an invalid repository or commit, and the self-check passes on a correct guard", () => {
  assert.throws(() => makePolicy({ repo: "x", sha: SHA, files: [], routes: [] }), /repository/);
  assert.throws(() => makePolicy({ repo: REPO, sha: "main", files: [], routes: [] }), /commit/);
  assert.doesNotThrow(() => selfCheck(policyFor()));
});

test("requests: the GitHub token goes ONLY to api.github.com, redirects are never followed, no Supabase key is ever sent", async () => {
  const { calls } = await smoke();
  assert.ok(calls.length > 10);
  for (const c of calls) {
    assert.equal(c.redirect, "manual");
    const auth = c.headers.authorization;
    if (new URL(c.url).origin === GITHUB_API) assert.equal(auth, "Bearer gh-token");
    else assert.equal(auth, undefined, c.url);
    assert.equal(c.headers.apikey, undefined);
    assert.ok(["GET", "OPTIONS"].includes(c.method));
  }
});

test("smoke: the exact deployment passes", async () => {
  assert.equal((await smoke()).error, null);
});

test("smoke: no completed Cloudflare deploy within the bound fails (timeout)", async () => {
  const pending = () => res(200, JSON.stringify({ check_runs: [{ name: "Workers Builds: x", app: { slug: CLOUDFLARE_APP }, status: "in_progress" }] }));
  const r = await smoke({ [`GET ${GITHUB_API}/repos/${REPO}/commits/${SHA}/check-runs?per_page=100`]: pending });
  assert.match(r.error, /timeout/);
  const none = () => res(200, JSON.stringify({ check_runs: [] }));
  assert.match((await smoke({ [`GET ${GITHUB_API}/repos/${REPO}/commits/${SHA}/check-runs?per_page=100`]: none })).error, /timeout/);
});

test("smoke: a failed Cloudflare deploy fails", async () => {
  const failed = () => res(200, JSON.stringify({ check_runs: [{ name: "Workers Builds: x", app: { slug: CLOUDFLARE_APP }, status: "completed", conclusion: "failure", completed_at: "t" }] }));
  assert.match((await smoke({ [`GET ${GITHUB_API}/repos/${REPO}/commits/${SHA}/check-runs?per_page=100`]: failed })).error, /concluded "failure"/);
});

test("smoke: a Workers Builds check from another app does not count", async () => {
  const spoof = () => res(200, JSON.stringify({ check_runs: [{ name: "Workers Builds: x", app: { slug: "someone-else" }, status: "completed", conclusion: "success", completed_at: "t" }] }));
  assert.match((await smoke({ [`GET ${GITHUB_API}/repos/${REPO}/commits/${SHA}/check-runs?per_page=100`]: spoof })).error, /timeout/);
});

test("smoke: main has moved past this commit → superseded, never green", async () => {
  const moved = () => res(200, JSON.stringify({ sha: OTHER }));
  assert.match((await smoke({ [`GET ${GITHUB_API}/repos/${REPO}/commits/main`]: moved })).error, /superseded/);
  // …also when main moves only during the comparison.
  const late = (n) => res(200, JSON.stringify({ sha: n === 1 ? SHA : OTHER }));
  assert.match((await smoke({ [`GET ${GITHUB_API}/repos/${REPO}/commits/main`]: late })).error, /superseded/);
});

test("smoke: an older or different deployment (one file's bytes differ) fails after the bounded retries", async () => {
  const r = await smoke({}, (c) => ({ ...c, "js/login.js": "console.log(0);" }));
  assert.match(r.error, /\/js\/login\.js: bytes differ/);
  // Propagation: wrong on the first attempt, right afterwards → passes.
  const { content } = fakeBundle();
  const flip = (n) => res(200, n === 1 ? "old" : content["js/login.js"], { "content-type": "text/javascript" });
  assert.equal((await smoke({ [`GET ${SITE}/js/login.js`]: flip })).error, null);
});

test("smoke: wrong content type, wrong legacy redirect, a served internal path, a network error all fail", async () => {
  assert.match((await smoke({ [`GET ${SITE}/hub.html`]: () => res(200, "<html>hub</html>", { "content-type": "text/plain" }) })).error, /content-type/);
  assert.match((await smoke({ [`GET ${SITE}/priser.html`]: () => res(200, "<html>priser</html>") })).error, /expected 301/);
  assert.match((await smoke({ [`GET ${SITE}/priser.html`]: () => res(301, "", { location: "https://evil.example/priser" }) })).error, /expected 301/);
  assert.match((await smoke({ [`GET ${SITE}/package.json`]: () => res(200, "{}") })).error, /package\.json: expected the 404 page/);
  assert.match((await smoke({ [`GET ${SITE}/hub.html`]: () => { throw new Error("ECONNRESET"); } })).error, /ECONNRESET/);
});

test("smoke: an Edge Function preflight that is not 200 \"ok\" with CORS fails", async () => {
  assert.match((await smoke({ [`OPTIONS ${FUNCTIONS_BASE}process-event`]: () => res(500, "boom") })).error, /OPTIONS process-event/);
});

test("the tool: one network call site, no Supabase data path, no production credential", () => {
  const src = read("tools/production-smoke.mjs");
  // selfCheck()'s list of destinations that MUST be refused names Supabase data paths on purpose; it
  // is excluded from the scan, the rest of the tool may not mention them at all.
  const withoutSelfCheck = src.replace(/\nexport function selfCheck\([\s\S]*?\n}\n/, "\n");
  assert.notEqual(withoutSelfCheck, src, "selfCheck() found and excluded");
  const code = withoutSelfCheck.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert.equal((code.match(/fetchImpl\(/g) ?? []).length, 1, "exactly one place sends a request");
  assert.doesNotMatch(code, /\bfetch\(/, "never the global fetch directly");
  assert.doesNotMatch(code, /\/rest\/v1|\/auth\/v1|\/storage\/v1|apikey|SUPABASE_|SERVICE_ROLE|TEST_STUDENT/);
  assert.match(code, /redirect: "manual"/);
  assert.deepEqual([...OPTIONS_FUNCTIONS], ["get-next-question", "process-event"]);
  assert.ok(MUST_404.includes("/.env") && MUST_404.includes("/package.json"));
});

test("the workflow: push to main + dispatch, read-only token, no secret or variable, own concurrency, build before smoke", () => {
  const wf = read(".github/workflows/production-smoke.yml");
  const code = wf.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
  assert.match(code, /\non:\n  push:\n    branches: \[ main \]\n  workflow_dispatch:\n/);
  assert.match(code, /\npermissions:\n  contents: read\n  checks: read\n\n/);
  // The one secret reference is the automatic, read-only workflow token; no stored secret, no variable.
  assert.deepEqual([...code.matchAll(/secrets\.[A-Za-z0-9_]+/g)].map((m) => m[0]), ["secrets.GITHUB_TOKEN"]);
  assert.doesNotMatch(code, /vars\.|e2e-shared-supabase|curl|wget|pull_request/);
  assert.ok(code.includes(
    "concurrency:\n  group: >-\n    ${{ github.event_name == 'workflow_dispatch'\n" +
    "      && format('production-smoke-dispatch-{0}', github.run_id)\n" +
    "      || format('production-smoke-{0}-{1}', github.event_name, github.ref) }}\n" +
    "  cancel-in-progress: true\n"));
  assert.match(code, /persist-credentials: false/);
  const build = code.indexOf("run: node tools/cloudflare-build-static.mjs");
  const run = code.indexOf("run: node tools/production-smoke.mjs");
  assert.ok(build > 0 && run > build, "the bundle is built from this checkout before the smoke");
  assert.equal((code.match(/\n\s+run: /g) ?? []).length, 2, "nothing else runs");
  assert.match(code, /HEAD_SHA: \$\{\{ github\.sha \}\}/);
});
