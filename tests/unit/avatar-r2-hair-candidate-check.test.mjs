// Section 167A option A — the acceptance contract for a hair candidate (D-102 §4A, revised D-115).
//
// TWO KINDS OF CHECK, AND THIS FILE KEEPS THEM APART ON PURPOSE:
//   authoringPreconditions() — properties of the 1024x1536 SOURCE (dimensions, luminance-map)
//   runtimeGates()           — the visual judgement, on the DECODED 512x768 asset a browser paints
//
// Every gate is exercised in BOTH directions on synthetic images: a clean one passes, and a single
// deliberate defect trips exactly the gate it should. A gate that only ever sees good input is
// indistinguishable from one that cannot fail (the D-085 lesson).
//
// The canvas here is 256x384 rather than 1024x1536 or 512x768: analyse() derives its C2-unit scale
// from the canvas it is handed, so a proportional canvas measures to the same units and the suite
// stays fast and binary-free. The real pixels — the Short candidate, the shipped afro, the codec
// round-trip — are covered by avatar-r2-hair-runtime-asset.test.mjs, which needs vendored libwebp.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  analyse, authoringPreconditions, runtimeGates, countComponents, countOrphanSoft,
  NEIGHBOURS_8, STYLE_TARGETS, STYLES, BASE, ALPHA_INK, MAX_SPECK_PX,
  SRC_W, SRC_H, OUT_W, OUT_H, MAX_MEAN_SAT, X_TOLERANCE, Y_TOLERANCE, HALO_TOLERANCE_SERVED,
  MAX_IRIS_ALPHA, irisMask, irisCoverage, IRIS_MASK_SHA256, IRIS_MASK_FILE,
  IRIS_SOURCE, IRIS_SOURCE_SHA256,
} from "../../tools/avatar/check-r2-hair-candidate.mjs";

const W = 256, H = 384;          // 2:3, same proportions as the authoring canvas
const K = 160 / W;               // 0.625 C2 units per px
const px = (unit) => Math.round(unit / K);

function blank(w = W, h = H) {
  return { rgba: new Uint8Array(w * h * 4), w, h };
}

// Paints a filled rectangle in C2 CANVAS UNITS, mid-grey and opaque by default.
function paint(c, { xLo, xHi, yLo, yHi, rgb = [128, 128, 128], alpha = 255 }) {
  for (let y = px(yLo); y < px(yHi); y++) {
    for (let x = px(xLo); x < px(xHi); x++) {
      if (x < 0 || y < 0 || x >= c.w || y >= c.h) continue;
      const i = (y * c.w + x) * 4;
      c.rgba[i] = rgb[0]; c.rgba[i + 1] = rgb[1]; c.rgba[i + 2] = rgb[2]; c.rgba[i + 3] = alpha;
    }
  }
  return c;
}

const setA = (c, x, y, a, v = 128) => {
  const i = (y * c.w + x) * 4;
  c.rgba[i] = v; c.rgba[i + 1] = v; c.rgba[i + 2] = v; c.rgba[i + 3] = a;
};
const alphaAt = (c, x, y) => c.rgba[(y * c.w + x) * 4 + 3];

// A candidate that should satisfy every runtime gate for `short`: sits on the crown, clears the
// eye line, stops above the neck, centred on the skull, inside the style envelope, grey, opaque.
//
// The bottom edge is 50, not 54, and that is a CORRECTION rather than a convenience (D-118). At 54
// this rectangle reached 1.5 units into the iris, which starts at y 52.50 — it covered 9 of the
// eye's own pixels. The old `clears-the-eye-line` could not see that, so the fixture passed and was
// called clean; the new one does, and it is right. A solid slab across the whole forehead down to
// the eyes was never clean hair: C2 `short`'s central hairline sits around y 33 and only its
// TEMPLES reach 56. The fixture is now the shape it always claimed to be.
function goodShort() {
  return paint(blank(), { xLo: 55, xHi: 106, yLo: 20, yHi: 50 });
}
// its top-left ink pixel, which the connectivity fixtures below hang off
const MASS_X = px(55), MASS_Y = px(20);

const check = (c, style = "short") => runtimeGates(c.rgba, c.w, c.h, style);
const pre = (c) => authoringPreconditions(analyse(c.rgba, c.w, c.h));
const gate = (res, id) => {
  const g = res.find((x) => x.id === id);
  assert.ok(g, "check not reported: " + id);
  return g;
};

// ── the clean candidate ──────────────────────────────────────────────────────────────────────

test("a clean candidate satisfies every runtime acceptance gate", () => {
  const res = check(goodShort());
  const failed = res.filter((g) => !g.pass).map((g) => g.id);
  assert.deepEqual(failed, [], "unexpected failures: " + JSON.stringify(res, null, 1));
  assert.equal(res.length, 9, "there are nine runtime acceptance gates");
});

test("the two kinds of check are separate, and together they are the eleven", () => {
  const p = pre(goodShort());
  assert.deepEqual(p.map((g) => g.id), ["dimensions", "luminance-map"]);
  assert.deepEqual(check(goodShort()).map((g) => g.id), [
    "has-ink", "covers-the-crown", "clears-the-eye-line", "respects-the-neck",
    "within-style-envelope", "centred-on-the-skull", "no-floating-islands",
    "alpha-clean-no-halo", "legible-at-render-sizes",
  ]);
  assert.equal(p.length + check(goodShort()).length, 11);
});

