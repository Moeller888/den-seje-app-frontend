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
//
// D-159 then ADDED one top-level section, faceNeutralPreparation (preparation only: no authorisation, no call id, no
// claim, no budget, counter or asset change). preD159Contract() deletes exactly that key, proven canonically identical
// to the contract at the D-159 base (PRE_D159_CONTRACT_CANONICAL_SHA256); preD154Contract() applies it first.
//
// D-160 then ADDED one authorisation: an UNSPENT authorisedCalls entry for D-160-r3-face-neutral-v1 (count 5 -> 6), one
// adapterImplementations entry for the adapter merged inactive by PR #322, and the prose in
// prohibitions.noImageRequestAuthorised that names it. No budget, counter or asset figure changed (assets[4] already
// plans the one face-neutral call). preD160Contract() removes exactly those additions, proven canonically identical to
// the contract at the D-160 base (PRE_D160_CONTRACT_CANONICAL_SHA256); preD159Contract() applies it first.
//
// D-161 then CLOSED D-160's entry and its implementation entry in place after the one send (HTTP 200, one image,
// TECHNICAL_REJECT at AUTO-5, geometry rejected by the owner), added the separate face accounting to
// callsActuallySentSoFar (faceNeutral = 1; the underlay figure and its evidence untouched) and re-worded the prose.
// preD161Contract() reverses exactly that closure, proven canonically identical to the contract at the D-160 commit
// line (PRE_D161_CONTRACT_CANONICAL_SHA256); preD160Contract() applies it first.
//
// D-162 then ADDED the guide-B preparation section (faceNeutralGuideBPreparation), one UNSPENT authorisedCalls entry for
// D-162-r3-face-neutral-guide-b-v1 (count 6 -> 7), one adapterImplementations entry, the planned face capacity
// (assets[4].calls 1 -> 2, budget 19-20 -> 20-21, callsPlannedAndAuthorised.faceNeutral) and the prose that names it.
// The actually-sent figures are unchanged. preD162Contract() removes exactly those additions, proven canonically
// identical to the contract at the D-162 base (PRE_D162_CONTRACT_CANONICAL_SHA256); preD161Contract() applies it first.
//
// D-163 then CLOSED D-162's entry and its implementation entry in place after the one send (HTTP 200, one image,
// TECHNICAL_REJECT at AUTO-5), raised the separate face accounting (callsActuallySentSoFar.faceNeutral 1 -> 2; the
// underlay figure and its evidence untouched) and re-worded the prose. preD163Contract() reverses exactly that closure,
// proven canonically identical to the contract at the D-162 merge (PRE_D163_CONTRACT_CANONICAL_SHA256);
// preD162Contract() applies it first.
//
// D-164 then ADDED the parts method (top-level faceNeutralPartsMethod), one deterministicOperations entry and the new
// assets[4].method. No authorisedCalls entry, budget figure or counter changed. preD164Contract() removes exactly those
// additions, proven canonically identical to the contract at the D-163 merge (PRE_D164_CONTRACT_CANONICAL_SHA256);
// preD163Contract() applies it first.
//
// D-165 then ADDED one UNSPENT authorisedCalls entry for D-165-r3-face-parts-sheet-v1 (count 7 -> 8), one
// adapterImplementations entry, the planned face capacity (assets[4].calls 2 -> 3, budget 20-21 -> 21-22,
// callsPlannedAndAuthorised.faceNeutral 2 -> 3) and the prose that names it. The actually-sent figures are unchanged.
// preD165Contract() removes exactly those additions, proven canonically identical to the contract at the D-164 merge
// (PRE_D165_CONTRACT_CANONICAL_SHA256); preD164Contract() applies it first.
//
// D-166 then CLOSED D-165's entry and its implementation entry in place after the one send (HTTP 200, one sheet,
// RAW-1..5 passed; the owner rejected the nose and kept the brows and mouth for further review), raised the separate
// face accounting (callsActuallySentSoFar.faceNeutral 2 -> 3; the underlay figure untouched), made the budgetAccounting
// text true to the contract's figures and re-worded the prose. preD166Contract() reverses exactly that closure, proven
// canonically identical to the contract at the D-165 merge (PRE_D166_CONTRACT_CANONICAL_SHA256); preD165Contract()
// applies it first.
//
// D-167 then ADDED faceNeutralPartsExtension (the partial nose sheet and composition from several raw sources), one
// UNSPENT authorisedCalls entry for D-167-r3-face-parts-nose-v1 (count 8 -> 9), one adapterImplementations entry, the
// planned face capacity (assets[4].calls 3 -> 4, budget 21-22 -> 22-23, callsPlannedAndAuthorised.faceNeutral 3 -> 4), the
// budget text and the prose that names it. The actually-sent figures are unchanged. preD167Contract() removes exactly
// those additions, proven canonically identical to the contract at the D-166 merge (PRE_D167_CONTRACT_CANONICAL_SHA256);
// preD166Contract() applies it first.
//
// D-168 then CLOSED D-167's entry and its implementation entry in place after the one send (HTTP 200, one partial sheet,
// TECHNICAL_REJECT at RAW-4′), raised the separate face accounting (callsActuallySentSoFar.faceNeutral 3 -> 4; the
// underlay figure untouched), made the budget text true to the figures and re-worded the prose. preD168Contract()
// reverses exactly that closure, proven canonically identical to the contract at the D-167 merge
// (PRE_D168_CONTRACT_CANONICAL_SHA256); preD167Contract() applies it first.
//
// D-169 then ADDED the eyes method (top-level eyesPartsMethod), one deterministicOperations entry and the new
// assets[5].method. No authorisedCalls entry, budget figure or counter changed. preD169Contract() removes exactly those
// additions, proven canonically identical to the contract at the D-168 merge (PRE_D169_CONTRACT_CANONICAL_SHA256);
// preD168Contract() applies it first.
//
// D-170 then APPROVED the eye targets as a new pinned version (eyesPartsMethod.targets now names targets-eyes-v2.json),
// ADDED one authorisedCalls entry for the eyes-fixed call A and its adapterImplementations entry, raised
// authorisedCalls.count 9 -> 10, made callsPlannedAndAuthorised name the eyes-fixed slot (eyesFixed 1, no new capacity)
// and re-worded the budget text and the general prohibition. The actually-sent figures are unchanged.
// preD170Contract() removes exactly those changes, proven canonically identical to the contract at the D-169 merge
// (PRE_D170_CONTRACT_CANONICAL_SHA256); preD169Contract() applies it first.
//
// D-171 then CLOSED D-170's entry and its implementation entry in place after the one send (HTTP 200, one eyes-fixed
// sheet, E1..E5 passed, visual review pending), added the separate eyes-fixed accounting (callsActuallySentSoFar.eyesFixed
// = 1 with its record; underlay 5 and faceNeutral 4 untouched), made the budget text true to the figures and re-worded
// the prose. preD171Contract() reverses exactly that closure, proven canonically identical to the contract at the D-170
// merge (PRE_D171_CONTRACT_CANONICAL_SHA256); preD170Contract() applies it first.
//
// D-172 then ADDED the eyes-fixed retake preparation (top-level eyesFixedRetakePreparation), one authorisedCalls entry for
// call A2 and its implementation entry, moved assets[5].calls 1 -> 2, the budget 22-23 -> 23-24 and the planned eyesFixed
// 1 -> 2, and re-worded the budget text and the prohibition. The actually-sent figures are unchanged. preD172Contract()
// removes exactly those additions, proven canonically identical to the contract at the D-171 commit (PR #354)
// (PRE_D172_CONTRACT_CANONICAL_SHA256); preD171Contract() applies it first.
//
// D-173 then CLOSED D-172's entry and its implementation entry in place after the one send (HTTP 200, one eyes-fixed
// sheet, E1..E5 and F1..F2 passed, an opaque brown iris area in the fixed layer, no candidate), raised the eyes-fixed
// accounting (callsActuallySentSoFar.eyesFixed 1 -> 2 with its record; underlay 5 and faceNeutral 4 untouched), made the
// budget text true to the figures and re-worded the prose. preD173Contract() reverses exactly that closure, proven
// canonically identical to the contract at the D-172 merge (PRE_D173_CONTRACT_CANONICAL_SHA256); preD172Contract()
// applies it first.
//
// D-174 then ADDED the hair method (top-level hairMethod) and one deterministicOperations entry, set assets[8].method, and
// changed the hair blend in layerContract and the hair note in zModel from multiply x token to tonal ramp B. No
// authorisedCalls entry, budget figure or counter changed. preD174Contract() removes exactly those changes, proven
// canonically identical to the contract at the D-173 commit (PR #357) (PRE_D174_CONTRACT_CANONICAL_SHA256);
// preD173Contract() applies it first.
//
// D-175 then ADDED one authorisedCalls entry for the hair call D-175-r3-hair-northstar-v1 and its adapterImplementations
// entry, raised authorisedCalls.count 11 -> 12, gave callsPlannedAndAuthorised a hair axis (hair 1, no new capacity),
// froze hairMethod.rawSheet.prompt unchanged (status DRAFT -> FROZEN, same bytes) and re-worded the budget text and the
// general prohibition. The actually-sent figures and every budget figure are unchanged. preD175Contract() removes exactly
// those changes, proven canonically identical to the contract at the D-174 merge (PRE_D175_CONTRACT_CANONICAL_SHA256);
// preD174Contract() applies it first.
//
// D-176 then CLOSED D-175's entry and its implementation entry in place after the one send (HTTP 200, one hair sheet, H1
// passed, TECHNICAL_REJECT at H2, H3..H5 not evaluated, no candidate), added the separate hair accounting
// (callsActuallySentSoFar.hair = 1 with its record; underlay 5, faceNeutral 4 and eyesFixed 2 untouched), made the budget
// text true to the figures and re-worded the prohibition. preD176Contract() reverses exactly that closure, proven
// canonically identical to the contract at the D-175 merge (PRE_D176_CONTRACT_CANONICAL_SHA256); preD175Contract()
// applies it first.
//
// D-177 then ADDED one authorisedCalls entry for the second hair call D-177-r3-hair-northstar-v2 and its implementation
// entry, raised authorisedCalls.count 12 -> 13, moved assets[8].calls 1 -> 2, the budget 23-24 -> 24-25 and the planned
// hair 1 -> 2, froze prompt v2 beside v1 (hairMethod.rawSheet.promptV2), and re-worded the budget text and the general
// prohibition. The actually-sent figures are unchanged. preD177Contract() removes exactly those additions, proven
// canonically identical to the contract at the D-176 merge (PRE_D177_CONTRACT_CANONICAL_SHA256); preD176Contract()
// applies it first.
//
// D-178 then CLOSED D-177's entry and its implementation entry in place after the one send (HTTP 200, one hair sheet,
// H1..H5 passed, HP1..HP8 not run, no source annotation approved, disposition kept for review), raised the hair accounting
// (callsActuallySentSoFar.hair 1 -> 2 with its record; underlay 5, faceNeutral 4 and eyesFixed 2 untouched), made the
// budget text true to the figures and re-worded the prohibition. preD178Contract() reverses exactly that closure, proven
// canonically identical to the contract at the D-177 merge (PRE_D178_CONTRACT_CANONICAL_SHA256); preD177Contract()
// applies it first.
//
// D-179 then ADDED exactly one key, hairMethod.methodV2 (registration v2 for future hair sheets; no call, no capacity, no
// change to any existing key). preD179Contract() removes it, proven canonically identical to the contract at the D-178
// merge (PRE_D179_CONTRACT_CANONICAL_SHA256); preD178Contract() applies it first.
//
// D-180 then ADDED one authorisedCalls entry for the third hair call D-180-r3-hair-northstar-v3 (the first under
// registration v2) and its implementation entry, raised authorisedCalls.count 13 -> 14, moved assets[8].calls 2 -> 3, the
// budget 24-25 -> 25-26 and the planned hair 2 -> 3, froze prompt v3 in place (hairMethod.methodV2.promptV3.status and the
// methodV2 status line), and re-worded the budget text and the general prohibition. The actually-sent figures are
// unchanged. preD180Contract() removes exactly those additions, proven canonically identical to the contract at the D-179
// merge (PRE_D180_CONTRACT_CANONICAL_SHA256); preD179Contract() applies it first.
//
// D-181 then CLOSED D-180's entry and its implementation entry in place after the one send (HTTP 200, one hair sheet,
// H1..H5 passed, D-179 placement and shape checks not evaluated, no source annotation, disposition kept for review, not
// visually approved), raised the hair accounting (callsActuallySentSoFar.hair 2 -> 3 with its record; underlay 5,
// faceNeutral 4 and eyesFixed 2 untouched), made the budget text true to the figures and re-worded the prohibition.
// preD181Contract() reverses exactly that closure, proven canonically identical to the contract at the D-180 merge
// (PRE_D181_CONTRACT_CANONICAL_SHA256); preD180Contract() applies it first.
//
// D-183 then ADDED one authorisedCalls entry for the fourth hair call D-183-r3-hair-northstar-v4 (two reference images:
// Northstar for style, the tracked geometry guide for fit) and its implementation entry, raised authorisedCalls.count
// 14 -> 15, moved assets[8].calls 3 -> 4, the budget 25-26 -> 26-27 and the planned hair 3 -> 4, appended two keys to
// hairMethod.methodV2 (earTransitionDesign: the design reading of A9/A10; referencePack: guide, prompt v4, input order,
// transform), and re-worded the budget text and the general prohibition. The actually-sent figures are unchanged.
// preD183Contract() removes exactly those additions, proven canonically identical to the contract at the D-181 merge and at
// PRE_D183_COMMIT (PRE_D183_CONTRACT_CANONICAL_SHA256); preD181Contract() applies it first.
//
// D-184 then CLOSED D-183's entry and its implementation entry in place after the one send (HTTP 200, one hair sheet from two
// reference images, H1..H5 passed, D-179 placement and shape checks not evaluated, no source annotation, disposition kept for
// review, not visually approved), raised the hair accounting (callsActuallySentSoFar.hair 3 -> 4 with its record; underlay 5,
// faceNeutral 4 and eyesFixed 2 untouched), made the budget text true to the figures and re-worded the prohibition.
// preD184Contract() reverses exactly that closure, proven canonically identical to the contract at the D-183 merge
// (PRE_D184_CONTRACT_CANONICAL_SHA256); preD183Contract() applies it first.
//
// D-185 then ADDED exactly one key, hairMethod.methodV2.hybridDerivation (the hybrid derivation method, its construction
// annotation form and the review candidate r3-hair-hybrid-v2; no call, no capacity, no change to any existing key).
// preD185Contract() removes it, proven canonically identical to the contract at the D-184 merge
// (PRE_D185_CONTRACT_CANONICAL_SHA256); preD184Contract() applies it first.
//
// D-186 then ADDED exactly one top-level key, underlayHeadNeck (the deterministic H1-free head/neck underlay review candidate,
// its source policy, the N1 neck geometry, the check status with the two H1 gates NOT APPLICABLE, and the correction of
// D-185's U1 wording; no call, no capacity, no change to any existing key). preD186Contract() removes it, proven canonically
// identical to the contract at the D-185 merge (PRE_D186_CONTRACT_CANONICAL_SHA256); preD185Contract() applies it first.
//
// D-187 then ADDED exactly one top-level key, reviewPack (the versioned R3 head review pack: its review mode, sources, the
// DRAFT nape lock, the documented assembly fix, the checks that now run in CI against the pinned review parts and the open
// visual points; no call, no capacity, no change to any existing key). preD187Contract() removes it, proven canonically
// identical to the contract at the D-186 merge (PRE_D187_CONTRACT_CANONICAL_SHA256); preD186Contract() applies it first.
//
// D-188 then ADDED exactly one top-level key, northstarLayerReview (the separate R3 review variant whose visible pixels are
// Northstar v2's own: its narrowly scoped pixel-source exception, the variant's layers and helper/comparison exports, the
// measured deviation from the original, the open areas and the promotion bar; no call, no capacity, no change to any existing
// key). preD188Contract() removes it, proven canonically identical to the contract at the D-187 merge
// (PRE_D188_CONTRACT_CANONICAL_SHA256); preD187Contract() applies it first.
//
// D-189 then ADDED exactly one top-level key, northstarHeadReview (the second Northstar review variant on the unchanged D-188
// baseline: the reconstructed cranium and ear roots, the cleaned feature edges, the measured changes and the open areas; no
// call, no capacity, no change to any existing key). preD189Contract() removes it, proven canonically identical to the
// contract at the D-188 merge (PRE_D189_CONTRACT_CANONICAL_SHA256); preD188Contract() applies it first.
//
// D-190 then ADDED exactly one top-level key, northstarBrowReview (the image-left brow completed by the D-158 mirroring on the
// unchanged D-189 baseline: the measured axis, the translation-only fit, the fill bounded to the area the hair hid and the
// open areas; no call, no capacity, no change to any existing key). preD190Contract() removes it, proven canonically identical
// to the contract at the D-189 merge (PRE_D190_CONTRACT_CANONICAL_SHA256); preD189Contract() applies it first.
//
// D-191 then ADDED exactly one top-level key, northstarHairstylesReview (the finished reconstructed areas, the correction of
// D-190's pixel classification and the R2 short/afro review derivatives on the unchanged D-190 baseline; no call, no
// capacity, no change to any existing key). preD191Contract() removes it, proven canonically identical to the contract at the
// D-190 merge (PRE_D191_CONTRACT_CANONICAL_SHA256); preD190Contract() applies it first.
//
// D-192 then ADDED exactly one top-level key, northstarAfroReview (an afro review derivative for the Northstar v2 head from
// the full-resolution R2 afro original on the unchanged D-191 head; no call, no capacity, no change to any existing key).
// preD192Contract() removes it, proven canonically identical to the contract at the D-191 merge
// (PRE_D192_CONTRACT_CANONICAL_SHA256); preD191Contract() applies it first.
//
// D-193 then ADDED exactly one top-level key, northstarEarfixQuizReview (the shared head underlay's ear slit closed and the
// reproducible quiz-view review with one backdrop proposal; no call, no capacity, no change to any existing key).
// preD193Contract() removes it, proven canonically identical to the contract at the D-192 merge
// (PRE_D193_CONTRACT_CANONICAL_SHA256); preD192Contract() applies it first.
//
// D-194 then ADDED exactly one top-level key, northstarFigureReview (the Northstar-based R3 head on Northstar v2's own body and
// clothes as a reference body, reviewed in the app's avatar views; no call, no capacity, no change to any existing key).
// preD194Contract() removes it, proven canonically identical to the contract at the D-193 merge
// (PRE_D194_CONTRACT_CANONICAL_SHA256); preD193Contract() applies it first.

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

/** The D-159 base commit (the contract as it stood before D-159 added faceNeutralPreparation). */
export const PRE_D159_COMMIT = "14a4d49f695f732c6fae233947c9c03e624201a8";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D159_COMMIT. */
export const PRE_D159_CONTRACT_CANONICAL_SHA256 = "d1f705ef57c67398a3bee49a6412d06387b8469b05918defbb8a068e69e49e14";
/** The top-level keys D-159 added. D-159 changed nothing else in the contract. */
export const D159_ADDED_TOP_LEVEL_KEYS = Object.freeze(["faceNeutralPreparation"]);

export const D162_DECISION = "D-162";
/** The D-162 base commit (origin/main when D-162 was authorised). */
export const PRE_D162_COMMIT = "d9371d12eb46e9c425176a4378e9b69503da0877";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D162_COMMIT. */
export const PRE_D162_CONTRACT_CANONICAL_SHA256 = "27108e4444c26457d54c9fb8957b6238ae90c572d662741fe24b37f9700c3d48";
/** The top-level key D-162 added. */
export const D162_ADDED_TOP_LEVEL_KEYS = Object.freeze(["faceNeutralGuideBPreparation"]);
/** The values D-162 replaced, as they stood at PRE_D162_COMMIT. */
export const PRE_D162 = Object.freeze({
  "count": 6,
  "asset4Calls": 1,
  "minimum": 19,
  "maximum": 20,
  "callsPlannedAndAuthorised": {"underlay":5,"why":"D-153 authorised exactly one further, colour-limited head underlay call with background opaque, and that call has been made (recorded by D-154). assets[0].calls is PLANNED capacity; it moved to 5 when the authorisation was committed, not when the call was made.","derivedBudget":"19-20"},
  "noImageRequestAuthorised": "D-132 and this contract authorise no image request in general, and that general rule is unchanged. authorisedCalls.calls holds SIX entries. Read them by callId and by their own fields, never by the length of the list. (1) D-139-r3-underlay-head-only-v1 — D-139 superseded the general rule NARROWLY for exactly that one named call. That call was made. Its claim is spent on any outcome, prohibitions.noRetry forbids a repeat, and claim.furtherAttempt requires a NEW owner decision and a NEW claim identity. (2) D-142-r3-underlay-core-v1 — NEVER a permission. An incident RECORD with mandateState SPENT, outcome UNKNOWN and neverReuse true. A SPENT entry with neverReuse never counts as an active send permission, and no adapter may read it, or its presence in this list, as authorisation to send. (3) D-143-r3-underlay-core-v2 — NO LONGER a permission. D-143 superseded the general rule NARROWLY for exactly one further CORE-only underlay call. That call was sent once through the D-145 adapter, and D-147 records its outcome: HTTP 200, raw received, candidate rejected, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (4) D-151-r3-head-colour-u1-v1 — NO LONGER a permission. D-151 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay. That call was sent once and D-152 records its outcome: HTTP 400 (background transparent not supported for this model), no image, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-152 is preparation only and adds no entry. (5) D-153-r3-head-colour-u1-opaque-v1 — NO LONGER a permission. D-153 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay with background opaque. That call was sent once and D-154 records its outcome: HTTP 200, raw received, candidate rejected by background-leak, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-154 is feasibility analysis only and adds no entry. (6) D-160-r3-face-neutral-v1 — NO LONGER a permission. D-160 superseded the general rule NARROWLY for exactly one face-neutral attempt. That attempt was sent once and D-161 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, the geometry rejected by the owner, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. No entry in this list is an active send permission — no repeat of D-139's call, no reuse of D-142's, D-143's, D-151's, D-153's or D-160's call id or claim identity, and no other call in the R3 plan."
});

