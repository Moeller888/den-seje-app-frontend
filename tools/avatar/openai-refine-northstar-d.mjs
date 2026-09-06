// D-121 REFINEMENT ADAPTER — the ONE authorised edit of the existing D candidate.
//
// D-121 §8 said the send path did not exist yet, by design, and that writing it — and deciding
// whether this becomes a tracked tools/avatar/ tool with its own unit test — happens UNDER that
// decision. D-123 §5 clarified that §8's 12,020-byte hash identified the pre-authorisation dry-run
// snapshot, not a required end state, so this file may implement the send path.
//
// EVERY REQUEST INPUT IS READ FROM A TRACKED FIXTURE. Nothing under tools/avatar/build/ is read.
// D-121 §4 tracked the prompt, D-122 §4 tracked Image 1, D-123 §2 tracked Images 2-4, so the whole
// request is reproducible — and byte-testable — on a fresh clone. That was the point of all three.
//
// IT DOES NOT SEND ANYTHING BY DEFAULT. A bare run is a read-only dry run: it creates no directory,
// no claim, no output and no manifest. Sending requires ALL of:
//   --send  AND  --owner-approval=D-121  AND  a passing preflight  AND  one row each of
//   D-121, D-122 and D-123 actually present in docs/project-state.md.
// The register check is a structural bar, not an agreement: remove a row and this tool cannot send.
//
// FAIL-CLOSED, ONCE — D-122 §8, chosen deliberately by the owner:
//   The claim is created with an EXCLUSIVE create (flag "wx") IMMEDIATELY before the single fetch.
//   Once it exists, D-121's one mandate counts as SPENT — on a process crash, a timeout, a
//   transport error, an HTTP error, an unknown server state, a parse failure or an invalid or
//   missing output exactly as much as on success. Nothing here deletes or resets it, and nothing
//   here retries. A further attempt requires a NEW, EXPLICIT OWNER DECISION.
//
// WHY THE CLAIM LIVES OUTSIDE THE REPOSITORY — the defect this file exists to fix:
//   A claim under tools/avatar/build/ is NOT sufficiently fail-closed. It is gitignored, so an
//   ordinary `git clean -xdf` deletes it and silently un-spends the mandate — the same failure
//   class D-113 records, where an approved artefact in a gitignored directory was destroyed by an
//   authorised cleanup. Worse, this project keeps TWO clones of the same GitHub repository on one
//   machine, so a repo-local claim gives each clone its OWN claim: the one authorised request could
//   technically be sent once from each. One mandate must mean one claim.
//   So the claim resolves to a fixed per-USER state location derived from the REPOSITORY IDENTITY,
//   never from the local checkout directory. Both clones therefore resolve to the same file, and no
//   Git operation can reach it. There is deliberately NO --claim-path, NO --force and NO
//   --reset-claim: a bypass flag would defeat the whole mechanism.
//
// D-120's tools/avatar/openai-generate-northstar-d.mjs is a CLOSED contract protected by its own
// test. It is neither imported nor touched here.
//
// The API key is read from the environment only. It is never printed, never logged, never written
// to the claim and never written to the manifest.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, statSync,
  openSync, writeSync, fsyncSync, closeSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

/** Every request input lives here. This directory is TRACKED; tools/avatar/build/ is not read. */
export const FIXTURES = join(REPO, "tools", "avatar", "fixtures", "northstar-d-refinement");
export const REGISTER = join(REPO, "docs", "project-state.md");
/** Only OUTPUTS go to the gitignored build area. No request input and NO CLAIM live there. */
export const OUT = join(REPO, "tools", "avatar", "build", "northstar-d-refinement");

// ── the frozen request contract (D-121 §4) ───────────────────────────────────────────────────
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

/** The multipart field the Images edit endpoint takes its images in. Same as the D-120 request
 *  that actually succeeded — the convention is copied, not guessed. */
export const IMAGE_FIELD = "image[]";

/** Every row that must be present before this tool will send. */
export const REQUIRED_DECISIONS = ["D-121", "D-122", "D-123"];
export const OWNER_APPROVAL_FLAG = "--owner-approval=D-121";

const [EXPECT_W, EXPECT_H] = SIZE.split("x").map(Number);
export const EXPECT_BIT_DEPTH = 8;
export const EXPECT_COLOUR_TYPE = 6;   // truecolour + alpha (RGBA)
export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * The four inputs, in the order the prompt addresses them as Image 1-4. The order is binding, and
 * it is D-121's — NOT D-120's, which numbered the same three geometry files differently because it
 * had a fourth, different input. The role binds, not the filename.
 */
