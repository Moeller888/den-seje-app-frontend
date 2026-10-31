// H5 PR 4 (D-266, D-273): the quiz page's answer submissions, in a real browser.
//
// Same harness as stav-til.spec.ts: the test pupil logs in for real, the read-only progress/avatar loads
// are real, and BOTH answer-path calls are intercepted — get-next-question serves fixture questions and
// process-event answers as H5 PR 3's process-event would (recorded / replay / refusals / 426 / 500), or
// the connection is cut. No question, instance or answer is created anywhere.
//
// H5 is OFF in the shipped code (js/answer-submission.js: ENABLE_H5_SUBMISSIONS = false, no browser
// override). The "ON" tests flip that constant in the copy THIS TEST serves the browser — an
// interception only a test harness can make — to prove what the code will do once the owner turns it
// on. The "OFF" tests serve the module unchanged.
//
// Runs in the isolated E2E suite (CI, local stack). Chromium only: the behaviour is engine-independent
// JavaScript, and every test logs in.

import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import * as path from 'path';
import { PROD, serveCheckoutLogin } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
dotenv.config({ path: path.resolve(REPO, '.env') });

test.skip(({ browserName }) => browserName !== 'chromium', 'engine-independent; every test logs in');

const KEY = 'laerlig_h5_pending_v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LEGACY_KEYS = ['answer', 'question_instance_id', 'question_shown_at', 'student_id'];
const H5_KEYS = [...LEGACY_KEYS, 'round_no', 'submission_id'].sort();

const MODULE_SRC = readFileSync(path.join(REPO, 'js', 'answer-submission.js'), 'utf8');
const MODULE_ON = MODULE_SRC.replace('export const ENABLE_H5_SUBMISSIONS = false;', 'export const ENABLE_H5_SUBMISSIONS = true;');
if (MODULE_ON === MODULE_SRC) throw new Error('the H5 flag line was not found — the ON harness would test nothing');

const LOCAL_FRONTEND: Record<string, string> = {
  '/index.html': path.join(REPO, 'index.html'),
  '/app.js': path.join(REPO, 'app.js'),
  '/js/answer-input.js': path.join(REPO, 'js', 'answer-input.js'),
  '/js/match-pairs.js': path.join(REPO, 'js', 'match-pairs.js'),
  '/js/flags.js': path.join(REPO, 'js', 'flags.js'),
  '/css/match-pairs.css': path.join(REPO, 'css', 'match-pairs.css'),
};

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
};

const I = (n: number) => `00000000-0000-4000-8000-0000000004${String(n).padStart(2, '0')}`;
const MC = { question_instance_id: I(1), round_no: 1, content: { question: 'H5: Hvad er Frankrigs hovedstad?', options: ['Paris', 'Rom'] }, answer_format: 'mc', answer_type: 'short', metadata: null, wave_phase: 'challenge' };
const TEXT = { question_instance_id: I(2), round_no: 3, content: { question: 'H5: Stav til: blåbær' }, answer_format: 'text', answer_type: 'short', metadata: null, wave_phase: 'challenge' };
const LONG = { question_instance_id: I(3), round_no: 1, content: { question: 'H5: Skriv om din sommer.' }, answer_format: 'text', answer_type: 'long', metadata: null, wave_phase: 'challenge' };
const MATCH = { question_instance_id: I(4), round_no: 2, content: { question: 'H5: Forbind landet med hovedstaden', match: { left: ['Danmark', 'Norge'], right: ['Oslo', 'København'] } }, answer_format: 'match', answer_type: 'short', metadata: null, wave_phase: 'challenge' };
const NO_ROUND = { ...MC, question_instance_id: I(5), round_no: undefined };

