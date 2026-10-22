// R3 HAIR SHEET — THE SEND ADAPTER FOR ONE AUTHORISED CALL. ONE CLAIM, ONE DISPATCH RECORD, ONE FETCH.
//
// D-183 authorises exactly one call, D-183-r3-hair-northstar-v4: TWO reference images in a fixed order — Image 1 Northstar
// Master v2 (the STYLE reference: painting, line weight, shadows, highlights) and Image 2 the tracked geometry guide
// guide-hair-v1.png (the GEOMETRY reference: fit and lock structure, drawn by tools/avatar/r3-hair-guide-v1.mjs) — with
// the frozen prompt v4, one 1024x1024 transparent hair sheet for registration v2 (hairMethod.methodV2, D-179, with D-183's
// design reading of A9/A10 as short ear transitions; assets[8] r3-hair-northstar, its fourth planned call, no reserve).
// Afro, short and headwear are NOT authorised. Merging this file or D-183 is NOT an instruction to run it: the call needs a
// separate, explicit owner instruction after D-183 is merged. This file is derived from the D-180 adapter, which stays
// unchanged and closed (D-181): the identity, the second image, the prompt pin (hairMethod.methodV2.referencePack.promptV4)
// and the never-reuse list differ; the output check is still D-174's raw hair-sheet check H1..H5 (checkHairSheet from
// tools/avatar/r3-hair-tool.mjs) with H2's 16 px border unchanged — every threshold fixed before any call. The ledger is
// reused unchanged. NEVER a placement or shape check (HP1v2, HP2, HP-LOCK, HP4v2..HP8, HP-FRAG), ramp-B colouring, the eyes
// checks, the face-parts RAW checks, the master-canvas face envelope or AUTO-1..5: D-179's checks need an owner-APPROVED
// source annotation first.
//
// THE FUNCTION THAT CAN FETCH CHECKS ITSELF (D-142 futureSendAuthorisationRule). Every check runs inside main(), the
// only function that calls fetch, and every one runs BEFORE the claim:
//   1  argv is parsed strictly: --call-id=, --claim-identity=, and for a send --send and --owner-approval=D-183.
//   2  git, read-only: this repository's top level; origin/main from the LOCAL remote-tracking ref (no network); HEAD
//      equals it exactly; HEAD is main or detached.
//   3  every tracked input — this adapter, the ledger, the hair tool and the two libraries it imports, the register, the
//      contract, the prompt v4, the approved targets v2, North Star, the guide and its generator — exists as a blob in that
//      commit and the working-tree bytes equal it byte for byte.
//   4  the pins are checked on the origin/main BLOBS (the bytes that are sent): North Star, the guide, the exact prompt, the
//      targets v2.
//   5  the origin/main register carries D-142, D-159, D-174, D-179, D-181 and D-183 exactly once each; the D-183 row names
//      this call.
//   6  the origin/main contract: the general flag is false; D-142's rule, D-159's section, D-174's hair method (the
//      1024x1024 sheet, H1..H5 and every threshold equal to the tool's) and D-179's methodV2 (no authorisation; the APPROVED
//      targets v2 pin; D-183's ear-transition design reading; the reference pack with the guide pin and the prompt v4 pin,
//      FROZEN by D-183) are present; exactly one authorisedCalls entry has this call id, it is D-183's, ACTIVE and UNSPENT,
//      every pin equals this file's constants, and it is the ONLY unspent entry; no spent call id is reopened; exactly one
//      D-183 implementation entry names this file.
//   7  the claim register (shared by every local clone) has neither this call's claim nor its event log.
//   8  the output directory holds none of this call's files.
//   9  the multipart body: field order, exactly two images in the order North Star then guide, no mask, no input_fidelity,
//      size 1024x1024, background transparent.
//  —   a dry run stops here: nothing is written and no credential is read.
//  10  origin/main and HEAD are resolved AGAIN and must be unchanged.
//  11  ONLY NOW, in a send, is OPENAI_API_KEY read (presence only; never printed or stored).
//  12  the claim is created with an exclusive "wx" open. From that line the mandate is SPENT — on every outcome.
//  13  the DISPATCH RECORD is written and flushed; if it cannot be written, a STOP record is written and NOTHING is sent.
//  14  exactly one fetch, with redirect "error". No loop, no retry, no fallback model, no SDK and no second call site.
//
// OUTPUTS: the complete raw response and every image stored unchanged; a count other than 1 is UNEXPECTED; never a
// candidate file. PASS_TO_ANNOTATION means ONLY that the sheet may go to the owner's visual review and to DRAFT source
// annotation (annotation-hair-v2: A9/A10 read twice, the second time with the first reading hidden) — not that it looks
// right, and not that any D-179 placement or shape check has passed. Placement is done later ONLY by
// tools/avatar/r3-hair-compose-v2.mjs from an owner-APPROVED annotation; nothing here moves, scales, colours or repairs a pixel.
//
// Usage (only after D-183 is merged; the send only on a separate, explicit owner instruction):
//   node tools/avatar/openai-send-r3-hair-d183.mjs --call-id=D-183-r3-hair-northstar-v4 \
//        --claim-identity=D-183-r3-hair-northstar-v4-claim
//        read-only dry run: every check, nothing written, no credential read
//   … the same plus --send --owner-approval=D-183
//        THE ONE SEND
import { readFileSync, writeFileSync, renameSync, mkdirSync, lstatSync, realpathSync, readdirSync,
  openSync, writeSync, fsyncSync, closeSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join, dirname, relative, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, tmpdir } from "node:os";
import { formatEvent, deriveAttempt } from "./r3-face-neutral-attempt-ledger.mjs";
import { checkHairSheet, THRESHOLDS } from "./r3-hair-tool.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");

// ── identity (inactive until D-183 is merged; the send needs a separate owner instruction) ──────────────────────────
const TOOL = "openai-send-r3-hair-d183";
const ADAPTER_PATH = "tools/avatar/openai-send-r3-hair-d183.mjs";
const DECISION = "D-183";
const PREPARED_BY = "D-183";
const METHOD_DECISION = "D-174";
const METHOD_V2_DECISION = "D-179";
const TARGETS_DECISION = "D-179";
const CALL_ID = "D-183-r3-hair-northstar-v4";
const CLAIM_IDENTITY = "D-183-r3-hair-northstar-v4-claim";
const CLAIM_FILENAME = "D-183-r3-hair-northstar-v4.claim.json";
const EVENTS_FILENAME = "D-183-r3-hair-northstar-v4.events.jsonl";
const OWNER_APPROVAL = "D-183";
const OWNER_APPROVAL_FLAG = "--owner-approval=D-183";
const IMPLEMENTATION_STATUS = "IMPLEMENTED — NOT EXECUTED";
const REQUIRED_DECISIONS = Object.freeze(["D-142", "D-159", "D-174", "D-179", "D-181", "D-183"]);
const NEVER_REUSE_CALL_IDS = Object.freeze(["D-139-r3-underlay-head-only-v1", "D-142-r3-underlay-core-v1", "D-143-r3-underlay-core-v2",
  "D-151-r3-head-colour-u1-v1", "D-153-r3-head-colour-u1-opaque-v1", "D-160-r3-face-neutral-v1", "D-162-r3-face-neutral-guide-b-v1",
  "D-165-r3-face-parts-sheet-v1", "D-167-r3-face-parts-nose-v1", "D-170-r3-eyes-fixed-v1", "D-172-r3-eyes-fixed-v2", "D-175-r3-hair-northstar-v1",
  "D-177-r3-hair-northstar-v2", "D-180-r3-hair-northstar-v3"]);

