// D-110: the existing Playwright suite runs against the isolated stack only through
// tests/isolated/run-suite.mjs, which builds the suite's environment from the local stack and refuses
// anything else; every browser goes through a refusing tripwire proxy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { connect } from "node:net";
import { readFileSync } from "node:fs";
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
  assert.match(wf, /getent hosts cdn\.jsdelivr\.net/);
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
