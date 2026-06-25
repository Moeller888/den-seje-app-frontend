// Section 152E: Avatar skin-tone variant tests.
// Verifies: medium + dark tones render the correct base SVG on the avatar page
// and hub, RPC merge semantics (skin-tone change preserves body_type + hairstyle;
// body_type change preserves skin_tone), invalid skin_tone rejected, and the UI
// panel button updates the preview + DB immediately.
//
// GOLDEN tests: permanent pixel baselines for the medium and dark neutral body
// on the avatar page + hub. chromium/win32, reduced motion. Goldens live in
// tests/avatar-skin-tone.spec.ts-snapshots/ — permanent regression assets
// protecting 152E skin-tone rendering.

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import * as path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const PROD          = "https://den-seje-app-frontend.vercel.app";
const STUDENT_EMAIL = process.env.TEST_STUDENT_EMAIL!;
const STUDENT_PASS  = process.env.TEST_STUDENT_PASSWORD!;
const SUPABASE_URL  = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqemJlaHdmYWdpd3B3b2RzZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2ODc5OTQsImV4cCI6MjA4NzI2Mzk5NH0.BzepnYLe6Khzqx9vTL3Ifa_zMRgjoGQ9Lw5seaoKMMc";

// C2 base body file per skin tone (neutral body_type) — AVATAR_V2/C2 render path.
// Tests run with the C2 preview enabled via a localStorage override (see beforeEach);
// the global AVATAR_V2 flag stays false.
const BASE_FILE: Record<string, string> = {
  medium: "body-neutral-medium-c2.svg",
  dark:   "body-neutral-dark-c2.svg",
};

const todayUTC = new Date().toISOString().slice(0, 10);

let adminClient:   ReturnType<typeof createClient>;
let studentClient: ReturnType<typeof createClient>;
let studentId: string;

const BASE_IDENTITY = () => ({
  v: 1, body_type: "neutral", hairstyle: "default", skin_tone: "medium",
  chosen_at: new Date().toISOString(),
});

test.beforeAll(async () => {
  adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const loginClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error } = await loginClient.auth.signInWithPassword({
    email: STUDENT_EMAIL, password: STUDENT_PASS,
  });
  if (error || !session.session) throw new Error(`Student sign-in failed: ${error?.message}`);
  studentId = session.user!.id;

  studentClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Suppress hub daily-reward modal (would cover the page in hub golden tests)
  const { data: dlr } = await adminClient
    .from("daily_login_rewards").select("student_id")
    .eq("student_id", studentId).maybeSingle();
  if (dlr) {
    await adminClient.from("daily_login_rewards")
      .update({ last_claimed_date: todayUTC }).eq("student_id", studentId);
  } else {
    await adminClient.from("daily_login_rewards")
      .insert({ student_id: studentId, last_claimed_date: todayUTC });
  }
});

test.beforeEach(async () => {
  // Known base: neutral body, default hair, medium tone, chosen_at SET, no equipment.
  await adminClient.from("profiles").update({
    equipped_slots: {},
    avatar_identity: BASE_IDENTITY(),
  }).eq("id", studentId);
});

test.beforeEach(async ({ page }) => {
  // C2 render is exercised in TEST ONLY via a localStorage override; the global
  // AVATAR_V2 flag in js/avatar-layers.js stays false. addInitScript runs before
  // any page script on every navigation, so isAvatarV2() returns true in-test.
  await page.addInitScript(() => { try { localStorage.setItem("avatar_v2", "1"); } catch (e) {} });
});

