// 167A Phase-2 Gate 3 — D-042 FACE-EXPRESSION producer (DETERMINISTIC MASTER-COMPOSITE pipeline).
// ---------------------------------------------------------------------------
// Ordered by owner command 2026-07-16 ("fortsæt med udtryksvarianterne"); redesigned
// 2026-07-24 after the first gpt-image-1 attempt was correctly REJECTED (the edits endpoint
// regenerates the WHOLE canvas — it changed eyes/outline/skin/hair, outside-mask mean Δ 11.4,
// p99 217 vs limits 2/12). Raw AI output can NEVER be the candidate under D-042's identity
// contract. The AI output is now ONLY a DONOR for the brows/nose/mouth region; the frozen
// Master (D-032) is authoritative EVERYWHERE else.
//
// HARD BOUNDARIES:
//   * EXACTLY ONE expression per invocation, EXACTLY ONE paid API call, NO auto-retry.
//   * API key from env OPENAI_API_KEY only — NEVER hardcoded, NEVER printed/stored.
//   * Model = an explicit reproducible snapshot (gpt-image-2-2026-04-21). (input_fidelity was
//     tried and removed 2026-07-24 — gpt-image-2 rejects it: invalid_input_fidelity_model.)
//     NO silent fallback to gpt-image-1. If the snapshot/endpoint/param is refused → report the
//     API error, make NO further call, stop.
//   * TWO masks with distinct roles:
//       - GENERATION mask (sent to the model): the §4.2 regions ±12 padding (visual context).
//       - WRITE mask (binding): §4.2 regions ±12 MINUS the eye boxes. Donor pixels may reach the
//         candidate ONLY here. It contains NO eye/iris/hair/ear/jaw/head-shape/body pixels.
//   * The candidate is built from the UNTOUCHED Master; only WRITE-mask pixels take donor RGB
//     (alpha is never changed). OUTSIDE the write mask the candidate is byte-identical to Master.
//   * Gates: A (outside write mask == Master, 0 diff) · B (named protected regions == Master) ·
//     C (seam ring measured/visualised — no canonical threshold ⇒ REVIEW_REQUIRED, never auto-pass) ·
//     D (validate-face-expression.mjs on the extracted layer).
//   * Outputs are gitignored build artifacts. NO runtime change, NO promote, NO assets/avatar-r2,
//     NO R2_MANIFEST, AVATAR_R2 untouched. Master untouched. Raw AI output is diagnostic scratch,
//     never a promotable asset.
//
// Provenance (spec §3): every real run writes to a UNIQUE folder
//   expr/<name>/runs/<UTC>-<model>-<version>/  (raw-donor · generation-mask · write-mask ·
//   composite-on-master · face-<name>-<version>-candidate · diff · seam · gates.json ·
//   prompt.txt · run-metadata.json). Earlier versions are never overwritten.
//
// Run:
//   node tools/avatar/build-face-expr-d042.mjs --selftest            # key-free composite/gate proof
//   node tools/avatar/build-face-expr-d042.mjs --prompt focused      # key-free prompt preview
//   OPENAI_API_KEY=... node tools/avatar/build-face-expr-d042.mjs focused v2   # ONE paid call
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { inflateSync, deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const sha256 = (b) => createHash("sha256").update(b).digest("hex");

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CHAIN = join(HERE, "build", "phase2", "gate3-d057");
const MASTER = join(REPO, "assets", "avatar", "reference", "Northstar Master.png");
const W = 1024, H = 1536;

// Explicit reproducible model snapshot. NO fallback to gpt-image-1.
const MODEL = "gpt-image-2-2026-04-21";
const ENDPOINT = "https://api.openai.com/v1/images/edits";
const SIZE = "1024x1536";

// §4.2 regions grown by the ±12 expression margin (keep in sync with validate-face-expression.mjs)
const MARGIN = 12;
const REGIONS = [
  { x0: 396 - MARGIN, y0: 306 - MARGIN, x1: 632 + MARGIN, y1: 340 + MARGIN },   // brows
  { x0: 494 - MARGIN, y0: 438 - MARGIN, x1: 532 + MARGIN, y1: 461 + MARGIN },   // nose
  { x0: 474 - MARGIN, y0: 461 - MARGIN, x1: 552 + MARGIN, y1: 481 + MARGIN },   // mouth
];
// Eye boxes (validate-face-expression.mjs §3) — SUBTRACTED from the write mask so no donor pixel
// can ever land on the eyes (the brows region ±12 overlaps the eye-box tops at y332..352).
const EYE_BOXES = [
  { x0: 374, y0: 332, x1: 480, y1: 440 },
  { x0: 527, y0: 332, x1: 633, y1: 440 },
];
// Named protected regions for Gate B (all lie OUTSIDE the write mask; must equal Master).
const PROTECTED = [
  { name: "eye-left", x0: 374, y0: 332, x1: 480, y1: 440 },
  { name: "eye-right", x0: 527, y0: 332, x1: 633, y1: 440 },
  { name: "hair-top", x0: 300, y0: 60, x1: 720, y1: 260 },
  { name: "ear-left", x0: 300, y0: 360, x1: 372, y1: 470 },
  { name: "ear-right", x0: 636, y0: 360, x1: 712, y1: 470 },
  { name: "jaw-chin", x0: 430, y0: 500, x1: 600, y1: 560 },
  { name: "body-torso", x0: 330, y0: 560, x1: 700, y1: 900 },
];
const SEAM_RING = 3; // boundary ring width (px) measured INSIDE the write mask

// Shared identity contract (owner spec §6) — prefixes every prompt. Protects eyes, iris, hair,
// head shape, skin tone, ears, clothing and body; only brows/nose/mouth may change.
const IDENTITY = [
  "Preserve the exact character identity, the exact illustration style and line weight, the age and the friendly child personality.",
  "Do not redesign the character. Do not change the eyes or iris, do not change the hair, do not change the head shape,",
  "do not change the skin tone, do not change the ears, and do not change the clothing or body.",
  "Edit ONLY the transparent masked regions (eyebrows, nose if needed, and mouth); the AI output is a donor only",
  "and the frozen Master is authoritative outside the masked regions. Keep it a closed-mouth expression.",
].join(" ");

// Per-expression feeling + feature contracts. focused/determined = owner v2 contracts (§4/§5);
// proud/curious retain their prior phrasing (not regenerated this task).
const FEELING = {
  curious: "gentle curiosity: eyebrows raised slightly with a mild inner lift, and a small open 'o' mouth of curiosity.",
  proud: "a quiet, confident closed-mouth smile of pride: eyebrows relaxed and slightly raised.",
  focused: "quiet, friendly concentration; attentive rather than angry. "
    + "Eyebrows: keep the same base thickness and line style as the original, only slightly lowered with a very mild inward concentration angle — "
    + "not two heavy horizontal black bars, not strongly drawn together over the nose, not dramatically asymmetric. "
    + "Mouth: small, relaxed and closed, neutral or nearly neutral — it must not droop downward like sadness, must not be hard-pressed, no smirk, no teeth. "
    + "Not sad, not worried, not angry, not threatening.",
  determined: "calm resolve and perseverance; confident but kind; no smirk. "
    + "Eyebrows: only mildly angled inward, symmetric, the same thickness and style as the original, less aggressive than before — no deep frown, no sharp V shape. "
    + "Mouth: a symmetric mouth, closed, a firm calm line or a very subtle symmetric positive curve — no one-sided corner, no smirk, no sneering or smug character, no teeth. "
    + "Overall it must read as not aggressive, not angry, not sly, not arrogant or villainous.",
};
const EXPRESSIONS = FEELING; // valid-name set
function buildPrompt(name){ return IDENTITY + " Change the expression to " + FEELING[name]; }

// ── minimal deterministic PNG codec ─────────────────────────────────────────
function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
function decodePng(buf){let off=8,ihdr=null;const idat=[];while(off<buf.length){const len=buf.readUInt32BE(off);const type=buf.toString("ascii",off+4,off+8);const data=buf.subarray(off+8,off+8+len);if(type==="IHDR")ihdr={w:data.readUInt32BE(0),h:data.readUInt32BE(4),bit:data[8],ct:data[9],il:data[12]};else if(type==="IDAT")idat.push(data);else if(type==="IEND")break;off+=12+len;}const ch=ihdr.ct===6?4:3,{w,h}=ihdr,stride=w*ch;const raw=inflateSync(Buffer.concat(idat));const px=Buffer.alloc(h*stride);let prev=Buffer.alloc(stride),p=0;for(let y=0;y<h;y++){const f=raw[p++];const cur=raw.subarray(p,p+stride);p+=stride;const out=px.subarray(y*stride,y*stride+stride);for(let x=0;x<stride;x++){const a=x>=ch?out[x-ch]:0,b=prev[x],c=x>=ch?prev[x-ch]:0;let v=cur[x];if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4)v+=paeth(a,b,c);out[x]=v&0xff;}prev=out;}const rgba=Buffer.alloc(w*h*4);for(let i=0;i<w*h;i++){rgba[i*4]=px[i*ch];rgba[i*4+1]=px[i*ch+1];rgba[i*4+2]=px[i*ch+2];rgba[i*4+3]=ch===4?px[i*ch+3]:255;}return {w,h,rgba};}
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(b){let c=0xffffffff;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&0xff]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const T=Buffer.from(t,"ascii");const cc=Buffer.alloc(4);cc.writeUInt32BE(crc32(Buffer.concat([T,d])),0);return Buffer.concat([l,T,d,cc]);}
function encRGBA(w,h,rgba){const st=w*4,raw=Buffer.alloc(h*(st+1));for(let y=0;y<h;y++){raw[y*(st+1)]=0;rgba.copy(raw,y*(st+1)+1,y*st,y*st+st);}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);}

