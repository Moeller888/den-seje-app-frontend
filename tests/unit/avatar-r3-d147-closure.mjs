// D-147 — what the R3 shadow contract said about D-143 and D-145 BEFORE D-147 closed D-143's spent mandate.
//
// Not a test file (the unit runners only pick up *.test.mjs). It holds data and one pure function, shared by
// avatar-r3-shadow-contract.test.mjs and avatar-r3-core-send-adapter-d143.test.mjs.
//
// WHY A RECONSTRUCTION AND NOT A GIT BLOB. D-147 edits the D-143 and D-145 entries in place, so that no isolated
// read of either can find an active permission. The pre-closure contract lives in merge commit
// 3f62932325ce4f00c9b9bfaa64e4b321bf3f4889, but CI checks the repository out shallowly, so a test cannot
// read that commit. preClosureContract() therefore reverses exactly the fields D-147 changed and deletes exactly
// the keys D-147 added, and the tests REQUIRE the result to be canonically identical to the merged contract
// (PRE_CLOSURE_CONTRACT_CANONICAL_SHA256). That one equality proves two things at once: the reconstruction is
// the real historical contract, and D-147 changed nothing else in the file.
//
// The values below were taken byte-for-byte from that commit. They describe the state BEFORE the call was made
// and must never be read as the current state of D-143.
//
// D-151 later ADDED one authorisation (a new entry, a raised planned capacity and the prose that names it). It
// changes no D-143/D-145 field. preD151Contract() removes exactly those additions, and the tests REQUIRE its result
// to be canonically identical to the contract at the D-151 base commit (PRE_D151_CONTRACT_CANONICAL_SHA256).
// preClosureContract() applies it first, so the D-147 reconstruction above is unchanged in meaning.
//
// D-152 then CLOSED D-151's entry in place after its one send (HTTP 400, no image) — the D-147 pattern — and counted
// that send in callsActuallySentSoFar. preD152Contract() reverses exactly that closure; the tests REQUIRE its result to
// be canonically identical to the contract at the D-151 commit (PRE_D152_CONTRACT_CANONICAL_SHA256). preD151Contract()
// applies it first.
//
// D-153 then ADDED one authorisation (an UNSPENT entry, planned capacity 4 -> 5 and the prose that names it).
// preD153Contract() removes exactly those additions, proven canonically identical to the contract at the D-153 base
// (PRE_D153_CONTRACT_CANONICAL_SHA256); preD152Contract() applies it first.
//
// D-154 then CLOSED D-153's entry in place after its one send (HTTP 200, candidate rejected by background-leak) and
// counted that send. preD154Contract() reverses exactly that closure, proven canonically identical to the contract at
// the D-153 commit (PRE_D154_CONTRACT_CANONICAL_SHA256); preD153Contract() applies it first.

export const PRE_CLOSURE_COMMIT = "3f62932325ce4f00c9b9bfaa64e4b321bf3f4889";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_CLOSURE_COMMIT. */
export const PRE_CLOSURE_CONTRACT_CANONICAL_SHA256 = "b0bb1472439765d47e32b683c172e62bc25a469748aaf0d9e733e4df60ed5430";
/** sha256(JSON.stringify(entry)) of the D-143 authorisation entry at PRE_CLOSURE_COMMIT — its merged snapshot. */
export const PRE_CLOSURE_D143_ENTRY_CANONICAL_SHA256 = "6ca1754aedd8351349ab725e063190c6f265af16f79cde4fad86ad6a2c16ef6d";
/** sha256(JSON.stringify(entry)) of the D-145 implementation entry at PRE_CLOSURE_COMMIT. */
export const PRE_CLOSURE_D145_ENTRY_CANONICAL_SHA256 = "53b144c02ea9d6bc5f5fa9ce22652dcff4a3f1fc56c3b84c3a39cb95f95e3de6";

export const D143_CALL_ID = "D-143-r3-underlay-core-v2";
/** The keys D-147 added to each entry. */
export const D147_ADDED_D143_KEYS = Object.freeze(["neverReuse", "notAnActivePermission", "closure", "execution"]);
export const D147_ADDED_D145_KEYS = Object.freeze(["neverReuse", "closedBy"]);

