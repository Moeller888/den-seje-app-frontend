// NORTHSTAR ITEM METHOD — THE SEND ADAPTER FOR THE D-218 MASKED-EDIT EXPERIMENT. PER CALL: ONE CLAIM, ONE DISPATCH RECORD, ONE FETCH.
//
// D-218 (owner GO) authorises EXACTLY THREE image calls: M-1 the plum skirt, M-2 the brown sandals, M-3 the white sneakers
// (control). Each call is D-207's request for that item — images/edits, gpt-image-2.5-sunburst-2026-09-08, 1024x1536, high,
// n 1, png, transparent; ONE image, C's raw image (sha256 10f4a4b9…, read from OUTSIDE both clones and verified by its hash); the
// item's frozen D-207 prompt from item-pilot-prompts-v1.json, unchanged — plus ONE new field, the MASK: the D-218 API mask of the
// item's category (regionsC().apiEdit: alpha 0 exactly on the edit region, opaque elsewhere), read from outside both clones,
// verified by its pinned hash, its PNG format (8-bit RGBA, 1024x1536, under 4 MB) and its exact count of transparent pixels. The
// mask is the experiment's only intended variable. OpenAI: the mask applies to the FIRST input image and is GUIDANCE ONLY
// ("may not follow its exact shape"); it preserves nothing — C is preserved by the local composition afterwards.
//
// THE BUDGET IS STRUCTURAL: three call ids, each a one-shot claim; a claim consumed on any outcome (also an undetermined dispatch)
// is spent and never repeated; at most three claims of the experiment, ever. No reserve, no variant.
// THE OUTPUT IS STORED OUTSIDE BOTH CLONES (D-127 §2): <Documents>/DenSejeApp-artefacts/d-218-mask-experiment/<call id>/.
//
// Every check runs inside main(), before the claim (D-142): arguments; git (HEAD = origin/main); every tracked input as an
// origin/main blob equal to the working tree; the frozen prompts; C; the mask; the register (D-218's status code holds the
// authorisation token); the authorisation file (this entry UNSPENT, every pin); the claim register; the outputs; the multipart
// body. A dry run stops there. Then: refs again, the key (presence only), the exclusive claim, the dispatch record, exactly one
// fetch with redirect "error".
//
// Usage (after D-218's authorisation is merged; the owner's D-218 GO message is the execution instruction):
//   node tools/avatar/openai-send-northstar-mask-d218.mjs --call-id=D-218-mask-M-1 --claim-identity=D-218-mask-M-1-claim   dry run
//   … the same plus --send --owner-approval=D-218                                                                   THE ONE SEND
import { readFileSync, writeFileSync, renameSync, mkdirSync, lstatSync, realpathSync, readdirSync,
  openSync, writeSync, fsyncSync, closeSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { inflateSync } from "node:zlib";
import { join, dirname, relative, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, tmpdir } from "node:os";
import { formatEvent, deriveAttempt } from "./r3-face-neutral-attempt-ledger.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");

// ── identity (inactive until D-199 is merged; each send needs a separate owner instruction) ─────────────────────────
const TOOL = "openai-send-northstar-mask-d218";
const ADAPTER_PATH = "tools/avatar/openai-send-northstar-mask-d218.mjs";
const DECISION = "D-218";
const IMPLEMENTATION_STATUS = "IMPLEMENTED — NOT EXECUTED";
const REQUIRED_DECISIONS = Object.freeze(["D-127", "D-205", "D-207", "D-218"]);
// the three cases of D-218's plan: case → item → category (the mask's category)
const CASES = Object.freeze({ "M-1": { item: "bottom-skirt-plum", category: "bottom" }, "M-2": { item: "shoes-sandals-brown", category: "shoes" }, "M-3": { item: "shoes-sneakers-white", category: "shoes" } });
const ITEMS = Object.freeze(Object.values(CASES).map((c) => c.item));
const CALL_IDS = Object.freeze(Object.keys(CASES).map((k) => "D-218-mask-" + k));
const MAX_CALLS = 3;
const AUTH_TOKEN = "D-218 MASK EXPERIMENT: 3 CALLS AUTHORISED";
const OWNER_APPROVAL_FLAG = "--owner-approval=D-218";
const callOf = (id) => ({ callId: id, claimIdentity: id + "-claim", claimFile: id + ".claim.json", eventsFile: id + ".events.jsonl", approvalFlag: OWNER_APPROVAL_FLAG });

