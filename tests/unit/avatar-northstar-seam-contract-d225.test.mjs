// D-225: the seam contract between item categories on C (seam-contract-v1) — the contract check per item, TEMPLATE items that
// comply and combine at every seam, one violation template per rule that fails its rule and shows in a combination, the outfit
// check's double contour as written (gaps up to 3 px; D-223's revision kept), the fixtures (contract, instructions, validation plan)
// and the classified findings. On the CI stand-in (C is private, D-127 §2); the run on C is recorded in item-method-results-d225.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as BF from "../../tools/avatar/northstar-base-figure.mjs";
import * as BC from "../../tools/avatar/northstar-base-figure-c.mjs";
import * as IP from "../../tools/avatar/northstar-item-pilot.mjs";
import * as ST from "../../tools/avatar/northstar-seam-templates.mjs";
import { recolour } from "../../tools/avatar/northstar-wardrobe-poc.mjs";
import * as NL from "../../tools/avatar/r3-northstar-layers.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."), fixture = (n) => JSON.parse(readFileSync(join(REPO, "tools", "avatar", "fixtures", "northstar-wardrobe", n), "utf8"));
const w = WR.buildWardrobe(), L = w.base.layers, A = w.anchors, { W, N } = WR;
const LEGS = (() => { const legs = new Uint8ClampedArray(L.pants); for (let i = 0; i < (A.crotchY + 10) * W; i++) legs[i * 4 + 3] = 0; return NL.overStack([w.fg.master, recolour(legs, { h: 33, s: 0.51, vScale: 1.3 })]); })();
const base = BC.prepareBase(w, LEGS), T = BC.templatesC(w, base, { revision: "d213" }), min = BF.minimumItems(base.R, base.sep.lab), TP = ST.seamTemplates(w, base, T);
const compose = (t, b, s) => BF.layerProof(w, base.R, base.Z, { ...min, ...t, ...b, ...s }, { sep: base.sep, headSeam: "d201", hide: BC.closedFootwearHidden(base, s.shoes), enclosure: "c-exterior" });

test("D-225 the contract fixture is the code's contract; instructions separate what the model draws from what the composition enforces", () => {
  const C = fixture("seam-contract-v1.json"); assert.deepEqual(C.parameters, { ...BC.SEAM_CONTRACT_V1 }); assert.equal(C.version, BC.SEAM_CONTRACT_V1.version);
  for (const z of ["waist/hip", "sleeve/wrist", "trousers/shoes"]) { assert.ok(C.zones[z].visibleEdgeOwner, z); assert.ok(C.zones[z].bodyAndShadow, z); }
  assert.deepEqual(Object.keys(C.modelDraws), ["top", "bottoms", "shoes"]); assert.ok(C.compositionEnforces.length >= 5);
  assert.ok(C.limits.some((l) => /does not prove that a model can draw/.test(l)), "a template is not evidence for a generated item");
});

test("D-225 TEMPLATE items that follow the contract comply and combine at every seam: 2 tops × 3 bottoms × 2 shoes, all outfit checks OK", () => {
  for (const [id, Lr] of Object.entries(TP.compliant)) { const r = BC.contractCheck(w, base, T, ST.CATEGORY_OF(id), Lr); assert.ok(r.ok, id + " " + JSON.stringify(r.checks.filter((c) => !c.ok))); }
  const C = TP.compliant; let n = 0;
  for (const t of ["TEMPLATE-top-waist", "TEMPLATE-top-hip"]) for (const b of ["TEMPLATE-bottom-cropped", "TEMPLATE-bottom-waistband", "TEMPLATE-bottom-full"]) for (const s of ["TEMPLATE-shoes-low", "TEMPLATE-shoes-boot"]) {
    const oc = BC.outfitCheck(w, base, compose(C[t], C[b], C[s])); assert.ok(oc.ok, [t, b, s].join(" + ") + " " + JSON.stringify(oc.checks.filter((c) => !c.ok)).slice(0, 400)); n++; }
  assert.equal(n, 12);
});

