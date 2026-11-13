// D-373 — the three runtime heads of the Northstar hair choice, rebuilt from the existing sources. Deterministic, offline; no image call.
//   1. D-372: NH-4's one returned image → the bound grey and brown hair layers (northstar-hair-nh4-exception-d372.mjs; refused unless they
//      are exactly D-372's bound files);
//   2. the shorter temple tip (owner, 2026-11-12, private V4 trial): in both layers ONLY the thin tip at the image-left temple (figure x
//      383–398, rows 299–311) is compressed into rows 299–304 — the same pixel move in grey and brown, nothing painted, nothing else moved;
//   3. one shared head base: the clean head (its clean ear junction) above y 430, the app's own runtime neck below — the R3 head stack minus
//      runtimeHead's neck-edge cut, read from the published figure-head-v1.webp, so the light arc across the neck (the skin layer's leftover
//      collar edge) stays gone;
//   4. on that base: Northstar's standard hair with its own hair shadow (byte for byte the app's head wherever the base equals the app's bald
//      head; the shadow only on skin; hair pieces wholly below the ear tops removed; the hair under the ear's semi-transparent top edge),
//      and NH-4 in its original grey and in Northstar's brown. Every head: no hair on the ears, the ears are the base's own pixels (the
//      standard hair's 49 ear-edge pixels have hair behind them).
// The images (NH-4's raw image, the clean head, its ear mask) stay outside the clones; only the three finished heads are published.
// Usage: node tools/avatar/build-northstar-hair-heads-d373.mjs --raw <nh.image-1.png> --clean <clean head png> --ear <ear mask png>
//          --swept <side-swept hair layer png> --cwebp <cwebp.exe> --dwebp <dwebp.exe> (--out <empty dir outside the repository> | --publish)
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, mkdtempSync } from "node:fs";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import * as FIG from "./r3-northstar-figure.mjs";
import * as HD from "./r3-northstar-head.mjs";
import * as NL from "./r3-northstar-layers.mjs";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as X from "./northstar-hair-nh4-exception-d372.mjs";
import { CWEBP_ARGS } from "./build-northstar-runtime-assets.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const FIXTURE = "tools/avatar/fixtures/northstar-hair-d371/hair-heads-d373-v1.json";
export const ASSET_DIR = "assets/avatar-northstar-hair";
export const APP_HEAD = "assets/avatar-northstar/figure-head-v1.webp";
const W = 1024, H = 1536, N = W * H;
export const NECK_Y = 430, EAR_TOP_Y = 340, RIM_REACH = 3;
export const TIP = Object.freeze({ x: Object.freeze([383, 398]), rows: Object.freeze([299, 311]), into: Object.freeze([299, 304]) });
export const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const same = (a, b, i) => a[i * 4] === b[i * 4] && a[i * 4 + 1] === b[i * 4 + 1] && a[i * 4 + 2] === b[i * 4 + 2] && a[i * 4 + 3] === b[i * 4 + 3];

/** The shorter temple tip: rows 299–311 of the box compressed into 299–304; the rest of the box becomes transparent. */
export function templeTip(L) {
  const o = new Uint8ClampedArray(L), [X0, X1] = TIP.x, [Y0, Y1] = TIP.rows, YE = TIP.into[1];
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) o.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 4);
  for (let y = Y0; y <= YE; y++) for (let x = X0; x <= X1; x++) { const ys = Math.round(Y0 + (y - Y0) * (Y1 - Y0) / (YE - Y0)); o.set(L.subarray((ys * W + x) * 4, (ys * W + x) * 4 + 4), (y * W + x) * 4); }
  return o;
}
// one pixel of NL.overStack (the same arithmetic): `top` over `under`, straight alpha, rounded once
const over1 = (under, top) => { const o = [0, 0, 0, 0]; for (const p of [under, top]) { const a = p[3] / 255; if (!a) continue; for (let c = 0; c < 3; c++) o[c] = p[c] * a + o[c] * (1 - a); o[3] = a + o[3] * (1 - a); }
  const r = new Uint8ClampedArray(4); r[3] = Math.round(o[3] * 255); if (o[3]) for (let c = 0; c < 3; c++) r[c] = Math.round(o[c] / o[3]); return r; };

