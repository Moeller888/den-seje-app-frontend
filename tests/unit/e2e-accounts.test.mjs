// A1 + A2: the E2E account registry and its fail-closed, read-only verification
// (tests/e2e-accounts.mjs). Every case runs against fakes — no network, no production call.
//
// Pinned:
//   A1  no default address; only the Lærlig domain (or, in the checked isolated stack only,
//       e2e.invalid); slot 0 has the same four accounts as slots 1..3, its owner derived the same
//       way; a bad configuration throws BEFORE any network call and names every problem at once;
//   A2  each account must already exist (nothing is created), carry exactly
//       app_metadata.laerlig_e2e = { v: 1, slot, kind }, have the expected role and relation, and the
//       two teachers no other pupils; listUsers is paged to the end; any problem throws before the
//       caller can write; the published record is re-validated strictly by readVerified().
import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCOUNT_KINDS, E2EAccountError, LAERLIG_DOMAIN, MARKER_KEY, OWNER_ENV, PAGE_SIZE, VERIFIED_ENV,
  allowedDomain, expectedMarker, hasExactMarker, isUuid, ownerAddressFor, publishVerified, readVerified,
  requiredAddress, resolveAccountRegistry, verifyAccounts,
} from "../e2e-accounts.mjs";

const D = LAERLIG_DOMAIN;
const SLOT0 = Object.freeze({
  TEST_STUDENT_EMAIL: `elev@${D}`,
  TEST_TEACHER_EMAIL: `laerer@${D}`,
  TEST_STUDENT2_EMAIL: `elev2@${D}`,
});
const slotEnv = (slot) => ({
  E2E_SLOT: String(slot),
  TEST_STUDENT_EMAIL: `elev+e2e-slot-${slot}@${D}`,
  TEST_TEACHER_EMAIL: `laerer+e2e-slot-${slot}@${D}`,
  TEST_STUDENT2_EMAIL: `elev2+e2e-slot-${slot}@${D}`,
  [OWNER_ENV]: `laerer+e2e-slot-${slot}-owner@${D}`,
});
const problemsOf = (fn) => {
  try { fn(); } catch (e) { assert.ok(e instanceof E2EAccountError, String(e)); return e.problems; }
  assert.fail("expected an E2EAccountError");
};

// ── A1: registry ──────────────────────────────────────────────────────────────────────────────
test("A1: slot 0 resolves four accounts on the Lærlig domain, owner derived from the teacher", () => {
  const r = resolveAccountRegistry({ ...SLOT0 });
  assert.equal(r.slot, 0);
  assert.equal(r.domain, "xn--lrlig-sra.dk");
  assert.deepEqual(Object.keys(r.accounts), [...ACCOUNT_KINDS]);
  assert.deepEqual(ACCOUNT_KINDS.map((k) => r.accounts[k].email), [`elev@${D}`, `laerer@${D}`, `elev2@${D}`, `laerer+e2e-slot-0-owner@${D}`]);
  assert.deepEqual(ACCOUNT_KINDS.map((k) => r.accounts[k].role), ["student", "teacher", "student", "teacher"]);
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.accounts) && Object.isFrozen(r.accounts.primary));
  // The Unicode spelling of the domain is the same domain.
  assert.equal(resolveAccountRegistry({ ...SLOT0, TEST_TEACHER_EMAIL: "laerer@lærlig.dk" }).accounts.teacher.email, "laerer@lærlig.dk");
});

test("A1: slots 1..3 follow the same rules; the owner must match the slot's derived owner", () => {
  for (const slot of [1, 2, 3]) {
    const r = resolveAccountRegistry(slotEnv(slot));
    assert.equal(r.slot, slot);
    assert.equal(r.accounts.owner.email, `laerer+e2e-slot-${slot}-owner@${D}`);
    assert.equal(ownerAddressFor(`laerer+e2e-slot-${slot}@${D}`, slot), r.accounts.owner.email);
  }
  assert.ok(problemsOf(() => resolveAccountRegistry({ ...slotEnv(2), [OWNER_ENV]: `x+e2e-slot-2-owner@${D}` }))
    .some((p) => p.startsWith(OWNER_ENV)));
  assert.ok(problemsOf(() => resolveAccountRegistry({ ...slotEnv(2), [OWNER_ENV]: undefined })).some((p) => p.startsWith(OWNER_ENV)));
});

