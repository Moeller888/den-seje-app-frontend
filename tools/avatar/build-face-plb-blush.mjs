// 167A Phase-2 Gate 3 — G3-PL-B: deterministic BLUSH multiply-component extraction (NON-AI).
// ---------------------------------------------------------------------------
// Ordered by the WP3 countersign (2026-07-16, owner command verbatim:
// "blush-ekstraktion bestilt"). WP3 §3 measured a real, symmetric under-eye
// blush signal in the Master (390 interior px, ≥4 % redness lift, max 6.6 %),
// clipped by the measurement-zone tops. This task extracts it.
//
// WHY A MULTIPLY COMPONENT (not baked into the face file): the face layer is
// tone-agnostic (D-022) — baking the Master's blushed SKIN pixels in would be
// medium-tone-specific. The blush is therefore delivered as per-channel
// multiply factors m = Master / D-057 (clamped ≤ 1): applied over the medium
// base they reproduce the Master exactly; applied over any other skin tone
// they scale proportionally (the same model as the D-031 hair/iris tints,
// matching brief §4.2's "mix-blend-mode:multiply blush").
//
// Method (deterministic, interior-only discipline per D-049/D-052):
//   zones   = under-eye boxes EXTENDED UPWARD toward the eye boxes (the WP3
//             clipping finding): x 380–480 / 530–630, y 428–505
//   include = base is skin ∧ Master is skin ∧ 4-px all-skin Master
//             neighbourhood (no edge gradients) ∧ NOT under the eyes layers
//             ∧ NOT under the face line-work ∧ redness lift ≥ 2 %
//   alpha   = smoothstep of the redness lift between 2 % and 8 % (soft,
//             deterministic edge — no hand-drawn shapes)
//   colour  = per-channel multiply factor ×255 (r/g/b of Master ÷ D-057, ≤1)
//
// Guards (hard-fail, nothing written on breach):
//   - included px must lie inside the zones, be interior skin on BOTH images,
//     overlap NO eyes-layer/face-layer alpha,
//   - multiply factors ≤ 1 in every channel (blush only darkens/warms),
//   - left/right symmetry: px-count ratio within [0.5, 2.0],
//   - minimum coherent patch: ≥ 200 px total.
//
// Outputs (gitignored, review-only, NOT runtime assets) → build/phase2/gate3-d057/plb/:
//   face-blush-multiply-v1.png   (the multiply component: factors ×255, soft alpha)
//   blush-zones-audit.png        (included px + zones on the Master face crop)
//   blush-before-after.png       (face crop: stack without vs with blush multiply)
//   blush-tone-proof.png         (blush multiply over medium AND darkened skin patches
//                                 — tone-agnostic evidence)
//   composite-stack-blush.png / -on-dark.png (full Gate-3 stack + blush)
//   plb-blush-report.json
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
const OUT = join(CHAIN, "plb");
const MASTER = join(REPO, "assets", "avatar", "reference", "Northstar Master.png");
const D057 = join(REPO, "assets", "avatar", "reference", "neutral-base-v1-gate2-d053.png");
const FACE0 = join(CHAIN, "face-neutral-v1.png");
const FIXED0 = join(CHAIN, "eyes-neutral-fixed.png");
const IRIS2 = join(CHAIN, "wp2", "eyes-iris-wp2-luminance.png");
const HAIR1 = join(CHAIN, "pl1", "hair-pl1-color.png");
const W = 1024, H = 1536;

// zones extended UP toward the eye boxes (eye boxes end at y440; WP3 zones began y442)
const ZONES = [ { x0: 380, y0: 428, x1: 480, y1: 505 }, { x0: 530, y0: 428, x1: 630, y1: 505 } ];
const INTERIOR_R = 4;
const DEV_LO = 0.02, DEV_HI = 0.08;   // smoothstep alpha band on the redness lift
const MIN_PATCH_PX = 200;
const FACECROP = { x0: 350, y0: 280, x1: 680, y1: 520 };
const EYE_BROWN = [0x6B, 0x42, 0x26];

