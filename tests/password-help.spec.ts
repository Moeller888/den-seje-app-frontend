// Section 173: Teacher-mediated password help.
//
// These tests drive the request-password-help Edge Function directly rather than through the
// login page. That is deliberate: the security properties under test are server-side, and the
// deployed frontend lags a PR branch (PR builds do not deploy), so a UI-level test would be
// measuring the wrong code. They use no `page` fixture and run in the `api` project only.
//
// THE FUNCTION IS ASYNCHRONOUS. It answers BEFORE doing any account work
// (EdgeRuntime.waitUntil), so an audit row does not exist at the moment HTTP 200 arrives.
// Every assertion about a row therefore polls within a bounded window.
//
// ── WHY THERE IS NO STAFF-ADDRESS TEST HERE ─────────────────────────────────────────────────
// There used to be. It selected a teacher with `.eq('role','teacher').limit(1)` and called the
// function with that account's real auth address. For role=teacher the function correctly sends
// an ordinary Supabase recovery mail — so the test sent one. In CI run 31266753389 exactly one
// real password-reset mail was delivered to a live inbox, confirmed by the owner.
//
// Two things made it dangerous rather than merely noisy: `.limit(1)` has no ORDER BY, so which
// teacher it picked was decided by Postgres, not by the test — the other candidate was the pilot
// teacher with 27 students; and the student cooldown that protects every other case does not
// apply to the staff route, which writes no audit row and therefore leaves no trace to notice.
//
// The staff route is consequently NOT COVERED by any live test, on purpose, and it never should
// be: the only way to exercise it from here is to make the deployed function send mail.
//
// It is covered where it can be exercised safely instead. tests/unit/password-help-route.test.mjs
// drives the real routing module with fakes and no network, and asserts that a teacher and a
// super_admin each reach the recovery dependency exactly once with the normalised address, that
// the student pipeline is never touched for staff, and that a provider failure or throw changes
// nothing observable.

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import * as path from 'path';
import { findAuthUserByEmail } from './helpers.js';
import {
  createRestoreState,
  captureOriginal,
  markMutationAttempted,
  markMutationConfirmed,
  restoreOriginal,
  type RestoreDeps,
} from './support/teacher-id-restore.ts';
import { awaitSettled, type BarrierDeps } from './support/completion-barrier.ts';

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

// RFC 2606 reserves .invalid: these addresses can never resolve or be delivered to.
function unknownAddress(tag: string | number): string {
  return `no-such-user-${Date.now()}-${tag}@example.invalid`;
}

let admin: ReturnType<typeof createClient>;
let studentId: string;

// The captured original lives in restoreState (declared below), never in a bare `string | null`
// that would conflate "the original was null" with "we never read it".
function capturedTeacherId(): string | null {
  return restoreState.original;
}

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

// ── Fail-fast data helpers ───────────────────────────────────────────────────
// Every mutation and every cleanup goes through one of these. A Supabase call that fails
// silently is exactly how a test leaves teacher_id = null on a real student, so no result
// object is allowed to go unchecked.

function assertOk(label: string, result: { error: unknown }): void {
  const err = result?.error as { message?: string } | null | undefined;
  if (err) throw new Error(`${label} failed: ${err.message ?? String(err)}`);
}

async function rowsForStudent(id: string) {
  const res = await admin
    .from('password_help_requests')
    .select('id, student_id, teacher_id, status, notification_sent_at, failure_reason, created_at')
    .eq('student_id', id)
    .order('created_at', { ascending: false });
  assertOk('read password_help_requests', res);
  return Array.isArray(res.data) ? res.data : [];
}

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

// DELETE + verify. A successful DELETE is not evidence that the table is empty: it reports no
// error for zero affected rows, and it says nothing about a row a background task writes a
// moment later. The re-read is the only thing that makes "cleared" a fact.
async function clearRowsForStudent(id: string): Promise<void> {
  assertOk(
    'clear password_help_requests',
    await admin.from('password_help_requests').delete().eq('student_id', id),
  );

  const remaining = await rowsForStudent(id);
  if (remaining.length !== 0) {
    throw new Error(
      `clear password_help_requests left ${remaining.length} row(s) behind ` +
      `(statuses: ${remaining.map((r) => r.status).join(', ')})`,
    );
  }
}

