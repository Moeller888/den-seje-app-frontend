// D-143 PR B — the CORE-only underlay SEND adapter, tested without ever reaching the real world.
//
// THE LESSON OF D-142. A unit test called a send function directly in the test process with
// send:true and the correct approval; the function fell back to the real claim path, the real key
// and the real globalThis.fetch, and a request left the machine. This file is built so that cannot
// recur:
//
//   · The adapter is NEVER imported. It exports nothing, and this file only reads its source as
//     text or runs it as a CLI in a child process.
//   · Every run happens in a TEMPORARY CLONE whose own origin/main this file arranges per scenario.
//   · The child's environment is built from an explicit ALLOWLIST. It inherits no key, no
//     LOCALAPPDATA, no XDG_STATE_HOME and no TEMP/TMP/TMPDIR; those point into the sandbox, and the
//     key is a dummy. This file never reads the owner's key at all.
//   · globalThis.fetch is replaced from OUTSIDE by `node --import <mock>`. The mock refuses to load
//     unless it is configured, so an unconfigured child aborts before the adapter runs, and it
//     never delegates to a real fetch. Proxy variables point at a closed local port as a further
//     layer.
//   · ISOLATION IS PROVEN FIRST. The adapter is not run at all unless the proof test passed.
//   · No test reads, lists, hashes or checks a production claim or output path — not even to prove
//     that nothing happened there. Isolation is proven positively: every derived path is inside the
//     sandbox.
//
// H1 is external (D-127 §2). The positive send scenarios need a byte-exact copy, taken from
// FITTING_BASE_V1_PATH into the sandbox; without it they are skipped. Every refusal scenario runs
// without H1, because every refusal before the H1 check is reached first.
//
// D-147. D-143's one call was made, and D-147 closed the D-143 and D-145 entries in the live contract.
// Every sandbox origin below therefore reproduces the HISTORICAL, pre-execution state: the contract is
// preClosureContract() of the live one — required to be canonically identical to the merged contract of
// 3f62932325ce4f00c9b9bfaa64e4b321bf3f4889 — and the register is the live one without its D-147 row. That
// historical state exists only inside the sandbox; it is never written anywhere else. A separate test runs
// the adapter against the LIVE tree and proves that it now refuses before the claim and the fetch.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, readdirSync, statSync,
  copyFileSync, realpathSync, rmSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import { join, dirname, relative, isAbsolute, resolve, basename, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { preClosureContract, PRE_CLOSURE_CONTRACT_CANONICAL_SHA256 } from "./avatar-r3-d147-closure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const repoFile = (rel) => join(REPO, ...rel.split("/"));

const ADAPTER_REL = "tools/avatar/openai-send-r3-underlay-core-d143.mjs";
const SRC = readFileSync(repoFile(ADAPTER_REL), "utf8");
const CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const CONTRACT_REL = "tools/avatar/fixtures/r3/r3-shadow-contract-v1.json";
const REGISTER_REL = "docs/project-state.md";
const PROMPT_REL = "tools/avatar/fixtures/r3-underlay/r3-underlay-prompt-v2.md";
const MASK_REL = "tools/avatar/fixtures/r3-underlay/r3-underlay-api-mask-core-v1.png";
const NORTHSTAR_REL = "assets/avatar/reference/Northstar Master v2.png";
const EDIT_REL = "tools/avatar/fixtures/r3-head-edit/r3-head-edit-v1.png";
const TRANSITION_REL = "tools/avatar/fixtures/r3-head-edit/r3-head-transition-v1.png";
const TRACKED = [ADAPTER_REL, REGISTER_REL, CONTRACT_REL, PROMPT_REL, MASK_REL, NORTHSTAR_REL, EDIT_REL, TRANSITION_REL];
const LIVE_CONTRACT = JSON.parse(readFileSync(repoFile(CONTRACT_REL), "utf8"));
/** The contract as merged before D-147 closed D-143 — the state the adapter was written and run against. */
const CONTRACT = preClosureContract(LIVE_CONTRACT);
const D143 = CONTRACT.authorisedCalls.calls.find((e) => e.callId === "D-143-r3-underlay-core-v2");
const D145 = CONTRACT.adapterImplementations.entries.find((e) => e.decision === "D-145" && e.callId === "D-143-r3-underlay-core-v2");
/** sha256(JSON.stringify(entry)) of the D-143 authorisation entry as merged in PR #256. */
const D143_ENTRY_SNAPSHOT = "6ca1754aedd8351349ab725e063190c6f265af16f79cde4fad86ad6a2c16ef6d";

const DUMMY_KEY = "sk-d143-sandbox-dummy-key-not-a-credential";
const APPROVAL = "--owner-approval=D-143";
const H1_SHA256 = "72875565ecd62b542a91156dbcca1399a434fe04634f4e737df71337be0d5af4";
/** Joined ONLY to a sandbox state directory. */
const SANDBOX_CLAIM_SUBPATH = ["DenSejeApp", "one-shot-claims", "Moeller888-den-seje-app-frontend", "D-143.claim.json"];
const OUT_DIR_PARTS = ["tools", "avatar", "build", "r3-underlay-core"];

function isInside(child, parent) {
  if (typeof child !== "string" || typeof parent !== "string" || child === "" || parent === "") return false;
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

// ── static: the adapter's shape, read as text ────────────────────────────────────────────────

test("the adapter exports nothing and imports no repository module", () => {
  assert.ok(!/^\s*export\b/m.test(CODE), "the send adapter must export nothing, so no test can import its send path");
  const imports = [...CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
  assert.ok(imports.length > 0);
  for (const spec of imports) assert.ok(spec.startsWith("node:"), "only node: built-ins may be imported, found " + spec);
  assert.ok(!/\bimport\s*\(/.test(CODE), "no dynamic import");
  assert.ok(!/\brequire\s*\(/.test(CODE), "no require");
});

test("there is exactly one fetch call site, it is globalThis.fetch, and git never fetches", () => {
  assert.equal([...CODE.matchAll(/\bfetch\s*\(/g)].length, 1, "exactly one fetch call site");
  assert.equal([...CODE.matchAll(/globalThis\.fetch\s*\(/g)].length, 1, "the one call site is globalThis.fetch");
  assert.ok(!/["'](fetch|pull|push|remote|ls-remote|clone)["']/.test(CODE), "git is used read-only and never over the network");
  assert.ok(!/\b(for|while)\s*\([^)]*\)\s*\{[^}]*globalThis\.fetch/.test(CODE), "the fetch is not inside a loop");
});

test("the adapter has no injection point and reads no test-environment switch", () => {
  for (const hook of ["fetchImpl", "claimPath", "outDir", "registerPath", "contractPath", "gitRef", "preflightResult", "fetchModule"]) {
    assert.ok(!CODE.includes(hook), "no injection point named " + hook);
  }
  for (const flag of ["--claim-path", "--force", "--retry", "--reset", "--out", "--ref", "--contract", "--register"]) {
    assert.ok(!CODE.includes(flag), "no CLI flag " + flag);
  }
  const envUses = [...CODE.matchAll(/process\.env(\.[A-Za-z_][A-Za-z0-9_]*|\[[^\]]*\]|\))?/g)].map((m) => m[0]);
  const allowed = new Set(["process.env.OPENAI_API" + "_KEY", "process.env.LOCALAPPDATA", "process.env.XDG_STATE_HOME",
    "process.env[H1.envVar]", "process.env)"]);
  for (const u of envUses) assert.ok(allowed.has(u), "unexpected environment read: " + u);
  assert.ok(/H1 = Object\.freeze\(\{[^}]*envVar: "FITTING_BASE_V1_PATH"/.test(CODE));
});

test("the adapter deletes nothing, and opens exactly one file exclusively: the claim", () => {
  for (const del of ["unlinkSync", "rmSync", "rmdirSync", "unlink(", "rm(", "truncateSync", "ftruncate", "copyFileSync"]) {
    assert.ok(!CODE.includes(del), "the adapter must not contain " + del);
  }
  assert.equal([...CODE.matchAll(/openSync\(/g)].length, 1, "one openSync");
  assert.match(CODE, /function createClaim\(file, record\) \{\n[^\n]*\n\s*const fd = openSync\(file, "wx"\);/);
  const writes = [...CODE.matchAll(/writeFileSync\(([^)]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(writes, ["partial, data, { flag: \"wx\" }"], "the only writeFileSync is the exclusive .partial");
  assert.match(CODE, /if \(pathExists\(target\)\) throw new Error\("refusing to replace an existing file/);
});

test("the adapter's pins are the D-143 contract entry's pins", () => {
  const lit = (re) => { const m = CODE.match(re); assert.ok(m, "not found: " + re); return m[1]; };
  assert.equal(lit(/const CALL_ID = "([^"]+)"/), D143.callId);
  assert.equal(lit(/const DECISION = "([^"]+)"/), D143.decision);
  assert.equal(lit(/const ENDPOINT = "([^"]+)"/), D143.endpoint);
  assert.equal(lit(/const MODEL = "([^"]+)"/), D143.model);
  assert.equal(lit(/const CLAIM_FILENAME = "([^"]+)"/), D143.claim.filename);
  assert.equal(lit(/const OUT_RAW = "([^"]+)"/), D143.outputs.raw);
  assert.equal(lit(/const OUT_MANIFEST = "([^"]+)"/), D143.outputs.manifest);
  assert.equal(lit(/const OWNER_APPROVAL_FLAG = "([^"]+)"/), APPROVAL);
  // D-145: the approval, the file and the status are the implementation entry's
  assert.equal(lit(/const OWNER_APPROVAL = "([^"]+)"/), D145.adapter.ownerApproval);
  assert.equal("--owner-approval=" + D145.adapter.ownerApproval, APPROVAL);
  assert.equal(D145.adapter.ownerApprovalFlag, APPROVAL);
  assert.equal(lit(/const IMPLEMENTATION_DECISION = "([^"]+)"/), D145.decision);
  assert.equal(lit(/const IMPLEMENTATION_STATUS = "([^"]+)"/), D145.adapter.status);
  assert.equal(D145.adapter.file, ADAPTER_REL);
  assert.equal(lit(/const D143_ENTRY_CANONICAL_SHA256 = "([0-9a-f]{64})"/), D143_ENTRY_SNAPSHOT);
  assert.equal(sha256(JSON.stringify(D143)), D143_ENTRY_SNAPSHOT, "the reconstructed D-143 entry is its merged snapshot");
  assert.equal(sha256(JSON.stringify(CONTRACT)), PRE_CLOSURE_CONTRACT_CANONICAL_SHA256, "the reconstruction is the merged contract");
  // and the LIVE entry is not: D-147 closed it, so the adapter's snapshot pin can no longer be met
  const live = LIVE_CONTRACT.authorisedCalls.calls.find((e) => e.callId === "D-143-r3-underlay-core-v2");
  assert.notEqual(sha256(JSON.stringify(live)), D143_ENTRY_SNAPSHOT, "the live D-143 entry is closed");
  assert.equal(live.mandateState, "SPENT");
  assert.equal(live.neverReuse, true);
  // no adapter SHA-256 is pinned in the contract, in any form
  assert.ok(!readFileSync(repoFile(CONTRACT_REL), "utf8").includes(sha256(readFileSync(repoFile(ADAPTER_REL)))));
  for (const k of Object.keys(D145.adapter)) assert.ok(!/^(adapter)?sha-?256$/i.test(k), "no adapter hash field: " + k);
  assert.equal(lit(/const H1 = Object\.freeze\(\{[^}]*sha256: "([0-9a-f]{64})"/), D143.inputs[0].sha256);
  assert.equal(lit(/const NORTHSTAR = Object\.freeze\(\{[^}]*sha256: "([0-9a-f]{64})"/), D143.inputs[1].sha256);
  assert.equal(lit(/const PROMPT_FILE = Object\.freeze\(\{[^}]*sha256: "([0-9a-f]{64})"/), D143.prompt.fileSha256);
  assert.equal(lit(/const PROMPT_BODY = Object\.freeze\(\{[^}]*sha256: "([0-9a-f]{64})"/), D143.prompt.transmittedSha256);
  assert.equal(lit(/const API_MASK = Object\.freeze\(\{[^}]*sha256: "([0-9a-f]{64})"/), D143.mask.sha256);
  assert.equal(lit(/const ADAPTER_PATH = "([^"]+)"/), ADAPTER_REL);
  assert.equal(lit(/mask: "([^"]+)"/), D143.mask.file);
  assert.equal(lit(/prompt: "([^"]+)"/), D143.prompt.file);
  assert.equal(lit(/northstar: "([^"]+)"/), D143.inputs[1].repoPath);
  const params = JSON.parse(lit(/const PARAMETERS = Object\.freeze\((\{[^}]*\})\)/).replace(/(\w+):/g, "\"$1\":"));
  assert.deepEqual(params, D143.parameters);
  assert.match(CODE, /REQUIRED_DECISIONS = Object\.freeze\(\["D-132", "D-133", "D-139", "D-140", "D-141", "D-142", "D-143", "D-145"\]\)/);
  for (const d of ["D-132", "D-133", "D-139", "D-140", "D-141", "D-142", "D-143"]) {
    assert.ok(D143.adapter.ownRequiredDecisions.includes(d), d + " is required by the contract");
  }
});

test("inside main(), every check precedes the claim, and the fetch directly follows it", () => {
  const body = CODE.slice(CODE.indexOf("async function main("));
  const order = ["parseArgs(argv)", "process.env.OPENAI_API" + "_KEY", "resolveRefs()", "readOriginBlobs(refs.originSha)",
    "verifyPins(blobs)", "verifyRegister(blobs.register)", "parseContract(blobs.contract)", "verifyAuthorisation(parsed.contract)",
    "verifyImplementation(parsed.contract)", "resolveClaimPath()",
    "outputPaths()", "readH1(args.h1)", "buildBody(h1.buf, blobs, pins.prompt)", "if (!args.sendMode)",
    "const again = resolveRefs()", "createClaim(claimLoc.path", "globalThis.fetch("];
  let last = -1;
  for (const token of order) {
    const at = body.indexOf(token);
    assert.ok(at > last, token + " must come after the previous step");
    last = at;
  }
  const between = body.slice(body.indexOf("createClaim(claimLoc.path"), body.indexOf("res = await globalThis.fetch("));
  assert.ok(body.indexOf("const finish = (") < body.indexOf("createClaim(claimLoc.path"), "finish is defined before the claim");
  for (const io of ["readFileSync", "writeFileSync", "writeAtomic(", "spawnSync", "git(", "await ", "console.", "if ("]) {
    assert.ok(!between.includes(io), "nothing between the claim and the fetch may do " + io);
  }
});

// ── the D-142 guard: tests/ must never again contain the construction that sent a request ────

/** Findings for one test source. Built from fragments so this file does not match itself. */
const IMPORT_OF = (name) => new RegExp("(?:\\bfr" + "om\\s*|\\bimport\\s*\\(\\s*|\\brequire\\s*\\(\\s*)[\"'][^\"']*" + name + "[\"']");
/** A file that exercises an adapter or its CLI, by import or by naming the file. */
const TESTS_AN_ADAPTER = /openai-[\w-]+\.mjs/;
/** Whitespace-normalised, so a fingerprint survives re-indentation but not a change of meaning. */
const norm = (s) => s.replace(/\s+/g, " ").trim();
/** Only these four rules can ever be excused, and only read-only debt in a named file (D-145). */
const EXCUSABLE_RULES = new Set(["claim-identity", "output-directory", "fs-read-on-production-path", "child-environment"]);
const FS_READ = "existsSync|statSync|lstatSync|readFileSync|readdirSync|accessSync";
const FS_WRITE = "writeFileSync|appendFileSync|mkdirSync|renameSync|copyFileSync|rmSync|unlinkSync|rmdirSync|openSync|truncateSync";
const CHILD = "spawnSync|spawn|execFileSync|execFile|execSync|fork";

/** Findings for one test source: {rule, construct, line, message}. `construct` is the fingerprint. */
function scanSource(rel, src) {
  const code = src.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
  const findings = [];
  const add = (rule, construct, message, line) => findings.push({ rule, construct, message, line: line || null });

  if (IMPORT_OF("openai-[\\w-]+\\.mjs").test(code) && /\bsend\s*:\s*true\b/.test(code)) {
    add("send-true", "send: true", "imports an image adapter and passes send: true in the test process");
  }
  if (IMPORT_OF("openai-send-r3-underlay-core-d143(?:\\.mjs)?").test(code)) {
    add("imports-d143-adapter", "import of the D-143 send adapter", "imports the D-143 send adapter");
  }
  if (new RegExp("process\\.env(?:\\.OPENAI_API" + "_KEY|\\[\\s*[\"']OPENAI_API" + "_KEY[\"']\\s*\\])").test(code)) {
    add("reads-api-key", "the owner's key", "reads the owner's API key from the environment");
  }
  // D-145: a direct in-process call to an adapter's exported performSingleRequest is a legacy
  // pattern. It is allowed ONLY when fetchImpl, claimPath, outDir and a literal dummy apiKey are all
  // explicit, so none of the adapter's fallbacks to the real environment can be reached.
  if (IMPORT_OF("openai-[\\w-]+\\.mjs").test(code)) {
    for (const call of callProperties(src, "performSingleRequest")) {
      for (const p of unsafeSendCall(call, src)) {
        add("send-call", "performSingleRequest(" + norm(call.rawArgs) + ")", "performSingleRequest — " + p, call.line);
      }
    }
  }
  // D-145: a test that exercises an adapter or its CLI must never reach the REAL user identity —
  // not through the adapter's own resolvers, not through fs on an exported production path, and not
  // by handing a child process this process's environment. Isolated allowlists and explicit
  // temporary paths stay allowed; that is what these rules are written to permit.
  if (!TESTS_AN_ADAPTER.test(src)) return findings;
  const b = blankLiterals(src);
  const lineOf = (index) => b.slice(0, index).split("\n").length;

  for (const fn of ["resolveClaimPath", "proposedClaimPath"]) {
    for (const call of callProperties(src, fn)) {
      const construct = fn + "(" + norm(call.rawArgs) + ")";
      const env = call.props.find((p) => p.key === "env");
      if (!call.objectLiteral) add("claim-identity", construct, fn + " — the options are not an object literal, so the identity cannot be proven", call.line);
      else if (!env) add("claim-identity", construct, fn + " — no explicit env, so it falls back to the real process.env", call.line);
      else if (/process\.env/.test(env.blank)) add("claim-identity", construct, fn + " — env is the real process.env", call.line);
    }
  }
  for (const call of callProperties(src, "outputPaths")) {
    if (call.args.trim() === "" || /process\.env/.test(call.args)) {
      add("output-directory", "outputPaths(" + norm(call.rawArgs) + ")", "outputPaths — no explicit directory, so it resolves the real build area", call.line);
    }
  }
  // A path that came from one of the calls above is production too, whatever it was named. Only
  // MUTATING calls are tracked that way: a read through such a name is already reported at its
  // source, above, and tracking reads here would re-report the same debt twice.
  const flagged = new Set(findings.filter((f) => f.rule === "claim-identity" || f.rule === "output-directory")
    .map((f) => f.construct));
  const tainted = new Set();
  for (const m of b.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^\n;]*)/g)) {
    const rhs = norm(src.slice(m.index, m.index + m[0].length));
    if ([...flagged].some((c) => rhs.includes(c))) tainted.add(m[1]);
  }
  const production = (args) => /(^|[^\w$.])OUT\b|\.OUT\b/.test(args)
    || [...tainted].some((name) => new RegExp("(^|[^\\w$.])" + name + "\\b").test(args));
  for (const m of b.matchAll(new RegExp("\\b(" + FS_READ + "|" + FS_WRITE + ")\\s*\\(([^)]*)", "g"))) {
    const write = new RegExp("^(?:" + FS_WRITE + ")$").test(m[1]);
    if (!(write ? production(m[2]) : /(^|[^\w$.])OUT\b|\.OUT\b/.test(m[2]))) continue;
    add(write ? "fs-write-on-production-path" : "fs-read-on-production-path",
      m[1] + "(" + norm(src.slice(m.index + m[1].length + 1, m.index + m[0].length)) + ")",
      m[1] + " on an adapter-exported production path", lineOf(m.index));
  }
  // the environment a child process is given, judged at the call site
  const childSpans = [];
  for (const call of callProperties(src, "(?:" + CHILD + ")")) {
    const raw = call.rawArgs;
    childSpans.push(raw);
    const construct = "child(" + norm(raw) + ")";
    if (/\.\.\.\s*process\.env\b|\benv\s*:\s*process\.env\b/.test(blankLiterals(raw))) {
      add("child-environment", construct, "a child process is handed this process's environment", call.line);
    } else if (/process\.execPath|\bADAPTER\w*\b|openai-[\w-]+\.mjs/.test(raw)
      && !/(^|[^\w$.])env\s*[:,}]/.test(blankLiterals(raw))) {
      // `env: x` or the shorthand `env` — either way the environment is chosen at the call site
      add("child-environment", construct, "an adapter CLI runs with this process's environment", call.line);
    }
  }
  // …and anywhere else, which no exception covers
  for (const m of b.matchAll(/\.\.\.\s*process\.env\b|\benv\s*:\s*process\.env\b/g)) {
    const line = src.split("\n")[lineOf(m.index) - 1];
    if (childSpans.some((raw) => raw.includes(line.trim()) || line.includes(norm(raw).slice(0, 40)))) continue;
    add("environment-spread", norm(line), "this process's environment is spread outside a child-process call", lineOf(m.index));
  }
  return findings;
}

// ── the ONE narrow exception list (D-145) ────────────────────────────────────────────────────
//
// Two suites predate these rules and carry read-only debt: they resolve the real claim location or
// the real output directory and then LOOK at it. Hardening them is its own piece of work, so D-145
// names each occurrence instead — by file, by rule, by the exact construct and by count, never by
// line number. An exception can only ever excuse a READ. It can never excuse send: true, a real
// fetch, reading the key, writing, deleting, renaming or moving a real claim or output, an extra
// occurrence, a changed construct, or the same pattern in any other file. When the construct is
// removed, its exception stops matching and the guard FAILS until the exception is deleted too.
// This is not a precedent, and it may not be widened without a new owner decision.
const LEGACY_DEBT = "existing read-only test debt";
const LEGACY_EXCEPTIONS = Object.freeze([
  Object.freeze({
    id: "d129-fitting-base-real-claim-compare",
    file: "tests/unit/avatar-fitting-base-request-adapter.test.mjs",
    rule: "claim-identity",
    construct: "resolveClaimPath({ repoRoot: REPO })",
    occurrences: 1,
    classification: LEGACY_DEBT,
    reason: "D-129's suite proves its own throwaway claim path is not the real one. It resolves the real "
      + "location and compares strings; it never opens, writes or deletes it.",
  }),
  Object.freeze({
    id: "d121-northstar-real-claim-resolve",
    file: "tests/unit/avatar-northstar-d-refinement-adapter.test.mjs",
    rule: "claim-identity",
    construct: "resolveClaimPath({ repoRoot: REPO })",
    occurrences: 2,
    classification: LEGACY_DEBT,
    reason: "D-121's suite is state-aware by design: its mandate was spent, so the claim exists forever. "
      + "It reads the claim's fingerprint to prove a run WITHOUT both flags changes nothing. Read-only.",
  }),
  Object.freeze({
    id: "d121-northstar-cross-clone-claim",
    file: "tests/unit/avatar-northstar-d-refinement-adapter.test.mjs",
    rule: "claim-identity",
    construct: "resolveClaimPath({ repoRoot: ROOT_CLONE })",
    occurrences: 1,
    classification: LEGACY_DEBT,
    reason: "The cross-clone property: both clones must resolve to ONE claim file. It compares the two "
      + "resolved paths as strings and opens neither.",
  }),
  Object.freeze({
    id: "d121-northstar-real-output-paths",
    file: "tests/unit/avatar-northstar-d-refinement-adapter.test.mjs",
    rule: "output-directory",
    construct: "outputPaths()",
    occurrences: 2,
    classification: LEGACY_DEBT,
    reason: "The same state-aware design for the outputs of D-121's completed call, plus one assertion "
      + "that the default output stays in the gitignored build area. Read-only.",
  }),
  Object.freeze({
    id: "d121-northstar-cli-environment",
    file: "tests/unit/avatar-northstar-d-refinement-adapter.test.mjs",
    rule: "child-environment",
    construct: "child(process.execPath, [ADAPTER, ...args], { cwd: REPO, encoding: \"utf8\", env: { ...process.env, OPENAI_API_KEY: DUMMY_KEY }, })",
    occurrences: 1,
    classification: LEGACY_DEBT,
    reason: "D-121's CLI is run without the approval token, so it cannot send. The spread carries the real "
      + "environment, but the key is overridden with a dummy, so the owner's key never reaches the child.",
  }),
]);

/** Splits findings into what an exception covers and what remains. Counting is per exception. */
function applyExceptions(rel, findings) {
  const remaining = [];
  const used = new Map();
  for (const f of findings) {
    const ex = EXCUSABLE_RULES.has(f.rule)
      ? LEGACY_EXCEPTIONS.find((e) => e.file === rel && e.rule === f.rule && e.construct === f.construct)
      : undefined;
    if (!ex) { remaining.push(f); continue; }
    const n = (used.get(ex.id) || 0) + 1;
    used.set(ex.id, n);
    if (n > ex.occurrences) remaining.push({ ...f, message: f.message + " — beyond the " + ex.occurrences + " occurrence(s) the exception covers" });
  }
  return { remaining, used };
}

/** Every file under tests/, scanned. */
function scanTestTree() {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== "node_modules" && !name.endsWith("-snapshots")) walk(p); continue; }
      if (!/\.(mjs|cjs|js|ts)$/.test(name)) continue;
      const rel = relative(REPO, p).split(sep).join("/");
      files.push({ rel, src: readFileSync(p, "utf8") });
    }
  };
  walk(join(REPO, "tests"));
  return files;
}

/** Source with the CONTENTS of strings, template literals, regex literals and comments blanked,
 *  preserving length and newlines, so structure can be read without matching text inside them. */
function blankLiterals(src) {
  const out = src.split("");
  const n = src.length;
  const blank = (a, b) => { for (let k = a; k < b && k < n; k++) if (out[k] !== "\n") out[k] = " "; };
  let i = 0;
  let last = "";
  while (i < n) {
    const ch = src[i];
    const nx = src[i + 1];
    if (ch === "/" && nx === "/") { const e = src.indexOf("\n", i); const end = e < 0 ? n : e; blank(i, end); i = end; continue; }
    if (ch === "/" && nx === "*") { const e = src.indexOf("*/", i + 2); const end = e < 0 ? n : e + 2; blank(i, end); i = end; continue; }
    if (ch === "\"" || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < n && src[j] !== ch) j += src[j] === "\\" ? 2 : 1;
      blank(i + 1, j); i = j + 1; last = ch; continue;
    }
    if (ch === "/" && (last === "" || "(,=:[!&|?{};+-*%<>~^".includes(last))) {
      let j = i + 1;
      let inClass = false;
      while (j < n && src[j] !== "\n") {
        const c = src[j];
        if (c === "\\") { j += 2; continue; }
        if (c === "[") inClass = true; else if (c === "]") inClass = false; else if (c === "/" && !inClass) break;
        j++;
      }
      blank(i + 1, j); i = j + 1; last = "/"; continue;
    }
    if (!/\s/.test(ch)) last = ch;
    i++;
  }
  return out.join("");
}

/** Every call `fnName(...)` in src, with the raw and blanked text of its top-level properties. */
function callProperties(src, fnName) {
  const b = blankLiterals(src);
  const re = new RegExp("\\b" + fnName + "\\s*\\(", "g");
  const calls = [];
  let m;
  while ((m = re.exec(b))) {
    const start = m.index + m[0].length;
    let depth = 1;
    let j = start;
    while (j < b.length && depth > 0) {
      if ("({[".includes(b[j])) depth++; else if (")}]".includes(b[j])) depth--;
      j++;
    }
    const argB = b.slice(start, j - 1);
    const lead = argB.length - argB.trimStart().length;
    const line = b.slice(0, m.index).split("\n").length;
    const common = { line, args: argB, rawArgs: src.slice(start, j - 1) };
    if (!argB.trim().startsWith("{") || !argB.trim().endsWith("}")) { calls.push({ ...common, objectLiteral: false, props: [] }); continue; }
    const open = start + lead + 1;
    const close = start + argB.trimEnd().length - 1;
    const props = [];
    let d = 0;
    let cur = open;
    for (let k = open; k <= close; k++) {
      const c = k === close ? "," : b[k];
      if ("({[".includes(c)) d++; else if (")}]".includes(c)) d--;
      else if (c === "," && d === 0) {
        const rawP = src.slice(cur, k).trim();
        const blP = b.slice(cur, k).trim();
        if (blP !== "") {
          const colon = blP.search(/:/);
          const key = colon < 0 ? blP : blP.slice(0, colon).trim();
          props.push({ key, raw: colon < 0 ? rawP : rawP.slice(colon + 1).trim(), blank: colon < 0 ? blP : blP.slice(colon + 1).trim() });
        }
        cur = k + 1;
      }
    }
    calls.push({ ...common, objectLiteral: true, props });
  }
  return calls;
}

/** Why one in-process send call could reach the real environment, or [] when every injection is explicit. */
function unsafeSendCall(call, src) {
  if (!call.objectLiteral) return ["the argument is not an object literal, so its injections cannot be proven"];
  const problems = [];
  const byKey = new Map(call.props.map((p) => [p.key, p]));
  for (const p of call.props) if (p.key.startsWith("...")) problems.push("a spread can override an injection");
  for (const key of ["fetchImpl", "claimPath", "outDir", "apiKey"]) if (!byKey.has(key)) problems.push("no explicit " + key);
  const real = /process\.env|resolveClaimPath|proposedClaimPath|outputPaths|homedir|LOCALAPPDATA|XDG_STATE_HOME|\bOUT\b/;
  const f = byKey.get("fetchImpl");
  if (f && (/^(globalThis\.)?fetch$/.test(f.blank) || real.test(f.blank))) problems.push("fetchImpl is the real fetch");
  for (const key of ["claimPath", "outDir"]) {
    const p = byKey.get(key);
    if (p && real.test(p.blank)) problems.push(key + " is derived from the real environment");
  }
  const k = byKey.get("apiKey");
  if (k) {
    const literal = /^(["'`])[^"'`]*\1$/.test(k.raw);
    const constant = /^[A-Za-z_$][\w$]*$/.test(k.raw)
      && new RegExp("\\bconst\\s+" + k.raw + "\\s*=\\s*[\"'`][^\"'`]*[\"'`]").test(src);
    if (!literal && !constant) problems.push("apiKey is not a literal dummy value");
  }
  return problems;
}

/** A sample judged as if it were a new test file: no exception can apply to a name that has none. */
const dangerousConstructs = (src) => scanSource("tests/unit/sample-not-an-excepted-file.test.mjs", src)
  .map((f) => (f.line ? "line " + f.line + ": " : "") + f.message);

test("GUARD: no file under tests/ contains the D-142 construction or an uninjected in-process send call", () => {
  // non-vacuity first: the guard must fire on the exact shape of the incident
  const q = "\"";
  const incident = "import * as A fr" + "om " + q + "../../tools/avatar/openai-generate-r3-underlay-core.mjs" + q + ";\n"
    + "await A.sendOnce({ send" + ": true, ownerApproval: " + q + "D-142" + q + " });";
  assert.ok(dangerousConstructs(incident).length >= 1, "the guard must detect the D-142 construction");
  assert.ok(dangerousConstructs("const m = await imp" + "ort(" + q + "../../tools/avatar/openai-send-r3-underlay-core-d143.mjs" + q + ");").length >= 1);
  assert.ok(dangerousConstructs("const k = process.env.OPENAI_API" + "_KEY;").length >= 1);
  assert.deepEqual(dangerousConstructs("// fr" + "om " + q + "openai-x.mjs" + q + " send" + ": true"), [], "comment lines are not code");
  // D-145 non-vacuity: a legacy in-process call is rejected unless all four injections are explicit
  const imp = "import * as A fr" + "om " + q + "../../tools/avatar/openai-generate-r3-underlay.mjs" + q + ";\n";
  const call = (args) => imp + "await A.perform" + "SingleRequest({ " + args + " });";
  for (const args of [
    "pf, apiKey: " + q + "k" + q + ", outDir: o, claimPath: c",
    "pf, fetchImpl: fetch, apiKey: " + q + "k" + q + ", outDir: o, claimPath: c",
    "pf, fetchImpl: globalThis.fetch, apiKey: " + q + "k" + q + ", outDir: o, claimPath: c",
    "pf, fetchImpl: f, outDir: o, claimPath: c",
    "pf, fetchImpl: f, apiKey: process.env.KEY, outDir: o, claimPath: c",
    "pf, fetchImpl: f, apiKey: " + q + "k" + q + ", claimPath: c",
    "pf, fetchImpl: f, apiKey: " + q + "k" + q + ", outDir: A.OUT, claimPath: c",
    "pf, fetchImpl: f, apiKey: " + q + "k" + q + ", outDir: o",
    "pf, fetchImpl: f, apiKey: " + q + "k" + q + ", outDir: o, claimPath: A.resolveClaimPath().path",
    "pf, fetchImpl: f, apiKey: " + q + "k" + q + ", outDir: o, claimPath: c, ...opts",
  ]) assert.ok(dangerousConstructs(call(args)).length >= 1, "must be rejected: " + args);
  assert.ok(dangerousConstructs(imp + "await A.perform" + "SingleRequest(opts);").length >= 1, "a non-literal argument is rejected");
  assert.deepEqual(dangerousConstructs(call("pf, fetchImpl: async () => ({ status: 200 }), apiKey: " + q + "k" + q
    + ", outDir: join(dir, " + q + "out" + q + "), claimPath")), [], "a fully injected legacy call is allowed");

  // D-145 non-vacuity: the real user identity is unreachable from an adapter test, in every shape
  const names = imp;
  for (const [label, code] of [
    ["the real claim path", names + "const c = A.resolveClaimPath({ repoRoot: REPO });"],
    ["a proposed claim path", names + "const c = A.proposedClaimPath({ repoRoot: REPO });"],
    ["the real process.env", names + "const c = A.resolveClaimPath({ env: process.env, platform: " + q + "win32" + q + " });"],
    ["an unprovable options object", names + "const c = A.resolveClaimPath(opts);"],
    ["the real output directory", names + "const p = A.outputPaths();"],
    ["fs on an exported production path", names + "const there = existsSync(A.OUT);"],
    ["fs on a joined production path", names + "const there = readdirSync(join(C.OUT, " + q + "x" + q + "));"],
    ["a spread environment", names + "spawnSync(process.execPath, [ADAPTER], { env: { ...process.env } });"],
    ["the environment handed over whole", names + "spawnSync(process.execPath, [ADAPTER], { env: process.env });"],
    ["an adapter CLI with an inherited environment", names + "spawnSync(process.execPath, [ADAPTER, " + q + "--send" + q + "], { encoding: " + q + "utf8" + q + " });"],
  ]) assert.ok(dangerousConstructs(code).length >= 1, "must be rejected: " + label);

  for (const [label, code] of [
    ["an isolated identity", names + "const c = A.resolveClaimPath({ env: iso.env, platform: process.platform, tmpDir: iso.temp });"],
    ["a synthetic identity", names + "const c = A.proposedClaimPath({ env: { LOCALAPPDATA: " + q + "C:\\\\synthetic" + q + " }, platform: " + q + "win32" + q + " });"],
    ["an explicit output directory", names + "const p = A.outputPaths(join(dir, " + q + "out" + q + "));"],
    ["an allowlist environment for the CLI", names + "spawnSync(process.execPath, [ADAPTER], { env: iso.env, encoding: " + q + "utf8" + q + " });"],
    ["a child that is not an adapter CLI", names + "execFileSync(" + q + "git" + q + ", [" + q + "ls-files" + q + "], { encoding: " + q + "utf8" + q + " });"],
    ["fs on a sandbox path", names + "const there = existsSync(join(sandboxOut, " + q + "x" + q + "));"],
  ]) assert.deepEqual(dangerousConstructs(code), [], "must stay allowed: " + label);

  const offenders = [];
  for (const { rel, src } of scanTestTree()) {
    for (const f of applyExceptions(rel, scanSource(rel, src)).remaining) offenders.push(rel + ": line " + f.line + ": " + f.message);
  }
  assert.deepEqual(offenders, []);
});

// ── the narrow legacy exception list, held to its own terms (D-145) ───────────────────────────

test("D-145: every legacy exception is narrow, read-only, and still needed", () => {
  const seen = new Map();
  for (const { rel, src } of scanTestTree()) {
    for (const [id, n] of applyExceptions(rel, scanSource(rel, src)).used) seen.set(id, (seen.get(id) || 0) + n);
  }
  for (const e of LEGACY_EXCEPTIONS) {
    assert.ok(EXCUSABLE_RULES.has(e.rule), e.id + ": only a read-only rule may be excused");
    assert.equal(e.classification, LEGACY_DEBT, e.id + ": an exception is debt, never a design");
    assert.ok(e.reason.length > 60, e.id + ": the reason must say why the read is safe");
    assert.ok(existsSync(join(REPO, ...e.file.split("/"))), e.id + ": names a file that exists");
    assert.ok(e.occurrences >= 1);
    // it is still needed, and covers no more than it is used for: a removed construct fails here
    assert.equal(seen.get(e.id) || 0, e.occurrences,
      e.id + ": the exception must be used exactly " + e.occurrences + " time(s). If the legacy construct is gone, delete the exception.");
  }
  // only the two named legacy files may carry any exception at all
  assert.deepEqual([...new Set(LEGACY_EXCEPTIONS.map((e) => e.file))].sort(), [
    "tests/unit/avatar-fitting-base-request-adapter.test.mjs",
    "tests/unit/avatar-northstar-d-refinement-adapter.test.mjs",
  ]);
  assert.equal(LEGACY_EXCEPTIONS.length, 5);
});

test("D-145: an exception covers its own construct ONLY — not one more, not a changed one, not another file", () => {
  const FB = "tests/unit/avatar-fitting-base-request-adapter.test.mjs";
  const NS = "tests/unit/avatar-northstar-d-refinement-adapter.test.mjs";
  const read = (rel) => readFileSync(join(REPO, ...rel.split("/")), "utf8");
  const remaining = (rel, src) => applyExceptions(rel, scanSource(rel, src)).remaining;

  // as they stand, both files are fully covered
  assert.deepEqual(remaining(FB, read(FB)), []);
  assert.deepEqual(remaining(NS, read(NS)), []);

  // ONE more occurrence of the very same construct is refused
  const oneMore = read(FB) + "\nconst extra = A.resolveClaimPath({ repoRoot: REPO });\n";
  assert.equal(remaining(FB, oneMore).length, 1, "an added occurrence is not covered");
  assert.match(remaining(FB, oneMore)[0].message, /beyond the 1 occurrence/);

  // a CHANGED construct is a different construct, and is refused
  const changed = read(FB).replace("A.resolveClaimPath({ repoRoot: REPO })", "A.resolveClaimPath({ repoRoot: REPO, platform: process.platform })");
  assert.ok(changed !== read(FB), "the construct must be present to be changed");
  assert.equal(remaining(FB, changed).length, 1, "a changed construct loses its exception");

  // the same construct in ANY other file is refused
  const elsewhere = "import * as A fr" + "om \"../../tools/avatar/openai-generate-r3-underlay.mjs\";\n"
    + "const c = A.resolveClaimPath({ repoRoot: REPO });\n";
  assert.equal(remaining("tests/unit/some-other-adapter.test.mjs", elsewhere).length, 1, "an exception is bound to its file");
  // and the count is per file: NS's two occurrences do not cover a third in FB
  assert.equal(remaining(NS, read(NS) + "\nconst extra = resolveClaimPath({ repoRoot: REPO });\n").length, 1,
    "the third occurrence in the two-occurrence file is refused");
});

test("D-145: no exception can excuse a write, a delete, a send or the key — not even in the named files", () => {
  const NS = "tests/unit/avatar-northstar-d-refinement-adapter.test.mjs";
  const src = readFileSync(join(REPO, ...NS.split("/")), "utf8");
  const q = "\"";
  for (const [label, line] of [
    ["writeFileSync", "writeFileSync(realOut.raw, " + q + "x" + q + ");"],
    ["rmSync", "rmSync(outputPaths().dir, { recursive: true });"],
    ["unlinkSync", "unlinkSync(REAL_CLAIM.path);"],
    ["renameSync", "renameSync(A.OUT, A.OUT + " + q + ".bak" + q + ");"],
    ["mkdirSync", "mkdirSync(A.OUT, { recursive: true });"],
    ["a write through an exported path", "writeFileSync(join(A.OUT, " + q + "raw.png" + q + "), buf);"],
    ["the key", "const k = process.env.OPENAI_API" + "_KEY;"],
    ["a send", "await performSingleRequest({ pf, send" + ": true });"],
  ]) {
    const findings = applyExceptions(NS, scanSource(NS, src + "\n" + line + "\n")).remaining;
    assert.ok(findings.length >= 1, "must stay refused inside an excepted file: " + label);
  }
});

test("D-145: an exception goes stale the moment its legacy construct is removed", () => {
  const NS = "tests/unit/avatar-northstar-d-refinement-adapter.test.mjs";
  const src = readFileSync(join(REPO, ...NS.split("/")), "utf8");
  const ex = LEGACY_EXCEPTIONS.find((e) => e.id === "d121-northstar-cross-clone-claim");
  const hardened = src.replace("resolveClaimPath({ repoRoot: ROOT_CLONE })",
    "resolveClaimPath({ env: iso.env, platform: process.platform, repoRoot: ROOT_CLONE })");
  assert.ok(hardened !== src, "the construct must be present for this to mean anything");
  const { remaining, used } = applyExceptions(NS, scanSource(NS, hardened));
  assert.deepEqual(remaining, [], "the hardened call is clean");
  assert.equal(used.get(ex.id) || 0, 0, "and its exception is now unused");
  // which is exactly what the integrity test above turns into a failure, so the list cannot rot
});

test("the D-139 adapter and the CORE preparation adapter are byte-unchanged, and neither is used", () => {
  assert.equal(sha256(readFileSync(repoFile("tools/avatar/openai-generate-r3-underlay.mjs"))),
    "b206ac7acefe07050c97c03f552bd397144444f1a8e9e6237fdce2d078ea3313", "the D-139 adapter must not change");
  assert.equal(sha256(readFileSync(repoFile("tools/avatar/openai-generate-r3-underlay-core.mjs"))),
    "492ee40ff4bee17d30ab7a92db57a895300749caa9463e9111acbb02557fc3d3", "the CORE preparation adapter must not change");
  assert.ok(!CODE.includes("openai-generate-r3-underlay"), "the send adapter must not reference either adapter");
  for (const spent of ["D-139-r3-underlay-head-only-v1", "D-142-r3-underlay-core-v1"]) {
    assert.ok(!new RegExp("const CALL_ID = \"" + spent).test(CODE));
  }
  for (const claim of ["D-121.claim.json", "D-129.claim.json", "D-139.claim.json", "D-142.claim.json"]) {
    assert.ok(!CODE.includes(claim), "the send adapter never names another decision's claim: " + claim);
  }
});

// ── the sandbox ──────────────────────────────────────────────────────────────────────────────

const MOCK_SOURCE = [
  "import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from \"node:fs\";",
  "import { createHash } from \"node:crypto\";",
  "import { join } from \"node:path\";",
  "const RECORD = process.env.D143_MOCK_RECORD;",
  "const CLAIM_ROOT = process.env.D143_MOCK_CLAIM_ROOT;",
  "const SCENARIO = process.env.D143_MOCK_SCENARIO;",
  "const PNG = process.env.D143_MOCK_PNG;",
  "if (!RECORD || !CLAIM_ROOT || !SCENARIO || !PNG) throw new Error(\"d143 mock: not configured; the process must not start\");",
  "const ENDPOINT = \"https://api.openai.com/v1/images/edits\";",
  "const sha = (b) => createHash(\"sha256\").update(b).digest(\"hex\");",
  "const claims = (dir) => { const out = []; if (!existsSync(dir)) return out;",
  "  for (const n of readdirSync(dir)) { const p = join(dir, n); const s = statSync(p);",
  "    if (s.isDirectory()) out.push(...claims(p)); else if (n === \"D-143.claim.json\") out.push({ path: p, bytes: s.size }); }",
  "  return out; };",
  "const record = (entry) => { const all = existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, \"utf8\")) : [];",
  "  all.push(entry); writeFileSync(RECORD, JSON.stringify(all, null, 2)); };",
  "async function d143MockFetch(url, init) {",
  "  const headers = init && init.headers ? init.headers : {};",
  "  const entry = { url: String(url), method: init ? init.method : null, authorization: headers.Authorization || null,",
  "    claimsAtCall: claims(CLAIM_ROOT), scenario: SCENARIO, fields: [] };",
  "  const body = init ? init.body : null;",
  "  if (body && typeof body.entries === \"function\") {",
  "    for (const [name, v] of body.entries()) {",
  "      if (typeof v === \"string\") entry.fields.push({ name, text: v.length <= 64 ? v : null, bytes: Buffer.byteLength(v), sha256: sha(Buffer.from(v, \"utf8\")) });",
  "      else { const b = Buffer.from(await v.arrayBuffer()); entry.fields.push({ name, filename: v.name, type: v.type, bytes: b.length, sha256: sha(b) }); }",
  "    }",
  "  }",
  "  record(entry);",
  "  if (String(url) !== ENDPOINT) throw new Error(\"d143 mock: refusing an unexpected url\");",
  "  const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { \"content-type\": \"application/json\", \"x-request-id\": \"req_d143_mock\" } });",
  "  switch (SCENARIO) {",
  "    case \"success\": return json(200, { data: [{ b64_json: readFileSync(PNG, \"utf8\") }], usage: { total_tokens: 7 } });",
  "    case \"http-400\": return json(400, { error: { type: \"invalid_request_error\", code: \"mock\", message: \"mock refusal\" } });",
  "    case \"transport\": throw new TypeError(\"d143 mock: simulated transport failure\");",
  "    case \"not-json\": return new Response(\"<html>not json</html>\", { status: 200, headers: { \"x-request-id\": \"req_d143_mock\" } });",
  "    case \"bad-payload\": return json(200, { data: [] });",
  "    case \"bad-base64\": return json(200, { data: [{ b64_json: \"@@not base64@@\" }] });",
  "    case \"not-png\": return json(200, { data: [{ b64_json: Buffer.from(\"this is not a png, but it is long enough to hold a header\").toString(\"base64\") }] });",
  "    case \"body-read\": return { status: 200, headers: new Headers({ \"x-request-id\": \"req_d143_mock\" }), text: async () => { throw new Error(\"d143 mock: simulated body read failure\"); } };",
  "    default: throw new Error(\"d143 mock: unknown scenario \" + SCENARIO);",
  "  }",
  "}",
  "Object.defineProperty(d143MockFetch, \"__d143MockFetch\", { value: true });",
  "globalThis.fetch = d143MockFetch;",
  "",
].join("\n");

const PROBE_SOURCE = [
  "import { tmpdir, homedir } from \"node:os\";",
  "const out = { mock: typeof globalThis.fetch === \"function\" && globalThis.fetch.__d143MockFetch === true,",
  "  tmpdir: tmpdir(), homedir: homedir(), local: process.env.LOCALAPPDATA || null, xdg: process.env.XDG_STATE_HOME || null,",
  "  keyIsDummy: process.env.OPENAI_API" + "_KEY === process.argv[2], envKeys: Object.keys(process.env),",
  "  vals: Object.fromEntries([\"HOMEDRIVE\", \"HOMEPATH\", \"USERNAME\", \"USERPROFILE\", \"TEMP\", \"TMP\", \"TMPDIR\", \"HOME\"].map((k) => [k, process.env[k] || null])) };",
  "try { await globalThis.fetch(\"https://example.invalid/d143-probe\", { method: \"GET\" }); out.probeThrew = null; }",
  "catch (e) { out.probeThrew = String(e && e.message); }",
  "console.log(JSON.stringify(out));",
  "",
].join("\n");

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function makePng(w, h) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.alloc(h * (w * 4 + 1)))), chunk("IEND", Buffer.alloc(0))]);
}

const SYSTEM_ENV = new Set(["SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "COMSPEC", "PATHEXT", "PATH", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "OS"]);
// On Windows libuv copies HOMEDRIVE, HOMEPATH, LOGONSERVER, USERDOMAIN and USERNAME from the PARENT
// into a child whose environment lacks them. They are therefore set explicitly to sandbox values,
// so nothing reaches the child by inheritance.
const WINDOWS_IDENTITY_ENV = ["HOMEDRIVE", "HOMEPATH", "LOGONSERVER", "USERDOMAIN", "USERNAME"];
const ALLOWED_ENV = new Set([...SYSTEM_ENV, ...WINDOWS_IDENTITY_ENV, "HOME", "USERPROFILE", "GIT_CONFIG_NOSYSTEM", "GIT_CONFIG_GLOBAL", "GIT_TERMINAL_PROMPT",
  "LOCALAPPDATA", "XDG_STATE_HOME", "TEMP", "TMP", "TMPDIR", "HTTP_PROXY", "HTTPS_PROXY", "NODE_USE_ENV_PROXY",
  "OPENAI_API_KEY", "D143_MOCK_RECORD", "D143_MOCK_CLAIM_ROOT", "D143_MOCK_SCENARIO", "D143_MOCK_PNG"]);
const ISOLATION = { proven: false };
let SB = null;

function sandbox() {
  if (SB) return SB;
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "d143-sandbox-")));
  const token = randomBytes(16).toString("hex");
  writeFileSync(join(root, ".d143-sandbox"), token);
  mkdirSync(join(root, "home"), { recursive: true });
  writeFileSync(join(root, "home", ".gitconfig"), "[user]\n\tname = d143-sandbox\n\temail = d143-sandbox@example.invalid\n"
    + "[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n[advice]\n\tdetachedHead = false\n");
  writeFileSync(join(root, "mock-fetch.mjs"), MOCK_SOURCE);
  writeFileSync(join(root, "probe.mjs"), PROBE_SOURCE);
  writeFileSync(join(root, "result.b64"), makePng(1024, 1536).toString("base64"));
  SB = { root, token, mock: join(root, "mock-fetch.mjs"), probe: join(root, "probe.mjs"), png: join(root, "result.b64"),
    origins: new Map(), n: 0, h1: undefined };
  return SB;
}

after(() => {
  // Removes ONLY the sandbox this run created: a mkdtemp directory inside temp, with this run's token.
  if (!SB || process.env.D143_KEEP_SANDBOX) return;
  const tmp = realpathSync.native(tmpdir());
  const marker = join(SB.root, ".d143-sandbox");
  const ours = isInside(SB.root, tmp) && SB.root !== tmp && basename(SB.root).startsWith("d143-sandbox-")
    && existsSync(marker) && readFileSync(marker, "utf8") === SB.token;
  if (!ours) { console.error("d143 sandbox NOT removed; it failed its own identity check: " + SB.root); return; }
  try { rmSync(SB.root, { recursive: true, force: true, maxRetries: 3 }); }
  catch (e) { console.error("d143 sandbox could not be removed: " + SB.root + ": " + e.message); }
});

function baseEnv() {
  const sb = sandbox();
  const env = {};
  for (const k of Object.keys(process.env)) if (SYSTEM_ENV.has(k.toUpperCase())) env[k] = process.env[k];
  const home = join(sb.root, "home");
  Object.assign(env, { HOME: home, USERPROFILE: home, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(home, ".gitconfig"),
    GIT_TERMINAL_PROMPT: "0" });
  if (process.platform === "win32") {
    const drive = home.slice(0, 2);
    Object.assign(env, { HOMEDRIVE: drive, HOMEPATH: home.slice(2), LOGONSERVER: "\\\\d143-sandbox",
      USERDOMAIN: "d143-sandbox", USERNAME: "d143-sandbox" });
  }
  return env;
}

function childEnv(sc, opts) {
  const o = opts || {};
  const env = baseEnv();
  Object.assign(env, { LOCALAPPDATA: sc.state, XDG_STATE_HOME: sc.state, TEMP: sc.tmp, TMP: sc.tmp, TMPDIR: sc.tmp,
    HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9", NODE_USE_ENV_PROXY: "1",
    D143_MOCK_RECORD: sc.record, D143_MOCK_CLAIM_ROOT: sc.state, D143_MOCK_SCENARIO: o.scenario || "success",
    D143_MOCK_PNG: sandbox().png });
  if (o.key !== false) env.OPENAI_API_KEY = typeof o.key === "string" ? o.key : DUMMY_KEY;
  return env;
}

function assertIsolated(env, sc, args) {
  for (const k of Object.keys(env)) assert.ok(ALLOWED_ENV.has(k.toUpperCase()), "environment variable not on the allowlist: " + k);
  for (const k of ["LOCALAPPDATA", "XDG_STATE_HOME", "D143_MOCK_CLAIM_ROOT"]) assert.ok(isInside(env[k], sc.state), k + " must be the sandbox state");
  for (const k of ["TEMP", "TMP", "TMPDIR"]) assert.ok(isInside(env[k], sc.tmp), k + " must be the sandbox temp");
  for (const k of ["HOME", "USERPROFILE", "GIT_CONFIG_GLOBAL", "D143_MOCK_RECORD", "D143_MOCK_PNG"]) assert.ok(isInside(env[k], sc.root), k + " must be in the sandbox");
  if (process.platform === "win32") {
    assert.ok(isInside(env.HOMEDRIVE + env.HOMEPATH, sc.root), "HOMEDRIVE+HOMEPATH must be the sandbox home");
    for (const k of ["LOGONSERVER", "USERDOMAIN", "USERNAME"]) assert.match(env[k], /d143-sandbox/, k + " must be a sandbox value");
  }
  assert.ok(env.OPENAI_API_KEY === undefined || env.OPENAI_API_KEY === "" || env.OPENAI_API_KEY === DUMMY_KEY, "only the dummy key");
  assert.ok(!Object.keys(env).some((k) => k.toUpperCase() === "FITTING_BASE_V1_PATH"), "H1 reaches the child only as a sandbox --h1");
  const i = (args || []).indexOf("--h1");
  if (i >= 0) assert.ok(isInside(args[i + 1], sc.root), "--h1 must point into the sandbox");
}

function sgit(cwd, args) {
  const r = spawnSync("git", args, { cwd, env: baseEnv(), encoding: "utf8", windowsHide: true });
  assert.equal(r.status, 0, "git " + args.join(" ") + " failed: " + (r.stderr || (r.error && r.error.message)));
  return (r.stdout || "").trim();
}

/** A bare origin whose main holds the tracked inputs, optionally mutated, omitted or advanced. */
function origin(name, opts) {
  const sb = sandbox();
  if (sb.origins.has(name)) return sb.origins.get(name);
  const o = opts || {};
  const seed = join(sb.root, "seeds", name);
  mkdirSync(seed, { recursive: true });
  sgit(seed, ["init", "-q", "-b", "main"]);
  for (const rel of [...TRACKED, ".gitattributes"]) {
    if ((o.omit || []).includes(rel)) continue;
    const dst = join(seed, ...rel.split("/"));
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, historicBytes(rel));
  }
  for (const [rel, buf] of Object.entries(o.replace || {})) writeFileSync(join(seed, ...rel.split("/")), buf);
  sgit(seed, ["add", "-A"]);
  sgit(seed, ["commit", "-q", "-m", "seed " + name]);
  if (o.extraCommit) {
    writeFileSync(join(seed, "NOTE.txt"), "a later commit on origin/main\n");
    sgit(seed, ["add", "-A"]);
    sgit(seed, ["commit", "-q", "-m", "second"]);
  }
  const bare = join(sb.root, "origins", name + ".git");
  mkdirSync(dirname(bare), { recursive: true });
  sgit(sb.root, ["init", "-q", "--bare", "-b", "main", bare]);
  sgit(seed, ["push", "-q", bare, "main"]);
  sb.origins.set(name, bare);
  return bare;
}

function scenario(bare) {
  const sb = sandbox();
  const dir = join(sb.root, "sc", String(++sb.n));
  const sc = { root: sb.root, dir, clone: join(dir, "clone"), state: join(dir, "state"), tmp: join(dir, "tmp"), record: join(dir, "mock-record.json") };
  mkdirSync(sc.state, { recursive: true });
  mkdirSync(sc.tmp, { recursive: true });
  sgit(sb.root, ["clone", "-q", bare, sc.clone]);
  return sc;
}

function runAdapter(sc, args, opts) {
  assert.equal(ISOLATION.proven, true, "sandbox isolation was not proven; the adapter is NOT run");
  const env = childEnv(sc, opts);
  assertIsolated(env, sc, args);
  const r = spawnSync(process.execPath, ["--import", pathToFileURL(sandbox().mock).href, join(sc.clone, ...ADAPTER_REL.split("/")), ...args],
    { cwd: sc.clone, env, encoding: "utf8", timeout: 180000, windowsHide: true });
  if (r.error) throw r.error;
  const record = existsSync(sc.record) ? JSON.parse(readFileSync(sc.record, "utf8")) : [];
  return { status: r.status, out: (r.stdout || "") + (r.stderr || ""), record };
}

function claimsUnder(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...claimsUnder(p)); else if (n === "D-143.claim.json") out.push(p);
  }
  return out;
}

function assertRefused(r, sc, stage, opts) {
  assert.equal(r.status, 1, r.out);
  assert.ok(r.out.includes("REFUSED [" + stage + "]"), "expected refusal at " + stage + ", got:\n" + r.out);
  assert.equal(r.record.length, 0, "the mock fetch must not have been called");
  assert.deepEqual(claimsUnder(sc.state), (opts && opts.claims) || [], "no claim may be created by a refusal");
  if (!(opts && opts.outputsPreexist)) assert.equal(existsSync(join(sc.clone, ...OUT_DIR_PARTS)), false, "no output directory");
  assert.ok(!r.out.includes(DUMMY_KEY), "the key is never printed");
}

const repoBytes = (rel) => readFileSync(repoFile(rel));
const withoutRow = (text, id) => text.split("\n").filter((l) => !l.startsWith("| **" + id + "** |")).join("\n");
/** The pre-D-147 bytes of a tracked input: the reconstructed contract, the register without D-147's row, else the file. */
function historicBytes(rel) {
  if (rel === CONTRACT_REL) return Buffer.from(JSON.stringify(CONTRACT, null, 2) + "\n");
  if (rel === REGISTER_REL) return Buffer.from(withoutRow(repoBytes(REGISTER_REL).toString("utf8"), "D-147"));
  return repoBytes(rel);
}
const plusOneByte = (buf) => Buffer.concat([buf, Buffer.from([0x0a])]);
const contractWith = (fn) => { const c = JSON.parse(historicBytes(CONTRACT_REL).toString("utf8")); fn(c); return Buffer.from(JSON.stringify(c, null, 2) + "\n"); };
const registerWithout = (id) => Buffer.from(withoutRow(historicBytes(REGISTER_REL).toString("utf8"), id));
const withoutD143Entry = () => contractWith((c) => { c.authorisedCalls.calls = c.authorisedCalls.calls.filter((e) => e.callId !== "D-143-r3-underlay-core-v2"); });
const SEND = ["--send", APPROVAL];

// ── 1. isolation, proven before anything else runs ───────────────────────────────────────────

test("ISOLATION PROOF — the child sees only the sandbox, the dummy key and the mock fetch", () => {
  const sb = sandbox();
  const dir = join(sb.root, "probe");
  const sc = { root: sb.root, dir, clone: dir, state: join(dir, "state"), tmp: join(dir, "tmp"), record: join(dir, "record.json") };
  mkdirSync(sc.state, { recursive: true });
  mkdirSync(sc.tmp, { recursive: true });
  const env = childEnv(sc, {});
  assertIsolated(env, sc, []);

  // an unconfigured mock aborts the process BEFORE any main module runs
  const bare = baseEnv();
  const unconfigured = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, "-e", "console.log('MAIN-RAN')"],
    { cwd: dir, env: bare, encoding: "utf8", windowsHide: true });
  assert.notEqual(unconfigured.status, 0, "an unconfigured mock must stop the process");
  assert.ok(!(unconfigured.stdout || "").includes("MAIN-RAN"), "the main module must never run without the mock");

  const p = spawnSync(process.execPath, ["--import", pathToFileURL(sb.mock).href, sb.probe, DUMMY_KEY],
    { cwd: dir, env, encoding: "utf8", windowsHide: true });
  assert.equal(p.status, 0, p.stderr);
  const o = JSON.parse(p.stdout.trim());
  assert.equal(o.mock, true, "globalThis.fetch is the mock, installed from outside");
  assert.ok(isInside(o.tmpdir, sc.tmp), "os.tmpdir() is the sandbox temp: " + o.tmpdir);
  assert.ok(isInside(o.homedir, sb.root), "os.homedir() is the sandbox home: " + o.homedir);
  assert.equal(o.local, sc.state);
  assert.equal(o.xdg, sc.state);
  assert.equal(o.keyIsDummy, true, "the only key the child can see is the dummy");
  for (const k of o.envKeys) assert.ok(ALLOWED_ENV.has(k.toUpperCase()) || k.startsWith("="), "child environment leaked " + k);
  for (const k of ["USERPROFILE", "HOME"]) assert.ok(isInside(o.vals[k], sb.root), "the child's " + k + " is the sandbox: " + o.vals[k]);
  for (const k of ["TEMP", "TMP", "TMPDIR"]) assert.ok(isInside(o.vals[k], sc.tmp), "the child's " + k + " is the sandbox temp: " + o.vals[k]);
  if (process.platform === "win32") {
    assert.ok(isInside(o.vals.HOMEDRIVE + o.vals.HOMEPATH, sb.root), "the child's HOMEDRIVE+HOMEPATH is the sandbox");
    assert.equal(o.vals.USERNAME, "d143-sandbox");
  }
  assert.match(o.probeThrew, /d143 mock: refusing an unexpected url/, "the mock never delegates to a real fetch");
  const rec = JSON.parse(readFileSync(sc.record, "utf8"));
  assert.equal(rec.length, 1);
  assert.equal(rec[0].url, "https://example.invalid/d143-probe");
  ISOLATION.proven = true;
});

