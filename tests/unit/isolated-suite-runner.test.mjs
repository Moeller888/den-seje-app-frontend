// D-110: the existing Playwright suite runs against the isolated stack only through
// tests/isolated/run-suite.mjs, which builds the suite's environment from the local stack and refuses
// anything else; every browser goes through a refusing tripwire proxy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { connect } from "node:net";
import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSuiteEnv, suiteViolations, SUITE_VARS } from "../isolated/run-suite.mjs";
import { startTripwire } from "../isolated/tripwire-proxy.mjs";
import { workerRoute } from "../isolated/serve-build.mjs";
import { isolationViolations, FORBIDDEN_VARS } from "../isolated/isolation-guard.mjs";

const RUNNER = Object.freeze({
  ISOLATED_E2E: "1",
  ISOLATED_BASE_URL: "http://127.0.0.1:8788",
  ISOLATED_SUPABASE_URL: "http://127.0.0.1:54321",
  ISOLATED_SUPABASE_ANON_KEY: "local-anon-key-0123456789abcdef",
  ISOLATED_SUPABASE_SERVICE_KEY: "local-service-key-0123456789abcdef",
  PATH: "/usr/bin",
});
const TRIP = "http://127.0.0.1:41234";

test("the runner environment itself passes the isolation guard (no suite variable present yet)", () => {
  assert.deepEqual(isolationViolations(RUNNER), []);
});

test("buildSuiteEnv: suite variables point at the local stack, synthetic accounts, generated passwords", () => {
  const env = buildSuiteEnv(RUNNER, { runId: "abcd1234", tripwire: TRIP });
  assert.equal(env.PROD_BASE_URL, RUNNER.ISOLATED_BASE_URL);
  assert.equal(env.SUPABASE_URL, RUNNER.ISOLATED_SUPABASE_URL);
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, RUNNER.ISOLATED_SUPABASE_SERVICE_KEY);
  assert.equal(env.SUPABASE_PUBLISHABLE_KEY, RUNNER.ISOLATED_SUPABASE_ANON_KEY);
  assert.equal(env.TEST_STUDENT_EMAIL, "pupil-abcd1234@e2e.invalid");
  assert.equal(env.TEST_TEACHER_EMAIL, "teacher-abcd1234@e2e.invalid");
  assert.equal(env.TEST_STUDENT2_EMAIL, "pupil2-abcd1234@e2e.invalid");
  for (const v of ["TEST_STUDENT_PASSWORD", "TEST_TEACHER_PASSWORD", "TEST_STUDENT2_PASSWORD"]) assert.ok(env[v].length >= 24, v);
  assert.notEqual(env.TEST_STUDENT_PASSWORD, env.TEST_TEACHER_PASSWORD, "independent passwords");
  assert.notEqual(buildSuiteEnv(RUNNER, { tripwire: TRIP }).TEST_STUDENT_PASSWORD, env.TEST_STUDENT_PASSWORD, "fresh per run");
  assert.deepEqual(suiteViolations(env), []);
});

test("buildSuiteEnv drops E2E_SLOT: production account slots never apply to an isolated run", () => {
  assert.equal("E2E_SLOT" in buildSuiteEnv({ ...RUNNER, E2E_SLOT: "2" }, { tripwire: TRIP }), false);
});

const bad = (mut) => { const env = buildSuiteEnv(RUNNER, { tripwire: TRIP }); mut(env); return suiteViolations(env); };

