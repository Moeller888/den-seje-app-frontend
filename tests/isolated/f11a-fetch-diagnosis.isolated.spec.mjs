// F11-A DIAGNOSIS ONLY (branch d110/par-f11a-fetch-diagnosis, never merged): why did fetch from the login page fail
// with "TypeError: Failed to fetch" in PR #664's introduction lane (runs 43709089926 and 43711249866)?
//
// The same pupil, the same Edge Function (get-next-question), the same method and headers from different documents:
//   N   Playwright's HTTP client (Node — no browser rules at all)
//   L0  the real login.html (127.0.0.1:8788), nothing intercepted
//   L1  run 2's set-up: sign in on login.html, login.js's navigation to the Hub is route.abort()-ed (default "failed")
//       L1a fetch at once (as run 2 did), L1b after the navigation has settled
//   L2  as L1, but route.abort("aborted") (net::ERR_ABORTED)
//   L3  run 1's set-up: the Hub is route.fulfill()-ed with a stub page
//   L3g as L3, plus the Playwright permission "local-network-access" for that origin (ONE variable changed)
//   H   the harness host's real origin (127.0.0.1:4330), the origin the Lærligverse host specs call from
// Each call carries a unique ?f11a=<case> marker so the Kong access log (printed by the workflow) shows whether the
// request — preflight included — reached the local gateway. Nothing is asserted about the outcome: the tests only
// RECORD (lines prefixed "F11A-DIAG"); they fail only if the set-up itself fails. No token is ever printed.
import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { assertIsolated, SYNTHETIC_EMAIL_DOMAIN } from "./isolation-guard.mjs";
import { startHarness, HOST_ORIGIN } from "./laerligverse-harness/serve-harness.mjs";

assertIsolated(process.env);

const BASE = process.env.ISOLATED_BASE_URL.replace(/\/+$/, "");
const SUPA = process.env.ISOLATED_SUPABASE_URL.replace(/\/+$/, "");
const ANON = process.env.ISOLATED_SUPABASE_ANON_KEY;
const SERVICE = process.env.ISOLATED_SUPABASE_SERVICE_KEY;
const RUN = (process.env.GITHUB_RUN_ID || "local") + "-" + (process.env.GITHUB_RUN_ATTEMPT || "1");
const LANE = process.env.REPLAY_PROFILE || "production";
const svc = { apikey: SERVICE, authorization: `Bearer ${SERVICE}` };
const FN = "get-next-question";
const BODY = { subject: "historie" };

test.describe.configure({ mode: "serial" });

async function makePupil(request, browserName) {
  const tag = `f11a-${browserName}-${LANE}-${RUN}`.replace(/[^A-Za-z0-9-]/g, "");
  const email = `${tag}@${SYNTHETIC_EMAIL_DOMAIN}`;
  const password = createHash("sha256").update(`isolated-f11a:${tag}`).digest("base64url");
  const created = await request.post(`${SUPA}/auth/v1/admin/users`, { headers: svc, data: { email, password, email_confirm: true } });
  expect(created.status(), "local Auth must create the synthetic pupil").toBe(200);
  const id = (await created.json()).id;
  const profile = await request.post(`${SUPA}/rest/v1/profiles`, {
    headers: { ...svc, "content-type": "application/json", prefer: "return=minimal" },
    data: { id, role: "student", full_name: "Syntetisk F11-A-elev", selected_grade: 8, active_domains: ["cold_war"], equipped_slots: {}, active_theme: "default" },
  });
  expect(profile.status(), await profile.text()).toBe(201);
  return { id, email, password };
}

/** Chromium only: the DevTools network events for our marker URLs (preflight included). */
async function cdpRecorder(page, browserName) {
  const out = { requests: [], failed: [], extra: [], responses: [] };
  if (browserName !== "chromium") return { out, stop: async () => {} };
  const cdp = await page.context().newCDPSession(page);
  const ids = new Map();
  cdp.on("Network.requestWillBeSent", (e) => {
    if (!e.request.url.includes("f11a=")) return;
    ids.set(e.requestId, e.request.url.split("f11a=")[1]);
    out.requests.push({ id: e.requestId, marker: e.request.url.split("f11a=")[1], method: e.request.method, type: e.type ?? null, initiator: e.initiator?.type ?? null, documentURL: e.documentURL });
  });
  cdp.on("Network.requestWillBeSentExtraInfo", (e) => {
    if (!ids.has(e.requestId)) return;
    out.extra.push({ id: e.requestId, clientSecurityState: e.clientSecurityState ?? null, siteHasCookieInOtherPartition: e.siteHasCookieInOtherPartition ?? null });
  });
  cdp.on("Network.responseReceived", (e) => {
    if (!ids.has(e.requestId)) return;
    out.responses.push({ id: e.requestId, status: e.response.status, remoteIPAddress: e.response.remoteIPAddress ?? null, addressSpace: e.response.ipAddressSpace ?? null });
  });
  cdp.on("Network.loadingFailed", (e) => {
    if (!ids.has(e.requestId)) return;
    out.failed.push({ id: e.requestId, errorText: e.errorText, canceled: e.canceled ?? null, blockedReason: e.blockedReason ?? null, corsErrorStatus: e.corsErrorStatus ?? null });
  });
  await cdp.send("Network.enable");
  return { out, stop: async () => { await cdp.detach().catch(() => {}); } };
}

