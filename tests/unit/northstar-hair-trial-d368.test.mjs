// D-368: the Northstar hairstyle trial is private review material. Its pure checks and repairs are pinned here on small synthetic layers
// (the full trial decodes the runtime files and runs on the owner's machine: tools/avatar/northstar-hair-trial-d368.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const T = await import(pathToFileURL(join(ROOT, "tools", "avatar", "northstar-hair-trial-d368.mjs")).href);
const P = await import(pathToFileURL(join(ROOT, "tools", "avatar", "northstar-hair-preview-d368.mjs")).href);
const PO = await import(pathToFileURL(join(ROOT, "tools", "avatar", "northstar-hair-polish-d368.mjs")).href);
const W = 1024, N = 1024 * 1536;
const layer = (fill) => { const o = new Uint8ClampedArray(N * 4); fill(o); return o; };
const put = (o, x, y, rgba) => o.set(rgba, (y * W + x) * 4);
const at = (o, x, y) => [...o.subarray((y * W + x) * 4, (y * W + x) * 4 + 4)];

test("the trial is review material: it cannot be promoted; round 2 keeps Northstar, Kort and Afro (no hybrid) and three colours", () => {
  assert.throws(() => T.promote(), /cannot be promoted/);
  assert.deepEqual([...T.CANDIDATES], ["northstar", "short", "afro"]);
  assert.deepEqual([...T.VARIANTS], ["before", "after"]);
  assert.deepEqual(Object.keys(T.COLOURS), ["source", "black", "blonde"]);
  assert.ok(Object.values(T.COLOURS).filter(Boolean).every((c) => c.method === "map"), "black and blonde through the tone curve");
  assert.match(T.REVIEW_STATUS, /PRIVATE TRIAL/);
});

test("toGrey keeps alpha and maps the bright end to white; mapTint keeps alpha and runs dark → light with the grey", () => {
  const src = layer((o) => { put(o, 0, 0, [40, 30, 20, 255]); put(o, 1, 0, [120, 90, 60, 128]); put(o, 2, 0, [200, 150, 100, 255]); });
  const g = T.toGrey(src);
  assert.equal(g[3], 255); assert.equal(g[7], 128); assert.equal(g[11], 255); assert.equal(g[12 + 3], 0);
  assert.ok(g[0] < g[4] && g[4] < g[8], "order kept");
  assert.equal(g[8], 255, "the bright end maps to white");
  const m = T.mapTint(g, T.TOKENS.blonde);
  assert.equal(m[3], 255); assert.equal(m[7], 128);
  const L = (i) => 0.299 * m[i] + 0.587 * m[i + 1] + 0.114 * m[i + 2];
  assert.ok(L(0) < L(4) && L(4) < L(8), "light and shadow kept");
  assert.ok(L(8) > 0.299 * 0xc9 + 0.587 * 0x9a + 0.114 * 0x5b, "the highlight is lighter than the token's base: a light colour stays light");
});

test("browCheck: an uncovered brow is one piece; a mostly covered brow with a small separate piece is a loose stump", () => {
  const brow = layer((o) => { for (let x = 100; x < 200; x++) for (let y = 100; y < 106; y++) put(o, x, y, [80, 50, 30, 255]); });
  assert.deepEqual(T.browCheck(brow, layer(() => {})), { coveredShare: 0, visiblePieces: 1, pieces: [600], looseStump: false });
  const hair = layer((o) => { for (let x = 100; x < 192; x++) if (x < 120 || x >= 130) for (let y = 100; y < 106; y++) put(o, x, y, [0, 0, 0, 255]); });
  const r = T.browCheck(brow, hair);
  assert.ok(r.coveredShare > 0.8); assert.equal(r.visiblePieces, 2); assert.equal(r.looseStump, true);
});

test("browResidue removes a thin spike and a speck but keeps the brow's body; the reference patch holds exactly what was removed", () => {
  const browL = layer((o) => { for (let x = 300; x < 380; x++) for (let y = 300; y < 310; y++) put(o, x, y, [90, 50, 25, 255]); for (let y = 290; y < 300; y++) put(o, 360, y, [90, 50, 25, 255]); put(o, 330, 330, [230, 140, 60, 255]); });
  const r = PO.browResidue({ browL });
  assert.equal(at(r.layers.browL, 340, 305)[3], 255, "the body stays");
  assert.equal(at(r.layers.browL, 360, 292)[3], 0, "the spike goes");
  assert.equal(at(r.layers.browL, 330, 330)[3], 0, "the speck goes");
  assert.deepEqual(at(r.patch, 360, 292), [90, 50, 25, 255]);
  for (let i = 0; i < N * 4; i += 4) if (r.patch[i + 3]) assert.equal(r.layers.browL[i + 3], 0, "patch and brow never overlap");
});

