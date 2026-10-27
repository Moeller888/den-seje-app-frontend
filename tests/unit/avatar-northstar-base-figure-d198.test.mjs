// NORTHSTAR BASE FIGURE — D-198: the target, provenance and acceptance check for ONE shared Northstar-style base figure in
// neutral, close-fitting base clothing with continuous arms, legs and feet. No base figure exists and no image call is made:
// the tests prove the prepared request is pinned and not authorised, the zones and contract v2 are consistent, the clothed
// Northstar fails EXACTLY the limb and base-garment gates D-197 could not meet, registration recovers a small shift and rejects
// a large one, a sleeve merely recoloured to skin and a soft image are caught, and the limb gates pass on Northstar's own bare
// forearms (the only bare limb that exists). H1 is never read; R3 stays default OFF.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as BF from "../../tools/avatar/northstar-base-figure.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const file = (rel) => readFileSync(join(REPO, ...rel.split("/")), "utf8");
const w = WR.buildWardrobe(), spec = BF.loadSpec(), Z = BF.zones(w, spec), { W, N } = WR, S = BF.stimuli(w);
const run = (id) => BF.checkBaseFigure(w, S[id].image, Z, spec), byId = (r) => Object.fromEntries(r.checks.map((c) => [c.id, c]));
const PROMPT_SHA256 = "8076c3d1a6f7fd141af3fbacd9f7a8f21b8aa6bc8d6ead0dd018a2172f61fd99";

