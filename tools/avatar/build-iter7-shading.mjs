// 167A Phase-2 Gate 2 — iter7: DETERMINISTIC cel-shade touch-up of iter6's lower face.
// ---------------------------------------------------------------------------
// NO AI, NO ComfyUI, NO inpainting. Adds a SUBTLE, feathered cel-shadow to the FRONT
// JAW / LOWER FACE / under-chin neck of iter6 to raise §3 cel-shading, WITHOUT changing
// geometry, pose, silhouette, outfit, hands, shoes, or the blank face.
//
// Shadow tone is derived from iter6's own base skin × a warm multiply (matching the
// Master's base→shadow ratio ≈ ×0.74 warm) so the palette does not clash. Applied ONLY:
//   * on SKIN pixels (not outfit/hair/background),
//   * BELOW y440 (clear of the blank eye band — no features added),
//   * as a soft ramp (feathered mask) = cel-shade, not a hard edge.
//
// Output: body-neutral-medium-v2-candidate-iter7-shaded.png (1024×1536 RGBA).
// Review-only. NO promote, NO assets/avatar-r2 write, NO R2_MANIFEST change,
// AVATAR_R2 untouched. iter1..iter6 kept.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const PKG = join(HERE, "build", "phase2", "inpaint-v2-base");
const ITER6 = join(PKG, "body-neutral-medium-v2-candidate-iter6-lowerhead.png");
const OUT = join(PKG, "body-neutral-medium-v2-candidate-iter7-shaded.png");
const W = 1024, H = 1536;

const EYE_SAFE_Y = 440;   // never touch skin above this (blank eye band / upper face)
const MAX_STRENGTH = 0.5; // subtle max blend toward shadow
const SHADOW_MUL = [0.80, 0.78, 0.74]; // warm cel-shadow ratio (matches Master base→shadow)

function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
function decodePng(buf){let off=8,ihdr=null;const idat=[];while(off<buf.length){const len=buf.readUInt32BE(off);const type=buf.toString("ascii",off+4,off+8);const data=buf.subarray(off+8,off+8+len);if(type==="IHDR")ihdr={w:data.readUInt32BE(0),h:data.readUInt32BE(4),bit:data[8],ct:data[9],il:data[12]};else if(type==="IDAT")idat.push(data);else if(type==="IEND")break;off+=12+len;}const ch=ihdr.ct===6?4:3,{w,h}=ihdr,stride=w*ch;const raw=inflateSync(Buffer.concat(idat));const px=Buffer.alloc(h*stride);let prev=Buffer.alloc(stride),p=0;for(let y=0;y<h;y++){const f=raw[p++];const cur=raw.subarray(p,p+stride);p+=stride;const out=px.subarray(y*stride,y*stride+stride);for(let x=0;x<stride;x++){const a=x>=ch?out[x-ch]:0,b=prev[x],c=x>=ch?prev[x-ch]:0;let v=cur[x];if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4)v+=paeth(a,b,c);out[x]=v&0xff;}prev=out;}const rgba=Buffer.alloc(w*h*4);for(let i=0;i<w*h;i++){rgba[i*4]=px[i*ch];rgba[i*4+1]=px[i*ch+1];rgba[i*4+2]=px[i*ch+2];rgba[i*4+3]=ch===4?px[i*ch+3]:255;}return {w,h,rgba};}
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(b){let c=0xffffffff;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&0xff]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const T=Buffer.from(t,"ascii");const cc=Buffer.alloc(4);cc.writeUInt32BE(crc32(Buffer.concat([T,d])),0);return Buffer.concat([l,T,d,cc]);}
function encRGBA(w,h,rgba){const st=w*4,raw=Buffer.alloc(h*(st+1));for(let y=0;y<h;y++){raw[y*(st+1)]=0;rgba.copy(raw,y*(st+1)+1,y*st,y*st+st);}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);}

const idx=(x,y)=>(y*W+x)*4;
const isSkin=(px,x,y)=>{const i=idx(x,y);const r=px[i],g=px[i+1],b=px[i+2],a=px[i+3];return a>200&&r>=185&&r>=g&&g>=b&&(r-b)>=25&&(r-b)<=115&&g>r*0.70;};
function boxBlur(m,r){const win=2*r+1;const tmp=new Float32Array(W*H),out=new Float32Array(W*H);for(let y=0;y<H;y++){let s=0;for(let x=-r;x<=r;x++)s+=m[y*W+Math.max(0,Math.min(W-1,x))];for(let x=0;x<W;x++){tmp[y*W+x]=s/win;s+=m[y*W+Math.min(W-1,x+r+1)]-m[y*W+Math.max(0,x-r)];}}for(let x=0;x<W;x++){let s=0;for(let y=-r;y<=r;y++)s+=tmp[Math.max(0,Math.min(H-1,y))*W+x];for(let y=0;y<H;y++){out[y*W+x]=s/win;s+=tmp[Math.min(H-1,y+r+1)*W+x]-tmp[Math.max(0,y-r)*W+x];}}return out;}

