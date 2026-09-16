// D-132 — the R3 shadow contract is a contract, so these tests guard the things a later step
// could quietly get wrong: the reference pins, the fallback direction, default-OFF, the head-only
// scope of the first call, the byte-identity requirement of its recomposition, and the rule that
// nothing here authorises an image request.
//
// They also guard the two ways a contract quietly stops being a contract: an OPEN owner decision
// silently becoming binding somewhere else in the same file, and an UNAPPROVED number being read
// as a runtime value. Both are asserted structurally, not by re-reading a string.
//
// H1 is external (D-127 §2). The contract stores its hash and measurements, never the image —
// one test asserts exactly that, because copying it in would publish a drawn child figure on two
// public surfaces.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CONTRACT_PATH = join(REPO, "tools", "avatar", "fixtures", "r3", "r3-shadow-contract-v1.json");
const REGISTER_PATH = join(REPO, "docs", "project-state.md");
const C = JSON.parse(readFileSync(CONTRACT_PATH, "utf8"));
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

const TARGET_SHA = "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50";
const H1_SHA = "72875565ecd62b542a91156dbcca1399a434fe04634f4e737df71337be0d5af4";
const RAW_SHA = "fa4c705e05b7832c1308f15dcecb28a47ec61416c91486a3930de3b4eaf854c1";
const HEAD_MASK_SHA = "cc9c8b7a68dab60ab5c2914644d28676eefcb29e917a05f7bf4ce44093b737b3";

/** The single D-132 row, so register and contract can be checked against each other. */
function d132Row() {
  const rows = readFileSync(REGISTER_PATH, "utf8").split("\n").filter((l) => l.startsWith("| **D-132** |"));
  assert.equal(rows.length, 1, "D-132 must appear exactly once");
  return rows[0];
}

/** The text of one numbered clause of the D-132 row, e.g. section("(10) THE FIRST SLICE", "(11)"). */
function section(row, from, to) {
  const a = row.indexOf(from);
  assert.ok(a >= 0, "the register is missing the clause " + from);
  const b = row.indexOf(to, a);
  assert.ok(b > a, "the register is missing the clause after " + from);
  return row.slice(a, b);
}

test("the schema is the one the tooling expects", () => {
  assert.equal(C.meta.schema, "r3-shadow-contract");
  assert.equal(C.meta.schemaVersion, 1);
  assert.equal(C.meta.decision, "D-132");
});

test("no image request is authorised IN GENERAL, and the general flag stays false", () => {
  // D-139 authorises ONE named call. It does so through authorisedCalls, not by flipping this
  // boolean: a true here would read as consent to every remaining R3 call, which is precisely the
  // reading the owner refused. The general prohibitions below therefore still stand as written.
  assert.equal(C.meta.authorisesImageRequest, false);
  assert.equal(C.imageCallBudget.isAuthorisation, false);
  assert.match(C.prohibitions.noImageRequestAuthorised, /authorise no image request/);
  assert.match(C.prohibitions.noAutomaticRepair, /never warped, retried or repaired automatically/);
  assert.match(C.prohibitions.noMaskWork, /creates, changes, derives and promotes no mask/);
});

// ── the prose about authorisedCalls must agree with authorisedCalls ──────────────────────────
//
// This is the check that was missing when D-142 added a second entry: prohibitions.noImageRequestAuthorised
// went on calling D-139 "the single entry in authorisedCalls.calls" while the list held two. A prose
// claim about a data structure is only as good as a test that reads both and compares them.

/**
 * Classifies one authorisedCalls entry WITHOUT looking at its position or at the list's length.
 * An entry is a RECORD — never something an adapter may act on — as soon as it says so in its own
 * fields. This is the rule the contract states, expressed once, so the tests below cannot drift
 * from it by reading calls[0] and assuming.
 */
function classifyEntry(e) {
  const spentRecord = e.mandateState === "SPENT" || e.neverReuse === true;
  const boundToOneCall = /Exactly one fetch/.test((e.prohibitions && e.prohibitions.noRetry) || "")
    && /NEW owner decision/.test((e.claim && e.claim.furtherAttempt) || "");
  return {
    callId: e.callId,
    spentRecord,
    everWasAPermission: !spentRecord,
    // Whether an entry still has its call available is its OWN question, answered only by an
    // explicit mandateState. Silence is not consent: D-139's entry predates the field and its
    // call was made, so an absent mandateState must never read as "unspent".
    hasAnUnusedCall: e.mandateState === "UNSPENT",
    // Separately: no entry — spent, unspent or silent — ever authorises a SECOND call. A spent
    // record authorises nothing at all, so it cannot authorise a second one either; a live entry
    // has to say so itself, with noRetry and a furtherAttempt clause.
    authorisesASecondCall: !spentRecord && !boundToOneCall,
  };
}

test("SEMANTIC: the general prohibition describes the list that actually exists", () => {
  const calls = C.authorisedCalls.calls;
  const text = C.prohibitions.noImageRequestAuthorised;

  // 1 · the prose must not make a claim about the list's size that the list contradicts
  assert.ok(!/single entry in authorisedCalls/.test(text), "the stale singular claim must be gone");
  assert.ok(!/holds exactly one entry/.test(text));
  assert.ok(!/the only entry in authorisedCalls/.test(text));

  // 2 · it must name EVERY entry that exists, so adding an entry silently cannot leave it stale
  for (const e of calls) {
    assert.ok(text.includes(e.callId), "the prohibition must name " + e.callId);
  }
  // and it must not name a call id that is not in the list
  for (const id of text.match(/D-1[0-9]{2}-[a-z0-9-]+/g) || []) {
    assert.ok(calls.some((e) => e.callId === id), "the prohibition names an entry that does not exist: " + id);
  }

  // 3 · it must tell the reader to match by id and fields rather than by length
  assert.match(text, /never by the length of the list/);
  assert.match(C.authorisedCalls.shape, /Read authorisedCalls\.calls and match on callId/);
});

test("SEMANTIC: a SPENT/neverReuse entry does not count as an active send permission", () => {
  const classified = C.authorisedCalls.calls.map(classifyEntry);
  assert.equal(classified.length, 3);

  const record = classified.find((x) => x.callId === "D-142-r3-underlay-core-v1");
  assert.ok(record, "the D-142 entry must be present");
  assert.equal(record.spentRecord, true, "mandateState SPENT and neverReuse make it a record");
  assert.equal(record.everWasAPermission, false, "it was never a permission");
  assert.equal(record.authorisesASecondCall, false);

  // The contract must say so in words too, at the entry and at the list.
  const d142 = C.authorisedCalls.calls.find((e) => e.callId === "D-142-r3-underlay-core-v1");
  assert.match(d142.notAnActivePermission, /RECORD, not a permission/);
  assert.match(d142.notAnActivePermission, /No adapter may read it as authorisation to send/);
  assert.match(C.authorisedCalls.entriesAreNotAllPermissions, /not automatically a permission/);
  assert.match(C.prohibitions.noImageRequestAuthorised, /never counts as an active send permission/);

  // EXACTLY ONE entry still has its call available, and it is D-143's. D-139's was made and
  // D-142's was never a permission, so neither of them leaves anything an adapter could act on.
  const unused = classified.filter((x) => x.hasAnUnusedCall);
  assert.equal(unused.length, 1, "exactly one live permission");
  assert.equal(unused[0].callId, "D-143-r3-underlay-core-v2");
  assert.equal(record.hasAnUnusedCall, false, "a spent record never has an unused call");
  const d139c = classified.find((x) => x.callId === "D-139-r3-underlay-head-only-v1");
  assert.equal(d139c.hasAnUnusedCall, false, "an absent mandateState must not read as unspent");

  // And NO entry — not even the live one — authorises a second call.
  assert.equal(classified.filter((x) => x.authorisesASecondCall).length, 0);
  const d139 = C.authorisedCalls.calls.find((e) => e.callId === "D-139-r3-underlay-head-only-v1");
  assert.match(d139.prohibitions.noRetry, /Exactly one fetch/);
  assert.match(d139.claim.furtherAttempt, /NEW owner decision and a NEW claim identity/);
  assert.match(C.prohibitions.noImageRequestAuthorised, /THREE entries/);
  assert.match(C.prohibitions.noImageRequestAuthorised, /ONE ACTIVE, UNSPENT permission/);
  assert.match(C.prohibitions.noImageRequestAuthorised, /not exercisable today/);
  // ...and it must say WHY precisely. "No adapter can send" is false — the D-139 adapter contains
  // send code. The true statement is that no adapter is pinned and authorised to send THIS call.
  assert.match(C.prohibitions.noImageRequestAuthorised,
    /no adapter in origin\/main is pinned and authorised to send D-143-r3-underlay-core-v2/);
  assert.match(C.prohibitions.noImageRequestAuthorised,
    /execution additionally requires its own owner instruction/);
});

test("SEMANTIC: the classifier reads the fields, not the position in the list", () => {
  // Non-vacuity. If classifyEntry were really keyed on "calls[1] is the record", these would pass
  // wrongly; keyed on the fields, marking D-139's entry spent must flip it, and stripping D-142's
  // markers must flip it back.
  const [d139, d142] = C.authorisedCalls.calls;
  assert.equal(classifyEntry(d139).spentRecord, false, "as written, D-139's entry carries no spent marker");
  assert.equal(classifyEntry({ ...d139, mandateState: "SPENT" }).spentRecord, true);
  assert.equal(classifyEntry({ ...d139, neverReuse: true }).spentRecord, true);
  const stripped = { ...d142 };
  delete stripped.mandateState;
  delete stripped.neverReuse;
  assert.equal(classifyEntry(stripped).spentRecord, false, "the two markers are what make it a record");

  // The same for the live permission: it is live because it SAYS mandateState UNSPENT, and it is
  // bound to one call because it SAYS noRetry and furtherAttempt. Remove either, and the answer
  // changes — so neither conclusion is an artefact of the entry's position.
  const d143e = C.authorisedCalls.calls.find((e) => e.decision === "D-143");
  assert.equal(classifyEntry(d143e).hasAnUnusedCall, true);
  assert.equal(classifyEntry(d143e).authorisesASecondCall, false);
  assert.equal(classifyEntry({ ...d143e, mandateState: "SPENT" }).hasAnUnusedCall, false);
  const unbound = { ...d143e, prohibitions: { ...d143e.prohibitions, noRetry: "" } };
  assert.equal(classifyEntry(unbound).authorisesASecondCall, true,
    "dropping noRetry must be visible, so the real entry's noRetry is doing the work");
});

