// E2E account-slot routing for the Playwright workflow (.github/workflows/playwright.yml).
//
// WHY: every E2E run used to share ONE set of Supabase test accounts, so the whole repository had
// one lock (`e2e-shared-supabase`) and one ~40 min full suite at a time. Slots give each run its
// own accounts (tests/e2e-slot.mjs derives them), so runs in DIFFERENT slots can run in parallel
// while runs in the SAME slot still serialise on that slot's lock.
//
// THE SWITCH: the number of active slots comes from the repository variable `E2E_SLOT_COUNT`.
// Unset, empty or anything that is not exactly "1".."4" means 1 slot — every run is slot 0, which is
// precisely the behaviour before slots existed (same accounts, same `e2e-shared-supabase` group).
// The variable routes PULL REQUESTS only. Push, schedule and every other automatic event are always
// slot 0, so no automatic run ever provisions slot 1..3 accounts.
//
// SLOT CHOICE (deterministic, no randomness):
//   pull_request       → pull_request.number % slotCount
//   workflow_dispatch  → the `slot` input 0..3, INDEPENDENT of slotCount (resolveDispatch below), so
//                        a slot can be provisioned and verified by hand BEFORE any PR is routed to it
//   push / schedule / anything else → 0
//
// MANUAL PROVISIONING NEEDS A DELIBERATE CONFIRMATION. A dispatch to slot 1..3 that is not yet
// ACTIVE (slot >= slotCount) can create that slot's four production accounts, so it is accepted only
// with the `confirm_provisioning` input set to exactly `provision-slot-<n>` for the same slot. A
// confirmation that is present but not exactly that (wrong slot, typo, given for slot 0) is
// rejected too. A REJECTED dispatch does not fall back to slot 0: the classify job fails and the
// `test` job's guard step (.github/ci/dispatch-guard.mjs) stops before anything reaches Supabase.
// Slot 0 is the documented fallback: the original accounts, shared with update-avatar-goldens.yml.
//
// SLOT 0 KEEPS THE LEGACY GROUP NAME. Branches whose workflow file predates slots, and the goldens
// workflow, all take `e2e-shared-supabase` on the slot-0 accounts. Renaming slot 0's group would
// let a new-workflow run and an old-workflow run mutate the same accounts at the same time. Slots
// 1..3 are new accounts, so they get new groups: `e2e-shared-supabase-slot-<n>`.
//
// FAIL-SAFE: every unknown, malformed or out-of-range value resolves to slot 0 and the legacy lock,
// except a manual dispatch, which is rejected instead (see above): the person asked for a specific
// slot, so silently running another one would test the wrong accounts.
// Over-serialising is safe; two runs on one slot's accounts at once is not.
//
// Pure, deterministic, no regex, no side effects. Mirrored by the GitHub expressions in the
// workflow; tests/unit/ci-e2e-slots.test.mjs pins both.

export const MAX_SLOTS = 4;
export const LEGACY_GROUP = "e2e-shared-supabase";
export const SLOT_GROUP_PREFIX = "e2e-shared-supabase-slot-";