test("A1: no defaults — every missing address is named, all at once, without its value", () => {
  const p = problemsOf(() => resolveAccountRegistry({}));
  assert.deepEqual(p, [
    "TEST_STUDENT_EMAIL: mangler (ingen standardværdi)",
    "TEST_TEACHER_EMAIL: mangler (ingen standardværdi)",
    "TEST_STUDENT2_EMAIL: mangler (ingen standardværdi)",
  ]);
  for (const blank of ["", "   "]) {
    assert.ok(problemsOf(() => resolveAccountRegistry({ ...SLOT0, TEST_TEACHER_EMAIL: blank })).length >= 1);
  }
});

test("A1: only a Lærlig-controlled domain — hotmail, look-alikes, subdomains and malformed addresses are refused", () => {
  for (const bad of [
    "teacher-test@hotmail.com", "student-teacher-test@hotmail.com", "x@gmail.com", "x@lærlig.dk.evil.com",
    `x@sub.${D}`, "x@xn--lrlig-sra.de", "x@e2e.invalid", "nolocal", `@${D}`, `a@b@${D}`, `a b@${D}`, ` a@${D}`, `a@${D}\n`,
  ]) {
    const p = problemsOf(() => resolveAccountRegistry({ ...SLOT0, TEST_STUDENT2_EMAIL: bad }));
    assert.ok(p.some((x) => x.startsWith("TEST_STUDENT2_EMAIL")), JSON.stringify(bad));
    for (const line of p) assert.ok(!line.includes(bad.trim()) || bad.trim() === "", "a problem never echoes the address: " + line);
  }
});

test("A1: slot tags — slot 0 may not use a slot address; slots 1..3 must use their own", () => {
  assert.ok(problemsOf(() => resolveAccountRegistry({ ...SLOT0, TEST_STUDENT_EMAIL: `elev+e2e-slot-1@${D}` }))
    .includes("TEST_STUDENT_EMAIL: slot 0 må ikke bruge en slot-adresse"));
  assert.ok(problemsOf(() => resolveAccountRegistry({ ...slotEnv(1), TEST_STUDENT2_EMAIL: `elev2+e2e-slot-2@${D}` }))
    .includes("TEST_STUDENT2_EMAIL: er ikke slot 1s adresse"));
  assert.ok(problemsOf(() => resolveAccountRegistry({ ...slotEnv(3), TEST_TEACHER_EMAIL: `laerer@${D}` }))
    .includes("TEST_TEACHER_EMAIL: er ikke slot 3s adresse"));
  assert.ok(problemsOf(() => resolveAccountRegistry({ ...SLOT0, E2E_SLOT: "4" })).some((p) => p.includes("E2E_SLOT")));
});

test("A1: all four addresses are distinct (case-insensitive)", () => {
  const p = problemsOf(() => resolveAccountRegistry({ ...SLOT0, TEST_STUDENT2_EMAIL: `ELEV@${D}` }));
  assert.ok(p.some((x) => x.includes("har samme adresse")));
  const q = problemsOf(() => resolveAccountRegistry({ ...SLOT0, TEST_STUDENT_EMAIL: `laerer+e2e-slot-0-owner@${D}` }));
  assert.ok(q.some((x) => x.includes("slot-adresse") || x.includes("har samme adresse")));
});

test("A1: the isolated domain only with ISOLATED_SUITE=1 AND a loopback SUPABASE_URL", () => {
  const iso = { TEST_STUDENT_EMAIL: "p@e2e.invalid", TEST_TEACHER_EMAIL: "t@e2e.invalid", TEST_STUDENT2_EMAIL: "q@e2e.invalid" };
  for (const url of ["http://127.0.0.1:54321", "http://localhost:8000", "http://[::1]:1"]) {
    assert.equal(resolveAccountRegistry({ ...iso, ISOLATED_SUITE: "1", SUPABASE_URL: url }).domain, "e2e.invalid");
  }
  for (const url of [undefined, "", "https://tjzbehwfagiwpwodsgwg.supabase.co", "http://127.0.0.1.evil.com", "file:///x"]) {
    assert.throws(() => allowedDomain({ ISOLATED_SUITE: "1", SUPABASE_URL: url }), E2EAccountError, String(url));
  }
  assert.equal(allowedDomain({ ISOLATED_SUITE: "0", SUPABASE_URL: "http://127.0.0.1:1" }), D, "only exactly \"1\" switches");
  // Production addresses are refused in the isolated stack, synthetic ones outside it.
  assert.throws(() => resolveAccountRegistry({ ...SLOT0, ISOLATED_SUITE: "1", SUPABASE_URL: "http://127.0.0.1:1" }), E2EAccountError);
  assert.throws(() => resolveAccountRegistry({ ...iso }), E2EAccountError);
});