test("SEMANTIC: D-141's preparedCall block is historical, and is not rewritten for D-143", () => {
  // This block belongs to D-141 and was last written by D-142. D-143 does NOT update it: the
  // owner's rule is that D-141/D-142 history is never rewritten to describe a later decision.
  // Its enumeration is therefore deliberately AS OF D-142 — two entries, neither of them D-141's —
  // and it must not be read as a statement about the list today.
  const t = C.preparedCall.authorisedCallsUnchanged;
  assert.ok(!/holds exactly one entry/.test(t), "the stale singular claim D-142 fixed must stay gone");
  assert.match(t, /Unchanged BY D-141/, "the key name means unchanged by D-141, and the text says so");
  assert.match(t, /TWO entries/, "as of D-142, and not restated for D-143");
  assert.ok(!/D-143/.test(t), "a historical block must not be rewritten to mention D-143");
  assert.ok(!C.authorisedCalls.calls.some((e) => e.decision === "D-141"), "and D-141 still has no entry");

  // The CURRENT state of the list lives in the general prohibition, which IS kept up to date.
  const live = C.prohibitions.noImageRequestAuthorised;
  assert.match(live, /THREE entries/);
  for (const e of C.authorisedCalls.calls) {
    assert.ok(live.includes(e.callId), "the current prohibition must name " + e.callId);
  }
});

test("the authorised-call list carries D-139's call, a spent record and one live permission", () => {
  // The failure mode: an authorisation that says "yes" without saying to what. Each of these fields
  // is something a wrong call would have to get right by accident.
  // D-142 added a SECOND entry, and it is deliberately NOT a permission: a record of an attempt
  // whose mandate is spent and whose outcome is unknown. Membership of this list is not consent.
  assert.equal(C.authorisedCalls.count, 3);
  assert.equal(C.authorisedCalls.calls.length, 3);
  assert.match(C.authorisedCalls.entriesAreNotAllPermissions, /a SPENT entry with neverReuse is a RECORD/);
  const spent = C.authorisedCalls.calls.filter((x) => x.mandateState === "SPENT");
  assert.equal(spent.length, 1, "exactly one entry is a spent record");
  assert.equal(spent[0].callId, "D-142-r3-underlay-core-v1");
  assert.match(C.authorisedCalls.shape, /A LIST, not a boolean/);
  assert.match(C.meta.authorisationModel, /stays false permanently/);

  const call = C.authorisedCalls.calls[0];
  assert.equal(call.callId, "D-139-r3-underlay-head-only-v1");
  assert.equal(call.decision, "D-139");
  assert.equal(call.endpoint, "https://api.openai.com/v1/images/edits");
  assert.equal(call.model, "gpt-image-2-2026-04-21");
  assert.match(call.modelPolicy, /requires a NEW owner decision/);
  assert.deepEqual(call.parameters, { n: 1, size: "1024x1536", quality: "high", output_format: "png", background: "transparent" });
  assert.equal(call.outputs.count, 1);
  assert.equal(call.claim.filename, "D-139.claim.json");
  for (const hash of [call.prompt.fileSha256, call.prompt.transmittedSha256, call.mask.sha256,
    call.inputs[0].sha256, call.inputs[1].sha256]) {
    assert.match(hash, /^[0-9a-f]{64}$/, "every pin must be a FULL sha256, never a prefix");
  }
  assert.deepEqual(call.inputOrder, ["Image 1", "Image 2"]);
  assert.equal(call.inputs[0].sha256, H1_SHA, "Image 1 is H1");
  assert.equal(call.inputs[1].sha256, TARGET_SHA, "Image 2 is North Star v2");
  assert.equal(call.inputs[0].maskAppliesToThis, true);
  assert.equal(call.inputs[1].maskAppliesToThis, false);
  assert.match(call.inputOrderBinding, /mask to the first image/);
});

test("the authorised call forbids retry, warp, repair, promotion and any other call", () => {
  const p = C.authorisedCalls.calls[0].prohibitions;
  assert.match(p.noRetry, /Exactly one fetch/);
  assert.match(p.noWarp, /never warped, scaled, nudged, re-registered or aligned/);
  assert.match(p.noRepair, /never repaired, cleaned up or touched up/);
  assert.match(p.noPromotion, /promotes nothing/);
  assert.match(p.noOtherCall, /this call only/);
  assert.match(p.noRuntimeChange, /No runtime, compositor, manifest, mask, golden, asset, deploy, Supabase/);
  assert.match(C.authorisedCalls.calls[0].claim.neverReused, /never deleted, reset, renamed or reused/);
});

test("the API mask is guidance; the byte-identity guarantee is still the recomposition", () => {
  // The dangerous shortcut this blocks: "we sent a mask, so the body cannot have changed".
  const mask = C.authorisedCalls.calls[0].mask;
  assert.match(mask.guidanceOnly, /NOT the guarantee that 0 pixels change/);
  assert.match(mask.guidanceOnly, /deterministic recomposition/);
  assert.match(mask.semantics.invertedRelativeToD133, /OPPOSITE/);
  assert.equal(mask.semantics.editAlpha, 0);
  assert.equal(mask.semantics.protectAlpha, 255);
  assert.equal(mask.derivedFrom.decision, "D-133");
  // and the recomposition it defers to is still the one D-132 wrote down
  assert.match(C.firstCall.recomposition.contract, /PRE-DEFINED, not after-the-fact repair/);
});

test("the ears are an owner-visual criterion, measured, and never called a machine gate", () => {
  const ear = C.authorisedCalls.calls[0].earPreservation;
  assert.match(ear.classification, /OWNER-VISUAL ACCEPTANCE CRITERION/);
  assert.match(ear.classification, /NOT a hard machine gate/);
  assert.equal(ear.measuredReadOnly.inTransition, 0);
  assert.equal(ear.measuredReadOnly.inProtect, 0);
  assert.match(ear.measuredReadOnly.inCore, /100%/);
  assert.match(ear.consequence, /does NOT preserve them byte-identically/);
  assert.match(ear.whyNotAGateYet, /new, separately approved mask/);
  assert.match(ear.prohibitedAfterTheFact, /after the output has been seen/);
  // the absence list it sits beside still does not mention ears, which is why this record exists
  assert.ok(!/ear/i.test(C.firstCall.gates.hardMachine.headRegion));
});

test("the budget keeps PLANNED capacity and ACTUALLY SENT calls apart", () => {
  // The trap D-143 has to avoid: raising a number in a JSON file is neither a claim that the call
  // was made nor permission to make it. The contract therefore carries both figures, and they
  // differ on purpose until a D-143 run actually happens.
  assert.equal(C.imageCallBudget.minimum, 17);
  assert.equal(C.imageCallBudget.maximum, 18);
  assert.equal(C.assets[0].calls, 3, "assets[].calls is PLANNED capacity");
  assert.equal(C.imageCallBudget.callsActuallySentSoFar.underlay, 2, "D-139 and the D-142 attempt");
  assert.equal(C.imageCallBudget.callsPlannedAndAuthorised.underlay, 3, "plus the one D-143 authorises");
  assert.equal(C.imageCallBudget.callsPlannedAndAuthorised.derivedBudget, "17-18");
  assert.match(C.imageCallBudget.callsActuallySentSoFar.note, /has not been sent/);
  assert.match(C.imageCallBudget.doNotConfuseTheTwo, /NOT permission to make it/);
  assert.match(C.imageCallBudget.countingRule, /ACTUALLY SENT/);
  assert.match(C.imageCallBudget.countingRule, /sent by accident/);
  assert.match(C.authorisedCalls.budgetAccounting, /planning, never consent/);
  assert.equal(C.imageCallBudget.isAuthorisation, false, "a bigger budget is still not permission");
  assert.equal(C.meta.authorisesImageRequest, false);
});

test("the reference pair is pinned by full sha256, and the target's pin matches the tracked file", () => {
  assert.equal(C.referencePair.targetFigure.sha256, TARGET_SHA);
  assert.equal(C.referencePair.authoringBase.sha256, H1_SHA);
  assert.equal(C.referencePair.rawProvenance.sha256, RAW_SHA);
  const tracked = join(REPO, C.referencePair.targetFigure.path);
  assert.ok(existsSync(tracked), "the target figure must be referenced at its existing tracked path");
  assert.equal(sha256(readFileSync(tracked)), TARGET_SHA, "the tracked target figure has changed");
});

test("H1 is external and is NOT copied into the repository", () => {
  assert.equal(C.referencePair.authoringBase.tracked, false);
  assert.match(C.prohibitions.noH1InRepository, /must not be copied into the repository/);
  const files = execFileSync("git", ["-C", REPO, "ls-files"], { encoding: "utf8" }).split("\n");
  const offenders = files.filter((p) => /fitting-base\.H1|refined\.raw/i.test(p));
  assert.deepEqual(offenders, [], "neither H1 nor the raw provenance image may be tracked");
  const r3dir = join(REPO, "tools", "avatar", "fixtures", "r3");
  const images = readdirSync(r3dir).filter((f) => /\.(png|webp|jpe?g)$/i.test(f));
  assert.deepEqual(images, [], "the r3 fixture directory holds the contract only, never an image");
});