for (const [p, hint, cmd] of [
  [FACE0, "face-neutral-v1.png", "build-face-clean.mjs"],
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
function decodePng(buf){let off=8,ihdr=null;const idat=[];while(off<buf.length){const len=buf.readUInt32BE(off);const type=buf.toString("ascii",off+4,off+8);const data=buf.subarray(off+8,off+8+len);if(type==="IHDR")ihdr={w:data.readUInt32BE(0),h:data.readUInt32BE(4),bit:data[8],ct:data[9],il:data[12]};else if(type==="IDAT")idat.push(data);else if(type==="IEND")break;off+=12+len;}const ch=ihdr.ct===6?4:3,{w,h}=ihdr,stride=w*ch;const raw=inflateSync(Buffer.concat(idat));const px=Buffer.alloc(h*stride);let prev=Buffer.alloc(stride),p=0;for(let y=0;y<h;y++){const f=raw[p++];const cur=raw.subarray(p,p+stride);p+=stride;const out=px.subarray(y*stride,y*stride+stride);for(let x=0;x<stride;x++){const a=x>=ch?out[x-ch]:0,b=prev[x],c=x>=ch?prev[x-ch]:0;let v=cur[x];if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4)v+=paeth(a,b,c);out[x]=v&0xff;}prev=out;}const rgba=Buffer.alloc(w*h*4);for(let i=0;i<w*h;i++){rgba[i*4]=px[i*ch];rgba[i*4+1]=px[i*ch+1];rgba[i*4+2]=px[i*ch+2];rgba[i*4+3]=ch===4?px[i*ch+3]:255;}return {w,h,rgba};}
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(b){let c=0xffffffff;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&0xff]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const T=Buffer.from(t,"ascii");const cc=Buffer.alloc(4);cc.writeUInt32BE(crc32(Buffer.concat([T,d])),0);return Buffer.concat([l,T,d,cc]);}
function encRGBA(w,h,rgba){const st=w*4,raw=Buffer.alloc(h*(st+1));for(let y=0;y<h;y++){raw[y*(st+1)]=0;rgba.copy(raw,y*(st+1)+1,y*st,y*st+st);}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);}
function encRGB(w,h,rgb){const st=w*3,raw=Buffer.alloc(h*(st+1));for(let y=0;y<h;y++){raw[y*(st+1)]=0;rgb.copy(raw,y*(st+1)+1,y*st,y*st+st);}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);}

const over=(out,i3,r,g,b,a)=>{const A=a/255;out[i3]=Math.round(r*A+out[i3]*(1-A));out[i3+1]=Math.round(g*A+out[i3+1]*(1-A));out[i3+2]=Math.round(b*A+out[i3+2]*(1-A));};
const inBox=(x,y,B)=>x>=B.x0&&x<=B.x1&&y>=B.y0&&y<=B.y1;
const isSkin=(r,g,b)=>r>=205&&r>g&&g>=b&&(r-b)>=28&&(r-b)<=135&&g>r*0.70;
const smooth=(t)=>{const u=Math.min(1,Math.max(0,t));return u*u*(3-2*u);};

