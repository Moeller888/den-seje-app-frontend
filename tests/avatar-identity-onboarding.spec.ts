// Section 152C: Avatar identity onboarding tests.
// Soft prompt (Model C): students with chosen_at = null see the identity
// overlay on index.html BEFORE the grade selector; "Vælg senere" dismisses
// without writing (re-prompts next login); choosing calls set_avatar_identity.
// Teachers never see the prompt. Shop previews stay identity-independent.
//
// GOLDEN tests: permanent pixel baselines for the male and female bodies on
// the avatar page (the neutral baselines live in the 152B hair spec and must
// keep passing unchanged). chromium/win32, reduced motion.

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import * as path from "path";
import { findAuthUserByEmail, PROD } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const STUDENT_EMAIL = process.env.TEST_STUDENT_EMAIL!;
const STUDENT_PASS  = process.env.TEST_STUDENT_PASSWORD!;
const TEACHER_EMAIL    = process.env.TEST_TEACHER_EMAIL ?? "teacher-test@hotmail.com";
const TEACHER_PASSWORD = process.env.TEST_TEACHER_PASSWORD ?? "TestTeacher2026!";
const SUPABASE_URL  = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// C2 base body file per body_type (medium skin — these identities carry no
// skin_tone, so baseSrcForC2 resolves to the medium variant). AVATAR_V2/C2 render
// path; tests enable C2 via a localStorage override (see beforeEach), global flag
// stays false.
const BODY_FILE_FOR: Record<string, string> = {
  neutral: "body-neutral-medium-c2.svg",
  male:    "body-male-medium-c2.svg",
  female:  "body-female-medium-c2.svg",
};

let adminClient: ReturnType<typeof createClient>;
let studentId: string;

const CHOSEN_NEUTRAL = () => ({
  v: 1, body_type: "neutral", chosen_at: new Date().toISOString(),
});
const UNCHOSEN_NEUTRAL = { v: 1, body_type: "neutral", chosen_at: null };

test.beforeAll(async () => {
  adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const student = await findAuthUserByEmail(adminClient, STUDENT_EMAIL);
  if (!student) throw new Error(`Test student not found: ${STUDENT_EMAIL}`);
  studentId = student.id;
});

test.afterAll(async () => {
  // Suite-safe end state: chosen_at SET so the prompt never blocks later specs.
  await adminClient
    .from("profiles")
    .update({ avatar_identity: CHOSEN_NEUTRAL() })
    .eq("id", studentId);
});

test.beforeEach(async ({ page }) => {
  // C2 render exercised in TEST ONLY via a localStorage override; the global
  // AVATAR_V2 flag stays false. Runs before any page script on every navigation.
  await page.addInitScript(() => { try { localStorage.setItem("avatar_v2", "1"); } catch (e) {} });
});

async function setIdentity(identity: any) {
  const { error } = await adminClient
    .from("profiles")
    .update({ avatar_identity: identity })
    .eq("id", studentId);
  if (error) throw new Error(`identity fixture failed: ${error.message}`);
}

async function loginAsStudent(page: any) {
  await page.goto(`${PROD}/login.html`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/index.html`, { timeout: 20000 });
}

// ── Identity flow ─────────────────────────────────────────────────────────────

test("1. chosen_at null shows the prompt with the current body marked", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await setIdentity(UNCHOSEN_NEUTRAL);
  await loginAsStudent(page);

  const overlay = page.locator("#identity-overlay");
  await expect(overlay).toBeVisible({ timeout: 15000 });

  // The student's current body is marked — "Behold" is one tap.
  await expect(
    page.locator(".identity-card[data-body-type='neutral']")
  ).toHaveClass(/identity-card--current/);
  await expect(
    page.locator(".identity-card[data-body-type='neutral'] .identity-card-current-badge")
  ).toHaveText("Nuværende");
});

test("2. Choosing Pige sets chosen_at and renders the female body", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await setIdentity(UNCHOSEN_NEUTRAL);
  await loginAsStudent(page);

  const overlay = page.locator("#identity-overlay");
  await expect(overlay).toBeVisible({ timeout: 15000 });

  await page.locator(".identity-card[data-body-type='female']").click();
  await expect(overlay).toBeHidden({ timeout: 15000 });

  // Quiz flow continues normally after the prompt.
  await page.waitForSelector("#options button", { timeout: 30000 });

  // Identity-strip avatar re-rendered with the female body.
  await expect(
    page.locator(`#avatar-display img[data-c2-layer="base"][src*="${BODY_FILE_FOR.female}"]`)
  ).toBeAttached();

  // Persisted with chosen_at stamped.
  const { data: row } = await adminClient
    .from("profiles")
    .select("avatar_identity")
    .eq("id", studentId)
    .maybeSingle();
  expect((row as any)?.avatar_identity?.body_type).toBe("female");
  expect((row as any)?.avatar_identity?.chosen_at).toBeTruthy();
});

