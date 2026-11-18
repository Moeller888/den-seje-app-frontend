// A3: the guarded service-role client (tests/e2e-guard.mjs), driven with a fake supabase-js client
// that records everything that would have been SENT. No network, no production call.
//
// The core property: a refused operation sends NOTHING — not even its first half — and an
// unmarked/unknown account can never be the target of a write.
import test from "node:test";
import assert from "node:assert/strict";
import { E2EGuardError, guardAdminClient, OWNER_COLUMN } from "../e2e-guard.mjs";
import { ACCOUNT_KINDS, EXPECTED_ROLE } from "../e2e-accounts.mjs";

const ID = Object.freeze({
  primary: "11111111-1111-4111-8111-111111111111",
  teacher: "22222222-2222-4222-8222-222222222222",
  student2: "33333333-3333-4333-8333-333333333333",
  owner: "44444444-4444-4444-8444-444444444444",
});
const STRANGER = "55555555-5555-4555-8555-555555555555"; // a real pupil: unmarked, never verified
const VERIFIED = Object.freeze({
  v: 1, slot: 0, ids: ID,
  roles: Object.fromEntries(ACCOUNT_KINDS.map((k) => [ID[k], EXPECTED_ROLE[k]])),
});
// A throw-away stand-in for a password value (never a literal assigned to a credential name).
const pw = (tag) => ["guard", "test", tag, "value"].join("-");

function fakeRaw() {
  const sent = [];
  const builder = (entry) => {
    const b = {};
    for (const m of ["eq", "in", "match", "select", "single", "maybeSingle", "neq", "gt", "or", "not", "filter", "limit", "order", "like"]) {
      b[m] = (...args) => { entry.chain.push([m, args]); return b; };
    }
    b.then = (ok, ko) => { sent.push(entry); return Promise.resolve({ data: null, error: null }).then(ok, ko); };
    return b;
  };
  const raw = {
    from: (table) => ({
      select: (...args) => builder({ table, op: "select", args, chain: [] }),
      insert: (...args) => builder({ table, op: "insert", args, chain: [] }),
      upsert: (...args) => builder({ table, op: "upsert", args, chain: [] }),
      update: (...args) => builder({ table, op: "update", args, chain: [] }),
      delete: (...args) => builder({ table, op: "delete", args, chain: [] }),
    }),
    rpc: () => { sent.push({ op: "rpc" }); },
    storage: {},
    functions: {},
    auth: {
      admin: Object.fromEntries(["listUsers", "getUserById", "updateUserById", "createUser", "deleteUser", "inviteUserByEmail", "generateLink"]
        .map((m) => [m, async (...args) => { sent.push({ op: "auth." + m, args }); return { data: null, error: null }; }])),
      signInWithPassword: async () => { sent.push({ op: "auth.signIn" }); },
    },
  };
  return { raw, sent };
}

const open = (confirm = async () => {}) => {
  const f = fakeRaw();
  return { ...f, admin: guardAdminClient(f.raw, VERIFIED, { confirm }) };
};
const refused = async (fn, pattern) => {
  const { admin, sent } = open();
  await assert.rejects(async () => { await fn(admin); }, (e) => {
    assert.ok(e instanceof E2EGuardError, String(e));
    if (pattern) assert.match(e.message, pattern);
    return true;
  });
  assert.deepEqual(sent, [], "a refused operation sends nothing");
};