test("A1: requiredAddress has no default and knows only the three address variables", () => {
  assert.equal(requiredAddress("TEST_TEACHER_EMAIL", { TEST_TEACHER_EMAIL: ` laerer@${D} ` }), `laerer@${D}`);
  for (const env of [{}, { TEST_TEACHER_EMAIL: "" }, { TEST_TEACHER_EMAIL: "  " }]) {
    assert.throws(() => requiredAddress("TEST_TEACHER_EMAIL", env), /ingen standardværdi/);
  }
  assert.throws(() => requiredAddress("SUPABASE_SERVICE_ROLE_KEY", { SUPABASE_SERVICE_ROLE_KEY: "x" }), /ikke en kendt adressevariabel/);
});

// ── A2: verification against fakes ────────────────────────────────────────────────────────────
const ID = Object.freeze({
  primary: "11111111-1111-4111-8111-111111111111",
  teacher: "22222222-2222-4222-8222-222222222222",
  student2: "33333333-3333-4333-8333-333333333333",
  owner: "44444444-4444-4444-8444-444444444444",
});
const STRANGER = "55555555-5555-4555-8555-555555555555";

function world({ slot = 0, env = SLOT0, mutate = () => {}, pageSize = PAGE_SIZE, filler = 0 } = {}) {
  const registry = resolveAccountRegistry(env);
  const users = [];
  for (let i = 0; i < filler; i++) users.push({ id: `9${String(i).padStart(7, "0")}-0000-4000-8000-000000000000`, email: `real${i}@skole.dk`, app_metadata: {} });
  for (const kind of ACCOUNT_KINDS) {
    users.push({ id: ID[kind], email: registry.accounts[kind].email.toUpperCase(), app_metadata: { provider: "email", [MARKER_KEY]: expectedMarker(slot, kind) } });
  }
  const profiles = [
    { id: ID.primary, role: "student", teacher_id: ID.owner },
    { id: ID.teacher, role: "teacher", teacher_id: null },
    { id: ID.student2, role: "student", teacher_id: ID.teacher },
    { id: ID.owner, role: "teacher", teacher_id: null },
  ];
  const state = { users, profiles, calls: [], writes: 0 };
  mutate(state, registry);
  const deps = {
    listUsers: async ({ page, perPage }) => {
      state.calls.push(["listUsers", page, perPage]);
      const size = Math.min(perPage, pageSize);
      return { data: { users: state.users.slice((page - 1) * size, page * size) }, error: null };
    },
    selectProfilesByIds: async (ids) => { state.calls.push(["profiles", ids]); return { data: state.profiles.filter((p) => ids.includes(p.id)), error: null }; },
    selectPupilsOfTeachers: async (ids) => { state.calls.push(["pupils", ids]); return { data: state.profiles.filter((p) => ids.includes(p.teacher_id)), error: null }; },
  };
  return { registry, deps, state };
}
const rejectsWith = async (w, pattern) => {
  await assert.rejects(verifyAccounts(w.registry, w.deps), (e) => {
    assert.ok(e instanceof E2EAccountError, String(e));
    assert.ok(e.problems.some((p) => pattern.test(p)), e.problems.join(" | "));
    return true;
  });
};

test("A2: four correctly marked, related accounts verify; the record is frozen and read-only was used", async () => {
  const w = world();
  const v = await verifyAccounts(w.registry, w.deps);
  assert.deepEqual(v.ids, ID);
  assert.equal(v.slot, 0);
  assert.equal(v.roles[ID.owner], "teacher");
  assert.ok(Object.isFrozen(v) && Object.isFrozen(v.ids));
  assert.deepEqual([...new Set(w.state.calls.map((c) => c[0]))], ["listUsers", "profiles", "pupils"]);
});

