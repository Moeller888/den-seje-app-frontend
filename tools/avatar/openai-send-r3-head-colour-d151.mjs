// D-151 R3 HEAD COLOUR — THE ONE-SHOT SEND ADAPTER. ONE CALL, ONE CLAIM, ONE FETCH.
//
// WHAT THIS FILE IS. The send path for exactly one authorised call, D-151-r3-head-colour-u1-v1: a
// colour-limited edit of the pinned R3 head underpainting U1. The model may produce colour, lighting
// and discreet inner-ear detail of the hidden bald, blank, featureless technical underlay — nothing
// else. Geometry, alpha, silhouette, the K4 contour, the transition, placement and size are locked
// afterwards by the deterministic head-colour post-processing (evaluate-r3-head-colour-d151.mjs).
//
// It is a NEW, SEPARATE file. The D-149 preparation adapter (prepare-r3-head-colour-call.mjs) stays
// preparation-only and cannot send; this file reuses its DETERMINISTIC, fetch-free code to rebuild
// Image 1 and the request manifest, and then requires both to equal their pinned SHA-256 values. No
// module this file imports can reach a network call: the only fetch call site reachable from here is
// the single one in main() below.
//
// EVERY CHECK RUNS BEFORE THE CLAIM, inside main(), which is the only function that can fetch:
//   1  argv is parsed strictly: --send, --owner-approval=D-151, --call-id=, --claim-identity=,
//      --underpainting= and --h1. Any other argument, a duplicate, or any value other than the pinned
//      call-id, claim identity and U1 is refused. --send without the approval is refused.
//   2  send mode only: OPENAI_API_KEY must be present (existence only; never printed or stored).
//   3  git, read-only: the top level is this repository; the working tree is clean (no modified and
//      no untracked file); HEAD has exactly one parent and that parent is the local origin/main.
//   4  the D-151 register row exists exactly once and names the call-id, the claim identity and the
//      pins; the contract carries exactly one D-151 entry, UNSPENT, with every pin equal to this file.
//   5  every pinned input — prompt, API_EDIT, API_CONTEXT_MARGIN, spec, U1, North Star — matches its
//      full SHA-256 in the working tree (which equals HEAD, by 3).
//   6  the claim location resolves outside the repository and outside temp, and no claim exists.
//   7  the output paths are empty: no raw, response, manifest, or .partial of any of them.
//   8  H1 is supplied explicitly (--h1 or FITTING_BASE_V1_PATH) and matches its full SHA-256; the
//      D-149 preflight passes; Image 1 and the U1 request manifest are rebuilt and equal their pins.
//   9  the multipart body is assembled and its field order, images, mask and prompt are asserted on
//      the body itself; input_fidelity is absent.
//  10  HEAD and origin/main are resolved AGAIN and must be unchanged.
//  11  the claim is created with an exclusive "wx" open. From that line the mandate is SPENT.
//  12  exactly one fetch. No loop, no retry, no fallback model and no second call site.
//
// NOTHING IS INJECTABLE and NOTHING IS DELETED. No claim, manifest, response, output or partial file
// is ever removed, renamed back or overwritten. A manifest is written on every outcome after the
// claim. A crash can still leave the claim SPENT without a manifest: that is UNKNOWN, never a reason
// to retry. If the response carries more than one image, only data[0] is recorded.
//
// Usage:
//   node tools/avatar/openai-send-r3-head-colour-d151.mjs --call-id=D-151-r3-head-colour-u1-v1 \
//        --claim-identity=D-151-r3-head-colour-u1-v1-claim --underpainting=u1 --h1 <path>
//        read-only dry run: every check, nothing written, the key is not read
//   … the same plus --send --owner-approval=D-151
//        THE ONE SEND — only on the explicit D-151 owner instruction
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, lstatSync, realpathSync,
  openSync, writeSync, fsyncSync, closeSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join, dirname, relative, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, tmpdir } from "node:os";
import { loadAll, preflight, buildImage1, buildManifest, extractPrompt, REQUEST as PREP_REQUEST } from "./prepare-r3-head-colour-call.mjs";
import { encodePngRGBA } from "./build-r2-torso-occlusion-mask.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");

// ── identity (D-151) ─────────────────────────────────────────────────────────────────────────
const TOOL = "openai-send-r3-head-colour-d151";
const ADAPTER_PATH = "tools/avatar/openai-send-r3-head-colour-d151.mjs";
const DECISION = "D-151";
const CALL_ID = "D-151-r3-head-colour-u1-v1";
const CLAIM_IDENTITY = "D-151-r3-head-colour-u1-v1-claim";
const CLAIM_FILENAME = "D-151-r3-head-colour-u1-v1.claim.json";
const OWNER_APPROVAL_FLAG = "--owner-approval=D-151";
const UNDERPAINTING = "u1";
const NEVER_REUSE_CALL_IDS = Object.freeze(["D-139-r3-underlay-head-only-v1", "D-142-r3-underlay-core-v1", "D-143-r3-underlay-core-v2"]);