export const D163_DECISION = "D-163";
/** origin/main when D-163 recorded the outcome (the D-162 merge the one D-162 send ran from). */
export const PRE_D163_COMMIT = "877b2b7b7c20b03ec5a72b4b0811703f6e6a0722";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D163_COMMIT. */
export const PRE_D163_CONTRACT_CANONICAL_SHA256 = "596e91a1ead4ce2ee4eab9ddf7828de9fc0feb6f892b9adffe3b09732f8d7222";
/** The keys D-163 added to D-162's entry and to its implementation entry. */
export const D163_ADDED_D162_KEYS = Object.freeze(["neverReuse", "notAnActivePermission", "closure", "execution", "technicalObservations", "visualReview", "diagnosticsLimitation"]);
export const D163_ADDED_D162_IMPL_KEYS = Object.freeze(["neverReuse", "closedBy"]);
/** The values D-163 replaced, as they stood at PRE_D163_COMMIT. */
export const PRE_D163 = Object.freeze({
  "d162": {"status":"AUTHORISED — ONE CALL — NOT YET ATTEMPTED","mandateState":"UNSPENT","outcome":"NOT YET ATTEMPTED"},
  "d162impl": {"adapterStatus":"IMPLEMENTED — NOT EXECUTED","mandateState":"UNSPENT","outcome":"NOT YET ATTEMPTED"},
  "callsActuallySentSoFar": {"underlay":5,"which":["D-139 — sent, output rejected","D-142 — sent during the incident, outcome UNKNOWN","D-143 — sent once, HTTP 200, raw received, candidate rejected by pre.transition-silhouette, nothing promoted (recorded by D-147)","D-151 — sent once, HTTP 400 (background transparent not supported for this model), no image, nothing promoted (recorded by D-152)","D-153 — sent once, HTTP 200, raw received, candidate rejected by background-leak, nothing promoted (recorded by D-154)"],"note":"An OBSERVATION of what has left this machine. D-143's single send is counted here since D-147, D-151's since D-152 and D-153's since D-154.","faceNeutral":1,"faceNeutralRecord":{"counts":"Face-neutral attempts whose dispatch START is documented (D-159 laterAttemptRules.callCounting.counterMeaning). It measures documented local dispatch, not confirmed server receipt; server answers are counted separately below. It is never part of the underlay figure, which stays 5.","attempts":["D-160-r3-face-neutral-v1 — claim consumed, dispatch started, HTTP 200 received, one image, TECHNICAL_REJECT at AUTO-5, geometry rejected by the owner, nothing promoted (recorded by D-161)"],"dispatchUndetermined":0,"serverAnswered":1}},
  "noImageRequestAuthorised": "D-132 and this contract authorise no image request in general, and that general rule is unchanged. authorisedCalls.calls holds SEVEN entries. Read them by callId and by their own fields, never by the length of the list. (1) D-139-r3-underlay-head-only-v1 — D-139 superseded the general rule NARROWLY for exactly that one named call. That call was made. Its claim is spent on any outcome, prohibitions.noRetry forbids a repeat, and claim.furtherAttempt requires a NEW owner decision and a NEW claim identity. (2) D-142-r3-underlay-core-v1 — NEVER a permission. An incident RECORD with mandateState SPENT, outcome UNKNOWN and neverReuse true. A SPENT entry with neverReuse never counts as an active send permission, and no adapter may read it, or its presence in this list, as authorisation to send. (3) D-143-r3-underlay-core-v2 — NO LONGER a permission. D-143 superseded the general rule NARROWLY for exactly one further CORE-only underlay call. That call was sent once through the D-145 adapter, and D-147 records its outcome: HTTP 200, raw received, candidate rejected, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (4) D-151-r3-head-colour-u1-v1 — NO LONGER a permission. D-151 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay. That call was sent once and D-152 records its outcome: HTTP 400 (background transparent not supported for this model), no image, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-152 is preparation only and adds no entry. (5) D-153-r3-head-colour-u1-opaque-v1 — NO LONGER a permission. D-153 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay with background opaque. That call was sent once and D-154 records its outcome: HTTP 200, raw received, candidate rejected by background-leak, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-154 is feasibility analysis only and adds no entry. (6) D-160-r3-face-neutral-v1 — NO LONGER a permission. D-160 superseded the general rule NARROWLY for exactly one face-neutral attempt. That attempt was sent once and D-161 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, the geometry rejected by the owner, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (7) D-162-r3-face-neutral-guide-b-v1 — THE ONLY active send permission. D-162 supersedes the general rule NARROWLY for exactly one further face-neutral attempt (guide B and its prompt, faceNeutralGuideBPreparation), with mandateState UNSPENT and outcome NOT YET ATTEMPTED until its claim exists. Its merge is not a run instruction: the call needs a separate, explicit owner instruction after the merge. prohibitions.noRetry forbids a repeat and claimRules.furtherAttempt requires a NEW owner decision, a NEW call id and a NEW claim identity. Apart from D-162's single attempt, no entry in this list is an active send permission — no repeat of D-139's call, no reuse of D-142's, D-143's, D-151's, D-153's, D-160's or D-162's call id or claim identity, and no other call in the R3 plan."
});

export const D164_DECISION = "D-164";
/** origin/main when D-164 integrated the parts method (the D-163 merge). */
export const PRE_D164_COMMIT = "efd92d49f85083bcf9f47e4cf47b12fe8aaba16e";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D164_COMMIT. */
export const PRE_D164_CONTRACT_CANONICAL_SHA256 = "653c71b709e0506ee6606e0b06f49f31c34481d8de169ebb2923fb4dd6ecbc54";
/** The top-level key D-164 added, its deterministicOperations entry, and the assets[4].method it replaced. */
export const D164_ADDED_TOP_LEVEL_KEYS = Object.freeze(["faceNeutralPartsMethod"]);
export const D164_ADDED_OPERATION = "face-neutral parts placement (D-164)";
export const PRE_D164 = Object.freeze({ "asset4Method": "generated" });

export const D165_DECISION = "D-165";
/** origin/main when D-165 was authorised (the D-164 merge). */
export const PRE_D165_COMMIT = "a3eef45ad240e988bb8201bb29d3966e99a600ec";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D165_COMMIT. */
export const PRE_D165_CONTRACT_CANONICAL_SHA256 = "d111724b6b02cfcfd572c37cda6a666e223d940272e3adc0d3b4bc247cce86c0";
/** The values D-165 replaced, as they stood at PRE_D165_COMMIT. */
export const PRE_D165 = Object.freeze({
  "count": 7,
  "asset4Calls": 2,
  "minimum": 20,
  "maximum": 21,
  "callsPlannedAndAuthorised": {"underlay":5,"why":"D-153 authorised exactly one further, colour-limited head underlay call with background opaque, and that call has been made (recorded by D-154). assets[0].calls is PLANNED capacity; it moved to 5 when the authorisation was committed, not when the call was made.","derivedBudget":"20-21","faceNeutral":2,"faceNeutralWhy":"D-162 authorises exactly one further face-neutral attempt on top of D-160's spent one. assets[4].calls is PLANNED capacity; it moves 1 -> 2 when the authorisation is committed, not when the call is made."},
  "noImageRequestAuthorised": "D-132 and this contract authorise no image request in general, and that general rule is unchanged. authorisedCalls.calls holds SEVEN entries. Read them by callId and by their own fields, never by the length of the list. (1) D-139-r3-underlay-head-only-v1 — D-139 superseded the general rule NARROWLY for exactly that one named call. That call was made. Its claim is spent on any outcome, prohibitions.noRetry forbids a repeat, and claim.furtherAttempt requires a NEW owner decision and a NEW claim identity. (2) D-142-r3-underlay-core-v1 — NEVER a permission. An incident RECORD with mandateState SPENT, outcome UNKNOWN and neverReuse true. A SPENT entry with neverReuse never counts as an active send permission, and no adapter may read it, or its presence in this list, as authorisation to send. (3) D-143-r3-underlay-core-v2 — NO LONGER a permission. D-143 superseded the general rule NARROWLY for exactly one further CORE-only underlay call. That call was sent once through the D-145 adapter, and D-147 records its outcome: HTTP 200, raw received, candidate rejected, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (4) D-151-r3-head-colour-u1-v1 — NO LONGER a permission. D-151 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay. That call was sent once and D-152 records its outcome: HTTP 400 (background transparent not supported for this model), no image, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-152 is preparation only and adds no entry. (5) D-153-r3-head-colour-u1-opaque-v1 — NO LONGER a permission. D-153 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay with background opaque. That call was sent once and D-154 records its outcome: HTTP 200, raw received, candidate rejected by background-leak, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-154 is feasibility analysis only and adds no entry. (6) D-160-r3-face-neutral-v1 — NO LONGER a permission. D-160 superseded the general rule NARROWLY for exactly one face-neutral attempt. That attempt was sent once and D-161 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, the geometry rejected by the owner, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (7) D-162-r3-face-neutral-guide-b-v1 — NO LONGER a permission. D-162 superseded the general rule NARROWLY for exactly one further face-neutral attempt (guide B and its prompt). That attempt was sent once and D-163 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. No entry in this list is an active send permission — no repeat of D-139's call, no reuse of D-142's, D-143's, D-151's, D-153's, D-160's or D-162's call id or claim identity, and no other call in the R3 plan."
});

export const D166_DECISION = "D-166";
/** origin/main when D-166 recorded the outcome (the D-165 merge the one D-165 send ran from). */
export const PRE_D166_COMMIT = "6b873bf37f226e365d3bde03e89331fd1570f50f";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D166_COMMIT. */
export const PRE_D166_CONTRACT_CANONICAL_SHA256 = "814665fb256902a42b4e12b6f2a15bdb2459aacdf8ae76a7c6c8a225b26cf161";
/** The keys D-166 added to D-165's entry and to its implementation entry. */
export const D166_ADDED_D165_KEYS = Object.freeze(["neverReuse", "notAnActivePermission", "closure", "execution", "technicalObservations", "visualReview", "diagnosticsLimitation"]);
export const D166_ADDED_D165_IMPL_KEYS = Object.freeze(["neverReuse", "closedBy"]);
/** The values D-166 replaced, as they stood at PRE_D166_COMMIT. */
export const PRE_D166 = Object.freeze({
  "d165": {"status":"AUTHORISED — ONE CALL — NOT YET ATTEMPTED","mandateState":"UNSPENT","outcome":"NOT YET ATTEMPTED"},
  "d165impl": {"adapterStatus":"IMPLEMENTED — NOT EXECUTED","mandateState":"UNSPENT","outcome":"NOT YET ATTEMPTED"},
  "callsActuallySentSoFar": {"underlay":5,"which":["D-139 — sent, output rejected","D-142 — sent during the incident, outcome UNKNOWN","D-143 — sent once, HTTP 200, raw received, candidate rejected by pre.transition-silhouette, nothing promoted (recorded by D-147)","D-151 — sent once, HTTP 400 (background transparent not supported for this model), no image, nothing promoted (recorded by D-152)","D-153 — sent once, HTTP 200, raw received, candidate rejected by background-leak, nothing promoted (recorded by D-154)"],"note":"An OBSERVATION of what has left this machine. D-143's single send is counted here since D-147, D-151's since D-152 and D-153's since D-154.","faceNeutral":2,"faceNeutralRecord":{"counts":"Face-neutral attempts whose dispatch START is documented (D-159 laterAttemptRules.callCounting.counterMeaning). It measures documented local dispatch, not confirmed server receipt; server answers are counted separately below. It is never part of the underlay figure, which stays 5.","attempts":["D-160-r3-face-neutral-v1 — claim consumed, dispatch started, HTTP 200 received, one image, TECHNICAL_REJECT at AUTO-5, geometry rejected by the owner, nothing promoted (recorded by D-161)","D-162-r3-face-neutral-guide-b-v1 — claim consumed, dispatch started, HTTP 200 received, one image, TECHNICAL_REJECT at AUTO-5, nothing promoted (recorded by D-163)"],"dispatchUndetermined":0,"serverAnswered":2}},
  "budgetAccounting": "assets[0] carries 5 PLANNED calls after D-153: D-139, sent with its output rejected; the D-142 attempt, sent during an incident with an unknown outcome; D-143's one call, sent once with its candidate rejected (recorded by D-147); D-151's one call, sent once and refused with HTTP 400, no image (recorded by D-152); and D-153's one call, sent once, raw received, candidate rejected by background-leak (recorded by D-154). The derived budget is 19-20. Budget numbers remain planning, never consent.",
  "noImageRequestAuthorised": "D-132 and this contract authorise no image request in general, and that general rule is unchanged. authorisedCalls.calls holds EIGHT entries. Read them by callId and by their own fields, never by the length of the list. (1) D-139-r3-underlay-head-only-v1 — D-139 superseded the general rule NARROWLY for exactly that one named call. That call was made. Its claim is spent on any outcome, prohibitions.noRetry forbids a repeat, and claim.furtherAttempt requires a NEW owner decision and a NEW claim identity. (2) D-142-r3-underlay-core-v1 — NEVER a permission. An incident RECORD with mandateState SPENT, outcome UNKNOWN and neverReuse true. A SPENT entry with neverReuse never counts as an active send permission, and no adapter may read it, or its presence in this list, as authorisation to send. (3) D-143-r3-underlay-core-v2 — NO LONGER a permission. D-143 superseded the general rule NARROWLY for exactly one further CORE-only underlay call. That call was sent once through the D-145 adapter, and D-147 records its outcome: HTTP 200, raw received, candidate rejected, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (4) D-151-r3-head-colour-u1-v1 — NO LONGER a permission. D-151 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay. That call was sent once and D-152 records its outcome: HTTP 400 (background transparent not supported for this model), no image, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-152 is preparation only and adds no entry. (5) D-153-r3-head-colour-u1-opaque-v1 — NO LONGER a permission. D-153 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay with background opaque. That call was sent once and D-154 records its outcome: HTTP 200, raw received, candidate rejected by background-leak, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-154 is feasibility analysis only and adds no entry. (6) D-160-r3-face-neutral-v1 — NO LONGER a permission. D-160 superseded the general rule NARROWLY for exactly one face-neutral attempt. That attempt was sent once and D-161 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, the geometry rejected by the owner, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (7) D-162-r3-face-neutral-guide-b-v1 — NO LONGER a permission. D-162 superseded the general rule NARROWLY for exactly one further face-neutral attempt (guide B and its prompt). That attempt was sent once and D-163 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (8) D-165-r3-face-parts-sheet-v1 — THE ONLY active send permission. D-165 supersedes the general rule NARROWLY for exactly one face-neutral parts-sheet attempt (the first sheet of D-164's faceNeutralPartsMethod), with mandateState UNSPENT and outcome NOT YET ATTEMPTED until its claim exists. Its merge is not a run instruction: the call needs a separate, explicit owner instruction after the merge. prohibitions.noRetry forbids a repeat and claimRules.furtherAttempt requires a NEW owner decision, a NEW call id and a NEW claim identity. Apart from D-165's single attempt, no entry in this list is an active send permission — no repeat of D-139's call, no reuse of D-142's, D-143's, D-151's, D-153's, D-160's, D-162's or D-165's call id or claim identity, and no other call in the R3 plan."
});

export const D167_DECISION = "D-167";
/** origin/main when D-167 was authorised (the D-166 merge). */
export const PRE_D167_COMMIT = "f7c237e2c7d7a17ef756a791cc5b97c182c2f7bb";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D167_COMMIT. */
export const PRE_D167_CONTRACT_CANONICAL_SHA256 = "56f05dd16b94f61f99d024e41ff573bb45c76cc2a41c560026cfc8a1cbb5dc40";
/** The top-level key D-167 added. */
export const D167_ADDED_TOP_LEVEL_KEYS = Object.freeze(["faceNeutralPartsExtension"]);
/** The values D-167 replaced, as they stood at PRE_D167_COMMIT. */
export const PRE_D167 = Object.freeze({
  "count": 8,
  "asset4Calls": 3,
  "minimum": 21,
  "maximum": 22,
  "callsPlannedAndAuthorised": {"underlay":5,"why":"D-153 authorised exactly one further, colour-limited head underlay call with background opaque, and that call has been made (recorded by D-154). assets[0].calls is PLANNED capacity; it moved to 5 when the authorisation was committed, not when the call was made.","derivedBudget":"21-22","faceNeutral":3,"faceNeutralWhy":"D-165 authorises exactly one further face-neutral attempt — the first D-164 parts sheet — on top of D-160's and D-162's spent ones. assets[4].calls is PLANNED capacity; it moves 2 -> 3 when the authorisation is committed, not when the call is made."},
  "budgetAccounting": "assets[0] carries 5 PLANNED calls after D-153: D-139, sent with its output rejected; the D-142 attempt, sent during an incident with an unknown outcome; D-143's one call, sent once with its candidate rejected (recorded by D-147); D-151's one call, sent once and refused with HTTP 400, no image (recorded by D-152); and D-153's one call, sent once, raw received, candidate rejected by background-leak (recorded by D-154). assets[4] (r3-face-neutral) carries 3 PLANNED calls after D-165: D-160's, D-162's and D-165's single attempts, each sent once (recorded by D-161, D-163 and D-166), so actually sent is underlay 5 and faceNeutral 3 and the planned face capacity is used up. The derived budget is 21-22. Budget numbers remain planning, never consent.",
  "noImageRequestAuthorised": "D-132 and this contract authorise no image request in general, and that general rule is unchanged. authorisedCalls.calls holds EIGHT entries. Read them by callId and by their own fields, never by the length of the list. (1) D-139-r3-underlay-head-only-v1 — D-139 superseded the general rule NARROWLY for exactly that one named call. That call was made. Its claim is spent on any outcome, prohibitions.noRetry forbids a repeat, and claim.furtherAttempt requires a NEW owner decision and a NEW claim identity. (2) D-142-r3-underlay-core-v1 — NEVER a permission. An incident RECORD with mandateState SPENT, outcome UNKNOWN and neverReuse true. A SPENT entry with neverReuse never counts as an active send permission, and no adapter may read it, or its presence in this list, as authorisation to send. (3) D-143-r3-underlay-core-v2 — NO LONGER a permission. D-143 superseded the general rule NARROWLY for exactly one further CORE-only underlay call. That call was sent once through the D-145 adapter, and D-147 records its outcome: HTTP 200, raw received, candidate rejected, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (4) D-151-r3-head-colour-u1-v1 — NO LONGER a permission. D-151 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay. That call was sent once and D-152 records its outcome: HTTP 400 (background transparent not supported for this model), no image, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-152 is preparation only and adds no entry. (5) D-153-r3-head-colour-u1-opaque-v1 — NO LONGER a permission. D-153 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay with background opaque. That call was sent once and D-154 records its outcome: HTTP 200, raw received, candidate rejected by background-leak, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-154 is feasibility analysis only and adds no entry. (6) D-160-r3-face-neutral-v1 — NO LONGER a permission. D-160 superseded the general rule NARROWLY for exactly one face-neutral attempt. That attempt was sent once and D-161 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, the geometry rejected by the owner, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (7) D-162-r3-face-neutral-guide-b-v1 — NO LONGER a permission. D-162 superseded the general rule NARROWLY for exactly one further face-neutral attempt (guide B and its prompt). That attempt was sent once and D-163 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (8) D-165-r3-face-parts-sheet-v1 — NO LONGER a permission. D-165 superseded the general rule NARROWLY for exactly one face-neutral parts-sheet attempt. That attempt was sent once and D-166 records its outcome: HTTP 200, one sheet, RAW-1..5 passed, the nose rejected by the owner, the brows and mouth kept for further review, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. No entry in this list is an active send permission — no repeat of D-139's call, no reuse of D-142's, D-143's, D-151's, D-153's, D-160's, D-162's or D-165's call id or claim identity, and no other call in the R3 plan."
});

export const D168_DECISION = "D-168";
/** origin/main when D-168 recorded the outcome (the D-167 merge the one D-167 send ran from). */
export const PRE_D168_COMMIT = "a21f40d628462cf1acf4fbbd09800ed4da3cbc0b";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D168_COMMIT. */
export const PRE_D168_CONTRACT_CANONICAL_SHA256 = "bd2385c4fad5a1cd7ed72a7e7a80705ad2fe118ffc298669e9186661e59c2564";
/** The keys D-168 added to D-167's entry and to its implementation entry. */
export const D168_ADDED_D167_KEYS = Object.freeze(["neverReuse", "notAnActivePermission", "closure", "execution", "technicalObservations", "visualReview", "diagnosticsLimitation"]);
export const D168_ADDED_D167_IMPL_KEYS = Object.freeze(["neverReuse", "closedBy"]);
/** The values D-168 replaced, as they stood at PRE_D168_COMMIT. */
export const PRE_D168 = Object.freeze({
  "d167": {"status":"AUTHORISED — ONE CALL — NOT YET ATTEMPTED","mandateState":"UNSPENT","outcome":"NOT YET ATTEMPTED"},
  "d167impl": {"adapterStatus":"IMPLEMENTED — NOT EXECUTED","mandateState":"UNSPENT","outcome":"NOT YET ATTEMPTED"},
  "callsActuallySentSoFar": {"underlay":5,"which":["D-139 — sent, output rejected","D-142 — sent during the incident, outcome UNKNOWN","D-143 — sent once, HTTP 200, raw received, candidate rejected by pre.transition-silhouette, nothing promoted (recorded by D-147)","D-151 — sent once, HTTP 400 (background transparent not supported for this model), no image, nothing promoted (recorded by D-152)","D-153 — sent once, HTTP 200, raw received, candidate rejected by background-leak, nothing promoted (recorded by D-154)"],"note":"An OBSERVATION of what has left this machine. D-143's single send is counted here since D-147, D-151's since D-152 and D-153's since D-154.","faceNeutral":3,"faceNeutralRecord":{"counts":"Face-neutral attempts whose dispatch START is documented (D-159 laterAttemptRules.callCounting.counterMeaning). It measures documented local dispatch, not confirmed server receipt; server answers are counted separately below. It is never part of the underlay figure, which stays 5.","attempts":["D-160-r3-face-neutral-v1 — claim consumed, dispatch started, HTTP 200 received, one image, TECHNICAL_REJECT at AUTO-5, geometry rejected by the owner, nothing promoted (recorded by D-161)","D-162-r3-face-neutral-guide-b-v1 — claim consumed, dispatch started, HTTP 200 received, one image, TECHNICAL_REJECT at AUTO-5, nothing promoted (recorded by D-163)","D-165-r3-face-parts-sheet-v1 — claim consumed, dispatch started, HTTP 200 received, one 1024x1024 sheet, RAW-1..5 passed, nose rejected by the owner, brows and mouth kept for further review, nothing promoted (recorded by D-166)"],"dispatchUndetermined":0,"serverAnswered":3}},
  "budgetAccounting": "assets[0] carries 5 PLANNED calls after D-153: D-139, sent with its output rejected; the D-142 attempt, sent during an incident with an unknown outcome; D-143's one call, sent once with its candidate rejected (recorded by D-147); D-151's one call, sent once and refused with HTTP 400, no image (recorded by D-152); and D-153's one call, sent once, raw received, candidate rejected by background-leak (recorded by D-154). assets[4] (r3-face-neutral) carries 4 PLANNED calls after D-167: D-160's, D-162's and D-165's single attempts, each sent once (recorded by D-161, D-163 and D-166), and D-167's one partial nose sheet, which has not been sent; so actually sent is underlay 5 and faceNeutral 3. The derived budget is 22-23. Budget numbers remain planning, never consent.",
  "noImageRequestAuthorised": "D-132 and this contract authorise no image request in general, and that general rule is unchanged. authorisedCalls.calls holds NINE entries. Read them by callId and by their own fields, never by the length of the list. (1) D-139-r3-underlay-head-only-v1 — D-139 superseded the general rule NARROWLY for exactly that one named call. That call was made. Its claim is spent on any outcome, prohibitions.noRetry forbids a repeat, and claim.furtherAttempt requires a NEW owner decision and a NEW claim identity. (2) D-142-r3-underlay-core-v1 — NEVER a permission. An incident RECORD with mandateState SPENT, outcome UNKNOWN and neverReuse true. A SPENT entry with neverReuse never counts as an active send permission, and no adapter may read it, or its presence in this list, as authorisation to send. (3) D-143-r3-underlay-core-v2 — NO LONGER a permission. D-143 superseded the general rule NARROWLY for exactly one further CORE-only underlay call. That call was sent once through the D-145 adapter, and D-147 records its outcome: HTTP 200, raw received, candidate rejected, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (4) D-151-r3-head-colour-u1-v1 — NO LONGER a permission. D-151 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay. That call was sent once and D-152 records its outcome: HTTP 400 (background transparent not supported for this model), no image, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-152 is preparation only and adds no entry. (5) D-153-r3-head-colour-u1-opaque-v1 — NO LONGER a permission. D-153 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay with background opaque. That call was sent once and D-154 records its outcome: HTTP 200, raw received, candidate rejected by background-leak, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-154 is feasibility analysis only and adds no entry. (6) D-160-r3-face-neutral-v1 — NO LONGER a permission. D-160 superseded the general rule NARROWLY for exactly one face-neutral attempt. That attempt was sent once and D-161 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, the geometry rejected by the owner, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (7) D-162-r3-face-neutral-guide-b-v1 — NO LONGER a permission. D-162 superseded the general rule NARROWLY for exactly one further face-neutral attempt (guide B and its prompt). That attempt was sent once and D-163 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (8) D-165-r3-face-parts-sheet-v1 — NO LONGER a permission. D-165 superseded the general rule NARROWLY for exactly one face-neutral parts-sheet attempt. That attempt was sent once and D-166 records its outcome: HTTP 200, one sheet, RAW-1..5 passed, the nose rejected by the owner, the brows and mouth kept for further review, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (9) D-167-r3-face-parts-nose-v1 — THE ONLY active send permission. D-167 supersedes the general rule NARROWLY for exactly one face-neutral partial nose sheet (faceNeutralPartsExtension), with mandateState UNSPENT and outcome NOT YET ATTEMPTED until its claim exists. Its merge is not a run instruction: the call needs a separate, explicit owner instruction after the merge. prohibitions.noRetry forbids a repeat and claimRules.furtherAttempt requires a NEW owner decision, a NEW call id and a NEW claim identity. Apart from D-167's single attempt, no entry in this list is an active send permission — no repeat of D-139's call, no reuse of D-142's, D-143's, D-151's, D-153's, D-160's, D-162's, D-165's or D-167's call id or claim identity, and no other call in the R3 plan."
});