export const INPUTS = [
  { role: "Image 1", name: "candidate-input-v1.png", decision: "D-122",
    bytes: 1336760, sha256: "3f4ec03601ceb74e0b5dec2d9fcfa45b30e3515e9c1fcc2de4d6fed65e909e26",
    purpose: "identity, face, hair, colour and style — the PRIMARY reference" },
  { role: "Image 2", name: "geometry-plate-bald-nude.png", decision: "D-123",
    bytes: 26826, sha256: "d3a855fc50afe634f135bf306a68404a7a6b4bd4ac52d8a931cf65510b413e11",
    purpose: "cranium and body volume" },
  { role: "Image 3", name: "geometry-silhouette.png", decision: "D-123",
    bytes: 26362, sha256: "0e760fb1b0ced293654ece10027c1fbdf68ee15aee4beaedf6fcbc81b7bf602a",
    purpose: "the outer boundary, arm-torso air and leg gap" },
  { role: "Image 4", name: "geometry-reference-transparent.png", decision: "D-123",
    bytes: 40247, sha256: "e3c44a512bec3f3780e5b9d99a61cba473364e6889c1a5a6a7b0b99bca552dc7",
    purpose: "joint, body and garment anchors" },
];

/** The prompt, tracked by D-121 §4. BOTH hashes are pinned: the wrapper file, and the fenced block
 *  that is the text actually sent. */
export const PROMPT_FILE = { name: "refinement-prompt.md", bytes: 6488,
  sha256: "2380fcd7d2fe4c4ac4da87a46d0f9a4762d792d463c8b427f7d920ac670952a5" };
export const PROMPT_BODY = { bytes: 3494,
  sha256: "166b1ee25eee341abbc51ffaa361ce85f08c9d1f60826080a04ae2f6b8ec70f9" };

// ── the one-shot claim, per user and per REPOSITORY IDENTITY ─────────────────────────────────
/** The GitHub repository, NOT the local checkout. Both local clones are clones of this one repo,
 *  so deriving the claim from this constant is what makes them share a single mandate. */
export const REPO_IDENTITY = "Moeller888-den-seje-app-frontend";
export const CLAIM_APP_DIR = "DenSejeApp";
export const CLAIM_SUBDIR = "one-shot-claims";
export const CLAIM_FILENAME = "D-121.claim.json";

/** True when `child` is the same path as, or lives inside, `parent`. */
export function isInside(child, parent) {
  if (typeof child !== "string" || typeof parent !== "string" || child === "" || parent === "") return false;
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Resolves the ONE claim file for this user and this repository identity.
 *
 * Windows uses %LOCALAPPDATA%; it is REQUIRED. If it is missing or empty the resolver fails, and the
 * send preflight fails with it — there is deliberately no fallback to the repository, the build
 * directory, the working directory or the temp directory, because every one of those would either be
 * wiped by ordinary cleanup or differ between the two clones.
 *
 * Everything is injectable so the resolver can be tested without touching the real user profile.
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
    if (typeof xdg === "string" && xdg.trim() !== "") {
      base = xdg;
      scope = "xdg-state-home";
    } else if (typeof home === "string" && home.trim() !== "") {
      base = join(home, ".local", "state");
      scope = "home-local-state";
    } else {
      return { ok: false, path: null, scope: "home-local-state",
        why: "neither XDG_STATE_HOME nor a home directory is available; refusing to fall back to the repository or temp" };
    }
  }

  const dir = join(base, CLAIM_APP_DIR, CLAIM_SUBDIR, REPO_IDENTITY);
  const path = join(dir, CLAIM_FILENAME);

  // The guards that make the location meaningful rather than decorative.
  if (isInside(path, repoRoot)) {
    return { ok: false, path, scope, why: "the resolved claim path is inside the repository: " + path };
  }
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
  return { dir: d, raw: join(d, "refined.raw.png"), manifest: join(d, "refined.request.json") };
}

// ── PNG header reading — the only decoding this tool needs ───────────────────────────────────
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

/** The PNG properties D-121, D-122 and D-123 all record: 1024x1536, 8-bit, colour type 6 (RGBA). */
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