// ── 2. refusals: every one before the claim and before the fetch ─────────────────────────────

test("REFUSED: the adapter as it stands in a PR — present locally, absent from origin/main", () => {
  const sc = scenario(origin("no-adapter", { omit: [ADAPTER_REL] }));
  const dst = join(sc.clone, ...ADAPTER_REL.split("/"));
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(repoFile(ADAPTER_REL), dst);
  assertRefused(runAdapter(sc, SEND), sc, "blob-missing");
  assertRefused(runAdapter(sc, []), sc, "blob-missing");
});

test("REFUSED: a local or uncommitted authorisation never counts", () => {
  const replace = { [CONTRACT_REL]: withoutD143Entry(), [REGISTER_REL]: registerWithout("D-143") };
  const bare = origin("pre-d143", { replace });

  // origin/main without the row and the entry, working tree identical to it
  const a = scenario(bare);
  assertRefused(runAdapter(a, SEND), a, "register");
  // the row merged but not the entry
  const b = scenario(origin("row-without-entry", { replace: { [CONTRACT_REL]: withoutD143Entry() } }));
  assertRefused(runAdapter(b, SEND), b, "authorisation");
  // the authorisation present in the working tree only, uncommitted
  const c = scenario(bare);
  writeFileSync(join(c.clone, ...CONTRACT_REL.split("/")), historicBytes(CONTRACT_REL));
  writeFileSync(join(c.clone, ...REGISTER_REL.split("/")), historicBytes(REGISTER_REL));
  assertRefused(runAdapter(c, SEND), c, "blob-divergence");
  // the authorisation committed locally on main, not in origin/main
  sgit(c.clone, ["commit", "-q", "-am", "local authorisation"]);
  assertRefused(runAdapter(c, SEND), c, "head-not-origin-main");
});