test("suiteViolations refuses every way the suite could reach production or a real account", () => {
  assert.ok(bad((e) => { e.PROD_BASE_URL = "https://xn--lrlig-sra.dk"; }).length > 0);
  assert.ok(bad((e) => { e.SUPABASE_URL = "https://example.org"; }).some((v) => v.startsWith("SUPABASE_URL")));
  assert.ok(bad((e) => { e.TEST_TEACHER_EMAIL = "teacher-test@hotmail.com"; }).some((v) => v.startsWith("TEST_TEACHER_EMAIL")));
  assert.ok(bad((e) => { e.TEST_STUDENT_PASSWORD = "short"; }).some((v) => v.startsWith("TEST_STUDENT_PASSWORD")));
  assert.ok(bad((e) => { e.SUPABASE_SERVICE_ROLE_KEY = "some-other-service-key-0123456789"; }).some((v) => v.startsWith("SUPABASE_SERVICE_ROLE_KEY")));
  assert.ok(bad((e) => { e.RESEND_API_KEY = "x"; }).includes("RESEND_API_KEY must not be set"));
  assert.ok(bad((e) => { e.OPENAI_API_KEY = "x"; }).includes("OPENAI_API_KEY must not be set"));
  assert.ok(bad((e) => { e.SOMETHING = "postgres://db.tjzbehwfagiwpwodsgwg.supabase.co"; }).includes("SOMETHING refers to a production host or project"));
  assert.ok(bad((e) => { e.ISOLATED_TRIPWIRE_PROXY = "http://10.0.0.5:3128"; }).length > 0);
  assert.ok(bad((e) => { delete e.ISOLATED_SUITE; }).length > 0);
});

test("only the suite's own variable names are exempt from FORBIDDEN_VARS, and only in the suite environment", () => {
  const exempt = FORBIDDEN_VARS.filter((v) => SUITE_VARS.includes(v)).sort();
  assert.deepEqual(exempt, ["PROD_BASE_URL", "TEST_STUDENT2_PASSWORD", "TEST_STUDENT_PASSWORD", "TEST_TEACHER_PASSWORD"]);
  // The runner's own environment must still not carry them.
  assert.ok(isolationViolations({ ...RUNNER, PROD_BASE_URL: "http://127.0.0.1:8788" }).includes("PROD_BASE_URL must not be set in an isolated run"));
});

test("the tripwire refuses and records plain HTTP and CONNECT (HTTPS) requests, host only", async () => {
  const t = await startTripwire();
  const port = Number(new URL(t.url).port);
  const status = await new Promise((ok, ko) => {
    const r = request({ host: "127.0.0.1", port, method: "GET", path: "http://example.org/secret/path?x=1" }, (res) => { res.resume(); ok(res.statusCode); });
    r.on("error", ko); r.end();
  });
  assert.equal(status, 403);
  const reply = await new Promise((ok, ko) => {
    const s = connect(port, "127.0.0.1", () => s.write("CONNECT api.openai.com:443 HTTP/1.1\r\nHost: api.openai.com:443\r\n\r\n"));
    let buf = ""; s.on("data", (d) => { buf += d; }); s.on("end", () => ok(buf)); s.on("error", ko);
  });
  assert.match(reply, /^HTTP\/1\.1 403/);
  assert.deepEqual(t.hits, ["example.org", "api.openai.com:443"]);
  await t.close();
});

test("the bundle server answers the Worker's dynamic routes exactly like the Worker without Azure or R2", () => {
  assert.deepEqual(workerRoute("POST", "/api/tts"), { status: 503, body: { error: "azure_not_configured" } });
  assert.deepEqual(workerRoute("GET", "/api/tts"), { status: 405, body: { error: "method_not_allowed" } });
  assert.deepEqual(workerRoute("GET", "/tts/v1/" + "a".repeat(64) + ".mp3"), { status: 503, body: { error: "tts_not_configured" } });
  assert.equal(workerRoute("GET", "/login.html"), null);
  const worker = readFileSync(new URL("../../worker/index.js", import.meta.url), "utf8");
  assert.match(worker, /azure_not_configured: 503/);
  assert.match(worker, /if \(!env\.TTS_BUCKET\) return json\(503, \{ error: "tts_not_configured" \}\)/);
});

