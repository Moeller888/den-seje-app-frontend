// 167A Phase-2 Gate 3 — WP1 HAIR review package (deterministic, NON-AI).
// ---------------------------------------------------------------------------
// G3-WP1: owner-review evidence for the hair layer candidate produced by
// build-hair-clean.mjs (WP0 chain). This tool DERIVES NO NEW LAYER — it audits
// and previews the existing first-pass hair outputs so the owner can decide
// whether the deterministic hair layer is good enough as the Gate-3 hair
// candidate (worksheet: docs/167a-phase2-gate3-wp1-hair-review.md).
//
// Audits (all deterministic pixel measurements):
//   1. TINT PREVIEW (D-031 runtime model): luminance map × multiply with each of
//      the 8 HAIR_COLOR_TOKENS base colors (values mirrored from
//      js/avatar-layers.js Section 155E — locked palette R1-R5), composited on
//      the D-057 base. Head-crop contact sheet + full-avatar small sizes (64/48/32).
//   2. HALO AUDIT: hair pixels whose Master colour is near-white (picked up by
//      the +2px dilation over background) — the "white halo" risk metric.
//   3. COVERAGE-GAP AUDIT: head-zone pixels where the MASTER figure is opaque
//      but NEITHER the D-057 base NOR the hair layer covers them → white
//      background shows through the hairline (visible in the WP0 composites).
//   4. SILHOUETTE/ALIGNMENT: onion-skin of the hair alpha over the Master and
//      over D-057 (hair is extracted FROM Master, so any offset would indicate
//      a coordinate bug, not art drift).
//   5. LUMINANCE STATS: histogram range/percentiles of the luminance map.
//
// Inputs (all read-only):
//   assets/avatar/reference/Northstar Master.png            (tracked, D-032 datum)
//   assets/avatar/reference/neutral-base-v1-gate2-d053.png  (tracked, D-057)
//   tools/avatar/build/phase2/gate3-d057/hair-clean-color.png            (WP0 chain)
//   tools/avatar/build/phase2/gate3-d057/hair-northstar-v1-luminance.png (WP0 chain)
//   → chain inputs are REQUIRED; fail loud with instructions if missing.
//
// Outputs (gitignored, review-only, NOT runtime assets) → build/phase2/gate3-d057/wp1/:
//   tint-sheet-head.png        (4×2 head crops, one per hair color, on D-057)
//   tint-small-sizes.png       (brown tint full avatar at 64/48/32 px, upscaled ×4 for viewing)
//   halo-audit.png             (near-white hair px highlighted red on the hair layer)
//   coverage-gap.png           (gap px highlighted magenta on the WP0 composite)
//   onion-master.png / onion-d057.png (hair alpha outline over Master / D-057)
//   wp1-hair-report.json
//
// NO promote, NO assets/avatar-r2 write, NO R2_MANIFEST change, AVATAR_R2 untouched,
// NO runtime code, NO change to Master / D-057 / protect / the WP0 hair outputs.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CHAIN = join(HERE, "build", "phase2", "gate3-d057");
const OUT = join(CHAIN, "wp1");
const MASTER = join(REPO, "assets", "avatar", "reference", "Northstar Master.png");
const D057 = join(REPO, "assets", "avatar", "reference", "neutral-base-v1-gate2-d053.png");
const HAIRCOLOR = join(CHAIN, "hair-clean-color.png");
const HAIRLUM = join(CHAIN, "hair-northstar-v1-luminance.png");
const W = 1024, H = 1536;

// Mirrored from js/avatar-layers.js HAIR_COLOR_TOKENS (Section 155E, locked R1-R5).
// Read-only preview copy — the runtime file stays the single source of truth.
const HAIR_TOKENS = {
  black:        "#2B2622", dark_brown: "#3F2A1B", brown: "#5A3D28", light_brown: "#8A5E3B",
  blonde:       "#C99A5B", red: "#A8442A", auburn: "#803A24", fantasy_blue: "#4A78C8",
};

// head crop for the contact sheet (spans the headHairRegion diagnostic bounds)
const HEAD = { x0: 270, y0: 40, x1: 758, y1: 520 };
const NEAR_WHITE = 244;   // matches build-hair-clean's isFig background threshold
const HAIR_MAX_Y = 505;   // head zone (same constant as build-hair-clean)

for (const [p, hint] of [[HAIRCOLOR, "hair-clean-color.png"], [HAIRLUM, "hair-northstar-v1-luminance.png"]]) {
  if (!existsSync(p)) {
    console.error("MISSING chain input: " + hint + "\nRun `node tools/avatar/build-hair-clean.mjs` first (WP0 chain).");
    process.exit(1);
  }
}