test("the authoring canvas is pinned to the torso pipeline, and dimensions is a PRECONDITION", () => {
  assert.equal(SRC_W, 1024);
  assert.equal(SRC_H, 1536);
  assert.equal(OUT_W, 512);
  assert.equal(OUT_H, 768);
  // the small proportional test canvas fails the precondition...
  assert.equal(gate(pre(goodShort()), "dimensions").pass, false);
  // ...and the runtime gates do not carry a dimensions check at all: they judge whatever the
  // pipeline produced, which is 512x768 by construction.
  assert.equal(check(goodShort()).find((g) => g.id === "dimensions"), undefined);
});

// ── the precondition that would silently disable hair colour ─────────────────────────────────

test("a candidate that carries its own colour is refused as a PRECONDITION", () => {
  // The runtime multiplies this map over the identity token (D-103). Colour baked into the asset
  // fights the student's choice instead of carrying it, and nothing else would catch it. It is a
  // precondition because no downscale, cleanup or lossless encode can add or remove chroma.
  const c = paint(blank(), { xLo: 55, xHi: 106, yLo: 20, yHi: 54, rgb: [140, 90, 40] });
  assert.equal(gate(pre(c), "luminance-map").pass, false);
  assert.ok(gate(pre(c), "luminance-map").detail.meanSat > MAX_MEAN_SAT);
});

test("a grey candidate passes the same precondition, so it measures chroma and does not merely fail", () => {
  assert.equal(gate(pre(goodShort()), "luminance-map").pass, true);
  assert.equal(gate(pre(goodShort()), "luminance-map").detail.meanSat, 0);
});

// ── fit against the frozen base landmarks ────────────────────────────────────────────────────

test("hair that starts below the crown leaves scalp showing and is refused", () => {
  // top edge at 35 is BELOW the measured crown at 31.6, so the bald skull would peek out
  const c = paint(blank(), { xLo: 55, xHi: 106, yLo: 35, yHi: 54 });
  const g = gate(check(c), "covers-the-crown");
  assert.equal(g.pass, false);
  assert.ok(g.detail.highestInk > BASE.crownY);
});

test("hair that reaches the eyes is refused", () => {
  const c = paint(blank(), { xLo: 55, xHi: 106, yLo: 58, yHi: 70 });
  assert.equal(gate(check(c), "clears-the-eye-line").pass, false);
});

test("a non-draping style may not put ink below the neck", () => {
  const c = paint(blank(), { xLo: 55, xHi: 106, yLo: 20, yHi: 90 }); // past neck 81.6
  const g = gate(check(c), "respects-the-neck");
  assert.equal(g.pass, false);
  assert.equal(g.detail.drapes, false);
  assert.equal(g.detail.limit, BASE.neckY);
});

test("a draping style may, up to its own measured extent", () => {
  const c = paint(blank(), { xLo: 55, xHi: 106, yLo: 20, yHi: 120 });
  assert.equal(gate(check(c, "ponytail"), "respects-the-neck").pass, true);   // limit 123
  assert.equal(gate(check(c, "short"), "respects-the-neck").pass, false);     // limit 81.6
  // and even a draping style has a floor
  const tooLong = paint(blank(), { xLo: 55, xHi: 106, yLo: 20, yHi: 155 });
  assert.equal(gate(check(tooLong, "ponytail"), "respects-the-neck").pass, false);
});

// ── the silhouette the student recognises ────────────────────────────────────────────────────

test("a candidate wider than its style envelope is refused", () => {
  const c = paint(blank(), { xLo: 30, xHi: 130, yLo: 20, yHi: 54 });
  assert.equal(gate(check(c, "short"), "within-style-envelope").pass, false);
  // the same artwork is legitimate for afro, whose measured envelope really is that wide
  assert.equal(gate(check(c, "afro"), "within-style-envelope").pass, true);
});

test("the envelope tolerance is a stated number, not a silent fudge", () => {
  const t = STYLE_TARGETS.short;
  const justInside = paint(blank(), { xLo: t.xLo - X_TOLERANCE + 1, xHi: t.xHi + X_TOLERANCE - 1, yLo: 20, yHi: 54 });
  const justOutside = paint(blank(), { xLo: t.xLo - X_TOLERANCE - 2, xHi: t.xHi + X_TOLERANCE + 2, yLo: 20, yHi: 54 });
  assert.equal(gate(check(justInside), "within-style-envelope").pass, true);
  assert.equal(gate(check(justOutside), "within-style-envelope").pass, false);
});

test("hair that hangs off the side of the head is refused", () => {
  const c = paint(blank(), { xLo: 90, xHi: 130, yLo: 20, yHi: 54 }); // centre ~110, base is 80.5
  assert.equal(gate(check(c, "afro"), "centred-on-the-skull").pass, false);
});

// ── matte quality ────────────────────────────────────────────────────────────────────────────

