// D-372 — the one-time exception for D-371 NH-4's temple variant (northstar-hair-nh4-exception-d372.mjs, exception-d372-v1.json). The static
// tests run everywhere: the exception is bound to full hashes, keeps NH-4's thresholds and results, and calls nothing. The rebuild needs the
// private files kept outside the clones (the raw image, the clean head, its ear mask, the side-swept layer): it runs only where those exist —
// skipped in CI, never faked. It builds the candidate twice and checks both builds byte for byte against the bound hashes. 0 image calls.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { decodePng } from "../../tools/avatar/r3-hair-tool-v2.mjs";
import * as PP from "../../tools/avatar/northstar-hair-nh4-post.mjs";
import * as X from "../../tools/avatar/northstar-hair-nh4-exception-d372.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, "..", ".."), repoFile = (rel) => join(REPO, ...rel.split("/"));
const FX = "tools/avatar/fixtures/northstar-hair-d371/", TOOL_REL = "tools/avatar/northstar-hair-nh4-exception-d372.mjs", DECISION_REL = "docs/decisions/D-372.md";
const json = (rel) => JSON.parse(readFileSync(repoFile(rel), "utf8"));
const EX = json(X.FIXTURE), NH4 = json(FX + "authorisation-nh4-v1.json"), PLAN = json(FX + "plan-nh4-v1.json"), DECISION = readFileSync(repoFile(DECISION_REL), "utf8");
const SRC = readFileSync(repoFile(TOOL_REL), "utf8"), CODE = SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
const PRIVATE = join(homedir(), "Documents", "DenSejeApp-artefacts", "hair-d371-calls");
const privatePath = (i) => join(PRIVATE, i.folder, i.name);
const SKIP = EX.inputs.every((i) => existsSync(privatePath(i))) ? false : "NH-4's raw image and the clean head inputs are kept outside the clones";

test("D-372 exception: one call, one candidate, bound to full hashes of the raw image, the adjusted copy and both hair layers; nothing tracked, nothing activated", () => {
  assert.equal(X.FIXTURE, FX + "exception-d372-v1.json");
  assert.deepEqual([EX.decision, EX.relatesTo, EX.callId, EX.kind, EX.newImageCall, EX.tool, EX.neverPromoted], ["D-372", "D-371", NH4.callId, "ONE_TIME_EXCEPTION", false, TOOL_REL, true]);
  assert.match(EX.status, /NOT APPROVED, NOT PROMOTED, NOT ACTIVATED/);
  const hex = /^[0-9a-f]{64}$/;
  for (const i of EX.inputs) { assert.match(i.sha256, hex, i.role); assert.equal(i.tracked, false, i.role); }
  assert.deepEqual(EX.inputs.map((i) => i.role), ["raw", "base", "ear", "swept"]);
  assert.equal(EX.inputs[0].sha256, NH4.call.result.image.sha256, "the raw image is NH-4's one returned image");
  for (const role of ["base", "ear", "swept"]) assert.equal(EX.inputs.find((i) => i.role === role).sha256, PLAN.post.inputs.find((i) => i.name === EX.inputs.find((j) => j.role === role).name).sha256, role + " is NH-4's pinned post input");
  assert.deepEqual(Object.keys(EX.outputs), ["adjusted", "greyLayer", "brownLayer", "greyOnCleanHead", "brownOnCleanHead"]);
  assert.deepEqual(Object.entries(EX.outputs).filter(([, o]) => o.bound).map(([k]) => k), ["adjusted", "greyLayer", "brownLayer"]);
  for (const [k, o] of Object.entries(EX.outputs)) { assert.match(o.sha256, hex, k); assert.equal(o.tracked, false, k); }
  assert.equal(new Set(Object.values(EX.outputs).map((o) => o.sha256)).size, 5);
});

