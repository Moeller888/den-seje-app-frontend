// D-195 BROWSER VERIFICATION of the shared upper-body framing (quiz #avatar-display, hub .profile-avatar). Runs the REAL
// renderer (js/avatar-render-c2.js mountC2Avatar + js/avatar-blink-engine.js BlinkEngine) in Chromium against a local static
// server of this checkout, with each surface's own <style> block and css/theme.css, and measures:
//   1. REGISTRATION — every mounted layer (R2 stack, tint wrappers, inline C2 hair, cosmetics with their own transforms, the
//      blink layer and each lid) framed = the unframed rect scaled k about the box's top centre (DOM rects, not CSS text);
//   2. BASELINE — flag off, and every non-documented localStorage value, renders pixel-identical to origin/main's CSS;
//   3. CLIPPING per layer kind — each kind rendered alone with overflow visible: pixels outside the box (lost) and the
//      smallest room inside the box, so intended body clipping is told apart from lost hair, headwear or cosmetics.
// Writes result.json and the review sheets into --out. Needs Playwright's Chromium; never part of the unit tests.
// Usage: node tools/avatar/verify-framing-d195.mjs --out <dir> [--scales 1.5,1.6]
import http from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng } from "./r3-hair-tool-v2.mjs";
import { decodeScreenshot } from "./r3-review-quiz.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = resolve(arg("--out", "tools/avatar/build/verify-framing-d195")); mkdirSync(OUT, { recursive: true });
const SCALES = arg("--scales", "1.5,1.6").split(",").map(Number);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".json": "application/json" };

