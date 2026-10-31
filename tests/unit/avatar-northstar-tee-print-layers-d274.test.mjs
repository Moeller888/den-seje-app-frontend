// D-274 — the owner's approval of the tee print combinations and the private preparation of their runtime layers, without C or
// the private inputs: the approval file names exactly D-272's 16 candidates (the 2 non-candidates are not covered), rests on the
// pinned candidate file, and is the only list a build reads; unknown or contradictory IDs are refused; every approved ID maps to one
// runtime item; and nothing is published or integrated yet — no print layer in assets/, no print item in the runtime table.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as TL from "../../tools/avatar/build-northstar-tee-print-layers.mjs";
import * as AL from "../../js/avatar-layers.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHILD_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/API_?KEY/i.test(k)));
const sha = (b) => createHash("sha256").update(b).digest("hex"), file = (rel) => readFileSync(join(REPO, ...rel.split("/")));
const APPROVAL = JSON.parse(file(TL.APPROVAL).toString("utf8")), CAND_BUF = file(TL.CANDIDATES), CAND = JSON.parse(CAND_BUF.toString("utf8"));

test("D-274 the approval: exactly D-272's 16 candidates, the 2 non-candidates not covered, the owner's words, on the pinned candidate file and D-271's record", () => {
  assert.equal(APPROVAL.decision, "D-274"); assert.match(APPROVAL.owner.message, /ALLE 16 KANDIDATER ER GODKENDT/);
  assert.deepEqual([...APPROVAL.approved].sort(), [...CAND.advisory.candidates].sort()); assert.equal(APPROVAL.approved.length, 16);
  assert.deepEqual(Object.keys(APPROVAL.notApproved).sort(), ["TP-FOX-COR", "TP-FOX-MUS"]);
  assert.equal(APPROVAL.basis.candidates.sha256, sha(CAND_BUF)); assert.equal(APPROVAL.basis.d271RecordSha256, CAND.source.recordSha256);
  assert.match(APPROVAL.notCovered, /publication/); assert.match(CAND.owner.status, /^PENDING/, "D-272's pack stays as it was (history)");
  assert.deepEqual(TL.approvedIds(APPROVAL, CAND, sha(CAND_BUF)), APPROVAL.approved);
});

test("D-274 a build reads only the approval: an unknown ID, an ID both approved and not, or another candidate file is refused", () => {
  const s = sha(CAND_BUF);
  assert.throws(() => TL.approvedIds({ ...APPROVAL, approved: [...APPROVAL.approved, "TP-CAT-CRM"] }, CAND, s), /not a D-272 combination/);
  assert.throws(() => TL.approvedIds({ ...APPROVAL, approved: [...APPROVAL.approved, "TP-FOX-COR"] }, CAND, s), /both approved and not approved/);
  assert.throws(() => TL.approvedIds({ ...APPROVAL, approved: [...APPROVAL.approved, "TP-TEA-CRM"] }, CAND, s), /unique/);
  assert.throws(() => TL.approvedIds(APPROVAL, CAND, "0".repeat(64)), /candidate file/);
});

test("D-274 every approved ID maps to one runtime item of the cream tee's shape", () => {
  const items = APPROVAL.approved.map((id) => TL.itemOf(CAND, id));
  assert.equal(new Set(items.map((x) => x.item)).size, 16); for (const x of items) assert.match(x.item, /^top-tee-hip-print-(teapot|shield|fox)-(cream|heather|navy|coral|forest|mustard)$/);
  assert.deepEqual(TL.itemOf(CAND, "TP-TEA-CRM"), { id: "TP-TEA-CRM", callId: "TPV-2-tee-print-object-teapot", colour: "cream", item: "top-tee-hip-print-teapot-cream" });
  assert.deepEqual({ ...TL.ITEM_SHAPE }, { ...AL.NORTHSTAR_ITEMS["top-tee-hip-cream"] }, "the same layers and shadow parts as the cream tee (the same cut)");
  assert.ok(TL.PARTNERS.bottom in AL.NORTHSTAR_ITEMS && TL.PARTNERS.shoes in AL.NORTHSTAR_ITEMS);
});

test("D-274 nothing is published or integrated: no print layer in assets/avatar-northstar/, no print item in the runtime table, the flag off", () => {
  assert.equal(readdirSync(join(REPO, "assets", "avatar-northstar")).filter((f) => /print/.test(f)).length, 0);
  assert.equal(Object.keys(AL.NORTHSTAR_ITEMS).filter((id) => /print/.test(id)).length, 0); assert.equal(AL.AVATAR_NORTHSTAR_WARDROBE, false);
  const m = JSON.parse(file("assets/avatar-northstar/manifest.json").toString("utf8")); assert.equal(m.files.length, 31);
});

test("D-274 the layer build refuses an --out inside the repository", () => {
  const r = spawnSync(process.execPath, [join(REPO, "tools", "avatar", "build-northstar-tee-print-layers.mjs"), "--out", join(REPO, "assets", "avatar-northstar")], { cwd: REPO, env: CHILD_ENV, encoding: "utf8", windowsHide: true, timeout: 60000 });
  assert.equal(r.status, 1); assert.match(r.stderr, /--out must be outside the repository/);
});
