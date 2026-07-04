// 167A Phase-2 Gate 3 — clean dedicated HAIR layer from the Master (deterministic, NON-AI).
// ---------------------------------------------------------------------------
// The earlier review hair-overlay was CONTAMINATED (brown detection also caught eyebrows,
// eye irises, ear line-work). Gate 3 needs a CLEAN hair layer = hair pixels ONLY, transparent
// over the face/eyes (so the separate face z3 / eyes z4 layers show through under hair z40).
//
// Method (no AI, hair IS the Master's brown pixels):
//   1. brown-detect hair in the head region (figure only),
//   2. HARD-EXCLUDE the lower-central face-feature zone (brows/eyes/nose/mouth) + the eye boxes,
//   3. connected-components → keep the large hair mass, drop isolated face blobs,
//   4. dilate + feather → clean alpha.
// Outputs (gitignored, review-only, NOT runtime assets):
//   hair-clean-color.png            (clean hair, colour, transparent bg — for review)
//   hair-northstar-v1-luminance.png (grayscale LUMINANCE MAP — the D-031 runtime target, first pass)
//   hair-clean-alone-on-gray.png    (hair alone on mid-grey → inspect for face-feature contamination)
//   review-iter7-clean-hair.png / -on-dark.png (iter7 base + CLEAN hair composite)
//   hair-clean-report.json
//
// NO promote, NO assets/avatar-r2 write, NO R2_MANIFEST change, AVATAR_R2 untouched, NO runtime code.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const PKG = join(HERE, "build", "phase2", "inpaint-v2-base");
const MASTER = join(REPO, "assets", "avatar", "reference", "Northstar Master.png");
const ITER7 = join(PKG, "body-neutral-medium-v2-candidate-iter7-shaded.png");
const W = 1024, H = 1536;

const HAIR_MAX_Y = 505;                                  // hair lives in the head zone
// lower-central face-feature exclude (brows/eyes/nose/mouth live here, below the natural hairline;
// side hair is outside this box and kept)
const FACE_EXCLUDE = { x0: 406, y0: 322, x1: 618, y1: 505, r: 40 };
const EYE_BOXES = [ { x0: 378, y0: 330, x1: 476, y1: 440 }, { x0: 531, y0: 330, x1: 629, y1: 440 } ];
const HAIR_DILATE = 2;
const KEEP_FRAC = 0.06;                                  // keep components ≥ 6% of the largest

function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
function decodePng(buf){let off=8,ihdr=null;const idat=[];while(off<buf.length){const len=buf.readUInt32BE(off);const type=buf.toString("ascii",off+4,off+8);const data=buf.subarray(off+8,off+8+len);if(type==="IHDR")ihdr={w:data.readUInt32BE(0),h:data.readUInt32BE(4),bit:data[8],ct:data[9],il:data[12]};else if(type==="IDAT")idat.push(data);else if(type==="IEND")break;off+=12+len;}const ch=ihdr.ct===6?4:3,{w,h}=ihdr,stride=w*ch;const raw=inflateSync(Buffer.concat(idat));const px=Buffer.alloc(h*stride);let prev=Buffer.alloc(stride),p=0;for(let y=0;y<h;y++){const f=raw[p++];const cur=raw.subarray(p,p+stride);p+=stride;const out=px.subarray(y*stride,y*stride+stride);for(let x=0;x<stride;x++){const a=x>=ch?out[x-ch]:0,b=prev[x],c=x>=ch?prev[x-ch]:0;let v=cur[x];if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4)v+=paeth(a,b,c);out[x]=v&0xff;}prev=out;}const rgba=Buffer.alloc(w*h*4);for(let i=0;i<w*h;i++){rgba[i*4]=px[i*ch];rgba[i*4+1]=px[i*ch+1];rgba[i*4+2]=px[i*ch+2];rgba[i*4+3]=ch===4?px[i*ch+3]:255;}return {w,h,rgba};}
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(b){let c=0xffffffff;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&0xff]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const T=Buffer.from(t,"ascii");const cc=Buffer.alloc(4);cc.writeUInt32BE(crc32(Buffer.concat([T,d])),0);return Buffer.concat([l,T,d,cc]);}
function encRGBA(w,h,rgba){const st=w*4,raw=Buffer.alloc(h*(st+1));for(let y=0;y<h;y++){raw[y*(st+1)]=0;rgba.copy(raw,y*(st+1)+1,y*st,y*st+st);}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);}
function encRGB(w,h,rgb){const st=w*3,raw=Buffer.alloc(h*(st+1));for(let y=0;y<h;y++){raw[y*(st+1)]=0;rgb.copy(raw,y*(st+1)+1,y*st,y*st+st);}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);}