// ── Allowed shapes (what the suite actually does) ────────────────────────────────────────────
test("allowed: owner-keyed update/delete/insert on reviewed tables, replayed exactly", async () => {
  const { admin, sent } = open();
  await admin.from("profiles").update({ selected_grade: 9, active_domains: null }).eq("id", ID.primary);
  await admin.from("question_instances").delete().eq("student_id", ID.student2);
  await admin.from("student_quest_progress").delete().eq("student_id", ID.primary).eq("quest_id", "q1").eq("quest_date", "2026-11-17");
  await admin.from("user_items").insert({ user_id: ID.primary, item_id: "aura-gold" });
  await admin.from("question_instances").insert([{ student_id: ID.student2, question_id: "q" }, { student_id: ID.student2, question_id: "r" }]);
  await admin.from("password_help_requests").insert({ student_id: ID.primary, teacher_id: ID.owner, status: "notified" });
  await admin.from("profiles").update({ teacher_id: null }).eq("id", ID.primary);
  await admin.from("profiles").update({ teacher_id: ID.owner }).eq("id", ID.primary);
  await admin.from("profiles").update({ role: "student", placement_band: 2 }).eq("id", ID.primary);
  await admin.from("user_achievements").delete().in("student_id", [ID.primary, ID.student2]);
  await admin.from("daily_login_rewards").delete().match({ student_id: ID.primary });
  await admin.from("profiles").update({ current_band: null }).eq("id", ID.primary).select("id").maybeSingle();
  await admin.from("student_progress").upsert({ student_id: ID.primary, correct_answers: 1 }, { onConflict: "student_id" });
  assert.equal(sent.length, 13);
  assert.deepEqual(sent[2].chain, [["eq", ["student_id", ID.primary]], ["eq", ["quest_id", "q1"]], ["eq", ["quest_date", "2026-11-17"]]]);
  assert.deepEqual(sent[11].chain.map((c) => c[0]), ["eq", "select", "maybeSingle"]);
});

test("allowed: reads pass through on any table; password change on the three accounts with one", async () => {
  const { admin, sent } = open();
  await admin.from("questions").select("id").eq("is_active", true).limit(5);
  await admin.from("teacher_password_resets").select("*").eq("student_id", ID.student2).order("reset_at");
  await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  await admin.auth.admin.getUserById(ID.primary);
  for (const k of ["primary", "teacher", "student2"]) await admin.auth.admin.updateUserById(ID[k], { password: pw(k) });
  assert.deepEqual(sent.map((s) => s.op), ["select", "select", "auth.listUsers", "auth.getUserById", "auth.updateUserById", "auth.updateUserById", "auth.updateUserById"]);
  assert.deepEqual(sent.at(-1).args, [ID.student2, { password: pw("student2") }]);
});

// ── A3: blocked ───────────────────────────────────────────────────────────────────────────────
test("blocked: unfiltered UPDATE/DELETE", async () => {
  await refused((a) => a.from("profiles").update({ selected_grade: 9 }), /uden filter på ejerkolonnen id/);
  await refused((a) => a.from("question_instances").delete(), /uden filter på ejerkolonnen student_id/);
  await refused((a) => a.from("user_items").delete().select(), /uden filter/);
});

test("blocked: a filter that is not on the owner column (broad filter)", async () => {
  await refused((a) => a.from("question_instances").delete().eq("question_id", "q1"), /uden filter på ejerkolonnen/);
  await refused((a) => a.from("profiles").update({ selected_grade: 9 }).eq("teacher_id", ID.owner), /uden filter på ejerkolonnen id/);
  await refused((a) => a.from("profiles").update({ selected_grade: 9 }).eq("role", "student"), /uden filter/);
  await refused((a) => a.from("profiles").update({ x: 1 }).match({ role: "student" }), /uden filter/);
});

test("blocked: broad filter methods are refused at once, even next to an owner filter", async () => {
  for (const m of ["neq", "gt", "gte", "lt", "like", "ilike", "or", "not", "filter", "is", "contains", "order", "limit", "range", "csv", "abortSignal"]) {
    await refused((a) => a.from("question_instances").delete().eq("student_id", ID.primary)[m]("x", "y"), new RegExp(`\\.${m}\\(\\) er ikke tilladt`));
  }
  await refused((a) => a.from("user_items").insert({ user_id: ID.primary, item_id: "x" }).eq("user_id", ID.primary), /\.eq\(\) er ikke tilladt/);
});

