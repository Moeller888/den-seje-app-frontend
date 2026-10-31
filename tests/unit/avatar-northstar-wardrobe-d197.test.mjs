// NORTHSTAR WARDROBE — D-197: one fixed Northstar v2 body and pose for generated clothing items. The base is NOT a bare body:
// Northstar's own painted outfit is decomposed into the DEFAULT item of three mandatory categories (top, pants, shoes); arms,
// hands and the head stack stay the base. The tests prove the decomposition is a complete, lossless partition, the anchors are
// ordered, the default items pass the gates while a cropped top, a soft blur and drift are caught, the extraction recovers an
// item from a simulated generator picture, and the pilot batch is prepared but NOT authorised. No image call; R3 stays OFF.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pixelSha256 } from "../../tools/avatar/r3-hair-tool-v2.mjs";
import * as NL from "../../tools/avatar/r3-northstar-layers.mjs";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import { recolour } from "../../tools/avatar/northstar-wardrobe-poc.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const file = (rel) => readFileSync(join(REPO, ...rel.split("/")), "utf8");
const w = WR.buildWardrobe(), { N, W, H } = WR, L = w.base.layers, T = w.templates, C = w.contract;
const topDefault = NL.overStack([L["top-body"], L["top-sleeves"]]);

test("the contract binds the tracked Northstar v2 and names no H1 and no bare body", () => {
  assert.equal(C.source.sha256, WR.sourceSha256());
  assert.equal(C.decision, "D-197");
  assert.ok(C.notUsed.some((s) => /H1/.test(s)));
  assert.deepEqual(Object.keys(C.categories), ["top", "pants", "shoes"]);
  for (const c of Object.values(C.categories)) assert.equal(c.mandatory, true, "every category is mandatory: the figure is never without clothes");
  assert.match(C.outOfScope, /shorts/);
  for (const f of ["tools/avatar/northstar-wardrobe.mjs", "tools/avatar/northstar-wardrobe-poc.mjs"]) { const s = file(f); assert.ok(!/fitting-base|H1\.png/.test(s), f + ": no H1"); assert.ok(!/openai|api\.openai|fetch\(\s*["'`]https/i.test(s), f + ": no image call code"); }
});

test("decomposition: a complete partition of the reference body into the six body layers; recomposed it IS the D-194 figure", () => {
  let body = 0, sum = 0; for (let i = 0; i < N; i++) { if (w.body[i * 4 + 3]) body++; let k = 0; for (const n of ["shoes", "pants", "top-body", "arms", "top-sleeves", "hands"]) if (L[n][i * 4 + 3]) k++; assert.ok(k <= 1); sum += k; }
  assert.equal(sum, body, "every body pixel in exactly one layer");
  assert.equal(pixelSha256(WR.composeOutfit(w.base, w.head)), pixelSha256(NL.overStack([w.body, w.head])));
  assert.deepEqual([...WR.STACK], ["shoes", "pants", "top-body", "arms", "top-sleeves", "hands", "head", "hair"]);
});

test("anchors: neck, shoulders, sleeves, wrists, waist, crotch, ankles and ground in order", () => {
  const A = w.anchors;
  assert.ok(A.neckSeamY < A.bbox.top.y0 && A.bbox.top.y0 < A.collarY && A.collarY < A.shoulder.y);
  for (const s of ["left", "right"]) { assert.ok(A.shoulder.y < A.sleeveEndY[s] && A.sleeveEndY[s] < A.wristY[s]); assert.ok(A.crotchY < A.shoeTopY[s] && A.shoeTopY[s] < A.ankleY[s] && A.ankleY[s] < A.groundY); }
  assert.ok(A.waistbandY < A.waistHemY && A.waistHemY < A.crotchY, "the top's hem overlaps the pants' waistband");
  assert.ok(A.torsoX[0] < A.centreX && A.centreX < A.torsoX[1]);
});

test("gates: the three defaults pass; a cropped top, a soft blur and a foreign silhouette fail", () => {
  for (const [cat, P] of [["top", topDefault], ["pants", L.pants], ["shoes", L.shoes]]) { const r = WR.checkItem(cat, WR.splitItem(cat, P, T), T, C); assert.equal(r.ok, true, cat + " " + JSON.stringify(r.checks.filter((c) => !c.ok))); }
  const cropped = new Uint8ClampedArray(topDefault); for (let i = 0; i < N; i++) if (((i / W) | 0) >= w.anchors.waistHemY - 70) cropped[i * 4 + 3] = 0;
  assert.equal(WR.checkItem("top", WR.splitItem("top", cropped, T), T, C).checks.find((c) => c.id === "I2-COVERAGE").ok, false, "a cropped top would reveal a body the base does not have");
  assert.equal(WR.checkItem("top", WR.splitItem("top", WR.blur3(topDefault), T), T, C).checks.find((c) => c.id === "I7-SHARPNESS").ok, false, "a soft upscale is caught");
  const shifted = new Uint8ClampedArray(N * 4); for (let i = 0; i < N - 60 * W; i++) shifted.set(L.shoes.subarray(i * 4, i * 4 + 4), (i + 60 * W) * 4);
  const s = WR.checkItem("shoes", { shoes: shifted }, T, C); assert.equal(s.ok, false, "shoes off the ground line fail"); assert.equal(s.checks.find((c) => c.id === "I8-GROUND").ok, false);
});

test("extraction: a simulated generator picture (one category repainted, opaque on the key, shifted) yields a passing item; drift is rejected", () => {
  const item = WR.splitItem("top", recolour(topDefault, { h: 2, s: 0.62 }), T), R = WR.referencePictures(w, "top"), key = C.extraction.key;
  const pic = WR.onKey(WR.composeOutfit(w.base, w.head, { ...R.others, top: item }), key), shift = (P, dx, dy) => { const o = new Uint8ClampedArray(N * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const sx = Math.min(W - 1, Math.max(0, x - dx)), sy = Math.min(H - 1, Math.max(0, y - dy)); o.set(P.subarray((sy * W + sx) * 4, (sy * W + sx) * 4 + 4), (y * W + x) * 4); } return o; };
  const r = WR.extractItem("top", shift(pic, 3, -2), R.ref, T, C, R.behind);
  assert.deepEqual([r.registration.dx, r.registration.dy, r.registration.ok], [3, -2, true]);
  assert.equal(WR.checkItem("top", r.layers, T, C).ok, true);
  const A = WR.composeOutfit(w.base, w.head, { top: item }), B = WR.composeOutfit(w.base, w.head, { top: r.layers }); let px = 0, big = 0; for (let i = 0; i < N; i++) { if (!A[i * 4 + 3] && !B[i * 4 + 3]) continue; px++; if (Math.max(...[0, 1, 2, 3].map((c) => Math.abs(A[i * 4 + c] - B[i * 4 + c]))) > 48) big++; }
  assert.ok(big / px < 0.005, `the extracted item reproduces the truth in the outfit (${big} px > 48)`);
  assert.equal(WR.extractItem("top", shift(R.ref, 10, 0), R.ref, T, C, R.behind).layers, null, "a 10 px drift is rejected, never warped into place");
});

test("the D-197 pilot batch was never authorised and is superseded by pilot-plan-v2 (D-198): 12 items, at most 24 calls, no credentials", () => {
  assert.match(JSON.parse(file("tools/avatar/fixtures/northstar-wardrobe/pilot-batch-v1.json")).status, /SUPERSEDED/);
  const p = JSON.parse(file("tools/avatar/fixtures/northstar-wardrobe/pilot-batch-v1.json"));
  assert.match(p.status, /NOT AUTHORISED/);
  assert.equal(p.items.length, 12);
  for (const c of ["top", "pants", "shoes"]) assert.equal(p.items.filter((i) => i.category === c).length, 4, c);
  assert.equal(p.calls.maxCalls, 24); assert.equal(p.inputs.imagesPerCall, 1);
  assert.match(p.promptTemplate, /Do not use magenta/); assert.match(p.promptTemplate, /No text, letters, numbers, logos/);
  assert.ok(!/sk-[A-Za-z0-9]|api[_-]?key/i.test(JSON.stringify(p)));
});