test("the base-figure request is prepared and pinned by D-198; its calls exist only through D-199: one image, transparent, sunburst, 2 calls", () => {
  assert.equal(spec.decision, "D-198"); assert.match(spec.status, /IMAGE CALLS AUTHORISED ONLY BY D-199/); assert.match(spec.status, /NO BASE FIGURE EXISTS/);
  assert.equal(spec.source.sha256, WR.sourceSha256());
  assert.equal(createHash("sha256").update(BF.promptBytes()).digest("hex"), PROMPT_SHA256, "the prompt is byte-pinned");
  const prompt = BF.promptBytes().toString("utf8");
  for (const must of ["sleeveless", "mid-thigh", "bare feet", "natural waist", "No navel", "Keep the background transparent", "The head stays exactly where it is"]) assert.ok(prompt.includes(must), must);
  assert.ok(!/\bchild|\bkid|\bboy|\bgirl/i.test(prompt), "the prompt names an avatar illustration, never a child");
  const p = BF.loadPilot(), p0 = p.phases[0];
  assert.match(p.status, /P2 PREPARED, NOT AUTHORISED/); assert.equal(p0.id, "P0-base-figure"); assert.match(p0.status, /AUTHORISED by D-199/); assert.equal(p0.callsRequested, 2);
  assert.equal(p0.request.model, "gpt-image-2.5-sunburst-2026-09-08"); assert.equal(p0.request.parameters.background, "transparent"); assert.equal(p0.request.parameters.size, "1024x1536");
  assert.equal(p0.request.images.length, 1); assert.ok(p0.request.never.includes("mask"));
  const p2 = p.phases.find((x) => x.id === "P2-clothing-pilot"), forms = p2.items.map((i) => i.form).join(" | ");
  for (const f of ["sleeveless", "shorts", "skirt", "sandals"]) assert.ok(forms.includes(f), "the clothing pilot tests " + f);
  assert.ok(p.phases.findIndex((x) => x.id === "P0-base-figure") < p.phases.findIndex((x) => x.id === "P2-clothing-pilot"), "the base figure comes first");
  assert.match(p2.calls, /NOT REQUESTED/);
  for (const f of ["tools/avatar/northstar-base-figure.mjs"]) { const s = file(f); assert.ok(!/fitting-base|H1\.png/.test(s), f + ": no H1"); assert.ok(!/openai|fetch\(/i.test(s), f + ": no image call code"); }
  assert.match(spec.storage.rule, /D-127 §2/);
});

test("contract v2: base garments are the minimum, layers in front of and behind the arms and hands, shoes cover nothing", () => {
  const c = BF.loadContractV2(), stack = c.stack.map((l) => l.layer), z = (k) => stack.indexOf(k);
  assert.match(c.status, /NOT a production standard/);
  for (const k of ["back", "body", "shoes", "bottoms", "shoes-over", "top-body", "bottoms-over", "arms", "top-sleeves", "hands", "hands-over", "head", "hair", "headwear"]) assert.ok(z(k) >= 0, k);
  assert.ok(z("back") < z("body") && z("top-body") < z("arms") && z("arms") < z("top-sleeves") && z("top-sleeves") < z("hands") && z("hands") < z("hands-over") && z("bottoms") < z("top-body") && z("top-body") < z("bottoms-over") && z("shoes") < z("bottoms") && z("bottoms") < z("shoes-over"));
  assert.equal(c.categories.top.required, true); assert.equal(c.categories.bottom.required, true);
  assert.match(c.categories.shoes.mustCover, /nothing/);
  for (const f of ["sleeveless", "waist-length"]) assert.ok(c.categories.top.forms.includes(f)); for (const f of ["shorts", "skirt"]) assert.ok(c.categories.bottom.forms.includes(f)); assert.ok(c.categories.shoes.forms.includes("sandals"));
  assert.match(JSON.parse(file("tools/avatar/fixtures/northstar-wardrobe/contract-v1.json")).experiment, /NOT proven on any GPT-generated item/);
});

test("zones: the two minimum regions overlap at the natural waist, lie inside Northstar's tee and jeans, and miss every limb zone", () => {
  let topLow = 0, hipHigh = 1e9, clash = 0; for (let i = 0; i < N; i++) { const y = (i / W) | 0; if (Z.topCore[i]) topLow = Math.max(topLow, y); if (Z.hipCore[i]) hipHigh = Math.min(hipHigh, y); if ((Z.topCore[i] || Z.hipCore[i]) && (Z.armZone[i] || Z.legZone[i] || Z.footZone[i])) clash++; }
  assert.ok(hipHigh < topLow, `top core reaches y ${topLow}, shorts core starts at y ${hipHigh}: they overlap, so no combination opens a gap at the waist`);
  assert.equal(clash, 0);
  const L = w.base.layers; let outTee = 0, outJeans = 0; for (let i = 0; i < N; i++) { if (Z.topCore[i] && L["top-body"][i * 4 + 3] < 250) outTee++; if (Z.hipCore[i] && !L.pants[i * 4 + 3] && !L["top-body"][i * 4 + 3]) outJeans++; }
  assert.equal(outTee, 0); assert.equal(outJeans, 0, "inside Northstar's clothes, so D-197's defaults can dress the base back (BF15)");
  assert.deepEqual(Z.skinRef, [253, 194, 124]);
});

test("the clothed Northstar is NOT a base figure: pose, registration and quality pass; arms, legs, feet, base garments and skin fail", () => {
  const r = byId(run("northstar"));
  for (const k of ["BF1-FORMAT", "BF2-REGISTRATION", "BF3-NECK-JOIN", "BF4-POSE", "BF5-ENVELOPE", "BF12-OUTLINE", "BF13-SHARPNESS", "BF14-ALPHA", "BF15-DRESS-BACK"]) assert.equal(r[k].ok, true, k + " " + JSON.stringify(r[k].value));
  for (const k of ["BF6-ARMS", "BF7-LEGS", "BF8-FEET", "BF9-BASE-TOP", "BF10-BASE-SHORTS", "BF11-SKIN-TONE"]) assert.equal(r[k].ok, false, k);
  assert.equal(r["BF9-BASE-TOP"].value.coverage, 1, "the tee covers the chest band — it only ends at t-shirt length");
  assert.ok(r["BF10-BASE-SHORTS"].value.hemY.left > spec.targets.baseShortsHemY[1], "the jeans run to the ankle, not mid-thigh");
});

test("registration recovers a small shift and rejects a large one — never a warp", () => {
  const a = run("shift-3-2"); assert.deepEqual([a.registration.dx, a.registration.dy, a.registration.ok], [-3, 2, true]);
  assert.equal(byId(a)["BF4-POSE"].ok, true, "after the integer shift the pose is Northstar's again");
  const b = run("shift-12-0"); assert.equal(b.ok, false); assert.equal(b.registration.ok, false); assert.equal(b.checks.length, 2, "nothing else is evaluated on an unregistered candidate");
});

test("adjustment cannot hide a wrong body: a sleeve recoloured to skin fails BF6 on its hem line; a soft image fails the quality gates", () => {
  const s = byId(run("sleeves-as-skin"))["BF6-ARMS"];
  assert.equal(s.ok, false); for (const side of ["left", "right"]) { assert.ok(s.value[side].garmentShare <= spec.gates.maxGarmentShareInLimbZone, "it no longer looks like a garment…"); assert.ok(s.value[side].maxInkRowShare > spec.gates.maxInkRowShare, "…but its hem still runs across the arm"); }
  const b = byId(run("blur")); assert.equal(b["BF12-OUTLINE"].ok, false); assert.equal(b["BF13-SHARPNESS"].ok, false);
  const c = BF.visibleSkinControl(w, spec); assert.equal(c.left.ok, true, JSON.stringify(c.left)); assert.equal(c.right.ok, true, JSON.stringify(c.right));
});

test("provenance: every Northstar pixel gets exactly one class; the head is kept, the base garments are new", () => {
  const lab = BF.provenanceExpected(w, Z), seen = new Set(), M = w.fg.master; let unl = 0;
  for (let i = 0; i < N; i++) { if (lab[i]) seen.add(lab[i]); else if (M[i * 4 + 3] >= 128 && i >= 441 * W) unl++; }
  assert.equal(unl, 0); for (const k of ["original-kept", "original-reference", "reconstructed", "new", "open"]) assert.ok(seen.has(k), k);
  for (let i = 0; i < N; i++) if (Z.topCore[i] || Z.hipCore[i]) assert.equal(lab[i], "new");
});
