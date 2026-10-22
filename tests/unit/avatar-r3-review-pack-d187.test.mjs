// R3 REVIEW PACK — D-187: one versioned, reproducible R3 head review pack (D-186 head/neck, D-185 hair + the DRAFT nape lock,
// D-165 brows and mouth, the authored nose, eyes v5 with its iris layer). The tests pin every source, rebuild every layer,
// keep the parts' statuses, prove the production paths still refuse the DRAFT parts, check the layer order, transparency,
// overlap and colour swaps, and run HP6/HP7 in CI against the PINNED review parts. No image call, no runtime change.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, pixelSha256, composeHair } from "../../tools/avatar/r3-hair-tool-v2.mjs";
import { loadTargets } from "../../tools/avatar/r3-hair-guide-v1.mjs";
import { validateAnnotation as validateFaceAnnotation } from "../../tools/avatar/r3-face-parts-tool.mjs";
import { composeEyes } from "../../tools/avatar/r3-eyes-tool.mjs";
import { HAIR_COLOR_TOKENS } from "../../js/avatar-layers.js";
import { REVIEW_MODE, LAYER_ORDER, loadPack, buildPack, colourLayers, composeHead, mergeHair, figureHoles, over, reportHtml } from "../../tools/avatar/r3-review-pack.mjs";
import { preD188Contract, preD187Contract, PRE_D187_CONTRACT_CANONICAL_SHA256, PRE_D187_COMMIT, preD186Contract, PRE_D186_CONTRACT_CANONICAL_SHA256 } from "./avatar-r3-d147-closure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const file = (rel) => readFileSync(join(REPO, ...rel.split("/")));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const P = "tools/avatar/fixtures/r3-review-pack/";
const LIVE = JSON.parse(file("tools/avatar/fixtures/r3/r3-shadow-contract-v1.json").toString("utf8"));
const RP = LIVE.reviewPack;
const SPEC = JSON.parse(file(P + "review-pack-v1.json").toString("utf8"));
const MAN = JSON.parse(file(P + "review-pack-v1.manifest.json").toString("utf8"));
const PACK = buildPack();
const C = Object.fromEntries(PACK.checks.checks.map((c) => [c.id, c]));
const N = 1024 * 1536;

