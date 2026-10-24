// Guards the maintainer label `ci:e2e-not-required` (.github/ci/classify-changes.mjs
// evaluateSkipLabel / evaluateLabelEvidence) and its wiring in playwright.yml.
//
// Positive model: PR #376 — one data-only migration with an executable PGlite test, a fixture, a
// unit test and a tools/question-quality module. It is reproduced here from the REAL files on disk;
// production logic must not know the PR number (pinned below).
//
// Everything that is not provably safe must resolve to { ok: false } → the full suite.
import test from "node:test";
import assert from "node:assert/strict";
import fs, { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  SKIP_LABEL,
  LABEL_MODE,
  LABEL_SAFE_PREFIXES,
  FAST_MODES,
  classify,
  evaluateSkipLabel,
  evaluateLabelEvidence,
  forbiddenMigrationTokens,
  findMigrationRunTest,
  validateLabelPayload,
  collectLabelEvidenceInputs,
  isAuthorisedLabelRole,
} from "../../.github/ci/classify-changes.mjs";
import { BINARY_DEPENDENT } from "../unit-ci-exclusions.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REAL = collectLabelEvidenceInputs(fs, path, ROOT, BINARY_DEPENDENT);

const PR376_MIGRATION = "supabase/migrations/20261022120000_fix_mc_correct_answer_not_in_options.sql";
const PR376_FILES = Object.freeze([
  PR376_MIGRATION,
  "tests/fixtures/mc-correct-answer-fix-before.json",
  "tests/unit/mc-answer-key.test.mjs",
  "tests/unit/mc-correct-answer-fix-migration-run.test.mjs",
  "tools/question-quality/answer-key.mjs",
]);

const real = (overrides = {}) => ({ files: PR376_FILES, labelPresent: true, labelerRole: "write", ...REAL, ...overrides });

// Synthetic world: one migration + whatever unit tests / specs a case needs.
const MIG = "supabase/migrations/20990101000000_data_fix.sql";
const MIG_BASE = "20990101000000_data_fix.sql";
const GOOD_TEST = {
  name: "data-fix-migration-run.test.mjs",
  source: `import { PGlite } from "@electric-sql/pglite";\nconst SQL = read("supabase/migrations/${MIG_BASE}");\n`,
};
function synthetic({ sql = "UPDATE public.questions SET content = '{}' WHERE id = '00000000-0000-0000-0000-000000000001';", tests = [GOOD_TEST], specs = [], files = [MIG], role = "write", excluded = [] } = {}) {
  return {
    files,
    labelPresent: true,
    labelerRole: role,
    readFile: (p) => (p === MIG ? sql : null),
    unitTests: tests,
    ciExcluded: excluded,
    specSources: specs,
  };
}

// ── The positive model ────────────────────────────────────────────────────────────────────────
test("PR #376 shape (real files): accepted for write, maintain and admin", () => {
  for (const role of ["write", "maintain", "admin"]) {
    const v = evaluateSkipLabel(real({ labelerRole: role }));
    assert.equal(v.ok, true, role + ": " + v.reason);
    assert.equal(v.mode, LABEL_MODE);
    assert.ok(v.reason.includes("20261022120000_fix_mc_correct_answer_not_in_options.sql ← tests/unit/mc-correct-answer-fix-migration-run.test.mjs"), v.reason);
  }
});

test("PR #376 shape: without the label it is an ordinary full-suite PR", () => {
  assert.equal(classify([...PR376_FILES]), "full");
  assert.equal(evaluateSkipLabel(real({ labelPresent: false })).ok, false);
});

test("only whole-line -- comments are ignored", () => {
  assert.deepEqual(forbiddenMigrationTokens("-- see docs/migration-workflow-policy.md (D-110)\nUPDATE x SET y = 1;"), []);
  assert.deepEqual(forbiddenMigrationTokens("   -- GRANT ALL\r\nUPDATE x SET y = 1;"), []);
  assert.deepEqual(forbiddenMigrationTokens("UPDATE x SET y = 1; -- GRANT"), ["GRANT"]);
});

test("PR #376 migration is data-only by the token rule", () => {
  assert.deepEqual(forbiddenMigrationTokens(readFileSync(path.join(ROOT, PR376_MIGRATION), "utf8")), []);
});

