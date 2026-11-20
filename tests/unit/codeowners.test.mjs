// .github/CODEOWNERS (AURA T2) — form, dækning og at reglerne rammer præcis de tilsigtede filer.
// CODEOWNERS er IKKE håndhævet, før main-rulesættet kræver review fra code owners (AURA T4). Testen beviser kun,
// at filen er korrekt; den beviser ikke, at GitHub håndhæver den.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parseCodeowners, ownersFor, patternToRegExp } from "../../tools/agents/risk-level.mjs";

const TEXT = readFileSync(new URL("../../.github/CODEOWNERS", import.meta.url), "utf8");
const RULES = parseCodeowners(TEXT);
const FILES = execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\n").filter(Boolean);
const owned = (p) => ownersFor(RULES, p).length > 0;

// Stier, der er ejet på forhånd, selv om de ikke findes endnu: en agent må ikke kunne oprette dem uden review.
const RESERVED = new Set(["/**/AGENTS.md", "/**/CLAUDE.local.md", "/**/.mcp.json"]);

test("1: form — kun forankrede mønstre, kun @Moeller888, ingen dubletter, ingen linje uden ejer", () => {
  assert.ok(RULES.length >= 40, `for få regler: ${RULES.length}`);
  const seen = new Set();
  for (const r of RULES) {
    assert.ok(r.pattern.startsWith("/"), `linje ${r.line}: mønsteret skal starte med "/": ${r.pattern}`);
    assert.deepEqual(r.owners, ["@Moeller888"], `linje ${r.line}: præcis én ejer, @Moeller888`);
    assert.ok(!seen.has(r.pattern), `linje ${r.line}: dublet ${r.pattern}`);
    assert.ok(!/[\\!\[\]]/.test(r.pattern), `linje ${r.line}: negation, klammer og backslash bruges ikke: ${r.pattern}`);
    seen.add(r.pattern);
  }
  assert.match(TEXT, /IKKE HÅNDHÆVET/, "filen skal sige, at den ikke er håndhævet endnu");
});

test("2: hvert mønster rammer mindst én versioneret fil (bortset fra de reserverede)", () => {
  const dead = RULES.filter((r) => !RESERVED.has(r.pattern) && !FILES.some((p) => r.re.test(p))).map((r) => r.pattern);
  assert.deepEqual(dead, []);
});

