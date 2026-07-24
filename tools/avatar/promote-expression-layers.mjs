// 167A Phase-2 Gate 3 — D-042 EXPRESSION-LAYER promotion (deterministic, ALLOWLIST-based, NON-AI).
// ---------------------------------------------------------------------------
// Promotes EXACTLY the four owner-visually-approved expression layers to the tracked Avatar R2
// asset structure, following the neutral-face contract (docs/167a-phase2-gate3-neutral-asset-
// promotion.md · assets/avatar-r2/README.md): source 1024×1536 RGBA PNG → encode-webp.mjs --half
// → 512×768 WebP at assets/avatar-r2/face/face-<expression>-v<version>.webp.
//
// Owner decision 2026-07-24: proud v1 · curious v1 · focused v2 · determined v2 are APPROVED.
// focused v1 and determined v1 are OWNER_REJECTED and must NEVER be promoted.
//
// ALLOWLIST + SHA PIN (no directory scan / no "latest file" / no timestamp choice — the exact
// source path AND its SHA-256 are pinned per entry). The tool HARD-FAILS on: unknown expression,
// wrong version, wrong source SHA, wrong dimensions, missing alpha, wrong destination, any attempt
// to promote focused v1 / determined v1, a changed Northstar Master, or a changed AVATAR_R2.
//
// NO API call · NO image generation · NO manual edit · NO feathering · NO recolour · NO re-extraction.
// Does NOT touch the Master, AVATAR_R2, or the manifest (manifest registration is a separate edit).
//
//   node tools/avatar/promote-expression-layers.mjs            # VERIFY only (no writes)
//   node tools/avatar/promote-expression-layers.mjs --promote  # verify + encode + write tracked WebP
// ---------------------------------------------------------------------------

import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CHAIN = join(HERE, "build", "phase2", "gate3-d057", "expr");
const ENCODER = join(HERE, "encode-webp.mjs");
const DWEBP = join(HERE, "vendor", "dwebp.exe");
const FACE_DIR = join(REPO, "assets", "avatar-r2", "face");
const MASTER = join(REPO, "assets", "avatar", "reference", "Northstar Master.png");
const LAYERS_JS = join(REPO, "js", "avatar-layers.js");
const TMP = join(HERE, "build", "phase2", "gate3-d057", "promote-tmp");

const MASTER_SHA_D032 = "2ca10ef868b9564164f28afc8bb03baec99cc10fd03f7200ed2dc58edd607a21";
const SRC_W = 1024, SRC_H = 1536, OUT_W = 512, OUT_H = 768;

const sha256 = (b) => createHash("sha256").update(b).digest("hex");

// ── the ALLOWLIST — the only four promotable sources, each SHA-pinned ────────
const ALLOWLIST = [
  { expr: "proud", version: 1,
    src: join(CHAIN, "proud", "face-proud-v1-candidate.png"),
    sha: "2b8d1453aaa7088d498004dd257fa8c174ba6473e9185b0c2d2ede3e6226b6a3",
    dest: join(FACE_DIR, "face-proud-v1.webp") },
  { expr: "curious", version: 1,
    src: join(CHAIN, "curious", "face-curious-v1-candidate.png"),
    sha: "c76f57dfe1949d7846ce9980c9e497b14f82a56c3566d71cae5f466974d86d6b",
    dest: join(FACE_DIR, "face-curious-v1.webp") },
  { expr: "focused", version: 2,
    src: join(CHAIN, "focused", "runs", "2026-07-24T17-37-59.450Z-gpt-image-2-2026-04-21-v2", "face-focused-v2-candidate.png"),
    sha: "c19bff26f8c34f936bfe053b2409ba57d1e1a7076d79b3c0d8bae62e6974d5ce",
    dest: join(FACE_DIR, "face-focused-v2.webp") },
  { expr: "determined", version: 2,
    src: join(CHAIN, "determined", "runs", "2026-07-24T17-38-49.052Z-gpt-image-2-2026-04-21-v2", "face-determined-v2-candidate.png"),
    sha: "1f7569ac7d0791adf1a2b14e13b9bb3499ea03450b4349ae6da3c99a8d3ba71e",
    dest: join(FACE_DIR, "face-determined-v2.webp") },
];

