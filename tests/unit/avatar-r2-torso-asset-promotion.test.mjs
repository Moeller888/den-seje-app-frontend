// ── A3.1 (D-089): promotion of the owner-accepted torso candidate to a tracked R2 asset ──────
// The weight here is on two things a promotion step can get catastrophically wrong: shipping
// pixels the owner never accepted, and quietly activating the slot. Most tests therefore run on
// the TRACKED asset and the runtime source, not on a rebuild — what is in git is what ships.
//
// The decode-based tests use the vendored libwebp binaries (gitignored). They FAIL LOUDLY when
// those are absent rather than skipping, per the D-085 revision-2 decision: a silently skipped
// asset gate is indistinguishable from a passing one. `npm run test:unit` is a LOCAL gate (CI
// does not run it — see D-085 §5.2 and the D-089 record).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  ACCEPTED_SOURCE_SHA, CWEBP_ARGS, ENCODER_NAME, ENCODER_VERSION, SIZE_BUDGET_BYTES,
  SRC_W, SRC_H, OUT_W, OUT_H, MIN_COMPONENT_SERVED, MAX_ORPHAN_SOFT_PX_SERVED,
  assertWritable, downscaleHalf, downscaleMask, verifyServed, run, DEFAULT_SOURCE,
  FORBIDDEN_SOURCE_SHA_PREFIXES,
} from "../../tools/avatar/promote-r2-torso-asset.mjs";
import { decodePng, encodePngRGBA } from "../../tools/avatar/build-r2-torso-occlusion-mask.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const ASSET = join(REPO, "assets", "avatar-r2", "torso", "armor-knight-r2-v1.webp");
const PROV = join(REPO, "tools", "avatar", "provenance", "armor-knight-r2-v1.provenance.json");
const LAYERS = join(REPO, "js", "avatar-layers.js");
const TOOL_SRC = join(REPO, "tools", "avatar", "promote-r2-torso-asset.mjs");
const DWEBP = join(REPO, "tools", "avatar", "vendor", "dwebp.exe");
const TMP = join(REPO, "tools", "avatar", "build", "r2-torso-promotion", "test-tmp");

const sha256 = (b) => createHash("sha256").update(b).digest("hex");

function requireDecoder() {
  if (!existsSync(DWEBP)) {
    throw new Error("vendored dwebp missing — run `node tools/avatar/fetch-dwebp.mjs`. " +
      "This gate is NOT skipped: an unverified asset must not read as a pass.");
  }
}
function decodeAsset() {
  requireDecoder();
  mkdirSync(TMP, { recursive: true });
  const out = join(TMP, "asset-decoded.png");
  const r = spawnSync(DWEBP, [ASSET, "-o", out], { encoding: "utf8" });
  assert.equal(r.status, 0, "dwebp failed: " + (r.stderr || ""));
  return decodePng(readFileSync(out), "asset");
}
const prov = () => JSON.parse(readFileSync(PROV, "utf8"));
const masks512 = () => {
  const FIX = join(REPO, "tools", "avatar", "fixtures", "r2-torso");
  const load = (f) => {
    const img = decodePng(readFileSync(join(FIX, f)), f);
    const m = new Uint8Array(img.w * img.h);
    for (let i = 0; i < m.length; i++) m[i] = img.rgba[i * 4 + 3] > 0 ? 1 : 0;
    return m;
  };
  const hard = downscaleMask(SRC_W, SRC_H, load("torso-occlusion-hard-v1.png"), "intersect");
  const edit = downscaleMask(SRC_W, SRC_H, load("torso-edit-allowed-v1.png"), "union");
  const protect = new Uint8Array(OUT_W * OUT_H);
  for (let i = 0; i < protect.length; i++) protect[i] = edit[i] ? 0 : 1;
  return { hard, edit, protect };
};

// ── what was promoted is what the owner accepted ─────────────────────────────────────────────