test("the suite config refuses unless started by the runner, and proxies every browser project", () => {
  const cfg = readFileSync(new URL("../isolated/playwright.suite.config.ts", import.meta.url), "utf8");
  assert.match(cfg, /process\.env\.ISOLATED_SUITE !== "1"/);
  assert.match(cfg, /\^http:\\\/\\\/127\\\.0\\\.0\\\.1:\\d\+\$/);
  assert.match(cfg, /projects: \(base\.projects \?\? \[\]\)\.map\(\(p\) => \(\{ \.\.\.p, use: projectUse\(p\) \}\)\)/);
  assert.match(cfg, /\.\.\.\(p\.use \?\? \{\}\),\s+proxy,\s+ignoreHTTPSErrors: true,/);
  // Local Network Access is lifted for Chromium projects only (the permission is Chromium-specific).
  assert.match(cfg, /\.\.\.\(isChromium\(p\) \? \{ permissions: \[\.\.\.\(p\.use\?\.permissions \?\? \[\]\), "local-network-access"\] \} : \{\}\)/);
  // Only loopback and the two locally served CDN hosts bypass the tripwire.
  assert.match(cfg, /bypass: "127\.0\.0\.1,localhost,::1,cdn\.jsdelivr\.net,esm\.sh"/);
});

test("the local CDN stand-in answers only the two CDN hosts, only with mirrored modules", async () => {
  const { lookup, CDN_HOSTS } = await import("../isolated/cdn-https.mjs");
  assert.deepEqual(CDN_HOSTS, ["cdn.jsdelivr.net", "esm.sh"]);
  const mirror = { index: { "https://cdn.jsdelivr.net/npm/a@1/+esm": { key: "k", type: "text/javascript" } }, read: () => "export const a = 1;" };
  assert.deepEqual(lookup(mirror, "cdn.jsdelivr.net", "/npm/a@1/+esm"), { body: "export const a = 1;", type: "text/javascript" });
  assert.deepEqual(lookup(mirror, "CDN.JSDELIVR.NET:443", "/npm/a@1/+esm")?.body, "export const a = 1;");
  assert.equal(lookup(mirror, "cdn.jsdelivr.net", "/npm/b@1/+esm"), null, "not mirrored → 404");
  assert.equal(lookup(mirror, "evil.example", "/npm/a@1/+esm"), null, "another host → 404");
});

test("the workflow maps the CDN hosts to loopback only after the mirror is fetched, and checks it", () => {
  const wf = readFileSync(new URL("../../.github/workflows/isolated-e2e.yml", import.meta.url), "utf8");
  const fetchAt = wf.indexOf("cdn-mirror.mjs --fetch");
  const hostsAt = wf.indexOf('echo "127.0.0.1 cdn.jsdelivr.net esm.sh" | sudo tee -a /etc/hosts');
  const lockAt = wf.indexOf("egress-firewall.sh lock");
  assert.ok(fetchAt > 0 && hostsAt > fetchAt && lockAt > hostsAt);
  // Both address families are mapped, redirected and verified (IPv4-only let AAAA fall through to DNS).
  assert.ok(wf.indexOf('echo "::1 cdn.jsdelivr.net esm.sh" | sudo tee -a /etc/hosts') > fetchAt);
  assert.match(wf, /ip6tables -w 30 -t nat -A OUTPUT -o lo -d ::1 -p tcp --dport 443 -j REDIRECT --to-ports 8443/);
  assert.match(wf, /getent ahostsv4 "\$h" \| awk '\{print \$1\}' \| sort -u\)" = "127\.0\.0\.1" \]/);
  assert.match(wf, /getent ahostsv6 "\$h" \| awk '\{print \$1\}' \| sort -u\)" = "::1" \]/);
  assert.match(wf, /curl -6 -sk "https:\/\/\$h\/" -o \/dev\/null -w '%\{remote_ip\}'\)" = "::1" \]/);
  assert.match(wf, /-subj "\/CN=cdn\.jsdelivr\.net"\s+-addext "subjectAltName=DNS:cdn\.jsdelivr\.net,DNS:esm\.sh"/);
});

