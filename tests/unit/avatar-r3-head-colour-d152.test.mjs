// D-152 — the closure of D-151's one send (HTTP 400, no image) and the preparation-only correction of the
// background parameter (transparent -> opaque). No network, no claim, no key: nothing here can send.
//
// What is proven:
//   · D-151 is closed in place and can never be used again; its history is reproducible canonically.
//   · The D-152 preparation adapter builds the corrected request deterministically and cannot send.
//   · ALPHA: the final candidate's alpha, geometry, K4, TRANSITION, PROTECT₂ and every pixel outside the head
//     geometry do not depend on the output's alpha — so an opaque output is safe for those — and the two
//     things that DO change (RGB-only PNGs, and alpha-based coverage going blind) are handled explicitly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePngRGBA } from "../../tools/avatar/build-r2-torso-occlusion-mask.mjs";
import { OUT_W, OUT_H } from "../../tools/avatar/build-r3-head-edit-masks.mjs";
import { pngToContour, FIXTURE_DIR as GEO_DIR, FILES as GEO_FILES, K4 } from "../../tools/avatar/build-r3-head-geometry.mjs";
import { loadInputs, apiMaskToEditable, finalModelRgbRegion, apiContextMargin, FIXTURE_DIR, FILES, SEAM } from "../../tools/avatar/build-r3-head-colour-fixtures.mjs";
import { processOutput, decodeOutput, ColourGateError } from "../../tools/avatar/process-r3-head-colour-output.mjs";
import { decodeOutputRgbOrRgba, backgroundLeakGate, LEAK_RULE } from "../../tools/avatar/r3-head-colour-opaque-output.mjs";
import * as D152 from "../../tools/avatar/prepare-r3-head-colour-call-d152.mjs";
import { preD152Contract, PRE_D152_CONTRACT_CANONICAL_SHA256, PRE_D152, D152_ADDED_D151_KEYS, preD153Contract, PRE_D153_CONTRACT_CANONICAL_SHA256 } from "./avatar-r3-d147-closure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const N = OUT_W * OUT_H;
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const repoFile = (rel) => join(REPO, ...rel.split("/"));
const LIVE = JSON.parse(readFileSync(repoFile("tools/avatar/fixtures/r3/r3-shadow-contract-v1.json"), "utf8"));
// D-153 later ADDED one authorisation. This suite tests the contract AS D-152 LEFT IT: C is the live contract with exactly
// D-153's additions removed, required below to be canonically identical to the contract at the D-153 base commit.
const C = preD153Contract(LIVE);
const REG = readFileSync(repoFile("docs/project-state.md"), "utf8").split("\n");
const D151 = C.authorisedCalls.calls.find((e) => e.decision === "D-151");
const PREP_REL = "tools/avatar/prepare-r3-head-colour-call-d152.mjs";
const OPAQUE_REL = "tools/avatar/r3-head-colour-opaque-output.mjs";
const strip = (s) => s.split("\n").filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");
const H1_PATH = process.env.FITTING_BASE_V1_PATH;
const H1_OK = typeof H1_PATH === "string" && (() => { try { return sha256(readFileSync(H1_PATH)) === "72875565ecd62b542a91156dbcca1399a434fe04634f4e737df71337be0d5af4"; } catch (_) { return false; } })();
const NEED_H1 = { skip: !H1_OK && "FITTING_BASE_V1_PATH (the pinned H1) is not available" };

// ── D-151 closed ─────────────────────────────────────────────────────────────────────────────

