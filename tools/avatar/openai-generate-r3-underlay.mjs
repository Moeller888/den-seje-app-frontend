// D-139 R3 TECHNICAL-UNDERLAY ADAPTER — the send path for the ONE head-only edit of H1.
//
// SEPARATE FROM D-121 AND D-129 BY DESIGN. `openai-refine-northstar-d.mjs` is pinned to D-121 and
// `openai-generate-fitting-base.mjs` to D-129: their inputs, prompts and claim filenames all name
// those decisions, and their mandates are their own. Neither is imported, wrapped or modified here,
// so nothing in this file can weaken a contract that is already frozen or a mandate already spent.
//
// WHAT IS DIFFERENT FROM D-129, AND WHY:
//   · TWO ordered image inputs, not one. H1 is Image 1 because the Images edit endpoint applies the
//     mask to the FIRST image; North Star v2 is Image 2 and is a style reference only.
//   · A MASK IS SENT. D-127 §1 made the fitting-base call maskless. This call is mask-guided, and
//     the mask is a purpose-built API mask (D-139 §3) — never one of D-133's marker fixtures, whose
//     alpha means the opposite.
//   · H1 IS EXTERNAL (D-127 §2). It is passed by --h1 or FITTING_BASE_V1_PATH, verified by full
//     SHA-256, and never copied into the repository.
//
// THE MASK IS NOT THE GUARANTEE. It is model guidance. What actually keeps every pixel outside the
// head byte-identical is D-133's deterministic recomposition, which runs AFTER this tool and copies
// PROTECT back from H1. Never describe the mask as the 0-changed-pixels gate.
//
// IT DOES NOT SEND ANYTHING BY DEFAULT. A bare run is a read-only dry run: no directory, no claim,
// no output, no manifest. Sending requires ALL of:
//   --send  AND  --owner-approval=D-139  AND  a passing preflight  AND  D-132, D-133 and D-139 each
//   present exactly once in docs/project-state.md  AND  the contract's authorisedCalls entry for
//   this call id agreeing with every pin below.
// One flag alone never sends. A wrong confirmation value never sends.
//
// FAIL-CLOSED, ONCE — D-122 §8 semantics:
//   The claim is created with an EXCLUSIVE create (flag "wx") IMMEDIATELY before the single fetch.
//   Once it exists the mandate is SPENT — on a crash, a timeout, a transport error, an HTTP error,
//   a moderation refusal, an unknown server state, a parse failure or an invalid output exactly as
//   much as on success. Nothing here deletes, resets or retries. A further attempt needs a NEW
//   OWNER DECISION. The claim resolves to a per-USER location derived from the REPOSITORY IDENTITY,
//   so both clones share one mandate and no Git operation can reach it. There is deliberately NO
//   --claim-path, NO --force and NO --reset-claim.
//
// The API key is read from the environment only. It is never printed, logged, or written to the
// claim or the manifest.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, statSync,
  openSync, writeSync, fsyncSync, closeSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, tmpdir } from "node:os";
import { decodePng } from "./build-r2-torso-occlusion-mask.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

export const TOOL = "openai-generate-r3-underlay";
export const CALL_ID = "D-139-r3-underlay-head-only-v1";
export const CONTRACT_PATH = join(REPO, "tools", "avatar", "fixtures", "r3", "r3-shadow-contract-v1.json");
export const FIXTURES = join(REPO, "tools", "avatar", "fixtures", "r3-underlay");
export const EDIT_FIXTURE = join(REPO, "tools", "avatar", "fixtures", "r3-head-edit", "r3-head-edit-v1.png");
export const REGISTER = join(REPO, "docs", "project-state.md");
/** Only OUTPUTS go to the gitignored build area. No request input and NO CLAIM live there. */
export const OUT = join(REPO, "tools", "avatar", "build", "r3-underlay");

// ── the frozen request contract (D-139) ──────────────────────────────────────────────────────
export const ENDPOINT = "https://api.openai.com/v1/images/edits";
export const MODEL = "gpt-image-2-2026-04-21";   // dated snapshot; NO fallback is permitted
export const SIZE = "1024x1536";
export const QUALITY = "high";
export const OUTPUT_FORMAT = "png";
export const BACKGROUND = "transparent";
export const N = 1;
export const RETRY = false;
export const FALLBACK_MODEL = false;
export const AUTO_PROMPT_EDIT = false;

/** Never in the request body. gpt-image-2 treats inputs at high fidelity automatically. */
export const FORBIDDEN_FIELDS = ["input_fidelity"];
export const IMAGE_FIELD = "image[]";
export const MASK_FIELD = "mask";

export const REQUIRED_DECISIONS = ["D-132", "D-133", "D-139"];
export const OWNER_APPROVAL_FLAG = "--owner-approval=D-139";
/** The environment variable the external authoring base may be named by, as elsewhere in the R3 tools. */
export const H1_ENV = "FITTING_BASE_V1_PATH";

const [EXPECT_W, EXPECT_H] = SIZE.split("x").map(Number);
export const EXPECT_BIT_DEPTH = 8;
export const EXPECT_COLOUR_TYPE = 6;   // truecolour + alpha (RGBA)
export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * THE TWO API IMAGE INPUTS, IN ORDER. The order is part of the contract, not a convenience: the
 * endpoint applies the mask to the first image, so H1 must be first. Image 2 is a tracked repository
 * asset; Image 1 is external and is resolved at run time.
 */
export const INPUTS = [
  { role: "Image 1", name: "fitting-base.H1.png", external: true, envVar: H1_ENV,
    decision: "D-131", bytes: 1832612,
    sha256: "72875565ecd62b542a91156dbcca1399a434fe04634f4e737df71337be0d5af4",
    maskApplies: true,
    purpose: "the approved authoring base — binding for every existing pixel, the body geometry and the drawing style" },
  { role: "Image 2", name: "Northstar Master v2.png", external: false,
    repoPath: ["assets", "avatar", "reference", "Northstar Master v2.png"],
    decision: "D-124", bytes: 761394,
    sha256: "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50",
    maskApplies: false,
    purpose: "identity and style reference for head shape, skin tone and line style ONLY — hair and facial features must NOT be copied" },
];

/** THE API MASK. Sent, unlike D-129's local-only masks — but only this one, and only as guidance. */
export const API_MASK = { name: "r3-underlay-api-mask-v1.png", bytes: 10768,
  sha256: "28ff1ac00f6972697411ad29c5618f9ede4b5a0a4fd086a41ec0bfb5fe7561fb",
  editablePx: 125423, protectedPx: 1447441,
  derivedFrom: { name: "r3-head-edit-v1.png",
    sha256: "5e843a9a217966e80affdc2b8783cf8926941ff4ab6d62d1e424c795f4885156", marker: [236, 72, 153] },
  semantics: "alpha 0 = EDITABLE, alpha 255 = PROTECTED — the ALPHA-INVERSE of D-133's marker fixtures" };

