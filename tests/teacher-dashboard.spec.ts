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

test("8. Grade-7 student can be assigned cold_war after Section 101 content sprint", async ({ page }) => {
  // Before Section 101, cold_war had 0 questions for grade 7 — assignment was blocked.
  // After Section 101, 25 questions exist for grade 7 — assignment must succeed.
  await adminSupabase
    .from("profiles")
    .update({ selected_grade: 7, active_domains: null })
    .eq("id", student2Id);

  await loginAsTeacher(page);
  await openStudentDetail(page, student2Id);

  await page.locator('#sd-domain-grid input[value="cold_war"]').check();
  await page.locator("#sd-domain-save").click();

  const msg = page.locator("#sd-domain-msg");
  await expect(msg).toContainText("gemt", { timeout: 10000 });

  // DB must reflect the assignment
  const { data } = await adminSupabase
    .from("profiles")
    .select("active_domains")
    .eq("id", student2Id)
    .maybeSingle();
  expect(Array.isArray(data?.active_domains)).toBe(true);
  expect(data?.active_domains).toContain("cold_war");

  // Restore
  await adminSupabase
    .from("profiles")
    .update({ selected_grade: 9, active_domains: null })
    .eq("id", student2Id);
});

// ── 9. Band panel renders on student-detail ───────────────────────────────────

test("9. Band panel is visible on student-detail page", async ({ page }) => {
  await loginAsTeacher(page);
  await openStudentDetail(page, student2Id);

  const panel = page.locator("#sd-band-panel");
  await expect(panel).toBeVisible({ timeout: 10000 });
});

// ── 10. Placement band renders correctly ──────────────────────────────────────

test("10. Placement band 'Band 2' is displayed for student2", async ({ page }) => {
  // global-setup guarantees student2 has placement_band=2
  await loginAsTeacher(page);
  await openStudentDetail(page, student2Id);

  const panel = page.locator("#sd-band-panel");
  await expect(panel).toContainText("Band 2", { timeout: 10000 });
});

// ── 11. Current band + progression indicator appear when current_band is set ──

test("11. Progression indicator shows +2 bands when current_band advances from 2 to 4", async ({ page }) => {
  await adminSupabase
    .from("profiles")
    .update({ placement_band: 2, current_band: 4 })
    .eq("id", student2Id);

  await loginAsTeacher(page);
  await openStudentDetail(page, student2Id);

  const current = page.locator("#sd-band-current");
  await expect(current).toContainText("Band 4", { timeout: 10000 });

  const delta = page.locator("#sd-band-delta");
  await expect(delta).toContainText("+2 band");

  // Restore
  await adminSupabase
    .from("profiles")
    .update({ current_band: null })
    .eq("id", student2Id);
});

// ── 12. Band history panel renders ────────────────────────────────────────────

test("12. Band history panel is visible on student-detail page", async ({ page }) => {
  await loginAsTeacher(page);
  await openStudentDetail(page, student2Id);

  const panel = page.locator("#sd-band-history");
  await expect(panel).toBeVisible({ timeout: 10000 });
});

// ── 13. Empty history shows graceful state ────────────────────────────────────

test("13. Empty band history shows graceful message (no crash)", async ({ page }) => {
  // global-setup guarantees student2 has no answered question_instances
  await loginAsTeacher(page);
  await openStudentDetail(page, student2Id);

  const panel = page.locator("#sd-band-history");
  await expect(panel).toContainText(/ingen/i, { timeout: 10000 });
});

// ── 14. Band history renders data and highest band ────────────────────────────

