// Section 173: the student branch of a password-help request.
//
// Pure by construction: no Supabase client, no fetch, no env, no imports. Every collaborator
// arrives through `deps`, so the whole flow — including the failure paths that used to be
// invisible — can be exercised with fakes and no network.
//
// TWO RULES THIS MODULE EXISTS TO ENFORCE
//
// 1. A technical failure is never written down as a business outcome. A database or auth fault
//    THROWS. It does not become 'teacher_no_email', it does not become "no teacher", and it
//    never silently disappears. Only a successful lookup that genuinely returns no address may
//    record 'teacher_no_email'.
//
// 2. No mail without a reservation. The rate-limit decision is made atomically in the database
//    (reserve_password_help). Mail may only be attempted when that decision came back
//    'reserved', and the reservation itself counts against cooldown and cap — so a crash
//    between reserving and finalising costs a missed notification, never a duplicate one.

export interface StudentProfile {
  teacher_id: string | null;
  full_name: string | null;
}

export type ReserveDecision = "reserved" | "suppressed_cooldown" | "suppressed_daily_cap";

export interface ReserveResult {
  decision: ReserveDecision;
  requestId: string;
}

export interface MailResult {
  sent: boolean;
  reason: string | null;
}

export interface StudentPipelineDeps {
  // Writes the 'no_teacher' audit row. Throws if the write fails — a lost audit row is a
  // failure, not a detail.
  auditNoTeacher(studentId: string): Promise<void>;

  // Resolves the teacher's address. THROWS on an auth/transport failure; returns "" only when
  // the lookup succeeded and the account genuinely has no usable address.
  getTeacherEmail(teacherId: string): Promise<string>;

  auditTeacherNoEmail(studentId: string, teacherId: string): Promise<void>;

  // The atomic decision. Throws if the database call fails, so the flow fails closed.
  reserve(studentId: string, teacherId: string): Promise<ReserveResult>;

  sendMail(teacherEmail: string, studentName: string, studentId: string): Promise<MailResult>;

  // Updates the reserved row to its final status. Throws if the update fails.
  finalize(requestId: string, status: "notified" | "mail_failed" | "technical_error", reason: string | null): Promise<void>;

  captureMessage(message: string, level?: string, extra?: Record<string, unknown>): void;
  captureException(error: unknown, extra?: Record<string, unknown>): void;
}

export type StudentOutcome =
  | "no_teacher"
  | "teacher_no_email"
  | "suppressed_cooldown"
  | "suppressed_daily_cap"
  | "notified"
  | "mail_failed"
  | "technical_error";

export function displayName(profile: StudentProfile): string {
  const raw = profile && typeof profile.full_name === "string" ? profile.full_name.trim() : "";
  return raw.length > 0 ? raw : "En elev";
}

export async function runStudentPipeline(
  studentId: string,
  profile: StudentProfile,
  deps: StudentPipelineDeps,
): Promise<StudentOutcome> {
  const teacherId =
    typeof profile.teacher_id === "string" && profile.teacher_id.length > 0 ? profile.teacher_id : null;

  // ── No teacher ────────────────────────────────────────────────────────────
  if (!teacherId) {
    await deps.auditNoTeacher(studentId);
    return "no_teacher";
  }

  // ── Teacher address ───────────────────────────────────────────────────────
  // Deliberately BEFORE the reservation: a lookup that ends in "this student cannot be helped"
  // must not burn a slot in the rate-limit budget. A failure here throws, so it can never be
  // mistaken for "the teacher has no address".
  const teacherEmail = await deps.getTeacherEmail(teacherId);

  if (!teacherEmail) {
    await deps.auditTeacherNoEmail(studentId, teacherId);
    return "teacher_no_email";
  }

  // ── Atomic reservation ────────────────────────────────────────────────────
  // Everything after this point is gated on holding a reservation. A throw here propagates:
  // no reservation, no mail.
  const reservation = await deps.reserve(studentId, teacherId);

  if (reservation.decision !== "reserved") {
    return reservation.decision;
  }

  // ── Mail ──────────────────────────────────────────────────────────────────
  let mail: MailResult;
  try {
    mail = await deps.sendMail(teacherEmail, displayName(profile), studentId);
  } catch (err) {
    // The provider threw rather than returning a result. This outcome is AMBIGUOUS: the message
    // may already have been accepted before the answer was lost. 'technical_error' therefore
    // counts against cooldown and cap exactly like 'notified' and 'mail_failed' do (see
    // 20260808010000_password_help_reserve_rpc.sql) — the row is finalised truthfully rather
    // than left as 'reserved', without that costing the rate-limit effect.
    deps.captureException(err, { stage: "send_mail" });
    try {
      await deps.finalize(reservation.requestId, "technical_error", "mail_threw");
    } catch (finalizeErr) {
      deps.captureException(finalizeErr, { stage: "finalize_after_mail_threw" });
    }
    return "technical_error";
  }

  // ── Finalise ──────────────────────────────────────────────────────────────
  // If this update fails the row remains 'reserved', which still counts against cooldown and
  // cap — the rate-limit effect survives even though the audit trail is now imprecise. Both the
  // provider failure and the audit failure are reported; neither hides the other.
  try {
    await deps.finalize(
      reservation.requestId,
      mail.sent ? "notified" : "mail_failed",
      mail.sent ? null : mail.reason,
    );
  } catch (finalizeErr) {
    deps.captureException(finalizeErr, { stage: "finalize" });
    if (!mail.sent) {
      deps.captureMessage("teacher notification not sent", "warning", { reason: mail.reason });
    }
    throw finalizeErr;
  }

  if (!mail.sent) {
    deps.captureMessage("teacher notification not sent", "warning", { reason: mail.reason });
    return "mail_failed";
  }

  return "notified";
}
