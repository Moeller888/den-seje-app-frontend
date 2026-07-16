// 167A Phase-2 Gate 3 — FACE-EXPRESSION VALIDATOR (deterministic acceptance harness, NON-AI).
// ---------------------------------------------------------------------------
// Companion to WP3 (build-face-wp3-neutral.mjs). The four face-expression
// variants (curious, focused, determined, proud [+happy, surprised]) are
// produced by the ART PRODUCER via D-042 AI-assisted MASKED editing on the
// Master (docs/167a-phase2-artist-handoff.md). This tool is their OBJECTIVE
// GATE: it runs the same deterministic §4.2 audits against a delivered file,
// so acceptance is measured, not eyeballed.
//
// Usage:
//   node tools/avatar/validate-face-expression.mjs <path-to-face-expression.png> [expression-name]
//
// Checks (fail → exit 1, report says why):
//   1. dimensions exactly 1024×1536, RGBA
//   2. tone-agnostic: 0 skin-coloured px (the base owns skin, D-022)
//   3. eye safety: 0 px inside the WP0 eye boxes AND 0 alpha overlap with the
//      current eyes layers (fixed + WP2 iris map)
//   4. registration: every px inside the §4.2 feature regions grown by a ±12 px
//      expression margin (brows may raise, mouth may open — but features must
//      stay ON the Master face position)
//   5. non-empty: ≥ 500 px (an empty/near-empty layer is a broken delivery)
// Evidence written → build/phase2/gate3-d057/wp3/validate-<name>/:
//   composite-preview.png / -on-dark.png (full stack with the candidate face)
//   small-sizes.png (64/48/32 px, ×4)
//   validate-report.json
//
// Review-only; NOT a runtime gate; no promote; no assets/avatar-r2; no
// R2_MANIFEST; AVATAR_R2 untouched; inputs read-only; NO AI.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CHAIN = join(HERE, "build", "phase2", "gate3-d057");
const D057 = join(REPO, "assets", "avatar", "reference", "neutral-base-v1-gate2-d053.png");
const FIXED0 = join(CHAIN, "eyes-neutral-fixed.png");
const IRIS2 = join(CHAIN, "wp2", "eyes-iris-wp2-luminance.png");
const HAIR1 = join(CHAIN, "pl1", "hair-pl1-color.png");
const W = 1024, H = 1536;

// §4.2 regions (build-face-clean.mjs) grown by the expression margin
const MARGIN = 12;
const REGIONS = [
  { x0: 396 - MARGIN, y0: 306 - MARGIN, x1: 632 + MARGIN, y1: 340 + MARGIN },   // brows
  { x0: 494 - MARGIN, y0: 438 - MARGIN, x1: 532 + MARGIN, y1: 461 + MARGIN },   // nose
  { x0: 474 - MARGIN, y0: 461 - MARGIN, x1: 552 + MARGIN, y1: 481 + MARGIN },   // mouth
];
const EYE_BOXES = [ { x0: 374, y0: 332, x1: 480, y1: 440 }, { x0: 527, y0: 332, x1: 633, y1: 440 } ];
const MIN_PX = 500;
const EYE_BROWN = [0x6B, 0x42, 0x26];

const target = process.argv[2];
const exprName = process.argv[3] || basename(target || "candidate", ".png");
if (!target || !existsSync(target)) {
  console.error("Usage: node tools/avatar/validate-face-expression.mjs <face-expression.png> [name]\nFile not found: " + target);
  process.exit(1);
}
for (const [p, hint, cmd] of [
  [FIXED0, "eyes-neutral-fixed.png", "build-eyes-clean.mjs"],
  [IRIS2, "wp2/eyes-iris-wp2-luminance.png", "build-eyes-wp2-refine.mjs"],
  [HAIR1, "pl1/hair-pl1-color.png", "build-hair-pl1-gapfix.mjs"],
]) {
  if (!existsSync(p)) {
    console.error("MISSING chain input: " + hint + " — run `node tools/avatar/" + cmd + "` first.");
    process.exit(1);
  }
}

