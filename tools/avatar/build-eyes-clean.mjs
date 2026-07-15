// 167A Phase-2 Gate 3 — EYES layer(s) from the Master (deterministic, NON-AI).
// ---------------------------------------------------------------------------
// Eyes are a 2-file decomposition (D-021/D-015): iris (tintable) + fixed (sclera + lash/shape
// + catch-light + pupil). The Master is large-eye anime: the iris/pupil is a big DARK mass
// (near-black + brown rim) with a white catch-light inside a thin white sclera, framed by a
// dark lash/outline. Clean iris/pupil/lash separation is therefore APPROXIMATE (dark tones
// overlap) — this is an honest FIRST PASS.
//
// Method (per eye box, from the 164L/164S anchors):
//   eyeContent = box ∧ figure ∧ NOT skin      (= white sclera/catchlight ∪ dark iris/pupil/lash)
//   white  = sclera + catch-light             → FIXED
//   dark   = iris + pupil + lash              → split by boundary erosion:
//     lash/outline = dark on the eyeContent boundary ring → FIXED (eye shape)
//     iris interior = dark not on the boundary            → IRIS (tintable; pupil included, 1st pass)
//
// Outputs (gitignored, review-only, NOT runtime assets):
//   eyes-neutral-fixed.png   (sclera + catch-light + lash/outline, transparent bg)
//   eyes-neutral-iris.png    (iris interior, tintable — Master brown default, transparent bg)
//   eyes-combined-on-gray.png (iris + fixed = full eyes, on grey — inspection)
//   review-d057-hair-eyes.png / -on-dark.png (D-057 base + eyes + clean hair composite)
//   eyes-report.json
//
// NO promote, NO assets/avatar-r2 write, NO R2_MANIFEST change, AVATAR_R2 untouched, NO runtime code.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const PKG = join(HERE, "build", "phase2", "gate3-d057");
const FIX = join(HERE, "fixtures", "face-clean");   // tracked fixtures (fallback inputs, committed)
const MASTER = join(REPO, "assets", "avatar", "reference", "Northstar Master.png");
// WP0 (G3-WP0): composite base = the tracked D-057 Gate-2 neutral base (sha 2CB93EE0…), replacing
// the invalidated iter7 candidate (D-043). Eye EXTRACTION still reads only the Master.
const ITER7 = join(REPO, "assets", "avatar", "reference", "neutral-base-v1-gate2-d053.png");
// clean hair layer from Gate 3 step 1: primary = fresh gate3-d057 output; fallback = tracked fixture
const HAIRCOLOR = existsSync(join(PKG, "hair-clean-color.png"))
  ? join(PKG, "hair-clean-color.png")
  : join(FIX, "hair-clean-color.png");
const W = 1024, H = 1536;

// eye boxes (164L), padded 4px to catch the full eye
const EYES = [ { x0: 374, y0: 332, x1: 480, y1: 440 }, { x0: 527, y0: 332, x1: 633, y1: 440 } ];
const LASH_ERODE = 4;

function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
function decodePng(buf){let off=8,ihdr=null;const idat=[];while(off<buf.length){const len=buf.readUInt32BE(off);const type=buf.toString("ascii",off+4,off+8);const data=buf.subarray(off+8,off+8+len);if(type==="IHDR")ihdr={w:data.readUInt32BE(0),h:data.readUInt32BE(4),bit:data[8],ct:data[9],il:data[12]};else if(type==="IDAT")idat.push(data);else if(type==="IEND")break;off+=12+len;}const ch=ihdr.ct===6?4:3,{w,h}=ihdr,stride=w*ch;const raw=inflateSync(Buffer.concat(idat));const px=Buffer.alloc(h*stride);let prev=Buffer.alloc(stride),p=0;for(let y=0;y<h;y++){const f=raw[p++];const cur=raw.subarray(p,p+stride);p+=stride;const out=px.subarray(y*stride,y*stride+stride);for(let x=0;x<stride;x++){const a=x>=ch?out[x-ch]:0,b=prev[x],c=x>=ch?prev[x-ch]:0;let v=cur[x];if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4)v+=paeth(a,b,c);out[x]=v&0xff;}prev=out;}const rgba=Buffer.alloc(w*h*4);for(let i=0;i<w*h;i++){rgba[i*4]=px[i*ch];rgba[i*4+1]=px[i*ch+1];rgba[i*4+2]=px[i*ch+2];rgba[i*4+3]=ch===4?px[i*ch+3]:255;}return {w,h,rgba};}
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(b){let c=0xffffffff;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&0xff]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const T=Buffer.from(t,"ascii");const cc=Buffer.alloc(4);cc.writeUInt32BE(crc32(Buffer.concat([T,d])),0);return Buffer.concat([l,T,d,cc]);}
function encRGBA(w,h,rgba){const st=w*4,raw=Buffer.alloc(h*(st+1));for(let y=0;y<h;y++){raw[y*(st+1)]=0;rgba.copy(raw,y*(st+1)+1,y*st,y*st+st);}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);}
function encRGB(w,h,rgb){const st=w*3,raw=Buffer.alloc(h*(st+1));for(let y=0;y<h;y++){raw[y*(st+1)]=0;rgb.copy(raw,y*(st+1)+1,y*st,y*st+st);}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);}

