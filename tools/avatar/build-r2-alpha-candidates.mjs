// R2 neutral base — alpha-fringe candidate builder (deterministic, NON-AI)
// ---------------------------------------------------------------------------
// Follow-up to build-r2-alpha-decontaminate.mjs. That tool repaired only the
// RGB of pixels with a < 255. Measured result: it rewrote ~33.9k pixels and the
// visible light fringe did NOT change, because the fringe is not (mainly)
// contaminated RGB inside the antialias band — it is a set of small DETACHED
// components of leftover white matte sitting in the transparent void, 1-3 px
// off the silhouette. Recolouring them was never in scope: a detached speck
// takes the RGB of its nearest opaque pixel, but the specks that dominate the
// fringe carry a = 255 or high alpha and were skipped / re-lit entirely.
//
// This tool builds three candidates for the base asset ONLY and promotes none:
//
//   A  RGB decontamination restricted to FULLY TRANSPARENT (a = 0) pixels close
//      to the silhouette. Alpha plane untouched. Every a > 0 pixel untouched.
//      Guards against light RGB bleeding in when a browser bilinearly downscales.
//
//   B  Removal of DETACHED light components only: 8-connected components of
//      a > 0 pixels that are not the main silhouette and whose mean luma is
//      light. Alpha set to 0 (RGB zeroed) for those pixels only. The contiguous
//      antialias edge of the silhouette is never touched — no erosion.
//      B keeps a = 255 pixels; B2 also clears the opaque specks (reported
//      separately because it crosses the "opaque pixels unchanged" line).
//
//   C  Conservative combination: A + B.
//
// Invariants asserted for every candidate (hard-fail):
//   * 512x768
//   * main silhouette unchanged (component pixel set identical)
//   * no erosion / dilation / blur / outline / interior colour change
//   * determinism: two independent encodes byte-identical
//
// BOUNDARIES: build tooling. Writes ONLY to the gitignored tools/avatar/build/
// scratch dir. Never writes into assets/avatar-r2/. No manifest, no AVATAR_R2,
// no runtime code.
//
//   node tools/avatar/build-r2-alpha-candidates.mjs
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const OUTDIR = join(HERE, "build", "r2-alpha-candidates");
const DWEBP = join(HERE, "vendor", "dwebp.exe");
const CWEBP = join(HERE, "vendor", "cwebp.exe");

const ASSET = join(REPO, "assets", "avatar-r2", "base", "body-neutral-medium-v2.webp");

const A0_DIST = 3;      // A: decontaminate a=0 pixels within this distance of a>0
const LIGHT_LUMA = 170; // B: a detached component counts as fringe above this mean luma

// ── minimal PNG codec ────────────────────────────────────────────────────────
function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
function decodePng(buf){let off=8,ihdr=null;const idat=[];while(off<buf.length){const len=buf.readUInt32BE(off);const type=buf.toString("ascii",off+4,off+8);const data=buf.subarray(off+8,off+8+len);if(type==="IHDR")ihdr={w:data.readUInt32BE(0),h:data.readUInt32BE(4),ct:data[9]};else if(type==="IDAT")idat.push(data);else if(type==="IEND")break;off+=12+len;}const ch=ihdr.ct===6?4:3,{w,h}=ihdr,stride=w*ch;const raw=inflateSync(Buffer.concat(idat));const px=Buffer.alloc(h*stride);let prev=Buffer.alloc(stride),p=0;for(let y=0;y<h;y++){const f=raw[p++];const cur=raw.subarray(p,p+stride);p+=stride;const out=px.subarray(y*stride,y*stride+stride);for(let x=0;x<stride;x++){const a=x>=ch?out[x-ch]:0,b=prev[x],c=x>=ch?prev[x-ch]:0;let v=cur[x];if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4)v+=paeth(a,b,c);out[x]=v&0xff;}prev=out;}const rgba=Buffer.alloc(w*h*4);for(let i=0;i<w*h;i++){rgba[i*4]=px[i*ch];rgba[i*4+1]=px[i*ch+1];rgba[i*4+2]=px[i*ch+2];rgba[i*4+3]=ch===4?px[i*ch+3]:255;}return {w,h,rgba};}
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(b){let c=0xffffffff;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&0xff]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const T=Buffer.from(t,"ascii");const cc=Buffer.alloc(4);cc.writeUInt32BE(crc32(Buffer.concat([T,d])),0);return Buffer.concat([l,T,d,cc]);}
function encRGBA(w,h,rgba){const st=w*4,raw=Buffer.alloc(h*(st+1));for(let y=0;y<h;y++){raw[y*(st+1)]=0;rgba.copy(raw,y*(st+1)+1,y*st,y*st+st);}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);}

