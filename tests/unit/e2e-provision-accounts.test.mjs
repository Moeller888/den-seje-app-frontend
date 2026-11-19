// A4: tools/e2e/provision-accounts.mjs against an in-memory fake of the two Supabase APIs it uses
// (GoTrue admin users, PostgREST profiles). The fake sits BEHIND fetch, so every test also exercises the
// HTTP layer: the path allowlist, the GET-only dry-run, the request bodies and headers. No network.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  main, parseArgs, isAllowedRequest, makeRequester, confirmationFor, CREATE_ORDER, PROD_ENV, ISOLATED_ENV,
  ProvisionRefusedError, profileRow, applyPlan,
} from "../../tools/e2e/provision-accounts.mjs";
import { MARKER_KEY, ownerAddressFor, LAERLIG_DOMAIN, MAX_PAGES } from "../e2e-accounts.mjs";
import { EXPECTED_HOST, SECRET_PREFIX } from "../../.github/ci/e2e-prod-key-check.mjs";

const CLI = fileURLToPath(new URL("../../tools/e2e/provision-accounts.mjs", import.meta.url));
const KEY = `${SECRET_PREFIX}UNIT`; // fake: never a real key, too short for the hygiene matcher
const D = LAERLIG_DOMAIN;
const ADDR = { primary: `e2e-elev@${D}`, teacher: `e2e-laerer@${D}`, student2: `e2e-elev2@${D}` };
ADDR.owner = ownerAddressFor(ADDR.teacher, 0);

const prodEnv = (extra = {}) => ({
  GITHUB_ACTIONS: "true",
  E2E_PROD_ENVIRONMENT: "e2e-prod",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REF: "refs/heads/main",
  [PROD_ENV.url]: `https://${EXPECTED_HOST}`,
  [PROD_ENV.key]: KEY,
  [PROD_ENV.primary]: ADDR.primary,
  [PROD_ENV.teacher]: ADDR.teacher,
  [PROD_ENV.student2]: ADDR.student2,
  E2E_SLOT: "0",
  ...extra,
});
const APPLY = ["--mode=apply", `--confirm=${confirmationFor(0)}`];

let seq = 0;
const newId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
const marked = (slot, kind, extra = {}) => ({ [MARKER_KEY]: { v: 1, slot, kind }, ...extra });

// In-memory GoTrue + PostgREST. `opts` injects faults.
function fakeSupabase({ users = [], profiles = [], pageSize = null, failCreate = new Set(), failProfile = new Set(),
  dropProfiles = false, endlessPages = false, mangleCreate = null, raceCreate = null, raceProfile = null } = {}) {
  const state = {
    users: users.map((u) => structuredClone(u)),
    profiles: profiles.map((p) => structuredClone(p)),
    requests: [],
  };
  const reply = (status, body) => ({ status, text: async () => (body === undefined ? "" : JSON.stringify(body)) });
  const inList = (q, name) => {
    const m = new RegExp(`${name}=in\\.\\(([^)]*)\\)`).exec(q);
    return m ? m[1].split(",") : [];
  };
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const path = u.pathname + u.search;
    const body = init.body === undefined ? undefined : JSON.parse(init.body);
    state.requests.push({ method: init.method, path, body, headers: { ...init.headers }, redirect: init.redirect, origin: u.origin });
    if (init.method === "GET" && u.pathname === "/auth/v1/admin/users") {
      const page = Number(u.searchParams.get("page"));
      const per = pageSize ?? Number(u.searchParams.get("per_page"));
      if (endlessPages) return reply(200, { users: [{ id: newId(), email: `x${page}@example.org`, app_metadata: {} }] });
      return reply(200, { users: state.users.slice((page - 1) * per, page * per), aud: "authenticated" });
    }
    if (init.method === "GET" && u.pathname === "/rest/v1/profiles") {
      const q = decodeURIComponent(u.search);
      if (q.includes("select=id,role,teacher_id&id=in.")) {
        const ids = inList(q, "id");
        return reply(200, state.profiles.filter((p) => ids.includes(p.id)).map(({ id, role, teacher_id }) => ({ id, role, teacher_id })));
      }
      if (q.includes("select=id,teacher_id&teacher_id=in.")) {
        const ids = inList(q, "teacher_id");
        return reply(200, state.profiles.filter((p) => ids.includes(p.teacher_id)).map(({ id, teacher_id }) => ({ id, teacher_id })));
      }
      return reply(400, { message: "bad query" });
    }
    if (init.method === "POST" && u.pathname === "/auth/v1/admin/users") {
      if (failCreate.has(body.email)) return reply(500, { msg: "boom" });
      // A concurrent run creates the same account first (GoTrue keeps e-mail addresses unique).
      if (raceCreate === body.email) {
        raceCreate = null;
        state.users.push({ id: newId(), email: body.email, app_metadata: { ...body.app_metadata } });
      }
      if (state.users.some((x) => x.email.toLowerCase() === body.email.toLowerCase())) return reply(422, { error_code: "email_exists" });
      const user = { id: newId(), email: body.email, app_metadata: { provider: "email", providers: ["email"], ...body.app_metadata }, user_metadata: {} };
      state.users.push(user);
      return reply(200, mangleCreate ? mangleCreate(structuredClone(user)) : user);
    }
    if (init.method === "POST" && u.pathname === "/rest/v1/profiles") {
      const owner = state.users.find((x) => x.id === body.id);
      if (failProfile.has(owner?.email)) return reply(500, { message: "boom" });
      // A concurrent run inserts the same profile first (profiles.id is the primary key).
      if (raceProfile !== null && owner?.email === raceProfile) {
        raceProfile = null;
        state.profiles.push(structuredClone(body));
      }
      if (state.profiles.some((p) => p.id === body.id)) return reply(409, { code: "23505" });
      if (!owner) return reply(409, { code: "23503" });
      if (!dropProfiles) state.profiles.push(structuredClone(body));
      return reply(201);
    }
    return reply(404, { message: "not found" });
  };
  return { state, fetchImpl };
}

