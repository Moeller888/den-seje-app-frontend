// Section 173: Teacher-mediated password help — request endpoint.
//
// Called from login.html by a user who is NOT signed in. It never tells the caller anything
// about the account: every syntactically valid address gets the same body, status and headers,
// and — since the response is produced before any account work begins — the same timing.
//
// This file is WIRING ONLY. The behaviour lives in three pure modules that carry no client, no
// fetch and no env, so each can be tested with fakes and no network:
//
//   handler.ts          the HTTP contract (status, body, headers, background scheduling)
//   route.ts            classification: unknown / staff / student
//   student-pipeline.ts the student flow: teacher lookup, atomic reservation, mail, finalise
//
// WHAT THIS ENDPOINT DOES NOT DO
//   - it issues no token, and the mail it sends carries no credential of any kind
//   - it never returns the teacher's address, name, id, or any internal outcome
//   - it grants no authority: the password change still goes through reset-student-password,
//     which re-verifies profiles.teacher_id server-side on every call
//
// ERROR POLICY
// Every Supabase and Auth call below checks `error` and THROWS on failure. A technical fault is
// never allowed to become a business outcome — a failed profile read must not read as "not a
// student", and a failed auth lookup must not read as "the teacher has no address". Throws are
// caught once, at the bottom, and captured without any address, id, token or provider payload.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withObservability } from "../_shared/monitoring.ts";
import { createHandler } from "./handler.ts";
import { routeHelpRequest } from "./route.ts";
import { runStudentPipeline } from "./student-pipeline.ts";
import type { MailResult, ReserveResult } from "./student-pipeline.ts";
import { assertFinalizedExactlyOne, parseReserveResult } from "./adapters.ts";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// Server-side only. Never returned, never logged, never sent to the browser.
const RESEND_API_KEY    = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "";

// Navigation target for the mail link. The IDN production host in its ASCII (punycode) form,
// because mail clients and HTTP headers cannot be trusted with the Unicode form.
const APP_BASE_URL = (Deno.env.get("APP_BASE_URL") ?? "https://xn--lrlig-sra.dk").replace(/\/+$/, "");

// Rate-limit parameters. Enforced inside reserve_password_help, not here.
const COOLDOWN_MINUTES = 15;
const DAILY_CAP        = 5;

// ── Minimal structural client types ─────────────────────────────────────────
// Naming only what is actually used keeps `deno check` happy (the concrete client is
// SupabaseClient<any,"public","public",...>, which does not match the un-parameterised default)
// and makes each helper's dependency legible.

interface QueryResult<T> {
  data: T | null;
  error: { message?: string } | null;
}

interface AdminClient {
  auth: {
    admin: {
      listUsers(params: { page: number; perPage: number }): Promise<
        QueryResult<{ users?: Array<{ id?: unknown; email?: unknown }> }>
      >;
      getUserById(id: string): Promise<QueryResult<{ user?: { email?: unknown } | null }>>;
    };
  };
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
  // deno-lint-ignore no-explicit-any
  rpc(fn: string, args: Record<string, unknown>): Promise<QueryResult<any>>;
}

function fail(stage: string, error: { message?: string } | null): never {
  // The message is ours, not the caller's data: no address, id, token or provider body.
  throw new Error(`${stage} failed: ${error?.message ?? "unknown error"}`);
}

// ── Lookups ─────────────────────────────────────────────────────────────────

