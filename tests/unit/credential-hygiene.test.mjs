// Credential hygiene guard (offline: files and workflows only — no network, no Supabase, no browser).
//
// This public repository carried a live service-role key in a tracked script, test-account passwords
// as literal fallbacks, and Playwright report artifacts that published the typed passwords as step
// titles (`Fill "<value>"`). These tests keep all three from coming back:
//   1. no file holds a service_role JWT, a secret API key or an access token;
//   2. no source file assigns a literal to a credential name, fills a password field with a literal,
//      or gives a password environment variable a fallback;
//   3. the credential module fails closed and never reveals a value, and global-setup refuses to
//      touch Supabase before every required secret is present;
//   4. no workflow can publish an artifact that could carry credentials, no workflow runs on
//      pull_request_target, and a fork PR (which gets no secrets) fails before it mutates anything.
// Every matcher has a NEGATIVE CONTROL: a synthetic sample built at runtime, proving the matcher
// actually fires on the shape the original leak had. Findings name the file and the kind of
// problem, never the matched value.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import {
  REQUIRED_E2E_SECRETS, DERIVED_PASSWORDS,
  readRequiredSecret, missingSecrets, derivePassword, derivedPassword,
} from "../test-credentials.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(REPO, rel), "utf8");

const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".html", ".json", ".yml", ".yaml", ".toml", ".ps1", ".sh", ".py"]);

function repoFiles() {
  const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  return [...new Set(out.split("\0").filter(Boolean))]
    .filter((f) => !f.startsWith("node_modules/") && !f.includes("/node_modules/"))
    .filter((f) => existsSync(join(REPO, f)));
}

const textFiles = () => repoFiles().filter((f) => SOURCE_EXTENSIONS.has(extname(f).toLowerCase()) || /(^|\/)\.env/.test(f));
const workflowFiles = () => repoFiles().filter((f) => f.startsWith(".github/workflows/") && /\.ya?ml$/.test(f));

// ── matchers ────────────────────────────────────────────────────────────────────────────────────

function jwtRole(token) {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).role ?? null;
  } catch {
    return null;
  }
}

const JWT = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

function privilegedKeyFindings(text) {
  const found = [];
  for (const token of text.match(JWT) ?? []) if (jwtRole(token) === "service_role") found.push("service_role JWT");
  if (/\bsb_secret_[A-Za-z0-9_-]{10,}/.test(text)) found.push("sb_secret_ key");
  if (/\bsbp_[a-f0-9]{30,}/.test(text)) found.push("Supabase personal access token");
  if (/\b(?:ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/.test(text)) found.push("GitHub token");
  return found;
}

// Any `name = "literal"`, `name: "literal"` or `name ?? "literal"`; the NAME decides whether it is a
// credential. Credential names contain password/passwd/pwd or end in a `pass` token (STUDENT_PASS,
// TEMP_PASS, studentPass). Review-gate status keys such as ALL_AUTOMATED_CHECKS_PASS, and words like
// `passed` or PASS_AUTOMATED, are not credentials.
const PASSWORD_ASSIGNMENT = /(?<![\w$])([\w$]+)["']?\s*(?:=|:|\?\?)\s*(["'`])([^"'`\s]{6,})\2/g;
const CREDENTIAL_NAME = /password|passwd|pwd|(?:^|_)pass$|[a-z0-9]Pass$/i;
const NON_CREDENTIAL_NAME = /(?:checks?|gates?|tests?)_pass$|bypass$|compass$/i;
const ALLOWED_VALUES = /^(?:env\(|<|\$\{|\[REDACTED|NOT_A_REAL)/;
const PASSWORD_FILL = /\.fill\(\s*(["'`])[^"'`]*pass[^"'`]*\1\s*,\s*(["'`])[^"'`]+\2/gi;
const ENV_PASSWORD_FALLBACK = /process\.env\.[A-Z0-9_]*PASS(?:WORD)?[A-Z0-9_]*\s*(?:\?\?|\|\|)\s*["'`]/g;
const isCredentialName = (name) => CREDENTIAL_NAME.test(name) && !NON_CREDENTIAL_NAME.test(name);
const credentialLiterals = (text) => [...text.matchAll(PASSWORD_ASSIGNMENT)]
  .filter((m) => isCredentialName(m[1]) && !ALLOWED_VALUES.test(m[3])).length;
const countOf = (re, text) => { re.lastIndex = 0; const n = [...text.matchAll(re)].length; re.lastIndex = 0; return n; };

// An artifact may only be a golden PNG. Anything else — a directory, a report, a trace, a video, an
// archive, a test-results folder — can carry a credential typed by a test.
const SAFE_ARTIFACT_PATH = /^[\w./*-]+\*?\.png$/;
function artifactFindings(yaml) {
  const findings = [];
  for (const [, block] of yaml.matchAll(/- uses: actions\/upload-artifact@[^\n]*\n((?:[ \t]+[^\n]*\n|\n(?=[ \t]))+)/g)) {
    const paths = [];
    const single = block.match(/^\s*path:\s*(?!\|)(\S.*)$/m);
    if (single) paths.push(single[1].trim());
    const multi = block.match(/^\s*path:\s*[|>]?-?\s*\n((?:\s*-?\s*\S+\s*\n)+)/m);
    if (multi) for (const line of multi[1].split("\n")) {
      const value = line.replace(/^\s*-?\s*/, "").trim();
      if (value) paths.push(value);
    }
    if (paths.length === 0) findings.push("upload-artifact without an explicit path");
    for (const path of paths) if (!SAFE_ARTIFACT_PATH.test(path)) findings.push(`uploads ${path}`);
  }
  return findings;
}

