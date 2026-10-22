// Guards E2E account-slot routing and the FIFO queue on every E2E lock.
//
// What is pinned:
//   1. slot choice (.github/ci/e2e-slot.mjs): PR number % active slots; push/schedule → 0; a manual
//      dispatch only gets an ACTIVE slot; every unknown/invalid value → slot 0;
//   2. the switch: with vars.E2E_SLOT_COUNT unset every run is slot 0 = the pre-slot behaviour;
//   3. locks: one group per slot (at most one run per slot), distinct groups across slots (slots run
//      in parallel), slot 0 keeps the legacy `e2e-shared-supabase` name;
//   4. the workflow: the concurrency group and E2E_SLOT use the IDENTICAL predicate, so the lock
//      and the accounts can never disagree; every E2E lock queues FIFO (`queue: max`) and never
//      cancels; every workflow holding the service-role key takes an E2E lock;
//   5. main still runs the full suite on push (main has no branch protection).
// The block reader is indentation-based (no YAML dependency) with its own negative controls.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import {
  MAX_SLOTS,
  LEGACY_GROUP,
  parseSlotCount,
  isActiveSlot,
  selectSlot,
  slotGroup,
  jobSlot,
} from "../../.github/ci/e2e-slot.mjs";
import { jobLockGroup, FAST_MODES, LABEL_MODE } from "../../.github/ci/classify-changes.mjs";
import { MAX_SLOTS as ACCOUNT_MAX_SLOTS } from "../e2e-slot.mjs";

const WF_DIR = new URL("../../.github/workflows/", import.meta.url);
const workflowFiles = () => readdirSync(WF_DIR).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml")).sort();
const readWorkflow = (f) => readFileSync(new URL(f, WF_DIR), "utf8").split("\r\n").join("\n");
const squash = (s) => s.split("\n").map((l) => l.trim()).join(" ").split("( ").join("(").split(" )").join(")");

// ── 1 + 2. Slot choice ────────────────────────────────────────────────────────────────────────
test("slot count: only exactly 1..4 is accepted; everything else is 1 (slot 0 only)", () => {
  for (const [raw, want] of [["1", 1], ["2", 2], ["3", 3], ["4", 4], [" 4 ", 4], [4, 4]]) {
    assert.equal(parseSlotCount(raw), want, JSON.stringify(raw));
  }
  for (const raw of [undefined, null, "", "0", "5", "-1", "4.0", "four", "1e1", 4.5, NaN, {}, [4], "٤"]) {
    assert.equal(parseSlotCount(raw), 1, JSON.stringify(raw));
  }
});

test("the switch: with E2E_SLOT_COUNT unset every event is slot 0 (pre-slot behaviour)", () => {
  for (const eventName of ["pull_request", "push", "workflow_dispatch", "schedule"]) {
    for (const pr of [1, 2, 3, 376, 377, 378, 379]) {
      assert.equal(selectSlot({ eventName, prNumber: pr, dispatchSlot: "3", slotCount: undefined }), 0);
      assert.equal(selectSlot({ eventName, prNumber: pr, dispatchSlot: "3", slotCount: "" }), 0);
    }
  }
});

test("pull_request: slot = PR number % active slots", () => {
  assert.equal(selectSlot({ eventName: "pull_request", prNumber: 376, slotCount: "4" }), 0);
  assert.equal(selectSlot({ eventName: "pull_request", prNumber: 377, slotCount: "4" }), 1);
  assert.equal(selectSlot({ eventName: "pull_request", prNumber: 378, slotCount: "4" }), 2);
  assert.equal(selectSlot({ eventName: "pull_request", prNumber: 379, slotCount: "4" }), 3);
  assert.equal(selectSlot({ eventName: "pull_request", prNumber: "379", slotCount: "4" }), 3);
  assert.equal(selectSlot({ eventName: "pull_request", prNumber: 379, slotCount: "2" }), 1);
  for (let pr = 1; pr <= 200; pr++) {
    const s = selectSlot({ eventName: "pull_request", prNumber: pr, slotCount: "4" });
    assert.ok(Number.isInteger(s) && s >= 0 && s < 4);
    assert.equal(s, selectSlot({ eventName: "pull_request", prNumber: pr, slotCount: "4" }), "deterministic");
  }
});

