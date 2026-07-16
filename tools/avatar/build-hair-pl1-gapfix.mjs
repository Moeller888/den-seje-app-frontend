// 167A Phase-2 Gate 3 — PL-1 hairline coverage-gap fix (deterministic, NON-AI).
// ---------------------------------------------------------------------------
// Punch-list item PL-1 (docs/167a-phase2-gate3-wp1-hair-review.md §5, ordered 2026-07-15):
// eliminate the 1,449 px of white show-through at the hairline/temples — Master-figure
// px in the head zone covered by NEITHER the D-057 base NOR the WP0 hair layer.
//
// IMPLEMENTATION CHOICE (decided in this task, per the punch-list wording):
//   BACKFILL the gap px from the Master inside the hair silhouette zone.
//   The alternative (widening the brown `isHair()` detection to include highlight
//   tones) is REJECTED for this task: it changes the raw hair mask globally,
//   risks new face/eyebrow/ear contamination, and cannot honour the punch-list
//   constraint "extraction elsewhere must stay byte-stable". Backfill by
//   construction touches ONLY the exact gap set and leaves every other pixel
//   byte-identical to the WP0 outputs.
//
// Method (no AI, all pixels come verbatim from the Master):
//   1. verify chain-input integrity (WP0 hair layer byte-identical to the tracked
//      fixture tools/avatar/fixtures/face-clean/hair-clean-color.png),
//   2. compute the gap set with the EXACT WP1 audit predicate
//      (build-hair-wp1-review.mjs §3: y < 505, Master-figure px, D-057 alpha ≤ 16,
//      hair alpha == 0),
//   3. HARD-FAIL if any gap px lies inside the WP0 eye boxes or the WP0
//      face-feature exclude zone (filling there would contaminate face/eyes),
//   4. write PL-1 hair layers = WP0 layers + Master RGBA at the gap px
//      (luminance map: same D-031 first-pass mapping L∈[lmin,lmax] → [90,250]
//       recomputed over the WP0 hair set, then applied to the fill px),
//   5. re-run the WP1 gap audit on the NEW layer (must be 0), re-run the eye-box
//      contamination audit (must be 0), verify byte-stability outside the gap set
//      (must be 0 differing px), and re-run the near-white halo audit (must not grow).
//
// Inputs (all read-only):
//   assets/avatar/reference/Northstar Master.png                        (tracked, D-032 datum)
//   assets/avatar/reference/neutral-base-v1-gate2-d053.png              (tracked, D-057)
//   tools/avatar/build/phase2/gate3-d057/hair-clean-color.png           (WP0 chain)
//   tools/avatar/build/phase2/gate3-d057/hair-northstar-v1-luminance.png(WP0 chain)
//   tools/avatar/fixtures/face-clean/hair-clean-color.png               (tracked WP0 proof)
//   → chain inputs are REQUIRED; fail loud with instructions if missing.
//
// Outputs (gitignored, review-only, NOT runtime assets) → build/phase2/gate3-d057/pl1/:
//   hair-pl1-color.png             (PL-1 hair layer, colour, transparent bg)
//   hair-pl1-luminance.png         (PL-1 luminance map, D-031 first-pass band [90,250])
//   gap-fill-overlay.png           (filled px highlighted green on the AFTER composite)
//   coverage-gap-after.png         (WP1 gap audit re-run on the PL-1 layer)
//   review-d057-pl1-hair.png / -on-dark.png (D-057 base + PL-1 hair composites)
//   hairline-before-after.png      (head-crop: WP0 composite vs PL-1 composite, side by side)
//   pl1-gapfix-report.json
//
// NO promote, NO assets/avatar-r2 write, NO R2_MANIFEST change, AVATAR_R2 untouched,
// NO runtime code, NO change to Master / D-057 / protect / the WP0 hair outputs
// (PL-1 layers are written as NEW files; the WP0 files are read, never rewritten).
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CHAIN = join(HERE, "build", "phase2", "gate3-d057");
const OUT = join(CHAIN, "pl1");
const MASTER = join(REPO, "assets", "avatar", "reference", "Northstar Master.png");
const D057 = join(REPO, "assets", "avatar", "reference", "neutral-base-v1-gate2-d053.png");
const HAIRCOLOR = join(CHAIN, "hair-clean-color.png");
const HAIRLUM = join(CHAIN, "hair-northstar-v1-luminance.png");
const FIXTURE = join(HERE, "fixtures", "face-clean", "hair-clean-color.png");
const W = 1024, H = 1536;