// Exactly one ASCII digit string, or a safe integer. Anything else → null.
function parseSmallInt(raw) {
  if (typeof raw === "number") return Number.isSafeInteger(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  if (raw.length === 0 || raw.length > 9) return null;
  for (const c of raw) if (c < "0" || c > "9") return null;
  return Number(raw);
}

// The number of active slots. FAIL-SAFE to 1 (= slot 0 only = pre-slot behaviour).
export function parseSlotCount(raw) {
  const n = parseSmallInt(typeof raw === "string" ? raw.trim() : raw);
  if (n === null || n < 1 || n > MAX_SLOTS) return 1;
  return n;
}

// A slot is valid only if it is an integer in [0, slotCount).
export function isActiveSlot(slot, slotCount) {
  const count = parseSlotCount(slotCount);
  return Number.isInteger(slot) && slot >= 0 && slot < count;
}

export const PROVISION_CONFIRMATION_PREFIX = "provision-slot-";

// The exact `confirm_provisioning` value that authorises a manual run on an inactive slot.
export function provisionConfirmation(slot) {
  if (!Number.isInteger(slot) || slot < 1 || slot >= MAX_SLOTS) throw new Error(`provisionConfirmation: slot must be 1..3 (got ${slot})`);
  return PROVISION_CONFIRMATION_PREFIX + String(slot);
}

// A manual dispatch. `dispatchSlot` absent means the input default, "0"; otherwise it must be
// exactly one of "0".."3" (no trimming, no numbers: inputs are strings). `confirmation` absent or
// empty means none. Returns { ok: true, slot } or { ok: false, reason } — never throws. The reason
// names only slot numbers and the expected confirmation, never an address or a secret.
export function resolveDispatch({ dispatchSlot, confirmation, slotCount } = {}) {
  const raw = dispatchSlot === undefined || dispatchSlot === null ? "0" : dispatchSlot;
  if (typeof raw !== "string" || raw.length !== 1 || raw < "0" || raw > "3") {
    return { ok: false, reason: `slot input must be exactly one of 0, 1, 2, 3 (got ${JSON.stringify(dispatchSlot)})` };
  }
  const slot = Number(raw);
  const given = confirmation === undefined || confirmation === null ? "" : confirmation;
  if (typeof given !== "string") {
    return { ok: false, reason: "confirm_provisioning must be a string" };
  }
  if (slot === 0) {
    if (given !== "") return { ok: false, reason: "confirm_provisioning must be empty for slot 0" };
    return { ok: true, slot: 0 };
  }
  const expected = provisionConfirmation(slot);
  if (given !== "" && given !== expected) {
    return { ok: false, reason: `confirm_provisioning does not match slot ${slot} (expected ${expected})` };
  }
  if (!isActiveSlot(slot, slotCount) && given !== expected) {
    return {
      ok: false,
      reason: `slot ${slot} is not active (E2E_SLOT_COUNT=${parseSlotCount(slotCount)}); a run on it can create ` +
        `its production accounts, so set confirm_provisioning to ${expected} to confirm`,
    };
  }
  return { ok: true, slot };
}

// Choose the slot for a run. Every doubtful input → 0, with one exception: a rejected manual
// dispatch THROWS (the workflow fails the run instead of running slot 0).
export function selectSlot({ eventName, prNumber, dispatchSlot, dispatchConfirmation, slotCount } = {}) {
  if (eventName === "workflow_dispatch") {
    const r = resolveDispatch({ dispatchSlot, confirmation: dispatchConfirmation, slotCount });
    if (!r.ok) throw new Error(`manual dispatch rejected: ${r.reason}`);
    return r.slot;
  }
  const count = parseSlotCount(slotCount);
  if (count === 1) return 0;
  if (eventName === "pull_request") {
    const pr = parseSmallInt(prNumber);
    if (pr === null || pr < 1) return 0;
    return pr % count;
  }
  return 0;
}

// The `test` job's guard (.github/ci/dispatch-guard.mjs) for manual runs. It re-derives the slot
// from the dispatch inputs on its own and requires it to equal the slot the job is about to use
// (E2E_SLOT), so a rejected dispatch, or a classify job that failed or disagreed, stops the run
// before npm ci, global setup or any Supabase call. Non-dispatch events pass untouched.
export function dispatchGuard({ eventName, dispatchSlot, confirmation, slotCount, jobSlot } = {}) {
  if (eventName !== "workflow_dispatch") return { ok: true, message: `not a manual dispatch (${String(eventName)}); nothing to check` };
  const r = resolveDispatch({ dispatchSlot, confirmation, slotCount });
  if (!r.ok) return { ok: false, message: `manual dispatch rejected: ${r.reason}` };
  if (jobSlot !== String(r.slot)) {
    return { ok: false, message: `manual dispatch asked for slot ${r.slot} but this job would run slot ${JSON.stringify(jobSlot)}; refusing` };
  }
  return { ok: true, message: `manual dispatch accepted: slot ${r.slot}` };
}

// The concurrency group for a slot. Slot 0 and anything invalid → the legacy shared lock.
export function slotGroup(slot) {
  if (!Number.isInteger(slot) || slot < 1 || slot >= MAX_SLOTS) return LEGACY_GROUP;
  return SLOT_GROUP_PREFIX + String(slot);
}

// Mirror of the `test` job's E2E_SLOT env expression: the classify output is trusted ONLY if
// classify succeeded and the output is exactly "1", "2" or "3"; everything else is "0".
export function jobSlot(classifyResult, slotOutput) {
  const ok = classifyResult === "success"
    && typeof slotOutput === "string"
    && (slotOutput === "1" || slotOutput === "2" || slotOutput === "3");
  return ok ? slotOutput : "0";
}
