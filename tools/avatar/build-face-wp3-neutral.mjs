// 167A Phase-2 Gate 3 — WP3 FACE: neutral candidate audit + blush measurement (deterministic, NON-AI).
// ---------------------------------------------------------------------------
// G3-WP3 "face×5" (owner command 2026-07-16). The Master carries exactly ONE face
// (neutral). Per the D-042 handoff (docs/167a-phase2-artist-handoff.md), the four
// expression variants (curious, focused, determined, proud [+happy, surprised])
// are produced by the ART PRODUCER via AI-assisted MASKED editing on the Master —
// outside this NON-AI tool chain. What WP3 delivers deterministically:
//
//   1. AUDIT the WP0 face-neutral layer against the brief §4.2 acceptance
//      (registration on Master position, tone-agnostic, 0 eye-box/hair
//      contamination, 32 px legibility) → the face-neutral candidate.
//   2. MEASURE the blush question: brief §4.2 REQUIRES "multiply blush" in the
//      face layer; WP0 skipped it ("subtle; optional refinement"). This tool
//      measures the Master's cheek-zone chroma against the D-057 blank-skin base
//      and reports whether there is a deterministic blush signal to extract at
//      all — an evidence-based answer instead of an assumption.
//   3. FULL-STACK composite: D-057 base + face-neutral + accepted eyes pair
//      (WP2 map × brown preview + fixed) + accepted hair pair — the first
//      complete Gate-3 stack preview, on white and dark.
//
// The deterministic acceptance HARNESS for the incoming expression files is the
// companion tool `tools/avatar/validate-face-expression.mjs` (same audits, run
// against a delivered face-{expression} PNG).
//
// Inputs (all read-only): Master, D-057, gate3-d057/face-neutral-v1.png (WP0),
// eyes-neutral-fixed.png, wp2/eyes-iris-wp2-luminance.png, pl1/hair-pl1-color.png.
// Chain inputs REQUIRED; fail loud with re-run instructions if missing.
//
// Outputs (gitignored, review-only, NOT runtime assets) → build/phase2/gate3-d057/wp3/:
//   face-audit-overlay.png        (face features + §4.2 region boxes + eye boxes, eye crop ×2)
//   blush-analysis.png            (cheek zones with chroma-deviation heat overlay)
//   composite-stack.png / -on-dark.png (the full Gate-3 stack so far)
//   stack-small-sizes.png         (full stack at 64/48/32 px, ×4 — §4.2 "legible at 32px")
//   wp3-face-report.json
//
// NO promote, NO assets/avatar-r2 write, NO R2_MANIFEST change, AVATAR_R2 untouched,
// NO runtime code, NO AI, NO change to Master / D-057 / protect / any chain output.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CHAIN = join(HERE, "build", "phase2", "gate3-d057");
const OUT = join(CHAIN, "wp3");
const MASTER = join(REPO, "assets", "avatar", "reference", "Northstar Master.png");
const D057 = join(REPO, "assets", "avatar", "reference", "neutral-base-v1-gate2-d053.png");
const FACE0 = join(CHAIN, "face-neutral-v1.png");
const FIXED0 = join(CHAIN, "eyes-neutral-fixed.png");
const IRIS2 = join(CHAIN, "wp2", "eyes-iris-wp2-luminance.png");
const HAIR1 = join(CHAIN, "pl1", "hair-pl1-color.png");
const W = 1024, H = 1536;

// WP0 face regions + eye boxes — MUST match build-face-clean.mjs exactly (its
// boxes are the eyes-clean extraction boxes, y0=332; the hair tool's 330-boxes
// would misread legitimate brow rows y330-331 as contamination).
const REGIONS = { BROW:{x0:396,y0:306,x1:632,y1:340}, NOSE:{x0:494,y0:438,x1:532,y1:461}, MOUTH:{x0:474,y0:461,x1:552,y1:481} };
const EYE_BOXES = [ { x0: 374, y0: 332, x1: 480, y1: 440 }, { x0: 527, y0: 332, x1: 633, y1: 440 } ];
// cheek zones for the blush measurement: under each eye box, inside the face
const CHEEKS = [ { x0: 384, y0: 442, x1: 470, y1: 500 }, { x0: 537, y0: 442, x1: 623, y1: 500 } ];
const FACECROP = { x0: 350, y0: 280, x1: 680, y1: 520 };
// blush signal threshold: relative red-vs-green/blue lift of Master over the D-057 blank skin
const BLUSH_MIN_DELTA = 0.04;   // ≥4 % relative redness lift counts as signal