test("H1's storage separates the binding policy from the observed location", () => {
  const a = C.referencePair.authoringBase;
  // The BINDING part: never tracked, never published, never deployable.
  assert.match(a.storagePolicy, /BINDING/);
  assert.match(a.storagePolicy, /NEVER be tracked/i);
  assert.match(a.storagePolicy, /never published/i);
  assert.match(a.storagePolicy, /assets\//);
  // The INTENDED archive of D-127 §2, kept distinct from what was actually observed.
  assert.match(a.storageIntended, /D-127/);
  assert.match(a.storageIntended, /external/i);
  // The OBSERVED state must not claim the file already sits outside the clones.
  assert.match(a.storageObserved, /VERIFIED READ-ONLY/);
  // D-133 §1 corrected this observation: the canonical H1 IS in D-127 §2's external archive,
  // and the copy inside the clone is a gitignored working/review copy, not the canonical store.
  assert.match(a.storageObserved, /IS in the external archive/i);
  assert.match(a.storageObserved, /WORKING[/]REVIEW copy/i);
  assert.ok(!/NOT yet in the external archive/i.test(a.storageObserved),
    "the withdrawn D-132 observation must not survive anywhere in this field");
  assert.match(a.storageCorrectedBy, /D-133/);
  assert.ok(!/\bEXTERNAL — outside both repositories\b/.test(JSON.stringify(a)),
    "the contract must not state as observed fact that H1 lies outside both repositories");
  assert.match(a.storageNoMoveAuthorised, /moves, copies and deletes nothing/);
});

test("H1 is recorded as an authoring model, never anatomical ground truth", () => {
  assert.match(C.referencePair.authoringBase.notAnatomicalGroundTruth, /never ground truth/);
  assert.match(C.referencePair.authoringBase.role, /AUTHORING/);
  assert.match(C.referencePair.targetFigure.role, /CLOTHED TARGET FIGURE/);
});

test("the geometric conclusion is stated no more broadly than the evidence", () => {
  assert.match(C.referencePair.pairEvidence.statement, /No material geometric drift has been demonstrated/);
  assert.match(C.referencePair.pairEvidence.notClaimed, /NOT a claim/);
  assert.equal(C.referencePair.pairEvidence.headBytesDifferingInsideHeadProtectMask, 0);
});

test("the crotch proxy is recorded as a diagnostic, never as a gate", () => {
  const c = C.referencePair.pairEvidence.crotchProxy;
  assert.match(String(c.measuredDeltaPx), /12/);
  assert.equal(c.status, "DIAGNOSTIC ONLY");
  assert.equal(c.isHardGate, false);
  assert.equal(c.isEvidenceOfMaterialDrift, false);
  assert.match(c.nature, /[Cc]lothing-sensitive/);
  assert.match(c.nature, /ambiguous/);
  assert.match(c.triggers, /must not trigger generation, warp, repair or promotion/);
  assert.match(c.noTolerance, /No tolerance is defined/);
  // and no tolerance was invented anywhere else for it: every OTHER field must stay silent about one
  const otherFields = Object.entries(c).filter(([k]) => k !== "noTolerance")
    .map(([k, v]) => k + ": " + String(v)).join(" | ");
  assert.ok(!/toleran/i.test(otherFields), "the crotch proxy must not carry a tolerance of its own");
});

test("the soft-alpha measurement states its definition and gates nothing", () => {
  const r = C.referencePair.rawProvenance;
  assert.match(r.softAlphaDefinition, /0 < alpha < 128/);
  assert.match(r.softAlphaDefinition, /alpha >= 128/, "it must anchor on the D-071 solid threshold");
  assert.match(r.softAlphaStatus, /PROVENANCE/);
  assert.match(r.softAlphaStatus, /NOT a new universal R3 acceptance threshold/);
  assert.match(r.softAlphaStatus, /gates nothing/);
  assert.match(r.relationToTarget, /27195 -> 6910/);
});

test("R3 is a shadow stack: default OFF, R2 untouched, fallback R3 -> R2 -> C2", () => {
  assert.equal(C.architecture.defaultEnabled, false);
  assert.deepEqual(C.architecture.fallbackChain, ["R3", "R2", "C2"]);
  assert.match(C.architecture.r2Guarantee, /byte-identical/);
  assert.match(C.architecture.rollback, /no data migration/);
  assert.equal(C.architecture.identityCoverage.bodyType, "neutral");
  assert.equal(C.architecture.identityCoverage.skinTone, "medium");
});

test("the layer contract carries every slot, and the three clothing slots are new", () => {
  const slots = C.layerContract.slots;
  const byName = Object.fromEntries(slots.map((s) => [s.slot, s]));
  for (const s of ["base", "blush", "face", "eyes", "tee", "trousers", "shoes", "torso", "hair"])
    assert.ok(byName[s], "missing slot " + s);
  for (const s of ["tee", "trousers", "shoes"]) assert.equal(byName[s].newInR3, true, s + " must be marked new");
  for (const s of ["base", "blush", "face", "eyes", "torso", "hair"]) assert.equal(byName[s].newInR3, false);
  assert.deepEqual(C.layerContract.canvas.master, [1024, 1536]);
  assert.deepEqual(C.layerContract.canvas.served, [512, 768]);
  assert.match(C.layerContract.alphaRule, /alpha >= 128/);
});

test("the BINDING layer rule is the relative paint order, and the slot list follows it", () => {
  const p = C.layerContract.paintOrder;
  assert.equal(p.binding, true);
  assert.match(p.rule, /RELATIVE paint order/);
  const order = p.bottomToTop;
  assert.equal(new Set(order).size, order.length, "a slot may appear once in the paint order");
  assert.deepEqual(C.layerContract.slots.map((s) => s.slot), order,
    "the slot list must be written in the binding paint order");
  const at = (s) => order.indexOf(s);
  assert.ok(at("base") === 0, "the underlay is the bottom layer");
  for (const s of ["tee", "trousers", "shoes"]) assert.ok(at(s) > at("base"), s + " paints above the underlay");
  assert.ok(at("torso") > at("tee"), "a cosmetic garment must sit above the default tee");
  assert.ok(at("hair") === order.length - 1, "hair paints above every face and clothing layer");
  assert.ok(p.invariants.length >= 4);
});

test("the numeric z values are approved by D-135 and point at the binding map", () => {
  const z = C.layerContract.zIndices;
  assert.equal(z.binding, true);
  assert.equal(z.mayBeImplemented, true);
  assert.equal(z.decision, "D-135");
  assert.match(z.status, /APPROVED by D-135/);
  assert.equal(z.seeZModel, "zModel");
  // the slot list still carries no bare z: the numbers live in one place, zModel
  for (const s of C.layerContract.slots)
    assert.ok(!("z" in s), "slot " + s.slot + " must not carry a bare z value; zModel is the map");
  assert.deepEqual(z.newlyFixedByD135, { tee: 10, trousers: 11, shoes: 12, torso: 20 });
  // the provisional record survives, including WHY 6/7/8 were replaced
  assert.match(z.supersededProvisional, /PROVISIONAL examples/);
  assert.match(z.supersededProvisional, /already taken INSIDE R3's own map/);
  assert.match(z.supersededProvisional, /cross-stack overlap is harmless/i);
});

test("an R3 garment may never paint over exposed arms or hands", () => {
  const o = C.occlusionContract;
  assert.equal(o.binding, true);
  assert.match(o.armHandInvariant, /NEVER unintentionally paint over exposed arms or hands/);
  assert.match(o.armHandInvariant, /stay visible/);
  assert.match(o.prerequisite, /PRE-REGISTERED and owner-approved BEFORE armor-knight/);
  assert.match(o.prerequisite, /precondition/);
  assert.match(o.fittingBaseMaskIsNotRuntime, /NOT automatically an R3 runtime mask/);
  assert.match(o.fittingBaseMaskIsNotRuntime, /no runtime authority/);
  assert.match(o.authorisation, /authorises no mask to be created, changed, derived or promoted/);
});

test("old R2 assets may never be a pixel source or a geometric authority", () => {
  for (const forbidden of ["a pixel source", "a geometric authority", "a basis for automatic warp"])
    assert.ok(C.pixelSourcePolicy.oldR2AssetsMayNotBe.includes(forbidden), "missing prohibition: " + forbidden);
  for (const forbidden of ["a finished garment mask", "automatic segmentation", "a pixel source for the tee, trousers or shoes"])
    assert.ok(C.pixelSourcePolicy.differenceAnalysisMayNotBe.includes(forbidden), "missing prohibition: " + forbidden);
});

test("the difference evidence is the qualitative conclusion, with no unreproducible counts", () => {
  const p = C.pixelSourcePolicy;
  assert.match(p.why, /ONE DOMINANT CONNECTED REGION/);
  assert.match(p.why, /neck to the feet/);
  assert.match(p.why, /mixes t-shirt, trousers, shoes, skin, body contour, alpha antialiasing and generative variation/);
  assert.match(p.why, /cannot be inverted into overlapping layers/);
  // no pinned pixel or component count may survive here, in the contract, or in the register
  assert.ok(!/\d[\d,.]{2,}/.test(p.why), "the rationale must carry no unreproducible pixel or component count");
  assert.match(p.whyNoExactFigure, /not independently reproducible/);
  assert.match(p.whyNoExactFigure, /metric, alpha threshold, colour threshold and connectivity/);
  const blob = JSON.stringify(C);
  for (const stale of ["215,300", "215300", "428 smaller components"])
    assert.ok(!blob.includes(stale), "the contract still carries the withdrawn figure " + stale);
  for (const stale of ["215,300", "215300", "428 smaller components"])
    assert.ok(!d132Row().includes(stale), "the D-132 register row still carries the withdrawn figure " + stale);
});

test("the asset list covers every reproduced layer, with unique names", () => {
  assert.equal(C.assets.length, 17);
  const names = C.assets.map((a) => a.name);
  for (const n of ["r3-base-neutral-medium", "r3-tee-default", "r3-trousers-default", "r3-shoes-default",
                   "r3-face-neutral", "r3-hair-northstar", "r3-torso-armor-knight"])
    assert.ok(names.includes(n), "missing asset " + n);
  assert.equal(new Set(names).size, names.length, "asset names must be unique");
  assert.equal(new Set(C.assets.map((a) => a.id)).size, C.assets.length, "asset ids must be unique");
});

test("the call budget is DERIVED from assets[].calls, and is a plan rather than consent", () => {
  let min = 0, max = 0;
  for (const a of C.assets) {
    if (typeof a.calls === "number") {
      assert.ok(Number.isInteger(a.calls) && a.calls >= 0, a.name + " has a bad call count");
      min += a.calls; max += a.calls;
      continue;
    }
    const m = /^(\d+)-(\d+)$/.exec(String(a.calls));
    assert.ok(m, a.name + " has an unreadable calls value: " + JSON.stringify(a.calls));
    const lo = Number(m[1]), hi = Number(m[2]);
    assert.ok(lo <= hi, a.name + " has an inverted call range");
    min += lo; max += hi;
  }
  assert.ok(min <= max, "the derived budget must not be inverted");
  assert.equal(min, 17, "D-143 made assets[0] a three-call asset, so the minimum is 17");
  assert.equal(max, 18, "the assets must sum to a maximum of exactly 18 calls");
  assert.equal(C.imageCallBudget.minimum, min, "the declared minimum must match the assets");
  assert.equal(C.imageCallBudget.maximum, max, "the declared maximum must match the assets");
  assert.equal(C.imageCallBudget.isAuthorisation, false);
  assert.match(C.imageCallBudget.derivedFrom, /sum of assets\[\]\.calls/);
});

test("the production order is enforced by its dependencies, not by its length", () => {
  const steps = C.productionOrder, ids = C.productionOrderIds;
  assert.equal(ids.length, steps.length, "every production step needs exactly one id");
  assert.equal(new Set(ids).size, ids.length, "production step ids must be unique");
  steps.forEach((s, i) => assert.ok(s.startsWith(String(i + 1) + " "), "step " + (i + 1) + " is out of order: " + s));

  const at = Object.fromEntries(ids.map((id, i) => [id, i]));
  for (const c of C.productionOrderConstraints) {
    assert.ok(c.before in at, "unknown constraint id: " + c.before);
    assert.ok(c.after in at, "unknown constraint id: " + c.after);
    assert.ok(c.why && c.why.length > 0, c.before + " -> " + c.after + " needs a reason");
    assert.ok(at[c.before] < at[c.after],
      "the approved order violates its own dependency: " + c.before + " must precede " + c.after);
  }

  // the dependencies that actually matter must be present, not merely consistent
  const has = (b, a) => C.productionOrderConstraints.some((c) => c.before === b && c.after === a);
  for (const a of ["face-neutral", "eyes-fixed", "iris", "hair-northstar", "tee", "trousers", "shoes"])
    assert.ok(has("underlay", a), "the underlay must precede " + a);
  for (const b of ["tee", "trousers", "shoes"])
    assert.ok(has(b, "runtime-masks"), b + " must precede the runtime masks");
  for (const b of ["underlay", "face-neutral", "eyes-fixed", "hair-northstar", "tee", "trousers", "shoes", "runtime-masks"])
    assert.ok(has(b, "first-slice-composition"), b + " must precede the blush-free first-slice composition");
  assert.ok(has("first-slice-composition", "automatic-check"), "the composition must precede the automatic check");
  // D-138 split the two: blush lands between the first-slice gate and the complete composition
  assert.ok(has("owner-visual-review", "blush"), "blush comes only after the first-slice gate");
  assert.ok(has("blush", "default-composition"), "the complete composition is the one that includes blush");
  assert.ok(has("automatic-check", "owner-visual-review"), "the automatic check must precede the owner review");
  for (const a of ["other-expressions", "other-hairstyles", "armor-knight"])
    assert.ok(has("owner-visual-review", a), "the owner review must precede " + a);
  for (const b of ["other-expressions", "other-hairstyles", "armor-knight"])
    assert.ok(has(b, "integration-canary-rollback"), b + " must precede integration and canary");
});

test("the first call is a head-only edit of H1 with a pre-defined recomposition", () => {
  const f = C.firstCall;
  assert.match(f.scope, /HEAD-ONLY EDIT/);
  assert.equal(f.inputs.image1.sha256, H1_SHA);
  assert.equal(f.inputs.image2.sha256, TARGET_SHA);
  assert.match(f.inputs.image2.binding, /must NOT be copied/);
  assert.match(f.recomposition.contract, /PRE-DEFINED/);
  const r = f.recomposition.rules.join(" ");
  assert.match(r, /byte-identically everywhere outside/);
  assert.match(r, /no generated pixel outside the permitted head region survives/);
});

test("the first call's gates demand byte identity, not a new tolerance", () => {
  const g = C.firstCall.gates;
  assert.match(g.hardMachine.protectedBody, /exactly 0 differing RGBA bytes/);
  assert.match(g.hardMachine.protectedTransition, /exactly 0 differing bytes/);
  assert.match(g.hardMachine.background, /alpha = 0/);
  assert.match(g.noNewTolerances, /0 differing pixels, not a tolerance/);
  assert.match(g.notCompared, /must NOT be compared directly with H1/);
  assert.ok(Array.isArray(g.ownerVisual) && g.ownerVisual.length >= 6);
});

test("the 50 KB size budget is documented as a torso gate that does not apply here", () => {
  const s = C.firstCall.gates.sizeBudget;
  assert.equal(s.applies, false);
  assert.match(s.finding, /promote-r2-torso-asset\.mjs/);
  assert.match(s.finding, /67,174 B and already exceeds it/);
  const base = join(REPO, "assets", "avatar-r2", "base", "body-neutral-medium-v2.webp");
  assert.ok(readFileSync(base).length > 50 * 1024, "the active base must still exceed 50 KB for this finding to hold");
});

test("the head mask check is recorded read-only, with both gaps, and no new mask was made", () => {
  const h = C.headMaskSuitability;
  assert.equal(h.checkedReadOnly, true);
  assert.equal(h.mask.sha256, HEAD_MASK_SHA);
  const mask = join(REPO, "tools", "avatar", "fixtures", "fitting-base", "head-protect-mask-v1.png");
  assert.equal(sha256(readFileSync(mask)), HEAD_MASK_SHA, "the head mask must be untouched");
  assert.deepEqual(h.semantics.alphaValues, [0, 255]);
  assert.equal(h.semantics.binary, true);
  assert.equal(h.geometry.px, 124099);
  assert.deepEqual(h.geometry.bbox, [292, 20, 732, 433]);
  assert.equal(h.gaps.length, 2);
  assert.match(h.gaps[0].finding, /445 H1 solid pixels/);
  assert.match(h.gaps[1].finding, /no transition ring/);
  assert.match(h.consequence, /No new mask has been created/);
  assert.match(h.prohibition, /NOT automatically promoted to runtime masks/);
});

test("the deterministic operations are only the four with documented precedent", () => {
  assert.equal(C.deterministicOperations.length, 4);
  for (const op of C.deterministicOperations) assert.ok(op.precedent && op.precedent.length > 0, op.op + " needs a precedent");
});

test("the first slice is neutral + medium, default hair, and needs no difference algorithm", () => {
  const s = C.firstSlice;
  assert.equal(s.identity.bodyType, "neutral");
  assert.equal(s.identity.skinTone, "medium");
  // D-138: the IDENTITY is a storable value; the asset key it resolves to is its own field.
  // 'northstar' is an asset key that D-137 maps to null, so it may never be an identity value.
  assert.equal(s.identity.hairstyle, "default");
  assert.equal(s.resolvedHairAssetKey, "northstar");
  assert.equal(s.equipment, "none");
  assert.match(s.mustNotDependOn, /difference algorithm/);
  assert.deepEqual(s.layers,
    ["technical underlay", "neutral face", "eyes fixed", "iris", "northstar hair", "tee", "trousers", "shoes"],
    "the first slice is the underlay, the neutral face and eyes, northstar hair and the default clothing");
});

test("no layer that is open or explicitly excluded may appear as a first-slice layer", () => {
  const open = C.openOwnerDecisions.join(" | ");
  // D-138 closed the blush question; it stays excluded from the first slice all the same
  assert.ok(!/whether blush is part of the first slice/i.test(open), "the blush question is closed by D-138");
  assert.ok(C.closedOwnerDecisions.some((d) => d.decision === "D-138" && /blush/i.test(d.was)),
    "the blush closure must be recorded");
  assert.ok(!C.firstSlice.layers.some((l) => /blush/i.test(l)), "blush must not appear in firstSlice.layers");
  assert.match(C.firstSlice.excluded.blush, /DELIBERATELY NOT in the first slice/);
  assert.match(C.firstSlice.excluded.blush, /settled by D-138/i);
  // the register must describe the same first slice, so the two artefacts cannot drift apart:
  // it may only mention blush in order to exclude it.
  const s10 = section(d132Row(), "(10) THE FIRST SLICE", "(11) THE TECHNICAL UNDERLAY");
  assert.match(s10, /blush is deliberately not part of it/i,
    "the register's first slice must say in so many words that blush is excluded");
  assert.ok(!/\+ *blush/i.test(s10), "the register must not list blush among the first-slice layers");

  // the generalised rule still holds: a slot that is either an OPEN decision or an explicit
  // exclusion may never be listed as a first-slice layer.
  for (const slot of C.layerContract.paintOrder.bottomToTop) {
    const isOpen = new RegExp("whether " + slot + " is part of the first slice", "i").test(open);
    const isExcluded = Object.prototype.hasOwnProperty.call(C.firstSlice.excluded ?? {}, slot);
    if (!isOpen && !isExcluded) continue;
    assert.ok(!C.firstSlice.layers.some((l) => new RegExp(slot, "i").test(l)),
      slot + " is open or excluded and must not be listed as a first-slice layer");
  }
});


test("D-133 to D-138 close every owner decision; none remains open", () => {
  const joined = C.openOwnerDecisions.join(" | ");
  const closed = C.closedOwnerDecisions.map((d) => d.was).join(" | ");
  assert.match(closed, /GAP-1/, "GAP-1 is closed, and the record of it must survive");
  assert.match(closed, /GAP-2/, "GAP-2 is closed, and the record of it must survive");
  for (const d of C.closedOwnerDecisions.filter((d) => /GAP-[12]/.test(d.was))) assert.equal(d.decision, "D-133");
  assert.ok(!/GAP-1|GAP-2/.test(joined), "a closed gap may not still be listed as open");
  // D-133 closed the two gaps, D-134 the arm/hand occlusion contract, D-135 the z values and the
  // R2/C2 coexistence, D-136 the iris method and D-137 the hairstyles. Only blush remains.
  assert.deepEqual(C.openOwnerDecisions, [], "D-138 closed the last one: none may remain open");
  assert.ok(C.closedOwnerDecisions.some((d) => d.decision === "D-134"), "D-134 must be recorded as a closing decision");
  assert.ok(!/occlusion\/protect contract/.test(joined), "the occlusion contract is closed by D-134");
  assert.ok(C.closedOwnerDecisions.some((d) => d.decision === "D-138" && /blush/i.test(d.was)),
    "blush is closed by D-138, not open");
});

test("the D-132 row exists in the register exactly once and is not rewritten by anything here", () => {
  const reg = readFileSync(REGISTER_PATH, "utf8");
  const row = d132Row();
  for (const d of ["D-129", "D-130", "D-131"]) {
    const n = reg.split("\n").filter((l) => l.startsWith("| **" + d + "** |")).length;
    assert.ok(n <= 1, d + " must not be duplicated");
  }
  assert.match(row, /R3/);
  assert.match(row, /no image request/i);
});

// ── D-141: a supplementary gate and a prepared, unauthorised call ────────────────────────────

test("D-141 adds a join gate without touching D-133 or D-139", () => {
  const g = C.joinContinuityGate;
  assert.equal(g.gate, "pre.join-continuity");
  assert.equal(g.decision, "D-141");
  assert.equal(g.runsBefore, "recomposition");
  assert.equal(g.joinTop, 424);
  assert.equal(g.joinBot, 425);
  assert.equal(g.pass, "observed <= bound");
  assert.match(g.onFailure, /no recomposed output is written/);
  // D-133's own contract is untouched
  assert.match(C.firstCall.recomposition.contract, /PRE-DEFINED, not after-the-fact repair/);
  assert.match(C.firstCall.gates.noNewTolerances, /the requirement is 0 differing pixels, not a tolerance/);
  // D-139's authorised call is untouched
  assert.equal(C.authorisedCalls.calls[0].callId, "D-139-r3-underlay-head-only-v1");
  assert.equal(C.authorisedCalls.calls[0].mask.sha256, "28ff1ac00f6972697411ad29c5618f9ede4b5a0a4fd086a41ec0bfb5fe7561fb");
});

test("the join bound is H1-derived, never a literal, and is named as a tolerance", () => {
  const g = C.joinContinuityGate;
  assert.equal(g.boundValueWithPinnedH1, 4);
  assert.match(g.boundDerivation, /computed at run time from the pinned H1 file/);
  assert.match(g.boundDerivation, /MUST NOT carry it as a literal/);
  assert.match(g.boundCharacter, /objectively H1-derived, pre-registered tolerance with no freely chosen number/);
  assert.match(g.crossCheck, /Northstar Master v2 yields the same value, 4/);
});

test("the join gate is explicit about its own limits", () => {
  const g = C.joinContinuityGate;
  assert.match(g.proves, /and nothing else/);
  assert.ok(g.doesNotProve.includes("absence of a visible seam"));
  assert.ok(g.doesNotProve.includes("that the API mask was followed byte-identically"));
  assert.equal(g.ownerVisualReviewRequired, true);
  assert.match(g.whyItExists, /invisible to every pre-registered gate/);
});

test("the D-139 output may not be reclassified by the new gate", () => {
  const h = C.joinContinuityGate.historicalDiagnosticOnly;
  assert.equal(h.observed, 33);
  assert.equal(h.result, "FAIL");
  assert.match(h.mayNotReclassify, /never be used to reclassify, re-judge or promote/);
  assert.match(h.mayNotReclassify, /noRefit stands/);
});

test("preparedCall is superseded WITHOUT becoming a permission", () => {
  // D-142 superseded it. The dangerous reading is that superseding a refusal grants something —
  // it does not: there is no send path, and the D-142 entry is a spent record.
  assert.equal(C.preparedCall.status, "SUPERSEDED BY D-142 — STILL NOT A PERMISSION");
  assert.equal(C.preparedCall.supersededBy, "D-142");
  assert.equal(C.preparedCall.callId, null, "it never acquired a call id");
  assert.equal(C.preparedCall.authorises, "nothing");
  assert.match(C.preparedCall.supersessionNote, /creates NO active send permission/);
  assert.ok(!C.authorisedCalls.calls.some((x) => x.decision === "D-141"));
  assert.equal(C.meta.authorisesImageRequest, false);
});

test("the D-142 entry is a record of an incident, not an authorisation", () => {
  const rec = C.authorisedCalls.calls.find((x) => x.decision === "D-142");
  assert.ok(rec, "the incident must be recorded");
  assert.equal(rec.mandateState, "SPENT");
  assert.equal(rec.outcome, "UNKNOWN");
  assert.equal(rec.neverReuse, true);
  assert.match(rec.notAnActivePermission, /RECORD, not a permission/);
  assert.match(rec.producedNoOutput, /No raw output, no request manifest/);
  assert.equal(rec.incident.claimSha256, "004c3116f2392ad872fef28143a0dfa11a924f6b8cefcecd7e2dda407448a9d6");
  assert.equal(rec.incident.when, "2026-09-14T16:33:10.436Z");
  assert.match(rec.evidence.absenceIsNotProof, /NOT evidence that no request was sent/);
  assert.match(rec.prohibitions.noClaimReset, /never deleted, reset, renamed or restored/);
  assert.match(rec.prohibitions.noFurtherAttempt, /its own owner decision/);
});

test("the binding rule for future sends is recorded, and its implementation is deferred", () => {
  const r = C.futureSendAuthorisationRule;
  assert.equal(r.decision, "D-142");
  assert.match(r.rule, /only by the exact decision row and authorisation entry present in origin\/main/);
  assert.match(r.rule, /NOT sufficient/);
  assert.match(r.theFunctionThatCanFetchMustCheckItself, /BEFORE the claim is created/);
  assert.deepEqual(r.mustNotAccept, [
    "a caller-supplied git ref",
    "caller-supplied register content",
    "a caller-supplied contract object",
    "a caller-supplied preflight result",
  ]);
  assert.ok(r.refuseBeforeClaimAndFetch.length >= 8);
  assert.match(r.implementationDeferred, /No send path is implemented by D-142/);
  assert.match(r.testPlanCorrection, /cannot be the same test/);
  assert.match(r.noTestContextGuard, /deliberately NOT introduced now/);
});

test("D-141's mask derivation is recorded as a second narrow supersession, not a new licence", () => {
  assert.match(C.prohibitions.noMaskWork, /creates, changes, derives and promotes no mask/);
  assert.match(C.prohibitions.noMaskWork, /SUPERSEDED AGAIN, equally narrowly, BY D-141/);
  assert.match(C.prohibitions.noMaskWork, /EDIT minus TRANSITION/);
  assert.match(C.prohibitions.noMaskWork, /no mask is promoted to runtime/);
});

test("the D-141 row exists exactly once, with the owner's decision date", () => {
  const rows = readFileSync(REGISTER_PATH, "utf8").split("\n").filter((l) => l.startsWith("| **D-141** |"));
  assert.equal(rows.length, 1);
  assert.match(rows[0], /\(2026-09-14\)/);
  assert.match(rows[0], /autoriserer INTET billedkald/);
});

// ── D-143: one authorised call, and nothing in this repository that can make it ──────────────

const D143_ID = "D-143-r3-underlay-core-v2";
const d143 = () => C.authorisedCalls.calls.find((e) => e.callId === D143_ID);

test("D-143 authorises exactly one call, by id, with every pin it needs", () => {
  const e = d143();
  assert.ok(e, "D-143 must have an entry");
  assert.equal(e.decision, "D-143");
  assert.equal(e.authorisedOn, "2026-09-15");
  assert.equal(e.mandateState, "UNSPENT");
  assert.equal(e.outcome, "NOT YET ATTEMPTED");
  assert.equal(e.endpoint, "https://api.openai.com/v1/images/edits");
  assert.equal(e.model, "gpt-image-2-2026-04-21");
  assert.deepEqual(e.parameters, { n: 1, size: "1024x1536", quality: "high", output_format: "png", background: "transparent" });
  assert.equal(e.omitted.input_fidelity.includes("invalid_input_fidelity_model"), true);
  assert.equal(e.outputs.count, 1);
  assert.deepEqual(e.inputOrder, ["Image 1", "Image 2"]);
  assert.match(e.inputOrderBinding, /H1 MUST be the first image/);
});

test("D-143's pins are byte-identical to the D-141 preparation and the D-139 reference pair", () => {
  const e = d143();
  // The prompt and mask D-141 prepared, unchanged.
  assert.equal(e.prompt.fileSha256, "8a4e817f0a9171968211a2b4c90dff3d6507ca9dc6f3e73b5edc2bf9bc9ec141");
  assert.equal(e.prompt.fileBytes, 6242);
  assert.equal(e.prompt.transmittedSha256, "76cf56fb408bb65d7458645095469aa9c38c8731d4f9db23872edb30954aa693");
  assert.equal(e.prompt.transmittedBytes, 2731);
  assert.equal(e.prompt.preparedBy, "D-141");
  assert.equal(e.mask.sha256, "556fb973d6dd623828e4aab42d804bf05ab1df67c037498423afd607cec55dab");
  assert.equal(e.mask.bytes, 10703);
  assert.equal(e.mask.decision, "D-141");
  assert.equal(e.mask.semantics.bandEditablePx, 0, "the CORE mask offers the band to nobody");
  assert.equal(e.mask.semantics.editablePx, 123721);
  assert.equal(e.mask.semantics.protectedPx, 1449143);
  // The same reference pair D-139 used, by hash.
  const d139 = C.authorisedCalls.calls.find((x) => x.callId === "D-139-r3-underlay-head-only-v1");
  assert.equal(e.inputs[0].sha256, d139.inputs[0].sha256, "same H1");
  assert.equal(e.inputs[1].sha256, d139.inputs[1].sha256, "same Northstar");
  assert.equal(e.inputs[0].tracked, false, "H1 is external and pinned by hash alone");
  assert.equal(e.model, d139.model, "same pinned snapshot; no fallback model");
  assert.deepEqual(e.parameters, d139.parameters);
  // and D-139's own mask is on the never-send list
  assert.ok(e.neverSentMasks.files.includes("r3-underlay-api-mask-v1.png"));
  assert.match(e.mask.whyNotD139sMask, /must never be sent again/);
  // The exclusion must rest on the mask's own terms, NOT on a causal claim. D-140 records that the
  // cause of the 644 px deviation is undetermined, so this contract may not settle it in passing.
  assert.match(e.mask.whyNotD139sMask, /Whether the editable transition band was the whole cause, part of the cause, or not a cause/);
  assert.match(e.mask.whyNotD139sMask, /NOT established/);
  assert.match(e.mask.whyNotD139sMask, /D-140 records[\s\S]*the cause is undetermined/);
  assert.match(e.mask.whyNotD139sMask, /excluded on its own terms/);
  assert.ok(!/which is exactly what pre\.transition-silhouette then failed on/.test(e.mask.whyNotD139sMask),
    "the mask must not be asserted as the established cause");
});

test("D-143's identity is new, and D-142's is never reused", () => {
  const e = d143();
  assert.equal(e.claim.filename, "D-143.claim.json");
  const spent = C.authorisedCalls.calls.find((x) => x.decision === "D-142");
  assert.notEqual(e.callId, spent.callId);
  assert.notEqual(e.claim.filename, spent.claim ? spent.claim.filename : "D-142.claim.json");
  assert.equal(spent.mandateState, "SPENT", "and D-142 stays spent");
  assert.equal(spent.outcome, "UNKNOWN", "and its outcome is not reclassified");
  assert.match(e.history.notAReuseOfD142, /never reuses D-142's mandate, call id or claim identity/);
  assert.match(e.claim.notCreatedByThisDecision, /does NOT create this claim/);
  assert.match(e.prohibitions.noClaimReset, /never deleted, reset, renamed or restored/);
});

test("D-143 describes its own history honestly", () => {
  const h = d143().history;
  assert.match(h.payloadIsByteIdentical, /BYTE-IDENTICAL to the payload that was probably sent/);
  assert.match(h.payloadIsByteIdentical, /NEW AUTHORISED SEND of the same frozen request/);
  assert.match(h.firstObservableAttempt, /first OBSERVABLE attempt/);
  assert.match(h.firstObservableAttempt, /not necessarily the first time the request is sent/);
  assert.match(h.d142StaysUnknown, /stays UNKNOWN/);
  assert.match(h.d142StaysUnknown, /not reclassified/);
  assert.match(h.whatThisMeansForD141, /remains UNTESTED in practice/);
  // and the framings that would launder the history are named and forbidden
  assert.match(h.forbiddenFramings, /never be described as a first-time call/);
  assert.match(h.forbiddenFramings, /resumption or retry of D-142/);
  assert.match(h.forbiddenFramings, /reuse of an earlier mandate/);
});

test("D-143 delivers NO send path, and does not touch either existing adapter", () => {
  const a = d143().adapter;
  assert.match(a.file, /NOT YET IMPLEMENTED/);
  // The claim has to be exact: the CORE preparation adapter cannot send and D-143 adds no send
  // path — but the D-139 adapter DOES contain send code, and the contract must not deny it. It is
  // harmless here because it is pinned to its own call id and its own mandate is already spent.
  assert.match(a.notInThisRepositoryYet, /CORE preparation adapter still cannot send/);
  assert.match(a.notInThisRepositoryYet, /D-143 adds no new send path/);
  assert.match(a.notInThisRepositoryYet, /does not change it by one byte/);
  assert.match(a.notInThisRepositoryYet, /D-139 adapter DOES contain send code and that is not denied/);
  assert.match(a.notInThisRepositoryYet, /pinned to its own call id/);
  assert.ok(!/No adapter in origin\/main can send/.test(a.notInThisRepositoryYet),
    "the over-broad claim must be gone");
  assert.match(a.d139AdapterUntouched, /neither imports, extends nor modifies it/);

  // and that is checked against the files, not only asserted in prose
  const core = readFileSync(join(REPO, "tools", "avatar", "openai-generate-r3-underlay-core.mjs"), "utf8");
  const code = core.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
  for (const forbidden of ["FormData", "OPENAI_API_KEY", "Authorization", "openSync", "createClaim", '"wx"']) {
    assert.ok(!code.includes(forbidden), "the preparation adapter must still not contain " + JSON.stringify(forbidden));
  }
  assert.ok(!/[^"'\w]fetch\s*\(/.test(code), "the preparation adapter must still contain no fetch call");
  // its own decision list must NOT have been extended — the send adapter carries its own
  assert.match(core, /REQUIRED_DECISIONS = Object\.freeze\(\["D-132", "D-133", "D-139", "D-140", "D-141"\]\)/);
  assert.match(a.ownRequiredDecisions, /at least D-132, D-133, D-139, D-140, D-141, D-142 and D-143/);
  assert.match(a.ownRequiredDecisions, /preparation adapter's list must not be extended/);
});

test("D-143's send path must verify ITSELF in origin/main before the claim", () => {
  const a = d143().adapter;
  const req = a.sendRequiresAll.join(" | ");
  assert.match(req, /HEAD equal to the local origin\/main commit used as the authorisation basis/);
  assert.match(req, /byte-identical to its blob there/);
  assert.match(req, /present in origin\/main/);
  assert.match(req, /present exactly once in the origin\/main register/);
  assert.match(req, /present exactly once in the origin\/main contract, active and unspent/);
  assert.match(req, /byte-identical between the working tree and origin\/main/);
  assert.match(req, /no D-143 claim file existing yet/);
  assert.match(a.refuseBeforeClaimAndFetch, /BEFORE the claim is created and before the fetch/);
  assert.match(a.refuseBeforeClaimAndFetch, /locally-present or uncommitted send adapter can therefore never use/);
  assert.deepEqual(a.mustNotAccept, [
    "a caller-supplied git ref",
    "caller-supplied register content",
    "a caller-supplied contract object",
    "a caller-supplied preflight result",
  ]);
  assert.equal(d143().claim.recordsTheRef.includes("written into the claim and into the manifest"), true);
  // it obeys D-142's rule rather than inventing its own
  assert.equal(C.futureSendAuthorisationRule.decision, "D-142");
});

test("D-143's send path takes no test hook, and its send function is not exported", () => {
  const a = d143().adapter;
  assert.match(a.noTestHooks, /NO test injection point of any kind/);
  for (const hook of ["fetch module", "fetch implementation", "claim path", "output directory", "git ref"]) {
    assert.ok(a.noTestHooks.includes(hook), "the prohibition must name " + hook);
  }
  assert.match(a.noTestHooks, /mocked from OUTSIDE by the Node process/);
  assert.match(a.sendFunctionNotExported, /must not be exported, so no test can import it/);
  assert.match(a.sendFunctionNotExported, /running the real CLI inside an isolated sandbox/);
  assert.match(a.oneFlagNeverSends, /No single flag sends/);
});

test("D-143 keeps a manifest for every outcome, and nothing may delete it", () => {
  const o = d143().outputs;
  assert.match(o.manifestOnEveryOutcome, /EVERY outcome after the claim and the fetch/);
  for (const stage of ["transport error", "HTTP error", "parse failure", "decode failure", "success"]) {
    assert.ok(o.manifestOnEveryOutcome.includes(stage), "the manifest rule must cover " + stage);
  }
  assert.match(o.manifestOnEveryOutcome, /origin\/main commit SHA/);
  assert.match(o.neverDeleted, /No production or test code may delete the output directory or the manifest/);
  assert.match(o.crashLeavesUnknown, /reported as UNKNOWN/);
  assert.match(o.crashLeavesUnknown, /never lead to a retry/);
  assert.equal(o.raw, "tools/avatar/build/r3-underlay-core/r3-underlay-core.raw.png");
  assert.equal(o.manifest, "tools/avatar/build/r3-underlay-core/r3-underlay-core.request.json");
});

test("D-143 is exactly one attempt, with every gate and the owner review still mandatory", () => {
  const e = d143();
  assert.match(e.prohibitions.noRetry, /Exactly one fetch/);
  assert.match(e.prohibitions.noRetry, /No loop, no retry, no fallback model/);
  assert.match(e.prohibitions.noWarp, /never warped, scaled, nudged, re-registered or aligned/);
  assert.match(e.prohibitions.noRepair, /never repaired, cleaned up or touched up/);
  assert.match(e.prohibitions.noRefit, /never re-fitted to the output/);
  assert.match(e.prohibitions.noPromotion, /promotes nothing/);
  assert.match(e.prohibitions.noReclassifyD139, /stays rejected under pre\.transition-silhouette at 644 px/);
  assert.match(e.prohibitions.noRuntimeChange, /No runtime, compositor, resolver, manifest, mask, golden, asset, deploy, Supabase/);
  assert.match(e.claim.spentOn, /Existence alone means spent/);
  assert.match(e.claim.creation, /exclusive create, flag/);

  assert.equal(e.acceptance.machineGatesMandatory.length, 5);
  const gates = e.acceptance.machineGatesMandatory.join(" | ");
  for (const g of ["pre.transition-silhouette", "pre.join-continuity", "post.protected-bytes",
    "post.transition-silhouette", "post.coverage"]) {
    assert.ok(gates.includes(g), "gate missing: " + g);
  }
  assert.match(gates, /derived from H1 at run time, never a literal/);
  assert.match(e.acceptance.ownerVisualReviewMandatory, /machine gates do not substitute for it/);
  for (const size of ["1:1", "52x78", "110x165", "100x150", "180x270"]) {
    assert.ok(e.acceptance.ownerVisualReviewMandatory.includes(size), "review scale missing: " + size);
  }
  assert.match(e.acceptance.onFailure, /hard stop/);
});

test("the D-143 row exists exactly once, and carries the decision's own pins", () => {
  const REG_TEXT = readFileSync(REGISTER_PATH, "utf8");
  const rows = REG_TEXT.split("\n").filter((l) => l.startsWith("| **D-143** |"));
  assert.equal(rows.length, 1, "exactly one D-143 row");
  const row = rows[0];
  assert.match(row, /OWNER DECISION/);
  assert.match(row, /D-143-r3-underlay-core-v2/);
  assert.match(row, /D-143\.claim\.json/);
  assert.match(row, /gpt-image-2-2026-04-21/);
  for (const pin of [
    "76cf56fb408bb65d7458645095469aa9c38c8731d4f9db23872edb30954aa693",
    "556fb973d6dd623828e4aab42d804bf05ab1df67c037498423afd607cec55dab",
    "72875565ecd62b542a91156dbcca1399a434fe04634f4e737df71337be0d5af4",
    "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50",
  ]) assert.ok(row.includes(pin), "the row must pin " + pin.slice(0, 12));
  assert.equal(row.includes("(2026-09-15) |"), true);
  // the honest history, in the permanent record
  assert.match(row, /ikke genbrug/);
  assert.match(row, /byte-identisk/);
  assert.match(row, /ikke nødvendigvis første gang requesten sendes/);
  // and the earlier rows are not rewritten
  for (const d of ["D-139", "D-140", "D-141", "D-142"]) {
    assert.equal(REG_TEXT.split("\n").filter((l) => l.startsWith("| **" + d + "** |")).length, 1, d + " stays a single row");
  }
});

// ── D-143 adds ONE authorisation and rewrites nothing that came before ───────────────────────
//
// The pins below are of the PR's base, 6b9777121f03a3b86575df77c572d20bf6482065, taken before
// D-143 was written. They exist because a later decision is exactly when history is most likely
// to get quietly "tidied up" to match it. sha256 of the canonical JSON is used so that a single
// changed byte anywhere inside a block fails, including a reordered or added key.

const BASE_COMMIT = "6b9777121f03a3b86575df77c572d20bf6482065";
const BASE_PINS = {
  preparedCall: "ee531f9d8e11f121a5c898be94c8c1282db6ebf26dd83ed08ed4bf4349e16caa",
  d139Entry: "a1d393378b97d1fa99f880c23afeca52f9c4e9d5e646dd629e888c307377c930",
  d142Entry: "9412797e1665a938c84230a2219657887e1c55f2631440ff98582e8072fdcde0",
  rows: {
    "D-139": "a8d0afb3ed8251c6f8acf361515019c5805e43f55e8ab93fcbdd5a0a53ce3c3f",
    "D-140": "405d30518960d2f9268238094fe1f6f5e56922b195fbd354135cfc618cd75e2c",
    "D-141": "4eb2e49275f097b4399ee723c66471bebb256e2b822793b430a119fd67d5c4f8",
    "D-142": "e13529d431055286431d24e13b77c82be6c4f0c0b38cd8e76e8a37a08e127185",
  },
};
const canon = (v) => sha256(JSON.stringify(v));

test("PROOF 1: preparedCall is byte-identical to the base and says nothing about D-143", () => {
  // D-141's prepared-call block belongs to D-141, last written by D-142. D-143 reuses what it
  // prepared, and records that reuse in ITS OWN row and entry — never by editing this block.
  assert.equal(canon(C.preparedCall), BASE_PINS.preparedCall,
    "preparedCall must be unchanged from " + BASE_COMMIT);
  assert.equal(C.preparedCall.status, "SUPERSEDED BY D-142 — STILL NOT A PERMISSION");
  assert.deepEqual(Object.keys(C.preparedCall), [
    "status", "supersededBy", "supersededOn", "supersessionNote", "decision", "callId",
    "authorises", "prepares", "adapterContract", "requiresBeforeAnySend", "notAnAuthorisedCall",
    "authorisedCallsUnchanged", "noAdapterImplemented", "oneCallCanStillFail",
  ], "no key added, removed or reordered");
  for (const gone of ["realisedBy", "realisedOn", "realisationNote"]) {
    assert.ok(!(gone in C.preparedCall), gone + " must not exist: it would rewrite D-141 for D-143");
  }
  assert.ok(!/D-143/.test(JSON.stringify(C.preparedCall)),
    "a historical block must not mention a later decision at all");
  assert.equal(C.preparedCall.callId, null);
  assert.equal(C.preparedCall.authorises, "nothing");
});

test("PROOF 2: D-143's own entry names the reused, pinned D-141 artefacts", () => {
  // Every artefact preparedCall lists as prepared must reappear, by hash, inside D-143's entry —
  // so the reuse is provable from D-143's side without touching D-141's block.
  const e = C.authorisedCalls.calls.find((x) => x.decision === "D-143");
  assert.ok(e, "D-143 must have its own entry");
  const prepared = C.preparedCall.prepares;
  assert.equal(prepared.length, 3);

  // (a) the CORE API mask D-141 prepared
  assert.ok(prepared.includes(e.mask.file), "the entry must use the prepared CORE mask, not another");
  assert.equal(e.mask.decision, "D-141", "and credit D-141 for it");
  assert.equal(e.mask.sha256, "556fb973d6dd623828e4aab42d804bf05ab1df67c037498423afd607cec55dab");
  assert.equal(e.mask.bytes, 10703);

  // (b) prompt v2, which D-141 prepared
  assert.ok(prepared.includes(e.prompt.file), "the entry must use the prepared prompt v2");
  assert.equal(e.prompt.preparedBy, "D-141");
  assert.equal(e.prompt.fileSha256, "8a4e817f0a9171968211a2b4c90dff3d6507ca9dc6f3e73b5edc2bf9bc9ec141");
  assert.equal(e.prompt.transmittedSha256, "76cf56fb408bb65d7458645095469aa9c38c8731d4f9db23872edb30954aa693");

  // (c) pre.join-continuity, D-141's gate, is mandatory in D-143's own acceptance pipeline
  const joinPrepared = prepared.find((p) => p.startsWith("pre.join-continuity"));
  assert.ok(joinPrepared, "D-141 prepared the join gate");
  const gates = e.acceptance.machineGatesMandatory.join(" | ");
  assert.match(gates, /pre\.join-continuity/);
  assert.match(gates, /\(D-141\)/, "and D-143 credits D-141 for it");
  assert.match(gates, /derived from H1 at run time, never a literal/);

  // the reuse is recorded in D-143's register row too, not in D-141's
  const REG_TEXT = readFileSync(REGISTER_PATH, "utf8");
  const row = REG_TEXT.split("\n").filter((l) => l.startsWith("| **D-143** |"))[0];
  assert.ok(row, "the D-143 row must exist");
  assert.match(row, /556fb973d6dd623828e4aab42d804bf05ab1df67c037498423afd607cec55dab/);
  assert.match(row, /76cf56fb408bb65d7458645095469aa9c38c8731d4f9db23872edb30954aa693/);
  assert.match(row, /pre\.join-continuity/);
});

test("PROOF 3: D-143 adds exactly one authorisation and changes no earlier decision's meaning", () => {
  // exactly one new entry, and it is D-143's
  assert.equal(C.authorisedCalls.calls.length, 3);
  assert.equal(C.authorisedCalls.count, 3);
  const byDecision = C.authorisedCalls.calls.map((x) => x.decision);
  assert.deepEqual(byDecision, ["D-139", "D-142", "D-143"]);
  assert.equal(byDecision.filter((d) => d === "D-143").length, 1, "exactly ONE new authorisation");

  // the two entries that were already there are byte-identical to the base
  assert.equal(canon(C.authorisedCalls.calls[0]), BASE_PINS.d139Entry, "D-139's entry is untouched");
  assert.equal(canon(C.authorisedCalls.calls[1]), BASE_PINS.d142Entry, "D-142's entry is untouched");

  // and so are the register rows of every decision that precedes it
  const REG_TEXT = readFileSync(REGISTER_PATH, "utf8").split("\n");
  for (const [id, pin] of Object.entries(BASE_PINS.rows)) {
    const rows = REG_TEXT.filter((l) => l.startsWith("| **" + id + "** |"));
    assert.equal(rows.length, 1, id + " must still be exactly one row");
    assert.equal(sha256(rows[0]), pin, id + "'s row must be byte-identical to " + BASE_COMMIT);
  }

  // D-142 keeps its meaning: spent, unknown, never reused — and D-143 takes a different identity
  const spent = C.authorisedCalls.calls[1];
  assert.equal(spent.mandateState, "SPENT");
  assert.equal(spent.outcome, "UNKNOWN");
  assert.equal(spent.neverReuse, true);
  const live = C.authorisedCalls.calls[2];
  assert.notEqual(live.callId, spent.callId);
  assert.notEqual(live.claim.filename, "D-142.claim.json");
  assert.equal(live.claim.filename, "D-143.claim.json");

  // and nothing global was loosened on the way
  assert.equal(C.meta.authorisesImageRequest, false);
  assert.equal(C.imageCallBudget.isAuthorisation, false);
});

test("PROOF 4: no text claims that sending is impossible IN GENERAL", () => {
  // Two separate facts, easy to collapse into one false sentence:
  //   (a) the CORE preparation adapter cannot send, and this PR adds no new send path;
  //   (b) the D-139 adapter DOES contain send code — it is simply pinned to its own call id and
  //       its own mandate is already spent.
  // Every claim in the contract and the register must be of the precise form: no adapter is
  // pinned and authorised to send D-143's call.
  const contract = readFileSync(CONTRACT_PATH, "utf8");
  const register = readFileSync(REGISTER_PATH, "utf8");
  const both = contract + "\n" + register;
  for (const overBroad of [
    /no adapter in origin\/main can send(?!\s+D-143)/i,
    /nothing in the repository (is )?able to send/i,
    /no adapter in the repository can send/i,
    /Ingen adapter i `?origin\/main`? kan sende/i,
  ]) {
    assert.ok(!overBroad.test(both), "an over-broad cannot-send claim survives: " + overBroad);
  }

  // and the D-139 adapter's send code is acknowledged rather than denied
  const e = C.authorisedCalls.calls.find((x) => x.decision === "D-143");
  assert.match(e.adapter.notInThisRepositoryYet, /D-139 adapter DOES contain send code and that is not denied/);
  assert.match(e.adapter.notInThisRepositoryYet, /Nothing in origin\/main can send D-143's call/);
  assert.match(e.adapter.d139AdapterUntouched, /neither imports, extends nor modifies it/);
  const row = register.split("\n").filter((l) => l.startsWith("| **D-143** |"))[0];
  assert.match(row, /\*\*har send-kode\*\*/, "the register row must acknowledge D-139's send code");
  assert.match(row, /kan derfor ikke udføre D-143's kald/);
});

test("PROOF 5: the register row does not settle the cause of D-139's band failure either", () => {
  const register = readFileSync(REGISTER_PATH, "utf8");
  const row = register.split("\n").filter((l) => l.startsWith("| **D-143** |"))[0];
  assert.match(row, /IKKE fastslået/, "the row must say the cause is undetermined");
  assert.match(row, /hele årsagen, en del af årsagen eller slet ikke en årsag/);
  assert.match(row, /D-140 fastslår udtrykkeligt, at årsagen er uafgjort/);
  assert.match(row, /på sine egne præmisser/, "the mask is excluded on its own terms");
  assert.ok(!/hvilket er præcis det, `pre\.transition-silhouette` derefter fejlede/.test(row),
    "the causal claim must be gone from the register row too");

  // and D-140's own row still says it, unchanged — this PR did not weaken that finding
  const d140 = register.split("\n").filter((l) => l.startsWith("| **D-140** |"))[0];
  assert.match(d140, /Om det er den fulde eller delvise årsag til båndafvigelsen er ikke fastslået her/);
  assert.equal(sha256(d140), BASE_PINS.rows["D-140"], "D-140's row is byte-identical to the base");
});

// ── D-145 records the implementation APPEND-ONLY and rewrites nothing that came before ────────
//
// D-143's authorisation entry is the historical snapshot of what was authorised. D-145 does not edit
// it to say "implemented"; it adds adapterImplementations beside it. The pins below are of the
// merged state, 39cbdaaaff58d7961c144e9d44d801131b6b7f4e, and of the D-145 entry as decided, so a
// later decision cannot quietly tidy either of them.

const D145_BASE_COMMIT = "39cbdaaaff58d7961c144e9d44d801131b6b7f4e";
const D145_PINS = {
  d143Entry: "6ca1754aedd8351349ab725e063190c6f265af16f79cde4fad86ad6a2c16ef6d",
  d143Row: "3bb664ce0c0ffd675c1b1aa5d477e5be91fffddd8c1c451d8cbb03d4285d2e8d",
  d144Row: "e5706b11e66915855ef371cfde0a054c91850522c90d10d1709d380ddbdfd8cb",
  prohibitions: "4b9fadcc85ec4e9f7dfbdee8f94084e2fc99ad43fa42f9c67fa8801babcd8218",
  d145Entry: "53b144c02ea9d6bc5f5fa9ce22652dcff4a3f1fc56c3b84c3a39cb95f95e3de6",
  d145Row: "e61ed27370b2ad0860585f116b97aa14d72e1062686a0dedc6bca6af9860f551",
};
const D145_ADAPTER = "tools/avatar/openai-send-r3-underlay-core-d143.mjs";
const d145Entry = () => (C.adapterImplementations && Array.isArray(C.adapterImplementations.entries)
  ? C.adapterImplementations.entries.filter((e) => e && e.decision === "D-145") : []);

test("D-145 PROOF: the D-143 authorisation snapshot, its row and the prohibitions are untouched", () => {
  assert.equal(D145_BASE_COMMIT.length, 40);
  assert.equal(canon(d143()), D145_PINS.d143Entry, "the D-143 entry is its merged snapshot, byte for byte");
  assert.equal(canon(C.prohibitions), D145_PINS.prohibitions, "the prohibitions are not rewritten to match the implementation");
  const lines = readFileSync(REGISTER_PATH, "utf8").split("\n");
  assert.equal(sha256(lines.find((l) => l.startsWith("| **D-143** |"))), D145_PINS.d143Row, "the D-143 row is not rewritten");
  assert.equal(sha256(lines.find((l) => l.startsWith("| **D-144** |"))), D145_PINS.d144Row, "the D-144 row is not rewritten");
  // the snapshot still says what it said on the day of authorisation — D-145 reads it, it does not edit it
  assert.match(d143().status, /NO SEND PATH EXISTS YET/);
  assert.match(d143().adapter.file, /NOT YET IMPLEMENTED/);
  assert.equal(d143().mandateState, "UNSPENT");
  assert.equal(d143().outcome, "NOT YET ATTEMPTED");
});

test("D-145: exactly one implementation entry for D-143's call, with every binding field", () => {
  const block = C.adapterImplementations;
  assert.equal(block.decision, "D-145");
  assert.equal(block.isAuthorisation, false, "an implementation record is never an authorisation");
  assert.match(block.shape, /APPEND-ONLY/);
  assert.match(block.relationToAuthorisedCalls, /HISTORICAL AUTHORISATION SNAPSHOT/);
  assert.match(block.relationToAuthorisedCalls, /Nothing in this list authorises, widens, repeats or replaces a call/);
  const entries = d145Entry();
  assert.equal(entries.length, 1, "exactly one D-145 entry");
  assert.equal(block.entries.filter((e) => e && e.callId === "D-143-r3-underlay-core-v2").length, 1, "one implementation per call");
  const e = entries[0];
  assert.equal(e.callId, "D-143-r3-underlay-core-v2");
  assert.equal(e.authorisedBy, "D-143");
  assert.equal(e.adapter.file, D145_ADAPTER);
  assert.equal(e.adapter.status, "IMPLEMENTED — NOT EXECUTED");
  assert.equal(e.adapter.ownerApproval, "D-143");
  assert.equal(e.adapter.ownerApprovalFlag, "--owner-approval=D-143");
  assert.match(e.adapter.ownerApprovalMeaning, /NOT by itself an instruction to send/);
  assert.equal(e.mandateState, "UNSPENT");
  assert.equal(e.outcome, "NOT YET ATTEMPTED");
  assert.equal(e.mergeIsNotAnInstruction, true);
  assert.equal(e.executionRequiresSeparateOwnerInstruction, true);
  assert.equal(e.claimExists, false);
  assert.equal(e.testCoverage.fullCiCoverage, false, "CI coverage is not claimed to be full");
  assert.match(e.testCoverage.manualMergePrerequisite, /manual merge prerequisite/);
  assert.match(e.testCoverage.ci, /^24 tests without H1/);
  // the hardening rule, and the legacy exception held to its own terms
  assert.match(e.testSafetyHardening, /may not read, check, write or delete a real claim or output path/);
  assert.match(e.testSafetyHardening, /NARROW, machine-readable READ-ONLY exception for seven named constructs/);
  assert.match(e.testSafetyHardening, /bound to file, rule, construct and count/);
  assert.match(e.testSafetyHardening, /lapses automatically when its construct is removed/);
  assert.match(e.testSafetyHardening, /not a precedent and may not be widened without a new owner decision/);
  assert.match(e.testSafetyHardening, /D-139 production adapter is unchanged/);
  // it implements a call that exists and is still the one live permission — it does not create one
  const authorised = C.authorisedCalls.calls.filter((c) => c.callId === e.callId);
  assert.equal(authorised.length, 1);
  assert.equal(authorised[0].decision, e.authorisedBy);
  // no adapter SHA-256 is pinned (D-145 §3)
  for (const k of Object.keys(e.adapter)) assert.ok(!/^(adapter)?sha-?256$/i.test(k), "no adapter hash field: " + k);
  assert.match(e.adapter.noAdapterSha256, /origin\/main commit SHA/);
  const adapterPath = join(REPO, ...D145_ADAPTER.split("/"));
  assert.ok(existsSync(adapterPath), "the named adapter exists in this tree");
  assert.ok(!readFileSync(CONTRACT_PATH, "utf8").includes(sha256(readFileSync(adapterPath))), "the adapter's hash is not in the contract");
  // the snapshot statements it names exist, verbatim, where it says they are
  assert.deepEqual(e.snapshotStatementsReadAsOfAuthorisation, [
    "authorisedCalls.calls[callId=D-143-r3-underlay-core-v2].status",
    "authorisedCalls.calls[callId=D-143-r3-underlay-core-v2].adapter.file",
    "authorisedCalls.calls[callId=D-143-r3-underlay-core-v2].adapter.notInThisRepositoryYet",
    "prohibitions.noImageRequestAuthorised",
  ]);
  assert.match(C.prohibitions.noImageRequestAuthorised, /not exercisable today/);
  assert.match(e.snapshotNote, /still NOT executed, the mandate is still UNSPENT/);
  assert.equal(canon(e), D145_PINS.d145Entry, "the D-145 entry is pinned as decided");
});

test("D-145: the register row exists once, directly after D-144, and says what the contract says", () => {
  const lines = readFileSync(REGISTER_PATH, "utf8").split("\n");
  const at = (id) => lines.findIndex((l) => l.startsWith("| **" + id + "** |"));
  assert.equal(lines.filter((l) => l.startsWith("| **D-145** |")).length, 1, "exactly one D-145 row");
  assert.equal(at("D-145"), at("D-144") + 1, "appended directly after D-144");
  const row = lines[at("D-145")];
  for (const needle of ["--owner-approval=D-143", "ikke i sig selv en instruktion om at sende billedkaldet", "adapterImplementations",
    "D-143-r3-underlay-core-v2", D145_ADAPTER, "IMPLEMENTED — NOT EXECUTED", "UNSPENT", "NOT YET ATTEMPTED",
    "Ingen adapter-SHA pinnes i kontrakten", D145_PINS.d143Entry, "MERGE ER IKKE UDFØRELSE",
    "`D-143.claim.json` findes fortsat ikke", "CI **24**", "De 8 positive mock-send-tests kræver H1",
    "manuel merge-forudsætning", "D-139-produktionsadapteren ændres ikke", "D-120 til D-144 omskrives ikke",
    // the hardening rule, and the exception held to its own terms
    "En unit-test må ikke læse, kontrollere, skrive eller slette en rigtig claim- eller outputsti",
    "snæver, maskinlæsbar READ-ONLY-undtagelse", "syv navngivne konstruktioner",
    "bortfalder automatisk", "ikke præcedens og må ikke udvides uden en ny ejerbeslutning"]) {
    assert.ok(row.includes(needle), "the D-145 row must carry " + JSON.stringify(needle));
  }
  assert.equal(sha256(row), D145_PINS.d145Row, "the D-145 row is pinned as decided");
  assert.ok(row.endsWith("(2026-09-15) |"));
  assert.ok(!/[ÃÂ]\S|�/.test(row), "no mojibake in the Danish row");
});