const graded = (outcome: string, status = 'correct', round_no = 1) => ({
  status: 200,
  body: { outcome, status, correct_answer: 'Paris', review_text: null, misconception_type: null, round_no, xp_awarded: status === 'correct' ? 10 : 0, coins_awarded: status === 'correct' ? 5 : 0 },
});
const RECORDED = graded('recorded');
const REPLAY = graded('replay');
// The connection is cut. `registered`: the server got it first (the reply is lost on the way back).
type Reply = { status?: number; body?: unknown; cut?: 'before' | 'after' };
const CUT_BEFORE: Reply = { cut: 'before' };
const CUT_AFTER: Reply = { cut: 'after' };

type Opts = { h5: boolean; questions: unknown[]; replies: Reply[]; init?: string };

// Logs the test pupil in with the checked-out quiz page and both answer-path calls intercepted on the
// whole browser context (so a second tab sees the same fixtures).
async function openQuiz(page: any, { h5, questions, replies, init }: Opts) {
  const context = page.context();
  const submitted: any[] = [];      // every process-event request the browser sent
  const registered: any[] = [];     // the ones the "server" registered
  const calls: string[] = [];       // order of answer-path calls
  let served = 0;

  if (init) await context.addInitScript(init);

  await context.route((url: URL) => url.pathname in LOCAL_FRONTEND || url.pathname === '/js/answer-submission.js', async (route: any) => {
    const p = new URL(route.request().url()).pathname;
    const body = p === '/js/answer-submission.js' ? (h5 ? MODULE_ON : MODULE_SRC) : readFileSync(LOCAL_FRONTEND[p], 'utf8');
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8',
        'cache-control': 'no-store',
      },
      body,
    });
  });

  await context.route('**/functions/v1/get-next-question', async (route: any) => {
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS }); return; }
    calls.push('get-next-question');
    const q = served < questions.length ? questions[served] : { step: 'no_questions' };
    served++;
    await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(q) });
  });

  await context.route('**/functions/v1/process-event', async (route: any) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS }); return; }
    calls.push('process-event');
    const body = request.postDataJSON();
    submitted.push(body);
    const reply = replies[Math.min(submitted.length - 1, replies.length - 1)];
    if (reply.cut) {
      if (reply.cut === 'after') registered.push(body);
      await route.abort('failed');
      return;
    }
    if (reply.status === 200) registered.push(body);
    await route.fulfill({ status: reply.status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(reply.body) });
  });

  await serveCheckoutLogin(page);
  await page.goto(`${PROD}/login.html`);
  await page.fill('input[type="email"]', process.env.TEST_STUDENT_EMAIL!);
  await page.fill('input[type="password"]', process.env.TEST_STUDENT_PASSWORD!);
  await page.click('button');
  await page.waitForURL(`${PROD}/hub.html`, { timeout: 20000 });
  await page.goto(`${PROD}/index.html`, { waitUntil: 'domcontentloaded' });
  return { submitted, registered, calls, feedbackLog: () => watchFeedback(page) };
}

// Every text #feedback shows, in order (installed once per document).
async function installFeedbackLog(page: any) {
  await page.evaluate(() => {
    if ((window as any).__feedbackLog) return;
    const el = document.getElementById('feedback')!;
    const log: string[] = ((window as any).__feedbackLog = []);
    new MutationObserver(() => {
      const text = el.textContent ?? '';
      if (text && log[log.length - 1] !== text) log.push(text);
    }).observe(el, { childList: true, characterData: true, subtree: true });
  });
}
async function watchFeedback(page: any): Promise<string[]> {
  return page.evaluate(() => (window as any).__feedbackLog ?? []);
}
async function ready(page: any, question: any) {
  await expect(page.locator('#question')).toHaveAttribute('data-state', 'ready', { timeout: 20000 });
  await expect(page.locator('#question')).toContainText(question.content.question);
  await installFeedbackLog(page);
}
const stored = (page: any) => page.evaluate((k: string) => sessionStorage.getItem(k), KEY);
const option = (page: any, text: string) => page.locator('#options button', { hasText: new RegExp(`^${text}$`) });
const UNCERTAIN = /Forbindelsen svigtede/;

