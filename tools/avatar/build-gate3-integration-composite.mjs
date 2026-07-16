// 167A Phase-2 Gate 3 — INTEGRATION COMPOSITE (deterministic, NON-AI).
// ---------------------------------------------------------------------------
// G3-INTEGRATION (owner command 2026-07-16) — the last deterministic Gate-3
// item: assemble ALL accepted/countersigned Gate-3 candidates into the complete
// layered stack and prove, with measurements, that the decomposition
// REASSEMBLES into the Master-equivalent character.
//
// Layers under integration (z-order):
//   z0  base   D-057 neutral base (tracked, sha 2CB93EE0…)
//   z2  blush  plb/face-blush-multiply-v1.png            (PL-B, multiply)
//   z3  face   face-neutral-v1.png                        (WP3)
//   z4  eyes   wp2/eyes-iris-wp2-luminance.png × token + eyes-neutral-fixed.png (WP2)
//   z40 hair   IDENTITY path: pl1/hair-pl1-color.png      (PL-1)
//              RUNTIME  path: pl2/hair-pl2-luminance.png × token (PL-2, D-031)
//
// Measurements:
//   1. FULL-STACK COVERAGE (hard guard): Master-figure px in the head zone
//      (y < 505) covered by NO layer → must be 0 (the PL-1 metric, extended to
//      the whole stack).
//   2. MASTER FIDELITY (reported, owner-review evidence): mean / p50 / p95 RGB
//      delta vs the Master over head-zone Master-figure px, for BOTH hair
//      paths. The runtime path is expected to sit near the identity path —
//      the delta between the two isolates the D-031 multiply approximation.
//   3. TINT MATRIX evidence: 8 hair tokens (iris brown) + 6 iris preview
//      colors (hair brown) on the FULL stack, head crops; full-figure small
//      sizes 64/48/32 for the default look.
//
// Outputs (gitignored, review-only, NOT runtime assets) → build/phase2/gate3-d057/integration/:
//   master-vs-stacks.png        (head crop: Master | identity stack | runtime stack)
//   fidelity-heatmap.png        (per-px delta of the runtime stack vs Master, head crop)
//   stack-default.png / -on-dark.png (full figure, runtime path, brown/brown)
//   hair-tint-matrix.png        (8 hair tokens on the full stack, head crop)
//   iris-tint-matrix.png        (6 iris preview colors on the full stack, eye crop)
//   stack-small-sizes.png       (default look at 64/48/32, ×4)
//   integration-report.json
//
// NO promote, NO assets/avatar-r2 write, NO R2_MANIFEST change, AVATAR_R2 untouched,
// NO runtime code, NO AI, NO change to Master / D-057 / protect / chain outputs.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CHAIN = join(HERE, "build", "phase2", "gate3-d057");
const OUT = join(CHAIN, "integration");
const MASTER = join(REPO, "assets", "avatar", "reference", "Northstar Master.png");
const D057 = join(REPO, "assets", "avatar", "reference", "neutral-base-v1-gate2-d053.png");
const INPUTS = {
  face:  [join(CHAIN, "face-neutral-v1.png"), "build-face-clean.mjs"],
  fixed: [join(CHAIN, "eyes-neutral-fixed.png"), "build-eyes-clean.mjs"],
  iris:  [join(CHAIN, "wp2", "eyes-iris-wp2-luminance.png"), "build-eyes-wp2-refine.mjs"],
  hairC: [join(CHAIN, "pl1", "hair-pl1-color.png"), "build-hair-pl1-gapfix.mjs"],
  hairL: [join(CHAIN, "pl2", "hair-pl2-luminance.png"), "build-hair-pl2-remap.mjs"],
  blush: [join(CHAIN, "plb", "face-blush-multiply-v1.png"), "build-face-plb-blush.mjs"],
};
const W = 1024, H = 1536;
const HAIR_MAX_Y = 505;
const HEAD = { x0: 270, y0: 40, x1: 758, y1: 520 };
const EYECROP = { x0: 350, y0: 315, x1: 660, y1: 455 };

// Mirrored read-only: HAIR_COLOR_TOKENS (155E) + the WP2 preview iris set (proposal).
const HAIR_TOKENS = {
  black:        "#2B2622", dark_brown: "#3F2A1B", brown: "#5A3D28", light_brown: "#8A5E3B",
  blonde:       "#C99A5B", red: "#A8442A", auburn: "#803A24", fantasy_blue: "#4A78C8",
};
const EYE_PREVIEW = {
  brown: "#6B4226", blue: "#4A78C8", green: "#3E7D4E",
  amber: "#B87A33", gray: "#7A8089", violet: "#7B5AA6",
};

