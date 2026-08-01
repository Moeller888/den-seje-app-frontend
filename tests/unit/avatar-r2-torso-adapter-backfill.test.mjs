// ── A2 adapter: alpha floor, speck cleanup, overscan and BACKFILL (D-087 revision) ──────────
// Candidate 1 was rejected on halo, islands and coverage. These are the fixes, tested without the
// network and without an API key: every case runs on a synthetic "generated" image.
//
// The backfill tests carry the weight here. Backfill CONSTRUCTS pixels the image model never drew, so
// the tests assert not only that it works but that it stays inside the mandatory region, never
// overwrites real artwork, never samples the black outline, and is fully disclosed in numbers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  fitAndClip, describeBackfill, ALPHA_FLOOR, MIN_COMPONENT, DEFAULT_OVERSCAN, BACKFILL_BANDS,
} from "../../tools/avatar/openai-generate-torso-item.mjs";
import { decodePng, encodePngRGBA, OUT_W, OUT_H } from "../../tools/avatar/build-r2-torso-occlusion-mask.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const FIX = join(REPO, "tools", "avatar", "fixtures", "r2-torso");
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

function maskOf(name) {
  const img = decodePng(readFileSync(join(FIX, name)), name);
  const m = new Uint8Array(img.w * img.h);
  for (let i = 0; i < m.length; i++) m[i] = img.rgba[i * 4 + 3] > 0 ? 1 : 0;
  return m;
}
const hard = maskOf("torso-occlusion-hard-v1.png");
const edit = maskOf("torso-edit-allowed-v1.png");

// A synthetic generation: a steel-grey block, a faint glow around it (the failure mode candidate 1
// hit), one detached speck, and a hole in the middle of the block.
function synthetic({ glow = true, speck = true, hole = true } = {}) {
  const w = 1024, h = 1536, rgba = Buffer.alloc(w * h * 4);
  const put = (x, y, r, g, b, a) => { const i = (y * w + x) * 4; rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = a; };
  for (let y = 300; y <= 1200; y++) for (let x = 150; x <= 880; x++) put(x, y, 160, 165, 175, 255);
  for (let y = 300; y <= 340; y++) for (let x = 150; x <= 880; x++) put(x, y, 20, 20, 24, 255);   // outline band
  if (hole) for (let y = 700; y <= 780; y++) for (let x = 460; x <= 560; x++) put(x, y, 0, 0, 0, 0);
  if (glow) for (let y = 260; y < 300; y++) for (let x = 150; x <= 880; x++) put(x, y, 90, 90, 100, 12);
  if (speck) for (let y = 100; y <= 103; y++) for (let x = 100; x <= 103; x++) put(x, y, 160, 165, 175, 255);
  return encodePngRGBA(w, h, rgba);
}
const alphaAt = (img, i) => img.rgba[i * 4 + 3];

test("constants are explicit and reviewable", () => {
  assert.equal(ALPHA_FLOOR, 24);
  assert.equal(MIN_COMPONENT, 64);
  assert.equal(DEFAULT_OVERSCAN, 1.0);
  assert.deepEqual(BACKFILL_BANDS.shoulder, [560, 714]);
});

test("alpha below the floor is removed — this is what closed the halo gate", () => {
  const res = fitAndClip(synthetic({ glow: true }), hard, edit, { backfill: false });
  const img = decodePng(res.png, "out");
  let faint = 0;
  for (let i = 0; i < OUT_W * OUT_H; i++) { const a = alphaAt(img, i); if (a > 0 && a < ALPHA_FLOOR) faint++; }
  assert.equal(faint, 0, "no pixel survives below the alpha floor");
  assert.equal(res.alphaFloor, ALPHA_FLOOR);
});

