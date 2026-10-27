// NORTHSTAR BASE FIGURE — D-204: the runtime layering proof. BF15 (D-198) composed Northstar's defaults over a body that still
// CONTAINS the base garments, while D-198's runtime model leaves them empty; this file tests the tools that separate the base
// garments from the visible body, dress the runtime body WITHOUT them, and classify every open pixel (background, enclosed hole,
// exposed cut skin, missing material), and the PROPOSED BF15r with its control items. Northstar-derived inputs only — the
// private candidates never enter the repository or CI (D-127 §2). Nothing is adopted; the recorded results stay as they are.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as BF from "../../tools/avatar/northstar-base-figure.mjs";
import { recolour } from "../../tools/avatar/northstar-wardrobe-poc.mjs";
import * as NL from "../../tools/avatar/r3-northstar-layers.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const w = WR.buildWardrobe(), spec = BF.loadSpec(), Z = BF.zones(w, spec), { W, H, N } = WR, L = w.base.layers, A = w.anchors, M = w.fg.master;
// a synthetic figure WITH legs: Northstar whose jeans below the crotch are recoloured to skin (value kept), so a runtime body has thighs
const LEGS = (() => { const legs = new Uint8ClampedArray(L.pants); for (let i = 0; i < (A.crotchY + 10) * W; i++) legs[i * 4 + 3] = 0; return NL.overStack([M, recolour(legs, { h: 33, s: 0.51, vScale: 1.3 })]); })();

test("BF15 as built in D-198 dresses a body that still contains the base garments — the construction D-204 corrects", () => {
  const src = readFileSync(join(REPO, "tools", "avatar", "northstar-base-figure.mjs"), "utf8");
  assert.match(src, /const dressed = NL\.overStack\(\[body, L\.shoes, L\.pants, L\["top-body"\], L\["top-sleeves"\]\]\)/, "BF15 composes the defaults over `body`");
  const cand = recolour(M, { h: 0, s: 0 }), r = BF.recompose(w, cand); let garment = 0; for (let i = 0; i < N; i++) if (r.body[i * 4 + 3] >= 128 && BF.classify(r.body, i) === "garment") garment++;
  assert.ok(garment > 10000, "…and that body keeps every garment pixel of the candidate");
  const c = JSON.parse(readFileSync(join(REPO, "tools", "avatar", "fixtures", "northstar-wardrobe", "base-figure-calls-v1.json"), "utf8"));
  assert.deepEqual(c.authorisedCalls.calls.map((e) => e.outcome), ["TECHNICAL_REJECT", c.authorisedCalls.calls[1].outcome, "TECHNICAL_REJECT"], "the recorded rejections stay");
  assert.deepEqual([c.budget.actuallySent, c.budget.remaining], [2, 0]);
});

test("separateBase: removes only non-skin base pixels; never a skin pixel; top above and shorts below the seam", () => {
  const { lab } = BF.separateBase(M, Z); let skinRemoved = 0, top = 0, bot = 0, topLow = 0, botHigh = H;
  for (let i = 0; i < N; i++) { if (!lab[i]) continue; if (BF.classify(M, i) === "skin") skinRemoved++; const y = (i / W) | 0; if (lab[i] === 1) { top++; topLow = Math.max(topLow, y); } else { bot++; botHigh = Math.min(botHigh, y); } }
  assert.equal(skinRemoved, 0); assert.ok(top > 50000 && bot > 80000, top + " / " + bot);
  assert.ok(botHigh > 700, "no top outline is labelled shorts (the colour of an outline does not decide)");
});

test("runtimeBody: the arm layer grows from the arms and hands — a thigh in the arm columns stays in the body layer, under the bottoms", () => {
  const { lab } = BF.separateBase(LEGS, Z), { body, arms } = BF.runtimeBody(w, LEGS, lab);
  let thighInArms = 0, thighInBody = 0; for (let y = A.crotchY + 15; y < A.crotchY + 120; y++) for (let x = 360; x < A.torsoX[0]; x++) { const i = y * W + x; if (L.pants[i * 4 + 3] < 128) continue; if (arms[i * 4 + 3]) thighInArms++; if (body[i * 4 + 3]) thighInBody++; }
  assert.equal(thighInArms, 0); assert.ok(thighInBody > 0, "the synthetic thigh exists in the arm columns (" + thighInBody + " px) and stays in the body");
  let handInArms = 0; for (let i = 0; i < N; i++) if (L.hands[i * 4 + 3] >= 128 && arms[i * 4 + 3]) handInArms++; assert.ok(handInArms > 1000);
  let baseLeft = 0; for (let i = 0; i < N; i++) if (lab[i] && (body[i * 4 + 3] || arms[i * 4 + 3])) baseLeft++; assert.equal(baseLeft, 0, "the base garments are empty in the runtime body");
});

test("PROPOSED BF15r on its control items: exact minimum items pass; a hole and a cut-off bottom fail", () => {
  for (const [id, c] of Object.entries(BF.bf15rControlItems(w, LEGS, Z))) { const q = BF.bf15r(w, BF.layerProof(w, LEGS, Z, c.items), { silhouette: false }); assert.equal(q.ok, c.expect, id + " " + JSON.stringify(q.value)); }
  const hole = BF.bf15r(w, BF.layerProof(w, LEGS, Z, BF.bf15rControlItems(w, LEGS, Z)["bottoms-with-hole"].items), { silhouette: false });
  assert.ok(hole.value.enclosedHolePx + hole.value.deepOpenBasePx > 1000, JSON.stringify(hole.value)); assert.match(BF.bf15r(w, BF.layerProof(w, LEGS, Z)).status, /PROPOSED — not adopted/);
  assert.equal(BF.FABRIC_BAND_PX, 4);
});

test("the layering report and the minimum areas: masks only, written only outside the repository", () => {
  const { lab } = BF.separateBase(LEGS, Z), m = BF.minimumAreas(lab); let t = 0, s = 0; for (let i = 0; i < N; i++) { if (m.sleevelessTop[i]) t++; if (m.shorts[i]) s++; } assert.ok(t > 0 && s > 0);
  const out = join(REPO, "tools", "avatar", "build", "d204-refusal-probe");
  const r = spawnSync(process.execPath, [join(REPO, "tools", "avatar", "northstar-base-figure.mjs"), "--layers", join(REPO, "assets", "avatar", "reference", "Northstar Master v2.png"), "--out", out], { env: { PATH: process.env.PATH || "", SystemRoot: process.env.SystemRoot || "" }, encoding: "utf8" });
  assert.equal(r.status, 1); assert.match(r.stderr, /REFUSED: --out is inside the repository/); assert.equal(existsSync(out), false);
  assert.match(spec.layeringD204.status, /PROPOSALS — nothing adopted/); assert.match(spec.layeringD204.bf9, /no revision is proposed/);
});
