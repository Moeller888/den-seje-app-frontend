// R2 neutral base — arm-fringe fix (owner-approved Candidate B). Deterministic, NON-AI.
// ---------------------------------------------------------------------------
// WHAT / WHY
// D-059 removed the R2 alpha fringe on trousers/shoes but left a light matte band
// on the forearms/wrists/hands; D-060 measured that 91.9% of that band sits INSIDE
// the D-058 protect contract, so no protect-diff=0 fix was possible. The owner then
// approved a NARROW, temporary write-exception for exactly that arm matte and
// selected Candidate B from the review pack. This tool reproduces Candidate B
// deterministically and, with --promote, writes the tracked artefacts.
//
// The fix, restricted to the arm/wrist/hand write-exception:
//   * near-white matte (luma >= 215) on the OUTER silhouette edge (dist-to-void 1-3)
//     in the arm columns, INSIDE protect;
//   * connected matte  -> RGB recoloured to the nearest interior SKIN colour
//     (region-aware BFS from skin only; never samples matte, tee or trouser).
//     ALPHA IS UNCHANGED -> no erosion, no shape change, no new outline;
//   * detached matte    -> alpha cleared (not the main figure, not erosion).
// Nothing outside the exception mask is touched. The D-058 protect PNG is never
// written; the D-057 source PNG is never overwritten.
//
// IDEMPOTENT / REPRODUCIBLE (finding F2):
//   The runtime is both the INPUT (D-059, pre-fix) and the OUTPUT (D-061, promoted). The tool
//   accepts EITHER on disk. From the D-059 input it re-derives the fix; from the already-promoted
//   D-061 output the exception mask is empty (the matte is already recoloured), so re-derivation
//   changes nothing and re-encodes to the identical file. Either way it reproduces exactly the
//   three tracked artefacts, so a fresh clone on main can verify provenance without the pre-fix
//   blob, and `--promote` is safe to re-run (byte-identical, tree stays clean).
//
// HARD-FAIL INVARIANTS (any violation aborts before writing anything):
//   * D-057 source + D-058 protect hashes locked; runtime == D-059 input OR D-061 output
//   * main-figure alpha unchanged (alphaMainDiff == 0)
//   * zero change outside the exception mask (source + runtime)
//   * protect-diff outside the exception == 0
//   * two independent encodes are byte-identical (determinism)
//   * runtime keeps D-059's trouser/shoe result (change is exception-only)
//   * derived artefacts equal the tracked D-061 outputs byte-for-byte (exc / source / runtime sha)
//   * idempotency: re-running over the promoted D-061 runtime touches 0 px
//
// USAGE (PowerShell):
//   node tools/avatar/build-r2-arm-fringe-fix.mjs            # verify + dry-run (idempotent on main)
//   node tools/avatar/build-r2-arm-fringe-fix.mjs --promote  # write tracked artefacts (no-op if current)
//
// Requires the vendored encoders (gitignored, fetchable):
//   node tools/avatar/fetch-dwebp.mjs   (dwebp + cwebp 1.5.0)
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const DRY = join(HERE, "build", "r2-arm-fringe-fix");
const DWEBP = join(HERE, "vendor", "dwebp.exe");
const CWEBP = join(HERE, "vendor", "cwebp.exe");

// ── locked inputs ────────────────────────────────────────────────────────────
const SRC_PNG   = join(REPO, "assets", "avatar", "reference", "neutral-base-v1-gate2-d053.png");
const PROT_PNG  = join(REPO, "assets", "avatar", "reference", "gate2-protect-mask-v2.1.png");
const RUNTIME   = join(REPO, "assets", "avatar-r2", "base", "body-neutral-medium-v2.webp");
const SRC_SHA   = "2cb93ee00be89d16d1b1e9cae9781b596f931a52fd6f667238c9e9bda38afe4b";
const PROT_SHA  = "302324b7b9c0acb124c982294d1b85feb9edbf467aaad0f0a52b2c7e96f692f5";
// The runtime is BOTH the input (D-059, pre-fix) AND the output (D-061, promoted). The tool
// accepts EITHER so it stays reproducible/verifiable after promotion (finding F2):
//   * RT_SHA     — the D-059 pre-fix runtime: re-derives the fix from scratch.
//   * RT_OUT_SHA — the D-061 promoted runtime already on main: re-derivation is a verified
//                  no-op (the arm matte is already recoloured, so the exception mask is empty).
// Both paths must produce exactly RT_OUT_SHA. Any other blob is rejected.
const RT_SHA    = "3a30d8c7bc29a4813e9f4f2902fed26235b3458a56f733c11067559968da4f37";
const RT_OUT_SHA = "28765eea616dd92beb73273c67d6d603cabd9f92af8057d2d9a5fe50c01032f9";

