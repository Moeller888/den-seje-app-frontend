// NORTHSTAR TEE MATERIAL — THE SEND ADAPTER FOR D-267 (generated material on the D-264 tee master; the master is locked).
// ONE CLAIM, ONE DISPATCH RECORD, ONE FETCH PER CALL. The D-235/D-255/D-258 pattern.
//
// D-267 (owner authorisation) allows EXACTLY TWO single-use image calls of tm-material-plan-v1.json, each with its own purpose and its
// own delivery, never one sheet to segment:
//   TMG-1-tee-hip-swatch-gingham      a seamless gingham fabric swatch, 1024x1024, opaque
//   TMG-2-tee-hip-chest-print-planet  a standalone chest print, 1024x1024, transparent background
// No earlier permission is reused; this adapter knows only D-267's call ids, token, claims and outputs. Both calls are
// images/generations, gpt-image-2.5-sunburst-2026-09-08, quality high, n 1, png, with NO image and NO reference: C is never sent.
// The prompts are read from the origin/main plan and checked against their pinned sha256. The model is never changed silently.
//
// THE BUDGET IS STRUCTURAL: two call ids, one one-shot claim each; a claim consumed on any outcome is spent and never repeated. No
// retry, no reserve, no fallback. An uncertain dispatch is never resent. The outputs are stored OUTSIDE BOTH CLONES (D-127 §2):
// <Documents>/DenSejeApp-artefacts/tm-material-calls/<call id>/. The evaluation (northstar-tee-material.mjs --from-calls) follows.
//
// Every check runs inside main(), before the claim (D-142). A dry run stops before the claim and reads no credential.
//
// Usage (after D-267's authorisation is merged; a separate owner instruction is the execution instruction):
//   node tools/avatar/openai-send-northstar-tee-material-d267.mjs --call-id=<id> --claim-identity=<id>-claim                       dry run
//   … the same plus --send --owner-approval=D-267                                                                                    ONE SEND
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

// ── identity (inactive until D-267 is merged; each send needs a separate owner instruction) ─────────────────────────
const TOOL = "openai-send-northstar-tee-material-d267";
const ADAPTER_PATH = "tools/avatar/openai-send-northstar-tee-material-d267.mjs";
const DECISION = "D-267";
const DECISION_FILE = "docs/decisions/D-267.md";
const IMPLEMENTATION_STATUS = "IMPLEMENTED — NOT EXECUTED";
const REQUIRED_LEGACY_DECISIONS = Object.freeze(["D-127"]);
// the two calls of tm-material-plan-v1.json: call id → order, delivery, background, accepted PNG colour types
const CASES = Object.freeze({
  "TMG-1-tee-hip-swatch-gingham": { order: 1, delivery: "swatch", background: "opaque", colourTypes: [2, 6] },
  "TMG-2-tee-hip-chest-print-planet": { order: 2, delivery: "print", background: "transparent", colourTypes: [6] },
});
const CALL_IDS = Object.freeze(Object.keys(CASES));
const MAX_CALLS = 2;
const AUTH_TOKEN = "D-267 TM-MATERIAL: 2 CALLS AUTHORISED";
const OWNER_APPROVAL_FLAG = "--owner-approval=D-267";
const STOP_FILE = "TMM-STOP.json";
const callOf = (id) => ({ callId: id, claimIdentity: id + "-claim", claimFile: id + ".claim.json", eventsFile: id + ".events.jsonl", approvalFlag: OWNER_APPROVAL_FLAG });

// ── the request (JSON; the same for both calls but the prompt and the background) ─────────────────────────────────
const ENDPOINT = "https://api.openai.com/v1/images/generations";
const MODEL = "gpt-image-2.5-sunburst-2026-09-08";
const BASE_PARAMETERS = Object.freeze({ size: "1024x1024", quality: "high", n: 1, output_format: "png" });
const FIELD_ORDER = Object.freeze(["model", "prompt", "size", "quality", "n", "output_format", "background"]);
const NEVER_SENT_FIELDS = Object.freeze(["image", "image[]", "mask", "input_fidelity", "output_compression", "response_format", "moderation", "user"]);
const W = 1024;
const H = 1024;

