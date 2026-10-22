// R3 UNDERLAY — D-186: the deterministic head/neck underlay without H1 pixels and its review candidate
// r3-underlay-headneck-v1. The tests bind the sources to their pins, keep H1 and Northstar out, rebuild the tracked pixels
// deterministically, run the asset's own checks (also on broken specs), keep the two H1 gates NOT APPLICABLE — never
// passed — and check the contract, register and docs. No image call, no runtime change.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, pixelSha256 } from "../../tools/avatar/r3-hair-tool.mjs";
import { TOOL_ID, W, H, HEAD_LAST_ROW, loadSources, buildHeadNeck, renderSkin, checkHeadNeck } from "../../tools/avatar/r3-underlay-headneck.mjs";
import { preD187Contract, preD186Contract, PRE_D186_CONTRACT_CANONICAL_SHA256, PRE_D186_COMMIT, preD185Contract, PRE_D185_CONTRACT_CANONICAL_SHA256 } from "./avatar-r3-d147-closure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const file = (rel) => readFileSync(join(REPO, ...rel.split("/")));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const D = "tools/avatar/fixtures/r3-underlay-headneck/";
const LIVE = JSON.parse(file("tools/avatar/fixtures/r3/r3-shadow-contract-v1.json").toString("utf8"));
const UH = LIVE.underlayHeadNeck;
const MANIFEST = JSON.parse(file(D + "headneck-v1.manifest.json").toString("utf8"));
const SPEC_BUF = file(D + "headneck-v1.spec.json"), SPEC = JSON.parse(SPEC_BUF.toString("utf8"));
const SRC = loadSources(SPEC);
const BUILT = buildHeadNeck(SPEC, SRC);
const CHK = checkHeadNeck(BUILT, SRC, SPEC);
const clone = (o) => JSON.parse(JSON.stringify(o));