export const D173_DECISION = "D-173";
/** origin/main when D-173 recorded the outcome (the D-172 merge the one D-172 send ran from). */
export const PRE_D173_COMMIT = "315079d16a360721cc27f923bfd651dbdf7f0e3f";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D173_COMMIT. */
export const PRE_D173_CONTRACT_CANONICAL_SHA256 = "98b62f4e9cd4e9fbde4b119992ffe76beedd3dc65378c3cb1125aeb6e29825cb";
/** The keys D-173 added to D-172's entry and to its implementation entry. */
export const D173_ADDED_D172_KEYS = Object.freeze(["neverReuse", "notAnActivePermission", "closure", "execution", "technicalObservations", "visualReview"]);
export const D173_ADDED_D172_IMPL_KEYS = Object.freeze(["neverReuse", "closedBy"]);
/** The values D-173 replaced, as they stood at PRE_D173_COMMIT. */
export const PRE_D173 = Object.freeze({
  "d172": {"status":"AUTHORISED — ONE CALL — NOT YET ATTEMPTED","mandateState":"UNSPENT","outcome":"NOT YET ATTEMPTED"},
  "d172impl": {"adapterStatus":"IMPLEMENTED — NOT EXECUTED","mandateState":"UNSPENT","outcome":"NOT YET ATTEMPTED"},
  "callsActuallySentSoFar": {"underlay":5,"which":["D-139 — sent, output rejected","D-142 — sent during the incident, outcome UNKNOWN","D-143 — sent once, HTTP 200, raw received, candidate rejected by pre.transition-silhouette, nothing promoted (recorded by D-147)","D-151 — sent once, HTTP 400 (background transparent not supported for this model), no image, nothing promoted (recorded by D-152)","D-153 — sent once, HTTP 200, raw received, candidate rejected by background-leak, nothing promoted (recorded by D-154)"],"note":"An OBSERVATION of what has left this machine. D-143's single send is counted here since D-147, D-151's since D-152 and D-153's since D-154.","faceNeutral":4,"faceNeutralRecord":{"counts":"Face-neutral attempts whose dispatch START is documented (D-159 laterAttemptRules.callCounting.counterMeaning). It measures documented local dispatch, not confirmed server receipt; server answers are counted separately below. It is never part of the underlay figure, which stays 5.","attempts":["D-160-r3-face-neutral-v1 — claim consumed, dispatch started, HTTP 200 received, one image, TECHNICAL_REJECT at AUTO-5, geometry rejected by the owner, nothing promoted (recorded by D-161)","D-162-r3-face-neutral-guide-b-v1 — claim consumed, dispatch started, HTTP 200 received, one image, TECHNICAL_REJECT at AUTO-5, nothing promoted (recorded by D-163)","D-165-r3-face-parts-sheet-v1 — claim consumed, dispatch started, HTTP 200 received, one 1024x1024 sheet, RAW-1..5 passed, nose rejected by the owner, brows and mouth kept for further review, nothing promoted (recorded by D-166)","D-167-r3-face-parts-nose-v1 — claim consumed, dispatch started, HTTP 200 received, one 1024x1024 partial sheet, TECHNICAL_REJECT at RAW-4′ (5 px at alpha 1 outside the nose cell), no nose approved, nothing promoted (recorded by D-168)"],"dispatchUndetermined":0,"serverAnswered":4},"eyesFixed":1,"eyesFixedRecord":{"counts":"Eyes-fixed attempts (assets[5]) whose dispatch START is documented, on D-159's claim / dispatch / result axes. It is never part of the underlay or face-neutral figures, which stay 5 and 4.","attempts":["D-170-r3-eyes-fixed-v1 — claim consumed, dispatch started, HTTP 200 received, one 1536x1024 sheet, E1..E5 passed, visual review pending, nothing promoted (recorded by D-171)"],"dispatchUndetermined":0,"serverAnswered":1}},
  "budgetAccounting": "assets[0] carries 5 PLANNED calls after D-153: D-139, sent with its output rejected; the D-142 attempt, sent during an incident with an unknown outcome; D-143's one call, sent once with its candidate rejected (recorded by D-147); D-151's one call, sent once and refused with HTTP 400, no image (recorded by D-152); and D-153's one call, sent once, raw received, candidate rejected by background-leak (recorded by D-154). assets[4] (r3-face-neutral) carries 4 PLANNED calls after D-167: D-160's, D-162's, D-165's and D-167's single attempts, each sent once (recorded by D-161, D-163, D-166 and D-168), so actually sent is underlay 5 and faceNeutral 4 and the planned face capacity is used up. assets[5] (r3-eyes-neutral-fixed) carries its 1 PLANNED call: D-170's one eyes-fixed sheet, sent once (recorded by D-171), so actually sent is eyesFixed 1; D-172 adds ONE further planned eyes-fixed call (assets[5] 1 -> 2) for call A2, authorised and not yet sent; assets[6] (iris) keeps 1 PLANNED call with no authorisation. The derived budget is 23-24. Budget numbers remain planning, never consent.",
  "noImageRequestAuthorised": "D-132 and this contract authorise no image request in general, and that general rule is unchanged. authorisedCalls.calls holds ELEVEN entries. Read them by callId and by their own fields, never by the length of the list. (1) D-139-r3-underlay-head-only-v1 — D-139 superseded the general rule NARROWLY for exactly that one named call. That call was made. Its claim is spent on any outcome, prohibitions.noRetry forbids a repeat, and claim.furtherAttempt requires a NEW owner decision and a NEW claim identity. (2) D-142-r3-underlay-core-v1 — NEVER a permission. An incident RECORD with mandateState SPENT, outcome UNKNOWN and neverReuse true. A SPENT entry with neverReuse never counts as an active send permission, and no adapter may read it, or its presence in this list, as authorisation to send. (3) D-143-r3-underlay-core-v2 — NO LONGER a permission. D-143 superseded the general rule NARROWLY for exactly one further CORE-only underlay call. That call was sent once through the D-145 adapter, and D-147 records its outcome: HTTP 200, raw received, candidate rejected, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (4) D-151-r3-head-colour-u1-v1 — NO LONGER a permission. D-151 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay. That call was sent once and D-152 records its outcome: HTTP 400 (background transparent not supported for this model), no image, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-152 is preparation only and adds no entry. (5) D-153-r3-head-colour-u1-opaque-v1 — NO LONGER a permission. D-153 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay with background opaque. That call was sent once and D-154 records its outcome: HTTP 200, raw received, candidate rejected by background-leak, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-154 is feasibility analysis only and adds no entry. (6) D-160-r3-face-neutral-v1 — NO LONGER a permission. D-160 superseded the general rule NARROWLY for exactly one face-neutral attempt. That attempt was sent once and D-161 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, the geometry rejected by the owner, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (7) D-162-r3-face-neutral-guide-b-v1 — NO LONGER a permission. D-162 superseded the general rule NARROWLY for exactly one further face-neutral attempt (guide B and its prompt). That attempt was sent once and D-163 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (8) D-165-r3-face-parts-sheet-v1 — NO LONGER a permission. D-165 superseded the general rule NARROWLY for exactly one face-neutral parts-sheet attempt. That attempt was sent once and D-166 records its outcome: HTTP 200, one sheet, RAW-1..5 passed, the nose rejected by the owner, the brows and mouth kept for further review, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (9) D-167-r3-face-parts-nose-v1 — NO LONGER a permission. D-167 superseded the general rule NARROWLY for exactly one face-neutral partial nose sheet. That attempt was sent once and D-168 records its outcome: HTTP 200, one partial sheet, rejected by the binding RAW-4′ check, no nose approved, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (10) D-170-r3-eyes-fixed-v1 — NO LONGER a permission. D-170 superseded the general rule NARROWLY for exactly one eyes-fixed sheet (call A). That attempt was sent once and D-171 records its outcome: HTTP 200, one sheet, E1..E5 passed, the owner's visual review pending, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. The iris call B is not authorised. (11) D-172-r3-eyes-fixed-v2 — THE ONLY active send permission. D-172 supersedes the general rule NARROWLY for exactly one further eyes-fixed sheet (call A2), with mandateState UNSPENT and outcome NOT YET ATTEMPTED until its claim exists. Its merge is not a run instruction: the call needs a separate, explicit owner instruction after D-171 and D-172 are merged. prohibitions.noRetry forbids a repeat and claimRules.furtherAttempt requires a NEW owner decision, a NEW call id and a NEW claim identity. The iris call B is not authorised. Apart from D-172's single attempt, no entry in this list is an active send permission — no repeat of D-139's call, no reuse of D-142's, D-143's, D-151's, D-153's, D-160's, D-162's, D-165's, D-167's, D-170's or D-172's call id or claim identity, and no other call in the R3 plan."
});

export const D174_DECISION = "D-174";
/** The D-173 commit D-174 builds on (PR #357; D-174 depends on it). */
export const PRE_D174_COMMIT = "202915fda1562cff5d4d2749f9ca5598fd233ea2";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D174_COMMIT. */
export const PRE_D174_CONTRACT_CANONICAL_SHA256 = "69b5d78650bea068a16399ae7a139906c1c12ff5cc73d188a7ccf7a027c3f50e";
export const D174_ADDED_TOP_LEVEL_KEYS = Object.freeze(["hairMethod"]);
export const D174_ADDED_OPERATION = "hair placement and tonal ramp B (D-174)";
/** The values D-174 replaced, as they stood at PRE_D174_COMMIT. */
export const PRE_D174 = Object.freeze({ "asset8Method": "generated", "layerHairBlend": "multiply x hair token", "zModelHairNote": "multiply x hair token" });

export const D175_DECISION = "D-175";
/** origin/main when D-175 authorised the hair call (the D-174 merge). */
export const PRE_D175_COMMIT = "8c5ce0186b60d253884c1e7d53fde593ae4ad619";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D175_COMMIT. */
export const PRE_D175_CONTRACT_CANONICAL_SHA256 = "e1db392cd6170a0a052fca9a0fed9ce85362c9e0f956e59107920a8c6b79763e";
export const D175_CALL_ID = "D-175-r3-hair-northstar-v1";
export const D175_ADDED_PLANNED_KEYS = Object.freeze(["hair", "hairWhy"]);
/** The values D-175 replaced, as they stood at PRE_D175_COMMIT. */
export const PRE_D175 = Object.freeze({
  "budgetAccounting":"assets[0] carries 5 PLANNED calls after D-153: D-139, sent with its output rejected; the D-142 attempt, sent during an incident with an unknown outcome; D-143's one call, sent once with its candidate rejected (recorded by D-147); D-151's one call, sent once and refused with HTTP 400, no image (recorded by D-152); and D-153's one call, sent once, raw received, candidate rejected by background-leak (recorded by D-154). assets[4] (r3-face-neutral) carries 4 PLANNED calls after D-167: D-160's, D-162's, D-165's and D-167's single attempts, each sent once (recorded by D-161, D-163, D-166 and D-168), so actually sent is underlay 5 and faceNeutral 4 and the planned face capacity is used up. assets[5] (r3-eyes-neutral-fixed) carries its 1 PLANNED call: D-170's one eyes-fixed sheet, sent once (recorded by D-171), D-172 added ONE further planned eyes-fixed call (assets[5] 1 -> 2) for call A2, sent once (recorded by D-173), so actually sent is eyesFixed 2 and the planned eyes-fixed capacity (2) is used up; assets[6] (iris) keeps 1 PLANNED call with no authorisation. The derived budget is 23-24. Budget numbers remain planning, never consent.",
  "noImageRequestAuthorised":"D-132 and this contract authorise no image request in general, and that general rule is unchanged. authorisedCalls.calls holds ELEVEN entries. Read them by callId and by their own fields, never by the length of the list. (1) D-139-r3-underlay-head-only-v1 — D-139 superseded the general rule NARROWLY for exactly that one named call. That call was made. Its claim is spent on any outcome, prohibitions.noRetry forbids a repeat, and claim.furtherAttempt requires a NEW owner decision and a NEW claim identity. (2) D-142-r3-underlay-core-v1 — NEVER a permission. An incident RECORD with mandateState SPENT, outcome UNKNOWN and neverReuse true. A SPENT entry with neverReuse never counts as an active send permission, and no adapter may read it, or its presence in this list, as authorisation to send. (3) D-143-r3-underlay-core-v2 — NO LONGER a permission. D-143 superseded the general rule NARROWLY for exactly one further CORE-only underlay call. That call was sent once through the D-145 adapter, and D-147 records its outcome: HTTP 200, raw received, candidate rejected, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (4) D-151-r3-head-colour-u1-v1 — NO LONGER a permission. D-151 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay. That call was sent once and D-152 records its outcome: HTTP 400 (background transparent not supported for this model), no image, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-152 is preparation only and adds no entry. (5) D-153-r3-head-colour-u1-opaque-v1 — NO LONGER a permission. D-153 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay with background opaque. That call was sent once and D-154 records its outcome: HTTP 200, raw received, candidate rejected by background-leak, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-154 is feasibility analysis only and adds no entry. (6) D-160-r3-face-neutral-v1 — NO LONGER a permission. D-160 superseded the general rule NARROWLY for exactly one face-neutral attempt. That attempt was sent once and D-161 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, the geometry rejected by the owner, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (7) D-162-r3-face-neutral-guide-b-v1 — NO LONGER a permission. D-162 superseded the general rule NARROWLY for exactly one further face-neutral attempt (guide B and its prompt). That attempt was sent once and D-163 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (8) D-165-r3-face-parts-sheet-v1 — NO LONGER a permission. D-165 superseded the general rule NARROWLY for exactly one face-neutral parts-sheet attempt. That attempt was sent once and D-166 records its outcome: HTTP 200, one sheet, RAW-1..5 passed, the nose rejected by the owner, the brows and mouth kept for further review, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (9) D-167-r3-face-parts-nose-v1 — NO LONGER a permission. D-167 superseded the general rule NARROWLY for exactly one face-neutral partial nose sheet. That attempt was sent once and D-168 records its outcome: HTTP 200, one partial sheet, rejected by the binding RAW-4′ check, no nose approved, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (10) D-170-r3-eyes-fixed-v1 — NO LONGER a permission. D-170 superseded the general rule NARROWLY for exactly one eyes-fixed sheet (call A). That attempt was sent once and D-171 records its outcome: HTTP 200, one sheet, E1..E5 passed, the owner's visual review pending, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. The iris call B is not authorised. (11) D-172-r3-eyes-fixed-v2 — NO LONGER a permission. D-172 superseded the general rule NARROWLY for exactly one further eyes-fixed sheet (call A2). That attempt was sent once and D-173 records its outcome: HTTP 200, one sheet, E1..E5 and F1..F2 passed, an opaque brown iris area in the fixed layer, no candidate, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. The iris call B is not authorised. No entry in this list is an active send permission — no repeat of D-139's call, no reuse of D-142's, D-143's, D-151's, D-153's, D-160's, D-162's, D-165's, D-167's, D-170's or D-172's call id or claim identity, and no other call in the R3 plan.",
  "promptStatus":"DRAFT — tracked and pinned, not a request. A later call decision freezes it unchanged or pins a new version."
});

export const D176_DECISION = "D-176";
/** origin/main when D-176 recorded the outcome (the D-175 merge the one D-175 send ran from). */
export const PRE_D176_COMMIT = "ce548845d2b22f191ce7af30a153ee1acf4ddce4";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D176_COMMIT. */
export const PRE_D176_CONTRACT_CANONICAL_SHA256 = "29f2a3d0c457881af0bc57ffc2712b38ef13bb97e0f167d9f597c1ab7468f4b8";
/** The keys D-176 added to D-175's entry and to its implementation entry. */
export const D176_ADDED_D175_KEYS = Object.freeze(["neverReuse", "notAnActivePermission", "closure", "execution", "technicalObservations", "visualReview"]);
export const D176_ADDED_D175_IMPL_KEYS = Object.freeze(["neverReuse", "closedBy"]);
/** The values D-176 replaced, as they stood at PRE_D176_COMMIT. */
export const PRE_D176 = Object.freeze({
  "d175": {"status":"AUTHORISED — ONE CALL — NOT YET ATTEMPTED","mandateState":"UNSPENT","outcome":"NOT YET ATTEMPTED"},
  "d175impl": {"adapterStatus":"IMPLEMENTED — NOT EXECUTED","mandateState":"UNSPENT","outcome":"NOT YET ATTEMPTED"},
  "callsActuallySentSoFar": {"underlay":5,"which":["D-139 — sent, output rejected","D-142 — sent during the incident, outcome UNKNOWN","D-143 — sent once, HTTP 200, raw received, candidate rejected by pre.transition-silhouette, nothing promoted (recorded by D-147)","D-151 — sent once, HTTP 400 (background transparent not supported for this model), no image, nothing promoted (recorded by D-152)","D-153 — sent once, HTTP 200, raw received, candidate rejected by background-leak, nothing promoted (recorded by D-154)"],"note":"An OBSERVATION of what has left this machine. D-143's single send is counted here since D-147, D-151's since D-152 and D-153's since D-154.","faceNeutral":4,"faceNeutralRecord":{"counts":"Face-neutral attempts whose dispatch START is documented (D-159 laterAttemptRules.callCounting.counterMeaning). It measures documented local dispatch, not confirmed server receipt; server answers are counted separately below. It is never part of the underlay figure, which stays 5.","attempts":["D-160-r3-face-neutral-v1 — claim consumed, dispatch started, HTTP 200 received, one image, TECHNICAL_REJECT at AUTO-5, geometry rejected by the owner, nothing promoted (recorded by D-161)","D-162-r3-face-neutral-guide-b-v1 — claim consumed, dispatch started, HTTP 200 received, one image, TECHNICAL_REJECT at AUTO-5, nothing promoted (recorded by D-163)","D-165-r3-face-parts-sheet-v1 — claim consumed, dispatch started, HTTP 200 received, one 1024x1024 sheet, RAW-1..5 passed, nose rejected by the owner, brows and mouth kept for further review, nothing promoted (recorded by D-166)","D-167-r3-face-parts-nose-v1 — claim consumed, dispatch started, HTTP 200 received, one 1024x1024 partial sheet, TECHNICAL_REJECT at RAW-4′ (5 px at alpha 1 outside the nose cell), no nose approved, nothing promoted (recorded by D-168)"],"dispatchUndetermined":0,"serverAnswered":4},"eyesFixed":2,"eyesFixedRecord":{"counts":"Eyes-fixed attempts (assets[5]) whose dispatch START is documented, on D-159's claim / dispatch / result axes. It is never part of the underlay or face-neutral figures, which stay 5 and 4.","attempts":["D-170-r3-eyes-fixed-v1 — claim consumed, dispatch started, HTTP 200 received, one 1536x1024 sheet, E1..E5 passed, visual review pending, nothing promoted (recorded by D-171)","D-172-r3-eyes-fixed-v2 — claim consumed, dispatch started, HTTP 200 received, one 1536x1024 sheet, E1..E5 and F1..F2 passed, review placement fails P5, opaque brown iris area in the fixed layer, nothing promoted (recorded by D-173)"],"dispatchUndetermined":0,"serverAnswered":2}},
  "budgetAccounting": "assets[0] carries 5 PLANNED calls after D-153: D-139, sent with its output rejected; the D-142 attempt, sent during an incident with an unknown outcome; D-143's one call, sent once with its candidate rejected (recorded by D-147); D-151's one call, sent once and refused with HTTP 400, no image (recorded by D-152); and D-153's one call, sent once, raw received, candidate rejected by background-leak (recorded by D-154). assets[4] (r3-face-neutral) carries 4 PLANNED calls after D-167: D-160's, D-162's, D-165's and D-167's single attempts, each sent once (recorded by D-161, D-163, D-166 and D-168), so actually sent is underlay 5 and faceNeutral 4 and the planned face capacity is used up. assets[5] (r3-eyes-neutral-fixed) carries its 1 PLANNED call: D-170's one eyes-fixed sheet, sent once (recorded by D-171), D-172 added ONE further planned eyes-fixed call (assets[5] 1 -> 2) for call A2, sent once (recorded by D-173), so actually sent is eyesFixed 2 and the planned eyes-fixed capacity (2) is used up; assets[6] (iris) keeps 1 PLANNED call with no authorisation. assets[8] (r3-hair-northstar) carries its 1 PLANNED call (D-174): D-175 authorises exactly that one hair sheet, not yet sent, with no reserve. The derived budget is 23-24. Budget numbers remain planning, never consent.",
  "noImageRequestAuthorised": "D-132 and this contract authorise no image request in general, and that general rule is unchanged. authorisedCalls.calls holds TWELVE entries. Read them by callId and by their own fields, never by the length of the list. (1) D-139-r3-underlay-head-only-v1 — D-139 superseded the general rule NARROWLY for exactly that one named call. That call was made. Its claim is spent on any outcome, prohibitions.noRetry forbids a repeat, and claim.furtherAttempt requires a NEW owner decision and a NEW claim identity. (2) D-142-r3-underlay-core-v1 — NEVER a permission. An incident RECORD with mandateState SPENT, outcome UNKNOWN and neverReuse true. A SPENT entry with neverReuse never counts as an active send permission, and no adapter may read it, or its presence in this list, as authorisation to send. (3) D-143-r3-underlay-core-v2 — NO LONGER a permission. D-143 superseded the general rule NARROWLY for exactly one further CORE-only underlay call. That call was sent once through the D-145 adapter, and D-147 records its outcome: HTTP 200, raw received, candidate rejected, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (4) D-151-r3-head-colour-u1-v1 — NO LONGER a permission. D-151 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay. That call was sent once and D-152 records its outcome: HTTP 400 (background transparent not supported for this model), no image, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-152 is preparation only and adds no entry. (5) D-153-r3-head-colour-u1-opaque-v1 — NO LONGER a permission. D-153 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay with background opaque. That call was sent once and D-154 records its outcome: HTTP 200, raw received, candidate rejected by background-leak, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-154 is feasibility analysis only and adds no entry. (6) D-160-r3-face-neutral-v1 — NO LONGER a permission. D-160 superseded the general rule NARROWLY for exactly one face-neutral attempt. That attempt was sent once and D-161 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, the geometry rejected by the owner, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (7) D-162-r3-face-neutral-guide-b-v1 — NO LONGER a permission. D-162 superseded the general rule NARROWLY for exactly one further face-neutral attempt (guide B and its prompt). That attempt was sent once and D-163 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (8) D-165-r3-face-parts-sheet-v1 — NO LONGER a permission. D-165 superseded the general rule NARROWLY for exactly one face-neutral parts-sheet attempt. That attempt was sent once and D-166 records its outcome: HTTP 200, one sheet, RAW-1..5 passed, the nose rejected by the owner, the brows and mouth kept for further review, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (9) D-167-r3-face-parts-nose-v1 — NO LONGER a permission. D-167 superseded the general rule NARROWLY for exactly one face-neutral partial nose sheet. That attempt was sent once and D-168 records its outcome: HTTP 200, one partial sheet, rejected by the binding RAW-4′ check, no nose approved, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (10) D-170-r3-eyes-fixed-v1 — NO LONGER a permission. D-170 superseded the general rule NARROWLY for exactly one eyes-fixed sheet (call A). That attempt was sent once and D-171 records its outcome: HTTP 200, one sheet, E1..E5 passed, the owner's visual review pending, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. The iris call B is not authorised. (11) D-172-r3-eyes-fixed-v2 — NO LONGER a permission. D-172 superseded the general rule NARROWLY for exactly one further eyes-fixed sheet (call A2). That attempt was sent once and D-173 records its outcome: HTTP 200, one sheet, E1..E5 and F1..F2 passed, an opaque brown iris area in the fixed layer, no candidate, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. The iris call B is not authorised. (12) D-175-r3-hair-northstar-v1 — THE ONLY active send permission. D-175 supersedes the general rule NARROWLY for exactly one hair sheet (assets[8] r3-hair-northstar), with mandateState UNSPENT and outcome NOT YET ATTEMPTED until its claim exists. Its merge is not a run instruction: the call needs a separate, explicit owner instruction after D-175 is merged. prohibitions.noRetry forbids a repeat and claimRules.furtherAttempt requires a NEW owner decision, a NEW call id, a NEW claim identity and new capacity. Afro, short and headwear are not authorised. Apart from D-175's single attempt, no entry in this list is an active send permission — no repeat of D-139's call, no reuse of D-142's, D-143's, D-151's, D-153's, D-160's, D-162's, D-165's, D-167's, D-170's or D-172's call id or claim identity, no second hair call, and no other call in the R3 plan.",
});

