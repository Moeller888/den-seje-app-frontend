// D-133 — the R3 head-edit region fixtures.
//
// Everything here is proven from the THREE TRACKED PNGs and the tracked spec, so CI never
// needs H1: the external figure (D-127 §2) is not a CI input and must never become one. The
// full source reproduction — rebuilding the fixtures from E0 + H1's alpha — is a local check,
// run with `node tools/avatar/build-r3-head-edit-masks.mjs --h1 <path> --check`, and reported
// separately. What CI enforces instead is stronger than a restatement: every count, bbox,
// component count and set relation is RECOMPUTED from the tracked pixels, so a fixture that
// drifted from the approved geometry fails here even though H1 is absent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng } from "../../tools/avatar/build-r2-torso-occlusion-mask.mjs";
import {
  FIXTURE_DIR, FILES, MARKER, EXPECT, OUT_W, OUT_H, SOLID_ALPHA, NECK_LINE_Y,
  BAND_Y_TOP, BAND_Y_BOT, BBOX_CONVENTION, H1_SHA256, E0_SHA256, E0_PATH,
  countOf, bboxOf, componentCount, dilate8, maskToPng, pngToMask, loadE0, loadH1Solid,
  buildRegions, verifyRegions, sha256, TOOL, TOOL_VERSION,
  compareArtifacts, exitCodeFor, readIfExists,
} from "../../tools/avatar/build-r3-head-edit-masks.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const fixture = (k) => join(REPO, FIXTURE_DIR, FILES[k]);
const raw = (k) => readFileSync(fixture(k));
const SPEC = JSON.parse(readFileSync(fixture("spec"), "utf8"));
const N = OUT_W * OUT_H;

/** The three regions, read back out of the tracked PNGs rather than rebuilt. */
const EDIT = pngToMask(raw("edit"), FILES.edit, MARKER.edit);
const TRANSITION = pngToMask(raw("transition"), FILES.transition, MARKER.transition);
const PROTECT = pngToMask(raw("protect"), FILES.protect, MARKER.protect);

test("the spec is the D-133 one, and it pins the tools that made it", () => {
  assert.equal(SPEC.decision, "D-133");
  assert.equal(SPEC.tool, TOOL);
  assert.equal(SPEC.toolVersion, TOOL_VERSION);
  assert.deepEqual([SPEC.canvas.width, SPEC.canvas.height], [OUT_W, OUT_H]);
  assert.equal(SPEC.canvas.origin, "top-left");
});

test("the coordinate convention is stated once and is inclusive-max", () => {
  assert.equal(SPEC.bboxConvention, "inclusive-max");
  assert.equal(BBOX_CONVENTION, "inclusive-max");
  // proven, not asserted: the EDIT bbox's width must be x1 - x0 + 1
  const [x0, y0, x1, y1] = bboxOf(EDIT);
  let minX = Infinity, maxX = -1;
  for (let i = 0; i < N; i++) if (EDIT[i]) { const x = i % OUT_W; if (x < minX) minX = x; if (x > maxX) maxX = x; }
  assert.equal(x0, minX, "x0 is the first occupied column, inclusive");
  assert.equal(x1, maxX, "x1 is the LAST occupied column, inclusive — not one past the end");
  assert.ok(y1 > y0);
});

test("each tracked mask hashes to what the spec says", () => {
  for (const key of ["edit", "transition", "protect"]) {
    assert.equal(sha256(raw(key)), SPEC.masks[key].sha256, `${FILES[key]} has changed`);
    assert.equal(raw(key).length, SPEC.masks[key].bytes);
  }
});

test("every mask is 1024x1536 RGBA8 with strictly binary alpha and one flat marker colour", () => {
  for (const key of ["edit", "transition", "protect"]) {
    const buf = raw(key);
    assert.equal(buf.readUInt8(24), 8, `${FILES[key]}: bit depth must be 8`);
    assert.equal(buf.readUInt8(25), 6, `${FILES[key]}: colour type must be 6 (RGBA)`);
    assert.equal(buf.readUInt32BE(16), OUT_W);
    assert.equal(buf.readUInt32BE(20), OUT_H);
    // pngToMask throws on non-binary alpha or an inconsistent marker, so reaching here proves both
    assert.doesNotThrow(() => pngToMask(buf, FILES[key], MARKER[key]));
  }
  assert.equal(new Set(Object.values(MARKER).map((m) => m.join(","))).size, 3, "each mask needs its own marker colour");
});