// WP0/WP1 constants — MUST match build-hair-clean.mjs / build-hair-wp1-review.mjs exactly.
const HAIR_MAX_Y = 505;
const FACE_EXCLUDE = { x0: 406, y0: 322, x1: 618, y1: 505, r: 40 };
const EYE_BOXES = [ { x0: 378, y0: 330, x1: 476, y1: 440 }, { x0: 531, y0: 330, x1: 629, y1: 440 } ];
const NEAR_WHITE = 244;
// head crop for the before/after strip (same bounds as WP1's tint sheet)
const HEAD = { x0: 270, y0: 40, x1: 758, y1: 520 };

for (const [p, hint] of [
  [HAIRCOLOR, "hair-clean-color.png"],
  [HAIRLUM, "hair-northstar-v1-luminance.png"],
]) {
  if (!existsSync(p)) {
    console.error("MISSING chain input: " + hint + "\nRun `node tools/avatar/build-hair-clean.mjs` first (WP0 chain).");
    process.exit(1);
  }
}

function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
function decodePng(buf){let off=8,ihdr=null;const idat=[];while(off<buf.length){const len=buf.readUInt32BE(off);const type=buf.toString("ascii",off+4,off+8);const data=buf.subarray(off+8,off+8+len);if(type==="IHDR")ihdr={w:data.readUInt32BE(0),h:data.readUInt32BE(4),bit:data[8],ct:data[9],il:data[12]};else if(type==="IDAT")idat.push(data);else if(type==="IEND")break;off+=12+len;}const ch=ihdr.ct===6?4:3,{w,h}=ihdr,stride=w*ch;const raw=inflateSync(Buffer.concat(idat));const px=Buffer.alloc(h*stride);let prev=Buffer.alloc(stride),p=0;for(let y=0;y<h;y++){const f=raw[p++];const cur=raw.subarray(p,p+stride);p+=stride;const out=px.subarray(y*stride,y*stride+stride);for(let x=0;x<stride;x++){const a=x>=ch?out[x-ch]:0,b=prev[x],c=x>=ch?prev[x-ch]:0;let v=cur[x];if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4)v+=paeth(a,b,c);out[x]=v&0xff;}prev=out;}const rgba=Buffer.alloc(w*h*4);for(let i=0;i<w*h;i++){rgba[i*4]=px[i*ch];rgba[i*4+1]=px[i*ch+1];rgba[i*4+2]=px[i*ch+2];rgba[i*4+3]=ch===4?px[i*ch+3]:255;}return {w,h,rgba};}
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(b){let c=0xffffffff;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&0xff]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const T=Buffer.from(t,"ascii");const cc=Buffer.alloc(4);cc.writeUInt32BE(crc32(Buffer.concat([T,d])),0);return Buffer.concat([l,T,d,cc]);}
function encRGBA(w,h,rgba){const st=w*4,raw=Buffer.alloc(h*(st+1));for(let y=0;y<h;y++){raw[y*(st+1)]=0;rgba.copy(raw,y*(st+1)+1,y*st,y*st+st);}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);}
function encRGB(w,h,rgb){const st=w*3,raw=Buffer.alloc(h*(st+1));for(let y=0;y<h;y++){raw[y*(st+1)]=0;rgb.copy(raw,y*(st+1)+1,y*st,y*st+st);}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);}

const isFig=(px,i)=>{const r=px[i*4],g=px[i*4+1],b=px[i*4+2],a=px[i*4+3];return a>16&&!(r>=244&&g>=244&&b>=244);};
const inBox=(x,y,B)=>x>=B.x0&&x<=B.x1&&y>=B.y0&&y<=B.y1;
const inRR=(x,y,B)=>{if(x<B.x0||x>B.x1||y<B.y0||y>B.y1)return false;const cx=x<B.x0+B.r?B.x0+B.r:(x>B.x1-B.r?B.x1-B.r:x),cy=y<B.y0+B.r?B.y0+B.r:(y>B.y1-B.r?B.y1-B.r:y);return (cx===x&&cy===y)?true:(x-cx)**2+(y-cy)**2<=B.r*B.r;};
const over=(out,i3,r,g,b,a)=>{const A=a/255;out[i3]=Math.round(r*A+out[i3]*(1-A));out[i3+1]=Math.round(g*A+out[i3+1]*(1-A));out[i3+2]=Math.round(b*A+out[i3+2]*(1-A));};