async function run(argv, env, fake) {
  const out = [];
  const res = await main(argv, env, { fetchImpl: fake.fetchImpl, log: (l) => out.push(l) });
  return { ...res, out: out.join("\n") };
}
const writes = (fake) => fake.state.requests.filter((r) => r.method !== "GET");
const userOf = (fake, kind) => fake.state.users.find((u) => u.email === ADDR[kind]);

// A fully provisioned slot 0, as apply leaves it.
function provisioned(slot = 0) {
  const ids = Object.fromEntries(CREATE_ORDER.map((k) => [k, newId()]));
  const users = CREATE_ORDER.map((k) => ({ id: ids[k], email: ADDR[k], app_metadata: marked(slot, k, { provider: "email" }) }));
  const profiles = CREATE_ORDER.map((k) => profileRow(k, ids, slot));
  return { ids, users, profiles };
}
const strangers = (n) => Array.from({ length: n }, (_, i) => ({ id: newId(), email: `fremmed${i}@example.org`, app_metadata: {} }));

// ── dry-run ────────────────────────────────────────────────────────────────────────────────────

test("dry-run on an empty user list: plans four creations and sends only GET", async () => {
  const fake = fakeSupabase();
  const r = await run([], prodEnv(), fake);
  assert.equal(r.exitCode, 0, r.out);
  for (const k of CREATE_ORDER) assert.match(r.out, new RegExp(`plan: ${k} — oprettes`));
  assert.deepEqual(writes(fake), []);
  assert.ok(fake.state.requests.every((q) => q.method === "GET" && q.redirect === "error"));
  assert.deepEqual(fake.state.users, []);
  assert.match(r.out, /dry-run: intet er skrevet/);
});

test("dry-run with an existing, paginated user list (accounts on page 3) sends only GET", async () => {
  const p = provisioned();
  const fake = fakeSupabase({ users: [...strangers(450), ...p.users], profiles: p.profiles });
  const r = await run(["--mode", "dry-run"], prodEnv(), fake);
  assert.equal(r.exitCode, 0, r.out);
  assert.match(r.out, /alle fire konti er klar/);
  assert.deepEqual(writes(fake), []);
  // 454 users at 200 per page: pages 1–3 hold users, page 4 is the first empty one (plan and verification each read it).
  const pages = new Set(fake.state.requests.filter((q) => q.path.startsWith("/auth/v1/admin/users?")).map((q) => q.path.match(/page=(\d+)/)[1]));
  assert.deepEqual([...pages].sort(), ["1", "2", "3", "4"], "reads up to and including the first empty page, never beyond");
});

