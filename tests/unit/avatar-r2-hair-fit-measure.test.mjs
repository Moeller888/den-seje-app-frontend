// ── D-102: the geometry behind the R2 hair-identity audit ────────────────────────────────────
// docs/167a-r2-hair-identity-audit.md recommends a decision from measured numbers. A number that
// nothing verifies is a number that can rot: the SVG path-crossing maths could regress, a hair
// asset could be re-authored, or an eighth hairstyle could be added to the runtime — and the
// audit would keep quoting figures that no longer describe what ships.
//
// These tests pin exactly that. They exercise the PURE geometry only (SVG path data + repo
// constants), never the raster half of the tool, so they run in CI like the rest of the suite.
//
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parseSubpaths, columnSpans, measureC2Style, C2_STYLES, C2_HEAD, K,
} from "../../tools/avatar/measure-r2-hair-fit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const LAYERS = readFileSync(join(REPO, "js", "avatar-layers.js"), "utf8");

// The audit's §3.3 table, at the face-centre column x=80. Re-authoring a hair asset must break
// this and force the document to be re-derived rather than silently drift away from the art.
const CENTRE_HAIRLINE = {
  short: 33.0, tousled: 33.0, curly: 35.0, long: 31.0, ponytail: 37.0, buzz: 34.0, afro: 36.0,
};

test("the column-crossing maths is exact, not sampled", () => {
  // A parabola whose crossing is analytically known: p0=(0,0) c=(10,20) p1=(20,0) gives
  // x(t)=20t, so x=10 is exactly t=0.5 and y=2*0.5*0.5*20=10. The implicit close runs along y=0.
  const subs = parseSubpaths("M 0 0 Q 10 20 20 0 Z");
  const spans = columnSpans(subs, 10);
  assert.equal(spans.length, 1, "one filled span at the apex column");
  const [top, bottom] = spans[0];
  assert.ok(Math.abs(top - 0) < 1e-9, `span top ${top} should be exactly 0`);
  assert.ok(Math.abs(bottom - 10) < 1e-9, `span bottom ${bottom} should be exactly 10`);
});

test("a straight-line path crosses where arithmetic says it does", () => {
  const subs = parseSubpaths("M 0 0 L 20 20 L 20 0 Z");
  const spans = columnSpans(subs, 10);
  assert.equal(spans.length, 1);
  assert.ok(Math.abs(spans[0][0] - 0) < 1e-9);
  assert.ok(Math.abs(spans[0][1] - 10) < 1e-9);
});

test("all seven C2 hair assets parse and put a hairline on the forehead", () => {
  for (const style of C2_STYLES) {
    const m = measureC2Style(style);
    const centre = m.cols.find((c) => c.c2x === 80);
    assert.ok(centre, `${style}: no centre column`);
    assert.ok(centre.crown !== null && centre.hairline !== null, `${style}: centre column is empty`);
    assert.ok(centre.crown < centre.hairline, `${style}: crown must sit above the hairline`);
    // The hairline must stay above the C2 eye anchor — the 155D authoring rule "eyes never covered".
    assert.ok(centre.hairline < C2_HEAD.eyeCy,
      `${style}: hairline ${centre.hairline} is at or below the eye anchor ${C2_HEAD.eyeCy}`);
  }
});

test("the audit's centre-column hairlines still describe the assets", () => {
  for (const style of C2_STYLES) {
    const centre = measureC2Style(style).cols.find((c) => c.c2x === 80);
    const expected = CENTRE_HAIRLINE[style];
    assert.ok(Math.abs(centre.hairline - expected) < 0.05,
      `${style}: centre hairline is ${centre.hairline.toFixed(2)}, the audit says ${expected} — ` +
      "if the asset changed on purpose, re-run npm run avatar:r2-hair-fit and update D-102");
  }
});

test("exactly two styles drape below the head, and the audit says which", () => {
  const drapes = C2_STYLES.filter((s) => measureC2Style(s).drapes).sort();
  assert.deepEqual(drapes, ["long", "ponytail"],
    "§6 flags long/ponytail as the two styles whose fit also depends on the shoulder line");
});

test("the measured style set is the runtime's selectable set", () => {
  // An eighth hairstyle in the runtime means the audit covers 7 of 8 and must be re-run.
  const m = /export const C2_HAIRSTYLES = \[([^\]]+)\]/.exec(LAYERS);
  assert.ok(m, "C2_HAIRSTYLES not found in js/avatar-layers.js");
  const runtime = m[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  assert.deepEqual([...C2_STYLES].sort(), [...runtime].sort(),
    "the runtime hairstyle set changed — re-run the measurement before trusting D-102");
});

test("the C2 head contract the assets were authored against is unchanged", () => {
  // Every number in the audit is a delta against this contract; if the C2 geometry moves, the
  // deltas are meaningless. The contract lives as the locked comment above BODY_SRCS_C2.
  assert.match(LAYERS, /head cx=80 cy=50 r=30/,
    "the locked C2 head contract moved — the audit's deltas no longer mean anything");
  assert.deepEqual(C2_HEAD, { cx: 80, cy: 50, r: 30, eyeCy: 47 });
});

test("the canvas conversion matches the served R2 dimensions", () => {
  // 512x768 served -> the 160x240 C2 canvas. Both paths must be quoted in the same units or the
  // whole comparison is off by a factor.
  assert.equal(K, 0.3125);
  assert.match(LAYERS, /R2_SERVED = \{ width: 512, height: 768 \}/,
    "the served R2 size changed — the audit's C2-canvas conversion is stale");
});

test("hairSrcForR2 still ignores the identity it is handed", () => {
  // The defect the audit exists for. When this stops being true, D-102 has been acted on and the
  // document must be closed rather than left describing a fixed system.
  const fn = /export function hairSrcForR2\(identity\) \{([\s\S]*?)\n\}/.exec(LAYERS);
  assert.ok(fn, "hairSrcForR2 not found");
  assert.ok(!/identity/.test(fn[1]),
    "hairSrcForR2 now reads `identity` — the R2 hair gap may be closed; update D-102 and this test");
  assert.match(fn[1], /R2_MANIFEST\.hair\["northstar"\]/,
    "hairSrcForR2 no longer resolves the single northstar asset — re-derive the audit");
});