export const IDENTITIES = {
  "r2-short-black": { body_type: "neutral", skin_tone: "medium", hairstyle: "short", hair_color: "black" },
  "r2-afro-brown": { body_type: "neutral", skin_tone: "medium", hairstyle: "afro", hair_color: "brown" },
  "c2-dark-blonde": { body_type: "neutral", skin_tone: "dark", hairstyle: "short", hair_color: "blonde" },
};
export const COSMETICS = {
  none: {},
  crown: { headwear: "/assets/avatar/hat/crown-golden.svg" },
  pirate: { headwear: "/assets/avatar/hat/pirate-hat.svg" },
  "aura-wings": { aura: "/assets/avatar/aura/aura-gold.svg", back: "/assets/avatar/body/wings-dragon.svg" },
  cape: { back: "/assets/avatar/shirt/cape-red.svg" },
};
const style = (html) => html.match(/<style>([\s\S]*?)<\/style>/)[1];
const mainFile = (f) => execFileSync("git", ["show", `origin/main:${f}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26 });
export const SURFACES = {
  quiz: { file: "index.html", box: '<div class="game-identity"><div id="avatar-display"></div></div>', sel: "#avatar-display", layerClass: "quiz-avatar-layer", border: true,
    override: (k) => `#avatar-display.avatar-framing-upper .quiz-avatar-layer { left: ${-(k - 1) / 2 * 100}%; width: ${k * 100}%; height: ${k * 100}%; }\n#avatar-display.avatar-framing-upper #avatar-blink-layer { left: ${-(k - 1) / 2 * 100}% !important; width: ${k * 100}% !important; height: ${k * 100}% !important; }` },
  hub: { file: "hub.html", box: '<div class="avatar-showcase" id="avatarShowcase"><div class="profile-avatar" id="profileAvatar"></div></div>', sel: "#profileAvatar", layerClass: "profile-avatar-layer", border: false,
    override: (k) => `.profile-avatar.avatar-framing-upper .profile-avatar-layer, .profile-avatar.avatar-framing-upper .quiz-avatar-layer { left: ${-(k - 1) / 2 * 100}%; width: ${k * 100}%; height: ${k * 100}%; }\n.profile-avatar.avatar-framing-upper #avatar-blink-layer { left: ${-(k - 1) / 2 * 100}% !important; width: ${k * 100}% !important; height: ${k * 100}% !important; }` },
};
/** The scale the checkout ships (read from index.html's framing rule). */
export function shippedScale(html = readFileSync(join(ROOT, "index.html"), "utf8")) { const m = html.match(/#avatar-display\.avatar-framing-upper \.quiz-avatar-layer \{ left: (-?[\d.]+)%; width: ([\d.]+)%; height: ([\d.]+)%; \}/); if (!m) throw new Error("no framing rule in index.html"); return +m[2] / 100; }

/** One test page: css source ('pr' | 'main'), localStorage value (null = none), optional scale override, blink frame, analysis mode. */
function page(s, { css, value, scale, identity, slots, blink, isolate }) {
  const S = SURFACES[s], html = css === "main" ? mainFile(S.file) : readFileSync(join(ROOT, S.file), "utf8");
  // analysis: every element OUTSIDE the avatar layers loses its paint (panels, showcase, the box itself), the page turns
  // magenta, the box keeps only a cyan dashed outline; the layers inside keep theirs (the hair tint wrapper paints with
  // background-color)
  const extra = scale ? S.override(scale) : "", iso = isolate ? `body *:not(${S.sel} *){background:none!important;box-shadow:none!important;border-color:transparent!important;outline:none!important}body *:not(${S.sel} *)::before,body *:not(${S.sel} *)::after{display:none!important}${S.sel}{overflow:visible!important;outline:1px dashed #00ffff!important;animation:none!important}body{background:#ff00ff!important}` : "";
  return `<!doctype html><html lang="da" data-theme="default"><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/css/theme.css"><style>${style(html)}</style><style>${extra}</style><style>body{display:block;padding:40px 60px;margin:0}${iso}</style></head><body>${S.box}
<script type="module">
window.__AVATAR_TEST__ = true; localStorage.clear(); ${value === null ? "" : `localStorage.setItem("avatar_framing", ${JSON.stringify(value)});`}
const L = await import("/js/avatar-layers.js"), R = await import("/js/avatar-render-c2.js"), B = await import("/js/avatar-blink-engine.js");
const el = document.querySelector(${JSON.stringify(S.sel)}), identity = ${JSON.stringify(identity)}, slots = ${JSON.stringify(slots)};
el.classList.toggle(L.AVATAR_FRAMING_CLASS, L.isAvatarFramingUpper());
const cosmetics = R.c2CosmeticLayers(Object.fromEntries(Object.keys(slots).map((k) => [k, k])), (id) => slots[id]);
const path = await R.mountC2Avatar(el, identity, { layerClass: ${JSON.stringify(S.layerClass)}, cosmetics, surface: "verify" });
const be = new B.BlinkEngine(el, identity.skin_tone, L.blinkConfigFor(identity, path === "r2"));
be.forceFrame(${JSON.stringify(blink === "closed" ? "closed" : "open")});
if (${JSON.stringify(blink)} === "mid") for (const lid of [be._lidL, be._lidR]) if (lid) lid.style.transform = "scaleY(0.5)";
await R.markAvatarRendered(el);
const kind = (c) => { const m = c.getAttribute("data-c2-layer") || "", src = (c.querySelector && c.querySelector("img") ? c.querySelector("img").getAttribute("src") : c.getAttribute("src")) || ""; if (c.id === "avatar-blink-layer") return "blink"; if (m === "hair" || m === "hair-r2") return "hair"; if (/\\/hat\\//.test(src)) return "headwear"; if (/\\/aura\\//.test(src)) return "aura"; if (/wings|cape/.test(src)) return "back"; return "body"; };
const b = el.getBoundingClientRect(), cs = getComputedStyle(el), bl = parseFloat(cs.borderLeftWidth), bt = parseFloat(cs.borderTopWidth);
const rect = (n) => { const r = n.getBoundingClientRect(); return [r.x - b.x - bl, r.y - b.y - bt, r.width, r.height].map((v) => +v.toFixed(3)); };
const kids = [...el.children].map((c, i) => ({ i, kind: kind(c), marker: c.getAttribute("data-c2-layer") || c.id, rect: rect(c) }));
const lids = [...el.querySelectorAll("#avatar-blink-layer ellipse")].map(rect);
window.__done = { path, cls: el.className, overflow: cs.overflow, inner: [el.clientWidth, el.clientHeight], kids, lids };
document.body.dataset.done = "1";
${isolate ? `window.__isolate = (keep) => { for (const c of el.children) c.style.visibility = kind(c) === keep ? "visible" : "hidden"; };` : ""}
</script></body></html>`;
}

const pages = {}, server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0]); if (pages[u]) { res.writeHead(200, { "content-type": "text/html" }); return res.end(pages[u]); }
  const p = join(ROOT, u); if (!p.startsWith(ROOT) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" }); res.end(readFileSync(p));
});