test("blocked: unknown user ids — a stranger, the owner column changed, a mixed list", async () => {
  await refused((a) => a.from("profiles").update({ selected_grade: 9 }).eq("id", STRANGER), /ikke en verificeret testkonto/);
  await refused((a) => a.from("question_instances").delete().in("student_id", [ID.primary, STRANGER]), /ikke en verificeret testkonto/);
  await refused((a) => a.from("question_instances").delete().eq("student_id", ID.primary).eq("student_id", STRANGER), /ikke en verificeret/);
  await refused((a) => a.from("daily_login_rewards").delete().match({ student_id: STRANGER }), /student_id er ikke en verificeret testkonto/);
  await refused((a) => a.from("profiles").update({ placement_band: 2 }).match({ id: STRANGER, role: "student" }), /id er ikke en verificeret testkonto/);
  await refused((a) => a.from("user_items").delete().eq("user_id", ID.primary).match({ user_id: STRANGER }), /user_id er ikke en verificeret testkonto/);
  await refused((a) => a.from("user_items").insert({ user_id: STRANGER, item_id: "x" }), /user_id skal være en verificeret testkonto/);
  await refused((a) => a.from("user_items").insert([{ user_id: ID.primary, item_id: "x" }, { user_id: STRANGER, item_id: "y" }]), /verificeret/);
  await refused((a) => a.from("profiles").update({ id: STRANGER }).eq("id", ID.primary), /ejerkolonnen id må ikke ændres/);
  await refused((a) => a.from("question_instances").update({ student_id: ID.student2 }).eq("student_id", ID.primary), /ejerkolonnen student_id må ikke ændres/);
});

test("blocked: invalid UUIDs and empty lists", async () => {
  for (const bad of ["", "1", "not-a-uuid", ID.primary.toUpperCase() + "x", null, undefined, 7, {}, ["x"]]) {
    await refused((a) => a.from("profiles").update({ selected_grade: 9 }).eq("id", bad), /gyldigt UUID|filterkolonne|verificeret/);
  }
  // The refusal names the actual problem (fail loud and clear): a malformed id, not "unknown".
  for (const bad of ["not-a-uuid", "", "11111111-1111-4111-8111-11111111111", ID.primary + " "]) {
    await refused((a) => a.from("profiles").update({ selected_grade: 9 }).eq("id", bad), /profiles\.update: id er ikke et gyldigt UUID/);
    await refused((a) => a.from("user_items").delete().match({ user_id: bad }), /user_items\.delete: user_id er ikke et gyldigt UUID/);
  }
  await refused((a) => a.from("question_instances").delete().in("student_id", []), /ikke-tom liste/);
  await refused((a) => a.from("question_instances").delete().in("student_id", "x"), /ikke-tom liste/);
  await refused((a) => a.from("question_instances").delete().eq(undefined, ID.primary), /filterkolonne/);
});

test("blocked: unreviewed tables, and profiles may only be updated", async () => {
  for (const t of ["questions", "shop_items", "teacher_password_resets", "student_answers", "auth.users", "profiles ", "PROFILES", "", "__proto__", "constructor"]) {
    await refused((a) => a.from(t).delete().eq("id", ID.primary), /ikke gennemgået/);
  }
  await refused((a) => a.from("profiles").delete().eq("id", ID.primary), /profiles\.delete: tabellen må kun opdateres/);
  await refused((a) => a.from("profiles").insert({ id: ID.primary, role: "student" }), /profiles\.insert: tabellen må kun opdateres/);
  await refused((a) => a.from("profiles").upsert({ id: ID.primary, role: "student" }, { onConflict: "id" }), /profiles\.upsert: tabellen må kun opdateres/);
  await refused((a) => a.from("user_items").rpc("x"), /er ikke tilladt/);
});

test("blocked: INSERT/UPSERT shapes", async () => {
  await refused((a) => a.from("user_items").insert([]), /ingen rækker/);
  await refused((a) => a.from("user_items").insert("x"), /ét objekt/);
  await refused((a) => a.from("user_items").insert(null), /ét objekt/);
  await refused((a) => a.from("user_items").insert({ item_id: "x" }), /user_id skal være/);
  await refused((a) => a.from("student_progress").upsert({ student_id: ID.primary, correct_answers: 1 }), /onConflict skal omfatte ejerkolonnen student_id/);
  await refused((a) => a.from("student_progress").upsert({ student_id: ID.primary }, { onConflict: "id" }), /onConflict/);
  await refused((a) => a.from("user_items").insert({ user_id: ID.primary, item_id: "x" }, "bad"), /ugyldige indstillinger/);
});