test("14. Band history shows timeline and highest band when student has answered", async ({ page }) => {
  // Fetch two real question IDs with known difficulty bands
  const { data: q2 } = await adminSupabase
    .from("questions")
    .select("id")
    .eq("is_active", true)
    .eq("difficulty_band", 2)
    .limit(1);
  const { data: q4 } = await adminSupabase
    .from("questions")
    .select("id")
    .eq("is_active", true)
    .eq("difficulty_band", 4)
    .limit(1);

  if (!q2 || q2.length === 0 || !q4 || q4.length === 0) {
    throw new Error("test-setup: could not find Band 2 and Band 4 questions");
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  await adminSupabase.from("question_instances").insert([
    {
      student_id:        student2Id,
      question_id:       q2[0].id,
      answered:          true,
      correct_answer:    "",
      difficulty_at_time: 1,
      mastery_snapshot:  1,
      next_review_at:    new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      answered_at:       weekAgo.toISOString(),
      is_correct:        true,
    },
    {
      student_id:        student2Id,
      question_id:       q4[0].id,
      answered:          true,
      correct_answer:    "",
      difficulty_at_time: 1,
      mastery_snapshot:  1,
      next_review_at:    new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      answered_at:       now.toISOString(),
      is_correct:        true,
    },
  ]);

  await loginAsTeacher(page);
  await openStudentDetail(page, student2Id);

  const highest = page.locator("#sd-band-highest");
  await expect(highest).toContainText("Band 4", { timeout: 10000 });

  const timeline = page.locator("#sd-band-timeline");
  await expect(timeline).toContainText("Band 4");
  await expect(timeline).toContainText("Band 2");

  // Restore
  await adminSupabase
    .from("question_instances")
    .delete()
    .eq("student_id", student2Id);
});

// ── 15. Class overview shows placement band in "Band N" format ───────────────

test("15. Class overview shows 'Band 2' for placement_band=2", async ({ page }) => {
  // global-setup guarantees student2 has placement_band=2, current_band=null
  await loginAsTeacher(page);
  await page.waitForSelector("#classOverview table", { timeout: 15000 });

  const row = page.locator(`tr:has(button.go-student-btn[data-id="${student2Id}"])`);
  await expect(row).toContainText("Band 2", { timeout: 10000 });
});

// ── 16. Class overview shows graceful text for null current_band ─────────────

test("16. Class overview shows 'Ingen aktiv session' when current_band is null", async ({ page }) => {
  // student2 has current_band=null from global-setup
  await loginAsTeacher(page);
  await page.waitForSelector("#classOverview table", { timeout: 15000 });

  const row = page.locator(`tr:has(button.go-student-btn[data-id="${student2Id}"])`);
  await expect(row).toContainText("Ingen aktiv session", { timeout: 10000 });
});

// ── 17. Positive progression renders correctly in class overview ─────────────

test("17. Class overview shows '+2' growth when current_band advances from 2 to 4", async ({ page }) => {
  await adminSupabase
    .from("profiles")
    .update({ placement_band: 2, current_band: 4 })
    .eq("id", student2Id);

  await loginAsTeacher(page);
  await page.waitForSelector("#classOverview table", { timeout: 15000 });

  const row = page.locator(`tr:has(button.go-student-btn[data-id="${student2Id}"])`);
  await expect(row).toContainText("Band 4", { timeout: 10000 });
  await expect(row).toContainText("+2");

  // Restore
  await adminSupabase
    .from("profiles")
    .update({ current_band: null })
    .eq("id", student2Id);
});

// ── 18. Negative progression renders correctly in class overview ─────────────

test("18. Class overview shows negative growth when current_band drops below placement", async ({ page }) => {
  await adminSupabase
    .from("profiles")
    .update({ placement_band: 3, current_band: 1 })
    .eq("id", student2Id);

  await loginAsTeacher(page);
  await page.waitForSelector("#classOverview table", { timeout: 15000 });

  const row = page.locator(`tr:has(button.go-student-btn[data-id="${student2Id}"])`);
  await expect(row).toContainText("Band 1", { timeout: 10000 });
  await expect(row).toContainText("-2");

  // Restore
  await adminSupabase
    .from("profiles")
    .update({ placement_band: 2, current_band: null })
    .eq("id", student2Id);
});

// ── 19. Teacher dashboard does not crash ──────────────────────────────────────

test("19. Teacher dashboard loads and classOverview renders without crash", async ({ page }) => {
  await loginAsTeacher(page);
  await page.waitForSelector("#classOverview table", { timeout: 15000 });
  await expect(page.locator("#classOverview")).toBeVisible();
  // Verify the Niveau column header is present
  await expect(page.locator("#classOverview")).toContainText("Niveau");
});