test("REFUSED: a feature branch, at origin/main or ahead of it", () => {
  const bare = origin("valid");
  const a = scenario(bare);
  sgit(a.clone, ["checkout", "-q", "-b", "feat/d143-send"]);
  assertRefused(runAdapter(a, SEND), a, "branch");
  writeFileSync(join(a.clone, "NOTE.txt"), "feature work\n");
  sgit(a.clone, ["add", "-A"]);
  sgit(a.clone, ["commit", "-q", "-m", "feature"]);
  assertRefused(runAdapter(a, SEND), a, "branch");
});

test("REFUSED: HEAD is not origin/main", () => {
  const sc = scenario(origin("two-commits", { extraCommit: true }));
  sgit(sc.clone, ["checkout", "-q", "--detach", "HEAD~1"]);
  assertRefused(runAdapter(sc, SEND), sc, "head-not-origin-main");
});

test("REFUSED: any working-tree byte that differs from origin/main, file by file", () => {
  const sc = scenario(origin("valid"));
  for (const rel of TRACKED) {
    const p = join(sc.clone, ...rel.split("/"));
    const original = readFileSync(p);
    writeFileSync(p, plusOneByte(original));
    const r = runAdapter(sc, SEND);
    writeFileSync(p, original);
    assertRefused(r, sc, "blob-divergence");
    assert.ok(r.out.includes(rel), "the refusal must name " + rel);
  }
});

