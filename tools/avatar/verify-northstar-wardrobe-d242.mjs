// D-242 BROWSER VERIFICATION of the Northstar wardrobe on the real renderer (js/avatar-render-c2.js mountC2Avatar, the blink and
// expression engines) in Chromium against a local static server of this checkout, with each surface's own <style> block and
// css/theme.css. Origin/main's modules are served under /__main/ for the baseline. Measures:
//   1. BASELINE — flag off (and opt-in without a valid outfit, or an outfit without the opt-in): every surface, identity and
//      cosmetic set renders pixel-identical to origin/main, with the same layers and path;
//   2. FIGURE — K01, K10, K16 opted in on quiz, hub and avatar: the path is "northstar", the composed figure equals the D-239/D-240
//      review picture (the pipeline composite): at most 3 levels and at most 5 pixels above 2 (the canvas stores pixels
//      premultiplied, which rounds nearly transparent edge pixels — measured: 1 pixel at 3); one figure layer, never its parts;
//   3. COMPATIBILITY — aura, wings (back), cape (back): shown on the figure; a hat: the WHOLE avatar keeps today's path with the hat;
//   4. FAILURE — one layer unavailable: today's path, no partial figure; the stored choice is never changed;
//   5. ENGINES — no blink and no expression overlay on the figure;
//   6. PRESENTATION — sheets at actual size (DPR 2) per surface, dark ("default") and light ("pearl") theme, normal and narrow.
// Needs Playwright's Chromium and the review pictures (private, <Documents>/DenSejeApp-artefacts); never part of the unit tests.
// Usage: node tools/avatar/verify-northstar-wardrobe-d242.mjs --out <dir outside the repository>
import http from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { encodePng } from "./r3-hair-tool-v2.mjs";
import { decodeScreenshot } from "./r3-review-quiz.mjs";
import { grid } from "./northstar-wardrobe-poc.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = resolve(arg("--out", join(homedir(), "Documents", "DenSejeApp-artefacts", "d-242-northstar-wardrobe", "verify")));
if (OUT.toLowerCase().startsWith(ROOT.toLowerCase())) throw new Error("the review sheets show C: write them outside the repository (D-127 §2)");
mkdirSync(OUT, { recursive: true });
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".json": "application/json" };
const A = join(homedir(), "Documents", "DenSejeApp-artefacts");
const REVIEW = { K01: "d-239-targeted-correction/final1-d235", K10: "d-239-targeted-correction/final1-d235", K16: "d-240-shoe-cover/run-1" };

const IDENTITIES = { "r2-default-brown": { body_type: "neutral", skin_tone: "medium", hairstyle: "default", hair_color: "brown" }, "c2-dark-blonde": { body_type: "neutral", skin_tone: "dark", hairstyle: "short", hair_color: "blonde" } };
const COSMETICS = { none: {}, aura: { aura: "/assets/avatar/aura/aura-gold.svg" }, wings: { back: "/assets/avatar/body/wings-dragon.svg" }, cape: { back: "/assets/avatar/shirt/cape-red.svg" }, crown: { headwear: "/assets/avatar/hat/crown-golden.svg" } };
const SURFACES = {
  quiz: { file: "index.html", box: '<div class="game-identity"><div id="avatar-display"></div></div>', sel: "#avatar-display", layerClass: "quiz-avatar-layer" },
  hub: { file: "hub.html", box: '<div class="avatar-showcase" id="avatarShowcase"><div class="profile-avatar" id="profileAvatar"></div></div>', sel: "#profileAvatar", layerClass: "profile-avatar-layer" },
  avatar: { file: "avatar.html", box: '<div class="avatar-wrap" id="avatarWrap"><div class="avatar-aura"></div><div id="avatar-preview"></div></div>', sel: "#avatar-preview", layerClass: "avatar-layer" },
};
const mainFile = (f) => execFileSync("git", ["show", `origin/main:${f}`], { cwd: ROOT, maxBuffer: 1 << 26 });
const style = (html) => html.match(/<style>([\s\S]*?)<\/style>/)[1];