// ── promotion targets ────────────────────────────────────────────────────────
const OUT_EXC   = join(REPO, "assets", "avatar", "reference", "arm-fringe-write-exception-v1.png");
const OUT_SRC   = join(REPO, "assets", "avatar", "reference", "neutral-base-v2-armfringe.png");
const OUT_RT    = RUNTIME; // overwritten in place on --promote

// ── expected outputs (the D-061 promoted artefacts already tracked on main) ──
// The tool self-verifies it reproduces exactly these byte-for-byte — from the D-059 input
// OR idempotently from the already-promoted D-061 runtime. A mismatch hard-fails.
const EXC_OUT_SHA = "47dbec44a7ef6c3b196fef18d81e0cba72572c6df04f07305c07ae96c998a6c5";
const SRC_OUT_SHA = "347a258fb962db383d5fc8b5271c613fd873319b4416d31e80651f7f20dca165";

// ── exception definition (owner-approved Candidate B) ────────────────────────
const SRC_NW = 215, SRC_EDGE = 3, SRC_Y0 = 700, SRC_Y1 = 1190, SRC_TX0 = 380, SRC_TX1 = 624;
const RT_NW  = 215, RT_EDGE  = 2, RT_Y0  = 350, RT_Y1  = 595,  RT_TX0  = 190, RT_TX1  = 312;

// ── minimal PNG codec (deterministic) ────────────────────────────────────────
function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
function decodePng(buf){let off=8,ihdr=null;const idat=[];while(off<buf.length){const len=buf.readUInt32BE(off);const type=buf.toString("ascii",off+4,off+8);const data=buf.subarray(off+8,off+8+len);if(type==="IHDR")ihdr={w:data.readUInt32BE(0),h:data.readUInt32BE(4),ct:data[9]};else if(type==="IDAT")idat.push(data);else if(type==="IEND")break;off+=12+len;}const ct=ihdr.ct,ch=ct===6?4:ct===2?3:ct===0?1:ct===4?2:1;const{w,h}=ihdr,stride=w*ch;const raw=inflateSync(Buffer.concat(idat));const px=Buffer.alloc(h*stride);let prev=Buffer.alloc(stride),p=0;for(let y=0;y<h;y++){const f=raw[p++];const cur=raw.subarray(p,p+stride);p+=stride;const out=px.subarray(y*stride,y*stride+stride);for(let x=0;x<stride;x++){const a=x>=ch?out[x-ch]:0,b=prev[x],c=x>=ch?prev[x-ch]:0;let v=cur[x];if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4)v+=paeth(a,b,c);out[x]=v&0xff;}prev=out;}const rgba=Buffer.alloc(w*h*4);for(let i=0;i<w*h;i++){if(ct===6){rgba[i*4]=px[i*ch];rgba[i*4+1]=px[i*ch+1];rgba[i*4+2]=px[i*ch+2];rgba[i*4+3]=px[i*ch+3];}else if(ct===2){rgba[i*4]=px[i*ch];rgba[i*4+1]=px[i*ch+1];rgba[i*4+2]=px[i*ch+2];rgba[i*4+3]=255;}else if(ct===0){const g=px[i*ch];rgba[i*4]=g;rgba[i*4+1]=g;rgba[i*4+2]=g;rgba[i*4+3]=255;}else{const g=px[i*ch];rgba[i*4]=g;rgba[i*4+1]=g;rgba[i*4+2]=g;rgba[i*4+3]=px[i*ch+1];}}return{w,h,rgba};}
const CRC=(()=>{const t=new Uint32Array(256);for(let nn=0;nn<256;nn++){let c=nn;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[nn]=c>>>0;}return t;})();
function crc32(b){let c=0xffffffff;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&0xff]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const T=Buffer.from(t,"ascii");const cc=Buffer.alloc(4);cc.writeUInt32BE(crc32(Buffer.concat([T,d])),0);return Buffer.concat([l,T,d,cc]);}
function encPng(w,h,rgba){const st=w*4,raw=Buffer.alloc(h*(st+1));for(let y=0;y<h;y++){raw[y*(st+1)]=0;rgba.copy(raw,y*(st+1)+1,y*st,y*st+st);}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);}