// ── H5 OFF (the shipped default) ─────────────────────────────────────────────────────────────────
test('OFF: the request is exactly the legacy one, nothing is stored, the result shows as before', async ({ page }) => {
  const q = await openQuiz(page, { h5: false, questions: [MC], replies: [RECORDED] });
  await ready(page, MC);
  await option(page, 'Paris').click();
  await expect.poll(() => q.feedbackLog()).toContain('Ja! 🎯');
  expect(q.submitted).toHaveLength(1);
  expect(Object.keys(q.submitted[0]).sort()).toEqual(LEGACY_KEYS);
  expect(await stored(page)).toBeNull();
});

test('OFF: a 500 keeps today\'s message and lets the pupil answer again; only an exact 426 says "update"', async ({ page }) => {
  const q = await openQuiz(page, { h5: false, questions: [MC], replies: [{ status: 500, body: { error: 'boom' } }, { status: 426, body: { outcome: 'client_outdated', error: 'Client outdated' } }] });
  await ready(page, MC);
  await option(page, 'Paris').click();
  await expect(page.locator('#feedback')).toHaveText('⚠️ Fejl ved svar – prøv igen');
  await expect(option(page, 'Paris')).toBeEnabled();
  await option(page, 'Paris').click();
  await expect(page.locator('#feedback')).toHaveText('Lærlig er blevet opdateret. Genindlæs siden for at fortsætte.');
  await expect(page.locator('#reload-page-btn')).toBeVisible();
  await expect(option(page, 'Paris')).toBeDisabled();
  expect(q.submitted.every((b) => Object.keys(b).sort().join() === LEGACY_KEYS.join())).toBe(true);
});

// ── H5 ON (forced in this test only) ─────────────────────────────────────────────────────────────
test('ON: round_no from the question, one UUID per deliberate answer, a double click sends once', async ({ page }) => {
  const q = await openQuiz(page, { h5: true, questions: [MC], replies: [RECORDED] });
  await ready(page, MC);
  const paris = option(page, 'Paris');
  await paris.dblclick();
  await expect.poll(() => q.feedbackLog()).toContain('Ja! 🎯');
  expect(q.submitted).toHaveLength(1);
  expect(Object.keys(q.submitted[0]).sort()).toEqual(H5_KEYS);
  expect(q.submitted[0]).toMatchObject({ question_instance_id: MC.question_instance_id, answer: 'Paris', round_no: 1 });
  expect(q.submitted[0].submission_id).toMatch(UUID);
  expect(await stored(page), 'settled → removed').toBeNull();
});

test('ON: no connection before the server — locked answer, "Send igen" sends the same submission', async ({ page }) => {
  const q = await openQuiz(page, { h5: true, questions: [MC], replies: [CUT_BEFORE, RECORDED] });
  await ready(page, MC);
  await option(page, 'Rom').click();
  await expect(page.locator('#feedback')).toHaveText(UNCERTAIN);
  // Locked: no other option can be chosen under this submission.
  await expect(option(page, 'Paris')).toBeDisabled();
  await expect(option(page, 'Rom')).toBeDisabled();
  const pending = JSON.parse(await stored(page));
  expect(pending).toMatchObject({ answer: 'Rom', round_no: 1, question_instance_id: MC.question_instance_id });
  await page.locator('#h5-retry-btn').click();
  await expect.poll(() => q.feedbackLog()).toContain('Ja! 🎯');
  expect(q.submitted).toHaveLength(2);
  expect(q.submitted[1]).toEqual({ ...q.submitted[0], question_shown_at: q.submitted[1].question_shown_at });
  expect(q.submitted[1].submission_id).toBe(pending.submission_id);
  expect(q.registered).toHaveLength(1);
});

