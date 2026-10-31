// Section 136: Password reset & student self-service tests.
// UI tests use the production page; the reset form's server call is intercepted in the browser
// (test 4), so no help request and no mail is ever produced. API tests drive the update flow
// directly via the student's anon-key client — no real email required.

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import * as path from 'path';
import { findAuthUserByEmail, PROD, STUDENT_TEMP_PASSWORD, PUBLIC_API_KEY } from './helpers.js';
// The real HTTP contract of request-password-help (pure module: no client, no env, no network).
import { CORS_HEADERS, GENERIC_BODY } from '../supabase/functions/request-password-help/handler.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL             = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Public anon key — already in deployed frontend JS, not a secret.
const SUPABASE_ANON_KEY = PUBLIC_API_KEY;

const STUDENT_EMAIL   = process.env.TEST_STUDENT_EMAIL!;
const STUDENT_PASS    = process.env.TEST_STUDENT_PASSWORD!;
// Derived from TEST_STUDENT_PASSWORD (tests/test-credentials.mjs): never a literal, because tests 6-8
// leave it on the live account until afterAll restores the original.
const TEMP_PASS       = STUDENT_TEMP_PASSWORD;

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

// THE FORM'S SERVER CALL IS INTERCEPTED. Since Section 173 the form posts the typed address to the
// request-password-help Edge Function (js/login.js), and for a STUDENT address that function mails
// the student's teacher. A live call from here would therefore mail a real person on every run —
// this test used to type the test student's address and did exactly that whenever no cooldown row
// happened to exist. The function itself is tested in password-help.spec.ts (api project), behind
// a guard that refuses any call that could reach the mail path.
//
// Here the call is answered inside the browser with the function's own generic body and CORS
// headers (handler.ts), and it never leaves the browser. The intercept is installed before the
// page loads. As a second barrier the typed address is a reserved .invalid one, so even a request
// that somehow escaped could not name a real account. Request data is compared, never printed.
const RESET_FORM_ADDRESS = 'no-such-user-password-reset-form@example.invalid';
const INTERCEPT_MARKER = 'password-reset-spec-test-4';

test('4. Reset request form sends one request and shows the generic answer (call intercepted)', async ({ page }) => {
  const posts: Array<{ method: string; body: unknown }> = [];
  const markers: Array<string | null> = [];

  await page.route('**/functions/v1/request-password-help', async (route: any) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }
    let body: unknown = null;
    try {
      body = request.postDataJSON();
    } catch {
      body = null;
    }
    posts.push({ method: request.method(), body });
    await route.fulfill({
      status: 200,
      headers: { ...CORS_HEADERS, 'content-type': 'application/json', 'x-e2e-intercepted': INTERCEPT_MARKER },
      body: JSON.stringify(GENERIC_BODY),
    });
  });
  // Records where the browser's answer came from: the intercept stamps every answer it produces.
  page.on('response', (response: any) => {
    if (response.url().endsWith('/functions/v1/request-password-help') && response.request().method() !== 'OPTIONS') {
      markers.push(response.headers()['x-e2e-intercepted'] ?? null);
    }
  });

  await page.goto(`${PROD}/login.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('#forgotBtn').click();
  await page.fill('#reset-email', RESET_FORM_ADDRESS);
  await page.locator('#resetRequestBtn').click();

  // The form must actually make the call — a missing request fails here, by name.
  await expect
    .poll(() => posts.length, { message: 'the form must call request-password-help exactly once', timeout: 10000 })
    .toBe(1);
  expect(posts[0].method).toBe('POST');
  expect(
    JSON.stringify(posts[0].body) === JSON.stringify({ email: RESET_FORM_ADDRESS }),
    'the request body must be exactly { email: <the typed address> }',
  ).toBe(true);

  // The UI shows the function's generic answer, re-enables the button and clears the field.
  await expect(page.locator('#reset-message')).toHaveText(GENERIC_BODY.message, { timeout: 10000 });
  await expect(page.locator('#resetRequestBtn')).toBeEnabled();
  await expect(page.locator('#reset-email')).toHaveValue('');

  // And the answer the browser received came from the intercept, not from the server.
  expect(markers, 'every answer must come from the in-browser intercept').toEqual([INTERCEPT_MARKER]);
});

test('5. reset-password.html without a token shows invalid-link message', async ({ page }) => {
  // Direct navigation without a recovery hash → must show invalid section
  await page.goto(`${PROD}/reset-password.html`, { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#invalid-section')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#form-section')).not.toBeVisible();
  await expect(page.locator('#invalid-section')).toContainText(/ugyldig/i);
});

// The recovery-link path was unreachable from the outside for as long as it was broken: no test
// ever opened a URL carrying a recovery fragment, so the page could hang forever on the loading
// section and CI stayed green. These two tests close that hole. They need no mailbox and no real
// token — the point is that the page must always REACH a decision. Before the fix it reached
// none, because the shared client runs with `detectSessionInUrl: false` and PASSWORD_RECOVERY
// never fired; the loading section stayed visible indefinitely and nothing was logged.

test('9. recovery-shaped link with an unusable token resolves instead of hanging', async ({ page }) => {
  await page.goto(
    `${PROD}/reset-password.html#type=recovery&access_token=NOT_A_REAL_TOKEN&refresh_token=NOT_A_REAL_TOKEN`,
    { waitUntil: 'domcontentloaded' },
  );

  // The decision must land well inside this window; the old code never landed at all.
  await expect(page.locator('#invalid-section')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#loading-section')).not.toBeVisible();
  await expect(page.locator('#form-section')).not.toBeVisible();
});

test('10. recovery link without refresh_token resolves instead of hanging', async ({ page }) => {
  // setSession requires both tokens. A half-formed link must fail closed, not spin.
  await page.goto(
    `${PROD}/reset-password.html#type=recovery&access_token=NOT_A_REAL_TOKEN`,
    { waitUntil: 'domcontentloaded' },
  );

  await expect(page.locator('#invalid-section')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#loading-section')).not.toBeVisible();
  await expect(page.locator('#form-section')).not.toBeVisible();
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
