// D-272 — the approval pack for the tested tee print family, without C or the private D-271 result: the candidate fixture (16 advisory
// candidates, 2 non-candidates, stable IDs, the owner's status PENDING), the record check, the manifest (the technical result copied as
// recorded, three separate statuses, no owner decision), and the page (nothing pre-selected, a local-only review, no network, the
// non-candidates apart with their reason, the known limits). The pack approves nothing; passing these tests is not a visual approval.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import * as AP from "../../tools/avatar/northstar-tee-print-approval-pack.mjs";
import * as PF from "../../tools/avatar/northstar-tee-print-family.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHILD_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/API_?KEY/i.test(k)));
const FX = AP.loadFixture(), CALLS = Object.keys(FX.source.calls), COLOURS = Object.keys(FX.source.colours);

/** A SYNTHETIC record with D-271's shape (the real one is private). */
function record() {
  const motifs = {}, renders = {};
  CALLS.forEach((callId, k) => { motifs[callId] = { imageSha256: FX.source.calls[callId].imageSha256, classification: "requires-visual-review", delivery: { problems: [] }, prepared: { size: [100 + k, 120], limitedBy: "box" }, colours: {} };
    COLOURS.forEach((c, j) => { const contrast = { visibleShare: 0.9, strongShare: 0.5 + j / 20, silhouette: 1, bridgePx: 5, class: j % 2 ? "borderline" : "clear" };
      motifs[callId].colours[c] = { contrast, checks: { alphaUnchanged: true }, placementOk: true }; renders[callId + "-" + c] = { contrast: contrast.class }; }); });
  return { decision: "D-270", kind: "calls", revision: "tpv-v1", fingerprint: FX.master.fingerprint, placement: { name: "chest-center", box: [437, 537, 150, 135] }, rule: { alphaBox: 8, inkShare: 0.5, samples: 8 },
    colours: Object.fromEntries(COLOURS.map((c, j) => [c, [j, j, j]])), motifs, renders };
}
const files = () => Object.fromEntries(CALLS.flatMap((id) => COLOURS.flatMap((c) => AP.VIEWS.map((v) => [id + "-" + c + "-" + v + ".png", "f".repeat(64)]))));

test("D-272 the candidate fixture: 16 advisory candidates and 2 non-candidates with reasons, stable unique IDs, the D-269 placement and the master; the owner's status PENDING", () => {
  const ids = CALLS.flatMap((id) => COLOURS.map((c) => AP.idOf(FX, id, c)));
  assert.equal(new Set(ids).size, 18); for (const id of ids) assert.match(id, /^TP-(FOX|TEA|SHD)-(CRM|HTH|NAV|COR|FOR|MUS)$/);
  assert.equal(FX.advisory.candidates.length, 16); assert.deepEqual(Object.keys(FX.advisory.notCandidates).sort(), ["TP-FOX-COR", "TP-FOX-MUS"]);
  for (const id of [...FX.advisory.candidates, ...Object.keys(FX.advisory.notCandidates)]) assert.ok(ids.includes(id), id);
  assert.ok(FX.advisory.candidates.every((id) => !(id in FX.advisory.notCandidates))); assert.match(FX.advisory.notes["TP-SHD-MUS"], /sennep/);
  assert.match(FX.advisory.by, /advisory/); assert.match(FX.owner.status, /^PENDING/); assert.ok(FX.owner.messageFormat.includes("D-272 GODKENDT: ALLE 16 KANDIDATER"));
  assert.deepEqual(FX.placement.spec, { ...PF.PLACEMENTS["chest-center"] }); assert.deepEqual(FX.placement.rule, { ...PF.RULE }); assert.equal(FX.master.fingerprint, PF.MASTER_FINGERPRINT);
});