// ── tracked inputs, read from origin/main ───────────────────────────────────────────────────────────────────────────
const TRACKED = Object.freeze({
  adapter: ADAPTER_PATH,
  ledger: "tools/avatar/r3-face-neutral-attempt-ledger.mjs",
  legacyRegister: "docs/project-state.md",
  decision: DECISION_FILE,
  masterDecision: "docs/decisions/D-264.md",
  calls: "tools/avatar/fixtures/northstar-wardrobe/tee-master/tm-material-authorisation-v1.json",
  plan: "tools/avatar/fixtures/northstar-wardrobe/tee-master/tm-material-plan-v1.json",
  master: "tools/avatar/northstar-tee-master.mjs",
  evaluator: "tools/avatar/northstar-tee-material.mjs",
});
const PLAN_SHA256 = "f24e186156650870de83046ed6a52b28ade3e71a10591babfc79ef8a4be1214b";
const PROMPT_SHA256 = Object.freeze({ "TMG-1-tee-hip-swatch-gingham": "3c3d275370f66fa3223617355f5f267c3dc2d4c17cd3c96b0aa7c744a453e0e5", "TMG-2-tee-hip-chest-print-planet": "142a3631e76fed8674355f20531a34f94931de9cce860e6c1dac1f6d6a51fc3a" });

// ── the stop rules: an earlier outcome that stops every later call ──────────────────────────────────────────────────
const STOP_RULES = Object.freeze([
  "two single calls: no retry, no reserve, no fallback, no other model",
  "uncertain dispatch: DISPATCHED_RESULT_UNKNOWN, NOT_DISPATCHED, RESPONSE_BODY_UNREADABLE, UNEXPECTED, or a claim without a written outcome — never resent, and the later call is not sent",
  "an HTTP error (credit, access, moderation or request shape) on the first call stops the second",
  "a format reject at receipt (TECHNICAL_REJECT) of the first call does not stop the second; the deliveries are independent",
  "the executor's stop file TMM-STOP.json",
]);

// ── claim register and outputs (outside every clone) ────────────────────────────────────────────────────────────────
const REPO_IDENTITY = "Moeller888-den-seje-app-frontend";
const OUT_DIR_NAME = "tm-material-calls";
const OUT_DISPLAY = "<Documents>/DenSejeApp-artefacts/" + OUT_DIR_NAME;
const OUT_PREFIX = "tmm.";

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
/** The receipt check: a 1024x1024 8-bit PNG of an accepted colour type whose image data inflates to exactly its rows. Nothing else. */
function receiptProblems(buf, colourTypes) {
  const h = pngHeader(buf);
  if (!h) return ["the returned image: not a PNG"];
  const problems = [];
  if (h.width !== W || h.height !== H) problems.push(`the returned image: ${h.width}x${h.height}, expected ${W}x${H}`);
  if (h.bitDepth !== 8 || !colourTypes.includes(h.colourType) || h.interlace !== 0) problems.push(`the returned image: bit depth ${h.bitDepth}, colour type ${h.colourType}, interlace ${h.interlace}; expected 8-bit, colour type ${colourTypes.join(" or ")}, not interlaced`);
  if (problems.length) return problems;
  const idat = []; let p = 8;
  while (p + 12 <= buf.length) { const len = buf.readUInt32BE(p), type = buf.toString("ascii", p + 4, p + 8); if (p + 12 + len > buf.length) return ["the returned image: truncated chunk " + type]; if (type === "IDAT") idat.push(buf.subarray(p + 8, p + 8 + len)); if (type === "IEND") break; p += 12 + len; }
  let raw; try { raw = inflateSync(Buffer.concat(idat)); } catch (_) { return ["the returned image: its image data does not inflate"]; }
  const bpp = h.colourType === 6 ? 4 : 3;
  if (raw.length !== H * (W * bpp + 1)) return ["the returned image: " + raw.length + " bytes of image data, expected " + H * (W * bpp + 1)];
  return [];
}

const get = (o, ...keys) => keys.reduce((v, k) => (v !== null && typeof v === "object" ? v[k] : undefined), o);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The frozen plan and prompts, on the origin/main blobs: the plan's pin, the locked master and evaluation, each call's prompt text against its pinned sha256, nothing
 *  unresolved; no image or reference; the plan never authorises by itself. */