test("dry-run with the server returning short pages still reads to an empty page", async () => {
  const p = provisioned();
  const fake = fakeSupabase({ users: [...strangers(30), ...p.users], profiles: p.profiles, pageSize: 7 });
  const r = await run([], prodEnv(), fake);
  assert.equal(r.exitCode, 0, r.out);
  assert.match(r.out, /alle fire konti er klar/);
});

test("a user list that never ends is refused, nothing written", async () => {
  const fake = fakeSupabase({ endlessPages: true });
  const r = await run(APPLY, prodEnv(), fake);
  assert.equal(r.exitCode, 1);
  assert.match(r.out, new RegExp(`inden for ${MAX_PAGES} sider`));
  assert.deepEqual(writes(fake), []);
});

// ── apply ──────────────────────────────────────────────────────────────────────────────────────

test("apply creates exactly the four accounts, in order, with the marker and no password", async () => {
  const fake = fakeSupabase({ users: strangers(5) });
  const r = await run(APPLY, prodEnv(), fake);
  assert.equal(r.exitCode, 0, r.out);
  const w = writes(fake);
  assert.deepEqual(w.map((q) => `${q.method} ${q.path}`), CREATE_ORDER.flatMap(() => ["POST /auth/v1/admin/users", "POST /rest/v1/profiles"]));
  CREATE_ORDER.forEach((kind, i) => {
    assert.deepEqual(w[2 * i].body, { email: ADDR[kind], email_confirm: true, app_metadata: { [MARKER_KEY]: { v: 1, slot: 0, kind } } });
    assert.deepEqual(Object.keys(w[2 * i + 1].body).sort(), ["active_theme", "equipped_slots", "full_name", "id", "role", "teacher_id"]);
    assert.equal(w[2 * i + 1].headers.Prefer, "return=minimal", "INSERT, never an upsert");
  });
  const id = (k) => userOf(fake, k).id;
  const prof = (k) => fake.state.profiles.find((p) => p.id === id(k));
  assert.deepEqual([prof("owner").role, prof("owner").teacher_id], ["teacher", null]);
  assert.deepEqual([prof("teacher").role, prof("teacher").teacher_id], ["teacher", null]);
  assert.deepEqual([prof("student2").role, prof("student2").teacher_id], ["student", id("teacher")]);
  assert.deepEqual([prof("primary").role, prof("primary").teacher_id], ["student", id("owner")]);
  assert.equal(fake.state.users.length, 9, "five strangers untouched, four new");
  for (const q of fake.state.requests) {
    assert.equal(q.origin, `https://${EXPECTED_HOST}`);
    assert.equal(q.headers.apikey, KEY);
    assert.ok(!JSON.stringify(q.body ?? {}).includes("password"));
  }
  assert.match(r.out, /apply: færdig — slot 0 verificeret/);
});

test("apply is idempotent: a second run writes nothing", async () => {
  const fake = fakeSupabase();
  assert.equal((await run(APPLY, prodEnv(), fake)).exitCode, 0);
  const before = writes(fake).length;
  const r = await run(APPLY, prodEnv(), fake);
  assert.equal(r.exitCode, 0, r.out);
  assert.equal(writes(fake).length, before);
  for (const k of CREATE_ORDER) assert.match(r.out, new RegExp(`${k}: genbruges uændret`));
});