test("D-372 exception: NH-4's thresholds and recorded results stand unchanged; P3 and P4 counted on the raw image, P8 0.767 against 0.75, P10 21 px against the raw image and 1 px against the adjusted copy", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(PP.GATES)), PLAN.post.gates, "NH-4's gates are the plan's");
  assert.match(SRC, /import \{ GATES, northstarTint \} from "\.\/northstar-hair-nh4-post\.mjs"/); assert.ok(!/GATES\s*=/.test(CODE), "the exception defines no threshold of its own");
  assert.deepEqual([X.P10.maxRun, X.TEMPLE.x, X.TEMPLE.rows, X.TEMPLE.into], [6, [380, 400], [290, 323], [290, 310]]);
  assert.deepEqual([EX.temple.x, EX.temple.rows, EX.temple.into], [[...X.TEMPLE.x], [...X.TEMPLE.rows], [...X.TEMPLE.into]]);
  const H = EX.historical, v1 = NH4.call.result.extractionV1, v2 = NH4.call.result.extractionV2;
  assert.deepEqual([H.extractionV1.failed, H.extractionV1.P3.resultOnBrowsPx, H.extractionV1.P4.resultOnEarsPx, H.extractionV1.P8.iouSideSwept, H.extractionV1.P8.iouNorthstar], [v1.failed, v1.P3.resultOnBrowsPx, v1.P4.resultOnEarsPx, v1.P8.iouSideSwept, v1.P8.iouNorthstar]);
  assert.deepEqual([H.extractionV1.P10.longestRun, H.extractionV2.P10.longestRun], [v2.P10.v1.longestRun, v2.P10.v2.longestRun]);
  assert.deepEqual([H.extractionV2.failed, H.extractionV2.P3.resultOnBrowsPx, H.extractionV2.P4.resultOnEarsPx, H.extractionV2.P4.faceBelowEarTopPx, H.extractionV2.P8.iouSideSwept], [v2.failed, 15, 125, 36, 0.766]);
  assert.deepEqual([H.candidate.failed, H.candidate.P3.resultOnBrowsPx, H.candidate.P4.resultOnEarsPx, H.candidate.P4.faceBelowEarTopPx, H.candidate.P8.iouSideSwept, H.candidate.P8.max, H.candidate.P10.longestRun], [["P3", "P4", "P8"], 15, 76, 0, 0.767, PP.GATES.P8.max, 1]);
  assert.equal(H.candidateP10AgainstUntouchedRaw.longestRun, 21);
  assert.deepEqual(Object.keys(EX.exceptedChecks), ["P3", "P4", "P8"]);
  assert.deepEqual(EX.finished, { browPixelsWithAnyHair: 0, gapAboveBrowsAnyAlphaPx: { left: 5, right: 6 }, earSoftEdges: 321, earSoftIdenticalGrey: 321, earSoftIdenticalBrown: 321, faceBelowEarTopPx: { left: 0, right: 0 }, alphaDiffGreyVsBrownPx: 0, greyLayerNonNeutralPx: 0, layerAlphaDiffersFromV2OutsideTemplePx: 0 });
});

test("D-372 tool: offline and deterministic — no network, no key, no randomness, no clock; the images stay outside the repository", () => {
  for (const re of [/fetch\(/, /https?:\/\//, /OPENAI/, /process\.env/, /Math\.random/, /Date\.now|new Date/]) assert.ok(!re.test(CODE), "the tool uses " + re);
  assert.match(CODE, /the images and the output stay outside the repository/); assert.match(CODE, /is not the pinned file/); assert.match(CODE, /not the excepted candidate/);
});

test("D-372 decision file: the exception, its bound hashes, the historical results and the stop before activation", () => {
  assert.match(DECISION, /^---\nd: D-372\n/);
  assert.ok(DECISION.includes(EX.inputs[0].sha256), "the raw image is named in full");
  for (const k of ["adjusted", "greyLayer", "brownLayer"]) assert.ok(DECISION.includes(EX.outputs[k].sha256), k + " is named in full");
  for (const s of ["0,767", "0,75", "125 px", "76 px", "21 px", "1 px", "321 af 321", "D-371"]) assert.ok(DECISION.includes(s), s);
  assert.match(DECISION, /aktiver/i);
});

test("D-372 rebuild: two builds from the untouched raw image are byte-identical and are exactly the bound files; grey and brown share one alpha", { skip: SKIP }, () => {
  const px = (i) => decodePng(readFileSync(privatePath(i))).px, inp = Object.fromEntries(EX.inputs.map((i) => [i.role, px(i)]));
  const a = X.buildCandidate(inp), b = X.buildCandidate(inp);
  for (const k of Object.keys(EX.outputs)) { assert.ok(Buffer.from(a.files[k]).equals(Buffer.from(b.files[k])), k + " differs between two builds"); assert.equal(X.sha256(a.files[k]), EX.outputs[k].sha256, k); }
  assert.deepEqual(X.bindingMismatches(EX, a.files), []);
  assert.deepEqual([a.v2.failed, a.v2.checks.P3.resultOnBrowsPx, a.v2.checks.P4.resultOnEarsPx, a.v2.checks.P4.faceBelowEarTopPx, a.v2.checks.P8.iouSideSwept], [["P3", "P4", "P8"], 15, 125, 36, 0.766]);
  const c = a.candidate.checks;
  assert.deepEqual([a.candidate.failed, c.P3.resultOnBrowsPx, c.P4.resultOnEarsPx, c.P4.faceBelowEarTopPx, c.P8.iouSideSwept, c.P8.iouNorthstar, c.P10.longestRun, a.p10Untouched.longestRun], [["P3", "P4", "P8"], 15, 76, 0, 0.767, 0.425, 1, 21]);
  assert.deepEqual(a.finished, EX.finished); assert.equal(a.templeChangedPx, EX.temple.rawPixelsChanged);
  const g = decodePng(Buffer.from(a.files.greyLayer)).px, h = decodePng(Buffer.from(a.files.brownLayer)).px; let diff = 0;
  for (let i = 3; i < g.length; i += 4) if (g[i] !== h[i]) diff++;
  assert.equal(diff, 0, "the grey and brown layers share one alpha channel");
});
