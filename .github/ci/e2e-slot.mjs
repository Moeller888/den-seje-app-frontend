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
// Slot 1..3 accounts are only ever provisioned once the owner sets the variable, so merging this
// file creates no production users by itself.
//
// SLOT CHOICE (deterministic, no randomness):
//   pull_request       → pull_request.number % slotCount
//   workflow_dispatch  → the `slot` input, if it is a valid ACTIVE slot (< slotCount); else 0
//   push / schedule / anything else → 0
// Slot 0 is the documented fallback: the original accounts, shared with update-avatar-goldens.yml.
//
// SLOT 0 KEEPS THE LEGACY GROUP NAME. Branches whose workflow file predates slots, and the goldens
// workflow, all take `e2e-shared-supabase` on the slot-0 accounts. Renaming slot 0's group would
// let a new-workflow run and an old-workflow run mutate the same accounts at the same time. Slots
// 1..3 are new accounts, so they get new groups: `e2e-shared-supabase-slot-<n>`.
//
// FAIL-SAFE: every unknown, malformed or out-of-range value resolves to slot 0 and the legacy lock.
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

// Choose the slot for a run. Never throws; every doubtful input → 0.
export function selectSlot({ eventName, prNumber, dispatchSlot, slotCount } = {}) {
  const count = parseSlotCount(slotCount);
  if (count === 1) return 0;
  if (eventName === "pull_request") {
    const pr = parseSmallInt(prNumber);
    if (pr === null || pr < 1) return 0;
    return pr % count;
  }
  if (eventName === "workflow_dispatch") {
    const s = parseSmallInt(typeof dispatchSlot === "string" ? dispatchSlot.trim() : dispatchSlot);
    return s !== null && isActiveSlot(s, count) ? s : 0;
  }
  return 0;
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
