// Section 140: Grade selection failure recovery tests.
//
// The grade selector appears once on a student's first visit (selected_grade = null).
// Tests use page.route to intercept the set_student_grade Supabase RPC and
// simulate failure conditions against the real production backend — no mocking
// of auth, profile reads, or the quiz flow.
//
// Supabase RPC URL: **/rpc/set_student_grade**

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import * as path from "path";
import { findAuthUserByEmail } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const PROD              = "https://den-seje-app-frontend.vercel.app";
const SUPABASE_URL       = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STUDENT_EMAIL      = process.env.TEST_STUDENT_EMAIL!;
const STUDENT_PASS       = process.env.TEST_STUDENT_PASSWORD!;

let adminClient: ReturnType<typeof createClient>;
let studentId: string;

test.beforeAll(async () => {
  adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const s = await findAuthUserByEmail(adminClient, STUDENT_EMAIL);
  if (!s) throw new Error(`student not found: ${STUDENT_EMAIL}`);
  studentId = s.id;
});

test.afterAll(async () => {
  // Restore grade so other specs are unaffected.
  await adminClient.from("profiles")
    .update({ selected_grade: 9 })
    .eq("id", studentId);
});

// Helper: log in as student and wait for index.html to load.
async function loginAndWaitForApp(page: any): Promise<void> {
  await page.goto(`${PROD}/login.html`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  // Wait for index.html — URL change confirms redirect
  await page.waitForURL(/index\.html/, { timeout: 20000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("1. Grade selector appears for student with no grade and selection succeeds", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await adminClient.from("profiles")
    .update({ selected_grade: null })
    .eq("id", studentId);

  await loginAndWaitForApp(page);

  // Grade selector overlay must be visible
  const overlay = page.locator("#grade-selector-overlay");
  await expect(overlay).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".grade-btn").first()).toBeEnabled();

  // Student selects grade 9 — no routing, real RPC
  await page.locator(".grade-btn[data-grade='9']").click();

  // Overlay must hide and quiz must reach ready state
  await expect(overlay).not.toBeVisible({ timeout: 15000 });
  await page.waitForSelector('#question[data-state="ready"]', { timeout: 20000 });

  // DB confirms grade was persisted
  const { data } = await adminClient
    .from("profiles")
    .select("selected_grade")
    .eq("id", studentId)
    .maybeSingle();
  expect(data?.selected_grade).toBe(9);
});

test("2. RPC server error shows Danish message and re-enables buttons", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await adminClient.from("profiles")
    .update({ selected_grade: null })
    .eq("id", studentId);

  // Intercept the grade RPC and return a 500 before navigating
  await page.route("**/rpc/set_student_grade**", (route) => {
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: "server_error" }),
    });
  });

  await loginAndWaitForApp(page);
  await expect(page.locator("#grade-selector-overlay")).toBeVisible({ timeout: 10000 });

  await page.locator(".grade-btn[data-grade='9']").click();

  // Error message must appear in #grade-status
  const status = page.locator("#grade-status");
  await expect(status).toContainText("Kunne ikke gemme", { timeout: 5000 });

  // Buttons must be re-enabled so student can retry
  await expect(page.locator(".grade-btn").first()).toBeEnabled();

  // Overlay must stay visible (not dismissed on error)
  await expect(page.locator("#grade-selector-overlay")).toBeVisible();
});

test("3. Aborted network request shows error and re-enables buttons", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await adminClient.from("profiles")
    .update({ selected_grade: null })
    .eq("id", studentId);

  await page.route("**/rpc/set_student_grade**", (route) => {
    route.abort("failed");
  });

  await loginAndWaitForApp(page);
  await expect(page.locator("#grade-selector-overlay")).toBeVisible({ timeout: 10000 });

  await page.locator(".grade-btn[data-grade='8']").click();

  const status = page.locator("#grade-status");
  await expect(status).toContainText("Kunne ikke gemme", { timeout: 5000 });
  await expect(page.locator(".grade-btn").first()).toBeEnabled();
  await expect(page.locator("#grade-selector-overlay")).toBeVisible();
});

test("4. Retry after failure succeeds and advances to quiz", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await adminClient.from("profiles")
    .update({ selected_grade: null })
    .eq("id", studentId);

  // First call fails; subsequent calls pass through to the real backend.
  let callCount = 0;
  await page.route("**/rpc/set_student_grade**", (route) => {
    callCount++;
    if (callCount === 1) {
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "transient_error" }),
      });
    } else {
      route.continue();
    }
  });

  await loginAndWaitForApp(page);
  await expect(page.locator("#grade-selector-overlay")).toBeVisible({ timeout: 10000 });

  // First click — fails
  await page.locator(".grade-btn[data-grade='9']").click();
  await expect(page.locator("#grade-status")).toContainText("Kunne ikke gemme", { timeout: 5000 });
  await expect(page.locator(".grade-btn").first()).toBeEnabled();

  // Second click — succeeds
  await page.locator(".grade-btn[data-grade='9']").click();
  await expect(page.locator("#grade-selector-overlay")).not.toBeVisible({ timeout: 15000 });
  await page.waitForSelector('#question[data-state="ready"]', { timeout: 20000 });
});

test("5. Student with existing grade bypasses selector entirely", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");
  // selected_grade = 9 was set by test 4's successful retry (or restored by afterAll ordering)

  await loginAndWaitForApp(page);

  // Grade selector must NOT appear when grade is already set
  const overlay = page.locator("#grade-selector-overlay");
  // Give the app time to initialize; if overlay was going to show, it would be visible within 3s
  await page.waitForTimeout(3000);
  await expect(overlay).not.toBeVisible();

  // Quiz loads directly
  await page.waitForSelector('#question[data-state="ready"]', { timeout: 20000 });
});
