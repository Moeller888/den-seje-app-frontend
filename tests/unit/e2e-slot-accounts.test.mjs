// Guards E2E account slots (tests/e2e-slot.mjs) and how the suite applies them.
//
// Pinned:
//   - slot 0 is the pre-slot suite, byte for byte: applySlotToEnv() changes nothing;
//   - slot 1..3 addresses are deterministic, unique across slots and kinds, and never an existing
//     slot-0 address; an invalid E2E_SLOT throws instead of falling onto another slot's accounts;
//   - passwords are never derived, rewritten or logged; the address derived from the secret
//     TEST_STUDENT_EMAIL is masked in GitHub Actions;
//   - there are NO default addresses (A1): a missing address throws, for every slot;
//   - nothing here provisions accounts any more (A2): ensureSlotUser and its kinds are gone, and
//     global-setup creates no user (tests/unit/e2e-account-safety-contract.test.mjs);
//   - the Playwright config applies the slot before global-setup and any spec.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  MAX_SLOTS,
  OWNER_VAR,
  APPLIED_VAR,
  parseSlot,
  slotEmail,
  applySlotToEnv,
  maskCommands,
} from "../e2e-slot.mjs";
import * as slotModule from "../e2e-slot.mjs";

// Stand-in secret values are generated, never written as literals (tests/unit/credential-hygiene.test.mjs
// forbids a literal assigned to a credential name anywhere in the repository).
const PASSWORD_KEYS = ["TEST_STUDENT_PASSWORD", "TEST_TEACHER_PASSWORD", "TEST_STUDENT2_PASSWORD", "SUPABASE_SERVICE_ROLE_KEY"];
const fakeSecret = (name) => ["fake", name.toLowerCase(), "never", "logged"].join("-");
const BASE = Object.freeze({
  TEST_STUDENT_EMAIL: "pupil.secret@example.test",
  TEST_TEACHER_EMAIL: "teacher@example.test",
  TEST_STUDENT2_EMAIL: "pupil2@example.test",
  ...Object.fromEntries(PASSWORD_KEYS.map((k) => [k, fakeSecret(k)])),
});
const read = (p) => readFileSync(new URL("../../" + p, import.meta.url), "utf8");
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
  assert.equal(slotEmail("teacher@example.test", 1), "teacher+e2e-slot-1@example.test");
  assert.equal(slotEmail("teacher@example.test", 3, "-owner"), "teacher+e2e-slot-3-owner@example.test");
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
  const seen = new Set([BASE.TEST_STUDENT_EMAIL, BASE.TEST_TEACHER_EMAIL, BASE.TEST_STUDENT2_EMAIL]);
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

test("slot 2 derives all four accounts from the configured addresses", () => {
  const env = envFor("2");
  assert.equal(applySlotToEnv(env), 2);
  assert.equal(env.TEST_STUDENT_EMAIL, "pupil.secret+e2e-slot-2@example.test");
  assert.equal(env.TEST_TEACHER_EMAIL, "teacher+e2e-slot-2@example.test");
  assert.equal(env.TEST_STUDENT2_EMAIL, "pupil2+e2e-slot-2@example.test");
  assert.equal(env[OWNER_VAR], "teacher+e2e-slot-2-owner@example.test");
  assert.equal(env[APPLIED_VAR], "2");
});

test("A1: no default address — a missing or blank teacher/student2 address throws for slots 1..3", () => {
  for (const name of ["TEST_TEACHER_EMAIL", "TEST_STUDENT2_EMAIL"]) {
    for (const value of [undefined, "", "   "]) {
      const env = envFor("1", { [name]: value });
      if (value === undefined) delete env[name];
      assert.throws(() => applySlotToEnv(env), (e) => e instanceof Error && e.message.startsWith(name + " is missing or empty (no default address)"), name + "=" + JSON.stringify(value));
    }
  }
  const src = read("tests/e2e-slot.mjs");
  assert.equal(/hotmail/i.test(src), false, "no hotmail address left in the slot module");
  assert.equal(/fallback/.test(src), false, "no fallback field left in the slot module");
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

// ── No provisioning ───────────────────────────────────────────────────────────────────────────
test("A2: the slot module no longer provisions accounts (ensureSlotUser and its kinds are gone)", () => {
  assert.equal("ensureSlotUser" in slotModule, false);
  assert.equal("SLOT_ACCOUNT_KINDS" in slotModule, false);
  assert.equal("DEFAULT_TEACHER_EMAIL" in slotModule, false);
  assert.equal("DEFAULT_STUDENT2_EMAIL" in slotModule, false);
  assert.equal(/createUser/.test(read("tests/e2e-slot.mjs")), false);
});

// ── Wiring ────────────────────────────────────────────────────────────────────────────────────

test("playwright.config.ts applies the slot after .env and before defineConfig, and prints the masks", () => {
  const cfg = read("playwright.config.ts");
  const dot = cfg.indexOf("dotenv.config();");
  const apply = cfg.indexOf("applySlotToEnv(process.env);");
  const mask = cfg.indexOf("for (const command of maskCommands(process.env)) console.log(command);");
  const define = cfg.indexOf("export default defineConfig(");
  assert.ok(dot !== -1 && apply > dot && mask > apply && define > mask);
});

test("global-setup takes the slot's accounts from the registry, not from the slot module", () => {
  const gs = read("tests/global-setup.ts");
  assert.ok(gs.includes('import { resolveAccountRegistry } from "./e2e-accounts.mjs";'));
  assert.ok(gs.includes('import { verifyAndOpenAdmin } from "./e2e-admin.mjs";'));
  assert.equal(gs.includes("e2e-slot.mjs"), false, "global-setup no longer imports slot provisioning");
});

// The primary address comes from a secret, and for slots 1..3 is derived from one. GitHub masks only
// the exact secret string, so the derived form is protected solely by the `::add-mask::` the config
// prints. Global setup therefore never interpolates an address at all: no log line, no error message.
test("global-setup never puts an account address into a log line or message", () => {
  const gs = read("tests/global-setup.ts");
  for (const forbidden of ["EMAIL}", ".email}", "email}", "accounts.primary", "accounts.teacher", "accounts.student2", "accounts.owner"]) {
    assert.equal(gs.includes(forbidden), false, forbidden);
  }
  assert.ok(gs.includes("`[global-setup] ${kind} (${id}): question_instances deleted"), "logged by kind and user id");
  // Negative control: the check sees the shape it forbids.
  assert.ok("for ${TEST_STUDENT_EMAIL} (${user.id})".includes("EMAIL}"));
});

test("helpers read addresses only through the registry's requiredAddress (no default)", () => {
  const helpers = read("tests/helpers.ts");
  assert.ok(helpers.includes('export const TEACHER_EMAIL    = requiredAddress("TEST_TEACHER_EMAIL");'));
  assert.ok(helpers.includes('export const STUDENT2_EMAIL   = requiredAddress("TEST_STUDENT2_EMAIL");'));
  assert.equal(/hotmail/i.test(helpers), false);
});
