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

/** A deep copy of the live contract with D-147's closure reversed. Pure; never touches the input. */
export function preClosureContract(live) {
  const c = JSON.parse(JSON.stringify(live));
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
