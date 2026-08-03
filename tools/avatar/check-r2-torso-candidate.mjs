// 167A option A / step A2 — QA harness for a torso overlay CANDIDATE (deterministic, NON-AI).
// ---------------------------------------------------------------------------
// Plan of record: docs/167a-r2-torso-asset-production-plan.md (D-084)
// Mask template:  tools/avatar/fixtures/r2-torso/ (D-085, A1_ACCEPTED)
// Art brief:      docs/167a-r2-torso-a2-art-brief.md
//
// WHAT THIS IS:
//   * The judge for A2. It takes ONE candidate PNG and decides, against the ACCEPTED A1 masks,
//     whether it may be promoted. It does not generate, retouch or repair anything.
//   * Deterministic and NON-AI: the same candidate always produces the same verdict, so a rejection
//     can be argued with rather than re-rolled.
//   * The gates implement D-037's automated set for this slot: mask compliance, mandatory occlusion,
//     alpha cleanliness, island freedom, and legibility at the four D-071 render sizes.
//
// WHAT THIS IS NOT:
//   * NOT a generator (no AI, no network, no API key is read here) and NOT a promoter: it never
//     writes to assets/, never touches R2_MANIFEST, the catalog, the runtime or AVATAR_R2.
//   * NOT the final word. A PASS here is a precondition for human style/safety review and the owner's
//     visual sign-off, exactly as A1 was.
//
//   node tools/avatar/check-r2-torso-candidate.mjs <candidate.png>   (npm run avatar:r2-torso-check)
//   node tools/avatar/check-r2-torso-candidate.mjs --selftest        (synthetic pass/fail cases)
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { inflateSync, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, sep } from "node:path";
import { decodePng, OUT_W, OUT_H } from "./build-r2-torso-occlusion-mask.mjs";

export const TOOL = "check-r2-torso-candidate";
export const TOOL_VERSION = "1.0.0";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const FIX_DIR = join(HERE, "fixtures", "r2-torso");
const OUT_DIR = join(HERE, "build", "r2-torso-candidate");
const rel = (p) => resolve(p).slice(resolve(REPO).length + 1).split(sep).join("/");

// Thresholds. Every one of them is a number the reviewer can argue with, not a hidden judgement.
export const OPAQUE = 250;            // "fully opaque" for the mandatory-occlusion gate
export const VISIBLE = 1;             // any alpha >= this counts as ink on the canvas
export const MAX_STRAY_PX = 0;        // ink outside the edit zone — zero tolerance (D-037)
export const MAX_HARD_GAP_PX = 0;     // holes in the mandatory region — zero tolerance
export const MIN_COMPONENT = 64;      // Master px; smaller opaque islands are specks
export const MAX_SPECKS = 0;
export const MAX_ORPHAN_SOFT_PX = 64; // semi-transparent pixels with no opaque neighbour = halo
export const SERVED = { w: 512, h: 768 };
export const RENDER_SIZES = [[180, 270], [112, 168], [72, 108], [52, 78]];   // D-071
export const MIN_SCALE_COVERAGE = 0.55;  // of the hard region's own footprint, at each render size

const sha256 = (b) => createHash("sha256").update(b).digest("hex");

function loadMasks() {
  const need = ["torso-occlusion-hard-v1.png", "torso-edit-allowed-v1.png", "torso-protect-v1.png", "torso-mask-spec-v1.json"];
  for (const f of need) {
    if (!existsSync(join(FIX_DIR, f))) {
      throw new Error(`missing A1 template file ${rel(join(FIX_DIR, f))}\n  build it with: npm run avatar:r2-torso-mask -- --write`);
    }
  }
  const spec = JSON.parse(readFileSync(join(FIX_DIR, "torso-mask-spec-v1.json"), "utf8"));
  const read = (f) => {
    const buf = readFileSync(join(FIX_DIR, f));
    if (sha256(buf) !== spec.masks[f].sha256) {
      throw new Error(`${rel(join(FIX_DIR, f))} does not match the SHA recorded in the spec — the template is inconsistent; re-run the A1 builder.`);
    }
    const img = decodePng(buf, f);
    const m = new Uint8Array(img.w * img.h);
    for (let i = 0; i < m.length; i++) m[i] = img.rgba[i * 4 + 3] > 0 ? 1 : 0;
    return m;
  };
  return { spec, hard: read("torso-occlusion-hard-v1.png"), edit: read("torso-edit-allowed-v1.png"), protect: read("torso-protect-v1.png") };
}