test("A2: listUsers is paged until an EMPTY page, even when the server returns short pages", async () => {
  const w = world({ filler: 25, pageSize: 7 });
  const v = await verifyAccounts(w.registry, w.deps);
  assert.deepEqual(v.ids, ID);
  const pages = w.state.calls.filter((c) => c[0] === "listUsers");
  assert.equal(pages.at(-1)[1], Math.ceil(29 / 7) + 1, "stops at the first empty page");
});

test("A2: a missing account is an error — never created", async () => {
  for (const kind of ACCOUNT_KINDS) {
    const w = world({ mutate: (s) => { s.users = s.users.filter((u) => u.id !== ID[kind]); } });
    await rejectsWith(w, new RegExp(`^${kind}: kontoen findes ikke — den oprettes aldrig`));
  }
});

test("A2: an unmarked, differently marked or loosely marked account stops the run", async () => {
  const variants = [
    undefined, {}, { v: 1, slot: 0 }, { v: 2, slot: 0, kind: "teacher" }, { v: 1, slot: 1, kind: "teacher" },
    { v: 1, slot: "0", kind: "teacher" }, { v: 1, slot: 0, kind: "primary" }, { v: 1, slot: 0, kind: "teacher", extra: true }, [1, 0, "teacher"],
  ];
  for (const marker of variants) {
    const w = world({ mutate: (s) => { const u = s.users.find((x) => x.id === ID.teacher); u.app_metadata = marker === undefined ? {} : { [MARKER_KEY]: marker }; } });
    await rejectsWith(w, /^teacher \(22222222-2222-4222-8222-222222222222\): mangler markøren .* — kontoen ændres ikke$/);
  }
  // The legacy slot marker (e2e_slot/e2e_account) does not count.
  const legacy = world({ mutate: (s) => { s.users.find((x) => x.id === ID.primary).app_metadata = { e2e_slot: 0, e2e_account: "primary" }; } });
  await rejectsWith(legacy, /^primary .*mangler markøren/);
});

test("A2: user_metadata cannot stand in for the marker (users can write user_metadata themselves)", () => {
  assert.equal(hasExactMarker({ user_metadata: { [MARKER_KEY]: expectedMarker(0, "primary") }, app_metadata: {} }, 0, "primary"), false);
  assert.equal(hasExactMarker(null, 0, "primary"), false);
  assert.equal(hasExactMarker({ app_metadata: { [MARKER_KEY]: expectedMarker(0, "primary") } }, 0, "primary"), true);
});

test("A2: the address on two accounts, a non-UUID id or two kinds on one id is refused", async () => {
  await rejectsWith(world({ mutate: (s, r) => { s.users.push({ id: STRANGER, email: r.accounts.student2.email, app_metadata: {} }); } }), /^student2: adressen findes på mere end én konto/);
  await rejectsWith(world({ mutate: (s) => { s.users.find((u) => u.id === ID.owner).id = "not-a-uuid"; } }), /^owner: har ikke et gyldigt bruger-id/);
  await assert.rejects(verifyAccounts(...(() => {
    const w = world({ mutate: (s) => { s.users.find((u) => u.id === ID.owner).id = ID.teacher; } });
    return [w.registry, w.deps];
  })()), /to konti har samme bruger-id/);
});

test("A2: wrong roles are refused — including a pupil escalated to teacher or super_admin", async () => {
  for (const [kind, role] of [["primary", "teacher"], ["primary", "super_admin"], ["student2", "super_admin"], ["teacher", "student"], ["owner", "super_admin"], ["teacher", null]]) {
    const w = world({ mutate: (s) => { s.profiles.find((p) => p.id === ID[kind]).role = role; } });
    await rejectsWith(w, new RegExp(`^${kind} \\(.*\\): har rollen`));
  }
  await rejectsWith(world({ mutate: (s) => { s.profiles = s.profiles.filter((p) => p.id !== ID.student2); } }), /^student2 .*har ingen profil/);
});