// ── geometry ────────────────────────────────────────────────────────────────
const inBox=(x,y,B)=>x>=B.x0&&x<=B.x1&&y>=B.y0&&y<=B.y1;
const inRegions=(x,y)=>REGIONS.some(r=>inBox(x,y,r));
const inEye=(x,y)=>EYE_BOXES.some(b=>inBox(x,y,b));
const inWrite=(x,y)=>inRegions(x,y)&&!inEye(x,y);
const isSkin=(r,g,b)=>r>=205&&r>g&&g>=b&&(r-b)>=28&&(r-b)<=135&&g>r*0.70;

function writeMaskField(){
  const wm=new Uint8Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(inWrite(x,y))wm[y*W+x]=1;
  return wm;
}

// GENERATION mask PNG (transparent = editable = §4.2 regions ±12; opaque = preserve).
function genMaskPng(){
  const m=Buffer.alloc(W*H*4);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;
    if(inRegions(x,y)){m[i+3]=0;}else{m[i]=255;m[i+1]=255;m[i+2]=255;m[i+3]=255;}}
  return encRGBA(W,H,m);
}
// WRITE mask viz (white = donor may write; black = Master authoritative).
function writeMaskPng(wm){
  const m=Buffer.alloc(W*H*4);
  for(let i=0;i<W*H;i++){const v=wm[i]?255:0;m[i*4]=v;m[i*4+1]=v;m[i*4+2]=v;m[i*4+3]=255;}
  return encRGBA(W,H,m);
}