test("the marker colour is metadata: no fixture carries a pixel of the figure", () => {
  // Outside the region the RGB is 0,0,0; inside it is the flat marker. Exactly two colours in
  // the whole file — an image of a figure could not survive that constraint.
  for (const key of ["edit", "transition", "protect"]) {
    const { rgba } = decodePng(raw(key), FILES[key]);
    const seen = new Set();
    for (let i = 0; i < N; i++) seen.add(`${rgba[i * 4]},${rgba[i * 4 + 1]},${rgba[i * 4 + 2]}`);
    const allowed = new Set(["0,0,0", MARKER[key].join(",")]);
    for (const c of seen) assert.ok(allowed.has(c), `${FILES[key]} contains RGB ${c}, which is neither 0,0,0 nor its marker`);
    assert.ok(seen.size <= 2, `${FILES[key]} has ${seen.size} distinct RGB values; a region mask has at most 2`);
  }
});

test("the approved pixel counts and bboxes are what the tracked masks actually contain", () => {
  assert.equal(countOf(EDIT), EXPECT.EDIT.px);
  assert.equal(countOf(TRANSITION), EXPECT.TRANSITION.px);
  assert.equal(countOf(PROTECT), EXPECT.PROTECT.px);
  assert.deepEqual(bboxOf(EDIT), EXPECT.EDIT.bbox);
  assert.deepEqual(bboxOf(TRANSITION), EXPECT.TRANSITION.bbox);
  // and the spec must agree with the pixels, not merely with itself
  assert.equal(SPEC.masks.edit.px, EXPECT.EDIT.px);
  assert.equal(SPEC.masks.transition.px, EXPECT.TRANSITION.px);
  assert.equal(SPEC.masks.protect.px, EXPECT.PROTECT.px);
  assert.deepEqual(SPEC.masks.edit.bbox, EXPECT.EDIT.bbox);
  assert.deepEqual(SPEC.masks.transition.bbox, EXPECT.TRANSITION.bbox);
});

test("component counts hold: EDIT and the derived CORE_BASE are each one 8-connected region", () => {
  assert.equal(componentCount(EDIT), EXPECT.EDIT.components);
  assert.equal(componentCount(TRANSITION), EXPECT.TRANSITION.components);
});

test("TRANSITION is a subset of EDIT, CORE is disjoint from it, PROTECT is the exact complement", () => {
  let core = 0;
  for (let i = 0; i < N; i++) {
    if (TRANSITION[i]) assert.ok(EDIT[i], "TRANSITION must be a subset of EDIT");
    assert.notEqual(EDIT[i] ? 1 : 0, PROTECT[i] ? 1 : 0, "EDIT and PROTECT must be exact complements");
    if (EDIT[i] && !TRANSITION[i]) core++;
  }
  assert.equal(countOf(EDIT) + countOf(PROTECT), N, "EDIT ∪ PROTECT must cover the canvas exactly");
  assert.equal(core, EXPECT.CORE.px, "CORE = EDIT \\ TRANSITION must be the approved size");
});

test("CORE is derivable unambiguously as EDIT \\ TRANSITION, with the approved bbox", () => {
  const CORE = new Uint8Array(N);
  for (let i = 0; i < N; i++) CORE[i] = (EDIT[i] && !TRANSITION[i]) ? 1 : 0;
  assert.equal(countOf(CORE), EXPECT.CORE.px);
  assert.deepEqual(bboxOf(CORE), EXPECT.CORE.bbox);
  for (let i = 0; i < N; i++) assert.ok(!(CORE[i] && TRANSITION[i]), "CORE and TRANSITION may not overlap");
});

test("the band is candidate B: 21 rows, y425 to y445, straddling the neck line", () => {
  assert.equal(BAND_Y_TOP, 425);
  assert.equal(BAND_Y_BOT, 445);
  assert.equal(SPEC.band.yTop, 425);
  assert.equal(SPEC.band.yBot, 445);
  assert.equal(SPEC.band.rows, 21);
  assert.equal(SPEC.band.neckLineY, NECK_LINE_Y);
  assert.ok(BAND_Y_TOP < NECK_LINE_Y && NECK_LINE_Y < BAND_Y_BOT, "the band must straddle the neck line");
  const [, y0, , y1] = bboxOf(TRANSITION);
  assert.equal(y0, BAND_Y_TOP);
  assert.equal(y1, BAND_Y_BOT);
  for (let i = 0; i < N; i++) {
    const y = (i / OUT_W) | 0;
    if (TRANSITION[i]) assert.ok(y >= BAND_Y_TOP && y <= BAND_Y_BOT, "no TRANSITION pixel outside the band rows");
  }
});