test("orphan soft pixels are counted as halo", () => {
  const c = goodShort();
  // a drift of translucent pixels with no ink neighbour: the classic bad matte (D-059/D-061)
  paint(c, { xLo: 20, xHi: 40, yLo: 100, yHi: 110, alpha: ALPHA_INK - 40 });
  assert.equal(gate(check(c), "alpha-clean-no-halo").pass, false);
});

test("the halo budget is the served one, read off the pixels handed in", () => {
  const g = gate(check(goodShort()), "alpha-clean-no-halo");
  assert.equal(g.detail.toleranceServed, HALO_TOLERANCE_SERVED);
  assert.equal(g.detail.orphanSoftServed, countOrphanSoft(goodShort().rgba, W, H));
});

test("an empty candidate is reported as empty rather than silently passing", () => {
  const res = check(blank());
  assert.equal(gate(res, "has-ink").pass, false);
  // and nothing downstream pretends to have measured a shape
  assert.equal(res.find((g) => g.id === "within-style-envelope"), undefined);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// CONNECTIVITY — `no-floating-islands` uses EIGHT neighbours since D-115
// ═════════════════════════════════════════════════════════════════════════════════════════════

// The production algorithm, parameterised by its neighbour set, so the counterfactual runs the
// SAME code with the OLD rule rather than a look-alike re-implementation. The first test below
// pins that this really is the production algorithm when given NEIGHBOURS_8.
const N4 = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);
function componentsWith(rgba, w, h, neighbours) {
  const seen = new Uint8Array(w * h);
  const sizes = [];
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || rgba[s * 4 + 3] < ALPHA_INK) continue;
    let size = 0;
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const p = stack.pop();
      size++;
      const cx = p % w, cy = (p / w) | 0;
      for (const [dx, dy] of neighbours) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (seen[q] || rgba[q * 4 + 3] < ALPHA_INK) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    sizes.push(size);
  }
  sizes.sort((a, b) => b - a);
  return { count: sizes.length, largest: sizes[0] || 0, specks: sizes.filter((n) => n < MAX_SPECK_PX).length };
}

test("the counterfactual helper IS the production algorithm when given the production neighbours", () => {
  // Without this, every "and it would fail under 4-neighbour" claim below is about some other
  // function. With it, the only difference between the two runs is the neighbour set.
  for (const c of [goodShort(), diagonalTouch(), trulyDetached(), diagonalChain()]) {
    assert.deepEqual(componentsWith(c.rgba, c.w, c.h, NEIGHBOURS_8), countComponents(c.rgba, c.w, c.h));
  }
});

test("the neighbour set is the four sides PLUS the four corners — all eight positions", () => {
  assert.equal(NEIGHBOURS_8.length, 8);
  const set = new Set(NEIGHBOURS_8.map(([x, y]) => `${x},${y}`));
  for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
    if (dx === 0 && dy === 0) continue;
    assert.ok(set.has(`${dx},${dy}`), `missing neighbour ${dx},${dy}`);
  }
});

// The real defect, in miniature. On the Short candidate the served pixel at (260,30) has alpha
// exactly 128 — ink — and its only ink contact is the DIAGONAL neighbour at alpha 225. Its four
// orthogonal neighbours are soft (49, 65, 108) or empty (0), so 4-neighbour connectivity calls it
// a separate component while the eye sees one continuous shape.
function diagonalTouch({ alpha = 128, corner = 225 } = {}) {
  const c = goodShort();
  const x = MASS_X - 1, y = MASS_Y - 1;
  setA(c, x, y, alpha);              // the pixel under test
  setA(c, MASS_X, MASS_Y, corner);   // its down-right diagonal: ink, part of the mass
  setA(c, x, y - 1, 49);             // up    — soft, not ink
  setA(c, x, y + 1, 108);            // down  — soft, not ink
  setA(c, x - 1, y, 65);             // left  — soft, not ink
  return c;
}

test("the (260,30) case: an ink pixel touching the mass only diagonally is CONNECTED", () => {
  const c = diagonalTouch();
  const x = MASS_X - 1, y = MASS_Y - 1;

  // the fixture really is the situation it claims to be
  assert.equal(alphaAt(c, x, y), 128, "the pixel must be alpha exactly 128");
  assert.equal(alphaAt(c, MASS_X, MASS_Y), 225, "its diagonal neighbour must be alpha 225");
  for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
    assert.ok(alphaAt(c, nx, ny) < ALPHA_INK, `orthogonal neighbour ${nx},${ny} must not be ink`);
  }

  assert.equal(countComponents(c.rgba, c.w, c.h).count, 1, "8-neighbour must see ONE shape");
  assert.equal(gate(check(c), "no-floating-islands").pass, true);
  assert.equal(gate(check(c), "no-floating-islands").detail.connectivity, 8);
});

test("COUNTERFACTUAL: the same fixture fails no-floating-islands under 4-neighbour", () => {
  const c = diagonalTouch();
  const four = componentsWith(c.rgba, c.w, c.h, N4);
  assert.equal(four.count, 2, "4-neighbour must split it in two");
  assert.equal(four.specks, 1, "and call the attached pixel a speck");
  // which is exactly the verdict the gate would have produced before D-115
  assert.equal(four.count === 1 || four.specks === 0, false);
});

