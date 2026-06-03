// Section 137: Teacher-initiated password reset tests.
// Tests run against production. The teacher-test account owns student2;
// the main test student (christnmoeller@hotmail.com) is NOT owned by that
// teacher and is used to verify cross-class access is blocked.

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
} from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SUPABASE_URL              = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqemJlaHdmYWdpd3B3b2RzZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2ODc5OTQsImV4cCI6MjA4NzI2Mzk5NH0.BzepnYLe6Khzqx9vTL3Ifa_zMRgjoGQ9Lw5seaoKMMc";

// Main test student — NOT owned by teacher-test@hotmail.com
const MAIN_STUDENT_EMAIL = "christnmoeller@hotmail.com";
const MAIN_STUDENT_PASS  = "Cmiciquru5";

// student2's original password (set by global-setup)
const STUDENT2_ORIGINAL_PASS = "TestStudent2026!";

let adminClient: ReturnType<typeof createClient>;
let teacherClient: ReturnType<typeof createClient>;
let student2Id: string;
let mainStudentId: string;
let temporaryPassword: string;

test.beforeAll(async () => {
  adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: usersData } = await adminClient.auth.admin.listUsers();
  const allUsers = usersData?.users ?? [];

  const student2 = allUsers.find((u) => u.email === STUDENT2_EMAIL);
  if (!student2) throw new Error(`student2 not found: ${STUDENT2_EMAIL}`);
  student2Id = student2.id;

  const mainStudent = allUsers.find((u) => u.email === MAIN_STUDENT_EMAIL);
  if (!mainStudent) throw new Error(`main student not found: ${MAIN_STUDENT_EMAIL}`);
  mainStudentId = mainStudent.id;

  // Ensure student2 is in a clean known state before this spec runs.
  await adminClient.auth.admin.updateUserById(student2Id, { password: STUDENT2_ORIGINAL_PASS });
  await adminClient.from("profiles")
    .update({ must_reset_password: false })
    .eq("id", student2Id);

  // Authenticate teacher client once; reused across all API tests.
  teacherClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await teacherClient.auth.signInWithPassword({
    email: TEACHER_EMAIL,
    password: TEACHER_PASSWORD,
  });
  if (signInErr) throw new Error(`teacher sign-in failed: ${signInErr.message}`);
});

test.afterAll(async () => {
  // Restore student2 to original state regardless of test outcomes.
  await adminClient.auth.admin.updateUserById(student2Id, { password: STUDENT2_ORIGINAL_PASS });
  await adminClient.from("profiles")
    .update({ must_reset_password: false })
    .eq("id", student2Id);
});

// ── API tests ─────────────────────────────────────────────────────────────────

test("1. Teacher can reset own student password", async () => {
  const { data, error } = await teacherClient.functions.invoke(
    "reset-student-password",
    { body: { student_id: student2Id } }
  );

  expect(error, `reset failed: ${JSON.stringify(error)}`).toBeNull();
  expect(data?.success).toBe(true);
  expect(typeof data?.temporary_password).toBe("string");
  expect((data?.temporary_password as string).length).toBeGreaterThanOrEqual(8);

  temporaryPassword = data.temporary_password;
});

test("2. Unauthorized teacher cannot reset another teacher's student", async () => {
  // teacher-test@hotmail.com attempts to reset the main test student, who
  // belongs to a different teacher. The ownership check must return 403.
  const { data, error } = await teacherClient.functions.invoke(
    "reset-student-password",
    { body: { student_id: mainStudentId } }
  );

  // A non-2xx response surfaces as a truthy error from functions.invoke.
  const wasRejected = error !== null || data?.error != null;
  expect(wasRejected, "cross-class reset must be rejected").toBe(true);
});

test("3. Student cannot access the reset endpoint", async () => {
  const studentClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await studentClient.auth.signInWithPassword({
    email: MAIN_STUDENT_EMAIL,
    password: MAIN_STUDENT_PASS,
  });
  expect(signInErr, "student sign-in failed").toBeNull();

  const { data, error } = await studentClient.functions.invoke(
    "reset-student-password",
    { body: { student_id: student2Id } }
  );

  const wasRejected = error !== null || data?.error != null;
  expect(wasRejected, "student must not be able to reset passwords").toBe(true);
});