const EYE_BROWN = [0x6B, 0x42, 0x26]; // WP2 preview brown (worksheet §4 proposal)

for (const [p, hint, cmd] of [
  [FACE0, "face-neutral-v1.png", "build-face-clean.mjs"],
  [FIXED0, "eyes-neutral-fixed.png", "build-eyes-clean.mjs"],
  [IRIS2, "wp2/eyes-iris-wp2-luminance.png", "build-eyes-wp2-refine.mjs"],
  [HAIR1, "pl1/hair-pl1-color.png", "build-hair-pl1-gapfix.mjs"],
]) {
  if (!existsSync(p)) {
    console.error("MISSING chain input: " + hint + "\nRun `node tools/avatar/" + cmd + "` first (chain order: hair-clean -> eyes-clean -> face-clean -> pl1 -> pl2 -> eyes-wp2).");
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
const inBox=(x,y,B)=>x>=B.x0&&x<=B.x1&&y>=B.y0&&y<=B.y1;
const isSkin=(r,g,b)=>r>=205&&r>g&&g>=b&&(r-b)>=28&&(r-b)<=135&&g>r*0.70;

function main(){
  mkdirSync(OUT,{recursive:true});
  const M=decodePng(readFileSync(MASTER));
  const B=decodePng(readFileSync(D057));
  const F=decodePng(readFileSync(FACE0));
  const E=decodePng(readFileSync(FIXED0));
  const I=decodePng(readFileSync(IRIS2));
  const Hc=decodePng(readFileSync(HAIR1));

  // ── 1. §4.2 audit of the WP0 face-neutral layer ────────────────────────────
  // Contamination is judged two ways: (a) the WP0 tool's own eye boxes, and
  // (b) the STRONGER criterion — zero alpha overlap with the actual eyes layers.
  let facePx=0,outsideRegions=0,inEyeBoxes=0,skinToned=0,eyeLayerOverlap=0;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;if(F.rgba[i+3]===0)continue;
    facePx++;
    if(!inBox(x,y,REGIONS.BROW)&&!inBox(x,y,REGIONS.NOSE)&&!inBox(x,y,REGIONS.MOUTH))outsideRegions++;
    if(inBox(x,y,EYE_BOXES[0])||inBox(x,y,EYE_BOXES[1]))inEyeBoxes++;
    if(E.rgba[i+3]>0||I.rgba[i+3]>0)eyeLayerOverlap++;
    if(isSkin(F.rgba[i],F.rgba[i+1],F.rgba[i+2]))skinToned++;}
  const auditOk=outsideRegions===0&&inEyeBoxes===0&&skinToned===0&&eyeLayerOverlap===0;
  if(!auditOk){
    console.error("FACE AUDIT FAIL: outsideRegions "+outsideRegions+" · inEyeBoxes "+inEyeBoxes+" · eyeLayerOverlap "+eyeLayerOverlap+" · skin-toned px "+skinToned+". Nothing written.");
    process.exit(1);}

  // ── 2. blush measurement: Master cheek chroma vs D-057 blank skin ─────────
  // redness(px) = r / max(1,(g+b)/2); deviation = redness_Master / redness_D057 − 1.
  // INTERIOR-ONLY: a signal px must have ONLY skin in its 4-px Master neighbourhood —
  // otherwise skin↔line-art/shadow anti-aliasing gradients read as false "blush"
  // (the D-049/D-052 lesson: colour heuristics near edges misclassify).
  const INTERIOR_R=4;
  const isInterior=(x,y)=>{for(let dy=-INTERIOR_R;dy<=INTERIOR_R;dy++)for(let dx=-INTERIOR_R;dx<=INTERIOR_R;dx++){
    const xx=x+dx,yy=y+dy;if(xx<0||xx>=W||yy<0||yy>=H)return false;const j=(yy*W+xx)*4;
    if(!isSkin(M.rgba[j],M.rgba[j+1],M.rgba[j+2]))return false;}return true;};
  let cheekPx=0,signalPx=0,edgeSignalPx=0,sumDev=0,maxDev=0;
  const heat=[]; // [x,y,dev]
  for(const c of CHEEKS)for(let y=c.y0;y<=c.y1;y++)for(let x=c.x0;x<=c.x1;x++){const i=(y*W+x)*4;
    if(B.rgba[i+3]<=16)continue;                        // outside base skin
    if(!isSkin(B.rgba[i],B.rgba[i+1],B.rgba[i+2]))continue; // base must be skin here
    if(!isSkin(M.rgba[i],M.rgba[i+1],M.rgba[i+2]))continue; // skip Master line-art/shadow px
    if(!isInterior(x,y))continue;                       // interior skin only (no edge gradients)
    cheekPx++;
    const rm=M.rgba[i]/Math.max(1,(M.rgba[i+1]+M.rgba[i+2])/2);
    const rb=B.rgba[i]/Math.max(1,(B.rgba[i+1]+B.rgba[i+2])/2);
    const dev=rm/rb-1;
    sumDev+=dev;if(dev>maxDev)maxDev=dev;
    if(dev>=BLUSH_MIN_DELTA){signalPx++;heat.push([x,y,dev]);}}
  // edge-zone signal count kept for the report (what the naive measure would have flagged)
  for(const c of CHEEKS)for(let y=c.y0;y<=c.y1;y++)for(let x=c.x0;x<=c.x1;x++){const i=(y*W+x)*4;
    if(B.rgba[i+3]<=16||!isSkin(B.rgba[i],B.rgba[i+1],B.rgba[i+2])||!isSkin(M.rgba[i],M.rgba[i+1],M.rgba[i+2])||isInterior(x,y))continue;
    const rm=M.rgba[i]/Math.max(1,(M.rgba[i+1]+M.rgba[i+2])/2);
    const rb=B.rgba[i]/Math.max(1,(B.rgba[i+1]+B.rgba[i+2])/2);
    if(rm/rb-1>=BLUSH_MIN_DELTA)edgeSignalPx++;}
  const meanDev=cheekPx?sumDev/cheekPx:0;
  const blushSignal=signalPx>=200;   // require a coherent INTERIOR patch, not edge speckle

  // blush-analysis visual: face crop, cheek boxes outlined, signal px in red heat
  const cw=FACECROP.x1-FACECROP.x0+1,chh=FACECROP.y1-FACECROP.y0+1,UPX=2;
  const bl=Buffer.alloc(cw*UPX*chh*UPX*3,255);
  for(let y=0;y<chh*UPX;y++)for(let x=0;x<cw*UPX;x++){
    const sx=FACECROP.x0+((x/UPX)|0),sy=FACECROP.y0+((y/UPX)|0);const i=(sy*W+sx)*4;const d=(y*cw*UPX+x)*3;
    if(M.rgba[i+3]>16){bl[d]=M.rgba[i];bl[d+1]=M.rgba[i+1];bl[d+2]=M.rgba[i+2];}}
  for(const [px,py] of heat.map(h=>[h[0],h[1]])){
    for(let dy=0;dy<UPX;dy++)for(let dx=0;dx<UPX;dx++){
      const x=(px-FACECROP.x0)*UPX+dx,y=(py-FACECROP.y0)*UPX+dy;
      const d=(y*cw*UPX+x)*3;bl[d]=255;bl[d+1]=0;bl[d+2]=0;}}
  for(const c of CHEEKS){
    for(let x=c.x0;x<=c.x1;x++)for(const yy of [c.y0,c.y1]){const d=(((yy-FACECROP.y0)*UPX)*cw*UPX+(x-FACECROP.x0)*UPX)*3;bl[d]=0;bl[d+1]=120;bl[d+2]=255;}
    for(let y=c.y0;y<=c.y1;y++)for(const xx of [c.x0,c.x1]){const d=(((y-FACECROP.y0)*UPX)*cw*UPX+(xx-FACECROP.x0)*UPX)*3;bl[d]=0;bl[d+1]=120;bl[d+2]=255;}}
  writeFileSync(join(OUT,"blush-analysis.png"),encRGB(cw*UPX,chh*UPX,bl));

  // ── 3. face-audit overlay: features + region boxes on the face crop ───────
  const ov=Buffer.alloc(cw*UPX*chh*UPX*3,255);
  for(let y=0;y<chh*UPX;y++)for(let x=0;x<cw*UPX;x++){
    const sx=FACECROP.x0+((x/UPX)|0),sy=FACECROP.y0+((y/UPX)|0);const i=(sy*W+sx)*4;const d=(y*cw*UPX+x)*3;
    if(B.rgba[i+3]>0){ov[d]=B.rgba[i];ov[d+1]=B.rgba[i+1];ov[d+2]=B.rgba[i+2];}
    if(F.rgba[i+3]>0){ov[d]=F.rgba[i];ov[d+1]=F.rgba[i+1];ov[d+2]=F.rgba[i+2];}}
  const boxes=[[REGIONS.BROW,[0,160,0]],[REGIONS.NOSE,[0,160,0]],[REGIONS.MOUTH,[0,160,0]],[EYE_BOXES[0],[220,0,220]],[EYE_BOXES[1],[220,0,220]]];
  for(const [b,col] of boxes){
    for(let x=Math.max(b.x0,FACECROP.x0);x<=Math.min(b.x1,FACECROP.x1);x++)for(const yy of [b.y0,b.y1]){if(yy<FACECROP.y0||yy>FACECROP.y1)continue;const d=(((yy-FACECROP.y0)*UPX)*cw*UPX+(x-FACECROP.x0)*UPX)*3;ov[d]=col[0];ov[d+1]=col[1];ov[d+2]=col[2];}
    for(let y=Math.max(b.y0,FACECROP.y0);y<=Math.min(b.y1,FACECROP.y1);y++)for(const xx of [b.x0,b.x1]){if(xx<FACECROP.x0||xx>FACECROP.x1)continue;const d=(((y-FACECROP.y0)*UPX)*cw*UPX+(xx-FACECROP.x0)*UPX)*3;ov[d]=col[0];ov[d+1]=col[1];ov[d+2]=col[2];}}
  writeFileSync(join(OUT,"face-audit-overlay.png"),encRGB(cw*UPX,chh*UPX,ov));

  // ── 4. full Gate-3 stack composite: base + face + eyes(WP2×brown, fixed) + hair(PL-1) ──
  function stack(bg){const c=Buffer.alloc(W*H*3);for(let i=0;i<W*H;i++){c[i*3]=bg[0];c[i*3+1]=bg[1];c[i*3+2]=bg[2];}
    for(let i=0;i<W*H;i++){const a=B.rgba[i*4+3];if(a>0)over(c,i*3,B.rgba[i*4],B.rgba[i*4+1],B.rgba[i*4+2],a);}          // z0 base
    for(let i=0;i<W*H;i++){const a=F.rgba[i*4+3];if(a>0)over(c,i*3,F.rgba[i*4],F.rgba[i*4+1],F.rgba[i*4+2],a);}          // z3 face
    for(let i=0;i<W*H;i++){const a=I.rgba[i*4+3];if(a===0)continue;const L=I.rgba[i*4]/255;                              // z4 iris (tinted)
      over(c,i*3,Math.round(L*EYE_BROWN[0]),Math.round(L*EYE_BROWN[1]),Math.round(L*EYE_BROWN[2]),a);}
    for(let i=0;i<W*H;i++){const a=E.rgba[i*4+3];if(a>0)over(c,i*3,E.rgba[i*4],E.rgba[i*4+1],E.rgba[i*4+2],a);}          // z4 fixed
    for(let i=0;i<W*H;i++){const a=Hc.rgba[i*4+3];if(a>0)over(c,i*3,Hc.rgba[i*4],Hc.rgba[i*4+1],Hc.rgba[i*4+2],a);}      // z40 hair
    return c;}
  const sWhite=stack([255,255,255]);
  writeFileSync(join(OUT,"composite-stack.png"),encRGB(W,H,sWhite));
  writeFileSync(join(OUT,"composite-stack-on-dark.png"),encRGB(W,H,stack([38,40,46])));

  // ── 5. 32/48/64 px legibility strip of the full stack (§4.2 acceptance) ──
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
  writeFileSync(join(OUT,"stack-small-sizes.png"),encRGB(stripW,stripH,strip));

  // ── 6. report ──
  writeFileSync(join(OUT,"wp3-face-report.json"),JSON.stringify({
    tool:"build-face-wp3-neutral",
    task:"G3-WP3 face×5 — neutral candidate audit + blush measurement (deterministic, NON-AI)",
    scopeNote:"Master carries ONE face. The 4 expression variants are D-042 art-producer scope (AI-assisted MASKED editing on the Master, per docs/167a-phase2-artist-handoff.md) — NOT producible by this NON-AI chain. Their objective gate is tools/avatar/validate-face-expression.mjs.",
    neutralAudit:{facePx,outsideRegionPx:outsideRegions,eyeBoxPx:inEyeBoxes,eyeLayerAlphaOverlapPx:eyeLayerOverlap,skinTonedPx:skinToned,
      registration:"extracted in-place from the Master — position exact by construction",ok:auditOk},
    blushMeasurement:{cheekZones:CHEEKS,method:"interior-skin-only (4px all-skin neighbourhood) — edge anti-aliasing gradients excluded per the D-049/D-052 lesson",
      comparedInteriorPx:cheekPx,rednessDeltaMean:+meanDev.toFixed(4),
      rednessDeltaMax:+maxDev.toFixed(4),thresholdPerPx:BLUSH_MIN_DELTA,interiorSignalPx:signalPx,
      excludedEdgeSignalPx:edgeSignalPx,coherentPatchThresholdPx:200,blushSignalFound:blushSignal,
      conclusion:blushSignal?"deterministic blush signal EXISTS - extraction is a follow-up task"
        :"NO coherent blush signal in the Master cheeks vs the D-057 blank skin - brief §4.2's multiply blush is artist-added content (D-042 producer scope), not extractable"},
    fullStack:{layers:["D-057 base","face-neutral (WP0, audited here)","iris WP2 map × brown preview","eyes fixed (WP0)","hair PL-1 (accepted)"],
      note:"first complete Gate-3 stack preview"},
    outputs:["face-audit-overlay.png","blush-analysis.png","composite-stack.png","composite-stack-on-dark.png","stack-small-sizes.png"],
    boundaries:"review-only; NOT runtime assets; no promote; no assets/avatar-r2; no R2_MANIFEST; AVATAR_R2 false; no AI; Master/D-057/protect/chain outputs unchanged",
  },null,2));

  console.log("✔ WP3 face-neutral audit + blush measurement:");
  console.log("  face px "+facePx+" · outside §4.2 regions "+outsideRegions+" · in eye boxes "+inEyeBoxes+" · eye-layer alpha overlap "+eyeLayerOverlap+" · skin-toned "+skinToned+" (all must be 0 ✓)");
  console.log("  blush: interior px "+cheekPx+" · mean delta "+(100*meanDev).toFixed(2)+"% · max "+(100*maxDev).toFixed(2)+"% · interior signal "+signalPx+"px · excluded edge signal "+edgeSignalPx+"px → "+(blushSignal?"SIGNAL FOUND":"NO coherent interior blush signal"));
  console.log("  → wp3/face-audit-overlay.png · blush-analysis.png · composite-stack(-on-dark).png · stack-small-sizes.png");
}
main();
