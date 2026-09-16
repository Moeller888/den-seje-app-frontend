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

test("preparedCall is superseded, and still authorises nothing", () => {
  assert.equal(P.status, "SUPERSEDED BY D-142 — STILL NOT A PERMISSION");
  assert.equal(P.supersededBy, "D-142");
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

test("authorisedCalls holds D-139's call, the D-142 record and the D-143 permission", () => {
  assert.equal(CONTRACT.authorisedCalls.count, 3);
  assert.equal(CONTRACT.authorisedCalls.calls.length, 3);
  assert.equal(CONTRACT.authorisedCalls.calls[0].callId, "D-139-r3-underlay-head-only-v1");
  assert.equal(CONTRACT.authorisedCalls.calls[0].decision, "D-139");
  // The second entry is a record. It must never be mistaken for a live permission.
  const rec = CONTRACT.authorisedCalls.calls[1];
  assert.equal(rec.callId, "D-142-r3-underlay-core-v1");
  assert.equal(rec.mandateState, "SPENT");
  assert.equal(rec.neverReuse, true);
  // The third is the one live permission — and this block is still not it.
  const live = CONTRACT.authorisedCalls.calls[2];
  assert.equal(live.callId, "D-143-r3-underlay-core-v2");
  assert.equal(live.mandateState, "UNSPENT");
  assert.equal(live.decision, "D-143");
  assert.ok(!CONTRACT.authorisedCalls.calls.some((x) => x.decision === "D-141"),
    "D-141 still has no entry of its own");
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
  // D-145: this used to resolve the REAL per-user claim path and check its existence before and
  // after. Looking at a production claim is what D-143 §8 forbids, and the property is stronger
  // when it is structural: verifyAuthorisation is a pure function of the object it is handed, so it
  // cannot touch a claim, a file or the network whatever the state of the machine.
  const adapterSrc = readFileSync(join(REPO, "tools", "avatar", "openai-generate-r3-underlay.mjs"), "utf8");
  const start = adapterSrc.indexOf("export function verifyAuthorisation(");
  assert.ok(start > 0, "verifyAuthorisation must be found in the adapter");
  const body = adapterSrc.slice(start, adapterSrc.indexOf("\n}\n", start));
  for (const forbidden of ["existsSync", "readFileSync", "writeFileSync", "openSync", "mkdirSync", "statSync",
    "renameSync", "resolveClaimPath", "claimState", "createClaim", "spawn", "process.env", "fetch"]) {
    assert.ok(!body.includes(forbidden), "verifyAuthorisation must not contain " + JSON.stringify(forbidden));
  }
  const called = new Set([...body.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]));
  assert.deepEqual([...called].sort(), ["eq", "filter", "for", "if", "isArray", "join", "map", "push", "stringify", "verifyAuthorisation"],
    "only pure helpers may be called from verifyAuthorisation");
  // and it still decides correctly, on objects alone
  assert.equal(D139.verifyAuthorisation(CONTRACT).ok, true);
  assert.equal(D139.verifyAuthorisation({ authorisedCalls: { calls: [] } }).ok, false);
  // and nothing in this file can reach the network: no fetch is imported, called or stubbed
  const src = readFileSync(join(HERE, "avatar-r3-prepared-call.test.mjs"), "utf8");
  assert.ok(!/D139\.performSingleRequest\s*\(/.test(src), "this suite must not exercise the send path");
  // A CALL to fetch, not a mention of the name: another test in this file lists "fetch(" as a
  // forbidden substring to look for in adapters, and that literal must not trip this check.
  assert.ok(!/[^"'\w]fetch\s*\(/.test(src), "this suite must not call fetch");
});

test("no adapter for the prepared call can send", () => {
  // This began as "no such file exists", a proxy for the property that actually matters: while
  // preparedCall is unauthorised, NO adapter targeting the prepared CORE call may carry a send
  // path. A preparation adapter may now exist — it does — so the check tests the property
  // directly, which also catches a send path being added to a file that is allowed to exist.
  const dir = join(REPO, "tools", "avatar");
  const candidates = ["openai-generate-r3-underlay-v2.mjs", "openai-generate-r3-core.mjs",
    "openai-generate-r3-underlay-core.mjs"];
  for (const f of candidates) {
    const p = join(dir, f);
    if (!existsSync(p)) continue;
    const code = readFileSync(p, "utf8").split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
    for (const forbidden of ["fetch(", "FormData", "OPENAI_API_KEY", "Authorization", '"wx"', "createClaim", "writeFileSync"]) {
      assert.ok(!code.includes(forbidden),
        f + " must carry no send path while preparedCall is unauthorised, but contains " + JSON.stringify(forbidden));
    }
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

test("D-145: the implemented send adapter belongs to D-143's call, not to the prepared or spent call", () => {
  // preparedCall stays what D-142 made it; the D-145 implementation is recorded beside D-143's
  // authorisation and gives the prepared call — and D-142's spent identity — nothing to act on.
  assert.equal(P.status, "SUPERSEDED BY D-142 — STILL NOT A PERMISSION");
  assert.equal(P.callId, null);
  const impl = CONTRACT.adapterImplementations.entries;
  assert.equal(impl.length, 1);
  assert.equal(impl[0].decision, "D-145");
  assert.equal(impl[0].callId, "D-143-r3-underlay-core-v2");
  assert.notEqual(impl[0].callId, "D-142-r3-underlay-core-v1");
  const file = join(REPO, ...impl[0].adapter.file.split("/"));
  assert.ok(existsSync(file), "the implementation names a file that exists");
  const code = readFileSync(file, "utf8").split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
  assert.match(code, /const CALL_ID = "D-143-r3-underlay-core-v2";/);
  assert.match(code, /const CLAIM_FILENAME = "D-143\.claim\.json";/);
  assert.ok(!code.includes("D-142-r3-underlay-core-v1") || /NEVER_REUSE_CALL_IDS = Object\.freeze\(\[[^\]]*"D-142-r3-underlay-core-v1"/.test(code),
    "D-142's call id may appear only on the never-reuse list");
  assert.ok(!code.includes("D-142.claim.json"), "the send adapter never names D-142's claim");
  // the CORE preparation adapter is still the one that cannot send, unchanged in role
  assert.notEqual(impl[0].adapter.file, "tools/avatar/openai-generate-r3-underlay-core.mjs");
});
