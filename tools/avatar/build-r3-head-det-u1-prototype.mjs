// R3 head — DETERMINISTIC U1 + S2 PROTOTYPE. LOCAL, NOT PROMOTED, NOT A CANDIDATE, NOT A MODEL OUTPUT.
// NO NETWORK, NO MODEL, NO CLAIM, NO CALL-ID. R3 stays default OFF; the R3 contract and the register are not touched.
//
// The head colour is U1 (the D-148 head geometry E2 filled with Northstar's skin median rgb(254,197,128), pinned) sent
// through the UNCHANGED production processor (process-r3-head-colour-output.mjs): S2 blends rows 417–424 toward H1's
// neck skin, K4 is laid over, TRANSITION and PROTECT₂ are H1's bytes. The ears stay flat — no inner-ear shape is added
// (owner's style choice for this round). Every input is verified against its pin before anything is computed.
//
//   node tools/avatar/build-r3-head-det-u1-prototype.mjs --h1 <path>          write the local prototype + review
//   node tools/avatar/build-r3-head-det-u1-prototype.mjs --h1 <path> --check  recompute and compare byte for byte; writes nothing
// H1 is external (D-127 §2): --h1 or FITTING_BASE_V1_PATH. Output goes ONLY to the gitignored
// tools/avatar/build/r3-head-det-u1/; an existing output is never overwritten with different bytes.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, encodePngRGBA } from "./build-r2-torso-occlusion-mask.mjs";
import { loadInputs, finalModelRgbRegion, SEAM, D148 } from "./build-r3-head-colour-fixtures.mjs";
import { pngToContour, HEAD_MAX_Y } from "./build-r3-head-geometry.mjs";
import { processOutput } from "./process-r3-head-colour-output.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, "..", "..");
export const STATUS = "LOCAL PROTOTYPE — NOT PROMOTED — NOT A CANDIDATE — NOT A MODEL OUTPUT";
export const OUT_DIR = join(REPO, "tools", "avatar", "build", "r3-head-det-u1");
export const PINS = Object.freeze({
  h1: "72875565ecd62b542a91156dbcca1399a434fe04634f4e737df71337be0d5af4",
  u1: Object.freeze({ path: "tools/avatar/fixtures/r3-head-colour/r3-head-underpainting-u1-v1.png", sha256: "e67e2cccb25d914dfd016fd1ed3d9d36fa883bfc75457426b59f8d1204ba217d" }),
  k4: Object.freeze({ path: "tools/avatar/fixtures/r3-head-geometry/r3-head-contour-k4-v1.png", sha256: "8e8efe590cf2ffd5fc30a7bf52a56c5cffb62d117b274fa6abbd6d3cc5d7766b" }),
});
export const VIEW = Object.freeze({ background: Object.freeze([232, 232, 232]), sizes: Object.freeze([[180, 270], [360, 540]]), jawNeckCrop: Object.freeze([380, 300, 644, 470]), cropZoom: 3 });
const W = 1024, H = 1536, N = W * H;
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const yOf = (p) => (p / W) | 0;

function pinnedFile(root, { path, sha256: want }, label) {
  const b = readFileSync(join(root, ...path.split("/")));
  if (sha256(b) !== want) throw new Error(label + " does not match its pinned SHA-256");
  return b;
}
/** Loads and verifies every repository input. H1 is passed in (external, or a synthetic stand-in in CI). */
export function loadContext(root = REPO) {
  const inp = loadInputs(root);                                                   // pins E2, EDIT₂, PROTECT₂, TRANSITION, Northstar
  const u1 = decodePng(pinnedFile(root, PINS.u1, "U1"), "U1").rgba;
  const contour = pngToContour(pinnedFile(root, PINS.k4, "K4"));
  if (PINS.k4.sha256 !== D148.contour.sha256) throw new Error("K4 pin disagrees with D-148");
  return { inp, u1, contour, head: finalModelRgbRegion(inp.geom), regions: { EDIT: inp.edit, PROTECT: inp.protect, TRANSITION: inp.transition } };
}
export function decodeH1(buf) {
  if (sha256(buf) !== PINS.h1) throw new Error("H1 does not match its pinned SHA-256");
  const img = decodePng(buf, "H1"); if (img.w !== W || img.h !== H) throw new Error("H1 is not 1024x1536");
  return img.rgba;
}

/** The prototype: U1 on the head, H1's neck target on TRANSITION, through the unchanged processor (S2 + K4). */
export function composePrototype(c, h1Rgba) {
  const src = Buffer.alloc(N * 4);
  for (let p = 0; p < N; p++) { if (c.head[p]) src.set(c.u1.subarray(p * 4, p * 4 + 4), p * 4); else if (c.inp.transition[p]) src.set([...SEAM.S2.neckTargetExpected, 255], p * 4); }
  return processOutput({ srcRgba: src, h1Rgba, geom: c.inp.geom, contour: c.contour, regions: c.regions, nsRgba: c.inp.ns });
}

