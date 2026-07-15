// 167A Phase-2 Gate 3 — FACE / EXPRESSION layer (neutral) from the Master (deterministic, NON-AI).
// ---------------------------------------------------------------------------
// The face layer (z3, D-022) carries ONLY the stable non-eye features: eyebrows + nose + mouth
// (+ optional multiply blush). NO eyes/irises/pupils/sclera, NO hair, NO outfit, NO skin-fill.
// Tone-agnostic: keeps the dark feature line-work only, transparent everywhere else.
//
// Challenge: brows are brown like the hair bangs, and nose/mouth are subtle. Method:
//   * region boxes for brows / nose / mouth (from the anchors + measurement),
//   * HARD-exclude the eye boxes (no eye pixels),
//   * EXCLUDE the hair mass (largest brown connected component — removes the bangs that overlap
//     the brow band; the isolated brows/nose/mouth remain),
//   * keep non-skin / non-white dark feature pixels only,
//   * connected-components → drop stray speckles.
//
// Inputs (tracked): assets/avatar/reference/Northstar Master.png + the D-057 Gate-2 base
//   (assets/avatar/reference/neutral-base-v1-gate2-d053.png) as the composite base; hair/eyes
//   chain inputs primary = fresh gate3-d057 outputs, fallback = tools/avatar/fixtures/face-clean/.
//   Outputs go to the gitignored tools/avatar/build/ scratch dir.
//
// Outputs (gitignored, review-only, NOT runtime assets):
//   face-neutral-v1.png · face-neutral-on-gray.png
//   review-d057-hair-eyes-face.png / -on-dark.png · face-neutral-report.json
//
// NO promote, NO assets/avatar-r2 write, NO R2_MANIFEST change, AVATAR_R2 untouched, NO runtime code.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const PKG = join(HERE, "build", "phase2", "gate3-d057");     // gitignored review-output dir (tools/avatar/build/, never committed)
const FIX = join(HERE, "fixtures", "face-clean");            // tracked input assets (fallback pipeline inputs, committed)
const MASTER = join(REPO, "assets", "avatar", "reference", "Northstar Master.png");
// WP0 (G3-WP0): composite base = the tracked D-057 Gate-2 neutral base (sha 2CB93EE0…), replacing
// the superseded iter7 fixture (D-043). Face EXTRACTION still reads only the Master.
const ITER7 = join(REPO, "assets", "avatar", "reference", "neutral-base-v1-gate2-d053.png");
// chain inputs: primary = fresh gate3-d057 outputs (hair/eyes steps); fallback = tracked fixtures
const fromChain = (name) => existsSync(join(PKG, name)) ? join(PKG, name) : join(FIX, name);
const HAIRCOLOR = fromChain("hair-clean-color.png");
const EYESCOMB = fromChain("eyes-neutral-fixed.png"); // for composite (eyes = fixed+iris; use combined via both)
const EYESIRIS = fromChain("eyes-neutral-iris.png");
const W = 1024, H = 1536;

// feature regions (measured on the Master; brows just above the eye boxes y336, nose+mouth central-lower)
const BROW   = { x0: 396, y0: 306, x1: 632, y1: 340 };   // both brows band (above eyes)
// measured: tiny nose ~y440-460; the smile curve is y462-476; the chin/jaw outline is y514+ (excluded)
const NOSE   = { x0: 494, y0: 438, x1: 532, y1: 461 };
const MOUTH  = { x0: 474, y0: 461, x1: 552, y1: 481 };
const EYE_BOXES = [ { x0: 374, y0: 332, x1: 480, y1: 440 }, { x0: 527, y0: 332, x1: 633, y1: 440 } ];
const HAIR_MAX_Y = 505;

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
const isHairCol=(r,g,b)=>r>=48&&r<205&&g<r*0.93&&b<g*0.97&&(r-b)>=18&&r>g&&g>=b;
const inBox=(x,y,B)=>x>=B.x0&&x<=B.x1&&y>=B.y0&&y<=B.y1;