/** The values D-147 replaced, as they stood at PRE_CLOSURE_COMMIT. */
export const PRE_CLOSURE = Object.freeze({
  "d143": {
    "status": "AUTHORISED — ONE CALL, NOT YET SENT, AND NO SEND PATH EXISTS YET",
    "mandateState": "UNSPENT",
    "outcome": "NOT YET ATTEMPTED"
  },
  "d145": {
    "adapterStatus": "IMPLEMENTED — NOT EXECUTED",
    "mandateState": "UNSPENT",
    "outcome": "NOT YET ATTEMPTED",
    "claimExists": false,
    "snapshotStatementsReadAsOfAuthorisation": [
      "authorisedCalls.calls[callId=D-143-r3-underlay-core-v2].status",
      "authorisedCalls.calls[callId=D-143-r3-underlay-core-v2].adapter.file",
      "authorisedCalls.calls[callId=D-143-r3-underlay-core-v2].adapter.notInThisRepositoryYet",
      "prohibitions.noImageRequestAuthorised"
    ],
    "snapshotNote": "Those statements say that no send path exists and that no adapter in origin/main is pinned for this call. They were true when D-143 was merged and are left verbatim. Once this entry is in origin/main, the adapter named above IS pinned for the call; the call is still NOT executed, the mandate is still UNSPENT, and running it still requires a separate, explicit owner instruction."
  },
  "callsActuallySentSoFar": {
    "underlay": 2,
    "which": [
      "D-139 — sent, output rejected",
      "D-142 — sent during the incident, outcome UNKNOWN"
    ],
    "note": "An OBSERVATION of what has left this machine. D-143 has not been sent and is not counted here."
  },
  "plannedWhy": "D-143 authorises exactly one further underlay call. assets[0].calls is PLANNED capacity, so it moves to 3 when the authorisation is merged, not when the call is made.",
  "doNotConfuseTheTwo": "Raising assets[0].calls is NOT a claim that the call has been made, and it is NOT permission to make it. After a completed D-143 run the actually-sent figure becomes 3 as well; until then the two numbers differ on purpose.",
  "budgetAccounting": "assets[0] carries 3 PLANNED calls after D-143: D-139, sent with its output rejected; the D-142 attempt, sent during an incident with an unknown outcome; and the one call D-143 authorises but that has not been sent. The derived budget is 17-18. Budget numbers remain planning, never consent.",
  "noImageRequestAuthorised": "D-132 and this contract authorise no image request in general, and that general rule is unchanged. authorisedCalls.calls holds THREE entries. Read them by callId and by their own fields, never by the length of the list. (1) D-139-r3-underlay-head-only-v1 — D-139 superseded the general rule NARROWLY for exactly that one named call. That call was made. Its claim is spent on any outcome, prohibitions.noRetry forbids a repeat, and claim.furtherAttempt requires a NEW owner decision and a NEW claim identity. (2) D-142-r3-underlay-core-v1 — NEVER a permission. An incident RECORD with mandateState SPENT, outcome UNKNOWN and neverReuse true. A SPENT entry with neverReuse never counts as an active send permission, and no adapter may read it, or its presence in this list, as authorisation to send. (3) D-143-r3-underlay-core-v2 — the ONE ACTIVE, UNSPENT permission: SUPERSEDED NARROWLY BY D-143 for exactly one further CORE-only underlay call, not yet sent. It is not exercisable today because no adapter in origin/main is pinned and authorised to send D-143-r3-underlay-core-v2, and execution additionally requires its own owner instruction. Nothing else is authorised — no repeat of D-139's call, no reuse of D-142's call id or claim identity, no second D-143 call, and no other call in the R3 plan."
});