export const D177_DECISION = "D-177";
/** origin/main when D-177 authorised the second hair call (the D-176 merge). */
export const PRE_D177_COMMIT = "24d87767114d7a97f93da0991ac8aebc3e711ec6";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D177_COMMIT. */
export const PRE_D177_CONTRACT_CANONICAL_SHA256 = "cf2fcca6acb0debe5d7bf2445733b0227a77b72c53259a9210db6be53ca9d04d";
export const D177_CALL_ID = "D-177-r3-hair-northstar-v2";
/** The values D-177 replaced, as they stood at PRE_D177_COMMIT. */
export const PRE_D177 = Object.freeze({
  "asset8Calls": 1,
  "minimum": 23,
  "maximum": 24,
  "callsPlannedAndAuthorised": {"underlay":5,"why":"D-153 authorised exactly one further, colour-limited head underlay call with background opaque, and that call has been made (recorded by D-154). assets[0].calls is PLANNED capacity; it moved to 5 when the authorisation was committed, not when the call was made.","derivedBudget":"23-24","faceNeutral":4,"faceNeutralWhy":"D-167 authorises exactly one further face-neutral attempt — the partial nose sheet — on top of D-160's, D-162's and D-165's spent ones. assets[4].calls is PLANNED capacity; it moves 3 -> 4 when the authorisation is committed, not when the call is made.","eyesFixed":2,"eyesFixedWhy":"D-170 authorised one eyes-fixed call (call A) inside assets[5]'s one planned call; it was sent once (recorded by D-171). D-172 adds exactly ONE further planned eyes-fixed call (1 -> 2) for call A2, so the derived budget moves 22-23 -> 23-24. assets[5].calls is PLANNED capacity; it moves when the authorisation is committed, not when the call is made. The iris (assets[6]) keeps 1 planned call with no authorisation.","hair":1,"hairWhy":"D-175 authorises exactly one hair sheet (assets[8] r3-hair-northstar) inside its one planned call (D-174). No new capacity: assets[8].calls stays 1 and the derived budget stays 23-24. No reserve: a rejected sheet needs a new capacity decision."},
  "budgetAccounting": "assets[0] carries 5 PLANNED calls after D-153: D-139, sent with its output rejected; the D-142 attempt, sent during an incident with an unknown outcome; D-143's one call, sent once with its candidate rejected (recorded by D-147); D-151's one call, sent once and refused with HTTP 400, no image (recorded by D-152); and D-153's one call, sent once, raw received, candidate rejected by background-leak (recorded by D-154). assets[4] (r3-face-neutral) carries 4 PLANNED calls after D-167: D-160's, D-162's, D-165's and D-167's single attempts, each sent once (recorded by D-161, D-163, D-166 and D-168), so actually sent is underlay 5 and faceNeutral 4 and the planned face capacity is used up. assets[5] (r3-eyes-neutral-fixed) carries its 1 PLANNED call: D-170's one eyes-fixed sheet, sent once (recorded by D-171), D-172 added ONE further planned eyes-fixed call (assets[5] 1 -> 2) for call A2, sent once (recorded by D-173), so actually sent is eyesFixed 2 and the planned eyes-fixed capacity (2) is used up; assets[6] (iris) keeps 1 PLANNED call with no authorisation. assets[8] (r3-hair-northstar) carries its 1 PLANNED call (D-174): D-175's one hair sheet, sent once (recorded by D-176), so actually sent is hair 1 and the planned hair capacity (1) is used up. The derived budget is 23-24. Budget numbers remain planning, never consent.",
  "noImageRequestAuthorised": "D-132 and this contract authorise no image request in general, and that general rule is unchanged. authorisedCalls.calls holds TWELVE entries. Read them by callId and by their own fields, never by the length of the list. (1) D-139-r3-underlay-head-only-v1 — D-139 superseded the general rule NARROWLY for exactly that one named call. That call was made. Its claim is spent on any outcome, prohibitions.noRetry forbids a repeat, and claim.furtherAttempt requires a NEW owner decision and a NEW claim identity. (2) D-142-r3-underlay-core-v1 — NEVER a permission. An incident RECORD with mandateState SPENT, outcome UNKNOWN and neverReuse true. A SPENT entry with neverReuse never counts as an active send permission, and no adapter may read it, or its presence in this list, as authorisation to send. (3) D-143-r3-underlay-core-v2 — NO LONGER a permission. D-143 superseded the general rule NARROWLY for exactly one further CORE-only underlay call. That call was sent once through the D-145 adapter, and D-147 records its outcome: HTTP 200, raw received, candidate rejected, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (4) D-151-r3-head-colour-u1-v1 — NO LONGER a permission. D-151 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay. That call was sent once and D-152 records its outcome: HTTP 400 (background transparent not supported for this model), no image, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-152 is preparation only and adds no entry. (5) D-153-r3-head-colour-u1-opaque-v1 — NO LONGER a permission. D-153 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay with background opaque. That call was sent once and D-154 records its outcome: HTTP 200, raw received, candidate rejected by background-leak, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-154 is feasibility analysis only and adds no entry. (6) D-160-r3-face-neutral-v1 — NO LONGER a permission. D-160 superseded the general rule NARROWLY for exactly one face-neutral attempt. That attempt was sent once and D-161 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, the geometry rejected by the owner, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (7) D-162-r3-face-neutral-guide-b-v1 — NO LONGER a permission. D-162 superseded the general rule NARROWLY for exactly one further face-neutral attempt (guide B and its prompt). That attempt was sent once and D-163 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (8) D-165-r3-face-parts-sheet-v1 — NO LONGER a permission. D-165 superseded the general rule NARROWLY for exactly one face-neutral parts-sheet attempt. That attempt was sent once and D-166 records its outcome: HTTP 200, one sheet, RAW-1..5 passed, the nose rejected by the owner, the brows and mouth kept for further review, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (9) D-167-r3-face-parts-nose-v1 — NO LONGER a permission. D-167 superseded the general rule NARROWLY for exactly one face-neutral partial nose sheet. That attempt was sent once and D-168 records its outcome: HTTP 200, one partial sheet, rejected by the binding RAW-4′ check, no nose approved, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (10) D-170-r3-eyes-fixed-v1 — NO LONGER a permission. D-170 superseded the general rule NARROWLY for exactly one eyes-fixed sheet (call A). That attempt was sent once and D-171 records its outcome: HTTP 200, one sheet, E1..E5 passed, the owner's visual review pending, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. The iris call B is not authorised. (11) D-172-r3-eyes-fixed-v2 — NO LONGER a permission. D-172 superseded the general rule NARROWLY for exactly one further eyes-fixed sheet (call A2). That attempt was sent once and D-173 records its outcome: HTTP 200, one sheet, E1..E5 and F1..F2 passed, an opaque brown iris area in the fixed layer, no candidate, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. The iris call B is not authorised. (12) D-175-r3-hair-northstar-v1 — NO LONGER a permission. D-175 superseded the general rule NARROWLY for exactly one hair sheet (assets[8] r3-hair-northstar). That attempt was sent once and D-176 records its outcome: HTTP 200, one sheet, H1 passed, TECHNICAL_REJECT at H2, H3..H5 not evaluated, no candidate, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. Afro, short and headwear are not authorised. No entry in this list is an active send permission — no repeat of D-139's call, no reuse of D-142's, D-143's, D-151's, D-153's, D-160's, D-162's, D-165's, D-167's, D-170's, D-172's or D-175's call id or claim identity, no second hair call, and no other call in the R3 plan.",
});

export const D178_DECISION = "D-178";
/** origin/main when D-178 recorded the outcome (the D-177 merge the one D-177 send ran from). */
export const PRE_D178_COMMIT = "6972d683749a2248a7271dd2b8c60b3fe1a78f71";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D178_COMMIT. */
export const PRE_D178_CONTRACT_CANONICAL_SHA256 = "dae50a38f9a2a8ebaf9288620459826da75279397efc963e679a3f72ab77d53c";
/** The keys D-178 added to D-177's entry and to its implementation entry. */
export const D178_ADDED_D177_KEYS = Object.freeze(["neverReuse", "notAnActivePermission", "closure", "execution", "technicalObservations", "visualReview"]);
export const D178_ADDED_D177_IMPL_KEYS = Object.freeze(["neverReuse", "closedBy"]);
/** The values D-178 replaced, as they stood at PRE_D178_COMMIT. */
export const PRE_D178 = Object.freeze({
  "d177": {"status":"AUTHORISED — ONE CALL — NOT YET ATTEMPTED","mandateState":"UNSPENT","outcome":"NOT YET ATTEMPTED"},
  "d177impl": {"adapterStatus":"IMPLEMENTED — NOT EXECUTED","mandateState":"UNSPENT","outcome":"NOT YET ATTEMPTED"},
  "callsActuallySentSoFar": {"underlay":5,"which":["D-139 — sent, output rejected","D-142 — sent during the incident, outcome UNKNOWN","D-143 — sent once, HTTP 200, raw received, candidate rejected by pre.transition-silhouette, nothing promoted (recorded by D-147)","D-151 — sent once, HTTP 400 (background transparent not supported for this model), no image, nothing promoted (recorded by D-152)","D-153 — sent once, HTTP 200, raw received, candidate rejected by background-leak, nothing promoted (recorded by D-154)"],"note":"An OBSERVATION of what has left this machine. D-143's single send is counted here since D-147, D-151's since D-152 and D-153's since D-154.","faceNeutral":4,"faceNeutralRecord":{"counts":"Face-neutral attempts whose dispatch START is documented (D-159 laterAttemptRules.callCounting.counterMeaning). It measures documented local dispatch, not confirmed server receipt; server answers are counted separately below. It is never part of the underlay figure, which stays 5.","attempts":["D-160-r3-face-neutral-v1 — claim consumed, dispatch started, HTTP 200 received, one image, TECHNICAL_REJECT at AUTO-5, geometry rejected by the owner, nothing promoted (recorded by D-161)","D-162-r3-face-neutral-guide-b-v1 — claim consumed, dispatch started, HTTP 200 received, one image, TECHNICAL_REJECT at AUTO-5, nothing promoted (recorded by D-163)","D-165-r3-face-parts-sheet-v1 — claim consumed, dispatch started, HTTP 200 received, one 1024x1024 sheet, RAW-1..5 passed, nose rejected by the owner, brows and mouth kept for further review, nothing promoted (recorded by D-166)","D-167-r3-face-parts-nose-v1 — claim consumed, dispatch started, HTTP 200 received, one 1024x1024 partial sheet, TECHNICAL_REJECT at RAW-4′ (5 px at alpha 1 outside the nose cell), no nose approved, nothing promoted (recorded by D-168)"],"dispatchUndetermined":0,"serverAnswered":4},"eyesFixed":2,"eyesFixedRecord":{"counts":"Eyes-fixed attempts (assets[5]) whose dispatch START is documented, on D-159's claim / dispatch / result axes. It is never part of the underlay or face-neutral figures, which stay 5 and 4.","attempts":["D-170-r3-eyes-fixed-v1 — claim consumed, dispatch started, HTTP 200 received, one 1536x1024 sheet, E1..E5 passed, visual review pending, nothing promoted (recorded by D-171)","D-172-r3-eyes-fixed-v2 — claim consumed, dispatch started, HTTP 200 received, one 1536x1024 sheet, E1..E5 and F1..F2 passed, review placement fails P5, opaque brown iris area in the fixed layer, nothing promoted (recorded by D-173)"],"dispatchUndetermined":0,"serverAnswered":2},"hair":1,"hairRecord":{"counts":"Hair attempts (assets[8]) whose dispatch START is documented, on D-159's claim / dispatch / result axes. It is never part of the underlay, face-neutral or eyes-fixed figures, which stay 5, 4 and 2.","attempts":["D-175-r3-hair-northstar-v1 — claim consumed, dispatch started, HTTP 200 received, one 1024x1024 sheet, H1 passed, TECHNICAL_REJECT at H2 (3 px in the 16 px border), H3..H5 not evaluated, nothing promoted (recorded by D-176)"],"dispatchUndetermined":0,"serverAnswered":1}},
  "budgetAccounting": "assets[0] carries 5 PLANNED calls after D-153: D-139, sent with its output rejected; the D-142 attempt, sent during an incident with an unknown outcome; D-143's one call, sent once with its candidate rejected (recorded by D-147); D-151's one call, sent once and refused with HTTP 400, no image (recorded by D-152); and D-153's one call, sent once, raw received, candidate rejected by background-leak (recorded by D-154). assets[4] (r3-face-neutral) carries 4 PLANNED calls after D-167: D-160's, D-162's, D-165's and D-167's single attempts, each sent once (recorded by D-161, D-163, D-166 and D-168), so actually sent is underlay 5 and faceNeutral 4 and the planned face capacity is used up. assets[5] (r3-eyes-neutral-fixed) carries its 1 PLANNED call: D-170's one eyes-fixed sheet, sent once (recorded by D-171), D-172 added ONE further planned eyes-fixed call (assets[5] 1 -> 2) for call A2, sent once (recorded by D-173), so actually sent is eyesFixed 2 and the planned eyes-fixed capacity (2) is used up; assets[6] (iris) keeps 1 PLANNED call with no authorisation. assets[8] (r3-hair-northstar) carries its 1 PLANNED call (D-174): D-175's one hair sheet, sent once (recorded by D-176), so actually sent is hair 1; D-177 adds ONE further planned hair call (assets[8] 1 -> 2) for the second hair sheet, authorised and not yet sent. The derived budget is 24-25. Budget numbers remain planning, never consent.",
  "noImageRequestAuthorised": "D-132 and this contract authorise no image request in general, and that general rule is unchanged. authorisedCalls.calls holds THIRTEEN entries. Read them by callId and by their own fields, never by the length of the list. (1) D-139-r3-underlay-head-only-v1 — D-139 superseded the general rule NARROWLY for exactly that one named call. That call was made. Its claim is spent on any outcome, prohibitions.noRetry forbids a repeat, and claim.furtherAttempt requires a NEW owner decision and a NEW claim identity. (2) D-142-r3-underlay-core-v1 — NEVER a permission. An incident RECORD with mandateState SPENT, outcome UNKNOWN and neverReuse true. A SPENT entry with neverReuse never counts as an active send permission, and no adapter may read it, or its presence in this list, as authorisation to send. (3) D-143-r3-underlay-core-v2 — NO LONGER a permission. D-143 superseded the general rule NARROWLY for exactly one further CORE-only underlay call. That call was sent once through the D-145 adapter, and D-147 records its outcome: HTTP 200, raw received, candidate rejected, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (4) D-151-r3-head-colour-u1-v1 — NO LONGER a permission. D-151 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay. That call was sent once and D-152 records its outcome: HTTP 400 (background transparent not supported for this model), no image, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-152 is preparation only and adds no entry. (5) D-153-r3-head-colour-u1-opaque-v1 — NO LONGER a permission. D-153 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay with background opaque. That call was sent once and D-154 records its outcome: HTTP 200, raw received, candidate rejected by background-leak, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-154 is feasibility analysis only and adds no entry. (6) D-160-r3-face-neutral-v1 — NO LONGER a permission. D-160 superseded the general rule NARROWLY for exactly one face-neutral attempt. That attempt was sent once and D-161 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, the geometry rejected by the owner, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (7) D-162-r3-face-neutral-guide-b-v1 — NO LONGER a permission. D-162 superseded the general rule NARROWLY for exactly one further face-neutral attempt (guide B and its prompt). That attempt was sent once and D-163 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (8) D-165-r3-face-parts-sheet-v1 — NO LONGER a permission. D-165 superseded the general rule NARROWLY for exactly one face-neutral parts-sheet attempt. That attempt was sent once and D-166 records its outcome: HTTP 200, one sheet, RAW-1..5 passed, the nose rejected by the owner, the brows and mouth kept for further review, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (9) D-167-r3-face-parts-nose-v1 — NO LONGER a permission. D-167 superseded the general rule NARROWLY for exactly one face-neutral partial nose sheet. That attempt was sent once and D-168 records its outcome: HTTP 200, one partial sheet, rejected by the binding RAW-4′ check, no nose approved, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (10) D-170-r3-eyes-fixed-v1 — NO LONGER a permission. D-170 superseded the general rule NARROWLY for exactly one eyes-fixed sheet (call A). That attempt was sent once and D-171 records its outcome: HTTP 200, one sheet, E1..E5 passed, the owner's visual review pending, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. The iris call B is not authorised. (11) D-172-r3-eyes-fixed-v2 — NO LONGER a permission. D-172 superseded the general rule NARROWLY for exactly one further eyes-fixed sheet (call A2). That attempt was sent once and D-173 records its outcome: HTTP 200, one sheet, E1..E5 and F1..F2 passed, an opaque brown iris area in the fixed layer, no candidate, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. The iris call B is not authorised. (12) D-175-r3-hair-northstar-v1 — NO LONGER a permission. D-175 superseded the general rule NARROWLY for exactly one hair sheet (assets[8] r3-hair-northstar). That attempt was sent once and D-176 records its outcome: HTTP 200, one sheet, H1 passed, TECHNICAL_REJECT at H2, H3..H5 not evaluated, no candidate, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. Afro, short and headwear are not authorised. (13) D-177-r3-hair-northstar-v2 — THE ONLY active send permission. D-177 supersedes the general rule NARROWLY for exactly one further hair sheet (assets[8] r3-hair-northstar) with prompt v2, with mandateState UNSPENT and outcome NOT YET ATTEMPTED until its claim exists. Its merge is not a run instruction: the call needs a separate, explicit owner instruction after D-177 is merged. prohibitions.noRetry forbids a repeat and claimRules.furtherAttempt requires a NEW owner decision, a NEW call id, a NEW claim identity and new capacity. Afro, short and headwear are not authorised. Apart from D-177's single attempt, no entry in this list is an active send permission — no repeat of D-139's call, no reuse of D-142's, D-143's, D-151's, D-153's, D-160's, D-162's, D-165's, D-167's, D-170's, D-172's or D-175's call id or claim identity, no third hair call, and no other call in the R3 plan.",
});

export const D194_DECISION = "D-194";
/** origin/main when D-194 recorded the whole-figure review (the D-193 merge). */
export const PRE_D194_COMMIT = "21b367b2d6847dbc2a737a5e5588952e82a1e251";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D194_COMMIT. */
export const PRE_D194_CONTRACT_CANONICAL_SHA256 = "66ed6cbab258a7da58d705bbd1aa34697cf014b312fd27ad950ab75d8860f996";
export const D194_ADDED_TOP_LEVEL_KEYS = Object.freeze(["northstarFigureReview"]);

/** A deep copy of the live contract with D-194's one addition (northstarFigureReview) removed. Pure. */
export function preD194Contract(live) {
  const c = JSON.parse(JSON.stringify(live));
  for (const k of D194_ADDED_TOP_LEVEL_KEYS) delete c[k];
  return c;
}

export const D193_DECISION = "D-193";
/** origin/main when D-193 recorded the ear fix and the quiz-view review (the D-192 merge). */
export const PRE_D193_COMMIT = "6d85f26dfe4bbe654752d1abc13e832ceb9b97ca";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D193_COMMIT. */
export const PRE_D193_CONTRACT_CANONICAL_SHA256 = "a402e280c14a84bf6432c314cd7447f5c83887ac7b25ce69e714b1871c6f52b6";
export const D193_ADDED_TOP_LEVEL_KEYS = Object.freeze(["northstarEarfixQuizReview"]);

/** A deep copy of the live contract with D-193's one addition (northstarEarfixQuizReview) removed. Pure. */
export function preD193Contract(live) {
  const c = preD194Contract(live);
  for (const k of D193_ADDED_TOP_LEVEL_KEYS) delete c[k];
  return c;
}

export const D192_DECISION = "D-192";
/** origin/main when D-192 recorded the Northstar afro review derivative (the D-191 merge). */
export const PRE_D192_COMMIT = "269a01861c9ffc6ac3fed661947917b4d29f4020";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D192_COMMIT. */
export const PRE_D192_CONTRACT_CANONICAL_SHA256 = "88568b0711b328ebbb3874673cc233639da6763f206c0dace6fd7a3bc0458649";
export const D192_ADDED_TOP_LEVEL_KEYS = Object.freeze(["northstarAfroReview"]);

/** A deep copy of the live contract with D-192's one addition (northstarAfroReview) removed. Pure. */
export function preD192Contract(live) {
  const c = preD193Contract(live);
  for (const k of D192_ADDED_TOP_LEVEL_KEYS) delete c[k];
  return c;
}

export const D191_DECISION = "D-191";
/** origin/main when D-191 recorded the hairstyles review variant (the D-190 merge). */
export const PRE_D191_COMMIT = "d5dd3dc748badd3ba5148d86ecd0689599ca41b6";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D191_COMMIT. */
export const PRE_D191_CONTRACT_CANONICAL_SHA256 = "3a2bc00b7d2c781b2de3953de6a48e9e9960841454379f26fa499852a6afd675";
export const D191_ADDED_TOP_LEVEL_KEYS = Object.freeze(["northstarHairstylesReview"]);

/** A deep copy of the live contract with D-191's one addition (northstarHairstylesReview) removed. Pure. */
export function preD191Contract(live) {
  const c = preD192Contract(live);
  for (const k of D191_ADDED_TOP_LEVEL_KEYS) delete c[k];
  return c;
}

export const D190_DECISION = "D-190";
/** origin/main when D-190 recorded the completed-brow review variant (the D-189 merge). */
export const PRE_D190_COMMIT = "cb2fa202a8fdcaa26d9bd69d195a4036b5982464";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D190_COMMIT. */
export const PRE_D190_CONTRACT_CANONICAL_SHA256 = "591b736b7813775f01918be9a70d5ab24bd02c61bd14341e037c3c153b138245";
export const D190_ADDED_TOP_LEVEL_KEYS = Object.freeze(["northstarBrowReview"]);

/** A deep copy of the live contract with D-190's one addition (northstarBrowReview) removed. Pure. */
export function preD190Contract(live) {
  const c = preD191Contract(live);
  for (const k of D190_ADDED_TOP_LEVEL_KEYS) delete c[k];
  return c;
}

export const D189_DECISION = "D-189";
/** origin/main when D-189 recorded the Northstar head review variant (the D-188 merge). */
export const PRE_D189_COMMIT = "0eecda0955904e1d9152dc38b279ea386cd47ffa";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D189_COMMIT. */
export const PRE_D189_CONTRACT_CANONICAL_SHA256 = "2005b1f0c9e3b332abb81fff2c2820f61cf3609800f709466200874bbd9fde69";
export const D189_ADDED_TOP_LEVEL_KEYS = Object.freeze(["northstarHeadReview"]);

/** A deep copy of the live contract with D-189's one addition (northstarHeadReview) removed. Pure. */
export function preD189Contract(live) {
  const c = preD190Contract(live);
  for (const k of D189_ADDED_TOP_LEVEL_KEYS) delete c[k];
  return c;
}

export const D188_DECISION = "D-188";
/** origin/main when D-188 recorded the Northstar layer review variant (after the D-187 merge). */
export const PRE_D188_COMMIT = "d1d0de50a815be1c4a4ab10cba0a272964a83117";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D188_COMMIT. */
export const PRE_D188_CONTRACT_CANONICAL_SHA256 = "f60bac5126bfd86f825240c2cb5ec06b6951b3c085beb9c3700343fb6f580c4e";
export const D188_ADDED_TOP_LEVEL_KEYS = Object.freeze(["northstarLayerReview"]);

