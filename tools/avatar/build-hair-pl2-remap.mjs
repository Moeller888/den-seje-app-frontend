// 167A Phase-2 Gate 3 — PL-2 luminance remap (deterministic, NON-AI).
// ---------------------------------------------------------------------------
// Punch-list item PL-2 (docs/167a-phase2-gate3-wp1-hair-review.md §5, ordered 2026-07-15):
// re-normalise the hair luminance map to a brighter band so the D-031 multiply tints are
// colour-faithful. WP1 finding 4: with the first-pass band (p50 = 126) every token renders
// ~50 % darker than its colour — `blonde` reads as olive/light-brown. Owner-chosen fix
// candidate: brighter remap with p50 → ~200.
//
// INPUT MAP = pl1/hair-pl1-luminance.png (per the PL-1 countersign, 2026-07-16), so the
// remap includes the backfilled hairline px. This is a REMAP OF THE EXISTING MAP —
// no re-extraction, no silhouette change, no AI.
//
// Method: one fixed monotonic LUT applied to the gray value of every hair px:
//   t  = clamp((g − 90) / 160, 0..1)        (the first-pass band [90,250])
//   t' = t ^ GAMMA                          (brightening curve, GAMMA < 1)
//   g' = round(OUT_LO + t' · (OUT_HI − OUT_LO))
// Alpha is copied verbatim; RGB stays gray (r=g=b); px with alpha 0 stay untouched.
// The LUT is strictly monotonic non-decreasing, so strand shading ORDER is preserved —
// only the band is brightened/stretched.
//
// Guards (hard-fail, nothing written on breach):
//   - chain input pl1/hair-pl1-luminance.png REQUIRED (fail loud with instructions),
//   - alpha channel byte-identical to the input map (silhouette unchanged),
//   - zero changed px outside the hair alpha,
//   - LUT monotonicity asserted,
//   - output p50 within [190, 215] (the "p50 → ~200" acceptance corridor).
//
// Outputs (gitignored, review-only, NOT runtime assets) → build/phase2/gate3-d057/pl2/:
//   hair-pl2-luminance.png       (the remapped D-031 luminance map candidate)
//   tint-sheet-head.png          (8 tokens on D-057, PL-2 map — the acceptance sheet)
//   tint-sheet-head-before.png   (same sheet with the PL-1 first-pass map, for comparison)
//   blonde-before-after.png      (head crop: blonde with PL-1 map vs PL-2 map)
//   tint-tokens-small.png        (8 tokens × 32/48/64 px full avatar, ×4 upscale — distinctness check)
//   pl2-remap-report.json
//
// NO promote, NO assets/avatar-r2 write, NO R2_MANIFEST change, AVATAR_R2 untouched,
// NO runtime code, NO change to Master / D-057 / protect / WP0 / PL-1 outputs
// (the PL-2 map is written as a NEW file; the PL-1 files are read, never rewritten).
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CHAIN = join(HERE, "build", "phase2", "gate3-d057");
const PL1 = join(CHAIN, "pl1");
const OUT = join(CHAIN, "pl2");
const D057 = join(REPO, "assets", "avatar", "reference", "neutral-base-v1-gate2-d053.png");
const PL1LUM = join(PL1, "hair-pl1-luminance.png");
const W = 1024, H = 1536;

// ── PL-2 remap constants (the deterministic curve; see header) ──────────────
const BAND_LO = 90, BAND_HI = 250;   // first-pass input band (WP0 step 3b)
const OUT_LO = 130, OUT_HI = 252;    // output band: keeps shadow depth, highlights near-full
const GAMMA = 0.37;                  // chosen so the input p50 (~126) lands at ~200

// Mirrored from js/avatar-layers.js HAIR_COLOR_TOKENS (Section 155E, locked R1-R5).
// Read-only preview copy — the runtime file stays the single source of truth.
const HAIR_TOKENS = {
  black:        "#2B2622", dark_brown: "#3F2A1B", brown: "#5A3D28", light_brown: "#8A5E3B",
  blonde:       "#C99A5B", red: "#A8442A", auburn: "#803A24", fantasy_blue: "#4A78C8",
};
const HEAD = { x0: 270, y0: 40, x1: 758, y1: 520 };   // same crop as WP1's tint sheet

if (!existsSync(PL1LUM)) {
  console.error("MISSING chain input: pl1/hair-pl1-luminance.png\n" +
    "Run `node tools/avatar/build-hair-clean.mjs` then `node tools/avatar/build-hair-pl1-gapfix.mjs` first (WP0 → PL-1 chain).");
  process.exit(1);
}

