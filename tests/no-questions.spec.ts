import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import * as path from 'path';
import { findAuthUserByEmail, PROD } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TEST_STUDENT_EMAIL = process.env.TEST_STUDENT_EMAIL!;

let studentId: string;

test.beforeAll(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const user = await findAuthUserByEmail(supabase, TEST_STUDENT_EMAIL);

  if (!user) {
    throw new Error('Test student not found');
  }

  studentId = user.id;

  // PostgREST enforces a server-side max_rows cap that client .limit() cannot exceed.
  // Paginate in 1000-row pages so every question gets an instance regardless of total count.
  const allIds: { id: string }[] = [];
  let pageStart = 0;
  const PAGE_SIZE = 1000;

  while (true) {
    const { data: page, error: pageErr } = await supabase
      .from('questions')
      .select('id')
      .range(pageStart, pageStart + PAGE_SIZE - 1);

    if (pageErr) throw new Error(`no-questions setup: questions fetch failed â€” ${pageErr.message}`);
    if (!page || page.length === 0) break;

    allIds.push(...page);
    if (page.length < PAGE_SIZE) break;
    pageStart += PAGE_SIZE;
  }

  if (allIds.length === 0) {
    throw new Error('No questions in DB');
  }

  await supabase
    .from('question_instances')
    .delete()
    .eq('student_id', studentId);

  const instances = allIds.map(q => ({
    student_id: studentId,
    question_id: q.id,
    answered: true,
    correct_answer: '',
    difficulty_at_time: 1,
    mastery_snapshot: 1,
    next_review_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }));

  const { error: insertError } = await supabase
    .from('question_instances')
    .insert(instances);

  if (insertError) {
    throw new Error(`no-questions setup failed: ${insertError.message}`);
  }
});

test.afterAll(async () => {
  if (!studentId) return;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await supabase
    .from('question_instances')
    .delete()
    .eq('student_id', studentId);
});

test('Shows empty state when no questions are available', async ({ page }) => {
  await page.goto(`${PROD}/login.html`);

  await page.fill('input[type="email"]', TEST_STUDENT_EMAIL);
  await page.fill('input[type="password"]', process.env.TEST_STUDENT_PASSWORD!);
  await page.click('button');

  // logout-btn is intentionally hidden in the mobile redesign â€” wait for the question element directly
  const question = page.locator('#question');

  // 20s: Vercel Edge Function cold start can take up to ~18s when suite has been idle
  await expect(question).toHaveAttribute('data-state', /loading|empty/, { timeout: 20000 });

  await expect(question).toHaveAttribute('data-state', 'empty', { timeout: 20000 });

  await expect(question).toContainText(/ingen flere spÃ¸rgsmÃ¥l/i);
});
