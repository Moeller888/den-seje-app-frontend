// R3 NORTHSTAR FIGURE — D-194: the Northstar-based R3 head (D-193) on Northstar v2's own body and clothes as a REFERENCE body,
// in master coordinates. The tests bind the sources, prove the D-193 head candidates unchanged, rebuild the body and the
// changed head layers, prove the body is the master's own pixels outside the precise seam mask (no second neck or collar),
// the layer order, the hair-lock residue move, one figure for every hairstyle, and pin the view harnesses built from the
// pages' own rules. No browser here (the screenshots are review output). No image call; R3 stays default OFF.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, pixelSha256 } from "../../tools/avatar/r3-hair-tool-v2.mjs";
import * as NL from "../../tools/avatar/r3-northstar-layers.mjs";
import * as HD from "../../tools/avatar/r3-northstar-head.mjs";
import * as EF from "../../tools/avatar/r3-northstar-earfix.mjs";
import * as FG from "../../tools/avatar/r3-northstar-figure.mjs";
import * as V from "../../tools/avatar/r3-review-figure-views.mjs";
import * as Q from "../../tools/avatar/r3-review-quiz.mjs";
import { runVariantChecks, figures } from "../../tools/avatar/r3-review-northstar-figure.mjs";
import { VARIANTS } from "../../tools/avatar/r3-review-pack.mjs";
import { preD194Contract, PRE_D194_CONTRACT_CANONICAL_SHA256, PRE_D194_COMMIT, preD193Contract, PRE_D193_CONTRACT_CANONICAL_SHA256 } from "./avatar-r3-d147-closure.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const file = (rel) => readFileSync(join(REPO, ...rel.split("/")));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const LIVE = JSON.parse(file("tools/avatar/fixtures/r3/r3-shadow-contract-v1.json").toString("utf8"));
const KEY = LIVE.northstarFigureReview;
const TR = FG.loadTracked(), MAN = TR.man;
const BUILD = FG.buildFigure();
const CHECKS = runVariantChecks({ tracked: TR, build: BUILD });
const byId = Object.fromEntries(CHECKS.checks.map((c) => [c.id, c]));
const VS = V.loadViews();
const W = 1024, N = W * 1536;