test("pull_request: an unusable PR number falls back to slot 0", () => {
  for (const prNumber of [undefined, null, 0, -1, 1.5, "", "12a", " 5", "0x5", NaN, {}]) {
    assert.equal(selectSlot({ eventName: "pull_request", prNumber, slotCount: "4" }), 0, JSON.stringify(prNumber));
  }
});

test("push / schedule / unknown events: the documented fallback is slot 0", () => {
  for (const eventName of ["push", "schedule", "merge_group", "", undefined, "pull_request_target"]) {
    assert.equal(selectSlot({ eventName, prNumber: 379, dispatchSlot: "3", slotCount: "4" }), 0, String(eventName));
  }
});

test("workflow_dispatch: only an ACTIVE slot is honoured; anything else is slot 0", () => {
  assert.equal(selectSlot({ eventName: "workflow_dispatch", dispatchSlot: "0", slotCount: "4" }), 0);
  assert.equal(selectSlot({ eventName: "workflow_dispatch", dispatchSlot: "2", slotCount: "4" }), 2);
  assert.equal(selectSlot({ eventName: "workflow_dispatch", dispatchSlot: "3", slotCount: "4" }), 3);
  assert.equal(selectSlot({ eventName: "workflow_dispatch", dispatchSlot: "3", slotCount: "2" }), 0, "inactive slot");
  assert.equal(selectSlot({ eventName: "workflow_dispatch", dispatchSlot: "1", slotCount: undefined }), 0, "switch off");
  for (const dispatchSlot of ["4", "-1", "x", "", undefined, null, "1.0"]) {
    assert.equal(selectSlot({ eventName: "workflow_dispatch", dispatchSlot, slotCount: "4" }), 0, JSON.stringify(dispatchSlot));
  }
});

test("isActiveSlot respects the switch", () => {
  assert.equal(isActiveSlot(0, undefined), true);
  assert.equal(isActiveSlot(1, undefined), false);
  assert.equal(isActiveSlot(3, "4"), true);
  assert.equal(isActiveSlot(4, "4"), false);
  assert.equal(isActiveSlot(1.5, "4"), false);
});

test("CI routing and account derivation agree on the number of slots", () => {
  assert.equal(MAX_SLOTS, 4);
  assert.equal(ACCOUNT_MAX_SLOTS, MAX_SLOTS);
});

// ── 3. Locks ──────────────────────────────────────────────────────────────────────────────────
test("one lock per slot; slot 0 keeps the legacy name; invalid slots take the legacy lock", () => {
  assert.equal(LEGACY_GROUP, "e2e-shared-supabase");
  assert.equal(slotGroup(0), "e2e-shared-supabase");
  assert.equal(slotGroup(1), "e2e-shared-supabase-slot-1");
  assert.equal(slotGroup(2), "e2e-shared-supabase-slot-2");
  assert.equal(slotGroup(3), "e2e-shared-supabase-slot-3");
  for (const bad of [4, -1, 1.5, NaN, "1", null, undefined]) assert.equal(slotGroup(bad), LEGACY_GROUP, String(bad));
});

test("at most one run per slot: every PR routed to a slot shares that slot's single group", () => {
  const groupsBySlot = new Map();
  for (let pr = 1; pr <= 400; pr++) {
    const slot = selectSlot({ eventName: "pull_request", prNumber: pr, slotCount: "4" });
    const group = slotGroup(slot);
    if (!groupsBySlot.has(slot)) groupsBySlot.set(slot, new Set());
    groupsBySlot.get(slot).add(group);
  }
  assert.equal(groupsBySlot.size, 4);
  for (const [slot, groups] of groupsBySlot) assert.equal(groups.size, 1, "slot " + slot + " must map to one group");
});

test("different slots can run in parallel: the four groups are distinct", () => {
  const groups = [0, 1, 2, 3].map(slotGroup);
  assert.equal(new Set(groups).size, 4);
});

