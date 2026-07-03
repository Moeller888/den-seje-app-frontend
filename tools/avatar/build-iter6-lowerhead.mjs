// 167A Phase-2 Gate 2 — iteration 6: DETERMINISTIC lower-head correction of iter5.
// ---------------------------------------------------------------------------
// NO AI, NO ComfyUI, NO inpainting. Vector-assisted, data-driven edits ONLY to the
// lower head / neck / ear zone of iter5. Upper scalp, body/outfit, hands, shoes,
// hair, canvas, pose are untouched.
//
// Measurement (see report) showed iter5's jaw/neck WIDTH already matches the Master
// skin silhouette closely — so the correction is conservative:
//   1. Jaw clamp: trim any iter5 figure pixel that exceeds the Master skin silhouette
//      (rows y400–515). Minimal (iter5 already ≈ Master).
//   2. Neck fill: fill transparent/near-white gaps in the neck column (chin→collar)
//      with the sampled skin tone, so the head connects cleanly to the collar.
//   3. Ear hints: add small skin-tone lower-ear shapes at the carved-off outer-ear
//      positions (matching skin tone + a soft outline), small, to be partly hidden by hair.
//   4. Clean stray green/odd pixels near the neck.
//
// Review-only. NO promote, NO assets/avatar-r2 write, NO R2_MANIFEST change,
// AVATAR_R2 untouched. iter1/iter3/iter4/iter5 kept.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const PKG = join(HERE, "build", "phase2", "inpaint-v2-base");
const MASTER = join(REPO, "assets", "avatar", "reference", "Northstar Master.png");
const ITER5 = join(PKG, "body-neutral-medium-v2-candidate-iter5.png");
const OUT = join(PKG, "body-neutral-medium-v2-candidate-iter6-lowerhead.png");
const W = 1024, H = 1536;

const SKIN = [238, 199, 175];         // sampled iter5 forehead
const SKIN_SHADOW = [206, 150, 118];  // ear/contour line
const JAW_CLAMP = [400, 515];         // rows to clamp to Master skin silhouette
const NECK = { x0: 466, x1: 558, y0: 498, y1: 648 };  // neck column (chin→collar)
// carved-off outer-ear hints (from measurement: iter5 head edge vs Master ear x310–360 / 664–714)
const EARS = [ { cx: 342, cy: 424, rx: 15, ry: 33 }, { cx: 682, cy: 424, rx: 15, ry: 33 } ];

function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
function decodePng(buf){let off=8,ihdr=null;const idat=[];while(off<buf.length){const len=buf.readUInt32BE(off);const type=buf.toString("ascii",off+4,off+8);const data=buf.subarray(off+8,off+8+len);if(type==="IHDR")ihdr={w:data.readUInt32BE(0),h:data.readUInt32BE(4),bit:data[8],ct:data[9],il:data[12]};else if(type==="IDAT")idat.push(data);else if(type==="IEND")break;off+=12+len;}const ch=ihdr.ct===6?4:3,{w,h}=ihdr,stride=w*ch;const raw=inflateSync(Buffer.concat(idat));const px=Buffer.alloc(h*stride);let prev=Buffer.alloc(stride),p=0;for(let y=0;y<h;y++){const f=raw[p++];const cur=raw.subarray(p,p+stride);p+=stride;const out=px.subarray(y*stride,y*stride+stride);for(let x=0;x<stride;x++){const a=x>=ch?out[x-ch]:0,b=prev[x],c=x>=ch?prev[x-ch]:0;let v=cur[x];if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4)v+=paeth(a,b,c);out[x]=v&0xff;}prev=out;}const rgba=Buffer.alloc(w*h*4);for(let i=0;i<w*h;i++){rgba[i*4]=px[i*ch];rgba[i*4+1]=px[i*ch+1];rgba[i*4+2]=px[i*ch+2];rgba[i*4+3]=ch===4?px[i*ch+3]:255;}return {w,h,rgba};}
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(b){let c=0xffffffff;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&0xff]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const T=Buffer.from(t,"ascii");const cc=Buffer.alloc(4);cc.writeUInt32BE(crc32(Buffer.concat([T,d])),0);return Buffer.concat([l,T,d,cc]);}
function encRGBA(w,h,rgba){const st=w*4,raw=Buffer.alloc(h*(st+1));for(let y=0;y<h;y++){raw[y*(st+1)]=0;rgba.copy(raw,y*(st+1)+1,y*st,y*st+st);}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);}

