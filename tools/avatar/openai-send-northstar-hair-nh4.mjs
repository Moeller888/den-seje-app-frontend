// NORTHSTAR HAIR ON THE CLEAN HEAD, SOFT TEXTURE — THE SEND ADAPTER FOR NH-4 (D-371). ONE CLAIM, ONE DISPATCH RECORD, ONE FETCH PER INVOCATION.
// Derived from the NH-1B adapter: the one-shot machinery is unchanged; the identity, the plan (plan-nh4-v1.json), the three images and the
// one call are NH-4's. Every method file pinned in plan-nh4-v1.json must match its sha256 on origin/main before the claim.
//
// NH-4 (owner authorisation, recorded in D-371's status) allows EXACTLY ONE image call, NH-4-hair-soft-texture, after NH-1 and NH-1B (both
// spent and rejected). No earlier permission is reused; NH-2 and NH-3 stay paused and are never sent from here. The call is images/edits,
// gpt-image-2.5-sunburst-2026-09-08, 1024x1024, high, n 1, png, transparent, with THREE images in a fixed order: Image 1 = the clean head
// layer (the head the model edits), Image 2 = Northstar's head with its current hair (style), Image 3 = the guide (hair zone, hairline,
// keep-clear marks), all read from OUTSIDE both clones and verified by their pinned hash, size and format. The prompt is the plan's frozen
// text, checked against its pinned sha256. No mask, no input_fidelity.
//
// THE BUDGET IS STRUCTURAL: one call id, one one-shot claim; a claim consumed on any outcome is spent and never repeated. No retry, no
// reserve, no fallback. An uncertain dispatch is never resent. The output is stored OUTSIDE BOTH CLONES (D-127 §2):
// <Documents>/DenSejeApp-artefacts/hair-d371-calls/NH-4-hair-soft-texture/. The post-processing (northstar-hair-nh4-post.mjs: the grey
// hair lifted as its own layer on the fixed clean head, checks P1–P9) and the owner's visual review follow the receipt.
//
// Every check runs inside main(), before the claim (D-142). A dry run stops before the claim and reads no credential.
//
// Usage (after the NH-4 PR is merged; a separate owner instruction is the execution instruction for the send):
//   node tools/avatar/openai-send-northstar-hair-nh4.mjs --call-id=NH-4-hair-soft-texture --claim-identity=NH-4-hair-soft-texture-claim     dry run
//   … the same plus --send --owner-approval=D-371-NH-4                                                                                     ONE SEND
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

// ── identity (inactive until the NH-4 PR is merged; the send needs a separate owner instruction) ───────────────────
const TOOL = "openai-send-northstar-hair-nh4";
const ADAPTER_PATH = "tools/avatar/openai-send-northstar-hair-nh4.mjs";
const DECISION = "D-371";
const DECISION_FILE = "docs/decisions/D-371.md";
const IMPLEMENTATION_STATUS = "IMPLEMENTED — NOT EXECUTED";
const REQUIRED_LEGACY_DECISIONS = Object.freeze(["D-033", "D-034", "D-118", "D-119", "D-127", "D-142"]);
// the one call of plan-nh4-v1.json
const CALL_ID = "NH-4-hair-soft-texture";
const CALL_IDS = Object.freeze([CALL_ID]);
const STYLE = "short-soft";
const MAX_CALLS = 1;
const AUTH_TOKEN = "D-371 NH-4: 1 CALL AUTHORISED (SOFT TEXTURE, CLEAN HEAD)";
const OWNER_APPROVAL_FLAG = "--owner-approval=D-371-NH-4";
// D-371's own calls: NH-1 is spent, NH-2 and NH-3 stay paused and are never sent from here; NH-1B (its own file) is spent too
const D371_SPENT = "NH-1-hair-short", D371_PAUSED = Object.freeze(["NH-2-hair-curls", "NH-3-hair-sidepart"]), NH1B_SPENT = "NH-1B-hair-short-silhouette";
const STOP_FILE = "NH-STOP.json";
const callOf = (id) => ({ callId: id, claimIdentity: id + "-claim", claimFile: id + ".claim.json", eventsFile: id + ".events.jsonl", approvalFlag: OWNER_APPROVAL_FLAG });