test("D-187 adds exactly the top-level key reviewPack: the contract minus it is the D-186 merge", () => {
  assert.equal(sha(JSON.stringify(preD187Contract(LIVE))), PRE_D187_CONTRACT_CANONICAL_SHA256, "canonical contract at " + PRE_D187_COMMIT);
  assert.equal(sha(JSON.stringify(preD186Contract(LIVE))), PRE_D186_CONTRACT_CANONICAL_SHA256, "and the older chain still holds");
  assert.equal(Object.keys(preD188Contract(LIVE)).at(-1), "reviewPack", "the last key D-187 added (D-188 appends northstarLayerReview after it)");
  assert.deepEqual([RP.decision, RP.isAuthorisation, RP.authorisesImageRequest, RP.authorisesUpload], ["D-187", false, false, false]);
  assert.deepEqual(LIVE.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT"), [], "no live permission");
  const sent = LIVE.imageCallBudget.callsActuallySentSoFar;
  assert.deepEqual([LIVE.assets[0].calls, LIVE.assets[8].calls, LIVE.imageCallBudget.minimum, LIVE.imageCallBudget.maximum, sent.underlay, sent.hair], [5, 4, 26, 27, 5, 4], "no capacity, no call");
  assert.equal(LIVE.architecture.defaultEnabled, false, "R3 stays default OFF");
  assert.ok(!/AVATAR_R3\s*=\s*true/.test(file("js/avatar-layers.js").toString("utf8")), "R3 stays OFF at runtime");
  assert.ok(!/r3-review-pack|reviewPack/.test(file("js/avatar-layers.js").toString("utf8")), "the active renderer knows nothing of the pack");
  for (const x of ["any part's final look", "a runtime change or a change to the active renderer", "a body coupling", "an image request, capacity or claim"]) assert.ok(RP.notApproved.includes(x), x);
  assert.match(RP.laterDependency, /clothing\/body join below the neck .* later, separate dependency/);
});

test("every source is pinned, stored byte-exact and allowed; statuses are kept, versioning approves nothing", () => {
  for (const [k, s] of Object.entries(SPEC.sources)) if (s.file) assert.equal(sha(file(s.file)), s.sha256, k);
  assert.match(file(P + "sources/.gitattributes").toString("utf8"), /^\* binary$/m, "git never normalises the copies");
  const all = JSON.stringify(SPEC.sources);
  assert.ok(!/fitting-base|H1\.png|g1v3-v1\.png|Northstar/i.test(all), "no forbidden source file");
  const tracked = execFileSync("git", ["ls-files", P], { cwd: REPO, encoding: "utf8" }).split("\n").filter(Boolean);
  assert.ok(tracked.length > 0 && tracked.every((f) => !/h1|northstar/i.test(f)), "no private reference among the tracked pack files");
  for (const k of ["browLeft", "browRight", "mouth"]) assert.equal(JSON.parse(file(SPEC.sources[k].file).toString("utf8")).status, "DRAFT", k + " stays DRAFT");
  assert.match(JSON.parse(file(SPEC.sources.noseDesign.file).toString("utf8")).design.status, /^DESIGNFORSLAG/);
  assert.match(JSON.parse(file(SPEC.sources.eyesParams.file).toString("utf8")).status, /^DESIGNPROTOTYPE v5/);
  assert.match(JSON.parse(file(P + "nape-lock-v1.spec.json").toString("utf8")).status, /^DRAFT/);
  assert.equal(SPEC.sources.d165Sheet.sha256, LIVE.authorisedCalls.calls.find((e) => e.decision === "D-165").execution.raw.sha256, "the D-165 raw recorded in the contract");
  assert.match(RP.reviewMode.statusesKept, /Versioning a file never changes its status/);
  assert.throws(() => loadPack("production"), /only in "review-pack" mode/);
  assert.equal(REVIEW_MODE, "review-pack");
});

test("the production paths keep refusing the DRAFT parts", () => {
  const ann = JSON.parse(file(SPEC.sources.browLeft.file).toString("utf8"));
  assert.equal(validateFaceAnnotation(ann, "browLeft", ann.raw.sha256, "production").code, "ANNOTATION_NOT_APPROVED");
  assert.equal(validateFaceAnnotation(ann, "browLeft", ann.raw.sha256, "preview").code, "ANNOTATION_NOT_APPROVED");
  const eyes = composeEyes({ fixed: { verdict: "DESIGNPROTOTYPE", px: PACK.eyes.fixedPx }, iris: null, annotation: null, targets: JSON.parse(file("tools/avatar/fixtures/r3-eyes/targets-eyes-v2.json").toString("utf8")), mode: "production" });
  assert.deepEqual([eyes.ok, eyes.code], [false, "FIXED_SHEET_NOT_PASSED"]);
  const hairAnn = JSON.parse(file("tools/avatar/fixtures/r3-hair/hybrid/hybrid-v2.annotation.json").toString("utf8"));
  const hair = composeHair({ sheet: { verdict: "PASS_TO_ANNOTATION", px: new Uint8ClampedArray(1024 * 1024 * 4) }, annotation: hairAnn, targets: loadTargets(), mode: "production" });
  assert.equal(hair.ok, false, "even with a passed sheet, the construction annotation is not a production annotation");
});

test("deterministic rebuild: every layer reproduces the manifest's pixel hashes; tracked candidates match", () => {
  const head = composeHead(colourLayers(PACK));
  const got = { baseMedium: pixelSha256(colourLayers(PACK).base), hybridHairPlaced: pixelSha256(PACK.hybrid.hairPx), napeLock: pixelSha256(PACK.lockPx), hairMerged: pixelSha256(PACK.hairPx), face: pixelSha256(PACK.face.facePx), headMediumBrownBrown: pixelSha256(head) };
  assert.deepEqual(got, MAN.pixelSha256);
  assert.equal(got.baseMedium, JSON.parse(file("tools/avatar/fixtures/r3-underlay-headneck/headneck-v1.manifest.json").toString("utf8")).outputs.medium.pixelSha256, "the D-186 base");
  assert.equal(got.hybridHairPlaced, "e506555e5a4481772467a4972ca24df9142f3e1f0ca711e346cee43fd765199e", "the D-185 placed candidate, unchanged before the merge");
  for (const [k, t] of Object.entries(MAN.trackedCandidates)) {
    assert.equal(sha(file(t.file)), t.sha256, k);
    assert.equal(pixelSha256(decodePng(file(t.file)).px), MAN.pixelSha256[k], k + " pixels");
  }
  assert.equal(sha(file(P + "review-pack-v1.json")), MAN.spec.sha256);
  assert.equal(sha(file(P + "nape-lock-v1.spec.json")), MAN.napeLockSpec.sha256);
  assert.deepEqual([RP.pixelSha256.headMediumBrownBrown, RP.pixelSha256.hairMerged], [MAN.pixelSha256.headMediumBrownBrown, MAN.pixelSha256.hairMerged]);
});

test("the checks pass on the actual pixels; HP6 and HP7 RUN against the pinned review parts", () => {
  assert.equal(PACK.checks.firstFailure, null);
  for (const id of ["SRC", "BASE-REBUILD", "UN-HEAD", "UN-ATTACH", "HAIR-REBUILD", "HAIR-LOCKS", "NL-BEHIND", "NL-ROOT", "NL-EXTENT", "NL-LUMINANCE", "FIG-HOLES", "HP4", "HP5", "HP6", "HP7", "HP8", "HP-FRAG", "AUTO-5", "EYES-ENVELOPE", "EYES-IRIS-LUMINANCE", "TRANSPARENCY"]) assert.equal(C[id]?.ok, true, id);
  for (const id of ["HP6", "HP7"]) assert.ok(C[id].value && typeof C[id].value === "object" && !("status" in C[id]), id + " ran (not NOT RUN)");
  assert.deepEqual([C["pre.join-continuity"].ok, C["pre.transition-silhouette"].ok], [null, null], "the H1 gates are NOT APPLICABLE, never passed");
  assert.deepEqual([C["HP-FRAG"].value.fragmentsOnHeadPx, C["HP-FRAG"].value.fragmentsOffHeadPx > 0], [0, true], "the nape lock is one component off the head");
  assert.deepEqual([C["ASSEMBLY-FIX-HOLES"].value.holesBeforePx, C["ASSEMBLY-FIX-HOLES"].value.filledPx, C["FIG-HOLES"].value.holesAfterPx], [22, 22, 0]);
  assert.match(RP.checks.scope, /hold for this review pack only, never for unknown future production assets/);
});

test("layer order follows the zModel: base < face < iris < eyes-fixed < hair", () => {
  assert.deepEqual(LAYER_ORDER, ["base", "face", "eyesIris", "eyesFixed", "hair"]);
  assert.deepEqual(RP.layerOrder, LAYER_ORDER);
  const z = Object.fromEntries(LIVE.zModel.slots.map((s) => [s.slot, s.z]));
  assert.ok(z.base < z.face && z.face < z.eyes && z.eyes < z.hair);
  assert.deepEqual(LIVE.zModel.approvedTies.find((t) => t.slot === "eyes").sublayers, ["iris", "eyes-fixed"]);
  const L = colourLayers(PACK), head = composeHead(L);
  const manual = new Uint8ClampedArray(N * 4); for (const k of LAYER_ORDER) over(manual, L[k]);
  assert.equal(pixelSha256(head), pixelSha256(manual));
  assert.notEqual(pixelSha256(composeHead(L, [...LAYER_ORDER].reverse())), pixelSha256(head), "order matters");
  // where solid hair and the solid fixed eye layer overlap, the hair wins; where the fixed layer is solid over the iris, it wins
  let hairWins = 0, both = 0, fixedWins = 0, fb = 0;
  for (let i = 0; i < N; i++) {
    if (L.hair[i * 4 + 3] === 255 && L.eyesFixed[i * 4 + 3] > 0) { both++; if (head[i * 4] === L.hair[i * 4] && head[i * 4 + 2] === L.hair[i * 4 + 2]) hairWins++; }
    if (L.eyesFixed[i * 4 + 3] === 255 && L.eyesIris[i * 4 + 3] > 0 && L.hair[i * 4 + 3] === 0) { fb++; if (head[i * 4] === L.eyesFixed[i * 4]) fixedWins++; }
  }
  assert.equal(hairWins, both); assert.ok(fb > 0); assert.equal(fixedWins, fb);
});

test("transparency and the nape lock: behind the head, merged into the hair layer, no new layer", () => {
  const B = PACK.base.built.lum; let onBase = 0;
  for (let i = 0; i < N; i++) if (PACK.lockPx[i * 4 + 3] && B[i * 4 + 3] >= 128) onBase++;
  assert.equal(onBase, 0, "never in front of the head, ear, chin or neck");
  assert.deepEqual(Object.keys(colourLayers(PACK)), LAYER_ORDER, "five layers — the nape lock is not a layer of its own");
  assert.equal(pixelSha256(mergeHair(PACK.hybrid.hairPx, new Uint8ClampedArray(N * 4))), pixelSha256(PACK.hybrid.hairPx), "merging nothing changes nothing");
  assert.equal(figureHoles(PACK.hairPx, B).n, 0);
  const head = composeHead(colourLayers(PACK)), [x0, y0, x1, y1] = SPEC.headBox; let stray = 0;
  for (let i = 0; i < N; i++) { const x = i % 1024, y = (i / 1024) | 0; if (head[i * 4 + 3] && (x < x0 || x >= x1 || y < y0 || y >= y1)) stray++; }
  assert.equal(stray, 0, "the composed head is transparent outside its box");
});

test("colour swaps touch only their own layer: eight hair colours, three iris tints, three skin tones", () => {
  const base = composeHead(colourLayers(PACK));
  const onlyWhere = (other, mask) => { let bad = 0, alpha = 0; for (let i = 0; i < N; i++) { if (base[i * 4 + 3] !== other[i * 4 + 3]) alpha++; if (mask[i * 4 + 3]) continue; for (let c = 0; c < 3; c++) if (base[i * 4 + c] !== other[i * 4 + c]) { bad++; break; } } return { bad, alpha }; };
  assert.equal(Object.keys(HAIR_COLOR_TOKENS).length, 8);
  for (const hair of Object.keys(HAIR_COLOR_TOKENS)) assert.deepEqual(onlyWhere(composeHead(colourLayers(PACK, { hair })), PACK.hairPx), { bad: 0, alpha: 0 }, hair);
  for (const k of ["blue", "green"]) assert.deepEqual(onlyWhere(composeHead(colourLayers(PACK, { iris: SPEC.tokens.iris[k].rgb })), PACK.eyes.irisPx), { bad: 0, alpha: 0 }, k);
  for (const k of ["light", "dark"]) assert.deepEqual(onlyWhere(composeHead(colourLayers(PACK, { skin: SPEC.tokens.skin[k].rgb })), PACK.base.built.lum), { bad: 0, alpha: 0 }, k);
  assert.match(SPEC.tokens.skin.light.status, /^FORSLAG/); assert.match(SPEC.tokens.skin.dark.status, /^FORSLAG/);
  assert.match(SPEC.tokens.iris.blue.status, /not adopted/); assert.match(SPEC.tokens.iris.brown.status, /^ADOPTED/);
});

test("the report names every view and separates geometry, changed hairstyle and Northstar differences", () => {
  const html = reportHtml(PACK, {});
  for (const f of ["01-northstar-vs-r3-same-head-size.png", "02-r3-with-and-without-hair.png", "03a-ears-x3.png", "03b-jaw-neck-x3.png", "03c-nape-lock-x4.png", "04-iris-brown-blue-green-x2.png", "05-hair-eight-colours.png", "06-display-360x540.png", "06-display-180x270.png", "07-skin-medium-light-dark.png", "08-layers-on-checker.png", "09-shape-differences-r3-outline-on-northstar.png"]) assert.ok(html.includes(`src="${f}"`), f);
  for (const s of ["Godkendt geometrigrundlag", "Ændret frisure", "Fortsatte forskelle fra Northstar", "FORSLAG", "R3 forbliver default OFF"]) assert.ok(html.includes(s), s);
  assert.ok(!/[ÃÂ]\S|�/.test(html));
});

test("the D-187 register row and the docs: once, directly after D-186, no mojibake", () => {
  const lines = file("docs/project-state.md").toString("utf8").split("\n");
  const row = lines.find((l) => l.startsWith("| **D-187** |"));
  assert.equal(lines.filter((l) => l.startsWith("| **D-187** |")).length, 1);
  assert.equal(lines.findIndex((l) => l.startsWith("| **D-187** |")), lines.findIndex((l) => l.startsWith("| **D-186** |")) + 1);
  for (const needle of ["REVIEWPAKKE", "reviewtilstand", "nakkelok", "UDKAST", "IKKE ANVENDELIGE", "HP6", "HP7", MAN.pixelSha256.headMediumBrownBrown, "R3 forbliver default OFF"]) assert.ok(row.includes(needle), "the D-187 row carries " + needle);
  assert.ok(!/[ÃÂ]\S|�/.test(row));
  const doc = file("docs/AVATAR_SYSTEM.md").toString("utf8");
  assert.match(doc, /\*\*R3 head review pack — one versioned, reproducible review of the whole head; nothing approved \(D-187, as of 2026-10-22\)\.\*\*/);
  assert.match(doc, /node tools\/avatar\/r3-review-pack\.mjs --out/);
});
