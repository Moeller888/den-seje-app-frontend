import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import * as path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TEST_STUDENT_EMAIL = 'christnmoeller@hotmail.com';

let studentId: string;

test.beforeAll(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: users, error: listError } = await supabase.auth.admin.listUsers();

  if (listError) {
    throw new Error(`no-questions setup: listUsers failed — ${listError.message}`);
  }

  const user = users.users.find((u) => u.email === TEST_STUDENT_EMAIL);

  if (!user) {
    throw new Error('Test student not found');
  }

  studentId = user.id;

  const { data: questions, error: qError } = await supabase
    .from('questions')
    .select('id');

  if (qError || !questions || questions.length === 0) {
    throw new Error('No questions in DB');
  }

  await supabase
    .from('question_instances')
    .delete()
    .eq('student_id', studentId);

  const instances = questions.map(q => ({
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
  await page.goto('https://den-seje-app-frontend.vercel.app/login.html');

  await page.fill('input[type="email"]', TEST_STUDENT_EMAIL);
  await page.fill('input[type="password"]', 'Cmiciquru5');
  await page.click('button');

  await page.waitForSelector('#logout-btn');

  const question = page.locator('#question');

  await expect(question).toHaveAttribute('data-state', /loading|empty/, { timeout: 15000 });

  await expect(question).toHaveAttribute('data-state', 'empty', { timeout: 15000 });

  await expect(question).toContainText(/ingen flere spørgsmål/i);
});