test("REFUSED: a pin broken inside origin/main itself, with the working tree agreeing", () => {
  for (const [name, rel, stage] of [["bad-prompt", PROMPT_REL, "pins"], ["bad-mask", MASK_REL, "pins"],
    ["bad-northstar", NORTHSTAR_REL, "pins"], ["bad-edit", EDIT_REL, "pins"], ["bad-transition", TRANSITION_REL, "pins"]]) {
    const sc = scenario(origin(name, { replace: { [rel]: plusOneByte(repoBytes(rel)) } }));
    assertRefused(runAdapter(sc, SEND), sc, stage);
  }
  for (const [name, mutate] of [
    ["entry-model", (e) => { e.model = "gpt-image-2"; }],
    ["entry-spent", (e) => { e.mandateState = "SPENT"; }],
    ["entry-attempted", (e) => { e.outcome = "UNKNOWN"; }],
    ["entry-mask", (e) => { e.mask.sha256 = "28ff1ac00f6972697411ad29c5618f9ede4b5a0a4fd086a41ec0bfb5fe7561fb"; }],
    ["entry-order", (e) => { e.inputOrder = ["Image 2", "Image 1"]; }],
    ["entry-claim", (e) => { e.claim.filename = "D-142.claim.json"; }],
    ["entry-extra-param", (e) => { e.parameters.input_fidelity = "high"; }],
  ]) {
    const replace = { [CONTRACT_REL]: contractWith((c) => mutate(c.authorisedCalls.calls.find((x) => x.callId === "D-143-r3-underlay-core-v2"))) };
    const sc = scenario(origin(name, { replace }));
    assertRefused(runAdapter(sc, SEND), sc, "authorisation");
  }
  const dup = contractWith((c) => { const e = c.authorisedCalls.calls.find((x) => x.callId === "D-143-r3-underlay-core-v2"); c.authorisedCalls.calls.push(JSON.parse(JSON.stringify(e))); });
  const d = scenario(origin("entry-twice", { replace: { [CONTRACT_REL]: dup } }));
  assertRefused(runAdapter(d, SEND), d, "authorisation");
  const noD142 = scenario(origin("no-d142-row", { replace: { [REGISTER_REL]: registerWithout("D-142") } }));
  assertRefused(runAdapter(noD142, SEND), noD142, "register");
});