// ── candidate analysis ──────────────────────────────────────────────────────
const NEIGH8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function components(mask, w, h) {
  const seen = new Uint8Array(w * h); const out = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || seen[s]) continue;
    let n = 0; const stack = [s]; seen[s] = 1;
    while (stack.length) {
      const j = stack.pop(); n++;
      const y = (j / w) | 0, x = j % w;
      for (const [dx, dy] of NEIGH8) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const k = yy * w + xx;
        if (mask[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
    out.push(n);
  }
  return out.sort((a, b) => b - a);
}
function boxDownscaleAlpha(alpha, w, h, tw, th) {
  const out = new Float64Array(tw * th);
  for (let y = 0; y < th; y++) {
    const sy0 = Math.floor((y * h) / th), sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * h) / th));
    for (let x = 0; x < tw; x++) {
      const sx0 = Math.floor((x * w) / tw), sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * w) / tw));
      let s = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) { s += alpha[sy * w + sx]; n++; }
      out[y * tw + x] = n ? s / n : 0;
    }
  }
  return out;
}

// A candidate may be partly CONSTRUCTED by the adapter (backfill of the mandatory region). That must
// never be invisible in the verdict, so the adapter's sidecar is folded into the report and a
// dominant fill blocks. The 25 % line is a judgement call, not a law of nature — it is written here so
// the owner can argue with it rather than discover it.
export const MAX_BACKFILL_SHARE = 0.25;

// ── D-095: per-band coverage ──────────────────────────────────────────────────
// The same bands the adapter attributes backfill to, so a shortfall and its fill are reported in
// the same vocabulary. Master-canvas y ranges.
export const BANDS = Object.freeze({ collar: [0, 560], shoulder: [560, 714], torso: [714, 902], skirt: [902, 1000] });
// Blocking floor: below this a band is not "slightly short", the garment is largely ABSENT there.
// Set below the accepted Ridderdragt's 87.95 % shoulder figure on purpose — this gate is here to
// catch a missing garment part, not to retroactively fail an owner-accepted asset whose shortfall
// was measured and disclosed (D-087/D-088).
export const MIN_BAND_COVERAGE = 0.60;
// Measured on the accepted asset BEFORE backfill (D-095). Reported alongside every candidate so a
// reviewer can see at a glance whether a new candidate is better or worse than what shipped.
export const REFERENCE_BAND_COVERAGE = Object.freeze({
  asset: "armor-knight-r2-v1 (accepted, D-088) before backfill",
  collar: 1.0, shoulder: 0.87952, torso: 0.94106, skirt: 1.0,
  note: "the shoulder figure is the armour's sleeves stopping at y≈680 while the base tee reaches y≈714",
});

