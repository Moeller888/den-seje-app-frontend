// "Stav til" — the short typed answer, end to end in the real quiz page.
//
// No production question is created, activated or answered. Both backend calls are intercepted:
// get-next-question serves one fixture question shaped EXACTLY like the public question DTO that
// get-next-question v174 sends (supabase/functions/_shared/question-dto.ts: content carries only the
// display fields — no `correct`, no `accepted_answers`, no `review_text`), then {step:"no_questions"};
// process-event records what the page sends and answers as the server would AFTER grading. The pupil
// login and the read-only progress/avatar loads are real.
//
// The renderer under test is the CHECKED-OUT one. The suite runs against the live site, which
// serves main's frontend until a change is merged, so app.js and js/answer-input.js are served from
// this checkout — and so is index.html, whose #feedback / #review-feedback live regions are part of
// the change. After merge the live files are the same bytes, so the overlay changes nothing.
// Every module app.js imports that may be new in the checkout is overlaid too: a module that is not
// live yet (js/match-pairs.js before Match par is merged) would otherwise 404 and stop app.js loading.

import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import * as path from 'path';
import { PROD, serveCheckoutLogin } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
dotenv.config({ path: path.resolve(REPO, '.env') });

const LOCAL_FRONTEND: Record<string, string> = {
  '/index.html': path.join(REPO, 'index.html'),
  '/app.js': path.join(REPO, 'app.js'),
  '/js/answer-input.js': path.join(REPO, 'js', 'answer-input.js'),
  '/js/match-pairs.js': path.join(REPO, 'js', 'match-pairs.js'),
  '/js/answer-submission.js': path.join(REPO, 'js', 'answer-submission.js'),
  '/css/match-pairs.css': path.join(REPO, 'css', 'match-pairs.css'),
};

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
};

const FIXTURE_INSTANCE_ID = '00000000-0000-4000-8000-0000000057a1';
const CORRECT_SPELLING = 'blåbær';
// The public DTO: display fields only. The key exists only in the process-event answer below.
const FIXTURE_QUESTION = {
  question_instance_id: FIXTURE_INSTANCE_ID,
  content: { question: 'Stav til: den blå frugt fra skovbunden' },
  answer_format: 'text',
  answer_type: 'short',
  metadata: null,
  wave_phase: 'challenge',
};
const PUBLIC_CONTENT_KEYS = ['question', 'options', 'type', 'force_text'];

// `gate`: the reply is held until the test resolves it, so "while pending" is a state the test
// controls — never a race against a timer.
type Reply = { status: number; body: unknown; gate?: Promise<void> };