// ── the request (the established locked model and parameters; size 1024x1024, the D-174 hair sheet) ────────────────
const ENDPOINT = "https://api.openai.com/v1/images/edits";
const MODEL = "gpt-image-2.5-sunburst-2026-09-08";
const PARAMETERS = Object.freeze({ size: "1024x1024", quality: "high", n: 1, output_format: "png", background: "transparent" });
const FIELD_ORDER = Object.freeze(["model", "image[]", "image[]", "prompt", "size", "quality", "n", "output_format", "background"]);
const NEVER_SENT_FIELDS = Object.freeze(["mask", "input_fidelity", "output_compression", "response_format", "moderation"]);
const IMAGE_FIELD = "image[]";
const W = 1024;   // North Star (Image 1) is the 1024x1536 master; the guide (Image 2) and the returned sheet are 1024x1024
const H = 1536;
const GW = 1024, GH = 1024;

// ── tracked inputs, read from origin/main (repository-relative, forward slashes) ─────────────────────────────────
const TRACKED = Object.freeze({
  adapter: ADAPTER_PATH,
  ledger: "tools/avatar/r3-face-neutral-attempt-ledger.mjs",
  hairTool: "tools/avatar/r3-hair-tool.mjs",
  eyesTool: "tools/avatar/r3-eyes-tool.mjs",
  partsTool: "tools/avatar/r3-face-parts-tool.mjs",
  register: "docs/project-state.md",
  contract: "tools/avatar/fixtures/r3/r3-shadow-contract-v1.json",
  prompt: "tools/avatar/fixtures/r3-hair/prompt-hair-sheet-v4.txt",
  targets: "tools/avatar/fixtures/r3-hair/targets-hair-v2.json",
  northstar: "assets/avatar/reference/Northstar Master v2.png",
  guide: "tools/avatar/fixtures/r3-hair/guide-hair-v1.png",
  guideGenerator: "tools/avatar/r3-hair-guide-v1.mjs",
});

const NORTHSTAR = Object.freeze({ role: "Image 1", name: "Northstar Master v2.png", bytes: 761394,
  sha256: "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50" });
const GUIDE = Object.freeze({ role: "Image 2", name: "guide-hair-v1.png", bytes: 44574,
  sha256: "4779de4acc8e58269a5fbbc96cb113507864e00314b6f9d70be7e25eecc758ec" });
const PROMPT = Object.freeze({ name: "prompt-hair-sheet-v4.txt", bytes: 1427,
  sha256: "5584602925dbc8cc9454f46bc42b771b3f35c34f64f60ee62b204707f1697ad4", encoding: "UTF-8, LF only, ending in exactly one LF (the frozen D-183 bytes)" });
const TARGETS = Object.freeze({ version: "r3-hair-targets-v2", sha256: "8c3b24e8404d3ccf44160108eaf13cd58cdb66c6705f503a6415b49a151864cc" });
const SHEET_TYPE = "r3-hair-sheet-v1";

// ── claim register and outputs ───────────────────────────────────────────────────────────────────────────────────
const REPO_IDENTITY = "Moeller888-den-seje-app-frontend";
const OUT_DIR = "tools/avatar/build/r3-hair-d183";
const OUT = Object.freeze({
  response: OUT_DIR + "/r3-hair-d183.response.json",
  manifest: OUT_DIR + "/r3-hair-d183.request.json",
  check: OUT_DIR + "/r3-hair-d183.check.json",
});
const imageOut = (k) => OUT_DIR + "/r3-hair-d183.image-" + k + ".png";
const MAX_IMAGES_STORED = 16;

const sha = (b) => createHash("sha256").update(b).digest("hex");
const errText = (e) => (e && e.message ? e.message : String(e));
const abs = (rel) => join(REPO, ...rel.split("/"));