export function checkCandidate(candidateBuf, masks, label = "candidate", meta = null) {
  const gates = []; const add = (id, pass, detail) => gates.push({ id, pass: !!pass, detail });
  const img = decodePng(candidateBuf, label);
  const { hard, edit, protect } = masks;

  add("canvas-is-master-1024x1536", img.w === OUT_W && img.h === OUT_H, { width: img.w, height: img.h, expected: `${OUT_W}x${OUT_H}` });
  if (img.w !== OUT_W || img.h !== OUT_H) {
    return { gates, verdict: "REJECT", reason: "wrong canvas size — nothing else can be judged against the masks" };
  }

  const w = img.w, h = img.h;
  const alpha = new Uint8Array(w * h), ink = new Uint8Array(w * h), opaque = new Uint8Array(w * h);
  let inkPx = 0, opaquePx = 0;
  for (let i = 0; i < w * h; i++) {
    const a = img.rgba[i * 4 + 3];
    alpha[i] = a;
    if (a >= VISIBLE) { ink[i] = 1; inkPx++; }
    if (a >= OPAQUE) { opaque[i] = 1; opaquePx++; }
  }
  add("candidate-has-ink", inkPx > 1000, { inkPx, opaquePx });

  // 1. Nothing outside the edit zone. This is the anatomy guarantee: the A1 protect mask is the
  //    complement of edit, so a stray pixel here is a pixel on skin, hair, hands or legs.
  let stray = 0, strayOnProtect = 0; const straySample = [];
  for (let i = 0; i < w * h; i++) {
    if (!ink[i] || edit[i]) continue;
    stray++;
    if (protect[i]) strayOnProtect++;
    if (straySample.length < 12) straySample.push({ x: i % w, y: (i / w) | 0, alpha: alpha[i] });
  }
  add("no-ink-outside-edit-zone", stray <= MAX_STRAY_PX, { strayPx: stray, onProtectMask: strayOnProtect, sample: straySample });

  // 2. The mandatory region must be FULLY opaque — this is D-037's "fully occlude the base tee".
  let hardTotal = 0, hardCovered = 0, hardSoft = 0; const gapSample = [];
  for (let i = 0; i < w * h; i++) {
    if (!hard[i]) continue;
    hardTotal++;
    if (alpha[i] >= OPAQUE) hardCovered++;
    else {
      if (alpha[i] > 0) hardSoft++;
      if (gapSample.length < 12) gapSample.push({ x: i % w, y: (i / w) | 0, alpha: alpha[i] });
    }
  }
  const hardGaps = hardTotal - hardCovered;
  add("hard-region-fully-opaque", hardGaps <= MAX_HARD_GAP_PX,
    { hardTotal, hardCovered, gapPx: hardGaps, ofWhichSemiTransparent: hardSoft, coverage: hardTotal ? +(hardCovered / hardTotal).toFixed(5) : 0, sample: gapSample });

  // 2b. PER-BAND coverage (D-095). The aggregate number above cannot tell WHERE a candidate falls
  //     short, and that blindness had a concrete cost: the accepted Ridderdragt covers the collar,
  //     torso and skirt fully but only 87.95 % of the SHOULDER band, because its sleeves stop at
  //     y≈680 while the base tee's reach y≈714. The art brief asked for shoulder caps across
  //     560–714; the generation did not deliver them; backfill filled the gap with the nearest
  //     garment colour, and nobody traced why that band needed 5,990 px until D-095 measured it.
  //
  //     It also catches the opposite failure: a mesh-warp experiment raised the shoulder band to
  //     95.6 % while DROPPING the skirt to 46.1 % — an aggregate improvement achieved by robbing
  //     other bands, invisible in a single coverage figure.
  const bandCoverage = {};
  for (const [name, [y0, y1]] of Object.entries(BANDS)) {
    let tot = 0, cov = 0;
    for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!masks.hard[i]) continue;
        tot++;
        if (alpha[i] >= OPAQUE) cov++;
      }
    }
    if (tot === 0) continue;
    bandCoverage[name] = { hardPx: tot, coveredPx: cov, missingPx: tot - cov, coverage: +(cov / tot).toFixed(5) };
  }
  const lowBands = Object.entries(bandCoverage).filter(([, b]) => b.coverage < MIN_BAND_COVERAGE).map(([n, b]) => `${n} ${(b.coverage * 100).toFixed(1)}%`);
  // Advisory: the full picture, always reported so a shortfall can never be silent again.
  gates.push({ id: "band-coverage-disclosure", pass: true, advisory: true, detail: {
    bands: bandCoverage, reference: REFERENCE_BAND_COVERAGE,
    note: "coverage BEFORE any backfill. Compare against the reference: a band far below it means the artwork is missing there, not merely mis-scaled.",
  } });
  // Blocking only where the garment is largely ABSENT from a band. Deliberately set below the
  // accepted asset's 87.95 % shoulder figure: this gate exists to catch a missing garment part,
  // not to retroactively fail an asset the owner accepted with that shortfall disclosed.
  add("no-band-largely-uncovered", lowBands.length === 0, { minCoverage: MIN_BAND_COVERAGE, lowBands, bands: bandCoverage });

  // 3. Alpha cleanliness. A halo is a semi-transparent pixel with no opaque pixel next to it — the
  //    D-058/D-061 failure mode, measured rather than eyeballed.
  let orphanSoft = 0; const haloSample = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (alpha[i] === 0 || alpha[i] >= OPAQUE) continue;
    let nearOpaque = false;
    for (const [dx, dy] of NEIGH8) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      if (opaque[yy * w + xx]) { nearOpaque = true; break; }
    }
    if (!nearOpaque) { orphanSoft++; if (haloSample.length < 12) haloSample.push({ x, y, alpha: alpha[i] }); }
  }
  add("alpha-clean-no-halo", orphanSoft <= MAX_ORPHAN_SOFT_PX, { orphanSoftPx: orphanSoft, tolerance: MAX_ORPHAN_SOFT_PX, sample: haloSample });

  // 4. No floating islands.
  const comps = components(opaque, w, h);
  add("no-floating-islands", comps.filter((c) => c < MIN_COMPONENT).length <= MAX_SPECKS,
    { components: comps.length, sizes: comps.slice(0, 8), minComponent: MIN_COMPONENT });

  // 5. Legibility at the four render sizes: the garment must still read as a garment, not dissolve.
  const scale = [];
  const hardAlpha = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) hardAlpha[i] = hard[i] ? 255 : 0;
  for (const [sw, sh] of RENDER_SIZES) {
    const cand = boxDownscaleAlpha(alpha, w, h, sw, sh);
    const ref = boxDownscaleAlpha(hardAlpha, w, h, sw, sh);
    let refMass = 0, candMass = 0;
    for (let i = 0; i < sw * sh; i++) { if (ref[i] > 8) { refMass += ref[i]; candMass += Math.min(cand[i], 255); } }
    const cover = refMass ? candMass / refMass : 0;
    scale.push({ size: `${sw}x${sh}`, coverage: +cover.toFixed(4) });
  }
  add("legible-at-render-sizes", scale.every((s) => s.coverage >= MIN_SCALE_COVERAGE), { min: MIN_SCALE_COVERAGE, scales: scale });

  // 6. Budget advisory — the real budget applies to the served WebP, which is encoded in a later step.
  const est = Math.round(candidateBuf.length * (SERVED.w * SERVED.h) / (w * h));
  gates.push({ id: "budget-advisory", pass: true, advisory: true,
    detail: { candidatePngBytes: candidateBuf.length, servedAreaEstimateBytes: est, note: "advisory only: the ≤50 KB budget is enforced on the encoded 512×768 WebP, not on this PNG" } });

  // Backfill disclosure. Without a sidecar the provenance is simply unknown — say so rather than
  // implying the whole image was drawn.
  if (meta && meta.backfill) {
    const b = meta.backfill;
    gates.push({ id: "backfill-disclosure", pass: true, advisory: true, detail: {
      backfilledPx: b.px, shareOfHardMask: b.shareOfHardMask, shareOfVisibleArtwork: b.shareOfVisibleArtwork,
      largestContiguousRegionPx: b.largestContiguousRegionPx, touchesOuterContourPx: b.touchesOuterContourPx,
      byBand: b.byBand, overscan: meta.overscan, alphaFloor: meta.alphaFloor, specksDropped: meta.specksDropped,
      sourceRawSha256: meta.sourceRawSha256, candidateSha256: meta.candidateSha256 } });
    add("backfill-not-dominant", (b.shareOfVisibleArtwork ?? 0) <= MAX_BACKFILL_SHARE,
      { shareOfVisibleArtwork: b.shareOfVisibleArtwork, limit: MAX_BACKFILL_SHARE,
        note: "above this the item is mostly adapter-constructed rather than drawn" });
  } else {
    gates.push({ id: "backfill-disclosure", pass: true, advisory: true, detail: {
      backfilledPx: null, note: "no adapter sidecar next to this candidate — provenance unknown, assume nothing" } });
  }

  const blocking = gates.filter((g) => !g.pass && !g.advisory);
  return {
    gates, verdict: blocking.length === 0 ? "PASS_AUTOMATED" : "REJECT",
    blocking: blocking.map((g) => g.id),
    note: "PASS_AUTOMATED is a precondition, not an approval: human style/safety review and owner visual sign-off still apply.",
  };
}

