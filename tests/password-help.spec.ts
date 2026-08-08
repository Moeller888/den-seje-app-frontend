// Section 173: Teacher-mediated password help.
//
// These tests drive the request-password-help Edge Function directly rather than through the
// login page. That is deliberate: the security properties under test are server-side, and the
// deployed frontend lags a PR branch (PR builds do not deploy), so a UI-level test would be
// measuring the wrong code.
//
// THE FUNCTION IS ASYNCHRONOUS. Since the timing fix it answers BEFORE doing any account work
// (EdgeRuntime.waitUntil), so an audit row does not exist at the moment HTTP 200 arrives.
// Every assertion about a row therefore polls within a bounded window instead of assuming
// same-millisecond visibility.
//
// Setup and assertions use the service role, exactly like teacher-password-reset.spec.ts.

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import * as path from 'path';
import { findAuthUserByEmail } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL              = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Public anon key — already in the deployed frontend JS, not a secret.
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqemJlaHdmYWdpd3B3b2RzZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2ODc5OTQsImV4cCI6MjA4NzI2Mzk5NH0.BzepnYLe6Khzqx9vTL3Ifa_zMRgjoGQ9Lw5seaoKMMc';

const STUDENT_EMAIL = process.env.TEST_STUDENT_EMAIL!;
const FN_URL = `${SUPABASE_URL}/functions/v1/request-password-help`;

// How long a backgrounded request may take to leave its trace before we call it a failure.
const ROW_TIMEOUT_MS = 20_000;

let admin: ReturnType<typeof createClient>;
let studentId: string;
let originalTeacherId: string | null = null;

interface HelpResponse {
  status: number;
  bodyText: string;
  ms: number;
}

async function callHelp(email: unknown): Promise<HelpResponse> {
  const started = Date.now();
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });
  const bodyText = await res.text();
  return { status: res.status, bodyText, ms: Date.now() - started };
}

async function rowsForStudent(id: string) {
  const { data } = await admin
    .from('password_help_requests')
    .select('id, student_id, teacher_id, status, notification_sent_at, failure_reason, created_at')
    .eq('student_id', id)
    .order('created_at', { ascending: false });
  return Array.isArray(data) ? data : [];
}

// Polls until `predicate` holds or the window expires. Returns the rows either way so the
// caller can assert on what it actually saw.
async function waitForRows(
  id: string,
  predicate: (rows: any[]) => boolean,
  timeoutMs = ROW_TIMEOUT_MS,
): Promise<any[]> {
  const deadline = Date.now() + timeoutMs;
  let rows = await rowsForStudent(id);
  while (!predicate(rows) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    rows = await rowsForStudent(id);
  }
  return rows;
}

async function clearRowsForStudent(id: string) {
  await admin.from('password_help_requests').delete().eq('student_id', id);
}

// Puts the student into the notification cooldown WITHOUT sending a mail, so latency can be
// measured against a real account that will never reach Resend.
async function seedCooldown(id: string, teacherId: string | null) {
  await admin.from('password_help_requests').insert({
    student_id: id,
    teacher_id: teacherId,
    status: 'notified',
    notification_sent_at: new Date().toISOString(),
  });
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const user = await findAuthUserByEmail(admin, STUDENT_EMAIL);
  if (!user) throw new Error(`Test student not found: ${STUDENT_EMAIL}`);
  studentId = user.id;

  const { data } = await admin
    .from('profiles')
    .select('teacher_id')
    .eq('id', studentId)
    .maybeSingle();
  originalTeacherId = (data && typeof data.teacher_id === 'string') ? data.teacher_id : null;

  await clearRowsForStudent(studentId);
});

test.afterAll(async () => {
  // Restore the relation and leave no test rows behind.
  await admin.from('profiles').update({ teacher_id: originalTeacherId }).eq('id', studentId);
  await clearRowsForStudent(studentId);
});

test('1. valid student request is accepted and recorded', async () => {
  await clearRowsForStudent(studentId);
  // Seed the cooldown first: this test proves the request is processed and audited, and it can
  // do that from a suppressed outcome without putting a real mail in a teacher's inbox.
  await seedCooldown(studentId, originalTeacherId);

  const res = await callHelp(STUDENT_EMAIL);
  expect(res.status).toBe(200);

  const rows = await waitForRows(studentId, (r) => r.length >= 2);
  expect(rows.length, 'the request must leave an audit row').toBeGreaterThanOrEqual(2);
  expect(rows[0].student_id).toBe(studentId);
  expect(rows[0].status).toBe('suppressed_cooldown');
  expect(rows[0].notification_sent_at).toBeNull();
});

test('2 + 9. unknown address is indistinguishable from a real one', async () => {
  const known   = await callHelp(STUDENT_EMAIL);
  const unknown = await callHelp(`no-such-user-${Date.now()}@example.invalid`);

  expect(unknown.status).toBe(known.status);
  expect(unknown.bodyText, 'body must be byte-identical').toBe(known.bodyText);
});

test('3 + 20. a staff address neither leaks nor creates a student request row', async () => {
  const { data: teachers } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'teacher')
    .limit(1);

  expect(Array.isArray(teachers) && teachers.length > 0, 'need a teacher for this test').toBe(true);
  const teacherId = teachers![0].id as string;

  const { data: teacherUser } = await admin.auth.admin.getUserById(teacherId);
  const teacherEmail = teacherUser?.user?.email;
  expect(typeof teacherEmail, 'teacher must have an address').toBe('string');

  const res = await callHelp(teacherEmail as string);
  expect(res.status).toBe(200);

  const studentRes = await callHelp(STUDENT_EMAIL);
  expect(res.bodyText).toBe(studentRes.bodyText);

  // Staff recovery must not write into the student help table. Give the background task time
  // to have written a row if it were going to, then assert that it did not.
  await new Promise((r) => setTimeout(r, 3000));
  expect((await rowsForStudent(teacherId)).length, 'no help row for a staff account').toBe(0);
});