// A fake service-role client: records every write, answers the catalog lookup, can fail one step.
function fakeAdmin({ catalog = ["aura-gold"], failOn = null } = {}) {
  const writes = [];
  let n = 0;
  const result = (step) => ({ error: failOn === step ? { message: `${step} refused` } : null });
  const from = (table) => ({
    select: () => ({ eq: (_c, id) => ({ maybeSingle: async () => ({ data: catalog.includes(id) ? { id } : null, error: null }) }) }),
    upsert: async (row, opts) => { writes.push({ table, op: "upsert", row, opts }); return result(`${table}.upsert`); },
    insert: async (row) => { writes.push({ table, op: "insert", row }); return result(`${table}.insert`); },
  });
  const auth = { admin: { createUser: async (attrs) => {
    writes.push({ table: "auth.users", op: "create", row: attrs });
    if (failOn === "createUser") return { data: null, error: { message: "createUser refused" } };
    return { data: { user: { id: `id-${++n}` } }, error: null };
  } } };
  return { from, auth, writes };
}

test("primary account: a password-less owner teacher, the pupil under it, 1 correct answer, owns aura-gold", async () => {
  const { provisionPrimaryAccount, OWNED_ITEM_ID } = await import("../isolated/seed/primary-account.mjs");
  const admin = fakeAdmin();
  const ids = await provisionPrimaryAccount(admin, { runId: "abcd1234", studentEmail: "pupil-abcd1234@e2e.invalid", studentPassword: "x".repeat(24) });
  assert.deepEqual(ids, { ownerId: "id-1", pupilId: "id-2" });
  const [owner, ownerProfile, pupil, pupilProfile, progress, item] = admin.writes;
  assert.deepEqual(owner.row, { email: "owner-abcd1234@e2e.invalid", email_confirm: true }, "no password: nobody can sign in as the owner");
  assert.equal(ownerProfile.row.role, "teacher");
  assert.equal(pupil.row.email, "pupil-abcd1234@e2e.invalid");
  assert.deepEqual([pupilProfile.row.role, pupilProfile.row.teacher_id], ["student", "id-1"]);
  assert.deepEqual([progress.table, progress.row.correct_answers], ["student_progress", 1]);
  assert.deepEqual([item.table, item.row], ["user_items", { user_id: "id-2", item_id: OWNED_ITEM_ID }]);
  assert.equal(OWNED_ITEM_ID, "aura-gold");
});

test("primary account fails loud: missing catalog item, non-synthetic address, any refused write", async () => {
  const { provisionPrimaryAccount } = await import("../isolated/seed/primary-account.mjs");
  const args = { runId: "abcd1234", studentEmail: "pupil-abcd1234@e2e.invalid", studentPassword: "x".repeat(24) };
  await assert.rejects(provisionPrimaryAccount(fakeAdmin({ catalog: [] }), args), /aura-gold is not in the catalog/);
  await assert.rejects(provisionPrimaryAccount(fakeAdmin(), { ...args, studentEmail: "student-test@hotmail.com" }), /must be on @e2e\.invalid/);
  await assert.rejects(provisionPrimaryAccount(fakeAdmin(), { ...args, runId: "" }), /runId missing/);
  for (const step of ["createUser", "profiles.upsert", "student_progress.upsert", "user_items.insert"]) {
    await assert.rejects(provisionPrimaryAccount(fakeAdmin({ failOn: step }), args), /primary-account: .* failed/, step);
  }
});

test("the workflow never pipes into grep -q (pipefail + SIGPIPE fails a passing check, and a negated one could pass)", () => {
  const wf = readFileSync(new URL("../../.github/workflows/isolated-e2e.yml", import.meta.url), "utf8");
  const code = wf.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
  assert.doesNotMatch(code, /\|\s*grep -q/);
  assert.match(wf, /curl -sf "\$ISOLATED_BASE_URL\/js\/supabase\.js" -o "\$RUNNER_TEMP\/served-supabase\.js"/);
});