function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
function decodePng(buf){let off=8,ihdr=null;const idat=[];while(off<buf.length){const len=buf.readUInt32BE(off);const type=buf.toString("ascii",off+4,off+8);const data=buf.subarray(off+8,off+8+len);if(type==="IHDR")ihdr={w:data.readUInt32BE(0),h:data.readUInt32BE(4),bit:data[8],ct:data[9],il:data[12]};else if(type==="IDAT")idat.push(data);else if(type==="IEND")break;off+=12+len;}const ch=ihdr.ct===6?4:3,{w,h}=ihdr,stride=w*ch;const raw=inflateSync(Buffer.concat(idat));const px=Buffer.alloc(h*stride);let prev=Buffer.alloc(stride),p=0;for(let y=0;y<h;y++){const f=raw[p++];const cur=raw.subarray(p,p+stride);p+=stride;const out=px.subarray(y*stride,y*stride+stride);for(let x=0;x<stride;x++){const a=x>=ch?out[x-ch]:0,b=prev[x],c=x>=ch?prev[x-ch]:0;let v=cur[x];if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4)v+=paeth(a,b,c);out[x]=v&0xff;}prev=out;}const rgba=Buffer.alloc(w*h*4);for(let i=0;i<w*h;i++){rgba[i*4]=px[i*ch];rgba[i*4+1]=px[i*ch+1];rgba[i*4+2]=px[i*ch+2];rgba[i*4+3]=ch===4?px[i*ch+3]:255;}return {w,h,rgba,ct:ihdr.ct};}
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(b){let c=0xffffffff;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&0xff]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const T=Buffer.from(t,"ascii");const cc=Buffer.alloc(4);cc.writeUInt32BE(crc32(Buffer.concat([T,d])),0);return Buffer.concat([l,T,d,cc]);}
function encRGB(w,h,rgb){const st=w*3,raw=Buffer.alloc(h*(st+1));for(let y=0;y<h;y++){raw[y*(st+1)]=0;rgb.copy(raw,y*(st+1)+1,y*st,y*st+st);}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);}
const over=(out,i3,r,g,b,a)=>{const A=a/255;out[i3]=Math.round(r*A+out[i3]*(1-A));out[i3+1]=Math.round(g*A+out[i3+1]*(1-A));out[i3+2]=Math.round(b*A+out[i3+2]*(1-A));};
const inBox=(x,y,B)=>x>=B.x0&&x<=B.x1&&y>=B.y0&&y<=B.y1;
const isSkin=(r,g,b)=>r>=205&&r>g&&g>=b&&(r-b)>=28&&(r-b)<=135&&g>r*0.70;