function isInside(child, parent) {
  if (typeof child !== "string" || typeof parent !== "string" || child === "" || parent === "") return false;
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
function pathExists(p) { try { lstatSync(p); return true; } catch (_) { return false; } }

// ── git, read-only, against THIS repository only; nothing here fetches ───────────────────────────────────────────
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

/** origin/main and HEAD must be the same commit, on main or detached. */
function resolveRefs() {
  const version = git(["--version"]);
  if (!version.ok) return { ok: false, stage: "git-unavailable", problems: ["git is not available: " + (version.err || "no output")] };
  const top = git(["rev-parse", "--show-toplevel"]);
  if (!top.ok) return { ok: false, stage: "git-repository", problems: ["this directory is not a git repository: " + top.err] };
  if (!samePath(gitText(top), REPO)) return { ok: false, stage: "git-repository", problems: ["the git top level is not this adapter's repository"] };
  const origin = git(["rev-parse", "--verify", "--quiet", "refs/remotes/origin/main^{commit}"]);
  const originSha = origin.ok ? gitText(origin) : "";
  if (!/^[0-9a-f]{40}$/.test(originSha)) return { ok: false, stage: "origin-main", problems: ["refs/remotes/origin/main cannot be resolved to a commit"] };
  const head = git(["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
  const headSha = head.ok ? gitText(head) : "";
  if (!/^[0-9a-f]{40}$/.test(headSha)) return { ok: false, stage: "head", problems: ["HEAD cannot be resolved to a commit"] };
  const sym = git(["symbolic-ref", "-q", "HEAD"]);
  let headRef = null;
  if (sym.ok) headRef = gitText(sym);
  else if (sym.status !== 1) return { ok: false, stage: "head", problems: ["git symbolic-ref failed: " + sym.err] };
  if (headRef !== null && headRef !== "refs/heads/main") {
    return { ok: false, stage: "branch", problems: ["HEAD is on " + headRef + "; the send runs only from main or a detached HEAD at origin/main"] };
  }
  if (headSha !== originSha) {
    return { ok: false, stage: "head-not-origin-main", problems: ["HEAD " + headSha + " is not origin/main " + originSha + "; only the merged commit can authorise the send"] };
  }
  return { ok: true, originSha, headSha, headRef };
}

/** Every tracked input from the origin/main commit; the working tree must equal each blob byte for byte. */
function readOriginBlobs(originSha) {
  const problems = [];
  const blobs = {};
  const selfRel = relative(REPO, fileURLToPath(import.meta.url)).split(sep).join("/");
  if (selfRel !== ADAPTER_PATH) return { ok: false, stage: "adapter-path", problems: ["this adapter runs from " + selfRel + ", not " + ADAPTER_PATH] };
  for (const [key, rel] of Object.entries(TRACKED)) {
    const type = git(["cat-file", "-t", originSha + ":" + rel]);
    if (!type.ok || gitText(type) !== "blob") { problems.push("missing from origin/main " + originSha.slice(0, 12) + ": " + rel); continue; }
    const blob = git(["cat-file", "blob", originSha + ":" + rel]);
    if (!blob.ok) { problems.push("could not read the origin/main blob for " + rel + ": " + blob.err); continue; }
    blobs[key] = blob.out;
  }
  if (problems.length) return { ok: false, stage: "blob-missing", problems };
  for (const [key, rel] of Object.entries(TRACKED)) {
    let wt;
    try { wt = readFileSync(abs(rel)); } catch (e) { problems.push("unreadable in the working tree: " + rel + ": " + errText(e)); continue; }
    if (!wt.equals(blobs[key])) problems.push("the working tree differs from origin/main: " + rel);
  }
  if (problems.length) return { ok: false, stage: "blob-divergence", problems };
  return { ok: true, blobs };
}

function pngHeader(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a
    || buf.readUInt32BE(8) !== 13 || buf.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bitDepth: buf[24], colourType: buf[25], interlace: buf[28] };
}
function rgbaMasterProblems(buf, label, w = W, hh = H) {
  const h = pngHeader(buf);
  if (!h) return [label + ": not a PNG"];
  const problems = [];
  if (h.width !== w || h.height !== hh) problems.push(`${label}: ${h.width}x${h.height}, expected ${w}x${hh}`);
  if (h.bitDepth !== 8 || h.colourType !== 6 || h.interlace !== 0) problems.push(`${label}: bit depth ${h.bitDepth}, colour type ${h.colourType}, interlace ${h.interlace}; expected 8-bit RGBA, not interlaced`);
  return problems;
}

/** Pins, on the origin/main BLOBS — the bytes that will be sent. */
function verifyPins(blobs) {
  const problems = [];
  if (blobs.prompt.length !== PROMPT.bytes || sha(blobs.prompt) !== PROMPT.sha256) problems.push(`prompt: ${blobs.prompt.length} B ${sha(blobs.prompt)}, expected ${PROMPT.bytes} B ${PROMPT.sha256}`);
  const text = blobs.prompt.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(blobs.prompt) || text.includes("\r") || !text.endsWith("\n") || text.endsWith("\n\n")) problems.push("prompt: must be UTF-8, LF-only, ending in exactly one LF");
  if (blobs.northstar.length !== NORTHSTAR.bytes || sha(blobs.northstar) !== NORTHSTAR.sha256) problems.push(`North Star: ${blobs.northstar.length} B ${sha(blobs.northstar)}, expected ${NORTHSTAR.bytes} B ${NORTHSTAR.sha256}`);
  problems.push(...rgbaMasterProblems(blobs.northstar, "North Star"));
  if (blobs.guide.length !== GUIDE.bytes || sha(blobs.guide) !== GUIDE.sha256) problems.push(`guide: ${blobs.guide.length} B ${sha(blobs.guide)}, expected ${GUIDE.bytes} B ${GUIDE.sha256}`);
  problems.push(...rgbaMasterProblems(blobs.guide, "guide", GW, GH));
  if (sha(blobs.targets) !== TARGETS.sha256) problems.push(`targets: ${sha(blobs.targets)}, expected the D-179 approved ${TARGETS.sha256}`);
  else {
    let t = null; try { t = JSON.parse(blobs.targets.toString("utf8")); } catch (_) { t = null; }
    if (!t || t.version !== TARGETS.version || t.status !== "APPROVED" || !t.approval || t.approval.decision !== TARGETS_DECISION) problems.push("targets: not the D-179 APPROVED version " + TARGETS.version);
  }
  return { ok: problems.length === 0, problems, prompt: problems.length === 0 ? text : null };
}

/** The decision rows, from the origin/main register only. */
function verifyRegister(registerBuf) {
  const problems = [];
  const lines = registerBuf.toString("utf8").split("\n");
  for (const id of REQUIRED_DECISIONS) {
    const n = lines.filter((l) => l.startsWith("| **" + id + "** |")).length;
    if (n !== 1) problems.push(`${id} appears ${n} times in the origin/main register; exactly 1 is required`);
  }
  const row = lines.find((l) => l.startsWith("| **" + DECISION + "** |"));
  if (row) {
    for (const needle of [CALL_ID, CLAIM_IDENTITY, CLAIM_FILENAME, MODEL, ADAPTER_PATH, OWNER_APPROVAL_FLAG, NORTHSTAR.sha256, GUIDE.sha256, PROMPT.sha256, TARGETS.sha256, PARAMETERS.size]) {
      if (!row.includes(needle)) problems.push("the origin/main " + DECISION + " row does not carry " + needle);
    }
  }
  return { ok: problems.length === 0, problems };
}

function parseContract(buf) {
  let c;
  try { c = JSON.parse(buf.toString("utf8")); } catch (_) { return { ok: false, problems: ["the origin/main contract is not valid JSON"] }; }
  if (c === null || typeof c !== "object" || Array.isArray(c)) return { ok: false, problems: ["the origin/main contract is not an object"] };
  return { ok: true, contract: c };
}

const INPUT_1 = Object.freeze({ order: 1, role: NORTHSTAR.role, purpose: "the STYLE reference: painting, line weight, shadows and highlights of the boy's hair", name: NORTHSTAR.name, repoPath: TRACKED.northstar, bytes: NORTHSTAR.bytes, sha256: NORTHSTAR.sha256, tracked: true });
const INPUT_2 = Object.freeze({ order: 2, role: GUIDE.role, purpose: "the GEOMETRY reference: fit, size, position and lock structure on the 1024x1024 sheet", name: GUIDE.name, repoPath: TRACKED.guide, bytes: GUIDE.bytes, sha256: GUIDE.sha256, tracked: true });
const PROMPT_ENTRY = Object.freeze({ file: TRACKED.prompt, bytes: PROMPT.bytes, sha256: PROMPT.sha256, encoding: PROMPT.encoding });
const get = (o, ...keys) => keys.reduce((v, k) => (v !== null && typeof v === "object" ? v[k] : undefined), o);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The ONE authorisation entry, from the origin/main contract only, pin by pin. */
function verifyAuthorisation(c) {
  const problems = [];
  const eq = (path, got, want) => { if (!same(got, want)) problems.push(`${path}: ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`); };
  if (get(c, "meta", "authorisesImageRequest") !== false) problems.push("meta.authorisesImageRequest must stay false; authorisation is never a general boolean");
  if (get(c, "futureSendAuthorisationRule", "decision") !== "D-142") problems.push("futureSendAuthorisationRule (D-142) is missing");
  if (get(c, "faceNeutralPreparation", "decision") !== "D-159") problems.push("faceNeutralPreparation (D-159: the claim / dispatch / result axes) is missing");
  const hair = get(c, "hairMethod");
  if (get(hair, "decision") !== METHOD_DECISION || get(hair, "isAuthorisation") !== false || get(hair, "authorisesImageRequest") !== false) problems.push("hairMethod (D-174) is missing or claims to be an authorisation");
  else {
    eq("D-174 rawSheet.sheetType", get(hair, "rawSheet", "sheetType"), SHEET_TYPE);
    eq("D-174 rawSheet.size", get(hair, "rawSheet", "size"), [1024, 1024]);
    const v2 = get(hair, "methodV2");
    if (get(v2, "decision") !== METHOD_V2_DECISION || get(v2, "isAuthorisation") !== false || get(v2, "authorisesImageRequest") !== false) problems.push("hairMethod.methodV2 (D-179) is missing or claims to be an authorisation");
    const pack = get(v2, "referencePack");
    if (get(pack, "decision") !== DECISION) problems.push("hairMethod.methodV2.referencePack (D-183) is missing");
    eq("D-183 referencePack.inputOrder", get(pack, "inputOrder"), [NORTHSTAR.role, GUIDE.role]);
    eq("D-183 referencePack.guide.file", get(pack, "guide", "file"), TRACKED.guide);
    eq("D-183 referencePack.guide.sha256", get(pack, "guide", "sha256"), GUIDE.sha256);
    eq("D-183 referencePack.guide.bytes", get(pack, "guide", "bytes"), GUIDE.bytes);
    eq("D-183 referencePack.promptV4.file", get(pack, "promptV4", "file"), TRACKED.prompt);
    eq("D-183 referencePack.promptV4.sha256", get(pack, "promptV4", "sha256"), PROMPT.sha256);
    eq("D-183 referencePack.promptV4.bytes", get(pack, "promptV4", "bytes"), PROMPT.bytes);
    if (!/^FROZEN by D-183/.test(get(pack, "promptV4", "status") || "")) problems.push("the hair prompt v4 is not FROZEN by D-183");
    if (get(v2, "earTransitionDesign", "decision") !== DECISION) problems.push("D-183's design reading of A9/A10 (hairMethod.methodV2.earTransitionDesign) is missing");
    eq("methodV2.targets.file", get(v2, "targets", "file"), TRACKED.targets);
    eq("methodV2.targets.sha256", get(v2, "targets", "sha256"), TARGETS.sha256);
    eq("methodV2.targets.status", get(v2, "targets", "status"), "APPROVED");
    eq("methodV2.targets.approvedByDecision", get(v2, "targets", "approvedByDecision"), TARGETS_DECISION);
    if (!/^MANDATORY/.test(get(v2, "registration", "repeatedReading") || "")) problems.push("D-179's mandatory repeated reading of A9/A10 is not intact");
    eq("hairMethod.thresholds (must equal the tool's, fixed before any call)", get(hair, "thresholds"), JSON.parse(JSON.stringify(THRESHOLDS)));
    const binding = get(hair, "checks", "rawSheet", "binding");
    if (!Array.isArray(binding) || binding.length !== 5 || !["H1", "H2", "H3", "H4", "H5"].every((id, i) => typeof binding[i] === "string" && binding[i].startsWith(id + " "))) problems.push("D-174's binding raw hair-sheet checks H1..H5 are not intact");
  }
  const calls = Array.isArray(get(c, "authorisedCalls", "calls")) ? c.authorisedCalls.calls : null;
  if (!calls) return { ok: false, problems: [...problems, "the origin/main contract carries no authorisedCalls.calls list"] };
  for (const id of NEVER_REUSE_CALL_IDS) {
    const x = calls.find((e) => e && e.callId === id);
    if (x && (x.mandateState !== "SPENT" || x.neverReuse !== true) && id !== "D-139-r3-underlay-head-only-v1") problems.push("a spent call id is not SPENT and neverReuse: " + id);
    if (x && x.mandateState === "UNSPENT") problems.push("a spent call id reads as UNSPENT: " + id);
  }
  const mine = calls.filter((e) => e && e.callId === CALL_ID);
  if (mine.length !== 1) return { ok: false, problems: [...problems, `origin/main authorises ${mine.length} entries for ${CALL_ID}; exactly 1 is required`] };
  const live = calls.filter((e) => e && e.mandateState === "UNSPENT").map((e) => e.callId);
  if (live.length !== 1 || live[0] !== CALL_ID) problems.push(CALL_ID + " must be the only UNSPENT entry; found " + JSON.stringify(live));
  if (calls.filter((e) => e && get(e, "claim", "identity") === CLAIM_IDENTITY).length !== 1) problems.push("exactly one entry may name the claim identity " + CLAIM_IDENTITY);
  const e = mine[0];
  eq("decision", e.decision, DECISION);
  eq("preparedBy", e.preparedBy, PREPARED_BY);
  if (typeof e.status !== "string" || !e.status.startsWith("AUTHORISED")) problems.push("status is not an active authorisation: " + JSON.stringify(e.status));
  eq("mandateState", e.mandateState, "UNSPENT");
  eq("outcome", e.outcome, "NOT YET ATTEMPTED");
  for (const k of ["neverReuse", "notAnActivePermission", "closedBy"]) if (k in e) problems.push("the entry carries " + k + "; it is not an active, unspent permission");
  eq("endpoint", e.endpoint, ENDPOINT);
  eq("operation", e.operation, "images.edits");
  eq("model", e.model, MODEL);
  const params = e.parameters && typeof e.parameters === "object" ? e.parameters : {};
  eq("parameters keys", Object.keys(params).sort(), Object.keys(PARAMETERS).sort());
  for (const [k, v] of Object.entries(PARAMETERS)) eq("parameters." + k, params[k], v);
  eq("fieldOrder", e.fieldOrder, FIELD_ORDER);
  eq("neverSentFields", e.neverSentFields, NEVER_SENT_FIELDS);
  eq("inputOrder", e.inputOrder, [NORTHSTAR.role, GUIDE.role]);
  eq("inputs.length", Array.isArray(e.inputs) ? e.inputs.length : null, 2);
  eq("inputs[0]", get(e, "inputs", 0), INPUT_1);
  eq("inputs[1]", get(e, "inputs", 1), INPUT_2);
  eq("prompt", e.prompt, PROMPT_ENTRY);
  eq("targets.file", get(e, "targets", "file"), TRACKED.targets);
  eq("targets.sha256", get(e, "targets", "sha256"), TARGETS.sha256);
  eq("claim.identity", get(e, "claim", "identity"), CLAIM_IDENTITY);
  eq("claim.filename", get(e, "claim", "filename"), CLAIM_FILENAME);
  eq("claim.eventsFilename", get(e, "claim", "eventsFilename"), EVENTS_FILENAME);
  eq("adapter.file", get(e, "adapter", "file"), ADAPTER_PATH);
  eq("outputs.count", get(e, "outputs", "count"), 1);
  eq("outputs.dir", get(e, "outputs", "dir"), OUT_DIR);
  eq("outputs.sheet", get(e, "outputs", "sheet"), [1024, 1024]);
  eq("outputs.sheetType", get(e, "outputs", "sheetType"), SHEET_TYPE);
  if (!/Exactly one fetch/.test(get(e, "prohibitions", "noRetry") || "")) problems.push("the entry does not bind the call to exactly one fetch");
  if (!/never an underlay, face-neutral or eyes call/.test(get(e, "accounting", "slot") || "")) problems.push("the entry does not record the attempt in the hair slot, apart from the underlay, face-neutral and eyes figures");
  if (!/H1\.\.H5/.test(get(e, "outputHandling", "technicalChecks") || "")) problems.push("the entry does not bind the sheet to D-174's H1..H5");
  if (!/annotation-hair-v2.*first reading hidden/.test(get(e, "outputHandling", "annotation") || "")) problems.push("the entry does not bind the annotation to annotation-hair-v2 with the hidden second reading");
  if (!/ONLY by tools\/avatar\/r3-hair-compose-v2\.mjs/.test(get(e, "outputHandling", "composition") || "")) problems.push("the entry does not leave placement to the v2 compose tool alone");
  if (!/NOT authorised/.test(get(e, "otherHairstyles") || "")) problems.push("the entry does not keep afro, short and headwear unauthorised");
  return { ok: problems.length === 0, problems };
}

/** The ONE D-183 implementation entry, from the origin/main contract only, field by field (D-145: no adapter hash pinned). */
function verifyImplementation(c) {
  const problems = [];
  const block = c.adapterImplementations;
  if (!block || typeof block !== "object" || !Array.isArray(block.entries)) return { ok: false, problems: ["the origin/main contract carries no adapterImplementations.entries list"] };
  if (block.isAuthorisation !== false) problems.push("adapterImplementations.isAuthorisation must be false");
  const forCall = block.entries.filter((x) => x && x.callId === CALL_ID);
  if (forCall.length !== 1 || forCall[0].decision !== DECISION) return { ok: false, problems: [...problems, `origin/main carries ${forCall.length} implementation entries for ${CALL_ID}; exactly one ${DECISION} entry is required`] };
  const x = forCall[0];
  const a = x.adapter && typeof x.adapter === "object" ? x.adapter : {};
  const eq = (path, got, want) => { if (got !== want) problems.push(`${path}: ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`); };
  eq("implementation.authorisedBy", x.authorisedBy, DECISION);
  eq("implementation.adapter.file", a.file, ADAPTER_PATH);
  eq("implementation.adapter.status", a.status, IMPLEMENTATION_STATUS);
  eq("implementation.adapter.ownerApproval", a.ownerApproval, OWNER_APPROVAL);
  eq("implementation.adapter.ownerApprovalFlag", a.ownerApprovalFlag, OWNER_APPROVAL_FLAG);
  eq("implementation.mandateState", x.mandateState, "UNSPENT");
  eq("implementation.outcome", x.outcome, "NOT YET ATTEMPTED");
  eq("implementation.mergeIsNotAnInstruction", x.mergeIsNotAnInstruction, true);
  eq("implementation.executionRequiresSeparateOwnerInstruction", x.executionRequiresSeparateOwnerInstruction, true);
  for (const k of Object.keys(a)) if (/sha-?256/i.test(k)) problems.push("implementation.adapter." + k + ": no adapter SHA-256 is pinned in the contract (D-145)");
  return { ok: problems.length === 0, problems };
}

/** One claim and one event log per user and repository identity, outside every clone and outside temp. No override. */
function resolveClaimLocation() {
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
  const dir = resolve(base, "DenSejeApp", "one-shot-claims", REPO_IDENTITY);
  if (isInside(dir, REPO)) return { ok: false, why: "the claim register resolves inside the repository" };
  if (isInside(dir, resolve(tmpdir()))) return { ok: false, why: "the claim register resolves inside the temp directory" };
  return { ok: true, claim: join(dir, CLAIM_FILENAME), events: join(dir, EVENTS_FILENAME),
    claimDisplay: "<claim register>/" + REPO_IDENTITY + "/" + CLAIM_FILENAME, eventsDisplay: "<claim register>/" + REPO_IDENTITY + "/" + EVENTS_FILENAME };
}

/** Any existing file of this call in the output directory — including a .partial — means the outputs are not empty. */
function occupiedOutputs() {
  const dir = abs(OUT_DIR);
  if (!pathExists(dir)) return [];
  let names;
  try { names = readdirSync(dir); } catch (e) { return ["the output directory cannot be listed: " + errText(e)]; }
  return names.filter((n) => n.startsWith("r3-hair-d183.")).map((n) => OUT_DIR + "/" + n);
}

function buildBody(blobs, prompt) {
  const fd = new FormData();
  fd.append("model", MODEL);
  fd.append(IMAGE_FIELD, new File([blobs.northstar], NORTHSTAR.name, { type: "image/png" }));
  fd.append(IMAGE_FIELD, new File([blobs.guide], GUIDE.name, { type: "image/png" }));
  fd.append("prompt", prompt);
  fd.append("size", PARAMETERS.size);
  fd.append("quality", PARAMETERS.quality);
  fd.append("n", String(PARAMETERS.n));
  fd.append("output_format", PARAMETERS.output_format);
  fd.append("background", PARAMETERS.background);
  const problems = [];
  for (const bad of NEVER_SENT_FIELDS) if (fd.has(bad)) problems.push("a never-sent field is in the body: " + bad);
  const names = [...fd.keys()];
  if (names.join("|") !== FIELD_ORDER.join("|")) problems.push("body fields " + JSON.stringify(names) + ", expected " + JSON.stringify(FIELD_ORDER));
  const images = fd.getAll(IMAGE_FIELD);
  if (images.length !== 2 || images[0].name !== NORTHSTAR.name || images[1].name !== GUIDE.name) problems.push("the body must carry exactly two images, North Star then the guide");
  if (fd.get("prompt") !== prompt) problems.push("the prompt in the body is not the verified prompt");
  if (fd.getAll("size").length !== 1 || fd.get("size") !== "1024x1024") problems.push("the body does not carry exactly size 1024x1024");
  if (fd.getAll("background").length !== 1 || fd.get("background") !== "transparent") problems.push("the body does not carry exactly background transparent");
  return { ok: problems.length === 0, problems, body: fd };
}

function createClaim(file, record) {
  mkdirSync(dirname(file), { recursive: true });
  const fd = openSync(file, "wx");                 // the mandate is SPENT from this line onwards
  const payload = {
    contract: DECISION, callId: CALL_ID, claimIdentity: CLAIM_IDENTITY, repository: REPO_IDENTITY, mandate: "SPENT",
    semantics: "Existence alone means the claim is consumed and the mandate is spent. A consumed claim is NOT a dispatch: "
      + "the dispatch is recorded separately in " + EVENTS_FILENAME + ". Never deleted, renamed, reset, overwritten or restored. "
      + "No outcome permits an automatic retry; a further attempt requires a NEW owner decision, a NEW call id, a NEW claim identity and new capacity.",
    claimedAt: new Date().toISOString(), pid: process.pid, ...record,
  };
  let contentWritten = true, contentError = null;
  try { writeSync(fd, JSON.stringify(payload, null, 2), 0, "utf8"); fsyncSync(fd); }
  catch (e) { contentWritten = false; contentError = errText(e); }
  finally { try { closeSync(fd); } catch (_) { /* the file exists either way */ } }
  return { claimedAt: payload.claimedAt, contentWritten, contentError };
}

/** Appends one flushed record to the event log. flag "wx" for the first record (the log must not exist), "a" after. */
function appendEvent(file, line, flag) {
  const fd = openSync(file, flag);
  try { writeSync(fd, line, null, "utf8"); fsyncSync(fd); }
  finally { closeSync(fd); }
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

function parseArgs(argv) {
  const problems = [];
  const seen = { send: 0, approval: [], callId: [], claimIdentity: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--send") seen.send++;
    else if (a.startsWith("--owner-approval=")) seen.approval.push(a);
    else if (a.startsWith("--call-id=")) seen.callId.push(a.slice("--call-id=".length));
    else if (a.startsWith("--claim-identity=")) seen.claimIdentity.push(a.slice("--claim-identity=".length));
    else problems.push("unknown argument: " + JSON.stringify(a.split("=")[0]));
  }
  for (const [k, v] of Object.entries(seen)) if ((Array.isArray(v) ? v.length : v) > 1) problems.push(k + " given more than once");
  if (seen.callId.length !== 1 || seen.callId[0] !== CALL_ID) problems.push("--call-id must be exactly " + CALL_ID);
  if (seen.claimIdentity.length !== 1 || seen.claimIdentity[0] !== CLAIM_IDENTITY) problems.push("--claim-identity must be exactly " + CLAIM_IDENTITY);
  if (seen.approval.length === 1 && seen.approval[0] !== OWNER_APPROVAL_FLAG) problems.push("wrong owner approval: " + JSON.stringify(seen.approval[0]));
  if (seen.send === 1 && seen.approval.length === 0) problems.push("--send requires " + OWNER_APPROVAL_FLAG);
  if (seen.send === 0 && seen.approval.length === 1) problems.push(OWNER_APPROVAL_FLAG + " without --send does nothing and is refused");
  return { ok: problems.length === 0, problems, sendMode: seen.send === 1 && seen.approval[0] === OWNER_APPROVAL_FLAG };
}

function refuse(stage, problems) {
  console.error("\n  REFUSED [" + stage + "] — no claim was created and no request was sent.");
  for (const p of problems) console.error("    · " + p);
  return 1;
}

// ── the one function that can fetch. Not exported. ───────────────────────────────────────────────────────────────
async function main(argv) {
  console.log("R3 hair sheet — one-shot send adapter (call " + CALL_ID + ")");
  console.log("  endpoint : " + ENDPOINT + "   model " + MODEL);

  const args = parseArgs(argv);
  if (!args.ok) return refuse("arguments", args.problems);
  console.log("  mode     : " + (args.sendMode ? "SEND (one request, on a separate explicit owner instruction)" : "DRY RUN (read-only)"));

  const refs = resolveRefs();
  if (!refs.ok) return refuse(refs.stage, refs.problems);
  console.log("  origin/main : " + refs.originSha + "   HEAD " + (refs.headRef || "detached") + " = origin/main");

  const origin = readOriginBlobs(refs.originSha);
  if (!origin.ok) return refuse(origin.stage, origin.problems);
  const blobs = origin.blobs;

  const pins = verifyPins(blobs);
  if (!pins.ok) return refuse("pins", pins.problems);
  const register = verifyRegister(blobs.register);
  if (!register.ok) return refuse("register", register.problems);
  const parsed = parseContract(blobs.contract);
  if (!parsed.ok) return refuse("authorisation", parsed.problems);
  const auth = verifyAuthorisation(parsed.contract);
  if (!auth.ok) return refuse("authorisation", auth.problems);
  const impl = verifyImplementation(parsed.contract);
  if (!impl.ok) return refuse("implementation", impl.problems);
  console.log("  authorisation : exactly one active, unspent " + CALL_ID + " entry and one " + DECISION + " implementation entry in origin/main");

  const loc = resolveClaimLocation();
  if (!loc.ok) return refuse("claim-location", [loc.why]);
  if (pathExists(loc.claim)) return refuse("claim-exists", ["the mandate is already spent: " + loc.claimDisplay]);
  if (pathExists(loc.events)) return refuse("events-exist", ["an event log already exists for this call: " + loc.eventsDisplay]);
  const occupied = occupiedOutputs();
  if (occupied.length) return refuse("outputs-not-empty", occupied.map((p) => "already exists: " + p));

  const built = buildBody(blobs, pins.prompt);
  if (!built.ok) return refuse("body", built.problems);
  console.log("  inputs   : Image 1 North Star " + NORTHSTAR.sha256 + " · Image 2 guide " + GUIDE.sha256 + " · prompt " + PROMPT.sha256 + " · size " + PARAMETERS.size);

  if (!args.sendMode) {
    console.log("  claim    : " + loc.claimDisplay + "   (does not exist)");
    console.log("  outputs  : empty");
    console.log("\n  DRY RUN PASSED. Nothing was written and no credential was read.");
    return 0;
  }

  const again = resolveRefs();
  if (!again.ok || again.originSha !== refs.originSha || again.headSha !== refs.headSha) return refuse("refs-changed", ["origin/main or HEAD changed during verification"]);

  // The credential is read only here: after every check, in a send, immediately before the claim.
  const apiKey = process.env.OPENAI_API_KEY;
  if (typeof apiKey !== "string" || apiKey.length === 0) return refuse("key", ["OPENAI_API_KEY is not set"]);

  const adapterSha256 = sha(blobs.adapter);
  const request = {
    endpoint: ENDPOINT, operation: "images.edits", model: MODEL, parameters: PARAMETERS, fieldOrder: FIELD_ORDER,
    neverSentFields: NEVER_SENT_FIELDS, redirect: "error", inputOrder: [NORTHSTAR.role, GUIDE.role],
    inputs: [
      { role: NORTHSTAR.role, name: NORTHSTAR.name, source: "origin/main blob " + TRACKED.northstar, bytes: blobs.northstar.length, sha256: sha(blobs.northstar) },
      { role: GUIDE.role, name: GUIDE.name, source: "origin/main blob " + TRACKED.guide, bytes: blobs.guide.length, sha256: sha(blobs.guide) },
    ],
    prompt: { file: TRACKED.prompt, source: "origin/main blob", bytes: blobs.prompt.length, sha256: sha(blobs.prompt) },
  };
  const startedAt = new Date().toISOString();
  const manifest = {
    tool: TOOL, decision: DECISION, callId: CALL_ID, claimIdentity: CLAIM_IDENTITY, slot: "hair sheet, assets[8] (never an underlay, face-neutral or eyes call)", startedAt,
    authorisedBy: { originMainSha: refs.originSha, headSha: refs.headSha, adapterSha256,
      blobs: Object.entries(TRACKED).map(([k, rel]) => ({ path: rel, bytes: blobs[k].length, sha256: sha(blobs[k]) })) },
    claim: { location: loc.claimDisplay }, events: { location: loc.eventsDisplay }, request,
    response: null, images: null, check: null, outcome: null, accounting: null,
  };

  let fetches = 0;
  let seq = 0;
  let claim = null;
  // `fresh` starts the record on a new line, so a record written after a torn write is never fused into the torn line.
  const event = (name, fields, flag, fresh = false) => { seq += 1; appendEvent(loc.events, (fresh ? "\n" : "") + formatEvent(CALL_ID, seq, name, fields), flag); };
  const finish = (classification, stage, reason) => {
    console.log("\n  CLAIM: " + loc.claimDisplay + " — consumed; the mandate is spent on every outcome.");
    let claimPresent = false, eventsText = "";
    try { claimPresent = pathExists(loc.claim); eventsText = pathExists(loc.events) ? readFileSync(loc.events, "utf8") : ""; } catch (e) { manifest.events.readError = errText(e); }
    manifest.claim.claimedAt = claim ? claim.claimedAt : null;
    manifest.claim.contentWritten = claim ? claim.contentWritten : null;
    manifest.claim.contentError = claim ? claim.contentError : null;
    manifest.accounting = deriveAttempt({ claimPresent, eventsText, callId: CALL_ID });
    manifest.finishedAt = new Date().toISOString();
    manifest.outcome = { classification, stage, reason, mandate: "SPENT", automaticRetry: false, fetches,
      candidateWritten: false, promoted: false, runtimeChanged: false };
    try { writeAtomic(abs(OUT.manifest), JSON.stringify(manifest, null, 2) + "\n"); console.log("  manifest: " + OUT.manifest); }
    catch (e) { console.error("  THE MANIFEST COULD NOT BE WRITTEN: " + errText(e) + " — read the claim and the event log."); return 3; }
    const a = manifest.accounting;
    console.log("  accounting: claim " + a.claimState + " · dispatch " + a.dispatch + " · result " + a.result + " · actuallySent " + a.actuallySent
      + " · dispatchUndetermined " + a.dispatchUndetermined + " · serverAnswered " + a.serverAnswered);
    console.log("  outcome : " + classification + " / " + stage + " — " + reason + "\n  NO RETRY. No candidate file is written; the owner reviews.");
    return stage === "done" ? 0 : 3;
  };

  // ── point of no return: the claim, the dispatch record, then at once the ONE fetch ──────────────────────────────
  try {
    claim = createClaim(loc.claim, { originMainSha: refs.originSha, adapterSha256, endpoint: ENDPOINT, model: MODEL, parameters: PARAMETERS,
      promptSha256: request.prompt.sha256, inputs: request.inputs.map((i) => ({ role: i.role, name: i.name, sha256: i.sha256 })), startedAt });
  } catch (e) {
    return refuse("claim", ["the exclusive claim could not be created at " + loc.claimDisplay + ": " + errText(e),
      "no request was sent; if a file now exists there, the mandate counts as spent"]);
  }
  try {
    event("dispatch", { at: new Date().toISOString(), note: "written immediately before the request is handed to the network client; not proof of server receipt" }, "wx");
  } catch (e) {
    const why = errText(e);
    try { event("stop", { at: new Date().toISOString(), reason: "the dispatch record could not be written: " + why + "; nothing was sent" }, "a", true); }
    catch (e2) { manifest.events.stopWriteError = errText(e2); }
    manifest.events.dispatchWriteError = why;
    return finish("NOT_DISPATCHED", "dispatch-record", "the dispatch record could not be written, so the request was not sent");
  }
  // EXACTLY ONE fetch. No loop, no retry, no catch that resends, and a redirect is an error, never a second request.
  let res;
  try {
    fetches += 1;
    res = await globalThis.fetch(ENDPOINT, { method: "POST", redirect: "error", headers: { Authorization: "Bearer " + apiKey }, body: built.body });
  } catch (e) {
    manifest.response = { transportError: errText(e), serverState: "UNKNOWN — the request may have been received and billed" };
    try { event("transport-error", { at: new Date().toISOString(), error: errText(e) }, "a"); } catch (e2) { manifest.events.writeError = errText(e2); }
    return finish("DISPATCHED_RESULT_UNKNOWN", "transport", "transport error after the dispatch record; the server state is UNKNOWN");
  }
  try {
    if (!res || typeof res.status !== "number" || typeof res.arrayBuffer !== "function") {
      manifest.response = { malformed: true, serverState: "UNKNOWN" };
      return finish("DISPATCHED_RESULT_UNKNOWN", "transport", "the fetch returned no usable response");
    }
    const header = (k) => (res.headers && typeof res.headers.get === "function" ? res.headers.get(k) : null);
    const requestId = header("x-request-id");
    let bodyBuf = null, bodyReadError = null;
    try { bodyBuf = Buffer.from(await res.arrayBuffer()); } catch (e) { bodyReadError = errText(e); }
    try { event("answer", { at: new Date().toISOString(), httpStatus: res.status, requestId, bodyRead: bodyBuf !== null }, "a"); }
    catch (e) { manifest.events.writeError = errText(e); }
    manifest.response = { httpStatus: res.status, requestId, contentType: header("content-type"), openaiProcessingMs: header("openai-processing-ms") };
    if (bodyBuf === null) {
      manifest.response.bodyReadError = bodyReadError;
      return finish(res.status >= 200 && res.status < 300 ? "RESPONSE_BODY_UNREADABLE" : "HTTP_ERROR", "body-read", "the response body could not be read");
    }
    manifest.response.bodyBytes = bodyBuf.length;
    manifest.response.bodySha256 = sha(bodyBuf);
    try { writeAtomic(abs(OUT.response), bodyBuf); manifest.response.file = OUT.response; } catch (e) { manifest.response.fileError = errText(e); }
    let payload;
    try { payload = JSON.parse(bodyBuf.toString("utf8")); } catch (_) { payload = undefined; }
    if (payload && typeof payload === "object" && payload.usage) manifest.response.usage = payload.usage;
    if (res.status < 200 || res.status >= 300) {
      const err = payload && payload.error ? payload.error : null;
      manifest.response.error = err ? { type: err.type, code: err.code, message: err.message } : null;
      return finish("HTTP_ERROR", "http", "HTTP " + res.status + "; no retry, no fallback");
    }
    if (payload === undefined || payload === null || typeof payload !== "object" || !Array.isArray(payload.data)) {
      return finish("UNEXPECTED", "payload", "the response is not JSON with a data list; the raw body is kept unchanged");
    }

    // Every delivered image is stored unchanged. Nothing is selected.
    const images = [];
    for (let k = 0; k < payload.data.length; k++) {
      const item = payload.data[k];
      const img = item && typeof item.b64_json === "string" ? strictBase64(item.b64_json) : null;
      const rec = { index: k, decodable: img !== null };
      if (img) {
        rec.bytes = img.length; rec.sha256 = sha(img);
        if (k < MAX_IMAGES_STORED) { try { writeAtomic(abs(imageOut(k + 1)), img); rec.file = imageOut(k + 1); } catch (e) { rec.fileError = errText(e); } }
        else rec.notStored = "beyond " + MAX_IMAGES_STORED + " images; its bytes remain in the raw response";
      }
      images.push(rec);
    }
    manifest.images = { count: payload.data.length, requested: PARAMETERS.n, items: images };
    if (payload.data.length !== PARAMETERS.n) {
      return finish("UNEXPECTED", "done", payload.data.length + " images returned for n = 1; all are kept, none is selected, no check is run");
    }
    if (!images[0].decodable) return finish("UNEXPECTED", "done", "the single image is not strict base64; the raw response is kept");

    // Exactly one image: D-174's raw hair-sheet checks H1..H5, every threshold fixed before any call — never a placement
    // check, ramp-B colouring, an eyes check, the face-parts RAW checks, the master-canvas envelope or AUTO-1..5. Never a
    // candidate file. The pixel array is not written.
    const imgBuf = Buffer.from(payload.data[0].b64_json, "base64");
    let report;
    try {
      const { px: _pixels, ...rest } = checkHairSheet(imgBuf);
      report = rest;
    } catch (e) { report = { verdict: "CHECK_ERROR", error: errText(e) }; }
    const checkDoc = { tool: TOOL, callId: CALL_ID, check: "D-174 raw hair sheet " + SHEET_TYPE + " (H1..H5, thresholds as hairMethod.thresholds)", thresholds: THRESHOLDS, image: { file: images[0].file || null, sha256: images[0].sha256 }, ...report,
      candidateWritten: false, annotation: "none — the v2 source annotation (annotation-hair-v2) is made later as DRAFT, bound to this image's SHA-256: A4 with the tool's proposal as a review aid only, A9 and A10 each read twice under the same point definition, the second time with the first reading hidden, each with its marked crop, and both temple locks with tip, notches and evidence; only the owner sets APPROVED",
      placement: "none — D-179's checks (HP1v2 seat residual and aspect, HP2, HP-LOCK, HP4v2..HP8, HP-FRAG) need that owner-APPROVED annotation and are NOT run on the raw sheet; placement is done later ONLY by tools/avatar/r3-hair-compose-v2.mjs; no free manual moving, scaling or pixel repair",
      lowAlpha: "alpha 1..15 is reported only (D-174); no threshold is changed after the result",
      visualReview: "Northstar's hairstyle with two separate temple locks, readable ear transitions, a V-shaped parting, no lock below the ears or at the neck, one connected piece, complete lock tips, the margin, not mirrored, no face, skin, scalp or ears, and ramp B's tone convention are reviewed by the owner; no check approves them",
      note: "A REJECT means no candidate may exist. PASS_TO_ANNOTATION means ONLY that the sheet may go to the owner's visual review and to DRAFT source annotation; it does not approve its appearance." };
    try { writeAtomic(abs(OUT.check), JSON.stringify(checkDoc, null, 2) + "\n"); } catch (e) { manifest.checkFileError = errText(e); }
    manifest.check = { file: OUT.check, verdict: report.verdict, firstFailure: report.firstFailure || null };
    if (report.verdict === "REJECT") return finish("TECHNICAL_REJECT", "done", "one hair sheet received and stored; rejected at " + report.firstFailure + "; no candidate");
    if (report.verdict !== "PASS_TO_ANNOTATION") return finish("CHECK_ERROR", "done", "one hair sheet received and stored; the check could not run");
    return finish("PASS_TO_VISUAL_REVIEW_AND_ANNOTATION", "done", "one hair sheet received, stored byte for byte, and through H1..H5; owner visual review and DRAFT v2 source annotation next — not an appearance approval and no D-179 placement or shape check");
  } catch (e) {
    return finish("DISPATCHED_RESULT_UNKNOWN", "internal", "unexpected error after the fetch: " + errText(e));
  }
}

const invokedDirectly = typeof process.argv[1] === "string" && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (e) => { console.error("UNEXPECTED FAILURE: " + errText(e) + " — if a claim exists, the mandate is spent; read the event log."); process.exitCode = 4; },
  );
}