test("REFUSED: the D-145 implementation entry missing, duplicated or different, or the D-143 snapshot edited", () => {
  const entryOf = (c) => c.adapterImplementations.entries.find((x) => x.decision === "D-145");
  const d143Of = (c) => c.authorisedCalls.calls.find((x) => x.callId === "D-143-r3-underlay-core-v2");
  for (const [name, mutate] of [
    ["impl-block-missing", (c) => { delete c.adapterImplementations; }],
    ["impl-entry-missing", (c) => { c.adapterImplementations.entries = []; }],
    ["impl-entry-twice", (c) => { c.adapterImplementations.entries.push(JSON.parse(JSON.stringify(entryOf(c)))); }],
    ["impl-decision", (c) => { entryOf(c).decision = "D-146"; }],
    ["impl-approval", (c) => { entryOf(c).adapter.ownerApproval = "D-139"; }],
    ["impl-approval-flag", (c) => { entryOf(c).adapter.ownerApprovalFlag = "--owner-approval=D-145"; }],
    ["impl-file", (c) => { entryOf(c).adapter.file = "tools/avatar/openai-generate-r3-underlay.mjs"; }],
    ["impl-status", (c) => { entryOf(c).adapter.status = "EXECUTED"; }],
    ["impl-mandate", (c) => { entryOf(c).mandateState = "SPENT"; }],
    ["impl-outcome", (c) => { entryOf(c).outcome = "UNKNOWN"; }],
    ["impl-merge-is-instruction", (c) => { entryOf(c).mergeIsNotAnInstruction = false; }],
    ["impl-no-separate-instruction", (c) => { entryOf(c).executionRequiresSeparateOwnerInstruction = false; }],
    ["impl-adapter-sha", (c) => { entryOf(c).adapter.sha256 = "0".repeat(64); }],
  ]) {
    const sc = scenario(origin(name, { replace: { [CONTRACT_REL]: contractWith(mutate) } }));
    assertRefused(runAdapter(sc, SEND), sc, "implementation");
  }
  // the D-143 snapshot: a change that touches no pin at all is still a rewrite of history
  const prose = scenario(origin("d143-prose", { replace: { [CONTRACT_REL]: contractWith((c) => { d143Of(c).scope += " "; }) } }));
  const r = runAdapter(prose, SEND);
  assertRefused(r, prose, "authorisation");
  assert.match(r.out, /not its merged snapshot/);
  const noRow = scenario(origin("no-d145-row", { replace: { [REGISTER_REL]: registerWithout("D-145") } }));
  assertRefused(runAdapter(noRow, SEND), noRow, "register");
});