// ── the request (the same for A and B) ──────────────────────────────────────────────────────────────────────────────
const ENDPOINT = "https://api.openai.com/v1/images/edits";
const MODEL = "gpt-image-2.5-sunburst-2026-09-08";
const PARAMETERS = Object.freeze({ size: "1024x1536", quality: "high", n: 1, output_format: "png", background: "transparent" });
const FIELD_ORDER = Object.freeze(["model", "image[]", "mask", "prompt", "size", "quality", "n", "output_format", "background"]);
const NEVER_SENT_FIELDS = Object.freeze(["input_fidelity", "output_compression", "response_format", "moderation"]);
const MASK_MAX_BYTES = 4 * 1024 * 1024;   // well under the API limit for an edit image and mask
const IMAGE_FIELD = "image[]";
const W = 1024;
const H = 1536;

// ── tracked inputs, read from origin/main ───────────────────────────────────────────────────────────────────────────
const TRACKED = Object.freeze({
  adapter: ADAPTER_PATH,
  ledger: "tools/avatar/r3-face-neutral-attempt-ledger.mjs",
  register: "docs/project-state.md",
  calls: "tools/avatar/fixtures/northstar-wardrobe/mask-experiment-calls-v1.json",
  plan: "tools/avatar/fixtures/northstar-wardrobe/mask-experiment-plan-v1.json",
  prompts: "tools/avatar/fixtures/northstar-wardrobe/item-pilot-prompts-v1.json",
  freeze: "tools/avatar/fixtures/northstar-wardrobe/base-figure-c-v1.json",
  processor: "tools/avatar/northstar-item-pilot.mjs",
});
const C_IMAGE = Object.freeze({ role: "Image 1", name: "d202-base-figure-v2.image-1.png", bytes: 1300423,
  sha256: "10f4a4b9baf9886e8f230e09b2ab4e69bfebd6795c2a1222eb84f8db3884e818" });
const PROMPTS_SHA256 = "a23dbedd9e3d76435dc0abe50930da9225a67c49dfa910da9d5d5741b6a472ce";

// ── claim register and outputs (outside every clone) ────────────────────────────────────────────────────────────────
const REPO_IDENTITY = "Moeller888-den-seje-app-frontend";
const OUT_DISPLAY = "<Documents>/DenSejeApp-artefacts/d-218-mask-experiment";
const OUT_PREFIX = "d218.";

const sha = (b) => createHash("sha256").update(b).digest("hex");
const errText = (e) => (e && e.message ? e.message : String(e));
const abs = (rel) => join(REPO, ...rel.split("/"));