// ── Completion barriers ──────────────────────────────────────────────────────
// request-password-help answers BEFORE processHelpRequest() finishes (EdgeRuntime.waitUntil).
// A returned HTTP 200 therefore proves nothing about the database. Without a barrier, a request
// can still be in flight when the next test clears rows or sets teacher_id = null — the write
// then lands after the cleanup and leaves production data behind while the suite reports green.
//
// Every call made with the student's address must pass through one of these before the test
// moves on. Unknown .invalid addresses write nothing by design and must NOT wait for an effect
// that will never come.
//
// COUNTING ROWS IS NOT ENOUGH. The rate-limit RPC writes its row FIRST and the outcome is
// filled in afterwards, so a row can exist while mail and finalisation are still running.
// 'reserved' is therefore treated as in-progress and never satisfies a barrier — the logic
// lives in tests/support/completion-barrier.ts and is unit-tested there.

// Statuses a LIVE test is allowed to end on. 'notified' and 'mail_failed' are deliberately
// absent: every student call in this spec runs inside a seeded cooldown or against a student
// with no teacher, so the decision can never be 'reserved' and no mail can ever be attempted.
// If one appears anyway, the barrier waits for it to reach a terminal status and then fails
// loudly — a mail-capable path in a live test is a safety defect, not a flake.
const SAFE_TERMINAL: readonly string[] = ['suppressed_cooldown', 'suppressed_daily_cap', 'no_teacher', 'teacher_no_email'];

function barrierDeps(): BarrierDeps {
  return {
    readRows: () => rowsForStudent(studentId),   // throws on a query error, by design
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
  };
}

async function awaitSettledRows(
  expectedCount: number,
  label: string,
  allowedTerminal: readonly string[] = SAFE_TERMINAL,
): Promise<any[]> {
  return awaitSettled(barrierDeps(), {
    expectedCount,
    allowedTerminal,
    timeoutMs: ROW_TIMEOUT_MS,
    pollMs: 500,
    label,
  }) as Promise<any[]>;
}

// Calls with the student address and does not return until that request's row exists AND has
// reached an allowed terminal status.
async function callHelpForStudentAndSettle(
  label: string,
  allowedTerminal: readonly string[] = SAFE_TERMINAL,
): Promise<{ res: HelpResponse; rows: any[] }> {
  const before = (await rowsForStudent(studentId)).length;
  const res = await callHelp(STUDENT_EMAIL);
  const rows = await awaitSettledRows(before + 1, label, allowedTerminal);
  return { res, rows };
}

// Puts the student into the notification cooldown WITHOUT sending a mail, so the student path
// can be exercised against a real account that will never reach Resend.
async function seedCooldown(id: string, teacherId: string | null): Promise<void> {
  assertOk(
    'seed cooldown row',
    await admin.from('password_help_requests').insert({
      student_id: id,
      teacher_id: teacherId,
      status: 'notified',
      notification_sent_at: new Date().toISOString(),
    }),
  );
}

// Capture/restore lives in tests/support/teacher-id-restore.ts so its dangerous paths — an
// uncaptured original, a failed write, a value that drifts — are exercised against fakes in
// tests/unit/password-help-restore.test.mjs. `captured` is tracked separately from the value,
// so a null original can never be confused with "we never managed to read it".
const restoreState = createRestoreState();

const restoreDeps: RestoreDeps = {
  async readTeacherId(id: string): Promise<string | null> {
    const res = await admin.from('profiles').select('teacher_id').eq('id', id).maybeSingle();
    assertOk('read profiles.teacher_id', res);
    if (!res.data) throw new Error('profiles row for the test student is missing');
    return (res.data.teacher_id as string | null) ?? null;
  },
  async writeTeacherId(id: string, value: string | null): Promise<void> {
    assertOk(
      'write profiles.teacher_id',
      await admin.from('profiles').update({ teacher_id: value }).eq('id', id),
    );
  },
};

