import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import * as path from "path";
import { missingSecrets, readRequiredSecret } from "./test-credentials.mjs";
import { resolveAccountRegistry } from "./e2e-accounts.mjs";
import { verifyAndOpenAdmin } from "./e2e-admin.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// ── E2E accounts (A1/A2/A3) ───────────────────────────────────────────────────
// The four accounts of this run's slot (primary pupil, test teacher, student2, password-less owner
// teacher) come from ONE registry, tests/e2e-accounts.mjs: explicit addresses only, on a domain
// Lærlig controls. Before this setup writes anything it verifies, read-only, that each account
// already exists and carries app_metadata.laerlig_e2e = { v: 1, slot, kind }, has the expected role
// and the expected teacher relation. Any problem stops the run before the first write.
//
// This setup NEVER creates or deletes a user and never upserts a profile: accounts are provisioned
// separately, with an explicit authorisation. The only auth write is putting the configured password
// back on the three verified accounts that have one. Every write below goes through the guarded
// service-role client (tests/e2e-guard.mjs) and can only reach the verified accounts.

// ── Section 133: Question Pool Health Check ──────────────────────────────────
//
// Thresholds recalibrated at ~50% of inventory audited 2026-06-03 (Section 133):
//   Total active:  913  → minimum 450
//   Grade 3:        31  → minimum  15  (tightest grade, already near 50%)
//   Grade 4:        58  → minimum  28
//   Grade 5–6:      50  → minimum  25
//   Grade 7:       221  → minimum 110
//   Grade 8:       208  → minimum 100
//   Grade 9:       295  → minimum 145
//   Per domain:     70+ → minimum  35  (smallest canonical domain: 70)
//   Adaptive: each grade needs ≥ 2 bands with ≥ 3 questions each
//
// Per-run consumption: ~45 instances created, all deleted before the next run.
// Pool depletion within a single run is not possible at current scale.
// Thresholds guard against bulk deactivation or accidental content removal.

const TOTAL_MIN = 450;

const GRADE_MIN: Record<number, number> = {
  3:  15,
  4:  28,
  5:  25,
  6:  25,
  7: 110,
  8: 100,
  9: 145,
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

const DOMAIN_MIN = 35;

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

// ── Pupil baseline ────────────────────────────────────────────────────────────
// Reset grade, placement_band (prevents overlays), current_band (fresh session), active_domains
// (prevents domain-focus-bar layout shift) and avatar_identity with chosen_at SET (Section 152C:
// prevents the identity prompt overlay from blocking quiz-flow specs). hairstyle: "default" pinned
// explicitly (Section 152D) so hair-decoupling goldens always see hair-default.svg regardless of what
// prior tests wrote. Identity-prompt specs explicitly null chosen_at in their own fixtures.
function pupilBaseline() {
  return {
    selected_grade: 9,
    placement_band: 2,
    current_band: null,
    active_domains: null,
    avatar_identity: {
      v: 1,
      body_type: "neutral",
      hairstyle: "default",
      chosen_at: new Date().toISOString(),
    },
  };
}

async function resetPupil(admin: any, kind: string, id: string): Promise<void> {
  const { error: deleteError } = await admin.from("question_instances").delete().eq("student_id", id);
  if (deleteError) {
    throw new Error(`global-setup: ${kind}: question_instances delete failed — ${deleteError.message}`);
  }
  const { error: updateError } = await admin.from("profiles").update(pupilBaseline()).eq("id", id);
  if (updateError) {
    throw new Error(`global-setup: ${kind}: baseline update failed — ${updateError.message}`);
  }
  // Logged by user id only — never an address.
  console.log(`[global-setup] ${kind} (${id}): question_instances deleted, baseline set (grade 9, band 2, identity chosen)`);
}

// ── Main setup ────────────────────────────────────────────────────────────────

export default async function globalSetup() {
  // Every required secret, named at once, before any network call. There are no fallback values:
  // a missing secret stops the run instead of writing a value readable in the public repository.
  const missing = missingSecrets();
  if (missing.length > 0) {
    throw new Error(
      `global-setup: required secret(s) missing or empty: ${missing.join(", ")} (see .env.example)`
    );
  }

  // A1: every account address, checked before any network call (throws naming every problem).
  resolveAccountRegistry(process.env);

  // A2: read-only verification of all four accounts; publishes E2E_VERIFIED_ACCOUNTS for the specs.
  // A3: `admin` is the guarded client — it can only write to the verified accounts.
  const { admin, verified } = await verifyAndOpenAdmin(process.env);
  console.log(
    `[global-setup] E2E accounts verified for slot ${verified.slot}: ` +
    `primary ${verified.ids.primary}, teacher ${verified.ids.teacher}, ` +
    `student2 ${verified.ids.student2}, owner ${verified.ids.owner}`
  );

  // Health check runs before any write — fail before touching any test state.
  await checkQuestionPoolHealth(admin);

  await resetPupil(admin, "primary", verified.ids.primary);
  await resetPupil(admin, "student2", verified.ids.student2);

  // A5: a password spec that was interrupted mid-run may have left a temporary password on an
  // account. Put each verified account's configured password back (error-checked), so the run starts
  // from a known state. The guarded client allows exactly this — { password } on these three ids.
  const configured = [
    ["primary", readRequiredSecret("TEST_STUDENT_PASSWORD")],
    ["teacher", readRequiredSecret("TEST_TEACHER_PASSWORD")],
    ["student2", readRequiredSecret("TEST_STUDENT2_PASSWORD")],
  ] as const;
  for (const [kind, secret] of configured) {
    const { error } = await admin.auth.admin.updateUserById(verified.ids[kind], { password: secret });
    if (error) throw new Error(`global-setup: ${kind}: password restore failed — ${error.message}`);
  }
  console.log("[global-setup] passwords of primary, teacher and student2 restored to the configured secrets");
}