test("partial creation: an interrupted profile insert is resumed without touching other accounts", async () => {
  const fake = fakeSupabase({ users: strangers(3), failProfile: new Set([ADDR.teacher]) });
  const first = await run(APPLY, prodEnv(), fake);
  assert.equal(first.exitCode, 1);
  assert.match(first.out, /teacher: profilen kunne ikke indsættes/);
  assert.equal(fake.state.users.length, 5, "owner and teacher exist, the pupils were not attempted");
  assert.ok(!fake.state.profiles.some((p) => p.id === userOf(fake, "teacher").id), "teacher is marked without a profile");

  const resumed = fakeSupabase({ users: fake.state.users, profiles: fake.state.profiles });
  const plan = await run([], prodEnv(), resumed);
  assert.equal(plan.exitCode, 0, plan.out);
  assert.match(plan.out, /plan: owner — findes markeret med korrekt profil/);
  assert.match(plan.out, /plan: teacher — findes markeret uden profil — profilen indsættes/);
  const second = await run(APPLY, prodEnv(), resumed);
  assert.equal(second.exitCode, 0, second.out);
  const w = writes(resumed).map((q) => `${q.method} ${q.path} ${q.body?.email ?? q.body?.id}`);
  assert.equal(w.filter((s) => s.includes("admin/users")).length, 2, "only student2 and primary are created");
  assert.ok(w[0].startsWith("POST /rest/v1/profiles " + userOf(resumed, "teacher").id), "teacher's profile first");
  assert.equal(resumed.state.users.length, 7);
});

test("partial creation: a failed createUser stops the run; the next run creates the rest", async () => {
  const fake = fakeSupabase({ failCreate: new Set([ADDR.student2]) });
  const first = await run(APPLY, prodEnv(), fake);
  assert.equal(first.exitCode, 1);
  assert.match(first.out, /student2: kontoen kunne ikke oprettes/);
  assert.equal(userOf(fake, "primary"), undefined, "nothing after the failure");
  const again = fakeSupabase({ users: fake.state.users, profiles: fake.state.profiles });
  assert.equal((await run(APPLY, prodEnv(), again)).exitCode, 0);
  assert.equal(again.state.users.length, 4);
});

test("concurrent runs: an account created by another run between plan and apply stops this run — no duplicate", async () => {
  const fake = fakeSupabase({ raceCreate: ADDR.teacher });
  const r = await run(APPLY, prodEnv(), fake);
  assert.equal(r.exitCode, 1);
  assert.match(r.out, /teacher: kontoen kunne ikke oprettes \(status 422\)/);
  assert.equal(fake.state.users.filter((u) => u.email === ADDR.teacher).length, 1, "exactly one teacher account");
  assert.equal(userOf(fake, "student2"), undefined, "nothing after the stop");
  assert.equal(userOf(fake, "primary"), undefined);
  // The next run sees the other run's (marked, profile-less) account and resumes it — still one of each.
  const next = fakeSupabase({ users: fake.state.users, profiles: fake.state.profiles });
  assert.equal((await run(APPLY, prodEnv(), next)).exitCode, 0);
  for (const k of CREATE_ORDER) assert.equal(next.state.users.filter((u) => u.email === ADDR[k]).length, 1, k);
  assert.equal(next.state.profiles.length, 4);
});

test("concurrent runs: a profile inserted by another run first stops this run — the profile is never overwritten", async () => {
  const fake = fakeSupabase({ raceProfile: ADDR.owner });
  const r = await run(APPLY, prodEnv(), fake);
  assert.equal(r.exitCode, 1);
  assert.match(r.out, /owner: profilen kunne ikke indsættes \(status 409\)/);
  assert.equal(fake.state.profiles.length, 1);
  assert.equal(fake.state.users.length, 1, "no further account after the stop");
});

test("a created account that does not come back marked stops before its profile", async () => {
  const fake = fakeSupabase({ mangleCreate: (u) => ({ ...u, app_metadata: { provider: "email" } }) });
  const r = await run(APPLY, prodEnv(), fake);
  assert.equal(r.exitCode, 1);
  assert.match(r.out, /owner: svaret på oprettelsen er ikke den forventede markerede konto/);
  assert.deepEqual(writes(fake).map((q) => q.path), ["/auth/v1/admin/users"]);
});

test("the final verification fails when the server silently drops the profiles", async () => {
  const fake = fakeSupabase({ dropProfiles: true });
  const r = await run(APPLY, prodEnv(), fake);
  assert.equal(r.exitCode, 1);
  assert.match(r.out, /har ingen profil/);
});