function verifyPrompts(blobs) {
  const problems = [];
  if (sha(blobs.plan) !== PLAN_SHA256) return { ok: false, problems: ["tm-material-plan-v1.json: " + sha(blobs.plan) + ", expected the frozen " + PLAN_SHA256] };
  let plan; try { plan = JSON.parse(blobs.plan.toString("utf8")); } catch (_) { return { ok: false, problems: ["the frozen plan is not JSON"] }; }
  if (get(plan, "authorisesImageRequest") !== false) problems.push("the plan must never authorise by itself");
  // the lock: the master and its evaluation on origin/main are the bytes the plan locked (the master is never adjusted for a design)
  for (const key of ["master", "evaluator"]) if (sha(blobs[key]) !== get(plan, "lock", "modules", TRACKED[key])) problems.push(TRACKED[key] + " is not the locked module (" + sha(blobs[key]) + ")");
  const calls = Array.isArray(plan.calls) ? plan.calls : [];
  if (!same(calls.map((c) => c && c.callId), CALL_IDS)) problems.push("the plan's calls are not " + CALL_IDS.join(", "));
  const items = {};
  for (const id of CALL_IDS) {
    const c = calls.find((x) => x && x.callId === id) || {}, text = get(c, "prompt", "text");
    if (typeof text !== "string" || sha(Buffer.from(text, "utf8")) !== PROMPT_SHA256[id] || get(c, "prompt", "sha256") !== PROMPT_SHA256[id]) problems.push(id + ": the prompt is not the frozen " + PROMPT_SHA256[id]);
    else if (/[{}]|undefined|null|NaN|\$\{/.test(text)) problems.push(id + ": the prompt holds something unresolved");
    if (!same(c.references, [])) problems.push(id + ": the plan names a reference; this experiment sends none");
    if (get(c, "parameters", "background") !== CASES[id].background) problems.push(id + ": the plan's background is not " + CASES[id].background);
    items[id] = { prompt: text, sha256: PROMPT_SHA256[id] };
  }
  return { ok: problems.length === 0, problems, prompts: { items }, plan };
}

/** Front matter of a decision file (simple `key: value` lines between two `---`). */
function frontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (!m) return null;
  const fields = {};
  for (const line of m[1].split(/\r?\n/)) { const k = line.indexOf(":"); if (k > 0) fields[line.slice(0, k).trim()] = line.slice(k + 1).trim(); }
  return { fields, body: text.slice(m[0].length) };
}

/** The decisions, from origin/main only: the legacy row the privacy rule rests on, D-264's file (the master under test), and D-267's
 *  own file — its status holds the authorisation token as an exact segment, and its body names every pin. */
function verifyDecisions(blobs) {
  const problems = [];
  const lines = blobs.legacyRegister.toString("utf8").split("\n");
  for (const id of REQUIRED_LEGACY_DECISIONS) {
    const n = lines.filter((l) => l.startsWith("| **" + id + "** |")).length;
    if (n !== 1) problems.push(`${id} appears ${n} times in the origin/main legacy register; exactly 1 is required`);
  }
  if (lines.some((l) => l.startsWith("| **" + DECISION + "** |"))) problems.push(DECISION + " has a row in the frozen legacy table; it must be a decision file only (D-224)");
  const master = frontMatter(blobs.masterDecision.toString("utf8"));
  if (!master || master.fields.d !== "D-264") problems.push("docs/decisions/D-264.md on origin/main is not D-264's decision file (the master under test)");
  const doc = frontMatter(blobs.decision.toString("utf8"));
  if (!doc || doc.fields.d !== DECISION) return { ok: false, problems: [...problems, DECISION_FILE + " on origin/main is not " + DECISION + "'s decision file"] };
  // the authorisation is an exact segment of D-267's status — never a word anywhere in the file
  if (!String(doc.fields.status || "").split(" — ").map((x) => x.trim()).includes(AUTH_TOKEN)) problems.push("the origin/main " + DECISION + " status does not hold " + AUTH_TOKEN);
  for (const needle of [...CALL_IDS, OWNER_APPROVAL_FLAG, MODEL, ADAPTER_PATH, PLAN_SHA256, ...Object.values(PROMPT_SHA256), BASE_PARAMETERS.size, ENDPOINT])
    if (!doc.body.includes(needle)) problems.push("the origin/main " + DECISION + " decision does not carry " + needle);
  return { ok: problems.length === 0, problems };
}

