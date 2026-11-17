// A1/A2/A3/A5 — the static contract that keeps every Playwright-side source on the safe path.
//
// The guard (tests/e2e-guard.mjs) and the verification (tests/e2e-accounts.mjs) only protect what
// goes through them. This file proves, over every source the Playwright suite loads (tests/*.ts,
// tests/*.mjs, tests/support/*), that nothing goes around them:
//
//   1. the service-role key is read in exactly one place, tests/e2e-admin.mjs (plus the list of
//      required secret NAMES in tests/test-credentials.mjs) — no spec can build its own raw client;
//   2. E2E_VERIFIED_ACCOUNTS is written only by tests/e2e-accounts.mjs (publishVerified) — no spec
//      can hand the guard a record of its own (and the guard re-verifies before its first write);
//   3. no source the suite loads can create, delete or invite a user: the only createUser call in
//      tests/ is the isolated seed, which only the isolated runner imports;
//   4. no hard-coded Hotmail address or fallback address remains;
//   5. every service-role write in a spec or in global-setup is an owner-keyed write the guard
//      accepts (owner column of a reviewed table, only the chain methods the guard replays);
//   6. global-setup verifies before it writes, and resets only through the guarded client.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { OWNER_COLUMN, WRITE_CHAIN, INSERT_CHAIN, UPDATE_ONLY_TABLES } from "../e2e-guard.mjs";

