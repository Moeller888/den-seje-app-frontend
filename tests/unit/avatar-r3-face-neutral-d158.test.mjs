// D-158 — complete mirrored brows in R3 face-neutral: an owner DEFINITION, registered append-only. No call, no claim,
// no call-id, no request, no adapter, no fixture, no contract change. The brow mirror/fit analysis is a local, gitignored
// study; nothing it produced is tracked, and this test only guards the register, the contract and the absence of a call.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { preD160Contract } from "./avatar-r3-d147-closure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const repoFile = (rel) => join(REPO, ...rel.split("/"));
// D-160 later added one authorisation (proven exact by preD160Contract in avatar-r3-d147-closure.mjs). This file checks the
// contract as its own decision left it, so it reads the contract with exactly D-160's additions removed.
const C = preD160Contract(JSON.parse(readFileSync(repoFile("tools/avatar/fixtures/r3/r3-shadow-contract-v1.json"), "utf8")));
const REG = readFileSync(repoFile("docs/project-state.md"), "utf8").split("\n");
const rows = (k) => REG.filter((l) => l.startsWith("| **" + k + "** |"));
const one = (k) => { const r = rows(k); assert.equal(r.length, 1, k + " must appear exactly once"); return r[0]; };

test("D-158 is registered exactly once after D-156 (only D-157, from its own branch, may sit between), and the earlier rows are verbatim", () => {
  const row = one("D-158");
  const i156 = REG.findIndex((l) => l.startsWith("| **D-156** |")), i158 = REG.findIndex((l) => l.startsWith("| **D-158** |"));
  assert.ok(i158 > i156, "D-158 follows D-156");
  const between = REG.slice(i156 + 1, i158).map((l) => (l.match(/^\| \*\*(D-\d+)\*\* \|/) || [null, l])[1]);
  assert.ok(between.length === 0 || (between.length === 1 && between[0] === "D-157"), "only the D-157 row may stand between D-156 and D-158: " + JSON.stringify(between));
  assert.equal(sha256(one("D-154")), "53b2dd7cca76ce45cfb9d590fc7c8306efd0eb545412a03b49a451fb9806f6a1");
  assert.equal(sha256(one("D-155")), "0f7bd20d9279a1d3efeaaf4ba183073f511ca76444e9355f830771e9e60c9e61");
  assert.equal(sha256(one("D-156")), "709a7f399b64840242aaffeb399b333fbde80f7dc5eb9102ad950d857630d31e");
  assert.ok(row.endsWith(" |"));
});

test("the D-158 row carries every binding element of the owner decision", () => {
  const row = one("D-158");
  for (const needle of [
    "COMPLETE MIRRORED BROWS — DEFINITION ONLY — NO IMAGE REQUEST AUTHORISED", "`UNASSIGNED`", "`NONE`", "B — KONTRAKT BLOKERER",
    "to komplette øjenbryn", "primære formkilde", "målte anatomiske midterlinje", "matematisk beskrevet og reproducerbar",
    "Frihåndskorrektion er forbudt", "Ikke-lineær deformation kræver en ny ejerbeslutning", "86 brynpixels", "P2 er kun en sekundær sammenligning",
    "rekonstruerede/infererede", "Hårlaget (z 40) bestemmer alene", "hårformet afskæring", "uden hår, med Northstar-hår, med afro, med short og i hvert understøttet udtryk",
    "pixel-ground-truth", "billedkald", "forbliver **5**", "default OFF", "R3-kontrakten ændres ikke", "D-157 allerede er brugt"])
    assert.ok(row.includes(needle), "the D-158 row must carry " + JSON.stringify(needle));
  assert.ok(!/[ÃÂ]\S|�/.test(row), "no mojibake");
  assert.ok(!/\b(ae|oe|aa)jen|oejenbryn|haar/i.test(row), "no ASCII transliteration of Danish");
});

test("D-158 changes nothing in the contract: no face-neutral call, sent stays 5, R3 stays OFF", () => {
  assert.ok(!JSON.stringify(C).includes("D-158"));
  assert.equal(C.imageCallBudget.callsActuallySentSoFar.underlay, 5);
  assert.equal(C.authorisedCalls.calls.length, 5);
  assert.deepEqual(C.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT"), []);
  assert.ok(!C.authorisedCalls.calls.some((e) => /face/i.test(JSON.stringify(e.callId ?? ""))));
  assert.deepEqual([C.imageCallBudget.isAuthorisation, C.meta.authorisesImageRequest, C.architecture.defaultEnabled], [false, false, false]);
  const face = C.assets.find((a) => a.name === "r3-face-neutral");
  assert.deepEqual(face, { id: 5, name: "r3-face-neutral", slot: "face", method: "generated", calls: 1 });
  assert.ok(!/AVATAR_R3\s*=\s*true/.test(readFileSync(repoFile("js/avatar-layers.js"), "utf8")));
});

test("only the reviewed face-neutral source files are tracked — no preparation artefact, study output or review", () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: REPO, encoding: "utf8" }).split("\n");
  const self = "tests/unit/avatar-r3-face-neutral-d158.test.mjs";
  // D-159 authorises tracking EXACTLY these preparation files (tools, the exact prompt text and their test), and the
  // owner allowed EXACTLY the four reviewed source files of the INACTIVE send-adapter preparation (owner instructions
  // 2026-10-16, PR #322): code, a test and the PREPARED — NOT AUTHORISED specification — no image, credential, claim or
  // active permission. Every other face-neutral file — studies, private guides, H1-derived images, review HTML and
  // images, raw responses, claims and event logs — stays untracked.
  const authorised = new Set([
    "tools/avatar/prepare-r3-face-neutral-request.mjs",
    "tools/avatar/check-r3-face-neutral-output.mjs",
    "tools/avatar/fixtures/r3-face-neutral/prompt-text.exact.txt",
    "tests/unit/avatar-r3-face-neutral-d159.test.mjs",
    "tools/avatar/openai-send-r3-face-neutral-d160.mjs",
    "tools/avatar/r3-face-neutral-attempt-ledger.mjs",
    "tools/avatar/fixtures/r3-face-neutral/send-call-spec-prepared-v1.json",
    "tests/unit/avatar-r3-face-neutral-send-d160.test.mjs",
    // D-162 (owner instruction 2026-10-18): guide B (no H1 pixel bytes) and its prompt as tracked fixtures, the separate
    // D-162 send adapter and its test.
    "tools/avatar/fixtures/r3-face-neutral/guide-b-v1.png",
    "tools/avatar/fixtures/r3-face-neutral/prompt-guide-b-v1.txt",
    "tools/avatar/openai-send-r3-face-neutral-d162.mjs",
    "tests/unit/avatar-r3-face-neutral-send-d162.test.mjs",
    // D-190 (owner instruction 2026-10-22: "Gør venstre bryn komplet med D-158-spejlingen", with commit and merge authorised):
    // the versioned review mask of the fitted mirror in the D-190 review variant. It is a D-190 artefact pinned by its
    // manifest, not D-158's offline study output, which stays untracked.
    "tools/avatar/fixtures/r3-northstar-brow/masks/brow-mirror-fitted.png",
  ]);
  assert.deepEqual(tracked.filter((f) => f !== self && !authorised.has(f) && /r3-face-neutral|brow-mirror-fit|face-neutral-prep/i.test(f)), []);
  assert.deepEqual(tracked.filter((f) => f.startsWith("tools/avatar/build/")), []);
  assert.deepEqual(tracked.filter((f) => /\.claim\.json$|\.events\.jsonl$|placement-guide/i.test(f)), [], "no claim, event log or placement guide is tracked");
});
