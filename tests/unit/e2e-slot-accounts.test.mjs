// Guards E2E account slots (tests/e2e-slot.mjs) and how the suite applies them.
//
// Pinned:
//   - slot 0 is the pre-slot suite, byte for byte: applySlotToEnv() changes nothing;
//   - slot 1..3 addresses are deterministic, unique across slots and kinds, and never an existing
//     slot-0 address; an invalid E2E_SLOT throws instead of falling onto another slot's accounts;
//   - passwords are never derived, rewritten or logged; the address derived from the secret
//     TEST_STUDENT_EMAIL is masked in GitHub Actions;
//   - ensureSlotUser() creates with email_confirm + an app_metadata marker, and REFUSES (never
//     modifies) an existing account that lacks the matching marker;
//   - the Playwright config applies the slot before global-setup and any spec.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  MAX_SLOTS,
  DEFAULT_TEACHER_EMAIL,
  DEFAULT_STUDENT2_EMAIL,
  OWNER_VAR,
  APPLIED_VAR,
  parseSlot,
  slotEmail,
  applySlotToEnv,
  maskCommands,
  ensureSlotUser,
} from "../e2e-slot.mjs";

// Stand-in secret values are generated, never written as literals (tests/unit/credential-hygiene.test.mjs
// forbids a literal assigned to a credential name anywhere in the repository).
const PASSWORD_KEYS = ["TEST_STUDENT_PASSWORD", "TEST_TEACHER_PASSWORD", "TEST_STUDENT2_PASSWORD", "SUPABASE_SERVICE_ROLE_KEY"];
const fakeSecret = (name) => ["fake", name.toLowerCase(), "never", "logged"].join("-");
const BASE = Object.freeze({
  TEST_STUDENT_EMAIL: "pupil.secret@example.test",
  ...Object.fromEntries(PASSWORD_KEYS.map((k) => [k, fakeSecret(k)])),
});
const envFor = (slot, extra = {}) => ({ ...BASE, ...(slot === undefined ? {} : { E2E_SLOT: slot }), ...extra });

// ── parseSlot ─────────────────────────────────────────────────────────────────────────────────
test("parseSlot: unset/empty is 0, '0'..'3' select a slot, anything else throws", () => {
  assert.equal(parseSlot(undefined), 0);
  assert.equal(parseSlot(null), 0);
  assert.equal(parseSlot(""), 0);
  assert.equal(parseSlot("  "), 0);
  for (const s of ["0", "1", "2", "3", " 2 "]) assert.equal(parseSlot(s), Number(s.trim()));
  for (const bad of ["4", "-1", "01", "1.0", "x", "١", 1, true, {}]) {
    assert.throws(() => parseSlot(bad), /E2E_SLOT/, JSON.stringify(bad));
  }
});

// ── slotEmail ─────────────────────────────────────────────────────────────────────────────────
test("slotEmail inserts +e2e-slot-<n> before the @, deterministically", () => {
  assert.equal(slotEmail("teacher-test@hotmail.com", 1), "teacher-test+e2e-slot-1@hotmail.com");
  assert.equal(slotEmail("teacher-test@hotmail.com", 3, "-owner"), "teacher-test+e2e-slot-3-owner@hotmail.com");
  assert.equal(slotEmail("a.b@c.dk", 2), "a.b+e2e-slot-2@c.dk");
  assert.equal(slotEmail(" a@c.dk ", 2), "a+e2e-slot-2@c.dk");
  assert.equal(slotEmail("a@c.dk", 0), "a@c.dk");
});

test("slotEmail refuses anything that is not a plain local@domain or already tagged", () => {
  for (const bad of ["", "nolocal", "@c.dk", "a@", "a@b@c", "a b@c.dk", "a\t@c.dk", "x+e2e-slot-1@c.dk", "X+E2E-SLOT-2@c.dk", null, 7]) {
    assert.throws(() => slotEmail(bad, 1), /slotEmail/, JSON.stringify(bad));
  }
  for (const slot of [4, -1, 1.5, "1"]) assert.throws(() => slotEmail("a@c.dk", slot), /invalid slot/);
  assert.throws(() => slotEmail("a@c.dk", 0, "-owner"), /slot 0/);
  assert.throws(() => slotEmail("a@c.dk", 1, "-Owner"), /suffix/);
  assert.throws(() => slotEmail("a@c.dk", 1, "@evil.com"), /suffix/);
});