async function main() {
  const { chromium } = await import("@playwright/test");
  await new Promise((r) => server.listen(0, "127.0.0.1", r)); const PORT = server.address().port;
  const shipped = shippedScale(), browser = await chromium.launch(), result = { shippedScale: shipped, scales: SCALES, registration: [], baseline: [], optIn: [], clipping: [], errors: [] };
  let n = 0; const shots = {};
  const open = async (s, opts, { dpr = 2, width = 420 } = {}) => {
    const url = `/__v/${n++}.html`; pages[url] = page(s, opts);
    const p = await browser.newPage({ deviceScaleFactor: dpr, viewport: { width, height: 500 } }); await p.emulateMedia({ reducedMotion: "reduce" });
    p.on("pageerror", (e) => result.errors.push(`${s} ${JSON.stringify(opts.identity)}: ${e}`)); p.on("console", (m) => { if (m.type() === "error") result.errors.push(`${s}: ${m.text()}`); });
    await p.goto(`http://127.0.0.1:${PORT}${url}`); await p.waitForSelector("body[data-done='1']", { timeout: 30000 }); delete pages[url];
    return { p, info: await p.evaluate(() => window.__done) };
  };
  const shoot = async (p, s) => decodeScreenshot(await (await p.$(SURFACES[s].sel)).screenshot());
  const same = (a, b) => a.w === b.w && a.h === b.h && a.px.every((v, i) => v === b.px[i]);
  try {
    const views = [["quiz", 1, 420], ["quiz", 2, 420], ["quiz", 3, 420], ["hub", 1, 600], ["hub", 2, 600], ["hub", 3, 600], ["hub", 2, 500]];
    // 1 + 2: registration (every layer, every lid) and the disabled baseline
    for (const [s, dpr, width] of views) for (const [id, identity] of Object.entries(IDENTITIES)) for (const [cos, slots] of Object.entries(COSMETICS)) {
      if (dpr !== 2 && cos !== "none" && cos !== "crown") continue;
      for (const blink of cos === "none" ? ["open", "closed", "mid"] : ["closed"]) {
        const base = { identity, slots, blink }, off = await open(s, { ...base, css: "pr", value: null }, { dpr, width }), offImg = await shoot(off.p, s);
        const tag = `${s}@${dpr}x${width}/${id}/${cos}/${blink}`;
        if (blink === "closed") {
          const m = await open(s, { ...base, css: "main", value: null }, { dpr, width }), mImg = await shoot(m.p, s);
          const rectsEqual = JSON.stringify(off.info.kids.map((c) => c.rect)) === JSON.stringify(m.info.kids.map((c) => c.rect)) && JSON.stringify(off.info.lids) === JSON.stringify(m.info.lids);
          let identical = same(offImg, mImg), identicalWithoutAnimatedAura = null;
          // the aura SVGs carry their own @keyframes, so their pixels change between ANY two renders: when the only animated
          // layer is the aura, compare again with it hidden in both (its placement is already covered by the rect check)
          if (!identical && slots.aura) { const hide = (sel) => { for (const c of document.querySelector(sel).children) if (/\/aura\//.test(c.getAttribute("src") || "")) c.style.visibility = "hidden"; };
            await off.p.evaluate(hide, SURFACES[s].sel); await m.p.evaluate(hide, SURFACES[s].sel); identicalWithoutAnimatedAura = same(await shoot(off.p, s), await shoot(m.p, s)); }
          await m.p.close();
          result.baseline.push({ tag, cls: off.info.cls.includes("avatar-framing-upper"), identicalToMain: identical, identicalWithoutAnimatedAura, rectsEqualToMain: rectsEqual, layers: off.info.kids.length, path: off.info.path });
          if (dpr === 2 && cos === "none") shots[`${s}@${width}/${id}/off`] = offImg;
        }
        await off.p.close();
        for (const k of SCALES) {
          const on = await open(s, { ...base, css: "pr", value: "upper", scale: k === shipped ? null : k }, { dpr, width }), onImg = await shoot(on.p, s); await on.p.close();
          if (blink === "closed" && dpr === 2 && cos === "none") shots[`${s}@${width}/${id}/${k}`] = onImg;
          if (blink === "closed" && dpr === 2 && cos !== "none") shots[`${s}@${width}/${id}/${cos}/${k}`] = onImg, shots[`${s}@${width}/${id}/${cos}/off`] = offImg;
          const [W0] = off.info.inner, cx = W0 / 2; let worst = 0;
          const expect = ([x, y, w, h]) => [cx + (x - cx) * k, y * k, w * k, h * k];
          const cmp = (a, b) => { const e = expect(a); for (let i = 0; i < 4; i++) worst = Math.max(worst, Math.abs(e[i] - b[i])); };
          const ok = on.info.kids.length === off.info.kids.length && on.info.lids.length === off.info.lids.length;
          if (ok) { off.info.kids.forEach((c, i) => cmp(c.rect, on.info.kids[i].rect)); off.info.lids.forEach((r, i) => cmp(r, on.info.lids[i])); }
          result.registration.push({ tag, scale: k, path: on.info.path, cls: on.info.cls.includes("avatar-framing-upper"), overflow: on.info.overflow, layers: on.info.kids.map((c) => c.kind).join(","), lids: on.info.lids.length, sameLayerCount: ok, worstRectErrorPx: +worst.toFixed(3) });
        }
      }
    }
    // the documented opt-in only: any other value leaves the class off and the view identical to the flag-off render
    for (const s of ["quiz", "hub"]) {
      const base = { identity: IDENTITIES["r2-afro-brown"], slots: {}, blink: "closed", css: "pr" }, ref = await open(s, { ...base, value: null }), refImg = await shoot(ref.p, s); await ref.p.close();
      for (const value of ["1", "true", "UPPER", " upper", "upper ", "full", "", "lower"]) { const o = await open(s, { ...base, value }), img = await shoot(o.p, s); await o.p.close(); result.optIn.push({ surface: s, value, cls: o.info.cls.includes("avatar-framing-upper"), identicalToOff: same(img, refImg) }); }
    }
    // 3: clipping per layer kind, each kind alone with overflow visible (magenta page, cyan dashed box outline)
    for (const [s, width] of [["quiz", 420], ["hub", 600], ["hub", 500]]) for (const [id, identity] of Object.entries(IDENTITIES)) for (const [cos, slots] of Object.entries(COSMETICS)) for (const k of [null, ...SCALES]) {
      const o = await open(s, { identity, slots, blink: "open", css: "pr", value: k ? "upper" : null, scale: k && k !== shipped ? k : null, isolate: true }, { dpr: 2, width });
      const box = await o.p.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, SURFACES[s].sel);
      const kinds = [...new Set(o.info.kids.map((c) => c.kind))].filter((x) => x !== "blink" && (cos !== "none" || x === "body" || x === "hair"));
      for (const kind of kinds) {
        await o.p.evaluate((kd) => window.__isolate(kd), kind);
        const pad = 40, clip = { x: box.x - pad, y: box.y - pad, width: box.w + 2 * pad, height: box.h + 2 * pad }, img = decodeScreenshot(await o.p.screenshot({ clip }));
        const d = 2, bx0 = pad * d, by0 = pad * d, bx1 = (pad + box.w) * d, by1 = (pad + box.h) * d; let outside = 0, inside = 0, top = 1e9, left = 1e9, right = 1e9;
        for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) { const i = (y * img.w + x) * 4, r = img.px[i], g = img.px[i + 1], bb = img.px[i + 2];
          if (Math.abs(r - 255) + g + Math.abs(bb - 255) < 60) continue; if (r < 40 && g > 215 && bb > 215) continue; // magenta page / cyan outline
          const inBox = x >= bx0 && x < bx1 && y >= by0 && y < by1; if (inBox) { inside++; top = Math.min(top, y - by0); left = Math.min(left, x - bx0); right = Math.min(right, bx1 - 1 - x); } else outside++; }
        const lostShare = outside / Math.max(1, inside + outside);
        result.clipping.push({ surface: `${s}@${width}`, identity: id, cosmetics: cos, scale: k ?? "off", kind, outsidePx: outside, insidePx: inside, lostPct: +(100 * lostShare).toFixed(2), topRoomCss: inside ? +(top / d).toFixed(2) : null, sideRoomCss: inside ? +(Math.min(left, right) / d).toFixed(2) : null });
        if (k && (kind === "hair" || kind === "headwear" || kind === "aura" || kind === "back") && s === "quiz") shots[`clip/${s}/${id}/${cos}/${kind}/${k}`] = img;
      }
      await o.p.close();
    }
  } finally { await browser.close(); server.close(); }
  writeFileSync(join(OUT, "result.json"), JSON.stringify(result, null, 1) + "\n");
  // sheets: per surface, rows = identities, cols = off | each scale (actual device pixels at DPR 2)
  const sheet = (name, rows, gap = 8) => { const w = Math.max(...rows.flat().map((t) => t.w)), h = Math.max(...rows.flat().map((t) => t.h)), cols = Math.max(...rows.map((r) => r.length)), Wd = cols * w + (cols - 1) * gap, Hd = rows.length * h + (rows.length - 1) * gap, o = new Uint8ClampedArray(Wd * Hd * 4).fill(255);
    rows.forEach((r, ry) => r.forEach((t, k) => { for (let y = 0; y < t.h; y++) o.set(t.px.subarray(y * t.w * 4, (y + 1) * t.w * 4), ((ry * (h + gap) + y) * Wd + k * (w + gap)) * 4); })); writeFileSync(join(OUT, name), encodePng(Wd, Hd, o)); };
  const enlarge = (t, k, frac = 1) => { const h = Math.round(t.h * frac), o = new Uint8ClampedArray(t.w * k * h * k * 4); for (let y = 0; y < h * k; y++) for (let x = 0; x < t.w * k; x++) o.set(t.px.subarray((((y / k) | 0) * t.w + ((x / k) | 0)) * 4, (((y / k) | 0) * t.w + ((x / k) | 0)) * 4 + 4), (y * t.w * k + x) * 4); return { w: t.w * k, h: h * k, px: o }; };
  for (const [s, width] of [["quiz", 420], ["hub", 600], ["hub", 500]]) {
    const ids = Object.keys(IDENTITIES), key = `${s}@${width}`;
    sheet(`sheet-${s}-${width}-actual.png`, ids.map((id) => [shots[`${key}/${id}/off`], ...SCALES.map((k) => shots[`${key}/${id}/${k}`])]));
    if (s === "quiz") sheet(`sheet-quiz-afro-top-x3.png`, [[shots[`${key}/r2-afro-brown/off`], ...SCALES.map((k) => shots[`${key}/r2-afro-brown/${k}`])].map((t) => enlarge(t, 3, 0.45))]);
    if (width !== 500) for (const cos of Object.keys(COSMETICS).filter((c) => c !== "none")) sheet(`sheet-${s}-${cos}-actual.png`, ids.map((id) => [shots[`${key}/${id}/${cos}/off`], ...SCALES.map((k) => shots[`${key}/${id}/${cos}/${k}`])]));
  }
  for (const cos of ["none", "crown", "pirate", "aura-wings", "cape"]) { const rows = []; for (const id of Object.keys(IDENTITIES)) { const r = []; for (const kind of ["hair", "headwear", "aura", "back"]) for (const k of SCALES) { const t = shots[`clip/quiz/${id}/${cos}/${kind}/${k}`]; if (t) r.push(t); } if (r.length) rows.push(r); } if (rows.length) sheet(`clip-quiz-${cos}.png`, rows); }
  return result;
}