function main(){
  mkdirSync(OUT, { recursive: true });

  // ── 0. chain-input integrity: WP0 hair layer must equal the tracked fixture ──
  const chainBuf = readFileSync(HAIRCOLOR);
  if (existsSync(FIXTURE)) {
    const fixBuf = readFileSync(FIXTURE);
    if (!chainBuf.equals(fixBuf)) {
      console.error("CHAIN INTEGRITY FAIL: gate3-d057/hair-clean-color.png is NOT byte-identical to the tracked fixture\n" +
        "tools/avatar/fixtures/face-clean/hair-clean-color.png.\nRe-run `node tools/avatar/build-hair-clean.mjs` and re-check before PL-1.");
      process.exit(1);
    }
  } else {
    console.error("MISSING tracked fixture: tools/avatar/fixtures/face-clean/hair-clean-color.png (WP0 proof). Aborting.");
    process.exit(1);
  }

  const M  = decodePng(readFileSync(MASTER));
  const B  = decodePng(readFileSync(D057));
  const Hc = decodePng(chainBuf);
  const Hl = decodePng(readFileSync(HAIRLUM));

  // ── 1. gap set — EXACT WP1 audit predicate (build-hair-wp1-review.mjs §3) ──
  const gap=new Uint8Array(W*H);
  let gapPx=0, gapMinX=W,gapMaxX=0,gapMinY=H,gapMaxY=0;
  for(let y=0;y<HAIR_MAX_Y;y++)for(let x=0;x<W;x++){const i=y*W+x;
    if(!isFig(M.rgba,i))continue;
    if(B.rgba[i*4+3]>16)continue;          // D-057 covers it
    if(Hc.rgba[i*4+3]>0)continue;          // hair covers it
    gap[i]=1;gapPx++;
    if(x<gapMinX)gapMinX=x;if(x>gapMaxX)gapMaxX=x;if(y<gapMinY)gapMinY=y;if(y>gapMaxY)gapMaxY=y;}

  // ── 2. contamination guards on the fill set (HARD-FAIL, per punch-list) ──
  let gapInEyeBoxes=0, gapInFaceExclude=0;
  for(let y=0;y<HAIR_MAX_Y;y++)for(let x=0;x<W;x++){const i=y*W+x;if(!gap[i])continue;
    if(inBox(x,y,EYE_BOXES[0])||inBox(x,y,EYE_BOXES[1]))gapInEyeBoxes++;
    else if(inRR(x,y,FACE_EXCLUDE))gapInFaceExclude++;}
  if(gapInEyeBoxes>0||gapInFaceExclude>0){
    console.error("CONTAMINATION GUARD FAIL: gap px inside protected face zones — eyeBoxes "+gapInEyeBoxes+
      " · faceExclude "+gapInFaceExclude+".\nFilling these would put face/eye art into the hair layer. PL-1 aborted; nothing written.");
    process.exit(1);
  }

  // ── 3. backfill: PL-1 layers = WP0 layers + Master RGBA at the gap px ──
  // D-031 first-pass luminance mapping, recomputed over the WP0 hair set
  // (reproduces build-hair-clean.mjs step 3b: L∈[lmin,lmax] → [90,250]).
  let lmin=255,lmax=0;
  for(let i=0;i<W*H;i++)if(Hc.rgba[i*4+3]>0){const L=0.299*M.rgba[i*4]+0.587*M.rgba[i*4+1]+0.114*M.rgba[i*4+2];if(L<lmin)lmin=L;if(L>lmax)lmax=L;}
  const span=Math.max(1,lmax-lmin);

  const colorOut=Buffer.from(Hc.rgba);   // byte-copy of WP0 colour layer
  const lumOut=Buffer.from(Hl.rgba);     // byte-copy of WP0 luminance map
  let filled=0, fillLmin=255, fillLmax=0;
  for(let i=0;i<W*H;i++){if(!gap[i])continue;
    const r=M.rgba[i*4],g=M.rgba[i*4+1],b=M.rgba[i*4+2],a=M.rgba[i*4+3];
    colorOut[i*4]=r;colorOut[i*4+1]=g;colorOut[i*4+2]=b;colorOut[i*4+3]=a;
    const L=0.299*r+0.587*g+0.114*b;
    const gm=Math.max(90,Math.min(250,Math.round(((L-lmin)/span)*160+90)));
    lumOut[i*4]=gm;lumOut[i*4+1]=gm;lumOut[i*4+2]=gm;lumOut[i*4+3]=a;
    filled++;if(L<fillLmin)fillLmin=L;if(L>fillLmax)fillLmax=L;}
  writeFileSync(join(OUT,"hair-pl1-color.png"),encRGBA(W,H,colorOut));
  writeFileSync(join(OUT,"hair-pl1-luminance.png"),encRGBA(W,H,lumOut));

  // ── 4a. byte-stability audit OUTSIDE the gap set (must be 0 differing px) ──
  let colorDiffOutside=0, lumDiffOutside=0;
  for(let i=0;i<W*H;i++){if(gap[i])continue;
    if(colorOut[i*4]!==Hc.rgba[i*4]||colorOut[i*4+1]!==Hc.rgba[i*4+1]||colorOut[i*4+2]!==Hc.rgba[i*4+2]||colorOut[i*4+3]!==Hc.rgba[i*4+3])colorDiffOutside++;
    if(lumOut[i*4]!==Hl.rgba[i*4]||lumOut[i*4+1]!==Hl.rgba[i*4+1]||lumOut[i*4+2]!==Hl.rgba[i*4+2]||lumOut[i*4+3]!==Hl.rgba[i*4+3])lumDiffOutside++;}

  // ── 4b. WP1 gap audit RE-RUN on the PL-1 layer (must be 0) ──
  let gapAfter=0;
  for(let y=0;y<HAIR_MAX_Y;y++)for(let x=0;x<W;x++){const i=y*W+x;
    if(!isFig(M.rgba,i))continue;
    if(B.rgba[i*4+3]>16)continue;
    if(colorOut[i*4+3]>0)continue;
    gapAfter++;}

  // ── 4c. eye-box contamination audit on the PL-1 layer (must be 0) ──
  let eyeContamAfter=0;
  for(const Bx of EYE_BOXES)for(let y=Bx.y0;y<=Bx.y1;y++)for(let x=Bx.x0;x<=Bx.x1;x++)if(colorOut[(y*W+x)*4+3]>0)eyeContamAfter++;

  // ── 4d. near-white halo audit before vs after (must not grow) ──
  const nearWhite=(px,i)=>px[i*4]>=NEAR_WHITE&&px[i*4+1]>=NEAR_WHITE&&px[i*4+2]>=NEAR_WHITE;
  let haloBefore=0,haloAfter=0;
  for(let i=0;i<W*H;i++){if(Hc.rgba[i*4+3]>0&&nearWhite(Hc.rgba,i))haloBefore++;if(colorOut[i*4+3]>0&&nearWhite(colorOut,i))haloAfter++;}

  const guards={
    gapAfter, eyeBoxContaminationAfter:eyeContamAfter,
    colorDiffOutsideGap:colorDiffOutside, luminanceDiffOutsideGap:lumDiffOutside,
    haloBefore, haloAfter, haloGrew:haloAfter>haloBefore,
  };
  const pass = gapAfter===0 && eyeContamAfter===0 && colorDiffOutside===0 && lumDiffOutside===0 && haloAfter<=haloBefore;

  // ── 5. review composites ──
  function baseCanvas(bg){const out=Buffer.alloc(W*H*3);for(let i=0;i<W*H;i++){out[i*3]=bg[0];out[i*3+1]=bg[1];out[i*3+2]=bg[2];}
    for(let i=0;i<W*H;i++){const a=B.rgba[i*4+3];if(a>0)over(out,i*3,B.rgba[i*4],B.rgba[i*4+1],B.rgba[i*4+2],a);}
    return out;}
  function withHair(bg,hair){const out=baseCanvas(bg);
    for(let i=0;i<W*H;i++){const a=hair[i*4+3];if(a>0)over(out,i*3,hair[i*4],hair[i*4+1],hair[i*4+2],a);}
    return out;}
  const afterWhite=withHair([255,255,255],colorOut);
  writeFileSync(join(OUT,"review-d057-pl1-hair.png"),encRGB(W,H,afterWhite));
  writeFileSync(join(OUT,"review-d057-pl1-hair-on-dark.png"),encRGB(W,H,withHair([38,40,46],colorOut)));

  // filled px highlighted green on the AFTER composite
  const overlay=Buffer.from(afterWhite);
  for(let i=0;i<W*H;i++)if(gap[i]){overlay[i*3]=0;overlay[i*3+1]=200;overlay[i*3+2]=0;}
  writeFileSync(join(OUT,"gap-fill-overlay.png"),encRGB(W,H,overlay));

  // WP1-style gap visual re-run on the PL-1 layer (should show NO magenta)
  const gapAfterImg=Buffer.from(afterWhite);
  for(let y=0;y<HAIR_MAX_Y;y++)for(let x=0;x<W;x++){const i=y*W+x;
    if(!isFig(M.rgba,i))continue;if(B.rgba[i*4+3]>16)continue;if(colorOut[i*4+3]>0)continue;
    gapAfterImg[i*3]=255;gapAfterImg[i*3+1]=0;gapAfterImg[i*3+2]=255;}
  writeFileSync(join(OUT,"coverage-gap-after.png"),encRGB(W,H,gapAfterImg));

  // head-crop before/after strip (WP0 composite left, PL-1 composite right)
  const beforeWhite=withHair([255,255,255],Hc.rgba);
  const cw=HEAD.x1-HEAD.x0+1,chh=HEAD.y1-HEAD.y0+1,PAD=8;
  const stripW=2*cw+3*PAD,stripH=chh+2*PAD;
  const strip=Buffer.alloc(stripW*stripH*3,235);
  [beforeWhite,afterWhite].forEach((img,k)=>{const gx=PAD+k*(cw+PAD);
    for(let y=0;y<chh;y++)for(let x=0;x<cw;x++){const s=((HEAD.y0+y)*W+(HEAD.x0+x))*3,d=((PAD+y)*stripW+(gx+x))*3;
      strip[d]=img[s];strip[d+1]=img[s+1];strip[d+2]=img[s+2];}});
  writeFileSync(join(OUT,"hairline-before-after.png"),encRGB(stripW,stripH,strip));

  // ── 6. report ──
  writeFileSync(join(OUT,"pl1-gapfix-report.json"),JSON.stringify({
    tool:"build-hair-pl1-gapfix",
    task:"G3 punch-list PL-1 — hairline coverage-gap fix (deterministic backfill from Master, NON-AI)",
    implementationChoice:{chosen:"backfill gap px from the Master",
      rejected:"widen isHair() highlight-tone detection",
      why:"backfill touches ONLY the exact WP1 gap set; detector widening changes the raw mask globally and cannot guarantee byte-stability elsewhere"},
    inputs:{master:"Northstar Master.png",base:"neutral-base-v1-gate2-d053.png (D-057)",
      hairColor:"gate3-d057/hair-clean-color.png (verified byte-identical to tracked fixture)",
      hairLuminance:"gate3-d057/hair-northstar-v1-luminance.png"},
    gapBefore:{gapPx,bbox:gapPx?{x0:gapMinX,y0:gapMinY,x1:gapMaxX,y1:gapMaxY}:null,
      inEyeBoxes:gapInEyeBoxes,inFaceExclude:gapInFaceExclude},
    fill:{filledPx:filled,source:"Master RGBA verbatim",
      luminanceMapping:{model:"D-031 first-pass",lmin:+lmin.toFixed(1),lmax:+lmax.toFixed(1),band:"[90,250]",
        note:"same mapping as build-hair-clean step 3b, recomputed over the WP0 hair set; fill px mapped with it and clamped to the band"},
      fillLuminance:{min:+fillLmin.toFixed(1),max:+fillLmax.toFixed(1)}},
    guards,
    verdict:pass?"PASS — gap 0, contamination 0, byte-stable outside gap, halo did not grow":"FAIL — see guards",
    outputs:["hair-pl1-color.png","hair-pl1-luminance.png","gap-fill-overlay.png","coverage-gap-after.png",
      "review-d057-pl1-hair.png","review-d057-pl1-hair-on-dark.png","hairline-before-after.png"],
    boundaries:"review-only; NOT runtime assets; no promote; no assets/avatar-r2; no R2_MANIFEST; AVATAR_R2 false; Master/D-057/protect/WP0-outputs unchanged (PL-1 layers are NEW files)",
  },null,2));

  console.log("✔ PL-1 hairline gap-fix:");
  console.log("  gap before "+gapPx+"px bbox("+gapMinX+","+gapMinY+")-("+gapMaxX+","+gapMaxY+") · in eye boxes "+gapInEyeBoxes+" · in face-exclude "+gapInFaceExclude);
  console.log("  filled "+filled+"px from Master · fill L "+fillLmin.toFixed(0)+"–"+fillLmax.toFixed(0)+" → band [90,250]");
  console.log("  gap AFTER "+gapAfter+"px · eye-box contamination "+eyeContamAfter+"px · outside-gap diffs color "+colorDiffOutside+" / lum "+lumDiffOutside);
  console.log("  near-white halo "+haloBefore+" → "+haloAfter+(haloAfter<=haloBefore?" (did not grow ✓)":" (GREW ✗)"));
  console.log("  VERDICT: "+(pass?"PASS ✓":"FAIL ✗"));
  console.log("  → pl1/hair-pl1-color.png · hair-pl1-luminance.png · gap-fill-overlay.png · coverage-gap-after.png · hairline-before-after.png");
  if(!pass)process.exit(1);
}
main();
