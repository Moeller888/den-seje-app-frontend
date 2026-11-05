// D-351 — the offline production trial of the top cut kit (no private file needed): the 12 recipes are data (4 fabrics, 4 patterns, 4
// existing motifs; the planet marked as never approved), every swatch is deterministic and seamless; the kit's fabric sampler lays a
// solid swatch exactly as TM.render lays the colour (same mapping, alpha, shading, contour) and samples a pattern bilinearly; an rgb design
// still goes through TM.render unchanged; the representative light and dark pairs are on all three cuts' current lists; the trial
// refuses an --out inside the repository. Passing approves nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "../../js/avatar-layers.js";
import * as RC from "../../tools/avatar/northstar-top-cut-recipes.mjs";
import * as K from "../../tools/avatar/northstar-top-cut-kit.mjs";
import * as TM from "../../tools/avatar/northstar-tee-master.mjs";
import { representativePairs, cutPairs, CUTS } from "../../tools/avatar/northstar-top-cut-production-trial.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."), W = 1024, N = W * 1536, sha = (b) => createHash("sha256").update(b).digest("hex");
const RECIPES = JSON.parse(readFileSync(join(REPO, ...RC.RECIPES_FILE.split("/")), "utf8"));

test("D-351 the recipes: 12 as data (4 fabric, 4 pattern, 4 motif), only allowed motifs, the planet marked as never approved", () => {
  assert.doesNotThrow(() => RC.checkRecipes(RECIPES)); assert.deepEqual(RECIPES.cuts, CUTS); assert.deepEqual(CUTS, ["tee-hip", "sweater-long", "tank-v3"]);
  assert.match(RECIPES.kind, /36 CANDIDATES, NOT approved, NOT published/);
  assert.deepEqual(RECIPES.recipes.filter((r) => r.motif).map((r) => r.motif), ["teapot", "shield", "fox", "planet"]);
  assert.match(RC.MOTIFS.planet.standing, /NEVER approved/); for (const m of ["teapot", "shield", "fox"]) assert.match(RC.MOTIFS[m].standing, /owner-approved/);
  const bad = structuredClone(RECIPES); bad.recipes[11].motif = "rocket"; assert.throws(() => RC.checkRecipes(bad), /motif must be one of/);
  const bad2 = structuredClone(RECIPES); bad2.recipes.pop(); assert.throws(() => RC.checkRecipes(bad2), /12 recipes/);
});

test("D-351 every swatch is deterministic and seamless", () => {
  for (const r of RECIPES.recipes) { const a = RC.swatchOf(r.fabric), b = RC.swatchOf(r.fabric);
    assert.equal(sha(a.px), sha(b.px), r.id); assert.equal(a.px.length, a.w * a.h * 4); assert.ok(RC.seamless(a).ok, r.id + " " + JSON.stringify(RC.seamless(a)));
    for (let i = 3; i < a.px.length; i += 4) assert.equal(a.px[i], 255, r.id + ": opaque"); }
});

// a synthetic cut: a body panel with shading and a soft fold displacement, and a contour ring
function synth() {
  const t = { core: new Uint8Array(N), alpha: new Uint8Array(N), contour: new Uint8ClampedArray(N * 4) }, panel = new Int8Array(N).fill(-1), ratio = new Float32Array(N), disp = new Float32Array(N * 2);
  for (let y = 500; y < 700; y++) for (let x = 400; x < 620; x++) { const i = y * W + x; t.core[i] = 1; t.alpha[i] = 255; panel[i] = 0; ratio[i] = 0.8 + 0.2 * Math.sin(x / 17); disp[i * 2 + 1] = 2.3 * Math.sin(x / 23);
    if (x === 400 || x === 619 || y === 500 || y === 699) t.contour.set([20, 18, 16, 255], i * 4); }
  return { t, master: { panel, ratio, disp, axes: [] } };
}

test("D-351 the kit's fabric sampler: a solid swatch equals TM.render's colour; a pattern is sampled bilinearly (no whole-pixel step)", () => {
  const { t, master } = synth(), base = { arms: new Uint8ClampedArray(N * 4) };
  const a = TM.render(master, t, base, null, { body: [70, 100, 140] }).layer, b = K.renderFabric(master, t, RC.swatchOf({ type: "solid", base: [70, 100, 140] })).layer;
  let d = 0; for (let i = 0; i < N * 4; i++) d = Math.max(d, Math.abs(a[i] - b[i])); assert.ok(d <= 1, "max diff " + d);
  const stripes = RC.swatchOf({ type: "stripes", base: [240, 240, 240], second: [20, 20, 20], period: 20, share: 0.5 }), s = K.renderFabric(master, t, stripes).layer, n = TM.render(master, t, base, null, { body: stripes }).layer;
  const levels = (L0) => { const v = new Set(); for (let y = 510; y < 690; y++) v.add(L0[(y * W + 450) * 4]); return v.size; };
  assert.ok(levels(s) > levels(n), "bilinear sampling gives intermediate levels at the stripe edges");
  for (let i = 0; i < N; i++) assert.equal(s[i * 4 + 3], t.alpha[i]);
  assert.equal(K.FABRIC_SAMPLER, "kit-fabric-bilinear-v1");
});

test("D-351 an rgb design still goes through TM.render unchanged (the approved items' path)", () => {
  const { t, master } = synth(), E = { base: { arms: new Uint8ClampedArray(N * 4), body: new Uint8ClampedArray(N * 4) } }, c = { sleeves: { layerSplitFromArmAlpha: 128 }, print: { boxOnC: [440, 540, 100, 100] } };
  const r = K.renderDesign({ c, t, master, E, bands: null }, { rgb: [158, 160, 164] }), ref = TM.render(master, t, E.base, null, { body: [158, 160, 164] }).layer;
  for (let i = 0; i < N * 4; i++) if (r.layer[i] !== ref[i]) assert.fail("byte " + i);
});

test("D-351 the representative pairs are on all three cuts' current lists (no combination added); the trial refuses an --out in the repo", () => {
  const P = representativePairs(L), lists = cutPairs(L);
  assert.deepEqual(P, { light: { bottom: "bottom-trousers-square-sand", shoes: "shoes-sneakers-white" }, dark: { bottom: "bottom-trousers-square-navy", shoes: "shoes-boots-laceup-black" } });
  for (const c of CUTS) for (const p of Object.values(P)) assert.ok(lists[c].has(p.bottom + "|" + p.shoes), c);
  const r = spawnSync(process.execPath, [join(REPO, "tools", "avatar", "northstar-top-cut-production-trial.mjs"), "--phase", "views", "--out", join(REPO, "tmp-d351")], { cwd: REPO, encoding: "utf8", windowsHide: true, timeout: 60000 });
  assert.equal(r.status, 1); assert.match(r.stderr, /--out must be outside the repository/);
  assert.equal(L.AVATAR_NORTHSTAR_WARDROBE, false);
});