test("A2: relations — pupil under its teacher, teachers without a teacher, each teacher exactly one pupil", async () => {
  await rejectsWith(world({ mutate: (s) => { s.profiles.find((p) => p.id === ID.primary).teacher_id = ID.teacher; } }), /^primary .*tilhører ikke owner/);
  await rejectsWith(world({ mutate: (s) => { s.profiles.find((p) => p.id === ID.student2).teacher_id = null; } }), /^student2 .*tilhører ikke teacher/);
  await rejectsWith(world({ mutate: (s) => { s.profiles.find((p) => p.id === ID.teacher).teacher_id = ID.owner; } }), /^teacher .*har selv en lærer/);
  // A real pupil attached to a test teacher: the run must not touch that classroom.
  await rejectsWith(world({ mutate: (s) => { s.profiles.push({ id: STRANGER, role: "student", teacher_id: ID.teacher }); } }), /^teacher .*skal have præcis én elev, student2 — har 2/);
  await rejectsWith(world({ mutate: (s) => { s.profiles.push({ id: STRANGER, role: "student", teacher_id: ID.owner }); } }), /^owner .*skal have præcis én elev, primary — har 2/);
});

test("A2: a slot-2 account set must carry slot-2 markers; slot-0 markers do not count", async () => {
  const ok = world({ slot: 2, env: slotEnv(2) });
  assert.equal((await verifyAccounts(ok.registry, ok.deps)).slot, 2);
  await rejectsWith(world({ slot: 0, env: slotEnv(2) }), /mangler markøren/);
});

test("A2: read errors fail closed — no verification, no record", async () => {
  const w = world();
  await assert.rejects(verifyAccounts(w.registry, { ...w.deps, listUsers: async () => ({ data: null, error: { message: "x" } }) }), /listUsers fejlede/);
  await assert.rejects(verifyAccounts(w.registry, { ...w.deps, listUsers: async () => ({ data: {}, error: null }) }), /ugyldigt svar/);
  await assert.rejects(verifyAccounts(w.registry, { ...w.deps, listUsers: async () => ({ data: { users: [{ id: "x", email: "y@skole.dk" }] }, error: null }) }), /ikke gennemløbet inden for 100 sider/);
  await assert.rejects(verifyAccounts(w.registry, { ...w.deps, selectProfilesByIds: async () => ({ data: null, error: { message: "x" } }) }), /profilerne kunne ikke læses/);
  await assert.rejects(verifyAccounts(w.registry, { ...w.deps, selectPupilsOfTeachers: async () => ({ data: null, error: null }) }), /lærernes elever kunne ikke læses/);
  await assert.rejects(verifyAccounts(null, w.deps), /registret mangler/);
});

test("A2: problem texts carry kinds and ids only — never an address", async () => {
  const w = world({ mutate: (s) => { for (const u of s.users) u.app_metadata = {}; } });
  await assert.rejects(verifyAccounts(w.registry, w.deps), (e) => {
    for (const a of Object.values(w.registry.accounts)) assert.ok(!e.message.toLowerCase().includes(a.email.toLowerCase()), "address leaked");
    assert.equal(e.problems.length, 4);
    return true;
  });
});

// ── The published record ──────────────────────────────────────────────────────────────────────
test("readVerified accepts exactly what publishVerified wrote, and refuses anything else", async () => {
  const w = world();
  const env = { ...SLOT0 };
  publishVerified(env, await verifyAccounts(w.registry, w.deps));
  const back = readVerified(env);
  assert.deepEqual(back.ids, ID);
  assert.equal(back.roles[ID.primary], "student");
  assert.ok(ACCOUNT_KINDS.every((k) => isUuid(back.ids[k])));

  const good = JSON.parse(env[VERIFIED_ENV]);
  const bad = [
    undefined, "", "{", "null", "[]",
    JSON.stringify({ ...good, v: 2 }),
    JSON.stringify({ ...good, slot: 1 }),
    JSON.stringify({ ...good, ids: { ...good.ids, owner: undefined } }),
    JSON.stringify({ ...good, ids: { ...good.ids, extra: STRANGER } }),
    JSON.stringify({ ...good, ids: { ...good.ids, owner: "x" } }),
    JSON.stringify({ ...good, ids: { ...good.ids, owner: good.ids.primary } }),
  ];
  for (const raw of bad) {
    assert.throws(() => readVerified({ ...SLOT0, [VERIFIED_ENV]: raw }), E2EAccountError, String(raw));
  }
  assert.throws(() => readVerified({ ...SLOT0, E2E_SLOT: "1", [VERIFIED_ENV]: env[VERIFIED_ENV] }), /gælder ikke slot 1/);
});
