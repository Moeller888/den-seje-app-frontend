// D-143 R3 CORE-ONLY UNDERLAY — THE SEND ADAPTER (PR B). ONE CALL, ONE CLAIM, ONE FETCH.
//
// WHAT THIS FILE IS. The send path for exactly one authorised call, D-143-r3-underlay-core-v2: a
// CORE-only, mask-guided edit of H1 into the hidden bald, featureless head of the R3 technical
// underlay. It is a NEW, SEPARATE file (D-143 §6). It does not import, wrap or modify the D-139
// adapter (which keeps its own send path, pinned to its own spent call id), nor the CORE
// preparation adapter (which still cannot send). It imports NO repository module at all, so the
// only fetch call site reachable from this file is the single one below.
//
// THE THREE GATES (D-143 §13). (a) PR A merged the authorisation and no send path. (b) This file
// is PR B. Until it is merged it does not exist in origin/main, and it REFUSES to send, because it
// verifies its own presence there. (c) Only when PR B is merged AND HEAD equals origin/main can a
// SEPARATE, EXPLICIT OWNER INSTRUCTION run it. Merging this file is not an instruction to run it.
//
// THE FUNCTION THAT CAN FETCH CHECKS ITSELF (D-142 futureSendAuthorisationRule). Every check below
// runs inside main(), which is the function that calls fetch, and every one runs BEFORE the claim:
//   1  argv is parsed strictly: only --send, --owner-approval=D-143 and --h1 exist. Any other
//      argument, a duplicate, a wrong approval value, or --send without the approval is refused.
//   2  send mode only: OPENAI_API_KEY must be present (existence only; never printed or stored).
//   3  git: the repository top level is this adapter's repository; origin/main resolves from the
//      LOCAL remote-tracking ref (no network); HEAD equals it exactly; HEAD is main or detached.
//   4  every tracked input — this adapter, the register, the contract, the prompt, the CORE mask,
//      North Star and D-133's EDIT and TRANSITION fixtures — exists as a blob in that commit, and
//      the working-tree bytes equal that blob byte for byte.
//   5  the pins are checked against the origin/main BLOBS: prompt file and transmitted block, CORE
//      mask bytes, header and pixel semantics, North Star, and the D-133 fixture hashes.
//   6  the origin/main register carries D-132, D-133, D-139, D-140, D-141, D-142, D-143 and D-145
//      exactly once each; the origin/main contract carries exactly one active, unspent D-143 entry,
//      canonically identical to its merged authorisation snapshot and with every pin equal to this
//      file's constants, AND exactly one valid D-145 entry in adapterImplementations.entries that
//      names this file, the owner approval D-143, status IMPLEMENTED — NOT EXECUTED, UNSPENT,
//      NOT YET ATTEMPTED, and that merge is not an instruction to run it.
//   7  the claim location resolves outside the repository and outside temp, and no claim exists.
//   8  the output paths are empty: no raw, no manifest, and no .partial of either.
//   9  H1 is supplied explicitly (--h1 or FITTING_BASE_V1_PATH) and matches its full SHA-256.
//  10  the multipart body is assembled from the origin/main blob bytes and H1, and its field
//      order, mask and forbidden fields are asserted on the body itself.
//  11  origin/main and HEAD are resolved AGAIN and must be unchanged.
//  12  the claim is created with an exclusive "wx" open. From that line the mandate is SPENT.
//  13  exactly one fetch. There is no loop, no retry, no fallback model and no second call site.
//
// NOTHING IS INJECTABLE. There is no fetch implementation, claim path, output directory, git ref,
// register, contract or preflight parameter, and no test-environment switch. A test proves the
// behaviour by running THIS CLI inside a temporary clone with its own origin/main, a sandboxed user
// identity, a dummy key and a globalThis.fetch replaced from outside by Node's --import. This file
// knows nothing about that mock.
//
// NOTHING IS DELETED. No claim, manifest, output or partial file is ever removed, reset, renamed
// back or overwritten. A manifest is written on every outcome after the claim; a crash can still
// leave the claim SPENT without a manifest, and that is UNKNOWN — never a reason to retry.
//
// Usage:
//   node tools/avatar/openai-send-r3-underlay-core-d143.mjs --h1 <path>
//        read-only dry run: every check, nothing written, the key is not read
//   node tools/avatar/openai-send-r3-underlay-core-d143.mjs --h1 <path> --send --owner-approval=D-143
//        THE ONE SEND — only on a separate, explicit owner instruction after PR B is merged
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, lstatSync, realpathSync,
  openSync, writeSync, fsyncSync, closeSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { inflateSync } from "node:zlib";