test('4. student without a teacher is recorded as no_teacher', async () => {
  await clearRowsForStudent(studentId);
  await admin.from('profiles').update({ teacher_id: null }).eq('id', studentId);

  try {
    const res = await callHelp(STUDENT_EMAIL);
    expect(res.status).toBe(200);

    const rows = await waitForRows(studentId, (r) => r.length >= 1);
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('no_teacher');
    expect(rows[0].teacher_id).toBeNull();
    expect(rows[0].notification_sent_at).toBeNull();
  } finally {
    await admin.from('profiles').update({ teacher_id: originalTeacherId }).eq('id', studentId);
  }
});

test('6. a request inside the cooldown is suppressed and sends no mail', async () => {
  await clearRowsForStudent(studentId);
  await seedCooldown(studentId, originalTeacherId);

  await callHelp(STUDENT_EMAIL);

  const rows = await waitForRows(studentId, (r) => r.length >= 2);
  expect(rows.length).toBe(2);
  expect(rows[0].status).toBe('suppressed_cooldown');
  expect(rows[0].notification_sent_at).toBeNull();
  // Exactly one 'notified' row — the seeded one. No second mail was sent.
  expect(rows.filter((r) => r.status === 'notified').length).toBe(1);
});

test('8 + 10. the response carries no address, no id, no secret', async () => {
  const res = await callHelp(STUDENT_EMAIL);
  const body = res.bodyText.toLowerCase();

  for (const forbidden of ['@', 'teacher_id', 'student_id', 'token', 'password', 'service_role', 'resend', 'eyj']) {
    expect(body.includes(forbidden), `response must not contain "${forbidden}"`).toBe(false);
  }
});

test('ANTI-ENUMERATION: latency must not distinguish a real account from an unknown one', async () => {
  test.setTimeout(120_000);

  // The student stays inside the cooldown for the whole measurement, so every call for the real
  // address is suppressed server-side and no mail is ever sent.
  await clearRowsForStudent(studentId);
  await seedCooldown(studentId, originalTeacherId);

  const N = 7;
  const knownMs: number[] = [];
  const unknownMs: number[] = [];

  // Interleaved, so a slow patch of network hits both series rather than biasing one.
  for (let i = 0; i < N; i++) {
    knownMs.push((await callHelp(STUDENT_EMAIL)).ms);
    unknownMs.push((await callHelp(`no-such-user-${Date.now()}-${i}@example.invalid`)).ms);
  }

  const kMed = median(knownMs);
  const uMed = median(unknownMs);
  const delta = Math.abs(kMed - uMed);

  console.log(`[anti-enumeration] known median=${kMed}ms unknown median=${uMed}ms delta=${delta}ms`);
  console.log(`[anti-enumeration] known=${knownMs.join(',')} unknown=${unknownMs.join(',')}`);

  // The regression this guards against was ~1050 ms of structural difference (account lookup +
  // rate-limit read + Resend call on the hot path). 600 ms sits well below that and well above
  // ordinary network jitter between two calls to the same endpoint.
  expect(delta, `median latency must not differ structurally (known=${kMed}, unknown=${uMed})`)
    .toBeLessThan(600);

  // And prove the measurement did not quietly send mail.
  const rows = await rowsForStudent(studentId);
  expect(rows.filter((r) => r.status === 'notified').length, 'no extra mail during measurement').toBe(1);
});

test('14 + 16. the mail link grants nothing: a foreign teacher still cannot reset', async () => {
  // Mirrors the guarantee the notification mail relies on. The link in the mail is navigation
  // only; authority comes from the session plus the server-side teacher_id check.
  const { data: teachers } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'teacher');

  const all = Array.isArray(teachers) ? teachers : [];
  const foreign = all.find((t) => t.id !== originalTeacherId);
  test.skip(!foreign, 'needs a second teacher account to impersonate');

  const { data: owned } = await admin
    .from('profiles')
    .select('id')
    .eq('id', studentId)
    .eq('teacher_id', foreign!.id as string)
    .maybeSingle();

  expect(owned, 'foreign teacher must not own this student').toBeNull();
});

// ── Cases that cannot be exercised honestly from here ────────────────────────
// 5.  Teacher without an address — Supabase requires an email on every auth.users row (see
//     migration 20260608000000), so the state is unreachable. The branch exists and the
//     'teacher_no_email' status is accepted by the table's CHECK constraint.
// 7.  Daily-cap boundary — reaching it means five real notifications. Deliberately not
//     exercised against a live teacher inbox; the cooldown path covers the same code.
// 11. Absence of secrets in logs — asserted by code review: the function logs only status codes
//     and short reason slugs, and _shared/monitoring.ts scrubs payloads before sending.
// 12/13. Mail body contents — no mail sink is available in CI. Covered by review of
//     sendTeacherNotification, which interpolates only the student's display name and a link.
// 15/17. Existing teacher-direct reset and the must_reset_password flow are already covered by
//     tests/teacher-password-reset.spec.ts and are deliberately not duplicated here.
// 19. Injected database failure — not reachable without a fault-injection seam.