// ── the request ────────────────────────────
const ENDPOINT = "https://api.openai.com/v1/images/edits";
const MODEL = "gpt-image-2.5-sunburst-2026-09-08";
const PARAMETERS = Object.freeze({ size: "1024x1024", quality: "high", n: 1, output_format: "png", background: "transparent" });
const FIELD_ORDER = Object.freeze(["model", "image[]", "image[]", "image[]", "prompt", "size", "quality", "n", "output_format", "background"]);
const NEVER_SENT_FIELDS = Object.freeze(["mask", "input_fidelity", "output_compression", "response_format", "moderation"]);
const IMAGE_FIELD = "image[]";
const W = 1024;
const H = 1024;

// ── tracked inputs, read from origin/main ───────────────────────────────────────────────────────────────────────────
// the locked method (pinned in plan-nh4-v1.json method.files): the D-371 template tool and what it uses, the template, and NH-4's zones,
// input images and post-processing
const METHOD_FILES = Object.freeze(["tools/avatar/northstar-hair-template-d371.mjs","tools/avatar/northstar-hair-polish-d368.mjs","tools/avatar/northstar-hair-trial-d368.mjs","tools/avatar/promote-r2-torso-asset.mjs","tools/avatar/r3-hair-tool-v2.mjs","tools/avatar/r3-northstar-figure.mjs","tools/avatar/r3-northstar-head.mjs","tools/avatar/r3-northstar-layers.mjs","tools/avatar/fixtures/northstar-hair-d371/template-v1.json","tools/avatar/northstar-hair-nh4-zones.mjs","tools/avatar/northstar-hair-nh4-inputs.mjs","tools/avatar/northstar-hair-nh4-post.mjs"]);
const TRACKED = Object.freeze({
  adapter: ADAPTER_PATH,
  ledger: "tools/avatar/r3-face-neutral-attempt-ledger.mjs",
  legacyRegister: "docs/project-state.md",
  decision: DECISION_FILE,
  trialDecision: "docs/decisions/D-368.md",
  calls: "tools/avatar/fixtures/northstar-hair-d371/authorisation-nh4-v1.json",
  plan: "tools/avatar/fixtures/northstar-hair-d371/plan-nh4-v1.json",
  d371Calls: "tools/avatar/fixtures/northstar-hair-d371/authorisation-v1.json",
  nh1bCalls: "tools/avatar/fixtures/northstar-hair-d371/authorisation-nh1b-v1.json",
  ...Object.fromEntries(METHOD_FILES.map((f) => ["method:" + f, f])),
});
const PLAN_SHA256 = "1fd0156e40afd40a0f30971008be0e143330a6a54710df7de9c7d8d3251ad2b0";
const PROMPT_SHA256 = "fe6dec6d09cc48e34fca86f99a4e0eacd950b2f75bb7db0d4019831c523c0fa8";
// the three images actually sent, in this order: Image 1 the clean head (edited), Image 2 style (D-371's), Image 3 the guide
// (northstar-hair-nh4-inputs.mjs)
const IMAGES = Object.freeze([
  { role: "Image 1", name: "northstar-nh4-clean-head-1024.png", bytes: 138046, sha256: "cbcaab315903622fd3babb1eebadfffde11f87d02c85fc1980e70205424092e8" },
  { role: "Image 2", name: "northstar-hair-reference-1024.png", bytes: 351957, sha256: "a75eb7af92153d6e1a620def0ac678330db942f8e2238fd7e451e3ef57e6c3ad" },
  { role: "Image 3", name: "northstar-nh4-guide-1024.png", bytes: 81908, sha256: "924806ac34252e51b9febdd57627ac2746d60d75fca772c6a9e382e88decbc6c" },
]);

// ── the stop rules: an earlier outcome that stops every later call ──────────────────────────────────────────────────
const STOP_RULES = Object.freeze([
  "one call: no retry, no reserve, no fallback, no other model",
  "uncertain dispatch: DISPATCHED_RESULT_UNKNOWN, NOT_DISPATCHED, RESPONSE_BODY_UNREADABLE, UNEXPECTED, or a claim without a written outcome — never resent",
  "any HTTP error, moderation block or format error ends the attempt with that outcome",
  "the executor's stop file NH-STOP.json",
  "NH-2 and NH-3 stay paused: this entry never authorises them",
]);