import { join, dirname, relative, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");

// ── identity (D-143 authorises the call; D-145 fixes this implementation) ────────────────────
const TOOL = "openai-send-r3-underlay-core-d143";
const ADAPTER_PATH = "tools/avatar/openai-send-r3-underlay-core-d143.mjs";
const DECISION = "D-143";
const IMPLEMENTATION_DECISION = "D-145";
const IMPLEMENTATION_STATUS = "IMPLEMENTED — NOT EXECUTED";
const CALL_ID = "D-143-r3-underlay-core-v2";
const OWNER_APPROVAL = "D-143";
const OWNER_APPROVAL_FLAG = "--owner-approval=D-143";
const REQUIRED_DECISIONS = Object.freeze(["D-132", "D-133", "D-139", "D-140", "D-141", "D-142", "D-143", "D-145"]);
/** sha256(JSON.stringify(entry)) of the D-143 authorisedCalls entry as merged (PR #256). The
 *  snapshot is never edited; any change to it — a pin or its prose — is refused. */
const D143_ENTRY_CANONICAL_SHA256 = "6ca1754aedd8351349ab725e063190c6f265af16f79cde4fad86ad6a2c16ef6d";
/** Identities this file must never act on. Recorded only so the refusal is explicit. */
const NEVER_REUSE_CALL_IDS = Object.freeze(["D-139-r3-underlay-head-only-v1", "D-142-r3-underlay-core-v1"]);

// ── the frozen request (D-143 §3) ────────────────────────────────────────────────────────────
const ENDPOINT = "https://api.openai.com/v1/images/edits";
const MODEL = "gpt-image-2-2026-04-21";
const PARAMETERS = Object.freeze({ n: 1, size: "1024x1536", quality: "high", output_format: "png", background: "transparent" });
const FORBIDDEN_FIELDS = Object.freeze(["input_fidelity"]);
const IMAGE_FIELD = "image[]";
const MASK_FIELD = "mask";
const W = 1024;
const H = 1536;

// ── tracked inputs, read from origin/main (repository-relative, forward slashes) ─────────────
const TRACKED = Object.freeze({
  adapter: ADAPTER_PATH,
  register: "docs/project-state.md",
  contract: "tools/avatar/fixtures/r3/r3-shadow-contract-v1.json",
  prompt: "tools/avatar/fixtures/r3-underlay/r3-underlay-prompt-v2.md",
  mask: "tools/avatar/fixtures/r3-underlay/r3-underlay-api-mask-core-v1.png",
  northstar: "assets/avatar/reference/Northstar Master v2.png",
  edit: "tools/avatar/fixtures/r3-head-edit/r3-head-edit-v1.png",
  transition: "tools/avatar/fixtures/r3-head-edit/r3-head-transition-v1.png",
});

const H1 = Object.freeze({ role: "Image 1", name: "fitting-base.H1.png", bytes: 1832612,
  sha256: "72875565ecd62b542a91156dbcca1399a434fe04634f4e737df71337be0d5af4", envVar: "FITTING_BASE_V1_PATH" });
const NORTHSTAR = Object.freeze({ role: "Image 2", name: "Northstar Master v2.png", bytes: 761394,
  sha256: "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50" });
const PROMPT_FILE = Object.freeze({ name: "r3-underlay-prompt-v2.md", bytes: 6242,
  sha256: "8a4e817f0a9171968211a2b4c90dff3d6507ca9dc6f3e73b5edc2bf9bc9ec141" });
const PROMPT_BODY = Object.freeze({ bytes: 2731,
  sha256: "76cf56fb408bb65d7458645095469aa9c38c8731d4f9db23872edb30954aa693" });
const PROMPT_FIRST_LINE = "Edit the stylised avatar illustration in Image 1.";
const API_MASK = Object.freeze({ name: "r3-underlay-api-mask-core-v1.png", bytes: 10703,
  sha256: "556fb973d6dd623828e4aab42d804bf05ab1df67c037498423afd607cec55dab",
  editablePx: 123721, protectedPx: 1449143 });
const EDIT_FIXTURE_SHA256 = "5e843a9a217966e80affdc2b8783cf8926941ff4ab6d62d1e424c795f4885156";
const TRANSITION_FIXTURE_SHA256 = "8f7a6f4c703adc52adbf12d7ee9357d6c0fd85721f8e46ae92f5f508a7ddb9f3";
const NEVER_SENT_MASKS = Object.freeze(["r3-head-edit-v1.png", "r3-head-transition-v1.png",
  "r3-head-protect-v1.png", "r3-underlay-api-mask-v1.png"]);

// ── claim and outputs ────────────────────────────────────────────────────────────────────────
const REPO_IDENTITY = "Moeller888-den-seje-app-frontend";
const CLAIM_FILENAME = "D-143.claim.json";
const OUT_RAW = "tools/avatar/build/r3-underlay-core/r3-underlay-core.raw.png";
const OUT_MANIFEST = "tools/avatar/build/r3-underlay-core/r3-underlay-core.request.json";

const sha = (b) => createHash("sha256").update(b).digest("hex");
const errText = (e) => (e && e.message ? e.message : String(e));

function isInside(child, parent) {
  if (typeof child !== "string" || typeof parent !== "string" || child === "" || parent === "") return false;
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function pathExists(p) {
  try { lstatSync(p); return true; } catch (_) { return false; }
}

// ── git, read-only, against THIS repository only ─────────────────────────────────────────────
// Every GIT_* variable is removed, so no caller can redirect git to another directory, index or
// object store. Nothing here fetches: origin/main is the LOCAL remote-tracking ref.
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
  return { ok: r.status === 0, status: r.status, out: r.stdout || Buffer.alloc(0),
    err: r.stderr ? r.stderr.toString("utf8").trim() : "" };
}

const gitText = (r) => r.out.toString("utf8").trim();

function samePath(a, b) {
  let ra, rb;
  try { ra = realpathSync.native(a); rb = realpathSync.native(b); } catch (_) { return false; }
  return process.platform === "win32" ? ra.toLowerCase() === rb.toLowerCase() : ra === rb;
}

/** Resolves origin/main and HEAD, and refuses unless they are the same commit on main or detached. */
function resolveRefs() {
  const problems = [];
  const version = git(["--version"]);
  if (!version.ok) return { ok: false, stage: "git-unavailable", problems: ["git is not available: " + (version.err || "no output")] };

  const top = git(["rev-parse", "--show-toplevel"]);
  if (!top.ok) return { ok: false, stage: "git-repository", problems: ["this directory is not a git repository: " + top.err] };
  if (!samePath(gitText(top), REPO)) {
    return { ok: false, stage: "git-repository", problems: ["the git top level " + gitText(top) + " is not this adapter's repository " + REPO] };
  }

  const origin = git(["rev-parse", "--verify", "--quiet", "refs/remotes/origin/main^{commit}"]);
  const originSha = origin.ok ? gitText(origin) : "";
  if (!/^[0-9a-f]{40}$/.test(originSha)) {
    return { ok: false, stage: "origin-main", problems: ["refs/remotes/origin/main cannot be resolved to a commit"] };
  }
  const head = git(["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
  const headSha = head.ok ? gitText(head) : "";
  if (!/^[0-9a-f]{40}$/.test(headSha)) {
    return { ok: false, stage: "head", problems: ["HEAD cannot be resolved to a commit"] };
  }
  const sym = git(["symbolic-ref", "-q", "HEAD"]);
  let headRef = null;
  if (sym.ok) headRef = gitText(sym);
  else if (sym.status !== 1) return { ok: false, stage: "head", problems: ["git symbolic-ref failed: " + sym.err] };

  if (headRef !== null && headRef !== "refs/heads/main") {
    problems.push("HEAD is on branch " + headRef + "; the send runs only from main or a detached HEAD at origin/main");
    return { ok: false, stage: "branch", problems, originSha, headSha, headRef };
  }
  if (headSha !== originSha) {
    problems.push("HEAD " + headSha + " is not origin/main " + originSha + "; only the merged commit can authorise the send");
    return { ok: false, stage: "head-not-origin-main", problems, originSha, headSha, headRef };
  }
  return { ok: true, stage: null, problems, originSha, headSha, headRef };
}

/** Reads every tracked input from the origin/main commit and requires the working tree to match. */
function readOriginBlobs(originSha) {
  const problems = [];
  const blobs = {};
  const selfRel = relative(REPO, fileURLToPath(import.meta.url)).split(sep).join("/");
  if (selfRel !== ADAPTER_PATH) {
    return { ok: false, stage: "adapter-path", problems: ["this adapter runs from " + selfRel + ", not " + ADAPTER_PATH], blobs };
  }
  for (const [key, rel] of Object.entries(TRACKED)) {
    const type = git(["cat-file", "-t", originSha + ":" + rel]);
    if (!type.ok || gitText(type) !== "blob") {
      problems.push("missing from origin/main " + originSha.slice(0, 12) + ": " + rel);
      continue;
    }
    const blob = git(["cat-file", "blob", originSha + ":" + rel]);
    if (!blob.ok) { problems.push("could not read the origin/main blob for " + rel + ": " + blob.err); continue; }
    blobs[key] = blob.out;
  }
  if (problems.length) return { ok: false, stage: "blob-missing", problems, blobs };

  for (const [key, rel] of Object.entries(TRACKED)) {
    const abs = join(REPO, ...rel.split("/"));
    if (!existsSync(abs)) { problems.push("missing from the working tree: " + rel); continue; }
    let wt;
    try { wt = readFileSync(abs); } catch (e) { problems.push("unreadable in the working tree: " + rel + ": " + errText(e)); continue; }
    if (!wt.equals(blobs[key])) {
      problems.push("the working tree differs from origin/main: " + rel + " (" + wt.length + " B " + sha(wt).slice(0, 16)
        + "… vs " + blobs[key].length + " B " + sha(blobs[key]).slice(0, 16) + "…)");
    }
  }
  if (problems.length) return { ok: false, stage: "blob-divergence", problems, blobs };
  return { ok: true, stage: null, problems, blobs };
}

// ── PNG: a strict decoder for 8-bit RGBA, non-interlaced, which is all this call handles ─────
function readPngHeader(buf) {
  const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!Buffer.isBuffer(buf) || buf.length < 33) return { ok: false, why: "too short to hold a PNG header" };
  for (let i = 0; i < SIG.length; i++) if (buf[i] !== SIG[i]) return { ok: false, why: "PNG signature mismatch" };
  if (buf.readUInt32BE(8) !== 13 || buf.toString("ascii", 12, 16) !== "IHDR") return { ok: false, why: "the first chunk is not a 13-byte IHDR" };
  return { ok: true, width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bitDepth: buf[24], colourType: buf[25],
    compression: buf[26], filter: buf[27], interlace: buf[28] };
}

function headerProblems(buf, label) {
  const h = readPngHeader(buf);
  if (!h.ok) return { header: null, problems: [label + ": " + h.why] };
  const problems = [];
  if (h.width !== W || h.height !== H) problems.push(`${label}: ${h.width}x${h.height}, expected ${W}x${H}`);
  if (h.bitDepth !== 8) problems.push(`${label}: bit depth ${h.bitDepth}, expected 8`);
  if (h.colourType !== 6) problems.push(`${label}: colour type ${h.colourType}, expected 6 (RGBA)`);
  if (h.compression !== 0 || h.filter !== 0 || h.interlace !== 0) problems.push(`${label}: compression/filter/interlace must be 0/0/0`);
  return { header: h, problems };
}

function decodeRgba8(buf, label) {
  const hp = headerProblems(buf, label);
  if (hp.problems.length) throw new Error(hp.problems.join("; "));
  const idat = [];
  let off = 8;
  let iend = false;
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const start = off + 8;
    const end = start + len;
    if (end + 4 > buf.length) throw new Error(label + ": truncated chunk " + type);
    if (type === "IDAT") idat.push(buf.subarray(start, end));
    if (type === "IEND") { iend = true; break; }
    off = end + 4;
  }
  if (!iend) throw new Error(label + ": no IEND chunk");
  if (idat.length === 0) throw new Error(label + ": no IDAT chunk");
  const raw = inflateSync(Buffer.concat(idat));
  const stride = W * 4;
  if (raw.length !== H * (stride + 1)) throw new Error(label + ": decompressed " + raw.length + " B, expected " + H * (stride + 1));
  const px = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    const prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[src + x];
      const a = x >= 4 ? px[row + x - 4] : 0;
      const b = y > 0 ? px[prev + x] : 0;
      const c = x >= 4 && y > 0 ? px[prev + x - 4] : 0;
      let out;
      if (f === 0) out = v;
      else if (f === 1) out = v + a;
      else if (f === 2) out = v + b;
      else if (f === 3) out = v + ((a + b) >> 1);
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        out = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error(label + ": unknown filter type " + f + " on row " + y);
      px[row + x] = out & 0xff;
    }
  }
  return px;
}