function main(){
  mkdirSync(PKG, { recursive: true }); // ensure the gitignored output dir exists (fresh clone has no build/)
  const M=decodePng(readFileSync(MASTER));
  const B=decodePng(readFileSync(ITER7));
  const Hc=decodePng(readFileSync(HAIRCOLOR));
  const Ef=decodePng(readFileSync(EYESCOMB));
  const Ei=decodePng(readFileSync(EYESIRIS));

  // hair mass (largest brown connected component in the head zone) — to exclude the bangs
  const hairRaw=new Uint8Array(W*H);
  for(let y=0;y<HAIR_MAX_Y;y++)for(let x=0;x<W;x++){const i=y*W+x;if(!isFig(M.rgba,i))continue;const r=M.rgba[i*4],g=M.rgba[i*4+1],b=M.rgba[i*4+2];if(isHairCol(r,g,b))hairRaw[i]=1;}
  const lab=new Int32Array(W*H);let nl=0;const sz=[0];const st=[];
  for(let i=0;i<W*H;i++){if(hairRaw[i]&&!lab[i]){nl++;let s=0;st.push(i);lab[i]=nl;while(st.length){const j=st.pop();s++;const x=j%W,y=(j/W)|0;const nb=[x>0?j-1:-1,x<W-1?j+1:-1,y>0?j-W:-1,y<H-1?j+W:-1];for(const k of nb)if(k>=0&&hairRaw[k]&&!lab[k]){lab[k]=nl;st.push(k);}}sz[nl]=s;}}
  let mx=0,ml=0;for(let l=1;l<=nl;l++)if(sz[l]>mx){mx=sz[l];ml=l;}
  const hairMass=new Uint8Array(W*H);for(let i=0;i<W*H;i++)if(hairRaw[i]&&lab[i]===ml)hairMass[i]=1;

  // feature extraction in the brow / nose / mouth regions
  const feat=new Uint8Array(W*H);const inRegion=(x,y)=>inBox(x,y,BROW)||inBox(x,y,NOSE)||inBox(x,y,MOUTH);
  let browN=0,noseN=0,mouthN=0;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(!inRegion(x,y))continue;const i=y*W+x;if(!isFig(M.rgba,i))continue;
    if(hairMass[i])continue;                                   // exclude hair bangs
    if(inBox(x,y,EYE_BOXES[0])||inBox(x,y,EYE_BOXES[1]))continue; // exclude eyes
    const r=M.rgba[i*4],g=M.rgba[i*4+1],b=M.rgba[i*4+2];
    if(isSkin(r,g,b)||isWhite(r,g,b))continue;                 // keep only non-skin feature line-work
    feat[i]=1;if(inBox(x,y,BROW))browN++;else if(inBox(x,y,NOSE))noseN++;else mouthN++;}

  // connected-components → drop tiny stray speckles
  const flab=new Int32Array(W*H);let fnl=0;const fsz=[0];
  for(let i=0;i<W*H;i++){if(feat[i]&&!flab[i]){fnl++;let s=0;st.push(i);flab[i]=fnl;while(st.length){const j=st.pop();s++;const x=j%W,y=(j/W)|0;const nb=[x>0?j-1:-1,x<W-1?j+1:-1,y>0?j-W:-1,y<H-1?j+W:-1];for(const k of nb)if(k>=0&&feat[k]&&!flab[k]){flab[k]=fnl;st.push(k);}}fsz[fnl]=s;}}
  const KEEP_MIN=25;let kept=0,strays=0;
  const face=Buffer.alloc(W*H*4);
  for(let i=0;i<W*H;i++){if(!feat[i])continue;if(fsz[flab[i]]>=KEEP_MIN){face[i*4]=M.rgba[i*4];face[i*4+1]=M.rgba[i*4+1];face[i*4+2]=M.rgba[i*4+2];face[i*4+3]=255;kept++;}else strays++;}
  writeFileSync(join(PKG,"face-neutral-v1.png"),encRGBA(W,H,face));

  // on grey
  const gray=Buffer.alloc(W*H*3);for(let i=0;i<W*H;i++){gray[i*3]=128;gray[i*3+1]=128;gray[i*3+2]=128;}
  for(let i=0;i<W*H;i++)if(face[i*4+3]){gray[i*3]=face[i*4];gray[i*3+1]=face[i*4+1];gray[i*3+2]=face[i*4+2];}
  writeFileSync(join(PKG,"face-neutral-on-gray.png"),encRGB(W,H,gray));

  // full composite: base → face(z3) → eyes(z4: iris then fixed) → hair(z40)
  function over(out,i,px){const a=px[i*4+3];if(a<=0)return;const A=a/255;out[i*3]=Math.round(px[i*4]*A+out[i*3]*(1-A));out[i*3+1]=Math.round(px[i*4+1]*A+out[i*3+1]*(1-A));out[i*3+2]=Math.round(px[i*4+2]*A+out[i*3+2]*(1-A));}
  function compose(bg){const out=Buffer.alloc(W*H*3);for(let i=0;i<W*H;i++){out[i*3]=bg[0];out[i*3+1]=bg[1];out[i*3+2]=bg[2];}
    for(let i=0;i<W*H;i++)over(out,i,B.rgba);      // base
    for(let i=0;i<W*H;i++)over(out,i,face);        // face features z3
    for(let i=0;i<W*H;i++)over(out,i,Ei.rgba);     // eyes iris z4
    for(let i=0;i<W*H;i++)over(out,i,Ef.rgba);     // eyes fixed z4 (sclera+lash+catchlight on top)
    for(let i=0;i<W*H;i++)over(out,i,Hc.rgba);     // hair z40
    return out;}
  writeFileSync(join(PKG,"review-d057-hair-eyes-face.png"),encRGB(W,H,compose([255,255,255])));
  writeFileSync(join(PKG,"review-d057-hair-eyes-face-on-dark.png"),encRGB(W,H,compose([38,40,46])));

  // contamination checks
  let eyeContam=0;for(const Bx of EYE_BOXES)for(let y=Bx.y0;y<=Bx.y1;y++)for(let x=Bx.x0;x<=Bx.x1;x++)if(face[(y*W+x)*4+3])eyeContam++;
  let hairContam=0;for(let i=0;i<W*H;i++)if(face[i*4+3]&&hairMass[i])hairContam++;

  writeFileSync(join(PKG,"face-neutral-report.json"),JSON.stringify({
    tool:"build-face-clean",method:"deterministic region-based face-feature extraction (brows/nose/mouth), hair-mass + eye-box excluded, NON-AI, first pass",
    regions:{BROW,NOSE,MOUTH},rawFeaturePx:{brow:browN,nose:noseN,mouth:mouthN},keptPx:kept,strayDroppedPx:strays,
    eyeBoxContaminationPx:eyeContam,hairContaminationPx:hairContam,
    notes:"blush (multiply) not extracted (subtle; optional refinement). nose is minimal in the Master. Face layer = dark feature line-work only, tone-agnostic (D-022).",
    outputs:["face-neutral-v1.png","face-neutral-on-gray.png","review-d057-hair-eyes-face.png","review-d057-hair-eyes-face-on-dark.png"],
    boundaries:"review-only; NOT runtime assets; no promote; no assets/avatar-r2; no R2_MANIFEST; AVATAR_R2 false",
  },null,2));

  console.log("✔ face/expression layer extracted (first pass):");
  console.log("  raw feature px — brow "+browN+" · nose "+noseN+" · mouth "+mouthN);
  console.log("  kept "+kept+"px · stray speckles dropped "+strays+"px");
  console.log("  eye-box contamination "+eyeContam+"px "+(eyeContam===0?"(CLEAN ✓)":"(check!)")+" · hair contamination "+hairContam+"px "+(hairContam===0?"(CLEAN ✓)":"(check!)"));
  console.log("  → face-neutral-v1.png · face-neutral-on-gray.png · review-d057-hair-eyes-face(.png/-on-dark)");
}
main();
