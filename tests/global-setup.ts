import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import * as path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const TEST_STUDENT_EMAIL = "christnmoeller@hotmail.com";

// ── Section 97: Teacher test account constants ────────────────────────────────
// Can be overridden via .env: TEST_TEACHER_EMAIL, TEST_TEACHER_PASSWORD,
// TEST_STUDENT2_EMAIL. Defaults are used if not set.
const TEST_TEACHER_EMAIL   = process.env.TEST_TEACHER_EMAIL   ?? "teacher-test@hotmail.com";
const TEST_TEACHER_PASSWORD = process.env.TEST_TEACHER_PASSWORD ?? "TestTeacher2026!";
const TEST_STUDENT2_EMAIL  = process.env.TEST_STUDENT2_EMAIL  ?? "student-teacher-test@hotmail.com";

// ── Section 95: Question Pool Health Check ───────────────────────────────────
//
// Thresholds set at ~50% of inventory audited 2026-05-31:
//   Total active: 656  → minimum 300
//   Grade 3:       25  → minimum  15  (tightest grade)
//   Grade 4–6:     50  → minimum  25
//   Grade 7–8:   182+  → minimum  50
//   Grade 9:       76  → minimum  25
//   Per domain:    50+ → minimum  20
//   Adaptive: each grade needs ≥ 2 bands with ≥ 3 questions each
//
// Per-run consumption: ~45 instances created, all deleted before the next run.
// Pool depletion within a single run is not possible at current scale.
// Thresholds guard against bulk deactivation or accidental content removal.

const TOTAL_MIN = 300;

const GRADE_MIN: Record<number, number> = {
  3: 15,
  4: 25,
  5: 25,
  6: 25,
  7: 50,
  8: 50,
  9: 25,
};

const DOMAINS = [
  "prehistoric_denmark",
  "vikings",
  "middle_ages",
  "reformation_monarchy",
  "enlightenment",
  "revolutions_democracy",
  "industrialisation",
  "world_war_1",
  "world_war_2",
  "cold_war",
  "democracy_power",
] as const;

const DOMAIN_MIN = 20;

// Adaptive viability: a grade needs at least this many distinct bands,
// each containing at least this many questions.
const ADAPTIVE_MIN_BANDS = 2;
const ADAPTIVE_MIN_PER_BAND = 3;