// SHAs that must NEVER be promoted (owner-rejected v1). Any match aborts.
const FORBIDDEN = {
  "01bf546c9b1e2d928e547867717a1de66c24b6fedea4c2207265c127732949d4": "focused v1 (OWNER_REJECTED)",
  "230a05c09aa1ed74d450b0ba5c9ac4f096bd92cf5b8e38e96997dd1180ba00ca": "determined v1 (OWNER_REJECTED)",
};

// ── minimal PNG IHDR + alpha probe ───────────────────────────────────────────
function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
function pngInfo(buf){
  let off=8,ihdr=null;const idat=[];
  while(off<buf.length){const len=buf.readUInt32BE(off);const t=buf.toString("ascii",off+4,off+8);const d=buf.subarray(off+8,off+8+len);
    if(t==="IHDR")ihdr={w:d.readUInt32BE(0),h:d.readUInt32BE(4),bit:d[8],ct:d[9]};else if(t==="IDAT")idat.push(d);else if(t==="IEND")break;off+=12+len;}
  const ch=ihdr.ct===6?4:ihdr.ct===2?3:ihdr.ct===4?2:1,stride=ihdr.w*ch;
  const raw=inflateSync(Buffer.concat(idat));const px=Buffer.alloc(ihdr.h*stride);let prev=Buffer.alloc(stride),p=0;
  for(let y=0;y<ihdr.h;y++){const f=raw[p++];const cur=raw.subarray(p,p+stride);p+=stride;const o=px.subarray(y*stride,y*stride+stride);
    for(let x=0;x<stride;x++){const A=x>=ch?o[x-ch]:0,B=prev[x],C=x>=ch?prev[x-ch]:0;let v=cur[x];if(f===1)v+=A;else if(f===2)v+=B;else if(f===3)v+=(A+B)>>1;else if(f===4)v+=paeth(A,B,C);o[x]=v&0xff;}prev=o;}
  let opaque=0,transparent=0,mid=0;
  if(ch===4){for(let i=0;i<ihdr.w*ihdr.h;i++){const a=px[i*4+3];if(a===0)transparent++;else if(a===255)opaque++;else mid++;}}
  return { w:ihdr.w, h:ihdr.h, bit:ihdr.bit, ct:ihdr.ct, hasAlpha:ihdr.ct===6||ihdr.ct===4, opaque, transparent, mid };
}
// decode a WebP via vendored dwebp → probe output dims + alpha
function webpInfo(path){
  mkdirSync(TMP,{recursive:true});
  const out=join(TMP,"probe.png");
  const r=spawnSync(DWEBP,[path,"-o",out],{encoding:"utf8"});
  if(r.status!==0) throw new Error("dwebp failed on "+path+": "+(r.stderr||""));
  return pngInfo(readFileSync(out));
}

function fail(msg){ console.error("✖ HARD FAIL: "+msg); process.exit(1); }

function guards(){
  // Master must be present + byte-identical to D-032; the tool never writes it.
  if(!existsSync(MASTER)) fail("Northstar Master missing");
  const ms=sha256(readFileSync(MASTER));
  if(ms!==MASTER_SHA_D032) fail("Northstar Master SHA "+ms.slice(0,16)+" != D-032 "+MASTER_SHA_D032.slice(0,16)+" (Master must be unchanged)");
  // AVATAR_R2 must still be false; the tool never changes it.
  const js=readFileSync(LAYERS_JS,"utf8");
  if(!/export const AVATAR_R2 = false;/.test(js)) fail("AVATAR_R2 is not `false` in js/avatar-layers.js");
  if(!existsSync(ENCODER)) fail("encoder missing: "+ENCODER);
  console.log("✓ guards: Master = D-032 (unchanged) · AVATAR_R2 = false · encoder present");
}

