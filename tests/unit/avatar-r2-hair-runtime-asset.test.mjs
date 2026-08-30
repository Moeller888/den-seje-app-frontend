// D-115 — the acceptance gates on REAL pixels: the whole pipeline, the shipped afro, and the
// Short candidate.
//
// This file drives the vendored libwebp binaries, so it is listed in tests/unit-ci-exclusions.mjs
// and runs locally only. Following the D-085 revision-2 decision, a MISSING BINARY FAILS LOUDLY
// rather than skipping: an unverified asset must not read as a pass.
//
// The Short candidate is different, and is skipped rather than failed when absent. It lives in
// tools/avatar/build/r2-hair-gen/, which is gitignored by the D-088 convention for generation
// inputs, so its absence on a fresh clone is the DESIGN and not a defect. Every structural claim
// about connectivity and about which image is measured is also proven on synthetic fixtures in
// avatar-r2-hair-candidate-check.test.mjs, which runs everywhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  analyse, authoringPreconditions, runtimeGates, countComponents, countOrphanSoft,
  ALPHA_INK, MAX_SPECK_PX, OUT_W, OUT_H,
} from "../../tools/avatar/check-r2-hair-candidate.mjs";
import {
  buildRuntimeAsset, assertWritable, WRITE_ROOT,
} from "../../tools/avatar/build-r2-hair-runtime-asset.mjs";
import { decodePng, encodePngRGBA } from "../../tools/avatar/build-r2-torso-occlusion-mask.mjs";
import { CWEBP_ARGS } from "../../tools/avatar/promote-r2-torso-asset.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const VENDOR = join(REPO, "tools", "avatar", "vendor");
const CWEBP = join(VENDOR, "cwebp.exe");
const DWEBP = join(VENDOR, "dwebp.exe");
const SCRATCH = join(WRITE_ROOT, "test-scratch");

const sha256 = (b) => createHash("sha256").update(b).digest("hex");

function requireBinaries() {
  for (const [p, name] of [[CWEBP, "cwebp"], [DWEBP, "dwebp"]]) {
    if (!existsSync(p)) {
      throw new Error(`vendored ${name} missing — run \`node tools/avatar/fetch-${name}.mjs\`. ` +
        "This gate is NOT skipped: an unverified asset must not read as a pass.");
    }
  }
}

/** Decode a tracked .webp with the pinned decoder. */
function decodeWebp(webpPath, label) {
  requireBinaries();
  mkdirSync(assertWritable(SCRATCH), { recursive: true });
  const out = assertWritable(join(SCRATCH, `${label}.png`));
  const r = spawnSync(DWEBP, [webpPath, "-o", out], { encoding: "utf8" });
  assert.equal(r.status, 0, "dwebp failed: " + (r.stderr || ""));
  return decodePng(readFileSync(out), label);
}

// The counterfactual connectivity, exactly as in the synthetic suite: the same flood fill with the
// OLD neighbour set, so "it would have failed under 4-neighbour" is a measurement and not a story.
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function componentsWith(rgba, w, h, neighbours) {
  const seen = new Uint8Array(w * h);
  const sizes = [];
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || rgba[s * 4 + 3] < ALPHA_INK) continue;
    let size = 0;
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const p = stack.pop();
      size++;
      const cx = p % w, cy = (p / w) | 0;
      for (const [dx, dy] of neighbours) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (seen[q] || rgba[q * 4 + 3] < ALPHA_INK) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    sizes.push(size);
  }
  sizes.sort((a, b) => b - a);
  return { count: sizes.length, largest: sizes[0] || 0, specks: sizes.filter((n) => n < MAX_SPECK_PX).length };
}

const AFRO_CLEANED = join(REPO, "tools", "avatar", "fixtures", "r2-hair", "afro-cleaned.png");
const AFRO_ASSET = join(REPO, "assets", "avatar-r2", "hair", "hair-afro-v1.webp");
const SHORT_LUM = join(REPO, "tools", "avatar", "build", "r2-hair-gen", "short", "short.luminance.png");

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE PIPELINE
// ═════════════════════════════════════════════════════════════════════════════════════════════