/** The shared base and the three heads from the decoded inputs: clean head, ear mask, the app's published head, and the two NH-4 layers. */
export function buildHeads({ clean, ear, appHead, grey, brown }) {
  const L = FIG.buildFigure().layers;
  // the app's head is the full R3 head stack minus the runtime neck-edge cut: find the cut, and refuse anything else
  const full = HD.composeHead(L), cut = new Uint8Array(N); let other = 0;
  for (let i = 0; i < N; i++) if (!same(full, appHead, i)) { if (appHead[i * 4 + 3] === 0 && full[i * 4 + 3] > 0 && ((i / W) | 0) >= NECK_Y) cut[i] = 1; else other++; }
  if (other) throw new Error("the app head is not the R3 head stack minus the neck cut: " + other + " px");
  const fullCut = new Uint8ClampedArray(full); for (let i = 0; i < N; i++) if (cut[i]) fullCut[i * 4 + 3] = 0;
  const appBald = HD.composeHead(L, { include: HD.COMPOSITE_ORDER.filter((k) => k !== "hair" && k !== "hairShadow") }); for (let i = 0; i < N; i++) if (cut[i]) appBald[i * 4 + 3] = 0;
  const base = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) base.set(((i / W) | 0) >= NECK_Y ? appBald.subarray(i * 4, i * 4 + 4) : clean.subarray(i * 4, i * 4 + 4), i * 4);
  const D = new Uint8Array(N); for (let i = 0; i < N; i++) if (!same(base, appBald, i)) D[i] = 1;
  // a hairstyle on the base: no hair under the ears, the base's own pixels wherever nothing is drawn and on the ears
  const onBase = (layers) => {
    const ls = layers.map((l) => { const c = new Uint8ClampedArray(l); for (let i = 0; i < N; i++) if (ear[i * 4 + 3]) c[i * 4 + 3] = 0; return c; });
    const o = NL.overStack([base, ...ls]); for (let i = 0; i < N; i++) if (ear[i * 4 + 3] || ls.every((l) => l[i * 4 + 3] === 0)) o.set(base.subarray(i * 4, i * 4 + 4), i * 4);
    return o;
  };
  // the standard hair: its shadow only on skin, no hair on the ears, no hair piece wholly below the ear tops
  const shadow2 = new Uint8ClampedArray(L.hairShadow); for (let i = 0; i < N; i++) shadow2[i * 4 + 3] = ear[i * 4 + 3] ? 0 : Math.round(L.hairShadow[i * 4 + 3] * base[i * 4 + 3] / 255);
  const hair2 = new Uint8ClampedArray(L.hair); for (let i = 0; i < N; i++) if (ear[i * 4 + 3]) hair2[i * 4 + 3] = 0;
  let residuePx = 0; { const lab = new Uint8Array(N); for (let i = 0; i < N; i++) if (hair2[i * 4 + 3] && !lab[i]) { const st = [i], all = []; lab[i] = 1; let top = 1e9;
    while (st.length) { const k = st.pop(); all.push(k); top = Math.min(top, (k / W) | 0); for (const q of [k - 1, k + 1, k - W, k + W, k - W - 1, k - W + 1, k + W - 1, k + W + 1]) if (q >= 0 && q < N && hair2[q * 4 + 3] && !lab[q]) { lab[q] = 1; st.push(q); } }
    if (top > EAR_TOP_Y) { for (const k of all) hair2[k * 4 + 3] = 0; residuePx += all.length; } } }
  let shadowClippedPx = 0; for (let i = 0; i < N; i++) if (shadow2[i * 4 + 3] !== L.hairShadow[i * 4 + 3] && !ear[i * 4 + 3]) shadowClippedPx++;
  const stdOver = onBase([shadow2, hair2]), standard = new Uint8ClampedArray(N * 4);
  const own = (i) => !D[i] && !ear[i * 4 + 3] && hair2[i * 4 + 3] === L.hair[i * 4 + 3] && shadow2[i * 4 + 3] === L.hairShadow[i * 4 + 3];
  for (let i = 0; i < N; i++) standard.set(own(i) ? fullCut.subarray(i * 4, i * 4 + 4) : stdOver.subarray(i * 4, i * 4 + 4), i * 4);
  // the standard hair lies under the ear's semi-transparent edge where it meets the ear (the ear pixel drawn over the hair just above)
  const before = new Uint8ClampedArray(standard); let rimPx = 0;
  for (let i = 0; i < N; i++) { if (!ear[i * 4 + 3] || base[i * 4 + 3] >= 255) continue;
    for (let k = 1; k <= RIM_REACH; k++) { const q = i - k * W; if (q < 0) break; if (ear[q * 4 + 3]) continue;
      if (before[q * 4 + 3] >= 200 && (hair2[q * 4 + 3] >= 128 || shadow2[q * 4 + 3] > 0)) { standard.set(over1(before.subarray(q * 4, q * 4 + 4), base.subarray(i * 4, i * 4 + 4)), i * 4); rimPx++; } break; } }
  const heads = { standard, "nh4-grey": onBase([templeTip(grey)]), "nh4-brown": onBase([templeTip(brown)]) };
  // checks: the neck below y 430 is the app's own; the face features are the app's; the ears are the base's (but the standard hair's edge)
  const feat = (i) => ["browL", "browR", "nose", "mouth", "iris", "eyesFixed"].some((k) => L[k][i * 4 + 3] > 0);
  const stats = { neckCutPx: cut.reduce((a, v) => a + v, 0), baseDiffersFromAppBaldPx: D.reduce((a, v) => a + v, 0), standard: { shadowClippedPx, residueBelowEarTopsRemovedPx: residuePx, earEdgeOverHairPx: rimPx }, heads: {} };
  for (const [name, p] of Object.entries(heads)) {
    let neck = 0, earSame = 0, earN = 0, featDiff = 0; for (let i = 0; i < N; i++) { const y = (i / W) | 0; if (y >= NECK_Y && !same(p, fullCut, i)) neck++; if (ear[i * 4 + 3]) { earN++; if (same(p, base, i)) earSame++; } if (feat(i) && !same(base, appBald, i)) featDiff++; }
    stats.heads[name] = { neckBelowY430DiffersFromAppPx: neck, earPxIdenticalToBase: earSame + "/" + earN };
    stats.faceFeaturePxBaseDiffersFromApp = featDiff;
  }
  return { heads, stats };
}

