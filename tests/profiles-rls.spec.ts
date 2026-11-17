// Section 132: Verify that the profiles UPDATE RLS policy allows students
// to write placement_band and current_band to their own row.
// Prior to Section 132 these writes failed silently — no UPDATE policy existed.

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createE2EAdminClient } from './e2e-admin.mjs';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import * as path from 'path';
import { PUBLIC_API_KEY } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL             = process.env.SUPABASE_URL!;

// Public anon key — already in deployed frontend JS, not a secret.
const SUPABASE_ANON_KEY = PUBLIC_API_KEY;

const STUDENT_EMAIL    = process.env.TEST_STUDENT_EMAIL!;
const STUDENT_PASSWORD = process.env.TEST_STUDENT_PASSWORD!;

let studentId: string;
let studentClient: ReturnType<typeof createClient>;
let adminClient:   ReturnType<typeof createClient>;

test.beforeAll(async () => {
  adminClient = createE2EAdminClient();

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

// The primary test pupil's baseline. `role` is part of it (A5): if a regression ever let the
// escalation attempts below succeed, the account must not be left with a teacher or admin role.
// The guarded admin client only accepts role "student" for this account.
async function restoreBaseline(): Promise<void> {
  const { error } = await adminClient.from('profiles').update({
    placement_band: 2,
    current_band:   null,
    role:           'student',
  }).eq('id', studentId);
  if (error) throw new Error(`profiles-rls: restore failed — ${error.message}. Restore the primary test pupil manually.`);
}

test.afterAll(async () => {
  // Nothing was written if sign-in never resolved the pupil — and there is no id to restore.
  if (!studentId) return;
  // Restore to global-setup baseline so subsequent suites start clean. A failure is LOUD.
  await restoreBaseline();
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

for (const target of ['teacher', 'super_admin']) {
  test(`Student cannot escalate role to ${target} via profile update`, async () => {
    try {
      await studentClient
        .from('profiles')
        .update({ role: target })
        .eq('id', studentId);

      // Whether the update errored or silently matched 0 rows, the role must be unchanged.
      const { data, error } = await adminClient
        .from('profiles')
        .select('role')
        .eq('id', studentId)
        .maybeSingle();

      expect(error, `role read-back failed: ${error?.message}`).toBeNull();
      expect(data?.role).toBe('student');
    } finally {
      // Restore at once — not only in afterAll — so an interrupted run cannot leave the account
      // with an escalated role between this test and the end of the file.
      await restoreBaseline();
    }
  });
}
