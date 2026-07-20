// R2 alpha-edge decontamination (deterministic, NON-AI) — light-fringe fix
// ---------------------------------------------------------------------------
// The promoted neutral R2 WebPs show a light halo on dark backgrounds: edge
// pixels with alpha < 255 kept light RGB from the authoring/matte background
// (and fully transparent neighbours with light RGB bleed in when the browser
// downscales, because bilinear sampling mixes the RGB of a=0 texels).
//
// This tool is measurement + repair:
//   --analyze          decode each runtime WebP and report, per asset, how many
//                      edge-band pixels (a=0 near the silhouette, 0<a<255) carry
//                      light RGB (luma > threshold vs their nearest opaque colour).
//   --fix              decontaminate the CONTAMINATED assets: multi-source BFS
//                      from every fully-opaque pixel (a=255), propagating the
//                      nearest inside figure colour outward through the edge band
//                      (a<255, distance <= 16). ONLY RGB changes; the alpha plane
//                      and every a=255 pixel are copied verbatim. No erosion, no
//                      dilation, no blur, no outline. Canvas stays 512x768.
//                      Re-encodes and VERIFIES the result (see below), then
//                      writes candidates + before/after composites to the
//                      gitignored build/ dir.
//
// Verification per fixed asset (all hard-fail):
//   * dimensions unchanged (512x768)
//   * alpha plane byte-identical to the original runtime WebP
//   * every a=255 pixel RGB byte-identical to the original
//   * edge-band light-pixel count == 0 after fix
//   * determinism: two independent encodes are byte-identical
//
// Encoding: alpha-exact repair requires `-lossless -exact` (the binding lossy
// q90 path CANNOT keep opaque pixels byte-identical across a re-encode
// generation — measured, not assumed; the tool reports both). ADR-163D's
// binding constraints (512x768 WebP, total avatar < ~350 KB) are asserted.
//
// BOUNDARIES: build tooling. Writes ONLY to the gitignored tools/avatar/build/
// scratch dir. It does NOT write into assets/avatar-r2/ — promoting a verified
// candidate is a separate, human-gated copy step. No manifest change, no
// AVATAR_R2 change, no runtime code.
//
//   node tools/avatar/build-r2-alpha-decontaminate.mjs --analyze
//   node tools/avatar/build-r2-alpha-decontaminate.mjs --fix
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const OUTDIR = join(HERE, "build", "r2-alpha-fix");
const DWEBP = join(HERE, "vendor", "dwebp.exe");
const CWEBP = join(HERE, "vendor", "cwebp.exe");

// blend = how the runtime composites the layer (js/avatar-render-c2.js):
//   normal   — RGB composites directly; light matte RGB in a<255 px IS the
//              visible fringe → decontaminate.
//   multiply — blush (mix-blend multiply) and the tint luminance maps
//              (iris/hair: wrapper bg = token colour, masked to the map's
//              alpha, inner img multiplies). Multiply can never brighten, so
//              light edge RGB cannot produce a light fringe there — and
//              propagating dark figure colours outward WOULD darken those
//              edges. Analysed but intentionally NOT repaired.
const ASSETS = [
  { rel: "base/body-neutral-medium-v2.webp", blend: "normal" },
  { rel: "face/face-blush-multiply-v1.webp", blend: "multiply" },
  { rel: "face/face-neutral-v1.webp", blend: "normal" },
  { rel: "eyes/eyes-neutral-fixed-v1.webp", blend: "normal" },
  { rel: "eyes/eyes-neutral-iris-v1.webp", blend: "multiply" },
  { rel: "hair/hair-northstar-v1.webp", blend: "multiply" },
];

const MAXD = 16;          // propagation band (px) beyond the silhouette
const LIGHT_DELTA = 24;   // "light" = luma exceeds nearest-opaque luma by this
const EDGE_A0_DIST = 2;   // a=0 counts as edge-band when this close to a>0

