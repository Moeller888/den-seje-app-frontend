// R3 FIGURE VIEWS (D-194). The whole R3 figure (D-194 reference body) in copies of the app's avatar views — quiz 52x78 at DPR
// 1/2/3 in four themes, hub, collection, avatar page and shop at DPR 2 — each a harness page with the page's own rules and the
// whole theme file, the current background as the main result, beside ONE shared framing proposal. Same figure, same canvas
// placement and scale for every hairstyle. Review harness only: the active UI is not changed. R3 stays default OFF.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { encodePng, pixelSha256 } from "./r3-hair-tool-v2.mjs";
import * as EF from "./r3-northstar-earfix.mjs";
import * as FG from "./r3-northstar-figure.mjs";
import * as Q from "./r3-review-quiz.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const VIEWS_FILE = "tools/avatar/fixtures/r3-northstar-figure/views-v1.json";
const W = 1024, H = 1536, N = W * H;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const rel = (p) => readFileSync(join(REPO, ...p.split("/")));
export const loadViews = () => JSON.parse(rel(VIEWS_FILE).toString("utf8"));

/** The page's own rules for one view, verbatim, animation declarations removed. */
export function viewRules(view) { const html = rel(view.page).toString("utf8"); return view.selectors.map((s) => Q.extractRule(html, s).replace(/\n\s*animation:[^;]*;/g, "")).join("\n"); }

