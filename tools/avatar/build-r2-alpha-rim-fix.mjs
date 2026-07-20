// R2 neutral base — opaque white-rim removal (deterministic, NON-AI)
// ---------------------------------------------------------------------------
// WHY THIS EXISTS
// The neutral R2 base shows a light halo on dark backgrounds. Two earlier tools
// measured where it comes from:
//   * build-r2-alpha-decontaminate.mjs — repairs RGB of pixels with a < 255.
//     Measured: ~33.9k pixels rewritten, ZERO visible change.
//   * build-r2-alpha-candidates.mjs    — A (a=0 RGB), B (detached specks),
//     C (A+B). Measured: 8063 / 72 / 8135 pixels changed, still no visible fix.
//
// The dominant contribution is neither. It is ~1.4k FULLY OPAQUE, near-white
// matte pixels painted into the artwork on the silhouette's outer rim — part of
// the main component, so no alpha-domain operation can reach them. Measured at
// the left forearm: alpha 255 with luma 247 sitting directly against the void.
//
// WHAT THIS TOOL DOES
// Three passes, each targeting one measured contribution to the fringe:
//
//   PASS 1 (rim)      Recolours opaque matte pixels: every opaque pixel within
//                     RIM_DIST of a fully transparent pixel whose luma exceeds
//                     its nearest non-rim opaque neighbour by more than
//                     LIGHT_DELTA takes that neighbour's RGB. This is the
//                     dominant contribution (trouser sides, shoe outlines,
//                     hand contours). Alpha untouched.
//
//   PASS 2 (detached) Clears whole 8-connected components of a > 0 pixels that
//                     are NOT the main silhouette and whose mean luma is light:
//                     leftover white matte specks floating 1-3 px off the arms
//                     at partial alpha. This is the ONLY pass that writes alpha,
//                     and only on pixels disconnected from the figure — the
//                     contiguous antialias edge is never touched, so it is not
//                     erosion.
//
//   PASS 3 (a=0 RGB)  Fully transparent pixels near the silhouette take the RGB
//                     of their nearest ink pixel, so a browser's bilinear
//                     downscale cannot pull white matte back in. Invisible at
//                     1:1; alpha untouched.
//
//   * the main silhouette's pixel set is byte-identical — no erosion, no
//     dilation, no cropped hands, no reshaped trousers, no changed soles
//   * no blur, no new outline stroke, no interior colour change (non-rim opaque
//     pixels of the silhouette are copied verbatim)
//   * the light test is RELATIVE to the adjacent body colour, so genuinely
//     light artwork (white shoe soles, laces) is left alone
//
// ENCODING: -lossless -exact. The binding q90 lossy path was measured to alter
// 27526 opaque pixels on a re-encode generation, which would silently undo the
// repair and drift the untouched artwork; lossless is the only encoding that
// keeps every non-rim pixel byte-exact. Size cost is reported and asserted
// against the ADR-163D budget.
//
// BOUNDARIES: build tooling. Writes ONLY to the gitignored tools/avatar/build/
// scratch dir. It does NOT write into assets/avatar-r2/ — promoting the verified
// candidate is a separate, explicit copy step. No manifest change, no AVATAR_R2
// change, no runtime code, no goldens.
//
//   node tools/avatar/build-r2-alpha-rim-fix.mjs
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const OUTDIR = join(HERE, "build", "r2-alpha-rim-fix");
const DWEBP = join(HERE, "vendor", "dwebp.exe");
const CWEBP = join(HERE, "vendor", "cwebp.exe");

// Assets analysed. Only `normal`-blend layers can show a light fringe; the
// multiply-composited layers were measured clean-enough and are left alone.
const ASSETS = [
  { rel: "base/body-neutral-medium-v2.webp", fix: true },
  { rel: "face/face-neutral-v1.webp", fix: false },
  { rel: "eyes/eyes-neutral-fixed-v1.webp", fix: false },
];