test("the PR number is not in production logic", () => {
  for (const f of [".github/ci/classify-changes.mjs", ".github/ci/e2e-slot.mjs"]) {
    assert.ok(!readFileSync(path.join(ROOT, f), "utf8").includes("376"), f);
  }
  const wf = readFileSync(path.join(ROOT, ".github/workflows/playwright.yml"), "utf8");
  assert.ok(!wf.includes("376"));
});

// ── Label authorisation ───────────────────────────────────────────────────────────────────────
test("label applied by triage/read/unknown/none is refused", () => {
  for (const role of ["triage", "read", "none", null, undefined, "", "WRITE", "Admin", "owner", 1]) {
    const v = evaluateSkipLabel(real({ labelerRole: role }));
    assert.equal(v.ok, false, JSON.stringify(role));
    assert.ok(v.reason.includes("without write/maintain/admin"));
  }
  assert.equal(isAuthorisedLabelRole("maintain"), true);
});

test("label absent, or not exactly true, is refused", () => {
  for (const labelPresent of [false, undefined, null, "true", 1]) {
    assert.equal(evaluateSkipLabel(real({ labelPresent })).ok, false, JSON.stringify(labelPresent));
  }
});

// ── File set ──────────────────────────────────────────────────────────────────────────────────
test("the safe set is exactly the five requested prefixes", () => {
  assert.deepEqual([...LABEL_SAFE_PREFIXES].sort(), [
    "docs/", "supabase/migrations/", "tests/fixtures/", "tests/unit/", "tools/question-quality/",
  ]);
});

test("any frontend, Edge Function, auth/RLS config, workflow, spec or runtime file refuses the label", () => {
  const outside = [
    "app.js", "js/app.js", "index.html", "hub.html", "css/x.css", "assets/x.png",
    "supabase/functions/get-next-question/index.ts", "supabase/functions/_shared/x.ts",
    "supabase/config.toml", "supabase/seed.sql", "supabase/migrations-archive/x.sql",
    ".github/workflows/playwright.yml", ".github/ci/classify-changes.mjs",
    "tests/example.spec.ts", "tests/global-setup.ts", "tests/helpers.ts", "tests/e2e-slot.mjs",
    "tests/test-credentials.mjs", "tests/unit-ci-exclusions.mjs", "tests/run-unit-ci.mjs",
    "playwright.config.ts", "package.json", "package-lock.json", "wrangler.jsonc",
    "tools/cloudflare-build-static.mjs", "tools/avatar/x.mjs", "tools/question-qualityX/a.mjs",
  ];
  for (const f of outside) {
    const v = evaluateSkipLabel(real({ files: [...PR376_FILES, f] }));
    assert.equal(v.ok, false, f);
    assert.ok(v.reason.includes("outside the label-safe set"), f + ": " + v.reason);
  }
});

test("non-canonical, empty or oversized change lists are refused", () => {
  for (const files of [[], null, undefined, "docs/a.md", ["tests/unit/../../js/app.js"], ["tests//unit/a.test.mjs"],
    [" docs/a.md"], ["docs\\a.md"], [42], Array.from({ length: 3000 }, (_, i) => "docs/" + i + ".md")]) {
    assert.equal(evaluateSkipLabel(real({ files })).ok, false, String(JSON.stringify(files)).slice(0, 60));
  }
});

test("a docs/unit/fixture/tool-only PR needs no migration proof", () => {
  const v = evaluateSkipLabel(synthetic({ files: ["docs/a.md", "tests/unit/a.test.mjs", "tests/fixtures/x.json", "tools/question-quality/y.mjs"] }));
  assert.equal(v.ok, true, v.reason);
  assert.ok(v.reason.endsWith("; no migrations"));
});

test("a fixture that a Playwright spec reads refuses the label", () => {
  const files = ["tests/fixtures/shared.json", "tests/unit/a.test.mjs"];
  assert.equal(evaluateSkipLabel(synthetic({ files, specs: ['const x = read("tests/fixtures/shared.json");'] })).ok, false);
  assert.equal(evaluateSkipLabel(synthetic({ files, specs: ['import data from "./fixtures/shared.json";'] })).ok, false);
  assert.equal(evaluateSkipLabel(synthetic({ files, specs: [42] })).ok, false, "unreadable spec source");
  assert.equal(evaluateSkipLabel(synthetic({ files, specs: ["nothing here"] })).ok, true);
});

