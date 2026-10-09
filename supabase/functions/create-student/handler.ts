// The HTTP contract of create-student.
//
// Extracted from index.ts so the contract can be TESTED with fakes rather than asserted by
// reading the source — the same split request-password-help uses (handler.ts / index.ts).
//
// Pure by construction: no Supabase client, no fetch, no env, no serve(). index.ts supplies the
// real collaborators; tests/unit/create-student-handler.test.mjs supplies fakes and inspects the
// real Response objects.
//
// THE CONTRACT
//   - only a signed-in caller whose profiles.role is 'teacher' may create a pupil
//   - the pupil's profile is written with role 'student', teacher_id = the caller, and
//     must_reset_password = true, so the password the teacher typed really is temporary: on first
//     login js/login.js sends the pupil through the existing forced reset (reset-password.html?forced=1)
//   - the auth user and the profile are created in two steps and cannot share a transaction. If
//     the profile write fails, the auth user just created is DELETED again, so no half-created
//     account (an address that is taken but cannot log in) is left behind. If that clean-up fails
//     too, the response says so explicitly — it is never reported as an ordinary failure
//   - success keeps the shape the browser has always read: { success: true }. The password is
//     never echoed back, and no response carries the provider's error text

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Must match the browser-side minimum in js/teacher.js.
export const MIN_PASSWORD_LENGTH = 6;

export interface DepError {
  message?: string;
}

export interface CreateStudentDeps {
  // Resolves the verified user behind a bearer token, or null when the token is not valid.
  getUserId(token: string): Promise<string | null>;

  // The caller's role from public.profiles. Returns null when no profile row exists; THROWS on a
  // read failure, so a technical fault can never be mistaken for "not a teacher" or for permission.
  getRole(userId: string): Promise<string | null>;

  createAuthUser(email: string, password: string): Promise<{ id: string | null; error: DepError | null }>;

  // Writes the pupil's profile: role 'student', teacher_id, must_reset_password = true.
  writeStudentProfile(studentId: string, teacherId: string): Promise<{ error: DepError | null }>;

  deleteAuthUser(userId: string): Promise<{ error: DepError | null }>;

  // Internal diagnostics. Never given an address or a password.
  logError(stage: string, detail: Record<string, unknown>): void;
}

export function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export function isPlausibleEmail(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 320) return false;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed);
}

export function createHandler(deps: CreateStudentDeps): (req: Request) => Promise<Response> {
  return async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: CORS_HEADERS });
    }

    if (req.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, 405);
    }

    try {
      // ── 1. Who is calling ────────────────────────────────────────────────
      const authHeader = req.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return jsonResponse({ error: "unauthorized" }, 401);
      }

      const token = authHeader.slice("Bearer ".length).trim();
      if (!token) {
        return jsonResponse({ error: "unauthorized" }, 401);
      }

      const callerId = await deps.getUserId(token);
      if (!callerId) {
        return jsonResponse({ error: "unauthorized" }, 401);
      }

      // ── 2. Only teachers ─────────────────────────────────────────────────
      const role = await deps.getRole(callerId);
      if (role !== "teacher") {
        return jsonResponse({ error: "forbidden" }, 403);
      }

      // ── 3. Input ─────────────────────────────────────────────────────────
      const body = await req.json().catch(() => null);
      const rawEmail    = body && typeof body === "object" ? (body as Record<string, unknown>).email : undefined;
      const rawPassword = body && typeof body === "object" ? (body as Record<string, unknown>).password : undefined;

      if (!isPlausibleEmail(rawEmail)) {
        return jsonResponse({ error: "invalid_email" }, 400);
      }

      if (typeof rawPassword !== "string" || rawPassword.trim().length < MIN_PASSWORD_LENGTH) {
        return jsonResponse({ error: "invalid_password" }, 400);
      }

      const email    = rawEmail.trim();
      const password = rawPassword.trim();

      // ── 4. The auth user ─────────────────────────────────────────────────
      const created = await deps.createAuthUser(email, password);
      if (created.error || !created.id) {
        // The provider's text is not returned: it is not the caller's business, and it is not
        // Danish. The reason stays in the server log.
        deps.logError("create_auth_user", { reason: created.error?.message ?? "no user returned" });
        return jsonResponse({ error: "create_failed" }, 400);
      }

      const studentId = created.id;

      // ── 5. The profile, flagged for a forced password change ─────────────
      const written = await deps.writeStudentProfile(studentId, callerId);
      if (!written.error) {
        return jsonResponse({ success: true }, 200);
      }

      deps.logError("write_student_profile", { student_id: studentId, reason: written.error.message ?? "unknown" });

      // ── 6. Partial failure: undo the auth user ───────────────────────────
      const undone = await deps.deleteAuthUser(studentId);
      if (undone.error) {
        deps.logError("rollback_delete_auth_user", {
          student_id: studentId,
          reason: undone.error.message ?? "unknown",
        });
        return jsonResponse({ error: "profile_failed_rollback_failed" }, 500);
      }

      return jsonResponse({ error: "profile_failed" }, 500);
    } catch (err) {
      deps.logError("unhandled", { reason: err instanceof Error ? err.message : String(err) });
      return jsonResponse({ error: "internal_error" }, 500);
    }
  };
}