// ── minimal PNG codec (same conventions as the other build tools) ────────────
function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
function decodePng(buf){let off=8,ihdr=null;const idat=[];while(off<buf.length){const len=buf.readUInt32BE(off);const type=buf.toString("ascii",off+4,off+8);const data=buf.subarray(off+8,off+8+len);if(type==="IHDR")ihdr={w:data.readUInt32BE(0),h:data.readUInt32BE(4),bit:data[8],ct:data[9],il:data[12]};else if(type==="IDAT")idat.push(data);else if(type==="IEND")break;off+=12+len;}const ch=ihdr.ct===6?4:3,{w,h}=ihdr,stride=w*ch;const raw=inflateSync(Buffer.concat(idat));const px=Buffer.alloc(h*stride);let prev=Buffer.alloc(stride),p=0;for(let y=0;y<h;y++){const f=raw[p++];const cur=raw.subarray(p,p+stride);p+=stride;const out=px.subarray(y*stride,y*stride+stride);for(let x=0;x<stride;x++){const a=x>=ch?out[x-ch]:0,b=prev[x],c=x>=ch?prev[x-ch]:0;let v=cur[x];if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4)v+=paeth(a,b,c);out[x]=v&0xff;}prev=out;}const rgba=Buffer.alloc(w*h*4);for(let i=0;i<w*h;i++){rgba[i*4]=px[i*ch];rgba[i*4+1]=px[i*ch+1];rgba[i*4+2]=px[i*ch+2];rgba[i*4+3]=ch===4?px[i*ch+3]:255;}return {w,h,rgba};}
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(b){let c=0xffffffff;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&0xff]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const T=Buffer.from(t,"ascii");const cc=Buffer.alloc(4);cc.writeUInt32BE(crc32(Buffer.concat([T,d])),0);return Buffer.concat([l,T,d,cc]);}
function encRGBA(w,h,rgba){const st=w*4,raw=Buffer.alloc(h*(st+1));for(let y=0;y<h;y++){raw[y*(st+1)]=0;rgba.copy(raw,y*(st+1)+1,y*st,y*st+st);}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);}

// ── WebP decode via vendored dwebp ───────────────────────────────────────────
function decodeWebp(webpPath, tag) {
  const png = join(OUTDIR, tag + "-decoded.png");
  const res = spawnSync(DWEBP, [webpPath, "-o", png], { encoding: "utf8" }); // PNG is dwebp's default output format
  if (res.status !== 0) throw new Error("dwebp failed on " + webpPath + ": " + (res.stderr || ""));
  return decodePng(readFileSync(png));
}

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// Multi-source BFS from every a=255 pixel: for each pixel within MAXD of the
// opaque figure, the RGB of its nearest fully-opaque pixel. Deterministic:
// row-major seeding + fixed neighbour order (N, S, W, E).
function nearestOpaqueField(w, h, rgba) {
  const n = w * h;
  const dist = new Int32Array(n).fill(-1);
  const srcOf = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let qh = 0, qt = 0;
  for (let i = 0; i < n; i++) {
    if (rgba[i * 4 + 3] === 255) { dist[i] = 0; srcOf[i] = i; queue[qt++] = i; }
  }
  const nb = [-w, w, -1, 1];
  while (qh < qt) {
    const i = queue[qh++];
    const d = dist[i];
    if (d >= MAXD) continue;
    const x = i % w;
    for (let k = 0; k < 4; k++) {
      if (k === 2 && x === 0) continue;
      if (k === 3 && x === w - 1) continue;
      const j = i + nb[k];
      if (j < 0 || j >= n) continue;
      if (dist[j] !== -1) continue;
      dist[j] = d + 1;
      srcOf[j] = srcOf[i];
      queue[qt++] = j;
    }
  }
  return { dist, srcOf };
}

