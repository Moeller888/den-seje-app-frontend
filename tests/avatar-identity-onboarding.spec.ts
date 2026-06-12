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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const PROD          = "https://den-seje-app-frontend.vercel.app";
const STUDENT_EMAIL = "christnmoeller@hotmail.com";
const STUDENT_PASS  = "Cmiciquru5";
const TEACHER_EMAIL    = process.env.TEST_TEACHER_EMAIL ?? "teacher-test@hotmail.com";
const TEACHER_PASSWORD = process.env.TEST_TEACHER_PASSWORD ?? "TestTeacher2026!";
const SUPABASE_URL  = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const BODY_FILE_FOR: Record<string, string> = {
  neutral: "/assets/avatar/base/body.svg",
  male:    "/assets/avatar/base/body-male.svg",
  female:  "/assets/avatar/base/body-female.svg",
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

  const { data: usersData } = await adminClient.auth.admin.listUsers();
  const student = (usersData?.users ?? []).find((u) => u.email === STUDENT_EMAIL);
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
    page.locator(`#avatar-display img[src*="${BODY_FILE_FOR.female}"]`)
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

  // Teacher navigates to the student page directly: role-gate must hold
  // (the teacher's own profile has chosen_at null from the 152A backfill).
  await page.goto(`${PROD}/index.html`, { waitUntil: "domcontentloaded" });
  // The grade overlay is the teacher's first gate (no selected_grade) —
  // by then the identity decision has already run and must have declined.
  await expect(page.locator("#grade-selector-overlay")).toBeVisible({ timeout: 20000 });
  await expect(page.locator("#identity-overlay")).toBeHidden();
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
      page.locator(`#avatar-preview img.avatar-layer[src*="${BODY_FILE_FOR[bodyType]}"]`)
    ).toBeAttached();

    await page.goto(`${PROD}/hub.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#profileAvatar img", { timeout: 15000 });
    await expect(
      page.locator(`#profileAvatar img[src*="${BODY_FILE_FOR[bodyType]}"]`)
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
    page.locator(`.shop-preview img[src*="${BODY_FILE_FOR.neutral}"]`).first()
  ).toBeAttached();
  await expect(
    page.locator(`.shop-preview img[src*="body-female"]`)
  ).toHaveCount(0);
});

// ── Golden pixel baselines for the new bodies (permanent) ─────────────────────

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

    const shot = await page.locator("#avatar-preview").screenshot();
    expect(shot).toMatchSnapshot(`avatar-page-${bodyType}.png`, { maxDiffPixels: 200 });
  });
}
