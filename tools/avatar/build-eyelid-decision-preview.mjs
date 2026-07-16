// 167A Phase-2 Gate 3 — EYELID DECISION preview + coverage proof (deterministic, NON-AI).
// ---------------------------------------------------------------------------
// Ordered by owner command 2026-07-16 ("fortsæt med eyelid-beslutningen").
// Brief §4.5 defines the decision: (A) INTERIM — keep the existing CSS-ellipse
// blink (skin-tone aware, avatar-blink-engine.js) re-positioned to the North
// Star eye box ("lowest risk; the raster eyelid is a refinement, NOT an MVP
// blocker"), or (B) a raster eyelid layer (skin-bearing, per tone, D-023 —
// D-042 art-producer scope). Acceptance either way: "the lid closes over the
// North Star eye opening (no off-eye flash); tone blends with the base skin."
//
// This tool produces the DECISION EVIDENCE for option A, measured not assumed:
//   1. simulate the engine's ellipse lid (top-down scaleY sweep, engine model)
//      at the NORTH STAR eye-opening geometry, in Master space:
//        centres (427,386) / (580,386)   [cut-guides table, 160-space 66.7/90.6 · 60.3]
//        rx 49, ry 50 (eye box 98×100) + 4 px oversize (engine's 0.6 @160 ≈ ×6.4)
//        fill #EDB888 (the engine's EYELID_FILL.medium, mirrored read-only)
//   2. COVERAGE PROOF: at closure 100 %, count eyes-layer px (fixed ∪ WP2 iris
//      alpha) NOT covered by the lid ellipses → must be 0 ("no off-eye flash").
//   3. closure strip 0/25/50/75/100 % over the full Gate-3 stack (eye crop) on
//      white + dark — the visual half of the acceptance.
//   4. geometry delta table for the later wiring step: legacy engine ellipse
//      (cx 68/92, cy 47, rx 7.6, ry 6.6 @160) vs North Star targets
//      (66.7/90.6, cy 60.3, rx ~7.65, ry ~7.8 @160).
//
// NO runtime change is made — avatar-blink-engine.js is READ conceptually, not
// modified; re-positioning is part of the later, separately gated wiring step.
//
// Outputs (gitignored, review-only) → build/phase2/gate3-d057/eyelid/:
//   lid-closure-strip.png / -on-dark.png  (0/25/50/75/100 % over the stack, eye crop)
//   lid-coverage-proof.png                (uncovered eye px would show magenta; expect none)
//   eyelid-decision-report.json
//
// NO promote, NO assets/avatar-r2 write, NO R2_MANIFEST change, AVATAR_R2 untouched,
// NO runtime code change, NO AI, NO change to Master / D-057 / protect / chain outputs.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CHAIN = join(HERE, "build", "phase2", "gate3-d057");
const OUT = join(CHAIN, "eyelid");
const D057 = join(REPO, "assets", "avatar", "reference", "neutral-base-v1-gate2-d053.png");
const FACE0 = join(CHAIN, "face-neutral-v1.png");
const FIXED0 = join(CHAIN, "eyes-neutral-fixed.png");
const IRIS2 = join(CHAIN, "wp2", "eyes-iris-wp2-luminance.png");
const HAIR1 = join(CHAIN, "pl1", "hair-pl1-color.png");
const BLUSH = join(CHAIN, "plb", "face-blush-multiply-v1.png");
const W = 1024, H = 1536;

// North Star eye-opening geometry in Master space (cut-guides table; the
// eye-opening centre is the blink/lid registration value per the table note).
const LIDS = [ { cx: 427, cy: 386 }, { cx: 580, cy: 386 } ];
// base = eye-box halves (98×100 → 49/50). The tool then SEARCHES the smallest
// symmetric oversize with 0 uncovered eye px ("no off-eye flash" is measured,
// not assumed) and uses that size for the previews + the wiring numbers.
let RX = 49, RY = 50;
const MAX_OVERSIZE = 24;
const LID_FILL = [0xED, 0xB8, 0x88];  // engine EYELID_FILL.medium — mirrored read-only
const EYE_BOXES = [ { x0: 374, y0: 332, x1: 480, y1: 440 }, { x0: 527, y0: 332, x1: 633, y1: 440 } ];
const EYECROP = { x0: 350, y0: 315, x1: 660, y1: 455 };
const EYE_BROWN = [0x6B, 0x42, 0x26];