function main(){
  const B=decodePng(readFileSync(ITER6));
  if(B.w!==W)throw new Error("iter6 dims");
  const out=Buffer.from(B.rgba);

  // sample iter6 base skin (mean of a lit jaw patch) → derive warm cel-shadow tone
  let sr=0,sg=0,sb=0,sn=0;for(let y=450;y<490;y++)for(let x=480;x<545;x++)if(isSkin(B.rgba,x,y)){const i=idx(x,y);sr+=B.rgba[i];sg+=B.rgba[i+1];sb+=B.rgba[i+2];sn++;}
  const base=sn?[Math.round(sr/sn),Math.round(sg/sn),Math.round(sb/sn)]:[240,198,175];
  const SHADOW=[Math.round(base[0]*SHADOW_MUL[0]),Math.round(base[1]*SHADOW_MUL[1]),Math.round(base[2]*SHADOW_MUL[2])];

  // find chin line (lowest skin row that is still face-wide, scanning down) for the neck shadow
  let chinY=505;for(let y=560;y>=470;y--){let c=0;for(let x=440;x<585;x++)if(isSkin(B.rgba,x,y))c++;if(c>40){chinY=y;break;}}

  // build a 0..1 shadow strength mask (skin, y>EYE_SAFE_Y)
  const s=new Float32Array(W*H);
  // per-row skin extent for jaw-side falloff
  for(let y=EYE_SAFE_Y;y<560;y++){
    let l=-1,r=-1;for(let x=0;x<W;x++)if(isSkin(B.rgba,x,y)){if(l<0)l=x;r=x;}
    if(l<0)continue;
    for(let x=l;x<=r;x++){if(!isSkin(B.rgba,x,y))continue;
      // (a) under-chin / upper-neck cast shadow: strong just below chin, fades down
      let a=0;if(y>=chinY-4){a=Math.max(0,1-(y-(chinY-4))/34)*0.95;}
      // (b) jaw-side form shadow: near left/right skin edge, subtle
      const distEdge=Math.min(x-l,r-x);let bsd=0;if(distEdge<20&&y>chinY-70&&y<chinY+8){bsd=(1-distEdge/20)*0.45;}
      // (c) very soft lower-jaw core (a touch of form under the mouth area), subtle
      let core=0;const jawcy=chinY-24,jawcx=512;const dd=Math.hypot((x-jawcx)/70,(y-jawcy)/26);if(dd<1)core=(1-dd)*0.30;
      s[y*W+x]=Math.min(1,Math.max(a,bsd,core));
    }
  }
  const sm=boxBlur(s,7); // feather = the cel ramp

  let touched=0;
  for(let i=0;i<W*H;i++){const st=Math.min(1,sm[i])*MAX_STRENGTH;if(st<=0.01)continue;const x=i%W,y=(i/W)|0;if(!isSkin(B.rgba,x,y))continue;
    const j=i*4;out[j]=Math.round(B.rgba[j]*(1-st)+SHADOW[0]*st);out[j+1]=Math.round(B.rgba[j+1]*(1-st)+SHADOW[1]*st);out[j+2]=Math.round(B.rgba[j+2]*(1-st)+SHADOW[2]*st);touched++;}

  writeFileSync(OUT,encRGBA(W,H,out));

  // objective cel signal: stddev of luminance over the lower-face skin, before vs after
  function lumStd(px){let n=0,m=0,m2=0;for(let y=EYE_SAFE_Y;y<560;y++)for(let x=380;x<650;x++)if(isSkin(px,x,y)){const i=idx(x,y);const L=0.299*px[i]+0.587*px[i+1]+0.114*px[i+2];n++;m+=L;m2+=L*L;}return n?Math.sqrt(m2/n-(m/n)**2):0;}
  const before=lumStd(B.rgba),after=lumStd(out);

  writeFileSync(join(PKG,"iter7-shading-report.json"),JSON.stringify({
    tool:"build-iter7-shading",method:"deterministic cel-shade ramp on front jaw/lower face (NON-AI)",
    baseSkin:base,shadowTone:SHADOW,shadowMul:SHADOW_MUL,maxStrength:MAX_STRENGTH,chinY,eyeSafeY:EYE_SAFE_Y,
    touchedSkinPx:touched,
    lowerFaceLumStdDev:{before:+before.toFixed(2),after:+after.toFixed(2),delta:+(after-before).toFixed(2)},
    geometryChanged:false,alphaChanged:false,onlySkinRecolored:true,blankFacePreserved:true,
    boundaries:"review-only; no promote; no assets/avatar-r2; no R2_MANIFEST; AVATAR_R2 false",
  },null,2));

  console.log("✔ iter7 cel-shade touch-up written:");
  console.log("  base skin "+JSON.stringify(base)+" → warm cel-shadow "+JSON.stringify(SHADOW));
  console.log("  chin line y"+chinY+" · skin px shaded: "+touched);
  console.log("  lower-face luminance stddev: "+before.toFixed(2)+" → "+after.toFixed(2)+" (Δ+"+(after-before).toFixed(2)+" = more form)");
  console.log("  → "+OUT.replace(REPO,"").replace(/\\/g,"/"));
}
main();