for (const [k, [p, cmd]] of Object.entries(INPUTS)) {
  if (!existsSync(p)) {
    console.error("MISSING chain input (" + k + "): " + p + "\nRun `node tools/avatar/" + cmd + "` first.");
    process.exit(1);
  }
}

function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
function decodePng(buf){let off=8,ihdr=null;const idat=[];while(off<buf.length){const len=buf.readUInt32BE(off);const type=buf.toString("ascii",off+4,off+8);const data=buf.subarray(off+8,off+8+len);if(type==="IHDR")ihdr={w:data.readUInt32BE(0),h:data.readUInt32BE(4),bit:data[8],ct:data[9],il:data[12]};else if(type==="IDAT")idat.push(data);else if(type==="IEND")break;off+=12+len;}const ch=ihdr.ct===6?4:3,{w,h}=ihdr,stride=w*ch;const raw=inflateSync(Buffer.concat(idat));const px=Buffer.alloc(h*stride);let prev=Buffer.alloc(stride),p=0;for(let y=0;y<h;y++){const f=raw[p++];const cur=raw.subarray(p,p+stride);p+=stride;const out=px.subarray(y*stride,y*stride+stride);for(let x=0;x<stride;x++){const a=x>=ch?out[x-ch]:0,b=prev[x],c=x>=ch?prev[x-ch]:0;let v=cur[x];if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4)v+=paeth(a,b,c);out[x]=v&0xff;}prev=out;}const rgba=Buffer.alloc(w*h*4);for(let i=0;i<w*h;i++){rgba[i*4]=px[i*ch];rgba[i*4+1]=px[i*ch+1];rgba[i*4+2]=px[i*ch+2];rgba[i*4+3]=ch===4?px[i*ch+3]:255;}return {w,h,rgba};}
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(b){let c=0xffffffff;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&0xff]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const T=Buffer.from(t,"ascii");const cc=Buffer.alloc(4);cc.writeUInt32BE(crc32(Buffer.concat([T,d])),0);return Buffer.concat([l,T,d,cc]);}
function encRGB(w,h,rgb){const st=w*3,raw=Buffer.alloc(h*(st+1));for(let y=0;y<h;y++){raw[y*(st+1)]=0;rgb.copy(raw,y*(st+1)+1,y*st,y*st+st);}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);}

const hex2rgb=(hx)=>[parseInt(hx.slice(1,3),16),parseInt(hx.slice(3,5),16),parseInt(hx.slice(5,7),16)];
const over=(out,i3,r,g,b,a)=>{const A=a/255;out[i3]=Math.round(r*A+out[i3]*(1-A));out[i3+1]=Math.round(g*A+out[i3+1]*(1-A));out[i3+2]=Math.round(b*A+out[i3+2]*(1-A));};
const isFig=(px,i)=>{const r=px[i*4],g=px[i*4+1],b=px[i*4+2],a=px[i*4+3];return a>16&&!(r>=244&&g>=244&&b>=244);};