function decodeWebp(webpPath, tag) {
  const png = join(OUTDIR, tag + "-decoded.png");
  const res = spawnSync(DWEBP, [webpPath, "-o", png], { encoding: "utf8" });
  if (res.status !== 0) throw new Error("dwebp failed on " + webpPath + ": " + (res.stderr || ""));
  return decodePng(readFileSync(png));
}
function encodeWebp(pngPath, outPath, lossless) {
  const args = lossless
    ? ["-lossless", "-exact", "-z", "9", "-metadata", "none", pngPath, "-o", outPath]
    : ["-q", "90", "-alpha_q", "100", "-m", "6", "-metadata", "none", pngPath, "-o", outPath];
  const res = spawnSync(CWEBP, args, { encoding: "utf8" });
  if (res.status !== 0) throw new Error("cwebp failed: " + (res.stderr || ""));
  return readFileSync(outPath);
}
const sha = (b) => createHash("sha256").update(b).digest("hex").slice(0, 16);
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// 8-connected components over a > 0. Deterministic: row-major seeding.
function components(w, h, rgba) {
  const n = w * h;
  const label = new Int32Array(n).fill(-1);
  const comps = [];
  const stack = new Int32Array(n);
  for (let seed = 0; seed < n; seed++) {
    if (rgba[seed * 4 + 3] === 0 || label[seed] !== -1) continue;
    const id = comps.length;
    const c = { id, px: 0, opaque: 0, aMax: 0, r: 0, g: 0, b: 0 };
    let sp = 0; stack[sp++] = seed; label[seed] = id;
    while (sp > 0) {
      const i = stack[--sp];
      const a = rgba[i * 4 + 3];
      c.px++; if (a === 255) c.opaque++; if (a > c.aMax) c.aMax = a;
      c.r += rgba[i * 4]; c.g += rgba[i * 4 + 1]; c.b += rgba[i * 4 + 2];
      const x = i % w, y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (rgba[j * 4 + 3] === 0 || label[j] !== -1) continue;
        label[j] = id; stack[sp++] = j;
      }
    }
    comps.push(c);
  }
  let mainId = 0;
  for (const c of comps) if (c.px > comps[mainId].px) mainId = c.id;
  return { label, comps, mainId };
}

// Distance from every pixel to the nearest a > 0 pixel (BFS, 4-connected).
function distToInk(w, h, rgba, maxd) {
  const n = w * h;
  const dist = new Int32Array(n).fill(-1);
  const src = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let qh = 0, qt = 0;
  for (let i = 0; i < n; i++) if (rgba[i * 4 + 3] > 0) { dist[i] = 0; src[i] = i; queue[qt++] = i; }
  const nb = [-w, w, -1, 1];
  while (qh < qt) {
    const i = queue[qh++];
    if (dist[i] >= maxd) continue;
    const x = i % w;
    for (let k = 0; k < 4; k++) {
      if (k === 2 && x === 0) continue;
      if (k === 3 && x === w - 1) continue;
      const j = i + nb[k];
      if (j < 0 || j >= n || dist[j] !== -1) continue;
      dist[j] = dist[i] + 1; src[j] = src[i]; queue[qt++] = j;
    }
  }
  return { dist, src };
}

// ── candidate transforms ─────────────────────────────────────────────────────

// A: a = 0 pixels within A0_DIST of ink take the RGB of their nearest ink pixel.
function candidateA(img) {
  const { w, h, rgba } = img;
  const out = Buffer.from(rgba);
  const { dist, src } = distToInk(w, h, rgba, A0_DIST);
  let changed = 0;
  for (let i = 0; i < w * h; i++) {
    if (rgba[i * 4 + 3] !== 0) continue;
    if (dist[i] < 1 || dist[i] > A0_DIST) continue;
    const s = src[i];
    const r = rgba[s * 4], g = rgba[s * 4 + 1], b = rgba[s * 4 + 2];
    if (out[i * 4] !== r || out[i * 4 + 1] !== g || out[i * 4 + 2] !== b) {
      out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; changed++;
    }
  }
  return { rgba: out, rgbChanged: changed, alphaChanged: 0, detachedRemoved: 0, opaqueCleared: 0 };
}