const TESTS = new URL("../", import.meta.url);
const ROOT = new URL("../../", import.meta.url);
const sources = [];
for (const name of readdirSync(TESTS).filter((n) => n.endsWith(".ts") || n.endsWith(".mjs")).sort()) {
  sources.push({ file: "tests/" + name, src: readFileSync(new URL(name, TESTS), "utf8") });
}
for (const name of readdirSync(new URL("support/", TESTS)).filter((n) => n.endsWith(".ts") || n.endsWith(".mjs")).sort()) {
  sources.push({ file: "tests/support/" + name, src: readFileSync(new URL("support/" + name, TESTS), "utf8") });
}
const specs = sources.filter((s) => s.file.endsWith(".spec.ts"));
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");
// Code without // line comments and /* */ block comments (string contents are kept).
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/(^|[^:"'`])\/\/.*$/, "$1")).join("\n");

test("negative control: the scan sees the suite", () => {
  assert.ok(specs.length >= 60, "specs: " + specs.length);
  for (const f of ["tests/global-setup.ts", "tests/helpers.ts", "tests/e2e-admin.mjs", "tests/e2e-guard.mjs", "tests/e2e-accounts.mjs", "tests/e2e-slot.mjs"]) {
    assert.ok(sources.some((s) => s.file === f), f);
  }
});

test("1. the service-role key is read only by tests/e2e-admin.mjs", () => {
  const offenders = sources
    .filter((s) => /SUPABASE_SERVICE_ROLE_KEY|service_role_key|SERVICE_KEY/i.test(code(s.src)))
    .map((s) => s.file)
    .filter((f) => !["tests/e2e-admin.mjs", "tests/test-credentials.mjs", "tests/offline-specs.mjs"].includes(f));
  assert.deepEqual(offenders, []);
  // offline-specs only names it to STRIP it from an offline run's environment.
  const offline = code(read("tests/offline-specs.mjs"));
  assert.equal(offline.split("SUPABASE_SERVICE_ROLE_KEY").length - 1, 1);
  assert.ok(offline.includes('if (name === "SUPABASE_SERVICE_ROLE_KEY") return true;'));
  const admin = read("tests/e2e-admin.mjs");
  assert.equal(admin.split('readRequiredSecret("SUPABASE_SERVICE_ROLE_KEY", env)').length - 1, 1, "read once, required (no default)");
  // test-credentials only NAMES it in the list of required secrets.
  const cred = code(read("tests/test-credentials.mjs"));
  assert.equal(cred.split("SUPABASE_SERVICE_ROLE_KEY").length - 1, 1);
  assert.match(cred, /REQUIRED_E2E_SECRETS = Object\.freeze\(\[[\s\S]*"SUPABASE_SERVICE_ROLE_KEY",/);
});

test("1. every spec that needs the service role takes the guarded client from tests/e2e-admin.mjs", () => {
  let users = 0;
  for (const { file, src } of specs) {
    const c = code(src);
    if (!/createE2EAdminClient/.test(c)) continue;
    users++;
    assert.match(c, /import \{ createE2EAdminClient \} from ["']\.\/e2e-admin\.mjs["'];/, file);
    // No arguments: a spec can neither pass another environment nor substitute the client.
    for (const m of c.matchAll(/createE2EAdminClient\(([^)]*)\)/g)) assert.equal(m[1].trim(), "", file + ": createE2EAdminClient(" + m[1] + ")");
    assert.doesNotMatch(c, /verifyAndOpenAdmin|guardAdminClient|rawServiceClient/, file + " reaches past the guarded entry point");
  }
  assert.equal(users, 23, "the 23 specs that used a raw service-role client");
  for (const { file, src } of sources) {
    if (file === "tests/e2e-admin.mjs" || file === "tests/global-setup.ts") continue;
    assert.doesNotMatch(code(src), /verifyAndOpenAdmin/, file + ": only global-setup verifies-and-opens");
  }
});

test("2. E2E_VERIFIED_ACCOUNTS is written only by publishVerified()", () => {
  for (const { file, src } of sources) {
    const c = code(src);
    if (file === "tests/e2e-accounts.mjs") continue;
    // Any use as an environment key (read or write) — the name inside an error text is not one.
    assert.doesNotMatch(c, /\.E2E_VERIFIED_ACCOUNTS\b|\[\s*["'`]E2E_VERIFIED_ACCOUNTS["'`]\s*\]|\bVERIFIED_ENV\b/, file);
  }
  const accounts = code(read("tests/e2e-accounts.mjs"));
  assert.equal(accounts.split("env[VERIFIED_ENV] =").length - 1, 1, "one write, in publishVerified");
  // Only e2e-admin's verifyAndOpenAdmin publishes, right after a successful verification.
  const users = sources.filter((s) => s.file !== "tests/e2e-accounts.mjs" && /\bpublishVerified\(/.test(code(s.src))).map((s) => s.file);
  assert.deepEqual(users, ["tests/e2e-admin.mjs"]);
  assert.match(code(read("tests/e2e-admin.mjs")), /const verified = await verifyAccounts\(registry, readDeps\(raw\)\);[^\n]*\n\s*publishVerified\(env, verified\);/);
});

test("2. the spec client re-verifies before its first write and compares the ids", () => {
  const c = code(read("tests/e2e-admin.mjs"));
  const fn = c.slice(c.indexOf("export function createE2EAdminClient"));
  assert.match(fn, /const verified = readVerified\(env\);/);
  assert.match(fn, /const fresh = await verifyAccounts\(registry, readDeps\(raw\)\);/);
  assert.match(fn, /fresh\.ids\[k\] !== verified\.ids\[k\]/);
  assert.match(fn, /return guardAdminClient\(raw, verified, \{ confirm \}\);/);
  // readDeps can only read.
  const deps = c.slice(c.indexOf("function readDeps"), c.indexOf("export async function verifyAndOpenAdmin"));
  assert.doesNotMatch(deps, /\.(insert|update|upsert|delete|createUser|updateUserById|deleteUser|rpc)\(/);
});

test("3. no source the Playwright suite loads can create, delete or invite a user", () => {
  for (const { file, src } of sources) {
    assert.doesNotMatch(code(src), /\.(createUser|deleteUser|inviteUserByEmail|generateLink|signUp)\s*\(/, file);
  }
  // The only createUser in tests/ is the isolated seed, imported only by the isolated runner.
  const seed = read("tests/isolated/seed/primary-account.mjs");
  assert.match(seed, /admin\.auth\.admin\.createUser\(attrs\)/);
  const importers = readdirSync(new URL("tests/isolated/", ROOT)).filter((n) => n.endsWith(".mjs") || n.endsWith(".ts"))
    .filter((n) => read("tests/isolated/" + n).includes("seed/primary-account.mjs"));
  assert.deepEqual(importers.sort(), ["measure-parallel.mjs", "run-suite.mjs"].sort());
  assert.doesNotMatch(code(read("tests/isolated/measure-parallel.mjs")), /provisionPrimaryAccount|import .*primary-account/, "measure-parallel only names it in a comment");
  // run-suite provisions only after the isolation guard and the suite-environment check.
  const rs = code(read("tests/isolated/run-suite.mjs"));
  const iGuard = rs.indexOf("assertIsolated(process.env);");
  const iCheck = rs.indexOf("if (v.length)");
  const iProv = rs.indexOf("await provisionPrimaryAccount(admin,");
  assert.ok(iGuard !== -1 && iCheck > iGuard && iProv > iCheck);
});

test("3. global-setup verifies before any write and never provisions", () => {
  const gs = code(read("tests/global-setup.ts"));
  assert.doesNotMatch(gs, /createClient|@supabase\/supabase-js|e2e-slot\.mjs|upsert\(|\.insert\(|createUser|deleteUser/);
  const main = gs.slice(gs.indexOf("export default async function globalSetup"));
  const steps = ["missingSecrets()", "resolveAccountRegistry(process.env);", "await verifyAndOpenAdmin(process.env);",
    "await checkQuestionPoolHealth(admin);", 'await resetPupil(admin, "primary", verified.ids.primary);',
    'await resetPupil(admin, "student2", verified.ids.student2);', "await admin.auth.admin.updateUserById(verified.ids[kind]"];
  let at = -1;
  for (const s of steps) {
    const i = main.indexOf(s);
    assert.ok(i > at, "order: " + s);
    at = i;
  }
  // The only writes are resetPupil's two and the password restore — all on `admin` (the guarded client).
  assert.equal((gs.match(/\.(update|delete)\(/g) ?? []).length, 2);
  assert.equal((gs.match(/updateUserById\(/g) ?? []).length, 1);
});

test("4. no Hotmail address and no address fallback in any Playwright-side source", () => {
  for (const { file, src } of sources) {
    assert.doesNotMatch(src, /hotmail/i, file);
    assert.doesNotMatch(code(src), /process\.env\.TEST_[A-Z0-9_]*EMAIL\s*(\?\?|\|\|)/, file + ": address with a fallback");
  }
});

// The statement starting at `start`: up to the first `;` outside (), [], {} and strings.
function statementAt(src, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === "\\") { i++; continue; } if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") { depth--; if (depth < 0) return src.slice(start, i); }
    else if (c === ";" && depth === 0) return src.slice(start, i);
  }
  return src.slice(start);
}
// The chain's top-level calls: [name, firstArgText].
function chainCalls(stmt) {
  const out = [];
  let depth = 0;
  let quote = null;
  for (let i = 0; i < stmt.length; i++) {
    const c = stmt[i];
    if (quote) { if (c === "\\") { i++; continue; } if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "." && depth === 0) {
      const m = stmt.slice(i + 1).match(/^\s*([A-Za-z_]\w*)\s*\(\s*(["'`]([a-z_]+)["'`])?/);
      if (m) out.push([m[1], m[3] ?? null]);
    }
  }
  return out;
}
const ADMIN_NAMES = ["adminClient", "adminSupabase", "admin"];

function adminWrites() {
  const out = [];
  for (const { file, src } of sources.filter((s) => s.file.endsWith(".spec.ts") || s.file === "tests/global-setup.ts")) {
    let at = src.indexOf(".from(");
    while (at !== -1) {
      const receiver = (src.slice(Math.max(0, at - 80), at).match(/([A-Za-z_]\w*)\s*$/) ?? [])[1];
      const calls = chainCalls(statementAt(src, at));
      const op = calls.findIndex(([n]) => ["insert", "update", "upsert", "delete"].includes(n));
      if (ADMIN_NAMES.includes(receiver) && op > 0) {
        out.push({ where: `${file}:${src.slice(0, at).split("\n").length}`, table: calls[0][1], op: calls[op][0], after: calls.slice(op + 1) });
      }
      at = src.indexOf(".from(", at + 6);
    }
  }
  return out;
}

test("5. every service-role write is one the guard accepts: reviewed table, owner filter, replayable chain", () => {
  const writes = adminWrites();
  assert.ok(writes.length >= 110, "negative control: the known admin write sites (112 at A3), found " + writes.length);
  const offenders = [];
  for (const w of writes) {
    const owner = OWNER_COLUMN[w.table];
    if (!owner) { offenders.push(`${w.where} ${w.table}: not a reviewed table`); continue; }
    if (w.op !== "update" && UPDATE_ONLY_TABLES.includes(w.table)) offenders.push(`${w.where} ${w.table}.${w.op}: update only`);
    const allowed = w.op === "insert" || w.op === "upsert" ? INSERT_CHAIN : WRITE_CHAIN;
    for (const [name] of w.after) if (!allowed.includes(name)) offenders.push(`${w.where} ${w.table}.${w.op}: .${name}() would be refused`);
    if ((w.op === "update" || w.op === "delete") && !w.after.some(([n, col]) => (n === "eq" || n === "in") && col === owner)) {
      offenders.push(`${w.where} ${w.table}.${w.op}: no filter on the owner column ${owner}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("5. the guarded write shapes cover every reviewed table the suite writes", () => {
  const tables = new Set(adminWrites().map((w) => w.table));
  for (const t of tables) assert.ok(Object.prototype.hasOwnProperty.call(OWNER_COLUMN, t), t);
  for (const t of ["profiles", "question_instances", "user_items", "password_help_requests", "student_quest_progress"]) assert.ok(tables.has(t), t);
});

test("A5: negative RLS checks pin the privilege error, role escalation is restored, password specs restore before and after", () => {
  const rls = read("tests/rls-dormant-tables.spec.ts");
  assert.equal(rls.split('.toBe("42501")').length - 1, 4);
  const prof = read("tests/profiles-rls.spec.ts");
  assert.match(prof, /role:\s+'student',/);
  assert.match(prof, /for \(const target of \['teacher', 'super_admin'\]\)/);
  assert.match(prof, /\} finally \{\s*\/\/[^\n]*\n[^\n]*\n\s*await restoreBaseline\(\);/);
  assert.match(prof, /if \(error\) throw new Error\(`profiles-rls: restore failed/);
  const pr = read("tests/password-reset.spec.ts");
  assert.ok(pr.indexOf("await restoreStudentPassword();") < pr.indexOf("test.afterAll("), "restored in beforeAll too");
  assert.match(pr, /if \(error\) throw new Error\(`password-reset: password restore failed/);
  const tpr = read("tests/teacher-password-reset.spec.ts");
  assert.match(tpr, /if \(!wasRejected\) \{[\s\S]*?mainStudentTouched = true;\s*await restoreMainStudent\(\);/);
  assert.match(tpr, /if \(mainStudentTouched && mainStudentId\) \{/);
  assert.match(tpr, /if \(failures\.length > 0\) throw new Error/);
  // No unchecked admin password write remains in the password specs.
  for (const src of [pr, tpr]) {
    for (const m of src.matchAll(/^\s*await adminClient\.auth\.admin\.updateUserById\(/gm)) assert.fail("unchecked password write at offset " + m.index);
  }
});
