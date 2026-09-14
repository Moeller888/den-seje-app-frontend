// D-141 §9 — prepared, not authorised.
//
// The thing being prevented is a contract entry that reads like permission. D-141 fixes a mask, a
// prompt and a gate for a call that is NOT approved, so it records them under `preparedCall` and
// leaves `authorisedCalls` exactly as D-139 left it: one entry, spent.
//
// A note on what these tests deliberately do NOT do. D-141 implements no new sending adapter, so
// there is no adapter here whose refusal of `preparedCall` could be tested. Standing up a
// throwaway adapter in a test and calling its refusal "proof" would be proof of nothing — the
// artefact under test would be the test's own invention. What IS tested is the real, exported
// authorisation function of the EXISTING D-139 adapter, offline, with no fetch and no claim: it
// must refuse any decision or call id that is not its own. The future adapter's own refusal
// belongs to the later, separately authorised adapter task.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as D139 from "../../tools/avatar/openai-generate-r3-underlay.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CONTRACT_PATH = join(REPO, "tools", "avatar", "fixtures", "r3", "r3-shadow-contract-v1.json");
const CONTRACT = JSON.parse(readFileSync(CONTRACT_PATH, "utf8"));
const P = CONTRACT.preparedCall;
const REGISTER = readFileSync(join(REPO, "docs", "project-state.md"), "utf8");

test("preparedCall exists and says, in every field, that nothing is authorised", () => {
  assert.equal(P.status, "PREPARED — NOT AUTHORISED");
  assert.equal(P.decision, "D-141");
  assert.equal(P.callId, null, "a prepared call has no call id — one is issued by a later decision");
  assert.equal(P.authorises, "nothing");
});

test("it names what it prepares, and nothing it prepares is a sending path", () => {
  assert.deepEqual(P.prepares, [
    "tools/avatar/fixtures/r3-underlay/r3-underlay-api-mask-core-v1.png",
    "tools/avatar/fixtures/r3-underlay/r3-underlay-prompt-v2.md",
    "pre.join-continuity in tools/avatar/recompose-r3-head-edit.mjs",
  ]);
  for (const p of P.prepares) {
    assert.ok(!/openai|adapter|claim/i.test(p), "a prepared artefact must not be a sending path: " + p);
  }
  assert.match(P.noAdapterImplemented, /implements no new sending adapter/);
});

test("it states the rule any future adapter must follow", () => {
  assert.match(P.adapterContract, /MUST refuse --send/);
  assert.match(P.adapterContract, /regardless of any other flag or approval value/);
  assert.match(P.adapterContract, /MUST NOT\s+create a claim/);
});

test("sending needs a separate decision, a new call id and a new claim", () => {
  assert.deepEqual(P.requiresBeforeAnySend, [
    "a separate, explicit owner decision",
    "a new call id",
    "a new exclusive-create claim file",
    "a new or extended adapter, itself owner-approved",
  ]);
  assert.match(P.notAnAuthorisedCall, /never be moved into, merged with, or read as an entry of authorisedCalls/);
});

test("it is honest that one call can still fail", () => {
  assert.match(P.oneCallCanStillFail, /not guaranteed to follow the mask pixel-precisely/);
  assert.match(P.oneCallCanStillFail, /a better chance, not a guarantee/);
});

// ── authorisedCalls must be exactly what D-139 left ──────────────────────────────────────────

test("authorisedCalls still holds exactly one entry, and it is D-139's", () => {
  assert.equal(CONTRACT.authorisedCalls.count, 1);
  assert.equal(CONTRACT.authorisedCalls.calls.length, 1);
  assert.equal(CONTRACT.authorisedCalls.calls[0].callId, "D-139-r3-underlay-head-only-v1");
  assert.equal(CONTRACT.authorisedCalls.calls[0].decision, "D-139");
});

test("NO D-141 entry leaked into authorisedCalls", () => {
  for (const c of CONTRACT.authorisedCalls.calls) {
    assert.notEqual(c.decision, "D-141", "D-141 must never appear as an authorised call");
    assert.ok(!/D-141/.test(c.callId || ""), "no D-141 call id may exist");
  }
  assert.match(CONTRACT.authorisedCalls.shape, /A LIST, not a boolean/);
});