// auth.admin.listUsers() is paginated and has no server-side email filter, so page through and
// match case-insensitively. Mirrors the documented approach in tests/helpers.ts. At pilot scale
// (tens of accounts) this is a single page.
async function findUserByEmail(
  admin: AdminClient,
  email: string,
): Promise<{ id: string; email: string | null } | null> {
  const wanted = email.trim().toLowerCase();
  let page = 1;

  while (page <= 50) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail("listUsers", error);

    const users = Array.isArray(data?.users) ? data!.users! : [];
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

// ── Mail ────────────────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Returns a controlled result; never throws, and never puts provider payloads, addresses or
// secrets into the returned reason.
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
      body: JSON.stringify({ from: RESEND_FROM_EMAIL, to: [teacherEmail], subject, text, html }),
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

// ── Pipeline wiring ─────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type Ctx = { captureException: (e: unknown, extra?: any) => void; captureMessage: (m: string, l?: string, extra?: any) => void };

async function insertAudit(
  admin: AdminClient,
  stage: string,
  row: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin.from("password_help_requests").insert(row);
  if (error) fail(stage, error);
}

// Resolves every outcome internally and never rejects, so it can never become an unhandled
// rejection inside a background task.
async function processHelpRequest(email: string, ctx: Ctx): Promise<void> {
  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    }) as unknown as AdminClient;

    await routeHelpRequest(email, {
      findUserByEmail: (address) => findUserByEmail(admin, address),

      loadProfile: async (userId) => {
        const { data, error } = await admin
          .from("profiles")
          .select("role, teacher_id, full_name")
          .eq("id", userId)
          .maybeSingle();
        // A failed read must NOT look like "no profile", which the router would treat as
        // "not a student" and discard the request in silence.
        if (error) fail("profile lookup", error);
        if (!data) return null;
        return {
          role:       typeof data.role === "string" ? data.role : null,
          teacher_id: typeof data.teacher_id === "string" ? data.teacher_id : null,
          full_name:  typeof data.full_name === "string" ? data.full_name : null,
        };
      },

      // Sent with the anon key, which is exactly what the browser used to do. No redirectTo is
      // passed, so GoTrue uses its configured Site URL — an address allow-listed by definition.
      sendStaffRecovery: SUPABASE_ANON_KEY
        ? async (address: string) => {
            const publicClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
              auth: { autoRefreshToken: false, persistSession: false },
            });
            const { error } = await publicClient.auth.resetPasswordForEmail(address);
            return { error: error ?? null };
          }
        : null,

      captureMessage: (message, level, extra) => ctx.captureMessage(message, level, extra),

      // The outcome is deliberately discarded here: the router's contract is void, and nothing
      // about the response may depend on what the pipeline concluded.
      handleStudent: async (studentId, studentProfile) => {
        await runStudentPipeline(studentId, studentProfile, {
          auditNoTeacher: (id) =>
            insertAudit(admin, "audit no_teacher", {
              student_id: id,
              teacher_id: null,
              status: "no_teacher",
              failure_reason: "student_has_no_teacher",
            }),

          getTeacherEmail: async (teacherId) => {
            const { data, error } = await admin.auth.admin.getUserById(teacherId);
            // A transport/auth failure is NOT "the teacher has no address".
            if (error) fail("teacher lookup", error);
            const address = data?.user && typeof data.user.email === "string" ? data.user.email.trim() : "";
            return address;
          },

          auditTeacherNoEmail: (id, teacherId) =>
            insertAudit(admin, "audit teacher_no_email", {
              student_id: id,
              teacher_id: teacherId,
              status: "teacher_no_email",
              failure_reason: "teacher_missing_email",
            }),

          reserve: async (id, teacherId): Promise<ReserveResult> => {
            const { data, error } = await admin.rpc("reserve_password_help", {
              p_student_id: id,
              p_teacher_id: teacherId,
              p_cooldown_minutes: COOLDOWN_MINUTES,
              p_daily_cap: DAILY_CAP,
            });
            if (error) fail("reserve_password_help", error);
            // Only the three documented decisions are accepted. A malformed answer throws
            // rather than being read as a suppression (which would silently stop help) or as
            // permission (which would send mail without a reservation).
            return parseReserveResult(data);
          },

          sendMail: (teacherEmail, studentName, id) =>
            sendTeacherNotification(teacherEmail, studentName, id),

          finalize: async (requestId, status, reason) => {
            // Scoped to the reserved row AND its expected current state: a row that is no longer
            // 'reserved' must not be overwritten. RETURNING gives back what actually changed,
            // because a PostgREST update that matches zero rows reports no error at all.
            const { data, error } = await admin
              .from("password_help_requests")
              .update({
                status,
                notification_sent_at: status === "notified" ? new Date().toISOString() : null,
                failure_reason: reason,
              })
              .eq("id", requestId)
              .eq("status", "reserved")
              .select("id, status");
            if (error) fail("finalize reservation", error);
            assertFinalizedExactlyOne(data, requestId, status);
          },

          captureMessage: (message, level, extra) => ctx.captureMessage(message, level, extra),
          captureException: (error, extra) => ctx.captureException(error, extra),
        });
      },
    });
  } catch (err) {
    // The response was sent long before this. The failure is captured internally and swallowed
    // here so the background task always settles.
    try {
      ctx.captureException(err, { stage: "process_help_request" });
    } catch (_e) { /* capture must never be the thing that breaks the task */ }
  }
}

// Mirrors the guarded pattern in _shared/monitoring.ts:286-298. The fallback differs on
// purpose: losing a telemetry flush is acceptable, losing a teacher's notification is not, so
// when the runtime cannot keep background work alive the caller awaits instead of firing an
// unattended promise the isolate may kill.
function scheduleBackground(work: Promise<void>): boolean {
  // deno-lint-ignore no-explicit-any
  const ER = (globalThis as any).EdgeRuntime;
  if (ER && typeof ER.waitUntil === "function") {
    ER.waitUntil(work);
    return true;
  }
  return false;
}

serve(withObservability("request-password-help", (req, ctx) =>
  createHandler({
    process: (email) => processHelpRequest(email, ctx),
    scheduleBackground,
    captureMessage: (message, level, extra) => ctx.captureMessage(message, level, extra),
  })(req)
));