const idx=(x,y)=>(y*W+x)*4;
const isFig=(px,i)=>{const r=px[i*4],g=px[i*4+1],b=px[i*4+2],a=px[i*4+3];return a>16&&!(r>=244&&g>=244&&b>=244);};
const isSkin=(r,g,b)=>r>=205&&r>g&&g>=b&&(r-b)>=28&&(r-b)<=135&&g>r*0.70;
const isWhite=(r,g,b)=>r>=228&&g>=216&&b>=196;
// erode a 0/1 mask by r (min filter)
function erode(m,r){const t=new Uint8Array(W*H),o=new Uint8Array(W*H);for(let y=0;y<H;y++)for(let x=0;x<W;x++){let v=1;for(let d=-r;d<=r;d++){const xx=x+d;if(xx<0||xx>=W||!m[y*W+xx]){v=0;break;}}t[y*W+x]=v;}for(let y=0;y<H;y++)for(let x=0;x<W;x++){let v=1;for(let d=-r;d<=r;d++){const yy=y+d;if(yy<0||yy>=H||!t[yy*W+x]){v=0;break;}}o[y*W+x]=v;}return o;}

function main(){
  mkdirSync(PKG, { recursive: true }); // ensure the gitignored output dir exists (fresh clone has no build/)
  const M=decodePng(readFileSync(MASTER));
  const B=decodePng(readFileSync(ITER7));
  const Hc=decodePng(readFileSync(HAIRCOLOR));

  const content=new Uint8Array(W*H), white=new Uint8Array(W*H), dark=new Uint8Array(W*H);
  for(const e of EYES)for(let y=e.y0;y<=e.y1;y++)for(let x=e.x0;x<=e.x1;x++){const i=y*W+x;if(!isFig(M.rgba,i))continue;const r=M.rgba[i*4],g=M.rgba[i*4+1],b=M.rgba[i*4+2];
    if(isSkin(r,g,b))continue;                       // surrounding eyelid skin — excluded
    content[i]=1;}

  // connected-components cleanup: keep the eye blobs, drop stray speckles (eyelid-crease / lash wisps)
  const lab=new Int32Array(W*H);let nlab=0;const sizes=[0];const st=[];
  for(let i=0;i<W*H;i++){if(content[i]&&!lab[i]){nlab++;let sz=0;st.push(i);lab[i]=nlab;while(st.length){const j=st.pop();sz++;const x=j%W,y=(j/W)|0;const nb=[x>0?j-1:-1,x<W-1?j+1:-1,y>0?j-W:-1,y<H-1?j+W:-1];for(const k of nb)if(k>=0&&content[k]&&!lab[k]){lab[k]=nlab;st.push(k);}}sizes[nlab]=sz;}}
  let maxSz=0;for(let l=1;l<=nlab;l++)if(sizes[l]>maxSz)maxSz=sizes[l];
  const keep=new Uint8Array(nlab+1);for(let l=1;l<=nlab;l++)if(sizes[l]>=maxSz*0.15)keep[l]=1; // ≥15% of largest = the 2 eyes
  let cN=0,wN=0,dN=0,strayDropped=0;
  for(let i=0;i<W*H;i++){if(!content[i])continue;if(!keep[lab[i]]){content[i]=0;strayDropped++;continue;}cN++;
    const r=M.rgba[i*4],g=M.rgba[i*4+1],b=M.rgba[i*4+2];if(isWhite(r,g,b)){white[i]=1;wN++;}else{dark[i]=1;dN++;}}

  // lash/outline = dark on the eyeContent boundary ring (contentEroded removed)
  const contentEr=erode(content,LASH_ERODE);
  const lash=new Uint8Array(W*H), iris=new Uint8Array(W*H);let lN=0,iN=0;
  for(let i=0;i<W*H;i++){if(!dark[i])continue;if(contentEr[i]){iris[i]=1;iN++;}else{lash[i]=1;lN++;}}

  // FIXED = white (sclera+catchlight) + lash/outline ; IRIS = interior dark (tintable)
  const fixed=Buffer.alloc(W*H*4), irisB=Buffer.alloc(W*H*4);
  for(let i=0;i<W*H;i++){
    if(white[i]||lash[i]){fixed[i*4]=M.rgba[i*4];fixed[i*4+1]=M.rgba[i*4+1];fixed[i*4+2]=M.rgba[i*4+2];fixed[i*4+3]=255;}
    if(iris[i]){irisB[i*4]=M.rgba[i*4];irisB[i*4+1]=M.rgba[i*4+1];irisB[i*4+2]=M.rgba[i*4+2];irisB[i*4+3]=255;}
  }
  writeFileSync(join(PKG,"eyes-neutral-fixed.png"),encRGBA(W,H,fixed));
  writeFileSync(join(PKG,"eyes-neutral-iris.png"),encRGBA(W,H,irisB));

  // combined on grey (inspection)
  const gray=Buffer.alloc(W*H*3);for(let i=0;i<W*H;i++){gray[i*3]=128;gray[i*3+1]=128;gray[i*3+2]=128;}
  for(let i=0;i<W*H;i++)if(content[i]){gray[i*3]=M.rgba[i*4];gray[i*3+1]=M.rgba[i*4+1];gray[i*3+2]=M.rgba[i*4+2];}
  writeFileSync(join(PKG,"eyes-combined-on-gray.png"),encRGB(W,H,gray));

  // composite: base(D-057) → eyes(z4) → clean hair(z40)
  function over(out,i,px,pi){const a=px[pi*4+3];if(a<=0)return;const A=a/255;out[i*3]=Math.round(px[pi*4]*A+out[i*3]*(1-A));out[i*3+1]=Math.round(px[pi*4+1]*A+out[i*3+1]*(1-A));out[i*3+2]=Math.round(px[pi*4+2]*A+out[i*3+2]*(1-A));}
  function compose(bg){const out=Buffer.alloc(W*H*3);for(let i=0;i<W*H;i++){out[i*3]=bg[0];out[i*3+1]=bg[1];out[i*3+2]=bg[2];}
    for(let i=0;i<W*H;i++)over(out,i,B.rgba,i);                                   // base
    for(let i=0;i<W*H;i++)if(content[i]){out[i*3]=M.rgba[i*4];out[i*3+1]=M.rgba[i*4+1];out[i*3+2]=M.rgba[i*4+2];} // eyes
    for(let i=0;i<W*H;i++)over(out,i,Hc.rgba,i);                                  // clean hair on top
    return out;}
  writeFileSync(join(PKG,"review-d057-hair-eyes.png"),encRGB(W,H,compose([255,255,255])));
  writeFileSync(join(PKG,"review-d057-hair-eyes-on-dark.png"),encRGB(W,H,compose([38,40,46])));

  writeFileSync(join(PKG,"eyes-report.json"),JSON.stringify({
    tool:"build-eyes-clean",method:"deterministic eye extraction from Master eye boxes (NON-AI, first pass)",
    note:"Large-eye anime: iris/pupil is a dark mass; iris/pupil/lash separation is APPROXIMATE. iris layer includes the pupil (D-015 pupil-fixed split = refinement). iris is Master-brown default; a tint-neutral iris map = refinement.",
    eyeBoxes:EYES,eyeContentPx:cN,whitePx:wN,darkPx:dN,lashOutlinePx:lN,irisInteriorPx:iN,strayDroppedPx:strayDropped,componentsFound:nlab,
    outputs:["eyes-neutral-fixed.png","eyes-neutral-iris.png","eyes-combined-on-gray.png","review-d057-hair-eyes.png","review-d057-hair-eyes-on-dark.png"],
    boundaries:"review-only; NOT runtime assets; no promote; no assets/avatar-r2; no R2_MANIFEST; AVATAR_R2 false",
  },null,2));

  console.log("✔ eyes layer extracted (first pass):");
  console.log("  eye content "+cN+"px  = white(sclera+catchlight) "+wN+" + dark(iris/pupil/lash) "+dN);
  console.log("  split → FIXED = white + lash/outline "+lN+"px ; IRIS interior "+iN+"px (tintable, brown default)");
  console.log("  → eyes-neutral-fixed.png · eyes-neutral-iris.png · eyes-combined-on-gray.png · review-d057-hair-eyes(.png/-on-dark)");
}
main();