test.afterAll(async () => {
  await adminClient.from("profiles").update({
    equipped_slots: {},
    avatar_identity: BASE_IDENTITY(),
  }).eq("id", studentId);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function setIdentity(identity: object) {
  const { error } = await adminClient
    .from("profiles").update({ avatar_identity: identity }).eq("id", studentId);
  if (error) throw new Error(`identity fixture failed: ${error.message}`);
}

async function loginAsStudent(page: any) {
  await page.goto(`${PROD}/login.html`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/index.html`, { timeout: 20000 });
}

async function gotoLoginReduced(page: any) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${PROD}/login.html`, { waitUntil: "domcontentloaded" });
}

async function waitForImages(page: any, selector: string) {
  await page.waitForFunction(
    (sel: string) => {
      const imgs = Array.from(document.querySelectorAll(sel + " img"));
      return imgs.length > 0 && imgs.every((i: any) => i.complete && i.naturalWidth > 0);
    },
    selector,
    { timeout: 15000 }
  );
}

// ── Functional tests ──────────────────────────────────────────────────────────

test("1. medium skin tone renders the neutral medium body on avatar page", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await loginAsStudent(page);
  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#skinToneButtons .identity-btn", { timeout: 15000 });

  await expect(
    page.locator(`#avatar-preview img[data-c2-layer="base"][src*="${BASE_FILE.medium}"]`)
  ).toBeAttached();
});

test("2. dark skin tone renders the neutral dark body on avatar page", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await setIdentity({ v: 1, body_type: "neutral", hairstyle: "default", skin_tone: "dark", chosen_at: new Date().toISOString() });

  await loginAsStudent(page);
  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#skinToneButtons .identity-btn", { timeout: 15000 });

  await expect(
    page.locator(`#avatar-preview img[data-c2-layer="base"][src*="${BASE_FILE.dark}"]`)
  ).toBeAttached();
});

test("3. skin_tone persists after RPC — body_type + hairstyle preserved", async ({
  browserName,
}) => {
  test.skip(browserName !== "chromium", "API dedup");

  // Start: female body, braid hair, medium tone
  await setIdentity({ v: 1, body_type: "female", hairstyle: "braid", skin_tone: "medium", chosen_at: new Date().toISOString() });

  // Set only skin_tone — body_type and hairstyle must survive
  const { data, error } = await studentClient.rpc("set_avatar_identity", {
    p_skin_tone: "dark",
  });
  expect(error, `RPC failed: ${error?.message}`).toBeNull();
  expect((data as any)?.skin_tone).toBe("dark");
  expect((data as any)?.body_type).toBe("female");
  expect((data as any)?.hairstyle).toBe("braid");
  expect((data as any)?.chosen_at).toBeTruthy();

  const { data: row } = await adminClient
    .from("profiles").select("avatar_identity").eq("id", studentId).maybeSingle();
  expect((row as any)?.avatar_identity?.skin_tone).toBe("dark");
  expect((row as any)?.avatar_identity?.body_type).toBe("female");
  expect((row as any)?.avatar_identity?.hairstyle).toBe("braid");
});

test("4. body_type change via RPC preserves existing skin_tone", async ({
  browserName,
}) => {
  test.skip(browserName !== "chromium", "API dedup");

  // Start: neutral body, dark tone
  await setIdentity({ v: 1, body_type: "neutral", hairstyle: "default", skin_tone: "dark", chosen_at: new Date().toISOString() });

  // Change only body_type — dark tone must survive
  const { data, error } = await studentClient.rpc("set_avatar_identity", {
    p_body_type: "male",
  });
  expect(error, `RPC failed: ${error?.message}`).toBeNull();
  expect((data as any)?.body_type).toBe("male");
  expect((data as any)?.skin_tone).toBe("dark");

  const { data: row } = await adminClient
    .from("profiles").select("avatar_identity").eq("id", studentId).maybeSingle();
  expect((row as any)?.avatar_identity?.body_type).toBe("male");
  expect((row as any)?.avatar_identity?.skin_tone).toBe("dark");
});

test("5. invalid skin_tone rejected by RPC", async ({ browserName }) => {
  test.skip(browserName !== "chromium", "API dedup");

  const { error } = await studentClient.rpc("set_avatar_identity", {
    p_skin_tone: "light",
  });
  expect(error, "invalid skin_tone must be rejected").not.toBeNull();
});