const idx=(x,y)=>(y*W+x)*4;
const isFig=(px,x,y)=>{const i=idx(x,y);const r=px[i],g=px[i+1],b=px[i+2],a=px[i+3];return a>16&&!(r>=244&&g>=244&&b>=244);};
const isHair=(r,g,b)=>r>=48&&r<205&&g<r*0.93&&b<g*0.97&&(r-b)>=18&&r>g&&g>=b;
function masterSkinRow(M,y){let l=-1,r=-1;for(let x=0;x<W;x++){if(!isFig(M.rgba,x,y))continue;const i=idx(x,y);if(isHair(M.rgba[i],M.rgba[i+1],M.rgba[i+2]))continue;if(l<0)l=x;r=x;}return l<0?null:[l,r];}
function setPx(px,x,y,c,a=255){if(x<0||y<0||x>=W||y>=H)return;const i=idx(x,y);px[i]=c[0];px[i+1]=c[1];px[i+2]=c[2];px[i+3]=a;}

function main(){
  const M=decodePng(readFileSync(MASTER));
  const B=decodePng(readFileSync(ITER5));
  if(B.w!==W)throw new Error("iter5 dims");
  const out=Buffer.from(B.rgba);
  const stats={ jawTrimmed:0, neckFilled:0, earPx:0, greenCleaned:0 };

  // 1. Jaw clamp: trim iter5 pixels outside the Master skin silhouette (rows JAW_CLAMP)
  for(let y=JAW_CLAMP[0];y<=JAW_CLAMP[1];y++){const row=masterSkinRow(M,y);if(!row)continue;const pad=6;for(let x=0;x<W;x++){if(!isFig(out,x,y))continue;if(x<row[0]-pad||x>row[1]+pad){out[idx(x,y)+3]=0;stats.jawTrimmed++;}}}

  // 2. Neck fill: fill transparent/near-white gaps in the neck column with skin
  for(let y=NECK.y0;y<=NECK.y1;y++)for(let x=NECK.x0;x<=NECK.x1;x++){const i=idx(x,y);const a=out[i+3];const white=out[i]>=232&&out[i+1]>=232&&out[i+2]>=232;
    // only fill ABOVE the collar: stop if this pixel is clearly grey shirt (r≈g≈b, mid)
    const r=out[i],g=out[i+1],b=out[i+2];const grey=a>16&&Math.abs(r-g)<16&&Math.abs(g-b)<16&&r>90&&r<210;
    if(grey)continue; if(a<16||white){setPx(out,x,y,SKIN,255);stats.neckFilled++;}}

  // 3. Ear hints — small skin ellipses + soft outline, only where currently background
  for(const e of EARS){for(let y=e.cy-e.ry-2;y<=e.cy+e.ry+2;y++)for(let x=e.cx-e.rx-2;x<=e.cx+e.rx+2;x++){const d=((x-e.cx)/e.rx)**2+((y-e.cy)/e.ry)**2;if(d>1.18)continue;if(isFig(out,x,y))continue; // don't overwrite existing head
    if(d>0.82){setPx(out,x,y,SKIN_SHADOW,255);} else {setPx(out,x,y,SKIN,255);stats.earPx++;} }}

  // 4. clean stray green near neck/collar
  for(let y=540;y<680;y++)for(let x=380;x<650;x++){const i=idx(x,y);const a=out[i+3];if(a<=16)continue;const r=out[i],g=out[i+1],b=out[i+2];if(g>r+12&&g>b+12){setPx(out,x,y,SKIN,a);stats.greenCleaned++;}}

  writeFileSync(OUT,encRGBA(W,H,out));
  writeFileSync(join(PKG,"iter6-lowerhead-report.json"),JSON.stringify({
    tool:"build-iter6-lowerhead",method:"deterministic vector-assisted lower-head correction (NON-AI)",
    source:"iter5",identityRef:"Northstar Master skin silhouette",
    findings:"Measurement: iter5 jaw/neck WIDTH already ≈ Master skin silhouette (y400 386vs382, y500 163vs168). 'wide disk' impression was flat shading, not wrong silhouette. Real defect = carved-off outer ears.",
    params:{JAW_CLAMP,NECK,EARS,SKIN},stats,
    boundaries:"review-only; no promote; no assets/avatar-r2; no R2_MANIFEST; AVATAR_R2 false",
  },null,2));

  console.log("✔ iter6 lower-head correction written:");
  console.log("  jaw pixels trimmed to Master silhouette: "+stats.jawTrimmed);
  console.log("  neck gap pixels filled (skin): "+stats.neckFilled);
  console.log("  ear-hint pixels added: "+stats.earPx);
  console.log("  green stray cleaned: "+stats.greenCleaned);
  console.log("  → "+OUT.replace(REPO,"").replace(/\\/g,"/"));
}
main();