test("the pinned source SHA is the one the owner accepted in D-088", () => {
  assert.equal(ACCEPTED_SOURCE_SHA,
    "31f4b2b60737d5801cb115d3bdcac632881b8223ad7107be3a9b0655ebc7cfe0");
  assert.equal(prov().source.sha256, ACCEPTED_SOURCE_SHA);
  assert.equal(prov().acceptance.decision, "D-088");
});

test("the rejected candidate 1 can never be promoted", () => {
  assert.ok(Object.keys(FORBIDDEN_SOURCE_SHA_PREFIXES).includes("dc332329"));
  // and it is a prefix list, not a fabricated full hash
  for (const k of Object.keys(FORBIDDEN_SOURCE_SHA_PREFIXES)) assert.ok(k.length < 64, k);
});

test("a source with the wrong SHA stops the promotion", () => {
  mkdirSync(TMP, { recursive: true });
  const wrong = join(TMP, "not-the-candidate.png");
  writeFileSync(wrong, encodePngRGBA(SRC_W, SRC_H, Buffer.alloc(SRC_W * SRC_H * 4)));
  assert.notEqual(sha256(readFileSync(wrong)), ACCEPTED_SOURCE_SHA);
  assert.throws(() => run({ promote: true, source: wrong }), /source SHA .* != the owner-accepted/);
});

test("the tracked asset is byte-for-byte the encode recorded in the provenance", () => {
  assert.ok(existsSync(ASSET), "tracked asset missing");
  const buf = readFileSync(ASSET);
  assert.equal(sha256(buf), prov().output.sha256);
  assert.equal(buf.length, prov().output.bytes);
});

// ── the file really is a lossless 512×768 WebP with alpha ────────────────────────────────────

test("the asset is a WebP container", () => {
  const buf = readFileSync(ASSET);
  assert.equal(buf.toString("ascii", 0, 4), "RIFF");
  assert.equal(buf.toString("ascii", 8, 12), "WEBP");
});

test("the asset decodes to exactly 512x768 with alpha", () => {
  const img = decodeAsset();
  assert.equal(img.w, OUT_W);
  assert.equal(img.h, OUT_H);
  let transparent = 0, opaque = 0;
  for (let i = 0; i < img.w * img.h; i++) {
    const a = img.rgba[i * 4 + 3];
    if (a === 0) transparent++; else if (a >= 250) opaque++;
  }
  assert.ok(transparent > 0, "a full-canvas layer must have transparent pixels");
  assert.ok(opaque > 0, "the garment must have opaque pixels");
});

test("the encode is lossless and exact: decoding the asset reproduces the reference RGBA exactly", () => {
  const src = decodePng(readFileSync(DEFAULT_SOURCE), "source");
  assert.equal(sha256(readFileSync(DEFAULT_SOURCE)), ACCEPTED_SOURCE_SHA);
  const reference = downscaleHalf(SRC_W, SRC_H, src.rgba);
  const decoded = decodeAsset();
  assert.equal(decoded.rgba.length, reference.length);
  let diff = 0;
  for (let i = 0; i < reference.length; i++) if (reference[i] !== decoded.rgba[i]) diff++;
  assert.equal(diff, 0, "a lossy or non-exact encode would differ here");
});

test("encoding the same reference twice gives the same bytes", () => {
  const r = run({ promote: false });
  const det = r.gates.find((g) => g.id === "decoded-matches-reference-exactly");
  assert.ok(det.pass);
  // run() hard-fails on a non-deterministic encoder, so reaching here IS the assertion;
  // the recorded output SHA must also still match what is committed.
  assert.equal(r.provenance.output.sha256, sha256(readFileSync(ASSET)));
});

test("the encoder settings are the lossless/exact runtime-asset flags, not the lossy overlay path", () => {
  assert.deepEqual([...CWEBP_ARGS], ["-lossless", "-exact", "-z", "9", "-metadata", "none"]);
  assert.equal(prov().encoder.lossless, true);
  assert.equal(prov().encoder.exactAlpha, true);
  assert.equal(ENCODER_NAME, "libwebp cwebp");
  assert.ok(prov().encoder.version.startsWith(ENCODER_VERSION));
});