// ── claim register and outputs (outside every clone) ────────────────────────────────────────────────────────────────
const REPO_IDENTITY = "Moeller888-den-seje-app-frontend";
const OUT_DIR_NAME = "hair-d371-calls";
const OUT_DISPLAY = "<Documents>/DenSejeApp-artefacts/" + OUT_DIR_NAME;
const OUT_PREFIX = "nh.";

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
/** The receipt check: the PNG header AND its image data inflate to exactly 1024x1024 RGBA rows. Nothing is decoded further. */
function receiptProblems(buf) {
  const problems = rgbaMasterProblems(buf, "the returned image");
  if (problems.length) return problems;
  const idat = []; let p = 8;
  while (p + 12 <= buf.length) { const len = buf.readUInt32BE(p), type = buf.toString("ascii", p + 4, p + 8); if (p + 12 + len > buf.length) return ["the returned image: truncated chunk " + type]; if (type === "IDAT") idat.push(buf.subarray(p + 8, p + 8 + len)); if (type === "IEND") break; p += 12 + len; }
  let raw; try { raw = inflateSync(Buffer.concat(idat)); } catch (_) { return ["the returned image: its image data does not inflate"]; }
  if (raw.length !== H * (W * 4 + 1)) return ["the returned image: " + raw.length + " bytes of image data, expected " + H * (W * 4 + 1)];
  return [];
}

/** The frozen plan, on the origin/main blob: its pin, the call, the prompt text and its pinned sha256, nothing unresolved, the three images
 *  and the request exactly as pinned here, the locked method; the plan never authorises by itself. */
function verifyPrompts(blobs) {
  const problems = [];
  if (sha(blobs.plan) !== PLAN_SHA256) return { ok: false, problems: ["plan-nh4-v1.json: " + sha(blobs.plan) + ", expected the frozen " + PLAN_SHA256] };
  let plan; try { plan = JSON.parse(blobs.plan.toString("utf8")); } catch (_) { return { ok: false, problems: ["the frozen plan is not JSON"] }; }
  if (get(plan, "callId") !== CALL_ID) problems.push("the plan's call is not " + CALL_ID);
  const prompt = String(get(plan, "prompt", "text"));
  if (sha(Buffer.from(prompt, "utf8")) !== PROMPT_SHA256 || get(plan, "prompt", "sha256") !== PROMPT_SHA256) problems.push("the prompt is not the frozen " + PROMPT_SHA256);
  if (/[{}]|undefined|null|NaN|\$\{/.test(prompt)) problems.push("the prompt holds something unresolved");
  if (get(plan, "authorisesImageRequest") !== false) problems.push("the plan must never authorise by itself");
  if (get(plan, "request", "endpoint") !== ENDPOINT || get(plan, "request", "model") !== MODEL || !same(get(plan, "request", "parameters"), PARAMETERS)) problems.push("the plan's request is not the pinned endpoint, model and parameters");
  const imgs = get(plan, "request", "images") || [];
  if (imgs.length !== IMAGES.length || IMAGES.some((p, k) => !imgs[k] || imgs[k].role !== p.role || imgs[k].name !== p.name || imgs[k].bytes !== p.bytes || imgs[k].sha256 !== p.sha256 || imgs[k].tracked !== false)) problems.push("the plan does not name exactly the three pinned, untracked images, in order");
  if (!same(get(plan, "paused"), [...D371_PAUSED])) problems.push("the plan does not keep " + D371_PAUSED.join(" and ") + " paused");
  // the locked method: exactly METHOD_FILES, each origin/main blob equal to its pinned sha256 (a changed method is a new plan)
  const pins = get(plan, "method", "files") || {};
  if (!same(Object.keys(pins), [...METHOD_FILES])) problems.push("the plan's method.files are not exactly the locked method files");
  for (const f of METHOD_FILES) if (!blobs["method:" + f] || sha(blobs["method:" + f]) !== pins[f]) problems.push("the method file " + f + " on origin/main is not the pinned " + pins[f]);
  if (get(plan, "post", "tool") !== "tools/avatar/northstar-hair-nh4-post.mjs" || !(get(plan, "post", "inputs") || []).every((i) => i && i.tracked === false)) problems.push("the plan's post-processing is not NH-4's, or one of its inputs is tracked");
  return { ok: problems.length === 0, problems, prompt, plan };
}

/** NH-4: the three images, read from OUTSIDE both clones and verified: each pinned hash and size and an 8-bit RGBA 1024x1024 PNG whose
 *  image data inflates. No override of their location. */
function readImages() {
  const home = homedir();
  if (typeof home !== "string" || home.trim() === "") return { ok: false, problems: ["no home directory; there is no fallback"] };
  const problems = [], out = [];
  for (const pin of IMAGES) {
    const file = resolve(home, "Documents", "DenSejeApp-artefacts", OUT_DIR_NAME, "references", pin.name);
    if (isInside(file, REPO)) { problems.push(pin.role + " resolves inside the repository"); continue; }
    let buf; try { buf = readFileSync(file); } catch (_) { problems.push(pin.role + " is not readable at " + OUT_DISPLAY + "/references/" + pin.name); continue; }
    if (buf.length !== pin.bytes || sha(buf) !== pin.sha256) problems.push(pin.role + ": " + buf.length + " B " + sha(buf) + ", expected " + pin.bytes + " B " + pin.sha256);
    problems.push(...receiptProblems(buf).map((p) => p.replace("the returned image", pin.role)));
    out.push({ ...pin, buf });
  }
  return { ok: problems.length === 0, problems, images: out };
}

/** Front matter of a decision file (simple `key: value` lines between two `---`). */
function frontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (!m) return null;
  const fields = {};
  for (const line of m[1].split(/\r?\n/)) { const k = line.indexOf(":"); if (k > 0) fields[line.slice(0, k).trim()] = line.slice(k + 1).trim(); }
  return { fields, body: text.slice(m[0].length) };
}