// Never throws — returns a message so a cleanup failure can be reported ALONGSIDE a primary
// test failure instead of replacing it.
function restoreTeacherId(): Promise<string | null> {
  return restoreOriginal(studentId, restoreDeps, restoreState);
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

  // Deterministic capture: read it once with error checking. `restoreState.captured` only flips
  // after this succeeds, so a failure here provably cannot lead to a null-write in afterAll.
  const captured = await captureOriginal(studentId, restoreDeps, restoreState);
  if (!captured) {
    throw new Error('precondition failed: the test student has no teacher_id to restore');
  }

  await clearRowsForStudent(studentId);
});

test.afterAll(async () => {
  // Both cleanups must succeed. If either fails the suite fails visibly — a spec that quietly
  // leaves teacher_id = null or audit rows behind is the failure mode this guards against.
  const restoreError = await restoreTeacherId();

  let clearError: string | null = null;
  try {
    await clearRowsForStudent(studentId);
  } catch (e: any) {
    clearError = e?.message ?? String(e);
  }

  const problems = [restoreError, clearError].filter(Boolean);
  if (problems.length > 0) {
    throw new Error(`afterAll cleanup failed: ${problems.join(' | ')}`);
  }
});

test('1. valid student request is accepted and recorded', async () => {
  await clearRowsForStudent(studentId);
  // Seed the cooldown first: this proves the request is processed and audited, and it can do
  // that from a suppressed outcome without putting a real mail in anyone's inbox.
  await seedCooldown(studentId, capturedTeacherId());

  const { res, rows } = await callHelpForStudentAndSettle('test 1');
  expect(res.status).toBe(200);

  expect(rows.length, 'the request must leave an audit row').toBe(2);
  expect(rows[0].student_id).toBe(studentId);
  expect(rows[0].status).toBe('suppressed_cooldown');
  expect(rows[0].notification_sent_at).toBeNull();
});

test('2 + 9. unknown address is indistinguishable from a real one', async () => {
  const before = (await rowsForStudent(studentId)).length;

  // The known call is settled before anything else happens; the unknown one writes nothing and
  // is therefore not waited on — waiting for an effect it never produces would be a fiction.
  const { res: known } = await callHelpForStudentAndSettle('test 2 known call');
  const unknown = await callHelp(unknownAddress('cmp'));

  expect(unknown.status).toBe(known.status);
  expect(unknown.bodyText, 'body must be byte-identical').toBe(known.bodyText);

  // Give an unknown-address write the same window a real one gets, then prove none appeared.
  await new Promise((r) => setTimeout(r, 3000));
  const after = await rowsForStudent(studentId);
  expect(after.length, 'only the known call may write a row').toBe(before + 1);
});

test('4. student without a teacher is recorded as no_teacher', async () => {
  await clearRowsForStudent(studentId);

  let primary: unknown = null;
  try {
    // Declared BEFORE the write, so cleanup knows a restore is required even if the mutation
    // itself fails halfway. Without this, a half-applied change could go unrestored.
    markMutationAttempted(restoreState);
    assertOk(
      'set teacher_id = null',
      await admin.from('profiles').update({ teacher_id: null }).eq('id', studentId),
    );
    // A PostgREST update reports no error when it matches zero rows, so the write is only
    // "confirmed" once a re-read proves the value actually changed.
    const afterMutation = await restoreDeps.readTeacherId(studentId);
    if (afterMutation !== null) {
      throw new Error('set teacher_id = null did not take effect');
    }
    markMutationConfirmed(restoreState);

    // Settled before the finally-block restores teacher_id: otherwise the request could still be
    // reading the profile while we change it back, and record the wrong outcome.
    const { res, rows } = await callHelpForStudentAndSettle('test 4');
    expect(res.status).toBe(200);

    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('no_teacher');
    expect(rows[0].teacher_id).toBeNull();
    expect(rows[0].notification_sent_at).toBeNull();
  } catch (e) {
    primary = e;
  } finally {
    // Always attempt the restore, and verify it landed. A cleanup failure must be reported
    // WITH the primary failure, never instead of it.
    const restoreError = await restoreTeacherId();
    if (primary && restoreError) {
      throw new Error(
        `PRIMARY FAILURE: ${(primary as any)?.message ?? String(primary)} — CLEANUP ALSO FAILED: ${restoreError}`,
      );
    }
    if (primary) throw primary;
    if (restoreError) throw new Error(restoreError);
  }
});

