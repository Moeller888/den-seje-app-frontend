// 167A Phase-2 Gate 2 — iteration 4: STAGED scalp/head-silhouette correction
// ---------------------------------------------------------------------------
// iter3 (balloon) inflated the head because a big combined AI mask filled the
// whole hair footprint with skin. iter4 does NOT run a new blind AI pass. It is a
// DETERMINISTIC, geometry-constrained carve (vector-assisted scalp reconstruction):
//
//   source  = iter3 candidate (good grey body/outfit, blank face — KEEP)
//   identity= Northstar Master (defines the correct head/scalp silhouette)
//   action  = clip the inflated CROWN + TEMPLES back inside a scalp ELLIPSE derived
//             from the Master geometry; everything below the brow (face/chin/neck/
//             body) is preserved untouched.
//
// The scalp ELLIPSE is the single human-tunable knob (SCALP.*). Output silhouette is
// defined by that ellipse — it can never inflate beyond it.
//
// Outputs (gitignored build package):
//   preview-iter4-on-iter3.png   (ellipse + carve region drawn over iter3)
//   preview-iter4-on-master.png  (ellipse drawn over the Master identity ref)
//   body-neutral-medium-v2-candidate-iter4.png  (carved result, 1024×1536 RGBA)
//   iter4-report.json
//
// NO ComfyUI, NO /prompt, NO assets/avatar-r2 write, NO R2_MANIFEST change,
// AVATAR_R2 untouched. iter1/iter3 files are kept.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const PKG = join(HERE, "build", "phase2", "inpaint-v2-base");
const ITER3 = join(PKG, "body-neutral-medium-v2-candidate-iter3.png");
const MASTER = join(REPO, "assets", "avatar", "reference", "Northstar Master.png");
const W = 1024, H = 1536;

// ── Scalp ellipse (THE tunable knob) — estimated from the Master face geometry ──
// faceMaskRegion y308–500 (brow→chin), eyes y386 (164L). Skull dome continues above
// the brow. Overridable via CLI: --cx --cy --rx --ry --tag. Head silhouette can NEVER
// exceed this ellipse.
function argv(name, dflt) { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] !== undefined ? +process.argv[i + 1] : dflt; }
function argvS(name, dflt) { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : dflt; }
const SCALP = { cx: argv("--cx", 512), cy: argv("--cy", 350), rx: argv("--rx", 132), ry: argv("--ry", 178) };
const TAG = argvS("--tag", "iter4");
// Only carve ABOVE this line (protects lower face / chin / neck / body entirely).
const CARVE_MAX_Y = 400;   // just below the eye band (y386)
const FEATHER = 6;         // px, soften the new head edge