test("jobSlot mirrors E2E_SLOT: only a successful classify with exactly '1'..'3' leaves slot 0", () => {
  assert.equal(jobSlot("success", "1"), "1");
  assert.equal(jobSlot("success", "3"), "3");
  for (const [result, out] of [
    ["failure", "1"], ["cancelled", "2"], ["skipped", "3"], ["", "1"],
    ["success", "0"], ["success", "4"], ["success", ""], ["success", undefined], ["success", " 1"], ["success", "01"], ["success", 1],
  ]) {
    assert.equal(jobSlot(result, out), "0", JSON.stringify([result, out]));
  }
});

test("jobLockGroup: fast + label modes stay isolated, Playwright modes take their slot's lock", () => {
  for (const m of [...FAST_MODES, LABEL_MODE]) assert.equal(jobLockGroup("success", m, 77, "2"), "ci-fast-77", m);
  assert.equal(jobLockGroup("success", "full", 77, "2"), "e2e-shared-supabase-slot-2");
  assert.equal(jobLockGroup("success", "full", 77, "0"), "e2e-shared-supabase");
  assert.equal(jobLockGroup("success", "full", 77), "e2e-shared-supabase", "omitted slot = slot 0");
  assert.equal(jobLockGroup("failure", "full", 77, "2"), "e2e-shared-supabase", "classify failure = slot 0");
  assert.equal(jobLockGroup("failure", "docs", 77, "2"), "e2e-shared-supabase");
  assert.equal(jobLockGroup("success", "bogus", 77, "9"), "e2e-shared-supabase");
});

// ── 4. The workflow ───────────────────────────────────────────────────────────────────────────
// Every `concurrency:` mapping, as { text, group, cancelInProgress, queue }.
function concurrencyBlocks(source) {
  const indentOf = (line) => line.length - line.trimStart().length;
  const lines = source.split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith("#") || line.trim() !== "concurrency:") continue;
    const base = indentOf(line);
    const body = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const l = lines[j];
      if (l.trim() !== "" && indentOf(l) <= base) break;
      body.push(l);
    }
    const children = body.filter((l) => l.trim() !== "" && !l.trimStart().startsWith("#"));
    const childIndent = Math.min(...children.map(indentOf));
    const scalar = (key) => {
      const hit = body.find((l) => indentOf(l) === childIndent && l.trimStart().startsWith(key + ":"));
      if (hit === undefined) return null;
      const value = hit.trimStart().slice(key.length + 1);
      const hash = value.indexOf(" #");
      return (hash === -1 ? value : value.slice(0, hash)).trim();
    };
    blocks.push({ text: body.join("\n"), group: scalar("group"), cancelInProgress: scalar("cancel-in-progress"), queue: scalar("queue") });
    i = j - 1;
  }
  return blocks;
}
const e2eBlocks = (source) => concurrencyBlocks(source).filter((b) => b.text.includes(LEGACY_GROUP));

test("block reader negative controls: it sees queue/cancel values and their absence", () => {
  const yml = "jobs:\n  a:\n    concurrency:\n      group: e2e-shared-supabase\n      cancel-in-progress: true\n    steps: []\n";
  const [b] = e2eBlocks(yml);
  assert.equal(b.queue, null);
  assert.equal(b.cancelInProgress, "true");
  const yml2 = "concurrency:\n  group: e2e-shared-supabase # x\n  queue: single\n";
  assert.equal(e2eBlocks(yml2)[0].queue, "single");
  assert.equal(e2eBlocks("concurrency:\n  group: other\n").length, 0);
});

test("every E2E lock queues FIFO (queue: max) and never cancels — waiting jobs do not displace each other", () => {
  const offenders = [];
  let seen = 0;
  for (const f of workflowFiles()) {
    for (const b of e2eBlocks(readWorkflow(f))) {
      seen++;
      if (b.queue !== "max") offenders.push(`${f}: queue is ${JSON.stringify(b.queue)}, must be "max"`);
      if (b.cancelInProgress !== "false") offenders.push(`${f}: cancel-in-progress is ${JSON.stringify(b.cancelInProgress)}`);
    }
  }
  assert.deepEqual(offenders, []);
  assert.equal(seen, 2, "expected the playwright.yml test job and update-avatar-goldens.yml");
});