test("REFUSED (D-147): the LIVE tree — D-143 closed — refuses before the claim and the fetch", () => {
  // The live contract and register, exactly as they stand in this tree, as the sandbox's origin/main.
  // Dummy key, mock fetch, sandbox identity and sandbox paths, as for every other scenario.
  const live = { [CONTRACT_REL]: repoBytes(CONTRACT_REL), [REGISTER_REL]: repoBytes(REGISTER_REL) };
  const sc = scenario(origin("live-d147-closed", { replace: live }));
  for (const args of [SEND, []]) {
    const r = runAdapter(sc, args);
    assertRefused(r, sc, "authorisation");
    assert.match(r.out, /not its merged snapshot/);
    assert.match(r.out, /mandateState: "SPENT", expected "UNSPENT"/);
    assert.match(r.out, /the entry is marked neverReuse/);
  }
});

test("REFUSED: a wrong, missing, partial or duplicated owner approval, and any unknown flag", () => {
  const sc = scenario(origin("valid"));
  for (const args of [
    ["--send"],
    [APPROVAL],
    ["--send", "--owner-approval=D-139"],
    ["--send", "--owner-approval=D-142"],
    ["--send", "--owner-approval=d-143"],
    ["--send", "--owner-approval=D-143-r3-underlay-core-v2"],
    ["--send", "--owner-approval="],
    ["--send", "--owner-approval=D-143 "],
    ["--send", APPROVAL, APPROVAL],
    ["--send", "--send", APPROVAL],
    ["--send", APPROVAL, "--force"],
    ["--send", APPROVAL, "--retry"],
    ["--send", APPROVAL, "--claim-path=x"],
    ["--send", "--owner-approval", "D-143"],
    ["--yes"],
  ]) {
    assertRefused(runAdapter(sc, args), sc, "arguments");
  }
});