async function checkQuestionPoolHealth(supabase: any): Promise<void> {
  const failures: string[] = [];

  // 1. Total active questions
  const { count: activeTotal, error: totalError } = await supabase
    .from("questions")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);

  if (totalError) {
    throw new Error(`health-check: total count query failed — ${totalError.message}`);
  }

  const total = activeTotal ?? 0;

  if (total < TOTAL_MIN) {
    failures.push(
      `Total Active Questions:\n  Current:  ${total}\n  Required: ${TOTAL_MIN}`
    );
  }

  // 2. Active questions by grade
  const { data: gradeRows, error: gradeError } = await supabase
    .from("questions")
    .select("target_grade")
    .eq("is_active", true)
    .not("target_grade", "is", null);

  if (gradeError) {
    throw new Error(`health-check: grade query failed — ${gradeError.message}`);
  }

  const gradeCounts: Record<number, number> = {};
  for (const row of gradeRows ?? []) {
    const g = row.target_grade as number;
    gradeCounts[g] = (gradeCounts[g] ?? 0) + 1;
  }

  for (const [gradeStr, min] of Object.entries(GRADE_MIN)) {
    const grade = Number(gradeStr);
    const current = gradeCounts[grade] ?? 0;
    if (current < min) {
      failures.push(
        `Grade ${grade}:\n  Current:  ${current}\n  Required: ${min}`
      );
    }
  }

  // 3. Active questions by domain
  const { data: domainRows, error: domainError } = await supabase
    .from("questions")
    .select("learning_objective")
    .eq("is_active", true)
    .in("learning_objective", [...DOMAINS]);

  if (domainError) {
    throw new Error(`health-check: domain query failed — ${domainError.message}`);
  }

  const domainCounts: Record<string, number> = {};
  for (const row of domainRows ?? []) {
    const d = row.learning_objective as string;
    domainCounts[d] = (domainCounts[d] ?? 0) + 1;
  }

  for (const domain of DOMAINS) {
    const current = domainCounts[domain] ?? 0;
    if (current < DOMAIN_MIN) {
      failures.push(
        `Domain "${domain}":\n  Current:  ${current}\n  Required: ${DOMAIN_MIN}`
      );
    }
  }

  // 4. Adaptive viability — each grade needs ≥ ADAPTIVE_MIN_BANDS bands
  //    with ≥ ADAPTIVE_MIN_PER_BAND questions each
  const { data: bandRows, error: bandError } = await supabase
    .from("questions")
    .select("target_grade, difficulty_band")
    .eq("is_active", true)
    .not("target_grade", "is", null)
    .not("difficulty_band", "is", null);

  if (bandError) {
    throw new Error(`health-check: band query failed — ${bandError.message}`);
  }

  const bandMap: Record<number, Record<number, number>> = {};
  for (const row of bandRows ?? []) {
    const g = row.target_grade as number;
    const b = row.difficulty_band as number;
    if (!bandMap[g]) bandMap[g] = {};
    bandMap[g][b] = (bandMap[g][b] ?? 0) + 1;
  }

  for (const gradeStr of Object.keys(GRADE_MIN)) {
    const grade = Number(gradeStr);
    const bands = bandMap[grade] ?? {};
    const viableBands = Object.values(bands).filter(cnt => cnt >= ADAPTIVE_MIN_PER_BAND);

    if (viableBands.length < ADAPTIVE_MIN_BANDS) {
      failures.push(
        `Grade ${grade} Adaptive Viability:\n` +
        `  Viable bands (≥${ADAPTIVE_MIN_PER_BAND} questions each): ${viableBands.length}\n` +
        `  Required: ${ADAPTIVE_MIN_BANDS}`
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(
      "\n\n╔══════════════════════════════════════════════════╗\n" +
      "║   Question Pool Health Check FAILED             ║\n" +
      "╚══════════════════════════════════════════════════╝\n\n" +
      failures.map(f => `  ✗ ${f}`).join("\n\n") +
      "\n\nFix the question inventory before running the test suite.\n"
    );
  }

  console.log(
    `[global-setup] Health check passed — ${total} active questions ` +
    `(min ${TOTAL_MIN} total, all grades and domains within thresholds)`
  );
}

// ── Section 97: Teacher test account provisioning ────────────────────────────
// Creates dedicated isolated teacher + student accounts for teacher-dashboard
// tests. Does NOT touch the existing test student or their teacher relationship.
// Idempotent: safe to run on every test suite invocation.

async function ensureTeacherTestAccounts(supabase: any): Promise<void> {
  const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    throw new Error(`teacher-setup: listUsers failed — ${listError.message}`);
  }
  const allUsers: any[] = usersData?.users ?? [];

  // ── Test teacher ─────────────────────────────────────────────────────────

  let teacherUser = allUsers.find((u: any) => u.email === TEST_TEACHER_EMAIL);
  let teacherId: string;

  if (!teacherUser) {
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: TEST_TEACHER_EMAIL,
      password: TEST_TEACHER_PASSWORD,
      email_confirm: true,
    });
    if (createErr) {
      throw new Error(`teacher-setup: createUser (teacher) failed — ${createErr.message}`);
    }
    teacherId = created.user.id;
    console.log(`[global-setup] Created test teacher ${TEST_TEACHER_EMAIL} (${teacherId})`);
  } else {
    teacherId = teacherUser.id;
    // Ensure password matches the constant so tests can always log in.
    await supabase.auth.admin.updateUserById(teacherId, { password: TEST_TEACHER_PASSWORD });
  }

  // Upsert teacher profile (equipped_slots and active_theme have DB defaults
  // but we supply them explicitly to avoid NOT NULL violations).
  const { error: teacherProfileErr } = await supabase.from("profiles").upsert(
    {
      id: teacherId,
      role: "teacher",
      full_name: "Test Lærer Auto",
      equipped_slots: {},
      active_theme: "default",
    },
    { onConflict: "id" }
  );
  if (teacherProfileErr) {
    throw new Error(`teacher-setup: teacher profile upsert failed — ${teacherProfileErr.message}`);
  }

  // ── Test student for teacher ─────────────────────────────────────────────

  let student2User = allUsers.find((u: any) => u.email === TEST_STUDENT2_EMAIL);
  let student2Id: string;

  if (!student2User) {
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: TEST_STUDENT2_EMAIL,
      password: "TestStudent2026!",
      email_confirm: true,
    });
    if (createErr) {
      throw new Error(`teacher-setup: createUser (student2) failed — ${createErr.message}`);
    }
    student2Id = created.user.id;
    console.log(`[global-setup] Created test student2 ${TEST_STUDENT2_EMAIL} (${student2Id})`);
  } else {
    student2Id = student2User.id;
  }

  // Upsert student2 profile — grade 9 is valid per profiles_selected_grade_check
  const { error: s2ProfileErr } = await supabase.from("profiles").upsert(
    {
      id: student2Id,
      role: "student",
      teacher_id: teacherId,
      full_name: "Test Elev Auto",
      selected_grade: 9,
      placement_band: 2,
      current_band: null,
      active_domains: null,
      equipped_slots: {},
      active_theme: "default",
    },
    { onConflict: "id" }
  );
  if (s2ProfileErr) {
    throw new Error(`teacher-setup: student2 profile upsert failed — ${s2ProfileErr.message}`);
  }

  // Reset student2 question instances and active_domains on every run
  await supabase.from("question_instances").delete().eq("student_id", student2Id);
  await supabase.from("profiles")
    .update({ active_domains: null, current_band: null })
    .eq("id", student2Id);

  console.log(
    `[global-setup] Teacher test accounts ready — ` +
    `teacher: ${teacherId}, student2: ${student2Id}`
  );
}