function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
function decodePng(buf){let off=8,ihdr=null;const idat=[];while(off<buf.length){const len=buf.readUInt32BE(off);const type=buf.toString("ascii",off+4,off+8);const data=buf.subarray(off+8,off+8+len);if(type==="IHDR")ihdr={w:data.readUInt32BE(0),h:data.readUInt32BE(4),bit:data[8],ct:data[9],il:data[12]};else if(type==="IDAT")idat.push(data);else if(type==="IEND")break;off+=12+len;}const ch=ihdr.ct===6?4:3,{w,h}=ihdr,stride=w*ch;const raw=inflateSync(Buffer.concat(idat));const px=Buffer.alloc(h*stride);let prev=Buffer.alloc(stride),p=0;for(let y=0;y<h;y++){const f=raw[p++];const cur=raw.subarray(p,p+stride);p+=stride;const out=px.subarray(y*stride,y*stride+stride);for(let x=0;x<stride;x++){const a=x>=ch?out[x-ch]:0,b=prev[x],c=x>=ch?prev[x-ch]:0;let v=cur[x];if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4)v+=paeth(a,b,c);out[x]=v&0xff;}prev=out;}const rgba=Buffer.alloc(w*h*4);for(let i=0;i<w*h;i++){rgba[i*4]=px[i*ch];rgba[i*4+1]=px[i*ch+1];rgba[i*4+2]=px[i*ch+2];rgba[i*4+3]=ch===4?px[i*ch+3]:255;}return {w,h,rgba};}
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(b){let c=0xffffffff;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&0xff]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const T=Buffer.from(t,"ascii");const cc=Buffer.alloc(4);cc.writeUInt32BE(crc32(Buffer.concat([T,d])),0);return Buffer.concat([l,T,d,cc]);}
function encRGBA(w,h,rgba){const st=w*4,raw=Buffer.alloc(h*(st+1));for(let y=0;y<h;y++){raw[y*(st+1)]=0;rgba.copy(raw,y*(st+1)+1,y*st,y*st+st);}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);}
function encRGB(w,h,rgb){const st=w*3,raw=Buffer.alloc(h*(st+1));for(let y=0;y<h;y++){raw[y*(st+1)]=0;rgb.copy(raw,y*(st+1)+1,y*st,y*st+st);}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);}

const hex2rgb=(hx)=>[parseInt(hx.slice(1,3),16),parseInt(hx.slice(3,5),16),parseInt(hx.slice(5,7),16)];
const over=(out,i3,r,g,b,a)=>{const A=a/255;out[i3]=Math.round(r*A+out[i3]*(1-A));out[i3+1]=Math.round(g*A+out[i3+1]*(1-A));out[i3+2]=Math.round(b*A+out[i3+2]*(1-A));};

function stats(rgba){const hist=new Uint32Array(256);let n=0;
  for(let i=0;i<W*H;i++){if(rgba[i*4+3]===0)continue;hist[rgba[i*4]]++;n++;}
  const pct=(q)=>{let acc=0,t=q*n;for(let v=0;v<256;v++){acc+=hist[v];if(acc>=t)return v;}return 255;};
  let lo=0,hi=255;while(hist[lo]===0&&lo<255)lo++;while(hist[hi]===0&&hi>0)hi--;
  return {nonZeroPx:n,min:lo,max:hi,p1:pct(0.01),p50:pct(0.50),p99:pct(0.99)};}