test("all slot addresses are unique across slots and account kinds, and never a slot-0 address", () => {
  const seen = new Set([BASE.TEST_STUDENT_EMAIL, DEFAULT_TEACHER_EMAIL, DEFAULT_STUDENT2_EMAIL]);
  for (let slot = 1; slot < MAX_SLOTS; slot++) {
    const env = envFor(String(slot));
    applySlotToEnv(env);
    for (const v of [env.TEST_STUDENT_EMAIL, env.TEST_TEACHER_EMAIL, env.TEST_STUDENT2_EMAIL, env[OWNER_VAR]]) {
      assert.ok(!seen.has(v.toLowerCase()), "duplicate " + v);
      seen.add(v.toLowerCase());
      assert.ok(v.includes("+e2e-slot-" + slot), v);
    }
  }
  assert.equal(seen.size, 3 + 4 * 3);
});

// ── applySlotToEnv ────────────────────────────────────────────────────────────────────────────
test("slot 0 (unset or '0') leaves the environment exactly as it was", () => {
  for (const slot of [undefined, "", "0"]) {
    const env = envFor(slot);
    const before = JSON.stringify(env);
    assert.equal(applySlotToEnv(env), 0);
    assert.equal(JSON.stringify(env), before, "slot " + JSON.stringify(slot));
  }
});

test("slot 2 derives all four accounts; teacher/student2 from their public defaults when unset", () => {
  const env = envFor("2");
  assert.equal(applySlotToEnv(env), 2);
  assert.equal(env.TEST_STUDENT_EMAIL, "pupil.secret+e2e-slot-2@example.test");
  assert.equal(env.TEST_TEACHER_EMAIL, "teacher-test+e2e-slot-2@hotmail.com");
  assert.equal(env.TEST_STUDENT2_EMAIL, "student-teacher-test+e2e-slot-2@hotmail.com");
  assert.equal(env[OWNER_VAR], "teacher-test+e2e-slot-2-owner@hotmail.com");
  assert.equal(env[APPLIED_VAR], "2");
});

test("overridden teacher/student2 addresses are honoured as the slot-0 base", () => {
  const env = envFor("1", { TEST_TEACHER_EMAIL: "t@s.dk", TEST_STUDENT2_EMAIL: "p@s.dk" });
  applySlotToEnv(env);
  assert.equal(env.TEST_TEACHER_EMAIL, "t+e2e-slot-1@s.dk");
  assert.equal(env.TEST_STUDENT2_EMAIL, "p+e2e-slot-1@s.dk");
  assert.equal(env[OWNER_VAR], "t+e2e-slot-1-owner@s.dk");
});

test("idempotent: re-applying (Playwright re-evaluates the config per worker) never stacks tags", () => {
  const env = envFor("3");
  applySlotToEnv(env);
  const once = JSON.stringify(env);
  applySlotToEnv(env);
  applySlotToEnv({ ...env }); // a worker inherits the parent's env
  assert.equal(JSON.stringify(env), once);
  const child = { ...env };
  applySlotToEnv(child);
  assert.equal(JSON.stringify(child), once);
});

test("re-applying as a different slot, or with no primary address, throws", () => {
  const env = envFor("1");
  applySlotToEnv(env);
  env.E2E_SLOT = "2";
  assert.throws(() => applySlotToEnv(env), /already applied as 1/);
  assert.throws(() => applySlotToEnv({ E2E_SLOT: "1" }), /TEST_STUDENT_EMAIL is missing/);
  assert.throws(() => applySlotToEnv({ E2E_SLOT: "1", TEST_STUDENT_EMAIL: "  " }), /TEST_STUDENT_EMAIL is missing/);
  assert.throws(() => applySlotToEnv({ E2E_SLOT: "7", TEST_STUDENT_EMAIL: "a@b.c" }), /E2E_SLOT/);
});

test("passwords and keys are never rewritten, derived or copied into any other variable", () => {
  for (const slot of ["0", "1", "2", "3"]) {
    const env = envFor(slot);
    applySlotToEnv(env);
    for (const k of PASSWORD_KEYS) assert.equal(env[k], BASE[k], k);
    for (const [k, v] of Object.entries(env)) {
      if (PASSWORD_KEYS.includes(k)) continue;
      for (const secret of PASSWORD_KEYS.map((p) => BASE[p])) {
        assert.ok(typeof v !== "string" || !v.includes(secret), `${k} carries a secret`);
      }
    }
  }
});

