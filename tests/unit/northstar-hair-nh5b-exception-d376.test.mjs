// D-376 — the one-time exception for D-375 NH-5B's top knot (northstar-hair-nh5b-exception-d376.mjs, exception-d376-v1.json). The static
// tests run everywhere: the exception is bound to full hashes, keeps D-375's thresholds and recorded results, and calls nothing. The rebuild
// needs the private files kept outside the clones (the raw image, D-373's base, the ear mask, NH-4's layer): it runs only where those exist —
// skipped in CI, never faked. It builds the candidate twice and checks both builds byte for byte against the bound PNGs (the WebP heads are
// checked by the tool: no unit file depends on a vendored program, D-094). 0 image calls.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { decodePng } from "../../tools/avatar/r3-hair-tool-v2.mjs";
import * as NH5 from "../../tools/avatar/northstar-hair-nh5.mjs";
import * as X from "../../tools/avatar/northstar-hair-nh5b-exception-d376.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, "..", ".."), repoFile = (rel) => join(REPO, ...rel.split("/"));
const FX = "tools/avatar/fixtures/northstar-hair-d375/", TOOL_REL = "tools/avatar/northstar-hair-nh5b-exception-d376.mjs", DECISION_REL = "docs/decisions/D-376.md";
const json = (rel) => JSON.parse(readFileSync(repoFile(rel), "utf8"));
const EX = json(X.FIXTURE), AUTH = json(FX + "authorisation-nh5b-v1.json"), PLAN = json(FX + "plan-nh5b-v1.json"), DECISION = readFileSync(repoFile(DECISION_REL), "utf8");
const SRC = readFileSync(repoFile(TOOL_REL), "utf8"), CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const PRIVATE = join(homedir(), "Documents", "DenSejeApp-artefacts");
const privatePath = (i) => join(PRIVATE, ...i.folder.split("/"), i.name);
const SKIP = EX.inputs.every((i) => existsSync(privatePath(i))) ? false : "NH-5B's raw image, D-373's base, the ear mask and NH-4's layer are kept outside the clones";
const hex = /^[0-9a-f]{64}$/;

test("D-376 exception: one call, one candidate, bound to full hashes of the raw image, both hair layers and both heads (PNG and the WebP the trial showed); nothing tracked, nothing activated", () => {
  assert.equal(X.FIXTURE, FX + "exception-d376-v1.json");
  assert.deepEqual([EX.decision, EX.relatesTo, EX.callId, EX.kind, EX.newImageCall, EX.tool, EX.neverPromoted], ["D-376", "D-375", AUTH.callId, "ONE_TIME_EXCEPTION", false, TOOL_REL, true]);
  assert.match(EX.status, /NOT PROMOTED, NOT ACTIVATED/); assert.match(EX.activation, /activates nothing/);
  assert.deepEqual(EX.inputs.map((i) => i.role), ["raw", "base", "ear", "nh4"]);
  for (const i of EX.inputs) { assert.match(i.sha256, hex, i.role); assert.equal(i.tracked, false, i.role); }
  assert.equal(EX.inputs[0].sha256, AUTH.call.result.image.sha256, "the raw image is NH-5B's one returned image");
  const post = Object.fromEntries(PLAN.post.inputs.map((i) => [i.name, i.sha256]));
  for (const role of ["base", "ear", "nh4"]) { const i = EX.inputs.find((j) => j.role === role); assert.equal(i.sha256, post[i.name], role + " is D-375's pinned post input"); }
  assert.deepEqual(Object.keys(EX.outputs), ["greyLayer", "brownLayer", "greyHeadPng", "brownHeadPng", "greyHeadWebp", "brownHeadWebp"]);
  for (const [k, o] of Object.entries(EX.outputs)) { assert.match(o.sha256, hex, k); assert.equal(o.tracked, false, k); assert.equal(o.bound, true, k); }
  assert.equal(new Set(Object.values(EX.outputs).map((o) => o.sha256)).size, 6);
  for (const s of [...EX.inputs, ...Object.values(EX.outputs)].map((o) => o.sha256)) assert.ok(DECISION.includes(s), "D-376 names " + s);
  assert.deepEqual([EX.rebuild.runs, EX.rebuild.byteIdentical], [2, true]);
});