test('ON: registered but the reply is lost — the retry gets the replay, shown once, nothing counted twice', async ({ page }) => {
  const q = await openQuiz(page, { h5: true, questions: [MC], replies: [CUT_AFTER, REPLAY] });
  await ready(page, MC);
  await option(page, 'Paris').click();
  await expect(page.locator('#feedback')).toHaveText(UNCERTAIN);
  await page.locator('#h5-retry-btn').click();
  await expect.poll(() => q.feedbackLog()).toContain('Ja! 🎯');
  await expect.poll(() => q.calls.filter((c) => c === 'get-next-question').length).toBe(2);
  expect((await q.feedbackLog()).filter((t) => t === 'Ja! 🎯')).toHaveLength(1);
  expect(q.submitted[1].submission_id).toBe(q.submitted[0].submission_id);
  expect(await stored(page)).toBeNull();
});

test('ON: reload with an unsettled submission — it is settled FIRST, before any new question', async ({ page }) => {
  const q = await openQuiz(page, { h5: true, questions: [MC, TEXT], replies: [CUT_AFTER, REPLAY] });
  await ready(page, MC);
  await option(page, 'Paris').click();
  await expect(page.locator('#feedback')).toHaveText(UNCERTAIN);
  const pending = JSON.parse(await stored(page));
  const before = q.calls.length;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#question')).toHaveText('Dit sidste svar er registreret: rigtigt! 🎯', { timeout: 20000 });
  expect(q.calls.slice(before), 'process-event before get-next-question').toEqual(['process-event']);
  expect(q.submitted[1]).toMatchObject({ submission_id: pending.submission_id, answer: 'Paris', round_no: 1, question_instance_id: MC.question_instance_id });
  expect(await stored(page)).toBeNull();
  await page.locator('#h5-continue-btn').click();
  await ready(page, TEXT);
});

test('ON: reload while the server is still unreachable — no new question is fetched', async ({ page }) => {
  const q = await openQuiz(page, { h5: true, questions: [MC, TEXT], replies: [CUT_BEFORE, CUT_BEFORE, RECORDED] });
  await ready(page, MC);
  await option(page, 'Paris').click();
  await expect(page.locator('#feedback')).toHaveText(UNCERTAIN);
  const gnqBefore = q.calls.filter((c) => c === 'get-next-question').length;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#question')).toHaveText('Dit sidste svar er ikke afsluttet endnu.', { timeout: 20000 });
  await expect(page.locator('#h5-retry-btn')).toBeVisible();
  expect(q.calls.filter((c) => c === 'get-next-question').length, 'nothing new loaded').toBe(gnqBefore);
  await page.locator('#h5-retry-btn').click();
  await expect(page.locator('#question')).toHaveText('Dit sidste svar er registreret: rigtigt! 🎯');
  expect(new Set(q.submitted.map((b) => b.submission_id)).size).toBe(1);
});

test('ON: the answer cannot be edited while its submission is unsettled', async ({ page }) => {
  const q = await openQuiz(page, { h5: true, questions: [TEXT], replies: [CUT_BEFORE, graded('recorded', 'correct', 3)] });
  await ready(page, TEXT);
  const input = page.locator('#short-answer-input');
  await input.fill('blåbær');
  await input.press('Enter');
  await expect(page.locator('#feedback')).toHaveText(UNCERTAIN);
  await expect(input).toBeDisabled();
  await expect(page.locator('#options .submit-btn:not(#h5-retry-btn)')).toBeDisabled();
  await page.locator('#h5-retry-btn').click();
  await expect.poll(() => q.feedbackLog()).toContain('Ja! 🎯');
  expect(q.submitted.map((b) => [b.answer, b.round_no])).toEqual([['blåbær', 3], ['blåbær', 3]]);
});