export const D151_DECISION = "D-151";
/** The D-151 base commit (origin/main when D-151 was authorised). */
export const PRE_D151_COMMIT = "941db7e268f5122dcf14b75bd8daddb03ed0ca21";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D151_COMMIT. */
export const PRE_D151_CONTRACT_CANONICAL_SHA256 = "8306bec218a7b9ad6e7d0be9d8a6651c162cd45bf807b53835d9dd113d4d972e";
/** The values D-151 replaced, as they stood at PRE_D151_COMMIT. */
export const PRE_D151 = Object.freeze({
  "count": 3,
  "budgetAccounting": "assets[0] carries 3 PLANNED calls after D-143: D-139, sent with its output rejected; the D-142 attempt, sent during an incident with an unknown outcome; and D-143's one call, sent once with its candidate rejected (recorded by D-147). The derived budget is 17-18. Budget numbers remain planning, never consent.",
  "noImageRequestAuthorised": "D-132 and this contract authorise no image request in general, and that general rule is unchanged. authorisedCalls.calls holds THREE entries. Read them by callId and by their own fields, never by the length of the list. (1) D-139-r3-underlay-head-only-v1 — D-139 superseded the general rule NARROWLY for exactly that one named call. That call was made. Its claim is spent on any outcome, prohibitions.noRetry forbids a repeat, and claim.furtherAttempt requires a NEW owner decision and a NEW claim identity. (2) D-142-r3-underlay-core-v1 — NEVER a permission. An incident RECORD with mandateState SPENT, outcome UNKNOWN and neverReuse true. A SPENT entry with neverReuse never counts as an active send permission, and no adapter may read it, or its presence in this list, as authorisation to send. (3) D-143-r3-underlay-core-v2 — NO LONGER a permission. D-143 superseded the general rule NARROWLY for exactly one further CORE-only underlay call. That call was sent once through the D-145 adapter, and D-147 records its outcome: HTTP 200, raw received, candidate rejected, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. No entry in this list is an active send permission — no repeat of D-139's call, no reuse of D-142's or D-143's call id or claim identity, and no other call in the R3 plan.",
  "minimum": 17,
  "maximum": 18,
  "callsPlannedAndAuthorised": {
    "underlay": 3,
    "why": "D-143 authorised exactly one further underlay call, and that call has been made (recorded by D-147). assets[0].calls is PLANNED capacity; it moved to 3 when the authorisation was merged, not when the call was made.",
    "derivedBudget": "17-18"
  },
  "doNotConfuseTheTwo": "Raising assets[0].calls is NOT a claim that the call has been made, and it is NOT permission to make it. D-143's call has been made (recorded by D-147), so the actually-sent figure is 3 as well and the two numbers now agree. Their agreement authorises nothing either.",
  "asset0Calls": 3
});