test("the asset is inside the D-084 size budget", () => {
  assert.ok(readFileSync(ASSET).length <= SIZE_BUDGET_BYTES,
    `asset ${readFileSync(ASSET).length} B exceeds ${SIZE_BUDGET_BYTES} B — lossy is NOT the remedy`);
});

// ── mask gates measured on the decoded asset, not on the source ──────────────────────────────

test("no ink outside the served edit zone, and none on the protect mask", () => {
  const img = decodeAsset(), m = masks512();
  let stray = 0, onProtect = 0;
  for (let i = 0; i < OUT_W * OUT_H; i++) {
    if (img.rgba[i * 4 + 3] < 1) continue;
    if (!m.edit[i]) stray++;
    if (m.protect[i]) onProtect++;
  }
  assert.equal(stray, 0);
  assert.equal(onProtect, 0);
});

test("the served mandatory region is fully opaque", () => {
  const img = decodeAsset(), m = masks512();
  let total = 0, gap = 0;
  for (let i = 0; i < OUT_W * OUT_H; i++) {
    if (!m.hard[i]) continue;
    total++;
    if (img.rgba[i * 4 + 3] < 250) gap++;
  }
  assert.ok(total > 0);
  assert.equal(gap, 0, "a hole in the mandatory region shows the base tee through the armour");
});

test("verifyServed reports every gate it claims to, and they all pass on the shipped asset", () => {
  const img = decodeAsset();
  const src = decodePng(readFileSync(DEFAULT_SOURCE), "source");
  const res = verifyServed(img, downscaleHalf(SRC_W, SRC_H, src.rgba), masks512());
  const ids = res.gates.map((g) => g.id);
  for (const id of ["served-dimensions", "alpha-preserved", "no-ink-outside-edit-zone",
    "no-ink-on-protect-mask", "hard-region-fully-opaque", "alpha-clean-no-halo",
    "no-floating-islands", "decoded-matches-reference-exactly", "legible-at-render-sizes"]) {
    assert.ok(ids.includes(id), "missing gate " + id);
  }
  assert.ok(res.pass, JSON.stringify(res.gates.filter((g) => !g.pass)));
});

// ── the downscale is the established one, checked against hand arithmetic ────────────────────

test("downscaleHalf is a premultiplied 2x2 box average", () => {
  // 2×2 source: three transparent pixels and one opaque red → the opaque colour must survive
  // undiluted (premultiplied), and alpha must be the plain mean 255/4 = 64 (rounded).
  const rgba = Buffer.alloc(2 * 2 * 4);
  rgba[0] = 255; rgba[1] = 0; rgba[2] = 0; rgba[3] = 255;
  const out = downscaleHalf(2, 2, rgba);
  assert.deepEqual([...out], [255, 0, 0, 64]);
});

test("downscaleHalf leaves fully transparent blocks fully transparent", () => {
  const out = downscaleHalf(2, 2, Buffer.alloc(16));
  assert.deepEqual([...out], [0, 0, 0, 0]);
});

test("the two masks downscale by OPPOSITE rules, on purpose", () => {
  const m = new Uint8Array([1, 0, 0, 0]);            // one of four source pixels set
  assert.equal(downscaleMask(2, 2, m, "union")[0], 1, "edit is permissive");
  assert.equal(downscaleMask(2, 2, m, "intersect")[0], 0, "hard is conservative");
  const all = new Uint8Array([1, 1, 1, 1]);
  assert.equal(downscaleMask(2, 2, all, "intersect")[0], 1);
});

test("the served thresholds are the authoring thresholds divided by the area factor", () => {
  assert.equal(MIN_COMPONENT_SERVED, 64 / 4);
  assert.equal(MAX_ORPHAN_SOFT_PX_SERVED, 64 / 4);
});

// ── A3.1 must not wire anything ──────────────────────────────────────────────────────────────

