// R3 NORTHSTAR EAR FIX + QUIZ-VIEW REVIEW — D-193: a new version of the shared head underlay closes the transparent slit between
// ear and face (an exact mask, a reconstructed skin fill, nothing else changed), the D-192 afro composes without its now
// redundant back-hair fill, and the quiz-view review is a reproducible harness built from the page's own rules. The tests bind
// the sources, rebuild the fix, prove the mask, the layer order and the untouched pixels outside it, pin the harness and the
// composites, and prove the backdrop proposal touches neither the hair, the tokens, the theme colours nor the active quiz.
// No browser here (the screenshots are review output, not test input). No image call; R3 stays default OFF.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, encodePng, pixelSha256 } from "../../tools/avatar/r3-hair-tool-v2.mjs";
import * as HD from "../../tools/avatar/r3-northstar-head.mjs";
import * as HS from "../../tools/avatar/r3-northstar-hairstyles.mjs";
import * as AF from "../../tools/avatar/r3-northstar-afro.mjs";
import * as EF from "../../tools/avatar/r3-northstar-earfix.mjs";
import * as Q from "../../tools/avatar/r3-review-quiz.mjs";
import { runVariantChecks } from "../../tools/avatar/r3-review-northstar-earfix.mjs";
import { VARIANTS } from "../../tools/avatar/r3-review-pack.mjs";
import { preD193Contract, PRE_D193_CONTRACT_CANONICAL_SHA256, PRE_D193_COMMIT, preD192Contract, PRE_D192_CONTRACT_CANONICAL_SHA256 } from "./avatar-r3-d147-closure.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const file = (rel) => readFileSync(join(REPO, ...rel.split("/")));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const LIVE = JSON.parse(file("tools/avatar/fixtures/r3/r3-shadow-contract-v1.json").toString("utf8"));
const KEY = LIVE.northstarEarfixQuizReview;
const TR = EF.loadTracked(), MAN = TR.man;
const BUILD = EF.buildEarFix();
const CHECKS = runVariantChecks({ tracked: TR, build: BUILD });
const byId = Object.fromEntries(CHECKS.checks.map((c) => [c.id, c]));
const QS = Q.loadSpec();
const W = 1024, N = W * 1536;