/** The decisions, from origin/main only: the legacy rows, D-368's file (the hairstyle trial this continues), and D-371's own file — its
 *  status holds NH-4's authorisation token as an exact segment, and its body names every NH-4 pin. */
function verifyDecisions(blobs) {
  const problems = [];
  const lines = blobs.legacyRegister.toString("utf8").split("\n");
  for (const id of REQUIRED_LEGACY_DECISIONS) {
    const n = lines.filter((l) => l.startsWith("| **" + id + "** |")).length;
    if (n !== 1) problems.push(`${id} appears ${n} times in the origin/main legacy register; exactly 1 is required`);
  }
  if (lines.some((l) => l.startsWith("| **" + DECISION + "** |"))) problems.push(DECISION + " has a row in the frozen legacy table; it must be a decision file only (D-224)");
  const trial = frontMatter(blobs.trialDecision.toString("utf8"));
  if (!trial || trial.fields.d !== "D-368") problems.push("docs/decisions/D-368.md on origin/main is not D-368's decision file (the hairstyle trial)");
  const doc = frontMatter(blobs.decision.toString("utf8"));
  if (!doc || doc.fields.d !== DECISION) return { ok: false, problems: [...problems, DECISION_FILE + " on origin/main is not " + DECISION + "'s decision file"] };
  // the authorisation is an exact segment of D-371's status — never a word anywhere in the file
  if (!String(doc.fields.status || "").split(" — ").map((x) => x.trim()).includes(AUTH_TOKEN)) problems.push("the origin/main " + DECISION + " status does not hold " + AUTH_TOKEN);
  for (const needle of [CALL_ID, OWNER_APPROVAL_FLAG, MODEL, ADAPTER_PATH, PROMPT_SHA256, PLAN_SHA256, PARAMETERS.size, ...IMAGES.map((s) => s.sha256)])
    if (!doc.body.includes(needle)) problems.push("the origin/main " + DECISION + " decision does not carry " + needle);
  return { ok: problems.length === 0, problems };
}

function parseJson(buf, what) {
  let c;
  try { c = JSON.parse(buf.toString("utf8")); } catch (_) { return { ok: false, problems: ["the origin/main " + what + " is not valid JSON"] }; }
  if (c === null || typeof c !== "object" || Array.isArray(c)) return { ok: false, problems: ["the origin/main " + what + " is not an object"] };
  return { ok: true, value: c };
}

const get = (o, ...keys) => keys.reduce((v, k) => (v !== null && typeof v === "object" ? v[k] : undefined), o);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The authorisation, from the origin/main file only: the budget, the request, the frozen pins and the one entry; and D-371's own entries:
 *  NH-1 spent, NH-2 and NH-3 unspent and still waiting (afterShort not NO_COMMON_FAULT), and NH-1B spent — this adapter never touches them. */