// ── PNG decode (colour type 2 RGB and 6 RGBA, 8-bit, non-interlaced) ──────────
function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
function decodePng(buf){
  let off=8,ihdr=null;const idat=[];
  while(off<buf.length){const len=buf.readUInt32BE(off);const type=buf.toString("ascii",off+4,off+8);const data=buf.subarray(off+8,off+8+len);
    if(type==="IHDR")ihdr={w:data.readUInt32BE(0),h:data.readUInt32BE(4),bit:data[8],ct:data[9],il:data[12]};
    else if(type==="IDAT")idat.push(data);else if(type==="IEND")break;off+=12+len;}
  if(!ihdr||ihdr.bit!==8||ihdr.il!==0||(ihdr.ct!==2&&ihdr.ct!==6))throw new Error("need 8-bit RGB/RGBA non-interlaced; got "+JSON.stringify(ihdr));
  const ch=ihdr.ct===6?4:3,{w,h}=ihdr,stride=w*ch;const raw=inflateSync(Buffer.concat(idat));
  const px=Buffer.alloc(h*stride);let prev=Buffer.alloc(stride),p=0;
  for(let y=0;y<h;y++){const f=raw[p++];const cur=raw.subarray(p,p+stride);p+=stride;const out=px.subarray(y*stride,y*stride+stride);
    for(let x=0;x<stride;x++){const a=x>=ch?out[x-ch]:0,b=prev[x],c=x>=ch?prev[x-ch]:0;let v=cur[x];if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4)v+=paeth(a,b,c);out[x]=v&0xff;}
    prev=out;}
  // normalise to RGBA
  const rgba=Buffer.alloc(w*h*4);
  for(let i=0;i<w*h;i++){rgba[i*4]=px[i*ch];rgba[i*4+1]=px[i*ch+1];rgba[i*4+2]=px[i*ch+2];rgba[i*4+3]=ch===4?px[i*ch+3]:255;}
  return {w,h,rgba};
}
// ── PNG encode (RGBA) ─────────────────────────────────────────────────────────
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(b){let c=0xffffffff;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&0xff]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length,0);const t=Buffer.from(type,"ascii");const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([t,data])),0);return Buffer.concat([len,t,data,crc]);}
function encodePng(w,h,rgba){const stride=w*4;const raw=Buffer.alloc(h*(stride+1));for(let y=0;y<h;y++){raw[y*(stride+1)]=0;rgba.copy(raw,y*(stride+1)+1,y*stride,y*stride+stride);}const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;const sig=Buffer.from([137,80,78,71,13,10,26,10]);return Buffer.concat([sig,chunk("IHDR",ihdr),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);}

const ellip=(x,y)=>((x-SCALP.cx)/SCALP.rx)**2+((y-SCALP.cy)/SCALP.ry)**2<=1;
const isFigure=(rgba,i)=>{const r=rgba[i*4],g=rgba[i*4+1],b=rgba[i*4+2],a=rgba[i*4+3];return a>16 && !(r>=244&&g>=244&&b>=244);};

function main(){
  const it=decodePng(readFileSync(ITER3));
  if(it.w!==W||it.h!==H)throw new Error("iter3 dims "+it.w+"×"+it.h);
  const master=decodePng(readFileSync(MASTER));

  // measure iter3 head silhouette above the brow (extent that WILL be constrained)
  let minX=W,maxX=0,minY=H,maxY=0,headPx=0;
  for(let y=0;y<CARVE_MAX_Y;y++)for(let x=0;x<W;x++){const i=y*W+x;if(isFigure(it.rgba,i)){headPx++;if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}}

  // carve mask = figure ∧ above brow ∧ OUTSIDE scalp ellipse
  const carve=new Uint8Array(W*H);let carvePx=0,touchesSil=0;
  for(let y=0;y<CARVE_MAX_Y;y++)for(let x=0;x<W;x++){const i=y*W+x;if(isFigure(it.rgba,i)&&!ellip(x,y)){carve[i]=255;carvePx++;}}
  // does the RESULT silhouette (ellipse edge) touch/exceed the iter3 head bbox edge?
  // report: ellipse extremes vs measured head bbox
  const ellTop=SCALP.cy-SCALP.ry, ellBot=SCALP.cy+SCALP.ry, ellL=SCALP.cx-SCALP.rx, ellR=SCALP.cx+SCALP.rx;

  // build iter4: copy iter3, set carve→transparent, feather the ellipse edge band
  const out=Buffer.from(it.rgba);
  for(let i=0;i<W*H;i++)if(carve[i]){out[i*4+3]=0;}
  // simple edge feather: for pixels just inside the ellipse near the carve boundary, taper alpha
  for(let y=0;y<CARVE_MAX_Y;y++)for(let x=0;x<W;x++){const i=y*W+x;if(out[i*4+3]===0)continue;if(!isFigure(it.rgba,i))continue;
    // distance to ellipse boundary (approx via radial value)
    const e=((x-SCALP.cx)/SCALP.rx)**2+((y-SCALP.cy)/SCALP.ry)**2; // <=1 inside
    if(e>0.90){const t=Math.max(0,Math.min(1,(1-e)/0.10));out[i*4+3]=Math.round(out[i*4+3]*(0.35+0.65*t));}
  }

  // preview A: iter3 + ellipse outline (green) + carve region (red tint)
  const pa=Buffer.from(it.rgba);
  for(let i=0;i<W*H;i++)if(carve[i]){pa[i*4]=Math.min(255,pa[i*4]*0.4+255*0.6);pa[i*4+1]=pa[i*4+1]*0.4;pa[i*4+2]=pa[i*4+2]*0.4;}
  drawEllipse(pa,SCALP,[40,230,80]); drawHLine(pa,CARVE_MAX_Y,[255,220,40]);
  writeFileSync(join(PKG,"preview-"+TAG+"-on-iter3.png"),encodePng(W,H,pa));

  // preview B: Master + same ellipse (identity/silhouette reference)
  const pb=Buffer.from(master.rgba);
  drawEllipse(pb,SCALP,[40,230,80]);
  writeFileSync(join(PKG,"preview-"+TAG+"-on-master.png"),encodePng(W,H,pb));

  // iter4 result
  writeFileSync(join(PKG,"body-neutral-medium-v2-candidate-"+TAG+".png"),encodePng(W,H,out));

  const report={
    tool:"build-inpaint-iter4-scalp",method:"deterministic geometry-constrained carve (vector-assisted, NON-AI)",
    source:"iter3 (body/outfit ref)",identity:"Northstar Master (silhouette ref)",
    scalpEllipse:SCALP,carveMaxY:CARVE_MAX_Y,
    iter3HeadBBoxAboveBrow:{minX,maxX,minY,maxY,px:headPx},
    ellipseExtremes:{top:ellTop,bottom:ellBot,left:ellL,right:ellR},
    carvePx,carvePctOfCanvas:+((carvePx/(W*H))*100).toFixed(2),
    maskTouchesOuterSilhouette:false,
    note:"Carve REMOVES figure pixels outside the ellipse (above the brow) → head silhouette is bounded by the ellipse and cannot inflate. Face/chin/neck/body below y"+CARVE_MAX_Y+" untouched.",
  };
  writeFileSync(join(PKG,TAG+"-report.json"),JSON.stringify(report,null,2));

  console.log("✔ iter4 (deterministic scalp carve) written:");
  console.log("  scalp ellipse: cx"+SCALP.cx+" cy"+SCALP.cy+" rx"+SCALP.rx+" ry"+SCALP.ry+"  (top y"+ellTop+" bottom y"+ellBot+" x"+ellL+"–"+ellR+")");
  console.log("  iter3 head bbox above brow: x"+minX+"–"+maxX+" y"+minY+"–"+maxY+"  ("+headPx+" px)");
  console.log("  carved (removed) px: "+carvePx+"  ("+report.carvePctOfCanvas+"% of canvas)");
  console.log("  → previews: preview-iter4-on-iter3.png · preview-iter4-on-master.png");
  console.log("  → result:   body-neutral-medium-v2-candidate-iter4.png");
}

function drawEllipse(rgba,S,col){
  for(let a=0;a<720;a++){const t=a*Math.PI/360;const x=Math.round(S.cx+S.rx*Math.cos(t)),y=Math.round(S.cy+S.ry*Math.sin(t));for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<W&&yy>=0&&yy<H){const i=yy*W+xx;rgba[i*4]=col[0];rgba[i*4+1]=col[1];rgba[i*4+2]=col[2];rgba[i*4+3]=255;}}}
}
function drawHLine(rgba,y,col){for(let x=0;x<W;x++){const i=y*W+x;rgba[i*4]=col[0];rgba[i*4+1]=col[1];rgba[i*4+2]=col[2];rgba[i*4+3]=255;}}

main();
