// The isolated E2E proof of concept must never be able to reach production. Pinned here:
//   - the guard refuses every production URL, host, project ref, mail/AI key, production secret
//     name and non-synthetic test address, and reports only variable NAMES;
//   - the bundle server rewrites the production Supabase URL and key and refuses to serve a file
//     that still names the production project, and cannot escape its root;
//   - the workflow references no secret, takes no shared E2E lock, and runs the guard first.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isolationViolations, assertIsolated, isProdHost, isLoopbackHttpUrl, mentionsProd,
  PROD_PROJECT_REF, SYNTHETIC_EMAIL_DOMAIN, FORBIDDEN_VARS,
} from "../isolated/isolation-guard.mjs";
import { rewriteForLocal, resolveInside, startServer, PROD_SUPABASE_URL } from "../isolated/serve-build.mjs";

const read = (p) => readFileSync(new URL(p, new URL("../../", import.meta.url)), "utf8").split("\r\n").join("\n");
const OK = Object.freeze({
  ISOLATED_E2E: "1",
  ISOLATED_BASE_URL: "http://127.0.0.1:8788",
  ISOLATED_SUPABASE_URL: "http://127.0.0.1:54321",
  ISOLATED_PUPIL_EMAIL: `p@${SYNTHETIC_EMAIL_DOMAIN}`,
  PATH: "/usr/bin",
});

test("a clean isolated environment passes", () => {
  assert.deepEqual(isolationViolations({ ...OK }), []);
  assert.doesNotThrow(() => assertIsolated({ ...OK }));
});

test("the opt-in flag and both loopback URLs are required", () => {
  assert.ok(isolationViolations({ ...OK, ISOLATED_E2E: "true" }).some((v) => v.startsWith("ISOLATED_E2E")));
  const { ISOLATED_BASE_URL, ...noBase } = OK;
  assert.ok(isolationViolations(noBase).some((v) => v.startsWith("ISOLATED_BASE_URL")));
  for (const bad of ["https://xn--lrlig-sra.dk", "http://10.0.0.5:54321", "http://127.0.0.1.nip.io", "file:///etc", "not a url"]) {
    assert.ok(isolationViolations({ ...OK, ISOLATED_SUPABASE_URL: bad }).length > 0, bad);
  }
  assert.equal(isLoopbackHttpUrl("http://localhost:1"), true);
});

test("any value that names production is refused, by variable name only", () => {
  for (const value of [`https://${PROD_PROJECT_REF}.supabase.co`, "postgres://u@db.abc.supabase.co:5432/x", "https://xn--lrlig-sra.dk/login.html", "https://lærlig.dk", PROD_PROJECT_REF]) {
    const v = isolationViolations({ ...OK, SOME_VAR: value });
    assert.deepEqual(v, ["SOME_VAR refers to a production host or project"]);
    assert.ok(!v.join(" ").includes(value), "the value itself is never reported");
  }
});

test("mail/AI keys and production secret names are refused even when present", () => {
  for (const name of FORBIDDEN_VARS) {
    assert.ok(isolationViolations({ ...OK, [name]: "x" }).includes(`${name} must not be set in an isolated run`), name);
  }
  assert.ok(FORBIDDEN_VARS.includes("RESEND_API_KEY"));
  assert.ok(FORBIDDEN_VARS.includes("PROD_BASE_URL"));
  assert.ok(FORBIDDEN_VARS.includes("TEST_STUDENT_PASSWORD"));
});

test("test accounts must be synthetic: never hotmail, never an existing address", () => {
  for (const addr of ["teacher-test@hotmail.com", "student-teacher-test+e2e-slot-1@hotmail.com", "kontakt@xn--lrlig-sra.dk", "x@e2e.invalid.evil.com", "nobody"]) {
    assert.ok(isolationViolations({ ...OK, ISOLATED_TEACHER_EMAIL: addr }).some((v) => v.startsWith("ISOLATED_TEACHER_EMAIL")), addr);
  }
});

test("isProdHost / mentionsProd", () => {
  for (const h of ["tjzbehwfagiwpwodsgwg.supabase.co", "api.supabase.com", "xn--lrlig-sra.dk", "www.xn--lrlig-sra.dk", "lærlig.dk"]) assert.equal(isProdHost(h), true, h);
  for (const h of ["127.0.0.1", "localhost", "cdn.jsdelivr.net", "notsupabase.co.evil", ""]) assert.equal(isProdHost(h), false, h);
  assert.equal(mentionsProd("http://127.0.0.1:54321"), false);
});

test("the bundle rewrite replaces the production URL and key", () => {
  const src = `const supabaseUrl = "${PROD_SUPABASE_URL}";\nconst supabaseAnonKey = "sb_publishable_tktBmM5vnUD2qW98EVQOeA_MyZJfF-C";`;
  const out = rewriteForLocal(src, { supabaseUrl: "http://127.0.0.1:54321", anonKey: "local-anon-key-xxxxxxxxxxxx" });
  assert.ok(!out.includes(PROD_PROJECT_REF));
  assert.ok(!out.includes("sb_publishable_"));
  assert.ok(out.includes('"http://127.0.0.1:54321"') && out.includes('"local-anon-key-xxxxxxxxxxxx"'));
});

test("every frontend file that names the production project is covered by the rewrite", () => {
  for (const f of ["js/supabase.js", "supabaseClient.js", "shop.html"]) {
    const out = rewriteForLocal(read(f), { supabaseUrl: "http://127.0.0.1:54321", anonKey: "local-anon-key-xxxxxxxxxxxx" });
    assert.ok(!out.includes(PROD_PROJECT_REF), f + " still names production after the rewrite");
  }
});

