// NORTHSTAR BASE FIGURE C — D-205: C frozen as a versioned development candidate (numbers tracked, pixels outside the clones),
// contract v3 with three separate axes (FIT to C binding, COMPATIBILITY with old Northstar clothing a report, QUALITY measured),
// gate set v3 (BF9v3 the waist seam, BF15v3 the runtime composition), the category templates and the fit check with its fault
// stimuli, and the prepared — not authorised — clothing pilot on C. C is private (D-127 §2): CI runs every tool on a
// Northstar-derived stand-in base with legs, never on C.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as BF from "../../tools/avatar/northstar-base-figure.mjs";
import * as BC from "../../tools/avatar/northstar-base-figure-c.mjs";
import { standInItems } from "../../tools/avatar/northstar-base-figure-c-proof.mjs";
import { recolour } from "../../tools/avatar/northstar-wardrobe-poc.mjs";
import * as NL from "../../tools/avatar/r3-northstar-layers.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const w = WR.buildWardrobe(), spec = BF.loadSpec(), Z = BF.zones(w, spec), { W, N } = WR, L = w.base.layers, A = w.anchors, M = w.fg.master;
// the CI stand-in base: Northstar whose jeans below the crotch are recoloured to skin (value kept) — a base with legs
const LEGS = (() => { const legs = new Uint8ClampedArray(L.pants); for (let i = 0; i < (A.crotchY + 10) * W; i++) legs[i * 4 + 3] = 0; return NL.overStack([M, recolour(legs, { h: 33, s: 0.51, vScale: 1.3 })]); })();
const base = BC.prepareBase(w, LEGS, Z), T = BC.templatesC(w, base);

test("C is frozen as numbers only: raw hash, registration, anchors, layer counts and the hashes of the private external files", () => {
  const f = BC.loadFreeze(), text = readFileSync(join(REPO, ...BC.FREEZE_FILE.split("/")), "utf8");
  assert.equal(f.decision, "D-205"); assert.match(f.status, /FROZEN DEVELOPMENT CANDIDATE — not production activation, not a final visual approval/);
  assert.equal(f.raw.sha256, BC.C_RAW_SHA256); assert.equal(f.raw.sha256, "10f4a4b9baf9886e8f230e09b2ab4e69bfebd6795c2a1222eb84f8db3884e818");
  assert.deepEqual([f.registration.dx, f.registration.dy, f.registration.ok], [0, 0, true]);
  assert.deepEqual([f.anchors.neckSeamY, f.anchors.groundLineY, f.anchors.soleY.left, f.anchors.waistSeam.gapPx], [440, 1488, 1486, 0]);
  assert.equal(Object.keys(f.externalArtefacts.files).length, 14); for (const v of Object.values(f.externalArtefacts.files)) assert.match(v.sha256, /^[0-9a-f]{64}$/);
  assert.match(f.externalArtefacts.storage, /never tracked, never published/);
  assert.deepEqual(f.gateSetV3, { ok: true, failed: [] }); assert.equal(f.compatibility.gate, false);
  assert.ok(text.length < 40000 && !/"px"|base64|b64/.test(text), "no pixel data in the repository");
  const c = JSON.parse(readFileSync(join(REPO, "tools", "avatar", "fixtures", "northstar-wardrobe", "base-figure-calls-v1.json"), "utf8"));
  assert.deepEqual([c.authorisedCalls.calls[2].outcome, c.budget.remaining], ["TECHNICAL_REJECT", 0], "C's historical rejection under v2 stays");
});

test("contract v3: FIT binding, COMPATIBILITY a report that never decides fit, QUALITY measured; every fit limit has its reason", () => {
  const c = BC.loadContractV3();
  assert.equal(c.axes.fit.binding, true); assert.equal(c.axes.compatibility.binding, false); assert.match(c.axes.compatibility.knownLimitation, /never a licence for the same fault in new items/);
  assert.match(c.replaces, /covers the base garment's INTERIOR/);
  for (const [k, v] of Object.entries(BC.FIT_LIMITS)) { assert.equal(typeof v.value, "number", k); assert.ok(v.why.length > 30, k + " has a reason"); }
  const src = readFileSync(join(REPO, "tools", "avatar", "northstar-base-figure-c.mjs"), "utf8");
  assert.ok(!/legacyReport\([^)]*\)[^;]*fitOk|fitOk[^;]*legacyReport/.test(src), "the old clothing never decides FIT");
});

