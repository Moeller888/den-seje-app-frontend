// FUNCTIONAL coverage of the create-student HTTP contract.
//
// The real production handler factory (supabase/functions/create-student/handler.ts) is invoked
// with fakes, given real Request objects, and the real Response objects are inspected. No serve(),
// no Supabase client, no network: global fetch is a throwing counter. Nothing here touches the
// production project.
//
// What this pins down:
//   - only a teacher may create a pupil (401 without a valid token, 403 for every other role,
//     500 — never 403 or success — when the role read itself fails)
//   - the profile is written with role 'student', the CALLER as teacher_id, and
//     must_reset_password = true, so the first password really is temporary
//   - a failed profile write deletes the auth user again; a failed delete is reported distinctly
//   - no response ever carries the password or the provider's error text

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  createHandler,
  CORS_HEADERS,
  MIN_PASSWORD_LENGTH,
} from "../../supabase/functions/create-student/handler.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

const TEACHER_ID = "11111111-1111-4111-8111-111111111111";
const NEW_ID     = "22222222-2222-4222-8222-222222222222";
// A throwaway value for fakes, derived per run — never written into the source
// (tests/unit/credential-hygiene.test.mjs).
const PASSWORD   = "T" + randomUUID().slice(0, 11);

let fetchCalls = 0;
let realFetch;

before(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = (...args) => {
    fetchCalls++;
    throw new Error(`network is disabled in this test — fetch() called with ${String(args[0])}`);
  };
});

after(() => {
  globalThis.fetch = realFetch;
  assert.equal(fetchCalls, 0, "the handler must not reach the network on its own");
});

