import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import * as path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const TEST_STUDENT_EMAIL = "christnmoeller@hotmail.com";

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
