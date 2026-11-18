// End-to-end proof, with a fake service-role client, of the two entry points in tests/e2e-admin.mjs:
//
//   - a bad configuration fails BEFORE a client exists (so before any network call);
//   - global-setup's verifyAndOpenAdmin() publishes the record only after a successful verification;
//   - a spec's createE2EAdminClient() re-verifies before its first write: an UNMARKED account — or a
//     hand-made E2E_VERIFIED_ACCOUNTS naming one — is never written to; nothing is sent at all.
//
// No production call: the "client" is an in-memory fake that records what would have been sent.
import test from "node:test";
import assert from "node:assert/strict";
import { createE2EAdminClient, verifyAndOpenAdmin } from "../e2e-admin.mjs";
import { ACCOUNT_KINDS, LAERLIG_DOMAIN, MARKER_KEY, VERIFIED_ENV, expectedMarker } from "../e2e-accounts.mjs";

const D = LAERLIG_DOMAIN;
const ID = Object.freeze({
  primary: "11111111-1111-4111-8111-111111111111",
  teacher: "22222222-2222-4222-8222-222222222222",
  student2: "33333333-3333-4333-8333-333333333333",
  owner: "44444444-4444-4444-8444-444444444444",
});
const STRANGER = "55555555-5555-4555-8555-555555555555"; // a real, unmarked pupil
const EMAIL = Object.freeze({ primary: `elev@${D}`, teacher: `laerer@${D}`, student2: `elev2@${D}`, owner: `laerer+e2e-slot-0-owner@${D}` });
const baseEnv = () => ({
  SUPABASE_URL: "http://127.0.0.1:9", // never contacted: the fake replaces the client
  SUPABASE_SERVICE_ROLE_KEY: ["fake", "service", "role"].join("-"),
  TEST_STUDENT_EMAIL: EMAIL.primary, TEST_TEACHER_EMAIL: EMAIL.teacher, TEST_STUDENT2_EMAIL: EMAIL.student2,
});

function fakeWorld(mutate = () => {}) {
  const w = {
    users: [
      ...ACCOUNT_KINDS.map((k) => ({ id: ID[k], email: EMAIL[k], app_metadata: { [MARKER_KEY]: expectedMarker(0, k) } })),
      { id: STRANGER, email: "rigtig.elev@skole.dk", app_metadata: {} },
    ],
    profiles: [
      { id: ID.primary, role: "student", teacher_id: ID.owner },
      { id: ID.teacher, role: "teacher", teacher_id: null },
      { id: ID.student2, role: "student", teacher_id: ID.teacher },
      { id: ID.owner, role: "teacher", teacher_id: null },
      { id: STRANGER, role: "student", teacher_id: "66666666-6666-4666-8666-666666666666" },
    ],
    sent: [],
    clients: 0,
  };
  mutate(w);
  const rows = (ok) => ({ then: (f, r) => Promise.resolve({ data: ok(), error: null }).then(f, r) });
  const writer = (table, op, args) => {
    const entry = { table, op, args, chain: [] };
    const b = {};
    for (const m of ["eq", "in", "match", "select", "single", "maybeSingle"]) b[m] = (...a) => { entry.chain.push([m, a]); return b; };
    b.then = (f, r) => {
      w.sent.push(entry);
      // Apply profile updates filtered on id, so a repair is visible to the re-verification.
      if (table === "profiles" && op === "update" && !w.ignoreUpdates) {
        const ids = entry.chain.filter(([m, a]) => m === "eq" && a[0] === "id").map(([, a]) => a[1]);
        for (const p of w.profiles) if (ids.includes(p.id)) Object.assign(p, args[0]);
      }
      return Promise.resolve({ data: null, error: w.failUpdates ? { message: "fail" } : null }).then(f, r);
    };
    return b;
  };
  const raw = {
    from: (table) => ({
      select: () => ({ in: (col, ids) => rows(() => w.profiles.filter((p) => ids.includes(p[col]))) }),
      insert: (...a) => writer(table, "insert", a),
      update: (...a) => writer(table, "update", a),
      delete: (...a) => writer(table, "delete", a),
      upsert: (...a) => writer(table, "upsert", a),
    }),
    auth: { admin: {
      listUsers: async ({ page, perPage }) => ({ data: { users: w.users.slice((page - 1) * perPage, page * perPage) }, error: null }),
      updateUserById: async (...a) => { w.sent.push({ op: "auth.updateUserById", args: a }); return { data: null, error: null }; },
      createUser: async (...a) => { w.sent.push({ op: "auth.createUser", args: a }); return { data: null, error: null }; },
    } },
  };
  w.rawClient = () => { w.clients++; return raw; };
  return w;
}

const record = (ids) => JSON.stringify({ v: 1, slot: 0, ids });

