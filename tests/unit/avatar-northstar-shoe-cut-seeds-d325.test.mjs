// D-325 — the zone-v1 seed rule on SYNTHETIC inputs (no private file, no C, no AB-1): a field is found in its fixed zone by its safe pixels
// (distance from any line), whatever the exact rows of the drawing; a thin welt band, a missing field, two comparable fields, a merged
// field and a second zone of the same field are each handled as the rule says, and every choice is logged; at K the fields decided at 1x
// are followed (the sub-bands of one field are all seeded, a K part of another field is left out). Contract v3 is v2 plus the rule; v2
// is untouched. Passing approves no item and validates no method.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as KIT from "../../tools/avatar/northstar-shoe-cut-kit.mjs";
import * as SD from "../../tools/avatar/northstar-shoe-cut-seeds.mjs";

const { W, N } = WR, H = N / W, LINE = 20, FIELD = 200;
const CUT = Object.freeze({ id: "synthetic", source: { crop: { x0: 0, y0: 0 }, K: 2 }, seedRule: { id: "zone-v1", safeDistPx: 2, ambiguityRatio: 0.5 },
  fields: { upper: { slot: "upper", zones: { left: [95, 100, 140, 150], right: [295, 100, 340, 150] }, minSafePx: 100 },
    rim: { slot: "tongue", zones: { left: [92, 81, 146, 89], right: [292, 81, 346, 89] }, minSafePx: 20 },
    sole: { slot: "sole", zones: { left: [[92, 159, 146, 175], [151, 125, 158, 150]], right: [[292, 159, 346, 175], [351, 125, 358, 150]] }, minSafePx: 20 } } });

function boot({ dy = 0, sole = [163, 172], heel = true, soleAsLine = false, splitSole = false, noRimLine = false } = {}) {
  const P = new Uint8ClampedArray(N * 4), fill = (x0, y0, x1, y1, l) => { for (let y = y0 + dy; y <= y1 + dy; y++) for (let x = x0; x <= x1; x++) for (const o of [0, 200]) { const i = (y * W + x + o) * 4; P[i] = P[i + 1] = P[i + 2] = l; P[i + 3] = 255; } };
  fill(88, 78, 149, 175, LINE); if (heel) fill(150, 118, 160, 175, LINE);
  fill(90, 80, 147, 89, FIELD); fill(90, 92, 147, 155, FIELD); fill(90, 159, 147, 160, FIELD);
  if (noRimLine) fill(90, 90, 147, 91, FIELD);
  fill(90, sole[0], heel ? 158 : 147, sole[1], soleAsLine ? LINE : FIELD); if (heel) fill(150, 120, 158, 162, soleAsLine ? LINE : FIELD);
  if (splitSole) fill(118, sole[0], 119, sole[1], LINE);
  // lines are thin, as drawn: a line pixel with no field pixel within 3 px is empty (a solid dark block would be a field of its own)
  const keep = new Uint8Array(N); for (let i = 0; i < N; i++) { if (P[i * 4 + 3] !== 255 || P[i * 4] !== LINE) continue; const x = i % W, y = (i / W) | 0;
    for (let d = -3; d <= 3 && !keep[i]; d++) for (let e = -3; e <= 3; e++) { const j = (y + d) * W + x + e; if (P[j * 4 + 3] === 255 && P[j * 4] === FIELD) { keep[i] = 1; break; } } }
  for (let i = 0; i < N; i++) if (P[i * 4 + 3] === 255 && P[i * 4] === LINE && !keep[i]) P[i * 4 + 3] = 0;
  return P;
}
const lumAt = (P, [x, y]) => P[(y * W + x) * 4];

test("D-325 a drawn boot: every field found in its zone on both sides, at a field pixel, the heel zone joining the sole's field", () => {
  const P = boot(), r = SD.resolveSeeds(P, CUT);
  assert.equal(r.ok, true, r.problems.join("; ")); assert.equal(r.rule, SD.SEED_RULE_ID);
  for (const f of ["upper", "rim", "sole"]) { assert.equal(r.seeds[f].length, 2, f); for (const s of r.seeds[f]) assert.equal(lumAt(P, s), FIELD, f + " " + s); }
  for (const [x, y] of r.seeds.sole) assert.ok(y >= 163, "the 2 px welt band is never a seed: " + y);
  const heel = r.log.filter((e) => e.field === "sole" && e.zone[0] > 150 && e.zone[0] < 160 || e.field === "sole" && e.zone[0] > 350);
  assert.equal(heel.length, 2); for (const e of heel) { assert.equal(e.point, null); assert.match(e.reason, /already holds this component/); }
});

test("D-325 lines moved by 3 px: the same fixed contract still finds every field (a fixed point would not)", () => {
  const P = boot({ dy: 3 }), r = SD.resolveSeeds(P, CUT);
  assert.equal(r.ok, true, r.problems.join("; ")); for (const f of Object.keys(CUT.fields)) for (const s of r.seeds[f]) assert.equal(lumAt(P, s), FIELD);
  const r0 = SD.resolveSeeds(boot(), CUT), fixed = r0.seeds.rim[0]; assert.equal(lumAt(P, [fixed[0], fixed[1] + 9]) === FIELD, false, "the moved drawing puts a line where a fixed rim point would sit");
});

