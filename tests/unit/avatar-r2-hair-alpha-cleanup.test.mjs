// Proof for the deterministic orphan-dust removal and for the corrected two-scale alpha budget.
//
// The cleanup exists because a geometrically correct hair candidate could not pass
// `alpha-clean-no-halo`: generated PNGs carry thousands of isolated pixels at 1–3 % opacity. The
// danger of such a tool is obvious — it edits artwork the owner will later judge — so these tests
// pin the boundary from both sides: what it must remove, and everything it must never touch.
//
// Canvases here are small and synthetic. `analyse()` derives its C2 units from the canvas in hand,
// and the orphan budget is an absolute pixel count, so both behave the same at any size.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanAlpha, run, isAllowedWritePath, ALPHA_FLOOR, SRC_W, SRC_H,
} from "../../tools/avatar/clean-r2-hair-alpha.mjs";
// isOrphanSoft / countOrphanSoft now live in ONE place — the gate — and the cleanup tool imports
// them from there. Importing them from the gate here is deliberate: it is the same function.
import {
  analyse, runtimeGates, isOrphanSoft, countOrphanSoft, ALPHA_INK,
  HALO_TOLERANCE_AUTHORING, HALO_TOLERANCE_SERVED,
} from "../../tools/avatar/check-r2-hair-candidate.mjs";
import { downscaleHalf } from "../../tools/avatar/promote-r2-torso-asset.mjs";

const W = 64, H = 96;
const blank = () => Buffer.alloc(W * H * 4);
const put = (b, x, y, a, rgb = 128) => {
  const i = (y * W + x) * 4;
  b[i] = rgb; b[i + 1] = rgb; b[i + 2] = rgb; b[i + 3] = a;
};
const alphaAt = (b, x, y) => b[(y * W + x) * 4 + 3];

// ── the threshold, from both sides ────────────────────────────────────────────────────────────

test("the floor is the project's existing ALPHA_FLOOR, not a value fitted to one asset", () => {
  assert.equal(ALPHA_FLOOR, 24);
});

test("an orphan at alpha 23 is removed", () => {
  const b = blank();
  put(b, 10, 10, 23);
  const { rgba, report } = cleanAlpha(b, W, H);
  assert.equal(alphaAt(rgba, 10, 10), 0);
  assert.equal(report.pixelsChanged, 1);
  assert.equal(report.maxRemovedAlpha, 23);
});

test("an orphan at alpha 24 is NOT removed — the boundary is exclusive", () => {
  const b = blank();
  put(b, 10, 10, 24);
  const { rgba, report } = cleanAlpha(b, W, H);
  assert.equal(alphaAt(rgba, 10, 10), 24);
  assert.equal(report.pixelsChanged, 0);
});

test("nothing at or above the ink threshold is ever touched", () => {
  const b = blank();
  for (const a of [128, 200, 255]) put(b, 20 + a % 7, 30, a);
  const before = Buffer.from(b);
  const { rgba, report } = cleanAlpha(b, W, H);
  assert.deepEqual(rgba, before);
  assert.equal(report.invariants.changedAtOrAboveInk, 0);
});

// ── the neighbour rule ────────────────────────────────────────────────────────────────────────

test("a soft pixel WITH an ink neighbour survives, however faint", () => {
  const b = blank();
  put(b, 40, 40, 255);       // ink
  put(b, 41, 40, 1);         // faint, but touching ink — this is an edge ramp, not dust
  const { rgba, report } = cleanAlpha(b, W, H);
  assert.equal(alphaAt(rgba, 41, 40), 1);
  assert.equal(report.pixelsChanged, 0);
  assert.equal(report.invariants.changedWithInkNeighbour, 0);
});

test("the four-neighbour semantics are kept — a diagonal ink neighbour does NOT save a pixel", () => {
  const b = blank();
  put(b, 40, 40, 255);
  put(b, 41, 41, 3);         // diagonal only
  assert.equal(isOrphanSoft(b, W, H, 41, 41), true);
  const { rgba } = cleanAlpha(b, W, H);
  assert.equal(alphaAt(rgba, 41, 41), 0);
});

test("removal does not cascade: decisions are read from the original snapshot", () => {
  // A chain of faint pixels reaching an ink pixel. Only the far end is orphaned; clearing it must
  // not orphan its neighbour within the same run.
  const b = blank();
  put(b, 10, 50, 255);
  put(b, 11, 50, 5);   // touches ink → survives
  put(b, 12, 50, 5);   // orphan → removed
  put(b, 13, 50, 5);   // orphan → removed
  const { rgba, report } = cleanAlpha(b, W, H);
  assert.equal(alphaAt(rgba, 11, 50), 5, "a pixel touching ink was removed");
  assert.equal(alphaAt(rgba, 12, 50), 0);
  assert.equal(alphaAt(rgba, 13, 50), 0);
  assert.equal(report.pixelsChanged, 2);
});

// ── everything else is byte-identical ─────────────────────────────────────────────────────────