// ── deterministic composite: Master everywhere, donor RGB only inside the write mask ──
function compose(master, donor, wm){
  if(donor.w!==W||donor.h!==H) throw new Error("HARD FAIL: donor is "+donor.w+"x"+donor.h+" (need "+W+"x"+H+")");
  if(master.w!==W||master.h!==H) throw new Error("HARD FAIL: master is "+master.w+"x"+master.h);
  const out=Buffer.from(master.rgba); // start byte-identical to Master (alpha included)
  let written=0;
  for(let i=0;i<W*H;i++){ if(!wm[i])continue;
    out[i*4]=donor.rgba[i*4]; out[i*4+1]=donor.rgba[i*4+1]; out[i*4+2]=donor.rgba[i*4+2]; // RGB only; keep Master alpha
    written++; }
  return {out, written};
}

// Gate A — OUTSIDE the write mask the candidate must equal Master byte-for-byte.
function gateOutside(candidate, master, wm){
  let changed=0,sum=0,max=0;const deltas=[];
  for(let i=0;i<W*H;i++){ if(wm[i])continue;
    let d=0; for(let k=0;k<4;k++)d+=Math.abs(candidate[i*4+k]-master.rgba[i*4+k]); // include alpha
    if(d>0)changed++; sum+=d; if(d>max)max=d; deltas.push(d); }
  deltas.sort((a,b)=>a-b);
  const n=deltas.length||1;
  return { outsidePx:deltas.length, changed, meanDelta:+(sum/n).toFixed(4), p99Delta:+(deltas[Math.floor(0.99*(n-1))]||0).toFixed(1), maxDelta:max, pass: changed===0 };
}