test("the pipeline produces a 512x768 asset whose decode equals the encoder's input byte-for-byte", () => {
  requireBinaries();
  const png = decodePng(readFileSync(AFRO_CLEANED), "afro-cleaned");
  const built = buildRuntimeAsset(png.rgba, png.w, png.h, { label: "test-afro" });
  assert.equal(built.w, OUT_W);
  assert.equal(built.h, OUT_H);
  assert.equal(built.byteIdentical, true, "the encode moved a pixel — the gates would judge the wrong image");
  assert.equal(Buffer.compare(Buffer.from(built.decodedRgba), Buffer.from(built.referenceRgba)), 0);
  assert.deepEqual(built.encoder.args, ["-lossless", "-exact", "-z", "9", "-metadata", "none"]);
  assert.deepEqual([...CWEBP_ARGS], built.encoder.args, "the hair path must use the runtime-asset flags");
});

test("COUNTERFACTUAL: a LOSSY encode of the same reference does NOT decode byte-identically", () => {
  // Without this, `byteIdentical: true` could simply be a check that cannot fail. Encoding the
  // very same reference with the lossy overlay settings must break the comparison.
  requireBinaries();
  const png = decodePng(readFileSync(AFRO_CLEANED), "afro-cleaned");
  const built = buildRuntimeAsset(png.rgba, png.w, png.h, { label: "test-afro" });

  mkdirSync(assertWritable(SCRATCH), { recursive: true });
  const refP = assertWritable(join(SCRATCH, "lossy-ref.png"));
  const lossyP = assertWritable(join(SCRATCH, "lossy.webp"));
  writeFileSync(refP, encodePngRGBA(built.w, built.h, built.referenceRgba));
  const enc = spawnSync(CWEBP, ["-q", "90", "-alpha_q", "100", "-m", "6", refP, "-o", lossyP], { encoding: "utf8" });
  assert.equal(enc.status, 0, "cwebp failed: " + (enc.stderr || ""));

  const lossy = decodeWebp(lossyP, "lossy-decoded");
  assert.notEqual(Buffer.compare(Buffer.from(lossy.rgba), Buffer.from(built.referenceRgba)), 0,
    "a lossy encode round-tripped exactly — the byte comparison is not discriminating anything");
});

test("the pipeline refuses a wrong authoring canvas and refuses to write outside its scratch root", () => {
  const small = Buffer.alloc(64 * 96 * 4);
  assert.throws(() => buildRuntimeAsset(small, 64, 96), /expected a 1024x1536 authoring canvas/);
  assert.throws(() => assertWritable(join(REPO, "assets", "avatar-r2", "hair", "x.webp")),
    /may only write inside/);
  assert.throws(() => assertWritable(join(REPO, "js", "avatar-layers.js")), /may only write inside/);
});