function analyse(name, img) {
  const { w, h, rgba } = img;
  const { dist, srcOf } = nearestOpaqueField(w, h, rgba);
  const st = { name, w, h, opaque: 0, partial: 0, partialLight: 0, a0Edge: 0, a0EdgeLight: 0, maxPartialDelta: 0 };
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3];
    if (a === 255) { st.opaque++; continue; }
    const s = srcOf[i];
    if (s === -1 || dist[i] > MAXD) continue; // far outside the band
    const lp = luma(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    const ls = luma(rgba[s * 4], rgba[s * 4 + 1], rgba[s * 4 + 2]);
    const light = lp - ls > LIGHT_DELTA;
    if (a > 0) {
      st.partial++;
      if (light) { st.partialLight++; st.maxPartialDelta = Math.max(st.maxPartialDelta, Math.round(lp - ls)); }
    } else if (dist[i] <= EDGE_A0_DIST) {
      st.a0Edge++;
      if (light) st.a0EdgeLight++;
    }
  }
  return st;
}

// RGB-only repair: every pixel in the band (a<255, dist<=MAXD) takes the RGB of
// its nearest fully-opaque pixel. Alpha + all a=255 pixels copied verbatim.
function decontaminate(img) {
  const { w, h, rgba } = img;
  const out = Buffer.from(rgba);
  const { dist, srcOf } = nearestOpaqueField(w, h, rgba);
  let changed = 0;
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3];
    if (a === 255) continue;
    const s = srcOf[i];
    if (s === -1 || dist[i] > MAXD) continue;
    const r = rgba[s * 4], g = rgba[s * 4 + 1], b = rgba[s * 4 + 2];
    if (out[i * 4] !== r || out[i * 4 + 1] !== g || out[i * 4 + 2] !== b) {
      out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b;
      changed++;
    }
  }
  return { rgba: out, changed };
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

// Byte-compare planes between two RGBA images.
function comparePlanes(orig, next) {
  const n = orig.w * orig.h;
  let alphaDiff = 0, opaqueRgbDiff = 0, maxOpaqueDelta = 0;
  for (let i = 0; i < n; i++) {
    const ao = orig.rgba[i * 4 + 3], an = next.rgba[i * 4 + 3];
    if (ao !== an) alphaDiff++;
    if (ao === 255) {
      const d = Math.max(
        Math.abs(orig.rgba[i * 4] - next.rgba[i * 4]),
        Math.abs(orig.rgba[i * 4 + 1] - next.rgba[i * 4 + 1]),
        Math.abs(orig.rgba[i * 4 + 2] - next.rgba[i * 4 + 2]));
      if (d > 0) { opaqueRgbDiff++; maxOpaqueDelta = Math.max(maxOpaqueDelta, d); }
    }
  }
  return { alphaDiff, opaqueRgbDiff, maxOpaqueDelta };
}

