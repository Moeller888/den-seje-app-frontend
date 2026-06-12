// Section 152B: Hair Decoupling tests.
//
// GOLDEN tests ("golden:" prefix): pixel-regression against baselines captured
// from production BEFORE the decoupling (commit 7edc2f5 rendering). Baselines
// live in tests/avatar-hair-decoupling.spec.ts-snapshots/ and are PERMANENT
// regression assets protecting 152B, 152C body variants, and future hair work.
// Captured/compared with reduced motion (no breathing/blink) for determinism.
// Platform-specific (chromium/win32) — local runs only, like the rest of the suite.
//
// STRUCTURAL tests: hair layer present on all four render surfaces, body.svg
// and expression SVGs are hairless, eyebrows survive (they share the hair
// color #4a3626 — over-deletion guard), headwear stacks above hair.

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import * as path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const PROD          = "https://den-seje-app-frontend.vercel.app";
const STUDENT_EMAIL = "christnmoeller@hotmail.com";
const STUDENT_PASS  = "Cmiciquru5";
const SUPABASE_URL  = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Path signatures (exact strings from the SVG sources)
const HAIR_CAP_SIG  = "M 52 44 Q 46 11 66 9";          // main hair cap — in all 6 files pre-152B
const HAIR_BANG_SIG = "M 58 37 Q 64 26 74 24";          // forward bang
const BODY_BELT_SIG = 'rect x="40" y="174"';            // belt — body.svg must keep its body
const HAIR_COLOR    = "#4a3626";                        // hair fill AND eyebrow stroke color

const EXPRESSIONS = ["neutral", "focused", "proud", "curious", "determined"];

const todayUTC = new Date().toISOString().slice(0, 10);

let adminClient: ReturnType<typeof createClient>;
let studentId: string;
let headwearItemId: string;

test.beforeAll(async () => {
  adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: usersData } = await adminClient.auth.admin.listUsers();
  const student = (usersData?.users ?? []).find((u) => u.email === STUDENT_EMAIL);
  if (!student) throw new Error(`Test student not found: ${STUDENT_EMAIL}`);
  studentId = student.id;

  // Deterministic headwear item: first by id.
  const { data: hats, error: hatError } = await adminClient
    .from("shop_items")
    .select("id")
    .eq("slot_type", "headwear")
    .order("id")
    .limit(1);
  if (hatError || !hats || hats.length === 0) {
    throw new Error(`No headwear item found: ${hatError?.message}`);
  }
  headwearItemId = (hats[0] as any).id;

  // Renderer only draws OWNED items — ensure ownership (idempotent).
  const { data: owned } = await adminClient
    .from("user_items")
    .select("item_id")
    .eq("user_id", studentId)
    .eq("item_id", headwearItemId);
  if (!owned || owned.length === 0) {
    const { error } = await adminClient
      .from("user_items")
      .insert({ user_id: studentId, item_id: headwearItemId });
    if (error) throw new Error(`headwear grant failed: ${error.message}`);
  }

  // Suppress the hub daily-reward modal (it would cover the page).
  const { data: dlr } = await adminClient
    .from("daily_login_rewards")
    .select("student_id")
    .eq("student_id", studentId)
    .maybeSingle();
  if (dlr) {
    await adminClient
      .from("daily_login_rewards")
      .update({ last_claimed_date: todayUTC })
      .eq("student_id", studentId);
  } else {
    await adminClient
      .from("daily_login_rewards")
      .insert({ student_id: studentId, last_claimed_date: todayUTC });
  }
});

test.beforeEach(async () => {
  // Every test starts bare with a pinned NEUTRAL identity (goldens were
  // captured with the neutral body) and chosen_at SET (suppresses the
  // Section 152C identity prompt on index.html). Individual tests equip
  // via admin when needed.
  await adminClient
    .from("profiles")
    .update({
      equipped_slots: {},
      avatar_identity: { v: 1, body_type: "neutral", chosen_at: new Date().toISOString() },
    })
    .eq("id", studentId);
});

test.afterAll(async () => {
  await adminClient.from("profiles").update({ equipped_slots: {} }).eq("id", studentId);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loginAsStudent(page: any) {
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/index.html`, { timeout: 20000 });
}

async function gotoLoginReduced(page: any) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${PROD}/login.html`, { waitUntil: "domcontentloaded" });
}

// All <img> inside the selector must be fully loaded before a screenshot.
async function waitForImages(page: any, selector: string) {
  await page.waitForFunction(
    (sel: string) => {
      const imgs = Array.from(document.querySelectorAll(sel + " img"));
      return (
        imgs.length > 0 &&
        imgs.every((i: any) => i.complete && i.naturalWidth > 0)
      );
    },
    selector,
    { timeout: 15000 }
  );
}

// ── Golden pixel-regression tests ─────────────────────────────────────────────

test("golden: avatar page bare avatar matches baseline", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "golden baselines are chromium-only");

  await gotoLoginReduced(page);
  await loginAsStudent(page);
  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#identityButtons .identity-btn", { timeout: 15000 });
  await waitForImages(page, "#avatar-preview");

  const shot = await page.locator("#avatar-preview").screenshot();
  expect(shot).toMatchSnapshot("avatar-page-bare.png", { maxDiffPixels: 200 });
});

test("golden: avatar page with headwear matches baseline", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "golden baselines are chromium-only");

  await adminClient
    .from("profiles")
    .update({ equipped_slots: { headwear: headwearItemId } })
    .eq("id", studentId);

  await gotoLoginReduced(page);
  await loginAsStudent(page);
  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#identityButtons .identity-btn", { timeout: 15000 });
  await waitForImages(page, "#avatar-preview");

  const shot = await page.locator("#avatar-preview").screenshot();
  expect(shot).toMatchSnapshot("avatar-page-headwear.png", { maxDiffPixels: 200 });
});