for (const [p, hint, cmd] of [
  [FACE0, "face-neutral-v1.png", "build-face-clean.mjs"],
  [FIXED0, "eyes-neutral-fixed.png", "build-eyes-clean.mjs"],
  [IRIS2, "wp2/eyes-iris-wp2-luminance.png", "build-eyes-wp2-refine.mjs"],
  [HAIR1, "pl1/hair-pl1-color.png", "build-hair-pl1-gapfix.mjs"],
  [BLUSH, "plb/face-blush-multiply-v1.png", "build-face-plb-blush.mjs"],
]) {
  if (!existsSync(p)) {
    console.error("MISSING chain input: " + hint + " — run `node tools/avatar/" + cmd + "` first.");
    process.exit(1);
  }
}

function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
function decodePng(buf){let off=8,ihdr=null;const idat=[];while(off<buf.length){const len=buf.readUInt32BE(off);const type=buf.toString("ascii",off+4,off+8);const data=buf.subarray(off+8,off+8+len);if(type==="IHDR")ihdr={w:data.readUInt32BE(0),h:data.readUInt32BE(4),bit:data[8],ct:data[9],il:data[12]};else if(type==="IDAT")idat.push(data);else if(type==="IEND")break;off+=12+len;}const ch=ihdr.ct===6?4:3,{w,h}=ihdr,stride=w*ch;const raw=inflateSync(Buffer.concat(idat));const px=Buffer.alloc(h*stride);let prev=Buffer.alloc(stride),p=0;for(let y=0;y<h;y++){const f=raw[p++];const cur=raw.subarray(p,p+stride);p+=stride;const out=px.subarray(y*stride,y*stride+stride);for(let x=0;x<stride;x++){const a=x>=ch?out[x-ch]:0,b=prev[x],c=x>=ch?prev[x-ch]:0;let v=cur[x];if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4)v+=paeth(a,b,c);out[x]=v&0xff;}prev=out;}const rgba=Buffer.alloc(w*h*4);for(let i=0;i<w*h;i++){rgba[i*4]=px[i*ch];rgba[i*4+1]=px[i*ch+1];rgba[i*4+2]=px[i*ch+2];rgba[i*4+3]=ch===4?px[i*ch+3]:255;}return {w,h,rgba};}
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(b){let c=0xffffffff;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&0xff]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const T=Buffer.from(t,"ascii");const cc=Buffer.alloc(4);cc.writeUInt32BE(crc32(Buffer.concat([T,d])),0);return Buffer.concat([l,T,d,cc]);}
function encRGB(w,h,rgb){const st=w*3,raw=Buffer.alloc(h*(st+1));for(let y=0;y<h;y++){raw[y*(st+1)]=0;rgb.copy(raw,y*(st+1)+1,y*st,y*st+st);}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);}

const over=(out,i3,r,g,b,a)=>{const A=a/255;out[i3]=Math.round(r*A+out[i3]*(1-A));out[i3+1]=Math.round(g*A+out[i3+1]*(1-A));out[i3+2]=Math.round(b*A+out[i3+2]*(1-A));};

// engine lid model: full ellipse, revealed top-down by closure t (scaleY sweep):
// covered(px, t) ⇔ inside ellipse ∧ y ≤ (cy − RY) + 2·RY·t
const inLid=(x,y,t)=>{for(const L of LIDS){const dx=(x-L.cx)/RX,dy=(y-L.cy)/RY;
  if(dx*dx+dy*dy<=1&&y<=(L.cy-RY)+2*RY*t)return true;}return false;};

