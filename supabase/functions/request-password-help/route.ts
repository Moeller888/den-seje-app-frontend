// Section 173: routing decision for a password-help request.
//
// This module exists so the STAFF branch can be tested without sending mail. The live
// integration test used to exercise it by calling the deployed function with a real teacher's
// address, which sent a real Supabase recovery mail to a real inbox (CI run 31266753389). That
// test is gone and must never come back; this is where that behaviour is verified instead.
//
// It is deliberately pure: no Supabase client, no fetch, no env, no imports at all. Everything
// it needs arrives through `deps`, so a unit test can supply fakes and assert exactly which
// collaborator was called, how often, and with what.
//
// Behaviour is a straight extraction from index.ts — the order of checks, the outcomes and the
// warning messages are unchanged. The student pipeline itself stays in index.ts and is reached
// through `deps.handleStudent`.

export interface HelpProfile {
  role: string | null;
  teacher_id: string | null;
  full_name: string | null;
}

export interface HelpUser {
  id: string;
  email: string | null;
}

export interface RecoveryResult {
  error: { message?: string } | null;
}

export interface HelpRequestDeps {
  findUserByEmail(email: string): Promise<HelpUser | null>;
  loadProfile(userId: string): Promise<HelpProfile | null>;

  // null when the anon key is unavailable — the function cannot send staff recovery without it,
  // and that is recorded rather than silently skipped.
  sendStaffRecovery: ((email: string) => Promise<RecoveryResult>) | null;

  handleStudent(userId: string, profile: HelpProfile): Promise<void>;

  captureMessage(message: string, level?: string, extra?: Record<string, unknown>): void;
}

// Every terminal state the router can reach. Returned for tests and for callers that want to
// log an outcome; the HTTP response is identical regardless and is not decided here.
export type HelpOutcome =
  | "unknown_address"
  | "staff_recovery_sent"
  | "staff_recovery_failed"
  | "staff_recovery_unavailable"
  | "not_a_student"
  | "student_handled";

const STAFF_ROLES = ["teacher", "super_admin"];

export function isStaffRole(role: string | null): boolean {
  return typeof role === "string" && STAFF_ROLES.indexOf(role) !== -1;
}

// Normalises the address the same way the lookup does, so the recovery call cannot be sent to a
// differently-cased variant of what was matched.
export function normaliseEmail(email: string): string {
  return typeof email === "string" ? email.trim() : "";
}

export async function routeHelpRequest(
  rawEmail: string,
  deps: HelpRequestDeps,
): Promise<HelpOutcome> {
  const email = normaliseEmail(rawEmail);

  const user = await deps.findUserByEmail(email);

  // Unknown address: nothing to do, nothing to record. No row is written, so the table can
  // never be used to enumerate what was tried.
  if (!user || typeof user.id !== "string" || user.id.length === 0) {
    return "unknown_address";
  }

  const profile = await deps.loadProfile(user.id);
  const role = profile && typeof profile.role === "string" ? profile.role : null;

  // Teachers and admins keep ordinary Supabase recovery for their own account. They never touch
  // the student help table, and no audit row is written for them.
  if (isStaffRole(role)) {
    if (!deps.sendStaffRecovery) {
      deps.captureMessage("staff recovery skipped: SUPABASE_ANON_KEY unset", "warning", { role });
      return "staff_recovery_unavailable";
    }

    // A provider failure must never change the response, never reveal the account, and never
    // escape as an unhandled rejection.
    try {
      const result = await deps.sendStaffRecovery(email);
      if (result && result.error) {
        deps.captureMessage("staff recovery mail failed", "warning", { role });
        return "staff_recovery_failed";
      }
      return "staff_recovery_sent";
    } catch (_err) {
      deps.captureMessage("staff recovery mail threw", "warning", { role });
      return "staff_recovery_failed";
    }
  }

  // Anything that is not a student stops here: no row, no mail.
  if (role !== "student") {
    return "not_a_student";
  }

  await deps.handleStudent(user.id, {
    role,
    teacher_id: profile && typeof profile.teacher_id === "string" ? profile.teacher_id : null,
    full_name: profile && typeof profile.full_name === "string" ? profile.full_name : null,
  });

  return "student_handled";
}