/** D-133's marker fixtures. Verified NOT to be in the request body: their alpha means the opposite. */
export const NEVER_SENT_MASKS = ["r3-head-edit-v1.png", "r3-head-transition-v1.png", "r3-head-protect-v1.png"];

/** The prompt, tracked by D-139. BOTH hashes are pinned: the wrapper file, and the fenced block. */
export const PROMPT_FILE = { name: "r3-underlay-prompt.md", bytes: 6089,
  sha256: "8a5cb283a4cb5803adf45d8d35e68a0c058a6604ffc9869ec58ea1ee514724f6" };
export const PROMPT_BODY = { bytes: 2157,
  sha256: "ca9faa53f4346bbfbaccc106f80345524c5061c45c51bdce2d54c3bbf4caf6a9" };
export const PROMPT_FIRST_LINE = "Edit the stylised avatar illustration in Image 1.";
export const PROMPT_MARKERS = ["Image 1", "Image 2 is a reference for HEAD SHAPE, SKIN TONE and LINE STYLE ONLY",
  "CHANGE ONLY THE HEAD:", "KEEP EXACTLY AS THEY ARE IN IMAGE 1:", "- The ears, in the same position, shape and size.",
  "THE BALD HEAD MUST BE:", "DO NOT ADD:", "OUTPUT:"];
export const PROMPT_TRAILING_NEWLINES = 1;

// ── the one-shot claim, per user and per REPOSITORY IDENTITY ─────────────────────────────────
export const REPO_IDENTITY = "Moeller888-den-seje-app-frontend";
export const CLAIM_APP_DIR = "DenSejeApp";
export const CLAIM_SUBDIR = "one-shot-claims";
/** D-139 gets its OWN claim. D-121's and D-129's are separate files and are never touched here. */
export const CLAIM_FILENAME = "D-139.claim.json";

/** True when `child` is the same path as, or lives inside, `parent`. */
export function isInside(child, parent) {
  if (typeof child !== "string" || typeof parent !== "string" || child === "" || parent === "") return false;
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Resolves the ONE claim file for this user and this repository identity. Windows requires
 * %LOCALAPPDATA%, and there is deliberately no fallback to the repository, the build directory, the
 * working directory or temp — each would either be wiped by ordinary cleanup or differ per clone.
 */
export function resolveClaimPath(opts) {
  const o = opts || {};
  const env = o.env || process.env;
  const platform = o.platform || process.platform;
  const repoRoot = o.repoRoot || REPO;
  const tempDir = Object.prototype.hasOwnProperty.call(o, "tmpDir") ? o.tmpDir : tmpdir();
  const home = Object.prototype.hasOwnProperty.call(o, "homeDir") ? o.homeDir : homedir();

  let base = null;
  let scope = null;
  if (platform === "win32") {
    const local = env.LOCALAPPDATA;
    if (typeof local !== "string" || local.trim() === "") {
      return { ok: false, path: null, scope: "windows-user-local-appdata",
        why: "LOCALAPPDATA is not set; refusing to fall back to the repository, the build directory, the working directory or temp" };
    }
    base = local;
    scope = "windows-user-local-appdata";
  } else {
    const xdg = env.XDG_STATE_HOME;
    if (typeof xdg === "string" && xdg.trim() !== "") { base = xdg; scope = "xdg-state-home"; }
    else if (typeof home === "string" && home.trim() !== "") { base = join(home, ".local", "state"); scope = "home-local-state"; }
    else {
      return { ok: false, path: null, scope: "home-local-state",
        why: "neither XDG_STATE_HOME nor a home directory is available; refusing to fall back to the repository or temp" };
    }
  }

  const dir = join(base, CLAIM_APP_DIR, CLAIM_SUBDIR, REPO_IDENTITY);
  const path = join(dir, CLAIM_FILENAME);
  if (isInside(path, repoRoot)) return { ok: false, path, scope, why: "the resolved claim path is inside the repository: " + path };
  if (typeof tempDir === "string" && tempDir !== "" && isInside(path, tempDir)) {
    return { ok: false, path, scope, why: "the resolved claim path is inside the temp directory: " + path };
  }
  return { ok: true, path, dir, scope, why: null };
}

const sha = (b) => createHash("sha256").update(b).digest("hex");
const FENCE = "`".repeat(3);

/** Where the OUTPUTS live. The claim is NOT here — see resolveClaimPath. */
export function outputPaths(outDir) {
  const d = outDir || OUT;
  return { dir: d, raw: join(d, "r3-underlay.raw.png"), manifest: join(d, "r3-underlay.request.json") };
}

/** The external authoring base, by explicit flag or by environment. Never a guessed default. */
export function resolveH1Path(opts) {
  const o = opts || {};
  if (typeof o.h1Path === "string" && o.h1Path !== "") return { ok: true, path: o.h1Path, source: "--h1" };
  const argv = o.argv || [];
  const flag = argv.find((a) => a.startsWith("--h1="));
  if (flag) {
    const v = flag.slice("--h1=".length);
    if (v !== "") return { ok: true, path: v, source: "--h1=" };
  }
  const i = argv.indexOf("--h1");
  if (i >= 0 && typeof argv[i + 1] === "string" && argv[i + 1] !== "" && !argv[i + 1].startsWith("--")) {
    return { ok: true, path: argv[i + 1], source: "--h1" };
  }
  const env = o.env || process.env;
  const fromEnv = env[H1_ENV];
  if (typeof fromEnv === "string" && fromEnv !== "") return { ok: true, path: fromEnv, source: H1_ENV };
  return { ok: false, path: null, source: null,
    why: "H1 is external (D-127 §2) and was not supplied — pass --h1 <path> or set " + H1_ENV };
}

// ── PNG header reading ───────────────────────────────────────────────────────────────────────
export function readPngHeader(buf) {
  if (!Buffer.isBuffer(buf)) return { ok: false, why: "not a buffer" };
  if (buf.length < 33) return { ok: false, why: "too short to hold a PNG header" };
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (buf[i] !== PNG_SIGNATURE[i]) return { ok: false, why: "PNG signature mismatch at byte " + i };
  }
  if (buf.toString("ascii", 12, 16) !== "IHDR") return { ok: false, why: "the first chunk is not IHDR" };
  return { ok: true, width: buf.readUInt32BE(16), height: buf.readUInt32BE(20),
    bitDepth: buf[24], colourType: buf[25], interlace: buf[28] };
}

