// D-240: what a closed shoe hides it takes from the picture (method d240) — the brown ankle boot's arch (K16, K18, K19 of D-239's
// review): its outline over C's equally dark foot contour was "explained" by C, so no rule took it; the covering rule hid C's foot
// there and background showed beside the sole. On the CI stand-in (C is private, D-127 §2): a closed shoe whose edge over C's foot
// is painted exactly as C — d239 leaves a hole, d240 takes the picture's own pixels; nothing is painted, transparent picture pixels
// are never taken, open footwear is untouched. The runs on C are recorded in shoe-cover-results-d240.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as WR from "../../tools/avatar/northstar-wardrobe.mjs";
import * as BC from "../../tools/avatar/northstar-base-figure-c.mjs";
import * as IP from "../../tools/avatar/northstar-item-pilot.mjs";
import { recolour } from "../../tools/avatar/northstar-wardrobe-poc.mjs";
import * as NL from "../../tools/avatar/r3-northstar-layers.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."), J = (n) => JSON.parse(readFileSync(join(REPO, "tools", "avatar", "fixtures", "northstar-wardrobe", n), "utf8"));
const w = WR.buildWardrobe(), L = w.base.layers, A = w.anchors, M = w.fg.master, { W, N } = WR;
const LEGS = (() => { const legs = new Uint8ClampedArray(L.pants); for (let i = 0; i < (A.crotchY + 10) * W; i++) legs[i * 4 + 3] = 0; return NL.overStack([M, recolour(legs, { h: 33, s: 0.51, vScale: 1.3 })]); })();
const base = BC.prepareBase(w, LEGS), T = BC.templatesC(w, base, { revision: "d213" });
const shoe = recolour(L.shoes, { h: 20, s: 0.55, vScale: 0.45 });   // a dark brown closed shoe
// the shoe's outer edge over C's foot: in 10 rows the outermost 3 shoe columns that lie over C's body, painted exactly as C there
const block = []; { let rows = 0; const H = N / W; for (let y = H - 1; y > 0 && rows < 10; y--) { let x0 = -1; for (let x = 0; x < W / 2; x++) if (shoe[(y * W + x) * 4 + 3] >= 250) { x0 = x; break; }
  if (x0 < 0 || base.body[(y * W + x0) * 4 + 3] < 250 || base.body[(y * W + x0 + 2) * 4 + 3] < 250) continue; rows++; for (let x = x0; x < x0 + 3; x++) block.push(y * W + x); } }
const pic = (() => { const p = NL.overStack([LEGS, shoe]); for (const i of block) p.set(base.R.subarray(i * 4, i * 4 + 4), i * 4); return p; })();

test("D-240 method: d240 is the default and d239 plus the covered area from the picture; d239 stays as recorded", () => {
  assert.equal(IP.METHOD, "d240"); const a = IP.METHODS.d239, b = IP.METHODS.d240;
  assert.equal(b.coverFromPicture, true); assert.ok(!a.coverFromPicture);
  for (const k of Object.keys(a)) if (k !== "what") assert.deepEqual(b[k], a[k], k + " as in d239");
});

test("D-240 a closed shoe's edge painted exactly as C over C's foot: d239 leaves a hole, d240 takes the picture's own pixels", () => {
  assert.ok(block.length >= 24, "the stimulus lies on the shoe's edge over C's foot: " + block.length);
  const id = "shoes-sneakers-white", a = IP.processItem(w, base, T, "shoes", pic, { itemId: id, method: "d239" }), b = IP.processItem(w, base, T, "shoes", pic, { itemId: id, method: "d240" });
  const inA = block.filter((i) => a.layers.shoes[i * 4 + 3] >= 128).length, inB = block.filter((i) => b.layers.shoes[i * 4 + 3] >= 128).length;
  assert.ok(inA < block.length, "d239 left part of it out: " + inA + " of " + block.length); assert.equal(inB, block.length, "d240 takes it all");
  for (const i of block) for (let c = 0; c < 4; c++) assert.equal(b.layers.shoes[i * 4 + c], pic[i * 4 + c], "the picture's own pixel, unpainted");
  assert.ok(b.observations.coverFromPicturePx >= block.length - inA);
  // nothing but the picture's opaque, hidden area joining the shoe: every pixel d240 adds is hidden by the covering and opaque
  const hid = BC.regionsC(w, base, T, "shoes", { covering: "closed-footwear" }).hidden({ shoes: b.layers.shoes });
  for (let i = 0; i < N; i++) if (b.layers.shoes[i * 4 + 3] && !a.layers.shoes[i * 4 + 3]) { assert.ok(pic[i * 4 + 3] >= 128, "opaque"); assert.ok(hid[i], "hidden by the covering"); }
});

test("D-240 open footwear is not concerned: a sandal keeps C's toes", () => {
  const r = IP.processItem(w, base, T, "shoes", pic, { itemId: "shoes-sandals-brown", method: "d240" }), r0 = IP.processItem(w, base, T, "shoes", pic, { itemId: "shoes-sandals-brown", method: "d239" });
  assert.equal(r.observations.coverFromPicturePx, undefined); assert.deepEqual(Buffer.from(r.layers.shoes), Buffer.from(r0.layers.shoes));
});

test("D-240 results on C: only the brown ankle boot changes (40 px); the other five shoes byte-identical; review findings recorded apart from the owner's feedback", () => {
  const R = J("shoe-cover-results-d240.json"); assert.deepEqual([R.decision, R.method, R.imageCalls], ["D-240", "d240", 0]);
  assert.deepEqual(Object.entries(R.shoes).filter(([, s]) => s.layerPxChanged > 0).map(([id]) => id), ["shoes-ankleboots-brown"]);
  assert.equal(R.shoes["shoes-ankleboots-brown"].coverFromPicturePx, 40);
  assert.deepEqual(R.review.map((x) => [x.point, x.disposition]), [["1 brown ankle boots' sole edge (K16, K18, K19)", "fixed"], ["2 trousers against white sneakers (K17)", "correct and kept"], ["3 beige sneakers' collar (K01, K04, K07, K10, K13)", "correct and kept"], ["4 detail crops", "fixed"], ["5 no unneeded design changes", "kept"]]);
  assert.match(R.ownerFeedback, /withdrawn/); assert.match(R.status, /assistant's review, not the owner's approval/);
});