// Gate B — named protected boxes must equal Master exactly.
function gateProtected(candidate, master){
  const rows=[]; let allPass=true;
  for(const B of PROTECTED){ let changed=0;
    for(let y=B.y0;y<=B.y1;y++)for(let x=B.x0;x<=B.x1;x++){const p=(y*W+x)*4;
      let d=0;for(let k=0;k<4;k++)d+=Math.abs(candidate[p+k]-master.rgba[p+k]); if(d>0)changed++; }
    if(changed>0)allPass=false; rows.push({region:B.name,changedPx:changed}); }
  return { pass:allPass, regions:rows };
}

// Gate C — seam: a thin ring just INSIDE the write mask; measure the donor↔Master jump there.
function gateSeam(candidate, master, wm){
  // boundary = write-mask px adjacent to a non-write px; dilate inward SEAM_RING.
  const ring=new Uint8Array(W*H);
  const isBoundary=(x,y)=>{ if(!wm[y*W+x])return false;
    for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){const nx=x+dx,ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H||!wm[ny*W+nx])return true;} return false; };
  const bnd=[]; for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(isBoundary(x,y))bnd.push([x,y]);
  for(const [bx,by] of bnd){ for(let dy=-SEAM_RING;dy<=SEAM_RING;dy++)for(let dx=-SEAM_RING;dx<=SEAM_RING;dx++){
    const nx=bx+dx,ny=by+dy; if(nx<0||ny<0||nx>=W||ny>=H)continue; if(wm[ny*W+nx])ring[ny*W+nx]=1; } }
  let sum=0,max=0,n=0;const deltas=[];
  for(let i=0;i<W*H;i++){ if(!ring[i])continue;
    const d=(Math.abs(candidate[i*4]-master.rgba[i*4])+Math.abs(candidate[i*4+1]-master.rgba[i*4+1])+Math.abs(candidate[i*4+2]-master.rgba[i*4+2]))/3;
    sum+=d; if(d>max)max=d; deltas.push(d); n++; }
  deltas.sort((a,b)=>a-b);
  return { ring, ringPx:n, meanDelta:+(sum/(n||1)).toFixed(3), p99Delta:+(deltas[Math.floor(0.99*((n||1)-1))]||0).toFixed(1), maxDelta:+max.toFixed(1) };
}

// abs-diff visualisation (candidate vs Master), amplified.
function diffViz(candidate, master){
  const v=Buffer.alloc(W*H*4);
  for(let i=0;i<W*H;i++){ let d=0;for(let k=0;k<3;k++)d+=Math.abs(candidate[i*4+k]-master.rgba[i*4+k]);
    const a=Math.min(255,Math.round(d/3*6)); v[i*4]=a; v[i*4+1]=0; v[i*4+2]=Math.round(a*0.4); v[i*4+3]=255; }
  return encRGBA(W,H,v);
}
// seam visualisation: dim Master, ring highlighted red.
function seamViz(master, ring){
  const v=Buffer.alloc(W*H*4);
  for(let i=0;i<W*H;i++){ const g=Math.round((master.rgba[i*4]+master.rgba[i*4+1]+master.rgba[i*4+2])/3*0.35);
    if(ring[i]){ v[i*4]=255; v[i*4+1]=40; v[i*4+2]=40; } else { v[i*4]=g; v[i*4+1]=g; v[i*4+2]=g; } v[i*4+3]=255; }
  return encRGBA(W,H,v);
}