export function validatePngHeader(buf, label) {
  const h = readPngHeader(buf);
  if (!h.ok) return { ok: false, problems: [label + ": " + h.why], header: null };
  const problems = [];
  if (h.width !== EXPECT_W || h.height !== EXPECT_H) {
    problems.push(label + ": " + h.width + "x" + h.height + ", expected " + EXPECT_W + "x" + EXPECT_H);
  }
  if (h.bitDepth !== EXPECT_BIT_DEPTH) problems.push(label + ": bit depth " + h.bitDepth + ", expected " + EXPECT_BIT_DEPTH);
  if (h.colourType !== EXPECT_COLOUR_TYPE) problems.push(label + ": colour type " + h.colourType + ", expected " + EXPECT_COLOUR_TYPE + " (RGBA)");
  return { ok: problems.length === 0, problems, header: h };
}

/**
 * THE MASK DIRECTION GATE. A pinned hash proves the file did not drift; it does not prove the file
 * means what the endpoint needs. This re-derives the direction from pixels, against D-133's EDIT
 * fixture, so an inverted or misaligned mask is caught even if someone re-pins the hash.
 */
export function verifyMaskSemantics(maskBuf, editBuf) {
  const problems = [];
  let mask, edit;
  try { mask = decodePng(maskBuf, "API mask"); } catch (e) { return { ok: false, problems: ["API mask: " + e.message], counts: null }; }
  try { edit = decodePng(editBuf, "D-133 EDIT fixture"); } catch (e) { return { ok: false, problems: ["D-133 EDIT fixture: " + e.message], counts: null }; }
  if (mask.w !== EXPECT_W || mask.h !== EXPECT_H) problems.push(`API mask: ${mask.w}x${mask.h}, expected ${EXPECT_W}x${EXPECT_H}`);
  if (edit.w !== mask.w || edit.h !== mask.h) problems.push("the API mask and the D-133 EDIT fixture are not the same size");
  if (problems.length) return { ok: false, problems, counts: null };

  const n = mask.w * mask.h;
  let editable = 0, protectedPx = 0, nonBinary = 0, coloured = 0, wrongInEdit = 0, wrongOutside = 0;
  for (let i = 0; i < n; i++) {
    const a = mask.rgba[i * 4 + 3];
    if (a === 0) editable++; else if (a === 255) protectedPx++; else nonBinary++;
    if (mask.rgba[i * 4] !== 0 || mask.rgba[i * 4 + 1] !== 0 || mask.rgba[i * 4 + 2] !== 0) coloured++;
    const inEdit = edit.rgba[i * 4 + 3] >= 128;
    if (inEdit && a !== 0) wrongInEdit++;
    if (!inEdit && a !== 255) wrongOutside++;
  }
  if (nonBinary !== 0) problems.push(`API mask: alpha is not binary on ${nonBinary} px`);
  if (coloured !== 0) problems.push(`API mask: RGB is not 0,0,0 on ${coloured} px — a mask must carry no figure pixel`);
  if (editable !== API_MASK.editablePx) problems.push(`API mask: ${editable} editable px, expected ${API_MASK.editablePx}`);
  if (protectedPx !== API_MASK.protectedPx) problems.push(`API mask: ${protectedPx} protected px, expected ${API_MASK.protectedPx}`);
  if (editable + protectedPx !== n) problems.push("API mask: editable + protected does not cover the canvas exactly");
  if (wrongInEdit !== 0) problems.push(`API mask is INVERTED or misaligned: ${wrongInEdit} px inside D-133 EDIT are not transparent`);
  if (wrongOutside !== 0) problems.push(`API mask is INVERTED or misaligned: ${wrongOutside} px outside D-133 EDIT are not opaque`);
  return { ok: problems.length === 0, problems, counts: { editable, protected: protectedPx, nonBinary, coloured } };
}

/** Base64 that must be exactly what it claims to be: Node decodes sloppily, so round-trip it. */
export function decodeStrictBase64(s) {
  if (typeof s !== "string" || s.length === 0) return { ok: false, why: "not a non-empty string" };
  if (s.length % 4 !== 0) return { ok: false, why: "length is not a multiple of 4" };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return { ok: false, why: "characters outside the base64 alphabet" };
  const buf = Buffer.from(s, "base64");
  if (buf.length === 0) return { ok: false, why: "decoded to zero bytes" };
  if (buf.toString("base64") !== s) return { ok: false, why: "does not round-trip; it is not strict base64" };
  return { ok: true, buf };
}

// ── prompt extraction: the prompt is byte-locked, not retyped ────────────────────────────────
/** The transmitted text is the fenced block with LF endings and EXACTLY ONE trailing newline. */
export function extractPrompt(md) {
  if (typeof md !== "string" || md.length === 0) return { ok: false, why: "prompt file is empty or not text" };
  if (md.includes("\r")) return { ok: false, why: "prompt file contains CR; it must be LF-only" };
  const lines = md.split("\n");
  const fences = [];
  for (let i = 0; i < lines.length; i++) if (lines[i].trimEnd() === FENCE) fences.push(i);
  if (fences.length !== 2) return { ok: false, why: "expected exactly 2 code fences, found " + fences.length };
  const body = lines.slice(fences[0] + 1, fences[1]).join("\n").replace(/\s+$/, "") + "\n";
  if (!body.startsWith(PROMPT_FIRST_LINE)) return { ok: false, why: "fenced block does not start with the expected first line" };
  if (!body.endsWith("\n") || body.endsWith("\n\n")) return { ok: false, why: "the transmitted text must end with exactly one newline" };
  for (const marker of PROMPT_MARKERS) {
    if (!body.includes(marker)) return { ok: false, why: "prompt does not contain the required section " + JSON.stringify(marker) };
  }
  return { ok: true, prompt: body, fenceLines: [fences[0] + 1, fences[1] + 1] };
}

// ── the structural bar: the authorising rows must actually be in the register ────────────────
export function decisionExists(id, registerPath) {
  const reg = registerPath || REGISTER;
  if (!existsSync(reg)) return { found: false, why: "the decision register was not found at " + reg };
  const rows = readFileSync(reg, "utf8").split("\n").filter((l) => l.startsWith("| **" + id + "** |"));
  if (rows.length === 0) return { found: false, why: id + " is not a row in the decision register" };
  if (rows.length > 1) return { found: false, why: id + " appears " + rows.length + " times; the register must carry exactly one row" };
  return { found: true, row: rows[0], why: null };
}

/**
 * THE NARROW AUTHORISATION GATE. The contract must carry ONE entry for THIS call id, and every pin
 * in it must equal what this adapter is about to send. A boolean somewhere saying "yes" is not an
 * authorisation, and a mismatch between contract and adapter is a refusal rather than a warning.
 */