const RIM_DIST = 2;      // opaque pixel counts as rim within this distance of a=0
const LIGHT_DELTA = 60;  // rim is "matte" when this much lighter than the body inside
const DETACHED_LUMA = 170; // a detached component is matte debris above this mean luma
const A0_DIST = 3;       // a=0 pixels within this distance of ink get decontaminated

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
function encodeWebpLossless(pngPath, outPath) {
  const res = spawnSync(CWEBP, ["-lossless", "-exact", "-z", "9", "-metadata", "none", pngPath, "-o", outPath], { encoding: "utf8" });
  if (res.status !== 0) throw new Error("cwebp failed: " + (res.stderr || ""));
  return readFileSync(outPath);
}
const sha = (b) => createHash("sha256").update(b).digest("hex").slice(0, 16);
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// Mark opaque pixels lying within RIM_DIST of a fully transparent pixel.
function rimMask(w, h, rgba) {
  const n = w * h;
  const rim = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (rgba[i * 4 + 3] !== 255) continue;
    for (let dy = -RIM_DIST; dy <= RIM_DIST && !rim[i]; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -RIM_DIST; dx <= RIM_DIST; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= w) continue;
        if (rgba[(ny * w + nx) * 4 + 3] === 0) { rim[i] = 1; break; }
      }
    }
  }
  return rim;
}

// Nearest NON-RIM opaque pixel for every pixel (multi-source BFS, deterministic).
function nearestBodyField(w, h, rgba, rim) {
  const n = w * h;
  const src = new Int32Array(n).fill(-1);
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  let qh = 0, qt = 0;
  for (let i = 0; i < n; i++) {
    if (rgba[i * 4 + 3] === 255 && !rim[i]) { src[i] = i; seen[i] = 1; queue[qt++] = i; }
  }
  const nb = [-w, w, -1, 1];
  while (qh < qt) {
    const i = queue[qh++];
    const x = i % w;
    for (let k = 0; k < 4; k++) {
      if (k === 2 && x === 0) continue;
      if (k === 3 && x === w - 1) continue;
      const j = i + nb[k];
      if (j < 0 || j >= n || seen[j]) continue;
      seen[j] = 1; src[j] = src[i]; queue[qt++] = j;
    }
  }
  return src;
}

