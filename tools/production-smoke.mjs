// D-110 phase D2 — read-only smoke test of the PUBLIC production deployment after a push to main.
// ---------------------------------------------------------------------------------------------
// WHAT IT PROVES
//   1. Cloudflare Workers Builds deployed THIS commit: its check run on the commit is completed and
//      successful (the check is posted once the deploy has finished, with the deployed Version ID).
//   2. main is still this commit — before and after the comparison. A run whose commit main has
//      moved past is red ("superseded"), never green: the newer push has its own run.
//   3. What the site serves is byte-for-byte the bundle this commit builds: every file of
//      dist-cloudflare/ (built from the same checkout) is fetched and compared by SHA-256. Measured
//      on 2026-10-30 against 09f1e21: all 185 directly served files identical, HTML included. A
//      legacy .html twin of a clean route must answer 301 to that route; every clean route must
//      serve its file's exact bytes. Mismatches are retried a bounded number of times (propagation),
//      then the run fails. An older or a different deployment therefore never passes.
//   4. Internal paths are not served: each answers 404 with the deployed 404 page.
//   5. The Edge Functions named in OPTIONS_FUNCTIONS answer a CORS preflight: 200 "ok". Reviewed in the
//      DEPLOYED source (get-next-question v179, process-event v34): OPTIONS returns before any client
//      is built, any key is resolved or the database is touched; module scope holds only constants and
//      one log line.
//
// WHY IT CANNOT CHANGE PRODUCTION DATA
//   * Every request goes through request() → assertAllowed(). Allowed are ONLY:
//       GET     https://xn--lrlig-sra.dk + a path from this commit's bundle, its clean routes or MUST_404;
//       OPTIONS https://tjzbehwfagiwpwodsgwg.supabase.co/functions/v1/<one of OPTIONS_FUNCTIONS>;
//       GET     two exact read-only GitHub API URLs (this commit's check runs, the main branch head).
//     Anything else — another method, host, path, scheme, a query string, credentials in the URL —
//     throws before a request is made. No Supabase REST, Auth or Storage path is reachable at all.
//   * It holds no production credential: no Supabase key, no account, no login. The only header with
//     a credential is the workflow's read-only GitHub token, sent ONLY to api.github.com.
//   * redirect: "manual" — a redirect is asserted, never followed to another host.
//   * selfCheck() runs first, every time: it proves the guard refuses writes and foreign destinations
//     before the first real request. If the guard ever allowed one, the run fails right there.
//
// Node builtins only (fetch is global), like the build script it reads its tables from.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, sep, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { OUT_DIR_NAME, REDIRECT_RULES } from "./cloudflare-build-static.mjs";

export const SITE = "https://xn--lrlig-sra.dk";
export const FUNCTIONS_BASE = "https://tjzbehwfagiwpwodsgwg.supabase.co/functions/v1/";
export const GITHUB_API = "https://api.github.com";
export const OPTIONS_FUNCTIONS = Object.freeze(["get-next-question", "process-event"]);
export const CLOUDFLARE_APP = "cloudflare-workers-and-pages";
export const CLOUDFLARE_CHECK_PREFIX = "Workers Builds:";

// Never served (same contract as tools/cloudflare-serve-check.mjs MUST_NOT_SERVE, a representative subset).
export const MUST_404 = Object.freeze([
  "/_redirects", "/CLAUDE.md", "/package.json", "/.env", "/wrangler.jsonc",
  "/docs/ROADMAP.md", "/tools/cloudflare-build-static.mjs", "/supabase/functions/process-event/index.ts",
]);

// Served Content-Type per extension, as measured on production (2026-10-30).
export const CONTENT_TYPES = Object.freeze({
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".webp": "image/webp", ".png": "image/png", ".wav": "audio/wav", ".xml": "application/xml",
});

export const LIMITS = Object.freeze({ deployAttempts: 20, deployWaitMs: 30000, contentAttempts: 6, contentWaitMs: 20000 });

const SHA_RE = /^[0-9a-f]{40}$/;
const REPO_RE = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const pathOf = (p) => new URL(SITE + encodeURI(p)).pathname;

// Clean route → served file, and legacy file → the route its 301 points to.
export function routeTables(rules = REDIRECT_RULES) {
  const routes = [];
  for (const line of rules) {
    const [from, to, status] = String(line).split(/\s+/);
    if (status !== "200" || !from?.startsWith("/") || !to?.startsWith("/")) throw new Error(`unexpected redirect rule: ${line}`);
    routes.push({ route: from, file: to.slice(1) });
  }
  return routes;
}

// The bundle: every file under distDir except _redirects (configuration, never served).
export function bundleFiles(distDir) {
  const out = [];
  const walk = (d) => {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(distDir, p).split(sep).join("/"));
    }
  };
  walk(distDir);
  return out.filter((f) => f !== "_redirects");
}