test("D-325 a narrow sole band (2 px) and no heel: MISSING, not the nearest field", () => {
  const r = SD.resolveSeeds(boot({ sole: [163, 164], heel: false }), CUT);
  assert.equal(r.ok, false); assert.ok(r.problems.some((p) => /^sole \(left\): MISSING/.test(p)), r.problems.join("; ")); assert.deepEqual(r.seeds.sole, []);
});

test("D-325 a missing field (the sole drawn as line): MISSING and refused", () => {
  const r = SD.resolveSeeds(boot({ soleAsLine: true }), CUT);
  assert.equal(r.ok, false); assert.ok(r.problems.some((p) => /^sole \(right\): MISSING/.test(p))); assert.throws(() => SD.cutWithSeeds(CUT, r), /not resolved/);
});

test("D-325 two comparable fields in one zone: AMBIGUOUS, neither chosen", () => {
  const r = SD.resolveSeeds(boot({ splitSole: true, heel: false }), CUT), e = r.log.find((x) => x.field === "sole" && x.side === "left");
  assert.equal(r.ok, false); assert.match(e.reason, /^AMBIGUOUS/); assert.equal(e.chosen, null); assert.equal(e.candidates.length, 2);
});

test("D-325 a rim without its seam: MERGED with the upper and refused", () => {
  const r = SD.resolveSeeds(boot({ noRimLine: true }), CUT);
  assert.equal(r.ok, false); assert.ok(r.problems.some((p) => /^rim \(left\): MERGED: .*upper \(left\)/.test(p)), r.problems.join("; "));
});

test("D-325 every choice is logged: field, side, zone, every candidate, the chosen point at the deepest safe pixel and the reason", () => {
  const r = SD.resolveSeeds(boot(), CUT); assert.equal(r.log.length, 8);
  for (const e of r.log) { assert.ok(e.field && e.side && e.zone.length === 4 && typeof e.reason === "string" && e.reason.length > 10);
    for (const c of e.candidates) assert.ok(c.pixels >= c.safePx && c.safePx > 0 && c.depth >= CUT.seedRule.safeDistPx);
    if (e.point) assert.equal(e.candidates.find((c) => c.component === e.chosen).at, e.point); }
});

test("D-325 at K the 1x fields are followed: both sub-bands of a split rim are seeded, a K part of another field is left out", () => {
  const P = boot(), cut = { ...CUT, fields: { ...CUT.fields, rim: { ...CUT.fields.rim, zones: { left: [92, 81, 146, 96], right: [292, 81, 346, 96] } } } }, r1 = SD.resolveSeeds(P, cut);
  assert.equal(r1.ok, true, r1.problems.join("; "));
  const T = new Uint8ClampedArray(N * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) T.set(P.subarray(((y >> 1) * W + (x >> 1)) * 4, ((y >> 1) * W + (x >> 1)) * 4 + 4), (y * W + x) * 4);
  for (let y = 168; y <= 169; y++) for (let x = 180; x <= 295; x++) { const i = (y * W + x) * 4; T[i] = T[i + 1] = T[i + 2] = LINE; }
  const k = SD.resolveSeedsAtK(T, cut, r1, { side: "left", x0: 0 }), rim = k.log.find((e) => e.field === "rim");
  assert.equal(k.ok, true, k.problems.join("; ")); assert.equal(k.rule, SD.K_RULE.id); assert.equal(k.seeds.rim.length, 2); assert.equal(rim.points.length, 2);
  assert.ok(rim.candidates.some((c) => c.insideShare === 0), "the upper's K part in the rim zone is a candidate"); assert.match(rim.reason, /1 candidate\(s\) of other 1x fields left out/);
  for (const s of k.seeds.rim) assert.equal(T[(s[1] * W + s[0]) * 4], FIELD);
  assert.throws(() => SD.resolveSeedsAtK(T, cut, { ok: false }, { side: "left", x0: 0 }), /not resolved/);
});

test("D-325 contract v3 is v2 plus the fixed zone rule (mirrored zones, no seeds); v2 keeps its fixed seeds", () => {
  const v2 = KIT.loadCut("ankle-boot"), v3 = KIT.loadCut("ankle-boot-v3");
  assert.equal(v2.contractVersion, 2); assert.equal(v2.seedRule, undefined); assert.deepEqual(v2.fields.sole.seeds, [[400, 1488], [623, 1488]]);
  assert.equal(v3.contractVersion, 3); assert.equal(v3.seedRule.id, SD.SEED_RULE_ID); assert.deepEqual(v3.source, v2.source); assert.deepEqual(v3.opening, v2.opening);
  assert.deepEqual(Object.keys(v3.fields), Object.keys(v2.fields));
  for (const [n, f] of Object.entries(v3.fields)) { assert.deepEqual(f.seeds, []); assert.equal(f.slot, v2.fields[n].slot);
    const L = Array.isArray(f.zones.left[0]) ? f.zones.left : [f.zones.left], R = Array.isArray(f.zones.right[0]) ? f.zones.right : [f.zones.right];
    assert.deepEqual(R, L.map((z) => [W - z[2], z[1], W - z[0], z[3]]), n + " right zones mirror the left"); }
});