// ── the request (D-149's locked request) ─────────────────────────────────────────────────────
const ENDPOINT = "https://api.openai.com/v1/images/edits";
const MODEL = "gpt-image-2-2026-04-21";
const PARAMETERS = Object.freeze({ n: 1, size: "1024x1536", quality: "high", output_format: "png", background: "transparent" });
const FORBIDDEN_FIELDS = Object.freeze(["input_fidelity"]);
const FIELD_ORDER = Object.freeze(["model", "image[]", "image[]", "mask", "prompt", "size", "quality", "n", "output_format", "background"]);
const W = 1024;
const H = 1536;

// ── pins (full SHA-256; D-151 register row and contract entry carry the same values) ────────
const H1 = Object.freeze({ name: "fitting-base.H1.png", bytes: 1832612, envVar: "FITTING_BASE_V1_PATH",
  sha256: "72875565ecd62b542a91156dbcca1399a434fe04634f4e737df71337be0d5af4" });
const PINS = Object.freeze({
  prompt: { path: "tools/avatar/fixtures/r3-head-colour/r3-head-colour-prompt-v1.md", bytes: 2455, sha256: "21bff18f001ea4ad9d0cdf79766f0f1879f2caf246003ea04c5728c03f8c65de" },
  mask: { path: "tools/avatar/fixtures/r3-head-colour/r3-head-colour-api-mask-v2.png", bytes: 9541, sha256: "33790c5decd357aa1c9ec2bcebef60fe941a05826c55ccc81d6d54d31a6eb5d1" },
  margin: { path: "tools/avatar/fixtures/r3-head-colour/r3-head-colour-api-context-margin-v1.png", bytes: 7191, sha256: "1bb3ca1b2fa307c023c26ce52f93b989320c0707e2c7d0f10694901788248e03" },
  spec: { path: "tools/avatar/fixtures/r3-head-colour/r3-head-colour-preparation-spec-v1.json", bytes: 10363, sha256: "041fb1aec10a271cb1c08a83010bd0df9cc4533dcc3d9aacaec13b461cff1cc5" },
  u1: { path: "tools/avatar/fixtures/r3-head-colour/r3-head-underpainting-u1-v1.png", bytes: 7168, sha256: "e67e2cccb25d914dfd016fd1ed3d9d36fa883bfc75457426b59f8d1204ba217d" },
  northstar: { path: "assets/avatar/reference/Northstar Master v2.png", bytes: 761394, sha256: "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50" },
});
const PROMPT_BODY = Object.freeze({ bytes: 1347, sha256: "0465bbcee77703094b34c1c9575ebe90019000530824d330f7f04e5537cb7623" });
const IMAGE1 = Object.freeze({ name: "image1-u1.png", bytes: 1545287, sha256: "9fc32bf5f16eacca3646a6a6776367f7577291816f33b7128140032be003bbbb" });
const MANIFEST_U1_SHA256 = "7ece128fad5a63acc5864db2813895e14a1354fbeb63446a0f5b99a40789bbce";
const NORTHSTAR_NAME = "Northstar Master v2.png";
const MASK_NAME = "r3-head-colour-api-mask-v2.png";
const REGISTER = "docs/project-state.md";
const CONTRACT = "tools/avatar/fixtures/r3/r3-shadow-contract-v1.json";

// ── claim and outputs ────────────────────────────────────────────────────────────────────────
const REPO_IDENTITY = "Moeller888-den-seje-app-frontend";
const OUT_DIR = "tools/avatar/build/r3-head-colour-d151";
const OUT = Object.freeze({
  raw: OUT_DIR + "/r3-head-colour-d151.raw.png",
  response: OUT_DIR + "/r3-head-colour-d151.response.json",
  manifest: OUT_DIR + "/r3-head-colour-d151.request.json",
});

const sha = (b) => createHash("sha256").update(b).digest("hex");
const errText = (e) => (e && e.message ? e.message : String(e));
const abs = (rel) => join(REPO, ...rel.split("/"));