function main(){
  const F=decodePng(readFileSync(target));
  const problems=[];
  if(F.w!==W||F.h!==H)problems.push("dimensions "+F.w+"x"+F.h+" (required "+W+"x"+H+")");
  if(F.ct!==6)problems.push("not RGBA (color type "+F.ct+", required 6)");

  const B=decodePng(readFileSync(D057));
  const E=decodePng(readFileSync(FIXED0));
  const I=decodePng(readFileSync(IRIS2));
  const Hc=decodePng(readFileSync(HAIR1));

  let facePx=0,skinToned=0,inEyeBoxes=0,eyeOverlap=0,outsideRegions=0;
  if(F.w===W&&F.h===H){
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;if(F.rgba[i+3]===0)continue;
      facePx++;
      if(isSkin(F.rgba[i],F.rgba[i+1],F.rgba[i+2]))skinToned++;
      if(inBox(x,y,EYE_BOXES[0])||inBox(x,y,EYE_BOXES[1]))inEyeBoxes++;
      if(E.rgba[i+3]>0||I.rgba[i+3]>0)eyeOverlap++;
      if(!REGIONS.some(r=>inBox(x,y,r)))outsideRegions++;}
    if(facePx<MIN_PX)problems.push("only "+facePx+" px (min "+MIN_PX+" — empty/broken delivery?)");
    if(skinToned>0)problems.push(skinToned+" skin-toned px (must be tone-agnostic, D-022)");
    if(inEyeBoxes>0)problems.push(inEyeBoxes+" px inside the eye boxes");
    if(eyeOverlap>0)problems.push(eyeOverlap+" px overlap the eyes layers (fixed/iris)");
    if(outsideRegions>0)problems.push(outsideRegions+" px outside the ±"+MARGIN+"px expression regions (off the Master face position)");
  }
  const pass=problems.length===0;

  const outDir=join(CHAIN,"wp3","validate-"+exprName);
  mkdirSync(outDir,{recursive:true});
  if(F.w===W&&F.h===H){
    function stack(bg){const c=Buffer.alloc(W*H*3);for(let i=0;i<W*H;i++){c[i*3]=bg[0];c[i*3+1]=bg[1];c[i*3+2]=bg[2];}
      for(let i=0;i<W*H;i++){const a=B.rgba[i*4+3];if(a>0)over(c,i*3,B.rgba[i*4],B.rgba[i*4+1],B.rgba[i*4+2],a);}
      for(let i=0;i<W*H;i++){const a=F.rgba[i*4+3];if(a>0)over(c,i*3,F.rgba[i*4],F.rgba[i*4+1],F.rgba[i*4+2],a);}
      for(let i=0;i<W*H;i++){const a=I.rgba[i*4+3];if(a===0)continue;const L=I.rgba[i*4]/255;
        over(c,i*3,Math.round(L*EYE_BROWN[0]),Math.round(L*EYE_BROWN[1]),Math.round(L*EYE_BROWN[2]),a);}
      for(let i=0;i<W*H;i++){const a=E.rgba[i*4+3];if(a>0)over(c,i*3,E.rgba[i*4],E.rgba[i*4+1],E.rgba[i*4+2],a);}
      for(let i=0;i<W*H;i++){const a=Hc.rgba[i*4+3];if(a>0)over(c,i*3,Hc.rgba[i*4],Hc.rgba[i*4+1],Hc.rgba[i*4+2],a);}
      return c;}
    const sWhite=stack([255,255,255]);
    writeFileSync(join(outDir,"composite-preview.png"),encRGB(W,H,sWhite));
    writeFileSync(join(outDir,"composite-preview-on-dark.png"),encRGB(W,H,stack([38,40,46])));
    function scaleTo(img,hPx){const s=H/hPx,wPx=Math.round(W/s);const o=Buffer.alloc(wPx*hPx*3);
      for(let y=0;y<hPx;y++)for(let x=0;x<wPx;x++){let r=0,g=0,b=0,n=0;
        const y0=Math.floor(y*s),y1=Math.min(H,Math.ceil((y+1)*s)),x0=Math.floor(x*s),x1=Math.min(W,Math.ceil((x+1)*s));
        for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++){const i=(yy*W+xx)*3;r+=img[i];g+=img[i+1];b+=img[i+2];n++;}
        const d=(y*wPx+x)*3;o[d]=Math.round(r/n);o[d+1]=Math.round(g/n);o[d+2]=Math.round(b/n);}
      return {wPx,hPx,o};}
    const SIZES=[64,48,32],UP=4,GAP=12;
    const scaled=SIZES.map(s=>scaleTo(sWhite,s));
    const stripW=scaled.reduce((a,v)=>a+v.wPx*UP,0)+GAP*(SIZES.length+1),stripH=64*UP+2*GAP;
    const strip=Buffer.alloc(stripW*stripH*3,235);let cx=GAP;
    for(const sc of scaled){for(let y=0;y<sc.hPx*UP;y++)for(let x=0;x<sc.wPx*UP;x++){
        const s=(((y/UP)|0)*sc.wPx+((x/UP)|0))*3,d=((GAP+y)*stripW+(cx+x))*3;
        strip[d]=sc.o[s];strip[d+1]=sc.o[s+1];strip[d+2]=sc.o[s+2];}cx+=sc.wPx*UP+GAP;}
    writeFileSync(join(outDir,"small-sizes.png"),encRGB(stripW,stripH,strip));
  }

  writeFileSync(join(outDir,"validate-report.json"),JSON.stringify({
    tool:"validate-face-expression",candidate:target,expression:exprName,
    checks:{dims:F.w+"x"+F.h,rgba:F.ct===6,facePx,skinTonedPx:skinToned,eyeBoxPx:inEyeBoxes,
      eyeLayerOverlapPx:eyeOverlap,outsideRegionPx:outsideRegions,expressionMarginPx:MARGIN,minPx:MIN_PX},
    problems,verdict:pass?"PASS":"FAIL",
    note:"deterministic gate for D-042-produced expression art (docs/167a-phase2-artist-handoff.md); visual identity review by the owner is still required on top",
    boundaries:"review-only; no promote; no assets/avatar-r2; no R2_MANIFEST; AVATAR_R2 false",
  },null,2));

  console.log((pass?"✔ PASS":"✘ FAIL")+" — face-expression candidate '"+exprName+"' ("+facePx+"px)");
  for(const p of problems)console.log("  ✘ "+p);
  console.log("  → "+outDir);
  if(!pass)process.exit(1);
}
main();