/** One page: code 'pr' | 'main'; storage = localStorage entries; theme; probe = blink/expression probe. */
function page(s, { code, storage, identity, slots, theme = "default" }) {
  const S = SURFACES[s], html = code === "main" ? mainFile(S.file).toString("utf8") : readFileSync(join(ROOT, S.file), "utf8"), base = code === "main" ? "/__main" : "";
  return `<!doctype html><html lang="da" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${base}/style.css"><link rel="stylesheet" href="${base}/css/theme.css"><style>${style(html)}</style><style>body{display:block;padding:24px;margin:0}</style></head><body>${S.box}
<script type="module">
window.__AVATAR_TEST__ = true; localStorage.clear(); for (const [k, v] of Object.entries(${JSON.stringify(storage || {})})) localStorage.setItem(k, v);
const before = JSON.stringify({ ...localStorage });
const L = await import("${base}/js/avatar-layers.js"), R = await import("${base}/js/avatar-render-c2.js"), B = await import("${base}/js/avatar-blink-engine.js"), E = await import("${base}/js/avatar-expression-engine.js");
const el = document.querySelector(${JSON.stringify(S.sel)}), identity = ${JSON.stringify(identity)}, slots = ${JSON.stringify(slots)};
const cosmetics = R.c2CosmeticLayers(Object.fromEntries(Object.keys(slots).map((k) => [k, k])), (id) => slots[id]);
const path = await R.mountC2Avatar(el, identity, { layerClass: ${JSON.stringify(S.layerClass)}, cosmetics, surface: ${JSON.stringify(s)} });
// the engines exactly as the surfaces start them (keyed off the mounted path)
const r2Active = el.dataset.avatarRenderPath === "r2";
let ee = null; try { ee = r2Active ? new E.ExpressionEngine(el, { r2: true }) : new E.ExpressionEngine(el); } catch (_e) {}
const be = new B.BlinkEngine(el, identity.skin_tone, L.blinkConfigFor(identity, r2Active));
await R.markAvatarRendered(el);
const overlay = el.querySelector(".avatar-expr-overlay");
const kids = [...el.children].map((c) => ({ marker: c.getAttribute("data-c2-layer") || c.id, src: (c.getAttribute("src") || "").replace(/^blob:.*/, "blob:"), z: c.style.zIndex }));
window.__done = { path, kids, overlayVisible: !!overlay && getComputedStyle(overlay).display !== "none", storageUnchanged: JSON.stringify({ ...localStorage }) === before };
window.__engines = { be };
document.body.dataset.done = "1";
</script></body></html>`;
}

const pages = {}, server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0]); if (pages[u]) { res.writeHead(200, { "content-type": "text/html" }); return res.end(pages[u]); }
  if (u.startsWith("/__review/")) { const k = u.slice(10, 13), f = join(A, ...REVIEW[k].split("/"), "package", "outfit-" + reviewName(k) + ".full.png"); res.writeHead(200, { "content-type": "image/png" }); return res.end(readFileSync(f)); }
  if (u.startsWith("/__main/")) { try { const b = mainFile(u.slice(8)); res.writeHead(200, { "content-type": TYPES[extname(u)] || "application/octet-stream" }); return res.end(b); } catch { res.writeHead(404); return res.end(); } }
  const p = join(ROOT, u); if (!p.startsWith(ROOT) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" }); res.end(readFileSync(p));
});
let OUTFITS = null; const reviewName = (k) => { const o = OUTFITS[k]; return [o.top, o.bottom, o.shoes].join("+"); };

