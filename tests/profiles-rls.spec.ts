// Section 132: Verify that the profiles UPDATE RLS policy allows students
// to write placement_band and current_band to their own row.
// Prior to Section 132 these writes failed silently — no UPDATE policy existed.

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import * as path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL             = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Public anon key — already in deployed frontend JS, not a secret.
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqemJlaHdmYWdpd3B3b2RzZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2ODc5OTQsImV4cCI6MjA4NzI2Mzk5NH0.BzepnYLe6Khzqx9vTL3Ifa_zMRgjoGQ9Lw5seaoKMMc';

const STUDENT_EMAIL    = process.env.TEST_STUDENT_EMAIL!;
const STUDENT_PASSWORD = process.env.TEST_STUDENT_PASSWORD!;

let studentId: string;
let studentClient: ReturnType<typeof createClient>;
let adminClient:   ReturnType<typeof createClient>;

test.beforeAll(async () => {
  adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error } = await anonClient.auth.signInWithPassword({
    email: STUDENT_EMAIL,
    password: STUDENT_PASSWORD,
  });
  if (error || !session.session) throw new Error(`Student sign-in failed: ${error?.message}`);

  studentId = session.user!.id;
  studentClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
});

test.afterAll(async () => {
  // Restore to global-setup baseline so subsequent suites start clean.
  await adminClient.from('profiles').update({
    placement_band: 2,
    current_band:   null,
  }).eq('id', studentId);
});

// ── Tests ────────────────────────────────────────────────────────────────────

test('Student can write placement_band to own profile', async () => {
  const { error } = await studentClient
    .from('profiles')
    .update({ placement_band: 3 })
    .eq('id', studentId);

  expect(error, `placement_band update failed: ${error?.message}`).toBeNull();

  const { data } = await adminClient
    .from('profiles')
    .select('placement_band')
    .eq('id', studentId)
    .maybeSingle();

  expect(data?.placement_band).toBe(3);
});

test('Student can write current_band to own profile', async () => {
  const { error } = await studentClient
    .from('profiles')
    .update({ current_band: 4 })
    .eq('id', studentId);

  expect(error, `current_band update failed: ${error?.message}`).toBeNull();

  const { data } = await adminClient
    .from('profiles')
    .select('current_band')
    .eq('id', studentId)
    .maybeSingle();

  expect(data?.current_band).toBe(4);
});

test('Student cannot escalate role to teacher via profile update', async () => {
  await studentClient
    .from('profiles')
    .update({ role: 'teacher' })
    .eq('id', studentId);

  // Whether the update errored or silently matched 0 rows, the role must be unchanged.
  const { data } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', studentId)
    .maybeSingle();

  expect(data?.role).toBe('student');
});
