// Section 173: Teacher-mediated password help — request endpoint.
//
// Called from login.html by a user who is NOT signed in. It never tells the caller anything
// about the account: every syntactically valid address gets the same body, and — since the
// response is sent before any account work begins — the same shape of timing.
//
// WHAT THIS ENDPOINT DOES NOT DO
//   - it issues no token, and the mail it sends carries no credential of any kind
//   - it never returns the teacher's address, name, id, or any internal outcome
//   - it grants no authority: the actual password change still goes through the existing
//     reset-student-password function, which re-verifies profiles.teacher_id server-side
//
// ROLE ROUTING (decided server-side, never by the client)
//   student            -> notify the teacher the student is linked to
//   teacher/super_admin -> ordinary Supabase recovery mail for their own account, unchanged
//   unknown address    -> nothing happens
// The caller cannot distinguish these three cases.
//
// TIMING SIDE-CHANNEL — WHY THE WORK IS BACKGROUNDED
// The first version did the account lookup, the rate-limit read and the Resend call BEFORE
// responding. Measured against production that made a real student take ~1753 ms and an unknown
// address ~695 ms: identical bodies, but the duration told them apart. A minimum-duration floor
// cannot fix that, because it can only raise the fast path — it cannot lower the slow one
// without guessing Resend's worst-case latency.
//
// So the whole pipeline now runs as a background task and the response is sent first. The
// outward path performs NO account-dependent work at all, which removes the channel by
// construction rather than by padding.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withObservability } from "../_shared/monitoring.ts";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// Server-side only. Never returned, never logged, never sent to the browser.
const RESEND_API_KEY    = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "";

// Navigation target for the mail link. The IDN production host in its ASCII (punycode) form,
// because mail clients and HTTP headers cannot be trusted with the Unicode form.
const APP_BASE_URL = (Deno.env.get("APP_BASE_URL") ?? "https://xn--lrlig-sra.dk").replace(/\/+$/, "");

// Rate limiting. Documented thresholds — see the PR body.
const COOLDOWN_MINUTES = 15;   // a second valid request inside this window sends no mail
const DAILY_CAP        = 5;    // hard ceiling per student per rolling 24h

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// The ONLY body this endpoint ever returns for a syntactically valid address.
const GENERIC_BODY = {
  ok: true,
  message: "Hvis kontoen findes, har din lærer fået besked.",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isPlausibleEmail(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 320) return false;
  // Deliberately permissive: this is an input sanity check, not an address validator. The
  // authority on whether an address exists is auth.users, and we never reveal that answer.
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed);
}

// Mirrors the guarded pattern already used by _shared/monitoring.ts:286-298.
//
// The fallback differs from monitoring's on purpose. Losing a telemetry flush is acceptable;
// losing a teacher's notification is not. So when the runtime cannot keep background work
// alive, we AWAIT the work instead of firing an unattended promise the isolate may kill. That
// costs the timing uniformity — a conscious, logged degradation, never a silently dropped mail.
function canBackground(): boolean {
  // deno-lint-ignore no-explicit-any
  const ER = (globalThis as any).EdgeRuntime;
  return !!ER && typeof ER.waitUntil === "function";
}

function background(promise: Promise<void>): void {
  // deno-lint-ignore no-explicit-any
  const ER = (globalThis as any).EdgeRuntime;
  ER.waitUntil(promise);
}

// auth.admin.listUsers() is paginated and has no server-side email filter, so page through and
// match case-insensitively. Mirrors the documented approach in tests/helpers.ts. At pilot scale
// (tens of accounts) this is a single page.
async function findUserByEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<{ id: string; email: string | null } | null> {
  const wanted = email.trim().toLowerCase();
  let page = 1;

  while (page <= 50) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;

    const users = Array.isArray(data?.users) ? data.users : [];
    if (users.length === 0) return null;

    for (const u of users) {
      if (!u || typeof u.id !== "string") continue;
      const candidate = typeof u.email === "string" ? u.email.trim().toLowerCase() : "";
      if (candidate && candidate === wanted) {
        return { id: u.id, email: typeof u.email === "string" ? u.email : null };
      }
    }

    if (users.length < 200) return null;
    page++;
  }

  return null;
}

// Escapes text placed into the HTML part of the mail. The only interpolated value is the
// student's display name, which comes from our own database, but it is user-editable text.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface MailResult {
  sent: boolean;
  reason: string | null;
}

