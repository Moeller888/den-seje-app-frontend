// Section 134, changed by D-356: end-to-end verification of how a pupil's starting band is chosen.
// There is no start test any more. Exercises: new pupil → quiz at the grade's start band; a band from
// the old test is still honoured; current_band is persisted and then wins on the next login.
// Requires Section 132 RLS fix (profiles_self_update policy) to pass.

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import * as path from 'path';
import { findAuthUserByEmail, PROD, serveCheckoutLogin } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL             = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STUDENT_EMAIL  = process.env.TEST_STUDENT_EMAIL!;
const STUDENT_PASS   = process.env.TEST_STUDENT_PASSWORD!;

// Edge Function cold starts can take up to ~18s; Firefox adds ~20-50% overhead.
// 30s gives adequate margin without masking genuine hangs.
const QUESTION_READY_TIMEOUT = 30_000;

let adminClient: ReturnType<typeof createClient>;
let studentId: string;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loginStudent(page: any): Promise<void> {
  await serveCheckoutLogin(page);
  await page.goto(`${PROD}/login.html`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', STUDENT_EMAIL);
  await page.fill('#password', STUDENT_PASS);
  await page.locator('#loginBtn').click();
  await page.waitForURL(`${PROD}/hub.html`, { timeout: 20000 });
  // A pupil always lands on the Hub; the quiz is one step further (Spil -> index.html).
  await page.goto(`${PROD}/index.html`, { waitUntil: "domcontentloaded" });
}

// Records what the page asks the backend for. Must be called before loginStudent.
function watchQuizStart(page: any) {
  const seen = { placementStarted: false, firstBand: null as number | null };
  page.on('request', (req: any) => {
    if (req.url().includes('/rpc/start_placement')) seen.placementStarted = true;
    if (seen.firstBand === null && req.method() === 'POST' && req.url().includes('/functions/v1/get-next-question')) {
      seen.firstBand = req.postDataJSON()?.current_difficulty_band ?? null;
    }
  });
  return seen;
}

// Answer one quiz question and wait for the NEXT question to be ready.
async function answerAndAdvance(page: any): Promise<void> {
  await page.waitForSelector('#question[data-state="ready"]', { timeout: 15000 });
  await page.locator('#options button').first().click();

  await page.waitForFunction(
    () => {
      const fb = document.getElementById('feedback');
      const rc = document.getElementById('reflection-continue');
      const hasFeedback = (fb?.textContent ?? '').trim().length > 0;
      const hasReflection = (rc as HTMLElement)?.style.display === 'block';
      return hasFeedback || hasReflection;
    },
    { timeout: 15000 }
  );

  await page.waitForFunction(
    () => {
      const q = document.getElementById('question');
      if (q && (q as HTMLElement).dataset.state === 'ready') return true;
      const rc = document.getElementById('reflection-continue') as HTMLElement;
      if (rc?.style.display === 'block') rc.click();
      return false;
    },
    { timeout: 30000, polling: 500 }
  );
}

// ── Execution mode ───────────────────────────────────────────────────────────
// These tests form a chain: test 2 sets placement_band, test 3 writes the current_band that test 4
// reads. beforeAll deliberately clears those columns to establish the new-pupil starting point.
//
// Without serial mode that chain is not retry-safe: Playwright restarts the worker after a failure,
// beforeAll runs again and the columns a later test depends on are gone. One genuine failure turned
// into six red results that way (run 31106350724).
//
// Serial mode retries the group as a whole from test 1, so the chain is always rebuilt in order
// before the test that depends on it runs.
test.describe.configure({ mode: 'serial' });

// ── Setup / Teardown ──────────────────────────────────────────────────────────

test.beforeAll(async () => {
  adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const user = await findAuthUserByEmail(adminClient, STUDENT_EMAIL);
  if (!user) throw new Error(`Test student not found: ${STUDENT_EMAIL}`);
  studentId = user.id;

  // New-pupil preconditions: grade set, no band data, no instances.
  await adminClient.from('profiles').update({
    selected_grade: 7,
    placement_band: null,
    current_band:   null,
    active_domains: null,
  }).eq('id', studentId);

  await adminClient.from('question_instances').delete().eq('student_id', studentId);
});

test.afterAll(async () => {
  // Restore global-setup baseline so subsequent specs run correctly.
  await adminClient.from('question_instances').delete().eq('student_id', studentId);
  await adminClient.from('profiles').update({
    selected_grade: 9,
    placement_band: 2,
    current_band:   null,
    active_domains: null,
  }).eq('id', studentId);
});

// ── Tests ────────────────────────────────────────────────────────────────────

test('1. New pupil goes straight to the quiz at the grade start band', async ({ page }) => {
  // login + question load in Firefox requires more than the 30s default.
  test.setTimeout(60_000);

  const seen = watchQuizStart(page);
  await loginStudent(page);
  await page.waitForSelector('#question[data-state="ready"]', { timeout: QUESTION_READY_TIMEOUT });

  await expect(page.locator('#placement-overlay')).not.toBeVisible();
  expect(seen.placementStarted, 'the start test must not be started').toBe(false);
  // GRADE_START_BAND[7] in app.js.
  expect(seen.firstBand, 'grade 7 starts at band 1').toBe(1);

  const { data } = await adminClient
    .from('profiles')
    .select('placement_band')
    .eq('id', studentId)
    .maybeSingle();

  expect(data?.placement_band, 'nothing may write a placement band').toBeNull();
});

test('2. A band from the old start test is still honoured', async ({ page }) => {
  // login + question load in Firefox requires more than the 30s default.
  test.setTimeout(60_000);

  await adminClient.from('profiles').update({ placement_band: 3 }).eq('id', studentId);

  const seen = watchQuizStart(page);
  await loginStudent(page);
  await page.waitForSelector('#question[data-state="ready"]', { timeout: QUESTION_READY_TIMEOUT });

  await expect(page.locator('#placement-overlay')).not.toBeVisible();
  expect(seen.placementStarted, 'the start test must not be started').toBe(false);
  expect(seen.firstBand, 'the quiz starts at the placement band').toBe(3);
});

test('3. 10 answered questions triggers current_band persistence', async ({ page }) => {
  // 10 question cycles take ~40-80s depending on browser/network — extend timeout.
  test.setTimeout(120_000);

  // Clean slate for this session: keep placement_band, reset current_band + instances
  await adminClient.from('question_instances').delete().eq('student_id', studentId);
  await adminClient.from('profiles').update({ current_band: null }).eq('id', studentId);

  await loginStudent(page);
  await page.waitForSelector('#question[data-state="ready"]', { timeout: QUESTION_READY_TIMEOUT });

  // Answer 10 questions — persistCurrentBand() fires after the 10th.
  for (let i = 0; i < 10; i++) {
    await answerAndAdvance(page);
  }
  // After answerAndAdvance × 10, question 11 is in ready state.
  // persistCurrentBand() (fire-and-forget) was called during question 10 processing;
  // by the time q11 is loaded the async DB write is complete.

  const { data } = await adminClient
    .from('profiles')
    .select('current_band')
    .eq('id', studentId)
    .maybeSingle();

  expect(data?.current_band, 'current_band must be written after 10 questions').not.toBeNull();
  expect(data?.current_band).toBeGreaterThanOrEqual(1);
  expect(data?.current_band).toBeLessThanOrEqual(5);
});

test('4. Next login uses current_band', async ({ page }) => {
  // login + question load in Firefox requires more than the 30s default.
  test.setTimeout(60_000);

  const seen = watchQuizStart(page);
  await loginStudent(page);
  await page.waitForSelector('#question[data-state="ready"]', { timeout: QUESTION_READY_TIMEOUT });
  await expect(page.locator('#placement-overlay')).not.toBeVisible();
  expect(seen.placementStarted, 'the start test must not be started').toBe(false);

  // DB check: verify both bands persisted by this point
  const { data } = await adminClient
    .from('profiles')
    .select('placement_band, current_band')
    .eq('id', studentId)
    .maybeSingle();

  expect(data?.placement_band, 'placement_band must be set from test 2').not.toBeNull();
  expect(data?.current_band, 'current_band must be set from test 3').not.toBeNull();
  expect(seen.firstBand, 'the earned band wins over the placement band').toBe(data?.current_band);
});
