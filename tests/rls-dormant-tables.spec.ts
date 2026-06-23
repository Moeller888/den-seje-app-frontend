// Section 153: RLS hardening regression tests for dormant legacy tables.
// Locks in the deny-all posture on public.student_answers and
// public.question_attempt_audit:
//   - anon cannot read either table
//   - authenticated student cannot read either table
//   - service_role still reads both (admin/test fixtures unaffected)
//   - admin stats views (attempt_stats, question_performance) still load —
//     they are owner-rights views, used by js/admin.js
//
// API-only spec (no browser) — runs once per project; skipped off-chromium
// to avoid triple execution.

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import * as path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SUPABASE_URL              = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Public anon key — already in deployed frontend JS, not a secret.
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqemJlaHdmYWdpd3B3b2RzZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2ODc5OTQsImV4cCI6MjA4NzI2Mzk5NH0.BzepnYLe6Khzqx9vTL3Ifa_zMRgjoGQ9Lw5seaoKMMc";

const STUDENT_EMAIL    = process.env.TEST_STUDENT_EMAIL!;
const STUDENT_PASSWORD = process.env.TEST_STUDENT_PASSWORD!;

const LOCKED_TABLES = ["student_answers", "question_attempt_audit"] as const;
const ADMIN_VIEWS   = ["attempt_stats", "question_performance"] as const;

let anonClient:    ReturnType<typeof createClient>;
let studentClient: ReturnType<typeof createClient>;
let adminClient:   ReturnType<typeof createClient>;

test.beforeAll(async () => {
  // Pristine anon client — must NEVER sign in (a signIn would store the
  // session in-memory and silently authenticate later anon assertions).
  anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Separate throwaway client for the student sign-in.
  const loginClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error } = await loginClient.auth.signInWithPassword({
    email: STUDENT_EMAIL,
    password: STUDENT_PASSWORD,
  });
  if (error || !session.session) {
    throw new Error(`Student sign-in failed: ${error?.message}`);
  }

  studentClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test("1. anon cannot read student_answers or question_attempt_audit", async ({
  browserName,
}) => {
  test.skip(browserName !== "chromium", "API dedup");

  for (const table of LOCKED_TABLES) {
    const { data, error } = await anonClient.from(table).select("*").limit(1);

    expect(error, `anon SELECT on ${table} must be rejected`).not.toBeNull();
    expect(data ?? null, `anon SELECT on ${table} must return no rows`).toBeNull();
  }
});

test("2. authenticated student cannot read either table", async ({ browserName }) => {
  test.skip(browserName !== "chromium", "API dedup");

  for (const table of LOCKED_TABLES) {
    const { data, error } = await studentClient.from(table).select("*").limit(1);

    expect(error, `student SELECT on ${table} must be rejected`).not.toBeNull();
    expect(data ?? null, `student SELECT on ${table} must return no rows`).toBeNull();
  }
});

test("3. anon cannot write to either table", async ({ browserName }) => {
  test.skip(browserName !== "chromium", "API dedup");

  // Insert attempts with minimal payloads — both must be rejected at the
  // privilege layer, never reaching constraint validation.
  const { error: saError } = await anonClient.from("student_answers").insert({
    student_id: "00000000-0000-0000-0000-000000000000",
    question_id: "00000000-0000-0000-0000-000000000000",
    answer_text: "rls-test",
  });
  expect(saError, "anon INSERT on student_answers must be rejected").not.toBeNull();

  const { error: qaError } = await anonClient.from("question_attempt_audit").insert({
    student_id: "00000000-0000-0000-0000-000000000000",
    question_instance_id: "00000000-0000-0000-0000-000000000000",
    already_processed: false,
  });
  expect(qaError, "anon INSERT on question_attempt_audit must be rejected").not.toBeNull();
});

test("4. service_role still reads both tables", async ({ browserName }) => {
  test.skip(browserName !== "chromium", "API dedup");

  for (const table of LOCKED_TABLES) {
    const { error, count } = await adminClient
      .from(table)
      .select("*", { count: "exact", head: true });

    expect(error, `service_role SELECT on ${table} failed: ${error?.message}`).toBeNull();
    expect(typeof count, `service_role count on ${table} must be a number`).toBe("number");
  }
});

test("5. admin stats views still load for an authenticated user", async ({
  browserName,
}) => {
  test.skip(browserName !== "chromium", "API dedup");

  // attempt_stats / question_performance are owner-rights views consumed by
  // js/admin.js (super_admin session = authenticated role). The view grant is
  // role-based, so an authenticated student client proves the grant path.
  for (const view of ADMIN_VIEWS) {
    const { error } = await studentClient.from(view).select("*").limit(1);

    expect(error, `authenticated SELECT on view ${view} failed: ${error?.message}`).toBeNull();
  }
});