function parseJson(buf, what) {
  let c;
  try { c = JSON.parse(buf.toString("utf8")); } catch (_) { return { ok: false, problems: ["the origin/main " + what + " is not valid JSON"] }; }
  if (c === null || typeof c !== "object" || Array.isArray(c)) return { ok: false, problems: ["the origin/main " + what + " is not an object"] };
  return { ok: true, value: c };
}

/** The authorisation, from the origin/main file only: the budget, the request, the frozen pins and this entry. */
function verifyAuthorisation(c, call, prompts) {
  const problems = [];
  const eq = (path, got, want) => { if (!same(got, want)) problems.push(`${path}: ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`); };
  if (c.decision !== DECISION) problems.push("the authorisation file is not D-267's");
  if (get(c, "meta", "authorisesImageRequest") !== false) problems.push("meta.authorisesImageRequest must stay false; authorisation is never a general boolean");
  eq("budget.authorised", get(c, "budget", "authorised"), MAX_CALLS); eq("budget.reserve", get(c, "budget", "reserve"), 0); eq("budget.retries", get(c, "budget", "retries"), 0);
  eq("budget.fallback", get(c, "budget", "fallback"), false); eq("budget.reusesEarlierPermissions", get(c, "budget", "reusesEarlierPermissions"), false);
  eq("request.endpoint", get(c, "request", "endpoint"), ENDPOINT); eq("request.model", get(c, "request", "model"), MODEL);
  eq("request.parameters", get(c, "request", "parameters"), BASE_PARAMETERS); eq("request.fieldOrder", get(c, "request", "fieldOrder"), FIELD_ORDER); eq("request.neverSentFields", get(c, "request", "neverSentFields"), NEVER_SENT_FIELDS);
  eq("request.images", get(c, "request", "images"), []);
  eq("frozen.plan", get(c, "frozen", "plan"), { file: TRACKED.plan, sha256: PLAN_SHA256 });
  eq("stopRules", c.stopRules, STOP_RULES);
  const calls = Array.isArray(c.calls) ? c.calls : [];
  eq("call ids", calls.map((e) => e && e.callId), CALL_IDS);
  const e = calls.find((x) => x && x.callId === call.callId);
  if (!e) return { ok: false, problems: [...problems, "no entry for " + call.callId] };
  eq("mandateState", e.mandateState, "UNSPENT"); eq("outcome", e.outcome, "NOT YET ATTEMPTED");
  for (const k of ["neverReuse", "notAnActivePermission", "closedBy", "recordedBy", "result"]) if (k in e) problems.push("the entry carries " + k + "; it is not an active, unspent permission");
  eq("claim", e.claim, { identity: call.claimIdentity, filename: call.claimFile, eventsFilename: call.eventsFile });
  const want = CASES[call.callId];
  if (!want || e.order !== want.order || e.delivery !== want.delivery || e.background !== want.background) return { ok: false, problems: [...problems, "the entry's order, delivery or background does not match its call id"] };
  eq("prompt.sha256", get(e, "prompt", "sha256"), get(prompts, "items", call.callId, "sha256"));
  return { ok: problems.length === 0, problems, delivery: e.delivery, background: e.background };
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

/** The external output root and this call's directory (D-127 §2). */
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

/** The order and the stop rules: the earlier call is claimed and has a written outcome; no earlier outcome stops the run, and there is
 *  no stop file. Returns the claims consumed (each one is spent). */
function verifyOrderAndStops(call, loc) {
  const problems = [], root = outputRoot(), k = CALL_IDS.indexOf(call.callId);
  const consumed = CALL_IDS.filter((id) => pathExists(join(loc.dir, id + ".claim.json")));
  if (consumed.length >= MAX_CALLS) return { ok: false, stage: "budget", problems: ["the experiment's " + MAX_CALLS + " calls are spent"], consumed };
  if (root && pathExists(join(root, STOP_FILE))) problems.push("the executor stopped the experiment: " + OUT_DISPLAY + "/" + STOP_FILE + " exists");
  for (const id of CALL_IDS.slice(0, k)) {
    if (!consumed.includes(id)) { problems.push("order: " + id + " comes first and has no claim"); continue; }
    let m = null; try { m = JSON.parse(readFileSync(join(root, id, OUT_PREFIX + "request.json"), "utf8")); } catch (_) { problems.push("stop (uncertain dispatch): " + id + " is claimed but has no readable outcome"); continue; }
    const cls = get(m, "outcome", "classification"), st = get(m, "response", "httpStatus"), code = String(get(m, "response", "error", "code") || "") + " " + String(get(m, "response", "error", "type") || "");
    if (["DISPATCHED_RESULT_UNKNOWN", "NOT_DISPATCHED", "RESPONSE_BODY_UNREADABLE", "UNEXPECTED"].includes(cls)) problems.push("stop (uncertain dispatch): " + id + " ended " + cls);
    else if (cls === "TECHNICAL_REJECT" || cls === "RECEIVED_FOR_CHECK") continue;      // the deliveries are independent
    else if (cls === "HTTP_ERROR") {
      if (st === 401 || st === 403 || st === 429 || /quota|billing/i.test(code)) problems.push("stop (credit or access): " + id + " HTTP " + st + " " + code.trim());
      else if (st === 400 && /moderation/i.test(code)) problems.push("stop (moderation): " + id + " was blocked by moderation");
      else problems.push("stop (request shape): " + id + " HTTP " + st + " " + code.trim());
    } else problems.push("stop: " + id + " has an unknown outcome " + JSON.stringify(cls));
  }
  return { ok: problems.length === 0, stage: "stopped", problems, consumed };
}

/** The JSON body: exactly the fields of FIELD_ORDER, in that order; no image, mask or never-sent field. */
function buildBody(prompt, background) {
  const body = { model: MODEL, prompt, size: BASE_PARAMETERS.size, quality: BASE_PARAMETERS.quality, n: BASE_PARAMETERS.n, output_format: BASE_PARAMETERS.output_format, background };
  const problems = [];
  for (const bad of NEVER_SENT_FIELDS) if (bad in body) problems.push("a never-sent field is in the body: " + bad);
  if (Object.keys(body).join("|") !== FIELD_ORDER.join("|")) problems.push("body fields " + JSON.stringify(Object.keys(body)) + ", expected " + JSON.stringify(FIELD_ORDER));
  if (body.prompt !== prompt) problems.push("the prompt in the body is not the verified frozen prompt");
  if (body.size !== "1024x1024" || body.n !== 1) problems.push("the body does not carry exactly size 1024x1024 and n 1");
  if (!["opaque", "transparent"].includes(body.background)) problems.push("the body's background is not opaque or transparent");
  const text = JSON.stringify(body);
  return { ok: problems.length === 0, problems, body: text };
}

function createClaim(file, call, record) {
  mkdirSync(dirname(file), { recursive: true });
  const fd = openSync(file, "wx");                 // the mandate is SPENT from this line onwards
  const payload = {
    contract: DECISION, callId: call.callId, claimIdentity: call.claimIdentity, repository: REPO_IDENTITY, mandate: "SPENT",
    semantics: "Existence alone means the claim is consumed and the mandate is spent. A consumed claim is NOT a dispatch: "
      + "the dispatch is recorded separately in " + call.eventsFile + ". Never deleted, renamed, reset, overwritten or restored. "
      + "No outcome permits an automatic retry; the D-267 experiment has two single calls, no reserve and no fallback.",
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
  if (!call) problems.push("--call-id must be one of the two D-267 call ids");
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
  console.log("Northstar tee material — generated material on the locked D-264 master, one-shot send adapter (D-267)");
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
  const auth = verifyAuthorisation(parsed.value, call, pins.prompts);
  if (!auth.ok) return refuse("authorisation", auth.problems);
  const impl = verifyImplementation(parsed.value);
  if (!impl.ok) return refuse("implementation", impl.problems);
  const prompt = pins.prompts.items[call.callId].prompt;
  console.log("  authorisation : one active, unspent " + call.callId + " entry (" + auth.delivery + ", background " + auth.background + ") in origin/main");

  const loc = resolveClaimLocation(call);
  if (!loc.ok) return refuse("claim-location", [loc.why]);
  if (pathExists(loc.claim)) return refuse("claim-exists", ["the mandate is already spent: " + loc.claimDisplay]);
  if (pathExists(loc.events)) return refuse("events-exist", ["an event log already exists for this call: " + loc.eventsDisplay]);
  const order = verifyOrderAndStops(call, loc);
  if (!order.ok) return refuse(order.stage, order.problems);
  console.log("  budget   : " + order.consumed.length + " of " + MAX_CALLS + " claims consumed before this call; every earlier call has an outcome that does not stop the run");
  const out = resolveOutputs(call);
  if (!out.ok) return refuse("output-location", [out.why]);
  if (out.occupied.length) return refuse("outputs-not-empty", out.occupied.map((p) => "already exists: " + p));

  const built = buildBody(prompt, auth.background);
  if (!built.ok) return refuse("body", built.problems);
  console.log("  inputs   : no image, no reference · prompt " + sha(Buffer.from(prompt, "utf8")) + " · size " + BASE_PARAMETERS.size + " · background " + auth.background);

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
    endpoint: ENDPOINT, operation: "images.generations", model: MODEL, parameters: { ...BASE_PARAMETERS, background: auth.background }, fieldOrder: FIELD_ORDER,
    neverSentFields: NEVER_SENT_FIELDS, redirect: "error", inputs: [],
    prompt: { file: TRACKED.plan, callId: call.callId, source: "the origin/main plan blob", bytes: Buffer.byteLength(prompt, "utf8"), sha256: sha(Buffer.from(prompt, "utf8")) },
  };
  const startedAt = new Date().toISOString();
  const manifest = {
    tool: TOOL, decision: DECISION, callId: call.callId, delivery: auth.delivery, claimIdentity: call.claimIdentity, startedAt, budgetConsumedBefore: order.consumed.length,
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
    console.log("  outcome : " + classification + " / " + stage + " — " + reason + "\n  NO RETRY. Nothing is approved here; the evaluation on the locked master (northstar-tee-material.mjs --from-calls) and the visual review come next.");
    return stage === "done" ? 0 : 3;
  };

  // ── point of no return: the claim, the dispatch record, then at once the ONE fetch ──────────────────────────────
  try {
    claim = createClaim(loc.claim, call, { originMainSha: refs.originSha, adapterSha256, endpoint: ENDPOINT, model: MODEL, parameters: request.parameters,
      promptSha256: request.prompt.sha256, inputs: [], startedAt });
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
    res = await globalThis.fetch(ENDPOINT, { method: "POST", redirect: "error", headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" }, body: built.body });
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
    manifest.images = { count: payload.data.length, requested: BASE_PARAMETERS.n, items: images };
    if (payload.data.length !== BASE_PARAMETERS.n) return finish("UNEXPECTED", "done", payload.data.length + " images returned for n = 1; all are kept, none is selected, no check is run");
    if (!images[0].decodable) return finish("UNEXPECTED", "done", "the single image is not strict base64; the raw response is kept");

    // Exactly one image: the RECEIPT check only. The material checks, the mapping on the locked master and the review follow.
    const problems = receiptProblems(Buffer.from(payload.data[0].b64_json, "base64"), CASES[call.callId].colourTypes);
    const receipt = { tool: TOOL, callId: call.callId, delivery: auth.delivery, image: { file: images[0].file || null, sha256: images[0].sha256 }, verdict: problems.length ? "TECHNICAL_REJECT" : "RECEIVED_FOR_CHECK", problems,
      next: "node tools/avatar/northstar-tee-material.mjs --from-calls --out <dir outside the repo>: the material checks, the locked master, the review sheets and the record",
      note: "A TECHNICAL_REJECT here means the image is not a 1024x1024 PNG of the accepted colour type; the image is kept unchanged. RECEIVED_FOR_CHECK approves nothing." };
    try { writeAtomic(out.receipt, JSON.stringify(receipt, null, 2) + "\n"); } catch (e) { manifest.receiptFileError = errText(e); }
    manifest.receipt = { file: out.show("receipt.json"), verdict: receipt.verdict, problems };
    if (problems.length) return finish("TECHNICAL_REJECT", "done", "one image received and stored unchanged; not a 1024x1024 PNG of the accepted colour type: " + problems[0]);
    return finish("RECEIVED_FOR_CHECK", "done", "one 1024x1024 image received and stored byte for byte outside the clones; the evaluation next — not an approval of anything");
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