test("REFUSED: no API key, before the claim", () => {
  const sc = scenario(origin("valid"));
  assertRefused(runAdapter(sc, SEND, { key: false }), sc, "key");
  assertRefused(runAdapter(sc, SEND, { key: "" }), sc, "key");
});

test("REFUSED: an existing raw, manifest, partial or claim — and each is left byte-identical", () => {
  // each output name in its own clean clone, so each is proven to block on its own
  for (const name of ["r3-underlay-core.raw.png", "r3-underlay-core.request.json",
    "r3-underlay-core.raw.png.partial", "r3-underlay-core.request.json.partial"]) {
    const s = scenario(origin("valid"));
    const dir = join(s.clone, ...OUT_DIR_PARTS);
    mkdirSync(dir, { recursive: true });
    const marker = Buffer.from("pre-existing " + name);
    writeFileSync(join(dir, name), marker);
    assertRefused(runAdapter(s, SEND), s, "outputs-not-empty", { outputsPreexist: true });
    assert.ok(readFileSync(join(dir, name)).equals(marker), name + " must be untouched");
    assert.deepEqual(readdirSync(dir), [name], "nothing else may appear next to " + name);
  }
  // a claim that already exists, in the sandbox state, is never touched
  const s = scenario(origin("valid"));
  const claim = join(s.state, ...SANDBOX_CLAIM_SUBPATH);
  mkdirSync(dirname(claim), { recursive: true });
  const spent = Buffer.from("{\"mandate\":\"SPENT\",\"note\":\"sandbox\"}");
  writeFileSync(claim, spent);
  assertRefused(runAdapter(s, SEND), s, "claim-exists", { claims: [claim] });
  assert.ok(readFileSync(claim).equals(spent), "an existing claim is never modified");
  // even an EMPTY claim file means spent
  const e = scenario(origin("valid"));
  const empty = join(e.state, ...SANDBOX_CLAIM_SUBPATH);
  mkdirSync(dirname(empty), { recursive: true });
  writeFileSync(empty, "");
  assertRefused(runAdapter(e, SEND), e, "claim-exists", { claims: [empty] });
  assert.equal(statSync(empty).size, 0);
});