/** The figure composites per style (same body, same head, same canvas). */
export function composites(build = FG.buildFigure(), spec = loadViews()) {
  const afro = EF.loadD192Afro(), images = {}, hair = {};
  for (const s of spec.styles) { images[s.id] = FG.composeFigure(build, s.situation, s.colour ? Q.hairToken(s.colour) : undefined, afro); hair[s.id] = s.situation === "northstar" ? build.layers.hair : s.situation === "short" ? build.ef.head.styles.short : afro.afro; }
  return { images, hair };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** One deterministic harness page per view. */
export function harnessHtml(view, spec = loadViews()) {
  const theme = rel(spec.themes).toString("utf8"), open = view.box.replace(/>$/, ` data-style="%S"%F>`);
  const box = (s, f) => `<div class="cell"${view.parentWidth ? ` style="width:${view.parentWidth}px"` : ""}>${open.replace("%S", s.id).replace("%F", f ? ' data-framing="1"' : "").replace(/(class="[^"]*)"/, f ? '$1 r3-framing"' : "$1\"").replace(/^<div id="([^"]+)"/, f ? '<div id="$1" class="r3-framing"' : '<div id="$1"')}<img class="${view.layerClass}" src="img/${s.id}.png" alt=""></div><span>${esc(s.label)}</span></div>`;
  const row = (t, f) => `<section data-theme="${t}" data-mode="${f ? "framing" : "current"}" class="row"><h3>${view.id} · ${t} · ${f ? "forslag: fælles beskæring" : "nuværende"}</h3><div class="strip">${spec.styles.map((s) => box(s, f)).join("")}</div></section>`;
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><title>R3 figur · ${view.id}</title>
<style>${theme}</style>
<style>*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, sans-serif; background: #000; }
.row { background: var(--bg-main); color: var(--text-main); padding: 8px 10px; }
.row h3 { font: 11px Arial, sans-serif; margin: 0 0 6px; }
.strip { display: flex; gap: 12px; align-items: flex-start; }
.cell { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 9px; }
${viewRules(view)}
${spec.framingProposal.css}</style></head><body>
<p class="note" style="color:#fff;font:11px Arial;padding:6px 10px">Referencekrop: Northstar v2's egen krop og tøj — ikke et R3-kropsasset.</p>
${view.themes.map((t) => row(t, false) + row(t, true)).join("\n")}
</body></html>
`;
}

/** Geometry of the figure in one rendered box, from the layer's rect and the canvas bboxes (CSS px). */
function geometry(b, framing, bbox, face) {
  const s = Math.min(b.iw / W, b.ih / H), ox = b.ix - b.x + (b.iw - W * s) / 2, oy = b.iy - b.y + (b.ih - H * s) / 2, k = framing ? 1.6 : 1;
  // the framing scales the layer about its own top centre
  const cx = b.ix - b.x + b.iw / 2, cy = b.iy - b.y, X = (x) => cx + ((ox + x * s) - cx) * k, Y = (y) => cy + ((oy + y * s) - cy) * k;
  const r = (v) => +v.toFixed(1);
  return { faceWidthCss: r((face.x1 - face.x0 + 1) * s * k), topMarginCss: r(Y(bbox.y0)), leftMarginCss: r(X(bbox.x0)), rightMarginCss: r(b.w - X(bbox.x1 + 1)), visibleToCanvasY: Math.min(H, Math.round((b.h - Y(0)) / (s * k))), clippedTop: Y(bbox.y0) < 0, clippedSide: X(bbox.x0) < 0 || X(bbox.x1 + 1) > b.w };
}

export async function renderViews(OUT, { build = FG.buildFigure(), spec = loadViews() } = {}) {
  mkdirSync(join(OUT, "img"), { recursive: true });
  const { images, hair } = composites(build, spec), files = {}, measures = [];
  for (const [k, p] of Object.entries(images)) writeFileSync(join(OUT, "img", `${k}.png`), encodePng(W, H, p));
  const bboxOf = (P, t = 128) => { let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1; for (let i = 0; i < N; i++) if (P[i * 4 + 3] >= t) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { x0, x1, y0, y1 }; };
  const bb = Object.fromEntries(Object.entries(images).map(([k, p]) => [k, bboxOf(p)])), face = bboxOf(build.layers.skin);
  const { chromium } = await import("@playwright/test"), browser = await chromium.launch();
  try {
    for (const view of spec.views) {
      writeFileSync(join(OUT, `v-${view.id}.html`), harnessHtml(view, spec));
      for (const dpr of view.dprs) {
        const page = await browser.newPage({ deviceScaleFactor: dpr, viewport: { width: 1100, height: 900 } });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(pathToFileURL(join(OUT, `v-${view.id}.html`)).href); await page.waitForLoadState("networkidle");
        const S = Q.decodeScreenshot(await page.screenshot({ fullPage: true }));
        const boxes = await page.$$eval("[data-style]", (els) => els.map((e) => { const r = e.getBoundingClientRect(), i = e.querySelector("img").getBoundingClientRect(), sec = e.closest("section"); return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height, ix: i.x + scrollX, iy: i.y + scrollY, iw: i.width, ih: i.height, style: e.dataset.style, theme: sec.dataset.theme, mode: sec.dataset.mode }; }));
        const crops = [];
        for (const b of boxes) {
          const framing = b.mode === "framing";
          // the layer rect before the framing transform: getBoundingClientRect includes it, so undo it for the geometry
          const lay = framing ? { ...b, iw: b.iw / 1.6, ih: b.ih / 1.6, ix: b.ix + (b.iw - b.iw / 1.6) / 2, iy: b.iy } : b;
          const x0 = Math.round(b.x * dpr), y0 = Math.round(b.y * dpr), bw = Math.round(b.w * dpr), bh = Math.round(b.h * dpr), px = new Uint8ClampedArray(bw * bh * 4);
          for (let y = 0; y < bh; y++) px.set(S.px.subarray(((y0 + y) * S.w + x0) * 4, ((y0 + y) * S.w + x0 + bw) * 4), y * bw * 4);
          const g = geometry(lay, framing, bb[b.style], face);
          let contrast = null;
          if (!framing) { const s = Math.min(lay.iw / W, lay.ih / H) * dpr; contrast = Q.silhouetteContrast({ w: bw, h: bh, px }, { s, ox: (lay.ix - b.x) * dpr + (lay.iw * dpr - W * s) / 2, oy: (lay.iy - b.y) * dpr + (lay.ih * dpr - H * s) / 2 }, images[b.style], hair[b.style]); }
          measures.push({ view: view.id, dpr, theme: b.theme, mode: b.mode, style: b.style, ...g, contrast: contrast && contrast.ratio });
          crops.push({ ...b, w2: bw, h2: bh, px });
        }
        await page.close();
        for (const enlarged of [false, true]) {
          const k = enlarged ? Math.max(1, Math.round((view.id === "quiz" ? 4 : 2) / dpr)) : 1, cw = crops[0].w2 * k, ch = crops[0].h2 * k, cols = spec.styles.length, rows = view.themes.length * 2, g = 6;
          const Wd = cols * cw + (cols - 1) * g, Hd = rows * ch + (rows - 1) * g, o = new Uint8ClampedArray(Wd * Hd * 4).fill(255);
          for (const c of crops) { const r = view.themes.indexOf(c.theme) * 2 + (c.mode === "framing" ? 1 : 0), col = spec.styles.findIndex((s) => s.id === c.style), ox = col * (cw + g), oy = r * (ch + g);
            for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const sx = (x / k) | 0, sy = (y / k) | 0; if (sx >= c.w2 || sy >= c.h2) continue; o.set(c.px.subarray((sy * c.w2 + sx) * 4, (sy * c.w2 + sx) * 4 + 4), ((oy + y) * Wd + ox + x) * 4); } }
          const n = `v-${view.id}-dpr${dpr}-${enlarged ? "enlarged" : "actual"}.png`, buf = encodePng(Wd, Hd, o); writeFileSync(join(OUT, n), buf);
          files[n] = { sha256: sha(buf), w: Wd, h: Hd, dpr, view: view.id, scale: enlarged ? `×${k} nearest` : "actual device pixels", rows: "per theme: current, framing proposal", cols: spec.styles.map((s) => s.id) };
        }
      }
    }
  } finally { await browser.close(); }
  return { files, measures, composites: Object.fromEntries(Object.entries(images).map(([k, p]) => [k, pixelSha256(p)])), bboxes: bb, face };
}