test("the server stays inside its root and refuses an unrewritten production reference", async () => {
  const root = mkdtempSync(join(tmpdir(), "iso-serve-"));
  mkdirSync(join(root, "js"));
  writeFileSync(join(root, "login.html"), "<p>ok</p>");
  writeFileSync(join(root, "js", "supabase.js"), `const u = "${PROD_SUPABASE_URL}";`);
  // A reference the rewrite cannot replace (different form) must be refused, not served.
  writeFileSync(join(root, "js", "other.js"), `const u = "wss://${PROD_PROJECT_REF}.supabase.co/realtime";`);
  assert.equal(resolveInside(root, "/../../etc/passwd"), null);
  assert.equal(resolveInside(root, "/%2e%2e/%2e%2e/x"), null);
  const server = await startServer({ root, port: 0, supabaseUrl: "http://127.0.0.1:54321", anonKey: "local-anon-key-xxxxxxxxxxxx" });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(`${base}/login.html`)).status, 200);
    const js = await fetch(`${base}/js/supabase.js`);
    assert.equal(js.status, 200);
    assert.ok((await js.text()).includes("127.0.0.1:54321"));
    assert.equal((await fetch(`${base}/js/other.js`)).status, 500);
    assert.equal((await fetch(`${base}/missing.html`)).status, 404);
  } finally {
    server.close();
  }
});

test("the isolated workflow: no secrets, no repository variable, no shared lock, guard first, no production URL", () => {
  const wf = read(".github/workflows/isolated-e2e.yml");
  assert.ok(!wf.includes("secrets."), "the isolated workflow must not reference any secret");
  assert.ok(!wf.includes("vars."), "nor any repository variable (PROD_BASE_URL lives there)");
  assert.ok(!wf.includes("e2e-shared-supabase"), "it must not take the shared E2E lock");
  const code = wf.split("\n").filter((l) => !l.trim().startsWith("#") && !l.includes('grep -q "supabase.co"')).join("\n");
  assert.ok(!/supabase\.co|xn--lrlig-sra|lærlig/.test(code), "no production host outside comments and the negative bundle check");
  const job = wf.slice(wf.indexOf("\n  isolated-e2e:\n"));
  const steps = job.split("\n      - ").slice(1);
  const firstRun = steps.findIndex((s) => s.includes("run:"));
  assert.ok(steps[firstRun].startsWith("name: Guard"), "the guard is the first step that runs anything");
  assert.match(wf, /permissions:\n  contents: read/);
});

test("the main suite never collects the isolated specs", () => {
  const cfg = read("playwright.config.ts");
  assert.ok(cfg.includes("testMatch: '**/*.spec.ts',"));
  assert.ok(!"isolated-smoke.isolated.spec.mjs".endsWith(".spec.ts"));
});

// ── runner-level egress and honest job separation ─────────────────────────────────────────────
import { BLACKHOLE_HOSTS, hostsLines } from "../isolated/egress-blackhole.mjs";

test("the egress blackhole covers the production project, the site, mail and AI providers", () => {
  for (const h of [`${PROD_PROJECT_REF}.supabase.co`, `db.${PROD_PROJECT_REF}.supabase.co`, "api.supabase.com",
    "xn--lrlig-sra.dk", "www.xn--lrlig-sra.dk", "api.resend.com", "smtp.resend.com", "api.anthropic.com", "api.openai.com"]) {
    assert.ok(BLACKHOLE_HOSTS.includes(h), h);
  }
  const lines = hostsLines().trim().split("\n").filter((l) => !l.startsWith("#"));
  assert.equal(lines.length, BLACKHOLE_HOSTS.length);
  assert.ok(lines.every((l) => /^0\.0\.0\.0 [a-z0-9.-]+$/.test(l)));
});

test("no false green, and the order that makes the job fail-closed", () => {
  const wf = read(".github/workflows/isolated-e2e.yml");
  assert.ok(!wf.includes("continue-on-error"), "a failing step must never be masked");
  assert.ok(!/\|\|\s*true/.test(wf.split("Diagnostics (on failure)")[0].split("Stop local Supabase")[0].replace(/curl[^\n]*\|\| true\)/g, "")),
    "no `|| true` before the diagnostics, except around curl probes that are evaluated afterwards");
  const job = wf.slice(wf.indexOf("\n  isolated-e2e:\n"));
  const at = (s) => { const i = job.indexOf(s); assert.ok(i > 0, s); return i; };
  const order = [
    "Guard — refuse anything that is not isolated",
    "node tests/isolated/egress-blackhole.mjs --verify",
    "supabase start",
    "bootstrapMarkerSql",
    "node tests/isolated/schema/replay.mjs",
    "node tests/isolated/seed/seed.mjs",
    "supabase functions serve",
    "egress-firewall.sh lock",
    "egress-firewall.sh verify",
    "playwright.isolated.config.mjs",
    "node tests/isolated/run-suite.mjs",
  ].map(at);
  for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], `step ${i} in order`);
  // Tests run as the locked-down user, never as the runner user.
  for (const line of job.split("\n").filter((l) => /playwright test|run-suite\.mjs/.test(l))) {
    assert.ok(/sudo -E -u "\$ISOLATED_USER"/.test(line) || /^\s+(npx playwright test|node tests\/isolated\/run-suite)/.test(line), line);
  }
  assert.equal((job.match(/sudo -E -u "\$ISOLATED_USER"/g) || []).length, 2);
  // Matrix: each run is its own job (own runner, own stack); no fail-fast cancelling a sibling.
  assert.match(job, /fail-fast: false/);
  assert.match(job, /run: \$\{\{ fromJSON\(needs\.plan\.outputs\.runs\) \}\}/);
});
