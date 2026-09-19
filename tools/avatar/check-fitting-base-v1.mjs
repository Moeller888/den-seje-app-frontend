// D-131 — READ-ONLY checker for the owner-approved North Star v2 fitting base v1.
//
// It NEVER writes, repairs, normalises or re-encodes anything. Every path it touches is opened for
// reading only, and a test asserts this file contains no write call at all.
//
//   node tools/avatar/check-fitting-base-v1.mjs [--image <path>] [--require] [--quiet]
//
// WHERE THE IMAGE LIVES. D-127 §2 keeps an approved fitting base OUTSIDE both repositories and
// never under assets/, because assets/ is inside the Cloudflare deploy allowlist and the GitHub
// repository is public. D-131 leaves that rule intact, so the image is deliberately NOT tracked and
// a fresh clone cannot reproduce it. The checker therefore SKIPS with a clear notice when the image
// is absent, and verifies fully when it is present. `--require` turns absence into a failure, so a
// local run cannot pass by simply not finding the file.
//
// THE ARM/HAND PROTECT MASK IS NOT APPLIED to the fitting base. Its difference is measured and
// reported, and it is reported as NOT APPLIED — never as a passed gate.
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng } from "./build-r2-torso-occlusion-mask.mjs";
import { downscaleHalf } from "./promote-r2-torso-asset.mjs";
import { countOrphanSoft, ALPHA_INK } from "./check-r2-hair-candidate.mjs";
import { RENDER_SIZES } from "./check-r2-torso-candidate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, "..", "..");
export const SPEC_PATH = join(HERE, "fixtures", "fitting-base", "fitting-base-spec-v1.json");
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const INK = ALPHA_INK;

/** Where the untracked image is expected: an explicit path, the env var, then the spec's default. */
export function resolveImagePath(spec, opts = {}) {
  if (opts.image) return resolve(opts.image);
  const env = (opts.env || process.env)[spec.storage.externalPathEnvVar];
  if (typeof env === "string" && env.trim() !== "") return resolve(env.trim());
  return spec.storage.externalPath;
}

const boxOutsideEnvelope = (buf, art, w, h, R = 24) => {
  const rr = new Int32Array(h * 2);
  for (let y = 0; y < h; y++) { let a = w, b = -1; for (let x = 0; x < w; x++) if (art[(y * w + x) * 4 + 3] >= INK) { if (x < a) a = x; if (x > b) b = x; } rr[y * 2] = a; rr[y * 2 + 1] = b; }
  let n = 0;
  for (let y = 0; y < h; y++) {
    let lo = w, hi = -1;
    for (let yy = Math.max(0, y - R); yy <= Math.min(h - 1, y + R); yy++) { const a = rr[yy * 2], b = rr[yy * 2 + 1]; if (b >= 0) { if (a < lo) lo = a; if (b > hi) hi = b; } }
    lo -= R; hi += R;
    for (let x = 0; x < w; x++) if (buf[(y * w + x) * 4 + 3] >= INK && (x < lo || x > hi || hi < 0)) n++;
  }
  return n;
};
const componentSizes = (buf, w, h) => {
  const seen = new Uint8Array(w * h), sizes = [], st = new Int32Array(w * h);
  const d8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let s = 0; s < w * h; s++) {
    if (buf[s * 4 + 3] < INK || seen[s]) continue;
    let sp = 0, n = 0; st[sp++] = s; seen[s] = 1;
    while (sp) { const i = st[--sp], x = i % w, y = (i - x) / w; n++;
      for (const [dx, dy] of d8) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const j = ny * w + nx; if (buf[j * 4 + 3] >= INK && !seen[j]) { seen[j] = 1; st[sp++] = j; } } }
    sizes.push(n);
  }
  return sizes.sort((a, b) => b - a);
};
const downTo = (buf, w, h, dw, dh) => {
  const out = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const sx0 = Math.floor(x * w / dw), sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * w / dw));
    const sy0 = Math.floor(y * h / dh), sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * h / dh));
    let r = 0, g = 0, b = 0, as = 0, n = 0;
    for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) { const i = (sy * w + sx) * 4, a = buf[i + 3]; r += buf[i] * a; g += buf[i + 1] * a; b += buf[i + 2] * a; as += a; n++; }
    const d = (y * dw + x) * 4;
    if (as > 0) { out[d] = Math.round(r / as); out[d + 1] = Math.round(g / as); out[d + 2] = Math.round(b / as); out[d + 3] = Math.round(as / n); }
  }
  return out;
};

/**
 * Verify the approved fitting base against its tracked specification.
 * Returns { status: "PASS" | "FAIL" | "SKIPPED", problems, measured }. Never throws for a data
 * problem, and never writes.
 */