test("D-151 is closed in place: SPENT, never reused, not a permission, with its exact outcome", () => {
  assert.equal(D151.status, "SPENT — SENT ONCE, HTTP 400, NO IMAGE, NOTHING PROMOTED");
  assert.equal(D151.mandateState, "SPENT"); assert.equal(D151.neverReuse, true); assert.equal(D151.notAnActivePermission, true);
  assert.equal(D151.callId, "D-151-r3-head-colour-u1-v1"); assert.equal(D151.claim.identity, "D-151-r3-head-colour-u1-v1-claim");
  assert.equal(D151.closure.closedBy, "D-152");
  const x = D151.execution;
  assert.deepEqual([x.request.fetches, x.request.retried, x.response.httpStatus, x.response.imagesReturned], [1, false, 400, 0]);
  assert.deepEqual([x.response.errorType, x.response.errorCode, x.response.errorParam], ["image_generation_user_error", "invalid_value", "background"]);
  assert.equal(x.response.errorMessage, "Transparent background is not supported for this model.");
  assert.equal(x.request.parameters.background, "transparent");
  assert.equal(x.claim.status, "SPENT_BEFORE_FETCH");
  assert.match(x.claim.sha256, /^[0-9a-f]{64}$/); assert.match(x.manifest.sha256, /^[0-9a-f]{64}$/); assert.match(x.response.bodySha256, /^[0-9a-f]{64}$/);
  assert.ok(Date.parse(x.claim.claimedAt) >= Date.parse(x.request.startedAt) && Date.parse(x.claim.claimedAt) <= Date.parse(x.response.finishedAt), "claimed before the fetch returned");
  assert.match(x.raw, /^NONE/); assert.match(x.candidate, /^NONE/); assert.equal(x.promotion, "NONE");
  assert.match(D151.closure.neverReused, /never reused/);
});

test("the closure changed only status, mandateState and added keys; the D-151 commit's contract is reproduced canonically", () => {
  const pre = preD152Contract(C);
  assert.equal(sha256(JSON.stringify(pre)), PRE_D152_CONTRACT_CANONICAL_SHA256);
  const preEntry = pre.authorisedCalls.calls.find((e) => e.decision === "D-151");
  assert.equal(sha256(JSON.stringify(preEntry)), D151.closure.snapshotCanonicalSha256BeforeClosure, "the recorded snapshot is the committed entry");
  for (const k of Object.keys(preEntry)) if (!["status", "mandateState"].includes(k)) assert.deepEqual(D151[k], preEntry[k], "authorisation field " + k + " is unchanged");
  assert.deepEqual(Object.keys(D151).filter((k) => !(k in preEntry)).sort(), [...D152_ADDED_D151_KEYS].sort());
  assert.equal(PRE_D152.d151.mandateState, "UNSPENT", "as committed, D-151 was the one live permission");
});

test("as D-152 left it, the contract is reproduced canonically, and D-151 is still closed in the live contract", () => {
  assert.equal(sha256(JSON.stringify(C)), PRE_D153_CONTRACT_CANONICAL_SHA256);
  const live151 = LIVE.authorisedCalls.calls.find((e) => e.decision === "D-151");
  assert.deepEqual(live151, D151, "D-153 does not touch D-151's entry");
  assert.equal(LIVE.imageCallBudget.callsActuallySentSoFar.underlay, 4, "D-153 does not count a send it has not made");
});

