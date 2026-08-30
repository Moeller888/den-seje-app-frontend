// build-r2-hair-short-review — the owner's visual review page for a hair candidate (D-115).
// ---------------------------------------------------------------------------------------------
// DETERMINISTIC · NON-AI · NO NETWORK · PROMOTES NOTHING · GITIGNORED OUTPUT.
//
// It mounts the FINISHED, DECODED runtime asset on the real R2 neutral stack, at the four D-071
// render sizes, and prints every measurement the gates took. It writes ONE self-contained HTML
// file into tools/avatar/build/r2-hair-short-review/ and nothing else. It does not copy the
// candidate into assets/, does not touch R2_MANIFEST, hairSrcForR2 or AVATAR_R2, and registers
// nothing. Owner visual sign-off at real render scale (D-059/D-105) is the ONLY thing that can
// start promotion, and this page exists to make that judgement possible — not to pre-empt it.
//
// WHY IT MOUNTS THE DECODED WEBP AND NOT THE AUTHORING PNG
// The D-059 lesson, applied: the full-res composite flatters a matte, and a defect that only
// exists at render scale on the real surface is invisible anywhere else. The layer stack, the z
// order, the multiply tint and the hair-colour token below are read from the runtime's own
// modules, so what the owner judges is what a student would see.
//
//   node tools/avatar/build-r2-hair-short-review.mjs [candidate.png] [style]
// ---------------------------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, sep } from "node:path";
import { decodePng, encodePngRGBA } from "./build-r2-torso-occlusion-mask.mjs";
import {
  analyse, authoringPreconditions, runtimeGates, countComponents,
  ALPHA_INK, HALO_TOLERANCE_SERVED,
} from "./check-r2-hair-candidate.mjs";
import { buildRuntimeAsset } from "./build-r2-hair-runtime-asset.mjs";
import { RENDER_SIZES } from "./check-r2-torso-candidate.mjs";
import { HAIR_COLOR_TOKENS, DEFAULT_HAIR_COLOR, R2_STACK_Z, R2_IRIS_DEFAULT } from "../../js/avatar-layers.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(join(HERE, "..", ".."));
const OUT_DIR = join(HERE, "build", "r2-hair-short-review");

export const TOOL = "build-r2-hair-short-review";
export const TOOL_VERSION = "1.0.0";

const DEFAULT_CANDIDATE = join(HERE, "build", "r2-hair-gen", "short", "short.luminance.png");
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

/** Output allowlist — the same shape as every other tool here. */
function assertWritable(target) {
  const abs = resolve(target);
  const root = resolve(OUT_DIR);
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error(`REFUSED: ${TOOL} may only write inside tools/avatar/build/r2-hair-short-review/`);
  }
  return abs;
}

const dataUri = (buf, mime) => `data:${mime};base64,${buf.toString("base64")}`;
const asset = (...p) => readFileSync(join(REPO, "assets", "avatar-r2", ...p));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A tight crop around the hairline, scaled up, so the matte edge can actually be inspected. */
function cropScaled(rgba, w, h, box, factor) {
  const cw = box.x1 - box.x0, ch = box.y1 - box.y0;
  const dw = cw * factor, dh = ch * factor;
  const out = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const sx = box.x0 + Math.floor(x / factor);
      const sy = box.y0 + Math.floor(y / factor);
      const si = (sy * w + sx) * 4, di = (y * dw + x) * 4;
      out[di] = rgba[si]; out[di + 1] = rgba[si + 1];
      out[di + 2] = rgba[si + 2]; out[di + 3] = rgba[si + 3];
    }
  }
  return { rgba: out, w: dw, h: dh };
}

