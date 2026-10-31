// PROOF THAT E2E WRITES STAY INSIDE THE RUN'S ACCOUNT SLOT.
//
// E2E slots (tests/e2e-slot.mjs) let runs in different slots execute in parallel. That is only safe
// if nothing a run writes can reach another slot's data or shared, non-user state. This file audits
// every Playwright-side source (tests/*.ts, tests/*.mjs, tests/support/*) statically:
//
//   A. every table write targets a reviewed per-user table, and is keyed by a slot account id:
//      update/delete filter on id/student_id/user_id = a slot id; insert/upsert rows carry one;
//      the only exceptions are the reviewed anonymous inserts that must be REJECTED by RLS;
//   B. every slot id is resolved from a TEST_*_EMAIL address (which playwright.config.ts rewrites
//      per slot) — by admin lookup or by signing in as that account;
//   C. no spec contains a deliverable address of its own: literal addresses are mocks only;
//   D. every Edge Function / RPC a spec calls directly is a reviewed endpoint that acts on the
//      caller's own account (JWT) or on an account id from (A);
//   E. specs never create, delete or invite auth users, and change passwords only of slot ids.
//
// A NEW WRITE THAT FAILS THIS AUDIT IS NOT A TEST TO LOOSEN. Either key it to a slot account, or —
// if it genuinely must change global state — it cannot run in parallel: give it its own serialised
// group first. At the time of writing no spec writes global state, so no such group exists.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const TESTS = new URL("../", import.meta.url);
const sources = [];
for (const name of readdirSync(TESTS).filter((n) => n.endsWith(".ts") || n.endsWith(".mjs")).sort()) {
  sources.push({ file: "tests/" + name, src: readFileSync(new URL(name, TESTS), "utf8") });
}
for (const name of readdirSync(new URL("support/", TESTS)).filter((n) => n.endsWith(".ts") || n.endsWith(".mjs")).sort()) {
  sources.push({ file: "tests/support/" + name, src: readFileSync(new URL("support/" + name, TESTS), "utf8") });
}
const specs = sources.filter((s) => s.file.endsWith(".spec.ts"));

// Reviewed per-user tables (every row belongs to one student/teacher account).
const PER_USER_TABLES = Object.freeze([
  "profiles", "question_instances", "daily_login_rewards", "user_items", "student_progress",
  "student_quest_progress", "student_weekly_quest_progress", "user_achievements", "password_help_requests",
]);
// Inserts that exist to prove RLS REJECTS them (anonymous client, all-zero ids).
const ANON_REJECTED = Object.freeze([
  "tests/rls-dormant-tables.spec.ts student_answers",
  "tests/rls-dormant-tables.spec.ts question_attempt_audit",
]);
// Identifiers that hold a slot account id. `id` is password-help.spec.ts's helper parameter, only
// ever called with `studentId` (asserted below).
const SLOT_ID_EXPRS = Object.freeze(["studentId", "student2Id", "teacherId", "user.id", "id", "slotOwnerTeacherId", "ownerId"]);
const KEY_COLUMNS = Object.freeze(["id", "student_id", "user_id"]);

// The statement starting at `start`: up to the first `;` outside (), [], {} and strings.
function statementAt(src, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") { depth--; if (depth < 0) return src.slice(start, i); }
    else if (c === ";" && depth === 0) return src.slice(start, i);
  }
  return src.slice(start);
}
const squash = (s) => s.split("\n").map((l) => l.trim()).join(" ");
const lineOf = (src, i) => src.slice(0, i).split("\n").length;