test("3. No prompt when chosen_at is set", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await setIdentity({ v: 1, body_type: "female", chosen_at: new Date().toISOString() });
  await loginAsStudent(page);

  // Quiz reachable without any identity overlay.
  await page.waitForSelector("#options button", { timeout: 30000 });
  await expect(page.locator("#identity-overlay")).toBeHidden();
});

test("4. 'Vælg senere' dismisses without writing and re-prompts next login", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await setIdentity(UNCHOSEN_NEUTRAL);
  await loginAsStudent(page);

  const overlay = page.locator("#identity-overlay");
  await expect(overlay).toBeVisible({ timeout: 15000 });

  await page.locator("#identity-later-btn").click();
  await expect(overlay).toBeHidden();

  // Quiz flow continues — the prompt never blocks learning.
  await page.waitForSelector("#options button", { timeout: 30000 });

  // Nothing was written.
  const { data: row } = await adminClient
    .from("profiles")
    .select("avatar_identity")
    .eq("id", studentId)
    .maybeSingle();
  expect((row as any)?.avatar_identity?.chosen_at ?? null).toBeNull();

  // Re-prompts at next login.
  await page.goto(`${PROD}/index.html`, { waitUntil: "domcontentloaded" });
  await expect(overlay).toBeVisible({ timeout: 15000 });
});

test("5. Teachers never see the identity prompt", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await page.goto(`${PROD}/login.html`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", TEACHER_EMAIL);
  await page.fill("#password", TEACHER_PASSWORD);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/teacher.html`, { timeout: 20000 });

  // Teacher navigates to the student page directly: the prompt must never
  // appear (role gate in maybeShowIdentityPrompt; the teacher's own profile
  // has chosen_at null from the 152A backfill, so without the gate it WOULD
  // show). index.html is not a supported teacher page and its init has no
  // guaranteed milestones for teachers — so the assertion is a bounded watch
  // with no milestone dependency: the overlay must not become visible.
  await page.goto(`${PROD}/index.html`, { waitUntil: "load" });

  let appeared = false;
  try {
    await page.locator("#identity-overlay").waitFor({ state: "visible", timeout: 8000 });
    appeared = true;
  } catch {
    // never became visible — the requirement holds
  }
  expect(appeared, "identity overlay must never appear for teachers").toBe(false);
});

// ── Rendering across surfaces ─────────────────────────────────────────────────

test("6. All three bodies render on avatar page and hub", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await setIdentity(CHOSEN_NEUTRAL());
  await loginAsStudent(page);

  for (const bodyType of ["neutral", "male", "female"] as const) {
    await setIdentity({ v: 1, body_type: bodyType, chosen_at: new Date().toISOString() });

    await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#identityButtons .identity-btn", { timeout: 15000 });
    await expect(
      page.locator(`#avatar-preview img[data-c2-layer="base"][src*="${BODY_FILE_FOR[bodyType]}"]`)
    ).toBeAttached();

    await page.goto(`${PROD}/hub.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#profileAvatar img", { timeout: 15000 });
    await expect(
      page.locator(`#profileAvatar img[data-c2-layer="base"][src*="${BODY_FILE_FOR[bodyType]}"]`)
    ).toBeAttached();
  }
});

test("7. Shop previews stay identity-independent (neutral base)", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await setIdentity({ v: 1, body_type: "female", chosen_at: new Date().toISOString() });
  await loginAsStudent(page);

  await page.goto(`${PROD}/shop.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".shop-preview img", { timeout: 15000 });

  await expect(
    page.locator(`.shop-preview img[data-c2-layer="base"][src*="${BODY_FILE_FOR.neutral}"]`).first()
  ).toBeAttached();
  await expect(
    page.locator(`.shop-preview img[src*="body-female"]`)
  ).toHaveCount(0);
});

// ── Golden pixel baselines for the new bodies (permanent) ─────────────────────

async function waitForImages(page: any, selector: string) {
  // Wait for the app's render-complete signal (data-avatar-rendered="1"), set once the
  // full avatar composite — base + cosmetics + expression overlay — has decoded. This is
  // the deterministic wait point (#40); the img.complete check below is kept as a supplement.
  await page.waitForSelector(`${selector}[data-avatar-rendered="1"]`, { timeout: 15000 });
  await page.waitForFunction(
    (sel: string) => {
      const imgs = Array.from(document.querySelectorAll(sel + " img"));
      return imgs.length > 0 && imgs.every((i: any) => i.complete && i.naturalWidth > 0);
    },
    selector,
    { timeout: 15000 }
  );
}

for (const bodyType of ["male", "female"] as const) {
  test(`golden: avatar page ${bodyType} body matches baseline`, async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "golden baselines are chromium-only");

    await setIdentity({ v: 1, body_type: bodyType, chosen_at: new Date().toISOString() });
    await adminClient.from("profiles").update({ equipped_slots: {} }).eq("id", studentId);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await loginAsStudent(page);
    await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#identityButtons .identity-btn", { timeout: 15000 });
    await waitForImages(page, "#avatar-preview");

    await expect(page.locator("#avatar-preview")).toHaveScreenshot(`avatar-page-${bodyType}.png`, { maxDiffPixels: 200, animations: "disabled" });
  });
}