const idx=(x,y)=>(y*W+x)*4;
const isFig=(px,i)=>{const r=px[i*4],g=px[i*4+1],b=px[i*4+2],a=px[i*4+3];return a>16&&!(r>=244&&g>=244&&b>=244);};
const isHair=(r,g,b)=>r>=48&&r<205&&g<r*0.93&&b<g*0.97&&(r-b)>=18&&r>g&&g>=b;
const inBox=(x,y,B)=>x>=B.x0&&x<=B.x1&&y>=B.y0&&y<=B.y1;
const inRR=(x,y,B)=>{if(x<B.x0||x>B.x1||y<B.y0||y>B.y1)return false;const cx=x<B.x0+B.r?B.x0+B.r:(x>B.x1-B.r?B.x1-B.r:x),cy=y<B.y0+B.r?B.y0+B.r:(y>B.y1-B.r?B.y1-B.r:y);return (cx===x&&cy===y)?true:(x-cx)**2+(y-cy)**2<=B.r*B.r;};
function dilate(m,r){if(r<=0)return m;const t=new Uint8Array(W*H),o=new Uint8Array(W*H);for(let y=0;y<H;y++)for(let x=0;x<W;x++){let v=0;for(let d=-r;d<=r;d++){const xx=x+d;if(xx>=0&&xx<W&&m[y*W+xx]){v=1;break;}}t[y*W+x]=v;}for(let y=0;y<H;y++)for(let x=0;x<W;x++){let v=0;for(let d=-r;d<=r;d++){const yy=y+d;if(yy>=0&&yy<H&&t[yy*W+x]){v=1;break;}}o[y*W+x]=v;}return o;}

