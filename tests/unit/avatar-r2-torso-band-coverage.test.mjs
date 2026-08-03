// ── D-095: per-band coverage in the candidate harness ────────────────────────────────────────
// The aggregate coverage figure cannot say WHERE a candidate falls short, and that blindness had a
// cost: the accepted Ridderdragt covers collar, torso and skirt fully but only 87.95 % of the
// SHOULDER band, because its sleeves stop at y≈680 while the base tee's reach y≈714. Backfill
// filled the gap and nobody traced why that band needed 5,990 px until it was measured.
//
// These tests exist so the two failure shapes stay catchable: a garment part that is MISSING, and
// an aggregate "improvement" bought by robbing one band to feed another.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  checkCandidate, BANDS, MIN_BAND_COVERAGE, REFERENCE_BAND_COVERAGE, OPAQUE,
} from "../../tools/avatar/check-r2-torso-candidate.mjs";
import { decodePng, encodePngRGBA, OUT_W, OUT_H } from "../../tools/avatar/build-r2-torso-occlusion-mask.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, "..", "..", "tools", "avatar", "fixtures", "r2-torso");

function maskOf(name) {
  const img = decodePng(readFileSync(join(FIX, name)), name);
  const m = new Uint8Array(img.w * img.h);
  for (let i = 0; i < m.length; i++) m[i] = img.rgba[i * 4 + 3] > 0 ? 1 : 0;
  return m;
}
const masks = { hard: maskOf("torso-occlusion-hard-v1.png"), edit: maskOf("torso-edit-allowed-v1.png"), protect: maskOf("torso-protect-v1.png") };

// A candidate that fills the mandatory region EXCEPT inside one band, so a single band can be
// starved on purpose without disturbing the others.
function candidateMissingBand(bandName) {
  const rgba = Buffer.alloc(OUT_W * OUT_H * 4);
  const [y0, y1] = BANDS[bandName];
  for (let y = 0; y < OUT_H; y++) {
    const starve = y >= y0 && y < y1;
    for (let x = 0; x < OUT_W; x++) {
      const i = y * OUT_W + x;
      if (!masks.hard[i] || starve) continue;
      rgba[i * 4] = 150; rgba[i * 4 + 1] = 155; rgba[i * 4 + 2] = 165; rgba[i * 4 + 3] = 255;
    }
  }
  return encodePngRGBA(OUT_W, OUT_H, rgba);
}
function fullCandidate() {
  const rgba = Buffer.alloc(OUT_W * OUT_H * 4);
  for (let i = 0; i < OUT_W * OUT_H; i++) if (masks.hard[i]) {
    rgba[i * 4] = 150; rgba[i * 4 + 1] = 155; rgba[i * 4 + 2] = 165; rgba[i * 4 + 3] = 255;
  }
  return encodePngRGBA(OUT_W, OUT_H, rgba);
}
const gate = (res, id) => res.gates.find((g) => g.id === id);

test("the bands are the same ones the adapter attributes backfill to", () => {
  assert.deepEqual(Object.keys(BANDS), ["collar", "shoulder", "torso", "skirt"]);
  assert.deepEqual(BANDS.shoulder, [560, 714]);
  assert.deepEqual(BANDS.torso, [714, 902]);
});

test("every band is disclosed for every candidate, covered or not", () => {
  const res = checkCandidate(fullCandidate(), masks, "full");
  const d = gate(res, "band-coverage-disclosure");
  assert.ok(d, "the disclosure gate must always be present");
  assert.equal(d.advisory, true, "disclosure must never block on its own");
  for (const name of Object.keys(BANDS)) {
    if (!d.detail.bands[name]) continue;   // a band with no mandatory pixels is skipped
    assert.ok(d.detail.bands[name].coverage >= 0.999, name);
  }
});

test("a band the garment is largely absent from is BLOCKING", () => {
  // This is the shape the short sleeves would have had, taken to its extreme.
  const res = checkCandidate(candidateMissingBand("shoulder"), masks, "no-shoulders");
  const g = gate(res, "no-band-largely-uncovered");
  assert.equal(g.pass, false);
  assert.ok(g.detail.lowBands.some((s) => s.startsWith("shoulder")), JSON.stringify(g.detail.lowBands));
  assert.equal(res.verdict, "REJECT");
});

test("starving the skirt is caught too — the mesh experiment's actual failure", () => {
  const res = checkCandidate(candidateMissingBand("skirt"), masks, "no-skirt");
  const g = gate(res, "no-band-largely-uncovered");
  assert.equal(g.pass, false);
  assert.ok(g.detail.lowBands.some((s) => s.startsWith("skirt")));
});

test("the blocking floor sits BELOW the accepted asset's shoulder figure, on purpose", () => {
  // The gate exists to catch a missing garment part, not to retroactively fail an asset the owner
  // accepted with its shortfall measured and disclosed (D-087/D-088).
  assert.ok(MIN_BAND_COVERAGE < REFERENCE_BAND_COVERAGE.shoulder,
    `floor ${MIN_BAND_COVERAGE} must be below the accepted ${REFERENCE_BAND_COVERAGE.shoulder}`);
  assert.equal(MIN_BAND_COVERAGE, 0.6);
});

test("the reference records what actually shipped, so a new candidate can be compared to it", () => {
  assert.equal(REFERENCE_BAND_COVERAGE.collar, 1.0);
  assert.equal(REFERENCE_BAND_COVERAGE.skirt, 1.0);
  assert.ok(Math.abs(REFERENCE_BAND_COVERAGE.shoulder - 0.87952) < 1e-5);
  assert.ok(Math.abs(REFERENCE_BAND_COVERAGE.torso - 0.94106) < 1e-5);
  assert.match(REFERENCE_BAND_COVERAGE.note, /sleeves stopping at/);
});

test("a fully covering candidate passes the band gate", () => {
  const res = checkCandidate(fullCandidate(), masks, "full");
  assert.equal(gate(res, "no-band-largely-uncovered").pass, true);
});

test("band coverage is measured on OPAQUE pixels, like the mandatory-region gate", () => {
  // A semi-transparent garment is a hole, not a style — the two gates must agree on that.
  const rgba = Buffer.alloc(OUT_W * OUT_H * 4);
  for (let i = 0; i < OUT_W * OUT_H; i++) if (masks.hard[i]) {
    rgba[i * 4] = 150; rgba[i * 4 + 1] = 155; rgba[i * 4 + 2] = 165;
    rgba[i * 4 + 3] = OPAQUE - 1;      // just below the opacity contract
  }
  const res = checkCandidate(encodePngRGBA(OUT_W, OUT_H, rgba), masks, "translucent");
  const d = gate(res, "band-coverage-disclosure");
  for (const b of Object.values(d.detail.bands)) assert.equal(b.coveredPx, 0);
});
