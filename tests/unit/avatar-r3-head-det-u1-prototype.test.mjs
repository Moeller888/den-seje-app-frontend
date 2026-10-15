// R3 head — deterministic U1 + S2 prototype (LOCAL, NOT PROMOTED). No network, no claim, no key, no call-id.
//
// The composition, its determinism and every preservation check run in CI with a SYNTHETIC H1 (solid only on
// TRANSITION, H1's neck skin). The tests marked NEED_H1 need the pinned, never-committed H1 (FITTING_BASE_V1_PATH,
// SHA-256 72875565…) and are skipped without it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { SEAM } from "../../tools/avatar/build-r3-head-colour-fixtures.mjs";
import * as P from "../../tools/avatar/build-r3-head-det-u1-prototype.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const TOOL = "tools/avatar/build-r3-head-det-u1-prototype.mjs";
const W = 1024, N = 1024 * 1536;
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const repoFile = (rel) => join(REPO, ...rel.split("/"));
const C = JSON.parse(readFileSync(repoFile("tools/avatar/fixtures/r3/r3-shadow-contract-v1.json"), "utf8"));
const strip = (s) => s.split("\n").filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");
const H1_PATH = process.env.FITTING_BASE_V1_PATH;
const H1_OK = typeof H1_PATH === "string" && (() => { try { return sha256(readFileSync(H1_PATH)) === P.PINS.h1; } catch (_) { return false; } })();
const NEED_H1 = { skip: !H1_OK && "the pinned H1 is needed (external, never committed)" };
/** The 1024×1536 prototype's SHA-256 from the pinned inputs — the reproducibility pin. */
const PROTOTYPE_SHA256 = "e1cad767800a36f111bc2e8bd652b04667b0d31b3818cf6211453413d1dbbb63";

let ctxMemo = null; const ctx = () => (ctxMemo ??= P.loadContext(REPO));
const synH1 = () => { const c = ctx(), h = Buffer.alloc(N * 4); for (let p = 0; p < N; p++) if (c.inp.transition[p]) h.set([...SEAM.S2.neckTargetExpected, 255], p * 4); return h; };

