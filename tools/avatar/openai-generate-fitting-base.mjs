// D-129 FITTING-BASE ADAPTER — the send path for the ONE future fitting-base image call.
//
// SEPARATE FROM D-121 BY DESIGN. `openai-refine-northstar-d.mjs` is pinned to D-121: its inputs, its
// prompt and its claim filename all name that decision, and D-127 §1 forbids modifying it. This file
// is a new tool with its own pins and its own claim; the D-121 adapter is neither imported nor
// touched, so a change here can never weaken a mandate that is already spent.
//
// EXACTLY ONE API IMAGE INPUT — D-129. The sole image sent is the tracked, owner-adopted North Star
// v2 reference. No masks and no secondary reference images are sent. The head and arm/hand protect
// masks are validated here for existence and pinned hash, because the deterministic recomposition
// that runs AFTER the response consumes them and a missing or altered mask would corrupt the
// acceptance step — but they are never added to the multipart body (D-127 §1, §3; D-128 §8).
//
// IT DOES NOT SEND ANYTHING BY DEFAULT. A bare run is a read-only dry run: it creates no directory,
// no claim, no output and no manifest. Sending requires ALL of:
//   --send  AND  --owner-approval=D-129  AND  a passing preflight  AND  one row each of
//   D-126, D-127, D-128 and D-129 actually present in docs/project-state.md.
// One flag alone never sends. A wrong confirmation value never sends.
//
// FAIL-CLOSED, ONCE — D-122 §8 semantics, unchanged:
//   The claim is created with an EXCLUSIVE create (flag "wx") IMMEDIATELY before the single fetch.
//   Once it exists the mandate is SPENT — on a crash, a timeout, a transport error, an HTTP error,
//   an unknown server state, a parse failure or an invalid output exactly as much as on success.
//   Nothing here deletes, resets or retries. A further attempt needs a NEW OWNER DECISION.
//   The claim resolves to a per-USER location derived from the REPOSITORY IDENTITY, never from the
//   local checkout, so both clones of this repository share one mandate and no Git operation can
//   reach it. There is deliberately NO --claim-path, NO --force and NO --reset-claim.
//
// D-129 PREPARES THIS CALL. IT DOES NOT AUTHORISE IT. Neither this file, nor its tests, nor the
// commit or PR that introduced them is owner approval to send.
//
// The API key is read from the environment only. It is never printed, logged, or written to the
// claim or the manifest.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, statSync,
  openSync, writeSync, fsyncSync, closeSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

/** Local-only fixtures: the prompt and the two protect masks. TRACKED; build/ is never read. */
export const FIXTURES = join(REPO, "tools", "avatar", "fixtures", "fitting-base");
export const REGISTER = join(REPO, "docs", "project-state.md");
/** Only OUTPUTS go to the gitignored build area. No request input and NO CLAIM live there. */
export const OUT = join(REPO, "tools", "avatar", "build", "fitting-base");

// ── the frozen request contract (D-127 §1, D-129) ────────────────────────────────────────────
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

/** Anything on this list must NEVER appear in the request body. */
export const FORBIDDEN_FIELDS = ["mask", "input_fidelity"];
/** The multipart field the Images edit endpoint takes its images in. */
export const IMAGE_FIELD = "image[]";

/** Every row that must be present before this tool will send. */
export const REQUIRED_DECISIONS = ["D-126", "D-127", "D-128", "D-129"];
export const OWNER_APPROVAL_FLAG = "--owner-approval=D-129";

const [EXPECT_W, EXPECT_H] = SIZE.split("x").map(Number);
export const EXPECT_BIT_DEPTH = 8;
export const EXPECT_COLOUR_TYPE = 6;   // truecolour + alpha (RGBA)
export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * THE ONLY API IMAGE INPUT. One entry, deliberately: D-129 fixes the input order as exactly this
 * file and nothing else. It is a tracked repository asset, not a fixture copy, so the request stays
 * reproducible on a fresh clone without duplicating a 761 KB file.
 */
export const INPUTS = [
  { role: "Image 1", name: "Northstar Master v2.png",
    repoPath: ["assets", "avatar", "reference", "Northstar Master v2.png"],
    decision: "D-124",
    bytes: 761394, sha256: "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50",
    purpose: "the adopted North Star v2 — identity, face, hair, pose, colour, line weight and canvas registration" },
];

/**
 * LOCAL-ONLY masks. Validated so the acceptance step cannot start from a wrong file, and asserted
 * NOT to be in the request body. They are never sent — D-127 §1 and §3, D-128 §8.
 */