// ── synthetic self-test: proves the harness accepts a correct candidate and rejects real faults ──
function encodeRGBA(w, h, rgba) {
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length, 0); const t = Buffer.from(type, "ascii"); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0); return Buffer.concat([l, t, data, cc]); };
  const stride = w * 4, raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride); }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ih), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
export function synthesize(masks, kind) {
  const w = OUT_W, h = OUT_H;
  const rgba = Buffer.alloc(w * h * 4);
  const put = (i, a) => { rgba[i * 4] = 90; rgba[i * 4 + 1] = 95; rgba[i * 4 + 2] = 110; rgba[i * 4 + 3] = a; };
  if (kind === "pass") {
    for (let i = 0; i < w * h; i++) if (masks.hard[i]) put(i, 255);
  } else if (kind === "stray") {                       // ink on protected anatomy
    for (let i = 0; i < w * h; i++) if (masks.hard[i]) put(i, 255);
    for (let y = 300; y < 340; y++) for (let x = 480; x < 540; x++) put(y * w + x, 255);
  } else if (kind === "hole") {                        // the base tee would show through
    for (let i = 0; i < w * h; i++) if (masks.hard[i]) put(i, 255);
    for (let y = 700; y < 760; y++) for (let x = 450; x < 520; x++) if (masks.hard[y * w + x]) put(y * w + x, 120);
  } else if (kind === "halo") {
    // Detached semi-transparent fringe placed INSIDE the edit zone (the hem band, which is editable
    // but not mandatory) and spaced so no speck touches an opaque pixel — otherwise the stray-ink and
    // occlusion gates would fire first and this gate would never be exercised.
    for (let i = 0; i < w * h; i++) if (masks.hard[i]) put(i, 255);
    let placed = 0;
    for (let y = 920; y < 990 && placed <= MAX_ORPHAN_SOFT_PX + 40; y += 6) {
      for (let x = 380; x < 630 && placed <= MAX_ORPHAN_SOFT_PX + 40; x += 6) {
        const i = y * w + x;
        if (masks.edit[i] && !masks.hard[i]) { put(i, 40); placed++; }
      }
    }
  } else if (kind === "wrong-size") {
    return encodeRGBA(64, 64, Buffer.alloc(64 * 64 * 4));
  }
  return encodeRGBA(w, h, rgba);
}

