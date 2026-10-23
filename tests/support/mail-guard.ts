// Section 173 / E2E slots: the live password-help spec must never make the deployed function send
// a real mail.
//
// request-password-help mails the student's teacher when the student has a teacher AND
// reserve_password_help returns 'reserved', i.e. the student has no counted row inside the cooldown.
// Every live call in tests/password-help.spec.ts is meant to run either inside a seeded cooldown or
// against a student with no teacher. Some tests get their cooldown from the PREVIOUS test in the
// serial chain, so running one of them on its own (`-g`, a reordering, a new test) would reach the
// mail path — and the teacher is a real auth account whose address we may not control.
//
// This turns "meant to" into a check made immediately before each live call: the call is allowed
// only if the student has no teacher, or a counted row that is still well inside the cooldown.
// Otherwise the spec throws instead of calling. Pure — the spec passes in what it read.

// Must match COOLDOWN_MINUTES in supabase/functions/request-password-help/index.ts and the statuses
// reserve_password_help counts (supabase/migrations/20260808010000_password_help_reserve_rpc.sql).
// tests/unit/password-help-mail-guard.test.mjs pins both against the source.
export const COOLDOWN_MINUTES = 15;
export const COOLDOWN_STATUSES: readonly string[] = ['reserved', 'notified', 'mail_failed', 'technical_error'];

// The row must be younger than the cooldown MINUS this margin. It absorbs clock skew between the
// runner and the database (created_at is the database clock) and the duration of the call itself.
export const SAFETY_MARGIN_MINUTES = 5;

export interface MailGuardInput {
  teacherId: string | null;
  rows: ReadonlyArray<{ status?: unknown; created_at?: unknown }>;
  nowMs: number;
}

export interface MailGuardVerdict {
  safe: boolean;
  reason: string;
}

export function mailGuardVerdict({ teacherId, rows, nowMs }: MailGuardInput): MailGuardVerdict {
  if (teacherId === null) {
    return { safe: true, reason: 'the student has no teacher: the function records no_teacher and sends nothing' };
  }
  if (!Number.isFinite(nowMs)) {
    return { safe: false, reason: 'no valid clock reading' };
  }
  const windowMs = (COOLDOWN_MINUTES - SAFETY_MARGIN_MINUTES) * 60_000;
  const list = Array.isArray(rows) ? rows : [];
  for (const row of list) {
    if (!row || typeof row.status !== 'string' || !COOLDOWN_STATUSES.includes(row.status)) continue;
    if (typeof row.created_at !== 'string') continue;
    const at = Date.parse(row.created_at);
    if (!Number.isFinite(at)) continue;
    if (nowMs - at < windowMs) {
      return { safe: true, reason: `a counted '${row.status}' row holds the student inside the cooldown` };
    }
  }
  return {
    safe: false,
    reason: `the student has a teacher and no counted row younger than ${COOLDOWN_MINUTES - SAFETY_MARGIN_MINUTES} min, ` +
      'so this call could make the deployed function mail that teacher',
  };
}