export const LOCAL_ONLY_MASKS = [
  { name: "head-protect-mask-v1.png", bytes: 8368,
    sha256: "cc9c8b7a68dab60ab5c2914644d28676eefcb29e917a05f7bf4ce44093b737b3",
    purpose: "head protect zone, crown y20 to neck line y433 — composited back after the response" },
  { name: "arm-hand-protect-mask-v1.png", bytes: 8135,
    sha256: "2dda9904717381fde9bdd5556b79c83a00b4a3b9e5c6cb9bffeca3f13e6c2264",
    purpose: "the D-128 owner-approved arm/hand protect mask — composited back after the response" },
];

/** The prompt, tracked by D-129. BOTH hashes are pinned: the wrapper file, and the fenced block
 *  that is the text actually sent. */
export const PROMPT_FILE = { name: "fitting-base-prompt.md", bytes: 4564,
  sha256: "272b72c6b64f086357d0ae4adc6fd0245f45abaed1f5e6febeb348f6f913ad8e" };
export const PROMPT_BODY = { bytes: 2377,
  sha256: "82942367d7c7ba5babaa209b61a6b29ba3679e227d97f37274090d95e0cc2c4c" };
export const PROMPT_FIRST_LINE = "Edit the stylised avatar illustration in Image 1.";
export const PROMPT_MARKERS = ["Image 1", "KEEP EXACTLY AS THEY ARE IN IMAGE 1:",
  "CHANGE ONLY THE CLOTHING:", "THE GARMENTS MUST BE:", "DO NOT ADD:", "OUTPUT:"];

// ── the one-shot claim, per user and per REPOSITORY IDENTITY ─────────────────────────────────
export const REPO_IDENTITY = "Moeller888-den-seje-app-frontend";
export const CLAIM_APP_DIR = "DenSejeApp";
export const CLAIM_SUBDIR = "one-shot-claims";
/** D-129 gets its OWN claim. D-121's is spent and must never be touched by this tool. */
export const CLAIM_FILENAME = "D-129.claim.json";

