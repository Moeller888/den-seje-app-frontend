// The quiz's empty state: what the pupil sees when get-next-question answers {step:"no_questions"}.
//
// This used to provoke that answer for real, by giving the test pupil an answered instance of
// every question in the database. That scenario no longer ends in no_questions: since the repeat
// fallback (migration 20261002000000), a pupil who has answered everything is served a repeat of
// an earlier question instead. The empty state still exists — for example when no repeat is
// eligible, or for a teacher's assignment with nothing left — so the UI for it is still tested,
// but the backend contract is now intercepted rather than produced from the production pool.
//
// The test therefore depends on the frontend and on the {step:"no_questions"} contract only, not
// on how many questions production holds or which of them the pupil has answered.

import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import * as path from 'path';
import { PROD } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const TEST_STUDENT_EMAIL = process.env.TEST_STUDENT_EMAIL!;

// The Edge Function is on another origin than the page, so the intercepted answer carries the
// CORS headers the real function sends — otherwise Firefox and WebKit reject it as a CORS failure.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
};

test('Shows empty state when no questions are available', async ({ page }) => {
  // Every request to get-next-question the page makes, and every one the intercept answered.
  // They must match: a call that escaped the intercept would make the result depend on the
  // production question pool again.
  const requested: string[] = [];
  const answered: string[] = [];

  page.on('request', (request: any) => {
    if (request.url().includes('/functions/v1/get-next-question') && request.method() !== 'OPTIONS') {
      requested.push(request.url());
    }
  });

  // Registered before navigation, so the very first load is covered.
  await page.route('**/functions/v1/get-next-question', async (route: any) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    answered.push(request.url());
    await route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify({ step: 'no_questions' }),
    });
  });

  await page.goto(`${PROD}/login.html`);

  await page.fill('input[type="email"]', TEST_STUDENT_EMAIL);
  await page.fill('input[type="password"]', process.env.TEST_STUDENT_PASSWORD!);
  await page.click('button');

  // logout-btn is intentionally hidden in the mobile redesign — wait for the question element directly
  const question = page.locator('#question');

  // 20s: a cold backend can take many seconds when the suite has been idle. The value was
  // calibrated on the previous host and is left unchanged — see mobile-ux-validation.spec.ts.
  await expect(question).toHaveAttribute('data-state', /loading|empty/, { timeout: 20000 });

  await expect(question).toHaveAttribute('data-state', 'empty', { timeout: 20000 });

  await expect(question).toContainText(/ingen flere spørgsmål/i);

  // The empty state must be the frontend's answer to the intercepted contract.
  expect(answered.length, 'get-next-question must have been answered by the intercept').toBeGreaterThan(0);
  expect(requested, 'every get-next-question call must have been answered by the intercept').toEqual(answered);
});