// Sends the notification. Returns a controlled result; never throws to the caller, and never
// puts provider payloads, addresses or secrets into the returned reason.
async function sendTeacherNotification(
  teacherEmail: string,
  studentName: string,
  studentId: string,
): Promise<MailResult> {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    return { sent: false, reason: "mail_not_configured" };
  }

  const studentLink = `${APP_BASE_URL}/student-detail.html?id=${encodeURIComponent(studentId)}`;
  const subject = `${studentName} har glemt sin adgangskode til Lærlig`;

  // The link is NAVIGATION ONLY. Opening it without a teacher session shows nothing, and a
  // manipulated id changes nothing: student-detail.html requires a normal login, and
  // reset-student-password re-checks profiles.teacher_id server-side on every call.
  const text = [
    `${studentName} har bedt om hjælp til sin adgangskode.`,
    ``,
    `Log ind i Lærlig, åbn elevens side og vælg "Nulstil adgangskode".`,
    `Du får en midlertidig kode, som du giver til eleven. Eleven vælger selv en ny`,
    `adgangskode ved næste login.`,
    ``,
    studentLink,
    ``,
    `Dette link giver ingen adgang i sig selv — du skal være logget ind som elevens lærer.`,
  ].join("\n");

  const safeName = escapeHtml(studentName);
  const html = [
    `<p><strong>${safeName}</strong> har bedt om hjælp til sin adgangskode.</p>`,
    `<p>Log ind i Lærlig, åbn elevens side og vælg &quot;Nulstil adgangskode&quot;. Du får en`,
    `midlertidig kode, som du giver til eleven. Eleven vælger selv en ny adgangskode ved næste login.</p>`,
    `<p><a href="${escapeHtml(studentLink)}">Åbn elevens side i Lærlig</a></p>`,
    `<p style="color:#666;font-size:13px;">Dette link giver ingen adgang i sig selv — du skal`,
    `være logget ind som elevens lærer.</p>`,
  ].join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: [teacherEmail],
        subject,
        text,
        html,
      }),
    });

    if (!res.ok) {
      // Status only. The provider body can echo the recipient address, so it is not recorded.
      return { sent: false, reason: `resend_http_${res.status}` };
    }

    return { sent: true, reason: null };
  } catch (_err) {
    return { sent: false, reason: "resend_unreachable" };
  }
}

// deno-lint-ignore no-explicit-any
type Ctx = { captureException: (e: unknown, extra?: any) => void; captureMessage: (m: string, l?: string, extra?: any) => void };