/** True when `child` is the same path as, or lives inside, `parent`. */
export function isInside(child, parent) {
  if (typeof child !== "string" || typeof parent !== "string" || child === "" || parent === "") return false;
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Resolves the ONE claim file for this user and this repository identity. Same contract as the
 * D-121 adapter's resolver, with D-129's filename: Windows requires %LOCALAPPDATA%, and there is
 * deliberately no fallback to the repository, the build directory, the working directory or temp,
 * because each of those would either be wiped by ordinary cleanup or differ between the two clones.
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
  return { dir: d, raw: join(d, "fitting-base.raw.png"), manifest: join(d, "fitting-base.request.json") };
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
export function extractPrompt(md) {
  if (typeof md !== "string" || md.length === 0) return { ok: false, why: "prompt file is empty or not text" };
  const lines = md.split("\n");
  const fences = [];
  for (let i = 0; i < lines.length; i++) if (lines[i].trimEnd() === FENCE) fences.push(i);
  if (fences.length !== 2) return { ok: false, why: "expected exactly 2 code fences, found " + fences.length };
  const body = lines.slice(fences[0] + 1, fences[1]).join("\n").replace(/\s+$/, "");
  if (!body.startsWith(PROMPT_FIRST_LINE)) return { ok: false, why: "fenced block does not start with the expected first line" };
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
  return { found: true, why: null };
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
    contract: "D-129",
    repository: REPO_IDENTITY,
    status: "SPENT_BEFORE_FETCH",
    mandate: "SPENT",
    semantics: "fail-closed, D-122 §8: the file's existence alone means spent. It is never deleted, "
      + "renamed, reset, overwritten or restored automatically, and this tool never retries. It "
      + "counts as spent on a crash, a timeout, a transport error, an HTTP error, an unknown server "
      + "state, a parse failure or an invalid or missing output exactly as much as on success. "
      + "A further attempt requires a NEW, EXPLICIT OWNER DECISION.",
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

// ── preflight ────────────────────────────────────────────────────────────────────────────────
/** Everything is injectable so the guards can be exercised without touching the real fixtures,
 *  the real register or the real user profile. */
export function preflight(opts) {
  const o = opts || {};
  const fixturesDir = o.fixturesDir || FIXTURES;
  const repoRoot = o.repoRoot || REPO;
  const registerPath = o.registerPath || REGISTER;
  const paths = outputPaths(o.outDir);
  const apiKey = Object.prototype.hasOwnProperty.call(o, "apiKey") ? o.apiKey : process.env.OPENAI_API_KEY;

  const problems = [];
  const files = [];

  // the ONE API image input
  for (const inp of INPUTS) {
    const abs = join(repoRoot, ...inp.repoPath);
    if (!existsSync(abs)) { problems.push(inp.role + ": missing tracked input " + inp.repoPath.join("/")); continue; }
    const buf = readFileSync(abs);
    const got = sha(buf);
    if (buf.length !== inp.bytes) problems.push(inp.role + ": " + buf.length + " B, expected " + inp.bytes);
    if (got !== inp.sha256) problems.push(inp.role + ": sha " + got + ", expected " + inp.sha256);
    const png = validatePngHeader(buf, inp.role);
    for (const p of png.problems) problems.push(p);
    files.push({ ...inp, abs, actualBytes: buf.length, actualSha256: got, header: png.header,
      ok: buf.length === inp.bytes && got === inp.sha256 && png.ok, buf });
  }
  if (files.length !== 1) problems.push("expected exactly 1 API image input, resolved " + files.length);

  // the LOCAL-ONLY masks: verified, never sent
  const masks = [];
  for (const m of LOCAL_ONLY_MASKS) {
    const abs = join(fixturesDir, m.name);
    if (!existsSync(abs)) { problems.push("local mask: missing tracked fixture " + m.name); continue; }
    const buf = readFileSync(abs);
    const got = sha(buf);
    if (buf.length !== m.bytes) problems.push("local mask " + m.name + ": " + buf.length + " B, expected " + m.bytes);
    if (got !== m.sha256) problems.push("local mask " + m.name + ": sha " + got + ", expected " + m.sha256);
    masks.push({ ...m, abs, actualBytes: buf.length, actualSha256: got, sent: false,
      ok: buf.length === m.bytes && got === m.sha256 });
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
        promptBytes: bodyBuf.length, promptSha256: bodySha };
    }
  }

  const decisions = {};
  for (const id of REQUIRED_DECISIONS) {
    const d = decisionExists(id, registerPath);
    decisions[id] = d;
    if (!d.found) problems.push("NOT AUTHORISED: " + d.why);
  }

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

  return { ok: problems.length === 0, problems, files, masks, prompt, promptMeta, decisions,
    claimLocation: resolved, claim, keyPresent, paths, fixturesDir };
}