test("opaque specks under MIN_COMPONENT are dropped", () => {
  const res = fitAndClip(synthetic({ speck: true }), hard, edit, { backfill: false });
  const img = decodePng(res.png, "out");
  const on = new Uint8Array(OUT_W * OUT_H);
  for (let i = 0; i < on.length; i++) on[i] = alphaAt(img, i) >= 250 ? 1 : 0;
  const seen = new Uint8Array(on.length); const sizes = [];
  const N = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let s = 0; s < on.length; s++) {
    if (!on[s] || seen[s]) continue;
    const q = [s]; seen[s] = 1;
    for (let k = 0; k < q.length; k++) {
      const j = q[k], y = (j / OUT_W) | 0, x = j % OUT_W;
      for (const [dx, dy] of N) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= OUT_W || yy >= OUT_H) continue;
        const t = yy * OUT_W + xx;
        if (on[t] && !seen[t]) { seen[t] = 1; q.push(t); }
      }
    }
    sizes.push(q.length);
  }
  assert.ok(sizes.every((s) => s >= MIN_COMPONENT), "sizes " + JSON.stringify(sizes.slice(0, 6)));
});

test("backfill fills the mandatory region completely", () => {
  const res = fitAndClip(synthetic({ hole: true }), hard, edit);
  const img = decodePng(res.png, "out");
  let bare = 0;
  for (let i = 0; i < OUT_W * OUT_H; i++) if (hard[i] && alphaAt(img, i) < 250) bare++;
  assert.equal(bare, 0, "D-037: the mandatory region must end up fully opaque");
  assert.ok(res.backfilledPx > 0, "the synthetic hole forced a real backfill");
});

test("backfill writes ONLY inside the mandatory region", () => {
  const withBf = decodePng(fitAndClip(synthetic(), hard, edit).png, "with");
  const without = decodePng(fitAndClip(synthetic(), hard, edit, { backfill: false }).png, "without");
  let outsideHardChanged = 0;
  for (let i = 0; i < OUT_W * OUT_H; i++) {
    if (hard[i]) continue;
    for (let c = 0; c < 4; c++) if (withBf.rgba[i * 4 + c] !== without.rgba[i * 4 + c]) { outsideHardChanged++; break; }
  }
  assert.equal(outsideHardChanged, 0);
});

test("backfill never overwrites artwork the model actually drew", () => {
  const withBf = decodePng(fitAndClip(synthetic(), hard, edit).png, "with");
  const without = decodePng(fitAndClip(synthetic(), hard, edit, { backfill: false }).png, "without");
  let overwritten = 0;
  for (let i = 0; i < OUT_W * OUT_H; i++) {
    if (alphaAt(without, i) < 250) continue;                       // was not artwork
    for (let c = 0; c < 4; c++) if (withBf.rgba[i * 4 + c] !== without.rgba[i * 4 + c]) { overwritten++; break; }
  }
  assert.equal(overwritten, 0, "existing opaque pixels must be byte-identical");
});

test("the black outline stroke is never used as a fill colour", () => {
  // The first backfill sampled any opaque pixel and dragged dark wedges into the mask corners.
  const res = fitAndClip(synthetic(), hard, edit);
  const withBf = decodePng(res.png, "with");
  const without = decodePng(fitAndClip(synthetic(), hard, edit, { backfill: false }).png, "without");
  let dark = 0;
  for (let i = 0; i < OUT_W * OUT_H; i++) {
    if (alphaAt(without, i) >= 250 || alphaAt(withBf, i) < 250) continue;   // only newly filled pixels
    const luma = 0.299 * withBf.rgba[i * 4] + 0.587 * withBf.rgba[i * 4 + 1] + 0.114 * withBf.rgba[i * 4 + 2];
    if (luma < 100) dark++;
  }
  assert.equal(dark, 0, "no filled pixel may carry outline luma");
});

test("nothing lands outside the edit zone, with or without backfill", () => {
  for (const backfill of [true, false]) {
    const img = decodePng(fitAndClip(synthetic(), hard, edit, { backfill }).png, "out");
    let stray = 0;
    for (let i = 0; i < OUT_W * OUT_H; i++) if (alphaAt(img, i) > 0 && !edit[i]) stray++;
    assert.equal(stray, 0, `backfill=${backfill}`);
  }
});

