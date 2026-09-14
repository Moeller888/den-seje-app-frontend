// R3 CORE-ONLY UNDERLAY ADAPTER — PREPARATION ONLY. THIS FILE CANNOT SEND.
//
// D-141 prepared three things for a possible next head-only underlay call: the CORE-only API mask,
// prompt v2, and the pre.join-continuity gate. It deliberately implemented no adapter. This file is
// that adapter's PREPARATION: it verifies every input, states the exact request that a future call
// would make, and REFUSES to send it.
//
// THERE IS NO SEND PATH IN THIS FILE. Not a disabled one, not a guarded one — none. There is no
// fetch, no multipart body, no claim creation and no output writing. `attemptSend()` exists so the
// refusal is a tested code path rather than an absence, and it can never return allowed:true.
//
// THREE INDEPENDENT GROUNDS FOR REFUSAL, all evaluated, all reported:
//   1. CONTRACT     preparedCall.status is "PREPARED — NOT AUTHORISED".
//   2. AUTHORISATION authorisedCalls contains no entry for this call id. It holds exactly one
//                    entry, D-139's, whose mandate is SPENT and which this file must never reuse.
//   3. STRUCTURAL   no send path is implemented here. This ground is unconditional: it holds even
//                   if a future contract satisfied 1 and 2, and it is the reason a later decision
//                   must add the send path deliberately rather than flip a flag.
//
// WHAT IS PROPOSED, NOT DECIDED. The call id and the claim filename below are a PROPOSAL for a
// later owner decision, written down so the decision has something exact to approve or reject. They
// are not reserved, not registered and not authorised. D-142 does not exist.
//
// THE API KEY IS NEVER READ. A preparation adapter that cannot send has no business touching the
// credential. process.env.OPENAI_API_KEY does not appear in this file at all; a future send-capable
// adapter will check it, and a test here asserts this one does not.
//
// D-139 IS NOT TOUCHED. Its adapter is not imported, extended or modified; its call id is not
// reused; its claim is never read, created or deleted. Its output stays REJECTED under
// pre.transition-silhouette (644 px) and this file may not reclassify it.
//
// Usage:
//   node tools/avatar/openai-generate-r3-underlay-core.mjs              preflight, read-only
//   node tools/avatar/openai-generate-r3-underlay-core.mjs --h1 <path>  ... with H1 supplied
//   node tools/avatar/openai-generate-r3-underlay-core.mjs --plan       also print the request plan
// Any flag combination including --send prints the refusal and exits non-zero.
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, tmpdir } from "node:os";
import { decodePng } from "./build-r2-torso-occlusion-mask.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

export const TOOL = "openai-generate-r3-underlay-core";
export const PREPARED_BY = "D-141";

/** PROPOSED, not decided. A later owner decision may adopt, rename or reject these. */
export const PROPOSED = Object.freeze({
  decision: "D-142",
  callId: "D-142-r3-underlay-core-v1",
  claimFilename: "D-142.claim.json",
  status: "PROPOSAL ONLY — no such decision exists, nothing is reserved",
});

/** D-139's identifiers, recorded ONLY so this file can prove it never reuses them. */
export const NEVER_REUSE = Object.freeze({
  callId: "D-139-r3-underlay-head-only-v1",
  claimFilename: "D-139.claim.json",
  why: "that mandate is SPENT; a spent claim is never reused, reset or deleted",
});

export const CONTRACT_PATH = join(REPO, "tools", "avatar", "fixtures", "r3", "r3-shadow-contract-v1.json");
export const REGISTER = join(REPO, "docs", "project-state.md");
export const FIXTURES = join(REPO, "tools", "avatar", "fixtures", "r3-underlay");
export const EDIT_FIXTURE = join(REPO, "tools", "avatar", "fixtures", "r3-head-edit", "r3-head-edit-v1.png");
export const TRANSITION_FIXTURE = join(REPO, "tools", "avatar", "fixtures", "r3-head-edit", "r3-head-transition-v1.png");
/** Where outputs WOULD go, if a later decision implemented the send path. Nothing writes here. */
export const OUT = join(REPO, "tools", "avatar", "build", "r3-underlay-core");

// ── the request a future call would make, pinned now so the decision can approve it exactly ──
export const ENDPOINT = "https://api.openai.com/v1/images/edits";
export const MODEL = "gpt-image-2-2026-04-21";   // dated snapshot; a newer model needs a new decision
export const SIZE = "1024x1536";
export const QUALITY = "high";
export const OUTPUT_FORMAT = "png";
export const BACKGROUND = "transparent";
export const N = 1;
/** Never in the body. gpt-image-2 treats inputs at high fidelity automatically and rejects it. */
export const FORBIDDEN_FIELDS = Object.freeze(["input_fidelity"]);
export const IMAGE_FIELD = "image[]";
export const MASK_FIELD = "mask";

