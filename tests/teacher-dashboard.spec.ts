/**
 * Section 97 — Teacher Dashboard E2E Tests
 *
 * Tests teacher authentication, student visibility, domain focus editor
 * (save/reset/validation) and DB state verification via admin client.
 *
 * Requires: global-setup has run and created teacher-test@hotmail.com
 * and student-teacher-test@hotmail.com. No additional configuration needed.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import * as path from "path";
import {
  PROD,
  TEACHER_EMAIL,
  TEACHER_PASSWORD,
  STUDENT2_EMAIL,
  loginAsTeacher,
  openStudentDetail,
} from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SUPABASE_URL             = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let teacherId: string;
let student2Id: string;
let adminSupabase: ReturnType<typeof createClient>;

// ── Setup ─────────────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: users, error } = await adminSupabase.auth.admin.listUsers();
  if (error) throw new Error(`teacher-spec beforeAll: listUsers — ${error.message}`);

  const teacher = users.users.find((u) => u.email === TEACHER_EMAIL);
  const student2 = users.users.find((u) => u.email === STUDENT2_EMAIL);

  if (!teacher) throw new Error(`teacher-spec: test teacher ${TEACHER_EMAIL} not found — run global-setup first`);
  if (!student2) throw new Error(`teacher-spec: test student2 ${STUDENT2_EMAIL} not found — run global-setup first`);

  teacherId  = teacher.id;
  student2Id = student2.id;
});

// Reset student2 domains before every domain-editor test to guarantee
// a deterministic starting state regardless of previous test outcomes.
async function resetStudent2Domains(): Promise<void> {
  await adminSupabase
    .from("profiles")
    .update({ active_domains: null })
    .eq("id", student2Id);
}

// ── 1. Teacher can log in and reach the dashboard ─────────────────────────────

test("1. Teacher logs in and reaches teacher dashboard", async ({ page }) => {
  await loginAsTeacher(page);
  await expect(page).toHaveURL(`${PROD}/teacher.html`);
  await expect(page.locator("#classOverview")).toBeVisible();
});

// ── 2. Test student appears in class overview ─────────────────────────────────

test("2. Test student visible in class overview", async ({ page }) => {
  await loginAsTeacher(page);
  // go-student-btn is rendered with data-id = student UUID
  const studentBtn = page.locator(`button.go-student-btn[data-id="${student2Id}"]`);
  await expect(studentBtn).toBeVisible({ timeout: 10000 });
});

// ── 3. Navigate to student-detail via "Vis →" button ─────────────────────────

test("3. Clicking Vis → opens student detail page", async ({ page }) => {
  await loginAsTeacher(page);
  await page.locator(`button.go-student-btn[data-id="${student2Id}"]`).click();
  await page.waitForURL(`${PROD}/student-detail.html?id=${student2Id}`, { timeout: 10000 });
  await page.waitForSelector("#sd-domain-grid", { timeout: 15000 });
  await expect(page).toHaveURL(`${PROD}/student-detail.html?id=${student2Id}`);
});

// ── 4. Domain editor structure ────────────────────────────────────────────────

test("4. Domain editor renders 11 checkboxes, Save, and Reset buttons", async ({ page }) => {
  await loginAsTeacher(page);
  await openStudentDetail(page, student2Id);

  const checkboxes = page.locator("#sd-domain-grid input[type=checkbox]");
  await expect(checkboxes).toHaveCount(11);

  await expect(page.locator("#sd-domain-save")).toBeVisible();
  await expect(page.locator("#sd-domain-reset")).toBeVisible();
});

// ── 5. Validation: Save with zero checked shows error ─────────────────────────

test("5. Saving with no domains selected shows validation error", async ({ page }) => {
  await resetStudent2Domains();
  await loginAsTeacher(page);
  await openStudentDetail(page, student2Id);

  // All checkboxes should be unchecked (active_domains = null)
  const checked = page.locator("#sd-domain-grid input[type=checkbox]:checked");
  await expect(checked).toHaveCount(0);

  await page.locator("#sd-domain-save").click();

  const msg = page.locator("#sd-domain-msg");
  await expect(msg).toBeVisible();
  await expect(msg).toContainText("mindst ét domæne");
  // DB must be unchanged — still null
  const { data } = await adminSupabase
    .from("profiles")
    .select("active_domains")
    .eq("id", student2Id)
    .maybeSingle();
  expect(data?.active_domains).toBeNull();
});

// ── 6. Save domain selection ──────────────────────────────────────────────────

test("6. Selecting Vikings + Cold War and saving updates DB", async ({ page }) => {
  await resetStudent2Domains();
  await loginAsTeacher(page);
  await openStudentDetail(page, student2Id);

  // Check "Vikingerne" and "Den Kolde Krig"
  await page.locator('#sd-domain-grid input[value="vikings"]').check();
  await page.locator('#sd-domain-grid input[value="cold_war"]').check();

  await page.locator("#sd-domain-save").click();

  // Wait for success confirmation
  const msg = page.locator("#sd-domain-msg");
  await expect(msg).toContainText("gemt", { timeout: 10000 });

  // Verify DB state
  const { data } = await adminSupabase
    .from("profiles")
    .select("active_domains")
    .eq("id", student2Id)
    .maybeSingle();

  expect(Array.isArray(data?.active_domains)).toBe(true);
  expect(data?.active_domains).toContain("vikings");
  expect(data?.active_domains).toContain("cold_war");
  expect(data?.active_domains).toHaveLength(2);
});

// ── 7. Reset to all domains ───────────────────────────────────────────────────

test("7. Reset to all domains clears checkboxes and sets DB to null", async ({ page }) => {
  // Start with domains set so Reset has something to clear
  await adminSupabase
    .from("profiles")
    .update({ active_domains: ["vikings", "cold_war"] })
    .eq("id", student2Id);

  await loginAsTeacher(page);
  await openStudentDetail(page, student2Id);

  // Verify checkboxes are pre-checked
  await expect(page.locator('#sd-domain-grid input[value="vikings"]')).toBeChecked();
  await expect(page.locator('#sd-domain-grid input[value="cold_war"]')).toBeChecked();

  await page.locator("#sd-domain-reset").click();

  // Wait for success confirmation
  const msg = page.locator("#sd-domain-msg");
  await expect(msg).toContainText("Nulstillet", { timeout: 10000 });

  // All checkboxes should be unchecked after reset
  const checked = page.locator("#sd-domain-grid input[type=checkbox]:checked");
  await expect(checked).toHaveCount(0);

  // Verify DB state
  const { data } = await adminSupabase
    .from("profiles")
    .select("active_domains")
    .eq("id", student2Id)
    .maybeSingle();

  expect(data?.active_domains).toBeNull();
});

// ── 8. Backend rejects domain inaccessible for student's grade ────────────────

test("8. Saving world_war_2 for a grade-7 student shows backend error", async ({ page }) => {
  // Set student2 to grade 7 — world_war_2 has no questions for grade ≤ 7
  await adminSupabase
    .from("profiles")
    .update({ selected_grade: 7, active_domains: null })
    .eq("id", student2Id);

  await loginAsTeacher(page);
  await openStudentDetail(page, student2Id);

  await page.locator('#sd-domain-grid input[value="world_war_2"]').check();
  await page.locator("#sd-domain-save").click();

  const msg = page.locator("#sd-domain-msg");
  await expect(msg).toBeVisible({ timeout: 10000 });
  await expect(msg).toContainText("world_war_2");

  // DB must be unchanged — still null
  const { data } = await adminSupabase
    .from("profiles")
    .select("active_domains")
    .eq("id", student2Id)
    .maybeSingle();
  expect(data?.active_domains).toBeNull();

  // Restore grade to 9 so subsequent tests are unaffected
  await adminSupabase
    .from("profiles")
    .update({ selected_grade: 9 })
    .eq("id", student2Id);
});