test("engagement-panel finds student2's row by its own address, not the production default", () => {
  const spec = readFileSync(new URL("../engagement-panel.spec.ts", import.meta.url), "utf8");
  assert.doesNotMatch(spec, /hasText: "student-teacher-test"/);
  assert.match(spec, /const STUDENT2_DISPLAY_NAME = STUDENT2_EMAIL\.split\("@"\)\[0\];/);
});

test("every iptables/ip6tables call waits for the xtables lock (Docker holds it while containers start)", () => {
  for (const f of ["../../.github/workflows/isolated-e2e.yml", "../isolated/egress-firewall.sh"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    const calls = src.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n").match(/\bip6?tables\b[^\n]*/g) ?? [];
    assert.ok(calls.length > 0, f);
    for (const c of calls) assert.match(c, /^ip6?tables -w 30 /, `${f}: ${c}`);
  }
});

test("measure-parallel: overlap counts the peak and the window in which ALL suites ran at once", async () => {
  const { overlap } = await import("../isolated/measure-parallel.mjs");
  assert.deepEqual(overlap([{ start: 0, end: 10 }, { start: 5, end: 15 }, { start: 8, end: 20 }]), { peak: 3, commonMs: 2 });
  assert.deepEqual(overlap([{ start: 0, end: 5 }, { start: 5, end: 9 }]), { peak: 1, commonMs: 0 }, "touching is not overlapping");
  assert.deepEqual(overlap([{ start: 0, end: 5 }, { start: NaN, end: NaN }]), { peak: 1, commonMs: 5 }, "a skipped suite is no interval");
  assert.deepEqual(overlap([]), { peak: 0, commonMs: 0 });
});

test("measure-parallel: a job log yields its database cluster, its pupil, its counts and the tripwire", async () => {
  const { parseJobLog } = await import("../isolated/measure-parallel.mjs");
  const log = [
    "2026-10-28T04:56:00.1Z   ISOLATED_DB_SYSID: 7701577688261992492",
    "2026-10-28T04:57:00.1Z   ISOLATED_DB_SYSID: 7701577688261992492",
    "2026-10-28T04:58:00.1Z   4 passed (13.3s)",
    "2026-10-28T04:59:00.1Z isolated suite: primary pupil 3ed45ea1-3b95-4fc1-90df-a51bdf14740e provisioned (owner teacher x)",
    "2026-10-28T05:35:00.1Z   \x1b[31m4 failed\x1b[39m",
    "2026-10-28T05:35:00.2Z   1 flaky",
    "2026-10-28T05:35:00.3Z   989 passed (38.7m)",
    "2026-10-28T05:35:01.0Z | browser requests refused by the tripwire | 0 |",
    "2026-10-28T04:55:00.0Z edge-runtime: serving after start attempt 2",
    "2026-10-28T04:57:00.0Z negative controls (pre-lock): all protections refused the wrong configuration",
    "2026-10-28T04:58:00.0Z negative controls (post-lock): all protections refused the wrong configuration",
  ].join("\n");
  assert.deepEqual(parseJobLog(log), {
    sysids: ["7701577688261992492"], pupil: "3ed45ea1-3b95-4fc1-90df-a51bdf14740e", tripwire: 0,
    edgeStart: 2, restarts: 0, sigbus: 0, controls: 2, passed: 989, failed: 4, flaky: 1,
  });
  assert.equal(parseJobLog("").tripwire, null, "no tripwire line = no evidence, never 0");
});

test("plan: one isolated job per PR and per d110/par-* branch; dispatch chooses 1/3/6/9", () => {
  const wf = readFileSync(new URL("../../.github/workflows/isolated-e2e.yml", import.meta.url), "utf8");
  assert.match(wf, /if \[ "\$EVENT" = "pull_request" \]; then default=1; fi/);
  assert.match(wf, /case "\$REF_NAME" in d110\/par-\*\) default=1 ;; esac/);
  assert.match(wf, /n="\$\{PARALLEL:-\$default\}"/);
  assert.match(wf, /case "\$n" in 1\|3\|6\|9\) ;; \*\) echo "invalid parallel: \$n" >&2; exit 1 ;; esac/);
  // Never the production E2E lock (the concurrency group itself: next test).
  assert.doesNotMatch(wf, /e2e-shared-supabase/);
});