test("alpha 127 is not ink and alpha 128 is — the threshold is unchanged", () => {
  // Isolated to two pixels so nothing else can account for the difference: one opaque anchor and
  // one diagonal neighbour whose alpha straddles the boundary.
  const mk = (a) => { const c = blank(); setA(c, 100, 100, 255); setA(c, 101, 101, a); return c; };

  assert.equal(analyse(mk(128).rgba, W, H).ink, 2, "alpha 128 must count as ink");
  assert.equal(analyse(mk(127).rgba, W, H).ink, 1, "alpha 127 must NOT count as ink");

  // 128: ink, and joined to the anchor diagonally -> one component.
  assert.equal(countComponents(mk(128).rgba, W, H).count, 1);
  // 127: not ink at all, so it is not a component member; it is soft with no ink among its four
  // ORTHOGONAL neighbours, which makes it halo instead — a different gate, and the right reading.
  assert.equal(countComponents(mk(127).rgba, W, H).count, 1, "only the anchor is a component");
  assert.equal(countOrphanSoft(mk(127).rgba, W, H), 1, "the 127 pixel becomes halo");
  assert.equal(countOrphanSoft(mk(128).rgba, W, H), 0, "the 128 pixel is ink, never halo");
});

test("diagonal connection works in ALL FOUR diagonal directions", () => {
  // A single ink pixel placed at each corner of a 3x3 block's diagonal reach must join it.
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const c = blank();
    setA(c, 100, 100, 255);
    setA(c, 100 + dx, 100 + dy, 255);
    assert.equal(countComponents(c.rgba, W, H).count, 1,
      `diagonal ${dx},${dy} must connect`);
    assert.equal(componentsWith(c.rgba, W, H, N4).count, 2,
      `diagonal ${dx},${dy} must be TWO components under the old rule, or this proves nothing`);
  }
});

// A genuinely detached speck: at least one whole pixel of non-ink between it and the mass, so
// nothing touches it, corners included.
function trulyDetached() {
  const c = goodShort();
  setA(c, MASS_X - 3, MASS_Y - 3, 255);   // a clear gap at (MASS-2,MASS-2)
  return c;
}

test("a truly detached pixel one whole pixel away STILL fails — 8-neighbour is not a free pass", () => {
  const c = trulyDetached();
  assert.equal(countComponents(c.rgba, c.w, c.h).count, 2);
  const g = gate(check(c), "no-floating-islands");
  assert.equal(g.pass, false);
  assert.equal(g.specks, undefined);
  assert.equal(g.detail.specks, 1);
});

test("several genuinely detached islands still fail", () => {
  const c = goodShort();
  for (const [x, y] of [[10, 300], [30, 320], [50, 340], [70, 360]]) setA(c, x, y, 255);
  const g = gate(check(c), "no-floating-islands");
  assert.equal(g.pass, false);
  assert.equal(g.detail.components, 5);
  assert.equal(g.detail.specks, 4);
});

test("a detached SPECK block is refused; a large detached component is a separate, unchanged rule", () => {
  // The gate's rule is `count === 1 || specks === 0`, and D-115 did not touch it: a component
  // smaller than MAX_SPECK_PX is a speck and refuses the candidate, while a large detached
  // component does not — that is how a style with a legitimately separate lock stays possible.
  // Both halves are pinned here so the widening of CONNECTIVITY cannot be mistaken for a change
  // to what counts as a speck.
  const speck = goodShort();
  paint(speck, { xLo: 15, xHi: 17, yLo: 100, yHi: 102 });          // ~9 px < 16
  const gs = gate(check(speck), "no-floating-islands");
  assert.equal(gs.detail.components, 2);
  assert.ok(gs.detail.specks >= 1, "a sub-16px detached blob is a speck");
  assert.equal(gs.pass, false, "a known island must not become a false pass under 8-neighbour");

  const lump = goodShort();
  paint(lump, { xLo: 15, xHi: 22, yLo: 100, yHi: 106 });           // >= 16 px
  const gl = gate(check(lump), "no-floating-islands");
  assert.equal(gl.detail.components, 2);
  assert.equal(gl.detail.specks, 0);
  assert.equal(gl.pass, true, "unchanged pre-D-115 behaviour: a large component is not a speck");
});

test("the stray fleck the pre-D-115 suite used is still refused", () => {
  // Verbatim the fixture the old suite asserted on, so the widening cannot have swallowed it.
  const c = goodShort();
  paint(c, { xLo: 20, xHi: 21, yLo: 100, yHi: 101 });
  const g = gate(check(c), "no-floating-islands");
  assert.equal(g.pass, false);
  assert.ok(g.detail.components > 1);
});

// An unbroken diagonal staircase running away from the mass. Under the documented 8-neighbour
// contract this IS connected, and the header of check-r2-hair-candidate.mjs says so explicitly
// rather than hiding it. The test exists so the consequence stays visible and deliberate.
function diagonalChain(len = 12) {
  const c = goodShort();
  for (let i = 1; i <= len; i++) setA(c, MASS_X - i, MASS_Y - i, 255);
  return c;
}