/** The CORE mask's direction, re-derived from pixels: editable exactly on D-133 EDIT minus TRANSITION. */
function maskSemantics(maskBuf, editBuf, transitionBuf) {
  let mask, edit, trans;
  try {
    mask = decodeRgba8(maskBuf, "CORE mask");
    edit = decodeRgba8(editBuf, "D-133 EDIT");
    trans = decodeRgba8(transitionBuf, "D-133 TRANSITION");
  } catch (e) { return { ok: false, problems: [errText(e)], counts: null }; }
  const n = W * H;
  let editable = 0, protectedPx = 0, nonBinary = 0, coloured = 0, wrong = 0, bandEditable = 0;
  for (let i = 0; i < n; i++) {
    const a = mask[i * 4 + 3];
    if (a === 0) editable++; else if (a === 255) protectedPx++; else nonBinary++;
    if (mask[i * 4] !== 0 || mask[i * 4 + 1] !== 0 || mask[i * 4 + 2] !== 0) coloured++;
    const inEdit = edit[i * 4 + 3] >= 128;
    const inBand = trans[i * 4 + 3] >= 128;
    const wantEditable = inEdit && !inBand;
    if (wantEditable ? a !== 0 : a !== 255) wrong++;
    if (inBand && a === 0) bandEditable++;
  }
  const problems = [];
  if (nonBinary !== 0) problems.push(`CORE mask: alpha is not binary on ${nonBinary} px`);
  if (coloured !== 0) problems.push(`CORE mask: RGB is not 0,0,0 on ${coloured} px`);
  if (editable !== API_MASK.editablePx) problems.push(`CORE mask: ${editable} editable px, expected ${API_MASK.editablePx}`);
  if (protectedPx !== API_MASK.protectedPx) problems.push(`CORE mask: ${protectedPx} protected px, expected ${API_MASK.protectedPx}`);
  if (wrong !== 0) problems.push(`CORE mask is inverted or misaligned on ${wrong} px`);
  if (bandEditable !== 0) problems.push(`CORE mask offers ${bandEditable} TRANSITION px as editable`);
  return { ok: problems.length === 0, problems, counts: { editable, protected: protectedPx, nonBinary, coloured, bandEditable } };
}

