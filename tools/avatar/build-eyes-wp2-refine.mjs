// 167A Phase-2 Gate 3 — WP2 EYES refinement: neutral-luminance iris (deterministic, NON-AI).
// ---------------------------------------------------------------------------
// G3-WP2 (owner command 2026-07-16). The WP0 eyes extractor (build-eyes-clean.mjs)
// produced an honest first pass: fixed layer (sclera + lash + catch-light) is
// spec-complete per D-021, but the iris layer is the Master's BROWN art — not the
// "tintable iris disk (neutral luminance)" the Phase-2 cut-list requires.
//
// SPEC NOTE (conflict resolved, reported in the worksheet): the asset brief
// docs/167a-phase2-asset-brief.md §4.4 is authoritative — "the tintable iris disk
// only (neutral luminance so the eye-color token tints it); PUPIL RENDERED AS PART
// OF THE IRIS ART … pupil stays legible after tint". The eyes-report note
// "D-015 pupil-fixed split = refinement" was inaccurate shorthand: D-015/D-021
// define iris = tintable / fixed = sclera+lash+highlight, and the pupil lives in
// the iris art. WP2 therefore does NOT move the pupil; it re-expresses the iris
// as a neutral luminance map (the D-031 multiply model, same as hair).
//
// Method (all deterministic):
//   1. verify chain integrity: WP0 eyes outputs byte-identical to the tracked
//      fixtures tools/avatar/fixtures/face-clean/eyes-neutral-{fixed,iris}.png,
//   2. luminance-map the iris: L = 0.299r+0.587g+0.114b over iris px,
//      band-normalized [lmin,lmax] → [40, 235] (pupil stays dark → legible after
//      multiply; iris body takes the token brightly). Alpha copied verbatim.
//   3. guards: iris-centroid distance to the 164S irisCenter anchors ≤ 10 px per
//      eye · alpha identity vs WP0 iris (0 mismatch) · every iris px inside the
//      eye boxes · fixed layer untouched (byte-identical, it is already D-021-
//      complete) · monotone mapping (order of shading preserved).
//
// Outputs (gitignored, review-only, NOT runtime assets) → build/phase2/gate3-d057/wp2/:
//   eyes-iris-wp2-luminance.png   (the tintable neutral-luminance iris candidate)
//   eyes-tint-sheet.png           (eye crop × 6 PREVIEW colors — see worksheet: the
//                                  preview set is a PROPOSAL, not runtime tokens)
//   eyes-tint-small.png           (brown + blue full avatar at 64/48/32 px, ×4)
//   iris-before-after.png         (eye crop: WP0 brown iris vs WP2 map × brown)
//   composite-full-look.png / -on-dark.png (D-057 + hair pair + eyes — integration view)
//   anchor-check.png              (irisCenter anchors crosshaired on the iris map)
//   wp2-eyes-report.json
//
// NO promote, NO assets/avatar-r2 write, NO R2_MANIFEST change, AVATAR_R2 untouched,
// NO runtime code, NO change to Master / D-057 / protect / WP0 / PL / re-review outputs.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CHAIN = join(HERE, "build", "phase2", "gate3-d057");
const FIX = join(HERE, "fixtures", "face-clean");
const OUT = join(CHAIN, "wp2");
const MASTER = join(REPO, "assets", "avatar", "reference", "Northstar Master.png");
const D057 = join(REPO, "assets", "avatar", "reference", "neutral-base-v1-gate2-d053.png");
const IRIS0 = join(CHAIN, "eyes-neutral-iris.png");
const FIXED0 = join(CHAIN, "eyes-neutral-fixed.png");
const HAIRCOLOR = join(CHAIN, "pl1", "hair-pl1-color.png");
const W = 1024, H = 1536;

// 164S human-calibrated iris centres (extract-anchor-masks.mjs MANUAL_ANCHOR_OVERRIDES,
// independently confirmed in D-055). Mirrored read-only for the audit.
const IRIS_CENTERS = [ { x: 432, y: 387 }, { x: 577, y: 387 } ];
const CENTER_TOL = 10;                       // px, per eye
const EYES = [ { x0: 374, y0: 332, x1: 480, y1: 440 }, { x0: 527, y0: 332, x1: 633, y1: 440 } ];
const IRIS_LO = 40, IRIS_HI = 235;           // output band: pupil dark, iris body bright