test("the encode is deterministic: the same reference gives the same bytes twice", () => {
  requireBinaries();
  const png = decodePng(readFileSync(AFRO_CLEANED), "afro-cleaned");
  const a = buildRuntimeAsset(png.rgba, png.w, png.h, { label: "det-a" });
  const b = buildRuntimeAsset(png.rgba, png.w, png.h, { label: "det-b" });
  assert.equal(a.webpSha, b.webpSha);
  assert.equal(a.referenceSha, b.referenceSha);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE SHIPPED AFRO — unchanged, and still passing on its own runtime pixels
// ═════════════════════════════════════════════════════════════════════════════════════════════

test("the shipped afro passes all nine runtime gates on its own decoded pixels", () => {
  requireBinaries();
  assert.equal(sha256(readFileSync(AFRO_ASSET)),
    "675f8f951c65266c75cc661163219a7958b612b0d45ec9471655f0bebf9eb09a",
    "this test is about the asset the owner approved, and that is not it");

  const dec = decodeWebp(AFRO_ASSET, "afro-shipped");
  assert.equal(dec.w, OUT_W);
  assert.equal(dec.h, OUT_H);

  const gates = runtimeGates(dec.rgba, dec.w, dec.h, "afro");
  const failed = gates.filter((g) => !g.pass).map((g) => g.id);
  assert.deepEqual(failed, [], "the approved afro must still pass: " + JSON.stringify(gates, null, 1));
  assert.equal(gates.length, 9);

  const a = analyse(dec.rgba, dec.w, dec.h);
  assert.equal(a.envelope.xLo, 30.625);
  assert.equal(a.envelope.xHi, 129.0625);
  // 11, NOT 2. The shipped afro was promoted BEFORE clean-served-alpha.mjs existed, so it never
  // went through the served cleanup pass; running the current pipeline over the same source would
  // yield 2 and a different file. 11 is what these bytes contain, and 11 <= 16 passes. The asset
  // is deliberately NOT rebuilt: the owner approved these pixels (D-114).
  assert.equal(a.orphanSoft, 11, "the shipped afro's runtime orphan-soft count");
  assert.equal(countOrphanSoft(dec.rgba, dec.w, dec.h), 11);
});

test("the afro's verdict does not depend on the connectivity change", () => {
  // It was one component under the OLD rule too, so D-115 cannot be what makes it pass. A change
  // that only ever helps the candidate it was written for would be a rule fitted to a result.
  requireBinaries();
  const dec = decodeWebp(AFRO_ASSET, "afro-shipped");
  assert.equal(countComponents(dec.rgba, dec.w, dec.h).count, 1, "8-neighbour: one component");
  assert.equal(componentsWith(dec.rgba, dec.w, dec.h, N4).count, 1, "4-neighbour: also one component");
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE SHORT CANDIDATE — gitignored generation input, so skipped when absent
// ═════════════════════════════════════════════════════════════════════════════════════════════

const shortAbsent = !existsSync(SHORT_LUM);
const skipShort = shortAbsent
  ? "short candidate absent — tools/avatar/build/r2-hair-gen/ is gitignored generation input (D-088)"
  : false;

// Built once and reused: the pipeline spawns two processes per call.
let SHORT = null;
function short() {
  if (!SHORT) {
    requireBinaries();
    const png = decodePng(readFileSync(SHORT_LUM), "short-luminance");
    SHORT = { png, built: buildRuntimeAsset(png.rgba, png.w, png.h, { label: "test-short" }) };
  }
  return SHORT;
}

test("the Short candidate is the file the handover measured", { skip: skipShort }, () => {
  assert.equal(sha256(readFileSync(SHORT_LUM)),
    "de930f9bf78e6bd7c5d2f9edc6d51ed1ea92b5e4aff43c4fdb757dd35199421a",
    "a different Short candidate — every number below is about the measured one");
  assert.equal(sha256(readFileSync(join(dirname(SHORT_LUM), "short.raw.png"))),
    "c7a02cbdde030a429971462096ce363bf023b9d27d78d922a0552f6447bc37c2",
    "the raw generator output changed");
});

test("Short is 10/11 — it fails the top bound, and ONLY the top bound", { skip: skipShort }, () => {
  // This test asserted 11/11 until D-116. That was true of the gate set as it then stood, and the
  // number was never the point: the candidate is a spiky cut wearing `short`'s name, and the gates
  // could not see it because nothing bounded the crown. Now one does, and the honest verdict is 10.
  // The rest of the candidate is unchanged and still correct — width, matte, legibility, geometry.
  const { png, built } = short();
  assert.equal(built.byteIdentical, true);

  const pre = authoringPreconditions(analyse(png.rgba, png.w, png.h));
  const gates = runtimeGates(built.decodedRgba, built.w, built.h, "short");
  const all = [...pre, ...gates];
  const failed = all.filter((g) => !g.pass).map((g) => g.id);

  assert.deepEqual(failed, ["within-style-envelope"],
    "exactly one check must fail: " + JSON.stringify(all, null, 1));
  assert.equal(all.filter((g) => g.pass).length, 10);
  assert.equal(all.length, 11, "eleven named checks");
  assert.equal(pre.length, 2);
  assert.equal(gates.length, 9);

  // and it is the HEIGHT that fails, not the width
  const env = gates.find((g) => g.id === "within-style-envelope");
  assert.equal(env.detail.xOk, true, "short's width was always right");
  assert.equal(env.detail.topOk, false);
  assert.equal(env.detail.top, 9.4, "the candidate's crown");
  assert.equal(env.detail.styleCrown, 20.5, "short's own crown, measured from the C2 path data");
  assert.equal(env.detail.topLimit, 16.5, "20.5 minus the 4-unit tolerance");
});

test("Short's runtime envelope and width are the measured ones", { skip: skipShort }, () => {
  const { built } = short();
  const a = analyse(built.decodedRgba, built.w, built.h);
  assert.equal(a.envelope.xLo, 50.3125);
  assert.equal(a.envelope.xHi, 111.5625);
  assert.equal(a.envelope.xHi - a.envelope.xLo, 61.25);
  assert.equal(a.orphanSoft, 14, "runtime orphan-soft");
});

test("Short's (260,30) pixel is alpha 128 with a diagonal ink neighbour at 225, and is CONNECTED",
  { skip: skipShort }, () => {
    const { built } = short();
    const { decodedRgba: rgba, w, h } = built;
    const at = (x, y) => rgba[(y * w + x) * 4 + 3];

    assert.equal(at(260, 30), 128, "the pixel is ink by exactly one level");
    assert.equal(at(259, 31), 225, "its down-left diagonal neighbour is ink");
    for (const [nx, ny] of [[259, 30], [261, 30], [260, 29], [260, 31]]) {
      assert.ok(at(nx, ny) < ALPHA_INK,
        `orthogonal neighbour ${nx},${ny} is ink (${at(nx, ny)}) — the fixture is not the case described`);
    }
    assert.equal(countComponents(rgba, w, h).count, 1, "8-neighbour sees one shape");
  });

test("COUNTERFACTUAL: reverting to 4-neighbour makes the SAME Short asset fail no-floating-islands",
  { skip: skipShort }, () => {
    const { built } = short();
    const { decodedRgba: rgba, w, h } = built;

    const eight = countComponents(rgba, w, h);
    const four = componentsWith(rgba, w, h, N4);
    assert.equal(eight.count, 1, "8-neighbour: one component");
    assert.equal(four.count, 2, "4-neighbour: two components");
    assert.equal(four.specks, 1, "4-neighbour: the attached pixel counts as a speck");
    assert.equal(four.largest, eight.largest - 1, "the split is exactly the one pixel");

    // the gate verdict each rule produces
    assert.equal(eight.count === 1 || eight.specks === 0, true, "8-neighbour passes");
    assert.equal(four.count === 1 || four.specks === 0, false, "4-neighbour fails");
  });

test("COUNTERFACTUAL: measuring the AUTHORING intermediate gives a different verdict",
  { skip: skipShort }, () => {
    // This is the whole point of D-115, on the real candidate. The authoring canvas reaches
    // x 112.03, past the short envelope's 108 + 4 tolerance; the runtime asset reaches 111.5625
    // and is inside it. If the gates ever drift back onto the intermediate, `within-style-envelope`
    // flips to a failure and this test says so.
    const { png, built } = short();
    const authoringGates = runtimeGates(png.rgba, png.w, png.h, "short");
    const runtime = runtimeGates(built.decodedRgba, built.w, built.h, "short");

    const gid = (list, id) => list.find((g) => g.id === id);
    // Compared on the X AXIS specifically. Since D-116 both images fail the envelope gate overall —
    // the candidate is too tall either way — so the whole-gate verdict no longer separates them.
    // The width still does, and that is the thing D-115 was about: the authoring canvas overruns
    // short's x-span, the image that actually ships does not.
    assert.equal(gid(authoringGates, "within-style-envelope").detail.xOk, false,
      "the authoring canvas must overrun the x-span, or this counterfactual proves nothing");
    assert.equal(gid(runtime, "within-style-envelope").detail.xOk, true,
      "the shipped asset's width must be inside the envelope");

    assert.equal(analyse(png.rgba, png.w, png.h).envelope.xHi, 112.03125);
    assert.equal(analyse(built.decodedRgba, built.w, built.h).envelope.xHi, 111.5625);

    // both fail on height, and identically — the top bound is a property of the artwork, not of
    // which image you measure, so it cannot be what distinguishes the two.
    assert.equal(gid(authoringGates, "within-style-envelope").detail.topOk, false);
    assert.equal(gid(runtime, "within-style-envelope").detail.topOk, false);
  });

test("Short's decoded asset equals the encoder's reference byte-for-byte", { skip: skipShort }, () => {
  const { built } = short();
  assert.equal(Buffer.compare(Buffer.from(built.decodedRgba), Buffer.from(built.referenceRgba)), 0);
  assert.equal(built.byteIdentical, true);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE CLI — the entry point a person actually types
// ═════════════════════════════════════════════════════════════════════════════════════════════

test("the CLI runs the whole contract end to end and exits 0 on a passing candidate", () => {
  // REGRESSION: the first version awaited run() at module top level. run() dynamically imports the
  // pipeline, which reaches back to check-r2-hair-candidate.mjs through the cleanup tools, so the
  // module could never finish evaluating and the cycle deadlocked. Node printed "unsettled
  // top-level await", the preconditions appeared, and NO gate ever ran — a tool that looked like it
  // was working. Importing the module (as every other test here does) does not reproduce it; only
  // running it as a program does.
  requireBinaries();
  const cli = join(REPO, "tools", "avatar", "check-r2-hair-candidate.mjs");
  const r = spawnSync(process.execPath, [cli, AFRO_CLEANED, "afro"], { encoding: "utf8" });

  assert.equal(r.status, 0, "the CLI failed: " + (r.stderr || r.stdout));
  assert.ok(!/unsettled top-level await/i.test(r.stderr || ""), "the module cycle deadlocked again");
  assert.match(r.stdout, /AUTHORING PRECONDITIONS \(2\)/);
  assert.match(r.stdout, /RUNTIME ACCEPTANCE GATES \(9\)/, "the gates never ran");
  assert.match(r.stdout, /decoded-matches-reference-exactly/);
  assert.match(r.stdout, /11\/11 named checks pass/);
  assert.match(r.stdout, /promotes nothing/);
});

test("the CLI exits non-zero on a candidate that fails, and names the style set on misuse", () => {
  requireBinaries();
  const cli = join(REPO, "tools", "avatar", "check-r2-hair-candidate.mjs");
  // the afro artwork judged as `short`: a real silhouette, the wrong envelope for that style
  const bad = spawnSync(process.execPath, [cli, AFRO_CLEANED, "short"], { encoding: "utf8" });
  assert.equal(bad.status, 1, "a failing candidate must not exit 0");
  assert.match(bad.stdout, /✖ within-style-envelope/);
  assert.match(bad.stdout, /CANDIDATE FAILS/);

  const junk = spawnSync(process.execPath, [cli, AFRO_CLEANED, "mullet"], { encoding: "utf8" });
  assert.equal(junk.status, 1);
  assert.match(junk.stderr, /unknown style/);
});

test("Short is NOT promoted — no hair asset exists for it", () => {
  // The safety boundary this whole piece of work runs under. Producing the bytes in gitignored
  // scratch is not shipping them; only an owner visual sign-off can start that.
  assert.equal(existsSync(join(REPO, "assets", "avatar-r2", "hair", "hair-short-v1.webp")), false,
    "a Short asset appeared in the runtime folder — promotion was not authorised");
});