export function makePolicy({ repo, sha, files, routes }) {
  if (!REPO_RE.test(String(repo ?? ""))) throw new Error("invalid repository name");
  if (!SHA_RE.test(String(sha ?? ""))) throw new Error("invalid commit sha");
  const sitePaths = new Set([...files.map((f) => pathOf("/" + f)), ...routes.map((r) => pathOf(r.route)), ...MUST_404.map(pathOf)]);
  const githubUrls = new Set([
    `${GITHUB_API}/repos/${repo}/commits/${sha}/check-runs?per_page=100`,
    `${GITHUB_API}/repos/${repo}/commits/main`,
  ]);
  return Object.freeze({ sitePaths, githubUrls });
}

// THE guard. Throws unless the request is one of the read-only shapes listed in the header.
export function assertAllowed(method, url, policy) {
  let u;
  try { u = new URL(url); } catch { throw new Error(`refused: not a URL: ${url}`); }
  if (u.protocol !== "https:" || u.username || u.password || u.hash) throw new Error(`refused: ${method} ${url}`);
  if (method === "GET" && u.origin === SITE && !u.search && policy.sitePaths.has(u.pathname)) return;
  if (method === "GET" && u.origin === GITHUB_API && policy.githubUrls.has(u.href)) return;
  if (method === "OPTIONS" && !u.search && OPTIONS_FUNCTIONS.some((f) => u.href === FUNCTIONS_BASE + f)) return;
  throw new Error(`refused: ${method} ${url}`);
}

// The only way this module talks to the network.
export function makeRequest({ policy, fetchImpl = globalThis.fetch, githubToken = "" }) {
  return async function request(method, url) {
    assertAllowed(method, url, policy);
    const headers = { "user-agent": "laerlig-production-smoke" };
    if (new URL(url).origin === GITHUB_API) {
      headers.accept = "application/vnd.github+json";
      if (githubToken) headers.authorization = `Bearer ${githubToken}`;
    }
    if (method === "OPTIONS") {
      headers.origin = SITE;
      headers["access-control-request-method"] = "POST";
    }
    return await fetchImpl(url, { method, headers, redirect: "manual" });
  };
}