test("DOCUMENTED CONSEQUENCE: an unbroken diagonal chain counts as connected", () => {
  const c = diagonalChain();
  assert.equal(countComponents(c.rgba, c.w, c.h).count, 1,
    "the 8-neighbour contract admits a diagonal chain — this is stated, not hidden");
  assert.equal(componentsWith(c.rgba, c.w, c.h, N4).count, 13,
    "under 4-neighbour every link would have been its own island");
  // Break the chain by one pixel and the tail detaches again: connectivity is still doing work.
  const broken = diagonalChain();
  setA(broken, MASS_X - 6, MASS_Y - 6, 0);
  assert.equal(countComponents(broken.rgba, broken.w, broken.h).count, 2,
    "one missing link must separate the tail — otherwise nothing is being measured");
});

// ── contract ─────────────────────────────────────────────────────────────────────────────────

test("the style set is exactly the seven selectable C2 styles", () => {
  assert.deepEqual([...STYLES], ["short", "tousled", "curly", "long", "ponytail", "buzz", "afro"]);
  for (const s of STYLES) {
    assert.equal(typeof STYLE_TARGETS[s].lowestY, "number", s + " has no measured extent");
  }
  assert.throws(() => check(goodShort(), "mullet"), /unknown style/);
});

test("the base landmarks are the frozen D-102 measurements, not re-derived here", () => {
  assert.equal(BASE.crownY, 31.6);
  assert.equal(BASE.skullW, 60.0);
  assert.equal(BASE.skullCx, 80.5);
  assert.equal(BASE.neckY, 81.6);
  assert.equal(BASE.shoulderY, 83.8);
});

test("the thresholds D-115 and D-116 did NOT touch are still exactly what they were", () => {
  assert.equal(ALPHA_INK, 128, "the ink threshold moved");
  assert.equal(HALO_TOLERANCE_SERVED, 16, "the orphan budget moved");
  assert.equal(MAX_SPECK_PX, 16, "the speck size moved");
  assert.equal(X_TOLERANCE, 4, "the envelope tolerance moved");
  // D-116 ADDED `highestY`; it changed none of the pre-existing numbers. This assertion fired when
  // the field appeared, which is the sentinel working — the fix is to state the new shape, not to
  // loosen the check to a subset that would stop noticing a real edit.
  assert.deepEqual(STYLE_TARGETS.short, { xLo: 52, xHi: 108, highestY: 20.50, lowestY: 56, drapes: false });
  assert.deepEqual(STYLE_TARGETS.afro, { xLo: 34, xHi: 126, highestY: 6.02, lowestY: 61, drapes: false });
});