const [EXPECT_W, EXPECT_H] = SIZE.split("x").map(Number);
export const EXPECT_BIT_DEPTH = 8;
export const EXPECT_COLOUR_TYPE = 6;
export const PNG_SIGNATURE = Object.freeze([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The two image inputs, IN ORDER. H1 is first because the endpoint applies the mask to image 1. */
export const INPUTS = Object.freeze([
  Object.freeze({ role: "Image 1", name: "fitting-base.H1.png", external: true, envVar: "FITTING_BASE_V1_PATH",
    decision: "D-131", bytes: 1832612,
    sha256: "72875565ecd62b542a91156dbcca1399a434fe04634f4e737df71337be0d5af4",
    maskApplies: true,
    purpose: "the approved authoring base — binding for every existing pixel, the body geometry and the drawing style" }),
  Object.freeze({ role: "Image 2", name: "Northstar Master v2.png", external: false,
    repoPath: Object.freeze(["assets", "avatar", "reference", "Northstar Master v2.png"]),
    decision: "D-124", bytes: 761394,
    sha256: "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50",
    maskApplies: false,
    purpose: "identity and style reference for head shape, skin tone and line style ONLY — hair and facial features must NOT be copied" }),
]);

/** D-141's CORE-only mask. Editable = D-133 CORE; the transition band is PROTECTED here. */
export const API_MASK = Object.freeze({ name: "r3-underlay-api-mask-core-v1.png", bytes: 10703,
  sha256: "556fb973d6dd623828e4aab42d804bf05ab1df67c037498423afd607cec55dab",
  editablePx: 123721, protectedPx: 1449143,
  decision: "D-141",
  semantics: "alpha 0 = EDITABLE (D-133 CORE = EDIT minus TRANSITION), alpha 255 = PROTECTED",
  guidanceOnly: "MODEL GUIDANCE. It is NOT the guarantee of 0 changed pixels outside the head, and it "
    + "does NOT guarantee any gate will pass — D-139 showed the model regenerating 76.68% of PROTECT "
    + "despite an explicit mask." });

/** Masks that must never be sent: D-133's marker fixtures mean the opposite by alpha, and D-139's
 *  API mask marks the transition band editable, which is exactly what D-141 corrected. */
export const NEVER_SENT_MASKS = Object.freeze([
  "r3-head-edit-v1.png", "r3-head-transition-v1.png", "r3-head-protect-v1.png",
  "r3-underlay-api-mask-v1.png",
]);

/** D-141's prompt v2. Both hashes pinned: the wrapper file, and the block that would be sent. */
export const PROMPT_FILE = Object.freeze({ name: "r3-underlay-prompt-v2.md", bytes: 6242,
  sha256: "8a4e817f0a9171968211a2b4c90dff3d6507ca9dc6f3e73b5edc2bf9bc9ec141" });
export const PROMPT_BODY = Object.freeze({ bytes: 2731,
  sha256: "76cf56fb408bb65d7458645095469aa9c38c8731d4f9db23872edb30954aa693" });
export const PROMPT_FIRST_LINE = "Edit the stylised avatar illustration in Image 1.";
export const PROMPT_MARKERS = Object.freeze([
  "Image 2 is a reference for HEAD SHAPE, SKIN TONE and LINE STYLE ONLY",
  "CHANGE ONLY THE HEAD ABOVE THE NECK:",
  "KEEP EXACTLY AS THEY ARE IN IMAGE 1:",
  "- The ears, in the same position, shape and size.",
  "WHERE THE HEAD MEETS THE NECK:",
  "ABOVE THE JAW ONLY",
  "The neck does not become smaller.",
  "DO NOT ADD:",
  "OUTPUT:",
]);
export const PROMPT_TRAILING_NEWLINES = 1;

/** Rows a future decision must still pass before anything could be sent. */
export const REQUIRED_DECISIONS = Object.freeze(["D-132", "D-133", "D-139", "D-140", "D-141"]);

/** What a returned image would have to survive, in order, before it became anything. */
export const ACCEPTANCE_PIPELINE = Object.freeze([
  Object.freeze({ step: 1, gate: "pre.transition-silhouette", decision: "D-133", when: "before recomposition",
    rule: "identical solid silhouette across rows 425-445", onFailure: "no recomposed output is written" }),
  Object.freeze({ step: 2, gate: "pre.join-continuity", decision: "D-141", when: "before recomposition",
    rule: "|S(generated,424) symdiff S(H1,425)| <= |S(H1,424) symdiff S(H1,425)|, the bound derived from H1 at run time",
    onFailure: "no recomposed output is written" }),
  Object.freeze({ step: 3, gate: "post.protected-bytes", decision: "D-133", when: "after recomposition",
    rule: "exactly 0 differing RGBA bytes against H1 inside PROTECT", onFailure: "the output is refused" }),
  Object.freeze({ step: 4, gate: "post.transition-silhouette", decision: "D-133", when: "after recomposition",
    rule: "exactly 0 solid-silhouette deviations inside TRANSITION", onFailure: "the output is refused" }),
  Object.freeze({ step: 5, gate: "post.coverage", decision: "D-133", when: "after recomposition",
    rule: "CORE + TRANSITION + PROTECT cover the canvas exactly", onFailure: "the output is refused" }),
  Object.freeze({ step: 6, gate: "owner-visual review of the neck seam", decision: "D-141", when: "after every machine gate is green",
    rule: "the head/neck join at 1:1, 52x78, 110x165, 100x150 and 180x270, on light, on the real dark "
      + "avatar gradient and on checkerboard, with H1, the raw output and the recomposed output side by side",
    onFailure: "no promotion; the machine gates do not substitute for it" }),
]);

export const D139_OUTPUT = Object.freeze({
  verdict: "REJECTED",
  gate: "pre.transition-silhouette",
  differingPx: 644,
  mayNotReclassify: "This adapter must never reclassify, re-judge or promote the D-139 output. Its "
    + "join measurement of 33 is historical diagnostic only. D-133 noRefit stands.",
});

const sha = (b) => createHash("sha256").update(b).digest("hex");
const FENCE = "`".repeat(3);

// ── small shared helpers, deliberately duplicated rather than imported from D-139's adapter ──
// Importing it would couple a frozen, spent-mandate contract to a new file; D-127 §1's reasoning.

export function isInside(child, parent) {
  if (typeof child !== "string" || typeof parent !== "string" || child === "" || parent === "") return false;
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** Where the PROPOSED claim would live. Resolved so the proposal is concrete; never created. */
export function proposedClaimPath(opts) {
  const o = opts || {};
  const env = o.env || process.env;
  const platform = o.platform || process.platform;
  const repoRoot = o.repoRoot || REPO;
  const tempDir = Object.prototype.hasOwnProperty.call(o, "tmpDir") ? o.tmpDir : tmpdir();
  const home = Object.prototype.hasOwnProperty.call(o, "homeDir") ? o.homeDir : homedir();
  let base = null, scope = null;
  if (platform === "win32") {
    const local = env.LOCALAPPDATA;
    if (typeof local !== "string" || local.trim() === "") {
      return { ok: false, path: null, scope: "windows-user-local-appdata", why: "LOCALAPPDATA is not set" };
    }
    base = local; scope = "windows-user-local-appdata";
  } else {
    const xdg = env.XDG_STATE_HOME;
    if (typeof xdg === "string" && xdg.trim() !== "") { base = xdg; scope = "xdg-state-home"; }
    else if (typeof home === "string" && home.trim() !== "") { base = join(home, ".local", "state"); scope = "home-local-state"; }
    else return { ok: false, path: null, scope: "home-local-state", why: "no XDG_STATE_HOME and no home directory" };
  }
  const path = join(base, "DenSejeApp", "one-shot-claims", "Moeller888-den-seje-app-frontend", PROPOSED.claimFilename);
  if (isInside(path, repoRoot)) return { ok: false, path, scope, why: "resolved inside the repository" };
  if (typeof tempDir === "string" && tempDir !== "" && isInside(path, tempDir)) {
    return { ok: false, path, scope, why: "resolved inside the temp directory" };
  }
  return { ok: true, path, scope, why: null };
}

export function readPngHeader(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 33) return { ok: false, why: "too short to hold a PNG header" };
  for (let i = 0; i < PNG_SIGNATURE.length; i++) if (buf[i] !== PNG_SIGNATURE[i]) return { ok: false, why: "PNG signature mismatch" };
  if (buf.toString("ascii", 12, 16) !== "IHDR") return { ok: false, why: "the first chunk is not IHDR" };
  return { ok: true, width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bitDepth: buf[24], colourType: buf[25] };
}

export function validatePngHeader(buf, label) {
  const h = readPngHeader(buf);
  if (!h.ok) return { ok: false, problems: [label + ": " + h.why], header: null };
  const problems = [];
  if (h.width !== EXPECT_W || h.height !== EXPECT_H) problems.push(`${label}: ${h.width}x${h.height}, expected ${EXPECT_W}x${EXPECT_H}`);
  if (h.bitDepth !== EXPECT_BIT_DEPTH) problems.push(`${label}: bit depth ${h.bitDepth}, expected ${EXPECT_BIT_DEPTH}`);
  if (h.colourType !== EXPECT_COLOUR_TYPE) problems.push(`${label}: colour type ${h.colourType}, expected ${EXPECT_COLOUR_TYPE} (RGBA)`);
  return { ok: problems.length === 0, problems, header: h };
}

/** The transmitted text: the single fenced block, LF, exactly one trailing newline. */
export function extractPrompt(md) {
  if (typeof md !== "string" || md.length === 0) return { ok: false, why: "prompt file is empty or not text" };
  if (md.includes("\r")) return { ok: false, why: "prompt file contains CR; it must be LF-only" };
  const lines = md.split("\n");
  const fences = [];
  for (let i = 0; i < lines.length; i++) if (lines[i].trimEnd() === FENCE) fences.push(i);
  if (fences.length !== 2) return { ok: false, why: "expected exactly 2 code fences, found " + fences.length };
  const body = lines.slice(fences[0] + 1, fences[1]).join("\n").replace(/\s+$/, "") + "\n";
  if (!body.startsWith(PROMPT_FIRST_LINE)) return { ok: false, why: "the block does not start with the expected first line" };
  if (!body.endsWith("\n") || body.endsWith("\n\n")) return { ok: false, why: "the transmitted text must end with exactly one newline" };
  for (const m of PROMPT_MARKERS) if (!body.includes(m)) return { ok: false, why: "missing required section " + JSON.stringify(m) };
  return { ok: true, prompt: body, fenceLines: [fences[0] + 1, fences[1] + 1] };
}

export function decisionExists(id, registerPath) {
  const reg = registerPath || REGISTER;
  if (!existsSync(reg)) return { found: false, why: "the decision register was not found at " + reg };
  const rows = readFileSync(reg, "utf8").split("\n").filter((l) => l.startsWith("| **" + id + "** |"));
  if (rows.length === 0) return { found: false, why: id + " is not a row in the decision register" };
  if (rows.length > 1) return { found: false, why: id + " appears " + rows.length + " times" };
  return { found: true, why: null };
}

/** The CORE mask's direction, re-derived from pixels against D-133's own fixtures. */
export function verifyMaskSemantics(maskBuf, editBuf, transitionBuf) {
  const problems = [];
  let mask, edit, trans;
  try { mask = decodePng(maskBuf, "CORE API mask"); } catch (e) { return { ok: false, problems: ["CORE API mask: " + e.message], counts: null }; }
  try { edit = decodePng(editBuf, "D-133 EDIT"); } catch (e) { return { ok: false, problems: ["D-133 EDIT: " + e.message], counts: null }; }
  try { trans = decodePng(transitionBuf, "D-133 TRANSITION"); } catch (e) { return { ok: false, problems: ["D-133 TRANSITION: " + e.message], counts: null }; }
  if (mask.w !== EXPECT_W || mask.h !== EXPECT_H) problems.push(`CORE API mask: ${mask.w}x${mask.h}, expected ${EXPECT_W}x${EXPECT_H}`);
  if (problems.length) return { ok: false, problems, counts: null };

  const n = mask.w * mask.h;
  let editable = 0, protectedPx = 0, nonBinary = 0, coloured = 0, wrongIn = 0, wrongOut = 0, bandEditable = 0;
  for (let i = 0; i < n; i++) {
    const a = mask.rgba[i * 4 + 3];
    if (a === 0) editable++; else if (a === 255) protectedPx++; else nonBinary++;
    if (mask.rgba[i * 4] !== 0 || mask.rgba[i * 4 + 1] !== 0 || mask.rgba[i * 4 + 2] !== 0) coloured++;
    const inEdit = edit.rgba[i * 4 + 3] >= 128;
    const inBand = trans.rgba[i * 4 + 3] >= 128;
    const wantEditable = inEdit && !inBand;
    if (wantEditable && a !== 0) wrongIn++;
    if (!wantEditable && a !== 255) wrongOut++;
    if (inBand && a === 0) bandEditable++;
  }
  if (nonBinary !== 0) problems.push(`CORE API mask: alpha is not binary on ${nonBinary} px`);
  if (coloured !== 0) problems.push(`CORE API mask: RGB is not 0,0,0 on ${coloured} px`);
  if (editable !== API_MASK.editablePx) problems.push(`CORE API mask: ${editable} editable px, expected ${API_MASK.editablePx}`);
  if (protectedPx !== API_MASK.protectedPx) problems.push(`CORE API mask: ${protectedPx} protected px, expected ${API_MASK.protectedPx}`);
  if (wrongIn !== 0 || wrongOut !== 0) problems.push(`CORE API mask is INVERTED or misaligned: ${wrongIn} in-region and ${wrongOut} out-of-region px are wrong`);
  if (bandEditable !== 0) problems.push(`CORE API mask offers ${bandEditable} band px as editable — that is the D-139 defect D-141 corrected`);
  return { ok: problems.length === 0, problems, counts: { editable, protected: protectedPx, nonBinary, coloured, bandEditable } };
}

/** H1, by explicit flag or environment. Never a guessed default, never copied into the repository. */
export function resolveH1Path(opts) {
  const o = opts || {};
  if (typeof o.h1Path === "string" && o.h1Path !== "") return { ok: true, path: o.h1Path, source: "--h1" };
  const argv = o.argv || [];
  const flag = argv.find((a) => a.startsWith("--h1="));
  if (flag && flag.slice(5) !== "") return { ok: true, path: flag.slice(5), source: "--h1=" };
  const i = argv.indexOf("--h1");
  if (i >= 0 && typeof argv[i + 1] === "string" && argv[i + 1] !== "" && !argv[i + 1].startsWith("--")) {
    return { ok: true, path: argv[i + 1], source: "--h1" };
  }
  const env = o.env || process.env;
  if (typeof env.FITTING_BASE_V1_PATH === "string" && env.FITTING_BASE_V1_PATH !== "") {
    return { ok: true, path: env.FITTING_BASE_V1_PATH, source: "FITTING_BASE_V1_PATH" };
  }
  return { ok: false, path: null, source: null,
    why: "H1 is external (D-127 §2) and was not supplied — pass --h1 <path> or set FITTING_BASE_V1_PATH" };
}

// ── preflight: everything a future call would need, verified read-only ───────────────────────
export function preflight(opts) {
  const o = opts || {};
  const fixturesDir = o.fixturesDir || FIXTURES;
  const repoRoot = o.repoRoot || REPO;
  const registerPath = o.registerPath || REGISTER;
  const contractPath = o.contractPath || CONTRACT_PATH;

  const problems = [];
  const files = [];

  const h1 = resolveH1Path({ h1Path: o.h1Path, argv: o.argv || [], env: o.env || process.env });
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
    if (buf.length !== inp.bytes) problems.push(`${inp.role}: ${buf.length} B, expected ${inp.bytes}`);
    if (got !== inp.sha256) problems.push(`${inp.role}: sha ${got}, expected ${inp.sha256}`);
    const png = validatePngHeader(buf, inp.role);
    for (const p of png.problems) problems.push(p);
    files.push({ role: inp.role, name: inp.name, abs, maskApplies: inp.maskApplies, decision: inp.decision,
      purpose: inp.purpose, external: inp.external, actualBytes: buf.length, actualSha256: got, header: png.header,
      ok: buf.length === inp.bytes && got === inp.sha256 && png.ok });
  }
  if (files.length === INPUTS.length) {
    for (let i = 0; i < INPUTS.length; i++) if (files[i].role !== INPUTS[i].role) problems.push("input order is wrong at position " + i);
    if (files[0].maskApplies !== true) problems.push("the mask must apply to the FIRST image");
  }

  let mask = null;
  const maskAbs = join(fixturesDir, API_MASK.name);
  if (!existsSync(maskAbs)) {
    problems.push("CORE API mask: missing tracked fixture " + API_MASK.name);
  } else {
    const buf = readFileSync(maskAbs);
    const got = sha(buf);
    if (buf.length !== API_MASK.bytes) problems.push(`CORE API mask: ${buf.length} B, expected ${API_MASK.bytes}`);
    if (got !== API_MASK.sha256) problems.push(`CORE API mask: sha ${got}, expected ${API_MASK.sha256}`);
    const png = validatePngHeader(buf, "CORE API mask");
    for (const p of png.problems) problems.push(p);
    let semantics = { ok: false, problems: ["the D-133 fixtures were not found"], counts: null };
    const ed = o.editFixturePath || EDIT_FIXTURE;
    const tr = o.transitionFixturePath || TRANSITION_FIXTURE;
    if (existsSync(ed) && existsSync(tr)) semantics = verifyMaskSemantics(buf, readFileSync(ed), readFileSync(tr));
    for (const p of semantics.problems) problems.push(p);
    mask = { ...API_MASK, abs: maskAbs, actualBytes: buf.length, actualSha256: got, header: png.header, semantics,
      ok: buf.length === API_MASK.bytes && got === API_MASK.sha256 && png.ok && semantics.ok };
  }

  let prompt = null, promptMeta = null;
  const promptAbs = join(fixturesDir, PROMPT_FILE.name);
  if (!existsSync(promptAbs)) {
    problems.push("prompt: missing tracked fixture " + PROMPT_FILE.name);
  } else {
    const raw = readFileSync(promptAbs);
    const fileSha = sha(raw);
    if (raw.length !== PROMPT_FILE.bytes) problems.push(`prompt file: ${raw.length} B, expected ${PROMPT_FILE.bytes}`);
    if (fileSha !== PROMPT_FILE.sha256) problems.push(`prompt file: sha ${fileSha}, expected ${PROMPT_FILE.sha256}`);
    const ex = extractPrompt(raw.toString("utf8"));
    if (!ex.ok) problems.push("prompt extraction: " + ex.why);
    else {
      const bodyBuf = Buffer.from(ex.prompt, "utf8");
      const bodySha = sha(bodyBuf);
      if (bodyBuf.length !== PROMPT_BODY.bytes) problems.push(`transmitted text: ${bodyBuf.length} B, expected ${PROMPT_BODY.bytes}`);
      if (bodySha !== PROMPT_BODY.sha256) problems.push(`transmitted text: sha ${bodySha}, expected ${PROMPT_BODY.sha256}`);
      if (bodyBuf.length === PROMPT_BODY.bytes && bodySha === PROMPT_BODY.sha256) prompt = ex.prompt;
      promptMeta = { file: PROMPT_FILE.name, fileBytes: raw.length, fileSha256: fileSha, fenceLines: ex.fenceLines,
        promptBytes: bodyBuf.length, promptSha256: bodySha, trailingNewlines: PROMPT_TRAILING_NEWLINES };
    }
  }

  const decisions = {};
  for (const id of REQUIRED_DECISIONS) {
    const d = decisionExists(id, registerPath);
    decisions[id] = d;
    if (!d.found) problems.push("MISSING DECISION: " + d.why);
  }

  let contract = null;
  if (!existsSync(contractPath)) problems.push("the contract was not found at " + contractPath);
  else { try { contract = JSON.parse(readFileSync(contractPath, "utf8")); } catch (_) { problems.push("the contract is not valid JSON"); } }

  const claimLocation = Object.prototype.hasOwnProperty.call(o, "claimPath")
    ? { ok: typeof o.claimPath === "string" && o.claimPath !== "", path: o.claimPath, scope: "injected-by-caller", why: null }
    : proposedClaimPath({ repoRoot: REPO, env: o.env, platform: o.platform });
  const claimExists = claimLocation.ok && existsSync(claimLocation.path);
  if (claimExists) problems.push("a file already exists at the PROPOSED claim path: " + claimLocation.path);

  return { ok: problems.length === 0, problems, files, mask, prompt, promptMeta, decisions, contract,
    h1, claimLocation, claimExists, outDir: OUT, fixturesDir };
}

/** The exact request a future call would make. A description; nothing here performs it. */
export function requestPlan(pf) {
  const files = pf && Array.isArray(pf.files) ? pf.files : [];
  return {
    tool: TOOL,
    status: "PLAN ONLY — NOT AUTHORISED, NOT SENT",
    proposedCallId: PROPOSED.callId,
    proposedDecision: PROPOSED.decision,
    endpoint: ENDPOINT,
    endpointType: "images.edits (two ordered image inputs, one mask)",
    model: MODEL,
    modelPolicy: "a dated snapshot with NO fallback; a newer model needs a new owner decision",
    parameters: { n: N, quality: QUALITY, size: SIZE, output_format: OUTPUT_FORMAT, background: BACKGROUND },
    omitted: { input_fidelity: "never sent — gpt-image-2 treats inputs at high fidelity automatically and rejects the field" },
    inputOrder: INPUTS.map((i) => i.role),
    inputOrderReason: "H1 is first because the edit endpoint applies the mask to the first image",
    inputs: INPUTS.map((i) => {
      const f = files.find((x) => x.role === i.role);
      return { role: i.role, file: i.external ? i.name + " (EXTERNAL, not tracked)" : i.repoPath.join("/"),
        decision: i.decision, purpose: i.purpose, maskApplies: i.maskApplies, bytes: i.bytes, sha256: i.sha256,
        verified: f ? f.ok : false };
    }),
    mask: { file: API_MASK.name, bytes: API_MASK.bytes, sha256: API_MASK.sha256, decision: API_MASK.decision,
      semantics: API_MASK.semantics, guidanceOnly: API_MASK.guidanceOnly,
      verified: pf && pf.mask ? pf.mask.ok : false },
    neverSent: { masks: NEVER_SENT_MASKS,
      why: "D-133's marker fixtures mean the opposite by alpha, and D-139's API mask marks the band editable" },
    prompt: (pf && pf.promptMeta) || { file: PROMPT_FILE.name, fileBytes: PROMPT_FILE.bytes,
      fileSha256: PROMPT_FILE.sha256, promptBytes: PROMPT_BODY.bytes, promptSha256: PROMPT_BODY.sha256 },
    theOnePermittedFetch: {
      count: 1,
      method: "POST",
      contentType: "multipart/form-data",
      fields: [IMAGE_FIELD + " (x2, in order)", MASK_FIELD, "model", "prompt", "n", "size", "quality", "output_format", "background"],
      claimBefore: "an exclusive create (flag \"wx\") of the claim IMMEDIATELY before the single fetch",
      spentOn: "any outcome — success, HTTP error, transport error, timeout, moderation refusal, parse failure, crash",
      retry: false, fallbackModel: false, automaticPromptModification: false,
      implemented: false,
      note: "DESCRIBED, NOT IMPLEMENTED. No fetch exists in this file. A later owner decision must add "
        + "the send path deliberately; it cannot be switched on by a flag.",
    },
    acceptancePipeline: ACCEPTANCE_PIPELINE,
    d139Output: D139_OUTPUT,
    proposedClaim: { filename: PROPOSED.claimFilename, scope: "per user and per repository identity, outside both clones and outside temp",
      neverReuses: NEVER_REUSE },
  };
}

// ── the refusal, as a tested code path ───────────────────────────────────────────────────────
export const REFUSAL = Object.freeze({
  CONTRACT: "contract-not-authorised",
  AUTHORISATION: "call-id-not-authorised",
  STRUCTURAL: "no-send-path-implemented",
});

/**
 * Evaluates all three grounds and returns them. `allowed` can never be true: ground 3 is structural
 * and is not satisfiable by this file. Grounds 1 and 2 are evaluated genuinely, so a contract that
 * changed would change what is reported — but not the outcome.
 */
export function sendGate(opts) {
  const o = opts || {};
  const contract = o.contract || null;
  const refusals = [];

  const prepared = contract && contract.preparedCall ? contract.preparedCall : null;
  if (!prepared) {
    refusals.push({ ground: REFUSAL.CONTRACT, detail: "the contract carries no preparedCall block" });
  } else if (prepared.status !== "PREPARED — NOT AUTHORISED") {
    refusals.push({ ground: REFUSAL.CONTRACT, detail: "preparedCall.status is " + JSON.stringify(prepared.status)
      + "; this adapter only recognises the prepared, unauthorised state" });
  } else {
    refusals.push({ ground: REFUSAL.CONTRACT,
      detail: "preparedCall.status is \"PREPARED — NOT AUTHORISED\": D-141 authorises nothing" });
  }

  const calls = contract && contract.authorisedCalls && Array.isArray(contract.authorisedCalls.calls)
    ? contract.authorisedCalls.calls : [];
  const match = calls.filter((c) => c && c.callId === PROPOSED.callId);
  if (match.length !== 1) {
    refusals.push({ ground: REFUSAL.AUTHORISATION,
      detail: `authorisedCalls holds ${match.length} entries for ${PROPOSED.callId}; exactly 1 would be required` });
  }

  refusals.push({ ground: REFUSAL.STRUCTURAL,
    detail: "no send path is implemented in this file: there is no fetch, no request body, no claim "
      + "creation and no output writing. A later owner decision must add it deliberately." });

  return { allowed: false, refusals, grounds: refusals.map((r) => r.ground) };
}

/**
 * The only entry point a caller could mistake for sending. It never sends. It takes no fetch
 * implementation, because there is nothing to inject one into.
 */
export function attemptSend(opts) {
  const o = opts || {};
  const gate = sendGate({ contract: o.contract });
  return {
    sent: false,
    fetchCalled: false,
    claimCreated: false,
    outputWritten: false,
    allowed: false,
    refusals: gate.refusals,
    grounds: gate.grounds,
    whatWouldBeNeeded: [
      "an owner decision that adopts a call id and a claim identity",
      "that decision recorded as a row in docs/project-state.md",
      "an entry in authorisedCalls carrying every pin this file already fixes",
      "preparedCall retired or superseded by that entry",
      "a send path added to a new or extended adapter, itself owner-approved",
      "a separate, explicit owner instruction to run it",
    ],
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const argv = process.argv.slice(2);
  const wantsSend = argv.includes("--send");
  const showPlan = argv.includes("--plan");

  console.log("R3 CORE-only underlay adapter — PREPARATION ONLY, prepared by " + PREPARED_BY);
  console.log("  proposed call id : " + PROPOSED.callId + "   (" + PROPOSED.status + ")");
  console.log("  endpoint         : " + ENDPOINT);
  console.log("  model            : " + MODEL);
  console.log("  parameters       : n=" + N + " quality=" + QUALITY + " size=" + SIZE +
    " output_format=" + OUTPUT_FORMAT + " background=" + BACKGROUND);
  console.log("  never sent       : " + FORBIDDEN_FIELDS.join(", "));
  console.log("  send path        : NOT IMPLEMENTED — there is no fetch in this file\n");

  const pf = preflight({ argv });

  console.log("  the TWO image inputs, IN ORDER (the mask applies to image 1):");
  for (const inp of INPUTS) {
    const f = pf.files.find((x) => x.role === inp.role);
    const mark = f ? (f.ok ? "OK " : "BAD") : "MISSING";
    console.log("    " + inp.role + "  " + mark + "  " + (f ? String(f.actualBytes).padStart(9) + " B  " + f.actualSha256.slice(0, 16) + "…" : ""));
    console.log("            " + (inp.external ? inp.name + "  [EXTERNAL — " + (pf.h1.ok ? "from " + pf.h1.source : "NOT SUPPLIED") + "]"
      : inp.repoPath.join("/") + "  [tracked]"));
  }
  console.log("\n  the CORE-only API mask:");
  if (pf.mask) {
    console.log("    " + (pf.mask.ok ? "OK " : "BAD") + "  " + String(pf.mask.actualBytes).padStart(7) + " B  " +
      pf.mask.actualSha256.slice(0, 16) + "…  " + pf.mask.name + "   [" + API_MASK.decision + "]");
    const c = pf.mask.semantics && pf.mask.semantics.counts;
    if (c) console.log("           editable " + c.editable + "  protected " + c.protected + "  band offered as editable: " + c.bandEditable);
  } else console.log("    MISSING  " + API_MASK.name);

  if (pf.promptMeta) {
    console.log("\n  prompt file      : " + pf.promptMeta.fileBytes + " B  " + pf.promptMeta.fileSha256);
    console.log("  transmitted text : " + pf.promptMeta.promptBytes + " B  " + pf.promptMeta.promptSha256 +
      "   (lines " + pf.promptMeta.fenceLines.join("–") + ", LF, one trailing newline)");
  }
  for (const id of REQUIRED_DECISIONS) console.log("  " + id + "            : " + (pf.decisions[id].found ? "one row in the register" : "MISSING"));
  console.log("  proposed claim   : " + (pf.claimLocation.path || "UNRESOLVED") + (pf.claimExists ? "   ALREADY EXISTS" : "   (does not exist)"));

  console.log("\n  " + (pf.ok ? "preflight: ALL CHECKS PASSED" : "preflight: PROBLEMS"));
  for (const p of pf.problems) console.error("    · " + p);

  if (showPlan) {
    console.log("\n  --- the request a future call would make ---");
    console.log(JSON.stringify(requestPlan(pf), null, 2).split("\n").map((l) => "  | " + l).join("\n"));
  }

  const result = attemptSend({ contract: pf.contract });
  console.log("\n  " + (wantsSend ? "--send WAS REQUESTED AND IS REFUSED" : "NOTHING IS SENT — this adapter has no send path"));
  for (const r of result.refusals) console.log("    ✖ [" + r.ground + "] " + r.detail);
  console.log("\n  sent: " + result.sent + "   fetch called: " + result.fetchCalled +
    "   claim created: " + result.claimCreated + "   output written: " + result.outputWritten);
  console.log("\n  Before any call could be sent:");
  for (const w of result.whatWouldBeNeeded) console.log("    · " + w);
  console.log("\n  A returned image would then have to pass, in order:");
  for (const g of ACCEPTANCE_PIPELINE) console.log("    " + g.step + ". " + g.gate + "  [" + g.decision + ", " + g.when + "]");
  console.log("\n  " + D139_OUTPUT.mayNotReclassify);

  process.exitCode = wantsSend ? 1 : (pf.ok ? 0 : 1);
}