test("a bad configuration fails before any client exists (no network call possible)", async () => {
  for (const mutate of [
    (e) => { delete e.TEST_TEACHER_EMAIL; },
    (e) => { e.TEST_STUDENT2_EMAIL = "student-teacher-test@hotmail.com"; },
    (e) => { e.TEST_STUDENT_EMAIL = `elev+e2e-slot-1@${D}`; },
    (e) => { e.E2E_SLOT = "9"; },
  ]) {
    const w = fakeWorld();
    const env = baseEnv();
    mutate(env);
    await assert.rejects(verifyAndOpenAdmin(env, { rawClient: w.rawClient }), /E2E-konti/);
    assert.equal(w.clients, 0, "no client was created");
    assert.equal(env[VERIFIED_ENV], undefined, "nothing was published");
  }
  const w = fakeWorld();
  assert.throws(() => createE2EAdminClient(baseEnv(), { rawClient: w.rawClient }), /E2E_VERIFIED_ACCOUNTS mangler/);
  assert.equal(w.clients, 0);
});

test("global-setup path: verified accounts → record published → guarded writes reach only them", async () => {
  const w = fakeWorld();
  const env = baseEnv();
  const { admin, verified } = await verifyAndOpenAdmin(env, { rawClient: w.rawClient });
  assert.deepEqual(verified.ids, ID);
  assert.deepEqual(JSON.parse(env[VERIFIED_ENV]), { v: 1, slot: 0, ids: ID });
  await admin.from("question_instances").delete().eq("student_id", ID.primary);
  await admin.auth.admin.updateUserById(ID.student2, { password: ["restore", "value"].join("-") });
  await assert.rejects(admin.from("profiles").update({ selected_grade: 9 }).eq("id", STRANGER), /ikke en verificeret testkonto/);
  await assert.rejects(async () => admin.auth.admin.createUser({ email: "x@skole.dk" }), /er ikke tilladt/);
  assert.deepEqual(w.sent.map((s) => s.op), ["delete", "auth.updateUserById"]);
});

test("global-setup path: an unmarked account stops the run — nothing published, nothing written, nothing created", async () => {
  for (const mutate of [
    (w) => { w.users.find((u) => u.id === ID.primary).app_metadata = {}; },
    (w) => { w.users = w.users.filter((u) => u.id !== ID.owner); },
    (w) => { w.profiles.find((p) => p.id === ID.student2).role = "super_admin"; },
    (w) => { w.profiles.find((p) => p.id === STRANGER).teacher_id = ID.teacher; },
  ]) {
    const w = fakeWorld(mutate);
    const env = baseEnv();
    await assert.rejects(verifyAndOpenAdmin(env, { rawClient: w.rawClient }), /E2E-konti/);
    assert.equal(env[VERIFIED_ENV], undefined);
    assert.deepEqual(w.sent, []);
  }
});

// Priority 3: an interrupted password-help run (killed inside test 4, before its finally-block)
// leaves the marked primary pupil with teacher_id = null. global-setup re-attaches it to its MARKED
// owner teacher through the guarded client, then verifies everything again.
test("global-setup path: a detached marked pupil is re-attached to its marked teacher, then re-verified", async () => {
  for (const kind of ["primary", "student2"]) {
    const w = fakeWorld((w) => { w.profiles.find((p) => p.id === ID[kind]).teacher_id = null; });
    const env = baseEnv();
    const logs = [];
    const { verified } = await verifyAndOpenAdmin(env, { rawClient: w.rawClient, log: (m) => logs.push(m) });
    const teacher = kind === "primary" ? ID.owner : ID.teacher;
    assert.deepEqual(verified.ids, ID);
    assert.deepEqual(w.sent.map((s) => [s.table, s.op, s.args[0], s.chain]), [["profiles", "update", { teacher_id: teacher }, [["eq", ["id", ID[kind]]]]]]);
    assert.equal(w.profiles.find((p) => p.id === ID[kind]).teacher_id, teacher);
    assert.equal(logs.length, 1);
    assert.match(logs[0], new RegExp(`${kind} \\(${ID[kind]}\\) had teacher_id = null`));
    assert.deepEqual(JSON.parse(env[VERIFIED_ENV]).ids, ID);
  }
});