/** A deep copy of the live contract with D-188's one addition (northstarLayerReview) removed. Pure. */
export function preD188Contract(live) {
  const c = preD189Contract(live);
  for (const k of D188_ADDED_TOP_LEVEL_KEYS) delete c[k];
  return c;
}

export const D187_DECISION = "D-187";
/** origin/main when D-187 recorded the R3 head review pack (the D-186 merge). */
export const PRE_D187_COMMIT = "3aae414a8a267315c84a8b1c671c8c91d1809bc5";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D187_COMMIT. */
export const PRE_D187_CONTRACT_CANONICAL_SHA256 = "15f279fdf9f063d7c1874ffe5f99f5ad125f6bdc21c6358a04fffb285d6a61bd";
export const D187_ADDED_TOP_LEVEL_KEYS = Object.freeze(["reviewPack"]);

/** A deep copy of the live contract with D-187's one addition (reviewPack) removed. Pure. */
export function preD187Contract(live) {
  const c = preD188Contract(live);
  for (const k of D187_ADDED_TOP_LEVEL_KEYS) delete c[k];
  return c;
}

export const D186_DECISION = "D-186";
/** origin/main when D-186 recorded the head/neck underlay review candidate (the D-185 merge). */
export const PRE_D186_COMMIT = "5354da53fa65a3b4c8048c3a4dd8591e1cfd657c";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D186_COMMIT. */
export const PRE_D186_CONTRACT_CANONICAL_SHA256 = "60ccfa02b2da9d306aca3e3195418ea1bcbac477e45eb1ab3b49a445fc2ed8b0";
export const D186_ADDED_TOP_LEVEL_KEYS = Object.freeze(["underlayHeadNeck"]);

/** A deep copy of the live contract with D-186's one addition (underlayHeadNeck) removed. Pure. */
export function preD186Contract(live) {
  const c = preD187Contract(live);
  for (const k of D186_ADDED_TOP_LEVEL_KEYS) delete c[k];
  return c;
}

export const D185_DECISION = "D-185";
/** origin/main when D-185 adopted the hybrid derivation method (the D-184 merge). */
export const PRE_D185_COMMIT = "3d62b49ca6d7a135683af5d5debe4a8740d514fa";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D185_COMMIT. */
export const PRE_D185_CONTRACT_CANONICAL_SHA256 = "0ac89fa86e97504ab0ef4c986e38adfd5378bfdba407be48a0bd75691c4267b2";

/** A deep copy of the live contract with D-185's one addition (hairMethod.methodV2.hybridDerivation) removed. Pure. */
export function preD185Contract(live) {
  const c = preD186Contract(live);
  if (c.hairMethod && c.hairMethod.methodV2) delete c.hairMethod.methodV2.hybridDerivation;
  return c;
}

export const D184_DECISION = "D-184";
/** origin/main when D-184 recorded the outcome (the D-183 merge the one D-183 send ran from). */
export const PRE_D184_COMMIT = "a9cd71606b90d215275fc1de30be5200ae559a90";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D184_COMMIT. */
export const PRE_D184_CONTRACT_CANONICAL_SHA256 = "242970f44cd1499b5be2b79b75f18570db20579a1c9250ff3db275465f31248a";
/** The keys D-184 added to D-183's entry and to its implementation entry. */
export const D184_ADDED_D183_KEYS = Object.freeze(["neverReuse", "notAnActivePermission", "closure", "execution", "technicalObservations", "visualReview"]);
export const D184_ADDED_D183_IMPL_KEYS = Object.freeze(["neverReuse", "closedBy"]);
/** The values D-184 replaced, as they stood at PRE_D184_COMMIT. */
export const PRE_D184 = Object.freeze({
  "d183": {"status": "AUTHORISED — ONE CALL — NOT YET ATTEMPTED", "mandateState": "UNSPENT", "outcome": "NOT YET ATTEMPTED"},
  "d183impl": {"adapterStatus": "IMPLEMENTED — NOT EXECUTED", "mandateState": "UNSPENT", "outcome": "NOT YET ATTEMPTED"},
  "callsActuallySentSoFar": {"underlay": 5, "which": ["D-139 — sent, output rejected", "D-142 — sent during the incident, outcome UNKNOWN", "D-143 — sent once, HTTP 200, raw received, candidate rejected by pre.transition-silhouette, nothing promoted (recorded by D-147)", "D-151 — sent once, HTTP 400 (background transparent not supported for this model), no image, nothing promoted (recorded by D-152)", "D-153 — sent once, HTTP 200, raw received, candidate rejected by background-leak, nothing promoted (recorded by D-154)"], "note": "An OBSERVATION of what has left this machine. D-143's single send is counted here since D-147, D-151's since D-152 and D-153's since D-154.", "faceNeutral": 4, "faceNeutralRecord": {"counts": "Face-neutral attempts whose dispatch START is documented (D-159 laterAttemptRules.callCounting.counterMeaning). It measures documented local dispatch, not confirmed server receipt; server answers are counted separately below. It is never part of the underlay figure, which stays 5.", "attempts": ["D-160-r3-face-neutral-v1 — claim consumed, dispatch started, HTTP 200 received, one image, TECHNICAL_REJECT at AUTO-5, geometry rejected by the owner, nothing promoted (recorded by D-161)", "D-162-r3-face-neutral-guide-b-v1 — claim consumed, dispatch started, HTTP 200 received, one image, TECHNICAL_REJECT at AUTO-5, nothing promoted (recorded by D-163)", "D-165-r3-face-parts-sheet-v1 — claim consumed, dispatch started, HTTP 200 received, one 1024x1024 sheet, RAW-1..5 passed, nose rejected by the owner, brows and mouth kept for further review, nothing promoted (recorded by D-166)", "D-167-r3-face-parts-nose-v1 — claim consumed, dispatch started, HTTP 200 received, one 1024x1024 partial sheet, TECHNICAL_REJECT at RAW-4′ (5 px at alpha 1 outside the nose cell), no nose approved, nothing promoted (recorded by D-168)"], "dispatchUndetermined": 0, "serverAnswered": 4}, "eyesFixed": 2, "eyesFixedRecord": {"counts": "Eyes-fixed attempts (assets[5]) whose dispatch START is documented, on D-159's claim / dispatch / result axes. It is never part of the underlay or face-neutral figures, which stay 5 and 4.", "attempts": ["D-170-r3-eyes-fixed-v1 — claim consumed, dispatch started, HTTP 200 received, one 1536x1024 sheet, E1..E5 passed, visual review pending, nothing promoted (recorded by D-171)", "D-172-r3-eyes-fixed-v2 — claim consumed, dispatch started, HTTP 200 received, one 1536x1024 sheet, E1..E5 and F1..F2 passed, review placement fails P5, opaque brown iris area in the fixed layer, nothing promoted (recorded by D-173)"], "dispatchUndetermined": 0, "serverAnswered": 2}, "hair": 3, "hairRecord": {"counts": "Hair attempts (assets[8]) whose dispatch START is documented, on D-159's claim / dispatch / result axes. It is never part of the underlay, face-neutral or eyes-fixed figures, which stay 5, 4 and 2.", "attempts": ["D-175-r3-hair-northstar-v1 — claim consumed, dispatch started, HTTP 200 received, one 1024x1024 sheet, H1 passed, TECHNICAL_REJECT at H2 (3 px in the 16 px border), H3..H5 not evaluated, nothing promoted (recorded by D-176)", "D-177-r3-hair-northstar-v2 — claim consumed, dispatch started, HTTP 200 received, one 1024x1024 sheet, H1..H5 passed, HP1..HP8 not run, no source annotation approved, kept for review, nothing promoted (recorded by D-178)", "D-180-r3-hair-northstar-v3 — claim consumed, dispatch started, HTTP 200 received, one 1024x1024 sheet, H1..H5 passed, D-179 placement and shape checks not evaluated, fit points A4, A9 and A10 not identifiable under D-179, no source annotation, kept for review, nothing promoted (recorded by D-181)"], "dispatchUndetermined": 0, "serverAnswered": 3}},
  "budgetAccounting": "assets[0] carries 5 PLANNED calls after D-153: D-139, sent with its output rejected; the D-142 attempt, sent during an incident with an unknown outcome; D-143's one call, sent once with its candidate rejected (recorded by D-147); D-151's one call, sent once and refused with HTTP 400, no image (recorded by D-152); and D-153's one call, sent once, raw received, candidate rejected by background-leak (recorded by D-154). assets[4] (r3-face-neutral) carries 4 PLANNED calls after D-167: D-160's, D-162's, D-165's and D-167's single attempts, each sent once (recorded by D-161, D-163, D-166 and D-168), so actually sent is underlay 5 and faceNeutral 4 and the planned face capacity is used up. assets[5] (r3-eyes-neutral-fixed) carries its 1 PLANNED call: D-170's one eyes-fixed sheet, sent once (recorded by D-171), D-172 added ONE further planned eyes-fixed call (assets[5] 1 -> 2) for call A2, sent once (recorded by D-173), so actually sent is eyesFixed 2 and the planned eyes-fixed capacity (2) is used up; assets[6] (iris) keeps 1 PLANNED call with no authorisation. assets[8] (r3-hair-northstar) carries its 1 PLANNED call (D-174): D-175's one hair sheet, sent once (recorded by D-176), and D-177 added ONE further planned hair call (assets[8] 1 -> 2) for the second hair sheet, sent once (recorded by D-178), and D-180 added ONE further planned hair call (assets[8] 2 -> 3) for the third hair sheet (registration v2, prompt v3), sent once (recorded by D-181), so actually sent is hair 3; D-183 adds ONE further planned hair call (assets[8] 3 -> 4) for the fourth hair sheet (two reference images: Northstar for style, the D-183 guide for geometry; prompt v4), authorised and not yet sent. The derived budget is 26-27. Budget numbers remain planning, never consent.",
  "noImageRequestAuthorised": "D-132 and this contract authorise no image request in general, and that general rule is unchanged. authorisedCalls.calls holds FIFTEEN entries. Read them by callId and by their own fields, never by the length of the list. (1) D-139-r3-underlay-head-only-v1 — D-139 superseded the general rule NARROWLY for exactly that one named call. That call was made. Its claim is spent on any outcome, prohibitions.noRetry forbids a repeat, and claim.furtherAttempt requires a NEW owner decision and a NEW claim identity. (2) D-142-r3-underlay-core-v1 — NEVER a permission. An incident RECORD with mandateState SPENT, outcome UNKNOWN and neverReuse true. A SPENT entry with neverReuse never counts as an active send permission, and no adapter may read it, or its presence in this list, as authorisation to send. (3) D-143-r3-underlay-core-v2 — NO LONGER a permission. D-143 superseded the general rule NARROWLY for exactly one further CORE-only underlay call. That call was sent once through the D-145 adapter, and D-147 records its outcome: HTTP 200, raw received, candidate rejected, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (4) D-151-r3-head-colour-u1-v1 — NO LONGER a permission. D-151 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay. That call was sent once and D-152 records its outcome: HTTP 400 (background transparent not supported for this model), no image, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-152 is preparation only and adds no entry. (5) D-153-r3-head-colour-u1-opaque-v1 — NO LONGER a permission. D-153 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay with background opaque. That call was sent once and D-154 records its outcome: HTTP 200, raw received, candidate rejected by background-leak, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-154 is feasibility analysis only and adds no entry. (6) D-160-r3-face-neutral-v1 — NO LONGER a permission. D-160 superseded the general rule NARROWLY for exactly one face-neutral attempt. That attempt was sent once and D-161 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, the geometry rejected by the owner, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (7) D-162-r3-face-neutral-guide-b-v1 — NO LONGER a permission. D-162 superseded the general rule NARROWLY for exactly one further face-neutral attempt (guide B and its prompt). That attempt was sent once and D-163 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (8) D-165-r3-face-parts-sheet-v1 — NO LONGER a permission. D-165 superseded the general rule NARROWLY for exactly one face-neutral parts-sheet attempt. That attempt was sent once and D-166 records its outcome: HTTP 200, one sheet, RAW-1..5 passed, the nose rejected by the owner, the brows and mouth kept for further review, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (9) D-167-r3-face-parts-nose-v1 — NO LONGER a permission. D-167 superseded the general rule NARROWLY for exactly one face-neutral partial nose sheet. That attempt was sent once and D-168 records its outcome: HTTP 200, one partial sheet, rejected by the binding RAW-4′ check, no nose approved, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (10) D-170-r3-eyes-fixed-v1 — NO LONGER a permission. D-170 superseded the general rule NARROWLY for exactly one eyes-fixed sheet (call A). That attempt was sent once and D-171 records its outcome: HTTP 200, one sheet, E1..E5 passed, the owner's visual review pending, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. The iris call B is not authorised. (11) D-172-r3-eyes-fixed-v2 — NO LONGER a permission. D-172 superseded the general rule NARROWLY for exactly one further eyes-fixed sheet (call A2). That attempt was sent once and D-173 records its outcome: HTTP 200, one sheet, E1..E5 and F1..F2 passed, an opaque brown iris area in the fixed layer, no candidate, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. The iris call B is not authorised. (12) D-175-r3-hair-northstar-v1 — NO LONGER a permission. D-175 superseded the general rule NARROWLY for exactly one hair sheet (assets[8] r3-hair-northstar). That attempt was sent once and D-176 records its outcome: HTTP 200, one sheet, H1 passed, TECHNICAL_REJECT at H2, H3..H5 not evaluated, no candidate, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. Afro, short and headwear are not authorised. (13) D-177-r3-hair-northstar-v2 — NO LONGER a permission. D-177 superseded the general rule NARROWLY for exactly one further hair sheet (assets[8] r3-hair-northstar) with prompt v2. That attempt was sent once and D-178 records its outcome: HTTP 200, one sheet, H1..H5 passed, HP1..HP8 not run, no source annotation approved, kept for review, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. Afro, short and headwear are not authorised. (14) D-180-r3-hair-northstar-v3 — NO LONGER a permission. D-180 superseded the general rule NARROWLY for exactly one further hair sheet (assets[8] r3-hair-northstar), the first under registration v2, with prompt v3. That attempt was sent once and D-181 records its outcome: HTTP 200, one sheet, H1..H5 passed, D-179 placement and shape checks not evaluated, no source annotation, no candidate, nothing promoted, kept for review. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. Afro, short and headwear are not authorised. (15) D-183-r3-hair-northstar-v4 — THE ONLY active send permission. D-183 supersedes the general rule NARROWLY for exactly one further hair sheet (assets[8] r3-hair-northstar) under registration v2, with TWO reference images in a fixed order (Image 1 Northstar for style, Image 2 the D-183 geometry guide) and prompt v4, with mandateState UNSPENT and outcome NOT YET ATTEMPTED until its claim exists. Its merge is not a run instruction: the call needs a separate, explicit owner instruction after D-183 is merged. prohibitions.noRetry forbids a repeat and claimRules.furtherAttempt requires a NEW owner decision, a NEW call id, a NEW claim identity and new capacity. Afro, short and headwear are not authorised. Apart from D-183's single attempt, no entry in this list is an active send permission — no repeat of D-139's call, no reuse of D-142's, D-143's, D-151's, D-153's, D-160's, D-162's, D-165's, D-167's, D-170's, D-172's, D-175's, D-177's or D-180's call id or claim identity, no fifth hair call, and no other call in the R3 plan.",
});

/** A deep copy of the live contract with D-184's closure of D-183 reversed. Pure; never touches the input. */
export function preD184Contract(live) {
  const c = preD185Contract(live);
  const e183 = c.authorisedCalls.calls.find((x) => x.decision === "D-183");
  if (e183) {
    e183.status = PRE_D184.d183.status;
    e183.mandateState = PRE_D184.d183.mandateState;
    e183.outcome = PRE_D184.d183.outcome;
    for (const k of D184_ADDED_D183_KEYS) delete e183[k];
  }
  const i183 = c.adapterImplementations.entries.find((x) => x.decision === "D-183");
  if (i183) {
    i183.adapter.status = PRE_D184.d183impl.adapterStatus;
    i183.mandateState = PRE_D184.d183impl.mandateState;
    i183.outcome = PRE_D184.d183impl.outcome;
    for (const k of D184_ADDED_D183_IMPL_KEYS) delete i183[k];
  }
  c.imageCallBudget.callsActuallySentSoFar = JSON.parse(JSON.stringify(PRE_D184.callsActuallySentSoFar));
  c.authorisedCalls.budgetAccounting = PRE_D184.budgetAccounting;
  c.prohibitions.noImageRequestAuthorised = PRE_D184.noImageRequestAuthorised;
  return c;
}

export const D183_DECISION = "D-183";
/** origin/main when D-183 authorised the fourth hair call (after the D-181 merge; #374 and #376 did not touch the contract). */
export const PRE_D183_COMMIT = "7e0e8633fc8b5e3dee8fa7bcb0e00fb29c9dcbad";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D183_COMMIT. */
export const PRE_D183_CONTRACT_CANONICAL_SHA256 = "62d349407890d88e3b33d9d964c3c5edab0674e89b8b4c5e97f66458d1d75061";
export const D183_CALL_ID = "D-183-r3-hair-northstar-v4";
/** The keys D-183 appended to hairMethod.methodV2. */
export const D183_ADDED_METHOD_V2_KEYS = Object.freeze(["earTransitionDesign", "referencePack"]);
/** The values D-183 replaced, as they stood at PRE_D183_COMMIT. */
export const PRE_D183 = Object.freeze({
  "asset8Calls": 3,
  "minimum": 25,
  "maximum": 26,
  "callsPlannedAndAuthorised": {"underlay": 5, "why": "D-153 authorised exactly one further, colour-limited head underlay call with background opaque, and that call has been made (recorded by D-154). assets[0].calls is PLANNED capacity; it moved to 5 when the authorisation was committed, not when the call was made.", "derivedBudget": "25-26", "faceNeutral": 4, "faceNeutralWhy": "D-167 authorises exactly one further face-neutral attempt — the partial nose sheet — on top of D-160's, D-162's and D-165's spent ones. assets[4].calls is PLANNED capacity; it moves 3 -> 4 when the authorisation is committed, not when the call is made.", "eyesFixed": 2, "eyesFixedWhy": "D-170 authorised one eyes-fixed call (call A) inside assets[5]'s one planned call; it was sent once (recorded by D-171). D-172 adds exactly ONE further planned eyes-fixed call (1 -> 2) for call A2, so the derived budget moves 22-23 -> 23-24. assets[5].calls is PLANNED capacity; it moves when the authorisation is committed, not when the call is made. The iris (assets[6]) keeps 1 planned call with no authorisation.", "hair": 3, "hairWhy": "D-175 authorised one hair sheet inside assets[8]'s one planned call (D-174); it was sent once (recorded by D-176). D-177 added exactly ONE further planned hair call (1 -> 2) for the second hair sheet; it was sent once (recorded by D-178) and moved the derived budget 23-24 -> 24-25. D-180 adds exactly ONE further planned hair call (2 -> 3) for the third hair sheet, the first under registration v2 (hairMethod.methodV2, D-179) with prompt v3, so the derived budget moves 24-25 -> 25-26. assets[8].calls is PLANNED capacity; it moves when the authorisation is committed, not when the call is made. No reserve: a rejected sheet needs a new capacity decision."},
  "budgetAccounting": "assets[0] carries 5 PLANNED calls after D-153: D-139, sent with its output rejected; the D-142 attempt, sent during an incident with an unknown outcome; D-143's one call, sent once with its candidate rejected (recorded by D-147); D-151's one call, sent once and refused with HTTP 400, no image (recorded by D-152); and D-153's one call, sent once, raw received, candidate rejected by background-leak (recorded by D-154). assets[4] (r3-face-neutral) carries 4 PLANNED calls after D-167: D-160's, D-162's, D-165's and D-167's single attempts, each sent once (recorded by D-161, D-163, D-166 and D-168), so actually sent is underlay 5 and faceNeutral 4 and the planned face capacity is used up. assets[5] (r3-eyes-neutral-fixed) carries its 1 PLANNED call: D-170's one eyes-fixed sheet, sent once (recorded by D-171), D-172 added ONE further planned eyes-fixed call (assets[5] 1 -> 2) for call A2, sent once (recorded by D-173), so actually sent is eyesFixed 2 and the planned eyes-fixed capacity (2) is used up; assets[6] (iris) keeps 1 PLANNED call with no authorisation. assets[8] (r3-hair-northstar) carries its 1 PLANNED call (D-174): D-175's one hair sheet, sent once (recorded by D-176), and D-177 added ONE further planned hair call (assets[8] 1 -> 2) for the second hair sheet, sent once (recorded by D-178), and D-180 added ONE further planned hair call (assets[8] 2 -> 3) for the third hair sheet (registration v2, prompt v3), sent once (recorded by D-181), so actually sent is hair 3 and the planned hair capacity (3) is used up. The derived budget is 25-26. Budget numbers remain planning, never consent.",
  "noImageRequestAuthorised": "D-132 and this contract authorise no image request in general, and that general rule is unchanged. authorisedCalls.calls holds FOURTEEN entries. Read them by callId and by their own fields, never by the length of the list. (1) D-139-r3-underlay-head-only-v1 — D-139 superseded the general rule NARROWLY for exactly that one named call. That call was made. Its claim is spent on any outcome, prohibitions.noRetry forbids a repeat, and claim.furtherAttempt requires a NEW owner decision and a NEW claim identity. (2) D-142-r3-underlay-core-v1 — NEVER a permission. An incident RECORD with mandateState SPENT, outcome UNKNOWN and neverReuse true. A SPENT entry with neverReuse never counts as an active send permission, and no adapter may read it, or its presence in this list, as authorisation to send. (3) D-143-r3-underlay-core-v2 — NO LONGER a permission. D-143 superseded the general rule NARROWLY for exactly one further CORE-only underlay call. That call was sent once through the D-145 adapter, and D-147 records its outcome: HTTP 200, raw received, candidate rejected, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (4) D-151-r3-head-colour-u1-v1 — NO LONGER a permission. D-151 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay. That call was sent once and D-152 records its outcome: HTTP 400 (background transparent not supported for this model), no image, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-152 is preparation only and adds no entry. (5) D-153-r3-head-colour-u1-opaque-v1 — NO LONGER a permission. D-153 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay with background opaque. That call was sent once and D-154 records its outcome: HTTP 200, raw received, candidate rejected by background-leak, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-154 is feasibility analysis only and adds no entry. (6) D-160-r3-face-neutral-v1 — NO LONGER a permission. D-160 superseded the general rule NARROWLY for exactly one face-neutral attempt. That attempt was sent once and D-161 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, the geometry rejected by the owner, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (7) D-162-r3-face-neutral-guide-b-v1 — NO LONGER a permission. D-162 superseded the general rule NARROWLY for exactly one further face-neutral attempt (guide B and its prompt). That attempt was sent once and D-163 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (8) D-165-r3-face-parts-sheet-v1 — NO LONGER a permission. D-165 superseded the general rule NARROWLY for exactly one face-neutral parts-sheet attempt. That attempt was sent once and D-166 records its outcome: HTTP 200, one sheet, RAW-1..5 passed, the nose rejected by the owner, the brows and mouth kept for further review, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (9) D-167-r3-face-parts-nose-v1 — NO LONGER a permission. D-167 superseded the general rule NARROWLY for exactly one face-neutral partial nose sheet. That attempt was sent once and D-168 records its outcome: HTTP 200, one partial sheet, rejected by the binding RAW-4′ check, no nose approved, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (10) D-170-r3-eyes-fixed-v1 — NO LONGER a permission. D-170 superseded the general rule NARROWLY for exactly one eyes-fixed sheet (call A). That attempt was sent once and D-171 records its outcome: HTTP 200, one sheet, E1..E5 passed, the owner's visual review pending, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. The iris call B is not authorised. (11) D-172-r3-eyes-fixed-v2 — NO LONGER a permission. D-172 superseded the general rule NARROWLY for exactly one further eyes-fixed sheet (call A2). That attempt was sent once and D-173 records its outcome: HTTP 200, one sheet, E1..E5 and F1..F2 passed, an opaque brown iris area in the fixed layer, no candidate, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. The iris call B is not authorised. (12) D-175-r3-hair-northstar-v1 — NO LONGER a permission. D-175 superseded the general rule NARROWLY for exactly one hair sheet (assets[8] r3-hair-northstar). That attempt was sent once and D-176 records its outcome: HTTP 200, one sheet, H1 passed, TECHNICAL_REJECT at H2, H3..H5 not evaluated, no candidate, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. Afro, short and headwear are not authorised. (13) D-177-r3-hair-northstar-v2 — NO LONGER a permission. D-177 superseded the general rule NARROWLY for exactly one further hair sheet (assets[8] r3-hair-northstar) with prompt v2. That attempt was sent once and D-178 records its outcome: HTTP 200, one sheet, H1..H5 passed, HP1..HP8 not run, no source annotation approved, kept for review, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. Afro, short and headwear are not authorised. (14) D-180-r3-hair-northstar-v3 — NO LONGER a permission. D-180 superseded the general rule NARROWLY for exactly one further hair sheet (assets[8] r3-hair-northstar), the first under registration v2, with prompt v3. That attempt was sent once and D-181 records its outcome: HTTP 200, one sheet, H1..H5 passed, D-179 placement and shape checks not evaluated, no source annotation, no candidate, nothing promoted, kept for review. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. Afro, short and headwear are not authorised. No entry in this list is an active send permission — no repeat of D-139's call, no reuse of D-142's, D-143's, D-151's, D-153's, D-160's, D-162's, D-165's, D-167's, D-170's, D-172's, D-175's, D-177's or D-180's call id or claim identity, no fourth hair call, and no other call in the R3 plan.",
});