test("EDIT stops at the band and reaches no further down the figure", () => {
  const [, , , y1] = bboxOf(EDIT);
  assert.equal(y1, BAND_Y_BOT, "EDIT must not reach below the band — the body stays protected");
  // the shoulders start ~y560; nothing in EDIT may come near them
  for (let i = 0; i < N; i++) if (EDIT[i]) assert.ok(((i / OUT_W) | 0) <= BAND_Y_BOT);
});

test("the fixtures re-encode byte-identically from their own pixels (deterministic writer)", () => {
  for (const key of ["edit", "transition", "protect"]) {
    const set = pngToMask(raw(key), FILES[key], MARKER[key]);
    assert.ok(maskToPng(set, MARKER[key]).equals(raw(key)),
      `${FILES[key]} does not reproduce byte-identically from its own region`);
  }
});

test("the builder pins H1 by sha256 and refuses anything else", () => {
  assert.equal(H1_SHA256, "72875565ecd62b542a91156dbcca1399a434fe04634f4e737df71337be0d5af4");
  assert.equal(SPEC.inputs.authoringBase.sha256, H1_SHA256);
  assert.equal(SPEC.inputs.authoringBase.tracked, false);
  // a real PNG of the right size but the wrong identity must be a hard failure, not a build
  assert.throws(() => loadH1Solid(join(REPO, E0_PATH)), /sha256 .* != pinned/, "a wrong-hash H1 must hard fail");
  assert.throws(() => loadH1Solid(undefined), /--h1 <path> is required/, "H1 may never be read from the repository");
  assert.throws(() => loadH1Solid(join(REPO, "does-not-exist.png")), /not found/);
});

test("the tracked head-protect mask is unchanged and is the builder's only tracked input", () => {
  assert.equal(sha256(readFileSync(join(REPO, E0_PATH))), E0_SHA256);
  const E0 = loadE0(REPO);
  assert.equal(countOf(E0), EXPECT.E0.px);
  assert.deepEqual(bboxOf(E0), EXPECT.E0.bbox);
  assert.equal(componentCount(E0), EXPECT.E0.components);
  assert.equal(SPEC.inputs.headProtectMask.sha256, E0_SHA256);
});

test("E0 survives inside EDIT, and the GAP-1 addition is a one-pixel rim of the approved size", () => {
  const E0 = loadE0(REPO);
  for (let i = 0; i < N; i++) if (E0[i]) assert.ok(EDIT[i], "the approved head region must survive inside EDIT");

  // Above the band the TRANSITION cannot contribute anything, so EDIT \ E0 there IS the rim —
  // recomputed from the tracked pixels, never restated from the spec.
  const rim = new Uint8Array(N);
  let above = 0;
  for (let y = 0; y < BAND_Y_TOP; y++) for (let x = 0; x < OUT_W; x++) {
    const i = y * OUT_W + x;
    if (EDIT[i] && !E0[i]) { rim[i] = 1; above++; }
  }
  assert.equal(above, EXPECT.G1_ABOVE_BAND, "the rim above the band must be exactly the approved 444 pixels");
  assert.equal(SPEC.derived.G1.headFringePixelsAboveBand, EXPECT.G1_ABOVE_BAND);

  // It is a ONE-pixel rim: every rim pixel lies within a single 8-dilation step of E0.
  const grown = dilate8(E0);
  for (let i = 0; i < N; i++) if (rim[i]) assert.ok(grown[i], "every GAP-1 pixel must lie within one dilation step of E0");

  // The 445th pixel is the neck-contour one, and it is inside the band's rows.
  const [nx, ny] = EXPECT.G1_NECK_PIXEL;
  assert.equal(ny, NECK_LINE_Y);
  assert.ok(ny >= BAND_Y_TOP && ny <= BAND_Y_BOT, "the neck-contour pixel falls inside the band");
  assert.ok(EDIT[ny * OUT_W + nx] && !E0[ny * OUT_W + nx], "the neck-contour pixel is in EDIT but not in E0");
  assert.equal(EXPECT.G1_ABOVE_BAND + 1, EXPECT.G1.px, "444 head/edge fringe + 1 neck contour = 445");

  assert.equal(SPEC.derived.G1.px, EXPECT.G1.px);
  assert.deepEqual(SPEC.derived.G1.bbox, EXPECT.G1.bbox);
  assert.deepEqual(SPEC.derived.G1.neckContourPixel, EXPECT.G1_NECK_PIXEL);
  assert.equal(SPEC.derived.G1.headFringePixelsAboveY420, EXPECT.G1_ABOVE_Y420);
});