test("D-225 each violation template fails its own rule and shows as a double contour with a compliant partner", () => {
  const C = TP.compliant, rule = { "VIOLATION-top-hem-W+10": "SC-W1", "VIOLATION-bottom-line-at-hip-station": "SC-W4", "VIOLATION-top-hip-narrow": "SC-W1", "VIOLATION-bottom-full-rounded": "SC-L1", "VIOLATION-shoes-boot-wide": "SC-L3" };
  assert.deepEqual(Object.keys(TP.violating).sort(), Object.keys(rule).sort());
  for (const [id, v] of Object.entries(TP.violating)) { const cat = ST.CATEGORY_OF(id), r = BC.contractCheck(w, base, T, cat, v.item);
    assert.ok(r.checks.some((c) => !c.ok && c.id.startsWith(rule[id])), id + " fails " + rule[id] + ": " + JSON.stringify(r.checks.filter((c) => !c.ok).map((c) => c.id)));
    const parts = { top: C["TEMPLATE-top-hip"], bottom: C["TEMPLATE-bottom-full"], shoes: C["TEMPLATE-shoes-low"] }; parts[cat] = v.item; parts[ST.CATEGORY_OF(v.partner)] = C[v.partner];
    const oc = BC.outfitCheck(w, base, compose(parts.top, parts.bottom, parts.shoes)); assert.equal(oc.checks.find((c) => c.id === "COMBO-2-DOUBLE-CONTOUR").ok, false, id + " + " + v.partner); }
});

test("D-225 the outfit check's double contour finds a 3 px gap as written; D-223's revision (2 px) is kept for its record", () => {
  // a full trouser whose hem corners narrow to C's leg, over a white low shoe at C's leg ± 6: 3 px of shoe fabric between the outlines
  const v = TP.violating["VIOLATION-bottom-full-rounded"], P = compose(TP.compliant["TEMPLATE-top-hip"], v.item, TP.compliant["TEMPLATE-shoes-low"]);
  const d225 = BC.outfitCheck(w, base, P), d223 = BC.outfitCheck(w, base, P, { revision: "d223" }), g = (r) => r.checks.find((c) => c.id === "COMBO-2-DOUBLE-CONTOUR").ok;
  assert.deepEqual([g(d223), g(d225)], [true, false]);
  assert.equal(IP.METHODS.d223.outfitRevision, "d223"); assert.equal(IP.METHODS.d225.outfitRevision, "d225"); assert.equal(IP.METHOD, "d225");
});

test("D-225 seam lines come from C, not from an item: the waist line is robust to a stray label pixel; C's own base top meets the waist rule", () => {
  const Ln = BC.seamLines(w, base, T), cols = Object.keys(Ln.waist).map(Number); assert.ok(cols.length > 150);
  let jump = 0; for (const x of cols) if (Ln.waist[x + 1] !== undefined) jump = Math.max(jump, Math.abs(Ln.waist[x + 1] - Ln.waist[x])); assert.ok(jump <= 6, "a smooth waist line (largest step " + jump + ")");
  const r = BC.contractCheck(w, base, T, "top", { topBody: min.topBody, sleeves: min.sleeves }); assert.ok(r.checks.find((c) => c.id === "SC-W1-TOP-HEM-STATION").ok, "C's base top lies on C's waist line");
});

test("D-225 the validation plan: at most six new items, each aimed at a documented seam and reused across items; nothing authorised", () => {
  const P = fixture("seam-validation-plan-v1.json"); assert.deepEqual([P.authorisesImageRequest, P.calls], [false, 0]); assert.match(P.status, /not authorised/);
  assert.ok(P.items.length <= P.maxNewItems && P.maxNewItems === 6);
  for (const it of P.items) { assert.ok(it.seams.length && it.reuse.length >= 3 && /SC-/.test(it.tests), it.id); }
  const why = P.items.map((it) => it.why).join(" "); for (const f of ["F-006", "F-007", "F-010", "F-011", "F-012"]) assert.ok(why.includes(f), f + " is addressed");
});

test("D-225 the combination findings are classified: missing fabric, an intended body part, the order, the overlap or an extraction remnant — and the rule that covers each", () => {
  const reg = fixture("findings-register.json"); assert.ok(IP.validateRegister(reg));
  const RES = fixture("item-method-results-d225.json"); assert.equal(RES.reproducibility.registerSha256, createHash("sha256").update(Buffer.from(JSON.stringify(reg))).digest("hex"), "the d225 run used this register");
  assert.deepEqual([RES.method, RES.imageCalls, RES.reproducibility.byteIdenticalVerified, RES.summary], ["d225", 0, true, { technicallyOk: 10, technicallyOkOpenFinding: 3, rejected: 5 }]);
  for (const id of ["F-006", "F-007", "F-010", "F-011", "F-012"]) { const f = reg.findings.find((x) => x.id === id), c = f.classification;
    assert.equal(c.by, "D-225", id); for (const k of ["missingFabric", "intendedBodyRejected", "extractionRemnant"]) assert.equal(typeof c[k], "boolean", id + " " + k);
    assert.equal(c.intendedBodyRejected, false, id); assert.equal(c.layerOrder, "correct", id); assert.ok(c.contractRules.length, id); assert.equal(f.status, "open", id + " stays open"); }
});
