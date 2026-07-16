// 167A Phase-2 Gate 3 — WP1 RE-REVIEW of the punch-listed hair layer (deterministic, NON-AI).
// ---------------------------------------------------------------------------
// The WP1 worksheet §5 (countersigned 2026-07-15) made the hair layer conditional:
// "the hair layer is NOT final until both [PL-1 + PL-2] are cleared and re-reviewed".
// PL-1 cleared 2026-07-16 (gap 1,449 → 0) and PL-2 cleared 2026-07-16 (p50 126 → 200).
// This tool is the RE-REVIEW package: it re-runs every WP1 audit against the
// punch-listed pair and maps each result to the original WP1 finding it answers.
//
//   Candidate pair under review:
//     pl1/hair-pl1-color.png      (silhouette / colour reference, PL-1)
//     pl2/hair-pl2-luminance.png  (D-031 runtime map candidate, PL-2)
//
//   WP1 finding →  re-review audit:
//     1. silhouette/registration  → onion-skin outlines over Master and D-057
//     2. halo (130 px, minor)     → near-white count on the PL-1 colour layer (must not exceed 130)
//     3. hairline coverage gap    → WP1 gap predicate re-run (must be 0)
//     4. tint fidelity (R-7)      → PL-2 map stats + 8-token tint sheet + 32/48/64 px grid
//   plus: eye-box contamination (must be 0) and colour-vs-map ALPHA IDENTITY
//   (the runtime map's silhouette must equal the colour layer's silhouette).
//
// Inputs (all read-only): Master (D-032), D-057 base, the PL-1/PL-2 chain outputs.
// Chain inputs are REQUIRED; fail loud with the re-run instructions if missing.
// Outputs (gitignored, review-only) → build/phase2/gate3-d057/rereview/:
//   composite-color.png / -on-dark.png       (D-057 + PL-1 colour hair)
//   composite-tint-brown.png / -on-dark.png  (D-057 + PL-2 map × brown — the runtime view)
//   coverage-gap-check.png                   (gap px magenta — must show none)
//   onion-master.png / onion-d057.png        (hair alpha outline over Master / D-057)
//   tint-sheet-head.png                      (8 tokens, PL-2 map)
//   tint-tokens-small.png                    (8 tokens × 64/48/32 px, ×4 upscale)
//   wp1-rereview-report.json
//
// NO promote, NO assets/avatar-r2 write, NO R2_MANIFEST change, AVATAR_R2 untouched,
// NO runtime code, NO change to Master / D-057 / protect / WP0 / PL-1 / PL-2 outputs.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CHAIN = join(HERE, "build", "phase2", "gate3-d057");
const OUT = join(CHAIN, "rereview");
const MASTER = join(REPO, "assets", "avatar", "reference", "Northstar Master.png");
const D057 = join(REPO, "assets", "avatar", "reference", "neutral-base-v1-gate2-d053.png");
const PL1COLOR = join(CHAIN, "pl1", "hair-pl1-color.png");
const PL2LUM = join(CHAIN, "pl2", "hair-pl2-luminance.png");
const W = 1024, H = 1536;

// WP0/WP1 constants — MUST match the earlier chain tools exactly.
const HAIR_MAX_Y = 505;
const EYE_BOXES = [ { x0: 378, y0: 330, x1: 476, y1: 440 }, { x0: 531, y0: 330, x1: 629, y1: 440 } ];
const NEAR_WHITE = 244;
const WP1_HALO_PX = 130;          // finding 2 baseline — must not grow
const HEAD = { x0: 270, y0: 40, x1: 758, y1: 520 };
const P50_CORRIDOR = [190, 215];  // PL-2 acceptance corridor

// Mirrored from js/avatar-layers.js HAIR_COLOR_TOKENS (Section 155E, locked R1-R5).
const HAIR_TOKENS = {
  black:        "#2B2622", dark_brown: "#3F2A1B", brown: "#5A3D28", light_brown: "#8A5E3B",
  blonde:       "#C99A5B", red: "#A8442A", auburn: "#803A24", fantasy_blue: "#4A78C8",
};