// ── Migrations ────────────────────────────────────────────────────────────────────────────────
test("a migration passes only with a matching executable PGlite test", () => {
  assert.equal(evaluateSkipLabel(synthetic()).ok, true);
  const refused = [
    { tests: [] },
    { tests: [{ ...GOOD_TEST, name: "data-fix.test.mjs" }] },                                         // not *-migration-run
    { tests: [{ ...GOOD_TEST, source: GOOD_TEST.source.replace("@electric-sql/pglite", "./fake") }] }, // not executable
    { tests: [{ ...GOOD_TEST, source: GOOD_TEST.source.replace(MIG_BASE, "20990101000000_other.sql") }] },
    { tests: [{ ...GOOD_TEST, source: GOOD_TEST.source + "test.skip('x', () => {});" }] },
    { tests: [{ ...GOOD_TEST, source: GOOD_TEST.source + "test('x', { skip: true }, () => {});" }] },
    { tests: [{ ...GOOD_TEST, source: GOOD_TEST.source + "test.todo('x');" }] },
    { excluded: [GOOD_TEST.name] },                                                                    // excluded from CI
  ];
  for (const c of refused) {
    const v = evaluateSkipLabel(synthetic(c));
    assert.equal(v.ok, false, JSON.stringify(c).slice(0, 120));
    assert.ok(v.reason.includes("no executable PGlite migration test"), v.reason);
  }
  assert.equal(findMigrationRunTest(MIG_BASE, null, []), null);
  assert.equal(findMigrationRunTest(MIG_BASE, [{ name: 1, source: 2 }], []), null);
});

test("the plural *-migrations-run.test.mjs naming also counts", () => {
  const tests = [{ ...GOOD_TEST, name: "data-fix-migrations-run.test.mjs" }];
  assert.equal(evaluateSkipLabel(synthetic({ tests })).ok, true);
});

test("a migration that is missing, deleted, empty, unreadable or misplaced refuses the label", () => {
  assert.equal(evaluateSkipLabel(synthetic({ sql: null })).ok, false);
  assert.equal(evaluateSkipLabel(synthetic({ sql: "   \n" })).ok, false);
  assert.equal(evaluateSkipLabel({ ...synthetic(), readFile: () => { throw new Error("EACCES"); } }).ok, false);
  assert.equal(evaluateSkipLabel({ ...synthetic(), readFile: undefined }).ok, false);
  for (const f of ["supabase/migrations/sub/20990101000000_x.sql", "supabase/migrations/x.sql",
    "supabase/migrations/2099_.sql", "supabase/migrations/_x.sql", "supabase/migrations/2099a_x.sql",
    "supabase/migrations/20990101000000_x.txt"]) {
    const v = evaluateSkipLabel(synthetic({ files: [f] }));
    assert.equal(v.ok, false, f);
  }
});

test("a migration that is more than a data change refuses the label", () => {
  const ddl = [
    "CREATE POLICY p ON public.questions FOR SELECT USING (true);",
    "ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;",
    "alter table public.profiles add column x int;",
    "GRANT SELECT ON public.questions TO anon;",
    "REVOKE ALL ON public.questions FROM authenticated;",
    "CREATE OR REPLACE FUNCTION public.f() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;",
    "DROP TABLE public.questions;",
    "TRUNCATE public.questions;",
    "UPDATE auth.users SET email = 'x';",
    'UPDATE "auth"."users" SET email = \'x\';',
    "DELETE FROM storage.objects;",
    "DO $$ BEGIN EXECUTE 'drop table x'; END $$;",
    "SELECT set_config('role', 'service_role', true);",
    "ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon;",
    "CREATE TRIGGER t AFTER INSERT ON x FOR EACH ROW EXECUTE FUNCTION f();",
    "SELECT cron.schedule('x', '* * * * *', 'select 1');",
    "COPY public.questions FROM '/tmp/x';",
    "UPDATE public.questions SET x = 1; -- GRANT in an inline comment is still refused (over-refusing is safe)",
    "UPDATE public.questions SET x = '--'; GRANT ALL ON x TO anon;",
    "/* block comments are not stripped */ UPDATE public.questions SET x = 1; /* GRANT */",
    "UPDATE public.questions SET x = 1;\n  --\nGRANT ALL ON x TO anon;",
  ];
  for (const sql of ddl) {
    const v = evaluateSkipLabel(synthetic({ sql }));
    assert.equal(v.ok, false, sql);
    assert.ok(v.reason.includes("not data-only"), sql + " → " + v.reason);
  }
});