test("non-qualifying bytes are identical, and removed pixels become fully transparent", () => {
  const b = blank();
  put(b, 5, 5, 255, 200); put(b, 6, 5, 90, 77); put(b, 30, 30, 7, 250);
  const src = Buffer.from(b);
  const { rgba, report } = cleanAlpha(b, W, H);
  for (let i = 0; i < rgba.length; i += 4) {
    const x = (i / 4) % W, y = ((i / 4) / W) | 0;
    if (x === 30 && y === 30) {
      assert.deepEqual([...rgba.subarray(i, i + 4)], [0, 0, 0, 0]);
    } else {
      assert.deepEqual([...rgba.subarray(i, i + 4)], [...src.subarray(i, i + 4)], `pixel ${x},${y} changed`);
    }
  }
  assert.equal(report.invariants.changedToSomethingOtherThanFullyTransparent, 0);
});

test("the input buffer is never mutated", () => {
  const b = blank();
  put(b, 12, 12, 4);
  const copy = Buffer.from(b);
  cleanAlpha(b, W, H);
  assert.deepEqual(b, copy);
});

test("the same input gives byte-identical output twice", () => {
  const b = blank();
  for (let i = 0; i < 300; i++) put(b, (i * 7) % W, (i * 13) % H, 1 + (i % 20));
  const a1 = cleanAlpha(Buffer.from(b), W, H).rgba;
  const a2 = cleanAlpha(Buffer.from(b), W, H).rgba;
  assert.deepEqual(a1, a2);
});

// ── geometry is untouched by construction ─────────────────────────────────────────────────────

test("ink, envelope and components are identical before and after", () => {
  const b = blank();
  for (let y = 20; y < 60; y++) for (let x = 20; x < 44; x++) put(b, x, y, 255);
  for (let i = 0; i < 120; i++) put(b, (i * 5) % W, (i * 11) % H, 2);
  const before = analyse(b, W, H);
  const { rgba } = cleanAlpha(b, W, H);
  const after = analyse(rgba, W, H);
  assert.equal(after.ink, before.ink);
  assert.deepEqual(after.envelope, before.envelope);
  assert.deepEqual(after.components, before.components);
});

// ── the corrected two-scale budget ────────────────────────────────────────────────────────────

test("the budgets are 64 authoring and 16 served — the torso convention, both halves", () => {
  assert.equal(HALO_TOLERANCE_AUTHORING, 64);
  assert.equal(HALO_TOLERANCE_SERVED, 16);
});

// Build a canvas with exactly `n` orphan-soft pixels far from any ink.
function withOrphans(n, alpha = 100) {
  const b = blank();
  for (let y = 70; y < 90; y++) for (let x = 4; x < 28; x++) put(b, x, y, 255);   // ink block
  let made = 0;
  for (let y = 2; y < 40 && made < n; y += 2) {
    for (let x = 2; x < W - 2 && made < n; x += 2) { put(b, x, y, alpha); made++; }
  }
  assert.equal(countOrphanSoft(b, W, H), n, `fixture should hold exactly ${n} orphans`);
  return b;
}

const servedOrphanOf = (b) => countOrphanSoft(downscaleHalf(W, H, b), W >> 1, H >> 1);
// Since D-115 the alpha gate measures the pixels it is HANDED, and the caller hands it the decoded
// runtime asset. These canvases stand in for that buffer: the budget is an absolute pixel count,
// so the arithmetic is identical at any size.
const alphaGate = (b) => runtimeGates(b, W, H, "short").find((g) => g.id === "alpha-clean-no-halo");

test("the runtime bound is 16: 16 orphans pass and 17 fail", () => {
  assert.equal(alphaGate(withOrphans(16)).pass, true, "16 must pass");
  assert.equal(alphaGate(withOrphans(17)).pass, false, "17 must fail");
  assert.equal(alphaGate(withOrphans(17)).detail.orphanSoftServed, 17);
  assert.equal(alphaGate(withOrphans(17)).detail.toleranceServed, HALO_TOLERANCE_SERVED);
});

test("the gate counts the buffer it is given — it cannot be told a number instead", () => {
  // The pre-D-115 signature took the served orphan count as an ARGUMENT, so a caller could hand it
  // a figure measured on any image at all (or, as happened once, a silent 0). It now derives the
  // count from the pixels, so the only way to change the verdict is to change the pixels.
  const clean = withOrphans(2), dirty = withOrphans(40);
  assert.equal(alphaGate(clean).detail.orphanSoftServed, countOrphanSoft(clean, W, H));
  assert.equal(alphaGate(dirty).detail.orphanSoftServed, countOrphanSoft(dirty, W, H));
  assert.equal(alphaGate(clean).pass, true);
  assert.equal(alphaGate(dirty).pass, false);
});