// B: clear detached light components. clearOpaque=false keeps a = 255 specks.
function candidateB(img, clearOpaque) {
  const { w, h, rgba } = img;
  const out = Buffer.from(rgba);
  const { label, comps, mainId } = components(w, h, rgba);
  const doomed = new Set();
  for (const c of comps) {
    if (c.id === mainId) continue;
    if (luma(c.r / c.px, c.g / c.px, c.b / c.px) <= LIGHT_LUMA) continue;
    doomed.add(c.id);
  }
  let alphaChanged = 0, opaqueCleared = 0, compsRemoved = 0;
  const touched = new Set();
  for (let i = 0; i < w * h; i++) {
    const id = label[i];
    if (id === -1 || !doomed.has(id)) continue;
    if (rgba[i * 4 + 3] === 255 && !clearOpaque) continue;
    if (rgba[i * 4 + 3] === 255) opaqueCleared++;
    out[i * 4] = 0; out[i * 4 + 1] = 0; out[i * 4 + 2] = 0; out[i * 4 + 3] = 0;
    alphaChanged++; touched.add(id);
  }
  compsRemoved = touched.size;
  return { rgba: out, rgbChanged: alphaChanged, alphaChanged, detachedRemoved: compsRemoved, detachedPx: alphaChanged, opaqueCleared };
}

// C: A then B (B on A's output; A only touched a = 0 pixels so components match).
function candidateC(img, clearOpaque) {
  const a = candidateA(img);
  const b = candidateB({ ...img, rgba: a.rgba }, clearOpaque);
  return { rgba: b.rgba, rgbChanged: a.rgbChanged + b.rgbChanged, alphaChanged: b.alphaChanged,
           detachedRemoved: b.detachedRemoved, opaqueCleared: b.opaqueCleared };
}

// ── verification ─────────────────────────────────────────────────────────────
function alphaHistogram(rgba, n) {
  const h = { zero: 0, "1-63": 0, "64-127": 0, "128-191": 0, "192-254": 0, opaque: 0 };
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3];
    if (a === 0) h.zero++; else if (a < 64) h["1-63"]++; else if (a < 128) h["64-127"]++;
    else if (a < 192) h["128-191"]++; else if (a < 255) h["192-254"]++; else h.opaque++;
  }
  return h;
}

// The main silhouette must survive byte-identical in BOTH alpha and RGB.
function verifyMainSilhouette(orig, cand) {
  const { w, h } = orig;
  const o = components(w, h, orig.rgba);
  const c = components(w, h, cand.rgba);
  let alphaDiff = 0, rgbDiff = 0, opaqueRgbDiff = 0, mainPxDiff = 0;
  const oMain = o.label, cMain = c.label;
  for (let i = 0; i < w * h; i++) {
    const inOrigMain = oMain[i] === o.mainId;
    const inCandMain = cMain[i] === c.mainId;
    if (inOrigMain !== inCandMain) mainPxDiff++;
    if (!inOrigMain) continue;
    if (orig.rgba[i * 4 + 3] !== cand.rgba[i * 4 + 3]) alphaDiff++;
    for (let k = 0; k < 3; k++) if (orig.rgba[i * 4 + k] !== cand.rgba[i * 4 + k]) { rgbDiff++; break; }
    if (orig.rgba[i * 4 + 3] === 255) {
      for (let k = 0; k < 3; k++) if (orig.rgba[i * 4 + k] !== cand.rgba[i * 4 + k]) { opaqueRgbDiff++; break; }
    }
  }
  return { mainPxDiff, mainAlphaDiff: alphaDiff, mainRgbDiff: rgbDiff, mainOpaqueRgbDiff: opaqueRgbDiff };
}

function overBg(img, r, g, b) {
  const { w, h, rgba } = img;
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3] / 255;
    out[i * 4]     = Math.round(rgba[i * 4] * a + r * (1 - a));
    out[i * 4 + 1] = Math.round(rgba[i * 4 + 1] * a + g * (1 - a));
    out[i * 4 + 2] = Math.round(rgba[i * 4 + 2] * a + b * (1 - a));
    out[i * 4 + 3] = 255;
  }
  return { w, h, rgba: out };
}

