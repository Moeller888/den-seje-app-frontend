// "Stav til" — the short typed answer, end to end in the real quiz page.
//
// No production question is created, activated or answered. Both backend calls are intercepted:
// get-next-question serves one fixture question (answer_format "text", answer_type "short") and
// then {step:"no_questions"}; process-event records what the page sends and answers "incorrect"
// with the correct spelling. The pupil login and the read-only progress/avatar loads are real.
//
// The renderer under test is the CHECKED-OUT one. The suite runs against the live site, which
// serves main's frontend until a change is merged, so app.js and js/answer-input.js are served from
// this checkout. After merge the live files are the same bytes, so the overlay changes nothing.

import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import * as path from 'path';
import { PROD } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
dotenv.config({ path: path.resolve(REPO, '.env') });

const LOCAL_FRONTEND: Record<string, string> = {
  '/app.js': path.join(REPO, 'app.js'),
  '/js/answer-input.js': path.join(REPO, 'js', 'answer-input.js'),
};

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
};

const FIXTURE_INSTANCE_ID = '00000000-0000-4000-8000-0000000057a1';
const FIXTURE_QUESTION = {
  question_instance_id: FIXTURE_INSTANCE_ID,
  content: { question: 'Stav til: den blå frugt fra skovbunden', correct: 'blåbær', review_text: null },
  answer_format: 'text',
  answer_type: 'short',
  metadata: null,
  wave_phase: 'challenge',
};

test('Stav til: one-line input, no spelling aids, Enter sends the raw answer', async ({ page }) => {
  const requested: string[] = [];
  const answered: string[] = [];
  const submitted: any[] = [];
  let questionsServed = 0;

  page.on('request', (request: any) => {
    const url = request.url();
    if (request.method() === 'OPTIONS') return;
    if (url.includes('/functions/v1/get-next-question') || url.includes('/functions/v1/process-event')) {
      requested.push(url);
    }
  });

  await page.route((url: URL) => url.pathname in LOCAL_FRONTEND, async (route: any) => {
    const file = LOCAL_FRONTEND[new URL(route.request().url()).pathname];
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' },
      body: readFileSync(file, 'utf8'),
    });
  });

  await page.route('**/functions/v1/get-next-question', async (route: any) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    answered.push(request.url());
    const body = questionsServed === 0 ? FIXTURE_QUESTION : { step: 'no_questions' };
    questionsServed++;
    await route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  });

  await page.route('**/functions/v1/process-event', async (route: any) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    answered.push(request.url());
    submitted.push(request.postDataJSON());
    await route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'incorrect', correct_answer: 'blåbær', review_text: null, misconception_type: null }),
    });
  });

  await page.goto(`${PROD}/login.html`);
  await page.fill('input[type="email"]', process.env.TEST_STUDENT_EMAIL!);
  await page.fill('input[type="password"]', process.env.TEST_STUDENT_PASSWORD!);
  await page.click('button');

  await expect(page.locator('#question')).toHaveAttribute('data-state', 'ready', { timeout: 20000 });
  await expect(page.locator('#question')).toContainText('Stav til');

  // A single-line text field — not the long-answer textarea, not option buttons.
  const input = page.locator('#options input#short-answer-input');
  await expect(input).toBeVisible();
  await expect(page.locator('#options textarea')).toHaveCount(0);
  await expect(input).toHaveAttribute('type', 'text');
  await expect(input).toHaveAttribute('spellcheck', 'false');
  await expect(input).toHaveAttribute('autocorrect', 'off');
  await expect(input).toHaveAttribute('autocapitalize', 'none');
  await expect(input).toHaveAttribute('autocomplete', 'off');
  await expect(input).toHaveAttribute('aria-label', 'Skriv dit svar');
  await expect(input).toBeFocused();
  await expect(page.getByRole('button', { name: 'Send svar' })).toBeVisible();

  // Empty: nothing is sent, the pupil is told why, and the field keeps focus.
  await input.press('Enter');
  await page.getByRole('button', { name: 'Send svar' }).click();
  await expect(page.locator('#short-answer-hint')).toHaveText('Skriv et svar, før du sender.');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(submitted, 'an empty answer must never reach process-event').toHaveLength(0);

  // A typed answer goes out raw on Enter — æ/ø/å, case and spacing exactly as typed.
  await input.fill(' Blåbær ');
  await input.press('Enter');
  await expect.poll(() => submitted.length).toBe(1);
  expect(submitted[0].answer).toBe(' Blåbær ');
  expect(submitted[0].question_instance_id).toBe(FIXTURE_INSTANCE_ID);
  expect(Object.keys(submitted[0]).sort()).toEqual(['answer', 'question_instance_id', 'question_shown_at', 'student_id']);

  // Incorrect: the existing feedback shows the correct spelling from the server.
  await expect(page.locator('#feedback')).toContainText('Svaret er blåbær');

  // The quiz moves on through the normal state machine (here: to the empty state).
  await expect(page.locator('#question')).toHaveAttribute('data-state', 'empty', { timeout: 15000 });

  expect(answered.length).toBeGreaterThan(0);
  expect(requested, 'every backend call must have been answered by the intercept').toEqual(answered);
});