test("the checker writes nothing and reaches no network", () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "tools", "avatar", "check-r2-hair-candidate.mjs"),
    "utf8",
  );
  assert.ok(!/writeFileSync|mkdirSync|createWriteStream|appendFile/.test(src), "the checker writes");
  const code = src.replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/\bfetch\s*\(|node:https?\b|https?:\/\//.test(code), "the checker reaches out");
  assert.ok(!/openai|api[_-]?key/i.test(src), "no AI surface in an acceptance gate");
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE TOP BOUND — `within-style-envelope` bounds BOTH axes since D-116
// ═════════════════════════════════════════════════════════════════════════════════════════════

// A silhouette that stands far taller than its style. This is the real defect in miniature: the
// `short` candidate matched short's WIDTH almost exactly and stood 11 units too tall, and the
// x-only gate passed it.
const towering = (style = "short") => paint(blank(), { xLo: 55, xHi: 106, yLo: 8, yHi: 54 });

test("a candidate that towers over its style's own crown is refused", () => {
  const g = gate(check(towering()), "within-style-envelope");
  assert.equal(g.pass, false);
  assert.equal(g.detail.xOk, true, "the WIDTH is fine — only the height is wrong");
  assert.equal(g.detail.topOk, false);
  assert.equal(g.detail.styleCrown, STYLE_TARGETS.short.highestY);
  assert.equal(g.detail.topLimit, STYLE_TARGETS.short.highestY - Y_TOLERANCE);
});

test("COUNTERFACTUAL: without the top bound the same fixture passes — the bound is what decides", () => {
  // Exactly the predicate the gate used before D-116. If this ever stops being true, the fixture
  // has drifted and the test above is no longer proving anything about the top.
  const c = towering();
  const a = analyse(c.rgba, c.w, c.h);
  const t = STYLE_TARGETS.short;
  const xOnly = a.envelope.xLo >= t.xLo - X_TOLERANCE && a.envelope.xHi <= t.xHi + X_TOLERANCE;
  assert.equal(xOnly, true, "the pre-D-116 x-only rule must accept this candidate");
  assert.equal(gate(check(c), "within-style-envelope").pass, false, "the two-axis rule must refuse it");
});

test("the top bound is a stated number, not a silent fudge", () => {
  const limit = STYLE_TARGETS.short.highestY - Y_TOLERANCE;   // 16.5
  const justInside = paint(blank(), { xLo: 55, xHi: 106, yLo: 17, yHi: 54 });
  const justOutside = paint(blank(), { xLo: 55, xHi: 106, yLo: 16, yHi: 54 });
  assert.ok(analyse(justInside.rgba, W, H).envelope.yLo >= limit, "fixture: inside must be inside");
  assert.ok(analyse(justOutside.rgba, W, H).envelope.yLo < limit, "fixture: outside must be outside");
  assert.equal(gate(check(justInside), "within-style-envelope").pass, true);
  assert.equal(gate(check(justOutside), "within-style-envelope").pass, false);
});

test("the bound is PER STYLE: the same artwork passes for a tall style and fails for a flat one", () => {
  // Nothing global is being enforced — each style is judged against its own measured crown.
  const tall = paint(blank(), { xLo: 40, xHi: 120, yLo: 8, yHi: 54 });
  assert.equal(gate(check(tall, "afro"), "within-style-envelope").pass, true, "afro's crown is 6.02 — this fits");
  const short = paint(blank(), { xLo: 55, xHi: 106, yLo: 8, yHi: 54 });
  assert.equal(gate(check(short, "short"), "within-style-envelope").pass, false, "short's crown is 20.5 — this does not");
  assert.equal(gate(check(short, "buzz"), "within-style-envelope").pass, false, "buzz is flatter still");
});

test("a candidate still has to REACH the crown — the two rules are a band, not one bound", () => {
  // covers-the-crown is a MINIMUM (reach the bald skull at 31.6); the envelope top is a MAXIMUM.
  // Between them the hair has somewhere legal to be, and both edges are enforced.
  const tooLow = paint(blank(), { xLo: 55, xHi: 106, yLo: 35, yHi: 54 });
  assert.equal(gate(check(tooLow), "covers-the-crown").pass, false, "too low: scalp shows");
  assert.equal(gate(check(tooLow), "within-style-envelope").pass, true, "...but not too tall");

  const tooHigh = towering();
  assert.equal(gate(check(tooHigh), "covers-the-crown").pass, true, "too tall: it certainly reaches the skull");
  assert.equal(gate(check(tooHigh), "within-style-envelope").pass, false, "...and that is the failure");
});

test("a clean candidate still passes with the top bound in place", () => {
  const g = gate(check(goodShort()), "within-style-envelope");
  assert.equal(g.pass, true);
  assert.equal(g.detail.xOk, true);
  assert.equal(g.detail.topOk, true);
  assert.equal(g.detail.note, undefined, "no note on a pass");
});

test("Y_TOLERANCE is stated separately from X_TOLERANCE, even at the same value", () => {
  assert.equal(Y_TOLERANCE, 4);
  assert.equal(X_TOLERANCE, 4);
  // every style carries a measured crown, and it is above the bald skull it has to cover
  for (const s of STYLES) {
    assert.equal(typeof STYLE_TARGETS[s].highestY, "number", s + " has no measured crown");
    assert.ok(STYLE_TARGETS[s].highestY < BASE.crownY, s + " crown must sit above the bald skull");
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE EYES MUST BE CLEAR, NOT MERELY BELOW WHERE THE HAIR STARTS (D-118)
// ═════════════════════════════════════════════════════════════════════════════════════════════

// Hair that BEGINS above the eye line and then continues straight down over the face. This is the
// exact shape the image-guided `short` canary produced: it covered 100 % of the iris and 79 % of
// the face, and the pre-D-118 gate passed it.
const overTheFace = () => paint(blank(), { xLo: 55, xHi: 106, yLo: 20, yHi: 72 });

test("hair that covers the iris is refused even though it starts above the eye line", () => {
  const g = gate(check(overTheFace()), "clears-the-eye-line");
  assert.equal(g.pass, false);
  assert.equal(g.detail.startsAboveEyeLine, true, "the OLD condition is satisfied — that is the point");
  assert.equal(g.detail.irisClear, false);
  assert.ok(g.detail.irisMaxAlpha > 0);
  assert.equal(g.detail.irisPixelsTotal, 1156, "the iris mask's own ink count");
});

test("COUNTERFACTUAL: the pre-D-118 rule accepts the very fixture the new rule refuses", () => {
  // The old gate was `lowestForehead < eyeLineY` and nothing else. If this ever stops being true,
  // the fixture has drifted and the test above proves nothing about the blind spot.
  const c = overTheFace();
  const a = analyse(c.rgba, c.w, c.h);
  let lowestForehead = -Infinity;
  for (let x = 0; x < a.w; x++) {
    const cx = x * a.k;
    if (cx < 65 || cx > 95) continue;
    if (a.botByCol[x] === -Infinity) continue;
    const yv = a.topByCol[x] * a.k;
    if (yv > lowestForehead) lowestForehead = yv;
  }
  assert.equal(lowestForehead < BASE.eyeLineY, true, "the old rule must accept it");
  assert.equal(gate(check(c), "clears-the-eye-line").pass, false, "the new rule must refuse it");
});

test("a clean candidate leaves the iris completely untouched", () => {
  const g = gate(check(goodShort()), "clears-the-eye-line");
  assert.equal(g.pass, true);
  assert.equal(g.detail.irisMaxAlpha, 0);
  assert.equal(g.detail.irisClear, true);
  assert.equal(g.detail.note, undefined, "no note on a pass");
});

test("the limit is ZERO ALPHA, and it is reachable", () => {
  // Not a number chosen to separate the fixtures. Measured on the real decoded runtime assets,
  // northstar, afro, buzz and short all put NOTHING over the iris at any opacity at all: max
  // alpha 0, obscured 0.00 %. Zero is what clean artwork does, not a bar invented for these eight.
  assert.equal(MAX_IRIS_ALPHA, 0);
  const oneStray = goodShort();
  const iris = irisMask();
  const i = iris.m.indexOf(1);
  const mx = i % iris.w, my = (i / iris.w) | 0;
  setA(oneStray, Math.floor((mx + 0.5) * W / iris.w), Math.floor((my + 0.5) * H / iris.h), 255);
  const g = gate(check(oneStray), "clears-the-eye-line");
  assert.ok(g.detail.irisMaxAlpha >= 1, "the stray pixel must land on the iris");
  assert.equal(g.pass, false, "one pixel over the pupil is one too many");
});

test("the iris mask is the shipped artwork, SHA-pinned, and a swap is refused", () => {
  const m = irisMask();
  assert.equal(m.w, 512);
  assert.equal(m.h, 768);
  assert.equal(m.count, 1156, "the iris layer's own ink count");
  assert.equal(IRIS_MASK_SHA256, "8e7f2ff36ee53aa24f0afc0ea5595cacb757e236d8b3ef37b417000067dc5bd5");
  assert.equal(IRIS_SOURCE, "assets/avatar-r2/eyes/eyes-neutral-iris-v1.webp");
  // the fixture on disk really is what the constant claims
  const buf = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..",
    "tools", "avatar", "fixtures", "r2-hair", "eye-iris-mask-v1.png"));
  assert.equal(createHash("sha256").update(buf).digest("hex"), IRIS_MASK_SHA256);
});

test("coverage is measured proportionally, so canvas size does not change the answer", () => {
  // The gate runs on 512x768 in production and on this small canvas in the suite. Both must ask
  // the same question of the same anatomy, or the tests are measuring a different gate.
  const big = { rgba: new Uint8Array(512 * 768 * 4), w: 512, h: 768 };
  const iris = irisMask();
  for (let i = 0; i < iris.m.length; i++) {
    if (!iris.m[i]) continue;
    const j = i * 4;
    big.rgba[j] = 128; big.rgba[j + 1] = 128; big.rgba[j + 2] = 128; big.rgba[j + 3] = 255;
  }
  assert.equal(irisCoverage(big.rgba, 512, 768).covered, iris.count, "full cover must read as full");
  const empty = new Uint8Array(512 * 768 * 4);
  assert.equal(irisCoverage(empty, 512, 768).covered, 0, "empty must read as zero");
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE SUB-THRESHOLD VEIL — the hole a pixel COUNT above ALPHA_INK could never see
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** A continuous layer over the WHOLE iris at a chosen alpha. */
function veilOverIris(alpha) {
  const c = goodShort();
  const iris = irisMask();
  for (let i = 0; i < iris.m.length; i++) {
    if (!iris.m[i]) continue;
    const mx = i % iris.w, my = (i / iris.w) | 0;
    setA(c, Math.floor((mx + 0.5) * W / iris.w), Math.floor((my + 0.5) * H / iris.h), alpha);
  }
  return c;
}

test("COUNTERFACTUAL: a veil at alpha 127 blacks out the pupil — the OLD count rule accepts it", () => {
  // The first D-118 implementation counted pixels at alpha >= ALPHA_INK and required 0. A veil one
  // level below ink obscures half the pupil and contributes ZERO to that count. This reproduces the
  // old rule exactly; if it ever stops accepting the veil, the test below proves nothing.
  const c = veilOverIris(ALPHA_INK - 1);
  const cov = irisCoverage(c.rgba, c.w, c.h);
  assert.equal(cov.inkCovered, 0, "not one pixel reaches the ink threshold — the old rule saw nothing");
  assert.equal(cov.covered, cov.total, "yet every iris pixel is covered");
  assert.ok(cov.obscuredFraction > 0.45, "and roughly half the pupil is actually obscured");
});

test("the hardened rule REFUSES that same veil", () => {
  const g = gate(check(veilOverIris(ALPHA_INK - 1)), "clears-the-eye-line");
  assert.equal(g.pass, false);
  assert.equal(g.detail.irisMaxAlpha, ALPHA_INK - 1);
  assert.equal(g.detail.irisPixelsOpaque, 0, "still zero by the OLD measure — that is the point");
  assert.ok(g.detail.irisObscuredPct > 45);
});

test("a veil is refused at every opacity, down to a single alpha level", () => {
  for (const a of [1, 16, 32, 64, 96, 127, 200, 255]) {
    const g = gate(check(veilOverIris(a)), "clears-the-eye-line");
    assert.equal(g.pass, false, `alpha ${a} over the whole pupil must be refused`);
    assert.equal(g.detail.irisMaxAlpha, a);
  }
});

test("a THIN partly transparent streak across the iris is refused", () => {
  // Not a full veil: a few rows, semi-transparent. Small area, low opacity, still on the pupil.
  const c = goodShort();
  const iris = irisMask();
  const rows = new Set();
  for (let i = 0; i < iris.m.length; i++) if (iris.m[i]) rows.add((i / iris.w) | 0);
  const sorted = [...rows].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)];
  let painted = 0;
  for (let i = 0; i < iris.m.length; i++) {
    if (!iris.m[i]) continue;
    const my = (i / iris.w) | 0;
    if (my < mid || my > mid + 2) continue;
    const mx = i % iris.w;
    setA(c, Math.floor((mx + 0.5) * W / iris.w), Math.floor((my + 0.5) * H / iris.h), 70);
    painted++;
  }
  assert.ok(painted > 0, "the streak must actually land on the iris");
  const g = gate(check(c), "clears-the-eye-line");
  assert.equal(g.pass, false);
  assert.equal(g.detail.irisMaxAlpha, 70);
  assert.equal(g.detail.irisPixelsOpaque, 0, "below ink, so the old rule would have missed it too");
});

test("innocent antialiasing NEAR the iris but not on it still passes", () => {
  // The bound must refuse hair on the pupil, not hair in its neighbourhood. A soft ramp above the
  // topmost iris row is legitimate fringe and must not be punished.
  const c = goodShort();
  const iris = irisMask();
  let top = Infinity;
  for (let i = 0; i < iris.m.length; i++) if (iris.m[i]) top = Math.min(top, (i / iris.w) | 0);
  const y = Math.floor((top + 0.5) * H / iris.h) - 2;
  for (let x = px(60); x < px(100); x++) setA(c, x, y, 90);
  const g = gate(check(c), "clears-the-eye-line");
  assert.equal(g.detail.irisMaxAlpha, 0, "the ramp must not touch the iris");
  assert.equal(g.pass, true, "hair beside the pupil is not hair on the pupil");
});

test("the verdict is the same at runtime size and at unit-test size", () => {
  // The gate runs on 512x768 in production and 256x384 here. A rule that changed answer with the
  // canvas would be measuring the canvas, not the artwork.
  const iris = irisMask();
  const build = (w, h, alpha) => {
    const rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < iris.m.length; i++) {
      if (!iris.m[i]) continue;
      const mx = i % iris.w, my = (i / iris.w) | 0;
      const x = Math.min(w - 1, Math.floor((mx + 0.5) * w / iris.w));
      const y = Math.min(h - 1, Math.floor((my + 0.5) * h / iris.h));
      const j = (y * w + x) * 4;
      rgba[j] = rgba[j + 1] = rgba[j + 2] = 128; rgba[j + 3] = alpha;
    }
    return rgba;
  };
  for (const alpha of [1, 127, 255]) {
    const big = irisCoverage(build(512, 768, alpha), 512, 768);
    const small = irisCoverage(build(W, H, alpha), W, H);
    assert.equal(big.maxAlpha, alpha);
    assert.equal(small.maxAlpha, alpha);
    assert.equal(big.covered, big.total, "full cover at runtime size");
    assert.equal(small.covered, small.total, "full cover at test size");
  }
  assert.equal(irisCoverage(new Uint8Array(512 * 768 * 4), 512, 768).maxAlpha, 0);
  assert.equal(irisCoverage(new Uint8Array(W * H * 4), W, H).maxAlpha, 0);
});

// ── the source -> fixture binding, executable rather than documentary ────────────────────────

test("IRIS_SOURCE_SHA256 is ENFORCED: the shipped iris asset still has the pinned bytes", () => {
  // Without this the constant is decoration. CI cannot decode the .webp — that needs the vendored
  // binary — but it can verify the file's bytes, and that is what pins the mask's origin.
  const src = join(dirname(fileURLToPath(import.meta.url)), "..", "..", IRIS_SOURCE);
  const buf = readFileSync(src);
  assert.equal(createHash("sha256").update(buf).digest("hex"), IRIS_SOURCE_SHA256,
    IRIS_SOURCE + " changed. Regenerate the mask with\n" +
    "  node tools/avatar/build/_view/make-iris-mask.mjs\n" +
    "then update IRIS_SOURCE_SHA256 and IRIS_MASK_SHA256 together, deliberately.");
});

test("the mask fixture is bound to that source: dimensions, ink count and SHA all pinned", () => {
  const m = irisMask();
  assert.equal(m.w, 512, "the mask is at served scale");
  assert.equal(m.h, 768);
  assert.equal(m.count, 1156, "the iris layer's own ink count");
  assert.equal(createHash("sha256").update(readFileSync(IRIS_MASK_FILE)).digest("hex"), IRIS_MASK_SHA256);
});

test("a one-byte change to the fixture would be refused, not silently believed", () => {
  // irisMask() SHA-verifies on load, so a swapped fixture throws rather than quietly redefining
  // where the eyes are. Proven without touching the real file.
  const buf = readFileSync(IRIS_MASK_FILE);
  assert.equal(createHash("sha256").update(buf).digest("hex"), IRIS_MASK_SHA256);
  const tampered = createHash("sha256").update(Buffer.concat([buf, Buffer.from([0])])).digest("hex");
  assert.notEqual(tampered, IRIS_MASK_SHA256);
});
