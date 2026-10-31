// D-275 BROWSER VERIFICATION of the 16 approved print tees in the Northstar opt-in, on the real renderer (js/avatar-render-c2.js
// mountC2Avatar), the real panel (js/avatar-northstar-panel.js) and the engines, in Chromium against a local static server of this
// checkout; origin/main's modules are served under /__main/ for the baseline (the D-242 pattern). Measures:
//   1. BASELINE — without the opt-in (also with a stored tee or outfit), and with the opt-in on a K outfit a tee may not change
//      (K16), every surface renders pixel-identical to origin/main with the same layers and path;
//   2. FIGURE — print tees on K01–K09 on quiz, hub and avatar: the path is "northstar", one composed figure layer, and the picture
//      equals northstarCompose of the same plan computed here in Node from the decoded published files (at most 3 levels, at most 5
//      pixels above 2: the canvas stores pixels premultiplied); no expression overlay;
//   3. CHOICE — on avatar.html's panel: K04 → a tee button stores the tee and reloads into the print tee; "Outfittets egen T-shirt"
//      returns to K04's cream tee; "Nuværende avatar" returns to today's avatar; the tee buttons are disabled on K12 (blue tee);
//   4. FAILURE — a print layer that does not load gives today's path whole, the stored choice untouched;
//   5. PRESENTATION — sheets at actual size (DPR 2) for quiz, hub and avatar, widths 600 and 360 (private: they show C).
// Needs Playwright's Chromium and the vendored dwebp; never part of the unit tests.
// Usage: node tools/avatar/verify-northstar-print-tees-d275.mjs --dwebp <dwebp.exe> --out <dir outside the repository>
import http from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, extname, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import { decodeScreenshot } from "./r3-review-quiz.mjs";
import { grid } from "./northstar-wardrobe-poc.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = resolve(arg("--out", "")), DWEBP = arg("--dwebp", "");
if (!arg("--out") || OUT.toLowerCase().startsWith(ROOT.toLowerCase())) throw new Error("--out must be outside the repository (the sheets show C, D-127 §2)");
if (!DWEBP || !existsSync(DWEBP)) throw new Error("--dwebp <the vendored dwebp>");
mkdirSync(OUT, { recursive: true });
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".json": "application/json" };
const IDENTITY = { body_type: "neutral", skin_tone: "medium", hairstyle: "default", hair_color: "brown" };
const SURFACES = {
  quiz: { file: "index.html", box: '<div class="game-identity"><div id="avatar-display"></div></div>', sel: "#avatar-display", layerClass: "quiz-avatar-layer" },
  hub: { file: "hub.html", box: '<div class="avatar-showcase" id="avatarShowcase"><div class="profile-avatar" id="profileAvatar"></div></div>', sel: "#profileAvatar", layerClass: "profile-avatar-layer" },
  avatar: { file: "avatar.html", box: '<div class="avatar-wrap" id="avatarWrap"><div class="avatar-aura"></div><div id="avatar-preview"></div></div><div class="northstar-panel" id="northstarPanel" hidden></div>', sel: "#avatar-preview", layerClass: "avatar-layer" },
};
const mainFile = (f) => execFileSync("git", ["show", `origin/main:${f}`], { cwd: ROOT, maxBuffer: 1 << 26 });
const style = (html) => html.match(/<style>([\s\S]*?)<\/style>/)[1];