function isInside(child, parent) {
  if (typeof child !== "string" || typeof parent !== "string" || child === "" || parent === "") return false;
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
function pathExists(p) { try { lstatSync(p); return true; } catch (_) { return false; } }

// ── git, read-only, against THIS repository only; nothing here touches the network ──────────────────────────────────
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
function rgbaMasterProblems(buf, label) {
  const h = pngHeader(buf);
  if (!h) return [label + ": not a PNG"];
  const problems = [];
  if (h.width !== W || h.height !== H) problems.push(`${label}: ${h.width}x${h.height}, expected ${W}x${H}`);
  if (h.bitDepth !== 8 || h.colourType !== 6 || h.interlace !== 0) problems.push(`${label}: bit depth ${h.bitDepth}, colour type ${h.colourType}, interlace ${h.interlace}; expected 8-bit RGBA, not interlaced`);
  return problems;
}
/** The receipt check: the PNG header AND its image data inflate to exactly 1024x1536 RGBA rows. Nothing is decoded further. */
function receiptProblems(buf) {
  const problems = rgbaMasterProblems(buf, "the returned image");
  if (problems.length) return problems;
  const idat = []; let p = 8;
  while (p + 12 <= buf.length) { const len = buf.readUInt32BE(p), type = buf.toString("ascii", p + 4, p + 8); if (p + 12 + len > buf.length) return ["the returned image: truncated chunk " + type]; if (type === "IDAT") idat.push(buf.subarray(p + 8, p + 8 + len)); if (type === "IEND") break; p += 12 + len; }
  let raw; try { raw = inflateSync(Buffer.concat(idat)); } catch (_) { return ["the returned image: its image data does not inflate"]; }
  if (raw.length !== H * (W * 4 + 1)) return ["the returned image: " + raw.length + " bytes of image data, expected " + H * (W * 4 + 1)];
  return [];
}

/** The frozen prompts, on the origin/main blob: the file pin, then the prompt of the item this call sends. */
function verifyPrompts(blobs) {
  const problems = [];
  if (sha(blobs.prompts) !== PROMPTS_SHA256) return { ok: false, problems: ["item-pilot-prompts-v1.json: " + sha(blobs.prompts) + ", expected the frozen " + PROMPTS_SHA256] };
  let p; try { p = JSON.parse(blobs.prompts.toString("utf8")); } catch (_) { return { ok: false, problems: ["the frozen prompts are not JSON"] }; }
  for (const id of ITEMS) { const e = p && p.items && p.items[id]; if (!e || typeof e.prompt !== "string" || sha(Buffer.from(e.prompt, "utf8")) !== e.sha256) problems.push("the frozen prompt of " + id + " is missing or does not match its own sha256"); }
  const f = JSON.parse(blobs.freeze.toString("utf8"));
  if (!f || !f.raw || f.raw.sha256 !== C_IMAGE.sha256 || f.raw.bytes !== C_IMAGE.bytes) problems.push("the frozen record of C (base-figure-c-v1.json) does not name C's pinned bytes");
  return { ok: problems.length === 0, problems, prompts: p };
}

/** C, read from OUTSIDE both clones and verified byte for byte. There is no override of its location. */
function readC() {
  const home = homedir();
  if (typeof home !== "string" || home.trim() === "") return { ok: false, problems: ["no home directory; there is no fallback"] };
  const file = resolve(home, "Documents", "DenSejeApp-artefacts", "d-202-northstar-base-figure", C_IMAGE.name);
  if (isInside(file, REPO)) return { ok: false, problems: ["C resolves inside the repository"] };
  let buf; try { buf = readFileSync(file); } catch (e) { return { ok: false, problems: ["C is not readable at <Documents>/DenSejeApp-artefacts/d-202-northstar-base-figure/" + C_IMAGE.name] }; }
  const problems = [];
  if (buf.length !== C_IMAGE.bytes || sha(buf) !== C_IMAGE.sha256) problems.push("C: " + buf.length + " B " + sha(buf) + ", expected " + C_IMAGE.bytes + " B " + C_IMAGE.sha256);
  problems.push(...rgbaMasterProblems(buf, "C"));
  return { ok: problems.length === 0, problems, buf };
}

/** D-218: the case's API mask, read from OUTSIDE both clones (it is derived from C) and verified: its pinned hash and size, an
 *  8-bit RGBA 1024x1536 PNG (the size of the first input image), under MASK_MAX_BYTES, every pixel either fully transparent or
 *  fully opaque, and exactly the pinned number of transparent pixels (the edit region). No override of its location. */
function readMask(pin, category) {
  const home = homedir();
  if (typeof home !== "string" || home.trim() === "") return { ok: false, problems: ["no home directory; there is no fallback"] };
  const name = "api-mask-" + category + ".png", file = resolve(home, "Documents", "DenSejeApp-artefacts", "d-218-mask-experiment", "masks", pin.dir, name);
  if (isInside(file, REPO)) return { ok: false, problems: ["the mask resolves inside the repository"] };
  let buf; try { buf = readFileSync(file); } catch (_) { return { ok: false, problems: ["the mask is not readable at <Documents>/DenSejeApp-artefacts/d-218-mask-experiment/masks/" + pin.dir + "/" + name] }; }
  const problems = [];
  if (buf.length !== pin.bytes || sha(buf) !== pin.sha256) problems.push("the mask: " + buf.length + " B " + sha(buf) + ", expected " + pin.bytes + " B " + pin.sha256);
  if (buf.length >= MASK_MAX_BYTES) problems.push("the mask is " + buf.length + " B, not under " + MASK_MAX_BYTES);
  problems.push(...rgbaMasterProblems(buf, "the mask"));
  if (!problems.length) {
    const idat = []; let p = 8; while (p + 12 <= buf.length) { const len = buf.readUInt32BE(p), type = buf.toString("ascii", p + 4, p + 8); if (type === "IDAT") idat.push(buf.subarray(p + 8, p + 8 + len)); if (type === "IEND") break; p += 12 + len; }
    let raw = null; try { raw = inflateSync(Buffer.concat(idat)); } catch (_) { problems.push("the mask's image data does not inflate"); }
    if (raw && raw.length === H * (W * 4 + 1)) {
      // undo the PNG row filters to read the alpha of every pixel exactly
      const row = W * 4, prev = Buffer.alloc(row), cur = Buffer.alloc(row); let clear = 0, partial = 0;
      for (let y = 0; y < H; y++) { const f = raw[y * (row + 1)], o = y * (row + 1) + 1;
        for (let x = 0; x < row; x++) { const a = x >= 4 ? cur[x - 4] : 0, b = prev[x], c = x >= 4 ? prev[x - 4] : 0, v = raw[o + x];
          let pr = 0; if (f === 0) pr = 0; else if (f === 1) pr = a; else if (f === 2) pr = b; else if (f === 3) pr = (a + b) >> 1; else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; } else { problems.push("the mask uses an unknown PNG filter"); break; }
          cur[x] = (v + pr) & 255; }
        for (let x = 3; x < row; x += 4) { if (cur[x] === 0) clear++; else if (cur[x] !== 255) partial++; }
        cur.copy(prev); }
      if (partial) problems.push("the mask has " + partial + " partly transparent pixels; it must be binary");
      if (clear !== pin.editPx) problems.push("the mask has " + clear + " transparent pixels, expected the pinned edit region of " + pin.editPx);
    } else if (raw) problems.push("the mask's image data has the wrong length");
  }
  return { ok: problems.length === 0, problems, buf, name };
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
  if (row) for (const needle of [...CALL_IDS, OWNER_APPROVAL_FLAG, MODEL, ADAPTER_PATH, C_IMAGE.sha256, PROMPTS_SHA256, PARAMETERS.size]) if (!row.includes(needle)) problems.push("the origin/main " + DECISION + " row does not carry " + needle);
  // the authorisation is an exact segment of D-218's status code — never a word anywhere in the row
  const m = row ? row.match(/Status \*\*`([^`]+)`\*\*/) : null;
  if (!m || !m[1].split(" — ").map((x) => x.trim()).includes(AUTH_TOKEN)) problems.push("the origin/main " + DECISION + " status code does not hold " + AUTH_TOKEN);
  return { ok: problems.length === 0, problems, lines };
}

function parseJson(buf, what) {
  let c;
  try { c = JSON.parse(buf.toString("utf8")); } catch (_) { return { ok: false, problems: ["the origin/main " + what + " is not valid JSON"] }; }
  if (c === null || typeof c !== "object" || Array.isArray(c)) return { ok: false, problems: ["the origin/main " + what + " is not an object"] };
  return { ok: true, value: c };
}

const get = (o, ...keys) => keys.reduce((v, k) => (v !== null && typeof v === "object" ? v[k] : undefined), o);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The authorisation, from the origin/main file only: the batch, the budget, this entry and — for stage 2 or a reserve — the
 *  recorded decision that opened it. */
function verifyAuthorisation(c, call, registerLines, prompts, plan) {
  const problems = [];
  const eq = (path, got, want) => { if (!same(got, want)) problems.push(`${path}: ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`); };
  if (c.decision !== DECISION) problems.push("the authorisation file is not D-218's");
  if (get(c, "meta", "authorisesImageRequest") !== false) problems.push("meta.authorisesImageRequest must stay false; authorisation is never a general boolean");
  eq("budget.authorised", get(c, "budget", "authorised"), MAX_CALLS); eq("budget.reserve", get(c, "budget", "reserve"), 0);
  eq("request.endpoint", get(c, "request", "endpoint"), ENDPOINT); eq("request.model", get(c, "request", "model"), MODEL);
  eq("request.parameters", get(c, "request", "parameters"), PARAMETERS); eq("request.fieldOrder", get(c, "request", "fieldOrder"), FIELD_ORDER); eq("request.neverSentFields", get(c, "request", "neverSentFields"), NEVER_SENT_FIELDS);
  eq("request.image.sha256", get(c, "request", "image", "sha256"), C_IMAGE.sha256); eq("request.image.bytes", get(c, "request", "image", "bytes"), C_IMAGE.bytes); eq("request.image.tracked", get(c, "request", "image", "tracked"), false);
  const calls = Array.isArray(c.calls) ? c.calls : [];
  eq("call ids", calls.map((e) => e && e.callId), CALL_IDS);
  const e = calls.find((x) => x && x.callId === call.callId);
  if (!e) return { ok: false, problems: [...problems, "no entry for " + call.callId] };
  eq("mandateState", e.mandateState, "UNSPENT"); eq("outcome", e.outcome, "NOT YET ATTEMPTED");
  for (const k of ["neverReuse", "notAnActivePermission", "closedBy", "recordedBy"]) if (k in e) problems.push("the entry carries " + k + "; it is not an active, unspent permission");
  eq("claim", e.claim, { identity: call.claimIdentity, filename: call.claimFile, eventsFilename: call.eventsFile });
  const kase = call.callId.replace("D-218-mask-", ""), want = CASES[kase];
  if (!want || e.case !== kase || e.item !== want.item || e.category !== want.category) problems.push("the entry's case, item or category does not match its call id");
  // the plan's case: the same item, the same frozen prompt and the same mask pin
  const pc = Array.isArray(get(plan, "cases")) ? plan.cases.find((x) => x && x.id === kase) : null;
  if (!pc) problems.push("the plan has no case " + kase);
  else { eq("plan item", pc.item, e.item); eq("plan prompt", get(pc, "prompt", "sha256"), get(e, "prompt", "sha256")); eq("plan mask sha256", get(pc, "mask", "sha256"), get(e, "mask", "sha256")); eq("plan mask bytes", get(pc, "mask", "bytes"), get(e, "mask", "bytes")); }
  if (e.item) { eq("prompt.item", get(e, "prompt", "item"), e.item); eq("prompt.sha256", get(e, "prompt", "sha256"), get(prompts, "items", e.item, "sha256")); }
  const pin = get(e, "mask"); if (!pin || typeof pin.sha256 !== "string" || typeof pin.bytes !== "number" || typeof pin.editPx !== "number" || typeof pin.dir !== "string") problems.push("the entry's mask pin is incomplete");
  return { ok: problems.length === 0, problems, item: e.item, category: e.category, mask: pin };
}

/** The implementation block (D-145: no adapter hash pinned). */
function verifyImplementation(c) {
  const problems = [], x = c.adapterImplementations || {};
  const eq = (path, got, want) => { if (got !== want) problems.push(`${path}: ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`); };
  eq("adapterImplementations.isAuthorisation", x.isAuthorisation, false); eq("adapterImplementations.adapter", x.adapter, ADAPTER_PATH);
  eq("adapterImplementations.ownerApprovalFlag", x.ownerApprovalFlag, OWNER_APPROVAL_FLAG); eq("adapterImplementations.mergeIsNotAnInstruction", x.mergeIsNotAnInstruction, true);
  eq("adapterImplementations.executionRequiresSeparateOwnerInstruction", x.executionRequiresSeparateOwnerInstruction, true);
  for (const k of Object.keys(x)) if (/sha-?256/i.test(k)) problems.push("no adapter SHA-256 is pinned (D-145)");
  return { ok: problems.length === 0, problems };
}

/** One claim and one event log per user and repository identity, outside every clone and outside temp. No override. */
function resolveClaimLocation(call) {
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
  return { ok: true, claim: join(dir, call.claimFile), events: join(dir, call.eventsFile),
    claimDisplay: "<claim register>/" + REPO_IDENTITY + "/" + call.claimFile, eventsDisplay: "<claim register>/" + REPO_IDENTITY + "/" + call.eventsFile };
}

/** The external output directory (D-127 §2): <home>/Documents/DenSejeApp-artefacts/d-218-mask-experiment/<call id>. */
function resolveOutputs(call) {
  const home = homedir();
  if (typeof home !== "string" || home.trim() === "") return { ok: false, why: "no home directory; there is no fallback" };
  const dir = resolve(home, "Documents", "DenSejeApp-artefacts", "d-218-mask-experiment", call.callId);
  if (isInside(dir, REPO)) return { ok: false, why: "the output directory resolves inside the repository (D-127 §2 forbids it)" };
  if (isInside(dir, resolve(tmpdir()))) return { ok: false, why: "the output directory resolves inside the temp directory" };
  const p = OUT_PREFIX, display = OUT_DISPLAY + "/" + call.callId + "/";
  let occupied = [];
  if (pathExists(dir)) {
    try { occupied = readdirSync(dir).filter((n) => n.startsWith(p)).map((n) => display + n); }
    catch (e) { return { ok: false, why: "the output directory cannot be listed: " + errText(e) }; }
  }
  const file = (n) => join(dir, p + n);
  return { ok: true, dir, occupied, display, response: file("response.json"), manifest: file("request.json"), receipt: file("receipt.json"), image: (k) => file("image-" + k + ".png"),
    show: (n) => display + p + n };
}

/** The batch's consumed claims, read from the shared claim register (each one is spent budget, whatever its outcome). */
function consumedClaims(loc) { const dir = dirname(loc.claim); return CALL_IDS.filter((id) => pathExists(join(dir, id + ".claim.json"))); }

function buildBody(cBuf, maskBuf, maskName, prompt) {
  const fd = new FormData();
  fd.append("model", MODEL);
  fd.append(IMAGE_FIELD, new File([cBuf], C_IMAGE.name, { type: "image/png" }));
  fd.append("mask", new File([maskBuf], maskName, { type: "image/png" }));   // applies to the FIRST (and only) image
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
  if (images.length !== 1 || images[0].name !== C_IMAGE.name) problems.push("the body must carry exactly one image, C");
  if (fd.getAll("mask").length !== 1 || fd.get("mask").name !== maskName) problems.push("the body must carry exactly one mask, the case's");
  if (fd.get("prompt") !== prompt) problems.push("the prompt in the body is not the verified frozen prompt");
  if (fd.getAll("size").length !== 1 || fd.get("size") !== "1024x1536") problems.push("the body does not carry exactly size 1024x1536");
  if (fd.getAll("background").length !== 1 || fd.get("background") !== "transparent") problems.push("the body does not carry exactly background transparent");
  return { ok: problems.length === 0, problems, body: fd };
}

function createClaim(file, call, record) {
  mkdirSync(dirname(file), { recursive: true });
  const fd = openSync(file, "wx");                 // the mandate is SPENT from this line onwards
  const payload = {
    contract: DECISION, callId: call.callId, claimIdentity: call.claimIdentity, repository: REPO_IDENTITY, mandate: "SPENT",
    semantics: "Existence alone means the claim is consumed and the mandate is spent. A consumed claim is NOT a dispatch: "
      + "the dispatch is recorded separately in " + call.eventsFile + ". Never deleted, renamed, reset, overwritten or restored. "
      + "No outcome permits an automatic retry; the D-218 experiment has no reserve.",
    claimedAt: new Date().toISOString(), pid: process.pid, ...record,
  };
  let contentWritten = true, contentError = null;
  try { writeSync(fd, JSON.stringify(payload, null, 2), 0, "utf8"); fsyncSync(fd); }
  catch (e) { contentWritten = false; contentError = errText(e); }
  finally { try { closeSync(fd); } catch (_) { /* the file exists either way */ } }
  return { claimedAt: payload.claimedAt, contentWritten, contentError };
}

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
  const call = seen.callId.length === 1 && CALL_IDS.includes(seen.callId[0]) ? callOf(seen.callId[0]) : null;
  if (!call) problems.push("--call-id must be one of the three D-218 call ids");
  else {
    if (seen.claimIdentity.length !== 1 || seen.claimIdentity[0] !== call.claimIdentity) problems.push("--claim-identity must be exactly " + call.claimIdentity);
    if (seen.approval.length === 1 && seen.approval[0] !== call.approvalFlag) problems.push("wrong owner approval: " + JSON.stringify(seen.approval[0]));
    if (seen.send === 1 && seen.approval.length === 0) problems.push("--send requires " + call.approvalFlag);
    if (seen.send === 0 && seen.approval.length === 1) problems.push("--owner-approval without --send does nothing and is refused");
  }
  return { ok: problems.length === 0, problems, call, sendMode: !!call && seen.send === 1 && seen.approval[0] === call.approvalFlag };
}

function refuse(stage, problems) {
  console.error("\n  REFUSED [" + stage + "] — no claim was created and no request was sent.");
  for (const p of problems) console.error("    · " + p);
  return 1;
}

// ── the one function that can fetch. Not exported. ───────────────────────────────────────────────────────────────
async function main(argv) {
  console.log("Northstar item method — masked-edit one-shot send adapter (D-218)");
  console.log("  endpoint : " + ENDPOINT + "   model " + MODEL);

  const args = parseArgs(argv);
  if (!args.ok) return refuse("arguments", args.problems);
  const call = args.call;
  console.log("  call     : " + call.callId);
  console.log("  mode     : " + (args.sendMode ? "SEND (one request, on a separate explicit owner instruction)" : "DRY RUN (read-only)"));

  const refs = resolveRefs();
  if (!refs.ok) return refuse(refs.stage, refs.problems);
  console.log("  origin/main : " + refs.originSha + "   HEAD " + (refs.headRef || "detached") + " = origin/main");

  const origin = readOriginBlobs(refs.originSha);
  if (!origin.ok) return refuse(origin.stage, origin.problems);
  const blobs = origin.blobs;

  const pins = verifyPrompts(blobs);
  if (!pins.ok) return refuse("pins", pins.problems);
  const cImg = readC();
  if (!cImg.ok) return refuse("reference-c", cImg.problems);
  const register = verifyRegister(blobs.register);
  if (!register.ok) return refuse("register", register.problems);
  const parsed = parseJson(blobs.calls, "authorisation file");
  if (!parsed.ok) return refuse("authorisation", parsed.problems);
  const plan = parseJson(blobs.plan, "experiment plan");
  if (!plan.ok) return refuse("authorisation", plan.problems);
  const auth = verifyAuthorisation(parsed.value, call, register.lines, pins.prompts, plan.value);
  if (!auth.ok) return refuse("authorisation", auth.problems);
  const impl = verifyImplementation(parsed.value);
  if (!impl.ok) return refuse("implementation", impl.problems);
  const prompt = pins.prompts.items[auth.item].prompt;
  console.log("  authorisation : one active, unspent " + call.callId + " entry (item " + auth.item + ") in origin/main");
  const mask = readMask(auth.mask, auth.category);
  if (!mask.ok) return refuse("mask", mask.problems);

  const loc = resolveClaimLocation(call);
  if (!loc.ok) return refuse("claim-location", [loc.why]);
  if (pathExists(loc.claim)) return refuse("claim-exists", ["the mandate is already spent: " + loc.claimDisplay]);
  if (pathExists(loc.events)) return refuse("events-exist", ["an event log already exists for this call: " + loc.eventsDisplay]);
  const spent = consumedClaims(loc);
  if (spent.length >= MAX_CALLS) return refuse("budget", ["the experiment's " + MAX_CALLS + " calls are spent"]);
  console.log("  budget   : " + spent.length + " of " + MAX_CALLS + " claims consumed before this call");
  const out = resolveOutputs(call);
  if (!out.ok) return refuse("output-location", [out.why]);
  if (out.occupied.length) return refuse("outputs-not-empty", out.occupied.map((p) => "already exists: " + p));

  const built = buildBody(cImg.buf, mask.buf, mask.name, prompt);
  if (!built.ok) return refuse("body", built.problems);
  console.log("  inputs   : Image 1 C " + C_IMAGE.sha256 + " (the only image) · mask " + sha(mask.buf) + " (" + auth.mask.editPx + " px editable, on Image 1) · prompt " + sha(Buffer.from(prompt, "utf8")) + " · size " + PARAMETERS.size + " · background " + PARAMETERS.background);

  if (!args.sendMode) {
    console.log("  claim    : " + loc.claimDisplay + "   (does not exist)");
    console.log("  outputs  : " + out.display + "   (outside the repository; empty)");
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
    neverSentFields: NEVER_SENT_FIELDS, redirect: "error", inputOrder: [C_IMAGE.role],
    inputs: [{ role: C_IMAGE.role, name: C_IMAGE.name, source: "outside both clones, verified by hash", bytes: cImg.buf.length, sha256: sha(cImg.buf) }],
    prompt: { file: TRACKED.prompts, item: auth.item, source: "origin/main blob", bytes: Buffer.byteLength(prompt, "utf8"), sha256: sha(Buffer.from(prompt, "utf8")) },
    mask: { name: mask.name, category: auth.category, appliesTo: C_IMAGE.role + " (the first and only input image)", source: "outside both clones, verified by hash, format and edit-pixel count", bytes: mask.buf.length, sha256: sha(mask.buf), editPx: auth.mask.editPx, guidanceOnly: true },
  };
  const startedAt = new Date().toISOString();
  const manifest = {
    tool: TOOL, decision: DECISION, callId: call.callId, item: auth.item, claimIdentity: call.claimIdentity, startedAt, budgetConsumedBefore: spent.length,
    storage: "outside both clones (D-127 §2); never tracked, never under assets/, never published",
    authorisedBy: { originMainSha: refs.originSha, headSha: refs.headSha, adapterSha256,
      blobs: Object.entries(TRACKED).map(([k, rel]) => ({ path: rel, bytes: blobs[k].length, sha256: sha(blobs[k]) })) },
    claim: { location: loc.claimDisplay }, events: { location: loc.eventsDisplay }, request,
    response: null, images: null, receipt: null, outcome: null, accounting: null,
  };

  let fetches = 0;
  let seq = 0;
  let claim = null;
  const event = (name, fields, flag, fresh = false) => { seq += 1; appendEvent(loc.events, (fresh ? "\n" : "") + formatEvent(call.callId, seq, name, fields), flag); };
  const finish = (classification, stage, reason) => {
    console.log("\n  CLAIM: " + loc.claimDisplay + " — consumed; the mandate is spent on every outcome.");
    let claimPresent = false, eventsText = "";
    try { claimPresent = pathExists(loc.claim); eventsText = pathExists(loc.events) ? readFileSync(loc.events, "utf8") : ""; } catch (e) { manifest.events.readError = errText(e); }
    manifest.claim.claimedAt = claim ? claim.claimedAt : null;
    manifest.claim.contentWritten = claim ? claim.contentWritten : null;
    manifest.claim.contentError = claim ? claim.contentError : null;
    manifest.accounting = deriveAttempt({ claimPresent, eventsText, callId: call.callId });
    manifest.finishedAt = new Date().toISOString();
    manifest.outcome = { classification, stage, reason, mandate: "SPENT", automaticRetry: false, fetches,
      visuallyApproved: false, promoted: false, tracked: false, runtimeChanged: false };
    try { writeAtomic(out.manifest, JSON.stringify(manifest, null, 2) + "\n"); console.log("  manifest: " + out.show("request.json")); }
    catch (e) { console.error("  THE MANIFEST COULD NOT BE WRITTEN: " + errText(e) + " — read the claim and the event log."); return 3; }
    const a = manifest.accounting;
    console.log("  accounting: claim " + a.claimState + " · dispatch " + a.dispatch + " · result " + a.result + " · actuallySent " + a.actuallySent
      + " · dispatchUndetermined " + a.dispatchUndetermined + " · serverAnswered " + a.serverAnswered);
    console.log("  outcome : " + classification + " / " + stage + " — " + reason + "\n  NO RETRY. The image is not approved by anything here; the D-218 evidence and the owner's review come next (tools/avatar/northstar-item-pilot.mjs --evidence).");
    return stage === "done" ? 0 : 3;
  };

  // ── point of no return: the claim, the dispatch record, then at once the ONE fetch ──────────────────────────────
  try {
    claim = createClaim(loc.claim, call, { originMainSha: refs.originSha, adapterSha256, endpoint: ENDPOINT, model: MODEL, parameters: PARAMETERS,
      promptSha256: request.prompt.sha256, maskSha256: request.mask.sha256, inputs: request.inputs.map((i) => ({ role: i.role, name: i.name, sha256: i.sha256 })), startedAt });
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
    try { writeAtomic(out.response, bodyBuf); manifest.response.file = out.show("response.json"); } catch (e) { manifest.response.fileError = errText(e); }
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
      if (img) { rec.bytes = img.length; rec.sha256 = sha(img); try { writeAtomic(out.image(k + 1), img); rec.file = out.show("image-" + (k + 1) + ".png"); } catch (e) { rec.fileError = errText(e); } }
      images.push(rec);
    }
    manifest.images = { count: payload.data.length, requested: PARAMETERS.n, items: images };
    if (payload.data.length !== PARAMETERS.n) return finish("UNEXPECTED", "done", payload.data.length + " images returned for n = 1; all are kept, none is selected, no check is run");
    if (!images[0].decodable) return finish("UNEXPECTED", "done", "the single image is not strict base64; the raw response is kept");

    // Exactly one image: the RECEIPT check only (BF1's format part). BF1–BF15 follow with the merged checker.
    const problems = receiptProblems(Buffer.from(payload.data[0].b64_json, "base64"));
    const receipt = { tool: TOOL, callId: call.callId, image: { file: images[0].file || null, sha256: images[0].sha256 }, verdict: problems.length ? "TECHNICAL_REJECT" : "RECEIVED_FOR_BF_CHECK", problems,
      next: "node tools/avatar/northstar-item-pilot.mjs --evidence <the image> --item <id> --out <a new directory outside both clones>: the D-218 measures, then the owner's review",
      note: "A TECHNICAL_REJECT here means the image is not a 1024x1536 RGBA PNG; the image is kept unchanged. RECEIVED_FOR_BF_CHECK approves nothing." };
    try { writeAtomic(out.receipt, JSON.stringify(receipt, null, 2) + "\n"); } catch (e) { manifest.receiptFileError = errText(e); }
    manifest.receipt = { file: out.show("receipt.json"), verdict: receipt.verdict, problems };
    if (problems.length) return finish("TECHNICAL_REJECT", "done", "one image received and stored unchanged; not a 1024x1536 RGBA PNG: " + problems[0]);
    return finish("RECEIVED_FOR_BF_CHECK", "done", "one 1024x1536 RGBA image received and stored byte for byte outside the clones; extraction and fitCheck next — not an approval of anything");
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