// ── Main setup ────────────────────────────────────────────────────────────────

export default async function globalSetup() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "global-setup: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env"
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Health check runs first — fail before touching any test state
  await checkQuestionPoolHealth(supabase);

  // Provision teacher test accounts (idempotent)
  await ensureTeacherTestAccounts(supabase);

  const { data: users, error: listError } =
    await supabase.auth.admin.listUsers();

  if (listError) {
    throw new Error(`global-setup: listUsers failed — ${listError.message}`);
  }

  const user = users.users.find((u) => u.email === TEST_STUDENT_EMAIL);

  if (!user) {
    throw new Error(
      `global-setup: test student ${TEST_STUDENT_EMAIL} not found`
    );
  }

  const { error } = await supabase
    .from("question_instances")
    .delete()
    .eq("student_id", user.id);

  if (error) {
    throw new Error(`global-setup: delete failed — ${error.message}`);
  }

  console.log(
    `[global-setup] Deleted all question_instances for ${TEST_STUDENT_EMAIL} (${user.id})`
  );

  // Reset grade, placement_band (prevents overlays), current_band (fresh session),
  // and active_domains (prevents domain-focus-bar layout shift in test 5).
  const { error: gradeError } = await supabase
    .from("profiles")
    .update({ selected_grade: 9, placement_band: 2, current_band: null, active_domains: null })
    .eq("id", user.id);

  if (gradeError) {
    throw new Error(`global-setup: grade update failed — ${gradeError.message}`);
  }

  console.log(
    `[global-setup] Set selected_grade=9, placement_band=2, current_band=null, active_domains=null for ${TEST_STUDENT_EMAIL}`
  );
}
