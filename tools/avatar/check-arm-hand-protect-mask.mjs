// D-128 — deterministic checker for the OWNER-APPROVED arm/hand protect mask.
//
// It VERIFIES a fixed set of tracked fixtures. It never generates, repairs, normalises or writes
// anything: every path it touches is opened read-only. Run it on a fresh clone — it depends on
// nothing under tools/avatar/build/.
//
//   node tools/avatar/check-arm-hand-protect-mask.mjs [--dir <fixture dir>] [--quiet]
//
// The mask is used only for local recomposition and acceptance checking. It is NEVER sent to the
// image API: D-127 §1 keeps every call maskless, and D-128 §9 restates it.
//
// Exit code 0 = every gate held. Exit code 1 = at least one gate failed, with a precise diagnosis.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng } from "./build-r2-torso-occlusion-mask.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, "..", "..");
export const DEFAULT_FIXTURE_DIR = join(HERE, "fixtures", "fitting-base");
export const SPEC_FILE = "arm-hand-protect-mask-spec-v1.json";
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** Read a fixture and fail loudly rather than returning a half-usable value. */
const readFixture = (dir, name, problems) => {
  try { return readFileSync(join(dir, name)); }
  catch (err) { problems.push(`cannot read ${name}: ${err && err.code ? err.code : "unknown error"}`); return null; }
};

const activeMask = (img) => {
  const n = img.w * img.h, out = new Uint8Array(n);
  let count = 0;
  for (let i = 0; i < n; i++) if (img.rgba[i * 4 + 3] > 0) { out[i] = 1; count++; }
  return { bits: out, count };
};

const rgbaValues = (img) => {
  const m = new Map();
  for (let i = 0; i < img.w * img.h; i++) {
    const t = i * 4;
    const k = `${img.rgba[t]},${img.rgba[t + 1]},${img.rgba[t + 2]},${img.rgba[t + 3]}`;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m].sort((a, b) => b[1] - a[1]).map(([rgba, count]) => ({ rgba, count }));
};

const boundsOf = (bits, w, h, from, to) => {
  let n = 0, x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = from; x <= to; x++) {
    if (!bits[y * w + x]) continue;
    n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return n ? { pixels: n, x0, x1, y0, y1 } : { pixels: 0, x0: null, x1: null, y0: null, y1: null };
};