/** The transmitted text: the single fenced block, LF-only, exactly one trailing newline. */
function extractPrompt(buf) {
  const md = buf.toString("utf8");
  if (md.length === 0) return { ok: false, why: "the prompt file is empty" };
  if (md.includes("\r")) return { ok: false, why: "the prompt file contains CR; it must be LF-only" };
  const FENCE = "`".repeat(3);
  const lines = md.split("\n");
  const fences = [];
  for (let i = 0; i < lines.length; i++) if (lines[i].trimEnd() === FENCE) fences.push(i);
  if (fences.length !== 2) return { ok: false, why: "expected exactly 2 code fences, found " + fences.length };
  const body = lines.slice(fences[0] + 1, fences[1]).join("\n").replace(/\s+$/, "") + "\n";
  if (!body.startsWith(PROMPT_FIRST_LINE)) return { ok: false, why: "the block does not start with the expected first line" };
  return { ok: true, prompt: body, fenceLines: [fences[0] + 1, fences[1] + 1] };
}

/** Pins, checked against the origin/main BLOBS — the bytes that will be sent. */
function verifyPins(blobs) {
  const problems = [];
  const pin = (label, buf, bytes, want) => {
    if (buf.length !== bytes) problems.push(`${label}: ${buf.length} B, expected ${bytes}`);
    const got = sha(buf);
    if (got !== want) problems.push(`${label}: sha ${got}, expected ${want}`);
  };
  pin("prompt file", blobs.prompt, PROMPT_FILE.bytes, PROMPT_FILE.sha256);
  let prompt = null;
  const ex = extractPrompt(blobs.prompt);
  if (!ex.ok) problems.push("prompt extraction: " + ex.why);
  else {
    const body = Buffer.from(ex.prompt, "utf8");
    pin("transmitted prompt", body, PROMPT_BODY.bytes, PROMPT_BODY.sha256);
    if (body.length === PROMPT_BODY.bytes && sha(body) === PROMPT_BODY.sha256) prompt = ex.prompt;
  }
  pin("CORE mask", blobs.mask, API_MASK.bytes, API_MASK.sha256);
  problems.push(...headerProblems(blobs.mask, "CORE mask").problems);
  pin("North Star", blobs.northstar, NORTHSTAR.bytes, NORTHSTAR.sha256);
  problems.push(...headerProblems(blobs.northstar, "North Star").problems);
  if (sha(blobs.edit) !== EDIT_FIXTURE_SHA256) problems.push("D-133 EDIT fixture: sha " + sha(blobs.edit) + ", expected " + EDIT_FIXTURE_SHA256);
  if (sha(blobs.transition) !== TRANSITION_FIXTURE_SHA256) {
    problems.push("D-133 TRANSITION fixture: sha " + sha(blobs.transition) + ", expected " + TRANSITION_FIXTURE_SHA256);
  }
  let semantics = null;
  if (problems.length === 0) {
    semantics = maskSemantics(blobs.mask, blobs.edit, blobs.transition);
    problems.push(...semantics.problems);
  }
  return { ok: problems.length === 0, problems, prompt, fenceLines: ex.ok ? ex.fenceLines : null, semantics };
}

/** The decision rows, from the origin/main register only. */
function verifyRegister(registerBuf) {
  const problems = [];
  const lines = registerBuf.toString("utf8").split("\n");
  for (const id of REQUIRED_DECISIONS) {
    const rows = lines.filter((l) => l.startsWith("| **" + id + "** |"));
    if (rows.length !== 1) problems.push(`${id} appears ${rows.length} times in the origin/main register; exactly 1 is required`);
  }
  const d143 = lines.filter((l) => l.startsWith("| **" + DECISION + "** |"));
  if (d143.length === 1) {
    for (const needle of [CALL_ID, CLAIM_FILENAME, MODEL, PROMPT_BODY.sha256, API_MASK.sha256, H1.sha256, NORTHSTAR.sha256]) {
      if (!d143[0].includes(needle)) problems.push("the origin/main D-143 row does not carry " + needle);
    }
  }
  const d145 = lines.filter((l) => l.startsWith("| **" + IMPLEMENTATION_DECISION + "** |"));
  if (d145.length === 1) {
    for (const needle of [CALL_ID, ADAPTER_PATH, OWNER_APPROVAL_FLAG, IMPLEMENTATION_STATUS]) {
      if (!d145[0].includes(needle)) problems.push("the origin/main D-145 row does not carry " + needle);
    }
  }
  return { ok: problems.length === 0, problems };
}