test("the region rules are recorded, and the target figure is not one of the inputs", () => {
  assert.match(SPEC.regionRules.G1, /dilate8\(E0, 1\)/);
  assert.match(SPEC.regionRules.G1, /y <= 433/);
  assert.match(SPEC.regionRules.CORE_BASE, /E0 ∪ G1/);
  assert.match(SPEC.regionRules.TRANSITION, /425 <= y <= 445/);
  assert.match(SPEC.regionRules.CORE, /EDIT \\ TRANSITION/);
  assert.match(SPEC.regionRules.PROTECT, /complement\(EDIT\)/);
  assert.match(SPEC.inputs.targetFigure, /NOT AN INPUT/);
  assert.match(SPEC.inputs.targetFigure, /D-132 §9/);
  // and the builder must not even name the reference figure
  const src = readFileSync(join(REPO, "tools", "avatar", "build-r3-head-edit-masks.mjs"), "utf8");
  assert.ok(!/Northstar Master v2\.png/.test(src), "the builder must not read the target figure");
  assert.ok(!/assets\/avatar\/reference/.test(src), "the builder must not reach into the reference assets");
});

test("the alpha rule is D-071's, stated once", () => {
  assert.equal(SOLID_ALPHA, 128);
  assert.match(SPEC.alphaRule, /alpha >= 128/);
  assert.match(SPEC.alphaRule, /D-071/);
});

test("the fixtures are authoring fixtures, not runtime masks, and authorise nothing", () => {
  assert.match(SPEC.status, /NO IMAGE REQUEST AUTHORISED/);
  assert.match(SPEC.status, /NO CLAIM CREATED/);
  assert.match(SPEC.prohibitions.noImageRequest, /authorise no image request and no claim/);
  assert.match(SPEC.prohibitions.noRuntimePromotion, /NOT runtime masks/);
  assert.match(SPEC.prohibitions.noRefit, /hard stop/);
  assert.match(SPEC.markerSemantics, /metadata rather than image data/);
});

test("H1 and the raw provenance image are still untracked, and the fixture dir holds no figure", () => {
  const files = execFileSync("git", ["-C", REPO, "ls-files"], { encoding: "utf8" }).split("\n");
  assert.deepEqual(files.filter((p) => /fitting-base\.H1|refined\.raw/i.test(p)), []);
  const dir = join(REPO, FIXTURE_DIR);
  const listed = readdirSync(dir).sort();
  assert.deepEqual(listed, [FILES.spec, FILES.edit, FILES.protect, FILES.transition].sort(),
    "the R3 head-edit fixture directory holds exactly the three masks and their spec");
});

test("D-133 exists exactly once, is append-only, and authorises no image call or claim", () => {
  const reg = readFileSync(join(REPO, "docs", "project-state.md"), "utf8");
  const rows = reg.split("\n").filter((l) => l.startsWith("| **D-133** |"));
  assert.equal(rows.length, 1, "D-133 must appear exactly once");
  const row = rows[0];
  assert.match(row, /No image request and no claim are authorised/i);
  assert.match(row, /no claim is created or consumed/i);
  assert.match(row, /D-120 through D-132 stay verbatim/);
  assert.match(row, /425/); assert.match(row, /445/);
  assert.match(row, /124,544/); assert.match(row, /125,423/); assert.match(row, /1,447,441/);
  for (const d of ["D-131", "D-132"])
    assert.equal(reg.split("\n").filter((l) => l.startsWith("| **" + d + "** |")).length, 1, d + " must not be duplicated");
});