/** A deep copy of the live contract with D-183's additions removed. Pure; never touches the input. */
export function preD183Contract(live) {
  const c = preD184Contract(live);
  c.authorisedCalls.calls = c.authorisedCalls.calls.filter((e) => e.callId !== D183_CALL_ID);
  c.authorisedCalls.count = c.authorisedCalls.calls.length;
  c.adapterImplementations.entries = c.adapterImplementations.entries.filter((e) => e.decision !== D183_DECISION);
  c.assets[8].calls = PRE_D183.asset8Calls;
  c.imageCallBudget.minimum = PRE_D183.minimum;
  c.imageCallBudget.maximum = PRE_D183.maximum;
  c.imageCallBudget.callsPlannedAndAuthorised = JSON.parse(JSON.stringify(PRE_D183.callsPlannedAndAuthorised));
  c.authorisedCalls.budgetAccounting = PRE_D183.budgetAccounting;
  c.prohibitions.noImageRequestAuthorised = PRE_D183.noImageRequestAuthorised;
  const v2 = c.hairMethod && c.hairMethod.methodV2;
  if (v2) for (const k of D183_ADDED_METHOD_V2_KEYS) delete v2[k];
  return c;
}

export const D181_DECISION = "D-181";
/** origin/main when D-181 recorded the outcome (the D-180 merge the one D-180 send ran from). */
export const PRE_D181_COMMIT = "1440ddbf7f92ec4348004d274b3d3af9c612ba29";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D181_COMMIT. */
export const PRE_D181_CONTRACT_CANONICAL_SHA256 = "b905c0059f8eda476b35b84d08a995303d021d4728138e94a70dd7d35fbef595";
/** The keys D-181 added to D-180's entry and to its implementation entry. */
export const D181_ADDED_D180_KEYS = Object.freeze(["neverReuse", "notAnActivePermission", "closure", "execution", "technicalObservations", "visualReview"]);
export const D181_ADDED_D180_IMPL_KEYS = Object.freeze(["neverReuse", "closedBy"]);
/** The values D-181 replaced, as they stood at PRE_D181_COMMIT. */
export const PRE_D181 = Object.freeze({
  "d180": {"status": "AUTHORISED — ONE CALL — NOT YET ATTEMPTED", "mandateState": "UNSPENT", "outcome": "NOT YET ATTEMPTED"},
  "d180impl": {"adapterStatus": "IMPLEMENTED — NOT EXECUTED", "mandateState": "UNSPENT", "outcome": "NOT YET ATTEMPTED"},
  "callsActuallySentSoFar": {"underlay": 5, "which": ["D-139 — sent, output rejected", "D-142 — sent during the incident, outcome UNKNOWN", "D-143 — sent once, HTTP 200, raw received, candidate rejected by pre.transition-silhouette, nothing promoted (recorded by D-147)", "D-151 — sent once, HTTP 400 (background transparent not supported for this model), no image, nothing promoted (recorded by D-152)", "D-153 — sent once, HTTP 200, raw received, candidate rejected by background-leak, nothing promoted (recorded by D-154)"], "note": "An OBSERVATION of what has left this machine. D-143's single send is counted here since D-147, D-151's since D-152 and D-153's since D-154.", "faceNeutral": 4, "faceNeutralRecord": {"counts": "Face-neutral attempts whose dispatch START is documented (D-159 laterAttemptRules.callCounting.counterMeaning). It measures documented local dispatch, not confirmed server receipt; server answers are counted separately below. It is never part of the underlay figure, which stays 5.", "attempts": ["D-160-r3-face-neutral-v1 — claim consumed, dispatch started, HTTP 200 received, one image, TECHNICAL_REJECT at AUTO-5, geometry rejected by the owner, nothing promoted (recorded by D-161)", "D-162-r3-face-neutral-guide-b-v1 — claim consumed, dispatch started, HTTP 200 received, one image, TECHNICAL_REJECT at AUTO-5, nothing promoted (recorded by D-163)", "D-165-r3-face-parts-sheet-v1 — claim consumed, dispatch started, HTTP 200 received, one 1024x1024 sheet, RAW-1..5 passed, nose rejected by the owner, brows and mouth kept for further review, nothing promoted (recorded by D-166)", "D-167-r3-face-parts-nose-v1 — claim consumed, dispatch started, HTTP 200 received, one 1024x1024 partial sheet, TECHNICAL_REJECT at RAW-4′ (5 px at alpha 1 outside the nose cell), no nose approved, nothing promoted (recorded by D-168)"], "dispatchUndetermined": 0, "serverAnswered": 4}, "eyesFixed": 2, "eyesFixedRecord": {"counts": "Eyes-fixed attempts (assets[5]) whose dispatch START is documented, on D-159's claim / dispatch / result axes. It is never part of the underlay or face-neutral figures, which stay 5 and 4.", "attempts": ["D-170-r3-eyes-fixed-v1 — claim consumed, dispatch started, HTTP 200 received, one 1536x1024 sheet, E1..E5 passed, visual review pending, nothing promoted (recorded by D-171)", "D-172-r3-eyes-fixed-v2 — claim consumed, dispatch started, HTTP 200 received, one 1536x1024 sheet, E1..E5 and F1..F2 passed, review placement fails P5, opaque brown iris area in the fixed layer, nothing promoted (recorded by D-173)"], "dispatchUndetermined": 0, "serverAnswered": 2}, "hair": 2, "hairRecord": {"counts": "Hair attempts (assets[8]) whose dispatch START is documented, on D-159's claim / dispatch / result axes. It is never part of the underlay, face-neutral or eyes-fixed figures, which stay 5, 4 and 2.", "attempts": ["D-175-r3-hair-northstar-v1 — claim consumed, dispatch started, HTTP 200 received, one 1024x1024 sheet, H1 passed, TECHNICAL_REJECT at H2 (3 px in the 16 px border), H3..H5 not evaluated, nothing promoted (recorded by D-176)", "D-177-r3-hair-northstar-v2 — claim consumed, dispatch started, HTTP 200 received, one 1024x1024 sheet, H1..H5 passed, HP1..HP8 not run, no source annotation approved, kept for review, nothing promoted (recorded by D-178)"], "dispatchUndetermined": 0, "serverAnswered": 2}},
  "budgetAccounting": "assets[0] carries 5 PLANNED calls after D-153: D-139, sent with its output rejected; the D-142 attempt, sent during an incident with an unknown outcome; D-143's one call, sent once with its candidate rejected (recorded by D-147); D-151's one call, sent once and refused with HTTP 400, no image (recorded by D-152); and D-153's one call, sent once, raw received, candidate rejected by background-leak (recorded by D-154). assets[4] (r3-face-neutral) carries 4 PLANNED calls after D-167: D-160's, D-162's, D-165's and D-167's single attempts, each sent once (recorded by D-161, D-163, D-166 and D-168), so actually sent is underlay 5 and faceNeutral 4 and the planned face capacity is used up. assets[5] (r3-eyes-neutral-fixed) carries its 1 PLANNED call: D-170's one eyes-fixed sheet, sent once (recorded by D-171), D-172 added ONE further planned eyes-fixed call (assets[5] 1 -> 2) for call A2, sent once (recorded by D-173), so actually sent is eyesFixed 2 and the planned eyes-fixed capacity (2) is used up; assets[6] (iris) keeps 1 PLANNED call with no authorisation. assets[8] (r3-hair-northstar) carries its 1 PLANNED call (D-174): D-175's one hair sheet, sent once (recorded by D-176), and D-177 added ONE further planned hair call (assets[8] 1 -> 2) for the second hair sheet, sent once (recorded by D-178), so actually sent is hair 2; D-180 adds ONE further planned hair call (assets[8] 2 -> 3) for the third hair sheet (registration v2, prompt v3), authorised and not yet sent. The derived budget is 25-26. Budget numbers remain planning, never consent.",
  "noImageRequestAuthorised": "D-132 and this contract authorise no image request in general, and that general rule is unchanged. authorisedCalls.calls holds FOURTEEN entries. Read them by callId and by their own fields, never by the length of the list. (1) D-139-r3-underlay-head-only-v1 — D-139 superseded the general rule NARROWLY for exactly that one named call. That call was made. Its claim is spent on any outcome, prohibitions.noRetry forbids a repeat, and claim.furtherAttempt requires a NEW owner decision and a NEW claim identity. (2) D-142-r3-underlay-core-v1 — NEVER a permission. An incident RECORD with mandateState SPENT, outcome UNKNOWN and neverReuse true. A SPENT entry with neverReuse never counts as an active send permission, and no adapter may read it, or its presence in this list, as authorisation to send. (3) D-143-r3-underlay-core-v2 — NO LONGER a permission. D-143 superseded the general rule NARROWLY for exactly one further CORE-only underlay call. That call was sent once through the D-145 adapter, and D-147 records its outcome: HTTP 200, raw received, candidate rejected, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (4) D-151-r3-head-colour-u1-v1 — NO LONGER a permission. D-151 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay. That call was sent once and D-152 records its outcome: HTTP 400 (background transparent not supported for this model), no image, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-152 is preparation only and adds no entry. (5) D-153-r3-head-colour-u1-opaque-v1 — NO LONGER a permission. D-153 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay with background opaque. That call was sent once and D-154 records its outcome: HTTP 200, raw received, candidate rejected by background-leak, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-154 is feasibility analysis only and adds no entry. (6) D-160-r3-face-neutral-v1 — NO LONGER a permission. D-160 superseded the general rule NARROWLY for exactly one face-neutral attempt. That attempt was sent once and D-161 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, the geometry rejected by the owner, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (7) D-162-r3-face-neutral-guide-b-v1 — NO LONGER a permission. D-162 superseded the general rule NARROWLY for exactly one further face-neutral attempt (guide B and its prompt). That attempt was sent once and D-163 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (8) D-165-r3-face-parts-sheet-v1 — NO LONGER a permission. D-165 superseded the general rule NARROWLY for exactly one face-neutral parts-sheet attempt. That attempt was sent once and D-166 records its outcome: HTTP 200, one sheet, RAW-1..5 passed, the nose rejected by the owner, the brows and mouth kept for further review, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (9) D-167-r3-face-parts-nose-v1 — NO LONGER a permission. D-167 superseded the general rule NARROWLY for exactly one face-neutral partial nose sheet. That attempt was sent once and D-168 records its outcome: HTTP 200, one partial sheet, rejected by the binding RAW-4′ check, no nose approved, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (10) D-170-r3-eyes-fixed-v1 — NO LONGER a permission. D-170 superseded the general rule NARROWLY for exactly one eyes-fixed sheet (call A). That attempt was sent once and D-171 records its outcome: HTTP 200, one sheet, E1..E5 passed, the owner's visual review pending, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. The iris call B is not authorised. (11) D-172-r3-eyes-fixed-v2 — NO LONGER a permission. D-172 superseded the general rule NARROWLY for exactly one further eyes-fixed sheet (call A2). That attempt was sent once and D-173 records its outcome: HTTP 200, one sheet, E1..E5 and F1..F2 passed, an opaque brown iris area in the fixed layer, no candidate, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. The iris call B is not authorised. (12) D-175-r3-hair-northstar-v1 — NO LONGER a permission. D-175 superseded the general rule NARROWLY for exactly one hair sheet (assets[8] r3-hair-northstar). That attempt was sent once and D-176 records its outcome: HTTP 200, one sheet, H1 passed, TECHNICAL_REJECT at H2, H3..H5 not evaluated, no candidate, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. Afro, short and headwear are not authorised. (13) D-177-r3-hair-northstar-v2 — NO LONGER a permission. D-177 superseded the general rule NARROWLY for exactly one further hair sheet (assets[8] r3-hair-northstar) with prompt v2. That attempt was sent once and D-178 records its outcome: HTTP 200, one sheet, H1..H5 passed, HP1..HP8 not run, no source annotation approved, kept for review, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. Afro, short and headwear are not authorised. (14) D-180-r3-hair-northstar-v3 — THE ONLY active send permission. D-180 supersedes the general rule NARROWLY for exactly one further hair sheet (assets[8] r3-hair-northstar), the first under registration v2 (hairMethod.methodV2, D-179), with prompt v3, with mandateState UNSPENT and outcome NOT YET ATTEMPTED until its claim exists. Its merge is not a run instruction: the call needs a separate, explicit owner instruction after D-180 is merged. prohibitions.noRetry forbids a repeat and claimRules.furtherAttempt requires a NEW owner decision, a NEW call id, a NEW claim identity and new capacity. Afro, short and headwear are not authorised. Apart from D-180's single attempt, no entry in this list is an active send permission — no repeat of D-139's call, no reuse of D-142's, D-143's, D-151's, D-153's, D-160's, D-162's, D-165's, D-167's, D-170's, D-172's, D-175's or D-177's call id or claim identity, no fourth hair call, and no other call in the R3 plan.",
});

/** A deep copy of the live contract with D-181's closure of D-180 reversed. Pure; never touches the input. */
export function preD181Contract(live) {
  const c = preD183Contract(live);
  const e180 = c.authorisedCalls.calls.find((x) => x.decision === "D-180");
  if (e180) {
    e180.status = PRE_D181.d180.status;
    e180.mandateState = PRE_D181.d180.mandateState;
    e180.outcome = PRE_D181.d180.outcome;
    for (const k of D181_ADDED_D180_KEYS) delete e180[k];
  }
  const i180 = c.adapterImplementations.entries.find((x) => x.decision === "D-180");
  if (i180) {
    i180.adapter.status = PRE_D181.d180impl.adapterStatus;
    i180.mandateState = PRE_D181.d180impl.mandateState;
    i180.outcome = PRE_D181.d180impl.outcome;
    for (const k of D181_ADDED_D180_IMPL_KEYS) delete i180[k];
  }
  c.imageCallBudget.callsActuallySentSoFar = JSON.parse(JSON.stringify(PRE_D181.callsActuallySentSoFar));
  c.authorisedCalls.budgetAccounting = PRE_D181.budgetAccounting;
  c.prohibitions.noImageRequestAuthorised = PRE_D181.noImageRequestAuthorised;
  return c;
}

export const D180_DECISION = "D-180";
/** origin/main when D-180 authorised the third hair call (the D-179 merge, then the docs-only #353 merge). */
export const PRE_D180_COMMIT = "b89828357faadf85f64bb16edc31e573bed26c1d";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D180_COMMIT. */
export const PRE_D180_CONTRACT_CANONICAL_SHA256 = "7850cfefa612cc14fcca8350655aac0510c4e31abc54f37c366ba1d39477f2fb";
export const D180_CALL_ID = "D-180-r3-hair-northstar-v3";
/** The values D-180 replaced, as they stood at PRE_D180_COMMIT. */
export const PRE_D180 = Object.freeze({
  "asset8Calls": 2,
  "minimum": 24,
  "maximum": 25,
  "callsPlannedAndAuthorised": {"underlay": 5, "why": "D-153 authorised exactly one further, colour-limited head underlay call with background opaque, and that call has been made (recorded by D-154). assets[0].calls is PLANNED capacity; it moved to 5 when the authorisation was committed, not when the call was made.", "derivedBudget": "24-25", "faceNeutral": 4, "faceNeutralWhy": "D-167 authorises exactly one further face-neutral attempt — the partial nose sheet — on top of D-160's, D-162's and D-165's spent ones. assets[4].calls is PLANNED capacity; it moves 3 -> 4 when the authorisation is committed, not when the call is made.", "eyesFixed": 2, "eyesFixedWhy": "D-170 authorised one eyes-fixed call (call A) inside assets[5]'s one planned call; it was sent once (recorded by D-171). D-172 adds exactly ONE further planned eyes-fixed call (1 -> 2) for call A2, so the derived budget moves 22-23 -> 23-24. assets[5].calls is PLANNED capacity; it moves when the authorisation is committed, not when the call is made. The iris (assets[6]) keeps 1 planned call with no authorisation.", "hair": 2, "hairWhy": "D-175 authorised one hair sheet inside assets[8]'s one planned call (D-174); it was sent once (recorded by D-176). D-177 adds exactly ONE further planned hair call (1 -> 2) for the second hair sheet, so the derived budget moves 23-24 -> 24-25. assets[8].calls is PLANNED capacity; it moves when the authorisation is committed, not when the call is made. No reserve: a rejected sheet needs a new capacity decision."},
  "budgetAccounting": "assets[0] carries 5 PLANNED calls after D-153: D-139, sent with its output rejected; the D-142 attempt, sent during an incident with an unknown outcome; D-143's one call, sent once with its candidate rejected (recorded by D-147); D-151's one call, sent once and refused with HTTP 400, no image (recorded by D-152); and D-153's one call, sent once, raw received, candidate rejected by background-leak (recorded by D-154). assets[4] (r3-face-neutral) carries 4 PLANNED calls after D-167: D-160's, D-162's, D-165's and D-167's single attempts, each sent once (recorded by D-161, D-163, D-166 and D-168), so actually sent is underlay 5 and faceNeutral 4 and the planned face capacity is used up. assets[5] (r3-eyes-neutral-fixed) carries its 1 PLANNED call: D-170's one eyes-fixed sheet, sent once (recorded by D-171), D-172 added ONE further planned eyes-fixed call (assets[5] 1 -> 2) for call A2, sent once (recorded by D-173), so actually sent is eyesFixed 2 and the planned eyes-fixed capacity (2) is used up; assets[6] (iris) keeps 1 PLANNED call with no authorisation. assets[8] (r3-hair-northstar) carries its 1 PLANNED call (D-174): D-175's one hair sheet, sent once (recorded by D-176), and D-177 added ONE further planned hair call (assets[8] 1 -> 2) for the second hair sheet, sent once (recorded by D-178), so actually sent is hair 2 and the planned hair capacity (2) is used up. The derived budget is 24-25. Budget numbers remain planning, never consent.",
  "noImageRequestAuthorised": "D-132 and this contract authorise no image request in general, and that general rule is unchanged. authorisedCalls.calls holds THIRTEEN entries. Read them by callId and by their own fields, never by the length of the list. (1) D-139-r3-underlay-head-only-v1 — D-139 superseded the general rule NARROWLY for exactly that one named call. That call was made. Its claim is spent on any outcome, prohibitions.noRetry forbids a repeat, and claim.furtherAttempt requires a NEW owner decision and a NEW claim identity. (2) D-142-r3-underlay-core-v1 — NEVER a permission. An incident RECORD with mandateState SPENT, outcome UNKNOWN and neverReuse true. A SPENT entry with neverReuse never counts as an active send permission, and no adapter may read it, or its presence in this list, as authorisation to send. (3) D-143-r3-underlay-core-v2 — NO LONGER a permission. D-143 superseded the general rule NARROWLY for exactly one further CORE-only underlay call. That call was sent once through the D-145 adapter, and D-147 records its outcome: HTTP 200, raw received, candidate rejected, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (4) D-151-r3-head-colour-u1-v1 — NO LONGER a permission. D-151 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay. That call was sent once and D-152 records its outcome: HTTP 400 (background transparent not supported for this model), no image, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-152 is preparation only and adds no entry. (5) D-153-r3-head-colour-u1-opaque-v1 — NO LONGER a permission. D-153 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay with background opaque. That call was sent once and D-154 records its outcome: HTTP 200, raw received, candidate rejected by background-leak, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-154 is feasibility analysis only and adds no entry. (6) D-160-r3-face-neutral-v1 — NO LONGER a permission. D-160 superseded the general rule NARROWLY for exactly one face-neutral attempt. That attempt was sent once and D-161 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, the geometry rejected by the owner, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (7) D-162-r3-face-neutral-guide-b-v1 — NO LONGER a permission. D-162 superseded the general rule NARROWLY for exactly one further face-neutral attempt (guide B and its prompt). That attempt was sent once and D-163 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (8) D-165-r3-face-parts-sheet-v1 — NO LONGER a permission. D-165 superseded the general rule NARROWLY for exactly one face-neutral parts-sheet attempt. That attempt was sent once and D-166 records its outcome: HTTP 200, one sheet, RAW-1..5 passed, the nose rejected by the owner, the brows and mouth kept for further review, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (9) D-167-r3-face-parts-nose-v1 — NO LONGER a permission. D-167 superseded the general rule NARROWLY for exactly one face-neutral partial nose sheet. That attempt was sent once and D-168 records its outcome: HTTP 200, one partial sheet, rejected by the binding RAW-4′ check, no nose approved, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (10) D-170-r3-eyes-fixed-v1 — NO LONGER a permission. D-170 superseded the general rule NARROWLY for exactly one eyes-fixed sheet (call A). That attempt was sent once and D-171 records its outcome: HTTP 200, one sheet, E1..E5 passed, the owner's visual review pending, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. The iris call B is not authorised. (11) D-172-r3-eyes-fixed-v2 — NO LONGER a permission. D-172 superseded the general rule NARROWLY for exactly one further eyes-fixed sheet (call A2). That attempt was sent once and D-173 records its outcome: HTTP 200, one sheet, E1..E5 and F1..F2 passed, an opaque brown iris area in the fixed layer, no candidate, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. The iris call B is not authorised. (12) D-175-r3-hair-northstar-v1 — NO LONGER a permission. D-175 superseded the general rule NARROWLY for exactly one hair sheet (assets[8] r3-hair-northstar). That attempt was sent once and D-176 records its outcome: HTTP 200, one sheet, H1 passed, TECHNICAL_REJECT at H2, H3..H5 not evaluated, no candidate, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. Afro, short and headwear are not authorised. (13) D-177-r3-hair-northstar-v2 — NO LONGER a permission. D-177 superseded the general rule NARROWLY for exactly one further hair sheet (assets[8] r3-hair-northstar) with prompt v2. That attempt was sent once and D-178 records its outcome: HTTP 200, one sheet, H1..H5 passed, HP1..HP8 not run, no source annotation approved, kept for review, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. Afro, short and headwear are not authorised. No entry in this list is an active send permission — no repeat of D-139's call, no reuse of D-142's, D-143's, D-151's, D-153's, D-160's, D-162's, D-165's, D-167's, D-170's, D-172's, D-175's or D-177's call id or claim identity, no third hair call, and no other call in the R3 plan.",
  "methodV2Status": "ADOPTED — REGISTRATION V2 FOR FUTURE HAIR SHEETS OF assets[8] — TARGETS V2 APPROVED (D-174 COORDINATES, NEW ROLES) — THRESHOLDS APPROVED BY THE OWNER — PROMPT V3 A DRAFT — NO IMAGE REQUEST AUTHORISED",
  "promptV3Status": "DRAFT — NOT FROZEN. It authorises no call; a future call decision freezes exactly its bytes or replaces it.",
});