function parseContract(contractBuf) {
  let c;
  try { c = JSON.parse(contractBuf.toString("utf8")); } catch (_) { return { ok: false, problems: ["the origin/main contract is not valid JSON"] }; }
  if (c === null || typeof c !== "object" || Array.isArray(c)) return { ok: false, problems: ["the origin/main contract is not an object"] };
  return { ok: true, problems: [], contract: c };
}

/** The ONE authorisation entry, from the origin/main contract only: snapshot-identical, and pin by pin. */
function verifyAuthorisation(c) {
  const problems = [];
  if (c.meta && c.meta.authorisesImageRequest === true) problems.push("meta.authorisesImageRequest is true; authorisation is never a general boolean");
  if (c.preparedCall && c.preparedCall.status === "PREPARED — NOT AUTHORISED") problems.push("preparedCall is still 'PREPARED — NOT AUTHORISED'");
  if (!c.futureSendAuthorisationRule || c.futureSendAuthorisationRule.decision !== "D-142") problems.push("futureSendAuthorisationRule (D-142) is missing");
  const calls = c.authorisedCalls && Array.isArray(c.authorisedCalls.calls) ? c.authorisedCalls.calls : null;
  if (!calls) return { ok: false, problems: [...problems, "the origin/main contract carries no authorisedCalls.calls list"] };
  const matches = calls.filter((e) => e && e.callId === CALL_ID);
  if (matches.length !== 1) return { ok: false, problems: [...problems, `origin/main authorises ${matches.length} entries for ${CALL_ID}; exactly 1 is required`] };
  const sameClaim = calls.filter((e) => e && e.claim && e.claim.filename === CLAIM_FILENAME);
  if (sameClaim.length !== 1) problems.push(`${sameClaim.length} entries name the claim ${CLAIM_FILENAME}; exactly 1 is required`);

  const e = matches[0];
  const canonical = sha(Buffer.from(JSON.stringify(e), "utf8"));
  if (canonical !== D143_ENTRY_CANONICAL_SHA256) {
    problems.push("the D-143 authorisation entry is not its merged snapshot: canonical sha " + canonical + ", expected " + D143_ENTRY_CANONICAL_SHA256);
  }
  const eq = (path, got, want) => { if (got !== want) problems.push(`${path}: ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`); };
  const get = (o, ...keys) => keys.reduce((v, k) => (v !== null && typeof v === "object" ? v[k] : undefined), o);
  eq("decision", e.decision, DECISION);
  eq("mandateState", e.mandateState, "UNSPENT");
  eq("outcome", e.outcome, "NOT YET ATTEMPTED");
  if (typeof e.status !== "string" || !e.status.startsWith("AUTHORISED")) problems.push("status is not an active authorisation: " + JSON.stringify(e.status));
  if (e.neverReuse === true) problems.push("the entry is marked neverReuse");
  if (NEVER_REUSE_CALL_IDS.includes(e.callId)) problems.push("the entry names a spent call id");
  eq("endpoint", e.endpoint, ENDPOINT);
  eq("model", e.model, MODEL);
  const params = e.parameters && typeof e.parameters === "object" ? e.parameters : {};
  if (Object.keys(params).sort().join(",") !== Object.keys(PARAMETERS).sort().join(",")) {
    problems.push("parameters: keys " + JSON.stringify(Object.keys(params)) + ", expected " + JSON.stringify(Object.keys(PARAMETERS)));
  }
  for (const [k, v] of Object.entries(PARAMETERS)) eq("parameters." + k, params[k], v);
  if (!get(e, "omitted", "input_fidelity")) problems.push("omitted.input_fidelity is not recorded");
  eq("prompt.file", get(e, "prompt", "file"), TRACKED.prompt);
  eq("prompt.fileBytes", get(e, "prompt", "fileBytes"), PROMPT_FILE.bytes);
  eq("prompt.fileSha256", get(e, "prompt", "fileSha256"), PROMPT_FILE.sha256);
  eq("prompt.transmittedBytes", get(e, "prompt", "transmittedBytes"), PROMPT_BODY.bytes);
  eq("prompt.transmittedSha256", get(e, "prompt", "transmittedSha256"), PROMPT_BODY.sha256);
  eq("prompt.lineEndings", get(e, "prompt", "lineEndings"), "LF");
  eq("inputOrder", Array.isArray(e.inputOrder) ? e.inputOrder.join("|") : null, "Image 1|Image 2");
  if (!Array.isArray(e.inputs) || e.inputs.length !== 2) problems.push("inputs: expected exactly 2 entries");
  else {
    const [i1, i2] = e.inputs;
    eq("inputs[0].role", get(i1, "role"), H1.role);
    eq("inputs[0].name", get(i1, "name"), H1.name);
    eq("inputs[0].sha256", get(i1, "sha256"), H1.sha256);
    eq("inputs[0].bytes", get(i1, "bytes"), H1.bytes);
    eq("inputs[0].tracked", get(i1, "tracked"), false);
    eq("inputs[0].maskAppliesToThis", get(i1, "maskAppliesToThis"), true);
    eq("inputs[1].role", get(i2, "role"), NORTHSTAR.role);
    eq("inputs[1].name", get(i2, "name"), NORTHSTAR.name);
    eq("inputs[1].repoPath", get(i2, "repoPath"), TRACKED.northstar);
    eq("inputs[1].sha256", get(i2, "sha256"), NORTHSTAR.sha256);
    eq("inputs[1].bytes", get(i2, "bytes"), NORTHSTAR.bytes);
    eq("inputs[1].tracked", get(i2, "tracked"), true);
    eq("inputs[1].maskAppliesToThis", get(i2, "maskAppliesToThis"), false);
  }
  eq("mask.file", get(e, "mask", "file"), TRACKED.mask);
  eq("mask.sha256", get(e, "mask", "sha256"), API_MASK.sha256);
  eq("mask.bytes", get(e, "mask", "bytes"), API_MASK.bytes);
  eq("mask.semantics.editAlpha", get(e, "mask", "semantics", "editAlpha"), 0);
  eq("mask.semantics.protectAlpha", get(e, "mask", "semantics", "protectAlpha"), 255);
  eq("mask.semantics.editablePx", get(e, "mask", "semantics", "editablePx"), API_MASK.editablePx);
  eq("mask.semantics.protectedPx", get(e, "mask", "semantics", "protectedPx"), API_MASK.protectedPx);
  eq("mask.semantics.bandEditablePx", get(e, "mask", "semantics", "bandEditablePx"), 0);
  const never = get(e, "neverSentMasks", "files");
  eq("neverSentMasks.files", Array.isArray(never) ? never.join("|") : null, NEVER_SENT_MASKS.join("|"));
  eq("outputs.count", get(e, "outputs", "count"), 1);
  eq("outputs.raw", get(e, "outputs", "raw"), OUT_RAW);
  eq("outputs.manifest", get(e, "outputs", "manifest"), OUT_MANIFEST);
  eq("claim.filename", get(e, "claim", "filename"), CLAIM_FILENAME);
  return { ok: problems.length === 0, problems };
}