test("the general flag is still false — authorisation is never a global boolean", () => {
  assert.equal(CONTRACT.meta.authorisesImageRequest, false);
  assert.match(CONTRACT.meta.authorisationModel, /stays false permanently/);
});

// ── the REAL D-139 adapter, offline: no fetch, no claim ──────────────────────────────────────

test("the real D-139 authorisation function refuses a contract that only prepares a call", () => {
  // verifyAuthorisation is the actual exported gate the adapter uses. Nothing is stubbed.
  const onlyPrepared = JSON.parse(JSON.stringify(CONTRACT));
  delete onlyPrepared.authorisedCalls;
  const v = D139.verifyAuthorisation(onlyPrepared);
  assert.equal(v.ok, false, "a preparedCall must never satisfy the adapter");
  assert.equal(v.call, null);
});

test("the real D-139 authorisation function refuses unknown decisions and call ids", () => {
  for (const [label, mutate] of [
    ["a D-141 call id", (c) => { c.authorisedCalls.calls[0].callId = "D-141-r3-underlay-core-v1"; }],
    ["a null call id", (c) => { c.authorisedCalls.calls[0].callId = null; }],
    ["an unknown decision", (c) => { c.authorisedCalls.calls[0].decision = "D-141"; c.authorisedCalls.calls[0].callId = "D-141-something"; }],
    ["an empty call list", (c) => { c.authorisedCalls.calls = []; }],
  ]) {
    const c = JSON.parse(JSON.stringify(CONTRACT));
    mutate(c);
    const v = D139.verifyAuthorisation(c);
    assert.equal(v.ok, false, label + " must be refused");
  }
  // and the untouched contract still authorises its own call, so the test above is not vacuous
  assert.equal(D139.verifyAuthorisation(CONTRACT).ok, true, "D-139's own entry must still verify");
});

test("checking authorisation performs no network call and creates no claim", () => {
  const claim = D139.resolveClaimPath({ repoRoot: REPO });
  const before = claim.ok ? existsSync(claim.path) : null;
  D139.verifyAuthorisation(CONTRACT);
  D139.verifyAuthorisation({ authorisedCalls: { calls: [] } });
  const after = claim.ok ? existsSync(claim.path) : null;
  assert.equal(after, before, "the claim's existence must be unchanged by an authorisation check");
  // and nothing in this file can reach the network: no fetch is imported, called or stubbed
  const src = readFileSync(join(HERE, "avatar-r3-prepared-call.test.mjs"), "utf8");
  assert.ok(!/D139\.performSingleRequest\s*\(/.test(src), "this suite must not exercise the send path");
  assert.ok(!/fetch\s*\(/.test(src), "this suite must not call fetch");
});

test("D-141 implements no new adapter — no such file is added", () => {
  for (const f of ["openai-generate-r3-underlay-v2.mjs", "openai-generate-r3-core.mjs", "openai-generate-r3-underlay-core.mjs"]) {
    assert.equal(existsSync(join(REPO, "tools", "avatar", f)), false, "D-141 must not add a sending adapter: " + f);
  }
  // the D-139 adapter is unchanged: it still pins its own call id and its own mask
  assert.equal(D139.CALL_ID, "D-139-r3-underlay-head-only-v1");
  assert.equal(D139.API_MASK.name, "r3-underlay-api-mask-v1.png");
  assert.equal(D139.API_MASK.sha256, "28ff1ac00f6972697411ad29c5618f9ede4b5a0a4fd086a41ec0bfb5fe7561fb");
  assert.equal(D139.PROMPT_FILE.name, "r3-underlay-prompt.md");
});

test("the register row says the same thing the contract does", () => {
  const rows = REGISTER.split("\n").filter((l) => l.startsWith("| **D-141** |"));
  assert.equal(rows.length, 1, "D-141 must appear exactly once");
  const row = rows[0];
  assert.match(row, /autoriserer INTET billedkald/);
  assert.match(row, /tilføjer \*\*ingen\*\* post til `authorisedCalls`/);
  assert.match(row, /implementerer ingen ny afsendelsesadapter/);
  assert.match(row, /\(2026-09-14\)/, "the owner-approved decision date");
  assert.ok(!/GODKENDELSESDATO/.test(row), "the draft placeholder must be gone");
});
