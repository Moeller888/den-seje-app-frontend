// 167A Phase-2 Gate 3 — D-042 FACE-EXPRESSION producer (AI-assisted MASKED edit + deterministic gate).
// ---------------------------------------------------------------------------
// Ordered by owner command 2026-07-16 ("fortsæt med udtryksvarianterne").
// This is the ART-PRODUCER step the WP3 worksheet §6 acknowledged: the four
// expression variants (curious, focused, determined, proud) do not exist in
// the Master and are produced per D-042 — "AI-assisted MASKED inpainting on
// the Master ONLY; regeneration/redesign forbidden" (docs/167a-phase2-artist-handoff.md §2).
//
// HARD BOUNDARIES (mirrors the 164O adapter pattern):
//   * EXACTLY ONE expression per invocation (n:1). NO bulk.
//   * API key from env OPENAI_API_KEY only — NEVER hardcoded, NEVER printed/stored.
//   * The ONLY editable region is the §4.2 face-feature mask (brows/nose/mouth
//     boxes ±12 px) — the mask is built deterministically in this tool.
//   * MEASURED anti-drift guard: outside the mask, the edited image must match
//     the Master (mean |Δ| ≤ 2.0, p99 |Δ| ≤ 12) — otherwise the result is
//     REJECTED as free regeneration (D-042 violation) and nothing is kept.
//   * The face layer is then EXTRACTED deterministically (same logic family as
//     build-face-clean.mjs) and auto-gated by validate-face-expression.mjs.
//   * Outputs are gitignored build artifacts. NO runtime change, NO promote,
//     NO assets/avatar-r2, NO R2_MANIFEST, AVATAR_R2 untouched. Master untouched.
//
// Run (one expression at a time; owner review between runs):
//   OPENAI_API_KEY=sk-... node tools/avatar/build-face-expr-d042.mjs curious
//   → build/phase2/gate3-d057/expr/{name}/: edited-full.png · face-{name}-v1-candidate.png
//     · outside-mask-diff.json · then validate-face-expression.mjs runs automatically.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CHAIN = join(HERE, "build", "phase2", "gate3-d057");
const MASTER = join(REPO, "assets", "avatar", "reference", "Northstar Master.png");
const W = 1024, H = 1536;

// §4.2 regions ±12 (the validate-face-expression.mjs contract — keep in sync)
const MARGIN = 12;
const REGIONS = [
  { x0: 396 - MARGIN, y0: 306 - MARGIN, x1: 632 + MARGIN, y1: 340 + MARGIN },   // brows
  { x0: 494 - MARGIN, y0: 438 - MARGIN, x1: 532 + MARGIN, y1: 461 + MARGIN },   // nose
  { x0: 474 - MARGIN, y0: 461 - MARGIN, x1: 552 + MARGIN, y1: 481 + MARGIN },   // mouth
];
// anti-drift acceptance outside the mask
const OUTSIDE_MEAN_MAX = 2.0, OUTSIDE_P99_MAX = 12;

// Positive-only expression set (D-024). One per invocation.
const EXPRESSIONS = {
  curious: "eyebrows raised slightly higher with gentle inner lift, mouth a small open 'o' of curiosity",
  focused: "eyebrows drawn slightly lower and straighter in concentration, mouth a small firm closed line",
  determined: "eyebrows angled down toward the nose with confident energy, mouth a tight confident smile showing determination",
  proud: "eyebrows relaxed and slightly raised, big warm closed-mouth smile of pride and accomplishment",
};