// ── CLI ─────────────────────────────────────────────────────────────────────
function report(res, label) {
  console.log(`${TOOL} v${TOOL_VERSION} — ${label}`);
  for (const g of res.gates) {
    const mark = g.advisory ? "·" : g.pass ? "✓" : "✖";
    console.log(`  ${mark} ${g.id}`);
    if (!g.pass && !g.advisory) console.log(`      ${JSON.stringify(g.detail)}`);
  }
  console.log(`  VERDICT: ${res.verdict}${res.blocking && res.blocking.length ? " — blocking: " + res.blocking.join(", ") : ""}`);
}
function main(argv) {
  const masks = loadMasks();
  if (argv.includes("--selftest")) {
    const cases = [["pass", "PASS_AUTOMATED"], ["stray", "REJECT"], ["hole", "REJECT"], ["halo", "REJECT"], ["wrong-size", "REJECT"]];
    let bad = 0;
    for (const [kind, expected] of cases) {
      const res = checkCandidate(synthesize(masks, kind), masks, `selftest:${kind}`);
      const ok = res.verdict === expected;
      if (!ok) bad++;
      console.log(`  ${ok ? "✓" : "✖"} selftest ${kind.padEnd(11)} expected ${expected.padEnd(16)} got ${res.verdict}${res.blocking?.length ? " (" + res.blocking.join(",") + ")" : ""}`);
    }
    if (bad) { console.error("SELFTEST FAILED"); process.exitCode = 2; return; }
    console.log("SELFTEST OK — the harness accepts a correct candidate and rejects stray ink, holes, halo and a wrong canvas.");
    return;
  }
  const file = argv.find((a) => !a.startsWith("--"));
  if (!file) { console.error("usage: node tools/avatar/check-r2-torso-candidate.mjs <candidate.png> | --selftest"); process.exitCode = 1; return; }
  if (!existsSync(file)) { console.error("candidate not found: " + file); process.exitCode = 1; return; }
  const buf = readFileSync(file);
  const sidecar = file.replace(/\.png$/i, ".backfill.json");
  let meta = null;
  if (existsSync(sidecar)) { try { meta = JSON.parse(readFileSync(sidecar, "utf8")); } catch { meta = null; } }
  const res = checkCandidate(buf, masks, rel(file), meta);
  report(res, rel(file));
  mkdirSync(OUT_DIR, { recursive: true });
  const out = join(OUT_DIR, "candidate-report.json");
  writeFileSync(out, JSON.stringify({ tool: TOOL, toolVersion: TOOL_VERSION, candidate: rel(file), candidateSha256: sha256(buf), maskSpec: masks.spec.masks, ...res }, null, 2) + "\n");
  console.log("  report → " + rel(out));
  if (res.verdict !== "PASS_AUTOMATED") process.exitCode = 3;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  try { main(process.argv.slice(2)); }
  catch (err) { console.error("✖ " + (err && err.message ? err.message : String(err))); process.exitCode = 1; }
}
