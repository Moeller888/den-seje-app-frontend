// Guards the offline E2E run (playwright.offline.config.ts + tests/offline-specs.mjs).
//
// Pinned:
//   - the offline config has NO globalSetup and loads NO .env, so it can never reset or read a live
//     test account (the reason it exists: global-setup resets the slot's accounts before any spec);
//   - it strips credential variables the calling shell may have exported;
//   - it runs exactly OFFLINE_SPECS, with the main config's project names (same goldens) and its own
//     output folders (never overwrites a live run's report);
//   - every listed spec meets the admission rules: own localhost server, every *.supabase.co request
//     answered locally or every off-host request asserted, and no PROD / process.env / dotenv /
//     tests/helpers / global-setup / @supabase/supabase-js import;
//   - playwright.config.ts is unchanged in this respect: it keeps global-setup and still runs them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { OFFLINE_SPECS, isCredentialVar } from "../offline-specs.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OFFLINE_CONFIG = readFileSync(join(ROOT, "playwright.offline.config.ts"), "utf8");
const MAIN_CONFIG = readFileSync(join(ROOT, "playwright.config.ts"), "utf8");
// The offline config's code without its comments, which name globalSetup and dotenv to explain why
// neither is there.
const OFFLINE_CODE = OFFLINE_CONFIG.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");

test("the offline config has no globalSetup and loads no .env", () => {
  assert.ok(!/globalSetup/.test(OFFLINE_CODE), "offline config must not declare globalSetup");
  assert.ok(!/dotenv/.test(OFFLINE_CODE), "offline config must not load .env");
  assert.ok(!/global-setup/.test(OFFLINE_CODE), "offline config must not reference tests/global-setup");
});

test("the offline config strips credential variables before anything runs", () => {
  assert.match(OFFLINE_CONFIG, /isCredentialVar\(name\)\) delete process\.env\[name\]/);
  const stripAt = OFFLINE_CONFIG.indexOf("delete process.env[name]");
  const configAt = OFFLINE_CONFIG.indexOf("defineConfig({");
  assert.ok(stripAt > 0 && stripAt < configAt, "credentials are removed before the config is defined");
});

test("isCredentialVar names the service-role key and every test account address and password", () => {
  for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "TEST_STUDENT_EMAIL", "TEST_STUDENT_PASSWORD",
    "TEST_TEACHER_EMAIL", "TEST_TEACHER_PASSWORD", "TEST_STUDENT2_EMAIL", "TEST_STUDENT2_PASSWORD"]) {
    assert.equal(isCredentialVar(name), true, name);
  }
  for (const name of ["SUPABASE_URL", "CI", "PATH", "E2E_SLOT", "PROD_BASE_URL", "", undefined, null, 7]) {
    assert.equal(isCredentialVar(name), false, String(name));
  }
});

test("the offline config runs exactly OFFLINE_SPECS", () => {
  assert.match(OFFLINE_CONFIG, /testMatch: OFFLINE_SPECS\.map\(\(file\) => `\*\*\/\$\{file\}`\)/);
  assert.equal(new Set(OFFLINE_SPECS).size, OFFLINE_SPECS.length, "no duplicates");
  assert.ok(OFFLINE_SPECS.length > 0);
  for (const file of OFFLINE_SPECS) {
    assert.match(file, /^[a-z0-9-]+\.spec\.ts$/, file);
    assert.ok(existsSync(join(ROOT, "tests", file)), `tests/${file} exists`);
  }
});

test("the offline config uses the main config's project names and its own output folders", () => {
  for (const name of ["chromium", "firefox", "webkit"]) {
    assert.ok(OFFLINE_CONFIG.includes(`name: '${name}'`), `offline project ${name}`);
    assert.ok(MAIN_CONFIG.includes(`name: '${name}'`), `main project ${name}`);
  }
  assert.match(OFFLINE_CONFIG, /outputDir: '\.\/test-results-offline'/);
  assert.match(OFFLINE_CONFIG, /outputFolder: 'playwright-report-offline'/);
});

for (const file of OFFLINE_SPECS) {
  test(`${file} meets the offline admission rules`, () => {
    const src = readFileSync(join(ROOT, "tests", file), "utf8");
    assert.match(src, /createServer\(/, "serves the checkout itself");
    assert.match(src, /http:\/\/localhost:/, "from localhost");
    const answersSupabase = /route\(\s*["'`]\*\*(:\/\/|\/)\*\.supabase\.co\/\*\*["'`]/.test(src);
    const assertsOffHost = /offHost/.test(src);
    assert.ok(answersSupabase || assertsOffHost, "answers every *.supabase.co request or asserts off-host requests");
    assert.ok(!/\bPROD\b/.test(src), "does not target the live site");
    assert.ok(!/process\.env/.test(src), "reads no environment");
    assert.ok(!/from\s+["'][^"']*(dotenv|helpers|global-setup|@supabase\/supabase-js)[^"']*["']/.test(src),
      "imports no dotenv, tests/helpers, global-setup or supabase-js");
  });
}

test("playwright.config.ts keeps global-setup and still runs the offline specs", () => {
  assert.match(MAIN_CONFIG, /globalSetup: '\.\/tests\/global-setup\.ts'/);
  assert.match(MAIN_CONFIG, /testMatch: '\*\*\/\*\.spec\.ts'/);
  for (const file of OFFLINE_SPECS) {
    assert.ok(!MAIN_CONFIG.includes(file.replace(".spec.ts", "")), `${file} is not ignored by the main config`);
  }
});