// ── Masking ───────────────────────────────────────────────────────────────────────────────────
test("maskCommands masks the secret-derived address in Actions, and only that", () => {
  const env = envFor("1", { GITHUB_ACTIONS: "true" });
  applySlotToEnv(env);
  assert.deepEqual(maskCommands(env), ["::add-mask::pupil.secret+e2e-slot-1@example.test"]);
  for (const line of maskCommands(env)) for (const k of PASSWORD_KEYS) assert.ok(!line.includes(BASE[k]));

  const local = envFor("1");
  applySlotToEnv(local);
  assert.deepEqual(maskCommands(local), [], "outside Actions nothing is printed");
  assert.deepEqual(maskCommands(envFor("0", { GITHUB_ACTIONS: "true" })), [], "slot 0: GitHub already masks the secret");
});

// ── ensureSlotUser ────────────────────────────────────────────────────────────────────────────
function fakeAuth(existing = []) {
  const users = [...existing];
  const created = [];
  const logs = [];
  return {
    created,
    logs,
    findUser: async (email) => users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase()) ?? null,
    createUser: async (attributes) => {
      created.push(attributes);
      const user = { id: "id-" + created.length, email: attributes.email, app_metadata: attributes.app_metadata };
      users.push(user);
      return { data: { user }, error: null };
    },
    log: (line) => logs.push(line),
  };
}

test("ensureSlotUser creates a confirmed, marked account and logs only slot/kind/id", async () => {
  const f = fakeAuth();
  const id = await ensureSlotUser({ slot: 1, kind: "primary", email: "pupil.secret+e2e-slot-1@example.test", password: BASE.TEST_STUDENT_PASSWORD, ...f });
  assert.equal(id, "id-1");
  assert.deepEqual(f.created[0], {
    email: "pupil.secret+e2e-slot-1@example.test",
    email_confirm: true,
    app_metadata: { e2e_slot: 1, e2e_account: "primary" },
    password: BASE.TEST_STUDENT_PASSWORD,
  });
  assert.deepEqual(f.logs, ["[global-setup] Created E2E slot 1 primary account (id-1)"]);
});

test("ensureSlotUser is idempotent: a correctly marked existing account is reused, not recreated", async () => {
  const f = fakeAuth([{ id: "u9", email: "t+e2e-slot-2@s.dk", app_metadata: { e2e_slot: 2, e2e_account: "teacher" } }]);
  assert.equal(await ensureSlotUser({ slot: 2, kind: "teacher", email: "T+e2e-slot-2@s.dk", password: fakeSecret("p"), ...f }), "u9");
  assert.equal(f.created.length, 0);
  assert.equal(f.logs.length, 0);
});

test("ensureSlotUser REFUSES an existing account without the matching marker", async () => {
  for (const app_metadata of [undefined, {}, { e2e_slot: 1, e2e_account: "teacher" }, { e2e_slot: 2, e2e_account: "primary" }, { e2e_slot: "2", e2e_account: "teacher" }]) {
    const f = fakeAuth([{ id: "stranger", email: "t+e2e-slot-2@s.dk", app_metadata }]);
    await assert.rejects(
      ensureSlotUser({ slot: 2, kind: "teacher", email: "t+e2e-slot-2@s.dk", password: fakeSecret("p"), ...f }),
      /refusing to modify it \(stranger\)/,
      JSON.stringify(app_metadata),
    );
    assert.equal(f.created.length, 0);
  }
});

test("ensureSlotUser: the owner has no password; bad inputs are refused before any lookup", async () => {
  const f = fakeAuth();
  await ensureSlotUser({ slot: 3, kind: "owner", email: "t+e2e-slot-3-owner@s.dk", password: null, ...f });
  assert.ok(!("password" in f.created[0]));

  const g = fakeAuth();
  let looked = 0;
  const findUser = async () => { looked++; return null; };
  for (const bad of [
    { slot: 0, kind: "primary", email: "a+e2e-slot-0@b.c", password: fakeSecret("p") },
    { slot: 4, kind: "primary", email: "a+e2e-slot-4@b.c", password: fakeSecret("p") },
    { slot: 1, kind: "admin", email: "a+e2e-slot-1@b.c", password: fakeSecret("p") },
    { slot: 1, kind: "primary", email: "a@b.c", password: fakeSecret("p") },
    { slot: 1, kind: "primary", email: "a+e2e-slot-2@b.c", password: fakeSecret("p") },
    { slot: 1, kind: "primary", email: "a+e2e-slot-1@b.c", password: "" },
    { slot: 1, kind: "primary", email: "a+e2e-slot-1@b.c", password: undefined },
  ]) {
    await assert.rejects(ensureSlotUser({ ...bad, ...g, findUser }), /ensureSlotUser/, JSON.stringify(bad));
  }
  assert.equal(looked, 0);
});