test("3: de krævede og de kendte sikkerhedskritiske filer er ejet", () => {
  const must = [
    ".github/CODEOWNERS", ".github/workflows/e2e-prod-provision.yml", ".github/workflows/playwright.yml",
    ".github/ci/e2e-prod-provision-summary.mjs", ".claude/settings.json", "CLAUDE.md", "docs/CLAUDE_WORKFLOW.md",
    "docs/migration-workflow-policy.md", "tools/e2e/provision-accounts.mjs", "tests/e2e-accounts.mjs",
    "tools/agents/claim.mjs", "tools/agents/risk-level.mjs", "tools/e2e-safety/mutate-guards.mjs",
    "docs/operations/e2e-prod-provisioning.md", "docs/operations/sec-key-01-key-migration-runbook.md",
    "docs/operations/agent-coordination.md", "docs/operations/autonomy-levels.md",
    "docs/operations/agent-identity-github-app.md", "docs/operations/quiz-anti-guess-cooldown-rollback.sql",
    "supabase/config.toml", "worker/index.js", "wrangler.jsonc", "js/supabase.js", "supabaseClient.js",
    "package.json", "package-lock.json", "tools/cloudflare-deploy.mjs", "tests/isolated/isolation-guard.mjs",
    "tests/isolated/seed/seed-guard.mjs", "tests/unit/claude-settings-guard.test.mjs",
    "tests/unit/credential-hygiene.test.mjs", "tests/unit/e2e-guard-mutants.test.mjs",
    "tests/unit/agent-risk-level.test.mjs", "tests/unit/codeowners.test.mjs",
    // AURA-03: login og adgangskoder, og alt, som de påkrævede checks selv kører for at afgøre bestået/fejlet
    "js/login.js", "login.html", "js/reset-password.js", "js/admin.js", "tests/isolated/run-suite.mjs",
    "tests/isolated/require-complete-run.mjs", "tests/isolated/scope.mjs", "tests/isolated/serve-build.mjs",
    "tests/isolated/playwright.suite.config.ts", "tests/support/browser-launch-check.mjs",
    "tests/support/mail-guard.ts", "tests/unit/cloudflare-deploy.test.mjs", "tools/edge/gnq-release.mjs",
    ".gitattributes",
  ];
  const missing = must.filter((p) => FILES.includes(p) && !owned(p));
  assert.deepEqual(missing, []);
  const notTracked = must.filter((p) => !FILES.includes(p));
  assert.deepEqual(notTracked, [], "testlisten nævner en fil, der ikke findes");
  // Alt under supabase/migrations og supabase/functions
  for (const p of FILES.filter((x) => /^supabase\/(?:migrations|functions)\//.test(x))) assert.ok(owned(p), p);
  for (const p of FILES.filter((x) => /^\.github\//.test(x))) assert.ok(owned(p), p);
  // Agentinstruktioner er ejet i alle mapper, også før de findes
  for (const p of ["AGENTS.md", "js/AGENTS.md", "docs/CLAUDE.md", "js/CLAUDE.md", "docs/.claude/settings.json",
    "docs/operations/production-actions/CLAUDE.md", "CLAUDE.local.md", ".mcp.json"]) assert.ok(owned(p), p);
});

test("4: almindelige filer er IKKE ejet (ingen unødige godkendelser)", () => {
  const free = [
    "index.html", "hub.html", "app.js", "js/avatar-layers.js", "js/teacher.js", "js/student-detail.js", "css/hub.css",
    "docs/ARCHITECTURE.md", "docs/decisions/D-381.md", "docs/AVATAR_SYSTEM.md",
    "tests/example.spec.ts", "tests/unit/avatar-northstar-hair-nh5c-d381.test.mjs",
    "tests/isolated/schema/replay-plan.mjs", "tests/isolated/kildekritik.isolated.spec.mjs",
    "docs/operations/ci-triage.md", "tools/avatar/build-face-expr-d042.mjs", "laerligverse/README.md",
  ];
  const wronglyOwned = free.filter((p) => owned(p));
  assert.deepEqual(wronglyOwned, []);
  // Produktionsposterne er append-only i klassificeringen, ikke ejet her.
  for (const p of FILES.filter((x) => x.startsWith("docs/operations/production-actions/"))) assert.ok(!owned(p), p);
});

test("5: mønster-oversætteren følger GitHubs forankring", () => {
  const re = (p) => patternToRegExp(p);
  assert.ok(re("/.github/").test(".github/workflows/x.yml"));
  assert.ok(!re("/.github/").test("docs/.github/x"));
  assert.ok(re("/tests/unit/ci-*.test.mjs").test("tests/unit/ci-e2e-queue.test.mjs"));
  assert.ok(!re("/tests/unit/ci-*.test.mjs").test("tests/unit/sub/ci-x.test.mjs"));
  assert.ok(re("/CLAUDE.md").test("CLAUDE.md"));
  assert.ok(!re("/CLAUDE.md").test("docs/CLAUDE.md"));
  assert.ok(!re("/CLAUDE.md").test("CLAUDE.mdx"));
  assert.ok(re("/**/*.sql").test("a/b/c.sql") && re("/**/*.sql").test("c.sql"));
  assert.ok(re("/docs/operations/*rollback*").test("docs/operations/teacher-stats-rollback.md"));
  assert.ok(!re("/docs/operations/*rollback*").test("docs/operations/production-actions/x-rollback.md"));
});