/** The D-151 commit (the contract as D-151 committed it, before its outcome was recorded). */
export const PRE_D152_COMMIT = "8f379853bc8acedd06359bbeea70cf488f74df23";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D152_COMMIT. */
export const PRE_D152_CONTRACT_CANONICAL_SHA256 = "32cff41bf3fb887babdef8ed52ebbf7ff52f3c0eb9cac1602ccc41bfaf9afc06";
/** The keys D-152 added to D-151's entry. */
export const D152_ADDED_D151_KEYS = Object.freeze(["outcome", "neverReuse", "notAnActivePermission", "closure", "execution"]);
/** The values D-152 replaced, as they stood at PRE_D152_COMMIT. */
export const PRE_D152 = Object.freeze({
  "d151": {
    "status": "AUTHORISED — UNSPENT — NOT YET SENT",
    "mandateState": "UNSPENT"
  },
  "callsActuallySentSoFar": {
    "underlay": 3,
    "which": [
      "D-139 — sent, output rejected",
      "D-142 — sent during the incident, outcome UNKNOWN",
      "D-143 — sent once, HTTP 200, raw received, candidate rejected by pre.transition-silhouette, nothing promoted (recorded by D-147)"
    ],
    "note": "An OBSERVATION of what has left this machine. D-143's single send is counted here since D-147."
  },
  "callsPlannedAndAuthorised": {
    "underlay": 4,
    "why": "D-151 authorises exactly one further, colour-limited head underlay call on top of D-143's spent one. assets[0].calls is PLANNED capacity; it moves to 4 when the authorisation is committed, not when the call is made.",
    "derivedBudget": "18-19"
  },
  "doNotConfuseTheTwo": "Raising assets[0].calls is NOT a claim that the call has been made, and it is NOT permission to make it. The actually-sent figure stays 3 until D-151's call is sent; until then the two numbers differ on purpose. Their agreement or disagreement authorises nothing.",
  "budgetAccounting": "assets[0] carries 4 PLANNED calls after D-151: D-139, sent with its output rejected; the D-142 attempt, sent during an incident with an unknown outcome; D-143's one call, sent once with its candidate rejected (recorded by D-147); and the one colour-limited head call D-151 authorises, which has not been sent. The derived budget is 18-19. Budget numbers remain planning, never consent.",
  "noImageRequestAuthorised": "D-132 and this contract authorise no image request in general, and that general rule is unchanged. authorisedCalls.calls holds FOUR entries. Read them by callId and by their own fields, never by the length of the list. (1) D-139-r3-underlay-head-only-v1 — D-139 superseded the general rule NARROWLY for exactly that one named call. That call was made. Its claim is spent on any outcome, prohibitions.noRetry forbids a repeat, and claim.furtherAttempt requires a NEW owner decision and a NEW claim identity. (2) D-142-r3-underlay-core-v1 — NEVER a permission. An incident RECORD with mandateState SPENT, outcome UNKNOWN and neverReuse true. A SPENT entry with neverReuse never counts as an active send permission, and no adapter may read it, or its presence in this list, as authorisation to send. (3) D-143-r3-underlay-core-v2 — NO LONGER a permission. D-143 superseded the general rule NARROWLY for exactly one further CORE-only underlay call. That call was sent once through the D-145 adapter, and D-147 records its outcome: HTTP 200, raw received, candidate rejected, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (4) D-151-r3-head-colour-u1-v1 — THE ONLY active send permission. D-151 supersedes the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay, with mandateState UNSPENT until its claim exists. prohibitions.noRetry forbids a repeat and claim.furtherAttempt requires a NEW owner decision and a NEW claim identity. Apart from D-151's single call, no entry in this list is an active send permission — no repeat of D-139's call, no reuse of D-142's, D-143's or D-151's call id or claim identity, and no other call in the R3 plan."
});

export const D153_DECISION = "D-153";
/** The D-153 base commit (origin/main when D-153 was authorised: the merge of D-151 and D-152). */
export const PRE_D153_COMMIT = "ca44185023d0a562e0c19ec2b302cd99d7001426";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D153_COMMIT. */
export const PRE_D153_CONTRACT_CANONICAL_SHA256 = "61b9af79a4c26ae65a70138f2e065dc7985f6016b133dd2f7d90b698241ead12";
/** The values D-153 replaced, as they stood at PRE_D153_COMMIT. */
export const PRE_D153 = Object.freeze({
  "count": 4,
  "budgetAccounting": "assets[0] carries 4 PLANNED calls after D-151: D-139, sent with its output rejected; the D-142 attempt, sent during an incident with an unknown outcome; D-143's one call, sent once with its candidate rejected (recorded by D-147); and D-151's one call, sent once and refused with HTTP 400, no image (recorded by D-152). The derived budget is 18-19. Budget numbers remain planning, never consent.",
  "noImageRequestAuthorised": "D-132 and this contract authorise no image request in general, and that general rule is unchanged. authorisedCalls.calls holds FOUR entries. Read them by callId and by their own fields, never by the length of the list. (1) D-139-r3-underlay-head-only-v1 — D-139 superseded the general rule NARROWLY for exactly that one named call. That call was made. Its claim is spent on any outcome, prohibitions.noRetry forbids a repeat, and claim.furtherAttempt requires a NEW owner decision and a NEW claim identity. (2) D-142-r3-underlay-core-v1 — NEVER a permission. An incident RECORD with mandateState SPENT, outcome UNKNOWN and neverReuse true. A SPENT entry with neverReuse never counts as an active send permission, and no adapter may read it, or its presence in this list, as authorisation to send. (3) D-143-r3-underlay-core-v2 — NO LONGER a permission. D-143 superseded the general rule NARROWLY for exactly one further CORE-only underlay call. That call was sent once through the D-145 adapter, and D-147 records its outcome: HTTP 200, raw received, candidate rejected, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (4) D-151-r3-head-colour-u1-v1 — NO LONGER a permission. D-151 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay. That call was sent once and D-152 records its outcome: HTTP 400 (background transparent not supported for this model), no image, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. No entry in this list is an active send permission — no repeat of D-139's call, no reuse of D-142's, D-143's or D-151's call id or claim identity, and no other call in the R3 plan. D-152 is preparation only and adds no entry.",
  "minimum": 18,
  "maximum": 19,
  "callsPlannedAndAuthorised": {
    "underlay": 4,
    "why": "D-151 authorised exactly one further, colour-limited head underlay call on top of D-143's spent one, and that call has been made (recorded by D-152). assets[0].calls is PLANNED capacity; it moved to 4 when the authorisation was committed, not when the call was made.",
    "derivedBudget": "18-19"
  },
  "doNotConfuseTheTwo": "Raising assets[0].calls is NOT a claim that the call has been made, and it is NOT permission to make it. D-151's call has been made (recorded by D-152), so the actually-sent figure is 4 as well and the two numbers agree. Their agreement authorises nothing. D-152 is preparation only and adds no planned call.",
  "asset0Calls": 4
});