/** One page: code 'pr' | 'main'; storage set once (seed) unless keep; the avatar page also mounts the panel. */
function page(s, { code, storage, keep = false, theme = "default" }) {
  const S = SURFACES[s], html = code === "main" ? mainFile(S.file).toString("utf8") : readFileSync(join(ROOT, S.file), "utf8"), base = code === "main" ? "/__main" : "";
  return `<!doctype html><html lang="da" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${base}/style.css"><link rel="stylesheet" href="${base}/css/theme.css"><style>${style(html)}</style><style>body{display:block;padding:24px;margin:0}</style></head><body>${S.box}
<script type="module">
window.__AVATAR_TEST__ = true; ${keep ? `if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); localStorage.clear(); for (const [k, v] of Object.entries(${JSON.stringify(storage || {})})) localStorage.setItem(k, v); }` : `localStorage.clear(); for (const [k, v] of Object.entries(${JSON.stringify(storage || {})})) localStorage.setItem(k, v);`}
const before = JSON.stringify({ ...localStorage });
const L = await import("${base}/js/avatar-layers.js"), R = await import("${base}/js/avatar-render-c2.js"), E = await import("${base}/js/avatar-expression-engine.js");
const el = document.querySelector(${JSON.stringify(S.sel)}), identity = ${JSON.stringify(IDENTITY)};
const path = await R.mountC2Avatar(el, identity, { layerClass: ${JSON.stringify(S.layerClass)}, cosmetics: [], surface: ${JSON.stringify(s)} });
let ee = null; try { ee = new E.ExpressionEngine(el); } catch (_e) {}
await R.markAvatarRendered(el);
${s === "avatar" && code === "pr" ? `const P = await import("/js/avatar-northstar-panel.js"); P.mountNorthstarPanel(document.getElementById("northstarPanel"), el);` : ""}
const overlay = el.querySelector(".avatar-expr-overlay"), ns = L.northstarRenderFor ? L.northstarRenderFor(${JSON.stringify(s)}, []) : null;
const kids = [...el.children].map((c) => ({ marker: c.getAttribute("data-c2-layer") || c.id, src: (c.getAttribute("src") || "").replace(/^blob:.*/, "blob:"), z: c.style.zIndex }));
window.__done = { path, kids, key: ns ? ns.key : null, overlayVisible: !!overlay && getComputedStyle(overlay).display !== "none", storageUnchanged: JSON.stringify({ ...localStorage }) === before, storage: { ...localStorage } };
document.body.dataset.done = "1";
</script></body></html>`;
}

const pages = {}, refs = {}, server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0]); if (pages[u]) { res.writeHead(200, { "content-type": "text/html" }); return res.end(pages[u]); }
  if (u.startsWith("/__ref/")) { const k = u.slice(7, -4); res.writeHead(200, { "content-type": "image/png" }); return res.end(refs[k]); }
  if (u.startsWith("/__main/")) { try { const b = mainFile(u.slice(8)); res.writeHead(200, { "content-type": TYPES[extname(u)] || "application/octet-stream" }); return res.end(b); } catch { res.writeHead(404); return res.end(); } }
  const p = join(ROOT, u); if (!p.startsWith(ROOT) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" }); res.end(readFileSync(p));
});