/** A deep copy of the live contract with D-181's closure reversed, D-180's additions removed and prompt v3 back to D-179's DRAFT. Pure. */
export function preD180Contract(live) {
  const c = preD181Contract(live);
  c.authorisedCalls.calls = c.authorisedCalls.calls.filter((e) => e.callId !== D180_CALL_ID);
  c.authorisedCalls.count = c.authorisedCalls.calls.length;
  c.adapterImplementations.entries = c.adapterImplementations.entries.filter((e) => e.decision !== D180_DECISION);
  c.assets[8].calls = PRE_D180.asset8Calls;
  c.imageCallBudget.minimum = PRE_D180.minimum;
  c.imageCallBudget.maximum = PRE_D180.maximum;
  c.imageCallBudget.callsPlannedAndAuthorised = JSON.parse(JSON.stringify(PRE_D180.callsPlannedAndAuthorised));
  c.authorisedCalls.budgetAccounting = PRE_D180.budgetAccounting;
  c.prohibitions.noImageRequestAuthorised = PRE_D180.noImageRequestAuthorised;
  const v2 = c.hairMethod && c.hairMethod.methodV2;
  if (v2) { v2.status = PRE_D180.methodV2Status; if (v2.promptV3) v2.promptV3.status = PRE_D180.promptV3Status; }
  return c;
}

export const D179_DECISION = "D-179";
/** origin/main when D-179 adopted registration v2 (the D-178 merge). */
export const PRE_D179_COMMIT = "253c642b02b40497cc2aec5ea0e222256a608fa9";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D179_COMMIT. */
export const PRE_D179_CONTRACT_CANONICAL_SHA256 = "5edbf04addae3e503ad67a89c121b19f471f74329bbdd970f3fa44b10e81f0b9";

/** A deep copy of the live contract with D-180's additions and D-179's one addition (hairMethod.methodV2) removed. Pure. */
export function preD179Contract(live) {
  const c = preD180Contract(live);
  if (c.hairMethod) delete c.hairMethod.methodV2;
  return c;
}

/** A deep copy of the live contract with D-179's addition removed and D-178's closure of D-177 reversed. Pure. */
export function preD178Contract(live) {
  const c = preD179Contract(live);
  const e177 = c.authorisedCalls.calls.find((x) => x.decision === "D-177");
  if (e177) {
    e177.status = PRE_D178.d177.status;
    e177.mandateState = PRE_D178.d177.mandateState;
    e177.outcome = PRE_D178.d177.outcome;
    for (const k of D178_ADDED_D177_KEYS) delete e177[k];
  }
  const i177 = c.adapterImplementations.entries.find((x) => x.decision === "D-177");
  if (i177) {
    i177.adapter.status = PRE_D178.d177impl.adapterStatus;
    i177.mandateState = PRE_D178.d177impl.mandateState;
    i177.outcome = PRE_D178.d177impl.outcome;
    for (const k of D178_ADDED_D177_IMPL_KEYS) delete i177[k];
  }
  c.imageCallBudget.callsActuallySentSoFar = JSON.parse(JSON.stringify(PRE_D178.callsActuallySentSoFar));
  c.authorisedCalls.budgetAccounting = PRE_D178.budgetAccounting;
  c.prohibitions.noImageRequestAuthorised = PRE_D178.noImageRequestAuthorised;
  return c;
}

/** A deep copy of the live contract with D-178's closure reversed and D-177's additions removed. Pure. */
export function preD177Contract(live) {
  const c = preD178Contract(live);
  c.authorisedCalls.calls = c.authorisedCalls.calls.filter((e) => e.callId !== D177_CALL_ID);
  c.authorisedCalls.count = c.authorisedCalls.calls.length;
  c.adapterImplementations.entries = c.adapterImplementations.entries.filter((e) => e.decision !== D177_DECISION);
  c.assets[8].calls = PRE_D177.asset8Calls;
  c.imageCallBudget.minimum = PRE_D177.minimum;
  c.imageCallBudget.maximum = PRE_D177.maximum;
  c.imageCallBudget.callsPlannedAndAuthorised = JSON.parse(JSON.stringify(PRE_D177.callsPlannedAndAuthorised));
  c.authorisedCalls.budgetAccounting = PRE_D177.budgetAccounting;
  c.prohibitions.noImageRequestAuthorised = PRE_D177.noImageRequestAuthorised;
  if (c.hairMethod) delete c.hairMethod.rawSheet.promptV2;
  return c;
}

/** A deep copy of the live contract with D-177's additions removed and D-176's closure of D-175 reversed. Pure. */
export function preD176Contract(live) {
  const c = preD177Contract(live);
  const e175 = c.authorisedCalls.calls.find((x) => x.decision === "D-175");
  if (e175) {
    e175.status = PRE_D176.d175.status;
    e175.mandateState = PRE_D176.d175.mandateState;
    e175.outcome = PRE_D176.d175.outcome;
    for (const k of D176_ADDED_D175_KEYS) delete e175[k];
  }
  const i175 = c.adapterImplementations.entries.find((x) => x.decision === "D-175");
  if (i175) {
    i175.adapter.status = PRE_D176.d175impl.adapterStatus;
    i175.mandateState = PRE_D176.d175impl.mandateState;
    i175.outcome = PRE_D176.d175impl.outcome;
    for (const k of D176_ADDED_D175_IMPL_KEYS) delete i175[k];
  }
  c.imageCallBudget.callsActuallySentSoFar = JSON.parse(JSON.stringify(PRE_D176.callsActuallySentSoFar));
  c.authorisedCalls.budgetAccounting = PRE_D176.budgetAccounting;
  c.prohibitions.noImageRequestAuthorised = PRE_D176.noImageRequestAuthorised;
  return c;
}

/** A deep copy of the live contract with D-176's closure reversed and D-175's changes removed. Pure. */
export function preD175Contract(live) {
  const c = preD176Contract(live);
  c.authorisedCalls.calls = c.authorisedCalls.calls.filter((e) => e.callId !== D175_CALL_ID);
  c.authorisedCalls.count = c.authorisedCalls.calls.length;
  c.adapterImplementations.entries = c.adapterImplementations.entries.filter((e) => e.decision !== D175_DECISION);
  for (const k of D175_ADDED_PLANNED_KEYS) delete c.imageCallBudget.callsPlannedAndAuthorised[k];
  c.authorisedCalls.budgetAccounting = PRE_D175.budgetAccounting;
  c.prohibitions.noImageRequestAuthorised = PRE_D175.noImageRequestAuthorised;
  if (c.hairMethod) c.hairMethod.rawSheet.prompt.status = PRE_D175.promptStatus;
  return c;
}

/** A deep copy of the live contract with D-175's and D-174's changes removed. Pure; never touches the input. */
export function preD174Contract(live) {
  const c = preD175Contract(live);
  for (const k of D174_ADDED_TOP_LEVEL_KEYS) delete c[k];
  c.deterministicOperations = c.deterministicOperations.filter((o) => o.op !== D174_ADDED_OPERATION);
  c.assets[8].method = PRE_D174.asset8Method;
  c.layerContract.slots.find((s) => s.slot === "hair").blend = PRE_D174.layerHairBlend;
  c.zModel.slots.find((s) => s.slot === "hair").note = PRE_D174.zModelHairNote;
  return c;
}

/** A deep copy of the live contract with D-174's changes removed and D-173's closure of D-172 reversed. Pure. */
export function preD173Contract(live) {
  const c = preD174Contract(live);
  const e172 = c.authorisedCalls.calls.find((x) => x.decision === "D-172");
  if (e172) {
    e172.status = PRE_D173.d172.status;
    e172.mandateState = PRE_D173.d172.mandateState;
    e172.outcome = PRE_D173.d172.outcome;
    for (const k of D173_ADDED_D172_KEYS) delete e172[k];
  }
  const i172 = c.adapterImplementations.entries.find((x) => x.decision === "D-172");
  if (i172) {
    i172.adapter.status = PRE_D173.d172impl.adapterStatus;
    i172.mandateState = PRE_D173.d172impl.mandateState;
    i172.outcome = PRE_D173.d172impl.outcome;
    for (const k of D173_ADDED_D172_IMPL_KEYS) delete i172[k];
  }
  c.imageCallBudget.callsActuallySentSoFar = JSON.parse(JSON.stringify(PRE_D173.callsActuallySentSoFar));
  c.authorisedCalls.budgetAccounting = PRE_D173.budgetAccounting;
  c.prohibitions.noImageRequestAuthorised = PRE_D173.noImageRequestAuthorised;
  return c;
}

export const D172_DECISION = "D-172";
/** The D-171 commit D-172 builds on (PR #354; D-172 depends on it). */
export const PRE_D172_COMMIT = "66e9272faefc279d5820826e5812b43a3b4ea7a7";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D172_COMMIT. */
export const PRE_D172_CONTRACT_CANONICAL_SHA256 = "d8915c0ca894e2112560260124aece86510dc60cf80e0dab894719237edb721f";
export const D172_ADDED_TOP_LEVEL_KEYS = Object.freeze(["eyesFixedRetakePreparation"]);
/** The values D-172 replaced, as they stood at PRE_D172_COMMIT. */
export const PRE_D172 = Object.freeze({
  "asset5Calls": 1,
  "minimum": 22,
  "maximum": 23,
  "callsPlannedAndAuthorised": {"underlay":5,"why":"D-153 authorised exactly one further, colour-limited head underlay call with background opaque, and that call has been made (recorded by D-154). assets[0].calls is PLANNED capacity; it moved to 5 when the authorisation was committed, not when the call was made.","derivedBudget":"22-23","faceNeutral":4,"faceNeutralWhy":"D-167 authorises exactly one further face-neutral attempt — the partial nose sheet — on top of D-160's, D-162's and D-165's spent ones. assets[4].calls is PLANNED capacity; it moves 3 -> 4 when the authorisation is committed, not when the call is made.","eyesFixed":1,"eyesFixedWhy":"D-170 authorises exactly one eyes-fixed call (call A) inside assets[5]'s one already planned call. No capacity is added, the derived budget stays 22-23, and there is no planned retake. The iris (assets[6]) keeps 1 planned call with no authorisation."},
  "count": 10,
  "budgetAccounting": "assets[0] carries 5 PLANNED calls after D-153: D-139, sent with its output rejected; the D-142 attempt, sent during an incident with an unknown outcome; D-143's one call, sent once with its candidate rejected (recorded by D-147); D-151's one call, sent once and refused with HTTP 400, no image (recorded by D-152); and D-153's one call, sent once, raw received, candidate rejected by background-leak (recorded by D-154). assets[4] (r3-face-neutral) carries 4 PLANNED calls after D-167: D-160's, D-162's, D-165's and D-167's single attempts, each sent once (recorded by D-161, D-163, D-166 and D-168), so actually sent is underlay 5 and faceNeutral 4 and the planned face capacity is used up. assets[5] (r3-eyes-neutral-fixed) carries its 1 PLANNED call: D-170's one eyes-fixed sheet, sent once (recorded by D-171), so actually sent is eyesFixed 1 and the planned eyes-fixed capacity is used up; assets[6] (iris) keeps 1 PLANNED call with no authorisation. The derived budget is 22-23. Budget numbers remain planning, never consent.",
  "noImageRequestAuthorised": "D-132 and this contract authorise no image request in general, and that general rule is unchanged. authorisedCalls.calls holds TEN entries. Read them by callId and by their own fields, never by the length of the list. (1) D-139-r3-underlay-head-only-v1 — D-139 superseded the general rule NARROWLY for exactly that one named call. That call was made. Its claim is spent on any outcome, prohibitions.noRetry forbids a repeat, and claim.furtherAttempt requires a NEW owner decision and a NEW claim identity. (2) D-142-r3-underlay-core-v1 — NEVER a permission. An incident RECORD with mandateState SPENT, outcome UNKNOWN and neverReuse true. A SPENT entry with neverReuse never counts as an active send permission, and no adapter may read it, or its presence in this list, as authorisation to send. (3) D-143-r3-underlay-core-v2 — NO LONGER a permission. D-143 superseded the general rule NARROWLY for exactly one further CORE-only underlay call. That call was sent once through the D-145 adapter, and D-147 records its outcome: HTTP 200, raw received, candidate rejected, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (4) D-151-r3-head-colour-u1-v1 — NO LONGER a permission. D-151 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay. That call was sent once and D-152 records its outcome: HTTP 400 (background transparent not supported for this model), no image, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-152 is preparation only and adds no entry. (5) D-153-r3-head-colour-u1-opaque-v1 — NO LONGER a permission. D-153 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay with background opaque. That call was sent once and D-154 records its outcome: HTTP 200, raw received, candidate rejected by background-leak, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-154 is feasibility analysis only and adds no entry. (6) D-160-r3-face-neutral-v1 — NO LONGER a permission. D-160 superseded the general rule NARROWLY for exactly one face-neutral attempt. That attempt was sent once and D-161 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, the geometry rejected by the owner, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (7) D-162-r3-face-neutral-guide-b-v1 — NO LONGER a permission. D-162 superseded the general rule NARROWLY for exactly one further face-neutral attempt (guide B and its prompt). That attempt was sent once and D-163 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (8) D-165-r3-face-parts-sheet-v1 — NO LONGER a permission. D-165 superseded the general rule NARROWLY for exactly one face-neutral parts-sheet attempt. That attempt was sent once and D-166 records its outcome: HTTP 200, one sheet, RAW-1..5 passed, the nose rejected by the owner, the brows and mouth kept for further review, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (9) D-167-r3-face-parts-nose-v1 — NO LONGER a permission. D-167 superseded the general rule NARROWLY for exactly one face-neutral partial nose sheet. That attempt was sent once and D-168 records its outcome: HTTP 200, one partial sheet, rejected by the binding RAW-4′ check, no nose approved, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (10) D-170-r3-eyes-fixed-v1 — NO LONGER a permission. D-170 superseded the general rule NARROWLY for exactly one eyes-fixed sheet (call A). That attempt was sent once and D-171 records its outcome: HTTP 200, one sheet, E1..E5 passed, the owner's visual review pending, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. The iris call B is not authorised. No entry in this list is an active send permission — no repeat of D-139's call, no reuse of D-142's, D-143's, D-151's, D-153's, D-160's, D-162's, D-165's, D-167's or D-170's call id or claim identity, and no other call in the R3 plan."
});

/** A deep copy of the live contract with D-172's additions removed. Pure; never touches the input. */
export function preD172Contract(live) {
  const c = preD173Contract(live);
  c.authorisedCalls.calls = c.authorisedCalls.calls.filter((e) => e.decision !== D172_DECISION);
  c.authorisedCalls.count = PRE_D172.count;
  c.adapterImplementations.entries = c.adapterImplementations.entries.filter((e) => e.decision !== D172_DECISION);
  c.assets[5].calls = PRE_D172.asset5Calls;
  c.imageCallBudget.minimum = PRE_D172.minimum;
  c.imageCallBudget.maximum = PRE_D172.maximum;
  c.imageCallBudget.callsPlannedAndAuthorised = JSON.parse(JSON.stringify(PRE_D172.callsPlannedAndAuthorised));
  c.authorisedCalls.budgetAccounting = PRE_D172.budgetAccounting;
  c.prohibitions.noImageRequestAuthorised = PRE_D172.noImageRequestAuthorised;
  for (const k of D172_ADDED_TOP_LEVEL_KEYS) delete c[k];
  return c;
}

export const D171_DECISION = "D-171";
/** origin/main when D-171 recorded the outcome (the D-170 merge the one D-170 send ran from). */
export const PRE_D171_COMMIT = "d93faff71c6f319268ebd1898f7a3a93e0a66c8e";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D171_COMMIT. */
export const PRE_D171_CONTRACT_CANONICAL_SHA256 = "8dbc1d813720e27bed68b9479e3ced7d1ffb6ffe1af9d97c77699fecfd9b9e61";
/** The keys D-171 added to D-170's entry and to its implementation entry. */
export const D171_ADDED_D170_KEYS = Object.freeze(["neverReuse", "notAnActivePermission", "closure", "execution", "technicalObservations", "visualReview"]);
export const D171_ADDED_D170_IMPL_KEYS = Object.freeze(["neverReuse", "closedBy"]);
/** The values D-171 replaced, as they stood at PRE_D171_COMMIT. */
export const PRE_D171 = Object.freeze({
  "d170": {"status":"AUTHORISED — ONE CALL — NOT YET ATTEMPTED","mandateState":"UNSPENT","outcome":"NOT YET ATTEMPTED"},
  "d170impl": {"adapterStatus":"IMPLEMENTED — NOT EXECUTED","mandateState":"UNSPENT","outcome":"NOT YET ATTEMPTED"},
  "callsActuallySentSoFar": {"underlay":5,"which":["D-139 — sent, output rejected","D-142 — sent during the incident, outcome UNKNOWN","D-143 — sent once, HTTP 200, raw received, candidate rejected by pre.transition-silhouette, nothing promoted (recorded by D-147)","D-151 — sent once, HTTP 400 (background transparent not supported for this model), no image, nothing promoted (recorded by D-152)","D-153 — sent once, HTTP 200, raw received, candidate rejected by background-leak, nothing promoted (recorded by D-154)"],"note":"An OBSERVATION of what has left this machine. D-143's single send is counted here since D-147, D-151's since D-152 and D-153's since D-154.","faceNeutral":4,"faceNeutralRecord":{"counts":"Face-neutral attempts whose dispatch START is documented (D-159 laterAttemptRules.callCounting.counterMeaning). It measures documented local dispatch, not confirmed server receipt; server answers are counted separately below. It is never part of the underlay figure, which stays 5.","attempts":["D-160-r3-face-neutral-v1 — claim consumed, dispatch started, HTTP 200 received, one image, TECHNICAL_REJECT at AUTO-5, geometry rejected by the owner, nothing promoted (recorded by D-161)","D-162-r3-face-neutral-guide-b-v1 — claim consumed, dispatch started, HTTP 200 received, one image, TECHNICAL_REJECT at AUTO-5, nothing promoted (recorded by D-163)","D-165-r3-face-parts-sheet-v1 — claim consumed, dispatch started, HTTP 200 received, one 1024x1024 sheet, RAW-1..5 passed, nose rejected by the owner, brows and mouth kept for further review, nothing promoted (recorded by D-166)","D-167-r3-face-parts-nose-v1 — claim consumed, dispatch started, HTTP 200 received, one 1024x1024 partial sheet, TECHNICAL_REJECT at RAW-4′ (5 px at alpha 1 outside the nose cell), no nose approved, nothing promoted (recorded by D-168)"],"dispatchUndetermined":0,"serverAnswered":4}},
  "budgetAccounting": "assets[0] carries 5 PLANNED calls after D-153: D-139, sent with its output rejected; the D-142 attempt, sent during an incident with an unknown outcome; D-143's one call, sent once with its candidate rejected (recorded by D-147); D-151's one call, sent once and refused with HTTP 400, no image (recorded by D-152); and D-153's one call, sent once, raw received, candidate rejected by background-leak (recorded by D-154). assets[4] (r3-face-neutral) carries 4 PLANNED calls after D-167: D-160's, D-162's, D-165's and D-167's single attempts, each sent once (recorded by D-161, D-163, D-166 and D-168), so actually sent is underlay 5 and faceNeutral 4 and the planned face capacity is used up. assets[5] (r3-eyes-neutral-fixed) carries its 1 PLANNED call, now authorised for D-170's one eyes-fixed sheet and not yet sent; assets[6] (iris) keeps 1 PLANNED call with no authorisation. No eyes call has been sent. The derived budget is 22-23. Budget numbers remain planning, never consent.",
  "noImageRequestAuthorised": "D-132 and this contract authorise no image request in general, and that general rule is unchanged. authorisedCalls.calls holds TEN entries. Read them by callId and by their own fields, never by the length of the list. (1) D-139-r3-underlay-head-only-v1 — D-139 superseded the general rule NARROWLY for exactly that one named call. That call was made. Its claim is spent on any outcome, prohibitions.noRetry forbids a repeat, and claim.furtherAttempt requires a NEW owner decision and a NEW claim identity. (2) D-142-r3-underlay-core-v1 — NEVER a permission. An incident RECORD with mandateState SPENT, outcome UNKNOWN and neverReuse true. A SPENT entry with neverReuse never counts as an active send permission, and no adapter may read it, or its presence in this list, as authorisation to send. (3) D-143-r3-underlay-core-v2 — NO LONGER a permission. D-143 superseded the general rule NARROWLY for exactly one further CORE-only underlay call. That call was sent once through the D-145 adapter, and D-147 records its outcome: HTTP 200, raw received, candidate rejected, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (4) D-151-r3-head-colour-u1-v1 — NO LONGER a permission. D-151 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay. That call was sent once and D-152 records its outcome: HTTP 400 (background transparent not supported for this model), no image, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-152 is preparation only and adds no entry. (5) D-153-r3-head-colour-u1-opaque-v1 — NO LONGER a permission. D-153 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay with background opaque. That call was sent once and D-154 records its outcome: HTTP 200, raw received, candidate rejected by background-leak, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-154 is feasibility analysis only and adds no entry. (6) D-160-r3-face-neutral-v1 — NO LONGER a permission. D-160 superseded the general rule NARROWLY for exactly one face-neutral attempt. That attempt was sent once and D-161 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, the geometry rejected by the owner, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (7) D-162-r3-face-neutral-guide-b-v1 — NO LONGER a permission. D-162 superseded the general rule NARROWLY for exactly one further face-neutral attempt (guide B and its prompt). That attempt was sent once and D-163 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (8) D-165-r3-face-parts-sheet-v1 — NO LONGER a permission. D-165 superseded the general rule NARROWLY for exactly one face-neutral parts-sheet attempt. That attempt was sent once and D-166 records its outcome: HTTP 200, one sheet, RAW-1..5 passed, the nose rejected by the owner, the brows and mouth kept for further review, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (9) D-167-r3-face-parts-nose-v1 — NO LONGER a permission. D-167 superseded the general rule NARROWLY for exactly one face-neutral partial nose sheet. That attempt was sent once and D-168 records its outcome: HTTP 200, one partial sheet, rejected by the binding RAW-4′ check, no nose approved, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (10) D-170-r3-eyes-fixed-v1 — THE ONLY active send permission. D-170 supersedes the general rule NARROWLY for exactly one eyes-fixed sheet (eyesPartsMethod sheet A, assets[5]), with mandateState UNSPENT and outcome NOT YET ATTEMPTED until its claim exists. Its merge is not a run instruction: the call needs a separate, explicit owner instruction after the merge. prohibitions.noRetry forbids a repeat and claimRules.furtherAttempt requires a NEW owner decision, a NEW call id and a NEW claim identity. The iris call B is not authorised. Apart from D-170's single attempt, no entry in this list is an active send permission — no repeat of D-139's call, no reuse of D-142's, D-143's, D-151's, D-153's, D-160's, D-162's, D-165's, D-167's or D-170's call id or claim identity, and no other call in the R3 plan."
});

/** A deep copy of the live contract with D-171's closure of D-170 reversed. Pure; never touches the input. */
export function preD171Contract(live) {
  const c = preD172Contract(live);
  const e170 = c.authorisedCalls.calls.find((x) => x.decision === "D-170");
  if (e170) {
    e170.status = PRE_D171.d170.status;
    e170.mandateState = PRE_D171.d170.mandateState;
    e170.outcome = PRE_D171.d170.outcome;
    for (const k of D171_ADDED_D170_KEYS) delete e170[k];
  }
  const i170 = c.adapterImplementations.entries.find((x) => x.decision === "D-170");
  if (i170) {
    i170.adapter.status = PRE_D171.d170impl.adapterStatus;
    i170.mandateState = PRE_D171.d170impl.mandateState;
    i170.outcome = PRE_D171.d170impl.outcome;
    for (const k of D171_ADDED_D170_IMPL_KEYS) delete i170[k];
  }
  c.imageCallBudget.callsActuallySentSoFar = JSON.parse(JSON.stringify(PRE_D171.callsActuallySentSoFar));
  c.authorisedCalls.budgetAccounting = PRE_D171.budgetAccounting;
  c.prohibitions.noImageRequestAuthorised = PRE_D171.noImageRequestAuthorised;
  return c;
}