test("gate set v3: BF9v3 and BF15v3 replace BF9v2 and BF15; a hole in a base garment and arms under the top's body fail BF15v3", () => {
  const ids = BF.checkBaseFigure(w, LEGS, Z, spec, "generated", "v3").checks.map((c) => c.id);
  assert.ok(ids.includes("BF9v3-BASE-TOP") && ids.includes("BF15v3-RUNTIME") && !ids.includes("BF15-DRESS-BACK") && !ids.includes("BF9v2-BASE-TOP"));
  const good = BF.bf15v3(w, BF.dustCleaned(LEGS), Z); assert.equal(good.ok, true, JSON.stringify(good.value));
  assert.equal(BF.bf15v3(w, BF.dustCleaned(LEGS), Z, { order: "arms-under" }).ok, false);
  const holed = new Uint8ClampedArray(LEGS); for (let y = 660; y < 700; y++) for (let x = 492; x < 532; x++) holed[(y * W + x) * 4 + 3] = 0;
  const h = BF.bf15v3(w, BF.dustCleaned(holed), Z); assert.equal(h.ok, false); assert.ok(h.value.enclosedHolePx > 1000, JSON.stringify(h.value));
  assert.match(spec.gatesV3.status, /ADOPTED/); assert.match(spec.gatesV3["BF15v3-RUNTIME"], /Northstar's old clothing is no longer part of this gate/);
});

test("the fit check on the stand-in base: minimum items fit; every fault stimulus fails on its own check", () => {
  const S = standInItems(w, base), want = { "FAULT-top-hole": "FIT-4-COVERAGE", "FAULT-shorts-too-short": "FIT-4-COVERAGE", "FAULT-sleeves-in-body-layer": "FIT-5-ORDER", "FAULT-top-over-hand": "FIT-3-PROTECT", "FAULT-shoes-lifted-20": "FIT-7-GROUND" };
  for (const [id, s] of Object.entries(S)) { if (s.expectFit === null) continue; const r = BC.fitCheck(w, base, T, s.category, s.layers), failed = r.checks.filter((c) => !c.ok).map((c) => c.id);
    assert.equal(r.fitOk, s.expectFit, id + " " + failed.join(",")); if (want[id]) assert.ok(failed.includes(want[id]), id + " fails " + want[id] + " (got " + failed.join(",") + ")"); }
  const T2 = T.top; let mc = 0, base1 = 0; for (let i = 0; i < N; i++) { if (T2.mustCover[i]) mc++; if (base.sep.lab[i] === 1) base1++; } assert.ok(mc > 0 && mc < base1, "mustCover is the interior: smaller than the base top");
});

test("the clothing pilot on C is prepared, not authorised: 9 items with the sleeveless top, shorts and sandals, 12 calls including 3 reserve", () => {
  const p = BC.loadPilotV3();
  assert.match(p.status, /PREPARED, NOT AUTHORISED/); assert.equal(p.items.length, 9);
  for (const c of ["top", "bottom", "shoes"]) assert.equal(p.items.filter((i) => i.category === c).length, 3, c);
  for (const id of ["top-tank-teal", "bottom-shorts-navy", "shoes-sandals-brown", "bottom-trousers-khaki", "top-sweater-green"]) assert.ok(p.items.some((i) => i.id === id), id);
  assert.deepEqual([p.calls.recommended, p.calls.items, p.calls.reserve], [12, 9, 3]);
  assert.match(p.request.images[0], /10f4a4b9/); assert.match(p.request.images[0], /never tracked/); assert.ok(p.request.never.includes("H1"));
  assert.match(p.request.promptTemplate, /Keep the background transparent/);
});

test("freezing and the fit proof refuse anything but C, and anything inside the repository", () => {
  assert.throws(() => BC.freeze(readFileSync(join(REPO, "assets", "avatar", "reference", "Northstar Master v2.png")), join(REPO, "..", "d205-probe-outside")), /not C/);
  assert.throws(() => BC.freeze(Buffer.from("x"), join(REPO, "tools", "avatar", "build", "d205-probe")), /inside the repository/);
  const out = join(REPO, "tools", "avatar", "build", "d205-refusal-probe");
  for (const tool of ["northstar-base-figure-c.mjs", "northstar-base-figure-c-proof.mjs"]) {
    const r = spawnSync(process.execPath, [join(REPO, "tools", "avatar", tool), tool.includes("proof") ? "--fit-proof" : "--freeze", join(REPO, "assets", "avatar", "reference", "Northstar Master v2.png"), "--out", out], { env: { PATH: process.env.PATH || "", SystemRoot: process.env.SystemRoot || "" }, encoding: "utf8" });
    assert.equal(r.status, 1, tool); assert.match(r.stderr, /REFUSED: --out is inside the repository/); }
  assert.equal(existsSync(out), false);
});