/** The D-153 commit (the contract as D-153 committed it, before its outcome was recorded). */
export const PRE_D154_COMMIT = "ac044da1c923e58e8455b7d4e5b968cee105834e";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D154_COMMIT. */
export const PRE_D154_CONTRACT_CANONICAL_SHA256 = "7a60449f136f38f5e1d1a91c53509f2cb536a5ea001a57d9cb3cafa5713b1af5";
/** The keys D-154 added to D-153's entry. */
export const D154_ADDED_D153_KEYS = Object.freeze(["outcome", "neverReuse", "notAnActivePermission", "closure", "execution"]);
/** The values D-154 replaced, as they stood at PRE_D154_COMMIT. */
export const PRE_D154 = Object.freeze({
  "d153": {
    "status": "AUTHORISED — UNSPENT — NOT YET SENT",
    "mandateState": "UNSPENT"
  },
  "callsActuallySentSoFar": {
    "underlay": 4,
    "which": [
      "D-139 — sent, output rejected",
      "D-142 — sent during the incident, outcome UNKNOWN",
      "D-143 — sent once, HTTP 200, raw received, candidate rejected by pre.transition-silhouette, nothing promoted (recorded by D-147)",
      "D-151 — sent once, HTTP 400 (background transparent not supported for this model), no image, nothing promoted (recorded by D-152)"
    ],
    "note": "An OBSERVATION of what has left this machine. D-143's single send is counted here since D-147, and D-151's single send since D-152."
  },
  "callsPlannedAndAuthorised": {
    "underlay": 5,
    "why": "D-153 authorises exactly one further, colour-limited head underlay call with background opaque, on top of D-151's spent one. assets[0].calls is PLANNED capacity; it moves to 5 when the authorisation is committed, not when the call is made.",
    "derivedBudget": "19-20"
  },
  "doNotConfuseTheTwo": "Raising assets[0].calls is NOT a claim that the call has been made, and it is NOT permission to make it. The actually-sent figure stays 4 until D-153's call is sent; until then the two numbers differ on purpose. Their agreement or disagreement authorises nothing.",
  "budgetAccounting": "assets[0] carries 5 PLANNED calls after D-153: D-139, sent with its output rejected; the D-142 attempt, sent during an incident with an unknown outcome; D-143's one call, sent once with its candidate rejected (recorded by D-147); D-151's one call, sent once and refused with HTTP 400, no image (recorded by D-152); and the one opaque-background head call D-153 authorises, which has not been sent. The derived budget is 19-20. Budget numbers remain planning, never consent.",
  "noImageRequestAuthorised": "D-132 and this contract authorise no image request in general, and that general rule is unchanged. authorisedCalls.calls holds FIVE entries. Read them by callId and by their own fields, never by the length of the list. (1) D-139-r3-underlay-head-only-v1 — D-139 superseded the general rule NARROWLY for exactly that one named call. That call was made. Its claim is spent on any outcome, prohibitions.noRetry forbids a repeat, and claim.furtherAttempt requires a NEW owner decision and a NEW claim identity. (2) D-142-r3-underlay-core-v1 — NEVER a permission. An incident RECORD with mandateState SPENT, outcome UNKNOWN and neverReuse true. A SPENT entry with neverReuse never counts as an active send permission, and no adapter may read it, or its presence in this list, as authorisation to send. (3) D-143-r3-underlay-core-v2 — NO LONGER a permission. D-143 superseded the general rule NARROWLY for exactly one further CORE-only underlay call. That call was sent once through the D-145 adapter, and D-147 records its outcome: HTTP 200, raw received, candidate rejected, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (4) D-151-r3-head-colour-u1-v1 — NO LONGER a permission. D-151 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay. That call was sent once and D-152 records its outcome: HTTP 400 (background transparent not supported for this model), no image, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-152 is preparation only and adds no entry. (5) D-153-r3-head-colour-u1-opaque-v1 — THE ONLY active send permission. D-153 supersedes the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay with background opaque, with mandateState UNSPENT until its claim exists. prohibitions.noRetry forbids a repeat and claim.furtherAttempt requires a NEW owner decision and a NEW claim identity. Apart from D-153's single call, no entry in this list is an active send permission — no repeat of D-139's call, no reuse of D-142's, D-143's, D-151's or D-153's call id or claim identity, and no other call in the R3 plan."
});