// ── The `test` job's re-check and payload guard ───────────────────────────────────────────────
test("evaluateLabelEvidence re-checks files and migrations without the label/role", () => {
  assert.equal(evaluateLabelEvidence({ files: PR376_FILES, ...REAL }).ok, true);
  assert.equal(evaluateLabelEvidence({ files: [...PR376_FILES, "js/app.js"], ...REAL }).ok, false);
  const { labelPresent, labelerRole, ...noLabel } = synthetic({ sql: "GRANT ALL ON x TO anon;" });
  assert.equal(evaluateLabelEvidence(noLabel).ok, false);
});

test("validateLabelPayload: canonical, non-empty, label-safe only", () => {
  assert.equal(validateLabelPayload([...PR376_FILES]).ok, true);
  for (const files of [[], null, ["js/app.js"], ["docs//a.md"], [" docs/a.md"], [1]]) {
    assert.equal(validateLabelPayload(files).ok, false, JSON.stringify(files));
  }
});

test("label mode is not a path-only fast mode: classify() can never produce it", () => {
  assert.ok(!FAST_MODES.includes(LABEL_MODE));
  for (const files of [[...PR376_FILES], ["docs/a.md"], ["tests/unit/a.test.mjs"], ["supabase/migrations/x.sql"]]) {
    assert.notEqual(classify(files), LABEL_MODE);
  }
});

// ── Workflow wiring ───────────────────────────────────────────────────────────────────────────
const WF = readFileSync(path.join(ROOT, ".github/workflows/playwright.yml"), "utf8").split("\r\n").join("\n");

test("workflow: the label name, live label read and role lookup", () => {
  assert.equal(SKIP_LABEL, "ci:e2e-not-required");
  assert.ok(WF.includes("github.rest.issues.listLabelsOnIssue"), "labels must be read live, not from the payload");
  assert.ok(!WF.includes("pull_request.labels"), "the event payload's label snapshot must not be trusted");
  assert.ok(WF.includes("e.event === 'labeled' && e.label && e.label.name === mod.SKIP_LABEL"));
  assert.ok(WF.includes("github.rest.repos.getCollaboratorPermissionLevel"));
  assert.ok(WF.includes("labelerRole = typeof data.role_name === 'string' ? data.role_name : null;"));
  assert.ok(WF.includes("core.warning('label authorisation lookup failed → full: ' + err.message);"));
});

test("workflow: label mode runs the full unit suite in the required check and never Playwright", () => {
  const at = WF.indexOf("- name: Label mode — full unit suite\n");
  assert.notEqual(at, -1);
  const step = WF.slice(at, WF.indexOf("\n\n", at));
  assert.ok(step.includes("if: steps.mode.outputs.mode == 'label-verified'"));
  assert.ok(step.includes("npm run test:unit:ci"));
  for (const name of ["Install Playwright Browsers", "Run Playwright tests"]) {
    const s = WF.indexOf("- name: " + name + "\n");
    const line = WF.slice(s, WF.indexOf("\n", WF.indexOf("if:", s)));
    assert.ok(line.endsWith("if: steps.mode.outputs.mode == 'full' && steps.stale.outputs.stale != 'true'"), name);
  }
});

test("workflow: the test job re-checks label evidence and fails (never escalates) on a bad payload", () => {
  assert.ok(WF.includes("const evidence = mod.evaluateLabelEvidence({ files: lfiles, ...mod.collectLabelEvidenceInputs(fs, path, process.cwd(), BINARY_DEPENDENT) });"));
  assert.ok(WF.includes("core.setFailed('label-verified evidence re-check failed: ' + evidence.reason);"));
  assert.ok(WF.includes("core.setFailed('label-verified payload invalid: ' + p.error);"));
});