export function run(candidatePath = DEFAULT_CANDIDATE, style = "short") {
  const srcBuf = readFileSync(resolve(candidatePath));
  const png = decodePng(srcBuf, "candidate");

  const authoring = analyse(png.rgba, png.w, png.h);
  const pre = authoringPreconditions(authoring);
  const built = buildRuntimeAsset(png.rgba, png.w, png.h, { label: `${style}-review` });
  const gates = runtimeGates(built.decodedRgba, built.w, built.h, style);

  const a = analyse(built.decodedRgba, built.w, built.h);
  const comps = countComponents(built.decodedRgba, built.w, built.h);
  const named = [...pre, ...gates];
  const passed = named.filter((g) => g.pass).length;
  const allPass = named.every((g) => g.pass) && built.byteIdentical;

  // The layers the runtime resolves for the neutral stack, in its own z order.
  const token = HAIR_COLOR_TOKENS[DEFAULT_HAIR_COLOR];
  const layers = [
    { name: "base", z: R2_STACK_Z.base, uri: dataUri(asset("base", "body-neutral-medium-v2.webp"), "image/webp") },
    { name: "blush", z: R2_STACK_Z.blush, blend: "multiply", uri: dataUri(asset("face", "face-blush-multiply-v1.webp"), "image/webp") },
    { name: "face", z: R2_STACK_Z.face, uri: dataUri(asset("face", "face-neutral-v1.webp"), "image/webp") },
    { name: "iris", z: R2_STACK_Z.eyes, tint: R2_IRIS_DEFAULT, uri: dataUri(asset("eyes", "eyes-neutral-iris-v1.webp"), "image/webp") },
    { name: "eyes", z: R2_STACK_Z.eyes, uri: dataUri(asset("eyes", "eyes-neutral-fixed-v1.webp"), "image/webp") },
    { name: "hair", z: R2_STACK_Z.hair, tint: token.base, uri: dataUri(built.webp, "image/webp") },
  ];

  const layerHtml = layers.map((l) => l.tint
    ? `<div class="tl" style="z-index:${l.z};background:${l.tint};-webkit-mask-image:url('${l.uri}');mask-image:url('${l.uri}');">` +
      `<img alt="" src="${l.uri}"></div>`
    : `<img class="pl" alt="" style="z-index:${l.z};${l.blend ? `mix-blend-mode:${l.blend};` : ""}" src="${l.uri}">`
  ).join("");

  const stackAt = (w, h, label) =>
    `<figure class="fig"><div class="stack" style="width:${w}px;height:${h}px">${layerHtml}</div>` +
    `<figcaption class="cap"><b>${w}×${h}</b>${esc(label)}</figcaption></figure>`;

  // Hairline close-up: the forehead band, in served pixels, at 4x nearest-neighbour.
  const k = 160 / built.w;                       // served px -> C2 units
  const band = {
    x0: Math.max(0, Math.floor(45 / k)), x1: Math.min(built.w, Math.ceil(116 / k)),
    y0: Math.max(0, Math.floor(8 / k)), y1: Math.min(built.h, Math.ceil(34 / k)),
  };
  const crop = cropScaled(built.decodedRgba, built.w, built.h, band, 4);
  const cropUri = dataUri(encodePngRGBA(crop.w, crop.h, crop.rgba), "image/png");

  const row = (g) => `<tr class="${g.pass ? "ok" : "no"}"><td>${g.pass ? "✓" : "✖"}</td><td><code>${esc(g.id)}</code></td>` +
    `<td><code class="d">${esc(JSON.stringify(g.detail))}</code></td></tr>`;

  const styleTitle = style.charAt(0).toUpperCase() + style.slice(1);
  const sizeRole = ["avatar page", "hub", "quiz", "smallest"];

  // The chrome is deliberately COOL neutral. This page exists to judge warm brown artwork and a
  // matte edge; a warm ground would tint that judgement, which is the whole reason the close-up
  // sits on mid-grey. Cool greys + one instrument teal keep the artwork the only warm thing here.
  const html = `<title>${esc(styleTitle)} Hair Candidate</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Serif:wght@500;600&display=swap">
<style>
  :root{
    --bg:#e9edf0;--card:#fff;--fg:#151a1e;--mut:#5b656d;--line:#ccd4da;
    --accent:#116b80;--ok:#15683f;--no:#a5241a;--okbg:#e2f0e8;--nobg:#f6e3e1;
    --serif:"IBM Plex Serif",Georgia,"Times New Roman",serif;
    --sans:"IBM Plex Sans",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
    --mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  }
  @media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
    --bg:#12161a;--card:#1a2026;--fg:#e6ecf1;--mut:#93a0aa;--line:#2c353d;
    --accent:#5cb8d0;--ok:#5ac98d;--no:#f0857a;--okbg:#16281f;--nobg:#2b1a18;}}
  :root[data-theme="dark"]{
    --bg:#12161a;--card:#1a2026;--fg:#e6ecf1;--mut:#93a0aa;--line:#2c353d;
    --accent:#5cb8d0;--ok:#5ac98d;--no:#f0857a;--okbg:#16281f;--nobg:#2b1a18;}
  *{box-sizing:border-box}
  body{margin:0;padding:2.5rem 1.25rem 5rem;background:var(--bg);color:var(--fg);
    font:400 15px/1.65 var(--sans)}
  .wrap{max-width:60rem;margin:0 auto;display:flex;flex-direction:column;gap:2.75rem}
  header{display:flex;flex-direction:column;gap:.75rem}
  .eyebrow{font:500 .72rem/1 var(--mono);letter-spacing:.13em;text-transform:uppercase;
    color:var(--accent);margin:0}
  h1{font:600 2.1rem/1.15 var(--serif);margin:0;letter-spacing:-.015em;text-wrap:balance}
  h2{font:600 1.15rem/1.3 var(--serif);margin:0 0 .9rem;letter-spacing:-.005em;text-wrap:balance}
  p{margin:0}
  .lede{color:var(--mut);max-width:62ch}
  section{display:flex;flex-direction:column}
  .verdict{display:flex;flex-wrap:wrap;align-items:center;gap:.75rem 1.1rem;
    padding:1rem 1.15rem;border-radius:4px;border:1px solid var(--line);
    border-left:4px solid var(--${allPass ? "ok" : "no"});background:var(--card)}
  .chip{font:500 .78rem/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;
    padding:.42rem .6rem;border-radius:3px;
    background:var(--${allPass ? "okbg" : "nobg"});color:var(--${allPass ? "ok" : "no"})}
  .score{font:600 1.05rem/1 var(--mono);font-variant-numeric:tabular-nums}
  .verdict .why{color:var(--mut);font-size:.9rem}
  .card{background:var(--card);border:1px solid var(--line);border-radius:4px;padding:1.4rem}
  .sizes{display:flex;flex-wrap:wrap;gap:2.25rem;align-items:flex-end}
  .fig{margin:0;display:flex;flex-direction:column;align-items:center;gap:.55rem}
  .cap{font:400 .78rem/1.4 var(--sans);text-align:center;color:var(--mut)}
  .cap b{display:block;font:500 .78rem/1.4 var(--mono);color:var(--fg);
    font-variant-numeric:tabular-nums}
  .stack{position:relative;overflow:hidden}
  .stack .pl,.stack .tl{position:absolute;inset:0;width:100%;height:100%;display:block}
  .stack .tl{-webkit-mask-size:100% 100%;mask-size:100% 100%;
    -webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}
  .stack .tl img{width:100%;height:100%;display:block;mix-blend-mode:multiply}
  .grounds{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
  /* Fixed grounds by design: the point is to judge the matte against white AND near-black,
     so these two panels do NOT follow the viewer's theme. Their captions therefore carry
     explicit colours instead of the theme tokens, which would be unreadable on one of them. */
  .ground{padding:1.6rem;border-radius:4px;border:1px solid var(--line);
    display:flex;justify-content:center}
  .ground.light{background:#fff}
  .ground.light .cap,.ground.light .cap b{color:#5b656d}
  .ground.dark{background:#0d0f11}
  .ground.dark .cap,.ground.dark .cap b{color:#98a4ad}
  .crop{max-width:100%;height:auto;display:block;image-rendering:pixelated;
    border:1px solid var(--line);border-radius:3px;background:#808080}
  .scroll{overflow-x:auto}
  table{border-collapse:collapse;width:100%;font-size:.88rem}
  caption{caption-side:top;text-align:left;color:var(--mut);font-size:.85rem;
    padding:0 0 .8rem}
  th,td{text-align:left;padding:.5rem .65rem;border-bottom:1px solid var(--line);
    vertical-align:top}
  tbody tr:last-child td{border-bottom:0}
  th{font:500 .72rem/1 var(--mono);letter-spacing:.09em;text-transform:uppercase;color:var(--mut)}
  td:first-child{width:1.6rem;font-weight:700}
  tr.ok td:first-child{color:var(--ok)}
  tr.no td:first-child{color:var(--no)}
  td code{font:400 12.5px/1.5 var(--mono)}
  code.d{color:var(--mut);word-break:break-word}
  dl{display:grid;grid-template-columns:max-content 1fr;gap:.5rem 1.5rem;margin:0}
  dt{font:500 .76rem/1.6 var(--mono);letter-spacing:.03em;text-transform:uppercase;color:var(--mut)}
  dd{margin:0;font-variant-numeric:tabular-nums}
  dd code{font:400 12.5px/1.6 var(--mono);word-break:break-all}
  .note{border-left:3px solid var(--accent);padding:.2rem 0 .2rem 1.15rem;color:var(--mut);
    max-width:64ch}
  .note strong{color:var(--fg)}
  @media (max-width:640px){
    .grounds{grid-template-columns:1fr}
    dl{grid-template-columns:1fr;gap:.15rem}
    dt{margin-top:.7rem}
    h1{font-size:1.7rem}
  }
</style>
<div class="wrap">

<header>
  <p class="eyebrow">R2 hair · option A · candidate review</p>
  <h1>The <code style="font:inherit">${esc(style)}</code> hairstyle, as it would ship</h1>
  <p class="lede">The finished, decoded 512×768 runtime asset mounted on the real R2 neutral stack.
  Nothing here is promoted, registered, or reachable by a student.</p>
</header>

<div class="verdict">
  <span class="chip">${allPass ? "all checks pass" : "checks failed"}</span>
  <span class="score">${passed}/${named.length}</span>
  <span class="why">${pre.length} authoring preconditions + ${gates.length} runtime acceptance gates ·
  decoded matches the encoder's reference byte-for-byte: ${built.byteIdentical ? "yes" : "NO"}</span>
</div>

<section>
  <h2>At the four render sizes</h2>
  <div class="card"><div class="sizes">
${RENDER_SIZES.map(([w, h], i) => stackAt(w, h, sizeRole[i] ?? "")).join("")}
  </div></div>
</section>

<section>
  <h2>Against white and near-black, at hub size</h2>
  <div class="grounds">
    <div class="ground light">${stackAt(112, 168, "light ground")}</div>
    <div class="ground dark">${stackAt(112, 168, "dark ground")}</div>
  </div>
</section>

<section>
  <h2>The hairline, magnified 4×</h2>
  <div class="card">
    <img class="crop" alt="The candidate's hairline at four times served scale, on mid-grey" src="${cropUri}">
    <p class="lede" style="margin-top:1rem">Served pixels x ${band.x0}–${band.x1}, y ${band.y0}–${band.y1},
    nearest-neighbour so no interpolation hides an edge. Mid-grey ground shows a light halo and a
    dark fringe equally well, and the map is untinted so the matte is judged on its own.</p>
  </div>
</section>

<section>
  <h2>Measurements</h2>
  <div class="card"><dl>
    <dt>candidate</dt><dd><code>${esc(candidatePath)}</code></dd>
    <dt>candidate sha-256</dt><dd><code>${sha256(srcBuf)}</code></dd>
    <dt>runtime sha-256</dt><dd><code>${built.webpSha}</code></dd>
    <dt>runtime size</dt><dd>${built.webp.length} bytes</dd>
    <dt>dimensions</dt><dd>authoring ${png.w}×${png.h} → runtime ${built.w}×${built.h}</dd>
    <dt>envelope</dt><dd>x ${a.envelope.xLo}…${a.envelope.xHi} (width ${a.envelope.xHi - a.envelope.xLo})
      · y ${a.envelope.yLo}…${a.envelope.yHi} <span style="color:var(--mut)">C2 units</span></dd>
    <dt>components</dt><dd>${comps.count} · largest ${comps.largest} px · specks ${comps.specks}
      <span style="color:var(--mut)">8-neighbour</span></dd>
    <dt>orphan-soft</dt><dd>${a.orphanSoft} of ${HALO_TOLERANCE_SERVED} allowed
      <span style="color:var(--mut)">· authoring canvas ${authoring.orphanSoft}, reported only</span></dd>
    <dt>ink</dt><dd>alpha ≥ ${ALPHA_INK}</dd>
    <dt>hair token</dt><dd><code>${token.base}</code> ${esc(DEFAULT_HAIR_COLOR)}
      <span style="color:var(--mut)">× the luminance map, multiply</span></dd>
  </dl></div>
</section>

<section>
  <h2>Authoring preconditions</h2>
  <div class="card scroll"><table>
    <caption>Properties of the delivered source. Measured on the ${png.w}×${png.h} candidate,
    because no downscale, cleanup or lossless encode can create or repair either one.</caption>
    <thead><tr><th></th><th>check</th><th>measured</th></tr></thead>
    <tbody>${pre.map(row).join("")}</tbody>
  </table></div>
</section>

<section>
  <h2>Runtime acceptance gates</h2>
  <div class="card scroll"><table>
    <caption>The visual judgement. Measured on the decoded ${built.w}×${built.h} asset — the pixels
    a browser paints — after the full pipeline.</caption>
    <thead><tr><th></th><th>gate</th><th>measured</th></tr></thead>
    <tbody>${gates.map(row).join("")}</tbody>
  </table></div>
</section>

<p class="note"><strong>Passing every gate is a precondition, never an approval.</strong> The gates
bound geometry and matte quality. They say nothing about whether this reads as the style a student
picked — that judgement is yours, at these sizes, on these grounds (D-059 / D-105). Until you give
it, nothing is promoted: <code>assets/avatar-r2/hair/</code> is unchanged and no student can reach
this file.</p>

</div>`;

  mkdirSync(assertWritable(OUT_DIR), { recursive: true });
  const outPath = assertWritable(join(OUT_DIR, `${style}-review.html`));
  writeFileSync(outPath, html, "utf8");
  return { outPath, allPass, passed, total: named.length, built, gates, pre };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const [, , file, style] = process.argv;
    const r = run(file || DEFAULT_CANDIDATE, style || "short");
    console.log(`${TOOL} v${TOOL_VERSION}`);
    console.log(`  ${r.passed}/${r.total} named checks · byte-identical decode: ${r.built.byteIdentical}`);
    console.log(`  wrote ${r.outPath.replace(REPO + sep, "").split(sep).join("/")}`);
    console.log(`  PROMOTES NOTHING — gitignored review output only.`);
    process.exit(r.allPass ? 0 : 1);
  } catch (err) {
    console.error(String(err.message ?? err));
    process.exit(1);
  }
}