// Expression LAYER extraction from the COMPOSITE, inside the WRITE mask only.
function extractLayer(candidate, wm){
  const face=Buffer.alloc(W*H*4); let px=0;
  for(let i=0;i<W*H;i++){ if(!wm[i])continue;
    const R=candidate[i*4],G=candidate[i*4+1],B2=candidate[i*4+2],A=candidate[i*4+3];
    if(A<=16)continue; if(isSkin(R,G,B2))continue; if(R>=244&&G>=244&&B2>=244)continue;
    face[i*4]=R;face[i*4+1]=G;face[i*4+2]=B2;face[i*4+3]=255;px++; }
  return {buf:encRGBA(W,H,face), px};
}

// Run the full deterministic pipeline on a donor buffer (real API donor OR synthetic selftest donor).
function runPipeline(donorBuf, name, outDir, apiInfo, version, validatorName, meta){
  mkdirSync(outDir,{recursive:true});
  const master=decodePng(readFileSync(MASTER));
  const donor=decodePng(donorBuf);
  const wm=writeMaskField();
  const wmPx=wm.reduce((a,v)=>a+v,0);
  writeFileSync(join(outDir,"write-mask.png"), writeMaskPng(wm));

  const {out:candidate, written}=compose(master, donor, wm);
  writeFileSync(join(outDir,"composite-on-master.png"), encRGBA(W,H,candidate));
  writeFileSync(join(outDir,"diff-vs-master.png"), diffViz(candidate, master));

  const gA=gateOutside(candidate, master, wm);
  const gB=gateProtected(candidate, master);
  const gC=gateSeam(candidate, master, wm);
  writeFileSync(join(outDir,"seam-boundary.png"), seamViz(master, gC.ring));

  const layer=extractLayer(candidate, wm);
  const layerPath=join(outDir,"face-"+name+"-"+version+"-candidate.png");
  writeFileSync(layerPath, layer.buf);

  // Gate D — deterministic expression validator on the extracted layer. The validator name is
  // version-suffixed (e.g. "focused-v2") so its review composites land in their OWN wp3 dir and
  // never overwrite an earlier version's review.
  let gateD="not-run", gateDpass=false;
  try {
    execFileSync(process.execPath,[join(HERE,"validate-face-expression.mjs"),layerPath,validatorName],{stdio:"inherit"});
    gateD="PASS"; gateDpass=true;
  } catch { gateD="FAIL"; gateDpass=false; }

  // classification
  let cls;
  if(!gA.pass || !gB.pass || written===0){ cls="AUTO_REJECT"; }
  else if(!gateDpass){ cls="AUTO_REJECT"; }
  else { cls="REVIEW_REQUIRED"; } // Gate C has no canonical seam threshold ⇒ never auto-pass

  const report={
    tool:"build-face-expr-d042 (master-composite)", expression:name, api:apiInfo,
    writeMaskPx:wmPx, donorWrittenPx:written,
    gateA_outsideWriteMask:gA,
    gateB_protectedRegions:gB,
    gateC_seamRing:{ringPx:gC.ringPx,meanDelta:gC.meanDelta,p99Delta:gC.p99Delta,maxDelta:gC.maxDelta,canonicalThreshold:"none — seam is measured & visualised for owner review, not auto-gated"},
    extractedLayerPx:layer.px, gateD_expressionValidator:gateD,
    classification:cls,
    artifacts:{writeMask:"write-mask.png",genMask:"generation-mask.png",composite:"composite-on-master.png",diff:"diff-vs-master.png",seam:"seam-boundary.png",layer:"face-"+name+"-"+version+"-candidate.png",rawDonor:"raw-donor.png (diagnostic scratch only)",runMetadata:"run-metadata.json"},
    boundaries:"gitignored scratch; no promote; no assets/avatar-r2; no R2_MANIFEST; AVATAR_R2 false; Master untouched",
  };
  writeFileSync(join(outDir,"gates.json"), JSON.stringify(report,null,2));

  // run-metadata.json — provenance for THIS run (no key/headers). classification appended here.
  if(meta){
    writeFileSync(join(outDir,"run-metadata.json"), JSON.stringify({ ...meta, classification:cls }, null, 2));
  }

  console.log("  write mask "+wmPx+"px · donor written "+written+"px");
  console.log("  Gate A outside-write-mask: changed "+gA.changed+" (mean "+gA.meanDelta+", p99 "+gA.p99Delta+", max "+gA.maxDelta+") → "+(gA.pass?"PASS ✓":"FAIL ✗"));
  console.log("  Gate B protected regions: "+(gB.pass?"PASS ✓":"FAIL ✗")+" ["+gB.regions.map(r=>r.region+"="+r.changedPx).join(" ")+"]");
  console.log("  Gate C seam ring ("+gC.ringPx+"px): mean "+gC.meanDelta+" p99 "+gC.p99Delta+" max "+gC.maxDelta+" (no canonical threshold → review)");
  console.log("  extracted layer "+layer.px+"px · Gate D "+gateD);
  console.log("  → classification: "+cls);
  return {report, cls, gA, gB};
}