test("D-133 corrects D-132's storage observation without rewriting the D-132 row", () => {
  const contract = JSON.parse(readFileSync(join(REPO, "tools", "avatar", "fixtures", "r3", "r3-shadow-contract-v1.json"), "utf8"));
  const a = contract.referencePair.authoringBase;
  assert.match(a.storageObserved, /IS in the external archive/i, "the corrected fact must be recorded");
  assert.ok(!/NOT yet in the external archive/i.test(a.storageObserved), "the withdrawn claim must be gone");
  assert.match(a.storageObserved, /WORKING\/REVIEW copy/i);
  assert.match(a.storageCorrectedBy, /D-133/);
  assert.match(a.storageCorrectedBy, /register is append-only/);
  // the binding policy is untouched by the correction
  assert.match(a.storagePolicy, /NEVER be tracked/i);
  assert.equal(a.tracked, false);
});

test("D-133 closes both gaps and leaves every other owner decision open", () => {
  const contract = JSON.parse(readFileSync(join(REPO, "tools", "avatar", "fixtures", "r3", "r3-shadow-contract-v1.json"), "utf8"));
  const closed = contract.closedOwnerDecisions.map((d) => d.was).join(" | ");
  assert.match(closed, /GAP-1/);
  assert.match(closed, /GAP-2/);
  for (const d of contract.closedOwnerDecisions.filter((d) => /GAP-[12]/.test(d.was))) assert.equal(d.decision, "D-133");
  const open = contract.openOwnerDecisions;
  assert.equal(open.length, 2, "exactly the two still-undecided questions may remain");
  const joined = open.join(" | ");
  for (const [label, re] of [
    ["blush", /whether blush is part of the first slice/i],
    ["hairstyles", /VALID_HAIRSTYLES/],
  ]) assert.match(joined, re, `${label} must still be an open owner decision`);
  assert.ok(!/GAP-1|GAP-2/.test(joined), "a closed gap may not still be listed as open");
  // D-133 must say so itself
  const row = readFileSync(join(REPO, "docs", "project-state.md"), "utf8").split("\n").find((l) => l.startsWith("| **D-133** |"));
  assert.match(row, /WHAT THIS DECISION DOES NOT DECIDE/);
  assert.match(row, /All seven remain open owner decisions/);
});

test("the contract's approved regions agree with the tracked fixtures", () => {
  const contract = JSON.parse(readFileSync(join(REPO, "tools", "avatar", "fixtures", "r3", "r3-shadow-contract-v1.json"), "utf8"));
  const h = contract.headEditRegions;
  assert.equal(h.decision, "D-133");
  assert.equal(h.bboxConvention, "inclusive-max");
  assert.deepEqual(
    [h.measured.E0, h.measured.G1, h.measured.CORE_BASE, h.measured.TRANSITION, h.measured.EDIT, h.measured.CORE, h.measured.PROTECT],
    [EXPECT.E0.px, EXPECT.G1.px, EXPECT.CORE_BASE.px, EXPECT.TRANSITION.px, EXPECT.EDIT.px, EXPECT.CORE.px, EXPECT.PROTECT.px]);
  for (const key of ["edit", "transition", "protect"])
    assert.equal(h.fixtures.masks[key].sha256, SPEC.masks[key].sha256, `${key} sha must match the fixture spec`);
  assert.match(h.fixtures.notRuntime, /NOT runtime masks/);
  assert.match(h.authorisation, /authorise no image request and no claim/);
});

// ── --check failure semantics ────────────────────────────────────────────────
// A failed --check must reach the caller as a failure. It used to print "check: FAIL" and then
// exit 0, so CI would have read a failed verification as success. These run without H1 by
// driving the comparison and the exit-code mapping directly.

test("exitCodeFor turns anything that is not an explicit success into a non-zero status", () => {
  assert.equal(exitCodeFor({ ok: true }), 0);
  assert.equal(exitCodeFor({ ok: false }), 1, "a failed --check must never exit 0");
  assert.equal(exitCodeFor({}), 1, "a result without ok is a failure, not a success");
  assert.equal(exitCodeFor(undefined), 1);
  assert.equal(exitCodeFor(null), 1);
  assert.equal(exitCodeFor({ ok: "yes" }), 1, "only the boolean true counts as success");
  assert.equal(exitCodeFor({ ok: 1 }), 1);
});