const sha = (b) => createHash("sha256").update(b).digest("hex");
const luma = (r,g,b) => 0.2126*r + 0.7152*g + 0.0722*b;

function decodeWebp(path, tag){ mkdirSync(DRY,{recursive:true}); const png=join(DRY,tag+".png"); const r=spawnSync(DWEBP,[path,"-o",png],{encoding:"utf8"}); if(r.status!==0)throw new Error("dwebp failed: "+(r.stderr||"")); return decodePng(readFileSync(png)); }
function encodeWebpLossless(pngPath,outPath){ const r=spawnSync(CWEBP,["-lossless","-exact","-z","9","-metadata","none",pngPath,"-o",outPath],{encoding:"utf8"}); if(r.status!==0)throw new Error("cwebp failed: "+(r.stderr||"")); return readFileSync(outPath); }

// ── shared geometry helpers over an {w,h,rgba} image ─────────────────────────
function distToTransparent(img, maxd){ const {w,h,rgba}=img,n=w*h; const d=new Int32Array(n).fill(-1); const q=new Int32Array(n);let qh=0,qt=0; for(let i=0;i<n;i++) if(rgba[i*4+3]===0){d[i]=0;q[qt++]=i;} const nb=[-w,w,-1,1]; while(qh<qt){const i=q[qh++];if(d[i]>=maxd)continue;const x=i%w;for(let k=0;k<4;k++){if(k===2&&x===0)continue;if(k===3&&x===w-1)continue;const j=i+nb[k];if(j<0||j>=n||d[j]!==-1)continue;d[j]=d[i]+1;q[qt++]=j;}} return d; }
function isSkin(rgba,i){ const r=rgba[i*4],g=rgba[i*4+1],b=rgba[i*4+2]; return rgba[i*4+3]===255 && r>150 && r>g && g>=b && (r-b)>40 && luma(r,g,b)<215; }
function nearestSkin(img){ const {w,h,rgba}=img,n=w*h; const s=new Int32Array(n).fill(-1); const q=new Int32Array(n);let qh=0,qt=0; for(let i=0;i<n;i++) if(isSkin(rgba,i)){s[i]=i;q[qt++]=i;} const nb=[-w,w,-1,1]; while(qh<qt){const i=q[qh++];const x=i%w;for(let k=0;k<4;k++){if(k===2&&x===0)continue;if(k===3&&x===w-1)continue;const j=i+nb[k];if(j<0||j>=n||s[j]!==-1)continue;s[j]=s[i];q[qt++]=j;}} return s; }
function mainComponent(img){ const {w,h,rgba}=img,n=w*h; const label=new Int32Array(n).fill(-1); const comps=[]; const st=new Int32Array(n); for(let seed=0;seed<n;seed++){ if(rgba[seed*4+3]===0||label[seed]!==-1)continue; const id=comps.length; let sp=0,cnt=0; st[sp++]=seed;label[seed]=id; while(sp>0){const i=st[--sp];cnt++;const x=i%w,y=(i-x)/w;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;const j=ny*w+nx;if(rgba[j*4+3]===0||label[j]!==-1)continue;label[j]=id;st[sp++]=j;}} comps.push(cnt);} let m=0;for(let k=0;k<comps.length;k++)if(comps[k]>comps[m])m=k; return {label,mainId:m}; }
function protMask(prot){ const n=prot.w*prot.h; const p=new Uint8Array(n); for(let i=0;i<n;i++){const a=prot.rgba[i*4+3];if(a>0&&(prot.rgba[i*4]>0||prot.rgba[i*4+1]>0||prot.rgba[i*4+2]>0))p[i]=1;} return p; }