async function main() {
  const { chromium } = await import("@playwright/test");
  OUTFITS = (await import(new URL("../../js/avatar-layers.js", import.meta.url).href)).NORTHSTAR_OUTFITS;
  await new Promise((r) => server.listen(0, "127.0.0.1", r)); const PORT = server.address().port;
  const browser = await chromium.launch(), result = { baseline: [], figure: [], compatibility: [], failure: [], engines: [], errors: [] };
  let n = 0;
  const open = async (s, opts, { dpr = 2, width = 600, motion = "reduce", block = null } = {}) => {
    const url = `/__v/${n++}.html`; pages[url] = page(s, opts);
    const p = await browser.newPage({ deviceScaleFactor: dpr, viewport: { width, height: 900 } }); await p.emulateMedia({ reducedMotion: motion });
    if (block) await p.route("**/" + block, (r) => r.fulfill({ status: 404, body: "" }));
    p.on("pageerror", (e) => result.errors.push(`${s}: ${e}`)); p.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) result.errors.push(`${s}: ${m.text()}`); });
    await p.goto(`http://127.0.0.1:${PORT}${url}`); await p.waitForSelector("body[data-done='1']", { timeout: 60000 }); delete pages[url];
    return { p, info: await p.evaluate(() => window.__done) };
  };
  const shoot = async (p, s) => decodeScreenshot(await (await p.$(SURFACES[s].sel)).screenshot({ animations: "disabled" }));
  const hideAura = (p, s) => p.evaluate((sel) => { for (const c of document.querySelector(sel).children) if (/\/aura\//.test(c.getAttribute("src") || "")) c.style.visibility = "hidden"; }, SURFACES[s].sel);
  const same = (a, b) => a.w === b.w && a.h === b.h && a.px.every((v, i) => v === b.px[i]);
  const OPT = { avatar_northstar: "1" };
  try {
    // 1. baseline against origin/main
    const states = { "no opt-in": {}, "outfit stored, no opt-in": { avatar_northstar_outfit: "K16" }, "opt-in, no outfit": OPT, "opt-in, invalid outfit": { ...OPT, avatar_northstar_outfit: "K99" }, "opt-in, known-faulty name": { ...OPT, avatar_northstar_outfit: "top-tee-hip-blue+bottom-skirt-sand+shoes-sneakers-white" } };
    for (const s of Object.keys(SURFACES)) for (const [id, identity] of Object.entries(IDENTITIES)) for (const [cos, slots] of Object.entries(COSMETICS)) for (const [st, storage] of Object.entries(states)) {
      if (cos !== "none" && st !== "no opt-in") continue;
      const a = await open(s, { code: "pr", storage, identity, slots }), b = await open(s, { code: "main", storage, identity, slots });
      if (slots.aura) { await hideAura(a.p, s); await hideAura(b.p, s); }
      const ia = await shoot(a.p, s), ib = await shoot(b.p, s);
      result.baseline.push({ surface: s, identity: id, cosmetics: cos, state: st, path: a.info.path, mainPath: b.info.path, identicalToMain: same(ia, ib), layersEqualToMain: JSON.stringify(a.info.kids) === JSON.stringify(b.info.kids), storageUnchanged: a.info.storageUnchanged });
      await a.p.close(); await b.p.close(); }
    // 2 + 6. the figure: path, equality with the review picture, sheets
    const sheets = {};
    for (const k of ["K01", "K10", "K16"]) for (const s of Object.keys(SURFACES)) for (const theme of ["default", "pearl"]) for (const width of [600, 360]) {
      const o = await open(s, { code: "pr", storage: { ...OPT, avatar_northstar_outfit: k }, identity: IDENTITIES["r2-default-brown"], slots: {}, theme }, { width });
      const img = await shoot(o.p, s); (sheets[`${s}-${theme}-${width}`] ||= []).push(img);
      if (theme === "default" && width === 600) {
        // the composed figure against the review picture (pipeline composite flattened on the review page colour, x 250…774)
        const cmp = await o.p.evaluate(async ({ sel, k }) => {
          const fig = document.querySelector(sel + ' img[data-c2-layer="base"]'), ref = new Image(); ref.src = "/__review/" + k + ".png"; await ref.decode();
          const c = document.createElement("canvas"); c.width = 524; c.height = 1536; const x = c.getContext("2d");
          x.fillStyle = "rgb(236,233,226)"; x.fillRect(0, 0, 524, 1536); x.drawImage(fig, -250, 0); const a = x.getImageData(0, 0, 524, 1536).data;
          x.clearRect(0, 0, 524, 1536); x.drawImage(ref, 0, 0); const b = x.getImageData(0, 0, 524, 1536).data;
          let max = 0, over2 = 0; for (let i = 0; i < a.length; i += 4) { const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); max = Math.max(max, d); if (d > 2) over2++; }
          return { natural: [fig.naturalWidth, fig.naturalHeight], blob: fig.src.startsWith("blob:"), maxDiff: max, pxOver2: over2 }; }, { sel: SURFACES[s].sel, k });
        result.figure.push({ outfit: k, surface: s, path: o.info.path, layers: o.info.kids.map((c) => c.marker), overlayVisible: o.info.overlayVisible, storageUnchanged: o.info.storageUnchanged, ...cmp }); }
      await o.p.close(); }
    for (const [name, imgs] of Object.entries(sheets)) { const g = grid(imgs, imgs.length, 16); writeFileSync(join(OUT, "sheet-" + name + ".png"), encodePng(g.w, g.h, g.px)); }
    // 3. compatibility with K16
    const compat = [];
    for (const cos of ["aura", "wings", "cape", "crown"]) for (const s of ["avatar", "hub"]) {
      const o = await open(s, { code: "pr", storage: { ...OPT, avatar_northstar_outfit: "K16" }, identity: IDENTITIES["r2-default-brown"], slots: COSMETICS[cos] });
      if (s === "avatar") { const today = await open(s, { code: "pr", storage: {}, identity: IDENTITIES["r2-default-brown"], slots: COSMETICS[cos] }); compat.push(await shoot(today.p, s), await shoot(o.p, s)); await today.p.close(); }
      result.compatibility.push({ cosmetics: cos, surface: s, path: o.info.path, layers: o.info.kids.map((c) => c.marker + ":" + c.src.split("/").pop()), storageUnchanged: o.info.storageUnchanged }); await o.p.close(); }
    { const g = grid(compat, compat.length, 16); writeFileSync(join(OUT, "compatibility-avatar-today-vs-northstar-aura-wings-cape-crown.png"), encodePng(g.w, g.h, g.px)); }
    // 4. a layer that does not load → today's path; the stored choice is untouched
    for (const file of ["figure-head-v1.webp", "top-tee-hip-blue-sleeves-v1.webp", "hide-shoes-ankleboots-brown-v1.webp"]) {
      const o = await open("hub", { code: "pr", storage: { ...OPT, avatar_northstar_outfit: "K16" }, identity: IDENTITIES["r2-default-brown"], slots: {} }, { block: file });
      result.failure.push({ blocked: file, path: o.info.path, figureMounted: o.info.kids.some((c) => c.src === "blob:"), storageUnchanged: o.info.storageUnchanged }); await o.p.close(); }
    // 5. engines on the figure, with motion allowed: a blink leaves the lids retracted; no expression overlay is shown
    { const o = await open("quiz", { code: "pr", storage: { ...OPT, avatar_northstar_outfit: "K10" }, identity: IDENTITIES["r2-default-brown"], slots: {} }, { motion: "no-preference" });
      const lids = await o.p.evaluate(async () => { const be = window.__engines.be; if (be._timer) { clearTimeout(be._timer); be._timer = null; } await be._doBlink(); return [be._lidL, be._lidR].map((l) => (l ? l.style.transform : null)); });
      result.engines.push({ path: o.info.path, lidsAfterBlink: lids, expressionOverlayVisible: o.info.overlayVisible }); await o.p.close(); }
  } finally { await browser.close(); server.close(); }
  const ok = { baseline: result.baseline.every((b) => b.identicalToMain && b.layersEqualToMain && b.path === b.mainPath && b.storageUnchanged),
    figure: result.figure.every((f) => f.path === "northstar" && f.blob && f.natural[0] === 1024 && f.natural[1] === 1536 && f.maxDiff <= 3 && f.pxOver2 <= 5 && !f.overlayVisible && f.storageUnchanged && f.layers.filter((m) => m === "base").length === 1),
    compatibility: result.compatibility.every((c) => (c.cosmetics === "crown" ? c.path === "r2" && c.layers.some((l) => /crown-golden/.test(l)) : c.path === "northstar" && c.layers.length === 2)),
    failure: result.failure.every((f) => f.path === "r2" && !f.figureMounted && f.storageUnchanged),
    engines: result.engines.every((e) => e.path === "northstar" && e.lidsAfterBlink.every((t) => t === null || /scaleY\(0\)/.test(t)) && !e.expressionOverlayVisible),
    noPageErrors: result.errors.length === 0 };
  writeFileSync(join(OUT, "result.json"), JSON.stringify({ ok, ...result }, null, 2) + "\n");
  console.log(JSON.stringify({ ok, baselinePages: result.baseline.length, figure: result.figure.map((f) => f.outfit + "/" + f.surface + ":" + f.maxDiff), errors: result.errors.slice(0, 5) }));
  if (!Object.values(ok).every(Boolean)) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
