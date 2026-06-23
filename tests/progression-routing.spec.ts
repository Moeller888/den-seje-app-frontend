// Section 127A: Adaptive progression routing coverage.
// Verifies that get-next-question routes correctly by grade, band, and domain.
// API-only tests — no browser context required.

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import * as path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL           = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Public anon key — already present in deployed frontend JS, not a secret.
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqemJlaHdmYWdpd3B3b2RzZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2ODc5OTQsImV4cCI6MjA4NzI2Mzk5NH0.BzepnYLe6Khzqx9vTL3Ifa_zMRgjoGQ9Lw5seaoKMMc';

const EDGE_BASE        = `${SUPABASE_URL}/functions/v1`;
const STUDENT_EMAIL    = process.env.TEST_STUDENT_EMAIL!;
const STUDENT_PASSWORD = process.env.TEST_STUDENT_PASSWORD!;

let adminClient: ReturnType<typeof createClient>;
let studentId: string;
let studentToken: string;

test.beforeAll(async () => {
  adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: users, error: listErr } = await adminClient.auth.admin.listUsers();
  if (listErr) throw new Error(`listUsers failed: ${listErr.message}`);

  const user = users.users.find((u: any) => u.email === STUDENT_EMAIL);
  if (!user) throw new Error(`Test student not found: ${STUDENT_EMAIL}`);
  studentId = user.id;

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error: signInErr } = await anonClient.auth.signInWithPassword({
    email: STUDENT_EMAIL,
    password: STUDENT_PASSWORD,
  });
  if (signInErr || !session.session) {
    throw new Error(`Student sign-in failed: ${signInErr?.message}`);
  }
  studentToken = session.session.access_token;
});

async function setStudentProfile(opts: {
  selectedGrade: number;
  currentBand?: number | null;
  activeDomains?: string[] | null;
}): Promise<void> {
  const { error } = await adminClient
    .from('profiles')
    .update({
      selected_grade:  opts.selectedGrade,
      current_band:    opts.currentBand  ?? null,
      active_domains:  opts.activeDomains ?? null,
      placement_band:  2,
    })
    .eq('id', studentId);
  if (error) throw new Error(`setStudentProfile failed: ${error.message}`);
}

async function clearInstances(): Promise<void> {
  const { error } = await adminClient
    .from('question_instances')
    .delete()
    .eq('student_id', studentId);
  if (error) throw new Error(`clearInstances failed: ${error.message}`);
}

async function callGetNextQuestion(params: {
  selectedGrade?: number;
  currentBand?: number;
}): Promise<any> {
  const body: Record<string, unknown> = {};
  if (params.selectedGrade !== undefined) body.selected_grade = params.selectedGrade;
  if (params.currentBand  !== undefined) body.current_difficulty_band = params.currentBand;

  const res = await fetch(`${EDGE_BASE}/get-next-question`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${studentToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Edge function HTTP ${res.status}`);
  return res.json();
}

test.beforeEach(async () => {
  await clearInstances();
});

test.afterAll(async () => {
  await clearInstances();
  await setStudentProfile({ selectedGrade: 9 });
});

// ── Tests ────────────────────────────────────────────────────────────────────

test('Grade 3 + Band 4 is viable — returns a question (Section 126)', async () => {
  // selected_grade=3 is a content-tier filter passed in the request body.
  // The profile constraint only permits 7/8/9, so the profile stays at grade 9.
  await setStudentProfile({ selectedGrade: 9, currentBand: 4 });
  const result = await callGetNextQuestion({ selectedGrade: 3, currentBand: 4 });

  expect(result.step,                 'Must not return no_questions').not.toBe('no_questions');
  expect(result.question_instance_id, 'Must return an instance id').toBeTruthy();
  expect(result.content?.question,    'Must return question text').toBeTruthy();
});

test('Grade 3 content tier — returns a question', async () => {
  await setStudentProfile({ selectedGrade: 9 });
  const result = await callGetNextQuestion({ selectedGrade: 3 });

  expect(result.step).not.toBe('no_questions');
  expect(result.question_instance_id).toBeTruthy();
});

test('Domain filter — active domain returns a question', async () => {
  await setStudentProfile({ selectedGrade: 9, activeDomains: ['world_war_2'] });
  const result = await callGetNextQuestion({ selectedGrade: 9 });

  expect(result.step).not.toBe('no_questions');
  expect(result.question_instance_id).toBeTruthy();
});

test('Domain filter — unknown domain returns no_questions', async () => {
  await setStudentProfile({ selectedGrade: 9, activeDomains: ['__no_such_domain__'] });
  const result = await callGetNextQuestion({ selectedGrade: 9 });

  expect(result.step).toBe('no_questions');
});

test('Response contract — required fields present on every call', async () => {
  await setStudentProfile({ selectedGrade: 9 });
  const result = await callGetNextQuestion({ selectedGrade: 9 });

  expect(result.question_instance_id).toBeTruthy();
  expect(result.content).toBeTruthy();
  expect(typeof result.answer_format).toBe('string');
  expect(typeof result.wave_phase).toBe('string');
});