test("D-186 adds exactly the top-level key underlayHeadNeck: the contract minus it is the D-185 merge", () => {
  assert.equal(sha(JSON.stringify(preD186Contract(LIVE))), PRE_D186_CONTRACT_CANONICAL_SHA256, "canonical contract at " + PRE_D186_COMMIT);
  assert.equal(sha(JSON.stringify(preD185Contract(LIVE))), PRE_D185_CONTRACT_CANONICAL_SHA256, "and the older chain still holds");
  assert.equal(Object.keys(preD187Contract(LIVE)).at(-1), "underlayHeadNeck", "the last key D-186 added (D-187 appends reviewPack after it)");
  assert.deepEqual([UH.decision, UH.isAuthorisation, UH.authorisesImageRequest, UH.authorisesUpload], ["D-186", false, false, false]);
  assert.deepEqual(LIVE.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT"), [], "no live permission");
  const sent = LIVE.imageCallBudget.callsActuallySentSoFar;
  assert.deepEqual([LIVE.assets[0].calls, LIVE.assets[8].calls, LIVE.imageCallBudget.minimum, LIVE.imageCallBudget.maximum, sent.underlay, sent.hair], [5, 4, 26, 27, 5, 4], "no capacity, no call");
  assert.equal(LIVE.architecture.defaultEnabled, false, "R3 stays default OFF");
  assert.ok(!/AVATAR_R3\s*=\s*true/.test(file("js/avatar-layers.js").toString("utf8")), "R3 stays OFF at runtime");
  for (const x of ["a production asset or promotion", "a runtime change", "an image request, capacity or claim"]) assert.ok(UH.notApproved.includes(x), x);
  assert.match(UH.status, /NOT PRODUCTION-APPROVED/);
});

test("source policy: only the pinned geometry, K4 and U1; never H1, the H1-derived g1v3-v1 head or Northstar", () => {
  assert.deepEqual(Object.keys(SPEC.sources).filter((k) => k !== "notUsed"), ["headGeometry", "contourK4", "underpaintingU1"]);
  for (const k of ["headGeometry", "contourK4", "underpaintingU1"]) assert.equal(sha(file(SPEC.sources[k].file)), SPEC.sources[k].sha256, k);
  const files = Object.values(SPEC.sources).filter((s) => s.file).map((s) => s.file).join(" ");
  assert.ok(!/H1|g1v3-v1\.png|northstar/i.test(files), "no forbidden source file");
  const gen = file("tools/avatar/r3-underlay-headneck.mjs").toString("utf8");
  assert.ok(!/fitting-base|Northstar Master|r3-head-g1v3-v1\.png/.test(gen), "the generator reads no forbidden file");
  const tracked = execFileSync("git", ["ls-files"], { cwd: REPO, encoding: "utf8" }).split("\n");
  assert.deepEqual(tracked.filter((f) => /fitting-base\.H1|(^|\/)H1\.png$/i.test(f)), [], "H1 is never tracked");
  assert.ok(tracked.filter((f) => f.startsWith(D)).every((f) => !/h1|northstar/i.test(f)), "no private reference file among the tracked candidate files");
  assert.match(UH.sourcePolicy.forbidden[0], /a new neck does not make a copied H1 body allowed/);
  // the H1 guard and the pins are enforced, not only documented
  const h1 = clone(SPEC); h1.sources.headGeometry.file = "tools/avatar/build/fitting-base.H1.png";
  assert.throws(() => loadSources(h1));
  const pin = clone(SPEC); pin.sources.contourK4.sha256 = "0".repeat(64);
  assert.throws(() => loadSources(pin), /not the pinned/);
  const skin = clone(SPEC); skin.palette.skinMedium = [250, 197, 128];
  assert.throws(() => loadSources(skin), /U1's fill is not the adopted skin colour/);
});

test("deterministic rebuild: the spec reproduces the tracked candidate's pixels and the manifest's hashes", () => {
  assert.equal(TOOL_ID, "r3-underlay-headneck");
  assert.equal(sha(SPEC_BUF), MANIFEST.spec.sha256);
  const got = { luminance: pixelSha256(BUILT.lum), ink: pixelSha256(BUILT.ink), medium: pixelSha256(BUILT.render) };
  for (const k of ["luminance", "ink", "medium"]) {
    assert.equal(got[k], MANIFEST.outputs[k].pixelSha256, k + " rebuild");
    assert.equal(got[k], UH.candidate.pixelSha256[k], k + " contract");
    const png = decodePng(file(MANIFEST.outputs[k].file));
    assert.deepEqual([png.w ?? W, png.h ?? H], [W, H]);
    assert.equal(pixelSha256(png.px), MANIFEST.outputs[k].pixelSha256, k + " tracked file");
  }
  const rep = JSON.parse(file(MANIFEST.outputs.checkReport.file).toString("utf8"));
  assert.deepEqual(rep.pixelSha256, got);
  assert.equal(rep.specSha256, MANIFEST.spec.sha256);
});

test("the asset's own checks pass; the two H1 gates are NOT APPLICABLE and never reported as passed", () => {
  assert.equal(CHK.firstFailure, null);
  assert.deepEqual(CHK.checks.map((c) => [c.id, c.ok]), [["UN-HEAD", true], ["UN-ATTACH", true], ["UN-SHAPE", true], ["UN-EXTENT", true], ["UN-LUMINANCE", true]]);
  const a = CHK.checks.find((c) => c.id === "UN-ATTACH").value;
  assert.deepEqual([a.bound, a.row425InsideRow424, a.everyRowOneRun], [4, true, true], "the bound is the head geometry's own 423/424 step");
  assert.ok(a.step <= a.bound);
  assert.equal(CHK.checks.find((c) => c.id === "UN-HEAD").value.differingPx, 0);
  assert.deepEqual(CHK.notApplicable.map((g) => [g.id, g.status]), [["pre.join-continuity", "NOT APPLICABLE"], ["pre.transition-silhouette", "NOT APPLICABLE"]]);
  assert.ok(!CHK.checks.some((c) => c.id.startsWith("pre.")), "no H1 gate among the passed checks");
  for (const g of ["pre.join-continuity", "pre.transition-silhouette"]) assert.match(UH.checks.notApplicable[g], /^NOT APPLICABLE/);
  // nothing in rows <= 424 differs from the geometry, nothing below the neck bottom
  let below = 0; for (let i = (SPEC.neckGeometryN1.neck.bottom) * W; i < W * H; i++) if (BUILT.lum[i * 4 + 3]) below++;
  assert.equal(below, 0);
  assert.equal(HEAD_LAST_ROW, 424);
});

test("broken specs fail the checks instead of passing silently", () => {
  const wide = clone(SPEC); wide.neckGeometryN1.chin.left[0].q[0] = [446, 424];
  const w = checkHeadNeck(buildHeadNeck(wide, SRC), SRC, wide);
  assert.equal(w.firstFailure, "UN-ATTACH", "row 425 wider than row 424");
  const steep = clone(SPEC); steep.neckGeometryN1.chin.left[0].q[0] = [468, 424];
  assert.equal(checkHeadNeck(buildHeadNeck(steep, SRC), SRC, steep).firstFailure, "UN-ATTACH", "a step larger than the geometry's own");
  const long = clone(SPEC); long.neckGeometryN1.neck.left.push([458, 492]);
  assert.equal(checkHeadNeck(buildHeadNeck(long, SRC), SRC, long).checks.find((c) => c.id === "UN-EXTENT").ok, false, "neck below its documented bottom");
});

test("skin rendering: luminance x token with warm shadows; another tone renders from the same luminance", () => {
  const lum = new Uint8ClampedArray([255, 255, 255, 255, 204, 204, 204, 255]), ink = new Uint8ClampedArray(8);
  const skin = SPEC.palette.skinMedium, warm = SPEC.palette.skinWarmth;
  const out = renderSkin(lum, ink, skin, warm);
  assert.deepEqual([...out.slice(0, 3)], skin, "f = 1 is the plain skin token");
  const f = 0.8, drop = [0, 1, 2].map((c) => skin[c] - out[4 + c]);
  assert.deepEqual([...out.slice(4, 7)], [0, 1, 2].map((c) => Math.round(skin[c] * (1 - (1 - f) * warm[c]))));
  assert.ok(drop[0] / skin[0] < drop[2] / skin[2], "a shadow keeps more red than blue (warm, not grey)");
  const dark = renderSkin(BUILT.lum, BUILT.ink, [141, 85, 36], warm);
  assert.equal(dark.length, W * H * 4, "a second tone needs no new drawing");
  let chroma = 0; for (let i = 0; i < W * H; i++) if (BUILT.lum[i * 4 + 3]) chroma = Math.max(chroma, Math.max(BUILT.lum[i * 4], BUILT.lum[i * 4 + 1], BUILT.lum[i * 4 + 2]) - Math.min(BUILT.lum[i * 4], BUILT.lum[i * 4 + 1], BUILT.lum[i * 4 + 2]));
  assert.equal(chroma, 0, "the luminance layer is achromatic");
  assert.ok(!/ramp ?B/i.test(JSON.stringify(SPEC.palette)), "hair ramp B is not the skin method");
});

test("the D-185 correction and the production gaps are recorded; D-185 stays verbatim", () => {
  assert.match(UH.d185Correction, /already has ear silhouettes \(1,079 px a side\)/);
  assert.match(UH.d185Correction, /D-185's row and key stay verbatim/);
  assert.ok(LIVE.hairMethod.methodV2.hybridDerivation.productionGaps.some((g) => /U1 is not the finished underlay: it has no ears and no neck/.test(g)), "D-185's key is not rewritten");
  for (const re of [/visual review of the whole head is pending/, /only the medium skin tone/, /nape lock is not authored/, /provisional/]) assert.ok(UH.productionGaps.some((g) => re.test(g)), String(re));
  assert.match(MANIFEST.status, /NOT production-approved/);
  assert.match(UH.wholeHeadReview.napeLock, /not introduced/);
});

test("the D-186 register row and the docs: once, directly after D-185, no mojibake", () => {
  const lines = file("docs/project-state.md").toString("utf8").split("\n");
  const row = lines.find((l) => l.startsWith("| **D-186** |"));
  assert.equal(lines.filter((l) => l.startsWith("| **D-186** |")).length, 1);
  assert.equal(lines.findIndex((l) => l.startsWith("| **D-186** |")), lines.findIndex((l) => l.startsWith("| **D-185** |")) + 1);
  for (const needle of ["IKKE PRODUKTIONSGODKENDT", "IKKE ANVENDELIGE", "UDEN H1-PIXELS", "Rettelse af D-185", MANIFEST.spec.sha256, MANIFEST.outputs.luminance.pixelSha256, MANIFEST.outputs.ink.pixelSha256, MANIFEST.outputs.medium.pixelSha256, "R3 forbliver default OFF"]) assert.ok(row.includes(needle), "the D-186 row carries " + needle);
  assert.ok(!/[ÃÂ]\S|�/.test(row));
  const doc = file("docs/AVATAR_SYSTEM.md").toString("utf8");
  assert.match(doc, /\*\*R3 head underlay — deterministic head\/neck drawing without H1 pixels; one review candidate, not production-approved \(D-186, as of 2026-10-22\)\.\*\*/);
  assert.match(doc, /are \*\*NOT APPLICABLE\*\*/);
});