function main(){
  mkdirSync(OUT,{recursive:true});
  const M=decodePng(readFileSync(MASTER));
  const B=decodePng(readFileSync(D057));
  const F=decodePng(readFileSync(INPUTS.face[0]));
  const E=decodePng(readFileSync(INPUTS.fixed[0]));
  const I=decodePng(readFileSync(INPUTS.iris[0]));
  const Hc=decodePng(readFileSync(INPUTS.hairC[0]));
  const Hl=decodePng(readFileSync(INPUTS.hairL[0]));
  const Bl=decodePng(readFileSync(INPUTS.blush[0]));

  // ── stack assembler ──
  // hairMode: {color:true} → identity path (PL-1 colour layer);
  //           {token:[r,g,b]} → runtime path (PL-2 map × token, D-031)
  function stack(bg,hairMode,irisRGB){const c=Buffer.alloc(W*H*3);
    for(let i=0;i<W*H;i++){c[i*3]=bg[0];c[i*3+1]=bg[1];c[i*3+2]=bg[2];}
    for(let i=0;i<W*H;i++){const a=B.rgba[i*4+3];if(a>0)over(c,i*3,B.rgba[i*4],B.rgba[i*4+1],B.rgba[i*4+2],a);}
    for(let i=0;i<W*H;i++){const a=Bl.rgba[i*4+3];if(a===0)continue;const A=a/255;
      for(let ch=0;ch<3;ch++){const m=Bl.rgba[i*4+ch]/255;c[i*3+ch]=Math.round(c[i*3+ch]*(m*A+(1-A)));}}
    for(let i=0;i<W*H;i++){const a=F.rgba[i*4+3];if(a>0)over(c,i*3,F.rgba[i*4],F.rgba[i*4+1],F.rgba[i*4+2],a);}
    for(let i=0;i<W*H;i++){const a=I.rgba[i*4+3];if(a===0)continue;const L=I.rgba[i*4]/255;
      over(c,i*3,Math.round(L*irisRGB[0]),Math.round(L*irisRGB[1]),Math.round(L*irisRGB[2]),a);}
    for(let i=0;i<W*H;i++){const a=E.rgba[i*4+3];if(a>0)over(c,i*3,E.rgba[i*4],E.rgba[i*4+1],E.rgba[i*4+2],a);}
    if(hairMode.color){
      for(let i=0;i<W*H;i++){const a=Hc.rgba[i*4+3];if(a>0)over(c,i*3,Hc.rgba[i*4],Hc.rgba[i*4+1],Hc.rgba[i*4+2],a);}
    }else{
      const t=hairMode.token;
      for(let i=0;i<W*H;i++){const a=Hl.rgba[i*4+3];if(a===0)continue;const L=Hl.rgba[i*4]/255;
        over(c,i*3,Math.round(L*t[0]),Math.round(L*t[1]),Math.round(L*t[2]),a);}
    }
    return c;}

  const brownHair=hex2rgb(HAIR_TOKENS.brown),brownIris=hex2rgb(EYE_PREVIEW.brown);
  const identity=stack([255,255,255],{color:true},brownIris);
  const runtime=stack([255,255,255],{token:brownHair},brownIris);

  // ── 1. FULL-STACK COVERAGE (hard guard): head-zone Master-figure px with no layer ──
  let gapPx=0;
  for(let y=0;y<HAIR_MAX_Y;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;
    if(!isFig(M.rgba,y*W+x))continue;
    if(B.rgba[i+3]>16)continue;
    if(F.rgba[i+3]>0||E.rgba[i+3]>0||I.rgba[i+3]>0||Hc.rgba[i+3]>0)continue;
    gapPx++;}
  if(gapPx>0){console.error("INTEGRATION COVERAGE FAIL: "+gapPx+" head-zone px uncovered. Nothing written.");process.exit(1);}

  // ── 2. MASTER FIDELITY (reported): RGB delta over head-zone Master-figure px ──
  function fidelity(img){const deltas=[];let sum=0;
    for(let y=0;y<HAIR_MAX_Y;y++)for(let x=0;x<W;x++){const j=y*W+x;if(!isFig(M.rgba,j))continue;
      const i3=j*3,i4=j*4;
      const d=(Math.abs(img[i3]-M.rgba[i4])+Math.abs(img[i3+1]-M.rgba[i4+1])+Math.abs(img[i3+2]-M.rgba[i4+2]))/3;
      deltas.push(d);sum+=d;}
    deltas.sort((a,b)=>a-b);
    const q=(p)=>deltas[Math.min(deltas.length-1,Math.floor(p*deltas.length))];
    return {px:deltas.length,mean:+(sum/deltas.length).toFixed(2),p50:+q(0.5).toFixed(1),p95:+q(0.95).toFixed(1),p99:+q(0.99).toFixed(1)};}
  const fidIdentity=fidelity(identity),fidRuntime=fidelity(runtime);

  // fidelity heatmap (runtime path, head crop ×2): delta 0→blue…red≥64
  const cw=HEAD.x1-HEAD.x0+1,chh=HEAD.y1-HEAD.y0+1;
  const hm=Buffer.alloc(cw*chh*3,255);
  for(let y=0;y<chh;y++)for(let x=0;x<cw;x++){const j=(HEAD.y0+y)*W+(HEAD.x0+x);const d3=(y*cw+x)*3;
    if(!isFig(M.rgba,j)){hm[d3]=245;hm[d3+1]=245;hm[d3+2]=245;continue;}
    const i3=j*3,i4=j*4;
    const dd=Math.min(64,(Math.abs(runtime[i3]-M.rgba[i4])+Math.abs(runtime[i3+1]-M.rgba[i4+1])+Math.abs(runtime[i3+2]-M.rgba[i4+2]))/3);
    const t=dd/64;hm[d3]=Math.round(255*t);hm[d3+1]=Math.round(80*(1-t));hm[d3+2]=Math.round(255*(1-t));}
  writeFileSync(join(OUT,"fidelity-heatmap.png"),encRGB(cw,chh,hm));

  // ── 3. visuals ──
  // master | identity | runtime, head crops
  const PAD=8,sw=3*cw+4*PAD,sh=chh+2*PAD;
  const tri=Buffer.alloc(sw*sh*3,235);
  const mFlat=Buffer.alloc(W*H*3,255);
  for(let i=0;i<W*H;i++){const a=M.rgba[i*4+3];if(a>0)over(mFlat,i*3,M.rgba[i*4],M.rgba[i*4+1],M.rgba[i*4+2],a);}
  [mFlat,identity,runtime].forEach((img,k)=>{const gx=PAD+k*(cw+PAD);
    for(let y=0;y<chh;y++)for(let x=0;x<cw;x++){const s=((HEAD.y0+y)*W+(HEAD.x0+x))*3,d=((PAD+y)*sw+(gx+x))*3;
      tri[d]=img[s];tri[d+1]=img[s+1];tri[d+2]=img[s+2];}});
  writeFileSync(join(OUT,"master-vs-stacks.png"),encRGB(sw,sh,tri));

  writeFileSync(join(OUT,"stack-default.png"),encRGB(W,H,runtime));
  writeFileSync(join(OUT,"stack-default-on-dark.png"),encRGB(W,H,stack([38,40,46],{token:brownHair},brownIris)));

  // hair tint matrix (8 tokens, runtime path, head crop, 4×2)
  {const names=Object.keys(HAIR_TOKENS),COLS=4,ROWS=2;
    const gw=COLS*cw+(COLS+1)*PAD,gh=ROWS*chh+(ROWS+1)*PAD;
    const g=Buffer.alloc(gw*gh*3,235);
    names.forEach((n,k)=>{const img=stack([255,255,255],{token:hex2rgb(HAIR_TOKENS[n])},brownIris);
      const gx=(k%COLS)*(cw+PAD)+PAD,gy=((k/COLS)|0)*(chh+PAD)+PAD;
      for(let y=0;y<chh;y++)for(let x=0;x<cw;x++){const s=((HEAD.y0+y)*W+(HEAD.x0+x))*3,d=((gy+y)*gw+(gx+x))*3;
        g[d]=img[s];g[d+1]=img[s+1];g[d+2]=img[s+2];}});
    writeFileSync(join(OUT,"hair-tint-matrix.png"),encRGB(gw,gh,g));}

  // iris tint matrix (6 preview colors, eye crop, 3×2)
  {const names=Object.keys(EYE_PREVIEW),COLS=3,ROWS=2;
    const ew=EYECROP.x1-EYECROP.x0+1,eh=EYECROP.y1-EYECROP.y0+1;
    const gw=COLS*ew+(COLS+1)*PAD,gh=ROWS*eh+(ROWS+1)*PAD;
    const g=Buffer.alloc(gw*gh*3,235);
    names.forEach((n,k)=>{const img=stack([255,255,255],{token:brownHair},hex2rgb(EYE_PREVIEW[n]));
      const gx=(k%COLS)*(ew+PAD)+PAD,gy=((k/COLS)|0)*(eh+PAD)+PAD;
      for(let y=0;y<eh;y++)for(let x=0;x<ew;x++){const s=((EYECROP.y0+y)*W+(EYECROP.x0+x))*3,d=((gy+y)*gw+(gx+x))*3;
        g[d]=img[s];g[d+1]=img[s+1];g[d+2]=img[s+2];}});
    writeFileSync(join(OUT,"iris-tint-matrix.png"),encRGB(gw,gh,g));}

  // small sizes (default runtime look)
  {function scaleTo(img,hPx){const s=H/hPx,wPx=Math.round(W/s);const o=Buffer.alloc(wPx*hPx*3);
      for(let y=0;y<hPx;y++)for(let x=0;x<wPx;x++){let r=0,g=0,b=0,n=0;
        const y0=Math.floor(y*s),y1=Math.min(H,Math.ceil((y+1)*s)),x0=Math.floor(x*s),x1=Math.min(W,Math.ceil((x+1)*s));
        for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++){const i=(yy*W+xx)*3;r+=img[i];g+=img[i+1];b+=img[i+2];n++;}
        const d=(y*wPx+x)*3;o[d]=Math.round(r/n);o[d+1]=Math.round(g/n);o[d+2]=Math.round(b/n);}
      return {wPx,hPx,o};}
    const SIZES=[64,48,32],UP=4,GAP=12;
    const scaled=SIZES.map(s=>scaleTo(runtime,s));
    const stripW=scaled.reduce((a,v)=>a+v.wPx*UP,0)+GAP*(SIZES.length+1),stripH=64*UP+2*GAP;
    const strip=Buffer.alloc(stripW*stripH*3,235);let cx=GAP;
    for(const sc of scaled){for(let y=0;y<sc.hPx*UP;y++)for(let x=0;x<sc.wPx*UP;x++){
        const s=(((y/UP)|0)*sc.wPx+((x/UP)|0))*3,d=((GAP+y)*stripW+(cx+x))*3;
        strip[d]=sc.o[s];strip[d+1]=sc.o[s+1];strip[d+2]=sc.o[s+2];}cx+=sc.wPx*UP+GAP;}
    writeFileSync(join(OUT,"stack-small-sizes.png"),encRGB(stripW,stripH,strip));}

  // ── report ──
  writeFileSync(join(OUT,"integration-report.json"),JSON.stringify({
    tool:"build-gate3-integration-composite",
    task:"G3-INTEGRATION — full-stack reassembly proof (deterministic, NON-AI)",
    layers:{base:"D-057 (tracked)",blush:"plb/face-blush-multiply-v1.png (PL-B)",face:"face-neutral-v1.png (WP3)",
      eyes:"wp2/eyes-iris-wp2-luminance.png × token + eyes-neutral-fixed.png (WP2)",
      hairIdentity:"pl1/hair-pl1-color.png (PL-1)",hairRuntime:"pl2/hair-pl2-luminance.png × token (PL-2, D-031)"},
    coverage:{headZoneMaxY:HAIR_MAX_Y,uncoveredPx:0,meaning:"full-stack extension of the PL-1 gap metric (hard guard)"},
    masterFidelity:{headZoneFigurePx:fidIdentity.px,
      identityPath:fidIdentity,runtimePath:fidRuntime,
      note:"mean/p50/p95/p99 of per-px mean-RGB delta vs the Master over head-zone figure px; the identity−runtime difference isolates the D-031 multiply approximation. Deltas include by-design differences (bald D-057 scalp edges, blush smoothstep edge, luminance round-trip)."},
    tints:{hairTokens:Object.keys(HAIR_TOKENS),irisPreview:Object.keys(EYE_PREVIEW),
      note:"iris preview set stays a proposal (WP2 worksheet §4) — no runtime EYE_COLOR set exists"},
    outputs:["master-vs-stacks.png","fidelity-heatmap.png","stack-default.png","stack-default-on-dark.png",
      "hair-tint-matrix.png","iris-tint-matrix.png","stack-small-sizes.png"],
    boundaries:"review-only; NOT runtime assets; no promote; no assets/avatar-r2; no R2_MANIFEST; AVATAR_R2 false; no AI; Master/D-057/protect/chain outputs unchanged",
  },null,2));

  console.log("✔ Gate-3 integration composite:");
  console.log("  full-stack head-zone coverage gap: 0px (hard guard ✓)");
  console.log("  Master fidelity (head-zone figure px "+fidIdentity.px+"):");
  console.log("    identity path: mean "+fidIdentity.mean+" · p50 "+fidIdentity.p50+" · p95 "+fidIdentity.p95+" · p99 "+fidIdentity.p99);
  console.log("    runtime  path: mean "+fidRuntime.mean+" · p50 "+fidRuntime.p50+" · p95 "+fidRuntime.p95+" · p99 "+fidRuntime.p99);
  console.log("  → integration/master-vs-stacks.png · fidelity-heatmap.png · stack-default(-on-dark).png · hair/iris-tint-matrix.png · stack-small-sizes.png");
}
main();