test("6. hub renders the dark body", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await setIdentity({ v: 1, body_type: "neutral", hairstyle: "default", skin_tone: "dark", chosen_at: new Date().toISOString() });

  await loginAsStudent(page);
  await page.goto(`${PROD}/hub.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#profileAvatar img", { timeout: 15000 });

  await expect(
    page.locator(`#profileAvatar img[data-c2-layer="base"][src*="${BASE_FILE.dark}"]`)
  ).toBeAttached();
});

test("7. skin-tone panel button click updates avatar preview immediately", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await loginAsStudent(page);
  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#skinToneButtons .identity-btn", { timeout: 15000 });

  // Click "Mørk" button
  await page.locator("#skinToneButtons .identity-btn[data-skin-tone='dark']").click();

  // Preview must update to the dark neutral body
  await expect(
    page.locator(`#avatar-preview img[data-c2-layer="base"][src*="${BASE_FILE.dark}"]`)
  ).toBeAttached({ timeout: 10000 });

  // DB must be updated
  const { data: row } = await adminClient
    .from("profiles").select("avatar_identity").eq("id", studentId).maybeSingle();
  expect((row as any)?.avatar_identity?.skin_tone).toBe("dark");
});

// ── Golden pixel-regression tests ─────────────────────────────────────────────

test("golden: avatar page medium skin tone matches baseline", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "golden baselines are chromium-only");

  await setIdentity({ v: 1, body_type: "neutral", hairstyle: "default", skin_tone: "medium", chosen_at: new Date().toISOString() });

  await gotoLoginReduced(page);
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/index.html`, { timeout: 20000 });

  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#skinToneButtons .identity-btn", { timeout: 15000 });
  await waitForImages(page, "#avatar-preview");

  await expect(page.locator("#avatar-preview")).toHaveScreenshot("avatar-page-skin-medium.png", { maxDiffPixels: 200, animations: "disabled" });
});

test("golden: avatar page dark skin tone matches baseline", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "golden baselines are chromium-only");

  await setIdentity({ v: 1, body_type: "neutral", hairstyle: "default", skin_tone: "dark", chosen_at: new Date().toISOString() });

  await gotoLoginReduced(page);
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/index.html`, { timeout: 20000 });

  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#skinToneButtons .identity-btn", { timeout: 15000 });
  await waitForImages(page, "#avatar-preview");

  await expect(page.locator("#avatar-preview")).toHaveScreenshot("avatar-page-skin-dark.png", { maxDiffPixels: 200, animations: "disabled" });
});

test("golden: hub avatar medium skin tone matches baseline", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "golden baselines are chromium-only");

  await setIdentity({ v: 1, body_type: "neutral", hairstyle: "default", skin_tone: "medium", chosen_at: new Date().toISOString() });

  await gotoLoginReduced(page);
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/index.html`, { timeout: 20000 });

  await page.goto(`${PROD}/hub.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#profileAvatar img", { timeout: 15000 });
  await waitForImages(page, "#profileAvatar");

  await expect(page.locator("#profileAvatar")).toHaveScreenshot("hub-avatar-skin-medium.png", { maxDiffPixels: 120, animations: "disabled" });
});

test("golden: hub avatar dark skin tone matches baseline", async ({
  page, browserName,
}) => {
  test.skip(browserName !== "chromium", "golden baselines are chromium-only");

  await setIdentity({ v: 1, body_type: "neutral", hairstyle: "default", skin_tone: "dark", chosen_at: new Date().toISOString() });

  await gotoLoginReduced(page);
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/index.html`, { timeout: 20000 });

  await page.goto(`${PROD}/hub.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#profileAvatar img", { timeout: 15000 });
  await waitForImages(page, "#profileAvatar");

  await expect(page.locator("#profileAvatar")).toHaveScreenshot("hub-avatar-skin-dark.png", { maxDiffPixels: 120, animations: "disabled" });
});