test("blocked: values pointing at other accounts, or changing a role", async () => {
  await refused((a) => a.from("profiles").update({ teacher_id: STRANGER }).eq("id", ID.primary), /teacher_id: må kun pege på en verificeret/);
  await refused((a) => a.from("profiles").update({ teacher_id: ID.student2 }).eq("id", ID.primary), /skal være en verificeret testlærer/);
  await refused((a) => a.from("password_help_requests").insert({ student_id: ID.primary, teacher_id: STRANGER }), /teacher_id/);
  await refused((a) => a.from("question_instances").insert({ student_id: ID.primary, user_id: STRANGER }), /user_id: må kun pege/);
  for (const [kind, role] of [["primary", "teacher"], ["primary", "super_admin"], ["student2", "teacher"], ["teacher", "super_admin"], ["teacher", "student"], ["owner", null]]) {
    await refused((a) => a.from("profiles").update({ role }).eq("id", ID[kind]), /profiles\.role: .* kan kun have rollen/);
  }
  await refused((a) => a.from("profiles").update({ role: "student" }).in("id", [ID.primary, ID.teacher]), /teacher kan kun have rollen "teacher"/);
  await refused((a) => a.from("user_items").update({ role: "student" }).eq("user_id", ID.primary), /kolonnen role kan ikke skrives/);
  await refused((a) => a.from("profiles").update("x").eq("id", ID.primary), /ét objekt/);
  await refused((a) => a.from("profiles").update([{ a: 1 }]).eq("id", ID.primary), /ét objekt/);
});

test("blocked: every Auth-admin write except a password change on a verified pupil/teacher", async () => {
  for (const m of ["createUser", "deleteUser", "inviteUserByEmail", "generateLink", "signOut", "mfa", "updateUserByIdX"]) {
    await refused((a) => a.auth.admin[m]({ email: "x@skole.dk" }), /er ikke tilladt/);
  }
  await refused((a) => a.auth.admin.updateUserById(STRANGER, { password: pw("x") }), /kun verificerede testkonti/);
  await refused((a) => a.auth.admin.updateUserById(ID.owner, { password: pw("x") }), /owner har ingen adgangskode/);
  for (const attrs of [{ email: "x@skole.dk" }, { password: pw("x"), app_metadata: {} }, { password: pw("x"), email_confirm: true }, { password: "" }, { password: 1 }, null, "x", { user_metadata: { role: "teacher" } }]) {
    await refused((a) => a.auth.admin.updateUserById(ID.primary, attrs), /kun \{ password \}/);
  }
  for (const p of ["signInWithPassword", "signUp", "updateUser", "getSession"]) {
    await refused((a) => a.auth[p]({}), new RegExp(`auth\\.${p} er ikke tilladt`));
  }
});

test("blocked: everything outside from()/auth.admin — rpc, functions, storage, schema, channel, rest, headers", async () => {
  for (const p of ["rpc", "functions", "storage", "schema", "channel", "removeChannel", "realtime", "rest", "headers", "supabaseKey", "supabaseUrl", "auth2"]) {
    await refused((a) => a[p], new RegExp(`\\.${p} er ikke tilladt`));
  }
  const { admin } = open();
  assert.equal(admin.then, undefined, "awaiting the client itself is harmless");
  assert.equal(await admin, admin);
});