test("D-376 exception: D-375's thresholds and recorded rejection stand unchanged; only P2, P3, P4, P8, P9, P11 and P12 are excepted, P1, P5, P6, P7 and P10 stay required", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(NH5.GATES)), PLAN.post.gates, "D-375's gates are the plan's");
  assert.equal(PLAN.method.files["tools/avatar/northstar-hair-nh5.mjs"], AUTH.frozen.methodFiles["tools/avatar/northstar-hair-nh5.mjs"]);
  const x = AUTH.call.result.extractionV1;
  assert.deepEqual([AUTH.call.mandateState, x.verdict, x.thresholdsUnchanged], ["SPENT", "REJECTED", true]);
  assert.deepEqual([...X.RECORDED_FAILED], x.failed); assert.deepEqual(EX.historical.failed, x.failed); assert.deepEqual(EX.historical.checks, x.checks);
  assert.deepEqual(Object.keys(EX.exceptedChecks).sort(), [...x.failed].sort()); for (const p of x.passed) assert.ok(!(p in EX.exceptedChecks), p + " is not excepted");
  assert.equal(x.checks.P10.longestRun, 0);
  const d = EX.deviations; assert.ok(d.hairlineColumns.filter(([c]) => c >= 440 && c <= 590).every(([, r, g]) => g - r >= 23 && g - r <= 27), "the hairline is 23–27 px higher over the forehead");
  assert.ok(d.bun.result.px > d.bun.guide.px && d.bun.result.box[1] < d.bun.guide.box[1], "the bun is larger and higher");
  const f = EX.finished;
  for (const k of ["browZoneIdentical", "browsIdentical", "eyesIdentical", "earsIdentical", "earSoftEdgesIdentical"]) assert.equal(f[k][0], f[k][1], k);
  assert.deepEqual([f.layerAlphaOnBrowZonePx, f.hairOnFaceAndNeckBelowEarTopsPx, f.belowY430DiffersFromBasePx, f.alphaDiffGreyVsBrownPx, f.greyLayerNonNeutralPx], [0, 0, 0, 0, 0]);
  assert.ok(f.gapAboveBrowsAnyAlphaPx.left >= NH5.GATES.P3.minGap && f.gapAboveBrowsAnyAlphaPx.right >= NH5.GATES.P3.minGap);
});

test("the D-376 tool calls nothing: no fetch, no network module, no key; it reads only node built-ins and the locked D-375/D-373 tools", () => {
  assert.ok(!/\bfetch\s*\(|OPENAI|https?:\/\//.test(CODE));
  const specs = [...CODE.matchAll(/^\s*import\b[^;]*?from\s+"([^"]+)"/gm), ...CODE.matchAll(/\bimport\(\s*"([^"]+)"\s*\)/g)];
  assert.ok(specs.length >= 8, "the imports are found");
  for (const m of specs) assert.ok(m[1].startsWith("node:fs") || m[1].startsWith("node:path") || m[1].startsWith("node:url") || m[1].startsWith("node:crypto") || ["./northstar-hair-nh5.mjs", "./r3-northstar-layers.mjs", "./r3-hair-tool-v2.mjs", "./build-northstar-hair-heads-d373.mjs"].includes(m[1]), m[1]);
});

test("D-376 rebuild: twice from the untouched raw image, both builds byte for byte the bound layers and heads, the recorded rejection reproduced", { skip: SKIP }, () => {
  const px = (role) => decodePng(readFileSync(privatePath(EX.inputs.find((i) => i.role === role)))).px;
  const inputs = { raw: px("raw"), base: px("base"), ear: px("ear"), nh4: NH5.alphaMask(px("nh4")) };
  const a = X.buildCandidate(inputs), b = X.buildCandidate(inputs);
  for (const k of ["greyLayer", "brownLayer", "greyHeadPng", "brownHeadPng"]) { assert.equal(X.sha256(a.files[k]), EX.outputs[k].sha256, k); assert.ok(a.files[k].equals(b.files[k]), k + " is byte-identical in both builds"); }
  assert.deepEqual(a.report.failed, [...X.RECORDED_FAILED]); assert.deepEqual(JSON.parse(JSON.stringify(a.finished)), EX.finished); assert.deepEqual(JSON.parse(JSON.stringify(a.deviations)), EX.deviations);
});