// Logs the test pupil in with the checked-out renderer and both backend calls intercepted.
// `replies` are the process-event answers in order (the last one repeats).
async function openStavTil(page: any, replies: Reply[], question: unknown = FIXTURE_QUESTION) {
  const submitted: any[] = [];
  const unanswered: string[] = [];
  let questionsServed = 0;

  page.on('request', (request: any) => {
    const url = request.url();
    if (request.method() === 'OPTIONS') return;
    if (url.includes('/rest/v1/questions')) unanswered.push(`direct questions read: ${url}`);
  });

  await page.route((url: URL) => url.pathname in LOCAL_FRONTEND, async (route: any) => {
    const file = LOCAL_FRONTEND[new URL(route.request().url()).pathname];
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': file.endsWith('.html') ? 'text/html; charset=utf-8'
          : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8',
        'cache-control': 'no-store',
      },
      body: readFileSync(file, 'utf8'),
    });
  });

  await page.route('**/functions/v1/get-next-question', async (route: any) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const body = questionsServed === 0 ? question : { step: 'no_questions' };
    questionsServed++;
    await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  });

  await page.route('**/functions/v1/process-event', async (route: any) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    submitted.push(request.postDataJSON());
    const reply = replies[Math.min(submitted.length - 1, replies.length - 1)];
    if (reply.gate) await reply.gate;
    await route.fulfill({
      status: reply.status,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify(reply.body),
    });
  });

  await serveCheckoutLogin(page);
  await page.goto(`${PROD}/login.html`);
  await page.fill('input[type="email"]', process.env.TEST_STUDENT_EMAIL!);
  await page.fill('input[type="password"]', process.env.TEST_STUDENT_PASSWORD!);
  await page.click('button');
  // A pupil always lands on the Hub after login; the quiz is one step further (Spil -> index.html).
  await page.waitForURL(`${PROD}/hub.html`, { timeout: 20000 });
  await page.goto(`${PROD}/index.html`, { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#question')).toHaveAttribute('data-state', 'ready', { timeout: 20000 });
  await expect(page.locator('#question')).toContainText(String((question as any).content.question));

  // Every text #feedback shows, in order. "Ja!" is on screen only until the next question loads, so
  // the test reads this log instead of racing the transition.
  await page.evaluate(() => {
    const el = document.getElementById('feedback')!;
    const log: string[] = ((window as any).__feedbackLog = []);
    new MutationObserver(() => {
      const text = el.textContent ?? '';
      if (text && log[log.length - 1] !== text) log.push(text);
    }).observe(el, { childList: true, characterData: true, subtree: true });
  });
  const feedbackLog = () => page.evaluate(() => (window as any).__feedbackLog as string[]);
  return { submitted, unanswered, feedbackLog, input: page.locator('#options input#short-answer-input') };
}

const INCORRECT = { status: 200, body: { status: 'incorrect', correct_answer: CORRECT_SPELLING, review_text: null, misconception_type: null } };
const CORRECT = { status: 200, body: { status: 'correct', correct_answer: CORRECT_SPELLING, review_text: null, misconception_type: null } };

test('Stav til: one-line input, no spelling aids, no key before answering, Enter sends the raw answer', async ({ page }) => {
  expect(Object.keys(FIXTURE_QUESTION.content).every((k) => PUBLIC_CONTENT_KEYS.includes(k)),
    'the fixture must be the public DTO').toBe(true);

  const { submitted, unanswered, feedbackLog, input } = await openStavTil(page, [INCORRECT]);

  // A single-line text field — not the long-answer textarea, not option buttons.
  await expect(input).toBeVisible();
  await expect(page.locator('#options textarea')).toHaveCount(0);
  await expect(input).toHaveAttribute('type', 'text');
  await expect(input).toHaveAttribute('spellcheck', 'false');
  await expect(input).toHaveAttribute('autocorrect', 'off');
  await expect(input).toHaveAttribute('autocapitalize', 'none');
  await expect(input).toHaveAttribute('autocomplete', 'off');
  await expect(input).toHaveAttribute('aria-label', 'Skriv dit svar');
  await expect(input).toHaveAttribute('maxlength', '100');
  await expect(input).toHaveAttribute('placeholder', 'Skriv dit svar her');
  await expect(input).toBeFocused();
  await expect(page.getByRole('button', { name: 'Send svar' })).toBeVisible();

  // Nothing on the page knows the answer before the pupil has answered.
  expect((await page.content()).toLowerCase()).not.toContain(CORRECT_SPELLING);

  // Empty: nothing is sent, the pupil is told why, and the field keeps focus.
  await input.press('Enter');
  await page.getByRole('button', { name: 'Send svar' }).click();
  await expect(page.locator('#short-answer-hint')).toHaveText('Skriv et svar, før du sender.');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(submitted, 'an empty answer must never reach process-event').toHaveLength(0);

  // Typing clears the error at once.
  await input.pressSequentially('B');
  await expect(page.locator('#short-answer-hint')).toHaveText('');

  // A typed answer goes out raw on Enter — æ/ø/å, case and spacing exactly as typed.
  await input.fill(' Blåbær ');
  await input.press('Enter');
  await expect.poll(() => submitted.length).toBe(1);
  expect(submitted[0].answer).toBe(' Blåbær ');
  expect(submitted[0].question_instance_id).toBe(FIXTURE_INSTANCE_ID);
  expect(Object.keys(submitted[0]).sort()).toEqual(['answer', 'question_instance_id', 'question_shown_at', 'student_id']);

  // Incorrect: the correct spelling appears only now, from the server's graded answer.
  await expect.poll(feedbackLog).toContainEqual(`Svaret er ${CORRECT_SPELLING} — husk det nu.`);

  // The quiz moves on through the normal state machine (here: to the empty state).
  await expect(page.locator('#question')).toHaveAttribute('data-state', 'empty', { timeout: 15000 });
  expect(unanswered, 'the page never reads the question bank directly').toEqual([]);
});

test('Stav til: a correct answer is confirmed once — double Enter/click while pending sends nothing more', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const { submitted, feedbackLog, input } = await openStavTil(page, [{ ...CORRECT, gate }]);

  await input.fill('blåbær');
  await input.press('Enter');
  await input.press('Enter');
  await page.getByRole('button', { name: 'Send svar' }).click({ force: true });

  // While the answer is on its way the field is locked and busy, and the button is disabled.
  await expect(input).toHaveAttribute('aria-busy', 'true');
  expect(await input.evaluate((el: HTMLInputElement) => el.readOnly)).toBe(true);
  await expect(page.getByRole('button', { name: 'Send svar' })).toBeDisabled();
  await expect.poll(() => submitted.length, { message: 'exactly one request while pending' }).toBe(1);

  // The server answers; the pupil sees the confirmation.
  const classWhenConfirmed = page.waitForFunction(() => {
    const el = document.getElementById('feedback');
    return el && (el.textContent ?? '').includes('Ja!') ? el.className : null;
  });
  release();
  expect(await (await classWhenConfirmed).jsonValue()).toBe('feedback-correct');
  await expect.poll(feedbackLog).toContainEqual('Ja! 🎯');
  expect(submitted, 'exactly one request for one answer').toHaveLength(1);
  await expect(page.locator('#question')).toHaveAttribute('data-state', 'empty', { timeout: 15000 });
  expect(submitted).toHaveLength(1);
});