// ── Bypass attempts ───────────────────────────────────────────────────────────────────────────
test("bypass: the guard cannot exist without a client, a valid verified record and a confirm()", () => {
  const { raw } = fakeRaw();
  assert.throws(() => guardAdminClient(null, VERIFIED, { confirm: async () => {} }), E2EGuardError);
  assert.throws(() => guardAdminClient({ from: () => {} }, VERIFIED, { confirm: async () => {} }), /ingen gyldig klient/);
  assert.throws(() => guardAdminClient(raw, VERIFIED), /confirm mangler/);
  for (const bad of [null, {}, { ids: ID }, { ids: { ...ID, owner: "x" }, roles: {} }, { ids: { ...ID, owner: ID.primary }, roles: {} }]) {
    assert.throws(() => guardAdminClient(raw, bad, { confirm: async () => {} }), E2EGuardError, JSON.stringify(bad));
  }
});

test("bypass: a forged record — confirm() rejects, so NO write is ever sent (and none later)", async () => {
  let confirms = 0;
  const { admin, sent } = open(async () => { confirms++; throw new Error("E2E_VERIFIED_ACCOUNTS svarer ikke til de markerede konti"); });
  await assert.rejects(admin.from("profiles").update({ selected_grade: 1 }).eq("id", ID.primary), /svarer ikke/);
  await assert.rejects(admin.from("user_items").insert({ user_id: ID.primary, item_id: "x" }), /svarer ikke/);
  await assert.rejects(admin.auth.admin.updateUserById(ID.primary, { password: pw("x") }), /svarer ikke/);
  assert.deepEqual(sent, []);
  assert.equal(confirms, 1, "confirmed once (memoised), and a failure stays a failure");
  await admin.from("questions").select("id"); // reads are unaffected
  assert.equal(sent.length, 1);
});

test("bypass: confirm() runs before the first write is sent, once", async () => {
  const order = [];
  const f = fakeRaw();
  const admin = guardAdminClient(f.raw, VERIFIED, { confirm: async () => { order.push("confirm:" + f.sent.length); } });
  await admin.from("profiles").update({ selected_grade: 9 }).eq("id", ID.primary);
  await admin.from("profiles").update({ selected_grade: 8 }).eq("id", ID.primary);
  assert.deepEqual(order, ["confirm:0"]);
  assert.equal(f.sent.length, 2);
});

test("bypass: mutating the verified record after the guard was built changes nothing", async () => {
  const ids = { ...ID };
  const roles = { ...VERIFIED.roles };
  const f = fakeRaw();
  const admin = guardAdminClient(f.raw, { v: 1, slot: 0, ids, roles }, { confirm: async () => {} });
  ids.primary = STRANGER;
  roles[STRANGER] = "student";
  await assert.rejects(admin.from("profiles").update({ selected_grade: 9 }).eq("id", STRANGER), /ikke en verificeret testkonto/);
  assert.deepEqual(f.sent, []);
});

test("bypass: the recorded builder cannot be re-targeted or reach the real builder", async () => {
  await refused((a) => { const q = a.from("profiles").update({ selected_grade: 9 }); q.eq = () => q; return q.eq("id", ID.primary); }, /uden filter/);
  await refused((a) => a.from("profiles").update({ selected_grade: 9 }).eq("id", ID.primary).url, /\.url\(\) er ikke tilladt/);
  await refused((a) => a.from("profiles").update({ selected_grade: 9 }).eq("id", ID.primary).headers, /er ikke tilladt/);
  await refused((a) => a.from("profiles").__proto__.update, /er ikke tilladt/);
  await refused((a) => a.from("profiles").update({ __proto__: { role: "teacher" }, x: 1 }).eq("id", ID.primary), /ét objekt|kan kun have rollen/);
});

test("the reviewed tables are exactly the audit's per-user tables", async () => {
  const audit = (await import("node:fs")).readFileSync(new URL("./e2e-writes-slot-scoped.test.mjs", import.meta.url), "utf8");
  const listed = audit.match(/const PER_USER_TABLES = Object\.freeze\(\[([\s\S]*?)\]\)/)[1].match(/"([a-z_]+)"/g).map((s) => s.slice(1, -1));
  assert.deepEqual(Object.keys(OWNER_COLUMN).sort(), listed.sort());
});
