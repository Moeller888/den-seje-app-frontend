// THE ONE PLACE E2E ACCOUNT SLOTS ARE RESOLVED.
//
// A slot is an isolated set of Supabase test accounts, so E2E runs in different slots can run in
// parallel without touching each other's data (routing: .github/ci/e2e-slot.mjs). The slot comes
// from `E2E_SLOT`: unset or empty is slot 0; "0".."3" select that slot; anything else THROWS, so a
// typo can never silently fall back onto another slot's accounts.
//
// SLOT 0 uses the configured addresses as they are: applySlotToEnv() does nothing for slot 0.
//
// SLOT 1..3 derive every address from the configured ones by inserting `+e2e-slot-<n>` before the
// "@" (student@x → student+e2e-slot-1@x). The passwords are the SAME existing secrets — nothing new
// to store, nothing derived to leak.
//
// THERE ARE NO DEFAULT ADDRESSES. Every address must be configured explicitly; a missing one throws.
// Which domain is allowed, the marker each account must carry and the fact that nothing here or in
// global-setup ever CREATES an account live in the account registry, tests/e2e-accounts.mjs (A1/A2).
// Every slot — slot 0 included — has the same four accounts:
//   primary  — TEST_STUDENT_EMAIL         (the quiz/avatar/student specs)
//   teacher  — TEST_TEACHER_EMAIL         (the teacher-flow specs)
//   student2 — TEST_STUDENT2_EMAIL        (the teacher's own pupil)
//   owner    — a teacher account WITHOUT a password (slots 1..3: E2E_SLOT_OWNER_TEACHER_EMAIL; slot 0:
//              derived by the registry). It exists only as the primary student's teacher:
//              password-help.spec.ts requires the primary student to have a teacher, and
//              teacher-password-reset.spec.ts requires that teacher NOT to be the test teacher.
//
// The primary address is derived from a SECRET, so its derived form is a secret too: GitHub masks
// only the exact secret string, never a string that merely contains parts of it.
// maskCommands() returns the `::add-mask::` workflow commands for it, printed by the Playwright
// config before anything else can log it.
//
// Plain ESM with no dependencies (shared by playwright.config.ts, tests/global-setup.ts and the
// unit tests).

export const MAX_SLOTS = 4;
export const SLOT_TAG_PREFIX = "+e2e-slot-";

// The env names the suite reads addresses from, and where their slot-0 values are stashed so a
// second application (Playwright re-evaluates its config in every worker) derives from the
// original and never stacks tags.
const ADDRESS_VARS = Object.freeze([
  Object.freeze({ name: "TEST_STUDENT_EMAIL", secret: true }),
  Object.freeze({ name: "TEST_TEACHER_EMAIL", secret: false }),
  Object.freeze({ name: "TEST_STUDENT2_EMAIL", secret: false }),
]);
const BASE_PREFIX = "E2E_SLOT_BASE_";
export const OWNER_VAR = "E2E_SLOT_OWNER_TEACHER_EMAIL";
export const APPLIED_VAR = "E2E_SLOT_APPLIED";

export function parseSlot(raw) {
  if (raw === undefined || raw === null) return 0;
  if (typeof raw !== "string") throw new Error("E2E_SLOT must be a string");
  const t = raw.trim();
  if (t === "") return 0;
  if (t.length === 1 && t >= "0" && t <= "3") return Number(t);
  throw new Error(`E2E_SLOT must be one of 0, 1, 2, 3 (got ${JSON.stringify(raw)})`);
}

// Insert `+e2e-slot-<n>` (plus an optional suffix) before the "@". Throws on anything that is not
// a plain local@domain address, or that already carries a slot tag.
export function slotEmail(base, slot, suffix = "") {
  if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_SLOTS) throw new Error(`slotEmail: invalid slot ${slot}`);
  if (typeof base !== "string") throw new Error("slotEmail: base address is not a string");
  const address = base.trim();
  const at = address.indexOf("@");
  if (at < 1 || at !== address.lastIndexOf("@") || at === address.length - 1) {
    throw new Error("slotEmail: base address is not of the form local@domain");
  }
  for (const c of address) {
    if (c === " " || c === "\t" || c === "\n" || c === "\r") throw new Error("slotEmail: base address contains whitespace");
  }
  if (address.toLowerCase().includes(SLOT_TAG_PREFIX)) throw new Error("slotEmail: base address already carries a slot tag");
  if (typeof suffix !== "string") throw new Error("slotEmail: suffix must be a string");
  for (const c of suffix) {
    const ok = (c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c === "-";
    if (!ok) throw new Error("slotEmail: suffix may contain only a-z, 0-9 and -");
  }
  if (slot === 0 && suffix === "") return address;
  if (slot === 0) throw new Error("slotEmail: slot 0 has no derived accounts");
  return address.slice(0, at) + SLOT_TAG_PREFIX + String(slot) + suffix + address.slice(at);
}

// Rewrite the address env vars for the slot named by env.E2E_SLOT. Idempotent. Returns the slot.
export function applySlotToEnv(env = process.env) {
  const slot = parseSlot(env.E2E_SLOT);
  if (slot === 0) return 0;

  const applied = env[APPLIED_VAR];
  if (applied !== undefined && applied !== String(slot)) {
    throw new Error(`E2E slot already applied as ${applied}; refusing to re-apply as ${slot}`);
  }

  for (const v of ADDRESS_VARS) {
    const stashKey = BASE_PREFIX + v.name;
    if (env[stashKey] === undefined) {
      const current = typeof env[v.name] === "string" && env[v.name].trim() !== "" ? env[v.name] : null;
      if (current === null) throw new Error(`${v.name} is missing or empty (no default address); cannot derive slot ${slot} accounts`);
      env[stashKey] = current;
    }
    env[v.name] = slotEmail(env[stashKey], slot);
  }
  env[OWNER_VAR] = slotEmail(env[BASE_PREFIX + "TEST_TEACHER_EMAIL"], slot, "-owner");
  env[APPLIED_VAR] = String(slot);
  return slot;
}

// There is deliberately NO account provisioning here any more (A2): the suite never creates users.
// Accounts are provisioned once, separately and explicitly authorised, with the marker that
// tests/e2e-accounts.mjs verifies.

// The workflow commands that mask every derived address built from a secret. Empty for slot 0
// (the secret itself is already masked by GitHub) and outside GitHub Actions.
export function maskCommands(env = process.env) {
  if (env.GITHUB_ACTIONS !== "true") return [];
  if (parseSlot(env.E2E_SLOT) === 0) return [];
  const out = [];
  for (const v of ADDRESS_VARS) {
    if (!v.secret) continue;
    const value = env[v.name];
    if (typeof value === "string" && value !== "") out.push("::add-mask::" + value);
  }
  return out;
}