function main(){
  mkdirSync(OUT,{recursive:true});
  const B=decodePng(readFileSync(D057));
  const Hl=decodePng(readFileSync(PL1LUM));

  // ── 1. the LUT (fixed, monotonic) ──────────────────────────────────────────
  const lut=new Uint8Array(256);
  for(let g=0;g<256;g++){
    const t=Math.min(1,Math.max(0,(g-BAND_LO)/(BAND_HI-BAND_LO)));
    lut[g]=Math.round(OUT_LO+Math.pow(t,GAMMA)*(OUT_HI-OUT_LO));
  }
  for(let g=1;g<256;g++)if(lut[g]<lut[g-1]){
    console.error("LUT MONOTONICITY FAIL at g="+g+" — refusing to write anything.");process.exit(1);}

  // ── 2. apply: gray → lut(gray) where alpha>0; alpha copied verbatim ───────
  const out=Buffer.from(Hl.rgba);
  for(let i=0;i<W*H;i++){if(out[i*4+3]===0)continue;
    const g=lut[out[i*4]];out[i*4]=g;out[i*4+1]=g;out[i*4+2]=g;}

  // ── 3. guards ──────────────────────────────────────────────────────────────
  let alphaDiff=0,changedOutsideAlpha=0;
  for(let i=0;i<W*H;i++){
    if(out[i*4+3]!==Hl.rgba[i*4+3])alphaDiff++;
    if(Hl.rgba[i*4+3]===0&&(out[i*4]!==Hl.rgba[i*4]||out[i*4+1]!==Hl.rgba[i*4+1]||out[i*4+2]!==Hl.rgba[i*4+2]))changedOutsideAlpha++;}
  const sIn=stats(Hl.rgba),sOut=stats(out);
  const p50ok=sOut.p50>=190&&sOut.p50<=215;
  if(alphaDiff>0||changedOutsideAlpha>0||!p50ok){
    console.error("GUARD FAIL: alphaDiff "+alphaDiff+" · changedOutsideAlpha "+changedOutsideAlpha+
      " · output p50 "+sOut.p50+" (required 190–215). Nothing written.");
    process.exit(1);}
  writeFileSync(join(OUT,"hair-pl2-luminance.png"),encRGBA(W,H,out));

  // ── 4. tint previews (D-031 multiply on D-057) — acceptance evidence ──────
  function baseCanvas(){const c=Buffer.alloc(W*H*3,255);
    for(let i=0;i<W*H;i++){const a=B.rgba[i*4+3];if(a>0)over(c,i*3,B.rgba[i*4],B.rgba[i*4+1],B.rgba[i*4+2],a);}
    return c;}
  function tinted(map,baseRGB){const c=baseCanvas();
    for(let i=0;i<W*H;i++){const a=map[i*4+3];if(a===0)continue;const L=map[i*4]/255;
      over(c,i*3,Math.round(L*baseRGB[0]),Math.round(L*baseRGB[1]),Math.round(L*baseRGB[2]),a);}
    return c;}
  const names=Object.keys(HAIR_TOKENS);
  const cw=HEAD.x1-HEAD.x0+1,chh=HEAD.y1-HEAD.y0+1,COLS=4,ROWS=2,PAD=8;
  function sheet(map){const sw=COLS*cw+(COLS+1)*PAD,sh=ROWS*chh+(ROWS+1)*PAD;
    const s=Buffer.alloc(sw*sh*3,235);
    names.forEach((n,k)=>{const t=tinted(map,hex2rgb(HAIR_TOKENS[n]));
      const gx=(k%COLS)*(cw+PAD)+PAD,gy=((k/COLS)|0)*(chh+PAD)+PAD;
      for(let y=0;y<chh;y++)for(let x=0;x<cw;x++){const src=((HEAD.y0+y)*W+(HEAD.x0+x))*3,d=((gy+y)*sw+(gx+x))*3;
        s[d]=t[src];s[d+1]=t[src+1];s[d+2]=t[src+2];}});
    return {sw,sh,s};}
  const after=sheet(out),before=sheet(Hl.rgba);
  writeFileSync(join(OUT,"tint-sheet-head.png"),encRGB(after.sw,after.sh,after.s));
  writeFileSync(join(OUT,"tint-sheet-head-before.png"),encRGB(before.sw,before.sh,before.s));

  // blonde before/after head crop, side by side
  const blond=hex2rgb(HAIR_TOKENS.blonde);
  const bBefore=tinted(Hl.rgba,blond),bAfter=tinted(out,blond);
  const bw=2*cw+3*PAD,bh=chh+2*PAD,bb=Buffer.alloc(bw*bh*3,235);
  [bBefore,bAfter].forEach((img,k)=>{const gx=PAD+k*(cw+PAD);
    for(let y=0;y<chh;y++)for(let x=0;x<cw;x++){const s=((HEAD.y0+y)*W+(HEAD.x0+x))*3,d=((PAD+y)*bw+(gx+x))*3;
      bb[d]=img[s];bb[d+1]=img[s+1];bb[d+2]=img[s+2];}});
  writeFileSync(join(OUT,"blonde-before-after.png"),encRGB(bw,bh,bb));

  // 8 tokens × 32/48/64 px full-avatar distinctness grid (×4 upscale for viewing)
  function scaleTo(img,hPx){const s=H/hPx,wPx=Math.round(W/s);const o=Buffer.alloc(wPx*hPx*3);
    for(let y=0;y<hPx;y++)for(let x=0;x<wPx;x++){let r=0,g=0,b=0,n=0;
      const y0=Math.floor(y*s),y1=Math.min(H,Math.ceil((y+1)*s)),x0=Math.floor(x*s),x1=Math.min(W,Math.ceil((x+1)*s));
      for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++){const i=(yy*W+xx)*3;r+=img[i];g+=img[i+1];b+=img[i+2];n++;}
      const d=(y*wPx+x)*3;o[d]=Math.round(r/n);o[d+1]=Math.round(g/n);o[d+2]=Math.round(b/n);}
    return {wPx,hPx,o};}
  const SIZES=[64,48,32],UP=4,GAP=12;
  const colW=Math.round(W/(H/64))*UP;
  const gridW=GAP+names.length*(colW+GAP);
  const rowH=SIZES.map(s=>s*UP);
  const gridH=GAP+rowH.reduce((a,v)=>a+v+GAP,0);
  const grid=Buffer.alloc(gridW*gridH*3,235);
  names.forEach((n,k)=>{const t=tinted(out,hex2rgb(HAIR_TOKENS[n]));let gy=GAP;
    SIZES.forEach((sz)=>{const sc=scaleTo(t,sz);const gx=GAP+k*(colW+GAP)+((colW-sc.wPx*UP)>>1);
      for(let y=0;y<sc.hPx*UP;y++)for(let x=0;x<sc.wPx*UP;x++){
        const s=(((y/UP)|0)*sc.wPx+((x/UP)|0))*3,d=((gy+y)*gridW+(gx+x))*3;
        grid[d]=sc.o[s];grid[d+1]=sc.o[s+1];grid[d+2]=sc.o[s+2];}
      gy+=sz*UP+GAP;});});
  writeFileSync(join(OUT,"tint-tokens-small.png"),encRGB(gridW,gridH,grid));

  // ── 5. report ──────────────────────────────────────────────────────────────
  const bl=hex2rgb(HAIR_TOKENS.blonde);
  const f=(p)=>[Math.round(p/255*bl[0]),Math.round(p/255*bl[1]),Math.round(p/255*bl[2])];
  writeFileSync(join(OUT,"pl2-remap-report.json"),JSON.stringify({
    tool:"build-hair-pl2-remap",
    task:"G3 punch-list PL-2 — luminance remap to a brighter band (deterministic LUT, NON-AI)",
    inputMap:"pl1/hair-pl1-luminance.png (per the PL-1 countersign — includes the backfilled hairline px)",
    curve:{model:"g' = OUT_LO + ((clamp(g-BAND_LO)/(BAND_HI-BAND_LO)))^GAMMA * (OUT_HI-OUT_LO)",
      BAND_LO,BAND_HI,OUT_LO,OUT_HI,GAMMA,monotonic:true},
    statsBefore:sIn,statsAfter:sOut,
    acceptanceCorridor:{p50:"190–215 (owner fix candidate: p50 → ~200)",p50After:sOut.p50,ok:p50ok},
    blondePreviewAtP50:{before:f(sIn.p50),after:f(sOut.p50),token:bl,
      note:"D-031 multiply: rendered = (map/255) × token; the sheet is the real acceptance evidence"},
    guards:{alphaDiff,changedOutsideAlpha,lutMonotonic:true},
    outputs:["hair-pl2-luminance.png","tint-sheet-head.png","tint-sheet-head-before.png",
      "blonde-before-after.png","tint-tokens-small.png"],
    boundaries:"review-only; NOT runtime assets; no promote; no assets/avatar-r2; no R2_MANIFEST; AVATAR_R2 false; Master/D-057/protect/WP0/PL-1 outputs unchanged (PL-2 map is a NEW file)",
  },null,2));

  console.log("✔ PL-2 luminance remap:");
  console.log("  curve: band ["+BAND_LO+","+BAND_HI+"] → ["+OUT_LO+","+OUT_HI+"] · gamma "+GAMMA+" (monotonic LUT)");
  console.log("  stats before: min "+sIn.min+" p1 "+sIn.p1+" p50 "+sIn.p50+" p99 "+sIn.p99+" max "+sIn.max);
  console.log("  stats after : min "+sOut.min+" p1 "+sOut.p1+" p50 "+sOut.p50+" p99 "+sOut.p99+" max "+sOut.max+" · p50 corridor 190–215 "+(p50ok?"✓":"✗"));
  console.log("  guards: alphaDiff "+alphaDiff+" · changedOutsideAlpha "+changedOutsideAlpha+" (both must be 0)");
  console.log("  → pl2/hair-pl2-luminance.png · tint-sheet-head(.png/-before) · blonde-before-after.png · tint-tokens-small.png");
}
main();