const invokedDirectly = typeof process.argv[1] === "string" && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const r = await main();
  const reg = r.registration, bad = reg.filter((x) => !x.cls || x.overflow !== "hidden" || !x.sameLayerCount || x.worstRectErrorPx > 0.05);
  console.log(JSON.stringify({ shippedScale: r.shippedScale, registrationRuns: reg.length, registrationFailures: bad.length, worstRectErrorPx: Math.max(...reg.map((x) => x.worstRectErrorPx)), baselineRuns: r.baseline.length, baselineNotIdentical: r.baseline.filter((x) => !x.identicalToMain || x.cls).length, baselineIdenticalOnlyWithoutAnimatedAura: r.baseline.filter((x) => !x.identicalToMain && x.identicalWithoutAnimatedAura === true).length, baselineRectsDiffer: r.baseline.filter((x) => !x.rectsEqualToMain).length, optInRuns: r.optIn.length, optInLeaks: r.optIn.filter((x) => x.cls || !x.identicalToOff).length, errors: r.errors.length }, null, 1));
  // a baseline pixel difference fails unless it disappears with the animated aura hidden AND every layer rect equals main's
  if (bad.length || r.baseline.some((x) => x.cls || !x.rectsEqualToMain || (!x.identicalToMain && x.identicalWithoutAnimatedAura !== true)) || r.optIn.some((x) => x.cls || !x.identicalToOff) || r.errors.length) process.exitCode = 1;
}