function main() {
  if (!existsSync(DWEBP) || !existsSync(CWEBP)) {
    console.error("missing vendor/dwebp.exe or vendor/cwebp.exe — run: node tools/avatar/fetch-dwebp.mjs");
    process.exit(3);
  }
  mkdirSync(OUTDIR, { recursive: true });

  const orig = decodeWebp(ASSET, "orig");
  const { w, h } = orig;
  const n = w * h;
  if (w !== 512 || h !== 768) { console.error(`dimension check failed: ${w}x${h}`); process.exit(4); }
  const origBytes = readFileSync(ASSET).length;
  const origHist = alphaHistogram(orig.rgba, n);
  const { comps, mainId } = components(w, h, orig.rgba);
  const detached = comps.filter((c) => c.id !== mainId);
  const detachedLight = detached.filter((c) => luma(c.r / c.px, c.g / c.px, c.b / c.px) > LIGHT_LUMA);

  console.log(`original: ${w}x${h}  ${(origBytes / 1024).toFixed(1)} KB`);
  console.log(`  alpha histogram: ${JSON.stringify(origHist)}`);
  console.log(`  components: ${comps.length} (main=${comps[mainId].px}px, detached=${detached.length} / ${detached.reduce((s, c) => s + c.px, 0)}px)`);
  console.log(`  detached LIGHT (luma>${LIGHT_LUMA}): ${detachedLight.length} comps / ${detachedLight.reduce((s, c) => s + c.px, 0)}px, of which opaque=${detachedLight.reduce((s, c) => s + c.opaque, 0)}\n`);

  const variants = [
    ["A", candidateA(orig)],
    ["B", candidateB(orig, false)],
    ["B2", candidateB(orig, true)],
    ["C", candidateC(orig, false)],
    ["C2", candidateC(orig, true)],
  ];

  const report = { original: { w, h, bytes: origBytes, alphaHistogram: origHist,
                               detachedComps: detached.length, detachedLightComps: detachedLight.length },
                   candidates: {} };

  for (const [name, res] of variants) {
    const cand = { w, h, rgba: res.rgba };
    const png = join(OUTDIR, `cand-${name}.png`);
    writeFileSync(png, encRGBA(w, h, cand.rgba));

    const lossy1 = encodeWebp(png, join(OUTDIR, `cand-${name}-lossy.webp`), false);
    const lossy2 = encodeWebp(png, join(OUTDIR, `cand-${name}-lossy-2nd.webp`), false);
    const ll1 = encodeWebp(png, join(OUTDIR, `cand-${name}-lossless.webp`), true);
    const ll2 = encodeWebp(png, join(OUTDIR, `cand-${name}-lossless-2nd.webp`), true);
    const det = { lossy: sha(lossy1) === sha(lossy2), lossless: sha(ll1) === sha(ll2) };

    // verify against the ROUNDTRIPPED encodes, not just the in-memory buffer
    const rtLossy = decodeWebp(join(OUTDIR, `cand-${name}-lossy.webp`), `rt-${name}-lossy`);
    const rtLl = decodeWebp(join(OUTDIR, `cand-${name}-lossless.webp`), `rt-${name}-lossless`);

    const v = {
      inMemory: verifyMainSilhouette(orig, cand),
      afterLossless: verifyMainSilhouette(orig, rtLl),
      afterLossy: verifyMainSilhouette(orig, rtLossy),
    };
    const entry = {
      rgbChanged: res.rgbChanged, alphaChanged: res.alphaChanged,
      detachedCompsRemoved: res.detachedRemoved || 0, opaqueCleared: res.opaqueCleared || 0,
      alphaHistogram: alphaHistogram(cand.rgba, n),
      bytesLossy: lossy1.length, bytesLossless: ll1.length,
      deterministic: det, verify: v,
    };
    report.candidates[name] = entry;

    writeFileSync(join(OUTDIR, `cand-${name}-dark.png`), encRGBA(w, h, overBg(cand, 26, 26, 46).rgba));
    writeFileSync(join(OUTDIR, `cand-${name}-light.png`), encRGBA(w, h, overBg(cand, 244, 241, 236).rgba));

    console.log(`${name}: rgbChanged=${entry.rgbChanged} alphaChanged=${entry.alphaChanged} detachedComps=${entry.detachedCompsRemoved} opaqueCleared=${entry.opaqueCleared}`);
    console.log(`   alpha hist: ${JSON.stringify(entry.alphaHistogram)}`);
    console.log(`   size: lossy ${(entry.bytesLossy / 1024).toFixed(1)}KB (orig ${(origBytes / 1024).toFixed(1)}KB), lossless ${(entry.bytesLossless / 1024).toFixed(1)}KB`);
    console.log(`   deterministic: lossy=${det.lossy} lossless=${det.lossless}`);
    console.log(`   main silhouette in-memory:   ${JSON.stringify(v.inMemory)}`);
    console.log(`   main silhouette post-lossless:${JSON.stringify(v.afterLossless)}`);
    console.log(`   main silhouette post-lossy:  ${JSON.stringify(v.afterLossy)}`);
  }

  writeFileSync(join(OUTDIR, "before-dark.png"), encRGBA(w, h, overBg(orig, 26, 26, 46).rgba));
  writeFileSync(join(OUTDIR, "before-light.png"), encRGBA(w, h, overBg(orig, 244, 241, 236).rgba));
  writeFileSync(join(OUTDIR, "report.json"), JSON.stringify(report, null, 2));
  console.log("\nreport -> " + join(OUTDIR, "report.json"));
}

main();