/** The ONE D-145 implementation entry, from the origin/main contract only, field by field. */
function verifyImplementation(c) {
  const problems = [];
  const block = c.adapterImplementations;
  if (!block || typeof block !== "object" || !Array.isArray(block.entries)) {
    return { ok: false, problems: ["the origin/main contract carries no adapterImplementations.entries list"] };
  }
  if (block.isAuthorisation !== false) problems.push("adapterImplementations.isAuthorisation must be false");
  const forCall = block.entries.filter((x) => x && x.callId === CALL_ID);
  const matches = forCall.filter((x) => x.decision === IMPLEMENTATION_DECISION);
  if (matches.length !== 1 || forCall.length !== 1) {
    return { ok: false, problems: [...problems, `origin/main carries ${matches.length} ${IMPLEMENTATION_DECISION} and ${forCall.length} total implementation entries for ${CALL_ID}; exactly 1 of each is required`] };
  }
  const x = matches[0];
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
  for (const k of Object.keys(a)) if (/^(adapter)?sha-?256$/i.test(k)) problems.push("implementation.adapter." + k + ": no adapter SHA-256 may be pinned in the contract (D-145)");
  if ("--owner-approval=" + OWNER_APPROVAL !== OWNER_APPROVAL_FLAG) problems.push("the owner approval flag does not match the pinned value");
  return { ok: problems.length === 0, problems };
}

/** One claim per user and repository identity, outside both clones and outside temp. No override. */
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
  if (isInside(path, REPO)) return { ok: false, path, why: "the claim path resolves inside the repository: " + path };
  if (isInside(path, resolve(tmpdir()))) return { ok: false, path, why: "the claim path resolves inside the temp directory: " + path };
  return { ok: true, path, why: null };
}

function outputPaths() {
  const raw = join(REPO, ...OUT_RAW.split("/"));
  const manifest = join(REPO, ...OUT_MANIFEST.split("/"));
  return { raw, manifest, all: [raw, manifest, raw + ".partial", manifest + ".partial"] };
}

/** H1 is external (D-127 §2): by --h1 or FITTING_BASE_V1_PATH, verified by full SHA-256, never copied. */
function readH1(h1Arg) {
  const path = typeof h1Arg === "string" ? h1Arg : process.env[H1.envVar];
  const source = typeof h1Arg === "string" ? "--h1" : H1.envVar;
  if (typeof path !== "string" || path === "") return { ok: false, problems: ["H1 was not supplied: pass --h1 <path> or set " + H1.envVar] };
  if (!existsSync(path)) return { ok: false, problems: ["H1 is missing at " + path] };
  let buf;
  try { buf = readFileSync(path); } catch (e) { return { ok: false, problems: ["H1 is unreadable: " + errText(e)] }; }
  const problems = [];
  if (buf.length !== H1.bytes) problems.push(`H1: ${buf.length} B, expected ${H1.bytes}`);
  if (sha(buf) !== H1.sha256) problems.push(`H1: sha ${sha(buf)}, expected ${H1.sha256}`);
  problems.push(...headerProblems(buf, "H1").problems);
  return { ok: problems.length === 0, problems, buf, path, source };
}

function buildBody(h1Buf, blobs, prompt) {
  const fd = new FormData();
  fd.append("model", MODEL);
  fd.append(IMAGE_FIELD, new File([h1Buf], H1.name, { type: "image/png" }));
  fd.append(IMAGE_FIELD, new File([blobs.northstar], NORTHSTAR.name, { type: "image/png" }));
  fd.append(MASK_FIELD, new File([blobs.mask], API_MASK.name, { type: "image/png" }));
  fd.append("prompt", prompt);
  fd.append("n", String(PARAMETERS.n));
  fd.append("size", PARAMETERS.size);
  fd.append("quality", PARAMETERS.quality);
  fd.append("output_format", PARAMETERS.output_format);
  fd.append("background", PARAMETERS.background);

  const problems = [];
  for (const bad of FORBIDDEN_FIELDS) if (fd.has(bad)) problems.push("forbidden field in the body: " + bad);
  const names = [...fd.keys()];
  const want = ["model", IMAGE_FIELD, IMAGE_FIELD, MASK_FIELD, "prompt", "n", "size", "quality", "output_format", "background"];
  if (names.join("|") !== want.join("|")) problems.push("body fields " + JSON.stringify(names) + ", expected " + JSON.stringify(want));
  const images = fd.getAll(IMAGE_FIELD);
  if (images.length !== 2 || images[0].name !== H1.name || images[1].name !== NORTHSTAR.name) {
    problems.push("the image order is not H1 then North Star; the mask applies to image 1");
  }
  const masks = fd.getAll(MASK_FIELD);
  if (masks.length !== 1 || masks[0].name !== API_MASK.name) problems.push("the body does not carry exactly the CORE mask");
  for (const f of [...images, ...masks]) if (NEVER_SENT_MASKS.includes(f.name)) problems.push("a never-sent mask reached the body: " + f.name);
  if (fd.get("prompt") !== prompt) problems.push("the prompt in the body is not the verified prompt");
  return { ok: problems.length === 0, problems, body: fd };
}