for (const [p, hint] of [[PL1COLOR, "pl1/hair-pl1-color.png"], [PL2LUM, "pl2/hair-pl2-luminance.png"]]) {
  if (!existsSync(p)) {
    console.error("MISSING chain input: " + hint + "\nRun the chain first: build-hair-clean.mjs -> build-hair-pl1-gapfix.mjs -> build-hair-pl2-remap.mjs.");
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
  const Hc=decodePng(readFileSync(PL1COLOR));
  const Hl=decodePng(readFileSync(PL2LUM));

  // ── ALPHA IDENTITY: runtime map silhouette must equal colour-layer silhouette ──
  let alphaMismatch=0;
  for(let i=0;i<W*H;i++)if(Hc.rgba[i*4+3]!==Hl.rgba[i*4+3])alphaMismatch++;

  // ── FINDING 3: WP1 coverage-gap predicate re-run (must be 0) ──
  let gapPx=0;
  for(let y=0;y<HAIR_MAX_Y;y++)for(let x=0;x<W;x++){const i=y*W+x;
    if(!isFig(M.rgba,i))continue;
    if(B.rgba[i*4+3]>16)continue;
    if(Hc.rgba[i*4+3]>0)continue;
    gapPx++;}

  // ── FINDING 2: near-white halo on the colour layer (must not exceed WP1's 130) ──
  let haloPx=0,hairPx=0;
  for(let i=0;i<W*H;i++){if(Hc.rgba[i*4+3]===0)continue;hairPx++;
    if(Hc.rgba[i*4]>=NEAR_WHITE&&Hc.rgba[i*4+1]>=NEAR_WHITE&&Hc.rgba[i*4+2]>=NEAR_WHITE)haloPx++;}

  // ── eye-box contamination on both layers (must be 0) ──
  let eyeContam=0;
  for(const Bx of EYE_BOXES)for(let y=Bx.y0;y<=Bx.y1;y++)for(let x=Bx.x0;x<=Bx.x1;x++){
    const i=(y*W+x)*4;if(Hc.rgba[i+3]>0||Hl.rgba[i+3]>0)eyeContam++;}

  // ── FINDING 4: PL-2 map stats (p50 in corridor, band respected) ──
  const hist=new Uint32Array(256);let lumPx=0;
  for(let i=0;i<W*H;i++){if(Hl.rgba[i*4+3]===0)continue;hist[Hl.rgba[i*4]]++;lumPx++;}
  const pct=(q)=>{let acc=0,t=q*lumPx;for(let v=0;v<256;v++){acc+=hist[v];if(acc>=t)return v;}return 255;};
  let lmin=0,lmax=255;while(hist[lmin]===0&&lmin<255)lmin++;while(hist[lmax]===0&&lmax>0)lmax--;
  const p50=pct(0.50);
  const p50ok=p50>=P50_CORRIDOR[0]&&p50<=P50_CORRIDOR[1];

  const pass = alphaMismatch===0 && gapPx===0 && haloPx<=WP1_HALO_PX && eyeContam===0 && p50ok;

  // ── composites ──
  function baseCanvas(bg){const c=Buffer.alloc(W*H*3);for(let i=0;i<W*H;i++){c[i*3]=bg[0];c[i*3+1]=bg[1];c[i*3+2]=bg[2];}
    for(let i=0;i<W*H;i++){const a=B.rgba[i*4+3];if(a>0)over(c,i*3,B.rgba[i*4],B.rgba[i*4+1],B.rgba[i*4+2],a);}
    return c;}
  function withColorHair(bg){const c=baseCanvas(bg);
    for(let i=0;i<W*H;i++){const a=Hc.rgba[i*4+3];if(a>0)over(c,i*3,Hc.rgba[i*4],Hc.rgba[i*4+1],Hc.rgba[i*4+2],a);}
    return c;}
  function withTint(bg,tokenRGB){const c=baseCanvas(bg);
    for(let i=0;i<W*H;i++){const a=Hl.rgba[i*4+3];if(a===0)continue;const L=Hl.rgba[i*4]/255;
      over(c,i*3,Math.round(L*tokenRGB[0]),Math.round(L*tokenRGB[1]),Math.round(L*tokenRGB[2]),a);}
    return c;}
  writeFileSync(join(OUT,"composite-color.png"),encRGB(W,H,withColorHair([255,255,255])));
  writeFileSync(join(OUT,"composite-color-on-dark.png"),encRGB(W,H,withColorHair([38,40,46])));
  const brown=hex2rgb(HAIR_TOKENS.brown);
  writeFileSync(join(OUT,"composite-tint-brown.png"),encRGB(W,H,withTint([255,255,255],brown)));
  writeFileSync(join(OUT,"composite-tint-brown-on-dark.png"),encRGB(W,H,withTint([38,40,46],brown)));

  // coverage-gap visual (must show no magenta)
  const gapImg=withColorHair([255,255,255]);
  for(let y=0;y<HAIR_MAX_Y;y++)for(let x=0;x<W;x++){const i=y*W+x;
    if(!isFig(M.rgba,i))continue;if(B.rgba[i*4+3]>16)continue;if(Hc.rgba[i*4+3]>0)continue;
    gapImg[i*3]=255;gapImg[i*3+1]=0;gapImg[i*3+2]=255;}
  writeFileSync(join(OUT,"coverage-gap-check.png"),encRGB(W,H,gapImg));

  // ── FINDING 1: onion-skin outlines over Master and D-057 ──
  const ol=new Uint8Array(W*H);
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;if(Hc.rgba[i*4+3]===0)continue;
    if(Hc.rgba[(i-1)*4+3]===0||Hc.rgba[(i+1)*4+3]===0||Hc.rgba[(i-W)*4+3]===0||Hc.rgba[(i+W)*4+3]===0)ol[i]=1;}
  function onion(src){const c=Buffer.alloc(W*H*3,255);
    for(let i=0;i<W*H;i++){const a=src.rgba[i*4+3];if(a>0)over(c,i*3,src.rgba[i*4],src.rgba[i*4+1],src.rgba[i*4+2],a);}
    for(let i=0;i<W*H;i++)if(ol[i]){c[i*3]=0;c[i*3+1]=200;c[i*3+2]=0;}
    return c;}
  writeFileSync(join(OUT,"onion-master.png"),encRGB(W,H,onion(M)));
  writeFileSync(join(OUT,"onion-d057.png"),encRGB(W,H,onion(B)));

  // ── FINDING 4 evidence: 8-token tint sheet + small-size grid (PL-2 map) ──
  const names=Object.keys(HAIR_TOKENS);
  const cw=HEAD.x1-HEAD.x0+1,chh=HEAD.y1-HEAD.y0+1,COLS=4,ROWS=2,PAD=8;
  const sw=COLS*cw+(COLS+1)*PAD,sh=ROWS*chh+(ROWS+1)*PAD;
  const sheet=Buffer.alloc(sw*sh*3,235);
  names.forEach((n,k)=>{const t=withTint([255,255,255],hex2rgb(HAIR_TOKENS[n]));
    const gx=(k%COLS)*(cw+PAD)+PAD,gy=((k/COLS)|0)*(chh+PAD)+PAD;
    for(let y=0;y<chh;y++)for(let x=0;x<cw;x++){const s=((HEAD.y0+y)*W+(HEAD.x0+x))*3,d=((gy+y)*sw+(gx+x))*3;
      sheet[d]=t[s];sheet[d+1]=t[s+1];sheet[d+2]=t[s+2];}});
  writeFileSync(join(OUT,"tint-sheet-head.png"),encRGB(sw,sh,sheet));

  function scaleTo(img,hPx){const s=H/hPx,wPx=Math.round(W/s);const o=Buffer.alloc(wPx*hPx*3);
    for(let y=0;y<hPx;y++)for(let x=0;x<wPx;x++){let r=0,g=0,b=0,n=0;
      const y0=Math.floor(y*s),y1=Math.min(H,Math.ceil((y+1)*s)),x0=Math.floor(x*s),x1=Math.min(W,Math.ceil((x+1)*s));
      for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++){const i=(yy*W+xx)*3;r+=img[i];g+=img[i+1];b+=img[i+2];n++;}
      const d=(y*wPx+x)*3;o[d]=Math.round(r/n);o[d+1]=Math.round(g/n);o[d+2]=Math.round(b/n);}
    return {wPx,hPx,o};}
  const SIZES=[64,48,32],UP=4,GAP=12;
  const colW=Math.round(W/(H/64))*UP;
  const gridW=GAP+names.length*(colW+GAP);
  const gridH=GAP+SIZES.reduce((a,v)=>a+v*UP+GAP,0);
  const grid=Buffer.alloc(gridW*gridH*3,235);
  names.forEach((n,k)=>{const t=withTint([255,255,255],hex2rgb(HAIR_TOKENS[n]));let gy=GAP;
    SIZES.forEach((sz)=>{const sc=scaleTo(t,sz);const gx=GAP+k*(colW+GAP)+((colW-sc.wPx*UP)>>1);
      for(let y=0;y<sc.hPx*UP;y++)for(let x=0;x<sc.wPx*UP;x++){
        const s=(((y/UP)|0)*sc.wPx+((x/UP)|0))*3,d=((gy+y)*gridW+(gx+x))*3;
        grid[d]=sc.o[s];grid[d+1]=sc.o[s+1];grid[d+2]=sc.o[s+2];}
      gy+=sz*UP+GAP;});});
  writeFileSync(join(OUT,"tint-tokens-small.png"),encRGB(gridW,gridH,grid));

  // ── report ──
  writeFileSync(join(OUT,"wp1-rereview-report.json"),JSON.stringify({
    tool:"build-hair-wp1-rereview",
    task:"G3 WP1 RE-REVIEW of the punch-listed hair layer (deterministic, NON-AI)",
    pair:{color:"pl1/hair-pl1-color.png",luminance:"pl2/hair-pl2-luminance.png"},
    findings:{
      f1_silhouette:{evidence:"onion-master.png / onion-d057.png",note:"hair cut FROM Master; outline must hug the Master hair mass"},
      f2_halo:{wp1Baseline:WP1_HALO_PX,nowPx:haloPx,pctOfHair:+(100*haloPx/hairPx).toFixed(3),ok:haloPx<=WP1_HALO_PX},
      f3_coverageGap:{wp1Px:1449,nowPx:gapPx,ok:gapPx===0},
      f4_tint:{mapStats:{nonZeroPx:lumPx,min:lmin,max:lmax,p1:pct(0.01),p50,p99:pct(0.99)},
        p50Corridor:P50_CORRIDOR,ok:p50ok,evidence:"tint-sheet-head.png / tint-tokens-small.png"},
    },
    extraGuards:{alphaIdentityMismatchPx:alphaMismatch,eyeBoxContaminationPx:eyeContam,hairPx},
    verdict:pass?"PASS — all four WP1 findings answered; alpha identity holds; contamination 0":"FAIL — see findings/guards",
    outputs:["composite-color.png","composite-color-on-dark.png","composite-tint-brown.png","composite-tint-brown-on-dark.png",
      "coverage-gap-check.png","onion-master.png","onion-d057.png","tint-sheet-head.png","tint-tokens-small.png"],
    boundaries:"review-only; NOT runtime assets; no promote; no assets/avatar-r2; no R2_MANIFEST; AVATAR_R2 false; Master/D-057/protect/WP0/PL-1/PL-2 outputs unchanged",
  },null,2));

  console.log("✔ WP1 re-review of the punch-listed hair layer:");
  console.log("  alpha identity (colour vs runtime map): mismatch "+alphaMismatch+"px "+(alphaMismatch===0?"✓":"✗"));
  console.log("  f3 coverage gap: "+gapPx+"px (WP1: 1449) "+(gapPx===0?"✓":"✗"));
  console.log("  f2 halo: "+haloPx+"px of "+hairPx+" (WP1 baseline "+WP1_HALO_PX+") "+(haloPx<=WP1_HALO_PX?"✓":"✗"));
  console.log("  eye-box contamination: "+eyeContam+"px "+(eyeContam===0?"✓":"✗"));
  console.log("  f4 map: min "+lmin+" p50 "+p50+" p99 "+pct(0.99)+" max "+lmax+" · corridor ["+P50_CORRIDOR+"] "+(p50ok?"✓":"✗"));
  console.log("  VERDICT: "+(pass?"PASS ✓":"FAIL ✗"));
  console.log("  → rereview/composite-color(-on-dark) · composite-tint-brown(-on-dark) · coverage-gap-check · onion-* · tint-sheet-head · tint-tokens-small");
  if(!pass)process.exit(1);
}
main();