function post(body, { token = "valid-token", method = "POST" } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  return new Request("https://example.test/functions/v1/create-student", {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
}

function makeDeps(overrides = {}) {
  const calls = { getUserId: [], getRole: [], create: [], write: [], del: [], log: [] };
  const deps = {
    getUserId: async (token) => { calls.getUserId.push(token); return token === "valid-token" ? TEACHER_ID : null; },
    getRole: async (id) => { calls.getRole.push(id); return "teacher"; },
    createAuthUser: async (email, password) => { calls.create.push({ email, password }); return { id: NEW_ID, error: null }; },
    writeStudentProfile: async (studentId, teacherId) => { calls.write.push({ studentId, teacherId }); return { error: null }; },
    deleteAuthUser: async (id) => { calls.del.push(id); return { error: null }; },
    logError: (stage, detail) => { calls.log.push({ stage, detail }); },
    ...overrides,
  };
  return { deps, calls };
}

async function read(res) {
  const text = await res.text();
  return { status: res.status, text, json: JSON.parse(text) };
}

// ── happy path ────────────────────────────────────────────────────────────────────────────────

test("a teacher creates a pupil: { success: true }, auth user first, then the profile", async () => {
  const { deps, calls } = makeDeps();
  const res = await read(await createHandler(deps)(post({ email: "  elev@skole.dk ", password: PASSWORD })));

  assert.equal(res.status, 200);
  assert.deepEqual(res.json, { success: true });
  assert.deepEqual(calls.create, [{ email: "elev@skole.dk", password: PASSWORD }]);
  assert.deepEqual(calls.write, [{ studentId: NEW_ID, teacherId: TEACHER_ID }]);
  assert.deepEqual(calls.del, [], "nothing is rolled back on success");
});

test("the pupil is owned by the CALLER — teacher_id cannot be chosen by the request body", async () => {
  const { deps, calls } = makeDeps();
  await createHandler(deps)(post({ email: "elev@skole.dk", password: PASSWORD, teacher_id: "someone-else" }));
  assert.equal(calls.write[0].teacherId, TEACHER_ID);
});

test("the wiring writes role 'student' and must_reset_password = true in the same profile write", () => {
  // The handler is pure; the actual column values live in index.ts. Assert on the one write it makes.
  const src = readFileSync(join(ROOT, "supabase/functions/create-student/index.ts"), "utf8");
  const upsert = src.match(/\.upsert\(\{([\s\S]*?)\}\)/);
  assert.ok(upsert, "index.ts must write the profile with a single upsert");
  const body = upsert[1];
  assert.match(body, /role:\s*"student"/);
  assert.match(body, /teacher_id:\s*teacherId/);
  assert.match(body, /must_reset_password:\s*true/);
  // And no second write path that could leave the flag unset.
  assert.equal((src.match(/from\("profiles"\)/g) || []).length, 2, "one role read + one profile write");
});

// ── who may call ──────────────────────────────────────────────────────────────────────────────

test("no Authorization header → 401 and nothing is created", async () => {
  const { deps, calls } = makeDeps();
  const res = await read(await createHandler(deps)(post({ email: "elev@skole.dk", password: PASSWORD }, { token: null })));
  assert.equal(res.status, 401);
  assert.equal(calls.create.length, 0);
});

test("an invalid token → 401 and nothing is created", async () => {
  const { deps, calls } = makeDeps();
  const res = await read(await createHandler(deps)(post({ email: "elev@skole.dk", password: PASSWORD }, { token: "forged" })));
  assert.equal(res.status, 401);
  assert.equal(calls.create.length, 0);
});

for (const role of ["student", "super_admin", null, "TEACHER"]) {
  test(`role ${JSON.stringify(role)} → 403 and nothing is created`, async () => {
    const { deps, calls } = makeDeps({ getRole: async () => role });
    const res = await read(await createHandler(deps)(post({ email: "elev@skole.dk", password: PASSWORD })));
    assert.equal(res.status, 403);
    assert.equal(calls.create.length, 0);
  });
}

test("a FAILED role read is a 500, never permission and never a silent 403", async () => {
  const { deps, calls } = makeDeps({ getRole: async () => { throw new Error("db down"); } });
  const res = await read(await createHandler(deps)(post({ email: "elev@skole.dk", password: PASSWORD })));
  assert.equal(res.status, 500);
  assert.deepEqual(res.json, { error: "internal_error" });
  assert.equal(calls.create.length, 0);
  assert.equal(calls.log.length, 1);
});

// ── input ─────────────────────────────────────────────────────────────────────────────────────

for (const [label, body, code] of [
  ["missing email", { password: PASSWORD }, "invalid_email"],
  ["not an address", { email: "elev", password: PASSWORD }, "invalid_email"],
  ["missing password", { email: "elev@skole.dk" }, "invalid_password"],
  ["short password", { email: "elev@skole.dk", password: "x".repeat(MIN_PASSWORD_LENGTH - 1) }, "invalid_password"],
  ["non-string password", { email: "elev@skole.dk", password: 123456 }, "invalid_password"],
]) {
  test(`${label} → 400 ${code}, nothing created`, async () => {
    const { deps, calls } = makeDeps();
    const res = await read(await createHandler(deps)(post(body)));
    assert.equal(res.status, 400);
    assert.deepEqual(res.json, { error: code });
    assert.equal(calls.create.length, 0);
  });
}

test("a provider failure on createUser → 400 create_failed, without the provider's text", async () => {
  const { deps, calls } = makeDeps({
    createAuthUser: async () => ({ id: null, error: { message: "A user with this email address has already been registered" } }),
  });
  const res = await read(await createHandler(deps)(post({ email: "elev@skole.dk", password: PASSWORD })));
  assert.equal(res.status, 400);
  assert.deepEqual(res.json, { error: "create_failed" });
  assert.ok(!res.text.includes("registered"));
  assert.equal(calls.write.length, 0);
});

// ── partial failure ───────────────────────────────────────────────────────────────────────────

test("profile write fails → the auth user just created is deleted again (profile_failed)", async () => {
  const { deps, calls } = makeDeps({ writeStudentProfile: async () => ({ error: { message: "constraint" } }) });
  const res = await read(await createHandler(deps)(post({ email: "elev@skole.dk", password: PASSWORD })));
  assert.equal(res.status, 500);
  assert.deepEqual(res.json, { error: "profile_failed" });
  assert.deepEqual(calls.del, [NEW_ID], "exactly the new user is deleted — nobody else");
});

test("profile write AND rollback fail → a distinct error, never reported as ordinary", async () => {
  const { deps, calls } = makeDeps({
    writeStudentProfile: async () => ({ error: { message: "constraint" } }),
    deleteAuthUser: async () => ({ error: { message: "gone away" } }),
  });
  const res = await read(await createHandler(deps)(post({ email: "elev@skole.dk", password: PASSWORD })));
  assert.equal(res.status, 500);
  assert.deepEqual(res.json, { error: "profile_failed_rollback_failed" });
  assert.deepEqual(calls.log.map((l) => l.stage), ["write_student_profile", "rollback_delete_auth_user"]);
  assert.equal(calls.log[1].detail.student_id, NEW_ID, "the orphan is identifiable in the log");
});

// ── privacy ───────────────────────────────────────────────────────────────────────────────────

test("no response and no log line ever carries the password or the address", async () => {
  const scenarios = [
    {},
    { createAuthUser: async () => ({ id: null, error: { message: "x" } }) },
    { writeStudentProfile: async () => ({ error: { message: "x" } }) },
    { writeStudentProfile: async () => ({ error: { message: "x" } }), deleteAuthUser: async () => ({ error: { message: "x" } }) },
  ];
  for (const o of scenarios) {
    const { deps, calls } = makeDeps(o);
    const res = await read(await createHandler(deps)(post({ email: "elev@skole.dk", password: PASSWORD })));
    assert.ok(!res.text.includes(PASSWORD));
    assert.ok(!res.text.includes("elev@skole.dk"));
    const logged = JSON.stringify(calls.log);
    assert.ok(!logged.includes(PASSWORD));
    assert.ok(!logged.includes("elev@skole.dk"));
  }
});

test("OPTIONS answers the CORS preflight; GET is refused", async () => {
  const { deps } = makeDeps();
  const pre = await createHandler(deps)(new Request("https://example.test/x", { method: "OPTIONS" }));
  assert.equal(pre.status, 200);
  assert.equal(pre.headers.get("Access-Control-Allow-Origin"), CORS_HEADERS["Access-Control-Allow-Origin"]);

  const get = await createHandler(deps)(post(null, { method: "GET" }));
  assert.equal(get.status, 405);
});

test("the browser minimum matches the server minimum", () => {
  const js = readFileSync(join(ROOT, "js/teacher.js"), "utf8");
  assert.match(js, new RegExp(`password\\.length < ${MIN_PASSWORD_LENGTH}\\b`));
});