// PREVIEW eye-color set — a PROPOSAL for owner review only. There is NO runtime
// EYE_COLOR token set yet (js/avatar-layers.js has only HAIR_COLOR_TOKENS);
// adopting one is a separate owner/code decision outside this review.
const EYE_PREVIEW = {
  brown: "#6B4226", blue: "#4A78C8", green: "#3E7D4E",
  amber: "#B87A33", gray: "#7A8089", violet: "#7B5AA6",
};
const EYECROP = { x0: 350, y0: 315, x1: 660, y1: 455 };  // both eyes, for sheets

for (const [p, hint] of [[IRIS0, "eyes-neutral-iris.png"], [FIXED0, "eyes-neutral-fixed.png"], [HAIRCOLOR, "pl1/hair-pl1-color.png"]]) {
  if (!existsSync(p)) {
    console.error("MISSING chain input: " + hint + "\nRun the chain first: build-hair-clean.mjs -> build-eyes-clean.mjs -> build-hair-pl1-gapfix.mjs -> build-hair-pl2-remap.mjs.");
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

const hex2rgb=(hx)=>[parseInt(hx.slice(1,3),16),parseInt(hx.slice(3,5),16),parseInt(hx.slice(5,7),16)];
const over=(out,i3,r,g,b,a)=>{const A=a/255;out[i3]=Math.round(r*A+out[i3]*(1-A));out[i3+1]=Math.round(g*A+out[i3+1]*(1-A));out[i3+2]=Math.round(b*A+out[i3+2]*(1-A));};
const inBox=(x,y,B)=>x>=B.x0&&x<=B.x1&&y>=B.y0&&y<=B.y1;

function main(){
  mkdirSync(OUT,{recursive:true});

  // ── 0. chain integrity: WP0 eyes outputs must equal the tracked fixtures ──
  const irisBuf=readFileSync(IRIS0), fixedBuf=readFileSync(FIXED0);
  for(const [buf,fix,name] of [[irisBuf,join(FIX,"eyes-neutral-iris.png"),"eyes-neutral-iris.png"],
                               [fixedBuf,join(FIX,"eyes-neutral-fixed.png"),"eyes-neutral-fixed.png"]]){
    if(!existsSync(fix)){console.error("MISSING tracked fixture for "+name+". Aborting.");process.exit(1);}
    if(!buf.equals(readFileSync(fix))){
      console.error("CHAIN INTEGRITY FAIL: "+name+" is NOT byte-identical to the tracked fixture.\nRe-run `node tools/avatar/build-eyes-clean.mjs` and re-check before WP2.");
      process.exit(1);}
  }

  const M=decodePng(readFileSync(MASTER));
  const B=decodePng(readFileSync(D057));
  const I0=decodePng(irisBuf);
  const F0=decodePng(fixedBuf);
  const Hc=decodePng(readFileSync(HAIRCOLOR));

  // ── 1. iris audit: px inside boxes, per-eye centroids vs 164S anchors ──
  let outsideBoxes=0;
  const eyeStats=EYES.map(()=>({n:0,sx:0,sy:0}));
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;if(I0.rgba[i+3]===0)continue;
    let inAny=-1;for(let k=0;k<EYES.length;k++)if(inBox(x,y,EYES[k])){inAny=k;break;}
    if(inAny<0){outsideBoxes++;continue;}
    eyeStats[inAny].n++;eyeStats[inAny].sx+=x;eyeStats[inAny].sy+=y;}
  const centroids=eyeStats.map(s=>s.n?{x:s.sx/s.n,y:s.sy/s.n}:null);
  const centerDist=centroids.map((c,k)=>c?Math.hypot(c.x-IRIS_CENTERS[k].x,c.y-IRIS_CENTERS[k].y):Infinity);
  if(outsideBoxes>0||centerDist.some(d=>d>CENTER_TOL)){
    console.error("IRIS AUDIT FAIL: outsideBoxes "+outsideBoxes+" · centroid distances "+centerDist.map(d=>d.toFixed(1)).join(", ")+
      " (tol "+CENTER_TOL+"px). Nothing written.");
    process.exit(1);}

  // ── 2. neutral-luminance iris map: band [lmin,lmax] → [40,235], alpha verbatim ──
  let lmin=255,lmax=0;
  for(let i=0;i<W*H;i++)if(I0.rgba[i*4+3]>0){const L=0.299*M.rgba[i*4]+0.587*M.rgba[i*4+1]+0.114*M.rgba[i*4+2];if(L<lmin)lmin=L;if(L>lmax)lmax=L;}
  const span=Math.max(1,lmax-lmin);
  const irisMap=Buffer.alloc(W*H*4);
  for(let i=0;i<W*H;i++){const a=I0.rgba[i*4+3];if(a===0)continue;
    const L=0.299*M.rgba[i*4]+0.587*M.rgba[i*4+1]+0.114*M.rgba[i*4+2];
    const g=Math.round(IRIS_LO+((L-lmin)/span)*(IRIS_HI-IRIS_LO));
    irisMap[i*4]=g;irisMap[i*4+1]=g;irisMap[i*4+2]=g;irisMap[i*4+3]=a;}

  // alpha identity + map stats
  let alphaMismatch=0;const hist=new Uint32Array(256);let irisPx=0;
  for(let i=0;i<W*H;i++){if(irisMap[i*4+3]!==I0.rgba[i*4+3])alphaMismatch++;
    if(irisMap[i*4+3]>0){hist[irisMap[i*4]]++;irisPx++;}}
  const pct=(q)=>{let acc=0,t=q*irisPx;for(let v=0;v<256;v++){acc+=hist[v];if(acc>=t)return v;}return 255;};
  if(alphaMismatch>0){console.error("ALPHA IDENTITY FAIL: "+alphaMismatch+"px. Nothing written.");process.exit(1);}
  writeFileSync(join(OUT,"eyes-iris-wp2-luminance.png"),encRGBA(W,H,irisMap));

  // ── 3. previews ──
  function baseCanvas(bg){const c=Buffer.alloc(W*H*3);for(let i=0;i<W*H;i++){c[i*3]=bg[0];c[i*3+1]=bg[1];c[i*3+2]=bg[2];}
    for(let i=0;i<W*H;i++){const a=B.rgba[i*4+3];if(a>0)over(c,i*3,B.rgba[i*4],B.rgba[i*4+1],B.rgba[i*4+2],a);}
    return c;}
  // eyes on base: tinted iris first (z4), fixed on top (z-paired above per brief §4.4)
  function withEyes(c,tokenRGB){
    for(let i=0;i<W*H;i++){const a=irisMap[i*4+3];if(a===0)continue;const L=irisMap[i*4]/255;
      over(c,i*3,Math.round(L*tokenRGB[0]),Math.round(L*tokenRGB[1]),Math.round(L*tokenRGB[2]),a);}
    for(let i=0;i<W*H;i++){const a=F0.rgba[i*4+3];if(a>0)over(c,i*3,F0.rgba[i*4],F0.rgba[i*4+1],F0.rgba[i*4+2],a);}
    return c;}
  function withHair(c){for(let i=0;i<W*H;i++){const a=Hc.rgba[i*4+3];if(a>0)over(c,i*3,Hc.rgba[i*4],Hc.rgba[i*4+1],Hc.rgba[i*4+2],a);}return c;}

  // 3a. tint sheet: eye crop × 6 preview colors (3×2)
  const cw=EYECROP.x1-EYECROP.x0+1,chh=EYECROP.y1-EYECROP.y0+1,COLS=3,ROWS=2,PAD=8;
  const names=Object.keys(EYE_PREVIEW);
  const sw=COLS*cw+(COLS+1)*PAD,sh=ROWS*chh+(ROWS+1)*PAD;
  const sheet=Buffer.alloc(sw*sh*3,235);
  names.forEach((n,k)=>{const t=withEyes(baseCanvas([255,255,255]),hex2rgb(EYE_PREVIEW[n]));
    const gx=(k%COLS)*(cw+PAD)+PAD,gy=((k/COLS)|0)*(chh+PAD)+PAD;
    for(let y=0;y<chh;y++)for(let x=0;x<cw;x++){const s=((EYECROP.y0+y)*W+(EYECROP.x0+x))*3,d=((gy+y)*sw+(gx+x))*3;
      sheet[d]=t[s];sheet[d+1]=t[s+1];sheet[d+2]=t[s+2];}});
  writeFileSync(join(OUT,"eyes-tint-sheet.png"),encRGB(sw,sh,sheet));

  // 3b. before/after eye crop: WP0 brown-art iris vs WP2 map × brown preview
  function withEyesWp0(c){
    for(let i=0;i<W*H;i++){const a=I0.rgba[i*4+3];if(a>0)over(c,i*3,I0.rgba[i*4],I0.rgba[i*4+1],I0.rgba[i*4+2],a);}
    for(let i=0;i<W*H;i++){const a=F0.rgba[i*4+3];if(a>0)over(c,i*3,F0.rgba[i*4],F0.rgba[i*4+1],F0.rgba[i*4+2],a);}
    return c;}
  const before=withEyesWp0(baseCanvas([255,255,255]));
  const after=withEyes(baseCanvas([255,255,255]),hex2rgb(EYE_PREVIEW.brown));
  const bw=2*cw+3*PAD,bh=chh+2*PAD,bb=Buffer.alloc(bw*bh*3,235);
  [before,after].forEach((img,k)=>{const gx=PAD+k*(cw+PAD);
    for(let y=0;y<chh;y++)for(let x=0;x<cw;x++){const s=((EYECROP.y0+y)*W+(EYECROP.x0+x))*3,d=((PAD+y)*bw+(gx+x))*3;
      bb[d]=img[s];bb[d+1]=img[s+1];bb[d+2]=img[s+2];}});
  writeFileSync(join(OUT,"iris-before-after.png"),encRGB(bw,bh,bb));

  // 3c. small sizes: brown + blue full avatar (with hair) at 64/48/32, ×4
  function scaleTo(img,hPx){const s=H/hPx,wPx=Math.round(W/s);const o=Buffer.alloc(wPx*hPx*3);
    for(let y=0;y<hPx;y++)for(let x=0;x<wPx;x++){let r=0,g=0,b=0,n=0;
      const y0=Math.floor(y*s),y1=Math.min(H,Math.ceil((y+1)*s)),x0=Math.floor(x*s),x1=Math.min(W,Math.ceil((x+1)*s));
      for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++){const i=(yy*W+xx)*3;r+=img[i];g+=img[i+1];b+=img[i+2];n++;}
      const d=(y*wPx+x)*3;o[d]=Math.round(r/n);o[d+1]=Math.round(g/n);o[d+2]=Math.round(b/n);}
    return {wPx,hPx,o};}
  const SIZES=[64,48,32],UP=4,GAP=12;
  const looks=[["brown",EYE_PREVIEW.brown],["blue",EYE_PREVIEW.blue]].map(([n,hx])=>withHair(withEyes(baseCanvas([255,255,255]),hex2rgb(hx))));
  const colW=Math.round(W/(H/64))*UP;
  const gridW=GAP+looks.length*(colW+GAP);
  const gridH=GAP+SIZES.reduce((a,v)=>a+v*UP+GAP,0);
  const grid=Buffer.alloc(gridW*gridH*3,235);
  looks.forEach((t,k)=>{let gy=GAP;
    SIZES.forEach((sz)=>{const sc=scaleTo(t,sz);const gx=GAP+k*(colW+GAP)+((colW-sc.wPx*UP)>>1);
      for(let y=0;y<sc.hPx*UP;y++)for(let x=0;x<sc.wPx*UP;x++){
        const s=(((y/UP)|0)*sc.wPx+((x/UP)|0))*3,d=((gy+y)*gridW+(gx+x))*3;
        grid[d]=sc.o[s];grid[d+1]=sc.o[s+1];grid[d+2]=sc.o[s+2];}
      gy+=sz*UP+GAP;});});
  writeFileSync(join(OUT,"eyes-tint-small.png"),encRGB(gridW,gridH,grid));

  // 3d. integration composite: D-057 + hair pair + eyes (brown preview)
  const full=withHair(withEyes(baseCanvas([255,255,255]),hex2rgb(EYE_PREVIEW.brown)));
  writeFileSync(join(OUT,"composite-full-look.png"),encRGB(W,H,full));
  const fullDark=withHair(withEyes(baseCanvas([38,40,46]),hex2rgb(EYE_PREVIEW.brown)));
  writeFileSync(join(OUT,"composite-full-look-on-dark.png"),encRGB(W,H,fullDark));

  // 3e. anchor check: crosshair the 164S centres on the iris map (eye crop, ×3)
  const UPX=3;
  const ac=Buffer.alloc(cw*UPX*chh*UPX*3,255);
  for(let y=0;y<chh*UPX;y++)for(let x=0;x<cw*UPX;x++){
    const sx=EYECROP.x0+((x/UPX)|0),sy=EYECROP.y0+((y/UPX)|0);const i=(sy*W+sx)*4;
    const d=(y*cw*UPX+x)*3;
    if(irisMap[i+3]>0){ac[d]=irisMap[i];ac[d+1]=irisMap[i+1];ac[d+2]=irisMap[i+2];}
    else if(F0.rgba[i+3]>0){ac[d]=F0.rgba[i];ac[d+1]=F0.rgba[i+1];ac[d+2]=F0.rgba[i+2];}}
  for(const c of IRIS_CENTERS){const cx=(c.x-EYECROP.x0)*UPX,cy=(c.y-EYECROP.y0)*UPX;
    for(let d=-12;d<=12;d++){
      const px=cx+d,py=cy;if(px>=0&&px<cw*UPX){const o=(py*cw*UPX+px)*3;ac[o]=255;ac[o+1]=0;ac[o+2]=0;}
      const px2=cx,py2=cy+d;if(py2>=0&&py2<chh*UPX){const o=(py2*cw*UPX+px2)*3;ac[o]=255;ac[o+1]=0;ac[o+2]=0;}}}
  writeFileSync(join(OUT,"anchor-check.png"),encRGB(cw*UPX,chh*UPX,ac));

  // ── 4. report ──
  writeFileSync(join(OUT,"wp2-eyes-report.json"),JSON.stringify({
    tool:"build-eyes-wp2-refine",
    task:"G3-WP2 — neutral-luminance iris refinement (deterministic, NON-AI)",
    specNote:"asset brief §4.4 authoritative: pupil stays IN the iris art (legible after tint); the eyes-report 'pupil-fixed split' note was inaccurate shorthand",
    inputs:{master:"Northstar Master.png",base:"neutral-base-v1-gate2-d053.png (D-057)",
      irisWp0:"eyes-neutral-iris.png (verified = tracked fixture)",
      fixedWp0:"eyes-neutral-fixed.png (verified = tracked fixture; UNCHANGED by WP2 — already D-021-complete)",
      hair:"pl1/hair-pl1-color.png (accepted Gate-3 hair candidate, integration view)"},
    irisAudit:{irisPx,outsideEyeBoxes:outsideBoxes,
      centroids:centroids.map(c=>({x:+c.x.toFixed(1),y:+c.y.toFixed(1)})),
      anchors164S:IRIS_CENTERS,centroidDistancePx:centerDist.map(d=>+d.toFixed(1)),tolerancePx:CENTER_TOL},
    luminanceMap:{model:"D-031 multiply (same as hair)",inputLuminance:{min:+lmin.toFixed(1),max:+lmax.toFixed(1)},
      band:[IRIS_LO,IRIS_HI],stats:{min:pct(0),p1:pct(0.01),p50:pct(0.50),p99:pct(0.99)},alphaMismatchVsWp0:alphaMismatch},
    previewColors:{note:"PROPOSAL for review only — NO runtime EYE_COLOR token set exists; adopting one is a separate owner/code decision",set:EYE_PREVIEW},
    outputs:["eyes-iris-wp2-luminance.png","eyes-tint-sheet.png","eyes-tint-small.png","iris-before-after.png",
      "composite-full-look.png","composite-full-look-on-dark.png","anchor-check.png"],
    boundaries:"review-only; NOT runtime assets; no promote; no assets/avatar-r2; no R2_MANIFEST; AVATAR_R2 false; Master/D-057/protect/WP0/PL/re-review outputs unchanged (WP2 map is a NEW file; fixed layer untouched)",
  },null,2));

  console.log("✔ WP2 neutral-luminance iris:");
  console.log("  iris px "+irisPx+" · outside eye boxes "+outsideBoxes+" · alpha mismatch vs WP0 "+alphaMismatch);
  console.log("  centroids "+centroids.map(c=>"("+c.x.toFixed(1)+","+c.y.toFixed(1)+")").join(" ")+" vs 164S anchors — dist "+centerDist.map(d=>d.toFixed(1)+"px").join(", ")+" (tol "+CENTER_TOL+") ✓");
  console.log("  input L "+lmin.toFixed(0)+"–"+lmax.toFixed(0)+" → band ["+IRIS_LO+","+IRIS_HI+"] · map p1 "+pct(0.01)+" p50 "+pct(0.50)+" p99 "+pct(0.99));
  console.log("  fixed layer: UNCHANGED (already D-021-complete)");
  console.log("  → wp2/eyes-iris-wp2-luminance.png · eyes-tint-sheet.png · iris-before-after.png · eyes-tint-small.png · composite-full-look(-on-dark).png · anchor-check.png");
}
main();