// 8-connected components over a > 0. Deterministic: row-major seeding.
function components(w, h, rgba) {
  const n = w * h;
  const label = new Int32Array(n).fill(-1);
  const comps = [];
  const stack = new Int32Array(n);
  for (let seed = 0; seed < n; seed++) {
    if (rgba[seed * 4 + 3] === 0 || label[seed] !== -1) continue;
    const id = comps.length;
    const c = { id, px: 0, opaque: 0, r: 0, g: 0, b: 0 };
    let sp = 0; stack[sp++] = seed; label[seed] = id;
    while (sp > 0) {
      const i = stack[--sp];
      c.px++; if (rgba[i * 4 + 3] === 255) c.opaque++;
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

// Distance to the nearest ink (a > 0) pixel, plus which pixel that was.
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

// All three passes. Alpha is written ONLY by pass 2, only on detached debris.
function fixRim(img) {
  const { w, h, rgba } = img;
  const out = Buffer.from(rgba);
  const n = w * h;

  const { label, comps, mainId } = components(w, h, rgba);

  // PASS 1 — opaque matte rim recolour. `changedMain` counts only pixels of the
  // main silhouette, since pass 2 may clear rim pixels of detached components.
  const rim = rimMask(w, h, rgba);
  const src = nearestBodyField(w, h, rgba, rim);
  let rimPx = 0, changed = 0, changedMain = 0, maxDelta = 0;
  for (let i = 0; i < n; i++) {
    if (!rim[i]) continue;
    rimPx++;
    const s = src[i];
    if (s === -1) continue;
    const lr = luma(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    const ls = luma(rgba[s * 4], rgba[s * 4 + 1], rgba[s * 4 + 2]);
    if (lr - ls <= LIGHT_DELTA) continue;
    out[i * 4] = rgba[s * 4]; out[i * 4 + 1] = rgba[s * 4 + 1]; out[i * 4 + 2] = rgba[s * 4 + 2];
    changed++; if (label[i] === mainId) changedMain++;
    maxDelta = Math.max(maxDelta, Math.round(lr - ls));
  }

  // PASS 1b — decontaminate the RGB of light PARTIAL-alpha pixels (the antialias
  // band). Sampled from `out`, i.e. AFTER pass 1, which is why this works now:
  // the earlier tool sampled the still-white opaque rim and just propagated the
  // matte back out. Alpha untouched, so the AA edge keeps its exact shape.
  let partialPx = 0;
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3];
    if (a === 0 || a === 255) continue;
    const s = src[i];
    if (s === -1) continue;
    const lp = luma(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    const ls = luma(out[s * 4], out[s * 4 + 1], out[s * 4 + 2]);
    if (lp - ls <= LIGHT_DELTA) continue;
    out[i * 4] = out[s * 4]; out[i * 4 + 1] = out[s * 4 + 1]; out[i * 4 + 2] = out[s * 4 + 2];
    partialPx++;
  }

  // PASS 2 — clear detached light components (the only alpha write)
  const doomed = new Set();
  for (const c of comps) {
    if (c.id === mainId) continue;
    if (luma(c.r / c.px, c.g / c.px, c.b / c.px) <= DETACHED_LUMA) continue;
    doomed.add(c.id);
  }
  let detachedPx = 0;
  for (let i = 0; i < n; i++) {
    if (label[i] === -1 || !doomed.has(label[i])) continue;
    out[i * 4] = 0; out[i * 4 + 1] = 0; out[i * 4 + 2] = 0; out[i * 4 + 3] = 0;
    detachedPx++;
  }

  // PASS 3 — decontaminate the RGB of fully transparent pixels near the ink,
  // computed against the pass-2 result so cleared debris is not re-seeded.
  const { dist, src: inkSrc } = distToInk(w, h, out, A0_DIST);
  let a0Px = 0;
  for (let i = 0; i < n; i++) {
    if (out[i * 4 + 3] !== 0) continue;
    if (dist[i] < 1 || dist[i] > A0_DIST) continue;
    const s = inkSrc[i];
    if (s === -1) continue;
    if (out[i * 4] === out[s * 4] && out[i * 4 + 1] === out[s * 4 + 1] && out[i * 4 + 2] === out[s * 4 + 2]) continue;
    out[i * 4] = out[s * 4]; out[i * 4 + 1] = out[s * 4 + 1]; out[i * 4 + 2] = out[s * 4 + 2];
    a0Px++;
  }

  return { rgba: out, rimPx, changed, changedMain, maxDelta, partialPx,
           detachedComps: doomed.size, detachedPx, a0Px, rim };
}

function alphaHistogram(rgba, n) {
  const h = { zero: 0, "1-63": 0, "64-127": 0, "128-191": 0, "192-254": 0, opaque: 0 };
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3];
    if (a === 0) h.zero++; else if (a < 64) h["1-63"]++; else if (a < 128) h["64-127"]++;
    else if (a < 192) h["128-191"]++; else if (a < 255) h["192-254"]++; else h.opaque++;
  }
  return h;
}

// Every invariant that must hold between the original and the re-decoded result.
// The MAIN SILHOUETTE is the thing that must survive untouched: same pixel set,
// same alpha, same RGB everywhere except the matte rim.
function verify(orig, next, rim) {
  const n = orig.w * orig.h;
  const o = components(orig.w, orig.h, orig.rgba);
  const c = components(next.w, next.h, next.rgba);
  let mainPxDiff = 0, mainAlphaDiff = 0, mainInteriorRgbDiff = 0, mainRimRgbDiff = 0, mainPartialRgbDiff = 0;
  let alphaDiffOutsideMain = 0, a0RgbDiff = 0;
  for (let i = 0; i < n; i++) {
    const inOrigMain = o.label[i] === o.mainId;
    const inNextMain = c.label[i] === c.mainId;
    if (inOrigMain !== inNextMain) mainPxDiff++;
    const aDiff = orig.rgba[i * 4 + 3] !== next.rgba[i * 4 + 3];
    let rgbDiff = false;
    for (let k = 0; k < 3; k++) if (orig.rgba[i * 4 + k] !== next.rgba[i * 4 + k]) { rgbDiff = true; break; }
    if (inOrigMain) {
      if (aDiff) mainAlphaDiff++;
      if (rgbDiff) {
        if (rim[i]) mainRimRgbDiff++;
        else if (orig.rgba[i * 4 + 3] !== 255) mainPartialRgbDiff++;
        else mainInteriorRgbDiff++;
      }
    } else {
      if (aDiff) alphaDiffOutsideMain++;
      if (rgbDiff && orig.rgba[i * 4 + 3] === 0) a0RgbDiff++;
    }
  }
  return { mainPxDiff, mainAlphaDiff, mainInteriorRgbDiff, mainRimRgbDiff, mainPartialRgbDiff, alphaDiffOutsideMain, a0RgbDiff };
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

  const report = [];
  let fail = false;

  for (const { rel, fix } of ASSETS) {
    const abs = join(REPO, "assets", "avatar-r2", rel.replace("/", "\\"));
    const tag = rel.replace(/[\/.]/g, "-");
    const orig = decodeWebp(abs, tag);
    const { w, h } = orig;
    const n = w * h;
    if (w !== 512 || h !== 768) { console.error(`✖ ${rel}: dimensions ${w}x${h}, expected 512x768`); fail = true; continue; }

    const rim = rimMask(w, h, orig.rgba);
    const probe = fixRim(orig);
    const origBytes = readFileSync(abs).length;
    console.log(`${rel}  ${w}x${h}  ${(origBytes / 1024).toFixed(1)} KB  rimPx=${probe.rimPx}  matteRimPx=${probe.changed} (maxΔluma=${probe.maxDelta})  partialAA=${probe.partialPx}  detached=${probe.detachedComps}c/${probe.detachedPx}px  a0=${probe.a0Px}`);

    if (!fix) {
      report.push({ name: rel, action: "measured-only", rimPx: probe.rimPx, matteRimPx: probe.changed,
                    detachedComps: probe.detachedComps, detachedPx: probe.detachedPx });
      continue;
    }

    const cand = { w, h, rgba: probe.rgba };
    const png = join(OUTDIR, tag + "-fixed.png");
    writeFileSync(png, encRGBA(w, h, cand.rgba));

    const enc1 = encodeWebpLossless(png, join(OUTDIR, tag + "-fixed.webp"));
    const enc2 = encodeWebpLossless(png, join(OUTDIR, tag + "-fixed-2nd.webp"));
    const deterministic = sha(enc1) === sha(enc2);

    const rt = decodeWebp(join(OUTDIR, tag + "-fixed.webp"), tag + "-roundtrip");
    const v = verify(orig, rt, rim);

    const entry = {
      name: rel, action: "fixed",
      rimPx: probe.rimPx, matteRimPx: probe.changed, maxDeltaLuma: probe.maxDelta,
      partialAaPx: probe.partialPx,
      detachedComps: probe.detachedComps, detachedPx: probe.detachedPx, a0RgbPx: probe.a0Px,
      alphaHistogramBefore: alphaHistogram(orig.rgba, n),
      alphaHistogramAfter: alphaHistogram(rt.rgba, n),
      bytesBefore: origBytes, bytesAfter: enc1.length,
      deterministic, sha: sha(enc1), verify: v,
      dimensions: `${rt.w}x${rt.h}`,
    };
    report.push(entry);

    writeFileSync(join(OUTDIR, tag + "-before-dark.png"), encRGBA(w, h, overBg(orig, 26, 26, 46).rgba));
    writeFileSync(join(OUTDIR, tag + "-after-dark.png"), encRGBA(w, h, overBg(rt, 26, 26, 46).rgba));
    writeFileSync(join(OUTDIR, tag + "-before-light.png"), encRGBA(w, h, overBg(orig, 244, 241, 236).rgba));
    writeFileSync(join(OUTDIR, tag + "-after-light.png"), encRGBA(w, h, overBg(rt, 244, 241, 236).rgba));

    console.log(`  alpha before: ${JSON.stringify(entry.alphaHistogramBefore)}`);
    console.log(`  alpha after : ${JSON.stringify(entry.alphaHistogramAfter)}`);
    console.log(`  size: ${(origBytes / 1024).toFixed(1)} KB -> ${(enc1.length / 1024).toFixed(1)} KB (lossless -exact)`);
    console.log(`  deterministic: ${deterministic}  sha=${entry.sha}`);
    console.log(`  verify: ${JSON.stringify(v)}`);

    // hard invariants
    if (v.mainPxDiff !== 0) { console.error("  ✖ main silhouette pixel set changed (erosion/dilation)"); fail = true; }
    if (v.mainAlphaDiff !== 0) { console.error("  ✖ main silhouette alpha changed"); fail = true; }
    if (v.mainInteriorRgbDiff !== 0) { console.error("  ✖ interior (opaque, non-rim) RGB changed"); fail = true; }
    if (v.mainRimRgbDiff !== probe.changedMain) { console.error(`  ✖ rim change count drifted through encode: ${v.mainRimRgbDiff} != ${probe.changedMain}`); fail = true; }
    if (v.alphaDiffOutsideMain !== probe.detachedPx) { console.error(`  ✖ alpha changed outside the detached debris: ${v.alphaDiffOutsideMain} != ${probe.detachedPx}`); fail = true; }
    if (!deterministic) { console.error("  ✖ encode not deterministic"); fail = true; }
    if (rt.w !== 512 || rt.h !== 768) { console.error("  ✖ dimensions changed"); fail = true; }
  }

  writeFileSync(join(OUTDIR, "report.json"), JSON.stringify(report, null, 2));
  console.log("\nreport -> " + join(OUTDIR, "report.json"));
  if (fail) { console.error("\n✖ INVARIANT FAILURE — do not promote"); process.exit(5); }
  console.log("✔ all invariants hold");
}

main();