test("REFUSED: H1 missing or not byte-exact", () => {
  const sc = scenario(origin("valid"));
  assertRefused(runAdapter(sc, SEND), sc, "h1");
  const fake = join(sc.dir, "fitting-base.H1.png");
  writeFileSync(fake, makePng(1024, 1536));
  assertRefused(runAdapter(sc, [...SEND, "--h1", fake]), sc, "h1");
  assertRefused(runAdapter(sc, [...SEND, "--h1", join(sc.dir, "does-not-exist.png")]), sc, "h1");
});

// ── 3. the send itself, against the mock, in a verified sandbox ──────────────────────────────

function sandboxH1(t) {
  const sb = sandbox();
  if (sb.h1 !== undefined) return sb.h1;
  const src = process.env.FITTING_BASE_V1_PATH;
  if (typeof src !== "string" || src === "" || !existsSync(src)) { sb.h1 = null; return null; }
  const dst = join(sb.root, "h1", "fitting-base.H1.png");
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  assert.equal(sha256(readFileSync(dst)), H1_SHA256, "FITTING_BASE_V1_PATH is not the pinned H1");
  sb.h1 = dst;
  return dst;
}

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

test("SEND (mock): success — the claim exists at the call, one fetch, the merged bytes are sent", (t) => {
  const h1 = sandboxH1(t);
  if (!h1) { t.skip("H1 is external (D-127 §2); set FITTING_BASE_V1_PATH to run the sandboxed send scenarios"); return; }
  const sc = scenario(origin("valid"));

  // a read-only dry run first: passes, writes nothing, never fetches
  const dry = runAdapter(sc, ["--h1", h1]);
  assert.equal(dry.status, 0, dry.out);
  assert.match(dry.out, /DRY RUN PASSED/);
  assert.equal(dry.record.length, 0);
  assert.deepEqual(claimsUnder(sc.state), []);
  assert.equal(existsSync(join(sc.clone, ...OUT_DIR_PARTS)), false);

  const r = runAdapter(sc, [...SEND, "--h1", h1]);
  assert.equal(r.status, 0, r.out);
  assert.equal(r.record.length, 1, "exactly one fetch");
  const call = r.record[0];
  assert.equal(call.url, "https://api.openai.com/v1/images/edits");
  assert.equal(call.method, "POST");
  assert.equal(call.authorization, "Bearer " + DUMMY_KEY, "only the dummy key");
  const claim = join(sc.state, ...SANDBOX_CLAIM_SUBPATH);
  assert.deepEqual(call.claimsAtCall.map((c) => c.path), [claim], "the claim existed when fetch was called");
  assert.ok(call.claimsAtCall[0].bytes > 0);

  // the body: the pinned order, the merged bytes
  const f = call.fields;
  assert.deepEqual(f.map((x) => x.name), ["model", "image[]", "image[]", "mask", "prompt", "n", "size", "quality", "output_format", "background"]);
  assert.equal(f[0].text, D143.model);
  assert.equal(f[1].filename, "fitting-base.H1.png");
  assert.equal(f[1].sha256, D143.inputs[0].sha256);
  assert.equal(f[2].filename, "Northstar Master v2.png");
  assert.equal(f[2].sha256, D143.inputs[1].sha256);
  assert.equal(f[3].filename, "r3-underlay-api-mask-core-v1.png");
  assert.equal(f[3].sha256, D143.mask.sha256);
  assert.equal(f[4].sha256, D143.prompt.transmittedSha256);
  assert.equal(f[4].bytes, D143.prompt.transmittedBytes);
  assert.deepEqual(f.slice(5).map((x) => [x.name, x.text]),
    Object.entries({ n: "1", size: "1024x1536", quality: "high", output_format: "png", background: "transparent" }));
  assert.ok(!f.some((x) => x.name === "input_fidelity"));

  // the claim persists and names the authorising commit
  const originSha = sgit(sc.clone, ["rev-parse", "refs/remotes/origin/main"]);
  const claimText = readFileSync(claim, "utf8");
  const claimJson = JSON.parse(claimText);
  assert.equal(claimJson.callId, D143.callId);
  assert.equal(claimJson.mandate, "SPENT");
  assert.equal(claimJson.originMainSha, originSha);
  assert.equal(claimJson.adapterSha256, sha256(repoBytes(ADAPTER_REL)));
  assert.equal(claimJson.implementationDecision, "D-145");

  // the manifest records the outcome, and no credential
  const out = join(sc.clone, ...OUT_DIR_PARTS);
  const manifestPath = join(out, "r3-underlay-core.request.json");
  const manifestText = readFileSync(manifestPath, "utf8");
  const m = JSON.parse(manifestText);
  assert.equal(m.outcome.stage, "done");
  assert.equal(m.outcome.fetches, 1);
  assert.equal(m.outcome.retried, false);
  assert.equal(m.outcome.mandate, "SPENT");
  assert.equal(m.authorisedBy.originMainSha, originSha);
  assert.equal(m.authorisedBy.adapterSha256, sha256(repoBytes(ADAPTER_REL)), "the executed code version is in the manifest");
  assert.equal(m.authorisedBy.implementationDecision, "D-145");
  assert.equal(m.response.httpStatus, 200);
  assert.equal(m.response.requestId, "req_d143_mock");
  assert.deepEqual(m.response.usage, { total_tokens: 7 });
  assert.equal(m.claim.file, claim);
  for (const text of [manifestText, claimText, r.out]) {
    assert.ok(!text.includes(DUMMY_KEY), "no key in the manifest, the claim or the output");
    assert.ok(!text.includes("Bearer"), "no authorisation header anywhere on disk");
  }
  const raw = readFileSync(join(out, "r3-underlay-core.raw.png"));
  assert.equal(sha256(raw), sha256(Buffer.from(readFileSync(sandbox().png, "utf8"), "base64")));
  assert.deepEqual(readdirSync(out).sort(), ["r3-underlay-core.raw.png", "r3-underlay-core.request.json"]);

  // every derived path is inside the sandbox
  for (const p of [claim, manifestPath, m.result.file]) assert.ok(isInside(p, sc.dir), "outside the sandbox: " + p);

  // a second run is refused before its own fetch, and nothing is replaced
  const before = { claim: readFileSync(claim), manifest: readFileSync(manifestPath) };
  const again = runAdapter(sc, [...SEND, "--h1", h1]);
  assert.equal(again.status, 1, again.out);
  assert.match(again.out, /REFUSED \[claim-exists\]/);
  assert.equal(again.record.length, 1, "still exactly one fetch in total");
  assert.ok(readFileSync(claim).equals(before.claim));
  assert.ok(readFileSync(manifestPath).equals(before.manifest));
});

for (const [scenarioName, stage] of [["http-400", "http"], ["transport", "transport"], ["not-json", "parse"],
  ["bad-payload", "payload"], ["bad-base64", "payload"], ["not-png", "decode"], ["body-read", "body-read"]]) {
  test("SEND (mock): " + scenarioName + " — one fetch, the claim stays spent, the manifest keeps the outcome", (t) => {
    const h1 = sandboxH1(t);
    if (!h1) { t.skip("H1 is external (D-127 §2); set FITTING_BASE_V1_PATH to run the sandboxed send scenarios"); return; }
    const sc = scenario(origin("valid"));
    const r = runAdapter(sc, [...SEND, "--h1", h1], { scenario: scenarioName });
    assert.equal(r.status, 3, r.out);
    assert.match(r.out, /NO RETRY/);
    assert.equal(r.record.length, 1, "exactly one fetch, and no retry");
    const claim = join(sc.state, ...SANDBOX_CLAIM_SUBPATH);
    assert.deepEqual(r.record[0].claimsAtCall.map((c) => c.path), [claim], "the claim existed when fetch was called");
    assert.deepEqual(claimsUnder(sc.state), [claim], "the claim persists after the failure");
    const out = join(sc.clone, ...OUT_DIR_PARTS);
    const manifestText = readFileSync(join(out, "r3-underlay-core.request.json"), "utf8");
    const m = JSON.parse(manifestText);
    assert.equal(m.outcome.stage, stage);
    assert.equal(m.outcome.fetches, 1);
    assert.equal(m.outcome.retried, false);
    assert.equal(m.outcome.mandate, "SPENT");
    assert.equal(m.authorisedBy.originMainSha, sgit(sc.clone, ["rev-parse", "refs/remotes/origin/main"]));
    if (scenarioName === "http-400") { assert.equal(m.response.httpStatus, 400); assert.equal(m.response.requestId, "req_d143_mock"); }
    if (scenarioName === "transport") assert.match(m.response.serverState, /UNKNOWN/);
    assert.equal(existsSync(join(out, "r3-underlay-core.raw.png")), false, "no raw result on failure");
    assert.deepEqual(readdirSync(out), ["r3-underlay-core.request.json"], "no partial left behind, nothing else written");
    assert.ok(!manifestText.includes(DUMMY_KEY) && !manifestText.includes("Bearer"), "no credential in the manifest");
    assert.ok(!readFileSync(claim, "utf8").includes(DUMMY_KEY), "no credential in the claim");
    assert.equal(readJson(claim).mandate, "SPENT");
  });
}