/** A deep copy of the live contract with D-154's closure of D-153 reversed. Pure; never touches the input. */
export function preD154Contract(live) {
  const c = JSON.parse(JSON.stringify(live));
  const e153 = c.authorisedCalls.calls.find((x) => x.decision === D153_DECISION);
  if (e153) {
    e153.status = PRE_D154.d153.status;
    e153.mandateState = PRE_D154.d153.mandateState;
    for (const k of D154_ADDED_D153_KEYS) delete e153[k];
  }
  c.imageCallBudget.callsActuallySentSoFar = JSON.parse(JSON.stringify(PRE_D154.callsActuallySentSoFar));
  c.imageCallBudget.callsPlannedAndAuthorised = JSON.parse(JSON.stringify(PRE_D154.callsPlannedAndAuthorised));
  c.imageCallBudget.doNotConfuseTheTwo = PRE_D154.doNotConfuseTheTwo;
  c.authorisedCalls.budgetAccounting = PRE_D154.budgetAccounting;
  c.prohibitions.noImageRequestAuthorised = PRE_D154.noImageRequestAuthorised;
  return c;
}

/** A deep copy of the live contract with D-154's closure and D-153's additions removed. Pure; never touches the input. */
export function preD153Contract(live) {
  const c = preD154Contract(live);
  c.authorisedCalls.calls = c.authorisedCalls.calls.filter((e) => e.decision !== D153_DECISION);
  c.authorisedCalls.count = PRE_D153.count;
  c.authorisedCalls.budgetAccounting = PRE_D153.budgetAccounting;
  c.prohibitions.noImageRequestAuthorised = PRE_D153.noImageRequestAuthorised;
  c.imageCallBudget.minimum = PRE_D153.minimum;
  c.imageCallBudget.maximum = PRE_D153.maximum;
  c.imageCallBudget.callsPlannedAndAuthorised = JSON.parse(JSON.stringify(PRE_D153.callsPlannedAndAuthorised));
  c.imageCallBudget.doNotConfuseTheTwo = PRE_D153.doNotConfuseTheTwo;
  c.assets[0].calls = PRE_D153.asset0Calls;
  return c;
}

