// Section 145-fix: set_student_domains null-grade validation tests.
//
// Verifies that the RPC rejects invalid domain assignments regardless of
// whether the student has a grade set — closing the null-grade bypass
// that allowed any domain to be assigned when selected_grade IS NULL.
//
// Cases exercised:
//   1. grade=NULL + valid domain      → succeeds
//   2. grade=NULL + nonexistent domain → fails (null-grade bypass now closed)
//   3. grade=7    + nonexistent domain → fails with grade-specific message
//      (Note: profiles_selected_grade_check limits valid grades to 7-9, and all
//      real domains have questions at target_grade ≤ 7, so a fake domain is the
//      only reproducible failure case with a valid grade value.)
//   4. grade=8    + cold_war (has grade-7/8 questions)  → succeeds

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import * as path from "path";
import {
  TEACHER_EMAIL,
  TEACHER_PASSWORD,
  STUDENT2_EMAIL,
  findAuthUserByEmail,
} from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SUPABASE_URL           = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// Public anon key — already shipped in frontend JS, not a secret.
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqemJlaHdmYWdpd3B3b2RzZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2ODc5OTQsImV4cCI6MjA4NzI2Mzk5NH0.BzepnYLe6Khzqx9vTL3Ifa_zMRgjoGQ9Lw5seaoKMMc';

let adminClient:   ReturnType<typeof createClient>;
let teacherClient: ReturnType<typeof createClient>;
let student2Id:    string;
let originalGrade: number | null;

test.beforeAll(async () => {
  adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Resolve student2 ID
  const s2 = await findAuthUserByEmail(adminClient, STUDENT2_EMAIL);
  if (!s2) throw new Error(`student2 not found: ${STUDENT2_EMAIL}`);
  student2Id = s2.id;

  // Save current grade so we can restore it after tests
  const { data: profile } = await adminClient
    .from("profiles")
    .select("selected_grade")
    .eq("id", student2Id)
    .maybeSingle();
  originalGrade = profile?.selected_grade ?? null;

  // Sign in as teacher to get an authenticated client for RPC calls
  teacherClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await teacherClient.auth.signInWithPassword({
    email:    TEACHER_EMAIL,
    password: TEACHER_PASSWORD,
  });
  if (signInErr) throw new Error(`Teacher sign-in failed: ${signInErr.message}`);
});

test.afterAll(async () => {
  // Restore student2 to original grade and clear any domain assignment
  await adminClient
    .from("profiles")
    .update({ selected_grade: originalGrade, active_domains: null })
    .eq("id", student2Id);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function setStudentGrade(grade: number | null) {
  const { error } = await adminClient
    .from("profiles")
    .update({ selected_grade: grade })
    .eq("id", student2Id);
  if (error) throw new Error(`setStudentGrade(${grade}) failed: ${error.message}`);

  // Verify the write landed before the RPC reads it.
  const { data } = await adminClient
    .from("profiles")
    .select("selected_grade")
    .eq("id", student2Id)
    .maybeSingle();
  if (data?.selected_grade !== grade) {
    throw new Error(
      `setStudentGrade(${grade}): write did not persist — DB has ${data?.selected_grade}`
    );
  }
}

async function assignDomains(domains: string[]) {
  return teacherClient.rpc("set_student_domains", {
    p_student_id: student2Id,
    p_domains:    domains,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("1. grade=NULL + valid domain → assignment succeeds", async () => {
  await setStudentGrade(null);

  const { error } = await assignDomains(["cold_war"]);

  expect(error).toBeNull();

  // Verify it was actually written
  const { data } = await adminClient
    .from("profiles")
    .select("active_domains")
    .eq("id", student2Id)
    .maybeSingle();
  expect(data?.active_domains).toEqual(["cold_war"]);
});

test("2. grade=NULL + nonexistent domain → assignment fails with clear error", async () => {
  await setStudentGrade(null);

  const { error } = await assignDomains(["fake_domain_xyz"]);

  expect(error).not.toBeNull();
  expect(error!.message).toMatch(/fake_domain_xyz/);
  expect(error!.message).toMatch(/does not exist or has no questions/i);
});

test("3. grade=7 + nonexistent domain → fails with grade-specific message", async () => {
  // profiles_selected_grade_check only allows grades 7-9.
  // All real domains have questions accessible to grade-7 students, so a fake
  // domain is the only reproducible failure with a valid grade value.
  await setStudentGrade(7);

  const { error } = await assignDomains(["nonexistent_domain_7"]);

  expect(error).not.toBeNull();
  expect(error!.message).toMatch(/nonexistent_domain_7/);
  // With grade set, the error message names the grade (not the "no questions" fallback).
  expect(error!.message).toMatch(/grade 7/i);
});

test("4. grade=8 + cold_war (has grade-7/8 questions) → assignment succeeds", async () => {
  await setStudentGrade(8);

  const { error } = await assignDomains(["cold_war"]);

  expect(error).toBeNull();

  const { data } = await adminClient
    .from("profiles")
    .select("active_domains")
    .eq("id", student2Id)
    .maybeSingle();
  expect(data?.active_domains).toEqual(["cold_war"]);
});

test("5. grade=9 + multiple valid domains → assignment succeeds", async () => {
  await setStudentGrade(9);

  const { error } = await assignDomains(["cold_war", "democracy_power", "vikings"]);

  expect(error).toBeNull();
});

test("6. grade=NULL + null domains (reset) → always succeeds regardless of fix", async () => {
  await setStudentGrade(null);

  const { error } = await teacherClient.rpc("set_student_domains", {
    p_student_id: student2Id,
    p_domains:    null,
  });

  expect(error).toBeNull();

  const { data } = await adminClient
    .from("profiles")
    .select("active_domains")
    .eq("id", student2Id)
    .maybeSingle();
  expect(data?.active_domains).toBeNull();
});