test("D1 trigger: push to main and to d110/** both run; pull requests to main still run", () => {
  const wf = readFileSync(new URL("../../.github/workflows/isolated-e2e.yml", import.meta.url), "utf8").split("\r\n").join("\n");
  const on = wf.slice(wf.indexOf("\non:\n"), wf.indexOf("\npermissions:"));
  assert.match(on, /\n  pull_request:\n    branches: \[ main \]\n/);
  assert.match(on, /\n  push:\n(    #.*\n)*    branches: \[ main, "d110\/\*\*" \]\n/);
  assert.match(on, /\n  workflow_dispatch:\n/);
  assert.match(on, /options: \[ "1", "3", "6", "9" \]\n        default: "3"/);
});

test("D1 concurrency: overtaken pushes and PR commits cancel; a dispatch and a push to main never cancel each other", () => {
  const wf = readFileSync(new URL("../../.github/workflows/isolated-e2e.yml", import.meta.url), "utf8").split("\r\n").join("\n");
  assert.ok(wf.includes(
    "concurrency:\n  group: >-\n    ${{ github.event_name == 'workflow_dispatch'\n" +
    "      && format('isolated-e2e-dispatch-{0}', github.run_id)\n" +
    "      || format('isolated-e2e-{0}-{1}', github.event_name, github.ref) }}\n" +
    "  cancel-in-progress: true\n"), "workflow-level concurrency group, exactly");
  // Only one concurrency block, and none on a job that could override it.
  assert.equal(wf.split("concurrency:").length - 1, 1);
});

test("D1 plan: exactly one run per push to main and per PR; dispatch on main still chooses; other pushes 3", () => {
  const wf = readFileSync(new URL("../../.github/workflows/isolated-e2e.yml", import.meta.url), "utf8").split("\r\n").join("\n");
  const step = wf.split("\n      - id: n\n")[1].split("\n  isolated-e2e:\n")[0];
  const script = step.split("        run: |\n")[1].split("\n").map((l) => l.replace(/^ {10}/, "")).join("\n");
  const plan = (env) => {
    const dir = mkdtempSync(join(tmpdir(), "iso-plan-"));
    const out = join(dir, "out");
    writeFileSync(out, "");
    const r = spawnSync("bash", ["-c", script], { env: { ...process.env, PARALLEL: "", ...env, GITHUB_OUTPUT: out }, encoding: "utf8" });
    const runs = r.status === 0 ? JSON.parse(readFileSync(out, "utf8").trim().replace(/^runs=/, "")).length : null;
    rmSync(dir, { recursive: true, force: true });
    return runs;
  };
  assert.equal(plan({ EVENT: "push", REF_NAME: "main" }), 1, "push to main: one run");
  assert.equal(plan({ EVENT: "pull_request", REF_NAME: "466/merge" }), 1, "pull request: one run");
  assert.equal(plan({ EVENT: "push", REF_NAME: "d110/par-3" }), 1, "d110/par-*: one run");
  assert.equal(plan({ EVENT: "push", REF_NAME: "d110/isolated-e2e" }), 3, "other d110 pushes: 3");
  assert.equal(plan({ EVENT: "push", REF_NAME: "mainline" }), 3, "only the exact branch main");
  assert.equal(plan({ EVENT: "workflow_dispatch", REF_NAME: "main", PARALLEL: "9" }), 9, "dispatch on main chooses");
  assert.equal(plan({ EVENT: "workflow_dispatch", REF_NAME: "main", PARALLEL: "1" }), 1);
  assert.equal(plan({ EVENT: "push", REF_NAME: "main", PARALLEL: "4" }), null, "invalid value fails, never a default");
});

test("D1 isolation: no step is conditioned on the event or branch, so a push to main runs every safety layer a PR runs", () => {
  const wf = readFileSync(new URL("../../.github/workflows/isolated-e2e.yml", import.meta.url), "utf8").split("\r\n").join("\n");
  const job = wf.slice(wf.indexOf("\n  isolated-e2e:\n"));
  for (const cond of job.split("\n").filter((l) => /^\s+if:/.test(l))) {
    assert.doesNotMatch(cond, /event_name|github\.ref|ref_name|main/, cond);
  }
  for (const layer of ["isolation-guard.mjs", "egress-blackhole.mjs --verify", "negative-controls.sh pre-lock",
    "egress-firewall.sh lock", "negative-controls.sh post-lock",
    "tests/isolated/run-suite.mjs"]) assert.ok(job.includes(layer), layer); // run-suite starts the tripwire
});

test("negative controls run in every job, before and after the lock, and never name a production URL as a target", () => {
  const wf = readFileSync(new URL("../../.github/workflows/isolated-e2e.yml", import.meta.url), "utf8");
  const pre = wf.indexOf("negative-controls.sh pre-lock"), lock = wf.indexOf("egress-firewall.sh lock");
  const post = wf.indexOf("negative-controls.sh post-lock"), verify = wf.indexOf("egress-firewall.sh verify");
  const smoke = wf.indexOf("playwright.isolated.config.mjs");
  assert.ok(pre > 0 && pre < lock && verify < post && post < smoke, "pre-lock → lock → verify → post-lock → smoke");
  const sh = readFileSync(new URL("../isolated/negative-controls.sh", import.meta.url), "utf8");
  // A control that does not fail must fail the job.
  assert.match(sh, /if \[ "\$failures" -gt 0 \]; then echo "negative controls: \$failures failed"; exit 1; fi/);
  // Production names appear only as guard input (env assignments), never as a curl / fetch target.
  for (const line of sh.split("\n").filter((l) => /curl|fetch\(|verify\(\[/.test(l))) {
    assert.doesNotMatch(line, /xn--lrlig-sra|tjzbehwfagiwpwodsgwg|PROD_SITE|PROD_DB/, line);
  }
  for (const c of ["guard refuses PROD_BASE_URL", "suite config refuses without run-suite", "blackhole verify reports an unprotected name",
    "an IPv4-only mapping fails the both-families check", "seed guard refuses a foreign database token",
    "inside the test group the internet is not", "the tripwire refuses and records"]) assert.ok(sh.includes(c), c);
});

test("Edge Functions step fails closed: a runtime that never serves, or any function behind a gateway error, fails the job", () => {
  const wf = readFileSync(new URL("../../.github/workflows/isolated-e2e.yml", import.meta.url), "utf8");
  const step = wf.split("- name: Edge Functions")[1].split("\n      - name:")[0];
  assert.match(step, /for attempt in 1 2 3; do/, "bounded: at most 3 server starts");
  assert.match(step, /\[ "\$ready" = yes \] \|\| \{ echo "Edge Runtime did not serve after 3 start attempts" >&2; exit 1; \}/);
  assert.match(step, /\[ "\$down" = 0 \] \|\| \{ echo "\$down function\(s\) not served correctly by the Edge Runtime" >&2; exit 1; \}/);
  // Readiness is the function's own documented preflight answer (200 + "ok"), not "any non-gateway status".
  assert.match(step, /\[ "\$\(printf '%s' "\$reply" \| tail -n 1\)" = "200" \] && \[ "\$\(printf '%s' "\$reply" \| head -n 1\)" = "ok" \]/);
  const gnq = readFileSync(new URL("../../supabase/functions/get-next-question/index.ts", import.meta.url), "utf8");
  assert.match(gnq, /if \(req\.method === "OPTIONS"\) \{\s+return new Response\("ok", \{ headers: corsHeaders \}\);/);
  // A function with a preflight handler must answer 2xx; the attempt that served is logged per job.
  assert.match(step, /if grep -qE 'method === "OPTIONS"' "\$d\/index\.ts"; then\n\s+echo "warm \$fn: \$code \(preflight handler: 2xx required\)"\n\s+if \[ "\$\{code#2\}" = "\$code" \]; then down=\$\(\(down \+ 1\)\); fi/);
  // At least most functions are held to 2xx (a check that excluded everything would be vacuous).
  const fns = readdirSync(new URL("../../supabase/functions/", import.meta.url), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(new URL(`../../supabase/functions/${d.name}/index.ts`, import.meta.url)));
  const withHandler = fns.filter((d) => /method === "OPTIONS"/.test(readFileSync(new URL(`../../supabase/functions/${d.name}/index.ts`, import.meta.url), "utf8")));
  assert.ok(withHandler.length >= 14 && withHandler.some((d) => d.name === "process-event") && withHandler.some((d) => d.name === "get-next-question"));
  assert.match(step, /echo "edge-runtime: serving after start attempt \$attempt"/);
  assert.doesNotMatch(step, /playwright/, "only the server start is retried, never a test");
});

test("measure-parallel counts runtime events only, never the workflow's echoed source text", async () => {
  const { parseJobLog } = await import("../isolated/measure-parallel.mjs");
  // Lines Actions echoes from the step's script (seen in run 40654226681): none of them is an event.
  const source = [
    '2026-10-28T08:05:00.1Z \x1b[36;1m# The edge-runtime container can die while booting (SIGBUS, "Bus error (core dumped)", exit 135:\x1b[0m',
    '2026-10-28T08:05:00.2Z \x1b[36;1m  echo "::warning::Edge Runtime not serving (start attempt $attempt): $(tail -n 3 x)"\x1b[0m',
    '2026-10-28T08:05:00.3Z \x1b[36;1m  if [ "$ready" = yes ]; then echo "edge-runtime: serving after start attempt $attempt"; break; fi\x1b[0m',
    '2026-10-28T08:05:00.4Z \x1b[36;1mecho "negative controls ($1): all protections refused the wrong configuration"\x1b[0m',
  ];
  assert.deepEqual((({ restarts, sigbus, edgeStart, controls }) => ({ restarts, sigbus, edgeStart, controls }))(parseJobLog(source.join("\n"))),
    { restarts: 0, sigbus: 0, edgeStart: null, controls: 0 });
  // Real events: the runtime's own line (job + functions.log timestamps), GitHub's rendered annotation.
  const events = [...source,
    "2026-10-28T07:39:01.9Z 2026-10-28T07:39:01.826276609Z Bus error (core dumped)",
    "2026-10-28T07:39:02.0Z ##[warning]Edge Runtime not serving (start attempt 1): Bus error (core dumped)",
    "2026-10-28T07:39:40.0Z edge-runtime: serving after start attempt 2",
  ];
  const r = parseJobLog(events.join("\n"));
  assert.deepEqual([r.restarts, r.sigbus, r.edgeStart], [1, 1, 2]);
});

test("transition step A: every pull request to main runs the isolated suite (no paths filter)", () => {
  const wf = readFileSync(new URL("../../.github/workflows/isolated-e2e.yml", import.meta.url), "utf8");
  const triggers = wf.slice(wf.indexOf("\non:\n"), wf.indexOf("\npermissions:"));
  assert.match(triggers, /\n  pull_request:\n    branches: \[ main \]\n  push:/);
  assert.doesNotMatch(triggers, /paths(-ignore)?:/);
});