test("slot 1 derives every address, the owner included", async () => {
  const fake = fakeSupabase();
  const r = await run(["--mode=apply", `--confirm=${confirmationFor(1)}`], prodEnv({ E2E_SLOT: "1" }), fake);
  assert.equal(r.exitCode, 0, r.out);
  const emails = fake.state.users.map((u) => u.email).sort();
  assert.deepEqual(emails, [
    `e2e-elev+e2e-slot-1@${D}`, `e2e-elev2+e2e-slot-1@${D}`, `e2e-laerer+e2e-slot-1-owner@${D}`, `e2e-laerer+e2e-slot-1@${D}`,
  ].sort());
  for (const u of fake.state.users) assert.equal(u.app_metadata[MARKER_KEY].slot, 1);
});

// ── refusals: nothing is ever written ──────────────────────────────────────────────────────────

async function refused(users, profiles, reason, env = prodEnv()) {
  const fake = fakeSupabase({ users, profiles });
  const before = structuredClone(fake.state);
  const r = await run(APPLY, env, fake);
  assert.equal(r.exitCode, 1, r.out);
  assert.match(r.out, reason);
  assert.match(r.out, /plan: AFVIST — intet oprettes eller ændres|intet ændres/);
  assert.deepEqual(writes(fake), [], "not a single write");
  assert.deepEqual(fake.state.users, before.users);
  assert.deepEqual(fake.state.profiles, before.profiles);
  return r;
}

test("an existing UNMARKED account at a configured address is never adopted", async () => {
  const foreignId = newId();
  const r = await refused([{ id: foreignId, email: ADDR.teacher, app_metadata: { provider: "email" } }], [], /teacher: adressen findes allerede UDEN markør/);
  assert.ok(!r.out.includes(foreignId), "the id of an account that is not ours is never logged");
  await refused([{ id: newId(), email: ADDR.primary.toUpperCase(), app_metadata: {} }], [], /primary: adressen findes allerede UDEN markør/);
});

test("a wrong marker (slot, kind, version, extra key) is refused", async () => {
  const cases = [
    { [MARKER_KEY]: { v: 1, slot: 1, kind: "teacher" } },
    { [MARKER_KEY]: { v: 1, slot: 0, kind: "owner" } },
    { [MARKER_KEY]: { v: 2, slot: 0, kind: "teacher" } },
    { [MARKER_KEY]: { v: 1, slot: 0, kind: "teacher", extra: true } },
    { [MARKER_KEY]: "teacher" },
    { [MARKER_KEY]: null },
  ];
  for (const meta of cases) await refused([{ id: newId(), email: ADDR.teacher, app_metadata: meta }], [], /teacher: adressen findes allerede med en anden markør/);
});

test("an account marked as this slot's kind at ANOTHER address is refused", async () => {
  await refused([{ id: newId(), email: `andet@${D}`, app_metadata: marked(0, "owner") }], [], /markeret som slot 0s owner, men har ikke den konfigurerede adresse/);
});

test("an address on two accounts is refused", async () => {
  await refused([
    { id: newId(), email: ADDR.student2, app_metadata: marked(0, "student2") },
    { id: newId(), email: ADDR.student2.toUpperCase(), app_metadata: marked(0, "student2") },
  ], [], /student2: adressen findes på mere end én konto/);
});

test("a marked account with an unexpected role or relation is refused (no repair here)", async () => {
  const mutate = (fn) => { const p = provisioned(); fn(p); return p; };
  const cases = [
    [mutate((p) => { p.profiles.find((x) => x.id === p.ids.teacher).role = "student"; }), /teacher .*har rollen "student"/],
    [mutate((p) => { p.profiles.find((x) => x.id === p.ids.primary).role = "super_admin"; }), /primary .*har rollen "super_admin"/],
    [mutate((p) => { p.profiles.find((x) => x.id === p.ids.owner).teacher_id = p.ids.teacher; }), /owner .*har selv en lærer/],
    [mutate((p) => { p.profiles.find((x) => x.id === p.ids.student2).teacher_id = p.ids.owner; }), /student2 .*tilhører ikke teacher/],
    [mutate((p) => { p.profiles.find((x) => x.id === p.ids.primary).teacher_id = null; }), /primary .*tilhører ikke owner/],
  ];
  for (const [p, reason] of cases) await refused(p.users, p.profiles, reason);
});