test("D-193 adds exactly the top-level key northstarEarfixQuizReview: the contract minus it is the D-192 merge", () => {
  assert.equal(sha(JSON.stringify(preD193Contract(LIVE))), PRE_D193_CONTRACT_CANONICAL_SHA256, "canonical contract at " + PRE_D193_COMMIT);
  assert.equal(sha(JSON.stringify(preD192Contract(LIVE))), PRE_D192_CONTRACT_CANONICAL_SHA256, "and the older chain still holds");
  assert.equal(Object.keys(LIVE).at(-1), "northstarEarfixQuizReview");
  assert.deepEqual([KEY.decision, KEY.isAuthorisation, KEY.authorisesImageRequest, KEY.authorisesUpload, KEY.activeQuizChanged, KEY.themeColoursChanged], ["D-193", false, false, false, false, false]);
  assert.deepEqual(LIVE.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT"), [], "no live permission");
  assert.equal(LIVE.architecture.defaultEnabled, false, "R3 stays default OFF");
  const layersJs = file("js/avatar-layers.js").toString("utf8");
  assert.ok(!/AVATAR_R3\s*=\s*true/.test(layersJs) && !/earfix|r3-proposal/.test(layersJs));
  assert.match(LIVE.northstarAfroReview.d191Finding, /slit/, "D-192's record of the finding is unchanged");
  assert.match(KEY.backdropProposal.recommendation, /do not adopt/);
});

test("source binding: the D-191 head and the D-192 afro read through their pins; the fixtures pinned and binary", () => {
  assert.equal(sha(file(HS.MANIFEST_FILE)), MAN.baseline.manifestSha256, "the D-191 manifest is byte-identical");
  assert.equal(sha(file(AF.MANIFEST_FILE)), MAN.afroSource.manifestSha256, "the D-192 manifest is byte-identical");
  assert.equal(MAN.afroSource.mergeCommit, PRE_D193_COMMIT);
  assert.equal(sha(file(EF.SPEC_FILE)), MAN.spec.sha256);
  for (const e of [...Object.values(MAN.layers), ...Object.values(MAN.masks)]) assert.equal(sha(file(e.file)), e.sha256, e.file);
  assert.match(file(EF.FIXTURES + ".gitattributes").toString("utf8"), /^\* binary$/m);
  const tracked = execFileSync("git", ["ls-files", EF.FIXTURES, "tools/avatar/fixtures/r3-quiz-review/"], { cwd: REPO, encoding: "utf8" }).split("\n").filter(Boolean);
  assert.ok(tracked.length > 0 && tracked.every((f) => !/h1|fitting-base/i.test(f)));
  for (const id of ["BASELINE-D191", "D192-UNCHANGED"]) assert.equal(byId[id].ok, true, id);
});

test("rebuild: the fixed skin layer and the mask equal their tracked files; stats and situations pinned", () => {
  assert.equal(pixelSha256(BUILD.layers.skin), MAN.layers.skin.pixelSha256);
  assert.equal(pixelSha256(decodePng(TR.files.skin).px), MAN.layers.skin.pixelSha256);
  assert.equal(pixelSha256(BUILD.masks["ear-slit"]), MAN.masks["ear-slit"].pixelSha256);
  assert.deepEqual(BUILD.stats, MAN.stats);
  assert.deepEqual(CHECKS.changes, MAN.changesVsD191);
  for (const id of ["REBUILD", "CHANGES"]) assert.equal(byId[id].ok, true, id);
});

test("the mask: only narrow gaps between ear and face (and the pinholes they close), both ears, all transparent in D-191 and opaque now", () => {
  const bald0 = HS.composeSituation(BUILD.head, "bald"), bald1 = EF.composeSituation(BUILD, "bald"), s = EF.loadSpec().slit, M = BUILD.mask;
  let n = 0, wasOpaque = 0, outBand = 0, notOpaque = 0;
  for (let i = 0; i < N; i++) { if (!M[i]) continue; n++; const y = (i / W) | 0; if (bald0[i * 4 + 3] >= s.alphaThreshold) wasOpaque++; if (y < s.bandY[0] || y > s.bandY[1]) outBand++; if (bald1[i * 4 + 3] !== 255) notOpaque++; }
  assert.deepEqual([n, wasOpaque, outBand, notOpaque], [100, 0, 0, 0]);
  assert.deepEqual([BUILD.stats.slitLeftPx, BUILD.stats.slitRightPx], [50, 50]);
  // the open notch below the right ear lobe and the temple corner stay open (background, not slit)
  for (const [x, y] of [[619, 381], [383, 296]]) { assert.equal(M[y * W + x], 0, `${x},${y} stays open`); assert.equal(bald1[(y * W + x) * 4 + 3], 0); }
  // the mask (magenta) is exactly the build's mask
  const mp = decodePng(TR.files["ear-slit"]).px; let same = 0; for (let i = 0; i < N; i++) if (!!mp[i * 4 + 3] === !!M[i]) same++; assert.equal(same, N);
  assert.equal(byId["SLIT-CLOSED"].ok, true);
});

test("layer order and preserved pixels: only skin changes, only inside the mask; bald, short and Northstar identical outside it", () => {
  assert.deepEqual([...HD.COMPOSITE_ORDER], MAN.compositeOrder);
  assert.deepEqual(byId["LAYER-ORDER"].value.changedLayers, ["skin"]);
  assert.equal(byId["LAYER-ORDER"].value.skinChangedOutsideMaskPx, 0);
  for (const s of ["bald", "short", "northstar"]) assert.equal(CHECKS.changes[s].changedOutsideMaskPx, 0, s);
  const ns = CHECKS.changes.northstar; assert.equal(ns.insideBands["5-16"], 0); assert.ok(ns.over16.length === 3 && ns.over16.every((p) => p.alphaBefore < 128), "only where Northstar too showed the background");
  for (const id of ["LAYER-ORDER", "OUTSIDE-MASK-KEPT", "NORTHSTAR-DEFAULT"]) assert.equal(byId[id].ok, true, id);
});

test("the D-192 afro on the fixed head: its back-hair fill is not laid twice", () => {
  const v = byId["NO-DOUBLE-FILL"].value;
  assert.deepEqual([v.d192BackHairInMaskPx, v.d192BackHairOutsideMaskPx, v.differsUnderMaskPx], [MAN.afroSource.backHairInMaskPx, MAN.afroSource.backHairOutsideMaskPx, 0]);
  assert.equal(v.d192BackHairInMaskPx + v.d192BackHairOutsideMaskPx, AF.loadTracked().man.stats.headSlitFillPx, "every D-192 back-hair pixel is accounted for");
  assert.equal(CHECKS.changes.afro.changedOutsideMaskPx, v.d192BackHairOutsideMaskPx);
  assert.equal(byId["NO-DOUBLE-FILL"].ok, true);
});

test("quiz harness: the page's own rules verbatim, one placement for every hairstyle, the composites and tokens pinned", () => {
  const html = file(QS.sources.page).toString("utf8");
  for (const s of QS.sources.selectors) assert.ok(html.includes(Q.extractRule(html, s)), s + " copied verbatim");
  assert.equal(sha(Q.quizRules(QS)), MAN.quiz.rulesSha256, "the quiz avatar box is unchanged since the review (refresh the review if it changes)");
  assert.equal(sha(file(Q.SPEC_FILE)), MAN.quiz.spec.sha256);
  assert.throws(() => Q.extractRule(html, "#no-such-rule"), /no rule/);
  const page = Q.harnessHtml(QS);
  assert.equal(sha(page), MAN.quiz.harnessSha256);
  const imgs = [...page.matchAll(/<img [^>]*>/g)].map((m) => m[0]);
  assert.equal(imgs.length, QS.themes.length * 2 * QS.styles.length);
  assert.ok(imgs.every((t) => /^<img class="quiz-avatar-layer" src="img\/[a-z-]+\.png" alt="">$/.test(t)), "every hairstyle drawn by the page's own .quiz-avatar-layer rule, no per-style style or zoom");
  assert.ok(page.includes(QS.bodyMissing) && /body/.test(QS.bodyMissing));
  assert.deepEqual(MAN.quiz.hairTokens, { black: Q.hairToken("black"), blonde: Q.hairToken("blonde") });
  assert.deepEqual([Q.hairToken("black"), Q.hairToken("blonde")], [[0x2b, 0x26, 0x22], [0xc9, 0x9a, 0x5b]]);
  const comps = Q.composites(BUILD, QS).images;
  for (const [k, p] of Object.entries(comps)) { assert.equal(p.length, N * 4, k + " same canvas"); assert.equal(pixelSha256(p), MAN.quiz.composites[k], k); }
  // the screenshot decoder reads an RGBA PNG back exactly
  const px = new Uint8ClampedArray(3 * 2 * 4).map((_, i) => (i * 37) & 255); assert.deepEqual([...Q.decodeScreenshot(encodePng(3, 2, px)).px], [...px]);
});

test("the backdrop proposal: behind the avatar only, no theme colour or hair token redefined, nothing in the active quiz", () => {
  const css = QS.proposal.css;
  assert.match(css, /^#avatar-display\.r3-proposal::after \{/);
  assert.match(css, /z-index: -1;/);
  assert.ok(!/--[a-z-]+\s*:/.test(css), "no custom property is defined (theme tokens are only read)");
  assert.ok(!/quiz-avatar-layer|img|filter|drop-shadow|outline|box-shadow/.test(css), "nothing on the figure: no filter, glow or outline");
  assert.match(QS.proposal.status, /not a change to the active quiz/);
  for (const f of ["index.html", "css/theme.css", "style.css", "app.js"]) assert.ok(!/r3-proposal/.test(file(f).toString("utf8")), f + " untouched by the proposal");
  assert.equal(QS.proposal.iterations.length, 3);
});

test("review only: every check passes, yet nothing is promotable; earlier variants unchanged", () => {
  assert.equal(CHECKS.firstFailure, null);
  assert.ok(CHECKS.checks.every((c) => c.ok === true));
  assert.equal(EF.promotionStatus().promotable, false);
  assert.throws(() => EF.promote(), /cannot be promoted/);
  assert.deepEqual([...VARIANTS], ["d187", "northstar-layers", "both", "northstar-head", "northstar-brow", "northstar-hairstyles", "northstar-afro", "northstar-earfix-quiz"]);
  assert.match(file("tools/avatar/r3-review-pack.mjs").toString("utf8"), /const variant = arg\("--variant"\) \?\? "d187"/);
});