// exception predicate (protect-aware for source; column-gated for runtime)
function excMask(img, {nw,edge,y0,y1,tx0,tx1}, isProtFn){
  const {w,h,rgba}=img,n=w*h; const dist=distToTransparent(img, edge+2); const m=new Uint8Array(n);
  for(let y=y0;y<=y1;y++) for(let x=0;x<w;x++){ const i=y*w+x; if(rgba[i*4+3]===0)continue;
    if(isProtFn && !isProtFn(i)) continue;
    if(x>=tx0&&x<=tx1) continue;
    if(dist[i]<1||dist[i]>edge) continue;
    if(luma(rgba[i*4],rgba[i*4+1],rgba[i*4+2])<nw) continue;
    m[i]=1; }
  return m;
}

// apply the fix: connected matte -> nearest skin RGB (alpha unchanged); detached -> clear
function applyFix(img){
  const {w,h,rgba}=img,n=w*h; const out=Buffer.from(rgba);
  const {label,mainId}=mainComponent(img); const skin=nearestSkin(img);
  return { out, label, mainId, skin };
}

function buildSource(){
  const src = decodePng(readFileSync(SRC_PNG)); const prot = decodePng(readFileSync(PROT_PNG));
  if(src.w!==1024||src.h!==1536) throw new Error("source dims "+src.w+"x"+src.h);
  const P = protMask(prot); const isP=(i)=>P[i]===1;
  const mask = excMask(src, {nw:SRC_NW,edge:SRC_EDGE,y0:SRC_Y0,y1:SRC_Y1,tx0:SRC_TX0,tx1:SRC_TX1}, isP);
  const {out,label,mainId,skin} = applyFix(src);
  let connected=0,detached=0,noSkin=0;
  const n=src.w*src.h;
  for(let i=0;i<n;i++){ if(!mask[i])continue;
    if(label[i]!==mainId){ out[i*4]=0;out[i*4+1]=0;out[i*4+2]=0;out[i*4+3]=0; detached++; }
    else { const s=skin[i]; if(s<0){noSkin++;continue;} out[i*4]=src.rgba[s*4];out[i*4+1]=src.rgba[s*4+1];out[i*4+2]=src.rgba[s*4+2]; connected++; } }
  // verify
  let alphaMainDiff=0, protOutsideExcDiff=0, outsideExcDiff=0;
  for(let i=0;i<n;i++){ const aC=src.rgba[i*4+3]!==out[i*4+3]; let rC=false;for(let k=0;k<3;k++)if(src.rgba[i*4+k]!==out[i*4+k]){rC=true;break;}
    if(label[i]===mainId&&aC)alphaMainDiff++; if(!mask[i]&&(aC||rC))outsideExcDiff++; if(!mask[i]&&isP(i)&&(aC||rC))protOutsideExcDiff++; }
  return { src, prot, mask, out, connected, detached, noSkin, verify:{alphaMainDiff,protOutsideExcDiff,outsideExcDiff} };
}

function buildRuntime(){
  const rt = decodeWebp(RUNTIME, "runtime-current");
  if(rt.w!==512||rt.h!==768) throw new Error("runtime dims "+rt.w+"x"+rt.h);
  const mask = excMask(rt, {nw:RT_NW,edge:RT_EDGE,y0:RT_Y0,y1:RT_Y1,tx0:RT_TX0,tx1:RT_TX1}, null);
  const {out,label,mainId,skin} = applyFix(rt);
  let connected=0,detached=0,noSkin=0; const n=rt.w*rt.h;
  for(let i=0;i<n;i++){ if(!mask[i])continue;
    if(label[i]!==mainId){ out[i*4]=0;out[i*4+1]=0;out[i*4+2]=0;out[i*4+3]=0; detached++; }
    else { const s=skin[i]; if(s<0){noSkin++;continue;} out[i*4]=rt.rgba[s*4];out[i*4+1]=rt.rgba[s*4+1];out[i*4+2]=rt.rgba[s*4+2]; connected++; } }
  let alphaMainDiff=0, outsideMaskDiff=0;
  for(let i=0;i<n;i++){ const aC=rt.rgba[i*4+3]!==out[i*4+3]; let rC=false;for(let k=0;k<3;k++)if(rt.rgba[i*4+k]!==out[i*4+k]){rC=true;break;}
    if(label[i]===mainId&&aC)alphaMainDiff++; if(!mask[i]&&(aC||rC))outsideMaskDiff++; }
  return { rt, mask, out, connected, detached, noSkin, verify:{alphaMainDiff,outsideMaskDiff} };
}

