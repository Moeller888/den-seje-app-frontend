// Section 138: Live classroom engagement panel tests.
// The engagement panel is the first box on teacher.html; it shows per-student
// activity counts for today / this week plus quick insights.

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
} from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SUPABASE_URL              = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient>;
let student2Id: string;
// Three question slots for tests that insert multiple instances
let questions: Array<{ id: string; correct_answer: string; difficulty_at_time: number }>;

test.beforeAll(async () => {
  adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: usersData } = await adminClient.auth.admin.listUsers();
  const s2 = (usersData?.users ?? []).find((u) => u.email === STUDENT2_EMAIL);
  if (!s2) throw new Error(`student2 not found: ${STUDENT2_EMAIL}`);
  student2Id = s2.id;

  // Fetch 3 distinct question IDs — unique constraint (student_id, question_id)
  // means we can only insert one instance per question per student.
  // correct_answer, difficulty_at_time, mastery_snapshot are NOT NULL.
  const { data: qs } = await adminClient
    .from("questions")
    .select("id, difficulty_band, content")
    .eq("is_active", true)
    .limit(3);
  if (!qs || qs.length < 3) throw new Error("Need at least 3 active questions");
  questions = qs.map((q) => {
    const raw = q.content;
    return {
      id: q.id,
      correct_answer: typeof raw === "string" ? raw : JSON.stringify(raw ?? ""),
      difficulty_at_time: q.difficulty_band ?? 1,
    };
  });

  // Ensure student2 starts with zero activity.
  await adminClient.from("question_instances").delete().eq("student_id", student2Id);
});

test.afterAll(async () => {
  await adminClient.from("question_instances").delete().eq("student_id", student2Id);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test("1. Engagement panel renders with stat cards on teacher dashboard", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await loginAsTeacher(page);

  // Panel must leave the loading state
  await expect(page.locator("#engagement-summary")).not.toContainText(
    "Indlæser...",
    { timeout: 15000 }
  );

  // Four stat cards are rendered
  await expect(page.locator(".stat-card")).toHaveCount(4);

  // Per-student table and insights container are present in the DOM
  await expect(page.locator("#engagement-table")).toBeAttached();
  await expect(page.locator("#engagement-insights")).toBeAttached();
});

test("2. Today count matches DB count for active student", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  // Ensure clean state before inserting
  await adminClient.from("question_instances").delete().eq("student_id", student2Id);

  // Insert 3 answered instances (one per question — unique constraint requires it).
  const now = new Date().toISOString();
  const { error: insertErr } = await adminClient.from("question_instances").insert(
    questions.map((q, i) => ({
      student_id:        student2Id,
      question_id:       q.id,
      answered:          true,
      answered_at:       now,
      is_correct:        i < 2,
      correct_answer:    q.correct_answer,
      difficulty_at_time: q.difficulty_at_time,
      mastery_snapshot:  q.difficulty_at_time,
    }))
  );
  if (insertErr) throw new Error(`test 2 insert failed: ${insertErr.message}`);

  await loginAsTeacher(page);
  await page.waitForSelector("#engagement-table tbody tr", { timeout: 15000 });

  const row = page
    .locator("#engagement-table tbody tr")
    .filter({ hasText: "Test Elev Auto" });
  await expect(row).toBeVisible({ timeout: 5000 });

  // Column 2 (index 2) = "I dag" count
  const todayText = await row.locator("td").nth(2).textContent();
  expect(parseInt(todayText ?? "-1", 10)).toBeGreaterThanOrEqual(3);

  // Summary stat card #eng-today-total must also reflect the count
  const totalText = await page.locator("#eng-today-total").textContent();
  expect(parseInt(totalText ?? "-1", 10)).toBeGreaterThanOrEqual(3);

  // Cleanup
  await adminClient.from("question_instances").delete().eq("student_id", student2Id);
});

test("3. Student with no activity shows zero counts and 'Aldrig'", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  // Guarantee student2 has no instances (cleanup from test 2 + explicit guard)
  await adminClient.from("question_instances").delete().eq("student_id", student2Id);

  await loginAsTeacher(page);
  await page.waitForSelector("#engagement-table tbody tr", { timeout: 15000 });

  const row = page
    .locator("#engagement-table tbody tr")
    .filter({ hasText: "Test Elev Auto" });
  await expect(row).toBeVisible({ timeout: 5000 });

  const todayText  = await row.locator("td").nth(2).textContent();
  const weekText   = await row.locator("td").nth(3).textContent();
  const lastActive = await row.locator("td").nth(4).textContent();

  expect(todayText?.trim()).toBe("0");
  expect(weekText?.trim()).toBe("0");
  expect(lastActive?.trim()).toBe("Aldrig");
});

test("4. Last-active shows recent time for just-active student", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await adminClient.from("question_instances").delete().eq("student_id", student2Id);

  // Insert 1 instance answered right now using the first available question.
  const q   = questions[0];
  const now = new Date().toISOString();
  const { error: insertErr } = await adminClient.from("question_instances").insert([
    { student_id: student2Id, question_id: q.id, answered: true, answered_at: now,
      is_correct: true, correct_answer: q.correct_answer,
      difficulty_at_time: q.difficulty_at_time, mastery_snapshot: q.difficulty_at_time },
  ]);
  if (insertErr) throw new Error(`test 4 insert failed: ${insertErr.message}`);

  await loginAsTeacher(page);
  await page.waitForSelector("#engagement-table tbody tr", { timeout: 15000 });

  const row = page
    .locator("#engagement-table tbody tr")
    .filter({ hasText: "Test Elev Auto" });
  const lastActiveText = await row.locator("td").nth(4).textContent();

  // Must show something meaning "very recently" — not "Aldrig" or a date in the past
  expect(lastActiveText?.trim()).toMatch(/Lige nu|min siden|time|I dag/);

  // The activity dot must be green (active today)
  const dot = row.locator(".activity-dot");
  await expect(dot).toHaveClass(/green/);

  // Cleanup
  await adminClient.from("question_instances").delete().eq("student_id", student2Id);
});

test("5. Existing class overview still renders without regression", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await loginAsTeacher(page);

  // The original class overview table must still render
  await page.waitForSelector("#classOverview td", { timeout: 15000 });
  const overviewText = await page.locator("#classOverview").textContent();
  expect(overviewText?.trim()).not.toBe("Indlæser...");
  expect((overviewText ?? "").length).toBeGreaterThan(10);

  // Both panels coexist — engagement panel also rendered
  await expect(page.locator("#engagement-summary")).not.toContainText("Indlæser...");
});