test("D-272 the record check refuses anything but D-271's result: another hash, another master, a missing combination", () => {
  const r = record(); assert.deepEqual(AP.verifyRecord(r, FX.source.recordSha256, FX), []);
  assert.ok(AP.verifyRecord(r, "0".repeat(64), FX).some((p) => /not D-271's/.test(p)));
  assert.ok(AP.verifyRecord({ ...r, fingerprint: "1".repeat(64) }, FX.source.recordSha256, FX).some((p) => /fingerprint/.test(p)));
  const r2 = record(); delete r2.motifs[CALLS[0]].colours.navy; assert.ok(AP.verifyRecord(r2, FX.source.recordSha256, FX).some((p) => /navy: no result/.test(p)));
  const r3 = record(); r3.motifs[CALLS[1]].imageSha256 = "2".repeat(64); assert.ok(AP.verifyRecord(r3, FX.source.recordSha256, FX).some((p) => /not the received image/.test(p)));
});

test("D-272 the manifest: 18 entries; the technical result as recorded, ChatGPT's advisory status and the owner's PENDING status kept apart; no owner approval", () => {
  const r = record(), man = AP.buildManifest(r, FX.source.recordSha256, FX, files());
  assert.deepEqual(man.counts, { combinations: 18, candidates: 16, notCandidates: 2, ownerApproved: 0 });
  for (const e of man.entries) { const x = r.motifs[e.motif.callId].colours[e.colour.name];
    assert.deepEqual(e.technical.contrast, x.contrast, "the contrast class is D-271's, not the advisory one"); assert.equal(e.technical.placementOk, x.placementOk);
    assert.equal(e.owner.status, AP.OWNER_PENDING); assert.equal(e.advisory.status, FX.advisory.candidates.includes(e.id) ? "candidate" : "not-candidate");
    assert.deepEqual([e.master.revision, e.placement.name], ["tee-master-v1", "chest-center"]); for (const v of AP.VIEWS) assert.match(e.source.files[v].sha256, /^[0-9a-f]{64}$/); }
  // the advisory selection never rewrites the yield: a non-candidate keeps its recorded technical result
  const out = man.entries.find((e) => e.id === "TP-FOX-COR"); assert.equal(out.technical.delivery, "requires-visual-review"); assert.match(out.advisory.note, /koral/);
});

test("D-272 the page: the candidates and the non-candidates apart with their reason, actual app sizes, the known limits; nothing pre-selected, a local review only, no network", () => {
  const html = AP.pageHtml(AP.buildManifest(record(), FX.source.recordSha256, FX, files()));
  assert.ok(/<input type="radio"/.test(html) && !/<input[^>]*\bchecked\b/.test(html), "no radio is checked in the markup");
  assert.ok(!/fetch\(|XMLHttpRequest|https?:\/\//.test(html), "no network"); assert.match(html, /localStorage\.setItem\(KEY/); assert.match(html, /try\{localStorage/);
  for (const id of [...FX.advisory.candidates, "TP-FOX-COR", "TP-FOX-MUS"]) assert.ok(html.includes(id), id);
  assert.match(html, /Fravalgte kombinationer/); assert.match(html, /Godkend trods fravalg/); assert.match(html, /svag læsbarhed: den orange krop glider i ét med koral/);
  assert.match(html, /width="110" height="165"/); assert.match(html, /width="52" height="78"/);
  for (const l of AP.KNOWN_LIMITS_DA) assert.ok(html.includes(l.slice(0, 30)), l);
  assert.match(html, /Ingen kombination er godkendt af ejeren/); assert.match(html, /D-272 GODKENDT: ALLE 16 KANDIDATER/); assert.match(html, /D-272 AFVIST:/);
});

test("D-272 the pack refuses an --out inside the repository and a result that is not D-271's", () => {
  const r = spawnSync(process.execPath, [join(REPO, "tools", "avatar", "northstar-tee-print-approval-pack.mjs"), "--from", REPO, "--out", join(REPO, "tools", "avatar", "build", "d272")], { cwd: REPO, env: CHILD_ENV, encoding: "utf8", windowsHide: true, timeout: 60000 });
  assert.equal(r.status, 1); assert.match(r.stderr, /--out must be outside the repository/);
  const tmp = mkdtempSync(join(tmpdir(), "d272-")); try { mkdirSync(join(tmp, "from")); writeFileSync(join(tmp, "from", "record.json"), JSON.stringify(record()));
    const s = spawnSync(process.execPath, [join(REPO, "tools", "avatar", "northstar-tee-print-approval-pack.mjs"), "--from", join(tmp, "from"), "--out", join(tmp, "out")], { cwd: REPO, env: CHILD_ENV, encoding: "utf8", windowsHide: true, timeout: 60000 });
    assert.equal(s.status, 1); assert.match(s.stderr, /the record is not D-271's/); } finally { rmSync(tmp, { recursive: true, force: true }); }
});
