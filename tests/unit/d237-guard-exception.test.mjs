// The D-237 exception in the migration-ordering guards (tests/support/d237-guard-exception.mjs) is one
// reviewed file, not a rule that REVOKE is safe. These tests prove it cannot be borrowed: any edit to
// the file, any other name, and any statement beyond the two reviewed REVOKE shapes voids it — so the
// guards still catch a later GRANT, a re-created view, a DROP, an RLS change, or a REVOKE smuggled in
// next to one of those.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { D237_FILE, D237_SHA256, isReviewedD237, onlyReviewedNarrowing } from "../support/d237-guard-exception.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const REAL = readFileSync(join(MIGRATIONS, D237_FILE), "utf8");

test("the real D-237 file is the reviewed one: exempt, and its hash is the one D-237 records", () => {
  assert.equal(isReviewedD237(MIGRATIONS, D237_FILE), true);
  const doc = readFileSync(join(ROOT, "docs", "decisions", "D-237.md"), "utf8");
  assert.ok(doc.includes(D237_SHA256), "docs/decisions/D-237.md records the pinned SHA-256");
});

test("the narrowing rule accepts only the two reviewed REVOKE shapes", () => {
  assert.equal(onlyReviewedNarrowing(REAL), true);
  const rejected = {
    "a GRANT of a removed privilege": `${REAL}\nGRANT TRUNCATE ON TABLE public.profiles TO authenticated;`,
    "a GRANT of any privilege": `${REAL}\nGRANT SELECT ON public.attempt_stats TO anon;`,
    "a protected view re-created": `${REAL}\nCREATE OR REPLACE VIEW public.attempt_stats AS SELECT 1;`,
    "a protected object dropped": `${REAL}\nDROP VIEW public.question_performance;`,
    "a policy dropped": `${REAL}\nDROP POLICY IF EXISTS "own" ON public.teacher_spotlights;`,
    "RLS switched off": `${REAL}\nALTER TABLE public.student_weekly_quest_progress DISABLE ROW LEVEL SECURITY;`,
    "a policy created": `${REAL}\nCREATE POLICY p ON public.teacher_spotlights FOR SELECT USING (true);`,
    "a REVOKE of another privilege": `REVOKE SELECT ON TABLE public.profiles FROM anon, authenticated;`,
    "a REVOKE from service_role too": `REVOKE TRUNCATE, MAINTAIN ON TABLE public.profiles FROM anon, authenticated, service_role;`,
    "a REVOKE from PUBLIC": `REVOKE TRUNCATE, MAINTAIN ON TABLE public.profiles FROM PUBLIC;`,
    "a REVOKE with CASCADE": `REVOKE TRUNCATE, MAINTAIN ON TABLE public.profiles FROM anon, authenticated CASCADE;`,
    "a GRANT OPTION form": `REVOKE GRANT OPTION FOR TRUNCATE ON TABLE public.profiles FROM anon, authenticated;`,
    "a statement hidden in a block": `${REAL}\nDO $$ BEGIN EXECUTE 'GRANT ALL ON public.profiles TO anon'; END $$;`,
    "an empty file": "-- nothing\n",
  };
  for (const [label, sql] of Object.entries(rejected)) {
    assert.equal(onlyReviewedNarrowing(sql), false, label);
  }
});

test("the exception is void for any edit of the file and for any other name", () => {
  const dir = mkdtempSync(join(tmpdir(), "d237-guard-"));
  // Same name, one GRANT appended: the hash no longer matches.
  writeFileSync(join(dir, D237_FILE), `${REAL}\nGRANT TRUNCATE ON TABLE public.profiles TO authenticated;\n`);
  assert.equal(isReviewedD237(dir, D237_FILE), false, "an edited D-237 file is not exempt");
  // Same name, whitespace-only edit: still a different file.
  writeFileSync(join(dir, D237_FILE), `${REAL}\n`);
  assert.equal(isReviewedD237(dir, D237_FILE), false, "a byte-level change voids the exception");
  // The exact reviewed bytes under another name.
  const other = "20991231235959_copy_of_d237.sql";
  writeFileSync(join(dir, other), readFileSync(join(MIGRATIONS, D237_FILE)));
  assert.equal(isReviewedD237(dir, other), false, "the content under another name is not exempt");
});

test("exactly the three ordering guards use the exception, and nothing else in the tests does", () => {
  const unit = join(ROOT, "tests", "unit");
  const users = readdirSync(unit).filter((f) => f.endsWith(".test.mjs") && f !== "d237-guard-exception.test.mjs")
    .filter((f) => readFileSync(join(unit, f), "utf8").includes("isReviewedD237"));
  assert.deepEqual(users.sort(), [
    "analytics-views-lockdown-migration-run.test.mjs",
    "teacher-spotlights-read-scope.test.mjs",
    "weekly-quest-progress-read-scope.test.mjs",
  ]);
});
