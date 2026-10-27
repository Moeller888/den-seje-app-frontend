// Runs the EXISTING Playwright suite against the isolated stack (D-110).
//
//   node tests/isolated/run-suite.mjs [playwright args…]
//
// 1. The runner's own environment must pass the isolation guard (nothing names production, no
//    provider key, no production secret NAME — PROD_BASE_URL / TEST_*_PASSWORD may not even exist).
// 2. It builds the suite's environment from scratch on top of that: the suite's variable names
//    (PROD_BASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY, TEST_*) are
//    set to the LOCAL stack, synthetic @e2e.invalid accounts and passwords generated for this run
//    only. No value comes from a repository secret or variable.
// 3. suiteViolations() re-checks that environment; any violation refuses before Playwright starts.
// 4. Every browser goes through the tripwire proxy; a single refused request fails the run even if
//    every test passed.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertIsolated, isLoopbackHttpUrl, mentionsProd, FORBIDDEN_VARS, SYNTHETIC_EMAIL_DOMAIN } from "./isolation-guard.mjs";
import { startTripwire } from "./tripwire-proxy.mjs";

// The suite's own variable names. Only these may appear in the suite environment although the
// isolation guard forbids them in the runner's — and only with the values buildSuiteEnv sets.
export const SUITE_VARS = Object.freeze([
  "PROD_BASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_PUBLISHABLE_KEY",
  "TEST_STUDENT_EMAIL", "TEST_TEACHER_EMAIL", "TEST_STUDENT2_EMAIL",
  "TEST_STUDENT_PASSWORD", "TEST_TEACHER_PASSWORD", "TEST_STUDENT2_PASSWORD",
]);
const EMAIL_VARS = ["TEST_STUDENT_EMAIL", "TEST_TEACHER_EMAIL", "TEST_STUDENT2_EMAIL"];
const PASSWORD_VARS = ["TEST_STUDENT_PASSWORD", "TEST_TEACHER_PASSWORD", "TEST_STUDENT2_PASSWORD"];

const runPassword = () => randomBytes(18).toString("base64url") + "Aa1!";

export function buildSuiteEnv(env, { runId = randomBytes(4).toString("hex"), password = runPassword, tripwire } = {}) {
  const out = { ...env };
  delete out.E2E_SLOT; // slots are a production-account mechanism; isolated runs have their own accounts
  out.ISOLATED_SUITE = "1";
  out.PROD_BASE_URL = env.ISOLATED_BASE_URL;
  out.SUPABASE_URL = env.ISOLATED_SUPABASE_URL;
  out.SUPABASE_SERVICE_ROLE_KEY = env.ISOLATED_SUPABASE_SERVICE_KEY;
  out.SUPABASE_PUBLISHABLE_KEY = env.ISOLATED_SUPABASE_ANON_KEY;
  out.TEST_STUDENT_EMAIL = `pupil-${runId}@${SYNTHETIC_EMAIL_DOMAIN}`;
  out.TEST_TEACHER_EMAIL = `teacher-${runId}@${SYNTHETIC_EMAIL_DOMAIN}`;
  out.TEST_STUDENT2_EMAIL = `pupil2-${runId}@${SYNTHETIC_EMAIL_DOMAIN}`;
  for (const v of PASSWORD_VARS) out[v] = password();
  if (tripwire) out.ISOLATED_TRIPWIRE_PROXY = tripwire;
  return out;
}

// Violations of the suite environment (names only, never values). Empty = safe to start Playwright.
export function suiteViolations(env) {
  const out = [];
  if (env.ISOLATED_E2E !== "1" || env.ISOLATED_SUITE !== "1") out.push("ISOLATED_E2E and ISOLATED_SUITE must be \"1\"");
  for (const name of ["PROD_BASE_URL", "SUPABASE_URL", "ISOLATED_BASE_URL", "ISOLATED_SUPABASE_URL"]) {
    if (!isLoopbackHttpUrl(env[name])) out.push(`${name} must be a loopback URL`);
  }
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(String(env.ISOLATED_TRIPWIRE_PROXY ?? ""))) out.push("ISOLATED_TRIPWIRE_PROXY must be a loopback proxy");
  for (const name of EMAIL_VARS) {
    const v = String(env[name] ?? "");
    if (!v.toLowerCase().endsWith("@" + SYNTHETIC_EMAIL_DOMAIN) || v.indexOf("@") < 1) out.push(`${name} must be on @${SYNTHETIC_EMAIL_DOMAIN}`);
  }
  for (const name of PASSWORD_VARS) if (String(env[name] ?? "").length < 20) out.push(`${name} must be a generated password`);
  for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_PUBLISHABLE_KEY"]) if (String(env[name] ?? "").length < 20) out.push(`${name} missing`);
  if (env.SUPABASE_SERVICE_ROLE_KEY !== env.ISOLATED_SUPABASE_SERVICE_KEY) out.push("SUPABASE_SERVICE_ROLE_KEY must be the local stack's key");
  if (env.SUPABASE_PUBLISHABLE_KEY !== env.ISOLATED_SUPABASE_ANON_KEY) out.push("SUPABASE_PUBLISHABLE_KEY must be the local stack's key");
  for (const name of FORBIDDEN_VARS) {
    if (SUITE_VARS.includes(name)) continue;
    if (Object.prototype.hasOwnProperty.call(env, name)) out.push(`${name} must not be set`);
  }
  for (const [name, value] of Object.entries(env)) if (mentionsProd(value)) out.push(`${name} refers to a production host or project`);
  return [...new Set(out)].sort();
}

async function main(args) {
  assertIsolated(process.env);
  const tripwire = await startTripwire();
  const env = buildSuiteEnv(process.env, { tripwire: tripwire.url });
  const v = suiteViolations(env);
  if (v.length) { await tripwire.close(); throw new Error("REFUSED — suite environment:\n  " + v.join("\n  ")); }
  console.log(`isolated suite: accounts on @${SYNTHETIC_EMAIL_DOMAIN}, target ${env.PROD_BASE_URL}, tripwire ${tripwire.url}`);
  const t0 = Date.now();
  const code = await new Promise((ok) => {
    const child = spawn("npx", ["playwright", "test", "-c", "tests/isolated/playwright.suite.config.ts", ...args], { env, stdio: "inherit", shell: process.platform === "win32" });
    child.on("exit", (c, sig) => ok(c ?? (sig ? 1 : 0)));
  });
  await tripwire.close();
  const hosts = [...new Set(tripwire.hits)].sort();
  const md = [
    "### isolated suite (existing Playwright suite against the local stack)",
    "",
    "| measure | value |",
    "|---|---|",
    `| Playwright exit | ${code} |`,
    `| browser requests refused by the tripwire | ${tripwire.hits.length}${hosts.length ? " — " + hosts.join(", ") : ""} |`,
    `| time | ${Math.round((Date.now() - t0) / 1000)} s |`,
    "",
  ].join("\n");
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  if (tripwire.hits.length) { console.error(`tripwire: ${tripwire.hits.length} browser request(s) left loopback — failing the run`); process.exit(1); }
  process.exit(code);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
}