function verifyAuthorisation(c, call, plan, d371, nh1b) {
  const problems = [];
  const eq = (path, got, want) => { if (!same(got, want)) problems.push(`${path}: ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`); };
  if (c.decision !== DECISION || c.callId !== CALL_ID) problems.push("the authorisation file is not NH-4's (D-371)");
  if (get(c, "meta", "authorisesImageRequest") !== false) problems.push("meta.authorisesImageRequest must stay false; authorisation is never a general boolean");
  eq("budget.authorised", get(c, "budget", "authorised"), MAX_CALLS); eq("budget.reserve", get(c, "budget", "reserve"), 0); eq("budget.retries", get(c, "budget", "retries"), 0);
  eq("budget.fallback", get(c, "budget", "fallback"), false); eq("budget.reusesEarlierPermissions", get(c, "budget", "reusesEarlierPermissions"), false); eq("budget.actuallySent", get(c, "budget", "actuallySent"), 0);
  eq("request.endpoint", get(c, "request", "endpoint"), ENDPOINT); eq("request.model", get(c, "request", "model"), MODEL);
  eq("request.parameters", get(c, "request", "parameters"), PARAMETERS); eq("request.fieldOrder", get(c, "request", "fieldOrder"), FIELD_ORDER); eq("request.neverSentFields", get(c, "request", "neverSentFields"), NEVER_SENT_FIELDS);
  eq("request.images", get(c, "request", "images"), IMAGES.map((p) => ({ ...p, tracked: false })));
  eq("frozen.plan", get(c, "frozen", "plan"), { file: TRACKED.plan, sha256: PLAN_SHA256 }); eq("frozen.methodFiles", get(c, "frozen", "methodFiles"), get(plan, "method", "files"));
  eq("stopRules", c.stopRules, STOP_RULES);
  const e = c.call;
  if (!e || typeof e !== "object") return { ok: false, problems: [...problems, "no entry for " + call.callId] };
  eq("call.callId", e.callId, CALL_ID); eq("call.style", e.style, STYLE);
  eq("mandateState", e.mandateState, "UNSPENT"); eq("outcome", e.outcome, "NOT YET ATTEMPTED");
  for (const k of ["neverReuse", "notAnActivePermission", "closedBy", "recordedBy", "result"]) if (k in e) problems.push("the entry carries " + k + "; it is not an active, unspent permission");
  eq("claim", e.claim, { identity: call.claimIdentity, filename: call.claimFile, eventsFilename: call.eventsFile });
  eq("prompt.sha256", get(e, "prompt", "sha256"), PROMPT_SHA256);
  // D-371's own calls, from its origin/main authorisation file: NH-1 spent, NH-2 and NH-3 paused
  const d = Array.isArray(d371 && d371.calls) ? d371.calls : [];
  const nh1 = d.find((x) => x && x.callId === D371_SPENT);
  if (!nh1 || nh1.mandateState !== "SPENT") problems.push("D-371's " + D371_SPENT + " is not recorded as spent on origin/main");
  for (const id of D371_PAUSED) { const x = d.find((y) => y && y.callId === id); if (!x || x.mandateState !== "UNSPENT") problems.push("D-371's " + id + " is not an unspent, paused entry"); }
  if (get(d371, "afterShort", "verdict") === "NO_COMMON_FAULT") problems.push("D-371's afterShort is NO_COMMON_FAULT; NH-4 is prepared for NH-2 and NH-3 staying paused — a new plan is needed");
  // NH-1B, from its own origin/main authorisation file: spent (this attempt follows it)
  if (get(nh1b, "callId") !== NH1B_SPENT || get(nh1b, "call", "mandateState") !== "SPENT") problems.push(NH1B_SPENT + " is not recorded as spent on origin/main");
  return { ok: problems.length === 0, problems, style: e.style };
}