test("a marked teacher with a foreign pupil is refused", async () => {
  const p = provisioned();
  const stranger = { id: newId(), email: "fremmed@example.org", app_metadata: {} };
  await refused([...p.users, stranger], [...p.profiles, { id: stranger.id, role: "student", teacher_id: p.ids.teacher }],
    /teacher .*har 1 elev\(er\), der ikke er slottens student2/);
});

test("a marked pupil whose teacher would be NEW cannot already have a profile", async () => {
  const id = newId();
  await refused([{ id, email: ADDR.primary, app_metadata: marked(0, "primary") }], [{ id, role: "student", teacher_id: null }],
    /primary .*tilhører ikke owner/);
});

test("applyPlan itself refuses a plan with problems, an incomplete plan or one for another slot — the writer is never called", async () => {
  let calls = 0;
  const writer = { createMarkedUser: async () => { calls++; return { user: null, error: { status: 0 } }; }, insertProfile: async () => { calls++; return { error: null }; } };
  const registry = { slot: 0, accounts: Object.fromEntries(CREATE_ORDER.map((k) => [k, { kind: k, email: ADDR[k] }])) };
  const steps = CREATE_ORDER.map((kind) => ({ kind, action: "create", id: null }));
  for (const plan of [
    null,
    { slot: 0, steps, problems: ["x"] },
    { slot: 0, steps: steps.slice(1), problems: [] },
    { slot: 1, steps, problems: [] },
  ]) {
    await assert.rejects(applyPlan(plan, registry, writer, {}), ProvisionRefusedError);
  }
  assert.equal(calls, 0);
});

// ── configuration and context: stopped before the first network call ────────────────────────────

async function stoppedBeforeNetwork(argv, env, reason) {
  let called = 0;
  const out = [];
  const res = await main(argv, env, { fetchImpl: async () => { called++; throw new Error("no network in this test"); }, log: (l) => out.push(l) });
  assert.equal(res.exitCode, 2, out.join("\n"));
  assert.equal(called, 0, "no request at all");
  assert.match(out.join("\n"), reason);
}

test("missing or invalid configuration stops before any request", async () => {
  for (const name of [PROD_ENV.primary, PROD_ENV.teacher, PROD_ENV.student2]) {
    await stoppedBeforeNetwork([], prodEnv({ [name]: undefined }), /kunne ikke udledes|mangler/);
    await stoppedBeforeNetwork([], prodEnv({ [name]: "" }), /mangler/);
  }
  await stoppedBeforeNetwork([], prodEnv({ [PROD_ENV.key]: undefined }), /E2E_PROD_SUPABASE_SERVICE_ROLE_KEY mangler/);
  await stoppedBeforeNetwork([], prodEnv({ [PROD_ENV.key]: `${KEY} ` }), /mellemrum/);
  await stoppedBeforeNetwork([], prodEnv({ [PROD_ENV.key]: "eyJhbGciOi.not.a-secret-key" }), /har ikke formatet/);
  for (const url of [undefined, "", "http://" + EXPECTED_HOST, "https://other-project.supabase.co", `https://${EXPECTED_HOST}/rest`,
    `https://${EXPECTED_HOST}:8443`, `https://user:pw@${EXPECTED_HOST}`, ` https://${EXPECTED_HOST}`, "http://127.0.0.1:54321"]) {
    await stoppedBeforeNetwork([], prodEnv({ [PROD_ENV.url]: url }), /er ikke præcis https:/);
  }
  await stoppedBeforeNetwork([], prodEnv({ E2E_SLOT: "4" }), /kunne ikke udledes|E2E_SLOT/);
});

test("addresses must be distinct and on the Lærlig domain", async () => {
  await stoppedBeforeNetwork([], prodEnv({ [PROD_ENV.student2]: ADDR.teacher }), /har samme adresse/);
  await stoppedBeforeNetwork([], prodEnv({ [PROD_ENV.student2]: ADDR.primary.toUpperCase() }), /har samme adresse/);
  await stoppedBeforeNetwork([], prodEnv({ [PROD_ENV.teacher]: "teacher-test@hotmail.com" }), /er ikke på det tilladte domæne/);
  await stoppedBeforeNetwork([], prodEnv({ [PROD_ENV.primary]: "x@e2e.invalid" }), /er ikke på det tilladte domæne/);
});

