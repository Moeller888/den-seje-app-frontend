// 167A Phase-2 Gate 2 — REVIEW-ONLY composition: iter5 base UNDER a Master hair overlay.
// ---------------------------------------------------------------------------
// Purpose: judge whether the iter5 carved base is acceptable ONCE the North Star hair
// layer sits on top (which hides the flat scalp / carved crown). The hair overlay here
// is a REVIEW ARTIFACT extracted deterministically from the Master (brown-hair detection)
// — it is NOT a runtime asset and NOT the real decomposed hair layer.
//
// Outputs (gitignored build package):
//   review-iter6-under-hair.png             (iter5 + hair, over white)
//   review-iter6-under-hair-with-master-ghost.png  (+ faint Master outline for alignment)
//   review-iter6-under-hair-on-dark.png     (over dark bg → reveals alpha/silhouette gaps)
//   hair-overlay-from-master.png            (the extracted hair overlay, RGBA)
//
// NO ComfyUI, NO promote, NO assets/avatar-r2 write, NO R2_MANIFEST change, AVATAR_R2
// untouched. All candidate files kept.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const PKG = join(HERE, "build", "phase2", "inpaint-v2-base");
const MASTER = join(REPO, "assets", "avatar", "reference", "Northstar Master.png");
const ITER5 = join(PKG, "body-neutral-medium-v2-candidate-iter6-lowerhead.png");
const W = 1024, H = 1536;
const HAIR_MAX_Y = 540;   // hair lives in the head zone only
const HAIR_DILATE = 3;

function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
function decodePng(buf){
  let off=8,ihdr=null;const idat=[];
  while(off<buf.length){const len=buf.readUInt32BE(off);const type=buf.toString("ascii",off+4,off+8);const data=buf.subarray(off+8,off+8+len);
    if(type==="IHDR")ihdr={w:data.readUInt32BE(0),h:data.readUInt32BE(4),bit:data[8],ct:data[9],il:data[12]};
    else if(type==="IDAT")idat.push(data);else if(type==="IEND")break;off+=12+len;}
  if(!ihdr||ihdr.bit!==8||ihdr.il!==0||(ihdr.ct!==2&&ihdr.ct!==6))throw new Error("bad PNG "+JSON.stringify(ihdr));
  const ch=ihdr.ct===6?4:3,{w,h}=ihdr,stride=w*ch;const raw=inflateSync(Buffer.concat(idat));
  const px=Buffer.alloc(h*stride);let prev=Buffer.alloc(stride),p=0;
  for(let y=0;y<h;y++){const f=raw[p++];const cur=raw.subarray(p,p+stride);p+=stride;const out=px.subarray(y*stride,y*stride+stride);
    for(let x=0;x<stride;x++){const a=x>=ch?out[x-ch]:0,b=prev[x],c=x>=ch?prev[x-ch]:0;let v=cur[x];if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4)v+=paeth(a,b,c);out[x]=v&0xff;}
    prev=out;}
  const rgba=Buffer.alloc(w*h*4);
  for(let i=0;i<w*h;i++){rgba[i*4]=px[i*ch];rgba[i*4+1]=px[i*ch+1];rgba[i*4+2]=px[i*ch+2];rgba[i*4+3]=ch===4?px[i*ch+3]:255;}
  return {w,h,rgba};
}
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(b){let c=0xffffffff;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&0xff]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const T=Buffer.from(t,"ascii");const cc=Buffer.alloc(4);cc.writeUInt32BE(crc32(Buffer.concat([T,d])),0);return Buffer.concat([l,T,d,cc]);}
function encRGBA(w,h,rgba){const st=w*4,raw=Buffer.alloc(h*(st+1));for(let y=0;y<h;y++){raw[y*(st+1)]=0;rgba.copy(raw,y*(st+1)+1,y*st,y*st+st);}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);}
function encRGB(w,h,rgb){const st=w*3,raw=Buffer.alloc(h*(st+1));for(let y=0;y<h;y++){raw[y*(st+1)]=0;rgb.copy(raw,y*(st+1)+1,y*st,y*st+st);}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);}