// THE WHOLE PIPELINE. Runs after the response has been sent (or, in the degraded fallback,
// before it). It resolves in every case and never rejects, so it can never become an unhandled
// rejection inside a background task.
async function processHelpRequest(email: string, ctx: Ctx): Promise<void> {
  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const user = await findUserByEmail(admin, email);

    // Unknown address: nothing to do, nothing to record. No row is written, so the table can
    // never be used to enumerate what was tried.
    if (!user) return;

    const { data: profile } = await admin
      .from("profiles")
      .select("role, teacher_id, full_name")
      .eq("id", user.id)
      .maybeSingle();

    const role = profile && typeof profile.role === "string" ? profile.role : null;

    // Teachers and admins keep ordinary Supabase recovery. Sent with the anon key, which is
    // exactly what the browser used to do. No redirectTo is passed, so GoTrue uses its
    // configured Site URL — an address that is allow-listed by definition.
    if (role === "teacher" || role === "super_admin") {
      if (SUPABASE_ANON_KEY) {
        const publicClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { error: recoveryError } = await publicClient.auth.resetPasswordForEmail(email);
        if (recoveryError) {
          ctx.captureMessage("staff recovery mail failed", "warning", { role });
        }
      } else {
        ctx.captureMessage("staff recovery skipped: SUPABASE_ANON_KEY unset", "warning", { role });
      }
      return;
    }

    // Anything that is not a student stops here: no row, no mail.
    if (role !== "student") return;

    const studentId = user.id;
    const teacherId = typeof profile?.teacher_id === "string" && profile.teacher_id.length > 0
      ? profile.teacher_id
      : null;

    // ── Rate limiting ────────────────────────────────────────────────────────
    // Both windows are evaluated against this student's own history. Suppressed requests are
    // still recorded, so the audit trail shows the attempt and why no mail went out.
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: recentRows, error: recentError } = await admin
      .from("password_help_requests")
      .select("created_at, status")
      .eq("student_id", studentId)
      .gte("created_at", since24h)
      .order("created_at", { ascending: false })
      .limit(50);

    if (recentError) {
      // Fail closed: if the rate-limit state cannot be read, do not send mail.
      ctx.captureException(recentError, { stage: "rate_limit_read" });
      return;
    }

    const recent = Array.isArray(recentRows) ? recentRows : [];
    const notified = recent.filter((r) => r && r.status === "notified");

    if (notified.length >= DAILY_CAP) {
      await admin.from("password_help_requests").insert({
        student_id: studentId,
        teacher_id: teacherId,
        status: "suppressed_daily_cap",
        failure_reason: `cap_${DAILY_CAP}_per_24h`,
      });
      return;
    }

    const cooldownCutoff = Date.now() - COOLDOWN_MINUTES * 60 * 1000;
    const lastNotifiedAt = notified.length > 0 ? Date.parse(String(notified[0].created_at)) : NaN;

    if (Number.isFinite(lastNotifiedAt) && lastNotifiedAt > cooldownCutoff) {
      await admin.from("password_help_requests").insert({
        student_id: studentId,
        teacher_id: teacherId,
        status: "suppressed_cooldown",
        failure_reason: `cooldown_${COOLDOWN_MINUTES}m`,
      });
      return;
    }

    // ── Teacher lookup ───────────────────────────────────────────────────────
    if (!teacherId) {
      await admin.from("password_help_requests").insert({
        student_id: studentId,
        teacher_id: null,
        status: "no_teacher",
        failure_reason: "student_has_no_teacher",
      });
      return;
    }

    const { data: teacherUser, error: teacherError } = await admin.auth.admin.getUserById(teacherId);
    const teacherEmail = !teacherError && teacherUser?.user && typeof teacherUser.user.email === "string"
      ? teacherUser.user.email.trim()
      : "";

    if (!teacherEmail) {
      await admin.from("password_help_requests").insert({
        student_id: studentId,
        teacher_id: teacherId,
        status: "teacher_no_email",
        failure_reason: "teacher_missing_email",
      });
      return;
    }

    // ── Notify ───────────────────────────────────────────────────────────────
    const studentName =
      profile && typeof profile.full_name === "string" && profile.full_name.trim().length > 0
        ? profile.full_name.trim()
        : "En elev";

    const mail = await sendTeacherNotification(teacherEmail, studentName, studentId);

    await admin.from("password_help_requests").insert({
      student_id: studentId,
      teacher_id: teacherId,
      status: mail.sent ? "notified" : "mail_failed",
      notification_sent_at: mail.sent ? new Date().toISOString() : null,
      failure_reason: mail.sent ? null : mail.reason,
    });

    if (!mail.sent) {
      ctx.captureMessage("teacher notification not sent", "warning", { reason: mail.reason });
    }
  } catch (err) {
    // The response has already been sent by now, so there is nothing to change about it. The
    // failure is captured internally and swallowed here so the background task always settles.
    try {
      ctx.captureException(err, { stage: "process_help_request" });
    } catch (_e) { /* capture must never be the thing that breaks the task */ }
  }
}

serve(withObservability("request-password-help", async (req, ctx) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const body = await req.json().catch(() => null);
  const rawEmail = body && typeof body === "object" ? (body as Record<string, unknown>).email : undefined;

  // A malformed request is the one case that is NOT indistinguishable — it says nothing about
  // any account, only that the caller sent something that is not an address at all.
  if (!isPlausibleEmail(rawEmail)) {
    return jsonResponse({ ok: false, error: "email required" }, 400);
  }

  const email = rawEmail.trim();
  const work = processHelpRequest(email, ctx);

  if (canBackground()) {
    // Response first, work after: nothing account-dependent happens before we answer, so all
    // valid addresses are indistinguishable by duration as well as by body.
    background(work);
    return jsonResponse(GENERIC_BODY, 200);
  }

  // Degraded path: the runtime cannot keep background work alive. Correctness wins over
  // uniformity — we await rather than fire an unattended promise the isolate may kill, and we
  // record that the guarantee is reduced so it shows up rather than passing unnoticed.
  ctx.captureMessage("EdgeRuntime.waitUntil unavailable — help request processed inline", "warning");
  await work;
  return jsonResponse(GENERIC_BODY, 200);
}));