test("production is reachable only from the manually dispatched e2e-prod job on main — dry-run included", async () => {
  for (const [extra, reason] of [
    [{ GITHUB_ACTIONS: undefined }, /kun fra GitHub Actions/],
    [{ E2E_PROD_ENVIRONMENT: undefined }, /kører ikke i environmentet e2e-prod/],
    [{ E2E_PROD_ENVIRONMENT: "Production" }, /kører ikke i environmentet e2e-prod/],
    [{ GITHUB_EVENT_NAME: "push" }, /workflow_dispatch/],
    [{ GITHUB_EVENT_NAME: "pull_request" }, /workflow_dispatch/],
    [{ GITHUB_EVENT_NAME: "schedule" }, /workflow_dispatch/],
    [{ GITHUB_REF: "refs/heads/ops/x" }, /kun fra branchen main/],
    [{ GITHUB_REF: "refs/pull/1/merge" }, /kun fra branchen main/],
  ]) {
    await stoppedBeforeNetwork([], prodEnv(extra), reason);
    await stoppedBeforeNetwork(APPLY, prodEnv(extra), reason);
  }
});

test("--mode=apply needs the exact confirmation for this slot", async () => {
  for (const argv of [["--mode=apply"], ["--mode=apply", "--confirm="], ["--mode=apply", `--confirm=${confirmationFor(1)}`],
    ["--mode=apply", `--confirm=${confirmationFor(0)} `], ["--mode=apply", "--confirm=PROVISION-ACCOUNTS-SLOT-0"]]) {
    await stoppedBeforeNetwork(argv, prodEnv(), /kræver --confirm=provision-accounts-slot-0/);
  }
  await stoppedBeforeNetwork(["--mode=apply", `--confirm=${confirmationFor(0)}`], prodEnv({ E2E_SLOT: "2" }), /provision-accounts-slot-2/);
});

test("arguments: unknown, duplicated or invalid are refused", async () => {
  assert.deepEqual({ ...parseArgs([]) }, { mode: "dry-run", confirm: "" });
  assert.deepEqual({ ...parseArgs(["--mode", "apply", "--confirm", "x"]) }, { mode: "apply", confirm: "x" });
  for (const argv of [["--apply"], ["--mode=write"], ["--mode="], ["--mode=apply", "--mode=dry-run"], ["--confirm"], ["x"], ["--force"]]) {
    await stoppedBeforeNetwork(argv, prodEnv(), /ukendt argument|--mode|--confirm/);
  }
});

test("the isolated target needs ISOLATED_SUITE=1, a loopback URL, synthetic addresses and no production variables", async () => {
  const iso = (extra = {}) => ({
    ISOLATED_SUITE: "1", [ISOLATED_ENV.url]: "http://127.0.0.1:54321", [ISOLATED_ENV.key]: "local-test-key",
    [ISOLATED_ENV.primary]: "a@e2e.invalid", [ISOLATED_ENV.teacher]: "b@e2e.invalid", [ISOLATED_ENV.student2]: "c@e2e.invalid", ...extra,
  });
  const fake = fakeSupabase();
  const r = await run(["--mode=apply", `--confirm=${confirmationFor(0)}`], iso(), fake);
  assert.equal(r.exitCode, 0, r.out);
  assert.ok(fake.state.requests.every((q) => q.origin === "http://127.0.0.1:54321"));
  await stoppedBeforeNetwork([], iso({ [ISOLATED_ENV.url]: `https://${EXPECTED_HOST}` }), /ISOLATED_SUPABASE_URL skal være en loopback-URL/);
  // Loopback, but with credentials in the URL: the registry's own loopback rule would let it through.
  await stoppedBeforeNetwork([], iso({ [ISOLATED_ENV.url]: "http://user:pw@127.0.0.1:54321" }), /ISOLATED_SUPABASE_URL skal være en loopback-URL/);
  await stoppedBeforeNetwork([], iso({ [PROD_ENV.key]: KEY }), /må ikke kombineres med E2E_PROD_/);
  await stoppedBeforeNetwork([], iso({ [ISOLATED_ENV.teacher]: `b@${D}` }), /er ikke på det tilladte domæne e2e\.invalid/);
  await stoppedBeforeNetwork([], iso({ ISOLATED_SUITE: "true" }), /kun fra GitHub Actions|er ikke præcis/);
});