/** Reads, checks and decodes every input, runs D-372, the temple tip and the heads; returns the PNG bytes and the stats. */
export function rebuild({ raw, clean, ear, swept, dwebp, fixture = JSON.parse(readFileSync(join(ROOT, ...FIXTURE.split("/")), "utf8")) }) {
  const pin = (role, file) => { const want = fixture.inputs.find((i) => i.role === role).sha256, got = sha256(readFileSync(file)); if (got !== want) throw new Error(role + " is not the pinned file: " + got); };
  for (const [role, f] of Object.entries({ raw, clean, ear, swept })) pin(role, f);
  const appWebp = readFileSync(join(ROOT, ...APP_HEAD.split("/"))); if (sha256(appWebp) !== fixture.appHead.sha256) throw new Error(APP_HEAD + " is not the pinned file");
  const tmp = mkdtempSync(join(tmpdir(), "d373-")), appPng = join(tmp, "app-head.png"); execFileSync(dwebp, ["-quiet", join(ROOT, ...APP_HEAD.split("/")), "-o", appPng]);
  const px = (f) => decodePng(readFileSync(f)).px, ex = JSON.parse(readFileSync(join(ROOT, ...X.FIXTURE.split("/")), "utf8"));
  const c = X.buildCandidate({ raw: px(raw), base: px(clean), ear: px(ear), swept: px(swept) });
  const bad = X.bindingMismatches(ex, c.files); if (bad.length) throw new Error("D-372's bound files were not reproduced: " + bad.join("; "));
  const grey = decodePng(Buffer.from(c.files.greyLayer)).px, brown = decodePng(Buffer.from(c.files.brownLayer)).px;
  const tipPng = { grey: encodePng(W, H, templeTip(grey)), brown: encodePng(W, H, templeTip(brown)) };
  const { heads, stats } = buildHeads({ clean: px(clean), ear: px(ear), appHead: decodePng(readFileSync(appPng)).px, grey, brown });
  const png = Object.fromEntries(Object.entries(heads).map(([k, p]) => [k, encodePng(W, H, p)]));
  return { png, tipPng, stats, d372: { greyLayer: sha256(c.files.greyLayer), brownLayer: sha256(c.files.brownLayer) } };
}