test('6. a request inside the cooldown is suppressed and sends no mail', async () => {
  await clearRowsForStudent(studentId);
  await seedCooldown(studentId, capturedTeacherId());

  const { rows } = await callHelpForStudentAndSettle('test 6');

  expect(rows.length).toBe(2);
  expect(rows[0].status).toBe('suppressed_cooldown');
  expect(rows[0].notification_sent_at).toBeNull();
  // Exactly one 'notified' row — the seeded one. No second mail was sent.
  expect(rows.filter((r) => r.status === 'notified').length).toBe(1);
});

test('8 + 10. the response carries no address, no id, no secret', async () => {
  const { res } = await callHelpForStudentAndSettle('test 8');
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
  await seedCooldown(studentId, capturedTeacherId());

  const N = 7;
  const knownMs: number[] = [];
  const unknownMs: number[] = [];

  // Interleaved, so a slow patch of network hits both series rather than biasing one. The
  // barrier deliberately comes AFTER the measured responses — waiting per call would fold
  // database latency into the timing and destroy what is being measured.
  for (let i = 0; i < N; i++) {
    knownMs.push((await callHelp(STUDENT_EMAIL)).ms);
    unknownMs.push((await callHelp(unknownAddress(i))).ms);
  }

  // Barrier: all N background writes must land before this test may finish, or they would race
  // afterAll's cleanup and survive it.
  const settled = await awaitSettledRows(1 + N, 'anti-enumeration barrier', ['notified', 'suppressed_cooldown']);
  expect(settled.filter((r) => r.status === 'suppressed_cooldown').length,
    `all ${N} known calls must be suppressed`).toBe(N);
  expect(settled.filter((r) => r.status === 'notified').length,
    'only the seeded row may be notified').toBe(1);
  expect(settled.filter((r) => r.notification_sent_at !== null).length,
    'no suppressed row may claim a sent notification').toBe(1);

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

  // And prove the measurement did not quietly send mail. Re-read rather than reuse `settled`,
  // so a late write would still be caught here.
  const rows = await rowsForStudent(studentId);
  expect(rows.length, 'no row may appear after the barrier').toBe(1 + N);
  expect(rows.filter((r) => r.status === 'notified').length, 'no extra mail during measurement').toBe(1);
});

test('14 + 16. the mail link grants nothing: a foreign teacher does not own this student', async () => {
  // Mirrors the guarantee the notification mail relies on: the link is navigation only, and
  // authority comes from the session plus the server-side teacher_id check. Read-only — it
  // never calls the function and never touches a staff account's address.
  const res = await admin
    .from('profiles')
    .select('id')
    .eq('id', studentId)
    .neq('teacher_id', capturedTeacherId() as string)
    .maybeSingle();
  assertOk('ownership counter-check', res);

  expect(res.data, 'the student must not be owned by any teacher other than the captured one')
    .toBeNull();
});

// ── Cases that cannot be exercised honestly from here ────────────────────────
// 3/20. Staff routing (teacher/super_admin -> ordinary Supabase recovery) — REMOVED, see the
//     header. Exercising it means sending a real recovery mail. Not covered live, by decision.
// 5.  Teacher without an address — Supabase requires an email on every auth.users row (see
//     migration 20260608000000), so the state is unreachable. The branch exists and the
//     'teacher_no_email' status is accepted by the table's CHECK constraint.
// 7.  Daily-cap boundary — reaching it means five real notifications. Deliberately not
//     exercised against a live inbox; the cooldown path covers the same suppression code.
// 11. Absence of secrets in logs — asserted by code review: the function logs only status codes
//     and short reason slugs, and _shared/monitoring.ts scrubs payloads before sending.
// 12/13. Mail body contents — no mail sink is available in CI. Covered by review of
//     sendTeacherNotification, which interpolates only the student's display name and a link.
// 15/17. Existing teacher-direct reset and the must_reset_password flow are already covered by
//     tests/teacher-password-reset.spec.ts and are deliberately not duplicated here.
// 19. Injected database failure — not reachable without a fault-injection seam.