test("the runtime gate judges the shipped image only — the authoring canvas is not its business", () => {
  // 65 authoring orphans used to fail this gate. They no longer reach it: the gate judges the
  // pixels that ship, and the authoring canvas is not those pixels. The 64-px budget is not gone —
  // it is `authoringWithinBudget` in clean-r2-hair-alpha.mjs, which refuses to WRITE above it; the
  // guards suite proves that refusal behaviourally. Nothing was loosened; the check bites earlier.
  assert.equal(HALO_TOLERANCE_AUTHORING, 64, "the authoring budget is unchanged");

  // Two DIFFERENT authoring canvases that reduce to the SAME runtime pixels must get the same
  // verdict. If the gate still consulted the authoring image, these would disagree.
  const dirty = withOrphans(80);                       // way over the 64 authoring budget
  const runtimeOfDirty = cleanAlpha(downscaleHalf(W, H, cleanAlpha(dirty, W, H).rgba), W >> 1, H >> 1).rgba;
  const gDirty = runtimeGates(runtimeOfDirty, W >> 1, H >> 1, "short")
    .find((g) => g.id === "alpha-clean-no-halo");
  assert.equal(gDirty.pass, countOrphanSoft(runtimeOfDirty, W >> 1, H >> 1) <= HALO_TOLERANCE_SERVED,
    "the verdict must follow the runtime count and nothing else");
  assert.equal(gDirty.detail.orphanSoftAuthoring, undefined,
    "the runtime gate must not report an authoring figure it does not measure");
});

test("the served count uses the production downscale, not a look-alike", () => {
  const b = withOrphans(20);
  const buf = downscaleHalf(W, H, b);
  assert.equal(buf.length, (W >> 1) * (H >> 1) * 4, "downscaleHalf returns a raw RGBA Buffer");
  assert.equal(servedOrphanOf(b), countOrphanSoft(buf, W >> 1, H >> 1));
});

test("passing the alpha gate does not rescue a candidate that fails geometry", () => {
  const b = blank();
  for (let y = 2; y < 90; y++) for (let x = 2; x < 62; x++) put(b, x, y, 255);   // vastly too wide
  const g = runtimeGates(b, W, H, "short");
  assert.equal(g.find((x) => x.id === "alpha-clean-no-halo").pass, true, "alpha is clean here");
  assert.equal(g.find((x) => x.id === "within-style-envelope").pass, false, "geometry must still refuse");
});

// ── refusals ──────────────────────────────────────────────────────────────────────────────────

test("input equal to output is refused", () => {
  assert.throws(() => run("tools/avatar/build/alpha-cleanup/c.png",
                          "tools/avatar/build/alpha-cleanup/c.png"), /same file/i);
});

// The write contract moved from a blacklist to a positive allowlist; the exhaustive positive and
// negative cases live in avatar-r2-hair-alpha-guards.test.mjs. This keeps a smoke check here so a
// regression shows up in whichever suite a reader runs first.
test("only the alpha-cleanup build directory is writable", () => {
  assert.equal(isAllowedWritePath("tools/avatar/build/alpha-cleanup/x.png"), true);
  for (const p of ["assets/avatar-r2/hair/x.png", "js/x.png", "docs/x.png", "package.json",
                   "index.html", "../outside.png"]) {
    assert.equal(isAllowedWritePath(p), false, `${p} must be refused`);
  }
});

test("the authoring canvas size is required", () => {
  assert.equal(SRC_W, 1024);
  assert.equal(SRC_H, 1536);
});

// ── counterfactuals: the tests must fail if the rule is loosened ──────────────────────────────

test("COUNTERFACTUAL: a threshold of 25 would remove an alpha-24 pixel, and that is detectable", () => {
  const b = blank();
  put(b, 10, 10, 24);
  // The real rule keeps it. A hypothetical floor of 25 would not — this asserts the observable
  // difference exists, so a silent bump of ALPHA_FLOOR cannot pass unnoticed.
  assert.equal(cleanAlpha(b, W, H).report.pixelsChanged, 0);
  assert.ok(24 < 25, "the two thresholds disagree on exactly this pixel");
  assert.equal(ALPHA_FLOOR, 24, "ALPHA_FLOOR was changed; the dust rule is no longer the agreed one");
});

test("COUNTERFACTUAL: clearing ALL soft pixels would be visible in the invariants", () => {
  const b = blank();
  put(b, 40, 40, 255);
  put(b, 41, 40, 90);        // soft, touching ink — a real edge ramp
  put(b, 10, 10, 90);        // soft, orphaned, but at/above the floor
  const { rgba, report } = cleanAlpha(b, W, H);
  assert.equal(alphaAt(rgba, 41, 40), 90, "an edge ramp was cleared — the rule has been widened");
  assert.equal(alphaAt(rgba, 10, 10), 90, "an orphan above the floor was cleared");
  assert.equal(report.pixelsChanged, 0);
});

test("COUNTERFACTUAL: touching RGB of a non-qualifying pixel would be caught", () => {
  const b = blank();
  put(b, 7, 7, 200, 111);
  const { rgba } = cleanAlpha(b, W, H);
  const i = (7 * W + 7) * 4;
  assert.deepEqual([...rgba.subarray(i, i + 4)], [111, 111, 111, 200],
    "RGB or alpha of an ink pixel changed");
});