function isInside(child, parent) {
  if (typeof child !== "string" || typeof parent !== "string" || child === "" || parent === "") return false;
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
function pathExists(p) { try { lstatSync(p); return true; } catch (_) { return false; } }

// ── git, read-only, against THIS repository only; nothing here fetches ───────────────────────
function gitEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^GIT_/i.test(k)) env[k] = v;
  env.GIT_TERMINAL_PROMPT = "0";
  env.GIT_OPTIONAL_LOCKS = "0";
  return env;
}
function git(args) {
  const r = spawnSync("git", ["-C", REPO, ...args], { env: gitEnv(), encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  if (r.error) return { ok: false, status: null, out: Buffer.alloc(0), err: errText(r.error) };
  return { ok: r.status === 0, status: r.status, out: r.stdout || Buffer.alloc(0), err: r.stderr ? r.stderr.toString("utf8").trim() : "" };
}
const gitText = (r) => r.out.toString("utf8").trim();
function samePath(a, b) {
  let ra, rb;
  try { ra = realpathSync.native(a); rb = realpathSync.native(b); } catch (_) { return false; }
  return process.platform === "win32" ? ra.toLowerCase() === rb.toLowerCase() : ra === rb;
}

/** HEAD must be a clean commit whose single parent is the local origin/main. */
function resolveRefs() {
  const version = git(["--version"]);
  if (!version.ok) return { ok: false, stage: "git-unavailable", problems: ["git is not available"] };
  const top = git(["rev-parse", "--show-toplevel"]);
  if (!top.ok || !samePath(gitText(top), REPO)) return { ok: false, stage: "git-repository", problems: ["the git top level is not this adapter's repository"] };
  const selfRel = relative(REPO, fileURLToPath(import.meta.url)).split(sep).join("/");
  if (selfRel !== ADAPTER_PATH) return { ok: false, stage: "adapter-path", problems: ["this adapter runs from " + selfRel + ", not " + ADAPTER_PATH] };
  const origin = git(["rev-parse", "--verify", "--quiet", "refs/remotes/origin/main^{commit}"]);
  const originSha = origin.ok ? gitText(origin) : "";
  if (!/^[0-9a-f]{40}$/.test(originSha)) return { ok: false, stage: "origin-main", problems: ["refs/remotes/origin/main cannot be resolved to a commit"] };
  const head = git(["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
  const headSha = head.ok ? gitText(head) : "";
  if (!/^[0-9a-f]{40}$/.test(headSha)) return { ok: false, stage: "head", problems: ["HEAD cannot be resolved to a commit"] };
  const parents = git(["rev-list", "--parents", "-n", "1", headSha]);
  const list = parents.ok ? gitText(parents).split(/\s+/).slice(1) : [];
  if (list.length !== 1 || list[0] !== originSha) {
    return { ok: false, stage: "head-not-on-origin-main", problems: ["HEAD must be exactly one commit on top of origin/main " + originSha + "; its parents are " + JSON.stringify(list)] };
  }
  const status = git(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (!status.ok) return { ok: false, stage: "worktree", problems: ["git status failed: " + status.err] };
  if (gitText(status) !== "") return { ok: false, stage: "worktree-dirty", problems: ["the working tree is not clean; the call runs only from the committed D-151 state"] };
  return { ok: true, originSha, headSha };
}

/** The register row and the contract entry in the committed tree must authorise exactly this call. */
function verifyAuthorisation() {
  const problems = [];
  let reg = "", contract = null;
  try { reg = readFileSync(abs(REGISTER), "utf8"); } catch (e) { return { ok: false, problems: ["the register is unreadable: " + errText(e)] }; }
  try { contract = JSON.parse(readFileSync(abs(CONTRACT), "utf8")); } catch (e) { return { ok: false, problems: ["the contract is unreadable: " + errText(e)] }; }
  const rows = reg.split("\n").filter((l) => l.startsWith("| **" + DECISION + "** |"));
  if (rows.length !== 1) problems.push(`the register carries ${rows.length} ${DECISION} rows; exactly 1 is required`);
  else for (const needle of [CALL_ID, CLAIM_IDENTITY, CLAIM_FILENAME, H1.sha256, PINS.prompt.sha256, PINS.mask.sha256, PINS.margin.sha256,
    PINS.spec.sha256, PINS.u1.sha256, MANIFEST_U1_SHA256, IMAGE1.sha256, ADAPTER_PATH]) if (!rows[0].includes(needle)) problems.push("the D-151 row does not name " + needle);
  const calls = contract && contract.authorisedCalls && Array.isArray(contract.authorisedCalls.calls) ? contract.authorisedCalls.calls : [];
  const mine = calls.filter((e) => e && e.callId === CALL_ID);
  if (mine.length !== 1) return { ok: false, problems: [...problems, `the contract carries ${mine.length} entries for ${CALL_ID}; exactly 1 is required`] };
  const e = mine[0];
  const eq = (label, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`contract ${label}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`); };
  eq("decision", e.decision, DECISION);
  eq("mandateState", e.mandateState, "UNSPENT");
  eq("endpoint", e.endpoint, ENDPOINT);
  eq("model", e.model, MODEL);
  eq("parameters", e.parameters, PARAMETERS);
  eq("prompt.fileSha256", e.prompt && e.prompt.fileSha256, PINS.prompt.sha256);
  eq("prompt.transmittedSha256", e.prompt && e.prompt.transmittedSha256, PROMPT_BODY.sha256);
  eq("inputs[0].sha256", e.inputs && e.inputs[0] && e.inputs[0].sha256, IMAGE1.sha256);
  eq("inputs[0].builtFrom.h1.sha256", e.inputs && e.inputs[0] && e.inputs[0].builtFrom && e.inputs[0].builtFrom.h1.sha256, H1.sha256);
  eq("inputs[0].builtFrom.underpainting", e.inputs && e.inputs[0] && e.inputs[0].builtFrom && e.inputs[0].builtFrom.underpainting.sha256, PINS.u1.sha256);
  eq("inputs[1].sha256", e.inputs && e.inputs[1] && e.inputs[1].sha256, PINS.northstar.sha256);
  eq("mask.sha256", e.mask && e.mask.sha256, PINS.mask.sha256);
  eq("mask.contextMargin.sha256", e.mask && e.mask.contextMargin && e.mask.contextMargin.sha256, PINS.margin.sha256);
  eq("preparation.spec.sha256", e.preparation && e.preparation.spec && e.preparation.spec.sha256, PINS.spec.sha256);
  eq("preparation.requestManifestU1Sha256", e.preparation && e.preparation.requestManifestU1Sha256, MANIFEST_U1_SHA256);
  eq("claim.filename", e.claim && e.claim.filename, CLAIM_FILENAME);
  eq("claim.identity", e.claim && e.claim.identity, CLAIM_IDENTITY);
  eq("adapter.file", e.adapter && e.adapter.file, ADAPTER_PATH);
  eq("outputs.count", e.outputs && e.outputs.count, 1);
  if (!/Exactly one fetch/.test((e.prohibitions && e.prohibitions.noRetry) || "")) problems.push("the contract entry does not bind the call to exactly one fetch");
  for (const id of NEVER_REUSE_CALL_IDS) if (calls.some((x) => x && x.callId === id && x.mandateState === "UNSPENT")) problems.push("a spent call id reads as UNSPENT: " + id);
  return { ok: problems.length === 0, problems };
}

function verifyPins() {
  const problems = [];
  for (const [k, p] of Object.entries(PINS)) {
    let buf;
    try { buf = readFileSync(abs(p.path)); } catch (e) { problems.push(k + " is unreadable: " + errText(e)); continue; }
    if (buf.length !== p.bytes || sha(buf) !== p.sha256) problems.push(`${k}: ${buf.length} B ${sha(buf)}, expected ${p.bytes} B ${p.sha256}`);
  }
  return { ok: problems.length === 0, problems };
}

/** One claim per user and repository identity, outside every clone and outside temp. No override. */
function resolveClaimPath() {
  let base;
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA;
    if (typeof local !== "string" || local.trim() === "") return { ok: false, why: "LOCALAPPDATA is not set; there is no fallback" };
    base = local;
  } else {
    const xdg = process.env.XDG_STATE_HOME;
    if (typeof xdg === "string" && xdg.trim() !== "") base = xdg;
    else {
      const home = homedir();
      if (typeof home !== "string" || home.trim() === "") return { ok: false, why: "neither XDG_STATE_HOME nor a home directory is available" };
      base = join(home, ".local", "state");
    }
  }
  const path = resolve(base, "DenSejeApp", "one-shot-claims", REPO_IDENTITY, CLAIM_FILENAME);
  if (isInside(path, REPO)) return { ok: false, why: "the claim path resolves inside the repository" };
  if (isInside(path, resolve(tmpdir()))) return { ok: false, why: "the claim path resolves inside the temp directory" };
  return { ok: true, path, display: "<claim register>/" + REPO_IDENTITY + "/" + CLAIM_FILENAME };
}

function outputPaths() {
  const p = Object.fromEntries(Object.entries(OUT).map(([k, rel]) => [k, abs(rel)]));
  return { ...p, all: Object.values(p).flatMap((x) => [x, x + ".partial"]) };
}

/** Image 1 and the U1 request manifest, rebuilt by D-149's deterministic code and checked against their pins. */
function prepareInputs(h1Path) {
  if (typeof h1Path !== "string" || h1Path === "") return { ok: false, problems: ["H1 was not supplied: pass --h1 <path> or set " + H1.envVar] };
  let all, pre;
  try { all = loadAll({ repoRoot: REPO, h1Path, underpainting: UNDERPAINTING }); } catch (e) { return { ok: false, problems: ["D-149 inputs: " + errText(e)] }; }
  if (all.h1Buf.length !== H1.bytes || sha(all.h1Buf) !== H1.sha256) return { ok: false, problems: ["H1 does not match its pin"] };
  try { pre = preflight(all); } catch (e) { return { ok: false, problems: ["D-149 preflight: " + errText(e)] }; }
  const image1Png = encodePngRGBA(W, H, buildImage1(all.h1, all.up, all.inp));
  const problems = [];
  if (image1Png.length !== IMAGE1.bytes || sha(image1Png) !== IMAGE1.sha256) problems.push(`Image 1: ${image1Png.length} B ${sha(image1Png)}, expected ${IMAGE1.bytes} B ${IMAGE1.sha256}`);
  const manifestText = JSON.stringify(buildManifest(all, image1Png), null, 2) + "\n";
  if (sha(Buffer.from(manifestText, "utf8")) !== MANIFEST_U1_SHA256) problems.push("the rebuilt U1 request manifest does not match its pin " + MANIFEST_U1_SHA256);
  const prompt = extractPrompt(all.promptBuf);
  if (prompt !== pre.prompt) problems.push("the transmitted prompt is not the preflighted prompt");
  const pb = Buffer.from(prompt, "utf8");
  if (pb.length !== PROMPT_BODY.bytes || sha(pb) !== PROMPT_BODY.sha256) problems.push("the transmitted prompt block does not match its pin");
  if (PREP_REQUEST.model !== MODEL || PREP_REQUEST.size !== PARAMETERS.size || PREP_REQUEST.quality !== PARAMETERS.quality || PREP_REQUEST.n !== PARAMETERS.n
    || PREP_REQUEST.output_format !== PARAMETERS.output_format || PREP_REQUEST.background !== PARAMETERS.background) problems.push("the D-149 request no longer equals this adapter's request");
  return { ok: problems.length === 0, problems, image1Png, prompt, maskBuf: all.maskBuf, nsBuf: all.nsBuf };
}

function buildBody(p) {
  const fd = new FormData();
  fd.append("model", MODEL);
  fd.append("image[]", new File([p.image1Png], IMAGE1.name, { type: "image/png" }));
  fd.append("image[]", new File([p.nsBuf], NORTHSTAR_NAME, { type: "image/png" }));
  fd.append("mask", new File([p.maskBuf], MASK_NAME, { type: "image/png" }));
  fd.append("prompt", p.prompt);
  fd.append("size", PARAMETERS.size);
  fd.append("quality", PARAMETERS.quality);
  fd.append("n", String(PARAMETERS.n));
  fd.append("output_format", PARAMETERS.output_format);
  fd.append("background", PARAMETERS.background);
  const problems = [];
  for (const bad of FORBIDDEN_FIELDS) if (fd.has(bad)) problems.push("forbidden field in the body: " + bad);
  const names = [...fd.keys()];
  if (names.join("|") !== FIELD_ORDER.join("|")) problems.push("body fields " + JSON.stringify(names) + ", expected " + JSON.stringify(FIELD_ORDER));
  const images = fd.getAll("image[]");
  if (images.length !== 2 || images[0].name !== IMAGE1.name || images[1].name !== NORTHSTAR_NAME) problems.push("the image order is not Image 1 then North Star; the mask applies to image 1");
  const masks = fd.getAll("mask");
  if (masks.length !== 1 || masks[0].name !== MASK_NAME) problems.push("the body does not carry exactly the API_EDIT mask");
  if (fd.get("prompt") !== p.prompt) problems.push("the prompt in the body is not the verified prompt");
  return { ok: problems.length === 0, problems, body: fd };
}

function createClaim(file, record) {
  mkdirSync(dirname(file), { recursive: true });
  const fd = openSync(file, "wx");                 // the mandate is SPENT from this line onwards
  const payload = {
    contract: DECISION, callId: CALL_ID, claimIdentity: CLAIM_IDENTITY, repository: REPO_IDENTITY,
    status: "SPENT_BEFORE_FETCH", mandate: "SPENT",
    semantics: "Existence alone means spent. Never deleted, renamed, reset, overwritten or restored. "
      + "Spent on every outcome, including a crash or an unknown network outcome. A further attempt requires a NEW owner decision and a NEW claim identity.",
    claimedAt: new Date().toISOString(), pid: process.pid, ...record,
  };
  let contentWritten = true, contentError = null;
  try { writeSync(fd, JSON.stringify(payload, null, 2), 0, "utf8"); fsyncSync(fd); }
  catch (e) { contentWritten = false; contentError = errText(e); }
  finally { try { closeSync(fd); } catch (_) { /* the file exists either way */ } }
  return { claimedAt: payload.claimedAt, contentWritten, contentError };
}

/** Writes via an exclusive .partial and a rename. Never replaces an existing file, never deletes. */
function writeAtomic(target, data) {
  mkdirSync(dirname(target), { recursive: true });
  const partial = target + ".partial";
  writeFileSync(partial, data, { flag: "wx" });
  if (pathExists(target)) throw new Error("refusing to replace an existing file: " + target);
  renameSync(partial, target);
}

function strictBase64(s) {
  if (typeof s !== "string" || s.length === 0 || s.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return null;
  const buf = Buffer.from(s, "base64");
  return buf.length > 0 && buf.toString("base64") === s ? buf : null;
}

function pngHeader(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString("ascii", 12, 16) !== "IHDR") return { ok: false, problems: ["not a PNG"] };
  const h = { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bitDepth: buf[24], colourType: buf[25], interlace: buf[28] };
  const problems = [];
  if (h.width !== W || h.height !== H) problems.push(`${h.width}x${h.height}, expected ${W}x${H}`);
  if (h.bitDepth !== 8 || h.colourType !== 6) problems.push(`bit depth ${h.bitDepth} colour type ${h.colourType}, expected 8-bit RGBA`);
  if (h.interlace !== 0) problems.push("interlaced");
  return { ok: problems.length === 0, problems, header: h };
}

function parseArgs(argv) {
  const problems = [];
  const seen = { send: 0, approval: [], callId: [], claimIdentity: [], underpainting: [], h1: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--send") seen.send++;
    else if (a.startsWith("--owner-approval=")) seen.approval.push(a);
    else if (a.startsWith("--call-id=")) seen.callId.push(a.slice("--call-id=".length));
    else if (a.startsWith("--claim-identity=")) seen.claimIdentity.push(a.slice("--claim-identity=".length));
    else if (a.startsWith("--underpainting=")) seen.underpainting.push(a.slice("--underpainting=".length));
    else if (a.startsWith("--h1=")) seen.h1.push(a.slice("--h1=".length));
    else if (a === "--h1") {
      const v = argv[i + 1];
      if (typeof v !== "string" || v === "" || v.startsWith("--")) { problems.push("--h1 needs a path"); continue; }
      seen.h1.push(v); i++;
    } else problems.push("unknown argument: " + JSON.stringify(a));
  }
  for (const [k, v] of Object.entries(seen)) if ((Array.isArray(v) ? v.length : v) > 1) problems.push(k + " given more than once");
  if (seen.callId.length !== 1 || seen.callId[0] !== CALL_ID) problems.push("--call-id must be exactly " + CALL_ID);
  if (seen.claimIdentity.length !== 1 || seen.claimIdentity[0] !== CLAIM_IDENTITY) problems.push("--claim-identity must be exactly " + CLAIM_IDENTITY);
  if (seen.underpainting.length !== 1 || seen.underpainting[0] !== UNDERPAINTING) problems.push("--underpainting must be exactly u1 (U2 is control only and cannot be sent)");
  if (seen.approval.length === 1 && seen.approval[0] !== OWNER_APPROVAL_FLAG) problems.push("wrong owner approval: " + JSON.stringify(seen.approval[0]));
  if (seen.send === 1 && seen.approval.length === 0) problems.push("--send requires " + OWNER_APPROVAL_FLAG);
  if (seen.send === 0 && seen.approval.length === 1) problems.push(OWNER_APPROVAL_FLAG + " without --send does nothing and is refused");
  return { ok: problems.length === 0, problems, sendMode: seen.send === 1 && seen.approval[0] === OWNER_APPROVAL_FLAG,
    h1: seen.h1.length === 1 ? seen.h1[0] : undefined };
}

function refuse(stage, problems) {
  console.error("\n  REFUSED [" + stage + "] — no claim was created and no request was sent.");
  for (const p of problems) console.error("    · " + p);
  return 1;
}

// ── the one function that can fetch. Not exported. ───────────────────────────────────────────
async function main(argv) {
  console.log("D-151 R3 head colour — one-shot send adapter");
  console.log("  call id  : " + CALL_ID + "   claim identity " + CLAIM_IDENTITY);
  console.log("  endpoint : " + ENDPOINT + "   model " + MODEL);

  const args = parseArgs(argv);
  if (!args.ok) return refuse("arguments", args.problems);
  console.log("  mode     : " + (args.sendMode ? "SEND (one request, D-151)" : "DRY RUN (read-only)"));

  let apiKey = null;
  if (args.sendMode) {
    apiKey = process.env.OPENAI_API_KEY;
    if (typeof apiKey !== "string" || apiKey.length === 0) return refuse("key", ["OPENAI_API_KEY is not set"]);
  }

  const refs = resolveRefs();
  if (!refs.ok) return refuse(refs.stage, refs.problems);
  console.log("  origin/main : " + refs.originSha + "   HEAD " + refs.headSha + " (one commit on top, clean tree)");

  const auth = verifyAuthorisation();
  if (!auth.ok) return refuse("authorisation", auth.problems);
  const pins = verifyPins();
  if (!pins.ok) return refuse("pins", pins.problems);
  console.log("  authorisation : one D-151 register row and one UNSPENT contract entry; every pin matches");

  const claimLoc = resolveClaimPath();
  if (!claimLoc.ok) return refuse("claim-location", [claimLoc.why]);
  if (pathExists(claimLoc.path)) return refuse("claim-exists", ["the mandate is already spent: " + claimLoc.display]);
  const out = outputPaths();
  const occupied = out.all.filter((p) => pathExists(p));
  if (occupied.length) return refuse("outputs-not-empty", occupied.map((p) => "already exists: " + relative(REPO, p).split(sep).join("/")));

  const prepared = prepareInputs(typeof args.h1 === "string" ? args.h1 : process.env[H1.envVar]);
  if (!prepared.ok) return refuse("inputs", prepared.problems);
  const built = buildBody(prepared);
  if (!built.ok) return refuse("body", built.problems);
  console.log("  inputs   : Image 1 " + IMAGE1.sha256 + " · manifest U1 " + MANIFEST_U1_SHA256);

  if (!args.sendMode) {
    console.log("  claim    : " + claimLoc.display + "   (does not exist)");
    console.log("  outputs  : empty");
    console.log("\n  DRY RUN PASSED. Nothing was written and the API key was not read.");
    return 0;
  }

  const again = resolveRefs();
  if (!again.ok || again.originSha !== refs.originSha || again.headSha !== refs.headSha) return refuse("refs-changed", ["origin/main or HEAD changed during verification"]);

  const request = {
    endpoint: ENDPOINT, endpointType: "images.edits", model: MODEL, parameters: PARAMETERS, imagesRequested: PARAMETERS.n,
    omitted: { input_fidelity: "never sent" }, fieldOrder: FIELD_ORDER,
    inputs: [
      { role: "Image 1", name: IMAGE1.name, bytes: prepared.image1Png.length, sha256: sha(prepared.image1Png), builtFrom: { h1Sha256: H1.sha256, underpainting: "U1", u1Sha256: PINS.u1.sha256 }, maskApplies: true },
      { role: "Image 2", name: NORTHSTAR_NAME, bytes: prepared.nsBuf.length, sha256: sha(prepared.nsBuf), maskApplies: false },
    ],
    mask: { name: MASK_NAME, bytes: prepared.maskBuf.length, sha256: sha(prepared.maskBuf), contextMarginSha256: PINS.margin.sha256 },
    prompt: { fileSha256: PINS.prompt.sha256, transmittedBytes: PROMPT_BODY.bytes, transmittedSha256: PROMPT_BODY.sha256 },
    specSha256: PINS.spec.sha256, manifestU1Sha256: MANIFEST_U1_SHA256,
  };
  const startedAt = new Date().toISOString();
  const manifest = {
    tool: TOOL, decision: DECISION, callId: CALL_ID, claimIdentity: CLAIM_IDENTITY, startedAt,
    authorisedBy: { baseOriginMainSha: refs.originSha, d151CommitSha: refs.headSha, adapterSha256: sha(readFileSync(abs(ADAPTER_PATH))) },
    claim: { location: claimLoc.display, status: "SPENT_BEFORE_FETCH", mandate: "SPENT" },
    request, response: null, result: null, outcome: null,
  };

  let fetches = 0;
  let claim = null;
  const finish = (classification, stage, reason) => {
    console.log("\n  CLAIM: " + claimLoc.display + " — THE MANDATE IS SPENT ON EVERY OUTCOME.");
    manifest.claim.claimedAt = claim.claimedAt;
    manifest.claim.contentWritten = claim.contentWritten;
    manifest.claim.contentError = claim.contentError;
    manifest.finishedAt = new Date().toISOString();
    manifest.outcome = { classification, stage, reason, mandate: "SPENT", retried: false, fetches };
    try { writeAtomic(out.manifest, JSON.stringify(manifest, null, 2) + "\n"); console.log("  manifest: " + OUT.manifest); }
    catch (e) { console.error("  THE MANIFEST COULD NOT BE WRITTEN: " + errText(e) + " — the outcome on disk is UNKNOWN."); return 3; }
    console.log("  outcome : " + classification + " / " + stage + " — " + reason);
    if (stage === "done") { console.log("  raw     : " + OUT.raw + "\n  STOPPED. The deterministic evaluation and the owner's review come next. NO RETRY."); return 0; }
    console.error("  NO RETRY. The mandate stays spent.");
    return 3;
  };

  // ── point of no return: the claim, then at once the ONE fetch. No I/O and no branch between. ──
  try {
    claim = createClaim(claimLoc.path, { baseOriginMainSha: refs.originSha, d151CommitSha: refs.headSha, adapterSha256: manifest.authorisedBy.adapterSha256,
      endpoint: ENDPOINT, model: MODEL, parameters: PARAMETERS, promptSha256: PROMPT_BODY.sha256, maskSha256: request.mask.sha256,
      inputs: request.inputs.map((i) => ({ role: i.role, name: i.name, sha256: i.sha256 })), startedAt });
  } catch (e) {
    return refuse("claim", ["the exclusive claim could not be created at " + claimLoc.display + ": " + errText(e),
      "no request was sent; if a file now exists there, the mandate counts as spent"]);
  }
  // EXACTLY ONE fetch. No loop, no retry, no catch that resends.
  let res;
  try {
    fetches += 1;
    res = await globalThis.fetch(ENDPOINT, { method: "POST", headers: { Authorization: "Bearer " + apiKey }, body: built.body });
  } catch (e) {
    manifest.response = { transportError: errText(e), serverState: "UNKNOWN — the request may have been received and billed" };
    return finish("UNKNOWN_AFTER_FETCH", "transport", "transport error; the server state is UNKNOWN");
  }
  try {
    if (!res || typeof res.status !== "number" || typeof res.text !== "function") {
      manifest.response = { malformed: true, serverState: "UNKNOWN" };
      return finish("UNKNOWN_AFTER_FETCH", "transport", "the fetch returned no usable response");
    }
    const header = (k) => (res.headers && typeof res.headers.get === "function" ? res.headers.get(k) : null);
    let text;
    try { text = await res.text(); } catch (e) {
      manifest.response = { httpStatus: res.status, requestId: header("x-request-id"), bodyReadError: errText(e), serverState: "UNKNOWN" };
      return finish("UNKNOWN_AFTER_FETCH", "body-read", "the response body could not be read");
    }
    const bodyBuf = Buffer.from(text, "utf8");
    manifest.response = { httpStatus: res.status, requestId: header("x-request-id"), contentType: header("content-type"),
      openaiProcessingMs: header("openai-processing-ms"), bodyBytes: bodyBuf.length, bodySha256: sha(bodyBuf) };
    try { writeAtomic(out.response, bodyBuf); manifest.response.file = OUT.response; } catch (e) { manifest.response.fileError = errText(e); }
    let payload;
    try { payload = JSON.parse(text); } catch (_) { payload = undefined; }
    if (payload && typeof payload === "object" && payload.usage) manifest.response.usage = payload.usage;
    if (res.status < 200 || res.status >= 300) {
      const err = payload && payload.error ? payload.error : null;
      manifest.response.error = err ? { type: err.type, code: err.code, message: err.message } : null;
      return finish("RESPONSE_RECEIVED", "http", "HTTP " + res.status + "; no retry, no fallback");
    }
    if (payload === undefined) return finish("RESPONSE_RECEIVED", "parse", "the response was not JSON");
    if (payload === null || typeof payload !== "object" || !Array.isArray(payload.data) || payload.data.length < 1
      || !payload.data[0] || typeof payload.data[0].b64_json !== "string") {
      return finish("RESPONSE_RECEIVED", "payload", "the response carries no data[0].b64_json image");
    }
    manifest.response.imagesReturned = payload.data.length;
    if (payload.data.length > 1) manifest.response.extraImagesIgnored = payload.data.length - 1;   // only data[0] is ever recorded
    const img = strictBase64(payload.data[0].b64_json);
    if (!img) return finish("RESPONSE_RECEIVED", "payload", "data[0].b64_json is not strict base64");
    writeAtomic(out.raw, img);                    // the raw output, byte for byte, before any validation
    const hp = pngHeader(img);
    manifest.result = { file: OUT.raw, bytes: img.length, sha256: sha(img), header: hp.header || null, headerProblems: hp.problems };
    if (!hp.ok) return finish("RESPONSE_RECEIVED", "decode", "the returned image failed validation: " + hp.problems.join("; "));
    return finish("RESPONSE_RECEIVED", "done", "one image received, stored byte for byte and its header verified");
  } catch (e) {
    return finish("UNKNOWN_AFTER_FETCH", "internal", "unexpected error after the fetch: " + errText(e));
  }
}

const invokedDirectly = typeof process.argv[1] === "string" && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (e) => { console.error("UNEXPECTED FAILURE: " + errText(e) + " — if a claim exists, the mandate is spent and the outcome is UNKNOWN."); process.exitCode = 4; },
  );
}