function verifyEntry(e){
  if(!existsSync(e.src)) fail(e.expr+" v"+e.version+": source missing "+e.src);
  const sha=sha256(readFileSync(e.src));
  if(FORBIDDEN[sha]) fail(e.expr+": source SHA is a FORBIDDEN rejected candidate ("+FORBIDDEN[sha]+")");
  if(sha!==e.sha) fail(e.expr+" v"+e.version+": source SHA "+sha.slice(0,16)+" != pinned "+e.sha.slice(0,16));
  const info=pngInfo(readFileSync(e.src));
  if(info.w!==SRC_W||info.h!==SRC_H) fail(e.expr+": source dims "+info.w+"x"+info.h+" != "+SRC_W+"x"+SRC_H);
  if(info.ct!==6) fail(e.expr+": source colorType "+info.ct+" != 6 (RGBA)");
  if(!info.hasAlpha) fail(e.expr+": source has no alpha");
  if(info.opaque<=0) fail(e.expr+": source has 0 opaque pixels (empty layer)");
  // destination must match the exact contract name
  const expectName="face-"+e.expr+"-v"+e.version+".webp";
  if(!e.dest.endsWith(expectName)) fail(e.expr+": destination "+e.dest+" != expected name "+expectName);
  console.log("  ✓ "+e.expr+" v"+e.version+": src sha "+sha.slice(0,16)+" · "+info.w+"x"+info.h+" RGBA · "+info.opaque+" opaque px · → "+expectName);
  return { ...e, srcSha:sha, srcOpaque:info.opaque };
}

function promoteEntry(v){
  mkdirSync(FACE_DIR,{recursive:true});
  mkdirSync(TMP,{recursive:true});
  // encode with the SAME wrapper/settings as the neutral face: encode-webp.mjs --half (q90/alpha_q100/-m6/-metadata none/-resize 512 0)
  const r1=spawnSync(process.execPath,[ENCODER,v.src,v.dest,"--half"],{encoding:"utf8"});
  if(r1.status!==0) fail(v.expr+": encode failed — "+(r1.stderr||r1.stdout||""));
  // determinism: encode a second time, compare bytes
  const tmp2=join(TMP,"det-"+v.expr+".webp");
  const r2=spawnSync(process.execPath,[ENCODER,v.src,tmp2,"--half"],{encoding:"utf8"});
  if(r2.status!==0) fail(v.expr+": second encode failed");
  const outBuf=readFileSync(v.dest), outSha=sha256(outBuf);
  if(outSha!==sha256(readFileSync(tmp2))) fail(v.expr+": encoder is NOT deterministic (two encodes differ)");
  // verify output dims + alpha
  const oi=webpInfo(v.dest);
  if(oi.w!==OUT_W||oi.h!==OUT_H) fail(v.expr+": output dims "+oi.w+"x"+oi.h+" != "+OUT_W+"x"+OUT_H);
  if(!oi.hasAlpha) fail(v.expr+": output WebP has no alpha channel");
  const size=statSync(v.dest).size;
  console.log("  ✓ "+v.expr+" v"+v.version+" → "+v.dest.replace(REPO+"\\","").replace(REPO+"/","")+"  out sha "+outSha.slice(0,16)+" · "+oi.w+"x"+oi.h+" alpha · "+size+" B · deterministic");
  return { ...v, outSha, size, outW:oi.w, outH:oi.h };
}

function main(){
  const promote=process.argv.includes("--promote");
  console.log("D-042 expression-layer promotion — "+(promote?"--promote":"--verify")+" · allowlist ["+ALLOWLIST.map(e=>e.expr+" v"+e.version).join(", ")+"]");
  guards();
  if(ALLOWLIST.length!==4) fail("allowlist must contain exactly 4 entries (has "+ALLOWLIST.length+")");
  console.log("verifying "+ALLOWLIST.length+" allowlisted sources:");
  const verified=ALLOWLIST.map(verifyEntry);

  if(!promote){
    // report dest presence without writing
    for(const e of verified){ console.log("  dest "+(existsSync(e.dest)?"present":"absent")+": "+e.dest.split(/[\\/]/).pop()); }
    console.log("\n✓ VERIFY PASS — 4 approved sources match the allowlist (SHA/dims/alpha). No writes. Master unchanged; AVATAR_R2 false.");
    return;
  }

  console.log("\npromoting (encode-webp.mjs --half → 512×768 WebP):");
  const done=verified.map(promoteEntry);
  console.log("\n── provenance ──");
  for(const d of done){
    console.log("  "+d.expr+" v"+d.version+" | src "+d.srcSha+" | out "+d.outSha+" | "+d.size+" B | face-"+d.expr+"-v"+d.version+".webp");
  }
  console.log("\n✓ PROMOTED 4 expression WebP layers. Master untouched; AVATAR_R2 false; manifest NOT edited by this tool (separate step). focused v1 / determined v1 NOT promoted.");
}
main();