test("ensureSlotUser surfaces createUser errors and a missing id", async () => {
  const base = { slot: 1, kind: "student2", email: "p+e2e-slot-1@s.dk", password: fakeSecret("p"), findUser: async () => null, log: () => {} };
  await assert.rejects(ensureSlotUser({ ...base, createUser: async () => ({ data: null, error: { message: "boom" } }) }), /createUser failed — boom/);
  await assert.rejects(ensureSlotUser({ ...base, createUser: async () => ({ data: { user: {} }, error: null }) }), /no user id/);
});

// ── Wiring ────────────────────────────────────────────────────────────────────────────────────
const read = (p) => readFileSync(new URL("../../" + p, import.meta.url), "utf8");

test("playwright.config.ts applies the slot after .env and before defineConfig, and prints the masks", () => {
  const cfg = read("playwright.config.ts");
  const dot = cfg.indexOf("dotenv.config();");
  const apply = cfg.indexOf("applySlotToEnv(process.env);");
  const mask = cfg.indexOf("for (const command of maskCommands(process.env)) console.log(command);");
  const define = cfg.indexOf("export default defineConfig(");
  assert.ok(dot !== -1 && apply > dot && mask > apply && define > mask);
});

test("global-setup provisions slots 1..3 through ensureSlotUser and leaves slot 0 alone", () => {
  const gs = read("tests/global-setup.ts");
  assert.ok(gs.includes('import { parseSlot, OWNER_VAR, ensureSlotUser } from "./e2e-slot.mjs";'));
  assert.ok(gs.includes("const slotOwnerTeacherId = E2E_SLOT === 0 ? null : await ensureSlotAccounts(supabase, E2E_SLOT);"));
  assert.ok(gs.includes("if (slotOwnerTeacherId !== null) {"));
  // The slot code logs no address and no password.
  const start = gs.indexOf("async function ensureSlotAccounts(");
  const region = gs.slice(start, gs.indexOf("// ── Section 97: Teacher test account provisioning", start));
  for (const line of region.split("\n").filter((l) => l.includes("console.log(") || l.includes("throw new Error("))) {
    for (const forbidden of ["EMAIL}", "PASSWORD", "ownerEmail}", "email}"]) {
      assert.ok(!line.includes(forbidden), "slot setup must not log " + forbidden + ": " + line.trim());
    }
  }
});

// The primary address comes from a secret, and for slots 1..3 is derived from one. GitHub masks only
// the exact secret string, so the derived form is protected solely by the `::add-mask::` the config
// prints. Global setup therefore never interpolates it at all: no log line, no error message.
test("global-setup never puts the primary student address into a log line or message", () => {
  const gs = read("tests/global-setup.ts");
  assert.equal(gs.includes("${TEST_STUDENT_EMAIL}"), false);
  assert.ok(gs.includes("Deleted all question_instances for the primary test student (${user.id}, slot ${E2E_SLOT})"));
  assert.ok(gs.includes("avatar_identity=neutral(chosen) for the primary test student (${user.id}, slot ${E2E_SLOT})"));
  // Negative control: the check sees the shape it forbids.
  assert.ok("for ${TEST_STUDENT_EMAIL} (${user.id})".includes("${TEST_STUDENT_EMAIL}"));
});

test("helpers and global-setup still read addresses only from TEST_*_EMAIL (which the config rewrites)", () => {
  const helpers = read("tests/helpers.ts");
  assert.ok(helpers.includes('export const TEACHER_EMAIL    = process.env.TEST_TEACHER_EMAIL    ?? "teacher-test@hotmail.com";'));
  assert.ok(helpers.includes('export const STUDENT2_EMAIL   = process.env.TEST_STUDENT2_EMAIL   ?? "student-teacher-test@hotmail.com";'));
  assert.equal(DEFAULT_TEACHER_EMAIL, "teacher-test@hotmail.com");
  assert.equal(DEFAULT_STUDENT2_EMAIL, "student-teacher-test@hotmail.com");
});