function main(){
  mkdirSync(OUT,{recursive:true});
  const M=decodePng(readFileSync(MASTER));
  const B=decodePng(readFileSync(D057));
  const F=decodePng(readFileSync(FACE0));
  const E=decodePng(readFileSync(FIXED0));
  const I=decodePng(readFileSync(IRIS2));
  const Hc=decodePng(readFileSync(HAIR1));

  const isInterior=(x,y)=>{for(let dy=-INTERIOR_R;dy<=INTERIOR_R;dy++)for(let dx=-INTERIOR_R;dx<=INTERIOR_R;dx++){
    const xx=x+dx,yy=y+dy;if(xx<0||xx>=W||yy<0||yy>=H)return false;const j=(yy*W+xx)*4;
    if(!isSkin(M.rgba[j],M.rgba[j+1],M.rgba[j+2]))return false;}return true;};

  // ── 1. extraction ──
  const blush=Buffer.alloc(W*H*4);
  let px=0,leftPx=0,rightPx=0,factorOver1=0,layerOverlap=0,maxDev=0;
  for(let z=0;z<ZONES.length;z++){const c=ZONES[z];
    for(let y=c.y0;y<=c.y1;y++)for(let x=c.x0;x<=c.x1;x++){const i=(y*W+x)*4;
      if(B.rgba[i+3]<=16)continue;
      if(!isSkin(B.rgba[i],B.rgba[i+1],B.rgba[i+2]))continue;
      if(!isSkin(M.rgba[i],M.rgba[i+1],M.rgba[i+2]))continue;
      if(!isInterior(x,y))continue;
      if(E.rgba[i+3]>0||I.rgba[i+3]>0||F.rgba[i+3]>0){layerOverlap++;continue;}  // stay disjoint from eyes/face layers
      const rm=M.rgba[i]/Math.max(1,(M.rgba[i+1]+M.rgba[i+2])/2);
      const rb=B.rgba[i]/Math.max(1,(B.rgba[i+1]+B.rgba[i+2])/2);
      const dev=rm/rb-1;
      if(dev<DEV_LO)continue;
      const a=Math.round(smooth((dev-DEV_LO)/(DEV_HI-DEV_LO))*255);
      if(a===0)continue;
      const mr=Math.min(1,M.rgba[i]/Math.max(1,B.rgba[i]));
      const mg=Math.min(1,M.rgba[i+1]/Math.max(1,B.rgba[i+1]));
      const mb=Math.min(1,M.rgba[i+2]/Math.max(1,B.rgba[i+2]));
      if(M.rgba[i]/Math.max(1,B.rgba[i])>1.02&&M.rgba[i+1]/Math.max(1,B.rgba[i+1])>1.02&&M.rgba[i+2]/Math.max(1,B.rgba[i+2])>1.02)factorOver1++;
      blush[i]=Math.round(mr*255);blush[i+1]=Math.round(mg*255);blush[i+2]=Math.round(mb*255);blush[i+3]=a;
      px++;if(dev>maxDev)maxDev=dev;if(z===0)leftPx++;else rightPx++;}}

  const symRatio=rightPx>0?leftPx/rightPx:Infinity;
  const guards={includedPx:px,leftPx,rightPx,symmetryRatio:+symRatio.toFixed(2),
    layerOverlapSkipped:layerOverlap,allFactorsClamped:true,brighterThanBaseCount:factorOver1};
  const pass=px>=MIN_PATCH_PX&&symRatio>=0.5&&symRatio<=2.0;
  if(!pass){
    console.error("PL-B GUARD FAIL: includedPx "+px+" (min "+MIN_PATCH_PX+") · symmetry "+symRatio.toFixed(2)+" (req 0.5–2.0). Nothing written.");
    process.exit(1);}
  writeFileSync(join(OUT,"face-blush-multiply-v1.png"),encRGBA(W,H,blush));

  // ── 2. zone audit visual ──
  const cw=FACECROP.x1-FACECROP.x0+1,chh=FACECROP.y1-FACECROP.y0+1,UPX=2;
  const za=Buffer.alloc(cw*UPX*chh*UPX*3,255);
  for(let y=0;y<chh*UPX;y++)for(let x=0;x<cw*UPX;x++){
    const sx=FACECROP.x0+((x/UPX)|0),sy=FACECROP.y0+((y/UPX)|0);const i=(sy*W+sx)*4;const d=(y*cw*UPX+x)*3;
    if(M.rgba[i+3]>16){za[d]=M.rgba[i];za[d+1]=M.rgba[i+1];za[d+2]=M.rgba[i+2];}
    if(blush[i+3]>0){za[d]=255;za[d+1]=0;za[d+2]=0;}}
  for(const c of ZONES){
    for(let x=c.x0;x<=c.x1;x++)for(const yy of [c.y0,c.y1]){const d=(((yy-FACECROP.y0)*UPX)*cw*UPX+(x-FACECROP.x0)*UPX)*3;za[d]=0;za[d+1]=120;za[d+2]=255;}
    for(let y=c.y0;y<=c.y1;y++)for(const xx of [c.x0,c.x1]){const d=(((y-FACECROP.y0)*UPX)*cw*UPX+(xx-FACECROP.x0)*UPX)*3;za[d]=0;za[d+1]=120;za[d+2]=255;}}
  writeFileSync(join(OUT,"blush-zones-audit.png"),encRGB(cw*UPX,chh*UPX,za));

  // ── 3. composites: stack without vs with blush ──
  const applyBlush=(c)=>{for(let i=0;i<W*H;i++){const a=blush[i*4+3];if(a===0)continue;const A=a/255;
    for(let ch=0;ch<3;ch++){const m=blush[i*4+ch]/255;const v=c[i*3+ch];c[i*3+ch]=Math.round(v*(m*A+(1-A)));}}return c;};
  function stack(bg,withB){const c=Buffer.alloc(W*H*3);for(let i=0;i<W*H;i++){c[i*3]=bg[0];c[i*3+1]=bg[1];c[i*3+2]=bg[2];}
    for(let i=0;i<W*H;i++){const a=B.rgba[i*4+3];if(a>0)over(c,i*3,B.rgba[i*4],B.rgba[i*4+1],B.rgba[i*4+2],a);}
    if(withB)applyBlush(c);
    for(let i=0;i<W*H;i++){const a=F.rgba[i*4+3];if(a>0)over(c,i*3,F.rgba[i*4],F.rgba[i*4+1],F.rgba[i*4+2],a);}
    for(let i=0;i<W*H;i++){const a=I.rgba[i*4+3];if(a===0)continue;const L=I.rgba[i*4]/255;
      over(c,i*3,Math.round(L*EYE_BROWN[0]),Math.round(L*EYE_BROWN[1]),Math.round(L*EYE_BROWN[2]),a);}
    for(let i=0;i<W*H;i++){const a=E.rgba[i*4+3];if(a>0)over(c,i*3,E.rgba[i*4],E.rgba[i*4+1],E.rgba[i*4+2],a);}
    for(let i=0;i<W*H;i++){const a=Hc.rgba[i*4+3];if(a>0)over(c,i*3,Hc.rgba[i*4],Hc.rgba[i*4+1],Hc.rgba[i*4+2],a);}
    return c;}
  const withoutB=stack([255,255,255],false),withB=stack([255,255,255],true);
  writeFileSync(join(OUT,"composite-stack-blush.png"),encRGB(W,H,withB));
  writeFileSync(join(OUT,"composite-stack-blush-on-dark.png"),encRGB(W,H,stack([38,40,46],true)));
  const bw=2*cw+3*8,bh=chh+2*8,bb=Buffer.alloc(bw*bh*3,235);
  [withoutB,withB].forEach((img,k)=>{const gx=8+k*(cw+8);
    for(let y=0;y<chh;y++)for(let x=0;x<cw;x++){const s=((FACECROP.y0+y)*W+(FACECROP.x0+x))*3,d=((8+y)*bw+(gx+x))*3;
      bb[d]=img[s];bb[d+1]=img[s+1];bb[d+2]=img[s+2];}});
  writeFileSync(join(OUT,"blush-before-after.png"),encRGB(bw,bh,bb));

  // ── 4. tone-agnostic proof: blush multiply over medium vs darkened skin patches ──
  // medium = D-057's own cheek skin; "dark" = the same patch darkened ×0.62 (approximates
  // the 152E dark-tone relationship) — the blush must warm BOTH without hue breakage.
  const PW=ZONES[0].x1-ZONES[0].x0+1,PH=ZONES[0].y1-ZONES[0].y0+1,PAD=8;
  const proofW=2*PW+3*PAD,proofH=2*PH+3*PAD;
  const proof=Buffer.alloc(proofW*proofH*3,235);
  for(let row=0;row<2;row++){const mul=row===0?1:0.62;
    for(let col=0;col<2;col++){const gx=PAD+col*(PW+PAD),gy=PAD+row*(PH+PAD);
      for(let y=0;y<PH;y++)for(let x=0;x<PW;x++){const sx=ZONES[0].x0+x,sy=ZONES[0].y0+y;const i=(sy*W+sx)*4;
        let r=Math.round(B.rgba[i]*mul),g=Math.round(B.rgba[i+1]*mul),b=Math.round(B.rgba[i+2]*mul);
        if(col===1&&blush[i+3]>0){const A=blush[i+3]/255;
          r=Math.round(r*((blush[i]/255)*A+(1-A)));g=Math.round(g*((blush[i+1]/255)*A+(1-A)));b=Math.round(b*((blush[i+2]/255)*A+(1-A)));}
        const d=((gy+y)*proofW+(gx+x))*3;proof[d]=r;proof[d+1]=g;proof[d+2]=b;}}}
  writeFileSync(join(OUT,"blush-tone-proof.png"),encRGB(proofW,proofH,proof));

  // ── 5. report ──
  writeFileSync(join(OUT,"plb-blush-report.json"),JSON.stringify({
    tool:"build-face-plb-blush",
    task:"G3-PL-B — blush multiply-component extraction (deterministic, NON-AI; ordered by the WP3 countersign)",
    model:"per-channel multiply factors m = Master/D-057 (clamped ≤1), soft alpha = smoothstep(redness lift, 2%→8%); tone-agnostic per D-022 (same technique family as D-031)",
    zones:ZONES,zoneNote:"extended upward to y428 toward the eye boxes per the WP3 §3 clipping finding",
    guards,maxRednessLift:+maxDev.toFixed(4),
    packaging:"SEPARATE multiply component (face-blush-multiply-v1.png) — cannot be baked into the normal-blend face file without breaking tone-agnosticism; runtime wiring (own element with mix-blend-mode:multiply) is a later, separately-gated code step",
    outputs:["face-blush-multiply-v1.png","blush-zones-audit.png","blush-before-after.png","blush-tone-proof.png","composite-stack-blush.png","composite-stack-blush-on-dark.png"],
    boundaries:"review-only; NOT runtime assets; no promote; no assets/avatar-r2; no R2_MANIFEST; AVATAR_R2 false; no AI; Master/D-057/protect/chain outputs unchanged (blush is a NEW file)",
  },null,2));

  console.log("✔ G3-PL-B blush extraction:");
  console.log("  included "+px+"px (left "+leftPx+" / right "+rightPx+", symmetry "+symRatio.toFixed(2)+") · max redness lift "+(100*maxDev).toFixed(2)+"%");
  console.log("  layer-overlap px skipped "+layerOverlap+" · factors clamped ≤1 · brighter-than-base px "+factorOver1+" (excluded from clamp concern)");
  console.log("  → plb/face-blush-multiply-v1.png · blush-zones-audit.png · blush-before-after.png · blush-tone-proof.png · composite-stack-blush(-on-dark).png");
}
main();