export function verifyAuthorisation(contract) {
  const problems = [];
  if (contract === null || typeof contract !== "object") return { ok: false, problems: ["the contract is not an object"], call: null };
  if (contract.meta && contract.meta.authorisesImageRequest === true) {
    problems.push("meta.authorisesImageRequest is true — authorisation must never be a general boolean");
  }
  const ac = contract.authorisedCalls;
  if (!ac || !Array.isArray(ac.calls)) return { ok: false, problems: ["the contract carries no authorisedCalls list"], call: null };
  const matches = ac.calls.filter((c) => c && c.callId === CALL_ID);
  if (matches.length !== 1) {
    return { ok: false, problems: [`the contract authorises ${matches.length} calls with id ${CALL_ID}; exactly 1 is required`], call: null };
  }
  const c = matches[0];
  const eq = (path, got, want) => { if (got !== want) problems.push(`${path}: ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`); };
  eq("endpoint", c.endpoint, ENDPOINT);
  eq("model", c.model, MODEL);
  eq("parameters.n", c.parameters && c.parameters.n, N);
  eq("parameters.size", c.parameters && c.parameters.size, SIZE);
  eq("parameters.quality", c.parameters && c.parameters.quality, QUALITY);
  eq("parameters.output_format", c.parameters && c.parameters.output_format, OUTPUT_FORMAT);
  eq("parameters.background", c.parameters && c.parameters.background, BACKGROUND);
  eq("outputs.count", c.outputs && c.outputs.count, 1);
  eq("prompt.fileSha256", c.prompt && c.prompt.fileSha256, PROMPT_FILE.sha256);
  eq("prompt.transmittedSha256", c.prompt && c.prompt.transmittedSha256, PROMPT_BODY.sha256);
  eq("prompt.transmittedBytes", c.prompt && c.prompt.transmittedBytes, PROMPT_BODY.bytes);
  eq("prompt.trailingNewlines", c.prompt && c.prompt.trailingNewlines, PROMPT_TRAILING_NEWLINES);
  eq("mask.sha256", c.mask && c.mask.sha256, API_MASK.sha256);
  eq("mask.bytes", c.mask && c.mask.bytes, API_MASK.bytes);
  eq("claim.filename", c.claim && c.claim.filename, CLAIM_FILENAME);
  if (!Array.isArray(c.inputs) || c.inputs.length !== INPUTS.length) {
    problems.push(`inputs: ${c.inputs ? c.inputs.length : 0} entries, expected ${INPUTS.length}`);
  } else {
    for (let i = 0; i < INPUTS.length; i++) {
      eq(`inputs[${i}].role`, c.inputs[i].role, INPUTS[i].role);
      eq(`inputs[${i}].sha256`, c.inputs[i].sha256, INPUTS[i].sha256);
      eq(`inputs[${i}].maskAppliesToThis`, c.inputs[i].maskAppliesToThis, INPUTS[i].maskApplies);
    }
  }
  const order = Array.isArray(c.inputOrder) ? c.inputOrder.join("|") : "";
  const want = INPUTS.map((i) => i.role).join("|");
  if (order !== want) problems.push(`inputOrder: ${JSON.stringify(order)}, expected ${JSON.stringify(want)}`);
  return { ok: problems.length === 0, problems, call: c };
}

// ── the fail-closed claim ────────────────────────────────────────────────────────────────────
/** EXISTENCE ALONE MEANS SPENT — an empty, truncated or unparseable file counts. */
export function claimState(claimPath) {
  if (typeof claimPath !== "string" || claimPath === "") return { claimed: false, path: claimPath, detail: null };
  if (!existsSync(claimPath)) return { claimed: false, path: claimPath, detail: null };
  let bytes = null;
  try { bytes = statSync(claimPath).size; } catch (_) { bytes = null; }
  let detail = null;
  try {
    const txt = readFileSync(claimPath, "utf8");
    if (txt.trim() === "") detail = { empty: true, mandate: "SPENT" };
    else {
      const parsed = JSON.parse(txt);
      detail = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { unexpectedShape: true };
      if (!detail.mandate) detail.mandate = "SPENT";
    }
  } catch (_) { detail = { unreadable: true, mandate: "SPENT" }; }
  return { claimed: true, path: claimPath, bytes, detail };
}

/** Creates the claim, or throws. The file EXISTS before any content is written, so a crash straight
 *  afterwards still blocks every later attempt. The record must never contain a secret. */
export function createClaim(record, claimPath) {
  if (typeof claimPath !== "string" || claimPath === "") throw new Error("createClaim requires an explicit claim path");
  mkdirSync(dirname(claimPath), { recursive: true });
  const fd = openSync(claimPath, "wx");           // the mandate is SPENT from this line onwards
  const payload = {
    contract: "D-139",
    callId: CALL_ID,
    repository: REPO_IDENTITY,
    status: "SPENT_BEFORE_FETCH",
    mandate: "SPENT",
    semantics: "fail-closed, D-122 §8: the file's existence alone means spent. It is never deleted, "
      + "renamed, reset, overwritten or restored automatically, and this tool never retries. It "
      + "counts as spent on a crash, a timeout, a transport error, an HTTP error, a moderation "
      + "refusal, an unknown server state, a parse failure or an invalid or missing output exactly "
      + "as much as on success. A further attempt requires a NEW, EXPLICIT OWNER DECISION.",
    claimedAt: new Date().toISOString(),
    pid: process.pid,
    ...record,
  };
  let contentWritten = true;
  let contentError = null;
  try {
    writeSync(fd, JSON.stringify(payload, null, 2), 0, "utf8");
    fsyncSync(fd);
  } catch (e) {
    contentWritten = false;
    contentError = e && e.message ? e.message : String(e);
  } finally {
    try { closeSync(fd); } catch (_) { /* the file exists either way; that is what matters */ }
  }
  return { ...payload, contentWritten, contentError };
}

/** Write via a .partial file and rename, so a crash can never leave a half file that looks whole. */
export function writeAtomic(target, data) {
  const partial = target + ".partial";
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(partial, data);
  renameSync(partial, target);
  return target;
}

/** This adapter's own SHA-256, recorded in the claim so a spent mandate names the code that spent it. */
export function adapterSelfSha() {
  try { return sha(readFileSync(fileURLToPath(import.meta.url))); } catch (_) { return null; }
}

/**
 * Wraps a fetch so a SECOND call is impossible rather than merely absent. The single call site below
 * is the contract; this makes a future edit that adds a retry fail loudly instead of silently
 * spending a second request against a claim that only covers one.
 */
export function oneShotFetch(fetchImpl) {
  let used = 0;
  const wrapped = (...args) => {
    used += 1;
    if (used > 1) throw new Error("a second fetch was attempted; D-139 authorises exactly one request");
    return fetchImpl(...args);
  };
  wrapped.callCount = () => used;
  return wrapped;
}

// ── preflight ────────────────────────────────────────────────────────────────────────────────
/** Everything is injectable so the guards can be exercised without touching the real fixtures,
 *  the real register, the real contract or the real user profile. */