// ── the HTTP layer ─────────────────────────────────────────────────────────────────────────────

test("the request allowlist: GET only on the three read shapes, POST only on the two write paths and only in apply", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const reads = ["/auth/v1/admin/users?page=1&per_page=200", `/rest/v1/profiles?select=id,role,teacher_id&id=in.(${id})`,
    `/rest/v1/profiles?select=id,teacher_id&teacher_id=in.(${id},${id})`];
  for (const p of reads) { assert.ok(isAllowedRequest("GET", p, false), p); assert.ok(!isAllowedRequest("POST", p, true), p); }
  for (const p of ["/auth/v1/admin/users", "/rest/v1/profiles"]) {
    assert.ok(isAllowedRequest("POST", p, true));
    assert.ok(!isAllowedRequest("POST", p, false), "no write in dry-run");
    for (const m of ["PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) assert.ok(!isAllowedRequest(m, p, true), `${m} ${p}`);
  }
  for (const p of [`/auth/v1/admin/users/${id}`, "/auth/v1/admin/users?page=1&per_page=200&filter=x", "/rest/v1/profiles?select=*",
    `/rest/v1/profiles?select=id,role,teacher_id&id=in.(${id})&or=(x)`, "/auth/v1/admin/generate_link", "/auth/v1/invite",
    "/rest/v1/rpc/anything", "/rest/v1/user_items", `/rest/v1/profiles?id=eq.${id}`]) {
    assert.ok(!isAllowedRequest("GET", p, true), p);
    assert.ok(!isAllowedRequest("POST", p, true), p);
    assert.ok(!isAllowedRequest("DELETE", p, true), p);
  }
});

test("a refused request never reaches fetch", async () => {
  let called = 0;
  const request = makeRequester({ url: `https://${EXPECTED_HOST}`, key: KEY, fetchImpl: async () => { called++; }, allowWrites: false });
  await assert.rejects(request("POST", "/auth/v1/admin/users", {}), ProvisionRefusedError);
  await assert.rejects(request("DELETE", "/auth/v1/admin/users", undefined), ProvisionRefusedError);
  await assert.rejects(request("GET", "/rest/v1/profiles?select=*", undefined), ProvisionRefusedError);
  assert.equal(called, 0);
});

test("no address, key or server body is ever logged", async () => {
  const out = [];
  const log = (l) => out.push(l);
  const p = provisioned();
  await main(APPLY, prodEnv(), { fetchImpl: fakeSupabase().fetchImpl, log });
  await main(APPLY, prodEnv(), { fetchImpl: fakeSupabase({ users: [{ id: newId(), email: ADDR.teacher, app_metadata: {} }] }).fetchImpl, log });
  await main(APPLY, prodEnv(), { fetchImpl: fakeSupabase({ failCreate: new Set([ADDR.primary]) }).fetchImpl, log });
  await main([], prodEnv(), { fetchImpl: fakeSupabase({ users: p.users, profiles: p.profiles }).fetchImpl, log });
  await main([], prodEnv({ [PROD_ENV.teacher]: "teacher-test@hotmail.com" }), { fetchImpl: async () => { throw new Error(); }, log });
  const text = out.join("\n");
  assert.ok(out.length > 20);
  for (const s of [...Object.values(ADDR), "hotmail", KEY, "boom", "email_exists", "e2e-elev", "e2e-laerer"]) {
    assert.ok(!text.toLowerCase().includes(s.toLowerCase()), `logged: ${s}`);
  }
});

test("CLI: the real entry point stops before the network without the e2e-prod context", () => {
  const base = { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "" };
  // No URL and no key at all: even a bug past the context check has nowhere to send a request.
  for (const extra of [{}, { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "pull_request", GITHUB_REF: "refs/heads/main" },
    { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/main", E2E_PROD_ENVIRONMENT: "e2e-prod" }]) {
    const r = spawnSync(process.execPath, [CLI, "--mode=apply", `--confirm=${confirmationFor(0)}`], { env: { ...base, ...extra }, encoding: "utf8" });
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stdout, /::error::provision:/);
  }
});