function createClaim(file, record) {
  mkdirSync(dirname(file), { recursive: true });
  const fd = openSync(file, "wx");                 // the mandate is SPENT from this line onwards
  const payload = {
    contract: DECISION, callId: CALL_ID, repository: REPO_IDENTITY,
    status: "SPENT_BEFORE_FETCH", mandate: "SPENT",
    semantics: "Existence alone means spent. Never deleted, renamed, reset, overwritten or restored. "
      + "Spent on every outcome, including a crash. A further attempt requires a NEW owner decision and a NEW claim identity.",
    claimedAt: new Date().toISOString(), pid: process.pid, ...record,
  };
  let contentWritten = true;
  let contentError = null;
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

function parseArgs(argv) {
  const problems = [];
  let send = 0, approvals = [], h1 = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--send") send++;
    else if (a.startsWith("--owner-approval=")) approvals.push(a);
    else if (a.startsWith("--h1=")) h1.push(a.slice("--h1=".length));
    else if (a === "--h1") {
      const v = argv[i + 1];
      if (typeof v !== "string" || v === "" || v.startsWith("--")) { problems.push("--h1 needs a path"); continue; }
      h1.push(v); i++;
    } else problems.push("unknown argument: " + JSON.stringify(a));
  }
  if (send > 1) problems.push("--send given more than once");
  if (approvals.length > 1) problems.push("--owner-approval given more than once");
  if (h1.length > 1) problems.push("--h1 given more than once");
  if (h1.length === 1 && h1[0] === "") problems.push("--h1 needs a path");
  if (approvals.length === 1 && approvals[0] !== OWNER_APPROVAL_FLAG) problems.push("wrong owner approval: " + JSON.stringify(approvals[0]));
  if (send === 1 && approvals.length === 0) problems.push("--send requires " + OWNER_APPROVAL_FLAG);
  if (send === 0 && approvals.length === 1) problems.push(OWNER_APPROVAL_FLAG + " without --send does nothing and is refused");
  return { ok: problems.length === 0, problems, sendMode: send === 1 && approvals.length === 1 && approvals[0] === OWNER_APPROVAL_FLAG,
    h1: h1.length === 1 ? h1[0] : undefined };
}

function refuse(stage, problems) {
  console.error("\n  REFUSED [" + stage + "] — no claim was created and no request was sent.");
  for (const p of problems) console.error("    · " + p);
  return 1;
}