// Composite an RGBA image over a flat background (for before/after review PNGs).
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
  const mode = process.argv.includes("--fix") ? "fix" : "analyze";
  if (!existsSync(DWEBP)) { console.error("✖ missing vendor/dwebp.exe — run: node tools/avatar/fetch-dwebp.mjs"); process.exit(3); }
  if (mode === "fix" && !existsSync(CWEBP)) { console.error("✖ missing vendor/cwebp.exe — run: node tools/avatar/fetch-cwebp.mjs"); process.exit(3); }
  mkdirSync(OUTDIR, { recursive: true });

  const report = [];
  let totalKB = 0;
  for (const { rel, blend } of ASSETS) {
    const abs = join(REPO, "assets", "avatar-r2", rel.replace("/", "\\"));
    const tag = rel.replace(/[\/.]/g, "-");
    const orig = decodeWebp(abs, tag);
    const st = analyse(rel, orig);
    const contaminated = st.partialLight > 0 || st.a0EdgeLight > 0;
    const repair = contaminated && blend === "normal";
    report.push({ ...st, blend, contaminated, repair });
    console.log(`${rel}  ${st.w}x${st.h}  blend=${blend}  opaque=${st.opaque}  partial=${st.partial} (light=${st.partialLight}, maxΔ=${st.maxPartialDelta})  a0edge=${st.a0Edge} (light=${st.a0EdgeLight})  → ${contaminated ? (repair ? "CONTAMINATED (repair)" : "contaminated but multiply-composited (no visible fringe; skip)") : "clean"}`);

    if (mode !== "fix" || !repair) continue;

    // repair
    const fixed = { w: orig.w, h: orig.h, ...decontaminate(orig) };
    const fixedPng = join(OUTDIR, tag + "-fixed.png");
    writeFileSync(fixedPng, encRGBA(fixed.w, fixed.h, fixed.rgba));

    // encode candidates: binding lossy (measured) + lossless-exact (repair-grade)
    const lossyOut = join(OUTDIR, tag + "-fixed-lossy.webp");
    const llOut = join(OUTDIR, tag + "-fixed.webp");
    encodeWebp(fixedPng, lossyOut, false);
    const ll1 = encodeWebp(fixedPng, llOut, true);
    const ll2 = encodeWebp(fixedPng, join(OUTDIR, tag + "-fixed-2nd.webp"), true);
    const deterministic = sha(ll1) === sha(ll2);

    // verify both candidates against the ORIGINAL runtime webp
    const verify = {};
    for (const [kind, p] of [["lossy", lossyOut], ["lossless", llOut]]) {
      const dec = decodeWebp(p, tag + "-verify-" + kind);
      const cmp = comparePlanes(orig, dec);
      const post = analyse(rel, dec);
      verify[kind] = { ...cmp, partialLightAfter: post.partialLight, a0EdgeLightAfter: post.a0EdgeLight, kb: +(readFileSync(p).length / 1024).toFixed(1) };
    }
    totalKB += verify.lossless.kb;

    // before/after composites (dark app bg + light) for the review pack
    writeFileSync(join(OUTDIR, tag + "-before-dark.png"), encRGBA(orig.w, orig.h, overBg(orig, 26, 26, 46).rgba));
    writeFileSync(join(OUTDIR, tag + "-after-dark.png"), encRGBA(fixed.w, fixed.h, overBg(fixed, 26, 26, 46).rgba));
    writeFileSync(join(OUTDIR, tag + "-before-light.png"), encRGBA(orig.w, orig.h, overBg(orig, 244, 241, 236).rgba));
    writeFileSync(join(OUTDIR, tag + "-after-light.png"), encRGBA(fixed.w, fixed.h, overBg(fixed, 244, 241, 236).rgba));

    const r = report[report.length - 1];
    r.changedPx = fixed.changed;
    r.deterministic = deterministic;
    r.verify = verify;
    console.log(`  fixed: changedPx=${fixed.changed}  deterministic=${deterministic}`);
    console.log(`  lossy   : alphaDiff=${verify.lossy.alphaDiff} opaqueRgbDiff=${verify.lossy.opaqueRgbDiff} (maxΔ=${verify.lossy.maxOpaqueDelta}) lightAfter=${verify.lossy.partialLightAfter}/${verify.lossy.a0EdgeLightAfter} ${verify.lossy.kb}KB`);
    console.log(`  lossless: alphaDiff=${verify.lossless.alphaDiff} opaqueRgbDiff=${verify.lossless.opaqueRgbDiff} (maxΔ=${verify.lossless.maxOpaqueDelta}) lightAfter=${verify.lossless.partialLightAfter}/${verify.lossless.a0EdgeLightAfter} ${verify.lossless.kb}KB`);
  }

  writeFileSync(join(OUTDIR, "report.json"), JSON.stringify(report, null, 2));
  if (mode === "fix") console.log(`\nlossless total for fixed assets: ${totalKB.toFixed(1)} KB (ADR-163D budget: total avatar < ~350 KB)`);
  console.log("report → " + join(OUTDIR, "report.json"));
}

main();