export function preflight(opts) {
  const o = opts || {};
  const fixturesDir = o.fixturesDir || FIXTURES;
  const repoRoot = o.repoRoot || REPO;
  const registerPath = o.registerPath || REGISTER;
  const contractPath = o.contractPath || CONTRACT_PATH;
  const editFixture = o.editFixturePath || EDIT_FIXTURE;
  const paths = outputPaths(o.outDir);
  const apiKey = Object.prototype.hasOwnProperty.call(o, "apiKey") ? o.apiKey : process.env.OPENAI_API_KEY;

  const problems = [];
  const files = [];

  // the TWO API image inputs, resolved IN ORDER
  const h1 = resolveH1Path({ h1Path: o.h1Path, argv: o.argv || process.argv.slice(2), env: o.env || process.env });
  for (const inp of INPUTS) {
    let abs = null;
    if (inp.external) {
      if (!h1.ok) { problems.push(inp.role + ": " + h1.why); continue; }
      abs = h1.path;
    } else {
      abs = join(repoRoot, ...inp.repoPath);
    }
    if (!existsSync(abs)) { problems.push(inp.role + ": missing input at " + abs); continue; }
    const buf = readFileSync(abs);
    const got = sha(buf);
    if (buf.length !== inp.bytes) problems.push(inp.role + ": " + buf.length + " B, expected " + inp.bytes);
    if (got !== inp.sha256) problems.push(inp.role + ": sha " + got + ", expected " + inp.sha256);
    const png = validatePngHeader(buf, inp.role);
    for (const p of png.problems) problems.push(p);
    files.push({ ...inp, abs, actualBytes: buf.length, actualSha256: got, header: png.header,
      ok: buf.length === inp.bytes && got === inp.sha256 && png.ok, buf });
  }
  if (files.length !== INPUTS.length) {
    problems.push("expected exactly " + INPUTS.length + " API image inputs, resolved " + files.length);
  } else {
    for (let i = 0; i < INPUTS.length; i++) {
      if (files[i].role !== INPUTS[i].role) problems.push("input order is wrong at position " + i + ": " + files[i].role);
    }
  }

  // the API mask: pinned hash AND re-derived direction
  let mask = null;
  const maskAbs = join(fixturesDir, API_MASK.name);
  if (!existsSync(maskAbs)) {
    problems.push("API mask: missing tracked fixture " + API_MASK.name);
  } else {
    const buf = readFileSync(maskAbs);
    const got = sha(buf);
    if (buf.length !== API_MASK.bytes) problems.push("API mask: " + buf.length + " B, expected " + API_MASK.bytes);
    if (got !== API_MASK.sha256) problems.push("API mask: sha " + got + ", expected " + API_MASK.sha256);
    const png = validatePngHeader(buf, "API mask");
    for (const p of png.problems) problems.push(p);
    let semantics = { ok: false, problems: ["the D-133 EDIT fixture was not found at " + editFixture], counts: null };
    if (existsSync(editFixture)) {
      const editBuf = readFileSync(editFixture);
      const editSha = sha(editBuf);
      if (editSha !== API_MASK.derivedFrom.sha256) {
        problems.push("D-133 EDIT fixture: sha " + editSha + ", expected " + API_MASK.derivedFrom.sha256);
      }
      semantics = verifyMaskSemantics(buf, editBuf);
    }
    for (const p of semantics.problems) problems.push(p);
    mask = { ...API_MASK, abs: maskAbs, actualBytes: buf.length, actualSha256: got, header: png.header,
      semantics, sentToApi: true, ok: buf.length === API_MASK.bytes && got === API_MASK.sha256 && png.ok && semantics.ok, buf };
  }
  // the first image is the one the mask applies to — asserted, not assumed
  if (files.length === INPUTS.length && files[0].maskApplies !== true) {
    problems.push("the mask must apply to the FIRST image, and the first resolved image is not marked as its target");
  }

  let prompt = null;
  let promptMeta = null;
  const promptAbs = join(fixturesDir, PROMPT_FILE.name);
  if (!existsSync(promptAbs)) {
    problems.push("prompt: missing tracked fixture " + PROMPT_FILE.name);
  } else {
    const raw = readFileSync(promptAbs);
    const fileSha = sha(raw);
    if (raw.length !== PROMPT_FILE.bytes) problems.push("prompt file: " + raw.length + " B, expected " + PROMPT_FILE.bytes);
    if (fileSha !== PROMPT_FILE.sha256) problems.push("prompt file: sha " + fileSha + ", expected " + PROMPT_FILE.sha256);
    const ex = extractPrompt(raw.toString("utf8"));
    if (!ex.ok) problems.push("prompt extraction: " + ex.why);
    else {
      const bodyBuf = Buffer.from(ex.prompt, "utf8");
      const bodySha = sha(bodyBuf);
      if (bodyBuf.length !== PROMPT_BODY.bytes) problems.push("sent text: " + bodyBuf.length + " B, expected " + PROMPT_BODY.bytes);
      if (bodySha !== PROMPT_BODY.sha256) problems.push("sent text: sha " + bodySha + ", expected " + PROMPT_BODY.sha256);
      if (bodyBuf.length === PROMPT_BODY.bytes && bodySha === PROMPT_BODY.sha256) prompt = ex.prompt;
      promptMeta = { file: PROMPT_FILE.name, fileBytes: raw.length, fileSha256: fileSha, fenceLines: ex.fenceLines,
        promptBytes: bodyBuf.length, promptSha256: bodySha, trailingNewlines: PROMPT_TRAILING_NEWLINES };
    }
  }

  const decisions = {};
  for (const id of REQUIRED_DECISIONS) {
    const d = decisionExists(id, registerPath);
    decisions[id] = { found: d.found, why: d.why };
    if (!d.found) problems.push("NOT AUTHORISED: " + d.why);
  }

  // the narrow authorisation itself
  let authorisation = { ok: false, problems: ["the contract was not found at " + contractPath], call: null };
  if (existsSync(contractPath)) {
    let parsed = null;
    try { parsed = JSON.parse(readFileSync(contractPath, "utf8")); } catch (e) { parsed = null; }
    authorisation = parsed === null
      ? { ok: false, problems: ["the contract is not valid JSON"], call: null }
      : verifyAuthorisation(parsed);
  }
  for (const p of authorisation.problems) problems.push("NOT AUTHORISED: " + p);

  // The claim location is resolved and validated here — READ ONLY. No directory, no file.
  const resolved = Object.prototype.hasOwnProperty.call(o, "claimPath")
    ? { ok: typeof o.claimPath === "string" && o.claimPath !== "", path: o.claimPath,
        scope: "injected-by-caller", why: "no claim path was provided" }
    : resolveClaimPath({ repoRoot: REPO });
  if (!resolved.ok) problems.push("CLAIM LOCATION UNAVAILABLE: " + resolved.why);
  const claim = resolved.ok ? claimState(resolved.path) : { claimed: false, path: resolved.path, detail: null };
  if (claim.claimed) {
    problems.push("MANDATE ALREADY SPENT: " + resolved.path + " exists — a further attempt requires a new, explicit owner decision");
  }
  for (const p of [paths.raw, paths.manifest]) {
    if (existsSync(p)) problems.push("output already exists, refusing to overwrite: " + p);
  }

  const keyPresent = typeof apiKey === "string" && apiKey.length > 0;   // existence only
  if (!keyPresent) problems.push("the API key is not set");

  return { ok: problems.length === 0, problems, files, mask, prompt, promptMeta, decisions,
    authorisation, h1, claimLocation: resolved, claim, keyPresent, paths, fixturesDir };
}