// ── the one function that can fetch. Not exported. ───────────────────────────────────────────
async function main(argv) {
  console.log("D-143 R3 CORE-only underlay — send adapter");
  console.log("  call id  : " + CALL_ID);
  console.log("  endpoint : " + ENDPOINT + "   model " + MODEL);

  const args = parseArgs(argv);
  if (!args.ok) return refuse("arguments", args.problems);
  console.log("  mode     : " + (args.sendMode ? "SEND (one request, on explicit owner instruction)" : "DRY RUN (read-only)"));

  let apiKey = null;
  if (args.sendMode) {
    apiKey = process.env.OPENAI_API_KEY;
    if (typeof apiKey !== "string" || apiKey.length === 0) return refuse("key", ["OPENAI_API_KEY is not set"]);
  }

  const refs = resolveRefs();
  if (!refs.ok) return refuse(refs.stage, refs.problems);
  console.log("  origin/main : " + refs.originSha + "   HEAD " + (refs.headRef || "detached") + " = origin/main");

  const origin = readOriginBlobs(refs.originSha);
  if (!origin.ok) return refuse(origin.stage, origin.problems);
  const blobs = origin.blobs;
  console.log("  tracked inputs: " + Object.keys(TRACKED).length + " blobs in origin/main, working tree byte-identical");

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
  console.log("  authorisation : exactly one active, unspent " + CALL_ID + " entry in origin/main, identical to its D-143 snapshot");
  console.log("  implementation: exactly one " + IMPLEMENTATION_DECISION + " entry — " + IMPLEMENTATION_STATUS + ", owner approval " + OWNER_APPROVAL);
  console.log("  decisions     : " + REQUIRED_DECISIONS.join(", ") + " — one row each in the origin/main register");

  const claimLoc = resolveClaimPath();
  if (!claimLoc.ok) return refuse("claim-location", [claimLoc.why]);
  if (pathExists(claimLoc.path)) return refuse("claim-exists", ["the mandate is already spent: " + claimLoc.path]);
  const out = outputPaths();
  const occupied = out.all.filter((p) => pathExists(p));
  if (occupied.length) return refuse("outputs-not-empty", occupied.map((p) => "already exists: " + p));

  const h1 = readH1(args.h1);
  if (!h1.ok) return refuse("h1", h1.problems);

  const built = buildBody(h1.buf, blobs, pins.prompt);
  if (!built.ok) return refuse("body", built.problems);

  if (!args.sendMode) {
    console.log("  claim path    : " + claimLoc.path + "   (does not exist)");
    console.log("  outputs       : empty");
    console.log("\n  DRY RUN PASSED. Nothing was written and the API key was not read.");
    console.log("  Sending needs a separate, explicit owner instruction and: --send " + OWNER_APPROVAL_FLAG);
    return 0;
  }

  const again = resolveRefs();
  if (!again.ok || again.originSha !== refs.originSha || again.headSha !== refs.headSha) {
    return refuse("refs-changed", ["origin/main or HEAD changed during verification"]);
  }

  const blobList = Object.entries(TRACKED).map(([k, rel]) => ({ path: rel, bytes: blobs[k].length, sha256: sha(blobs[k]) }));
  const request = {
    endpoint: ENDPOINT, model: MODEL, parameters: PARAMETERS,
    omitted: { input_fidelity: "never sent" },
    inputOrder: [H1.role, NORTHSTAR.role],
    inputs: [
      { role: H1.role, name: H1.name, source: "external, " + h1.source, bytes: h1.buf.length, sha256: sha(h1.buf), maskApplies: true },
      { role: NORTHSTAR.role, name: NORTHSTAR.name, source: "origin/main blob " + TRACKED.northstar,
        bytes: blobs.northstar.length, sha256: sha(blobs.northstar), maskApplies: false },
    ],
    mask: { name: API_MASK.name, source: "origin/main blob " + TRACKED.mask, bytes: blobs.mask.length,
      sha256: sha(blobs.mask), counts: pins.semantics ? pins.semantics.counts : null },
    prompt: { file: TRACKED.prompt, fileSha256: sha(blobs.prompt), fenceLines: pins.fenceLines,
      transmittedBytes: Buffer.byteLength(pins.prompt, "utf8"), transmittedSha256: sha(Buffer.from(pins.prompt, "utf8")) },
  };
  const adapterSha256 = sha(blobs.adapter);
  const startedAt = new Date().toISOString();
  const manifest = {
    tool: TOOL, decision: DECISION, callId: CALL_ID, startedAt,
    authorisedBy: { originMainSha: refs.originSha, headSha: refs.headSha, headRef: refs.headRef,
      implementationDecision: IMPLEMENTATION_DECISION, requiredDecisions: REQUIRED_DECISIONS, blobs: blobList, adapterSha256 },
    claim: { file: claimLoc.path, status: "SPENT_BEFORE_FETCH", mandate: "SPENT" },
    request, response: null, result: null, outcome: null,
  };

  let fetches = 0;
  let claim = null;
  const finish = (stage, reason) => {
    console.log("\n  CLAIM: " + claimLoc.path + " — THE MANDATE IS SPENT ON EVERY OUTCOME.");
    manifest.claim.claimedAt = claim.claimedAt;
    manifest.claim.contentWritten = claim.contentWritten;
    manifest.claim.contentError = claim.contentError;
    manifest.finishedAt = new Date().toISOString();
    manifest.outcome = { stage, reason, mandate: "SPENT", retried: false, fetches };
    try {
      writeAtomic(out.manifest, JSON.stringify(manifest, null, 2));
      console.log("  manifest: " + out.manifest);
    } catch (e) {
      console.error("  THE MANIFEST COULD NOT BE WRITTEN: " + errText(e) + " — the outcome on disk is UNKNOWN.");
      return 3;
    }
    if (stage === "done") { console.log("  raw     : " + out.raw + "\n  STOPPED. Review material only; D-133 gates and owner review come next."); return 0; }
    console.error("  FAILED at stage '" + stage + "': " + reason + "\n  NO RETRY. The mandate stays spent.");
    return 3;
  };

  // ── point of no return: the claim, then at once the ONE fetch. No I/O and no branch between. ──
  try {
    claim = createClaim(claimLoc.path, { originMainSha: refs.originSha, adapterSha256, implementationDecision: IMPLEMENTATION_DECISION, endpoint: ENDPOINT, model: MODEL,
      parameters: PARAMETERS, promptSha256: request.prompt.transmittedSha256, maskSha256: request.mask.sha256,
      inputs: request.inputs.map((i) => ({ role: i.role, name: i.name, sha256: i.sha256 })), startedAt });
  } catch (e) {
    return refuse("claim", ["the exclusive claim could not be created at " + claimLoc.path + ": " + errText(e),
      "no request was sent; if a file now exists there, the mandate counts as spent"]);
  }
  // EXACTLY ONE fetch. No loop, no retry, no catch that resends.
  let res;
  try {
    fetches += 1;
    res = await globalThis.fetch(ENDPOINT, { method: "POST", headers: { Authorization: "Bearer " + apiKey }, body: built.body });
  } catch (e) {
    manifest.response = { transportError: errText(e), serverState: "UNKNOWN — the request may have been received and billed" };
    return finish("transport", "transport error; the server state is UNKNOWN");
  }
  try {
    if (!res || typeof res.status !== "number" || typeof res.text !== "function") {
      manifest.response = { malformed: true, serverState: "UNKNOWN" };
      return finish("transport", "the fetch returned no usable response");
    }
    const header = (k) => (res.headers && typeof res.headers.get === "function" ? res.headers.get(k) : null);
    let text;
    try { text = await res.text(); } catch (e) {
      manifest.response = { httpStatus: res.status, requestId: header("x-request-id"), bodyReadError: errText(e), serverState: "UNKNOWN" };
      return finish("body-read", "the response body could not be read");
    }
    manifest.response = { httpStatus: res.status, requestId: header("x-request-id"), contentType: header("content-type"),
      openaiProcessingMs: header("openai-processing-ms"), bodyBytes: Buffer.byteLength(text, "utf8"), bodySha256: sha(Buffer.from(text, "utf8")) };
    let payload;
    try { payload = JSON.parse(text); } catch (_) { payload = undefined; }
    if (payload && typeof payload === "object" && payload.usage) manifest.response.usage = payload.usage;
    if (res.status < 200 || res.status >= 300) {
      const err = payload && payload.error ? payload.error : null;
      manifest.response.error = err ? { type: err.type, code: err.code, message: err.message } : null;
      return finish("http", "HTTP " + res.status + "; no retry, no fallback");
    }
    if (payload === undefined) return finish("parse", "the response was not JSON");
    if (payload === null || typeof payload !== "object" || !Array.isArray(payload.data) || payload.data.length !== 1
      || !payload.data[0] || typeof payload.data[0].b64_json !== "string") {
      return finish("payload", "the response is not exactly one data[0].b64_json image");
    }
    const img = strictBase64(payload.data[0].b64_json);
    if (!img) return finish("payload", "data[0].b64_json is not strict base64");
    const hp = headerProblems(img, "result");
    manifest.verification = { bytes: img.length, sha256: sha(img), header: hp.header, problems: hp.problems };
    if (hp.problems.length) return finish("decode", "the returned image failed validation: " + hp.problems.join("; "));
    writeAtomic(out.raw, img);
    manifest.result = { file: out.raw, bytes: img.length, sha256: sha(img) };
    return finish("done", "one image received and its header verified");
  } catch (e) {
    return finish("internal", "unexpected error after the fetch: " + errText(e));
  }
}

const invokedDirectly = typeof process.argv[1] === "string" && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (e) => { console.error("UNEXPECTED FAILURE: " + errText(e) + " — if a claim exists, the mandate is spent and the outcome is UNKNOWN."); process.exitCode = 4; },
  );
}