function tableWrites() {
  const out = [];
  for (const { file, src } of sources) {
    let at = src.indexOf(".from(");
    while (at !== -1) {
      const stmt = squash(statementAt(src, at));
      const tableMatch = stmt.match(/^\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/);
      const op = (stmt.match(/\.(insert|update|upsert|delete)\(/) || [])[1];
      if (tableMatch && op) out.push({ file, line: lineOf(src, at), table: tableMatch[1], op, stmt });
      at = src.indexOf(".from(", at + 6);
    }
  }
  return out;
}

test("the audit sees the writes it is meant to see (negative control)", () => {
  const writes = tableWrites();
  assert.ok(writes.length >= 80, "expected the known E2E write sites, found " + writes.length);
  for (const t of ["profiles", "question_instances", "user_items", "password_help_requests"]) {
    assert.ok(writes.some((w) => w.table === t), t);
  }
  assert.equal(squash(statementAt('x.from("a").update({ b: "c;d" }).eq("id", studentId); next', 1)),
    '.from("a").update({ b: "c;d" }).eq("id", studentId)');
});

test("A. every table write is a reviewed per-user table keyed by a slot account id", () => {
  const offenders = [];
  for (const w of tableWrites()) {
    const where = `${w.file}:${w.line} ${w.table}.${w.op}`;
    if (ANON_REJECTED.includes(`${w.file} ${w.table}`)) {
      if (w.op !== "insert") offenders.push(where + " — anon case must stay an insert");
      continue;
    }
    if (!PER_USER_TABLES.includes(w.table)) { offenders.push(where + " — table is not a reviewed per-user table"); continue; }
    if (w.op === "update" || w.op === "delete") {
      const filters = [...w.stmt.matchAll(/\.(eq|in)\(\s*["'`]([a-z_]+)["'`]\s*,\s*([A-Za-z_][A-Za-z0-9_.!]*)\s*\)/g)];
      const keyed = filters.some((m) => KEY_COLUMNS.includes(m[2]) && SLOT_ID_EXPRS.includes(m[3]));
      if (!keyed) offenders.push(where + " — no id/student_id/user_id filter on a slot id: " + w.stmt.slice(0, 140));
    } else {
      // The row literal, or — for `.insert(name)` — the `const name = …` statement that builds it.
      let rowText = w.stmt;
      const byName = w.stmt.match(/\.(?:insert|upsert)\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*[,)]/);
      if (byName) {
        const src = sources.find((s) => s.file === w.file).src;
        const def = src.indexOf("const " + byName[1] + " =");
        rowText = def === -1 ? "" : squash(statementAt(src, def));
      }
      const fields = [...rowText.matchAll(/\b(id|student_id|user_id)\s*:\s*([A-Za-z_][A-Za-z0-9_.!]*)/g)];
      const keyed = fields.some((m) => SLOT_ID_EXPRS.includes(m[2]));
      if (!keyed) offenders.push(where + " — row is not keyed to a slot id: " + w.stmt.slice(0, 140));
    }
  }
  assert.deepEqual(offenders, []);
});

test("A. the anonymous inserts really are anonymous and use non-existent ids", () => {
  const src = specs.find((s) => s.file === "tests/rls-dormant-tables.spec.ts").src;
  assert.ok(src.includes('anonClient.from("student_answers").insert('));
  assert.ok(src.includes('anonClient.from("question_attempt_audit").insert('));
  assert.ok(src.includes('expect(saError, "anon INSERT on student_answers must be rejected").not.toBeNull();'));
  assert.ok(src.includes('expect(qaError, "anon INSERT on question_attempt_audit must be rejected").not.toBeNull();'));
});

test("A. password-help's `id` helper parameter is only ever given the slot student", () => {
  const src = specs.find((s) => s.file === "tests/password-help.spec.ts").src;
  for (const fn of ["clearRowsForStudent", "seedCooldown", "restoreOriginal", "captureOriginal"]) {
    for (const m of src.matchAll(new RegExp("(?<!function |async function )\\b" + fn + "\\(([^,)]+)", "g"))) {
      assert.equal(m[1].trim(), "studentId", `${fn}(${m[1]})`);
    }
  }
});

// ── B. Provenance of slot ids ─────────────────────────────────────────────────────────────────
const ID_SOURCES = Object.freeze(["student.id", "session.user!.id", "s.id", "user.id", "s2.id", "teacher.id", "student2.id", "mainStudent.id"]);

test("B. every slot id in a spec is resolved from a TEST_*_EMAIL account", () => {
  const offenders = [];
  let assignments = 0;
  for (const { file, src } of specs) {
    for (const m of src.matchAll(/\b(studentId|student2Id|teacherId|mainStudentId)\s*=\s*([^;\n]+)/g)) {
      assignments++;
      const rhs = m[2].trim();
      if (!ID_SOURCES.includes(rhs)) offenders.push(`${file}:${lineOf(src, m.index)} ${m[1]} = ${rhs}`);
    }
    if (/\b(studentId|student2Id|teacherId)\s*=/.test(src)) {
      const resolves = /findAuthUserByEmail\(\s*\w+\s*,\s*[A-Z0-9_]*EMAIL\s*\)/.test(src)
        || /signInWithPassword\(\{\s*email:\s*[A-Z0-9_]*EMAIL\b/.test(squash(src))
        || /listUsers\(/.test(src) && /[A-Z0-9_]*EMAIL\b/.test(src);
      if (!resolves) offenders.push(file + " assigns a slot id without resolving a TEST_*_EMAIL account");
    }
  }
  assert.deepEqual(offenders, []);
  assert.ok(assignments >= 20, "negative control: expected the known slot-id assignments, found " + assignments);
});

test("B. specs read account addresses only from TEST_*_EMAIL or tests/helpers.ts", () => {
  const offenders = [];
  for (const { file, src } of specs) {
    for (const m of src.matchAll(/process\.env\.([A-Z0-9_]*EMAIL[A-Z0-9_]*)/g)) {
      if (!["TEST_STUDENT_EMAIL", "TEST_TEACHER_EMAIL", "TEST_STUDENT2_EMAIL"].includes(m[1])) offenders.push(file + " " + m[1]);
    }
  }
  assert.deepEqual(offenders, []);
});

// ── C. No deliverable literal addresses in specs ──────────────────────────────────────────────
// Mocks only: .invalid is undeliverable by RFC 2606; the others appear only in specs that fake or
// abort every Supabase request.
const MOCK_ADDRESS_DOMAINS = Object.freeze(["e.com", "skole.dk", "eksempel-skole.dk", "example.invalid"]);

test("C. literal e-mail addresses in specs are mocks only", () => {
  const offenders = [];
  for (const { file, src } of specs) {
    for (const m of src.matchAll(/["'`]([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]+)["'`]/g)) {
      if (!MOCK_ADDRESS_DOMAINS.includes(m[2].toLowerCase())) offenders.push(`${file}:${lineOf(src, m.index)} ${m[1]}@${m[2]}`);
    }
  }
  assert.deepEqual(offenders, []);
});

// ── D. Endpoints ──────────────────────────────────────────────────────────────────────────────
// Each acts on the caller's own account (JWT) or on an account id it is given; set_student_domains
// and reset-student-password additionally require the teacher to own the pupil.
const USER_SCOPED_ENDPOINTS = Object.freeze([
  "fn:get-next-question", "fn:process-event", "fn:request-password-help", "fn:reset-student-password",
  "rpc:equip_item", "rpc:set_avatar_identity", "rpc:set_student_domains",
]);

test("D. every Edge Function / RPC a spec calls directly is a reviewed user-scoped endpoint", () => {
  const offenders = [];
  const seen = new Set();
  for (const { file, src } of specs) {
    const flat = squash(src);
    const calls = [
      ...[...flat.matchAll(/functions\/v1\/([a-z0-9-]+)/g)].map((m) => "fn:" + m[1]),
      ...[...flat.matchAll(/functions\.invoke\(\s*["'`]([a-z0-9-]+)["'`]/g)].map((m) => "fn:" + m[1]),
      ...[...flat.matchAll(/\.rpc\(\s*["'`]([a-z_0-9]+)["'`]/g)].map((m) => "rpc:" + m[1]),
    ];
    for (const c of calls) {
      seen.add(c);
      if (!USER_SCOPED_ENDPOINTS.includes(c)) offenders.push(file + " " + c);
    }
  }
  assert.deepEqual(offenders, []);
  assert.deepEqual([...seen].sort(), [...USER_SCOPED_ENDPOINTS].sort(), "negative control: every reviewed endpoint is still found");
});

// ── E. Auth admin ─────────────────────────────────────────────────────────────────────────────
test("E. specs never create/delete/invite users and change passwords only on slot ids", () => {
  const offenders = [];
  let passwordWrites = 0;
  for (const { file, src } of specs) {
    const flat = squash(src);
    for (const m of flat.matchAll(/auth\.admin\.([a-zA-Z]+)\(\s*([^,)]*)/g)) {
      const [, method, firstArg] = m;
      if (method === "listUsers" || method === "getUserById") continue;
      if (method === "updateUserById") passwordWrites++;
      if (method === "updateUserById" && ["studentId", "student2Id", "teacherId"].includes(firstArg.trim())) continue;
      offenders.push(`${file} auth.admin.${method}(${firstArg.trim()})`);
    }
  }
  assert.deepEqual(offenders, []);
  assert.ok(passwordWrites >= 5, "negative control: expected the known password restores, found " + passwordWrites);
});
