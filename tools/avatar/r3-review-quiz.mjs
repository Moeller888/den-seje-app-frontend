// R3 QUIZ-VIEW REVIEW (D-193). Shows the R3 head (D-193 ear fix) with Northstar's hair, short and afro (darkest and lightest
// hair token) in a copy of the quiz identity strip's 52x78 avatar box — the page's own rules (index.html) and the whole theme
// file — at DPR 1, 2 and 3 in four themes, beside ONE shared backdrop proposal. Every hairstyle is the same canvas at the same
// placement and scale. The R3 figure has no body yet, so the final composition is NOT validated. Review harness only: the
// active quiz, the theme colours and the hair assets are not changed. R3 stays default OFF.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { encodePng, pixelSha256 } from "./r3-hair-tool-v2.mjs";
import * as EF from "./r3-northstar-earfix.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SPEC_FILE = "tools/avatar/fixtures/r3-quiz-review/spec-v1.json";
const W = 1024, H = 1536, N = W * H;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const rel = (p) => readFileSync(join(REPO, ...p.split("/")));
export const loadSpec = () => JSON.parse(rel(SPEC_FILE).toString("utf8"));

/** One CSS rule block copied verbatim from the page (4-space indented `<selector> {` … `    }`); throws if it is missing. */
export function extractRule(html, selector) {
  const open = "\n    " + selector + " {", i = html.indexOf(open); if (i < 0) throw new Error(`index.html has no rule ${selector}`);
  if (html.indexOf(open, i + 1) >= 0) throw new Error(`index.html has the rule ${selector} more than once`);
  const end = html.indexOf("\n    }", i + 1); if (end < 0) throw new Error(`unterminated rule ${selector}`);
  return html.slice(i + 1, end + 6);
}
/** The copied rules, animation declarations removed (one deterministic frame). */
export function quizRules(spec = loadSpec(), html = rel(spec.sources.page).toString("utf8")) {
  return spec.sources.selectors.map((s) => extractRule(html, s).replace(/\n\s*animation:[^;]*;/g, "")).join("\n");
}
/** {base} of a hair colour key from the runtime token table, read from the source text; throws if missing. */
export function hairToken(key, src = rel(loadSpec().sources.hairTokens).toString("utf8")) {
  const m = src.match(new RegExp(`\\n\\s*${key}:\\s*\\{\\s*base:\\s*"#([0-9A-Fa-f]{6})"`)); if (!m) throw new Error(`no hair token ${key}`);
  return [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16));
}