/** The exact request configuration, serialised deterministically. Contains no secret. */
export function requestConfig(pf) {
  const files = pf && Array.isArray(pf.files) ? pf.files : [];
  const mask = pf && pf.mask ? pf.mask : null;
  return {
    tool: TOOL, contract: "D-139", callId: CALL_ID,
    kind: "head-only, mask-guided edit of H1 into the R3 technical underlay — NOT a new character, NOT a runtime asset",
    endpoint: ENDPOINT, endpointType: "images.edits (two ordered image inputs, one mask)",
    model: MODEL,
    parameters: { n: N, quality: QUALITY, size: SIZE, output_format: OUTPUT_FORMAT, background: BACKGROUND },
    omitted: { input_fidelity: "never sent — gpt-image-2 treats inputs at high fidelity automatically and rejects the field" },
    policy: { retry: RETRY, fallbackModel: FALLBACK_MODEL, automaticPromptModification: AUTO_PROMPT_EDIT, requests: 1,
      failClosed: "D-122 §8 — the claim is created before the call, OUTSIDE the repository, and never cleared automatically" },
    expectedOutput: { format: OUTPUT_FORMAT, dimensions: SIZE, background: BACKGROUND,
      bitDepth: EXPECT_BIT_DEPTH, colourType: EXPECT_COLOUR_TYPE, images: 1 },
    inputOrder: INPUTS.map((i) => i.role),
    inputOrderReason: "H1 is first because the edit endpoint applies the mask to the first image",
    inputs: files.map((f) => ({ role: f.role, file: f.external ? f.name + " (EXTERNAL, not tracked)" : f.repoPath.join("/"),
      decision: f.decision, purpose: f.purpose, maskApplies: f.maskApplies,
      bytes: f.actualBytes, sha256: f.actualSha256,
      png: f.header ? { width: f.header.width, height: f.header.height, bitDepth: f.header.bitDepth, colourType: f.header.colourType } : null })),
    mask: mask ? { file: mask.name, bytes: mask.actualBytes, sha256: mask.actualSha256, sentToApi: true,
      semantics: mask.semantics_ || API_MASK.semantics, derivedFrom: API_MASK.derivedFrom,
      counts: mask.semantics && mask.semantics.counts ? mask.semantics.counts : null,
      guidanceOnly: "MODEL GUIDANCE. The byte-identity guarantee outside the head is D-133's deterministic recomposition, not this mask." } : null,
    neverSent: { d133MarkerFixtures: NEVER_SENT_MASKS,
      why: "their alpha means the OPPOSITE of what the endpoint reads" },
    prompt: (pf && pf.promptMeta) || null,
  };
}

/**
 * Assembles the multipart body and runs the hard guards. Exported so the guards can be exercised by
 * a test WITHOUT spending the one authorised request.
 */
export function buildBody(pf) {
  if (!pf || !pf.ok) throw new Error("buildBody called on a failed preflight");
  if (!pf.prompt) throw new Error("buildBody called without a prompt");
  if (!Array.isArray(pf.files)) throw new Error("buildBody called without input files");
  if (!pf.mask || !pf.mask.buf) throw new Error("buildBody called without the API mask");

  const fd = new FormData();
  fd.append("model", MODEL);
  for (const f of pf.files) fd.append(IMAGE_FIELD, new File([f.buf], f.name, { type: "image/png" }));
  fd.append(MASK_FIELD, new File([pf.mask.buf], pf.mask.name, { type: "image/png" }));
  fd.append("prompt", pf.prompt);
  fd.append("n", String(N));
  fd.append("size", SIZE);
  fd.append("quality", QUALITY);
  fd.append("output_format", OUTPUT_FORMAT);
  fd.append("background", BACKGROUND);

  for (const bad of FORBIDDEN_FIELDS) {
    if (fd.has(bad)) throw new Error("forbidden field present in body: " + bad);
  }
  const images = fd.getAll(IMAGE_FIELD);
  if (images.length !== INPUTS.length) throw new Error("expected exactly " + INPUTS.length + " images in the body, found " + images.length);
  for (let i = 0; i < INPUTS.length; i++) {
    if (images[i].name !== INPUTS[i].name) {
      throw new Error("image " + (i + 1) + " is not the pinned input: " + images[i].name + " != " + INPUTS[i].name);
    }
  }
  if (images[0].name !== INPUTS[0].name) throw new Error("H1 must be the FIRST image — the mask applies to image 1");
  const masks = fd.getAll(MASK_FIELD);
  if (masks.length !== 1) throw new Error("expected exactly 1 mask in the body, found " + masks.length);
  if (masks[0].name !== API_MASK.name) throw new Error("the mask is not the pinned API mask: " + masks[0].name);
  for (const forbidden of NEVER_SENT_MASKS) {
    for (const img of images) if (img.name === forbidden) throw new Error("a D-133 marker fixture reached the image list: " + forbidden);
    if (masks[0].name === forbidden) throw new Error("a D-133 marker fixture was sent as the API mask: " + forbidden);
  }
  if (fd.get("model") !== MODEL) throw new Error("model is not the pinned snapshot");
  if (fd.get("n") !== "1") throw new Error("n must be 1");
  if (fd.get("size") !== SIZE) throw new Error("size is not the pinned size");
  if (fd.get("quality") !== QUALITY) throw new Error("quality is not the pinned value");
  if (fd.get("output_format") !== OUTPUT_FORMAT) throw new Error("output_format is not the pinned value");
  if (fd.get("background") !== BACKGROUND) throw new Error("background is not the pinned value");
  if (fd.get("prompt") !== pf.prompt) throw new Error("the prompt in the body is not the verified prompt");
  return fd;
}

/** The response shape the Images API contract promises, checked strictly before anything is kept. */
export function validateResponsePayload(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, why: "the response is not a JSON object" };
  }
  if (!Object.prototype.hasOwnProperty.call(payload, "data")) return { ok: false, why: "the response has no data field" };
  if (!Array.isArray(payload.data)) return { ok: false, why: "data is not an array" };
  if (payload.data.length !== 1) return { ok: false, why: "expected exactly 1 image, got " + payload.data.length };
  const first = payload.data[0];
  if (first === null || typeof first !== "object" || Array.isArray(first)) return { ok: false, why: "data[0] is not an object" };
  if (typeof first.b64_json !== "string") return { ok: false, why: "data[0].b64_json is not a string" };
  return { ok: true, b64: first.b64_json };
}