test("headStack: with the patches in their own places the old head composes exactly as before", () => {
  const skin = layer((o) => { for (let x = 0; x < 20; x++) put(o, x, 0, [200, 160, 120, 255]); });
  const fixedSkin = layer((o) => { for (let x = 0; x < 20; x++) put(o, x, 0, [190, 150, 110, 255]); });
  const browOld = layer((o) => { put(o, 5, 0, [80, 40, 20, 200]); put(o, 6, 0, [80, 40, 20, 255]); }), browNew = layer((o) => put(o, 6, 0, [80, 40, 20, 255]));
  const hair = layer((o) => put(o, 7, 0, [60, 30, 10, 128]));
  const old = PO.headStack({ skin, browL: browOld, hair }, ["skin", "browL", "hair"]);
  const skinPatch = layer((o) => { for (let x = 0; x < 20; x++) put(o, x, 0, [200, 160, 120, 255]); }), browPatch = layer((o) => put(o, 5, 0, [80, 40, 20, 200]));
  const again = PO.headStack({ skin: fixedSkin, browL: browNew, hair }, ["skin", "browL", "hair"], { skin: skinPatch, browL: browPatch });
  assert.deepEqual([...again.subarray(0, 80)], [...old.subarray(0, 80)]);
});

test("outlineHair darkens the hair's own edge toward ink and leaves the inside; earOpening clears the ear and shades the curls next to it", () => {
  const hair = layer((o) => { for (let x = 100; x < 140; x++) for (let y = 100; y < 140; y++) put(o, x, y, [200, 200, 200, 255]); });
  const out = PO.outlineHair(hair);
  assert.ok(at(out, 100, 120)[0] < 60, "the edge is dark");
  assert.equal(at(out, 120, 120)[0], 200, "the inside keeps its tone");
  const ears = new Uint8Array(N); for (let x = 110; x < 120; x++) for (let y = 110; y < 120; y++) ears[y * W + x] = 1;
  const op = PO.earOpening(hair, ears);
  assert.equal(at(op.px, 115, 115)[3], 0, "the ear is open");
  assert.ok(at(op.px, 124, 115)[0] < 200, "the curls along the opening are shaded");
  assert.equal(at(op.px, 135, 135)[0], 200, "curls further away are untouched");
});

test("lightFringe finds pale half-transparent edge pixels and nothing in an even layer", () => {
  const even = layer((o) => { for (let x = 0; x < 50; x++) put(o, x, 10, [60, 40, 30, 255]); put(o, 50, 10, [60, 40, 30, 120]); });
  assert.equal(T.lightFringe(even).px, 0);
  const pale = layer((o) => { for (let x = 0; x < 50; x++) put(o, x, 10, [60, 40, 30, 255]); put(o, 50, 10, [230, 230, 230, 120]); });
  assert.equal(T.lightFringe(pale).px, 1);
});

test("the preview is private and Danish, says the reference is identical, and makes no image call", () => {
  const v = { checks: { browL: { visiblePieces: 1 }, browR: { visiblePieces: 1 }, ears: { visibleShare: 1, visiblePieces: 2 }, lightFringe: 0 } };
  const html = P.page({ referenceIdentical: { head: true, figure: true }, repairs: { browResiduePx: 37, foreheadSpotPx: 350, foreheadSpotPxLeft: 18, earPx: 4766 },
    regions: Object.fromEntries(["forehead", "templeL", "templeR", "earL", "earR"].map((k) => [k, { x: 0, y: 0, w: 10, h: 10 }])),
    candidates: { northstar: { variants: { after: v } }, short: { variants: { before: v, after: v } }, afro: { variants: { before: v, after: v } } } });
  assert.match(html, /<html lang="da">/);
  assert.match(html, /Intet er godkendt, publiceret eller aktiveret, og der er ingen nye billedkald/);
  assert.match(html, /hovedet identisk med appens, helfiguren identisk/);
  assert.ok(!/Hybrid \(/.test(html.replace("Hybrid er taget ud af første udvalg", "")), "no hybrid candidate");
  assert.ok(!/https?:\/\//.test(html), "no external resource");
  for (const f of ["northstar-hair-trial-d368.mjs", "northstar-hair-polish-d368.mjs"]) {
    const src = readFileSync(join(ROOT, "tools", "avatar", f), "utf8");
    assert.ok(!/openai|images\/edits|fetch\(/.test(src), f + ": no image call");
  }
});