// ── key-free self-test: synthetic donor that changes EVERY pixel; composite must confine ──
function selfTest(){
  const outDir=join(CHAIN,"expr","selftest");
  mkdirSync(outDir,{recursive:true});
  const master=decodePng(readFileSync(MASTER));
  const wm=writeMaskField();
  const wmPx=wm.reduce((a,v)=>a+v,0);

  // (1) synthetic donor: invert every RGB channel → guaranteed change everywhere.
  const donRgba=Buffer.alloc(W*H*4);
  for(let i=0;i<W*H;i++){donRgba[i*4]=255-master.rgba[i*4];donRgba[i*4+1]=255-master.rgba[i*4+1];donRgba[i*4+2]=255-master.rgba[i*4+2];donRgba[i*4+3]=255;}
  const donorBuf=encRGBA(W,H,donRgba);
  const {report,gA,gB}=runPipeline(donorBuf, "selftest", outDir, {selftest:true, model:"(none)", note:"synthetic inverted donor"}, "v1", "selftest", null);

  const fails=[];
  if(gA.changed!==0) fails.push("outside-write-mask changed "+gA.changed+" px (must be 0)");
  if(gA.meanDelta!==0||gA.p99Delta!==0||gA.maxDelta!==0) fails.push("outside-write-mask metrics not all 0 (mean "+gA.meanDelta+", p99 "+gA.p99Delta+", max "+gA.maxDelta+")");
  if(!gB.pass) fails.push("protected regions changed");
  if(report.donorWrittenPx<=0) fails.push("write mask empty (nothing written)");
  if(report.donorWrittenPx!==wmPx) fails.push("written "+report.donorWrittenPx+" != write mask "+wmPx);

  // (2) wrong-dimension donor must HARD FAIL.
  let hardFailed=false;
  try { compose(decodePng(encRGBA(W-1,H,Buffer.alloc((W-1)*H*4))), master, wm); }
  catch { hardFailed=true; }
  if(!hardFailed) fails.push("wrong-dimension donor did NOT hard-fail");

  console.log("\n── SELF-TEST ──");
  console.log("  write mask non-empty: "+(wmPx>0?"yes ("+wmPx+"px)":"NO"));
  console.log("  synthetic donor changed every pixel; composite confined to write mask: "+(gA.changed===0?"yes ✓":"NO ✗"));
  console.log("  wrong-dimension donor hard-failed: "+(hardFailed?"yes ✓":"NO ✗"));
  if(fails.length){ console.error("\n✘ SELF-TEST FAILED:\n  "+fails.join("\n  ")); process.exit(1); }
  console.log("\n✔ SELF-TEST PASSED — composite is Master-authoritative outside the write mask, hard-fails bad dims. (no API call)");
}