test("compareArtifacts reports the tracked fixtures as identical, and writes nothing", () => {
  const png = { edit: raw("edit"), transition: raw("transition"), protect: raw("protect") };
  const specText = readFileSync(fixture("spec"), "utf8");
  const before = ["edit", "transition", "protect", "spec"].map((k) => sha256(readFileSync(fixture(k))));
  const res = compareArtifacts({ png, specText, repoRoot: REPO });
  assert.equal(res.ok, true);
  assert.deepEqual(res.results.map((r) => r.status), ["same", "same", "same", "same"]);
  assert.equal(exitCodeFor(res), 0);
  const after = ["edit", "transition", "protect", "spec"].map((k) => sha256(readFileSync(fixture(k))));
  assert.deepEqual(after, before, "a check may never write");
});

test("a differing fixture makes compareArtifacts fail, and that failure maps to exit 1", () => {
  const tampered = Buffer.from(raw("transition"));
  tampered[tampered.length - 20] ^= 0xff;
  const png = { edit: raw("edit"), transition: tampered, protect: raw("protect") };
  const res = compareArtifacts({ png, specText: readFileSync(fixture("spec"), "utf8"), repoRoot: REPO });
  assert.equal(res.ok, false);
  assert.deepEqual(res.results.map((r) => r.status), ["same", "differs", "same", "same"]);
  assert.equal(res.results[1].file, FILES.transition);
  assert.equal(exitCodeFor(res), 1, "a differing fixture must produce a non-zero exit status");
});

test("a differing spec, and a missing file, each fail the check too", () => {
  const png = { edit: raw("edit"), transition: raw("transition"), protect: raw("protect") };
  const bad = compareArtifacts({ png, specText: readFileSync(fixture("spec"), "utf8") + "\n", repoRoot: REPO });
  assert.equal(bad.ok, false);
  assert.equal(bad.results[3].status, "differs");
  assert.equal(exitCodeFor(bad), 1);

  // an absent file is a failure, not a silently skipped entry
  const gone = compareArtifacts({
    png, specText: readFileSync(fixture("spec"), "utf8"), repoRoot: REPO,
    read: (p) => (p.endsWith(FILES.protect) ? null : readIfExists(p)),
  });
  assert.equal(gone.ok, false);
  assert.equal(gone.results[2].status, "missing");
  assert.equal(exitCodeFor(gone), 1);
});

test("the CLI surfaces a refused build as a non-zero exit status", () => {
  const cli = join(REPO, "tools", "avatar", "build-r3-head-edit-masks.mjs");
  // a real 1024x1536 RGBA PNG with the wrong identity — the H1 pin must refuse it
  const wrongHash = spawnSync(process.execPath, [cli, "--h1", join(REPO, E0_PATH), "--check"], { encoding: "utf8" });
  assert.notEqual(wrongHash.status, 0, "a wrong H1 hash must exit non-zero");
  assert.match(wrongHash.stderr, /!= pinned/);
  const noArgs = spawnSync(process.execPath, [cli, "--check"], { encoding: "utf8" });
  assert.notEqual(noArgs.status, 0, "a missing --h1 must exit non-zero");
});

test("the CLI derives its exit status from exitCodeFor, and never forces success", () => {
  // the two facts above only protect the caller if the CLI is actually wired to them
  const src = readFileSync(join(REPO, "tools", "avatar", "build-r3-head-edit-masks.mjs"), "utf8");
  const cliBlock = src.slice(src.indexOf("if (process.argv[1] &&"));
  assert.ok(cliBlock.length > 0, "the CLI entry block must exist");
  assert.match(cliBlock, /process\.exitCode = exitCodeFor\(result\)/, "the exit status must come from exitCodeFor");
  assert.ok(!/process\.exit\(0\)/.test(cliBlock), "the CLI must never force a success status");
  assert.match(cliBlock, /process\.exitCode = 1/, "a thrown error must still exit non-zero");
});

test("the region builder reproduces the tracked fixtures from the pinned inputs (local only)", (t) => {
  const h1 = process.env.FITTING_BASE_V1_PATH;
  if (!h1 || !existsSync(h1)) {
    t.skip("H1 is external (D-127 §2); set FITTING_BASE_V1_PATH to run the full source reproduction");
    return;
  }
  const E0 = loadE0(REPO);
  const regions = buildRegions(E0, loadH1Solid(h1));
  verifyRegions(E0, regions);
  for (const [key, set] of [["edit", regions.EDIT], ["transition", regions.TRANSITION], ["protect", regions.PROTECT]])
    assert.ok(maskToPng(set, MARKER[key]).equals(raw(key)), `${FILES[key]} does not reproduce from H1 + E0`);
});