test("the prototype changes no contract: no live permission, sent stays 5, R3 default OFF", () => {
  assert.deepEqual(C.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT"), []);
  assert.equal(C.imageCallBudget.callsActuallySentSoFar.underlay, 5);
  assert.deepEqual([C.meta.authorisesImageRequest, C.architecture.defaultEnabled], [false, false]);
  assert.ok(!JSON.stringify(C).includes("det-u1"));
  assert.match(P.STATUS, /NOT PROMOTED/);
});

test("the tool has no network, no key, no claim, no child process; it writes only into its gitignored build folder", () => {
  const code = strip(readFileSync(repoFile(TOOL), "utf8"));
  for (const bad of [/\bfetch\s*\(/, /node:https?\b|node:net\b|node:tls\b|node:child_process|undici|axios|WebSocket/, /https?:\/\//, /OPENAI|process\.env\.[A-Z_]*(KEY|TOKEN|SECRET)/, /claim\w*\s*\(/, /["']assets\//])
    assert.ok(!bad.test(code), TOOL + " must not match " + bad);
  for (const u of [...code.matchAll(/process\.env(\.[A-Za-z_][A-Za-z0-9_]*|\[[^\]]*\])?/g)].map((m) => m[0])) assert.equal(u, "process.env.FITTING_BASE_V1_PATH");
  assert.match(code, /refusing to write outside tools\/avatar\/build\/r3-head-det-u1/);
  assert.equal(relative(REPO, P.OUT_DIR).split(/[\\/]/).join("/"), "tools/avatar/build/r3-head-det-u1");
  assert.equal(spawnSync("git", ["check-ignore", "-q", "tools/avatar/build/r3-head-det-u1/r3-head-det-u1.prototype.png"], { cwd: REPO }).status, 0);
  for (const args of [["--send"], ["--out", "assets"], ["--promote"], ["--h1"]]) {
    const r = spawnSync(process.execPath, [repoFile(TOOL), ...args], { env: { PATH: process.env.PATH || "", SystemRoot: process.env.SystemRoot || "" }, encoding: "utf8" });
    assert.notEqual(r.status, 0); assert.match(r.stderr, /REFUSED|required/);
  }
});

test("every repository input is verified against its pin; a wrong H1 is refused", () => {
  assert.equal(P.PINS.u1.sha256, sha256(readFileSync(repoFile(P.PINS.u1.path))));
  assert.equal(P.PINS.k4.sha256, sha256(readFileSync(repoFile(P.PINS.k4.path))));
  assert.throws(() => P.decodeH1(Buffer.from("not H1")), /pinned SHA-256/);
});

test("synthetic H1: alpha = E2, rows >= 425 / PROTECT₂ / TRANSITION = H1, and the ears stay flat U1 skin", () => {
  const c = ctx(), h1 = synH1(), out = P.composePrototype(c, h1).rgba, r = P.verify(c, h1, out);
  assert.deepEqual([r.alphaNotE2, r.rowsFrom425NotH1, r.protect2NotH1, r.transitionNotH1, r.earPxNotFlat], [0, 0, 0, 0, 0]);
  assert.ok(r.earPxChecked > 1000); assert.equal(r.ok, true);
});

test("verify is not vacuous: a changed alpha, a changed H1 byte and an inner-ear mark are each detected", () => {
  const c = ctx(), h1 = synH1(), out = P.composePrototype(c, h1).rgba;
  const head = c.head.indexOf(1), below = 430 * W + 512, ear = (() => { for (let p = 0; p < N; p++) { const x = p % W; if (c.head[p] && x < 366 && !c.contour[p] && (p / W | 0) < 417) return p; } return -1; })();
  const a = Buffer.from(out); a[head * 4 + 3] = 0; assert.ok(P.verify(c, h1, a).alphaNotE2 > 0);
  const b = Buffer.from(out); b[below * 4] ^= 1; assert.ok(P.verify(c, h1, b).rowsFrom425NotH1 > 0);
  const e = Buffer.from(out); e.set([220, 140, 90], ear * 4); assert.ok(P.verify(c, h1, e).earPxNotFlat > 0);
});

test("synthetic H1: the artefacts are byte-identical across two independent builds", () => {
  const h1 = synH1(), a = P.buildArtefacts(P.loadContext(REPO), h1, "synthetic"), b = P.buildArtefacts(P.loadContext(REPO), h1, "synthetic");
  assert.deepEqual([...a.files.keys()], ["r3-head-det-u1.prototype.png", "r3-head-det-u1.180x270.png", "r3-head-det-u1.360x540.png", "r3-head-det-u1.jaw-neck-x3.png", "manifest.json", "index.html"]);
  for (const [k, v] of a.files) assert.ok(v.equals(b.files.get(k)), k);
  const m = JSON.parse(a.files.get("manifest.json"));
  assert.deepEqual([m.promoted, m.r3DefaultEnabled, m.callsActuallySentSoFar], [false, false, 5]);
  assert.match(a.files.get("index.html").toString("utf8"), /IKKE PROMOVERET/);
});

test("real H1: the prototype reproduces its pinned SHA-256 and passes every check", NEED_H1, () => {
  const h1Buf = readFileSync(H1_PATH), { files, manifest } = P.buildArtefacts(P.loadContext(REPO), P.decodeH1(h1Buf), sha256(h1Buf));
  assert.equal(sha256(files.get("r3-head-det-u1.prototype.png")), PROTOTYPE_SHA256);
  assert.equal(manifest.checks.ok, true);
  assert.equal(manifest.inputs.h1, P.PINS.h1);
});

test("R3 stays default OFF: no shipped file references the prototype", () => {
  const shipped = [];
  // dist-cloudflare/ is the gitignored, GENERATED copy of the allowlisted sources this walk already reads; cloudflare-static-build.test.mjs
  // deletes and rebuilds it while the suite runs in parallel, so walking it races (ENOENT) and adds no coverage.
  const walk = (dir) => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) { if (!["node_modules", ".git", "tools", "tests", "docs", "supabase", "dist-cloudflare"].includes(n)) walk(p); } else if (/\.(html|js|mjs|css)$/.test(n)) shipped.push(p); } };
  walk(REPO);
  for (const p of shipped) assert.ok(!/det-u1|r3-head-det/.test(readFileSync(p, "utf8")), relative(REPO, p) + " must not reference the prototype");
});
