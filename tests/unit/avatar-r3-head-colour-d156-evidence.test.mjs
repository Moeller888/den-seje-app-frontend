// D-156 follow-up — offline evidence review of D-153's background and of D-155's halo reading.
// No network, no claim, no key, no call-id, no request package; no gate or limit is changed.
//
// The PNG, checkerboard and band-decomposition logic and the synthetic background cases run in CI. The tests on D-153's
// real raw output need that local, gitignored file and the pinned H1; without them they are skipped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, encodePngRGBA } from "../../tools/avatar/build-r2-torso-occlusion-mask.mjs";
import { LEAK_RULE } from "../../tools/avatar/r3-head-colour-opaque-output.mjs";
import * as E from "../../tools/avatar/evidence-r3-head-colour-d156.mjs";
import { loadOverscanContext } from "../../tools/avatar/analyse-r3-head-colour-d156.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const W = 1024, H = 1536, N = W * H;
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const repoFile = (rel) => join(REPO, ...rel.split("/"));
const C = JSON.parse(readFileSync(repoFile("tools/avatar/fixtures/r3/r3-shadow-contract-v1.json"), "utf8"));
const TOOL = "tools/avatar/evidence-r3-head-colour-d156.mjs";
const strip = (s) => s.split("\n").filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");
const H1_PATH = process.env.FITTING_BASE_V1_PATH;
const H1_OK = typeof H1_PATH === "string" && (() => { try { return sha256(readFileSync(H1_PATH)) === "72875565ecd62b542a91156dbcca1399a434fe04634f4e737df71337be0d5af4"; } catch (_) { return false; } })();
const RAW_PATH = process.env.R3_D153_RAW_PATH || repoFile("tools/avatar/build/r3-head-colour-d153/r3-head-colour-d153.raw.png");
const RAW_OK = existsSync(RAW_PATH) && sha256(readFileSync(RAW_PATH)) === "c397168d63cd3405055d18153dc004615154cbd079b2736d4171a06377df1e78";
const NEED_REAL = { skip: !(H1_OK && RAW_OK) && "the pinned H1 and the local D-153 raw output are needed (the raw output is never committed)" };

let ctxMemo = null, realMemo = null;
const ctx = () => (ctxMemo ??= loadOverscanContext({ root: REPO }));
const real = () => (realMemo ??= E.review(ctx(), { rawBuf: readFileSync(RAW_PATH), h1Rgba: decodePng(readFileSync(H1_PATH), "H1").rgba }));

/** A minimal 8-bit RGB PNG (colour type 2, no tRNS) of the full canvas. */
function rgbPng(fill) {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) raw.set(fill(x, y), y * (1 + W * 3) + 1 + x * 3);
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t, "latin1"), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// ── boundaries ───────────────────────────────────────────────────────────────────────────────