function workflowSecretFindings(yaml) {
  const findings = [];
  if (/^on:[\s\S]*?pull_request_target/m.test(yaml)) findings.push("pull_request_target");
  if (/secrets:\s*inherit/.test(yaml)) findings.push("secrets: inherit");
  for (const [, name, value] of yaml.matchAll(/^\s+([A-Z0-9_]*(?:PASSWORD|KEY|TOKEN|SECRET))\s*:\s*(.+)$/gm)) {
    if (!/\$\{\{\s*(?:secrets|vars|env|inputs)\./.test(value)) findings.push(`${name} is not read from secrets`);
  }
  return findings;
}

// ── 1. no privileged keys in the working tree ───────────────────────────────────────────────────

test("no file contains a service_role JWT, a secret API key or an access token", () => {
  const offenders = [];
  for (const file of textFiles()) {
    for (const kind of privilegedKeyFindings(readFileSync(join(REPO, file), "latin1"))) offenders.push(`${file}: ${kind}`);
  }
  assert.deepEqual(offenders, [], "privileged credentials must come from the environment, never from a file");
});

test("negative control: the key matcher fires on each privileged key shape", () => {
  const part = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const jwt = (role) => `${part({ alg: "HS256", typ: "JWT" })}.${part({ role, ref: "example" })}.${"s1gnature".repeat(3)}`;
  assert.deepEqual(privilegedKeyFindings(`const k = "${jwt("service_role")}";`), ["service_role JWT"]);
  assert.deepEqual(privilegedKeyFindings(`const k = "${jwt("anon")}";`), [], "the public anon key is not a finding");
  assert.deepEqual(privilegedKeyFindings(`key=${["sb", "secret", "AbCdEf0123456789xyz"].join("_")}`), ["sb_secret_ key"]);
  assert.deepEqual(privilegedKeyFindings(`token=sbp_${"a1b2c3d4e5".repeat(4)}`), ["Supabase personal access token"]);
  assert.deepEqual(privilegedKeyFindings(`token=ghp_${"A1b2C3d4E5".repeat(3)}`), ["GitHub token"]);
});

test("no .env file other than .env.example is tracked or unignored", () => {
  assert.deepEqual(repoFiles().filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith(".env.example")), []);
});

// ── 2. no literal passwords in source ───────────────────────────────────────────────────────────

test("no source file assigns a literal to a credential name", () => {
  const offenders = [];
  for (const file of textFiles()) {
    if (file.endsWith(".json")) continue; // lockfiles and fixtures: covered by the key scan above
    if (credentialLiterals(readFileSync(join(REPO, file), "utf8")) > 0) {
      offenders.push(`${file}: literal assigned to a credential name`);
    }
  }
  assert.deepEqual(offenders, [], "read passwords through tests/test-credentials.mjs or derive them, never write them");
});

test("no spec fills a password field with a literal, and no password env var has a fallback", () => {
  const offenders = [];
  for (const file of textFiles().filter((f) => /\.(m?[jt]s)$/.test(f))) {
    const text = readFileSync(join(REPO, file), "utf8");
    if (countOf(PASSWORD_FILL, text) > 0) offenders.push(`${file}: password field filled with a literal`);
    if (countOf(ENV_PASSWORD_FALLBACK, text) > 0) offenders.push(`${file}: password environment variable with a fallback`);
  }
  assert.deepEqual(offenders, []);
});

test("negative control: the literal matchers fire on the forms the original leaks took", () => {
  const q = '"';
  const value = ["Leak", "Shape", "2026", "x"].join("");
  assert.equal(credentialLiterals(`export const TEACHER_PASSWORD = process.env.TEST_TEACHER_PASSWORD ?? ${q}${value}${q};`), 1);
  assert.equal(credentialLiterals(`createUser({ email: e, password: ${q}${value}${q} })`), 1);
  assert.equal(credentialLiterals(`const TEMP_PASS = '${value}';`), 1);
  assert.equal(credentialLiterals(`const STUDENT2_ORIGINAL_PASS = ${q}${value}${q};`), 1);
  assert.equal(credentialLiterals(`const studentPass = ${q}${value}${q};`), 1);
  assert.equal(credentialLiterals(`ALL_AUTOMATED_CHECKS_PASS: ${q}${value}${q}, passed: ${q}${value}${q}, PASS_AUTOMATED: ${q}${value}${q}`), 0);
  assert.equal(credentialLiterals(`pass = ${q}env(SMTP_PASS)${q}`), 0);
  assert.equal(countOf(ENV_PASSWORD_FALLBACK, `process.env.TEST_TEACHER_PASSWORD ?? ${q}${value}${q}`), 1);
  assert.equal(countOf(PASSWORD_FILL, `await page.fill(${q}#password${q}, ${q}${value}${q});`), 1);
  assert.equal(countOf(PASSWORD_FILL, `await page.fill(${q}#password${q}, TEACHER_PASSWORD);`), 0);
});

// ── 3. the credential module fails closed and stays quiet ───────────────────────────────────────

test("readRequiredSecret and missingSecrets reject missing and blank values", () => {
  assert.throws(() => readRequiredSecret("X_TEST_SECRET", {}), /X_TEST_SECRET is missing or empty/);
  assert.throws(() => readRequiredSecret("X_TEST_SECRET", { X_TEST_SECRET: "  " }), /missing or empty/);
  assert.equal(readRequiredSecret("X_TEST_SECRET", { X_TEST_SECRET: "value-1234" }), "value-1234");
  const env = Object.fromEntries(REQUIRED_E2E_SECRETS.map((n) => [n, "set-value-123"]));
  assert.deepEqual(missingSecrets(REQUIRED_E2E_SECRETS, env), []);
  delete env.TEST_TEACHER_PASSWORD;
  env.TEST_STUDENT2_PASSWORD = "";
  assert.deepEqual(missingSecrets(REQUIRED_E2E_SECRETS, env), ["TEST_TEACHER_PASSWORD", "TEST_STUDENT2_PASSWORD"]);
  for (const name of ["TEST_STUDENT_PASSWORD", "TEST_TEACHER_PASSWORD", "TEST_STUDENT2_PASSWORD"]) {
    assert.ok(REQUIRED_E2E_SECRETS.includes(name), `${name} must be required`);
  }
});

test("the credential module never logs or reveals a value", () => {
  const source = read("tests/test-credentials.mjs");
  assert.ok(!/console\.|process\.stdout|process\.stderr/.test(source), "the module must not write anything out");
  const secret = ["Very", "Secret", "Value", "42"].join("-");
  const env = Object.fromEntries(REQUIRED_E2E_SECRETS.map((n) => [n, secret]));
  const messages = [];
  try { readRequiredSecret("X_TEST_SECRET", { X_TEST_SECRET: "" }); } catch (err) { messages.push(err.message); }
  try { derivePassword("", "label"); } catch (err) { messages.push(err.message); }
  try { derivedPassword("NOT_A_DERIVED_NAME", env); } catch (err) { messages.push(err.message); }
  assert.equal(messages.length, 3);
  for (const message of messages) {
    assert.equal(message.includes(secret), false, "an error message must not contain a credential value");
    assert.equal(message.includes(derivePassword(secret, "password-reset:temp")), false);
  }
});

test("derived passwords are deterministic, never equal their base, and satisfy password policy", () => {
  const base = ["base", "secret", "for", "test"].join("-");
  const a = derivePassword(base, "label-a");
  assert.equal(derivePassword(base, "label-a"), a, "same secret and label must give the same value");
  assert.notEqual(derivePassword(base, "label-b"), a);
  assert.notEqual(derivePassword(`${base}x`, "label-a"), a);
  assert.throws(() => derivePassword("", "label"), /base secret/);
  assert.throws(() => derivePassword(base, ""), /label/);

  // Supabase enforces a minimum length (6 by default) and optionally required character classes;
  // 28 characters covering all four classes satisfies every setting the dashboard offers.
  for (const label of ["a", "b", "password-reset:temp", "x".repeat(200)]) {
    const derived = derivePassword(base, label);
    assert.ok(derived.length >= 28, "derived passwords must be long enough for any minimum-length setting");
    assert.ok(/[A-Z]/.test(derived) && /[a-z]/.test(derived) && /\d/.test(derived) && /[^A-Za-z0-9]/.test(derived));
    assert.notEqual(derived, base, "a derived password must never equal the base secret");
    assert.equal(derived.includes(base), false, "a derived password must not contain the base secret");
  }
  // The base cannot collide with a derived value either: the derivation is a 24-character HMAC with
  // a fixed 4-character suffix, so equality would require the secret to be its own HMAC.
  const env = Object.fromEntries(REQUIRED_E2E_SECRETS.map((n) => [n, `${n}-value-123`]));
  const derived = Object.keys(DERIVED_PASSWORDS).map((n) => derivedPassword(n, env));
  assert.equal(new Set(derived).size, derived.length, "each derived password must be distinct");
  for (const value of Object.values(env)) assert.equal(derived.includes(value), false);
});

test("global-setup checks every secret before it can reach Supabase, and specs read through the module", () => {
  const setup = read("tests/global-setup.ts");
  const guard = setup.indexOf("missingSecrets()");
  const client = setup.indexOf("createClient(SUPABASE_URL");
  assert.ok(guard !== -1 && client !== -1, "both the guard and the client creation must exist");
  assert.ok(guard < client, "missingSecrets() must run before the Supabase client is created");
  for (const call of ["auth.admin.createUser", "auth.admin.updateUserById", ".upsert(", ".update(", ".delete("]) {
    const at = setup.indexOf(call, client);
    if (at !== -1) assert.ok(guard < at, `missingSecrets() must run before the first ${call}`);
  }
  assert.match(setup, /readRequiredSecret\("TEST_TEACHER_PASSWORD"\)/);
  assert.match(setup, /readRequiredSecret\("TEST_STUDENT2_PASSWORD"\)/);

  const helpers = read("tests/helpers.ts");
  assert.match(helpers, /TEACHER_PASSWORD\s*=\s*readRequiredSecret\("TEST_TEACHER_PASSWORD"\)/);
  assert.match(helpers, /STUDENT2_PASSWORD\s*=\s*readRequiredSecret\("TEST_STUDENT2_PASSWORD"\)/);
  assert.match(read("tests/password-reset.spec.ts"), /TEMP_PASS\s*=\s*STUDENT_TEMP_PASSWORD/);
  const reset = read("tests/teacher-password-reset.spec.ts");
  assert.match(reset, /STUDENT2_ORIGINAL_PASS\s*=\s*STUDENT2_PASSWORD/);
  assert.match(reset, /FRESH_TEMP\s*=\s*STUDENT2_FRESH_TEMP_PASSWORD/);
  assert.match(reset, /NEW_PASS\s*=\s*STUDENT2_NEW_PASSWORD/);
});

// ── 4. workflows ────────────────────────────────────────────────────────────────────────────────

test("no workflow can upload an artifact that could carry a credential", () => {
  const offenders = [];
  for (const file of workflowFiles()) {
    for (const finding of artifactFindings(read(file))) offenders.push(`${file}: ${finding}`);
  }
  assert.deepEqual(offenders, [],
    "reports, traces, videos, archives and whole directories record typed passwords; only golden PNGs may be published");
});

test("negative control: the artifact matcher fires on every unsafe artifact shape", () => {
  const upload = (body) => `      - uses: actions/upload-artifact@v4\n        with:\n${body}`;
  for (const path of ["playwright-report/", "test-results/", "report.html", "trace.zip", "video.webm", ".", "playwright-report/index.html"]) {
    assert.equal(artifactFindings(upload(`          name: x\n          path: ${path}\n`)).length, 1, `must flag ${path}`);
  }
  assert.deepEqual(artifactFindings(upload("          name: x\n          path: |\n            playwright-report/\n            test-results/\n")).length, 2);
  assert.deepEqual(artifactFindings(upload("          name: x\n          path: tests/**/*-chromium-linux.png\n")), []);
  assert.deepEqual(artifactFindings(upload("          name: x\n")), ["upload-artifact without an explicit path"]);
});

test("the golden-regeneration workflow uploads golden images only", () => {
  const paths = [...read(".github/workflows/update-avatar-goldens.yml").matchAll(/^\s+path:\s*(.+)$/gm)].map((m) => m[1].trim());
  assert.deepEqual(paths, ["tests/**/*-chromium-linux.png"]);
});

test("both E2E workflows pass the required test-account secrets from GitHub Secrets", () => {
  for (const wf of [".github/workflows/playwright.yml", ".github/workflows/update-avatar-goldens.yml"]) {
    const text = read(wf);
    for (const name of ["TEST_STUDENT_EMAIL", "TEST_STUDENT_PASSWORD", "TEST_TEACHER_PASSWORD", "TEST_STUDENT2_PASSWORD", "SUPABASE_SERVICE_ROLE_KEY"]) {
      assert.match(text, new RegExp(`${name}:\\s*\\$\\{\\{\\s*secrets\\.${name}\\s*\\}\\}`), `${wf} must pass ${name} from secrets`);
    }
  }
});

test("no workflow runs on pull_request_target, inherits secrets or hardcodes a credential", () => {
  const offenders = [];
  for (const file of workflowFiles()) {
    for (const finding of workflowSecretFindings(read(file))) offenders.push(`${file}: ${finding}`);
  }
  assert.deepEqual(offenders, []);
});

test("negative control: the workflow matcher fires on unsafe trigger and env shapes", () => {
  assert.deepEqual(workflowSecretFindings("on:\n  pull_request_target:\n    branches: [main]\n"), ["pull_request_target"]);
  assert.deepEqual(workflowSecretFindings("jobs:\n  x:\n    secrets: inherit\n"), ["secrets: inherit"]);
  assert.deepEqual(workflowSecretFindings("    env:\n      TEST_TEACHER_PASSWORD: literal-value-123\n"),
    ["TEST_TEACHER_PASSWORD is not read from secrets"]);
  assert.deepEqual(workflowSecretFindings("    env:\n      TEST_TEACHER_PASSWORD: ${{ secrets.TEST_TEACHER_PASSWORD }}\n"), []);
});

// A fork PR gets no secrets from GitHub, so every credential resolves to an empty string. The suite
// must then stop in global-setup — before the Supabase client exists — rather than run against
// production with half a configuration. The `pull_request` trigger (never `pull_request_target`)
// is what keeps fork code out of a secret-bearing context in the first place.
test("a fork pull request cannot reach secrets and fails before any data is touched", () => {
  const wf = read(".github/workflows/playwright.yml");
  assert.match(wf, /^on:\n(?:.*\n)*?\s+pull_request:/m, "the workflow must use the pull_request trigger");
  assert.deepEqual(workflowSecretFindings(wf).filter((f) => f === "pull_request_target" || f === "secrets: inherit"), []);
  const env = Object.fromEntries(REQUIRED_E2E_SECRETS.map((n) => [n, ""])); // what a fork run sees
  assert.deepEqual(missingSecrets(REQUIRED_E2E_SECRETS, env), [...REQUIRED_E2E_SECRETS],
    "with empty secrets every required value must be reported missing, so global-setup throws");
  const setup = read("tests/global-setup.ts");
  assert.ok(setup.indexOf("missingSecrets()") < setup.indexOf("createClient(SUPABASE_URL"));
});