export function checkFittingBaseV1(opts = {}) {
  const problems = [];
  const measured = {};
  const specPath = opts.specPath || SPEC_PATH;
  const repo = opts.repo || REPO;

  let spec = null;
  try { spec = JSON.parse(readFileSync(specPath, "utf8")); }
  catch { return { status: "FAIL", problems: ["cannot read or parse " + specPath], measured }; }
  measured.specSha256 = sha256(readFileSync(specPath));

  const imagePath = resolveImagePath(spec, opts);
  measured.imagePath = imagePath;
  if (!existsSync(imagePath)) {
    const why = "the approved fitting base is not present at " + imagePath
      + ". D-127 §2 keeps it outside both repositories, so a fresh clone cannot reproduce it.";
    if (opts.require) return { status: "FAIL", problems: ["REQUIRED BUT ABSENT: " + why], measured, spec };
    return { status: "SKIPPED", problems: [], measured, spec, why };
  }

  const raw = readFileSync(imagePath);
  measured.bytes = raw.length;
  measured.sha256 = sha256(raw);
  if (raw.length !== spec.file.bytes) problems.push(`byte count is ${raw.length}, spec says ${spec.file.bytes}`);
  if (measured.sha256 !== spec.file.sha256) problems.push(`sha256 is ${measured.sha256}, spec says ${spec.file.sha256}`);
  // The hash IS the identity control: if it does not match, nothing measured below describes the
  // approved artwork, so stop rather than report numbers about a different file.
  if (problems.length) return { status: "FAIL", problems, measured, spec };

  let img;
  try { img = decodePng(raw, "fitting base v1"); } catch (e) { return { status: "FAIL", problems: ["PNG decode failed: " + e.message], measured, spec }; }
  const { w, h } = img;
  measured.width = w; measured.height = h;
  if (w !== spec.file.width || h !== spec.file.height) problems.push(`${w}x${h}, spec says ${spec.file.width}x${spec.file.height}`);
  const bitDepth = raw[24], colourType = raw[25];
  measured.bitDepth = bitDepth; measured.colourType = colourType;
  if (bitDepth !== spec.file.bitDepth) problems.push(`bit depth ${bitDepth}, spec says ${spec.file.bitDepth}`);
  if (colourType !== spec.file.colourType) problems.push(`colour type ${colourType}, spec says ${spec.file.colourType}`);
  if (problems.length) return { status: "FAIL", problems, measured, spec };

  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].map(([x, y]) => img.rgba[(y * w + x) * 4 + 3]);
  measured.cornerAlpha = corners;
  if (!corners.every((a) => a === 0)) problems.push(`corner alpha ${corners.join(",")}, all must be 0`);

  const comps = componentSizes(img.rgba, w, h);
  measured.components = comps.length;
  measured.specks = comps.filter((n) => n < 50).length;
  if (comps.length !== spec.gates.opaqueComponents) problems.push(`${comps.length} opaque components, spec says ${spec.gates.opaqueComponents}`);
  if (measured.specks > spec.gates.maxSpecks) problems.push(`${measured.specks} specks, allowed ${spec.gates.maxSpecks}`);

  // head protect zone, against the tracked reference and the tracked mask
  const artPath = join(repo, "assets", "avatar", "reference", "Northstar Master v2.png");
  const maskPath = join(HERE, "fixtures", "fitting-base", spec.provenance.headMask);
  let art = null, mask = null;
  try {
    const ab = readFileSync(artPath), mb = readFileSync(maskPath);
    if (sha256(ab) !== spec.provenance.northStarV2Sha256) problems.push("North Star v2 hash mismatch");
    if (sha256(mb) !== spec.provenance.headMaskSha256) problems.push("head protect mask hash mismatch");
    art = decodePng(ab, "v2"); mask = decodePng(mb, "head mask");
  } catch { problems.push("cannot read North Star v2 or the head protect mask"); }
  if (art && mask) {
    let headBytes = 0, headSil = 0;
    for (let i = 0; i < w * h; i++) {
      if (mask.rgba[i * 4 + 3] === 0) continue;
      for (let k = 0; k < 4; k++) if (img.rgba[i * 4 + k] !== art.rgba[i * 4 + k]) headBytes++;
      if ((img.rgba[i * 4 + 3] >= INK) !== (art.rgba[i * 4 + 3] >= INK)) headSil++;
    }
    measured.headProtectDifferingBytes = headBytes;
    measured.headSilhouetteDeviation = headSil;
    if (headBytes !== spec.gates.headProtectDifferingBytes) problems.push(`head protect zone differs by ${headBytes} bytes, spec says ${spec.gates.headProtectDifferingBytes}`);
    if (headSil !== spec.gates.headSilhouetteDeviation) problems.push(`head silhouette deviates by ${headSil}, spec says ${spec.gates.headSilhouetteDeviation}`);
    measured.pixelsOutsideEnvelope = boxOutsideEnvelope(img.rgba, art.rgba, w, h);
    if (measured.pixelsOutsideEnvelope !== spec.gates.pixelsOutsideEnvelope) problems.push(`${measured.pixelsOutsideEnvelope} pixels outside the envelope, spec says ${spec.gates.pixelsOutsideEnvelope}`);
    // measured, never gated: the arm/hand mask is NOT applied to the fitting base
    const armPath = join(HERE, "fixtures", "fitting-base", spec.armHandProtectMask.file);
    try {
      const arm = decodePng(readFileSync(armPath), "arm mask");
      let armBytes = 0;
      for (let i = 0; i < w * h; i++) { if (arm.rgba[i * 4 + 3] === 0) continue; for (let k = 0; k < 4; k++) if (img.rgba[i * 4 + k] !== art.rgba[i * 4 + k]) armBytes++; }
      measured.armHandMaskDifferingBytes = armBytes;
      measured.armHandMaskApplied = false;
    } catch { measured.armHandMaskDifferingBytes = null; }
  }

  const served = downscaleHalf(w, h, img.rgba);
  measured.servedWidth = w >> 1; measured.servedHeight = h >> 1;
  if (served.length !== (w >> 1) * (h >> 1) * 4) problems.push("downscaleHalf did not produce a 512x768 buffer");
  measured.orphanSoftAuthoring = countOrphanSoft(img.rgba, w, h);
  measured.orphanSoftServed = countOrphanSoft(served, w >> 1, h >> 1);
  if (measured.orphanSoftAuthoring > spec.gates.orphanSoftAuthoringBudget) problems.push(`orphan-soft authoring ${measured.orphanSoftAuthoring}, budget ${spec.gates.orphanSoftAuthoringBudget}`);
  if (measured.orphanSoftServed > spec.gates.orphanSoftServedBudget) problems.push(`orphan-soft served ${measured.orphanSoftServed}, budget ${spec.gates.orphanSoftServedBudget}`);

  measured.renderSizes = RENDER_SIZES.map(([rw, rh]) => {
    const d = downTo(img.rgba, w, h, rw, rh);
    return { size: rw + "x" + rh, orphanSoft: countOrphanSoft(d, rw, rh) };
  });
  for (const want of spec.gates.renderSizes) {
    const got = measured.renderSizes.find((r) => r.size === want.size);
    if (!got) { problems.push(`render size ${want.size} was not measured`); continue; }
    if (got.orphanSoft !== want.orphanSoft) problems.push(`render ${want.size}: orphan-soft ${got.orphanSoft}, spec records ${want.orphanSoft}`);
  }

  return { status: problems.length ? "FAIL" : "PASS", problems, measured, spec };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const argv = process.argv.slice(2);
  const iIdx = argv.indexOf("--image");
  const r = checkFittingBaseV1({
    image: iIdx >= 0 ? argv[iIdx + 1] : undefined,
    require: argv.includes("--require"),
  });
  const quiet = argv.includes("--quiet");
  if (!quiet) {
    console.log("North Star v2 fitting base v1 — D-131 checker");
    console.log("  spec   : " + SPEC_PATH);
    console.log("  image  : " + r.measured.imagePath);
    if (r.status === "SKIPPED") {
      console.log("  status : SKIPPED — " + r.why);
      console.log("           This is expected on a fresh clone and in CI. Pass --require to make it a failure.");
    } else if (r.measured.sha256) {
      console.log("  file   : " + r.measured.bytes + " B  " + r.measured.sha256);
      console.log("  canvas : " + r.measured.width + "x" + r.measured.height + "  depth " + r.measured.bitDepth + "  colourtype " + r.measured.colourType);
      console.log("  head   : " + r.measured.headProtectDifferingBytes + " differing bytes vs North Star v2   silhouette " + r.measured.headSilhouetteDeviation);
      console.log("  shape  : " + r.measured.components + " component(s), " + r.measured.specks + " specks, " + r.measured.pixelsOutsideEnvelope + " px outside the envelope");
      console.log("  alpha  : authoring " + r.measured.orphanSoftAuthoring + " (budget " + r.spec.gates.orphanSoftAuthoringBudget + ")   served " + r.measured.orphanSoftServed + " (budget " + r.spec.gates.orphanSoftServedBudget + ")");
      console.log("  render : " + r.measured.renderSizes.map((x) => x.size + "=" + x.orphanSoft).join("  "));
      console.log("  arm/hand mask: NOT APPLIED — " + r.measured.armHandMaskDifferingBytes + " bytes differ from v2, by design under D-131's bounded exception. This is NOT a passed gate.");
    }
  }
  if (r.status === "PASS") { if (!quiet) console.log("PASS — the approved fitting base matches its specification. This is not visual approval."); process.exit(0); }
  if (r.status === "SKIPPED") { if (!quiet) console.log("SKIPPED — nothing was verified."); process.exit(0); }
  console.error("FAIL — " + r.problems.length + " problem(s):");
  for (const p of r.problems) console.error("  - " + p);
  process.exit(1);
}