test("the evidence tool has no network, no key, no claim, no child process and no writes; it changes no gate", () => {
  const code = strip(readFileSync(repoFile(TOOL), "utf8"));
  for (const bad of [/\bfetch\s*\(/, /node:https?\b|node:net\b|node:tls\b|node:dgram\b|node:child_process|undici|axios|XMLHttpRequest|WebSocket/, /https?:\/\//,
    /OPENAI|process\.env/, /one-shot-claims|claim\w*\s*\(/, /\bexec(File)?(Sync)?\s*\(|\bspawn(Sync)?\s*\(/, /writeFile|appendFile|mkdirSync|renameSync|unlinkSync|copyFile|encodePng/,
    /LEAK_RULE\s*\.\s*\w+\s*=|COVERAGE_RULE\s*\.\s*\w+\s*=|export function (coverageGate|backgroundLeakGate|estimateBackground)/])
    assert.ok(!bad.test(code), TOOL + " must not match " + bad);
  assert.deepEqual([E.DECISION, E.CALL_ID, E.CLAIM_IDENTITY], ["D-156", "UNASSIGNED", "NONE"]);
  assert.equal(E.STATUS, "D-156 FOLLOW-UP — OFFLINE EVIDENCE REVIEW ONLY — NO IMAGE REQUEST AUTHORISED");
  assert.deepEqual([...E.BAND_CATEGORIES], ["pattern-tone", "pattern-boundary", "skin-mix", "outline-mix", "tone-misplaced", "ambiguous", "unexplained"]);
  assert.equal(LEAK_RULE.jndDE00, 2.3);
  assert.equal(C.imageCallBudget.callsActuallySentSoFar.underlay, 5);
  assert.deepEqual(C.authorisedCalls.calls.filter((e) => e.mandateState === "UNSPENT"), []);
  assert.equal(C.architecture.defaultEnabled, false);
});

// ── format: true transparency vs an opaque painted pattern (CI) ──────────────────────────────

test("pngFacts tells an opaque RGB PNG from an RGBA PNG with real transparency", () => {
  const rgb = E.pngFacts(rgbPng((x, y) => ((((x >> 4) + (y >> 4)) & 1) ? [250, 250, 250] : [228, 228, 228])));
  assert.deepEqual([rgb.colourType, rgb.hasAlphaChannel, rgb.hasTRNS, rgb.opaquePx, rgb.minAlpha], [2, false, false, N, 255]);
  const rgba = Buffer.alloc(N * 4); for (let p = 0; p < N; p++) rgba.set([200, 150, 100, p % 2 ? 255 : 0], p * 4);
  const f = E.pngFacts(encodePngRGBA(W, H, rgba));
  assert.deepEqual([f.colourType, f.hasAlphaChannel, f.minAlpha, f.opaquePx], [6, true, 0, N / 2]);
  assert.throws(() => E.pngFacts(Buffer.from("not a png")), /not a PNG/);
});

// ── the checkerboard fit (CI) ────────────────────────────────────────────────────────────────

function mask(rows = [0, 119]) { const m = new Uint8Array(N); for (let y = rows[0]; y <= rows[1]; y++) for (let x = 0; x < W; x++) m[y * W + x] = 1; return m; }
test("a 16-px checkerboard with an offset is found exactly; its cell size and phase are recovered", () => {
  const src = Buffer.alloc(N * 4);
  for (let p = 0; p < N; p++) { const x = p % W, y = (p / W) | 0, dark = (((x + 5) >> 4) + ((y + 3) >> 4)) & 1; src.set(dark ? [228, 228, 228, 255] : [250, 250, 250, 255], p * 4); }
  const f = E.fitChecker(src, mask());
  assert.equal(f.cell, 16); assert.deepEqual(f.offset, [5, 3]); assert.equal(f.agreement, 1); assert.equal(f.innerAgreement, 1);
  assert.deepEqual(f.tones.dark, [228, 228, 228]); assert.deepEqual(f.tones.light, [250, 250, 250]);
});

test("two brightness groups alone do not make a checkerboard: random two-tone noise gives ~50 % agreement", () => {
  const src = Buffer.alloc(N * 4); let s = 12345;
  for (let p = 0; p < N; p++) { s = (s * 1103515245 + 12345) >>> 0; src.set((s >>> 16) & 1 ? [228, 228, 228, 255] : [250, 250, 250, 255], p * 4); }
  const f = E.fitChecker(src, mask());
  assert.ok(f.agreement < 0.52, "agreement " + f.agreement);
  assert.ok(Math.abs(f.darkShare - 0.5) < 0.01);
});

// ── band decomposition (CI) ──────────────────────────────────────────────────────────────────

test("band decomposition: checker cells painted in E2 are pattern-tone, a skin↔background ramp at the model edge is skin-mix", () => {
  const c = ctx(), tones = { dark: [228, 228, 228], light: [250, 250, 250] };
  const src = Buffer.alloc(N * 4), skin = [254, 197, 128];
  for (let p = 0; p < N; p++) {
    const x = p % W, y = (p / W) | 0, dark = ((x >> 4) + (y >> 4)) & 1 ? false : true, bg = dark ? tones.dark : tones.light;
    let col = bg;
    if (c.head[p]) { const d = c.sdf.sd[p]; col = d > 10 ? skin : d > 8 ? skin.map((v, k) => Math.round(v * 0.1 + bg[k] * 0.9)) : bg; }
    src.set([...col, 255], p * 4);
  }
  const fit = E.fitChecker(src, mask());
  const r = E.decomposeBand(src, { head: c.head, background: [245, 245, 245], tones, checker: fit, outline: [82, 42, 13] });
  const sum = Object.values(r.categories).reduce((a, b) => a + b, 0);
  assert.equal(sum, r.total);
  assert.ok(r.categories["pattern-tone"] > 0 && r.patternToneBy.dark === r.categories["pattern-tone"], "dark cells inside E2 are the band's pattern-tone pixels");
  assert.ok(r.categories["skin-mix"] > 0, "the 10 % skin ramp next to the painted head is skin-mix");
  for (let p = 0; p < N; p++) if (r.label[p] === 3) assert.ok(c.sdf.sd[p] > 8 && c.sdf.sd[p] <= 10, "skin-mix only on the ramp");
  assert.equal(r.categories["tone-misplaced"], 0);
  for (const k of ["outline-mix", "unexplained"]) assert.equal(r.categories[k], 0, k);
});

// ── gate sensitivity to background sampling (CI) ─────────────────────────────────────────────

test("synthetic two-tone backgrounds: the D-155 gate is right in every case; the old gate misses leaks of the non-median tone", () => {
  const rows = E.runSyntheticBackgroundCases(ctx()), by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(rows.length, 9);
  for (const r of rows) { assert.equal(r.d155.verdict, r.expect, r.id + " (D-155)"); assert.equal(r.twoToneDiagnostic.verdict, r.expect, r.id + " (two-tone diagnostic)"); }
  const oldMisses = rows.filter((r) => r.old.verdict !== r.expect).map((r) => r.id);
  assert.deepEqual(oldMisses, ["checker50-leak-dark-cells", "checker62-dark-leak-light-cells", "checker38-dark-leak-dark-cells"]);
  assert.deepEqual(by["checker50-clean"].median, [250, 250, 249]);
  assert.deepEqual(by["checker62-dark-leak-light-cells"].median, [228, 228, 228]);
  assert.equal(by["checker50-soft-edges-clean"].d155.uncovered, 0);
});

// ── the real D-153 raw output (local only) ───────────────────────────────────────────────────

test("real raw: an 8-bit RGB PNG without alpha or tRNS — every pixel opaque; the 'transparency' is painted", NEED_REAL, () => {
  const f = real().format;
  assert.deepEqual([f.width, f.height, f.bitDepth, f.colourType, f.hasAlphaChannel, f.hasTRNS, f.opaquePx, f.minAlpha], [1024, 1536, 8, 2, false, false, N, 255]);
});

test("real raw: the probe is a 16-px checkerboard at offset 0 with 100 % agreement; it holds across the whole canvas", NEED_REAL, () => {
  const b = real().background;
  assert.deepEqual([b.checkerProbe.cell, b.checkerProbe.offset, b.checkerProbe.agreement, b.checkerProbe.innerAgreement, b.checkerProbe.px], [16, [0, 0], 1, 1, 103507]);
  assert.deepEqual([b.checkerProbe.tones.dark, b.checkerProbe.tones.light], [[228.8, 228.5, 228.5], [250.3, 250.2, 250.1]]);
  assert.deepEqual(b.checkerWholeCanvas, { neutralBackgroundPx: 1190507, agreement: 0.9992, innerPx: 911456, innerAgreement: 0.99923, shareOfH1TransparentBackground: 0.9873 });
  assert.deepEqual(b.median, [245, 245, 245]);
});

test("real raw: D-155's 5,520 band pixels are overwhelmingly the checkerboard's dark tone, not an anti-alias halo", NEED_REAL, () => {
  const band = real().band;
  assert.equal(band.total, 5520);
  assert.deepEqual(band.categories, { "pattern-tone": 5268, "pattern-boundary": 14, "skin-mix": 60, "outline-mix": 16, "tone-misplaced": 0, ambiguous: 152, unexplained: 10 });
  assert.deepEqual(band.patternToneBy, { dark: 5249, light: 19 });
  assert.equal(band.neutralGreyPx, 5261);
});

test("real raw: D-155's uncovered total barely depends on the background estimate (diagnostic comparison only)", NEED_REAL, () => {
  const s = real().sensitivity.map((x) => [x.background, x.core, x.band2_3to5, x.d155Uncovered]);
  assert.deepEqual(s, [[[245, 245, 245], 5752, 5520, 11429], [[250, 250, 250], 5567, 4626, 11412], [[229, 229, 229], 5442, 4837, 11512]]);
  assert.equal(real().twoToneDiagnosticUncovered, 11087);
});

test("real raw: the review is deterministic and leaves the raw file unchanged", NEED_REAL, () => {
  const strip = ({ _maps, ...r }) => r;
  const a = JSON.stringify(strip(real())), b = JSON.stringify(strip(E.review(ctx(), { rawBuf: readFileSync(RAW_PATH), h1Rgba: decodePng(readFileSync(H1_PATH), "H1").rgba })));
  assert.equal(sha256(a), sha256(b));
  assert.equal(sha256(readFileSync(RAW_PATH)), "c397168d63cd3405055d18153dc004615154cbd079b2736d4171a06377df1e78");
});

// ── documentation ────────────────────────────────────────────────────────────────────────────

test("the D-156 row records the follow-up: format, pattern, the qualified halo reading and the scope of B; D-153–D-155 stay verbatim", () => {
  const REG = readFileSync(repoFile("docs/project-state.md"), "utf8").split("\n");
  const one = (k) => { const r = REG.filter((l) => l.startsWith("| **" + k + "** |")); assert.equal(r.length, 1, k); return r[0]; };
  assert.equal(sha256(one("D-153")), "e5cbcb036520e951f2380ea99c1a090a612ccca01aa037e43dbcf38f642d53e9");
  assert.ok(one("D-155").includes("C — NO NEW IMAGE CALL SHOULD BE AUTHORISED YET"));
  const row = one("D-156");
  for (const needle of ["**(9) Opfølgning", "farvetype 2", "uden `tRNS`", "16-px-skakbræt", "99,92 %", "D-155's halo-tolkning korrigeres (kvalificeres) i D-156", "5.268 (95,43 %)",
    "sikkert 76 px (60 + 16; 1,38 %)", "højst 228 px (76 + 152; 4,13 %)", "ikke et generelt robusthedsbevis",
    "konklusion C står uændret", "11.429 udækkede pixels med medianen", "ikke et bevis for, at ethvert overscan/bleed-design er umuligt", "ikke D-155's kategori B",
    "konservativ, tilstrækkelig designantagelse", "Hals-/kæbeovergangen er det centrale åbne designspørgsmål", "B — OVERSCAN DESIGN NOT GEOMETRICALLY FEASIBLE"])
    assert.ok(row.includes(needle), "the D-156 row must carry " + JSON.stringify(needle));
  assert.ok(!/[ÃÂ]\S|\uFFFD/.test(row));
});