for (const [outcome, status, text] of [
  ['round_closed', 409, 'Dette spørgsmål er allerede besvaret. Vi henter et nyt.'],
  ['stale_round', 409, 'Svaret hørte til en tidligere runde. Vi henter et nyt spørgsmål.'],
  ['submission_conflict', 409, 'Svaret kunne ikke registreres. Vi henter et nyt spørgsmål.'],
  ['not_found', 404, 'Spørgsmålet findes ikke længere. Vi henter et nyt.'],
  ['invalid_request', 400, 'Svaret kunne ikke behandles. Vi henter et nyt spørgsmål.'],
] as const) {
  test(`ON: ${status} ${outcome} is a refusal — never shown as right or wrong, the next question follows`, async ({ page }) => {
    const q = await openQuiz(page, { h5: true, questions: [MC, TEXT], replies: [{ status, body: { outcome, error: 'x' } }] });
    await ready(page, MC);
    await option(page, 'Paris').click();
    await expect(page.locator('#feedback')).toHaveText(text);
    await ready(page, TEXT);
    const log = await q.feedbackLog();
    expect(log.some((t) => /Ja!|Ikke helt|Svaret er/.test(t))).toBe(false);
    expect(await stored(page)).toBeNull();
  });
}

test('ON: 500 is uncertain (retry the same submission); 426 says "update"', async ({ page }) => {
  const q = await openQuiz(page, { h5: true, questions: [MC], replies: [{ status: 500, body: { error: 'Could not process answer' } }, { status: 426, body: { outcome: 'client_outdated', error: 'Client outdated' } }] });
  await ready(page, MC);
  await option(page, 'Paris').click();
  await expect(page.locator('#feedback')).toHaveText(UNCERTAIN);
  await page.locator('#h5-retry-btn').click();
  await expect(page.locator('#feedback')).toHaveText('Lærlig er blevet opdateret. Genindlæs siden for at fortsætte.');
  await expect(page.locator('#reload-page-btn')).toBeVisible();
  expect(q.submitted[1].submission_id).toBe(q.submitted[0].submission_id);
  expect(await stored(page)).toBeNull();
});

test('ON: Match par — the connections as JSON with round_no; an incomplete answer is "change it", not a retry', async ({ page }) => {
  const q = await openQuiz(page, { h5: true, questions: [MATCH], replies: [{ status: 400, body: { status: 'invalid', error: 'Forbind alle par, før du sender.' } }, graded('recorded', 'correct', 2)] });
  await ready(page, MATCH);
  const left = (t: string) => page.locator('.match-column-left button.match-item', { hasText: t });
  const right = (t: string) => page.locator('.match-column-right button.match-item', { hasText: t });
  await left('Danmark').click(); await right('København').click();
  await left('Norge').click(); await right('Oslo').click();
  await page.locator('#match-submit').click();
  await expect(page.locator('#feedback')).toHaveText('⚠️ Forbind alle par, før du sender.');
  await expect(page.locator('#h5-retry-btn')).toHaveCount(0);
  expect(await stored(page), 'refused for good: nothing left pending').toBeNull();
  await expect(page.locator('#match-submit')).toBeEnabled();
  await page.locator('#match-submit').click();
  await expect.poll(() => q.feedbackLog()).toContain('Ja! 🎯');
  expect(q.submitted.map((b) => [b.answer, b.round_no])).toEqual([['[[0,1],[1,0]]', 2], ['[[0,1],[1,0]]', 2]]);
  expect(q.submitted[1].submission_id, 'a new deliberate answer after a definite refusal').not.toBe(q.submitted[0].submission_id);
});

test('ON: a long answer keeps the teacher path — legacy request, nothing stored', async ({ page }) => {
  const q = await openQuiz(page, { h5: true, questions: [LONG], replies: [{ status: 200, body: { status: 'pending', correct_answer: null, review_text: null } }] });
  await ready(page, LONG);
  await page.locator('#options textarea').fill(Array.from({ length: 25 }, (_, i) => 'ord' + i).join(' '));
  await page.locator('#options .submit-btn').click();
  await expect.poll(() => q.feedbackLog()).toContain('⏳ Afventer lærerens vurdering');
  expect(Object.keys(q.submitted[0]).sort()).toEqual(LEGACY_KEYS);
  expect(await stored(page)).toBeNull();
});