// Proves, before any real request, that the guard refuses every write and every foreign destination.
export function selfCheck(policy) {
  const anyPage = [...policy.sitePaths][0];
  const refused = [
    ...["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((m) => [m, SITE + anyPage]),
    ...["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => [m, FUNCTIONS_BASE + OPTIONS_FUNCTIONS[0]]),
    ["GET", "https://tjzbehwfagiwpwodsgwg.supabase.co/rest/v1/profiles"],
    ["POST", "https://tjzbehwfagiwpwodsgwg.supabase.co/auth/v1/token?grant_type=password"],
    ["OPTIONS", FUNCTIONS_BASE + "reset-student"],
    ["GET", "http://xn--lrlig-sra.dk" + anyPage],
    ["GET", SITE + anyPage + "?x=1"],
    ["GET", SITE + "/not-in-the-bundle.html"],
    ["POST", [...policy.githubUrls][0]],
  ];
  for (const [m, url] of refused) {
    let threw = false;
    try { assertAllowed(m, url, policy); } catch { threw = true; }
    if (!threw) throw new Error(`self-check: the guard allowed ${m} ${url}`);
  }
}

const json = async (res, what) => {
  if (res.status !== 200) throw new Error(`${what}: HTTP ${res.status}`);
  return await res.json();
};

async function waitForDeploy({ request, repo, sha, limits, sleep, log }) {
  const url = `${GITHUB_API}/repos/${repo}/commits/${sha}/check-runs?per_page=100`;
  for (let attempt = 1; attempt <= limits.deployAttempts; attempt++) {
    const body = await json(await request("GET", url), "check runs");
    const runs = (Array.isArray(body?.check_runs) ? body.check_runs : [])
      .filter((r) => r?.app?.slug === CLOUDFLARE_APP && String(r?.name ?? "").startsWith(CLOUDFLARE_CHECK_PREFIX));
    const done = runs.filter((r) => r?.status === "completed").sort((a, b) => String(a.completed_at).localeCompare(String(b.completed_at)));
    const newest = done[done.length - 1];
    if (newest && runs.length === done.length) {
      if (newest.conclusion !== "success") throw new Error(`Cloudflare deploy of ${sha} concluded "${newest.conclusion}"`);
      log(`deploy: Cloudflare check "${newest.name}" success at ${newest.completed_at} (attempt ${attempt})`);
      return;
    }
    log(`deploy: no completed Cloudflare check for ${sha} yet (attempt ${attempt}/${limits.deployAttempts})`);
    if (attempt < limits.deployAttempts) await sleep(limits.deployWaitMs);
  }
  throw new Error(`timeout: no completed Cloudflare deploy of ${sha} after ${limits.deployAttempts} attempts`);
}

async function assertStillMain({ request, repo, sha }) {
  const body = await json(await request("GET", `${GITHUB_API}/repos/${repo}/commits/main`), "main head");
  if (body?.sha !== sha) throw new Error(`superseded: main is now ${String(body?.sha).slice(0, 7)}, not ${sha.slice(0, 7)} — its own run checks it`);
}

const typeOk = (res, file) => {
  const want = CONTENT_TYPES[file.slice(file.lastIndexOf(".")).toLowerCase()];
  return !want || String(res.headers.get("content-type") ?? "").toLowerCase().startsWith(want);
};

// One full comparison of the live site against the bundle. Returns the list of mismatches.
async function compareSite({ request, distDir, files, routes }) {
  const local = new Map(files.map((f) => [f, sha256(readFileSync(join(distDir, f)))]));
  const legacy = new Map(routes.map((r) => [r.file, r.route]));
  const bad = [];
  const checks = [
    ...files.map((f) => async () => {
      const res = await request("GET", SITE + pathOf("/" + f));
      if (legacy.has(f)) {
        const loc = res.headers.get("location") ?? "";
        await res.arrayBuffer();
        const target = new URL(loc, SITE);
        if (res.status !== 301 || target.origin !== SITE || target.pathname !== legacy.get(f)) bad.push(`/${f}: expected 301 → ${legacy.get(f)}, got ${res.status} ${loc}`);
        return;
      }
      const body = Buffer.from(await res.arrayBuffer());
      if (res.status !== 200) bad.push(`/${f}: HTTP ${res.status}`);
      else if (!typeOk(res, f)) bad.push(`/${f}: content-type ${res.headers.get("content-type")}`);
      else if (sha256(body) !== local.get(f)) bad.push(`/${f}: bytes differ from this commit's bundle`);
    }),
    ...routes.map((r) => async () => {
      const res = await request("GET", SITE + pathOf(r.route));
      const body = Buffer.from(await res.arrayBuffer());
      if (res.status !== 200 || sha256(body) !== local.get(r.file)) bad.push(`${r.route}: expected the bytes of /${r.file}, got HTTP ${res.status}`);
    }),
    ...MUST_404.map((p) => async () => {
      const res = await request("GET", SITE + pathOf(p));
      const body = Buffer.from(await res.arrayBuffer());
      if (res.status !== 404 || sha256(body) !== local.get("404.html")) bad.push(`${p}: expected the 404 page, got HTTP ${res.status}`);
    }),
  ];
  // Bounded parallelism, deterministic result order. A network error is a mismatch of this attempt
  // (retried like one), never a pass.
  const guarded = checks.map((c, i) => async () => { try { await c(); } catch (e) { bad.push(`check ${i}: ${e?.message ?? e}`); } });
  for (let i = 0; i < guarded.length; i += 8) await Promise.all(guarded.slice(i, i + 8).map((c) => c()));
  return bad.sort();
}

async function checkFunctions({ request }) {
  for (const f of OPTIONS_FUNCTIONS) {
    const res = await request("OPTIONS", FUNCTIONS_BASE + f);
    const body = await res.text();
    if (res.status !== 200 || body !== "ok" || res.headers.get("access-control-allow-origin") !== "*") {
      throw new Error(`OPTIONS ${f}: expected 200 "ok" with CORS, got ${res.status} ${JSON.stringify(body.slice(0, 60))}`);
    }
  }
}

export async function runSmoke({ request, repo, sha, distDir, files, routes, limits = LIMITS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = console.log }) {
  await waitForDeploy({ request, repo, sha, limits, sleep, log });
  await assertStillMain({ request, repo, sha });
  let bad = [];
  for (let attempt = 1; attempt <= limits.contentAttempts; attempt++) {
    bad = await compareSite({ request, distDir, files, routes });
    if (bad.length === 0) { log(`site: ${files.length} files, ${routes.length} routes, ${MUST_404.length} internal paths match ${sha.slice(0, 7)} (attempt ${attempt})`); break; }
    log(`site: ${bad.length} mismatch(es) (attempt ${attempt}/${limits.contentAttempts}), first: ${bad[0]}`);
    if (attempt < limits.contentAttempts) await sleep(limits.contentWaitMs);
  }
  if (bad.length > 0) throw new Error(`the live site is not this commit's bundle:\n  ${bad.slice(0, 20).join("\n  ")}`);
  await checkFunctions({ request });
  log(`functions: OPTIONS ${OPTIONS_FUNCTIONS.join(", ")} → 200 ok`);
  await assertStillMain({ request, repo, sha });
  log(`production smoke: PASS for ${sha}`);
}

const invoked = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invoked) {
  try {
    const repo = process.env.GITHUB_REPOSITORY;
    const sha = process.env.HEAD_SHA;
    const distDir = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), OUT_DIR_NAME);
    if (!existsSync(join(distDir, "404.html"))) throw new Error(`${OUT_DIR_NAME}/ is missing — build it from this checkout first`);
    const files = bundleFiles(distDir);
    const routes = routeTables();
    const policy = makePolicy({ repo, sha, files, routes });
    selfCheck(policy);
    console.log(`self-check: the request guard refuses writes and foreign destinations`);
    await runSmoke({ request: makeRequest({ policy, githubToken: process.env.GITHUB_TOKEN ?? "" }), repo, sha, distDir, files, routes });
  } catch (e) {
    console.error(`production smoke: FAIL — ${e?.message ?? e}`);
    process.exit(1);
  }
}