/** Lossless WebP of a PNG, decoded back and compared byte for byte with the source pixels. */
export function toWebp(pngBytes, { cwebp, dwebp }) {
  const tmp = mkdtempSync(join(tmpdir(), "d373w-")), src = join(tmp, "in.png"), out = join(tmp, "out.webp"), back = join(tmp, "back.png");
  writeFileSync(src, pngBytes); execFileSync(cwebp, [...CWEBP_ARGS, "-quiet", src, "-o", out]); execFileSync(dwebp, ["-quiet", out, "-o", back]);
  const a = decodePng(pngBytes).px, b = decodePng(readFileSync(back)).px; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) throw new Error("WebP not lossless at byte " + i);
  return readFileSync(out);
}

function main() {
  const args = process.argv.slice(2), arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), outside = (d) => { if (!d) return false; const r = relative(ROOT, resolve(d)); return r.startsWith("..") || isAbsolute(r); };
  const f = { raw: arg("--raw"), clean: arg("--clean"), ear: arg("--ear"), swept: arg("--swept") }, cwebp = arg("--cwebp"), dwebp = arg("--dwebp"), OUT = arg("--out"), publish = args.includes("--publish");
  if (Object.values(f).some((v) => !v) || !cwebp || !dwebp || !existsSync(cwebp) || !existsSync(dwebp) || (!OUT && !publish)) throw new Error("--raw --clean --ear --swept --cwebp --dwebp and --out <dir outside the repository> or --publish");
  for (const p of Object.values(f)) if (!outside(p)) throw new Error("the private images stay outside the repository: " + p);
  if (OUT && !outside(OUT)) throw new Error("--out must lie outside the repository");
  const fx = JSON.parse(readFileSync(join(ROOT, ...FIXTURE.split("/")), "utf8")), r = rebuild({ ...f, dwebp, fixture: fx });
  const problems = [];
  for (const [k, o] of Object.entries(fx.temple.layers)) if (sha256(r.tipPng[k]) !== o.pngSha256) problems.push("temple tip " + k);
  for (const [k, o] of Object.entries(fx.heads)) if (sha256(r.png[k]) !== o.pngSha256) problems.push("head " + k + " " + sha256(r.png[k]));
  const webp = Object.fromEntries(Object.entries(r.png).map(([k, b]) => [k, toWebp(b, { cwebp, dwebp })]));
  for (const [k, o] of Object.entries(fx.heads)) if (sha256(webp[k]) !== o.webpSha256) problems.push("webp " + k + " " + sha256(webp[k]));
  const dir = publish ? join(ROOT, ...ASSET_DIR.split("/")) : OUT;
  if (!publish && existsSync(dir) && readdirSync(dir).length) throw new Error("output directory not empty");
  mkdirSync(dir, { recursive: true });
  for (const [k, o] of Object.entries(fx.heads)) writeFileSync(join(dir, o.file), webp[k]);
  if (!publish) { for (const [k, b] of Object.entries(r.png)) writeFileSync(join(dir, "head-" + k + ".png"), b); for (const [k, b] of Object.entries(r.tipPng)) writeFileSync(join(dir, "nh4-temple-tip-" + k + "-hair-layer.png"), b); }
  console.log(JSON.stringify({ stats: r.stats, d372: r.d372, heads: Object.fromEntries(Object.entries(r.png).map(([k, b]) => [k, { png: sha256(b), webp: sha256(webp[k]), bytes: webp[k].length }])), matchesFixture: problems.length === 0, problems }, null, 1));
  if (problems.length) process.exitCode = 1;
}
if (typeof process.argv[1] === "string" && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