/** The exact request configuration, serialised deterministically. Contains no secret. */
export function requestConfig(pf) {
  const files = pf && Array.isArray(pf.files) ? pf.files : [];
  const masks = pf && Array.isArray(pf.masks) ? pf.masks : [];
  return {
    tool: "openai-generate-fitting-base", contract: "D-129",
    kind: "maskless edit of North Star v2 into the internal authoring fitting base — NOT a new character, NOT a runtime asset",
    endpoint: ENDPOINT, endpointType: "images.edits (single-image edit, NO mask)",
    model: MODEL,
    parameters: { n: N, quality: QUALITY, size: SIZE, output_format: OUTPUT_FORMAT, background: BACKGROUND },
    omitted: { mask: "never sent — D-127 §1", input_fidelity: "never sent — gpt-image-2 rejects it (invalid_input_fidelity_model)" },
    policy: { retry: RETRY, fallbackModel: FALLBACK_MODEL, automaticPromptModification: AUTO_PROMPT_EDIT, requests: 1,
      secondaryReferenceImages: 0,
      failClosed: "D-122 §8 — the claim is created before the call, OUTSIDE the repository, and never cleared automatically" },
    expectedOutput: { format: OUTPUT_FORMAT, dimensions: SIZE, background: BACKGROUND,
      bitDepth: EXPECT_BIT_DEPTH, colourType: EXPECT_COLOUR_TYPE },
    inputSource: "one tracked repository asset — assets/avatar/reference/Northstar Master v2.png",
    inputs: files.map((f) => ({ role: f.role, file: f.repoPath.join("/"), decision: f.decision, purpose: f.purpose,
      bytes: f.actualBytes, sha256: f.actualSha256,
      png: f.header ? { width: f.header.width, height: f.header.height, bitDepth: f.header.bitDepth, colourType: f.header.colourType } : null })),
    localOnlyMasks: masks.map((m) => ({ file: m.name, bytes: m.actualBytes, sha256: m.actualSha256,
      purpose: m.purpose, sentToApi: false })),
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

  const fd = new FormData();
  fd.append("model", MODEL);
  for (const f of pf.files) fd.append(IMAGE_FIELD, new File([f.buf], f.name, { type: "image/png" }));
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
  if (images.length !== 1) throw new Error("expected exactly 1 image in the body, found " + images.length);
  if (images[0].name !== INPUTS[0].name) {
    throw new Error("the single image is not the pinned input: " + images[0].name + " != " + INPUTS[0].name);
  }
  // the masks are local-only: assert none of them reached the body
  for (const m of LOCAL_ONLY_MASKS) {
    for (const img of images) if (img.name === m.name) throw new Error("a protect mask reached the request body: " + m.name);
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
 * no flag that could. Exactly one call site, no loop, no catch that resends.
 *
 *   1 verify everything · 2 assemble the body · 3 resolve and validate the global claim path
 *   4 create only the claim's parent directory · 5 exclusive "wx" create · 6 write, flush, close
 *   7 exactly one fetch
 */
export async function performSingleRequest(opts) {
  const o = opts || {};
  const pf = o.pf;
  const fetchImpl = o.fetchImpl;
  const apiKey = o.apiKey;
  const paths = outputPaths(o.outDir);
  const fail = (stage, reason, extra) => ({ ok: false, stage, reason, claimCreated: false, fetchCalled: false, ...(extra || {}) });

  if (!pf || !pf.ok) return fail("preflight", "preflight did not pass");
  if (typeof fetchImpl !== "function") return fail("preflight", "no fetch implementation was provided");
  if (typeof apiKey !== "string" || apiKey.length === 0) return fail("key", "the API key is not set");
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

  let claim;
  try {
    claim = createClaim({
      endpoint: ENDPOINT, model: MODEL, parameters: cfg.parameters,
      adapterSha256: adapterSelfSha(),
      promptSha256: cfg.prompt ? cfg.prompt.promptSha256 : null,
      inputs: cfg.inputs.map((i) => ({ role: i.role, file: i.file, bytes: i.bytes, sha256: i.sha256 })),
      localOnlyMasks: cfg.localOnlyMasks.map((m) => ({ file: m.file, sha256: m.sha256, sentToApi: false })),
      startedAt,
    }, claimPath);
  } catch (e) {
    return fail("claim", "could not create the exclusive claim at " + claimPath + ": " + (e && e.message ? e.message : String(e)));
  }

  const manifest = {
    tool: "openai-generate-fitting-base", contract: "D-129", kind: cfg.kind, startedAt,
    claim: { file: claimPath, scope: resolved.scope, claimedAt: claim.claimedAt,
      status: "SPENT_BEFORE_FETCH", mandate: "SPENT",
      contentWritten: claim.contentWritten, contentError: claim.contentError,
      note: "created OUTSIDE the repository, before the call; never cleared automatically; no retry" },
    request: cfg, response: null, result: null, verification: null,
  };
  const finish = (stage, reason) => {
    manifest.finishedAt = new Date().toISOString();
    manifest.outcome = { stage, reason, mandate: "SPENT", retried: false };
    writeAtomic(paths.manifest, JSON.stringify(manifest, null, 2));
    return { ok: stage === "done", stage, reason, claimCreated: true, fetchCalled: true,
      claimPath, manifestPath: paths.manifest, rawPath: stage === "done" ? paths.raw : null,
      verification: manifest.verification };
  };

  // EXACTLY ONE fetch. There is no loop, and no catch that retries.
  let res;
  try {
    res = await fetchImpl(ENDPOINT, { method: "POST", headers: { Authorization: "Bearer " + apiKey }, body: fd });
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
  const SENDCMD = "node tools/avatar/openai-generate-fitting-base.mjs --send " + OWNER_APPROVAL_FLAG;

  console.log("D-129 fitting-base adapter — " + ENDPOINT);
  console.log("  model          : " + MODEL);
  console.log("  parameters     : n=" + N + " quality=" + QUALITY + " size=" + SIZE +
    " output_format=" + OUTPUT_FORMAT + " background=" + BACKGROUND);
  console.log("  never sent     : " + FORBIDDEN_FIELDS.join(", ") + "   secondary reference images: 0");
  console.log("  retry/fallback : none        automatic prompt modification: " + AUTO_PROMPT_EDIT);
  console.log("  separate tool  : D-121's adapter is neither imported nor modified\n");

  const pf = preflight();

  console.log("  the ONE API image input:");
  for (const inp of INPUTS) {
    const f = pf.files.find((x) => x.role === inp.role);
    const mark = f ? (f.ok ? "OK " : "BAD") : "MISSING";
    const size = f ? String(f.actualBytes).padStart(9) + " B" : "".padStart(11);
    const hash = f ? f.actualSha256.slice(0, 16) + "…" : "";
    const png = f && f.header ? f.header.width + "x" + f.header.height + " depth " + f.header.bitDepth + " colourtype " + f.header.colourType : "";
    console.log("    " + inp.role + "  " + mark + "  " + size + "  " + hash + "  " + png);
    console.log("            " + inp.repoPath.join("/") + "   [" + inp.decision + "]");
    console.log("            " + inp.purpose);
  }

  console.log("\n  LOCAL-ONLY masks — verified here, NEVER sent to the API:");
  for (const m of LOCAL_ONLY_MASKS) {
    const g = pf.masks.find((x) => x.name === m.name);
    const mark = g ? (g.ok ? "OK " : "BAD") : "MISSING";
    console.log("    " + mark + "  " + String(g ? g.actualBytes : 0).padStart(7) + " B  " +
      (g ? g.actualSha256.slice(0, 16) + "…" : "") + "  " + m.name);
  }

  if (pf.promptMeta) {
    console.log("\n  prompt file    : " + pf.promptMeta.fileBytes + " B  " + pf.promptMeta.fileSha256 + "   [D-129, tracked]");
    console.log("  sent text      : " + pf.promptMeta.promptBytes + " B  " + pf.promptMeta.promptSha256 +
      "   (lines " + pf.promptMeta.fenceLines.join("–") + ")");
  }
  console.log("  API key        : " + (pf.keyPresent ? "present" : "MISSING"));
  for (const id of REQUIRED_DECISIONS) {
    console.log("  " + id + "          : " + (pf.decisions[id].found ? "one row in the register" : "MISSING — " + pf.decisions[id].why));
  }

  const cp = pf.claimLocation.path;
  console.log("\n  claim scope    : " + pf.claimLocation.scope + "  — per USER and repository identity, NOT per clone");
  console.log("  claim path     : " + (cp || "UNRESOLVED — " + pf.claimLocation.why));
  if (cp) {
    console.log("  outside repo   : " + String(!isInside(cp, REPO)) + "        outside temp: " + String(!isInside(cp, tmpdir())));
    console.log("                   D-129 has its OWN claim; D-121's is spent and is never touched here");
  }
  console.log("  mandate        : " + (pf.claim.claimed ? "SPENT — the claim file exists" : "UNSPENT — no claim file exists"));

  if (showPrompt && pf.prompt) {
    console.log("\n  --- prompt as it would be sent ---");
    console.log(pf.prompt.split("\n").map((l) => "  | " + l).join("\n"));
  }

  if (!pf.ok) {
    console.error("\n  PREFLIGHT FAILED — stopping before payment:");
    for (const p of pf.problems) console.error("    · " + p);
    process.exit(1);
  }
  console.log("\n  preflight: ALL CHECKS PASSED");
  console.log("  the one input, the prompt and both local-only masks are TRACKED — reproducible on a fresh clone.");

  if (!send || !approved) {
    console.log("\n  DRY RUN. NOTHING WAS SENT. No directory, no claim, no output and no manifest were written.");
    console.log("  D-129 PREPARES this request; it does NOT authorise it. Sending requires a separate,");
    console.log("  explicit owner instruction AND both flags:");
    console.log("    " + SENDCMD);
    process.exit(0);
  }

  const result = await performSingleRequest({ pf, fetchImpl: fetch, apiKey: process.env.OPENAI_API_KEY, outDir: OUT });
  if (result.claimCreated) {
    console.log("\n  claim created  : " + result.claimPath);
    console.log("  THE MANDATE IS NOW SPENT — on any outcome, including a crash or a timeout.");
  }
  if (result.ok) {
    console.log("\n  raw result     : " + result.rawPath);
    console.log("  Manifest       : " + result.manifestPath);
    console.log("\n  STOPPED. The result is review material, not an asset.");
    console.log("  No cleanup, no retouching, no promotion, no commit, no production effect.");
    console.log("  D-127 §2: an approved fitting base is preserved OUTSIDE both repositories.");
    process.exit(0);
  }
  console.error("\n  FAILED at stage '" + result.stage + "': " + result.reason);
  if (result.manifestPath) console.error("  Manifest: " + result.manifestPath);
  console.error("  NO RETRY. The mandate stays spent.");
  process.exit(1);
}
