// Section 136: Password reset & student self-service tests.
// UI tests use the production page. API tests drive the update flow directly
// via the student's anon-key client — no real email required.

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import * as path from 'path';
import { findAuthUserByEmail } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL             = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Public anon key — already in deployed frontend JS, not a secret.
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqemJlaHdmYWdpd3B3b2RzZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2ODc5OTQsImV4cCI6MjA4NzI2Mzk5NH0.BzepnYLe6Khzqx9vTL3Ifa_zMRgjoGQ9Lw5seaoKMMc';

const PROD            = 'https://den-seje-app-frontend.vercel.app';
const STUDENT_EMAIL   = process.env.TEST_STUDENT_EMAIL!;
const STUDENT_PASS    = process.env.TEST_STUDENT_PASSWORD!;
const TEMP_PASS       = 'TempPass2026!';

let adminClient: ReturnType<typeof createClient>;
let studentId: string;

test.beforeAll(async () => {
  adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // Resolve student ID so afterAll can restore the password by ID.
  const user = await findAuthUserByEmail(adminClient, STUDENT_EMAIL);
  if (!user) throw new Error(`Test student not found: ${STUDENT_EMAIL}`);
  studentId = user.id;
});

test.afterAll(async () => {
  // Restore original password regardless of which tests passed or failed.
  await adminClient.auth.admin.updateUserById(studentId, { password: STUDENT_PASS });
});

// ── UI tests ─────────────────────────────────────────────────────────────────

test('1. "Glemt adgangskode?" link is visible on login page', async ({ page }) => {
  await page.goto(`${PROD}/login.html`, { waitUntil: 'domcontentloaded' });
  const forgotBtn = page.locator('#forgotBtn');
  await expect(forgotBtn).toBeVisible();
  await expect(forgotBtn).toContainText('Glemt adgangskode?');
});

test('2. Clicking the link reveals the reset request form', async ({ page }) => {
  await page.goto(`${PROD}/login.html`, { waitUntil: 'domcontentloaded' });

  // Panel is hidden initially
  await expect(page.locator('#forgot-panel')).not.toBeVisible();

  // Click reveals it
  await page.locator('#forgotBtn').click();
  await expect(page.locator('#forgot-panel')).toBeVisible();
  await expect(page.locator('#reset-email')).toBeVisible();
  await expect(page.locator('#resetRequestBtn')).toBeVisible();
});

test('3. Submitting empty email shows validation error', async ({ page }) => {
  await page.goto(`${PROD}/login.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('#forgotBtn').click();

  // Click without filling email
  await page.locator('#resetRequestBtn').click();

  const msg = page.locator('#reset-message');
  await expect(msg).toBeVisible();
  await expect(msg).toContainText(/skriv/i);
});

test('4. Reset request form handles Supabase response gracefully', async ({ page, browserName }) => {
  // Deduplicate across browsers — the API call is identical in all three;
  // Supabase also rate-limits password reset emails, so only one attempt per run.
  test.skip(browserName !== 'chromium', 'API-call deduplication across browsers');

  await page.goto(`${PROD}/login.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('#forgotBtn').click();
  await page.fill('#reset-email', STUDENT_EMAIL);
  await page.locator('#resetRequestBtn').click();

  // Whether Supabase returns success or a rate-limit/config error, the form
  // must (a) show a non-empty message and (b) re-enable the button.
  // The actual email delivery is an infrastructure concern, not a code concern.
  const msg = page.locator('#reset-message');
  await expect(msg).not.toBeEmpty({ timeout: 10000 });
  await expect(page.locator('#resetRequestBtn')).toBeEnabled();
});

test('5. reset-password.html without a token shows invalid-link message', async ({ page }) => {
  // Direct navigation without a recovery hash → must show invalid section
  await page.goto(`${PROD}/reset-password.html`, { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#invalid-section')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#form-section')).not.toBeVisible();
  await expect(page.locator('#invalid-section')).toContainText(/ugyldig/i);
});

// ── API-level password update tests ──────────────────────────────────────────
// These tests bypass the email flow and directly verify that:
//   - supabase.auth.updateUser() works from a student client
//   - the new password allows login
//   - the old password no longer works

test('6. Student can update own password via Supabase updateUser', async () => {
  // Sign in then call updateUser on the SAME client — updateUser requires an
  // active auth session in the client, not just an Authorization header.
  const studentClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await studentClient.auth.signInWithPassword({
    email: STUDENT_EMAIL,
    password: STUDENT_PASS,
  });
  expect(signInErr, `sign-in failed: ${signInErr?.message}`).toBeNull();

  const { error: updateErr } = await studentClient.auth.updateUser({ password: TEMP_PASS });
  expect(updateErr, `password update failed: ${updateErr?.message}`).toBeNull();
});

test('7. New password allows login', async () => {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: STUDENT_EMAIL,
    password: TEMP_PASS,
  });
  expect(error, 'new password must allow login').toBeNull();
});

test('8. Old password no longer works after update', async () => {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: STUDENT_EMAIL,
    password: STUDENT_PASS,
  });
  expect(error, 'old password must be rejected').not.toBeNull();
  // afterAll restores the original password
});
