// tools/ci/run-triage.mjs — klassifikation af CI-job ud fra konkrete loglinjer (docs/operations/ci-triage.md).
// Logudsnittene nedenfor er forkortede kopier af linjer fra rigtige kørsler (numrene står ved hvert tilfælde).
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyJob, facts, coverage, report, CATEGORY } from "../../tools/ci/run-triage.mjs";

const TS = "2026-11-12T07:39:17.8637620Z ";
const ECHO = "\x1b[36;1m";
const log = (...lines) => lines.map((l) => TS + l).join("\n");

// Workflowets eget script, sådan som GitHub skriver det ud før trinnet kører — står i HVER kørsel.
const SCRIPT = [
  `${ECHO}            echo "::warning title=INFRA-CACHE::cache-first install did not complete; falling back to the Ubuntu mirrors"\x1b[0m`,
  `${ECHO}                echo "::error title=INFRA-INSTALL::dpkg could not finish the interrupted cache install - no test ran"\x1b[0m`,
  `${ECHO}              echo "::error title=INFRA-INSTALL::npx playwright install --with-deps failed or ran past 10 min (Ubuntu mirror, runner DNS or network) - no test ran"\x1b[0m`,
];
const CACHE_OK = [
  "Image: ubuntu-24.04",
  "Cache hit for: pw-browsers-apt-ubuntu24-20261101.360.1-playwright-1.59.1",
  ...SCRIPT,
  "0 upgraded, 181 newly installed, 0 to remove and 1 not upgraded.",
  "browser-launch-check: chromium 147.0.7727.15 launched",
  "browser-launch-check: firefox 148.0.2 launched",
  "browser-launch-check: webkit 26.4 launched",
  "##[notice]playwright install: system packages from the cache",
];
const SUITE_OK = ["  112 skipped", "  146 passed (13.2m)", "  377 skipped", "  1277 passed (37.6m)",
  "playwright timing: wall 37.6 min, startup before first test 2.9 s, test time 36.0 min; tests 1654 (expected 1277, flaky 0, unexpected 0, skipped 377), retries 0"];
const job = (name, conclusion, extra = {}) => ({ name, conclusion, status: "completed", steps: [], ...extra });

test("grøn kørsel fra cachen: OK, og fakta viser cache-vej, 0 spejlhentninger, tre browsere og testtal (43190527778)", () => {
  const r = classifyJob(job("isolated-e2e (run 1)", "success"), log(...CACHE_OK, ...SUITE_OK));
  assert.equal(r.category, CATEGORY.OK);
  assert.equal(r.facts.installPath, "cache");
  assert.equal(r.facts.cache, "hit");
  assert.equal(r.facts.mirrorFetches, 0);
  assert.deepEqual(r.facts.launched, ["chromium", "firefox", "webkit"]);
  assert.deepEqual(r.facts.playwrightPassed, [146, 1277]);
  assert.deepEqual(r.facts.suite, { expected: 1277, flaky: 0, unexpected: 0, skipped: 377 });
  assert.deepEqual(coverage([], [r]), []);
});