/** The composites (1024x1536, same canvas, same head) per spec style; also the hair layer per style for the measurements. */
export function composites(build = EF.buildEarFix(), spec = loadSpec()) {
  const afro = EF.loadD192Afro(), out = {}, hair = {};
  for (const s of spec.styles) {
    if (s.id === "northstar") { out[s.id] = EF.composeSituation(build, "northstar"); hair[s.id] = build.layers.hair; continue; }
    out[s.id] = EF.composeSituation(build, s.style, hairToken(s.colour), afro); hair[s.id] = s.style === "afro" ? afro.afro : build.head.styles.short;
  }
  return { images: out, hair };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** The deterministic harness page (images referenced as img/<style>.png). */
export function harnessHtml(spec = loadSpec()) {
  const theme = rel(spec.sources.themes).toString("utf8"), rules = quizRules(spec);
  const box = (s, p) => `<div class="cell"><div id="avatar-display"${p ? ' class="r3-proposal"' : ""} data-style="${s.id}"><img class="quiz-avatar-layer" src="img/${s.id}.png" alt=""></div><span>${esc(s.label)}</span></div>`;
  const row = (t, p) => `<section data-theme="${t}" data-mode="${p ? "proposal" : "current"}" class="row"><h3>${t} · ${p ? "forslag" : "nuværende"}</h3><div class="game-identity">${spec.styles.map((s) => box(s, p)).join("")}</div></section>`;
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><title>R3 quiz-review</title>
<style>${theme}</style>
<style>*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, sans-serif; background: #000; }
.row { background: var(--bg-main); color: var(--text-main); padding: 8px 10px; }
.row h3 { font: 11px Arial, sans-serif; margin: 0 0 6px; }
.cell { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 9px; width: 64px; }
${rules}
${spec.proposal.css}</style></head><body>
<p class="note" style="color:#fff;font:11px Arial;padding:6px 10px">${esc(spec.bodyMissing)}</p>
${spec.themes.map((t) => row(t, false) + row(t, true)).join("\n")}
</body></html>
`;
}

const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
/** The band width, in device pixels, on each side of the hair silhouette. */
export const BAND_PX = 3;
/** Silhouette contrast on device pixels: the hair's outer band (≤ BAND_PX inside) against the background ring (≤ BAND_PX outside).
 *  A supporting number only — never a visual approval on its own. */
export function silhouetteContrast(shot, map, comp, hair) {
  // a device pixel is HAIR only when its whole canvas footprint is opaque hair, BACKGROUND only when its whole footprint is
  // empty; the antialiased pixels between them count as neither
  const { w, h, px } = shot, inHair = new Uint8Array(w * h), bg = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx0 = Math.floor((x - map.ox) / map.s), cx1 = Math.ceil((x + 1 - map.ox) / map.s) - 1, cy0 = Math.floor((y - map.oy) / map.s), cy1 = Math.ceil((y + 1 - map.oy) / map.s) - 1;
    if (cx1 < 0 || cy1 < 0 || cx0 >= W || cy0 >= H) { bg[y * w + x] = 1; continue; }
    let allHair = true, empty = true;
    for (let cy = Math.max(0, cy0); cy <= Math.min(H - 1, cy1); cy++) for (let cx = Math.max(0, cx0); cx <= Math.min(W - 1, cx1); cx++) { const j = cy * W + cx; if (comp[j * 4 + 3]) empty = false; if (comp[j * 4 + 3] < 250 || hair[j * 4 + 3] < 200) allHair = false; }
    if (allHair) inHair[y * w + x] = 1; else if (empty) bg[y * w + x] = 1;
  }
  const near = (m, x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h && m[yy * w + xx]) return true; } return false; };
  let hl = 0, hn = 0, bl = 0, bn = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x, L = lum(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    if (inHair[i] && near(bg, x, y, BAND_PX)) { hl += L; hn++; } else if (bg[i] && near(inHair, x, y, BAND_PX)) { bl += L; bn++; } }
  // too few whole-hair pixels at the silhouette (small hair at DPR 1): not measurable, reported as such
  if (!hn || !bn) return { ratio: null, hairBandPx: hn, ringPx: bn, reason: "no whole-hair device pixel within the band of a whole-background one" };
  const a = hl / hn, b = bl / bn;
  return { ratio: +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2), hairBandPx: hn, ringPx: bn };
}

/** A browser screenshot (8-bit RGB or RGBA, not interlaced) decoded to RGBA; throws on any other PNG. */
export function decodeScreenshot(buf) {
  let p = 8, w = 0, h = 0, ct = -1; const idat = [];
  while (p < buf.length) { const len = buf.readUInt32BE(p), type = buf.toString("latin1", p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; if (d[8] !== 8 || d[12] !== 0 || (ct !== 2 && ct !== 6)) throw new Error("unsupported screenshot PNG"); }
    else if (type === "IDAT") idat.push(d); else if (type === "IEND") break; p += 12 + len; }
  const bpp = ct === 6 ? 4 : 3, raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, cur = new Uint8Array(stride), prev = new Uint8Array(stride), px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0; let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = v & 255; }
    for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; px[o] = cur[x * bpp]; px[o + 1] = cur[x * bpp + 1]; px[o + 2] = cur[x * bpp + 2]; px[o + 3] = bpp === 4 ? cur[x * bpp + 3] : 255; }
    prev.set(cur); }
  return { w, h, px };
}

/** Renders the harness in Chromium (Playwright) at each DPR; writes sheets at actual size and enlarged, and measures. */
export async function renderQuiz(OUT, { build = EF.buildEarFix(), spec = loadSpec() } = {}) {
  mkdirSync(join(OUT, "img"), { recursive: true });
  const { images, hair } = composites(build, spec), files = {};
  for (const [k, p] of Object.entries(images)) writeFileSync(join(OUT, "img", `${k}.png`), encodePng(W, H, p));
  writeFileSync(join(OUT, "quiz-harness.html"), harnessHtml(spec));
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch(), measures = [];
  try {
    for (const dpr of spec.dprs) {
      const page = await browser.newPage({ deviceScaleFactor: dpr, viewport: { width: 760, height: 900 } });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(pathToFileURL(join(OUT, "quiz-harness.html")).href); await page.waitForLoadState("networkidle");
      const shot = await page.screenshot({ fullPage: true }); writeFileSync(join(OUT, `q-sheet-dpr${dpr}.png`), shot); files[`q-sheet-dpr${dpr}.png`] = { sha256: sha(shot), dpr, scale: "actual device pixels" };
      const S = decodeScreenshot(shot);
      const boxes = await page.$$eval("#avatar-display", (els) => els.map((e) => { const r = e.getBoundingClientRect(), i = e.querySelector("img").getBoundingClientRect(), sec = e.closest("section"); return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height, ix: i.x + scrollX, iy: i.y + scrollY, iw: i.width, ih: i.height, style: e.dataset.style, theme: sec.dataset.theme, mode: sec.dataset.mode }; }));
      for (const b of boxes) {
        const x0 = Math.round(b.x * dpr), y0 = Math.round(b.y * dpr), bw = Math.round(b.w * dpr), bh = Math.round(b.h * dpr), crop = new Uint8ClampedArray(bw * bh * 4);
        for (let y = 0; y < bh; y++) crop.set(S.px.subarray(((y0 + y) * S.w + x0) * 4, ((y0 + y) * S.w + x0 + bw) * 4), y * bw * 4);
        const s = Math.min(b.iw / W, b.ih / H) * dpr, map = { s, ox: (b.ix - b.x) * dpr + (b.iw * dpr - W * s) / 2, oy: (b.iy - b.y) * dpr + (b.ih * dpr - H * s) / 2 };
        measures.push({ dpr, theme: b.theme, mode: b.mode, style: b.style, contrast: silhouetteContrast({ w: bw, h: bh, px: crop }, map, images[b.style], hair[b.style]), map, crop: { w: bw, h: bh, px: crop } });
      }
      await page.close();
    }
  } finally { await browser.close(); }
  // per DPR: the boxes at actual device size, and enlarged (nearest neighbour to 6 device px per CSS px)
  for (const dpr of spec.dprs) for (const enlarged of [false, true]) {
    const ms = measures.filter((m) => m.dpr === dpr), k = enlarged ? Math.round(6 / dpr) : 1, cw = ms[0].crop.w * k, cols = spec.styles.length, g = 4 * (enlarged ? 2 : 1);
    const rows = spec.themes.length * 2, CH = enlarged ? Math.round(ms[0].crop.h * 0.42) * k : ms[0].crop.h, Wd = cols * cw + (cols - 1) * g, Hd = rows * CH + (rows - 1) * g, o = new Uint8ClampedArray(Wd * Hd * 4).fill(255);
    ms.forEach((m) => { const r = spec.themes.indexOf(m.theme) * 2 + (m.mode === "proposal" ? 1 : 0), c = spec.styles.findIndex((s) => s.id === m.style), ox = c * (cw + g), oy = r * (CH + g);
      for (let y = 0; y < CH; y++) for (let x = 0; x < cw; x++) { const sx = Math.floor(x / k), sy = Math.floor(y / k); if (sy >= m.crop.h || sx >= m.crop.w) continue; o.set(m.crop.px.subarray((sy * m.crop.w + sx) * 4, (sy * m.crop.w + sx) * 4 + 4), ((oy + y) * Wd + ox + x) * 4); } });
    const n = `q-boxes-dpr${dpr}-${enlarged ? "enlarged" : "actual"}.png`, b = encodePng(Wd, Hd, o); writeFileSync(join(OUT, n), b);
    files[n] = { sha256: sha(b), w: Wd, h: Hd, dpr, scale: enlarged ? `×${k} nearest, top 42 % of the box (the head)` : "actual device pixels", rows: "per theme: current, proposal", cols: spec.styles.map((s) => s.id) };
  }
  // the proposal leaves the avatar's own pixels alone: opaque avatar pixels compared between current and proposal (DPR 2)
  const opaqueDiff = {};
  for (const t of spec.themes) for (const st of spec.styles) {
    const a = measures.find((m) => m.dpr === 2 && m.theme === t && m.mode === "current" && m.style === st.id), b = measures.find((m) => m.dpr === 2 && m.theme === t && m.mode === "proposal" && m.style === st.id);
    let mx = 0; const P = images[st.id];
    for (let y = 0; y < a.crop.h; y++) for (let x = 0; x < a.crop.w; x++) {
      // a device pixel counts only when EVERY canvas pixel of its footprint (one device pixel margin) is opaque
      const cx0 = Math.floor((x - 1 - a.map.ox) / a.map.s), cx1 = Math.ceil((x + 2 - a.map.ox) / a.map.s), cy0 = Math.floor((y - 1 - a.map.oy) / a.map.s), cy1 = Math.ceil((y + 2 - a.map.oy) / a.map.s);
      if (cx0 < 0 || cy0 < 0 || cx1 >= W || cy1 >= H) continue;
      let full = true; for (let cy = cy0; cy <= cy1 && full; cy++) for (let cx = cx0; cx <= cx1; cx++) if (P[(cy * W + cx) * 4 + 3] < 255) { full = false; break; } if (!full) continue;
      const i = (y * a.crop.w + x) * 4; for (let c = 0; c < 3; c++) mx = Math.max(mx, Math.abs(a.crop.px[i + c] - b.crop.px[i + c])); }
    opaqueDiff[`${t}/${st.id}`] = mx;
  }
  const table = measures.map(({ crop, map, ...m }) => m);
  return { files, measures: table, opaqueDiff, composites: Object.fromEntries(Object.entries(images).map(([k, p]) => [k, pixelSha256(p)])) };
}