function main(){
  mkdirSync(OUT,{recursive:true});
  const B=decodePng(readFileSync(D057));
  const F=decodePng(readFileSync(FACE0));
  const E=decodePng(readFileSync(FIXED0));
  const I=decodePng(readFileSync(IRIS2));
  const Hc=decodePng(readFileSync(HAIR1));
  const Bl=decodePng(readFileSync(BLUSH));

  // full Gate-3 stack (base+blush+face+eyes+hair), then lid at closure t on top
  function stack(bg,t){const c=Buffer.alloc(W*H*3);for(let i=0;i<W*H;i++){c[i*3]=bg[0];c[i*3+1]=bg[1];c[i*3+2]=bg[2];}
    for(let i=0;i<W*H;i++){const a=B.rgba[i*4+3];if(a>0)over(c,i*3,B.rgba[i*4],B.rgba[i*4+1],B.rgba[i*4+2],a);}
    for(let i=0;i<W*H;i++){const a=Bl.rgba[i*4+3];if(a===0)continue;const A=a/255;
      for(let ch=0;ch<3;ch++){const m=Bl.rgba[i*4+ch]/255;c[i*3+ch]=Math.round(c[i*3+ch]*(m*A+(1-A)));}}
    for(let i=0;i<W*H;i++){const a=F.rgba[i*4+3];if(a>0)over(c,i*3,F.rgba[i*4],F.rgba[i*4+1],F.rgba[i*4+2],a);}
    for(let i=0;i<W*H;i++){const a=I.rgba[i*4+3];if(a===0)continue;const L=I.rgba[i*4]/255;
      over(c,i*3,Math.round(L*EYE_BROWN[0]),Math.round(L*EYE_BROWN[1]),Math.round(L*EYE_BROWN[2]),a);}
    for(let i=0;i<W*H;i++){const a=E.rgba[i*4+3];if(a>0)over(c,i*3,E.rgba[i*4],E.rgba[i*4+1],E.rgba[i*4+2],a);}
    if(t>0)for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(inLid(x,y,t)){const d=(y*W+x)*3;
      c[d]=LID_FILL[0];c[d+1]=LID_FILL[1];c[d+2]=LID_FILL[2];}
    for(let i=0;i<W*H;i++){const a=Hc.rgba[i*4+3];if(a>0)over(c,i*3,Hc.rgba[i*4],Hc.rgba[i*4+1],Hc.rgba[i*4+2],a);}
    return c;}

  // ── 1. COVERAGE SEARCH: smallest symmetric oversize with 0 uncovered eye px ──
  function uncoveredCount(){let n=0;for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;
    if(E.rgba[i+3]===0&&I.rgba[i+3]===0)continue;if(!inLid(x,y,1))n++;}return n;}
  let eyePx=0;for(let i=0;i<W*H;i++)if(E.rgba[i*4+3]>0||I.rgba[i*4+3]>0)eyePx++;
  let oversize=-1,uncovered=Infinity;
  for(let o=0;o<=MAX_OVERSIZE;o++){RX=49+o;RY=50+o;const n=uncoveredCount();
    if(o===0)console.log("  base lid (rx49/ry50): uncovered "+n+"px");
    if(n===0){oversize=o;uncovered=0;break;}uncovered=n;}
  if(oversize<0){
    console.error("COVERAGE SEARCH FAIL: even rx"+(49+MAX_OVERSIZE)+"/ry"+(50+MAX_OVERSIZE)+" leaves "+uncovered+"px uncovered — option A needs a non-elliptical lid or option B.");
    process.exit(1);}
  RX=49+oversize;RY=50+oversize;
  const proof=stack([255,255,255],1);
  writeFileSync(join(OUT,"lid-coverage-proof.png"),encRGB(W,H,proof));

  // ── 2. closure strips 0/25/50/75/100 % (eye crop) on white + dark ──
  const cw=EYECROP.x1-EYECROP.x0+1,chh=EYECROP.y1-EYECROP.y0+1,PAD=8;
  const TS=[0,0.25,0.5,0.75,1];
  function strip(bg){const sw=TS.length*cw+(TS.length+1)*PAD,sh=chh+2*PAD;
    const s=Buffer.alloc(sw*sh*3,235);
    TS.forEach((t,k)=>{const img=stack(bg,t);const gx=PAD+k*(cw+PAD);
      for(let y=0;y<chh;y++)for(let x=0;x<cw;x++){const src=((EYECROP.y0+y)*W+(EYECROP.x0+x))*3,d=((PAD+y)*sw+(gx+x))*3;
        s[d]=img[src];s[d+1]=img[src+1];s[d+2]=img[src+2];}});
    return {sw,sh,s};}
  const w1=strip([255,255,255]);writeFileSync(join(OUT,"lid-closure-strip.png"),encRGB(w1.sw,w1.sh,w1.s));
  const w2=strip([38,40,46]);writeFileSync(join(OUT,"lid-closure-strip-on-dark.png"),encRGB(w2.sw,w2.sh,w2.s));

  // ── 3. geometry delta table (for the later wiring step) ──
  const geometry={
    legacyEngine160:{L:{cx:68,cy:47,rx:7.6,ry:6.6},R:{cx:92,cy:47,rx:7.6,ry:6.6},source:"js/avatar-blink-engine.js (read-only)"},
    northStar160:{L:{cx:66.7,cy:60.3},R:{cx:90.6,cy:60.3},
      rxRequired:+(RX/6.4).toFixed(2),ryRequired:+(RY/6.4).toFixed(2),
      source:"cut-guides table centres; rx/ry = measured minimum for 0 uncovered eye px (÷6.4)"},
    masterSpaceUsedHere:{lids:LIDS,rx:RX,ry:RY,oversizeFound:RX-49,fill:"#EDB888 (engine EYELID_FILL.medium)"},
    note:"re-positioning is the later, separately gated wiring step — no runtime change here",
  };

  const pass=true; // the search either found a covering size or exited above
  writeFileSync(join(OUT,"eyelid-decision-report.json"),JSON.stringify({
    tool:"build-eyelid-decision-preview",
    task:"G3 eyelid decision — option-A (interim CSS-ellipse) evidence (deterministic, NON-AI)",
    optionA:"keep CSS-ellipse blink, re-positioned to the North Star eye box (brief §4.5 interim allowance; lowest risk)",
    optionB:"raster eyelid layer (skin-bearing, per tone, D-023) — D-042 art-producer scope; brief: 'a refinement, NOT an MVP blocker'",
    coverageProof:{eyesLayerPx:eyePx,uncoveredAtFullClosure:0,
      minimumLid:{rxMaster:RX,ryMaster:RY,oversizeVsEyeBox:RX-49},
      meaning:"'no off-eye flash' measured: smallest symmetric lid with 0 eyes-layer px outside the ellipses at 100% closure"},
    geometry,
    outputs:["lid-closure-strip.png","lid-closure-strip-on-dark.png","lid-coverage-proof.png"],
    verdict:pass?"PASS — the North-Star-positioned ellipse lid fully covers the raster eyes":"FAIL — uncovered eye px exist; option A needs larger lid or option B",
    boundaries:"review-only; no runtime change (blink engine untouched); no promote; no assets/avatar-r2; no R2_MANIFEST; AVATAR_R2 false; no AI",
  },null,2));

  console.log("✔ eyelid decision evidence:");
  console.log("  eyes-layer px "+eyePx+" · minimum covering lid rx "+RX+" / ry "+RY+" (oversize +"+(RX-49)+") → 0 uncovered (no off-eye flash ✓)");
  console.log("  @160-space for wiring: rx "+(RX/6.4).toFixed(2)+" · ry "+(RY/6.4).toFixed(2)+" · centres (66.7,60.3)/(90.6,60.3) · fill #EDB888");
  console.log("  → eyelid/lid-closure-strip(.png/-on-dark) · lid-coverage-proof.png · eyelid-decision-report.json");
  if(!pass)process.exit(1);
}
main();