/** Read-only checks on a final: alpha = E2, rows >= 425 = H1, PROTECT₂ = H1, TRANSITION = H1, flat ears. */
export function verify(c, h1Rgba, out) {
  const r = { alphaNotE2: 0, rowsFrom425NotH1: 0, protect2NotH1: 0, transitionNotH1: 0, earPxNotFlat: 0, earPxChecked: 0 };
  const skin = [c.u1[(330 * W + 512) * 4], c.u1[(330 * W + 512) * 4 + 1], c.u1[(330 * W + 512) * 4 + 2]];
  for (let p = 0; p < N; p++) {
    const i = p * 4, y = yOf(p), x = p % W;
    const same = out[i] === h1Rgba[i] && out[i + 1] === h1Rgba[i + 1] && out[i + 2] === h1Rgba[i + 2] && out[i + 3] === h1Rgba[i + 3];
    if (y <= HEAD_MAX_Y && (out[i + 3] === 255) !== (c.head[p] === 1)) r.alphaNotE2++;
    if (y > HEAD_MAX_Y && !same) r.rowsFrom425NotH1++;
    if (c.regions.PROTECT[p] && !same) r.protect2NotH1++;
    if (c.inp.transition[p] && !same) r.transitionNotH1++;
    // ears (x < 366 or x > 657, the existing region split): every non-K4 head pixel is plain U1 skin — no inner-ear shape
    if (c.head[p] && (x < 366 || x > 657) && y < SEAM.S2.top && !c.contour[p]) { r.earPxChecked++; if (out[i] !== skin[0] || out[i + 1] !== skin[1] || out[i + 2] !== skin[2]) r.earPxNotFlat++; }
  }
  r.ok = r.alphaNotE2 === 0 && r.rowsFrom425NotH1 === 0 && r.protect2NotH1 === 0 && r.transitionNotH1 === 0 && r.earPxNotFlat === 0 && r.earPxChecked > 0;
  return r;
}

// ── review images (all from the same final, same background, same crop, sRGB 8-bit) ─────────
export function downscale(rgba, tw, th, bg = VIEW.background) {
  const o = Buffer.alloc(tw * th * 4), sx = W / tw, sy = H / th;
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
    const xa = tx * sx, xb = xa + sx, ya = ty * sy, yb = ya + sy; let r = 0, g = 0, b = 0, a = 0, ws = 0;
    for (let y = Math.floor(ya); y < Math.ceil(yb); y++) { const wy = Math.min(yb, y + 1) - Math.max(ya, y); if (wy <= 0) continue;
      for (let x = Math.floor(xa); x < Math.ceil(xb); x++) { const wx = Math.min(xb, x + 1) - Math.max(xa, x); if (wx <= 0) continue;
        const w = wx * wy, i = (y * W + x) * 4, al = rgba[i + 3] / 255; r += rgba[i] * al * w; g += rgba[i + 1] * al * w; b += rgba[i + 2] * al * w; a += al * w; ws += w; } }
    const A = a / ws, m = (v, k) => Math.round((A > 0 ? v / a : 0) * A + bg[k] * (1 - A));
    o.set([m(r, 0), m(g, 1), m(b, 2), 255], (ty * tw + tx) * 4);
  }
  return encodePngRGBA(tw, th, o);
}
export function crop(rgba, [x0, y0, x1, y1], z, bg = VIEW.background) {
  const w = (x1 - x0 + 1) * z, h = (y1 - y0 + 1) * z, o = Buffer.alloc(w * h * 4);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * W + x) * 4, a = rgba[i + 3] / 255, c = [0, 1, 2].map((k) => Math.round(rgba[i + k] * a + bg[k] * (1 - a)));
    for (let dy = 0; dy < z; dy++) for (let dx = 0; dx < z; dx++) o.set([...c, 255], (((y - y0) * z + dy) * w + (x - x0) * z + dx) * 4);
  }
  return encodePngRGBA(w, h, o);
}