test('ON: a question without round_no (a backend without H5) is refused locally — no request, no legacy fallback', async ({ page }) => {
  const q = await openQuiz(page, { h5: true, questions: [NO_ROUND], replies: [RECORDED] });
  await ready(page, NO_ROUND);
  await option(page, 'Paris').click();
  await expect(page.locator('#feedback')).toHaveText('⚠️ Spørgsmålet kunne ikke sendes sikkert. Genindlæs siden og prøv igen.');
  expect(q.submitted).toHaveLength(0);
});

test("ON: another pupil's pending submission in this tab is discarded unread", async ({ page }) => {
  const foreign = JSON.stringify({ v: 1, student_id: '99999999-9999-4999-8999-999999999999', question_instance_id: I(9), round_no: 1, submission_id: '6f1c2a9e-4b7d-4e2a-9c3f-0d8b5e7a1c24', answer: 'Paris', created_at: Date.now() });
  const init = `if (location.pathname.endsWith('/index.html')) { try { sessionStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(foreign)}); } catch (e) {} }`;
  const q = await openQuiz(page, { h5: true, questions: [MC], replies: [RECORDED], init });
  await ready(page, MC);
  expect(q.calls[0], 'no recovery call for a foreign submission').toBe('get-next-question');
  expect(q.submitted).toHaveLength(0);
  expect(await stored(page)).toBeNull();
});

test('ON: logout drops the pending submission; back navigation does not bring it back', async ({ page }) => {
  await openQuiz(page, { h5: true, questions: [MC], replies: [CUT_BEFORE] });
  await ready(page, MC);
  await option(page, 'Paris').click();
  await expect(page.locator('#feedback')).toHaveText(UNCERTAIN);
  expect(await stored(page)).not.toBeNull();
  await page.locator('#logout-btn').click();
  await page.waitForURL(/login\.html/);
  expect(await stored(page)).toBeNull();
  await page.goBack();
  await page.waitForURL(/login\.html/, { timeout: 20000 });
  expect(await stored(page)).toBeNull();
});

test('ON: two tabs answering the same round — one is graded, the other is refused, nothing twice', async ({ page }) => {
  const q = await openQuiz(page, { h5: true, questions: [MC, MC], replies: [RECORDED, { status: 409, body: { outcome: 'round_closed', error: 'Round already closed' } }] });
  await ready(page, MC);
  const second = await page.context().newPage();
  await second.goto(`${PROD}/index.html`, { waitUntil: 'domcontentloaded' });
  await ready(second, MC);
  await option(page, 'Paris').click();
  await expect.poll(() => q.feedbackLog()).toContain('Ja! 🎯');
  await option(second, 'Paris').click();
  await expect(second.locator('#feedback')).toHaveText('Dette spørgsmål er allerede besvaret. Vi henter et nyt.');
  expect(q.submitted[1].submission_id).not.toBe(q.submitted[0].submission_id);
  expect(q.registered).toHaveLength(1);
});

test('ON: sessionStorage that refuses writes never blocks answering; the in-page retry still works', async ({ page }) => {
  const init = `(() => { const orig = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) {
    if (this === window.sessionStorage && k === ${JSON.stringify(KEY)}) throw new DOMException('full', 'QuotaExceededError');
    return orig.call(this, k, v); }; })();`;
  const q = await openQuiz(page, { h5: true, questions: [MC], replies: [CUT_AFTER, REPLAY], init });
  await ready(page, MC);
  await option(page, 'Paris').click();
  await expect(page.locator('#feedback')).toHaveText(UNCERTAIN);
  expect(await stored(page)).toBeNull();
  await page.locator('#h5-retry-btn').click();
  await expect.poll(() => q.feedbackLog()).toContain('Ja! 🎯');
  expect(q.submitted[1].submission_id).toBe(q.submitted[0].submission_id);
});