/** A deep copy of the live contract with D-153's additions and D-152's closure of D-151 reversed. Pure. */
export function preD152Contract(live) {
  const c = preD153Contract(live);
  const e151 = c.authorisedCalls.calls.find((e) => e.decision === D151_DECISION);
  if (e151) {
    e151.status = PRE_D152.d151.status;
    e151.mandateState = PRE_D152.d151.mandateState;
    for (const k of D152_ADDED_D151_KEYS) delete e151[k];
  }
  c.imageCallBudget.callsActuallySentSoFar = JSON.parse(JSON.stringify(PRE_D152.callsActuallySentSoFar));
  c.imageCallBudget.callsPlannedAndAuthorised = JSON.parse(JSON.stringify(PRE_D152.callsPlannedAndAuthorised));
  c.imageCallBudget.doNotConfuseTheTwo = PRE_D152.doNotConfuseTheTwo;
  c.authorisedCalls.budgetAccounting = PRE_D152.budgetAccounting;
  c.prohibitions.noImageRequestAuthorised = PRE_D152.noImageRequestAuthorised;
  return c;
}

/** A deep copy of the live contract with D-152's closure and D-151's additions removed. Pure; never touches the input. */
export function preD151Contract(live) {
  const c = preD152Contract(live);
  c.authorisedCalls.calls = c.authorisedCalls.calls.filter((e) => e.decision !== D151_DECISION);
  c.authorisedCalls.count = PRE_D151.count;
  c.authorisedCalls.budgetAccounting = PRE_D151.budgetAccounting;
  c.prohibitions.noImageRequestAuthorised = PRE_D151.noImageRequestAuthorised;
  c.imageCallBudget.minimum = PRE_D151.minimum;
  c.imageCallBudget.maximum = PRE_D151.maximum;
  c.imageCallBudget.callsPlannedAndAuthorised = JSON.parse(JSON.stringify(PRE_D151.callsPlannedAndAuthorised));
  c.imageCallBudget.doNotConfuseTheTwo = PRE_D151.doNotConfuseTheTwo;
  c.assets[0].calls = PRE_D151.asset0Calls;
  return c;
}

/** A deep copy of the live contract with D-151's additions and D-147's closure reversed. Pure; never touches the input. */
export function preClosureContract(live) {
  const c = preD151Contract(live);
  const e143 = c.authorisedCalls.calls.find((e) => e.callId === D143_CALL_ID);
  const e145 = c.adapterImplementations.entries.find((e) => e.decision === "D-145" && e.callId === D143_CALL_ID);
  e143.status = PRE_CLOSURE.d143.status;
  e143.mandateState = PRE_CLOSURE.d143.mandateState;
  e143.outcome = PRE_CLOSURE.d143.outcome;
  for (const k of D147_ADDED_D143_KEYS) delete e143[k];
  e145.adapter.status = PRE_CLOSURE.d145.adapterStatus;
  e145.mandateState = PRE_CLOSURE.d145.mandateState;
  e145.outcome = PRE_CLOSURE.d145.outcome;
  e145.claimExists = PRE_CLOSURE.d145.claimExists;
  e145.snapshotStatementsReadAsOfAuthorisation = [...PRE_CLOSURE.d145.snapshotStatementsReadAsOfAuthorisation];
  e145.snapshotNote = PRE_CLOSURE.d145.snapshotNote;
  for (const k of D147_ADDED_D145_KEYS) delete e145[k];
  c.imageCallBudget.callsActuallySentSoFar = JSON.parse(JSON.stringify(PRE_CLOSURE.callsActuallySentSoFar));
  c.imageCallBudget.callsPlannedAndAuthorised.why = PRE_CLOSURE.plannedWhy;
  c.imageCallBudget.doNotConfuseTheTwo = PRE_CLOSURE.doNotConfuseTheTwo;
  c.authorisedCalls.budgetAccounting = PRE_CLOSURE.budgetAccounting;
  c.prohibitions.noImageRequestAuthorised = PRE_CLOSURE.noImageRequestAuthorised;
  return c;
}
