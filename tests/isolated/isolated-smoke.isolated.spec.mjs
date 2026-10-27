// Isolated E2E proof of concept: THIS commit's deploy bundle, served on loopback, against a LOCAL
// Supabase stack (own Postgres + Auth + local mail capture). No production URL, key, account or
// secret is reachable: the guard refuses the run first, and a browser tripwire aborts and records
// any request to a production host.
//
// What it proves (and nothing more): the PR's real frontend can be exercised end to end against an
// isolated backend; sign-in goes to the local Auth; a mail-producing Auth flow lands in the local
// mail catcher, never in a real inbox. It does NOT yet prove the app's data flows — those need the
// application schema, which the repository cannot reproduce today (D-110; see the replay step in
// .github/workflows/isolated-e2e.yml).
import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { assertIsolated, installProdTripwire, SYNTHETIC_EMAIL_DOMAIN } from "./isolation-guard.mjs";

assertIsolated(process.env);

const BASE = process.env.ISOLATED_BASE_URL.replace(/\/+$/, "");
const SUPA = process.env.ISOLATED_SUPABASE_URL.replace(/\/+$/, "");
const ANON = process.env.ISOLATED_SUPABASE_ANON_KEY;
const SERVICE = process.env.ISOLATED_SUPABASE_SERVICE_KEY;
const MAIL = (process.env.ISOLATED_MAIL_URL || "").replace(/\/+$/, "");
// Synthetic, per-run account: never an existing address, never deliverable.
const RUN = (process.env.GITHUB_RUN_ID || "local") + "-" + (process.env.GITHUB_RUN_ATTEMPT || "1");
// One account per browser project (each project gets its own worker and therefore its own beforeAll).
let PUPIL = "";
// Derived per run for a throwaway local account (never a literal, never a real credential).
const PASSWORD = createHash("sha256").update("isolated-e2e:" + RUN).digest("base64url");

const hits = [];
test.beforeEach(async ({ context }) => { await installProdTripwire(context, hits); });
test.afterEach(() => { expect(hits, "no request may go to a production host").toEqual([]); });

test.beforeAll(async ({ request }, testInfo) => {
  PUPIL = `pupil-${RUN}-${testInfo.project.name}@${SYNTHETIC_EMAIL_DOMAIN}`;
  const res = await request.post(`${SUPA}/auth/v1/admin/users`, {
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` },
    data: { email: PUPIL, password: PASSWORD, email_confirm: true },
  });
  expect(res.status(), "local Auth must create the synthetic user").toBe(200);
});

test("1. the PR build is served locally and its Supabase client points at the local stack", async ({ page }) => {
  const seen = new Set();
  page.on("request", (r) => seen.add(new URL(r.url()).origin));
  await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#email")).toBeVisible();
  await expect(page.locator("#forgotBtn")).toBeVisible();

  const auth = page.waitForResponse((r) => r.url().startsWith(`${SUPA}/auth/v1/token`) && r.request().method() === "POST");
  await page.fill("#email", PUPIL);
  await page.fill("#password", PASSWORD);
  await page.locator("#loginBtn").click();
  const res = await auth;
  expect(res.status(), "sign-in must be answered by the LOCAL Auth").toBe(200);
  expect([...seen]).toContain(new URL(SUPA).origin);
});

test("2. a mail-producing Auth flow lands in the local mail catcher", async ({ request, browserName }) => {
  test.skip(!MAIL, "ISOLATED_MAIL_URL not set");
  // Browser-independent, and the local Auth rate-limits sent mail: once per run is the proof.
  test.skip(browserName !== "chromium", "API-only check, run once");
  const rec = await request.post(`${SUPA}/auth/v1/recover`, { headers: { apikey: ANON }, data: { email: PUPIL } });
  expect(rec.status()).toBe(200);
  await expect.poll(async () => {
    const r = await request.get(`${MAIL}/api/v1/search?query=${encodeURIComponent("to:" + PUPIL)}`);
    if (!r.ok()) return -1;
    const j = await r.json();
    return Number(j?.messages_count ?? j?.total ?? (Array.isArray(j?.messages) ? j.messages.length : 0));
  }, { message: "the recovery mail must arrive in the local catcher", timeout: 20000 }).toBeGreaterThan(0);
});