test("no live permission remains, the prose says so, and D-152 adds no authorisation", () => {
  assert.equal(C.authorisedCalls.calls.length, 4);
  assert.deepEqual(C.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT"), []);
  assert.ok(!C.authorisedCalls.calls.some((e) => e.decision === "D-152"), "D-152 has no entry");
  const t = C.prohibitions.noImageRequestAuthorised;
  assert.match(t, /\(4\) D-151-r3-head-colour-u1-v1 — NO LONGER a permission/);
  assert.match(t, /No entry in this list is an active send permission/);
  assert.match(t, /D-152 is preparation only and adds no entry/);
  assert.equal(C.meta.authorisesImageRequest, false);
});

test("the budget counts D-151's one send; D-152 adds nothing", () => {
  const b = C.imageCallBudget;
  assert.equal(b.callsActuallySentSoFar.underlay, 4);
  assert.equal(b.callsActuallySentSoFar.which.filter((w) => w.startsWith("D-151 ")).length, 1);
  assert.ok(!b.callsActuallySentSoFar.which.some((w) => /D-152/.test(w.split(" — ")[0])), "D-152 is never counted as a send");
  assert.equal(b.callsPlannedAndAuthorised.underlay, 4); assert.equal(b.callsPlannedAndAuthorised.derivedBudget, "18-19");
  assert.deepEqual([b.minimum, b.maximum, C.assets[0].calls, b.isAuthorisation], [18, 19, 4, false]);
  assert.equal(PRE_D152.callsActuallySentSoFar.underlay, 3, "before D-152 the D-151 send was not counted");
});

test("the register: D-151's row is verbatim, D-152's row follows it once and records the outcome and the preparation", () => {
  const d151 = REG.filter((l) => l.startsWith("| **D-151** |"));
  assert.equal(d151.length, 1);
  assert.equal(sha256(d151[0]), "0c438704de254728e77be4bfac39c89a2ecfb510aa5fcb0e0f4cb431ff845d7c", "the D-151 row is byte-identical to its commit");
  const rows = REG.filter((l) => l.startsWith("| **D-152** |"));
  assert.equal(rows.length, 1);
  assert.equal(REG.findIndex((l) => l.startsWith("| **D-152** |")), REG.findIndex((l) => l.startsWith("| **D-151** |")) + 1);
  const row = rows[0];
  for (const needle of ["PREPARATION ONLY — NO IMAGE REQUEST AUTHORISED", "`UNASSIGNED`", "`NONE`", "HTTP 400", "`invalid_value`", "`param: background`",
    "Transparent background is not supported for this model.", "`background: transparent`", "**`background: opaque`**", "in preview",
    D151.execution.claim.sha256, D151.execution.manifest.sha256, D151.execution.response.bodySha256, "8fdf86ad67cce75d2180e6a3868484dd773233c9ed705cd01426766b9eadb785",
    "`callsActuallySentSoFar.underlay` bliver **4**", "default OFF", "helt ny, separat ejerbeslutning"]) assert.ok(row.includes(needle), "the D-152 row must carry " + JSON.stringify(needle));
  assert.ok(!/[ÃÂ]\S|\uFFFD/.test(row));
});

// ── the D-152 preparation adapter cannot send ────────────────────────────────────────────────

test("the D-152 adapter has no send path: no network, no key, no claim, no retry, no child process", () => {
  for (const rel of [PREP_REL, OPAQUE_REL]) {
    const code = strip(readFileSync(repoFile(rel), "utf8"));
    for (const bad of [/\bfetch\s*\(/, /node:https?\b|node:net\b|node:tls\b|node:dgram\b|node:child_process|undici|axios|XMLHttpRequest|WebSocket/, /https?:\/\//,
      /OPENAI_API_KEY|process\.env\.[A-Z_]*(KEY|TOKEN|SECRET)/, /\bclaim\w*\s*\(|"wx"\s*\)\s*;?\s*\/\/\s*claim|one-shot-claims/, /\bretry\b|maxRetries/i, /\bexec(File)?(Sync)?\s*\(|\bspawn(Sync)?\s*\(/])
      assert.ok(!bad.test(code), rel + " must not match " + bad);
    const envUses = [...code.matchAll(/process\.env(\.[A-Za-z_][A-Za-z0-9_]*|\[[^\]]*\])?/g)].map((m) => m[0]);
    for (const u of envUses) assert.equal(u, "process.env.FITTING_BASE_V1_PATH", rel + " reads only the H1 path from the environment");
  }
  assert.equal(D152.CALL_ID, "UNASSIGNED"); assert.equal(D152.CLAIM_IDENTITY, "NONE"); assert.equal(D152.STATUS, "PREPARATION ONLY — NO IMAGE REQUEST AUTHORISED");
  const r = D152.attemptSend(); assert.equal(r.allowed, false); assert.equal(r.reasons.length, 3);
  assert.ok(!/D-15\d-r3-[a-z0-9-]+-v\d/.test(strip(readFileSync(repoFile(PREP_REL), "utf8"))), "the D-152 adapter names no call-id");
  assert.ok(D152.BUILD_DIR_REL.startsWith("tools/avatar/build/"), "it writes only into the gitignored build area");
});

test("the D-152 CLI refuses every send-like and unknown argument, and only --h1/--dry-run are accepted", () => {
  for (const args of [["--send"], ["--send=1"], ["--SEND"], ["--live"], ["--submit"], ["--execute"], ["--call"], ["--owner-approval=D-152"], ["--underpainting=u2"], ["--dry-run", "--retry"]]) {
    const r = spawnSync(process.execPath, [repoFile(PREP_REL), ...args], { env: { PATH: process.env.PATH || "", SystemRoot: process.env.SystemRoot || "" }, encoding: "utf8" });
    assert.notEqual(r.status, 0, args.join(" ")); assert.match(r.stderr, /REFUSED/, args.join(" "));
  }
  assert.deepEqual(D152.refusedArgs(["--h1", "a.png", "--dry-run"]), []);
  assert.deepEqual(D152.refusedArgs(["--h1=a.png"]), []);
  assert.deepEqual(D152.refusedArgs(["--h1", "--send"]), ["--h1", "--send"]);
});

test("the corrected request differs from D-149's in background only", () => {
  const { background: after, ...restAfter } = D152.REQUEST;
  assert.equal(after, "opaque");
  assert.deepEqual(D152.BACKGROUND_CHANGE, { ...D152.BACKGROUND_CHANGE, parameter: "background", before: "transparent", after: "opaque" });
  assert.equal(D151.parameters.background, "transparent");
  for (const k of ["model", "size", "quality", "n", "output_format", "fieldOrder", "forbiddenFields"]) assert.deepEqual(restAfter[k], k in D151.parameters ? (k === "n" ? D151.parameters.n : D151.parameters[k]) ?? restAfter[k] : restAfter[k]);
  assert.equal(D152.REQUEST.model, D151.model); assert.equal(D152.REQUEST.size, D151.parameters.size); assert.equal(D152.REQUEST.quality, D151.parameters.quality);
  assert.equal(D152.REQUEST.n, D151.parameters.n); assert.equal(D152.REQUEST.output_format, D151.parameters.output_format);
  assert.deepEqual(D152.REQUEST.fieldOrder, ["model", "image[] (Image 1)", "image[] (Image 2)", "mask", "prompt", "size", "quality", "n", "output_format", "background"]);
});

test("with H1: the D-152 manifest is deterministic, pinned, and changes nothing but background", NEED_H1, () => {
  const a = D152.prepare({ repoRoot: REPO, h1Path: H1_PATH }), b = D152.prepare({ repoRoot: REPO, h1Path: H1_PATH });
  assert.equal(a.manifestSha256, b.manifestSha256);
  assert.equal(a.manifestSha256, "8fdf86ad67cce75d2180e6a3868484dd773233c9ed705cd01426766b9eadb785");
  const m = a.manifest;
  assert.equal(m.callId, "UNASSIGNED"); assert.equal(m.claimIdentity, "NONE"); assert.match(m.network, /^NONE/);
  assert.equal(m.request.background, "opaque");
  assert.equal(m.request.images[0].sha256, "9fc32bf5f16eacca3646a6a6776367f7577291816f33b7128140032be003bbbb");
  assert.equal(m.request.images[1].sha256, "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50");
  assert.equal(m.request.mask.sha256, "33790c5decd357aa1c9ec2bcebef60fe941a05826c55ccc81d6d54d31a6eb5d1");
  assert.equal(m.request.prompt.fileSha256, "21bff18f001ea4ad9d0cdf79766f0f1879f2caf246003ea04c5728c03f8c65de");
  assert.equal(m.request.prompt.transmittedSha256, "0465bbcee77703094b34c1c9575ebe90019000530824d330f7f04e5537cb7623");
  for (const [k, want] of [["u1", "e67e2cccb25d914dfd016fd1ed3d9d36fa883bfc75457426b59f8d1204ba217d"], ["mask", "33790c5decd357aa1c9ec2bcebef60fe941a05826c55ccc81d6d54d31a6eb5d1"],
    ["margin", "1bb3ca1b2fa307c023c26ce52f93b989320c0707e2c7d0f10694901788248e03"], ["spec", "041fb1aec10a271cb1c08a83010bd0df9cc4533dcc3d9aacaec13b461cff1cc5"]])
    assert.equal(sha256(readFileSync(join(REPO, FIXTURE_DIR, FILES[k]))), want, k + " is unchanged");
});

// ── ALPHA: the final candidate does not depend on the output's alpha ─────────────────────────

const INP = loadInputs(REPO);
const CONTOUR = pngToContour(readFileSync(join(REPO, GEO_DIR, GEO_FILES.contour)));
const REGIONS2 = { EDIT: INP.edit, PROTECT: INP.protect, TRANSITION: INP.transition, CORE: new Uint8Array(N) };
for (let p = 0; p < N; p++) REGIONS2.CORE[p] = INP.edit[p] && !INP.transition[p] ? 1 : 0;
const HEAD = finalModelRgbRegion(INP.geom), MARGIN = apiContextMargin(INP.geom);
const API_EDIT = apiMaskToEditable(readFileSync(join(REPO, FIXTURE_DIR, FILES.mask)));
const NECK = [...SEAM.S2.neckTargetExpected];
/** Synthetic H1: solid exactly on TRANSITION in the measured neck skin; a model output that paints the head on-palette. */
function synth() {
  const h1 = Buffer.alloc(N * 4);
  for (let p = 0; p < N; p++) if (INP.transition[p]) h1.set([...NECK, 255], p * 4);
  const src = Buffer.alloc(N * 4);
  for (let p = 0; p < N; p++) if (HEAD[p] || INP.transition[p]) src.set([250, 192, 125, 255], p * 4);
  return { h1, src };
}
const proc = (h1, src) => processOutput({ srcRgba: src, h1Rgba: h1, geom: INP.geom, contour: CONTOUR, regions: REGIONS2, nsRgba: INP.ns });
const withAlpha = (src, f) => { const o = Buffer.from(src); for (let p = 0; p < N; p++) o[p * 4 + 3] = f(p, src[p * 4 + 3]); return o; };

test("ALPHA 1: identical RGB, fully opaque instead of a transparent background — the candidate is byte-identical", () => {
  const { h1, src } = synth();
  const base = proc(h1, src).rgba;
  const opaque = withAlpha(src, () => 255);
  assert.equal(Buffer.compare(proc(h1, opaque).rgba, base), 0);
});

test("ALPHA 2: identical RGB, varying alpha (>= 128 inside the head and TRANSITION, anything elsewhere) — byte-identical", () => {
  const { h1, src } = synth();
  const base = proc(h1, src).rgba;
  const solidZone = (p) => HEAD[p] || INP.transition[p];
  for (const f of [(p) => (solidZone(p) ? 128 + (p % 128) : p % 256), (p) => (solidZone(p) ? 255 - (p % 100) : 0), (p) => (solidZone(p) ? 200 : 37)]) {
    assert.equal(Buffer.compare(proc(h1, withAlpha(src, f)).rgba, base), 0);
  }
});

test("ALPHA 3/4: extreme RGB outside the edit region and in the context margin never reach the candidate", () => {
  const { h1, src } = synth();
  const base = proc(h1, src).rgba;
  for (const [label, where] of [["outside API_EDIT", (p) => !API_EDIT[p] && !INP.transition[p]], ["API_CONTEXT_MARGIN", (p) => MARGIN[p] === 1],
    ["everything but the head and TRANSITION", (p) => !HEAD[p] && !INP.transition[p]]]) {
    for (const c of [[255, 0, 255, 255], [0, 0, 0, 255], [255, 255, 255, 255], [0, 255, 0, 0]]) {
      const loud = Buffer.from(src); for (let p = 0; p < N; p++) if (where(p)) loud.set(c, p * 4);
      assert.equal(Buffer.compare(proc(h1, loud).rgba, base), 0, label + " " + c);
    }
  }
});

test("ALPHA: extreme RGB inside TRANSITION never reaches the candidate; output alpha there only feeds the TRANSITION coverage pre-gate", () => {
  const { h1, src } = synth();
  const base = proc(h1, src).rgba;
  for (const c of [[255, 0, 255], [0, 0, 0], [255, 255, 255]]) {
    const loud = Buffer.from(src); for (let p = 0; p < N; p++) if (INP.transition[p]) loud.set([...c, 255], p * 4);
    assert.equal(Buffer.compare(proc(h1, loud).rgba, base), 0, "TRANSITION is H1 byte for byte whatever the output paints there");
  }
  // FINDING, documented: pre.transition-uncovered reads the OUTPUT ALPHA in TRANSITION. A transparent gap there is refused;
  // an opaque output always "covers" it, so for an opaque background that pre-gate can no longer see a narrowed neck. The
  // candidate is unaffected (TRANSITION comes from H1), and the head is guarded by backgroundLeakGate().
  const gap = Buffer.from(src); for (let p = 0; p < N; p++) if (INP.transition[p] && (p % OUT_W) < 500) gap[p * 4 + 3] = 0;
  assert.throws(() => proc(h1, gap), (e) => e instanceof ColourGateError && e.gate === "pre.transition-uncovered");
  assert.equal(Buffer.compare(proc(h1, withAlpha(gap, () => 255)).rgba, base), 0, "the same output, opaque, passes and yields the same candidate");
});

test("ALPHA: the candidate's alpha is the geometry, TRANSITION/PROTECT₂ are H1, and the rest of CORE₂ is empty — for any output alpha", () => {
  const { h1, src } = synth();
  for (const s of [src, withAlpha(src, () => 255)]) {
    const out = proc(h1, s).rgba;
    let alphaNotGeom = 0, keep = 0, residue = 0;
    for (let p = 0; p < N; p++) {
      const y = (p / OUT_W) | 0;
      if (y <= 424 && (out[p * 4 + 3] === 255) !== (INP.geom[p] === 1)) alphaNotGeom++;
      if ((!INP.edit[p] || INP.transition[p]) && Buffer.compare(out.subarray(p * 4, p * 4 + 4), h1.subarray(p * 4, p * 4 + 4))) keep++;
      if (REGIONS2.CORE[p] && !HEAD[p] && (out[p * 4] | out[p * 4 + 1] | out[p * 4 + 2] | out[p * 4 + 3])) residue++;
    }
    assert.deepEqual([alphaNotGeom, keep, residue], [0, 0, 0]);
    // K4 is applied over the (S2) model RGB inside the geometry, independent of the output alpha
    let k4 = 0; for (let p = 0; p < N; p++) if (HEAD[p] && CONTOUR[p] === 255) { k4++; for (let k = 0; k < 3; k++) assert.equal(out[p * 4 + k], K4.line[k]); }
    assert.ok(k4 > 0);
  }
});

test("ALPHA: the processor never resamples — any other size is refused before processing", () => {
  assert.throws(() => decodeOutput(encodePngRGBA(512, 768, Buffer.alloc(512 * 768 * 4))), (e) => e.gate === "format");
  assert.throws(() => decodeOutputRgbOrRgba(encodePngRGBA(1024, 1535, Buffer.alloc(1024 * 1535 * 4))), (e) => e instanceof ColourGateError && e.gate === "format");
  assert.throws(() => proc(Buffer.alloc(N * 4), Buffer.alloc(10)), (e) => e.gate === "format");
  const src = readFileSync(repoFile("tools/avatar/process-r3-head-colour-output.mjs"), "utf8");
  assert.ok(!/resize|resample|scale\(|interpolat/i.test(strip(src)), "no resampling code in the processor");
});

// ── format: RGB-only PNGs and missing/odd alpha channels ─────────────────────────────────────

function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, "ascii"), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function pngRaw(w, h, colourType, bitDepth, pixels, channels) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = bitDepth; ihdr[9] = colourType;
  const stride = w * channels * (bitDepth / 8), raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

test("FORMAT: an RGB-only PNG decodes to the same pixels as the opaque RGBA file and yields the same candidate", () => {
  const { h1, src } = synth();
  const opaque = withAlpha(src, () => 255);
  const rgb = Buffer.alloc(N * 3); for (let p = 0; p < N; p++) { rgb[p * 3] = src[p * 4]; rgb[p * 3 + 1] = src[p * 4 + 1]; rgb[p * 3 + 2] = src[p * 4 + 2]; }
  const rgbPng = pngRaw(OUT_W, OUT_H, 2, 8, rgb, 3);
  assert.throws(() => decodeOutput(rgbPng), (e) => e.gate === "format", "D-149's decoder accepts RGBA only");
  const d = decodeOutputRgbOrRgba(rgbPng);
  assert.equal(d.colourType, 2); assert.equal(d.alphaChannel, false);
  assert.equal(Buffer.compare(d.rgba, opaque), 0, "RGB gets alpha 255");
  assert.equal(Buffer.compare(proc(h1, d.rgba).rgba, proc(h1, src).rgba), 0);
  const rgbaPng = encodePngRGBA(OUT_W, OUT_H, src);
  assert.equal(Buffer.compare(decodeOutputRgbOrRgba(rgbaPng).rgba, src), 0, "RGBA passes through unchanged");
});

test("FORMAT: greyscale, palette, 16-bit and grey+alpha PNGs are refused", () => {
  for (const [ct, bit, ch] of [[0, 8, 1], [3, 8, 1], [4, 8, 2], [2, 16, 3], [6, 16, 4]]) {
    const png = pngRaw(8, 8, ct, bit, Buffer.alloc(8 * 8 * ch * (bit / 8)), ch);
    assert.throws(() => decodeOutputRgbOrRgba(png), (e) => e instanceof ColourGateError && e.gate === "format", `colour type ${ct}, ${bit}-bit`);
  }
  assert.throws(() => decodeOutputRgbOrRgba(Buffer.from("not a png at all, really not")), (e) => e.gate === "format");
});

// ── the background-leak gate: coverage by colour, for an opaque background ───────────────────

const H1T = (() => { const h = Buffer.alloc(N * 4); for (let p = 0; p < N; p++) if (INP.transition[p] || HEAD[p]) h[p * 4 + 3] = 255; return h; })();
const bgOutput = (bg, headColour, holeTest) => {
  const o = Buffer.alloc(N * 4);
  for (let p = 0; p < N; p++) o.set(HEAD[p] && !(holeTest && holeTest(p)) ? [...headColour, 255] : [...bg, 255], p * 4);
  return o;
};
const gate = (src) => backgroundLeakGate(src, { h1Rgba: H1T, geom: INP.geom, apiEdit: API_EDIT });

test("LEAK: a transparent background leaves the gate to D-149's alpha coverage", () => {
  const { src } = synth();
  const g = gate(src);
  assert.equal(g.applicable, false); assert.equal(g.pass, true); assert.match(g.reason, /transparent background/);
});

test("LEAK: an opaque off-palette background with a fully painted head passes with 0 leaks", () => {
  for (const bg of [[255, 255, 255], [0, 0, 0], [40, 120, 220]]) {
    const g = gate(bgOutput(bg, [250, 192, 125]));
    assert.equal(g.applicable, true, String(bg)); assert.equal(g.pass, true, String(bg)); assert.equal(g.total, 0);
    assert.deepEqual(g.background, bg);
  }
});

test("LEAK: an opaque background that shows through a head drawn too small is refused, per region", () => {
  const g = gate(bgOutput([255, 255, 255], [250, 192, 125], (p) => (p % OUT_W) < 366));
  assert.equal(g.pass, false); assert.ok(g.leaks["ear-left"] > 0); assert.equal(g.leaks["ear-right"], 0);
  const g2 = gate(bgOutput([20, 20, 20], [250, 192, 125], (p) => ((p / OUT_W) | 0) < 200));
  assert.equal(g2.pass, false); assert.ok(g2.leaks.crown > 0);
});

test("LEAK: an on-palette background is left to S1, and the rule is documented", () => {
  const g = gate(bgOutput([252, 196, 128], [250, 192, 125], (p) => (p % OUT_W) < 366));
  assert.equal(g.applicable, false); assert.match(g.reason, /skin palette/);
  assert.equal(LEAK_RULE.jndDE00, 2.3); assert.equal(LEAK_RULE.offPaletteDE00, 4.5); assert.deepEqual([...LEAK_RULE.probeRows], [0, 119]);
  let probeInEdit = 0; for (let p = 0; p < 120 * OUT_W; p++) if (API_EDIT[p]) probeInEdit++;
  assert.equal(probeInEdit, 0, "the probe rows lie entirely outside API_EDIT");
  assert.equal(gate(Buffer.alloc(10)).pass, false, "malformed input fails closed");
});

test("with H1: the real Image 1 made fully opaque gives the byte-identical candidate", NEED_H1, async () => {
  const A = await import("../../tools/avatar/prepare-r3-head-colour-call.mjs");
  const { decodePng } = await import("../../tools/avatar/build-r2-torso-occlusion-mask.mjs");
  const all = A.loadAll({ repoRoot: REPO, h1Path: H1_PATH, underpainting: "u1" });
  const img1 = A.buildImage1(all.h1, all.up, all.inp);
  const h1 = decodePng(readFileSync(H1_PATH), "H1").rgba;
  const base = processOutput({ srcRgba: img1, h1Rgba: h1, geom: INP.geom, contour: CONTOUR, regions: REGIONS2, nsRgba: INP.ns }).rgba;
  const opaque = withAlpha(img1, () => 255);
  const out = processOutput({ srcRgba: opaque, h1Rgba: h1, geom: INP.geom, contour: CONTOUR, regions: REGIONS2, nsRgba: INP.ns }).rgba;
  assert.equal(Buffer.compare(out, base), 0);
  assert.equal(sha256(out), sha256(base));
});

// ── runtime boundary ─────────────────────────────────────────────────────────────────────────

test("R3 stays default OFF: no shipped file references the head-colour work, and nothing is promoted", () => {
  const shipped = [];
  const walk = (dir) => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) { if (!["node_modules", ".git", "tools", "tests", "docs", "supabase"].includes(n)) walk(p); } else if (/\.(html|js|mjs|css)$/.test(n)) shipped.push(p); } };
  walk(REPO);
  for (const p of shipped) assert.ok(!/r3-head-colour|prepare-r3-head-colour-call-d152|head-colour-opaque/.test(readFileSync(p, "utf8")), relative(REPO, p) + " must not reference the R3 head-colour work");
  for (const rel of [PREP_REL, OPAQUE_REL]) assert.ok(!/["']assets\//.test(strip(readFileSync(repoFile(rel), "utf8"))), rel + " never targets a runtime asset");
});