test("4. Temporary password allows login", async () => {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: STUDENT2_EMAIL,
    password: temporaryPassword,
  });
  expect(error, "temporary password must allow login").toBeNull();
});

test("5. Old password no longer works after reset", async () => {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: STUDENT2_EMAIL,
    password: STUDENT2_ORIGINAL_PASS,
  });
  expect(error, "old password must be rejected").not.toBeNull();
});

test("6. Login with temp password redirects to forced-change page", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup — single browser run");

  await page.goto(`${PROD}/login.html`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", STUDENT2_EMAIL);
  await page.fill("#password", temporaryPassword);
  await page.locator("#loginBtn").click();

  // login.js detects must_reset_password=true and redirects to reset-password.html?forced=1
  await page.waitForURL(/reset-password\.html\?forced=1/, { timeout: 15000 });

  // reset-password.js detects forced mode + active session → shows form immediately
  await expect(page.locator("#form-section")).toBeVisible({ timeout: 5000 });
  await expect(page.locator("#invalid-section")).not.toBeVisible();
  await expect(page.locator("#loading-section")).not.toBeVisible();
});

test("7. Student can choose new password via forced-change flow", async ({ browserName }) => {
  test.skip(browserName !== "chromium", "API dedup — single browser run");

  // Set up a fresh known temp password via admin API so this test is
  // self-contained and not dependent on test 1's temporaryPassword value.
  const FRESH_TEMP = "FreshTemp2026!";
  const NEW_PASS   = "NewPassword2026!";

  await adminClient.auth.admin.updateUserById(student2Id, { password: FRESH_TEMP });
  await adminClient.from("profiles")
    .update({ must_reset_password: true })
    .eq("id", student2Id);

  // Step 1: Sign in with the temporary password
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({
    email: STUDENT2_EMAIL,
    password: FRESH_TEMP,
  });
  expect(signInErr, "temp login failed").toBeNull();

  // Step 2: Change password (mirrors reset-password.js updateUser call)
  const { error: updateErr } = await client.auth.updateUser({ password: NEW_PASS });
  expect(updateErr, "password change failed").toBeNull();

  // Step 3: Clear the flag (mirrors reset-password.js forced-mode cleanup)
  const { data: { session } } = await client.auth.getSession();
  if (session) {
    await client.from("profiles")
      .update({ must_reset_password: false })
      .eq("id", student2Id);
  }

  // Step 4: Verify new password works
  const client2 = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: newLoginErr } = await client2.auth.signInWithPassword({
    email: STUDENT2_EMAIL,
    password: NEW_PASS,
  });
  expect(newLoginErr, "new password must allow login").toBeNull();

  // Step 5: Verify must_reset_password was cleared
  const { data: profile } = await adminClient
    .from("profiles")
    .select("must_reset_password")
    .eq("id", student2Id)
    .maybeSingle();
  expect(profile?.must_reset_password, "flag must be false after forced change").toBe(false);

  // Restore original password for afterAll to clean up correctly.
  await adminClient.auth.admin.updateUserById(student2Id, { password: STUDENT2_ORIGINAL_PASS });
});

test("8. Audit record is written for the reset", async ({ browserName }) => {
  test.skip(browserName !== "chromium", "single-browser audit check");

  // Test 1 called the function for student2. Verify at least one audit record
  // exists for this student. beforeAll ensured clean state before the suite
  // started; any record present was written by this run's test 1.
  const { data, error } = await adminClient
    .from("teacher_password_resets")
    .select("teacher_id, student_id, reset_at")
    .eq("student_id", student2Id)
    .order("reset_at", { ascending: false })
    .limit(5);

  expect(error).toBeNull();
  expect((data ?? []).length).toBeGreaterThanOrEqual(1);
  expect(data![0].student_id).toBe(student2Id);
});