test("every workflow that receives the service-role key takes an E2E lock", () => {
  const offenders = [];
  for (const f of workflowFiles()) {
    const src = readWorkflow(f);
    if (src.includes("secrets.SUPABASE_SERVICE_ROLE_KEY") && e2eBlocks(src).length === 0) offenders.push(f);
  }
  assert.deepEqual(offenders, []);
});

const PLAYWRIGHT = readWorkflow("playwright.yml");
const SLOT_PREDICATE =
  "needs.classify.result == 'success' && (needs.classify.outputs.slot == '1' || needs.classify.outputs.slot == '2' || needs.classify.outputs.slot == '3')";

test("workflow: the lock and E2E_SLOT use the identical slot predicate", () => {
  const [block] = e2eBlocks(PLAYWRIGHT);
  const expr = squash(block.text);
  assert.ok(expr.includes("(" + SLOT_PREDICATE + ") && format('e2e-shared-supabase-slot-{0}', needs.classify.outputs.slot)"),
    "slot branch of the lock changed: " + expr);
  assert.ok(expr.includes("|| 'e2e-shared-supabase'"), "the lock must fall back to slot 0's legacy group");
  assert.ok(expr.indexOf("ci-fast-") < expr.indexOf("e2e-shared-supabase-slot-"), "fast modes are decided first");

  const envLine = PLAYWRIGHT.split("\n").find((l) => l.trimStart().startsWith("E2E_SLOT:"));
  assert.ok(envLine, "test job must set E2E_SLOT");
  assert.equal(envLine.trim(), "E2E_SLOT: ${{ (" + SLOT_PREDICATE + ") && needs.classify.outputs.slot || '0' }}");
});

test("workflow: label-verified takes a fast (isolated) lock and never the slot lock", () => {
  const [block] = e2eBlocks(PLAYWRIGHT);
  const expr = squash(block.text);
  const fastPart = expr.slice(0, expr.indexOf("format('ci-fast-{0}'"));
  assert.ok(fastPart.includes("needs.classify.outputs.mode == 'label-verified'"));
});

test("workflow: classify reads the switch and publishes the slot", () => {
  assert.ok(PLAYWRIGHT.includes("E2E_SLOT_COUNT: ${{ vars.E2E_SLOT_COUNT }}"));
  assert.ok(PLAYWRIGHT.includes("slot: ${{ steps.classify.outputs.slot }}"));
  assert.ok(PLAYWRIGHT.includes("core.setOutput('slot', String(slot));"));
  assert.ok(PLAYWRIGHT.includes("slot = slots.selectSlot({"));
  assert.ok(PLAYWRIGHT.includes("core.warning('slot selection error → slot 0: ' + err.message);"));
});

test("workflow: manual dispatch offers exactly slots 0..3, default 0", () => {
  assert.ok(PLAYWRIGHT.includes("  workflow_dispatch:\n    inputs:\n      slot:"));
  assert.ok(PLAYWRIGHT.includes('options: [ "0", "1", "2", "3" ]'));
  assert.ok(PLAYWRIGHT.includes('default: "0"'));
});

test("goldens workflow: always slot 0 under the legacy lock", () => {
  const src = readWorkflow("update-avatar-goldens.yml");
  const [b] = e2eBlocks(src);
  assert.equal(b.group, "e2e-shared-supabase");
  assert.ok(src.includes('E2E_SLOT:                  "0"'));
});

// ── 5. main is not protected → the push run stays ─────────────────────────────────────────────
test("main still runs the full suite on push (no branch protection on main)", () => {
  assert.ok(PLAYWRIGHT.startsWith("name: Playwright Tests\non:\n  push:\n    branches: [ main, master ]\n"));
  assert.ok(PLAYWRIGHT.includes("MAIN STILL RUNS THE FULL SUITE ON PUSH."));
  assert.ok(PLAYWRIGHT.includes("let reason = 'full — non-PR/main push always runs the full suite';"));
});

test("the Playwright run keeps one worker: parallelism is between slots, never inside a suite", () => {
  const config = readFileSync(new URL("../../playwright.config.ts", import.meta.url), "utf8");
  assert.ok(config.includes("fullyParallel: false,"));
  assert.ok(config.includes("workers: 1,"));
});