function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
function decodePng(buf){let off=8,ihdr=null;const idat=[];while(off<buf.length){const len=buf.readUInt32BE(off);const type=buf.toString("ascii",off+4,off+8);const data=buf.subarray(off+8,off+8+len);if(type==="IHDR")ihdr={w:data.readUInt32BE(0),h:data.readUInt32BE(4),bit:data[8],ct:data[9],il:data[12]};else if(type==="IDAT")idat.push(data);else if(type==="IEND")break;off+=12+len;}const ch=ihdr.ct===6?4:3,{w,h}=ihdr,stride=w*ch;const raw=inflateSync(Buffer.concat(idat));const px=Buffer.alloc(h*stride);let prev=Buffer.alloc(stride),p=0;for(let y=0;y<h;y++){const f=raw[p++];const cur=raw.subarray(p,p+stride);p+=stride;const out=px.subarray(y*stride,y*stride+stride);for(let x=0;x<stride;x++){const a=x>=ch?out[x-ch]:0,b=prev[x],c=x>=ch?prev[x-ch]:0;let v=cur[x];if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4)v+=paeth(a,b,c);out[x]=v&0xff;}prev=out;}const rgba=Buffer.alloc(w*h*4);for(let i=0;i<w*h;i++){rgba[i*4]=px[i*ch];rgba[i*4+1]=px[i*ch+1];rgba[i*4+2]=px[i*ch+2];rgba[i*4+3]=ch===4?px[i*ch+3]:255;}return {w,h,rgba};}
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(b){let c=0xffffffff;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&0xff]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const T=Buffer.from(t,"ascii");const cc=Buffer.alloc(4);cc.writeUInt32BE(crc32(Buffer.concat([T,d])),0);return Buffer.concat([l,T,d,cc]);}
function encRGB(w,h,rgb){const st=w*3,raw=Buffer.alloc(h*(st+1));for(let y=0;y<h;y++){raw[y*(st+1)]=0;rgb.copy(raw,y*(st+1)+1,y*st,y*st+st);}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);}

const hex2rgb = (hx) => [parseInt(hx.slice(1,3),16), parseInt(hx.slice(3,5),16), parseInt(hx.slice(5,7),16)];
const over = (out,i3,r,g,b,a) => { const A=a/255; out[i3]=Math.round(r*A+out[i3]*(1-A)); out[i3+1]=Math.round(g*A+out[i3+1]*(1-A)); out[i3+2]=Math.round(b*A+out[i3+2]*(1-A)); };