// ── prompt extraction (D-121 §4: the prompt is byte-locked, not retyped) ─────────────────────
export function extractPrompt(md) {
  if (typeof md !== "string" || md.length === 0) return { ok: false, why: "prompt file is empty or not text" };
  const lines = md.split("\n");
  const fences = [];
  for (let i = 0; i < lines.length; i++) if (lines[i].trimEnd() === FENCE) fences.push(i);
  if (fences.length !== 2) return { ok: false, why: "expected exactly 2 code fences, found " + fences.length };
  const body = lines.slice(fences[0] + 1, fences[1]).join("\n").replace(/\s+$/, "");
  if (!body.startsWith("Edit the boy in Image 1.")) {
    return { ok: false, why: "fenced block does not start with the expected first line" };
  }
  for (const marker of ["Image 1", "Image 2", "Image 3", "Image 4"]) {
    if (!body.includes(marker)) return { ok: false, why: "prompt does not address " + marker };
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

// ── the fail-closed claim (D-122 §8) ─────────────────────────────────────────────────────────
/**
 * EXISTENCE ALONE MEANS SPENT. An empty file, a truncated file or unparseable JSON all count: a
 * crash between the exclusive create and the content write must still block every later attempt.
 */
export function claimState(claimPath) {
  if (typeof claimPath !== "string" || claimPath === "") return { claimed: false, path: claimPath, detail: null };
  if (!existsSync(claimPath)) return { claimed: false, path: claimPath, detail: null };
  let bytes = null;
  try { bytes = statSync(claimPath).size; } catch (_) { bytes = null; }
  let detail = null;
  try {
    const txt = readFileSync(claimPath, "utf8");
    if (txt.trim() === "") {
      detail = { empty: true, mandate: "SPENT" };
    } else {
      const parsed = JSON.parse(txt);
      detail = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { unexpectedShape: true };
      if (!detail.mandate) detail.mandate = "SPENT";
    }
  } catch (_) {
    detail = { unreadable: true, mandate: "SPENT" };
  }
  return { claimed: true, path: claimPath, bytes, detail };
}

/**
 * Creates the claim, or throws. The steps are ordered so that the FILE EXISTS before any content is
 * written: an exclusive open is atomic, so two processes racing here cannot both proceed, and a
 * crash immediately afterwards leaves an empty file that still blocks every later attempt.
 * Only the claim's parent directory is created — nothing else.
 * The record it is given must never contain a secret.
 */
export function createClaim(record, claimPath) {
  if (typeof claimPath !== "string" || claimPath === "") throw new Error("createClaim requires an explicit claim path");
  mkdirSync(dirname(claimPath), { recursive: true });
  const fd = openSync(claimPath, "wx");           // the mandate is SPENT from this line onwards
  const payload = {
    contract: "D-121",
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
// ── preflight (D-121 §4) ─────────────────────────────────────────────────────────────────────
/** Everything is injectable so the guards can be exercised without touching the real fixtures,
 *  the real register or the real user profile. */
export function preflight(opts) {
  const o = opts || {};
  const fixturesDir = o.fixturesDir || FIXTURES;
  const registerPath = o.registerPath || REGISTER;
  const paths = outputPaths(o.outDir);
  const apiKey = Object.prototype.hasOwnProperty.call(o, "apiKey") ? o.apiKey : process.env.OPENAI_API_KEY;

  const problems = [];
  const files = [];

  for (const inp of INPUTS) {
    const abs = join(fixturesDir, inp.name);
    if (!existsSync(abs)) { problems.push(inp.role + ": missing tracked fixture " + inp.name); continue; }
    const buf = readFileSync(abs);
    const got = sha(buf);
    if (buf.length !== inp.bytes) problems.push(inp.role + ": " + buf.length + " B, expected " + inp.bytes);
    if (got !== inp.sha256) problems.push(inp.role + ": sha " + got + ", expected " + inp.sha256);
    const png = validatePngHeader(buf, inp.role);
    for (const p of png.problems) problems.push(p);
    files.push({ ...inp, abs, actualBytes: buf.length, actualSha256: got, header: png.header,
      ok: buf.length === inp.bytes && got === inp.sha256 && png.ok, buf });
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
    if (!ex.ok) {
      problems.push("prompt extraction: " + ex.why);
    } else {
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

  return { ok: problems.length === 0, problems, files, prompt, promptMeta, decisions,
    claimLocation: resolved, claim, keyPresent, paths, fixturesDir };
}

/** The exact request configuration, serialised deterministically. Contains no secret. */
export function requestConfig(pf) {
  const files = pf && Array.isArray(pf.files) ? pf.files : [];
  return {
    tool: "openai-refine-northstar-d", contract: "D-121",
    kind: "refinement / edit of the existing candidate — NOT a new character",
    endpoint: ENDPOINT, endpointType: "images.edits (multi-image edit, NO mask)",
    model: MODEL,
    parameters: { n: N, quality: QUALITY, size: SIZE, output_format: OUTPUT_FORMAT, background: BACKGROUND },
    omitted: { mask: "never sent — D-121 §4", input_fidelity: "never sent — gpt-image-2 rejects it (invalid_input_fidelity_model)" },
    policy: { retry: RETRY, fallbackModel: FALLBACK_MODEL, automaticPromptModification: AUTO_PROMPT_EDIT, requests: 1,
      failClosed: "D-122 §8 — the claim is created before the call, OUTSIDE the repository, and never cleared automatically" },
    expectedOutput: { format: OUTPUT_FORMAT, dimensions: SIZE, background: BACKGROUND,
      bitDepth: EXPECT_BIT_DEPTH, colourType: EXPECT_COLOUR_TYPE },
    inputSource: "tracked fixtures only — tools/avatar/fixtures/northstar-d-refinement/",
    inputs: files.map((f) => ({ role: f.role, file: f.name, decision: f.decision, purpose: f.purpose,
      bytes: f.actualBytes, sha256: f.actualSha256,
      png: f.header ? { width: f.header.width, height: f.header.height, bitDepth: f.header.bitDepth, colourType: f.header.colourType } : null })),
    prompt: (pf && pf.promptMeta) || null,
  };
}

/**
 * Assembles the multipart body and runs the hard guards.
 * Exported so the guards can be exercised by a test WITHOUT spending the one authorised request —
 * a guard that can only run on the paid path is a guard nobody has ever seen work.
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
  if (images.length !== INPUTS.length) throw new Error("expected " + INPUTS.length + " images in the body, found " + images.length);
  for (let i = 0; i < images.length; i++) {
    if (images[i].name !== INPUTS[i].name) {
      throw new Error("image order broken at position " + i + ": " + images[i].name + " != " + INPUTS[i].name);
    }
  }
  if (fd.get("model") !== MODEL) throw new Error("model is not the pinned snapshot");
  if (fd.get("n") !== "1") throw new Error("n must be 1");
  if (fd.get("size") !== SIZE) throw new Error("size is not the pinned size");
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
 * the real global fetch. claimPath is injected ONLY by tests, so no real run can be redirected: the
 * CLI never passes one and there is no flag that could. There is exactly one call site, no loop
 * around it and no catch that resends. It returns a result instead of throwing, so every outcome is
 * explicit and recorded.
 *
 * The order is deliberate and is the whole safety argument:
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

  // 1. everything verifiable, before anything is spent
  if (!pf || !pf.ok) return fail("preflight", "preflight did not pass");
  if (typeof fetchImpl !== "function") return fail("preflight", "no fetch implementation was provided");
  if (typeof apiKey !== "string" || apiKey.length === 0) return fail("key", "the API key is not set");
  for (const p of [paths.raw, paths.manifest]) {
    if (existsSync(p)) return fail("output-exists", "output already exists, refusing to overwrite: " + p);
  }

  // 2. assemble the whole body BEFORE claiming: an assembly failure has not spent anything.
  let fd;
  try { fd = buildBody(pf); } catch (e) { return fail("body", e && e.message ? e.message : String(e)); }

  // 3. resolve and validate the global per-user claim location.
  const resolved = Object.prototype.hasOwnProperty.call(o, "claimPath")
    ? { ok: typeof o.claimPath === "string" && o.claimPath !== "", path: o.claimPath,
        scope: "injected-by-caller", why: "no claim path was provided" }
    : resolveClaimPath({ repoRoot: REPO });
  if (!resolved.ok) return fail("claim-location", resolved.why);
  const claimPath = resolved.path;
  if (existsSync(claimPath)) return fail("claim-exists", "the mandate is already spent: " + claimPath);

  const cfg = requestConfig(pf);
  const startedAt = new Date().toISOString();

  // 4-6. only the claim's parent directory, then the exclusive create, then the content.
  let claim;
  try {
    claim = createClaim({
      endpoint: ENDPOINT, model: MODEL, parameters: cfg.parameters,
      adapterSha256: adapterSelfSha(),
      promptSha256: cfg.prompt ? cfg.prompt.promptSha256 : null,
      inputs: cfg.inputs.map((i) => ({ role: i.role, file: i.file, bytes: i.bytes, sha256: i.sha256 })),
      startedAt,
    }, claimPath);
  } catch (e) {
    return fail("claim", "could not create the exclusive claim at " + claimPath + ": " + (e && e.message ? e.message : String(e)));
  }

  const manifest = {
    tool: "openai-refine-northstar-d", contract: "D-121", kind: cfg.kind, startedAt,
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

  // 7. EXACTLY ONE fetch. There is no loop, and no catch that retries.
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

  // Persist the raw bytes, atomically, before anything else is done with them (D-113).
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
  const SENDCMD = "node tools/avatar/openai-refine-northstar-d.mjs --send " + OWNER_APPROVAL_FLAG;

  console.log("D-121 refinement adapter — " + ENDPOINT);
  console.log("  model          : " + MODEL);
  console.log("  parameters     : n=" + N + " quality=" + QUALITY + " size=" + SIZE +
    " output_format=" + OUTPUT_FORMAT + " background=" + BACKGROUND);
  console.log("  never sent     : " + FORBIDDEN_FIELDS.join(", "));
  console.log("  retry/fallback : none        automatic prompt modification: " + AUTO_PROMPT_EDIT);
  console.log("  input source   : TRACKED FIXTURES ONLY — tools/avatar/fixtures/northstar-d-refinement/");
  console.log("                   nothing is read from tools/avatar/build/\n");

  const pf = preflight();

  console.log("  the four inputs, in D-121's binding order:");
  for (const inp of INPUTS) {
    const f = pf.files.find((x) => x.role === inp.role);
    const mark = f ? (f.ok ? "OK " : "BAD") : "MISSING";
    const size = f ? String(f.actualBytes).padStart(9) + " B" : "".padStart(11);
    const hash = f ? f.actualSha256.slice(0, 16) + "…" : "";
    const png = f && f.header ? f.header.width + "x" + f.header.height + " depth " + f.header.bitDepth + " colourtype " + f.header.colourType : "";
    console.log("    " + inp.role + "  " + mark + "  " + size + "  " + hash + "  " + png);
    console.log("            tracked fixture: " + inp.name + "   [" + inp.decision + "]");
    console.log("            " + inp.purpose);
  }
  if (pf.promptMeta) {
    console.log("\n  prompt file    : " + pf.promptMeta.fileBytes + " B  " + pf.promptMeta.fileSha256 + "   [D-121, tracked]");
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
    console.log("                   both clones of " + REPO_IDENTITY + " resolve here, and git cannot reach it");
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
  console.log("  all four inputs and the prompt were read from TRACKED FIXTURES — reproducible on a fresh clone.");

  if (!send || !approved) {
    console.log("\n  DRY RUN. NOTHING WAS SENT. No directory, no claim, no output and no manifest were written.");
    console.log("  D-121 authorises exactly ONE request, and it is UNSPENT. To spend it, run with BOTH flags:");
    console.log("    " + SENDCMD);
    process.exit(0);
  }

  const result = await performSingleRequest({ pf, fetchImpl: fetch, apiKey: process.env.OPENAI_API_KEY, outDir: OUT });
  if (result.claimCreated) {
    console.log("\n  claim created  : " + result.claimPath);
    console.log("  THE MANDATE IS NOW SPENT — on any outcome, including a crash or a timeout.");
  }
  if (!result.ok) {
    console.error("\n  STOPPED at stage '" + result.stage + "': " + result.reason);
    if (result.manifestPath) console.error("  Manifest: " + result.manifestPath);
    console.error("  No retry, no fallback. The claim stays in place; a further attempt needs a new owner decision.");
    process.exit(1);
  }
  console.log("\n  raw result     : " + result.rawPath);
  console.log("  bytes / sha256 : " + result.verification.bytes + " / " + result.verification.sha256);
  console.log("  dimensions     : " + result.verification.png.width + "x" + result.verification.png.height +
    "  depth " + result.verification.png.bitDepth + "  colourtype " + result.verification.png.colourType + "  OK");
  console.log("\n  STOPPED. The result is review material, not an asset.");
  console.log("  No cleanup, no retouching, no promotion, no commit, no production effect.");
  console.log("  The full D-121 §9 post-check is run separately.");
  console.log("  Manifest: " + result.manifestPath);
}