const componentCount = (bits, w, h, connectivity) => {
  const seen = new Uint8Array(w * h), stack = new Int32Array(w * h);
  const d4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const dirs = connectivity === 4 ? d4 : [...d4, [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const sizes = [];
  for (let s = 0; s < w * h; s++) {
    if (!bits[s] || seen[s]) continue;
    let sp = 0, n = 0;
    stack[sp++] = s; seen[s] = 1;
    while (sp) {
      const i = stack[--sp], x = i % w, y = (i - x) / w;
      n++;
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (bits[j] && !seen[j]) { seen[j] = 1; stack[sp++] = j; }
      }
    }
    sizes.push(n);
  }
  return { count: sizes.length, sizes: sizes.sort((a, b) => b - a) };
};

/**
 * Verify the approved mask against the tracked spec. Returns { ok, problems, measured }.
 * Never throws for a data problem: every failure is reported as a diagnostic string.
 */
export function checkArmHandProtectMask({ dir = DEFAULT_FIXTURE_DIR, repo = REPO } = {}) {
  const problems = [];
  const measured = {};

  let spec = null;
  const specRaw = readFixture(dir, SPEC_FILE, problems);
  if (specRaw) {
    try { spec = JSON.parse(specRaw.toString("utf8")); }
    catch { problems.push(`${SPEC_FILE} is not valid JSON`); }
  }
  if (!spec) return { ok: false, problems, measured };

  const F = spec.files, C = spec.counts, G = spec.gates, B = spec.boundingBoxes;

  // ── every fixture's full sha256 and byte count ────────────────────────────────────────────
  const load = (key) => {
    const meta = F[key];
    const raw = readFixture(dir, meta.file, problems);
    if (!raw) return null;
    const got = sha256(raw);
    if (raw.length !== meta.bytes) problems.push(`${meta.file}: ${raw.length} bytes, spec says ${meta.bytes}`);
    if (got !== meta.sha256) problems.push(`${meta.file}: sha256 ${got}, spec says ${meta.sha256}`);
    measured[key] = { bytes: raw.length, sha256: got };
    return raw;
  };
  const maskRaw = load("approvedMask");
  const baseRaw = load("derivedBaseline");
  const exclRaw = load("sleeveExclusions");
  const headRaw = load("headProtectMask");

  // the reference artwork stays where it already lives; it is not copied into the fixture dir
  let artRaw = null;
  try { artRaw = readFileSync(resolve(repo, F.referenceArtwork.file)); }
  catch { problems.push(`cannot read ${F.referenceArtwork.file}`); }
  if (artRaw) {
    const got = sha256(artRaw);
    if (artRaw.length !== F.referenceArtwork.bytes) problems.push(`${F.referenceArtwork.file}: ${artRaw.length} bytes, spec says ${F.referenceArtwork.bytes}`);
    if (got !== F.referenceArtwork.sha256) problems.push(`${F.referenceArtwork.file}: sha256 ${got}, spec says ${F.referenceArtwork.sha256}`);
    measured.referenceArtwork = { bytes: artRaw.length, sha256: got };
  }
  if (!maskRaw || !baseRaw || !exclRaw || !headRaw || !artRaw) return { ok: false, problems, measured };

  let mask, base, excl, head, art;
  try {
    mask = decodePng(maskRaw, "approved mask"); base = decodePng(baseRaw, "derived baseline");
    excl = decodePng(exclRaw, "sleeve exclusions"); head = decodePng(headRaw, "head protect mask");
    art = decodePng(artRaw, "North Star v2");
  } catch (err) { problems.push(`PNG decode failed: ${err.message}`); return { ok: false, problems, measured }; }

  const { width: W, height: H } = spec.canvas;
  for (const [name, img] of [["approved mask", mask], ["derived baseline", base], ["sleeve exclusions", excl], ["head protect mask", head], ["North Star v2", art]]) {
    if (img.w !== W || img.h !== H) problems.push(`${name} is ${img.w}x${img.h}, expected ${W}x${H}`);
  }
  if (problems.length) return { ok: false, problems, measured };
  const w = W, h = H;

  // ── binary RGBA convention ────────────────────────────────────────────────────────────────
  const values = rgbaValues(mask);
  measured.rgbaValues = values;
  const expected = spec.convention.rgbaValues.map((v) => v.rgba).sort();
  const got = values.map((v) => v.rgba).sort();
  if (values.length !== expected.length) problems.push(`approved mask has ${values.length} distinct RGBA values, expected ${expected.length}`);
  else if (JSON.stringify(got) !== JSON.stringify(expected)) problems.push(`approved mask RGBA values are ${got.join(" | ")}, expected ${expected.join(" | ")}`);
  const partial = values.filter((v) => { const a = Number(v.rgba.split(",")[3]); return a !== 0 && a !== 255; });
  measured.partiallyActivePixels = partial.reduce((s, v) => s + v.count, 0);
  if (measured.partiallyActivePixels !== spec.convention.partiallyActivePixels) {
    problems.push(`approved mask has ${measured.partiallyActivePixels} partially active pixels, expected ${spec.convention.partiallyActivePixels}`);
  }

  // ── counts, and the corrected-baseline arithmetic D-128 §3 fixes ──────────────────────────
  const m = activeMask(mask), b = activeMask(base), e = activeMask(excl), hz = activeMask(head);
  measured.approvedMaskActive = m.count;
  measured.oldDerivedBaselineActive = b.count;
  measured.sleeveExclusions = e.count;
  if (m.count !== C.approvedMaskActive) problems.push(`approved mask has ${m.count} active pixels, expected ${C.approvedMaskActive}`);
  if (b.count !== C.oldDerivedBaselineActive) problems.push(`derived baseline has ${b.count} active pixels, expected ${C.oldDerivedBaselineActive}`);
  if (e.count !== C.sleeveExclusions) problems.push(`sleeve exclusions have ${e.count} active pixels, expected ${C.sleeveExclusions}`);

  let exclOutsideBaseline = 0, corrected = 0, lost = 0, retained = 0, added = 0;
  for (let i = 0; i < w * h; i++) {
    if (e.bits[i] && !b.bits[i]) exclOutsideBaseline++;
    const isCorrected = b.bits[i] && !e.bits[i];
    if (isCorrected) corrected++;
    if (isCorrected && !m.bits[i]) lost++;
    if (m.bits[i] && e.bits[i]) retained++;
    if (m.bits[i] && !isCorrected) added++;
  }
  measured.exclusionsOutsideBaseline = exclOutsideBaseline;
  measured.correctedBaselineActive = corrected;
  measured.lostCorrectedBaselinePixels = lost;
  measured.retainedExclusionPixels = retained;
  measured.addedOverCorrectedBaseline = added;
  if (exclOutsideBaseline !== 0) problems.push(`${exclOutsideBaseline} exclusion pixels are not in the old derived baseline — the exception may not invent pixels`);
  if (corrected !== C.correctedBaselineActive) problems.push(`corrected baseline is ${corrected}, expected ${C.correctedBaselineActive}`);
  if (lost !== C.lostCorrectedBaselinePixels) problems.push(`${lost} corrected-baseline pixels are missing from the approved mask, expected ${C.lostCorrectedBaselinePixels}`);
  if (retained !== C.retainedExclusionPixels) problems.push(`${retained} excluded sleeve pixels are still present in the approved mask, expected ${C.retainedExclusionPixels}`);
  if (added !== C.addedOverCorrectedBaseline) problems.push(`approved mask adds ${added} pixels over the corrected baseline, expected ${C.addedOverCorrectedBaseline}`);

  // ── area, sides and bounding boxes ────────────────────────────────────────────────────────
  if (m.count < G.minArea || m.count > G.maxArea) problems.push(`area ${m.count} is outside the allowed ${G.minArea}-${G.maxArea}`);
  const axis = Math.floor(w / 2) - 1;                     // 511 on a 1024-wide canvas
  const left = boundsOf(m.bits, w, h, 0, axis), right = boundsOf(m.bits, w, h, axis + 1, w - 1);
  measured.viewerLeft = left; measured.viewerRight = right;
  if (left.pixels !== C.viewerLeftActive) problems.push(`viewer-left area is ${left.pixels}, expected ${C.viewerLeftActive}`);
  if (right.pixels !== C.viewerRightActive) problems.push(`viewer-right area is ${right.pixels}, expected ${C.viewerRightActive}`);
  const boxMatches = (got2, want, label) => {
    for (const k of ["x0", "x1", "y0", "y1"]) {
      if (got2[k] !== want[k]) { problems.push(`${label} bounding box ${k} is ${got2[k]}, expected ${want[k]}`); return; }
    }
  };
  boxMatches(left, B.viewerLeft, "viewer-left");
  boxMatches(right, B.viewerRight, "viewer-right");
  let topY = -1, botY = -1;
  for (let y = 0; y < h && topY < 0; y++) for (let x = 0; x < w; x++) if (m.bits[y * w + x]) { topY = y; break; }
  for (let y = h - 1; y >= 0 && botY < 0; y--) for (let x = 0; x < w; x++) if (m.bits[y * w + x]) { botY = y; break; }
  measured.topActiveY = topY; measured.bottomActiveY = botY;
  if (topY !== B.topActiveY) problems.push(`top active y is ${topY}, expected ${B.topActiveY}`);
  if (botY !== B.bottomActiveY) problems.push(`bottom active y is ${botY}, expected ${B.bottomActiveY}`);

  // ── the hard boundaries ───────────────────────────────────────────────────────────────────
  let aboveNeck = 0, headOverlap = 0, offFigure = 0, holes = 0;
  for (let y = 0; y <= G.neckLineY; y++) for (let x = 0; x < w; x++) if (m.bits[y * w + x]) aboveNeck++;
  for (let i = 0; i < w * h; i++) {
    if (m.bits[i] && hz.bits[i]) headOverlap++;
    if (m.bits[i] && art.rgba[i * 4 + 3] === 0) offFigure++;
  }
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (m.bits[i] || art.rgba[i * 4 + 3] === 0) continue;
    if (m.bits[i - 1] && m.bits[i + 1] && m.bits[i - w] && m.bits[i + w]) holes++;
  }
  measured.activeAtOrAboveNeckLine = aboveNeck;
  measured.headZoneOverlap = headOverlap;
  measured.pixelsOutsideFigureAlpha = offFigure;
  measured.enclosedHoles = holes;
  if (aboveNeck > G.maxActiveAtOrAboveNeckLine) problems.push(`${aboveNeck} active pixels at or above y=${G.neckLineY}, allowed ${G.maxActiveAtOrAboveNeckLine}`);
  if (headOverlap > G.maxHeadZoneOverlap) problems.push(`${headOverlap} pixels overlap the head protect zone, allowed ${G.maxHeadZoneOverlap}`);
  if (offFigure > G.maxPixelsOutsideFigureAlpha) problems.push(`${offFigure} pixels sit outside North Star v2's alpha, allowed ${G.maxPixelsOutsideFigureAlpha}`);
  if (holes > G.maxEnclosedHoles) problems.push(`${holes} enclosed holes, allowed ${G.maxEnclosedHoles}`);

  // ── connectivity: 8 is binding, 4 is measured and must match the documented result ─────────
  const c8 = componentCount(m.bits, w, h, 8), c4 = componentCount(m.bits, w, h, 4);
  measured.components8 = c8; measured.components4 = c4;
  if (c8.count !== G.expectedComponents8) problems.push(`8-connectivity gives ${c8.count} components (sizes ${c8.sizes.join(", ")}), expected ${G.expectedComponents8}`);
  if (c4.count !== G.expectedComponents4) problems.push(`4-connectivity gives ${c4.count} components (sizes ${c4.sizes.join(", ")}), expected ${G.expectedComponents4}`);

  return { ok: problems.length === 0, problems, measured, spec };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const args = process.argv.slice(2);
  const dirIdx = args.indexOf("--dir");
  const dir = dirIdx >= 0 && args[dirIdx + 1] ? resolve(args[dirIdx + 1]) : DEFAULT_FIXTURE_DIR;
  const quiet = args.includes("--quiet");
  const { ok, problems, measured } = checkArmHandProtectMask({ dir });
  if (!quiet) {
    console.log("arm/hand protect mask — D-128 checker");
    console.log("  fixtures : " + dir);
    if (measured.approvedMask) console.log("  mask     : " + measured.approvedMask.bytes + " B  " + measured.approvedMask.sha256);
    if (measured.approvedMaskActive !== undefined) {
      console.log("  area     : " + measured.approvedMaskActive + "   viewer-left " + measured.viewerLeft.pixels + "  viewer-right " + measured.viewerRight.pixels);
      console.log("  baseline : old " + measured.oldDerivedBaselineActive + " − exclusions " + measured.sleeveExclusions + " = corrected " + measured.correctedBaselineActive);
      console.log("             lost " + measured.lostCorrectedBaselinePixels + "   retained " + measured.retainedExclusionPixels + "   added " + measured.addedOverCorrectedBaseline);
      console.log("  bounds   : left x" + measured.viewerLeft.x0 + "-" + measured.viewerLeft.x1 + " y" + measured.viewerLeft.y0 + "-" + measured.viewerLeft.y1
        + "   right x" + measured.viewerRight.x0 + "-" + measured.viewerRight.x1 + " y" + measured.viewerRight.y0 + "-" + measured.viewerRight.y1);
      console.log("  limits   : above neck " + measured.activeAtOrAboveNeckLine + "   head overlap " + measured.headZoneOverlap
        + "   off-figure " + measured.pixelsOutsideFigureAlpha + "   holes " + measured.enclosedHoles);
      console.log("  components: 8-conn " + measured.components8.count + " (" + measured.components8.sizes.join(", ") + ")   4-conn " + measured.components4.count);
    }
  }
  if (ok) { if (!quiet) console.log("PASS — the approved mask matches its specification."); }
  else {
    console.error("FAIL — " + problems.length + " problem(s):");
    for (const p of problems) console.error("  - " + p);
  }
  process.exit(ok ? 0 : 1);
}