function main(){
  const promote = process.argv.includes("--promote");
  if(!existsSync(DWEBP)||!existsSync(CWEBP)){ console.error("✖ missing vendored encoders — run: node tools/avatar/fetch-dwebp.mjs"); process.exit(3); }
  mkdirSync(DRY,{recursive:true});

  // 1) input hash lock
  const inHash = { src: sha(readFileSync(SRC_PNG)), prot: sha(readFileSync(PROT_PNG)), rt: sha(readFileSync(RUNTIME)) };
  const bad = [];
  if(inHash.src!==SRC_SHA) bad.push(`D-057 source ${inHash.src}`);
  if(inHash.prot!==PROT_SHA) bad.push(`D-058 protect ${inHash.prot}`);
  // runtime: accept the D-059 input (fresh derivation) OR the D-061 output (idempotent no-op)
  let rtPromoted = false;
  if(inHash.rt===RT_SHA) rtPromoted = false;
  else if(inHash.rt===RT_OUT_SHA) rtPromoted = true;
  else bad.push(`runtime ${inHash.rt} (neither D-059 input ${RT_SHA.slice(0,12)}… nor D-061 output ${RT_OUT_SHA.slice(0,12)}…)`);
  if(bad.length){ console.error("✖ input hash mismatch:\n  "+bad.join("\n  ")); process.exit(4); }
  console.log(rtPromoted
    ? "✓ inputs hash-locked (D-057 / D-058; runtime already = D-061 output → idempotent verify mode)"
    : "✓ inputs hash-locked (D-057 / D-058 / D-059 input)");

  // 2) build source + runtime candidate B
  const S = buildSource();
  const R = buildRuntime();

  // exception mask PNG (source coords)
  const excRgba = Buffer.alloc(S.src.w*S.src.h*4);
  for(let i=0;i<S.mask.length;i++){ const v=S.mask[i]?255:0; excRgba[i*4]=v;excRgba[i*4+1]=v;excRgba[i*4+2]=v;excRgba[i*4+3]=255; }
  const excPng = encPng(S.src.w, S.src.h, excRgba);
  const srcPng = encPng(S.src.w, S.src.h, S.out);

  // encode runtime candidate lossless (deterministic double-encode)
  const rtPngPath = join(DRY,"rt-candidate.png"); writeFileSync(rtPngPath, encPng(R.rt.w,R.rt.h,R.out));
  const rt1 = encodeWebpLossless(rtPngPath, join(DRY,"rt-candidate.webp"));
  const rt2 = encodeWebpLossless(rtPngPath, join(DRY,"rt-candidate-2nd.webp"));
  const rtDet = sha(rt1)===sha(rt2);
  const rtRound = decodeWebp(join(DRY,"rt-candidate.webp"), "rt-roundtrip");
  let rAlpha=0,rRgb=0; for(let i=0;i<R.rt.w*R.rt.h;i++){ if(rtRound.rgba[i*4+3]!==R.out[i*4+3])rAlpha++; for(let k=0;k<3;k++)if(rtRound.rgba[i*4+k]!==R.out[i*4+k]){rRgb++;break;} }

  const excSha=sha(excPng), srcCandSha=sha(srcPng), rtSha=sha(rt1);

  // 3) HARD-FAIL invariants
  const fail=[];
  if(S.verify.alphaMainDiff!==0) fail.push(`source alphaMainDiff=${S.verify.alphaMainDiff}`);
  if(S.verify.outsideExcDiff!==0) fail.push(`source outsideExcDiff=${S.verify.outsideExcDiff}`);
  if(S.verify.protOutsideExcDiff!==0) fail.push(`source protOutsideExcDiff=${S.verify.protOutsideExcDiff}`);
  if(S.noSkin!==0) fail.push(`source noSkin=${S.noSkin}`);
  if(R.verify.alphaMainDiff!==0) fail.push(`runtime alphaMainDiff=${R.verify.alphaMainDiff}`);
  if(R.verify.outsideMaskDiff!==0) fail.push(`runtime outsideMaskDiff=${R.verify.outsideMaskDiff}`);
  if(R.noSkin!==0) fail.push(`runtime noSkin=${R.noSkin}`);
  if(!rtDet) fail.push("runtime encode not deterministic");
  if(rAlpha!==0||rRgb!==0) fail.push(`runtime lossless roundtrip not exact (a=${rAlpha},rgb=${rRgb})`);
  // reproduction: the derived artefacts must equal the tracked D-061 outputs byte-for-byte
  if(excSha!==EXC_OUT_SHA) fail.push(`exception mask sha ${excSha.slice(0,16)} != tracked ${EXC_OUT_SHA.slice(0,16)}`);
  if(srcCandSha!==SRC_OUT_SHA) fail.push(`source cand sha ${srcCandSha.slice(0,16)} != tracked ${SRC_OUT_SHA.slice(0,16)}`);
  if(rtSha!==RT_OUT_SHA) fail.push(`runtime sha ${rtSha.slice(0,16)} != tracked D-061 ${RT_OUT_SHA.slice(0,16)}`);
  // idempotency: re-running over the already-promoted D-061 runtime must change nothing
  if(rtPromoted && (R.mask.reduce((s,v)=>s+v,0)!==0 || (R.connected+R.detached)!==0))
    fail.push(`idempotency broken: re-run over promoted runtime touched ${R.connected+R.detached} px (mask ${R.mask.reduce((s,v)=>s+v,0)})`);

  console.log(`\nexception mask : ${S.mask.reduce((s,v)=>s+v,0)} px (connected ${S.connected}, detached ${S.detached})  sha ${excSha.slice(0,16)}  ${excPng.length} B`);
  console.log(`source cand B  : ${S.src.w}x${S.src.h}  sha ${srcCandSha.slice(0,16)}  ${srcPng.length} B`);
  console.log(`  verify: alphaMainDiff=${S.verify.alphaMainDiff} protOutsideExcDiff=${S.verify.protOutsideExcDiff} outsideExcDiff=${S.verify.outsideExcDiff}`);
  console.log(`runtime cand B : ${R.rt.w}x${R.rt.h}  sha ${rtSha.slice(0,16)}  ${rt1.length} B  changed ${R.connected+R.detached} px`);
  console.log(`  verify: alphaMainDiff=${R.verify.alphaMainDiff} outsideMaskDiff=${R.verify.outsideMaskDiff} det=${rtDet} roundtrip(a=${rAlpha},rgb=${rRgb})`);

  if(fail.length){ console.error("\n✖ INVARIANT FAILURE — nothing written:\n  "+fail.join("\n  ")); process.exit(5); }
  console.log(rtPromoted
    ? "\n✓ all invariants hold — runtime already promoted (D-061); re-derivation is a verified byte-identical no-op"
    : "\n✓ all invariants hold");

  if(!promote){ console.log("\n(dry-run) pass --promote to write"+(rtPromoted?" (byte-identical no-op — tree stays clean)":"")+":\n  "+OUT_EXC+"\n  "+OUT_SRC+"\n  "+OUT_RT); return; }

  writeFileSync(OUT_EXC, excPng);
  writeFileSync(OUT_SRC, srcPng);
  writeFileSync(OUT_RT, rt1);
  console.log("\n✓ PROMOTED:");
  console.log("  "+OUT_EXC+"  sha "+sha(readFileSync(OUT_EXC)).slice(0,16));
  console.log("  "+OUT_SRC+"  sha "+sha(readFileSync(OUT_SRC)).slice(0,16));
  console.log("  "+OUT_RT+"  sha "+sha(readFileSync(OUT_RT)).slice(0,16)+"  "+readFileSync(OUT_RT).length+" B");
  console.log("  (D-057 source + D-058 protect left byte-identical; AVATAR_R2 unchanged)");
}
main();