function main(){
  mkdirSync(OUT, { recursive: true });
  const M  = decodePng(readFileSync(MASTER));
  const B  = decodePng(readFileSync(D057));
  const Hc = decodePng(readFileSync(HAIRCOLOR));
  const Hl = decodePng(readFileSync(HAIRLUM));

  // base composite helper: D-057 over a white bg (RGB canvas)
  function baseCanvas(){ const out=Buffer.alloc(W*H*3,255);
    for(let i=0;i<W*H;i++){ const a=B.rgba[i*4+3]; if(a>0) over(out,i*3,B.rgba[i*4],B.rgba[i*4+1],B.rgba[i*4+2],a); }
    return out; }

  // ── 1. TINT PREVIEWS (D-031: luminance × multiply base color) ─────────────
  function tinted(baseRGB){ const out=baseCanvas();
    for(let i=0;i<W*H;i++){ const a=Hl.rgba[i*4+3]; if(a===0) continue;
      const L=Hl.rgba[i*4]/255; // luminance map is grayscale
      over(out,i*3, Math.round(L*baseRGB[0]), Math.round(L*baseRGB[1]), Math.round(L*baseRGB[2]), a); }
    return out; }

  const names = Object.keys(HAIR_TOKENS);
  const cw = HEAD.x1-HEAD.x0+1, chh = HEAD.y1-HEAD.y0+1, COLS=4, ROWS=2, PAD=8;
  const sheetW = COLS*cw + (COLS+1)*PAD, sheetH = ROWS*chh + (ROWS+1)*PAD;
  const sheet = Buffer.alloc(sheetW*sheetH*3, 235);
  names.forEach((n, k) => { const t = tinted(hex2rgb(HAIR_TOKENS[n]));
    const gx = (k%COLS)*(cw+PAD)+PAD, gy = ((k/COLS)|0)*(chh+PAD)+PAD;
    for(let y=0;y<chh;y++) for(let x=0;x<cw;x++){ const s=((HEAD.y0+y)*W+(HEAD.x0+x))*3, d=((gy+y)*sheetW+(gx+x))*3;
      sheet[d]=t[s]; sheet[d+1]=t[s+1]; sheet[d+2]=t[s+2]; } });
  writeFileSync(join(OUT,"tint-sheet-head.png"), encRGB(sheetW, sheetH, sheet));

  // ── 1b. small sizes (brown, full avatar, box-filtered ÷16/÷21.33/÷32 → shown ×4) ──
  const brown = tinted(hex2rgb(HAIR_TOKENS.brown));
  function scaleTo(hPx){ const s=H/hPx, wPx=Math.round(W/s); const out=Buffer.alloc(wPx*hPx*3);
    for(let y=0;y<hPx;y++) for(let x=0;x<wPx;x++){ let r=0,g=0,b=0,n=0;
      const y0=Math.floor(y*s), y1=Math.min(H,Math.ceil((y+1)*s)), x0=Math.floor(x*s), x1=Math.min(W,Math.ceil((x+1)*s));
      for(let yy=y0;yy<y1;yy++) for(let xx=x0;xx<x1;xx++){ const i=(yy*W+xx)*3; r+=brown[i]; g+=brown[i+1]; b+=brown[i+2]; n++; }
      const o=(y*wPx+x)*3; out[o]=Math.round(r/n); out[o+1]=Math.round(g/n); out[o+2]=Math.round(b/n); }
    return { wPx, hPx, out }; }
  const sizes=[64,48,32], UP=4, gap=12;
  const scaled = sizes.map(s=>scaleTo(s));
  const stripW = scaled.reduce((a,v)=>a+v.wPx*UP,0)+gap*(sizes.length+1), stripH = 64*UP+2*gap;
  const strip = Buffer.alloc(stripW*stripH*3, 235); let cx = gap;
  for (const sc of scaled){ for(let y=0;y<sc.hPx*UP;y++) for(let x=0;x<sc.wPx*UP;x++){
      const s=(((y/UP)|0)*sc.wPx+((x/UP)|0))*3, d=((gap+y)*stripW+(cx+x))*3;
      strip[d]=sc.out[s]; strip[d+1]=sc.out[s+1]; strip[d+2]=sc.out[s+2]; } cx += sc.wPx*UP+gap; }
  writeFileSync(join(OUT,"tint-small-sizes.png"), encRGB(stripW, stripH, strip));

  // ── 2. HALO AUDIT: hair px whose Master colour is near-white ──────────────
  let haloPx=0; const halo=Buffer.alloc(W*H*3,255);
  for(let i=0;i<W*H;i++){ const a=Hc.rgba[i*4+3]; if(a===0) continue;
    const r=Hc.rgba[i*4], g=Hc.rgba[i*4+1], b=Hc.rgba[i*4+2];
    const isNW = r>=NEAR_WHITE && g>=NEAR_WHITE && b>=NEAR_WHITE;
    if(isNW){ haloPx++; halo[i*3]=255; halo[i*3+1]=0; halo[i*3+2]=0; }
    else { halo[i*3]=r; halo[i*3+1]=g; halo[i*3+2]=b; } }
  writeFileSync(join(OUT,"halo-audit.png"), encRGB(W,H,halo));

  // ── 3. COVERAGE-GAP AUDIT (head zone): Master figure opaque, but neither ──
  //      D-057 nor hair covers → white background shows at the hairline.
  const isFig=(px,i)=>{const r=px[i*4],g=px[i*4+1],b=px[i*4+2],a=px[i*4+3];return a>16&&!(r>=244&&g>=244&&b>=244);};
  let gapPx=0; let gapMinX=W,gapMaxX=0,gapMinY=H,gapMaxY=0;
  const gapImg=baseCanvas();
  for(let i=0;i<W*H;i++){ const a=Hc.rgba[i*4+3]; if(a>0){ over(gapImg,i*3,Hc.rgba[i*4],Hc.rgba[i*4+1],Hc.rgba[i*4+2],a); } }
  for(let y=0;y<HAIR_MAX_Y;y++) for(let x=0;x<W;x++){ const i=y*W+x;
    if(!isFig(M.rgba,i)) continue;
    if(B.rgba[i*4+3]>16) continue;         // D-057 covers it
    if(Hc.rgba[i*4+3]>0) continue;         // hair covers it
    gapPx++; gapImg[i*3]=255; gapImg[i*3+1]=0; gapImg[i*3+2]=255;
    if(x<gapMinX)gapMinX=x; if(x>gapMaxX)gapMaxX=x; if(y<gapMinY)gapMinY=y; if(y>gapMaxY)gapMaxY=y; }
  writeFileSync(join(OUT,"coverage-gap.png"), encRGB(W,H,gapImg));

  // ── 4. ONION-SKIN alignment: hair alpha outline over Master / over D-057 ──
  function outline(){ const o=new Uint8Array(W*H);
    for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++){ const i=y*W+x; const a=Hc.rgba[i*4+3]>0;
      if(!a) continue;
      if(Hc.rgba[(i-1)*4+3]===0||Hc.rgba[(i+1)*4+3]===0||Hc.rgba[(i-W)*4+3]===0||Hc.rgba[(i+W)*4+3]===0) o[i]=1; }
    return o; }
  const ol=outline();
  function onion(src){ const out=Buffer.alloc(W*H*3,255);
    for(let i=0;i<W*H;i++){ const a=src.rgba[i*4+3]; if(a>0) over(out,i*3,src.rgba[i*4],src.rgba[i*4+1],src.rgba[i*4+2],a); }
    for(let i=0;i<W*H;i++) if(ol[i]){ out[i*3]=0; out[i*3+1]=200; out[i*3+2]=0; }
    return out; }
  writeFileSync(join(OUT,"onion-master.png"), encRGB(W,H,onion(M)));
  writeFileSync(join(OUT,"onion-d057.png"), encRGB(W,H,onion(B)));

  // ── 5. LUMINANCE STATS ─────────────────────────────────────────────────────
  const hist=new Uint32Array(256); let lumPx=0;
  for(let i=0;i<W*H;i++){ if(Hl.rgba[i*4+3]===0) continue; hist[Hl.rgba[i*4]]++; lumPx++; }
  const pct=(q)=>{ let acc=0, t=q*lumPx; for(let v=0;v<256;v++){ acc+=hist[v]; if(acc>=t) return v; } return 255; };
  let lo=0, hi=255; while(hist[lo]===0&&lo<255)lo++; while(hist[hi]===0&&hi>0)hi--;

  const hairPxTotal = (()=>{let n=0;for(let i=0;i<W*H;i++)if(Hc.rgba[i*4+3]>0)n++;return n;})();
  const report = {
    tool:"build-hair-wp1-review", wp:"G3-WP1 hair owner-review package (deterministic, NON-AI)",
    inputs:{ master:"Northstar Master.png", base:"neutral-base-v1-gate2-d053.png (D-057)",
             hairColor:"gate3-d057/hair-clean-color.png", hairLuminance:"gate3-d057/hair-northstar-v1-luminance.png" },
    hairPx: hairPxTotal,
    haloAudit:{ nearWhiteThreshold:NEAR_WHITE, nearWhiteHairPx:haloPx, pctOfHair:+(100*haloPx/hairPxTotal).toFixed(3) },
    coverageGap:{ headZoneMaxY:HAIR_MAX_Y, gapPx, bbox: gapPx? {x0:gapMinX,y0:gapMinY,x1:gapMaxX,y1:gapMaxY}:null,
      meaning:"Master-figure px in the head zone covered by NEITHER D-057 nor the hair layer (white shows through)" },
    luminance:{ nonZeroPx:lumPx, min:lo, max:hi, p1:pct(0.01), p50:pct(0.50), p99:pct(0.99),
      note:"first-pass map normalises to [90,250]; out-of-band values indicate dilation-ring pickup" },
    tintPreview:{ model:"D-031 multiply (luminance/255 × base hex)", colors:names,
      tokensMirroredFrom:"js/avatar-layers.js HAIR_COLOR_TOKENS (155E) — preview copy only" },
    outputs:["tint-sheet-head.png","tint-small-sizes.png","halo-audit.png","coverage-gap.png","onion-master.png","onion-d057.png"],
    boundaries:"review-only; NOT runtime assets; no promote; no assets/avatar-r2; no R2_MANIFEST; AVATAR_R2 false; Master/D-057/protect/WP0-outputs unchanged",
  };
  writeFileSync(join(OUT,"wp1-hair-report.json"), JSON.stringify(report,null,2));

  console.log("✔ WP1 hair review package:");
  console.log("  hair px "+hairPxTotal+" · near-white halo px "+haloPx+" ("+report.haloAudit.pctOfHair+"%)");
  console.log("  hairline coverage gap "+gapPx+"px"+(gapPx?" bbox("+gapMinX+","+gapMinY+")-("+gapMaxX+","+gapMaxY+")":""));
  console.log("  luminance range "+lo+"–"+hi+" · p1 "+pct(0.01)+" · p50 "+pct(0.50)+" · p99 "+pct(0.99));
  console.log("  → wp1/tint-sheet-head.png · tint-small-sizes.png · halo-audit.png · coverage-gap.png · onion-master/d057.png");
}
main();
