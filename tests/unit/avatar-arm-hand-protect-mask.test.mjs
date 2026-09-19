// D-128 — focused tests for the owner-approved arm/hand protect mask and its checker.
//
// The positive case runs against the REAL tracked fixtures. Every negative case is built in a
// throwaway temp directory: the real fixtures are never written to, and that is itself asserted.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { decodePng, encodePngRGBA } from "../../tools/avatar/build-r2-torso-occlusion-mask.mjs";
import { checkArmHandProtectMask, DEFAULT_FIXTURE_DIR, SPEC_FILE, REPO } from "../../tools/avatar/check-arm-hand-protect-mask.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const MASK = "arm-hand-protect-mask-v1.png";
const FIXTURES = [MASK, "arm-hand-derived-baseline-v1.png", "arm-hand-sleeve-exclusions-v1.png", "head-protect-mask-v1.png", SPEC_FILE];

const snapshotDir = (dir) => {
  const out = {};
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (!statSync(p).isFile()) continue;
    const buf = readFileSync(p);
    out[name] = { bytes: buf.length, sha256: sha256(buf) };
  }
  return out;
};

/**
 * Build a temp fixture directory. `mutate` receives the decoded mask and may change it; unless
 * `keepSpecHash` is set, the spec's byte count and sha256 are updated so the identity check does
 * not mask the gate under test.
 */
const buildCase = (mutate, { keepSpecHash = false, patchSpec } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "d128-mask-"));
  for (const f of FIXTURES) copyFileSync(join(DEFAULT_FIXTURE_DIR, f), join(dir, f));
  if (mutate) {
    const img = decodePng(readFileSync(join(dir, MASK)), "mask");
    mutate(img);
    const png = encodePngRGBA(img.w, img.h, Buffer.from(img.rgba));
    writeFileSync(join(dir, MASK), png);
    if (!keepSpecHash) {
      const spec = JSON.parse(readFileSync(join(dir, SPEC_FILE), "utf8"));
      spec.files.approvedMask.bytes = png.length;
      spec.files.approvedMask.sha256 = sha256(png);
      writeFileSync(join(dir, SPEC_FILE), JSON.stringify(spec, null, 2), "utf8");
    }
  }
  if (patchSpec) {
    const spec = JSON.parse(readFileSync(join(dir, SPEC_FILE), "utf8"));
    patchSpec(spec);
    writeFileSync(join(dir, SPEC_FILE), JSON.stringify(spec, null, 2), "utf8");
  }
  return dir;
};
const withCase = (mutate, opts, fn) => {
  const dir = buildCase(mutate, opts);
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};
const failsWith = (dir, needle) => {
  const { ok, problems } = checkArmHandProtectMask({ dir });
  assert.equal(ok, false, `expected a failure mentioning ${JSON.stringify(needle)}, but the check passed`);
  assert.ok(problems.some((p) => p.includes(needle)),
    `expected a problem mentioning ${JSON.stringify(needle)}, got:\n  ${problems.join("\n  ")}`);
};

// helpers that locate a pixel of a given kind in the real fixtures, so the mutations are meaningful
const realMask = () => decodePng(readFileSync(join(DEFAULT_FIXTURE_DIR, MASK)), "mask");
const realBaseline = () => decodePng(readFileSync(join(DEFAULT_FIXTURE_DIR, "arm-hand-derived-baseline-v1.png")), "base");
const realExclusions = () => decodePng(readFileSync(join(DEFAULT_FIXTURE_DIR, "arm-hand-sleeve-exclusions-v1.png")), "excl");
const realArt = () => decodePng(readFileSync(join(REPO, "assets", "avatar", "reference", "Northstar Master v2.png")), "art");
const setActive = (img, i, on) => {
  const t = i * 4;
  if (on) { img.rgba[t] = 56; img.rgba[t + 1] = 132; img.rgba[t + 2] = 255; img.rgba[t + 3] = 255; }
  else { img.rgba[t] = 0; img.rgba[t + 1] = 0; img.rgba[t + 2] = 0; img.rgba[t + 3] = 0; }
};

