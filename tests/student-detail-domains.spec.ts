/**
 * Section 96 — Domain Focus Editor: student-detail.html auth guards
 *
 * Full interaction tests (save/reset RPC calls) require a teacher test
 * account which is not yet configured in the test environment. These tests
 * cover the auth guard — the only paths exercisable without teacher credentials.
 */
import { test, expect } from '@playwright/test';

const PROD = 'https://den-seje-app-frontend.vercel.app';
const STUDENT_EMAIL    = process.env.TEST_STUDENT_EMAIL!;
const STUDENT_PASSWORD = process.env.TEST_STUDENT_PASSWORD!;

test.describe('student-detail.html — auth guards', () => {

  test('1. Unauthenticated access redirects to login', async ({ page }) => {
    await page.goto(`${PROD}/student-detail.html?id=00000000-0000-0000-0000-000000000000`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForURL(`${PROD}/login.html`, { timeout: 10000 });
    await expect(page).toHaveURL(`${PROD}/login.html`);
  });

  test('2. Student role (non-teacher) access redirects to login', async ({ page }) => {
    // Log in as the student account
    await page.goto(`${PROD}/login.html`, { waitUntil: 'domcontentloaded' });
    await page.fill('#email', STUDENT_EMAIL);
    await page.fill('#password', STUDENT_PASSWORD);
    await page.locator('#loginBtn').click();
    await page.waitForURL(`${PROD}/index.html`, { timeout: 20000 });

    // Navigate to student-detail as a student (not teacher) — must redirect
    await page.goto(`${PROD}/student-detail.html?id=00000000-0000-0000-0000-000000000000`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForURL(`${PROD}/login.html`, { timeout: 10000 });
    await expect(page).toHaveURL(`${PROD}/login.html`);
  });

});