test("backfill can be switched off for review and debugging", () => {
  const off = fitAndClip(synthetic(), hard, edit, { backfill: false });
  assert.equal(off.backfilledPx, 0);
  assert.equal(off.backfill.px, 0);
  const on = fitAndClip(synthetic(), hard, edit);
  assert.ok(on.backfilledPx > 0);
  assert.notEqual(sha256(on.png), sha256(off.png));
});

test("the same input produces byte-identical output", () => {
  const raw = synthetic();
  assert.equal(sha256(fitAndClip(raw, hard, edit).png), sha256(fitAndClip(raw, hard, edit).png));
  assert.equal(sha256(fitAndClip(raw, hard, edit, { overscan: 1.2 }).png), sha256(fitAndClip(raw, hard, edit, { overscan: 1.2 }).png));
});

test("overscan changes the fit and is reported", () => {
  const a = fitAndClip(synthetic(), hard, edit, { overscan: 1.0 });
  const b = fitAndClip(synthetic(), hard, edit, { overscan: 1.25 });
  assert.ok(b.scale > a.scale, `${b.scale} > ${a.scale}`);
});

test("the disclosure describes what the adapter constructed, not just how much", () => {
  const res = fitAndClip(synthetic(), hard, edit);
  const d = res.backfill;
  assert.equal(d.px, res.backfilledPx);
  assert.ok(d.shareOfHardMask > 0 && d.shareOfHardMask <= 1);
  assert.ok(d.shareOfVisibleArtwork > 0 && d.shareOfVisibleArtwork <= 1);
  assert.ok(d.largestContiguousRegionPx > 0 && d.largestContiguousRegionPx <= d.px);
  assert.ok(typeof d.touchesOuterContourPx === "number");
  for (const band of ["collar", "shoulder", "torso", "skirt"]) assert.ok(band in d.byBand, band);
  const sum = Object.values(d.byBand).reduce((a, b) => a + b, 0);
  assert.equal(sum, d.px, "every filled pixel is attributed to a band");
  assert.match(d.note, /ADAPTER constructed/);
});

test("describeBackfill counts nothing when nothing was filled", () => {
  const empty = new Uint8Array(OUT_W * OUT_H);
  const rgba = Buffer.alloc(OUT_W * OUT_H * 4);
  const d = describeBackfill(empty, hard, rgba, OUT_W, OUT_H);
  assert.equal(d.px, 0);
  assert.equal(d.largestContiguousRegionPx, 0);
  assert.equal(d.shareOfHardMask, 0);
});

test("--overscan is range-checked and --fit-only performs no network call", () => {
  const src = readFileSync(join(REPO, "tools", "avatar", "openai-generate-torso-item.mjs"), "utf8");
  assert.match(src, /overscan > 0 && overscan <= 1\.6/, "the range is enforced, not assumed");
  // --fit-only reads a file; generation happens only on the other branch
  assert.match(src, /raw = readFileSync\(p\)/, "fit-only path takes the raw image from disk");
  assert.match(src, /raw = await generate\(\)/, "generation only on the other branch");
  assert.ok(!/fetch\(/.test(src.split("async function generate()")[0]), "no network call before generate()");
});

test("the real candidate sidecar records every parameter a reviewer needs", (t) => {
  const meta = join(REPO, "tools", "avatar", "build", "ai-input", "torso-armor-knight-candidate.backfill.json");
  if (!existsSync(meta)) return t.skip("no local candidate build present (gitignored artifact)");
  const m = JSON.parse(readFileSync(meta, "utf8"));
  for (const k of ["overscan", "alphaFloor", "specksDropped", "backfilledPx", "sourceRawSha256", "candidateSha256"]) {
    assert.ok(k in m, "missing " + k);
  }
  assert.match(m.sourceRawSha256, /^[0-9a-f]{64}$/);
  assert.match(m.candidateSha256, /^[0-9a-f]{64}$/);
});