async function main() {
  const { chromium } = await import("@playwright/test");
  const L = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href);
  // the Node references: northstarCompose of each plan on the decoded published files
  const tmp = join(tmpdir(), "d275b-" + process.pid); mkdirSync(tmp, { recursive: true }); const dec = {};
  const pixelsOf = (src) => { const f = src.split("/").pop(); if (!dec[f]) { const o = join(tmp, "x.png"); execFileSync(DWEBP, ["-quiet", join(ROOT, "assets", "avatar-northstar", f), "-o", o]); dec[f] = Uint8ClampedArray.from(decodePng(readFileSync(o)).px); } return dec[f]; };
  const FIG = [["K04", "TP-TEA-NAV"], ["K01", "TP-SHD-CRM"], ["K07", "TP-FOX-FOR"], ["K02", "TP-TEA-MUS"], ["K05", "TP-SHD-COR"], ["K09", "TP-FOX-HTH"]];
  for (const [k, t] of FIG) refs[k + "+" + t] = encodePng(1024, 1536, L.northstarCompose(L.northstarPlanFor(L.northstarOutfitFor(k, t)), pixelsOf, 1024 * 1536));
  rmSync(tmp, { recursive: true, force: true });
  await new Promise((r) => server.listen(0, "127.0.0.1", r)); const PORT = server.address().port;
  const browser = await chromium.launch(), result = { baseline: [], figure: [], choice: [], failure: [], errors: [] };
  let n = 0;
  const open = async (s, opts, { dpr = 2, width = 600, block = null, ctx = null } = {}) => {
    const url = `/__v/${n++}.html`; pages[url] = page(s, opts);
    const c = ctx || (await browser.newContext({ deviceScaleFactor: dpr, viewport: { width, height: 900 }, reducedMotion: "reduce" })), p = await c.newPage();
    if (block) await p.route("**/" + block, (r) => r.fulfill({ status: 404, body: "" }));
    p.on("pageerror", (e) => result.errors.push(`${s}: ${e}`)); p.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) result.errors.push(`${s}: ${m.text()}`); });
    await p.goto(`http://127.0.0.1:${PORT}${url}`); await p.waitForSelector("body[data-done='1']", { timeout: 60000 });
    return { p, c, url, info: await p.evaluate(() => window.__done) };
  };
  const shoot = async (p, s) => decodeScreenshot(await (await p.$(SURFACES[s].sel)).screenshot({ animations: "disabled" }));
  const same = (a, b) => a.w === b.w && a.h === b.h && a.px.every((v, i) => v === b.px[i]);
  const OPT = { avatar_northstar: "1" };
  try {
    // 1. baseline against origin/main
    const states = { "no opt-in": {}, "tee stored, no opt-in": { avatar_northstar_tee: "TP-TEA-CRM" }, "outfit + tee stored, no opt-in": { avatar_northstar_outfit: "K04", avatar_northstar_tee: "TP-TEA-CRM" },
      "opt-in, no outfit, tee stored": { ...OPT, avatar_northstar_tee: "TP-TEA-CRM" }, "opt-in K16 (blue tee) + tee stored": { ...OPT, avatar_northstar_outfit: "K16", avatar_northstar_tee: "TP-TEA-CRM" },
      "opt-in K04 + not-approved TP-FOX-COR": { ...OPT, avatar_northstar_outfit: "K04", avatar_northstar_tee: "TP-FOX-COR" } };
    for (const s of Object.keys(SURFACES)) for (const [st, storage] of Object.entries(states)) {
      const a = await open(s, { code: "pr", storage }), b = await open(s, { code: "main", storage });
      const ia = await shoot(a.p, s), ib = await shoot(b.p, s);
      result.baseline.push({ surface: s, state: st, path: a.info.path, mainPath: b.info.path, identicalToMain: same(ia, ib), layersEqualToMain: JSON.stringify(a.info.kids) === JSON.stringify(b.info.kids), storageUnchanged: a.info.storageUnchanged });
      await a.c.close(); await b.c.close(); }
    // 2 + 5. the figure and the sheets
    const sheets = {};
    for (const [k, t] of FIG) for (const s of Object.keys(SURFACES)) for (const width of [600, 360]) {
      const o = await open(s, { code: "pr", storage: { ...OPT, avatar_northstar_outfit: k, avatar_northstar_tee: t } }, { width });
      (sheets[`${s}-${width}`] ||= []).push(await shoot(o.p, s));
      if (width === 600) {
        const cmp = await o.p.evaluate(async ({ sel, key }) => {
          const fig = document.querySelector(sel + ' img[data-c2-layer="base"]'), ref = new Image(); ref.src = "/__ref/" + key + ".png"; await ref.decode();
          const c = document.createElement("canvas"); c.width = 1024; c.height = 1536; const x = c.getContext("2d");
          x.fillStyle = "rgb(236,233,226)"; x.fillRect(0, 0, 1024, 1536); x.drawImage(fig, 0, 0); const a = x.getImageData(0, 0, 1024, 1536).data;
          x.fillRect(0, 0, 1024, 1536); x.drawImage(ref, 0, 0); const b = x.getImageData(0, 0, 1024, 1536).data;
          let max = 0, over2 = 0; for (let i = 0; i < a.length; i += 4) { const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); max = Math.max(max, d); if (d > 2) over2++; }
          return { natural: [fig.naturalWidth, fig.naturalHeight], blob: fig.src.startsWith("blob:"), maxDiff: max, pxOver2: over2 }; }, { sel: SURFACES[s].sel, key: k + "+" + t });
        result.figure.push({ outfit: k, tee: t, surface: s, path: o.info.path, key: o.info.key, layers: o.info.kids.map((c) => c.marker), overlayVisible: o.info.overlayVisible, storageUnchanged: o.info.storageUnchanged, ...cmp }); }
      await o.c.close(); }
    for (const [name, imgs] of Object.entries(sheets)) { const g = grid(imgs, imgs.length, 16); writeFileSync(join(OUT, "sheet-" + name + ".png"), encodePng(g.w, g.h, g.px)); }
    // 3. the choice on the panel: store, reload, return
    { const o = await open("avatar", { code: "pr", storage: { ...OPT, avatar_northstar_outfit: "K04" }, keep: true });
      const step = async (label) => { await Promise.all([o.p.waitForEvent("load"), o.p.getByRole("button", { name: label, exact: true }).click()]); await o.p.waitForSelector("body[data-done='1']", { timeout: 60000 });
        const info = await o.p.evaluate(() => window.__done), pressed = await o.p.$$eval(".northstar-tee-list button[aria-pressed='true']", (b) => b.map((x) => x.textContent));
        result.choice.push({ clicked: label, path: info.path, key: info.key, tee: info.storage.avatar_northstar_tee || null, outfit: info.storage.avatar_northstar_outfit || null, teePressed: pressed }); };
      result.choice.push({ clicked: "(start K04)", path: o.info.path, key: o.info.key, teeButtonsEnabled: await o.p.$$eval(".northstar-tee-list button", (b) => b.filter((x) => !x.disabled).length) });
      await step("Tekande · navy"); await step("Ræv · skovgrøn"); await step("Outfittets egen T-shirt"); await step("Tekande · navy"); await step("K12");
      result.choice.push({ clicked: "(on K12)", teeButtonsEnabled: await o.p.$$eval(".northstar-tee-list button", (b) => b.filter((x) => !x.disabled).length) });
      await step("Nuværende avatar"); await o.c.close(); }
    // 4. a print layer that does not load → today's path; the stored choice untouched
    for (const file of ["top-tee-hip-print-teapot-navy-top-body-v1.webp", "top-tee-hip-print-teapot-navy-sleeves-v1.webp"]) {
      const o = await open("hub", { code: "pr", storage: { ...OPT, avatar_northstar_outfit: "K04", avatar_northstar_tee: "TP-TEA-NAV" } }, { block: file });
      result.failure.push({ blocked: file, path: o.info.path, figureMounted: o.info.kids.some((c) => c.src === "blob:"), storageUnchanged: o.info.storageUnchanged }); await o.c.close(); }
  } finally { await browser.close(); server.close(); }
  const ch = result.choice;
  const ok = { baseline: result.baseline.every((b) => b.identicalToMain && b.layersEqualToMain && b.path === b.mainPath && b.storageUnchanged),
    figure: result.figure.every((f) => f.path === "northstar" && f.key === f.outfit + "+" + f.tee && f.blob && f.natural[0] === 1024 && f.natural[1] === 1536 && f.maxDiff <= 3 && f.pxOver2 <= 5 && !f.overlayVisible && f.storageUnchanged && f.layers.filter((m) => m === "base").length === 1),
    choice: ch[0].path === "northstar" && ch[0].key === "K04" && ch[0].teeButtonsEnabled === 17
      && ch[1].key === "K04+TP-TEA-NAV" && ch[1].path === "northstar" && ch[1].teePressed.join() === "Tekande · navy"
      && ch[2].key === "K04+TP-FOX-FOR" && ch[3].key === "K04" && ch[3].tee === null && ch[3].teePressed.join() === "Outfittets egen T-shirt"
      && ch[4].key === "K04+TP-TEA-NAV" && ch[5].key === "K12" && ch[5].tee === "TP-TEA-NAV" && ch[6].teeButtonsEnabled === 0
      && ch[7].path === "r2" && ch[7].outfit === null && ch[7].key === null,
    failure: result.failure.every((f) => f.path === "r2" && !f.figureMounted && f.storageUnchanged),
    noPageErrors: result.errors.length === 0 };
  writeFileSync(join(OUT, "result.json"), JSON.stringify({ ok, ...result }, null, 2) + "\n");
  console.log(JSON.stringify({ ok, baselinePages: result.baseline.length, figure: result.figure.map((f) => f.outfit + "+" + f.tee + "/" + f.surface + ":" + f.maxDiff + "/" + f.pxOver2), choice: ch.map((c) => c.clicked + "→" + (c.key || c.path)), errors: result.errors.slice(0, 5) }));
  if (!Object.values(ok).every(Boolean)) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