/** The implementation block (D-145: no adapter hash pinned). */
function verifyImplementation(c) {
  const problems = [], x = c.adapterImplementations || {};
  const eq = (path, got, want) => { if (got !== want) problems.push(`${path}: ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`); };
  eq("adapterImplementations.isAuthorisation", x.isAuthorisation, false); eq("adapterImplementations.adapter", x.adapter, ADAPTER_PATH);
  eq("adapterImplementations.status", x.status, IMPLEMENTATION_STATUS);
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
  return { ok: true, dir, claim: join(dir, call.claimFile), events: join(dir, call.eventsFile),
    claimDisplay: "<claim register>/" + REPO_IDENTITY + "/" + call.claimFile, eventsDisplay: "<claim register>/" + REPO_IDENTITY + "/" + call.eventsFile };
}

/** The external output root and this call's directory (D-127 §2): <home>/Documents/DenSejeApp-artefacts/hair-d371-calls/<call id>. */
function outputRoot() {
  const home = homedir();
  if (typeof home !== "string" || home.trim() === "") return null;
  return resolve(home, "Documents", "DenSejeApp-artefacts", OUT_DIR_NAME);
}
function resolveOutputs(call) {
  const root = outputRoot();
  if (!root) return { ok: false, why: "no home directory; there is no fallback" };
  const dir = join(root, call.callId);
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

/** The budget and the stop rules: the one claim not consumed, no stop file. */
function verifyOrderAndStops(call, loc) {
  const problems = [], root = outputRoot();
  const consumed = CALL_IDS.filter((id) => pathExists(join(loc.dir, id + ".claim.json")));
  if (consumed.length >= MAX_CALLS) return { ok: false, stage: "budget", problems: ["NH-4's one call is spent"], consumed };
  if (root && pathExists(join(root, STOP_FILE))) problems.push("the executor stopped the trial: " + OUT_DISPLAY + "/" + STOP_FILE + " exists");
  return { ok: problems.length === 0, stage: "stopped", problems, consumed };
}

function buildBody(images, prompt) {
  const fd = new FormData();
  fd.append("model", MODEL);
  for (const im of images) fd.append(IMAGE_FIELD, new File([im.buf], im.name, { type: "image/png" }));     // Image 1 head, Image 2 style, Image 3 guide
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
  const sent = fd.getAll(IMAGE_FIELD);
  if (sent.length !== IMAGES.length || IMAGES.some((p, k) => !sent[k] || sent[k].name !== p.name)) problems.push("the body must carry exactly the three images, Image 1, Image 2, Image 3");
  if (fd.get("prompt") !== prompt) problems.push("the prompt in the body is not the verified frozen prompt");
  if (fd.getAll("size").length !== 1 || fd.get("size") !== "1024x1024") problems.push("the body does not carry exactly size 1024x1024");
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
      + "No outcome permits an automatic retry; NH-4 is one call, no reserve and no fallback.",
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
  if (!call) problems.push("--call-id must be " + CALL_ID);
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
  console.log("Northstar hair on the clean head, soft texture — the model edits the clean head, the grey hair is lifted after; one-shot send adapter (NH-4, D-371)");
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
  const decisions = verifyDecisions(blobs);
  if (!decisions.ok) return refuse("decision", decisions.problems);
  const parsed = parseJson(blobs.calls, "authorisation file");
  if (!parsed.ok) return refuse("authorisation", parsed.problems);
  const d371 = parseJson(blobs.d371Calls, "D-371 authorisation file");
  if (!d371.ok) return refuse("authorisation", d371.problems);
  const nh1b = parseJson(blobs.nh1bCalls, "NH-1B authorisation file");
  if (!nh1b.ok) return refuse("authorisation", nh1b.problems);
  const auth = verifyAuthorisation(parsed.value, call, pins.plan, d371.value, nh1b.value);
  if (!auth.ok) return refuse("authorisation", auth.problems);
  const impl = verifyImplementation(parsed.value);
  if (!impl.ok) return refuse("implementation", impl.problems);
  const prompt = pins.prompt;
  console.log("  authorisation : one active, unspent " + call.callId + " entry (style " + auth.style + ") in origin/main");
  const imgs = readImages();
  if (!imgs.ok) return refuse("images", imgs.problems);

  const loc = resolveClaimLocation(call);
  if (!loc.ok) return refuse("claim-location", [loc.why]);
  if (pathExists(loc.claim)) return refuse("claim-exists", ["the mandate is already spent: " + loc.claimDisplay]);
  if (pathExists(loc.events)) return refuse("events-exist", ["an event log already exists for this call: " + loc.eventsDisplay]);
  const order = verifyOrderAndStops(call, loc);
  if (!order.ok) return refuse(order.stage, order.problems);
  console.log("  budget   : " + order.consumed.length + " of " + MAX_CALLS + " claim consumed before this call; NH-1 and NH-1B spent, NH-2 and NH-3 paused");
  const out = resolveOutputs(call);
  if (!out.ok) return refuse("output-location", [out.why]);
  if (out.occupied.length) return refuse("outputs-not-empty", out.occupied.map((p) => "already exists: " + p));

  const built = buildBody(imgs.images, prompt);
  if (!built.ok) return refuse("body", built.problems);
  console.log("  inputs   : " + imgs.images.map((i) => i.role + " " + i.name + " " + sha(i.buf)).join(" · ") + " · prompt " + sha(Buffer.from(prompt, "utf8")) + " · size " + PARAMETERS.size + " · background " + PARAMETERS.background);

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
    neverSentFields: NEVER_SENT_FIELDS, redirect: "error", inputOrder: ["Image 1", "Image 2"],
    inputs: imgs.images.map((i) => ({ role: i.role, name: i.name, source: "outside both clones (the D-371 template's square at x2), verified by hash and format", bytes: i.buf.length, sha256: sha(i.buf) })),
    prompt: { file: TRACKED.plan, callId: call.callId, source: "the origin/main plan blob's frozen text", bytes: Buffer.byteLength(prompt, "utf8"), sha256: sha(Buffer.from(prompt, "utf8")) },
  };
  const startedAt = new Date().toISOString();
  const manifest = {
    tool: TOOL, decision: DECISION, callId: call.callId, style: auth.style, claimIdentity: call.claimIdentity, startedAt, budgetConsumedBefore: order.consumed.length,
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
    catch (e) { console.error("  THE MANIFEST COULD NOT BE WRITTEN: " + errText(e) + " — read the claim and the event log; every later call is refused."); return 3; }
    const a = manifest.accounting;
    console.log("  accounting: claim " + a.claimState + " · dispatch " + a.dispatch + " · result " + a.result + " · actuallySent " + a.actuallySent
      + " · dispatchUndetermined " + a.dispatchUndetermined + " · serverAnswered " + a.serverAnswered);
    console.log("  outcome : " + classification + " / " + stage + " — " + reason + "\n  NO RETRY. The image is not approved by anything here; the post-processing, the checks (P1–P9) and the owner's review come next.");
    return stage === "done" ? 0 : 3;
  };

  // ── point of no return: the claim, the dispatch record, then at once the ONE fetch ──────────────────────────────
  try {
    claim = createClaim(loc.claim, call, { originMainSha: refs.originSha, adapterSha256, endpoint: ENDPOINT, model: MODEL, parameters: PARAMETERS,
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

    // Exactly one image: the RECEIPT check only. The placement and the gates (D-371) and the owner's review follow.
    const problems = receiptProblems(Buffer.from(payload.data[0].b64_json, "base64"));
    const receipt = { tool: TOOL, callId: call.callId, style: auth.style, image: { file: images[0].file || null, sha256: images[0].sha256 }, verdict: problems.length ? "TECHNICAL_REJECT" : "RECEIVED_FOR_PLACEMENT", problems,
      next: "node tools/avatar/northstar-hair-nh4-post.mjs --result <this image> --base <clean head> --ear <ear mask> --swept <side-swept layer> --out <a new directory outside both clones>, then the owner's visual review (plan-nh4-v1.json visualStop)",
      note: "A TECHNICAL_REJECT here means the image is not a 1024x1024 RGBA PNG; the image is kept unchanged. RECEIVED_FOR_PLACEMENT approves nothing." };
    try { writeAtomic(out.receipt, JSON.stringify(receipt, null, 2) + "\n"); } catch (e) { manifest.receiptFileError = errText(e); }
    manifest.receipt = { file: out.show("receipt.json"), verdict: receipt.verdict, problems };
    if (problems.length) return finish("TECHNICAL_REJECT", "done", "one image received and stored unchanged; not a 1024x1024 RGBA PNG: " + problems[0]);
    return finish("RECEIVED_FOR_PLACEMENT", "done", "one 1024x1024 RGBA image received and stored byte for byte outside the clones; post-processing and checks next — not an approval of anything");
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