/** fetch from INSIDE the page's current document, with the pupil's session; the document's identity is recorded too. */
async function fromDocument(page, token, marker) {
  const seen = { request: false, requestFailed: null, response: null };
  const onReq = (r) => { if (r.url().includes(`f11a=${marker}`)) seen.request = true; };
  const onFail = (r) => { if (r.url().includes(`f11a=${marker}`)) seen.requestFailed = r.failure()?.errorText ?? "unknown"; };
  const onRes = (r) => { if (r.url().includes(`f11a=${marker}`)) seen.response = r.status(); };
  page.on("request", onReq);
  page.on("requestfailed", onFail);
  page.on("response", onRes);
  let inPage;
  try {
    inPage = await page.evaluate(async ({ url, anon, token, body }) => {
      const doc = { href: location.href, origin: location.origin, isSecureContext, readyState: document.readyState, title: document.title };
      try {
        const r = await fetch(url, { method: "POST", headers: { apikey: anon, authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
        return { doc, ok: true, status: r.status };
      } catch (e) {
        return { doc, ok: false, error: `${e?.name}: ${e?.message}` };
      }
    }, { url: `${SUPA}/functions/v1/${FN}?f11a=${marker}`, anon: ANON, token, body: BODY });
  } catch (e) {
    inPage = { ok: false, evaluateError: String(e?.message ?? e).split("\n")[0] };
  }
  await page.waitForTimeout(300);
  page.off("request", onReq);
  page.off("requestfailed", onFail);
  page.off("response", onRes);
  return { ...inPage, playwright: seen, pageUrl: page.url() };
}

/** Sign in through the real login page with a given interception of login.js's role redirect. */
async function signInOnLoginPage(page, p, intercept) {
  let redirected;
  const redirect = new Promise((resolve) => { redirected = resolve; });
  await page.route(/\/(hub|index|teacher|admin|reset-password)\.html/, (route) => {
    redirected(route.request().url());
    if (intercept === "abort-failed") return route.abort();
    if (intercept === "abort-aborted") return route.abort("aborted");
    return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>stop</title>" });
  });
  await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
  const auth = page.waitForResponse((r) => r.url().startsWith(`${SUPA}/auth/v1/token`) && r.request().method() === "POST");
  await page.fill("#email", p.email);
  await page.fill("#password", p.password);
  await page.locator("#loginBtn").click();
  const res = await auth;
  expect(res.status(), "sign-in must be answered by the LOCAL Auth").toBe(200);
  const token = (await res.json()).access_token;
  expect(typeof token).toBe("string");
  const target = await redirect;
  return { token, redirectTarget: new URL(target).pathname, urlRightAfterRedirect: page.url() };
}

const settle = async (page) => {
  await page.waitForLoadState("load").catch(() => {});
  await page.waitForTimeout(1500);
};

function report(testInfo, caseId, data) {
  const line = { case: caseId, lane: LANE, browser: testInfo.project.name, browserVersion, ...data };
  console.log("F11A-DIAG " + JSON.stringify(line));
}

let harness;
let browserVersion = null;
let pupil;
let token;
test.beforeAll(async ({ request, browserName }) => {
  harness = await startHarness();
  pupil = await makePupil(request, browserName);
  const r = await request.post(`${SUPA}/auth/v1/token?grant_type=password`, { headers: { apikey: ANON }, data: { email: pupil.email, password: pupil.password } });
  expect(r.status()).toBe(200);
  token = (await r.json()).access_token;
});
test.afterAll(async () => {
  await harness?.close();
});
test.beforeEach(async ({ browser }) => {
  browserVersion = browser.version();
});

test("N: Playwright HTTP client (Node)", async ({ request }, testInfo) => {
  const r = await request.post(`${SUPA}/functions/v1/${FN}?f11a=N`, { headers: { apikey: ANON, authorization: `Bearer ${token}`, "content-type": "application/json" }, data: BODY });
  report(testInfo, "N", { ok: true, status: r.status() });
});

test("L0: the real login.html, nothing intercepted", async ({ page, browserName }, testInfo) => {
  const cdp = await cdpRecorder(page, browserName);
  await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
  const r = await fromDocument(page, token, "L0");
  await cdp.stop();
  report(testInfo, "L0", { ...r, cdp: cdp.out });
});

for (const [caseId, intercept, when] of [
  ["L1a", "abort-failed", "immediate"],
  ["L1b", "abort-failed", "settled"],
  ["L2", "abort-aborted", "settled"],
  ["L3", "fulfill", "settled"],
  ["L3g", "fulfill+grant", "settled"],
]) {
  test(`${caseId}: login.html sign-in, redirect ${intercept}, fetch ${when}`, async ({ page, context, browserName }, testInfo) => {
    let grant = null;
    if (intercept === "fulfill+grant") {
      try {
        await context.grantPermissions(["local-network-access"], { origin: BASE });
        grant = "granted";
      } catch (e) {
        grant = `unsupported: ${String(e?.message ?? e).split("\n")[0]}`;
      }
    }
    const cdp = await cdpRecorder(page, browserName);
    const s = await signInOnLoginPage(page, p(), intercept.startsWith("fulfill") ? "fulfill" : intercept);
    if (when === "settled") await settle(page);
    const r = await fromDocument(page, s.token, caseId);
    await cdp.stop();
    report(testInfo, caseId, { grant, redirectTarget: s.redirectTarget, urlRightAfterRedirect: s.urlRightAfterRedirect, ...r, cdp: cdp.out });
  });
}

test("H: the harness host's origin (127.0.0.1:4330)", async ({ page, browserName }, testInfo) => {
  const cdp = await cdpRecorder(page, browserName);
  await page.goto(`${HOST_ORIGIN}/host.html`, { waitUntil: "domcontentloaded" });
  const r = await fromDocument(page, token, "H");
  await cdp.stop();
  report(testInfo, "H", { ...r, cdp: cdp.out });
});

function p() {
  return pupil;
}