export const D170_DECISION = "D-170";
/** origin/main when D-170 approved the eye targets and authorised call A (the D-169 merge). */
export const PRE_D170_COMMIT = "c23f0a95d4fc67579952b2644513fe43ff605306";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D170_COMMIT. */
export const PRE_D170_CONTRACT_CANONICAL_SHA256 = "f391ef81204f5ca7d236fc570299e75024d166d5253a61195ee83984dc03ce48";
export const D170_ADDED_PLANNED_KEYS = Object.freeze(["eyesFixed", "eyesFixedWhy"]);
/** The values D-170 replaced, as they stood at PRE_D170_COMMIT. */
export const PRE_D170 = Object.freeze({
  "eyesTargets": {"file":"tools/avatar/fixtures/r3-eyes/targets-eyes-v1.json","sha256":"09848f0e5ae87de1b1fbdf8a9102ec3125cf2e21a1cc6324a7ed1bcbad19a88c","version":"r3-eyes-targets-v1","status":"DRAFT","approval":"D-169 records the readings; it does not approve them. Only the owner sets APPROVED, by a separate decision, as a new pinned targets version. The CLI's production mode refuses DRAFT.","fitAnchors":["eyeLeft.ringCentre (Lc)","eyeLeft.outerCorner (Lo)","eyeRight.ringCentre (Rc)","eyeRight.outerCorner (Ro)"],"checkPoints":["eyeLeft.innerCorner (Li)","eyeRight.innerCorner (Ri)"],"points":{"eyeLeft":{"ringCentre":[448.8,321.7],"outerCorner":[402,310],"innerCorner":[477,312]},"eyeRight":{"ringCentre":[571,320.6],"outerCorner":[617,312],"innerCorner":[541,318]}},"uncertainty":"ring centres ±1.5 px (the ring top under the lash line is partly reconstructed); corners ±3 px (their y is ill-defined in this style)","noAutomaticExtraction":"The points were read visually on x6 crops; no feature was extracted automatically from Northstar."},
  "count": 9,
  "budgetAccounting": "assets[0] carries 5 PLANNED calls after D-153: D-139, sent with its output rejected; the D-142 attempt, sent during an incident with an unknown outcome; D-143's one call, sent once with its candidate rejected (recorded by D-147); D-151's one call, sent once and refused with HTTP 400, no image (recorded by D-152); and D-153's one call, sent once, raw received, candidate rejected by background-leak (recorded by D-154). assets[4] (r3-face-neutral) carries 4 PLANNED calls after D-167: D-160's, D-162's, D-165's and D-167's single attempts, each sent once (recorded by D-161, D-163, D-166 and D-168), so actually sent is underlay 5 and faceNeutral 4 and the planned face capacity is used up. The derived budget is 22-23. Budget numbers remain planning, never consent.",
  "noImageRequestAuthorised": "D-132 and this contract authorise no image request in general, and that general rule is unchanged. authorisedCalls.calls holds NINE entries. Read them by callId and by their own fields, never by the length of the list. (1) D-139-r3-underlay-head-only-v1 — D-139 superseded the general rule NARROWLY for exactly that one named call. That call was made. Its claim is spent on any outcome, prohibitions.noRetry forbids a repeat, and claim.furtherAttempt requires a NEW owner decision and a NEW claim identity. (2) D-142-r3-underlay-core-v1 — NEVER a permission. An incident RECORD with mandateState SPENT, outcome UNKNOWN and neverReuse true. A SPENT entry with neverReuse never counts as an active send permission, and no adapter may read it, or its presence in this list, as authorisation to send. (3) D-143-r3-underlay-core-v2 — NO LONGER a permission. D-143 superseded the general rule NARROWLY for exactly one further CORE-only underlay call. That call was sent once through the D-145 adapter, and D-147 records its outcome: HTTP 200, raw received, candidate rejected, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (4) D-151-r3-head-colour-u1-v1 — NO LONGER a permission. D-151 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay. That call was sent once and D-152 records its outcome: HTTP 400 (background transparent not supported for this model), no image, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-152 is preparation only and adds no entry. (5) D-153-r3-head-colour-u1-opaque-v1 — NO LONGER a permission. D-153 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay with background opaque. That call was sent once and D-154 records its outcome: HTTP 200, raw received, candidate rejected by background-leak, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-154 is feasibility analysis only and adds no entry. (6) D-160-r3-face-neutral-v1 — NO LONGER a permission. D-160 superseded the general rule NARROWLY for exactly one face-neutral attempt. That attempt was sent once and D-161 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, the geometry rejected by the owner, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (7) D-162-r3-face-neutral-guide-b-v1 — NO LONGER a permission. D-162 superseded the general rule NARROWLY for exactly one further face-neutral attempt (guide B and its prompt). That attempt was sent once and D-163 records its outcome: HTTP 200, one image, rejected by the binding AUTO-5 check, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (8) D-165-r3-face-parts-sheet-v1 — NO LONGER a permission. D-165 superseded the general rule NARROWLY for exactly one face-neutral parts-sheet attempt. That attempt was sent once and D-166 records its outcome: HTTP 200, one sheet, RAW-1..5 passed, the nose rejected by the owner, the brows and mouth kept for further review, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (9) D-167-r3-face-parts-nose-v1 — NO LONGER a permission. D-167 superseded the general rule NARROWLY for exactly one face-neutral partial nose sheet. That attempt was sent once and D-168 records its outcome: HTTP 200, one partial sheet, rejected by the binding RAW-4′ check, no nose approved, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. No entry in this list is an active send permission — no repeat of D-139's call, no reuse of D-142's, D-143's, D-151's, D-153's, D-160's, D-162's, D-165's or D-167's call id or claim identity, and no other call in the R3 plan."
});

/** A deep copy of the live contract with D-171's closure reversed and D-170's approval and authorisation removed. Pure. */
export function preD170Contract(live) {
  const c = preD171Contract(live);
  c.authorisedCalls.calls = c.authorisedCalls.calls.filter((e) => e.decision !== D170_DECISION);
  c.authorisedCalls.count = PRE_D170.count;
  c.adapterImplementations.entries = c.adapterImplementations.entries.filter((e) => e.decision !== D170_DECISION);
  c.authorisedCalls.budgetAccounting = PRE_D170.budgetAccounting;
  c.prohibitions.noImageRequestAuthorised = PRE_D170.noImageRequestAuthorised;
  for (const k of D170_ADDED_PLANNED_KEYS) delete c.imageCallBudget.callsPlannedAndAuthorised[k];
  if (c.eyesPartsMethod) c.eyesPartsMethod.targets = JSON.parse(JSON.stringify(PRE_D170.eyesTargets));
  return c;
}

export const D169_DECISION = "D-169";
/** origin/main when D-169 adopted the eyes method (the D-168 merge). */
export const PRE_D169_COMMIT = "6e2b668b4bc8481afb15bf65e309f55c539e837b";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D169_COMMIT. */
export const PRE_D169_CONTRACT_CANONICAL_SHA256 = "b232524ed723ef8b240d32e926dfbb8dc3e4166c1f0b479ee192b8025877171c";
export const D169_ADDED_TOP_LEVEL_KEYS = Object.freeze(["eyesPartsMethod"]);
export const D169_ADDED_OPERATION = "eyes placement and iris registration (D-169)";
export const PRE_D169 = Object.freeze({ "asset5Method": "generated" });

/** A deep copy of the live contract with D-170's changes and D-169's additions removed. Pure; never touches the input. */
export function preD169Contract(live) {
  const c = preD170Contract(live);
  for (const k of D169_ADDED_TOP_LEVEL_KEYS) delete c[k];
  c.deterministicOperations = c.deterministicOperations.filter((o) => o.op !== D169_ADDED_OPERATION);
  c.assets[5].method = PRE_D169.asset5Method;
  return c;
}

/** A deep copy of the live contract with D-169's additions removed and D-168's closure of D-167 reversed. Pure. */
export function preD168Contract(live) {
  const c = preD169Contract(live);
  const e167 = c.authorisedCalls.calls.find((x) => x.decision === "D-167");
  if (e167) {
    e167.status = PRE_D168.d167.status;
    e167.mandateState = PRE_D168.d167.mandateState;
    e167.outcome = PRE_D168.d167.outcome;
    for (const k of D168_ADDED_D167_KEYS) delete e167[k];
  }
  const i167 = c.adapterImplementations.entries.find((x) => x.decision === "D-167");
  if (i167) {
    i167.adapter.status = PRE_D168.d167impl.adapterStatus;
    i167.mandateState = PRE_D168.d167impl.mandateState;
    i167.outcome = PRE_D168.d167impl.outcome;
    for (const k of D168_ADDED_D167_IMPL_KEYS) delete i167[k];
  }
  c.imageCallBudget.callsActuallySentSoFar = JSON.parse(JSON.stringify(PRE_D168.callsActuallySentSoFar));
  c.authorisedCalls.budgetAccounting = PRE_D168.budgetAccounting;
  c.prohibitions.noImageRequestAuthorised = PRE_D168.noImageRequestAuthorised;
  return c;
}

/** A deep copy of the live contract with D-168's closure and D-167's additions removed. Pure; never touches the input. */
export function preD167Contract(live) {
  const c = preD168Contract(live);
  c.authorisedCalls.calls = c.authorisedCalls.calls.filter((e) => e.decision !== D167_DECISION);
  c.authorisedCalls.count = PRE_D167.count;
  c.adapterImplementations.entries = c.adapterImplementations.entries.filter((e) => e.decision !== D167_DECISION);
  c.assets[4].calls = PRE_D167.asset4Calls;
  c.imageCallBudget.minimum = PRE_D167.minimum;
  c.imageCallBudget.maximum = PRE_D167.maximum;
  c.imageCallBudget.callsPlannedAndAuthorised = JSON.parse(JSON.stringify(PRE_D167.callsPlannedAndAuthorised));
  c.authorisedCalls.budgetAccounting = PRE_D167.budgetAccounting;
  c.prohibitions.noImageRequestAuthorised = PRE_D167.noImageRequestAuthorised;
  for (const k of D167_ADDED_TOP_LEVEL_KEYS) delete c[k];
  return c;
}

/** A deep copy of the live contract with D-167's additions and D-166's closure of D-165 reversed. Pure; never touches the input. */
export function preD166Contract(live) {
  const c = preD167Contract(live);
  const e165 = c.authorisedCalls.calls.find((x) => x.decision === "D-165");
  if (e165) {
    e165.status = PRE_D166.d165.status;
    e165.mandateState = PRE_D166.d165.mandateState;
    e165.outcome = PRE_D166.d165.outcome;
    for (const k of D166_ADDED_D165_KEYS) delete e165[k];
  }
  const i165 = c.adapterImplementations.entries.find((x) => x.decision === "D-165");
  if (i165) {
    i165.adapter.status = PRE_D166.d165impl.adapterStatus;
    i165.mandateState = PRE_D166.d165impl.mandateState;
    i165.outcome = PRE_D166.d165impl.outcome;
    for (const k of D166_ADDED_D165_IMPL_KEYS) delete i165[k];
  }
  c.imageCallBudget.callsActuallySentSoFar = JSON.parse(JSON.stringify(PRE_D166.callsActuallySentSoFar));
  c.authorisedCalls.budgetAccounting = PRE_D166.budgetAccounting;
  c.prohibitions.noImageRequestAuthorised = PRE_D166.noImageRequestAuthorised;
  return c;
}

/** A deep copy of the live contract with D-166's closure and D-165's additions removed. Pure; never touches the input. */
export function preD165Contract(live) {
  const c = preD166Contract(live);
  c.authorisedCalls.calls = c.authorisedCalls.calls.filter((e) => e.decision !== D165_DECISION);
  c.authorisedCalls.count = PRE_D165.count;
  c.adapterImplementations.entries = c.adapterImplementations.entries.filter((e) => e.decision !== D165_DECISION);
  c.assets[4].calls = PRE_D165.asset4Calls;
  c.imageCallBudget.minimum = PRE_D165.minimum;
  c.imageCallBudget.maximum = PRE_D165.maximum;
  c.imageCallBudget.callsPlannedAndAuthorised = JSON.parse(JSON.stringify(PRE_D165.callsPlannedAndAuthorised));
  c.prohibitions.noImageRequestAuthorised = PRE_D165.noImageRequestAuthorised;
  return c;
}

/** A deep copy of the live contract with D-165's and D-164's additions removed. Pure; never touches the input. */
export function preD164Contract(live) {
  const c = preD165Contract(live);
  for (const k of D164_ADDED_TOP_LEVEL_KEYS) delete c[k];
  c.deterministicOperations = c.deterministicOperations.filter((o) => o.op !== D164_ADDED_OPERATION);
  c.assets[4].method = PRE_D164.asset4Method;
  return c;
}

/** A deep copy of the live contract with D-164's additions and D-163's closure of D-162 reversed. Pure; never touches the input. */
export function preD163Contract(live) {
  const c = preD164Contract(live);
  const e162 = c.authorisedCalls.calls.find((x) => x.decision === "D-162");
  if (e162) {
    e162.status = PRE_D163.d162.status;
    e162.mandateState = PRE_D163.d162.mandateState;
    e162.outcome = PRE_D163.d162.outcome;
    for (const k of D163_ADDED_D162_KEYS) delete e162[k];
  }
  const i162 = c.adapterImplementations.entries.find((x) => x.decision === "D-162");
  if (i162) {
    i162.adapter.status = PRE_D163.d162impl.adapterStatus;
    i162.mandateState = PRE_D163.d162impl.mandateState;
    i162.outcome = PRE_D163.d162impl.outcome;
    for (const k of D163_ADDED_D162_IMPL_KEYS) delete i162[k];
  }
  c.imageCallBudget.callsActuallySentSoFar = JSON.parse(JSON.stringify(PRE_D163.callsActuallySentSoFar));
  c.prohibitions.noImageRequestAuthorised = PRE_D163.noImageRequestAuthorised;
  return c;
}

/** A deep copy of the live contract with D-163's closure and D-162's additions removed. Pure; never touches the input. */
export function preD162Contract(live) {
  const c = preD163Contract(live);
  c.authorisedCalls.calls = c.authorisedCalls.calls.filter((e) => e.decision !== D162_DECISION);
  c.authorisedCalls.count = PRE_D162.count;
  c.adapterImplementations.entries = c.adapterImplementations.entries.filter((e) => e.decision !== D162_DECISION);
  c.assets[4].calls = PRE_D162.asset4Calls;
  c.imageCallBudget.minimum = PRE_D162.minimum;
  c.imageCallBudget.maximum = PRE_D162.maximum;
  c.imageCallBudget.callsPlannedAndAuthorised = JSON.parse(JSON.stringify(PRE_D162.callsPlannedAndAuthorised));
  c.prohibitions.noImageRequestAuthorised = PRE_D162.noImageRequestAuthorised;
  for (const k of D162_ADDED_TOP_LEVEL_KEYS) delete c[k];
  return c;
}

export const D161_DECISION = "D-161";
/** origin/main when D-161 recorded the outcome (the commit the one D-160 send ran from). */
export const PRE_D161_COMMIT = "f6ed33e63e8cbf2f01e7376c1a46204f1cfc3e7c";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D161_COMMIT. */
export const PRE_D161_CONTRACT_CANONICAL_SHA256 = "cc876c9dc7cd816136bd6cee60c5d75499626fa366536f55d96994dea224d965";
/** The keys D-161 added to D-160's entry and to its implementation entry. */
export const D161_ADDED_D160_KEYS = Object.freeze(["neverReuse", "notAnActivePermission", "closure", "execution", "technicalObservations", "visualReview", "diagnosticsLimitation"]);
export const D161_ADDED_D160_IMPL_KEYS = Object.freeze(["neverReuse", "closedBy"]);
/** The values D-161 replaced, as they stood at PRE_D161_COMMIT. */
export const PRE_D161 = Object.freeze({
  "d160": {"status":"AUTHORISED — ONE CALL — NOT YET ATTEMPTED","mandateState":"UNSPENT","outcome":"NOT YET ATTEMPTED"},
  "d160impl": {"adapterStatus":"IMPLEMENTED — NOT EXECUTED","mandateState":"UNSPENT","outcome":"NOT YET ATTEMPTED"},
  "callsActuallySentSoFar": {"underlay":5,"which":["D-139 — sent, output rejected","D-142 — sent during the incident, outcome UNKNOWN","D-143 — sent once, HTTP 200, raw received, candidate rejected by pre.transition-silhouette, nothing promoted (recorded by D-147)","D-151 — sent once, HTTP 400 (background transparent not supported for this model), no image, nothing promoted (recorded by D-152)","D-153 — sent once, HTTP 200, raw received, candidate rejected by background-leak, nothing promoted (recorded by D-154)"],"note":"An OBSERVATION of what has left this machine. D-143's single send is counted here since D-147, D-151's since D-152 and D-153's since D-154."},
  "noImageRequestAuthorised": "D-132 and this contract authorise no image request in general, and that general rule is unchanged. authorisedCalls.calls holds SIX entries. Read them by callId and by their own fields, never by the length of the list. (1) D-139-r3-underlay-head-only-v1 — D-139 superseded the general rule NARROWLY for exactly that one named call. That call was made. Its claim is spent on any outcome, prohibitions.noRetry forbids a repeat, and claim.furtherAttempt requires a NEW owner decision and a NEW claim identity. (2) D-142-r3-underlay-core-v1 — NEVER a permission. An incident RECORD with mandateState SPENT, outcome UNKNOWN and neverReuse true. A SPENT entry with neverReuse never counts as an active send permission, and no adapter may read it, or its presence in this list, as authorisation to send. (3) D-143-r3-underlay-core-v2 — NO LONGER a permission. D-143 superseded the general rule NARROWLY for exactly one further CORE-only underlay call. That call was sent once through the D-145 adapter, and D-147 records its outcome: HTTP 200, raw received, candidate rejected, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (4) D-151-r3-head-colour-u1-v1 — NO LONGER a permission. D-151 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay. That call was sent once and D-152 records its outcome: HTTP 400 (background transparent not supported for this model), no image, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-152 is preparation only and adds no entry. (5) D-153-r3-head-colour-u1-opaque-v1 — NO LONGER a permission. D-153 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay with background opaque. That call was sent once and D-154 records its outcome: HTTP 200, raw received, candidate rejected by background-leak, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-154 is feasibility analysis only and adds no entry. (6) D-160-r3-face-neutral-v1 — THE ONLY active send permission. D-160 supersedes the general rule NARROWLY for exactly one face-neutral attempt (the r3-face-neutral layer prepared by D-159), with mandateState UNSPENT and outcome NOT YET ATTEMPTED until its claim exists. Its merge is not a run instruction: the call needs a separate, explicit owner instruction after the merge. prohibitions.noRetry forbids a repeat and claimRules.furtherAttempt requires a NEW owner decision, a NEW call id and a NEW claim identity. Apart from D-160's single attempt, no entry in this list is an active send permission — no repeat of D-139's call, no reuse of D-142's, D-143's, D-151's, D-153's or D-160's call id or claim identity, and no other call in the R3 plan."
});

/** A deep copy of the live contract with D-161's closure of D-160 reversed. Pure; never touches the input. */
export function preD161Contract(live) {
  const c = preD162Contract(live);
  const e160 = c.authorisedCalls.calls.find((x) => x.decision === "D-160");
  if (e160) {
    e160.status = PRE_D161.d160.status;
    e160.mandateState = PRE_D161.d160.mandateState;
    e160.outcome = PRE_D161.d160.outcome;
    for (const k of D161_ADDED_D160_KEYS) delete e160[k];
  }
  const i160 = c.adapterImplementations.entries.find((x) => x.decision === "D-160");
  if (i160) {
    i160.adapter.status = PRE_D161.d160impl.adapterStatus;
    i160.mandateState = PRE_D161.d160impl.mandateState;
    i160.outcome = PRE_D161.d160impl.outcome;
    for (const k of D161_ADDED_D160_IMPL_KEYS) delete i160[k];
  }
  c.imageCallBudget.callsActuallySentSoFar = JSON.parse(JSON.stringify(PRE_D161.callsActuallySentSoFar));
  c.prohibitions.noImageRequestAuthorised = PRE_D161.noImageRequestAuthorised;
  return c;
}

export const D160_DECISION = "D-160";
/** The D-160 base commit (origin/main when D-160 was authorised: after PR #322 merged the inactive adapter). */
export const PRE_D160_COMMIT = "66d45bd36da1aee6105e2c8712fb262010b7f488";
/** sha256(JSON.stringify(contract)) of tools/avatar/fixtures/r3/r3-shadow-contract-v1.json at PRE_D160_COMMIT. */
export const PRE_D160_CONTRACT_CANONICAL_SHA256 = "bacf9e6167e1d02eff6343678c35efbb86c8328f16ba1390e3997239aeadb5ee";
/** The values D-160 replaced, as they stood at PRE_D160_COMMIT. */
export const PRE_D160 = Object.freeze({
  "count": 5,
  "noImageRequestAuthorised": "D-132 and this contract authorise no image request in general, and that general rule is unchanged. authorisedCalls.calls holds FIVE entries. Read them by callId and by their own fields, never by the length of the list. (1) D-139-r3-underlay-head-only-v1 — D-139 superseded the general rule NARROWLY for exactly that one named call. That call was made. Its claim is spent on any outcome, prohibitions.noRetry forbids a repeat, and claim.furtherAttempt requires a NEW owner decision and a NEW claim identity. (2) D-142-r3-underlay-core-v1 — NEVER a permission. An incident RECORD with mandateState SPENT, outcome UNKNOWN and neverReuse true. A SPENT entry with neverReuse never counts as an active send permission, and no adapter may read it, or its presence in this list, as authorisation to send. (3) D-143-r3-underlay-core-v2 — NO LONGER a permission. D-143 superseded the general rule NARROWLY for exactly one further CORE-only underlay call. That call was sent once through the D-145 adapter, and D-147 records its outcome: HTTP 200, raw received, candidate rejected, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. (4) D-151-r3-head-colour-u1-v1 — NO LONGER a permission. D-151 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay. That call was sent once and D-152 records its outcome: HTTP 400 (background transparent not supported for this model), no image, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. D-152 is preparation only and adds no entry. (5) D-153-r3-head-colour-u1-opaque-v1 — NO LONGER a permission. D-153 superseded the general rule NARROWLY for exactly one colour-limited call on the R3 head underlay with background opaque. That call was sent once and D-154 records its outcome: HTTP 200, raw received, candidate rejected by background-leak, nothing promoted. The entry carries mandateState SPENT, neverReuse true and notAnActivePermission true, and no adapter may read it, or its presence in this list, as authorisation to send. No entry in this list is an active send permission — no repeat of D-139's call, no reuse of D-142's, D-143's, D-151's or D-153's call id or claim identity, and no other call in the R3 plan. D-154 is feasibility analysis only and adds no entry."
});

/** A deep copy of the live contract with D-161's closure and D-160's additions removed. Pure; never touches the input. */
export function preD160Contract(live) {
  const c = preD161Contract(live);
  c.authorisedCalls.calls = c.authorisedCalls.calls.filter((e) => e.decision !== D160_DECISION);
  c.authorisedCalls.count = PRE_D160.count;
  c.adapterImplementations.entries = c.adapterImplementations.entries.filter((e) => e.decision !== D160_DECISION);
  c.prohibitions.noImageRequestAuthorised = PRE_D160.noImageRequestAuthorised;
  return c;
}

/** A deep copy of the live contract with D-160's and D-159's additions removed. Pure; never touches the input. */
export function preD159Contract(live) {
  const c = preD160Contract(live);
  for (const k of D159_ADDED_TOP_LEVEL_KEYS) delete c[k];
  return c;
}

/** A deep copy of the live contract with D-159's addition and D-154's closure of D-153 reversed. Pure; never touches the input. */
export function preD154Contract(live) {
  const c = preD159Contract(live);
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
