// D-368: the Northstar hairstyle trial is private review material. Its pure checks are pinned here on small synthetic layers (the full
// trial decodes the runtime files and runs on the owner's machine: tools/avatar/northstar-hair-trial-d368.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const T = await import(pathToFileURL(join(ROOT, "tools", "avatar", "northstar-hair-trial-d368.mjs")).href);
const P = await import(pathToFileURL(join(ROOT, "tools", "avatar", "northstar-hair-preview-d368.mjs")).href);
const W = 1024, N = 1024 * 1536;
const layer = (fill) => { const o = new Uint8ClampedArray(N * 4); fill(o); return o; };
const put = (o, x, y, rgba) => o.set(rgba, (y * W + x) * 4);

test("the trial is review material: it cannot be promoted and names the four candidates and the colours", () => {
  assert.throws(() => T.promote(), /cannot be promoted/);
  assert.deepEqual([...T.CANDIDATES], ["northstar", "short", "afro", "hybrid"]);
  assert.deepEqual(Object.keys(T.COLOURS), ["source", "black", "blonde", "blonde-map"]);
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
  const none = layer(() => {});
  assert.deepEqual(T.browCheck(brow, none), { coveredShare: 0, visiblePieces: 1, pieces: [600], looseStump: false });
  const hair = layer((o) => { for (let x = 100; x < 192; x++) if (x < 120 || x >= 130) for (let y = 100; y < 106; y++) put(o, x, y, [0, 0, 0, 255]); });
  const r = T.browCheck(brow, hair);
  assert.ok(r.coveredShare > 0.8);
  assert.equal(r.visiblePieces, 2);
  assert.equal(r.looseStump, true);
});

test("lightFringe finds pale half-transparent edge pixels and nothing in an even layer", () => {
  const even = layer((o) => { for (let x = 0; x < 50; x++) put(o, x, 10, [60, 40, 30, 255]); put(o, 50, 10, [60, 40, 30, 120]); });
  assert.equal(T.lightFringe(even).px, 0);
  const pale = layer((o) => { for (let x = 0; x < 50; x++) put(o, x, 10, [60, 40, 30, 255]); put(o, 50, 10, [230, 230, 230, 120]); });
  assert.equal(T.lightFringe(pale).px, 1);
});

test("the preview is private: Danish, never published, and it says hats switch Northstar back to today's avatar", () => {
  const html = P.page({ regions: { forehead: { x: 0, y: 200, w: 10, h: 10 } }, headBox: { x0: 300, y0: 50, x1: 700, y1: 600 },
    candidates: Object.fromEntries(T.CANDIDATES.map((c) => [c, { colours: { source: "x" }, checks: { bareCranium: 0, browL: { coveredShare: 0, visiblePieces: 1, looseStump: false }, browR: { coveredShare: 0, visiblePieces: 1, looseStump: false }, lightFringe: 0 } }])) });
  assert.match(html, /<html lang="da">/);
  assert.match(html, /Privat forhåndsvisning\. Intet er godkendt, publiceret eller aktiveret\./);
  assert.match(html, /med hat på vises elevens nuværende avatar i stedet/);
  assert.ok(!/https?:\/\//.test(html.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, "")), "no external resource");
  const src = readFileSync(join(ROOT, "tools", "avatar", "northstar-hair-trial-d368.mjs"), "utf8");
  assert.match(src, /dir outside the repository/);
  assert.ok(!/openai|images\/edits|fetch\(/.test(src), "no image call");
});