test("golden: hub avatar matches baseline", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "golden baselines are chromium-only");

  await gotoLoginReduced(page);
  await loginAsStudent(page);
  await page.goto(`${PROD}/hub.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#profileAvatar img", { timeout: 15000 });
  await waitForImages(page, "#profileAvatar");

  const shot = await page.locator("#profileAvatar").screenshot();
  expect(shot).toMatchSnapshot("hub-avatar-bare.png", { maxDiffPixels: 120 });
});

test("golden: quiz identity-strip avatar matches baseline", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "golden baselines are chromium-only");

  await gotoLoginReduced(page);
  await loginAsStudent(page);
  // Stable state: question + answers rendered -> AWAITING_ANSWER (focused).
  await page.waitForSelector("#options button", { timeout: 30000 });
  await waitForImages(page, "#avatar-display");

  const shot = await page.locator("#avatar-display").screenshot();
  expect(shot).toMatchSnapshot("quiz-avatar-bare.png", { maxDiffPixels: 60 });
});

test("golden: shop first item preview matches baseline", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "golden baselines are chromium-only");

  await gotoLoginReduced(page);
  await loginAsStudent(page);
  await page.goto(`${PROD}/shop.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".shop-preview img", { timeout: 15000 });
  await waitForImages(page, ".shop-preview");

  const shot = await page.locator(".shop-preview").first().screenshot();
  expect(shot).toMatchSnapshot("shop-preview-first.png", { maxDiffPixels: 80 });
});

// ── Structural tests (post-decoupling state) ──────────────────────────────────

test("structure: hair layer renders on all four surfaces", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await gotoLoginReduced(page);
  await loginAsStudent(page);

  // Quiz (login lands here)
  await page.waitForSelector("#avatar-display img", { timeout: 15000 });
  await expect(
    page.locator('#avatar-display img[src*="hair-default.svg"]')
  ).toBeAttached();

  // Avatar page
  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#identityButtons .identity-btn", { timeout: 15000 });
  await expect(
    page.locator('#avatar-preview img[src*="hair-default.svg"]')
  ).toBeAttached();

  // Hub
  await page.goto(`${PROD}/hub.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#profileAvatar img", { timeout: 15000 });
  await expect(
    page.locator('#profileAvatar img[src*="hair-default.svg"]')
  ).toBeAttached();

  // Shop (mini paper-doll previews)
  await page.goto(`${PROD}/shop.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".shop-preview img", { timeout: 15000 });
  await expect(
    page.locator('.shop-preview img[src*="hair-default.svg"]').first()
  ).toBeAttached();
});

test("structure: body.svg is hairless but keeps body and face", async ({
  request,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "API dedup");

  const res = await request.get(`${PROD}/assets/avatar/base/body.svg`);
  expect(res.ok()).toBeTruthy();
  const svg = await res.text();

  expect(svg, "hair cap must be removed from body.svg").not.toContain(HAIR_CAP_SIG);
  expect(svg, "forward bang must be removed from body.svg").not.toContain(HAIR_BANG_SIG);
  expect(svg, "body (belt) must remain").toContain(BODY_BELT_SIG);
  // Eyebrows share the hair color — they must survive the deletion.
  expect(svg, "eyebrows must remain in body.svg").toContain(HAIR_COLOR);
});

test("structure: all expression SVGs are hairless but keep eyebrows", async ({
  request,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "API dedup");

  for (const name of EXPRESSIONS) {
    const res = await request.get(`${PROD}/assets/avatar/expressions/expr-${name}.svg`);
    expect(res.ok(), `expr-${name}.svg must exist`).toBeTruthy();
    const svg = await res.text();

    expect(svg, `hair cap must be removed from expr-${name}.svg`).not.toContain(HAIR_CAP_SIG);
    expect(svg, `forward bang must be removed from expr-${name}.svg`).not.toContain(HAIR_BANG_SIG);
    expect(svg, `eyebrows must remain in expr-${name}.svg`).toContain(HAIR_COLOR);
  }
});

test("structure: hair-default.svg exists and contains the hair paths", async ({
  request,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "API dedup");

  const res = await request.get(`${PROD}/assets/avatar/hair/hair-default.svg`);
  expect(res.ok(), "hair-default.svg must be deployed").toBeTruthy();
  const svg = await res.text();

  expect(svg).toContain(HAIR_CAP_SIG);
  expect(svg).toContain(HAIR_BANG_SIG);
});

test("structure: headwear stacks above the hair layer", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await adminClient
    .from("profiles")
    .update({ equipped_slots: { headwear: headwearItemId } })
    .eq("id", studentId);

  await gotoLoginReduced(page);
  await loginAsStudent(page);
  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#identityButtons .identity-btn", { timeout: 15000 });

  const hairZ = await page
    .locator('#avatar-preview img[src*="hair-default.svg"]')
    .evaluate((el: Element) => parseInt(getComputedStyle(el).zIndex, 10));
  const hatZ = await page
    .locator(`#avatar-preview img.avatar-layer:not([src*="hair-default"]):not([src*="body.svg"])`)
    .first()
    .evaluate((el: Element) => parseInt(getComputedStyle(el).zIndex, 10));

  expect(hairZ, "hair must render on the hair slot z-level").toBe(4);
  expect(hatZ, "headwear must stack above hair").toBeGreaterThan(hairZ);
});