test("global-setup path: no repair unless the ONLY problem is a detached marked pupil", async () => {
  const detach = (w) => { w.profiles.find((p) => p.id === ID.primary).teacher_id = null; };
  for (const [label, mutate] of [
    ["pupil points at another teacher", (w) => { w.profiles.find((p) => p.id === ID.primary).teacher_id = ID.teacher; }],
    ["pupil points at an unknown teacher", (w) => { w.profiles.find((p) => p.id === ID.primary).teacher_id = STRANGER; }],
    ["detached pupil, but the owner has a stranger as pupil", (w) => { detach(w); w.profiles.find((p) => p.id === STRANGER).teacher_id = ID.owner; }],
    ["detached pupil, but a marker is missing", (w) => { detach(w); w.users.find((u) => u.id === ID.student2).app_metadata = {}; }],
    ["detached pupil, but a pupil has the wrong role", (w) => { detach(w); w.profiles.find((p) => p.id === ID.primary).role = "teacher"; }],
    ["detached pupil, but a teacher has a teacher", (w) => { detach(w); w.profiles.find((p) => p.id === ID.owner).teacher_id = ID.teacher; }],
    // Isolated: a teacher OUTSIDE the verified set, so no pupil count changes — only the
    // "has a teacher itself" rule can stop the repair.
    ["detached pupil, but the owner has an outside teacher", (w) => { detach(w); w.profiles.find((p) => p.id === ID.owner).teacher_id = "66666666-6666-4666-8666-666666666666"; }],
    ["detached pupil, but the owner account is missing", (w) => { detach(w); w.users = w.users.filter((u) => u.id !== ID.owner); }],
  ]) {
    const w = fakeWorld(mutate);
    const env = baseEnv();
    await assert.rejects(verifyAndOpenAdmin(env, { rawClient: w.rawClient, log: () => {} }), /E2E-konti/, label);
    assert.deepEqual(w.sent, [], `${label}: nothing written`);
    assert.equal(env[VERIFIED_ENV], undefined, `${label}: nothing published`);
  }
});

test("global-setup path: a failed repair write stops the run, nothing is published", async () => {
  const w = fakeWorld((w) => { w.profiles.find((p) => p.id === ID.primary).teacher_id = null; w.failUpdates = true; });
  const env = baseEnv();
  await assert.rejects(verifyAndOpenAdmin(env, { rawClient: w.rawClient, log: () => {} }), /teacher_id kunne ikke gendannes/);
  assert.equal(env[VERIFIED_ENV], undefined);
});

test("global-setup path: a repair that reports success but changes nothing is caught by the re-verification", async () => {
  // PostgREST reports no error for an UPDATE that matched zero rows: only the re-read proves it.
  const w = fakeWorld((w) => { w.profiles.find((p) => p.id === ID.primary).teacher_id = null; w.ignoreUpdates = true; });
  const env = baseEnv();
  await assert.rejects(verifyAndOpenAdmin(env, { rawClient: w.rawClient, log: () => {} }), /primary \(.*\): tilhører ikke owner/);
  assert.equal(w.sent.length, 1, "exactly one repair attempt, never a second");
  assert.equal(env[VERIFIED_ENV], undefined);
});

test("spec path: a detached pupil is never repaired by a spec client — it stops before writing", async () => {
  const w = fakeWorld();
  const env = { ...baseEnv(), [VERIFIED_ENV]: record(ID) };
  const admin = createE2EAdminClient(env, { rawClient: w.rawClient });
  w.profiles.find((p) => p.id === ID.primary).teacher_id = null;
  await assert.rejects(admin.from("question_instances").delete().eq("student_id", ID.student2), /tilhører ikke owner/);
  assert.deepEqual(w.sent, []);
});

test("spec path: the real record works — after a fresh verification, before the first write", async () => {
  const w = fakeWorld();
  const env = { ...baseEnv(), [VERIFIED_ENV]: record(ID) };
  const admin = createE2EAdminClient(env, { rawClient: w.rawClient });
  await admin.from("profiles").update({ placement_band: 2 }).eq("id", ID.primary);
  assert.deepEqual(w.sent.map((s) => [s.table, s.op]), [["profiles", "update"]]);
});

test("spec path: a hand-made record naming an UNMARKED account can never write to it", async () => {
  // The forger swaps the primary pupil for a real pupil. The guard's own id check would let the
  // stranger through (it is "verified" in the forged record) — the re-verification must stop it.
  const w = fakeWorld();
  const env = { ...baseEnv(), [VERIFIED_ENV]: record({ ...ID, primary: STRANGER }) };
  const admin = createE2EAdminClient(env, { rawClient: w.rawClient });
  await assert.rejects(admin.from("profiles").update({ selected_grade: 1 }).eq("id", STRANGER), /svarer ikke til de markerede konti \(primary\)/);
  await assert.rejects(admin.from("user_items").insert({ user_id: STRANGER, item_id: "x" }), /svarer ikke/);
  await assert.rejects(admin.auth.admin.updateUserById(STRANGER, { password: ["x", "y"].join("-") }), /svarer ikke/);
  // Even the true accounts are not written through a client built on a forged record.
  await assert.rejects(admin.from("profiles").update({ selected_grade: 1 }).eq("id", ID.teacher), /svarer ikke/);
  assert.deepEqual(w.sent, []);
});

test("spec path: an account that lost its marker since global-setup is not written to", async () => {
  const w = fakeWorld();
  const env = { ...baseEnv(), [VERIFIED_ENV]: record(ID) };
  const admin = createE2EAdminClient(env, { rawClient: w.rawClient });
  w.users.find((u) => u.id === ID.student2).app_metadata = { [MARKER_KEY]: { v: 1, slot: 0, kind: "student2", forged: true } };
  await assert.rejects(admin.from("question_instances").delete().eq("student_id", ID.student2), /mangler markøren/);
  assert.deepEqual(w.sent, []);
});