test("scriptets egne echo-linjer er ikke hændelser: upload-fejlen er INFRA-ARTIFACT, ikke INFRA-INSTALL (43089224884)", () => {
  const text = log(...CACHE_OK.slice(0, 2), ...SCRIPT,
    "##[warning]cache-first install did not complete; falling back to the Ubuntu mirrors",
    "Get:1 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libsoup-3.0-0 amd64 3.4.4-5ubuntu0.11 [290 kB]",
    "##[notice]playwright install: system packages from the mirrors", ...SUITE_OK,
    "##[error]Failed to CreateArtifact: Failed to make request after 5 attempts: Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON");
  const r = classifyJob(job("isolated-e2e (run 1)", "failure", { steps: [{ name: "Install Playwright browsers", conclusion: "success" }, { name: "Upload report", conclusion: "failure" }] }), text);
  assert.equal(r.category, CATEGORY.INFRA_ARTIFACT);
  assert.match(r.evidence, /^##\[error\]Failed to CreateArtifact/);
  assert.equal(r.facts.installPath, "spejle");
  assert.equal(r.facts.mirrorFetches, 1);
  // En grøn eller rød fallback må aldrig ligne en vellykket cache-installation.
  assert.match(coverage([], [r]).join("\n"), /cache-hit, men systempakkerne kom fra spejlene .* cache-vejen FEJLEDE/);
});

test("Ubuntu 26.04 + Playwright 1.59.1 er INFRA-RUNNER (43167266559)", () => {
  const r = classifyJob(job("isolated-e2e (run 1)", "failure"), log("Image: ubuntu-26.04", "Error: ERROR: Playwright does not support chromium on ubuntu26.04-x64"));
  assert.equal(r.category, CATEGORY.INFRA_RUNNER);
  assert.match(r.evidence, /ubuntu26\.04/);
});

test("installation og browserstart skelnes; begge kræver en rigtig hændelseslinje", () => {
  const inst = classifyJob(job("j", "failure"), log(...SCRIPT, "##[error]npx playwright install --with-deps failed or ran past 10 min (Ubuntu mirror, runner DNS or network) - no test ran"));
  assert.equal(inst.category, CATEGORY.INFRA_INSTALL);
  const br = classifyJob(job("j", "failure"), log(...SCRIPT, "browser-launch-check: webkit cannot launch — Host system is missing dependencies"));
  assert.equal(br.category, CATEGORY.INFRA_BROWSER);
  const onlyScript = classifyJob(job("j", "failure", { steps: [{ name: "Existing Playwright suite", conclusion: "failure" }] }), log(...SCRIPT));
  assert.equal(onlyScript.category, CATEGORY.UNKNOWN, "kildekode alene er ikke en diagnose");
  assert.match(onlyScript.evidence, /Existing Playwright suite/);
});

test("trin-timeout i installationen er INFRA-INSTALL med trinnavn; andre timeouts er CANCELLED-TIMEOUT", () => {
  const steps = [{ name: "Install Playwright browsers", conclusion: "cancelled" }];
  const r = classifyJob(job("isolated-e2e (run 1)", "failure", { steps }), log("##[error]The action 'Install Playwright browsers' has timed out after 15 minutes."));
  assert.equal(r.category, CATEGORY.INFRA_INSTALL);
  assert.match(r.evidence, /trin-timeout i "Install Playwright browsers"/);
  const u = classifyJob(job("unit (shard 2/4)", "cancelled", { steps: [{ name: "Run unit suite (shard)", conclusion: "cancelled" }] }),
    log("##[error]The job running on runner GitHub Actions 12 has exceeded the maximum execution time of 10 minutes."));
  assert.equal(u.category, CATEGORY.TIMEOUT);
});

test("annulleret af en nyere kørsel er CANCELLED-SUPERSEDED; uden nyere kørsel er årsagen ukendt (43213269528)", () => {
  const j = job("isolated-e2e (run 1)", "cancelled", { completedAt: "2026-11-12T12:00:53Z" });
  assert.equal(classifyJob(j, "", { newerRunAt: "2026-11-12T12:00:24Z" }).category, CATEGORY.SUPERSEDED);
  assert.equal(classifyJob(j, "", { newerRunAt: "2026-11-12T13:00:00Z" }).category, CATEGORY.CANCELLED, "nyere kørsel startede EFTER stoppet");
  assert.equal(classifyJob(j, "").category, CATEGORY.CANCELLED);
});

test("testfejl genkendes fra Playwright og node --test — og kaldes aldrig produktregression af værktøjet", () => {
  const pw = classifyJob(job("j", "failure"), log("  3 failed", "playwright timing: wall 1 min, startup before first test 1 s, test time 1 min; tests 10 (expected 6, flaky 0, unexpected 3, skipped 1), retries 1"));
  assert.equal(pw.category, CATEGORY.TEST_FAILURE);
  assert.match(pw.evidence, /unexpected 3/);
  const nt = classifyJob(job("unit (shard 1/4)", "failure"), log("ℹ pass 1194", "ℹ fail 2"));
  assert.equal(nt.category, CATEGORY.TEST_FAILURE);
  assert.deepEqual(nt.facts.nodeTest, { pass: 1194, fail: 2 });
  assert.equal(Object.values(CATEGORY).includes("PRODUCT-REGRESSION"), false);
});

test("flaky i en grøn kørsel navngives (43202146585); sprunget over tæller ikke som bestået", () => {
  const r = classifyJob(job("isolated-e2e (run 1)", "success"), log(...CACHE_OK,
    "  1 flaky", "playwright timing: wall 37.7 min, startup before first test 3.0 s, test time 36.2 min; tests 1654 (expected 1276, flaky 1, unexpected 0, skipped 377), retries 1",
    "  [webkit] mobile-ux-validation.spec.ts:327 flaky after 2 attempt(s)"));
  assert.equal(r.category, CATEGORY.FLAKY);
  assert.match(r.evidence, /mobile-ux-validation\.spec\.ts:327/);
  const skipped = classifyJob(job("test", "skipped"), "");
  assert.equal(skipped.category, CATEGORY.SKIPPED);
  assert.match(coverage([job("test", "skipped")], [skipped]).join(), /sprunget over — tæller ikke som bestået/);
});

test("en grøn isolated-e2e-bane uden testopsummering er ikke dokumenteret dækning", () => {
  const r = classifyJob(job("isolated-e2e (run 1, K1-testprofil)", "success"), log(...CACHE_OK, "replay profile k1: K1 columns on question_attempts = 2"));
  assert.equal(r.category, CATEGORY.OK);
  assert.equal(r.facts.k1Columns, "replay profile k1: K1 columns on question_attempts = 2");
  assert.match(coverage([], [r]).join(), /ingen Playwright-opsummering/);
});

test("rapporten er på dansk, escaper tabeltegn og nævner, at genkørsel kræver GO", () => {
  const run = { databaseId: 1, workflowName: "Isolated E2E", headBranch: "x", headSha: "a".repeat(40), event: "pull_request", status: "completed", conclusion: "failure", jobs: [] };
  const r = classifyJob(job("a|b", "failure"), log("##[error]npx playwright install --with-deps failed or ran past 10 min (Ubuntu mirror, runner DNS or network) - no test ran"));
  const md = report(run, [r]);
  assert.match(md, /^## CI-resumé: Isolated E2E · kørsel 1/);
  assert.match(md, /\| a\\\|b \| failure \| INFRA-INSTALL \|/);
  assert.match(md, /genkørsel kræver GO/);
  assert.equal(facts("").mirrorFetches, 0);
});
