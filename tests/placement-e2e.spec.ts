// Section 134: End-to-end verification of the adaptive placement lifecycle.
// Exercises: trigger → complete → DB save → skip on second login → current_band persist.
// Requires Section 132 RLS fix (profiles_self_update policy) to pass.

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import * as path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL             = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PROD           = 'https://den-seje-app-frontend.vercel.app';
const STUDENT_EMAIL  = 'christnmoeller@hotmail.com';
const STUDENT_PASS   = 'Cmiciquru5';

// Edge Function cold starts can take up to ~18s; Firefox adds ~20-50% overhead.
// 30s gives adequate margin without masking genuine hangs.
const QUESTION_READY_TIMEOUT = 30_000;

let adminClient: ReturnType<typeof createClient>;
let studentId: string;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loginStudent(page: any): Promise<void> {
  await page.goto(`${PROD}/login.html`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', STUDENT_EMAIL);
  await page.fill('#password', STUDENT_PASS);
  await page.locator('#loginBtn').click();
  await page.waitForURL(`${PROD}/index.html`, { timeout: 20000 });
}

// Click through all 10 placement questions then wait for quiz to load.
async function completePlacementFlow(page: any): Promise<void> {
  // Overlay must already be visible before calling this.
  for (let i = 0; i < 10; i++) {
    await page.waitForSelector(
      '#placement-options .placement-option-btn:not(:disabled)',
      { timeout: 10000 }
    );
    await page.locator('#placement-options .placement-option-btn:not(:disabled)').first().click();
    // After the last click the overlay closes (1100ms delay in app); no new buttons appear.
    // For earlier questions, wait until the next question's buttons are enabled.
    if (i < 9) {
      await page.waitForSelector(
        '#placement-options .placement-option-btn:not(:disabled)',
        { timeout: 6000 }
      );
    }
  }
  // Overlay hides after savePlacementBand + 1100ms delay.
  await page.waitForSelector('#placement-overlay', { state: 'hidden', timeout: 15000 });
  await page.waitForSelector('#question[data-state="ready"]', { timeout: QUESTION_READY_TIMEOUT });
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

// ── Setup / Teardown ──────────────────────────────────────────────────────────

test.beforeAll(async () => {
  adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: users } = await adminClient.auth.admin.listUsers();
  const user = users?.users.find((u: any) => u.email === STUDENT_EMAIL);
  if (!user) throw new Error(`Test student not found: ${STUDENT_EMAIL}`);
  studentId = user.id;

  // Placement preconditions: grade set, no band data, no instances.
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

test('1. Placement overlay appears for unplaced grade-7 student', async ({ page }) => {
  await loginStudent(page);
  // Grade is set, placement_band is null → overlay must appear
  await expect(page.locator('#placement-overlay')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#placement-question')).not.toBeEmpty();
});

test('2. Placement completes and saves placement_band to DB', async ({ page }) => {
  // placement flow + question load in Firefox requires more than the 30s default.
  test.setTimeout(60_000);

  // placement_band is still null (test 1 did not complete the flow)
  await loginStudent(page);
  await page.waitForSelector('#placement-overlay', { state: 'visible', timeout: 15000 });
  await completePlacementFlow(page);

  // Quiz is live
  await expect(page.locator('#question[data-state="ready"]')).toBeVisible();

  // DB must now contain placement_band in [1, 4]
  const { data } = await adminClient
    .from('profiles')
    .select('placement_band')
    .eq('id', studentId)
    .maybeSingle();

  expect(data?.placement_band, 'placement_band must be written to DB').not.toBeNull();
  expect(data?.placement_band).toBeGreaterThanOrEqual(1);
  expect(data?.placement_band).toBeLessThanOrEqual(4);
});

test('3. Second login skips placement (placement_band already set)', async ({ page }) => {
  // login + question load in Firefox requires more than the 30s default.
  test.setTimeout(60_000);

  // placement_band was saved by test 2 — placement must NOT retrigger
  await loginStudent(page);
  await page.waitForSelector('#question[data-state="ready"]', { timeout: QUESTION_READY_TIMEOUT });

  const overlay = page.locator('#placement-overlay');
  // Overlay should never become visible when placement_band is already set
  await expect(overlay).not.toBeVisible();
});

test('4. 10 answered questions triggers current_band persistence', async ({ page }) => {
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

test('5. Third login uses current_band and skips placement', async ({ page }) => {
  // login + question load in Firefox requires more than the 30s default.
  test.setTimeout(60_000);

  // Primary assertion: quiz loads directly — no placement overlay.
  // This holds whether the startup band comes from current_band or placement_band,
  // as long as at least one is set (placement_band was set by test 2).
  await loginStudent(page);
  await page.waitForSelector('#question[data-state="ready"]', { timeout: QUESTION_READY_TIMEOUT });
  await expect(page.locator('#placement-overlay')).not.toBeVisible();

  // DB check: verify both bands persisted by this point
  const { data } = await adminClient
    .from('profiles')
    .select('placement_band, current_band')
    .eq('id', studentId)
    .maybeSingle();

  expect(data?.placement_band, 'placement_band must be set from test 2').not.toBeNull();
  expect(data?.current_band, 'current_band must be set from test 4').not.toBeNull();
});