test("the approved fixture passes the checker", () => {
  const { ok, problems, measured } = checkArmHandProtectMask({ dir: DEFAULT_FIXTURE_DIR });
  assert.deepEqual(problems, [], "the tracked fixtures must satisfy their own specification");
  assert.equal(ok, true);
  assert.equal(measured.approvedMaskActive, 35939);
  assert.equal(measured.correctedBaselineActive, 23772);
  assert.equal(measured.lostCorrectedBaselinePixels, 0);
  assert.equal(measured.retainedExclusionPixels, 0);
  assert.equal(measured.components8.count, 2);
  assert.equal(measured.components4.count, 2);
});

test("a changed mask byte fails the identity check", () => {
  withCase((img) => {
    // flip one active pixel off; the spec keeps the approved sha256
    const m = realMask();
    for (let i = 0; i < m.w * m.h; i++) if (m.rgba[i * 4 + 3] > 0) { setActive(img, i, false); break; }
  }, { keepSpecHash: true }, (dir) => failsWith(dir, "sha256"));
});

test("a changed byte count fails the identity check", () => {
  const dir = buildCase(null);
  try {
    const buf = readFileSync(join(dir, MASK));
    writeFileSync(join(dir, MASK), Buffer.concat([buf, Buffer.from([0])]));
    failsWith(dir, "bytes");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a missing valid baseline pixel fails", () => {
  const base = realBaseline(), excl = realExclusions();
  let target = -1;
  for (let i = 0; i < base.w * base.h; i++) {
    if (base.rgba[i * 4 + 3] > 0 && excl.rgba[i * 4 + 3] === 0) { target = i; break; }
  }
  assert.ok(target >= 0, "expected at least one corrected-baseline pixel");
  withCase((img) => setActive(img, target, false), {}, (dir) =>
    failsWith(dir, "corrected-baseline pixels are missing"));
});

test("a reinstated sleeve exclusion pixel fails", () => {
  const excl = realExclusions();
  let target = -1;
  for (let i = 0; i < excl.w * excl.h; i++) if (excl.rgba[i * 4 + 3] > 0) { target = i; break; }
  assert.ok(target >= 0, "expected at least one exclusion pixel");
  withCase((img) => setActive(img, target, true), {}, (dir) =>
    failsWith(dir, "excluded sleeve pixels are still present"));
});

test("a third connected component fails", () => {
  const art = realArt();
  // a small blob on the torso: inside the figure's alpha, below the neck line, clear of both arms
  const blob = [];
  for (let y = 700; y < 706; y++) for (let x = 500; x < 506; x++) {
    const i = y * art.w + x;
    if (art.rgba[i * 4 + 3] > 0) blob.push(i);
  }
  assert.ok(blob.length > 0, "expected the sample blob to land on the figure");
  withCase((img) => { for (const i of blob) setActive(img, i, true); }, {}, (dir) =>
    failsWith(dir, "8-connectivity gives 3 components"));
});

test("an active pixel above the neck line fails", () => {
  const art = realArt();
  let target = -1;
  for (let y = 300; y < 433 && target < 0; y++) for (let x = 0; x < art.w; x++) {
    const i = y * art.w + x;
    if (art.rgba[i * 4 + 3] > 0) { target = i; break; }
  }
  assert.ok(target >= 0, "expected a figure pixel above the neck line");
  withCase((img) => setActive(img, target, true), {}, (dir) =>
    failsWith(dir, "active pixels at or above y=433"));
});

test("an overlap with the head protect zone fails", () => {
  const head = decodePng(readFileSync(join(DEFAULT_FIXTURE_DIR, "head-protect-mask-v1.png")), "head");
  let target = -1;
  for (let i = 0; i < head.w * head.h; i++) if (head.rgba[i * 4 + 3] > 0) { target = i; break; }
  assert.ok(target >= 0, "expected a head protect-zone pixel");
  withCase((img) => setActive(img, target, true), {}, (dir) =>
    failsWith(dir, "overlap the head protect zone"));
});

test("an area outside the allowed interval fails", () => {
  withCase((img) => {
    // clear the mask from the bottom up until it drops under the 30,000 floor
    let active = 0;
    for (let i = 0; i < img.w * img.h; i++) if (img.rgba[i * 4 + 3] > 0) active++;
    for (let y = img.h - 1; y >= 0 && active >= 30000; y--) {
      for (let x = 0; x < img.w; x++) {
        const i = y * img.w + x;
        if (img.rgba[i * 4 + 3] > 0) { setActive(img, i, false); active--; }
      }
    }
  }, {}, (dir) => failsWith(dir, "is outside the allowed"));
});

test("a partially active pixel fails", () => {
  withCase((img) => {
    for (let i = 0; i < img.w * img.h; i++) if (img.rgba[i * 4 + 3] === 255) { img.rgba[i * 4 + 3] = 128; break; }
  }, {}, (dir) => failsWith(dir, "partially active pixels"));
});

test("a pixel outside the figure's alpha fails", () => {
  const art = realArt();
  let target = -1;
  for (let y = 700; y < 900 && target < 0; y++) for (let x = 0; x < 200; x++) {
    const i = y * art.w + x;
    if (art.rgba[i * 4 + 3] === 0) { target = i; break; }
  }
  assert.ok(target >= 0, "expected a fully transparent pixel beside the figure");
  withCase((img) => setActive(img, target, true), {}, (dir) =>
    failsWith(dir, "outside North Star v2's alpha"));
});

test("the checker writes to neither the fixtures nor the reference asset", () => {
  const artPath = join(REPO, "assets", "avatar", "reference", "Northstar Master v2.png");
  const before = snapshotDir(DEFAULT_FIXTURE_DIR);
  const artBefore = { bytes: readFileSync(artPath).length, sha256: sha256(readFileSync(artPath)) };
  const { ok } = checkArmHandProtectMask({ dir: DEFAULT_FIXTURE_DIR });
  assert.equal(ok, true);
  assert.deepEqual(snapshotDir(DEFAULT_FIXTURE_DIR), before, "the checker must not touch the fixtures");
  assert.deepEqual({ bytes: readFileSync(artPath).length, sha256: sha256(readFileSync(artPath)) }, artBefore,
    "the checker must not touch the reference artwork");
});

test("the checker source contains no write, delete or rename call", () => {
  const src = readFileSync(join(REPO, "tools", "avatar", "check-arm-hand-protect-mask.mjs"), "utf8");
  for (const banned of ["writeFileSync", "appendFileSync", "rmSync", "unlinkSync", "renameSync", "mkdirSync", "copyFileSync", "createWriteStream"]) {
    assert.ok(!src.includes(banned), `the checker must not call ${banned}`);
  }
});

test("the spec pins the approved mask by sha256 and states it is never sent to the image API", () => {
  const spec = JSON.parse(readFileSync(join(DEFAULT_FIXTURE_DIR, SPEC_FILE), "utf8"));
  assert.equal(spec.files.approvedMask.sha256, "2dda9904717381fde9bdd5556b79c83a00b4a3b9e5c6cb9bffeca3f13e6c2264");
  assert.equal(spec.files.approvedMask.bytes, 8135);
  assert.equal(spec.gates.bindingConnectivity, 8);
  assert.equal(spec.gates.minArea, 30000);
  assert.equal(spec.gates.maxArea, 60000);
  assert.equal(spec.transitionZone.pixels, 117);
  assert.match(spec.meta.neverSent, /NEVER sent to the image API/);
  assert.match(spec.meta.notAuthorised, /No fitting-base image call is authorised/);
});

test("the tracked fixtures are byte-identical to the values the spec records", () => {
  const spec = JSON.parse(readFileSync(join(DEFAULT_FIXTURE_DIR, SPEC_FILE), "utf8"));
  for (const key of ["approvedMask", "derivedBaseline", "sleeveExclusions", "headProtectMask"]) {
    const meta = spec.files[key];
    const buf = readFileSync(join(DEFAULT_FIXTURE_DIR, meta.file));
    assert.equal(buf.length, meta.bytes, `${meta.file} byte count`);
    assert.equal(sha256(buf), meta.sha256, `${meta.file} sha256`);
  }
});
