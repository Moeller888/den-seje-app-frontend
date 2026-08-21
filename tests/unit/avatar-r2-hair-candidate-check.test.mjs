// Section 167A option A — the acceptance gate for a hair candidate (D-102 §4A).
//
// Every gate is exercised in BOTH directions on synthetic candidates: a clean one passes, and a
// single deliberate defect trips exactly the gate it should. A gate that only ever sees good
// input is indistinguishable from one that cannot fail (the D-085 lesson).
//
// The canvas here is 256x384 rather than the authoring 1024x1536: analyse() derives its C2-unit
// scale from the canvas it is handed, so a proportional canvas measures to the same units and the
// suite stays fast. The dimensions gate is what pins the real authoring size.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  analyse, gates, STYLE_TARGETS, STYLES, BASE, ALPHA_INK,
  SRC_W, SRC_H, OUT_W, OUT_H, MAX_MEAN_SAT, X_TOLERANCE,
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

// A candidate that should satisfy every gate for `short`: sits on the crown, clears the eye line,
// stops above the neck, centred on the skull, inside the style envelope, grey and opaque.
function goodShort() {
  return paint(blank(), { xLo: 55, xHi: 106, yLo: 20, yHi: 54 });
}

const check = (c, style = "short") => gates(analyse(c.rgba, c.w, c.h), style);
const gate = (res, id) => {
  const g = res.find((x) => x.id === id);
  assert.ok(g, "gate not reported: " + id);
  return g;
};
// every gate except the dimensions one, which the small test canvas deliberately fails
const passesExceptDimensions = (res) =>
  res.filter((g) => g.id !== "dimensions").every((g) => g.pass);

// ── the clean candidate ──────────────────────────────────────────────────────────────────────

test("a clean candidate satisfies every measurable gate", () => {
  const res = check(goodShort());
  const failed = res.filter((g) => !g.pass && g.id !== "dimensions").map((g) => g.id);
  assert.deepEqual(failed, [], "unexpected failures: " + JSON.stringify(res, null, 1));
});

test("the authoring canvas is pinned to the torso pipeline", () => {
  assert.equal(SRC_W, 1024);
  assert.equal(SRC_H, 1536);
  assert.equal(OUT_W, 512);
  assert.equal(OUT_H, 768);
  // and the small proportional test canvas really is the odd one out
  assert.equal(gate(check(goodShort()), "dimensions").pass, false);
});

// ── the gate that would silently disable hair colour ─────────────────────────────────────────

test("a candidate that carries its own colour is refused", () => {
  // The runtime multiplies this map over the identity token (D-103). Colour baked into the asset
  // fights the student's choice instead of carrying it, and nothing else would catch it.
  const c = paint(blank(), { xLo: 55, xHi: 106, yLo: 20, yHi: 54, rgb: [140, 90, 40] });
  const res = check(c);
  assert.equal(gate(res, "luminance-map").pass, false);
  assert.ok(gate(res, "luminance-map").detail.meanSat > MAX_MEAN_SAT);
});

test("a grey candidate passes the same gate, so it is measuring chroma and not merely failing", () => {
  assert.equal(gate(check(goodShort()), "luminance-map").pass, true);
  assert.equal(gate(check(goodShort()), "luminance-map").detail.meanSat, 0);
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

test("a detached speck is refused, a single solid shape is not", () => {
  const c = goodShort();
  paint(c, { xLo: 20, xHi: 21, yLo: 100, yHi: 101 });   // one stray fleck away from the hair
  const g = gate(check(c), "no-floating-islands");
  assert.equal(g.pass, false);
  assert.ok(g.detail.components > 1);
  assert.equal(gate(check(goodShort()), "no-floating-islands").pass, true);
});

test("orphan soft pixels are counted as halo", () => {
  const c = goodShort();
  // a drift of translucent pixels with no ink neighbour: the classic bad matte (D-059/D-061)
  paint(c, { xLo: 20, xHi: 40, yLo: 100, yHi: 110, alpha: ALPHA_INK - 40 });
  assert.equal(gate(check(c), "alpha-clean-no-halo").pass, false);
});

test("an empty candidate is reported as empty rather than silently passing", () => {
  const res = check(blank());
  assert.equal(gate(res, "has-ink").pass, false);
  // and nothing downstream pretends to have measured a shape
  assert.equal(res.find((g) => g.id === "luminance-map"), undefined);
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