const name = process.argv[2];
if (!name || !EXPRESSIONS[name]) {
  console.error("Usage: OPENAI_API_KEY=sk-... node tools/avatar/build-face-expr-d042.mjs <curious|focused|determined|proud>");
  process.exit(1);
}
const KEY = process.env.OPENAI_API_KEY;
if (!KEY) {
  console.error("OPENAI_API_KEY missing. Run:\n  OPENAI_API_KEY=sk-... node tools/avatar/build-face-expr-d042.mjs " + name +
    "\nThe key is read from env only — never hardcoded, never stored (164O rule).");
  process.exit(1);
}
const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
function decodePng(buf){let off=8,ihdr=null;const idat=[];while(off<buf.length){const len=buf.readUInt32BE(off);const type=buf.toString("ascii",off+4,off+8);const data=buf.subarray(off+8,off+8+len);if(type==="IHDR")ihdr={w:data.readUInt32BE(0),h:data.readUInt32BE(4),bit:data[8],ct:data[9],il:data[12]};else if(type==="IDAT")idat.push(data);else if(type==="IEND")break;off+=12+len;}const ch=ihdr.ct===6?4:3,{w,h}=ihdr,stride=w*ch;const raw=inflateSync(Buffer.concat(idat));const px=Buffer.alloc(h*stride);let prev=Buffer.alloc(stride),p=0;for(let y=0;y<h;y++){const f=raw[p++];const cur=raw.subarray(p,p+stride);p+=stride;const out=px.subarray(y*stride,y*stride+stride);for(let x=0;x<stride;x++){const a=x>=ch?out[x-ch]:0,b=prev[x],c=x>=ch?prev[x-ch]:0;let v=cur[x];if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4)v+=paeth(a,b,c);out[x]=v&0xff;}prev=out;}const rgba=Buffer.alloc(w*h*4);for(let i=0;i<w*h;i++){rgba[i*4]=px[i*ch];rgba[i*4+1]=px[i*ch+1];rgba[i*4+2]=px[i*ch+2];rgba[i*4+3]=ch===4?px[i*ch+3]:255;}return {w,h,rgba};}
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(b){let c=0xffffffff;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&0xff]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const T=Buffer.from(t,"ascii");const cc=Buffer.alloc(4);cc.writeUInt32BE(crc32(Buffer.concat([T,d])),0);return Buffer.concat([l,T,d,cc]);}
function encRGBA(w,h,rgba){const st=w*4,raw=Buffer.alloc(h*(st+1));for(let y=0;y<h;y++){raw[y*(st+1)]=0;rgba.copy(raw,y*(st+1)+1,y*st,y*st+st);}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);}

const inBox=(x,y,B)=>x>=B.x0&&x<=B.x1&&y>=B.y0&&y<=B.y1;
const inMask=(x,y)=>REGIONS.some(r=>inBox(x,y,r));
const isSkin=(r,g,b)=>r>=205&&r>g&&g>=b&&(r-b)>=28&&(r-b)<=135&&g>r*0.70;