const isFig=(px,i)=>{const r=px[i*4],g=px[i*4+1],b=px[i*4+2],a=px[i*4+3];return a>16&&!(r>=244&&g>=244&&b>=244);};
const isHair=(r,g,b)=>r>=48&&r<205&&g<r*0.93&&b<g*0.97&&(r-b)>=18&&r>g&&g>=b;
function dilate(m,r){if(r<=0)return m;const t=new Uint8Array(W*H),o=new Uint8Array(W*H);for(let y=0;y<H;y++)for(let x=0;x<W;x++){let v=0;for(let d=-r;d<=r;d++){const xx=x+d;if(xx>=0&&xx<W&&m[y*W+xx]){v=255;break;}}t[y*W+x]=v;}for(let y=0;y<H;y++)for(let x=0;x<W;x++){let v=0;for(let d=-r;d<=r;d++){const yy=y+d;if(yy>=0&&yy<H&&t[yy*W+x]){v=255;break;}}o[y*W+x]=v;}return o;}

// alpha-composite src(rgb,a) over dst(rgb) → dst
function over(dst,i,r,g,b,a){const A=a/255;dst[i*3]=Math.round(r*A+dst[i*3]*(1-A));dst[i*3+1]=Math.round(g*A+dst[i*3+1]*(1-A));dst[i*3+2]=Math.round(b*A+dst[i*3+2]*(1-A));}

function main(){
  const M=decodePng(readFileSync(MASTER));
  const B=decodePng(readFileSync(ITER5));
  if(B.w!==W||B.h!==H)throw new Error("iter5 dims");

  // ── extract hair overlay from Master ──
  let hair=new Uint8Array(W*H);let hairPx=0;
  for(let y=0;y<HAIR_MAX_Y;y++)for(let x=0;x<W;x++){const i=y*W+x;if(!isFig(M.rgba,i))continue;const r=M.rgba[i*4],g=M.rgba[i*4+1],b=M.rgba[i*4+2];if(isHair(r,g,b)){hair[i]=255;hairPx++;}}
  hair=dilate(hair,HAIR_DILATE);
  const hairRGBA=Buffer.alloc(W*H*4);
  for(let i=0;i<W*H;i++){if(hair[i]){hairRGBA[i*4]=M.rgba[i*4];hairRGBA[i*4+1]=M.rgba[i*4+1];hairRGBA[i*4+2]=M.rgba[i*4+2];hairRGBA[i*4+3]=255;}}
  writeFileSync(join(PKG,"hair-overlay-from-master.png"),encRGBA(W,H,hairRGBA));

  // ── composite helper: iter5 base over bg, then hair on top ──
  function compose(bg){
    const out=Buffer.alloc(W*H*3);
    for(let i=0;i<W*H;i++){out[i*3]=bg[0];out[i*3+1]=bg[1];out[i*3+2]=bg[2];}
    for(let i=0;i<W*H;i++){const a=B.rgba[i*4+3];if(a>0)over(out,i,B.rgba[i*4],B.rgba[i*4+1],B.rgba[i*4+2],a);}   // iter5 base
    for(let i=0;i<W*H;i++){if(hair[i])over(out,i,hairRGBA[i*4],hairRGBA[i*4+1],hairRGBA[i*4+2],255);}              // hair on top
    return out;
  }

  const white=compose([255,255,255]);
  writeFileSync(join(PKG,"review-iter6-under-hair.png"),encRGB(W,H,white));

  const dark=compose([38,40,46]);
  writeFileSync(join(PKG,"review-iter6-under-hair-on-dark.png"),encRGB(W,H,dark));

  // ── ghost: white composite + Master silhouette OUTLINE (cyan) for alignment ──
  const ghost=Buffer.from(white);
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;if(!isFig(M.rgba,i))continue;
    const edge=!isFig(M.rgba,i-1)||!isFig(M.rgba,i+1)||!isFig(M.rgba,i-W)||!isFig(M.rgba,i+W);
    if(edge){ghost[i*3]=0;ghost[i*3+1]=190;ghost[i*3+2]=220;}}
  writeFileSync(join(PKG,"review-iter6-under-hair-with-master-ghost.png"),encRGB(W,H,ghost));

  console.log("✔ review composition written (review-only, not runtime):");
  console.log("  hair overlay px (Master brown detection): "+hairPx);
  console.log("  review-iter6-under-hair.png");
  console.log("  review-iter6-under-hair-with-master-ghost.png (cyan = Master outline)");
  console.log("  review-iter6-under-hair-on-dark.png");
  console.log("  hair-overlay-from-master.png");
}
main();