test("D-194 adds exactly the top-level key northstarFigureReview: the contract minus it is the D-193 merge", () => {
  assert.equal(sha(JSON.stringify(preD194Contract(LIVE))), PRE_D194_CONTRACT_CANONICAL_SHA256, "canonical contract at " + PRE_D194_COMMIT);
  assert.equal(sha(JSON.stringify(preD193Contract(LIVE))), PRE_D193_CONTRACT_CANONICAL_SHA256, "and the older chain still holds");
  assert.equal(Object.keys(LIVE).at(-1), "northstarFigureReview");
  assert.deepEqual([KEY.decision, KEY.isAuthorisation, KEY.authorisesImageRequest, KEY.authorisesUpload, KEY.activeUiChanged], ["D-194", false, false, false, false]);
  assert.deepEqual(LIVE.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT"), [], "no live permission");
  assert.equal(LIVE.architecture.defaultEnabled, false, "R3 stays default OFF");
  const layersJs = file("js/avatar-layers.js").toString("utf8");
  assert.ok(!/AVATAR_R3\s*=\s*true/.test(layersJs) && !/northstar-figure|r3-framing/.test(layersJs));
  assert.match(KEY.limits, /no evidence that other body shapes/);
  assert.ok(KEY.notApproved.includes("Northstar's body or clothes as an R3 asset"));
});

test("source binding: the tracked Northstar v2 only, the D-193 baseline byte-identical and its head candidates unchanged", () => {
  const spec = FG.loadSpec();
  assert.equal(sha(file(spec.source.file)), "3daf32e76bff9a53ec7d25cf148a230073cfd0da6a003d02a23c4292d139ff50");
  assert.equal(spec.source.sha256, NL.SOURCE.sha256);
  assert.equal(sha(file(EF.MANIFEST_FILE)), MAN.baseline.manifestSha256);
  assert.equal(MAN.baseline.mergeCommit, PRE_D194_COMMIT);
  assert.equal(byId["BASELINE-D193"].value.d193SituationsUnchanged, true, "bald, Northstar, short and afro compose exactly as D-193 recorded");
  assert.equal(sha(file(FG.SPEC_FILE)), MAN.spec.sha256);
  for (const e of Object.values(MAN.masks)) assert.equal(sha(file(e.file)), e.sha256, e.file);
  assert.match(file(FG.FIXTURES + ".gitattributes").toString("utf8"), /^\* binary$/m);
  const tracked = execFileSync("git", ["ls-files", FG.FIXTURES], { cwd: REPO, encoding: "utf8" }).split("\n").filter(Boolean);
  assert.ok(tracked.length > 0 && tracked.every((f) => !/h1|fitting-base|\.ora$/i.test(f)));
  assert.ok(!/fitting-base|H1\.png/.test(file("tools/avatar/r3-northstar-figure.mjs").toString("utf8")), "the generator never names H1");
  assert.equal(byId.SOURCE.ok, true);
});

test("rebuild: the body, the changed head layers and every mask equal their pins; the figures are pinned", () => {
  assert.equal(pixelSha256(BUILD.body), MAN.pixels.body);
  assert.equal(pixelSha256(BUILD.layers.skin), MAN.pixels.skin);
  assert.equal(pixelSha256(BUILD.layers.hair), MAN.pixels.hair);
  for (const k of FG.MASKS) { assert.equal(pixelSha256(BUILD.masks[k]), MAN.masks[k].pixelSha256, k); assert.equal(pixelSha256(decodePng(TR.files[k]).px), MAN.masks[k].pixelSha256, k + " file"); }
  assert.deepEqual(BUILD.stats, MAN.stats);
  const fig = figures(BUILD); for (const s of FG.SITUATIONS) assert.equal(pixelSha256(fig[s]), MAN.figures[s], s);
  assert.equal(byId.REBUILD.ok, true);
});

test("unchanged areas and the neck seam: the body is the master outside the seam mask, nothing under the opaque head", () => {
  const v = byId["BODY-ORIGINAL"].value;
  assert.deepEqual([v.changedOutsideSeamPx, v.bodyAboveSeamPx, v.bodyUnderOpaqueHeadPx, v.masterAboveSeamUncoveredPx], [0, 0, 0, 0]);
  assert.ok(v.originalPx > 1_000_000);
  const s = byId["NECK-SEAM"].value; assert.deepEqual([s.seamPx, s.underHeadPx, s.maxVisibleDiffBelowSeam], [163, 3393, 0]);
  // the seam mask is exactly the head's antialiased edge below the seam line
  const spec = FG.loadSpec().body, bald = BUILD.bald; let bad = 0;
  for (let i = spec.seamY * W; i < N; i++) { const a = bald[i * 4 + 3], inSeam = BUILD.seam[i] === 1; if (inSeam !== (a > 0 && a < spec.opaqueHeadAlpha)) bad++; }
  assert.equal(bad, 0);
  for (const id of ["BODY-ORIGINAL", "NECK-SEAM"]) assert.equal(byId[id].ok, true, id);
});

test("layer order and the residue: body first, D-193's head order, hair on top; only skin and hair change, only at the 11 residue pixels", () => {
  assert.deepEqual(MAN.figureOrder, ["body", ...HD.COMPOSITE_ORDER]);
  const lo = byId["LAYER-ORDER"].value; assert.deepEqual([lo.changedHeadLayers, lo.changedOutsideResidueMaskPx], [["skin", "hair"], 0]);
  const r = byId.RESIDUE.value; assert.deepEqual([r.movedPx, r.opaqueSpecksLeftInBand, r.northstarMaxDiffAtResidue], [11, 0, 0]);
  // every residue pixel is right of the face axis, below the ear, and hair-lock brown
  for (let i = 0; i < N; i++) if (BUILD.residue[i]) { const x = i % W, y = (i / W) | 0, S = BUILD.ef.layers.skin; assert.ok(x > 600 && y >= 383 && y <= 399, `${x},${y}`); assert.ok(S[i * 4] > S[i * 4 + 1] && S[i * 4 + 1] > S[i * 4 + 2]); }
  for (const id of ["LAYER-ORDER", "RESIDUE"]) assert.equal(byId[id].ok, true, id);
});

test("one framing: the same figure, size and head place for every hairstyle", () => {
  assert.equal(byId["ONE-FRAMING"].value.bodyDiffersBetweenStylesPx, 0);
  assert.equal(byId["ONE-FRAMING"].ok, true);
  const { images } = V.composites(BUILD, VS);
  for (const [k, p] of Object.entries(images)) { assert.equal(p.length, N * 4, k); assert.equal(pixelSha256(p), MAN.views.composites[k], k); }
});

test("view harnesses: the pages' own rules verbatim, one placement per view, no backdrop, the framing proposal shared and labelled", () => {
  assert.equal(sha(file(V.VIEWS_FILE)), MAN.views.spec.sha256);
  assert.deepEqual(VS.views.map((v) => [v.id, v.css]), [["quiz", [52, 78]], ["hub", [110, 165]], ["collection", [120, 180]], ["avatar", [180, 270]], ["shop", [130, 152]]]);
  for (const v of VS.views) {
    const html = file(v.page).toString("utf8");
    for (const s of v.selectors) assert.ok(html.includes(Q.extractRule(html, s)), `${v.id} ${s} verbatim`);
    assert.equal(sha(V.viewRules(v)), MAN.views.rulesSha256[v.id], `${v.id}: the view's rules are unchanged since the review (refresh the review if they change)`);
    const page = V.harnessHtml(v, VS); assert.equal(sha(page), MAN.views.harnessSha256[v.id], v.id);
    const imgs = [...page.matchAll(/<img [^>]*>/g)].map((m) => m[0]);
    assert.equal(imgs.length, v.themes.length * 2 * VS.styles.length);
    assert.ok(imgs.every((t) => t === `<img class="${v.layerClass}" src="img/${t.match(/img\/([a-z-]+)\.png/)[1]}.png" alt="">`), v.id + ": the page's own layer rule, no per-style zoom");
    // the theme file is inlined whole (it has its own ::after and color-mix rules); the harness's OWN rules add no backdrop
    const own = page.replace(file(VS.themes).toString("utf8"), "");
    assert.ok(!/r3-proposal|color-mix|(?<!\*)::after/.test(own), v.id + ": no backdrop (only the universal *::after box-sizing reset)");
  }
  assert.equal(VS.views.find((v) => v.id === "quiz").dprs.join(), "1,2,3");
  assert.deepEqual(VS.views.find((v) => v.id === "quiz").themes, ["default", "pearl", "inferno", "forest"]);
  assert.match(VS.framingProposal.css, /scale\(1\.6\); transform-origin: 50% 0%/);
  assert.match(VS.framingProposal.status, /not a change to the active UI/);
  for (const f of ["index.html", "hub.html", "avatar.html", "collection.html", "shop.html", "css/theme.css"]) assert.ok(!/r3-framing/.test(file(f).toString("utf8")), f + " untouched");
});

test("review only: every check passes, yet nothing is promotable; earlier variants unchanged", () => {
  assert.equal(CHECKS.firstFailure, null);
  assert.ok(CHECKS.checks.every((c) => c.ok === true));
  assert.equal(FG.promotionStatus().promotable, false);
  assert.throws(() => FG.promote(), /cannot be promoted/);
  assert.deepEqual([...VARIANTS], ["d187", "northstar-layers", "both", "northstar-head", "northstar-brow", "northstar-hairstyles", "northstar-afro", "northstar-earfix-quiz", "northstar-figure"]);
  assert.match(file("tools/avatar/r3-review-pack.mjs").toString("utf8"), /const variant = arg\("--variant"\) \?\? "d187"/);
});