test("torso is still absent from R2_SUPPORTED_COSMETIC_SLOTS", () => {
  const js = readFileSync(LAYERS, "utf8");
  const m = js.match(/R2_SUPPORTED_COSMETIC_SLOTS\s*=\s*\[([^\]]*)\]/);
  assert.ok(m, "slot list not found");
  assert.ok(!/["']torso["']/.test(m[1]), "A3.1 must not enable the slot — that is A3.2");
});

test("AVATAR_R2 is still false and the D-083 fallback is still present", () => {
  const js = readFileSync(LAYERS, "utf8");
  assert.match(js, /export const AVATAR_R2 = false;/);
  assert.match(js, /r2RequiresC2Fallback/);
  assert.match(js, /r2UnrenderableCosmeticSlots/);
});

test("no runtime file references the promoted torso asset", () => {
  const files = ["avatar-layers.js", "avatar-render-c2.js", "avatar-r2-observability.js"];
  for (const f of files) {
    const p = join(REPO, "js", f);
    if (!existsSync(p)) continue;
    const s = readFileSync(p, "utf8");
    assert.ok(!s.includes("armor-knight-r2"), `${f} references the promoted asset — that is A3.2 wiring`);
    assert.ok(!/avatar-r2\/torso/.test(s), `${f} references the torso asset directory`);
  }
});

test("the manifest was deliberately NOT edited by this step", () => {
  assert.equal(prov().runtime.manifestRegistered, false);
  const js = readFileSync(LAYERS, "utf8");
  const manifest = js.match(/R2_MANIFEST\s*=\s*\{[\s\S]*?\n\};/);
  assert.ok(manifest, "manifest not found");
  assert.ok(!/torso/.test(manifest[0]), "R2_MANIFEST must not carry a torso entry after A3.1");
});

// ── the tool itself is contained ─────────────────────────────────────────────────────────────

test("the promotion tool makes no network call", () => {
  const s = readFileSync(TOOL_SRC, "utf8");
  assert.ok(!/\bfetch\s*\(/.test(s), "no fetch(");
  assert.ok(!/https?:\/\//.test(s.replace(/^\s*\/\/.*$/gm, "")), "no URL outside comments");
  assert.ok(!/node:https?\b/.test(s));
  assert.ok(!/openai|api[_-]?key/i.test(s), "no API surface in an asset-promotion tool");
});

test("the tool refuses to write outside the asset, provenance and build directories", () => {
  const outside = [
    join(REPO, "js", "avatar-layers.js"),
    join(REPO, "package.json"),
    join(REPO, "..", "escape.png"),
    join(REPO, ".claude", "settings.local.json"),
  ];
  for (const p of outside) assert.throws(() => assertWritable(p), /refusing to write/, p);
  // and it permits exactly the three it needs
  assert.doesNotThrow(() => assertWritable(ASSET));
  assert.doesNotThrow(() => assertWritable(PROV));
  assert.doesNotThrow(() => assertWritable(join(REPO, "tools", "avatar", "build", "r2-torso-promotion", "x.png")));
});

test("the provenance records everything a later step needs to re-verify the chain", () => {
  const p = prov();
  for (const k of ["tool", "decision", "acceptance", "source", "downscale", "encoder", "decoder", "output", "gates", "runtime"]) {
    assert.ok(k in p, "missing " + k);
  }
  assert.equal(p.decision, "D-089");
  assert.equal(p.source.width, SRC_W);
  assert.equal(p.source.height, SRC_H);
  assert.equal(p.output.width, OUT_W);
  assert.equal(p.output.height, OUT_H);
  assert.equal(p.downscale.method, "premultiplied 2x2 box average");
  assert.equal(p.source.overscan, 1.05);
  assert.equal(p.source.fitScale, 0.438);
  assert.equal(p.source.backfilledPx, 8608);
  assert.equal(p.source.backfillShareOfVisibleArtwork, 0.0855);
  assert.match(p.source.rawGenerationSha256, /^[0-9a-f]{64}$/);
  assert.match(p.encoder.command, /-lossless -exact -z 9 -metadata none/);
  assert.ok(p.gates.every((g) => g.pass), "a failing gate must never be recorded as promoted");
});
