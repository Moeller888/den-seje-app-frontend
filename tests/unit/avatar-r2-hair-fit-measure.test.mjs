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
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parseSubpaths, columnSpans, measureC2Style, C2_STYLES, C2_HEAD, K,
} from "../../tools/avatar/measure-r2-hair-fit.mjs";
import { STYLE_TARGETS } from "../../tools/avatar/check-r2-hair-candidate.mjs";
// The hair sentinels below call the resolver rather than reading its source: the audit's own
// lesson is that inspecting the code is not the same as measuring what it does.
import { hairSrcForR2, R2_MANIFEST } from "../../js/avatar-layers.js";

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

// This sentinel used to assert the opposite — that hairSrcForR2 ignored the identity handed to it,
// which was the defect the audit exists for. It fired on 2026-08-29 exactly as designed when the
// resolver was made style-aware (D-114), so it now guards the NEW contract instead of the old gap.
// Behaviour, not source text: the audit's own lesson is that reading the code is not the same as
// measuring what it does.
test("hairSrcForR2 resolves the identity's style when that style has an asset", () => {
  assert.equal(hairSrcForR2({ hairstyle: "afro" }), "/assets/avatar-r2/hair/hair-afro-v1.webp");
});

test("a style with NO R2 asset falls back to northstar, and does NOT drop the avatar to C2", () => {
  // The load-bearing half. Hair is a mandatory layer, so returning null here would take the WHOLE
  // avatar to C2 (r2StackSrcsFor) for every student whose style has no artwork yet — a rollback of
  // D-101 delivered by a resolver. Six of the seven styles are in exactly that position today.
  const NORTHSTAR = "/assets/avatar-r2/hair/hair-northstar-v1.webp";
  for (const style of ["short", "tousled", "curly", "long", "ponytail", "buzz",
                       "default", "braid", "sidecut", "buzzcut"]) {
    assert.equal(hairSrcForR2({ hairstyle: style }), NORTHSTAR, `${style} must still render northstar`);
  }
});

test("a hairstyle value from the database cannot reach an inherited property", () => {
  // `hairstyle` is stored data. A bare `R2_MANIFEST.hair[value]` lookup would resolve "constructor"
  // to Function rather than to a registered asset.
  const NORTHSTAR = "/assets/avatar-r2/hair/hair-northstar-v1.webp";
  for (const junk of ["constructor", "__proto__", "toString", "", "northstar-v1", 42, null, undefined]) {
    assert.equal(hairSrcForR2({ hairstyle: junk }), NORTHSTAR, `${String(junk)} must fall back`);
  }
  for (const junk of [null, undefined, "x", 7, {}]) {
    assert.equal(hairSrcForR2(junk), NORTHSTAR, "a malformed identity must fall back");
  }
});

test("northstar stays registered — it is the fallback the whole R2 path leans on", () => {
  assert.ok(Object.prototype.hasOwnProperty.call(R2_MANIFEST.hair, "northstar"),
    "removing northstar would drop every un-produced style's avatar to C2");
});

// ── the approved afro asset is UNTOUCHED by the D-115 gate work ───────────────────────────────
// D-115 changed WHICH image the acceptance gates measure and widened `no-floating-islands` to
// eight neighbours. Neither is allowed to rewrite artwork the owner already signed off, and the
// only way to prove that is to pin the bytes. This is deliberately a plain hash of the tracked
// file, so it runs in CI and does not depend on the vendored libwebp binaries.
test("the owner-approved afro asset is byte-for-byte unchanged", () => {
  const asset = join(REPO, "assets", "avatar-r2", "hair", "hair-afro-v1.webp");
  const buf = readFileSync(asset);
  assert.equal(buf.length, 36356, "the afro asset changed size");
  assert.equal(createHash("sha256").update(buf).digest("hex"),
    "675f8f951c65266c75cc661163219a7958b612b0d45ec9471655f0bebf9eb09a",
    "the afro asset was rebuilt or re-encoded — the owner approved THESE bytes (D-114)");
});

test("the approved afro CANDIDATE fixtures are unchanged too", () => {
  // The cleaned PNG is what the owner actually reviewed at render scale; the original is its
  // provenance. clean-r2-hair-alpha.mjs changed version in D-115, so pinning these proves the
  // change was to a postcondition and not to a pixel.
  const fix = (f) => createHash("sha256")
    .update(readFileSync(join(REPO, "tools", "avatar", "fixtures", "r2-hair", f))).digest("hex");
  assert.equal(fix("afro-original.png"),
    "14a037a044ddcd05df328cc47a4a92fda4bbcdb8f9bb9122b10b7fceaa9c2b3e");
  assert.equal(fix("afro-cleaned.png"),
    "0dacc5ce56f9915bb1fb2abe2774355f8ebda60319b2daa8e4779cfd07fa6bfd");
});

// ── STYLE_TARGETS is the ARTWORK's own measurement, not a hand-typed table (D-116) ────────────
// The acceptance gate judges every candidate against these four numbers per style. If they can
// drift from the C2 assets, the gate slowly starts enforcing a shape nobody authored. So they are
// re-derived here from the same tool and the same exact path crossings that produced them, and
// required to match. Change an SVG and this test fails until the table is updated deliberately.
test("every STYLE_TARGETS number is re-derived from the C2 path data and matches", () => {
  for (const style of C2_STYLES) {
    const m = measureC2Style(style);
    const t = STYLE_TARGETS[style];
    assert.ok(t, `${style} missing from STYLE_TARGETS`);
    assert.equal(t.xLo, m.xSpan.x0, `${style} xLo drifted from the artwork`);
    assert.equal(t.xHi, m.xSpan.x1, `${style} xHi drifted from the artwork`);
    assert.equal(t.lowestY, m.lowestY, `${style} lowestY drifted from the artwork`);
    assert.equal(t.highestY, Math.round(m.highestY * 100) / 100, `${style} highestY drifted from the artwork`);
    assert.equal(t.drapes, m.drapes, `${style} drapes flag drifted from the artwork`);
  }
});

test("highestY is the mirror of lowestY — same scan, same crossings, opposite extreme", () => {
  // The top was simply never computed. This pins that it is the SAME measurement as the bottom,
  // so no second, looser notion of "how tall is this style" can appear later.
  for (const style of C2_STYLES) {
    const m = measureC2Style(style);
    assert.ok(m.highestY < m.lowestY, `${style}: top must be above bottom`);
    assert.ok(Number.isFinite(m.highestY), `${style}: highestY not measured`);
    // every measured column top must be at or below the style's overall crown
    for (const c of m.cols) {
      if (c.crown === null) continue;
      assert.ok(c.crown >= m.highestY - 1e-9,
        `${style}: column crown ${c.crown} sits above the overall highest ${m.highestY}`);
    }
  }
});

test("the seven crowns are ordered as the styles look, buzz flattest and afro tallest", () => {
  // A sanity check on the numbers themselves: if a future edit inverted the sign or mixed up the
  // axis, this ordering breaks long before a candidate is judged against a nonsense bound.
  const top = (s) => STYLE_TARGETS[s].highestY;
  assert.ok(top("buzz") > top("short"), "buzz must be flatter than short");
  assert.ok(top("short") > top("ponytail"), "short must be flatter than ponytail");
  assert.ok(top("ponytail") > top("long"), "ponytail must be flatter than long");
  assert.ok(top("long") > top("curly"), "long must be flatter than curly");
  assert.ok(top("curly") > top("tousled"), "curly must be flatter than tousled");
  assert.ok(top("tousled") > top("afro"), "tousled must be flatter than afro");
});