/**
 * THE SINGLE REQUEST. fetchImpl is injected so the whole path can be tested offline; the CLI passes
 * the real global fetch. claimPath is injected ONLY by tests — the CLI never passes one and there is
 * no flag that could. Exactly one call site, no loop, no catch that resends, and a one-shot wrapper
 * so a second attempt throws instead of spending an unauthorised request.
 *
 *   1 verify everything · 2 assemble the body · 3 resolve and validate the global claim path
 *   4 create only the claim's parent directory · 5 exclusive "wx" create · 6 write, flush, close
 *   7 exactly one fetch
 */
export async function performSingleRequest(opts) {
  const o = opts || {};
  const pf = o.pf;
  const paths = outputPaths(o.outDir);
  const apiKey = o.apiKey;
  const fail = (stage, reason, extra) => ({ ok: false, stage, reason, claimCreated: false, fetchCalled: false, ...(extra || {}) });

  if (!pf || !pf.ok) return fail("preflight", "preflight did not pass");
  if (typeof o.fetchImpl !== "function") return fail("preflight", "no fetch implementation was provided");
  if (typeof apiKey !== "string" || apiKey.length === 0) return fail("key", "the API key is not set");
  if (!pf.authorisation || !pf.authorisation.ok) return fail("authorisation", "the contract does not authorise " + CALL_ID);
  for (const p of [paths.raw, paths.manifest]) {
    if (existsSync(p)) return fail("output-exists", "output already exists, refusing to overwrite: " + p);
  }

  let fd;
  try { fd = buildBody(pf); } catch (e) { return fail("body", e && e.message ? e.message : String(e)); }

  const resolved = Object.prototype.hasOwnProperty.call(o, "claimPath")
    ? { ok: typeof o.claimPath === "string" && o.claimPath !== "", path: o.claimPath,
        scope: "injected-by-caller", why: "no claim path was provided" }
    : resolveClaimPath({ repoRoot: REPO });
  if (!resolved.ok) return fail("claim-location", resolved.why);
  const claimPath = resolved.path;
  if (existsSync(claimPath)) return fail("claim-exists", "the mandate is already spent: " + claimPath);

  const cfg = requestConfig(pf);
  const startedAt = new Date().toISOString();
  const doFetch = oneShotFetch(o.fetchImpl);

  let claim;
  try {
    claim = createClaim({
      endpoint: ENDPOINT, model: MODEL, parameters: cfg.parameters,
      adapterSha256: adapterSelfSha(),
      promptSha256: cfg.prompt ? cfg.prompt.promptSha256 : null,
      inputOrder: cfg.inputOrder,
      inputs: cfg.inputs.map((i) => ({ role: i.role, file: i.file, bytes: i.bytes, sha256: i.sha256 })),
      mask: cfg.mask ? { file: cfg.mask.file, sha256: cfg.mask.sha256, sentToApi: true } : null,
      startedAt,
    }, claimPath);
  } catch (e) {
    return fail("claim", "could not create the exclusive claim at " + claimPath + ": " + (e && e.message ? e.message : String(e)));
  }

  const manifest = {
    tool: TOOL, contract: "D-139", callId: CALL_ID, kind: cfg.kind, startedAt,
    claim: { file: claimPath, scope: resolved.scope, claimedAt: claim.claimedAt,
      status: "SPENT_BEFORE_FETCH", mandate: "SPENT",
      contentWritten: claim.contentWritten, contentError: claim.contentError,
      note: "created OUTSIDE the repository, before the call; never cleared automatically; no retry" },
    request: cfg, response: null, result: null, verification: null,
  };
  const finish = (stage, reason) => {
    manifest.finishedAt = new Date().toISOString();
    manifest.outcome = { stage, reason, mandate: "SPENT", retried: false, fetches: doFetch.callCount() };
    writeAtomic(paths.manifest, JSON.stringify(manifest, null, 2));
    return { ok: stage === "done", stage, reason, claimCreated: true, fetchCalled: true,
      fetches: doFetch.callCount(), claimPath, manifestPath: paths.manifest,
      rawPath: stage === "done" ? paths.raw : null, verification: manifest.verification };
  };

  // EXACTLY ONE fetch. There is no loop, and no catch that retries.
  let res;
  try {
    res = await doFetch(ENDPOINT, { method: "POST", headers: { Authorization: "Bearer " + apiKey }, body: fd });
  } catch (e) {
    manifest.response = { transportError: e && e.message ? e.message : String(e),
      serverState: "UNKNOWN — the request may have been received and billed" };
    return finish("transport", "transport error; the server state is UNKNOWN");
  }

  if (!res || typeof res.status !== "number" || typeof res.text !== "function") {
    manifest.response = { malformed: true, serverState: "UNKNOWN — the response object was not usable" };
    return finish("transport", "the fetch implementation returned no usable response");
  }

  let text;
  try { text = await res.text(); } catch (e) {
    manifest.response = { httpStatus: res.status, bodyReadError: e && e.message ? e.message : String(e),
      serverState: "UNKNOWN — the body could not be read" };
    return finish("transport", "the response body could not be read");
  }

  const headerOf = (k) => (res.headers && typeof res.headers.get === "function" ? res.headers.get(k) : null);
  manifest.response = { httpStatus: res.status, ok: res.status >= 200 && res.status < 300,
    requestId: headerOf("x-request-id"), contentType: headerOf("content-type"),
    openaiProcessingMs: headerOf("openai-processing-ms"), openaiVersion: headerOf("openai-version"),
    bodySha256: sha(Buffer.from(text, "utf8")), bodyBytes: Buffer.byteLength(text, "utf8") };

  if (!manifest.response.ok) {
    let detail = null;
    try { const j = JSON.parse(text); detail = j && j.error ? j.error : null; } catch (_) { detail = null; }
    manifest.response.error = detail ? { type: detail.type, code: detail.code, message: detail.message } : null;
    return finish("http", "HTTP " + res.status + "; no retry, no fallback");
  }

  let payload;
  try { payload = JSON.parse(text); } catch (_) { payload = undefined; }
  if (payload === undefined) return finish("parse", "the response was not JSON");

  const shape = validateResponsePayload(payload);
  if (!shape.ok) return finish("payload", shape.why);

  const decoded = decodeStrictBase64(shape.b64);
  if (!decoded.ok) return finish("payload", "the image is not valid base64: " + decoded.why);

  const png = validatePngHeader(decoded.buf, "result");
  manifest.verification = { bytes: decoded.buf.length, sha256: sha(decoded.buf),
    png: png.header, problems: png.problems, valid: png.ok };
  if (!png.ok) return finish("decode", "the returned image failed validation: " + png.problems.join("; "));

  writeAtomic(paths.raw, decoded.buf);
  manifest.result = { file: paths.raw, bytes: decoded.buf.length, sha256: sha(decoded.buf) };
  if (payload.usage) manifest.response.usage = payload.usage;
  return finish("done", "one image received and verified");
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────
// There is deliberately no flag that can change the claim path, force a run or reset a claim.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const argv = process.argv.slice(2);
  const send = argv.includes("--send");
  const approved = argv.includes(OWNER_APPROVAL_FLAG);
  const showPrompt = argv.includes("--print-prompt");
  const SENDCMD = "node tools/avatar/openai-generate-r3-underlay.mjs --h1 <path> --send " + OWNER_APPROVAL_FLAG;

  console.log("D-139 R3 technical-underlay adapter — " + ENDPOINT);
  console.log("  call id        : " + CALL_ID);
  console.log("  model          : " + MODEL + "   (dated snapshot; a newer model needs a NEW owner decision)");
  console.log("  parameters     : n=" + N + " quality=" + QUALITY + " size=" + SIZE +
    " output_format=" + OUTPUT_FORMAT + " background=" + BACKGROUND);
  console.log("  never sent     : " + FORBIDDEN_FIELDS.join(", ") + "   D-133 marker fixtures: never");
  console.log("  retry/fallback : none        automatic prompt modification: " + AUTO_PROMPT_EDIT);
  console.log("  separate tool  : the D-121 and D-129 adapters are neither imported nor modified\n");

  const pf = preflight({ argv });

  console.log("  the TWO API image inputs, IN ORDER (the mask applies to image 1):");
  for (const inp of INPUTS) {
    const f = pf.files.find((x) => x.role === inp.role);
    const mark = f ? (f.ok ? "OK " : "BAD") : "MISSING";
    const size = f ? String(f.actualBytes).padStart(9) + " B" : "".padStart(11);
    const hash = f ? f.actualSha256.slice(0, 16) + "…" : "";
    const png = f && f.header ? f.header.width + "x" + f.header.height + " depth " + f.header.bitDepth + " colourtype " + f.header.colourType : "";
    console.log("    " + inp.role + "  " + mark + "  " + size + "  " + hash + "  " + png);
    console.log("            " + (inp.external ? inp.name + "   [" + inp.decision + ", EXTERNAL — " + (pf.h1.ok ? "from " + pf.h1.source : "NOT SUPPLIED") + "]"
      : inp.repoPath.join("/") + "   [" + inp.decision + ", tracked]"));
    console.log("            " + inp.purpose);
  }

  console.log("\n  the API mask — SENT, as model guidance only:");
  if (pf.mask) {
    console.log("    " + (pf.mask.ok ? "OK " : "BAD") + "  " + String(pf.mask.actualBytes).padStart(7) + " B  " +
      pf.mask.actualSha256.slice(0, 16) + "…  " + pf.mask.name);
    console.log("           " + API_MASK.semantics);
    const c = pf.mask.semantics && pf.mask.semantics.counts;
    if (c) console.log("           editable " + c.editable + "  protected " + c.protected + "  (re-derived from the D-133 EDIT fixture)");
    console.log("           NOT the 0-changed-pixels gate — that is D-133's deterministic recomposition");
  } else {
    console.log("    MISSING  " + API_MASK.name);
  }

  if (pf.promptMeta) {
    console.log("\n  prompt file    : " + pf.promptMeta.fileBytes + " B  " + pf.promptMeta.fileSha256 + "   [D-139, tracked]");
    console.log("  sent text      : " + pf.promptMeta.promptBytes + " B  " + pf.promptMeta.promptSha256 +
      "   (lines " + pf.promptMeta.fenceLines.join("–") + ", LF, one trailing newline)");
  }
  console.log("  API key        : " + (pf.keyPresent ? "present" : "MISSING"));
  for (const id of REQUIRED_DECISIONS) {
    console.log("  " + id + "          : " + (pf.decisions[id].found ? "one row in the register" : "MISSING — " + pf.decisions[id].why));
  }
  console.log("  authorisation  : " + (pf.authorisation.ok
    ? "the contract authorises " + CALL_ID + ", and every pin matches"
    : "REFUSED — " + pf.authorisation.problems.join("; ")));

  const cp = pf.claimLocation.path;
  console.log("\n  claim scope    : " + pf.claimLocation.scope + "  — per USER and repository identity, NOT per clone");
  console.log("  claim path     : " + (cp || "UNRESOLVED — " + pf.claimLocation.why));
  if (cp) {
    console.log("  outside repo   : " + String(!isInside(cp, REPO)) + "        outside temp: " + String(!isInside(cp, tmpdir())));
    console.log("                   D-139 has its OWN claim; D-121's and D-129's are never touched here");
  }
  console.log("  mandate        : " + (pf.claim.claimed ? "SPENT — the claim file exists" : "UNSPENT — no claim file exists"));

  if (showPrompt && pf.prompt) {
    console.log("\n  --- prompt as it would be sent ---");
    console.log(pf.prompt.replace(/\n$/, "").split("\n").map((l) => "  | " + l).join("\n"));
  }

  if (!pf.ok) {
    console.error("\n  PREFLIGHT FAILED — stopping before payment:");
    for (const p of pf.problems) console.error("    · " + p);
    process.exit(1);
  }
  console.log("\n  preflight: ALL CHECKS PASSED");
  console.log("  the prompt, the API mask and Image 2 are TRACKED; H1 stays external by D-127 §2.");

  if (!send || !approved) {
    console.log("\n  DRY RUN. NOTHING WAS SENT. No directory, no claim, no output and no manifest were written.");
    console.log("  Sending requires an explicit owner instruction AND both flags:");
    console.log("    " + SENDCMD);
    process.exit(0);
  }

  const result = await performSingleRequest({ pf, fetchImpl: fetch, apiKey: process.env.OPENAI_API_KEY, outDir: OUT });
  if (result.claimCreated) {
    console.log("\n  claim created  : " + result.claimPath);
    console.log("  THE MANDATE IS NOW SPENT — on any outcome, including a crash, a timeout or a refusal.");
  }
  if (result.ok) {
    console.log("\n  raw result     : " + result.rawPath);
    console.log("  Manifest       : " + result.manifestPath);
    console.log("\n  STOPPED. The result is review material, not an asset.");
    console.log("  No warping, no repair, no cleanup, no promotion, no commit, no production effect.");
    console.log("  Next step is D-133's deterministic recomposition, then the owner visual review.");
    process.exit(0);
  }
  console.error("\n  FAILED at stage '" + result.stage + "': " + result.reason);
  if (result.manifestPath) console.error("  Manifest: " + result.manifestPath);
  console.error("  NO RETRY. The mandate stays spent.");
  process.exit(1);
}