/** Every artefact as bytes, in a fixed order — the same inputs always give the same bytes. */
export function buildArtefacts(c, h1Rgba, h1Sha) {
  const res = composePrototype(c, h1Rgba), checks = verify(c, h1Rgba, res.rgba);
  if (!checks.ok) throw new Error("prototype checks failed: " + JSON.stringify(checks));
  const files = new Map();
  files.set("r3-head-det-u1.prototype.png", encodePngRGBA(W, H, res.rgba));
  for (const [w, h] of VIEW.sizes) files.set(`r3-head-det-u1.${w}x${h}.png`, downscale(res.rgba, w, h));
  files.set("r3-head-det-u1.jaw-neck-x3.png", crop(res.rgba, VIEW.jawNeckCrop, VIEW.cropZoom));
  const manifest = { status: STATUS, promoted: false, r3DefaultEnabled: false, callsActuallySentSoFar: 5, method: "U1 + S2 through the unchanged production processor; flat ears, no inner-ear shape",
    inputs: { h1: h1Sha, u1: PINS.u1.sha256, k4: PINS.k4.sha256, e2: D148.geometry.sha256, edit2: D148.edit.sha256, protect2: D148.protect.sha256, transition: D148.transition.sha256 },
    processorGates: "pass", checks, view: VIEW, outputs: Object.fromEntries([...files].map(([k, b]) => [k, sha256(b)])) };
  files.set("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2) + "\n"));
  files.set("index.html", Buffer.from(reviewHtml(manifest)));
  return { files, manifest };
}
function reviewHtml(m) {
  const o = m.outputs, c = m.checks;
  return `<!doctype html><html lang="da"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>R3-hoved U1 + S2</title>
<style>body{font:14px/1.45 system-ui,sans-serif;background:#e8e8e8;color:#222;margin:16px}img{image-rendering:pixelated;display:block;max-width:100%;border:1px solid #aaa}figure{display:inline-block;vertical-align:top;margin:8px 16px 8px 0}figcaption{font-size:12px;color:#555}.flag{display:inline-block;background:#b06a00;color:#fff;padding:3px 8px;border-radius:3px;font-weight:600}.note{background:#fff;border:1px solid #ccc;padding:8px 12px;max-width:1000px}code{font-size:12px}</style>
<p class="flag">LOKAL PROTOTYPE — IKKE PROMOVERET — IKKE KANDIDAT ELLER MODELOUTPUT</p>
<h1>R3-hoved: deterministisk U1 + S2</h1>
<div class="note"><p>Hovedet er U1 (E2-geometrien fyldt med Northstars hudmedian rgb(254,197,128)) sendt gennem den uændrede produktionsprocessor: S2 blander rækkerne 417–424 mod H1's halshud rgb(253,197,128), K4-konturen lægges ovenpå, og TRANSITION og PROTECT₂ er H1's bytes. Ørerne er flade uden inderøreform (valgt stil i denne omgang). Neutral baggrund rgb(232,232,232), arealmiddel-nedskalering, sRGB 8-bit. R3 er OFF; intet kald.</p>
<p>Kontrol: alpha ≠ E2 ${c.alphaNotE2} px · H1 fra række 425 ændret ${c.rowsFrom425NotH1} · PROTECT₂ ændret ${c.protect2NotH1} · TRANSITION ændret ${c.transitionNotH1} · ørepixels med andet end flad U1-hud ${c.earPxNotFlat} af ${c.earPxChecked}.</p>
<p>Prototype (1024×1536) SHA-256 <code>${o["r3-head-det-u1.prototype.png"]}</code></p></div>
<figure><img src="r3-head-det-u1.180x270.png" alt="180×270"><figcaption>180×270</figcaption></figure>
<figure><img src="r3-head-det-u1.360x540.png" alt="360×540"><figcaption>360×540</figcaption></figure>
<figure><img src="r3-head-det-u1.jaw-neck-x3.png" alt="kæbe og hals"><figcaption>kæbe/hals ×3 (x 380–644, y 300–470)</figcaption></figure>
</html>
`;
}

function guardOut(p) {
  const rel = relative(join(REPO, "tools", "avatar", "build"), p);
  if (rel.startsWith("..") || rel.includes(":") || !(rel.startsWith("r3-head-det-u1" + sep) || rel.startsWith("r3-head-det-u1/"))) throw new Error("refusing to write outside tools/avatar/build/r3-head-det-u1");
  return p;
}
export function run({ h1Path, check }) {
  const h1Buf = readFileSync(h1Path), h1 = decodeH1(h1Buf);
  const { files, manifest } = buildArtefacts(loadContext(), h1, sha256(h1Buf));
  const result = { status: STATUS, mode: check ? "check" : "write", outputs: manifest.outputs, checks: manifest.checks, same: [], different: [], missing: [], written: [] };
  for (const [name, bytes] of files) {
    const p = guardOut(join(OUT_DIR, name));
    if (!existsSync(p)) { if (check) result.missing.push(name); else { mkdirSync(OUT_DIR, { recursive: true }); writeFileSync(p, bytes); result.written.push(name); } continue; }
    if (readFileSync(p).equals(bytes)) result.same.push(name); else result.different.push(name);
  }
  if (result.different.length) throw new Error((check ? "NOT REPRODUCED: " : "refusing to overwrite different bytes: ") + result.different.join(", "));
  if (check && result.missing.length) throw new Error("nothing to compare: " + result.missing.join(", "));
  return result;
}

const invokedDirectly = typeof process.argv[1] === "string" && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const argv = process.argv.slice(2), known = new Set(["--h1", "--check"]);
  const bad = argv.filter((a, i) => !(known.has(a) || argv[i - 1] === "--h1"));
  if (bad.length || (argv.includes("--h1") && !argv[argv.indexOf("--h1") + 1])) { console.error("REFUSED (" + bad.join(" ") + ") — the only arguments are --h1 <path> and --check"); process.exitCode = 1; }
  else {
    try {
      const h1Path = argv.includes("--h1") ? argv[argv.indexOf("--h1") + 1] : process.env.FITTING_BASE_V1_PATH;
      if (!h1Path) throw new Error("--h1 <path> (or FITTING_BASE_V1_PATH) is required");
      console.log(JSON.stringify(run({ h1Path, check: argv.includes("--check") }), null, 2));
    } catch (e) { console.error("✖ " + (e && e.message ? e.message : e)); process.exitCode = 1; }
  }
}