function main(){
  const M=decodePng(readFileSync(MASTER));
  const B=decodePng(readFileSync(ITER7));

  // 1. raw brown-hair mask in head zone, minus face-feature exclusions
  const raw=new Uint8Array(W*H);let rawPx=0,excluded=0;
  for(let y=0;y<HAIR_MAX_Y;y++)for(let x=0;x<W;x++){const i=y*W+x;if(!isFig(M.rgba,i))continue;const r=M.rgba[i*4],g=M.rgba[i*4+1],b=M.rgba[i*4+2];if(!isHair(r,g,b))continue;
    if(inRR(x,y,FACE_EXCLUDE)||inBox(x,y,EYE_BOXES[0])||inBox(x,y,EYE_BOXES[1])){excluded++;continue;}
    raw[i]=1;rawPx++;}

  // 2. connected components (4-neighbour), keep large ones
  const lab=new Int32Array(W*H).fill(0);let nlab=0;const sizes=[0];
  const st=[];
  for(let i=0;i<W*H;i++){if(raw[i]&&!lab[i]){nlab++;let sz=0;st.push(i);lab[i]=nlab;while(st.length){const j=st.pop();sz++;const x=j%W,y=(j/W)|0;const nb=[x>0?j-1:-1,x<W-1?j+1:-1,y>0?j-W:-1,y<H-1?j+W:-1];for(const k of nb)if(k>=0&&raw[k]&&!lab[k]){lab[k]=nlab;st.push(k);}}sizes[nlab]=sz;}}
  let maxSz=0;for(let l=1;l<=nlab;l++)if(sizes[l]>maxSz)maxSz=sizes[l];
  const keep=new Uint8Array(nlab+1);for(let l=1;l<=nlab;l++)if(sizes[l]>=maxSz*KEEP_FRAC)keep[l]=1;
  const hair=new Uint8Array(W*H);let hairPx=0,dropped=0;
  for(let i=0;i<W*H;i++){if(raw[i]){if(keep[lab[i]]){hair[i]=1;hairPx++;}else dropped++;}}

  const hairD=dilate(hair,HAIR_DILATE);

  // 3a. clean COLOUR hair (Master colour, transparent bg)
  const colorHair=Buffer.alloc(W*H*4);
  for(let i=0;i<W*H;i++)if(hairD[i]){colorHair[i*4]=M.rgba[i*4];colorHair[i*4+1]=M.rgba[i*4+1];colorHair[i*4+2]=M.rgba[i*4+2];colorHair[i*4+3]=255;}
  writeFileSync(join(PKG,"hair-clean-color.png"),encRGBA(W,H,colorHair));

  // 3b. grayscale LUMINANCE MAP (D-031 runtime target, first pass): normalise hair luminance → [90,250]
  let lmin=255,lmax=0;for(let i=0;i<W*H;i++)if(hairD[i]){const L=0.299*M.rgba[i*4]+0.587*M.rgba[i*4+1]+0.114*M.rgba[i*4+2];if(L<lmin)lmin=L;if(L>lmax)lmax=L;}
  const lum=Buffer.alloc(W*H*4);const span=Math.max(1,lmax-lmin);
  for(let i=0;i<W*H;i++)if(hairD[i]){const L=0.299*M.rgba[i*4]+0.587*M.rgba[i*4+1]+0.114*M.rgba[i*4+2];const g=Math.round(((L-lmin)/span)*160+90);lum[i*4]=g;lum[i*4+1]=g;lum[i*4+2]=g;lum[i*4+3]=255;}
  writeFileSync(join(PKG,"hair-northstar-v1-luminance.png"),encRGBA(W,H,lum));

  // 3c. hair alone on mid-grey (contamination inspection)
  const gray=Buffer.alloc(W*H*3);for(let i=0;i<W*H;i++){gray[i*3]=128;gray[i*3+1]=128;gray[i*3+2]=128;}
  for(let i=0;i<W*H;i++)if(hairD[i]){gray[i*3]=M.rgba[i*4];gray[i*3+1]=M.rgba[i*4+1];gray[i*3+2]=M.rgba[i*4+2];}
  writeFileSync(join(PKG,"hair-clean-alone-on-gray.png"),encRGB(W,H,gray));

  // 4. composite iter7 base + CLEAN hair (white + dark)
  function compose(bg){const out=Buffer.alloc(W*H*3);for(let i=0;i<W*H;i++){out[i*3]=bg[0];out[i*3+1]=bg[1];out[i*3+2]=bg[2];}
    for(let i=0;i<W*H;i++){const a=B.rgba[i*4+3];if(a>0){const A=a/255;out[i*3]=Math.round(B.rgba[i*4]*A+out[i*3]*(1-A));out[i*3+1]=Math.round(B.rgba[i*4+1]*A+out[i*3+1]*(1-A));out[i*3+2]=Math.round(B.rgba[i*4+2]*A+out[i*3+2]*(1-A));}}
    for(let i=0;i<W*H;i++)if(hairD[i]){out[i*3]=M.rgba[i*4];out[i*3+1]=M.rgba[i*4+1];out[i*3+2]=M.rgba[i*4+2];}
    return out;}
  writeFileSync(join(PKG,"review-iter7-clean-hair.png"),encRGB(W,H,compose([255,255,255])));
  writeFileSync(join(PKG,"review-iter7-clean-hair-on-dark.png"),encRGB(W,H,compose([38,40,46])));

  // contamination check: any hair pixel inside the eye boxes after cleaning?
  let eyeContam=0;for(const Bx of EYE_BOXES)for(let y=Bx.y0;y<=Bx.y1;y++)for(let x=Bx.x0;x<=Bx.x1;x++)if(hairD[y*W+x])eyeContam++;

  writeFileSync(join(PKG,"hair-clean-report.json"),JSON.stringify({
    tool:"build-hair-clean",method:"deterministic clean hair extraction (brown-detect + face-exclude + connected-components), NON-AI",
    source:"Northstar Master.png",rawBrownPx:rawPx,faceFeatureExcludedPx:excluded,componentsFound:nlab,largestComponentPx:maxSz,
    keptComponents:keep.reduce((a,v)=>a+v,0),keptHairPx:hairPx,droppedIsolatedPx:dropped,dilatedHairPx:hairD.reduce((a,v)=>a+v,0),
    eyeBoxContaminationPx:eyeContam,luminanceRange:{min:+lmin.toFixed(1),max:+lmax.toFixed(1),mappedTo:"[90,250]"},
    outputs:["hair-clean-color.png","hair-northstar-v1-luminance.png","hair-clean-alone-on-gray.png","review-iter7-clean-hair.png","review-iter7-clean-hair-on-dark.png"],
    boundaries:"review-only; NOT a runtime asset; no promote; no assets/avatar-r2; no R2_MANIFEST; AVATAR_R2 false",
  },null,2));

  console.log("✔ clean hair layer extracted:");
  console.log("  raw brown px "+rawPx+" · face-feature excluded "+excluded+" · components "+nlab+" (largest "+maxSz+")");
  console.log("  kept "+keep.reduce((a,v)=>a+v,0)+" component(s) → hair "+hairPx+"px · dropped isolated blobs "+dropped+"px");
  console.log("  eye-box contamination after cleaning: "+eyeContam+"px "+(eyeContam===0?"(CLEAN ✓)":"(check!)"));
  console.log("  luminance map range "+lmin.toFixed(0)+"–"+lmax.toFixed(0)+" → [90,250]");
  console.log("  → hair-clean-color.png · hair-northstar-v1-luminance.png · review-iter7-clean-hair(.png/-on-dark) · hair-clean-alone-on-gray.png");
}
main();