async function main(){
  const OUT = join(CHAIN, "expr", name);
  mkdirSync(OUT, { recursive: true });
  const masterBuf = readFileSync(MASTER);
  const M = decodePng(masterBuf);

  // ── 1. deterministic mask: TRANSPARENT = editable (the §4.2 regions), opaque = keep ──
  const mask = Buffer.alloc(W*H*4);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;
    if(inMask(x,y)){mask[i+3]=0;}          // editable
    else{mask[i]=255;mask[i+1]=255;mask[i+2]=255;mask[i+3]=255;}}  // preserved
  const maskPng = encRGBA(W,H,mask);
  writeFileSync(join(OUT,"edit-mask.png"), maskPng);

  // ── 2. ONE masked edit call (D-042 language, no reinterpretation room) ──
  const prompt = [
    "Edit ONLY the transparent masked regions (eyebrows, nose, mouth) of this exact character.",
    "Change the facial expression to: " + EXPRESSIONS[name] + ".",
    "STRICT: same character, same art style, same line weight, same colors, same cel shading.",
    "Do NOT change the eyes, hair, head shape, skin tone, outfit, pose, proportions or anything",
    "outside the masked regions. This is a masked decomposition edit, not a redesign.",
  ].join(" ");

  console.log("D-042 masked edit → " + MODEL + " · expression '" + name + "' · 1 image · mask = §4.2 regions ±" + MARGIN + "px");
  const form = new FormData();
  form.append("model", MODEL);
  form.append("image", new Blob([masterBuf], { type: "image/png" }), "master.png");
  form.append("mask", new Blob([maskPng], { type: "image/png" }), "mask.png");
  form.append("prompt", prompt);
  form.append("n", "1");
  form.append("size", "1024x1536");

  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST", headers: { Authorization: "Bearer " + KEY }, body: form,
  });
  if (!res.ok) {
    console.error("OpenAI API error " + res.status + ": " + (await res.text()).slice(0, 400));
    process.exit(1);
  }
  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) { console.error("No image in API response."); process.exit(1); }
  const edited = Buffer.from(b64, "base64");
  writeFileSync(join(OUT,"edited-full.png"), edited);

  // ── 3. MEASURED anti-drift guard: outside the mask ≈ Master, else REJECT ──
  const Ed = decodePng(edited);
  if (Ed.w !== W || Ed.h !== H) { console.error("REJECT: edited image is " + Ed.w + "x" + Ed.h + " (need " + W + "x" + H + ")."); process.exit(1); }
  const deltas=[];let sum=0,outN=0;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(inMask(x,y))continue;const i=(y*W+x)*4;
    const d=(Math.abs(Ed.rgba[i]-M.rgba[i])+Math.abs(Ed.rgba[i+1]-M.rgba[i+1])+Math.abs(Ed.rgba[i+2]-M.rgba[i+2]))/3;
    deltas.push(d);sum+=d;outN++;}
  deltas.sort((a,b)=>a-b);
  const mean=sum/outN, p99=deltas[Math.floor(0.99*deltas.length)];
  const driftOk = mean<=OUTSIDE_MEAN_MAX && p99<=OUTSIDE_P99_MAX;
  writeFileSync(join(OUT,"outside-mask-diff.json"), JSON.stringify({
    outsidePx:outN, meanDelta:+mean.toFixed(3), p99Delta:+p99.toFixed(1),
    limits:{mean:OUTSIDE_MEAN_MAX,p99:OUTSIDE_P99_MAX}, verdict:driftOk?"PASS":"REJECT (free regeneration — D-042 violation)",
  },null,2));
  console.log("  anti-drift: outside-mask mean Δ " + mean.toFixed(3) + " (max " + OUTSIDE_MEAN_MAX + ") · p99 " + p99.toFixed(1) + " (max " + OUTSIDE_P99_MAX + ") → " + (driftOk?"PASS ✓":"REJECT ✗"));
  if(!driftOk){ console.error("REJECTED: the model altered pixels outside the mask beyond tolerance. Re-run or adjust; nothing extracted."); process.exit(1); }

  // ── 4. deterministic face-layer extraction from the edited image ──
  // same family as build-face-clean.mjs: dark feature line-work inside the regions,
  // skin excluded, composited on the ORIGINAL Master geometry (registration by construction)
  const face = Buffer.alloc(W*H*4);
  let facePx=0;
  for(const r of REGIONS)for(let y=r.y0;y<=r.y1;y++)for(let x=r.x0;x<=r.x1;x++){const i=(y*W+x)*4;
    const R=Ed.rgba[i],G=Ed.rgba[i+1],B2=Ed.rgba[i+2],A=Ed.rgba[i+3];
    if(A<=16)continue;
    if(isSkin(R,G,B2))continue;                        // skin stays in the base
    if(R>=244&&G>=244&&B2>=244)continue;               // background/white
    face[i]=R;face[i+1]=G;face[i+2]=B2;face[i+3]=255;facePx++;}
  const candidate = join(OUT, "face-" + name + "-v1-candidate.png");
  writeFileSync(candidate, encRGBA(W,H,face));
  console.log("  extracted face layer: " + facePx + "px → " + candidate);

  // ── 5. auto-gate: validate-face-expression.mjs (deterministic contract) ──
  try {
    execFileSync(process.execPath, [join(HERE,"validate-face-expression.mjs"), candidate, name], { stdio: "inherit" });
  } catch {
    console.error("GATE FAIL: validate-face-expression.mjs rejected the candidate — see its report.");
    process.exit(1);
  }
  console.log("✔ '" + name + "' candidate produced, anti-drift PASS, contract gate PASS — awaiting OWNER identity review (composites in build/phase2/gate3-d057/wp3/validate-" + name + "/).");
}
main();
