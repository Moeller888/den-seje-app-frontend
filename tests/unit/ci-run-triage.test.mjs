// tools/ci/run-triage.mjs — klassifikation af CI-job ud fra konkrete loglinjer (docs/operations/ci-triage.md).
// Logudsnittene nedenfor er forkortede kopier af linjer fra rigtige kørsler (numrene står ved hvert tilfælde).
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyJob, facts, coverage, report, sanitize, CATEGORY, LEVEL, MAX_EVIDENCE } from "../../tools/ci/run-triage.mjs";

const TS = "2026-11-12T07:39:17.8637620Z ";
const ECHO = "\x1b[36;1m";
const log = (...lines) => lines.map((l) => TS + l).join("\n");
const END = "Cleaning up orphan processes"; // GitHubs afslutning af en fuldstændig job-log
const full = (...lines) => log(...lines, END);

// Workflowets eget script, sådan som GitHub skriver det ud før trinnet kører — står i HVER kørsel.
const SCRIPT = [
  `${ECHO}            echo "::warning title=INFRA-CACHE::cache-first install did not complete; falling back to the Ubuntu mirrors"\x1b[0m`,
  `${ECHO}                echo "::error title=INFRA-INSTALL::dpkg could not finish the interrupted cache install - no test ran"\x1b[0m`,
  `${ECHO}              echo "::error title=INFRA-INSTALL::npx playwright install --with-deps failed or ran past 10 min (Ubuntu mirror, runner DNS or network) - no test ran"\x1b[0m`,
  `${ECHO}  echo "browser-launch-check: webkit cannot launch — eksempel i et script"\x1b[0m`,
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
const FALLBACK = [
  "Image: ubuntu-24.04",
  "Cache hit for: pw-browsers-apt-ubuntu24-20261101.360.1-playwright-1.59.1",
  ...SCRIPT,
  "##[warning]cache-first install did not complete; falling back to the Ubuntu mirrors",
  "Get:1 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 libsoup-3.0-0 amd64 3.4.4-5ubuntu0.11 [290 kB]",
  "browser-launch-check: chromium 147.0.7727.15 launched",
  "browser-launch-check: firefox 148.0.2 launched",
  "browser-launch-check: webkit 26.4 launched",
  "##[notice]playwright install: system packages from the mirrors",
];
const SUITE_OK = ["  112 skipped", "  146 passed (13.2m)", "  377 skipped", "  1277 passed (37.6m)",
  "playwright timing: wall 37.6 min, startup before first test 2.9 s, test time 36.0 min; tests 1654 (expected 1277, flaky 0, unexpected 0, skipped 377), retries 0"];
const FLAKY_BLOCK = [
  "  1) [webkit] › tests/mobile-ux-validation.spec.ts:327:1 › 9. Level-up overlay — full viewport on mobile ",
  "",
  "    Error: page.goto: WebKit encountered an internal error",
  "  [webkit] mobile-ux-validation.spec.ts:327 flaky after 2 attempt(s)",
];
const job = (name, conclusion, extra = {}) => ({ name, conclusion, status: "completed", steps: [], ...extra });

test("grøn kørsel fra cachen med fuldstændig log: OK + VERIFICERET; fakta viser cache-vej, 0 spejlhentninger, tre browsere, testtal (43190527778)", () => {
  const r = classifyJob(job("isolated-e2e (run 1)", "success"), full(...CACHE_OK, ...SUITE_OK));
  assert.equal(r.category, CATEGORY.OK);
  assert.equal(r.level, LEVEL.VERIFIED);
  assert.equal(r.facts.installPath, "cache");
  assert.equal(r.facts.mirrorFetches, 0);
  assert.deepEqual(r.facts.launched, ["chromium", "firefox", "webkit"]);
  assert.deepEqual(r.facts.playwrightPassed, [146, 1277]);
  assert.deepEqual(r.facts.suite, { expected: 1277, flaky: 0, unexpected: 0, skipped: 377 });
  assert.deepEqual(coverage([], [r]), []);
});

test("manglende log: en grøn status præsenteres ikke som verificeret; rød uden log er UKENDT", () => {
  const g = classifyJob(job("unit (shard 1/4)", "success"), "");
  assert.equal(g.level, LEVEL.UNKNOWN);
  assert.match(g.evidence, /log ikke tilgængelig: kun GitHubs jobstatus/);
  assert.match(coverage([], [g]).join(), /log ikke tilgængelig — kun GitHubs status \(success\) er kendt/);
  const red = classifyJob(job("isolated-e2e (run 1)", "failure", { steps: [{ name: "Existing Playwright suite", conclusion: "failure" }] }), "");
  assert.equal(red.category, CATEGORY.UNKNOWN);
  assert.equal(red.level, LEVEL.UNKNOWN);
  assert.match(red.evidence, /log ikke tilgængelig; fejlet trin: "Existing Playwright suite"/);
  assert.match(report({ jobs: [] }, [g]), /\| unit \(shard 1\/4\) \| success \| OK \| UKENDT \|/);
});

test("ufuldstændig log (ingen afsluttende oprydning): højst SANDSYNLIGT, og det står i dækningen", () => {
  const r = classifyJob(job("isolated-e2e (run 1)", "success"), log(...CACHE_OK, ...SUITE_OK));
  assert.equal(r.category, CATEGORY.OK);
  assert.equal(r.level, LEVEL.PROBABLE);
  assert.match(r.evidence, /ufuldstændig/);
  assert.match(coverage([], [r]).join(), /loggen ser ufuldstændig ud — konklusionen er højst SANDSYNLIGT/);
  const runner = classifyJob(job("j", "failure"), log("Error: ERROR: Playwright does not support chromium on ubuntu26.04-x64"));
  assert.equal(runner.level, LEVEL.PROBABLE, "en genkendt linje i en afkortet log er ikke VERIFICERET");
});

test("grøn kørsel via fallback er ikke en cache-succes (43089224884-mønstret)", () => {
  const r = classifyJob(job("isolated-e2e (run 1)", "success"), full(...FALLBACK, ...SUITE_OK));
  assert.equal(r.category, CATEGORY.OK, "jobbet bestod");
  assert.equal(r.facts.installPath, "spejle");
  assert.equal(r.facts.mirrorFetches, 1);
  assert.match(coverage([], [r]).join("\n"), /cache-hit, men systempakkerne kom fra spejlene .* cache-vejen FEJLEDE/);
  assert.match(report({ jobs: [] }, [r]), /systempakker fra spejle, 1 hentninger fra Ubuntu-spejle/);
});

test("scriptets egne echo-linjer er ikke hændelser: upload-fejlen er INFRA-ARTIFACT, ikke INFRA-INSTALL (43089224884)", () => {
  const text = full(...FALLBACK, ...SUITE_OK,
    "##[error]Failed to CreateArtifact: Failed to make request after 5 attempts: Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON");
  const r = classifyJob(job("isolated-e2e (run 1)", "failure", { steps: [{ name: "Install Playwright browsers", conclusion: "success" }, { name: "Upload report", conclusion: "failure" }] }), text);
  assert.equal(r.category, CATEGORY.INFRA_ARTIFACT);
  assert.equal(r.level, LEVEL.VERIFIED);
  assert.match(r.evidence, /^##\[error\]Failed to CreateArtifact/);
  const onlyScript = classifyJob(job("j", "failure", { steps: [{ name: "Existing Playwright suite", conclusion: "failure" }] }), full(...SCRIPT));
  assert.equal(onlyScript.category, CATEGORY.UNKNOWN, "kildekode alene er ikke en diagnose — heller ikke en launch-check-tekst i et script");
  assert.equal(onlyScript.level, LEVEL.UNKNOWN);
});

test("Ubuntu 26.04 + Playwright 1.59.1 er INFRA-RUNNER (43167266559); installation og browserstart skelnes", () => {
  assert.equal(classifyJob(job("j", "failure"), full("Error: ERROR: Playwright does not support chromium on ubuntu26.04-x64")).category, CATEGORY.INFRA_RUNNER);
  assert.equal(classifyJob(job("j", "failure"), full("##[error]npx playwright install --with-deps failed or ran past 10 min (Ubuntu mirror, runner DNS or network) - no test ran")).category, CATEGORY.INFRA_INSTALL);
  assert.equal(classifyJob(job("j", "failure"), full("browser-launch-check: webkit cannot launch — Host system is missing dependencies")).category, CATEGORY.INFRA_BROWSER);
});

test("annullerede jobs: superseded er SANDSYNLIGT (tidsmæssigt sammenfald), uden nyere kørsel er årsagen UKENDT; timeouts skelnes (43213269528)", () => {
  const j = job("isolated-e2e (run 1)", "cancelled", { completedAt: "2026-11-12T12:00:53Z" });
  const sup = classifyJob(j, "", { newerRunAt: "2026-11-12T12:00:24Z" });
  assert.equal(sup.category, CATEGORY.SUPERSEDED);
  assert.equal(sup.level, LEVEL.PROBABLE);
  assert.equal(classifyJob(j, "", { newerRunAt: "2026-11-12T13:00:00Z" }).category, CATEGORY.CANCELLED, "nyere kørsel startede EFTER stoppet");
  const unk = classifyJob(j, "");
  assert.equal(unk.category, CATEGORY.CANCELLED);
  assert.equal(unk.level, LEVEL.UNKNOWN);
  const inst = classifyJob(job("isolated-e2e (run 1)", "failure", { steps: [{ name: "Install Playwright browsers", conclusion: "cancelled" }] }),
    full("##[error]The action 'Install Playwright browsers' has timed out after 15 minutes."));
  assert.equal(inst.category, CATEGORY.INFRA_INSTALL);
  assert.equal(inst.level, LEVEL.PROBABLE, "timeouten er set; at årsagen er net/spejl er udledt");
  const unit = classifyJob(job("unit (shard 2/4)", "cancelled", { steps: [{ name: "Run unit suite (shard)", conclusion: "cancelled" }] }),
    full("##[error]The job running on runner GitHub Actions 12 has exceeded the maximum execution time of 10 minutes."));
  assert.equal(unit.category, CATEGORY.TIMEOUT);
});

test("flaky tests vises med test, fejltype og genforsøg — også når jobbet samlet endte rødt", () => {
  const green = classifyJob(job("isolated-e2e (run 1)", "success"), full(...CACHE_OK, ...FLAKY_BLOCK,
    "playwright timing: wall 37.7 min, startup before first test 3.0 s, test time 36.2 min; tests 1654 (expected 1276, flaky 1, unexpected 0, skipped 377), retries 1"));
  assert.equal(green.category, CATEGORY.FLAKY);
  assert.deepEqual(green.facts.flaky, [{ browser: "webkit", test: "mobile-ux-validation.spec.ts:327", attempts: 2, passedOnRetry: true, error: "Error: page.goto: WebKit encountered an internal error" }]);
  const red = classifyJob(job("isolated-e2e (run 1)", "failure"), full(...FLAKY_BLOCK, "  1 failed",
    "playwright timing: wall 1 min, startup before first test 1 s, test time 1 min; tests 10 (expected 8, flaky 1, unexpected 1, skipped 0), retries 2"));
  assert.equal(red.category, CATEGORY.TEST_FAILURE);
  assert.equal(red.facts.flaky.length, 1);
  const md = report({ jobs: [] }, [red]);
  assert.match(md, /### Flaky tests \(1\)/);
  assert.match(md, /\| isolated-e2e \(run 1\) \(failure\) \| \[webkit\] mobile-ux-validation\.spec\.ts:327 \| Error: page\.goto: WebKit encountered an internal error \| ja \(2 forsøg\) \|/);
  assert.match(coverage([], [red]).join(), /1 flaky test\(s\) i et job, der endte failure/);
});

test("testfejl genkendes fra Playwright og node --test — og kaldes aldrig produktregression; ukendt fejl er UKENDT", () => {
  const pw = classifyJob(job("j", "failure"), full("  3 failed", "playwright timing: wall 1 min, startup before first test 1 s, test time 1 min; tests 10 (expected 6, flaky 0, unexpected 3, skipped 1), retries 1"));
  assert.equal(pw.category, CATEGORY.TEST_FAILURE);
  assert.match(pw.evidence, /unexpected 3/);
  const nt = classifyJob(job("unit (shard 1/4)", "failure"), full("ℹ pass 1194", "ℹ fail 2"));
  assert.equal(nt.category, CATEGORY.TEST_FAILURE);
  assert.equal(Object.values(CATEGORY).includes("PRODUCT-REGRESSION"), false);
  const unk = classifyJob(job("deploy", "failure", { steps: [{ name: "Noget nyt", conclusion: "failure" }] }), full("##[error]Process completed with exit code 2."));
  assert.equal(unk.category, CATEGORY.UNKNOWN);
  assert.equal(unk.level, LEVEL.UNKNOWN);
  assert.match(unk.evidence, /fejlet trin: "Noget nyt"/);
});

test("evidens afkortes og maskeres; ingen hemmelighed eller lang logdump i rapporten", () => {
  const long = classifyJob(job("j", "failure"), full(`Error: ERROR: Playwright does not support chromium on ubuntu26.04-x64 ${"x".repeat(3000)}`));
  assert.ok(long.evidence.length <= MAX_EVIDENCE, String(long.evidence.length));
  assert.ok(long.evidence.endsWith("…"));
  // Falske nøgler bygges ved kørselstid, så selve testfilen ikke ligner en lækket nøgle
  // (tests/unit/credential-hygiene.test.mjs scanner kildefilerne, og den må ikke svækkes).
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const jwt = [b64({ alg: "HS256" }), b64({ role: "test-only-not-a-key" }), b64({ sig: "fake-signature" })].join(".");
  const s = sanitize(`Authorization: Bearer abcdef123456 apikey=${jwt} ghp_${"A".repeat(36)} sb_secret_${"b".repeat(20)} https://user:hunter2@example.com/x password: hunter22`);
  for (const leak of [jwt, "abcdef123456", "A".repeat(36), "b".repeat(20), "hunter2"]) assert.equal(s.includes(leak), false, `${leak} lækkede: ${s}`);
  assert.match(s, /Bearer \*\*\*/);
  assert.match(s, /https:\/\/\*\*\*@example\.com/);
  const leakJob = classifyJob(job("j", "failure"), full(`browser-launch-check: webkit cannot launch — token=${"z".repeat(30)}`));
  assert.equal(leakJob.evidence.includes("z".repeat(30)), false);
  assert.equal(sanitize("en almindelig fejlbesked uden noget hemmeligt"), "en almindelig fejlbesked uden noget hemmeligt");
});

test("sprunget over tæller ikke som bestået; en grøn isolated-bane uden testopsummering er ikke dokumenteret dækning", () => {
  const skipped = classifyJob(job("test", "skipped"), "");
  assert.equal(skipped.category, CATEGORY.SKIPPED);
  assert.match(coverage([job("test", "skipped")], [skipped]).join(), /sprunget over — tæller ikke som bestået/);
  const r = classifyJob(job("isolated-e2e (run 1, K1-testprofil)", "success"), full(...CACHE_OK, "replay profile k1: K1 columns on question_attempts = 2"));
  assert.equal(r.facts.k1Columns, "replay profile k1: K1 columns on question_attempts = 2");
  assert.match(coverage([], [r]).join(), /ingen Playwright-opsummering/);
});

test("rapporten skelner GitHub-status fra diagnose og evidensniveau, escaper tabeltegn og nævner, at genkørsel kræver GO", () => {
  const run = { databaseId: 1, workflowName: "Isolated E2E", headBranch: "x", headSha: "a".repeat(40), event: "pull_request", status: "completed", conclusion: "failure", jobs: [] };
  const r = classifyJob(job("a|b", "failure"), full("##[error]npx playwright install --with-deps failed or ran past 10 min (Ubuntu mirror, runner DNS or network) - no test ran"));
  const md = report(run, [r]);
  assert.match(md, /^## CI-resumé: Isolated E2E · kørsel 1/);
  assert.match(md, /\| Job \| GitHub-status \| Diagnose \| Evidens \|/);
  assert.match(md, /\| a\\\|b \| failure \| INFRA-INSTALL \| VERIFICERET \|/);
  assert.match(md, /genkørsel kræver GO/);
  assert.equal(facts("").logAvailable, false);
});