test('Stav til: a server error hands the answer back — text kept, field focused, Enter retries', async ({ page }) => {
  const { submitted, feedbackLog, input } = await openStavTil(page, [{ status: 500, body: { error: 'boom' } }, CORRECT]);

  await input.fill('Blåbær');
  await input.press('Enter');

  await expect(page.locator('#feedback')).toContainText('Fejl ved svar');
  await expect(input).toHaveValue('Blåbær');
  await expect(input).toBeFocused();
  expect(await input.evaluate((el: HTMLInputElement) => el.readOnly)).toBe(false);
  await expect(page.getByRole('button', { name: 'Send svar' })).toBeEnabled();

  await input.press('Enter');
  await expect.poll(feedbackLog).toContainEqual('Ja! 🎯');
  expect(submitted.map((s) => s.answer)).toEqual(['Blåbær', 'Blåbær']);
});

test('Stav til on a phone: the field and button fit, the font does not trigger zoom', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { input } = await openStavTil(page, [INCORRECT]);

  await expect(input).toBeVisible();
  const field = await input.boundingBox();
  const button = await page.getByRole('button', { name: 'Send svar' }).boundingBox();
  expect(field && button, 'both are laid out').toBeTruthy();
  expect(field!.x).toBeGreaterThanOrEqual(0);
  expect(field!.x + field!.width).toBeLessThanOrEqual(390);
  expect(button!.x + button!.width).toBeLessThanOrEqual(390);
  expect(button!.height, 'a comfortable touch target').toBeGreaterThanOrEqual(40);
  const fontSize = await input.evaluate((el: Element) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontSize, 'iOS zooms into inputs below 16px').toBeGreaterThanOrEqual(16);

  await testInfo.attach('stav-til-mobile', { body: await page.screenshot({ fullPage: false }), contentType: 'image/png' });
});

// The two live "stav til" questions both carry a review_text, so an incorrect answer takes the
// reflection path, not "Svaret er …". This mirrors Polen (b88f169a…) exactly: the public DTO the
// browser receives, and the graded process-event answer with the live review_text
// (supabase/migrations/20261011094747_stav_til_first_questions.sql).
const POLEN_QUESTION = {
  question_instance_id: FIXTURE_INSTANCE_ID,
  content: { question: 'Hvilket land invaderede Tyskland 1. september 1939?' },
  answer_format: 'text',
  answer_type: 'short',
  metadata: null,
  wave_phase: 'challenge',
};
const POLEN_REVIEW_TEXT = 'Tyskland angreb Polen den 1. september 1939. To dage senere erklærede Storbritannien og '
  + 'Frankrig Tyskland krig – det var starten på Anden Verdenskrig.';
const POLEN_INCORRECT = {
  status: 200,
  body: { status: 'incorrect', correct_answer: 'Polen', review_text: POLEN_REVIEW_TEXT, misconception_type: null },
};

test('Stav til with review_text (as live): the spelling, what was typed and the explanation — then Videre by keyboard', async ({ page }, testInfo) => {
  expect(Object.keys(POLEN_QUESTION.content).every((k) => PUBLIC_CONTENT_KEYS.includes(k)),
    'the fixture must be the public DTO').toBe(true);
  const { submitted, input } = await openStavTil(page, [POLEN_INCORRECT], POLEN_QUESTION);

  // Before answering, neither the key nor the explanation is on the page.
  const before = await page.content();
  expect(before).not.toContain('Polen');
  expect(before).not.toContain('Anden Verdenskrig');

  await input.fill('Pølen');
  await input.press('Enter');
  await expect.poll(() => submitted.length).toBe(1);
  expect(submitted[0].answer).toBe('Pølen');

  // Reflection: the correct spelling and the pupil's own attempt stay visible above the explanation,
  // in the announced status region; the explanation is in its own live region.
  await expect(page.locator('#question')).toHaveAttribute('data-state', 'reflecting');
  await expect(page.locator('#feedback')).toHaveText('Det staves: Polen — du skrev: Pølen');
  await expect(page.locator('#feedback')).toHaveAttribute('role', 'status');
  await expect(page.locator('#feedback')).toHaveClass(/feedback-error/);
  await expect(page.locator('#review-feedback')).toBeVisible();
  await expect(page.locator('#review-feedback')).toHaveText(POLEN_REVIEW_TEXT);
  await expect(page.locator('#review-feedback')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#options')).toBeHidden();

  // Not locked: "Videre" gets focus, and the keyboard alone moves the pupil on.
  const videre = page.locator('#reflection-continue');
  await expect(videre).toBeVisible();
  await expect(videre).toBeFocused();
  await testInfo.attach('stav-til-review-text', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await page.keyboard.press('Enter');

  await expect(page.locator('#question')).toHaveAttribute('data-state', 'empty', { timeout: 15000 });
  await expect(page.locator('#review-feedback')).toBeHidden();
  expect(submitted, 'one answer, one request').toHaveLength(1);
});