// ── one paid API edit (donor only) — writes into the unique run folder ───────
async function apiEdit(name, outDir){
  const KEY=process.env.OPENAI_API_KEY;
  if(!KEY){ console.error("OPENAI_API_KEY missing (env only; never hardcoded/printed)."); process.exit(1); }
  mkdirSync(outDir,{recursive:true});
  const masterBuf=readFileSync(MASTER);
  const maskPng=genMaskPng();
  writeFileSync(join(outDir,"generation-mask.png"), maskPng);

  const prompt=buildPrompt(name);
  writeFileSync(join(outDir,"prompt.txt"), prompt+"\n"); // no secrets

  const apiInfo={ model:MODEL, endpoint:ENDPOINT, size:SIZE, n:1, calls:1 };
  console.log("D-042 masked edit → "+MODEL+" · '"+name+"' · 1 image · gen-mask = §4.2 ±"+MARGIN+"px");

  const form=new FormData();
  form.append("model", MODEL);
  form.append("image", new Blob([masterBuf],{type:"image/png"}), "master.png");
  form.append("mask", new Blob([maskPng],{type:"image/png"}), "mask.png");
  form.append("prompt", prompt);
  form.append("n","1");
  form.append("size", SIZE);

  const res=await fetch(ENDPOINT,{method:"POST",headers:{Authorization:"Bearer "+KEY},body:form});
  if(!res.ok){
    console.error("OpenAI API error "+res.status+" (model "+MODEL+"): "+(await res.text()).slice(0,500));
    console.error("No further call is made (no auto-retry, no fallback).");
    process.exit(1);
  }
  const json=await res.json();
  const b64=json?.data?.[0]?.b64_json;
  if(!b64){ console.error("No image in API response."); process.exit(1); }
  const donorBuf=Buffer.from(b64,"base64");
  writeFileSync(join(outDir,"raw-donor.png"), donorBuf); // raw donor = diagnostic scratch only
  return {donorBuf, apiInfo, prompt};
}

async function main(){
  const arg=process.argv[2];
  if(arg==="--selftest"){ selfTest(); return; }
  // Key-free prompt preview: node ... --prompt <expression>
  if(arg==="--prompt"){
    const n=process.argv[3];
    if(!n||!FEELING[n]){ console.error("Usage: node tools/avatar/build-face-expr-d042.mjs --prompt <"+Object.keys(FEELING).join("|")+">"); process.exit(1); }
    console.log(buildPrompt(n));
    return;
  }
  const name=arg;
  const version=process.argv[3]||"v2";
  if(!name||!EXPRESSIONS[name]){
    console.error("Usage:\n  node tools/avatar/build-face-expr-d042.mjs --selftest\n  node tools/avatar/build-face-expr-d042.mjs --prompt <name>\n  OPENAI_API_KEY=... node tools/avatar/build-face-expr-d042.mjs <"+Object.keys(EXPRESSIONS).join("|")+"> [version]");
    process.exit(1);
  }
  // Unique run folder — never overwrites an earlier version's artefacts (provenance, spec §3).
  const utc=new Date().toISOString().replace(/:/g,"-");
  const runDir=join(CHAIN,"expr",name,"runs",utc+"-"+MODEL+"-"+version);
  const toolSha=sha256(readFileSync(fileURLToPath(import.meta.url)));
  const masterSha=sha256(readFileSync(MASTER));

  const {donorBuf, apiInfo, prompt}=await apiEdit(name, runDir); // EXACTLY ONE paid call
  const meta={ expression:name, version, model:MODEL, utc:new Date().toISOString(), endpoint:ENDPOINT,
    size:SIZE, n:1, apiCalls:1, masterSha, toolSha, promptChars:prompt.length };
  const {cls}=runPipeline(donorBuf, name, runDir, apiInfo, version, name+"-"+version, meta);
  console.log("\n✔ '"+name+"' "+version+" pipeline complete — classification "+cls+".");
  console.log("  run folder: "+runDir);
  console.log("  Raw AI output is diagnostic scratch only; nothing promoted; AVATAR_R2 false; Master untouched. Owner visual review required.");
}
main();
